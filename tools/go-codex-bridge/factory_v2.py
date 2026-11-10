"""Opt-in continuity for an explicitly activated, bounded owner-reviewed batch."""
import hashlib
import hmac
import json
import re
import time
import uuid


class Continuity:
    def __init__(self,wheel):
        self.w,self.b,self.f=wheel,wheel.b,wheel.f
        with self.b.db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS factory_v2_activation(
                batch_id TEXT PRIMARY KEY, document TEXT NOT NULL, signature TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS factory_card_runtime(
                grant_id TEXT PRIMARY KEY, phase TEXT, reason TEXT, retries INTEGER NOT NULL DEFAULT 0,
                retry_after REAL NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS factory_questions(
                id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, document TEXT NOT NULL, signature TEXT NOT NULL,
                state TEXT NOT NULL, answer TEXT, created TEXT NOT NULL, decided TEXT);
            """)

    def active(self):
        with self.b.db() as db:
            batch=self.w._latest_trial(db)
            return bool(batch and batch[0]["state"]=="active" and batch[1].get("policy")=="independent-v2")

    def verify_activation(self,identifier,document):
        with self.b.db() as db:
            row=db.execute("SELECT * FROM factory_v2_activation WHERE batch_id=?",(identifier,)).fetchone()
        if not row:
            self.w.fail("WHEEL_V2_ACTIVATION_REQUIRED","El lote requiere una activación expresa para la continuidad V2.")
        doc=json.loads(row["document"])
        if (not hmac.compare_digest(self.b.sign(doc),row["signature"])
                or doc["batch_sha"]!=self.f.digest(self.f.canonical(document)) or doc["actor"]!=self.b.actor):
            self.w.fail("WHEEL_GRANT_INTEGRITY","La activación V2 no coincide con el lote.")

    def review_activation(self):
        with self.b.db() as db:
            batch=self.w._latest_trial(db)
            if not batch or batch[0]["state"]!="active":
                self.w.fail("WHEEL_V2_BATCH_REQUIRED","Revisa y autoriza antes un lote concreto de tarjetas.")
            row,doc=batch
            grants=[]
            for item in doc["cards"]:
                saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(item["grant_id"],)).fetchone()
                grant=self.w._verified(saved)
                grants.append({"card_id":grant["card_id"],"title":grant["title"],"state":saved["state"],
                               "operations":grant["operations"],"expires_at":grant["expires_at"]})
        return {"batch_id":row["id"],"batch_sha":self.f.digest(self.f.canonical(doc)),
                "cards":grants,"policy":"independent-v2","maximum_cards":doc["maximum_cards"]}

    def activate(self,review,principal):
        if self.review_activation()!=review:
            self.w.fail("WHEEL_SUBJECT_CHANGED","El lote cambió desde que se mostró la autorización.")
        with self.f.lock:
            with self.b.db() as db:
                row,doc=self.w._latest_trial(db)
                identity=self.w._require_codex_identity(doc["codex_identity"])
                if time.time()>=doc["expires_at"]:
                    self.w.fail("WHEEL_EXPIRY_INVALID","Las autorizaciones del lote han caducado.")
                if db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone():
                    self.w.fail("WHEEL_WORKSPACE_BUSY","Espera al trabajo en curso.")
                doc={**doc,"policy":"independent-v2"}
                activation={"batch_sha":self.f.digest(self.f.canonical(doc)),"actor":self.b.actor,
                            "principal":principal,"at":self.f.utc(),"codex_identity":identity}
                db.execute("UPDATE wheel_trials SET document=?,signature=? WHERE id=?",
                           (self.f.canonical(doc),self.b.sign(doc),row["id"]))
                db.execute("INSERT OR REPLACE INTO factory_v2_activation VALUES(?,?,?)",
                           (row["id"],self.f.canonical(activation),self.b.sign(activation)))
                db.execute("UPDATE factory_control SET enabled=0 WHERE id=1")
                db.execute("UPDATE wheel_control SET enabled=1,reason=NULL,retry_after=0 WHERE id=1")
                self.b.audit("wheel_v2_owner_activated",{"batch":row["id"],"principal":principal,
                    "cards":[item["card_id"] for item in doc["cards"]]},db)
        return {"enabled":True,"batch_id":row["id"]}

    def rebind(self,review,principal):
        if self.w.enabled():
            self.w.fail('WHEEL_PAUSE_REQUIRED','Pausa la fábrica antes de vincular otra cuenta.')
        original={key:value for key,value in review.items() if key!='binding_only'}
        if not review.get('binding_only') or self.review_activation()!=original:
            self.w.fail('WHEEL_SUBJECT_CHANGED','El lote cambió desde la revisión.')
        with self.f.lock,self.b.db() as db:
            if db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone():
                self.w.fail('WHEEL_WORKSPACE_BUSY','Hay una ejecución pendiente de conciliación.')
            row,doc=self.w._latest_trial(db)
            identity=self.w._require_codex_identity()
            doc={**doc,'codex_identity':identity}
            db.execute('UPDATE wheel_trials SET document=?,signature=? WHERE id=?',
                       (self.f.canonical(doc),self.b.sign(doc),row['id']))
            db.execute('DELETE FROM factory_v2_activation WHERE batch_id=?',(row['id'],))
            self.b.audit('wheel_owner_account_bound',{'batch':row['id'],'principal':principal,'enabled':False},db)
        return {'bound':True,'enabled':False,'message':'Cuenta vinculada al lote revisado. La rueda sigue pausada y ningún intento se ha reiniciado.'}

    def review_recovery(self,card_id):
        if self.w.enabled():self.w.fail('WHEEL_PAUSE_REQUIRED','Pausa la fábrica para revisar la recuperación.')
        review=self.review_activation()
        if card_id not in [item['card_id'] for item in review['cards']]:
            self.w.fail('WHEEL_RECOVERY_SCOPE','La tarjeta no pertenece al lote.')
        with self.b.db() as db:
            row=db.execute('SELECT * FROM wheel_grants WHERE card_id=? ORDER BY attempt DESC LIMIT 1',(card_id,)).fetchone()
            grant=self.w._verified(row)
            attempt=self.f._row(card_id,grant['attempt'])
            job=self.b.job(attempt['job_id']) if attempt and attempt.get('job_id') else None
            phase=db.execute("SELECT state FROM wheel_stages WHERE grant_id=? AND letter='A'",(grant['grant_id'],)).fetchone()
            later=db.execute("SELECT 1 FROM wheel_stages WHERE grant_id=? AND letter!='A'",(grant['grant_id'],)).fetchone()
        if (grant.get('work_kind')!='diagnosis' or row['state']!='blocked' or not job
                or not self.diagnostic_ready(job) or not phase or phase[0]!='verified' or later):
            self.w.fail('WHEEL_RECOVERY_REVIEW','Solo se recupera aquí un diagnóstico terminado y sin efectos posteriores. Otros intentos requieren conciliación específica.')
        from pathlib import Path
        from wheel_effects import WheelEffects
        receipt,_=WheelEffects(self.f)._diagnosis(attempt,job,Path(grant['workspace']))
        return {'card_id':card_id,'grant_id':grant['grant_id'],'attempt':grant['attempt'],
                'job_id':job['id'],'phase':'B','receipt':receipt,'batch_sha':review['batch_sha'],
                'message':'Solo validar el informe conservado; no repetir Codex. La rueda permanecerá pausada.'}

    def recover(self,review,principal):
        with self.f.lock:
            if self.review_recovery(review['card_id'])!=review:
                self.w.fail('WHEEL_SUBJECT_CHANGED','Cambió el intento conservado desde la revisión.')
            with self.b.db() as db:
                db.execute("UPDATE wheel_grants SET state='ready',reason=NULL WHERE grant_id=? AND state='blocked'",(review['grant_id'],))
                self.b.audit('wheel_owner_diagnosis_recovery',{'review':review,'principal':principal,'enabled':False},db)
        return {'recovered':True,'phase':'B','enabled':False,'programming_replayed':False}

    def select_batch(self,db,trial,doc):
        self.verify_activation(trial["id"],doc)
        rows=[]
        for item in doc["cards"]:
            row=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(item["grant_id"],)).fetchone()
            grant=self.w._verified(row)
            if grant["binding"]!=item["binding"]:
                self.w.fail("WHEEL_GRANT_INTEGRITY","Cambió una autorización del lote.")
            if row["state"]=="closed":
                if db.execute("SELECT count(*) FROM wheel_stages WHERE grant_id=? AND state='verified'",
                              (grant["grant_id"],)).fetchone()[0]!=4:
                    self.w.fail("WHEEL_TRIAL_INVALID","Una tarjeta cerrada carece de confirmaciones.")
            else:
                rows.append((row,grant))
        if not rows:
            return None
        candidates=sorted(rows,key=lambda pair:pair[0]["state"]!="working")
        for row,grant in candidates:
            runtime=db.execute("SELECT retry_after FROM factory_card_runtime WHERE grant_id=?",(grant["grant_id"],)).fetchone()
            if row['state']=='working' and runtime and runtime[0]>time.time():
                # Keep the single workspace lease while a known pre-effect retry waits.
                return {'waiting':'RETRY_BACKOFF','again':False}
            if row["state"] not in ("working","ready") or runtime and runtime[0]>time.time():
                continue
            if any(not db.execute("SELECT 1 FROM wheel_grants WHERE card_id=? AND attempt=? AND state='closed'",
                                  (dep,grant["dependency_versions"][dep]["attempt"])).fetchone() for dep in grant["depends_on"]):
                continue
            skipped=[g["card_id"] for _,g in rows if g["card_id"]!=grant["card_id"] and g["position"]<grant["position"]]
            if skipped:
                self.b.audit("wheel_independent_selected",{"card":grant["card_id"],"skipped":skipped,
                    "reason":"Tarjetas previas bloqueadas, en espera o con dependencias pendientes."},db)
            return {"expected":grant["card_id"],"grant_id":grant["grant_id"],"codex_identity":doc["codex_identity"],"independent":True}
        return {"waiting":"NO_SAFE_ELIGIBLE_CARD","again":False}

    def card_error(self,grant,code):
        # Every failed implementation must first be preserved by the existing handler.
        state=self.b.git_state(grant["workspace"])
        if state.get("tracked_dirty") or not state.get("git"):
            self.w.pause("WHEEL_PRESERVATION_DIRTY")
            return {"paused":"WHEEL_PRESERVATION_DIRTY"}
        waiting=False
        attempt=self.f._row(grant["card_id"],grant["attempt"])
        job=self.b.job(attempt["job_id"]) if attempt and attempt.get("job_id") else None
        response=(job.get("result") or {}).get("response","") if job else ""
        records=re.findall(r"^GO_FACTORY_QUESTION:\s*(\{[^\n]*\})\s*$",response,re.M)
        if len(records)==1:
            try:
                request=json.loads(records[0])
                if (set(request)=={"kind","question","operation"} and isinstance(request["operation"],str)
                        and 1<=len(request["operation"])<=1000):
                    self.question(grant,request["kind"],request["question"],request["operation"])
                    waiting=True
            except (ValueError,KeyError,TypeError):
                pass
        self.w._transition(grant,"waiting_response" if waiting else "wait_permissions" if code=="WHEEL_PERMISSION_REQUIRED" else "blocked",code)
        return {"card_blocked":grant["card_id"],"reason":code,"again":True}

    def defer_retry(self,grant,phase,code):
        # A claimed mutation with an issued permit is reconciled elsewhere, never replayed here.
        if code not in ("HTTP_429","HTTP_500","HTTP_502","HTTP_503","HTTP_504"):
            return False
        with self.b.db() as db:
            row=db.execute("SELECT retries FROM factory_card_runtime WHERE grant_id=?",(grant["grant_id"],)).fetchone()
            count=(row[0] if row else 0)+1
            if count>3:
                return False
            db.execute("INSERT INTO factory_card_runtime VALUES(?,?,?,?,?) ON CONFLICT(grant_id) DO UPDATE SET phase=excluded.phase,"
                       "reason=excluded.reason,retries=excluded.retries,retry_after=excluded.retry_after",
                       (grant["grant_id"],phase,code,count,time.time()+15*count))
            db.execute("DELETE FROM wheel_stages WHERE grant_id=? AND letter=? AND state='claimed' AND approval_id IS NULL",
                       (grant["grant_id"],phase))
            self.b.audit("wheel_card_retry_deferred",{"grant":grant["grant_id"],"phase":phase,"attempt":count,"reason":code},db)
        return True

    @staticmethod
    def diagnostic_ready(job):
        result=job.get("result") or {}
        return (job["state"]=="blocked" and result.get("exit_code")==0 and result.get("turn_completed") is True
                and result.get("file_change_events")==0 and not result.get("policy_errors")
                and not result.get("credit_limited")
                and len(re.findall(r"^GO_FACTORY_DIAGNOSIS:\s*\{",result.get("response",""),re.M))==1)

    def question(self,grant,kind,question,operation):
        if kind not in ("answer","permission") or not isinstance(question,str) or not 1<=len(question)<=1800:
            self.w.fail("WHEEL_QUESTION_INVALID","La pregunta debe identificar una operación concreta.")
        document={"grant":grant["grant_id"],"card_id":grant["card_id"],"instruction_sha":grant["instruction_sha"],
                  "kind":kind,"question":question,"operation":operation,"actor":self.b.actor}
        with self.b.db() as db:
            existing=db.execute("SELECT id FROM factory_questions WHERE grant_id=? AND document=?",
                                (grant["grant_id"],self.f.canonical(document))).fetchone()
            if existing:return existing[0]
            identifier=uuid.uuid4().hex
            db.execute("INSERT INTO factory_questions VALUES(?,?,?,?, 'waiting',NULL,?,NULL)",
                       (identifier,grant["grant_id"],self.f.canonical(document),self.b.sign(document),self.f.utc()))
            self.b.audit("wheel_question_waiting",{"id":identifier,"card_id":grant["card_id"],"kind":kind},db)
        return identifier

    def answer(self,identifier,decision,text,principal):
        if decision not in ("allow_once","deny","respond") or not isinstance(text,str) or len(text)>3000:
            self.w.fail("WHEEL_ANSWER_INVALID","Selecciona una decisión concreta.")
        with self.f.lock,self.b.db() as db:
            row=db.execute("SELECT * FROM factory_questions WHERE id=?",(identifier,)).fetchone()
            if not row or row["state"]!="waiting":
                self.w.fail("WHEEL_ANSWER_ALREADY_USED","La pregunta ya tiene una decisión registrada.")
            doc=json.loads(row["document"])
            if not hmac.compare_digest(self.b.sign(doc),row["signature"]):
                self.w.fail("WHEEL_GRANT_INTEGRITY","La pregunta no coincide con su registro.")
            grant=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(row["grant_id"],)).fetchone()
            if self.w._verified(grant)["instruction_sha"]!=doc["instruction_sha"]:
                self.w.fail("WHEEL_SUBJECT_CHANGED","Cambió la instrucción de esta pregunta.")
            if decision=="respond" and not text.strip():
                self.w.fail("WHEEL_ANSWER_INVALID","Escribe una respuesta.")
            state="denied" if decision=="deny" else "review_required"
            answer={"decision":decision,"text":text.strip(),"principal":principal,"at":self.f.utc()}
            db.execute("UPDATE factory_questions SET state=?,answer=?,decided=? WHERE id=? AND state='waiting'",
                       (state,self.f.canonical(answer),answer["at"],identifier))
            self.b.audit("wheel_question_decided",{"id":identifier,"decision":decision,"principal":principal,
                         "automatic_cli_continuation":False},db)
        return {"state":state,"message":"Decisión conservada. Codex CLI requiere una continuación revisada de su sesión; el proceso terminado no admite respuestas en vivo."}
