import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { GitObjectIdSchema, SafeGitBranchSchema } from "@frevos/contracts";
import { assertPlainPath } from "./model-secrets.js";
import { ServixDeploymentError } from "./servix-deployment.js";
import { privateGitAddress } from "./repository-center.js";

const run = promisify(execFile);
function fail(code: string): never {
  throw new ServixDeploymentError("repository-" + code, 409);
}
export type GitEngineAccess = {
  url: string;
  login: string;
  token: string;
  defaultBranch: string;
  write: boolean;
};
/** Standard Git transport in disposable checkouts; credentials exist only in child environment. */
export class GitEngine {
  constructor(
    private root: string,
    private executable = "git",
  ) {}
  private async temporary<T>(work: (folder: string) => Promise<T>) {
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const folder = await mkdtemp(join(this.root, "transfer-"));
    try {
      return await work(folder);
    } finally {
      const target = resolve(folder);
      if (!target.startsWith(resolve(this.root) + sep)) fail("cleanup-scope");
      await rm(target, { recursive: true, force: true });
    }
  }
  private async git(folder: string, args: string[], access?: GitEngineAccess) {
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "HOME"]
        .filter((k) => process.env[k] !== undefined)
        .map((k) => [k, process.env[k]]),
    );
    const config: [string, string][] = [
      ["core.hooksPath", "/dev/null"],
      ["core.fsmonitor", "false"],
      ["credential.helper", ""],
      ["http.followRedirects", "false"],
      ["protocol.allow", "never"],
      ["protocol.file.allow", "always"],
      ["submodule.recurse", "false"],
      ["fetch.fsckObjects", "true"],
      ["transfer.fsckObjects", "true"],
    ];
    if (access) {
      const url = new URL(access.url);
      const answers = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
      if (!answers.length || answers.some((a) => !privateGitAddress(a.address)))
        fail("private-origin-required");
      config.push(
        ["protocol." + url.protocol.slice(0, -1) + ".allow", "always"],
        [
          "http.curloptResolve",
          `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}:${answers[0]!.address}`,
        ],
        [
          "http.extraHeader",
          "Authorization: Basic " +
            Buffer.from(access.login + ":" + access.token).toString("base64"),
        ],
      );
    }
    Object.assign(env, {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_COUNT: String(config.length),
      GIT_LFS_SKIP_SMUDGE: "1",
    });
    env["GIT_NO_REPLACE_OBJECTS"] = "1";
    config.forEach(([key, value], i) => {
      env[`GIT_CONFIG_KEY_${i}`] = key;
      env[`GIT_CONFIG_VALUE_${i}`] = value;
    });
    try {
      return (
        await run(this.executable, ["-C", folder, ...args], {
          env,
          windowsHide: true,
          timeout: 120000,
          maxBuffer: 16 * 1024 * 1024,
        })
      ).stdout;
    } catch {
      fail("git-transfer-rejected");
    }
  }
  private async check(folder: string, head: string) {
    const { protectedFile, relative } = createRequire(import.meta.url)(
      "../../../deployment/servix/GitDesktop.cjs",
    ) as { protectedFile: (p: string) => boolean; relative: (p: string) => boolean };
    const history = (await this.git(folder, ["log", "--format=", "--name-only", "-z", head]))
      .split("\0")
      .filter(Boolean);
    if (history.some((file) => !relative(file) || protectedFile(file)))
      fail("protected-history-needs-review");
    const tree = (await this.git(folder, ["ls-tree", "-r", "-z", head]))
      .split("\0")
      .filter(Boolean);
    if (
      tree.some((row) => {
        const tab = row.indexOf("\t"),
          file = row.slice(tab + 1);
        return (
          tab < 0 || !relative(file) || protectedFile(file) || !/^(?:100644|100755) blob /.test(row)
        );
      })
    )
      fail("unsafe-tree");
  }
  async publish(
    authorize: () => Promise<GitEngineAccess>,
    branch: string,
    head: string,
    bytes: Buffer,
  ) {
    SafeGitBranchSchema.parse(branch);
    GitObjectIdSchema.parse(head);
    if (!bytes.length || bytes.length > 67108864) fail("bundle-capacity");
    return this.temporary(async (folder) => {
      const access = await authorize();
      if (!access.write || branch === access.defaultBranch) fail("default-or-write-denied");
      await this.git(folder, ["init", "--bare", "."]);
      const bundle = join(folder, "incoming.bundle");
      await writeFile(bundle, bytes, { flag: "wx", mode: 0o600 });
      await this.git(folder, ["bundle", "verify", bundle]);
      const refs = (await this.git(folder, ["bundle", "list-heads", bundle])).trim().split(/\r?\n/);
      if (refs.length !== 1 || refs[0] !== head + " refs/heads/" + branch)
        fail("bundle-ref-mismatch");
      await this.git(folder, [
        "fetch",
        "--no-tags",
        bundle,
        "refs/heads/" + branch + ":refs/heads/incoming",
      ]);
      await this.check(folder, head);
      await this.git(
        folder,
        ["fetch", "--no-tags", access.url, "refs/heads/" + access.defaultBranch],
        access,
      );
      const base = (await this.git(folder, ["rev-parse", "FETCH_HEAD"])).trim();
      // Existing, unrelated Git histories require an explicit import, never a silent reset/rebase.
      await this.git(folder, ["merge-base", base, head]);
      const listing = await this.git(
        folder,
        ["ls-remote", "--heads", access.url, "refs/heads/" + branch],
        access,
      );
      const remoteHead = listing.trim().split(/\s/)[0];
      if (remoteHead) {
        GitObjectIdSchema.parse(remoteHead);
        await this.git(folder, ["fetch", "--no-tags", access.url, "refs/heads/" + branch], access);
        await this.git(folder, ["merge-base", "--is-ancestor", remoteHead, head]);
      }
      const fresh = await authorize();
      if (!fresh.write || fresh.url !== access.url || branch === fresh.defaultBranch)
        fail("write-denied");
      await this.git(
        folder,
        ["push", "--porcelain", fresh.url, head + ":refs/heads/" + branch],
        fresh,
      );
      const confirmed = (
        await this.git(folder, ["ls-remote", "--heads", fresh.url, "refs/heads/" + branch], fresh)
      )
        .trim()
        .split(/\s/)[0];
      if (confirmed !== head) fail("publication-unconfirmed");
    });
  }
  async download(authorize: () => Promise<GitEngineAccess>, branch: string) {
    SafeGitBranchSchema.parse(branch);
    return this.temporary(async (folder) => {
      const access = await authorize();
      await this.git(folder, ["init", "--bare", "."]);
      await this.git(
        folder,
        ["fetch", "--no-tags", access.url, "refs/heads/" + branch + ":refs/heads/" + branch],
        access,
      );
      const head = GitObjectIdSchema.parse(
        (await this.git(folder, ["rev-parse", "refs/heads/" + branch])).trim(),
      );
      await this.check(folder, head);
      const bundle = join(folder, "outgoing.bundle");
      await this.git(folder, ["bundle", "create", bundle, branch]);
      const bytes = await readFile(bundle);
      if (bytes.length > 67108864) fail("bundle-capacity");
      await authorize();
      return { head, bytes };
    });
  }
}
