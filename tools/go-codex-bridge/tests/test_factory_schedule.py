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


class ScheduleError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code=code


class Bridge:
    def __init__(self, path):
        self.path=Path(path)
        self.events=[]

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
        self.w.fail.side_effect=lambda code,message: (_ for _ in ()).throw(ScheduleError(code,message))
        self.orbit_control=Mock(return_value={"enabled":True})


class FactoryScheduleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.panel=Panel(Path(self.tmp.name)/"coordinator.sqlite3")
        self.scheduler=FactorySchedule(self.panel)
        self.due=dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=5)

    def tearDown(self):
        self.tmp.cleanup()

    def schedule(self):
        return self.scheduler.set(self.due.isoformat(),"PROGRAMAR ACTIVACIÓN","test-owner")

    def test_explicit_confirmation_and_persistent_single_schedule(self):
        with self.assertRaises(ScheduleError):
            self.scheduler.set(self.due.isoformat(),"", "test-owner")
        self.assertEqual(self.scheduler.status()["state"],"none")
        self.assertEqual(self.schedule()["state"],"scheduled")
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


if __name__=="__main__":
    unittest.main()
