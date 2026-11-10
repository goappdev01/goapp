"""Exercise the real HTTP authorization handlers on a disposable loopback server."""
import http.client
import json
import socket
import threading
import time
import unittest
from unittest.mock import Mock,patch
import puente
import test_bridge as fixtures
import test_safety as safety_fixtures
from factory import CHECK

class HttpSafetyTests(unittest.TestCase):
    setUp=fixtures.BridgeTests.setUp
    tearDown=fixtures.BridgeTests.tearDown
    queue=safety_fixtures.SafetyTests.queue

    def test_four_actions_require_four_human_approvals_through_real_routes(self):
        b=self.queue();b.owner_confirmation=Mock(return_value=True)
        (self.home/"panel.html").write_text("<!doctype html><title>Disposable loopback test</title>",encoding="utf-8")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        b.config["port"]=port;holder={};created=threading.Event();real=puente.LocalBridgeServer
        def capture(*args):
            holder["server"]=real(*args);created.set();return holder["server"]
        with patch.object(puente,"LocalBridgeServer",side_effect=capture):
            thread=threading.Thread(target=puente.server,args=(b,False),daemon=True);thread.start();self.assertTrue(created.wait(3))
        origin="http://localhost:"+str(port)
        def request(method,path,body=None,headers=None):
            conn=http.client.HTTPConnection("127.0.0.1",port,timeout=3)
            try:
                conn.request(method,path,json.dumps(body) if body is not None else None,{"Host":"localhost:"+str(port),"Content-Type":"application/json",**(headers or {})})
                result=conn.getresponse();raw=result.read();return result.status,dict(result.getheaders()),raw
            finally:conn.close()
        def post(path,body):
            status,_,raw=request("POST",path,body,base);return status,json.loads(raw)
        try:
            code,headers,_=request("GET","/");self.assertEqual(code,200)
            cookie=headers["Set-Cookie"].split(";",1)[0]
            code,_,raw=request("GET","/api/status",headers={"Cookie":cookie});state=json.loads(raw)
            base={"Cookie":cookie,"Origin":origin,"X-GO-CSRF":state["csrf"]}
            self.assertFalse(state["automatic_execution"]);self.assertFalse(state["factory"]["enabled"])
            self.assertTrue(post("/api/factory/check",{})[1]["read_only"])
            code,job=post("/api/prepare-chatgpt",{"instruction":"Instrucción real de prueba aislada","agent":"4"});self.assertEqual(code,200)
            execute={"job":job["id"],"confirmation":"AUTORIZO ESTA EJECUCION"}
            self.assertEqual(post("/api/execute",execute)[0],403);b.owner_confirmation.assert_not_called()
            code,preview=post("/api/execution-preview",{"job":job["id"]});self.assertEqual(code,200)
            self.assertEqual(post("/api/execute",{**execute,"preview":preview["id"],"allow_publish":True})[0],403)
            self.assertEqual(post("/api/execute",{**execute,"preview":preview["id"]})[0],403)
            code,preview=post("/api/execution-preview",{"job":job["id"]});self.assertEqual(code,200)
            self.assertEqual(request("POST","/api/execute",{**execute,"preview":preview["id"]},{**base,"Origin":"http://evil.example"})[0],403)
            def complete(payload):b.finish_job(payload["job"],"completed",{"exit_code":0,"response":"Sintético"})
            with patch.object(b,"run_codex",side_effect=complete):
                self.assertEqual(post("/api/execute",{**execute,"preview":preview["id"]})[0],200)
                for _ in range(100):
                    if b.job(job["id"])["state"]=="completed":break
                    time.sleep(.01)
            self.assertEqual(b.job(job["id"])["state"],"completed");self.assertEqual(b.owner_confirmation.call_count,1)
            self.assertEqual(post("/api/execute",{**execute,"preview":preview["id"]})[0],403)
            publication={"job":job["id"],"workspace":str(self.home),"files":["synthetic"],"remote_main":"1"*40,"diff":"exact reviewed patch","message":"synthetic"}
            with patch.object(b.safety,"publication_payload",return_value=publication),patch.object(b.safety,"git_command",side_effect=["","2"*40,"1"*40,"exact reviewed patch","","2"*40+" refs/heads/main"]) as git:
                publish={"job":job["id"],"confirmation":"AUTORIZO ESTE PARCHE EN MAIN"}
                self.assertEqual(post("/api/publish",publish)[0],403);git.assert_not_called()
                code,p=post("/api/publication-preview",{"job":job["id"]});self.assertEqual(code,200)
                self.assertEqual(post("/api/publish",{**publish,"preview":p["id"]})[1]["state"],"verified")
            self.assertEqual(b.owner_confirmation.call_count,2);self.assertEqual(self.remote_writes,[])
            for action,payload in (("comment",{"card_id":self.card["id"],"text":"Comentario exacto de prueba","job_id":job["id"]}),("move",{"card_id":self.card["id"],"list_id":CHECK})):
                code,operation=post("/api/prepare-write",{"action":action,"payload":payload});self.assertEqual(code,200)
                approve={"operation":operation["operation"],"confirmation":"AUTORIZO ESTA MODIFICACION"}
                self.assertEqual(post("/api/approve-write",approve)[0],403)
                code,p=post("/api/write-preview",{"operation":operation["operation"]});self.assertEqual(code,200)
                self.assertEqual(post("/api/approve-write",{**approve,"preview":p["id"]})[1]["state"],"verified")
                self.assertEqual(post("/api/approve-write",{**approve,"preview":p["id"]})[0],403)
            self.assertEqual(b.owner_confirmation.call_count,4)
            self.assertEqual(len(self.remote_writes),2);self.assertEqual(self.card["idList"],CHECK)
        finally:
            holder["server"].shutdown();thread.join(timeout=3);holder["server"].server_close()

if __name__=="__main__":unittest.main()
