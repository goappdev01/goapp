from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
import sqlite3
import tempfile
from threading import Barrier
import unittest

from factory_reservation import Execution, FactoryReservation, ReservationError


class FactoryReservationTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.path = Path(root.name) / "coordinator.sqlite3"
        self.online = True
        self.coordinator = FactoryReservation(self.connect)
        self.coordinator.initialize()

    @contextmanager
    def connect(self):
        if not self.online:
            raise ConnectionError("coordinator unavailable")
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def begin(self, team):
        return self.coordinator.reserve(team, lambda db, selected: selected == team)

    def assert_code(self, code, action):
        with self.assertRaises(ReservationError) as caught:
            action()
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_simultaneous_starts_have_one_winner_and_one_confirmation(self):
        ready = Barrier(2)
        confirmations = []

        def attempt(team):
            ready.wait(timeout=5)
            try:
                return FactoryReservation(self.connect).reserve(
                    team, lambda db, selected: confirmations.append(selected) is None
                )
            except ReservationError as failure:
                return failure

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(attempt, ("PC1", "PC2")))
        winner = next(result for result in results if isinstance(result, Execution))
        rejected = next(result for result in results if isinstance(result, ReservationError))
        self.assertEqual(confirmations, [winner.team])
        self.assertEqual(rejected.code, "FACTORY_BUSY")
        self.assertIn(winner.team, str(rejected))
        self.assertEqual(self.coordinator.status()["team"], winner.team)

    def test_denied_confirmation_is_rolled_back(self):
        with self.connect() as db:
            db.execute("CREATE TABLE approvals_used (team TEXT)")

        def denied(db, team):
            db.execute("INSERT INTO approvals_used VALUES(?)", (team,))
            return False

        self.assert_code("START_NOT_AUTHORIZED", lambda: self.coordinator.reserve("PC1", denied))
        with self.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM approvals_used").fetchone()[0], 0)
        self.assertEqual(self.begin("PC2").generation, 1)

    def test_stop_keeps_reservation_until_verified_drain_in_both_directions(self):
        first = self.begin("PC1")
        self.assertEqual(self.coordinator.admit_work(first, lambda db, execution: execution.team), "PC1")
        self.coordinator.stop(first)
        self.assert_code("PRODUCTION_PAUSED", lambda: self.coordinator.admit_work(first, lambda *_: self.fail()))
        self.assert_code("FACTORY_BUSY", lambda: self.begin("PC2"))
        spoof = Execution("PC2", first.execution_id, first.generation)
        self.assert_code("NOT_EXECUTION_OWNER", lambda: self.coordinator.release(spoof, lambda *_: self.fail()))
        self.assert_code("STOP_UNVERIFIED", lambda: self.coordinator.release(first, lambda *_: None))
        self.coordinator.release(first, lambda db, execution: "checkpoint-a")
        self.assertEqual(self.coordinator.status()["checkpoint"], "checkpoint-a")
        second = self.begin("PC2")
        self.assertEqual(second.generation, first.generation + 1)
        self.assert_code("FACTORY_BUSY", lambda: self.begin("PC1"))
        self.assert_code("NOT_EXECUTION_OWNER", lambda: self.coordinator.stop(first))

    def test_network_loss_and_restart_hold_reservation(self):
        first = self.begin("PC1")
        self.online = False
        with self.assertRaises(ConnectionError):
            self.begin("PC2")
        with self.assertRaises(ConnectionError):
            self.coordinator.admit_work(first, lambda *_: self.fail())
        self.online = True
        restarted = FactoryReservation(self.connect)
        restarted.initialize()
        self.assertEqual(restarted.status()["execution_id"], first.execution_id)
        self.assert_code("FACTORY_BUSY", lambda: restarted.reserve("PC2", lambda *_: True))
        restarted.connection_lost(first)
        restarted.stop(first)
        self.assertEqual(restarted.status()["state"], "recovery")
        self.assert_code("RECOVERY_PENDING", lambda: restarted.reserve("PC2", lambda *_: True))
        restarted.release(first, lambda *_: "checkpoint-recovered")
        self.assertEqual(self.begin("PC2").generation, 2)

    def test_uncertain_effect_never_replays_and_verified_effect_survives_handoff(self):
        first = self.begin("PC1")
        effect = "card1/attempt1/comment"
        self.assertTrue(self.coordinator.reserve_effect(first, effect, "payload-A"))
        self.assert_code("EFFECT_UNCERTAIN", lambda: self.coordinator.reserve_effect(first, effect, "payload-A"))
        self.coordinator.stop(first)
        self.assert_code("EFFECT_UNCERTAIN", lambda: self.coordinator.release(first, lambda *_: self.fail()))
        self.assert_code("EFFECT_UNCERTAIN", lambda: self.coordinator.reconcile_effect(first, effect, lambda _: None))
        self.coordinator.reconcile_effect(first, effect, lambda _: "verified")
        self.coordinator.release(first, lambda *_: "checkpoint-effect")
        second = self.begin("PC2")
        self.assertFalse(self.coordinator.reserve_effect(second, effect, "payload-A"))
        self.assert_code("EFFECT_CHANGED", lambda: self.coordinator.reserve_effect(second, effect, "payload-B"))

    def test_authoritative_absence_allows_an_explicit_retry(self):
        first = self.begin("PC2")
        effect = "card1/attempt1/push"
        self.assertTrue(self.coordinator.reserve_effect(first, effect, "sha-A"))
        self.coordinator.reconcile_effect(first, effect, lambda _: "absent")
        self.assertTrue(self.coordinator.reserve_effect(first, effect, "sha-A"))
        self.assert_code("EFFECT_UNCERTAIN", lambda: self.coordinator.reserve_effect(first, effect, "sha-A"))


if __name__ == "__main__":
    unittest.main()
