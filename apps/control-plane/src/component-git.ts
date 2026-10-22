import { execFile } from "node:child_process";
import { mkdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { SourceBindingSchema, ServixHeadSchema } from "@frevos/contracts";
import type { ConnectorGit } from "./developer-connectors.js";
import { ServixDeploymentError } from "./servix-deployment.js";

const execute = promisify(execFile);
// A logical repository ID selects storage beneath the configured registry root.
// No browser-supplied path, URL, Git executable or ref is executed.
export function componentGit(
  root: string,
  executable: string,
  binding: unknown,
): ConnectorGit & {
  seed(file: string, head: string): Promise<void>;
} {
  const repository = SourceBindingSchema.parse(binding);
  const directory = join(root, repository.id + ".git");
  const ref = `refs/heads/${repository.branch}`;
  const run = (args: string[]) =>
    execute(
      executable,
      [
        "-c",
        `safe.directory=${directory}`,
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "gc.auto=0",
        "-c",
        "maintenance.auto=false",
        "-c",
        "transfer.fsckObjects=true",
        `--git-dir=${directory}`,
        ...args,
      ],
      {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 65536,
        env: Object.fromEntries(
          ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "HOME", "USERPROFILE"].flatMap((key) =>
            process.env[key] === undefined ? [] : [[key, process.env[key]!]],
          ),
        ),
      },
    );
  const identity = async () => {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("linked-git-repository");
    if ((await run(["config", "--get", "devsetu.repositoryId"])).stdout.trim() !== repository.id)
      throw new Error("repository-identity-mismatch");
  };
  return {
    async head() {
      try {
        await identity();
        return ServixHeadSchema.parse(
          (await run(["rev-parse", "--verify", ref + "^{commit}"])).stdout.trim(),
        );
      } catch {
        throw new ServixDeploymentError("repository-not-seeded", 409);
      }
    },
    async seed(file, head) {
      ServixHeadSchema.parse(head);
      await mkdir(root, { recursive: true });
      if ((await lstat(root)).isSymbolicLink()) throw Error("linked-git-registry");
      // A failed import retains owned evidence. Retry may resume only an empty,
      // correctly identified repository; never reinitialize foreign storage.
      try {
        await mkdir(directory);
        await execute(executable, ["init", "--bare", directory], {
          windowsHide: true,
          timeout: 15000,
        });
        await run(["config", "devsetu.repositoryId", repository.id]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await identity();
        const refs = await run(["for-each-ref", "--format=%(refname)"]);
        if (refs.stdout.trim()) throw new ServixDeploymentError("repository-already-seeded");
      }
      await run(["bundle", "verify", file]);
      await run(["fetch", "--no-tags", file, `${head}:${ref}`]);
      await run(["symbolic-ref", "HEAD", ref]);
    },
    async importBundle(file, base, head) {
      await identity();
      ServixHeadSchema.parse(base);
      ServixHeadSchema.parse(head);
      await run(["bundle", "verify", file]);
      if ((await run(["rev-parse", ref])).stdout.trim() !== base)
        throw new ServixDeploymentError("source-behind-or-conflicting");
      const incoming = `refs/devsetu/incoming/${head}`;
      await run(["fetch", "--no-tags", "--no-write-fetch-head", file, `${head}:${incoming}`]);
      try {
        await run(["merge-base", "--is-ancestor", base, head]);
        await run(["update-ref", ref, head, base]);
      } finally {
        await run(["update-ref", "-d", incoming, head]);
      }
    },
    async exportBundle(file, heads) {
      await identity();
      const known = new Set(
        (await run(["rev-list", "--max-count=1000", ref])).stdout.trim().split(/\r?\n/),
      );
      const tip = known.values().next().value;
      const common = heads
        .map((h) => ServixHeadSchema.parse(h))
        .find((h) => known.has(h) && h !== tip);
      await run(["bundle", "create", file, ref, ...(common ? ["^" + common] : [])]);
    },
  };
}
