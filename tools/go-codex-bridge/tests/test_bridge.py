import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from puente import Bridge, BridgeError, DPAPI, TEST_INSTRUCTION, canonical, digest, safe_http, scrub, process_alive


class TestProtector:
    def protect(self, value):
        return b"SYNTHETIC-TEST-ONLY:" + base64.b64encode(value)
    def unprotect(self, value):
        return base64.b64decode(value.split(b":", 1)[1])


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="go-puente-unit-")
        self.home = Path(self.temp.name)
        root=Path(__file__).resolve().parents[1]
        source=root/'config.json' if (root/'config.json').exists() else root/'config.example.json'
        self.config = json.loads(source.read_text(encoding='utf-8-sig'))
        self.config["agents"]["PRUEBA"]["enabled"] = True
        self.config["agents"]["4"].update(workspace="sandbox", sandbox="read-only", enabled=True)
        (self.home / "config.json").write_text(json.dumps(self.config), encoding="utf-8")
        self.calls = []
        self.transport = lambda *args: self.calls.append(args)
        self.bridge = Bridge(self.home, self.home / "private", TestProtector(),
                             lambda *args: self.transport(*args), {"windows_sid": "S-1-5-TEST", "source": "unit-test"})
        self.bridge.owner_confirmation = lambda action,payload: True  # Synthetic owner input; never opens a real dialog.
    def tearDown(self):
        self.temp.cleanup()
    def configured(self):
        self.bridge.configure_client("synthetic-oauth-client", "synthetic-client-secret")
    def authorized(self):
        self.configured()
        self.bridge.save_tokens(self.bridge.vault(), {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
            "scope": "read:board:trello write:board:trello offline_access", "expires_in": 3600})
    def approval(self, action, payload):
        return self.bridge.approve(action, payload, "local-panel-owner")
    def test_pkce_uses_s256_exact_callback_and_configured_scopes_without_secret(self):
        self.configured()
        url = self.bridge.begin_oauth()
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        verifier = self.bridge.oauth["verifier"]
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        self.assertEqual(params["code_challenge"], [challenge])
        self.assertEqual(len(verifier), 43)
        self.assertEqual(params["code_challenge_method"], ["S256"])
        self.assertEqual(params["redirect_uri"], ["http://localhost:8765/trello/callback"])
        self.assertEqual(set(params["scope"][0].split()), {"read:board:trello", "write:board:trello", "offline_access"})
        self.assertNotIn("secret", url)
        self.assertNotIn("audience", params)
        previous = self.bridge.oauth["state"]
        self.bridge.begin_oauth()
        self.assertNotEqual(previous, self.bridge.oauth["state"])
    def test_invalid_and_duplicate_state_never_exchange_code(self):
        self.configured(); self.bridge.begin_oauth()
        for query in ("state=wrong&code=fake", "state=a&state=b&code=fake", "bad"):
            with self.assertRaises((BridgeError, ValueError)):
                self.bridge.callback(query)
        self.assertEqual(self.calls, [])
    def test_callback_is_single_use_and_never_stores_code_or_verifier(self):
        self.configured(); self.bridge.begin_oauth()
        state = self.bridge.oauth["state"]
        self.transport = lambda *args: {"access_token": "test-token", "refresh_token": "test-refresh",
             "scope": "read:board:trello write:board:trello offline_access", "expires_in": 3600}
        self.bridge.callback("state=" + state + "&code=one-use-fake-code")
        self.assertEqual(self.bridge.vault()["access_token"], "test-token")
        self.assertNotIn("code", self.bridge.vault())
        self.assertNotIn("verifier", self.bridge.vault())
        with self.assertRaises(BridgeError): self.bridge.callback("state=" + state + "&code=one-use-fake-code")
    def test_user_denial_does_not_create_tokens(self):
        self.configured(); self.bridge.begin_oauth(); state=self.bridge.oauth["state"]
        with self.assertRaises(BridgeError): self.bridge.callback("state="+state+"&error=access_denied")
        self.assertNotIn("access_token", self.bridge.vault())
    def test_scope_escalation_or_missing_write_is_rejected(self):
        self.configured()
        for scope in ("read:board:trello", "read:board:trello write:board:trello write:member:trello", ""):
            with self.assertRaises(BridgeError): self.bridge.save_tokens(self.bridge.vault(), {"access_token":"x","refresh_token":"y","scope":scope,"expires_in":3600})
        self.assertNotIn("access_token", self.bridge.vault())
    def test_credentials_stay_out_of_status_and_audit(self):
        self.authorized()
        text=canonical(self.bridge.status())
        with self.bridge.db() as db: text += str([dict(r) for r in db.execute("SELECT * FROM audit")])
        for secret in ("synthetic-client-secret","synthetic-access","synthetic-refresh"):
            self.assertNotIn(secret,text)
    def test_configuring_same_client_preserves_authorization(self):
        self.authorized(); self.configured()
        self.assertEqual(self.bridge.vault()["access_token"], "synthetic-access")
    def test_refresh_rotation_is_serialized_and_durable(self):
        self.authorized(); value=self.bridge.vault(); value["expires_at"]=0; self.bridge.store_vault(value)
        def renew(*args):
            self.calls.append(args); time.sleep(.05)
            return {"access_token":"renewed","refresh_token":"rotated","expires_in":3600,"scope":"read:board:trello write:board:trello offline_access"}
        self.transport=renew
        results=[]; threads=[threading.Thread(target=lambda:results.append(self.bridge.token())) for _ in range(2)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(results,["renewed","renewed"]); self.assertEqual(len(self.calls),1)
        self.assertEqual(self.bridge.vault()["refresh_token"],"rotated")
    def test_uncertain_refresh_is_not_replayed(self):
        self.authorized(); value=self.bridge.vault(); value["expires_at"]=0; self.bridge.store_vault(value)
        def fail(*args):self.calls.append(args);raise BridgeError("NETWORK_UNCERTAIN","test")
        self.transport=fail
        for _ in range(2):
            with self.assertRaises(BridgeError):self.bridge.token()
        self.assertEqual(len(self.calls),1)
    def read_fixture(self, count=101, changed=False):
        self.authorized()
        card={"id":"a"*24,"idBoard":"b"*24,"idList":"c"*24,"name":"V1 AGENTE 2","desc":"Descripción completa","url":"https://trello.com/c/1uXs7ZNL/176","dateLastActivity":"fixed"}
        comments=[{"id":format(i+1,"024x"),"type":"commentCard","date":format(i,"06"),"data":{"text":("Texto largo ñ 👋\r\n"*1500) if i==0 else "Comentario "+str(i)}} for i in range(count)]
        def read(method,url,*args):
            self.calls.append((method,url))
            p=urllib.parse.urlsplit(url);q=urllib.parse.parse_qs(p.query)
            if p.path.endswith("/actions"):
                offset=int(q.get("before",["0"])[0],16)
                return comments[offset:offset+int(q["limit"][0])]
            if q.get("fields")==["id,dateLastActivity"]:return {"id":card["id"],"dateLastActivity":"changed" if changed else "fixed"}
            return card
        self.transport=read
        return card,comments
    def test_pagination_downloads_all_101_comments_and_preserves_long_unicode_crlf(self):
        _,comments=self.read_fixture()
        result=self.bridge.read_card("https://trello.com/c/1uXs7ZNL/176")
        data=result["data"]
        self.assertEqual(len(data["comments"]),101);self.assertEqual(data["verification"]["pages"],2)
        self.assertEqual(data["comments"][0]["text"],comments[0]["data"]["text"])
        self.assertEqual((self.home/result["snapshot"]).parent.joinpath("comentario-001.txt").read_bytes().decode(), comments[0]["data"]["text"])
        self.assertTrue(all(method=="GET" for method,_ in self.calls))
    def test_stalled_pagination_is_not_reported_complete(self):
        self.authorized()
        item={"id":"a"*24,"type":"commentCard","data":{"text":"x"}}
        self.transport=lambda method,url,*args: [item] if "/actions?" in url else {"id":"b"*24}
        with self.assertRaises(BridgeError):self.bridge.read_card("https://trello.com/c/1uXs7ZNL/176",page_size=1)
    def test_unstable_card_cannot_be_prepared_for_execution(self):
        self.read_fixture(1,changed=True);result=self.bridge.read_card("https://trello.com/c/1uXs7ZNL/176")
        with self.assertRaises(BridgeError):self.bridge.prepare(result["snapshot"],result["data"]["comments"][0]["id"])
    def test_preparation_routes_to_agent_without_executing_or_authorizing(self):
        self.read_fixture(1);result=self.bridge.read_card("https://trello.com/c/1uXs7ZNL/176")
        job=self.bridge.prepare(result["snapshot"],result["data"]["comments"][0]["id"])
        self.assertEqual(job["state"],"prepared");self.assertEqual(job["data"]["agent"],"2")
        with self.bridge.db() as db:self.assertEqual(db.execute("SELECT count(*) FROM approvals").fetchone()[0],0)
    def test_mutated_snapshot_is_rejected(self):
        self.read_fixture(1);result=self.bridge.read_card("https://trello.com/c/1uXs7ZNL/176")
        path=self.home/result["snapshot"];data=json.loads(path.read_text());data["comments"][0]["text"]="mutated";path.write_text(json.dumps(data))
        with self.assertRaises(BridgeError):self.bridge.prepare(result["snapshot"],data["comments"][0]["id"])
    def test_card_and_snapshot_traversal_and_foreign_urls_are_rejected(self):
        for url in ("https://evil.example/c/1uXs7ZNL", "http://trello.com/c/1uXs7ZNL", "https://trello.com.evil/c/1uXs7ZNL"):
            with self.assertRaises(BridgeError):self.bridge.card_short(url)
        with self.assertRaises(BridgeError):self.bridge.snapshot("../private.json")
    def test_remote_card_text_cannot_authorize_itself(self):
        with self.assertRaises(BridgeError):self.bridge.approve("execute",{},"trello-comment-owner-says-authorized")
    def test_approval_binds_exact_payload_actor_action_and_is_one_use(self):
        payload={"job":"one","sha":"original"};approval=self.approval("execute",payload)
        for action,data in (("trello-write",payload),("execute",{"job":"one","sha":"changed"})):
            with self.bridge.db() as db:
                with self.assertRaises(BridgeError):self.bridge.consume(db,approval,action,data)
        with self.bridge.db() as db:self.bridge.consume(db,approval,"execute",payload)
        with self.bridge.db() as db:
            with self.assertRaises(BridgeError):self.bridge.consume(db,approval,"execute",payload)
    def test_expired_approval_is_rejected(self):
        payload={"job":"one"};approval=self.approval("execute",payload)
        with self.bridge.db() as db:db.execute("UPDATE approvals SET created=0 WHERE id=?",(approval,))
        with self.bridge.db() as db:
            with self.assertRaises(BridgeError):self.bridge.consume(db,approval,"execute",payload)
    def test_duplicate_instruction_reuses_existing_job(self):
        first=self.bridge.prepare_text("Prueba autorizada","PRUEBA");second=self.bridge.prepare_text("Prueba autorizada","PRUEBA")
        self.assertEqual(first["id"],second["id"])
    def test_launch_needs_approval_and_cannot_be_repeated(self):
        job=self.bridge.prepare_text("Prueba autorizada","PRUEBA");payload=self.bridge.execution_payload(job["id"])
        with self.assertRaises(BridgeError):self.bridge.launch(payload,"missing",False)
        approval=self.approval("execute",payload)
        with patch.object(self.bridge,"run_codex") as run:self.bridge.launch(payload,approval,False);run.assert_called_once()
        with self.assertRaises(BridgeError):self.bridge.launch(payload,self.approval("execute",payload),False)
    def test_concurrent_workspaces_are_serialized_before_consuming_second_approval(self):
        first=self.bridge.prepare_text("one","PRUEBA");second=self.bridge.prepare_text("two","PRUEBA")
        p=self.bridge.execution_payload(first["id"]);q=self.bridge.execution_payload(second["id"])
        with patch.object(self.bridge,"run_codex"):self.bridge.launch(p,self.approval("execute",p),False)
        with self.assertRaises(BridgeError) as error:self.approval("execute",q)
        self.assertEqual(error.exception.code,"AUTHORIZATION_DURING_EXECUTION")
        self.assertEqual(self.bridge.job(second["id"])["state"],"prepared")
    def test_changed_agent_settings_require_preparing_again(self):
        job=self.bridge.prepare_text("one","PRUEBA");self.bridge.config["agents"]["PRUEBA"]["sandbox"]="workspace-write"
        with self.assertRaises(BridgeError):self.bridge.execution_payload(job["id"])
    def test_unassigned_go_agents_cannot_execute(self):
        job=self.bridge.prepare_text("No cambiar GO","1")
        with self.assertRaises(BridgeError):self.bridge.execution_payload(job["id"])
    def test_cli_capture_distinguishes_transport_completion_from_functional_success(self):
        events=[{"type":"thread.started","thread_id":"fake-session"},{"type":"item.completed","item":{"type":"agent_message","text":"GO_PUENTE_CODEX_OK"}},{"type":"turn.completed"}]
        process=type("Process",(),{"pid":123,"stdin":io.StringIO(),"stdout":io.StringIO("\n".join(map(json.dumps,events))),"stderr":io.StringIO(""),"wait":lambda s:0,"poll":lambda s:0})()
        job=self.bridge.prepare_text(TEST_INSTRUCTION,"PRUEBA");payload=self.bridge.execution_payload(job["id"])
        with patch.object(self.bridge,"git_state",return_value={"git":False}), patch("puente.subprocess.Popen",return_value=process) as spawn:self.bridge.launch(payload,self.approval("execute",payload),False)
        result=self.bridge.job(job["id"])
        self.assertEqual(result["state"],"completed");self.assertTrue(result["result"]["test_B_exact_response"])
        self.assertFalse(result["result"]["functional_success_independently_verified"])
        command=spawn.call_args.args[0];self.assertIn("--sandbox",command);self.assertIn("read-only",command);self.assertNotIn("--dangerously-bypass-approvals-and-sandbox",command)
        self.assertNotIn("--ignore-user-config",command);self.assertEqual(command[1:4],["-a","never","exec"])
        self.assertEqual(spawn.call_args.kwargs["cwd"],str(self.home/"sandbox"))
    def test_restart_preserves_interrupted_job_without_rerun(self):
        job=self.bridge.prepare_text("test","PRUEBA")
        with self.bridge.db() as db:db.execute("UPDATE jobs SET state='running',pid=123 WHERE id=?",(job["id"],))
        with patch("puente.process_alive",return_value=False):self.bridge.recover_interrupted()
        self.assertEqual(self.bridge.job(job["id"])["state"],"interrupted")
    def test_running_child_remains_blocking_after_restart(self):
        job=self.bridge.prepare_text("test","PRUEBA")
        with self.bridge.db() as db:db.execute("UPDATE jobs SET state='running',pid=123 WHERE id=?",(job["id"],))
        with patch("puente.process_alive",return_value=True):self.bridge.recover_interrupted()
        self.assertEqual(self.bridge.job(job["id"])["state"],"detached")
    def test_audit_tampering_is_detected(self):
        self.bridge.audit("test",{"original":True})
        with self.bridge.db() as db:db.execute("UPDATE audit SET data='{}'")
        with self.assertRaises(BridgeError):self.bridge.verify_audit()
    def test_unapproved_write_and_foreign_destinations_are_blocked(self):
        with self.assertRaises(BridgeError):self.bridge.api("/1/cards",method="POST",body={})
        for url in ("https://evil.example/1/cards","http://api.trello.com/1/cards","https://api.trello.com:8443/1/cards"):
            with self.assertRaises(BridgeError):safe_http("GET",url,token="synthetic")
    def test_write_requires_exact_specific_approval_and_verifies_saved_comment(self):
        self.authorized(); self.bridge.safety.write_context=lambda payload: {"synthetic":"exact-context"};record=self.bridge.prepare_write("comment",{"card_id":"a"*24,"text":"Prueba de escritura"})
        with self.assertRaises(BridgeError):self.bridge.write(record["operation"],"missing")
        def request(method,url,body=None,*args):
            self.calls.append((method,url,body))
            return {"id":"f"*24} if method=="POST" else {"id":"f"*24,"data":{"text":record["payload"]["text"]}}
        self.transport=request
        result=self.bridge.write(record["operation"],self.approval("trello-write",record))
        self.assertEqual(result["state"],"verified");self.assertEqual([x[0] for x in self.calls],["POST","GET"])
        with self.assertRaises(BridgeError):self.bridge.write(record["operation"],self.approval("trello-write",record))
    def test_uncertain_mutation_is_retained_and_never_retried(self):
        self.authorized(); self.bridge.safety.write_context=lambda payload: {"synthetic":"exact-context"};record=self.bridge.prepare_write("comment",{"card_id":"a"*24,"text":"synthetic"})
        def fail(*args):self.calls.append(args);raise BridgeError("NETWORK_UNCERTAIN","test")
        self.transport=fail
        result=self.bridge.write(record["operation"],self.approval("trello-write",record))
        self.assertEqual(result["state"],"unknown")
        with self.assertRaises(BridgeError):self.bridge.write(record["operation"],self.approval("trello-write",record))
        self.assertEqual(len(self.calls),1)
    def test_write_schema_rejects_paths_unknown_fields_and_empty_actions(self):
        for action,payload in (("arbitrary",{}),("comment",{"card_id":"a"*24,"text":"x","url":"https://evil.example"}),("move",{"card_id":"a"*24}),("update",{"card_id":"a"*24}),("delete",{"card_id":"../../other"})):
            with self.assertRaises(BridgeError):self.bridge.prepare_write(action,payload)
    def test_log_scrubber_hides_bearer_and_keys(self):
        value=scrub({"client_secret":"no-log","text":"Bearer very-secret-value","access_token":"no-log","message":"client_secret=never-log"})
        self.assertNotIn("no-log",str(value));self.assertNotIn("very-secret-value",str(value));self.assertNotIn("never-log",str(value))
    def test_reference_card_is_read_only_even_with_write_capabilities(self):
        with self.assertRaises(BridgeError):self.bridge.prepare_write("comment",{"card_id":"6ae2a09e067abd6d0ca70ed6","text":"must not be sent"})
    def test_retry_is_explicit_and_never_starts_itself(self):
        job=self.bridge.prepare_text("test","PRUEBA")
        with self.assertRaises(BridgeError):self.bridge.prepare_retry(job["id"],"reviewed")
        self.bridge.finish_job(job["id"],"failed",{"error":"synthetic"})
        retry=self.bridge.prepare_retry(job["id"],"reviewed previous outcome")
        self.assertEqual(retry["state"],"prepared");self.assertNotEqual(retry["id"],job["id"])
        self.assertEqual(retry["data"]["source"]["retry_of"],job["id"])
    @unittest.skipUnless(os.name=="nt","DPAPI real solo Windows")
    def test_real_windows_dpapi_roundtrip_and_private_payload(self):
        protector=DPAPI();value=b"SYNTHETIC-LOCAL-SECRET-ONLY";encrypted=protector.protect(value)
        self.assertNotIn(value,encrypted);self.assertEqual(protector.unprotect(encrypted),value)
        self.assertTrue(process_alive(os.getpid()))


if __name__=="__main__":unittest.main()
