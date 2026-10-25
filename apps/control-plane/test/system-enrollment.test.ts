import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
const enrollment = createRequire(import.meta.url)(
  "../../../deployment/servix/SystemEnrollment.cjs",
);
async function connectPage(wizard: { pageUrl: string; origin: string }) {
  const entry = await readFile(new URL(wizard.pageUrl), "utf8"),
    token = entry.match(/name="session" value="([a-f0-9]+)"/)![1]!;
  const boot = await fetch(wizard.origin + "/bootstrap", {
    method: "POST",
    headers: { origin: "null", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ session: token }),
  });
  expect(boot.status).toBe(200);
  const cookie = boot.headers.getSetCookie()[0]!.split(";")[0]!;
  const call = (route: string, body: unknown, extra = {}) =>
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
    });
  return { call, cookie };
}
it("retains setup status after refresh, retries the same pairing and waits for an observed heartbeat without invoking Git", async () => {
  let pairs = 0,
    installs = 0,
    online = false;
  const credential = "fc_" + "a".repeat(32) + "." + "b".repeat(43);
  let lastConfig: Record<string, unknown> | undefined;
  const remote = async (url: string, options: RequestInit = {}) => {
    if (url.endsWith("/auth/login"))
      return new Response(null, {
        status: 204,
        headers: { "set-cookie": "frevos-internal-csrf=synthetic-csrf; Path=/" },
      });
    if (url.endsWith("/connectors/pair")) {
      pairs++;
      expect(JSON.parse(options.body as string)).toMatchObject({ mode: "system" });
      return Response.json({
        version: 1,
        mode: "system",
        deviceId: credential.slice(0, 35),
        credential,
      });
    }
    if (url.endsWith("/discovery"))
      return Response.json({
        systems: online
          ? [{ deviceId: credential.slice(0, 35), online: true, observation: { system: {} } }]
          : [],
      });
    throw Error("Unexpected remote operation");
  };
  const wizard = await enrollment.serve({
    noOpen: true,
    fetch: remote,
    install: async (config: Record<string, unknown>) => {
      installs++;
      lastConfig = config;
      if (installs === 1) throw Error("synthetic-install-failed");
      online = true;
    },
    heartbeatWait: 50,
    pollDelay: 5,
  });
  try {
    expect((await fetch(wizard.origin)).status).toBe(403);
    const { call, cookie } = await connectPage(wizard),
      body = {
        server: "https://synthetic.devsetu.invalid",
        username: "synthetic-user",
        password: "synthetic-only-password",
        fileActivity: false,
      };
    expect((await call("/connect", body, { origin: "https://foreign.invalid" })).status).toBe(403);
    expect((await call("/connect", { ...body, command: "unrestricted" })).status).toBe(400);
    expect((await call("/connect", body)).status).toBe(202);
    for (let i = 0; i < 100 && wizard.state.phase !== "failed"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(wizard.state.phase).toBe("failed");
    const refreshed = await fetch(wizard.origin, { headers: { cookie } });
    expect(refreshed.status).toBe(200);
    const text = await refreshed.text();
    expect(text).toContain("Connect this computer");
    expect(text).not.toContain(body.password);
    const state = (await (await call("/status", {})).json()) as { busy: boolean };
    expect(state.busy).toBe(false);
    expect(JSON.stringify(state)).not.toContain(credential);
    expect((await call("/connect", body)).status).toBe(202);
    for (let i = 0; i < 100 && wizard.state.phase !== "connected"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(wizard.state).toMatchObject({ phase: "connected", online: true });
    expect(pairs).toBe(1);
    expect(installs).toBe(2);
    expect(lastConfig).toMatchObject({ mode: "system", fileActivity: false });
    expect(lastConfig).not.toHaveProperty("repository");
    expect(lastConfig).not.toHaveProperty("git");
  } finally {
    await wizard.close();
  }
});
it("shows pending health truthfully and keeps credentials out of setup status", async () => {
  const wizard = await enrollment.serve({
    noOpen: true,
    heartbeatWait: 5,
    pollDelay: 1,
    install: async () => {},
    fetch: async (url: string) =>
      url.endsWith("/auth/login")
        ? new Response(null, {
            status: 204,
            headers: { "set-cookie": "frevos-internal-csrf=fixture" },
          })
        : url.endsWith("/connectors/pair")
          ? Response.json({
              mode: "system",
              deviceId: "fc_" + "c".repeat(32),
              credential: "fc_" + "c".repeat(32) + "." + "d".repeat(43),
            })
          : Response.json({ systems: [] }),
  });
  try {
    const { call } = await connectPage(wizard);
    await call("/connect", {
      server: "https://fixture.invalid",
      username: "fixture",
      password: "synthetic-password",
      fileActivity: false,
    });
    for (
      let i = 0;
      i < 100 && (wizard.state.phase !== "waiting" || !wizard.state.message.includes("pending"));
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    expect(wizard.state.online).toBe(false);
    expect(wizard.state.message).toContain("pending");
    expect(JSON.stringify(await (await call("/status", {})).json())).not.toContain(
      "synthetic-password",
    );
  } finally {
    await wizard.close();
  }
});

it("reopens an existing enrollment without creating another device or retaining a password", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-enrollment-retry-"));
  const defaultsFile = join(root, "connection.json");
  const id = "fc_" + "e".repeat(32);
  let paired = 0,
    resumed = 0;
  const remote = async (url: string) => {
    if (url.endsWith("/auth/login"))
      return new Response(null, {
        status: 204,
        headers: { "set-cookie": "frevos-internal-csrf=synthetic" },
      });
    if (url.endsWith("/connectors/pair")) {
      paired++;
      return Response.json({ mode: "system", deviceId: id, credential: id + "." + "f".repeat(43) });
    }
    if (url.endsWith("/connectors"))
      return Response.json([
        {
          deviceId: id,
          mode: "system",
          status: "active",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      ]);
    return Response.json({ systems: [{ deviceId: id, online: true, observation: {} }] });
  };
  const options = {
    noOpen: true,
    defaultsFile,
    fetch: remote,
    install: async () => {},
    resume: async (request: object) => {
      expect(request).toMatchObject({ deviceId: id, fileActivity: false });
      resumed++;
    },
  };
  const body = {
    server: "https://fixture.invalid",
    username: "fixture",
    password: "synthetic-password",
    fileActivity: false,
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const wizard = await enrollment.serve(options);
      try {
        const { call } = await connectPage(wizard);
        if (attempt)
          expect(wizard.state.defaults).toEqual({
            server: body.server,
            username: body.username,
            fileActivity: false,
          });
        expect((await call("/connect", body)).status).toBe(202);
        for (let i = 0; i < 100 && wizard.state.phase !== "connected"; i++)
          await new Promise((r) => setTimeout(r, 10));
        expect(wizard.state.phase).toBe("connected");
      } finally {
        await wizard.close();
      }
    }
    expect(paired).toBe(1);
    expect(resumed).toBe(1);
    expect(await readFile(defaultsFile, "utf8")).not.toMatch(/password|credential|csrf/);
  } finally {
    const absolute = resolve(root);
    expect(dirname(absolute)).toBe(resolve(tmpdir()));
    expect(absolute).toContain("devsetu-enrollment-retry-");
    await rm(absolute, { recursive: true, force: true });
  }
});
