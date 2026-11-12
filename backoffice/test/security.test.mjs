import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createApp,readConfig} from '../server.mjs';
import {preparePhoto} from '../provider.mjs';
import {seed,sanitizeDraft} from '../validation.mjs';
const owner='10000000-0000-4000-8000-000000000001';
const config={origin:'http://127.0.0.1:4174',secure:false,configured:true,ownerId:owner,ownerEmail:'owner@example.test'};
function setup(overrides={},settings={}){
 const calls={auth:0,load:0,upload:0,sent:0,saved:null};
 const provider={
  requestCode:async()=>{calls.sent++;},
  verifyCode:async()=>({access:'PRIVATE_ACCESS_TOKEN',refresh:'PRIVATE_REFRESH_TOKEN',expires:Date.now()+3600000,userId:owner}),
  authenticate:async()=>{calls.auth++;return {id:owner};},
  signOut:async()=>{},
  load:async()=>{calls.load++;return {revision:1,photos:seed()};},
  save:async(s,d)=>{calls.saved=d;return {revision:d.revision+1,savedAt:new Date().toISOString()};},
  upload:async()=>{calls.upload++;return {assetId:randomUUID()};},
  photo:async()=>Buffer.from('private photo'),...overrides
 };
 const app=createApp({...config,...settings},provider);
 async function request(method,route,data,cookie,extra={}){
  const headers={host:new URL(settings.origin||config.origin).host,origin:settings.origin||config.origin,...(data!==undefined?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...extra};
  const bytes=Buffer.isBuffer(data)?data:Buffer.from(data===undefined?'':JSON.stringify(data));
  const req=Readable.from(bytes.length?[bytes]:[]);Object.assign(req,{method,url:route,headers,socket:{remoteAddress:'127.0.0.1'}});
  const response={headers:{},status:200,headersSent:false,setHeader(k,v){this.headers[k.toLowerCase()]=v;},writeHead(status,h={}){this.status=status;this.headersSent=true;for(const[k,v]of Object.entries(h))this.setHeader(k,v);},end(b=''){this.body=Buffer.isBuffer(b)?b.toString():b;}};
  await app(req,response);return response;
 }
 async function login(){const r=await request('POST','/api/auth/verify',{email:'owner@example.test',code:'123456'});assert.equal(r.status,200);return r.headers['set-cookie'].split(';')[0];}
 return {request,login,calls};
}
test('anonymous and forged sessions cannot read or mutate private resources',async()=>{
 const s=setup();
 for(const cookie of [undefined,'mj_session=forged']){
  for(const[method,route,data]of [['GET','/api/draft'],['PUT','/api/draft',{revision:0,photos:[]}],['POST','/api/photos',Buffer.from('x')],['GET','/api/photos/'+randomUUID()],['GET','/portfolio.html'],['GET','/images/DSC_5826.jpg']]){
   assert.equal((await s.request(method,route,data,cookie)).status,401,method+' '+route);
  }
 }
 assert.equal(s.calls.load,0);assert.equal(s.calls.upload,0);
 const manager=await s.request('GET','/manager.html');assert.equal(manager.status,302);assert.equal(manager.headers.location,'/login.html');
});
test('origin and host checks reject CSRF and DNS rebinding',async()=>{
 const s=setup(),cookie=await s.login();
 for(const h of [{origin:'https://attacker.example'},{origin:undefined},{host:'attacker.example'},{'sec-fetch-site':'cross-site'}])assert.equal((await s.request('PUT','/api/draft',{revision:1,photos:[]},cookie,h)).status,403);
 assert.equal(s.calls.saved,null);
});
test('identity is verified again on private requests and revocation locks the session',async()=>{
 let allowed=true;
 const s=setup({authenticate:async()=>{if(!allowed)throw Object.assign(Error('Revoked'),{status:403});}}),cookie=await s.login();
 assert.equal((await s.request('GET','/api/draft',undefined,cookie)).status,200);
 allowed=false;assert.equal((await s.request('GET','/api/draft',undefined,cookie)).status,403);
 assert.equal((await s.request('GET','/api/draft',undefined,cookie)).status,401);
});
test('opaque secure HttpOnly cookie keeps auth tokens out of browser responses',async()=>{
 const s=setup({}, {origin:'https://studio.example.test',secure:true});
 const r=await s.request('POST','/api/auth/verify',{email:'owner@example.test',code:'123456'});
 assert.equal(r.status,200);assert.match(r.headers['set-cookie'],/^__Host-mj_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure$/);
 assert.doesNotMatch(r.body,/PRIVATE_/);assert.equal(r.headers['cache-control'],'no-store');assert.match(r.headers['content-security-policy'],/object-src 'none'/);
});
test('wrong owner UUID is refused even with a valid OTP',async()=>{
 const s=setup({verifyCode:async()=>({userId:randomUUID()})});
 assert.equal((await s.request('POST','/api/auth/verify',{email:'owner@example.test',code:'123456'})).status,403);
});
test('email request responses do not reveal the owner allowlist',async()=>{
 const s=setup(),a=await s.request('POST','/api/auth/request',{email:'other@example.test'}),b=await s.request('POST','/api/auth/request',{email:'owner@example.test'});
 assert.equal(a.body,b.body);assert.equal(a.status,b.status);assert.equal(s.calls.sent,1);
});
test('code requests are rate limited',async()=>{
 const s=setup();
 for(let i=0;i<5;i++)assert.equal((await s.request('POST','/api/auth/request',{email:'other@example.test'})).status,200);
 assert.equal((await s.request('POST','/api/auth/request',{email:'owner@example.test'})).status,429);
});
test('sign out invalidates the server session, not only the cookie',async()=>{
 const s=setup(),cookie=await s.login(),r=await s.request('POST','/api/auth/logout',undefined,cookie);
 assert.match(r.headers['set-cookie'],/Max-Age=0/);assert.equal((await s.request('GET','/api/draft',undefined,cookie)).status,401);
});
test('background session probes do not extend idle sessions',async()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 try{
  const s=setup(),cookie=await s.login();
  now+=20*60000;assert.equal(JSON.parse((await s.request('GET','/api/session',undefined,cookie)).body).authenticated,true);
  now+=11*60000;assert.equal(JSON.parse((await s.request('GET','/api/session',undefined,cookie)).body).authenticated,false);
 }finally{Date.now=realNow;}
});
test('draft validation rejects remote URLs, traversal, duplicate IDs and invalid layouts',()=>{
 const photos=seed();assert.equal(sanitizeDraft({revision:0,photos}).photos.length,8);
 for(const p of [{...photos[0],src:'https://attacker.example/a.jpg'},{...photos[0],src:'images/../.env'},{...photos[0],assetId:'../private'},{...photos[0],layout:'crop'}])assert.throws(()=>sanitizeDraft({revision:0,photos:[p]}));
 assert.throws(()=>sanitizeDraft({revision:0,photos:[photos[0],photos[0]]}));
 assert.throws(()=>sanitizeDraft({revision:0,photos:Array(301).fill(photos[0])}));
 assert.throws(()=>sanitizeDraft({revision:-1,photos}));
});
test('saving uses exact revision and reports conflicts without a success response',async()=>{
 const s=setup(),cookie=await s.login(),photos=seed();
 assert.equal((await s.request('PUT','/api/draft',{revision:7,photos},cookie)).status,200);assert.equal(s.calls.saved.revision,7);
 const c=setup({save:async()=>{throw Object.assign(Error('Draft conflict'),{status:409});}}),cc=await c.login();
 assert.equal((await c.request('PUT','/api/draft',{revision:7,photos},cc)).status,409);
});
test('oversized uploads never reach storage',async()=>{
 const s=setup(),cookie=await s.login();
 assert.equal((await s.request('POST','/api/photos',Buffer.alloc(12582913),cookie,{'content-type':'image/jpeg'})).status,413);assert.equal(s.calls.upload,0);
});
test('image processing respects orientation and aspect ratio and strips metadata',async()=>{
 const original=await sharp({create:{width:120,height:80,channels:3,background:'#226160'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const p=await preparePhoto(original),meta=await sharp(p.preview).metadata();
 assert.equal(p.width,80);assert.equal(p.height,120);assert.equal(meta.orientation,undefined);assert.equal(meta.exif,undefined);
 assert.equal(meta.format,'webp');await assert.rejects(()=>preparePhoto(Buffer.from('<svg><script>bad</script></svg>')));await assert.rejects(()=>preparePhoto(Buffer.from('fake jpg')));
});
test('missing configuration fails closed without a fake sign-in success',async()=>{
 const s=setup({}, {configured:false});
 assert.deepEqual(JSON.parse((await s.request('GET','/api/session')).body),{configured:false,authenticated:false});
 assert.equal((await s.request('POST','/api/auth/request',{email:'owner@example.test'})).status,503);assert.equal((await s.request('GET','/api/draft')).status,401);
});
test('configuration rejects secret keys, partial setup and insecure online origins',()=>{
 assert.throws(()=>readConfig({APP_ORIGIN:'http://studio.example.test'}));assert.throws(()=>readConfig({SUPABASE_URL:'https://test.supabase.co'}));
 assert.throws(()=>readConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_dontuse',PORTFOLIO_OWNER_ID:owner,PORTFOLIO_OWNER_EMAIL:'owner@example.test'}));
 assert.equal(readConfig({}).configured,false);
});
test('migration contains private bucket, owner RLS and revision-guarded writes',async()=>{
 const sql=await readFile(new URL('../supabase/001_private_portfolio.sql',import.meta.url),'utf8');
 assert.match(sql,/portfolio_assets enable row level security/);assert.match(sql,/portfolio_drafts enable row level security/);
 assert.match(sql,/revoke all on portfolio_private.owners from public, anon, authenticated/);assert.match(sql,/'portfolio-private','portfolio-private',false/);
 assert.match(sql,/revision=expected_revision/);assert.match(sql,/errcode='40001'/);
});
