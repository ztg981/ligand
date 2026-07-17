-- Conflict-safe task records for Ligand clients and future assistant writes.
-- The existing user_data JSON task array remains a compatibility/offline cache,
-- but this table becomes authoritative once the app reconciliation path ships.

create table if not exists public.task_records (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null check (char_length(id) between 1 and 200),
  text          text not null default '' check (char_length(text) <= 500),
  label         text check (label is null or char_length(label) <= 80),
  goal_id       text check (goal_id is null or char_length(goal_id) <= 200),
  term          text check (term is null or term in ('short', 'long')),
  repeat        jsonb check (repeat is null or jsonb_typeof(repeat) = 'object'),
  scheduled_for date,
  done          boolean not null default false,
  completed_on  date,
  version       bigint not null default 1 check (version >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (user_id, id)
);

alter table public.task_records enable row level security;
revoke all on table public.task_records from anon;
revoke all on table public.task_records from authenticated;
-- Direct clients may read through owner-only RLS, but every mutation must use
-- task_record_apply so version checks cannot be bypassed accidentally.
grant select on table public.task_records to authenticated;

drop policy if exists "task_records_select_own_direct" on public.task_records;
drop policy if exists "task_records_insert_own_direct" on public.task_records;
drop policy if exists "task_records_update_own_direct" on public.task_records;
drop policy if exists "task_records_delete_own_direct" on public.task_records;

create policy "task_records_select_own_direct"
  on public.task_records for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "task_records_insert_own_direct"
  on public.task_records for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "task_records_update_own_direct"
  on public.task_records for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "task_records_delete_own_direct"
  on public.task_records for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );

create index if not exists task_records_user_active_updated_idx
  on public.task_records (user_id, updated_at desc)
  where deleted_at is null;
create index if not exists task_records_user_scheduled_idx
  on public.task_records (user_id, scheduled_for)
  where deleted_at is null;

-- Preserve every existing task, including sensitive/private goal tasks. The
-- table itself is user-private; assistant filtering happens in narrow RPCs.
insert into public.task_records (
  user_id,
  id,
  text,
  label,
  goal_id,
  term,
  repeat,
  scheduled_for,
  done,
  completed_on,
  version,
  created_at,
  updated_at
)
select
  source.user_id,
  left(source.task ->> 'id', 200),
  left(coalesce(source.task ->> 'text', ''), 500),
  left(source.task ->> 'label', 80),
  left(nullif(source.task ->> 'goalId', ''), 200),
  case when source.task ->> 'term' in ('short', 'long')
    then source.task ->> 'term' else null end,
  case when jsonb_typeof(source.task -> 'repeat') = 'object'
    then source.task -> 'repeat' else null end,
  case when source.task ->> 'scheduledFor' ~ '^\d{4}-\d{2}-\d{2}$'
    then (source.task ->> 'scheduledFor')::date else null end,
  lower(coalesce(source.task ->> 'done', 'false')) = 'true',
  case when source.task ->> 'completedOn' ~ '^\d{4}-\d{2}-\d{2}$'
    then (source.task ->> 'completedOn')::date else null end,
  1,
  case when source.task ->> 'createdAt' ~ '^\d{4}-\d{2}-\d{2}'
    then (left(source.task ->> 'createdAt', 10) || 'T00:00:00Z')::timestamptz
    else source.document_updated_at end,
  source.document_updated_at
from (
  select
    rows.user_id,
    rows.updated_at as document_updated_at,
    task
  from public.user_data as rows
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(rows.data -> 'ligand.data' -> 'tasks') = 'array'
        then rows.data -> 'ligand.data' -> 'tasks'
      else '[]'::jsonb
    end
  ) as task_rows(task)
) as source
where nullif(source.task ->> 'id', '') is not null
on conflict (user_id, id) do nothing;

-- Fixed projection used by direct app sync and assistant results. This is not
-- exposed as a standalone RPC.
create or replace function public.task_record_to_json(task public.task_records)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', task.id,
    'text', task.text,
    'label', task.label,
    'goalId', task.goal_id,
    'term', task.term,
    'repeat', task.repeat,
    'scheduledFor', task.scheduled_for::text,
    'done', task.done,
    'completedOn', task.completed_on::text,
    'version', task.version,
    'createdAt', task.created_at,
    'updatedAt', task.updated_at,
    'deleted', task.deleted_at is not null
  ))
$$;

