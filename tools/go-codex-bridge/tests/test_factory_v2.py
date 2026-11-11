"""No real CLI, Trello mutation, hosted data or live activation in this suite."""
import copy
from http import cookies
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
import urllib.parse
from unittest.mock import patch

import test_bridge as fixtures
import test_wheel as wheel_fixtures
from puente import Bridge,BridgeError
from factory import normalize_guide
from factory_v2 import Continuity
from remote_panel import RemotePanel,private_text
from owner_expo import OwnerExpo
from device_probes import DeviceProbes,peer_from_headers
from wheel_effects import WheelEffects,WheelPublication
from orbit_v2 import OrbitV2


class V2WheelTests(unittest.TestCase):
    setUp=wheel_fixtures.WheelTests.setUp
    tearDown=wheel_fixtures.WheelTests.tearDown
    git=wheel_fixtures.WheelTests.git
    configure=wheel_fixtures.WheelTests.configure
    api=wheel_fixtures.WheelTests.api
    snapshot=wheel_fixtures.WheelTests.snapshot
    synthetic_codex=wheel_fixtures.WheelTests.synthetic_codex
    decisions=wheel_fixtures.WheelTests.decisions
    five_card_queue=wheel_fixtures.WheelTests.five_card_queue

    def batch(self, *, diagnostic_fallback=False):
        self.five_card_queue()
        w=self.bridge.factory.wheel
        ids=[cid for cid in wheel_fixtures.REAL_BATCH_IDS if cid!=wheel_fixtures.REAL_BATCH_IDS[3]]
        self.card_files=dict(zip(ids,self.files))
        self.cards[wheel_fixtures.REAL_BATCH_IDS[3]]['idList']='v2'
        if diagnostic_fallback:
            self.cards[ids[1]]["comments"][0]["text"]=wheel_fixtures.DIAGNOSTIC_TEXT
            self.cards[ids[2]]["comments"][0]["text"]=(
                "Tarea sintética. Si ese resultado no está disponible, implementar la ergonomía reutilizable; "
                "dejar identificadas las acciones de servidor pendientes, sin inventar éxito."
            )
        w.prepare_frozen_batch(ids)
        ds=self.decisions()
        ds[2]['depends_on']=[ds[1]['card_id']]
        w.approve(ds,start_frozen_batch=True)
        if diagnostic_fallback:
            self.block(w,ids[0])
            self.block(w,ids[1])
        return w,ids

    def live_credit_wait(self):
        b=self.bridge;w=b.factory.wheel
        w.activate_live("1"*64)
        cards={c["id"]:c for c in b.factory._cards()}
        selected=w._live_selection(cards,w.live_policy())
        with b.db() as db:
            saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(selected["grant_id"],)).fetchone()
            grant=w._verified(saved)
        card=self.cards[grant["card_id"]]
        _,spec=w._subject(card)
        job=b.prepare_text(spec["instruction"],"4",{"source":"verified-queue",
            "card_id":grant["card_id"],"attempt":grant["attempt"],"board_id":grant["board"],
            "list_id":grant["origin"],"comment_ids":grant["comment_ids"]})
        session="preserved-codex-session"
        with b.db() as db:
            db.execute("INSERT INTO factory_attempts(card_id,attempt,title,instruction_sha,state,job_id,before_sha) "
                       "VALUES(?,?,?,?,?,?,?)",(grant["card_id"],grant["attempt"],spec["title"],
                       grant["instruction_sha"],"limit_pause",job["id"],self.git("rev-parse","HEAD")))
            db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started,finished,receipt) "
                       "VALUES(?,'A','verified','started','finished',?)",
                       (grant["grant_id"],json.dumps({"job":job["id"],"session":session})))
            db.execute("UPDATE wheel_grants SET state='credit_wait',reason='CREDIT_LIMIT' WHERE grant_id=?",
                       (grant["grant_id"],))
            db.execute("UPDATE jobs SET state='failed',pid=NULL,session_id=?,result=? WHERE id=?",
                       (session,json.dumps({"credit_limited":True,"exit_code":1}),job["id"]))
        w.checkpoint(grant,"CREDIT_LIMIT")
        w.pause("WHEEL_CODEX_SESSION_CHANGED")
        self.codex_identity="new-synthetic-codex-account"
        return w,grant,job["id"],session

    def test_frozen_owner_approval_installs_v2_activation_atomically(self):
        w,ids=self.batch(diagnostic_fallback=True)
        self.assertTrue(w.enabled())
        with self.bridge.db() as db:
            row=db.execute("SELECT document,signature FROM wheel_trials WHERE state='active'").fetchone()
            doc=json.loads(row['document'])
            self.assertEqual(doc['policy'],'independent-v2')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM factory_v2_activation').fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit WHERE event='wheel_v2_owner_activated'").fetchone()[0],1)
        activation=w.continuity.verify_activation(w.status()['frozen_batch']['id'],doc)
        self.assertEqual(len(activation['dependency_fallbacks']),1)
        self.assertEqual((activation['dependency_fallbacks'][0]['dependency_card_id'],
                          activation['dependency_fallbacks'][0]['dependent_card_id']),(ids[1],ids[2]))
        self.assertFalse(self.runs or self.changes)

    def test_repeated_activation_requests_return_existing_run_without_relaunch(self):
        w,_=self.batch()
        review=w.continuity.review_activation()
        with self.bridge.db() as db:
            before=db.execute("SELECT COUNT(*) FROM audit WHERE event='wheel_v2_owner_activated'").fetchone()[0]
        self.assertTrue(w.toggle(True)['enabled'])
        result=w.continuity.activate(review,'synthetic-owner')
        self.assertTrue(result['enabled'])
        self.assertTrue(result['idempotent'])
        with self.bridge.db() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM factory_v2_activation').fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit WHERE event='wheel_v2_owner_activated'").fetchone()[0],before)
        self.assertFalse(self.runs or self.changes)

    def test_main_button_model_reflects_server_state_and_refuses_duplicate_start(self):
        paused=RemotePanel.activation_button({'enabled':False,'reason':'OWNER_PAUSED','batch_id':'batch','batch_state':'active'},[])
        self.assertEqual(paused['state'],'paused')
        self.assertEqual(paused['label'],'FÁBRICA PAUSADA · ACTIVAR')
        self.assertFalse(paused['disabled'])
        active=RemotePanel.activation_button({'enabled':True,'reason':None,'batch_id':'batch','batch_state':'active'},[])
        self.assertEqual(active['state'],'active')
        self.assertEqual(active['label'],'FÁBRICA ACTIVADA')
        self.assertTrue(active['disabled'])
        blocked=RemotePanel.activation_button({'enabled':False,'reason':'FACTORY_JOB_FAILED','batch_id':'batch','batch_state':'active'},[])
        self.assertEqual(blocked['state'],'blocked')
        self.assertIn('bloqueada',blocked['progress'].casefold())
        finished=RemotePanel.activation_button({'enabled':False,'reason':None,'batch_id':'batch','batch_state':'completed'},[])
        self.assertEqual(finished['label'],'FÁBRICA FINALIZADA')
        self.assertTrue(finished['disabled'])
        running=RemotePanel.activation_button({'enabled':False,'reason':None,'batch_id':'batch','batch_state':'active'},
            [{'state':'working','activity':{'state':'running'}}])
        self.assertTrue(running['disabled'])
        renewal=RemotePanel.activation_button({'enabled':False,'reason':'OWNER_PAUSED','batch_id':'batch',
            'batch_state':'active','renewal_required':True},[])
        self.assertEqual(renewal['label'],'FÁBRICA PAUSADA · REAUTORIZAR')
        self.assertEqual(RemotePanel.activation_confirmation({'renewals':[{'operations':['C','D']}]}),
                         'REAUTORIZAR PENDIENTES Y ACTIVAR FÁBRICA')

    def block(self,w,cid,state='blocked'):
        with self.bridge.db() as db:db.execute('UPDATE wheel_grants SET state=?,reason=? WHERE card_id=?',(state,'synthetic',cid))

    def test_blocked_and_dependent_cards_yield_to_independent(self):
        w,ids=self.batch()
        self.block(w,ids[0]);self.block(w,ids[1],'waiting_response')
        selected=w._trial_limit()
        self.assertEqual(selected['expected'],ids[3])
        self.assertFalse(selected.get('explicit_diagnostic_fallback',False))
        self.assertTrue(w.enabled())
        self.assertFalse(self.runs or self.changes)

    def test_three_pending_cards_skip_blocked_and_dependent_without_cli(self):
        w,ids=self.batch()
        self.block(w,ids[0]);self.block(w,ids[1])
        with patch.object(w,'_advance',return_value={'selected':ids[3]}) as advance:
            self.assertEqual(w.tick(),{'selected':ids[3]})
        self.assertEqual(advance.call_args.args[0]['card_id'],ids[3])
        self.assertEqual(w.status()['current']['card_id'],ids[3])
        self.assertFalse(self.runs or self.changes)

    def test_verified_push_with_missing_metro_receipt_is_selected_for_reconciliation(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            row=db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone()
            grant=w._verified(row)
            db.execute("UPDATE wheel_grants SET state='blocked',reason='FACTORY_METRO_OUTDATED' WHERE grant_id=?",
                       (grant['grant_id'],))
            db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started,approval_id) VALUES(?,?,'verified','synthetic',?)",
                       (grant['grant_id'],'A','synthetic'))
            db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started,approval_id) VALUES(?,?,'claimed','synthetic',?)",
                       (grant['grant_id'],'B','synthetic'))
        with patch.object(self.bridge.factory,'_row',return_value={'job_id':'synthetic-job'}),\
             patch.object(self.bridge,'job',return_value={'id':'synthetic-job','state':'completed'}),\
             patch.object(WheelEffects,'_publications',return_value=[{'state':'verified'}]):
            selected=w._trial_limit()
            self.assertEqual(selected['expected'],ids[0])
            self.assertTrue(selected['published_recovery'])
            self.assertEqual(w.continuity.review_activation()['plan'][0]['action'],'run')
        self.assertFalse(self.runs or self.changes)

    def test_paused_old_metro_block_reconciles_once_and_survives_restart(self):
        w,ids=self.batch();w.pause('FACTORY_METRO_OUTDATED')
        with self.bridge.db() as db:
            row=db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone()
            grant=w._verified(row)
            db.execute("UPDATE wheel_grants SET state='blocked',reason='FACTORY_METRO_OUTDATED' WHERE grant_id=?",
                       (grant['grant_id'],))
            for letter,state in [('A','verified'),('B','claimed')]:
                db.execute('INSERT INTO wheel_stages(grant_id,letter,state,started,approval_id) VALUES(?,?,?,?,?)',
                           (grant['grant_id'],letter,state,'synthetic','synthetic'))
        receipt={'main_sha':'a'*40,'served_sha':'b'*40}
        with patch.object(self.bridge.factory,'_row',return_value={'job_id':'synthetic-job'}),\
             patch.object(self.bridge,'job',return_value={'id':'synthetic-job','state':'completed'}),\
             patch.object(WheelEffects,'_publications',return_value=[{'state':'verified'}]),\
             patch.object(WheelEffects,'_reconcile_publication',return_value=True),\
             patch.object(WheelEffects,'_published',return_value=receipt) as verified:
            self.assertEqual(w.continuity.reconcile_published_stale(),[ids[0]])
            self.assertEqual(w.continuity.reconcile_published_stale(),[])
        verified.assert_called_once()
        with self.bridge.db() as db:
            self.assertEqual(db.execute('SELECT state FROM wheel_grants WHERE grant_id=?',(grant['grant_id'],)).fetchone()[0],'ready')
            self.assertEqual(db.execute('SELECT state FROM wheel_stages WHERE grant_id=? AND letter=?',
                                        (grant['grant_id'],'B')).fetchone()[0],'verified')
            self.assertEqual(db.execute('SELECT reason FROM wheel_control WHERE id=1').fetchone()[0],'OWNER_PAUSED')
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit WHERE event='wheel_published_metro_reconciled'").fetchone()[0],1)
        restored=Bridge(self.home,self.home/'private',fixtures.TestProtector(),actor=self.bridge.actor)
        restored.factory.pause_on_startup()
        self.assertFalse(restored.factory.wheel.enabled())
        self.assertFalse(self.runs or self.changes)

    def test_unreleased_comment_after_verified_publication_rearms_without_repeating_work(self):
        w,ids=self.batch();w.pause('WHEEL_PRESERVATION_PUBLICATION')
        with self.bridge.db() as db:
            grant=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone())
            db.execute("UPDATE wheel_grants SET state='uncertain',reason='WHEEL_PRESERVATION_PUBLICATION' WHERE grant_id=?",
                       (grant['grant_id'],))
            for letter,state,receipt in [('A','verified','{}'),('B','verified','{"main_sha":"a"}'),('C','claimed',None)]:
                db.execute('INSERT INTO wheel_stages(grant_id,letter,state,started,receipt) VALUES(?,?,?,?,?)',
                           (grant['grant_id'],letter,state,'synthetic',receipt))
        with patch.object(self.bridge.factory,'_row',return_value={'job_id':'synthetic-job'}),\
             patch.object(WheelEffects,'_operations',return_value=[]),\
             patch.object(WheelEffects,'_published_head_valid',return_value='b'*40) as checked:
            self.assertEqual(w.continuity.reconcile_unreleased_comment(),[ids[0]])
            self.assertEqual(w.continuity.reconcile_unreleased_comment(),[])
        checked.assert_called_once()
        with self.bridge.db() as db:
            self.assertEqual(db.execute('SELECT state FROM wheel_grants WHERE grant_id=?',(grant['grant_id'],)).fetchone()[0],'ready')
            self.assertFalse(db.execute("SELECT 1 FROM wheel_stages WHERE grant_id=? AND letter='C'",(grant['grant_id'],)).fetchone())
            self.assertEqual(db.execute('SELECT reason FROM wheel_control WHERE id=1').fetchone()[0],'OWNER_PAUSED')
        self.assertFalse(self.runs or self.changes)

    def test_published_card_reconciles_after_bridge_only_main_commit(self):
        before,card_sha,bridge_sha='a'*40,'b'*40,'c'*40
        effect=WheelEffects(self.bridge.factory)
        operation={'state':'verified','id':'synthetic-operation',
                   'payload':json.dumps({'diff':'synthetic patch','tests':[]}),
                   'result':json.dumps({'main_sha':card_sha})}
        def git(_root,*args):
            if args[:2]==('ls-remote','origin'):return bridge_sha+' refs/heads/main'
            if args[:2]==('fetch','--no-tags'):return ''
            if args[:2]==('rev-parse','FETCH_HEAD'):return bridge_sha
            if args[:2]==('diff','--name-only'):return 'tools/go-codex-bridge/factory.py'
            if args[:2]==('rev-parse',card_sha+'^'):return before
            if args[:2]==('diff','--binary'):return 'synthetic patch'
            raise AssertionError(args)
        with patch.object(effect,'_publications',return_value=[operation]),\
             patch.object(self.bridge.safety,'git_command',side_effect=git),\
             patch('wheel_effects.subprocess.run',return_value=SimpleNamespace(returncode=0)),\
             patch.object(self.bridge.factory,'_verify_metro',return_value={'sha':bridge_sha}) as verify:
            receipt=effect._published({'job_id':'synthetic','before_sha':before},self.root,sync=True)
        self.assertEqual(receipt['main_sha'],card_sha)
        self.assertEqual(receipt['served_sha'],bridge_sha)
        verify.assert_called_once_with(bridge_sha,before,self.root,synchronize=True)

    def test_comment_accepts_only_bridge_only_main_descendants(self):
        old,new='a'*40,'b'*40
        changed=['tools/go-codex-bridge/puente.py']
        def git(_root,*args):
            if args[:2]==('ls-remote','origin'):return new+' refs/heads/main'
            if args[:2]==('fetch','--no-tags'):return ''
            if args[:2]==('rev-parse','FETCH_HEAD'):return new
            if args[:2]==('diff','--name-only'):return '\n'.join(changed)
            raise AssertionError(args)
        with patch.object(self.bridge.safety,'git_command',side_effect=git),\
             patch('wheel_effects.subprocess.run',return_value=SimpleNamespace(returncode=0)):
            effect=WheelEffects(self.bridge.factory)
            self.assertEqual(effect._published_head_valid(self.root,{'served_sha':old}),new)
            changed[:]=['artifacts/go-app-mobile/app/index.tsx']
            with self.assertRaises(BridgeError):effect._published_head_valid(self.root,{'served_sha':old})

    def test_signed_instruction_fallback_can_select_only_its_blocked_diagnosis_dependency(self):
        w,ids=self.batch(diagnostic_fallback=True)
        review=w.continuity.review_activation()
        self.assertEqual([item['action'] for item in review['plan']],['skip','skip','run','run'])
        self.assertIn('alternativa expresa',review['plan'][2]['reason'])
        self.assertEqual(review['cards'][1]['operations'],['A','C','D'])
        with self.bridge.db() as db:
            row=db.execute("SELECT document,signature FROM factory_v2_activation").fetchone()
            activation=json.loads(row["document"])
            self.assertEqual(len(activation["dependency_fallbacks"]),1)
            edge=activation["dependency_fallbacks"][0]
            self.assertEqual((edge["dependency_card_id"],edge["dependent_card_id"]),(ids[1],ids[2]))
            self.assertTrue(activation["dependency_fallbacks"])
        selected=w._trial_limit()
        self.assertEqual(selected["expected"],ids[2])
        self.assertTrue(selected["explicit_diagnostic_fallback"])
        self.assertFalse(self.runs or self.changes)

    def test_signed_fallback_survives_final_head_check_without_running_codex(self):
        w,ids=self.batch(diagnostic_fallback=True)
        with self.bridge.db() as db:
            grant=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[2],)).fetchone())
        w._verify_dependencies(grant)
        with patch.object(w,'_advance',return_value={'selected':ids[2]}) as advance:
            result=w.tick()
        self.assertEqual(result,{'selected':ids[2]})
        self.assertTrue(w.enabled())
        self.assertEqual(w.status()['current']['card_id'],ids[2])
        self.assertEqual(advance.call_args.args[0]['card_id'],ids[2])
        self.assertFalse(self.runs or self.changes)

    def test_confirmed_activation_and_later_block_are_not_reported_as_unconfirmed(self):
        button=RemotePanel.activation_button({'enabled':False,'reason':'WHEEL_HEAD_DEPENDENCY_BLOCKED',
            'batch_id':'batch','batch_state':'active','activation_confirmed':True},[])
        self.assertEqual(button['state'],'blocked')
        self.assertIn('Activación confirmada',button['progress'])
        self.assertNotIn('no se confirmó',button['progress'])
        stopped=RemotePanel.activation_button({'enabled':False,'reason':'OWNER_STOPPED',
            'batch_id':'batch','batch_state':'active','activation_confirmed':True},[])
        self.assertEqual(stopped['state'],'stopped')
        self.assertIn('DETENIDA',stopped['label'])

    def test_fallback_revoked_by_dependency_state_never_selects_dependent(self):
        w,ids=self.batch(diagnostic_fallback=True)
        self.block(w,ids[1],'waiting_response')
        self.assertEqual(w._trial_limit()['expected'],ids[3])
        self.assertFalse(self.runs or self.changes)

    def test_signed_fallback_does_not_bypass_waiting_response(self):
        w,ids=self.batch(diagnostic_fallback=True)
        self.block(w,ids[1],"waiting_response")
        selected=w._trial_limit()
        self.assertEqual(selected["expected"],ids[3])
        self.assertFalse(selected.get("explicit_diagnostic_fallback",False))
        self.assertFalse(self.runs or self.changes)

    def test_no_eligible_card_waits_without_false_completion(self):
        w,ids=self.batch()
        for cid in ids:self.block(w,cid)
        self.assertEqual(w._trial_limit()['waiting'],'NO_SAFE_ELIGIBLE_CARD')
        self.assertTrue(w.enabled())
        self.assertEqual(w.status()['frozen_batch']['state'],'active')

    def test_startup_pauses_and_preserves_all_stages(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            before=[tuple(row) for row in db.execute('SELECT * FROM wheel_grants')]
        self.bridge.factory.pause_on_startup()
        self.assertFalse(w.enabled())
        with self.bridge.db() as db:self.assertEqual(before,[tuple(row) for row in db.execute('SELECT * FROM wheel_grants')])
        self.assertEqual(w.tick(),{'enabled':False})

    def test_account_change_requires_fresh_owner_review_and_never_replays(self):
        w,ids=self.batch();w.pause('OWNER_PAUSED')
        old_review=w.continuity.review_activation()
        self.codex_identity='another-synthetic-account'
        with self.assertRaises(BridgeError):w.continuity.activate(old_review,'synthetic-owner')
        self.assertFalse(w.enabled())
        review=w.continuity.review_activation()
        self.assertTrue(review['account_changed'])
        self.assertTrue(all(c['action']=='run' for c in review['plan']))
        result=w.continuity.activate(review,'synthetic-owner')
        self.assertTrue(result['enabled'])
        with self.bridge.db() as db:
            doc=json.loads(db.execute("SELECT document FROM wheel_trials WHERE state='active'").fetchone()[0])
            self.assertEqual(doc['codex_identity'],'another-synthetic-account')
            self.assertEqual(db.execute("SELECT count(*) FROM audit WHERE event='wheel_owner_account_bound'").fetchone()[0],1)
        self.assertFalse(self.runs or self.changes)

    def test_live_queue_rebind_requires_owner_review_and_resumes_exact_session(self):
        w,grant,job_id,session=self.live_credit_wait()
        panel=RemotePanel(self.bridge)
        ticket=panel.preview("rebind",{},"synthetic-owner")
        review=ticket["review"]
        self.assertTrue(review["live_queue_rebind"])
        self.assertTrue(review["resume_exact_session"])
        self.assertEqual(ticket["confirmation"],"VINCULAR CUENTA Y REANUDAR COLA")
        self.assertEqual(len(review["pending"]),1)
        self.assertEqual(review["pending"][0]["card_id"],grant["card_id"])
        self.assertEqual(review["pending"][0]["completed"],[])
        self.assertEqual(review["pending"][0]["operations"],["A","B","C","D"])
        self.assertNotIn(self.codex_identity,str(review))
        before_checkpoint=None
        with self.bridge.db() as db:
            before_checkpoint=db.execute("SELECT id,snapshot FROM wheel_checkpoints WHERE grant_id=? "
                                         "AND phase='CREDIT_LIMIT' ORDER BY id DESC LIMIT 1",
                                         (grant["grant_id"],)).fetchone()
        with patch.object(w,"resume_after_quota",return_value=True) as resume:
            result=panel.decide(ticket["ticket"],ticket["confirmation"],"synthetic-owner")
        self.assertTrue(result["resumed"])
        resume.assert_called_once_with()
        rebound=w.live_policy()
        self.assertEqual(rebound["codex_identity"],self.codex_identity)
        with self.bridge.db() as db:
            saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(grant["grant_id"],)).fetchone()
            updated=w._verified(saved)
            current_job=db.execute("SELECT state,session_id FROM jobs WHERE id=?",(job_id,)).fetchone()
            checkpoint=db.execute("SELECT id,snapshot FROM wheel_checkpoints WHERE grant_id=? "
                                  "AND phase='CREDIT_LIMIT' ORDER BY id DESC LIMIT 1",
                                  (grant["grant_id"],)).fetchone()
            self.assertEqual(db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM factory_live_rebindings").fetchone()[0],1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit WHERE event='wheel_live_account_rebound'").fetchone()[0],1)
        self.assertEqual(updated["codex_identity_sha256"],self.bridge.factory.digest(self.codex_identity))
        self.assertEqual(updated["grant_id"],grant["grant_id"])
        self.assertEqual((current_job["state"],current_job["session_id"]),("failed",session))
        self.assertEqual((checkpoint["id"],checkpoint["snapshot"]),(before_checkpoint["id"],before_checkpoint["snapshot"]))
        self.assertEqual(updated["operations"],list("ABCD"))
        self.assertFalse(w.enabled())
        self.assertFalse(self.runs or self.changes)

    def test_live_queue_rebind_rejects_queue_change_or_running_work(self):
        w,grant,job_id,session=self.live_credit_wait()
        review=w.continuity.review_live_rebind()
        self.cards[grant["card_id"]]["pos"]+=100
        with patch.object(w,"resume_after_quota") as resume:
            with self.assertRaises(BridgeError) as changed:
                w.continuity.rebind_live_queue(review,"synthetic-owner")
        self.assertEqual(changed.exception.code,"WHEEL_SUBJECT_CHANGED")
        resume.assert_not_called()
        self.assertEqual(w.live_policy()["codex_identity"],"synthetic-codex-account")
        self.assertFalse(w.enabled())
        self.assertFalse(self.runs or self.changes)

    def test_live_queue_rebind_refuses_running_jobs_without_mutation(self):
        w,grant,job_id,session=self.live_credit_wait()
        with self.bridge.db() as db:
            db.execute("UPDATE jobs SET state='running' WHERE id=?",(job_id,))
        with self.assertRaises(BridgeError) as busy:
            w.continuity.review_live_rebind()
        self.assertEqual(busy.exception.code,"WHEEL_WORKSPACE_BUSY")
        self.assertEqual(w.live_policy()["codex_identity"],"synthetic-codex-account")
        self.assertFalse(w.enabled())

    def test_activation_pins_exact_review_and_never_enlarges_operations(self):
        w,ids=self.batch();w.pause('OWNER_PAUSED')
        review=w.continuity.review_activation()
        changed=copy.deepcopy(review);changed['cards'][0]['operations']=[]
        with self.assertRaises(BridgeError):w.continuity.activate(changed,'synthetic-owner')
        self.assertFalse(w.enabled())

    def expire_batch(self,w):
        with self.bridge.db() as db:
            row,doc=w._latest_trial(db)
            doc['expires_at']=1
            db.execute('UPDATE wheel_trials SET document=?,signature=? WHERE id=?',
                       (self.bridge.factory.canonical(doc),self.bridge.sign(doc),row['id']))
            for item in doc['cards']:
                saved=db.execute('SELECT * FROM wheel_grants WHERE grant_id=?',(item['grant_id'],)).fetchone()
                terms=w._verified(saved)
                terms['expires_at']=1
                db.execute('UPDATE wheel_grants SET terms=?,signature=? WHERE grant_id=?',
                           (self.bridge.factory.canonical(terms),self.bridge.sign(terms),terms['grant_id']))

    def test_expired_batch_requires_new_owner_decision_for_only_unfinished_stages(self):
        w,ids=self.batch(diagnostic_fallback=True)
        w.pause('OWNER_PAUSED')
        with self.bridge.db() as db:
            grant=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[2],)).fetchone())
            for letter in 'AB':
                db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started,finished,receipt) "
                           "VALUES(?,?,'verified','synthetic','synthetic','{}')",(grant['grant_id'],letter))
        self.expire_batch(w)
        review=w.continuity.review_activation()
        with self.bridge.db() as db:
            note_grant=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[3],)).fetchone())
        self.assertEqual(review['renewals'],[
            {'card_id':ids[2],'grant_id':grant['grant_id'],'operations':['C','D'],'prior_expiry':1},
            {'card_id':ids[3],'grant_id':note_grant['grant_id'],
             'operations':['A','B','C','D'],'prior_expiry':1}])
        self.assertFalse(w.enabled())
        with self.assertRaises(BridgeError):w.toggle(True)
        self.assertFalse(w.enabled())
        result=w.continuity.activate(review,'synthetic-owner')
        self.assertTrue(result['enabled'])
        with self.bridge.db() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM factory_v2_renewals').fetchone()[0],2)
            renewed=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[2],)).fetchone())
            self.assertEqual(renewed['reauthorized_letters'],['C','D'])
            self.assertFalse(w._operation_authorized(renewed,'A'))
            self.assertTrue(w._operation_authorized(renewed,'C'))
            self.assertEqual([r['letter'] for r in db.execute('SELECT letter FROM wheel_stages WHERE grant_id=? ORDER BY letter',
                             (grant['grant_id'],))],['A','B'])
        restored=Bridge(self.home,self.home/'private',fixtures.TestProtector(),actor=self.bridge.actor)
        self.assertEqual(restored.factory.wheel._trial_limit()['expected'],ids[2])
        self.assertFalse(self.runs or self.changes)

    def test_expired_batch_rejects_stale_or_modified_owner_review(self):
        w,ids=self.batch(diagnostic_fallback=True);w.pause('OWNER_PAUSED');self.expire_batch(w)
        review=w.continuity.review_activation()
        altered=copy.deepcopy(review);altered['renewals'][0]['operations']=[]
        with self.assertRaises(BridgeError):w.continuity.activate(altered,'synthetic-owner')
        self.assertFalse(w.enabled())
        with self.bridge.db() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM factory_v2_renewals').fetchone()[0],0)
        self.cards[ids[2]]['pos']+=1
        with self.assertRaises(BridgeError):w.continuity.activate(review,'synthetic-owner')
        self.assertFalse(w.enabled())

    def test_transient_retry_is_bounded_and_survives_restart(self):
        w,ids=self.batch()
        with self.bridge.db() as db:g=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone())
        for _ in range(3):self.assertTrue(w.continuity.defer_retry(g,'B','HTTP_503'))
        restored=Bridge(self.home,self.home/'private',fixtures.TestProtector(),actor=self.bridge.actor)
        self.assertFalse(restored.factory.wheel.continuity.defer_retry(g,'B','HTTP_503'))
        self.assertFalse(self.runs or self.changes)

    def test_backoff_retains_the_only_workspace_without_selecting_another_card(self):
        w,ids=self.batch()
        with self.bridge.db() as db:
            g=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone())
            db.execute("UPDATE wheel_grants SET state='working' WHERE card_id=?",(ids[0],))
        self.assertTrue(w.continuity.defer_retry(g,'B','HTTP_503'))
        self.assertEqual(w._trial_limit()['waiting'],'RETRY_BACKOFF')
        self.assertTrue(w.enabled())
        self.assertFalse(self.runs or self.changes)

    def test_question_decision_is_exact_durable_and_single_use(self):
        w,ids=self.batch()
        with self.bridge.db() as db:g=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone())
        q=w.continuity.question(g,'permission','¿Permitir la prueba sintética descrita?','Operación sintética aislada')
        self.assertEqual(q,w.continuity.question(g,'permission','¿Permitir la prueba sintética descrita?','Operación sintética aislada'))
        self.assertEqual(w.continuity.answer(q,'deny','','synthetic-owner')['state'],'denied')
        with self.assertRaises(BridgeError):w.continuity.answer(q,'allow_once','','synthetic-owner')
        self.assertFalse(self.runs or self.changes)

    def test_answer_does_not_claim_live_cli_resume(self):
        w,ids=self.batch()
        with self.bridge.db() as db:g=w._verified(db.execute('SELECT * FROM wheel_grants WHERE card_id=?',(ids[0],)).fetchone())
        q=w.continuity.question(g,'answer','¿Qué resultado hay que comprobar?','Precisar la comprobación')
        response=w.continuity.answer(q,'respond','La ficha visible.','synthetic-owner')
        self.assertEqual(response['state'],'review_required')
        self.assertIn('no admite respuestas en vivo',response['message'])
        self.assertFalse(self.runs or self.changes)

    def test_long_guide_is_repaired_without_new_cli_or_lost_words(self):
        steps=[wheel_fixtures.TWO_STEPS[0]+' '+('Revisa el nombre y la hora. '*20),wheel_fixtures.TWO_STEPS[1]]
        job={'id':'synthetic','result':{'response':'GO_FACTORY_EVIDENCE: '+json.dumps({'validation':steps})}}
        fixed=WheelEffects(self.bridge.factory)._validation(job)
        self.assertTrue(all(len(s)<=280 for s in fixed))
        self.assertEqual(' '.join(' '.join(steps).split()),' '.join(' '.join(fixed).split()))
        self.assertFalse(self.runs)

    def test_pending_real_diagnosis_is_not_a_fabrication_failure(self):
        job={'state':'blocked','result':{'exit_code':0,'turn_completed':True,'file_change_events':0,
             'response':'GO_FACTORY_DIAGNOSIS: {}'}}
        self.assertTrue(Continuity.diagnostic_ready(job))
        for key,value in [('file_change_events',1),('policy_errors',['unsafe']),('credit_limited',True)]:
            other=copy.deepcopy(job);other['result'][key]=value
            self.assertFalse(Continuity.diagnostic_ready(other))

    def test_failed_card_yields_complete_synthetic_cycles_without_replay(self):
        w,ids=self.batch()
        original=WheelPublication.git_command
        def git(pub,workspace,*args):
            if args[:2]==('remote','get-url'):return 'https://github.com/goappdev01/goapp.git\n'
            return original(pub,workspace,*args)
        def execute(payload):
            cid=self.bridge.job(payload['job'])['data']['source']['card_id']
            if cid==ids[0]:
                self.runs.append(cid)
                self.bridge.finish_job(payload['job'],'blocked',{'exit_code':0,'turn_completed':True,
                    'file_change_events':0,'response':'Falta la respuesta de prueba.'})
            else:self.synthetic_codex(self.bridge,payload)
        self.bridge.run_codex=execute
        with patch.object(WheelPublication,'git_command',git),patch.object(WheelEffects,'_dependencies'),patch.object(WheelEffects,'_tests',return_value=[{'check':'synthetic assertion','passed':True}]):
            for _ in range(45):
                result=w.tick()
                self.assertFalse(result.get('paused') or result.get('blocked'),str(result))
                if result.get('waiting'):break
        states={g['card_id']:g['state'] for g in w.status()['grants']}
        self.assertEqual(states[ids[0]],'blocked')
        self.assertTrue(all(states[cid]=='closed' for cid in ids[1:]),states)
        self.assertEqual(self.runs,ids)
        self.assertEqual(self.changes,[(cid,phase) for cid in ids[1:] for phase in 'CD'])
        self.assertTrue(w.enabled())


