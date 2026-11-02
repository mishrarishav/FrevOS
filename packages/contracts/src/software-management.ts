import { z } from "zod";
import { ConnectorIdSchema } from "./developer-connectors.js";
import { UserIdSchema, WorkspaceIdSchema } from "./identifiers.js";

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Name = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((v) => ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127));
export const SoftwarePackageIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
export const SoftwareRequestIdSchema = z.string().regex(/^sw_[a-f0-9]{32}$/);
const Asset = z
  .object({
    url: z.url().refine((value) => {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
    }),
    sha256: Digest,
    bytes: z.number().int().min(1).max(262144000),
    signerThumbprint: z
      .string()
      .regex(/^[A-Fa-f0-9]{40,64}$/)
      .optional(),
  })
  .strict();
const PackageBase = {
  id: SoftwarePackageIdSchema,
  name: Name,
  version: Name,
  publisher: Name,
  enabled: z.boolean(),
};
export const SoftwarePackageSchema = z.discriminatedUnion("recipe", [
  z
    .object({
      ...PackageBase,
      recipe: z.literal("windows-msi"),
      platform: z.literal("win32"),
      asset: Asset,
    })
    .strict(),
  z
    .object({
      ...PackageBase,
      recipe: z.literal("linux-deb"),
      platform: z.literal("linux"),
      asset: Asset,
    })
    .strict(),
  z
    .object({
      ...PackageBase,
      recipe: z.literal("linux-rpm"),
      platform: z.literal("linux"),
      asset: Asset,
    })
    .strict(),
  z
    .object({
      ...PackageBase,
      recipe: z.literal("demo-api"),
      platform: z.enum(["win32", "linux"]),
      programSha256: Digest,
    })
    .strict(),
]);
export type SoftwarePackage = z.infer<typeof SoftwarePackageSchema>;
export const SoftwareCatalogInputSchema = z
  .object({
    version: z.literal(1),
    expectedRevision: z.number().int().nonnegative(),
    packages: z
      .array(SoftwarePackageSchema)
      .max(128)
      .refine((rows) => new Set(rows.map((p) => p.id)).size === rows.length),
  })
  .strict();
export const SoftwareCatalogSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    revision: z.number().int().nonnegative(),
    packages: SoftwareCatalogInputSchema.shape.packages,
  })
  .strict();
