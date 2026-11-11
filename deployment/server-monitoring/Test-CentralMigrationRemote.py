"""Pure scope/task/archive fixtures. No network, credentials, database or tasks."""
import base64
import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
import zipfile
from unittest import mock

path = pathlib.Path(__file__).with_name("CentralMigrationRemote.py")
spec = importlib.util.spec_from_file_location("monitoring_central_remote", path)
remote = importlib.util.module_from_spec(spec)
spec.loader.exec_module(remote)


class ScopeTests(unittest.TestCase):
    def config(self):
        return {"host": "10.1.2.3", "installationRoot": "E:\\Fixture App", "id": "smb_" + "a" * 32,
                "action": "inspect", "expectedComputerName": "FIXTURE", "planSha256": "b" * 64,
                "cliSha256": "c" * 64, "username": "DOMAIN\\fixture", "password": "synthetic-fixture-only"}

    def plan(self, config):
        return {"version": 1, "kind": remote.KIND, "id": config["id"], "installationRoot": config["installationRoot"],
                "expectedComputerName": config["expectedComputerName"], "expectedDatabase": {"host": "127.0.0.1", "port": 5433, "database": "fixture", "runtimeRole": "fixture_runtime"},
                "workspaceId": "ws_fixture", "requestedBy": "usr_fixture", "enrollmentSha256": "d" * 64, "sqlSha256": "e" * 64,
                "policy": {}, "createdAt": "2026-11-11T00:00:00.000Z", "expiresAt": "2026-11-11T01:00:00.000Z"}

    def test_closed_fixed_paths_task_identity_and_no_secret_in_arguments(self):
        config = self.config()
        paths = remote.validate_config(config)
        self.assertEqual(paths["directory"], config["installationRoot"] + "\\operator\\server-monitoring-migrations\\" + config["id"])
        self.assertTrue(paths["cli"].endswith("\\package\\dist\\server-monitoring-central.js"))
        self.assertTrue(paths["nodeCommand"].endswith("\\node\\node-v24.19.0-win-x64\\node.exe"))
        self.assertTrue(paths["receipt"].endswith("\\results\\inspect-result.json"))
        xml, arguments = remote.task_xml(paths, "inspect")
        remote.owned_xml(xml, paths, arguments)
        self.assertNotIn(config["password"], xml)
        self.assertIn("PT15M", xml)
        self.assertNotIn("reviews-migrations", xml)
        for changed in (xml.replace(paths["command"], "C:\\other.exe"), xml.replace("</Actions>", "<ComHandler/></Actions>"), xml.replace("S-1-5-18", "S-1-5-19")):
            with self.assertRaises(ValueError):
                remote.owned_xml(changed, paths, arguments)

    def test_scope_rejects_public_host_paths_extra_commands_and_credential_injection(self):
        for key, value in [("host", "8.8.8.8"), ("host", "169.254.169.254"), ("installationRoot", "E:\\Fixture\\..\\Windows"), ("installationRoot", "E:\\Fixture App "), ("installationRoot", "E:\\Fixture&whoami"), ("action", "shell"), ("id", "smb_../other"), ("cliSha256", "bad"), ("username", "user\nother"), ("password", "fake\ninvalid")]:
            with self.subTest(key=key), self.assertRaises((ValueError, TypeError)):
                remote.validate_config({**self.config(), key: value})
        for key in ("command", "artifactId", "shell", "scriptPath"):
            with self.assertRaises(ValueError):
                remote.validate_config({**self.config(), key: "forbidden"})

    def test_plan_hash_identity_database_and_role_bound(self):
        config = self.config(); plan = self.plan(config)
        raw = json.dumps(plan).encode(); config["planSha256"] = hashlib.sha256(raw).hexdigest()
        remote.validate_plan(config, raw)
        with self.assertRaises(ValueError):
            remote.validate_plan(config, raw + b" ")
        for edit in ({"id": "smb_" + "f" * 32}, {"kind": "other"}, {"expectedComputerName": "OTHER"}, {"installationRoot": "D:\\Other"}, {"command": "other"}, {"expectedDatabase": {**plan["expectedDatabase"], "host": "10.1.2.3"}}):
            changed = {**plan, **edit}; raw = json.dumps(changed).encode(); config["planSha256"] = hashlib.sha256(raw).hexdigest()
            with self.assertRaises(ValueError):
                remote.validate_plan(config, raw)
        config["action"] = "apply"; raw = json.dumps(plan).encode(); config["planSha256"] = hashlib.sha256(raw).hexdigest()
        with self.assertRaises(ValueError):
            remote.validate_plan(config, raw)
        plan["expectedReviewSha256"] = "f" * 64; raw = json.dumps(plan).encode(); config["planSha256"] = hashlib.sha256(raw).hexdigest()
        remote.validate_plan(config, raw)

    def test_receipt_validation_matches_real_cli_shapes_and_rejects_cross_scope(self):
        config = self.config(); plan = self.plan(config)
        inspect = {"status": "inspected", "computerName": config["expectedComputerName"], "workspaceId": plan["workspaceId"], "database": {"database": "fixture", "server_address": "127.0.0.1", "server_port": 5433}, "reviewSha256": "f" * 64}
        remote.validate_receipt(config, json.dumps(inspect).encode(), plan)
        for edit in ({"computerName": "OTHER"}, {"workspaceId": "ws_other"}, {"database": {"database": "other"}}, {"status": "succeeded"}):
            with self.assertRaises(ValueError):
                remote.validate_receipt(config, json.dumps({**inspect, **edit}).encode(), plan)
        config["action"] = "plan"; plan["expectedReviewSha256"] = "f" * 64
        planned = {"version": 1, "kind": "devsetu.server-monitoring.central-bootstrap-plan-result.v1", "id": config["id"], "planSha256": config["planSha256"], "workspaceId": plan["workspaceId"], "requestedBy": plan["requestedBy"], "enrollmentSha256": plan["enrollmentSha256"], "sqlSha256": plan["sqlSha256"], "reviewSha256": plan["expectedReviewSha256"]}
        remote.validate_receipt(config, json.dumps(planned).encode(), plan)
        with self.assertRaises(ValueError):
            remote.validate_receipt(config, json.dumps({**planned, "planSha256": "0" * 64}).encode(), plan)
        config["action"] = "apply"
        applied = {"status": "succeeded", "id": config["id"], "planSha256": config["planSha256"], "configurationSha256": plan["enrollmentSha256"], "reviewSha256": plan["expectedReviewSha256"], "schema": "applied"}
        remote.validate_receipt(config, json.dumps(applied).encode(), plan)
        with self.assertRaises(ValueError):
            remote.validate_receipt(config, json.dumps({**applied, "configurationSha256": "0" * 64}).encode(), plan)

    def test_prepare_and_capture_templates_have_only_fixed_purpose_literals(self):
        config = {**self.config(), "action": "prepare", "archiveSha256": "d" * 64}
        paths = remote.validate_config(config)
        script = remote.prepare_script(config, paths)
        self.assertIn("0008_server_monitoring_state.sql", script)
        self.assertIn("0007_review_workspace_state.sql", script)
        self.assertIn("$total -gt 67108864", script)
        self.assertIn("package-already-exists", script)
        self.assertNotIn(config["password"], script)
        self.assertNotIn("review-central-migrate.js", script)
        config.pop("archiveSha256"); config["action"] = "inspect"
        capture = remote.node_action_script(config, remote.validate_config(config))
        self.assertIn("ServerMonitoringCentralBoundedCapture", capture)
        self.assertIn("2097152", capture)
        self.assertNotIn(config["password"], capture)
        self.assertEqual(remote.sanitized_failure(b'{"status":"failed","code":"server-monitoring-central:fixture-failed","private":"hidden"}'), "server-monitoring-central:fixture-failed")
        self.assertIsNone(remote.sanitized_failure(b'{"status":"failed","code":"secret://password"}'))

    @unittest.skipUnless(os.name == "nt", "Windows finite .NET archive fixture")
    def test_actual_prepare_rejects_unsafe_entries_before_creating_package(self):
        for case in ("valid", "traversal", "outside", "env", "duplicate-case", "symlink", "reparse", "missing-sql8", "oversized"):
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix="monitoring-prepare-") as fixture:
                config = {**self.config(), "installationRoot": fixture, "action": "prepare", "expectedComputerName": os.environ["COMPUTERNAME"], "archiveSha256": "d" * 64}
                paths = remote.validate_config(config); stage = pathlib.Path(paths["directory"]); stage.mkdir(parents=True)
                raw = json.dumps(self.plan(config)).encode(); pathlib.Path(paths["plan"]).write_bytes(raw); config["planSha256"] = hashlib.sha256(raw).hexdigest()
                cli = b"// fixed inert fixture; never executed\n"; config["cliSha256"] = hashlib.sha256(cli).hexdigest()
                archive = stage / "package.zip"
                with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
                    bundle.writestr("package/package.json", '{"name":"fixture"}')
                    bundle.writestr("package/dist/server-monitoring-central.js", cli)
                    bundle.writestr("package/migrations/0007_review_workspace_state.sql", "-- inert")
                    if case != "missing-sql8": bundle.writestr("package/migrations/0008_server_monitoring_state.sql", "-- inert")
                    if case == "valid": bundle.writestr("package/node_modules/fixture/index.js", "// inert")
                    elif case == "traversal": bundle.writestr("package/dist/../../outside.txt", "inert")
                    elif case == "outside": bundle.writestr("outside.txt", "inert")
                    elif case == "env": bundle.writestr("package/node_modules/fixture/.env.private", "inert")
                    elif case == "duplicate-case": bundle.writestr("package/PACKAGE.json", "inert")
                    elif case in ("symlink", "reparse"):
                        entry = zipfile.ZipInfo("package/node_modules/fixture/link"); entry.external_attr = (0o120777 << 16) if case == "symlink" else 1024; bundle.writestr(entry, "inert")
                    elif case == "oversized":
                        with bundle.open("package/dist/large.js", "w") as output:
                            for _ in range(65): output.write(b"x" * (512 * 1024))
                config["archiveSha256"] = hashlib.sha256(archive.read_bytes()).hexdigest(); paths = remote.validate_config(config)
                script = remote.prepare_script(config, paths)
                command = [paths["command"], "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.b64encode(script.encode("utf-16le")).decode()]
                result = subprocess.run(command, capture_output=True, timeout=30)
                if case == "valid":
                    self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
                    remote.validate_receipt(config, pathlib.Path(paths["receipt"]).read_bytes(), self.plan(config))
                    self.assertEqual(pathlib.Path(paths["cli"]).read_bytes(), cli)
                    self.assertNotEqual(subprocess.run(command, capture_output=True, timeout=30).returncode, 0)
                else:
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse((stage / "package").exists())


class LifecycleTests(unittest.TestCase):
    config = ScopeTests.config
    plan = ScopeTests.plan

    def test_mocked_native_task_lifecycle_never_retries_ambiguous_submissions(self):
        runtime = pathlib.Path(remote.sys.executable).parent / "impacket.whl"
        if not runtime.exists():
            self.skipTest("existing pinned operator client not available")
        self.assertEqual(hashlib.sha256(runtime.read_bytes()).hexdigest(), remote.WHEEL_SHA256)
        remote.sys.path.insert(0, str(runtime))
        from impacket.dcerpc.v5 import tsch, transport
        class Missing(Exception):
            def get_error_code(self): return 2
        for scenario in ("success", "failed-exit", "wrong-machine", "wrong-receipt", "existing", "register-ambiguous", "run-ambiguous", "replaced-on-cleanup"):
            with self.subTest(scenario=scenario):
                config = self.config(); plan = self.plan(config); raw = json.dumps(plan).encode(); config["planSha256"] = hashlib.sha256(raw).hexdigest()
                cli = b"// inert fixture"; config["cliSha256"] = hashlib.sha256(cli).hexdigest(); paths = remote.validate_config(config)
                receipt = {"status": "inspected", "computerName": config["expectedComputerName"], "workspaceId": "ws_other" if scenario == "wrong-receipt" else plan["workspaceId"], "database": {"database": "fixture", "server_address": "127.0.0.1", "server_port": 5433}, "reviewSha256": "f" * 64}
                fake_rpc, fake_smb, fake_client = mock.Mock(), mock.Mock(), mock.Mock()
                fake_smb.getServerName.return_value = "OTHER" if scenario == "wrong-machine" else config["expectedComputerName"]
                artifacts = {paths["plan"][3:]: raw, paths["cli"][3:]: cli, paths["receipt"][3:]: json.dumps(receipt).encode(), paths["console"][3:]: b'{"status":"failed","code":"server-monitoring-central:fixture-failed","private":"hidden-fixture-content"}'}
                fake_smb.getFile.side_effect = lambda share, file, callback: callback(artifacts[file])
                fake_client.get_dce_rpc.return_value = fake_rpc; fake_client.get_smb_connection.return_value = fake_smb
                fake_client.get_credentials.return_value = ("fixture", "synthetic", "DOMAIN", "", "", "", None, None)
                xml, _ = remote.task_xml(paths, "inspect")
                retrievals = [Missing(), {"pXml": xml}, {"pXml": xml}]
                if scenario == "existing": retrievals = [{"pXml": xml}]
                if scenario == "replaced-on-cleanup": retrievals[-1] = {"pXml": xml.replace(paths["command"], r"C:\other.exe")}
                with mock.patch.object(transport, "DCERPCTransportFactory", return_value=fake_client), \
                     mock.patch.object(tsch, "hSchRpcRetrieveTask", side_effect=retrievals), \
                     mock.patch.object(tsch, "hSchRpcRegisterTask", side_effect=TimeoutError() if scenario == "register-ambiguous" else None) as register, \
                     mock.patch.object(tsch, "hSchRpcRun", side_effect=TimeoutError() if scenario == "run-ambiguous" else None) as run, \
                     mock.patch.object(tsch, "hSchRpcGetTaskInfo", return_value={"pState": tsch.TASK_STATE_READY}), \
                     mock.patch.object(tsch, "hSchRpcGetLastRunInfo", return_value={"pLastRuntime": {"wYear": 2026}, "pLastReturnCode": 1 if scenario == "failed-exit" else 0}), \
                     mock.patch.object(tsch, "hSchRpcDelete") as delete:
                    result = remote.execute(config)
                self.assertNotIn("password", config)
                self.assertNotIn("hidden-fixture", json.dumps(result))
                self.assertLessEqual(register.call_count, 1); self.assertLessEqual(run.call_count, 1)
                if scenario in ("success", "failed-exit", "wrong-receipt"):
                    self.assertEqual(delete.call_count, 1); self.assertTrue(result["temporaryTaskRemoved"])
                    self.assertEqual(result["status"], "PASS" if scenario == "success" else "FAIL")
                    if scenario == "failed-exit": self.assertEqual(result["diagnosticCode"], "server-monitoring-central:fixture-failed")
                else:
                    self.assertEqual(delete.call_count, 0); self.assertEqual(result["status"], "FAIL")
                    self.assertEqual(result["registrationOutcomeUnknown"], scenario == "register-ambiguous")


if __name__ == "__main__":
    unittest.main()
