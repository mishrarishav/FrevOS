import type { SystemHealthPoint } from "@frevos/contracts";
export function healthSegments(points: SystemHealthPoint[], metric: "cpu" | "memory", end: number) {
  const segments: { at: string; value: number; x: number; y: number }[][] = [];
  let current: (typeof segments)[number] = [],
    previous = 0;
  for (const point of points) {
    const time = Date.parse(point.at);
    const value =
      metric === "cpu"
        ? point.cpuPercent
        : point.memoryTotal > 0 && point.memoryAvailable <= point.memoryTotal
          ? (100 * (point.memoryTotal - point.memoryAvailable)) / point.memoryTotal
          : null;
    if (time < end - 900000 || time > end) continue;
    if (value === null || time - previous > 15000) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (value !== null)
      current.push({
        at: point.at,
        value,
        x: 30 + ((time - (end - 900000)) / 900000) * 560,
        y: 120 - value,
      });
    previous = time;
  }
  if (current.length) segments.push(current);
  return segments;
}
export function HealthGraphs({
  points,
  online,
  cpuSupported = true,
}: {
  points: SystemHealthPoint[];
  online: boolean;
  cpuSupported?: boolean;
}) {
  const end = Math.max(Date.now(), ...points.map((p) => Date.parse(p.at)));
  return (
    <section aria-label="System utilization graphs">
      <h3>System utilization · last 15 minutes</h3>
      <p>
        Actual received samples, usually every 5 seconds. Gaps stay blank; these graphs do not
        measure project progress.{" "}
        {online
          ? "Receiving system observations."
          : "Offline or stale: no live values are inferred."}
      </p>
      <div className="discovery-form-grid">
        {(["cpu", "memory"] as const).map((metric) => {
          const segments = healthSegments(points, metric, end),
            label = metric === "cpu" ? "CPU utilization" : "RAM utilization";
          return (
            <figure key={metric} style={{ margin: 0, minWidth: 0 }}>
              <figcaption>{label}</figcaption>
              <svg
                role="img"
                aria-label={label + " over 15 minutes"}
                viewBox="0 0 600 145"
                style={{
                  width: "100%",
                  height: 145,
                  border: "1px solid var(--border, #dbe2ea)",
                  borderRadius: 8,
                }}
              >
                <title>{label}. Missing observations are gaps.</title>
                {[0, 50, 100].map((v) => (
                  <g key={v}>
                    <line
                      x1={30}
                      x2={590}
                      y1={120 - v}
                      y2={120 - v}
                      stroke="currentColor"
                      opacity={0.15}
                    />
                    <text x={2} y={124 - v} fontSize={10} fill="currentColor">
                      {v}%
                    </text>
                  </g>
                ))}
                {segments.map((segment) => (
                  <g key={segment[0]!.at}>
                    <polyline
                      points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={metric === "cpu" ? "#2683df" : "#8d60d3"}
                      strokeWidth={2}
                    />
                    {segment.map((p) => (
                      <circle
                        key={p.at}
                        cx={p.x}
                        cy={p.y}
                        r={2}
                        fill={metric === "cpu" ? "#2683df" : "#8d60d3"}
                      >
                        <title>
                          {new Date(p.at).toLocaleString()} · {p.value.toFixed(1)}%
                        </title>
                      </circle>
                    ))}
                  </g>
                ))}
                <text x={30} y={140} fontSize={10} fill="currentColor">
                  {new Date(end - 900000).toLocaleTimeString()}
                </text>
                <text x={590} y={140} textAnchor="end" fontSize={10} fill="currentColor">
                  {new Date(end).toLocaleTimeString()}
                </text>
              </svg>
              {metric === "cpu" && !cpuSupported ? (
                <p>System-wide CPU measurement is unavailable on this Android connector.</p>
              ) : !segments.length ? (
                <p>Waiting for measured samples.</p>
              ) : null}
            </figure>
          );
        })}
      </div>
    </section>
  );
}
