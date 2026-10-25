import { randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  ConnectorIdSchema,
  type ConnectorProbe,
  ConnectorProbeSchema,
  ConnectorSchema,
  ConnectorRecordBaseSchema,
  type DeploymentChange,
  DeploymentChangeSchema,
  type DeploymentSettings,
  type FolderSelection,
  FolderSelectionSchema,
  InviteDeveloperSchema,
  matchesDeploymentRepository,
  PairConnectorSchema,
  PreservedPathSchema,
  RedeemDeveloperSchema,
  SERVIX_REPOSITORY,
  ServixHeadSchema,
  ServixRequestIdSchema,
  type SourceBindingSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import { hashesMatch, sha256 } from "./crypto.js";
import { type DeploymentSettingsStore, repositoryOrigins } from "./deployment-settings.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const digest = (s: string) => sha256(s).toString("hex");
const secret = () => randomBytes(32).toString("base64url");
async function writeSeed(path: string, bytes: Buffer) {
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}
const DeviceRecord = ConnectorRecordBaseSchema.omit({
  online: true,
  source: true,
  folderSelection: true,
  folderPicker: true,
  folderBrowser: true,
  changeNotes: true,
})
  .extend({ credentialHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
  .superRefine((device, ctx) => {
    if (
      device.mode === "system" ? !!device.repositoryId || !!device.profileId : !device.repositoryId
    )
      ctx.addIssue({
        code: "custom",
        message: "Connector purpose does not match its repository scope",
      });
  });
const JobSchema = z
  .object({
    version: z.literal(1),
    requestId: ServixRequestIdSchema,
    deviceId: ConnectorIdSchema,
    userId: z.string().regex(/^usr_[A-Za-z0-9_-]+$/),
    baseHead: ServixHeadSchema,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["queued", "working", "published", "failed"]),
    sourceHead: ServixHeadSchema.optional(),
    preservedPaths: z.array(PreservedPathSchema).max(64).optional(),
    changeDetails: DeploymentChangeSchema.optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,62}$/)
      .optional(),
  })
  .strict();
const InviteRecord = z
  .object({
    version: z.literal(1),
    username: InviteDeveloperSchema.shape.username,
    displayName: InviteDeveloperSchema.shape.displayName,
    createdBy: z.string(),
    credentialHash: z.string(),
    expiresAt: z.iso.datetime(),
    status: z.enum(["pending", "consumed"]),
  })
  .strict();
