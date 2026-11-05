import type { SoftwareState } from "@frevos/contracts";
import { expect, it } from "vitest";
import { softwareInventoryStatus } from "../src/software-inventory-status.js";

it("distinguishes offline, outdated, consent, queued, unavailable and successful empty inventory", () => {
  const state = {
    device: { online: true, capability: null, inventory: null, scan: null },
    jobs: [],
  } as unknown as SoftwareState;
  expect(softwareInventoryStatus(null).title).toContain("Loading");
  expect(softwareInventoryStatus(state).title).toBe("Connector update required");
  state.device.online = false;
  expect(softwareInventoryStatus(state).title).toBe("Computer offline");
  state.device.online = true;
  state.device.capability = {
    inventoryConsent: false,
    installConsent: false,
    services: [],
    version: 1,
    platform: "win32",
    programSha256: "a".repeat(64),
  };
  expect(softwareInventoryStatus(state).title).toBe("Inventory sharing is off");
  state.device.capability.inventoryConsent = true;
  expect(softwareInventoryStatus(state).description).toContain("automatically");
  state.jobs = [{ status: "approved" }] as SoftwareState["jobs"];
  expect(softwareInventoryStatus(state).pending).toBe(true);
  expect(softwareInventoryStatus(state).title).toContain("queued");
  state.jobs = [];
  state.device.scan = {
    status: "unavailable",
    observedAt: new Date().toISOString(),
    truncated: false,
  };
  expect(softwareInventoryStatus(state).title).toBe("Inventory scan unavailable");
  state.device.scan = null;
  state.device.inventory = {
    version: 1,
    observedAt: new Date().toISOString(),
    platform: "win32",
    status: "ready",
    scope: "windows-machine-and-connector-user",
    truncated: false,
    items: [],
  };
  expect(softwareInventoryStatus(state).title).toBe("No registered programs reported");
});