class RemoteTests(unittest.TestCase):
    setUp=fixtures.BridgeTests.setUp
    tearDown=fixtures.BridgeTests.tearDown

    def panel(self):
        p=RemotePanel(self.bridge)
        p.config={'hostname':'test.tail.invalid','owner_hash':self.bridge.sign({'tailnet_owner':'owner@example.invalid'})}
        h=SimpleNamespace(client_address=('127.0.0.1',123),headers={'Host':'test.tail.invalid',
            'X-Forwarded-Proto':'https','Tailscale-User-Login':'owner@example.invalid'})
        return p,h

    def test_orbit_v2_shares_owner_layout_without_touching_wheel_or_trello(self):
        p,h=self.panel()
        p.authorize(h)
        owner=p.orbit_owner()
        self.assertEqual(OrbitV2(self.bridge).state(owner)['revision'],0)
        with patch.object(p,'snapshot',return_value={'wheel':{'enabled':False}}),patch.object(
                OrbitV2,'system_probe',return_value={'checked_at':1,'tailscale':'sin verificar'}):
            state=p.orbit_state()
            self.assertEqual(len(state['layout']['layout'][0]),7)
            moved=p.orbit_move({'revision':0,'module':'diagnostics','orbit':1,'position':0})
            self.assertEqual(moved['layout'][1],['diagnostics'])
            second,_=self.panel()
            self.assertEqual(OrbitV2(second.b).state(second.orbit_owner())['layout'][1],['diagnostics'])
            with self.assertRaises(BridgeError):
                p.orbit_move({'revision':0,'module':'history','orbit':0,'position':0})
        self.assertFalse(self.bridge.factory.wheel.enabled())
        with self.bridge.db() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM operations').fetchone()[0],0)

    def test_orbit_v2_factory_controls_reuse_owner_review_and_confirmation(self):
        p,_=self.panel()
        principal='owner@example.invalid'
        with patch.object(p,'preview',return_value={'ticket':'synthetic'}) as preview,patch.object(
                p,'decide',return_value={'enabled':False}) as decide,patch.object(p.w,'pause') as pause:
            self.assertEqual(p.orbit_control('preview',{'action':'activate'},principal)['ticket'],'synthetic')
            preview.assert_called_once_with('activate',{},principal)
            self.assertEqual(p.orbit_control('decide',{'ticket':'t','confirmation':'ACTIVAR FÁBRICA'},principal),
                             {'enabled':False})
            decide.assert_called_once_with('t','ACTIVAR FÁBRICA',principal)
            with self.assertRaises(BridgeError):
                p.orbit_control('stop',{'confirmation':'PAUSAR FÁBRICA'},principal)
            pause.assert_not_called()
            self.assertEqual(p.orbit_control('pause',{'confirmation':'PAUSAR FÁBRICA'},principal)['reason'],
                             'OWNER_PAUSED')
            pause.assert_called_once_with('OWNER_PAUSED')

    def test_iphone_probe_rejects_windows_and_binds_phone_origin_and_single_use_nonce(self):
        p,h=self.panel();p.config.update(expo_phone='100.64.0.9');p.device_probes.config=p.config
        manager=OwnerExpo(p.b);owner={'port':8089,'sha':'a'*40,'host':'100.64.0.1','workspace':'C:/pinned'}
        with patch('owner_expo.OwnerExpo.load',return_value=owner):
            with self.assertRaises(BridgeError):p.device_probes.start('owner@example.invalid','100.64.0.8','Mozilla iPhone')
            started=p.device_probes.start('owner@example.invalid','100.64.0.9','Mozilla iPhone')
            self.assertIn(':8089/__go_device_probe.local.html#',started['url'])
            cfg=json.loads(urllib.parse.unquote(urllib.parse.urlsplit(started['url']).fragment))
            stages=[{'key':k,'ok':True,'bytes':100,'count':1,'elapsed_ms':10,'error':''} for k in ('document','metro','manifest','bundle','assets','websocket')]
            report={'origin':'http://100.64.0.1:8089','browser_iphone':True,'stages':stages,'elapsed_ms':200}
            body={'id':cfg['id'],'nonce':cfg['nonce'],'report':report}
            saved=p.device_probes.report(body,'owner@example.invalid','100.64.0.9','Mozilla iPhone')
            self.assertEqual(saved['state'],'browser_transport_passed')
            self.assertEqual(saved['app_loaded'],'not_verified')
            with self.assertRaises(BridgeError):p.device_probes.report(body,'owner@example.invalid','100.64.0.9','Mozilla iPhone')
            self.assertEqual(p.device_probes.latest('owner@example.invalid')['browser']['state'],'browser_transport_passed')

    def test_iphone_browser_report_validates_schema_and_tcp_observation_is_labelled_windows(self):
        self.assertEqual(peer_from_headers({'X-Forwarded-For':'spoofed, 100.64.0.9'}),'100.64.0.9')
        self.assertIsNone(peer_from_headers({'X-Forwarded-For':'spoofed'}))
        p,_=self.panel();self.assertEqual(p.device_probes.sample()['source'],'windows_observation')
        self.assertFalse(p.device_probes.sample()['phone_tcp_seen'])

    def test_remote_auth_requires_private_proxy_and_exact_owner(self):
        p,h=self.panel();self.assertEqual(p.authorize(h)[0],'owner@example.invalid')
        for key,value in [('Host','localhost:8765'),('Tailscale-User-Login','outsider@example.invalid'),('X-Forwarded-Proto','http')]:
            bad=copy.deepcopy(h);bad.headers[key]=value
            with self.assertRaises(BridgeError):p.authorize(bad)
        h.client_address=('100.64.0.2',123)
        with self.assertRaises(BridgeError):p.authorize(h)

    def test_mutations_need_origin_cookie_and_csrf(self):
        p,h=self.panel();_,csrf=p.authorize(h)
        with self.assertRaises(BridgeError):p.authorize(h,True)
        h.headers.update(Origin='https://test.tail.invalid',Cookie='go_remote='+csrf,**{'X-GO-CSRF':csrf})
        p.authorize(h,True)
        h.headers['Origin']='https://evil.invalid'
        with self.assertRaises(BridgeError):p.authorize(h,True)

    def test_private_values_are_not_exposed_in_panel_text(self):
        value=private_text('Bearer secret-test https://private.invalid owner@example.invalid 40.12345,-3.23456 +34 600 111 222')
        for forbidden in ['secret-test','private.invalid','owner@','40.12345','600']:self.assertNotIn(forbidden,value)

    def test_panel_does_not_present_functional_diagnosis_as_policy_failure(self):
        p,_=self.panel()
        activity=p.activity({'id':'synthetic','state':'blocked','updated':'now','result':{
            'reported_status':'blocked','failed_commands':3,'policy_errors':[],
            'classification_reason':'Codex informa de un bloqueo de política, permisos o infraestructura.'}})
        self.assertIn('no se registraron errores de política',activity['error'])
        self.assertIn('bloqueo funcional',activity['error'])

    def test_confirmation_ticket_is_single_use_and_owner_bound(self):
        p,_=self.panel();p.previews['test']={'principal':'owner','expires':10**12,'action':'activate','review':{}}
        with self.assertRaises(BridgeError):p.decide('test','ACTIVAR FÁBRICA','other')
        with self.assertRaises(BridgeError):p.decide('test','ACTIVAR FÁBRICA','owner')

    def test_install_leaves_owner_version_absent_and_wheel_paused(self):
        self.assertEqual(OwnerExpo(self.bridge).status()['state'],'not_configured')
        self.assertFalse(self.bridge.factory.wheel.enabled())

    def test_owner_config_signed_and_port_cannot_be_changed(self):
        manager=OwnerExpo(self.bridge)
        manager.save({'port':8089,'sha':'a'*40})
        self.assertEqual(manager.load()['sha'],'a'*40)
        manager.path.write_text(manager.path.read_text().replace('8089','8088'))
        with self.assertRaises(BridgeError):manager.load()

    def test_owner_update_requires_known_sha_and_unchanged_dependencies(self):
        manager=OwnerExpo(self.bridge)
        doc={'port':8089,'workspace':'synthetic','sha':'a'*40}
        with patch.object(manager,'load',return_value=doc),patch.object(manager,'clean'),patch.object(manager,'git') as git,patch('owner_expo.subprocess.run'):
            with self.assertRaises(BridgeError):manager.review('expo_select',{'sha':'main'})
            git.side_effect=[doc['sha'],'pnpm-lock.yaml']
            with self.assertRaises(BridgeError):manager.review('expo_select',{'sha':'b'*40})
        self.assertFalse(self.bridge.factory.wheel.enabled())

    def test_owner_clean_preserves_porcelain_columns_for_equivalent_expo_file(self):
        manager=OwnerExpo(self.bridge)
        workspace=self.bridge.home/'synthetic-owner'
        generated=workspace/'artifacts/go-app-mobile/expo-env.d.ts'
        generated.parent.mkdir(parents=True)
        generated.write_text('generated\n',encoding='utf-8')
        with patch('owner_expo.subprocess.check_output',side_effect=[
                ' M artifacts/go-app-mobile/expo-env.d.ts\n','generated\n']):
            manager.clean({'workspace':str(workspace)})
        generated.write_text('different\n',encoding='utf-8')
        with patch('owner_expo.subprocess.check_output',side_effect=[
                ' M artifacts/go-app-mobile/expo-env.d.ts\n','generated\n']):
            with self.assertRaises(BridgeError):manager.clean({'workspace':str(workspace)})

    def test_owner_running_version_is_not_automatically_main(self):
        manager=OwnerExpo(self.bridge)
        doc={'port':8089,'workspace':'synthetic','sha':'a'*40,'host':'100.64.0.1','state':'verified'}
        with patch.object(manager,'load',return_value=doc),patch.object(manager,'git',return_value=doc['sha']) as git,patch('owner_expo.urllib.request.urlopen',side_effect=OSError):
            s=manager.status()
            self.assertEqual(s['sha'],'a'*40)
            self.assertEqual(git.call_args.args[1:],('rev-parse','HEAD'))
        self.assertFalse(self.bridge.factory.wheel.enabled())
