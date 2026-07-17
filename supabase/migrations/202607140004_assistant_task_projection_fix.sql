-- Keep internal task-record sync fields out of assistant responses.
-- Parentheses are required so the subtraction applies after JSON concatenation.
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
