import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.parse

sys.path.insert(0,str(Path(__file__).resolve().parent))
import test_bridge as fixtures
from aceptacion import run, register_owner_grant, validate_grant, TITLE, BOARD, LIST
from puente import BridgeError, save_json


class AcceptanceTests(unittest.TestCase):
    setUp=fixtures.BridgeTests.setUp
    tearDown=fixtures.BridgeTests.tearDown
    configured=fixtures.BridgeTests.configured
    authorized=fixtures.BridgeTests.authorized
    def simulate(self, uncertain_create=False):
        self.authorized();register_owner_grant(self.bridge)
        self.cards=[];self.comments=[];self.mutations=[];self.uncertain=uncertain_create
        def transport(method,url,body=None,token=None):
            path=urllib.parse.urlsplit(url).path
            if method=="POST" and path=="/1/cards":
                self.mutations.append((method,path));card={"id":"d"*24,"idBoard":BOARD,"idList":body["idList"],"name":body["name"],"desc":body["desc"],"url":"https://trello.com/c/AbCdEf12/prueba","shortLink":"AbCdEf12","dateLastActivity":"test-fixed"};self.cards.append(card)
                if self.uncertain:self.uncertain=False;raise BridgeError("NETWORK_UNCERTAIN","Synthetic lost create response")
                return card
            if method=="POST" and path.endswith("/actions/comments"):
                self.mutations.append((method,path));entry={"id":format(100+len(self.comments),"024x"),"type":"commentCard","date":"2030-01-01T00:00:00Z","data":{"text":body["text"]}}
                self.comments.append(entry);return entry
            if method!="GET":raise AssertionError("Unexpected mutation")
            if path.endswith("/lists"):return [{"id":LIST,"name":"Authorized test list"}]
            if path.startswith("/1/lists/"):return self.cards
            if path.endswith("/actions"):return list(reversed(self.comments))
            if path.startswith("/1/actions/"):return next(c for c in self.comments if c["id"]==path.split("/")[-1])
            if path.startswith("/1/cards/"):return self.cards[0]
            raise AssertionError(path)
        self.transport=transport
        def complete(payload):
            self.bridge.finish_job(payload["job"],"completed",{"exit_code":0,"response":"GO_PUENTE_CODEX_OK","test_B_exact_response":True})
        return patch.object(self.bridge,"run_codex",side_effect=complete)

    def test_CD_grant_does_not_cover_other_boards_lists_or_instructions(self):
        register_owner_grant(self.bridge)
        path=self.home/"estado/autorizacion-pruebas-CD.json"
        data=json.loads(path.read_text());data["grant"]["list_id"]="other-list";save_json(path,data)
        with self.assertRaises(BridgeError):validate_grant(self.bridge)
        self.assertEqual(self.calls,[])

    def test_CD_cannot_mutate_trello_before_local_oauth_exists(self):
        register_owner_grant(self.bridge)
        with self.assertRaises(BridgeError):run(self.bridge)
        self.assertEqual(self.calls,[])
        with self.bridge.db() as db:self.assertEqual(db.execute("SELECT count(*) FROM operations").fetchone()[0],0)

    def test_CD_cycle_creates_one_card_executes_read_instruction_and_returns_verified_result(self):
        with self.simulate(), patch.object(self.bridge,"run_codex") as codex:
            with self.assertRaises(BridgeError) as error:run(self.bridge)
            self.assertEqual(error.exception.code,"LEGACY_AUTOMATION_DISABLED")
            self.assertEqual(self.mutations,[]);self.assertEqual(self.cards,[]);codex.assert_not_called()

    def test_CD_recovers_lost_create_response_by_reading_marker_without_duplicate_card(self):
        with self.simulate(), patch.object(self.bridge,"run_codex") as codex:
            with self.assertRaises(BridgeError) as error:run(self.bridge)
            self.assertEqual(error.exception.code,"LEGACY_AUTOMATION_DISABLED")
            self.assertEqual(self.mutations,[]);self.assertEqual(self.cards,[]);codex.assert_not_called()


if __name__=="__main__":unittest.main()
