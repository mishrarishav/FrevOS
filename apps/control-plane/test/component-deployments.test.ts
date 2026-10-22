import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import {
  componentOrder,
  PipelineInputSchema,
  type Pipeline,
  type PipelineRequest,
} from "@frevos/contracts";
import { ComponentDeployments } from "../src/component-deployments.js";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";

const require = createRequire(import.meta.url);
const executor = require("../../../deployment/servix/ComponentExecutor.cjs");
const sourceWorker = require("../../../deployment/servix/Connector.cjs");
const exec = promisify(execFile);
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const id = (prefix: string, n: number) => prefix + String(n).padStart(32, "0");
const notes = { message: "Update frontend and API", approvedBy: "Owner development request" };
it("validates dependencies, independent bindings and literal component paths", () => {
  expect(
    componentOrder([
      { id: "web", dependsOn: ["api"] },
      { id: "api", dependsOn: [] },
    ]),
  ).toEqual(["api", "web"]);
  expect(() =>
    componentOrder([
      { id: "web", dependsOn: ["api"] },
      { id: "api", dependsOn: ["web"] },
    ]),
  ).toThrow("cycle");
  expect(() => componentOrder([{ id: "web", dependsOn: ["absent"] }])).toThrow("unknown");
  expect(() =>
    componentOrder([
      { id: "web", dependsOn: [] },
      { id: "web", dependsOn: [] },
    ]),
  ).toThrow("duplicate");
  const base = {
    version: 1,
    profileId: "test-app",
    expectedRevision: 0,
    displayName: "Test",
    sourceFolder: "D:\\test",
    archived: false,
    components: [
      {
        id: "frontend",
        name: "Frontend",
        context: "frontend",
        recipe: "npm-static",
        output: "build",
        builderId: "unassigned",
        destinationId: "unassigned",
        destinationBinding: "frontend",
        dependsOn: [],
        preservedPaths: ["uploads"],
      },
    ],
  };
  expect(PipelineInputSchema.safeParse(base).success).toBe(true);
  expect(
    PipelineInputSchema.safeParse({
      ...base,
      components: [{ ...base.components[0], context: "../escape" }],
    }).success,
  ).toBe(false);
  expect(
    PipelineInputSchema.safeParse({
      ...base,
      components: [{ ...base.components[0], dependsOn: ["missing"] }],
    }).success,
  ).toBe(false);
});

