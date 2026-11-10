import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_bridge as fixtures
from puente import (BridgeError, LocalBridgeServer, classify_execution, codex_command,
                    policy_evidence, TEST_INSTRUCTION)


class ExecutorTests(unittest.TestCase):
    setUp = fixtures.BridgeTests.setUp
    tearDown = fixtures.BridgeTests.tearDown
    approval = fixtures.BridgeTests.approval

    def run_fake(self, response, *, mode="workspace-write", stderr="", command_item=None, turn_failed=False, bound=False):
        # Only disposable destinations, never the real configured Agent 4.
        self.bridge.config["agents"]["PRUEBA"]["sandbox"] = mode
        events = [{"type": "thread.started", "thread_id": "synthetic-only"}]
        if command_item:
            events.append({"type": "item.completed", "item": command_item})
        events += [{"type": "item.completed", "item": {"type": "agent_message", "text": response}},
                   {"type": "turn.failed" if turn_failed else "turn.completed"}]
        process = type("Process", (), {"pid": 123, "stdin": io.StringIO(),
            "stdout": io.StringIO("\n".join(map(json.dumps, events))), "stderr": io.StringIO(stderr),
            "wait": lambda s: 0, "poll": lambda s: 0})()
        job = self.bridge.prepare_text("Comprobación sintética sin GO", "PRUEBA")
        payload = self.bridge.execution_payload(job["id"])
        if bound:
            with self.bridge.db() as db:
                db.execute("INSERT INTO factory_attempts(card_id,attempt,title,instruction_sha,state,job_id) VALUES('synthetic-card',1,'test','sha','running',?)",(job["id"],))
                db.execute("INSERT INTO wheel_grants VALUES('synthetic-card',1,'synthetic-grant',?,?,'working',NULL)",
                           (json.dumps({"allowed_files":["file.ts"],"test_files":["test.mjs"]}),"fixture"))
        with patch.object(self.bridge, "git_state", return_value={"git": False}), \
             patch("puente.subprocess.Popen", return_value=process) as spawn:
            self.bridge.launch(payload, self.approval("execute", payload), False)
        return self.bridge.job(job["id"]), spawn.call_args

    def test_launcher_keeps_config_native_sandbox_and_never_escalates(self):
        for mode in ("read-only", "workspace-write"):
            command = codex_command("codex.exe", mode, "C:/assigned folder", "C:/result.txt")
            self.assertEqual(command[1:4], ["-a", "never", "exec"])
            self.assertEqual(command[command.index("--sandbox") + 1], mode)
            self.assertEqual(command[command.index("-C") + 1], "C:/assigned folder")
            for unsafe in ("--ignore-user-config", "--ignore-rules", "--yolo", "--full-auto",
                           "--dangerously-bypass-approvals-and-sandbox", "danger-full-access"):
                self.assertNotIn(unsafe, command)

    def test_invalid_or_unrestricted_sandbox_is_rejected(self):
        for mode in ("danger-full-access", "", "external-sandbox", "--yolo"):
            with self.assertRaises(BridgeError):
                codex_command("codex", mode, self.home, self.home / "out.txt")
        self.bridge.config["agents"]["PRUEBA"]["sandbox"] = "danger-full-access"
        job = self.bridge.prepare_text("test", "PRUEBA")
        with self.assertRaises(BridgeError):
            self.bridge.execution_payload(job["id"])

    def test_write_launch_respects_cwd_and_preserves_network_restriction(self):
        with patch.dict(os.environ, {"CODEX_SANDBOX_NETWORK_DISABLED": "1", "TRELLO_TOKEN": "synthetic-never-child"}):
            job, arguments = self.run_fake('Hecho.\nGO_BRIDGE_RESULT: {"status":"completed"}')
        command = arguments.args[0]
        self.assertEqual(command[command.index("--sandbox") + 1], "workspace-write")
        self.assertEqual(arguments.kwargs["cwd"], str(self.home / "sandbox"))
        self.assertEqual(arguments.kwargs["env"]["CODEX_SANDBOX_NETWORK_DISABLED"], "1")
        self.assertNotIn("TRELLO_TOKEN", arguments.kwargs["env"])
        self.assertEqual(job["state"], "completed")
        self.assertEqual(job["result"]["functional_status"], "reported_completed")
        self.assertFalse(job["result"]["functional_success_independently_verified"])

    def test_exit_zero_with_real_historical_inability_is_blocked(self):
        response = ("Bloqueo real de infraestructura: esta sesión está configurada en solo lectura, "
                    "sin posibilidad de solicitar ampliación de permisos.\nNo pude verificar HEAD. "
                    "No modifiqué archivos ni ejecuté pruebas.")
        job, _ = self.run_fake(response)
        self.assertEqual(job["result"]["exit_code"], 0)
        self.assertEqual(job["result"]["process_status"], "completed")
        self.assertEqual(job["state"], "blocked")
        self.assertTrue(job["result"]["policy_errors"])

    def test_policy_rejected_command_overrides_claim_of_success(self):
        job, _ = self.run_fake('GO_BRIDGE_RESULT: {"status":"completed"}', command_item={
            "type": "command_execution", "status": "failed", "exit_code": 1,
            "aggregated_output": "Rejected(reason: blocked by policy)"})
        self.assertEqual(job["state"], "blocked")
        self.assertEqual(job["result"]["failed_commands"], 1)

    def test_late_stderr_policy_error_is_not_lost_after_first_thirty_lines(self):
        job, _ = self.run_fake('GO_BRIDGE_RESULT: {"status":"completed"}',
                               stderr=("ordinary startup warning\n" * 40) + "command blocked by policy\n")
        self.assertEqual(job["state"], "blocked")
        self.assertTrue(job["result"]["policy_errors"])

    def test_warning_alone_does_not_mark_task_blocked(self):
        job, _ = self.run_fake('GO_BRIDGE_RESULT: {"status":"completed"}',
                               stderr="WARN shell_snapshot unsupported for PowerShell\n")
        self.assertEqual(job["state"], "completed")
        self.assertEqual(job["result"]["policy_errors"], [])

    def test_turn_failed_or_explicit_failure_cannot_be_success(self):
        result = classify_execution(0, True, 'GO_BRIDGE_RESULT: {"status":"completed"}', turn_failed=True)
        self.assertEqual(result["state"], "failed")
        result = classify_execution(0, True, 'GO_BRIDGE_RESULT: {"status":"failed"}')
        self.assertEqual(result["state"], "failed")
        result = classify_execution(0, True, "No pude completar la tarea.")
        self.assertEqual(result["state"], "failed")

    def test_transport_success_without_report_needs_review(self):
        self.assertEqual(classify_execution(0, True, "Hay una respuesta.")["state"], "needs_review")
        self.assertEqual(classify_execution(0, True, 'GO_BRIDGE_RESULT: {"status":"completed"}',
                                            failed_commands=1)["state"], "needs_review")

    def test_blocked_job_retry_only_prepares_and_needs_new_approval(self):
        job, _ = self.run_fake('GO_BRIDGE_RESULT: {"status":"blocked"}')
        with patch.object(self.bridge, "git_state", return_value={"git": False}), patch("puente.subprocess.Popen") as spawn:
            retry = self.bridge.prepare_retry(job["id"], "Revisado por propietario")
            self.assertEqual(retry["state"], "prepared")
            payload = self.bridge.execution_payload(retry["id"])
            with self.assertRaises(BridgeError):
                self.bridge.launch(payload, "no-approval", False)
            spawn.assert_not_called()

    def test_preparation_never_launches_and_read_only_approval_cannot_authorize_write(self):
        job = self.bridge.prepare_text("No ejecutar automáticamente", "PRUEBA")
        readonly = self.bridge.execution_payload(job["id"])
        approval = self.approval("execute", readonly)
        altered = {**readonly, "sandbox": "workspace-write"}
        with patch.object(self.bridge,"git_state",return_value={"git":False}), patch("puente.subprocess.Popen") as spawn:
            with self.assertRaises(BridgeError):
                self.bridge.launch(altered, approval, False)
            spawn.assert_not_called()
        self.assertEqual(self.bridge.job(job["id"])["state"], "prepared")

    @unittest.skipUnless(os.name == "nt", "Exclusive Windows socket")
    def test_server_uses_exclusive_bind_without_reusable_port(self):
        import socket
        instance = object.__new__(LocalBridgeServer)
        instance.socket = MagicMock()
        self.assertFalse(instance.allow_reuse_address)
        with patch("puente.ThreadingHTTPServer.server_bind") as parent:
            instance.server_bind()
        instance.socket.setsockopt.assert_called_once_with(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        parent.assert_called_once()


if __name__ == "__main__":
    unittest.main()

    def test_factory_worker_uses_github_only_profile_and_keeps_credentials_out(self):
        job,args=self.run_fake('Hecho.\nGO_BRIDGE_RESULT: {"status":"completed"}',bound=True)
        command=args.args[0];env=args.kwargs["env"]
        self.assertIn('default_permissions="go_factory"',command);self.assertNotIn("-P",command);self.assertNotIn("--sandbox",command)
        self.assertIn('permissions.go_factory.extends=":workspace"',command)
        self.assertIn('features.network_proxy.domains={"github.com"="allow","api.github.com"="allow","localhost"="allow","127.0.0.1"="allow"}',command)
        self.assertEqual(env["GIT_CONFIG_VALUE_0"],"openssl");self.assertEqual(env["GCM_INTERACTIVE"],"never")
        self.assertNotIn("GITHUB_TOKEN",env);self.assertNotIn("GH_TOKEN",env)
        self.assertEqual(job["state"],"completed")
