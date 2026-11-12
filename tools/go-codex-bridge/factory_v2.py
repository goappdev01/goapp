"""Opt-in continuity for an explicitly activated, bounded owner-reviewed batch."""
import hashlib
import hmac
import json
import re
import time
import uuid

from puente import process_alive


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
            CREATE TABLE IF NOT EXISTS factory_v2_renewals(
                id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, grant_id TEXT NOT NULL,
                old_terms TEXT NOT NULL, old_signature TEXT NOT NULL,
                new_terms TEXT NOT NULL, new_signature TEXT NOT NULL,
                principal TEXT NOT NULL, approved_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS factory_live_rebindings(
                id TEXT PRIMARY KEY, consent_sha256 TEXT NOT NULL, grant_id TEXT NOT NULL,
                old_terms_sha256 TEXT NOT NULL, new_terms_sha256 TEXT NOT NULL,
                previous_identity_sha256 TEXT NOT NULL, current_identity_sha256 TEXT NOT NULL,
                principal TEXT NOT NULL, approved_at TEXT NOT NULL);
            """)

    def active(self):
        if self.w.live_policy():
            return True
        with self.b.db() as db:
            batch=self.w._latest_trial(db)
            return bool(batch and batch[0]["state"]=="active" and batch[1].get("policy")=="independent-v2")

    def verify_activation(self,identifier,document,db=None):
        if db is None:
            with self.b.db() as connection:
                return self.verify_activation(identifier,document,connection)
        row=db.execute("SELECT * FROM factory_v2_activation WHERE batch_id=?",(identifier,)).fetchone()
        if not row:
            self.w.fail("WHEEL_V2_ACTIVATION_REQUIRED","El lote requiere una activación expresa para la continuidad V2.")
        doc=json.loads(row["document"])
        if (not hmac.compare_digest(self.b.sign(doc),row["signature"])
                or doc["batch_sha"]!=self.f.digest(self.f.canonical(document)) or doc["actor"]!=self.b.actor):
            self.w.fail("WHEEL_GRANT_INTEGRITY","La activación V2 no coincide con el lote.")
        fallbacks=doc.get("dependency_fallbacks",[])
        if (not isinstance(fallbacks,list) or len(fallbacks)>100 or any(
                not isinstance(edge,dict) or set(edge)!={"dependency_card_id","dependent_card_id","reason"}
                or not re.fullmatch(r"[0-9a-f]{24}",str(edge.get("dependency_card_id","")))
                or not re.fullmatch(r"[0-9a-f]{24}",str(edge.get("dependent_card_id","")))
                or edge["dependency_card_id"]==edge["dependent_card_id"]
                or edge.get("reason")!="La instrucción del dependiente permite continuar con su alternativa explícita si el diagnóstico queda bloqueado."
                for edge in fallbacks)):
            self.w.fail("WHEEL_GRANT_INTEGRITY","La alternativa de dependencia no se puede verificar.")
        return doc

    def dependency_fallbacks(self, grants, instructions):
        """Derive only the explicitly worded fallback edges for this frozen batch."""
        fallback_reason="La instrucción del dependiente permite continuar con su alternativa explícita si el diagnóstico queda bloqueado."
        fallbacks=[]
        for card_id,(state,grant) in grants.items():
            instruction=instructions.get(card_id,"")
            for dependency_id in grant.get("depends_on",[]):
                dependency=grants.get(dependency_id)
                expected=grant.get("dependency_versions",{}).get(dependency_id,{})
                if (dependency and dependency[0]!="closed"
                        and dependency[1].get("work_kind")=="diagnosis"
                        and dependency[1].get("attempt")==expected.get("attempt")
                        and dependency[1].get("instruction_sha")==expected.get("instruction_sha")
                        and self._allows_blocked_diagnosis_fallback(instruction)):
                    fallbacks.append({"dependency_card_id":dependency_id,"dependent_card_id":card_id,
                                      "reason":fallback_reason})
        return fallbacks

    @staticmethod
    def _allows_blocked_diagnosis_fallback(instruction):
        text=" ".join(str(instruction or "").casefold().split())
        return all(fragment in text for fragment in (
            "si ese resultado no está disponible",
            "implementar la ergonomía reutilizable",
            "acciones de servidor pendientes",
            "sin inventar éxito",
        ))

    def review_activation(self):
        self.f._identity()
        self.f._lists()
        current_identity=self.w._require_codex_identity()
        with self.b.db() as db:
            batch=self.w._latest_trial(db)
            if not batch or batch[0]["state"]!="active":
                self.w.fail("WHEEL_V2_BATCH_REQUIRED","Revisa y autoriza antes un lote concreto de tarjetas.")
            row,doc=batch
            grants=[]
            grant_by_card={}
            renewals=[]
            for item in doc["cards"]:
                saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(item["grant_id"],)).fetchone()
                grant=self.w._verified(saved)
                grant_by_card[grant["card_id"]]=(saved,grant)
                renewable=saved["state"] in ("ready","working") or self.published_recovery(db,saved,grant)
                if renewable and time.time()>=grant["expires_at"]:
                    completed={stage["letter"] for stage in db.execute(
                        "SELECT letter FROM wheel_stages WHERE grant_id=? AND state='verified'",(grant["grant_id"],))}
                    pending=[letter for letter in "ABCD" if letter not in completed]
                    renewals.append({"card_id":grant["card_id"],"grant_id":grant["grant_id"],
                                     "operations":pending,"prior_expiry":grant["expires_at"]})
                grants.append({"card_id":grant["card_id"],"title":grant["title"],"state":saved["state"],
                               "operations":grant["operations"],"expires_at":grant["expires_at"],
                               "depends_on":grant["depends_on"],"allowed_files":grant["allowed_files"],
                               "test_files":grant["test_files"],"backend_required":grant["backend_required"]})
        pending=[item for item in doc["cards"] if grant_by_card[item["card_id"]][0]["state"]!="closed"]
        live_cards={card["id"]:card for card in self.w._available(self.f._cards())}
        expected=[item["card_id"] for item in pending]
        if [card_id for card_id in live_cards if card_id in expected]!=expected:
            self.w.fail("WHEEL_BATCH_ORDER_CHANGED","La cola actual ya no conserva el orden autorizado del lote.")
        if list(live_cards)[:len(expected)]!=expected:
            self.w.fail("WHEEL_BATCH_ORDER_CHANGED","Hay tarjetas anteriores al lote autorizado en la cola actual.")
        instructions={}
        for item in pending:
            card_id=item["card_id"]
            subject,spec=self.w._subject(live_cards[card_id],review=True)
            saved,grant=grant_by_card[card_id]
            if (subject["binding"]!=grant["binding"] or grant["instruction_sha"]!=item["instruction_sha"]
                    or grant["position"]!=live_cards[card_id]["pos"]):
                self.w.fail("WHEEL_SUBJECT_CHANGED","Una tarjeta del lote cambió desde su revisión.")
            instructions[card_id]=(grant,spec["instruction"])
        fallbacks=self.dependency_fallbacks(
            {card_id:(saved["state"],grant) for card_id,(saved,grant) in grant_by_card.items()},
            {card_id:instruction for card_id,(_,instruction) in instructions.items()})
        fallback_pairs={(edge["dependency_card_id"],edge["dependent_card_id"]) for edge in fallbacks}
        available={item["card_id"] for item in grants if item["state"]=="closed"}
        plan=[]
        for item in grants:
            state=item["state"]
            if state=="closed":
                action,why="completed","Terminada y verificada; no se repetirá."
            elif state=="blocked" and self._published_recovery_review(*grant_by_card[item["card_id"]]):
                action,why="run","El cambio ya está publicado. Solo se conciliará Metro y se continuará desde el recibo pendiente, sin repetir Codex ni el push."
                available.add(item["card_id"])
            elif state=="blocked":
                action,why="skip","Bloqueada; no se repetirá automáticamente."
            elif state=="ready" and all(dep in available or (dep,item["card_id"]) in fallback_pairs for dep in item["depends_on"]):
                action,why="run",("Continuará mediante la alternativa expresa de su instrucción."
                    if any((dep,item["card_id"]) in fallback_pairs for dep in item["depends_on"])
                    else "Pendiente autorizada; se ejecutará en su orden.")
                available.add(item["card_id"])
            else:
                action,why="wait","Depende de un trabajo pendiente o requiere revisión."
            plan.append({"card_id":item["card_id"],"title":item["title"],"action":action,"reason":why})
        return {"batch_id":row["id"],"batch_sha":self.f.digest(self.f.canonical(doc)),
                "cards":grants,"policy":"independent-v2","maximum_cards":doc["maximum_cards"],
                "dependency_fallbacks":fallbacks,"plan":plan,
                "renewals":renewals,"renewal_hours":24 if renewals else 0,
                "account_changed":current_identity!=doc.get("codex_identity"),
                "current_codex_identity_sha256":self.f.digest(current_identity)}

    def _published_recovery_review(self,row,grant):
        with self.b.db() as db:
            return self.published_recovery(db,row,grant)

    def reconcile_published_stale(self):
        """Verify a prior push and Metro while paused; never run Codex or repeat a push."""
        from wheel_effects import WheelEffects
        repaired=[]
        with self.f.lock:
            with self.b.db() as db:
                if (db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0]
                        or db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                        or db.execute("SELECT 1 FROM operations WHERE state='sending'").fetchone()):
                    return repaired
                candidates=[]
                for saved in db.execute("SELECT * FROM wheel_grants WHERE state='blocked' AND reason='FACTORY_METRO_OUTDATED'"):
                    grant=self.w._verified(saved)
                    if self.published_recovery(db,saved,grant):
                        candidates.append(grant)
            for grant in candidates:
                attempt=self.f._row(grant["card_id"],grant["attempt"])
                try:
                    workspace=self.b.workspace("4")[0]
                    effects=WheelEffects(self.f)
                    if not effects._reconcile_publication(attempt,grant,workspace):
                        continue
                    receipt=effects._published(attempt,workspace,sync=False)
                except (self.f.Error,OSError,KeyError,TypeError) as error:
                    self.b.audit("wheel_published_metro_still_pending",{
                        "grant":grant["grant_id"],"code":getattr(error,"code","VERIFICATION_UNAVAILABLE")})
                    continue
                with self.b.db() as db:
                    db.execute("BEGIN IMMEDIATE")
                    saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(grant["grant_id"],)).fetchone()
                    stage=db.execute("SELECT state FROM wheel_stages WHERE grant_id=? AND letter='B'",(grant["grant_id"],)).fetchone()
                    if (not saved or saved["state"]!="blocked" or saved["reason"]!="FACTORY_METRO_OUTDATED"
                            or self.w._verified(saved)!=grant or not stage or stage["state"]!="claimed"):
                        continue
                    db.execute("UPDATE wheel_stages SET state='verified',finished=?,receipt=? WHERE grant_id=? AND letter='B' AND state='claimed'",
                               (self.f.utc(),self.f.canonical(receipt),grant["grant_id"]))
                    db.execute("UPDATE wheel_grants SET state='ready',reason=NULL WHERE grant_id=?",(grant["grant_id"],))
                    db.execute("UPDATE factory_attempts SET state='await_review' WHERE card_id=? AND attempt=? AND state='blocked'",
                               (grant["card_id"],grant["attempt"]))
                    if (db.execute("SELECT reason FROM wheel_control WHERE id=1").fetchone()[0]=="FACTORY_METRO_OUTDATED"
                            and not db.execute("SELECT 1 FROM wheel_grants WHERE state='blocked' AND reason='FACTORY_METRO_OUTDATED'").fetchone()):
                        db.execute("UPDATE wheel_control SET reason='OWNER_PAUSED',retry_after=0 WHERE id=1")
                    self.b.audit("wheel_published_metro_reconciled",{"grant":grant["grant_id"],
                        "main_sha":receipt["main_sha"],"served_sha":receipt["served_sha"],
                        "repeated_cli":False,"repeated_push":False},db)
                    repaired.append(grant["card_id"])
        return repaired

    def reconcile_unreleased_comment(self):
        """Rearm only a comment claimed before any authorization or Trello effect."""
        from wheel_effects import WheelEffects
        recovered=[]
        with self.f.lock:
            with self.b.db() as db:
                if (db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0]
                        or db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                        or db.execute("SELECT 1 FROM operations WHERE state='sending'").fetchone()):
                    return recovered
                candidates=[]
                for saved in db.execute("SELECT * FROM wheel_grants WHERE state='uncertain' AND reason='WHEEL_PRESERVATION_PUBLICATION'"):
                    grant=self.w._verified(saved)
                    stages={row["letter"]:row for row in db.execute(
                        "SELECT letter,state,approval_id,receipt FROM wheel_stages WHERE grant_id=?",(grant["grant_id"],))}
                    if (set(stages)=={"A","B","C"} and stages["A"]["state"]=="verified"
                            and stages["B"]["state"]=="verified" and stages["C"]["state"]=="claimed"
                            and not stages["C"]["approval_id"] and stages["B"]["receipt"]):
                        candidates.append((grant,json.loads(stages["B"]["receipt"])))
            for grant,receipt in candidates:
                attempt=self.f._row(grant["card_id"],grant["attempt"])
                effects=WheelEffects(self.f)
                if effects._operations(attempt,"comment"):
                    continue
                try:
                    effects._published_head_valid(self.b.workspace("4")[0],receipt)
                except (self.f.Error,OSError,KeyError,TypeError) as error:
                    self.b.audit("wheel_comment_recovery_pending",{"grant":grant["grant_id"],
                        "code":getattr(error,"code","VERIFICATION_UNAVAILABLE")})
                    continue
                with self.b.db() as db:
                    db.execute("BEGIN IMMEDIATE")
                    saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(grant["grant_id"],)).fetchone()
                    if (not saved or saved["state"]!="uncertain" or saved["reason"]!="WHEEL_PRESERVATION_PUBLICATION"
                            or self.w._verified(saved)!=grant):
                        continue
                    removed=db.execute("DELETE FROM wheel_stages WHERE grant_id=? AND letter='C' AND state='claimed' AND approval_id IS NULL",
                                       (grant["grant_id"],)).rowcount
                    if removed!=1:
                        continue
                    db.execute("UPDATE wheel_grants SET state='ready',reason=NULL WHERE grant_id=?",(grant["grant_id"],))
                    if db.execute("SELECT reason FROM wheel_control WHERE id=1").fetchone()[0]=="WHEEL_PRESERVATION_PUBLICATION":
                        db.execute("UPDATE wheel_control SET reason='OWNER_PAUSED',retry_after=0 WHERE id=1")
                    self.b.audit("wheel_unreleased_comment_rearmed",{"grant":grant["grant_id"],
                        "repeated_cli":False,"repeated_push":False,"trello_write":False},db)
                    recovered.append(grant["card_id"])
        return recovered

    def activate(self,review,principal):
        with self.f.lock:
            # A second confirmation for the same active batch is a read-only success.
            # It must never mint a new activation or relaunch work.
            with self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                row,doc=self.w._latest_trial(db)
                enabled=bool(db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0])
                if enabled:
                    if review.get("batch_id")!=row["id"] or doc.get("policy")!="independent-v2":
                        self.w.fail("WHEEL_SUBJECT_CHANGED","La fábrica activa corresponde a otro lote; no se inició nada nuevo.")
                    self.verify_activation(row["id"],doc,db)
                    return {"enabled":True,"batch_id":row["id"],"idempotent":True,
                            "message":"La fábrica ya estaba activada; se conservó la ejecución existente."}
            if self.review_activation()!=review:
                self.w.fail("WHEEL_SUBJECT_CHANGED","El lote cambió desde que se mostró la autorización.")
            with self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                row,doc=self.w._latest_trial(db)
                # Recheck under the serialized write transaction in case another
                # request activated while the fresh Trello review was being read.
                if db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0]:
                    if review.get("batch_id")!=row["id"] or doc.get("policy")!="independent-v2":
                        self.w.fail("WHEEL_SUBJECT_CHANGED","La fábrica activa corresponde a otro lote; no se inició nada nuevo.")
                    self.verify_activation(row["id"],doc,db)
                    return {"enabled":True,"batch_id":row["id"],"idempotent":True,
                            "message":"La fábrica ya estaba activada; se conservó la ejecución existente."}
                identity=self.w._require_codex_identity()
                if self.f.digest(identity)!=review["current_codex_identity_sha256"]:
                    self.w.fail("WHEEL_CODEX_SESSION_CHANGED","La cuenta Codex cambió durante la confirmación.")
                if db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone():
                    self.w.fail("WHEEL_WORKSPACE_BUSY","Espera al trabajo en curso.")
                changed=identity!=doc.get("codex_identity")
                if not any(item["action"]=="run" for item in review["plan"]):
                    self.w.fail("WHEEL_NO_ELIGIBLE_CARD","No hay tarjetas pendientes que puedan continuar con este lote.")
                renewal_by_card={item["card_id"]:item for item in review["renewals"]}
                expiry=time.time()+review["renewal_hours"]*3600 if renewal_by_card else None
                actionable_expiries=[]
                for item in doc["cards"]:
                    saved=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(item["grant_id"],)).fetchone()
                    grant=self.w._verified(saved)
                    if saved["state"] not in ("ready","working") and not self.published_recovery(db,saved,grant):
                        continue
                    renewal=renewal_by_card.get(grant["card_id"])
                    if renewal:
                        completed={stage["letter"] for stage in db.execute(
                            "SELECT letter FROM wheel_stages WHERE grant_id=? AND state='verified'",(grant["grant_id"],))}
                        pending=[letter for letter in "ABCD" if letter not in completed]
                        if (renewal!={"card_id":grant["card_id"],"grant_id":grant["grant_id"],
                                     "operations":pending,"prior_expiry":grant["expires_at"]}
                                or not pending or time.time()<grant["expires_at"]):
                            self.w.fail("WHEEL_SUBJECT_CHANGED","Las operaciones pendientes cambiaron desde la revisión.")
                        updated={**grant,"expires_at":expiry,"reauthorized_letters":pending,
                                 "reauthorized_at":self.f.utc(),"reauthorized_by":principal,
                                 "original_expires_at":grant.get("original_expires_at",grant["expires_at"])}
                        new_terms=self.f.canonical(updated)
                        new_signature=self.b.sign(updated)
                        db.execute("INSERT INTO factory_v2_renewals VALUES(?,?,?,?,?,?,?,?,?)",
                                   (uuid.uuid4().hex,row["id"],grant["grant_id"],saved["terms"],saved["signature"],
                                    new_terms,new_signature,principal,self.f.utc()))
                        db.execute("UPDATE wheel_grants SET terms=?,signature=? WHERE grant_id=?",
                                   (new_terms,new_signature,grant["grant_id"]))
                        self.b.audit("wheel_v2_owner_reauthorized",{"batch":row["id"],"grant":grant["grant_id"],
                            "operations":pending,"prior_terms_sha":self.f.digest(saved["terms"]),
                            "expires_at":expiry,"principal":principal},db)
                        actionable_expiries.append(expiry)
                    else:
                        if time.time()>=grant["expires_at"]:
                            self.w.fail("WHEEL_EXPIRY_INVALID","Una autorización pendiente ha caducado sin renovación.")
                        actionable_expiries.append(grant["expires_at"])
                if not actionable_expiries:
                    self.w.fail("WHEEL_NO_ELIGIBLE_CARD","No hay autorizaciones pendientes para continuar.")
                doc={**doc,"policy":"independent-v2","codex_identity":identity,
                     "expires_at":min(actionable_expiries)}
                activation={"batch_sha":self.f.digest(self.f.canonical(doc)),"actor":self.b.actor,
                            "principal":principal,"at":self.f.utc(),"codex_identity":identity,
                            "dependency_fallbacks":review.get("dependency_fallbacks",[])}
                db.execute("UPDATE wheel_trials SET document=?,signature=? WHERE id=?",
                           (self.f.canonical(doc),self.b.sign(doc),row["id"]))
                db.execute("INSERT OR REPLACE INTO factory_v2_activation VALUES(?,?,?)",
                           (row["id"],self.f.canonical(activation),self.b.sign(activation)))
                db.execute("UPDATE factory_control SET enabled=0 WHERE id=1")
                db.execute("UPDATE wheel_control SET enabled=1,reason=NULL,retry_after=0 WHERE id=1")
                if changed:
                    self.b.audit("wheel_owner_account_bound",{"batch":row["id"],"principal":principal,
                        "binding_review_sha":self.f.digest(self.f.canonical(review))},db)
                self.b.audit("wheel_v2_owner_activated",{"batch":row["id"],"principal":principal,
                    "cards":[item["card_id"] for item in doc["cards"]]},db)
        return {"enabled":True,"batch_id":row["id"],"idempotent":False,
                "message":"La fábrica quedó activada para el lote revisado."}

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

    def review_live_rebind(self):
        """Review an owner-approved identity change without starting or changing work."""
        self.f._identity()
        self.f._lists()
        current_identity=self.w._require_codex_identity()
        live=self.w.live_policy()
        if not live:
            self.w.fail('WHEEL_LIVE_QUEUE_REQUIRED','No hay una autorización continua activa que revisar.')
        if current_identity==live['codex_identity']:
            self.w.fail('WHEEL_CODEX_SESSION_MATCHED','La cuenta actual ya coincide con la autorización de la cola.')
        with self.b.db() as db:
            control=db.execute('SELECT enabled,reason FROM wheel_control WHERE id=1').fetchone()
            if control['enabled']:
                self.w.fail('WHEEL_PAUSE_REQUIRED','Pausa la fábrica antes de revisar el cambio de cuenta.')
            if control['reason']!='WHEEL_CODEX_SESSION_CHANGED':
                self.w.fail('WHEEL_REBIND_STATE','La cola no está detenida por un cambio de cuenta.')
            if (db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                    or db.execute("SELECT 1 FROM operations WHERE state='sending'").fetchone()
                    or db.execute("SELECT 1 FROM wheel_grants WHERE state='working'").fetchone()):
                self.w.fail('WHEEL_WORKSPACE_BUSY','Hay una ejecución o escritura pendiente de conciliar.')
            rows=list(db.execute("SELECT * FROM wheel_grants WHERE state IN ('ready','wait_permissions','credit_wait') ORDER BY rowid"))
            scoped=[]
            for saved in rows:
                grant=self.w._verified(saved)
                if grant.get('live_consent_sha256')!=live['consent_sha256']:
                    continue
                if grant.get('codex_identity_sha256',self.f.digest(live['codex_identity']))!=self.f.digest(live['codex_identity']):
                    self.w.fail('WHEEL_GRANT_INTEGRITY','Una autorización pendiente no coincide con la identidad anterior.')
                stages={row['letter']:row['state'] for row in db.execute(
                    'SELECT letter,state FROM wheel_stages WHERE grant_id=?',(grant['grant_id'],))}
                if saved['state'] in ('ready','wait_permissions') and stages:
                    self.w.fail('WHEEL_REBIND_UNCERTAIN','Una tarjeta tiene etapas previas y requiere conciliación específica.')
                pending=[letter for letter in grant['operations'] if stages.get(letter)!='verified']
                completed=sorted(letter for letter,state in stages.items() if state=='verified')
                item={'grant_id':grant['grant_id'],'card_id':grant['card_id'],'title':grant['title'],
                      'state':saved['state'],'completed':completed,
                      'operations':pending,'session_sha256':None,'checkpoint_id':None}
                if saved['state']=='credit_wait':
                    if stages!={'A':'verified'} or not pending:
                        self.w.fail('WHEEL_REBIND_UNCERTAIN','La sesión de Codex no tiene un checkpoint reanudable.')
                    item['completed']=[]
                    item['operations']=['A']+pending
                    attempt=db.execute('SELECT * FROM factory_attempts WHERE card_id=? AND attempt=?',
                                       (grant['card_id'],grant['attempt'])).fetchone()
                    job=db.execute('SELECT * FROM jobs WHERE id=?',(attempt['job_id'],)).fetchone() if attempt else None
                    checkpoint=db.execute("SELECT id,snapshot FROM wheel_checkpoints WHERE grant_id=? AND phase='CREDIT_LIMIT' ORDER BY id DESC LIMIT 1",
                                          (grant['grant_id'],)).fetchone()
                    if (not job or job['state']!='failed' or not job['session_id'] or process_alive(job['pid'])
                            or not json.loads(job['result'] or '{}').get('credit_limited')
                            or not checkpoint or attempt['state']!='limit_pause'):
                        self.w.fail('WHEEL_REBIND_UNCERTAIN','No se puede verificar la misma sesión y su checkpoint de cuota.')
                    checkpoint_doc=json.loads(checkpoint['snapshot'])
                    checkpoint_job=checkpoint_doc.get('job') or {}
                    if (checkpoint_job.get('id')!=job['id'] or checkpoint_job.get('session_id')!=job['session_id']
                            or checkpoint_doc.get('authorization',{}).get('grant_id')!=grant['grant_id']):
                        self.w.fail('WHEEL_REBIND_UNCERTAIN','El checkpoint no corresponde al trabajo y la sesión conservados.')
                    payload=json.loads(job['data'] or '{}')
                    source=payload.get('source') or {}
                    if (payload.get('agent')!='4' or payload.get('instruction_sha256')!=grant['instruction_sha']
                            or source.get('card_id')!=grant['card_id'] or attempt['job_id']!=job['id']):
                        self.w.fail('WHEEL_REBIND_UNCERTAIN','La sesión conservada no corresponde a la instrucción autorizada.')
                    item.update(session_sha256=self.f.digest(job['session_id']),checkpoint_id=checkpoint['id'])
                scoped.append(item)
            if sum(item['state']=='credit_wait' for item in scoped)>1:
                self.w.fail('WHEEL_REBIND_UNCERTAIN','Hay más de una sesión de cuota pendiente.')

        cards=list(self.w._available(self.f._cards()))
        card_by_id={card['id']:card for card in cards}
        for item in scoped:
            card=card_by_id.get(item['card_id'])
            if not card:
                item['outside_queue']=True
                continue
            subject,spec=self.w._subject(card,review=True)
            with self.b.db() as db:
                saved=db.execute('SELECT * FROM wheel_grants WHERE grant_id=?',(item['grant_id'],)).fetchone()
            grant=self.w._verified(saved)
            subject['position']=grant['position']
            subject.pop('binding',None)
            if (self.f.digest(self.f.canonical(subject))!=grant['binding']
                    or spec['instruction_sha']!=grant['instruction_sha']):
                self.w.fail('WHEEL_SUBJECT_CHANGED','La instrucción o los permisos cambiaron desde el checkpoint.')

        visible_queue=[{'card_id':card['id'],'title':card['name'],'position':card['pos']} for card in cards]
        fingerprint=self.f.digest(self.f.canonical([
            {'card':card,'comments':card.get('comments',[])} for card in cards]))
        return {'live_queue_rebind':True,'consent_sha256':live['consent_sha256'],
                'previous_identity_sha256':self.f.digest(live['codex_identity']),
                'current_identity_sha256':self.f.digest(current_identity),
                'queue_sha256':fingerprint,'queue':visible_queue,'pending':scoped,
                'scope_unchanged':True,'starts_new_task':False,
                'resume_exact_session':any(item['state']=='credit_wait' for item in scoped)}

    def rebind_live_queue(self,review,principal):
        """Rebind only after fresh owner review; resume the exact live task/queue once."""
        current=self.review_live_rebind()
        mutable=('queue_sha256','queue')
        if (not review.get('live_queue_rebind') or set(review)!=set(current)
                or any(review[key]!=current[key] for key in current if key not in mutable)):
            self.w.fail('WHEEL_SUBJECT_CHANGED','La cola, la cuenta o el checkpoint cambió desde la revisión.')
        review=current
        identity=self.w._require_codex_identity()
        if self.f.digest(identity)!=review['current_identity_sha256']:
            self.w.fail('WHEEL_CODEX_SESSION_CHANGED','La cuenta Codex cambió durante la confirmación.')
        with self.f.lock,self.b.db() as db:
            db.execute('BEGIN IMMEDIATE')
            control=db.execute('SELECT enabled,reason FROM wheel_control WHERE id=1').fetchone()
            live=self.w.live_policy(db)
            if (control['enabled'] or control['reason']!='WHEEL_CODEX_SESSION_CHANGED' or not live
                    or live['consent_sha256']!=review['consent_sha256']
                    or self.f.digest(live['codex_identity'])!=review['previous_identity_sha256']):
                self.w.fail('WHEEL_SUBJECT_CHANGED','La autorización continua cambió durante la revisión.')
            if (db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                    or db.execute("SELECT 1 FROM operations WHERE state='sending'").fetchone()
                    or db.execute("SELECT 1 FROM wheel_grants WHERE state='working'").fetchone()):
                self.w.fail('WHEEL_WORKSPACE_BUSY','Hay una ejecución o escritura pendiente de conciliar.')
            old_policy=db.execute('SELECT * FROM wheel_live_authorization WHERE id=1').fetchone()
            new_policy={**live,'codex_identity':identity,'identity_rebound_at':self.f.utc(),
                        'identity_rebound_by':self.b.sign({'tailnet_owner':principal})}
            changed_policy=db.execute('UPDATE wheel_live_authorization SET document=?,signature=? WHERE id=1 AND state=\'active\' AND signature=?',
                (self.f.canonical(new_policy),self.b.sign(new_policy),old_policy['signature'])).rowcount
            if changed_policy!=1:
                self.w.fail('WHEEL_SUBJECT_CHANGED','La autorización continua cambió durante la confirmación.')
            for item in review['pending']:
                saved=db.execute('SELECT * FROM wheel_grants WHERE grant_id=?',(item['grant_id'],)).fetchone()
                grant=self.w._verified(saved)
                if saved['state']!=item['state'] or grant.get('live_consent_sha256')!=review['consent_sha256']:
                    self.w.fail('WHEEL_SUBJECT_CHANGED','Una autorización pendiente cambió durante la confirmación.')
                updated={**grant,'codex_identity_sha256':self.f.digest(identity),
                         'identity_rebound_at':self.f.utc()}
                terms=self.f.canonical(updated);signature=self.b.sign(updated)
                old_sha=self.f.digest(saved['terms']);new_sha=self.f.digest(terms)
                db.execute('UPDATE wheel_grants SET terms=?,signature=? WHERE grant_id=?',
                           (terms,signature,grant['grant_id']))
                db.execute('INSERT INTO factory_live_rebindings VALUES(?,?,?,?,?,?,?,?,?)',
                    (uuid.uuid4().hex,review['consent_sha256'],grant['grant_id'],old_sha,new_sha,
                     review['previous_identity_sha256'],review['current_identity_sha256'],principal,self.f.utc()))
                self.b.audit('wheel_live_grant_rebound',{'consent_sha256':review['consent_sha256'],
                    'grant':grant['grant_id'],'old_terms_sha256':old_sha,'new_terms_sha256':new_sha,
                    'previous_identity_sha256':review['previous_identity_sha256'],
                    'current_identity_sha256':review['current_identity_sha256'],'principal':principal},db)
            self.b.audit('wheel_live_account_rebound',{'consent_sha256':review['consent_sha256'],
                'previous_identity_sha256':review['previous_identity_sha256'],
                'current_identity_sha256':review['current_identity_sha256'],
                'queue_sha256':review['queue_sha256'],'principal':principal,
                'same_session':review['resume_exact_session']},db)
            db.execute("UPDATE wheel_control SET enabled=0,reason=?,retry_after=0 WHERE id=1",
                       ('CREDIT_LIMIT' if review['resume_exact_session'] else None,))
        if review['resume_exact_session']:
            cards=list(self.w._available(self.f._cards()))
            credit=next(item for item in review['pending'] if item['state']=='credit_wait')
            if not cards or cards[0]['id']!=credit['card_id']:
                self.w.pause('OWNER_PAUSED')
                return {'bound':True,'enabled':False,'resumed':False,
                        'message':'Cuenta vinculada; el checkpoint espera su turno. Pulsa PLAY para continuar la cola.'}
            resumed=self.w.resume_after_quota()
            return {'bound':True,'enabled':self.w.enabled(),'resumed':resumed,
                    'message':('Cuenta vinculada y sesión conservada reanudada.' if resumed else
                               'Cuenta vinculada; la sesión se conserva y sigue pendiente de reanudación segura.')}
        result=self.w.toggle(True)
        return {'bound':True,'enabled':bool(result.get('enabled')),'resumed':False,
                'message':'Cuenta vinculada y cola autorizada reanudada.'}

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
        activation=self.verify_activation(trial["id"],doc)
        fallback_edges={(edge["dependency_card_id"],edge["dependent_card_id"])
                        for edge in activation.get("dependency_fallbacks",[])}
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
            published_recovery=self.published_recovery(db,row,grant)
            runtime=db.execute("SELECT retry_after FROM factory_card_runtime WHERE grant_id=?",(grant["grant_id"],)).fetchone()
            if row['state']=='working' and runtime and runtime[0]>time.time():
                # Keep the single workspace lease while a known pre-effect retry waits.
                return {'waiting':'RETRY_BACKOFF','again':False}
            if ((row["state"] not in ("working","ready") and not published_recovery)
                    or (runtime and runtime[0]>time.time())):
                continue
            explicit_fallback=False
            dependencies_ready=True
            for dep in grant["depends_on"]:
                version=grant["dependency_versions"][dep]
                if db.execute("SELECT 1 FROM wheel_grants WHERE card_id=? AND attempt=? AND state='closed'",
                              (dep,version["attempt"])).fetchone():
                    continue
                # Only the exact, signed activation edge can bypass a blocked, read-only
                # diagnosis, and only while that same authorized attempt remains blocked.
                if (dep,grant["card_id"]) in fallback_edges:
                    dependency_row=db.execute("SELECT * FROM wheel_grants WHERE card_id=? AND attempt=?",
                                              (dep,version["attempt"])).fetchone()
                    if dependency_row:
                        dependency=self.w._verified(dependency_row)
                        if (dependency_row["state"]=="blocked" and dependency.get("work_kind")=="diagnosis"
                                and dependency["attempt"]==version["attempt"]
                                and dependency["instruction_sha"]==version["instruction_sha"]):
                            explicit_fallback=True
                            continue
                dependencies_ready=False
                break
            if not dependencies_ready:
                continue
            skipped=[g["card_id"] for _,g in rows if g["card_id"]!=grant["card_id"] and g["position"]<grant["position"]]
            if skipped:
                self.b.audit("wheel_independent_selected",{"card":grant["card_id"],"skipped":skipped,
                    "reason":"Tarjetas previas bloqueadas, en espera o con dependencias pendientes.",
                    "explicit_diagnostic_fallback":explicit_fallback},db)
            return {"expected":grant["card_id"],"grant_id":grant["grant_id"],"codex_identity":doc["codex_identity"],
                    "independent":True,"explicit_diagnostic_fallback":explicit_fallback,
                    "published_recovery":published_recovery}
        return {"waiting":"NO_SAFE_ELIGIBLE_CARD","again":False}

    def select_open_queue(self,db,trial,doc,cards):
        """Use current Trello order; the signed batch binds identity, not queue length."""
        self.verify_activation(trial["id"],doc,db)
        working=db.execute("SELECT * FROM wheel_grants WHERE state='working'").fetchone()
        if working and working["card_id"] not in cards:
            final=db.execute("SELECT state FROM wheel_stages WHERE grant_id=? AND letter='D'",
                             (working["grant_id"],)).fetchone()
            if final and final["state"]=="verified":
                return {"expected":working["card_id"],"grant_id":working["grant_id"],
                        "codex_identity":doc["codex_identity"],"independent":True,
                        "post_move_close":True,"open_queue":True}
            return {"waiting":"WHEEL_WORKING_CARD_MISSING","again":False}
        ordered=([cards.get(working["card_id"])] if working else [])+list(cards.values())
        seen=set()
        for card in ordered:
            if not card or card["id"] in seen:
                continue
            seen.add(card["id"])
            row=db.execute("SELECT * FROM wheel_grants WHERE card_id=? ORDER BY attempt DESC LIMIT 1",
                           (card["id"],)).fetchone()
            if not row:
                continue
            grant=self.w._verified(row)
            if row["state"] not in ("working","ready","wait_permissions"):
                continue
            if self.w._expired(grant) or not self.w._operation_authorized(grant,"A"):
                continue
            runtime=db.execute("SELECT retry_after FROM factory_card_runtime WHERE grant_id=?",
                               (grant["grant_id"],)).fetchone()
            if runtime and runtime[0]>time.time():
                if row["state"]=="working":
                    return {"waiting":"RETRY_BACKOFF","again":False}
                continue
            if not self.w._dependencies_ready(db,grant,{"explicit_diagnostic_fallback":True,
                                                        "grant_id":grant["grant_id"]},cards):
                continue
            return {"expected":card["id"],"grant_id":grant["grant_id"],
                    "codex_identity":doc["codex_identity"],"independent":True,
                    "explicit_diagnostic_fallback":True,"open_queue":True}
        return {"waiting":"NO_AUTHORIZED_CARD","again":False,"open_queue":True}

    def published_recovery(self,db,row,grant):
        """Resume only a verified push whose Metro receipt was never recorded."""
        if row["state"]!="blocked" or row["reason"]!="FACTORY_METRO_OUTDATED":
            return False
        stages={stage["letter"]:stage for stage in db.execute(
            "SELECT letter,state,approval_id FROM wheel_stages WHERE grant_id=?",(grant["grant_id"],))}
        if (set(stages)!={"A","B"} or stages["A"]["state"]!="verified"
                or stages["B"]["state"]!="claimed" or not stages["B"]["approval_id"]):
            return False
        attempt=self.f._row(grant["card_id"],grant["attempt"])
        job=self.b.job(attempt["job_id"]) if attempt and attempt.get("job_id") else None
        if not job or job["state"]!="completed":
            return False
        from wheel_effects import WheelEffects
        publications=WheelEffects(self.f)._publications(job["id"])
        return len(publications)==1 and publications[0]["state"]=="verified"

    def card_error(self,grant,code):
        # Every failed implementation must first be preserved by the existing handler.
        with self.b.db() as db:
            published=bool(db.execute("SELECT 1 FROM wheel_stages WHERE grant_id=? AND letter='B' AND state='verified'",
                                      (grant["grant_id"],)).fetchone())
        if not published:
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
        if waiting and self.w.continuous() and all(
                self.w._operation_authorized(grant,letter) for letter in "CD") and not self.w._expired(grant):
            try:
                self._defer_question_to_trello(grant,request,job)
            except self.f.Error as error:
                self.w.pause(error.code)
                return {"paused":error.code,"card_id":grant["card_id"]}
        elif (self.w.live_policy() and not waiting and job and
              all(self.w._operation_authorized(grant,letter) for letter in "CD") and
              not self.w._expired(grant)):
            try:
                if job["state"]=="prepared":
                    self.b.finish_job(job["id"],"blocked",{"exit_code":None,
                        "response":"","classification_reason":code,
                        "programming_started":False})
                    job=self.b.job(job["id"])
                self._defer_question_to_trello(grant,{
                    "question":"La tarjeta requiere una comprobación o autorización adicional. "
                               "El trabajo conservado todavía no está publicado.",
                    "operation":code},job,allow_prepared=True)
            except self.f.Error as error:
                self.w.pause(error.code)
                return {"paused":error.code,"card_id":grant["card_id"]}
        self.w._transition(grant,"waiting_response" if waiting else "wait_permissions" if code=="WHEEL_PERMISSION_REQUIRED" else "blocked",code)
        return {"card_blocked":grant["card_id"],"reason":code,"again":True}

    def _defer_question_to_trello(self,grant,request,job,*,allow_prepared=False):
        """Use the card's C/D grants without claiming an unverified publication."""
        valid_states=("failed","blocked","needs_review","prepared") if allow_prepared else ("failed","blocked","needs_review")
        if not job or job["state"] not in valid_states:
            self.w.fail("WHEEL_QUESTION_JOB_INVALID","La ejecución no tiene un bloqueo verificable.")
        text=request["question"].strip()
        operation=request["operation"].strip()
        if (not text or re.search(r"@|https?://|(?:token|secret|password|contraseña)|\b\d{8,}\b",text+operation,re.I)):
            self.w.fail("WHEEL_QUESTION_PRIVATE","La pregunta requiere revisión privada antes de compartirla.")
        from wheel_effects import WheelEffects
        from factory import CHECK
        effects=WheelEffects(self.f)
        row=self.f._row(grant["card_id"],grant["attempt"])
        card,comments=effects._snapshot(grant["card_id"])
        if card["idList"]!=grant["origin"] or [c["id"] for c in self.f.original_comments(card["id"],comments)]!=grant["comment_ids"]:
            self.w.fail("WHEEL_TRELLO_CHANGED","La tarjeta cambió antes de registrar la pregunta.")
        comment=("Pendiente de respuesta del propietario. El trabajo parcial está conservado; "
                 "no hay publicación confirmada.\n\n1. Pregunta: "+text+"\n2. Operación pendiente: "+operation)
        for letter,action,data in (("C","comment",{"card_id":card["id"],"text":comment,"job_id":job["id"]}),
                                   ("D","move",{"card_id":card["id"],"list_id":CHECK,"pos":"top"})):
            with self.b.db() as db:
                if db.execute("SELECT 1 FROM wheel_stages WHERE grant_id=? AND letter=?",(grant["grant_id"],letter)).fetchone():
                    self.w.fail("WHEEL_STAGE_UNCERTAIN","La operación de Trello ya tiene un intento registrado.")
                db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started) VALUES(?,?,'claimed',?)",
                           (grant["grant_id"],letter,self.f.utc()))
            self.w.checkpoint(grant,"question-claimed:"+letter)
            record=self.b.prepare_write(action,data,inline_marker=True)
            self.f._update(row["card_id"],row["attempt"],**{
                "comment_operation" if letter=="C" else "move_operation":record["operation"]})
            permit=self.w._permit(grant,letter,row,"trello-write",record)
            outcome=self.b.write(record["operation"],permit)
            if outcome["state"]!="verified":
                self.w.fail("WHEEL_TRELLO_UNCERTAIN","La escritura en Trello no quedó confirmada.")
            operations=effects._operations(row,action)
            if len(operations)!=1:
                self.w.fail("WHEEL_STAGE_UNCERTAIN","La escritura no tiene una única operación.")
            self.w._record_receipt(grant,letter,effects._trello_receipt(letter,row,grant,operations[0]))

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
