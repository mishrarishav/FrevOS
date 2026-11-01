import { z } from "zod";
import { AgentIdSchema, AgentRunSchema } from "./agent-workspace.js";
import { WorkspaceIdSchema, ProjectIdSchema } from "./identifiers.js";

export const AgentTeamInputSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^[a-f0-9]{32}$/),
    coordinatorId: AgentIdSchema,
    specialistIds: z.array(AgentIdSchema).min(1).max(4),
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((v) => !v.includes("\0")),
    projectId: ProjectIdSchema.optional(),
    shareWithPaperclip: z.boolean(),
  })
  .strict()
  .refine(
    (v) => new Set([v.coordinatorId, ...v.specialistIds]).size === v.specialistIds.length + 1,
    "Choose distinct agents",
  );
export type AgentTeamInput = z.infer<typeof AgentTeamInputSchema>;

export const AgentTeamSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^at_[a-f0-9]{32}$/),
    workspaceId: WorkspaceIdSchema,
    actor: z.string().min(1).max(128),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    request: AgentTeamInputSchema,
    status: z.enum(["running", "succeeded", "failed", "interrupted"]),
    errorCode: z
      .enum(["agent-step-failed", "guardrail-denied", "paperclip-unavailable", "interrupted"])
      .optional(),
    steps: z
      .array(
        z
          .object({
            agentId: AgentIdSchema,
            agentRevision: z.number().int().positive(),
            role: z.enum(["specialist", "coordinator"]),
            run: AgentRunSchema.pick({ id: true, status: true, errorCode: true })
              .extend({
                output: z.string().max(4000),
                evidenceCount: z.number().int().nonnegative(),
                factCount: z.number().int().nonnegative(),
              })
              .strict()
              .optional(),
            paperclipIssueId: z.uuid().optional(),
          })
          .strict(),
      )
      .min(2)
      .max(5),
    paperclipIssueId: z.uuid().optional(),
    output: z.string().max(16000),
    facts: AgentRunSchema.shape.facts.default([]),
    // The current model gateway does not provide verified usage or billing.
    usage: z.literal("unavailable"),
  })
  .strict();
export type AgentTeam = z.infer<typeof AgentTeamSchema>;
export const AgentTeamStateSchema = z
  .object({
    version: z.literal(1),
    paperclip: z.enum(["not-enrolled", "enrolled"]),
    tasks: z.array(AgentTeamSchema).max(50),
  })
  .strict();
export type AgentTeamState = z.infer<typeof AgentTeamStateSchema>;
