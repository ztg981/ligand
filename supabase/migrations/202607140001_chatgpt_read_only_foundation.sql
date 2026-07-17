-- Private, read-only Ligand MCP foundation.
-- This migration is inert until assistant_access is explicitly enabled and a
-- ChatGPT OAuth client is added to assistant_oauth_clients.

-- OAuth clients must never receive the full synced Ligand document. Direct
-- Ligand sessions do not contain client_id and retain the existing behavior.
drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own"
  on public.user_data
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

create policy "user_data_insert_own"
  on public.user_data
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

create policy "user_data_update_own"
  on public.user_data
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

create policy "user_data_delete_own"
  on public.user_data
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

-- Global allowlist for OAuth clients. Only database administrators and the
-- Supabase Auth hook can read it; browser and OAuth sessions receive no grant.
create table if not exists public.assistant_oauth_clients (
  client_id       text primary key check (char_length(client_id) between 1 and 500),
  resource_url    text not null check (resource_url ~ '^https://'),
  allowed_user_id uuid not null references auth.users (id) on delete cascade,
  enabled         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.assistant_oauth_clients enable row level security;
revoke all on table public.assistant_oauth_clients from anon;
revoke all on table public.assistant_oauth_clients from authenticated;

drop policy if exists "auth_hook_reads_assistant_oauth_clients"
  on public.assistant_oauth_clients;
create policy "auth_hook_reads_assistant_oauth_clients"
  on public.assistant_oauth_clients
  for select
  to supabase_auth_admin
  using (true);

grant select on table public.assistant_oauth_clients to supabase_auth_admin;

drop trigger if exists assistant_oauth_clients_set_updated_at
  on public.assistant_oauth_clients;
create trigger assistant_oauth_clients_set_updated_at
  before update on public.assistant_oauth_clients
  for each row execute function public.user_data_touch_updated_at();

-- This hook leaves ordinary Ligand tokens unchanged. For an enabled MCP
-- client/user pair it binds the token to the canonical MCP resource and adds
-- an explicit marker/scope that the gateway verifies.
create or replace function public.ligand_custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_client_id text := nullif(event -> 'claims' ->> 'client_id', '');
  v_resource_url text;
  v_allowed_user_id uuid;
begin
  if v_client_id is null then
    return event;
  end if;

  select resource_url, allowed_user_id
    into v_resource_url, v_allowed_user_id
    from public.assistant_oauth_clients
   where client_id = v_client_id
     and enabled = true;

  if not found then
    return event;
  end if;

  if event ->> 'user_id' is distinct from v_allowed_user_id::text then
    raise exception 'user is not allowed for this oauth client' using errcode = '42501';
  end if;

  v_claims := jsonb_set(v_claims, '{aud}', to_jsonb(v_resource_url), true);
  v_claims := jsonb_set(v_claims, '{resource}', to_jsonb(v_resource_url), true);
  v_claims := jsonb_set(v_claims, '{scope}', to_jsonb('openid'::text), true);
  v_claims := jsonb_set(v_claims, '{ligand_mcp}', 'true'::jsonb, true);
  return jsonb_set(event, '{claims}', v_claims, true);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.ligand_custom_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.ligand_custom_access_token_hook(jsonb)
  from public, anon, authenticated;

-- Per-user, deny-by-default content selection. A separate app screen will
-- manage this row using a normal Ligand session, never an OAuth session.
create table if not exists public.assistant_access (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  enabled                boolean not null default false,
  tasks_read             boolean not null default false,
  tasks_write            boolean not null default false,
  allow_unassigned_tasks boolean not null default false,
  allowed_goal_ids       text[] not null default array[]::text[],
  timezone               text not null default 'UTC'
                         check (char_length(timezone) between 1 and 100),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.assistant_access enable row level security;
revoke all on table public.assistant_access from anon;
revoke all on table public.assistant_access from authenticated;
grant select, insert, update, delete on table public.assistant_access to authenticated;

drop policy if exists "assistant_access_select_own_direct"
  on public.assistant_access;
drop policy if exists "assistant_access_insert_own_direct"
  on public.assistant_access;
drop policy if exists "assistant_access_update_own_direct"
  on public.assistant_access;
drop policy if exists "assistant_access_delete_own_direct"
  on public.assistant_access;

create policy "assistant_access_select_own_direct"
  on public.assistant_access for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "assistant_access_insert_own_direct"
  on public.assistant_access for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "assistant_access_update_own_direct"
  on public.assistant_access for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "assistant_access_delete_own_direct"
  on public.assistant_access for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

drop trigger if exists assistant_access_set_updated_at on public.assistant_access;
create trigger assistant_access_set_updated_at
  before update on public.assistant_access
  for each row execute function public.user_data_touch_updated_at();

-- No content is stored here. The log intentionally excludes task/goal text,
-- request bodies, prompts, responses, tokens, and authorization headers.
create table if not exists public.assistant_audit_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  client_id    text not null,
  tool_name    text not null check (char_length(tool_name) between 1 and 80),
  action_class text not null check (action_class in ('read', 'write')),
  outcome      text not null check (outcome in ('success', 'denied', 'error')),
  item_count   integer check (item_count between 0 and 10000),
  request_id   text check (request_id is null or char_length(request_id) <= 100),
  created_at   timestamptz not null default now()
);

alter table public.assistant_audit_log enable row level security;
revoke all on table public.assistant_audit_log from anon;
revoke all on table public.assistant_audit_log from authenticated;
grant select, delete on table public.assistant_audit_log to authenticated;

drop policy if exists "assistant_audit_select_own_direct"
  on public.assistant_audit_log;
drop policy if exists "assistant_audit_delete_own_direct"
  on public.assistant_audit_log;
create policy "assistant_audit_select_own_direct"
  on public.assistant_audit_log for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "assistant_audit_delete_own_direct"
  on public.assistant_audit_log for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

create index if not exists assistant_audit_log_user_created_idx
  on public.assistant_audit_log (user_id, created_at desc);

-- Private fixed-window counters. OAuth/browser sessions have no direct table
-- access; the read RPC consumes one slot after validating the exact client,
-- resource, and user binding.
create table if not exists public.assistant_rate_limits (
  user_id       uuid not null references auth.users (id) on delete cascade,
  client_id     text not null,
  tool_name     text not null check (char_length(tool_name) between 1 and 80),
  bucket_start  timestamptz not null,
  request_count integer not null default 0
                check (request_count between 0 and 10000),
  updated_at    timestamptz not null default now(),
  primary key (user_id, client_id, tool_name, bucket_start)
);

alter table public.assistant_rate_limits enable row level security;
revoke all on table public.assistant_rate_limits from anon;
revoke all on table public.assistant_rate_limits from authenticated;

create index if not exists assistant_rate_limits_updated_at_idx
  on public.assistant_rate_limits (updated_at);

-- The only OAuth read path in phase 1. It projects a fixed field allowlist,
-- requires explicit per-goal sharing, and hard-excludes recovery goals even
-- if their IDs were accidentally placed in allowed_goal_ids.
create or replace function public.assistant_get_tasks(
  p_focus text default 'today',
  p_status text default 'open',
  p_limit integer default 50,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_id text := nullif(auth.jwt() ->> 'client_id', '');
  v_resource_url text;
  v_allow_unassigned boolean;
  v_allowed_goal_ids text[];
  v_core jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_returned integer := 0;
  v_rate_count integer;
  v_rate_bucket timestamptz;
begin
  if v_user_id is null or v_client_id is null then
    raise exception 'oauth authentication required' using errcode = '28000';
  end if;
  if auth.jwt() -> 'ligand_mcp' is distinct from 'true'::jsonb
     or auth.jwt() ->> 'scope' <> 'openid' then
    raise exception 'oauth token is not authorized for ligand mcp' using errcode = '42501';
  end if;

  select resource_url
    into v_resource_url
    from public.assistant_oauth_clients
   where client_id = v_client_id
     and allowed_user_id = v_user_id
     and enabled = true;

  if not found
     or auth.jwt() ->> 'resource' is distinct from v_resource_url
     or not (
       auth.jwt() ->> 'aud' = v_resource_url
       or (
         jsonb_typeof(auth.jwt() -> 'aud') = 'array'
         and (auth.jwt() -> 'aud') ? v_resource_url
       )
     ) then
    raise exception 'oauth client or resource is not allowed' using errcode = '42501';
  end if;
  if p_focus not in ('today', 'all') then
    raise exception 'invalid focus' using errcode = '22023';
  end if;
  if p_status not in ('open', 'completed', 'all') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;

  v_rate_bucket := date_trunc('minute', clock_timestamp());
  insert into public.assistant_rate_limits as limits (
    user_id, client_id, tool_name, bucket_start, request_count, updated_at
  ) values (
    v_user_id, v_client_id, 'get_tasks', v_rate_bucket, 1, now()
  )
  on conflict (user_id, client_id, tool_name, bucket_start)
  do update
    set request_count = limits.request_count + 1,
        updated_at = now()
    where limits.request_count < 60
  returning request_count into v_rate_count;

  if v_rate_count is null then
    raise exception 'assistant rate limit exceeded' using errcode = '57014';
  end if;

  select allow_unassigned_tasks, allowed_goal_ids
    into v_allow_unassigned, v_allowed_goal_ids
    from public.assistant_access
   where user_id = v_user_id
     and enabled = true
     and tasks_read = true;

  if not found then
    raise exception 'assistant task access is disabled' using errcode = '42501';
  end if;

  select coalesce(data -> 'ligand.data', '{}'::jsonb)
    into v_core
    from public.user_data
   where user_id = v_user_id;
  v_core := coalesce(v_core, '{}'::jsonb);

  with goal_rows as (
    select goal
      from jsonb_array_elements(
        case when jsonb_typeof(v_core -> 'goals') = 'array'
          then v_core -> 'goals' else '[]'::jsonb end
      ) as rows(goal)
  ),
  visible_goals as (
    select left(goal ->> 'id', 200) as id,
           left(goal ->> 'name', 120) as name
      from goal_rows
     where goal ->> 'id' = any(v_allowed_goal_ids)
       and coalesce(goal ->> 'type', 'custom') <> 'recovery'
  ),
  task_rows as (
    select task, ordinality
      from jsonb_array_elements(
        case when jsonb_typeof(v_core -> 'tasks') = 'array'
          then v_core -> 'tasks' else '[]'::jsonb end
      ) with ordinality as rows(task, ordinality)
  ),
  filtered as (
    select task_rows.task,
           task_rows.ordinality,
           visible_goals.id as visible_goal_id,
           visible_goals.name as visible_goal_name,
           case when lower(coalesce(task_rows.task ->> 'done', 'false')) = 'true'
             then true else false end as is_done
      from task_rows
      left join visible_goals
        on visible_goals.id = nullif(task_rows.task ->> 'goalId', '')
     where (
       (nullif(task_rows.task ->> 'goalId', '') is null and v_allow_unassigned)
       or visible_goals.id is not null
     )
  ),
  scoped as (
    select *, row_number() over (order by ordinality) as result_number
      from filtered
     where (p_focus = 'all' or task ->> 'label' in ('Today', 'Urgent'))
       and (
         p_status = 'all'
         or (p_status = 'open' and is_done = false)
         or (p_status = 'completed' and is_done = true)
       )
  ),
  projected as (
    select result_number,
           jsonb_strip_nulls(jsonb_build_object(
             'id', left(task ->> 'id', 200),
             'text', left(coalesce(task ->> 'text', ''), 500),
             'label', left(task ->> 'label', 80),
             'goalId', visible_goal_id,
             'goalName', visible_goal_name,
             'term', left(task ->> 'term', 40),
             'repeat', case when jsonb_typeof(task -> 'repeat') = 'object'
               then task -> 'repeat' else null end,
             'done', is_done,
             'completedOn', left(task ->> 'completedOn', 10),
             'createdAt', left(task ->> 'createdAt', 40)
           )) as projected_task
      from scoped
  )
  select coalesce(
           jsonb_agg(projected_task order by result_number)
             filter (where result_number <= p_limit),
           '[]'::jsonb
         ),
         count(*)::integer
    into v_tasks, v_total
    from projected;

  v_returned := jsonb_array_length(v_tasks);
  insert into public.assistant_audit_log (
    user_id, client_id, tool_name, action_class, outcome, item_count, request_id
  ) values (
    v_user_id,
    v_client_id,
    'get_tasks',
    'read',
    'success',
    v_returned,
    left(p_request_id, 100)
  );

  return jsonb_build_object(
    'focus', p_focus,
    'status', p_status,
    'tasks', v_tasks,
    'count', v_returned,
    'truncated', v_total > p_limit
  );
end;
$$;

revoke all on function public.assistant_get_tasks(text, text, integer, text)
  from public;
revoke all on function public.assistant_get_tasks(text, text, integer, text)
  from anon;
grant execute on function public.assistant_get_tasks(text, text, integer, text)
  to authenticated;
