import type { DiscoverySystem } from "./discovery-systems.js";
import { lastSeenLabel } from "./discovery-systems.js";

export function SystemConnections({
  system,
  selectedDeviceId,
  onSelect,
}: {
  system: DiscoverySystem;
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
}) {
  return (
    <section className="system-connections" aria-label="Computer connections">
      <h3>Computer connections</h3>
      <p>
        This is one computer. Project connections below link its local folders to DevSetu; they are
        not separate computers. Health always describes the whole computer.
      </p>
      {system.bindings.map((binding) => (
        <article key={binding.deviceId} className="discovery-connection-card">
          <div>
            <strong>{binding.profileId ? "Project connection" : "System monitoring"}</strong>
            <span className="record-muted">{binding.profileId ?? "No project required"}</span>
          </div>
          {binding.source?.repository ? <code>{binding.source.repository}</code> : null}
          <small>
            {binding.online ? "Online" : "Offline / stale"} ·{" "}
            {lastSeenLabel(binding.lastSeenAt ?? binding.observedAt)}
          </small>
          <button
            type="button"
            className="button secondary"
            aria-pressed={binding.deviceId === selectedDeviceId}
            onClick={() => onSelect(binding.deviceId)}
          >
            {binding.deviceId === selectedDeviceId
              ? "Viewing this activity source"
              : "View this connection's activity"}
          </button>
        </article>
      ))}
    </section>
  );
}
