import { describe, expect, it } from "vitest";
import {
  ServicePrivateListenSchema,
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
  it("accepts only canonical private interface/client addresses with a bounded explicit client list", () => {
    const listen = { address: "10.20.30.40", allowedClients: ["172.16.1.2", "192.168.1.5"] };
    expect(ServicePrivateListenSchema.parse(listen)).toEqual(listen);
    for (const address of [
      "0.0.0.0",
      "127.0.0.1",
      "8.8.8.8",
      "169.254.1.2",
      "100.64.1.2",
      "10.01.1.2",
      "10.256.1.2",
      "::1",
      "example.org",
      "10.1.2.3:5080",
    ]) {
      expect(ServicePrivateListenSchema.safeParse({ ...listen, address }).success).toBe(false);
      expect(
        ServicePrivateListenSchema.safeParse({ ...listen, allowedClients: [address] }).success,
      ).toBe(false);
    }
    for (const allowedClients of [
      [],
      ["10.1.1.1", "10.1.1.1"],
      Array.from({ length: 17 }, (_, n) => `10.1.1.${n + 1}`),
    ])
      expect(ServicePrivateListenSchema.safeParse({ ...listen, allowedClients }).success).toBe(
        false,
      );
    expect(ServicePrivateListenSchema.safeParse({ ...listen, command: "listen" }).success).toBe(
      false,
    );
  });
  it("keeps legacy observations unchanged and validates negotiated interface reports", () => {
    const legacy = {
      version: 1,
      platform: "win32",
      inventoryConsent: true,
      installConsent: true,
      programSha256: "a".repeat(64),
      services: [],
    };
    expect(SoftwareObservationSchema.parse(legacy)).toEqual(legacy);
    const network = {
      version: 1,
      addresses: [{ name: "Private adapter", address: "10.20.30.40" }],
    };
    expect(SoftwareObservationSchema.safeParse({ ...legacy, network }).success).toBe(true);
    expect(
      SoftwareObservationSchema.safeParse({
        ...legacy,
        network: { ...network, addresses: [...network.addresses, ...network.addresses] },
      }).success,
    ).toBe(false);
    expect(
      SoftwareObservationSchema.safeParse({ ...legacy, network: { ...network, version: 2 } })
        .success,
    ).toBe(false);
    expect(
      SoftwareObservationSchema.safeParse({
        ...legacy,
        network: { ...network, addresses: [{ name: "Public", address: "8.8.8.8" }] },
      }).success,
    ).toBe(false);
  });
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
  it("reports partial/unavailable scope and admits the bounded Android software observation", () => {
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
    ).toBe(true);
    expect(
      SoftwareObservationSchema.safeParse({ ...observation, platform: "darwin" }).success,
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
