import { createHash, randomBytes } from "node:crypto";
import { mkdir, lstat, open, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { z } from "zod";
import {
  NotificationDraftInputSchema,
  NotificationApprovalInputSchema,
  NotificationSchema,
  NotificationClaimInputSchema,
  NotificationCompleteInputSchema,
  NotificationStateSchema,
  WorkspaceIdSchema,
  type AgentNotification,
  type AgentRun,
} from "@frevos/contracts";
import { assertPlainPath } from "./model-secrets.js";
import { replaceDurableRecord } from "./atomic-record.js";
import { ServixDeploymentError } from "./servix-deployment.js";
type Device = {
  deviceId: string;
  userId: string;
  name: string;
  online: boolean;
  status: string;
  workspaceAuthorized: boolean;
};
export interface NotificationDevices {
  discoveryDevices(actor: string): Promise<Device[]>;
  checkCredential(credential: string): Promise<{ deviceId: string; userId: string }>;
}
const safe = createRequire(import.meta.url)("../../../deployment/servix/DiscoverySafety.cjs") as {
  redact(text: string): string;
};
const NoticeStatus = z
  .object({
    version: z.literal(1),
    deviceId: z.string(),
    actor: z.string(),
    workspaceId: WorkspaceIdSchema,
    at: z.iso.datetime(),
    enabled: z.boolean(),
    capability: NotificationClaimInputSchema.shape.capability,
  })
  .strict();
export function notificationDigest(
  n: Pick<
    AgentNotification,
    | "version"
    | "workspaceId"
    | "actor"
    | "id"
    | "runId"
    | "deviceId"
    | "title"
    | "message"
    | "createdAt"
  >,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        n.version,
        n.workspaceId,
        n.actor,
        n.id,
        n.runId,
        n.deviceId,
        n.title,
        n.message,
        n.createdAt,
      ]),
    )
    .digest("hex");
}
export class AgentNotifications {
  private chain: Promise<unknown> = Promise.resolve();
  readonly workspaceId: z.infer<typeof WorkspaceIdSchema>;
  constructor(
    readonly root: string,
    workspaceId: string,
    private readonly devices: NotificationDevices,
    private readonly allowed: (actor: string) => Promise<boolean>,
    private readonly source: (
      actor: string,
      runId: string,
    ) => Promise<{ run: AgentRun; allowed: boolean }>,
    private readonly now = () => new Date(),
  ) {
    this.workspaceId = WorkspaceIdSchema.parse(workspaceId);
  }
  private serial<T>(fn: () => Promise<T>) {
    const r = this.chain.then(fn);
    this.chain = r.catch(() => undefined);
    return r;
  }
  private fail(code = "notification-access-denied", status = 403) {
    return new ServixDeploymentError(code, status);
  }
  private async directory() {
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  private async read(name: string) {
    await this.directory();
    const file = join(this.root, name);
    await assertPlainPath(file);
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.size > 16384)
        throw this.fail("notification-storage-unavailable", 503);
      return JSON.parse(await readFile(file, "utf8")) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  private async save(name: string, value: unknown, fresh = false) {
    await this.directory();
    const file = join(this.root, name);
    await assertPlainPath(file);
    const temp = fresh ? file : file + "." + randomBytes(8).toString("hex") + ".tmp";
    const h = await open(temp, "wx", 0o600);
    try {
      await h.writeFile(JSON.stringify(value));
      await h.sync();
    } finally {
      await h.close();
    }
    if (!fresh) await replaceDurableRecord(temp, file);
  }
  private verify(value: unknown) {
    const job = NotificationSchema.parse(value);
    if (job.workspaceId !== this.workspaceId || notificationDigest(job) !== job.digest)
      throw this.fail("notification-integrity-denied");
    if (
      job.approval &&
      (job.approval.actor !== job.actor ||
        job.approval.workspaceId !== job.workspaceId ||
        job.approval.target !== job.deviceId ||
        job.approval.correlationId !== job.id ||
        job.approval.digest !== job.digest ||
        job.approval.expiresAt !== job.expiresAt)
    )
      throw this.fail("notification-approval-denied");
    return job;
  }
  private async records() {
    await this.directory();
    const names = (await readdir(this.root)).filter((n) => /^nt_[a-f0-9]{32}\.json$/.test(n));
    if (names.length > 100) throw this.fail("notification-capacity", 503);
    const rows: AgentNotification[] = [];
    for (const n of names) {
      const row = this.verify(await this.read(n));
      if (row.id + ".json" !== n) throw this.fail("notification-integrity-denied");
      if (Date.parse(row.createdAt) < this.now().getTime() - 7 * 86400000) {
        await unlink(join(this.root, n));
        const approval = join(this.root, row.id + ".approval.json");
        await assertPlainPath(approval);
        await unlink(approval).catch((e) => {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        });
      } else rows.push(row);
    }
    return rows;
  }
  private async owned(actor: string, deviceId: string) {
    if (!(await this.allowed(actor))) throw this.fail();
    const d = (await this.devices.discoveryDevices(actor)).find(
      (d) =>
        d.deviceId === deviceId &&
        d.userId === actor &&
        d.status === "active" &&
        d.workspaceAuthorized,
    );
    if (!d) throw this.fail();
    return d;
  }
  private async status(deviceId: string) {
    const value = await this.read(deviceId + ".status.json");
    return value ? NoticeStatus.parse(value) : null;
  }
  async state(actor: string) {
    return this.serial(async () => {
      if (!(await this.allowed(actor))) throw this.fail();
      const devices = (await this.devices.discoveryDevices(actor)).filter(
        (d) => d.userId === actor && d.status === "active" && d.workspaceAuthorized,
      );
      const recipients = await Promise.all(
        devices.map(async (d) => {
          const status = await this.status(d.deviceId);
          const fresh =
            status?.actor === actor &&
            status.workspaceId === this.workspaceId &&
            Date.parse(status.at) >= this.now().getTime() - 30000;
          return {
            deviceId: d.deviceId,
            name: d.name,
            online: d.online,
            enabled: !!fresh && !!status.enabled,
            capability: fresh ? status.capability : ("unavailable" as const),
            observedAt: status?.at ?? null,
          };
        }),
      );
      return NotificationStateSchema.parse({
        version: 1,
        recipients,
        records: (await this.records())
          .filter((n) => n.actor === actor && devices.some((d) => d.deviceId === n.deviceId))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map((n) =>
            Date.parse(n.expiresAt) <= this.now().getTime() &&
            ["draft", "queued", "delivering"].includes(n.status)
              ? { ...n, status: n.status === "delivering" ? "delivery-uncertain" : "expired" }
              : n,
          ),
      });
    });
  }
  async draft(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = NotificationDraftInputSchema.parse(input);
      await this.owned(actor, body.deviceId);
      const source = await this.source(actor, body.runId);
      if (
        !source.allowed ||
        source.run.actor !== actor ||
        source.run.workspaceId !== this.workspaceId ||
        source.run.status !== "succeeded" ||
        Date.parse(source.run.createdAt) < this.now().getTime() - 86400000
      )
        throw this.fail("notification-source-denied");
      const rows = await this.records();
      if (rows.length >= 100) throw this.fail("notification-capacity", 503);
      const job = {
        ...body,
        title: safe.redact(body.title),
        message: safe.redact(body.message),
        id: "nt_" + randomBytes(16).toString("hex"),
        workspaceId: this.workspaceId,
        actor,
        revision: 1,
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 86400000).toISOString(),
        status: "draft" as const,
      };
      const record = NotificationSchema.parse({ ...job, digest: notificationDigest(job) });
      await this.save(record.id + ".json", record, true);
      return record;
    });
  }
  async approve(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = NotificationApprovalInputSchema.parse(input),
        value = await this.read(body.id + ".json");
      if (!value) throw this.fail("notification-not-found", 404);
      const job = this.verify(value),
        device = await this.owned(actor, job.deviceId),
        status = await this.status(job.deviceId);
      if (
        job.id !== body.id ||
        job.actor !== actor ||
        job.status !== "draft" ||
        job.revision !== body.expectedRevision ||
        job.digest !== body.digest ||
        Date.parse(job.expiresAt) <= this.now().getTime()
      )
        throw this.fail("notification-revision-changed", 409);
      if (
        !device.online ||
        status?.actor !== actor ||
        status.workspaceId !== this.workspaceId ||
        !status.enabled ||
        status.capability === "unavailable" ||
        Date.parse(status.at) < this.now().getTime() - 30000
      )
        throw this.fail("notification-local-consent-required", 409);
      const source = await this.source(actor, job.runId);
      if (!source.allowed) throw this.fail("notification-source-denied");
      const rows = await this.records();
      if (
        rows.some(
          (n) =>
            n.deviceId === job.deviceId &&
            n.approval &&
            Date.parse(n.approval.issuedAt) > this.now().getTime() - 3600000,
        )
      )
        throw this.fail("notification-rate-limited", 429);
      job.approval = {
        version: 1,
        actor: job.actor,
        workspaceId: job.workspaceId,
        action: "notification:deliver",
        target: job.deviceId,
        correlationId: job.id,
        digest: job.digest,
        issuedAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 600000).toISOString(),
      };
      job.expiresAt = job.approval.expiresAt;
      job.status = "queued";
      job.revision++;
      await this.save(job.id + ".approval.json", job.approval, true);
      await this.save(job.id + ".json", job);
      return job;
    });
  }
  async claim(credential: string, input: unknown) {
    return this.serial(async () => {
      const body = NotificationClaimInputSchema.parse(input),
        device = await this.devices.checkCredential(credential);
      await this.owned(device.userId, device.deviceId);
      await this.save(device.deviceId + ".status.json", {
        ...body,
        deviceId: device.deviceId,
        actor: device.userId,
        workspaceId: this.workspaceId,
        at: this.now().toISOString(),
      });
      if (!body.enabled || body.capability === "unavailable") return null;
      for (const job of await this.records()) {
        if (
          job.deviceId !== device.deviceId ||
          job.actor !== device.userId ||
          job.status !== "queued" ||
          !job.approval ||
          job.approval.consumedAt ||
          Date.parse(job.expiresAt) <= this.now().getTime()
        )
          continue;
        const source = await this.source(job.actor, job.runId);
        if (!source.allowed) continue;
        job.approval.consumedAt = this.now().toISOString();
        job.status = "delivering";
        job.revision++;
        await this.save(job.id + ".json", job);
        return job;
      }
      return null;
    });
  }
  async complete(credential: string, input: unknown) {
    return this.serial(async () => {
      const body = NotificationCompleteInputSchema.parse(input),
        device = await this.devices.checkCredential(credential),
        value = await this.read(body.id + ".json");
      if (!value) throw this.fail("notification-not-found", 404);
      const job = this.verify(value);
      await this.owned(device.userId, device.deviceId);
      if (
        job.id !== body.id ||
        job.actor !== device.userId ||
        job.deviceId !== device.deviceId ||
        job.digest !== body.digest ||
        job.status !== "delivering" ||
        !job.approval?.consumedAt ||
        Date.parse(job.expiresAt) <= this.now().getTime()
      )
        throw this.fail("notification-scope-denied");
      job.status = body.status;
      job.revision++;
      await this.save(job.id + ".json", job);
      return { accepted: true };
    });
  }
}
