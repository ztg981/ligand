-- ============================================================
-- Assistant connector: archived goals leave the shared scope
-- ------------------------------------------------------------
-- Ligand's "delete a goal" is an ARCHIVE. useStore.archiveGoal sets
-- status = 'archived' and leaves the record in the user_data blob so the
-- recycle bin in Settings can restore it. The app hides archived goals from
-- the sidebar, pickers and dashboards — but the assistant read functions
-- filtered only on allowed_goal_ids and type <> 'recovery', never on status.
--
-- The result: a goal the user archived months ago kept being returned by
-- get_shared_goals forever, and its tasks kept passing the visible_goals
-- join in get_tasks. Nothing here was ever cached; the reads were live but
-- their scope was too wide.
--
-- Three changes, all backward compatible (no schema change, no data change):
--   1. assistant_get_shared_goals  — skip archived goals
--   2. assistant_get_tasks         — skip tasks whose goal is archived
--   3. assistant_task_in_scope     — refuse writes into an archived goal
-- Plus a trigger that prunes assistant_access.allowed_goal_ids when a goal
-- stops being shareable, so archiving or permanently deleting a goal also
-- REVOKES the grant instead of leaving a dangling id behind.
--
-- A goal with status 'done' is still a real, completed goal and stays in
-- scope. Only 'archived' leaves. Goals written before status existed have no
-- status key and are treated as active, so no historical record changes
-- meaning.
-- ============================================================

-- Shared predicate for "this goal may still be seen by the assistant".
create or replace function public.assistant_goal_is_shareable(p_goal jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_goal ->> 'type', 'custom') <> 'recovery'
     and coalesce(nullif(btrim(p_goal ->> 'status'), ''), 'active') <> 'archived'
     and char_length(coalesce(p_goal ->> 'id', '')) between 1 and 200
$$;

revoke all on function public.assistant_goal_is_shareable(jsonb) from public, anon;
grant execute on function public.assistant_goal_is_shareable(jsonb) to authenticated;

-- ---- 1. shared goals ---------------------------------------------------
create or replace function public.assistant_get_shared_goals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_goals jsonb;
begin
  select * into v_auth from public.assistant_authorize(false);
  perform public.assistant_consume_read_rate(
    v_auth.user_id, v_auth.client_id, 'get_shared_goals'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', goal ->> 'id',
           'name', left(coalesce(nullif(btrim(goal ->> 'name'), ''), 'Untitled goal'), 120)
         ) order by goal ->> 'name'), '[]'::jsonb)
    into v_goals
    from public.user_data as documents
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(documents.data -> 'ligand.data' -> 'goals') = 'array'
        then documents.data -> 'ligand.data' -> 'goals' else '[]'::jsonb end
    ) as goal_rows(goal)
   where documents.user_id = v_auth.user_id
     and goal ->> 'id' = any(v_auth.allowed_goal_ids)
     and public.assistant_goal_is_shareable(goal);

  insert into public.assistant_audit_log (
    user_id, client_id, tool_name, action_class, outcome, item_count
  ) values (
    v_auth.user_id, v_auth.client_id, 'get_shared_goals', 'read', 'success',
    jsonb_array_length(v_goals)
  );
  return jsonb_build_object(
    'goals', v_goals,
    'count', jsonb_array_length(v_goals)
  );
end;
$$;

revoke all on function public.assistant_get_shared_goals() from public, anon;
grant execute on function public.assistant_get_shared_goals() to authenticated;

-- ---- 2. tasks ----------------------------------------------------------
-- Identical to the 202607160001 definition except that visible_goals now
-- applies assistant_goal_is_shareable, which adds the archived check.
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
       and public.assistant_goal_is_shareable(goal)
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

-- ---- 3. write scope ----------------------------------------------------
-- An archived goal is not a place ChatGPT may file new work.
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
           and public.assistant_goal_is_shareable(goal)
      )
  end
$$;

revoke all on function public.assistant_task_in_scope(uuid, text, text[], boolean)
  from public, anon, authenticated;

-- ---- 4. revoke the grant, not just the read ----------------------------
-- Filtering the reads fixes what the connector RETURNS. This makes the stored
-- grant follow the data as well, so an archived or permanently deleted goal
-- also stops being listed as shared inside Ligand's own ChatGPT panel.
--
-- Guarded by a WHEN clause on the goals array so the ordinary sync write
-- path — which rewrites the whole blob on every push — does not pay for this
-- unless the goal list actually changed.
create or replace function public.assistant_prune_shared_goals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shareable text[];
begin
  select coalesce(array_agg(goal ->> 'id'), '{}'::text[])
    into v_shareable
    from jsonb_array_elements(
      case when jsonb_typeof(new.data -> 'ligand.data' -> 'goals') = 'array'
        then new.data -> 'ligand.data' -> 'goals' else '[]'::jsonb end
    ) as goal_rows(goal)
   where public.assistant_goal_is_shareable(goal);

  update public.assistant_access as access
     set allowed_goal_ids = array(
           select id
             from unnest(access.allowed_goal_ids) as id
            where id = any(v_shareable)
         )
   where access.user_id = new.user_id
     and access.allowed_goal_ids is not null
     and not (access.allowed_goal_ids <@ v_shareable);

  return new;
end;
$$;

revoke all on function public.assistant_prune_shared_goals()
  from public, anon, authenticated;

drop trigger if exists user_data_prune_assistant_goals on public.user_data;
create trigger user_data_prune_assistant_goals
  after update on public.user_data
  for each row
  when (
    (old.data -> 'ligand.data' -> 'goals')
      is distinct from (new.data -> 'ligand.data' -> 'goals')
  )
  execute function public.assistant_prune_shared_goals();
