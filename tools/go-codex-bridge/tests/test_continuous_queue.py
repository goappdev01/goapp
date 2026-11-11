"""Synthetic continuity checks; no live Codex, Trello mutation or publication."""
import copy
import json
import threading
import time
import unittest

import test_factory_v2
from factory import CHECK
from puente import codex_resume_command, BridgeError
from wheel_effects import WheelEffects,WheelPublication


class ContinuousQueueTests(unittest.TestCase):
    setUp=test_factory_v2.V2WheelTests.setUp
    tearDown=test_factory_v2.V2WheelTests.tearDown
    git=test_factory_v2.V2WheelTests.git
    configure=test_factory_v2.V2WheelTests.configure
    api=test_factory_v2.V2WheelTests.api
    snapshot=test_factory_v2.V2WheelTests.snapshot
    synthetic_codex=test_factory_v2.V2WheelTests.synthetic_codex
    decisions=test_factory_v2.V2WheelTests.decisions
    five_card_queue=test_factory_v2.V2WheelTests.five_card_queue
    batch=test_factory_v2.V2WheelTests.batch
    block=test_factory_v2.V2WheelTests.block
    def test_exact_resume_command_keeps_named_permissions(self):
        previous=["codex","-a","never","-c",'default_permissions="go_factory"',
                  "exec","--json","--sandbox","workspace-write","-"]
        session="01a1c9c6-a22d-7f03-ad3a-6c1302b1f658"
        result=codex_resume_command(previous,session,"answer.txt")
        self.assertEqual(result[:5],previous[:5])
        self.assertEqual(result[5:7],["exec","resume"])
        self.assertEqual(result[-2:],[session,"-"])
        self.assertNotIn("--sandbox",result)
        with self.assertRaises(BridgeError):
            codex_resume_command(previous,"--last","answer.txt")

    def test_open_queue_skips_blocked_and_not_unapproved_new_card(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_continuity_mode SET enabled=1 WHERE id=1")
        self.block(w,ids[0])
        new=copy.deepcopy(self.cards[ids[0]])
        new.update(id="c"*24,name="A4 synthetic new",shortLink="c"*8,pos=512)
        new["comments"]=[{"id":"c"*24,"text":"Tarea nueva sintética","creatorId":new["comments"][0]["creatorId"]}]
        self.cards[new["id"]]=new
        self.cards=dict(sorted(self.cards.items(),key=lambda item:item[1]["pos"]))
        self.assertEqual(w._trial_limit()["expected"],ids[1])
        self.assertNotIn(new["id"],self.runs)

    def test_open_queue_can_add_individually_approved_card(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_continuity_mode SET enabled=1 WHERE id=1")
        for cid in ids:
            self.block(w,cid)
        new=copy.deepcopy(self.cards[ids[0]])
        new.update(id="c"*24,name="A4 synthetic new",shortLink="c"*8,pos=512)
        new["comments"]=[{"id":"c"*24,"text":"Tarea nueva sintética","creatorId":new["comments"][0]["creatorId"]}]
        self.cards[new["id"]]=new
        self.cards=dict(sorted(self.cards.items(),key=lambda item:item[1]["pos"]))
        self.card_files[new["id"]]=self.files[0]
        self.assertEqual(w._trial_limit()["waiting"],"NO_AUTHORIZED_CARD")
        subject=next(c for c in w.review()["cards"] if c["card_id"]==new["id"])
        w.approve([{"card_id":new["id"],"binding":subject["binding"],"allowed_files":[self.files[0]],
                   "test_files":["tests/sample.test.mjs"],"backend_required":False,
                   "operations":list("ABCD"),"expires_at":time.time()+3600,"depends_on":[]}])
        self.assertEqual(w._trial_limit()["expected"],new["id"])
        self.assertFalse(self.runs or self.changes)

    def test_credit_wait_never_restarts_without_exact_checkpoint(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_continuity_mode SET enabled=1 WHERE id=1")
            db.execute("UPDATE wheel_control SET enabled=0,reason='CREDIT_LIMIT' WHERE id=1")
            db.execute("UPDATE wheel_grants SET state='credit_wait',reason='CREDIT_LIMIT' WHERE card_id=?",(ids[0],))
        self.assertFalse(w.resume_after_quota())
        self.assertFalse(w.enabled())
        self.assertFalse(self.runs)

    def test_question_uses_only_cd_and_moves_to_top(self):
        w,ids=self.batch()
        self.bridge.factory._start(self.bridge.factory._spec(self.cards[ids[0]]))
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_continuity_mode SET enabled=1 WHERE id=1")
            row=db.execute("SELECT * FROM wheel_grants WHERE card_id=?",(ids[0],)).fetchone()
            grant=w._verified(row)
            attempt=self.bridge.factory._row(ids[0],grant["attempt"])
            job_id=attempt["job_id"]
            db.execute("UPDATE wheel_grants SET state='working' WHERE grant_id=?",(grant["grant_id"],))
            db.execute("UPDATE jobs SET state='failed',result=? WHERE id=?",
                       (json.dumps({"response":"GO_FACTORY_QUESTION: {}"}),job_id))
        job=self.bridge.job(job_id)
        w.continuity._defer_question_to_trello(grant,{"question":"¿Qué opción debe prevalecer?",
            "operation":"Seleccionar el comportamiento de prueba"},job)
        self.assertEqual(self.cards[ids[0]]["idList"],w._verified(row)["destination"])
        self.assertEqual(self.changes,[(ids[0],"C"),(ids[0],"D")])
        with self.bridge.db() as db:
            stages=[(r["letter"],r["state"]) for r in db.execute(
                "SELECT letter,state FROM wheel_stages WHERE grant_id=? ORDER BY letter",(grant["grant_id"],))]
        self.assertEqual(stages,[("C","verified"),("D","verified")])

    def test_restart_after_verified_move_closes_without_replaying(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_continuity_mode SET enabled=1 WHERE id=1")
            grant=db.execute("SELECT grant_id FROM wheel_grants WHERE card_id=?",(ids[0],)).fetchone()[0]
            db.execute("UPDATE wheel_grants SET state='working' WHERE grant_id=?",(grant,))
            for letter in "ABCD":
                db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started,finished,receipt) "
                           "VALUES(? ,?,'verified',?,?,?)",
                           (grant,letter,self.bridge.factory.utc(),self.bridge.factory.utc(),json.dumps({"verified":True})))
        self.cards[ids[0]]["idList"]=CHECK
        selected=w._trial_limit()
        self.assertEqual(selected["expected"],ids[0])
        self.assertTrue(selected["post_move_close"])
        self.assertFalse(self.runs or self.changes)

    def test_large_existing_screen_allows_small_edit_but_new_large_file_does_not(self):
        w,ids=self.batch()
        path=self.root/self.files[0]
        path.write_bytes(b"a"*(1024*1024+20))
        self.git("add","--",self.files[0])
        self.git("commit","-m","large established screen")
        path.write_bytes(path.read_bytes()+b"\nsmall change\n")
        with self.bridge.db() as db:
            grant=w._verified(db.execute("SELECT * FROM wheel_grants WHERE card_id=?",(ids[0],)).fetchone())
        grant={**grant,"allowed_files":["artifacts/go-app-mobile/"]}
        pub=WheelPublication(self.bridge.factory,[])
        effects=WheelEffects(self.bridge.factory)
        self.assertIn("small change",effects._check_files(self.root,grant,pub,validate=False))
        fresh=self.root/"artifacts/go-app-mobile/new-large.ts"
        fresh.write_bytes(b"b"*(1024*1024+1))
        with self.assertRaises(BridgeError) as failure:
            effects._check_files(self.root,grant,pub,validate=False)
        self.assertEqual(failure.exception.code,"WHEEL_PATCH_SIZE")

    def test_credit_recovery_claims_same_job_and_session_once(self):
        w,ids=self.batch()
        self.bridge.factory._start(self.bridge.factory._spec(self.cards[ids[0]]))
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_continuity_mode SET enabled=1 WHERE id=1")
            grant_row=db.execute("SELECT * FROM wheel_grants WHERE card_id=?",(ids[0],)).fetchone()
            grant=w._verified(grant_row)
            attempt=self.bridge.factory._row(ids[0],grant["attempt"])
            job_id=attempt["job_id"]
            session="01a1c9c6-a22d-7f03-ad3a-6c1302b1f658"
            db.execute("UPDATE jobs SET state='failed',session_id=?,result=? WHERE id=?",
                       (session,json.dumps({"credit_limited":True}),job_id))
            db.execute("UPDATE wheel_grants SET state='credit_wait',reason='CREDIT_LIMIT' WHERE grant_id=?",
                       (grant["grant_id"],))
            db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started,finished,receipt) "
                       "VALUES(?,'A','verified',?,?,?)",
                       (grant["grant_id"],self.bridge.factory.utc(),self.bridge.factory.utc(),json.dumps({"job":job_id})))
            db.execute("UPDATE wheel_control SET enabled=0,reason='CREDIT_LIMIT' WHERE id=1")
            db.execute("INSERT INTO wheel_grants(card_id,attempt,grant_id,terms,signature,state,reason) "
                       "VALUES(?,1,?,?,?,'credit_wait','CREDIT_LIMIT')",
                       ("d"*24,"d"*32,grant_row["terms"],grant_row["signature"]))
        w.checkpoint(grant,"CREDIT_LIMIT")
        self.codex_state="limited"
        self.assertFalse(w.resume_after_quota())
        self.assertFalse(w.enabled())
        resumed=[]
        ready=threading.Event()
        self.bridge.run_codex=lambda payload,sid:(resumed.append((payload["job"],sid)),ready.set())
        self.codex_state="available"
        self.assertTrue(w.resume_after_quota(),w.status())
        self.assertTrue(ready.wait(2))
        self.assertEqual(resumed,[(job_id,session)])
        self.assertFalse(w.resume_after_quota())
        self.assertEqual(resumed,[(job_id,session)])
        self.assertEqual(self.bridge.job(job_id)["state"],"running")


if __name__ == "__main__":
    unittest.main()
