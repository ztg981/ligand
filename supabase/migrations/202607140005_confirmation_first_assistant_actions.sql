-- Confirmation-first assistant actions for tasks, Day plans, workout-plan
-- imports, and non-destructive removal review marks.

alter table public.assistant_access
  add column if not exists day_read boolean not null default false,
  add column if not exists day_write boolean not null default false,
  add column if not exists workouts_write boolean not null default false,
  add column if not exists review_write boolean not null default false;

create table if not exists public.assistant_change_previews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_id   text not null,
  operations  jsonb not null check (jsonb_typeof(operations) = 'array'),
  summary     jsonb not null check (jsonb_typeof(summary) = 'array'),
  expires_at  timestamptz not null,
  applied_at  timestamptz,
  result      jsonb,
  created_at  timestamptz not null default now()
);

alter table public.assistant_change_previews enable row level security;
revoke all on table public.assistant_change_previews from public, anon, authenticated;
create index if not exists assistant_change_previews_expiry_idx
  on public.assistant_change_previews (expires_at);

create table if not exists public.assistant_review_marks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  client_id   text not null,
  item_type   text not null check (item_type in ('task', 'goal', 'day_block', 'workout')),
  item_id     text not null check (char_length(item_id) between 1 and 200),
  label       text not null check (char_length(label) between 1 and 120),
  reason      text not null check (char_length(reason) between 1 and 300),
  status      text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.assistant_review_marks enable row level security;
revoke all on table public.assistant_review_marks from public, anon, authenticated;
grant select on table public.assistant_review_marks to authenticated;
grant update (status, resolved_at) on table public.assistant_review_marks to authenticated;

drop policy if exists "assistant_review_marks_select_own_direct"
  on public.assistant_review_marks;
drop policy if exists "assistant_review_marks_update_own_direct"
  on public.assistant_review_marks;
create policy "assistant_review_marks_select_own_direct"
  on public.assistant_review_marks for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create policy "assistant_review_marks_update_own_direct"
  on public.assistant_review_marks for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'client_id') is null
  );
create index if not exists assistant_review_marks_user_status_idx
  on public.assistant_review_marks (user_id, status, created_at desc);

