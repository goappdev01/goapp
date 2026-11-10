"""HTTP and launcher boundaries, using disposable loopback sockets and SQLite."""
import http.client
import json
from pathlib import Path
import socket
import threading
import unittest
from unittest.mock import Mock,patch

import puente
import test_bridge as fixtures


class WheelHTTPTests(unittest.TestCase):
    setUp=fixtures.BridgeTests.setUp
    tearDown=fixtures.BridgeTests.tearDown

    def test_restart_respects_running_work_and_protected_http_routes(self):
        b=self.bridge
        (self.home/"panel.html").write_text("<title>Isolated bridge test</title>",encoding="utf8")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        b.config["port"]=port
        holder={};ready=threading.Event()
        original=puente.LocalBridgeServer
        def capture(*args):
            holder["server"]=original(*args)
            ready.set()
            return holder["server"]
        with patch.object(puente,"LocalBridgeServer",side_effect=capture):
            thread=threading.Thread(target=puente.server,args=(b,False))
            thread.start()
            self.assertTrue(ready.wait(5))
        def request(method,path,body=None,headers=None):
            conn=http.client.HTTPConnection("127.0.0.1",port,timeout=4)
            try:
                conn.request(method,path,None if body is None else json.dumps(body),
                             {"Host":"localhost:"+str(port),"Content-Type":"application/json",**(headers or {})})
                response=conn.getresponse()
                data=response.read()
                return response.status,dict(response.getheaders()),data
            finally:
                conn.close()
        try:
            code,headers,_=request("GET","/")
            self.assertEqual(code,200)
            cookie=headers["Set-Cookie"].split(";",1)[0]
            code,_,raw=request("GET","/api/status",headers={"Cookie":cookie})
            state=json.loads(raw)
            headers={"Cookie":cookie,"Origin":"http://localhost:"+str(port),"X-GO-CSRF":state["csrf"]}
            self.assertEqual(request("POST","/api/wheel/restart",{},{"Cookie":cookie})[0],403)
            with patch.object(b.factory.wheel,"approve") as approve:
                self.assertEqual(request("POST","/api/wheel/approve",{"decisions":[]},{**headers,"X-GO-CSRF":"wrong"})[0],403)
                approve.assert_not_called()
            job=b.prepare_text("Synthetic unexecuted instruction","4")
            with b.db() as db:
                db.execute("UPDATE jobs SET state='running' WHERE id=?",(job["id"],))
            self.assertEqual(request("POST","/api/wheel/restart",{},headers)[0],409)
            self.assertFalse(b.stopping)
            with b.db() as db:
                db.execute("UPDATE jobs SET state='blocked' WHERE id=?",(job["id"],))
            code,_,data=request("POST","/api/wheel/restart",{},headers)
            self.assertEqual(code,200)
            self.assertTrue(json.loads(data)["restarting"])
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(b.job(job["id"])["state"],"blocked")
        finally:
            if thread.is_alive():
                holder["server"].shutdown()
                thread.join(timeout=5)

    def test_maintenance_reuses_only_this_installation_without_loading_database(self):
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,*args):return json.dumps({"application":"GO-Puente-Codex","home":str(self.home)}).encode()
        response=Response()
        response.home=self.home
        with patch("puente.urllib.request.build_opener") as build,patch("puente.subprocess.Popen") as start:
            build.return_value.open.return_value=response
            puente.maintain(self.home)
            start.assert_not_called()
            response.home=self.home/"another-installation"
            with self.assertRaises(puente.BridgeError):
                puente.maintain(self.home)
            start.assert_not_called()

    def test_failed_result_artifact_does_not_mark_a_job_completed(self):
        job=self.bridge.prepare_text("Synthetic instruction","4")
        with patch("puente.save_json",side_effect=OSError("synthetic disk failure")):
            with self.assertRaises(OSError):
                self.bridge.finish_job(job["id"],"completed",{"exit_code":0})
        self.assertEqual(self.bridge.job(job["id"])["state"],"prepared")
