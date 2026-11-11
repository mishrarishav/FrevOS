"""One fixed, hash-bound Reviews migration CLI task. Secrets arrive only on stdin."""
import base64
import hashlib
import io
import ipaddress
import json
import ntpath
import pathlib
import re
import socket
import sys
import time
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

KIND = "devsetu.reviews.central-migration.v1"
WHEEL_SHA256 = "3e5349c1209cdd3b90bff6f8b61c0d89aea0f3dbba6ad02ad254b9d3ef2301d0"
DIGEST = re.compile(r"[a-f0-9]{64}")


def validate_config(config):
    required = {"host", "installationRoot", "id", "action", "expectedComputerName", "planSha256", "cliSha256", "username", "password"}
    if not isinstance(config, dict) or set(config) - (required | {"version", "archiveSha256", "artifactId"}) or not required <= set(config):
        raise ValueError("scope")
    if config.get("version", 1) != 1 or config["action"] not in ("prepare", "inspect", "plan", "apply"):
        raise ValueError("scope")
    if config["action"] == "prepare":
        if not isinstance(config.get("archiveSha256"), str) or not DIGEST.fullmatch(config["archiveSha256"]):
            raise ValueError("archive-identity")
    elif "archiveSha256" in config:
        raise ValueError("scope")
    address = ipaddress.IPv4Address(config["host"])
    if not any(address in ipaddress.ip_network(network) for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")):
        raise ValueError("scope")
    root = config["installationRoot"]
    if not isinstance(root, str) or len(root) > 200 or not re.fullmatch(r"[A-Z]:\\[A-Za-z0-9 _.-]+(?:\\[A-Za-z0-9 _.-]+)*", root):
        raise ValueError("scope")
    if any(part in (".", "..") or part.endswith((".", " ")) for part in root[3:].split("\\")):
        raise ValueError("scope")
    if not re.fullmatch(r"rmi_[a-f0-9]{32}", config["id"]) or not re.fullmatch(r"[A-Za-z0-9-]{1,63}", config["expectedComputerName"]):
        raise ValueError("scope")
    artifact_id = config.get("artifactId", config["id"])
    if not isinstance(artifact_id, str) or not re.fullmatch(r"rmi_[a-f0-9]{32}", artifact_id):
        raise ValueError("artifact-scope")
    if config["action"] == "prepare" and artifact_id != config["id"]:
        raise ValueError("artifact-scope")
    if not all(isinstance(config[key], str) and DIGEST.fullmatch(config[key]) for key in ("planSha256", "cliSha256")):
        raise ValueError("identity")
    if not isinstance(config["username"], str) or not re.fullmatch(r"[A-Za-z0-9_.@\\$-]{1,256}", config["username"]):
        raise ValueError("credential-shape")
    if not isinstance(config["password"], str) or not 1 <= len(config["password"]) <= 4096 or any(char in config["password"] for char in "\x00\r\n"):
        raise ValueError("credential-shape")
    stage = ntpath.join(root, "operator", "reviews-migrations", config["id"])
    artifact_stage = ntpath.join(root, "operator", "reviews-migrations", artifact_id)
    paths = {
        "directory": stage,
        "plan": ntpath.join(stage, "plan.json"),
        "cli": ntpath.join(artifact_stage, "package", "dist", "review-central-migrate.js"),
        "command": ntpath.join(root, "node", "node-v24.19.0-win-x64", "node.exe"),
        "nodeCommand": ntpath.join(root, "node", "node-v24.19.0-win-x64", "node.exe"),
        "receipt": ntpath.join(stage, "results", config["action"] + "-result.json"),
        "console": ntpath.join(stage, "results", config["action"] + "-console.json"),
        "stderr": ntpath.join(stage, "results", config["action"] + "-stderr.private.log"),
        "task": "\\DevSetu-ReviewMigration-" + config["id"] + "-" + config["action"],
    }
    if config["action"] == "prepare":
        script = prepare_script(config, paths)
    else:
        script = node_action_script(config, paths)
    paths["command"] = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    paths["fixedArguments"] = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -EncodedCommand " + base64.b64encode(script.encode("utf-16le")).decode("ascii")
    return paths


def validate_plan(config, raw):
    if hashlib.sha256(raw).hexdigest() != config["planSha256"]:
        raise ValueError("plan-identity")
    plan = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(plan, dict) or plan.get("version") != 1 or plan.get("kind") != KIND or plan.get("id") != config["id"]:
        raise ValueError("plan-scope")
    if plan.get("installationRoot") != config["installationRoot"] or plan.get("expectedComputerName") != config["expectedComputerName"]:
        raise ValueError("plan-target")
    if plan.get("artifactId", plan["id"]) != config.get("artifactId", config["id"]):
        raise ValueError("plan-artifact-scope")
    target = plan.get("expectedDatabase", {})
    if target.get("host") not in ("127.0.0.1", "::1") or not isinstance(target.get("port"), int) or not 1 <= target["port"] <= 65535:
        raise ValueError("plan-database")
    for key in ("database", "runtimeRole"):
        if not isinstance(target.get(key), str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", target[key]):
            raise ValueError("plan-database")
    for key in ("sourceSha256", "mappingSha256", "sqlSha256"):
        if key in plan and (not isinstance(plan[key], str) or not DIGEST.fullmatch(plan[key])):
            raise ValueError("plan-artifact")
        if config["action"] in ("plan", "apply") and key not in plan:
            raise ValueError("plan-artifact")
    return plan


def prepare_script(config, paths):
    # Every substituted field has already passed a closed path, identifier or hex grammar.
    prefix = "\n".join("$" + key + "='" + value + "'" for key, value in {
        "stageRoot": paths["directory"], "planPath": paths["plan"], "receiptPath": paths["receipt"],
        "cliPath": paths["cli"], "planDigest": config["planSha256"], "cliDigest": config["cliSha256"],
        "archiveDigest": config["archiveSha256"], "migrationId": config["id"], "expectedComputer": config["expectedComputerName"],
    }.items())
    return prefix + r'''
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
function Assert-PlainPath([string]$path) {
  for($current=$path;$current;$current=[IO.Path]::GetDirectoryName($current)) {
    if(Test-Path -LiteralPath $current) {
      $item=Get-Item -LiteralPath $current -Force
      if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'linked-path'}
    }
  }
}
function Hash-Stream($stream) {
  $algorithm=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
  finally{$algorithm.Dispose()}
}
function Hash-File([string]$path) {
  $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try{return Hash-Stream $stream}finally{$stream.Dispose()}
}
$archivePath=Join-Path $stageRoot 'package.zip'
$packagePath=Join-Path $stageRoot 'package'
$resultDirectory=Join-Path $stageRoot 'results'
$archiveStream=$null
$zip=$null
try {
  if($env:COMPUTERNAME -cne $expectedComputer){throw 'computer-identity'}
  foreach($path in @($stageRoot,$planPath,$archivePath,$resultDirectory)){Assert-PlainPath $path}
  if(Test-Path -LiteralPath $packagePath){throw 'package-already-exists'}
  if(Test-Path -LiteralPath $receiptPath){throw 'receipt-already-exists'}
  if((Get-Item -LiteralPath $planPath).Length -gt 32768){throw 'plan-capacity'}
  if((Hash-File $planPath) -cne $planDigest){throw 'plan-identity'}
  $archiveStream=[IO.File]::Open($archivePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  if($archiveStream.Length -gt 67108864){throw 'archive-capacity'}
  if((Hash-Stream $archiveStream) -cne $archiveDigest){throw 'archive-identity'}
  $archiveStream.Position=0
  Add-Type -AssemblyName System.IO.Compression
  $zip=New-Object IO.Compression.ZipArchive($archiveStream,[IO.Compression.ZipArchiveMode]::Read,$true)
  if($zip.Entries.Count -gt 10000){throw 'entry-capacity'}
  $seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $validated=New-Object 'Collections.Generic.List[object]'
  [long]$total=0
  foreach($entry in $zip.Entries) {
    $name=$entry.FullName
    if(!$name -or $name.Length -gt 1024 -or $name -match '[\x00-\x1f\x7f\\:<>"|?*]' -or $name.StartsWith('/')){throw 'entry-path'}
    $directory=$name.EndsWith('/')
    $clean=$name.TrimEnd('/')
    if(!$seen.Add($clean)){throw 'duplicate-entry'}
    $parts=$clean.Split('/')
    foreach($part in $parts) {
      if(!$part -or $part -in @('.','..') -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part -match '^\.env(?:\.|$)' -or $part -match '^(?i:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)'){throw 'entry-segment'}
    }
    $allowed=$clean.StartsWith('package/dist/',[StringComparison]::Ordinal) -or $clean.StartsWith('package/node_modules/',[StringComparison]::Ordinal) -or $clean -ceq 'package/package.json' -or $clean -ceq 'package/migrations/0007_review_workspace_state.sql'
    if($directory -and $clean -cin @('package','package/dist','package/node_modules','package/migrations')){$allowed=$true}
    if(!$allowed){throw 'entry-scope'}
    [long]$attributes=$entry.ExternalAttributes
    $kind=($attributes -shr 16) -band 61440
    if(($attributes -band 1024) -ne 0 -or $kind -notin @(0,16384,32768) -or ($kind -eq 16384 -and !$directory) -or ($kind -eq 32768 -and $directory)){throw 'entry-link-or-kind'}
    if($entry.Length -gt 33554432 -or ($directory -and $entry.Length -ne 0)){throw 'file-capacity'}
    $total+=$entry.Length
    if($total -gt 134217728){throw 'expanded-capacity'}
    $destination=[IO.Path]::GetFullPath((Join-Path $stageRoot $clean.Replace('/','\')))
    if(!$destination.StartsWith($packagePath+'\',[StringComparison]::OrdinalIgnoreCase) -and $destination -cne $packagePath){throw 'destination-scope'}
    $validated.Add(@{Entry=$entry;Path=$destination;Directory=$directory})
  }
  if(!$seen.Contains('package/dist/review-central-migrate.js') -or !$seen.Contains('package/package.json')){throw 'required-package-file'}
  [void][IO.Directory]::CreateDirectory($packagePath)
  foreach($item in $validated) {
    Assert-PlainPath $item.Path
    if($item.Directory){[void][IO.Directory]::CreateDirectory($item.Path);continue}
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($item.Path))
    $inputStream=$item.Entry.Open()
    $outputStream=[IO.File]::Open($item.Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
      $buffer=New-Object byte[] 65536
      [long]$written=0
      while(($read=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
        $written+=$read
        if($written -gt $item.Entry.Length -or $written -gt 33554432){throw 'expanded-file-capacity'}
        $outputStream.Write($buffer,0,$read)
      }
      if($written -ne $item.Entry.Length){throw 'expanded-length'}
    } finally {$outputStream.Dispose();$inputStream.Dispose()}
  }
  if((Hash-File $cliPath) -cne $cliDigest){throw 'cli-identity'}
  [void][IO.Directory]::CreateDirectory($resultDirectory)
  $receipt=@{version=1;kind='devsetu.reviews.central-migration-prepare-result.v1';migrationId=$migrationId;planSha256=$planDigest;computerName=$env:COMPUTERNAME;archiveSha256=$archiveDigest;cliSha256=$cliDigest;files=$validated.Count;expandedBytes=$total;status='PASS'}|ConvertTo-Json -Compress
  $receiptStream=[IO.File]::Open($receiptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$receiptBytes=[Text.Encoding]::UTF8.GetBytes($receipt);$receiptStream.Write($receiptBytes,0,$receiptBytes.Length)}finally{$receiptStream.Dispose()}
} catch {exit 1}
finally {if($zip){$zip.Dispose()};if($archiveStream){$archiveStream.Dispose()}}
exit 0
'''


def task_xml(paths, action):
    arguments = paths.get("fixedArguments") or ('"' + paths["cli"] + '" ' + action + ' "' + paths["plan"] + '"')
    xml = ('<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">'
           '<Principals><Principal id="System"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>'
           '<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>'
           '<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT15M</ExecutionTimeLimit></Settings>'
           '<Actions Context="System"><Exec><Command>' + escape(paths["command"]) + '</Command><Arguments>' + escape(arguments) + '</Arguments>'
           '<WorkingDirectory>' + escape(paths["directory"]) + '</WorkingDirectory></Exec></Actions></Task>')
    return xml, arguments


def node_action_script(config, paths):
    prefix = "\n".join("$" + key + "='" + value + "'" for key, value in {
        "nodePath": paths["nodeCommand"], "cliPath": paths["cli"], "planPath": paths["plan"],
        "stageRoot": paths["directory"], "consolePath": paths["console"], "stderrPath": paths["stderr"],
        "mode": config["action"], "expectedComputer": config["expectedComputerName"],
        "planDigest": config["planSha256"], "cliDigest": config["cliSha256"],
    }.items())
    return prefix + r'''
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$process=$null;$consoleStream=$null;$errorStream=$null
try {
  if($env:COMPUTERNAME -cne $expectedComputer){throw 'computer-identity'}
  foreach($path in @($stageRoot,$nodePath,$cliPath,$planPath,$consolePath,$stderrPath)) {
    for($current=$path;$current;$current=[IO.Path]::GetDirectoryName($current)) {
      if(Test-Path -LiteralPath $current) {
        if(((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'linked-path'}
      }
    }
  }
  foreach($binding in @(@{Path=$planPath;Hash=$planDigest},@{Path=$cliPath;Hash=$cliDigest})) {
    $stream=[IO.File]::Open($binding.Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    $algorithm=[Security.Cryptography.SHA256]::Create()
    try{$actual=[BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
    finally{$algorithm.Dispose();$stream.Dispose()}
    if($actual -cne $binding.Hash){throw 'artifact-identity'}
  }
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($consolePath))
  $consoleStream=[IO.File]::Open($consolePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  $errorStream=[IO.File]::Open($stderrPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Threading.Tasks;
public static class ReviewMigrationBoundedCapture {
  public static async Task Pump(Stream input, Stream output) {
    byte[] buffer=new byte[16384];long total=0;int count;
    while((count=await input.ReadAsync(buffer,0,buffer.Length).ConfigureAwait(false))>0) {
      total+=count;if(total>2097152)throw new IOException("capture-capacity");
      await output.WriteAsync(buffer,0,count).ConfigureAwait(false);
    }
  }
}
'@
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$nodePath
  $info.Arguments='"'+$cliPath+'" '+$mode+' "'+$planPath+'"'
  $info.WorkingDirectory=$stageRoot
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::Start($info)
  $outTask=[ReviewMigrationBoundedCapture]::Pump($process.StandardOutput.BaseStream,$consoleStream)
  $errTask=[ReviewMigrationBoundedCapture]::Pump($process.StandardError.BaseStream,$errorStream)
  $deadline=[DateTime]::UtcNow.AddSeconds(870)
  while(!$process.WaitForExit(250)) {
    if($outTask.IsFaulted -or $errTask.IsFaulted -or [DateTime]::UtcNow -ge $deadline){throw 'bounded-child-failed'}
  }
  $outTask.GetAwaiter().GetResult();$errTask.GetAwaiter().GetResult()
  $nativeCode=$process.ExitCode
} catch {if($process -and !$process.HasExited){$process.Kill()};exit 1}
finally {if($consoleStream){$consoleStream.Dispose()};if($errorStream){$errorStream.Dispose()};if($process){$process.Dispose()}}
exit $nativeCode
'''


def sanitized_failure(raw):
    try:
        value = json.loads(raw.decode("utf-8-sig"))
        if (isinstance(value, dict) and value.get("status") == "failed"
                and isinstance(value.get("code"), str)
                and re.fullmatch(r"(?:review-central-migrate|review-migration):[a-z0-9-]{1,160}", value["code"])):
            return value["code"]
    except (ValueError, UnicodeError):
        pass
    return None


def diagnostic_computer_name(raw, code):
    if code != "review-central-migrate:computer-mismatch":
        return None
    try:
        value = json.loads(raw.decode("utf-8-sig"))
        if (isinstance(value, dict) and value.get("status") == "failed" and value.get("code") == code
                and isinstance(value.get("observedComputerName"), str)
                and re.fullmatch(r"[A-Za-z0-9.-]{1,253}", value["observedComputerName"])):
            return value["observedComputerName"]
    except (ValueError, UnicodeError):
        pass
    return None


def owned_xml(raw, paths, arguments):
    node = ET.fromstring(raw.rstrip("\x00"))
    ns = {"t": "http://schemas.microsoft.com/windows/2004/02/mit/task"}
    actions = node.findall("t:Actions/t:Exec", ns)
    containers = node.findall("t:Actions", ns)
    principals = node.findall("t:Principals/t:Principal", ns)
    if (len(actions) != 1 or len(containers) != 1 or len(list(containers[0])) != 1
            or containers[0].get("Context") != "System" or len(principals) != 1
            or principals[0].findtext("t:UserId", namespaces=ns) != "S-1-5-18"
            or principals[0].findtext("t:RunLevel", namespaces=ns) != "HighestAvailable"):
        raise ValueError("owned-task-identity")
    actual = tuple(actions[0].findtext("t:" + key, namespaces=ns) for key in ("Command", "Arguments", "WorkingDirectory"))
    if actual != (paths["command"], arguments, paths["directory"]):
        raise ValueError("owned-task-identity")


def validate_receipt(config, raw):
    receipt = json.loads(raw.decode("utf-8-sig"))
    expected_kind = "devsetu.reviews.central-migration-" + config["action"] + "-result.v1"
    if not isinstance(receipt, dict) or receipt.get("version") != 1 or receipt.get("kind") != expected_kind:
        raise ValueError("receipt-kind")
    if receipt.get("migrationId") != config["id"] or receipt.get("planSha256") != config["planSha256"] or receipt.get("computerName") != config["expectedComputerName"]:
        raise ValueError("receipt-scope")
    if config["action"] == "prepare" and (receipt.get("archiveSha256") != config["archiveSha256"] or receipt.get("cliSha256") != config["cliSha256"] or receipt.get("status") != "PASS"):
        raise ValueError("receipt-artifacts")
    return receipt


def execute(config):
    paths = validate_config(config)
    wheel = pathlib.Path(sys.executable).parent / "impacket.whl"
    if not wheel.is_file() or hashlib.sha256(wheel.read_bytes()).hexdigest() != WHEEL_SHA256:
        raise ValueError("client-runtime-identity")
    sys.path.insert(0, str(wheel))
    from impacket.dcerpc.v5 import tsch, transport
    from impacket.dcerpc.v5.rpcrt import RPC_C_AUTHN_LEVEL_PKT_PRIVACY
    rpc, owned, finished, result = None, False, False, None
    registration_attempted, registration_confirmed = False, False
    stage = "authentication"
    username, domain = config["username"], ""
    if "\\" in username:
        domain, username = username.split("\\", 1)
    elif "@" in username:
        username, domain = username.split("@", 1)
    try:
        socket.setdefaulttimeout(12)
        client = transport.DCERPCTransportFactory(fr'ncacn_np:{config["host"]}[\pipe\atsvc]')
        client.set_connect_timeout(12)
        client.set_credentials(username, config["password"], domain)
        rpc = client.get_dce_rpc()
        rpc.set_credentials(*client.get_credentials())
        rpc.set_auth_level(RPC_C_AUTHN_LEVEL_PKT_PRIVACY)
        rpc.connect()
        rpc.bind(tsch.MSRPC_UUID_TSCHS)
        smb = client.get_smb_connection()
        if smb.getServerName().upper() != config["expectedComputerName"].upper():
            raise ValueError("computer-identity")
        share = config["installationRoot"][0].lower() + "$"

        def bounded(path, capacity, digest=None):
            if not path.startswith(config["installationRoot"] + "\\"):
                raise ValueError("read-scope")
            output = io.BytesIO()
            def consume(data):
                if output.tell() + len(data) > capacity:
                    raise ValueError("receipt-capacity")
                output.write(data)
            smb.getFile(share, path[3:], consume)
            data = output.getvalue()
            if digest and hashlib.sha256(data).hexdigest() != digest:
                raise ValueError("artifact-identity")
            return data

        stage = "artifact-verification"
        validate_plan(config, bounded(paths["plan"], 32768, config["planSha256"]))
        if config["action"] != "prepare":
            bounded(paths["cli"], 2000000, config["cliSha256"])
        stage = "new-task-only"
        try:
            tsch.hSchRpcRetrieveTask(rpc, paths["task"])
        except Exception as error:
            if not hasattr(error, "get_error_code") or error.get_error_code() not in (2, 0x80070002):
                raise
        else:
            raise ValueError("task-already-exists")
        xml, arguments = task_xml(paths, config["action"])
        registration_attempted = True
        tsch.hSchRpcRegisterTask(rpc, paths["task"], xml, tsch.TASK_CREATE,
                                'D:(A;;FA;;;SY)(A;;FA;;;BA)\x00', tsch.TASK_LOGON_SERVICE_ACCOUNT)
        registration_confirmed = True
        owned = True
        owned_xml(tsch.hSchRpcRetrieveTask(rpc, paths["task"])["pXml"], paths, arguments)
        # Run exactly once. A transport error is ambiguous and must never trigger a retry.
        stage = "single-run"
        tsch.hSchRpcRun(rpc, paths["task"])
        deadline = time.monotonic() + 890
        while time.monotonic() < deadline:
            info = tsch.hSchRpcGetTaskInfo(rpc, paths["task"], tsch.SCH_FLAG_STATE)
            last = tsch.hSchRpcGetLastRunInfo(rpc, paths["task"])
            if int(last["pLastRuntime"]["wYear"]) and int(info["pState"]) not in (tsch.TASK_STATE_RUNNING, tsch.TASK_STATE_QUEUED):
                finished = True
                break
            time.sleep(0.5)
        else:
            raise TimeoutError("owned-task-timeout")
        stage = "receipt"
        code = int(last["pLastReturnCode"])
        if code != 0:
            result = {"status": "FAIL", "stage": stage, "nativeExitCode": code, "id": config["id"]}
            if config["action"] != "prepare":
                try:
                    console = bounded(paths["console"], 2097152)
                    diagnostic = sanitized_failure(console)
                    if diagnostic:
                        result["diagnosticCode"] = diagnostic
                        computer = diagnostic_computer_name(console, diagnostic)
                        if computer:
                            result["diagnosticComputerName"] = computer
                except Exception:
                    pass
            return result
        raw = bounded(paths["receipt"], 2097152)
        validate_receipt(config, raw)
        result = {"status": "PASS", "action": config["action"], "id": config["id"], "receiptPath": paths["receipt"], "receiptSha256": hashlib.sha256(raw).hexdigest(), "nativeExitCode": code}
        return result
    except Exception as error:
        result = {"status": "FAIL", "stage": stage, "type": type(error).__name__, "errorCode": error.get_error_code() if hasattr(error, "get_error_code") else None, "id": config["id"]}
        return result
    finally:
        if owned and finished:
            try:
                owned_xml(tsch.hSchRpcRetrieveTask(rpc, paths["task"])["pXml"], paths, arguments)
                tsch.hSchRpcDelete(rpc, paths["task"])
                owned = False
            except Exception:
                pass
        if result is not None:
            unknown_registration = registration_attempted and not registration_confirmed
            result["temporaryTaskRemoved"] = not owned and not unknown_registration
            result["retainedTask"] = paths["task"] if owned or unknown_registration else None
            result["registrationOutcomeUnknown"] = unknown_registration
            if owned and result["status"] == "PASS":
                result["status"] = "FAIL"
                result["stage"] = "owned-task-cleanup"
        if rpc:
            try:
                rpc.disconnect()
            except Exception:
                pass
        config.pop("password", None)


def main():
    config = None
    try:
        raw = sys.stdin.read(16385)
        if len(raw) > 16384:
            raise ValueError("input-capacity")
        config = json.loads(raw)
        result = execute(config)
        print(json.dumps(result))
        return 0 if result["status"] == "PASS" else 1
    except Exception as error:
        print(json.dumps({"status": "FAIL", "stage": "scope", "type": type(error).__name__}))
        return 1
    finally:
        if isinstance(config, dict):
            config.pop("password", None)


if __name__ == "__main__":
    sys.exit(main())
