import { useRef, useState } from "react";
import type { Agent, AgentRun } from "@frevos/contracts";
export function agentPositions(agents: Agent[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const roots = agents.filter((a) => !a.parentId || !agents.some((p) => p.id === a.parentId));
  const placed = new Set<string>();
  const place = (agent: Agent, x: number, y: number, angle: number, depth: number) => {
    if (placed.has(agent.id) || depth > 20) return;
    placed.add(agent.id);
    positions.set(agent.id, { x, y });
    const children = agents.filter((a) => a.parentId === agent.id);
    children.forEach((child, i) => {
      const spread = depth === 0 ? Math.PI * 2 : Math.PI * 0.85;
      const theta =
        depth === 0
          ? angle + (spread * i) / Math.max(1, children.length)
          : angle - spread / 2 + (spread * (i + 0.5)) / Math.max(1, children.length);
      const distance = Math.max(depth === 0 ? 240 : 200, children.length * (depth === 0 ? 38 : 70));
      place(
        child,
        x + Math.cos(theta) * distance,
        y + Math.sin(theta) * distance,
        theta,
        depth + 1,
      );
    });
  };
  roots.forEach((a, i) => {
    place(a, 500 + i * 650, 420, 0, 0);
  });
  agents
    .filter((a) => !placed.has(a.id))
    .forEach((a, i) => {
      place(a, 150 + i * 180, 850, 0, 0);
    });
  return positions;
}
export function AgentNetwork({
  agents,
  runs,
  onSelect,
}: {
  agents: Agent[];
  runs: AgentRun[];
  onSelect: (agent: Agent) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    px: number;
    py: number;
    moved: boolean;
    agentId: string | null;
  } | null>(null);
  const points = agentPositions(agents);
  const coordinates = [...points.values()],
    left = coordinates.length ? Math.min(...coordinates.map((p) => p.x - 180)) : 0,
    top = coordinates.length ? Math.min(...coordinates.map((p) => p.y - 65)) : 0,
    right = coordinates.length ? Math.max(...coordinates.map((p) => p.x + 180)) : 360,
    bottom = coordinates.length ? Math.max(...coordinates.map((p) => p.y + 115)) : 240;
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const pointerPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(matrix.inverse());
  };
  return (
    <section className="agent-network" aria-label="Configured agent network">
      <div className="record-row-actions">
        <strong>Agent network</strong>
        <button
          type="button"
          className="button ghost"
          disabled={zoom >= 2}
          onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.2) * 10) / 10))}
        >
          Zoom in
        </button>
        <button
          type="button"
          className="button ghost"
          disabled={zoom <= 0.3}
          onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.2) * 10) / 10))}
        >
          Zoom out
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
        <output aria-label="Network zoom">{Math.round(zoom * 100)}%</output>
      </div>
      <p>
        Lines show configured reporting relationships. A running highlight comes from an actual
        requested run. Drag to move the view; click an agent to configure it.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: SVG groups must expose their interactive descendants; an HTML fieldset is invalid inside this graphics surface. */}
      <svg
        viewBox={`${left} ${top} ${right - left} ${bottom - top}`}
        role="group"
        aria-label="Agent reporting relationships"
        style={{ touchAction: "none", cursor: "grab" }}
        onPointerDown={(e) => {
          if (e.button !== 0 || drag.current) return;
          const point = pointerPoint(e.currentTarget, e.clientX, e.clientY);
          if (!point) return;
          const agentId =
            (e.target as Element).closest("[data-agent-id]")?.getAttribute("data-agent-id") ?? null;
          drag.current = {
            pointerId: e.pointerId,
            x: point.x,
            y: point.y,
            clientX: e.clientX,
            clientY: e.clientY,
            px: pan.x,
            py: pan.y,
            moved: false,
            agentId,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || start.pointerId !== e.pointerId) return;
          const point = pointerPoint(e.currentTarget, e.clientX, e.clientY);
          if (!point) return;
          start.moved ||= Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) >= 4;
          if (start.moved)
            setPan({ x: start.px + point.x - start.x, y: start.py + point.y - start.y });
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          if (!start || start.pointerId !== e.pointerId) return;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (!start.moved && start.agentId) {
            const agent = agents.find((a) => a.id === start.agentId);
            if (agent) onSelect(agent);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <title>
          Configured agents and parent relationships. Choose an agent to edit its configuration.
        </title>
        <g
          transform={`translate(${center.x + pan.x} ${center.y + pan.y}) scale(${zoom}) translate(${-center.x} ${-center.y})`}
        >
          {agents.map((a) => {
            const p = points.get(a.id),
              parent = a.parentId ? points.get(a.parentId) : undefined;
            return p && parent ? (
              <line
                key={a.id}
                x1={parent.x}
                y1={parent.y}
                x2={p.x}
                y2={p.y}
                stroke="#77bfbb"
                opacity={0.5}
                strokeWidth={2}
              />
            ) : null;
          })}
          {agents.map((a, i) => {
            const p = points.get(a.id)!;
            const running = runs.some((r) => r.agentId === a.id && r.status === "running");
            return (
              // biome-ignore lint/a11y/useSemanticElements: An interactive SVG group supports keyboard selection; HTML buttons cannot be SVG children.
              <g
                key={a.id}
                transform={`translate(${p.x} ${p.y})`}
                role="button"
                tabIndex={0}
                data-agent-id={a.id}
                aria-label={`Configure ${a.name}, ${a.role}`}
                onClick={(e) => {
                  if (e.detail === 0) onSelect(a);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(a);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={running ? 49 : 43}
                  fill={`hsl(${(i * 67 + 210) % 360} 55% 48%)`}
                  stroke={running ? "#8af2cb" : "#727d96"}
                  strokeWidth={running ? 5 : 2}
                />
                <text textAnchor="middle" y={8} fill="white" fontSize={24} fontWeight={700}>
                  {a.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")}
                </text>
                <text textAnchor="middle" y={68} fill="#f4f5f8" fontSize={17} fontWeight={600}>
                  {a.name.slice(0, 28)}
                </text>
                <text textAnchor="middle" y={88} fill="#bdc8dc" fontSize={13}>
                  {a.role.slice(0, 36)}
                </text>
                <title>
                  {a.name} · {a.role} ·{" "}
                  {running ? "Running requested analysis" : a.enabled ? "Enabled" : "Disabled"}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </section>
  );
}
