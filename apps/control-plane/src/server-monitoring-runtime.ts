import { lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  ReviewRegisterIdSchema,
  ServerMonitorAddressSchema,
  ServerMonitorCredentialProfileSchema,
  ServerMonitorTargetIdSchema,
  ServerMonitorTransportSchema,
  WorkspaceIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import type {
  ServerMonitorCollectionContext,
  ServerMonitorCollectionResult,
  ServerMonitorCollectorTarget,
} from "./server-monitoring.js";

const absolutePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      isAbsolute(value) &&
      [...value].every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
  );
export const ServerMonitoringRuntimeSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    enabled: z.boolean(),
    queueRoot: absolutePath,
    timeoutMs: z.number().int().min(1000).max(120000).default(60000),
    concurrency: z.number().int().min(1).max(4).default(3),
    sourcePolicies: z
      .array(
        z
          .object({
            registerId: ReviewRegisterIdSchema,
            managementValues: z.array(z.string().trim().min(1).max(240)).min(1).max(30),
            hostingField: z
              .string()
              .regex(/^[a-z][a-zA-Z0-9_]{0,39}$/)
              .refine((value) => !["constructor", "prototype", "__proto__"].includes(value)),
          })
          .strict(),
      )
      .max(100),
    targets: z
      .array(
        z
          .object({
            id: ServerMonitorTargetIdSchema,
            address: ServerMonitorAddressSchema,
            port: z.number().int().min(1).max(65535),
            transport: ServerMonitorTransportSchema,
            credentialProfile: ServerMonitorCredentialProfileSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.targets.map((target) => target.id)).size !== value.targets.length)
      context.addIssue({ code: "custom", message: "Duplicate monitoring enrollment" });
    if (
      new Set(value.sourcePolicies.map((source) => source.registerId)).size !==
      value.sourcePolicies.length
    )
      context.addIssue({ code: "custom", message: "Duplicate monitoring source policy" });
  });
export type ServerMonitoringRuntime = z.infer<typeof ServerMonitoringRuntimeSchema>;

/** Optional operator enrollment. Missing configuration never starts a collector. */
export async function loadServerMonitoringRuntime(
  file: string,
): Promise<ServerMonitoringRuntime | undefined> {
  try {
    for (let current = resolve(file); ; current = dirname(current)) {
      if ((await lstat(current)).isSymbolicLink()) throw Error("monitoring-linked-path");
      if (dirname(current) === current) break;
    }
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > 1048576) throw Error("monitoring-configuration-limit");
    return ServerMonitoringRuntimeSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;
    throw Error("server-monitoring-configuration-invalid");
  }
}

/** Ordinary name/grant revisions do not change the protected endpoint identity. */
export function serverMonitoringTargetAllowed(
  config: ServerMonitoringRuntime,
  target: ServerMonitorCollectorTarget,
): boolean {
  return (
    target.workspaceId === config.workspaceId &&
    config.targets.some(
      (entry) =>
        entry.id === target.id &&
        entry.address === target.address &&
        entry.port === target.port &&
        entry.transport === target.transport &&
        entry.credentialProfile === target.credentialProfile,
    )
  );
}

export async function nativeServerMonitoringCollector(config: ServerMonitoringRuntime) {
  // This is a fixed release module, never a module path supplied by a request/configuration.
  const url = new URL("../../../deployment/server-monitoring/QueueCollector.mjs", import.meta.url);
  const module = await import(url.href);
  if (typeof module.createNativeServerMonitoringCollector !== "function")
    throw Error("server-monitoring-adapter-unavailable");
  return module.createNativeServerMonitoringCollector({
    queueRoot: config.queueRoot,
    workspaceId: config.workspaceId,
    timeoutMs: config.timeoutMs,
  }) as (
    target: ServerMonitorCollectorTarget,
    context: ServerMonitorCollectionContext,
  ) => Promise<ServerMonitorCollectionResult>;
}
