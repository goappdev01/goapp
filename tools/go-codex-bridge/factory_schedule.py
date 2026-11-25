"""One owner-approved, single-shot activation of the existing V2 power control."""
import datetime as dt
import hmac
import time


class FactorySchedule:
    def __init__(self, panel):
        self.panel = panel
        self.b, self.f, self.w = panel.b, panel.f, panel.w
        with self.b.db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS factory_activation_schedule (
                id INTEGER PRIMARY KEY CHECK(id=1), due_utc TEXT NOT NULL,
                state TEXT NOT NULL, principal_hash TEXT NOT NULL,
                signature TEXT NOT NULL, reason TEXT, updated TEXT NOT NULL,
                target_identity TEXT NOT NULL DEFAULT '', target_label TEXT NOT NULL DEFAULT '')""")
            columns={row["name"] for row in db.execute("PRAGMA table_info(factory_activation_schedule)")}
            if "target_identity" not in columns:
                db.execute("ALTER TABLE factory_activation_schedule ADD COLUMN target_identity TEXT NOT NULL DEFAULT ''")
            if "target_label" not in columns:
                db.execute("ALTER TABLE factory_activation_schedule ADD COLUMN target_label TEXT NOT NULL DEFAULT ''")
        # A crash between claiming and activating is never replayed on restart.
        with self.f.lock,self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
            if row and row["state"]=="firing":
                if not self._valid(row):
                    self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se activará la fábrica.")
                self._transition(db,row,"failed","FACTORY_SCHEDULE_INTERRUPTED")

    def _signed(self, due_utc, state, principal_hash, target_identity="", target_label=""):
        terms={"kind":"factory-activation-v1", "due_utc":due_utc,
               "state":state, "principal_hash":principal_hash}
        if target_identity:
            terms={**terms,"kind":"factory-activation-v2","target_identity":target_identity,
                   "target_label":target_label}
        return self.b.sign(terms)

    def _valid(self, row):
        return hmac.compare_digest(row["signature"],self._signed(
            row["due_utc"],row["state"],row["principal_hash"],
            row["target_identity"],row["target_label"]))

    def status(self):
        with self.b.db() as db:
            row = db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
        if not row:
            return {"state":"none", "due_utc":None, "reason":None}
        if not self._valid(row):
            self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se activará la fábrica.")
        return {"state":row["state"], "due_utc":row["due_utc"], "reason":row["reason"],
                "account":row["target_label"] or None,
                "account_required":not bool(row["target_identity"])}

    def set(self, due_utc, confirmation, principal, target_identity):
        if confirmation!="PROGRAMAR ACTIVACIÓN" or not isinstance(principal,str) or not principal:
            self.w.fail("FACTORY_SCHEDULE_CONFIRMATION_REQUIRED", "Confirma expresamente la fecha y hora de activación.")
        try:
            date=dt.datetime.fromisoformat(due_utc)
            if date.tzinfo is None or date.utcoffset()!=dt.timedelta(0):
                raise ValueError
            timestamp=date.timestamp()
        except (TypeError,ValueError,OverflowError):
            self.w.fail("FACTORY_SCHEDULE_TIME_INVALID", "Selecciona una fecha y hora local válida.")
        if not time.time()+5<timestamp<=time.time()+30*86400:
            self.w.fail("FACTORY_SCHEDULE_TIME_INVALID", "La hora debe estar entre ahora y los próximos 30 días.")
        due=date.isoformat().replace("+00:00","Z")
        owner=self.b.sign({"scheduled_by":principal})
        choices=self.panel.schedule_accounts()["accounts"]
        selected=next((item for item in choices if item["id"]==target_identity),None)
        if not selected:
            self.w.fail("FACTORY_SCHEDULE_ACCOUNT_UNKNOWN",
                        "Selecciona una cuenta reconocida por Codex y vuelve a comprobar la sesión.")
        label=selected["label"]
        with self.f.lock,self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if self.w.enabled():
                self.w.fail("FACTORY_ALREADY_ACTIVE", "La fábrica ya está activa.")
            old=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
            if old and not self._valid(old):
                self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se sobrescribirá.")
            if old and old["state"] in ("scheduled","firing"):
                self.w.fail("FACTORY_SCHEDULE_EXISTS", "Cancela primero la programación vigente.")
            state="scheduled"
            db.execute("""INSERT OR REPLACE INTO factory_activation_schedule
                (id,due_utc,state,principal_hash,signature,reason,updated,target_identity,target_label)
                VALUES(1,?,?,?,?,?,?,?,?)""",
                       (due,state,owner,self._signed(due,state,owner,target_identity,label),
                        None,self.f.utc(),target_identity,label))
            self.b.audit("factory_activation_scheduled",{
                "due_utc":due,"principal_hash":owner,"target_identity":target_identity},db)
        return self.status()

    def cancel(self, confirmation):
        if confirmation!="CANCELAR ACTIVACIÓN":
            self.w.fail("FACTORY_SCHEDULE_CONFIRMATION_REQUIRED", "Confirma la cancelación de la programación.")
        with self.f.lock,self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
            if row and row["state"]=="scheduled":
                if not self._valid(row):
                    self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se cancelará a ciegas.")
                self._transition(db,row,"cancelled",None)
        return self.status()

    def cancel_on_pause(self):
        with self.f.lock,self.b.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
            if row and row["state"]=="scheduled":
                if not self._valid(row):
                    self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se activará la fábrica.")
                self._transition(db,row,"cancelled","OWNER_PAUSED")

    def _transition(self, db, row, state, reason):
        db.execute("UPDATE factory_activation_schedule SET state=?,signature=?,reason=?,updated=? WHERE id=1",
                   (state,self._signed(row["due_utc"],state,row["principal_hash"],
                                       row["target_identity"],row["target_label"]),reason,self.f.utc()))
        self.b.audit("factory_activation_schedule_"+state,{"due_utc":row["due_utc"],"reason":reason},db)

    def tick(self, now=None):
        now=time.time() if now is None else now
        with self.b.db() as db:
            pending=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
        if not pending or pending["state"]!="scheduled":
            return False
        if not self._valid(pending):
            self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se activará la fábrica.")
        if now<dt.datetime.fromisoformat(pending["due_utc"].replace("Z","+00:00")).timestamp():
            return False
        with self.f.lock:
            with self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                row=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
                if not row or row["state"]!="scheduled":
                    return False
                if not self._valid(row):
                    self.w.fail("FACTORY_SCHEDULE_INVALID", "La programación local cambió; no se activará la fábrica.")
                due=dt.datetime.fromisoformat(row["due_utc"].replace("Z","+00:00")).timestamp()
                if now<due:
                    return False
                if now-due>60:
                    self._transition(db,row,"failed","FACTORY_SCHEDULE_MISSED")
                    return False
                self._transition(db,row,"firing",None)
            try:
                if self.w.enabled():
                    self.w.fail("FACTORY_ALREADY_ACTIVE",
                                "La fábrica ya estaba activa; la programación no inició otra ejecución.")
                else:
                    if not row["target_identity"]:
                        self.w.fail("FACTORY_SCHEDULE_ACCOUNT_REQUIRED",
                                    "Esta programación antigua no tiene cuenta seleccionada. Cancélala y crea otra.")
                    identity,_=self.b.codex_account()
                    if identity!=row["target_identity"]:
                        self.w.fail("FACTORY_SCHEDULE_ACCOUNT_MISMATCH",
                                    "La sesión Codex iniciada no corresponde a la cuenta elegida. No se inició producción.")
                    live=self.w.live_policy()
                    if not live or live["codex_identity"]!=row["target_identity"]:
                        self.w.fail("FACTORY_SCHEDULE_ACCOUNT_UNBOUND",
                                    "La cuenta elegida no está vinculada a la autorización vigente. No se inició producción.")
                    # The same path as the V2 GO button rechecks the linked Codex
                    # identity, quota, queue grant, exclusive reservation and work.
                    result=self.panel.orbit_control("power",{"enabled":True},"scheduled-owner")
                    if result.get("enabled") is not True:
                        self.w.fail("FACTORY_SCHEDULE_ACTIVATION_FAILED", "La activación no quedó confirmada.")
                    reason=None
                    state="completed"
            except Exception as error:
                reason=getattr(error,"code","FACTORY_SCHEDULE_ACTIVATION_FAILED")
                state="failed"
            with self.b.db() as db:
                db.execute("BEGIN IMMEDIATE")
                current=db.execute("SELECT * FROM factory_activation_schedule WHERE id=1").fetchone()
                if current and current["state"]=="firing":
                    self._transition(db,current,state,reason)
            return state=="completed" and reason is None
