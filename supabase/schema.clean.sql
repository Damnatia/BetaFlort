-- Flort Chat schema (mail/auth bağımsız sürüm)

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table if exists public.members
  add column if not exists password_hash text;

update public.members
set password_hash = extensions.crypt(password, extensions.gen_salt('bf'))
where password_hash is null
  and coalesce(password, '') <> '';

alter table public.members
  alter column password_hash set not null;

alter table public.members
  drop column if exists password;

revoke all (password_hash) on public.members from anon, authenticated;

create table if not exists public.member_profiles (
  member_id uuid primary key references public.members(id) on delete cascade,
  age int,
  hobbies text,
  city text,
  photo_url text,
  status_emoji text not null default '🙂',
  coin_balance int not null default 100 check (coin_balance >= 0),
  contact_phone text,
  updated_at timestamptz not null default now()
);

create table if not exists public.virtual_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age int not null check (age > 0),
  gender text not null,
  hobbies text,
  city text,
  photo_url text,
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);


-- Eski tabloda eksik kolonları tamamla
alter table if exists public.virtual_profiles
  add column if not exists photo_url text,
  add column if not exists city text;

alter table if exists public.member_profiles
  add column if not exists photo_url text,
  add column if not exists city text,
  add column if not exists hobbies text,
  add column if not exists age int,
  add column if not exists status_emoji text not null default '🙂',
  add column if not exists coin_balance int not null default 100,
  add column if not exists contact_phone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_profiles_coin_balance_non_negative'
  ) then
    alter table public.member_profiles
      add constraint member_profiles_coin_balance_non_negative check (coin_balance >= 0);
  end if;
end $$;

create or replace function public.ensure_member_profile_defaults()
returns trigger
language plpgsql
as $$
begin
  insert into public.member_profiles (member_id, coin_balance, status_emoji)
  values (new.id, 100, '🙂')
  on conflict (member_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_members_create_profile_defaults on public.members;
create trigger trg_members_create_profile_defaults
after insert on public.members
for each row execute function public.ensure_member_profile_defaults();

create or replace function public.member_sign_up(p_username text, p_password text)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_member public.members%rowtype;
begin
  if coalesce(trim(p_username), '') = '' then
    raise exception 'username_required';
  end if;
  if coalesce(p_password, '') = '' then
    raise exception 'password_required';
  end if;

  insert into public.members (username, password_hash)
  values (trim(lower(p_username)), extensions.crypt(p_password, extensions.gen_salt('bf')))
  on conflict (username) do nothing
  returning * into new_member;

  if new_member.id is null then
    select *
    into new_member
    from public.members m
    where m.username = trim(lower(p_username))
      and m.password_hash = extensions.crypt(p_password, m.password_hash)
    limit 1;

    if new_member.id is null then
      raise exception 'username_taken';
    end if;
  end if;

  return query
  select new_member.id, new_member.username;
end;
$$;

create or replace function public.member_sign_in(p_username text, p_password text)
returns table (id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select m.id, m.username
  from public.members m
  where m.username = trim(lower(p_username))
    and m.password_hash = extensions.crypt(p_password, m.password_hash)
  limit 1
$$;

grant execute on function public.member_sign_up(text, text) to anon, authenticated;
grant execute on function public.member_sign_in(text, text) to anon, authenticated;

do $$
begin
  if to_regclass('public.members') is null then
    create table public.members (
      id uuid primary key default gen_random_uuid(),
      username text unique not null,
      password_hash text not null,
      created_at timestamptz not null default now()
    );
  end if;

  execute $fn$
    create or replace function public.sync_member_from_auth_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $inner$
    declare
      resolved_username text;
    begin
      resolved_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))), '');
      if resolved_username is null then
        resolved_username := concat('user_', replace(new.id::text, '-', ''));
      end if;

      insert into public.members (id, username, password_hash)
      values (new.id, resolved_username, 'managed_by_supabase_auth')
      on conflict (id) do update
      set username = excluded.username;

      return new;
    end;
    $inner$;
  $fn$;

  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists trg_sync_member_from_auth_user on auth.users';
    execute 'create trigger trg_sync_member_from_auth_user after insert or update on auth.users for each row execute function public.sync_member_from_auth_user()';

    insert into public.members (id, username, password_hash)
    select
      au.id,
      coalesce(
        nullif(trim(coalesce(au.raw_user_meta_data ->> 'username', split_part(au.email, '@', 1))), ''),
        concat('user_', replace(au.id::text, '-', ''))
      ) as username,
      'managed_by_supabase_auth' as password_hash
    from auth.users au
    on conflict (id) do update
    set username = excluded.username;
  end if;
