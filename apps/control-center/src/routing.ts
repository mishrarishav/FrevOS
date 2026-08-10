export type RouteId =
  | "control-center"
  | "design-system"
  | "onboarding"
  | "projects"
  | "intelligence"
  | "tasks"
  | "qa"
  | "reviews"
  | "releases"
  | "deployments"
  | "approvals"
  | "audit"
  | "agents"
  | "integrations"
  | "not-found";

export type RouteDefinition = {
  id: Exclude<RouteId, "not-found">;
  path: string;
  label: string;
  shortLabel: string;
  phase: string;
  description: string;
};

export const routes: readonly RouteDefinition[] = [
  {
    id: "control-center",
    path: "/",
    label: "Control Center",
    shortLabel: "Home",
    phase: "Phase 3",
    description: "Current workspace health, tasks, approvals, projects, and evidence.",
  },
  {
    id: "projects",
    path: "/projects/frevos",
    label: "Projects",
    shortLabel: "Projects",
    phase: "Phase 4/5",
    description: "Workspace-scoped project command center and repository connection.",
  },
  {
    id: "intelligence",
    path: "/projects/frevos/intelligence",
    label: "Intelligence",
    shortLabel: "Intel",
    phase: "Phase 5/12",
    description: "Source-linked repository architecture, facts, risks, and unknowns.",
  },
  {
    id: "tasks",
    path: "/tasks/task-184",
    label: "Tasks",
    shortLabel: "Tasks",
    phase: "Phase 7/8",
    description: "Persistent plans, controlled agent runs, tool evidence, and verdicts.",
  },
  {
    id: "qa",
    path: "/qa/runs/qa-482",
    label: "QA",
    shortLabel: "QA",
    phase: "Phase 8",
    description: "Independent acceptance evidence and reviewable test maintenance.",
  },
  {
    id: "reviews",
    path: "/reviews/pr-12",
    label: "Reviews",
    shortLabel: "Review",
    phase: "Phase 8",
    description: "Outcome, implementation, risk, diff, and independent evidence review.",
  },
  {
    id: "releases",
    path: "/releases",
    label: "Releases",
    shortLabel: "Releases",
    phase: "Phase 9",
    description: "Immutable artifacts, source identity, provenance, and promotion state.",
  },
  {
    id: "deployments",
    path: "/deployments/deploy-72",
    label: "Deployments",
    shortLabel: "Deploy",
    phase: "Phase 10/11",
    description: "Approved targets, exact artifact digests, health, and rollback readiness.",
  },
  {
    id: "approvals",
    path: "/approvals",
    label: "Approvals",
    shortLabel: "Approve",
    phase: "Phase 4/6",
    description: "Scoped, expiring, action-bound decisions with explicit consequences.",
  },
  {
    id: "audit",
    path: "/audit",
    label: "Audit",
    shortLabel: "Audit",
    phase: "Phase 4/6",
    description: "Correlated actor, workspace, tool, risk, target, and outcome evidence.",
  },
  {
    id: "agents",
    path: "/agents",
    label: "Agents",
    shortLabel: "Agents",
    phase: "Phase 7",
    description: "Controlled specialist workers, allowed tools, risk ceilings, and status.",
  },
  {
    id: "integrations",
    path: "/integrations",
    label: "Integrations",
    shortLabel: "Connect",
    phase: "Later phases",
    description: "Separately scoped provider connections and permission boundaries.",
  },
  {
    id: "onboarding",
    path: "/onboarding",
    label: "Connect repository",
    shortLabel: "Connect",
    phase: "Phase 5",
    description: "Canonical GitHub App identity, permission review, and project proposal.",
  },
  {
    id: "design-system",
    path: "/design-system",
    label: "Design system",
    shortLabel: "System",
    phase: "Phase 3",
    description: "Semantic tokens, component rules, responsive behavior, and UI states.",
  },
] as const;

export function normalizePath(pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

export function resolveRoute(pathname: string): RouteDefinition | undefined {
  const normalized = normalizePath(pathname);
  return routes.find((route) => route.path === normalized);
}

export function isPathActive(pathname: string, target: string): boolean {
  const current = normalizePath(pathname);
  if (target === "/") {
    return current === target;
  }
  return current === target || current.startsWith(`${target}/`);
}