export interface ConnectorGit {
  head(): Promise<string>;
  importBundle(file: string, base: string, head: string): Promise<void>;
  exportBundle?(file: string, heads: string[]): Promise<void>;
}
export class DeveloperConnectorStore {
  private chain: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private readonly baselineFiles = new Set<string>();
  private readonly heartbeats = new Map<string, string>();
  private readonly probes = new Map<string, { at: number; value: ConnectorProbe }>();
  private readonly folderSelections = new Map<string, FolderSelection>();
  private readonly folderPickers = new Set<string>();
  private readonly folderBrowsers = new Set<string>();
  private readonly changeNoteDevices = new Set<string>();
  constructor(
    readonly root: string,
    private readonly allowed: (actor: string) => Promise<boolean>,
    private readonly git: ConnectorGit,
    private readonly createDeveloper: (
      username: string,
      password: string,
      displayName: string,
    ) => Promise<void>,
    private readonly now = () => new Date(),
    private readonly active: (
      id: string,
      actor: string,
      deviceId: string,
    ) => Promise<boolean> = async () => false,
    private readonly settings?: DeploymentSettingsStore,
    private readonly configured?: {
      authorizeSource?(actor: string, profileId: string): Promise<void>;
      connectorProfile(
        id: string,
      ): Promise<
        | (DeploymentSettings & { centralRepository: z.infer<typeof SourceBindingSchema> })
        | undefined
      >;
      git(id: string): Promise<ConnectorGit & { seed(file: string, head: string): Promise<void> }>;
    },
  ) {}
  private async profile(id: string) {
    return (await this.configured?.connectorProfile(id)) ?? this.settings?.profile(id);
  }
  private async repository(id: string) {
    return (await this.configured?.connectorProfile(id)) ? this.configured!.git(id) : this.git;
  }
  close() {
    this.stopped = true;
    this.heartbeats.clear();
    this.probes.clear();
    this.folderSelections.clear();
    this.folderPickers.clear();
    this.folderBrowsers.clear();
    this.changeNoteDevices.clear();
  }
  async heartbeat(credential: string, input: unknown = {}) {
    const device = await this.authenticate(credential);
    if (device.mode !== "system")
      await this.configured?.authorizeSource?.(
        device.userId,
        device.profileId ?? "servix-development",
      );
    // Presence must not wait behind a long Git import or claim the next job.
    if (this.heartbeats.size >= 1000 && !this.heartbeats.has(device.deviceId))
      throw new ServixDeploymentError("connector-capacity", 503);
    this.heartbeats.set(device.deviceId, this.now().toISOString());
    const body = z
      .object({
        probe: ConnectorProbeSchema.optional(),
        folderPicker: z.boolean().optional(),
        folderBrowser: z.boolean().optional(),
        changeNotes: z.boolean().optional(),
      })
      .strict()
      .parse(input);
    if (
      device.mode === "system" &&
      (body.probe || body.folderPicker || body.folderBrowser || body.changeNotes)
    )
      throw new ServixDeploymentError("connector-project-binding-required", 403);
    if (body.folderPicker) this.folderPickers.add(device.deviceId);
    else this.folderPickers.delete(device.deviceId);
    if (body.folderBrowser) this.folderBrowsers.add(device.deviceId);
    else this.folderBrowsers.delete(device.deviceId);
    if (body.changeNotes) this.changeNoteDevices.add(device.deviceId);
    else this.changeNoteDevices.delete(device.deviceId);
    this.probes.delete(device.deviceId);
    if (body.probe && body.probe.profileId === (device.profileId ?? "servix-development"))
      this.probes.set(device.deviceId, { at: this.now().getTime(), value: body.probe });
    return { online: true };
  }
  private folderSelection(id: string) {
    const selection = this.folderSelections.get(id);
    if (
      selection &&
      ["queued", "choosing"].includes(selection.status) &&
      Date.parse(selection.expiresAt) <= this.now().getTime()
    )
      selection.status = "expired";
    return selection;
  }
  async chooseFolder(actor: string, id: string, requestedRepository?: string) {
    return this.serial(async () => {
      const device = (await this.list(actor)).find((d) => d.deviceId === id);
      if (!device?.online) throw new ServixDeploymentError("connector-offline");
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      if (requestedRepository ? !device.folderBrowser : !device.folderPicker)
        throw new ServixDeploymentError("connector-update-required");
      const profile = await this.profile(device.profileId ?? "servix-development");
      if (profile?.archived) throw new ServixDeploymentError("settings-project-archived");
      const existing = this.folderSelection(id);
      if (existing && ["queued", "choosing"].includes(existing.status)) {
        if (existing.requestedRepository !== requestedRepository)
          throw new ServixDeploymentError("connector-source-busy");
        return existing;
      }
      const names = (await readdir(this.root)).filter((n) =>
        /^sd_[a-f0-9]{32}\.source\.json$/.test(n),
      );
      if (names.length > 1000) throw new ServixDeploymentError("connector-capacity", 503);
      for (const name of names) {
        const job = JobSchema.parse(await this.read(name));
        if (
          job.deviceId === id &&
          ["queued", "working"].includes(job.status) &&
          Date.parse(job.expiresAt) > this.now().getTime() &&
          (await this.active(job.requestId, job.userId, job.deviceId))
        )
          throw new ServixDeploymentError("connector-source-busy");
      }
      const selection = FolderSelectionSchema.parse({
        version: 1,
        requestId: "fp_" + randomBytes(16).toString("hex"),
        deviceId: id,
        profileId: device.profileId ?? "servix-development",
        expiresAt: new Date(this.now().getTime() + 90000).toISOString(),
        status: "queued",
        ...(requestedRepository ? { requestedRepository } : {}),
      });
      this.folderSelections.set(id, selection);
      return selection;
    });
  }
  async claimFolder(credential: string) {
    return this.serial(async () => {
      const device = await this.authenticate(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      const selection = this.folderSelection(device.deviceId);
      if (!selection || selection.status !== "queued") return null;
      selection.status = "choosing";
      return selection;
    });
  }
  async finishFolder(credential: string, input: unknown) {
    return this.serial(async () => {
      const device = await this.authenticate(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      const result = FolderSelectionSchema.parse(input);
      const selection = this.folderSelection(device.deviceId);
      if (
        !selection ||
        selection.status !== "choosing" ||
        result.requestId !== selection.requestId ||
        result.deviceId !== device.deviceId ||
        result.profileId !== selection.profileId ||
        result.expiresAt !== selection.expiresAt ||
        result.requestedRepository !== selection.requestedRepository ||
        !["selected", "cancelled", "failed"].includes(result.status)
      )
        throw new ServixDeploymentError("folder-selection-expired");
      if (result.status === "selected") {
        if (result.errorCode) throw new ServixDeploymentError("folder-selection-invalid", 400);
        const profile = await this.profile(selection.profileId);
        if (
          !result.source ||
          result.source.profileId !== selection.profileId ||
          !profile ||
          profile.archived ||
          !matchesDeploymentRepository(profile, result.source)
        )
          throw new ServixDeploymentError("connector-source-test-required");
      } else if (result.source) throw new ServixDeploymentError("folder-selection-invalid", 400);
      this.folderSelections.set(device.deviceId, result);
      this.probes.delete(device.deviceId);
      return { accepted: true };
    });
  }
  async diagnostics(actor: string, id: string) {
    const device = (await this.list(actor)).find((d) => d.deviceId === id);
    const probe = this.probes.get(id);
    return device?.online && probe && this.now().getTime() - probe.at < 20000
      ? probe.value
      : undefined;
  }
  async checkCredential(credential: string) {
    const device = await this.authenticate(credential);
    if (device.mode === "system") return device;
    await this.configured?.authorizeSource?.(
      device.userId,
      device.profileId ?? "servix-development",
    );
    if (
      (device.profileId ?? "servix-development") !== "servix-development" &&
      !(await this.configured?.connectorProfile(device.profileId!))
    )
      throw new ServixDeploymentError("connector-source-unavailable", 503);
    return device;
  }
  async baseline(credential: string, input: unknown) {
    const device = await this.checkCredential(credential);
    if (device.mode === "system")
      throw new ServixDeploymentError("connector-project-binding-required", 403);
    const git = await this.repository(device.profileId ?? "servix-development");
    await git.head();
    const { heads } = z
      .object({ heads: z.array(ServixHeadSchema).max(100) })
      .strict()
      .parse(input);
    if (!git.exportBundle) throw new ServixDeploymentError("connector-source-unavailable", 503);
    const existing = (await readdir(this.root)).filter((name) =>
      /^baseline-[a-f0-9-]+\.bundle$/.test(name),
    ).length;
    if (this.baselineFiles.size >= 20 || existing >= 20)
      throw new ServixDeploymentError("connector-bundle-capacity", 503);
    const file = join(this.root, "baseline-" + randomUUID() + ".bundle");
    this.baselineFiles.add(file);
    await git.exportBundle(file, heads);
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 256 * 1024 * 1024)
      throw new ServixDeploymentError("connector-bundle-capacity", 413);
    return file;
  }
  async seed(credential: string, head: string, bytes: Buffer) {
    return this.serial(async () => {
      const device = await this.checkCredential(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      const profile = await this.configured?.connectorProfile(device.profileId!);
      if (!profile || profile.archived || bytes.length < 32 || bytes.length > 64 * 1024 * 1024)
        throw new ServixDeploymentError("connector-seed-denied", 403);
      ServixHeadSchema.parse(head);
      const git = await this.configured!.git(device.profileId!);
      let current: string | undefined;
      try {
        current = await git.head();
      } catch (error) {
        if (!(error instanceof ServixDeploymentError) || error.code !== "repository-not-seeded")
          throw error;
      }
      if (current) {
        if (current === head) return { seeded: true };
        throw new ServixDeploymentError("repository-already-seeded");
      }
      const file = join(this.root, "seed-" + randomUUID() + ".bundle");
      await writeSeed(file, bytes);
      await git.seed(file, head);
      return { seeded: true };
    });
  }
  async releaseBaseline(file: string) {
    if (!this.baselineFiles.has(file))
      throw new ServixDeploymentError("connector-file-not-owned", 403);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw new ServixDeploymentError("connector-file-not-owned", 403);
    await unlink(file);
    this.baselineFiles.delete(file);
  }
  private serial<T>(fn: () => Promise<T>) {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new ServixDeploymentError("connector-storage-unavailable", 503);
  }
  private async read(name: string) {
    const file = join(this.root, name),
      s = await lstat(file);
    if (!s.isFile() || s.isSymbolicLink() || s.size > 16384)
      throw new ServixDeploymentError("connector-storage-unavailable", 503);
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  }
  private async save(name: string, value: unknown, fresh = false) {
    await this.directory();
    const file = join(this.root, name),
      tmp = fresh ? file : file + "." + randomUUID() + ".tmp",
      f = await open(tmp, "wx", 0o600);
    try {
      await f.writeFile(JSON.stringify(value));
      await f.sync();
    } finally {
      await f.close();
    }
    if (!fresh) await replaceDurableRecord(tmp, file);
  }
  private async permission(actor: string) {
    if (this.stopped) throw new ServixDeploymentError("connector-unavailable", 503);
    if (!(await this.allowed(actor)))
      throw new ServixDeploymentError("connector-access-denied", 403);
  }
  async list(actor: string) {
    await this.permission(actor);
    await this.directory();
    const names = (await readdir(this.root)).filter((n) => /^fc_[a-f0-9]{32}\.json$/.test(n));
    if (names.length > 1000) throw new ServixDeploymentError("connector-capacity", 503);
    const records = await Promise.all(
      names.map(async (n) => DeviceRecord.parse(await this.read(n))),
    );
    return records
      .filter((d) => d.userId === actor)
      .slice(0, 100)
      .map(({ credentialHash: _, ...d }) => {
        const liveSeen = this.heartbeats.get(d.deviceId);
        const lastSeenAt =
          liveSeen && (!d.lastSeenAt || Date.parse(liveSeen) > Date.parse(d.lastSeenAt))
            ? liveSeen
            : d.lastSeenAt;
        return ConnectorSchema.parse({
          ...d,
          folderPicker: this.folderPickers.has(d.deviceId),
          folderBrowser: this.folderBrowsers.has(d.deviceId),
          changeNotes: this.changeNoteDevices.has(d.deviceId),
          ...(this.folderSelection(d.deviceId)
            ? { folderSelection: this.folderSelection(d.deviceId) }
            : {}),
          ...(this.probes.has(d.deviceId) &&
          this.now().getTime() - this.probes.get(d.deviceId)!.at < 20000
            ? { source: this.probes.get(d.deviceId)!.value }
            : {}),
          lastSeenAt,
          online:
            d.status === "active" &&
            Date.parse(d.expiresAt) > this.now().getTime() &&
            lastSeenAt !== null &&
            this.now().getTime() - Date.parse(lastSeenAt) < 20000,
        });
      });
  }
  async pair(actor: string, input: unknown) {
    return this.serial(async () => {
      await this.permission(actor);
      const request = PairConnectorSchema.parse(input);
      if (request.mode === "system") {
        if (request.profileId)
          throw new ServixDeploymentError("connector-pairing-scope-invalid", 400);
        if ((await this.list(actor)).filter((d) => d.status === "active").length >= 10)
          throw new ServixDeploymentError("connector-device-limit");
        const deviceId = "fc_" + randomBytes(16).toString("hex"),
          credential = deviceId + "." + secret();
        const device = DeviceRecord.parse({
          version: 1,
          mode: "system",
          deviceId,
          userId: actor,
          workspaceId: "ws_server20",
          name: request.name,
          status: "active",
          createdAt: this.now().toISOString(),
          expiresAt: new Date(this.now().getTime() + 90 * 86400000).toISOString(),
          lastSeenAt: null,
          credentialHash: digest(credential),
        });
        await this.save(deviceId + ".json", device, true);
        return {
          version: 1,
          mode: "system" as const,
          deviceId,
          credential,
          expiresAt: device.expiresAt,
          profileId: undefined,
          repositoryId: undefined,
          repositoryOrigin: undefined,
          repositoryOrigins: undefined,
          sourceFolder: undefined,
          centralRepository: undefined,
        };
      }
      const profileId = request.profileId ?? "servix-development";
      await this.configured?.authorizeSource?.(actor, profileId);
      const profile = await this.profile(profileId);
      if (profile?.runner === "devsetu-platform")
        throw new ServixDeploymentError("platform-update-use-maintenance", 409);
      if (profile?.archived) throw new ServixDeploymentError("settings-project-archived");
      if (!profile && profileId !== "servix-development")
        throw new ServixDeploymentError("settings-profile-not-found", 404);
      if ((await this.list(actor)).filter((d) => d.status === "active").length >= 10)
        throw new ServixDeploymentError("connector-device-limit");
      const deviceId = "fc_" + randomBytes(16).toString("hex"),
        credential = deviceId + "." + secret();
      const device = DeviceRecord.parse({
        version: 1,
        deviceId,
        userId: actor,
        workspaceId: "ws_server20",
        repositoryId:
          profileId === "servix-development"
            ? SERVIX_REPOSITORY.id
            : profile && "centralRepository" in profile
              ? (profile.centralRepository as z.infer<typeof SourceBindingSchema>).id
              : "gitrepo_" + digest(profileId + "\n" + profile?.repositoryOrigin).slice(0, 32),
        profileId,
        name: request.name,
        status: "active",
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 90 * 86400000).toISOString(),
        lastSeenAt: null,
        credentialHash: digest(credential),
      });
      await this.save(deviceId + ".json", device, true);
      return {
        version: 1,
        deviceId,
        credential,
        expiresAt: device.expiresAt,
        repositoryId: device.repositoryId,
        profileId,
        sourceFolder: profile?.sourceFolder ?? "D:\\servixDev",
        repositoryOrigin:
          profileId === "servix-development" ? SERVIX_REPOSITORY.origin : profile?.repositoryOrigin,
        repositoryOrigins: profile ? repositoryOrigins(profile) : [SERVIX_REPOSITORY.origin],
        ...(profile && "centralRepository" in profile
          ? { centralRepository: profile.centralRepository }
          : {}),
      };
    });
  }
  async discoveryDevices(actor: string) {
    await this.permission(actor);
    if (actor !== "usr_windows_admin")
      return (await this.list(actor)).map((d) => ({ ...d, workspaceAuthorized: true }));
    await this.directory();
    const names = (await readdir(this.root)).filter((n) => /^fc_[a-f0-9]{32}\.json$/.test(n));
    if (names.length > 1000) throw new ServixDeploymentError("connector-capacity", 503);
    const records = await Promise.all(
      names.map(async (n) => DeviceRecord.parse(await this.read(n))),
    );
    const users = [...new Set(records.map((d) => d.userId))];
    const result = [];
    for (const user of users) {
      if (await this.allowed(user))
        result.push(...(await this.list(user)).map((d) => ({ ...d, workspaceAuthorized: true })));
      else
        for (const { credentialHash: _, ...device } of records.filter((d) => d.userId === user)) {
          result.push({
            ...ConnectorSchema.parse({ ...device, online: false }),
            workspaceAuthorized: false,
          });
        }
    }
    if (result.length > 100) throw new ServixDeploymentError("discovery-capacity", 503);
    return result;
  }
  private async authenticate(credential: string) {
    if (!/^fc_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(credential))
      throw new ServixDeploymentError("connector-authentication-required", 401);
    let d: z.infer<typeof DeviceRecord>;
    try {
      d = DeviceRecord.parse(await this.read(credential.slice(0, 35) + ".json"));
    } catch {
      throw new ServixDeploymentError("connector-authentication-required", 401);
    }
    if (
      d.status !== "active" ||
      !hashesMatch(credential, Buffer.from(d.credentialHash, "hex")) ||
      Date.parse(d.expiresAt) <= this.now().getTime()
    )
      throw new ServixDeploymentError("connector-authentication-required", 401);
    await this.permission(d.userId);
    return d;
  }
  async revoke(actor: string, id: string) {
    return this.serial(async () => {
      await this.permission(actor);
      ConnectorIdSchema.parse(id);
      const d = DeviceRecord.parse(await this.read(id + ".json"));
      if (d.userId !== actor && actor !== "usr_windows_admin")
        throw new ServixDeploymentError("connector-access-denied", 403);
      await this.save(id + ".json", { ...d, status: "revoked" });
      this.probes.delete(id);
      this.folderSelections.delete(id);
      this.folderPickers.delete(id);
      this.folderBrowsers.delete(id);
      return { revoked: true };
    });
  }
  async invite(actor: string, input: unknown) {
    return this.serial(async () => {
      await this.permission(actor);
      if (actor !== "usr_windows_admin")
        throw new ServixDeploymentError("connector-access-denied", 403);
      const body = InviteDeveloperSchema.parse(input),
        id = "fi_" + randomBytes(16).toString("hex"),
        code = id + "." + secret(),
        expiresAt = new Date(this.now().getTime() + 86400000).toISOString();
      await this.save(
        id + ".json",
        { ...body, createdBy: actor, credentialHash: digest(code), expiresAt, status: "pending" },
        true,
      );
      return { version: 1, code, username: body.username, expiresAt };
    });
  }
  async redeem(input: unknown) {
    return this.serial(async () => {
      const body = RedeemDeveloperSchema.parse(input);
      let invite: z.infer<typeof InviteRecord>;
      try {
        invite = InviteRecord.parse(await this.read(body.code.slice(0, 35) + ".json"));
      } catch {
        throw new ServixDeploymentError("invitation-invalid", 403);
      }
      if (
        invite.status !== "pending" ||
        !hashesMatch(body.code, Buffer.from(invite.credentialHash, "hex")) ||
        Date.parse(invite.expiresAt) <= this.now().getTime()
      )
        throw new ServixDeploymentError("invitation-invalid", 403);
      await this.permission(invite.createdBy);
      await this.save(body.code.slice(0, 35) + ".json", { ...invite, status: "consumed" });
      await this.createDeveloper(invite.username, body.password, invite.displayName);
      return { created: true, username: invite.username };
    });
  }
  async prepare(
    actor: string,
    deviceId: string,
    requestId: string,
    preservedPaths?: string[],
    changeDetails?: DeploymentChange,
  ) {
    await this.queueSource(actor, deviceId, requestId, preservedPaths, changeDetails);
    for (let i = 0; i < 1200; i++) {
      await delay(500);
      const current = await this.sourceResult(requestId);
      await this.permission(actor);
      if (current.status === "failed")
        throw new ServixDeploymentError(current.errorCode ?? "source-publication-failed");
      if (current.status === "published") return ServixHeadSchema.parse(current.sourceHead);
      if (Date.parse(current.expiresAt) <= this.now().getTime())
        throw new ServixDeploymentError("source-publication-expired");
    }
    throw new ServixDeploymentError("source-publication-expired");
  }
  async sourceResult(requestId: string) {
    ServixRequestIdSchema.parse(requestId);
    return JobSchema.parse(await this.read(requestId + ".source.json"));
  }
  async queueSource(
    actor: string,
    deviceId: string,
    requestId: string,
    preservedPaths?: string[],
    changeDetails?: DeploymentChange,
    profileId = "servix-development",
  ) {
    await this.permission(actor);
    ServixRequestIdSchema.parse(requestId);
    try {
      const existing = await this.sourceResult(requestId);
      if (
        existing.userId !== actor ||
        existing.deviceId !== deviceId ||
        JSON.stringify(existing.changeDetails) !== JSON.stringify(changeDetails) ||
        JSON.stringify(existing.preservedPaths) !== JSON.stringify(preservedPaths)
      )
        throw new ServixDeploymentError("connector-request-conflict");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const device = (await this.list(actor)).find((d) => d.deviceId === deviceId);
    if (
      !device?.online ||
      device.mode === "system" ||
      (device.profileId ?? "servix-development") !== profileId
    )
      throw new ServixDeploymentError("connector-offline");
    if (changeDetails && !this.changeNoteDevices.has(deviceId))
      throw new ServixDeploymentError("connector-update-required");
    const profile = await this.profile(profileId);
    if (profile) {
      if (profile.archived) throw new ServixDeploymentError("settings-project-archived");
      const source = await this.diagnostics(actor, deviceId);
      if (
        !source ||
        !matchesDeploymentRepository(profile, source) ||
        ["main", "master"].includes(source.branch)
      )
        throw new ServixDeploymentError("connector-source-test-required");
    }
    const job = JobSchema.parse({
      version: 1,
      requestId,
      deviceId,
      userId: actor,
      baseHead: await (await this.repository(profileId)).head(),
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + 10 * 60000).toISOString(),
      status: "queued",
      ...(preservedPaths ? { preservedPaths } : {}),
      ...(changeDetails ? { changeDetails } : {}),
    });
    await this.serial(async () => {
      const selection = this.folderSelection(deviceId);
      if (selection && ["queued", "choosing"].includes(selection.status))
        throw new ServixDeploymentError("connector-folder-selection-pending");
      await this.save(requestId + ".source.json", job, true);
    });
  }
  async claim(credential: string) {
    return this.serial(async () => {
      const device = await this.authenticate(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      await this.save(device.deviceId + ".json", {
        ...device,
        lastSeenAt: this.now().toISOString(),
      });
      const names = (await readdir(this.root)).filter((n) =>
        /^sd_[a-f0-9]{32}\.source\.json$/.test(n),
      );
      if (names.length > 1000) throw new ServixDeploymentError("connector-capacity", 503);
      for (const name of names) {
        const job = JobSchema.parse(await this.read(name));
        if (
          job.deviceId !== device.deviceId ||
          job.userId !== device.userId ||
          job.status !== "queued"
        )
          continue;
        if (job.changeDetails && !this.changeNoteDevices.has(device.deviceId))
          throw new ServixDeploymentError("connector-update-required");
        if (
          Date.parse(job.expiresAt) <= this.now().getTime() ||
          !(await this.active(job.requestId, job.userId, job.deviceId))
        ) {
          await this.save(name, {
            ...job,
            status: "failed",
            errorCode: "source-publication-expired",
          });
          continue;
        }
        await this.save(name, { ...job, status: "working" });
        return job;
      }
      return null;
    });
  }
  async complete(credential: string, id: string, head: string, bytes: Buffer) {
    return this.serial(async () => {
      const device = await this.authenticate(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      ServixRequestIdSchema.parse(id);
      ServixHeadSchema.parse(head);
      const job = JobSchema.parse(await this.read(id + ".source.json"));
      if (job.deviceId !== device.deviceId || job.userId !== device.userId)
        throw new ServixDeploymentError("connector-job-denied", 403);
      if (job.status === "published" && job.sourceHead === head) return { published: true };
      if (!(await this.active(job.requestId, job.userId, job.deviceId)))
        throw new ServixDeploymentError("connector-job-expired");
      if (job.status !== "working" || Date.parse(job.expiresAt) <= this.now().getTime())
        throw new ServixDeploymentError("connector-job-expired");
      if (bytes.length < 32 || bytes.length > 64 * 1024 * 1024)
        throw new ServixDeploymentError("connector-bundle-capacity", 413);
      const file = join(this.root, id + ".bundle"),
        f = await open(file, "wx", 0o600);
      try {
        await f.writeFile(bytes);
        await f.sync();
      } finally {
        await f.close();
      }
      await (await this.repository(device.profileId ?? "servix-development")).importBundle(
        file,
        job.baseHead,
        head,
      );
      await this.save(id + ".source.json", { ...job, status: "published", sourceHead: head });
      return { published: true };
    });
  }
  async fail(credential: string, id: string, input: unknown) {
    return this.serial(async () => {
      const device = await this.authenticate(credential);
      if (device.mode === "system")
        throw new ServixDeploymentError("connector-project-binding-required", 403);
      ServixRequestIdSchema.parse(id);
      const body = z
          .object({
            errorCode: z.enum([
              "local-git-failed",
              "source-behind-or-conflicting",
              "local-request-interrupted",
              "bundle-upload-failed",
              "protected-source-file-staged",
            ]),
          })
          .strict()
          .parse(input),
        job = JobSchema.parse(await this.read(id + ".source.json"));
      if (
        job.deviceId !== device.deviceId ||
        job.userId !== device.userId ||
        job.status !== "working"
      )
        throw new ServixDeploymentError("connector-job-denied", 403);
      await this.save(id + ".source.json", { ...job, status: "failed", errorCode: body.errorCode });
      return { failed: true };
    });
  }
}
