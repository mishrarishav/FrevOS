import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";

const execute = promisify(execFile);
const source = fileURLToPath(new URL("../../..", import.meta.url));
const helper = join(source, "deployment/server20/Copy-ReviewRuntime.mjs");
const modules = ["server-monitoring", "server-monitoring-runtime", "server-monitoring-store"];
const suffixes = ["js", "js.map", "d.ts", "d.ts.map"];
const programs = [
  "Common.ps1",
  "Collector.ps1",
  "Worker.ps1",
  "Protect-Credential.ps1",
  "Install-Worker.ps1",
];
const operatorFiles = [...programs, "QueueCollector.mjs", "manifest.v1.json", "README.md"];
const sha = (content: Uint8Array) => createHash("sha256").update(content).digest("hex");
let temporary: string;
let actualModules: string[];
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), "frevos-monitoring-package-tests-"));
  actualModules = [...modules];
  try {
    await readFile(join(source, "apps/control-plane/src/server-monitoring-central.ts"));
    actualModules.push("server-monitoring-central");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
      throw error;
  }
});
afterAll(async () => {
  if (
    dirname(resolve(temporary)) !== resolve(tmpdir()) ||
    !basename(temporary).startsWith("frevos-monitoring-package-tests-")
  )
    throw Error("monitoring-package-cleanup-path-denied");
  await rm(temporary, { recursive: true, force: true });
});
async function put(root: string, relative: string, data: string) {
  const file = join(root, relative);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}
async function packageFixture() {
  const root = join(temporary, "servix-release-" + randomUUID().replaceAll("-", ""), "package");
  await put(root, "release-manifest.json", JSON.stringify({ version: 1, files: [] }));
  await put(
    root,
    "apps/control-plane/package.json",
    JSON.stringify({
      name: "@frevos/control-plane",
      type: "module",
      dependencies: { zod: "4.6.6" },
    }),
  );
  await put(
    root,
    "apps/control-plane/node_modules/@frevos/contracts/package.json",
    JSON.stringify({ name: "@frevos/contracts", type: "module", exports: "./dist/index.js" }),
  );
  return root;
}
async function inertSource() {
  const root = join(temporary, "source-" + randomUUID());
  for (const name of [
    "review-authority",
    "review-registers",
    "review-workbook",
    "review-link-checker",
    ...modules,
  ]) {
    await put(root, `apps/control-plane/src/${name}.ts`, "export {};\n");
    for (const suffix of suffixes)
      await put(root, `apps/control-plane/dist/${name}.${suffix}`, "export {};\n");
  }
  for (const name of ["review-registers", "server-monitoring"])
    for (const suffix of suffixes)
      await put(root, `packages/contracts/dist/${name}.${suffix}`, "export {};\n");
  for (const name of ["0007_review_workspace_state.sql", "0008_server_monitoring_state.sql"])
    await put(root, `apps/control-plane/migrations/${name}`, "-- inert packaging fixture\n");
  await put(
    root,
    "apps/control-plane/package.json",
    JSON.stringify({
      name: "@frevos/control-plane",
      dependencies: { fflate: "0.8.3", "fast-xml-parser": "5.12.0" },
    }),
  );
  for (const [name, version] of [
    ["fflate", "0.8.3"],
    ["fast-xml-parser", "5.12.0"],
  ])
    await put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version }));
  await put(
    root,
    "pnpm-lock.yaml",
    "lockfileVersion: '9.0'\nimporters:\n  apps/control-plane:\n    dependencies:\n      fflate:\n        specifier: 0.8.3\n        version: 0.8.3\n      fast-xml-parser:\n        specifier: 5.12.0\n        version: 5.12.0\nsnapshots:\n  fflate@0.8.3: {}\n  fast-xml-parser@5.12.0: {}\n",
  );
  for (const name of operatorFiles)
    await put(
      root,
      `deployment/server-monitoring/${name}`,
      await readFile(join(source, "deployment/server-monitoring", name), "utf8"),
    );
  return root;
}

