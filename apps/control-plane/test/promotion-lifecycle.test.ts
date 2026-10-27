import { execFile } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url),
  files = require("../../../deployment/servix/PromotionFiles.cjs"),
  front = require("../../../deployment/servix/FrontendArtifact.cjs"),
  run = promisify(execFile);
it.skipIf(process.platform !== "win32")(
  "runs the native lifecycle with real files/public bytes and simulated task/CIM boundaries: adoption, managed update, failed frontend recovery and next update",
  async () => {
    const base = await mkdtemp(join(tmpdir(), "promotion-lifecycle-"));
    const root = join(base, "application"),
      stateFile = join(base, "simulated-os.json");
    const put = (file: string, value: string | Buffer) => {
      fs.mkdirSync(dirname(file), { recursive: true });
      fs.writeFileSync(file, value);
    };
    let corruptThird = false;
    const server = createServer((req, res) => {
      const rel =
        decodeURIComponent(new URL(req.url || "/", "http://fixture.invalid").pathname).replace(
          /^\//,
          "",
        ) || "index.html";
      if (corruptThird && rel === "assets/third.js") {
        res.end("synthetic corrupt public bytes");
        return;
      }
      const file = files.beneath(root, `frontend/${rel}`);
      if (!fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.end(fs.readFileSync(file));
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const port = (server.address() as { port: number }).port;
    try {
      put(
        join(root, "backend/package.json"),
        '{"name":"fixture-backend","dependencies":{"dotenv":"1.0.0"}}',
      );
      put(
        join(root, "backend/node_modules/dotenv/package.json"),
        '{"name":"dotenv","version":"1.0.0","main":"index.js"}',
      );
      put(
        join(root, "backend/node_modules/dotenv/index.js"),
        "exports.parse=b=>Object.fromEntries(b.toString().trim().split('\\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}));",
      );
      put(join(root, "querysafe/package.json"), '{"name":"fixture-sibling"}');
      const environment = `PORT=${port}\nNODE_ENV=production\nDB_HOST=fixture-only\nDB_NAME=fixture\nDB_USER=fixture\n`;
      put(join(root, "backend/.env"), environment);
      put(join(root, "backend/src/index.js"), "retained source fixture");
      put(join(root, "querysafe/src/index.js"), "retained sibling source");
      put(join(root, "backend/uploads/original.txt"), "original upload");
      put(join(root, "frontend/index.html"), "original frontend");
      put(join(root, "frontend/web.config"), "original routing");
      put(
        stateFile,
        JSON.stringify({
          running: true,
          pid: 12001,
          created: new Date().toISOString(),
          command: `"${process.execPath}" src/index.js`,
          taskXml: null,
          registrationModes: [],
        }),
      );
      const known: unknown[] = [];
      let serial = 0;
      const build = (version: string) => {
        const n = ++serial,
          staging = join(base, `staging-${n}`),
          payload = join(staging, "payload");
        const body = Buffer.from(`module.exports=${JSON.stringify(version)};`),
          entry = `backend/.releases/${files.sha(body)}/server.cjs`;
        put(join(payload, entry), body);
        const definition = Buffer.from(
          JSON.stringify({
            version: 1,
            kind: "node-backend-bundle",
            entry,
            sha256: files.sha(body),
            bytes: body.length,
            nodeTarget: "node18",
            dependencies: [{ project: "backend", name: "dotenv", range: "1.0.0" }],
            modules: ["backend/src/index.js", "querysafe/src/index.js"],
            runtimeProjects: ["backend", "querysafe"],
            containsEnvironment: false,
            containsUserFiles: false,
          }),
        );
        const descriptorSha256 = files.sha(definition),
          descriptor = `backend/.releases/${descriptorSha256}/artifact.json`;
        put(join(payload, descriptor), definition);
        put(join(payload, "frontend/index.html"), `<script src="/assets/${version}.js"></script>`);
        put(
          join(payload, `frontend/assets/${version}.js`),
          `window.version=${JSON.stringify(version)}`,
        );
        const frontend = {
          root: "frontend",
          entry: "index.html",
          routing: "same-origin",
          preservedFiles: ["web.config"],
          applicationUrl: `http://127.0.0.1:${port}/`,
        };
        const frontendArtifact = front.create(payload, frontend),
          operatorHashes: Record<string, string> = {};
        for (const name of [
          "Invoke-PromotionTarget.ps1",
          "BackendArtifact.cjs",
          "BackendArtifactSelection.psm1",
          "ProductionBackendRuntime.cjs",
          "Run-SavedBackend.ps1",
          "PromotionFiles.cjs",
          "FrontendArtifact.cjs",
          "ManagedRuntime.cjs",
          "PublishedRelease.cjs",
        ]) {
          const bytes = fs.readFileSync(resolve("../../deployment/servix", name));
          put(join(staging, name), bytes);
          operatorHashes[name] = files.sha(bytes);
        }
        put(
          join(staging, "BatchLogon.psm1"),
          "function Get-CurrentBatchLogon {return @{ready=$true;denied=$false}};function Grant-CurrentBatchLogon {param($Sid,$Allowed) return @{assigned=$false}};Export-ModuleMember -Function Get-CurrentBatchLogon,Grant-CurrentBatchLogon",
        );
        operatorHashes["BatchLogon.psm1"] = files.hash(join(staging, "BatchLogon.psm1"));
        return {
          version: 1,
          id: `pm_${String(n * 2).padStart(32, "0")}`,
          target: {
            root,
            node: process.execPath,
            nodeVersion: process.version,
            port,
            computer: Reflect.get(process.env, "COMPUTERNAME"),
            workspaceId: "ws_fixture",
            profileId: "fixture-production",
            taskName: "DevSetu-Fixture-Never-Registered",
            healthUrl: `http://127.0.0.1:${port}/api/health`,
            preservedPaths: ["backend/.env", "backend/uploads"],
            additionalProtectedRoots: [],
            protectedConfigurationFiles: [],
            managedUpdates: true,
            releaseMode: "application",
            frontend,
          },
          staging,
          operatorHashes,
          knownManaged: [...known],
          frontendArtifact,
          descriptor,
          descriptorSha256,
        };
      };
      const invoke = async (context: unknown, action: string) => {
        const ctx = context as { staging: string };
        const file = join(ctx.staging, `context-${action}.json`);
        put(file, JSON.stringify(context));
        const r = await run(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "RemoteSigned",
            "-File",
            resolve("test/fixtures/PromotionLifecycle.ps1"),
            "-ContextFile",
            file,
            "-StateFile",
            stateFile,
            "-Action",
            action,
          ],
          {
            windowsHide: true,
            timeout: 45000,
            maxBuffer: 4 * 1024 * 1024,
            env: {
              ...process.env,
              PSModulePath: join(
                String(Reflect.get(process.env, "WINDIR")),
                "System32/WindowsPowerShell/v1.0/Modules",
              ),
            },
          },
        );
        return JSON.parse(r.stdout.trim());
      };
      const cycle = async (version: string) => {
        const context = build(version),
          observation = await invoke(context, "Observe");
        const activation = {
          ...context,
          id: `pm_${String(serial * 2 + 1).padStart(32, "0")}`,
          observation,
          ownerSid: observation.process.ownerSid,
          snapshotSha256: observation.files.snapshotSha256,
          allowBatchLogon: false,
        };
        const result = await invoke(activation, "Activate");
        if (result.status === "succeeded")
          known.push({
            id: activation.id,
            runtime: result.runtime,
            configurationSha256: result.configurationSha256,
            launcherArguments: result.launcherArguments,
            ownerSid: activation.ownerSid,
            descriptor: context.descriptor,
            descriptorSha256: context.descriptorSha256,
            launcherSha256: context.operatorHashes["Run-SavedBackend.ps1"],
            frontendDigest: result.frontendDigest,
          });
        return { result, observation, activation };
      };
      const a = await cycle("first");
      expect(a.result.status).toBe("succeeded");
      expect(a.observation.taskAlreadyExists).toBe(false);
      const b = await cycle("second");
      expect(b.result.status).toBe("succeeded");
      expect(b.observation.managed.id).toBe(a.activation.id);
      corruptThird = true;
      const c = await cycle("third");
      expect(c.result.status).toBe("recovered");
      expect(fs.readFileSync(join(root, "frontend/index.html"), "utf8")).toContain("second.js");
      expect(
        JSON.parse(
          fs.readFileSync(join(root, "backend/.runtime/devsetu-backend-artifact.json"), "utf8"),
        ).manifestSha256,
      ).toBe(b.activation.descriptorSha256);
      const d = await cycle("fourth");
      expect(d.result.status).toBe("succeeded");
      expect(d.observation.managed.id).toBe(b.activation.id);
      expect(JSON.parse(fs.readFileSync(stateFile, "utf8")).registrationModes).toEqual([
        2, 4, 4, 4, 4,
      ]);
      const osState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      put(stateFile, JSON.stringify({ ...osState, failAfterRegistration: true }));
      const interrupted = await cycle("registration-interrupted");
      expect(interrupted.result.status).toBe("recovered");
      expect(fs.readFileSync(join(root, "frontend/index.html"), "utf8")).toContain("fourth.js");
      const next = await cycle("after-interruption");
      expect(next.result.status).toBe("succeeded");
      expect(next.observation.managed.id).toBe(d.activation.id);
      expect(fs.readFileSync(join(root, "backend/.env"), "utf8")).toBe(environment);
      expect(fs.readFileSync(join(root, "backend/uploads/original.txt"), "utf8")).toBe(
        "original upload",
      );
      expect(fs.readFileSync(join(root, "frontend/web.config"), "utf8")).toBe("original routing");
    } finally {
      await new Promise<void>((ok, fail) => server.close((e) => (e ? fail(e) : ok())));
      expect(dirname(resolve(base))).toBe(resolve(tmpdir()));
      expect(base).toContain("promotion-lifecycle-");
      await rm(base, { recursive: true, force: true });
    }
  },
  120000,
);
