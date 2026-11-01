import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  paperclipBindings,
  PaperclipBindingSchema,
  PrivatePaperclipTasks,
  type PaperclipBinding,
} from "../src/paperclip-bridge.js";
const resources: Server[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    resources.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});
const companyId = randomUUID();
const template = PaperclipBindingSchema.parse({
  version: 1,
  workspaceId: "ws_fixture",
  actor: "usr_alice",
  origin: "http://127.0.0.1:12345",
  companyId,
  allowInternalHttp: true,
  allowWorkspaceSummary: false,
  secretReference: "env:SYNTHETIC_PAPERCLIP_KEY",
});
async function fixture() {
  const requests: { method: string; path: string; body: Record<string, unknown> }[] = [];
  let mode = "ok";
  const issues = new Map<string, unknown>();
  const server = createServer(async (req, res) => {
    if (mode === "timeout") return;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    requests.push({ method: req.method!, path: req.url!, body });
    expect(req.headers.authorization).toBe("Bearer SYNTHETIC_PAPERCLIP_TOKEN");
    res.setHeader("content-type", "application/json");
    if (mode === "redirect") {
      res.writeHead(302, { location: "http://10.0.0.1/secret" });
      res.end("{}");
      return;
    }
    if (mode === "invalid") {
      res.end("not json");
      return;
    }
    if (mode === "html") {
      res.setHeader("content-type", "text/html");
      res.end("{}");
      return;
    }
    if (mode === "large") {
      res.end(JSON.stringify({ huge: "x".repeat(262144) }));
      return;
    }
    if (req.url?.endsWith("/agents")) {
      res.end(JSON.stringify(mode === "active" ? [{ companyId, status: "idle" }] : []));
      return;
    }
    if (req.url === "/api/companies/" + companyId) {
      res.end(JSON.stringify({ id: mode === "company" ? randomUUID() : companyId }));
      return;
    }
    if (req.method === "POST") {
      const id = randomUUID(),
        issue = { id, companyId: mode === "cross" ? randomUUID() : companyId, ...body };
      issues.set(id, issue);
      res.end(JSON.stringify(issue));
      return;
    }
    const id = req.url!.split("/").at(-1)!;
    if (req.method === "PATCH") {
      const issue = { id, companyId, status: mode === "status" ? "backlog" : body["status"] };
      res.end(JSON.stringify(issue));
      return;
    }
    res.end(
      JSON.stringify(
        issues.get(id) ?? { id, companyId: mode === "cross-read" ? randomUUID() : companyId },
      ),
    );
  });
  resources.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error("fixture port");
  const binding = { ...template, origin: `http://127.0.0.1:${addr.port}` };
  const bridge = new PrivatePaperclipTasks(binding, async (ref) => {
    expect(ref).toBe(template.secretReference);
    return "SYNTHETIC_PAPERCLIP_TOKEN";
  });
  return {
    bridge,
    binding,
    requests,
    mode: (m: string) => {
      mode = m;
    },
  };
}
it("validates exact operator enrollment, secret references and company isolation", () => {
  expect(paperclipBindings(undefined)).toEqual([]);
  expect(paperclipBindings(JSON.stringify([template]))).toEqual([template]);
  for (const origin of [
    "http://example.com",
    "http://169.254.169.254",
    "http://8.8.8.8",
    "http://127.0.0.1/",
    "http://u:p@127.0.0.1",
    "http://127.0.0.1?token=x",
    "file:///etc/passwd",
    "http://256.1.1.1",
  ])
    expect(PaperclipBindingSchema.safeParse({ ...template, origin }).success).toBe(false);
  for (const origin of ["https://10.0.0.5", "http://172.16.2.3", "http://192.168.0.2"])
    expect(PaperclipBindingSchema.safeParse({ ...template, origin }).success).toBe(true);
  expect(PaperclipBindingSchema.safeParse({ ...template, allowInternalHttp: false }).success).toBe(
    false,
  );
  expect(
    PaperclipBindingSchema.safeParse({ ...template, secretReference: "plaintext-token" }).success,
  ).toBe(false);
  expect(() =>
    paperclipBindings(JSON.stringify([template, { ...template, actor: "usr_bob" }])),
  ).toThrow("paperclip-binding-conflict");
  expect(() =>
    paperclipBindings(JSON.stringify([template, { ...template, companyId: randomUUID() }])),
  ).toThrow("paperclip-binding-conflict");
});
it("uses the real bounded HTTP protocol for passive parent/child tasks and results", async () => {
  const f = await fixture();
  const parent = await f.bridge.create(
    "Read-only review",
    "Synthetic request @someone SYNTHETIC_PAPERCLIP_TOKEN",
  );
  const child = await f.bridge.create("Specialist", "No raw memory or files", parent);
  await f.bridge.finish(child, "Synthetic result @someone");
  const writes = f.requests.filter((r) => r.method !== "GET");
  expect(writes.map((r) => r.method)).toEqual(["POST", "POST", "PATCH"]);
  expect(writes[0]!.body).toMatchObject({ status: "backlog", assigneeAgentId: null });
  expect(writes[1]!.body["parentId"]).toBe(parent);
  expect(writes[2]!.body).toMatchObject({ status: "done", comment: "Synthetic result ＠someone" });
  expect(JSON.stringify(writes)).not.toContain("SYNTHETIC_PAPERCLIP_TOKEN");
  expect(writes[0]!.body["description"]).toContain("[credential omitted]");
});
it("rejects foreign companies and active runners before any task write", async () => {
  for (const mode of ["active", "company"]) {
    const f = await fixture();
    f.mode(mode);
    await expect(f.bridge.create("Review", "Synthetic")).rejects.toThrow();
    expect(f.requests.every((r) => r.method === "GET")).toBe(true);
  }
  const f = await fixture();
  f.mode("cross");
  await expect(f.bridge.create("Review", "Synthetic")).rejects.toThrow("paperclip-company-denied");
  f.mode("cross-read");
  await expect(f.bridge.finish(randomUUID(), "Synthetic")).rejects.toThrow(
    "paperclip-company-denied",
  );
});
it("rejects redirects, wrong content, oversized replies and unconfirmed results without retry", async () => {
  for (const mode of ["redirect", "invalid", "html", "large"]) {
    const f = await fixture();
    f.mode(mode);
    await expect(f.bridge.check()).rejects.toThrow();
    expect(f.requests).toHaveLength(1);
  }
  const f = await fixture();
  f.mode("status");
  await expect(f.bridge.finish(randomUUID(), "Synthetic")).rejects.toThrow(
    "paperclip-invalid-response",
  );
  await expect(f.bridge.finish("path/escape", "Synthetic")).rejects.toThrow();
  const noKey = new PrivatePaperclipTasks(f.binding, async () => "bad\nkey");
  await expect(noKey.check()).rejects.toThrow("paperclip-credential-unavailable");
  await expect(
    f.bridge.create("Review", "x".repeat(64000) + "😀".repeat(64000)),
  ).resolves.toBeDefined();
});
it("enforces a total request timeout", async () => {
  const f = await fixture();
  f.mode("timeout");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const result = expect(f.bridge.check()).rejects.toThrow("paperclip-unavailable");
  await vi.advanceTimersByTimeAsync(10001);
  await result;
});