it.skipIf(process.platform !== "win32")(
  "publishes real Git, builds isolated components, deploys to distinct roots and repeatedly rolls back without touching persistent files",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "devsetu-components-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const source = join(root, "checkout");
    await mkdir(source);
    await mkdir(join(source, "frontend"));
    await mkdir(join(source, "api"));
    const git = (args: string[]) => exec("git", ["-C", source, ...args], { windowsHide: true });
    await git(["init", "-b", "feature/components"]);
    await git(["config", "user.name", "Component acceptance"]);
    await git(["config", "user.email", "component@example.invalid"]);
    await writeFile(
      join(source, "frontend/package.json"),
      JSON.stringify({
        name: "component-fixture",
        version: "1.0.0",
        scripts: { build: "node build.cjs" },
      }),
    );
    await writeFile(
      join(source, "frontend/package-lock.json"),
      JSON.stringify({
        name: "component-fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: { "": { name: "component-fixture", version: "1.0.0" } },
      }),
    );
    await writeFile(
      join(source, "frontend/build.cjs"),
      "const fs=require('node:fs');fs.mkdirSync('build',{recursive:true});fs.copyFileSync('index.html','build/index.html');",
    );
    await writeFile(join(source, "frontend/index.html"), "Release A");
    await writeFile(join(source, "api/server.cjs"), "module.exports='API A';");
    await git(["add", "."]);
    await git(["commit", "-m", "fixture: initial source"]);
    let allowed = true;
    const permission = async (actor: string, owner = false) =>
      allowed && actor === "usr_owner" && (!owner || actor === "usr_owner");
    const store = new ComponentDeployments(join(root, "state"), "ws_server20", permission, "git");
    const legacy = {
      head: async () => "a".repeat(40),
      importBundle: async () => {
        throw Error("legacy must not be used");
      },
    };
    const connectors = new DeveloperConnectorStore(
      join(root, "devices"),
      (actor) => permission(actor),
      legacy,
      async () => {},
      () => new Date(),
      (a, b, c) => store.sourceRequestActive(a, b, c),
      undefined,
      store,
    );
    cleanups.push(async () => connectors.close());
    store.connect(connectors);
    let profile = await store.save("usr_owner", {
      version: 1,
      profileId: "split-project",
      expectedRevision: 0,
      displayName: "Split project",
      sourceFolder: source,
      archived: false,
      components: [
        {
          id: "api",
          name: "API",
          context: "api",
          recipe: "node-source",
          output: ".",
          builderId: "unassigned",
          destinationId: "unassigned",
          destinationBinding: "api",
          dependsOn: [],
          preservedPaths: ["uploads", ".env"],
        },
        {
          id: "frontend",
          name: "Frontend",
          context: "frontend",
          recipe: "npm-static",
          output: "build",
          builderId: "unassigned",
          destinationId: "unassigned",
          destinationBinding: "frontend",
          dependsOn: ["api"],
          preservedPaths: ["attachment"],
        },
      ],
    });
    const builder = await store.enroll("usr_owner", {
      profileId: profile.profileId,
      name: "Build host",
      role: "builder",
    });
    const apiTarget = await store.enroll("usr_owner", {
      profileId: profile.profileId,
      name: "API host",
      role: "destination",
    });
    const webTarget = await store.enroll("usr_owner", {
      profileId: profile.profileId,
      name: "Frontend host",
      role: "destination",
    });
    const buildRoot = join(root, "build-work"),
      apiRoot = join(root, "api-host"),
      webRoot = join(root, "web-host");
    await Promise.all([buildRoot, apiRoot, webRoot].map((p) => mkdir(p)));
    await mkdir(join(apiRoot, "uploads"));
    await writeFile(join(apiRoot, "uploads/keep.txt"), "private upload");
    await writeFile(join(apiRoot, ".env"), "synthetic environment");
    await mkdir(join(webRoot, "attachment"));
    await writeFile(join(webRoot, "attachment/keep.txt"), "private attachment");
    const server = createServer((_request, response) => {
      response.writeHead(200);
      response.end("healthy");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(
      () =>
        new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
    );
    const address = server.address() as { port: number },
      healthUrl = `http://127.0.0.1:${address.port}/health`;
    const buildBinding = {
      id: "builder",
      root: buildRoot,
      healthUrl,
      recipes: ["npm-static", "node-source"],
    };
    const apiBinding = { id: "api", root: apiRoot, healthUrl, recipes: ["node-source"] },
      webBinding = { id: "frontend", root: webRoot, healthUrl, recipes: ["npm-static"] };
    const beat = async () => {
      await store.heartbeat(builder.credential, {
        systemName: hostname(),
        bindings: [buildBinding],
      });
      await store.heartbeat(apiTarget.credential, {
        systemName: hostname(),
        bindings: [apiBinding],
      });
      await store.heartbeat(webTarget.credential, {
        systemName: hostname(),
        bindings: [webBinding],
      });
    };
    await beat();
    await expect(
      store.heartbeat(apiTarget.credential, {
        systemName: hostname(),
        bindings: [{ ...apiBinding, root: join(root, "changed-root") }],
      }),
    ).rejects.toThrow("enrollment-changed");
    const conflicting = await store.enroll("usr_owner", {
      profileId: profile.profileId,
      name: "Overlapping target",
      role: "destination",
    });
    await expect(
      store.heartbeat(conflicting.credential, {
        systemName: hostname(),
        bindings: [{ ...apiBinding, root: join(apiRoot, "nested") }],
      }),
    ).rejects.toThrow("already-owned");
    await store.revoke("usr_owner", conflicting.id);
    const { revision, repository: _r, updatedAt: _at, updatedBy: _by, ...fields } = profile;
    profile = await store.save("usr_owner", {
      ...fields,
      expectedRevision: revision,
      components: profile.components.map((c) => ({
        ...c,
        builderId: builder.id,
        destinationId: c.id === "api" ? apiTarget.id : webTarget.id,
      })),
    });
    const paired = await connectors.pair("usr_owner", {
      version: 1,
      name: "Source host",
      profileId: profile.profileId,
    });
    const seed = join(root, "seed.bundle");
    await git(["bundle", "create", seed, "HEAD"]);
    const initial = (await git(["rev-parse", "HEAD"])).stdout.trim();
    await connectors.seed(paired.credential, initial, await readFile(seed));
    await connectors.seed(paired.credential, initial, await readFile(seed));
    const config = {
      deviceId: paired.deviceId,
      profileId: profile.profileId,
      repository: source,
      repositoryOrigin: profile.repository.origin,
      centralRepository: profile.repository,
      git: "git",
      stateRoot: join(root, "source-state"),
    };
    await mkdir(config.stateRoot);
    const baseline = join(root, "baseline.bundle");
    await (await store.git(profile.profileId)).exportBundle!(baseline, []);
    await sourceWorker.bindCentralCheckout(config, baseline);
    const refresh = async () => {
      await beat();
      await connectors.heartbeat(paired.credential, {
        probe: await sourceWorker.inspectRepository(config),
        changeNotes: true,
      });
    };
    await refresh();
    const npmCli = join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    expect((await store.projectSettings("usr_owner"))[0]).toMatchObject({
      profileId: profile.profileId,
      runner: "configured-components",
      destination: { host: hostname().toLowerCase(), root: apiRoot },
    });
    const workConfig = { git: "git", npmCli, stateRoot: join(root, "target-state") };
    await mkdir(workConfig.stateRoot);
    const stateFor = async () => store.state("usr_owner");
    expect((await store.test("usr_owner", profile.profileId, paired.deviceId)).ready).toBe(true);
    expect((await store.test("usr_owner", profile.profileId, id("fc_", 99))).ready).toBe(false);
    await expect(store.test("usr_owner", "absent-project", paired.deviceId)).rejects.toThrow(
      "not-found",
    );
    await expect(
      store.enroll("usr_owner", { profileId: "absent-project", role: "builder", name: "Missing" }),
    ).rejects.toThrow("not-found");
    await expect(store.claim("invalid")).rejects.toThrow("authentication");
    await expect(store.claim(id("ex_", 99) + "." + "a".repeat(43))).rejects.toThrow(
      "authentication",
    );
    await expect(store.claim(builder.id + "." + "a".repeat(43))).rejects.toThrow("authentication");
    function request(
      number: number,
      operation: "deploy" | "rollback",
      profile: Pipeline,
      runs: Awaited<ReturnType<typeof stateFor>>["runs"],
    ): PipelineRequest {
      return {
        requestId: id("pr_", number),
        profileId: profile.profileId,
        expectedRevision: profile.revision,
        operation,
        connectorId: paired.deviceId,
        changeDetails: notes,
        expectedCurrent: Object.fromEntries(
          profile.components.map((c) => [
            c.id,
            [...runs]
              .filter((r) => r.components.some((x) => x.id === c.id && x.status === "succeeded"))
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.requestId ?? null,
          ]),
        ),
      };
    }
    const initialRequest = request(90, "deploy", profile, []);
    const offlineSource = await connectors.pair("usr_owner", {
      version: 1,
      name: "Offline source",
      profileId: profile.profileId,
    });
    await expect(
      store.request("usr_owner", { ...initialRequest, connectorId: offlineSource.deviceId }),
    ).rejects.toThrow("connector-offline");
    await expect(
      store.request("usr_owner", {
        ...initialRequest,
        componentId: "frontend",
        expectedCurrent: { frontend: null },
      }),
    ).rejects.toThrow("dependency-not-deployed");
    await expect(
      store.request("usr_owner", { ...initialRequest, operation: "rollback" }),
    ).rejects.toThrow("rollback-unavailable");
    await expect(
      store.request("usr_owner", { ...initialRequest, componentId: "missing" }),
    ).rejects.toThrow("not-found");
    await expect(
      store.request("usr_owner", { ...initialRequest, expectedRevision: 99 }),
    ).rejects.toThrow("revision-conflict");
    await expect(store.save("usr_owner", { ...fields, expectedRevision: 0 })).rejects.toThrow(
      "revision-conflict",
    );
    await expect(
      store.save("usr_owner", { ...fields, profileId: "servix-development", expectedRevision: 0 }),
    ).rejects.toThrow("migration-required");
    async function drive(
      number: number,
      operation: "deploy" | "rollback",
      failure?: {
        build?: string;
        deploy?: string;
        recovery?: boolean;
        source?: boolean;
        interrupt?: boolean;
      },
    ) {
      await refresh();
      const intent = request(number, operation, profile, (await stateFor()).runs);
      const accepted = await store.request("usr_owner", intent);
      expect((await store.request("usr_owner", intent)).requestId).toBe(accepted.requestId);
      await expect(
        store.request("usr_owner", {
          ...intent,
          changeDetails: { ...notes, message: "Conflicting request" },
        }),
      ).rejects.toThrow("conflict");
      if (operation === "deploy") {
        const job = await connectors.claim(paired.credential);
        expect(job).not.toBeNull();
        if (failure?.source) {
          await connectors.fail(paired.credential, job!.requestId, {
            errorCode: "local-git-failed",
          });
          return (await stateFor()).runs.find((r) => r.requestId === intent.requestId)!;
        }
        sourceWorker.validateJob(config, job);
        const published = await sourceWorker.publishWorkingTree(config, job);
        await connectors.complete(
          paired.credential,
          job!.requestId,
          published.head,
          await readFile(published.bundle),
        );
      }
      for (let i = 0; i < 12; i++) {
        await stateFor();
        const buildJob = await store.claim(builder.credential);
        if (buildJob) {
          if (failure?.build === buildJob.componentId) {
            await store.complete(builder.credential, buildJob.id, {
              status: "failed",
              artifactDigest: buildJob.input.digest,
              errorCode: "component-build-command-failed",
            });
            continue;
          }
          executor.validateJob(
            {
              ...workConfig,
              id: builder.id,
              profileId: profile.profileId,
              role: "builder",
              bindings: [buildBinding],
            },
            buildJob,
          );
          const directory = join(root, buildJob.id);
          await mkdir(directory);
          const sourceBlob = join(root, "state", "blob-" + buildJob.input.digest),
            sourceBytes = await readFile(sourceBlob);
          try {
            await writeFile(sourceBlob, Buffer.alloc(0));
            await expect(store.artifact(builder.credential, buildJob.id)).rejects.toThrow(
              "artifact-unavailable",
            );
            await writeFile(sourceBlob, Buffer.from("changed source artifact"));
            await expect(store.artifact(builder.credential, buildJob.id)).rejects.toThrow(
              "artifact-corrupt",
            );
          } finally {
            await writeFile(sourceBlob, sourceBytes);
          }
          await expect(
            store.complete(builder.credential, buildJob.id, {
              status: "succeeded",
              artifactDigest: buildJob.input.digest,
            }),
          ).rejects.toThrow("job-conflict");
          const file = await executor.build(
            workConfig,
            buildJob,
            buildBinding,
            await readFile(await store.artifact(builder.credential, buildJob.id)),
            directory,
          );
          const output = await store.upload(builder.credential, buildJob.id, await readFile(file));
          const outputBlob = join(root, "state", "blob-" + output.digest),
            outputBytes = await readFile(outputBlob);
          try {
            await writeFile(outputBlob, Buffer.from("changed build artifact"));
            await expect(
              store.upload(builder.credential, buildJob.id, outputBytes),
            ).rejects.toThrow("artifact-corrupt");
          } finally {
            await writeFile(outputBlob, outputBytes);
          }
          await expect(
            store.upload(builder.credential, buildJob.id, Buffer.from("different artifact")),
          ).rejects.toThrow("artifact-conflict");
          await expect(
            store.complete(builder.credential, buildJob.id, {
              status: "succeeded",
              artifactDigest: "0".repeat(64),
            }),
          ).rejects.toThrow("artifact-conflict");
          await store.complete(builder.credential, buildJob.id, {
            status: "succeeded",
            artifactDigest: output.digest,
          });
        }
        for (const [target, binding] of [
          [apiTarget, apiBinding],
          [webTarget, webBinding],
        ] as const) {
          const job = await store.claim(target.credential);
          if (!job) continue;
          if (failure?.interrupt)
            return (await stateFor()).runs.find((r) => r.requestId === intent.requestId)!;
          if (failure?.deploy === job.componentId) {
            await store.complete(target.credential, job.id, {
              status: failure.recovery ? "recovery-required" : "failed",
              artifactDigest: job.input.digest,
              errorCode: failure.recovery
                ? "component-worker-interrupted"
                : "component-activation-failed-recovered",
            });
            continue;
          }
          const directory = join(root, job.id);
          await mkdir(directory);
          await expect(store.artifact(builder.credential, job.id)).rejects.toThrow("denied");
          await expect(
            store.upload(target.credential, job.id, Buffer.from("unexpected")),
          ).rejects.toThrow("expired");
          if (!job.previousArtifact)
            await expect(store.artifact(target.credential, job.id, true)).rejects.toThrow(
              "expired",
            );
          await executor.activate(
            workConfig,
            job,
            binding,
            await readFile(await store.artifact(target.credential, job.id)),
            job.previousArtifact
              ? await readFile(await store.artifact(target.credential, job.id, true))
              : undefined,
            directory,
          );
          await store.complete(target.credential, job.id, {
            status: "succeeded",
            artifactDigest: job.input.digest,
          });
          await store.complete(target.credential, job.id, {
            status: "succeeded",
            artifactDigest: job.input.digest,
          });
          await expect(
            store.complete(target.credential, job.id, {
              status: "failed",
              artifactDigest: job.input.digest,
              errorCode: "changed-receipt",
            }),
          ).rejects.toThrow("job-conflict");
        }
        const run = (await stateFor()).runs.find((r) => r.requestId === intent.requestId)!;
        if (["succeeded", "failed", "partial", "recovery-required"].includes(run.status))
          return run;
      }
      throw Error("pipeline did not finish");
    }
    await drive(1, "deploy");
    expect(await readFile(join(webRoot, "index.html"), "utf8")).toBe("Release A");
    await writeFile(join(source, "frontend/index.html"), "Release B");
    await writeFile(join(source, "api/server.cjs"), "module.exports='API B';");
    await drive(2, "deploy");
    expect(await readFile(join(webRoot, "index.html"), "utf8")).toBe("Release B");
    const head = (await git(["rev-parse", "HEAD"])).stdout.trim();
    await drive(3, "rollback");
    expect(await readFile(join(webRoot, "index.html"), "utf8")).toBe("Release A");
    await drive(4, "rollback");
    expect(await readFile(join(webRoot, "index.html"), "utf8")).toBe("Release B");
    expect((await git(["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
    expect(await readFile(join(apiRoot, "uploads/keep.txt"), "utf8")).toBe("private upload");
    expect(await readFile(join(apiRoot, ".env"), "utf8")).toBe("synthetic environment");
    expect(await readFile(join(webRoot, "attachment/keep.txt"), "utf8")).toBe("private attachment");
    const reconstructed = new ComponentDeployments(
      join(root, "state"),
      "ws_server20",
      permission,
      "git",
    );
    expect((await reconstructed.state("usr_owner")).runs[0]?.status).toBe("succeeded");
    expect((await reconstructed.state("usr_owner")).executors.every((d) => !d.online)).toBe(true);
    await refresh();
    const stale = request(91, "deploy", profile, []);
    await expect(store.request("usr_owner", stale)).rejects.toThrow("current-release-conflict");
    const fifth = request(5, "deploy", profile, (await stateFor()).runs);
    await store.request("usr_owner", fifth);
    await expect(store.request("usr_owner", { ...fifth, requestId: id("pr_", 6) })).rejects.toThrow(
      "target-busy",
    );
    await expect(
      store.save("usr_owner", { ...fields, expectedRevision: profile.revision }),
    ).rejects.toThrow("project-busy");
    const expired = new ComponentDeployments(
      join(root, "state"),
      "ws_server20",
      permission,
      "git",
      () => new Date(Date.now() + 2 * 60 * 60000),
    );
    expect(
      (await expired.state("usr_owner")).runs.find((r) => r.requestId === fifth.requestId)?.status,
    ).toBe("failed");
    expect(await expired.claim(builder.credential)).toBeNull();
    await refresh();
    const registry = join(root, "state/repositories", profile.repository.id + ".git");
    await exec(
      "git",
      ["--git-dir=" + registry, "config", "devsetu.repositoryId", "gitrepo_" + "f".repeat(32)],
      { windowsHide: true },
    );
    try {
      const denied = await store.request(
        "usr_owner",
        request(12, "deploy", profile, (await stateFor()).runs),
      );
      expect(denied.status).toBe("failed");
      expect(denied.components.every((c) => c.errorCode === "repository-not-seeded")).toBe(true);
    } finally {
      await exec(
        "git",
        ["--git-dir=" + registry, "config", "devsetu.repositoryId", profile.repository.id],
        { windowsHide: true },
      );
    }
    const sourceFailure = await drive(11, "deploy", { source: true });
    expect(sourceFailure.status).toBe("failed");
    expect(sourceFailure.components.every((c) => c.errorCode === "local-git-failed")).toBe(true);
    const failed = await drive(7, "deploy", { build: "api" });
    expect(failed.status).toBe("failed");
    expect(failed.components.map((c) => c.status)).toEqual(["failed", "blocked"]);
    expect(await store.claim(webTarget.credential)).toBeNull();
    const partial = await drive(8, "deploy", { deploy: "frontend" });
    expect(partial.status).toBe("partial");
    expect(partial.components.map((c) => c.status)).toEqual(["succeeded", "failed"]);
    expect(await readFile(join(webRoot, "index.html"), "utf8")).toBe("Release B");
    const interrupted = await drive(9, "deploy", { interrupt: true });
    expect(interrupted.status).toBe("running");
    const afterInterruption = (await expired.state("usr_owner")).runs.find(
      (r) => r.requestId === interrupted.requestId,
    )!;
    expect(afterInterruption.status).toBe("recovery-required");
    expect(afterInterruption.components.map((c) => c.status)).toEqual([
      "recovery-required",
      "failed",
    ]);
    await expect(
      store.request("usr_owner", request(10, "deploy", profile, (await stateFor()).runs)),
    ).rejects.toThrow("target-busy");
    expect(await store.revoke("usr_owner", webTarget.id)).toEqual({ revoked: true });
    await expect(
      store.heartbeat(webTarget.credential, { systemName: hostname(), bindings: [webBinding] }),
    ).rejects.toThrow("authentication");
    const farFuture = new ComponentDeployments(
      join(root, "state"),
      "ws_server20",
      permission,
      "git",
      () => new Date(Date.now() + 100 * 86400000),
    );
    await expect(farFuture.claim(builder.credential)).rejects.toThrow("authentication");
    allowed = false;
    await expect(store.state("usr_owner")).rejects.toThrow("denied");
    await expect(store.claim(builder.credential)).rejects.toThrow("denied");
  },
  120000,
);
