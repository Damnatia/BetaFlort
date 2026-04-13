-- Kullanıcı adı tabanlı kayıt/giriş için gerekli minimum kurulum
-- Bu dosyayı Supabase SQL Editor'da tek sefer çalıştır.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

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
  returning * into new_member;

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

-- RPC tabanlı (JWT'siz) istemci akışı için coin/profil erişim uyumluluğu
do $$
begin
  if to_regclass('public.member_profiles') is not null then
    alter table public.member_profiles enable row level security;
    drop policy if exists "member_profiles_rpc_client_all" on public.member_profiles;
    create policy "member_profiles_rpc_client_all"
      on public.member_profiles for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if to_regclass('public.payment_gateway_settings') is not null then
    alter table public.payment_gateway_settings enable row level security;
    drop policy if exists "payment_gateway_settings_public_read_rpc" on public.payment_gateway_settings;
    create policy "payment_gateway_settings_public_read_rpc"
      on public.payment_gateway_settings for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- RPC endpoint doğrulaması (opsiyonel)
-- select * from public.member_sign_up('deneme_kullanici', '123456');
-- select * from public.member_sign_in('deneme_kullanici', '123456');
