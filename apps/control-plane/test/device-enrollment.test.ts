import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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
    // Native CI can delay filesystem/poll continuations under coverage. Wait for
    // the actual states within a bounded fixture window, not 100 timer ticks.
    heartbeatWait: 5000,
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
    await vi.waitFor(() => expect(wizard.state.phase).toBe("approval"), {
      timeout: 5000,
      interval: 10,
    });
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
    await vi.waitFor(() => expect(wizard.state.phase).toBe("connected"), {
      timeout: 5000,
      interval: 10,
    });
    await wizard.close();
    wizard = await client.serve(options);
    const again = await page(wizard);
    await again.call("/connect", body);
    await vi.waitFor(() => expect(wizard.state.phase).toBe("connected"), {
      timeout: 5000,
      interval: 10,
    });
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

it("redeems the approved join code for its preallocated device without password or a second pairing request", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-approved-join-")),
    deviceId = "fc_" + "a".repeat(32),
    calls: string[] = [];
  let registered = false,
    installed = false,
    proposal: Record<string, unknown> | undefined;
  const wizard = await client.serve({
    noOpen: true,
    preferences: join(root, "preferences"),
    pollDelay: 10,
    heartbeatWait: 5000,
    prepare: async (value: Record<string, unknown>) => {
      proposal = value;
    },
    install: async (value: Record<string, unknown>) => {
      expect(value["deviceId"]).toBe(deviceId);
      expect(value["mode"]).toBe("system");
      installed = true;
    },
    resume: async () => {},
    fetch: async (url: string, request: RequestInit) => {
      calls.push(url);
      const body = JSON.parse(String(request.body));
      if (url.endsWith("/join/prepare")) {
        expect(body).toEqual({ version: 1, code: "ABCDEFGH" });
        return Response.json({
          version: 1,
          deviceId,
          platform: process.platform,
          fileActivity: false,
        });
      }
      if (url.endsWith("/join/redeem")) {
        expect(body.deviceId).toBe(deviceId);
        expect(body.credentialHash).toMatch(/^[a-f0-9]{64}$/);
        expect(body.pollHash).toMatch(/^[a-f0-9]{64}$/);
        expect(body).not.toHaveProperty("password");
        expect(body).not.toHaveProperty("credential");
        registered = true;
        return Response.json({
          version: 1,
          deviceId,
          ownerUserId: "usr_fixture",
          status: "paired",
        });
      }
      if (url.endsWith("/system-status"))
        return registered
          ? Response.json({ deviceId, ready: true, actor: "usr_fixture", online: installed })
          : Response.json({ error: "unauthorized" }, { status: 401 });
      throw Error("Unexpected login, second approval or project action");
    },
  });
  try {
    const p = await page(wizard);
    expect(
      (
        await p.call("/connect", {
          server: "https://fixture.invalid",
          joinCode: "ABCD-EFGH",
          fileActivity: false,
        })
      ).status,
    ).toBe(202);
    await vi.waitFor(() => expect(wizard.state.phase).toBe("connected"), {
      timeout: 5000,
      interval: 10,
    });
    expect(proposal?.["deviceId"]).toBe(deviceId);
    expect(calls.filter((url) => url.endsWith("/join/redeem"))).toHaveLength(1);
    expect(calls.some((url) => /auth|enrollment\/start/.test(url))).toBe(false);
    const state = await (await p.call("/status", {})).text();
    expect(state).not.toContain(String(proposal?.["credential"]));
    expect(state).not.toContain("ABCDEFGH");
  } finally {
    await wizard.close();
    const target = await realpath(root);
    expect(dirname(target)).toBe(await realpath(tmpdir()));
    expect(basename(target)).toMatch(/^devsetu-approved-join-/);
    await rm(target, { recursive: true, force: true });
  }
});
