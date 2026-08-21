import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  decodeEncryptionKey,
  hashesMatch,
  OidcTransactionCodec,
  randomIdentifier,
  randomOpaqueToken,
  sha256,
} from "../src/crypto.js";

const transaction = {
  state: "s".repeat(32),
  nonce: "n".repeat(32),
  codeVerifier: "v".repeat(43),
  createdAt: "2026-08-10T10:00:00.000Z",
};

describe("opaque token and OIDC transaction protection", () => {
  it("generates opaque values and compares only their digests", () => {
    const first = randomOpaqueToken("fst");
    const second = randomOpaqueToken("fst");

    expect(first).toMatch(/^fst_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(randomIdentifier("usr")).toMatch(/^usr_[a-f0-9]{48}$/);
    expect(sha256(first)).toHaveLength(32);
    expect(hashesMatch(first, sha256(first))).toBe(true);
    expect(hashesMatch(first, sha256(second))).toBe(false);
    expect(hashesMatch(first, Buffer.alloc(31))).toBe(false);
  });

  it("authenticates encrypted transactions and rejects tampering or expiry", () => {
    const codec = new OidcTransactionCodec(randomBytes(32));
    const sealed = codec.seal(transaction);
    const tamperedParts = sealed.split(".");
    const tag = tamperedParts[3] ?? "";
    tamperedParts[3] = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;

    expect(codec.open(sealed, new Date("2026-08-10T10:05:00.000Z"))).toEqual(transaction);
    expect(() => codec.open(tamperedParts.join("."), new Date("2026-08-10T10:05:00.000Z"))).toThrow(
      "OIDC transaction cookie could not be authenticated",
    );
    expect(() => codec.open("not-a-cookie")).toThrow(
      "OIDC transaction cookie has an invalid format",
    );
    expect(() => codec.open("v1.eA.eA.eA")).toThrow(
      "OIDC transaction cookie has an invalid format",
    );
    expect(() => codec.open(sealed, new Date("2026-08-10T10:11:00.000Z"))).toThrow(
      "OIDC transaction cookie has expired",
    );
    expect(() => codec.open(sealed, new Date("2026-08-10T09:59:59.000Z"))).toThrow(
      "OIDC transaction cookie has expired",
    );
  });

  it("rejects invalid encryption keys and malformed transaction data", () => {
    expect(() => new OidcTransactionCodec(randomBytes(31))).toThrow("exactly 32 bytes");
    expect(() => decodeEncryptionKey(Buffer.alloc(31).toString("base64url"))).toThrow(
      "exactly 32 bytes",
    );
    expect(() =>
      new OidcTransactionCodec(randomBytes(32)).seal({ ...transaction, state: "x" }),
    ).toThrow();
  });
});

describe("control-plane configuration", () => {
  const validEnvironment: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgresql://runtime.invalid/frevos",
    FREVOS_PUBLIC_ORIGIN: "https://control.frevos.example",
    FREVOS_OIDC_ISSUER: "https://identity.example/tenant",
    FREVOS_OIDC_CLIENT_ID: "frevos-client",
    FREVOS_OIDC_CLIENT_SECRET: "synthetic-not-a-secret",
    FREVOS_OIDC_TRANSACTION_KEY: randomBytes(32).toString("base64url"),
  };

  it("parses an explicit HTTPS runtime boundary with safe defaults", () => {
    const config = loadConfig(validEnvironment);

    expect(config.publicOrigin).toBe("https://control.frevos.example");
    expect(config.authMode).toBe("oidc");
    if (config.authMode !== "oidc") {
      throw new Error("Expected OIDC configuration");
    }
    expect(config.oidcIssuer.href).toBe("https://identity.example/tenant");
    expect(config.oidcTransactionKey).toHaveLength(32);
    expect(config.basePath).toBe("");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3001);
  });

  it("accepts one normalized application base-path segment", () => {
    expect(loadConfig({ ...validEnvironment, FREVOS_BASE_PATH: "/frevos" }).basePath).toBe(
      "/frevos",
    );
  });

  it("accepts local authentication without any external identity-provider secret", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://runtime.invalid/frevos",
      FREVOS_PUBLIC_ORIGIN: "https://control.frevos.example",
      FREVOS_AUTH_MODE: "local",
    });
    expect(config).toMatchObject({ authMode: "local", basePath: "" });
    expect("oidcClientSecret" in config).toBe(false);
  });

  it("rejects non-HTTPS and path-bearing public origins", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, FREVOS_PUBLIC_ORIGIN: "http://control.invalid" }),
    ).toThrow();
    expect(() =>
      loadConfig({ ...validEnvironment, FREVOS_PUBLIC_ORIGIN: "https://control.invalid/path" }),
    ).toThrow("must contain only an HTTPS origin");
    expect(() =>
      loadConfig({
        ...validEnvironment,
        FREVOS_PUBLIC_ORIGIN: "https://user@control.invalid",
      }),
    ).toThrow("must contain only an HTTPS origin");
    expect(() =>
      loadConfig({ ...validEnvironment, FREVOS_OIDC_ISSUER: "http://identity.invalid" }),
    ).toThrow();
    expect(() =>
      loadConfig({
        ...validEnvironment,
        FREVOS_OIDC_ISSUER: "https://identity.invalid?tenant=unsafe",
      }),
    ).toThrow();
    expect(() => loadConfig({ ...validEnvironment, FREVOS_BASE_PATH: "frevos" })).toThrow();
    expect(() => loadConfig({ ...validEnvironment, FREVOS_BASE_PATH: "/frevos/child" })).toThrow();
  });
});
