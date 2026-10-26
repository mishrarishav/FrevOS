import { Filter, LayoutGrid, Search, Table2, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

export function RecordBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  return <span className={`record-badge ${tone}`}>{children}</span>;
}

export type RecordColumn<T> = {
  id: string;
  label: string;
  value: (record: T) => string;
  render?: (record: T) => ReactNode;
};
type Preferences = {
  view: "cards" | "table";
  search: string;
  status: string;
  sort: string;
  descending: boolean;
  filters: Record<string, string>;
};
function readPreferences(key: string, view: Preferences["view"]): Preferences {
  const defaults: Preferences = {
    view,
    search: "",
    status: "all",
    sort: "name",
    descending: false,
    filters: {},
  };
  try {
    const p = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!p || !["cards", "table"].includes(p.view)) return defaults;
    return {
      ...defaults,
      view: p.view,
      search: typeof p.search === "string" ? p.search.slice(0, 240) : "",
      status: typeof p.status === "string" ? p.status : "all",
      sort: typeof p.sort === "string" ? p.sort : "name",
      descending: p.descending === true,
      filters:
        p.filters && typeof p.filters === "object"
          ? (Object.fromEntries(
              Object.entries(p.filters).filter(
                ([k, v]) => k.length < 80 && typeof v === "string" && v.length < 240,
              ),
            ) as Record<string, string>)
          : {},
    };
  } catch {
    return defaults;
  }
}

