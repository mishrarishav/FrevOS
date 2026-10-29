import { z } from "zod";
import { ConnectorIdSchema } from "./developer-connectors.js";
import { DeploymentProfileIdSchema } from "./deployment-settings.js";
import { WorkspaceIdSchema } from "./identifiers.js";

export const PreviewOpenSchema = z
  .object({
    deviceId: ConnectorIdSchema,
    serviceId: DeploymentProfileIdSchema,
  })
  .strict();
export const PreviewBootstrapSchema = z
  .object({
    action: z.url(),
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const PreviewClosedSchema = z.object({ closed: z.literal(true) }).strict();
export const PreviewHeadersSchema = z
  .array(
    z.tuple([
      z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/),
      z
        .string()
        .max(8192)
        .refine((v) => !/[\0\r\n]/.test(v)),
    ]),
  )
  .max(100);
export const PreviewBodySchema = z
  .string()
  .max(22_369_624)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const PreviewJobSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^prv_[a-f0-9]{32}$/),
    workspaceId: WorkspaceIdSchema,
    deviceId: ConnectorIdSchema,
    profileId: DeploymentProfileIdSchema,
    serviceId: DeploymentProfileIdSchema,
    revision: z.number().int().nonnegative(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    origin: z.url(),
    method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
    path: z
      .string()
      .max(8192)
      .refine((v) => v.startsWith("/") && !v.startsWith("//") && !/[\0\r\n\\#]/.test(v)),
    headers: PreviewHeadersSchema,
    body: PreviewBodySchema,
    timeoutMs: z.number().int().min(100).max(30000),
    maxResponseBytes: z.number().int().min(1024).max(16_777_216),
  })
  .strict();
export const PreviewResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      id: PreviewJobSchema.shape.id,
      ok: z.literal(true),
      status: z.number().int().min(200).max(599),
      headers: PreviewHeadersSchema,
      body: PreviewBodySchema,
    })
    .strict(),
  z
    .object({
      id: PreviewJobSchema.shape.id,
      ok: z.literal(false),
      error: z.enum([
        "target-unavailable",
        "upstream-failed",
        "response-too-large",
        "unsupported-stream",
      ]),
    })
    .strict(),
]);
export type PreviewJob = z.infer<typeof PreviewJobSchema>;
export type PreviewResult = z.infer<typeof PreviewResultSchema>;
