import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, expect, it } from "vitest";

const execute = promisify(execFile);
const source = fileURLToPath(new URL("../../..", import.meta.url));
const helper = join(source, "deployment/server20/Copy-ReviewRuntime.mjs");
let temporary: string;
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), "frevos-review-package-tests-"));
});
afterAll(async () => {
  if (
    dirname(resolve(temporary)) !== resolve(tmpdir()) ||
    !basename(temporary).startsWith("frevos-review-package-tests-")
  )
    throw Error("package-fixture-cleanup-path-denied");
  await rm(temporary, { recursive: true, force: true });
});
async function fixturePackage() {
  const root = join(temporary, "servix-release-" + randomUUID().replaceAll("-", ""), "package");
  await mkdir(join(root, "apps/control-plane/node_modules/@frevos/contracts"), { recursive: true });
  await writeFile(join(root, "release-manifest.json"), JSON.stringify({ version: 1, files: [] }));
  await writeFile(
    join(root, "apps/control-plane/package.json"),
    JSON.stringify({
      name: "@frevos/control-plane",
      type: "module",
      dependencies: { zod: "4.6.6" },
    }),
  );
  await writeFile(
    join(root, "apps/control-plane/node_modules/@frevos/contracts/package.json"),
    JSON.stringify({ name: "@frevos/contracts", type: "module", exports: "./dist/index.js" }),
  );
  return root;
}
async function copyFixtureDependencies(root: string) {
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
  for (const file of [
    "review-authority",
    "review-registers",
    "review-workbook",
    "review-link-checker",
    "review-monitor-schedule",
    "review-postgres-store",
    "review-migration",
    "review-central-migrate",
  ])
    for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
      await rm(join(root, `apps/control-plane/dist/${file}.${suffix}`), { force: true });
}
function workbook() {
  const parts = {
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml":
      '<workbook xmlns:r="urn:r"><sheets><sheet name="Fixture" r:id="sheet1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="sheet1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Fixture</t></is></c></row></sheetData></worksheet>',
  };
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(parts).map(([name, text]) => [name, strToU8(text)]))),
  ).toString("base64");
}
it("copies real compiled Reviews modules and an isolated production dependency closure that imports outside the checkout", async () => {
  const root = await fixturePackage();
  await copyFixtureDependencies(root);
  const copied = await execute(process.execPath, [helper, source, root], {
    timeout: 30000,
    windowsHide: true,
  });
  const receipt = JSON.parse(copied.stdout);
  expect(receipt.modules).toEqual(
    expect.arrayContaining([
      "review-authority",
      "review-registers",
      "review-workbook",
      "review-link-checker",
      "review-monitor-schedule",
      "review-postgres-store",
      "review-migration",
      "review-central-migrate",
    ]),
  );
  expect(receipt.dependencies).toBeGreaterThan(2);
  const proof = JSON.parse(
    await readFile(join(root, "deployment/server20/review-runtime-proof.json"), "utf8"),
  );
  expect(
    proof.files.some((file: { path: string }) =>
      file.path.includes("fast-xml-parser/node_modules/@nodable/entities"),
    ),
  ).toBe(true);
  expect(
    proof.files.some(
      (file: { path: string }) =>
        file.path === "apps/control-plane/migrations/0007_review_workspace_state.sql",
    ),
  ).toBe(true);
  const script = [
    `const {parseReviewWorkbook}=await import(${JSON.stringify(pathToFileURL(join(root, "apps/control-plane/dist/review-workbook.js")).href)});`,
    `const {ReviewRegisters}=await import(${JSON.stringify(pathToFileURL(join(root, "apps/control-plane/dist/review-registers.js")).href)});`,
    `const {checkReviewLink}=await import(${JSON.stringify(pathToFileURL(join(root, "apps/control-plane/dist/review-link-checker.js")).href)});`,
    `await import(${JSON.stringify(pathToFileURL(join(root, "apps/control-plane/dist/review-monitor-schedule.js")).href)});`,
    `const workbook=parseReviewWorkbook({fileName:'fixture.xlsx',contentBase64:${JSON.stringify(workbook())}});`,
    "if(workbook.sheets[0].rows[0].cells[0].text!=='Fixture'||typeof ReviewRegisters!=='function')throw Error('packaged-import-failed');",
    "const result=await checkReviewLink({id:'fixture',label:'Fixture',url:'https://never-request.invalid/',expectedText:'',expectedStatuses:[200]},{allowedOrigins:[],allowPrivate:false,timeoutMs:1000,maxBytes:1024,maxRedirects:0});",
    "if(result.status!=='blocked')throw Error('packaged-policy-failed');process.stdout.write('packaged-imports-pass');",
  ].join("\n");
  const imported = await execute(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: root,
    timeout: 15000,
    windowsHide: true,
  });
  expect(imported.stdout).toBe("packaged-imports-pass");
});

