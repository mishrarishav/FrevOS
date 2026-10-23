import { mkdtemp, readFile, readdir, rm, writeFile, link } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { LocalDevActionSchema } from "@frevos/contracts";
import { sealEnvironment } from "../src/environment-seal.js";
const { EnvironmentEditor, patch, document, context, visible } = createRequire(import.meta.url)(
  "../../../deployment/servix/EnvironmentEditor.cjs",
);
const cleanup: string[] = [];
const execute = promisify(execFile);
async function acl(file: string) {
  return (
    await execute(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Acl -LiteralPath $env:DEVSETU_FIXTURE_ACL_FILE).Sddl",
      ],
      { windowsHide: true, env: { ...process.env, DEVSETU_FIXTURE_ACL_FILE: file } },
    )
  ).stdout;
}
afterEach(async () => {
  for (const dir of cleanup.splice(0)) await rm(dir, { recursive: true, force: true });
});
it("browser encryption interoperates with the real Windows connector, preserves untouched lines and never returns saved secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "devsetu-env-interop-"));
  cleanup.push(root);
  const file = join(root, ".env.dev");
  const original =
    "# project config हिन्दी\r\nDB_HOST=localhost\r\nDB_PASSWORD='synthetic-existing-secret' # private\r\nCUSTOM_FLAG=before\r\nREMOVE_ME=value # keep note\r\n";
  await writeFile(file, original);
  const editor = new EnvironmentEditor("synthetic-connector-credential");
  const doc = await editor.read(file, "api", ".env.dev");
  expect(JSON.stringify(doc)).not.toContain("synthetic-existing-secret");
  expect(JSON.stringify(doc)).not.toContain("before");
  expect(doc.rows.find((r: { key: string }) => r.key === "DB_HOST")).toMatchObject({
    value: "localhost",
    masked: false,
  });
  const base = {
    version: 1 as const,
    operation: "environment-save" as const,
    requestId: "ld_" + "a".repeat(32),
    deviceId: "fc_" + "b".repeat(32),
    profileId: "arbitrary-project",
    expectedRevision: 0,
    fingerprint: "c".repeat(64),
    serviceId: "api",
    reference: ".env.dev",
    documentRevision: doc.revision,
    approved: true as const,
  };
  const request = sealEnvironment(base, editor.metadata(), [
    { operation: "set", key: "CUSTOM_FLAG", value: "after" },
    { operation: "set", key: "NEW_SECRET", value: "synthetic-replacement-secret" },
    { operation: "set", key: "UNICODE_VALUE", value: "हिन्दी-✓-café" },
    { operation: "delete", key: "REMOVE_ME" },
  ]);
  expect(LocalDevActionSchema.safeParse(request).success).toBe(true);
  expect(JSON.stringify(request)).not.toContain("synthetic-replacement-secret");
  await expect(editor.save(file, { ...request, reference: ".env.other" })).rejects.toThrow(
    "document-changed",
  );
  await expect(editor.save(file, { ...request, profileId: "other-project" })).rejects.toThrow(
    "sealed-request-invalid",
  );
  await expect(
    editor.save(file, {
      ...request,
      sealed: { ...request.sealed, ciphertext: "00" + request.sealed.ciphertext.slice(2) },
    }),
  ).rejects.toThrow("sealed-request-invalid");
  expect(await readFile(file, "utf8")).toBe(original);
  if (process.platform === "win32") {
    const permissions = await acl(file);
    await editor.save(file, request);
    expect(await acl(file)).toBe(permissions);
    expect(await readdir(root)).toEqual([".env.dev"]);
    const saved = await readFile(file, "utf8");
    expect(saved).toContain("DB_PASSWORD='synthetic-existing-secret' # private\r\n");
    expect(saved).toContain("CUSTOM_FLAG='after'\r\n");
    expect(saved).toContain("NEW_SECRET='synthetic-replacement-secret'\r\n");
    expect(saved).toContain("# project config हिन्दी\r\n");
    expect(saved).toContain("UNICODE_VALUE='हिन्दी-✓-café'\r\n");
    expect(saved).toContain("# keep note\r\n");
    expect(saved).not.toContain("REMOVE_ME=");
    await expect(editor.save(file, request)).rejects.toThrow("document-changed");
    const next = await editor.read(file, "api", ".env.dev");
    expect(JSON.stringify(next)).not.toContain("synthetic-replacement-secret");
  }
  const hardLink = join(root, ".env.link");
  const invalid = join(root, ".env.invalid");
  await writeFile(invalid, Buffer.from([65, 61, 255]));
  await expect(editor.read(invalid, "api", ".env.invalid")).rejects.toThrow("syntax-unsupported");
  await link(file, hardLink);
  await expect(editor.read(file, "api", ".env.dev")).rejects.toThrow("file-unavailable");
  await expect(editor.read(hardLink, "api", ".env.link")).rejects.toThrow("file-unavailable");
  const changed = new EnvironmentEditor("synthetic-connector-credential");
  await expect(changed.save(file, request)).rejects.toThrow("key-changed");
  expect(context(base, editor.keyId)).toContain("arbitrary-project");
});
it("preserves dotenv formatting, supports explicit empty values, and rejects ambiguous or destructive input", () => {
  expect(
    patch("\uFEFF# title\nexport A = x # note\nB=keep", [
      { operation: "set", key: "A", value: "" },
      { operation: "set", key: "NEW", value: "x'y" },
    ]),
  ).toBe("\uFEFF# title\nexport A = '' # note\nB=keep\nNEW=\"x'y\"\n");
  expect(patch("A=x", [{ operation: "delete", key: "A" }])).toBe("");
  expect(patch("A=x\n", [{ operation: "set", key: "A", value: 'a"b' }])).toBe("A='a\"b'\n");
  for (const text of [
    "A=1\nA=2\n",
    "A='unterminated",
    'A="x" trailing',
    "A='two\nlines'\n",
    "not dotenv",
    "A=x\0",
  ])
    expect(() => document(text)).toThrow();
  for (const changes of [
    [],
    [{ operation: "delete", key: "MISSING" }],
    [{ operation: "set", key: "A", value: "x\ny" }],
    [{ operation: "set", key: "A", value: "both'\"quotes" }],
    [{ operation: "set", key: "BAD KEY", value: "x" }],
    [
      { operation: "set", key: "A", value: "x" },
      { operation: "delete", key: "A" },
    ],
  ])
    expect(() => patch("A=x\n", changes)).toThrow();
  expect(visible("DB_PASSWORD", "synthetic")).toBe(false);
});
