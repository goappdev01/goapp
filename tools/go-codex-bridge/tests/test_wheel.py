"""The bare Git remote and Trello transport in these tests are disposable."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import time
import unittest
from unittest.mock import patch

import test_bridge as fixtures
from factory import BOARD, QUEUE, CHECK, NAMES, OWNER, INSTALL_CARDS
from puente import Bridge, BridgeError
from wheel_effects import WheelPublication, WheelEffects


TWO_STEPS = [
    "En «Reservas», abre la cita de prueba. Debe aparecer «Confirmar reserva».",
    "Pulsa «Cambiar hora». Debe abrirse el selector de horarios de esa cita.",
]
FIVE_STEPS = TWO_STEPS + [
    "Elige una franja disponible. La hora elegida debe aparecer seleccionada.",
    "Pulsa «Volver». La ficha debe mostrar la nueva hora y el mismo servicio.",
    "Cierra la ficha. Debe quedar visible el listado «Reservas».",
]
REAL_BATCH_IDS = (
    "6adf69637e874512e9bf216c",
    "6ae24a8eabdebf0d4b4f1910",
    "6ae29ecabe997961cb2afb79",
    "6ae2a09e067abd6d0ca70ed6",
    "6ae29ecd9c36cf72f5f8e389",
)
DIAGNOSTIC_TEXT = "Trabaja exclusivamente en modo inspección.\n- No modificar archivos.\n- No hacer commits ni publicaciones."


class WheelTests(unittest.TestCase):
    tearDown = fixtures.BridgeTests.tearDown

    def setUp(self):
        fixtures.BridgeTests.setUp(self)
        self.root = self.home/"sandbox"
        self.bare = self.home/"remote.git"
        self.files = ["artifacts/go-app-mobile/one.ts","artifacts/go-app-mobile/two.ts"]
        subprocess.run(["git","init","--bare",str(self.bare)],capture_output=True,check=True)
        self.git("init","-b","codex/test")
        self.git("config","user.name","Synthetic")
        self.git("config","user.email","test@example.invalid")
        self.git("config","core.autocrlf","false")
        for fname in self.files:
            path = self.root/fname
            path.parent.mkdir(exist_ok=True,parents=True)
            path.write_bytes(b"export default 0;\n")
        self.git("add",".")
        self.git("commit","-m","synthetic base")
        self.git("remote","add","origin",str(self.bare))
        self.git("push","origin","HEAD:main")
        self.cards = {}
        for i, digit in enumerate("ab",1):
            cid = digit*24
            self.cards[cid] = {"id":cid,"idBoard":BOARD,"idList":QUEUE,"name":f"A4 synthetic {digit}",
                               "shortLink":digit*8,"closed":False,"pos":i*1024,"desc":"","dateLastActivity":"initial",
                               "comments":[{"id":str(i)*24,"text":"Cambiar el archivo de prueba "+digit,"creatorId":OWNER}]}
        self.card_files = dict(zip(self.cards,self.files))
        self.changes=[]
        self.runs=[]
        self.prompts=[]
        self.lose_response=False
        self.lose_publication=False
        self.codex_state="available"
        self.codex_identity="synthetic-codex-account"
        self.configure(self.bridge)

    def git(self,*args):
        return subprocess.check_output(["git","-C",str(self.root),*args],text=True,stderr=subprocess.PIPE).strip()

    def configure(self,b):
        b.config["agents"]["4"]["sandbox"]="workspace-write"
        b.api=self.api
        b.read_card=lambda url,**kw:self.snapshot(url)
        b.owner_confirmation=lambda act,payload:self.prompts.append(act) is None
        b.git_state=lambda root,check_main=False: {"git":True,"head":self.git("rev-parse","HEAD"),
            "tracked_dirty":bool(self.git("status","--porcelain")),
            "origin_main":self.git("ls-remote","origin","refs/heads/main").split()[0]}
        b.run_codex=lambda payload:self.synthetic_codex(b,payload)
        b.codex_quota=lambda:({"state":self.codex_state},self.codex_identity)
        launch=b.launch
        b.launch=lambda payload,approval:launch(payload,approval,background=False)
        b.factory._verify_metro=lambda sha,base,workspace,**kwargs: {"sha":sha,"checked_sources":2,"api":"fixture"}
        return b

    def api(self,path,params=None,method="GET",body=None,**kwargs):
        if path=="/1/members/me":return {"id":OWNER}
        if path.endswith("/lists"):return [{"id":k,"name":v} for k,v in NAMES.items()]
        if path=="/1/lists/"+QUEUE+"/cards":return [copy.deepcopy(c) for c in self.cards.values() if c["idList"]==QUEUE]
        if path=="/1/lists/"+CHECK+"/cards":return [copy.deepcopy(c) for c in self.cards.values() if c["idList"]==CHECK]
        if path.startswith("/1/actions/"):
            cid,text=next((c["id"],m["text"]) for c in self.cards.values() for m in c["comments"] if m["id"]==path.split("/")[-1])
            return {"data":{"card":{"id":cid},"text":text}}
        cid=path.split("/")[3]
        card=self.cards[cid]
        if method=="POST":
            self.changes.append((cid,"C"))
            comment={"id":hashlib.sha256((cid+":resultado").encode()).hexdigest()[:24],
                     "creatorId":OWNER,"text":body["text"]}
            card["comments"].append(comment)
            if self.lose_response:
                self.lose_response=False
                raise BridgeError("NETWORK_UNCERTAIN","Respuesta perdida")
            return comment
        if method=="PUT":
            self.changes.append((cid,"D"))
            card["idList"]=body["idList"]
            return copy.deepcopy(card)
        if path.endswith("/actions"):
            return [{"id":"9"*24,"type":"createCard","date":"2026-01-01","idMemberCreator":OWNER,"data":{"list":{"id":QUEUE}}}]
        return copy.deepcopy(card)

    def snapshot(self,url):
        card=copy.deepcopy(next(c for c in self.cards.values() if c["shortLink"]==url.split("/")[-1]))
        comments=card.pop("comments")
        return {"data":{"card":card,"comments":comments,"verification":{"stable_during_read":True,"pagination_exhausted":True}}}

    def synthetic_codex(self,b,payload):
        job=b.job(payload["job"])
        cid=job["data"]["source"]["card_id"]
        self.runs.append(cid)
        folder=b.home/"ejecuciones"/job["id"]
        folder.mkdir(exist_ok=True)
        if job["data"]["instruction"]==DIAGNOSTIC_TEXT:
            self.assertEqual(payload["sandbox"],"read-only")
            command, observed = "rg conversation", "conversation adapter found"
            report = {"working":"El adaptador de reservas está definido.",
                      "inactive":"El chat general requiere pruebas entre sesiones.",
                      "missing":"Falta verificar el envío entre dos cuentas.",
                      "changes":"Reutilizar el adaptador de transporte comprobado.",
                      "checks":[{"command":command,"observed":observed}]}
            item = {"type":"command_execution","status":"completed","exit_code":0,
                    "command":command,"aggregated_output":observed}
            (folder/"eventos.jsonl").write_text(json.dumps({"type":"item.completed","item":item})+"\n",encoding="utf-8")
            b.finish_job(job["id"],"completed",{"exit_code":0,"turn_completed":True,"file_change_events":0,
                "response":"GO_FACTORY_EVIDENCE: "+json.dumps({"validation":FIVE_STEPS})+
                           "\nGO_FACTORY_DIAGNOSIS: "+json.dumps(report)})
            return
        self.assertEqual(payload["sandbox"],"workspace-write")
        path=self.root/self.card_files[cid]
        path.write_bytes(b"export default 1;\n")
        lines = FIVE_STEPS if self.card_files[cid]==self.files[1] else TWO_STEPS
        state="awaiting_validation" if lines==FIVE_STEPS else "completed"
        b.finish_job(job["id"],state,{"exit_code":0,"failed_commands":1 if state=="awaiting_validation" else 0,
            "response":"GO_FACTORY_EVIDENCE: "+json.dumps({"validation":lines})})

    def decisions(self):
        rows=self.bridge.factory.wheel.review()["cards"]
        return [dict(card_id=c["card_id"],binding=c["binding"],allowed_files=[] if c.get("work_kind")=="diagnosis" else [self.files[i]],
                     test_files=[] if c.get("work_kind")=="diagnosis" else ["tests/sample.test.mjs"],backend_required=False,
                     operations=list("ACD" if c.get("work_kind")=="diagnosis" else "ABCD"),
                     expires_at=time.time()+3600,depends_on=[]) for i,c in enumerate(rows) if c["eligible"]]

    def test_two_consecutive_cycles_restart_and_lost_comment_reply(self):
        decisions=self.decisions()
        decisions[1]["depends_on"]=[decisions[0]["card_id"]]
        wheel=self.bridge.factory.wheel
        wheel.approve(decisions)
        wheel.toggle(True)
        self.exercise_cycles(tuple(self.cards), expected_pause=None)

    def exercise_cycles(self, ids, *, expected_pause, diagnosis_ids=()):
        wheel = self.bridge.factory.wheel
        self.lose_response=True
        self.lose_publication=True
        original=WheelPublication.git_command
        pushes=[]
        lose_next_read=False
        def git(operation,workspace,*args):
            nonlocal lose_next_read
            if args[:2]==("remote","get-url"):return "https://github.com/goappdev01/goapp.git\n"
            if args[:1]==("ls-remote",) and lose_next_read:
                lose_next_read=False
                raise BridgeError("REMOTE_MAIN_UNAVAILABLE","Synthetic lost push receipt")
            result=original(operation,workspace,*args)
            if args[:1]==("push",):
                pushes.append(args)
                if self.lose_publication:
                    self.lose_publication=False
                    lose_next_read=True
            return result
        def check(effect,row,grant,workspace):
            self.assertEqual((workspace/grant["allowed_files"][0]).read_text(),"export default 1;\n")
            return [{"check":"synthetic assertion","passed":True}]
        restarted=False
        paused_between_cards=False
        with patch.object(WheelPublication,"git_command",git),patch.object(WheelEffects,"_dependencies"),patch.object(WheelEffects,"_tests",check):
            for _ in range(len(ids)*8):
                tick=wheel.tick()
                self.assertFalse(tick.get("blocked") or tick.get("paused"),str(tick))
                if len(self.changes)==1 and not restarted:
                    restored=Bridge(self.home,self.home/"private",fixtures.TestProtector(),actor=self.bridge.actor)
                    restored.config["protected_card_ids"]=self.bridge.config["protected_card_ids"]
                    self.bridge=self.configure(restored)
                    wheel=self.bridge.factory.wheel
                    restarted=True
                if diagnosis_ids and tick.get("closed")==ids[0] and not paused_between_cards:
                    wheel.toggle(False)
                    self.assertEqual(wheel.tick(),{"enabled":False})
                    self.assertEqual(self.runs,[ids[0]])
                    wheel.toggle(True)
                    paused_between_cards=True
                if len(wheel.status()["grants"])==len(ids) and all(g["state"]=="closed" for g in wheel.status()["grants"]):
                    break
        self.assertTrue(restarted)
        self.assertEqual(self.prompts,["wheel-batch"])
        self.assertEqual(self.runs,list(ids))
        self.assertEqual(self.changes,[(cid,op) for cid in ids for op in "CD"])
        self.assertTrue(all(g["state"]=="closed" for g in wheel.status()["grants"]))
        for index,cid in enumerate(ids):
            card=self.cards[cid]
            steps=FIVE_STEPS if index==1 else TWO_STEPS
            self.assertEqual(card["idList"], CHECK)
            self.assertEqual(len(card["comments"]), 2)
            self.assertEqual(card["desc"], "")
            guide = "\n".join(f"{i}. {step}" for i, step in enumerate(steps, 1))
            text = card["comments"][1]["text"]
            if cid in diagnosis_ids:
                self.assertIn("Cambios mínimos propuestos",text)
                self.assertIn(guide,text)
                self.assertNotIn("Publicación técnica correcta",text)
                grant=next(g for g in wheel.status()["grants"] if g["card_id"]==cid)
                self.assertEqual(grant["stages"][1]["receipt"]["publication"],"not_applicable")
                with self.bridge.db() as db:
                    self.assertIsNone(db.execute(
                        "SELECT approval_id FROM wheel_stages JOIN wheel_grants USING(grant_id) WHERE card_id=? AND letter='B'",(cid,)).fetchone()[0])
            else:
                self.assertIn(guide + "\n\nPublicación técnica correcta.",text)
        self.assertEqual(self.git("rev-list","--count","HEAD"),str(len(ids)-len(diagnosis_ids)+1))
        self.assertEqual(len(pushes),len(ids)-len(diagnosis_ids))
        self.assertEqual(self.git("ls-remote","origin","refs/heads/main").split()[0],self.git("rev-parse","HEAD"))
        if expected_pause:
            self.assertFalse(wheel.enabled())
            self.assertEqual(wheel.status()["reason"],expected_pause)
        if diagnosis_ids:
            self.assertTrue(paused_between_cards)

    def five_card_queue(self):
        self.bridge.config["protected_card_ids"]=[]
        self.cards.clear()
        for i,cid in enumerate(REAL_BATCH_IDS,1):
            self.cards[cid] = {"id":cid,"idBoard":BOARD,"idList":QUEUE,"name":f"A4 synthetic {i}",
                               "shortLink":cid[-8:],"closed":False,"pos":i*1024,"desc":"","dateLastActivity":"initial",
                               "comments":[{"id":str(i)*24,"text":f"Cambiar el archivo sintético {i}","creatorId":OWNER}]}
        self.files += [f"artifacts/go-app-mobile/{i}.ts" for i in range(3,6)]
        self.card_files = dict(zip(self.cards,self.files))
        for i in (6,7):
            cid = str(i)*24
            self.cards[cid] = {**self.cards[REAL_BATCH_IDS[-1]],"id":cid,"shortLink":cid[-8:],"idList":"v2",
                               "name":f"A4 synthetic V2 {i}","pos":i*1024}

    def test_five_frozen_cycles_stop_before_a_new_sixth_card(self):
        self.five_card_queue()
        self.cards[REAL_BATCH_IDS[1]]["comments"][0]["text"]=DIAGNOSTIC_TEXT
        wheel=self.bridge.factory.wheel
        wheel.pause("CREDIT_LIMIT")
        batch=wheel.prepare_frozen_batch(list(REAL_BATCH_IDS))
        self.assertEqual([item["card_id"] for item in batch["cards"]],list(REAL_BATCH_IDS))
        self.assertEqual(batch["state"],"prepared")
        self.assertFalse(wheel.status()["grants"] or self.prompts or wheel.enabled())
        with self.assertRaises(BridgeError):wheel.toggle(True)
        with self.assertRaises(BridgeError):wheel.approve(self.decisions())
        decisions=self.decisions()
        with self.assertRaises(BridgeError):wheel.approve(decisions[::-1],start_frozen_batch=True)
        with self.assertRaises(BridgeError):wheel.approve(decisions[:-1],start_frozen_batch=True)
        old=self.cards[REAL_BATCH_IDS[0]]["comments"][0]
        old["text"]+="; instrucción cambiada"
        with self.assertRaises(BridgeError):wheel.approve(self.decisions(),start_frozen_batch=True)
        old["text"]=old["text"].split(";")[0]
        self.assertFalse(self.prompts or wheel.enabled())
        self.codex_state="limited"
        with self.assertRaisesRegex(BridgeError,"cuota"):wheel.approve(decisions,start_frozen_batch=True)
        self.assertFalse(self.prompts or wheel.enabled())
        self.codex_state="available"
        wheel.approve(decisions,start_frozen_batch=True)
        self.assertIsNone(wheel.status()["reason"])
        extra = "8"*24
        self.cards[extra] = {**self.cards["7"*24],"id":extra,"shortLink":extra[-8:],"idList":QUEUE,"pos":8192}
        self.exercise_cycles(REAL_BATCH_IDS,expected_pause="OWNER_FROZEN_BATCH_COMPLETE",diagnosis_ids=(REAL_BATCH_IDS[1],))
        self.assertEqual(self.cards[extra]["idList"],QUEUE)
        self.assertEqual([self.cards[str(i)*24]["idList"] for i in (6,7)],["v2","v2"])

    def test_four_card_draft_replaces_five_without_releasing_a_grant(self):
        self.five_card_queue()
        wheel=self.bridge.factory.wheel
        original=wheel.prepare_frozen_batch(list(REAL_BATCH_IDS))
        removed=REAL_BATCH_IDS[3]
        self.cards[removed]["idList"]="v2"
        ids=[card for card in REAL_BATCH_IDS if card!=removed]
        with self.assertRaises(BridgeError):
            wheel.prepare_frozen_batch(ids[::-1])
        prepared=wheel.prepare_frozen_batch(ids)
        self.assertNotEqual(prepared["id"],original["id"])
        self.assertEqual([card["card_id"] for card in prepared["cards"]],ids)
        self.assertEqual(prepared["state"],"prepared")
        self.assertFalse(wheel.status()["grants"] or self.prompts or wheel.enabled())

    def test_frozen_batch_keeps_reference_protected_and_diagnosis_read_only(self):
        self.five_card_queue()
        self.bridge.config["protected_card_ids"]=[REAL_BATCH_IDS[3]]
        self.cards[REAL_BATCH_IDS[1]]["comments"][0]["text"]=DIAGNOSTIC_TEXT
        wheel=self.bridge.factory.wheel
        batch=wheel.prepare_frozen_batch(list(REAL_BATCH_IDS))
        self.assertEqual([item["blocker"] for item in batch["cards"]],
                         [None,None,None,"REFERENCE_READ_ONLY",None])
        self.assertEqual(batch["cards"][1]["work_kind"],"diagnosis")
        self.assertEqual(wheel.prepare_frozen_batch(list(REAL_BATCH_IDS))["id"],batch["id"])
        decisions=[{"card_id":cid} for cid in REAL_BATCH_IDS]
        with self.assertRaises(BridgeError) as error:
            wheel.approve(decisions,start_frozen_batch=True)
        self.assertEqual(error.exception.code,"WHEEL_BATCH_BLOCKED")
        self.assertFalse(wheel.status()["grants"] or self.prompts or self.changes or self.runs)

    def test_frozen_batch_rechecks_session_quota_and_latest_instruction(self):
        self.five_card_queue()
        wheel=self.bridge.factory.wheel
        wheel.prepare_frozen_batch(list(REAL_BATCH_IDS))
        wheel.approve(self.decisions(),start_frozen_batch=True)
        wheel.toggle(False)
        account=self.codex_identity
        self.codex_identity="different-synthetic-account"
        with self.assertRaises(BridgeError) as error:
            wheel.toggle(True)
        self.assertEqual(error.exception.code,"WHEEL_CODEX_SESSION_CHANGED")
        self.codex_identity=None
        with self.assertRaises(BridgeError) as error:
            wheel.toggle(True)
        self.assertEqual(error.exception.code,"WHEEL_CODEX_AUTH")
        self.codex_identity=account
        self.codex_state="available"
        wheel.toggle(True)
        self.codex_state="limited"
        self.assertEqual(wheel.tick()["paused"],"WHEEL_CODEX_QUOTA")
        self.assertFalse(self.runs or self.changes)
        self.codex_state="available"
        wheel.toggle(True)
        self.cards[REAL_BATCH_IDS[0]]["comments"][0]["text"]+="; actualización que requiere nueva autorización"
        outcome=wheel.tick()
        self.assertEqual(outcome["card_blocked"],REAL_BATCH_IDS[0])
        self.assertEqual(outcome["reason"],"WHEEL_SUBJECT_CHANGED")
        self.assertTrue(wheel.enabled())
        self.assertFalse(self.runs or self.changes)

    def test_frozen_batch_continues_to_independent_card_after_diagnosis_error(self):
        self.five_card_queue()
        self.cards[REAL_BATCH_IDS[1]]["comments"][0]["text"]=DIAGNOSTIC_TEXT
        bridge=self.bridge
        wheel=bridge.factory.wheel
        wheel.prepare_frozen_batch(list(REAL_BATCH_IDS))
        wheel.approve(self.decisions(),start_frozen_batch=True)
        original=WheelPublication.git_command
        def git(pub,workspace,*args):
            if args[:2]==("remote","get-url"):return "https://github.com/goappdev01/goapp.git\n"
            return original(pub,workspace,*args)
        def execute(payload):
            cid=bridge.job(payload["job"])["data"]["source"]["card_id"]
            if cid==REAL_BATCH_IDS[0]:
                self.synthetic_codex(bridge,payload)
            else:
                self.runs.append(cid)
                bridge.finish_job(payload["job"],"completed",{"exit_code":0,"turn_completed":True,
                                                               "file_change_events":0,"response":"Informe sin comprobaciones."})
        bridge.run_codex=execute
        with patch.object(WheelPublication,"git_command",git),patch.object(WheelEffects,"_dependencies"),patch.object(WheelEffects,"_tests",return_value=[{"passed":True}]):
            for _ in range(40):
                wheel.tick()
                with self.bridge.db() as db:
                    diagnosis=db.execute("SELECT state FROM wheel_grants WHERE card_id=? ORDER BY attempt DESC LIMIT 1",
                                         (REAL_BATCH_IDS[1],)).fetchone()
                if diagnosis and diagnosis["state"]=="blocked":break
        self.assertTrue(wheel.enabled())
        self.assertEqual(diagnosis["state"],"blocked")
        self.assertEqual(wheel._trial_limit()["expected"],REAL_BATCH_IDS[2])
        self.assertEqual(self.runs,list(REAL_BATCH_IDS[:2]))
        self.assertEqual(self.changes,[(REAL_BATCH_IDS[0],op) for op in "CD"])

    def test_guide_requires_navigation_action_and_expected_result(self):
        effect = WheelEffects(self.bridge.factory)
        cases = (
            (["Pulsa el botón. Debe abrirse el selector."], False),
            (["Abre GO y pulsa el botón. Debe abrirse el selector."], False),
            (["En «Reservas», abre la ficha.", "Pulsa «Cambiar hora»."], False),
            (["En «Reservas» debe aparecer la hora."], False),
            (TWO_STEPS + ["Envía una credencial."], False),
            (TWO_STEPS, True),
            (FIVE_STEPS, True),
            (["Desde «Reservas», abre la cita. Debe aparecer el nombre del servicio."], True),
            (["Abre GO y entra en «Reservas». Debe aparecer la cita de prueba."], True),
        )
        for steps, accepted in cases:
            with self.subTest(steps=steps):
                job = {"id": "synthetic", "result": {"response":
                       "GO_FACTORY_EVIDENCE: " + json.dumps({"validation": steps})}}
                if accepted:
                    self.assertEqual(effect._validation(job), steps)
                else:
                    with self.assertRaises(BridgeError) as error:
                        effect._validation(job)
                    self.assertEqual(error.exception.code, "WHEEL_GUIDE_INVALID")

    def test_absent_or_declined_authorization_pauses_at_head(self):
        wheel=self.bridge.factory.wheel;wheel.toggle(True)
        self.assertEqual(wheel.tick()["paused"],"WHEEL_HEAD_PERMISSION_REQUIRED")
        ds=self.decisions();self.bridge.owner_confirmation=lambda *args:False
        with self.assertRaises(BridgeError):wheel.approve(ds)
        self.assertFalse(self.runs or self.changes)
        self.assertFalse(wheel.enabled())

    def test_tampered_grant_pauses_before_launch(self):
        wheel=self.bridge.factory.wheel
        wheel.approve(self.decisions())
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_grants SET terms=replace(terms,'one.ts','x.ts')")
        wheel.toggle(True)
        self.assertEqual(wheel.tick()["paused"],"WHEEL_GRANT_INTEGRITY")
        self.assertFalse(wheel.enabled() or self.runs)

    def test_self_installation_excluded_and_unknown_attempt_requires_review(self):
        f=self.bridge.factory
        for cid in INSTALL_CARDS:
            self.cards[cid]={**self.cards["a"*24],"id":cid,"pos":len(self.cards)*1024+1}
        with self.bridge.db() as db:
            db.execute("INSERT INTO factory_attempts(card_id,attempt,title,instruction_sha,state) VALUES(?,1,'prior','prior','running')",("a"*24,))
        reviewed=f.wheel.review()["cards"]
        self.assertEqual([r["card_id"] for r in reviewed],["a"*24,"b"*24])
        self.assertFalse(reviewed[0]["eligible"])
        self.assertTrue(reviewed[1]["eligible"])
        self.assertEqual(f._row("a"*24,1)["state"],"running")

    def test_expired_dependencies_and_pause(self):
        wheel=self.bridge.factory.wheel
        ds=self.decisions()
        ds[0]["depends_on"]=["b"*24]
        ds[1]["expires_at"]=time.time()+2
        wheel.approve(ds);wheel.toggle(True)
        with patch("wheel_queue.time.time",return_value=time.time()+5):
            self.assertEqual(wheel.tick()["paused"],"WHEEL_HEAD_DEPENDENCY_BLOCKED")
        wheel.toggle(False)
        self.assertFalse(wheel.tick()["enabled"] or self.runs)

    def test_credit_limit_suspends_and_does_not_repeat_the_previous_attempt(self):
        b=self.bridge; wheel=b.factory.wheel; wheel.approve(self.decisions());wheel.toggle(True)
        started=[]
        def quota(payload):
            started.append(payload["job"])
            (b.home/"ejecuciones"/payload["job"]).mkdir(exist_ok=True)
            b.finish_job(payload["job"],"failed",{"credit_limited":True,"quota_reset_at":time.time()+60})
        b.run_codex=quota
        with patch.object(WheelEffects,"_dependencies"):
            wheel.tick()
            self.assertEqual(wheel.tick()["blocked"],"CREDIT_LIMIT")
            self.assertFalse(wheel.enabled())
            wheel.resume_after_quota()
            self.assertFalse(wheel.enabled())
            with patch("wheel_queue.time.time",return_value=time.time()+120):
                wheel.resume_after_quota()
                self.assertFalse(wheel.enabled())
                wheel.tick()
        self.assertEqual(len(started),1)
        self.assertEqual(len(set(started)),1)

    def test_hosted_dependency_cannot_be_waived_and_infrastructure_needs_specific_review(self):
        wheel=self.bridge.factory.wheel
        self.cards["a"*24]["name"]="A4 Soporte real conectado"
        ds=self.decisions()
        with self.assertRaises(BridgeError) as err:wheel.approve(ds)
        self.assertEqual(err.exception.code,"WHEEL_HOSTED_PROOF_REQUIRED")
        ds[0]["backend_required"]=True
        ds[1]["allowed_files"]=["railway.json"]
        with self.assertRaises(BridgeError) as err:wheel.approve(ds)
        self.assertEqual(err.exception.code,"WHEEL_INFRASTRUCTURE_SCOPE")
        self.assertFalse(self.prompts)

    def test_private_pnpm_import_only_replaces_worktree_hard_link(self):
        import os
        shared=self.home/"package-cache"; shared.write_bytes(b"synthetic package")
        folder=self.root/"node_modules"/".pnpm"/"pkg@1"/"node_modules"/"pkg"
        folder.mkdir(parents=True)
        file=folder/"index.js";os.link(shared,file)
        effects=WheelEffects(self.bridge.factory)
        self.assertEqual(effects._private_import(self.root),1)
        self.assertEqual(shared.read_bytes(),file.read_bytes())
        self.assertFalse(os.path.samefile(shared,file))

    def test_a_known_failed_patch_is_preserved_and_queue_stops_at_head(self):
        wheel=self.bridge.factory.wheel
        wheel.approve(self.decisions());wheel.toggle(True)
        original_run=self.bridge.run_codex
        def fail_first(payload):
            original_run(payload)
            job=self.bridge.job(payload["job"])
            if job["data"]["source"]["card_id"].startswith("a"):
                self.bridge.finish_job(job["id"],"failed",job["result"])
        self.bridge.run_codex=fail_first
        original_git=WheelPublication.git_command
        def git(pub,workspace,*args):
            if args[:2]==("remote","get-url"):
                return "https://github.com/goappdev01/goapp.git\n"
            return original_git(pub,workspace,*args)
        with patch.object(WheelPublication,"git_command",git),patch.object(WheelEffects,"_dependencies"),patch.object(WheelEffects,"_tests",return_value=[{"passed":True}]):
            for _ in range(15):
                wheel.tick()
                if any(g["state"]=="closed" for g in wheel.status()["grants"]):
                    break
        row=self.bridge.factory._row("a"*24,1)
        review=json.loads(row["detail"])["local_review"]
        self.assertFalse(review["published"])
        self.assertTrue(self.git("show",review["checkpoint_sha"]+":"+self.files[0]).endswith("1;"))
        self.assertTrue((self.home/"ejecuciones"/row["job_id"]/"revision-local"/"cambio.patch").is_file())
        self.assertTrue(self.git("show","HEAD:"+self.files[0]).endswith("0;"))
        self.assertEqual(self.changes,[])
        self.assertEqual(self.cards["a"*24]["idList"],QUEUE)
        self.assertEqual(self.git("status","--porcelain"),"")

    def test_missing_hosted_verification_stops_entire_queue(self):
        wheel=self.bridge.factory.wheel
        decisions=self.decisions()
        decisions[0]["backend_required"]=True
        wheel.approve(decisions);wheel.toggle(True)
        outcome=wheel.tick()
        self.assertEqual(outcome["blocked"],"WHEEL_HOSTED_PROOF_REQUIRED")
        self.assertFalse(self.runs)
        self.assertEqual(self.git("status","--porcelain"),"")
        with patch.object(WheelEffects,"_dependencies"):
            self.assertEqual(wheel.tick(),{"enabled":False})
        self.assertEqual(self.runs,[])

    def test_state_changes_or_uncertain_execution_cannot_grant_another_launch(self):
        b=self.bridge;wheel=b.factory.wheel;decisions=self.decisions();wheel.approve(decisions);wheel.toggle(True)
        with patch.object(WheelEffects,"_dependencies",side_effect=BridgeError("WHEEL_DEPENDENCIES","unavailable")):
            self.assertEqual(wheel.tick()["blocked"],"WHEEL_DEPENDENCIES")
        self.assertEqual(wheel.status()["grants"][-1]["state"],"blocked")
        self.assertFalse(self.runs)
        with self.assertRaises(BridgeError):
            wheel.approve(decisions[:1])

    def test_changed_and_new_tests_join_initial_regressions_without_duplicates(self):
        base="artifacts/go-app-mobile/tests/"
        names=[base+"initial.test.mjs",base+"changed.test.mjs",base+"added.test.mjs"]
        for name in names[:2]:
            path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text("// original\n")
        self.git("add",".");self.git("commit","-m","synthetic tests")
        for name in names[1:]:
            (self.root/name).write_text("// modified or new\n")
        outside=self.root/"other/tests/outside.test.mjs"
        outside.parent.mkdir(parents=True);outside.write_text("// not approved\n")
        grant={"allowed_files":["artifacts/go-app-mobile/"],"test_files":[names[0],names[1]]}
        selected=WheelEffects(self.bridge.factory)._test_files(grant,self.root)
        self.assertEqual(selected,["tests/initial.test.mjs","tests/changed.test.mjs","tests/added.test.mjs"])

    def test_missing_initial_regressions_require_actual_new_tests_before_publication(self):
        effect=WheelEffects(self.bridge.factory)
        grant={"allowed_files":["artifacts/go-app-mobile/"],"test_files":[]}
        with self.assertRaises(BridgeError) as missing:
            effect._test_files(grant,self.root)
        self.assertEqual(missing.exception.code,"WHEEL_TEST_MISSING")
        path=self.root/"artifacts/go-app-mobile/tests/new.test.mjs"
        path.parent.mkdir(parents=True);path.write_text("// synthetic regression\n")
        self.assertEqual(effect._test_files(grant,self.root),["tests/new.test.mjs"])

    def test_review_suggests_service_and_landing_regressions_without_technical_entry(self):
        from wheel_queue import Wheel
        tracked=["artifacts/go-app-mobile/tests/booking-services.test.mjs",
                 "artifacts/go-app-mobile/tests/booking-assistant.test.mjs",
                 "artifacts/go-app-mobile/tests/action-completion.test.mjs"]
        service=Wheel._suggestions(tracked,"A4 Optimizar pantalla Servicios","Cambiar disposición visual")
        self.assertEqual(service["suggested_files"],["artifacts/go-app-mobile/"])
        self.assertEqual(service["suggested_test_files"],tracked[:2])
        landing=Wheel._suggestions(tracked,"A4 Landing","Cambiar disposición visual")
        self.assertEqual(landing["suggested_test_files"],tracked[2:])



    def test_preselected_later_card_never_jumps_unapproved_head(self):
        w=self.bridge.factory.wheel;w.approve(self.decisions()[1:]);w.toggle(True)
        self.assertEqual(w.tick()["card_id"],"a"*24)
        self.assertFalse(self.runs or self.changes)
        self.assertFalse(w.enabled())

    def test_incompatible_first_card_blocks_without_filtering_it_out(self):
        self.cards["a"*24]["name"]="A2 incompatible"
        review=self.bridge.factory.wheel.review()["cards"]
        self.assertEqual(review[0]["card_id"],"a"*24)
        self.assertFalse(review[0]["eligible"])
        self.bridge.factory.wheel.toggle(True)
        self.assertEqual(self.bridge.factory.wheel.tick()["card_id"],"a"*24)
        self.assertFalse(self.runs)

    def test_reorder_during_active_execution_finishes_only_that_card(self):
        w=self.bridge.factory.wheel;w.approve(self.decisions());w.toggle(True)
        original_git=WheelPublication.git_command
        def git(pub,workspace,*args):
            if args[:2]==("remote","get-url"):return "https://github.com/goappdev01/goapp.git\n"
            return original_git(pub,workspace,*args)
        with patch.object(WheelPublication,"git_command",git),patch.object(WheelEffects,"_dependencies"),patch.object(WheelEffects,"_tests",return_value=[{"passed":True}]):
            self.assertTrue(w.tick()["again"])
            self.cards["b"*24]["pos"]=512
            old_api=self.bridge.api
            def ordered(path,*args,**kwargs):
                result=old_api(path,*args,**kwargs)
                return sorted(result,key=lambda c:c["pos"]) if path=="/1/lists/"+QUEUE+"/cards" else result
            self.bridge.api=ordered
            # Reordering cannot change the original instruction or its destinations.
            for _ in range(10):
                result=w.tick()
                self.assertFalse(result.get("blocked") or result.get("paused"),str(result))
                if result.get("closed"):break
            self.assertEqual(self.runs,["a"*24])
            # The next grant's changed position requires fresh review, not an old selection.
            self.assertEqual(w.tick()["blocked"],"WHEEL_SUBJECT_CHANGED")
            self.assertEqual(self.runs,["a"*24])

    def test_credit_checkpoint_keeps_session_changes_and_unconsumed_permissions(self):
        b=self.bridge;w=b.factory.wheel;w.approve(self.decisions());w.toggle(True)
        def quota(payload):
            self.runs.append("a"*24)
            (self.root/self.files[0]).write_text("export default 2;\n")
            with b.db() as db:db.execute("UPDATE jobs SET session_id='exact-session' WHERE id=?",(payload["job"],))
            b.finish_job(payload["job"],"failed",{"credit_limited":True,"quota_reset_at":time.time()-1})
        b.run_codex=quota
        with patch.object(WheelEffects,"_dependencies"):
            w.tick();self.assertEqual(w.tick()["blocked"],"CREDIT_LIMIT")
        self.assertTrue((self.root/self.files[0]).read_text().endswith("2;\n"))
        with b.db() as db:
            snap=json.loads(db.execute("SELECT snapshot FROM wheel_checkpoints WHERE phase='CREDIT_LIMIT'").fetchone()[0])
            self.assertEqual(snap["job"]["session_id"],"exact-session")
            self.assertEqual(snap["authorization"]["operations"],list("ABCD"))
            self.assertEqual([s["letter"] for s in snap["stages"]],["A"])
        w.resume_after_quota();self.assertFalse(w.enabled())
        restarted=Bridge(self.home,self.home/"private",fixtures.TestProtector(),actor=self.bridge.actor);self.configure(restarted)
        self.assertFalse(restarted.factory.wheel.enabled())
        self.assertEqual(restarted.factory.wheel.tick(),{"enabled":False})
        self.assertEqual(self.runs,["a"*24]);self.assertFalse(self.changes)

    def trial(self):
        w=self.bridge.factory.wheel;ds=self.decisions();w.approve(ds)
        with self.bridge.db() as db:
            rows=db.execute("SELECT * FROM wheel_grants ORDER BY rowid").fetchall()
            cards=[{k:json.loads(r["terms"])[k] for k in ["card_id","grant_id","instruction_sha"]} for r in rows]
            doc={"maximum_cards":2,"actor":self.bridge.actor,"cards":cards,"expires_at":time.time()+3600}
            db.execute("INSERT INTO wheel_trials VALUES(?,?,?,?,?)",("two-only",json.dumps(doc),self.bridge.sign(doc),"active","now"))
        return w

    def test_two_cycle_trial_pauses_immediately_and_cannot_start_third(self):
        w=self.trial();w.toggle(True)
        original=WheelPublication.git_command
        def git(pub,workspace,*args):
            if args[:2]==("remote","get-url"):return "https://github.com/goappdev01/goapp.git\n"
            return original(pub,workspace,*args)
        with patch.object(WheelPublication,"git_command",git),patch.object(WheelEffects,"_dependencies"),patch.object(WheelEffects,"_tests",return_value=[{"passed":True}]):
            for _ in range(20):
                result=w.tick();self.assertFalse(result.get("blocked"),str(result))
                if not w.enabled():break
        self.assertEqual(self.runs,["a"*24,"b"*24]);self.assertEqual(len(self.changes),4)
        self.assertFalse(w.enabled());w.toggle(True)
        self.assertEqual(w.tick()["paused"],"OWNER_TWO_CARD_TRIAL_COMPLETE")
        self.assertEqual(self.runs,["a"*24,"b"*24])

    def test_two_cycle_trial_refuses_different_head(self):
        w=self.trial();self.cards["a"*24]["pos"]=2500
        self.cards={k:v for k,v in sorted(self.cards.items(),key=lambda pair:pair[1]["pos"])}
        w.toggle(True);self.assertEqual(w.tick()["paused"],"WHEEL_TRIAL_ORDER_CHANGED")
        self.assertFalse(self.runs or self.changes)

    def test_recovered_tests_are_reused_only_for_signed_identical_source_and_events(self):
        import hashlib
        job=self.bridge.prepare_text("Synthetic recovered instruction","4")
        data=self.bridge.job(job["id"])["data"]
        folder=self.home/"ejecuciones"/job["id"];(folder/"revision-local").mkdir(parents=True)
        events=folder/"eventos.jsonl";events.write_text('{"type":"synthetic"}\n')
        checks=[{"check":label,"passed":True} for label in ["test","typescript","ios"]]
        doc={"job":job["id"],"instruction_sha":data["instruction_sha256"],"base_sha":self.git("rev-parse","HEAD"),
             "patch_sha256":self.bridge.factory.digest(self.git("diff","--binary","HEAD")),
             "events_sha256":hashlib.sha256(events.read_bytes()).hexdigest(),
             "files":{self.files[0]:hashlib.sha256((self.root/self.files[0]).read_bytes()).hexdigest()},
             "tests":checks,"validation":TWO_STEPS}
        record={"receipt":doc,"mac":self.bridge.sign(doc)};receipt=folder/"revision-local/validacion-recuperada.json"
        receipt.write_text(json.dumps(record));effect=WheelEffects(self.bridge.factory)
        row={"job_id":job["id"],"before_sha":doc["base_sha"]};grant={"instruction_sha":doc["instruction_sha"]}
        with patch.object(effect,"_test_files",side_effect=AssertionError("Tests must not run again")):
            self.assertEqual(effect._tests(row,grant,self.root),checks)
        self.assertEqual(effect._validation(self.bridge.job(job["id"])),doc["validation"])
        (self.root/self.files[0]).write_text("changed")
        with self.assertRaises(BridgeError) as changed:effect._tests(row,grant,self.root)
        self.assertEqual(changed.exception.code,"WHEEL_RECOVERY_CHANGED")
        record["receipt"]["tests"][0]["passed"]=False;receipt.write_text(json.dumps(record))
        with self.assertRaises(BridgeError) as forged:effect._tests(row,grant,self.root)
        self.assertEqual(forged.exception.code,"WHEEL_RECOVERY_INVALID")
