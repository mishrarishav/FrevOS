import { type DeploymentSettings, DeploymentSettingsSchema } from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createControlCenterApi } from "../src/api.js";
import {
  blankSettings,
  DeploymentSettingsPage,
  settingsForm,
} from "../src/DeploymentSettingsPage.js";
import { resolveRoute } from "../src/routing.js";

const profile: DeploymentSettings = DeploymentSettingsSchema.parse({
  version: 1,
  profileId: "servix-development",
  displayName: "Servix",
  revision: 1,
  repositoryOrigin: "https://example.invalid/servix.git",
  sourceFolder: "D:\\servixDev",
  destination: {
    host: "10.9.69.21",
    root: "D:\\servixDev",
    siteUrl: "http://10.9.69.21:82/",
    credentialProfile: "server21-development",
  },
  preservedPaths: ["backend/attachment"],
  updatedAt: "2026-10-21T00:00:00.000Z",
  updatedBy: "usr_windows_admin",
  runner: "servix-development",
});
it("uses the real settings route, keeps new projects disconnected, and strips read-only server metadata from saves", () => {
  expect(resolveRoute("/deployments/setup")?.id).toBe("deployment-setup");
  expect(resolveRoute("/projects/configuration")?.id).toBe("deployment-setup");
  expect(blankSettings().destination.credentialProfile).toBe("not-connected");
  const fields = settingsForm(profile);
  expect(fields).toMatchObject({ expectedRevision: 1, preservedPaths: ["backend/attachment"] });
  expect(fields).not.toHaveProperty("runner");
  expect(fields).not.toHaveProperty("updatedBy");
  expect(
    renderToStaticMarkup(
      <DeploymentSettingsPage api={createControlCenterApi()} workspaceId="ws_server20" />,
    ),
  ).toContain("Loading projects");
});
it("requests a native folder picker only for the selected workspace device with CSRF", async () => {
  const deviceId = "fc_" + "a".repeat(32);
  let sent: RequestInit | undefined;
  let path = "";
  const selection = {
    version: 1,
    requestId: "fp_" + "b".repeat(32),
    deviceId,
    profileId: "servix-development",
    expiresAt: "2026-10-21T12:00:00.000Z",
    status: "queued",
  };
  const api = createControlCenterApi(
    async (url, init) => {
      path = String(url);
      sent = init;
      return new Response(JSON.stringify(selection));
    },
    "/frevos",
    () => "csrf-fixture",
  );
  expect(await api.chooseConnectorFolder?.("ws_server20", deviceId)).toEqual(selection);
  expect(path).toBe("/frevos/v1/workspaces/ws_server20/connectors/" + deviceId + "/choose-folder");
  expect(sent?.headers).toMatchObject({ "x-csrf-token": "csrf-fixture" });
  expect(JSON.parse(String(sent?.body))).toEqual({});
});
it("loads, revision-saves and tests settings using workspace scope and CSRF, with optional source selection", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const result = {
    profileId: profile.profileId,
    revision: 1,
    checkedAt: profile.updatedAt,
    checks: [],
    ready: false,
  };
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify(
          String(url).endsWith("/test") ? result : init?.method === "POST" ? profile : [profile],
        ),
        { headers: { "content-type": "application/json" } },
      );
    },
    "/frevos",
    () => "csrf-test",
  );
  expect(await api.listDeploymentSettings?.("ws_server20")).toEqual([profile]);
  expect(await api.saveDeploymentSettings?.("ws_server20", settingsForm(profile))).toEqual(profile);
  expect(await api.testDeploymentSettings?.("ws_server20", profile.profileId)).toEqual(result);
  await api.testDeploymentSettings?.("ws_server20", profile.profileId, "fc_" + "a".repeat(32));
  expect(calls[0]?.url).toBe("/frevos/v1/workspaces/ws_server20/deployment-settings");
  expect(calls[1]?.init?.headers).toMatchObject({ "x-csrf-token": "csrf-test" });
  expect(JSON.parse(String(calls[1]?.init?.body)).expectedRevision).toBe(1);
  expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({});
  expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({ deviceId: "fc_" + "a".repeat(32) });
});
