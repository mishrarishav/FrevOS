import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
const { preview } = createRequire(import.meta.url)("../../../deployment/servix/FolderBrowse.cjs");
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function fixture() {
  const root = await mkdtemp(
    join(process.platform === "win32" ? homedir() : tmpdir(), "devsetu-preview-"),
  );
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  await mkdir(stateRoot);
  await writeFile(join(root, "code.ts"), 'const value = 1;\nconst password = "SYNTHETIC_PRIVATE";');
  const config = {
    deviceId: "fc_" + "e".repeat(32),
    mode: "system",
    monitoringRoot: root,
    stateRoot,
  };
  const job = {
    version: 1,
    requestId: "cp_" + "a".repeat(32),
    actor: "usr_fixture",
    workspaceId: "ws_server20",
    request: { version: 1, deviceId: config.deviceId, root, path: "code.ts" },
    status: "working",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  return { root, config, job };
}
it("requires local one-time same-origin consent and masks a bounded snapshot before returning it", async () => {
  const f = await fixture();
  let opened = false;
  const result = await preview(f.config, f.job, [f.root], true, {
    open: async ({ url, origin }: { url: string; origin: string }) => {
      opened = true;
      const html = await readFile(new URL(url), "utf8"),
        token = html.match(/name="session" value="([A-Za-z0-9_-]+)"/)![1]!;
      const boot = await fetch(origin + "/bootstrap", {
        method: "POST",
        headers: { origin: "null" },
        body: new URLSearchParams({ session: token }),
      });
      expect(boot.status).toBe(200);
      const cookie = boot.headers.getSetCookie()[0]!.split(";")[0]!;
      expect(await boot.text()).toContain("Allow this file once");
      expect(
        (
          await fetch(origin + "/decision", {
            method: "POST",
            headers: { origin: "https://other.example", cookie, "x-devsetu-content": token },
            body: "approve",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(origin + "/decision", {
            method: "POST",
            headers: { origin, cookie, "x-devsetu-content": token },
            body: "approve",
          })
        ).status,
      ).toBe(200);
    },
  });
  expect(opened).toBe(true);
  expect(result.status).toBe("succeeded");
  expect(result.result.after).toContain("const value = 1;");
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
});
it("fails closed for absent consent, excluded paths, links, large files and explicit decline", async () => {
  const f = await fixture();
  const opened = async () => {
    throw Error("Must not open");
  };
  expect((await preview(f.config, f.job, [f.root], false, { open: opened })).status).toBe("failed");
  expect(
    (
      await preview(
        f.config,
        { ...f.job, request: { ...f.job.request, path: ".env" } },
        [f.root],
        true,
        { open: opened },
      )
    ).errorCode,
  ).toBe("content-scope-denied");
  await writeFile(join(f.root, "large.txt"), "x".repeat(8193));
  expect(
    (
      await preview(
        f.config,
        { ...f.job, request: { ...f.job.request, path: "large.txt" } },
        [f.root],
        true,
        { open: opened },
      )
    ).status,
  ).toBe("failed");
  await symlink(f.root, join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
  expect(
    (
      await preview(
        f.config,
        { ...f.job, request: { ...f.job.request, path: "linked/code.ts" } },
        [f.root],
        true,
        { open: opened },
      )
    ).status,
  ).toBe("failed");
  const result = await preview(f.config, f.job, [f.root], true, {
    open: async ({ url, origin }: { url: string; origin: string }) => {
      const token = (await readFile(new URL(url), "utf8")).match(
        /name="session" value="([A-Za-z0-9_-]+)"/,
      )![1]!;
      const r = await fetch(origin + "/bootstrap", {
        method: "POST",
        headers: { origin: "null" },
        body: new URLSearchParams({ session: token }),
      });
      await fetch(origin + "/decision", {
        method: "POST",
        headers: {
          origin,
          cookie: r.headers.getSetCookie()[0]!.split(";")[0]!,
          "x-devsetu-content": token,
        },
        body: "decline",
      });
    },
  });
  expect(result.status).toBe("declined");
  expect(result.result).toBeUndefined();
});
