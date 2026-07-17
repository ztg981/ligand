-- Narrow, opt-in assistant task writes. These functions remain unreachable
-- unless both the deployment exposes write tools and assistant_access.tasks_write
-- is explicitly enabled by the user. There is intentionally no delete tool.

alter table public.assistant_audit_log
  drop constraint if exists assistant_audit_log_outcome_check;
alter table public.assistant_audit_log
  add constraint assistant_audit_log_outcome_check
  check (outcome in ('success', 'denied', 'error', 'conflict', 'replayed'));

-- Stores no task text or request bodies: only a digest, task id, and resulting
-- version needed to make retries safe.
create table if not exists public.assistant_idempotency (
  user_id        uuid not null references auth.users (id) on delete cascade,
  client_id      text not null,
  tool_name      text not null check (char_length(tool_name) between 1 and 80),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  request_hash   text not null check (char_length(request_hash) = 32),
  task_id        text,
  result_version bigint,
  created_at     timestamptz not null default now(),
  primary key (user_id, client_id, tool_name, idempotency_key)
);

alter table public.assistant_idempotency enable row level security;
revoke all on table public.assistant_idempotency from public, anon, authenticated;
create index if not exists assistant_idempotency_created_at_idx
  on public.assistant_idempotency (created_at);

create or replace function public.assistant_consume_write_rate(
  p_user_id uuid,
  p_client_id text,
  p_tool_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  -- Twenty write attempts per tool in each rolling-aligned five-minute bucket.
  v_bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 300) * 300
  );
  insert into public.assistant_rate_limits as limits (
    user_id, client_id, tool_name, bucket_start, request_count, updated_at
  ) values (
    p_user_id, p_client_id, p_tool_name, v_bucket, 1, now()
  )
  on conflict (user_id, client_id, tool_name, bucket_start)
  do update
    set request_count = limits.request_count + 1,
        updated_at = now()
    where limits.request_count < 20
  returning request_count into v_count;

  if v_count is null then
    raise exception 'assistant write rate limit exceeded' using errcode = '57014';
  end if;
end;
$$;

