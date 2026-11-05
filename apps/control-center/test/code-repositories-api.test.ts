import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";

it("uses scoped prefixed authenticated code APIs, query encoding, CSRF grants and an authenticated ZIP URL", async () => {
  const id = "gitrepo_" + "a".repeat(32),
    sha = "b".repeat(40),
    calls: { url: string; init: RequestInit | undefined }[] = [];
  const access = { repositoryId: id, revision: 0, ownerId: null, users: [] };
  const api = createControlCenterApi(
    async (url, init) => {
      const path = String(url);
      calls.push({ url: path, init });
      let value: unknown;
      if (path.endsWith("/code-repositories"))
        value = { workspaceId: "ws_fixture", administrator: true, repositories: [] };
      else if (path.includes("/tree?"))
        value = {
          repositoryId: id,
          branch: "feature/test",
          head: sha,
          path: "src",
          branches: [],
          entries: [],
          total: 0,
          page: 0,
          pageSize: 100,
          latest: null,
          readme: null,
        };
      else if (path.includes("/blob?"))
        value = {
          repositoryId: id,
          path: "src/app.ts",
          head: sha,
          sha,
          bytes: 1,
          text: "x",
          binary: false,
          tooLarge: false,
        };
      else if (path.includes("/history?")) value = { commits: [], hasMore: false, page: 0 };
      else value = access;
      return new Response(JSON.stringify(value));
    },
    "/devsetu",
    () => "fixture-csrf",
  );
  const abort = new AbortController();
  expect((await api.codeCatalog!("ws_fixture", abort.signal)).administrator).toBe(true);
  expect(
    (await api.codeTree!("ws_fixture", id, { branch: "feature/test", path: "src" }, abort.signal))
      .branch,
  ).toBe("feature/test");
  expect((await api.codeBlob!("ws_fixture", id, { path: "src/app.ts" })).text).toBe("x");
  expect((await api.codeHistory!("ws_fixture", id, { branch: "main" })).hasMore).toBe(false);
  expect(await api.codeAccess!("ws_fixture", id)).toEqual(access);
  expect(
    await api.shareCode!("ws_fixture", id, {
      version: 1,
      expectedRevision: 0,
      userId: "usr_bob" as never,
      allow: true,
    }),
  ).toEqual(access);
  expect(api.codeArchiveUrl!("ws_fixture", id, { branch: "feature/test", head: sha })).toBe(
    `/devsetu/v1/workspaces/ws_fixture/code-repositories/${id}/archive?branch=feature%2Ftest&head=${sha}`,
  );
  expect(calls.every((c) => c.init?.credentials === "same-origin")).toBe(true);
  expect(calls[1]?.url).toContain("branch=feature%2Ftest&path=src");
  expect(calls.at(-1)?.init?.headers).toMatchObject({ "x-csrf-token": "fixture-csrf" });
});
