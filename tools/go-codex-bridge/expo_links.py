"""Bounded resource probes and official Expo URLs; never a physical iPhone claim."""
import base64,hashlib,http.client,ipaddress,json,re,secrets,threading,time,urllib.parse

LABELS={8088:('main','ABRIR COLA TERMINADA · 8088','GO App · COLA TERMINADA · 8088'),8089:('owner','ABRIR COMPROBACIONES · 8089','GO App · COMPROBACIONES · 8089')}

class ExpoLinks:
    def __init__(self,address,hostname,owner_root=None,device_check=None):
        self.address=str(ipaddress.ip_address(address))
        if ipaddress.ip_address(address) not in ipaddress.ip_network('100.64.0.0/10'):raise ValueError('Only the configured Tailscale address is accepted')
        self.hostname=hostname
        self.owner_root=str(owner_root).replace('\\','/').rstrip('/').casefold() if owner_root else None
        self.device_check=device_check;self.lock=threading.Lock();self.cached=None;self.running=False

    def url(self,port):
        if port not in LABELS:raise ValueError('Unsupported Expo environment')
        return f'exp://{self.address}:{port}'

    def request(self,port,path,limit,timeout=8,headers=None):
        c=http.client.HTTPConnection(self.address,port,timeout=timeout)
        try:
            c.request('GET',path,headers=headers or {});r=c.getresponse()
            if r.status!=200 or r.getheader('Location'):raise ValueError(f'HTTP {r.status}; no se siguen redirecciones')
            raw=r.read(limit+1)
            if not raw or len(raw)>limit:raise ValueError('Respuesta vacía o superior al límite seguro')
            return raw
        finally:c.close()

    def fetch(self,port):
        opening=json.loads(self.request(port,'/_expo/open?platform=ios&runtime=expo',100000))
        u=urllib.parse.urlsplit(opening['url'])
        if opening.get('runtime')!='expo' or u.scheme!='exp' or u.hostname!=self.address or u.port!=port or u.path not in ('','/') or u.username or u.password or u.fragment:raise ValueError('Expo CLI anuncia otro destino o entorno')
        # Strip automation flags, not application identity. Use the official IPv4 authority.
        return json.loads(self.request(port,'/',1024*1024,headers={'Accept':'application/expo+json','Expo-Platform':'ios'}))

    def validate(self,port,m):
        client=m['extra']['expoClient'];go=m['extra']['expoGo'];asset=urllib.parse.urlsplit(m['launchAsset']['url'])
        debugger=urllib.parse.urlsplit('http://'+go['debuggerHost']);host=urllib.parse.urlsplit('http://'+client['hostUri'])
        if port==8089 and self.owner_root:
            actual=str(go.get('developer',{}).get('projectRoot','')).replace('\\','/').rstrip('/').casefold()
            if actual!=self.owner_root:raise ValueError('8089 está sirviendo otra carpeta de proyecto')
        if client['name']!=LABELS[port][2] or client['sdkVersion']!='58.0.0' or asset.scheme!='http' or asset.hostname!=self.address or asset.port!=port or not asset.path.endswith('.bundle') or urllib.parse.parse_qs(asset.query).get('platform')!=['ios'] or debugger.hostname!=self.address or debugger.port!=port or host.hostname!=self.address or host.port!=port:raise ValueError('Nombre, IP y puertos de manifiesto y bundle no coinciden')

    def resource(self,port,url,limit):
        u=urllib.parse.urlsplit(url)
        if u.scheme!='http' or u.hostname!=self.address or u.port!=port or u.username or u.password:raise ValueError('Un recurso depende de otra dirección o puerto')
        return self.request(port,u.path+('?' + u.query if u.query else ''),limit)

    @staticmethod
    def assets(bundle):
        found=[];seen=set()
        for match in re.finditer(rb'\.registerAsset\((\{[\s\S]*?\})\s*\)',bundle):
            try:a=json.loads(match[1])
            except ValueError:continue
            if not a.get('__packager_asset'):continue
            name=a['name'];kind=a['type'];scale=1 if 1 in a['scales'] else min(a['scales'])
            if not isinstance(name,str) or '/' in name or '\\' in name or not re.fullmatch('[a-zA-Z0-9]+',kind):raise ValueError('Identificador de recurso no válido')
            filename=name+('' if scale==1 else '@'+format(scale,'g')+'x')+'.'+kind
            loc=urllib.parse.urlsplit(a['httpServerLocation'])
            if loc.scheme or loc.netloc or not loc.path.startswith('/assets/'):raise ValueError('Recurso ajeno a Metro')
            q=dict(urllib.parse.parse_qsl(loc.query));path=loc.path
            if 'unstable_path' in q:q['unstable_path']=q['unstable_path'].rstrip('/')+'/'+filename
            else:path=path.rstrip('/')+'/'+urllib.parse.quote(filename)
            q.update(platform='ios',hash=a['hash']);route=path+'?'+urllib.parse.urlencode(q)
            if route not in seen:seen.add(route);found.append(route)
        if not found or len(found)>128:raise ValueError('No se ha podido enumerar un conjunto acotado de recursos iOS')
        return found

    def websocket(self,port):
        key=base64.b64encode(secrets.token_bytes(16)).decode();c=http.client.HTTPConnection(self.address,port,timeout=3)
        try:
            c.request('GET','/message',headers={'Connection':'Upgrade','Upgrade':'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':key});r=c.getresponse()
            expected=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            return r.status==101 and r.getheader('Sec-WebSocket-Accept')==expected
        finally:c.close()

    def probe(self,port):
        key,label,name=LABELS[port];item={'port':port,'label':label,'name':name,'available':False,'url':None,'verification_origin':'Windows','iphone_validation':'pending'}
        checks={};stage='enlace oficial y manifiesto'
        try:
            m=self.fetch(port);self.validate(port,m);checks['official_url_manifest']='ok'
            stage='descarga completa del bundle iOS';bundle=self.resource(port,m['launchAsset']['url'],96*1024*1024)
            if len(bundle)<1000:raise ValueError('Bundle incompleto')
            checks.update(bundle_bytes=len(bundle),bundle_sha256=hashlib.sha256(bundle).hexdigest())
            stage='descarga de recursos iOS';paths=self.assets(bundle);total=0
            for path in paths:
                total+=len(self.request(port,path,16*1024*1024))
                if total>96*1024*1024:raise ValueError('Recursos superiores al límite seguro')
            checks.update(assets_downloaded=len(paths),asset_bytes=total)
            try:checks['websocket_pc']=self.websocket(port)
            except (OSError,http.client.HTTPException):checks['websocket_pc']=False
            if self.device_check and port==8089:
                stage='permiso de red del iPhone';access=self.device_check();checks['iphone_firewall_rule']=access.get('allowed',False)
                if not access.get('allowed'):raise ValueError(access.get('reason','No se ha confirmado el permiso de red para el iPhone'))
            item.update(available=True,url=self.url(port),message='Bundle y recursos descargados desde el PC. Carga en iPhone pendiente de confirmar.')
        except (OSError,ValueError,KeyError,TypeError,http.client.HTTPException) as e:
            item['message']='Fallo en '+stage+'. No se abrirá el otro entorno como sustituto.';checks['error']=str(e)[:500]
        item['diagnostic']=json.dumps({'environment':name,'url':self.url(port),'origin':'Windows; no acredita carga en iPhone','checks':checks,'iphone_validation':'pending'},ensure_ascii=False,indent=2)
        return key,item

    def _probe(self):
        try:
            result={}
            for port in LABELS:
                key,item=self.probe(port);result[key]=item
            checked=time.time()
            with self.lock:self.cached={'checked_at':checked,'expires_at':checked+75,'links':result}
        finally:
            with self.lock:self.running=False

    def status(self,force=False):
        if force:self._probe();return self.cached
        with self.lock:
            if not self.running and (not self.cached or time.time()-self.cached['checked_at']>=60):
                self.running=True;threading.Thread(target=self._probe,daemon=True).start()
            return self.cached or {'checked_at':0,'expires_at':0,'links':{key:{'port':p,'label':label,'name':name,'available':False,'url':None,'message':'Comprobando bundle y recursos desde el PC…','diagnostic':'Comprobación técnica en curso; iPhone pendiente.'} for p,(key,label,name) in LABELS.items()}}
