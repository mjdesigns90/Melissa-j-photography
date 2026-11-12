import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createProvider} from './provider.mjs';
import {sanitizeDraft,originalPaths,uuid} from './validation.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const absoluteTtl=8*60*60*1000,idleTtl=30*60*1000;
const fail=(text,status=400)=>Object.assign(Error(text),{status});
export function readConfig(env){
 const origin=new URL(env.APP_ORIGIN||'http://127.0.0.1:4174');
 if(origin.origin!==origin.href.replace(/\/$/,''))throw Error('APP_ORIGIN must be an origin without a path.');
 const local=['127.0.0.1','localhost','[::1]'].includes(origin.hostname);
 if(!local&&origin.protocol!=='https:')throw Error('An online back office requires HTTPS.');
 const fields=[env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,env.PORTFOLIO_OWNER_ID,env.PORTFOLIO_OWNER_EMAIL];
 const configured=fields.every(Boolean);
 if(fields.some(Boolean)&&!configured)throw Error('Complete all four Supabase settings before starting.');
 if(configured){
  const u=new URL(env.SUPABASE_URL);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.search||u.username||u.password)throw Error('Use the HTTPS project URL supplied by Supabase.');
  if(!uuid.test(env.PORTFOLIO_OWNER_ID)||!env.PORTFOLIO_OWNER_EMAIL.includes('@'))throw Error('Configure the owner auth UUID and email.');
  if(!env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'))throw Error('Use a publishable key, never a secret or service-role key.');
 }
 return {origin:origin.origin,secure:origin.protocol==='https:',configured,supabaseUrl:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY,ownerId:env.PORTFOLIO_OWNER_ID,ownerEmail:env.PORTFOLIO_OWNER_EMAIL?.trim().toLowerCase(),siteRoot:path.resolve(here,env.SITE_ROOT||'..'),host:env.HOST||'127.0.0.1',port:Number(env.PORT||4174)};
}
async function body(req,limit){
 const chunks=[];let length=0;
 for await(const chunk of req){length+=chunk.length;if(length>limit)throw fail('This file or request is too large.',413);chunks.push(chunk);}
 return Buffer.concat(chunks);
}
async function jsonBody(req){
 if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail('Expected JSON.',415);
 try{return JSON.parse((await body(req,1048576)).toString());}catch(e){if(e.status)throw e;throw fail('Invalid request.');}
}
export function createApp(config,provider=config.configured?createProvider(config):null){
 const sessions=new Map(),limits=new Map();
 const cookieName=config.secure?'__Host-mj_session':'mj_session';
 function prune(){const now=Date.now();for(const [key,s]of sessions)if(now>s.until||now-s.last>idleTtl)sessions.delete(key);for(const [key,l]of limits)if(now>l.until)limits.delete(key);}
 function rate(req,scope,max){prune();const key=scope+':'+req.socket.remoteAddress;let l=limits.get(key);if(!l){l={until:Date.now()+600000,count:0};limits.set(key,l);}if(++l.count>max)throw fail('Too many attempts. Please wait ten minutes and try again.',429);}
 function sid(req){return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
 function cookie(res,value,maxAge){res.setHeader('Set-Cookie',cookieName+'='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+maxAge+(config.secure?'; Secure':''));}
 async function authorized(req,touch=true){prune();const id=sid(req),s=sessions.get(id);if(!s)throw fail('Please sign in to continue.',401);
  try{await provider.authenticate(s);}catch(e){sessions.delete(id);throw e;}
  if(touch)s.last=Date.now();return s;
 }
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
 function redirect(res){res.writeHead(302,{Location:'/login.html'});res.end();}
 async function file(res,name,root=path.join(here,'public')){
  const content=await readFile(path.join(root,name));
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
  res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'});res.end(content);
 }
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
  if(config.secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  try{
   if(req.headers.host!==new URL(config.origin).host)throw fail('Invalid host.',403);
   const url=new URL(req.url,config.origin),route=url.pathname;
   if(req.headers['sec-fetch-site']==='cross-site')throw fail('Cross-site request refused.',403);
   if(!['GET','POST','PUT'].includes(req.method))throw fail('Method not allowed.',405);
   if(req.method!=='GET'&&req.headers.origin!==config.origin)throw fail('Request origin refused.',403);
   if(req.method==='GET'&&route==='/')return redirect(res);
   if(req.method==='GET'&&['/login.html','/login.js','/login.css','/manager.css','/manager.js','/preview.css','/secure.css'].includes(route))return await file(res,route.slice(1));
   if(req.method==='GET'&&route==='/api/session'){
    if(!config.configured)return json(res,200,{configured:false,authenticated:false});
    try{await authorized(req,false);return json(res,200,{configured:true,authenticated:true});}
    catch(e){if(e.status===401||e.status===403)return json(res,200,{configured:true,authenticated:false});throw e;}
   }
   if(req.method==='POST'&&route==='/api/auth/request'){
    if(!config.configured)throw fail('Private sign-in is not connected yet.',503);
    rate(req,'send',5);const b=await jsonBody(req);
    if(typeof b.email!=='string'||b.email.length>254)throw fail('Enter your email address.');
    if(b.email.trim().toLowerCase()===config.ownerEmail)await provider.requestCode(config.ownerEmail);
    return json(res,200,{ok:true});
   }
   if(req.method==='POST'&&route==='/api/auth/verify'){
    if(!config.configured)throw fail('Private sign-in is not connected yet.',503);
    rate(req,'verify',10);const b=await jsonBody(req);
    if(typeof b.email!=='string'||b.email.trim().toLowerCase()!==config.ownerEmail||typeof b.code!=='string'||!/^\d{6,10}$/.test(b.code))throw fail('The sign-in code is invalid or expired.',401);
    const s=await provider.verifyCode(config.ownerEmail,b.code);
    if(s.userId!==config.ownerId)throw fail('This account is not authorized.',403);
    await provider.authenticate(s);prune();
    if(sessions.size>=64)throw fail('Too many active sessions. Please try later.',429);
    const id=randomBytes(32).toString('hex');
    const old=sid(req);if(old)sessions.delete(old);
    sessions.set(id,{...s,until:Date.now()+absoluteTtl,last:Date.now()});cookie(res,id,absoluteTtl/1000);
    return json(res,200,{ok:true});
   }
   if(req.method==='POST'&&route==='/api/auth/logout'){
    const id=sid(req),s=sessions.get(id);sessions.delete(id);cookie(res,'',0);
    if(s)try{await provider.signOut(s);}catch{/* Local session is already revoked; upstream token still expires normally. */}
    return json(res,200,{ok:true});
   }
   let session;
   try{session=await authorized(req);}catch(e){if(route==='/manager.html'&&e.status===401)return redirect(res);throw e;}
   if(req.method==='GET'&&route==='/manager.html')return await file(res,'manager.html');
   if(req.method==='GET'&&route==='/api/draft')return json(res,200,await provider.load(session));
   if(req.method==='PUT'&&route==='/api/draft'){rate(req,'save',120);const draft=sanitizeDraft(await jsonBody(req));return json(res,200,await provider.save(session,draft));}
   if(req.method==='POST'&&route==='/api/photos'){
    rate(req,'upload',60);let name;try{name=decodeURIComponent(req.headers['x-file-name']||'Photograph');}catch{throw fail('Invalid filename.');}
    const bytes=await body(req,12582912);if(!bytes.length)throw fail('Choose a photograph.');
    return json(res,201,await provider.upload(session,bytes,name));
   }
   if(req.method==='GET'&&route.startsWith('/api/photos/')){
    const id=route.slice('/api/photos/'.length);if(!uuid.test(id))throw fail('Photo not found.',404);
    const bytes=await provider.photo(session,id);res.writeHead(200,{'Content-Type':'image/webp'});return res.end(bytes);
   }
   if(req.method==='GET'&&['/portfolio.html','/portfolio.css'].includes(route))return await file(res,route.slice(1),config.siteRoot);
   if(req.method==='GET'&&(originalPaths.has(decodeURIComponent(route.slice(1)))||route==='/images/mjphotography-logo.png'))return await file(res,decodeURIComponent(route.slice(1)),config.siteRoot);
   throw fail('Not found.',404);
  }catch(e){
   if(res.headersSent){res.end();return;}
   json(res,e.status||503,{error:e.status?e.message:'The private service is unavailable. Your live website is unchanged. Please try again later.'});
  }
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const config=readConfig(process.env),server=http.createServer(createApp(config));
 server.requestTimeout=30000;server.headersTimeout=10000;
 server.listen(config.port,config.host,()=>console.log('Private back office: '+config.origin+(config.configured?'':' (awaiting Supabase connection)')));
}
