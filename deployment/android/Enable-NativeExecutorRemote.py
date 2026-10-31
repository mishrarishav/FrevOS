"""One-use authenticated Windows transport for the fixed native Android enroller.

No command, script body, credential change or target path is accepted from a job.
The operator supplies an enrolled SDK root, exact source/plan hashes and existing
Windows authentication through stdin. Values are never persisted or printed.
"""
import hashlib
import io
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
    host = config["host"]
    root = config["sdkLocalRoot"]
    identifier = config["id"]
    if (not re.fullmatch(r"[A-Za-z0-9.-]+", host)
            or not re.fullmatch(r"[A-Z]:\\[A-Za-z0-9_-]+", root)
            or not re.fullmatch(r"ae_[a-f0-9]{32}", identifier)
            or not re.fullmatch(r"ex_[a-f0-9]{32}", config["executorId"])
            or not all(re.fullmatch(r"[a-f0-9]{64}", config[name])
                       for name in ("scriptSha256", "planSha256"))):
        raise ValueError("scope")
    username = config["username"]
    domain = ""
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
    relative = root[3:] + "\\incoming\\native-" + identifier

    def bounded(name, digest):
        data = io.BytesIO()
        smb.getFile(share, relative + "\\" + name, data.write)
        value = data.getvalue()
        if len(value) > 65536 or hashlib.sha256(value).hexdigest() != digest:
            raise ValueError("identity")
        return value

    bounded("Enable-NativeExecutor.ps1", config["scriptSha256"])
    plan = json.loads(bounded("plan.json", config["planSha256"]).decode("utf-8-sig"))
    if (plan["id"] != identifier or plan["executorId"] != config["executorId"]
            or plan["role"] != "destination" or plan["executionSid"] != "S-1-5-18"
            or plan["action"] != "native-executor:enable-android:v1"):
        raise ValueError("plan")
    command = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    directory = root + "\\incoming\\native-" + identifier
    arguments = ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned '
                 '-File "' + directory + '\\Enable-NativeExecutor.ps1" '
                 '-PlanReference "' + directory + '\\plan.json"')
    task = "\\DevSetu-AndroidNative-" + identifier
    xml = ('<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" '
           'xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">'
           '<Principals><Principal id="System"><UserId>S-1-5-18</UserId>'
           '<RunLevel>HighestAvailable</RunLevel></Principal></Principals>'
           '<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>'
           '<ExecutionTimeLimit>PT3M</ExecutionTimeLimit></Settings>'
           '<Actions Context="System"><Exec><Command>' + escape(command)
           + '</Command><Arguments>' + escape(arguments)
           + '</Arguments></Exec></Actions></Task>')
    stage = "owned-task"
    tsch.hSchRpcRegisterTask(rpc, task, xml, tsch.TASK_CREATE,
                            'D:(A;;FA;;;SY)(A;;FA;;;BA)\x00', tsch.TASK_LOGON_SERVICE_ACCOUNT)
    owned_task = task
    tsch.hSchRpcRun(rpc, task)
    deadline = time.monotonic() + 160
    while time.monotonic() < deadline:
        info = tsch.hSchRpcGetTaskInfo(rpc, task, tsch.SCH_FLAG_STATE)
        if int(info["pState"]) not in (tsch.TASK_STATE_RUNNING, tsch.TASK_STATE_QUEUED):
            break
        time.sleep(0.5)
    else:
        raise TimeoutError("owned-task")
    stage = "receipt"
    output = io.BytesIO()
    smb.getFile(share, relative + "\\native-enrollment-result.json", output.write)
    receipt = json.loads(output.getvalue().decode("utf-8-sig"))
    if receipt.get("status") == "PASS" and (
            receipt.get("id") != identifier or receipt.get("executorId") != config["executorId"]):
        raise ValueError("receipt")
    task_xml = ET.fromstring(tsch.hSchRpcRetrieveTask(rpc, task)["pXml"].rstrip("\x00"))
    ns = {"t": "http://schemas.microsoft.com/windows/2004/02/mit/task"}
    actions = task_xml.findall("t:Actions/t:Exec", ns)
    if len(actions) != 1 or (
            actions[0].findtext("t:Command", namespaces=ns),
            actions[0].findtext("t:Arguments", namespaces=ns)) != (command, arguments):
        raise ValueError("owned-task-identity")
    tsch.hSchRpcDelete(rpc, task)
    owned_task = None
    print(json.dumps({"status": receipt.get("status"), "receipt": receipt,
                      "temporaryTaskRemoved": True}))
    if receipt.get("status") != "PASS":
        sys.exit(1)
except Exception as error:
    print(json.dumps({"status": "FAIL", "stage": stage, "type": type(error).__name__,
                      "errorCode": error.get_error_code() if hasattr(error, "get_error_code") else None,
                      "retainedTask": owned_task}))
    sys.exit(1)
finally:
    if rpc:
        try:
            rpc.disconnect()
        except Exception:
            pass
    config.clear()
