import {
  Activity,
  Bell,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleX,
  Clock3,
  FileCheck2,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  Layers3,
  Mic2,
  Paperclip,
  PanelRightOpen,
  Play,
  Plus,
  Radar,
  Rocket,
  ScrollText,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  activity,
  approvals,
  auditEvents,
  health,
  projects,
  stateExamples,
  type Status,
  tasks,
  tokenGroups,
  type Tone,
  workspaces,
} from "./data.js";
import {
  isPathActive,
  normalizePath,
  resolveRoute,
  type RouteDefinition,
  type RouteId,
  routes,
} from "./routing.js";

type OverlayName = "palette" | "activity" | "states" | "composer" | null;

const routeIcons: Record<Exclude<RouteId, "not-found">, LucideIcon> = {
  "control-center": Radar,
  "design-system": Settings2,
  onboarding: Plus,
  projects: Boxes,
  intelligence: Sparkles,
  tasks: Activity,
  qa: FlaskConical,
  reviews: GitPullRequest,
  releases: Layers3,
  deployments: Rocket,
  approvals: ShieldCheck,
  audit: ScrollText,
  agents: Bot,
  integrations: Zap,
};

const railRouteIds = [
  "control-center",
  "projects",
  "agents",
  "qa",
  "reviews",
  "releases",
  "deployments",
  "approvals",
  "audit",
  "integrations",
] satisfies ReadonlyArray<RouteDefinition["id"]>;

const mobileRouteIds = ["control-center", "tasks", "approvals", "audit"] satisfies ReadonlyArray<
  RouteDefinition["id"]
>;

function routeById(id: RouteDefinition["id"]): RouteDefinition {
  const route = routes.find((candidate) => candidate.id === id);
  if (!route) {
    throw new Error(`Missing route definition: ${id}`);
  }
  return route;
}

function getBrowserPath(): string {
  return typeof window === "undefined" ? "/" : normalizePath(window.location.pathname);
}

export function App({ initialPath }: { initialPath?: string }) {
  const [pathname, setPathname] = useState(() => normalizePath(initialPath ?? getBrowserPath()));
  const [overlay, setOverlay] = useState<OverlayName>(null);
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces[0].id);
  const [activityFilter, setActivityFilter] = useState<"all" | "active">("all");
  const [command, setCommand] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setPathname(getBrowserPath());
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOverlay((current) => (current === "palette" ? null : "palette"));
      }
      if (event.key === "Escape") {
        setOverlay(null);
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    const next = normalizePath(to);
    if (typeof window !== "undefined" && next !== getBrowserPath()) {
      window.history.pushState({}, "", next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setPathname(next);
    setOverlay(null);
  }, []);

  const submitCommand = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setReceipt("Add a bounded request before running this demonstration.");
      return;
    }
    setCommand(normalized);
    setReceipt(
      `Demonstration receipt created locally for “${normalized}”. No action was executed.`,
    );
    setOverlay(null);
  }, []);

  const selectedWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];
  const route = resolveRoute(pathname);

  return (
    <div className="app-canvas">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <TopBar
        workspaceId={selectedWorkspace.id}
        onWorkspaceChange={setWorkspaceId}
        onPalette={() => setOverlay("palette")}
        onActivity={() => setOverlay("activity")}
        onStates={() => setOverlay("states")}
      />

      <div className="shell-grid">
        <NavigationRail pathname={pathname} navigate={navigate} />
        <main id="main-content" className="main-workspace">
          {route?.id === "control-center" ? (
            <ControlCenter
              workspace={selectedWorkspace.name}
              command={command}
              receipt={receipt}
              onCommandChange={setCommand}
              onSubmit={submitCommand}
              navigate={navigate}
            />
          ) : null}
          {route?.id === "design-system" ? (
            <DesignSystem onStates={() => setOverlay("states")} />
          ) : null}
          {route && route.id !== "control-center" && route.id !== "design-system" ? (
            <PlannedSurface route={route} navigate={navigate} />
          ) : null}
          {!route ? <NotFound pathname={pathname} navigate={navigate} /> : null}
        </main>
        <ActivityDock filter={activityFilter} onFilter={setActivityFilter} />
      </div>

      <DesktopComposer
        value={command}
        receipt={receipt}
        onChange={setCommand}
        onSubmit={submitCommand}
      />
      <MobileNavigation
        pathname={pathname}
        navigate={navigate}
        onComposer={() => setOverlay("composer")}
      />

      {overlay === "palette" ? (
        <CommandPalette navigate={navigate} onClose={() => setOverlay(null)} />
      ) : null}
      {overlay === "activity" ? (
        <ActivityOverlay
          filter={activityFilter}
          onFilter={setActivityFilter}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "states" ? <StateGallery onClose={() => setOverlay(null)} /> : null}
      {overlay === "composer" ? (
        <ComposerOverlay
          value={command}
          receipt={receipt}
          onChange={setCommand}
          onSubmit={submitCommand}
          onClose={() => setOverlay(null)}
        />
      ) : null}
    </div>
  );
}

