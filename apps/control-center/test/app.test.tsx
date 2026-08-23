import {
  ClientSchema,
  ProjectAutomationOperationSchema,
  ProjectSchema,
  SessionSummarySchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App, canCommitReviewedChanges, projectAutomationStatusLabel } from "../src/App.js";
import type { ExperienceState } from "../src/experience.js";
import {
  addBasePath,
  basePathFromBaseUrl,
  isPathActive,
  normalizePath,
  removeBasePath,
  resolveRoute,
  routes,
} from "../src/routing.js";

const session = SessionSummarySchema.parse({
  sessionId: "ses_primary",
  userId: "usr_primary",
  authenticatedAt: "2026-08-11T08:00:00.000Z",
  expiresAt: "2026-08-11T20:00:00.000Z",
});
const workspace = WorkspaceSchema.parse({
  workspaceId: "ws_alpha",
  displayName: "Alpha Workspace",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
});
const client = ClientSchema.parse({
  clientId: "cli_alpha",
  workspaceId: "ws_alpha",
  displayName: "Alpha Client",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
});
const project = ProjectSchema.parse({
  projectId: "prj_alpha",
  workspaceId: "ws_alpha",
  clientId: "cli_alpha",
  displayName: "Alpha Project",
  status: "active",
  createdAt: "2026-08-11T08:00:00.000Z",
});
const readyExperience: ExperienceState = {
  kind: "ready",
  session,
  workspaces: [workspace],
  workspace,
  clients: [client],
  projects: [project],
};

describe("Control Center route contract", () => {
  it("keeps route paths and identifiers unique", () => {
    expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length);
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length);
    expect(routes).toHaveLength(14);
  });

  it("normalizes relative and trailing-slash paths", () => {
    expect(normalizePath("approvals")).toBe("/approvals");
    expect(normalizePath("/approvals/")).toBe("/approvals");
    expect(normalizePath("/")).toBe("/");
  });

  it("adds and removes one configured application base path", () => {
    expect(basePathFromBaseUrl("/")).toBe("");
    expect(basePathFromBaseUrl("/frevos/")).toBe("/frevos");
    expect(addBasePath("/projects/frevos", "/frevos")).toBe("/frevos/projects/frevos");
    expect(removeBasePath("/frevos/projects/frevos", "/frevos")).toBe("/projects/frevos");
    expect(removeBasePath("/frevos", "/frevos")).toBe("/");
    expect(removeBasePath("/another/path", "/frevos")).toBe("/another/path");
  });

  it("resolves registered routes and rejects unknown routes", () => {
    expect(resolveRoute("/")?.id).toBe("control-center");
    expect(resolveRoute("design-system/")?.id).toBe("design-system");
    expect(resolveRoute("/missing")).toBeUndefined();
  });

  it("matches root, exact, and nested active paths without false positives", () => {
    expect(isPathActive("/", "/")).toBe(true);
    expect(isPathActive("/audit", "/")).toBe(false);
    expect(isPathActive("/projects/frevos", "/projects/frevos")).toBe(true);
    expect(isPathActive("/projects/frevos/intelligence", "/projects/frevos")).toBe(true);
    expect(isPathActive("/projects", "/projects/frevos")).toBe(false);
  });
});

