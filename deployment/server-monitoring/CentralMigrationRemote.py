"""Fixed native monitoring bootstrap CLI transport. Credentials arrive only on stdin."""
import base64
import hashlib
import importlib.util
import io
import ipaddress
import json
import ntpath
import pathlib
import re
import socket
import sys
import time

KIND = "devsetu.server-monitoring.central-bootstrap.v1"
DIGEST = re.compile(r"[a-f0-9]{64}")
HELPER_SHA256 = "633a498504a69631669ccc9ba783109115bda777a990ae3e077a8b52acc0c0ec"
WHEEL_SHA256 = "3e5349c1209cdd3b90bff6f8b61c0d89aea0f3dbba6ad02ad254b9d3ef2301d0"
_helper_path = pathlib.Path(__file__).resolve().parents[1] / "server20" / "ReviewMigrationRemote.py"
if hashlib.sha256(_helper_path.read_bytes()).hexdigest() != HELPER_SHA256:
    raise ValueError("central-reviewed-helper-identity")
_spec = importlib.util.spec_from_file_location("devsetu_reviewed_migration_transport", _helper_path)
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)
task_xml = _base.task_xml
owned_xml = _base.owned_xml


def validate_config(config):
    required = {"host", "installationRoot", "id", "action", "expectedComputerName", "planSha256", "cliSha256", "username", "password"}
    if not isinstance(config, dict) or not required <= set(config) or set(config) - (required | {"version", "archiveSha256"}):
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
    if not isinstance(config["id"], str) or not re.fullmatch(r"smb_[a-f0-9]{32}", config["id"]) or not isinstance(config["expectedComputerName"], str) or not re.fullmatch(r"[A-Za-z0-9-]{1,63}", config["expectedComputerName"]):
        raise ValueError("scope")
    if not all(isinstance(config[key], str) and DIGEST.fullmatch(config[key]) for key in ("planSha256", "cliSha256")):
        raise ValueError("identity")
    if not isinstance(config["username"], str) or not re.fullmatch(r"[A-Za-z0-9_.@\\$-]{1,256}", config["username"]):
        raise ValueError("credential-shape")
    if not isinstance(config["password"], str) or not 1 <= len(config["password"]) <= 4096 or any(char in config["password"] for char in "\x00\r\n"):
        raise ValueError("credential-shape")
    stage = ntpath.join(root, "operator", "server-monitoring-migrations", config["id"])
    paths = {"directory": stage, "plan": ntpath.join(stage, "plan.json"),
             "cli": ntpath.join(stage, "package", "dist", "server-monitoring-central.js"),
             "nodeCommand": ntpath.join(root, "node", "node-v24.19.0-win-x64", "node.exe"),
             "receipt": ntpath.join(stage, "results", config["action"] + "-result.json"),
             "console": ntpath.join(stage, "results", config["action"] + "-console.private.json"),
             "stderr": ntpath.join(stage, "results", config["action"] + "-stderr.private.log"),
             "task": "\\DevSetu-ServerMonitoringCentral-" + config["id"] + "-" + config["action"],
             "command": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"}
    script = prepare_script(config, paths) if config["action"] == "prepare" else node_action_script(config, paths)
    paths["fixedArguments"] = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -EncodedCommand " + base64.b64encode(script.encode("utf-16le")).decode("ascii")
    return paths


def validate_plan(config, raw):
    if len(raw) > 32768 or hashlib.sha256(raw).hexdigest() != config["planSha256"]:
        raise ValueError("plan-identity")
    plan = json.loads(raw.decode("utf-8-sig"))
    required = {"version", "kind", "id", "installationRoot", "expectedComputerName", "expectedDatabase", "workspaceId", "requestedBy", "enrollmentSha256", "sqlSha256", "policy", "createdAt", "expiresAt"}
    if not isinstance(plan, dict) or not required <= set(plan) or set(plan) - (required | {"expectedReviewSha256"}):
        raise ValueError("plan-scope")
    if plan["version"] != 1 or plan["kind"] != KIND or plan["id"] != config["id"] or plan["installationRoot"] != config["installationRoot"] or plan["expectedComputerName"] != config["expectedComputerName"]:
        raise ValueError("plan-target")
    target = plan["expectedDatabase"]
    if not isinstance(target, dict) or set(target) != {"host", "port", "database", "runtimeRole"} or target["host"] not in ("127.0.0.1", "::1") or type(target["port"]) is not int or not 1 <= target["port"] <= 65535:
        raise ValueError("plan-database")
    if not isinstance(target["database"], str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", target["database"]) or not isinstance(target["runtimeRole"], str) or not re.fullmatch(r"[a-z][a-z0-9_]{2,62}", target["runtimeRole"]):
        raise ValueError("plan-database")
    for key, prefix in (("workspaceId", "ws"), ("requestedBy", "usr")):
        if not isinstance(plan[key], str) or not re.fullmatch(prefix + r"_[A-Za-z0-9][A-Za-z0-9_-]{0,119}", plan[key]):
            raise ValueError("plan-principal")
    for key in ("enrollmentSha256", "sqlSha256", "expectedReviewSha256"):
        if key in plan and (not isinstance(plan[key], str) or not DIGEST.fullmatch(plan[key])):
            raise ValueError("plan-artifact")
    if config["action"] in ("plan", "apply") and "expectedReviewSha256" not in plan:
        raise ValueError("plan-artifact")
    if not isinstance(plan["policy"], dict) or len(plan["policy"]) > 20 or not all(isinstance(plan[key], str) and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z", plan[key]) for key in ("createdAt", "expiresAt")):
        raise ValueError("plan-policy")
    return plan


def prepare_script(config, paths):
    # Static, identity-pinned reviewed extraction code. Only fixed purpose literals differ.
    script = _base.prepare_script(config, paths)
    replacements = {
        "review-central-migrate.js": "server-monitoring-central.js",
        "devsetu.reviews.central-migration-prepare-result.v1": "devsetu.server-monitoring.central-bootstrap-prepare-result.v1",
        "migrationId=$migrationId;": "id=$migrationId;",
        "$clean -ceq 'package/migrations/0007_review_workspace_state.sql'": "$clean -cin @('package/migrations/0007_review_workspace_state.sql','package/migrations/0008_server_monitoring_state.sql')",
        "$total -gt 134217728": "$total -gt 67108864",
        "!$seen.Contains('package/package.json'))": "!$seen.Contains('package/package.json') -or !$seen.Contains('package/migrations/0007_review_workspace_state.sql') -or !$seen.Contains('package/migrations/0008_server_monitoring_state.sql'))",
    }
    for previous, replacement in replacements.items():
        if script.count(previous) != 1:
            raise ValueError("reviewed-helper-contract")
        script = script.replace(previous, replacement)
    return script


def node_action_script(config, paths):
    return _base.node_action_script(config, paths).replace("ReviewMigrationBoundedCapture", "ServerMonitoringCentralBoundedCapture")


def sanitized_failure(raw):
    try:
        value = json.loads(raw.decode("utf-8-sig"))
        if isinstance(value, dict) and value.get("status") == "failed" and isinstance(value.get("code"), str) and re.fullmatch(r"(?:server-monitoring-central|review-central-migrate):[a-z0-9-]{1,160}", value["code"]):
            return value["code"]
    except (ValueError, UnicodeError):
        pass
    return None


def validate_receipt(config, raw, plan):
    if len(raw) > 2097152:
        raise ValueError("receipt-capacity")
    value = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError("receipt-kind")
    action = config["action"]
    if action == "prepare":
        if value.get("version") != 1 or value.get("kind") != "devsetu.server-monitoring.central-bootstrap-prepare-result.v1" or value.get("status") != "PASS" or value.get("id") != config["id"] or value.get("planSha256") != config["planSha256"] or value.get("computerName") != config["expectedComputerName"] or value.get("archiveSha256") != config["archiveSha256"] or value.get("cliSha256") != config["cliSha256"]:
            raise ValueError("receipt-scope")
    elif action == "inspect":
        target = plan["expectedDatabase"]
        db = value.get("database", {})
        if value.get("status") != "inspected" or value.get("computerName") != config["expectedComputerName"] or value.get("workspaceId") != plan["workspaceId"] or not isinstance(db, dict) or db.get("database") != target["database"] or db.get("server_address") != target["host"] or db.get("server_port") != target["port"] or not isinstance(value.get("reviewSha256"), str) or not DIGEST.fullmatch(value["reviewSha256"]):
            raise ValueError("receipt-scope")
    elif action == "plan":
        if value.get("version") != 1 or value.get("kind") != "devsetu.server-monitoring.central-bootstrap-plan-result.v1" or value.get("id") != config["id"] or value.get("planSha256") != config["planSha256"] or value.get("workspaceId") != plan["workspaceId"] or value.get("requestedBy") != plan["requestedBy"] or value.get("enrollmentSha256") != plan["enrollmentSha256"] or value.get("sqlSha256") != plan["sqlSha256"] or value.get("reviewSha256") != plan["expectedReviewSha256"]:
            raise ValueError("receipt-scope")
    elif action == "apply":
        if value.get("status") != "succeeded" or value.get("id") != config["id"] or value.get("planSha256") != config["planSha256"] or value.get("configurationSha256") != plan["enrollmentSha256"] or value.get("reviewSha256") != plan["expectedReviewSha256"] or value.get("schema") not in ("applied", "already-applied"):
            raise ValueError("receipt-scope")
    return value


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
        plan = validate_plan(config, bounded(paths["plan"], 32768, config["planSha256"]))
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
        tsch.hSchRpcRegisterTask(rpc, paths["task"], xml, tsch.TASK_CREATE, 'D:(A;;FA;;;SY)(A;;FA;;;BA)\x00', tsch.TASK_LOGON_SERVICE_ACCOUNT)
        registration_confirmed, owned = True, True
        owned_xml(tsch.hSchRpcRetrieveTask(rpc, paths["task"])["pXml"], paths, arguments)
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
                    diagnostic = sanitized_failure(bounded(paths["console"], 2097152))
                    if diagnostic:
                        result["diagnosticCode"] = diagnostic
                except Exception:
                    pass
            return result
        raw = bounded(paths["receipt"], 2097152)
        validate_receipt(config, raw, plan)
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
            unknown = registration_attempted and not registration_confirmed
            result["temporaryTaskRemoved"] = not owned and not unknown
            result["retainedTask"] = paths["task"] if owned or unknown else None
            result["registrationOutcomeUnknown"] = unknown
            if owned and result["status"] == "PASS":
                result["status"], result["stage"] = "FAIL", "owned-task-cleanup"
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
