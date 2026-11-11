"""A pinned, separately installed owner Metro. Never operates on port 8088."""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request


class OwnerExpo:
    def __init__(self,bridge):
        self.b=bridge
        self.path=bridge.home/'estado'/'owner-expo.json'

    def load(self):
        if not self.path.is_file():return None
        envelope=json.loads(self.path.read_text(encoding='utf-8'))
        import hmac
        if not hmac.compare_digest(self.b.sign(envelope['document']),envelope['signature']):
            self.fail('OWNER_EXPO_INTEGRITY','La configuración de Expo 8089 requiere revisión.')
        doc=envelope['document']
        if doc['port']!=8089:self.fail('OWNER_EXPO_PORT','Solo se permite el puerto 8089.')
        return doc

    def save(self,doc):
        raw=json.dumps({'document':doc,'signature':self.b.sign(doc)},ensure_ascii=False)
        temp=self.path.with_suffix('.tmp')
        temp.write_text(raw,encoding='utf-8')
        os.replace(temp,self.path)

    def fail(self,code,text):raise self.b.factory.Error(code,text)

    def git(self,doc,*args):
        # Porcelain's first two columns are meaningful, including a leading space.
        return subprocess.check_output(['git','-C',doc['workspace'],*args],text=True,stderr=subprocess.PIPE,timeout=30).rstrip('\r\n')

    def clean(self,doc):
        # Expo may regenerate this tracked file with equivalent line endings.
        changed=self.git(doc,'status','--porcelain','--untracked-files=no').splitlines()
        for line in changed:
            name=line[3:]
            if name!='artifacts/go-app-mobile/expo-env.d.ts':
                self.fail('OWNER_EXPO_DIRTY','Conserva y revisa los cambios del entorno 8089 antes de sustituir su versión.')
            actual=(Path(doc['workspace'])/name).read_text(encoding='utf-8-sig').replace('\r\n','\n')
            before=self.git(doc,'show','HEAD:'+name).strip()
            if actual.strip()!=before:self.fail('OWNER_EXPO_DIRTY','El entorno 8089 contiene cambios que deben conservarse.')

    def status(self):
        doc=self.load()
        if not doc:return {'state':'not_configured','port':8089,'shared_backend':True}
        head=self.git(doc,'rev-parse','HEAD')
        serving=False
        try:
            with urllib.request.urlopen('http://127.0.0.1:8089/status',timeout=2) as response:
                serving=response.read(100)==b'packager-status:running'
        except (OSError,TimeoutError):pass
        return {'state':doc.get('state','pinned') if serving and head==doc['sha'] else 'not_verified',
                'sha':doc['sha'],'head':head,'previous':doc.get('previous'),'port':8089,
                'url':'exp://'+doc['host']+':8089','serving':serving,'shared_backend':True,
                'note':'Código independiente y fijado. Comparte API, autenticación y base de datos existentes.'}

    def verify(self):
        doc=self.load()
        proof=self.b.factory._verify_metro(doc['sha'],doc['sha'],Path(doc['workspace']),
                                          port=8089,pinned=True,api_check=True)
        with self.b.factory.lock:
            latest=self.load()
            if (latest['sha'],latest.get('pid'))!=(doc['sha'],doc.get('pid')):
                self.fail('OWNER_EXPO_CHANGED','Cambió la versión durante su comprobación.')
            self.save({**latest,'state':'verified','proof':proof})
        return proof

    def review(self,action,payload):
        doc=self.load()
        if not doc:self.fail('OWNER_EXPO_MISSING','El entorno 8089 no está configurado.')
        sha=doc.get('previous') if action=='expo_rollback' else payload.get('sha')
        if not isinstance(sha,str) or not re.fullmatch('[0-9a-f]{40}',sha):
            self.fail('OWNER_EXPO_SHA','Indica el SHA completo de una versión publicada en MAIN.')
        self.clean(doc)
        if self.git(doc,'rev-parse','HEAD')!=doc['sha']:
            self.fail('OWNER_EXPO_CHANGED','El directorio no coincide con la versión fijada.')
        subprocess.run(['git','-C',doc['workspace'],'merge-base','--is-ancestor',sha,'origin/main'],
                       check=True,capture_output=True,timeout=20)
        paths=self.git(doc,'diff','--name-only',doc['sha'],sha,'--','pnpm-lock.yaml','pnpm-workspace.yaml','package.json',
                       'artifacts/go-app-mobile/package.json')
        if paths:self.fail('OWNER_EXPO_DEPENDENCIES','Esta versión cambia dependencias. Requiere preparar y comprobar la instalación aislada antes de seleccionarla.')
        return {'from_sha':doc['sha'],'to_sha':sha,'port':8089,'action':action,'shared_backend':True}

    def process(self,doc):
        # Query the command line before stopping only the PID that we launched.
        pid=doc.get('pid')
        if not isinstance(pid,int):return None
        command=['powershell.exe','-NoProfile','-Command',
                 f'(Get-CimInstance Win32_Process -Filter "ProcessId={pid}").CommandLine']
        line=subprocess.check_output(command,text=True,timeout=15).strip()
        if not line:return None
        if (doc['workspace'].replace('/','\\').casefold() not in line.replace('/','\\').casefold()
                or not re.search(r'--port\s+8089\b',line)):
            self.fail('OWNER_EXPO_PROCESS','El PID ya no corresponde al Metro 8089 dedicado; no se detendrá.')
        return pid

    def start(self,doc):
        if self.process(doc):return doc
        # Refuse a listener of unknown ownership. Never steal the port.
        try:
            import socket
            with socket.create_connection(('127.0.0.1',8089),timeout=1):
                self.fail('OWNER_EXPO_BUSY','El puerto 8089 está ocupado por otro proceso.')
        except OSError:pass
        mobile=Path(doc['workspace'])/'artifacts/go-app-mobile'
        cli=mobile/'node_modules/expo/bin/cli'
        if not cli.is_file():self.fail('OWNER_EXPO_DEPENDENCIES','Faltan las dependencias aisladas de Expo 8089.')
        env=os.environ.copy()
        for key in ('PORT','EXPO_PACKAGER_PROXY_URL','REACT_NATIVE_PACKAGER_HOSTNAME','EXPO_PUBLIC_DOMAIN'):
            env.pop(key,None)
        env.update(doc.get('environment',{}))
        env.update(CI='1',EXPO_NO_DOTENV='1',REACT_NATIVE_PACKAGER_HOSTNAME=doc['host'])
        log=(self.b.home/'estado'/'owner-expo.log').open('ab')
        try:
            proc=subprocess.Popen([doc['node'],str(cli),'start','--port','8089','--lan'],cwd=mobile,env=env,
                stdout=log,stderr=subprocess.STDOUT,stdin=subprocess.DEVNULL,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        finally:log.close()
        doc={**doc,'pid':proc.pid,'state':'starting'}
        self.save(doc)
        return doc

    def select(self,review):
        if self.review(review['action'],{'sha':review['to_sha']})!=review:
            self.fail('OWNER_EXPO_CHANGED','La versión cambió desde la revisión.')
        with self.b.factory.lock:
            doc=self.load()
            pid=self.process(doc)
            # Only our verified PID, never a process tree or another listener.
            if pid:
                import signal
                os.kill(pid,signal.SIGTERM)
                for _ in range(30):
                    if not self.process(doc):break
                    time.sleep(.1)
            doc={**doc,'state':'updating','previous':doc['sha'],'sha':review['to_sha'],'pid':None}
            self.save(doc)
            try:
                self.git(doc,'switch','--detach',doc['sha'])
                self.start(doc)
            except Exception:
                self.save({**doc,'state':'review_required'})
                raise
            self.b.audit('owner_expo_version_selected',review)
        import threading
        threading.Thread(target=self.verify_after_start,daemon=True).start()
        return {'selected':doc['sha'],'port':8089,'verification':'starting; comprobar manifiesto y JavaScript antes de darla por servida'}

    def verify_after_start(self):
        try:
            for _ in range(30):
                if self.status()['serving']:break
                time.sleep(1)
            self.verify()
        except Exception as error:
            doc=self.load()
            if doc:self.save({**doc,'state':'verification_pending','verification_error':getattr(error,'code','OWNER_EXPO_UNVERIFIED')})
