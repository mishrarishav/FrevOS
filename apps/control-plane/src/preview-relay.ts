import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { lstat, mkdir, open, readFile, readdir } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, dirname } from "node:path";
import {
  PreviewJobSchema,
  PreviewResultSchema,
  type PreviewJob,
  type PreviewResult,
  PreviewOpenSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import type { LocalDevelopment } from "./local-development.js";
import { ServixDeploymentError } from "./servix-deployment.js";

function fail(code: string, status = 403): never {
  throw new ServixDeploymentError("preview-" + code, status);
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const PreviewConfigSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    listen: z.object({ host: z.string(), port: z.number().int().min(1024).max(65535) }).strict(),
    targets: z
      .array(
        PreviewOpenSchema.extend({
          profileId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
          origin: z.url(),
        }),
      )
      .min(1)
      .max(32),
    timeoutMs: z.number().int().min(1000).max(30000).default(15000),
    sessionSeconds: z.number().int().min(60).max(1800).default(900),
    maxRequestBytes: z.number().int().min(1024).max(2_097_152).default(1_048_576),
    maxResponseBytes: z.number().int().min(1024).max(16_777_216).default(8_388_608),
    maxPending: z.number().int().min(1).max(128).default(32),
  })
  .strict();
export type PreviewConfig = z.infer<typeof PreviewConfigSchema>;
export function privateAddress(value: string): boolean {
  const address = value.replace(/^::ffff:/, "");
  if (address === "::1") return true;
  const octets = address.split(".").map(Number);
  return (
    /^\d+\.\d+\.\d+\.\d+$/.test(address) &&
    octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
      (octets[0] === 192 && octets[1] === 168))
  );
}
export async function validatePreviewConfig(
  input: unknown,
  portal: string,
  resolve = lookup,
): Promise<PreviewConfig> {
  const config = PreviewConfigSchema.parse(input),
    control = new URL(portal),
    hosts = new Set<string>();
  if (!privateAddress(config.listen.host)) fail("private-listener-required");
  for (const target of config.targets) {
    const url = new URL(target.origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== target.origin ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.hostname === control.hostname ||
      url.hostname.endsWith("." + control.hostname) ||
      control.hostname.endsWith("." + url.hostname) ||
      hosts.has(url.hostname)
    )
      fail("isolated-origin-required");
    const addresses = await resolve(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
    if (!addresses.length || addresses.some((a) => !privateAddress(a.address)))
      fail("private-origin-required");
    hosts.add(url.hostname);
  }
  return config;
}
export async function loadPreviewConfig(file: string, portal: string) {
  try {
    const parent = await lstat(dirname(file));
    if (!parent.isDirectory() || parent.isSymbolicLink()) fail("configuration-unavailable", 503);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32768)
    fail("configuration-unavailable", 503);
  return validatePreviewConfig(JSON.parse(await readFile(file, "utf8")), portal);
}
const forbidden =
  /^(?:connection|keep-alive|proxy-.*|te|trailer|transfer-encoding|upgrade|host|content-length|forwarded|x-forwarded-.*|sec-.*|x-csrf-token|x-devsetu-.*)$/i;
const reservedCookie = /^(?:__Host-)?(?:frevos|devsetu)[-_]/i;
function headers(input: [string, string][], response = false): [string, string][] {
  const nominated = new Set(
    input
      .filter(([k]) => k.toLowerCase() === "connection")
      .flatMap(([, v]) =>
        v
          .toLowerCase()
          .split(",")
          .map((v) => v.trim()),
      ),
  );
  return input
    .filter(
      ([key]) =>
        !forbidden.test(key) &&
        !nominated.has(key.toLowerCase()) &&
        !(response && /^(?:access-control-.*|clear-site-data|service-worker-allowed)$/i.test(key)),
    )
    .flatMap(([key, value]) => {
      if (key.toLowerCase() === "cookie")
        return [
          [
            key,
            value
              .split(";")
              .filter((p) => !reservedCookie.test(p.trim().split("=")[0]!))
              .join(";"),
          ],
        ];
      if (key.toLowerCase() === "set-cookie") {
        if (reservedCookie.test(value.split("=")[0]!)) return [];
        value = value.replace(/;\s*Domain=[^;]*/gi, "");
      }
      return [[key, value] as [string, string]];
    });
}
type Lease = {
  actor: string;
  deviceId: string;
  serviceId: string;
  origin: string;
  revision: number;
  fingerprint: string;
  profileId: string;
  expires: number;
  ticketHash?: string;
  cookieHash?: string;
  authorize: () => Promise<void>;
};
type Pending = {
  lease: Lease;
  job: PreviewJob;
  claimed: boolean;
  finish: (result?: PreviewResult) => void;
};
export class PreviewRelay {
  readonly server = createServer((request, response) => {
    void this.handle(request, response);
  });
  private leases = new Map<string, Lease>();
  private pending = new Map<string, Pending>();
  private polling = new Set<string>();
  private closed = false;
  private issuing = new Set<string>();
  constructor(
    readonly config: PreviewConfig,
    private portal: string,
    private auditRoot: string,
    private local: LocalDevelopment,
    private connectors: DeveloperConnectorStore,
    private now = () => Date.now(),
  ) {
    this.server.requestTimeout = config.timeoutMs + 5000;
    this.server.headersTimeout = 10000;
    this.server.keepAliveTimeout = 5000;
    this.server.maxHeadersCount = 100;
    this.server.maxConnections = Math.max(16, config.maxPending * 2);
    this.server.setTimeout(config.timeoutMs + 5000);
    this.server.on("upgrade", (_request, socket) => {
      socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
    });
  }
  private async audit(lease: Lease, operation: string) {
    await mkdir(this.auditRoot, { recursive: true });
    if ((await lstat(this.auditRoot)).isSymbolicLink()) fail("audit-unavailable", 503);
    if ((await readdir(this.auditRoot)).length >= 10000) fail("audit-capacity", 503);
    const file = await open(
      join(this.auditRoot, randomBytes(16).toString("hex") + ".json"),
      "wx",
      0o600,
    );
    try {
      await file.writeFile(
        JSON.stringify({
          version: 1,
          workspaceId: this.config.workspaceId,
          actor: lease.actor,
          deviceId: lease.deviceId,
          profileId: lease.profileId,
          serviceId: lease.serviceId,
          operation,
          at: new Date(this.now()).toISOString(),
        }),
      );
      await file.sync();
    } finally {
      await file.close();
    }
  }
  private async check(lease: Lease) {
    if (this.closed || lease.expires <= this.now()) fail("session-expired", 401);
    await lease.authorize();
    const target = await this.local.previewTarget(
      lease.actor,
      this.config.workspaceId,
      lease.deviceId,
      lease.serviceId,
    );
    if (
      target.snapshot.revision !== lease.revision ||
      target.snapshot.fingerprint !== lease.fingerprint ||
      target.snapshot.profileId !== lease.profileId
    )
      fail("configuration-changed", 409);
    return target;
  }
  async open(actor: string, workspaceId: string, input: unknown, authorize: () => Promise<void>) {
    if (workspaceId !== this.config.workspaceId || this.closed) fail("workspace-denied");
    const request = PreviewOpenSchema.parse(input);
    await authorize();
    const target = await this.local.previewTarget(
      actor,
      workspaceId,
      request.deviceId,
      request.serviceId,
    );
    const configured = this.config.targets.find(
      (t) =>
        t.deviceId === request.deviceId &&
        t.serviceId === request.serviceId &&
        t.profileId === target.snapshot.profileId,
    );
    if (!configured) fail("origin-not-configured", 503);
    const old = this.leases.get(configured.origin);
    if ((old && old.expires > this.now()) || this.issuing.has(configured.origin))
      fail("already-open-close-or-expire", 409);
    const ticket = randomBytes(32).toString("hex"),
      lease: Lease = {
        ...request,
        actor,
        profileId: target.snapshot.profileId,
        origin: configured.origin,
        revision: target.snapshot.revision,
        fingerprint: target.snapshot.fingerprint,
        expires: this.now() + this.config.sessionSeconds * 1000,
        ticketHash: hash(ticket),
        authorize,
      };
    this.issuing.add(lease.origin);
    try {
      await this.audit(lease, "open");
      await this.check(lease);
      this.leases.set(lease.origin, lease);
    } finally {
      this.issuing.delete(lease.origin);
    }
    return { action: lease.origin + "/.__devsetu/open", ticket };
  }
  async claim(credential: string) {
    const device = await this.connectors.checkCredential(credential);
    if (device.workspaceId !== this.config.workspaceId || device.mode === "system")
      fail("connector-denied");
    if (this.polling.has(device.deviceId)) fail("poll-in-progress", 429);
    this.polling.add(device.deviceId);
    try {
      const deadline = Date.now() + 4000;
      do {
        const found = [...this.pending.values()].filter(
          (p) => !p.claimed && p.job.deviceId === device.deviceId,
        );
        const jobs: PreviewJob[] = [];
        for (const pending of found.slice(0, 8)) {
          await this.check(pending.lease);
          if (!this.pending.has(pending.job.id) || pending.claimed) continue;
          pending.claimed = true;
          jobs.push(pending.job);
        }
        if (jobs.length || this.closed) return { jobs };
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      return { jobs: [] };
    } finally {
      this.polling.delete(device.deviceId);
    }
  }
  async end(actor: string, workspaceId: string, input: unknown) {
    if (workspaceId !== this.config.workspaceId) fail("workspace-denied");
    const request = PreviewOpenSchema.parse(input);
    const lease = [...this.leases.values()].find(
      (l) =>
        l.actor === actor && l.deviceId === request.deviceId && l.serviceId === request.serviceId,
    );
    if (!lease) return { closed: true };
    await lease.authorize();
    await this.audit(lease, "close");
    this.leases.delete(lease.origin);
    for (const pending of this.pending.values()) if (pending.lease === lease) pending.finish();
    return { closed: true };
  }
  async complete(credential: string, input: unknown) {
    const device = await this.connectors.checkCredential(credential),
      result = PreviewResultSchema.parse(input),
      pending = this.pending.get(result.id);
    if (
      !pending ||
      !pending.claimed ||
      pending.job.deviceId !== device.deviceId ||
      device.workspaceId !== this.config.workspaceId
    )
      fail("request-not-found", 404);
    await this.check(pending.lease);
    if (result.ok && Buffer.byteLength(result.body, "base64") > this.config.maxResponseBytes)
      fail("response-too-large", 413);
    if (this.pending.get(result.id) !== pending) fail("request-not-found", 404);
    pending.finish(result);
    return { completed: true };
  }
  private async body(request: IncomingMessage, limit: number) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of request) {
      const bytes = Buffer.from(part);
      size += bytes.length;
      if (size > limit) fail("request-too-large", 413);
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  private async handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    // Preview pages cannot install persistent workers that intercept future sessions.
    response.setHeader("Content-Security-Policy", "worker-src 'none'; frame-ancestors 'none'");
    try {
      if (!privateAddress(request.socket.remoteAddress ?? "")) fail("private-client-required");
      const target = this.config.targets.find(
        (t) => new URL(t.origin).host === request.headers.host,
      );
      if (!target) fail("host-denied");
      const origin = target.origin,
        lease = this.leases.get(origin),
        url = request.url ?? "/";
      if (!lease) fail("open-from-devsetu", 401);
      await this.check(lease);
      const cookieName =
        new URL(origin).protocol === "https:" ? "__Host-devsetu-preview" : "devsetu-preview";
      if (url === "/.__devsetu/open" && request.method === "POST") {
        if (
          request.headers.origin !== this.portal ||
          request.headers["content-type"] !== "application/x-www-form-urlencoded"
        )
          fail("bootstrap-denied");
        const ticket =
          new URLSearchParams((await this.body(request, 256)).toString()).get("ticket") ?? "";
        if (!/^[a-f0-9]{64}$/.test(ticket) || hash(ticket) !== lease.ticketHash)
          fail("bootstrap-expired", 401);
        // Consume synchronously before creating the browser cookie.
        delete lease.ticketHash;
        const token = randomBytes(32).toString("hex");
        lease.cookieHash = hash(token);
        response.setHeader(
          "Set-Cookie",
          `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((lease.expires - this.now()) / 1000)}${cookieName.startsWith("__Host-") ? "; Secure" : ""}`,
        );
        // Commit the new top-level site before navigating to the application.
        // A cross-site POST -> 303 redirect chain omits a Strict cookie.
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          '<!doctype html><meta charset="utf-8"><title>Opening private preview</title><meta http-equiv="refresh" content="0;url=/"><p>Opening your private application. <a href="/">Continue</a></p>',
        );
        return;
      }
      const token =
        (request.headers.cookie ?? "")
          .split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith(cookieName + "="))
          ?.slice(cookieName.length + 1) ?? "";
      if (!/^[a-f0-9]{64}$/.test(token) || hash(token) !== lease.cookieHash)
        fail("open-from-devsetu", 401);
      if (!request.method || !["GET", "HEAD"].includes(request.method)) {
        if (request.headers.origin !== origin) fail("origin-denied");
      } else if (request.headers["sec-fetch-site"] === "cross-site") fail("origin-denied");
      if (url === "/.__devsetu/close" && request.method === "POST") {
        await this.audit(lease, "close");
        this.leases.delete(origin);
        for (const pending of this.pending.values()) if (pending.lease === lease) pending.finish();
        response.end("Preview closed. Return to DevSetu to open it again.");
        return;
      }
      if (url.startsWith("/.__devsetu/")) fail("reserved-path", 404);
      if (this.pending.size >= this.config.maxPending) fail("capacity", 429);
      const body = await this.body(request, this.config.maxRequestBytes);
      if (this.pending.size >= this.config.maxPending) fail("capacity", 429);
      const pairs: [string, string][] = [];
      for (let i = 0; i < request.rawHeaders.length; i += 2)
        pairs.push([request.rawHeaders[i]!, request.rawHeaders[i + 1]!]);
      const job = PreviewJobSchema.parse({
        version: 1,
        id: "prv_" + randomBytes(16).toString("hex"),
        workspaceId: this.config.workspaceId,
        deviceId: lease.deviceId,
        profileId: lease.profileId,
        serviceId: lease.serviceId,
        revision: lease.revision,
        fingerprint: lease.fingerprint,
        origin,
        method: request.method,
        path: url,
        headers: headers(pairs),
        body: body.toString("base64"),
        timeoutMs: this.config.timeoutMs,
        maxResponseBytes: this.config.maxResponseBytes,
      });
      const result = await new Promise<PreviewResult | undefined>((resolve) => {
        const finish = (value?: PreviewResult) => {
          if (!this.pending.delete(job.id)) return;
          clearTimeout(timer);
          response.off("close", cancel);
          resolve(value);
        };
        const timer = setTimeout(() => finish(), this.config.timeoutMs),
          cancel = () => finish();
        this.pending.set(job.id, { job, lease, claimed: false, finish });
        response.once("close", cancel);
      });
      if (response.destroyed) return;
      if (!result) fail("timeout-or-closed", 504);
      await this.check(lease);
      if (!result.ok) fail(result.error, 502);
      const output = headers(result.headers, true),
        grouped = new Map<string, string[]>();
      for (const [key, value] of output) {
        const name = key.toLowerCase();
        grouped.set(name, [...(grouped.get(name) ?? []), value]);
      }
      if (grouped.get("content-type")?.some((v) => v.toLowerCase().startsWith("text/event-stream")))
        fail("unsupported-stream", 502);
      for (const [key, values] of grouped) {
        if (key === "location" && values.some((v) => new URL(v, origin).origin !== origin))
          fail("redirect-denied", 502);
        if (key === "content-security-policy") response.appendHeader(key, values);
        else response.setHeader(key, key === "set-cookie" ? values : values.join(", "));
      }
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("X-Frame-Options", "DENY");
      response.statusCode = result.status;
      response.end(request.method === "HEAD" ? undefined : Buffer.from(result.body, "base64"));
    } catch (error) {
      if (!response.headersSent && !response.destroyed) {
        response.statusCode =
          error instanceof ServixDeploymentError
            ? error.statusCode
            : error instanceof z.ZodError
              ? 400
              : 502;
        response.end(
          error instanceof ServixDeploymentError ? error.code : "preview-request-failed",
        );
      } else response.destroy();
    }
  }
  async listen() {
    await mkdir(this.auditRoot, { recursive: true });
    if ((await lstat(this.auditRoot)).isSymbolicLink()) fail("audit-unavailable", 503);
    // An origin cannot later be assigned to a different project, even after restart.
    // Browser storage and an already-open application must retain one trust boundary.
    for (const target of this.config.targets) {
      const file = join(
        this.auditRoot,
        "origin-" + hash(new URL(target.origin).hostname) + ".json",
      );
      const binding = JSON.stringify({
        workspaceId: this.config.workspaceId,
        deviceId: target.deviceId,
        profileId: target.profileId,
        serviceId: target.serviceId,
      });
      try {
        const stream = await open(file, "wx", 0o600);
        try {
          await stream.writeFile(binding);
          await stream.sync();
        } finally {
          await stream.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const info = await lstat(file);
        if (
          !info.isFile() ||
          info.isSymbolicLink() ||
          info.size > 4096 ||
          (await readFile(file, "utf8")) !== binding
        )
          fail("origin-target-changed", 503);
      }
    }
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.listen.port, this.config.listen.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }
  async close() {
    this.closed = true;
    for (const pending of this.pending.values()) pending.finish();
    this.leases.clear();
    if (this.server.listening)
      await new Promise<void>((resolve, reject) =>
        this.server.close((error) => (error ? reject(error) : resolve())),
      );
  }
}
