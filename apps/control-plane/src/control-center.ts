import { access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import staticFiles from "@fastify/static";
import type { FastifyInstance, FastifyRequest } from "fastify";

const INDEX_FILE = "index.html";
const RESERVED_PATH_PREFIXES = ["/auth", "/health", "/v1", "/.well-known"] as const;

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export async function registerControlCenter(
  server: FastifyInstance,
  assetsDirectory: string,
  basePath = "",
): Promise<void> {
  const root = resolve(assetsDirectory);
  await access(join(root, INDEX_FILE));

  server.addHook("onSend", async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(name, value);
    }
    return payload;
  });

  await server.register(staticFiles, {
    root,
    prefix: `${basePath}/`,
    index: false,
    wildcard: false,
    cacheControl: false,
    setHeaders(reply, filePath) {
      const cacheControl = filePath.endsWith(`${sep}${INDEX_FILE}`)
        ? "no-store"
        : filePath.includes(`${sep}assets${sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache";
      reply.header("cache-control", cacheControl);
    },
  });

  if (basePath !== "") {
    server.get(basePath, async (_request, reply) => reply.redirect(`${basePath}/`, 308));
  }

  server.get(`${basePath}/`, async (_request, reply) => {
    return reply.header("cache-control", "no-store").type("text/html").sendFile(INDEX_FILE);
  });

  server.setNotFoundHandler(async (request, reply) => {
    if (isExperienceNavigation(request, basePath)) {
      return reply.header("cache-control", "no-store").type("text/html").sendFile(INDEX_FILE);
    }
    return reply.status(404).send({ error: "not-found" });
  });
}

function isExperienceNavigation(request: FastifyRequest, basePath: string): boolean {
  if (request.method !== "GET" || !request.headers.accept?.includes("text/html")) {
    return false;
  }
  const pathname = new URL(request.url, "https://frevos.invalid").pathname;
  if (basePath !== "" && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    return false;
  }
  const applicationPath = basePath === "" ? pathname : pathname.slice(basePath.length) || "/";
  if (
    RESERVED_PATH_PREFIXES.some(
      (prefix) => applicationPath === prefix || applicationPath.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  const finalSegment = applicationPath.split("/").at(-1) ?? "";
  return !finalSegment.includes(".");
}
