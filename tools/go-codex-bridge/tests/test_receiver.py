import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from puente import BridgeError, digest
from test_bridge import BridgeTests

CARD = "a" * 24
AUTHOR = "b" * 24

class ReceiverTests(unittest.TestCase):
    setUp = BridgeTests.setUp
    tearDown = BridgeTests.tearDown

    def bind(self):
        self.bridge.read_card = lambda url: {"data": {"card":{"id":CARD},
            "comments":[{"id":"1"*24}], "verification":{"stable_during_read":True}}}
        return self.bridge.configure_receiver("https://trello.com/c/1uXs7ZNL", AUTHOR)

    def comment(self, number, author=AUTHOR, instruction="Trabajo sintético", good=True):
        body={"request_id":"12345678-1234-1234-1234-123456789abc","origin":"CHATGPT","agent":"4",
              "instruction":instruction,"sha256":digest(instruction) if good else "0"*64}
        return {"id":format(number,"024x"),"type":"commentCard","idMemberCreator":author,
                "date":"2026-11-06T12:00:00Z","data":{"text":"GO_PUENTE_CHATGPT_V1\n"+json.dumps(body)}}

    def test_disabled_default_old_comment_ignored_author_rejected_and_no_execution(self):
        self.assertFalse(self.bridge.receiver_status()["enabled"])
        with self.assertRaises(BridgeError): self.bridge.check_receiver()
        self.bind()
        self.bridge.set_receiver_enabled(True)
        rows=[self.comment(int("1"*24,16)),self.comment(int("2"*24,16),author="c"*24),
              self.comment(int("3"*24,16),good=False),self.comment(int("4"*24,16))]
        self.bridge.api=lambda path,query=None,**kw: {"id":CARD,"dateLastActivity":"stable"} if path.endswith(CARD) else list(reversed(rows))
        result=self.bridge.check_receiver()
        self.assertEqual(len(result["prepared"]),1)
        self.assertFalse(result["automatic_execution"])
        self.assertEqual(self.bridge.job(result["prepared"][0])["data"]["source"]["source"],"CHATGPT_VIA_TRELLO")
        self.assertEqual(self.bridge.check_receiver()["prepared"],[])
        rows.append(self.comment(int("5"*24,16),instruction="Otro texto, mismo request_id"))
        self.assertEqual(self.bridge.check_receiver()["prepared"],[])
        with self.bridge.db() as db:
            self.assertEqual(db.execute("select count(*) from jobs").fetchone()[0],1)
            self.assertEqual(db.execute("select count(*) from approvals").fetchone()[0],0)
            self.assertEqual(db.execute("select count(*) from receiver_seen where status='rejected'").fetchone()[0],3)

    def test_restart_preserves_baseline_and_seen_without_replay(self):
        self.bind();self.bridge.set_receiver_enabled(True)
        rows=[self.comment(int("4"*24,16))]
        self.bridge.api=lambda path,query=None,**kw: {"id":CARD,"dateLastActivity":"stable"} if path.endswith(CARD) else rows
        first=self.bridge.check_receiver()["prepared"]
        from puente import Bridge
        from test_bridge import TestProtector
        restored=Bridge(self.home,self.home/"private",TestProtector(),self.bridge.transport,
                        {"windows_sid":"S-1-5-TEST","source":"unit-test"})
        restored.api=self.bridge.api
        self.assertEqual(restored.check_receiver()["prepared"],[])
        self.assertEqual(restored.job(first[0])["state"],"prepared")

    def test_unstable_card_or_unconfigured_receiver_cannot_prepare(self):
        with self.assertRaises(BridgeError):self.bridge.set_receiver_enabled(True)
        self.bind();self.bridge.set_receiver_enabled(True)
        calls=iter([{"id":CARD,"dateLastActivity":"before"},[self.comment(int("4"*24,16))],
                    {"id":CARD,"dateLastActivity":"after"}])
        self.bridge.api=lambda *args,**kw:next(calls)
        with self.assertRaises(BridgeError):self.bridge.check_receiver()
        with self.bridge.db() as db:self.assertEqual(db.execute("select count(*) from jobs").fetchone()[0],0)

if __name__=="__main__":unittest.main()
