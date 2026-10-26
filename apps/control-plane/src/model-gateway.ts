import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import type { ModelConnection } from "@frevos/contracts";
export type ModelFailure =
  | "model-unavailable"
  | "model-timeout"
  | "model-authentication-failed"
  | "model-invalid-response"
  | "endpoint-denied";
export class ModelGatewayError extends Error {
  constructor(readonly code: ModelFailure) {
    super(code);
  }
}
export interface ModelReply {
  text: string;
  model: string;
}
export interface ModelPrompt {
  instruction: string;
  input: string;
  maxOutputTokens: number;
  timeoutSeconds: number;
}
export interface ModelGateway {
  validateEndpoint(endpoint: string): Promise<void>;
  complete(connection: ModelConnection, key: string, prompt: ModelPrompt): Promise<ModelReply>;
}
const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
for (const [ip, prefix] of [
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(ip, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
export function publicModelAddress(ip: string) {
  const family = isIP(ip);
  return family === 4
    ? !blocked.check(ip, "ipv4")
    : family === 6 && globalV6.check(ip, "ipv6") && !blocked.check(ip, "ipv6");
}
export function modelEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ModelGatewayError("endpoint-denied");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname.endsWith(".") ||
    /\.(?:localhost|local|internal)$/i.test(url.hostname) ||
    url.hostname === "localhost" ||
    url.href.length > 1024
  )
    throw new ModelGatewayError("endpoint-denied");
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && !publicModelAddress(literal)) throw new ModelGatewayError("endpoint-denied");
  return url;
}
export class SecureChatGateway implements ModelGateway {
  constructor(
    private readonly resolveAddresses: (
      host: string,
    ) => Promise<{ address: string; family: number }[]> = (host) =>
      lookup(host, { all: true, verbatim: true }),
    private readonly requestFactory: typeof request = request,
  ) {}
  private async target(endpoint: string) {
    const url = modelEndpoint(endpoint);
    let addresses: { address: string; family: number }[];
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        addresses = await Promise.race([
          this.resolveAddresses(url.hostname.replace(/^\[|\]$/g, "")),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ModelGatewayError("model-timeout")), 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      if (e instanceof ModelGatewayError) throw e;
      throw new ModelGatewayError("model-unavailable");
    }
    if (
      !addresses.length ||
      addresses.length > 32 ||
      addresses.some((a) => !publicModelAddress(a.address) || ![4, 6].includes(a.family))
    )
      throw new ModelGatewayError("endpoint-denied");
    return { url, pinned: addresses[0]! };
  }
  async validateEndpoint(endpoint: string) {
    await this.target(endpoint);
  }
  async complete(
    connection: ModelConnection,
    key: string,
    prompt: ModelPrompt,
  ): Promise<ModelReply> {
    const { url, pinned } = await this.target(connection.endpoint);
    if (
      !/^[\x21-\x7e]{8,2048}$/.test(key) ||
      !Number.isInteger(prompt.maxOutputTokens) ||
      prompt.maxOutputTokens < 16 ||
      prompt.maxOutputTokens > 2048 ||
      prompt.timeoutSeconds < 5 ||
      prompt.timeoutSeconds > 60
    )
      throw new ModelGatewayError("model-invalid-response");
    const body = JSON.stringify({
      ...(connection.model ? { model: connection.model } : {}),
      messages: [
        { role: "system", content: prompt.instruction },
        { role: "user", content: prompt.input },
      ],
      max_tokens: prompt.maxOutputTokens,
      stream: false,
    });
    if (Buffer.byteLength(body) > 65536) throw new ModelGatewayError("model-invalid-response");
    return new Promise((resolve, reject) => {
      const fail = (code: ModelFailure) => reject(new ModelGatewayError(code));
      const child = this.requestFactory(
        url,
        {
          method: "POST",
          agent: false,
          servername: url.hostname,
          family: pinned.family,
          lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            ...(connection.authentication === "bearer"
              ? { authorization: "Bearer " + key }
              : { "x-api-key": key }),
          },
          signal: AbortSignal.timeout(prompt.timeoutSeconds * 1000),
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status !== 200) {
            response.resume();
            fail(
              [401, 403].includes(status)
                ? "model-authentication-failed"
                : status >= 300 && status < 400
                  ? "endpoint-denied"
                  : "model-unavailable",
            );
            return;
          }
          if (!response.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
            response.resume();
            fail("model-invalid-response");
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > 131072) {
              response.destroy();
              fail("model-invalid-response");
            } else chunks.push(chunk);
          });
          response.once("error", () => fail("model-unavailable"));
          response.once("end", () => {
            try {
              resolve(
                normalizeModelReply(Buffer.concat(chunks).toString("utf8"), connection.model),
              );
            } catch {
              fail("model-invalid-response");
            }
          });
        },
      );
      child.once("error", (e) =>
        fail((e as Error).name === "AbortError" ? "model-timeout" : "model-unavailable"),
      );
      child.end(body);
    });
  }
}
export function normalizeModelReply(body: string, fallback: string): ModelReply {
  const value = JSON.parse(body),
    message = value?.choices?.[0]?.message;
  if (
    !Array.isArray(value.choices) ||
    value.choices.length > 16 ||
    message?.role !== "assistant" ||
    typeof message?.content !== "string" ||
    !message.content.trim() ||
    message.content.length > 16000 ||
    message.tool_calls?.length ||
    message.function_call
  )
    throw new ModelGatewayError("model-invalid-response");
  const model =
    typeof value.model === "string" &&
    value.model.length <= 160 &&
    ![...value.model].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
      ? value.model
      : fallback;
  return { text: message.content, model };
}