function TopBar({
  workspaceId,
  onWorkspaceChange,
  onPalette,
  onActivity,
  onStates,
}: {
  workspaceId: string;
  onWorkspaceChange: (id: string) => void;
  onPalette: () => void;
  onActivity: () => void;
  onStates: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <span className="brand-mark">F</span>
        <span className="brand-name">FrevOS</span>
      </div>

      <label className="workspace-switcher">
        <span className="sr-only">Current workspace</span>
        <select value={workspaceId} onChange={(event) => onWorkspaceChange(event.target.value)}>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} · {workspace.projects} projects
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>

      <div className="top-bar-spacer" />
      <span className="disclosure-chip">Phase 3 shell · Demonstration data</span>
      <span className="system-state">
        <span className="status-orb verified" aria-hidden="true" />
        Shell healthy
      </span>
      <button className="top-action command-trigger" type="button" onClick={onPalette}>
        <Search aria-hidden="true" size={15} />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      <button
        className="top-action"
        type="button"
        onClick={onActivity}
        aria-label="Open Agent Activity"
      >
        <PanelRightOpen aria-hidden="true" size={17} />
        <span className="action-count">1</span>
      </button>
      <button
        className="top-action"
        type="button"
        onClick={onStates}
        aria-label="Open interface state gallery"
      >
        <Bell aria-hidden="true" size={17} />
      </button>
    </header>
  );
}

function NavigationRail({
  pathname,
  navigate,
}: {
  pathname: string;
  navigate: (to: string) => void;
}) {
  return (
    <aside className="navigation-rail" aria-label="Primary navigation">
      <nav>
        {railRouteIds.map((id) => {
          const route = routeById(id);
          const Icon = routeIcons[id];
          return (
            <AppLink
              key={route.path}
              to={route.path}
              navigate={navigate}
              className={isPathActive(pathname, route.path) ? "rail-link active" : "rail-link"}
              ariaCurrent={isPathActive(pathname, route.path) ? "page" : undefined}
            >
              <Icon aria-hidden="true" size={18} />
              <span>{route.label}</span>
            </AppLink>
          );
        })}
      </nav>
      <AppLink className="rail-link rail-footer" to="/design-system" navigate={navigate}>
        <Settings2 aria-hidden="true" size={18} />
        <span>Design system</span>
      </AppLink>
    </aside>
  );
}

