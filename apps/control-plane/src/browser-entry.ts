import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { registerControlCenter } from "./control-center.js";
import { buildServer } from "./server.js";

const BrowserEntrySchema = z
  .object({
    version: z.literal(1),
    publicOrigin: z.string().refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === value;
      } catch {
        return false;
      }
    }),
    basePath: z
      .string()
      .max(65)
      .regex(/^\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
    proxyHosts: z
      .array(
        z
          .string()
          .regex(/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/)
          .max(260),
      )
      .max(4),
    listen: z
      .object({ host: z.literal("127.0.0.1"), port: z.number().int().min(1024).max(65535) })
      .strict(),
  })
  .strict();

export type BrowserEntry = z.infer<typeof BrowserEntrySchema>;

async function jsonFile(path: string) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
    throw Error("browser-entry-file-rejected");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function loadBrowserEntry(path: string): Promise<BrowserEntry | undefined> {
  try {
    return BrowserEntrySchema.parse(await jsonFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

// Shares the original process's domain objects. This does not construct a second
// connector store, worker, database pool, retention loop or preview relay.
export async function buildBrowserEntry(
  common: Parameters<typeof buildServer>[0],
  profile: BrowserEntry,
  assetsDirectory: string,
) {
  BrowserEntrySchema.parse(profile);
  if (common.authMode !== "local") throw Error("browser-entry-local-auth-required");
  const metadata = z
    .object({ version: z.literal(1), basePath: z.literal(profile.basePath) })
    .strict();
  metadata.parse(await jsonFile(join(assetsDirectory, "browser-entry.json")));
  const server = await buildServer({
    ...common,
    publicOrigin: profile.publicOrigin,
    basePath: profile.basePath,
    authCookieNamespace: profile.basePath.slice(1),
  });
  let attempts = 0;
  let windowStarted = Date.now();
  server.addHook("onRequest", async (request, reply) => {
    // Only the local IIS hop may reach this listener. Forwarded headers never
    // select the authentication origin or turn a remote address into a proxy.
    if (
      !["127.0.0.1", "::ffff:127.0.0.1"].includes(request.ip) ||
      ![`127.0.0.1:${profile.listen.port}`, ...profile.proxyHosts].includes(
        request.headers.host ?? "",
      )
    )
      return reply.status(403).send({ error: "browser-entry-proxy-required" });
    const pathname = new URL(request.url, profile.publicOrigin).pathname;
    if (pathname === `${profile.basePath}/auth/login` && request.method === "POST") {
      if (Date.now() - windowStarted >= 60000) {
        attempts = 0;
        windowStarted = Date.now();
      }
      if (++attempts > 60)
        return reply.header("retry-after", "60").status(429).send({ error: "login-rate-limited" });
    }
    // Existing endpoints and credentials are intentionally not migrated by a
    // browser route. A public preview needs its own isolated browser origin.
    const path = pathname.slice(profile.basePath.length);
    if (
      path === "/v1/connector" ||
      path.startsWith("/v1/connector/") ||
      /\/local-development\/preview\//.test(path)
    )
      return reply.status(503).send({ error: "browser-entry-private-transport-required" });
  });
  try {
    await registerControlCenter(server, assetsDirectory, profile.basePath, !!common.deviceLogins);
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}
