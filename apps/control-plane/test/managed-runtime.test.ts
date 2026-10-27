import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const require = createRequire(import.meta.url),
  u = require("../../../deployment/servix/PromotionFiles.cjs"),
  managed = require("../../../deployment/servix/ManagedRuntime.cjs");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
    expect(root).toContain("promotion-managed-");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "promotion-managed-"));
  roots.push(root);
  const id = `pm_${"a".repeat(32)}`,
    runtime = join(root, ".runtime/devsetu-promotions", id),
    owner = "S-1-5-21-111-222-333-444";
  const put = (file: string, bytes: string) => {
    fs.mkdirSync(dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  };
  const node = join(root, "tools/node.exe");
  put(node, "pinned synthetic node");
  for (const name of [
    "Run-SavedBackend.ps1",
    "ProductionBackendRuntime.cjs",
    "BackendArtifact.cjs",
  ])
    put(join(runtime, name), `pinned ${name}`);
  const selection = {
    version: 1,
    mode: "bundle",
    descriptor: `backend/.releases/${"b".repeat(64)}/artifact.json`,
    manifestSha256: "b".repeat(64),
  };
  const pointer = join(root, "backend/.runtime/devsetu-backend-artifact.json");
  put(pointer, JSON.stringify(selection));
  put(join(root, "backend/.env"), "SYNTHETIC_PROFILE=retained\n");
  const cfg = {
    root,
    profileId: "example-production",
    workspaceId: "ws_example",
    computer: "EXAMPLE",
    ownerSid: owner,
    port: 5011,
    manifestSha256: selection.manifestSha256,
    descriptor: selection.descriptor,
    nodeSha256: u.hash(node),
    environmentSha256: u.hash(join(root, "backend/.env")),
    entrySha256: u.hash(join(runtime, "ProductionBackendRuntime.cjs")),
    helperSha256: u.hash(join(runtime, "BackendArtifact.cjs")),
  };
  put(join(runtime, "runtime.json"), JSON.stringify(cfg));
  const configurationSha256 = u.hash(join(runtime, "runtime.json"));
  put(
    join(runtime, "activation-receipt.json"),
    JSON.stringify({
      id,
      status: "succeeded",
      configurationSha256,
      selection: { afterSha256: u.hash(pointer) },
    }),
  );
  const args = `-File "${join(runtime, "Run-SavedBackend.ps1")}" -ConfigurationSha256 ${configurationSha256}`;
  const known = {
    id,
    runtime,
    configurationSha256,
    launcherArguments: args,
    ownerSid: owner,
    descriptor: selection.descriptor,
    descriptorSha256: selection.manifestSha256,
    launcherSha256: u.hash(join(runtime, "Run-SavedBackend.ps1")),
  };
  const context = { target: { ...cfg, node, managedUpdates: true }, knownManaged: [known] };
  const candidate = {
    arguments: args,
    ownerSid: owner,
    leastPrivilege: true,
    passwordLogon: true,
    bootStart: true,
    actions: 1,
    execute: "powershell.exe",
    expectedPowerShell: "powershell.exe",
    workingDirectory: join(root, "backend"),
    taskXml: "reviewed synthetic task",
    process: {
      ownerSid: owner,
      command: `"${node}" "${join(runtime, "ProductionBackendRuntime.cjs")}" ${configurationSha256}`,
    },
  };
  return { root, runtime, put, context, candidate, pointer };
}
it("adopts only an exact successful managed receipt and rejects task, selection, launcher and argument drift", async () => {
  const f = await fixture();
  expect(managed.verify(f.context, f.candidate).id).toBe(f.context.knownManaged[0]?.id);
  for (const change of [
    { ownerSid: "S-1-5-18" },
    { leastPrivilege: false },
    { passwordLogon: false },
    { bootStart: false },
    { actions: 2 },
    { arguments: "changed" },
    { execute: "cmd.exe" },
    { workingDirectory: f.root },
  ])
    expect(() => managed.verify(f.context, { ...f.candidate, ...change })).toThrow();
  expect(() => managed.verify({ ...f.context, knownManaged: [] }, f.candidate)).toThrow();
  expect(() =>
    managed.verify(f.context, {
      ...f.candidate,
      process: { ...f.candidate.process, command: `${f.candidate.process.command} --unreviewed` },
    }),
  ).toThrow();
  f.put(join(f.runtime, "Run-SavedBackend.ps1"), "changed launcher");
  expect(() => managed.verify(f.context, f.candidate)).toThrow();
});
it("rejects environment changes before stopping a managed runtime", async () => {
  const f = await fixture();
  managed.verify(f.context, f.candidate);
  f.put(join(f.root, "backend/.env"), "SYNTHETIC_PROFILE=changed\n");
  expect(() => managed.verify(f.context, f.candidate)).toThrow();
});
it("requires the reviewed selection and configuration bytes without trusting a matching process name", async () => {
  const f = await fixture();
  f.put(f.pointer, '{"version":1,"mode":"source"}');
  expect(() => managed.verify(f.context, f.candidate)).toThrow();
  expect(
    managed.commandMatches(
      `node "${join(f.root, "other.js")}" ${"a".repeat(64)}`,
      join(f.runtime, "ProductionBackendRuntime.cjs"),
      "a".repeat(64),
    ),
  ).toBe(false);
});