end $$;

-- Eski şemadan gelen created_by uuid kolonunu text'e çevir (çakışmasız migration)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'virtual_profiles'
      and column_name = 'created_by'
      and data_type = 'uuid'
  ) then
    begin
      alter table public.virtual_profiles drop constraint if exists virtual_profiles_created_by_fkey;
    exception when undefined_object then
      null;
    end;

    alter table public.virtual_profiles
      alter column created_by type text using coalesce(created_by::text, 'admin');
  end if;

  alter table public.virtual_profiles
    alter column created_by set default 'admin',
    alter column created_by set not null;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  virtual_profile_id uuid not null references public.virtual_profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('member', 'virtual')),
  content text not null,
  seen_by_member boolean not null default false,
  seen_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table if exists public.messages
  add column if not exists seen_by_member boolean not null default false,
  add column if not exists seen_by_admin boolean not null default false;

-- Eski şemadan gelen messages.member_id foreign key'ini members tablosuna taşı
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='messages'
  ) then
    alter table public.messages drop constraint if exists messages_member_id_fkey;

    delete from public.messages m
    where not exists (
      select 1 from public.members mb where mb.id = m.member_id
    );

    alter table public.messages
      add constraint messages_member_id_fkey
      foreign key (member_id) references public.members(id) on delete cascade;
  end if;
end $$;

-- admin_threads artık VIEW değil TABLE (realtime için)
do $$
declare
  relkind_char "char";
begin
  select c.relkind into relkind_char
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'admin_threads'
  limit 1;

  -- Eğer eski yapı view ise sil, table ise dokunma
  if relkind_char = 'v' then
    execute 'drop view public.admin_threads';
  end if;
end $$;

create table if not exists public.admin_threads (
  member_id uuid not null,
  virtual_profile_id uuid not null,
  member_username text not null,
  virtual_name text not null,
  last_message_content text,
  last_sender_role text,
  last_message_at timestamptz not null,
  primary key (member_id, virtual_profile_id)
);

-- Backfill / refresh
insert into public.admin_threads (
  member_id,
  virtual_profile_id,
  member_username,
  virtual_name,
  last_message_content,
  last_sender_role,
  last_message_at
)
select
  ranked.member_id,
  ranked.virtual_profile_id,
  ranked.member_username,
  ranked.virtual_name,
  ranked.last_message_content,
  ranked.last_sender_role,
  ranked.last_message_at
from (
  select
    m.member_id,
    vp.id as virtual_profile_id,
    mb.username as member_username,
    vp.name as virtual_name,
    m.content as last_message_content,
    m.sender_role as last_sender_role,
    m.created_at as last_message_at,
    row_number() over (
      partition by m.member_id, vp.id
      order by m.created_at desc
    ) as rn
  from public.messages m
  join public.virtual_profiles vp on vp.id = m.virtual_profile_id
  join public.members mb on mb.id = m.member_id
) ranked
where ranked.rn = 1
on conflict (member_id, virtual_profile_id)
do update set
  member_username = excluded.member_username,
  virtual_name = excluded.virtual_name,
  last_message_content = excluded.last_message_content,
  last_sender_role = excluded.last_sender_role,
  last_message_at = excluded.last_message_at;

