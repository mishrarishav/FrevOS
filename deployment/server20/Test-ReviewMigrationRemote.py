"""Pure transport validation. No network, task creation or credential resolution."""
import copy
import base64
import hashlib
import importlib.util
import json
import pathlib
import os
import subprocess
import shutil
import tempfile
import unittest
import zipfile
from unittest import mock

path = pathlib.Path(__file__).with_name("ReviewMigrationRemote.py")
spec = importlib.util.spec_from_file_location("review_remote", path)
remote = importlib.util.module_from_spec(spec)
spec.loader.exec_module(remote)


class ScopeTests(unittest.TestCase):
    def config(self):
        return {"host": "10.1.2.3", "installationRoot": "E:\\Fixture App", "id": "rmi_" + "a" * 32,
                "action": "inspect", "expectedComputerName": "FIXTURE", "planSha256": "b" * 64,
                "cliSha256": "c" * 64, "username": "DOMAIN\\fixture", "password": "synthetic-test-value"}

    def plan(self, config):
        return {"version": 1, "kind": remote.KIND, "id": config["id"], "installationRoot": config["installationRoot"],
                "expectedComputerName": config["expectedComputerName"], "expectedDatabase": {"host": "127.0.0.1", "port": 5433, "database": "fixture", "runtimeRole": "fixture_runtime"}}

    def test_scope_has_only_fixed_stage_and_node_cli_arguments(self):
        config = self.config()
        paths = remote.validate_config(config)
        self.assertEqual(paths["task"], "\\DevSetu-ReviewMigration-" + config["id"] + "-inspect")
        self.assertTrue(paths["nodeCommand"].endswith("\\node\\node-v24.19.0-win-x64\\node.exe"))
        self.assertTrue(paths["command"].endswith("\\WindowsPowerShell\\v1.0\\powershell.exe"))
        self.assertTrue(paths["receipt"].endswith("\\results\\inspect-result.json"))
        xml, arguments = remote.task_xml(paths, config["action"])
        self.assertNotIn(config["password"], xml)
        self.assertIn("PT15M", xml)
        remote.owned_xml(xml, paths, arguments)
        with self.assertRaises(ValueError):
            remote.owned_xml(xml.replace(paths["command"], "C:\\other.exe"), paths, arguments)
        with self.assertRaises(ValueError):
            remote.owned_xml(xml.replace("</Actions>", "<ComHandler><ClassId>other</ClassId></ComHandler></Actions>"), paths, arguments)

    def test_rejects_public_hosts_commands_path_escapes_and_invalid_identities(self):
        cases = [("host", "169.254.169.254"), ("host", "8.8.8.8"), ("installationRoot", "E:\\Fixture\\..\\Windows"),
                 ("installationRoot", "E:\\Fixture App "), ("installationRoot", "E:\\Fixture&whoami"),
                 ("action", "shell"), ("id", "rmi_../other"), ("cliSha256", "not-a-digest"),
                 ("username", "fixture\nother"), ("password", "synthetic\ninvalid")]
        for key, value in cases:
            with self.subTest(key=key, value=value):
                config = self.config()
                config[key] = value
                with self.assertRaises((ValueError, TypeError)):
                    remote.validate_config(config)
        config = self.config()
        config["command"] = "whoami"
        with self.assertRaises(ValueError):
            remote.validate_config(config)

    def test_plan_hash_target_kind_and_apply_artifacts_are_bound(self):
        config = self.config()
        plan = self.plan(config)
        raw = json.dumps(plan).encode()
        config["planSha256"] = hashlib.sha256(raw).hexdigest()
        remote.validate_plan(config, raw)
        with self.assertRaises(ValueError):
            remote.validate_plan(config, raw + b" ")
        for key, value in [("kind", "other"), ("id", "rmi_" + "d" * 32), ("expectedComputerName", "OTHER"), ("installationRoot", "D:\\Other")]:
            changed = copy.deepcopy(plan)
            changed[key] = value
            raw = json.dumps(changed).encode()
            config["planSha256"] = hashlib.sha256(raw).hexdigest()
            with self.assertRaises(ValueError):
                remote.validate_plan(config, raw)
        config["action"] = "apply"
        raw = json.dumps(plan).encode()
        config["planSha256"] = hashlib.sha256(raw).hexdigest()
        with self.assertRaises(ValueError):
            remote.validate_plan(config, raw)
        plan.update({key: "e" * 64 for key in ("sourceSha256", "mappingSha256", "sqlSha256")})
        raw = json.dumps(plan).encode()
        config["planSha256"] = hashlib.sha256(raw).hexdigest()
        remote.validate_plan(config, raw)

    def test_reused_artifact_changes_only_fixed_cli_path_and_must_match_bound_plan(self):
        config = self.config()
        config["artifactId"] = "rmi_" + "d" * 32
        paths = remote.validate_config(config)
        self.assertIn(config["artifactId"] + "\\package\\dist\\review-central-migrate.js", paths["cli"])
        for key in ("directory", "plan", "receipt", "console", "stderr", "task"):
            self.assertIn(config["id"], paths[key])
            self.assertNotIn(config["artifactId"], paths[key])
        plan = {**self.plan(config), "artifactId": config["artifactId"]}
        raw = json.dumps(plan).encode()
        config["planSha256"] = hashlib.sha256(raw).hexdigest()
        remote.validate_plan(config, raw)
        for candidate in ({key: value for key, value in plan.items() if key != "artifactId"}, {**plan, "artifactId": "rmi_" + "e" * 32}):
            raw = json.dumps(candidate).encode()
            config["planSha256"] = hashlib.sha256(raw).hexdigest()
            with self.assertRaises(ValueError):
                remote.validate_plan(config, raw)
        for artifact in ("rmi_../escape", "rmi_" + "E" * 32, None, 42, "E:\\Other"):
            config["artifactId"] = artifact
            with self.assertRaises(ValueError):
                remote.validate_config(config)
        config.update(action="prepare", artifactId="rmi_" + "d" * 32, archiveSha256="f" * 64)
        with self.assertRaises(ValueError):
            remote.validate_config(config)

    def test_result_file_cannot_be_reused_from_another_action_plan_or_machine(self):
        config = self.config()
        receipt = {"version": 1, "kind": "devsetu.reviews.central-migration-inspect-result.v1",
                   "migrationId": config["id"], "planSha256": config["planSha256"], "computerName": config["expectedComputerName"]}
        remote.validate_receipt(config, json.dumps(receipt).encode())
        for key, value in [("kind", "devsetu.reviews.central-migration-apply-result.v1"), ("migrationId", "rmi_" + "d" * 32),
                           ("planSha256", "f" * 64), ("computerName", "OTHER")]:
            changed = {**receipt, key: value}
            with self.assertRaises(ValueError):
                remote.validate_receipt(config, json.dumps(changed).encode())

    def test_prepare_script_is_fixed_hash_bound_and_requires_new_package(self):
        config = self.config()
        config.update(action="prepare", archiveSha256="d" * 64)
        paths = remote.validate_config(config)
        self.assertEqual(paths["command"], r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
        self.assertNotIn(config["password"], remote.prepare_script(config, paths))
        self.assertIn("-EncodedCommand ", paths["fixedArguments"])
        remote.owned_xml(*remote.task_xml(paths, "prepare")[:1], paths, remote.task_xml(paths, "prepare")[1])
        config.pop("archiveSha256")
        with self.assertRaises(ValueError):
            remote.validate_config(config)

    def test_failure_diagnostic_accepts_only_allowlisted_cli_code(self):
        safe = "review-central-migrate:fixture-failed"
        self.assertEqual(remote.sanitized_failure(json.dumps({"status": "failed", "code": safe, "secret": "synthetic-secret"}).encode()), safe)
        for value in ({"status": "failed", "code": "postgres://synthetic-secret"}, {"status": "failed", "code": "review-central-migrate:failed\nsynthetic-secret"}, {"status": "ok", "code": safe}, "synthetic-secret"):
            self.assertIsNone(remote.sanitized_failure(json.dumps(value).encode()))
        self.assertIsNone(remote.sanitized_failure(b"not json synthetic-secret"))

    def test_computer_diagnostic_is_only_a_validated_hostname_for_the_exact_error(self):
        code = "review-central-migrate:computer-mismatch"
        def payload(name, status="failed", actual_code=code):
            return json.dumps({"status": status, "code": actual_code, "observedComputerName": name, "extra": "synthetic-private"}).encode()
        self.assertEqual(remote.diagnostic_computer_name(payload("dcapp7"), code), "dcapp7")
        self.assertEqual(remote.diagnostic_computer_name(payload("DCAPP7.eesl.co.in"), code), "DCAPP7.eesl.co.in")
        for name in ("", "a" * 254, "host\nsynthetic-private", "host/path", "user@host", "host:123", None, 42):
            self.assertIsNone(remote.diagnostic_computer_name(payload(name), code))
        self.assertIsNone(remote.diagnostic_computer_name(payload("DCAPP7", status="ok"), code))
        self.assertIsNone(remote.diagnostic_computer_name(payload("DCAPP7", actual_code="review-central-migrate:other"), code))
        self.assertIsNone(remote.diagnostic_computer_name(payload("DCAPP7"), "review-central-migrate:other"))

    @unittest.skipUnless(os.name == "nt" and shutil.which("node"), "Windows finite Node capture fixture")
    def test_fixed_node_wrapper_captures_private_diagnostics_and_caps_output(self):
        for mode in ("safe-failure", "oversized"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(prefix="reviews-capture-") as fixture:
                config = self.config()
                config.update(installationRoot=fixture, expectedComputerName=os.environ["COMPUTERNAME"])
                paths = remote.validate_config(config)
                pathlib.Path(paths["cli"]).parent.mkdir(parents=True)
                plan = json.dumps(self.plan(config)).encode()
                pathlib.Path(paths["plan"]).write_bytes(plan)
                config["planSha256"] = hashlib.sha256(plan).hexdigest()
                cli = ("process.stdout.write(JSON.stringify({status:'failed',code:'review-central-migrate:fixture-failed',extra:'synthetic-private-field'}));process.stderr.write('synthetic-private-stderr');process.exitCode=1;" if mode == "safe-failure" else "process.stdout.write('x'.repeat(3*1024*1024));").encode()
                pathlib.Path(paths["cli"]).write_bytes(cli)
                config["cliSha256"] = hashlib.sha256(cli).hexdigest()
                paths["nodeCommand"] = shutil.which("node")
                script = remote.node_action_script(config, paths)
                command = [paths["command"], "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.b64encode(script.encode("utf-16le")).decode()]
                result = subprocess.run(command, capture_output=True, timeout=30)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(b"synthetic-private", result.stdout + result.stderr)
                self.assertLessEqual(pathlib.Path(paths["console"]).stat().st_size, 2097152)
                if mode == "safe-failure":
                    self.assertEqual(pathlib.Path(paths["stderr"]).read_text(), "synthetic-private-stderr")
                    self.assertEqual(remote.sanitized_failure(pathlib.Path(paths["console"]).read_bytes()), "review-central-migrate:fixture-failed")

    @unittest.skipUnless(os.name == "nt", "Windows .NET extraction fixture")
    def test_prepare_zip_fixture_and_malicious_entries(self):
        cases = ["valid", "traversal", "outside", "env", "duplicate-case", "symlink", "reparse", "oversized"]
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix="reviews-prepare-") as fixture:
                config = self.config()
                config.update(installationRoot=fixture, action="prepare", expectedComputerName=os.environ["COMPUTERNAME"], archiveSha256="d" * 64)
                paths = remote.validate_config(config)
                stage = pathlib.Path(paths["directory"])
                stage.mkdir(parents=True)
                raw = json.dumps(self.plan(config)).encode()
                pathlib.Path(paths["plan"]).write_bytes(raw)
                config["planSha256"] = hashlib.sha256(raw).hexdigest()
                cli = b"// synthetic fixture; never executed\n"
                config["cliSha256"] = hashlib.sha256(cli).hexdigest()
                archive = stage / "package.zip"
                with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
                    bundle.writestr("package/package.json", '{"name":"fixture"}')
                    bundle.writestr("package/dist/review-central-migrate.js", cli)
                    if case == "valid":
                        bundle.writestr("package/node_modules/fixture/index.js", "// inert")
                    elif case == "traversal":
                        bundle.writestr("package/dist/../../outside.txt", "inert")
                    elif case == "outside":
                        bundle.writestr("outside.txt", "inert")
                    elif case == "env":
                        bundle.writestr("package/node_modules/fixture/.env.private", "inert")
                    elif case == "duplicate-case":
                        bundle.writestr("package/PACKAGE.json", "inert")
                    elif case in ("symlink", "reparse"):
                        entry = zipfile.ZipInfo("package/node_modules/fixture/link")
                        entry.external_attr = (0o120777 << 16) if case == "symlink" else 1024
                        bundle.writestr(entry, "inert")
                    elif case == "oversized":
                        with bundle.open("package/dist/large.js", "w") as output:
                            for _ in range(65):
                                output.write(b"x" * (512 * 1024))
                config["archiveSha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
                paths = remote.validate_config(config)
                diagnostic_script = remote.prepare_script(config, paths).replace("} catch {exit 1}", "} catch {[Console]::Error.WriteLine($_.Exception.Message);exit 1}")
                command = [paths["command"], "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", base64.b64encode(diagnostic_script.encode("utf-16le")).decode()]
                result = subprocess.run(command, capture_output=True, timeout=30)
                if case == "valid":
                    self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
                    remote.validate_receipt(config, pathlib.Path(paths["receipt"]).read_bytes())
                    self.assertEqual(pathlib.Path(paths["cli"]).read_bytes(), cli)
                    self.assertNotEqual(subprocess.run(command, capture_output=True, timeout=30).returncode, 0)
                else:
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse((stage / "package").exists())


class LifecycleTests(unittest.TestCase):
    config = ScopeTests.config
    plan = ScopeTests.plan
    def test_mocked_task_success_cleanup_and_ambiguous_failures(self):
        # The existing pinned client is imported, but every transport call is replaced.
        runtime = pathlib.Path(remote.sys.executable).parent / "impacket.whl"
        if not runtime.exists():
            self.skipTest("existing operator client not available")
        remote.sys.path.insert(0, str(runtime))
        from impacket.dcerpc.v5 import tsch, transport
        class Missing(Exception):
            def get_error_code(self):
                return 2
        for scenario in ("success", "failed-exit", "existing", "register-ambiguous", "run-ambiguous", "replaced-on-cleanup"):
            with self.subTest(scenario=scenario):
                config = self.config()
                plan = json.dumps(self.plan(config)).encode()
                config["planSha256"] = hashlib.sha256(plan).hexdigest()
                cli = b"// inert"
                config["cliSha256"] = hashlib.sha256(cli).hexdigest()
                paths = remote.validate_config(config)
                receipt = {"version": 1, "kind": "devsetu.reviews.central-migration-inspect-result.v1", "migrationId": config["id"], "planSha256": config["planSha256"], "computerName": config["expectedComputerName"]}
                fake_rpc, fake_smb, fake_client = mock.Mock(), mock.Mock(), mock.Mock()
                fake_smb.getServerName.return_value = config["expectedComputerName"]
                artifacts = {paths["plan"][3:]: plan, paths["cli"][3:]: cli, paths["receipt"][3:]: json.dumps(receipt).encode()}
                artifacts[paths["console"][3:]] = b'{"status":"failed","code":"review-central-migrate:fixture-failed","extra":"synthetic-private"}'
                fake_smb.getFile.side_effect = lambda share, path, callback: callback(artifacts[path])
                fake_client.get_dce_rpc.return_value = fake_rpc
                fake_client.get_smb_connection.return_value = fake_smb
                fake_client.get_credentials.return_value = ("fixture", "synthetic", "DOMAIN", "", "", "", None, None)
                xml, _ = remote.task_xml(paths, "inspect")
                retrievals = [Missing(), {"pXml": xml}, {"pXml": xml}]
                if scenario == "existing":
                    retrievals = [{"pXml": xml}]
                if scenario == "replaced-on-cleanup":
                    retrievals[-1] = {"pXml": xml.replace(paths["command"], r"C:\other.exe")}
                with mock.patch.object(transport, "DCERPCTransportFactory", return_value=fake_client), \
                     mock.patch.object(tsch, "hSchRpcRetrieveTask", side_effect=retrievals), \
                     mock.patch.object(tsch, "hSchRpcRegisterTask", side_effect=TimeoutError() if scenario == "register-ambiguous" else None) as register, \
                     mock.patch.object(tsch, "hSchRpcRun", side_effect=TimeoutError() if scenario == "run-ambiguous" else None) as run, \
                     mock.patch.object(tsch, "hSchRpcGetTaskInfo", return_value={"pState": tsch.TASK_STATE_READY}), \
                     mock.patch.object(tsch, "hSchRpcGetLastRunInfo", return_value={"pLastRuntime": {"wYear": 2026}, "pLastReturnCode": 1 if scenario == "failed-exit" else 0}), \
                     mock.patch.object(tsch, "hSchRpcDelete") as delete:
                    result = remote.execute(config)
                self.assertNotIn("password", config)
                self.assertLessEqual(register.call_count, 1)
                self.assertLessEqual(run.call_count, 1)
                if scenario in ("success", "failed-exit"):
                    self.assertEqual(delete.call_count, 1)
                    self.assertTrue(result["temporaryTaskRemoved"])
                    self.assertEqual(result["status"], "PASS" if scenario == "success" else "FAIL")
                    if scenario == "failed-exit":
                        self.assertEqual(result["diagnosticCode"], "review-central-migrate:fixture-failed")
                        self.assertNotIn("synthetic-private", json.dumps(result))
                else:
                    self.assertEqual(delete.call_count, 0)
                    self.assertEqual(result["status"], "FAIL")
                    self.assertEqual(result["registrationOutcomeUnknown"], scenario == "register-ambiguous")
                    if scenario != "existing":
                        self.assertFalse(result["temporaryTaskRemoved"])


if __name__ == "__main__":
    unittest.main()