export const SoftwareInventorySchema = z
  .object({
    version: z.literal(1),
    observedAt: z.iso.datetime(),
    platform: z.enum(["win32", "linux"]),
    status: z.enum(["ready", "partial", "unavailable"]),
    scope: z.enum(["windows-machine-and-connector-user", "linux-package-manager"]),
    truncated: z.boolean(),
    items: z
      .array(
        z
          .object({
            id: Digest,
            name: Name,
            version: Name.optional(),
            publisher: Name.optional(),
            source: z.enum(["registry", "appx", "dpkg", "rpm"]),
            installedOn: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict()
  .refine((r) => r.status !== "unavailable" || r.items.length === 0);
export type SoftwareInventory = z.infer<typeof SoftwareInventorySchema>;
const RequestBase = {
  version: z.literal(1),
  requestId: SoftwareRequestIdSchema,
  deviceId: ConnectorIdSchema,
};
export const SoftwareRequestSchema = z.discriminatedUnion("operation", [
  z.object({ ...RequestBase, operation: z.literal("inventory") }).strict(),
  z
    .object({
      ...RequestBase,
      operation: z.literal("install"),
      packageId: SoftwarePackageIdSchema,
      packageDigest: Digest,
      port: z.number().int().min(1024).max(65535).optional(),
      lifetimeSeconds: z.number().int().min(60).max(1800).optional(),
    })
    .strict(),
  z
    .object({
      ...RequestBase,
      operation: z.literal("stop-demo"),
      serviceId: SoftwarePackageIdSchema,
    })
    .strict(),
]);
export type SoftwareRequest = z.infer<typeof SoftwareRequestSchema>;
export const SoftwareDecisionSchema = z
  .object({
    requestId: SoftwareRequestIdSchema,
    digest: Digest,
    decision: z.enum(["approve", "reject"]),
  })
  .strict();
export const SoftwareApprovalSchema = z
  .object({
    version: z.literal(1),
    action: z.literal("software.install.v1"),
    workspaceId: WorkspaceIdSchema,
    actor: UserIdSchema,
    target: ConnectorIdSchema,
    correlationId: SoftwareRequestIdSchema,
    artifactSha256: Digest,
    digest: Digest,
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    consumedAt: z.iso.datetime().optional(),
  })
  .strict();
export const SoftwareJobSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    actor: UserIdSchema,
    request: SoftwareRequestSchema,
    digest: Digest,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: z.enum([
      "pending-approval",
      "approved",
      "working",
      "succeeded",
      "failed",
      "recovery-required",
      "rejected",
      "expired",
    ]),
    package: SoftwarePackageSchema.optional(),
    approval: SoftwareApprovalSchema.optional(),
    restartRequired: z.boolean().optional(),
    result: z
      .enum([
        "installed",
        "inventory-updated",
        "demo-started",
        "demo-stopped",
        "declined",
        "failed",
        "interrupted",
      ])
      .optional(),
  })
  .strict();
export type SoftwareJob = z.infer<typeof SoftwareJobSchema>;
export function softwareJobBinding(
  job: Pick<
    SoftwareJob,
    "workspaceId" | "actor" | "request" | "package" | "createdAt" | "expiresAt"
  >,
) {
  return JSON.stringify([
    1,
    "software.job.v1",
    job.workspaceId,
    job.actor,
    job.request,
    job.package ?? null,
    job.createdAt,
    job.expiresAt,
  ]);
}
export const SoftwareServiceSchema = z
  .object({
    id: SoftwarePackageIdSchema,
    jobId: SoftwareRequestIdSchema,
    digest: Digest,
    port: z.number().int().min(1024).max(65535),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const SoftwareObservationSchema = z
  .object({
    version: z.literal(1),
    platform: z.enum(["win32", "linux"]),
    inventoryConsent: z.boolean(),
    installConsent: z.boolean(),
    operation: z
      .object({
        requestId: SoftwareRequestIdSchema,
        stage: z.enum(["scanning", "downloading", "verifying", "waiting-for-os", "starting-demo"]),
        startedAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
    programSha256: Digest,
    services: z.array(SoftwareServiceSchema).max(1),
  })
  .strict();
export const SoftwareCompleteSchema = z
  .object({
    requestId: SoftwareRequestIdSchema,
    digest: Digest,
    result: SoftwareJobSchema.shape.result.unwrap(),
    restartRequired: z.boolean().optional(),
    inventory: SoftwareInventorySchema.optional(),
  })
  .strict();
export const SoftwareStateSchema = z
  .object({
    workspaceId: WorkspaceIdSchema,
    administrator: z.boolean(),
    demoProgramSha256: Digest.nullable(),
    packageDigests: z.record(SoftwarePackageIdSchema, Digest),
    catalog: SoftwareCatalogSchema,
    device: z
      .object({
        id: ConnectorIdSchema,
        name: Name,
        online: z.boolean(),
        capability: SoftwareObservationSchema.nullable(),
        scan: z
          .object({
            observedAt: z.iso.datetime(),
            status: SoftwareInventorySchema.shape.status,
            truncated: z.boolean(),
          })
          .strict()
          .nullable(),
        inventoryObservedAt: z.iso.datetime().nullable(),
        inventory: SoftwareInventorySchema.nullable(),
      })
      .strict(),
    jobs: z.array(SoftwareJobSchema).max(100),
  })
  .strict();
export type SoftwareState = z.infer<typeof SoftwareStateSchema>;
