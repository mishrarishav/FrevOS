import { IdentityIssuerSchema } from "@frevos/contracts";
import { z } from "zod";
import { decodeEncryptionKey } from "./crypto.js";

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    FREVOS_PUBLIC_ORIGIN: z.url().refine((value) => value.startsWith("https://")),
    FREVOS_AUTH_MODE: z.enum(["local", "oidc"]).default("oidc"),
    FREVOS_OIDC_ISSUER: z
      .url()
      .refine((value) => value.startsWith("https://"))
      .optional(),
    FREVOS_OIDC_CLIENT_ID: z.string().min(1).max(255).optional(),
    FREVOS_OIDC_CLIENT_SECRET: z.string().min(1).max(4096).optional(),
    FREVOS_OIDC_TRANSACTION_KEY: z.string().min(43).max(64).optional(),
    FREVOS_BASE_PATH: z
      .string()
      .regex(/^$|^\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
      .default(""),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .passthrough();

interface BaseControlPlaneConfig {
  readonly databaseUrl: string;
  readonly publicOrigin: string;
  readonly basePath: string;
  readonly host: string;
  readonly port: number;
}

export type ControlPlaneConfig = BaseControlPlaneConfig &
  (
    | { readonly authMode: "local" }
    | {
        readonly authMode: "oidc";
        readonly oidcIssuer: URL;
        readonly oidcClientId: string;
        readonly oidcClientSecret: string;
        readonly oidcTransactionKey: Buffer;
      }
  );

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

  const base = {
    databaseUrl: parsed.DATABASE_URL,
    publicOrigin: publicOrigin.origin,
    basePath: parsed.FREVOS_BASE_PATH,
    host: parsed.HOST,
    port: parsed.PORT,
  };
  if (parsed.FREVOS_AUTH_MODE === "local") {
    return { ...base, authMode: "local" };
  }
  if (
    parsed.FREVOS_OIDC_ISSUER === undefined ||
    parsed.FREVOS_OIDC_CLIENT_ID === undefined ||
    parsed.FREVOS_OIDC_CLIENT_SECRET === undefined ||
    parsed.FREVOS_OIDC_TRANSACTION_KEY === undefined
  ) {
    throw new Error("OIDC configuration is required when FREVOS_AUTH_MODE=oidc");
  }
  return {
    ...base,
    authMode: "oidc",
    oidcIssuer: new URL(IdentityIssuerSchema.parse(parsed.FREVOS_OIDC_ISSUER)),
    oidcClientId: parsed.FREVOS_OIDC_CLIENT_ID,
    oidcClientSecret: parsed.FREVOS_OIDC_CLIENT_SECRET,
    oidcTransactionKey: decodeEncryptionKey(parsed.FREVOS_OIDC_TRANSACTION_KEY),
  };
}
