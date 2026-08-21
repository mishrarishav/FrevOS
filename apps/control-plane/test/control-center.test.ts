import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerControlCenter } from "../src/control-center.js";

describe("same-origin Control Center delivery", () => {
  let assetsDirectory: string;
  let server: FastifyInstance;

  beforeEach(async () => {
    assetsDirectory = await mkdtemp(join(tmpdir(), "frevos-control-center-"));
    await mkdir(join(assetsDirectory, "assets"));
    await writeFile(join(assetsDirectory, "index.html"), "<!doctype html><title>FrevOS</title>");
    await writeFile(join(assetsDirectory, "assets", "app-123.js"), "export {};");
    server = Fastify();
    await registerControlCenter(server, assetsDirectory);
  });

  afterEach(async () => {
    await server.close();
    await rm(assetsDirectory, { recursive: true, force: true });
  });

  it("serves the shell and immutable built assets with defensive headers", async () => {
    const shell = await server.inject({ method: "GET", url: "/" });
    expect(shell.statusCode).toBe(200);
    expect(shell.body).toContain("FrevOS");
    expect(shell.headers["cache-control"]).toBe("no-store");
    expect(shell.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(shell.headers["strict-transport-security"]).toBe("max-age=31536000");
    expect(shell.headers["x-content-type-options"]).toBe("nosniff");

    const asset = await server.inject({ method: "GET", url: "/assets/app-123.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("uses the shell only for browser navigation and preserves API and asset 404s", async () => {
    for (const url of ["/projects/frevos", "/projects/frevos/"]) {
      const navigation = await server.inject({
        method: "GET",
        url,
        headers: { accept: "text/html,application/xhtml+xml" },
      });
      expect(navigation.statusCode).toBe(200);
      expect(navigation.headers["cache-control"]).toBe("no-store");
    }

    for (const url of [
      "/v1/missing",
      "/auth/missing",
      "/health",
      "/.well-known/missing",
      "/assets/missing.js",
    ]) {
      const response = await server.inject({
        method: "GET",
        url,
        headers: { accept: "text/html" },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "not-found" });
    }

    const nonNavigation = await server.inject({ method: "POST", url: "/projects/frevos" });
    expect(nonNavigation.statusCode).toBe(404);
    expect(nonNavigation.json()).toEqual({ error: "not-found" });
  });

  it("fails startup when the compiled shell is absent", async () => {
    const emptyDirectory = await mkdtemp(join(tmpdir(), "frevos-empty-control-center-"));
    const emptyServer = Fastify();
    try {
      await expect(registerControlCenter(emptyServer, emptyDirectory)).rejects.toThrow();
    } finally {
      await emptyServer.close();
      await rm(emptyDirectory, { recursive: true, force: true });
    }
  });

  it("serves one same-origin application base path without claiming sibling paths", async () => {
    const basePathServer = Fastify();
    await registerControlCenter(basePathServer, assetsDirectory, "/frevos");
    try {
      const redirect = await basePathServer.inject({ method: "GET", url: "/frevos" });
      expect(redirect.statusCode).toBe(308);
      expect(redirect.headers.location).toBe("/frevos/");

      const shell = await basePathServer.inject({ method: "GET", url: "/frevos/" });
      expect(shell.statusCode).toBe(200);
      const asset = await basePathServer.inject({
        method: "GET",
        url: "/frevos/assets/app-123.js",
      });
      expect(asset.statusCode).toBe(200);
      const navigation = await basePathServer.inject({
        method: "GET",
        url: "/frevos/projects/frevos",
        headers: { accept: "text/html" },
      });
      expect(navigation.statusCode).toBe(200);
      const sibling = await basePathServer.inject({
        method: "GET",
        url: "/another-app",
        headers: { accept: "text/html" },
      });
      expect(sibling.statusCode).toBe(404);
    } finally {
      await basePathServer.close();
    }
  });
});
