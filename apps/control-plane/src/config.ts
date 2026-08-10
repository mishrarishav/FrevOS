import { z } from "zod";
import { IdentityIssuerSchema } from "@frevos/contracts";
import { decodeEncryptionKey } from "./crypto.js";

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    FREVOS_PUBLIC_ORIGIN: z.url().refine((value) => value.startsWith("https://")),
    FREVOS_OIDC_ISSUER: z.url().refine((value) => value.startsWith("https://")),
    FREVOS_OIDC_CLIENT_ID: z.string().min(1).max(255),
    FREVOS_OIDC_CLIENT_SECRET: z.string().min(1).max(4096),
    FREVOS_OIDC_TRANSACTION_KEY: z.string().min(43).max(64),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .passthrough();

export interface ControlPlaneConfig {
  readonly databaseUrl: string;
  readonly publicOrigin: string;
  readonly oidcIssuer: URL;
  readonly oidcClientId: string;
  readonly oidcClientSecret: string;
  readonly oidcTransactionKey: Buffer;
  readonly host: string;
  readonly port: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv): ControlPlaneConfig {
  const parsed = EnvironmentSchema.parse(environment);
  const publicOrigin = new URL(parsed.FREVOS_PUBLIC_ORIGIN);
  if (
    publicOrigin.username !== "" ||
    publicOrigin.password !== "" ||
    publicOrigin.pathname !== "/" ||
    publicOrigin.search !== "" ||
    publicOrigin.hash !== ""
  ) {
    throw new Error("FREVOS_PUBLIC_ORIGIN must contain only an HTTPS origin");
  }

  return {
    databaseUrl: parsed.DATABASE_URL,
    publicOrigin: publicOrigin.origin,
    oidcIssuer: new URL(IdentityIssuerSchema.parse(parsed.FREVOS_OIDC_ISSUER)),
    oidcClientId: parsed.FREVOS_OIDC_CLIENT_ID,
    oidcClientSecret: parsed.FREVOS_OIDC_CLIENT_SECRET,
    oidcTransactionKey: decodeEncryptionKey(parsed.FREVOS_OIDC_TRANSACTION_KEY),
    host: parsed.HOST,
    port: parsed.PORT,
  };
}
