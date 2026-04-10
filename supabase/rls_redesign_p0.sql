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