async function fakeSource() {
  const root = join(temporary, "source-" + randomUUID());
  await mkdir(join(root, "apps/control-plane/src"), { recursive: true });
  await mkdir(join(root, "apps/control-plane/dist"), { recursive: true });
  await mkdir(join(root, "apps/control-plane/migrations"), { recursive: true });
  await writeFile(
    join(root, "apps/control-plane/migrations/0007_review_workspace_state.sql"),
    "-- inert packaging fixture\n",
  );
  await mkdir(join(root, "packages/contracts/dist"), { recursive: true });
  await mkdir(join(root, "node_modules"), { recursive: true });
  const modules = [
    "review-authority",
    "review-registers",
    "review-workbook",
    "review-link-checker",
  ];
  for (const name of modules) {
    await writeFile(join(root, `apps/control-plane/src/${name}.ts`), "export {};");
    for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
      await writeFile(join(root, `apps/control-plane/dist/${name}.${suffix}`), "export {};");
  }
  for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"])
    await writeFile(join(root, `packages/contracts/dist/review-registers.${suffix}`), "export {};");
  await writeFile(
    join(root, "apps/control-plane/package.json"),
    JSON.stringify({
      name: "@frevos/control-plane",
      dependencies: { fflate: "0.8.3", "fast-xml-parser": "5.12.0" },
    }),
  );
  await mkdir(join(root, "node_modules/fflate"));
  await mkdir(join(root, "node_modules/fast-xml-parser"));
  await writeFile(
    join(root, "node_modules/fflate/package.json"),
    JSON.stringify({ name: "fflate", version: "0.8.3" }),
  );
  await writeFile(
    join(root, "node_modules/fast-xml-parser/package.json"),
    JSON.stringify({
      name: "fast-xml-parser",
      version: "5.12.0",
      dependencies: { missing: "1.0.0" },
    }),
  );
  await writeFile(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\nimporters:\n  apps/control-plane:\n    dependencies:\n      fflate:\n        specifier: 0.8.3\n        version: 0.8.3\n      fast-xml-parser:\n        specifier: 5.12.0\n        version: 5.12.0\nsnapshots:\n  fflate@0.8.3: {}\n  fast-xml-parser@5.12.0:\n    dependencies:\n      missing: 1.0.0\n  missing@1.0.0: {}\n",
  );
  return root;
}
it("rejects a missing transitive dependency before altering the disposable package", async () => {
  const fake = await fakeSource(),
    root = await fixturePackage();
  const marker = join(root, "apps/control-plane/dist/review-workbook.js");
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, "baseline fixture");
  await expect(
    execute(process.execPath, [helper, fake, root], { windowsHide: true }),
  ).rejects.toThrow("dependency-missing");
  expect(await readFile(marker, "utf8")).toBe("baseline fixture");
});
it("rejects a dependency link outside the frozen installation and ordinary live-style destinations", async () => {
  const fake = await fakeSource(),
    root = await fixturePackage();
  await rm(join(fake, "node_modules/fflate"), { recursive: true });
  const foreign = join(temporary, "outside-dependency");
  await mkdir(foreign);
  await writeFile(
    join(foreign, "package.json"),
    JSON.stringify({ name: "fflate", version: "0.8.3" }),
  );
  await symlink(
    foreign,
    join(fake, "node_modules/fflate"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(
    execute(process.execPath, [helper, fake, root], { windowsHide: true }),
  ).rejects.toThrow("dependency-escaped-installation");
  await expect(
    execute(process.execPath, [helper, fake, join(temporary, "application")], {
      windowsHide: true,
    }),
  ).rejects.toThrow("destination-is-not-release-output");
});
it("rejects an application dependency version that does not match its frozen lock importer", async () => {
  const fake = await fakeSource(),
    root = await fixturePackage();
  const lock = join(fake, "pnpm-lock.yaml");
  await writeFile(
    lock,
    (await readFile(lock, "utf8")).replace("specifier: 0.8.3", "specifier: 0.8.2"),
  );
  await expect(
    execute(process.execPath, [helper, fake, root], { windowsHide: true }),
  ).rejects.toThrow("application-lock-version-mismatch");
});

it.skipIf(process.platform !== "win32")(
  "runs the actual PowerShell delta guard: permits only the bounded Reviews overlay and denies private/unrelated paths",
  async () => {
    const script = join(temporary, "test-review-delta.ps1"),
      cases = join(temporary, "delta-cases.json");
    await writeFile(
      cases,
      JSON.stringify({
        allowed: [
          "apps/control-plane/dist/review-authority.js",
          "apps/control-plane/dist/review-registers.js.map",
          "apps/control-plane/dist/review-workbook.d.ts",
          "apps/control-plane/dist/review-link-checker.d.ts.map",
          "apps/control-plane/dist/review-monitor-schedule.js",
          "apps/control-plane/dist/review-postgres-store.js",
          "apps/control-plane/dist/review-migration.js",
          "apps/control-plane/dist/review-central-migrate.js",
          "apps/control-plane/migrations/0007_review_workspace_state.sql",
          "apps/control-plane/node_modules/@frevos/contracts/dist/review-registers.js",
          "apps/control-plane/node_modules/fflate/package.json",
          "apps/control-plane/node_modules/fast-xml-parser/node_modules/@nodable/entities/package.json",
          "deployment/server20/review-runtime-proof.json",
        ],
        denied: [
          ".env",
          "apps/control-plane/.env",
          "deployment/servix/.env",
          "deployment/servix/.env.production",
          "jobs/pairings/pairing.json",
          "data/review-registers/ws_fixture.json",
          "apps/control-plane/node_modules/unrelated/package.json",
          "apps/control-plane/dist/review-evil.js",
          "apps/control-plane/migrations/0008_unreviewed.sql",
          "apps/control-plane/dist/review-registers.env",
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
        "foreach($path in $casesData.denied){foreach($mode in @('add','change','delete')){$old=[pscustomobject]@{files=@([pscustomobject]@{path=$path;sha256=('a'*64)})};$new=[pscustomobject]@{files=@([pscustomobject]@{path=$path;sha256=('b'*64)})};$prior=if($mode -ceq 'add'){$empty}else{$old};$next=if($mode -ceq 'delete'){$empty}else{$new};$denied=$false;try{Assert-ServixDelta $prior $next}catch{if($_.Exception.Message -notmatch 'Unexpected Servix dashboard delta|Protected persistent state changed'){throw};$denied=$true};if(-not $denied){throw ('Unsafe delta accepted: '+$path+' / '+$mode)}}}",
        "Write-Output 'actual-powershell-review-delta-pass'",
      ].join("\r\n"),
    );
    const powershell = join(
      process.env["SystemRoot"] ?? "C:/Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    );
    const result = await execute(
      powershell,
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
    expect(result.stdout).toContain("actual-powershell-review-delta-pass");
  },
);
