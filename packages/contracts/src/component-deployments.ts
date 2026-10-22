import { z } from "zod";
import { DeploymentChangeSchema } from "./deployment-change.js";
import {
  CheckoutPathSchema,
  DeploymentProfileIdSchema,
  PreservedPathSchema,
} from "./deployment-settings.js";

export const ComponentIdSchema = DeploymentProfileIdSchema;
export const ExecutorIdSchema = z.string().regex(/^ex_[a-f0-9]{32}$/);
export const PipelineRunIdSchema = z.string().regex(/^pr_[a-f0-9]{32}$/);
export const ComponentRecipeSchema = z.enum([
  "npm-static",
  "node-source",
  "dotnet-publish",
  "devsetu-native",
]);
export const SourceBindingSchema = z
  .object({
    id: z.string().regex(/^gitrepo_[a-f0-9]{32}$/),
    origin: z.string().regex(/^devsetu:\/\/repositories\/gitrepo_[a-f0-9]{32}$/),
    remoteName: z.literal("devsetu"),
    branch: z.literal("devsetu-dev"),
  })
  .strict();
export const ComponentSchema = z
  .object({
    id: ComponentIdSchema,
    name: z.string().trim().min(1).max(80),
    context: PreservedPathSchema.or(z.literal(".")),
    recipe: ComponentRecipeSchema,
    output: PreservedPathSchema.or(z.literal(".")),
    builderId: ExecutorIdSchema.or(z.literal("unassigned")),
    destinationId: ExecutorIdSchema.or(z.literal("unassigned")),
    destinationBinding: ComponentIdSchema,
    siteUrl: z
      .url()
      .max(240)
      .refine((value) => /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/$/.test(value))
      .optional(),
    dependsOn: z.array(ComponentIdSchema).max(31),
    preservedPaths: z.array(PreservedPathSchema).max(64),
  })
  .strict();
export function componentOrder(components: { id: string; dependsOn: string[] }[]): string[] {
  const byId = new Map(components.map((c) => [c.id, c]));
  if (byId.size !== components.length) throw Error("duplicate-component");
  const visiting = new Set<string>(),
    visited = new Set<string>(),
    order: string[] = [];
  const visit = (id: string) => {
    const component = byId.get(id);
    if (!component) throw Error("unknown-component-dependency");
    if (visiting.has(id)) throw Error("component-dependency-cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of component.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const component of components) visit(component.id);
  return order;
}
const PipelineFields = z
  .object({
    version: z.literal(1),
    profileId: DeploymentProfileIdSchema,
    expectedRevision: z.number().int().nonnegative(),
    displayName: z.string().trim().min(1).max(80),
    sourceFolder: CheckoutPathSchema,
    sourcePreservedPaths: z.array(PreservedPathSchema).max(64).default([]),
    archived: z.boolean(),
    components: z.array(ComponentSchema).min(1).max(32),
  })
  .strict();
const validateGraph = (profile: z.infer<typeof PipelineFields>, context: z.RefinementCtx) => {
  try {
    componentOrder(profile.components);
  } catch (error) {
    context.addIssue({ code: "custom", message: (error as Error).message, path: ["components"] });
  }
  const bindings = profile.components
    .filter((c) => c.destinationId !== "unassigned")
    .map((c) => `${c.destinationId}/${c.destinationBinding}`);
  if (new Set(bindings).size !== bindings.length)
    context.addIssue({
      code: "custom",
      message: "Components must own distinct destination bindings",
    });
};
export const PipelineInputSchema = PipelineFields.superRefine(validateGraph);
export const PipelineSchema = PipelineFields.omit({ expectedRevision: true })
  .extend({
    revision: z.number().int().positive(),
    repository: SourceBindingSchema,
    updatedAt: z.iso.datetime(),
    updatedBy: z.string(),
  })
  .strict()
  .superRefine((profile, context) =>
    validateGraph({ ...profile, expectedRevision: profile.revision - 1 }, context),
  );
export type Pipeline = z.infer<typeof PipelineSchema>;
export type PipelineInput = z.infer<typeof PipelineInputSchema>;
export const ExecutorSchema = z
  .object({
    id: ExecutorIdSchema,
    name: z.string().trim().min(1).max(80),
    profileId: DeploymentProfileIdSchema,
    role: z.enum(["builder", "destination"]),
    userId: z.string(),
    status: z.enum(["active", "revoked"]),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    online: z.boolean(),
    lastSeenAt: z.iso.datetime().nullable(),
    systemName: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/)
      .nullable()
      .default(null),
    bindings: z
      .array(
        z
          .object({
            id: ComponentIdSchema,
            root: CheckoutPathSchema,
            healthUrl: z
              .url()
              .max(240)
              .refine((value) => /^https?:\/\//.test(value) && !/[?@#]/.test(value)),
            recipes: z.array(ComponentRecipeSchema).min(1).max(4),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();
export type ComponentExecutor = z.infer<typeof ExecutorSchema>;
export const PipelineRequestSchema = z
  .object({
    requestId: PipelineRunIdSchema,
    profileId: DeploymentProfileIdSchema,
    expectedRevision: z.number().int().positive(),
    operation: z.enum(["deploy", "rollback"]),
    componentId: ComponentIdSchema.optional(),
    connectorId: z
      .string()
      .regex(/^fc_[a-f0-9]{32}$/)
      .optional(),
    expectedCurrent: z.record(ComponentIdSchema, PipelineRunIdSchema.nullable()),
    changeDetails: DeploymentChangeSchema,
  })
  .strict();
export type PipelineRequest = z.infer<typeof PipelineRequestSchema>;
export const ComponentResultSchema = z
  .object({
    id: ComponentIdSchema,
    status: z.enum([
      "pending",
      "building",
      "deploying",
      "succeeded",
      "failed",
      "blocked",
      "recovery-required",
    ]),
    artifactDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    previousRunId: PipelineRunIdSchema.optional(),
    releaseRunId: PipelineRunIdSchema.optional(),
    errorCode: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,79}$/)
      .optional(),
  })
  .strict();
export const PipelineRunSchema = PipelineRequestSchema.extend({
  sourceRequestId: z.string().regex(/^sd_[a-f0-9]{32}$/),
  workspaceId: z.string(),
  requestedBy: z.string(),
  config: PipelineSchema,
  sourceHead: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .nullable(),
  status: z.enum(["publishing", "running", "succeeded", "failed", "partial", "recovery-required"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  components: z.array(ComponentResultSchema).max(32),
}).strict();
export type PipelineRun = z.infer<typeof PipelineRunSchema>;
export const PipelineStateSchema = z
  .object({
    profiles: z.array(PipelineSchema).max(100),
    executors: z.array(ExecutorSchema).max(100),
    runs: z.array(PipelineRunSchema).max(100),
  })
  .strict();
export type PipelineState = z.infer<typeof PipelineStateSchema>;
