"""PC1 coordinator adapter. A remote PC2 executor remains unavailable until paired."""

from factory_reservation import FactoryReservation, ReservationError


class ReservationRuntime:
    @staticmethod
    def confirmed_checkpoint(db):
        checkpoint = db.execute("SELECT id,phase FROM wheel_checkpoints ORDER BY id DESC LIMIT 1").fetchone()
        if checkpoint:
            return (f"{checkpoint['id']}:{checkpoint['phase']}"
                    if checkpoint["phase"].startswith("verified:") else None)
        if (not db.execute("SELECT 1 FROM jobs").fetchone()
                and not db.execute("SELECT 1 FROM wheel_stages").fetchone()):
            return "idle:no-work"
        return None

    def __init__(self, bridge):
        self.bridge = bridge
        self.core = FactoryReservation(bridge.db)
        self.core.initialize()
        self.execution = None
        with bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""CREATE TABLE IF NOT EXISTS factory_team_selection (
                id INTEGER PRIMARY KEY CHECK(id=1), team TEXT NOT NULL CHECK(team IN ('PC1','PC2'))
            )""")
            db.execute("INSERT OR IGNORE INTO factory_team_selection VALUES(1,'PC1')")
            row = self.core._row(db)
            pending = (
                db.execute("SELECT 1 FROM wheel_control WHERE enabled=1").fetchone()
                or db.execute("SELECT 1 FROM factory_control WHERE enabled=1").fetchone()
                or db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                or db.execute("SELECT 1 FROM operations WHERE state IN "
                           "('prepared','sending','unknown','needs_review')").fetchone()
                or db.execute("SELECT 1 FROM wheel_stages WHERE state='claimed'").fetchone()
            )
            # An existing coordinator cannot claim a clean slate while a prior
            # publication, question, worker or external effect needs reconciliation.
            if row["state"] == "producing" or (row["state"] == "available" and pending):
                db.execute("UPDATE factory_reservation SET state='recovery' WHERE id=1")
            db.execute("""
                CREATE TRIGGER IF NOT EXISTS factory_reservation_wheel_guard
                BEFORE UPDATE OF enabled ON wheel_control WHEN NEW.enabled=1
                AND NOT EXISTS (SELECT 1 FROM factory_reservation WHERE id=1
                    AND team='PC1' AND state='producing')
                BEGIN SELECT RAISE(ABORT,'FACTORY_RESERVATION_REQUIRED'); END
            """)
            db.execute("""
                CREATE TRIGGER IF NOT EXISTS factory_reservation_legacy_guard
                BEFORE UPDATE OF enabled ON factory_control WHEN NEW.enabled=1
                AND NOT EXISTS (SELECT 1 FROM factory_reservation WHERE id=1
                    AND team='PC1' AND state='producing')
                BEGIN SELECT RAISE(ABORT,'FACTORY_RESERVATION_REQUIRED'); END
            """)

    def status(self):
        with self.bridge.db() as db:
            row = self.core._row(db)
            selected = db.execute("SELECT team FROM factory_team_selection WHERE id=1").fetchone()[0]
            checkpoint = db.execute("SELECT id,phase FROM wheel_checkpoints "
                                    "WHERE phase LIKE 'verified:%' ORDER BY id DESC LIMIT 1").fetchone()
            return {"selected_team": selected, "active_team": row["team"],
                    "state": row["state"], "generation": row["generation"],
                    "last_checkpoint": row["checkpoint"] or
                    (f"{checkpoint['id']} · {checkpoint['phase']}" if checkpoint else None)}

    def select(self, team):
        if team not in ("PC1", "PC2"):
            raise ReservationError("INVALID_TEAM", "Selecciona PC1 o PC2.")
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self.core._row(db)
            if row["state"] == "producing":
                raise ReservationError("FACTORY_BUSY", "Detén primero la ejecución activa.")
            db.execute("UPDATE factory_team_selection SET team=? WHERE id=1", (team,))
        return self.status()

    def activate_in(self, db):
        team = db.execute("SELECT team FROM factory_team_selection WHERE id=1").fetchone()[0]
        if team == "PC2":
            raise ReservationError("REMOTE_EXECUTOR_UNAVAILABLE",
                                   "PC2 aún no tiene un ejecutor autenticado y verificado.")
        row = self.core._row(db)
        if row["state"] == "available":
            self.execution = self.core.reserve_in(db, "PC1", lambda _db, _team: True)
        elif not self.execution or (
            row["team"], row["execution_id"], row["generation"]
        ) != (self.execution.team, self.execution.execution_id, self.execution.generation):
            raise ReservationError("RECOVERY_PENDING", "Concilia la reserva anterior antes de producir.")
        self.core.require_owner_in(db, self.execution)
        return self.execution

    def require_in(self, db):
        if not self.execution:
            raise ReservationError("RECOVERY_PENDING", "No se ha verificado el ejecutor de esta reserva.")
        return self.core.require_owner_in(db, self.execution)

    def stop_in(self, db):
        if self.execution:
            row = self.core._owned(db, self.execution)
            if row["state"] != "recovery":
                db.execute("UPDATE factory_reservation SET state='stopping' WHERE id=1")

    def release_stopped(self):
        if not self.execution:
            return False

        def verified(db, _execution):
            if (db.execute("SELECT 1 FROM wheel_control WHERE enabled=1").fetchone()
                    or db.execute("SELECT 1 FROM factory_control WHERE enabled=1").fetchone()
                    or db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()
                    or db.execute("SELECT 1 FROM operations WHERE state IN "
                                  "('prepared','sending','unknown','needs_review')").fetchone()
                    or db.execute("SELECT 1 FROM wheel_stages WHERE state='claimed'").fetchone()):
                return None
            return self.confirmed_checkpoint(db)

        self.core.release(self.execution, verified)
        self.execution = None
        return True

    def reconcile_stopped(self):
        """Owner-only caller: release a former process after authoritative local checks."""
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self.core._row(db)
            if row["state"] == "available":
                return self.status()
            if row["state"] not in ("stopping", "recovery"):
                raise ReservationError("STOP_REQUIRED", "Solicita primero la detención segura.")
            if (db.execute("SELECT 1 FROM wheel_control WHERE enabled=1").fetchone()
                    or db.execute("SELECT 1 FROM factory_control WHERE enabled=1").fetchone()
                    or db.execute("SELECT 1 FROM jobs WHERE state IN ('running','detached')").fetchone()):
                raise ReservationError("WORKER_STILL_ACTIVE", "Hay un ejecutor o una cola todavía activos.")
            if (db.execute("SELECT 1 FROM operations WHERE state IN "
                           "('prepared','sending','unknown','needs_review')").fetchone()
                    or db.execute("SELECT 1 FROM wheel_stages WHERE state='claimed'").fetchone()
                    or db.execute("SELECT 1 FROM factory_reservation_effects WHERE state='uncertain'").fetchone()):
                raise ReservationError("EFFECT_UNCERTAIN", "Hay efectos pendientes de conciliar.")
            confirmed = self.confirmed_checkpoint(db)
            if not confirmed:
                raise ReservationError("STOP_UNVERIFIED", "Falta un checkpoint confirmado.")
            db.execute("UPDATE factory_reservation SET state='available',team=NULL,"
                       "execution_id=NULL,checkpoint=? WHERE id=1", (confirmed,))
            self.execution = None
        return self.status()
