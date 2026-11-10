"""No live Trello, Codex or GitHub. Every side effect uses a fake service."""
import copy
import json
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import test_bridge as fixtures
from puente import Bridge, BridgeError, canonical
from factory import BOARD, QUEUE, CHECK, NAMES, OWNER

class SafetyTests(unittest.TestCase):
    setUp=fixtures.BridgeTests.setUp
    tearDown=fixtures.BridgeTests.tearDown

    def queue(self):
        self.card={"id":"a"*24,"idBoard":BOARD,"idList":QUEUE,"name":"A4 Instrucción", "desc":"", "shortLink":"abcdefgh", "closed":False,"dateLastActivity":"initial"}
        self.comments=[{"id":"b"*24,"text":"Instrucción técnica completa sintética", "creatorId":OWNER}]
        self.remote_writes=[]
        def api(path,params=None,method="GET",body=None,**kwargs):
            if method != "GET":
                self.remote_writes.append((method,path,body))
                if method == "POST":
                    self.comments.append({"id":"c"*24,"text":body["text"],"creatorId":OWNER})
                    self.card["dateLastActivity"]="commented"
                    return {"id":"c"*24}
                if method == "PUT":
                    self.card["idList"]=body["idList"];self.card["dateLastActivity"]="moved";return copy.deepcopy(self.card)
                raise AssertionError(method)
            if path.endswith("/lists"):return [{"id":k,"name":v} for k,v in NAMES.items()]
            if path=="/1/members/me":return {"id":OWNER}
            if path=="/1/lists/"+QUEUE+"/cards":return [dict(self.card,pos=1)] if self.card["idList"]==QUEUE else []
            if path.startswith("/1/actions/"):return {"data":{"text":self.comments[-1]["text"]}}
            if path.endswith("/actions"):return [{"id":"d"*24,"type":"createCard","date":"2026-01-01", "idMemberCreator":OWNER,"data":{"list":{"id":QUEUE}}}]
            if path.startswith("/1/cards/"):return copy.deepcopy(self.card)
            raise AssertionError(path)
        self.bridge.api=api
        self.bridge.read_card=lambda _: {"data":{"card":copy.deepcopy(self.card),"comments":copy.deepcopy(self.comments),"verification":{"stable_during_read":True,"pagination_exhausted":True}}}
        self.bridge.safety.git=lambda _: {"git":True,"head":"1"*40,"diff_sha256":"stable","tracked_dirty":False}
        self.bridge.git_state=lambda *_,**__: {"git":True,"head":"1"*40,"origin_main":"1"*40,"tracked_dirty":False}
        self.bridge.config["agents"]["4"]["sandbox"]="workspace-write"
        self.bridge.factory._git=lambda _: {"git":True,"head":"1"*40,"origin_main":"1"*40,"tracked_dirty":False}
        return self.bridge

    def prepared(self):
        b=self.queue();b.factory.toggle(True)
        result=b.factory.tick()
        return b,b.job(result["prepared"])

    def test_monitor_and_prepare_never_approve_execute_publish_or_write(self):
        b=self.queue();b.factory.toggle(True)
        with patch.object(b,"approve") as approve,patch.object(b,"launch") as launch,patch.object(b,"write") as write,patch.object(b.safety,"publish") as publish:
            result=b.factory.tick()
            self.assertIn("prepared",result);approve.assert_not_called();launch.assert_not_called();write.assert_not_called();publish.assert_not_called()
        self.assertEqual(self.remote_writes,[])
        self.assertFalse(b.status()["automatic_execution"])
        self.assertTrue(b.factory.status()["states"]["PREPARADA"])

    def test_manual_check_reads_while_paused_and_never_prepares(self):
        b=self.queue()
        with patch.object(b.factory,"_start") as prepare:
            result=b.factory.tick(manual=True)
            self.assertTrue(result["read_only"]);self.assertFalse(result["enabled"]);prepare.assert_not_called()
        self.assertEqual(len(b.status()["jobs"]),0);self.assertEqual(self.remote_writes,[])

    def test_repeated_monitoring_has_one_job_and_zero_approvals(self):
        b,job=self.prepared()
        for _ in range(4):b.factory.tick()
        with b.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM jobs").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT count(*) FROM approvals").fetchone()[0],0)
        self.assertEqual(self.remote_writes,[])

    def test_http_parameters_cannot_replace_human_confirmation(self):
        self.bridge.owner_confirmation=lambda action,payload:False
        with self.assertRaises(BridgeError) as error:self.bridge.approve("execute",{"confirmation":"AUTORIZO ESTA EJECUCION"},"local-panel-owner")
        self.assertEqual(error.exception.code,"OWNER_CONFIRMATION_REQUIRED")
        with self.bridge.db() as db:self.assertEqual(db.execute("SELECT count(*) FROM approvals").fetchone()[0],0)

    def test_old_factory_and_output_cannot_grant_authority(self):
        for origin in ("factory-verified-queue","explicit-user-operation","explicit-user-test-B","trello-comment","codex-output"):
            with self.assertRaises(BridgeError):self.bridge.approve("execute",{},origin)

    def test_publication_cannot_be_enabled_in_execution_parameters(self):
        b,job=self.prepared()
        with self.assertRaises(BridgeError):b.execution_payload(job["id"],allow_publish=True)

    def test_unapproved_execution_keeps_job_prepared(self):
        b,job=self.prepared();payload=b.execution_payload(job["id"])
        with patch.object(b,"run_codex") as codex:
            with self.assertRaises(BridgeError):b.launch(payload,"missing",False)
            codex.assert_not_called()
        self.assertEqual(b.job(job["id"])["state"],"prepared")

    def test_exact_human_execution_is_single_use_and_grants_no_publication(self):
        b,job=self.prepared();payload=b.execution_payload(job["id"])
        preview=b.safety.preview("execute",payload)
        b.safety.confirm(preview["id"],"execute",payload)
        approval=b.approve("execute",payload,"local-panel-owner")
        with patch.object(b,"run_codex") as codex:
            b.launch(payload,approval,False);codex.assert_called_once()
            with self.assertRaises(BridgeError):b.launch(payload,approval,False)
        with b.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM approvals WHERE action='publish-main'").fetchone()[0],0)
        self.assertEqual(self.remote_writes,[])

    def test_card_change_rejects_execution_before_spawn(self):
        for field,value in (("name","A4 Nuevo título"),("idList",CHECK),("dateLastActivity","changed")):
            with self.subTest(field=field):
                b,job=self.prepared() if not hasattr(self,"card") else (self.bridge,self.bridge.job(self.bridge.status()["jobs"][0]["id"]))
                payload=b.execution_payload(job["id"]);approval=b.approve("execute",payload,"local-panel-owner")
                old=self.card[field];self.card[field]=value
                with patch.object(b,"run_codex") as codex:
                    with self.assertRaises(BridgeError):b.launch(payload,approval,False)
                    codex.assert_not_called()
                self.card[field]=old

    def test_changed_full_comment_not_only_title_invalidates_execution(self):
        b,job=self.prepared();payload=b.execution_payload(job["id"])
        approval=b.approve("execute",payload,"local-panel-owner")
        self.comments[0]["text"]+="\nCambiar alcance"
        with patch.object(b,"run_codex") as codex:
            with self.assertRaises(BridgeError):b.launch(payload,approval,False)
            codex.assert_not_called()

    def test_git_changes_invalidate_execution(self):
        b,job=self.prepared();payload=b.execution_payload(job["id"])
        approval=b.approve("execute",payload,"local-panel-owner")
        b.safety.git=lambda _: {"git":True,"head":"2"*40}
        with self.assertRaises(BridgeError):b.launch(payload,approval,False)

    def test_failed_execution_revokes_permission_even_if_git_is_restored(self):
        b,job=self.prepared();payload=b.execution_payload(job["id"])
        approval=b.approve("execute",payload,"local-panel-owner");original=b.safety.git
        b.safety.git=lambda _: {"git":True,"head":"changed"}
        with self.assertRaises(BridgeError):b.launch(payload,approval,False)
        b.safety.git=original
        with patch.object(b,"run_codex") as codex:
            with self.assertRaises(BridgeError):b.launch(payload,approval,False)
            codex.assert_not_called()

    def test_job_assignment_and_instruction_cannot_change(self):
        b,job=self.prepared();payload=b.execution_payload(job["id"])
        approval=b.approve("execute",payload,"local-panel-owner")
        b.config["agents"]["4"]["sandbox"]="read-only"
        with self.assertRaises(BridgeError):b.launch(payload,approval,False)

    def test_comment_and_move_require_separate_approvals(self):
        b=self.queue();comment=b.prepare_write("comment",{"card_id":self.card["id"],"text":"Cuatro pasos exactos"})
        with self.assertRaises(BridgeError):b.write(comment["operation"],"missing")
        approval=b.approve("trello-write",comment,"local-panel-owner")
        self.assertEqual(b.write(comment["operation"],approval)["state"],"verified")
        move=b.prepare_write("move",{"card_id":self.card["id"],"list_id":CHECK})
        with self.assertRaises(BridgeError):b.write(move["operation"],approval)
        self.assertEqual(self.card["idList"],QUEUE)
        other=b.approve("trello-write",move,"local-panel-owner")
        self.assertEqual(b.write(move["operation"],other)["state"],"verified")
        self.assertEqual(self.card["idList"],CHECK);self.assertEqual(len(self.remote_writes),2)

    def test_changed_comment_payload_or_card_invalidates_write(self):
        b=self.queue();record=b.prepare_write("comment",{"card_id":self.card["id"],"text":"Exacto"})
        approval=b.approve("trello-write",record,"local-panel-owner")
        self.comments[0]["text"]="Cambio"
        with self.assertRaises(BridgeError):b.write(record["operation"],approval)
        self.assertEqual(self.remote_writes,[])

    def test_other_agents_are_visible_but_never_prepared_or_mutated(self):
        b=self.queue();self.card["name"]="A2 Otra tarea";b.factory.toggle(True)
        self.assertEqual(b.factory.tick()["paused"],"FACTORY_HEAD_AGENT_INVALID")
        self.assertFalse(b.factory.status()["queue_preview"][0]["eligible_agent4"])
        with self.assertRaises(BridgeError):b.prepare_write("move",{"card_id":self.card["id"],"list_id":CHECK})
        self.assertEqual(self.remote_writes,[])

    def test_card_title_and_description_never_mutated(self):
        b=self.queue()
        for action in ("update","delete","archive","create"):
            with self.assertRaises(BridgeError):b.prepare_write(action,{"card_id":self.card["id"]})
        self.assertEqual(self.card["desc"],"");self.assertEqual(self.card["name"],"A4 Instrucción")

    def test_only_agent4_can_be_enabled(self):
        for agent in ("1","2","3","5"):
            with self.assertRaises(BridgeError):self.bridge.configure_agent(agent,str(self.home),"workspace-write",True)

    def test_restart_preserves_jobs_credentials_and_invalidates_permissions(self):
        self.queue();job=self.bridge.prepare_text("Prueba local","PRUEBA")
        payload={"exact":"operation"};approval=self.bridge.approve("execute",payload,"local-panel-owner")
        preview=self.bridge.safety.preview("execute",payload);self.bridge.factory.toggle(True)
        restored=Bridge(self.home,self.home/"private",fixtures.TestProtector(),lambda *_:None,{"windows_sid":"S-1-5-TEST","source":"unit-test"})
        restored.factory.pause_on_startup()
        self.assertFalse(restored.factory.status()["enabled"])
        self.assertEqual(restored.job(job["id"])["data"]["instruction"],"Prueba local")
        with restored.db() as db:
            with self.assertRaises(BridgeError):restored.consume(db,approval,"execute",payload)
        with self.assertRaises(BridgeError):restored.safety.confirm(preview["id"],"execute",payload)

    def test_wrong_local_identity_cannot_consume(self):
        payload={"operation":"one"};approval=self.bridge.approve("execute",payload,"local-panel-owner")
        self.bridge.approval_actor["windows_sid"]="other-user"
        with self.bridge.db() as db:
            with self.assertRaises(BridgeError):self.bridge.consume(db,approval,"execute",payload)

    def test_preview_is_expiring_single_use_and_bound_to_operation(self):
        for mismatch in ("execute","trello-write","publish-main"):
            preview=self.bridge.safety.preview("execute",{"a":1})
            if mismatch=="execute":
                with patch("safety.time.time",return_value=preview["expires"]+1):
                    with self.assertRaises(BridgeError):self.bridge.safety.confirm(preview["id"],mismatch,{"a":1})
            else:
                with self.assertRaises(BridgeError):self.bridge.safety.confirm(preview["id"],mismatch,{"a":1})
            with self.assertRaises(BridgeError):self.bridge.safety.confirm(preview["id"],"execute",{"a":1})

    def test_failed_preview_comparison_cannot_be_reused(self):
        p=self.bridge.safety.preview("execute",{"instruction":"reviewed"})
        with self.assertRaises(BridgeError):self.bridge.safety.confirm(p["id"],"execute",{"instruction":"changed"})
        with self.assertRaises(BridgeError):self.bridge.safety.confirm(p["id"],"execute",p["payload"])

    def test_expired_approval_and_other_operation_are_rejected(self):
        p={"one":1};a=self.bridge.approve("execute",p,"local-panel-owner")
        with self.bridge.db() as db:
            with self.assertRaises(BridgeError):self.bridge.consume(db,a,"publish-main",p)
        with patch("puente.time.time",return_value=time.time()+901):
            with self.bridge.db() as db:
                with self.assertRaises(BridgeError):self.bridge.consume(db,a,"execute",p)

    def test_limit_error_stops_monitoring_without_retry(self):
        b,job=self.prepared();b.finish_job(job["id"],"blocked",{"response":"credits exhausted","exit_code":1})
        result=b.factory.tick()
        self.assertEqual(result["blocked"],"CREDIT_LIMIT");self.assertFalse(b.factory.status()["enabled"])
        with patch.object(b.factory,"_resume_limit") as retry:
            for _ in range(3):b.factory.tick()
            retry.assert_not_called()

    def test_network_error_during_watch_never_retries_effects(self):
        b=self.queue();b.factory.toggle(True)
        with patch.object(b,"api",side_effect=BridgeError("NETWORK_UNCERTAIN","test")),patch.object(b,"launch") as launch:
            self.assertFalse(b.factory.tick()["retry"]);self.assertFalse(b.factory.status()["enabled"]);launch.assert_not_called()

    def test_uncertain_write_is_not_repeated(self):
        b=self.queue();r=b.prepare_write("comment",{"card_id":self.card["id"],"text":"Exacto"})
        a=b.approve("trello-write",r,"local-panel-owner");original=b.api
        def network(*args,**kwargs):
            if kwargs.get("method","GET")!="GET":raise BridgeError("NETWORK_UNCERTAIN","fake loss")
            return original(*args,**kwargs)
        b.api=network
        self.assertEqual(b.write(r["operation"],a)["state"],"unknown")
        with self.assertRaises(BridgeError):b.write(r["operation"],b.approve("trello-write",r,"local-panel-owner"))

    def test_publication_requires_its_own_approval_and_preview(self):
        b=self.bridge;payload={"job":"fake","workspace":str(self.home),"files":["file"],"remote_main":"1"*40,"diff":"patch","message":"reviewed"}
        with patch.object(b.safety,"publication_payload",return_value=payload),patch.object(b.safety,"git_command") as git:
            with self.assertRaises(BridgeError):b.safety.publish(payload,"missing")
            wrong=b.approve("execute",payload,"local-panel-owner")
            with self.assertRaises(BridgeError):b.safety.publish(payload,wrong)
            git.assert_not_called()

    def test_authorized_publication_checks_remote_and_does_not_claim_metro_or_iphone(self):
        b=self.bridge;p={"job":"fake","workspace":str(self.home),"files":["file"],"remote_main":"1"*40,"diff":"patch","message":"reviewed"}
        results=["","2"*40,"1"*40,"patch","","2"*40+" refs/heads/main"]
        with patch.object(b.safety,"publication_payload",return_value=p),patch.object(b.safety,"git_command",side_effect=results) as git:
            a=b.approve("publish-main",p,"local-panel-owner")
            result=b.safety.publish(p,a)
            self.assertEqual(result["state"],"verified")
            self.assertEqual(result["result"]["metro"],"pending-independent-verification")
            self.assertEqual(result["result"]["iphone"],"pending-owner-validation")
            self.assertFalse(any("--force" in call.args for call in git.call_args_list))
            with self.assertRaises(BridgeError):b.safety.publish(p,a)

    def test_uncertain_publication_has_no_automatic_retry(self):
        b=self.bridge;p={"job":"fake","workspace":str(self.home),"files":["file"],"remote_main":"1"*40,"diff":"patch","message":"reviewed"}
        with patch.object(b.safety,"publication_payload",return_value=p),patch.object(b.safety,"git_command",side_effect=BridgeError("NETWORK_UNCERTAIN","fake")) as git:
            a=b.approve("publish-main",p,"local-panel-owner");result=b.safety.publish(p,a)
            self.assertEqual(result["state"],"unknown");self.assertFalse(result["result"]["automatic_retry"])
            self.assertEqual(git.call_count,1);self.assertFalse(b.factory.status()["enabled"])

    def test_no_old_factory_approval_calls_remain(self):
        source=(Path(__file__).resolve().parents[1]/"factory.py").read_text(encoding="utf-8")
        for release in (".approve(",".launch(",".write("):
            self.assertNotIn(release,source)

if __name__=="__main__":unittest.main()
