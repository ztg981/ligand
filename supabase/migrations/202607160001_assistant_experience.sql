-- Assistant inbox, privacy controls, and per-task assistant visibility.

alter table public.task_records
  add column if not exists assistant_hidden boolean not null default false;

update public.task_records as records
   set assistant_hidden = true
  from public.user_data as documents,
       lateral jsonb_array_elements(
         case when jsonb_typeof(documents.data -> 'ligand.data' -> 'tasks') = 'array'
           then documents.data -> 'ligand.data' -> 'tasks' else '[]'::jsonb end
       ) as task_rows(task)
 where documents.user_id = records.user_id
   and task ->> 'id' = records.id
   and lower(coalesce(task ->> 'assistantPrivate', 'false')) = 'true';

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
    'assistantPrivate', task.assistant_hidden,
    'version', task.version,
    'createdAt', task.created_at,
    'updatedAt', task.updated_at,
    'deleted', task.deleted_at is not null
  ))
$$;

revoke execute on function public.task_record_to_json(public.task_records)
  from public, anon, authenticated;

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
     and jsonb_typeof(p_task -> 'repeat') not in ('object', 'null') then
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
      done, completed_on, assistant_hidden, version, created_at, updated_at, deleted_at
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
      lower(coalesce(p_task ->> 'assistantPrivate', 'false')) = 'true',
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
         assistant_hidden = lower(coalesce(p_task ->> 'assistantPrivate', 'false')) = 'true',
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

-- Private tasks are excluded before projection, so their titles never leave
-- the database through the assistant connector.
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
  v_today date;
begin
  select * into v_auth from public.assistant_authorize(false);
  if p_focus not in ('today', 'all')
     or p_status not in ('open', 'completed', 'all')
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid task query' using errcode = '22023';
  end if;
  perform public.assistant_consume_read_rate(
    v_auth.user_id, v_auth.client_id, 'get_tasks'
  );
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
    select goal ->> 'id' as id, left(goal ->> 'name', 120) as name
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
       and records.assistant_hidden = false
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
             - 'deleted' - 'assistantPrivate') as projected_task
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
    v_auth.user_id, v_auth.client_id, 'get_tasks', 'read', 'success',
    v_returned, left(p_request_id, 100)
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

alter table public.assistant_change_previews
  add column if not exists dismissed_at timestamptz;

create index if not exists assistant_change_previews_user_created_idx
  on public.assistant_change_previews (user_id, created_at desc);

create or replace function public.assistant_list_change_previews(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_user_id is null or nullif(auth.jwt() ->> 'client_id', '') is not null then
    raise exception 'direct Ligand sign-in required' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid preview limit' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'confirmationId', previews.id,
           'summary', previews.summary,
           'changeCount', jsonb_array_length(previews.summary),
           'createdAt', previews.created_at,
           'expiresAt', previews.expires_at,
           'status', case
             when previews.applied_at is not null then 'applied'
             when previews.dismissed_at is not null then 'dismissed'
             when previews.expires_at <= clock_timestamp() then 'expired'
             else 'pending'
           end
         ) order by previews.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select drafts.*
        from public.assistant_change_previews as drafts
        join public.assistant_oauth_clients as clients
          on clients.client_id = drafts.client_id
         and clients.allowed_user_id = drafts.user_id
         and clients.enabled = true
       where drafts.user_id = v_user_id
       order by drafts.created_at desc
       limit p_limit
    ) as previews;
  return jsonb_build_object('drafts', v_items, 'count', jsonb_array_length(v_items));
end;
$$;

revoke all on function public.assistant_list_change_previews(integer)
  from public, anon;
grant execute on function public.assistant_list_change_previews(integer)
  to authenticated;

create or replace function public.assistant_dismiss_change_preview(
  p_confirmation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_preview public.assistant_change_previews%rowtype;
begin
  if v_user_id is null or nullif(auth.jwt() ->> 'client_id', '') is not null then
    raise exception 'direct Ligand sign-in required' using errcode = '28000';
  end if;
  update public.assistant_change_previews as previews
     set dismissed_at = coalesce(previews.dismissed_at, now()),
         expires_at = least(previews.expires_at, clock_timestamp())
   where previews.id = p_confirmation_id
     and previews.user_id = v_user_id
     and previews.applied_at is null
  returning previews.* into v_preview;
  if not found then
    raise exception 'confirmation not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'confirmationId', v_preview.id,
    'status', 'dismissed'
  );
end;
$$;

revoke all on function public.assistant_dismiss_change_preview(uuid)
  from public, anon;
grant execute on function public.assistant_dismiss_change_preview(uuid)
  to authenticated;

create or replace function public.assistant_get_change_preview(
  p_confirmation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claims jsonb := auth.jwt();
  v_preview public.assistant_change_previews%rowtype;
  v_status text;
begin
  if v_user_id is null
     or v_claims -> 'ligand_mcp' is not distinct from 'true'::jsonb then
    raise exception 'direct Ligand sign-in required' using errcode = '28000';
  end if;
  if p_confirmation_id is null then
    raise exception 'invalid confirmation' using errcode = '22023';
  end if;

  select previews.* into v_preview
    from public.assistant_change_previews as previews
    join public.assistant_oauth_clients as clients
      on clients.client_id = previews.client_id
     and clients.allowed_user_id = previews.user_id
     and clients.enabled = true
    join public.assistant_access as access
      on access.user_id = previews.user_id
     and access.enabled = true
   where previews.id = p_confirmation_id
     and previews.user_id = v_user_id;
  if not found then
    raise exception 'confirmation not found' using errcode = 'P0002';
  end if;

  v_status := case
    when v_preview.applied_at is not null then 'applied'
    when v_preview.dismissed_at is not null then 'dismissed'
    when v_preview.expires_at <= clock_timestamp() then 'expired'
    else 'pending'
  end;
  return jsonb_build_object(
    'confirmationId', v_preview.id,
    'expiresAt', v_preview.expires_at,
    'changeCount', jsonb_array_length(v_preview.summary),
    'summary', v_preview.summary,
    'status', v_status
  );
end;
$$;

revoke all on function public.assistant_get_change_preview(uuid)
  from public, anon;
grant execute on function public.assistant_get_change_preview(uuid)
  to authenticated;
