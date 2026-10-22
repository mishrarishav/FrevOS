import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { ComponentDeployments } from "../src/component-deployments.js";

it("closes only an actor/source-bound interrupted build without output or destination work, retaining an idempotent resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-build-resolution-"));
  const store = new ComponentDeployments(
    root,
    "ws_server20",
    async (a, owner) => a === "usr_owner" || (!owner && a === "usr_developer"),
    "git",
  );
  try {
    const profile = await store.save("usr_owner", {
      version: 1,
      profileId: "resolution-project",
      expectedRevision: 0,
      displayName: "Resolution fixture",
      sourceFolder: "D:\\fixture",
      archived: false,
      components: [
        {
          id: "api",
          name: "API",
          context: ".",
          output: ".",
          recipe: "node-source",
          builderId: "unassigned",
          destinationId: "unassigned",
          destinationBinding: "api",
          dependsOn: [],
          preservedPaths: [],
        },
      ],
    });
    const device = await store.enroll("usr_owner", {
      profileId: profile.profileId,
      role: "builder",
      name: "Fixture builder",
    });
    const requestId = "pr_" + "a".repeat(32),
      sourceHead = "b".repeat(40),
      jobId = "cj_" + "c".repeat(32),
      now = new Date().toISOString();
    const body = {
      requestId,
      sourceHead,
      changeDetails: {
        message: "Inspected retained claim; no output or target job",
        approvedBy: "Owner inspection",
      },
    };
    const run = {
      requestId,
      profileId: profile.profileId,
      expectedRevision: 1,
      operation: "deploy",
      connectorId: "fc_" + "d".repeat(32),
      expectedCurrent: { api: null },
      changeDetails: { message: "Original build", approvedBy: "Owner" },
      sourceRequestId: "sd_" + "a".repeat(32),
      workspaceId: "ws_server20",
      requestedBy: "usr_owner",
      config: profile,
      sourceHead,
      status: "recovery-required",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      components: [
        { id: "api", status: "recovery-required", errorCode: "component-worker-interrupted" },
      ],
    };
    const job = {
      id: jobId,
      runId: requestId,
      profileId: profile.profileId,
      componentId: "api",
      executorId: device.id,
      kind: "build",
      status: "recovery-required",
      createdAt: now,
      expiresAt: run.expiresAt,
      component: profile.components[0],
      binding: {
        id: "builder",
        root: "D:\\fixture-build",
        healthUrl: "http://127.0.0.1/health",
        recipes: ["node-source"],
      },
      systemName: "FIXTURE",
      sourceHead,
      input: { digest: "e".repeat(64), bytes: 10 },
      errorCode: "component-worker-interrupted",
    };
    const runFile = join(root, `run-${requestId}.json`),
      jobFile = join(root, `job-${jobId}.json`);
    await writeFile(runFile, JSON.stringify(run));
    await writeFile(jobFile, JSON.stringify(job));
    await expect(store.closeInterruptedBuild("usr_developer", body)).rejects.toThrow(
      "access-denied",
    );
    await expect(
      store.closeInterruptedBuild("usr_owner", { ...body, requestId: "pr_" + "f".repeat(32) }),
    ).rejects.toThrow("not-found");
    await expect(
      store.closeInterruptedBuild("usr_owner", { ...body, sourceHead: "f".repeat(40) }),
    ).rejects.toThrow("resolution-denied");
    await writeFile(runFile, JSON.stringify({ ...run, requestedBy: "usr_other" }));
    await expect(store.closeInterruptedBuild("usr_owner", body)).rejects.toThrow(
      "resolution-denied",
    );
    await writeFile(runFile, JSON.stringify(run));
    for (const change of [
      { kind: "deploy" },
      { status: "working" },
      { status: "failed" },
      { output: { digest: "e".repeat(64), bytes: 10 } },
    ]) {
      await writeFile(jobFile, JSON.stringify({ ...job, ...change }));
      await expect(store.closeInterruptedBuild("usr_owner", body)).rejects.toThrow(
        "resolution-unavailable",
      );
    }
    await writeFile(jobFile, JSON.stringify(job));
    await writeFile(
      runFile,
      JSON.stringify({
        ...run,
        components: [{ ...run.components[0], artifactDigest: "f".repeat(64) }],
      }),
    );
    await expect(store.closeInterruptedBuild("usr_owner", body)).rejects.toThrow(
      "resolution-unavailable",
    );
    await writeFile(runFile, JSON.stringify(run));
    const closed = await store.closeInterruptedBuild("usr_owner", body);
    expect(closed.status).toBe("failed");
    expect(closed.buildResolution).toMatchObject({
      resolvedBy: "usr_owner",
      sourceHead,
      changeDetails: body.changeDetails,
    });
    expect(JSON.parse(await readFile(jobFile, "utf8")).status).toBe("failed");
    await expect(
      store.complete(device.credential, jobId, {
        status: "succeeded",
        artifactDigest: job.input.digest,
      }),
    ).rejects.toThrow("job-conflict");
    await writeFile(jobFile, JSON.stringify(job));
    expect(await store.closeInterruptedBuild("usr_owner", body)).toEqual(closed);
    expect(JSON.parse(await readFile(jobFile, "utf8")).status).toBe("failed");
    await expect(
      store.closeInterruptedBuild("usr_owner", {
        ...body,
        changeDetails: { ...body.changeDetails, message: "Different resolution" },
      }),
    ).rejects.toThrow("resolution-conflict");
  } finally {
    expect(
      resolve(root).startsWith(resolve(tmpdir())) && root.includes("devsetu-build-resolution-"),
    ).toBe(true);
    await rm(root, { recursive: true, force: true });
  }
});
