import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
test('real PostgreSQL enforces draft/storage RLS and rejects lost updates',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon; create role authenticated; create schema auth; create schema storage; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;");
  await db.exec("create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id bigint generated always as identity,bucket_id text,name text); alter table storage.objects enable row level security; grant select,insert on storage.objects to authenticated,anon; grant usage on sequence storage.objects_id_seq to authenticated,anon; create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;");
  await db.exec(await readFile(new URL('../supabase/001_private_portfolio.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  await db.query('insert into portfolio_private.owners(user_id) values($1)',[owner]);
  assert.equal((await db.query("select public from storage.buckets where id='portfolio-private'")).rows[0].public,false);
  async function as(role,id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
  await as('authenticated',owner);
  assert.equal((await db.query('select public.is_portfolio_owner() as allowed')).rows[0].allowed,true);
  const saved=await db.query("select public.save_portfolio_draft(0,'[]'::jsonb) as saved");
  assert.equal(saved.rows[0].saved.revision,1);
  await assert.rejects(db.query("select public.save_portfolio_draft(0,'[]'::jsonb)"),e=>e.code==='40001');
  const savedAgain=await db.query("select public.save_portfolio_draft(1,'[]'::jsonb) as saved");
  assert.equal(savedAgain.rows[0].saved.revision,2);
  await assert.rejects(db.query("select public.save_portfolio_draft(1,'[]'::jsonb)"),e=>e.code==='40001');
  await db.query("insert into storage.objects(bucket_id,name) values('portfolio-private',$1)",[owner+'/photo/preview.webp']);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('portfolio-private',$1)",[other+'/photo/preview.webp']),e=>e.code==='42501');
  await assert.rejects(db.query('insert into portfolio_private.owners(user_id) values($1)',[other]),e=>e.code==='42501');
  await assert.rejects(db.query("update public.portfolio_drafts set photos='[]'"),e=>e.code==='42501');
  await assert.rejects(db.query("delete from storage.objects"),e=>e.code==='42501');
  await as('authenticated',other);
  assert.equal((await db.query('select public.is_portfolio_owner() as allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select * from public.portfolio_drafts')).rows.length,0);
  assert.equal((await db.query('select * from public.portfolio_assets')).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(db.query("select public.save_portfolio_draft(0,'[]'::jsonb)"),e=>e.code==='42501');
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('portfolio-private',$1)",[other+'/photo/preview.webp']),e=>e.code==='42501');
  await as('anon');
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(db.query('select * from public.portfolio_drafts'),e=>e.code==='42501');
  await assert.rejects(db.query('select public.is_portfolio_owner()'),e=>e.code==='42501');
  await assert.rejects(db.query("select public.save_portfolio_draft(0,'[]'::jsonb)"),e=>e.code==='42501');
 }finally{await db.close();}
});
