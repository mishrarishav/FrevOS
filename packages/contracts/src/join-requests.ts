import { z } from "zod";
import { ConnectorIdSchema } from "./developer-connectors.js";
import { UserIdSchema } from "./identifiers.js";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const JoinRequestInputSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["new", "existing"]),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
    password: z.string().min(1).max(128),
    displayName: z.string().trim().min(1).max(120),
    platform: z.enum(["win32", "linux"]),
    deviceId: ConnectorIdSchema,
    codeHash: hex,
    fileActivity: z.boolean(),
  })
  .strict();
export const JoinRequestSchema = JoinRequestInputSchema.omit({ password: true, codeHash: true })
  .extend({
    id: z.string().regex(/^jr_[a-f0-9]{32}$/),
    ownerUserId: UserIdSchema,
    status: z.enum([
      "pending",
      "approving",
      "approved",
      "rejected",
      "redeeming",
      "paired",
      "expired",
    ]),
    digest: hex,
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    approvedBy: UserIdSchema.optional(),
    approvedUntil: z.iso.datetime().optional(),
  })
  .strict();
export type JoinRequest = z.infer<typeof JoinRequestSchema>;
export const JoinDecisionSchema = z
  .object({
    version: z.literal(1),
    requestId: JoinRequestSchema.shape.id,
    digest: hex,
    decision: z.enum(["approve", "reject"]),
    confirmation: z.literal("reviewed-user-and-system-request"),
  })
  .strict();
export const JoinCodeSchema = z
  .object({ version: z.literal(1), code: z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/) })
  .strict();
export const JoinRedemptionSchema = JoinCodeSchema.extend({
  deviceId: ConnectorIdSchema,
  platform: z.enum(["win32", "linux"]),
  architecture: z.literal("x64"),
  name: z.string().trim().min(1).max(80),
  fileActivity: z.boolean(),
  credentialHash: hex,
  pollHash: hex,
}).strict();
