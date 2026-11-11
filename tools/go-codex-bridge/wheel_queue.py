"""Continuous factory scheduling for explicitly preauthorized, individual Trello cards."""
import hmac
import json
import math
from pathlib import PurePosixPath, PureWindowsPath
import re
import subprocess
import time
import uuid

from factory import BOARD, QUEUE, CHECK, OWNER, INSTALL_CARDS, LIMIT_RE, diagnostic_instruction

STAGES = "ABCD"
FROZEN_BATCH = "frozen-batch-v1"
FROZEN_SIZES = (4, 5)
ACTIONS = {"A": "execute", "B": "publish-main", "C": "trello-write", "D": "trello-write"}
SYSTEM_ERRORS = {"FACTORY_IDENTITY_INVALID", "FACTORY_LISTS_CHANGED", "FACTORY_QUEUE_INCOMPLETE",
                 "FACTORY_ORDER_INVALID", "FACTORY_CARD_INVALID", "FACTORY_LISTS_INVALID",
                 "REMOTE_MAIN_UNAVAILABLE", "PUBLICATION_UNCERTAIN", "PUBLICATION_UNVERIFIED",
                 "PUBLICATION_BASE_CHANGED", "FACTORY_PUBLICATION_UNVERIFIED", "AUDIT_INVALID",
                 "WHEEL_GRANT_INTEGRITY", "WHEEL_ACTOR_CHANGED", "CREDIT_LIMIT"}
SYSTEM_ERRORS.update({"WHEEL_EXECUTION_UNCERTAIN","WHEEL_DETACHED_JOB"})
SYSTEM_ERRORS.update({"WHEEL_VALIDATION_UNCERTAIN","WHEEL_INSTALL_UNCERTAIN"})
CODEX_BLOCKERS = {"WHEEL_CODEX_AUTH", "WHEEL_CODEX_QUOTA", "WHEEL_CODEX_SESSION_CHANGED"}
SYSTEM_ERRORS.update(CODEX_BLOCKERS | {"WHEEL_DIAGNOSIS_WORKSPACE_CHANGED"})
FINISHED = {"closed", "blocked", "uncertain", "expired", "credit_wait"}


