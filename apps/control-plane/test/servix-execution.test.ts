import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: Object.assign(() => undefined, { [Symbol.for("nodejs.util.promisify.custom")]: run }),
}));
import { loadServixExecutionProfile, servixExecution } from "../src/servix-deployment.js";
afterEach(() => {
  vi.unstubAllEnvs();
  run.mockReset();
});
it("uses the enrolled Git executable and verifies its configured repository identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "servix-tool-profile-"));
  const git = join(root, "tools", "git.exe"),
    repository = join(root, "repository.git"),
    repositoryId = "gitrepo_" + "d".repeat(32),
    head = "e".repeat(40);
  const file = join(root, "ReleaseBuildProfile.json");
  const profile = {
    version: 1,
    git: { executable: git, repository, repositoryId, readTimeoutMs: 45_000 },
    tests: [],
  };
  try {
    await writeFile(file, JSON.stringify(profile));
    const loaded = await loadServixExecutionProfile(root);
    expect(loaded).toEqual({ git, repository, repositoryId, readTimeoutMs: 45_000 });
    run.mockImplementation(async (_file: string, args: string[]) => ({
      stdout: args.includes("config") ? repositoryId : head,
      stderr: "",
    }));
    expect(await servixExecution(root, root, loaded).head()).toBe(head);
    expect(run.mock.calls.every((call) => call[0] === git)).toBe(true);
    expect(run.mock.calls.every((call) => call[2].timeout === 45_000)).toBe(true);
    expect(run.mock.calls[1]?.[1]).toContain(`--git-dir=${repository}`);
    run.mockResolvedValue({ stdout: "gitrepo_" + "f".repeat(32), stderr: "" });
    await expect(servixExecution(root, root, loaded).head()).rejects.toThrow(
      "deployment-repository-identity-mismatch",
    );
    await writeFile(
      file,
      JSON.stringify({ ...profile, git: { ...profile.git, executable: "git" } }),
    );
    await expect(loadServixExecutionProfile(root)).rejects.toThrow();
    await writeFile(
      file,
      JSON.stringify({ ...profile, git: { ...profile.git, readTimeoutMs: 120_000 } }),
    );
    await expect(loadServixExecutionProfile(root)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("keeps service and transport secrets out of the repository build process", async () => {
  vi.stubEnv("DATABASE_URL", "synthetic-private-database");
  vi.stubEnv("FREVOS_SECRET", "synthetic-private-transport");
  vi.stubEnv("NODE_OPTIONS", "--inspect");
  vi.stubEnv("PATHEXT", ".COM;.EXE;.BAT;.CMD");
  vi.stubEnv("PATH", "synthetic-untrusted-executable-directory");
  const root = await mkdtemp(join(tmpdir(), "servix-execution-")),
    id = `sd_${"a".repeat(32)}`,
    head = "b".repeat(40),
    digest = "c".repeat(64);
  try {
    await mkdir(join(root, "builds", id), { recursive: true });
    await writeFile(
      join(root, "builds", id, "artifact.json"),
      JSON.stringify({ manifestSha256: digest, archiveSha256: digest }),
    );
    run.mockImplementation(async (_file: string, args: string[]) => ({
      stdout: args.includes("config") ? "gitrepo_6cb7e163f807493fa37963196c49fbac" : head + "\n",
      stderr: "",
    }));
    const execution = servixExecution(root, "E:\\fixed-operator");
    expect(await execution.head()).toBe(head);
    expect(await execution.build(id, head)).toEqual({
      manifestSha256: digest,
      archiveSha256: digest,
    });
    expect(run.mock.calls).toHaveLength(3);
    for (const call of run.mock.calls) {
      const options = call[2] as { env: NodeJS.ProcessEnv; windowsHide: boolean };
      expect(options.windowsHide).toBe(true);
      expect(options.env).not.toHaveProperty("DATABASE_URL");
      expect(options.env).not.toHaveProperty("FREVOS_SECRET");
      expect(options.env).not.toHaveProperty("NODE_OPTIONS");
      expect(options.env["PATHEXT"]).toBe(".COM;.EXE;.BAT;.CMD");
      expect(options.env["PATH"]).not.toContain("synthetic-untrusted-executable-directory");
      if (process.platform !== "win32") expect(options.env["PATH"]).toBe("/usr/bin:/bin");
    }
    expect(run.mock.calls[1]?.[1]).toContain("refs/heads/frevos-dev^{commit}");
    expect(run.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(["-RequestId", id, "-SourceHead", head]),
    );
    run.mockResolvedValue({ stdout: "not-a-commit", stderr: "private transport failure" });
    await expect(execution.head()).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
