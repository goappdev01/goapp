from contextlib import contextmanager
from pathlib import Path
import sqlite3
import tempfile
import unittest

from factory_reservation import ReservationError
from factory_reservation_runtime import ReservationRuntime


class BridgeStub:
    def __init__(self, path):
        self.path = path
        with self.db() as db:
            db.executescript("""
                CREATE TABLE wheel_control(id INTEGER PRIMARY KEY,enabled INTEGER,reason TEXT);
                INSERT INTO wheel_control VALUES(1,0,NULL);
                CREATE TABLE factory_control(id INTEGER PRIMARY KEY,enabled INTEGER);
                INSERT INTO factory_control VALUES(1,0);
                CREATE TABLE jobs(id TEXT,state TEXT);
                CREATE TABLE operations(id TEXT,state TEXT);
                CREATE TABLE wheel_stages(grant_id TEXT,letter TEXT,state TEXT);
                CREATE TABLE wheel_checkpoints(id INTEGER PRIMARY KEY,phase TEXT);
            """)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.bridge = BridgeStub(Path(root.name) / "coordinator.sqlite3")

    def test_legacy_enable_cannot_skip_the_reservation(self):
        runtime = ReservationRuntime(self.bridge)
        with self.assertRaises(sqlite3.IntegrityError):
            with self.bridge.db() as db:
                db.execute("UPDATE wheel_control SET enabled=1 WHERE id=1")
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            first = runtime.activate_in(db)
            db.execute("UPDATE wheel_control SET enabled=1 WHERE id=1")
        self.assertEqual(first.team, "PC1")
        self.assertEqual(runtime.status()["state"], "producing")
        with self.assertRaises(ReservationError) as caught:
            runtime.select("PC2")
        self.assertEqual(caught.exception.code, "FACTORY_BUSY")

    def test_pc2_cannot_start_without_a_verified_executor(self):
        runtime = ReservationRuntime(self.bridge)
        runtime.select("PC2")
        with self.assertRaises(ReservationError) as caught:
            with self.bridge.db() as db:
                db.execute("BEGIN IMMEDIATE")
                runtime.activate_in(db)
        self.assertEqual(caught.exception.code, "REMOTE_EXECUTOR_UNAVAILABLE")
        self.assertEqual(runtime.status()["state"], "available")

    def test_pause_keeps_lock_and_verified_empty_stop_releases(self):
        runtime = ReservationRuntime(self.bridge)
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            runtime.activate_in(db)
            db.execute("UPDATE wheel_control SET enabled=1 WHERE id=1")
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_control SET enabled=0 WHERE id=1")
        self.assertEqual(runtime.status()["state"], "producing")
        with self.bridge.db() as db:
            runtime.stop_in(db)
        self.assertTrue(runtime.release_stopped())
        self.assertEqual(runtime.status()["last_checkpoint"], "idle:no-work")
        self.assertEqual(runtime.status()["state"], "available")

    def test_active_control_prevents_release_after_stop_request(self):
        runtime = ReservationRuntime(self.bridge)
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            runtime.activate_in(db)
            db.execute("UPDATE wheel_control SET enabled=1 WHERE id=1")
        with self.bridge.db() as db:
            runtime.stop_in(db)
        with self.assertRaises(ReservationError) as caught:
            runtime.release_stopped()
        self.assertEqual(caught.exception.code, "STOP_UNVERIFIED")
        self.assertEqual(runtime.status()["state"], "stopping")

    def test_pending_publication_survives_startup_and_blocks_new_work(self):
        with self.bridge.db() as db:
            db.execute("INSERT INTO wheel_stages VALUES('old-grant','B','claimed')")
            db.execute("INSERT INTO operations VALUES('old-comment','prepared')")
        runtime = ReservationRuntime(self.bridge)
        self.assertEqual(runtime.status()["state"], "recovery")
        with self.assertRaises(ReservationError) as caught:
            with self.bridge.db() as db:
                db.execute("BEGIN IMMEDIATE")
                runtime.activate_in(db)
        self.assertEqual(caught.exception.code, "RECOVERY_PENDING")
        with self.bridge.db() as db:
            self.assertEqual(db.execute("SELECT state FROM operations WHERE id='old-comment'").fetchone()[0], "prepared")
        with self.assertRaises(ReservationError) as blocked:
            runtime.reconcile_stopped()
        self.assertEqual(blocked.exception.code, "EFFECT_UNCERTAIN")
        with self.bridge.db() as db:
            db.execute("UPDATE wheel_stages SET state='verified' WHERE grant_id='old-grant'")
            db.execute("UPDATE operations SET state='verified' WHERE id='old-comment'")
            db.execute("INSERT INTO wheel_checkpoints VALUES(1,'verified:B')")
        self.assertEqual(runtime.reconcile_stopped()["state"], "available")
        self.assertEqual(runtime.status()["last_checkpoint"], "1:verified:B")

    def test_restart_requires_owner_reconciliation_before_another_execution(self):
        first = ReservationRuntime(self.bridge)
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            first.activate_in(db)
        restarted = ReservationRuntime(self.bridge)
        self.assertEqual(restarted.status()["state"], "recovery")
        with self.assertRaises(ReservationError):
            with self.bridge.db() as db:
                db.execute("BEGIN IMMEDIATE")
                restarted.activate_in(db)
        self.assertEqual(restarted.reconcile_stopped()["state"], "available")

    def test_newer_unverified_checkpoint_retains_reservation(self):
        runtime = ReservationRuntime(self.bridge)
        with self.bridge.db() as db:
            db.execute("BEGIN IMMEDIATE")
            runtime.activate_in(db)
            runtime.stop_in(db)
            db.execute("INSERT INTO wheel_checkpoints VALUES(1,'verified:A')")
            db.execute("INSERT INTO wheel_checkpoints VALUES(2,'FACTORY_METRO_UNVERIFIED')")
        with self.assertRaises(ReservationError) as caught:
            runtime.release_stopped()
        self.assertEqual(caught.exception.code, "STOP_UNVERIFIED")
        self.assertEqual(runtime.status()["state"], "stopping")


if __name__ == "__main__":
    unittest.main()
