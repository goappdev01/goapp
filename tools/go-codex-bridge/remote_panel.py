"""A narrow owner panel behind Tailscale Serve. Legacy local APIs stay loopback-only."""
import hashlib
import hmac
from http import cookies
import json
from pathlib import Path
import re
import secrets
import time
import urllib.parse


def private_text(value):
    text=str(value)
    for pattern in (r"(?i)bearer\s+\S+",r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                    r"https?://\S+",r"[\w.+-]+@[\w.-]+",r"(?<!\w)[+-]?\d{1,3}\.\d{3,}\s*,\s*[+-]?\d{1,3}\.\d{3,}",
                    r"(?<!\w)\+?\d[\d ()-]{8,}\d"):
        text=re.sub(pattern,"[dato privado]",text)
    return text[:2400]


class RemotePanel:
    def __init__(self,bridge):
        self.b,self.f,self.w=bridge,bridge.factory,bridge.factory.wheel
        self.previews={}
        self.nonce=secrets.token_urlsafe(32)
        path=bridge.home/"estado"/"remote-panel.json"
        self.config=json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        self.expo_links=None

    def authorize(self,handler,mutation=False):
        config=self.config
        authority=config.get("hostname","")
        origin="https://"+authority
        if (not authority or handler.client_address[0]!="127.0.0.1"
                or handler.headers.get("Host")!=authority or handler.headers.get("X-Forwarded-Proto")!="https"):
            self.w.fail("REMOTE_PROXY_REQUIRED","Este panel solo admite el proxy privado Tailscale configurado.")
        login=handler.headers.get("Tailscale-User-Login","").casefold()
        if not login or not hmac.compare_digest(self.b.sign({"tailnet_owner":login}),config.get("owner_hash","")):
            self.w.fail("REMOTE_OWNER_REQUIRED","El usuario Tailscale no está autorizado para este panel.")
        csrf=hmac.new(self.nonce.encode(),login.encode(),hashlib.sha256).hexdigest()
        if mutation:
            jar=cookies.SimpleCookie()
            jar.load(handler.headers.get("Cookie",""))
            if (handler.headers.get("Origin")!=origin or not jar.get("go_remote")
                    or not hmac.compare_digest(jar["go_remote"].value,csrf)
                    or not hmac.compare_digest(handler.headers.get("X-GO-CSRF",""),csrf)):
                self.w.fail("REMOTE_CSRF","Reabre el panel privado para confirmar la operación.")
        return login,csrf

    def activity(self,job):
        if not job:
            return {"state":"idle","events":[]}
        path=self.b.home/"ejecuciones"/job["id"]/"eventos.jsonl"
        events=[]
        if path.is_file():
            with path.open("rb") as stream:
                stream.seek(max(0,path.stat().st_size-48000))
                for line in stream:
                    try:event=json.loads(line)
                    except (ValueError,UnicodeError):continue
                    item=event.get("item") or {}
                    if event.get("type")=="item.completed":
                        events.append({"event":"item.completed","type":item.get("type"),"exit_code":item.get("exit_code")})
                    elif event.get("type") in ("thread.started","turn.completed","turn.failed","error"):
                        events.append({"event":event["type"]})
        result=job.get("result") or {}
        return {"state":job["state"],"updated":job["updated"],"events":events[-18:],
                "commands":result.get("successful_commands"),"failed_commands":result.get("failed_commands"),
                "error":private_text(result.get("classification_reason","")),
                "response_live_supported":False}

    def snapshot(self):
        wheel=self.w.status()
        batch=wheel["frozen_batch"]
        cards=[]
        for index,item in enumerate((batch or {}).get("cards",[]),1):
            grant=next((g for g in wheel["grants"] if g["card_id"]==item["card_id"]),None)
            attempt=self.f._row(item["card_id"],grant["attempt"]) if grant else None
            job=self.b.job(attempt["job_id"]) if attempt and attempt.get("job_id") else None
            stages=grant.get("stages",[]) if grant else []
            done={s["letter"] for s in stages if s["state"]=="verified"}
            phase=next((letter for letter in "ABCD" if letter not in done),"closed")
            cards.append({"card_id":item["card_id"],"title":item["title"],"index":index,"total":len(batch["cards"]),
                          "state":grant["state"] if grant else "unapproved","reason":grant["reason"] if grant else item.get("blocker"),
                          "phase":phase,"work_kind":item.get("work_kind"),"activity":self.activity(job),
                          "published":next((s.get("receipt",{}).get("main_sha") for s in stages if s["letter"]=="B"),None)})
        pending=[]
        with self.b.db() as db:
            allowed={item["card_id"] for item in (batch or {}).get("cards",[])}
            for row in db.execute("SELECT * FROM factory_questions ORDER BY created"):
                doc=json.loads(row["document"])
                if doc["card_id"] not in allowed:continue
                pending.append({"id":row["id"],"card_id":doc["card_id"],"kind":doc["kind"],
                                "question":private_text(doc["question"]),"operation":private_text(doc["operation"]),
                                "state":row["state"]})
        enabled=wheel["enabled"]
        if enabled:
            state="activa" if any(c["state"]=="working" for c in cards) else "esperando"
        elif batch and batch["state"]=="completed":
            state="finalizada"
        else:
            state="pausada"
        from owner_expo import OwnerExpo
        owner=OwnerExpo(self.b)
        expo=owner.status()
        launches={'checked_at':0,'expires_at':0,'links':{}}
        document=owner.load()
        if document and self.config.get('hostname'):
            from expo_links import ExpoLinks
            if self.expo_links is None:
                owner_root=Path(document['workspace'])/'artifacts/go-app-mobile' if document.get('workspace') else None
                from expo_device_access import check
                self.expo_links=ExpoLinks(document['host'],self.config['hostname'],owner_root,
                    device_check=lambda:check(document['host'],self.config.get('expo_phone'),document['node']))
            launches=self.expo_links.status()
        if expo.get('sha') and expo.get('head')!=expo['sha']:
            owner_link=launches['links'].get('owner')
            if owner_link:
                owner_link.update(available=False,url=None,message='La carpeta no coincide con la versión fijada. No se abrirá otra versión.')
        # Also correct an already-open older panel, whose script reads expo.url.
        expo['url']=launches['links'].get('owner',{}).get('url')
        return {"version":__import__("puente").EXECUTOR_VERSION,"source_sha256":getattr(self.b,'loaded_code_sha256',None),"updated":self.f.utc(),
                "wheel":{"enabled":enabled,"state":state,"reason":wheel["reason"],"batch_id":(batch or {}).get("id")},
                "cards":cards,"questions":pending,"quota":self.b.quota_status(),
                "expo":expo,"expo_launches":launches,"chat":{"state":"PENDIENTE DE COMPROBACIÓN REAL",
                "note":"Las pruebas alojadas requieren dos sesiones de prueba autorizadas. La versión Expo comparte el backend existente."}}

    def preview(self,action,payload,principal):
        from owner_expo import OwnerExpo
        if action=="activate":
            review=self.w.continuity.review_activation()
        elif action=="rebind":
            review=self.w.continuity.review_activation()
            review={**review,"binding_only":True}
        elif action in ("expo_select","expo_rollback"):
            review=OwnerExpo(self.b).review(action,payload)
        elif action=="recover":
            review=self.w.continuity.review_recovery(payload.get("card_id"))
        else:
            self.w.fail("REMOTE_ACTION_INVALID","Operación no admitida.")
        ticket=secrets.token_urlsafe(24)
        record={"action":action,"review":review,"principal":principal,"expires":time.time()+180}
        self.previews[ticket]=record
        self.previews={key:value for key,value in self.previews.items() if value["expires"]>time.time()}
        return {"ticket":ticket,"action":action,"review":review,
                "confirmation":"ACTIVAR FÁBRICA" if action=="activate" else "CONFIRMAR OPERACIÓN"}

    def decide(self,ticket,confirmation,principal):
        record=self.previews.pop(ticket,None)
        if not record or record["principal"]!=principal or record["expires"]<=time.time():
            self.w.fail("REMOTE_PREVIEW_EXPIRED","La revisión caducó o ya fue utilizada.")
        action,review=record["action"],record["review"]
        if confirmation!=("ACTIVAR FÁBRICA" if action=="activate" else "CONFIRMAR OPERACIÓN"):
            self.w.fail("REMOTE_CONFIRMATION_REQUIRED","Falta la confirmación explícita de esta operación.")
        self.b.audit("remote_owner_decision",{"principal_hash":self.b.sign({"tailnet_owner":principal}),
                     "action":action,"review_sha":self.f.digest(self.f.canonical(review))})
        if action=="activate":
            return self.w.continuity.activate(review,principal)
        if action=="rebind":
            return self.w.continuity.rebind(review,principal)
        if action=="recover":
            return self.w.continuity.recover(review,principal)
        from owner_expo import OwnerExpo
        return OwnerExpo(self.b).select(review)

    def handle(self,handler,session,local_origin):
        path=urllib.parse.urlsplit(handler.path).path
        mutation=handler.command=="POST"
        principal,csrf=self.authorize(handler,mutation)
        if not mutation:
            if path in ("/remote","/remote/"):
                data=(self.b.home/"remote.html").read_bytes()
                self.send(handler,data,"text/html; charset=utf-8",csrf)
            elif path=="/remote/panel.js":
                self.send(handler,(self.b.home/"remote.js").read_bytes(),"text/javascript; charset=utf-8")
            elif path=="/remote/status":
                self.send(handler,{**self.snapshot(),"csrf":csrf})
            else:self.w.fail("REMOTE_NOT_FOUND","Ruta remota no disponible.")
            return
        length=int(handler.headers.get("Content-Length","0"))
        if length<2 or length>16000:self.w.fail("REMOTE_BODY_INVALID","Solicitud no válida.")
        body=json.loads(handler.rfile.read(length))
        if not isinstance(body,dict):self.w.fail("REMOTE_BODY_INVALID","Solicitud no válida.")
        if path=="/remote/pause" and not body:
            self.w.pause("OWNER_PAUSED")
            result={"paused":True}
        elif path=="/remote/preview" and set(body)=={"action","payload"} and isinstance(body["payload"],dict):
            result=self.preview(body["action"],body["payload"],principal)
        elif path=="/remote/decide" and set(body)=={"ticket","confirmation"}:
            result=self.decide(body["ticket"],body["confirmation"],principal)
        elif path=="/remote/answer" and set(body)=={"id","decision","text"}:
            result=self.w.continuity.answer(body["id"],body["decision"],body["text"],principal)
        elif path=="/remote/quota" and not body:
            result=self.b.codex_quota()[0]
        else:self.w.fail("REMOTE_ACTION_INVALID","La operación no está admitida.")
        self.send(handler,result)

    @staticmethod
    def send(handler,data,content_type="application/json; charset=utf-8",csrf=None):
        raw=data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode()
        handler.send_response(200)
        for key,value in {"Content-Type":content_type,"Content-Length":str(len(raw)),"Cache-Control":"no-store",
                          "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
                          "Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}.items():
            handler.send_header(key,value)
        if csrf:handler.send_header("Set-Cookie","go_remote="+csrf+"; Secure; HttpOnly; SameSite=Strict; Path=/remote")
        handler.end_headers()
        handler.wfile.write(raw)
