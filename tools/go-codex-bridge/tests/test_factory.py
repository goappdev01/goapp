"""Factory tests use disposable SQLite, fake Trello and fake Codex only."""
import json
import io
import urllib.request
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_bridge as fixtures
from puente import Bridge, BridgeError
from factory import BOARD, QUEUE, CHECK, DONE, OWNER, INSTALL_CARD, NAMES


def card(identifier="a"*24, title="A4-luna-2/6-Ajuste", pos=1):
    return {"id": identifier, "idBoard": BOARD, "idList": QUEUE,
            "name": title, "desc": "", "url": "https://trello.com/c/abcdefgh",
            "shortLink": "abcdefgh", "pos": pos, "closed": False}


class FactoryTests(unittest.TestCase):
    setUp = fixtures.BridgeTests.setUp
    tearDown = fixtures.BridgeTests.tearDown
    configured = fixtures.BridgeTests.configured
    authorized = fixtures.BridgeTests.authorized

    def test_disabled_by_default_and_no_jobs_or_writes(self):
        with patch.object(self.bridge, "api") as api, patch.object(self.bridge, "launch") as launch:
            self.assertFalse(self.bridge.factory.status()["enabled"])
            self.assertEqual(self.bridge.factory.tick(), {"enabled": False})
            api.assert_not_called()
            launch.assert_not_called()
        with self.bridge.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM factory_attempts").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT count(*) FROM operations").fetchone()[0], 0)

    def test_restart_reports_saved_oauth_without_exposing_tokens(self):
        self.authorized()
        recovered=Bridge(self.home,self.home/"private",fixtures.TestProtector(),
                         lambda *_: {"id":OWNER}, {"windows_sid":"S-1-5-TEST","source":"unit-test"})
        self.assertIn("OAuth configurado",recovered.status()["oauth"])
        recovered.api("/1/members/me",{"fields":"id"})
        self.assertIn("última consulta correcta",recovered.status()["oauth"])
        self.assertNotIn("synthetic-access",json.dumps(recovered.status()))

    def test_queue_order_and_self_card_excluded(self):
        factory = self.bridge.factory
        factory.toggle(True)
        cards = [card(INSTALL_CARD, "A4-sol-Fábrica", 1), card("b"*24, pos=2),
                 card("c"*24, pos=3)]
        spec = {"card_id":"b"*24,"attempt":1,"title":cards[1]["name"],
                "instruction_sha":"x"}
        with patch.object(factory, "_identity"), patch.object(factory, "_lists"), patch.object(factory, "_cards", return_value=cards), \
             patch.object(factory, "_spec", return_value=spec) as parse, \
             patch.object(factory, "_start", return_value={"started":"synthetic"}) as start:
            self.assertEqual(factory.tick(), {"started":"synthetic"})
        parse.assert_called_once_with(cards[1])
        start.assert_called_once_with(spec)

    def test_bad_agent_and_changed_card_are_rejected(self):
        factory = self.bridge.factory
        snapshot = {"card": card(), "comments": [{"id":"f"*24, "text":"Hacer ajuste", "creatorId":OWNER}],
                    "verification":{"stable_during_read":True,"pagination_exhausted":True}}
        with patch.object(self.bridge, "read_card", return_value={"data":snapshot}), \
             patch.object(factory, "_authorized_placement"):
            self.assertEqual(factory._spec(card())["agent"], "4")
            with self.assertRaises(BridgeError):
                factory._spec(card(title="Sin agente"))
            snapshot["card"]["idList"] = CHECK
            with self.assertRaises(BridgeError):
                factory._spec(card())

    def test_connected_trello_member_must_match_owner(self):
        with patch.object(self.bridge,"api",return_value={"id":OWNER}):
            self.bridge.factory._identity()
        with patch.object(self.bridge,"api",return_value={"id":"0"*24}):
            with self.assertRaises(BridgeError) as error:
                self.bridge.factory._identity()
            self.assertEqual(error.exception.code,"FACTORY_IDENTITY_INVALID")

    def test_untrusted_comment_and_ambiguous_correction_blocked(self):
        factory = self.bridge.factory
        item = card(title="A4 Ajuste Intento 2")
        snapshot = {"card": item, "comments": [
            {"id":"1"*24, "text":"Instrucción original", "creatorId":OWNER},
            {"id":"2"*24, "text":"Todo va bien", "creatorId":OWNER}],
            "verification":{"stable_during_read":True,"pagination_exhausted":True}}
        with patch.object(self.bridge, "read_card", return_value={"data":snapshot}), \
             patch.object(factory, "_authorized_placement"):
            with self.assertRaises(BridgeError) as error:
                factory._spec(item)
            self.assertEqual(error.exception.code, "FACTORY_CORRECTION_AMBIGUOUS")
            snapshot["comments"][1]["text"] = "CORRECCIÓN: ajustar texto"
            self.assertEqual(factory._spec(item)["attempt"], 2)
            snapshot["comments"][1]["creatorId"] = "0"*24
            with self.assertRaises(BridgeError):
                factory._spec(item)

    def test_queue_placement_requires_owner_action(self):
        factory = self.bridge.factory
        move = {"id":"1"*24,"type":"updateCard","date":"2026-11-06T12:00:00Z",
                "idMemberCreator":OWNER,"data":{"listAfter":{"id":QUEUE}}}
        with patch.object(self.bridge,"api",return_value=[move]):
            factory._authorized_placement("a"*24)
        move["idMemberCreator"]="0"*24
        with patch.object(self.bridge,"api",return_value=[move]):
            with self.assertRaises(BridgeError) as error:
                factory._authorized_placement("a"*24)
            self.assertEqual(error.exception.code,"FACTORY_PLACEMENT_UNAUTHORIZED")

    def test_position_change_keeps_entry_but_real_reentry_needs_owner(self):
        factory=self.bridge.factory
        other="f"*24
        created={"id":"1"*24,"type":"createCard","date":"2026-11-01T12:00:00Z",
                 "idMemberCreator":OWNER,"data":{"list":{"id":other}}}
        entered={"id":"2"*24,"type":"updateCard","date":"2026-11-02T12:00:00Z",
                 "idMemberCreator":OWNER,"data":{"list":{"id":QUEUE},"old":{"pos":1024}}}
        reordered={"id":"3"*24,"type":"updateCard","date":"2026-11-03T12:00:00Z",
                   "idMemberCreator":OWNER,"data":{"list":{"id":QUEUE},"old":{"pos":2048}}}
        actions=[reordered,entered,created]
        with patch.object(self.bridge,"api",return_value=actions):
            self.assertEqual(factory._authorized_placement("a"*24),entered["id"])
        left={"id":"4"*24,"type":"updateCard","date":"2026-11-04T12:00:00Z",
              "idMemberCreator":OWNER,"data":{"list":{"id":other},"old":{"idList":QUEUE}}}
        returned={"id":"5"*24,"type":"updateCard","date":"2026-11-05T12:00:00Z",
                  "idMemberCreator":"0"*24,"data":{"list":{"id":QUEUE},"old":{"pos":4096}}}
        with patch.object(self.bridge,"api",return_value=[returned,left,*actions]):
            with self.assertRaises(BridgeError) as error:
                factory._authorized_placement("a"*24)
            self.assertEqual(error.exception.code,"FACTORY_PLACEMENT_UNAUTHORIZED")
            returned["idMemberCreator"]=OWNER
            self.assertEqual(factory._authorized_placement("a"*24),returned["id"])

    def test_stale_or_foreign_queue_rejected(self):
        factory = self.bridge.factory
        for cards in ([card(pos=2), card("b"*24,pos=1)],
                      [card(), card("b"*24,pos=1)],
                      [card() | {"idBoard": "0"*24}]):
            with patch.object(self.bridge, "api", return_value=cards):
                with self.assertRaises(BridgeError):
                    factory._cards()

    def test_nonrecoverable_pause_never_retries_without_panel_action(self):
        factory = self.bridge.factory
        factory.toggle(True)
        factory._pause("FACTORY_WORKSPACE_DIRTY")
        with patch.object(factory, "_cards") as read:
            self.assertEqual(factory.tick(), {"enabled":False})
            read.assert_not_called()
        factory.toggle(True)
        self.assertIsNone(factory.status()["pause_reason"])

    def test_credit_backoff_has_a_bounded_wait(self):
        factory=self.bridge.factory
        factory.toggle(True); factory._pause("CREDIT_LIMIT",retry=True)
        self.assertFalse(factory.status()["enabled"])
        self.assertEqual(factory._control()["next_check"],0)
        self.assertEqual(factory._control()["backoff"],0)

    def test_partial_comment_is_reconciled_without_reposting(self):
        factory=self.bridge.factory
        with self.bridge.db() as db:
            db.execute("INSERT INTO operations VALUES(?,?,?,?,?,?)",("operation-1","comment","unknown","{}",None,factory.utc()))
        row={"card_id":"a"*24,"attempt":1,"comment_operation":"operation-1"}
        with patch.object(self.bridge,"reconcile_write") as reconcile,patch.object(self.bridge,"prepare_write") as prepare:
            with self.assertRaises(BridgeError):factory._op(row,"comment",{"card_id":row["card_id"]},"comment_operation")
            reconcile.assert_not_called(); prepare.assert_not_called()

    def test_no_automatic_move_to_done(self):
        source = Path(__file__).resolve().parents[1].joinpath("factory.py").read_text(encoding="utf-8")
        self.assertNotIn('{"card_id": card_id, "list_id": DONE}', source)
        self.assertNotIn('"/1/lists/" + DONE + "/cards"', source)
        with self.assertRaises(BridgeError) as error:
            self.bridge.factory._op({"card_id":"a"*24,"attempt":1,"move_operation":None},
                                    "move",{"card_id":"a"*24,"list_id":DONE},"move_operation")
        self.assertEqual(error.exception.code,"FACTORY_WRITE_SCOPE_INVALID")

    def test_existing_manual_preparations_preserved(self):
        job = self.bridge.prepare_chatgpt("Texto de prueba", "4")
        before = self.bridge.job(job["id"])
        self.bridge.factory.toggle(True)
        self.bridge.factory.toggle(False)
        self.assertEqual(self.bridge.job(job["id"]), before)

    def test_real_launch_recorded_without_running_codex_in_test(self):
        factory = self.bridge.factory
        spec = {"card_id":"a"*24,"attempt":1,"agent":"4","title":"A4 Ajuste",
                "instruction":"Trabajo sintético", "instruction_sha":factory.digest("Trabajo sintético"),
                "comment_ids":["f"*24]}
        latest = {"idBoard":BOARD,"idList":QUEUE,"name":spec["title"],"desc":""}
        with patch.object(self.bridge,"workspace",return_value=(self.home,"workspace-write")), \
             patch.object(factory,"_git",return_value={"head":"b"*40,"origin_main":"b"*40,"tracked_dirty":False}), \
             patch.object(self.bridge,"api",return_value=latest), \
             patch.object(self.bridge,"launch",return_value={"state":"running"}) as launch:
            result = factory._start(spec)
        self.assertEqual(result["card"],spec["card_id"])
        self.assertEqual(factory._row(spec["card_id"],1)["state"],"prepared")
        launch.assert_not_called()
        with self.bridge.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM approvals WHERE action='execute'").fetchone()[0],0)

    def test_old_manual_card_job_blocks_factory_replay(self):
        factory = self.bridge.factory
        cid = "a"*24
        self.bridge.prepare_text("Tarea anterior", "4", {"card_id":cid})
        spec = {"card_id":cid,"attempt":1,"agent":"4","title":"A4 Ajuste",
                "instruction":"Trabajo sintético", "instruction_sha":factory.digest("Trabajo sintético"),
                "comment_ids":["f"*24]}
        with patch.object(self.bridge,"workspace",return_value=(self.home,"workspace-write")), \
             patch.object(factory,"_git",return_value={"head":"b"*40,"origin_main":"b"*40,"tracked_dirty":False}), \
             patch.object(self.bridge,"launch") as launch:
            with self.assertRaises(BridgeError) as error:
                factory._start(spec)
            self.assertEqual(error.exception.code,"FACTORY_PREVIOUS_JOB")
            launch.assert_not_called()

    def test_same_card_requires_incremented_owner_correction_attempt(self):
        factory = self.bridge.factory
        cid = "a"*24
        with self.bridge.db() as db:
            db.execute("INSERT INTO factory_attempts(card_id,attempt,title,instruction_sha,state) VALUES(?,?,?,?,?)",
                       (cid,1,"A4 Ajuste","old","await_review"))
        spec = {"card_id":cid,"attempt":2,"agent":"4","title":"A4 Ajuste Intento 2",
                "instruction":"Original\n\nCORRECCIÓN: cambio", "instruction_sha":"new",
                "comment_ids":["1"*24,"2"*24], "activity":"stable"}
        latest = {"idBoard":BOARD,"idList":QUEUE,"name":spec["title"],"desc":"",
                  "dateLastActivity":"stable"}
        with patch.object(self.bridge,"workspace",return_value=(self.home,"workspace-write")), \
             patch.object(factory,"_git",return_value={"head":"b"*40,"origin_main":"b"*40,"tracked_dirty":False}), \
             patch.object(self.bridge,"api",return_value=latest), \
             patch.object(self.bridge,"launch",return_value={"state":"running"}):
            self.assertEqual(factory._start(spec)["attempt"],2)
        self.assertEqual(factory._row(cid,2)["state"],"prepared")
        spec["attempt"]=3
        spec["title"]="A4 Ajuste Intento 3"
        with patch.object(self.bridge,"workspace",return_value=(self.home,"workspace-write")), \
             patch.object(factory,"_git",return_value={"head":"b"*40,"origin_main":"b"*40,"tracked_dirty":False}):
            with self.assertRaises(BridgeError):
                factory._start(spec)  # Attempt 2 has not reached human review.

    def test_completed_job_comments_then_moves_same_card(self):
        factory=self.bridge.factory
        row={"card_id":"a"*24,"attempt":1,"job_id":"fake-job"}
        job={"id":"fake-job","state":"completed","result":{}}
        with patch.object(self.bridge,"job",return_value=job),patch.object(factory,"_op") as op:
            result=factory._complete(row)
            self.assertEqual(result["pending_review"],"fake-job")
            self.assertFalse(result["published"]);self.assertFalse(result["iphone_validated"])
            op.assert_not_called()

    def test_failed_codex_never_comments_or_moves(self):
        factory=self.bridge.factory
        row={"card_id":"a"*24,"attempt":1,"job_id":"failure","state":"running"}
        with patch.object(self.bridge,"job",return_value={"id":"failure","state":"failed","result":{"response":"credits exhausted"}}),patch.object(factory,"_op") as op:
            result=factory._complete(row)
            self.assertEqual(result["blocked"],"CREDIT_LIMIT")
            self.assertFalse(factory.status()["enabled"]);op.assert_not_called()

    def test_uncertain_restart_prevents_duplicate_execution(self):
        factory=self.bridge.factory
        with patch.object(self.bridge,"job",return_value={"id":"lost-job","state":"interrupted","result":{}}),patch.object(factory,"_start") as start:
            result=factory._complete({"card_id":"a"*24,"attempt":1,"job_id":"lost-job"})
            self.assertEqual(result["blocked"],"FACTORY_JOB_REQUIRES_REVIEW");start.assert_not_called()

    def test_no_false_publication_from_codex_success_claim(self):
        factory = self.bridge.factory
        job = {"id":"fake","state":"completed","result":{"response":"Hecho", "exit_code":0,
               "failed_commands":0},"data":{"agent":"4"}}
        with self.assertRaises(BridgeError) as error:
            factory._evidence({"before_sha":"b"*40},job)
        self.assertEqual(error.exception.code,"FACTORY_EVIDENCE_MISSING")

    def test_metro_proof_uses_served_source_not_manifest_revision_label(self):
        factory = self.bridge.factory
        root = self.home / "go"; (root/"artifacts/go-app-mobile/app").mkdir(parents=True)
        (root/".git").mkdir(); (root/"package.json").write_text("{}")
        (root/"artifacts/go-app-mobile/package.json").write_text("{}")
        source = root/"artifacts/go-app-mobile/app/main.tsx"; source.write_text("export const value = 2;\n")
        manifest = {"extra":{"expoClient":{"sdkVersion":"58.0.0"}},
            "revisionId":"old-label", "launchAsset":{"url":"http://100.1.2.3:8088/app.bundle?platform=ios"}}
        source_map = {"sections":[{"map":{"sources":["virtual\0module",str(source)],
            "sourcesContent":["ignored", "export const value = 2;\r\n"]}}]}
        class Response:
            def __init__(self, value): self.value=value
            def __enter__(self): return self
            def __exit__(self,*_): pass
            def read(self,*_): return self.value
        class Opener:
            def open(self, request, timeout=None):
                url = request.full_url if isinstance(request, urllib.request.Request) else request
                if url.endswith("/status"): return Response(b"packager-status:running")
                if url.endswith((":8088",":8089")): return Response(json.dumps(manifest).encode())
                if ".bundle?" in url: return Response(b"synthetic ios JavaScript")
                if ".map?" in url: return Response(json.dumps(source_map).encode())
                raise AssertionError(url)
        def git_command(args, **_):
            if "diff" in args:
                return type("Completed",(),{"returncode":0,"stdout":"artifacts/go-app-mobile/app/main.tsx\ntools/go-codex-bridge/panel.js\n"})()
            if "ls-files" in args:
                return type("Completed",(),{"returncode":0,"stdout":b"artifacts/go-app-mobile/app/main.tsx\0"})()
            if "show" in args:
                return type("Completed",(),{"returncode":0,
                    "stdout":b"export const value = 2;\n"})()
            raise AssertionError(args)
        with patch("factory.urllib.request.build_opener",return_value=Opener()), \
             patch.object(self.bridge,"git_state",return_value={"head":"c"*40,
                 "origin_main":"c"*40,"tracked_dirty":True}), \
             patch("factory.subprocess.run",side_effect=git_command):
            proof = factory._verify_metro("c"*40,"b"*40,root)
            self.assertEqual(proof["checked_sources"],1)
            # Unrelated working-tree changes are not a publication failure.
            source.write_text("export const value = 1;\n")
            self.assertEqual(factory._verify_metro("c"*40,"b"*40,root)["checked_sources"],1)
            source_map["sections"][0]["map"]["sourcesContent"]=["ignored", "export const value = 1;\n"]
            with self.assertRaises(BridgeError) as error:
                factory._verify_metro("c"*40,"b"*40,root)
            self.assertEqual(error.exception.code,"FACTORY_METRO_OUTDATED")
            source_map["sections"][0]["map"]["sourcesContent"]=["ignored", "export const value = 2;\n"]
            manifest["launchAsset"]["url"]="http://100.1.2.3:8089/app.bundle?platform=ios"
            def pinned_git_state(workspace,check_main=False):
                self.assertFalse(check_main,"La copia fijada no debe seguir origin/main")
                return {"head":"c"*40,"tracked_dirty":True}
            with patch.object(self.bridge,"git_state",side_effect=pinned_git_state):
                self.assertEqual(factory._verify_metro("c"*40,"c"*40,root,
                                                       port=8089,pinned=True)["checked_sources"],1)

    def test_metro_fast_forwards_from_older_ancestor_without_replacing_pinned_checkout(self):
        root=self.home/'served';cli=root/'node_modules/expo/bin/cli'
        cli.parent.mkdir(parents=True);cli.write_text('synthetic')
        old,before,new='a'*40,'b'*40,'c'*40
        calls=[]
        def git(*args):
            calls.append(args)
            if args==('rev-parse','HEAD'):return old
            if args==('remote','get-url','origin'):return 'https://github.com/goappdev01/goapp.git'
            if args==('ls-remote','origin','refs/heads/main'):return new+' refs/heads/main'
            if args==('status','--porcelain'):return ''
            if args==('rev-parse','FETCH_HEAD'):return new
            return ''
        def run(args,**kwargs):
            if args[0]=='powershell.exe':
                return type('Result',(),{'returncode':0,'stdout':f'node "{cli}" start --port 8088 --host lan'})()
            self.assertEqual(args[-2:],[old,new])
            return type('Result',(),{'returncode':0})()
        with patch.object(self.bridge.safety,'git_command',side_effect=lambda _root,*args:git(*args)),\
             patch('factory.subprocess.run',side_effect=run):
            self.bridge.factory._advance_served_checkout(root,before,new)
        self.assertIn(('-c','core.hooksPath=NUL','merge','--ff-only',new),calls)

    def test_legacy_monitor_stops_at_incompatible_first_card(self):
        factory=self.bridge.factory
        cards=[card("b"*24,"A2 Trabajo de otro agente",1),card("a"*24,"A4 Ajuste",2)]
        spec={"card_id":"a"*24,"attempt":1,"agent":"4","title":"A4 Ajuste","instruction":"Instrucción completa sintética","instruction_sha":"sha","comment_ids":["f"*24]}
        factory.toggle(True)
        with patch.object(factory,"_identity"),patch.object(factory,"_lists"),patch.object(factory,"_cards",return_value=cards),patch.object(factory,"_spec",return_value=spec) as parse,patch.object(factory,"_start",return_value={"prepared":"synthetic"}) as prepare,patch.object(self.bridge,"launch") as launch,patch.object(self.bridge,"approve") as approve,patch.object(self.bridge,"write") as write:
            self.assertEqual(factory.tick(),{"paused":"FACTORY_HEAD_AGENT_INVALID","retry":False})
            parse.assert_not_called();prepare.assert_not_called()
            launch.assert_not_called();approve.assert_not_called();write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
