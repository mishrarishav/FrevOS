import { z } from "zod";
export const DeviceLoginChallengeSchema = z
  .object({
    status: z.literal("device-verification-required"),
    challengeId: z.string().regex(/^dl_[a-f0-9]{64}$/),
    ports: z.array(z.number().int().min(1024).max(65535)).min(1).max(10),
    expiresAt: z.iso.datetime(),
    method: z.literal("connector-page").optional(),
    devices: z
      .array(
        z
          .object({ port: z.number().int().min(1024).max(65535), name: z.string().min(1).max(80) })
          .strict(),
      )
      .min(1)
      .max(10)
      .optional(),
  })
  .strict();
export type DeviceLoginChallenge = z.infer<typeof DeviceLoginChallengeSchema>;
export const DeviceLoginProofSchema = z
  .object({
    version: z.literal(1),
    challengeId: DeviceLoginChallengeSchema.shape.challengeId,
  })
  .strict();
export const DeviceLoginCompletionSchema = DeviceLoginProofSchema.extend({
  proof: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
