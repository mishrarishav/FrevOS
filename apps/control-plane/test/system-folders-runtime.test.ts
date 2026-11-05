import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";

const require = createRequire(import.meta.url),
  { browse, search } = require("../../../deployment/servix/FolderBrowse.cjs"),
  { discover } = require("../../../deployment/servix/LocalDevelopment.cjs"),
  { projectFolders } = require("../../../deployment/servix/SystemPrerequisites.cjs");
const roots: string[] = [];
it.skipIf(process.platform !== "win32")(
  "reports real Windows write denial while allowing ordinary-user creation elsewhere",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "devsetu-permission-runtime-"));
    roots.push(root);
    const restricted = join(root, "restricted"),
      state = join(root, "agent", "state");
    await mkdir(restricted);
    await mkdir(state, { recursive: true });
    const fixture = fileURLToPath(new URL("./fixtures/explorer-permission.ps1", import.meta.url));
    const ps = join(process.env["WINDIR"]!, "System32/WindowsPowerShell/v1.0/powershell.exe");
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "RemoteSigned",
      "-File",
      fixture,
      "-Directory",
      restricted,
    ];
    const config = { deviceId: "fc_" + "f".repeat(32), repository: root, stateRoot: state };
    const request = (path: string, kind: string, name: string) =>
      browse(
        config,
        {
          version: 1,
          requestId: "fb_" + "e".repeat(32),
          workspaceId: "ws_server20",
          actor: "usr_fixture",
          request: {
            version: 1,
            deviceId: config.deviceId,
            root,
            path,
            page: 0,
            includeFiles: true,
            create: { kind, name },
          },
        },
        [],
        true,
      );
    try {
      await promisify(execFile)(ps, args, { windowsHide: true, timeout: 15000 });
      expect((await request("restricted", "file", "notes.txt")).errorCode).toBe(
        "folder-permission-denied",
      );
      expect((await request("restricted", "directory", "New folder")).errorCode).toBe(
        "folder-permission-denied",
      );
      await expect(stat(join(restricted, "notes.txt"))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await request("", "file", "notes.txt")).status).toBe("succeeded");
      expect((await stat(join(root, "notes.txt"))).size).toBe(0);
    } finally {
      await promisify(execFile)(ps, [...args, "-Restore"], { windowsHide: true, timeout: 15000 });
    }
  },
  60000,
);
it("executes Linux explorer metadata and exclusive creation with actual non-root files", async () => {
  const env = require("../../../deployment/servix/NativePlatform.cjs").buildEnvironment();
  const { stdout } = await promisify(execFile)(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      "1000:1000",
      "--memory",
      "256m",
      "--cpus",
      "1",
      "-v",
      fileURLToPath(new URL("../../../", import.meta.url)) + ":/source:ro",
      "--entrypoint",
      "python3",
      "python@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f",
      "/source/apps/control-plane/test/file-explorer-linux.fixture.py",
    ],
    { env, windowsHide: true, timeout: 90000, maxBuffer: 65536 },
  );
  expect(JSON.parse(stdout)).toEqual({
    status: "PASS",
    metadata: true,
    exclusiveCreation: true,
    noLinkTraversal: true,
  });
}, 100000);
it("locates bounded metadata candidates without contents, links, secret folders or arbitrary roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-search-runtime-"));
  roots.push(root);
  const state = join(root, "state"),
    outside = join(root, "outside");
  await mkdir(state);
  await mkdir(outside);
  await mkdir(join(root, "Fixture-app"));
  await writeFile(join(root, "Fixture-app", "code.txt"), "never read this private content");
  await mkdir(join(root, ".ssh", "Fixture-hidden"), { recursive: true });
  await mkdir(join(outside, "Fixture-escape"));
  await symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  const deviceId = "fc_" + "a".repeat(32),
    config = { deviceId, stateRoot: state },
    job = {
      version: 1,
      id: "fd_" + "b".repeat(32),
      workspaceId: "ws_server20",
      actor: "usr_fixture",
      query: "Fixture",
      request: { version: 1, projectId: "prj_fixture", deviceId },
      roots: [root],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
      status: "working",
    };
  const found = await search(config, job, [root], [root], true);
  expect(found.status).toBe("succeeded");
  expect(found.result.matches.some((m: { path: string }) => m.path === "Fixture-app")).toBe(true);
  expect(
    found.result.matches.some(
      (m: { path: string }) => m.path.includes(".ssh") || m.path.startsWith("escape/"),
    ),
  ).toBe(false);
  expect(JSON.stringify(found)).not.toContain("private content");
  expect((await search(config, job, [root], [root], false)).status).toBe("failed");
  expect((await search(config, { ...job, roots: [outside] }, [root], [root], true)).status).toBe(
    "failed",
  );
  expect(
    (await search(config, { ...job, query: "!" }, [root], [root], true)).result.gaps,
  ).toContain("query-unavailable");
  let now = 0;
  expect(
    (await search(config, job, [root], [root], true, { now: () => (now += 2100) })).result.partial,
  ).toBe(true);
});
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it("lists real files and ZIP metadata and exclusively creates empty files/folders without traversing links or overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-explorer-runtime-"));
  roots.push(root);
  const project = join(root, "project"),
    state = join(root, "state");
  await mkdir(project);
  await mkdir(state);
  await writeFile(join(project, "release.zip"), Buffer.from([80, 75, 3, 4]));
  await writeFile(join(project, "existing.txt"), "preserve these bytes");
  await symlink(state, join(project, "linked"), process.platform === "win32" ? "junction" : "dir");
  const deviceId = "fc_" + "a".repeat(32),
    config = { deviceId, repository: project, stateRoot: state },
    job = {
      version: 1,
      requestId: "fb_" + "b".repeat(32),
      workspaceId: "ws_server20",
      actor: "usr_fixture",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
      status: "working",
      request: { version: 1, deviceId, root: project, path: "", page: 0, includeFiles: true },
    };
  const listed = await browse(config, job, [], true);
  expect(listed.status).toBe("succeeded");
  expect(listed.result.entries).toContainEqual(
    expect.objectContaining({ name: "release.zip", kind: "file", size: 4 }),
  );
  expect(listed.result.entries).toContainEqual(
    expect.objectContaining({ name: "linked", kind: "link", excluded: true }),
  );
  expect(JSON.stringify(listed)).not.toContain("preserve these bytes");
  const create = (kind: string, name: string) =>
    browse(config, { ...job, request: { ...job.request, create: { kind, name } } }, [], true);
  const directory = await create("directory", "New project");
  expect(directory.errorCode).toBeUndefined();
  expect(directory).toMatchObject({ status: "succeeded" });
  expect(directory.result.created).toEqual({ kind: "directory", path: "New project" });
  expect((await stat(join(project, "New project"))).isDirectory()).toBe(true);
  expect((await create("file", "notes.txt")).status).toBe("succeeded");
  expect((await stat(join(project, "notes.txt"))).size).toBe(0);
  expect((await create("file", "existing.txt")).errorCode).toBe("folder-already-exists");
  expect((await create("directory", "New project")).errorCode).toBe("folder-already-exists");
  expect(await readFile(join(project, "existing.txt"), "utf8")).toBe("preserve these bytes");
  for (const name of [
    "../escape",
    "CON.txt",
    "new.",
    ".env",
    "secret.txt",
    "name:stream",
    "bad\\name",
  ])
    expect((await create("file", name)).errorCode).toBe("folder-scope-denied");
  expect(
    (
      await browse(
        config,
        {
          ...job,
          request: { ...job.request, path: "linked", create: { kind: "file", name: "out.txt" } },
        },
        [],
        true,
      )
    ).errorCode,
  ).toBe("folder-scope-denied");
  await expect(stat(join(state, "out.txt"))).rejects.toMatchObject({ code: "ENOENT" });
}, 60000);
it("browses real directories with stable pagination, consent/scope checks, stale-page rejection and no link traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-folder-runtime-"));
  roots.push(root);
  const project = join(root, "project"),
    outside = join(root, "outside"),
    state = join(root, "agent", "state");
  await Promise.all([mkdir(project), mkdir(outside), mkdir(state, { recursive: true })]);
  await Promise.all(
    Array.from({ length: 205 }, (_, i) =>
      mkdir(join(project, "Folder " + String(i).padStart(3, "0"))),
    ),
  );
  await writeFile(join(project, "private-file.txt"), "fixture not listed");
  await mkdir(join(project, ".ssh"));
  await mkdir(join(project, ".local", "worktrees"), { recursive: true });
  await symlink(
    outside,
    join(project, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const deviceId = "fc_" + "a".repeat(32),
    config = { deviceId, repository: project, stateRoot: state },
    job = {
      version: 1,
      requestId: "fb_" + "b".repeat(32),
      workspaceId: "ws_server20",
      actor: "usr_fixture",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
      status: "working",
      request: { version: 1, deviceId, root: project, path: "", page: 0 },
    };
  const page = await browse(config, job, [], true);
  expect(
    (
      await browse(
        config,
        { ...job, request: { ...job.request, path: ".local/worktrees" } },
        [],
        true,
      )
    ).status,
  ).toBe("succeeded");
  expect(page.status).toBe("succeeded");
  expect(page.result.entries).toHaveLength(100);
  expect(page.result.nextPage).toBe(1);
  expect(page.result.entries.some((e: { name: string }) => e.name === "private-file.txt")).toBe(
    false,
  );
  const next = await browse(
    config,
    { ...job, request: { ...job.request, page: 1, fingerprint: page.result.fingerprint } },
    [],
    true,
  );
  expect(next.status).toBe("succeeded");
  expect(next.result.fingerprint).toBe(page.result.fingerprint);
  expect(next.result.entries[0].name).not.toBe(page.result.entries[0].name);
  expect((await browse(config, job, [], false)).errorCode).toBe("folder-consent-required");
  expect(
    (await browse(config, { ...job, request: { ...job.request, root: outside } }, [], true))
      .errorCode,
  ).toBe("folder-scope-denied");
  expect(
    (await browse(config, { ...job, request: { ...job.request, path: "../outside" } }, [], true))
      .errorCode,
  ).toBe("folder-scope-denied");
  expect(
    (await browse(config, { ...job, request: { ...job.request, path: "escape" } }, [], true))
      .errorCode,
  ).toBe("folder-scope-denied");
  expect(
    (await browse(config, { ...job, request: { ...job.request, path: ".ssh" } }, [], true))
      .errorCode,
  ).toBe("folder-scope-denied");
  await mkdir(join(project, "new folder"));
  expect(
    (
      await browse(
        config,
        { ...job, request: { ...job.request, page: 1, fingerprint: page.result.fingerprint } },
        [],
        true,
      )
    ).errorCode,
  ).toBe("folder-changed");
}, 60000);
it("discovers generic nested npm and ASP.NET services and respects configurable contexts without entering linked folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-nested-project-"));
  roots.push(root);
  await Promise.all(
    ["apps/web", "apps/api", "src/orders/api", "node_modules/hidden"].map((p) =>
      mkdir(join(root, p), { recursive: true }),
    ),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["apps/*"] }),
  );
  await writeFile(
    join(root, "apps/web/package.json"),
    JSON.stringify({
      name: "generic-web",
      scripts: { dev: "vite" },
      devDependencies: { vite: "fixture" },
    }),
  );
  await writeFile(
    join(root, "apps/api/package.json"),
    JSON.stringify({
      name: "generic-api",
      scripts: { start: "node app.js" },
      dependencies: { pg: "fixture" },
    }),
  );
  await writeFile(
    join(root, "src/orders/api/orders.csproj"),
    '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
  );
  await writeFile(
    join(root, "node_modules/hidden/package.json"),
    JSON.stringify({ scripts: { start: "never run" } }),
  );
  const candidates = await discover(root);
  expect(candidates.map((c: { context: string }) => c.context)).toEqual(
    expect.arrayContaining(["apps/web", "apps/api", "src/orders/api"]),
  );
  expect(candidates).toHaveLength(3);
  expect(candidates.find((c: { context: string }) => c.context === "apps/api").databaseHint).toBe(
    "postgres",
  );
  await writeFile(
    join(root, "devsetu.local.json"),
    JSON.stringify({ version: 1, contexts: ["apps/web"], maxDepth: 1, maxDirectories: 8 }),
  );
  expect((await discover(root)).map((c: { context: string }) => c.context)).toEqual(["apps/web"]);
  await symlink(
    join(root, "apps"),
    join(root, "linked"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(
    join(root, "devsetu.local.json"),
    JSON.stringify({ version: 1, contexts: ["linked/web"] }),
  );
  await expect(projectFolders(root)).rejects.toThrow("prerequisite-folder-unavailable");
  await writeFile(
    join(root, "devsetu.local.json"),
    JSON.stringify({ version: 1, contexts: ["../escape"] }),
  );
  await expect(projectFolders(root)).rejects.toThrow(
    "prerequisite-discovery-policy-review-required",
  );
});