create or replace function public.sync_admin_threads_from_messages()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    delete from public.admin_threads t
    where t.member_id = old.member_id
      and t.virtual_profile_id = old.virtual_profile_id
      and not exists (
        select 1 from public.messages m
        where m.member_id = old.member_id
          and m.virtual_profile_id = old.virtual_profile_id
      );
    return old;
  end if;

  insert into public.admin_threads (
    member_id,
    virtual_profile_id,
    member_username,
    virtual_name,
    last_message_content,
    last_sender_role,
    last_message_at
  )
  select
    m.member_id,
    m.virtual_profile_id,
    mb.username,
    vp.name,
    m.content,
    m.sender_role,
    m.created_at
  from public.messages m
  join public.members mb on mb.id = m.member_id
  join public.virtual_profiles vp on vp.id = m.virtual_profile_id
  where m.id = new.id
  on conflict (member_id, virtual_profile_id)
  do update set
    member_username = excluded.member_username,
    virtual_name = excluded.virtual_name,
    last_message_content = excluded.last_message_content,
    last_sender_role = excluded.last_sender_role,
    last_message_at = excluded.last_message_at;

  return new;
end $$;

drop trigger if exists trg_sync_admin_threads_from_messages on public.messages;
create trigger trg_sync_admin_threads_from_messages
after insert or update or delete on public.messages
for each row execute function public.sync_admin_threads_from_messages();

alter table public.members enable row level security;
alter table public.member_profiles enable row level security;
alter table public.virtual_profiles enable row level security;
alter table public.messages enable row level security;
alter table public.admin_threads enable row level security;

-- Politikaları idempotent yapmak için önce varsa sil
drop policy if exists "members_all_anon" on public.members;
drop policy if exists "member_profiles_all_anon" on public.member_profiles;
drop policy if exists "virtual_profiles_all_anon" on public.virtual_profiles;
drop policy if exists "messages_all_anon" on public.messages;
drop policy if exists "admin_threads_all_anon" on public.admin_threads;

create policy "members_all_anon"
  on public.members for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "member_profiles_all_anon"
  on public.member_profiles for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "virtual_profiles_all_anon"
  on public.virtual_profiles for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "messages_all_anon"
  on public.messages for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "admin_threads_all_anon"
  on public.admin_threads for all
  to anon, authenticated
  using (true)
  with check (true);

-- Storage bucket + policy (profil fotoğrafları)
insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do nothing;

drop policy if exists "profile_images_public_read" on storage.objects;
drop policy if exists "profile_images_anon_insert" on storage.objects;
drop policy if exists "profile_images_anon_update" on storage.objects;

create policy "profile_images_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'profile-images');

create policy "profile_images_anon_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'profile-images');

create policy "profile_images_anon_update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'profile-images')
with check (bucket_id = 'profile-images');


-- Realtime publication (messages + admin_threads tablosu)
do $$
declare
  rel_exists boolean;
begin
  select exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'messages'
  ) into rel_exists;

  if not rel_exists then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  select exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'admin_threads'
  ) into rel_exists;

  if not rel_exists then
    execute 'alter publication supabase_realtime add table public.admin_threads';
  end if;
exception when undefined_object then
  null;
end $$;

-- Advanced demo analytics + ops tables (idempotent)
alter table if exists public.messages
  add column if not exists seen_by_member_at timestamptz,
  add column if not exists seen_by_admin_at timestamptz;

alter table if exists public.admin_threads
  add column if not exists status_tag text not null default 'takip_edilecek',
  add column if not exists closed_at timestamptz;

create table if not exists public.thread_metrics_daily (
  metric_date date not null,
  daily_active_users int not null default 0,
  avg_first_response_seconds numeric,
  thread_close_rate numeric,
  ai_suggestion_conversion_rate numeric,
  created_at timestamptz not null default now(),
  primary key (metric_date)
);

