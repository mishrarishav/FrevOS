import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, lstat, open, readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { spawn } from "node:child_process";
import type { Stats } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
const Envelope = z
  .object({
    version: z.literal(1),
    workspaceId: z.string().regex(/^ws_[A-Za-z0-9_-]{1,120}$/),
    actor: z.string().min(1).max(128),
    connectionId: z.string().regex(/^mc_[a-f0-9]{32}$/),
    value: z
      .string()
      .min(8)
      .max(2048)
      .refine((s) => /^[\x21-\x7e]+$/.test(s)),
  })
  .strict();
export type ModelSecretScope = Pick<
  z.infer<typeof Envelope>,
  "workspaceId" | "actor" | "connectionId"
>;
export interface ModelSecretBoundary {
  create(scope: ModelSecretScope, value: string): Promise<string>;
  read(reference: string, scope: ModelSecretScope): Promise<string>;
}
export async function assertPlainPath(file: string) {
  for (let p = resolve(file); ; p = dirname(p)) {
    try {
      if ((await lstat(p)).isSymbolicLink()) throw Error("agent-linked-storage");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (dirname(p) === p) break;
  }
}
export class ProtectedModelSecrets implements ModelSecretBoundary {
  constructor(
    readonly root: string,
    private readonly host: {
      platform: NodeJS.Platform;
      uid: () => number | undefined;
      metadata: (file: string) => Promise<Stats>;
    } = {
      platform: process.platform,
      uid: () => process.getuid?.(),
      metadata: lstat,
    },
  ) {}
  private async windows(operation: "create" | "read", id: string, value?: string) {
    await assertPlainPath(this.root);
    const script = fileURLToPath(
      new URL("../../../deployment/servix/ModelSecret.ps1", import.meta.url),
    );
    return new Promise<string>((resolveResult, reject) => {
      const child = spawn(
        join(
          process.env["WINDIR"] ?? "C:/Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script],
        {
          windowsHide: true,
          env: Object.fromEntries(
            Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "psmodulepath"),
          ),
          stdio: ["pipe", "pipe", "ignore"],
        },
      );
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(Error("agent-secret-boundary-unavailable"));
      }, 15000);
      child.stdout.on("data", (b) => {
        output += b;
        if (output.length > 16384) {
          child.kill();
          reject(Error("agent-secret-boundary-unavailable"));
        }
      });
      child.once("error", () => {
        clearTimeout(timer);
        reject(Error("agent-secret-boundary-unavailable"));
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(Error("agent-secret-boundary-unavailable"));
        resolveResult(output);
      });
      child.stdin.on("error", () => {});
      child.stdin.end(
        JSON.stringify({
          version: 1,
          operation,
          root: this.root,
          id,
          ...(value === undefined ? {} : { value }),
        }),
      );
    });
  }
  private async directory() {
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await this.host.metadata(this.root);
    if ((info.mode & 0o077) !== 0 || info.uid !== this.host.uid())
      throw Error("agent-secret-storage-permissions");
  }
  private async master(create: boolean) {
    await this.directory();
    const file = join(this.root, "master.key");
    await assertPlainPath(file);
    if (create)
      try {
        const handle = await open(file, "wx", 0o600);
        try {
          await handle.writeFile(randomBytes(32));
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    const info = await this.host.metadata(file);
    if (
      !info.isFile() ||
      info.size !== 32 ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== this.host.uid()
    )
      throw Error("agent-secret-storage-permissions");
    return readFile(file);
  }
  async create(scope: ModelSecretScope, value: string) {
    if (scope.workspaceId !== basename(dirname(this.root)))
      throw Error("agent-secret-scope-denied");
    const envelope = Envelope.parse({ version: 1, ...scope, value }),
      id = randomBytes(16).toString("hex");
    const clear = Buffer.from(JSON.stringify(envelope));
    try {
      if (this.host.platform === "win32") await this.windows("create", id, clear.toString("utf8"));
      else {
        const key = await this.master(true);
        try {
          if (
            (await readdir(this.root)).filter((n) => /^[a-f0-9]{32}\.sealed$/.test(n)).length >=
            1000
          )
            throw Error("agent-secret-capacity");
          const iv = randomBytes(12),
            cipher = createCipheriv("aes-256-gcm", key, iv);
          cipher.setAAD(Buffer.from("model-secret-v1"));
          const bytes = Buffer.concat([
            iv,
            cipher.update(clear),
            cipher.final(),
            cipher.getAuthTag(),
          ]);
          const handle = await open(join(this.root, id + ".sealed"), "wx", 0o600);
          try {
            await handle.writeFile(bytes);
            await handle.sync();
          } finally {
            await handle.close();
          }
        } finally {
          key.fill(0);
        }
      }
      return "model-key/" + id;
    } finally {
      clear.fill(0);
    }
  }
  async read(reference: string, scope: ModelSecretScope) {
    if (scope.workspaceId !== basename(dirname(this.root)))
      throw Error("agent-secret-scope-denied");
    if (!/^model-key\/[a-f0-9]{32}$/.test(reference)) throw Error("agent-secret-reference-denied");
    const id = reference.slice(10);
    let clear: Buffer;
    if (this.host.platform === "win32") clear = Buffer.from(await this.windows("read", id));
    else {
      const key = await this.master(false);
      try {
        const file = join(this.root, id + ".sealed");
        await assertPlainPath(file);
        const info = await this.host.metadata(file);
        if (
          !info.isFile() ||
          info.size > 8192 ||
          (info.mode & 0o077) !== 0 ||
          info.uid !== this.host.uid()
        )
          throw Error("agent-secret-storage-permissions");
        const bytes = await readFile(file),
          decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from("model-secret-v1"));
        decipher.setAuthTag(bytes.subarray(-16));
        clear = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
      } finally {
        key.fill(0);
      }
    }
    try {
      const e = Envelope.parse(JSON.parse(clear.toString("utf8")));
      if (
        e.workspaceId !== scope.workspaceId ||
        e.actor !== scope.actor ||
        e.connectionId !== scope.connectionId
      )
        throw Error("agent-secret-scope-denied");
      return e.value;
    } finally {
      clear.fill(0);
    }
  }
}
