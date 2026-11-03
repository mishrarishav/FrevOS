const changeDetails = { message: "Update platform controls", approvedBy: "Fixture owner" };

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import {
  renderSelfUpdateHtml,
  renderSelfUpdateScript,
  SelfUpdates,
  selfUpdateHtml,
  selfUpdateScript,
} from "../src/self-updates.js";

it("runs maintenance polling and submission with the entry's prefix and CSRF cookie", async () => {
  interface Element {
    value: string;
    textContent: string;
    disabled: boolean;
    readOnly: boolean;
    onclick?: () => void;
    onsubmit?: (event: { preventDefault(): void }) => Promise<void>;
    showModal(): void;
    close(): void;
  }
  for (const basePath of ["", "/workspace"]) {
    const csrfName = basePath ? "__Host-frevos-workspace-csrf" : "frevos-internal-csrf";
    const elements = new Map<string, Element>();
    const element = (id: string) => {
      let value = elements.get(id);
      if (!value) {
        value = {
          value: "",
          textContent: "",
          disabled: false,
          readOnly: false,
          showModal() {},
          close() {},
        };
        elements.set(id, value);
      }
      return value;
    };
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    runInNewContext(renderSelfUpdateScript(basePath, csrfName), {
      document: { getElementById: element, cookie: `unrelated-csrf=wrong; ${csrfName}=entry-csrf` },
      window: {},
      setTimeout: () => 0,
      setInterval: () => 0,
      fetch: async (url: string, init: RequestInit | undefined) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidate: {
              candidateId: "a".repeat(32),
              manifestSha256: "b".repeat(64),
              label: "Fixture candidate",
            },
            request: null,
            result: null,
            expired: false,
          }),
        };
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const click = element("deploy").onclick;
    if (!click) throw Error("Maintenance deploy handler missing");
    click();
    element("message").value = "Update fixture";
    element("approved-by").value = "Fixture owner";
    const submit = element("change-form").onsubmit;
    if (!submit) throw Error("Maintenance submit handler missing");
    await submit({ preventDefault() {} });
    expect(calls.map((c) => c.url)).toEqual([
      basePath + "/v1/workspaces/ws_server20/platform-update",
      basePath + "/v1/workspaces/ws_server20/platform-update",
    ]);
    expect(calls[1]?.init).toMatchObject({
      method: "POST",
      headers: { "x-csrf-token": "entry-csrf" },
    });
    expect(renderSelfUpdateHtml(basePath)).toContain(`src="${basePath}/maintenance.js"`);
    expect(renderSelfUpdateHtml(basePath)).toContain(`href="${basePath}/maintenance.css"`);
  }
  expect(renderSelfUpdateHtml("")).toBe(selfUpdateHtml);
  expect(() => renderSelfUpdateHtml("/workspace/other")).toThrow("Invalid maintenance base path");
  expect(() => renderSelfUpdateScript("/workspace", "bad;cookie")).toThrow(
    "Invalid maintenance cookie",
  );
});
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
