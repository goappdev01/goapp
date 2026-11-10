"""Owner-bound diagnostics. Browser reports and Windows observations stay separate."""
import hashlib
import hmac
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
import urllib.parse
import uuid


def peer_from_headers(headers):
    # Serve appends the actual peer. Never trust an earlier supplied XFF entry.
    value=headers.get('X-Forwarded-For','').split(',')[-1].strip()
    try:return str(ipaddress.ip_address(value))
    except ValueError:
        try:return str(ipaddress.ip_address(urllib.parse.urlsplit('//'+value).hostname))
        except (ValueError,TypeError):return None


class DeviceProbes:
    def __init__(self,bridge,config):
        self.b,self.config=bridge,config
        self.folder=bridge.home/'estado'/'device-probes'
        self.folder.mkdir(exist_ok=True)
        self.lock=threading.RLock()

    def fail(self,code,message):raise self.b.factory.Error(code,message)

    def phone(self,peer,agent):
        return bool(peer and peer==self.config.get('expo_phone') and 'iphone' in agent.lower())

    def save(self,doc):
        path=self.folder/(doc['id']+'.json');temp=path.with_suffix('.tmp')
        temp.write_text(json.dumps({'document':doc,'mac':self.b.sign(doc)},ensure_ascii=False),encoding='utf-8')
        os.replace(temp,path)

    def read(self,identifier):
        if not isinstance(identifier,str) or not re.fullmatch('[a-f0-9]{32}',identifier):
            self.fail('DEVICE_PROBE_INVALID','Identificador de diagnóstico no válido.')
        path=self.folder/(identifier+'.json')
        if not path.is_file():self.fail('DEVICE_PROBE_INVALID','No se encuentra esta prueba.')
        row=json.loads(path.read_text(encoding='utf-8'));doc=row['document']
        if not hmac.compare_digest(self.b.sign(doc),row['mac']):self.fail('DEVICE_PROBE_INTEGRITY','El registro no coincide con la prueba original.')
        return doc

    def start(self,principal,peer,agent):
        if not self.phone(peer,agent):
            self.fail('DEVICE_PROBE_PHONE_REQUIRED','Inicia esta prueba en Safari del iPhone autorizado; el PC no puede acreditarla por él.')
        from owner_expo import OwnerExpo
        owner=OwnerExpo(self.b).load()
        if not owner:self.fail('DEVICE_PROBE_UNAVAILABLE','No se encuentra el entorno fijado.')
        nonce=secrets.token_urlsafe(24);identifier=uuid.uuid4().hex
        doc={'id':identifier,'kind':'browser','created':time.time(),'expires':time.time()+600,
             'principal':self.b.sign({'owner':principal}),'nonce_hash':hashlib.sha256(nonce.encode()).hexdigest(),
             'state':'pending','port':8089,'code_sha':owner['sha'],'report':None}
        with self.lock:self.save(doc)
        config={'id':identifier,'nonce':nonce,'origin':'http://'+owner['host']+':8089',
                'expected_name':'GO App · COMPROBACIONES · 8089',
                'return_url':'https://'+self.config['hostname']+'/remote/'}
        return {'url':config['origin']+'/__go_device_probe.local.html#'+urllib.parse.quote(json.dumps(config)),
                'message':'Safari probará directamente 8089 y volverá al panel. No ejecuta GO ni modifica reservas.'}

    def report(self,body,principal,peer,agent):
        if not self.phone(peer,agent):self.fail('DEVICE_PROBE_PHONE_REQUIRED','Este resultado no procede del iPhone autorizado.')
        if set(body)!={'id','nonce','report'} or not isinstance(body['report'],dict):self.fail('DEVICE_PROBE_INVALID','Resultado no válido.')
        with self.lock:
            doc=self.read(body['id'])
            if doc['state']!='pending':self.fail('DEVICE_PROBE_ALREADY_RECORDED','La prueba ya fue registrada; no se repite.')
            if time.time()>doc['expires']:self.fail('DEVICE_PROBE_EXPIRED','La prueba caducó; conserva el diagnóstico y comienza otra cuando proceda.')
            if (doc['principal']!=self.b.sign({'owner':principal}) or not isinstance(body['nonce'],str)
                    or not hmac.compare_digest(doc['nonce_hash'],hashlib.sha256(body['nonce'].encode()).hexdigest())):
                self.fail('DEVICE_PROBE_SCOPE','La prueba no coincide con este propietario.')
            report=body['report']
            from owner_expo import OwnerExpo
            owner=OwnerExpo(self.b).load()
            if not owner or owner['sha']!=doc['code_sha']:self.fail('DEVICE_PROBE_SCOPE','La versión fijada cambió durante la prueba.')
            allowed={'origin','browser_iphone','stages','elapsed_ms'}
            if (set(report)!=allowed or report['origin']!='http://'+owner['host']+':8089' or report['browser_iphone'] is not True
                    or type(report['elapsed_ms']) not in (int,float) or not 0<=report['elapsed_ms']<=600000):
                self.fail('DEVICE_PROBE_ORIGIN','El resultado no corresponde al navegador que abrió 8089.')
            stages=report['stages'];valid={'document','metro','manifest','bundle','assets','websocket'}
            if not isinstance(stages,list) or not 1<=len(stages)<=6:self.fail('DEVICE_PROBE_INVALID','Faltan las fases de la prueba.')
            keys=[]
            for stage in stages:
                if (not isinstance(stage,dict) or set(stage)!={'key','ok','bytes','count','elapsed_ms','error'}
                        or not isinstance(stage['key'],str) or stage['key'] not in valid or type(stage['ok']) is not bool
                        or any(type(stage[k]) not in (int,float) or not 0<=stage[k]<=200*1024*1024 for k in ('bytes','count','elapsed_ms'))
                        or not isinstance(stage['error'],str) or len(stage['error'])>120):self.fail('DEVICE_PROBE_INVALID','Una fase no es válida.')
                keys.append(stage['key'])
            if len(set(keys))!=len(keys):self.fail('DEVICE_PROBE_INVALID','Hay fases repetidas.')
            required={'document','metro','manifest','bundle','assets'}
            passed=required.issubset(keys) and all(x['ok'] for x in stages if x['key'] in required)
            doc.update(state='browser_transport_passed' if passed else 'browser_transport_failed',
                       report=report,recorded=time.time(),source='authenticated_iphone_browser',app_loaded='not_verified')
            self.save(doc)
        return self.public(doc)

    def launch(self,body,principal,peer,agent):
        if not self.phone(peer,agent):return {'recorded':False,'reason':'El origen no es el iPhone autorizado.'}
        if set(body)!={'id','event'} or body['event'] not in ('requested','browser_hidden') or not re.fullmatch('[a-zA-Z0-9_-]{12,80}',str(body['id'])):
            self.fail('DEVICE_LAUNCH_INVALID','Registro de apertura no válido.')
        probe_id=body['id'];identifier=hashlib.sha256(('launch:'+probe_id).encode()).hexdigest()[:32]
        with self.lock:
            path=self.folder/(identifier+'.json')
            doc=self.read(identifier) if path.exists() else {'id':identifier,'kind':'launch','created':time.time(),
                'principal':self.b.sign({'owner':principal}),'probe_id':probe_id,'state':'launch_requested','events':[],'app_loaded':'not_verified'}
            if doc['principal']!=self.b.sign({'owner':principal}):self.fail('DEVICE_PROBE_SCOPE','Apertura de otro propietario.')
            fresh=body['event'] not in doc['events']
            if fresh:doc['events'].append(body['event']);self.save(doc)
            if fresh and body['event']=='requested':
                threading.Thread(target=self.observe,args=(identifier,),daemon=True).start()
        return {'recorded':True,'app_loaded':'not_verified'}

    def sample(self):
        """Read-only Windows observations; neither a browser result nor UI proof."""
        from owner_expo import OwnerExpo
        owner=OwnerExpo(self.b).load()
        result={'source':'windows_observation','phone_tcp_seen':False,'runtime_count':0}
        if os.name=='nt':
            import ctypes,struct
            from ctypes import wintypes
            size=wintypes.ULONG(0);api=ctypes.windll.iphlpapi.GetExtendedTcpTable
            api(None,ctypes.byref(size),False,2,5,0)
            buf=ctypes.create_string_buffer(size.value)
            if api(buf,ctypes.byref(size),False,2,5,0)==0:
                raw=buf.raw;count=struct.unpack_from('I',raw)[0]
                for n in range(count):
                    state,addr,port,remote,rport,pid=struct.unpack_from('6I',raw,4+24*n)
                    if state==5 and __import__('socket').ntohs(port&65535)==8089:
                        if __import__('socket').inet_ntoa(struct.pack('I',remote))==self.config.get('expo_phone'):
                            result['phone_tcp_seen']=True
        if not owner:return result
        c=http.client.HTTPConnection(owner['host'],8089,timeout=2)
        try:
            c.request('GET','/json/list');response=c.getresponse()
            rows=json.loads(response.read(128000)) if response.status==200 else []
            if isinstance(rows,list):result['runtime_count']=len(rows)
        finally:c.close()
        return result

    def observe(self,identifier):
        # A short, bounded observation started only by the owner's explicit tap.
        end=time.monotonic()+60
        while time.monotonic()<end:
            try:
                observation=self.sample()
                with self.lock:
                    doc=self.read(identifier);old=doc.get('observation',{})
                    observation['phone_tcp_seen']|=old.get('phone_tcp_seen',False)
                    observation['runtime_count']=max(observation['runtime_count'],old.get('runtime_count',0))
                    if observation!=old:doc['observation']=observation;self.save(doc)
            except Exception:
                # No evidence is never reported as evidence of a failed handoff.
                pass
            time.sleep(2)

    @staticmethod
    def public(doc):
        return {k:doc.get(k) for k in ('id','kind','state','created','source','report','events','observation','app_loaded')}

    def latest(self,principal=None):
        result={'browser':None,'launch':None,'limits':'La red en Safari y el arranque nativo son comprobaciones diferentes.'}
        for path in sorted(self.folder.glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True):
            doc=self.read(path.stem)
            if principal and doc['principal']!=self.b.sign({'owner':principal}):continue
            kind=doc['kind']
            if result.get(kind) is None:result[kind]=self.public(doc)
            if result['browser'] and result['launch']:break
        if result['browser']:
            launch_id=hashlib.sha256(('launch:'+result['browser']['id']).encode()).hexdigest()[:32]
            launch_path=self.folder/(launch_id+'.json')
            if launch_path.exists():
                launch=self.read(launch_id)
                if launch.get('probe_id')==result['browser']['id'] and (not principal or launch['principal']==self.b.sign({'owner':principal})):
                    result['launch']=self.public(launch)
        return result
