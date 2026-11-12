import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProvider} from '../provider.mjs';
test('official Supabase SDK sends PKCE challenge and keeps separate server-only verifiers',async()=>{
 const originalFetch=globalThis.fetch,requests=[],owner='10000000-0000-4000-8000-000000000001';
 const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.c2lnbmF0dXJl';
 globalThis.fetch=async(url,init)=>{
  requests.push({url:String(url),body:JSON.parse(init.body)});
  if(String(url).includes('/otp'))return Response.json({});
  return Response.json({access_token:jwt,refresh_token:'server-only-refresh',expires_in:3600,token_type:'bearer',user:{id:owner,aud:'authenticated',email:'owner@example.test',created_at:new Date().toISOString()}});
 };
 try{
  const provider=createProvider({supabaseUrl:'https://example.supabase.co',key:'sb_publishable_test',ownerId:owner});
  const first=await provider.requestLink('owner@example.test','http://127.0.0.1:4175/auth/callback');
  const second=await provider.requestLink('owner@example.test','http://127.0.0.1:4175/auth/callback');
  assert.equal(requests[0].body.code_challenge_method,'s256');assert.equal(requests[0].body.create_user,false);
  assert.notEqual(requests[0].body.code_challenge,requests[1].body.code_challenge);
  assert.equal(new URL(requests[0].url).searchParams.get('redirect_to'),'http://127.0.0.1:4175/auth/callback');
  const result=await first.finish('first-auth-code');await second.finish('second-auth-code');
  assert.equal(result.userId,owner);assert.equal(result.refresh,'server-only-refresh');
  for(let i=0;i<2;i++){
   const body=requests[i+2].body;
   assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),requests[i].body.code_challenge);
  }
 }finally{globalThis.fetch=originalFetch;}
});
