import staticFiles from "@fastify/static";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { access } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

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
    prefix: "/",
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

  server.get("/", async (_request, reply) => {
    return reply.header("cache-control", "no-store").type("text/html").sendFile(INDEX_FILE);
  });

  server.setNotFoundHandler(async (request, reply) => {
    if (isExperienceNavigation(request)) {
      return reply.header("cache-control", "no-store").type("text/html").sendFile(INDEX_FILE);
    }
    return reply.status(404).send({ error: "not-found" });
  });
}

function isExperienceNavigation(request: FastifyRequest): boolean {
  if (request.method !== "GET" || !request.headers.accept?.includes("text/html")) {
    return false;
  }
  const pathname = new URL(request.url, "https://frevos.invalid").pathname;
  if (
    RESERVED_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  const finalSegment = pathname.split("/").at(-1) ?? "";
  return !finalSegment.includes(".");
}