create table if not exists public.admin_actions_log (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  member_id uuid,
  virtual_profile_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.typing_states (
  member_id uuid not null,
  virtual_profile_id uuid not null,
  role text not null check (role in ('member','admin')),
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (member_id, virtual_profile_id, role)
);

create table if not exists public.member_mood_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  status_emoji text not null,
  created_at timestamptz not null default now()
);

alter table public.thread_metrics_daily enable row level security;
alter table public.admin_actions_log enable row level security;
alter table public.typing_states enable row level security;
alter table public.member_mood_history enable row level security;

drop policy if exists "thread_metrics_all_anon" on public.thread_metrics_daily;
drop policy if exists "admin_actions_all_anon" on public.admin_actions_log;
drop policy if exists "typing_states_all_anon" on public.typing_states;
drop policy if exists "mood_history_all_anon" on public.member_mood_history;

create policy "thread_metrics_all_anon"
  on public.thread_metrics_daily for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "admin_actions_all_anon"
  on public.admin_actions_log for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "typing_states_all_anon"
  on public.typing_states for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "mood_history_all_anon"
  on public.member_mood_history for all
  to anon, authenticated
  using (true)
  with check (true);

-- Realtime publication
DO $$
DECLARE rel_exists boolean;
BEGIN
  select exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'typing_states'
  ) into rel_exists;

  if not rel_exists then
    execute 'alter publication supabase_realtime add table public.typing_states';
  end if;
exception when undefined_object then
  null;
END $$;

