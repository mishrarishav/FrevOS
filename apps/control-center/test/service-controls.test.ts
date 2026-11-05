import type { ManagedService, SoftwareState } from "@frevos/contracts";
import { expect, it } from "vitest";
import { serviceControlState, serviceResultLabel } from "../src/SoftwarePanel.js";

it("shows service actions only for a fresh allowed administrator view with local consent and actual OS rights", () => {
  const service: ManagedService = {
    id: "a".repeat(64),
    name: "Fixture",
    displayName: "Fixture",
    definitionSha256: "b".repeat(64),
    manager: "windows-scm",
    status: "stopped",
    startupType: "Manual",
    protected: false,
    canStart: true,
    canStop: true,
  };
  const now = Date.now();
  const state = {
    administrator: true,
    jobs: [],
    servicePolicy: {
      revision: 1,
      rules: [{ id: service.id, definitionSha256: service.definitionSha256, enabled: true }],
    },
    device: {
      online: true,
      capability: { serviceManagement: { version: 1, controlConsent: true } },
      serviceInventory: { observedAt: new Date(now).toISOString(), items: [service] },
    },
  } as unknown as SoftwareState;
  expect(serviceControlState(state, service, now)).toMatchObject({
    start: true,
    stop: false,
    enabled: true,
  });
  expect(serviceControlState(state, { ...service, status: "running" }, now)).toMatchObject({
    start: false,
    stop: true,
  });
  for (const patch of [
    { administrator: false },
    { device: { ...state.device, online: false } },
    {
      device: {
        ...state.device,
        capability: {
          ...state.device.capability,
          serviceManagement: { version: 1, controlConsent: false },
        },
      },
    },
    { servicePolicy: { ...state.servicePolicy, rules: [] } },
    { jobs: [{ status: "working" }] },
  ])
    expect(serviceControlState({ ...state, ...patch } as SoftwareState, service, now).start).toBe(
      false,
    );
  expect(serviceControlState(state, { ...service, protected: true }, now).start).toBe(false);
  expect(serviceControlState(state, { ...service, canStart: false }, now).start).toBe(false);
  expect(
    serviceControlState(state, { ...service, definitionSha256: "c".repeat(64) }, now).start,
  ).toBe(false);
  expect(serviceControlState(state, service, now + 90001).start).toBe(false);
  expect(serviceResultLabel("os-permission-denied")).toContain("operating-system permission");
  expect(serviceResultLabel("dependents-running")).toContain("have not been stopped");
});
