import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({ remaining: 0, code: "EPERM" as string | undefined }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (fault.remaining-- > 0)
        throw Object.assign(Error("Injected transient lock"), { code: fault.code });
      return actual.rename(...args);
    },
  };
});
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
import { replaceDurableRecord } from "../src/atomic-record.js";

it("replaces only the synced record after transient Windows locks and retains the original on permanent failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-atomic-"));
  const current = join(root, "current.json"),
    next = join(root, "next.json");
  try {
    await writeFile(current, '{"revision":1}');
    await writeFile(next, '{"revision":2}');
    fault.remaining = process.platform === "win32" ? 2 : 0;
    await replaceDurableRecord(next, current);
    expect(await readFile(current, "utf8")).toBe('{"revision":2}');
    await writeFile(next, '{"revision":3}');
    fault.remaining = 10;
    await expect(replaceDurableRecord(next, current)).rejects.toThrow("Injected");
    expect(await readFile(current, "utf8")).toBe('{"revision":2}');
    expect(await readFile(next, "utf8")).toBe('{"revision":3}');
    fault.remaining = 1;
    fault.code = "ENOSPC";
    await expect(replaceDurableRecord(next, current)).rejects.toThrow("Injected");
    fault.remaining = 1;
    fault.code = undefined;
    await expect(replaceDurableRecord(next, current)).rejects.toThrow("Injected");
  } finally {
    fault.remaining = 0;
    await rm(root, { recursive: true, force: true });
  }
});
