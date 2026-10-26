import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { request, type RequestOptions } from "node:https";
import { expect, it } from "vitest";
import { ModelConnectionSchema } from "@frevos/contracts";
import {
  SecureChatGateway,
  modelEndpoint,
  publicModelAddress,
  normalizeModelReply,
} from "../src/model-gateway.js";
const connection = ModelConnectionSchema.parse({
  version: 1,
  id: "mc_" + "a".repeat(32),
  name: "Fixture",
  endpoint: "https://model.example/chat",
  model: "",
  protocol: "chat-completions",
  authentication: "bearer",
  allowWorkspaceSummary: false,
  workspaceId: "ws_fixture",
  actor: "usr_fixture",
  revision: 1,
  secretReference: "model-key/" + "b".repeat(32),
  updatedAt: "2026-10-26T00:00:00Z",
  status: "active",
});
const prompt = {
  instruction: "Read only.",
  input: "Synthetic connectivity check.",
  maxOutputTokens: 16,
  timeoutSeconds: 5,
};
function fixture(
  status = 200,
  body = JSON.stringify({
    model: "fixture",
    choices: [{ message: { role: "assistant", content: "OK" } }],
  }),
  contentType = "application/json",
  abort = false,
) {
  const seen: { options?: RequestOptions; body?: string; requests: number } = { requests: 0 };
  const factory = ((_url: URL, options: RequestOptions, callback: (r: unknown) => void) => {
    seen.requests++;
    seen.options = options;
    const child = new EventEmitter() as EventEmitter & { end: (text: string) => void };
    child.end = (text) => {
      seen.body = text;
      queueMicrotask(() => {
        if (abort) {
          const e = new Error("synthetic");
          e.name = "AbortError";
          child.emit("error", e);
          return;
        }
        const response = Object.assign(new PassThrough(), {
          statusCode: status,
          headers: { "content-type": contentType },
        });
        callback(response);
        response.end(body);
      });
    };
    return child;
  }) as unknown as typeof request;
  const gateway = new SecureChatGateway(async () => [{ address: "8.8.8.8", family: 4 }], factory);
  return { gateway, seen };
}
it("denies private, metadata, mapped, reserved and rebound addresses without leaking a credential", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.1.5",
    "172.16.0.1",
    "100.64.0.1",
    "224.1.1.1",
    "203.0.113.1",
    "::1",
    "::ffff:8.8.8.8",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "2002:7f00:1::1",
  ])
    expect(publicModelAddress(ip)).toBe(false);
  expect(publicModelAddress("8.8.8.8")).toBe(true);
  expect(publicModelAddress("2606:4700:4700::1111")).toBe(true);
  for (const url of [
    "not a URL",
    "http://model.example",
    "https://user:secret@model.example",
    "https://model.example/?key=private",
    "https://model.example/#token",
    "https://service.local/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://2130706433/",
  ])
    expect(() => modelEndpoint(url)).toThrow("endpoint-denied");
  await expect(
    new SecureChatGateway(async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]).validateEndpoint(connection.endpoint),
  ).rejects.toThrow("endpoint-denied");
  await expect(
    new SecureChatGateway(async () => []).validateEndpoint(connection.endpoint),
  ).rejects.toThrow("endpoint-denied");
  await expect(
    new SecureChatGateway(async () => {
      throw Error("DNS unavailable");
    }).validateEndpoint(connection.endpoint),
  ).rejects.toThrow("model-unavailable");
});
it("pins HTTPS lookup to the checked address and sends the key only to the selected authentication header", async () => {
  const f = fixture(),
    key = "SYNTHETIC_GATEWAY_KEY";
  expect(await f.gateway.complete(connection, key, prompt)).toEqual({
    text: "OK",
    model: "fixture",
  });
  expect(f.seen.options).toMatchObject({
    method: "POST",
    agent: false,
    servername: "model.example",
    family: 4,
  });
  expect(f.seen.options?.headers).toMatchObject({ authorization: "Bearer " + key });
  expect(f.seen.body).not.toContain(key);
  expect(JSON.parse(f.seen.body!)).toMatchObject({
    messages: [
      { role: "system", content: "Read only." },
      { role: "user", content: "Synthetic connectivity check." },
    ],
    max_tokens: 16,
    stream: false,
  });
  expect(JSON.parse(f.seen.body!).model).toBeUndefined();
  const g = fixture();
  await g.gateway.complete(
    { ...connection, model: "configured-model", authentication: "x-api-key" },
    key,
    prompt,
  );
  expect(g.seen.options?.headers).toMatchObject({ "x-api-key": key });
  expect(JSON.parse(g.seen.body!).model).toBe("configured-model");
});
it("normalizes HTTP errors, rejects redirects/malformed/tool-bearing/oversized responses and bounds prompts", async () => {
  for (const [code, error] of [
    [401, "model-authentication-failed"],
    [403, "model-authentication-failed"],
    [302, "endpoint-denied"],
    [503, "model-unavailable"],
  ] as const) {
    const f = fixture(code);
    await expect(f.gateway.complete(connection, "SYNTHETIC_GATEWAY_KEY", prompt)).rejects.toThrow(
      error,
    );
    expect(f.seen.requests).toBe(1);
  }
  await expect(
    fixture(200, "not-json").gateway.complete(connection, "SYNTHETIC_GATEWAY_KEY", prompt),
  ).rejects.toThrow("model-invalid-response");
  await expect(
    fixture(200, "{}", "text/html").gateway.complete(connection, "SYNTHETIC_GATEWAY_KEY", prompt),
  ).rejects.toThrow("model-invalid-response");
  await expect(
    fixture(200, "x".repeat(131073)).gateway.complete(connection, "SYNTHETIC_GATEWAY_KEY", prompt),
  ).rejects.toThrow("model-invalid-response");
  await expect(
    fixture(200, "{}", "application/json", true).gateway.complete(
      connection,
      "SYNTHETIC_GATEWAY_KEY",
      prompt,
    ),
  ).rejects.toThrow("model-timeout");
  await expect(fixture().gateway.complete(connection, "bad\nkey", prompt)).rejects.toThrow(
    "model-invalid-response",
  );
  await expect(
    fixture().gateway.complete(connection, "SYNTHETIC_GATEWAY_KEY", {
      ...prompt,
      input: "x".repeat(66000),
    }),
  ).rejects.toThrow("model-invalid-response");
  expect(
    normalizeModelReply('{"choices":[{"message":{"role":"assistant","content":"OK"}}]}', "fallback")
      .model,
  ).toBe("fallback");
  for (const body of [
    { choices: [{ message: { role: "assistant", content: "", tool_calls: [] } }] },
    {
      choices: [{ message: { role: "assistant", content: "OK", tool_calls: [{ name: "shell" }] } }],
    },
    {
      choices: [
        { message: { role: "assistant", content: "OK", function_call: { name: "deploy" } } },
      ],
    },
    { choices: [{ message: { role: "user", content: "echo" } }] },
  ])
    expect(() => normalizeModelReply(JSON.stringify(body), "")).toThrow();
});
