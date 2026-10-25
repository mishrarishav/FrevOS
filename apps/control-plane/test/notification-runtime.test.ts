import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { notificationDigest } from "../src/agent-notifications.js";
import { WorkspaceIdSchema } from "@frevos/contracts";
const { SystemDiscovery, showNotification } = createRequire(import.meta.url)(
  "../../../deployment/servix/SystemDiscovery.cjs",
);
it("keeps notification text out of executable commands on Windows/Linux and reports unsupported delivery", async () => {
  const calls: unknown[][] = [],
    invoke = async (...args: unknown[]) => {
      calls.push(args);
      return true;
    },
    job = { title: "Fixture ' $(never-execute)", message: "Read only; & no commands" };
  expect(await showNotification(job, { platform: "win32", invoke })).toBe("display-requested");
  expect(JSON.stringify(calls[0]![1])).not.toContain(job.title);
  expect(JSON.parse(String(calls[0]![2]))).toMatchObject(job);
  expect(await showNotification(job, { platform: "linux", invoke })).toBe("display-requested");
  expect(calls[1]![0]).toBe("/usr/bin/notify-send");
  expect(calls[1]![1]).toEqual([
    "--app-name=DevSetu",
    "--expire-time=8000",
    "--",
    job.title,
    job.message,
  ]);
  expect(await showNotification(job, { platform: "linux", invoke: async () => false })).toBe(
    "unsupported",
  );
  expect(await showNotification(job, { platform: "darwin", invoke })).toBe("unsupported");
});
it("requires same-account local consent, exact consumed approval, finite expiry and a durable receipt before display", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-local-notice-")),
    deviceId = "fc_" + "a".repeat(32),
    actor = "usr_fixture",
    server = "https://fixture.example",
    accountName = "pair:" + createHash("sha256").update(actor).digest("hex").slice(0, 40);
  const messages: unknown[] = [],
    completed: unknown[] = [],
    now = Date.now();
  let claimed: unknown;
  const collector = new SystemDiscovery(
    { deviceId, server, accountName, mode: "system", monitoringRoot: root, stateRoot: root },
    async (url: string, body: unknown) => {
      if (url.endsWith("/claim")) return { job: claimed };
      completed.push(body);
      return { accepted: true };
    },
    {
      notificationCapability: async () => "windows-balloon",
      showNotification: async (j: unknown) => {
        messages.push(j);
        return "display-requested";
      },
    },
  );
  try {
    await mkdir(collector.storage);
    collector.notificationSupported = true;
    const base = {
      version: 1 as const,
      id: "nt_" + "b".repeat(32),
      workspaceId: WorkspaceIdSchema.parse("ws_fixture"),
      actor,
      runId: "ar_" + "c".repeat(32),
      deviceId,
      title: "Fixture",
      message: "Review fixture",
      createdAt: new Date(now - 1000).toISOString(),
    };
    const digest = notificationDigest(base),
      expiresAt = new Date(now + 600000).toISOString();
    const job = {
      ...base,
      digest,
      expiresAt,
      revision: 3,
      status: "delivering",
      approval: {
        version: 1,
        actor,
        workspaceId: "ws_fixture",
        action: "notification:deliver",
        target: deviceId,
        correlationId: base.id,
        digest,
        issuedAt: new Date(now).toISOString(),
        expiresAt,
        consumedAt: new Date(now).toISOString(),
      },
    };
    claimed = job;
    await collector.notificationTick();
    expect(messages).toEqual([]);
    const consent = { version: 1, deviceId, server, accountName, enabled: true };
    await writeFile(join(root, "notifications-consent.json"), JSON.stringify(consent));
    claimed = { ...job, approval: { ...job.approval, issuedAt: "invalid" } };
    await collector.notificationTick();
    expect(messages).toEqual([]);
    claimed = { ...job, message: "tampered" };
    await collector.notificationTick();
    expect(messages).toEqual([]);
    claimed = { ...job, approval: { ...job.approval, target: "fc_" + "d".repeat(32) } };
    await collector.notificationTick();
    expect(messages).toEqual([]);
    claimed = job;
    await collector.notificationTick();
    expect(messages).toHaveLength(1);
    expect(
      JSON.parse(await readFile(join(collector.storage, "notification-receipts.json"), "utf8")),
    ).toHaveLength(1);
    await collector.notificationTick();
    expect(messages).toHaveLength(1);
    expect(completed.at(-1)).toMatchObject({ status: "declined" });
    await writeFile(
      join(root, "notifications-consent.json"),
      JSON.stringify({ ...consent, enabled: false }),
    );
    expect(await collector.notificationConsent()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
