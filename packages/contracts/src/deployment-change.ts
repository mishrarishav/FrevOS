import { z } from "zod";

// User-declared context, separate from authenticated actor and policy approval.
export const DeploymentChangeSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(3)
      .max(2000)
      .refine((v) =>
        [...v].every((c) => {
          const n = c.charCodeAt(0);
          return (n >= 32 || [9, 10, 13].includes(n)) && n !== 127;
        }),
      ),
    approvedBy: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
  })
  .strict();
export type DeploymentChange = z.infer<typeof DeploymentChangeSchema>;
