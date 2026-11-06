import {
  ConnectorSchema,
  type DeploymentSettings,
  type DeveloperConnector,
  type Pipeline,
  type PipelineState,
} from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ControlCenterApi } from "../src/api.js";
import { ConfiguredProject, configuredDeploymentHref } from "../src/ComponentDeployments.js";
import { PlatformProjectDetails } from "../src/PlatformProjectDetails.js";

const profile: Pipeline = {
  version: 1,
  profileId: "configured-platform",
  displayName: "Configured platform",
  revision: 4,
  sourceFolder: "D:\\fixture-source",
  sourcePreservedPaths: [".local"],
  archived: false,
  repository: {
    id: `gitrepo_${"a".repeat(32)}`,
    origin: `devsetu://repositories/gitrepo_${"a".repeat(32)}`,
    remoteName: "devsetu",
    branch: "devsetu-dev",
  },
  components: [
    {
      id: "platform",
      name: "Platform",
      context: ".",
      output: ".",
      recipe: "devsetu-native",
      builderId: `ex_${"b".repeat(32)}`,
      destinationId: `ex_${"c".repeat(32)}`,
      destinationBinding: "platform-app",
      dependsOn: [],
      preservedPaths: ["data", ".env"],
    },
  ],
  updatedAt: "2026-11-06T00:00:00.000Z",
  updatedBy: "usr_windows_admin",
};
const source = (userId: string): DeveloperConnector =>
  ConnectorSchema.parse({
    version: 1,
    deviceId: `fc_${"d".repeat(32)}`,
    userId,
    workspaceId: "ws_server20",
    repositoryId: profile.repository.id,
    profileId: profile.profileId,
    name: "Fixture source computer",
    status: "active",
    createdAt: profile.updatedAt,
    expiresAt: "2026-11-07T00:00:00.000Z",
    lastSeenAt: profile.updatedAt,
    online: true,
    changeNotes: true,
    source: {
      version: 1,
      profileId: profile.profileId,
      repository: profile.sourceFolder,
      origin: profile.repository.origin,
      repositoryId: profile.repository.id,
      remoteName: "devsetu",
      branch: "codex/fixture-release",
      head: "e".repeat(40),
      checkedAt: profile.updatedAt,
    },
  });
const state: PipelineState = {
  profiles: [profile],
  runs: [],
  executors: ["builder", "destination"].map((role) => ({
    id: `ex_${(role === "builder" ? "b" : "c").repeat(32)}`,
    name: `Fixture ${role}`,
    profileId: profile.profileId,
    role: role as "builder" | "destination",
    userId: "usr_windows_admin",
    status: "active",
    createdAt: profile.updatedAt,
    expiresAt: "2026-11-07T00:00:00.000Z",
    lastSeenAt: profile.updatedAt,
    systemName: "FIXTURE",
    online: true,
    bindings: [
      {
        id: "platform-app",
        root: "D:\\fixture-runtime",
        healthUrl: "http://127.0.0.1:12345/health",
        recipes: ["devsetu-native"],
      },
    ],
  })),
};
function view({
  userId = "usr_windows_admin",
  devices = [source(userId)],
  pipeline = profile,
  current = state,
}: {
  userId?: string;
  devices?: DeveloperConnector[];
  pipeline?: Pipeline;
  current?: PipelineState;
} = {}) {
  const runPipeline = vi.fn();
  const html = renderToStaticMarkup(
    <ConfiguredProject
      api={{ runPipeline } as unknown as ControlCenterApi}
      workspaceId="ws_server20"
      profile={pipeline}
      state={current}
      devices={devices}
      userId={userId}
      onClose={() => {}}
    />,
  );
  expect(runPipeline).not.toHaveBeenCalled();
  return html;
}
const deployButton = (html: string) =>
  html.match(/<button[^>]*>Deploy all<\/button>/)?.[0] ?? "missing";
it("opens a configured deployment workspace without queuing a build or activation, and uses the configured public entry prefix", () => {
  const html = view();
  expect(html).toContain('aria-label="Configured platform deployment"');
  expect(deployButton(html)).not.toBe("missing");
  expect(deployButton(html)).not.toContain("disabled");
  expect(html).toContain("publish the selected source");
  expect(html).toContain("does not require a second application release");
  expect(html).toContain("Target: FIXTURE");
  expect(html).toContain("Source folder");
  expect(html).toContain("codex/fixture-release");
  expect(html).toContain("Last observed commit");
  expect(html).toContain("e".repeat(12));
  expect(html).not.toContain("/maintenance");
  expect(configuredDeploymentHref("configured-platform", "/devsetu")).toBe(
    "/devsetu/deployments/deploy-72?project=configured-platform",
  );
});
it("keeps deployment disabled for non-owner native access, mismatched source and unavailable enrolled workers", () => {
  expect(deployButton(view({ userId: "usr_reader" }))).toContain("disabled");
  expect(deployButton(view({ devices: [] }))).toContain("disabled");
  const other = source("usr_windows_admin");
  if (!other.source) throw Error("Missing source fixture");
  other.source = { ...other.source, origin: "https://other.invalid/repository" };
  expect(deployButton(view({ devices: [other] }))).toContain("disabled");
  const main = source("usr_windows_admin");
  if (!main.source) throw Error("Missing source fixture");
  main.source = { ...main.source, branch: "main" };
  expect(deployButton(view({ devices: [main] }))).toContain("disabled");
  expect(
    deployButton(
      view({
        current: { ...state, executors: state.executors.map((e) => ({ ...e, online: false })) },
      }),
    ),
  ).toContain("disabled");
  expect(deployButton(view({ pipeline: { ...profile, archived: true } }))).toContain("disabled");
});
it("groups components on the same target host into one chip and retains their individual binding details", () => {
  const component = profile.components[0];
  if (!component) throw Error("Missing component fixture");
  const pipeline = {
    ...profile,
    components: [
      component,
      { ...component, id: "platform-extra", destinationBinding: "platform-extra" },
    ],
  };
  const html = view({ pipeline });
  expect(html.match(/Target: FIXTURE/g)).toHaveLength(1);
  expect(html).toContain("Target: FIXTURE · 2 components");
  expect(html).toContain("platform-app");
  expect(html).toContain("platform-extra");
});
it("keeps an unconfigured platform honest: configuration and separately reviewed prepared-release access, without an active deploy control", () => {
  const project: DeploymentSettings = {
    version: 1,
    profileId: profile.profileId,
    revision: 1,
    displayName: profile.displayName,
    repositoryOrigin: profile.repository.origin,
    sourceFolder: profile.sourceFolder,
    preservedPaths: [],
    runner: "devsetu-platform",
    destination: {
      host: "fixture",
      root: "D:\\fixture-runtime",
      siteUrl: "http://fixture/",
      credentialProfile: "not-connected",
    },
    updatedAt: profile.updatedAt,
    updatedBy: "usr_windows_admin",
  };
  const html = renderToStaticMarkup(
    <PlatformProjectDetails project={project} owner onClose={() => {}} />,
  );
  expect(html).toContain("No configured source-to-build pipeline");
  expect(html).toContain("Configure deployment");
  expect(html).toContain("Review prepared release");
  expect(html).not.toContain(">Deploy<");
  expect(
    renderToStaticMarkup(
      <PlatformProjectDetails project={project} owner={false} onClose={() => {}} />,
    ),
  ).not.toContain("/maintenance");
});
