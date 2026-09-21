create extension if not exists pgcrypto;

create table public.farms (
  id uuid primary key default gen_random_uuid(), name text not null, access_code text not null unique,
  created_at timestamptz not null default now()
);
create table public.farm_members (farm_id uuid references public.farms(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, role text not null default 'member' check(role in ('owner','member')), primary key(farm_id,user_id));
create table public.fields (id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id) on delete cascade, name text not null, area numeric not null check(area>0), memo text default '', created_at timestamptz default now());
create table public.field_groups (id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id) on delete cascade, name text not null);
create table public.group_fields (group_id uuid references public.field_groups(id) on delete cascade, field_id uuid references public.fields(id) on delete cascade, primary key(group_id,field_id));
create table public.work_systems (id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id) on delete cascade, name text not null, crop text not null);
create table public.work_steps (id uuid primary key default gen_random_uuid(), system_id uuid not null references public.work_systems(id) on delete cascade, name text not null, step_order integer not null);
create table public.plantings (id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id) on delete cascade, field_id uuid not null references public.fields(id), crop text not null, system_id uuid references public.work_systems(id), planned_at date);
create table public.tasks (id uuid primary key default gen_random_uuid(), farm_id uuid not null references public.farms(id) on delete cascade, planting_id uuid not null references public.plantings(id) on delete cascade, name text not null, step_order integer not null, done_at date);

create or replace function public.is_farm_member(p_farm uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from farm_members where farm_id=p_farm and user_id=auth.uid()) $$;
create or replace function public.create_farm(p_name text) returns public.farms language plpgsql security definer set search_path=public as $$ declare f public.farms; begin insert into farms(name,access_code) values (trim(p_name),upper(substr(encode(gen_random_bytes(6),'hex'),1,10))) returning * into f; insert into farm_members(farm_id,user_id,role) values(f.id,auth.uid(),'owner'); return f; end $$;
create or replace function public.join_farm(p_access_code text) returns public.farms language plpgsql security definer set search_path=public as $$ declare f public.farms; begin select * into f from farms where access_code=upper(trim(p_access_code)); if not found then raise exception '共有コードが見つかりません'; end if; insert into farm_members(farm_id,user_id) values(f.id,auth.uid()) on conflict do nothing; return f; end $$;

alter table public.farms enable row level security; alter table public.farm_members enable row level security; alter table public.fields enable row level security; alter table public.field_groups enable row level security; alter table public.group_fields enable row level security; alter table public.work_systems enable row level security; alter table public.work_steps enable row level security; alter table public.plantings enable row level security; alter table public.tasks enable row level security;
create policy "farm select" on farms for select using (is_farm_member(id)); create policy "member select" on farm_members for select using (is_farm_member(farm_id));
create policy "fields access" on fields for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id)); create policy "groups access" on field_groups for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id)); create policy "systems access" on work_systems for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id)); create policy "plantings access" on plantings for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id)); create policy "tasks access" on tasks for all using (is_farm_member(farm_id)) with check (is_farm_member(farm_id));
create policy "group fields access" on group_fields for all using (exists(select 1 from field_groups g where g.id=group_id and is_farm_member(g.farm_id))) with check (exists(select 1 from field_groups g where g.id=group_id and is_farm_member(g.farm_id)));
create policy "work steps access" on work_steps for all using (exists(select 1 from work_systems s where s.id=system_id and is_farm_member(s.farm_id))) with check (exists(select 1 from work_systems s where s.id=system_id and is_farm_member(s.farm_id)));
grant usage on schema public to anon, authenticated; grant select,insert,update,delete on all tables in schema public to authenticated; grant execute on function public.create_farm(text), public.join_farm(text), public.is_farm_member(uuid) to authenticated;

-- 他端末での更新を画面へ反映するための Realtime 対象テーブル
alter publication supabase_realtime add table public.fields, public.field_groups, public.group_fields, public.work_systems, public.work_steps, public.plantings, public.tasks;
