import { z } from "zod";

export const SERVIX_REPOSITORY = {
  id: "gitrepo_6cb7e163f807493fa37963196c49fbac",
  origin: "//10.9.69.20/e$/FrevOS/git/servix.git",
  remoteName: "frevos",
  branch: "frevos-dev",
} as const;

export const DeploymentProfileIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
// These are literal paths, never globs, commands, or URL pathnames.
export const PreservedPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .transform((v) => v.replaceAll("\\", "/").replace(/\/$/, ""))
  .refine((v) =>
    v
      .split("/")
      .every(
        (part) =>
          /^[A-Za-z0-9_. -]+$/.test(part) &&
          part !== "." &&
          part !== ".." &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      ),
  );
export const CheckoutPathSchema = z
  .string()
  .trim()
  .max(240)
  .regex(/^[A-Za-z]:\\[^<>:"|?*]+$/)
  .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
  .refine((v) =>
    v
      .split("\\")
      .slice(1)
      .every((p) => p.length > 0 && p !== "." && p !== ".." && !/[. ]$/.test(p)),
  );
export const RepositoryOriginSchema = z
  .string()
  .max(240)
  .refine((value) => {
    if (/^devsetu:\/\/repositories\/gitrepo_[a-f0-9]{32}$/.test(value)) return true;
    if (value === SERVIX_REPOSITORY.origin) return true;
    if (/^git@[A-Za-z0-9.-]+:[A-Za-z0-9_./-]+\.git$/.test(value)) return !value.includes("..");
    return (
      /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[A-Za-z0-9_./%-]+$/.test(value) &&
      z.url().safeParse(value).success
    );
  }, "Use the approved server20 Git repository or an HTTPS/SSH Git URL without credentials");
export const DestinationSettingsSchema = z
  .object({
    host: z
      .string()
      .max(253)
      .regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/),
    root: CheckoutPathSchema,
    siteUrl: z
      .string()
      .max(240)
      .refine(
        (v) =>
          /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/$/.test(v) && z.url().safeParse(v).success,
      ),
    credentialProfile: z.enum(["server21-development", "not-connected"]),
  })
  .strict();
export const DeploymentSettingsInputSchema = z
  .object({
    version: z.literal(1),
    profileId: DeploymentProfileIdSchema,
    expectedRevision: z.number().int().min(0),
    displayName: z.string().trim().min(1).max(80),
    archived: z.boolean().optional(),
    repositoryOrigin: RepositoryOriginSchema,
    sourceFolder: CheckoutPathSchema,
    destination: DestinationSettingsSchema,
    preservedPaths: z
      .array(PreservedPathSchema)
      .max(64)
      .refine(
        (paths) => new Set(paths.map((p) => p.toLowerCase())).size === paths.length,
        "Duplicate preserved path",
      ),
  })
  .strict();
export const DeploymentSettingsSchema = DeploymentSettingsInputSchema.omit({
  expectedRevision: true,
})
  .extend({
    revision: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.string(),
    runner: z.enum([
      "servix-development",
      "devsetu-platform",
      "configured-components",
      "not-connected",
    ]),
  })
  .strict();
export type DeploymentSettings = z.infer<typeof DeploymentSettingsSchema>;
export type DeploymentSettingsInput = z.infer<typeof DeploymentSettingsInputSchema>;
export const DeploymentSettingsListSchema = z.array(DeploymentSettingsSchema).max(100);
export const ConnectorProbeSchema = z
  .object({
    version: z.literal(1),
    profileId: DeploymentProfileIdSchema,
    repository: CheckoutPathSchema,
    origin: RepositoryOriginSchema,
    repositoryId: z
      .string()
      .regex(/^gitrepo_[a-f0-9]{32}$/)
      .optional(),
    remoteName: z.enum(["frevos", "origin", "devsetu"]).optional(),
    head: z.string().regex(/^[a-f0-9]{40}$/),
    branch: z.string().min(1).max(240),
    checkedAt: z.iso.datetime(),
  })
  .strict();
export type ConnectorProbe = z.infer<typeof ConnectorProbeSchema>;
export const matchesDeploymentRepository = (
  profile: Pick<DeploymentSettings, "profileId" | "repositoryOrigin">,
  probe: ConnectorProbe | undefined,
) =>
  !!probe &&
  probe.profileId === profile.profileId &&
  (profile.profileId === "servix-development"
    ? probe.origin === SERVIX_REPOSITORY.origin &&
      probe.repositoryId === SERVIX_REPOSITORY.id &&
      probe.remoteName === SERVIX_REPOSITORY.remoteName
    : probe.origin === profile.repositoryOrigin &&
      (!profile.repositoryOrigin.startsWith("devsetu:") ||
        (probe.remoteName === "devsetu" &&
          profile.repositoryOrigin === `devsetu://repositories/${probe.repositoryId}`)));
export const DeploymentConnectionTestSchema = z
  .object({
    profileId: DeploymentProfileIdSchema,
    revision: z.number().int().positive(),
    checkedAt: z.iso.datetime(),
    checks: z
      .array(
        z
          .object({
            name: z.string(),
            status: z.enum(["passed", "failed", "pending"]),
            message: z.string(),
          })
          .strict(),
      )
      .max(12),
    ready: z.boolean(),
  })
  .strict();
export type DeploymentConnectionTest = z.infer<typeof DeploymentConnectionTestSchema>;
