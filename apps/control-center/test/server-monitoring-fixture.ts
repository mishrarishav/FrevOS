import { type ServerMonitorCatalog, ServerMonitorCatalogSchema } from "@frevos/contracts";

export const serverMonitorFixture = () =>
  ServerMonitorCatalogSchema.parse({
    workspaceId: "ws_monitor_fixture",
    administrator: true,
    revision: 3,
    observedAt: "2026-11-11T04:05:00.000Z",
    policy: {
      enabled: true,
      intervalSeconds: 30,
      cpuWarningPercent: 88,
      memoryWarningPercent: 91,
      consecutiveSamples: 3,
      staleAfterSeconds: 90,
      retentionHours: 48,
      maxPointsPerTarget: 240,
    },
    targets: [
      {
        id: `srv_${"a".repeat(32)}`,
        name: "Application host",
        address: "10.88.0.2",
        port: 5985,
        transport: "winrm-http",
        enabled: true,
        revision: 2,
        credentialProfile: "monitor-fixture",
        grants: ["usr_fixture"],
        sourceRefs: [
          {
            registerId: `rr_${"b".repeat(32)}`,
            recordId: `rec_${"c".repeat(32)}`,
            title: "Fixture application",
          },
        ],
        access: {
          status: "connected",
          checkedAt: "2026-11-11T04:05:00.000Z",
          computerName: "HOST-FIXTURE",
          message: "Measured through the configured collector",
        },
        latest: {
          observedAt: "2026-11-11T04:05:00.000Z",
          computerName: "HOST-FIXTURE",
          osName: "Windows Server fixture",
          uptimeSeconds: 93780,
          logicalProcessors: 8,
          cpuPercent: 46.5,
          memoryTotalBytes: 17179869184,
          memoryAvailableBytes: 4294967296,
          disks: [{ name: "C:", totalBytes: 107374182400, freeBytes: 21474836480 }],
          network: { receivedBytesPerSecond: null, sentBytesPerSecond: 1024 },
          processes: [
            { pid: 42, name: "Application worker", cpuPercent: null, workingSetBytes: 104857600 },
          ],
          services: [
            {
              name: "fixture",
              displayName: "Fixture service",
              state: "Running",
              startMode: "Automatic",
              pid: 42,
            },
          ],
        },
        history: [
          {
            at: "2026-11-11T04:04:30.000Z",
            cpuPercent: 42,
            memoryUsedBytes: 12884901888,
            memoryTotalBytes: 17179869184,
          },
          {
            at: "2026-11-11T04:05:00.000Z",
            cpuPercent: 46.5,
            memoryUsedBytes: 12884901888,
            memoryTotalBytes: 17179869184,
          },
        ],
        alerts: [
          {
            id: `sma_${"d".repeat(32)}`,
            targetId: `srv_${"a".repeat(32)}`,
            kind: "cpu",
            severity: "warning",
            openedAt: "2026-11-11T03:50:00.000Z",
            resolvedAt: null,
            message: "CPU above the configured threshold",
            acknowledged: false,
          },
        ],
        polling: false,
        lastAttemptAt: "2026-11-11T04:05:00.000Z",
        lastError: null,
      },
    ],
  });

export function fixtureTarget(catalog: ServerMonitorCatalog) {
  const target = catalog.targets[0];
  if (!target) throw new Error("Expected the server fixture target");
  return target;
}
