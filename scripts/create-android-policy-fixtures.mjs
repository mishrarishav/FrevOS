import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ManagedServiceSchema,
  SoftwareJobSchema,
  softwareJobBinding,
} from "../packages/contracts/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  output = resolve(process.argv[2] ?? resolve(root, ".local/android-policy-fixtures.json"));
if (!output.startsWith(resolve(root, ".local") + sep))
  throw Error("Android fixture output must be inside this repository's .local folder");
const sha = (value) => createHash("sha256").update(value).digest("hex"),
  now = Date.parse("2026-11-06T00:00:00.000Z"),
  deviceId = `fc_${"a".repeat(32)}`,
  workspaceId = "ws_android_fixture",
  actor = "usr_android_admin";
const current = ManagedServiceSchema.parse({
  id: sha("android-connector:org.devsetu.connector.HealthSamplingService"),
  name: "org.devsetu.connector.HealthSamplingService",
  displayName: "DevSetu स्वास्थ्य sampling",
  manager: "android-connector",
  definitionSha256: sha("signed-package-version-3"),
  status: "running",
  startupType: "User-started connector",
  description: "Only this connector's health sampling.",
  canStart: true,
  canStop: true,
  protected: false,
});
function job(operation) {
  const control = operation === "start-service" || operation === "stop-service";
  const value = SoftwareJobSchema.parse({
    version: 1,
    workspaceId,
    actor,
    request: {
      version: 1,
      requestId: `sw_${(operation === "start-service" ? "1" : operation === "stop-service" ? "2" : operation === "inventory" ? "3" : "4").repeat(32)}`,
      deviceId,
      operation,
      ...(control ? { serviceId: current.id, policyRevision: 1 } : {}),
    },
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
    status: "working",
    digest: "0".repeat(64),
    ...(control ? { service: current } : {}),
  });
  value.digest = sha(softwareJobBinding(value));
  if (control)
    value.approval = {
      version: 1,
      action: "software.service.v1",
      workspaceId,
      actor,
      target: deviceId,
      correlationId: value.request.requestId,
      artifactSha256: current.definitionSha256,
      digest: value.digest,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 300000).toISOString(),
      consumedAt: new Date(now).toISOString(),
    };
  return SoftwareJobSchema.parse(value);
}
const base = {
    identity: { workspaceId, deviceId },
    saved: { deviceId },
    current,
    inventory: true,
    controlConsent: true,
    now,
  },
  cases = [];
for (const operation of ["start-service", "stop-service", "inventory", "services-inventory"])
  cases.push({ ...base, name: `valid ${operation}`, job: job(operation), expected: true });
const deny = (name, mutate, operation = "stop-service") => {
  const row = structuredClone({ ...base, name, job: job(operation), expected: false });
  mutate(row);
  cases.push(row);
};
deny("wrong workspace", (c) => {
  c.identity.workspaceId = "ws_other";
});
deny("wrong device", (c) => {
  c.saved.deviceId = `fc_${"b".repeat(32)}`;
});
deny("revoked local control", (c) => {
  c.controlConsent = false;
});
deny(
  "revoked inventory",
  (c) => {
    c.inventory = false;
  },
  "inventory",
);
deny("updated app definition", (c) => {
  c.current.definitionSha256 = sha("newly-signed-version");
});
deny("third party component", (c) => {
  c.job.service.name = "other.app.Service";
});
deny("protected connection", (c) => {
  c.job.service.name = "org.devsetu.connector.MonitorService";
  c.job.service.protected = true;
});
deny("caller command", (c) => {
  c.job.request.command = "arbitrary";
});
deny("caller service argument", (c) => {
  c.job.service.argument = "arbitrary";
});
deny("expired approval", (c) => {
  c.now += 300001;
});
deny("unconsumed approval", (c) => {
  delete c.job.approval.consumedAt;
});
deny("wrong approval actor", (c) => {
  c.job.approval.actor = "usr_other";
});
deny("wrong approval target", (c) => {
  c.job.approval.target = `fc_${"b".repeat(32)}`;
});
deny("wrong approval artifact", (c) => {
  c.job.approval.artifactSha256 = "b".repeat(64);
});
deny("changed job digest", (c) => {
  c.job.digest = "c".repeat(64);
});
deny("not claimed", (c) => {
  c.job.status = "approved";
});
deny("unsupported install", (c) => {
  c.job.request.operation = "install";
});
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ version: 1, cases }, null, 2));
process.stdout.write(
  JSON.stringify({
    status: "PASS",
    cases: cases.length,
    source: "shared contracts and actual Android native policy",
    output,
  }) + "\n",
);
