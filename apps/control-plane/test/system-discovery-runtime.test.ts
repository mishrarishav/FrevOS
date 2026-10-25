import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultDiscoveryPolicy } from "@frevos/contracts";
import { afterEach, expect, it } from "vitest";

const require = createRequire(import.meta.url),
  { SystemDiscovery } = require("../../../deployment/servix/SystemDiscovery.cjs"),
  prerequisites = require("../../../deployment/servix/SystemPrerequisites.cjs"),
  safety = require("../../../deployment/servix/DiscoverySafety.cjs"),
  { linuxEvent } = require("../../../deployment/servix/FileAudit.cjs");
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
it("bounds the async filesystem backlog during a blocked record and reserves capacity against a noise storm", async () => {
  const collector = new SystemDiscovery(
    {
      deviceId: "fc_" + "e".repeat(32),
      mode: "system",
      monitoringRoot: "C:\\",
      stateRoot: "C:\\fixture-state",
    },
    async () => ({}),
  );
  collector.policy = { ...defaultDiscoveryPolicy, enabled: true };
  collector.consent = true;
  let release!: () => void;
  collector.record = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  collector.scheduleRecord("C:\\", "C:\\src\\first.ts", "change");
  for (let i = 0; i < 2000; i++) collector.scheduleRecord("C:\\", `C:\\Temp\\f${i}.tmp`, "change");
  expect(collector.workQueue.length).toBeLessThanOrEqual(51);
  for (let i = 0; i < 2000; i++) collector.scheduleRecord("C:\\", `C:\\src\\f${i}.ts`, "change");
  expect(collector.workQueue).toHaveLength(256);
  expect(collector.workQueue.every((j: { noise: boolean }) => !j.noise)).toBe(true);
  expect(collector.dropped).toBeGreaterThan(0);
  expect(collector.gaps.has("buffer-overflow")).toBe(true);
  collector.stopped = true;
  release();
  await collector.work;
});
it("keeps normal dev folders available while excluding absolute Linux pseudo filesystems", () => {
  expect(safety.excluded("dev/app.ts")).toBe(false);
  expect(safety.excluded("src/sys/app.ts")).toBe(false);
  expect(safety.excluded("/proc/123/status")).toBe(true);
  expect(safety.safeEvent({ root: "/", path: "dev/null" })).toBeNull();
  expect(safety.safeEvent({ root: "D:\\", path: "dev/app.ts" })).not.toBeNull();
});
async function eventually(test: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (test()) return;
    await delay(50);
  }
  expect(test()).toBe(true);
}
it("tracks consented system-only metadata in actual folders without prerequisites or content snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-system-metadata-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state"),
    deviceId = "fc_" + "e".repeat(32);
  await mkdir(stateRoot);
  await writeFile(
    join(stateRoot, "discovery-consent.json"),
    JSON.stringify({ version: 1, deviceId, metadata: true }),
  );
  const file = join(root, "code.ts");
  await writeFile(file, "export const initial = true;\n");
  const collector = new SystemDiscovery(
    { mode: "system", deviceId, monitoringRoot: root, stateRoot },
    async () => ({}),
    { rootProvider: async () => [root] },
  );
  await collector.initialize();
  cleanups.push(() => collector.stop());
  await collector.configure({
    revision: 1,
    policy: {
      ...defaultDiscoveryPolicy,
      enabled: true,
      useExistingAudit: false,
      contentFolders: ["."],
    },
  });
  await eventually(() => !collector.scanning && collector.watchers.has(root));
  await writeFile(file, "export const privateBody = 'synthetic-content';\n");
  await eventually(() => collector.queue.some((e: { path: string }) => e.path === "code.ts"));
  await collector.work;
  expect(
    collector.queue.find((e: { path: string }) => e.path === "code.ts").content,
  ).toBeUndefined();
  expect(collector.versions.size).toBe(0);
  expect((await collector.sample()).tools).toEqual([]);
  await collector.persist();
  expect(await readFile(join(stateRoot, "discovery/spool.json"), "utf8")).not.toContain(
    "synthetic-content",
  );
});
it("collects actual filesystem changes with selected redacted text, bounded offline receipts and no symlink or credential-file capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-discovery-events-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state"),
    src = join(root, "src");
  await mkdir(stateRoot);
  await mkdir(src);
  const deviceId = "fc_" + "d".repeat(32),
    config = { deviceId, profileId: "fixture-source", repository: root, stateRoot };
  await writeFile(
    join(stateRoot, "discovery-consent.json"),
    JSON.stringify({ version: 1, deviceId, metadata: true }),
  );
  const file = join(src, "code.ts");
  await writeFile(file, "export const version = 1;\n");
  let online = false;
  const received: unknown[] = [];
  const policy = {
    ...defaultDiscoveryPolicy,
    enabled: true,
    allLocalDrives: false,
    useExistingAudit: false,
    contentFolders: ["src"],
    maxEvents: 100,
  };
  const api = async (route: string, input: { events: { sequence: number }[]; bootId: string }) => {
    if (route.endsWith("/policy")) return { revision: 1, policy };
    if (!online) throw Error("connector-http-503");
    received.push(input);
    return {
      accepted: true,
      bootId: input.bootId,
      sequence: Math.max(0, ...input.events.map((e) => e.sequence)),
    };
  };
  const collector = new SystemDiscovery(config, api, { rootProvider: async () => [root] });
  await collector.initialize();
  cleanups.push(() => collector.stop());
  await collector.configure({ revision: 1, policy });
  await eventually(() => !collector.scanning && collector.watchers.size >= 2);
  await writeFile(file, 'export const version = 2;\nconst password = "SYNTHETIC_PRIVATE_VALUE";\n');
  await eventually(() => collector.queue.some((e: { path: string }) => e.path === "src/code.ts"));
  await collector.work;
  const event = collector.queue.find((e: { path: string }) => e.path === "src/code.ts");
  expect(event.content.before).toContain("version = 1");
  expect(event.content.after).toContain("version = 2");
  expect(event.content.after).not.toContain("SYNTHETIC_PRIVATE_VALUE");
  await writeFile(join(src, ".env.prod"), "DB_PASSWORD=SYNTHETIC_ENV_VALUE\n");
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(src, "linked"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(join(outside, "private.ts"), "const value = 42;");
  await delay(500);
  expect(
    collector.queue.some(
      (e: { path: string }) => e.path.includes(".env") || e.path.includes("linked/"),
    ),
  ).toBe(false);
  // Recreated folders must receive new watchers rather than retaining a watch
  // on the deleted inode. Its first scan establishes a new text baseline.
  const nested = join(src, "nested");
  await mkdir(nested);
  await eventually(() => collector.watchers.has(nested));
  const childFolder = join(nested, "child");
  await mkdir(childFolder);
  await eventually(() => collector.watchers.has(childFolder));
  await rm(nested, { recursive: true });
  await eventually(() => !collector.watchers.has(nested) && !collector.watchers.has(childFolder));
  await mkdir(nested);
  await eventually(() => collector.watchers.has(nested));
  await writeFile(join(nested, "new.ts"), "export const recreated = true;\n");
  await eventually(() =>
    collector.queue.some((entry: { path: string }) => entry.path === "src/nested/new.ts"),
  );
  expect(collector.gaps.has("watch-failed")).toBe(true);
  await collector.tick();
  await collector.persist();
  const spool = await readFile(join(stateRoot, "discovery/spool.json"), "utf8");
  expect(spool).not.toContain("SYNTHETIC_PRIVATE_VALUE");
  expect(spool).not.toContain("SYNTHETIC_ENV_VALUE");
  const boot = collector.bootId;
  await collector.stop();
  const restarted = new SystemDiscovery(config, api, { rootProvider: async () => [root] });
  await restarted.initialize();
  cleanups.push(() => restarted.stop());
  expect(restarted.bootId).toBe(boot);
  expect(restarted.queue.length).toBeGreaterThan(0);
  online = true;
  await restarted.tick();
  expect(received.length).toBe(1);
  expect(restarted.queue).toEqual([]);
  expect(restarted.gaps.has("restart-history-unavailable")).toBe(true);
});
it("requires local consent and re-verifies repository scope without creating synthetic attribution", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-discovery-consent-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const collector = new SystemDiscovery(
    {
      deviceId: "fc_" + "f".repeat(32),
      profileId: "fixture-source",
      repository: root,
      stateRoot: join(root, "state"),
    },
    async () => ({
      revision: 1,
      policy: { ...defaultDiscoveryPolicy, enabled: true, useExistingAudit: false },
    }),
    { rootProvider: async () => [root] },
  );
  await collector.initialize();
  cleanups.push(() => collector.stop());
  await collector.configure({
    revision: 1,
    policy: { ...defaultDiscoveryPolicy, enabled: true, useExistingAudit: false },
  });
  expect(collector.watchers.size).toBe(0);
  expect(collector.gaps.has("local-enrollment-required")).toBe(true);
  collector.consent = true;
  collector.sourceVerified = false;
  await collector.configure({
    revision: 2,
    policy: { ...defaultDiscoveryPolicy, enabled: true, useExistingAudit: false },
  });
  expect(collector.watchers.size).toBe(0);
});
it("derives safe requirements, rejects command-bearing policy and unknown ranges, and exposes only allowlisted install recipes", async () => {
  expect(prerequisites.matches("24.19.0", ">=24.14.0 <25")).toBe(true);
  expect(prerequisites.matches("24.19.0", "^22.0.0")).toBe(false);
  expect(prerequisites.matches("24.19.0", "latest")).toBe(null);
  for (const file of [
    "AppData/Local/FrevOS/Connector/device/state.json",
    ".config/browser/session.json",
    ".cache/browser/history.json",
    ".env.production",
    "src/private-key.pem",
    "node_modules/example/index.js",
    "src/config.secret.json",
    ".git/config",
  ])
    expect(safety.excluded(file)).toBe(true);
  expect(safety.redact('{"password":"SYNTHETIC_PRIVATE"}\nexport const count = 2;')).toBe(
    "[sensitive line omitted]\nexport const count = 2;",
  );
  const root = await mkdtemp(join(tmpdir(), "devsetu-prerequisites-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ engines: { node: ">=24.0.0 <25" }, packageManager: "pnpm@11.21.0" }),
  );
  await writeFile(join(root, "global.json"), JSON.stringify({ sdk: { version: "8.0.302" } }));
  expect((await prerequisites.requirements(root)).requirements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "node", required: ">=24.0.0 <25" }),
      expect.objectContaining({ id: "dotnet", required: "8.0.302" }),
    ]),
  );
  const report = await prerequisites.inspect(root);
  expect(report.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(report.tools.some((t: { id: string }) => t.id === "git")).toBe(true);
  await expect(prerequisites.install(root, "a".repeat(64), ["git:>=2.30.0"])).rejects.toThrow(
    "prerequisite-preview-changed",
  );
  await writeFile(
    join(root, "devsetu.system.json"),
    JSON.stringify({
      version: 1,
      prerequisites: [{ id: "git", required: ">=2.30.0", command: "unsafe" }],
    }),
  );
  await expect(prerequisites.requirements(root)).rejects.toThrow(
    "prerequisite-manifest-review-required",
  );
});
it("attributes only successful OS write audit records and excludes read-only opens", () => {
  const records = [
    'type=SYSCALL msg=audit(1792836000.123:42): arch=c000003e syscall=257 success=yes a2=241 pid=123 uid=1000 exe="/usr/bin/editor"',
    'type=CWD msg=audit(1792836000.123:42): cwd="/home/dev/app"',
    'type=PATH msg=audit(1792836000.123:42): item=0 name="src/code.ts" nametype=NORMAL',
  ];
  expect(linuxEvent(records)[0]).toMatchObject({
    file: "/home/dev/app/src/code.ts",
    attribution: {
      user: "uid:1000",
      pid: 123,
      process: "editor",
      recordId: "42:0",
      auditSource: "linux-audit",
    },
  });
  expect(linuxEvent(records.map((l) => l.replace("a2=241", "a2=0")))).toEqual([]);
  expect(linuxEvent(records.map((l) => l.replace("success=yes", "success=no")))).toEqual([]);
});
