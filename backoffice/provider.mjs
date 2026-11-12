import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {seed} from './validation.mjs';
const bucket='portfolio-private';
const error=(message,status=502)=>Object.assign(Error(message),{status});
function check(result,message){if(result.error)throw error(message);return result.data;}
export async function preparePhoto(bytes){
 try{
  const image=sharp(bytes,{limitInputPixels:40_000_000,failOn:'warning',animated:false});
  const meta=await image.metadata();
  if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw Error();
  const preview=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer({resolveWithObject:true});
  return {preview:preview.data,width:preview.info.width,height:preview.info.height,mime:'image/'+meta.format,extension:meta.format==='jpeg'?'jpg':meta.format};
 }catch{throw error('Use a valid, single-frame JPG, PNG or WebP under 40 megapixels.',400);}
}
export function createProvider(config){
 const client=token=>createClient(config.supabaseUrl,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(20000)}),...(token?{headers:{Authorization:'Bearer '+token}}:{})}});
 return {
  async requestCode(email){check(await client().auth.signInWithOtp({email,options:{shouldCreateUser:false}}),'Unable to send a sign-in code. Please try later.');},
  async verifyCode(email,token){
   const result=await client().auth.verifyOtp({email,token,type:'email'});
   if(result.error||!result.data.session)throw error('The sign-in code is invalid or expired.',401);
   const s=result.data.session;
   return {access:s.access_token,refresh:s.refresh_token,expires:s.expires_at*1000,userId:s.user.id};
  },
  async authenticate(session){
   if(session.expires<Date.now()+60_000){
    if(!session.refreshing)session.refreshing=(async()=>{
     const data=check(await client().auth.refreshSession({refresh_token:session.refresh}),'Please sign in again.');
     if(!data.session)throw error('Please sign in again.',401);
     Object.assign(session,{access:data.session.access_token,refresh:data.session.refresh_token,expires:data.session.expires_at*1000});
    })().finally(()=>session.refreshing=null);
    await session.refreshing;
   }
   const {data,error:authError}=await client().auth.getUser(session.access);
   if(authError||data.user?.id!==config.ownerId)throw error('Please sign in again.',401);
   const permitted=await client(session.access).rpc('is_portfolio_owner');
   if(permitted.error||permitted.data!==true)throw error('This account is not authorized for this portfolio.',403);
   return {id:data.user.id};
  },
  async signOut(session){await fetch(config.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+session.access},signal:AbortSignal.timeout(10000)});},
  async load(session){
   const data=check(await client(session.access).from('portfolio_drafts').select('revision,photos,updated_at').eq('owner_id',config.ownerId).maybeSingle(),'Unable to load your private draft.');
   return data?{revision:data.revision,photos:data.photos,savedAt:data.updated_at}:{revision:0,photos:seed(),savedAt:null};
  },
  async save(session,draft){
   const ids=[...new Set(draft.photos.filter(p=>p.assetId).map(p=>p.assetId))];
   if(ids.length){const rows=check(await client(session.access).from('portfolio_assets').select('id').in('id',ids),'Unable to validate your photos.');if(rows.length!==ids.length)throw error('A photo is missing from private storage.',400);}
   const r=await client(session.access).rpc('save_portfolio_draft',{expected_revision:draft.revision,draft_photos:draft.photos});
   if(r.error?.code==='40001')throw error('This draft changed in another tab. Your edits are still here; open another tab to review the saved version before retrying.',409);
   check(r,'Draft could not be saved. Your edits are still on this page.');
   return {revision:r.data.revision,savedAt:r.data.updated_at};
  },
  async upload(session,bytes,name){
   const p=await preparePhoto(bytes),id=randomUUID(),prefix=config.ownerId+'/'+id;
   const originalKey=prefix+'/original.'+p.extension,previewKey=prefix+'/preview.webp';
   const storage=client(session.access).storage.from(bucket);
   check(await storage.upload(originalKey,bytes,{contentType:p.mime,upsert:false}),'Photo could not be stored. Please try again.');
   check(await storage.upload(previewKey,p.preview,{contentType:'image/webp',upsert:false}),'Preview could not be stored. Please try again.');
   check(await client(session.access).from('portfolio_assets').insert({id,owner_id:config.ownerId,original_key:originalKey,preview_key:previewKey,original_name:name.slice(0,200),bytes:bytes.length,width:p.width,height:p.height,mime:p.mime}),'Unable to register the stored photograph.');
   return {assetId:id,src:'/api/photos/'+id,width:p.width,height:p.height,name:name.slice(0,200)};
  },
  async photo(session,id){
   const row=check(await client(session.access).from('portfolio_assets').select('preview_key').eq('id',id).maybeSingle(),'Unable to find this photo.');
   if(!row)throw error('Photo not found.',404);
   const data=check(await client(session.access).storage.from(bucket).download(row.preview_key),'Unable to load the photograph.');
   return Buffer.from(await data.arrayBuffer());
  }
 };
}