revoke execute on function public.task_record_to_json(public.task_records)
  from public, anon, authenticated;

-- Direct Ligand clients save one record at a time with an expected version.
-- Conflicts return the authoritative record and never overwrite it.
create or replace function public.task_record_apply(
  p_task jsonb,
  p_expected_version bigint,
  p_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id text := nullif(p_task ->> 'id', '');
  v_existing public.task_records%rowtype;
  v_saved public.task_records%rowtype;
  v_scheduled_for date;
  v_completed_on date;
  v_created_at timestamptz;
begin
  if v_user_id is null or nullif(auth.jwt() ->> 'client_id', '') is not null then
    raise exception 'direct ligand authentication required' using errcode = '28000';
  end if;
  if v_id is null or char_length(v_id) > 200 then
    raise exception 'invalid task id' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'invalid expected version' using errcode = '22023';
  end if;
  if char_length(coalesce(p_task ->> 'text', '')) > 500
     or char_length(coalesce(p_task ->> 'label', '')) > 80
     or char_length(coalesce(p_task ->> 'goalId', '')) > 200 then
    raise exception 'task field is too long' using errcode = '22023';
  end if;
  if nullif(p_task ->> 'term', '') is not null
     and p_task ->> 'term' not in ('short', 'long') then
    raise exception 'invalid task term' using errcode = '22023';
  end if;
  if p_task ? 'repeat'
     and p_task -> 'repeat' is not null
     and jsonb_typeof(p_task -> 'repeat') <> 'object' then
    raise exception 'invalid task repeat' using errcode = '22023';
  end if;
  if nullif(p_task ->> 'scheduledFor', '') is not null then
    if p_task ->> 'scheduledFor' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid scheduled date' using errcode = '22023';
    end if;
    v_scheduled_for := (p_task ->> 'scheduledFor')::date;
  end if;
  if nullif(p_task ->> 'completedOn', '') is not null then
    if p_task ->> 'completedOn' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid completed date' using errcode = '22023';
    end if;
    v_completed_on := (p_task ->> 'completedOn')::date;
  end if;
  begin
    v_created_at := coalesce(nullif(p_task ->> 'createdAt', '')::timestamptz, now());
  exception when others then
    raise exception 'invalid created timestamp' using errcode = '22023';
  end;

  select * into v_existing
    from public.task_records
   where user_id = v_user_id and id = v_id
   for update;

  if not found then
    if p_delete then
      return jsonb_build_object('status', 'missing', 'taskId', v_id);
    end if;
    if p_expected_version <> 0 then
      return jsonb_build_object('status', 'conflict', 'taskId', v_id);
    end if;

    insert into public.task_records (
      user_id, id, text, label, goal_id, term, repeat, scheduled_for,
      done, completed_on, version, created_at, updated_at, deleted_at
    ) values (
      v_user_id,
      v_id,
      left(coalesce(p_task ->> 'text', ''), 500),
      nullif(left(p_task ->> 'label', 80), ''),
      nullif(left(p_task ->> 'goalId', 200), ''),
      nullif(p_task ->> 'term', ''),
      case when jsonb_typeof(p_task -> 'repeat') = 'object'
        then p_task -> 'repeat' else null end,
      v_scheduled_for,
      lower(coalesce(p_task ->> 'done', 'false')) = 'true',
      v_completed_on,
      1,
      v_created_at,
      now(),
      null
    ) returning * into v_saved;
    return jsonb_build_object(
      'status', 'created',
      'task', public.task_record_to_json(v_saved)
    );
  end if;

  if v_existing.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'task', public.task_record_to_json(v_existing)
    );
  end if;

  if p_delete then
    update public.task_records
       set deleted_at = now(), updated_at = now(), version = version + 1
     where user_id = v_user_id and id = v_id
     returning * into v_saved;
    return jsonb_build_object(
      'status', 'deleted',
      'task', public.task_record_to_json(v_saved)
    );
  end if;

  update public.task_records
     set text = left(coalesce(p_task ->> 'text', ''), 500),
         label = nullif(left(p_task ->> 'label', 80), ''),
         goal_id = nullif(left(p_task ->> 'goalId', 200), ''),
         term = nullif(p_task ->> 'term', ''),
         repeat = case when jsonb_typeof(p_task -> 'repeat') = 'object'
           then p_task -> 'repeat' else null end,
         scheduled_for = v_scheduled_for,
         done = lower(coalesce(p_task ->> 'done', 'false')) = 'true',
         completed_on = v_completed_on,
         updated_at = now(),
         deleted_at = null,
         version = version + 1
   where user_id = v_user_id and id = v_id
   returning * into v_saved;

  return jsonb_build_object(
    'status', 'updated',
    'task', public.task_record_to_json(v_saved)
  );
