import { z } from "zod";
import { WorkspaceIdSchema, ProjectIdSchema } from "./identifiers.js";
import { ConnectorIdSchema } from "./developer-connectors.js";
const label = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127));
const markdown = z
  .string()
  .max(16000)
  .refine((s) => !s.includes("\0"));
export const ModelConnectionIdSchema = z.string().regex(/^mc_[a-f0-9]{32}$/);
export const AgentIdSchema = z.string().regex(/^ag_[a-f0-9]{32}$/);
export const ModelConnectionInputSchema = z
  .object({
    version: z.literal(1),
    id: ModelConnectionIdSchema.optional(),
    expectedRevision: z.number().int().nonnegative(),
    name: label,
    endpoint: z.url().max(1024),
    model: z
      .string()
      .max(160)
      .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)),
    protocol: z.literal("chat-completions"),
    authentication: z.enum(["bearer", "x-api-key"]),
    allowWorkspaceSummary: z.boolean(),
    credential: z.enum(["replace", "keep"]),
  })
  .strict();
export type ModelConnectionInput = z.infer<typeof ModelConnectionInputSchema>;
export const ModelConnectionSchema = ModelConnectionInputSchema.omit({
  expectedRevision: true,
  credential: true,
})
  .extend({
    id: ModelConnectionIdSchema,
    workspaceId: WorkspaceIdSchema,
    actor: label,
    revision: z.number().int().positive(),
    secretReference: z.string().regex(/^model-key\/[a-f0-9]{32}$/),
    updatedAt: z.iso.datetime(),
    status: z.enum(["active", "retired"]),
  })
  .strict();
export type ModelConnection = z.infer<typeof ModelConnectionSchema>;
export const ModelProposalSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^mp_[a-f0-9]{32}$/),
    actor: label,
    workspaceId: WorkspaceIdSchema,
    target: ModelConnectionIdSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime(),
    keyId: z.string().regex(/^[a-f0-9]{64}$/),
    publicKey: z.string().regex(/^[a-f0-9]{64}$/),
    input: ModelConnectionInputSchema,
  })
  .strict();
