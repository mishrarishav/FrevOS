import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  DeviceLoginChallengeSchema,
  DeviceLoginCompletionSchema,
  DeviceLoginProofSchema,
  ConnectorIdSchema,
  SessionIdSchema,
  UserIdSchema,
  type SessionContext,
} from "@frevos/contracts";
import { z } from "zod";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import type { IdentityPrincipal } from "./repositories.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const matches = (value: string, expected: string) =>
  timingSafeEqual(Buffer.from(hash(value), "hex"), Buffer.from(expected, "hex"));
const Binding = z
  .object({
    version: z.literal(1),
    workspaceId: z.string(),
    sessionId: SessionIdSchema,
    userId: UserIdSchema,
    deviceId: ConnectorIdSchema,
    expiresAt: z.iso.datetime(),
    verifiedAt: z.iso.datetime(),
  })
  .strict();
type Pending = {
  principal: IdentityPrincipal;
  browserHash: string;
  expires: number;
  deviceId?: string;
  proofHash?: string;
  verifiedAt?: string;
  receiverHash?: string;
};

// Credentials remain at the connector boundary. Browser transactions and local
// connector attestations have different, single-use purposes and never grant roles.
export class DeviceLogins {
  private readonly pending = new Map<string, Pending>();
  constructor(
    private readonly root: string,
    private readonly workspaceId: string,
    private readonly connectors: Pick<DeveloperConnectorStore, "list" | "checkCredential">,
    private readonly administrator: (actor: string) => Promise<boolean>,
    private readonly now = () => new Date(),
    private readonly credentialVersion: (
      principal: IdentityPrincipal,
    ) => Promise<string | null> = async (principal) => principal.credentialVersion ?? null,
    private readonly method: "loopback-fetch" | "connector-page" = "loopback-fetch",
  ) {}
  async begin(principal: IdentityPrincipal, browserState: string) {
    if (await this.administrator(principal.userId)) return null;
    if (
      !principal.credentialVersion ||
      (await this.credentialVersion(principal)) !== principal.credentialVersion
    )
      throw new ServixDeploymentError("invalid-credentials", 401);
    const devices = (await this.connectors.list(principal.userId)).filter(
      (d) =>
        d.mode === "system" &&
        d.status === "active" &&
        Date.parse(d.expiresAt) > this.now().getTime(),
    );
    if (!devices.length) throw new ServixDeploymentError("paired-system-required", 403);
    const ports = [
      ...new Set(devices.filter((d) => d.online && d.loginProofPort).map((d) => d.loginProofPort!)),
    ];
    if (!ports.length) throw new ServixDeploymentError("paired-system-connector-required", 403);
    for (const [id, p] of this.pending)
      if (p.expires <= this.now().getTime()) this.pending.delete(id);
    if (
      this.pending.size >= 128 ||
      [...this.pending.values()].filter((p) => p.principal.userId === principal.userId).length >= 4
    )
      throw new ServixDeploymentError("device-login-capacity", 429);
    const id = "dl_" + randomBytes(32).toString("hex"),
      expires = this.now().getTime() + 120000;
    this.pending.set(id, { principal, browserHash: hash(browserState), expires });
    return DeviceLoginChallengeSchema.parse({
      status: "device-verification-required",
      challengeId: id,
      ports,
      expiresAt: new Date(expires).toISOString(),
      ...(this.method === "connector-page"
        ? {
            method: this.method,
            devices: ports.map((port) => ({
              port,
              name: devices.find((device) => device.loginProofPort === port)!.name,
            })),
          }
        : {}),
    });
  }
  async attest(credential: string, input: unknown) {
    const { challengeId } = DeviceLoginProofSchema.parse(input);
    const device = await this.connectors.checkCredential(credential),
      pending = this.pending.get(challengeId);
    if (
      !pending ||
      pending.expires <= this.now().getTime() ||
      pending.proofHash ||
      device.mode !== "system" ||
      device.userId !== pending.principal.userId ||
      device.workspaceId !== this.workspaceId
    )
      throw new ServixDeploymentError("device-login-proof-denied", 403);
    const proof = randomBytes(32).toString("hex");
    pending.deviceId = device.deviceId;
    pending.proofHash = hash(proof);
    pending.verifiedAt = this.now().toISOString();
    return { version: 1 as const, challengeId, proof };
  }
  async consume(input: unknown, browserState: string) {
    const body = DeviceLoginCompletionSchema.parse(input),
      pending = this.pending.get(body.challengeId);
    if (
      !pending ||
      pending.expires <= this.now().getTime() ||
      !pending.deviceId ||
      !pending.proofHash ||
      !matches(browserState, pending.browserHash) ||
      !matches(body.proof, pending.proofHash)
    )
      throw new ServixDeploymentError("device-login-proof-denied", 403);
    this.pending.delete(body.challengeId);
    await this.device(pending.principal.userId, pending.deviceId);
    if ((await this.credentialVersion(pending.principal)) !== pending.principal.credentialVersion)
      throw new ServixDeploymentError("invalid-credentials", 401);
    return {
      principal: pending.principal,
      deviceId: pending.deviceId,
      verifiedAt: pending.verifiedAt!,
    };
  }
  async receive(input: unknown, origin: string) {
    const body = DeviceLoginCompletionSchema.parse(input),
      pending = this.pending.get(body.challengeId);
    if (
      this.method !== "connector-page" ||
      !pending ||
      pending.expires <= this.now().getTime() ||
      !pending.deviceId ||
      !pending.proofHash ||
      pending.receiverHash ||
      !matches(body.proof, pending.proofHash)
    )
      throw new ServixDeploymentError("device-login-proof-denied", 403);
    const device = await this.device(pending.principal.userId, pending.deviceId),
      url = new URL(origin);
    if (
      url.origin !== origin ||
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !device.loginProofPort ||
      Number(url.port) !== device.loginProofPort
    )
      throw new ServixDeploymentError("device-login-proof-denied", 403);
    const secret = randomBytes(32).toString("hex");
    // Recheck after awaits so concurrent receipts cannot mint two receiver cookies.
    if (pending.receiverHash) throw new ServixDeploymentError("device-login-proof-denied", 403);
    pending.receiverHash = hash(secret);
    return body.challengeId + "." + secret;
  }
  async finish(browserState: string, receiver: string) {
    if (!/^dl_[a-f0-9]{64}\.[a-f0-9]{64}$/.test(receiver))
      throw new ServixDeploymentError("device-login-proof-denied", 403);
    const [id, secret] = receiver.split("."),
      pending = this.pending.get(id!);
    if (
      !pending ||
      pending.expires <= this.now().getTime() ||
      !pending.deviceId ||
      !pending.receiverHash ||
      !matches(browserState, pending.browserHash) ||
      !matches(secret!, pending.receiverHash)
    )
      throw new ServixDeploymentError("device-login-proof-denied", 403);
    this.pending.delete(id!);
    await this.device(pending.principal.userId, pending.deviceId);
    if ((await this.credentialVersion(pending.principal)) !== pending.principal.credentialVersion)
      throw new ServixDeploymentError("invalid-credentials", 401);
    return {
      principal: pending.principal,
      deviceId: pending.deviceId,
      verifiedAt: pending.verifiedAt!,
    };
  }
  private async device(actor: string, id: string) {
    const device = (await this.connectors.list(actor)).find(
      (d) =>
        d.deviceId === id &&
        d.mode === "system" &&
        d.status === "active" &&
        Date.parse(d.expiresAt) > this.now().getTime(),
    );
    if (!device) throw new ServixDeploymentError("paired-system-login-required", 401);
    return device;
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new ServixDeploymentError("device-login-storage-unavailable", 503);
  }
  async bind(session: SessionContext, deviceId: string, verifiedAt: string) {
    await this.device(session.userId, deviceId);
    await this.directory();
    const files = (await readdir(this.root)).filter((name) =>
      /^ses_[A-Za-z0-9_-]+\.json$/.test(name),
    );
    if (files.length >= 1000) {
      for (const name of files) {
        const file = join(this.root, name),
          info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4096)
          throw new ServixDeploymentError("device-login-storage-unavailable", 503);
        const old = Binding.parse(JSON.parse(await readFile(file, "utf8")));
        if (Date.parse(old.expiresAt) <= this.now().getTime()) await unlink(file);
      }
      if ((await readdir(this.root)).filter((name) => name.endsWith(".json")).length >= 1000)
        throw new ServixDeploymentError("device-login-capacity", 503);
    }
    const record = Binding.parse({
      version: 1,
      workspaceId: this.workspaceId,
      sessionId: session.sessionId,
      userId: session.userId,
      deviceId,
      expiresAt: session.expiresAt,
      verifiedAt,
    });
    const file = await open(join(this.root, record.sessionId + ".json"), "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(record));
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async authorizeSession(session: SessionContext) {
    if (await this.administrator(session.userId)) return;
    await this.directory();
    const file = join(this.root, SessionIdSchema.parse(session.sessionId) + ".json");
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw Error();
      const binding = Binding.parse(JSON.parse(await readFile(file, "utf8")));
      if (
        binding.userId !== session.userId ||
        binding.workspaceId !== this.workspaceId ||
        binding.sessionId !== session.sessionId ||
        Date.parse(binding.expiresAt) <= this.now().getTime()
      )
        throw Error();
      await this.device(session.userId, binding.deviceId);
    } catch {
      throw new ServixDeploymentError("paired-system-login-required", 401);
    }
  }
}
