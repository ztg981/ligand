-- Ligand security hardening: explicit RLS grants plus server-side AI rate limits.
-- Apply with the Supabase CLI or dashboard SQL editor before deploying the
-- hardened gemini-insights Edge Function.

-- ---------------------------------------------------------------------------
-- user_data: one JSON blob per authenticated user.
-- ---------------------------------------------------------------------------
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

revoke all on table public.user_data from anon;
revoke all on table public.user_data from authenticated;
grant select, insert, update, delete on table public.user_data to authenticated;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own"
  on public.user_data
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_data_insert_own"
  on public.user_data
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_data_update_own"
  on public.user_data
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "user_data_delete_own"
  on public.user_data
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.user_data_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute function public.user_data_touch_updated_at();

-- ---------------------------------------------------------------------------
-- ai_rate_limits: private quota state consumed through one SECURITY DEFINER RPC.
-- Direct table access stays revoked so a browser client cannot reset counters.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_rate_limits (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  action        text        not null,
  bucket_start  timestamptz not null,
  request_count integer     not null default 0 check (request_count >= 0 and request_count <= 10000),
  updated_at    timestamptz not null default now(),
  primary key (user_id, action, bucket_start)
);

alter table public.ai_rate_limits enable row level security;
revoke all on table public.ai_rate_limits from anon;
revoke all on table public.ai_rate_limits from authenticated;

create index if not exists ai_rate_limits_updated_at_idx
  on public.ai_rate_limits (updated_at);

create or replace function public.consume_ai_rate_limit(
  p_action text,
  p_max_requests integer default 30,
  p_window_seconds integer default 3600
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(coalesce(p_action, ''));
  v_bucket timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if v_action not in (
    'goal-summary',
    'overdue-advice',
    'journal-prompt',
    'weekly_review',
    'import_workout',
    'recovery_insight'
  ) then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  if p_max_requests is null or p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'invalid max requests' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid window' using errcode = '22023';
  end if;

  v_bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.ai_rate_limits as limits (
    user_id,
    action,
    bucket_start,
    request_count,
    updated_at
  )
  values (v_user_id, v_action, v_bucket, 1, now())
  on conflict (user_id, action, bucket_start)
  do update
    set request_count = limits.request_count + 1,
        updated_at = now()
    where limits.request_count < p_max_requests
  returning request_count into v_count;

  if v_count is null then
    select request_count
      into v_count
      from public.ai_rate_limits
      where user_id = v_user_id
        and action = v_action
        and bucket_start = v_bucket;
    allowed := false;
    remaining := 0;
  else
    allowed := true;
    remaining := greatest(p_max_requests - v_count, 0);
  end if;

  reset_at := v_bucket + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

revoke all on function public.consume_ai_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_ai_rate_limit(text, integer, integer) from anon;
grant execute on function public.consume_ai_rate_limit(text, integer, integer) to authenticated;
