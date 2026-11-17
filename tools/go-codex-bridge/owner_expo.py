"""An independently installed owner Metro, updated only from verified MAIN."""
import json
import os
from pathlib import Path
import re
import socket
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
        if self.git(doc,'ls-files','--others','--exclude-standard','--','artifacts/go-app-mobile/public'):
            self.fail('OWNER_EXPO_DIRTY','Hay archivos locales públicos en 8089 que deben conservarse fuera de la versión servida.')

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
                'pending_sha':doc.get('pending_sha'),'pending_reason':doc.get('pending_reason'),
                'url':'exp://'+doc['host']+':8089','serving':serving,'shared_backend':True,
                'note':'Código independiente. Comparte API, autenticación y base de datos existentes.'}

    @staticmethod
    def port_busy():
        try:
            with socket.create_connection(('127.0.0.1',8089),timeout=1):
                return True
        except OSError:
            return False

    @staticmethod
    def metro_ready():
        try:
            with urllib.request.urlopen('http://127.0.0.1:8089/status',timeout=2) as response:
                return response.read(100)==b'packager-status:running'
        except (OSError,TimeoutError):
            return False

    def queue_verified(self,sha,proof):
        """Record only a published MAIN commit whose iOS bundle 8088 was verified."""
        if (not isinstance(sha,str) or not re.fullmatch(r'[0-9a-f]{40}',sha)
                or not isinstance(proof,dict) or proof.get('sha')!=sha
                or not proof.get('checked_sources')):
            self.fail('OWNER_EXPO_PROOF','La versión candidata no tiene comprobación de Metro 8088.')
        with self.b.factory.lock:
            doc=self.load()
            if not doc:return {'state':'not_configured'}
            root=proof.get('served_root')
            if root:
                root=str(Path(root).resolve())
                if not (Path(root)/'artifacts/go-app-mobile/package.json').is_file():
                    self.fail('OWNER_EXPO_PROOF','La prueba de 8088 señala otra carpeta.')
                doc={**doc,'main_workspace':root}
            main=self.git(doc,'ls-remote','origin','refs/heads/main').split()[0]
            if main!=sha:return {'state':'superseded','sha':sha}
            if doc['sha']==sha:
                self.save({**doc,'pending_sha':None,'pending_reason':None})
                return {'state':'current','sha':sha}
            updated={**doc,'pending_sha':sha,'pending_reason':None}
            self.save(updated)
            self.b.audit('owner_expo_update_queued',{'sha':sha,'previous':doc['sha']})
            return {'state':'queued','sha':sha}

    def sync_published_main(self,workspace):
        """Reverify the live 8088 bundle before queuing a published MAIN."""
        doc=self.load()
        if not doc:return {'state':'not_configured'}
        workspace=Path(workspace).resolve()
        main=self.git(doc,'ls-remote','origin','refs/heads/main').split()[0]
        head=subprocess.check_output(['git','-C',str(workspace),'rev-parse','HEAD'],text=True,timeout=20).strip()
        if head!=main:return {'state':'main_not_served','sha':main}
        proof=self.b.factory._verify_metro(main,main,workspace,port=8088)
        queued=self.queue_verified(main,proof)
        promotion=self.promote_if_idle() if queued.get('state')=='queued' else {'state':'not_needed'}
        return {'queued':queued,'promotion':promotion}

    def reconcile_published_main(self):
        """Cheap bridge poll; bundle verification runs only after MAIN advances."""
        doc=self.load()
        if not doc or not doc.get('main_workspace'):return {'state':'not_configured'}
        root=Path(doc['main_workspace']).resolve()
        head=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True,timeout=20).strip()
        if head==doc.get('pending_sha'):
            if doc.get('pending_reason') in (None,'OWNER_EXPO_ACTIVE') and not self.port_busy():
                return self.promote_if_idle()
            return {'state':'pending','sha':head}
        if head==doc['sha']:return {'state':'current','sha':head}
        return self.sync_published_main(root)

    def _record_pending(self,doc,reason):
        self.save({**doc,'pending_reason':reason})
        self.b.audit('owner_expo_update_deferred',{'sha':doc.get('pending_sha'),'reason':reason})
        return {'state':'pending','reason':reason,'sha':doc.get('pending_sha')}

    def promote_if_idle(self):
        """Keep the old commit until an idle 8089 has served and verified the candidate."""
        with self.b.factory.lock:
            doc=self.load()
            if not doc or not doc.get('pending_sha'):return {'state':'no_pending'}
            if self.port_busy():return self._record_pending(doc,'OWNER_EXPO_ACTIVE')
            target=doc['pending_sha']
            previous=doc['sha']
            try:
                self.clean(doc)
                if self.git(doc,'rev-parse','HEAD')!=previous:
                    return self._record_pending(doc,'OWNER_EXPO_CHANGED')
                if self.git(doc,'ls-remote','origin','refs/heads/main').split()[0]!=target:
                    return self._record_pending(doc,'OWNER_EXPO_SUPERSEDED')
                self.git(doc,'fetch','--no-tags','origin','main')
                if self.git(doc,'rev-parse','FETCH_HEAD')!=target:
                    return self._record_pending(doc,'OWNER_EXPO_SUPERSEDED')
                changed=self.git(doc,'diff','--name-only',previous,target,'--','pnpm-lock.yaml',
                                 'pnpm-workspace.yaml','package.json','artifacts/go-app-mobile/package.json')
                if changed:return self._record_pending(doc,'OWNER_EXPO_DEPENDENCIES')
                self.save({**doc,'state':'updating','previous':previous})
                self.git(doc,'switch','--detach',target)
                candidate=self.start({**doc,'sha':target,'previous':previous,'pid':None,'state':'starting'})
                for _ in range(40):
                    if self.metro_ready():break
                    time.sleep(1)
                if not self.metro_ready():self.fail('OWNER_EXPO_START','Metro 8089 no arrancó.')
                proof=self.verify()
                final=self.load()
                self.save({**final,'state':'verified','pending_sha':None,'pending_reason':None,'proof':proof})
                self.b.audit('owner_expo_update_verified',{'sha':target,'previous':previous})
                return {'state':'verified','sha':target,'previous':previous}
            except Exception as error:
                code=getattr(error,'code','OWNER_EXPO_UPDATE_FAILED')
                try:
                    if self.git(doc,'rev-parse','HEAD')==previous:
                        return self._record_pending(self.load() or doc,code)
                except Exception:
                    pass
                # Stop only the candidate PID recorded by this updater; never steal a port.
                current=self.load()
                try:
                    if current and current.get('sha')==target:
                        pid=self.process(current)
                        if pid:
                            import signal
                            os.kill(pid,signal.SIGTERM)
                            for _ in range(40):
                                if not self.port_busy():break
                                time.sleep(.25)
                    if self.port_busy():
                        self.save({**(current or doc),'pending_sha':target,'pending_reason':'OWNER_EXPO_ROLLBACK_BUSY',
                                   'state':'review_required'})
                        return {'state':'review_required','reason':'OWNER_EXPO_ROLLBACK_BUSY'}
                    self.git(doc,'switch','--detach',previous)
                    restored={**doc,'sha':previous,'pending_sha':target,'pending_reason':code,
                              'state':'rollback','pid':None}
                    self.save(restored)
                    self.start(restored)
                    for _ in range(40):
                        if self.metro_ready():break
                        time.sleep(1)
                    if self.metro_ready():self.verify()
                    self.b.audit('owner_expo_update_rolled_back',{'sha':target,'restored':previous,'reason':code})
                    return {'state':'rolled_back','reason':code,'sha':previous}
                except Exception:
                    self.save({**(self.load() or doc),'pending_sha':target,'pending_reason':'OWNER_EXPO_ROLLBACK_UNVERIFIED',
                               'state':'review_required'})
                    return {'state':'review_required','reason':'OWNER_EXPO_ROLLBACK_UNVERIFIED'}

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
        cache=self.b.home/'estado'/'metro-cache-8089'
        cache.mkdir(parents=True,exist_ok=True)
        env.update(TEMP=str(cache),TMP=str(cache))
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


if __name__=='__main__':
    import argparse
    import sys
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['sync'])
    parser.add_argument('--bridge-home',required=True)
    parser.add_argument('--main-workspace',required=True)
    options=parser.parse_args()
    sys.path.insert(0,str(Path(options.bridge_home)))
    from puente import Bridge
    bridge=Bridge(options.bridge_home)
    owner=OwnerExpo(bridge)
    doc=owner.load()
    if not doc:raise SystemExit('8089 no tiene una configuración firmada.')
    print(json.dumps(owner.sync_published_main(options.main_workspace),ensure_ascii=False))
