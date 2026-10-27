import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile),
  helper = resolve("../../deployment/servix/Read-PromotionEnvironment.cjs"),
  sha = (value: string) => createHash("sha256").update(value).digest("hex");
it("preserves private values through the real PowerShell 5.1 file boundary without logging them", async () => {
  const base = await mkdtemp(join(tmpdir(), "promotion-environment-"));
  const root = join(base, "project with spaces"),
    password = 'synthetic-only "quotes" $HOME & | नमस्ते🚀',
    bytes = JSON.stringify({
      DB_HOST: "fixture-host",
      DB_NAME: "fixture_db",
      DB_USER: "fixture_user",
      DB_PASSWORD: password,
    });
  try {
    await mkdir(join(root, "backend/node_modules/dotenv"), { recursive: true });
    await writeFile(join(root, "backend/package.json"), '{"name":"fixture"}');
    await writeFile(
      join(root, "backend/node_modules/dotenv/index.js"),
      "exports.parse=b=>JSON.parse(b);",
    );
    await writeFile(join(root, "backend/.env"), bytes);
    if (process.platform === "win32") {
      const script = join(base, "private-boundary.ps1"),
        backup = join(base, "PromotionBackup.cjs");
      await writeFile(
        backup,
        "let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>text+=v);process.stdin.on('end',()=>{const p=JSON.parse(text).password;process.stdout.write(JSON.stringify({status:'PASS',passwordSha256:require('node:crypto').createHash('sha256').update(p).digest('hex')}));});",
      );
      await writeFile(
        script,
        `param([string]$Node,[string]$Helper,[string]$Root,[string]$Expected,[string]$Worker,[string]$Backup)
$ErrorActionPreference='Stop';$raw=& $Node $Helper $Root $Expected 2>$null
if($LASTEXITCODE -ne 0){throw 'Private fixture failed'}
Add-Type -AssemblyName System.Web.Extensions
$privateSerializer=[System.Web.Script.Serialization.JavaScriptSerializer]::new()
$value=$privateSerializer.DeserializeObject(($raw -join ''));$raw=$null
$hash=[Security.Cryptography.SHA256]::Create()
try{$digest=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($value.password)))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
$privateJson=$privateSerializer.Serialize($value);$value=$null;$module=Import-Module $Worker -Force -PassThru
$roundTrip=(& $module {param($node,$script,$json) Invoke-PromotionNode $node $script @() $json} $Node $Backup $privateJson)|ConvertFrom-Json;$privateJson=$null
if($roundTrip.status -cne 'PASS' -or $roundTrip.passwordSha256 -cne $digest){throw 'Private wrapper values differ'}
[Console]::Out.Write((@{status='PASS';passwordSha256=$digest;backupWrapperVerified=$true}|ConvertTo-Json -Compress))
`,
      );
      // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for environment index signatures.
      const windowsRoot = process.env["WINDIR"];
      if (!windowsRoot) throw Error("Native PowerShell directory unavailable");
      const result = await run(
        join(windowsRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "RemoteSigned",
          "-File",
          script,
          "-Node",
          process.execPath,
          "-Helper",
          helper,
          "-Root",
          root,
          "-Expected",
          sha(bytes),
          "-Worker",
          resolve("../../deployment/servix/PromotionWorker.psm1"),
          "-Backup",
          backup,
        ],
        {
          windowsHide: true,
          maxBuffer: 4096,
          env: Object.fromEntries(
            Object.entries(process.env).filter(([k]) => k.toLowerCase() !== "psmodulepath"),
          ),
        },
      );
      expect(JSON.parse(result.stdout)).toEqual({
        status: "PASS",
        passwordSha256: sha(password),
        backupWrapperVerified: true,
      });
      expect(result.stdout + result.stderr).not.toContain(password);
    } else {
      const result = await run(process.execPath, [helper, root, sha(bytes)]);
      expect(JSON.parse(result.stdout).password).toBe(password);
    }
    const failure = await run(process.execPath, [helper, root, "0".repeat(64)]).catch((e) => e);
    expect(failure.code).toBe(1);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).not.toContain(password);
    expect(failure.stderr).toContain("Private environment binding unavailable");
  } finally {
    expect(dirname(resolve(base))).toBe(resolve(tmpdir()));
    expect(base).toContain("promotion-environment-");
    await rm(base, { recursive: true, force: true });
  }
});
