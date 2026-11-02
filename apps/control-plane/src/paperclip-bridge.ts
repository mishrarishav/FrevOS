import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { z } from "zod";
import { WorkspaceIdSchema } from "@frevos/contracts";

export interface PaperclipTasks {
  readonly allowWorkspaceSummary: boolean;
  check(): Promise<void>;
  create(title: string, description: string, parentId?: string): Promise<string>;
  finish(id: string, output: string): Promise<void>;
}
export type PaperclipTaskFactory = (actor: string) => PaperclipTasks | undefined;
const uuid = z.uuid();
function privateOrigin(value: string) {
  const url = new URL(value),
    parts = url.hostname.split(".").map(Number);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    parts.some((p) => p < 0 || p > 255) ||
    !(
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    ) ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw Error("paperclip-origin-denied");
  return url;
}
export const PaperclipBindingSchema = z
  .object({
    version: z.literal(1),
    workspaceId: WorkspaceIdSchema,
    actor: z.string().min(1).max(128),
    origin: z.string().refine((v) => {
      try {
        privateOrigin(v);
        return true;
      } catch {
        return false;
      }
    }),
    companyId: uuid,
    allowInternalHttp: z.boolean(),
    allowWorkspaceSummary: z.boolean(),
    // Values stay in the operator secret store; config carries only a reference.
    secretReference: z.string().regex(/^env:[A-Z][A-Z0-9_]{0,100}$/),
  })
  .strict()
  .refine((v) => v.allowInternalHttp || new URL(v.origin).protocol === "https:");
export type PaperclipBinding = z.infer<typeof PaperclipBindingSchema>;
export function paperclipBindings(text: string | undefined): PaperclipBinding[] {
  const bindings = z
    .array(PaperclipBindingSchema)
    .max(100)
    .parse(JSON.parse(text ?? "[]"));
  if (
    new Set(bindings.map((b) => `${b.origin}/${b.companyId}`)).size !== bindings.length ||
    new Set(bindings.map((b) => `${b.workspaceId}/${b.actor}`)).size !== bindings.length
  )
    throw Error("paperclip-binding-conflict");
  return bindings;
}
const Resource = z.object({ id: uuid, companyId: uuid }).passthrough();
const passiveText = (value: string) => value.replaceAll("@", "＠").slice(0, 16000);

/** Task records only. Never calls a Paperclip runner, wakeup, tools or hiring API. */
export class PrivatePaperclipTasks implements PaperclipTasks {
  readonly allowWorkspaceSummary: boolean;
  private readonly binding: PaperclipBinding;
  constructor(
    binding: PaperclipBinding,
    private readonly resolveSecret: (reference: string) => Promise<string>,
  ) {
    this.binding = PaperclipBindingSchema.parse(binding);
    this.allowWorkspaceSummary = binding.allowWorkspaceSummary;
  }
  private async call(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = privateOrigin(this.binding.origin);
    const key = await this.resolveSecret(this.binding.secretReference);
    if (!/^[\x21-\x7e]{8,4096}$/.test(key)) throw Error("paperclip-credential-unavailable");
    const payload =
      body === undefined ? undefined : JSON.stringify(body).split(key).join("[credential omitted]");
    if (payload && Buffer.byteLength(payload) > 65536) throw Error("paperclip-request-capacity");
    return new Promise((resolve, reject) => {
      const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method,
          path: "/api" + path,
          agent: false,
          headers: {
            authorization: "Bearer " + key,
            accept: "application/json",
            ...(payload === undefined
              ? {}
              : {
                  "content-type": "application/json",
                  "content-length": Buffer.byteLength(payload),
                }),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("error", () => reject(Error("paperclip-unavailable")));
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 262144) res.destroy(Error("paperclip-response-capacity"));
            else chunks.push(chunk);
          });
          res.on("end", () => {
            if (
              !res.statusCode ||
              res.statusCode < 200 ||
              res.statusCode >= 300 ||
              !res.headers["content-type"]?.includes("application/json")
            )
              return reject(Error("paperclip-unavailable"));
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
              reject(Error("paperclip-invalid-response"));
            }
          });
        },
      );
      const timer = setTimeout(() => req.destroy(Error("paperclip-timeout")), 10000);
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => reject(Error("paperclip-unavailable")));
      req.end(payload);
    });
  }
  private resource(value: unknown, expectedId?: string) {
    const r = Resource.parse(value);
    if (r.companyId !== this.binding.companyId || (expectedId && r.id !== expectedId))
      throw Error("paperclip-company-denied");
    return r;
  }
  async check() {
    const company = z
      .object({ id: uuid })
      .parse(await this.call("GET", "/companies/" + this.binding.companyId));
    if (company.id !== this.binding.companyId) throw Error("paperclip-company-denied");
    // This must be a dedicated passive company. No model-created comment or
    // assignment may wake an independently privileged runner.
    const agents = z
      .array(z.object({ companyId: uuid, status: z.string() }))
      .max(100)
      .parse(await this.call("GET", `/companies/${this.binding.companyId}/agents`));
    if (
      agents.some((a) => a.companyId !== company.id || !["paused", "terminated"].includes(a.status))
    )
      throw Error("paperclip-active-runner-denied");
  }
  async create(title: string, description: string, parentId?: string) {
    await this.check();
    if (parentId)
      this.resource(await this.call("GET", "/issues/" + uuid.parse(parentId)), parentId);
    const issue = this.resource(
      await this.call("POST", `/companies/${this.binding.companyId}/issues`, {
        title: passiveText(title).slice(0, 240),
        description: passiveText(description),
        status: "backlog",
        priority: "medium",
        assigneeAgentId: null,
        ...(parentId ? { parentId } : {}),
      }),
    );
    return issue.id;
  }
  async finish(id: string, output: string) {
    uuid.parse(id);
    await this.check();
    this.resource(await this.call("GET", "/issues/" + id), id);
    const result = this.resource(
      await this.call("PATCH", "/issues/" + id, {
        status: "done",
        comment: passiveText(output),
      }),
      id,
    );
    if (result["status"] !== "done") throw Error("paperclip-invalid-response");
  }
}