create or replace function public.assistant_consume_read_rate(
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
  v_bucket := date_trunc('minute', clock_timestamp());
  insert into public.assistant_rate_limits as limits (
    user_id, client_id, tool_name, bucket_start, request_count, updated_at
  ) values (
    p_user_id, p_client_id, p_tool_name, v_bucket, 1, now()
  )
  on conflict (user_id, client_id, tool_name, bucket_start)
  do update
    set request_count = limits.request_count + 1,
        updated_at = now()
    where limits.request_count < 60
  returning request_count into v_count;
  if v_count is null then
    raise exception 'assistant read rate limit exceeded' using errcode = '57014';
  end if;
end;
$$;

revoke all on function public.assistant_consume_read_rate(uuid, text, text)
  from public, anon, authenticated;

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
     and coalesce(goal ->> 'type', 'custom') <> 'recovery'
     and char_length(coalesce(goal ->> 'id', '')) between 1 and 200;

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

create or replace function public.assistant_get_day_plan(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_day_read boolean;
  v_blocks jsonb;
begin
  select * into v_auth from public.assistant_authorize(false);
  select day_read into v_day_read
    from public.assistant_access
   where user_id = v_auth.user_id and enabled = true;
  if not coalesce(v_day_read, false) then
    raise exception 'assistant Day access is disabled' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'invalid Day date' using errcode = '22023';
  end if;
  perform public.assistant_consume_read_rate(
    v_auth.user_id, v_auth.client_id, 'get_day_plan'
  );

  with document as (
    select data, updated_at
      from public.user_data
     where user_id = v_auth.user_id
  ),
  visible_habits as (
    select habit ->> 'id' as id
      from document
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(data -> 'ligand.data' -> 'goals') = 'array'
          then data -> 'ligand.data' -> 'goals' else '[]'::jsonb end
      ) as goal_rows(goal)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(goal -> 'habits') = 'array'
          then goal -> 'habits' else '[]'::jsonb end
      ) as habit_rows(habit)
     where goal ->> 'id' = any(v_auth.allowed_goal_ids)
       and coalesce(goal ->> 'type', 'custom') <> 'recovery'
  ),
  raw_blocks as (
    select block, ordinality, document.updated_at
      from document
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(data -> 'ligand.data' -> 'dayBlocks') = 'array'
          then data -> 'ligand.data' -> 'dayBlocks' else '[]'::jsonb end
      ) with ordinality as block_rows(block, ordinality)
     where block ->> 'date' = p_date::text
       and coalesce(block ->> 'id', '') <> ''
       and coalesce(block ->> 'start', '') ~ '^\d{1,4}$'
       and coalesce(block ->> 'end', '') ~ '^\d{1,4}$'
       and (block ->> 'start')::integer between 0 and 1439
       and (block ->> 'end')::integer between 1 and 1440
       and (block ->> 'end')::integer > (block ->> 'start')::integer
       and (
         nullif(block ->> 'linkType', '') is null
         or block ->> 'linkType' = 'workout'
         or (
           block ->> 'linkType' = 'habit'
           and exists (select 1 from visible_habits where id = block ->> 'linkId')
         )
         or (
           block ->> 'linkType' = 'task'
           and exists (
             select 1 from public.task_records as tasks
              where tasks.user_id = v_auth.user_id
                and tasks.id = block ->> 'linkId'
                and tasks.deleted_at is null
                and public.assistant_task_in_scope(
                  v_auth.user_id,
                  tasks.goal_id,
                  v_auth.allowed_goal_ids,
                  v_auth.allow_unassigned_tasks
                )
           )
         )
       )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', left(block ->> 'id', 200),
           'date', p_date::text,
           'start', (block ->> 'start')::integer,
           'end', (block ->> 'end')::integer,
           'title', left(coalesce(block ->> 'title', ''), 60),
           'category', case when block ->> 'category' in (
             'focus', 'work', 'personal', 'break', 'exercise', 'sleep', 'other'
           ) then block ->> 'category' else 'other' end,
           'protected', lower(coalesce(block ->> 'protected', 'false')) = 'true',
           'done', lower(coalesce(block ->> 'done', 'false')) = 'true',
           'linkType', case when block ->> 'linkType' in ('task', 'habit', 'workout')
             then block ->> 'linkType' else null end,
           'linkId', left(nullif(block ->> 'linkId', ''), 200),
           'version', greatest(coalesce(nullif(block ->> 'version', '')::integer, 1), 1),
           'updatedAt', left(coalesce(
             nullif(block ->> 'updatedAt', ''),
             nullif(block ->> 'createdAt', ''),
             updated_at::text
           ), 40)
         ) order by (block ->> 'start')::integer, ordinality), '[]'::jsonb)
    into v_blocks
    from raw_blocks;

  insert into public.assistant_audit_log (
    user_id, client_id, tool_name, action_class, outcome, item_count
  ) values (
    v_auth.user_id, v_auth.client_id, 'get_day_plan', 'read', 'success',
    jsonb_array_length(v_blocks)
  );
  return jsonb_build_object(
    'date', p_date::text,
    'blocks', v_blocks,
    'count', jsonb_array_length(v_blocks)
  );
end;
$$;

revoke all on function public.assistant_get_day_plan(date) from public, anon;
grant execute on function public.assistant_get_day_plan(date) to authenticated;