revoke all on function public.assistant_consume_write_rate(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.assistant_task_in_scope(
  p_user_id uuid,
  p_goal_id text,
  p_allowed_goal_ids text[],
  p_allow_unassigned boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_goal_id is null then p_allow_unassigned
    else p_goal_id = any(p_allowed_goal_ids)
      and exists (
        select 1
          from public.user_data as documents
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(documents.data -> 'ligand.data' -> 'goals') = 'array'
              then documents.data -> 'ligand.data' -> 'goals' else '[]'::jsonb end
          ) as goal_rows(goal)
         where documents.user_id = p_user_id
           and goal ->> 'id' = p_goal_id
           and coalesce(goal ->> 'type', 'custom') <> 'recovery'
      )
  end
$$;

revoke all on function public.assistant_task_in_scope(uuid, text, text[], boolean)
  from public, anon, authenticated;

create or replace function public.assistant_write_audit(
  p_user_id uuid,
  p_client_id text,
  p_tool_name text,
  p_outcome text,
  p_item_count integer,
  p_request_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.assistant_audit_log (
    user_id, client_id, tool_name, action_class, outcome, item_count, request_id
  ) values (
    p_user_id,
    p_client_id,
    p_tool_name,
    'write',
    p_outcome,
    p_item_count,
    left(p_request_id, 100)
  )
$$;

revoke all on function public.assistant_write_audit(uuid, text, text, text, integer, text)
  from public, anon, authenticated;

create or replace function public.assistant_add_task(
  p_text text,
  p_goal_id text,
  p_label text,
  p_term text,
  p_scheduled_for date,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_hash text;
  v_claimed boolean := false;
  v_saved public.task_records%rowtype;
  v_existing_hash text;
  v_existing_task_id text;
  v_task_id text;
begin
  select * into v_auth from public.assistant_authorize(true);
  if p_text is null or char_length(btrim(p_text)) < 1 or char_length(p_text) > 500 then
    raise exception 'invalid task text' using errcode = '22023';
  end if;
  if p_goal_id is not null and char_length(p_goal_id) > 200 then
    raise exception 'invalid goal id' using errcode = '22023';
  end if;
  if p_label not in ('General', 'Today', 'Urgent') then
    raise exception 'invalid task label' using errcode = '22023';
  end if;
  if p_term not in ('short', 'long') then
    raise exception 'invalid task term' using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,100}$' then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;
  if not public.assistant_task_in_scope(
    v_auth.user_id, p_goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
  ) then
    raise exception 'task goal is outside assistant access' using errcode = '42501';
  end if;

  perform public.assistant_consume_write_rate(
    v_auth.user_id, v_auth.client_id, 'add_task'
  );
  v_hash := md5(jsonb_build_object(
    'text', p_text,
    'goalId', p_goal_id,
    'label', p_label,
    'term', p_term,
    'scheduledFor', p_scheduled_for
  )::text);
  v_task_id := 'assistant_' || md5(
    v_auth.user_id::text || ':' || v_auth.client_id || ':' || p_idempotency_key
  );

  insert into public.assistant_idempotency (
    user_id, client_id, tool_name, idempotency_key, request_hash
  ) values (
    v_auth.user_id, v_auth.client_id, 'add_task', p_idempotency_key, v_hash
  )
  on conflict do nothing
  returning true into v_claimed;

  if not coalesce(v_claimed, false) then
    select request_hash, task_id
      into v_existing_hash, v_existing_task_id
      from public.assistant_idempotency
     where user_id = v_auth.user_id
       and client_id = v_auth.client_id
       and tool_name = 'add_task'
       and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from v_hash then
      raise exception 'idempotency key was already used for different arguments'
        using errcode = '22023';
    end if;
    select * into v_saved
      from public.task_records
     where user_id = v_auth.user_id and id = v_existing_task_id;
    perform public.assistant_write_audit(
      v_auth.user_id, v_auth.client_id, 'add_task', 'replayed', 0, p_request_id
    );
    return jsonb_build_object(
      'status', 'replayed',
      'task', public.task_record_to_json(v_saved)
    );
  end if;

  insert into public.task_records (
    user_id, id, text, label, goal_id, term, repeat, scheduled_for,
    done, completed_on, version, created_at, updated_at, deleted_at
  ) values (
    v_auth.user_id,
    v_task_id,
    p_text,
    p_label,
    p_goal_id,
    p_term,
    null,
    p_scheduled_for,
    false,
    null,
    1,
    now(),
    now(),
    null
  ) returning * into v_saved;

  update public.assistant_idempotency
     set task_id = v_saved.id, result_version = v_saved.version
   where user_id = v_auth.user_id
     and client_id = v_auth.client_id
     and tool_name = 'add_task'
     and idempotency_key = p_idempotency_key;
  perform public.assistant_write_audit(
    v_auth.user_id, v_auth.client_id, 'add_task', 'success', 1, p_request_id
  );
  return jsonb_build_object(
    'status', 'created',
    'task', public.task_record_to_json(v_saved)
  );
end;
$$;

revoke all on function public.assistant_add_task(text, text, text, text, date, text, text)
  from public, anon;
grant execute on function public.assistant_add_task(text, text, text, text, date, text, text)
  to authenticated;

create or replace function public.assistant_complete_task(
  p_task_id text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_hash text;
  v_claimed boolean := false;
  v_existing_hash text;
  v_existing_task_id text;
  v_task public.task_records%rowtype;
  v_today date;
begin
  select * into v_auth from public.assistant_authorize(true);
  if p_task_id is null or char_length(p_task_id) < 1 or char_length(p_task_id) > 200
     or p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid task id or version' using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,100}$' then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select * into v_task
    from public.task_records
   where user_id = v_auth.user_id and id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if not public.assistant_task_in_scope(
    v_auth.user_id, v_task.goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
  ) then
    raise exception 'task is outside assistant access' using errcode = '42501';
  end if;

  perform public.assistant_consume_write_rate(
    v_auth.user_id, v_auth.client_id, 'complete_task'
  );
  v_hash := md5(jsonb_build_object(
    'taskId', p_task_id, 'expectedVersion', p_expected_version
  )::text);
  insert into public.assistant_idempotency (
    user_id, client_id, tool_name, idempotency_key, request_hash
  ) values (
    v_auth.user_id, v_auth.client_id, 'complete_task', p_idempotency_key, v_hash
  )
  on conflict do nothing
  returning true into v_claimed;

  if not coalesce(v_claimed, false) then
    select request_hash, task_id
      into v_existing_hash, v_existing_task_id
      from public.assistant_idempotency
     where user_id = v_auth.user_id
       and client_id = v_auth.client_id
       and tool_name = 'complete_task'
       and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from v_hash then
      raise exception 'idempotency key was already used for different arguments'
        using errcode = '22023';
    end if;
    select * into v_task
      from public.task_records
     where user_id = v_auth.user_id and id = v_existing_task_id;
    perform public.assistant_write_audit(
      v_auth.user_id, v_auth.client_id, 'complete_task', 'replayed', 0, p_request_id
    );
    return jsonb_build_object(
      'status', 'replayed',
      'task', public.task_record_to_json(v_task)
    );
  end if;

  select * into v_task
    from public.task_records
   where user_id = v_auth.user_id and id = p_task_id and deleted_at is null
   for update;
  if v_task.version <> p_expected_version then
    update public.assistant_idempotency
       set task_id = v_task.id, result_version = v_task.version
     where user_id = v_auth.user_id and client_id = v_auth.client_id
       and tool_name = 'complete_task' and idempotency_key = p_idempotency_key;
    perform public.assistant_write_audit(
      v_auth.user_id, v_auth.client_id, 'complete_task', 'conflict', 0, p_request_id
    );
    return jsonb_build_object(
      'status', 'conflict',
      'task', public.task_record_to_json(v_task)
    );
  end if;

  begin
    v_today := (clock_timestamp() at time zone v_auth.timezone)::date;
  exception when others then
    raise exception 'invalid assistant timezone' using errcode = '22023';
  end;
  update public.task_records
     set done = true,
         completed_on = v_today,
         version = version + 1,
         updated_at = now()
   where user_id = v_auth.user_id and id = p_task_id
   returning * into v_task;
  update public.assistant_idempotency
     set task_id = v_task.id, result_version = v_task.version
   where user_id = v_auth.user_id and client_id = v_auth.client_id
     and tool_name = 'complete_task' and idempotency_key = p_idempotency_key;
  perform public.assistant_write_audit(
    v_auth.user_id, v_auth.client_id, 'complete_task', 'success', 1, p_request_id
  );
  return jsonb_build_object(
    'status', 'completed',
    'task', public.task_record_to_json(v_task)
  );
end;
$$;

revoke all on function public.assistant_complete_task(text, bigint, text, text)
  from public, anon;
grant execute on function public.assistant_complete_task(text, bigint, text, text)
  to authenticated;

create or replace function public.assistant_reschedule_task(
  p_task_id text,
  p_expected_version bigint,
  p_scheduled_for date,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_hash text;
  v_claimed boolean := false;
  v_existing_hash text;
  v_existing_task_id text;
  v_task public.task_records%rowtype;
begin
  select * into v_auth from public.assistant_authorize(true);
  if p_task_id is null or char_length(p_task_id) < 1 or char_length(p_task_id) > 200
     or p_expected_version is null or p_expected_version < 1 then
    raise exception 'invalid task id or version' using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,100}$' then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  select * into v_task
    from public.task_records
   where user_id = v_auth.user_id and id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if not public.assistant_task_in_scope(
    v_auth.user_id, v_task.goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
  ) then
    raise exception 'task is outside assistant access' using errcode = '42501';
  end if;

  perform public.assistant_consume_write_rate(
    v_auth.user_id, v_auth.client_id, 'reschedule_task'
  );
  v_hash := md5(jsonb_build_object(
    'taskId', p_task_id,
    'expectedVersion', p_expected_version,
    'scheduledFor', p_scheduled_for
  )::text);
  insert into public.assistant_idempotency (
    user_id, client_id, tool_name, idempotency_key, request_hash
  ) values (
    v_auth.user_id, v_auth.client_id, 'reschedule_task', p_idempotency_key, v_hash
  )
  on conflict do nothing
  returning true into v_claimed;

  if not coalesce(v_claimed, false) then
    select request_hash, task_id
      into v_existing_hash, v_existing_task_id
      from public.assistant_idempotency
     where user_id = v_auth.user_id
       and client_id = v_auth.client_id
       and tool_name = 'reschedule_task'
       and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from v_hash then
      raise exception 'idempotency key was already used for different arguments'
        using errcode = '22023';
    end if;
    select * into v_task
      from public.task_records
     where user_id = v_auth.user_id and id = v_existing_task_id;
    perform public.assistant_write_audit(
      v_auth.user_id, v_auth.client_id, 'reschedule_task', 'replayed', 0, p_request_id
    );
    return jsonb_build_object(
      'status', 'replayed',
      'task', public.task_record_to_json(v_task)
    );
  end if;

  select * into v_task
    from public.task_records
   where user_id = v_auth.user_id and id = p_task_id and deleted_at is null
   for update;
  if v_task.version <> p_expected_version then
    update public.assistant_idempotency
       set task_id = v_task.id, result_version = v_task.version
     where user_id = v_auth.user_id and client_id = v_auth.client_id
       and tool_name = 'reschedule_task' and idempotency_key = p_idempotency_key;
    perform public.assistant_write_audit(
      v_auth.user_id, v_auth.client_id, 'reschedule_task', 'conflict', 0, p_request_id
    );
    return jsonb_build_object(
      'status', 'conflict',
      'task', public.task_record_to_json(v_task)
    );
  end if;

  update public.task_records
     set scheduled_for = p_scheduled_for,
         version = version + 1,
         updated_at = now()
   where user_id = v_auth.user_id and id = p_task_id
   returning * into v_task;
  update public.assistant_idempotency
     set task_id = v_task.id, result_version = v_task.version
   where user_id = v_auth.user_id and client_id = v_auth.client_id
     and tool_name = 'reschedule_task' and idempotency_key = p_idempotency_key;
  perform public.assistant_write_audit(
    v_auth.user_id, v_auth.client_id, 'reschedule_task', 'success', 1, p_request_id
  );
  return jsonb_build_object(
    'status', 'rescheduled',
    'task', public.task_record_to_json(v_task)
  );
end;
$$;

revoke all on function public.assistant_reschedule_task(text, bigint, date, text, text)
  from public, anon;
grant execute on function public.assistant_reschedule_task(text, bigint, date, text, text)
  to authenticated;