export type ModelProposal = z.infer<typeof ModelProposalSchema>;
export const ModelCommitInputSchema = z
  .object({
    version: z.literal(1),
    proposalId: z.string().regex(/^mp_[a-f0-9]{32}$/),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    approve: z.literal(true),
    sealed: z
      .object({
        keyId: z.string().regex(/^[a-f0-9]{64}$/),
        publicKey: z.string().regex(/^[a-f0-9]{64}$/),
        iv: z.string().regex(/^[a-f0-9]{24}$/),
        ciphertext: z
          .string()
          .min(34)
          .max(10000)
          .regex(/^[a-f0-9]+$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ModelCommitInput = z.infer<typeof ModelCommitInputSchema>;
export const ModelTestResultSchema = z
  .object({
    connectionId: ModelConnectionIdSchema,
    connectionRevision: z.number().int().positive(),
    at: z.iso.datetime(),
    status: z.enum([
      "ready",
      "unavailable",
      "authentication-failed",
      "invalid-response",
      "timeout",
      "endpoint-denied",
    ]),
    latencyMs: z.number().int().nonnegative(),
    model: z.string().max(160),
  })
  .strict();
export type ModelTestResult = z.infer<typeof ModelTestResultSchema>;
export const AgentGuardrailsSchema = z
  .object({
    sources: z
      .array(z.enum(["manual", "discovery", "delivery-plans"]))
      .min(1)
      .max(3)
      .refine((s) => new Set(s).size === s.length),
    maxOutputTokens: z.number().int().min(32).max(2048),
    timeoutSeconds: z.number().int().min(5).max(60),
    allowNotificationDrafts: z.boolean(),
  })
  .strict();
export const defaultAgentGuardrails: z.infer<typeof AgentGuardrailsSchema> = {
  sources: ["manual"],
  maxOutputTokens: 512,
  timeoutSeconds: 30,
  allowNotificationDrafts: false,
};
export const AgentInputSchema = z
  .object({
    version: z.literal(1),
    id: AgentIdSchema.optional(),
    expectedRevision: z.number().int().nonnegative(),
    name: label,
    role: label,
    parentId: AgentIdSchema.nullable(),
    connectionId: ModelConnectionIdSchema,
    skills: markdown,
    memory: markdown,
    guardrails: AgentGuardrailsSchema,
    enabled: z.boolean(),
  })
  .strict();
export type AgentInput = z.infer<typeof AgentInputSchema>;
export const AgentSchema = AgentInputSchema.omit({ expectedRevision: true })
  .extend({
    id: AgentIdSchema,
    workspaceId: WorkspaceIdSchema,
    actor: label,
    revision: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type Agent = z.infer<typeof AgentSchema>;
export const AgentRunInputSchema = z
  .object({
    version: z.literal(1),
    agentId: AgentIdSchema,
    prompt: z.string().trim().min(1).max(4000),
    projectId: ProjectIdSchema.optional(),
  })
  .strict();
export type AgentRunInput = z.infer<typeof AgentRunInputSchema>;
export const AgentRunSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^ar_[a-f0-9]{32}$/),
    workspaceId: WorkspaceIdSchema,
    actor: label,
    agentId: AgentIdSchema,
    agentRevision: z.number().int().positive(),
    connectionId: ModelConnectionIdSchema,
    createdAt: z.iso.datetime(),
    status: z.enum(["running", "succeeded", "failed"]),
    prompt: z.string().max(4000),
    output: markdown,
    errorCode: z
      .enum([
        "model-unavailable",
        "guardrail-denied",
        "model-timeout",
        "model-authentication-failed",
        "model-invalid-response",
      ])
      .optional(),
    evidence: z
      .array(
        z
          .object({
            kind: z.enum(["manual", "discovery", "delivery-plan"]),
            reference: z.string().max(256),
            observedAt: z.iso.datetime().nullable(),
            summary: z.string().max(2000),
          })
          .strict(),
      )
      .max(60),
    facts: z
      .array(
        z
          .object({
            projectId: ProjectIdSchema,
            projectName: label,
            responsible: z.string().max(160),
            completedPercent: z.number().min(0).max(100).nullable(),
            plannedPercent: z.number().min(0).max(100).nullable(),
            status: z.string().max(40),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type AgentRun = z.infer<typeof AgentRunSchema>;
export const AgentWorkspaceStateSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    connections: z.array(ModelConnectionSchema).max(40),
    agents: z.array(AgentSchema).max(100),
    runs: z.array(AgentRunSchema).max(50),
    tests: z.array(ModelTestResultSchema).max(40),
  })
  .strict();
export type AgentWorkspaceState = z.infer<typeof AgentWorkspaceStateSchema>;
export const NotificationDraftInputSchema = z
  .object({
    version: z.literal(1),
    runId: z.string().regex(/^ar_[a-f0-9]{32}$/),
    deviceId: ConnectorIdSchema,
    title: label.max(80),
    message: z
      .string()
      .trim()
      .min(1)
      .max(800)
      .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 32 && c !== "\n" && c !== "\t")),
  })
  .strict();
export type NotificationDraftInput = z.infer<typeof NotificationDraftInputSchema>;
export const NotificationApprovalInputSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^nt_[a-f0-9]{32}$/),
    expectedRevision: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    approve: z.literal(true),
  })
  .strict();
export type NotificationApprovalInput = z.infer<typeof NotificationApprovalInputSchema>;
export const NotificationSchema = NotificationDraftInputSchema.extend({
  id: z.string().regex(/^nt_[a-f0-9]{32}$/),
  workspaceId: WorkspaceIdSchema,
  actor: label,
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum([
    "draft",
    "queued",
    "delivering",
    "display-requested",
    "declined",
    "unsupported",
    "expired",
    "delivery-uncertain",
  ]),
  approval: z
    .object({
      version: z.literal(1),
      actor: label,
      workspaceId: WorkspaceIdSchema,
      action: z.literal("notification:deliver"),
      target: ConnectorIdSchema,
      correlationId: z.string().regex(/^nt_[a-f0-9]{32}$/),
      digest: z.string().regex(/^[a-f0-9]{64}$/),
      issuedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      consumedAt: z.iso.datetime().optional(),
    })
    .strict()
    .optional(),
}).strict();
export type AgentNotification = z.infer<typeof NotificationSchema>;
export const NotificationClaimInputSchema = z
  .object({
    version: z.literal(1),
    enabled: z.boolean(),
    capability: z.enum(["windows-balloon", "linux-desktop", "unavailable"]),
  })
  .strict();
export const NotificationCompleteInputSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^nt_[a-f0-9]{32}$/),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["display-requested", "declined", "unsupported"]),
  })
  .strict();
export const NotificationStateSchema = z
  .object({
    version: z.literal(1),
    records: z.array(NotificationSchema).max(100),
    recipients: z
      .array(
        z
          .object({
            deviceId: ConnectorIdSchema,
            name: label,
            online: z.boolean(),
            enabled: z.boolean(),
            capability: z.enum(["windows-balloon", "linux-desktop", "unavailable"]),
            observedAt: z.iso.datetime().nullable(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type NotificationState = z.infer<typeof NotificationStateSchema>;
export function modelSecretContext(
  p: Pick<ModelProposal, "id" | "actor" | "workspaceId" | "target" | "digest" | "keyId">,
) {
  return JSON.stringify([
    "agent-model-secret-v1",
    p.workspaceId,
    p.actor,
    p.id,
    p.target,
    p.digest,
    p.keyId,
  ]);
}