function MobileNavigation({
  pathname,
  navigate,
  onComposer,
}: {
  pathname: string;
  navigate: (to: string) => void;
  onComposer: () => void;
}) {
  return (
    <nav className="mobile-navigation" aria-label="Mobile navigation">
      {mobileRouteIds.slice(0, 2).map((id) => (
        <MobileLink key={id} id={id} pathname={pathname} navigate={navigate} />
      ))}
      <button className="mobile-ask" type="button" onClick={onComposer} aria-label="Ask FrevOS">
        <Sparkles aria-hidden="true" size={20} />
      </button>
      {mobileRouteIds.slice(2).map((id) => (
        <MobileLink key={id} id={id} pathname={pathname} navigate={navigate} />
      ))}
    </nav>
  );
}

function MobileLink({
  id,
  pathname,
  navigate,
}: {
  id: (typeof mobileRouteIds)[number];
  pathname: string;
  navigate: (to: string) => void;
}) {
  const route = routeById(id);
  const Icon = routeIcons[id];
  return (
    <AppLink
      to={route.path}
      navigate={navigate}
      className={isPathActive(pathname, route.path) ? "mobile-link active" : "mobile-link"}
      ariaCurrent={isPathActive(pathname, route.path) ? "page" : undefined}
    >
      <Icon aria-hidden="true" size={17} />
      <span>{route.shortLabel}</span>
    </AppLink>
  );
}

