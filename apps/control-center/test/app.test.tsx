import {
  ClientSchema,
  ProjectSchema,
  SessionSummarySchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "../src/App.js";
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
    expect(html).toContain("Phase 4 authenticated records");
    expect(html).toContain("Alpha Client");
    expect(html).toContain("Alpha Project");
    expect(html).not.toContain("This route is reserved, not simulated.");
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
