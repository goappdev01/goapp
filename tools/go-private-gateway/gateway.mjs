import http from 'node:http';
import { pathToFileURL } from 'node:url';

const upstream = 'http://127.0.0.1:3000';
const allowed = new Set(['/api/healthz', '/api/supabase/auth/me', '/api/supabase/admin/access', '/api/supabase/manage/businesses', '/api/supabase/manage/configuration']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loginPath = '/api/supabase/auth/login';
const maxLoginBytes = 4096;
async function login(body, request) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 2 || !Object.keys(body).every(k => ['email','password'].includes(k))
    || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
    || typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 1024) {
    return {status:400,body:{error:'Email and password are required'}};
  }
  try {
    const response = await request(upstream + loginPath, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(15000),
      headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify({email:body.email,password:body.password}),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid response');
    const reader=response.body.getReader();const chunks=[];let size=0;
    try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw Error('Response too large');chunks.push(value);} }
    finally {await reader.cancel();}
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(response.status !== 200)return {status:[400,401,403,429].includes(response.status)?response.status:502,body:{error:response.status===429?'Too many login attempts':'No se pudo iniciar sesión.',code:response.status===400||response.status===401?'invalid_credentials':'LOGIN_UNAVAILABLE'}};
    if(typeof payload.access_token!=='string' || !payload.access_token || typeof payload.refresh_token!=='string' || !payload.refresh_token || !uuid.test(payload.user?.id ?? ''))throw Error('Invalid session');
    return {status:200,body:{access_token:payload.access_token,refresh_token:payload.refresh_token,expires_at:payload.expires_at,expires_in:payload.expires_in,token_type:payload.token_type,user:payload.user}};
  } catch {return {status:502,body:{error:'No se pudo iniciar sesión.'}};}
}

export async function respond({method, url, authorization, body}, request = fetch) {
  if (method === 'POST' && url === loginPath) return login(body,request);
  if (method !== 'GET') return {status:405, body:{error:'Remote verification is read-only'}};
  if (!allowed.has(url)) return {status:404, body:{error:'Route not available for remote verification'}};
  if (url !== '/api/healthz' && !/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(authorization ?? '')) {
    return {status:401, body:{error:'A valid GO session is required'}};
  }
  const read = async route => {
    const response = await request(upstream + route, {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(10000),
      headers:{Accept:'application/json', ...(authorization ? {Authorization:authorization} : {})},
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid response');
    const reader = response.body.getReader();
    const chunks=[]; let size=0;
    try {
      while (true) {
        const {done,value}=await reader.read(); if(done)break;
        size += value.byteLength; if(size > 1048576)throw new Error('Response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return {status:response.status, body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
  };
  try {
    if (url === '/api/healthz') {
      const result = await read(url);
      return result.status === 200 && result.body.status === 'ok'
        ? {status:200, body:{status:'ok', mode:'private-read-only'}}
        : {status:502, body:{error:'Local backend unavailable'}};
    }
    // The existing backend validates the JWT and rechecks the live owner membership.
    // This gate never decodes a JWT to grant authority and never stores a token.
    const access = await read('/api/supabase/admin/access');
    if (access.status !== 200) return {status:[401,403].includes(access.status) ? access.status : 502, body:{error:'Owner verification failed'}};
    const owner=access.body;
    if (owner.allowed !== true || owner.role !== 'admin' || owner.level !== 'owner'
      || !uuid.test(owner.userId ?? '') || !Array.isArray(owner.permissions) || !owner.permissions.includes('admin.access')) {
      return {status:403, body:{error:'This verification is restricted to the GO owner'}};
    }
    if (url === '/api/supabase/admin/access') return access;
    const result = await read(url);
    return result.status >= 200 && result.status < 300 ? result : {status:[401,403].includes(result.status) ? result.status : 502, body:{error:'Read unavailable'}};
  } catch { return {status:502, body:{error:'Verification unavailable'}}; }
}

export function createGateway(request=fetch) {
  const counts = new Map(), attempts = new Map();
  const count = (map,key,now) => {
    for (const [k,v] of map) if(v.until < now)map.delete(k);
    const entry=map.get(key) ?? {until:now+60000,count:0};map.set(key,entry);return ++entry.count;
  };
  const server=http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');res.setHeader('Connection','close');res.setHeader('Content-Type','application/json');
    const send = result => {res.writeHead(result.status);res.end(JSON.stringify(result.body));};
    const key=req.socket.remoteAddress, now=Date.now();
    if(count(counts,key,now)>60)return send({status:429,body:{error:'Retry later'}});
    const authLogin=req.method==='POST' && req.url===loginPath;
    let body;
    if(authLogin){
      if(count(attempts,key,now)>5)return send({status:429,body:{error:'Too many login attempts. Retry in one minute.'}});
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '') || req.headers['content-encoding'])return send({status:415,body:{error:'JSON required'}});
      if(Number(req.headers['content-length'])>maxLoginBytes)return send({status:413,body:{error:'Login request too large'}});
      const chunks=[];let size=0;
      try{
        for await(const chunk of req){size+=chunk.length;if(size>maxLoginBytes)return send({status:413,body:{error:'Login request too large'}});chunks.push(chunk);}
        body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }catch{return send({status:400,body:{error:'Invalid login request'}});}
    }
    const result=await respond({method:req.method,url:req.url,authorization:req.headers.authorization,body},request);
    send(result);
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host=process.env.GO_VPN_BIND;
  const parts=(host ?? '').split('.').map(Number);
  const privateVpn=parts.length===4 && parts[0]===100 && parts[1]>=64 && parts[1]<=127
    && parts.slice(2).every(x=>Number.isInteger(x) && x>=0 && x<=255);
  if (!privateVpn) throw new Error('GO_VPN_BIND must be this PC Tailscale IPv4 address; wildcard/public binding is forbidden');
  const server=createGateway();
  server.listen(3001,host,()=>console.log('Read-only verification gateway listening on the private VPN address, port 3001'));
  process.on('SIGINT',()=>server.close());
}