class Wheel:
    def __init__(self, factory):
        self.f = factory
        self.b = factory.bridge
        with self.b.db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS wheel_trials(
                id TEXT PRIMARY KEY, document TEXT NOT NULL, signature TEXT NOT NULL,
                state TEXT NOT NULL, created TEXT NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS wheel_one_trial ON wheel_trials(state) WHERE state='active';
            CREATE TABLE IF NOT EXISTS wheel_checkpoints(
                id INTEGER PRIMARY KEY AUTOINCREMENT, grant_id TEXT NOT NULL,
                phase TEXT NOT NULL, created TEXT NOT NULL, snapshot TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS wheel_control(
                id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
                reason TEXT, checked TEXT, retry_after REAL NOT NULL DEFAULT 0);
            INSERT OR IGNORE INTO wheel_control(id) VALUES(1);
            CREATE TABLE IF NOT EXISTS wheel_grants(
                card_id TEXT NOT NULL, attempt INTEGER NOT NULL, grant_id TEXT NOT NULL UNIQUE,
                terms TEXT NOT NULL, signature TEXT NOT NULL, state TEXT NOT NULL, reason TEXT,
                PRIMARY KEY(card_id,attempt));
            CREATE UNIQUE INDEX IF NOT EXISTS wheel_one_working ON wheel_grants(state) WHERE state='working';
            CREATE TABLE IF NOT EXISTS wheel_stages(
                grant_id TEXT NOT NULL, letter TEXT NOT NULL, state TEXT NOT NULL,
                started TEXT NOT NULL, finished TEXT, receipt TEXT, approval_id TEXT,
                PRIMARY KEY(grant_id,letter));
            """)
        from factory_v2 import Continuity
        self.continuity=Continuity(self)

    def fail(self, code, text):
        raise self.f.Error(code, text)

    @staticmethod
    def _operations_for(subject):
        return list("ACD" if subject.get("work_kind")=="diagnosis" else STAGES)

    def _require_codex_identity(self, expected=None):
        quota, identity = self.b.codex_quota()
        if not identity:
            self.fail("WHEEL_CODEX_AUTH","No se pudo confirmar la sesión ChatGPT del ejecutor.")
        if expected is not None and identity!=expected:
            self.fail("WHEEL_CODEX_SESSION_CHANGED","Cambió la cuenta Codex autorizada; conserva la cola para revisión.")
        if quota["state"]!="available":
            self.fail("WHEEL_CODEX_QUOTA","La cuota de Codex no está disponible.")
        return identity

    def enabled(self):
        with self.b.db() as db:
            return bool(db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0])

    def toggle(self, enabled):
        if type(enabled) is not bool:
            self.fail("WHEEL_STATE_INVALID", "Selecciona activar o pausar la rueda.")
        if not enabled:
            self.pause("OWNER_PAUSED")
            return self.status()
        with self.f.lock, self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            already_enabled=bool(db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0])
            if already_enabled:
                return self.status()
            batch = self._latest_trial(db)
            if batch and batch[1].get("kind") == FROZEN_BATCH and batch[0]["state"] != "active":
                self.fail("WHEEL_BATCH_START_REQUIRED", "El lote congelado requiere su confirmación conjunta de arranque.")
            if batch and batch[1].get("kind")==FROZEN_BATCH:
                if batch[1].get("policy")!="independent-v2":
                    self.fail("WHEEL_V2_ACTIVATION_REQUIRED","Revisa y confirma el lote en el panel privado antes de reactivarlo.")
                reason=db.execute("SELECT reason FROM wheel_control WHERE id=1").fetchone()[0]
                if reason not in (None,"OWNER_PAUSED","WHEEL_CODEX_AUTH","WHEEL_CODEX_QUOTA",
                                  "CREDIT_LIMIT","CREDIT_RECOVERY_REQUIRED"):
                    self.fail("WHEEL_REVIEW_REQUIRED","El bloqueo requiere revisar el lote en el panel privado antes de reactivarlo.")
                self._require_codex_identity(batch[1]["codex_identity"])
                self.continuity.verify_activation(batch[0]["id"],batch[1])
            db.execute("UPDATE wheel_control SET enabled=?,reason=NULL,retry_after=0 WHERE id=1", (int(enabled),))
            if enabled:
                # Legacy observation may be enabled separately; it must never launch or
                # advance a wheel-owned attempt while this wheel is paused.
                db.execute("UPDATE factory_control SET enabled=0 WHERE id=1")
            self.b.audit("wheel_toggled", {"enabled": enabled}, db)
        return self.status()

    def pause(self, reason, retry_after=0):
        with self.b.db() as db:
            db.execute("UPDATE wheel_control SET enabled=0,reason=?,retry_after=? WHERE id=1", (reason,retry_after))
            self.b.audit("wheel_paused", {"reason": reason}, db)

    def activation_failed(self, code):
        """Persist a sanitized activation rejection so the owner sees a real red state."""
        safe_code=str(code)[:80]
        if not re.fullmatch(r"[A-Z0-9_]+",safe_code):
            safe_code="WHEEL_ACTIVATION_FAILED"
        with self.f.lock,self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            enabled=bool(db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0])
            if enabled:
                return
            db.execute("UPDATE wheel_control SET reason=?,retry_after=0 WHERE id=1",(safe_code,))
            self.b.audit("wheel_activation_rejected",{"code":safe_code},db)

    def resume_after_quota(self):
        # A reset timestamp is not proof of available credits or safe CLI continuation.
        # Retain the exact attempt; never enable a different card on this timer.
        with self.b.db() as db:
            changed = db.execute("UPDATE wheel_control SET reason='CREDIT_RECOVERY_REQUIRED',retry_after=0 "
                "WHERE enabled=0 AND reason='CREDIT_LIMIT' AND retry_after>0 AND retry_after<=?",(time.time(),)).rowcount
            if changed:
                self.b.audit("wheel_quota_review_required",{"automatic_resume":False},db)

    def checkpoint(self, g, phase):
        from wheel_effects import WheelPublication
        workspace = {}
        try:
            pub=WheelPublication(self.f,[])
            workspace={"head":pub.git_command(g["workspace"],"rev-parse","HEAD").strip(),
                       "status":pub.git_command(g["workspace"],"status","--porcelain"),
                       "diff_sha256":self.f.digest(pub.git_command(g["workspace"],"diff","--binary","HEAD"))}
        except Exception:
            workspace={"verification":"pending; original workspace retained"}
        with self.b.db() as db:
            attempt = db.execute("SELECT * FROM factory_attempts WHERE card_id=? AND attempt=?",
                                 (g["card_id"],g["attempt"])).fetchone()
            job = db.execute("SELECT id,state,result,pid,session_id,updated FROM jobs WHERE id=?",
                             (attempt["job_id"],)).fetchone() if attempt and attempt["job_id"] else None
            stages = [dict(r) for r in db.execute("SELECT * FROM wheel_stages WHERE grant_id=? ORDER BY letter",(g["grant_id"],))]
            snapshot = {"workspace":workspace,"authorization":g,"attempt":dict(attempt) if attempt else None,
                        "job":dict(job) if job else None,"stages":stages,"automatic_resume":False}
            db.execute("INSERT INTO wheel_checkpoints(grant_id,phase,created,snapshot) VALUES(?,?,?,?)",
                       (g["grant_id"],phase,self.f.utc(),self.f.canonical(snapshot)))
            self.b.audit("wheel_checkpoint",{"grant":g["grant_id"],"phase":phase},db)

    def status(self):
        with self.b.db() as db:
            control = dict(db.execute("SELECT * FROM wheel_control WHERE id=1").fetchone())
            batch = self._latest_trial(db)
            frozen = ({"id":batch[0]["id"], "state":batch[0]["state"], "policy":batch[1].get("policy"),
                       "cards":batch[1]["cards"]}
                      if batch and batch[1].get("kind") == FROZEN_BATCH else None)
            grants = []
            for row in db.execute("SELECT * FROM wheel_grants ORDER BY rowid DESC"):
                terms = json.loads(row["terms"])
                attempt=db.execute("SELECT detail FROM factory_attempts WHERE card_id=? AND attempt=?",
                                   (row["card_id"],row["attempt"])).fetchone()
                review=json.loads(attempt["detail"] or "{}").get("local_review") if attempt else None
                job_row=db.execute("SELECT j.state,j.result FROM jobs j JOIN factory_attempts a ON a.job_id=j.id "
                                   "WHERE a.card_id=? AND a.attempt=?",(row["card_id"],row["attempt"])).fetchone()
                job_state=job_row["state"] if job_row else None
                checkpoint=db.execute("SELECT phase,created FROM wheel_checkpoints WHERE grant_id=? ORDER BY id DESC LIMIT 1",(row["grant_id"],)).fetchone()
                stages = [dict(s) for s in db.execute("SELECT letter,state,started,finished,receipt FROM wheel_stages WHERE grant_id=? ORDER BY letter", (row["grant_id"],))]
                for stage in stages:
                    if stage["receipt"]:
                        stage["receipt"] = json.loads(stage["receipt"])
                grants.append({"card_id":row["card_id"], "attempt":row["attempt"], "title":terms["title"],
                               "position":terms["position"], "operations":terms["operations"], "depends_on":terms["depends_on"],
                               "work_kind":terms.get("work_kind","implementation"),
                               "dependency_versions":terms["dependency_versions"],
                               "expires_at":terms["expires_at"], "state":row["state"], "reason":row["reason"],
                               "stages":stages,"local_review":review,"job_state":job_state,
                               "checkpoint":dict(checkpoint) if checkpoint else None})
        latest={}
        for grant in grants:
            prior=latest.get(grant["card_id"])
            if prior is None or grant["attempt"]>prior["attempt"]:
                latest[grant["card_id"]]=grant
        def dependencies_closed(grant):
            return all(latest.get(dep,{}).get("state")=="closed" and
                       latest[dep]["attempt"]==grant["dependency_versions"][dep]["attempt"] for dep in grant["depends_on"])
        # Status uses the latest verified Trello snapshot, never old approval positions.
        preview = self.f._control().get("queue_preview", "[]")
        first = next(iter(json.loads(preview)), None)
        queued = [r for r in grants if first and r["card_id"]==first["card_id"] and r["state"]=="ready"
                  and dependencies_closed(r) and r["expires_at"]>time.time()]
        receipts = {s["letter"]:s["receipt"] for r in reversed(grants) for s in r["stages"] if s["receipt"]}
        publication = receipts.get("B", {})
        current=next((r for r in grants if r["state"]=="working"),None)
        phase=None
        if current:
            done={s["letter"] for s in current["stages"] if s["state"]=="verified"}
            if current["job_state"]=="running":
                phase="Ejecutando Codex"
            else:
                phase=next((label for letter,label in (("A","Preparando ejecución"),("B","Verificando el diagnóstico" if current.get("work_kind")=="diagnosis" else "Validando y publicando"),
                    ("C","Comentando el resultado"),("D","Verificando el traslado")) if letter not in done),"Cerrando tarjeta")
            current={**current,"phase":phase}
        return {**control, "enabled":bool(control["enabled"]), "grants":grants, "next":next(iter(queued),None),
                "last_tests":publication.get("tests"), "last_publication":publication.get("main_sha"),
                "metro":publication.get("metro"), "api":publication.get("api"),
                "comment":receipts.get("C"), "move":receipts.get("D"),
                "credits":"Cuota agotada" if control["reason"]=="CREDIT_LIMIT" else None,
                "quota":self.b.quota_status(),
                "current":current, "queue_head":first, "automatic_credit_resume":False, "frozen_batch":frozen,
                "recovery_required":control["reason"] in ("CREDIT_LIMIT","CREDIT_RECOVERY_REQUIRED")}

    def _subject(self, card, *, review=False):
        spec = self.f._spec(card)
        workspace, sandbox = self.b.workspace("4")
        from pathlib import Path
        for agent,settings in self.b.config["agents"].items():
            if agent in ("4","PRUEBA") or not settings.get("workspace"):
                continue
            other=Path(settings["workspace"]).resolve()
            if workspace.is_relative_to(other) or other.is_relative_to(workspace):
                self.fail("WHEEL_WORKSPACE_SHARED","La carpeta del agente coincide o se solapa con otra asignación.")
        if spec["agent"] != "4" or card["id"] in INSTALL_CARDS or sandbox != "workspace-write":
            self.fail("WHEEL_AGENT_INVALID", "Solo se autoriza el agente 4 en su carpeta independiente.")
        subject = {k:spec[k] for k in ("card_id","attempt","agent","title","instruction_sha","comment_ids","placement")}
        subject.update(position=card["pos"], board=BOARD, origin=QUEUE, destination=CHECK,
                       workspace=str(workspace), agent_settings=self.b.config["agents"]["4"],
                       owner=OWNER, publish_target="goappdev01/goapp:main",cli_settings=self.b.cli_defaults())
        if diagnostic_instruction(spec["instruction"]):
            subject.update(work_kind="diagnosis", publish_target=None)
        subject["binding"] = self.f.digest(self.f.canonical(subject))
        if not review:
            self._operation_guard(card)
        return subject, spec

    def _operation_guard(self, card):
        if card["id"] in self.b.config.get("protected_card_ids", []):
            self.fail("REFERENCE_READ_ONLY", "Esta tarjeta está protegida.")

    def _history_guard(self, card_id, attempt, sha):
        with self.b.db() as db:
            rows = list(db.execute("SELECT * FROM factory_attempts WHERE card_id=? ORDER BY attempt DESC", (card_id,)))
            latest = rows[0] if rows else None
            if latest and latest["attempt"] == attempt:
                if latest["state"] != "prepared" or latest["instruction_sha"] != sha or not latest["job_id"]:
                    self.fail("WHEEL_ATTEMPT_REVIEW", "El intento existente necesita revisión antes de cualquier ejecución.")
                job = self.b.job(latest["job_id"])
                if job["state"] != "prepared" or job["data"]["instruction_sha256"] != sha:
                    self.fail("WHEEL_JOB_REVIEW", "Ya existe una ejecución o cambió su instrucción.")
            elif (latest and (latest["attempt"] + 1 != attempt or latest["state"] != "await_review")) or (not latest and attempt != 1):
                self.fail("WHEEL_ATTEMPT_REVIEW", "El intento anterior no está conciliado.")
            for job in db.execute("SELECT id,data FROM jobs"):
                source = json.loads(job["data"]).get("source", {})
                if source.get("card_id") != card_id:
                    continue
                known = any(r["job_id"] == job["id"] for r in rows)
                if source.get("source") != "verified-queue" or not known:
                    self.fail("FACTORY_PREVIOUS_JOB", "Existe un trabajo anterior para esta tarjeta que debe revisarse.")

    def _available(self, cards):
        for card in cards:
            if card["id"] not in INSTALL_CARDS:
                yield card

    def review(self):
        with self.f.lock:
            self.f._identity()
            self.f._lists()
            cards = []
            workspace = self.b.workspace("4")[0]
            tracked = self.b.safety.git_command(workspace,"ls-files","-z","--","artifacts/go-app-mobile").split("\0")
            for card in self._available(self.f._cards()):
                row = {"card_id":card["id"], "title":card["name"], "position":card["pos"], "eligible":False}
                try:
                    subject, spec = self._subject(card, review=True)
                    row.update(subject)
                    self._operation_guard(card)
                    self._history_guard(card["id"], spec["attempt"], spec["instruction_sha"])
                    row["eligible"] = True
                    row["instruction"] = spec["instruction"]
                    row.update(self._suggestions(tracked, card["name"], spec["instruction"]))
                    if row.get("work_kind")=="diagnosis":
                        row.update(suggested_files=[],suggested_test_files=[],hosted_required=False)
                except self.f.Error as error:
                    if self._system(error.code):
                        raise
                    row["reason"] = error.code
                cards.append(row)
            return {"cards":cards, "checked":self.f.utc()}

    def _latest_trial(self, db):
        row = db.execute("SELECT * FROM wheel_trials ORDER BY rowid DESC LIMIT 1").fetchone()
        if not row:
            return None
        doc = json.loads(row["document"])
        sizes = FROZEN_SIZES if doc.get("kind") == FROZEN_BATCH else (2,)
        size = doc.get("maximum_cards")
        if (not hmac.compare_digest(self.b.sign(doc),row["signature"]) or doc.get("actor")!=self.b.actor
                or size not in sizes or len(doc.get("cards",[]))!=size):
            self.fail("WHEEL_TRIAL_INVALID","La autorización o preparación del lote no se puede comprobar.")
        return row, doc

    def _frozen_cards(self, rows):
        if any(not row.get("binding") for row in rows):
            self.fail("WHEEL_BATCH_CARD_UNVERIFIED", "No se pudo congelar la instrucción íntegra de todas las tarjetas.")
        return [{**{key:row[key] for key in ("card_id","title","position","instruction_sha","comment_ids","binding")},
                 "work_kind":row.get("work_kind","implementation"), "blocker":row.get("reason")} for row in rows]

    def _frozen_idle(self, db):
        if (db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0]
                or db.execute("SELECT 1 FROM wheel_grants WHERE state='working'").fetchone()
                or db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                or db.execute("SELECT 1 FROM operations WHERE state='sending'").fetchone()):
            self.fail("WHEEL_BATCH_BUSY","Conserva el trabajo activo y prepara el lote cuando la rueda esté en reposo.")

    def prepare_frozen_batch(self, card_ids):
        if (not isinstance(card_ids,list) or len(card_ids) not in FROZEN_SIZES
                or any(not isinstance(card,str) or not re.fullmatch("[0-9a-f]{24}",card) for card in card_ids)
                or len(set(card_ids))!=len(card_ids)):
            self.fail("WHEEL_BATCH_INVALID","Indica cuatro o cinco identificadores distintos en orden.")
        with self.f.lock:
            rows = self.review()["cards"]
            if [row["card_id"] for row in rows] != card_ids:
                self.fail("WHEEL_BATCH_ORDER_CHANGED","La cola ya no coincide con las tarjetas indicadas.")
            doc = {"kind":FROZEN_BATCH,"actor":self.b.actor,"maximum_cards":len(card_ids),"cards":self._frozen_cards(rows)}
            with self.b.mutex, self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                self._frozen_idle(db)
                latest = self._latest_trial(db)
                if latest and latest[1].get("kind")==FROZEN_BATCH and latest[0]["state"]=="active":
                    self.fail("WHEEL_BATCH_BUSY","Hay un lote autorizado que requiere conciliación.")
                source_keys = ("card_id","title","position","instruction_sha","comment_ids")
                if (latest and latest[0]["state"]=="prepared" and
                        latest[1]["maximum_cards"]==len(card_ids) and
                        all(all(old[key]==new[key] for key in source_keys)
                            for old,new in zip(latest[1]["cards"],doc["cards"]))):
                    if latest[1]!=doc:
                        db.execute("UPDATE wheel_trials SET document=?,signature=? WHERE id=?",
                                   (self.f.canonical(doc),self.b.sign(doc),latest[0]["id"]))
                        self.b.audit("wheel_frozen_prepared",doc,db)
                else:
                    db.execute("INSERT INTO wheel_trials VALUES(?,?,?,?,?)",
                               (uuid.uuid4().hex,self.f.canonical(doc),self.b.sign(doc),"prepared",self.f.utc()))
                    self.b.audit("wheel_frozen_prepared",doc,db)
        return self.status()["frozen_batch"]

    @staticmethod
    def _suggestions(tracked,title,instruction):
        # Suggestions are editable; only explicitly selected paths are ever signed.
        hints = {"soporte":"support","ayuda":"support","calculadora":"calculator","servicios":"service",
                 "reserva":"booking","calendario":"calendar","flotantes":"floating","mensajes":"message",
                 "empresa":"business","descuentos":"discount","qr":"qr","fast":"fast"}
        keys = {v for k,v in hints.items() if k in title.casefold()}
        specific = instruction.casefold()
        ranked=[]
        for path in tracked:
            name=PurePosixPath(path).name.casefold()
            if not name.endswith((".ts",".tsx",".test.mjs")):
                continue
            score=(100 if name in specific else 0)+sum(1 for k in keys if k in name)
            if score:
                ranked.append((-score,path))
        ranked.sort()
        tests=[p for _,p in ranked if p.endswith(".test.mjs")][:3]
        # The instruction is the functional boundary. A mobile-directory scope
        # allows the implementation to add necessary helpers without another
        # approval after coding; callers can narrow it during the initial review.
        files=["artifacts/go-app-mobile/"]
        groups = []
        name=title.casefold()
        if "servicio" in name:
            groups=["booking-services.test.mjs","booking-assistant.test.mjs"]
        elif "qr" in name:
            groups=["booking-cards-qr.test.mjs","floating-navigation.test.mjs"]
        elif "landing" in name:
            groups=["action-completion.test.mjs","landing-visual-variants.test.mjs"]
        if groups:
            tests=[path for path in tracked if PurePosixPath(path).name in groups]
        return {"suggested_files":files, "suggested_test_files":tests,
                "hosted_required":Wheel._hosted_required(title,instruction)}

    @staticmethod
    def _hosted_required(title,instruction):
        return bool(re.search(r"(?:soporte real conectado|mensajes reales|persistencia real en (?:servidor|backend)|"
                              r"circuito real de (?:envío|mensajería)|backend (?:real conectado|alojado operativo))",
                              title+"\n"+instruction,re.I))

    def _paths(self, values, label):
        if not isinstance(values, list) or not values or len(values) > 200 or any(not isinstance(v,str) for v in values):
            self.fail("WHEEL_SCOPE_INVALID", "Selecciona las rutas concretas de " + label + ".")
        for value in values:
            path = PurePosixPath(value)
            if (not value or len(value)>512 or str(path)!=value.removesuffix("/") or value.startswith(("/", "-")) or
                    ".." in path.parts or PureWindowsPath(value).drive or
                    any(p.startswith(".") for p in path.parts) or re.search(r'[\\\x00-\x1f:*?"<>|\[\]]',value)):
                self.fail("WHEEL_SCOPE_INVALID", "Utiliza rutas relativas exactas, sin patrones ni rutas privadas.")
        if len(set(v.casefold() for v in values)) != len(values):
            self.fail("WHEEL_SCOPE_INVALID", "No repitas rutas en el alcance aprobado.")
        return sorted(values)

    def _terms(self, decision, card, cards):
        expected = {"card_id","binding","operations","allowed_files","test_files","depends_on","backend_required","expires_at"}
        if not isinstance(decision,dict) or set(decision) != expected:
            self.fail("WHEEL_DECISION_INVALID","Faltan términos concretos de la decisión.")
        subject, spec = self._subject(card)
        self._history_guard(card["id"], spec["attempt"], spec["instruction_sha"])
        if decision["binding"] != subject["binding"]:
            self.fail("WHEEL_SUBJECT_CHANGED","La tarjeta o el agente han cambiado desde la revisión.")
        ops = decision["operations"]
        if not isinstance(ops,list) or not ops or any(op not in self._operations_for(subject) for op in ops) or len(ops)!=len(set(ops)):
            self.fail("WHEEL_OPERATIONS_INVALID","Indica los permisos individuales A, B, C y D.")
        diagnosis = subject.get("work_kind")=="diagnosis"
        if diagnosis and (decision["allowed_files"]!=[] or decision["test_files"]!=[] or decision["backend_required"] is not False):
            self.fail("WHEEL_DIAGNOSIS_SCOPE","Un diagnóstico no autoriza editar archivos ni operar el backend alojado.")
        files = [] if diagnosis else self._paths(decision["allowed_files"],"edición")
        tests = [] if decision["test_files"]==[] else self._paths(decision["test_files"],"pruebas")
        if any(path.endswith("/") or not path.endswith(".test.mjs") for path in tests):
            self.fail("WHEEL_TEST_SCOPE","Selecciona los archivos de prueba concretos de la aplicación.")
        deps = decision["depends_on"]
        if (not isinstance(deps,list) or len(deps)>100 or
                any(not isinstance(d,str) or not re.fullmatch("[0-9a-f]{24}",d) or d==card["id"] for d in deps)):
            self.fail("WHEEL_DEPENDENCY_INVALID","Revisa los identificadores de las dependencias.")
        versions={}
        for identifier in deps:
            if identifier in cards:
                dependency=self.f._spec(cards[identifier])
                versions[identifier]={key:dependency[key] for key in ("attempt","instruction_sha","title")}
            else:
                with self.b.db() as db:
                    prior=db.execute("SELECT * FROM wheel_grants WHERE card_id=? ORDER BY attempt DESC LIMIT 1",(identifier,)).fetchone()
                if not prior:
                    self.fail("WHEEL_DEPENDENCY_UNVERIFIED","La dependencia todavía no tiene una versión identificada en la fábrica.")
                dependency=self._verified(prior)
                versions[identifier]={key:dependency[key] for key in ("attempt","instruction_sha","title")}
        expiry = decision["expires_at"]
        if type(expiry) not in (float,int) or not math.isfinite(expiry) or expiry <= time.time():
            self.fail("WHEEL_EXPIRY_INVALID","Selecciona una vigencia futura para esta tarjeta.")
        if type(decision["backend_required"]) is not bool:
            self.fail("WHEEL_SCOPE_INVALID","Indica si se debe verificar un servicio backend alojado.")
        hosted_code=any(path.startswith(("artifacts/api-server/","lib/db/","supabase/migrations/")) for path in files)
        if not diagnosis and (hosted_code or self._hosted_required(card["name"],spec["instruction"])) and not decision["backend_required"]:
            self.fail("WHEEL_HOSTED_PROOF_REQUIRED","Esta instrucción exige comprobar el servicio alojado.")
        if any(re.search(r"^(?:railway\.(?:json|toml)|Dockerfile(?:[./]|$)|(?:infrastructure|terraform)/)|(?:\.pem|\.key)$",p,re.I) for p in files):
            self.fail("WHEEL_INFRASTRUCTURE_SCOPE","Estas rutas requieren una autorización específica fuera de la rueda ordinaria.")
        return {**subject,"operations":sorted(ops),"allowed_files":files,"test_files":tests,"depends_on":sorted(set(deps)),
                "dependency_versions":versions,
                "backend_required":decision["backend_required"],"expires_at":expiry,"actor":self.b.actor,
                "approved_at":self.f.utc(),"grant_id":uuid.uuid4().hex}

    def approve(self, decisions, *, start_frozen_batch=False):
        if not isinstance(decisions,list) or not 1 <= len(decisions) <= 100:
            self.fail("WHEEL_BATCH_INVALID","Selecciona tarjetas concretas para la revisión.")
        if type(start_frozen_batch) is not bool:
            self.fail("WHEEL_BATCH_INVALID","Selecciona de forma expresa si vas a arrancar el lote congelado.")
        with self.f.lock:
            with self.b.db() as db:
                latest = self._latest_trial(db)
                frozen = latest if latest and latest[1].get("kind")==FROZEN_BATCH else None
                if frozen:
                    if not start_frozen_batch or frozen[0]["state"]!="prepared":
                        self.fail("WHEEL_BATCH_START_REQUIRED","El lote congelado exige una autorización conjunta de arranque.")
                    self._frozen_idle(db)
                elif start_frozen_batch:
                    self.fail("WHEEL_BATCH_INVALID","No hay un lote congelado que autorizar.")
            self.f._identity()
            self.f._lists()
            cards = {c["id"]:c for c in self._available(self.f._cards())}
            if frozen:
                expected = frozen[1]["cards"]
                if (list(cards)!=[item["card_id"] for item in expected] or
                        [item.get("card_id") for item in decisions if isinstance(item,dict)]!=list(cards)):
                    self.fail("WHEEL_BATCH_ORDER_CHANGED","La revisión debe cubrir el lote exacto en el orden actual.")
                if any(item["blocker"] for item in expected):
                    self.fail("WHEEL_BATCH_BLOCKED","El lote congelado contiene tarjetas que no permiten el ciclo completo.")
            terms = []
            instructions = {}
            for item in decisions:
                if not isinstance(item,dict) or not isinstance(item.get("card_id"),str) or item["card_id"] not in cards:
                    self.fail("WHEEL_CARD_CHANGED","La tarjeta no está disponible en la cola autorizada.")
                terms.append(self._terms(item,cards[item["card_id"]],cards))
                instructions[item["card_id"]]=self.f._spec(cards[item["card_id"]])["instruction"]
            if len({g["card_id"] for g in terms}) != len(terms):
                self.fail("WHEEL_BATCH_INVALID","Una tarjeta aparece más de una vez en el lote.")
            if frozen and any(g["binding"]!=item["binding"] or g["operations"]!=self._operations_for(g)
                              for g,item in zip(terms,expected)):
                self.fail("WHEEL_BATCH_SCOPE_CHANGED","Confirma las operaciones propias de cada instrucción congelada, sin cambios de alcance.")
            confirmation = {"cards":terms}
            fallbacks=[]
            if frozen:
                fallbacks=self.continuity.dependency_fallbacks(
                    {g["card_id"]:("ready",g) for g in terms},instructions)
                confirmation["start_frozen_batch"] = frozen[0]["id"]
                confirmation["codex_identity"] = self._require_codex_identity()
                confirmation["policy"] = "independent-v2"
                confirmation["dependency_fallbacks"] = fallbacks
            if self.b.owner_confirmation("wheel-batch", confirmation) is not True:
                self.fail("OWNER_CONFIRMATION_REQUIRED","Falta la decisión del propietario sobre estas tarjetas.")
            with self.b.mutex, self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                for g in terms:
                    old = db.execute("SELECT * FROM wheel_grants WHERE card_id=? AND attempt=?", (g["card_id"],g["attempt"])).fetchone()
                    if old and (old["state"] not in ("ready","wait_permissions","expired") or db.execute(
                        "SELECT 1 FROM wheel_stages WHERE grant_id=?",(old["grant_id"],)).fetchone()):
                        self.fail("WHEEL_ATTEMPT_REVIEW","Esta autorización tiene actividad previa y se conserva para revisión.")
                    if old:
                        self.b.audit("wheel_superseded", {"prior":old["grant_id"],"new":g["grant_id"]}, db)
                    state = "ready" if g["operations"]==self._operations_for(g) else "wait_permissions"
                    db.execute("INSERT OR REPLACE INTO wheel_grants VALUES(?,?,?,?,?,?,NULL)",
                               (g["card_id"],g["attempt"],g["grant_id"],self.f.canonical(g),self.b.sign(g),state))
                    self.b.audit("wheel_granted", g, db)
                if frozen:
                    self._frozen_idle(db)
                    doc = {**frozen[1], "expires_at":min(g["expires_at"] for g in terms),
                           "codex_identity":confirmation["codex_identity"],
                           "cards":[{**item,"grant_id":g["grant_id"]} for item,g in zip(expected,terms)],
                           "policy":"independent-v2"}
                    activation={"batch_sha":self.f.digest(self.f.canonical(doc)),"actor":self.b.actor,
                                "principal":self.b.actor,"at":self.f.utc(),
                                "codex_identity":confirmation["codex_identity"],
                                "dependency_fallbacks":fallbacks}
                    db.execute("UPDATE wheel_trials SET state='superseded' WHERE state='active'")
                    db.execute("UPDATE wheel_trials SET state='active',document=?,signature=? WHERE id=?",
                               (self.f.canonical(doc),self.b.sign(doc),frozen[0]["id"]))
                    db.execute("INSERT OR REPLACE INTO factory_v2_activation VALUES(?,?,?)",
                               (frozen[0]["id"],self.f.canonical(activation),self.b.sign(activation)))
                    db.execute("UPDATE wheel_control SET enabled=1,reason=NULL,retry_after=0 WHERE id=1")
                    db.execute("UPDATE factory_control SET enabled=0 WHERE id=1")
                    self.b.audit("wheel_frozen_started",{"batch":frozen[0]["id"],"policy":"independent-v2"},db)
                    self.b.audit("wheel_v2_owner_activated",{"batch":frozen[0]["id"],"principal":self.b.actor,
                        "cards":[item["card_id"] for item in doc["cards"]]},db)
        return self.status()

    def _verified(self,row):
        g=json.loads(row["terms"])
        if not hmac.compare_digest(self.b.sign(g),row["signature"]) or any(g[k]!=row[k] for k in ("grant_id","card_id","attempt")):
            self.fail("WHEEL_GRANT_INTEGRITY","La autorización persistida no se puede verificar.")
        if g["actor"] != self.b.actor:
            self.fail("WHEEL_ACTOR_CHANGED","Cambió la identidad autorizante del panel.")
        return g

    def _transition(self,g,state,reason=None):
        with self.b.db() as db:
            db.execute("UPDATE wheel_grants SET state=?,reason=? WHERE grant_id=?",(state,reason,g["grant_id"]))
            attempt_state={"blocked":"blocked","credit_wait":"limit_pause"}.get(state)
            if attempt_state:
                changed=db.execute(
                    "UPDATE factory_attempts SET state=?,finished=COALESCE(finished,?) "
                    "WHERE card_id=? AND attempt=? AND state IN ('prepared','running','commenting','moving')",
                    (attempt_state,self.f.utc(),g["card_id"],g["attempt"])).rowcount
                if changed:
                    self.b.audit("factory_attempt_reconciled",{
                        "card":g["card_id"],"attempt":g["attempt"],"state":attempt_state,
                        "reason":reason},db)
            self.b.audit("wheel_state", {"grant":g["grant_id"],"state":state,"reason":reason},db)

    def _check_card(self,g,card):
        if not card:
            self.fail("WHEEL_CARD_CHANGED","La tarjeta dejó de estar en COLA.")
        subject, spec=self._subject(card)
        with self.b.db() as db:
            active=db.execute("SELECT 1 FROM wheel_grants WHERE grant_id=? AND state='working'",(g["grant_id"],)).fetchone()
        if active:
            subject["position"] = g["position"]
            subject.pop("binding",None)
            subject["binding"] = self.f.digest(self.f.canonical(subject))
        if subject["binding"] != g["binding"]:
            self.fail("WHEEL_SUBJECT_CHANGED","La instrucción, posición, carpeta o destino ha cambiado.")
        return spec

    def _system(self,code):
        return code in SYSTEM_ERRORS or code.startswith(("HTTP_401","HTTP_403","NETWORK_UNCERTAIN","REFRESH_UNCERTAIN","OAUTH_", "TRELLO_AUTH", "TRELLO_HTTP_401",
                   "TRELLO_HTTP_403", "VAULT_", "SAFETY_", "DPAPI_", "AUTHORIZATION_MISMATCH",
                   "FACTORY_METRO_","FACTORY_API_","FACTORY_TAILSCALE_","WHEEL_PRESERVATION_","WHEEL_PUBLICATION_"))

    def _preflight(self,workspace):
        if __import__("os").name=="nt":
            probe=subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-Command",
                "Get-CimInstance Win32_Process -Filter \"Name='codex.exe' OR Name='node.exe'\" | Select-Object -ExpandProperty CommandLine"],
                capture_output=True,text=True,timeout=20)
            if probe.returncode or any(str(workspace).casefold() in line.casefold() and
                                       (re.search(r"\bexec\b",line) or re.search(r"\bstart\b.*--port\s+8088",line))
                                       for line in probe.stdout.splitlines()):
                self.fail("WHEEL_WORKSPACE_BUSY","No se puede descartar otra ejecución CLI en la carpeta del agente.")
        try:
            self.f._git(workspace)
        except self.f.Error as error:
            if error.code != "WORKSPACE_OUTDATED":
                raise
            state = self.b.git_state(workspace)
            if state.get("tracked_dirty") or not state.get("git"):
                self.fail("FACTORY_WORKSPACE_DIRTY","Hay trabajo local que impide actualizar la carpeta.")
            git=lambda *args:self.b.safety.git_command(workspace,*args)
            branch=git("branch","--show-current").strip()
            if branch!="main" and not branch.startswith("codex/"):
                self.fail("FACTORY_BRANCH_INVALID","La rama no está preparada para un avance rápido.")
            git("fetch","--no-tags","origin","refs/heads/main")
            git("merge-base","--is-ancestor","HEAD","FETCH_HEAD")
            git("-c","core.hooksPath=NUL","merge","--ff-only","FETCH_HEAD")
            self.f._git(workspace)

    def _prepare(self,g,spec):
        self._history_guard(g["card_id"],g["attempt"],g["instruction_sha"])
        self._verify_dependencies(g)
        self._preflight(self.b.workspace("4")[0])
        if g["backend_required"]:
            self.fail("WHEEL_HOSTED_PROOF_REQUIRED","Falta configurar la prueba autenticada del servicio alojado que exige esta tarjeta.")
        row=self.f._row(g["card_id"],g["attempt"])
        if not row:
            self.f._start(spec)
            row=self.f._row(g["card_id"],g["attempt"])
        if g.get("work_kind")!="diagnosis" and not json.loads(row["detail"]).get("work_branch"):
            from wheel_effects import WheelEffects
            branch=WheelEffects(self.f).start_branch(g)
            detail=json.loads(row["detail"])
            detail["work_branch"]=branch
            self.f._update(g["card_id"],g["attempt"],detail=self.f.canonical(detail))
            row=self.f._row(g["card_id"],g["attempt"])
        job=self.b.job(row["job_id"])
        if (job["state"]!="prepared" or job["data"]["instruction_sha256"]!=g["instruction_sha"] or
                job["data"]["source"].get("card_id")!=g["card_id"]):
            self.fail("WHEEL_JOB_REVIEW","El trabajo preparado no coincide con la tarjeta.")
        return row

    def _verify_dependencies(self,g):
        from factory import DONE
        for identifier,version in g["dependency_versions"].items():
            card=self.b.api("/1/cards/"+identifier,{"fields":"id,idBoard,idList,name,shortLink"})
            if card.get("idBoard")!=BOARD or card.get("idList") not in (CHECK,DONE) or card.get("name")!=version["title"]:
                self.fail("WHEEL_DEPENDENCY_CHANGED","La dependencia cambió después de la autorización.")
            snapshot=self.b.read_card("https://trello.com/c/"+card["shortLink"],archive=False)["data"]
            comments=self.f.original_comments(identifier,snapshot["comments"])
            text="\n\n".join(comment["text"] for comment in comments)
            if (not snapshot["verification"].get("stable_during_read") or not snapshot["verification"].get("pagination_exhausted") or
                    any(comment.get("creatorId")!=OWNER for comment in comments) or self.f.digest(text)!=version["instruction_sha"]):
                self.fail("WHEEL_DEPENDENCY_CHANGED","La instrucción de la dependencia ya no coincide con su cierre verificado.")

    def _permit(self,g,letter,row,action,payload,*,codex_identity=None):
        if not self.enabled():
            self.fail("WHEEL_PAUSED","La rueda está en pausa.")
        if ACTIONS[letter]!=action or letter not in g["operations"] or self._expired(g) or not self.enabled():
            self.fail("WHEEL_PERMISSION_REQUIRED","Falta autorización vigente para esta operación.")
        self.f._identity()
        self.f._lists()
        self._check_card(g, next((c for c in self.f._cards() if c["id"]==g["card_id"]),None))
        if action=="execute":
            if codex_identity:
                self._require_codex_identity(codex_identity)
            valid=(payload.get("job")==row["job_id"] and payload.get("agent")=="4" and
                   payload.get("workspace")==g["workspace"] and payload.get("instruction_sha256")==g["instruction_sha"] and
                   payload.get("sandbox")==("read-only" if g.get("work_kind")=="diagnosis" else "workspace-write")
                   and payload.get("allow_dirty") is False and payload.get("allow_publish") is False)
        elif action=="publish-main":
            from wheel_effects import within_scope
            valid=(payload.get("job")==row["job_id"] and payload.get("target")=="origin/main" and payload.get("workspace")==g["workspace"]
                   and payload.get("remote_main")==row["before_sha"] and bool(payload.get("files"))
                   and within_scope(payload["files"],g["allowed_files"]))
        else:
            body=payload.get("payload",{})
            op="comment" if letter=="C" else "move"
            valid=(payload.get("action")==op and body.get("card_id")==g["card_id"] and
                   ((op=="comment" and body.get("job_id")==row["job_id"]) or (op=="move" and body.get("list_id")==g["destination"])))
        if not valid:
            self.fail("WHEEL_PAYLOAD_OUTSIDE_SCOPE","La operación concreta supera el alcance preautorizado.")
        token=uuid.uuid4().hex
        created=time.time()
        origin="wheel:"+g["grant_id"]+":"+letter
        record={"id":token,"action":action,"payload":payload,"actor":self.b.approval_actor,"created":created,"origin":origin}
        with self.b.mutex,self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            persisted=db.execute("SELECT * FROM wheel_grants WHERE grant_id=? AND state='working'",(g["grant_id"],)).fetchone()
            enabled=db.execute("SELECT enabled FROM wheel_control WHERE id=1").fetchone()[0]
            if not persisted or self._verified(persisted)!=g or not enabled or self._expired(g):
                self.fail("WHEEL_PERMISSION_REQUIRED","La autorización ya no está disponible.")
            changed=db.execute("UPDATE wheel_stages SET approval_id=? WHERE grant_id=? AND letter=? AND state='claimed' AND approval_id IS NULL",
                               (token,g["grant_id"],letter)).rowcount
            if changed!=1:
                self.fail("WHEEL_ALREADY_USED","La operación ya fue liberada.")
            db.execute("INSERT INTO approvals VALUES(?,?,?,?,?,?,?)",(token,action,self.f.canonical(payload),
                       self.f.canonical({**self.b.approval_actor,"origin":origin}),created,None,self.b.sign(record)))
            self.b.audit("wheel_operation_released",{"grant":g["grant_id"],"letter":letter,"approval":token,
                        "payload_sha256":self.f.digest(self.f.canonical(payload))},db)
        return token

    @staticmethod
    def _expired(g):
        return time.time()>=g["expires_at"]

    def _record_receipt(self,g,letter,receipt):
        if not isinstance(receipt,dict) or not receipt:
            self.fail("WHEEL_RECEIPT_MISSING","La etapa no tiene confirmación verificable.")
        with self.b.db() as db:
            db.execute("UPDATE wheel_stages SET state='verified',finished=?,receipt=? WHERE grant_id=? AND letter=? AND state='claimed'",
                       (self.f.utc(),self.f.canonical(receipt),g["grant_id"],letter))
            self.b.audit("wheel_receipt",{"grant":g["grant_id"],"letter":letter,"receipt_sha":self.f.digest(self.f.canonical(receipt))},db)

        self.checkpoint(g,"verified:"+letter)

    def _finish_error(self,g,code,uncertain=False):
        if code=="CREDIT_LIMIT":
            state="credit_wait"
        else:
            state="uncertain" if uncertain else "blocked"
        self.checkpoint(g,code)
        if not uncertain and not self._system(code) and g.get("work_kind")!="diagnosis":
            from wheel_effects import WheelEffects
            try:
                WheelEffects(self.f).preserve_blocked_work(g,code)
            except Exception as error:
                code=getattr(error,"code","WHEEL_PRESERVATION_FAILED")
                if not code.startswith("WHEEL_PRESERVATION_"):
                    code="WHEEL_PRESERVATION_FAILED"
                uncertain=True
                state="uncertain"
        self._transition(g,state,code)
        if self.continuity.active() and not uncertain and not self._system(code):
            return self.continuity.card_error(g,code)
        self.pause(code)
        return {"blocked":code,"again":self.enabled()}

    def _advance(self,g,card,*,codex_identity=None):
        from wheel_effects import WheelEffects
        effects=WheelEffects(self.f)
        with self.b.db() as db:
            steps={r["letter"]:dict(r) for r in db.execute("SELECT * FROM wheel_stages WHERE grant_id=?",(g["grant_id"],))}
        row=self.f._row(g["card_id"],g["attempt"])
        for letter in STAGES:
            step=steps.get(letter)
            if letter not in g["operations"] and not (letter=="B" and g.get("work_kind")=="diagnosis"):
                if self.continuity.active():
                    return self.continuity.card_error(g,"WHEEL_PERMISSION_REQUIRED")
                self.pause("WHEEL_PERMISSION_REQUIRED")
                return {"paused":"WHEEL_PERMISSION_REQUIRED","letter":letter}
            if step and step["state"]=="verified":
                continue
            if step:
                receipt=effects.reconcile(letter,row,g)
                if not receipt:
                    code = "PUBLICATION_UNCERTAIN" if letter=="B" else "WHEEL_EXECUTION_UNCERTAIN" if letter=="A" else "WHEEL_STAGE_UNCERTAIN"
                    return self._finish_error(g,code,True)
                self._record_receipt(g,letter,receipt)
                return {"again":True}
            if self._expired(g):
                self._transition(g,"expired","WHEEL_EXPIRY_INVALID")
                return {"again":True}
            spec=self._check_card(g,card)
            if letter=="A":
                if codex_identity:
                    self._require_codex_identity(codex_identity)
                row=self._prepare(g,spec)
            if letter=="B":
                job=self.b.job(row["job_id"])
                if job["state"]=="detached":
                    return self._finish_error(g,"WHEEL_DETACHED_JOB",True)
                if job["state"]=="running":
                    return {"running":row["job_id"]}
                if job["state"] not in ("completed","awaiting_validation"):
                    result=job.get("result") or {}
                    if (self.continuity.active() and g.get("work_kind")=="diagnosis"
                            and self.continuity.diagnostic_ready(job)):
                        self.b.audit("diagnostic_pending_real",{"job":job["id"],"programming_repeated":False})
                    else:
                        limited=result.get("credit_limited") or LIMIT_RE.search(str(result.get("errors",""))+" "+str(result.get("response","")))
                        outcome=self._finish_error(g,"CREDIT_LIMIT" if limited else "FACTORY_JOB_FAILED",
                                                   job["state"] in ("needs_review","interrupted"))
                        if limited and outcome.get("blocked")=="CREDIT_LIMIT" and result.get("quota_reset_at"):
                            self.pause("CREDIT_LIMIT",result["quota_reset_at"])
                        return outcome
            with self.b.db() as db:
                db.execute("INSERT INTO wheel_stages(grant_id,letter,state,started) VALUES(?,?,'claimed',?)",
                           (g["grant_id"],letter,self.f.utc()))
                self.b.audit("wheel_claimed",{"grant":g["grant_id"],"letter":letter},db)
            self.checkpoint(g,"claimed:"+letter)
            try:
                receipt=effects.perform(letter,row,g,lambda action,payload:self._permit(
                    g,letter,row,action,payload,codex_identity=codex_identity))
                self._record_receipt(g,letter,receipt)
            except Exception as error:
                code=getattr(error,"code","WHEEL_EFFECT_UNCERTAIN")
                with self.b.db() as db:
                    issued=db.execute("SELECT approval_id FROM wheel_stages WHERE grant_id=? AND letter=?",(g["grant_id"],letter)).fetchone()[0]
                if code in CODEX_BLOCKERS and letter=="A" and not issued:
                    with self.b.db() as db:
                        db.execute("DELETE FROM wheel_stages WHERE grant_id=? AND letter='A' AND state='claimed' AND approval_id IS NULL",
                                   (g["grant_id"],))
                    self.pause(code)
                    return {"paused":code}
                if code == "WHEEL_PAUSED" and effects.cancel_before_release(letter,row):
                    with self.b.db() as db:
                        db.execute("DELETE FROM wheel_stages WHERE grant_id=? AND letter=? AND state='claimed'",
                                   (g["grant_id"],letter))
                        self.b.audit("wheel_paused_before_effect",{"grant":g["grant_id"],"letter":letter},db)
                    return {"enabled":False}
                if issued:
                    confirmed=effects.reconcile(letter,row,g)
                    if confirmed:
                        self._record_receipt(g,letter,confirmed)
                        return {"again":True}
                elif code == "WHEEL_PAUSED":
                    with self.b.db() as db:
                        db.execute("DELETE FROM wheel_stages WHERE grant_id=? AND letter=? AND approval_id IS NULL AND state='claimed'",
                                   (g["grant_id"],letter))
                        self.b.audit("wheel_paused_before_release",{"grant":g["grant_id"],"letter":letter},db)
                    return {"enabled":False}
                if self.continuity.active() and not issued and self.continuity.defer_retry(g,letter,code):
                    return {"deferred":code,"again":False}
                return self._finish_error(g,code,bool(issued))
            return {"again":True}
        self._transition(g,"closed")
        trial=self._trial_limit()
        return {"closed":g["card_id"],"again":not bool(trial and trial.get("paused"))}

    def _trial_limit(self):
        with self.b.db() as db:
            latest = self._latest_trial(db)
            if not latest:
                return None
            trial, doc = latest
            frozen = doc.get("kind")==FROZEN_BATCH
            complete = "OWNER_FROZEN_BATCH_COMPLETE" if frozen else "OWNER_TWO_CARD_TRIAL_COMPLETE"
            if trial["state"]=="completed":
                self._pause_head(db,complete)
                return {"paused":complete}
            if trial["state"]=="prepared":
                self._pause_head(db,"WHEEL_BATCH_START_REQUIRED")
                return {"paused":"WHEEL_BATCH_START_REQUIRED"}
            if trial["state"]!="active" or time.time()>=doc["expires_at"]:
                self._pause_head(db,"WHEEL_TRIAL_EXPIRED")
                return {"paused":"WHEEL_TRIAL_EXPIRED"}
            if frozen and not doc.get("codex_identity"):
                self.fail("WHEEL_TRIAL_INVALID","Falta la sesión Codex asociada a este lote.")
            for item in doc["cards"]:
                row=db.execute("SELECT * FROM wheel_grants WHERE grant_id=?",(item["grant_id"],)).fetchone()
                if not row:
                    self.fail("WHEEL_TRIAL_INVALID","Falta una autorización de esta prueba.")
                g=self._verified(row)
                if (g["card_id"]!=item["card_id"] or g["instruction_sha"]!=item["instruction_sha"] or g["operations"]!=self._operations_for(g)):
                    self.fail("WHEEL_TRIAL_INVALID","Cambió el alcance individual de esta prueba.")
                if frozen and g["binding"]!=item["binding"]:
                    self.fail("WHEEL_TRIAL_INVALID","Cambió la instrucción congelada.")
                if row["state"]!="closed":
                    if doc.get("policy")=="independent-v2":
                        return self.continuity.select_batch(db,trial,doc)
                    return {"expected":g["card_id"],"grant_id":g["grant_id"],"codex_identity":doc.get("codex_identity")}
                if db.execute("SELECT COUNT(*) FROM wheel_stages WHERE grant_id=? AND state='verified'",(g["grant_id"],)).fetchone()[0]!=4:
                    self.fail("WHEEL_TRIAL_INVALID","El ciclo no tiene cuatro recibos verificados.")
            db.execute("UPDATE wheel_trials SET state='completed' WHERE id=?",(trial["id"],))
            self._pause_head(db,complete)
            event = "wheel_frozen_completed" if frozen else "wheel_two_card_trial_completed"
            self.b.audit(event,{"trial":trial["id"],"maximum_cards":doc["maximum_cards"]},db)
            return {"paused":complete}

    def _pause_head(self, db, reason):
        db.execute("UPDATE wheel_control SET enabled=0,reason=?,retry_after=0 WHERE id=1",(reason,))
        self.b.audit("wheel_head_blocked",{"reason":reason},db)

    def tick(self):
        if not self.enabled():
            return {"enabled":False}
        try:
            self.f._identity()
            self.f._lists()
            cards={c["id"]:c for c in self._available(self.f._cards())}
            trial=self._trial_limit()
            if trial and trial.get("paused"):
                return trial
            if trial and trial.get("waiting"):
                return trial
            with self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                db.execute("UPDATE wheel_control SET checked=? WHERE id=1",(self.f.utc(),))
                row=db.execute("SELECT * FROM wheel_grants WHERE state='working'").fetchone()
                if not row:
                    if db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone():
                        return {"running":"ocupado"}
                    first=next(iter(cards.values()),None)
                    if trial and trial.get("independent"):
                        first=cards.get(trial["expected"])
                    if trial and (not first or first["id"]!=trial["expected"]):
                        self._pause_head(db,"WHEEL_TRIAL_ORDER_CHANGED")
                        return {"paused":"WHEEL_TRIAL_ORDER_CHANGED"}
                    if not first:
                        return {"watching":True}
                    candidate=db.execute("SELECT * FROM wheel_grants WHERE card_id=? ORDER BY attempt DESC LIMIT 1",(first["id"],)).fetchone()
                    if not candidate:
                        self._pause_head(db,"WHEEL_HEAD_PERMISSION_REQUIRED")
                        return {"paused":"WHEEL_HEAD_PERMISSION_REQUIRED","card_id":first["id"]}
                    g=self._verified(candidate)
                    if candidate["state"] not in ("ready","wait_permissions"):
                        self._pause_head(db,"WHEEL_HEAD_REVIEW_REQUIRED")
                        return {"paused":"WHEEL_HEAD_REVIEW_REQUIRED","card_id":first["id"]}
                    if "A" not in g["operations"] or self._expired(g):
                        self._pause_head(db,"WHEEL_HEAD_PERMISSION_REQUIRED")
                        return {"paused":"WHEEL_HEAD_PERMISSION_REQUIRED","card_id":first["id"]}
                    if not all(dep not in cards and db.execute(
                        "SELECT 1 FROM wheel_grants WHERE card_id=? AND attempt=? AND state='closed'",
                        (dep,g["dependency_versions"][dep]["attempt"])).fetchone() for dep in g["depends_on"]):
                        self._pause_head(db,"WHEEL_HEAD_DEPENDENCY_BLOCKED")
                        return {"paused":"WHEEL_HEAD_DEPENDENCY_BLOCKED","card_id":first["id"]}
                    row=candidate
            if not row:
                return {"watching":True}
            g=self._verified(row)
            if trial and g["grant_id"]!=trial["grant_id"]:
                self.pause("WHEEL_TRIAL_OUTSIDE_SCOPE")
                return {"paused":"WHEEL_TRIAL_OUTSIDE_SCOPE"}
            try:
                if row["state"] != "working":
                    self._check_card(g,cards.get(g["card_id"]))
                    with self.b.db() as db:
                        db.execute("BEGIN IMMEDIATE")
                        if db.execute("SELECT 1 FROM wheel_grants WHERE state='working'").fetchone():
                            return {"running":"ocupado"}
                        changed=db.execute("UPDATE wheel_grants SET state='working',reason=NULL WHERE grant_id=? AND state IN ('ready','wait_permissions')",(g["grant_id"],)).rowcount
                        if changed != 1:
                            return {"paused":"WHEEL_HEAD_REVIEW_REQUIRED"}
                return self._advance(g,cards.get(g["card_id"]),codex_identity=trial.get("codex_identity") if trial else None)
            except self.f.Error as error:
                if error.code in CODEX_BLOCKERS:
                    self.pause(error.code)
                    return {"paused":error.code}
                return self._finish_error(g,error.code)
        except self.f.Error as error:
            self.pause(error.code)
            return {"paused":error.code}
