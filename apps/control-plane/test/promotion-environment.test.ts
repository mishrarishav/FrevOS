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
it.skipIf(process.platform !== "win32")(
  "retains managed and frontend identity through native dictionary, CLIXML and JSON shapes",
  async () => {
    const base = await mkdtemp(join(tmpdir(), "promotion-observation-"));
    try {
      const script = join(base, "observation.ps1");
      await writeFile(
        script,
        `param([string]$Worker)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$module=Import-Module $Worker -Force -PassThru
$expected='pm_'+('a'*32)
$managed=@{taskAlreadyExists=$true;managed=@{id=$expected;taskXmlSha256=('b'*64)}}
$roundTrip=[Management.Automation.PSSerializer]::Deserialize([Management.Automation.PSSerializer]::Serialize($managed))
$json=$managed|ConvertTo-Json -Depth 5|ConvertFrom-Json
foreach($observation in @($managed,$roundTrip,$json)){
 $value=& $module {param($v) Get-PromotionObservedManaged $v} $observation
 if($value.id -cne $expected -or $value.taskXmlSha256 -cne ('b'*64)){throw 'Managed binding lost'}
}
foreach($observation in @(@{taskAlreadyExists=$false},[pscustomobject]@{taskAlreadyExists=$false})){
 if($null -ne (& $module {param($v) Get-PromotionObservedManaged $v} $observation)){throw 'Unexpected adoption binding'}
}
$rejected=0
foreach($observation in @(@{taskAlreadyExists=$true},[pscustomobject]@{taskAlreadyExists=$true},@{taskAlreadyExists=$false;managed=@{id=$expected}},@{taskAlreadyExists=$true;managed=@{id='invalid'}})){
 try{[void](& $module {param($v) Get-PromotionObservedManaged $v} $observation)}catch{$rejected++;continue}
 throw 'Inconsistent managed evidence accepted'
}
$front=@{frontendDigest=('c'*64);frontendVerified=$true}
foreach($receipt in @($front,[Management.Automation.PSSerializer]::Deserialize([Management.Automation.PSSerializer]::Serialize($front)),($front|ConvertTo-Json|ConvertFrom-Json))){
 $value=& $module {param($v) Get-PromotionObservedFrontend $v ('c'*64) $true} $receipt
 if($value.frontendDigest -cne ('c'*64) -or -not $value.frontendVerified){throw 'Frontend binding lost'}
}
if($null -ne (& $module {Get-PromotionObservedFrontend @{} '' $false})){throw 'Backend-only result changed'}
$frontendRejected=0
foreach($receipt in @(@{},@{frontendDigest=('c'*64)},@{frontendDigest=('c'*64);frontendVerified=$false},@{frontendDigest=('d'*64);frontendVerified=$true},@{frontendDigest=('c'*64);frontendVerified='true'})){
 try{[void](& $module {param($v) Get-PromotionObservedFrontend $v ('c'*64) $true} $receipt)}catch{$frontendRejected++;continue}
 throw 'Incomplete frontend proof accepted'
}
[Console]::Out.Write((@{status='PASS';verifiedShapes=3;rejected=$rejected;frontendShapes=3;frontendRejected=$frontendRejected}|ConvertTo-Json -Compress))
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
          "-Worker",
          resolve("../../deployment/servix/PromotionWorker.psm1"),
        ],
        { windowsHide: true, maxBuffer: 4096 },
      );
      expect(JSON.parse(result.stdout)).toEqual({
        status: "PASS",
        verifiedShapes: 3,
        rejected: 4,
        frontendShapes: 3,
        frontendRejected: 5,
      });
    } finally {
      expect(dirname(resolve(base))).toBe(resolve(tmpdir()));
      expect(base).toContain("promotion-observation-");
      await rm(base, { recursive: true, force: true });
    }
  },
);
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
        "let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>text+=v);process.stdin.on('end',()=>{const v=JSON.parse(text),keys=['directory','scopeSha256','clientRoot','clientSha256','dumpSha256','version','environment'];if(Object.keys(v).sort().join()!=keys.sort().join()||typeof v.clientRoot!=='string'||v.environment.port!==3306)process.exit(2);process.stdout.write(JSON.stringify({status:'PASS',passwordSha256:require('node:crypto').createHash('sha256').update(v.environment.password).digest('hex')}));});",
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
$database=@{host=$value.host;port=[int]$value.port;database=$value.database;user=$value.user;password=$value.password};$value=$null;$module=Import-Module $Worker -Force -PassThru
$client=@{root=(Join-Path $Root 'client with spaces');clientSha256=('a'*64);dumpSha256=('b'*64);version='8.0.28'}
$scopeFile=Join-Path $Root 'backend/.env'
$scopeHash=(Get-FileHash -LiteralPath $scopeFile).Hash.ToLowerInvariant()
$privateJson=& $module {param($directory,$scope,$client,$database) ConvertTo-PromotionBackupInput $directory $scope $client $database} (Join-Path $Root 'private backup') $scopeHash $client $database
$database.password=$null;$database=$null
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
