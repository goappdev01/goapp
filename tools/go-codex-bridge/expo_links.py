"""Read-only, fixed-port Expo launch links. No redirects or cross-port fallback."""
import http.client
import ipaddress
import json
import re
import socket
import threading
import time
import urllib.parse


LABELS = {
    8088: ('main', 'ABRIR COLA TERMINADA · 8088', 'GO App · COLA TERMINADA · 8088', 'go-cola-terminada-8088'),
    8089: ('owner', 'ABRIR COMPROBACIONES · 8089', 'GO App · COMPROBACIONES · 8089', 'go-comprobaciones-8089'),
}


class ExpoLinks:
    def __init__(self, address, hostname, owner_root=None):
        address=str(ipaddress.ip_address(address))
        if ipaddress.ip_address(address) not in ipaddress.ip_network('100.64.0.0/10'):
            raise ValueError('Only the configured Tailscale address is accepted')
        if not re.fullmatch(r'[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net',hostname):
            raise ValueError('A private Tailscale hostname is required')
        self.address,self.hostname=address,hostname
        self.owner_root=str(owner_root).replace('\\','/').rstrip('/').casefold() if owner_root else None
        self.lock=threading.Lock()
        self.cached=None

    def url(self,port):
        if port not in LABELS:raise ValueError('Unsupported Expo environment')
        # Distinct authorities plus an explicit native Expo launch discriminator.
        # Do not change slug, scheme, scopeKey, EAS identity or backend.
        host=self.hostname if port==8089 else self.address
        return f'exp://{host}:{port}?'+urllib.parse.urlencode({'release-channel':LABELS[port][3]})

    def fetch(self,port):
        target=urllib.parse.urlsplit(self.url(port))
        connection=http.client.HTTPConnection(target.hostname,port,timeout=3)
        # Preserve Host/port while connecting to the fixed tailnet IP. This also
        # works on Windows installations which opt out of the tailnet DNS resolver.
        connection._create_connection=lambda address,timeout,source_address=None:socket.create_connection(
            (self.address,port),timeout,source_address)
        try:
            connection.request('GET','/?'+target.query,headers={'Accept':'application/expo+json','Expo-Platform':'ios'})
            response=connection.getresponse()
            if response.status!=200 or response.getheader('Location'):
                raise ValueError('The exact server did not return its manifest directly')
            raw=response.read(1024*1024+1)
            if len(raw)>1024*1024:raise ValueError('Manifest too large')
            return json.loads(raw)
        finally:connection.close()

    def validate(self,port,manifest):
        client=manifest['extra']['expoClient']
        go=manifest['extra']['expoGo']
        asset=urllib.parse.urlsplit(manifest['launchAsset']['url'])
        debugger=urllib.parse.urlsplit('http://'+go['debuggerHost'])
        authority=urllib.parse.urlsplit('http://'+client['hostUri'])
        allowed={self.address,self.hostname}
        if port==8089 and self.owner_root:
            actual=str(go.get('developer',{}).get('projectRoot','')).replace('\\','/').rstrip('/').casefold()
            if actual!=self.owner_root:raise ValueError('The owner port is serving another project directory')
        if (client['name']!=LABELS[port][2] or client['sdkVersion']!='58.0.0'
                or asset.scheme!='http' or asset.hostname not in allowed or asset.port!=port
                or not asset.path.endswith('.bundle')
                or urllib.parse.parse_qs(asset.query).get('platform')!=['ios']
                or debugger.hostname not in allowed or debugger.port!=port
                or authority.hostname not in allowed or authority.port!=port):
            raise ValueError('Manifest, environment name and bundle must agree on the exact port')

    def status(self,force=False):
        with self.lock:
            now=time.time()
            if not force and self.cached and now-self.cached['checked_at']<10:
                return self.cached
            links={}
            scopes=[]
            for port,(key,label,name,_) in LABELS.items():
                item={'port':port,'label':label,'name':name,'available':False,'url':None}
                try:
                    manifest=self.fetch(port)
                    self.validate(port,manifest)
                    scopes.append(manifest['extra'].get('scopeKey'))
                    item.update(available=True,url=self.url(port),message='Destino comprobado; listo para abrir.')
                except (OSError,TimeoutError,ValueError,KeyError,TypeError,http.client.HTTPException):
                    item['message']='No se ha podido verificar este entorno. No se abrirá el otro como sustituto.'
                links[key]=item
            checked=time.time()
            self.cached={'checked_at':checked,'expires_at':checked+20,'links':links,
                         'shared_scope':len(scopes)==2 and bool(scopes[0]) and scopes[0]==scopes[1]}
            return self.cached
