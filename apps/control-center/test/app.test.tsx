import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "../src/App.js";
import { isPathActive, normalizePath, resolveRoute, routes } from "../src/routing.js";

describe("Phase 3 route contract", () => {
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
  it("renders the bounded Control Center disclosure and observed projects", () => {
    const html = renderToStaticMarkup(<App initialPath="/" />);
    expect(html).toContain("Phase 3 shell · Demonstration data");
    expect(html).toContain("mishrarishav/FrevOS");
    expect(html).not.toContain("No action was executed");
  });

  it("renders the production-owned design system", () => {
    const html = renderToStaticMarkup(<App initialPath="/design-system" />);
    expect(html).toContain("Calm, precise, evidence-first");
    expect(html).toContain("Reference 85f3ba2");
  });

  it("renders later-phase routes as honest planned surfaces", () => {
    const html = renderToStaticMarkup(<App initialPath="/deployments/deploy-72" />);
    expect(html).toContain("This route is reserved, not simulated.");
    expect(html).toContain("Phase 10/11");
    expect(html).toContain("Network calls");
  });

  it("renders a safe not-found state", () => {
    const html = renderToStaticMarkup(<App initialPath="/not-a-route" />);
    expect(html).toContain("No FrevOS surface is registered here.");
    expect(html).toContain("/not-a-route");
  });
});
