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

    def test_activation_pins_exact_review_and_never_enlarges_operations(self):
        w,ids=self.batch();w.pause('OWNER_PAUSED')
        review=w.continuity.review_activation()
        changed=copy.deepcopy(review);changed['cards'][0]['operations']=[]
        with self.assertRaises(BridgeError):w.continuity.activate(changed,'synthetic-owner')
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

    def test_owner_running_version_is_not_automatically_main(self):
        manager=OwnerExpo(self.bridge)
        doc={'port':8089,'workspace':'synthetic','sha':'a'*40,'host':'100.64.0.1','state':'verified'}
        with patch.object(manager,'load',return_value=doc),patch.object(manager,'git',return_value=doc['sha']) as git,patch('owner_expo.urllib.request.urlopen',side_effect=OSError):
            s=manager.status()
            self.assertEqual(s['sha'],'a'*40)
            self.assertEqual(git.call_args.args[1:],('rev-parse','HEAD'))
        self.assertFalse(self.bridge.factory.wheel.enabled())
