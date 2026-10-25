import type { DiscoveryState } from "@frevos/contracts";
export type DiscoverySource = DiscoveryState["systems"][number];
export type DiscoverySystem = DiscoverySource & { systemKey: string; bindings: DiscoverySource[] };
export function discoverySystems(sources: DiscoverySource[]): DiscoverySystem[] {
  const groups = new Map<string, DiscoverySource[]>();
  for (const source of sources) {
    const identity = source.observation?.system.installationId;
    const key = identity ? `${source.userId}:${source.status}:${identity}` : source.deviceId;
    const existing = groups.get(key) ?? [];
    existing.push(source);
    groups.set(key, existing);
  }
  return [...groups].map(([systemKey, bindings]) => {
    const sorted = [...bindings].sort(
      (a, b) =>
        Number(b.online) * 64 +
        Number(!b.profileId) * 16 +
        Number(b.policy?.policy.enabled ?? false) * 8 -
        (Number(a.online) * 64 +
          Number(!a.profileId) * 16 +
          Number(a.policy?.policy.enabled ?? false) * 8),
    );
    return { ...sorted[0]!, systemKey, bindings: sorted, online: bindings.some((s) => s.online) };
  });
}
