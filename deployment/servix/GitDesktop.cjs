// Selected-folder Git operations only. No remote command, executable, credential
// or filesystem deletion is accepted. Network transfer stays on the paired API.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { execFile } = require("node:child_process"),
  { promisify } = require("node:util");
const run = promisify(execFile);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fail = (code) => {
  throw Error("git-desktop-" + code);
};
const branch = (s) =>
  typeof s === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(s) &&
  !s.includes("..") &&
  !s.includes("//") &&
  !s.endsWith("/") &&
  !s.endsWith(".") &&
  s.split("/").every((p) => !p.startsWith(".") && !p.endsWith(".lock"));
const relative = (s) =>
  typeof s === "string" &&
  s.length <= 500 &&
  s.length > 0 &&
  !/[\\:]/.test(s) &&
  ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
  s.split("/").every((p) => p && p !== ".." && p !== ".");
function protectedFile(file) {
  return /(^|\/)(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.kube|\.local|node_modules|uploads|attachments|backups)(?:\/|$)|(^|\/)\.codex\/(?:auth\.json|config\.toml|sessions|archived_sessions|vendor_imports|history\.jsonl|logs)(?:\/|$)|(^|\/)(?:\.env[^/]*|\.npmrc|\.netrc|\.git-credentials|credentials\.json|auth\.json|appsettings\.Production\.json|id_rsa|id_ed25519|id_ecdsa)(?:\/|$)|\.(?:pem|key|pfx|p12|jks|keystore|kdbx|db|sqlite|bak)$/i.test(
    file,
  );
}
async function plain(file) {
  for (let p = path.resolve(file); ; p = path.dirname(p)) {
    try {
      if ((await fs.lstat(p)).isSymbolicLink()) fail("linked-path-denied");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (path.dirname(p) === p) break;
  }
}
async function checkAttributes(file) {
  await plain(file);
  try {
    if ((await fs.lstat(file)).size > 1048576) fail("snapshot-capacity");
    if (/(?:^|\s)filter(?:\s*=|\s|$)/m.test(await fs.readFile(file, "utf8")))
      fail("repository-filter-needs-review");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
class GitDesktopRuntime {
  constructor(config) {
    this.config = config;
    this.root = path.join(config.stateRoot, "git-desktop");
  }
  async git(folder, args, options = {}) {
    const { allowExitOne, ...execution } = options;
    const env = Object.fromEntries(
      ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "HOME"].flatMap(
        (k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]]),
      ),
    );
    Object.assign(env, {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_NO_LAZY_FETCH: "1",
    });
    try {
      return (
        await run(
          this.config.git || "git",
          [
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "commit.gpgSign=false",
            "-c",
            "tag.gpgSign=false",
            "-c",
            "gc.auto=0",
            "-c",
            "maintenance.auto=false",
            "-c",
            "submodule.recurse=false",
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.file.allow=always",
            "-C",
            folder,
            ...args,
          ],
          { env, windowsHide: true, timeout: 45000, maxBuffer: 4194304, ...execution },
        )
      ).stdout;
    } catch (e) {
      if (allowExitOne && e.code === 1) return null;
      if (e.code === "ENOENT") fail("git-required");
      fail("operation-rejected");
    }
  }
  async validateBinding(binding) {
    if (
      !binding ||
      binding.deviceId !== this.config.deviceId ||
      !/^gfolder_[a-f0-9]{32}$/.test(binding.id) ||
      !/^ws_[A-Za-z0-9_-]+$/.test(binding.workspaceId) ||
      !/^usr_[A-Za-z0-9_-]+$/.test(binding.userId) ||
      !branch(binding.branch) ||
      !path.isAbsolute(binding.root) ||
      path.parse(binding.root).root === path.resolve(binding.root)
    )
      fail("folder-scope-denied");
    await plain(binding.root);
    if (!(await fs.lstat(binding.root)).isDirectory()) fail("folder-unavailable");
    if (protectedFile(binding.root.replaceAll("\\", "/"))) fail("protected-folder");
    const identity = (p) =>
      process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p);
    if (
      [
        process.env.USERPROFILE,
        process.env.HOME,
        process.env.WINDIR,
        process.env.APPDATA,
        process.env.LOCALAPPDATA,
      ]
        .filter(Boolean)
        .some((p) => identity(p) === identity(binding.root)) ||
      /(^|[\\/])\.codex([\\/]|$)/i.test(binding.root)
    )
      fail("choose-project-folder");
    await plain(this.root);
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const reference = path.join(this.root, binding.id + ".json");
    const data = {
      version: 1,
      workspaceId: binding.workspaceId,
      userId: binding.userId,
      deviceId: binding.deviceId,
      root: path.resolve(binding.root),
    };
    try {
      const file = await fs.open(reference, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(data));
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      await plain(reference);
      if ((await fs.readFile(reference, "utf8")) !== JSON.stringify(data))
        fail("folder-binding-changed");
    }
  }
  async snapshot(binding) {
    await this.validateBinding(binding);
    let ready = true,
      initialized = false,
      head = null,
      current = null,
      rows = [];
    try {
      await this.git(binding.root, ["--version"]);
    } catch (e) {
      if (e.message !== "git-desktop-git-required") throw e;
      ready = false;
    }
    const marker = path.join(binding.root, ".git");
    try {
      const stat = await fs.lstat(marker);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail("linked-checkout-unsupported");
      initialized = true;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (ready && initialized) {
      let metadataCount = 0;
      const metadata = async (directory) => {
        for (const item of await fs.readdir(directory, { withFileTypes: true })) {
          if (++metadataCount > 50000) fail("metadata-capacity");
          if (item.isSymbolicLink()) fail("linked-path-denied");
          if (item.isDirectory()) await metadata(path.join(directory, item.name));
        }
      };
      await metadata(marker);
      for (const name of ["commondir", "objects/info/alternates", "info/grafts"]) {
        await plain(path.join(marker, name));
        try {
          await fs.lstat(path.join(marker, name));
          fail("external-git-storage-denied");
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      const local = await this.git(binding.root, ["config", "--local", "--name-only", "--list"]);
      if (
        local
          .split(/\r?\n/)
          .some((k) =>
            /^(?:filter\.|include\.|includeif\.|core\.(?:attributesfile|excludesfile)$)/i.test(k),
          )
      )
        fail("repository-filter-needs-review");
      for (const file of (
        await this.git(binding.root, [
          "ls-files",
          "-z",
          "--",
          ".gitattributes",
          ":(glob)**/.gitattributes",
        ])
      )
        .split("\0")
        .filter(Boolean)) {
        if (!relative(file)) fail("invalid-file-path");
        await checkAttributes(path.join(binding.root, file));
      }
      if (
        path.resolve((await this.git(binding.root, ["rev-parse", "--show-toplevel"])).trim()) !==
        path.resolve(binding.root)
      )
        fail("choose-checkout-root");
      current = (await this.git(binding.root, ["symbolic-ref", "--short", "HEAD"])).trim();
      if (!branch(current)) fail("branch-unavailable");
      try {
        head = (await this.git(binding.root, ["rev-parse", "--verify", "HEAD"])).trim();
      } catch {
        head = null;
      }
      const raw = (
        await this.git(binding.root, [
          "-c",
          "core.quotepath=false",
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ])
      ).split("\0");
      for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (!entry) continue;
        const status = entry.slice(0, 2),
          name = entry.slice(3);
        if (!relative(name)) fail("invalid-file-path");
        const row = { path: name, status, protected: protectedFile(name) };
        if (/[RC]/.test(status)) {
          const old = raw[++i];
          if (!relative(old)) fail("invalid-file-path");
          row.previousPath = old;
          row.protected ||= protectedFile(old);
        }
        rows.push(row);
      }
    } else {
      if (ready) {
        let top = null;
        try {
          top = (await this.git(binding.root, ["rev-parse", "--show-toplevel"])).trim();
        } catch {}
        if (top && path.resolve(top) !== path.resolve(binding.root)) fail("choose-checkout-root");
      }
      const walk = async (directory, prefix = "") => {
        for (const item of await fs.readdir(directory, { withFileTypes: true })) {
          if (rows.length > 2000) break;
          const rel = prefix + item.name;
          if (item.isSymbolicLink()) continue;
          if (item.isDirectory()) {
            if (
              !protectedFile(rel) &&
              !["dist", "build", "coverage", "bin", "obj", "vendor"].includes(item.name)
            )
              await walk(path.join(directory, item.name), rel + "/");
          } else if (item.isFile() && relative(rel))
            rows.push({ path: rel, status: "??", protected: protectedFile(rel) });
        }
      };
      await walk(binding.root);
      if (ready && rows.length && rows.length <= 2000) {
        // Honor the project's real Git ignore rules without initializing its folder.
        const temporary = await fs.mkdtemp(path.join(this.root, "ignore-"));
        try {
          await this.git(temporary, ["init", "--bare", "."]);
          await fs.writeFile(
            path.join(temporary, "info", "exclude"),
            "node_modules/\nuploads/\nattachments/\nbackups/\n.local/\n.codex/\ndist/\nbuild/\ncoverage/\nbin/\nobj/\nvendor/\n",
          );
          const visible = new Set(
            (
              await this.git(binding.root, [
                "--git-dir=" + temporary,
                "--work-tree=" + binding.root,
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
              ])
            )
              .split("\0")
              .filter(Boolean)
              .map((row) => row.slice(3)),
          );
          rows = rows.filter((row) => row.protected || visible.has(row.path));
        } finally {
          const target = path.resolve(temporary);
          if (
            path.dirname(target) !== path.resolve(this.root) ||
            !path.basename(target).startsWith("ignore-")
          )
            fail("cleanup-scope");
          await fs.rm(target, { recursive: true, force: true });
        }
      }
    }
    rows.sort((a, b) => a.path.localeCompare(b.path));
    const truncated = rows.length > 2000;
    rows = rows.slice(0, 2000);
    let total = 0;
    const identities = [];
    for (const row of rows) {
      if (row.protected) {
        identities.push([row.path, row.status, "protected"]);
        continue;
      }
      const file = path.join(binding.root, row.path);
      if (path.basename(file) === ".gitattributes") await checkAttributes(file);
      await plain(file);
      try {
        const stat = await fs.lstat(file);
        total += stat.size;
        if (!stat.isFile() || stat.size > 8388608 || total > 33554432) fail("snapshot-capacity");
        identities.push([row.path, row.status, sha(await fs.readFile(file))]);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        identities.push([row.path, row.status, "deleted"]);
      }
    }
    return {
      folderId: binding.id,
      root: binding.root,
      gitReady: ready,
      initialized,
      branch: current,
      head,
      fingerprint: sha(JSON.stringify({ head, current, identities })),
      files: rows,
      truncated,
    };
  }
  async execute(job, io = {}) {
    if (
      !job ||
      job.version !== 1 ||
      !/^gjob_[a-f0-9]{32}$/.test(job.id) ||
      job.deviceId !== this.config.deviceId ||
      job.actor !== job.binding?.userId ||
      job.workspaceId !== job.binding?.workspaceId ||
      !branch(job.branch) ||
      !branch(job.defaultBranch) ||
      !Number.isFinite(Date.parse(job.expiresAt)) ||
      Date.parse(job.expiresAt) <= Date.now() ||
      Date.parse(job.expiresAt) - Date.now() > 310000 ||
      !["select", "status", "commit-push", "push", "pull", "clone", "switch-branch"].includes(
        job.action,
      )
    )
      fail("job-scope-denied");
    let snapshot = await this.snapshot(job.binding);
    if (["select", "status"].includes(job.action)) return { snapshot };
    if (!snapshot.gitReady) fail("git-required");
    if (snapshot.truncated) fail("snapshot-capacity");
    if (snapshot.fingerprint !== job.expectedFingerprint) fail("files-changed-refresh");
    const receipt = path.join(this.root, job.id + ".receipt.json");
    if ((await fs.readdir(this.root)).length >= 10000) fail("storage-capacity");
    try {
      const file = await fs.open(receipt, "wx", 0o600);
      try {
        await file.writeFile(
          JSON.stringify({
            id: job.id,
            folderId: job.binding.id,
            action: job.action,
            status: "started",
          }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
    } catch (e) {
      if (e.code === "EEXIST") fail("job-needs-reconciliation");
      throw e;
    }
    const folder = job.binding.root;
    try {
      if (job.action === "commit-push") {
        if (job.branch === job.defaultBranch) fail("default-branch-protected");
        if (
          typeof job.message !== "string" ||
          !job.message.trim() ||
          job.message.length > 500 ||
          /[\0\r]/.test(job.message) ||
          !Array.isArray(job.files) ||
          !job.files.length ||
          job.files.length > 2000 ||
          new Set(job.files).size !== job.files.length
        )
          fail("invalid-commit");
        const selected = new Set(job.files);
        for (const file of selected) {
          const row = snapshot.files.find((r) => r.path === file);
          if (!relative(file) || !row || row.protected) fail("protected-or-unselected-file");
        }
        if (snapshot.initialized) {
          const staged = (await this.git(folder, ["diff", "--cached", "--name-only", "-z"]))
            .split("\0")
            .filter(Boolean);
          if (
            staged.some(
              (p) =>
                !selected.has(p) &&
                !snapshot.files.some((r) => selected.has(r.path) && r.previousPath === p),
            )
          )
            fail("other-staged-changes");
        }
        if (!snapshot.initialized) {
          await this.git(folder, ["init", "-b", job.branch]);
          await fs.appendFile(
            path.join(folder, ".git", "info", "exclude"),
            "\n.env*\n*.env\nnode_modules/\nuploads/\nattachments/\nbackups/\n.local/\n",
          );
        }
        if (!snapshot.head && job.binding.repositoryId) {
          if (snapshot.initialized && snapshot.branch !== job.branch) {
            const refs = (
              await this.git(folder, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
            ).split(/\r?\n/);
            if (refs.includes(job.branch)) fail("switch-branch-first");
            await this.git(folder, ["symbolic-ref", "HEAD", "refs/heads/" + job.branch]);
          }
          if (!io.download) fail("initial-base-unavailable");
          const initial = await io.download(job);
          if (
            !Buffer.isBuffer(initial?.bytes) ||
            initial.bytes.length > 67108864 ||
            !/^[a-f0-9]{40}$/.test(initial.head)
          )
            fail("invalid-pull-bundle");
          const incoming = path.join(this.root, job.id + ".initial.bundle");
          await fs.writeFile(incoming, initial.bytes, { flag: "wx", mode: 0o600 });
          await this.git(folder, ["bundle", "verify", incoming]);
          await this.git(folder, ["fetch", "--no-tags", incoming, initial.head]);
          await this.checkTree(folder, initial.head);
          // Only a newly initialized index is changed. Existing file bytes are untouched.
          await this.git(folder, ["reset", "--mixed", initial.head]);
          if (job.binding.bootstrapSeed) {
            if (initial.head !== job.binding.bootstrapSeed) fail("initial-repository-changed");
            await this.git(folder, ["read-tree", "--empty"]);
            const empty = (await this.git(folder, ["write-tree"])).trim(),
              message = path.join(this.root, job.id + ".seed-message");
            await fs.writeFile(
              message,
              "Initialize this folder on its newly created private repository\n",
              { flag: "wx", mode: 0o600 },
            );
            const linked = (
              await this.git(folder, [
                "-c",
                "user.name=DevSetu " + job.actor,
                "-c",
                "user.email=" + job.actor + "@devsetu.invalid",
                "commit-tree",
                empty,
                "-p",
                initial.head,
                "-F",
                message,
              ])
            ).trim();
            await this.git(folder, ["update-ref", "HEAD", linked, initial.head]);
          }
          await fs.unlink(incoming);
        } else if (snapshot.initialized && snapshot.branch !== job.branch) {
          const branches = (
            await this.git(folder, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
          ).split(/\r?\n/);
          if (branches.includes(job.branch)) fail("switch-branch-first");
          await this.git(folder, ["checkout", "-b", job.branch]);
        }
        if (snapshot.head) await this.prepareBootstrap(job, io);
        const staged = (await this.git(folder, ["diff", "--cached", "--name-only", "-z"]))
          .split("\0")
          .filter(Boolean);
        if (
          staged.some(
            (p) =>
              !selected.has(p) &&
              !snapshot.files.some((r) => selected.has(r.path) && r.previousPath === p),
          )
        )
          fail("other-staged-changes");
        const paths = path.join(this.root, job.id + ".paths"),
          message = path.join(this.root, job.id + ".message");
        await fs.writeFile(paths, job.files.map((p) => ":(literal)" + p).join("\0") + "\0", {
          flag: "wx",
          mode: 0o600,
        });
        await fs.writeFile(message, job.message.trim() + "\n", { flag: "wx", mode: 0o600 });
        await this.git(folder, ["add", "--pathspec-from-file=" + paths, "--pathspec-file-nul"]);
        const now = (await this.git(folder, ["diff", "--cached", "--name-only", "-z"]))
          .split("\0")
          .filter(Boolean);
        if (now.some((p) => protectedFile(p))) fail("protected-file-staged");
        await this.git(folder, [
          "-c",
          "user.name=DevSetu " + job.actor,
          "-c",
          "user.email=" + job.actor + "@devsetu.invalid",
          "commit",
          "-F",
          message,
        ]);
        await this.publish(job, io);
        await fs.unlink(paths);
        await fs.unlink(message);
      } else if (job.action === "push") {
        if (!snapshot.initialized || !snapshot.head) fail("head-unavailable");
        if (snapshot.branch !== job.branch) {
          if (!job.binding.bootstrapSeed) fail("switch-branch-first");
          const refs = (
            await this.git(folder, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
          ).split(/\r?\n/);
          if (refs.includes(job.branch)) fail("switch-branch-first");
          await this.git(folder, ["checkout", "-b", job.branch]);
        }
        await this.prepareBootstrap(job, io);
        await this.publish(job, io);
      } else if (job.action === "pull" || job.action === "clone") {
        if (
          job.action === "clone"
            ? snapshot.initialized || snapshot.files.length > 0
            : !snapshot.initialized || snapshot.files.some((f) => !f.protected)
        )
          fail("commit-changes-before-pull");
        if (job.action !== "clone" && snapshot.branch !== job.branch) fail("switch-branch-first");
        if (!io.download) fail("pull-unavailable");
        const incoming = await io.download(job);
        if (
          !incoming ||
          !Buffer.isBuffer(incoming.bytes) ||
          incoming.bytes.length > 67108864 ||
          !/^[a-f0-9]{40}$/.test(incoming.head)
        )
          fail("invalid-pull-bundle");
        const bundle = path.join(this.root, job.id + ".bundle");
        await fs.writeFile(bundle, incoming.bytes, { flag: "wx", mode: 0o600 });
        if (job.action === "clone") await this.git(folder, ["init", "-b", job.branch]);
        await this.git(folder, ["bundle", "verify", bundle]);
        await this.git(folder, ["fetch", "--no-tags", bundle, incoming.head]);
        await this.checkTree(folder, incoming.head);
        if (job.action === "clone")
          await this.git(folder, ["checkout", "-B", job.branch, incoming.head]);
        else await this.git(folder, ["merge", "--ff-only", incoming.head]);
        await fs.unlink(bundle);
      } else {
        if (!snapshot.initialized || snapshot.files.some((f) => !f.protected))
          fail("commit-changes-before-switch");
        const branches = (
          await this.git(folder, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
        ).split(/\r?\n/);
        if (branches.includes(job.branch)) {
          await this.checkTree(folder, job.branch);
          await this.git(folder, ["checkout", job.branch]);
        } else if (job.remoteHead) {
          if (!io.download) fail("pull-unavailable");
          const incoming = await io.download(job);
          if (
            !Buffer.isBuffer(incoming?.bytes) ||
            incoming.bytes.length > 67108864 ||
            incoming.head !== job.remoteHead
          )
            fail("branch-changed-refresh");
          const bundle = path.join(this.root, job.id + ".bundle");
          await fs.writeFile(bundle, incoming.bytes, { flag: "wx", mode: 0o600 });
          await this.git(folder, ["bundle", "verify", bundle]);
          await this.git(folder, ["fetch", "--no-tags", bundle, incoming.head]);
          await this.checkTree(folder, incoming.head);
          await this.git(folder, ["checkout", "-b", job.branch, incoming.head]);
        } else await this.git(folder, ["checkout", "-b", job.branch]);
      }
      snapshot = await this.snapshot(job.binding);
      await this.cleanTransfer(job.id);
      await fs.writeFile(
        receipt,
        JSON.stringify({
          id: job.id,
          folderId: job.binding.id,
          status: "succeeded",
          head: snapshot.head,
        }),
      );
      return { snapshot };
    } catch (e) {
      try {
        await this.cleanTransfer(job.id);
      } catch {
        /* Retained private files remain subject to the state capacity gate. */
      }
      await fs.writeFile(
        receipt,
        JSON.stringify({ id: job.id, folderId: job.binding.id, status: "needs-reconciliation" }),
      );
      throw e;
    }
  }
  async cleanTransfer(id) {
    if (!/^gjob_[a-f0-9]{32}$/.test(id)) fail("job-scope-denied");
    for (const suffix of [".paths", ".message", ".bundle", ".initial.bundle", ".seed-message"]) {
      try {
        await fs.unlink(path.join(this.root, id + suffix));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  }
  async prepareBootstrap(job, io) {
    const seed = job.binding.bootstrapSeed;
    if (!seed) return;
    if (!/^[a-f0-9]{40}$/.test(seed) || !io.download) fail("initial-base-unavailable");
    const folder = job.binding.root,
      incoming = await io.download(job);
    if (
      !Buffer.isBuffer(incoming?.bytes) ||
      incoming.bytes.length > 67108864 ||
      incoming.head !== seed
    )
      fail("initial-repository-changed");
    const bundle = path.join(this.root, job.id + ".initial.bundle");
    await fs.writeFile(bundle, incoming.bytes, { flag: "wx", mode: 0o600 });
    await this.git(folder, ["bundle", "verify", bundle]);
    await this.git(folder, ["fetch", "--no-tags", bundle, seed]);
    await this.checkTree(folder, seed);
    const before = (await this.git(folder, ["rev-parse", "HEAD"])).trim();
    if (
      (await this.git(folder, ["merge-base", "--is-ancestor", seed, before], {
        allowExitOne: true,
      })) !== null
    )
      return;
    if ((await this.git(folder, ["merge-base", seed, before], { allowExitOne: true })) !== null)
      fail("pull-before-initial-publish");
    const tree = (await this.git(folder, ["rev-parse", "HEAD^{tree}"])).trim(),
      message = path.join(this.root, job.id + ".seed-message");
    await fs.writeFile(
      message,
      "Connect existing history to this newly created private repository\n",
      { flag: "wx", mode: 0o600 },
    );
    const linked = (
      await this.git(folder, [
        "-c",
        "user.name=DevSetu " + job.actor,
        "-c",
        "user.email=" + job.actor + "@devsetu.invalid",
        "commit-tree",
        tree,
        "-p",
        before,
        "-p",
        seed,
        "-F",
        message,
      ])
    ).trim();
    // Append both histories with the exact existing tree. Index, file bytes, old branches and remotes stay intact.
    await this.git(folder, ["update-ref", "HEAD", linked, before]);
  }
  async checkTree(folder, ref) {
    const tree = (await this.git(folder, ["ls-tree", "-r", "-z", ref])).split("\0").filter(Boolean);
    if (
      tree.some((row) => {
        const tab = row.indexOf("\t"),
          file = row.slice(tab + 1);
        return (
          tab < 0 || !relative(file) || protectedFile(file) || !/^(?:100644|100755) blob /.test(row)
        );
      })
    )
      fail("protected-files-in-pull");
  }
  async publish(job, io) {
    if (job.branch === job.defaultBranch) fail("default-branch-protected");
    const folder = job.binding.root,
      head = (await this.git(folder, ["rev-parse", "HEAD"])).trim();
    if (!/^[a-f0-9]{40}$/.test(head)) fail("head-unavailable");
    const history = (await this.git(folder, ["log", "--format=", "--name-only", "-z", head]))
      .split("\0")
      .filter(Boolean);
    if (history.some((file) => !relative(file) || protectedFile(file)))
      fail("protected-history-needs-review");
    const bundle = path.join(this.root, job.id + ".bundle");
    await this.git(folder, ["bundle", "create", bundle, job.branch]);
    if ((await fs.stat(bundle)).size > 67108864) fail("bundle-capacity");
    if (!io.publish) fail("publish-unavailable");
    await io.publish(job, await fs.readFile(bundle), head);
    await fs.unlink(bundle);
  }
}
function nativePickerAvailable() {
  const exists = require("node:fs").existsSync;
  return process.platform === "win32"
    ? exists(path.join(__dirname, "FrevOS.FolderPicker.exe"))
    : process.platform === "linux" &&
        !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY) &&
        ["/usr/bin/zenity", "/usr/bin/kdialog"].some(exists);
}
async function launchNativePicker(expiresAt) {
  const timeout = Math.min(85000, Date.parse(expiresAt) - Date.now());
  if (timeout <= 0) fail("picker-expired");
  if (process.platform === "win32")
    return new Promise((resolve, reject) => {
      const env = Object.fromEntries(
        [
          "SystemRoot",
          "WINDIR",
          "PATH",
          "PATHEXT",
          "TEMP",
          "TMP",
          "USERPROFILE",
          "HOME",
          "LOCALAPPDATA",
          "APPDATA",
        ].flatMap((k) => (process.env[k] === undefined ? [] : [[k, process.env[k]]])),
      );
      const child = execFile(
        path.join(__dirname, "FrevOS.FolderPicker.exe"),
        ["--choose-folder"],
        // This is a GUI executable, with no console. Its requested dialog must be visible.
        { env, windowsHide: false, timeout, maxBuffer: 8192 },
        (error, stdout) => {
          if (error)
            return reject(
              Error(error.killed ? "git-desktop-picker-expired" : "git-desktop-picker-unavailable"),
            );
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(Error("git-desktop-picker-unavailable"));
          }
        },
      );
      child.stdin.on("error", () => reject(Error("git-desktop-picker-unavailable")));
      child.stdin.end(JSON.stringify({ version: 1, profileId: "Code", repository: "", expiresAt }));
    });
  const executable = ["/usr/bin/zenity", "/usr/bin/kdialog"].find(require("node:fs").existsSync);
  if (!executable || !nativePickerAvailable()) fail("picker-desktop-unavailable");
  try {
    const args = executable.endsWith("zenity")
      ? ["--file-selection", "--directory", "--title=DevSetu - Choose folder"]
      : [
          "--getexistingdirectory",
          require("node:os").homedir(),
          "--title",
          "DevSetu - Choose folder",
        ];
    const { stdout } = await run(executable, args, { timeout, maxBuffer: 8192 });
    return { status: "selected", repository: stdout.replace(/\r?\n$/, "") };
  } catch (e) {
    if (e.code === 1) return { status: "cancelled" };
    fail(e.killed ? "picker-expired" : "picker-unavailable");
  }
}
async function chooseFolder(config, job, choose = launchNativePicker) {
  if (
    !job ||
    job.version !== 1 ||
    !/^gpick_[a-f0-9]{32}$/.test(job.requestId) ||
    job.status !== "claimed" ||
    job.deviceId !== config.deviceId ||
    !/^ws_[A-Za-z0-9_-]+$/.test(job.workspaceId) ||
    !/^usr_[A-Za-z0-9_-]+$/.test(job.actor) ||
    !Number.isFinite(Date.parse(job.expiresAt)) ||
    Date.parse(job.expiresAt) <= Date.now() ||
    Date.parse(job.expiresAt) > Date.now() + 95000
  )
    fail("picker-scope-denied");
  const root = path.join(config.stateRoot, "git-desktop");
  await plain(root);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if ((await fs.readdir(root)).length >= 10000) fail("picker-capacity");
  const receipt = await fs.open(path.join(root, job.requestId + ".picker.json"), "wx", 0o600);
  try {
    await receipt.writeFile(
      JSON.stringify({
        requestId: job.requestId,
        workspaceId: job.workspaceId,
        actor: job.actor,
        status: "claimed",
      }),
    );
    await receipt.sync();
  } finally {
    await receipt.close();
  }
  const result = await choose(job.expiresAt);
  if (Date.parse(job.expiresAt) <= Date.now()) fail("picker-expired");
  if (["cancelled", "failed"].includes(result?.status))
    return result.status === "cancelled"
      ? { status: "cancelled" }
      : {
          status: "failed",
          errorCode: /^git-desktop-[a-z-]{1,70}$/.test(result.errorCode)
            ? result.errorCode
            : "git-desktop-picker-unavailable",
        };
  if (
    result?.status !== "selected" ||
    typeof result.repository !== "string" ||
    result.repository.length > 500 ||
    !path.isAbsolute(result.repository) ||
    (process.platform === "win32" && !/^[a-z]:\\/i.test(result.repository))
  )
    fail("picker-path-denied");
  const selected = path.resolve(result.repository),
    drive = path.parse(selected).root;
  await plain(selected);
  if (
    selected === drive ||
    !(await fs.lstat(selected)).isDirectory() ||
    protectedFile(selected.replaceAll("\\", "/")) ||
    [process.env.USERPROFILE, process.env.HOME, config.stateRoot, __dirname]
      .filter(Boolean)
      .some((p) => {
        const rel = path.relative(path.resolve(p), selected);
        return (
          !rel ||
          ((p === config.stateRoot || p === __dirname) &&
            !rel.startsWith("..") &&
            !path.isAbsolute(rel))
        );
      })
  )
    fail("choose-project-folder");
  return {
    status: "selected",
    root: drive,
    path: path.relative(drive, selected).split(path.sep).join("/"),
  };
}
function start(config, api) {
  const runtime = new GitDesktopRuntime(config);
  let stopped = false,
    checkedAt = 0,
    gitReady = false,
    delay = 2000,
    pickerAfter = 0;
  const loop = (async () => {
    while (!stopped) {
      try {
        if (Date.now() - checkedAt >= 60000) {
          checkedAt = Date.now();
          gitReady = true;
          try {
            await runtime.git(config.stateRoot, ["--version"]);
          } catch {
            gitReady = false;
          }
        }
        const claim = {
          version: 1,
          capability: 1,
          gitReady,
          ...(Date.now() >= pickerAfter && nativePickerAvailable() ? { picker: 1 } : {}),
        };
        let response;
        try {
          response = await api("/v1/connector/git-desktop/claim", claim);
        } catch (e) {
          if (!claim.picker) throw e;
          pickerAfter = Date.now() + 60000;
          const { picker, ...legacy } = claim;
          response = await api("/v1/connector/git-desktop/claim", legacy);
        }
        const { jobs, pickers = [] } = response;
        if (!Array.isArray(jobs) || jobs.length > 1) fail("invalid-claim");
        if (!Array.isArray(pickers) || pickers.length > 1) fail("invalid-claim");
        for (const job of pickers) {
          let result;
          try {
            result = await chooseFolder(config, job);
          } catch (e) {
            result = {
              status: "failed",
              errorCode: /^git-desktop-[a-z-]+$/.test(e.message)
                ? e.message
                : "git-desktop-picker-unconfirmed",
            };
          }
          await api("/v1/connector/git-desktop/pickers/" + job.requestId + "/complete", result);
        }
        delay = 2000;
        for (const job of jobs) {
          try {
            const result = await runtime.execute(job, {
              publish: async (_job, bytes, head) =>
                api("/v1/connector/git-desktop/" + job.id + "/publish", bytes, {
                  "content-type": "application/x-git-bundle",
                  "x-devsetu-source-head": head,
                }),
              download: async () => {
                const value = await api("/v1/connector/git-desktop/" + job.id + "/download", {});
                return { head: value.head, bytes: Buffer.from(value.bundle, "base64") };
              },
            });
            await api("/v1/connector/git-desktop/" + job.id + "/complete", {
              status: "succeeded",
              ...result,
            });
          } catch (e) {
            const errorCode = /^git-desktop-[a-z-]+$/.test(e.message)
              ? e.message
              : "git-desktop-operation-unconfirmed";
            await api("/v1/connector/git-desktop/" + job.id + "/complete", {
              status: "failed",
              errorCode,
            });
          }
        }
      } catch {
        delay = Math.min(30000, delay * 2);
      }
      if (!stopped) await new Promise((r) => setTimeout(r, delay));
    }
  })();
  loop.catch(() => {});
  return {
    stop() {
      stopped = true;
    },
  };
}
module.exports = {
  GitDesktopRuntime,
  protectedFile,
  relative,
  branch,
  start,
  nativePickerAvailable,
  launchNativePicker,
  chooseFolder,
};
