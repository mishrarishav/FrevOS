import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const runtimeModule = createRequire(import.meta.url)(
  "../../../deployment/servix/LocalDevelopment.cjs",
);
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
it("recognises Production target aliases across credential changes and rejects writable, inherited, global or grantable database privileges", () => {
  expect(
    runtimeModule.databaseIdentity({
      DATABASE_URL: "postgres://reader:synthetic-one@db.example:5432/app",
    }),
  ).toBe(
    runtimeModule.databaseIdentity({
      DATABASE_URL: "postgres://writer:synthetic-two@db.example:5432/app",
    }),
  );
  expect(
    runtimeModule.mysqlReadOnlyGrants(
      ["GRANT USAGE ON *.* TO `reader`@`%`", "GRANT SELECT, SHOW VIEW ON `app`.* TO `reader`@`%`"],
      "app",
    ),
  ).toBe(true);
  for (const grant of [
    "GRANT ALL PRIVILEGES ON `app`.* TO `writer`@`%`",
    "GRANT SELECT ON *.* TO `reader`@`%`",
    "GRANT SELECT ON `other`.* TO `reader`@`%`",
    "GRANT SELECT ON `app`.* TO `reader`@`%` WITH GRANT OPTION",
    "GRANT `administrator`@`%` TO `reader`@`%`",
    "GRANT EXECUTE ON `app`.* TO `reader`@`%`",
  ])
    expect(runtimeModule.mysqlReadOnlyGrants([grant], "app")).toBe(false);
  expect(runtimeModule.mysqlReadOnlyGrants([], "app")).toBe(false);
});
async function freePort() {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const port = address.port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
async function serves(port: number) {
  try {
    return (await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(700) })).ok;
  } catch {
    return false;
  }
}
async function end(child: ChildProcess) {
  if (child.exitCode === null && child.signalCode === null) child.kill();
  for (let n = 0; child.exitCode === null && child.signalCode === null && n < 50; n++)
    await delay(100);
}
it("discovers registered development recipes and local file references while excluding secrets, arbitrary scripts and traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-discovery-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "frontend"));
  await mkdir(join(root, "api"));
  await mkdir(join(root, "node_modules"));
  await writeFile(
    join(root, "frontend/package.json"),
    JSON.stringify({
      name: "Web",
      scripts: { dev: "vite", seed: "node seed.js" },
      devDependencies: { vite: "1.0.0" },
    }),
  );
  await writeFile(
    join(root, "frontend/.env.development"),
    "VITE_LABEL=public\nPRIVATE_PASSWORD=synthetic-private-value\n",
  );
  await writeFile(join(root, "api/Test.csproj"), '<Project Sdk="Microsoft.NET.Sdk.Web" />');
  await writeFile(
    join(root, "api/appsettings.Production.json"),
    '{"ConnectionStrings":{"Default":"synthetic private value"}}',
  );
  const candidates = await runtimeModule.discover(root);
  expect(candidates).toHaveLength(2);
  expect(candidates.find((c: { context: string }) => c.context === "frontend")).toMatchObject({
    scripts: ["dev"],
    framework: "vite",
    environments: [{ reference: ".env.development", production: false }],
  });
  expect(candidates.find((c: { context: string }) => c.context === "api")).toMatchObject({
    recipe: "dotnet-run",
    framework: "dotnet",
    environments: [{ reference: "appsettings.Production.json", production: true }],
  });
  expect(JSON.stringify(candidates)).not.toContain("synthetic-private-value");
  const candidate = candidates[0];
  const service = {
    id: candidate.id,
    port: 5100,
    database: "application",
    ...(candidate.recipe === "npm-script" ? { script: "dev" } : {}),
  };
  expect(() => runtimeModule.validatePlan({ services: [service] }, candidates)).not.toThrow();
  expect(() =>
    runtimeModule.validatePlan(
      { services: [{ ...service, database: "none" }] },
      candidates.map((c: { id: string }) =>
        c.id === service.id ? { ...c, databaseHint: "mysql" } : c,
      ),
    ),
  ).toThrow("database-profile-required");
  for (const change of [
    { port: 80 },
    { database: "raw" },
    { id: "outside" },
    { script: "seed" },
    { developmentEnvironment: "../.env" },
    { command: "powershell" },
  ])
    expect(() =>
      runtimeModule.validatePlan({ services: [{ ...service, ...change }] }, candidates),
    ).toThrow();
  expect(
    runtimeModule.parseEnvironment(
      "# comment\nexport A=plain\nB=\"line\\nvalue\"\nC='literal'\nD=public # comment\n",
    ),
  ).toEqual({ A: "plain", B: "line\nvalue", C: "literal", D: "public" });
  expect(() => runtimeModule.parseEnvironment("not-an-assignment")).toThrow("invalid-environment");
  expect(() => runtimeModule.parseEnvironment("A=" + "x".repeat(65536))).toThrow(
    "environment-capacity",
  );
  expect(runtimeModule.databaseIdentity({ A: "public" })).toBeNull();
  expect(runtimeModule.databaseIdentity({ DB_NAME: "dev", DB_HOST: "localhost" })).toBe(
    runtimeModule.databaseIdentity({ DB_HOST: "localhost", DB_NAME: "dev" }),
  );
});
it.skipIf(process.platform !== "win32")(
  "owns real Windows process trees, binds loopback, preserves environment files and reconciles starts/stops without replay",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "devsetu local runtime "));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const source = join(root, "source"),
      stateRoot = join(root, "state");
    await mkdir(source);
    await mkdir(join(source, "backend"));
    await mkdir(stateRoot);
    const port = await freePort(),
      childPort = await freePort();
    const directory = join(source, "backend");
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "Fixture backend",
        scripts: { start: "node server.cjs", dev: "node server.cjs" },
      }),
    );
    await writeFile(
      join(directory, "server.cjs"),
      `const http=require('node:http'),{spawn}=require('node:child_process');if(process.env.FIXTURE_CHILD_PORT&&process.argv[2]!=='external')spawn(process.execPath,['-e',"require('node:http').createServer((q,s)=>s.end('child')).listen(Number(process.env.FIXTURE_CHILD_PORT),'0.0.0.0')"],{stdio:'ignore'});http.createServer((q,s)=>s.end(JSON.stringify({database:process.env.DB_NAME,ambient:!!process.env.FREVOS_TEST_SECRET,host:server.address().address}))).listen;const server=http.createServer((q,s)=>s.end(JSON.stringify({database:process.env.DB_NAME,ambient:!!process.env.FREVOS_TEST_SECRET,host:server.address().address})));server.listen(Number(process.env.PORT),'0.0.0.0');`,
    );
    const environment = `DB_HOST=127.0.0.1\nDB_NAME=synthetic_development\nDB_USER=fixture\nDB_PASSWORD=synthetic-fixture-only\nFIXTURE_CHILD_PORT=${childPort}\n`;
    await writeFile(join(directory, ".env.dev"), environment);
    await writeFile(
      join(directory, ".env.prod"),
      "DB_HOST=127.0.0.1\nDB_NAME=synthetic_production\n",
    );
    let sourceReady = true;
    const config = {
      repository: source,
      stateRoot,
      deviceId: "fc_" + "a".repeat(32),
      profileId: "servix-development",
      credential: "synthetic-private-runtime-key",
    };
    const runtime = new runtimeModule.LocalDevelopmentRuntime(config, async () => {
      if (!sourceReady) throw Error("source changed");
    });
    await runtime.initialize();
    cleanups.push(() => runtime.close());
    let number = 0;
    async function action(operation: string, extra: Record<string, unknown> = {}) {
      const snapshot = await runtime.snapshot();
      const request = {
        version: 1,
        requestId: "ld_" + String(++number).padStart(32, "0"),
        deviceId: config.deviceId,
        profileId: config.profileId,
        expectedRevision: snapshot.revision,
        fingerprint: snapshot.fingerprint,
        operation,
        ...extra,
      };
      const job = {
        workspaceId: "ws_server20",
        request,
        expiresAt: new Date(Date.now() + 120000).toISOString(),
      };
      return { job, result: await runtime.execute(job) };
    }
    const first = await runtime.snapshot(),
      candidate = first.candidates[0];
    const plan = {
      services: [
        {
          id: candidate.id,
          port,
          script: "start",
          database: "mysql",
          developmentEnvironment: ".env.dev",
          productionEnvironment: ".env.prod",
        },
      ],
    };
    expect((await action("configure", { plan })).result.status).toBe("succeeded");
    const originalAmbient = process.env["FREVOS_TEST_SECRET"];
    process.env["FREVOS_TEST_SECRET"] = "synthetic-never-pass-to-app";
    try {
      const start = await action("start", { mode: "development" });
      expect(start.result).toMatchObject({ status: "succeeded" });
      await expect.poll(() => serves(port), { timeout: 45000 }).toBe(true);
      await expect.poll(() => serves(childPort), { timeout: 15000 }).toBe(true);
      expect(await (await fetch(`http://localhost:${port}/`)).json()).toEqual({
        database: "synthetic_development",
        ambient: false,
        host: "127.0.0.1",
      });
      const running = await runtime.snapshot();
      expect(running.services[0].status).toBe("running");
      expect(await runtime.execute(start.job)).toEqual(start.result);
      expect((await runtime.snapshot()).services[0].pid).toBe(running.services[0].pid);
      expect((await action("configure", { plan })).result.errorCode).toBe(
        "local-development-stop-before-configuration",
      );
      expect((await action("start", { mode: "production" })).result.errorCode).toBe(
        "local-development-restart-to-change-database",
      );
      expect((await action("restart", { mode: "development" })).result.status).toBe("succeeded");
      await expect.poll(() => serves(port), { timeout: 30000 }).toBe(true);
      expect((await runtime.snapshot()).services[0].pid).not.toBe(running.services[0].pid);
      sourceReady = false;
      expect((await runtime.snapshot()).sourceReady).toBe(false);
      expect((await action("stop")).result.status).toBe("succeeded");
      await expect.poll(() => serves(port), { timeout: 15000 }).toBe(false);
      await expect.poll(() => serves(childPort), { timeout: 15000 }).toBe(false);
      sourceReady = true;
      expect(await readFile(join(directory, ".env.dev"), "utf8")).toBe(environment);
      const interrupted = await action("stop");
      const next = {
        ...interrupted.job,
        request: {
          ...interrupted.job.request,
          requestId: "ld_" + "f".repeat(32),
          operation: "start",
          mode: "development",
        },
      };
      await writeFile(
        join(stateRoot, "local-development", next.request.requestId + ".claim"),
        "retained interrupted claim",
      );
      expect(await runtime.execute(next)).toMatchObject({ status: "recovery-required" });
      expect(await serves(port)).toBe(false);
    } finally {
      if (originalAmbient === undefined) delete process.env["FREVOS_TEST_SECRET"];
      else process.env["FREVOS_TEST_SECRET"] = originalAmbient;
    }
  },
  120000,
);
it.skipIf(process.platform !== "win32")(
  "requires exact current project identity to stop an existing process and leaves unrelated listeners alive",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "devsetu-existing-process-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const source = join(root, "source"),
      stateRoot = join(root, "state"),
      foreign = join(root, "foreign.cjs");
    await mkdir(source);
    await mkdir(stateRoot);
    const port = await freePort();
    const script =
      "require('node:http').createServer((q,s)=>s.end('fixture')).listen(Number(process.env.PORT),'127.0.0.1')";
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({ name: "Web fixture", scripts: { start: "node server.cjs" } }),
    );
    await writeFile(join(source, "server.cjs"), script);
    await writeFile(foreign, script);
    const config = {
      repository: source,
      stateRoot,
      deviceId: "fc_" + "a".repeat(32),
      profileId: "servix-development",
      credential: "synthetic-private-runtime-key",
    };
    const runtime = new runtimeModule.LocalDevelopmentRuntime(config, async () => {});
    await runtime.initialize();
    cleanups.push(() => runtime.close());
    let n = 0;
    async function action(operation: string, extra: Record<string, unknown> = {}) {
      const s = await runtime.snapshot();
      return runtime.execute({
        workspaceId: "ws_server20",
        expiresAt: new Date(Date.now() + 120000).toISOString(),
        request: {
          version: 1,
          requestId: "ld_" + String(++n).padStart(32, "0"),
          deviceId: config.deviceId,
          profileId: config.profileId,
          expectedRevision: s.revision,
          fingerprint: s.fingerprint,
          operation,
          ...extra,
        },
      });
    }
    const candidate = (await runtime.snapshot()).candidates[0];
    expect(
      (
        await action("configure", {
          plan: { services: [{ id: candidate.id, port, script: "start", database: "none" }] },
        })
      ).status,
    ).toBe("succeeded");
    const outside = spawn(process.execPath, [foreign, resolve(source, "server.cjs")], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
      windowsHide: true,
    });
    cleanups.push(() => end(outside));
    await expect.poll(() => serves(port), { timeout: 10000 }).toBe(true);
    let state = (await runtime.snapshot()).services[0];
    expect(state.status).toBe("port-conflict");
    expect(state.existing.projectOwned).toBe(false);
    expect(
      (
        await action("kill-existing", {
          serviceId: candidate.id,
          identity: state.existing.identity,
        })
      ).status,
    ).toBe("failed");
    expect(await serves(port)).toBe(true);
    await end(outside);
    await expect.poll(() => serves(port), { timeout: 10000 }).toBe(false);
    const own = spawn(process.execPath, [resolve(source, "server.cjs")], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
      windowsHide: true,
    });
    cleanups.push(() => end(own));
    await expect.poll(() => serves(port), { timeout: 10000 }).toBe(true);
    state = (await runtime.snapshot()).services[0];
    expect(state.existing.projectOwned).toBe(true);
    expect(
      (await action("kill-existing", { serviceId: candidate.id, identity: "0".repeat(64) })).status,
    ).toBe("failed");
    expect(await serves(port)).toBe(true);
    expect(
      (
        await action("kill-existing", {
          serviceId: candidate.id,
          identity: state.existing.identity,
        })
      ).status,
    ).toBe("succeeded");
    await expect.poll(() => serves(port), { timeout: 10000 }).toBe(false);
  },
  90000,
);
