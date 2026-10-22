const changeDetails = { message: "Update platform controls", approvedBy: "Fixture owner" };
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { SelfUpdates, selfUpdateHtml, selfUpdateScript } from "../src/self-updates.js";
it("binds an immutable prepared candidate, retains one request across races/restarts, and refuses stale or malformed state", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-self-update-"));
  const candidate = {
    version: 1,
    candidateId: "a".repeat(32),
    manifestSha256: "b".repeat(64),
    previousManifestSha256: "c".repeat(64),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    label: "Synthetic DevSetu update",
  };
  try {
    await mkdir(join(root, "requests"));
    await mkdir(join(root, "results"));
    await writeFile(join(root, "catalog.json"), JSON.stringify(candidate));
    const store = new SelfUpdates(root);
    expect((await store.state()).request).toBeNull();
    await expect(
      store.request("d".repeat(32), candidate.manifestSha256, changeDetails),
    ).rejects.toThrow();
    const [a, b] = await Promise.all([
      store.request(candidate.candidateId, candidate.manifestSha256, changeDetails),
      store.request(candidate.candidateId, candidate.manifestSha256, changeDetails),
    ]);
    expect(a).toEqual(b);
    expect(a?.actor).toBe("usr_windows_admin");
    expect((await store.state()).changeDetails).toEqual(changeDetails);
    await expect(
      store.request(candidate.candidateId, candidate.manifestSha256, {
        ...changeDetails,
        approvedBy: "Another person",
      }),
    ).rejects.toThrow("note changed");
    expect(
      await new SelfUpdates(root).request(
        candidate.candidateId,
        candidate.manifestSha256,
        changeDetails,
      ),
    ).toEqual(a);
    await writeFile(
      join(root, "results", a!.requestId + ".json"),
      JSON.stringify({
        version: 1,
        requestId: a!.requestId,
        candidateId: candidate.candidateId,
        manifestSha256: candidate.manifestSha256,
        status: "succeeded",
        updatedAt: new Date().toISOString(),
      }),
    );
    expect((await store.state()).result?.status).toBe("succeeded");
    await writeFile(
      join(root, "catalog.json"),
      JSON.stringify({ ...candidate, expiresAt: "2020-01-01T00:00:00.000Z" }),
    );
    expect((await store.state()).expired).toBe(true);
    await expect(
      store.request(candidate.candidateId, candidate.manifestSha256, changeDetails),
    ).rejects.toThrow();
    await writeFile(join(root, "requests", candidate.candidateId + ".json"), "{}");
    await expect(store.state()).rejects.toThrow();
    expect(selfUpdateHtml).not.toContain("<script>");
    expect(selfUpdateHtml).toContain("/maintenance.js");
    expect(selfUpdateScript).toContain("x-csrf-token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
