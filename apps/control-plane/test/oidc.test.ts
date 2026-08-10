import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizationCodeGrant: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
  discovery: vi.fn(),
  randomNonce: vi.fn(),
  randomPKCECodeVerifier: vi.fn(),
  randomState: vi.fn(),
}));

vi.mock("openid-client", () => mocks);

import { OpenIdClientProvider, createOidcTransaction } from "../src/oidc.js";

const transaction = {
  state: "state-value-with-at-least-thirty-two-characters",
  nonce: "nonce-value-with-at-least-thirty-two-characters",
  codeVerifier: "code-verifier-with-at-least-forty-three-characters-123",
  createdAt: "2026-08-10T10:00:00.000Z",
};

describe("openid-client provider adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.discovery.mockResolvedValue({ discovered: true });
    mocks.calculatePKCECodeChallenge.mockResolvedValue("challenge");
    mocks.buildAuthorizationUrl.mockReturnValue(new URL("https://identity.example/authorize"));
  });

  it("discovers a provider and constructs PKCE, state, and nonce authorization", async () => {
    const provider = await OpenIdClientProvider.discover({
      issuer: new URL("https://identity.example"),
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://control.example/auth/callback",
    });

    expect(await provider.createAuthorizationUrl(transaction)).toEqual(
      new URL("https://identity.example/authorize"),
    );
    expect(mocks.discovery).toHaveBeenCalledWith(
      new URL("https://identity.example"),
      "client-id",
      "client-secret",
    );
    expect(mocks.buildAuthorizationUrl).toHaveBeenCalledWith(
      { discovered: true },
      expect.objectContaining({
        code_challenge: "challenge",
        code_challenge_method: "S256",
        nonce: transaction.nonce,
        state: transaction.state,
      }),
    );
  });

  it("validates callback state, nonce, PKCE, and required subject claims", async () => {
    mocks.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ iss: "https://identity.example", sub: "subject-1", name: "Rishav" }),
    });
    const provider = await OpenIdClientProvider.discover({
      issuer: new URL("https://identity.example"),
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://control.example/auth/callback",
    });
    const callback = new URL("https://control.example/auth/callback?code=synthetic");

    await expect(provider.completeAuthorization(callback, transaction)).resolves.toEqual({
      issuer: "https://identity.example",
      subject: "subject-1",
      displayName: "Rishav",
    });
    expect(mocks.authorizationCodeGrant).toHaveBeenCalledWith({ discovered: true }, callback, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });

    mocks.authorizationCodeGrant.mockResolvedValue({ claims: () => undefined });
    await expect(provider.completeAuthorization(callback, transaction)).rejects.toThrow(
      "did not contain a subject",
    );
    mocks.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ iss: "https://identity.example", sub: "subject-2" }),
    });
    await expect(provider.completeAuthorization(callback, transaction)).resolves.toEqual({
      issuer: "https://identity.example",
      subject: "subject-2",
    });
  });

  it("creates an unpredictable transaction using provider helpers", () => {
    mocks.randomState.mockReturnValue("state");
    mocks.randomNonce.mockReturnValue("nonce");
    mocks.randomPKCECodeVerifier.mockReturnValue("verifier");

    expect(createOidcTransaction(new Date("2026-08-10T10:00:00.000Z"))).toEqual({
      state: "state",
      nonce: "nonce",
      codeVerifier: "verifier",
      createdAt: "2026-08-10T10:00:00.000Z",
    });
  });
});
