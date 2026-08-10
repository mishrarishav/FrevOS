import * as oidc from "openid-client";
import type { OidcTransaction } from "./crypto.js";

export interface AuthenticatedIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly displayName?: string;
}

export interface OidcProvider {
  createAuthorizationUrl(transaction: OidcTransaction): Promise<URL>;
  completeAuthorization(
    callbackUrl: URL,
    transaction: OidcTransaction,
  ): Promise<AuthenticatedIdentity>;
}

export class OpenIdClientProvider implements OidcProvider {
  readonly #configuration: oidc.Configuration;
  readonly #redirectUri: string;

  private constructor(configuration: oidc.Configuration, redirectUri: string) {
    this.#configuration = configuration;
    this.#redirectUri = redirectUri;
  }

  static async discover(input: {
    issuer: URL;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<OpenIdClientProvider> {
    const configuration = await oidc.discovery(input.issuer, input.clientId, input.clientSecret);
    return new OpenIdClientProvider(configuration, input.redirectUri);
  }

  async createAuthorizationUrl(transaction: OidcTransaction): Promise<URL> {
    return oidc.buildAuthorizationUrl(this.#configuration, {
      redirect_uri: this.#redirectUri,
      scope: "openid profile",
      response_type: "code",
      code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
      code_challenge_method: "S256",
      state: transaction.state,
      nonce: transaction.nonce,
    });
  }

  async completeAuthorization(
    callbackUrl: URL,
    transaction: OidcTransaction,
  ): Promise<AuthenticatedIdentity> {
    const tokens = await oidc.authorizationCodeGrant(this.#configuration, callbackUrl, {
      pkceCodeVerifier: transaction.codeVerifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (claims === undefined || typeof claims.sub !== "string") {
      throw new Error("OIDC ID token did not contain a subject");
    }

    const displayNameClaim: unknown = Reflect.get(claims, "name");
    const displayName = typeof displayNameClaim === "string" ? displayNameClaim : undefined;
    return {
      issuer: claims.iss,
      subject: claims.sub,
      ...(displayName === undefined ? {} : { displayName }),
    };
  }
}

export function createOidcTransaction(now = new Date()): OidcTransaction {
  return {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    createdAt: now.toISOString(),
  };
}
