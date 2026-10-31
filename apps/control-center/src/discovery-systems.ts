import type { DiscoveryState } from "@frevos/contracts";
export type DiscoverySource = DiscoveryState["systems"][number];
export type DiscoverySystem = DiscoverySource & {
  systemKey: string;
  bindings: DiscoverySource[];
  unverifiedBindings: string[];
};
const systemName = (name: string) => name.trim().toLowerCase();
const seenAt = (source: DiscoverySource) =>
  Math.max(Date.parse(source.lastSeenAt ?? "") || 0, Date.parse(source.observedAt ?? "") || 0);

export function lastSeenLabel(at: string | null | undefined, now = Date.now()): string {
  if (!at || !Number.isFinite(Date.parse(at))) return "Last seen: Not recorded";
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  const age =
    seconds < 60
      ? "less than a minute ago"
      : seconds < 3600
        ? `${Math.floor(seconds / 60)} min ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)} hr ago`
          : `${Math.floor(seconds / 86400)} days ago`;
  return `Last seen: ${new Date(at).toLocaleString()} · ${age}`;
}
export function discoverySystems(sources: DiscoverySource[]): DiscoverySystem[] {
  const groups = new Map<string, DiscoverySource[]>();
  const candidates = new Map<string, Set<string>>();
  const pending: DiscoverySource[] = [];
  for (const source of sources) {
    const identity = source.observation?.system.installationId;
    if (!identity) {
      pending.push(source);
      continue;
    }
    const key = `${source.userId}:${source.status}:${identity}`;
    const existing = groups.get(key) ?? [];
    existing.push(source);
    groups.set(key, existing);
    const name = systemName(source.observation?.system.systemName ?? "");
    if (name) {
      const alias = JSON.stringify([source.userId, source.status, name]);
      const matches = candidates.get(alias) ?? new Set<string>();
      matches.add(key);
      candidates.set(alias, matches);
    }
  }
  for (const source of pending) {
    // A display association only: retain the original device ID and owner checks.
    // Conflicting reported identities or platforms must never merge by hostname.
    const name = systemName(source.observation?.system.systemName ?? source.name);
    const matches = candidates.get(JSON.stringify([source.userId, source.status, name]));
    const candidate = matches?.size === 1 ? [...matches][0] : undefined;
    const bindings = candidate ? groups.get(candidate) : undefined;
    const platform = source.observation?.system.platform;
    const compatible =
      !platform ||
      bindings?.every(
        (binding) => !binding.observation || binding.observation.system.platform === platform,
      );
    if (bindings && compatible) bindings.push(source);
    else groups.set(source.deviceId, [source]);
  }
  return [...groups].map(([systemKey, bindings]) => {
    const sorted = [...bindings].sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        Number(!!b.observation) - Number(!!a.observation) ||
        Number(!b.profileId) - Number(!a.profileId) ||
        Number(b.policy?.policy.enabled ?? false) - Number(a.policy?.policy.enabled ?? false) ||
        seenAt(b) - seenAt(a) ||
        a.deviceId.localeCompare(b.deviceId),
    );
    const lastSeen = Math.max(...bindings.map(seenAt));
    return {
      ...sorted[0]!,
      systemKey,
      bindings: sorted,
      unverifiedBindings: sorted
        .filter((binding) => !binding.observation?.system.installationId)
        .map((binding) => binding.deviceId),
      lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
      online: bindings.some((s) => s.online),
    };
  });
}
