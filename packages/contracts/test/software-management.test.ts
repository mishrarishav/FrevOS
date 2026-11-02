import { describe, expect, it } from "vitest";
import {
  SoftwareCatalogInputSchema,
  SoftwareInventorySchema,
  SoftwareObservationSchema,
  SoftwareRequestSchema,
} from "../src/software-management.js";

const asset = { url: "https://example.org/app.msi", sha256: "a".repeat(64), bytes: 100 };
const pkg = {
  id: "sample",
  name: "Sample",
  version: "1",
  publisher: "Fixture",
  enabled: true,
  recipe: "windows-msi",
  platform: "win32",
  asset,
};
describe("software management wire contracts", () => {
  it("accepts reviewed catalogue metadata and rejects commands, mutable or credential-bearing artifact references", () => {
    const input = { version: 1, expectedRevision: 0, packages: [pkg] };
    expect(SoftwareCatalogInputSchema.safeParse(input).success).toBe(true);
    for (const changed of [
      { ...pkg, command: "powershell" },
      { ...pkg, recipe: "shell" },
      { ...pkg, asset: { ...asset, url: "http://example.org/a.msi" } },
      { ...pkg, asset: { ...asset, url: "https://user:password@example.org/a" } },
      { ...pkg, asset: { ...asset, url: "https://example.org/a?key=x" } },
      { ...pkg, asset: { ...asset, sha256: "bad" } },
    ])
      expect(SoftwareCatalogInputSchema.safeParse({ ...input, packages: [changed] }).success).toBe(
        false,
      );
    expect(SoftwareCatalogInputSchema.safeParse({ ...input, packages: [pkg, pkg] }).success).toBe(
      false,
    );
  });
  it("does not accept caller paths or arbitrary operation names", () => {
    const r = {
      version: 1,
      requestId: "sw_" + "b".repeat(32),
      deviceId: "fc_" + "c".repeat(32),
      operation: "inventory",
    };
    expect(SoftwareRequestSchema.safeParse(r).success).toBe(true);
    expect(SoftwareRequestSchema.safeParse({ ...r, path: "C:\\Windows" }).success).toBe(false);
    expect(
      SoftwareRequestSchema.safeParse({ ...r, operation: "exec", command: "whoami" }).success,
    ).toBe(false);
    expect(
      SoftwareRequestSchema.safeParse({
        ...r,
        operation: "install",
        packageId: "sample",
        packageDigest: "d".repeat(64),
      }).success,
    ).toBe(true);
  });
  it("reports partial and unavailable scope explicitly and rejects unsupported desktop capabilities", () => {
    const observation = {
      version: 1,
      platform: "win32",
      inventoryConsent: true,
      installConsent: false,
      programSha256: "a".repeat(64),
      services: [],
    };
    expect(SoftwareObservationSchema.safeParse(observation).success).toBe(true);
    expect(
      SoftwareObservationSchema.safeParse({ ...observation, platform: "android" }).success,
    ).toBe(false);
    const inventory = {
      version: 1,
      platform: "win32",
      scope: "windows-machine-and-connector-user",
      observedAt: new Date().toISOString(),
      status: "partial",
      truncated: false,
      items: [],
    };
    expect(SoftwareInventorySchema.safeParse(inventory).success).toBe(true);
    expect(
      SoftwareInventorySchema.safeParse({
        ...inventory,
        status: "unavailable",
        items: [{ id: "b".repeat(64), name: "Unknown", source: "registry" }],
      }).success,
    ).toBe(false);
  });
});
