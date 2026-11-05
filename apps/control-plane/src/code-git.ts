import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { promisify } from "node:util";
import {
  CodeCommitSchema,
  CodePathSchema,
  GitObjectIdSchema,
  SafeGitBranchSchema,
} from "@frevos/contracts";
import { assertPlainPath } from "./model-secrets.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const execute = promisify(execFile);
const unavailable = () => new ServixDeploymentError("code-repository-unavailable", 503);
export const protectedCodePath = (path: string, exclusions: string[] = []) =>
  path
    .split("/")
    .some((p) => /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|credentials?(?:\..*)?)$/i.test(p)) ||
  /\.(?:pfx|p12|pem|key|dpapi)$/i.test(path) ||
  exclusions.some(
    (x) =>
      path.toLowerCase() === x.toLowerCase() ||
      path.toLowerCase().startsWith(x.toLowerCase() + "/"),
  );

/** Reads committed objects only. No working-tree checkout, hooks, filters or server-supplied shell. */
export class CodeGit {
  constructor(
    readonly directory: string,
    readonly executable: string,
    readonly exclusions: string[] = [],
  ) {}
  private async run(args: string[], maxBuffer = 8388608) {
    await assertPlainPath(this.directory);
    if (!(await lstat(this.directory)).isDirectory()) throw unavailable();
    const env: NodeJS.ProcessEnv = Object.fromEntries(
      ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "HOME"]
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    );
    Object.assign(env, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_TERMINAL_PROMPT: "0",
    });
    try {
      return (
        await execute(
          this.executable,
          [
            "-c",
            `safe.directory=${this.directory}`,
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "gc.auto=0",
            "-c",
            "maintenance.auto=false",
            `--git-dir=${this.directory}`,
            ...args,
          ],
          { env, windowsHide: true, timeout: 30000, maxBuffer, encoding: "buffer" },
        )
      ).stdout;
    } catch {
      throw unavailable();
    }
  }
  async verify(key: "frevos.repositoryId" | "devsetu.repositoryId", id: string) {
    if ((await this.run(["config", "--get", key], 4096)).toString().trim() !== id)
      throw new ServixDeploymentError("code-repository-identity-changed", 503);
  }
  async branches() {
    const values = (
      await this.run(
        [
          "for-each-ref",
          "--count=201",
          "--format=%(refname:strip=2)%00%(objectname)",
          "refs/heads/",
        ],
        65536,
      )
    )
      .toString()
      .trim();
    if (!values) return [];
    const rows = values.split(/\r?\n/).map((row) => {
      const [name, sha] = row.split("\0");
      return { name: SafeGitBranchSchema.parse(name), sha: GitObjectIdSchema.parse(sha) };
    });
    if (rows.length > 200) throw new ServixDeploymentError("code-branch-capacity", 409);
    return rows;
  }
  async resolve(branch: string) {
    SafeGitBranchSchema.parse(branch);
    try {
      // Resolve an exact branch to a commit in one operation; pin all subsequent reads.
      return GitObjectIdSchema.parse(
        (await this.run(["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], 4096))
          .toString()
          .trim(),
      );
    } catch {
      throw new ServixDeploymentError("code-branch-not-found", 404);
    }
  }
  private async object(head: string, path: string) {
    GitObjectIdSchema.parse(head);
    CodePathSchema.parse(path);
    if (protectedCodePath(path, this.exclusions))
      throw new ServixDeploymentError("code-protected-path", 403);
    try {
      return GitObjectIdSchema.parse(
        (
          await this.run(
            ["rev-parse", "--verify", path ? `${head}:${path}` : `${head}^{tree}`],
            4096,
          )
        )
          .toString()
          .trim(),
      );
    } catch {
      throw new ServixDeploymentError("code-path-not-found", 404);
    }
  }
  async entries(head: string, path: string) {
    const tree = await this.object(head, path);
    if ((await this.run(["cat-file", "-t", tree], 4096)).toString().trim() !== "tree")
      throw new ServixDeploymentError("code-directory-required", 400);
    const raw = (await this.run(["ls-tree", "-z", "-l", tree])).toString("utf8");
    const rows = raw
      .split("\0")
      .filter(Boolean)
      .map((row) => {
        const tab = row.indexOf("\t"),
          [mode, , sha, size] = row.slice(0, tab).trim().split(/\s+/),
          name = row.slice(tab + 1),
          full = path ? path + "/" + name : name;
        if (tab < 0) throw unavailable();
        CodePathSchema.parse(full);
        GitObjectIdSchema.parse(sha);
        return {
          name,
          path: full,
          sha: sha!,
          kind:
            mode === "040000"
              ? ("directory" as const)
              : mode === "120000"
                ? ("symlink" as const)
                : mode === "160000"
                  ? ("submodule" as const)
                  : ("file" as const),
          bytes: size === "-" ? null : Number(size),
          protected: protectedCodePath(full, this.exclusions),
        };
      });
    if (rows.length > 10000) throw new ServixDeploymentError("code-directory-capacity", 409);
    return rows.sort(
      (a, b) =>
        Number(b.kind === "directory") - Number(a.kind === "directory") ||
        a.name.localeCompare(b.name),
    );
  }
  async blob(head: string, path: string) {
    if (!path) throw new ServixDeploymentError("code-file-required", 400);
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const entry = (await this.entries(head, parent)).find((r) => r.path === path);
    if (!entry) throw new ServixDeploymentError("code-path-not-found", 404);
    if (entry.protected) throw new ServixDeploymentError("code-protected-path", 403);
    if (entry.kind !== "file") throw new ServixDeploymentError("code-regular-file-required", 400);
    const bytes = entry.bytes!;
    if (bytes > 524288) return { sha: entry.sha, bytes, text: null, binary: false, tooLarge: true };
    const data = await this.run(["cat-file", "blob", entry.sha], 524289);
    let text: string | null = null;
    try {
      if (!data.includes(0)) text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      /* Binary files remain metadata-only in the browser. */
    }
    return { sha: entry.sha, bytes, text, binary: text === null, tooLarge: false };
  }
  async history(head: string, path = "", page = 0) {
    GitObjectIdSchema.parse(head);
    CodePathSchema.parse(path);
    if (protectedCodePath(path, this.exclusions))
      throw new ServixDeploymentError("code-protected-path", 403);
    const fields = (
      await this.run(
        [
          "log",
          "--no-show-signature",
          "--max-count=31",
          `--skip=${page * 30}`,
          "--format=%H%x00%an%x00%aI%x00%s%x00",
          head,
          "--",
          ...(path ? [path] : []),
        ],
        524288,
      )
    )
      .toString()
      .split("\0");
    const commits = [];
    for (let i = 0; i + 3 < fields.length; i += 4)
      commits.push(
        CodeCommitSchema.parse({
          sha: fields[i]!.trim(),
          author: fields[i + 1]!.slice(0, 300),
          at: new Date(fields[i + 2]!).toISOString(),
          subject: fields[i + 3]!.slice(0, 1000),
        }),
      );
    return { commits: commits.slice(0, 30), hasMore: commits.length > 30, page };
  }
  async archive(head: string, name: string) {
    GitObjectIdSchema.parse(head);
    const raw = (await this.run(["ls-tree", "-rz", "--name-only", head])).toString();
    const excluded = raw
      .split("\0")
      .filter(Boolean)
      .filter((p) => protectedCodePath(p, this.exclusions));
    // Do not let an adversarial tree expand the OS argument list indefinitely.
    if (excluded.length > 500)
      throw new ServixDeploymentError("code-archive-protected-path-capacity", 409);
    const prefix =
      name.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100) + "-" + head.slice(0, 12) + "/";
    const bytes = await this.run(
      [
        "archive",
        "--format=zip",
        `--prefix=${prefix}`,
        head,
        "--",
        ".",
        ...excluded.map((p) => `:(top,literal,exclude)${CodePathSchema.parse(p)}`),
      ],
      67108864,
    );
    return { bytes, excludedPaths: excluded.length, filename: prefix.slice(0, -1) + ".zip" };
  }
}
