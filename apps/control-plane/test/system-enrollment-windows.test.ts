import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir, homedir, userInfo } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { SystemDiscovery } from "../src/system-discovery.js";

const run = promisify(execFile);
const source = fileURLToPath(new URL("../../../deployment/servix/", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/system-enrollment-task.ps1", import.meta.url));
const enrollment = createRequire(import.meta.url)(join(source, "SystemEnrollment.cjs"));
const { windowsEnvironment } = createRequire(import.meta.url)(join(source, "SetupSession.cjs"));
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function input(file: string, args: string[], value: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
      env: windowsEnvironment(),
    });
    let diagnostic = "";
    child.stderr.on("data", (bytes) => {
      if (diagnostic.length < 32768) diagnostic += bytes;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("Fixture command timeout"));
    }, 45000);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      const safe = [
        "Resume fields differ",
        "Protected enrollment differs",
        "Runtime changed",
        "Task identity differs",
        "Linked enrollment",
        "PropertyNotFoundStrict",
        "System enrollment fields differ",
      ].find((s) => diagnostic.includes(s));
      const category = diagnostic.match(
        /FullyQualifiedErrorId\s*:\s*([A-Za-z][A-Za-z0-9.,]*)/,
      )?.[1];
      const line = diagnostic.match(/:([0-9]+) char:/)?.[1];
      code === 0
        ? resolve()
        : reject(
            Error(
              "Fixture command failed: " +
                file.split(/[\\/]/).at(-1) +
                " " +
                code +
                " " +
                (safe || category || "unavailable") +
                " line=" +
                line,
            ),
          );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(value);
  });
}
// Interactive per-user tasks cannot execute as CI service identities. The actual
// Windows user-context run is recorded separately from the service build gate.
it.skipIf(
  process.platform !== "win32" ||
    ["SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE"].includes(userInfo().username.toUpperCase()),
)(
  "runs downloaded metadata-only runtime through real DPAPI and a Limited scheduled task, with no Git or project",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "devsetu-system-runtime-"));
    const bundle = join(root, "downloaded");
    await mkdir(bundle);
    const shell = join(process.env["WINDIR"]!, "System32/WindowsPowerShell/v1.0/powershell.exe");
    const connectors = new DeveloperConnectorStore(
      join(root, "records"),
      async (a) => a === "usr_fixture",
      {
        head: async () => {
          throw Error("Git must not run");
        },
        importBundle: async () => {
          throw Error("Git must not run");
        },
      },
      async () => {},
    );
    const discovery = new SystemDiscovery(join(root, "discovery"), connectors, async () => ({
      projects: [],
      clients: [],
    }));
    const paired = await connectors.pair("usr_fixture", {
      version: 1,
      mode: "system",
      name: "Isolated enrollment fixture",
    });
    const installRoot = join(process.env["LOCALAPPDATA"]!, "FrevOS/Connector", paired.deviceId);
    let observations = 0;
    const server = createServer(async (req, res) => {
      try {
        let text = "";
        for await (const chunk of req) text += chunk;
        const body = JSON.parse(text),
          credential = req.headers.authorization!.slice(7);
        let result: unknown;
        if (req.url === "/v1/connector/heartbeat")
          result = await connectors.heartbeat(credential, body);
        else if (req.url === "/v1/connector/discovery/policy")
          result = await discovery.policyForConnector(credential);
        else if (req.url === "/v1/connector/discovery/observe") {
          result = await discovery.observe(credential, body);
          observations++;
        } else if (req.url === "/v1/connector/discovery/folders/claim")
          result = await discovery.claimFolders(credential);
        else throw Error("Unexpected runtime capability");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400);
        res.end("{}");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Fixture server unavailable");
    const origin = "http://127.0.0.1:" + address.port;
    try {
      const native = join(bundle, "FrevOS.FolderPicker.exe");
      await run(
        join(process.env["WINDIR"]!, "Microsoft.NET/Framework64/v4.0.30319/csc.exe"),
        [
          "/nologo",
          "/target:winexe",
          "/reference:System.Windows.Forms.dll",
          "/reference:System.Drawing.dll",
          "/reference:System.Web.Extensions.dll",
          "/out:" + native,
          join(source, "RepositoryPicker.cs"),
        ],
        { windowsHide: true },
      );
      const hashes: Record<string, string> = {};
      for (const name of enrollment.runtimeFiles as string[]) {
        const bytes = await readFile(
          name === "node.exe"
            ? process.execPath
            : name === "FrevOS.FolderPicker.exe"
              ? native
              : join(source, name),
        );
        hashes[name] = digest(bytes);
        await writeFile(join(bundle, name), bytes);
        if (name.endsWith(".ps1") || name.endsWith(".psm1"))
          await writeFile(
            join(bundle, name) + ":Zone.Identifier",
            "[ZoneTransfer]\r\nZoneId=3\r\n",
          );
      }
      await writeFile(
        join(bundle, "system-runtime-manifest.json"),
        JSON.stringify({ version: 1, files: hashes }),
      );
      await enrollment.installRuntime(
        {
          version: 1,
          mode: "system",
          server: origin,
          allowInternalHttp: true,
          deviceId: paired.deviceId,
          credential: paired.credential,
          monitoringRoot: homedir(),
          fileActivity: false,
          accountName: "synthetic-enrollment-fixture",
        },
        { bundle, protect: (folder: string) => input(native, ["--protect-install"], folder) },
      );
      const deadline = Date.now() + 35000;
      while (!observations && Date.now() < deadline) await new Promise((r) => setTimeout(r, 300));
      const task = JSON.parse(
        (
          await run(
            shell,
            [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              fixture,
              "-DeviceId",
              paired.deviceId,
            ],
            { windowsHide: true },
          )
        ).stdout,
      );
      expect(task).toMatchObject({ present: true, state: "Running", runLevel: "Limited" });
      expect(observations).toBeGreaterThan(0);
      const state = await discovery.state("usr_fixture", paired.deviceId);
      expect(state.systems[0]).toMatchObject({ online: true, profileId: null, source: null });
      expect(state.systems[0]?.observation?.system.tools).toEqual([]);
      expect(state.systems[0]?.observation?.coverage.status).toBe("disabled");
      expect(
        (await readFile(join(installRoot, "device.dpapi"))).includes(
          Buffer.from(paired.credential),
        ),
      ).toBe(false);
      await expect(
        readFile(join(installRoot, "Run-Connector.ps1:Zone.Identifier")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(bundle, "Run-Connector.ps1:Zone.Identifier"), "utf8")).toContain(
        "ZoneId=3",
      );
      // Resume uses the same protected credential/task and cannot bind a different account.
      const resume = join(root, "Resume-SystemConnector.ps1");
      await writeFile(resume, await readFile(join(source, "Resume-SystemConnector.ps1")));
      await input(
        shell,
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", resume],
        JSON.stringify({
          deviceId: paired.deviceId,
          server: origin,
          username: "synthetic-enrollment-fixture",
          fileActivity: false,
        }),
      );
      await expect(
        input(
          shell,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", resume],
          JSON.stringify({
            deviceId: paired.deviceId,
            server: origin,
            username: "different-account",
            fileActivity: false,
          }),
        ),
      ).rejects.toThrow("Fixture command failed");
      expect((await connectors.list("usr_fixture")).length).toBe(1);
    } finally {
      await run(
        shell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          fixture,
          "-DeviceId",
          paired.deviceId,
          "-Operation",
          "remove",
        ],
        { windowsHide: true },
      );
      await new Promise<void>((r) => server.close(() => r()));
      connectors.close();
      expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
      expect(root).toContain("devsetu-system-runtime-");
      await rm(root, { recursive: true, force: true });
    }
  },
  100000,
);