it("packages all compiled monitoring modules, contracts, SQL and verified native artifacts; imports the adapter outside the checkout", async () => {
  const root = await packageFixture();
  await cp(join(source, "apps/control-plane/dist"), join(root, "apps/control-plane/dist"), {
    recursive: true,
  });
  await cp(
    join(source, "packages/contracts/dist"),
    join(root, "apps/control-plane/node_modules/@frevos/contracts/dist"),
    { recursive: true },
  );
  await cp(
    await realpath(join(source, "apps/control-plane/node_modules/zod")),
    join(root, "apps/control-plane/node_modules/zod"),
    { recursive: true, dereference: false },
  );
  for (const name of actualModules)
    for (const suffix of suffixes)
      await rm(join(root, `apps/control-plane/dist/${name}.${suffix}`), { force: true });
  for (const suffix of suffixes)
    await rm(
      join(
        root,
        `apps/control-plane/node_modules/@frevos/contracts/dist/server-monitoring.${suffix}`,
      ),
      { force: true },
    );
  const copied = await execute(process.execPath, [helper, source, root, "--monitoring"], {
    timeout: 30000,
    windowsHide: true,
  });
  expect(JSON.parse(copied.stdout).monitoringModules).toEqual([...actualModules].sort());
  const proof = JSON.parse(
    await readFile(join(root, "deployment/server20/review-runtime-proof.json"), "utf8"),
  );
  const paths = [
    ...actualModules.flatMap((name) =>
      suffixes.map((suffix) => `apps/control-plane/dist/${name}.${suffix}`),
    ),
    ...suffixes.map(
      (suffix) =>
        `apps/control-plane/node_modules/@frevos/contracts/dist/server-monitoring.${suffix}`,
    ),
    "apps/control-plane/migrations/0008_server_monitoring_state.sql",
    ...operatorFiles.map((name) => `deployment/server-monitoring/${name}`),
  ];
  for (const path of paths) {
    const content = await readFile(join(root, path));
    expect(proof.files).toContainEqual({ path, sha256: sha(content), bytes: content.length });
  }
  const manifest = JSON.parse(
    await readFile(join(root, "deployment/server-monitoring/manifest.v1.json"), "utf8"),
  );
  for (const file of manifest.files)
    expect(sha(await readFile(join(root, "deployment/server-monitoring", file.name)))).toBe(
      file.sha256,
    );
  const imported = await execute(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        `const domain=await import(${JSON.stringify(pathToFileURL(join(root, "apps/control-plane/dist/server-monitoring.js")).href)});`,
        `const runtime=await import(${JSON.stringify(pathToFileURL(join(root, "apps/control-plane/dist/server-monitoring-runtime.js")).href)});`,
        `const config=runtime.ServerMonitoringRuntimeSchema.parse({version:1,workspaceId:'ws_fixture',enabled:true,queueRoot:${JSON.stringify(join(root, "unused-queue"))},sourcePolicies:[],targets:[]});`,
        "const collector=await runtime.nativeServerMonitoringCollector(config);",
        "if(typeof domain.ServerMonitoringService!=='function'||typeof collector!=='function')throw Error('packaged-monitoring-import-failed');",
        "process.stdout.write('packaged-monitoring-imports-pass');",
      ].join("\n"),
    ],
    { cwd: root, timeout: 15000, windowsHide: true },
  );
  expect(imported.stdout).toBe("packaged-monitoring-imports-pass");
});

it("omits operator registry, credentials, queues and other private files even if placed beside source programs", async () => {
  const fake = await inertSource(),
    root = await packageFixture();
  for (const name of [
    "registry.v1.json",
    "runtime.json",
    ".env",
    "credentials/profile.dpapi",
    "incoming/credential-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
    "results/heartbeat.json",
  ])
    await put(fake, `deployment/server-monitoring/${name}`, "private fixture must not be packaged");
  await execute(process.execPath, [helper, fake, root, "--monitoring"], { windowsHide: true });
  const proof = JSON.parse(
    await readFile(join(root, "deployment/server20/review-runtime-proof.json"), "utf8"),
  );
  expect(
    proof.files
      .filter((file: { path: string }) => file.path.startsWith("deployment/server-monitoring/"))
      .map((file: { path: string }) => basename(file.path))
      .sort(),
  ).toEqual([...operatorFiles].sort());
  await expect(
    readFile(join(root, "deployment/server-monitoring/registry.v1.json")),
  ).rejects.toThrow();
});

for (const [name, mutate, message] of [
  [
    "missing compiled declaration",
    async (root: string) =>
      rm(join(root, "apps/control-plane/dist/server-monitoring-store.d.ts.map")),
    "ENOENT",
  ],
  [
    "missing monitoring source module",
    async (root: string) => rm(join(root, "apps/control-plane/src/server-monitoring-runtime.ts")),
    "monitoring-module-set-invalid",
  ],
  [
    "unreviewed extra monitoring module",
    async (root: string) =>
      put(root, "apps/control-plane/src/server-monitoring-evil.ts", "export {};"),
    "monitoring-module-set-invalid",
  ],
  [
    "changed native worker",
    async (root: string) =>
      put(root, "deployment/server-monitoring/Worker.ps1", "throw 'unreviewed';"),
    "monitoring-operator-manifest-mismatch",
  ],
] as const)
  it(`rejects ${name} before changing the disposable package`, async () => {
    const fake = await inertSource(),
      root = await packageFixture();
    const marker = "apps/control-plane/dist/review-workbook.js";
    await put(root, marker, "baseline fixture remains unchanged");
    await mutate(fake);
    await expect(
      execute(process.execPath, [helper, fake, root, "--monitoring"], { windowsHide: true }),
    ).rejects.toThrow(message);
    expect(await readFile(join(root, marker), "utf8")).toBe("baseline fixture remains unchanged");
  });

