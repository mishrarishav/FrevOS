import { IdentityIssuerSchema, UserIdSchema, WorkspaceIdSchema } from "@frevos/contracts";
import { z } from "zod";
import { decodeEncryptionKey, sha256 } from "./crypto.js";
import { type PaperclipBinding, paperclipBindings } from "./paperclip-bridge.js";

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    FREVOS_PUBLIC_ORIGIN: z.url(),
    FREVOS_ALLOW_INTERNAL_HTTP: z.enum(["true", "false"]).default("false"),
    FREVOS_AUTH_MODE: z.enum(["local", "oidc"]).default("oidc"),
    FREVOS_OIDC_ISSUER: z
      .url()
      .refine((value) => value.startsWith("https://"))
      .optional(),
    FREVOS_OIDC_CLIENT_ID: z.string().min(1).max(255).optional(),
    FREVOS_OIDC_CLIENT_SECRET: z.string().min(1).max(4096).optional(),
    FREVOS_OIDC_TRANSACTION_KEY: z.string().min(43).max(64).optional(),
    FREVOS_TRACKGRN_AGENT_TOKEN: z.string().min(32).max(256).optional(),
    FREVOS_SERVIX_DEPLOYMENT_ROOT: z.string().min(1).max(500).optional(),
    DEVSETU_GIT_EXECUTABLE: z.string().min(1).max(500).default("git"),
    DEVSETU_PAPERCLIP_BINDINGS: z.string().max(100000).optional(),
    DEVSETU_REVIEWS_ROOT: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) =>
        Array.from(value).every(
          (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      )
      .optional(),
    DEVSETU_REVIEWS_ADMINISTRATORS: z.string().max(32768).optional(),
    DEVSETU_REVIEWS_WORKSPACES: z.string().max(32768).optional(),
    DEVSETU_REVIEWS_MONITORING_ENABLED: z.enum(["true", "false"]).default("true"),
    DEVSETU_SERVER_MONITORING_CONFIG: z.string().min(1).max(500).optional(),

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
  readonly trackGrnAgentTokenHash?: Buffer;
  readonly servixRoot?: string;
  readonly componentGitExecutable: string;
  readonly paperclipBindings: PaperclipBinding[];
  readonly reviewsRoot?: string;
  readonly reviewAdministrators: Record<string, string[]>;
  readonly reviewWorkspaceIds: string[];
  readonly reviewMonitoringEnabled: boolean;
  readonly serverMonitoringConfig?: string;
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
  const octets = publicOrigin.hostname.split(".").map(Number);
  const privateIpv4 =
    /^\d+\.\d+\.\d+\.\d+$/.test(publicOrigin.hostname) &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    (octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
  if (
    publicOrigin.protocol !== "https:" &&
    !(
      publicOrigin.protocol === "http:" &&
      parsed.FREVOS_ALLOW_INTERNAL_HTTP === "true" &&
      parsed.FREVOS_AUTH_MODE === "local" &&
      privateIpv4 &&
      (parsed.HOST === "127.0.0.1" || parsed.HOST === "::1")
    )
  ) {
    throw new Error("HTTP requires explicit internal local-auth configuration");
  }
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
    reviewAdministrators: z
      .record(WorkspaceIdSchema, z.array(UserIdSchema).max(100))
      .parse(
        parsed.DEVSETU_REVIEWS_ADMINISTRATORS
          ? JSON.parse(parsed.DEVSETU_REVIEWS_ADMINISTRATORS)
          : {},
      ),
    ...(parsed.DEVSETU_REVIEWS_ROOT ? { reviewsRoot: parsed.DEVSETU_REVIEWS_ROOT } : {}),
    reviewWorkspaceIds: z
      .array(WorkspaceIdSchema)
      .max(1000)
      .refine(
        (values) => new Set(values).size === values.length,
        "Duplicate review worker workspace enrollment",
      )
      .parse(
        parsed.DEVSETU_REVIEWS_WORKSPACES ? JSON.parse(parsed.DEVSETU_REVIEWS_WORKSPACES) : [],
      ),
    reviewMonitoringEnabled: parsed.DEVSETU_REVIEWS_MONITORING_ENABLED === "true",
    ...(parsed.DEVSETU_SERVER_MONITORING_CONFIG
      ? { serverMonitoringConfig: parsed.DEVSETU_SERVER_MONITORING_CONFIG }
      : {}),
    paperclipBindings: paperclipBindings(parsed.DEVSETU_PAPERCLIP_BINDINGS),
    componentGitExecutable: parsed.DEVSETU_GIT_EXECUTABLE,
    databaseUrl: parsed.DATABASE_URL,
    publicOrigin: publicOrigin.origin,
    basePath: parsed.FREVOS_BASE_PATH,
    host: parsed.HOST,
    port: parsed.PORT,
    ...(parsed.FREVOS_SERVIX_DEPLOYMENT_ROOT === undefined
      ? {}
      : {
          servixRoot: parsed.FREVOS_SERVIX_DEPLOYMENT_ROOT,
        }),
    ...(parsed.FREVOS_TRACKGRN_AGENT_TOKEN === undefined
      ? {}
      : { trackGrnAgentTokenHash: sha256(parsed.FREVOS_TRACKGRN_AGENT_TOKEN) }),
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
