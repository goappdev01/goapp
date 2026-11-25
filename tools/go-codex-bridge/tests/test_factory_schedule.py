"""Scheduled activation tests use a temporary SQLite file and no production worker."""
from contextlib import contextmanager
import datetime as dt
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock

from factory_schedule import FactorySchedule
from remote_panel import RemotePanel


class ScheduleError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code=code


class Bridge:
    def __init__(self, path):
        self.path=Path(path)
        self.events=[]
        self.account_id="a"*64

    def codex_account(self):
        return self.account_id,"a•••@e•••"

    @contextmanager
    def db(self):
        connection=sqlite3.connect(self.path)
        connection.row_factory=sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def sign(self, value):
        return hmac.new(b"synthetic-test-key",json.dumps(value,sort_keys=True).encode(),hashlib.sha256).hexdigest()

    def audit(self, event, data, db):
        self.events.append((event,data))


class Panel:
    def __init__(self, path):
        self.b=Bridge(path)
        self.f=Mock(lock=threading.RLock(),utc=lambda:dt.datetime.now(dt.timezone.utc).isoformat())
        self.w=Mock()
        self.w.enabled.return_value=False
        self.w.live_policy.return_value={"codex_identity":self.b.account_id}
        self.w.fail.side_effect=lambda code,message: (_ for _ in ()).throw(ScheduleError(code,message))
        self.orbit_control=Mock(return_value={"enabled":True})
        self.schedule_accounts=Mock(return_value={"accounts":[
            {"id":self.b.account_id,"label":"a•••@e•••","authorized":True,"session_active":True}]})


class FactoryScheduleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.panel=Panel(Path(self.tmp.name)/"coordinator.sqlite3")
        self.scheduler=FactorySchedule(self.panel)
        self.due=dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=5)

    def tearDown(self):
        self.tmp.cleanup()

    def schedule(self):
        return self.scheduler.set(self.due.isoformat(),"PROGRAMAR ACTIVACIÓN",
                                  "test-owner",self.panel.b.account_id)

    def test_explicit_confirmation_and_persistent_single_schedule(self):
        with self.assertRaises(ScheduleError):
            self.scheduler.set(self.due.isoformat(),"", "test-owner",self.panel.b.account_id)
        self.assertEqual(self.scheduler.status()["state"],"none")
        self.assertEqual(self.schedule()["state"],"scheduled")
        self.assertEqual(self.scheduler.status()["account"],"a•••@e•••")
        self.assertEqual(FactorySchedule(self.panel).status()["state"],"scheduled")
        with self.assertRaises(ScheduleError) as error:
            self.schedule()
        self.assertEqual(error.exception.code,"FACTORY_SCHEDULE_EXISTS")
        self.panel.orbit_control.assert_not_called()

    def test_due_uses_existing_power_path_once(self):
        self.schedule()
        due=self.due.timestamp()
        self.assertFalse(self.scheduler.tick(due-1))
        self.assertTrue(self.scheduler.tick(due+1))
        self.assertFalse(self.scheduler.tick(due+2))
        self.panel.orbit_control.assert_called_once_with("power",{"enabled":True},"scheduled-owner")
        self.assertEqual(self.scheduler.status()["state"],"completed")

    def test_session_or_quota_failure_does_not_retry(self):
        self.schedule()
        self.panel.orbit_control.side_effect=ScheduleError("WHEEL_CODEX_QUOTA","No quota")
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+1))
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+2))
        self.assertEqual(self.scheduler.status()["reason"],"WHEEL_CODEX_QUOTA")
        self.panel.orbit_control.assert_called_once()
        self.schedule()
        self.panel.orbit_control.reset_mock()
        self.panel.orbit_control.side_effect=ScheduleError("WHEEL_CODEX_SESSION_CHANGED","Different account")
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+1))
        self.assertEqual(self.scheduler.status()["reason"],"WHEEL_CODEX_SESSION_CHANGED")
        self.panel.orbit_control.assert_called_once()

    def test_selected_account_must_match_session_and_live_binding(self):
        self.schedule()
        self.panel.b.account_id="b"*64
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+1))
        self.assertEqual(self.scheduler.status()["reason"],"FACTORY_SCHEDULE_ACCOUNT_MISMATCH")
        self.panel.orbit_control.assert_not_called()
        self.panel.b.account_id="a"*64
        self.schedule()
        self.panel.w.live_policy.return_value={"codex_identity":"b"*64}
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+1))
        self.assertEqual(self.scheduler.status()["reason"],"FACTORY_SCHEDULE_ACCOUNT_UNBOUND")
        self.panel.orbit_control.assert_not_called()

    def test_unrecognized_account_cannot_be_scheduled(self):
        with self.assertRaises(ScheduleError) as error:
            self.scheduler.set(self.due.isoformat(),"PROGRAMAR ACTIVACIÓN",
                               "test-owner","b"*64)
        self.assertEqual(error.exception.code,"FACTORY_SCHEDULE_ACCOUNT_UNKNOWN")
        self.assertEqual(self.scheduler.status()["state"],"none")

    def test_account_selector_only_lists_bound_and_codex_detected(self):
        self.panel.w.live_policy.return_value={"codex_identity":"b"*64,
                                               "codex_account_label":"b•••@e•••"}
        accounts=RemotePanel.schedule_accounts(self.panel)["accounts"]
        self.assertEqual([item["id"] for item in accounts],["b"*64,"a"*64])
        self.assertTrue(accounts[0]["authorized"])
        self.assertFalse(accounts[1]["authorized"])
        self.assertTrue(accounts[1]["session_active"])
        self.assertNotIn("password",str(accounts).lower())

    def test_cancel_and_pause_keep_factory_idle(self):
        self.schedule()
        self.scheduler.cancel_on_pause()
        self.assertEqual(self.scheduler.status()["state"],"cancelled")
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+1))
        self.panel.orbit_control.assert_not_called()
        self.schedule()
        self.scheduler.cancel("CANCELAR ACTIVACIÓN")
        self.assertEqual(self.scheduler.status()["state"],"cancelled")

    def test_missed_time_and_interrupted_claim_do_not_start(self):
        self.schedule()
        self.assertFalse(self.scheduler.tick(self.due.timestamp()+61))
        self.assertEqual(self.scheduler.status()["reason"],"FACTORY_SCHEDULE_MISSED")
        self.panel.orbit_control.assert_not_called()
        self.schedule()
        with self.panel.b.db() as db:
            row=db.execute("SELECT * FROM factory_activation_schedule").fetchone()
            self.scheduler._transition(db,row,"firing",None)
        self.assertEqual(FactorySchedule(self.panel).status()["reason"],"FACTORY_SCHEDULE_INTERRUPTED")
        self.panel.orbit_control.assert_not_called()

    def test_tampered_schedule_fails_closed(self):
        self.schedule()
        with self.panel.b.db() as db:
            db.execute("UPDATE factory_activation_schedule SET due_utc=? WHERE id=1",
                       ((self.due-dt.timedelta(minutes=4)).isoformat(),))
        with self.assertRaises(ScheduleError) as error:
            self.scheduler.tick(self.due.timestamp()+1)
        self.assertEqual(error.exception.code,"FACTORY_SCHEDULE_INVALID")
        self.panel.orbit_control.assert_not_called()

    def test_legacy_schedule_preserved_but_cannot_start_without_account(self):
        legacy=Panel(Path(self.tmp.name)/"legacy.sqlite3")
        due=self.due.isoformat()
        with legacy.b.db() as db:
            db.execute("""CREATE TABLE factory_activation_schedule (
                id INTEGER PRIMARY KEY, due_utc TEXT, state TEXT, principal_hash TEXT,
                signature TEXT, reason TEXT, updated TEXT)""")
            owner=legacy.b.sign({"scheduled_by":"test-owner"})
            signature=legacy.b.sign({"kind":"factory-activation-v1","due_utc":due,
                                     "state":"scheduled","principal_hash":owner})
            db.execute("INSERT INTO factory_activation_schedule VALUES(1,?,?,?,?,?,?)",
                       (due,"scheduled",owner,signature,None,"synthetic"))
        scheduler=FactorySchedule(legacy)
        self.assertTrue(scheduler.status()["account_required"])
        self.assertFalse(scheduler.tick(self.due.timestamp()+1))
        self.assertEqual(scheduler.status()["reason"],"FACTORY_SCHEDULE_ACCOUNT_REQUIRED")
        legacy.orbit_control.assert_not_called()


if __name__=="__main__":
    unittest.main()
