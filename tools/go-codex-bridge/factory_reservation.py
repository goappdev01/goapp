"""Durable reservation protocol for the coordinator's local SQLite database.

The application must call it only after authenticating the owner or worker.
The worker never opens this database over the network.
"""
from dataclasses import dataclass
from uuid import uuid4


TEAMS = {"PC1": "PC1 — RAÚL", "PC2": "PC2 — TESO"}


class ReservationError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class Execution:
    team: str
    execution_id: str
    generation: int


class FactoryReservation:
    def __init__(self, connect):
        # Bridge.db and the test adapter both close each connection on exit.
        self.connect = connect

    def initialize(self):
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS factory_reservation (
                    id INTEGER PRIMARY KEY CHECK(id=1),
                    generation INTEGER NOT NULL DEFAULT 0,
                    team TEXT,
                    execution_id TEXT,
                    state TEXT NOT NULL CHECK(state IN ('available','producing','stopping','recovery')),
                    checkpoint TEXT
                );
                INSERT OR IGNORE INTO factory_reservation(id, state) VALUES(1, 'available');
                CREATE TABLE IF NOT EXISTS factory_reservation_effects (
                    effect_id TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    execution_id TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('uncertain','verified','absent'))
                );
            """)

    @staticmethod
    def _row(db):
        row = db.execute("SELECT * FROM factory_reservation WHERE id=1").fetchone()
        if row is None:
            raise ReservationError("COORDINATOR_UNAVAILABLE", "No se puede verificar la reserva de la fábrica.")
        return row

    def status(self):
        with self.connect() as db:
            return dict(self._row(db))

    def reserve(self, team, authorize):
        """Authorize under the write lock. Rollback includes consumption of the approval."""
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            return self.reserve_in(db, team, authorize)

    def reserve_in(self, db, team, authorize):
        """Reserve inside the caller's activation transaction."""
        if team not in TEAMS:
            raise ReservationError("INVALID_TEAM", "Selecciona PC1 o PC2.")
        current = self._row(db)
        if current["state"] != "available":
            if current["state"] == "recovery":
                raise ReservationError("RECOVERY_PENDING", "La fábrica requiere recuperación verificada.")
            raise ReservationError(
                "FACTORY_BUSY",
                f"Fábrica ocupada. La producción está activa en {TEAMS[current['team']]}. "
                "Deténla de forma segura antes de cambiar de ordenador.",
            )
        if not authorize(db, team):
            raise ReservationError("START_NOT_AUTHORIZED", "Confirma la ejecución en el equipo seleccionado.")
        execution = Execution(team, uuid4().hex, current["generation"] + 1)
        db.execute("""
            UPDATE factory_reservation SET team=?, execution_id=?, generation=?, state='producing'
            WHERE id=1
        """, (execution.team, execution.execution_id, execution.generation))
        return execution

    def _owned(self, db, execution):
        row = self._row(db)
        if (row["team"], row["execution_id"], row["generation"]) != (
            execution.team, execution.execution_id, execution.generation
        ):
            raise ReservationError("NOT_EXECUTION_OWNER", "La reserva pertenece a otra ejecución.")
        return row

    def require_owner_in(self, db, execution):
        row = self._owned(db, execution)
        if row["state"] != "producing":
            raise ReservationError("PRODUCTION_PAUSED", "La ejecución no admite nuevos trabajos.")
        return row

    def admit_work(self, execution, admit):
        """Record a new job atomically with the ownership and stopping checks."""
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._owned(db, execution)
            if row["state"] != "producing":
                raise ReservationError("PRODUCTION_PAUSED", "La ejecución no admite nuevos trabajos.")
            return admit(db, execution)

    def _pause(self, execution, state):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._owned(db, execution)
            if row["state"] != "recovery":
                db.execute("UPDATE factory_reservation SET state=? WHERE id=1", (state,))

    def stop(self, execution):
        self._pause(execution, "stopping")

    def connection_lost(self, execution):
        self._pause(execution, "recovery")

    def reserve_effect(self, execution, effect_id, fingerprint):
        """Persist uncertainty before an external effect. False means already verified."""
        if not effect_id or not fingerprint:
            raise ReservationError("EFFECT_ID_REQUIRED", "Falta identificar la operación.")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._owned(db, execution)
            if row["state"] != "producing":
                raise ReservationError("PRODUCTION_PAUSED", "La ejecución no admite nuevos efectos.")
            existing = db.execute(
                "SELECT * FROM factory_reservation_effects WHERE effect_id=?", (effect_id,)
            ).fetchone()
            if existing:
                if existing["fingerprint"] != fingerprint:
                    raise ReservationError("EFFECT_CHANGED", "La operación no coincide con la ya registrada.")
                if existing["state"] == "verified":
                    return False
                if existing["state"] == "uncertain":
                    raise ReservationError("EFFECT_UNCERTAIN", "Comprueba el resultado de la operación antes de reintentar.")
                db.execute("""
                    UPDATE factory_reservation_effects SET execution_id=?, state='uncertain'
                    WHERE effect_id=?
                """, (execution.execution_id, effect_id))
            else:
                db.execute(
                    "INSERT INTO factory_reservation_effects VALUES (?, ?, ?, 'uncertain')",
                    (effect_id, fingerprint, execution.execution_id),
                )
            return True

    def reconcile_effect(self, execution, effect_id, verify):
        """verify is an authoritative read by the coordinator, not a worker's assertion."""
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self._owned(db, execution)
            effect = db.execute(
                "SELECT * FROM factory_reservation_effects WHERE effect_id=? AND execution_id=? AND state='uncertain'",
                (effect_id, execution.execution_id),
            ).fetchone()
            if not effect:
                raise ReservationError("EFFECT_NOT_OWNED", "No existe una operación pendiente de esta ejecución.")
            result = verify(dict(effect))
            if result not in ("verified", "absent"):
                raise ReservationError("EFFECT_UNCERTAIN", "No se puede acreditar el resultado de la operación.")
            db.execute("UPDATE factory_reservation_effects SET state=? WHERE effect_id=?", (result, effect_id))

    def release(self, execution, verify_stop):
        """verify_stop supplies a confirmed checkpoint after verifying no live jobs or effects."""
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self._owned(db, execution)
            if row["state"] not in ("stopping", "recovery"):
                raise ReservationError("STOP_REQUIRED", "Solicita primero la detención segura.")
            if db.execute("SELECT 1 FROM factory_reservation_effects WHERE state='uncertain'").fetchone():
                raise ReservationError("EFFECT_UNCERTAIN", "Hay operaciones sin conciliar.")
            checkpoint = verify_stop(db, execution)
            if not isinstance(checkpoint, str) or not checkpoint.strip():
                raise ReservationError("STOP_UNVERIFIED", "No se ha verificado la detención y el checkpoint.")
            db.execute("""
                UPDATE factory_reservation SET team=NULL, execution_id=NULL, state='available', checkpoint=?
                WHERE id=1
            """, (checkpoint,))
