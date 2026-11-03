import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SoftwareCatalogInputSchema,
  SoftwareCatalogSchema,
  SoftwareCompleteSchema,
  SoftwareDecisionSchema,
  SoftwareInventorySchema,
  type SoftwareJob,
  SoftwareJobSchema,
  SoftwareObservationSchema,
  type SoftwarePackage,
  SoftwarePackageIdSchema,
  SoftwareRequestIdSchema,
  SoftwareRequestSchema,
  SoftwareStateSchema,
  softwareJobBinding,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import { assertPlainPath } from "./model-secrets.js";
import { ServixDeploymentError } from "./servix-deployment.js";

interface Device {
  deviceId: string;
  userId: string;
  workspaceId: string;
  name: string;
  online: boolean;
  status: string;
  workspaceAuthorized: boolean;
}
export interface SoftwareDevices {
  discoveryDevices(actor: string): Promise<Device[]>;
  checkCredential(
    credential: string,
  ): Promise<{ deviceId: string; userId: string; workspaceId: string }>;
}
const Observed = z
  .object({ receivedAt: z.iso.datetime(), value: SoftwareObservationSchema })
  .strict();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const softwareArtifact = (p: SoftwarePackage) =>
  p.recipe === "demo-api" ? p.programSha256 : p.asset.sha256;

