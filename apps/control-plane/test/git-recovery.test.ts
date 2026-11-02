import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const { GitRecovery, relative, iniSettings } = createRequire(import.meta.url)(
  "../../../deployment/servix/GitRecovery.cjs",
);
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "git-recovery-unit-"));
  roots.push(root);
  const workRoot = join(root, "engine");
  await mkdir(workRoot);
  const config = {
    workRoot,
    backupRoot: join(root, "backups"),
    restoreRoot: join(root, "restores"),
    maxBytes: 1048576,
    maxFiles: 100,
    workspaceId: "ws_team",
    installationId: "forge_" + "a".repeat(32),
  };
  const slash = (p: string) => p.replaceAll("\\", "/");
  const ini = `[database]\nDB_TYPE = sqlite3\nPATH = ${slash(join(workRoot, "data/gitea.db"))}\n[repository]\nROOT = ${slash(join(workRoot, "repositories"))}\n[server]\nAPP_DATA_PATH = ${slash(join(workRoot, "data"))}\n`;
  await writeFile(join(workRoot, "app.ini"), ini);
  await mkdir(join(workRoot, "data"));
  await writeFile(join(workRoot, "data/gitea.db"), "synthetic-db");
  await mkdir(join(workRoot, "repositories"));
  await writeFile(join(workRoot, "repositories/refs"), "fixture-code-ref");
  let running = true;
  const lifecycle = {
    running: vi.fn(async () => running),
    stop: vi.fn(async () => {
      running = false;
    }),
    start: vi.fn(async () => {
      running = true;
    }),
  };
  const key = randomBytes(32);
  const recovery = new GitRecovery(config, lifecycle, async () => Buffer.from(key));
  return { root, config, recovery, lifecycle, key, ini };
}
it("creates authenticated encrypted full backups and isolated restores without replacing the engine", async () => {
  const f = await fixture(),
    m = await f.recovery.backup();
  expect(f.lifecycle.stop).toHaveBeenCalledOnce();
  expect(f.lifecycle.start).toHaveBeenCalledOnce();
  expect(m.files).toBe(3);
  const bytes = await readFile(join(f.config.backupRoot, m.id + ".sealed"));
  expect(bytes.includes(Buffer.from("synthetic-db"))).toBe(false);
  const restored = await f.recovery.restoreIsolated(m.id, m.sha256);
  expect(restored.root).not.toBe(f.config.workRoot);
  expect(await readFile(join(restored.root, "data/gitea.db"), "utf8")).toBe("synthetic-db");
  expect(await readFile(join(f.config.workRoot, "repositories/refs"), "utf8")).toBe(
    "fixture-code-ref",
  );
  expect(await f.recovery.list()).toEqual([m]);
  await expect(f.recovery.restoreIsolated(m.id, "b".repeat(64))).rejects.toThrow("backup-changed");
  bytes[20] = (bytes[20] ?? 0) ^ 1;
  await writeFile(join(f.config.backupRoot, m.id + ".sealed"), bytes);
  await expect(f.recovery.restoreIsolated(m.id, m.sha256)).rejects.toThrow("archive-integrity");
});
it("can restore an authenticated saved engine after its original data folder has been lost", async () => {
  const f = await fixture(),
    m = await f.recovery.backup();
  expect(resolve(f.config.workRoot).startsWith(resolve(f.root) + sep)).toBe(true);
  await rm(f.config.workRoot, { recursive: true, force: true });
  const restored = await f.recovery.restoreIsolated(m.id, m.sha256);
  expect(await readFile(join(restored.root, "data/gitea.db"), "utf8")).toBe("synthetic-db");
  await expect(readFile(join(f.config.workRoot, "data/gitea.db"))).rejects.toThrow();
});
it("rejects links, overlapping roots, external storage and non-SQLite data before pausing the service", async () => {
  const f = await fixture();
  const overlap = new GitRecovery(
    { ...f.config, backupRoot: join(f.config.workRoot, "backups") },
    f.lifecycle,
    async () => Buffer.from(f.key),
  );
  await expect(overlap.backup()).rejects.toThrow("configuration-invalid");
  if (process.platform === "win32") {
    const sameFolder = new GitRecovery(
      { ...f.config, backupRoot: f.config.workRoot.toUpperCase() },
      f.lifecycle,
      async () => Buffer.from(f.key),
    );
    await expect(sameFolder.backup()).rejects.toThrow("configuration-invalid");
    expect(f.lifecycle.stop).not.toHaveBeenCalled();
  }
  await writeFile(join(f.config.workRoot, "app.ini"), f.ini.replace("sqlite3", "postgres"));
  await expect(f.recovery.backup()).rejects.toThrow("database-adapter-required");
  expect(f.lifecycle.stop).not.toHaveBeenCalled();
  await writeFile(join(f.config.workRoot, "app.ini"), f.ini + "[storage]\nSTORAGE_TYPE = minio\n");
  await expect(f.recovery.backup()).rejects.toThrow("external-storage-unsupported");
  await writeFile(join(f.config.workRoot, "app.ini"), f.ini);
  const other = join(f.root, "other");
  await mkdir(other);
  await symlink(
    other,
    join(f.config.workRoot, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(f.recovery.backup()).rejects.toThrow("linked-path");
  expect(f.lifecycle.start).toHaveBeenCalledOnce();
});
it("restarts the exact paused engine when a capacity failure interrupts backup and fails closed on unknown keys", async () => {
  const f = await fixture();
  const small = new GitRecovery({ ...f.config, maxFiles: 1 }, f.lifecycle, async () =>
    Buffer.from(f.key),
  );
  await expect(small.backup()).rejects.toThrow("snapshot-capacity");
  expect(f.lifecycle.start).toHaveBeenCalledOnce();
  const noKey = new GitRecovery(f.config, f.lifecycle, async () => Buffer.alloc(2));
  await expect(noKey.backup()).rejects.toThrow("key-unavailable");
  for (const p of ["../x", "/absolute", "C:/escape", "a\\b", "a/../b", "a\nfile"])
    expect(relative(p)).toBe(false);
  expect(relative("repositories/project.git/objects/pack/file.pack")).toBe(true);
  expect(() => iniSettings("[server]\nHTTP_PORT = 1\nHTTP_PORT = 2")).toThrow("duplicate-setting");
});