it("requires monitoring explicitly for release builds while preserving Reviews-only helper compatibility", async () => {
  const fake = await inertSource();
  for (const name of modules) await rm(join(fake, `apps/control-plane/src/${name}.ts`));
  const ordinary = await packageFixture();
  const copied = await execute(process.execPath, [helper, fake, ordinary], { windowsHide: true });
  expect(JSON.parse(copied.stdout).monitoringModules).toEqual([]);
  const required = await packageFixture();
  await expect(
    execute(process.execPath, [helper, fake, required, "--monitoring"], { windowsHide: true }),
  ).rejects.toThrow("monitoring-module-set-invalid");
});

it("includes the explicitly allowed central operator CLI when its source and four compiled artifacts exist", async () => {
  const fake = await inertSource(),
    root = await packageFixture();
  await put(fake, "apps/control-plane/src/server-monitoring-central.ts", "export {};\n");
  for (const suffix of suffixes)
    await put(fake, `apps/control-plane/dist/server-monitoring-central.${suffix}`, "export {};\n");
  const copied = await execute(process.execPath, [helper, fake, root, "--monitoring"], {
    windowsHide: true,
  });
  expect(JSON.parse(copied.stdout).monitoringModules).toEqual(
    [...modules, "server-monitoring-central"].sort(),
  );
  for (const suffix of suffixes)
    expect(
      await readFile(
        join(root, `apps/control-plane/dist/server-monitoring-central.${suffix}`),
        "utf8",
      ),
    ).toBe("export {};\n");
});

it.skipIf(process.platform !== "win32")(
  "runs the actual frozen delta guard for bounded monitoring artifacts and rejects private/unreviewed paths",
  async () => {
    const script = join(temporary, "monitoring-delta.ps1"),
      cases = join(temporary, "monitoring-delta.json");
    await writeFile(
      cases,
      JSON.stringify({
        allowed: [
          ...[...modules, "server-monitoring-central"].flatMap((name) =>
            suffixes.map((suffix) => `apps/control-plane/dist/${name}.${suffix}`),
          ),
          ...suffixes.map(
            (suffix) =>
              `apps/control-plane/node_modules/@frevos/contracts/dist/server-monitoring.${suffix}`,
          ),
          "apps/control-plane/migrations/0008_server_monitoring_state.sql",
          ...operatorFiles.map((name) => `deployment/server-monitoring/${name}`),
        ],
        denied: [
          ".env",
          "apps/control-plane/.env",
          "jobs/pairings/pairing.json",
          "data/server-monitoring/ws_fixture.json",
          "deployment/server-monitoring/registry.v1.json",
          "deployment/server-monitoring/runtime.json",
          "deployment/server-monitoring/credentials/profile.dpapi",
          "deployment/server-monitoring/incoming/credential-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
          "deployment/server-monitoring/Worker.ps1.bak",
          "deployment/server-monitoring/Other.ps1",
          "apps/control-plane/dist/server-monitoring-evil.js",
          "apps/control-plane/migrations/0009_unreviewed.sql",
        ],
      }),
    );
    await writeFile(
      script,
      [
        "param([string]$HttpCommon,[string]$Cases)",
        "$ErrorActionPreference='Stop'",
        ". $HttpCommon",
        "$casesData=Get-Content -LiteralPath $Cases -Raw|ConvertFrom-Json",
        "$empty=[pscustomobject]@{files=@()}",
        "foreach($path in $casesData.allowed){$candidate=[pscustomobject]@{files=@([pscustomobject]@{path=$path;sha256=('a'*64)})};Assert-ServixDelta $empty $candidate}",
        "foreach($path in $casesData.denied){foreach($mode in @('add','change','delete')){$old=[pscustomobject]@{files=@([pscustomobject]@{path=$path;sha256=('a'*64)})};$new=[pscustomobject]@{files=@([pscustomobject]@{path=$path;sha256=('b'*64)})};$prior=if($mode -ceq 'add'){$empty}else{$old};$next=if($mode -ceq 'delete'){$empty}else{$new};$denied=$false;try{Assert-ServixDelta $prior $next}catch{if($_.Exception.Message -notmatch 'Unexpected Servix dashboard delta|Protected persistent state changed'){throw};$denied=$true};if(-not $denied){throw ('Unsafe monitoring delta accepted: '+$path+' / '+$mode)}}}",
        "Write-Output 'actual-powershell-monitoring-delta-pass'",
      ].join("\r\n"),
    );
    const result = await execute(
      join(
        process.env["SystemRoot"] ?? "C:/Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        script,
        "-HttpCommon",
        join(source, "deployment/server20/HttpCommon.ps1"),
        "-Cases",
        cases,
      ],
      { timeout: 15000, windowsHide: true },
    );
    expect(result.stdout).toContain("actual-powershell-monitoring-delta-pass");
  },
);
