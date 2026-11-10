"""Local ChatGPT paste entry: preparation only, on disposable bridge state."""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import puente
from puente import Bridge, BridgeError, digest

from test_bridge import BridgeTests, TestProtector


class ChatgptEntryTests(unittest.TestCase):
    setUp = BridgeTests.setUp
    tearDown = BridgeTests.tearDown
    def test_local_preparation_is_durable_and_never_authorizes_or_executes(self):
        instruction = "Comprobar una función sintética; no cambiar GO.\nLínea 2."
        job = self.bridge.prepare_chatgpt(instruction, "4", "https://trello.com/c/1uXs7ZNL/176")
        self.assertEqual(job["state"], "prepared")
        self.assertEqual(job["data"]["source"], {"source": "CHATGPT", "entry": "local-panel",
            "trello_card_url": "https://trello.com/c/1uXs7ZNL"})
        self.assertEqual(job["data"]["instruction_sha256"], digest(instruction))
        self.assertTrue(job["created"])
        self.assertEqual((self.home / "preparadas" / job["id"] / "INSTRUCCION.txt").read_text(encoding="utf-8"), instruction)
        self.assertEqual(self.calls, [])
        with self.bridge.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM approvals").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM jobs WHERE state='running'").fetchone()[0], 0)
        restored = Bridge(self.home, self.home / "private", TestProtector(), self.bridge.transport,
            {"windows_sid": "S-1-5-TEST", "source": "unit-test"})
        self.assertEqual(restored.job(job["id"])["data"]["instruction"], instruction)
        with self.assertRaises(BridgeError):
            restored.launch(restored.execution_payload(job["id"]), "missing", False)

    def test_duplicate_and_invalid_input_are_controlled_without_new_jobs(self):
        first = self.bridge.prepare_chatgpt("Instrucción segura", "4")
        self.assertEqual(self.bridge.prepare_chatgpt("Instrucción segura", "4")["id"], first["id"])
        for instruction, agent, card in [(None, "4", ""), (" ", "4", ""),
                                         ("x\x00y", "4", ""), ("ñ" * 600000, "4", ""),
                                         ("texto", "PRUEBA", ""), ("texto", "4", "https://evil.example/c/1uXs7ZNL")]:
            with self.assertRaises(BridgeError):
                self.bridge.prepare_chatgpt(instruction, agent, card)
        with self.bridge.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM jobs").fetchone()[0], 1)

    def test_go_execution_checks_remote_main_before_consuming_approval(self):
        self.bridge.config["agents"]["4"].update(enabled=True, workspace=str(self.home), sandbox="workspace-write")
        job = self.bridge.prepare_chatgpt("Trabajo sintético", "4")
        payload = self.bridge.execution_payload(job["id"])
        approval = self.bridge.approve("execute", payload, "local-panel-owner")
        with patch.object(self.bridge, "git_state", side_effect=BridgeError("WORKSPACE_OUTDATED", "test")) as check:
            with self.assertRaises(BridgeError):
                self.bridge.launch(payload, approval, False)
        check.assert_called_once()  # Snapshot revalidation fails closed before release.
        with self.bridge.db() as db:
            self.assertIsNotNone(db.execute("SELECT used FROM approvals WHERE id=?", (approval,)).fetchone()[0])
        self.assertEqual(self.bridge.job(job["id"])["state"], "prepared")

    def test_remote_main_mismatch_is_rejected_by_git_state(self):
        expected = "a" * 40
        replies = [subprocess.CompletedProcess([], 0, expected + "\n", ""),
                   subprocess.CompletedProcess([], 0, "", ""),
                   subprocess.CompletedProcess([], 0, "https://github.com/goappdev01/goapp.git\n", ""),
                   subprocess.CompletedProcess([], 0, "b" * 40 + "\trefs/heads/main\n", "")]
        with patch("puente.subprocess.run", side_effect=replies):
            with self.assertRaises(BridgeError) as rejected:
                self.bridge.git_state(self.home, check_main=True)
        self.assertEqual(rejected.exception.code, "WORKSPACE_OUTDATED")

    def test_http_route_requires_local_session_origin_csrf_and_exact_fields(self):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        self.bridge.config["port"] = port
        (self.home / "panel.html").write_text("<!doctype html><title>Disposable test</title>", encoding="utf-8")
        created = threading.Event()
        holder = {}
        real_server = puente.LocalBridgeServer

        def capture(*args):
            holder["httpd"] = real_server(*args)
            created.set()
            return holder["httpd"]

        with patch.object(puente, "LocalBridgeServer", side_effect=capture):
            thread = threading.Thread(target=puente.server, args=(self.bridge, False), daemon=True)
            thread.start()
            self.assertTrue(created.wait(3), "disposable loopback server did not start")
        origin = f"http://localhost:{port}"

        def request(method, path, payload=None, headers=None):
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            try:
                body = json.dumps(payload).encode() if payload is not None else None
                connection.request(method, path, body=body, headers={"Host": f"localhost:{port}",
                    **({"Content-Type": "application/json"} if body is not None else {}), **(headers or {})})
                response = connection.getresponse()
                data = response.read()
                return response.status, dict(response.getheaders()), data
            finally:
                connection.close()

        try:
            payload = {"instruction": "Sintética y local", "agent": "4"}
            self.assertEqual(request("POST", "/api/prepare-chatgpt", payload)[0], 403)
            status, headers, _ = request("GET", "/")
            self.assertEqual(status, 200)
            cookie = headers["Set-Cookie"].split(";", 1)[0]
            status, _, raw = request("GET", "/api/status", headers={"Cookie": cookie})
            self.assertEqual(status, 200)
            state = json.loads(raw)
            self.assertFalse(state["automatic_execution"])
            self.assertTrue(state["chatgpt_local_entry"])
            self.assertFalse(state["chatgpt_remote_enabled"])
            base = {"Cookie": cookie, "Origin": origin, "X-GO-CSRF": state["csrf"]}
            self.assertEqual(request("POST", "/api/prepare-chatgpt", payload,
                {**base, "Origin": "http://evil.example"})[0], 403)
            self.assertEqual(request("POST", "/api/prepare-chatgpt", payload,
                {**base, "X-GO-CSRF": "wrong"})[0], 403)
            self.assertEqual(request("POST", "/api/prepare-chatgpt", {**payload, "allow_publish": True}, base)[0], 400)
            status, _, raw = request("POST", "/api/prepare-chatgpt", payload, base)
            self.assertEqual(status, 200)
            job = json.loads(raw)
            self.assertEqual(job["state"], "prepared")
            self.assertEqual(job["data"]["source"]["source"], "CHATGPT")
            self.assertEqual(json.loads(request("POST", "/api/prepare-chatgpt", payload, base)[2])["id"], job["id"])
            with self.bridge.db() as db:
                self.assertEqual(db.execute("SELECT count(*) FROM approvals").fetchone()[0], 0)
        finally:
            holder["httpd"].shutdown()
            thread.join(timeout=3)
            holder["httpd"].server_close()


if __name__ == "__main__":
    unittest.main()
