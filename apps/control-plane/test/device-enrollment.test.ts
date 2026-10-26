import { mkdtemp, readFile, rm, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { DeveloperConnectorStore, SystemPairings } from "../src/developer-connectors.js";
import { SystemDiscovery } from "../src/system-discovery.js";
const client = createRequire(import.meta.url)("../../../deployment/servix/DeviceEnrollment.cjs");
async function page(wizard: { pageUrl: string; origin: string }) {
  const html = await readFile(new URL(wizard.pageUrl), "utf8"),
    token = html.match(/name="session" value="([A-Za-z0-9_-]+)"/)![1]!;
  const boot = await fetch(wizard.origin + "/bootstrap", {
    method: "POST",
    headers: { origin: "null", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ session: token }),
  });
  const cookie = boot.headers.getSetCookie()[0]!.split(";")[0]!;
  return {
    html: await boot.text(),
    call: (route: string, body: unknown, extra = {}) =>
      fetch(wizard.origin + route, {
        method: "POST",
        headers: {
          origin: wizard.origin,
          cookie,
          "content-type": "application/json",
          "x-devsetu-setup": token,
          ...extra,
        },
        body: JSON.stringify(body),
      }),
  };
}
it("pairs with an approved target code, never requests an account password, survives refresh and resumes the same protected device", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-code-setup-")),
    connectors = new DeveloperConnectorStore(
      join(root, "records"),
      async (a) => a === "usr_owner",
      {
        head: async () => {
          throw Error("Git prohibited");
        },
        importBundle: async () => {},
      },
      async () => {},
    ),
    discovery = new SystemDiscovery(join(root, "discovery"), connectors, async () => ({
      projects: [],
      clients: [],
    })),
    pairings = new SystemPairings(join(root, "pairings"), connectors, discovery);
  let proposal: Record<string, unknown> | undefined,
    config: Record<string, unknown> | undefined,
    starts = 0,
    installs = 0,
    resumes = 0,
    health = false;
  const options = {
    noOpen: true,
    preferences: join(root, "preferences"),
    pollDelay: 10,
    heartbeatWait: 1000,
    prepare: async (p: Record<string, unknown>) => {
      proposal = p;
    },
    helper: async (_name: string, input: { operation: string }) => {
      if (input.operation === "connection" && config) return config;
      if (proposal) return proposal;
      throw Error("missing-state");
    },
    resume: async () => {
      resumes++;
    },
    install: async (c: Record<string, unknown>) => {
      config = c;
      installs++;
    },
    fetch: async (url: string, request: RequestInit) => {
      const body = JSON.parse(request.body as string),
        headers = request.headers as Record<string, string>,
        proof = headers["authorization"]?.slice(7);
      if (url.endsWith("/enrollment/start")) {
        starts++;
        return Response.json(await pairings.start(body, "synthetic-client"));
      }
      if (url.endsWith("/enrollment/poll")) return Response.json(await pairings.poll(proof!));
      if (url.endsWith("/system-status")) {
        try {
          const status = await pairings.status(proof!);
          return Response.json({ ...status, online: health });
        } catch {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
      }
      throw Error("Account login and unrestricted requests must not occur");
    },
  };
  let wizard = await client.serve(options);
  try {
    const p = await page(wizard);
    expect(p.html).not.toMatch(/type="password"|id="username"/);
    const body = { server: "https://synthetic.invalid", fileActivity: false };
    expect((await p.call("/connect", { ...body, password: "forbidden" })).status).toBe(400);
    expect((await p.call("/connect", body, { origin: "https://foreign.invalid" })).status).toBe(
      403,
    );
    expect((await p.call("/connect", body)).status).toBe(202);
    for (let i = 0; i < 100 && wizard.state.phase !== "approval"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(wizard.state.phase).toBe("approval");
    expect(installs).toBe(0);
    expect(await connectors.list("usr_owner")).toEqual([]);
    const refresh = await p.call("/status", {}),
      snapshot = await refresh.text();
    expect(snapshot).not.toContain(proposal!["credential"]);
    expect(snapshot).not.toContain(proposal!["pollSecret"]);
    const preview = await pairings.lookup("usr_owner", { code: wizard.state.code });
    await pairings.decide("usr_owner", preview.enrollmentId, {
      version: 1,
      digest: preview.digest,
      decision: "approve",
    });
    await vi.waitFor(() => expect(installs).toBe(1), { timeout: 5000, interval: 10 });
    expect(wizard.state.online).toBe(false);
    health = true;
    for (let i = 0; i < 100 && wizard.state.phase !== "connected"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(wizard.state.phase).toBe("connected");
    await wizard.close();
    wizard = await client.serve(options);
    const again = await page(wizard);
    await again.call("/connect", body);
    for (let i = 0; i < 100 && wizard.state.phase !== "connected"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(wizard.state.phase).toBe("connected");
    expect(starts).toBe(1);
    expect(resumes).toBe(1);
    expect(installs).toBe(1);
    expect(await connectors.list("usr_owner")).toHaveLength(1);
  } finally {
    await wizard.close();
    connectors.close();
    const target = await realpath(root);
    expect(dirname(target)).toBe(await realpath(tmpdir()));
    expect(basename(target)).toMatch(/^devsetu-code-setup-/);
    await rm(target, { recursive: true, force: true });
  }
});