create or replace function public.assistant_preview_changes(
  p_operations jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_access public.assistant_access%rowtype;
  v_operation jsonb;
  v_type text;
  v_count integer;
  v_summary jsonb := '[]'::jsonb;
  v_preview_id uuid;
  v_expires_at timestamptz := clock_timestamp() + interval '30 minutes';
  v_task public.task_records%rowtype;
  v_document jsonb;
  v_day_blocks jsonb;
  v_scheduled_workouts jsonb;
  v_workouts jsonb;
  v_item jsonb;
  v_expected_version bigint;
  v_goal_id text;
  v_item_id text;
begin
  select * into v_auth from public.assistant_authorize(false);
  select * into v_access
    from public.assistant_access
   where user_id = v_auth.user_id and enabled = true;
  if not found then
    raise exception 'assistant access is disabled' using errcode = '42501';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'invalid change operations' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_operations);
  if v_count < 1 or v_count > 30 or octet_length(p_operations::text) > 50000 then
    raise exception 'invalid change operation count or size' using errcode = '22023';
  end if;

  select coalesce(data, '{}'::jsonb) into v_document
    from public.user_data
   where user_id = v_auth.user_id;
  if not found then
    raise exception 'Ligand account data not found' using errcode = 'P0002';
  end if;
  v_day_blocks := case
    when jsonb_typeof(v_document -> 'ligand.data' -> 'dayBlocks') = 'array'
      then v_document -> 'ligand.data' -> 'dayBlocks' else '[]'::jsonb end;
  v_scheduled_workouts := case
    when jsonb_typeof(v_document -> 'ligand.data' -> 'scheduledWorkouts') = 'array'
      then v_document -> 'ligand.data' -> 'scheduledWorkouts' else '[]'::jsonb end;
  v_workouts := case
    when jsonb_typeof(v_document -> 'ligand.data' -> 'workouts') = 'array'
      then v_document -> 'ligand.data' -> 'workouts' else '[]'::jsonb end;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_type := v_operation ->> 'type';
    if v_type = 'add_task' then
      if not v_access.tasks_write then
        raise exception 'assistant task changes are disabled' using errcode = '42501';
      end if;
      v_goal_id := nullif(v_operation ->> 'goalId', '');
      if char_length(coalesce(v_operation ->> 'text', '')) not between 1 and 500
         or coalesce(v_operation ->> 'label', '') not in ('General', 'Today', 'Urgent')
         or coalesce(v_operation ->> 'term', '') not in ('short', 'long')
         or not public.assistant_task_in_scope(
           v_auth.user_id, v_goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
         ) then
        raise exception 'invalid or unshared task change' using errcode = '42501';
      end if;
      v_summary := v_summary || jsonb_build_array(
        'Add task "' || left(v_operation ->> 'text', 120) || '"'
      );
    elsif v_type in ('complete_task', 'reschedule_task') then
      if not v_access.tasks_write then
        raise exception 'assistant task changes are disabled' using errcode = '42501';
      end if;
      v_expected_version := nullif(v_operation ->> 'expectedVersion', '')::bigint;
      select * into v_task from public.task_records
       where user_id = v_auth.user_id
         and id = v_operation ->> 'taskId'
         and deleted_at is null;
      if not found then
        raise exception 'task not found' using errcode = 'P0002';
      end if;
      if v_task.version <> v_expected_version then
        raise exception 'task changed after it was read' using errcode = '40001';
      end if;
      if not public.assistant_task_in_scope(
        v_auth.user_id, v_task.goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
      ) then
        raise exception 'task is outside assistant access' using errcode = '42501';
      end if;
      v_summary := v_summary || jsonb_build_array(
        case when v_type = 'complete_task' then 'Complete task "'
          else 'Reschedule task "' end
        || left(v_task.text, 120) || '"'
        || case when v_type = 'reschedule_task' then
          coalesce(' for ' || nullif(v_operation ->> 'scheduledFor', ''), ' with no scheduled date')
          else '' end
      );
    elsif v_type = 'add_day_block' then
      if not v_access.day_write then
        raise exception 'assistant Day changes are disabled' using errcode = '42501';
      end if;
      if char_length(coalesce(v_operation ->> 'title', '')) not between 1 and 60
         or coalesce(v_operation ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or coalesce(v_operation ->> 'start', '') !~ '^\d{1,4}$'
         or coalesce(v_operation ->> 'end', '') !~ '^\d{1,4}$'
         or (v_operation ->> 'start')::integer not between 0 and 1439
         or (v_operation ->> 'end')::integer not between 1 and 1440
         or (v_operation ->> 'end')::integer <= (v_operation ->> 'start')::integer
         or coalesce(v_operation ->> 'category', '') not in (
           'focus', 'work', 'personal', 'break', 'exercise', 'sleep', 'other'
         ) then
        raise exception 'invalid Day block' using errcode = '22023';
      end if;
      if nullif(v_operation ->> 'linkTaskId', '') is not null
         and jsonb_typeof(v_operation -> 'task') = 'object' then
        raise exception 'a Day block cannot link and create tasks together' using errcode = '22023';
      end if;
      if nullif(v_operation ->> 'linkTaskId', '') is not null then
        select * into v_task from public.task_records
         where user_id = v_auth.user_id
           and id = v_operation ->> 'linkTaskId'
           and deleted_at is null;
        if not found or not public.assistant_task_in_scope(
          v_auth.user_id, v_task.goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
        ) then
          raise exception 'linked task is outside assistant access' using errcode = '42501';
        end if;
      end if;
      if jsonb_typeof(v_operation -> 'task') = 'object' then
        if not v_access.tasks_write then
          raise exception 'assistant task changes are disabled' using errcode = '42501';
        end if;
        v_goal_id := nullif(v_operation -> 'task' ->> 'goalId', '');
        if char_length(coalesce(v_operation -> 'task' ->> 'text', '')) not between 1 and 500
           or not public.assistant_task_in_scope(
             v_auth.user_id, v_goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
           ) then
          raise exception 'nested task is outside assistant access' using errcode = '42501';
        end if;
      end if;
      v_summary := v_summary || jsonb_build_array(
        'Add Day block "' || left(v_operation ->> 'title', 60) || '" on '
        || (v_operation ->> 'date') || ' from '
        || lpad(((v_operation ->> 'start')::integer / 60)::text, 2, '0') || ':'
        || lpad(((v_operation ->> 'start')::integer % 60)::text, 2, '0') || ' to '
        || lpad(((v_operation ->> 'end')::integer / 60)::text, 2, '0') || ':'
        || lpad(((v_operation ->> 'end')::integer % 60)::text, 2, '0')
      );
    elsif v_type = 'complete_day_block' then
      if not v_access.day_write then
        raise exception 'assistant Day changes are disabled' using errcode = '42501';
      end if;
      select block into v_item
        from jsonb_array_elements(v_day_blocks) as block_rows(block)
       where block ->> 'id' = v_operation ->> 'blockId';
      if not found then
        raise exception 'Day block not found' using errcode = 'P0002';
      end if;
      v_expected_version := nullif(v_operation ->> 'expectedVersion', '')::bigint;
      if greatest(coalesce(nullif(v_item ->> 'version', '')::bigint, 1), 1)
         <> v_expected_version then
        raise exception 'Day block changed after it was read' using errcode = '40001';
      end if;
      v_summary := v_summary || jsonb_build_array(
        'Mark Day block "' || left(coalesce(v_item ->> 'title', 'Block'), 60) || '" complete'
      );
    elsif v_type = 'import_workout_plan' then
      if not v_access.workouts_write then
        raise exception 'assistant workout imports are disabled' using errcode = '42501';
      end if;
      if char_length(coalesce(v_operation ->> 'name', '')) not between 1 and 60
         or coalesce(v_operation ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
         or jsonb_typeof(v_operation -> 'exercises') <> 'array'
         or jsonb_array_length(v_operation -> 'exercises') not between 1 and 40
         or octet_length((v_operation -> 'exercises')::text) > 30000 then
        raise exception 'invalid workout plan import' using errcode = '22023';
      end if;
      v_summary := v_summary || jsonb_build_array(
        'Import workout plan "' || left(v_operation ->> 'name', 60) || '" for '
        || (v_operation ->> 'date') || ' ('
        || jsonb_array_length(v_operation -> 'exercises')::text || ' exercises)'
      );
    elsif v_type = 'mark_for_review' then
      if not v_access.review_write then
        raise exception 'assistant review marks are disabled' using errcode = '42501';
      end if;
      v_item_id := nullif(v_operation ->> 'itemId', '');
      if v_item_id is null
         or char_length(v_item_id) > 200
         or char_length(coalesce(v_operation ->> 'label', '')) not between 1 and 120
         or char_length(coalesce(v_operation ->> 'reason', '')) not between 1 and 300
         or coalesce(v_operation ->> 'itemType', '') not in (
           'task', 'goal', 'day_block', 'workout'
         ) then
        raise exception 'invalid review mark' using errcode = '22023';
      end if;
      if v_operation ->> 'itemType' = 'goal' then
        if not v_item_id = any(v_auth.allowed_goal_ids)
           or not exists (
             select 1 from jsonb_array_elements(
               case when jsonb_typeof(v_document -> 'ligand.data' -> 'goals') = 'array'
                 then v_document -> 'ligand.data' -> 'goals' else '[]'::jsonb end
             ) as goal_rows(goal)
              where goal ->> 'id' = v_item_id
                and coalesce(goal ->> 'type', 'custom') <> 'recovery'
           ) then
          raise exception 'goal is outside assistant access' using errcode = '42501';
        end if;
      elsif v_operation ->> 'itemType' = 'task' then
        select * into v_task from public.task_records
         where user_id = v_auth.user_id and id = v_item_id and deleted_at is null;
        if not found or not public.assistant_task_in_scope(
          v_auth.user_id, v_task.goal_id, v_auth.allowed_goal_ids, v_auth.allow_unassigned_tasks
        ) then
          raise exception 'task is outside assistant access' using errcode = '42501';
        end if;
      elsif v_operation ->> 'itemType' = 'day_block' then
        if not exists (
          select 1 from jsonb_array_elements(v_day_blocks) as block_rows(block)
           where block ->> 'id' = v_item_id
        ) then
          raise exception 'Day block not found' using errcode = 'P0002';
        end if;
      else
        if not exists (
          select 1 from jsonb_array_elements(v_scheduled_workouts || v_workouts)
            as workout_rows(workout)
           where workout ->> 'id' = v_item_id
        ) then
          raise exception 'workout not found' using errcode = 'P0002';
        end if;
      end if;
      v_summary := v_summary || jsonb_build_array(
        'Mark "' || left(v_operation ->> 'label', 120)
        || '" for review in Ligand instead of deleting it'
      );
    else
      raise exception 'unsupported Ligand operation' using errcode = '22023';
    end if;
  end loop;

  perform public.assistant_consume_read_rate(
    v_auth.user_id, v_auth.client_id, 'preview_ligand_changes'
  );
  insert into public.assistant_change_previews (
    user_id, client_id, operations, summary, expires_at
  ) values (
    v_auth.user_id, v_auth.client_id, p_operations, v_summary, v_expires_at
  ) returning id into v_preview_id;
  insert into public.assistant_audit_log (
    user_id, client_id, tool_name, action_class, outcome, item_count, request_id
  ) values (
    v_auth.user_id, v_auth.client_id, 'preview_ligand_changes', 'read',
    'success', v_count, left(p_request_id, 100)
  );
  return jsonb_build_object(
    'confirmationId', v_preview_id,
    'expiresAt', v_expires_at,
    'changeCount', v_count,
    'summary', v_summary
  );
end;
$$;

revoke all on function public.assistant_preview_changes(jsonb, text)
  from public, anon;
grant execute on function public.assistant_preview_changes(jsonb, text)
  to authenticated;

create or replace function public.assistant_apply_changes(
  p_confirmation_id uuid,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
  v_access public.assistant_access%rowtype;
  v_preview public.assistant_change_previews%rowtype;
  v_operation jsonb;
  v_type text;
  v_index integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
  v_task_result jsonb;
  v_id text;
  v_document jsonb;
  v_core jsonb;
  v_day_blocks jsonb;
  v_scheduled_workouts jsonb;
  v_workouts jsonb;
  v_item jsonb;
  v_exercises jsonb;
  v_document_changed boolean := false;
  v_expected_version bigint;
  v_now timestamptz;
begin
  select * into v_auth from public.assistant_authorize(false);
  select * into v_access
    from public.assistant_access
   where user_id = v_auth.user_id and enabled = true;
  if not found then
    raise exception 'assistant access is disabled' using errcode = '42501';
  end if;
  if p_confirmation_id is null then
    raise exception 'invalid confirmation' using errcode = '22023';
  end if;

  select * into v_preview
    from public.assistant_change_previews
   where id = p_confirmation_id
     and user_id = v_auth.user_id
     and client_id = v_auth.client_id
   for update;
  if not found then
    raise exception 'confirmation not found' using errcode = 'P0002';
  end if;
  if v_preview.applied_at is not null and v_preview.result is not null then
    return v_preview.result || jsonb_build_object('status', 'replayed');
  end if;
  if v_preview.expires_at <= clock_timestamp() then
    raise exception 'confirmation expired' using errcode = '22023';
  end if;

  select coalesce(data, '{}'::jsonb) into v_document
    from public.user_data
   where user_id = v_auth.user_id
   for update;
  if not found then
    raise exception 'Ligand account data not found' using errcode = 'P0002';
  end if;
  v_core := coalesce(v_document -> 'ligand.data', '{}'::jsonb);
  v_day_blocks := case when jsonb_typeof(v_core -> 'dayBlocks') = 'array'
    then v_core -> 'dayBlocks' else '[]'::jsonb end;
  v_scheduled_workouts := case when jsonb_typeof(v_core -> 'scheduledWorkouts') = 'array'
    then v_core -> 'scheduledWorkouts' else '[]'::jsonb end;
  v_workouts := case when jsonb_typeof(v_core -> 'workouts') = 'array'
    then v_core -> 'workouts' else '[]'::jsonb end;

  perform public.assistant_consume_write_rate(
    v_auth.user_id, v_auth.client_id, 'apply_ligand_changes'
  );

  for v_operation in select value from jsonb_array_elements(v_preview.operations)
  loop
    v_index := v_index + 1;
    v_type := v_operation ->> 'type';
    if v_type = 'add_task' then
      if not v_access.tasks_write then
        raise exception 'assistant task changes are disabled' using errcode = '42501';
      end if;
      v_task_result := public.assistant_add_task(
        v_operation ->> 'text',
        nullif(v_operation ->> 'goalId', ''),
        v_operation ->> 'label',
        v_operation ->> 'term',
        nullif(v_operation ->> 'scheduledFor', '')::date,
        p_confirmation_id::text || ':' || v_index::text,
        p_request_id
      );
      v_id := v_task_result #>> '{task,id}';
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', v_task_result ->> 'status', 'id', v_id
      ));
    elsif v_type = 'complete_task' then
      if not v_access.tasks_write then
        raise exception 'assistant task changes are disabled' using errcode = '42501';
      end if;
      v_task_result := public.assistant_complete_task(
        v_operation ->> 'taskId',
        (v_operation ->> 'expectedVersion')::bigint,
        p_confirmation_id::text || ':' || v_index::text,
        p_request_id
      );
      if v_task_result ->> 'status' = 'conflict' then
        raise exception 'task changed after preview' using errcode = '40001';
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', v_task_result ->> 'status',
        'id', v_task_result #>> '{task,id}'
      ));
    elsif v_type = 'reschedule_task' then
      if not v_access.tasks_write then
        raise exception 'assistant task changes are disabled' using errcode = '42501';
      end if;
      v_task_result := public.assistant_reschedule_task(
        v_operation ->> 'taskId',
        (v_operation ->> 'expectedVersion')::bigint,
        nullif(v_operation ->> 'scheduledFor', '')::date,
        p_confirmation_id::text || ':' || v_index::text,
        p_request_id
      );
      if v_task_result ->> 'status' = 'conflict' then
        raise exception 'task changed after preview' using errcode = '40001';
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', v_task_result ->> 'status',
        'id', v_task_result #>> '{task,id}'
      ));
    elsif v_type = 'add_day_block' then
      if not v_access.day_write then
        raise exception 'assistant Day changes are disabled' using errcode = '42501';
      end if;
      v_id := nullif(v_operation ->> 'linkTaskId', '');
      if jsonb_typeof(v_operation -> 'task') = 'object' then
        if not v_access.tasks_write then
          raise exception 'assistant task changes are disabled' using errcode = '42501';
        end if;
        v_task_result := public.assistant_add_task(
          v_operation -> 'task' ->> 'text',
          nullif(v_operation -> 'task' ->> 'goalId', ''),
          v_operation -> 'task' ->> 'label',
          v_operation -> 'task' ->> 'term',
          nullif(v_operation -> 'task' ->> 'scheduledFor', '')::date,
          p_confirmation_id::text || ':task:' || v_index::text,
          p_request_id
        );
        v_id := v_task_result #>> '{task,id}';
      end if;
      v_now := clock_timestamp();
      v_item := jsonb_strip_nulls(jsonb_build_object(
        'id', 'assistant_blk_' || md5(
          v_auth.user_id::text || ':' || p_confirmation_id::text || ':' || v_index::text
        ),
        'date', v_operation ->> 'date',
        'start', (v_operation ->> 'start')::integer,
        'end', (v_operation ->> 'end')::integer,
        'title', left(v_operation ->> 'title', 60),
        'category', v_operation ->> 'category',
        'protected', lower(coalesce(v_operation ->> 'protected', 'false')) = 'true',
        'done', false,
        'linkType', case when v_id is not null then 'task' else null end,
        'linkId', v_id,
        'notes', '',
        'version', 1,
        'createdAt', v_now,
        'updatedAt', v_now
      ));
      v_day_blocks := v_day_blocks || jsonb_build_array(v_item);
      v_document_changed := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', 'created', 'id', v_item ->> 'id'
      ));
    elsif v_type = 'complete_day_block' then
      if not v_access.day_write then
        raise exception 'assistant Day changes are disabled' using errcode = '42501';
      end if;
      select block into v_item
        from jsonb_array_elements(v_day_blocks) as block_rows(block)
       where block ->> 'id' = v_operation ->> 'blockId';
      if not found then
        raise exception 'Day block not found' using errcode = 'P0002';
      end if;
      v_expected_version := (v_operation ->> 'expectedVersion')::bigint;
      if greatest(coalesce(nullif(v_item ->> 'version', '')::bigint, 1), 1)
         <> v_expected_version then
        raise exception 'Day block changed after preview' using errcode = '40001';
      end if;
      v_now := clock_timestamp();
      select coalesce(jsonb_agg(
               case when block ->> 'id' = v_operation ->> 'blockId'
                 then block || jsonb_build_object(
                   'done', true,
                   'version', v_expected_version + 1,
                   'updatedAt', v_now
                 )
                 else block end
               order by ordinality
             ), '[]'::jsonb)
        into v_day_blocks
        from jsonb_array_elements(v_day_blocks)
          with ordinality as block_rows(block, ordinality);
      v_document_changed := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', 'completed', 'id', v_operation ->> 'blockId'
      ));
    elsif v_type = 'import_workout_plan' then
      if not v_access.workouts_write then
        raise exception 'assistant workout imports are disabled' using errcode = '42501';
      end if;
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'exerciseId', null,
               'name', left(exercise ->> 'name', 100),
               'muscleGroup', left(coalesce(exercise ->> 'muscleGroup', 'other'), 40),
               'type', case when exercise ->> 'type' = 'cardio' then 'cardio' else 'strength' end,
               'targetSets', greatest(1, least(20, coalesce((exercise ->> 'targetSets')::integer, 3))),
               'targetReps', nullif(exercise ->> 'targetReps', '')::integer,
               'targetWeight', nullif(exercise ->> 'targetWeight', '')::numeric,
               'targetMinutes', nullif(exercise ->> 'targetMinutes', '')::integer,
               'restSec', nullif(exercise ->> 'restSec', '')::integer,
               'notes', left(nullif(exercise ->> 'notes', ''), 200)
             )) order by ordinality), '[]'::jsonb)
        into v_exercises
        from jsonb_array_elements(v_operation -> 'exercises')
          with ordinality as exercise_rows(exercise, ordinality);
      v_now := clock_timestamp();
      v_id := 'assistant_sched_' || md5(
        v_auth.user_id::text || ':' || p_confirmation_id::text || ':' || v_index::text
      );
      v_item := jsonb_build_object(
        'id', v_id,
        'date', v_operation ->> 'date',
        'name', left(v_operation ->> 'name', 60),
        'exercises', v_exercises,
        'templateId', null,
        'notes', left(coalesce(v_operation ->> 'notes', ''), 1000),
        'status', 'planned',
        'completedWorkoutId', null,
        'createdAt', v_now,
        'updatedAt', v_now
      );
      v_scheduled_workouts := v_scheduled_workouts || jsonb_build_array(v_item);
      v_document_changed := true;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', 'imported', 'id', v_id
      ));
    elsif v_type = 'mark_for_review' then
      if not v_access.review_write then
        raise exception 'assistant review marks are disabled' using errcode = '42501';
      end if;
      insert into public.assistant_review_marks (
        user_id, client_id, item_type, item_id, label, reason
      ) values (
        v_auth.user_id,
        v_auth.client_id,
        v_operation ->> 'itemType',
        v_operation ->> 'itemId',
        left(v_operation ->> 'label', 120),
        left(v_operation ->> 'reason', 300)
      ) returning id::text into v_id;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'type', v_type, 'status', 'marked', 'id', v_id
      ));
    else
      raise exception 'unsupported Ligand operation' using errcode = '22023';
    end if;
  end loop;

  if v_document_changed then
    v_core := jsonb_set(v_core, '{dayBlocks}', v_day_blocks, true);
    v_core := jsonb_set(v_core, '{scheduledWorkouts}', v_scheduled_workouts, true);
    v_document := jsonb_set(v_document, array['ligand.data'], v_core, true);
    update public.user_data
       set data = v_document, updated_at = now()
     where user_id = v_auth.user_id;
  end if;

  v_result := jsonb_build_object(
    'status', 'applied',
    'changeCount', jsonb_array_length(v_results),
    'results', v_results
  );
  update public.assistant_change_previews
     set applied_at = now(), result = v_result
   where id = p_confirmation_id;
  insert into public.assistant_audit_log (
    user_id, client_id, tool_name, action_class, outcome, item_count, request_id
  ) values (
    v_auth.user_id, v_auth.client_id, 'apply_ligand_changes', 'write',
    'success', jsonb_array_length(v_results), left(p_request_id, 100)
  );
  return v_result;
end;
$$;

revoke all on function public.assistant_apply_changes(uuid, text)
  from public, anon;
grant execute on function public.assistant_apply_changes(uuid, text)
  to authenticated;
