import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const front = require("../../../deployment/servix/FrontendArtifact.cjs");
const files = require("../../../deployment/servix/PromotionFiles.cjs");
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
    expect(root).toContain("promotion-frontend-");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "promotion-frontend-"));
  roots.push(base);
  const root = join(base, "application"),
    config = {
      root: "web-ui",
      entry: "index.html",
      routing: "same-origin",
      preservedFiles: ["web.config"],
    };
  const put = (file: string, text: string) => {
    fs.mkdirSync(dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  put(join(root, "web-ui/index.html"), "original frontend");
  put(join(root, "web-ui/web.config"), "preserved routing");
  put(join(root, "web-ui/.env"), "SYNTHETIC_VALUE=retained-only");
  put(join(root, "web-ui/attachments/original.txt"), "original attachment");
  put(join(root, "web-ui/unknown.txt"), "unknown original");
  let n = 0;
  const prepare = (version: string) => {
    const staging = join(base, `stage-${++n}`),
      payload = join(staging, "payload");
    put(join(payload, "web-ui/index.html"), `<script src="/assets/${version}.js"></script>`);
    put(
      join(payload, `web-ui/assets/${version}.js`),
      `window.applicationVersion=${JSON.stringify(version)}`,
    );
    put(join(payload, "web-ui/web.config"), "development-only routing is excluded");
    const binding = front.create(payload, config);
    const context = {
      id: `pm_${String(n).padStart(32, "0")}`,
      staging,
      frontendArtifact: binding,
      target: { root, frontend: config },
    };
    const snapshot = front.inspect(context),
      runtime = join(root, ".runtime/devsetu-promotions", context.id);
    fs.mkdirSync(runtime, { recursive: true });
    const plan = front.stage(context, runtime, snapshot);
    return { context, snapshot, runtime, plan };
  };
  const protectedFiles = () => {
    expect(fs.readFileSync(join(root, "web-ui/web.config"), "utf8")).toBe("preserved routing");
    expect(fs.readFileSync(join(root, "web-ui/.env"), "utf8")).toBe(
      "SYNTHETIC_VALUE=retained-only",
    );
    expect(fs.readFileSync(join(root, "web-ui/attachments/original.txt"), "utf8")).toBe(
      "original attachment",
    );
    expect(fs.readFileSync(join(root, "web-ui/unknown.txt"), "utf8")).toBe("unknown original");
  };
  return { base, root, config, put, prepare, protectedFiles };
}
it("updates two complete static releases, restores a saved release and preserves every configured/unknown file", async () => {
  const f = await fixture(),
    a = f.prepare("first");
  expect(front.apply(a.context, a.plan).files).toBe(2);
  const b = f.prepare("second");
  expect(front.apply(b.context, b.plan).sha256).toBe(b.context.frontendArtifact.sha256);
  expect(fs.readFileSync(join(f.root, "web-ui/index.html"), "utf8")).toContain("second.js");
  front.recover(b.context, b.plan);
  expect(front.verify(a.context, a.plan).sha256).toBe(a.context.frontendArtifact.sha256);
  expect(fs.existsSync(join(f.root, "web-ui/assets/second.js"))).toBe(true);
  const restored = f.prepare("first");
  expect(front.apply(restored.context, restored.plan).sha256).toBe(
    a.context.frontendArtifact.sha256,
  );
  f.protectedFiles();
});
it("recovers an interrupted entry replacement after new assets were installed and rejects independent edits", async () => {
  const f = await fixture(),
    a = f.prepare("first");
  front.apply(a.context, a.plan);
  const b = f.prepare("second"),
    rename = fs.renameSync;
  const spy = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(to) === join(f.root, "web-ui/index.html"))
      throw Error("synthetic rename interruption");
    return rename(from, to);
  });
  expect(() => front.apply(b.context, b.plan)).toThrow("synthetic rename interruption");
  spy.mockRestore();
  expect(fs.existsSync(join(f.root, "web-ui/assets/second.js"))).toBe(true);
  front.recover(b.context, b.plan);
  front.verify(a.context, a.plan);
  f.protectedFiles();
  const c = f.prepare("third");
  front.apply(c.context, c.plan);
  f.put(join(f.root, "web-ui/index.html"), "independent edit");
  expect(() => front.recover(c.context, c.plan)).toThrow();
  expect(fs.readFileSync(join(f.root, "web-ui/index.html"), "utf8")).toBe("independent edit");
});
it("restores an absent entry without deleting the operator-owned new bytes", async () => {
  const f = await fixture();
  fs.unlinkSync(join(f.root, "web-ui/index.html"));
  const a = f.prepare("first");
  front.apply(a.context, a.plan);
  front.recover(a.context, a.plan);
  expect(fs.existsSync(join(f.root, "web-ui/index.html"))).toBe(false);
  expect(fs.readFileSync(join(a.runtime, "frontend-recovered/index.html"), "utf8")).toContain(
    "first.js",
  );
  expect(front.recoveryState(a.context, a.plan).binding).toBeNull();
  f.protectedFiles();
});
it("rejects changed preimages, tampered saved bytes, protected paths, duplicate paths and traversal before replacing a live file", async () => {
  const f = await fixture(),
    a = f.prepare("first");
  f.put(join(f.root, "web-ui/index.html"), "independent original edit");
  expect(() => front.apply(a.context, a.plan)).toThrow();
  expect(fs.readFileSync(join(f.root, "web-ui/index.html"), "utf8")).toBe(
    "independent original edit",
  );
  const d = JSON.parse(
    fs.readFileSync(
      join(a.context.staging, "payload", a.context.frontendArtifact.descriptor),
      "utf8",
    ),
  );
  for (const bad of ["../escape", ".env", "Web.Config", "attachments/customer.txt"]) {
    const data = Buffer.from(
      JSON.stringify({ ...d, files: [{ path: bad, sha256: "a".repeat(64), bytes: 1 }] }),
    );
    expect(() => front.definition(data, files.sha(data))).toThrow();
  }
  const duplicate = Buffer.from(JSON.stringify({ ...d, files: [...d.files, d.files[0]] }));
  expect(() => front.definition(duplicate, files.sha(duplicate))).toThrow();
  f.protectedFiles();
});