export function RecordWorkspace<T>({
  title,
  breadcrumb,
  scopeName,
  userId,
  workspaceId,
  page,
  records,
  columns,
  identify,
  statusOf,
  statuses,
  renderCard,
  renderActions,
  renderSurface,
  actions,
  defaultView = "cards",
  notice,
  loading,
  error,
  onRetry,
  noun = "projects",
}: {
  title: string;
  breadcrumb: string;
  scopeName: string;
  userId: string;
  workspaceId: string;
  page: string;
  records: T[];
  columns: RecordColumn<T>[];
  identify: (record: T) => string;
  statusOf: (record: T) => string;
  statuses: { id: string; label: string }[];
  renderCard: (record: T) => ReactNode;
  renderActions: (record: T) => ReactNode;
  renderSurface?: ((records: T[]) => ReactNode) | undefined;
  actions?: ReactNode;
  defaultView?: Preferences["view"];
  notice?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  noun?: "projects" | "systems" | "agents";
}) {
  const key = `frevos:${userId}:${workspaceId}:${page}:records:v1`;
  const listLabel =
    noun === "systems" ? "System list" : noun === "agents" ? "Agent list" : "Project list";
  const [preferences, setPreferences] = useState(() => readPreferences(key, defaultView));
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(preferences));
    } catch {
      /* Private browsing may disable preference storage. */
    }
  }, [key, preferences]);
  const update = (patch: Partial<Preferences>) => setPreferences((p) => ({ ...p, ...patch }));
  const cards = preferences.view === "cards";
  const matches = (value: string, query: string) =>
    value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const rows = records.filter(
    (record) =>
      columns.some((c) => matches(c.value(record), preferences.search)) &&
      (cards
        ? preferences.status === "all" || statusOf(record) === preferences.status
        : columns.every((c) => matches(c.value(record), preferences.filters[c.id] ?? ""))),
  );
  const sort = columns.find((c) => c.id === preferences.sort) ?? columns[0];
  rows.sort(
    (a, b) =>
      (sort?.value(a) ?? "").localeCompare(sort?.value(b) ?? "", undefined, { numeric: true }) *
      (preferences.descending ? -1 : 1),
  );
  const filterPanel = (
    <>
      <div className="record-filter-heading">
        <h2>Filters</h2>
        <button
          type="button"
          className="button ghost record-filter-close"
          aria-label="Close filters"
          onClick={() => setFiltersOpen(false)}
        >
          <X size={16} />
        </button>
      </div>
      <label>
        Status
        <select value={preferences.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="all">All {noun}</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button secondary"
        onClick={() => update({ status: "all", search: "" })}
      >
        Reset filters
      </button>
    </>
  );
  return (
    <section className="record-workspace" aria-label={title}>
      <header className="record-header">
        <div className="record-breadcrumb">
          <span>{breadcrumb}</span>
          <span className="record-scope">{scopeName}</span>
        </div>
        <div className="record-title-row">
          <h1>{title}</h1>
          {!renderSurface ? (
            <fieldset className="record-view-switch" aria-label={`${title} view`}>
              <button
                type="button"
                aria-pressed={cards}
                onClick={() => {
                  update({ view: "cards" });
                  setFiltersOpen(false);
                }}
              >
                <LayoutGrid size={15} /> Card view
              </button>
              <button
                type="button"
                aria-pressed={!cards}
                onClick={() => {
                  update({ view: "table" });
                  setFiltersOpen(false);
                }}
              >
                <Table2 size={15} /> Table view
              </button>
            </fieldset>
          ) : (
            <span className="record-scope">Network view</span>
          )}
          <div className="record-header-actions">{actions}</div>
        </div>
      </header>
      {notice ? (
        <p className="record-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="record-surface">
        {cards ? (
          <section className="record-summary" aria-label="Project status summary">
            {[{ id: "all", label: `All ${noun}` }, ...statuses].map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={preferences.status === s.id}
                onClick={() => update({ status: s.id })}
              >
                <strong>
                  {records.filter((r) => s.id === "all" || statusOf(r) === s.id).length}
                </strong>
                <span>{s.label}</span>
              </button>
            ))}
          </section>
        ) : null}
        <div className="record-toolbar">
          <label className="record-search">
            <Search size={16} />
            <span className="sr-only">Search {noun}</span>
            <input
              aria-label={`Search ${noun}`}
              value={preferences.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder={
                noun === "agents"
                  ? "Search agent, role or model…"
                  : "Search project, source folder or server…"
              }
            />
          </label>
          <span className="record-count">
            {rows.length} of {records.length} {noun}
          </span>
          {cards ? (
            <>
              <label className="record-sort">
                <span className="sr-only">Sort {noun}</span>
                <select
                  aria-label={`Sort ${noun}`}
                  value={sort?.id}
                  onChange={(e) => update({ sort: e.target.value, descending: false })}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button secondary record-filter-trigger"
                onClick={() => setFiltersOpen(true)}
              >
                <Filter size={15} /> Filters
              </button>
            </>
          ) : null}
        </div>
        {loading ? (
          <div className="record-empty" role="status">
            Loading {noun}…
          </div>
        ) : error ? (
          <div className="record-empty" role="alert">
            <h2>{noun} could not be loaded</h2>
            <p>{error}</p>
            <button type="button" className="button secondary" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : (
          <div className={`record-body ${cards && !renderSurface ? "with-card-filters" : ""}`}>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the internal card/table scroller needs keyboard access. */}
            <section className="record-scroll" aria-label={listLabel} tabIndex={0}>
              {rows.length === 0 ? (
                <div className="record-empty">
                  <h2>{records.length ? `No matching ${noun}` : `No ${noun} configured`}</h2>
                  <p>
                    {records.length
                      ? `Adjust search or filters to see your ${noun}.`
                      : noun === "agents"
                        ? "Add a model connection and configure an agent."
                        : noun === "systems"
                          ? "Install and pair a system connector for a configured project."
                          : "Add a project from Projects to connect its source and destination."}
                  </p>
                </div>
              ) : renderSurface ? (
                renderSurface(rows)
              ) : cards ? (
                <div className="record-cards">
                  {rows.map((r) => (
                    <div key={identify(r)}>{renderCard(r)}</div>
                  ))}
                </div>
              ) : (
                <table className="record-table">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th
                          key={c.id}
                          data-column={c.id}
                          scope="col"
                          aria-sort={
                            sort?.id === c.id
                              ? preferences.descending
                                ? "descending"
                                : "ascending"
                              : "none"
                          }
                        >
                          <button
                            type="button"
                            onClick={() =>
                              update({
                                sort: c.id,
                                descending: sort?.id === c.id ? !preferences.descending : false,
                              })
                            }
                          >
                            {c.label}{" "}
                            <span aria-hidden="true">
                              {sort?.id === c.id ? (preferences.descending ? "↓" : "↑") : "↕"}
                            </span>
                          </button>
                          <input
                            aria-label={`Filter ${c.label}`}
                            placeholder="Filter…"
                            value={preferences.filters[c.id] ?? ""}
                            onChange={(e) =>
                              update({
                                filters: { ...preferences.filters, [c.id]: e.target.value },
                              })
                            }
                          />
                        </th>
                      ))}
                      <th scope="col" className="record-actions-column">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={identify(r)}>
                        {columns.map((c) => (
                          <td key={c.id} data-column={c.id}>
                            {c.render ? c.render(r) : c.value(r)}
                          </td>
                        ))}
                        <td className="record-actions-column">{renderActions(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            {cards && !renderSurface ? (
              <aside className="record-filters" aria-label="Card filters">
                {filterPanel}
              </aside>
            ) : null}
          </div>
        )}
      </div>
      {cards && filtersOpen ? (
        <WorkspaceDialog label="Project filters" onClose={() => setFiltersOpen(false)}>
          <section className="record-filter-drawer">{filterPanel}</section>
        </WorkspaceDialog>
      ) : null}
    </section>
  );
}
