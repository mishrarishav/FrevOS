"""Authenticated transport for one fixed, manifest-bound preview configuration.

Existing Windows authentication arrives only on stdin. There is no command,
script body, service name, credential-change or arbitrary execution input.
"""
import hashlib
import io
import ipaddress
import json
import re
import socket
import sys
import time
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape
from impacket.dcerpc.v5 import tsch, transport
from impacket.dcerpc.v5.rpcrt import RPC_C_AUTHN_LEVEL_PKT_PRIVACY

config = json.load(sys.stdin)
rpc = None
owned_task = None
stage = "scope"
try:
    host, root, identifier = config["host"], config["installationRoot"], config["id"]
    kind = config.get("kind", "configuration")
    if kind not in ("configuration", "executor"):
        raise ValueError("kind")
    script_name = "Configure-PrivatePreview.ps1" if kind == "configuration" else "Update-PreviewExecutor.ps1"
    address = ipaddress.IPv4Address(host)
    if (not any(address in ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
            or not re.fullmatch(r"[A-Z]:\\[A-Za-z0-9 _.-]+(?:\\[A-Za-z0-9 _.-]+)*", root)
            or any(p in (".", "..") for p in root[3:].split("\\"))
            or not re.fullmatch((r"pvc_[a-f0-9]{32}" if kind == "configuration" else r"pve_[a-f0-9]{32}"), identifier)
            or config["mode"] not in ("plan", "apply")
            or not all(re.fullmatch(r"[a-f0-9]{64}", config[n]) for n in ("scriptSha256", "planSha256"))):
        raise ValueError("scope")
    username, domain = config["username"], ""
    if "\\" in username:
        domain, username = username.split("\\", 1)
    elif "@" in username:
        username, domain = username.split("@", 1)
    socket.setdefaulttimeout(12)
    stage = "authentication"
    client = transport.DCERPCTransportFactory(fr"ncacn_np:{host}[\pipe\atsvc]")
    client.set_connect_timeout(12)
    client.set_credentials(username, config["password"], domain)
    rpc = client.get_dce_rpc()
    rpc.set_credentials(*client.get_credentials())
    rpc.set_auth_level(RPC_C_AUTHN_LEVEL_PKT_PRIVACY)
    rpc.connect()
    rpc.bind(tsch.MSRPC_UUID_TSCHS)
    smb = client.get_smb_connection()
    if smb.getServerName().upper() != config["expectedComputerName"].upper():
        raise ValueError("host")
    share = root[0].lower() + "$"
    relative = root[3:] + "\\operator\\preview-stage-" + identifier

    def bounded(path, digest=None):
        output = io.BytesIO()
        def consume(data):
            if output.tell() + len(data) > 65536:
                raise ValueError("capacity")
            output.write(data)
        smb.getFile(share, path, consume)
        data = output.getvalue()
        if digest and hashlib.sha256(data).hexdigest() != digest:
            raise ValueError("identity")
        return data

    bounded(relative + "\\" + script_name, config["scriptSha256"])
    plan = json.loads(bounded(relative + "\\plan.json", config["planSha256"]).decode("utf-8-sig"))
    expected_action = "devsetu.private-preview.configure.v1" if kind == "configuration" else "devsetu.preview.executor-update.v1"
    if (plan["id"] != identifier or plan["installationRoot" if kind == "configuration" else "platformRoot"] != root
            or plan["executionSid"] != "S-1-5-18"
            or plan["action"] != expected_action
            or (kind == "executor" and plan["role"] != "destination")):
        raise ValueError("plan")
    command = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    directory = root + "\\operator\\preview-stage-" + identifier
    arguments = ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned '
                 '-File "' + directory + '\\' + script_name + '" '
                 '-PlanReference "' + directory + '\\plan.json"'
                 + (' -PlanOnly' if config["mode"] == "plan" else ''))
    task = "\\DevSetu-PrivatePreview-" + config["mode"] + "-" + identifier
    xml = ('<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" '
           'xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">'
           '<Principals><Principal id="System"><UserId>S-1-5-18</UserId>'
           '<RunLevel>HighestAvailable</RunLevel></Principal></Principals>'
           '<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>'
           '<ExecutionTimeLimit>PT4M</ExecutionTimeLimit></Settings>'
           '<Actions Context="System"><Exec><Command>' + escape(command)
           + '</Command><Arguments>' + escape(arguments)
           + '</Arguments></Exec></Actions></Task>')
    stage = "owned-task"
    tsch.hSchRpcRegisterTask(rpc, task, xml, tsch.TASK_CREATE,
                            'D:(A;;FA;;;SY)(A;;FA;;;BA)\x00', tsch.TASK_LOGON_SERVICE_ACCOUNT)
    owned_task = task
    tsch.hSchRpcRun(rpc, task)
    deadline = time.monotonic() + 230
    while time.monotonic() < deadline:
        info = tsch.hSchRpcGetTaskInfo(rpc, task, tsch.SCH_FLAG_STATE)
        last = tsch.hSchRpcGetLastRunInfo(rpc, task)
        if int(last["pLastRuntime"]["wYear"]) and int(info["pState"]) not in (tsch.TASK_STATE_RUNNING, tsch.TASK_STATE_QUEUED):
            break
        time.sleep(0.5)
    else:
        raise TimeoutError("owned-task")
    stage = "receipt"
    if int(last["pLastReturnCode"]) == 0:
        receipt_path = (relative + "\\plan-only-result.json" if config["mode"] == "plan"
                        else relative + "\\preview-executor-result.json" if kind == "executor"
                        else root[3:] + "\\operator\\private-preview-" + identifier + "\\result.json")
        receipt = json.loads(bounded(receipt_path).decode("utf-8-sig"))
        if receipt.get("id") != identifier or (kind == "configuration" and receipt.get("manifestSha256") != plan["manifestSha256"]):
            raise ValueError("receipt")
    else:
        receipt = {"status": "FAIL", "id": identifier, "nativeExitCode": int(last["pLastReturnCode"])}
    task_xml = ET.fromstring(tsch.hSchRpcRetrieveTask(rpc, task)["pXml"].rstrip("\x00"))
    ns = {"t": "http://schemas.microsoft.com/windows/2004/02/mit/task"}
    actions = task_xml.findall("t:Actions/t:Exec", ns)
    if len(actions) != 1 or (actions[0].findtext("t:Command", namespaces=ns), actions[0].findtext("t:Arguments", namespaces=ns)) != (command, arguments):
        raise ValueError("owned-task-identity")
    tsch.hSchRpcDelete(rpc, task)
    owned_task = None
    print(json.dumps({"status": receipt.get("status"), "receipt": receipt, "temporaryTaskRemoved": True}))
    if receipt.get("status") != ("READY" if config["mode"] == "plan" else "PASS"):
        sys.exit(1)
except Exception as error:
    print(json.dumps({"status": "FAIL", "stage": stage, "type": type(error).__name__,
                      "errorCode": error.get_error_code() if hasattr(error, "get_error_code") else None,
                      "retainedTask": owned_task}))
    sys.exit(1)
finally:
    config.pop("password", None)
    if rpc:
        try:
            rpc.disconnect()
        except Exception:
            pass
