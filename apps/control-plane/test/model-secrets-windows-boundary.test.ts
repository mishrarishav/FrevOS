import { EventEmitter } from "node:events";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
// Simulate the child transport, not DPAPI. Native Windows storage is tested separately.
vi.mock("node:child_process", () => ({ spawn }));

import { ProtectedModelSecrets } from "../src/model-secrets.js";

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  spawn.mockReset();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(mode: "ok" | "error" | "exit" | "oversize" | "timeout" = "ok") {
  const root = await mkdtemp(join(tmpdir(), "devsetu-secret-transport-"));
  roots.push(root);
  const scope = {
    workspaceId: "ws_fixture",
    actor: "usr_fixture",
    connectionId: "mc_" + "a".repeat(32),
  };
  const records = new Map<string, string>();
  let spawned!: () => void;
  const ready = new Promise<void>((resolve) => {
    spawned = resolve;
  });
  const children: { kill: ReturnType<typeof vi.fn> }[] = [];
  spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      kill: vi.fn(),
    });
    children.push(child);
    child.kill.mockImplementation(() => {
      child.emit("close", 1);
      return true;
    });
    let input = "";
    child.stdin.on("data", (b) => {
      input += b;
    });
    child.stdin.once("finish", () =>
      queueMicrotask(() => {
        if (mode === "timeout") return;
        if (mode === "error") {
          child.emit("error", Error("SYNTHETIC_PRIVATE_PROCESS_DETAIL"));
          return;
        }
        if (mode === "exit") {
          child.stdin.emit("error", Error("synthetic pipe failure"));
          child.emit("close", 1);
          return;
        }
        if (mode === "oversize") {
          child.stdout.write("x".repeat(16385));
          return;
        }
        const request = JSON.parse(input) as { operation: string; id: string; value?: string };
        if (request.operation === "create") records.set(request.id, request.value!);
        else child.stdout.write(records.get(request.id)!);
        child.emit("close", 0);
      }),
    );
    spawned();
    return child;
  });
  const vault = new ProtectedModelSecrets(join(root, scope.workspaceId, "secrets"), {
    platform: "win32",
    uid: () => undefined,
    metadata: lstat,
  });
  return { vault, scope, ready, children };
}

it("keeps Windows secret transport in private stdin and rejects a foreign returned envelope", async () => {
  vi.stubEnv("PSModulePath", "synthetic-incompatible-parent-module-path");
  const { vault, scope } = await fixture();
  const value = "SYNTHETIC_TRANSPORT_SECRET",
    reference = await vault.create(scope, value);
  expect(reference).toMatch(/^model-key\/[a-f0-9]{32}$/);
  expect(await vault.read(reference, scope)).toBe(value);
  await expect(vault.read(reference, { ...scope, actor: "usr_other" })).rejects.toThrow(
    "agent-secret-scope-denied",
  );
  for (const [file, args, options] of spawn.mock.calls) {
    expect(String(file)).toMatch(/powershell\.exe$/);
    expect(JSON.stringify(args)).not.toContain(value);
    expect(options.windowsHide).toBe(true);
    expect(options.stdio).toEqual(["pipe", "pipe", "ignore"]);
    expect(Object.keys(options.env).some((k) => k.toLowerCase() === "psmodulepath")).toBe(false);
  }
});

it.each(["error", "exit", "oversize"] as const)(
  "fails closed with a generic error for Windows helper %s",
  async (mode) => {
    const { vault, scope } = await fixture(mode);
    await expect(vault.read("model-key/" + "a".repeat(32), scope)).rejects.toEqual(
      Error("agent-secret-boundary-unavailable"),
    );
  },
);

it("terminates a Windows helper that exceeds its private request budget", async () => {
  const { vault, scope, ready, children } = await fixture("timeout");
  vi.useFakeTimers();
  const outcome = expect(vault.read("model-key/" + "a".repeat(32), scope)).rejects.toEqual(
    Error("agent-secret-boundary-unavailable"),
  );
  await ready;
  await vi.advanceTimersByTimeAsync(15001);
  await outcome;
  expect(children[0]!.kill).toHaveBeenCalledOnce();
});
