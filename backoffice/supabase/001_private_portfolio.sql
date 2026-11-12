-- Apply only to the owner's dedicated Supabase project.
begin;
create schema if not exists portfolio_private;
revoke all on schema portfolio_private from public, anon, authenticated;
create table portfolio_private.owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table portfolio_private.owners enable row level security;
revoke all on portfolio_private.owners from public, anon, authenticated;

create function public.is_portfolio_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from portfolio_private.owners where user_id = (select auth.uid())); $$;
revoke all on function public.is_portfolio_owner() from public, anon;
grant execute on function public.is_portfolio_owner() to authenticated;

create table public.portfolio_assets (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 original_key text not null,
 preview_key text not null,
 original_name text not null check(length(original_name)<=200),
 bytes integer not null check(bytes>0 and bytes<=12582912),
 width integer not null check(width>0 and width<=2400),
 height integer not null check(height>0 and height<=2400),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 created_at timestamptz not null default now(),
 check(preview_key=owner_id::text || '/' || id::text || '/preview.webp'),
 check(original_key in (owner_id::text || '/' || id::text || '/original.jpg',owner_id::text || '/' || id::text || '/original.png',owner_id::text || '/' || id::text || '/original.webp'))
);
alter table public.portfolio_assets enable row level security;
revoke all on public.portfolio_assets from public, anon, authenticated;
grant select, insert on public.portfolio_assets to authenticated;
create policy asset_owner_read on public.portfolio_assets for select to authenticated
 using (public.is_portfolio_owner() and owner_id=(select auth.uid()));
create policy asset_owner_insert on public.portfolio_assets for insert to authenticated
 with check (public.is_portfolio_owner() and owner_id=(select auth.uid()));

create table public.portfolio_drafts (
 owner_id uuid primary key references auth.users(id),
 revision integer not null check(revision>0),
 photos jsonb not null check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=300 and octet_length(photos::text)<=1048576),
 updated_at timestamptz not null default now()
);
alter table public.portfolio_drafts enable row level security;
revoke all on public.portfolio_drafts from public, anon, authenticated;
grant select on public.portfolio_drafts to authenticated;
create policy draft_owner_read on public.portfolio_drafts for select to authenticated
 using (public.is_portfolio_owner() and owner_id=(select auth.uid()));

create function public.save_portfolio_draft(expected_revision integer, draft_photos jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare saved public.portfolio_drafts;
begin
 if not public.is_portfolio_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if expected_revision<0 then raise exception 'Invalid revision' using errcode='22023'; end if;
 if expected_revision=0 then
  insert into public.portfolio_drafts(owner_id,revision,photos)
   values(auth.uid(),1,draft_photos)
   on conflict(owner_id) do nothing returning * into saved;
 else
  update public.portfolio_drafts set revision=revision+1,photos=draft_photos,updated_at=now()
   where owner_id=auth.uid() and revision=expected_revision returning * into saved;
 end if;
 if saved.owner_id is null then raise exception 'Draft conflict' using errcode='40001'; end if;
 return jsonb_build_object('revision',saved.revision,'updated_at',saved.updated_at);
end; $$;
revoke all on function public.save_portfolio_draft(integer,jsonb) from public, anon;
grant execute on function public.save_portfolio_draft(integer,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('portfolio-private','portfolio-private',false,12582912,array['image/jpeg','image/png','image/webp']);
create policy portfolio_private_read on storage.objects for select to authenticated
 using(bucket_id='portfolio-private' and public.is_portfolio_owner() and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy portfolio_private_insert on storage.objects for insert to authenticated
 with check(bucket_id='portfolio-private' and public.is_portfolio_owner() and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No anonymous, update, delete, or public-read policies. Originals are immutable.
commit;
-- Owner enrollment is a separate trusted SQL/admin action, after creating the owner's
-- auth account. No browser may add owners. Do not use an email address as a policy.
-- insert into portfolio_private.owners(user_id) values ('OWNER_AUTH_USER_UUID');
