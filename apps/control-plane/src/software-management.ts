import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ServiceInventorySchema,
  ServicePolicyInputSchema,
  ServicePolicySchema,
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
  platform?: "win32" | "linux" | "android" | undefined;
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
      (name === "catalog.json" || name.startsWith("service-policy-")
        ? 262144
        : /^(?:inventory|service-inventory)-/.test(name)
          ? 3000000
          : 32768)
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
    const device = await this.device(d.userId, d.deviceId);
    return { ...d, platform: device.platform };
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
  async state(
    actor: string,
    workspaceId: string,
    id: string,
    inventorySince?: string,
    servicesSince?: string,
  ) {
    this.scope(workspaceId);
    const d = await this.device(actor, id),
      administrator = await this.administrator(actor);
    const capability = d.online ? await this.observation(id) : null,
      catalog = await this.catalog();
    z.iso.datetime().optional().parse(inventorySince);
    z.iso.datetime().optional().parse(servicesSince);
    const rawInventory = await this.read("inventory-" + id + ".json", 3000000),
      inventory = rawInventory ? SoftwareInventorySchema.parse(rawInventory) : null;
    const rawServices = await this.read("service-inventory-" + id + ".json", 3000000),
      serviceInventory = rawServices ? ServiceInventorySchema.parse(rawServices) : null;
    return SoftwareStateSchema.parse({
      workspaceId,
      administrator,
      demoProgramSha256: this.demoProgramSha256,
      packageDigests: Object.fromEntries(
        catalog.packages.map((p) => [p.id, digest(JSON.stringify(p))]),
      ),
      catalog,
      servicePolicy: await this.servicePolicy(id),
      device: {
        id,
        name: d.name,
        online: d.online,
        capability,
        scan: await this.read("scan-" + id + ".json"),
        inventoryObservedAt: inventory?.observedAt ?? null,
        inventory: inventory?.observedAt === inventorySince ? null : inventory,
        serviceInventoryObservedAt: serviceInventory?.observedAt ?? null,
        serviceInventory: serviceInventory?.observedAt === servicesSince ? null : serviceInventory,
        serviceScan: await this.read("service-scan-" + id + ".json"),
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
    return this.serial(async () => {
      const d = await this.credential(credential),
        value = SoftwareObservationSchema.parse(input);
      if (d.platform && d.platform !== value.platform) this.fail("platform-denied");
      if (value.platform === "android" && (value.installConsent || value.services.length))
        this.fail("android-scope-denied");
      if (value.serviceInventory) {
        if (
          !value.inventoryConsent ||
          !value.serviceManagement ||
          value.serviceInventory.platform !== value.platform ||
          Date.parse(value.serviceInventory.observedAt) > this.now().getTime() + 5000 ||
          this.now().getTime() - Date.parse(value.serviceInventory.observedAt) > 180000
        )
          this.fail("service-inventory-denied");
        await this.saveServiceInventory(d.deviceId, value.serviceInventory);
      }
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
        value: { ...value, serviceInventory: undefined },
      });
      return { observed: true as const };
    });
  }
  private async servicePolicy(id: string) {
    const policy = ServicePolicySchema.parse(
      (await this.read("service-policy-" + id + ".json", 262144)) ?? {
        version: 1,
        workspaceId: this.workspaceId,
        deviceId: id,
        revision: 0,
        rules: [],
      },
    );
    if (policy.workspaceId !== this.workspaceId || policy.deviceId !== id)
      this.fail("service-policy-scope-denied");
    return policy;
  }
  async saveServicePolicy(actor: string, workspaceId: string, input: unknown) {
    this.scope(workspaceId);
    return this.serial(async () => {
      if (!(await this.administrator(actor))) this.fail("administrator-required");
      const r = ServicePolicyInputSchema.parse(input);
      await this.device(actor, r.deviceId);
      const policy = await this.servicePolicy(r.deviceId),
        raw = await this.read("service-inventory-" + r.deviceId + ".json", 3000000),
        snapshot = raw ? ServiceInventorySchema.parse(raw) : null,
        service = snapshot?.items.find((s) => s.id === r.rule.id);
      if (
        policy.workspaceId !== workspaceId ||
        policy.deviceId !== r.deviceId ||
        policy.revision !== r.expectedRevision
      )
        this.fail("service-policy-changed", 409);
      if (
        r.rule.enabled &&
        (!service || service.protected || service.definitionSha256 !== r.rule.definitionSha256)
      )
        this.fail("service-unavailable", 409);
      const next = ServicePolicySchema.parse({
        ...policy,
        revision: policy.revision + 1,
        rules: [...policy.rules.filter((s) => s.id !== r.rule.id), r.rule],
      });
      await this.audit("service-policy-save", actor, {
        target: r.deviceId,
        digest: digest(JSON.stringify(next)),
      });
      await this.write("service-policy-" + r.deviceId + ".json", next);
      return next;
    });
  }
  private async saveServiceInventory(id: string, input: unknown) {
    const snapshot = ServiceInventorySchema.parse(input);
    const previous = await this.read("service-inventory-" + id + ".json", 3000000);
    const scan = (await this.read("service-scan-" + id + ".json")) as { observedAt: string } | null;
    if (scan && Date.parse(scan.observedAt) > Date.parse(snapshot.observedAt)) return;
    if (
      previous &&
      Date.parse(ServiceInventorySchema.parse(previous).observedAt) >
        Date.parse(snapshot.observedAt)
    )
      return;
    await this.write("service-scan-" + id + ".json", {
      observedAt: snapshot.observedAt,
      status: snapshot.status,
      truncated: snapshot.truncated,
    });
    if (snapshot.status !== "unavailable")
      await this.write("service-inventory-" + id + ".json", snapshot);
  }
  private async serviceAuthority(
    job: SoftwareJob,
    observed: Awaited<ReturnType<SoftwareManagement["observation"]>>,
  ) {
    const r = job.request;
    if (r.operation !== "start-service" && r.operation !== "stop-service")
      this.fail("service-execution-denied");
    const p = await this.servicePolicy(r.deviceId),
      raw = await this.read("service-inventory-" + r.deviceId + ".json", 3000000),
      snapshot = raw ? ServiceInventorySchema.parse(raw) : null,
      s = snapshot?.items.find((s) => s.id === r.serviceId),
      rule = p.rules.find((v) => v.id === r.serviceId),
      a = job.approval;
    if (
      !snapshot ||
      this.now().getTime() - Date.parse(snapshot.observedAt) > 90000 ||
      Date.parse(snapshot.observedAt) > this.now().getTime() + 5000
    )
      this.fail("service-snapshot-stale");
    if (
      !(await this.administrator(job.actor)) ||
      !observed?.serviceManagement?.controlConsent ||
      !s ||
      s.protected ||
      !job.service ||
      s.id !== job.service.id ||
      s.definitionSha256 !== job.service.definitionSha256 ||
      !rule?.enabled ||
      rule.definitionSha256 !== s.definitionSha256 ||
      p.workspaceId !== this.workspaceId ||
      p.deviceId !== r.deviceId ||
      p.revision !== r.policyRevision ||
      !a ||
      a.action !== "software.service.v1" ||
      a.actor !== job.actor ||
      a.workspaceId !== this.workspaceId ||
      a.target !== r.deviceId ||
      a.correlationId !== r.requestId ||
      a.digest !== job.digest ||
      a.artifactSha256 !== s.definitionSha256 ||
      Date.parse(a.issuedAt) > this.now().getTime() ||
      Date.parse(a.expiresAt) <= this.now().getTime() ||
      Date.parse(a.expiresAt) - Date.parse(a.issuedAt) > 300000
    )
      this.fail("service-execution-denied");
    return a;
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
      const readOnly =
          request.operation === "inventory" || request.operation === "services-inventory",
        control = request.operation === "start-service" || request.operation === "stop-service";
      if (
        readOnly
          ? !observed.inventoryConsent
          : control
            ? !observed.serviceManagement?.controlConsent
            : !observed.installConsent
      )
        this.fail("local-consent-required", 409);
      if ((control || request.operation === "services-inventory") && !observed.serviceManagement)
        this.fail("connector-update-required", 409);
      let service: SoftwareJob["service"];
      if (control) {
        if (!(await this.administrator(actor))) this.fail("administrator-required");
        const raw = await this.read("service-inventory-" + device.deviceId + ".json", 3000000),
          snapshot = raw ? ServiceInventorySchema.parse(raw) : null,
          policy = await this.servicePolicy(device.deviceId);
        service = snapshot?.items.find((s) => s.id === request.serviceId);
        if (
          !snapshot ||
          this.now().getTime() - Date.parse(snapshot.observedAt) > 90000 ||
          !service ||
          service.protected ||
          policy.revision !== request.policyRevision ||
          !policy.rules.some(
            (s) =>
              s.id === service?.id && s.definitionSha256 === service.definitionSha256 && s.enabled,
          )
        )
          this.fail("service-unavailable", 409);
        if (request.operation === "start-service" ? !service.canStart : !service.canStop)
          this.fail("os-permission-required", 409);
      }
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
        ...(service ? { service } : {}),
      });
      job.digest = digest(softwareJobBinding(job));
      if (pkg && (await this.administrator(actor))) {
        job.status = "approved";
        job.approval = this.approval(actor, job, pkg);
      }
      if (service) {
        const issuedAt = this.now();
        job.approval = {
          version: 1,
          action: "software.service.v1",
          workspaceId: this.workspaceId,
          actor: SoftwareJobSchema.shape.actor.parse(actor),
          target: request.deviceId,
          correlationId: request.requestId,
          artifactSha256: service.definitionSha256,
          digest: job.digest,
          issuedAt: issuedAt.toISOString(),
          expiresAt: new Date(issuedAt.getTime() + 300000).toISOString(),
        };
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
          ["inventory", "services-inventory"].includes(job.request.operation)
            ? !observed.inventoryConsent
            : ["start-service", "stop-service"].includes(job.request.operation)
              ? !observed.serviceManagement?.controlConsent
              : !observed.installConsent
        )
          continue;
        if (
          job.service ||
          job.request.operation === "start-service" ||
          job.request.operation === "stop-service"
        ) {
          try {
            const a = await this.serviceAuthority(job, observed);
            if (a.consumedAt) this.fail("service-replay-denied");
            a.consumedAt = this.now().toISOString();
          } catch {
            job.status = "failed";
            job.result = "declined";
            await this.audit("service-claim-denied", job.actor, {
              target: d.deviceId,
              correlationId: job.request.requestId,
              digest: job.digest,
            });
            await this.write(job.request.requestId + ".json", job);
            continue;
          }
        }
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
    return {
      workspaceId: this.workspaceId,
      deviceId: d.deviceId,
      serviceNetworkVersion: 1,
      serviceManagementVersion: 1,
    };
  }
  async initialInventory(credential: string) {
    return this.serial(async () => {
      const d = await this.credential(credential),
        device = await this.device(d.userId, d.deviceId),
        observed = await this.observation(d.deviceId);
      if (!device.online || !observed?.inventoryConsent) return { scheduled: false };
      // A completed snapshot survives restarts. Manual refresh remains explicit;
      // capability heartbeats must not trigger an inventory scan every few seconds.
      const saved = await this.read("inventory-" + d.deviceId + ".json", 3000000);
      if (saved && SoftwareInventorySchema.parse(saved).status !== "unavailable")
        return { scheduled: false };
      const now = this.now(),
        jobs = (await this.jobs()).filter((j) => j.request.deviceId === d.deviceId);
      if (
        jobs.some(
          (j) =>
            (["approved", "working"].includes(j.status) &&
              Date.parse(j.expiresAt) > now.getTime()) ||
            (j.request.operation === "inventory" &&
              now.getTime() - Date.parse(j.createdAt) < 600000),
        )
      )
        return { scheduled: false };
      const job = SoftwareJobSchema.parse({
        version: 1,
        workspaceId: this.workspaceId,
        actor: d.userId,
        request: {
          version: 1,
          requestId: "sw_" + randomBytes(16).toString("hex"),
          deviceId: d.deviceId,
          operation: "inventory",
        },
        digest: "0".repeat(64),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 3600000).toISOString(),
        status: "approved",
      });
      job.digest = digest(softwareJobBinding(job));
      await this.audit("initial-inventory-request", d.userId, {
        target: d.deviceId,
        correlationId: job.request.requestId,
        digest: job.digest,
      });
      await this.write(job.request.requestId + ".json", job);
      return { scheduled: true };
    });
  }
  async authorize(credential: string, input: unknown) {
    const d = await this.credential(credential),
      request = SoftwareDecisionSchema.pick({ requestId: true, digest: true }).parse(input),
      job = await this.job(request.requestId);
    await this.device(job.actor, d.deviceId);
    if (job.service) {
      if (
        job.workspaceId !== this.workspaceId ||
        job.request.deviceId !== d.deviceId ||
        job.status !== "working" ||
        job.digest !== request.digest ||
        job.digest !== digest(softwareJobBinding(job))
      )
        this.fail("service-execution-denied");
      const a = await this.serviceAuthority(job, await this.observation(d.deviceId));
      if (
        !a.consumedAt ||
        Date.parse(a.consumedAt) > this.now().getTime() ||
        Date.parse(a.consumedAt) < Date.parse(a.issuedAt)
      )
        this.fail("service-execution-denied");
      await this.audit("service-execution-authorized", job.actor, {
        target: d.deviceId,
        correlationId: request.requestId,
        digest: job.digest,
      });
      return { authorized: true as const };
    }
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
          : operation === "services-inventory"
            ? result.result === "services-updated"
            : operation === "start-service"
              ? result.result === "service-started"
              : operation === "stop-service"
                ? result.result === "service-stopped"
                : operation === "stop-demo"
                  ? result.result === "demo-stopped"
                  : job.package?.recipe === "demo-api"
                    ? result.result === "demo-started"
                    : result.result === "installed";
      if (
        !success &&
        ![
          "declined",
          "failed",
          "interrupted",
          ...(job.service ? ["os-permission-denied", "service-changed", "dependents-running"] : []),
        ].includes(result.result)
      )
        this.fail("completion-result-denied");
      if (operation === "inventory" && success) {
        const observed = await this.observation(d.deviceId);
        if (
          !result.inventory ||
          !observed?.inventoryConsent ||
          result.inventory.platform !== observed.platform
        )
          this.fail("inventory-denied");
        SoftwareInventorySchema.parse(result.inventory);
      } else if (result.inventory) this.fail("inventory-denied");
      if (result.serviceInventory) {
        const observed = await this.observation(d.deviceId);
        if (
          !["services-inventory", "start-service", "stop-service"].includes(operation) ||
          !observed?.inventoryConsent ||
          result.serviceInventory.platform !== observed.platform ||
          Date.parse(result.serviceInventory.observedAt) > this.now().getTime() + 5000 ||
          this.now().getTime() - Date.parse(result.serviceInventory.observedAt) > 180000
        )
          this.fail("service-inventory-denied");
        await this.saveServiceInventory(d.deviceId, result.serviceInventory);
      }
      if (operation === "services-inventory" && success && !result.serviceInventory)
        this.fail("service-inventory-denied");
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
