import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { SoftwareInventorySchema } from "@frevos/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url),
  native = require("../../../deployment/servix/SoftwareNative.cjs"),
  demo = require("../../../deployment/servix/DemoApi.cjs");
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes("frevos-software-native-"))
      throw Error("cleanup scope");
    await rm(root, { recursive: true, force: true });
  }
});
async function root() {
  const value = await mkdtemp(join(tmpdir(), "frevos-software-native-"));
  roots.push(value);
  return value;
}
describe("bounded native software adapters", () => {
  it("collects actual registered packages without repair-triggering WMI or software changes", async () => {
    const actual = await native.inventory();
    expect(SoftwareInventorySchema.safeParse(actual).success).toBe(true);
    expect(["ready", "partial"]).toContain(actual.status);
    expect(actual.items.length).toBeGreaterThan(0);
    expect(actual.items.length).toBeLessThanOrEqual(5000);
    expect(actual.items.every((i: { id: string }) => /^[a-f0-9]{64}$/.test(i.id))).toBe(true);
  }, 120000);
  it("returns unavailable distinctly and normalizes Linux package metadata and redacts values", async () => {
    const failed = await native.inventory({
      platform: "linux",
      run: async () => {
        throw Error("unavailable");
      },
    });
    expect(failed.status).toBe("unavailable");
    expect(failed.items).toEqual([]);
    const linux = await native.inventory({
      platform: "linux",
      run: async () => ({ output: "alpha\t1.2\tPublisher\nalpha\t1.2\tPublisher\n" }),
    });
    expect(linux.status).toBe("ready");
    expect(linux.items).toHaveLength(1);
    expect(linux.items[0].source).toBe("dpkg");
    let calls = 0;
    const rpm = await native.inventory({
      platform: "linux",
      run: async () => {
        if (calls++ === 0) throw Error();
        return { output: "rpm-app\t2.1\tVendor\n" };
      },
    });
    expect(rpm.items[0].source).toBe("rpm");
  });
  it("verifies complete installer bytes and reauthorizes before any fixed OS installation", async () => {
    const cache = await root(),
      body = Buffer.from("synthetic installer fixture; never executable"),
      sha = createHash("sha256").update(body).digest("hex"),
      runs: { file: string; args: string[] }[] = [];
    vi.stubEnv("WINDIR", join(cache, "windows"));
    const pkg = {
      recipe: "windows-msi",
      platform: "win32",
      asset: { url: "https://example.org/test.msi", bytes: body.length, sha256: sha },
    };
    const run = async (file: string, args: string[]) => {
      runs.push({ file, args });
      return { output: "", restartRequired: false };
    };
    let authorized = 0;
    await native.install(pkg, cache, {
      platform: "win32",
      fetch: async () => new Response(body),
      run,
      beforeExecute: async () => {
        authorized++;
      },
    });
    expect(authorized).toBe(1);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.args).toEqual(["/i", join(cache, sha + ".msi"), "/norestart"]);
    expect(runs[0]?.file).toBe(join(cache, "windows/System32/msiexec.exe"));
    expect(await readFile(join(cache, sha + ".msi"))).toEqual(body);
    runs.length = 0;
    await expect(
      native.install({ ...pkg, asset: { ...pkg.asset, sha256: "0".repeat(64) } }, cache, {
        platform: "win32",
        fetch: async () => new Response(body),
        run,
      }),
    ).rejects.toThrow("artifact-mismatch");
    expect(runs).toHaveLength(0);
    await expect(
      native.install(pkg, cache, {
        platform: "win32",
        fetch: async () => new Response(body),
        run,
        beforeExecute: async () => {
          throw Error("revoked");
        },
      }),
    ).rejects.toThrow("revoked");
    expect(runs).toHaveLength(0);
  });
  it("bounds the private download cache before downloading or executing anything", async () => {
    const cache = await root();
    await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        writeFile(join(cache, i.toString(16).padStart(64, "0") + ".msi"), "retained fixture"),
      ),
    );
    let fetched = false,
      executed = false;
    await expect(
      native.install(
        {
          recipe: "windows-msi",
          platform: "win32",
          asset: { url: "https://example.org/test.msi", bytes: 1, sha256: "f".repeat(64) },
        },
        cache,
        {
          platform: "win32",
          fetch: async () => {
            fetched = true;
            return new Response("x");
          },
          run: async () => {
            executed = true;
            return { output: "" };
          },
        },
      ),
    ).rejects.toThrow("cache-capacity");
    expect(fetched).toBe(false);
    expect(executed).toBe(false);
  });
  it("blocks arbitrary recipes, credential-bearing URLs, output overflow and failed native commands", async () => {
    const cache = await root();
    await expect(
      native.install({ recipe: "shell", platform: "win32" }, cache, { platform: "win32" }),
    ).rejects.toThrow("recipe-denied");
    await expect(
      native.install(
        {
          recipe: "windows-msi",
          platform: "win32",
          asset: { url: "https://example.org/a?token=fixture", sha256: "a".repeat(64), bytes: 1 },
        },
        cache,
        { platform: "win32" },
      ),
    ).rejects.toThrow("asset-denied");
    await expect(
      native.run(process.execPath, ["-e", "process.stdout.write('x'.repeat(5000))"], {
        capacity: 100,
      }),
    ).rejects.toThrow("output-capacity");
    await expect(native.run(process.execPath, ["-e", "process.exit(4)"])).rejects.toThrow(
      "native-failed",
    );
  });
  it("runs the actual isolated temporary API with correlated GET/POST responses and no project files", async () => {
    const config = {
      name: "Synthetic private API",
      instance: "sw_" + "a".repeat(32),
      port: 0,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
    const net = await import("node:net"),
      probe = net.createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    config.port = (probe.address() as import("node:net").AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    const server = demo.start(config);
    try {
      await once(server, "listening");
      const origin = "http://127.0.0.1:" + config.port;
      const get = await (await fetch(origin + "/health")).json();
      expect(get).toMatchObject({ instance: config.instance });
      expect(get).toHaveProperty("machine");
      const nonce = "fixture-" + Date.now(),
        post = await fetch(origin + "/api/echo", { method: "POST", body: nonce });
      expect(await post.json()).toMatchObject({ received: nonce });
      expect((await fetch(origin + "/not-a-route")).status).toBe(404);
      expect(
        (await fetch(origin + "/api/echo", { method: "POST", body: "x".repeat(65537) })).status,
      ).toBe(413);
      expect((await fetch(origin)).headers.get("content-security-policy")).toContain(
        "connect-src 'self'",
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    expect(() => demo.start({ ...config, port: 80 })).toThrow("config-denied");
  });
});