function ControlCenter({
  workspace,
  command,
  receipt,
  onCommandChange,
  onSubmit,
  navigate,
}: {
  workspace: string;
  command: string;
  receipt: string | null;
  onCommandChange: (value: string) => void;
  onSubmit: (value: string) => void;
  navigate: (to: string) => void;
}) {
  const examples = [
    "Analyze the current architecture",
    "Plan a safe issue fix",
    "Review validation evidence",
  ];
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Neural Command OS"
        title={`Good morning. ${workspace} is ready.`}
        description="One calm surface for bounded work, evidence, and human decisions."
        action={
          <AppLink to="/onboarding" navigate={navigate} className="button secondary">
            <Plus aria-hidden="true" size={15} />
            Connect repository
          </AppLink>
        }
      />

      <section className="command-hero" aria-labelledby="command-title">
        <div className="hero-glow" aria-hidden="true" />
        <div className="command-intro">
          <span className="agent-glyph orchestration">MO</span>
          <div>
            <p className="eyebrow">Master Orchestrator · demonstration</p>
            <h2 id="command-title">What should FrevOS prepare?</h2>
          </div>
        </div>
        <CommandForm value={command} onChange={onCommandChange} onSubmit={onSubmit} prominent />
        <fieldset className="example-row">
          <legend className="sr-only">Example commands</legend>
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => onCommandChange(example)}>
              {example}
            </button>
          ))}
        </fieldset>
        {receipt ? <LocalReceipt>{receipt}</LocalReceipt> : null}
      </section>

      <section className="health-strip" aria-label="System boundary status">
        <div className="health-heading">
          <span className="pulse-ring" aria-hidden="true" />
          <span>System boundary</span>
        </div>
        {health.map((service) => (
          <div className="health-item" key={service.label}>
            <span>{service.label}</span>
            <StatusBadge status={service.status} compact />
          </div>
        ))}
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <Panel
            title="Active and recent tasks"
            description="Demonstration timeline · no external work executed"
            action={
              <AppLink to="/tasks/task-184" navigate={navigate}>
                Open timeline
              </AppLink>
            }
          >
            <div className="task-list">
              {tasks.map((task) => (
                <article className="task-row" key={task.id}>
                  <div className="task-orb" aria-hidden="true">
                    <Activity size={16} />
                  </div>
                  <div className="task-copy">
                    <div className="task-title-line">
                      <h3>{task.title}</h3>
                      <StatusBadge status={task.status} compact />
                    </div>
                    <p className="mono-copy">
                      {task.id} · {task.project} · {task.agent}
                    </p>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-label={`${task.progress}% complete`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={task.progress}
                    >
                      <span style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                  <span className="time-copy">{task.updated}</span>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title="Connected project references"
            description="Local shell data pinned to observed merge evidence"
            action={
              <AppLink to="/projects/frevos" navigate={navigate}>
                View projects
              </AppLink>
            }
          >
            <div className="project-grid">
              {projects.map((project) => (
                <article className="project-card" key={project.repo}>
                  <div className="project-mark">
                    <GitBranch aria-hidden="true" size={17} />
                  </div>
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.repo}</p>
                  </div>
                  <StatusBadge status={project.status} compact />
                  <dl>
                    <div>
                      <dt>Default</dt>
                      <dd>{project.branch}</dd>
                    </div>
                    <div>
                      <dt>Observed SHA</dt>
                      <dd>{project.sha}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <div className="dashboard-secondary">
          <Panel
            title="Pending approvals"
            description="Examples only · no decision endpoint"
            tone="approval"
            action={
              <AppLink to="/approvals" navigate={navigate}>
                Open inbox
              </AppLink>
            }
          >
            <div className="approval-list">
              {approvals.map((approval) => (
                <article className="approval-row" key={approval.id}>
                  <div className="approval-icon">
                    <ShieldCheck aria-hidden="true" size={16} />
                  </div>
                  <div>
                    <h3>{approval.title}</h3>
                    <p className="mono-copy">
                      {approval.id} · {approval.target}
                    </p>
                    <p className="approval-meta">
                      {approval.risk} risk · expires in {approval.expiry}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel
            title="Recent audit evidence"
            action={
              <AppLink to="/audit" navigate={navigate}>
                Explore
              </AppLink>
            }
          >
            <ol className="audit-list">
              {auditEvents.map((event) => (
                <li key={event.id}>
                  <span className="status-orb verified" aria-hidden="true" />
                  <div>
                    <p>{event.action}</p>
                    <p className="mono-copy">
                      {event.id} · {event.actor}
                    </p>
                  </div>
                  <time>{event.time}</time>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Phase boundary" tone="signal">
            <div className="boundary-card">
              <FileCheck2 aria-hidden="true" size={20} />
              <div>
                <h3>Shell contract active</h3>
                <p>
                  UI behavior is local and deterministic. Authentication, APIs, persistence, and
                  protected actions remain unavailable.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DesignSystem({ onStates }: { onStates: () => void }) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Phase 3 handoff"
        title="Design system"
        description="Production-owned tokens and patterns derived from the approved Neural Command OS reference."
        action={
          <button className="button secondary" type="button" onClick={onStates}>
            <Layers3 aria-hidden="true" size={15} />
            Open state gallery
          </button>
        }
      />

      <section className="principle-banner">
        <Sparkles aria-hidden="true" size={20} />
        <div>
          <h2>Calm, precise, evidence-first</h2>
          <p>
            Use glow as a status signal, not decoration. Pair every semantic color with text. Keep
            protected consequences explicit.
          </p>
        </div>
        <span className="reference-chip">Reference 85f3ba2</span>
      </section>

      <div className="token-layout">
        {tokenGroups.map((group) => (
          <Panel key={group.title} title={group.title}>
            <div className="token-list">
              {group.items.map((token) => (
                <div className="token-row" key={token.name}>
                  <span className={`token-swatch ${token.tone}`} aria-hidden="true" />
                  <span>{token.name}</span>
                  <code>{token.value}</code>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <div className="component-layout">
        <Panel title="Controls" description="Every primary action has a visible outcome">
          <div className="component-demo">
            <div className="demo-row">
              <button className="button primary" type="button">
                <Play aria-hidden="true" size={15} /> Run demonstration
              </button>
              <button className="button secondary" type="button">
                Review evidence
              </button>
              <button className="button ghost" type="button">
                Cancel
              </button>
            </div>
            <label className="field-label">
              Bounded request
              <input defaultValue="Prepare a reviewable plan" />
              <span>State the intended outcome and target.</span>
            </label>
          </div>
        </Panel>

        <Panel title="Status language" description="Text and shape remain meaningful without color">
          <div className="badge-demo">
            <StatusBadge status={{ label: "Active", tone: "signal" }} />
            <StatusBadge status={{ label: "Orchestrating", tone: "orchestration" }} />
            <StatusBadge status={{ label: "Verified", tone: "verified" }} />
            <StatusBadge status={{ label: "Approval required", tone: "approval" }} />
            <StatusBadge status={{ label: "Failed", tone: "failure" }} />
          </div>
          <div className="evidence-sample">
            <span>Artifact digest</span>
            <code>sha256:8c91…e72b</code>
            <CheckCircle2 aria-label="Verified" size={17} />
          </div>
        </Panel>
      </div>

      <Panel title="State patterns" description="Reusable honest states available in the shell">
        <div className="state-preview-grid">
          {stateExamples.map((state) => (
            <StateCard key={state.id} state={state} compact />
          ))}
        </div>
      </Panel>

      <Panel title="Responsive contract">
        <div className="responsive-contract">
          <div className="responsive-example">
            <span className="device-frame desktop" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <h3>Desktop · 900px and above</h3>
            <p>Persistent rail, adaptive workspace, dock at wide viewport, centered composer.</p>
          </div>
          <div className="responsive-example">
            <span className="device-frame mobile" aria-hidden="true">
              <span />
              <span />
            </span>
            <h3>Mobile · below 900px</h3>
            <p>Compact header, bottom navigation, full-screen sheets, touch-safe actions.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function PlannedSurface({
  route,
  navigate,
}: {
  route: RouteDefinition;
  navigate: (to: string) => void;
}) {
  const Icon = routeIcons[route.id];
  return (
    <div className="planned-page">
      <PageHeader
        eyebrow={`${route.phase} product surface`}
        title={route.label}
        description={route.description}
      />
      <section className="planned-card">
        <div className="planned-icon">
          <Icon aria-hidden="true" size={26} />
        </div>
        <span className="status-badge neutral">
          <span className="status-orb neutral" aria-hidden="true" />
          Planned capability
        </span>
        <h2>This route is reserved, not simulated.</h2>
        <p>
          The approved UI vocabulary includes this surface, but its behavior belongs to{" "}
          {route.phase}. FrevOS will add it only with the required authorization, data, API,
          security, and acceptance boundaries.
        </p>
        <div className="planned-facts">
          <div className="planned-fact">
            <span>Current route</span>
            <code>{route.path}</code>
          </div>
          <div className="planned-fact">
            <span>Network calls</span>
            <strong>None</strong>
          </div>
          <div className="planned-fact">
            <span>Persistent state</span>
            <strong>None</strong>
          </div>
        </div>
        <div className="planned-actions">
          <button className="button primary" type="button" onClick={() => navigate("/")}>
            Return to Control Center
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => navigate("/design-system")}
          >
            Review shell contract
          </button>
        </div>
      </section>
    </div>
  );
}

function NotFound({ pathname, navigate }: { pathname: string; navigate: (to: string) => void }) {
  return (
    <div className="planned-page">
      <section className="planned-card">
        <div className="planned-icon failure">
          <CircleX aria-hidden="true" size={26} />
        </div>
        <span className="eyebrow">Route not found</span>
        <h1>No FrevOS surface is registered here.</h1>
        <code>{pathname}</code>
        <button className="button primary" type="button" onClick={() => navigate("/")}>
          Return to Control Center
        </button>
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-actions">{action}</div> : null}
    </header>
  );
}

function Panel({
  title,
  description,
  action,
  tone,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section className={tone ? `panel tone-${tone}` : "panel"}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="panel-action">{action}</div> : null}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  return (
    <span
      className={compact ? `status-badge ${status.tone} compact` : `status-badge ${status.tone}`}
    >
      <span className={`status-orb ${status.tone}`} aria-hidden="true" />
      {status.label}
    </span>
  );
}

function ActivityDock({
  filter,
  onFilter,
}: {
  filter: "all" | "active";
  onFilter: (filter: "all" | "active") => void;
}) {
  return (
    <aside className="activity-dock" aria-label="Agent Activity">
      <ActivityContent filter={filter} onFilter={onFilter} />
    </aside>
  );
}

function ActivityContent({
  filter,
  onFilter,
}: {
  filter: "all" | "active";
  onFilter: (filter: "all" | "active") => void;
}) {
  const visibleActivity =
    filter === "active"
      ? activity.filter((item) => item.status.tone === "orchestration")
      : activity;
  return (
    <>
      <header className="dock-header">
        <div>
          <p className="eyebrow">Evidence stream</p>
          <h2>Agent Activity</h2>
        </div>
        <span className="live-indicator">
          <span className="status-orb orchestration" aria-hidden="true" /> 1 active
        </span>
      </header>
      <fieldset className="segmented">
        <legend className="sr-only">Filter Agent Activity</legend>
        <button
          className={filter === "all" ? "active" : ""}
          type="button"
          onClick={() => onFilter("all")}
        >
          All
        </button>
        <button
          className={filter === "active" ? "active" : ""}
          type="button"
          onClick={() => onFilter("active")}
        >
          Active
        </button>
      </fieldset>
      <ol className="agent-list">
        {visibleActivity.map((item) => (
          <li key={item.agent}>
            <span
              className={
                item.status.tone === "orchestration" ? "agent-glyph orchestration" : "agent-glyph"
              }
            >
              {item.glyph}
            </span>
            <div>
              <h3>{item.agent}</h3>
              <p>{item.detail}</p>
              <code>{item.tool}</code>
            </div>
            <StatusBadge status={item.status} compact />
          </li>
        ))}
      </ol>
      <div className="dock-boundary">
        <ShieldCheck aria-hidden="true" size={16} />
        <p>Agents shown here have no runtime authority in Phase 3.</p>
      </div>
    </>
  );
}

function DesktopComposer({
  value,
  receipt,
  onChange,
  onSubmit,
}: {
  value: string;
  receipt: string | null;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  return (
    <section className="desktop-composer" aria-label="Ask FrevOS">
      <CommandForm value={value} onChange={onChange} onSubmit={onSubmit} />
      {receipt ? <span className="composer-receipt">Local receipt ready</span> : null}
    </section>
  );
}

function CommandForm({
  value,
  onChange,
  onSubmit,
  prominent = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  prominent?: boolean;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(value);
  };
  return (
    <form className={prominent ? "command-form prominent" : "command-form"} onSubmit={submit}>
      <button type="button" aria-label="Attach context" title="Attachment is a Phase 3 placeholder">
        <Paperclip aria-hidden="true" size={17} />
      </button>
      <label>
        <span className="sr-only">Ask FrevOS</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ask FrevOS for a bounded outcome…"
        />
      </label>
      <span className="risk-readout">
        <span className="status-orb approval" aria-hidden="true" /> risk evaluated before action
      </span>
      <button
        type="button"
        aria-label="Voice input placeholder"
        title="Voice is planned for Phase 14"
      >
        <Mic2 aria-hidden="true" size={17} />
      </button>
      <button className="run-button" type="submit">
        <Send aria-hidden="true" size={15} />
        Run
      </button>
    </form>
  );
}

function LocalReceipt({ children }: { children: ReactNode }) {
  return (
    <div className="local-receipt" role="status">
      <Check aria-hidden="true" size={15} />
      <span>{children}</span>
    </div>
  );
}

function CommandPalette({
  navigate,
  onClose,
}: {
  navigate: (to: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => searchInput.current?.focus(), []);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return routes;
    }
    return routes.filter((route) =>
      `${route.label} ${route.description} ${route.path}`.toLowerCase().includes(needle),
    );
  }, [query]);
  return (
    <Overlay title="Command palette" onClose={onClose} className="palette-dialog">
      <div className="palette-search">
        <Search aria-hidden="true" size={18} />
        <label>
          <span className="sr-only">Search FrevOS routes</span>
          <input
            ref={searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search routes and commands…"
          />
        </label>
        <kbd>Esc</kbd>
      </div>
      <p className="palette-label">Navigate</p>
      <div className="palette-results">
        {matches.map((route) => {
          const Icon = routeIcons[route.id];
          return (
            <button key={route.path} type="button" onClick={() => navigate(route.path)}>
              <span className="palette-icon">
                <Icon aria-hidden="true" size={17} />
              </span>
              <span>
                <strong>{route.label}</strong>
                <small>{route.description}</small>
              </span>
              <code>{route.path}</code>
            </button>
          );
        })}
        {matches.length === 0 ? <p className="empty-result">No matching FrevOS surface.</p> : null}
      </div>
    </Overlay>
  );
}

function ActivityOverlay({
  filter,
  onFilter,
  onClose,
}: {
  filter: "all" | "active";
  onFilter: (filter: "all" | "active") => void;
  onClose: () => void;
}) {
  return (
    <Overlay title="Agent Activity" onClose={onClose} className="side-dialog">
      <ActivityContent filter={filter} onFilter={onFilter} />
    </Overlay>
  );
}

function StateGallery({ onClose }: { onClose: () => void }) {
  return (
    <Overlay title="Interface state gallery" onClose={onClose} className="gallery-dialog">
      <div className="gallery-heading">
        <div>
          <p className="eyebrow">Reusable system states</p>
          <h2>Honest at every boundary</h2>
          <p className="dialog-description">
            Loading, denial, failure, and expiry must never look like verified success.
          </p>
        </div>
      </div>
      <div className="state-gallery-grid">
        {stateExamples.map((state) => (
          <StateCard key={state.id} state={state} />
        ))}
      </div>
    </Overlay>
  );
}

function StateCard({
  state,
  compact = false,
}: {
  state: (typeof stateExamples)[number];
  compact?: boolean;
}) {
  const Icon =
    state.id === "loading"
      ? Clock3
      : state.id === "offline"
        ? WifiOff
        : state.id === "failed"
          ? CircleX
          : state.id === "denied"
            ? ShieldCheck
            : CircleAlert;
  return (
    <article className={compact ? `state-card ${state.tone} compact` : `state-card ${state.tone}`}>
      <Icon aria-hidden="true" size={19} />
      <span>{state.label}</span>
      <h3>{state.title}</h3>
      <p>{state.description}</p>
    </article>
  );
}

function ComposerOverlay({
  value,
  receipt,
  onChange,
  onSubmit,
  onClose,
}: {
  value: string;
  receipt: string | null;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Overlay title="Ask FrevOS" onClose={onClose} className="composer-dialog">
      <div className="composer-sheet-copy">
        <span className="agent-glyph orchestration">MO</span>
        <div>
          <p className="eyebrow">Local demonstration</p>
          <h2>Describe one bounded outcome.</h2>
          <p className="dialog-description">No external request or protected action will occur.</p>
        </div>
      </div>
      <CommandForm value={value} onChange={onChange} onSubmit={onSubmit} prominent />
      {receipt ? <LocalReceipt>{receipt}</LocalReceipt> : null}
    </Overlay>
  );
}

function Overlay({
  title,
  onClose,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className="overlay-backdrop" role="presentation">
      <section
        className={`overlay-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="overlay-close"
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X aria-hidden="true" size={18} />
        </button>
        {children}
      </section>
    </div>
  );
}

function AppLink({
  to,
  navigate,
  className,
  ariaCurrent,
  children,
}: {
  to: string;
  navigate: (to: string) => void;
  className?: string;
  ariaCurrent?: "page" | undefined;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} onClick={onClick} aria-current={ariaCurrent}>
      {children}
    </a>
  );
}