describe("Control Center rendering", () => {
  it("keeps protected content closed while server authority is loading", () => {
    const html = renderToStaticMarkup(<App initialPath="/" />);
    expect(html).toContain("Resolving your workspace boundary");
    expect(html).not.toContain("Alpha Workspace");
  });

  it("renders server-authorized workspace records without claiming later capabilities", () => {
    const html = renderToStaticMarkup(<App initialPath="/" initialExperience={readyExperience} />);
    expect(html).toContain("Phase 4C · Authenticated workspace");
    expect(html).toContain("Alpha Workspace is authorized.");
    expect(html).toContain("Alpha Client");
    expect(html).toContain("Alpha Project");
    expect(html).toContain("Planned examples · no external work executed");
    expect(html).not.toContain("No action was executed");
    expect(html).toContain('class="health-strip" aria-label="System boundary status" tabindex="0"');
  });

  it.each([
    [{ kind: "unauthenticated" }, "Sign in to FrevOS"],
    [{ kind: "session-expired" }, "Authenticate again"],
    [{ kind: "empty", session }, "Your session has no workspace access"],
    [{ kind: "denied" }, "Workspace access is unavailable"],
    [{ kind: "retry", reason: "unavailable" }, "could not reach the verified data boundary"],
    [{ kind: "retry", reason: "invalid-response" }, "Workspace data could not be verified"],
  ] satisfies ReadonlyArray<[ExperienceState, string]>)(
    "renders the %s protected lifecycle state",
    (state, expected) => {
      const html = renderToStaticMarkup(<App initialExperience={state} />);
      expect(html).toContain(expected);
      expect(html).not.toContain("Alpha Project");
    },
  );

  it("renders the bounded local credential form for Windows personal UAT", () => {
    const html = renderToStaticMarkup(
      <App initialExperience={{ kind: "unauthenticated" }} authenticationMode="local" />,
    );
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Continue to secure sign in");
  });

  it("renders authorized empty project data as empty, not failed", () => {
    const html = renderToStaticMarkup(
      <App initialExperience={{ ...readyExperience, clients: [], projects: [] }} />,
    );
    expect(html).toContain("No projects in this workspace");
    expect(html).toContain("No clients are registered in this workspace.");
  });

  it("renders the production-owned design system", () => {
    const html = renderToStaticMarkup(
      <App initialPath="/design-system" initialExperience={readyExperience} />,
    );
    expect(html).toContain("Calm, precise, evidence-first");
    expect(html).toContain("Reference 85f3ba2");
  });

  it("renders the authenticated projects route from the current workspace snapshot", () => {
    const html = renderToStaticMarkup(
      <App initialPath="/projects/frevos" initialExperience={readyExperience} />,
    );
    expect(html).toContain("Alpha Workspace projects");
    expect(html).toContain("Authenticated project operations");
    expect(html).toContain("Alpha Client");
    expect(html).toContain("Alpha Project");
    expect(html).toContain("GitHub accounts &amp; repositories");
    expect(html).toContain("Discover laptop GitHub account");
    expect(html).toContain("GitHub credentials remain in the Windows GitHub CLI");
    expect(html).not.toContain("This route is reserved, not simulated.");
  });

  it("renders the bounded TrackGRN project panel only for the pinned project", () => {
    const trackGrnProject = ProjectSchema.parse({
      ...project,
      projectId: "prj_uat_trackgrn",
      displayName: "TrackGRN",
    });
    const html = renderToStaticMarkup(
      <App
        initialPath="/projects/frevos"
        initialExperience={{ ...readyExperience, projects: [trackGrnProject] }}
      />,
    );
    expect(html).toContain("TrackGRN UAT operations");
    expect(html).toContain("Exact repository 1334902237");
    expect(html).toContain("human-approved merges only");
    expect(html).toContain("Loading the TrackGRN automation profile");
  });

  it("renders later-phase routes as honest planned surfaces", () => {
    const html = renderToStaticMarkup(
      <App initialPath="/deployments/deploy-72" initialExperience={readyExperience} />,
    );
    expect(html).toContain("This route is reserved, not simulated.");
    expect(html).toContain("Phase 10/11");
    expect(html).toContain("Surface-specific calls");
  });

  it("renders a safe not-found state", () => {
    const html = renderToStaticMarkup(
      <App initialPath="/not-a-route" initialExperience={readyExperience} />,
    );
    expect(html).toContain("No FrevOS surface is registered here.");
    expect(html).toContain("/not-a-route");
  });
});

describe("TrackGRN operation status", () => {
  it.each([
    ["vpn-required", "Connect VPN"],
    ["ui-build-failed", "UI build failed"],
    ["api-tests-failed", "API tests failed"],
    ["artifact-already-exists", "Artifact conflict"],
    ["api-publish-failed", "API publish failed"],
    ["operation-failed", "Failed"],
  ])("renders %s as an actionable failure", (errorCode, expected) => {
    const operation = ProjectAutomationOperationSchema.parse({
      operationId: "op_1234567890abcdef1234567890abcdef1234567890abcdef",
      workspaceId: "ws_alpha",
      projectId: "prj_alpha",
      agentId: "svc_trackgrn_windows_agent",
      requestedBy: "usr_primary",
      action: "project.build",
      status: "failed",
      input: {},
      result: { failureStage: errorCode },
      errorCode,
      createdAt: "2026-08-23T00:00:00.000Z",
      claimedAt: "2026-08-23T00:00:01.000Z",
      completedAt: "2026-08-23T00:00:02.000Z",
    });
    expect(projectAutomationStatusLabel(operation)).toBe(expected);
  });

  it("enables commit only for a reviewed dirty repository", () => {
    const reviewed = {
      busy: false,
      expectedHeadSha: "a".repeat(40),
      expectedChangeDigest: "b".repeat(64),
      commitMessage: "Update TrackGRN UI",
    };
    expect(canCommitReviewedChanges({ ...reviewed, clean: false })).toBe(true);
    expect(canCommitReviewedChanges({ ...reviewed, clean: true })).toBe(false);
    expect(canCommitReviewedChanges({ ...reviewed, clean: undefined })).toBe(false);
    expect(canCommitReviewedChanges({ ...reviewed, clean: false, busy: true })).toBe(false);
    expect(canCommitReviewedChanges({ ...reviewed, clean: false, commitMessage: "  " })).toBe(
      false,
    );
  });
});