export class SoftwareManagement {
  readonly workspaceId: z.infer<typeof WorkspaceIdSchema>;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    workspaceId: string,
    private devices: SoftwareDevices,
    private administrator: (actor: string) => Promise<boolean>,
    private readonly now = () => new Date(),
    private readonly demoProgramSha256: string | null = null,
  ) {
    this.workspaceId = WorkspaceIdSchema.parse(workspaceId);
  }
  private fail(code: string, status = 403): never {
    throw new ServixDeploymentError("software-" + code, status);
  }
  private scope(workspaceId: string) {
    if (workspaceId !== this.workspaceId) this.fail("workspace-denied");
  }
  private serial<T>(fn: () => Promise<T>) {
    const result = this.chain.then(fn);
    this.chain = result.catch(() => undefined);
    return result;
  }
  private async directory() {
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  private async read(name: string, maxBytes = 32768) {
    await this.directory();
    const file = join(this.root, name);
    await assertPlainPath(file);
    try {
      const s = await lstat(file);
      if (!s.isFile() || s.size > maxBytes) this.fail("storage-unavailable", 503);
      return JSON.parse(await readFile(file, "utf8")) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  private async write(name: string, value: unknown) {
    const bytes = JSON.stringify(value);
    if (
      Buffer.byteLength(bytes) >
      (name === "catalog.json" ? 262144 : name.startsWith("inventory-") ? 3000000 : 32768)
    )
      this.fail("storage-capacity", 503);
    await this.directory();
    const file = join(this.root, name);
    await assertPlainPath(file);
    const temp = file + "." + randomBytes(16).toString("hex") + ".tmp";
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replaceDurableRecord(temp, file);
  }
  private async audit(
    operation: string,
    actor: string,
    fields: { target?: string; correlationId?: string; digest?: string } = {},
  ) {
    await this.directory();
    const folder = join(this.root, "audit");
    await assertPlainPath(folder);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    if ((await readdir(folder)).length >= 10000) this.fail("audit-capacity", 503);
    const file = await open(join(folder, randomBytes(16).toString("hex") + ".json"), "wx", 0o600);
    try {
      await file.writeFile(
        JSON.stringify({
          version: 1,
          workspaceId: this.workspaceId,
          operation,
          actor,
          ...fields,
          at: this.now().toISOString(),
        }),
      );
      await file.sync();
    } finally {
      await file.close();
    }
  }
  private async device(actor: string, id: string) {
    const d = (await this.devices.discoveryDevices(actor)).find((d) => d.deviceId === id);
    if (!d || d.workspaceId !== this.workspaceId || !d.workspaceAuthorized || d.status !== "active")
      this.fail("device-denied");
    return d;
  }
  private async credential(value: string) {
    const d = await this.devices.checkCredential(value);
    if (d.workspaceId !== this.workspaceId) this.fail("workspace-denied");
    await this.device(d.userId, d.deviceId);
    return d;
  }
  private async jobs() {
    await this.directory();
    const names = (await readdir(this.root)).filter((n) => /^sw_[a-f0-9]{32}\.json$/.test(n));
    if (names.length >= 2000) this.fail("job-capacity", 503);
    return (
      await Promise.all(names.map(async (n) => SoftwareJobSchema.parse(await this.read(n))))
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async job(id: string) {
    const value = await this.read(SoftwareRequestIdSchema.parse(id) + ".json");
    if (!value) this.fail("request-not-found", 404);
    return SoftwareJobSchema.parse(value);
  }
  async catalog() {
    const value = await this.read("catalog.json", 262144);
    const c = SoftwareCatalogSchema.parse(
      value ?? { version: 1, workspaceId: this.workspaceId, revision: 0, packages: [] },
    );
    this.scope(c.workspaceId);
    return c;
  }
  async saveCatalog(actor: string, workspaceId: string, input: unknown) {
    this.scope(workspaceId);
    return this.serial(async () => {
      if (!(await this.administrator(actor))) this.fail("administrator-required");
      const next = SoftwareCatalogInputSchema.parse(input),
        current = await this.catalog();
      if (next.expectedRevision !== current.revision) this.fail("catalog-changed", 409);
      if (
        next.packages.some(
          (p) => p.recipe === "demo-api" && p.programSha256 !== this.demoProgramSha256,
        )
      )
        this.fail("bundled-program-differs");
      const value = SoftwareCatalogSchema.parse({
        version: 1,
        workspaceId,
        revision: current.revision + 1,
        packages: next.packages,
      });
      await this.audit("catalog-save", actor, { digest: digest(JSON.stringify(value)) });
      await this.write("catalog.json", value);
      return value;
    });
  }
  private async observation(id: string, fresh = true) {
    const value = await this.read("device-" + id + ".json");
    if (!value) return null;
    const record = Observed.parse(value);
    if (
      fresh &&
      (this.now().getTime() - Date.parse(record.receivedAt) > 20000 ||
        Date.parse(record.receivedAt) > this.now().getTime())
    )
      return null;
    return record.value;
  }
  async state(actor: string, workspaceId: string, id: string, inventorySince?: string) {
    this.scope(workspaceId);
    const d = await this.device(actor, id),
      administrator = await this.administrator(actor);
    const capability = d.online ? await this.observation(id) : null,
      catalog = await this.catalog();
    z.iso.datetime().optional().parse(inventorySince);
    const rawInventory = await this.read("inventory-" + id + ".json", 3000000),
      inventory = rawInventory ? SoftwareInventorySchema.parse(rawInventory) : null;
    return SoftwareStateSchema.parse({
      workspaceId,
      administrator,
      demoProgramSha256: this.demoProgramSha256,
      packageDigests: Object.fromEntries(
        catalog.packages.map((p) => [p.id, digest(JSON.stringify(p))]),
      ),
      catalog,
      device: {
        id,
        name: d.name,
        online: d.online,
        capability,
        scan: await this.read("scan-" + id + ".json"),
        inventoryObservedAt: inventory?.observedAt ?? null,
        inventory: inventory?.observedAt === inventorySince ? null : inventory,
      },
      jobs: (await this.jobs())
        .filter(
          (j) =>
            j.workspaceId === workspaceId &&
            j.request.deviceId === id &&
            (administrator || j.actor === actor),
        )
        .slice(0, 100),
    });
  }
  async observe(credential: string, input: unknown) {
    const d = await this.credential(credential),
      value = SoftwareObservationSchema.parse(input);
    if (!value.installConsent && value.services.length) this.fail("consent-required");
    for (const service of value.services) {
      const job = await this.job(service.jobId),
        r = job.request,
        listen = service.listen;
      if (
        job.workspaceId !== this.workspaceId ||
        r.deviceId !== d.deviceId ||
        r.operation !== "install" ||
        job.package?.recipe !== "demo-api" ||
        job.package.id !== service.id ||
        job.package.programSha256 !== value.programSha256 ||
        job.digest !== service.digest ||
        job.result !== "demo-started" ||
        job.status !== "succeeded" ||
        r.port !== service.port ||
        JSON.stringify(r.listen ?? null) !== JSON.stringify(service.listen ?? null) ||
        (listen !== undefined &&
          !value.network?.addresses.some((row) => row.address === listen.address)) ||
        !job.approval?.consumedAt ||
        Date.parse(service.expiresAt) >
          Date.parse(job.approval.consumedAt) + (r.lifetimeSeconds ?? 0) * 1000 ||
        Date.parse(service.expiresAt) <= this.now().getTime()
      )
        this.fail("demo-observation-denied");
    }
    await this.write("device-" + d.deviceId + ".json", {
      receivedAt: this.now().toISOString(),
      value,
    });
    return { observed: true as const };
  }
  async request(actor: string, workspaceId: string, input: unknown) {
    this.scope(workspaceId);
    return this.serial(async () => {
      const request = SoftwareRequestSchema.parse(input),
        device = await this.device(actor, request.deviceId);
      const prior = await this.read(request.requestId + ".json");
      if (prior) {
        const old = SoftwareJobSchema.parse(prior);
        if (
          old.workspaceId !== workspaceId ||
          old.actor !== actor ||
          JSON.stringify(old.request) !== JSON.stringify(request)
        )
          this.fail("idempotency-conflict", 409);
        return old;
      }
      if (!device.online) this.fail("device-offline", 409);
      const observed = await this.observation(device.deviceId);
      if (!observed) this.fail("connector-update-required", 409);
      if (request.operation === "inventory" ? !observed.inventoryConsent : !observed.installConsent)
        this.fail("local-consent-required", 409);
      let pkg: SoftwarePackage | undefined;
      if (request.operation === "install") {
        pkg = (await this.catalog()).packages.find((p) => p.id === request.packageId && p.enabled);
        if (
          !pkg ||
          digest(JSON.stringify(pkg)) !== request.packageDigest ||
          pkg.platform !== observed.platform
        )
          this.fail("package-unavailable", 409);
        if (
          pkg.recipe === "demo-api"
            ? !request.port ||
              !request.lifetimeSeconds ||
              pkg.programSha256 !== observed.programSha256
            : request.port !== undefined ||
              request.lifetimeSeconds !== undefined ||
              request.listen !== undefined
        )
          this.fail("package-parameters-denied");
        const listen = request.listen;
        if (
          listen &&
          (observed.network?.version !== 1 ||
            !observed.network.addresses.some((row) => row.address === listen.address))
        )
          this.fail("service-listen-unavailable", 409);
      }
      const all = await this.jobs();
      if (
        all.some(
          (j) =>
            j.request.deviceId === request.deviceId && ["approved", "working"].includes(j.status),
        )
      )
        this.fail("device-busy", 409);
      const createdAt = this.now();
      const job = SoftwareJobSchema.parse({
        version: 1,
        workspaceId,
        actor,
        request,
        digest: "0".repeat(64),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 3600000).toISOString(),
        status: request.operation === "install" ? "pending-approval" : "approved",
        ...(pkg ? { package: pkg } : {}),
      });
      job.digest = digest(softwareJobBinding(job));
      if (pkg && (await this.administrator(actor))) {
        job.status = "approved";
        job.approval = this.approval(actor, job, pkg);
      }
      await this.audit("request", actor, {
        target: request.deviceId,
        correlationId: request.requestId,
        digest: job.digest,
      });
      await this.write(request.requestId + ".json", job);
      return job;
    });
  }
  private approval(actor: string, job: SoftwareJob, pkg: SoftwarePackage) {
    const issuedAt = this.now();
    return {
      version: 1 as const,
      action: "software.install.v1" as const,
      workspaceId: this.workspaceId,
      actor: SoftwareJobSchema.shape.actor.parse(actor),
      target: job.request.deviceId,
      correlationId: job.request.requestId,
      artifactSha256: softwareArtifact(pkg),
      digest: job.digest,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 600000).toISOString(),
    };
  }
  async decide(actor: string, workspaceId: string, input: unknown) {
    this.scope(workspaceId);
    return this.serial(async () => {
      if (!(await this.administrator(actor))) this.fail("administrator-required");
      const decision = SoftwareDecisionSchema.parse(input),
        job = await this.job(decision.requestId);
      this.scope(job.workspaceId);
      await this.device(actor, job.request.deviceId);
      if (job.actor !== actor) await this.device(job.actor, job.request.deviceId);
      if (
        job.status !== "pending-approval" ||
        job.digest !== decision.digest ||
        Date.parse(job.expiresAt) <= this.now().getTime() ||
        !job.package
      )
        this.fail("approval-stale", 409);
      const current = (await this.catalog()).packages.find(
        (p) => p.id === job.package?.id && p.enabled,
      );
      if (!current || JSON.stringify(current) !== JSON.stringify(job.package))
        this.fail("catalog-changed", 409);
      job.status = decision.decision === "approve" ? "approved" : "rejected";
      if (job.status === "approved") job.approval = this.approval(actor, job, job.package);
      await this.audit(job.status, actor, {
        target: job.request.deviceId,
        correlationId: decision.requestId,
        digest: job.digest,
      });
      await this.write(decision.requestId + ".json", job);
      return job;
    });
  }
  async claim(credential: string) {
    return this.serial(async () => {
      const d = await this.credential(credential),
        observed = await this.observation(d.deviceId);
      if (!observed) return { job: null };
      for (const job of (await this.jobs()).reverse()) {
        if (
          job.workspaceId === this.workspaceId &&
          job.request.deviceId === d.deviceId &&
          job.status === "working" &&
          Date.parse(job.expiresAt) <= this.now().getTime()
        ) {
          await this.audit("interrupted-expired-lease", job.actor, {
            target: d.deviceId,
            correlationId: job.request.requestId,
            digest: job.digest,
          });
          job.status = "recovery-required";
          job.result = "interrupted";
          await this.write(job.request.requestId + ".json", job);
          continue;
        }
        if (
          job.workspaceId !== this.workspaceId ||
          job.request.deviceId !== d.deviceId ||
          job.status !== "approved"
        )
          continue;
        await this.device(job.actor, d.deviceId);
        if (job.digest !== digest(softwareJobBinding(job))) this.fail("job-integrity-denied");
        if (Date.parse(job.expiresAt) <= this.now().getTime()) {
          job.status = "expired";
          await this.audit("expired", job.actor, {
            target: d.deviceId,
            correlationId: job.request.requestId,
            digest: job.digest,
          });
          await this.write(job.request.requestId + ".json", job);
          continue;
        }
        if (
          job.request.operation === "inventory"
            ? !observed.inventoryConsent
            : !observed.installConsent
        )
          continue;
        if (job.request.operation === "install") {
          const listen = job.request.listen;
          if (
            listen &&
            !observed.network?.addresses.some((row) => row.address === listen.address)
          ) {
            job.status = "failed";
            job.result = "failed";
            await this.audit("listen-unavailable", job.actor, {
              target: d.deviceId,
              correlationId: job.request.requestId,
              digest: job.digest,
            });
            await this.write(job.request.requestId + ".json", job);
            continue;
          }
          const a = job.approval,
            pkg = job.package;
          const current = (await this.catalog()).packages.find(
            (p) => p.id === pkg?.id && p.enabled,
          );
          if (
            !a ||
            !pkg ||
            !current ||
            JSON.stringify(current) !== JSON.stringify(pkg) ||
            !(await this.administrator(a.actor)) ||
            a.workspaceId !== this.workspaceId ||
            a.target !== d.deviceId ||
            a.correlationId !== job.request.requestId ||
            a.digest !== job.digest ||
            a.artifactSha256 !== softwareArtifact(pkg) ||
            a.consumedAt ||
            Date.parse(a.expiresAt) <= this.now().getTime() ||
            Date.parse(a.issuedAt) > this.now().getTime()
          ) {
            job.status =
              a && Date.parse(a.expiresAt) <= this.now().getTime() ? "expired" : "failed";
            await this.audit("approval-invalid", job.actor, {
              target: d.deviceId,
              correlationId: job.request.requestId,
              digest: job.digest,
            });
            await this.write(job.request.requestId + ".json", job);
            continue;
          }
          a.consumedAt = this.now().toISOString();
        }
        job.status = "working";
        await this.audit("claimed", job.actor, {
          target: d.deviceId,
          correlationId: job.request.requestId,
          digest: job.digest,
        });
        await this.write(job.request.requestId + ".json", job);
        return { job };
      }
      return { job: null };
    });
  }
  async identity(credential: string) {
    const d = await this.credential(credential);
    return { workspaceId: this.workspaceId, deviceId: d.deviceId, serviceNetworkVersion: 1 };
  }
  async authorize(credential: string, input: unknown) {
    const d = await this.credential(credential),
      request = SoftwareDecisionSchema.pick({ requestId: true, digest: true }).parse(input),
      job = await this.job(request.requestId);
    await this.device(job.actor, d.deviceId);
    const observed = await this.observation(d.deviceId),
      a = job.approval,
      pkg = job.package;
    const current = (await this.catalog()).packages.find((p) => p.id === pkg?.id && p.enabled);
    if (
      job.workspaceId !== this.workspaceId ||
      job.request.deviceId !== d.deviceId ||
      job.status !== "working" ||
      job.request.operation !== "install" ||
      job.digest !== request.digest ||
      job.digest !== digest(softwareJobBinding(job)) ||
      !observed?.installConsent ||
      !a?.consumedAt ||
      a.action !== "software.install.v1" ||
      a.workspaceId !== this.workspaceId ||
      a.target !== d.deviceId ||
      a.correlationId !== job.request.requestId ||
      a.digest !== job.digest ||
      Date.parse(a.issuedAt) > Date.parse(a.consumedAt) ||
      Date.parse(a.consumedAt) > this.now().getTime() ||
      !pkg ||
      !current ||
      JSON.stringify(pkg) !== JSON.stringify(current) ||
      a.artifactSha256 !== softwareArtifact(pkg) ||
      !(await this.administrator(a.actor)) ||
      Date.parse(a.expiresAt) <= this.now().getTime()
    )
      this.fail("execution-denied");
    await this.audit("execution-authorized", a.actor, {
      target: d.deviceId,
      correlationId: request.requestId,
      digest: job.digest,
    });
    return { authorized: true as const };
  }
  async complete(credential: string, input: unknown) {
    return this.serial(async () => {
      const d = await this.credential(credential),
        result = SoftwareCompleteSchema.parse(input),
        job = await this.job(result.requestId);
      this.scope(job.workspaceId);
      await this.device(job.actor, d.deviceId);
      if (
        job.request.deviceId !== d.deviceId ||
        job.digest !== result.digest ||
        job.digest !== digest(softwareJobBinding(job))
      )
        this.fail("completion-denied");
      if (job.status !== "working") {
        if (
          job.result === result.result &&
          ["succeeded", "failed", "recovery-required"].includes(job.status)
        )
          return { completed: true as const };
        this.fail("completion-conflict", 409);
      }
      const operation = job.request.operation;
      const success =
        operation === "inventory"
          ? result.result === "inventory-updated"
          : operation === "stop-demo"
            ? result.result === "demo-stopped"
            : job.package?.recipe === "demo-api"
              ? result.result === "demo-started"
              : result.result === "installed";
      if (!success && !["declined", "failed", "interrupted"].includes(result.result))
        this.fail("completion-result-denied");
      if (operation === "inventory" && success) {
        if (!result.inventory || !(await this.observation(d.deviceId))?.inventoryConsent)
          this.fail("inventory-denied");
        SoftwareInventorySchema.parse(result.inventory);
      } else if (result.inventory) this.fail("inventory-denied");
      if (result.restartRequired !== undefined && result.result !== "installed")
        this.fail("completion-result-denied");
      if (result.restartRequired !== undefined) job.restartRequired = result.restartRequired;
      job.status =
        result.result === "interrupted" ? "recovery-required" : success ? "succeeded" : "failed";
      job.result = result.result;
      await this.audit("completed-" + job.status, job.actor, {
        target: d.deviceId,
        correlationId: result.requestId,
        digest: job.digest,
      });
      if (result.inventory) {
        await this.write("scan-" + d.deviceId + ".json", {
          observedAt: result.inventory.observedAt,
          status: result.inventory.status,
          truncated: result.inventory.truncated,
        });
        if (result.inventory.status !== "unavailable")
          await this.write("inventory-" + d.deviceId + ".json", result.inventory);
      }
      await this.write(result.requestId + ".json", job);
      return { completed: true as const };
    });
  }
  async previewTarget(actor: string, workspaceId: string, deviceId: string, serviceId: string) {
    this.scope(workspaceId);
    const device = await this.device(actor, deviceId);
    SoftwarePackageIdSchema.parse(serviceId);
    const observed = await this.observation(deviceId);
    const service = observed?.services.find((s) => s.id === serviceId);
    if (
      !device.online ||
      !observed?.installConsent ||
      !service ||
      Date.parse(service.expiresAt) <= this.now().getTime()
    )
      this.fail("preview-unavailable", 503);
    const job = await this.job(service.jobId);
    await this.device(job.actor, deviceId);
    if (
      job.status !== "succeeded" ||
      job.result !== "demo-started" ||
      job.package?.recipe !== "demo-api" ||
      job.package.id !== serviceId ||
      job.package.programSha256 !== observed.programSha256 ||
      job.digest !== service.digest
    )
      this.fail("preview-denied");
    return {
      device,
      snapshot: { profileId: "software-" + serviceId, revision: 1, fingerprint: job.digest },
    };
  }
  async connectorIdentity(credential: string) {
    const d = await this.credential(credential),
      observed = await this.observation(d.deviceId);
    if (!observed?.installConsent || observed.services.length !== 1)
      this.fail("preview-unavailable", 503);
    const target = await this.previewTarget(
      d.userId,
      this.workspaceId,
      d.deviceId,
      observed.services[0]!.id,
    );
    return {
      workspaceId: this.workspaceId,
      deviceId: d.deviceId,
      profileId: target.snapshot.profileId,
    };
  }
}
