import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  JoinCodeSchema,
  JoinDecisionSchema,
  JoinRedemptionSchema,
  JoinRequestInputSchema,
  JoinRequestSchema,
  UserIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import { hashLocalPassword } from "./passwords.js";
import type { IdentityPrincipal, IdentitySessionRepository } from "./repositories.js";
import { ServixDeploymentError } from "./servix-deployment.js";
import type { SystemDiscovery } from "./system-discovery.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const equal = (value: string, expected: string) =>
  timingSafeEqual(Buffer.from(hash(value), "hex"), Buffer.from(expected, "hex"));
const Credential = z
  .object({ salt: z.string().regex(/^[a-f0-9]{32}$/), hash: z.string().regex(/^[a-f0-9]{128}$/) })
  .strict();
const RecordSchema = JoinRequestSchema.extend({
  workspaceId: z.string(),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  requesterHash: z.string().regex(/^[a-f0-9]{64}$/),
  credentialReference: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  credentialVersion: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  identityId: z.string().optional(),
  redemption: z
    .object({ credentialHash: z.string(), pollHash: z.string(), name: z.string() })
    .strict()
    .optional(),
}).strict();
type Record = z.infer<typeof RecordSchema>;
function target(record: Record) {
  const {
    id,
    workspaceId,
    mode,
    username,
    displayName,
    platform,
    deviceId,
    fileActivity,
    ownerUserId,
    codeHash,
    credentialReference,
    credentialVersion,
    identityId,
    createdAt,
    expiresAt,
  } = record;
  return {
    id,
    workspaceId,
    mode,
    username,
    displayName,
    platform,
    deviceId,
    fileActivity,
    ownerUserId,
    codeHash,
    credentialReference,
    credentialVersion,
    identityId,
    createdAt,
    expiresAt,
  };
}
const digest = (record: Record) => hash(JSON.stringify(target(record)));
export class JoinRequests {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly rates = new Map<string, { at: number; count: number }>();
  constructor(
    private readonly root: string,
    readonly workspaceId: string,
    private readonly identities: IdentitySessionRepository,
    private readonly connectors: DeveloperConnectorStore,
    private readonly discovery: SystemDiscovery,
    private readonly administrator: (actor: string) => Promise<boolean>,
    private readonly now = () => new Date(),
  ) {}
  private serial<T>(action: () => Promise<T>) {
    const next = this.chain.then(action);
    this.chain = next.catch(() => {});
    return next;
  }
  rate(key: string, max = 15) {
    for (const [id, r] of this.rates)
      if (this.now().getTime() - r.at > 600000) this.rates.delete(id);
    if (this.rates.size > 1000) throw new ServixDeploymentError("join-capacity", 503);
    const r = this.rates.get(key) ?? { at: this.now().getTime(), count: 0 };
    this.rates.set(key, r);
    if (++r.count > max) throw new ServixDeploymentError("join-rate-limited", 429);
  }
  private async directory() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new ServixDeploymentError("join-storage-unavailable", 503);
  }
  private async read(name: string) {
    await this.directory();
    const file = join(this.root, name),
      info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768)
      throw new ServixDeploymentError("join-storage-unavailable", 503);
    return JSON.parse(await readFile(file, "utf8"));
  }
  private async save(name: string, value: unknown, fresh = false) {
    await this.directory();
    const path = join(this.root, name),
      temporary = fresh ? path : path + "." + randomBytes(12).toString("hex") + ".tmp",
      file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    if (!fresh) await replaceDurableRecord(temporary, path);
  }
  private validate(value: unknown) {
    const record = RecordSchema.parse(value);
    if (record.workspaceId !== this.workspaceId || digest(record) !== record.digest)
      throw new ServixDeploymentError("join-scope-changed", 503);
    return record;
  }
  private safe(record: Record) {
    const value = { ...record, status: this.expired(record) ? "expired" : record.status };
    const {
      password: _password,
      codeHash: _code,
      requesterHash: _requester,
      workspaceId: _workspace,
      credentialReference: _credential,
      credentialVersion: _version,
      identityId: _identity,
      redemption: _redemption,
      ...safe
    } = value as typeof value & { password?: never };
    return JoinRequestSchema.parse(safe);
  }
  private expired(record: Record) {
    if (record.status === "paired" || record.status === "rejected") return false;
    return (
      Date.parse(
        record.status === "pending" ? record.expiresAt : (record.approvedUntil ?? record.expiresAt),
      ) <= this.now().getTime()
    );
  }
  private async records() {
    await this.directory();
    const names = (await readdir(this.root)).filter((name) => /^jr_[a-f0-9]{32}\.json$/.test(name));
    if (names.length > 500) throw new ServixDeploymentError("join-capacity", 503);
    return Promise.all(names.map(async (name) => this.validate(await this.read(name))));
  }
  private async admin(actor: string) {
    if (!(await this.administrator(actor)))
      throw new ServixDeploymentError("join-admin-required", 403);
  }
  private async evidence(
    name: string,
    expected: { [key: string]: string | number | boolean },
    stamp: string,
  ) {
    try {
      const prior = await this.read(name);
      if (
        Object.entries(expected).some(([key, value]) => prior[key] !== value) ||
        !Number.isFinite(Date.parse(prior[stamp]))
      )
        throw new ServixDeploymentError("join-audit-changed", 503);
      return prior;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const value = { ...expected, [stamp]: this.now().toISOString() };
      await this.save(name, value, true);
      return value;
    }
  }
  async request(input: unknown) {
    const body = JoinRequestInputSchema.parse(input);
    if (body.platform === "android" && body.fileActivity)
      throw new ServixDeploymentError("android-monitoring-only", 400);
    return this.serial(async () => {
      if ((await this.records()).length >= 500)
        throw new ServixDeploymentError("join-capacity", 503);
      let principal: IdentityPrincipal | null = null,
        credentialReference: string | undefined;
      const id = "jr_" + randomBytes(16).toString("hex"),
        secret = randomBytes(32).toString("base64url");
      if (body.mode === "existing") {
        principal = await this.identities.authenticateLocalCredential({
          username: body.username,
          password: body.password,
          now: this.now(),
        });
        if (!principal) throw new ServixDeploymentError("invalid-credentials", 401);
        await this.connectors.list(principal.userId);
      } else {
        const prepared = await hashLocalPassword(body.password),
          value = { salt: prepared.salt.toString("hex"), hash: prepared.hash.toString("hex") };
        credentialReference = hash(JSON.stringify(value));
        await this.save(id + ".credential.json", value, true);
      }
      const { password: _, ...data } = body;
      const draft = {
        ...data,
        id,
        workspaceId: this.workspaceId,
        ownerUserId:
          principal?.userId ?? UserIdSchema.parse("usr_" + randomBytes(16).toString("hex")),
        requesterHash: hash(secret),
        status: "pending" as const,
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 86400000).toISOString(),
        ...(credentialReference ? { credentialReference } : {}),
        ...(principal
          ? {
              credentialVersion: principal.credentialVersion,
              identityId: principal.identity.identityId,
            }
          : {}),
        digest: "0".repeat(64),
      };
      const record = RecordSchema.parse(draft);
      record.digest = digest(record);
      await this.save(id + ".json", record, true);
      return { record: this.safe(record), requester: id + "." + secret };
    });
  }
  async status(requester: string) {
    if (!/^jr_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(requester))
      throw new ServixDeploymentError("join-request-unavailable", 401);
    const [id, secret] = requester.split(".");
    let record: Record;
    try {
      record = this.validate(await this.read(id + ".json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new ServixDeploymentError("join-request-unavailable", 401);
      throw error;
    }
    if (!equal(secret!, record.requesterHash))
      throw new ServixDeploymentError("join-request-unavailable", 401);
    return this.safe(record);
  }
  async list(actor: string) {
    await this.admin(actor);
    return (await this.records())
      .map((record) => this.safe(record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async credentialCurrent(record: Record) {
    if (record.mode !== "existing") return;
    const value = await this.identities.localCredentialVersion({
      userId: record.ownerUserId,
      identity: { identityId: record.identityId! },
    });
    if (!record.credentialVersion || value !== record.credentialVersion)
      throw new ServixDeploymentError("join-account-changed", 409);
  }
  async decide(actor: string, input: unknown) {
    const body = JoinDecisionSchema.parse(input);
    return this.serial(async () => {
      await this.admin(actor);
      const record = this.validate(await this.read(body.requestId + ".json"));
      if (
        record.digest !== body.digest ||
        this.expired(record) ||
        !["pending", "approving"].includes(record.status)
      )
        throw new ServixDeploymentError("join-expired-or-decided", 409);
      if (record.approvedBy && record.approvedBy !== actor)
        throw new ServixDeploymentError("join-approver-changed", 403);
      if (body.decision === "reject") {
        if (record.status !== "pending")
          throw new ServixDeploymentError("join-already-consumed", 409);
        record.status = "rejected";
        record.approvedBy = UserIdSchema.parse(actor);
        await this.save(record.id + ".json", record);
        return this.safe(record);
      }
      if (record.status === "pending") {
        const approval = {
          version: 1,
          action: "join:approve",
          actor,
          workspaceId: this.workspaceId,
          requestId: record.id,
          userId: record.ownerUserId,
          deviceId: record.deviceId,
          digest: record.digest,
          issuedAt: this.now().toISOString(),
          expiresAt: new Date(this.now().getTime() + 300000).toISOString(),
          singleUse: true,
        };
        await this.save(record.id + ".approval.json", approval, true);
        record.status = "approving";
        record.approvedBy = UserIdSchema.parse(actor);
        record.approvedUntil = new Date(this.now().getTime() + 900000).toISOString();
        await this.save(record.id + ".json", record);
      }
      const approval = await this.read(record.id + ".approval.json");
      if (
        approval.actor !== actor ||
        approval.workspaceId !== this.workspaceId ||
        approval.digest !== record.digest ||
        approval.deviceId !== record.deviceId ||
        approval.userId !== record.ownerUserId ||
        approval.version !== 1 ||
        approval.action !== "join:approve" ||
        approval.requestId !== record.id ||
        approval.singleUse !== true ||
        !Number.isFinite(Date.parse(approval.issuedAt)) ||
        !Number.isFinite(Date.parse(approval.expiresAt)) ||
        Date.parse(approval.issuedAt) > this.now().getTime() ||
        Date.parse(approval.expiresAt) <= Date.parse(approval.issuedAt) ||
        Date.parse(approval.expiresAt) - Date.parse(approval.issuedAt) > 300000 ||
        Date.parse(approval.expiresAt) <= this.now().getTime()
      )
        throw new ServixDeploymentError("join-approval-invalid", 403);
      await this.admin(actor);
      await this.credentialCurrent(record);
      const consumed = await this.evidence(record.id + ".consumed.json", approval, "consumedAt");
      if (
        Date.parse(consumed.consumedAt) < Date.parse(approval.issuedAt) ||
        Date.parse(consumed.consumedAt) > Date.parse(approval.expiresAt)
      )
        throw new ServixDeploymentError("join-approval-invalid", 403);
      if (record.mode === "new") {
        const credential = Credential.parse(await this.read(record.id + ".credential.json"));
        if (hash(JSON.stringify(credential)) !== record.credentialReference)
          throw new ServixDeploymentError("join-credential-changed", 503);
        try {
          await this.identities.provisionLocalCredential(
            {
              username: record.username,
              password: "",
              displayName: record.displayName,
              userId: record.ownerUserId,
              requireNew: true,
              developerWorkspaceId: this.workspaceId,
              now: this.now(),
            },
            {
              salt: Buffer.from(credential.salt, "hex"),
              hash: Buffer.from(credential.hash, "hex"),
            },
          );
        } catch (error) {
          if (error instanceof Error && error.message === "Local account already exists")
            throw new ServixDeploymentError("join-username-already-exists", 409);
          throw error;
        }
      }
      await this.evidence(record.id + ".approved.json", consumed, "completedAt");
      record.status = "approved";
      await this.save(record.id + ".json", record);
      return this.safe(record);
    });
  }
  private async approved(code: string) {
    const record = (await this.records()).find((record) => equal(code, record.codeHash));
    if (
      !record ||
      Date.parse(record.approvedUntil ?? record.expiresAt) <= this.now().getTime() ||
      !["approved", "redeeming", "paired"].includes(record.status)
    )
      throw new ServixDeploymentError("join-code-unavailable", 403);
    const approval = await this.read(record.id + ".approved.json");
    if (
      approval.digest !== record.digest ||
      approval.version !== 1 ||
      approval.action !== "join:approve" ||
      approval.workspaceId !== this.workspaceId ||
      approval.requestId !== record.id ||
      approval.singleUse !== true ||
      approval.deviceId !== record.deviceId ||
      approval.userId !== record.ownerUserId ||
      approval.actor !== record.approvedBy ||
      !Number.isFinite(Date.parse(approval.consumedAt)) ||
      !Number.isFinite(Date.parse(approval.issuedAt)) ||
      !Number.isFinite(Date.parse(approval.expiresAt)) ||
      Date.parse(approval.consumedAt) < Date.parse(approval.issuedAt) ||
      Date.parse(approval.consumedAt) > this.now().getTime() ||
      Date.parse(approval.expiresAt) - Date.parse(approval.issuedAt) > 300000 ||
      Date.parse(approval.expiresAt) <= Date.parse(approval.issuedAt) ||
      Date.parse(approval.consumedAt) > Date.parse(approval.expiresAt)
    )
      throw new ServixDeploymentError("join-approval-invalid", 403);
    await this.credentialCurrent(record);
    await this.admin(record.approvedBy!);
    return record;
  }
  async prepare(input: unknown) {
    const body = JoinCodeSchema.parse(input),
      record = await this.approved(body.code);
    if (record.status === "paired") throw new ServixDeploymentError("join-code-consumed", 409);
    return {
      version: 1,
      deviceId: record.deviceId,
      platform: record.platform,
      ownerUsername: record.username,
      fileActivity: record.fileActivity,
      expiresAt: record.approvedUntil,
    };
  }
  async redeem(input: unknown) {
    const body = JoinRedemptionSchema.parse(input);
    if (
      (body.platform !== "android" && body.architecture !== "x64") ||
      (body.platform === "android" && body.fileActivity)
    )
      throw new ServixDeploymentError("join-redemption-scope-denied", 403);
    return this.serial(async () => {
      const record = await this.approved(body.code);
      if (
        body.deviceId !== record.deviceId ||
        body.platform !== record.platform ||
        body.fileActivity !== record.fileActivity ||
        body.credentialHash === body.pollHash
      )
        throw new ServixDeploymentError("join-redemption-scope-denied", 403);
      const binding = {
        credentialHash: body.credentialHash,
        pollHash: body.pollHash,
        name: body.name,
      };
      if (record.redemption && JSON.stringify(record.redemption) !== JSON.stringify(binding))
        throw new ServixDeploymentError("join-code-consumed", 409);
      await this.evidence(
        record.id + ".redemption.json",
        {
          version: 1,
          action: "connector:pair:system",
          actor: record.approvedBy!,
          ownerUserId: record.ownerUserId,
          workspaceId: this.workspaceId,
          deviceId: record.deviceId,
          digest: record.digest,
          credentialBindingSha256: hash(JSON.stringify(binding)),
        },
        "consumedAt",
      );
      if (record.status === "approved") {
        record.redemption = binding;
        record.status = "redeeming";
        await this.save(record.id + ".json", record);
      }
      await this.connectors.acceptSystemEnrollment(record.ownerUserId, {
        version: 1,
        deviceId: record.deviceId,
        name: body.name,
        platform: body.platform,
        architecture: body.architecture,
        fileActivity: body.fileActivity,
        credentialHash: body.credentialHash,
        pollHash: body.pollHash,
        codeHash: record.codeHash,
      });
      if (
        record.fileActivity &&
        !(await this.discovery.state(record.ownerUserId)).systems.find(
          (system) => system.deviceId === record.deviceId,
        )?.policy
      ) {
        const { defaultDiscoveryPolicy } = await import("@frevos/contracts");
        await this.discovery.configure(
          record.ownerUserId,
          {
            version: 1,
            deviceId: record.deviceId,
            expectedRevision: 0,
            policy: { ...defaultDiscoveryPolicy, enabled: true },
          },
          record.approvedBy,
        );
      }
      record.status = "paired";
      await this.save(record.id + ".json", record);
      return {
        version: 1,
        deviceId: record.deviceId,
        ownerUserId: record.ownerUserId,
        status: "paired",
      };
    });
  }
}