end;
$$;

revoke all on function public.task_record_apply(jsonb, bigint, boolean)
  from public, anon;
grant execute on function public.task_record_apply(jsonb, bigint, boolean)
  to authenticated;

-- Central OAuth/app-access assertion reused by read and write RPCs. It returns
-- only authorization metadata for the authenticated user.
create or replace function public.assistant_authorize(
  p_require_write boolean default false
)
returns table (
  user_id uuid,
  client_id text,
  allowed_goal_ids text[],
  allow_unassigned_tasks boolean,
  timezone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_id text := nullif(auth.jwt() ->> 'client_id', '');
  v_resource_url text;
begin
  if v_user_id is null or v_client_id is null then
    raise exception 'oauth authentication required' using errcode = '28000';
  end if;
  if auth.jwt() -> 'ligand_mcp' is distinct from 'true'::jsonb
     or auth.jwt() ->> 'scope' <> 'openid' then
    raise exception 'oauth token is not authorized for ligand mcp' using errcode = '42501';
  end if;

  select clients.resource_url
    into v_resource_url
    from public.assistant_oauth_clients as clients
   where clients.client_id = v_client_id
     and clients.allowed_user_id = v_user_id
     and clients.enabled = true;

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

  return query
  select access.user_id,
         v_client_id,
         access.allowed_goal_ids,
         access.allow_unassigned_tasks,
         access.timezone
    from public.assistant_access as access
   where access.user_id = v_user_id
     and access.enabled = true
     and access.tasks_read = true
     and (not p_require_write or access.tasks_write = true);

  if not found then
    raise exception 'assistant task access is disabled' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assistant_authorize(boolean) from public, anon;
grant execute on function public.assistant_authorize(boolean) to authenticated;

-- Replace the JSON-document read with authoritative records while preserving
-- the same narrow field projection and hard recovery-goal exclusion.
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
  v_auth record;
  v_tasks jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_returned integer := 0;
  v_rate_count integer;
  v_rate_bucket timestamptz;
  v_today date;
begin
  select * into v_auth from public.assistant_authorize(false);
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
    v_auth.user_id, v_auth.client_id, 'get_tasks', v_rate_bucket, 1, now()
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

  begin
    v_today := (clock_timestamp() at time zone v_auth.timezone)::date;
  exception when others then
    raise exception 'invalid assistant timezone' using errcode = '22023';
  end;

  with goal_rows as (
    select goal
      from public.user_data as documents
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(documents.data -> 'ligand.data' -> 'goals') = 'array'
          then documents.data -> 'ligand.data' -> 'goals' else '[]'::jsonb end
      ) as goal_rows(goal)
     where documents.user_id = v_auth.user_id
  ),
  visible_goals as (
    select goal ->> 'id' as id,
           left(goal ->> 'name', 120) as name
      from goal_rows
     where goal ->> 'id' = any(v_auth.allowed_goal_ids)
       and coalesce(goal ->> 'type', 'custom') <> 'recovery'
  ),
  filtered as (
    select records as task_record,
           visible_goals.name as goal_name,
           row_number() over (order by records.updated_at desc, records.id) as result_number
      from public.task_records as records
      left join visible_goals on visible_goals.id = records.goal_id
     where records.user_id = v_auth.user_id
       and records.deleted_at is null
       and (
         (records.goal_id is null and v_auth.allow_unassigned_tasks)
         or visible_goals.id is not null
       )
       and (
         p_focus = 'all'
         or records.scheduled_for = v_today
         or (records.scheduled_for is null and records.label in ('Today', 'Urgent'))
       )
       and (
         p_status = 'all'
         or (p_status = 'open' and records.done = false)
         or (p_status = 'completed' and records.done = true)
       )
  ),
  projected as (
    select result_number,
           jsonb_strip_nulls((public.task_record_to_json(task_record)
             || jsonb_build_object('goalName', goal_name))
             - 'deleted') as projected_task
      from filtered
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
    v_auth.user_id,
    v_auth.client_id,
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
  from public, anon;
grant execute on function public.assistant_get_tasks(text, text, integer, text)
  to authenticated;