-- Day-1 v2 domain tables (idempotent)
create table if not exists public.thread_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null,
  virtual_profile_id uuid not null,
  event_type text not null check (event_type in ('status_change', 'bulk_sent', 'thread_closed', 'thread_reopened')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.presence_snapshots (
  member_id uuid not null,
  virtual_profile_id uuid not null,
  role text not null check (role in ('member', 'admin')),
  last_seen_at timestamptz not null default now(),
  active_now boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (member_id, virtual_profile_id, role)
);

create table if not exists public.kpi_snapshots_daily (
  metric_date date primary key,
  daily_active_users int not null default 0,
  avg_first_response_seconds numeric,
  thread_close_rate numeric,
  ai_suggestion_conversion_rate numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('member_message', 'admin_reply', 'profile_view')),
  member_id uuid references public.members(id) on delete cascade,
  virtual_profile_id uuid references public.virtual_profiles(id) on delete cascade,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_gateway_settings (
  id int primary key,
  provider text not null default '',
  webhook_url text not null default '',
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.payment_gateway_settings drop column if exists api_key;
alter table public.payment_gateway_settings drop column if exists api_secret;

create table if not exists public.thread_quick_facts (
  member_id uuid not null references public.members(id) on delete cascade,
  virtual_profile_id uuid not null references public.virtual_profiles(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (member_id, virtual_profile_id)
);

alter table public.thread_events enable row level security;
alter table public.presence_snapshots enable row level security;
alter table public.kpi_snapshots_daily enable row level security;
alter table public.engagement_events enable row level security;
alter table public.payment_gateway_settings enable row level security;
alter table public.thread_quick_facts enable row level security;

drop policy if exists "thread_events_all_anon" on public.thread_events;
drop policy if exists "presence_snapshots_all_anon" on public.presence_snapshots;
drop policy if exists "kpi_snapshots_daily_all_anon" on public.kpi_snapshots_daily;
drop policy if exists "engagement_events_all_anon" on public.engagement_events;
drop policy if exists "payment_gateway_settings_all_anon" on public.payment_gateway_settings;
drop policy if exists "payment_gateway_settings_read_all" on public.payment_gateway_settings;
drop policy if exists "payment_gateway_settings_write_authenticated" on public.payment_gateway_settings;
drop policy if exists "thread_quick_facts_all_anon" on public.thread_quick_facts;

create policy "thread_events_all_anon"
  on public.thread_events for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "presence_snapshots_all_anon"
  on public.presence_snapshots for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "kpi_snapshots_daily_all_anon"
  on public.kpi_snapshots_daily for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "engagement_events_all_anon"
  on public.engagement_events for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "payment_gateway_settings_read_all"
  on public.payment_gateway_settings for select
  to anon, authenticated
  using (true);

create policy "payment_gateway_settings_write_authenticated"
  on public.payment_gateway_settings for all
  to authenticated
  using (true)
  with check (true);

create policy "thread_quick_facts_all_anon"
  on public.thread_quick_facts for all
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.member_moderation (
  member_id uuid primary key references public.members(id) on delete cascade,
  notes text not null default '',
  tags text[] not null default '{}',
  muted_until timestamptz,
  is_blacklisted boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.member_moderation enable row level security;
drop policy if exists "member_moderation_all_anon" on public.member_moderation;
create policy "member_moderation_all_anon"
  on public.member_moderation for all
  to anon, authenticated
  using (true)
  with check (true);

-- typing_states timeout compatibility: auto-refresh updated_at and inactive fallback
create or replace function public.trg_touch_typing_states_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_typing_states_updated_at on public.typing_states;
create trigger trg_touch_typing_states_updated_at
before update on public.typing_states
for each row execute function public.trg_touch_typing_states_updated_at();

create or replace function public.cleanup_stale_typing_states(p_timeout_seconds int default 8)
returns int
language plpgsql
as $$
declare
  affected_count int;
begin
  update public.typing_states
  set is_typing = false,
      updated_at = now()
  where is_typing = true
    and updated_at < now() - make_interval(secs => p_timeout_seconds);

  get diagnostics affected_count = row_count;
  return affected_count;
end $$;
-- P0 RLS redesign: remove all-open policies and enforce owner/admin scope
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- cleanup old wide-open policies
 drop policy if exists "members_all_anon" on public.members;
 drop policy if exists "member_profiles_all_anon" on public.member_profiles;
 drop policy if exists "virtual_profiles_all_anon" on public.virtual_profiles;
 drop policy if exists "messages_all_anon" on public.messages;
 drop policy if exists "admin_threads_all_anon" on public.admin_threads;
 drop policy if exists "thread_metrics_all_anon" on public.thread_metrics_daily;
 drop policy if exists "admin_actions_all_anon" on public.admin_actions_log;
 drop policy if exists "typing_states_all_anon" on public.typing_states;
 drop policy if exists "mood_history_all_anon" on public.member_mood_history;
 drop policy if exists "thread_events_all_anon" on public.thread_events;
 drop policy if exists "presence_snapshots_all_anon" on public.presence_snapshots;
 drop policy if exists "kpi_snapshots_daily_all_anon" on public.kpi_snapshots_daily;
 drop policy if exists "engagement_events_all_anon" on public.engagement_events;
 drop policy if exists "payment_gateway_settings_all_anon" on public.payment_gateway_settings;
 drop policy if exists "thread_quick_facts_all_anon" on public.thread_quick_facts;
 drop policy if exists "member_moderation_all_anon" on public.member_moderation;
 drop policy if exists "payment_gateway_settings_read_all" on public.payment_gateway_settings;
 drop policy if exists "payment_gateway_settings_write_authenticated" on public.payment_gateway_settings;

-- cleanup policy names from previous runs
 drop policy if exists "members_owner_select" on public.members;
 drop policy if exists "members_owner_insert" on public.members;
 drop policy if exists "members_owner_update" on public.members;
 drop policy if exists "members_admin_delete" on public.members;
 drop policy if exists "member_profiles_owner_all" on public.member_profiles;
 drop policy if exists "virtual_profiles_authenticated_read" on public.virtual_profiles;
 drop policy if exists "virtual_profiles_admin_write" on public.virtual_profiles;
 drop policy if exists "messages_owner_or_admin_all" on public.messages;
 drop policy if exists "admin_threads_owner_or_admin_select" on public.admin_threads;
 drop policy if exists "admin_threads_owner_or_admin_upsert" on public.admin_threads;
 drop policy if exists "admin_threads_owner_or_admin_update" on public.admin_threads;
 drop policy if exists "admin_threads_admin_delete" on public.admin_threads;
 drop policy if exists "thread_metrics_admin_all" on public.thread_metrics_daily;
 drop policy if exists "admin_actions_admin_all" on public.admin_actions_log;
 drop policy if exists "typing_states_owner_or_admin_all" on public.typing_states;
 drop policy if exists "mood_history_owner_or_admin_all" on public.member_mood_history;
 drop policy if exists "thread_events_owner_or_admin_all" on public.thread_events;
 drop policy if exists "presence_snapshots_owner_or_admin_all" on public.presence_snapshots;
 drop policy if exists "kpi_snapshots_admin_all" on public.kpi_snapshots_daily;
 drop policy if exists "engagement_owner_or_admin_all" on public.engagement_events;
 drop policy if exists "payment_gateway_settings_admin_all" on public.payment_gateway_settings;
 drop policy if exists "thread_quick_facts_owner_or_admin_all" on public.thread_quick_facts;
 drop policy if exists "member_moderation_admin_all" on public.member_moderation;

create policy "members_owner_select"
  on public.members for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "members_owner_insert"
  on public.members for insert
  to authenticated
  with check (id = auth.uid() or public.is_admin());

create policy "members_owner_update"
  on public.members for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "members_admin_delete"
  on public.members for delete
  to authenticated
  using (public.is_admin());

create policy "member_profiles_owner_all"
  on public.member_profiles for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "virtual_profiles_authenticated_read"
  on public.virtual_profiles for select
  to authenticated
  using (true);

create policy "virtual_profiles_admin_write"
  on public.virtual_profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "messages_owner_or_admin_all"
  on public.messages for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "admin_threads_owner_or_admin_select"
  on public.admin_threads for select
  to authenticated
  using (member_id = auth.uid() or public.is_admin());

create policy "admin_threads_owner_or_admin_upsert"
  on public.admin_threads for insert
  to authenticated
  with check (member_id = auth.uid() or public.is_admin());

create policy "admin_threads_owner_or_admin_update"
  on public.admin_threads for update
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "admin_threads_admin_delete"
  on public.admin_threads for delete
  to authenticated
  using (public.is_admin());

create policy "thread_metrics_admin_all"
  on public.thread_metrics_daily for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin_actions_admin_all"
  on public.admin_actions_log for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "typing_states_owner_or_admin_all"
  on public.typing_states for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "mood_history_owner_or_admin_all"
  on public.member_mood_history for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "thread_events_owner_or_admin_all"
  on public.thread_events for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "presence_snapshots_owner_or_admin_all"
  on public.presence_snapshots for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "kpi_snapshots_admin_all"
  on public.kpi_snapshots_daily for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "engagement_owner_or_admin_all"
  on public.engagement_events for all
  to authenticated
  using (public.is_admin() or member_id = auth.uid())
  with check (public.is_admin() or member_id = auth.uid());

create policy "payment_gateway_settings_admin_all"
  on public.payment_gateway_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "thread_quick_facts_owner_or_admin_all"
  on public.thread_quick_facts for all
  to authenticated
  using (member_id = auth.uid() or public.is_admin())
  with check (member_id = auth.uid() or public.is_admin());

create policy "member_moderation_admin_all"
  on public.member_moderation for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- RPC tabanlı (JWT'siz) istemci uyumluluğu:
-- useAuth local session modelinde auth.uid() olmadığı için member_profiles işlemleri anon tarafından da yapılabilsin.
drop policy if exists "member_profiles_rpc_client_all" on public.member_profiles;
create policy "member_profiles_rpc_client_all"
  on public.member_profiles for all
  to anon, authenticated
  using (true)
  with check (true);
