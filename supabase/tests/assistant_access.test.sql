begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated',
    'authenticated',
    'ligand-assistant-a@example.test',
    'test',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-0000000000b2',
    'authenticated',
    'authenticated',
    'ligand-assistant-b@example.test',
    'test',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  )
on conflict (id) do nothing;

delete from public.assistant_audit_log
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);
delete from public.assistant_rate_limits
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);
delete from public.assistant_idempotency
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);
delete from public.assistant_access
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);
delete from public.assistant_oauth_clients
where client_id in ('chatgpt-test-client', 'other-test-client');
delete from public.task_records
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);
delete from public.user_data
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);

insert into public.task_records (
  user_id, id, text, label, goal_id, term, done, completed_on,
  version, created_at, updated_at
)
values
  (
    '00000000-0000-4000-8000-0000000000a1', 'task-shared',
    'Submit assignment', 'Today', 'goal-shared', 'short', false, null,
    1, '2026-07-14T00:00:00Z', now()
  ),
  (
    '00000000-0000-4000-8000-0000000000a1', 'task-done',
    'Finished task', 'Urgent', 'goal-shared', 'short', true, '2026-07-14',
    1, '2026-07-13T00:00:00Z', now()
  ),
  (
    '00000000-0000-4000-8000-0000000000a1', 'task-private',
    'Confidential plan', 'Today', 'goal-private', 'short', false, null,
    1, now(), now()
  ),
  (
    '00000000-0000-4000-8000-0000000000a1', 'task-recovery',
    'Sensitive task', 'Today', 'goal-recovery', 'short', false, null,
    1, now(), now()
  ),
  (
    '00000000-0000-4000-8000-0000000000a1', 'task-unassigned',
    'Unassigned private task', 'Today', null, 'short', false, null,
    1, now(), now()
  );

insert into public.user_data (user_id, data)
values (
  '00000000-0000-4000-8000-0000000000a1',
  jsonb_build_object(
    'marker', 'raw-private-document',
    'ligand.data', jsonb_build_object(
      'goals', jsonb_build_array(
        jsonb_build_object('id', 'goal-shared', 'name', 'School', 'type', 'custom'),
        jsonb_build_object('id', 'goal-private', 'name', 'Private venture', 'type', 'custom'),
        jsonb_build_object(
          'id', 'goal-recovery',
          'name', 'Sensitive recovery',
          'type', 'recovery',
          'recoveryData', jsonb_build_object('why', 'never expose')
        )
      ),
      'tasks', jsonb_build_array(
        jsonb_build_object(
          'id', 'task-shared', 'text', 'Submit assignment', 'label', 'Today',
          'goalId', 'goal-shared', 'term', 'short', 'done', false,
          'createdAt', '2026-07-14'
        ),
        jsonb_build_object(
          'id', 'task-done', 'text', 'Finished task', 'label', 'Urgent',
          'goalId', 'goal-shared', 'term', 'short', 'done', true,
          'completedOn', '2026-07-14', 'createdAt', '2026-07-13'
        ),
        jsonb_build_object(
          'id', 'task-private', 'text', 'Confidential plan', 'label', 'Today',
          'goalId', 'goal-private', 'done', false
        ),
        jsonb_build_object(
          'id', 'task-recovery', 'text', 'Sensitive task', 'label', 'Today',
          'goalId', 'goal-recovery', 'done', false
        ),
        jsonb_build_object(
          'id', 'task-unassigned', 'text', 'Unassigned private task',
          'label', 'Today', 'done', false
        )
      ),
      'journal', jsonb_build_array(jsonb_build_object('text', 'never expose journal')),
      'notes', jsonb_build_array(jsonb_build_object('text', 'never expose note'))
    )
  )
);

insert into public.assistant_oauth_clients (
  client_id, resource_url, allowed_user_id, enabled
)
values (
  'chatgpt-test-client',
  'https://ligand.example/mcp',
  '00000000-0000-4000-8000-0000000000a1',
  true
);

insert into public.assistant_access (
  user_id, enabled, tasks_read, tasks_write, allow_unassigned_tasks,
  allowed_goal_ids, timezone
)
values (
  '00000000-0000-4000-8000-0000000000a1',
  true,
  true,
  false,
  false,
  array['goal-shared', 'goal-recovery'],
  'America/Los_Angeles'
);

select is(
  public.ligand_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-0000000000a1',
      'claims', jsonb_build_object(
        'sub', '00000000-0000-4000-8000-0000000000a1',
        'client_id', 'chatgpt-test-client'
      )
    )
  ) #>> '{claims,aud}',
  'https://ligand.example/mcp',
  'the access-token hook binds an allowed OAuth token to the MCP resource'
);

select is(
  public.ligand_custom_access_token_hook(
    jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-0000000000a1',
      'claims', jsonb_build_object(
        'sub', '00000000-0000-4000-8000-0000000000a1'
      )
    )
  ) #>> '{claims,ligand_mcp}',
  null,
  'the access-token hook leaves an ordinary Ligand session unmarked'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select data ->> 'marker' from public.user_data $$,
  $$ values ('raw-private-document'::text) $$,
  'a direct Ligand session retains access to its own raw document'
);

select lives_ok(
  $$ update public.assistant_access set timezone = 'UTC'
      where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  'a direct Ligand session can manage its own assistant access row'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated',
    'client_id', 'chatgpt-test-client',
    'aud', 'https://ligand.example/mcp',
    'resource', 'https://ligand.example/mcp',
    'scope', 'openid',
    'ligand_mcp', true
  )::text,
  true
);

select is_empty(
  $$ select 1 from public.user_data $$,
  'an OAuth session cannot read the raw synced Ligand document'
);

select is_empty(
  $$ select 1 from public.assistant_access $$,
  'an OAuth session cannot read or enumerate assistant settings directly'
);

select is_empty(
  $$ select 1 from public.task_records $$,
  'an OAuth session cannot read authoritative task records directly'
);

select results_eq(
  $$ select public.assistant_get_tasks('today', 'open', 50, 'request-1') #>> '{tasks,0,id}' $$,
  $$ values ('task-shared'::text) $$,
  'the task RPC returns a task from an explicitly shared non-sensitive goal'
);

select results_eq(
  $$ select public.assistant_get_tasks('today', 'open', 50, 'request-fields') #> '{tasks,0}' ? 'deleted' $$,
  $$ values (false) $$,
  'the task RPC removes internal record-sync fields from assistant output'
);

select results_eq(
  $$ select (public.assistant_get_tasks('today', 'open', 50, 'request-2') ->> 'count')::integer $$,
  $$ values (1) $$,
  'private, recovery, completed, and unassigned tasks are filtered out'
);

select results_eq(
  $$ select public.assistant_get_tasks('today', 'completed', 50, 'request-3') #>> '{tasks,0,id}' $$,
  $$ values ('task-done'::text) $$,
  'the explicit completed filter returns the shared completed task'
);

select is_empty(
  $$ select 1 from public.assistant_audit_log $$,
  'an OAuth session cannot enumerate assistant audit records directly'
);

select throws_ok(
  $$ select public.assistant_add_task(
       'Write outline', 'goal-shared', 'Today', 'short', '2026-07-16',
       'add-disabled-0001', 'write-disabled'
     ) $$,
  '42501',
  'assistant task access is disabled',
  'task writes remain denied until the separate user permission is enabled'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated'
  )::text,
  true
);

select lives_ok(
  $$ update public.assistant_access set tasks_write = true
      where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  'a direct Ligand session can separately opt in to task writes'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated',
    'client_id', 'chatgpt-test-client',
    'aud', 'https://ligand.example/mcp',
    'resource', 'https://ligand.example/mcp',
    'scope', 'openid',
    'ligand_mcp', true
  )::text,
  true
);

select results_eq(
  $$ select public.assistant_add_task(
       'Write outline', 'goal-shared', 'Today', 'short', '2026-07-16',
       'add-task-0001', 'write-add'
     ) ->> 'status' $$,
  $$ values ('created'::text) $$,
  'an opted-in write can create one task in the selected goal scope'
);

select results_eq(
  $$ select public.assistant_add_task(
       'Write outline', 'goal-shared', 'Today', 'short', '2026-07-16',
       'add-task-0001', 'write-add-retry'
     ) ->> 'status' $$,
  $$ values ('replayed'::text) $$,
  'an identical idempotency retry does not create a second task'
);

select results_eq(
  $$ select public.assistant_complete_task(
       'assistant_' || md5(
         '00000000-0000-4000-8000-0000000000a1:chatgpt-test-client:add-task-0001'
       ),
       1, 'complete-task-0001', 'write-complete'
     ) ->> 'status' $$,
  $$ values ('completed'::text) $$,
  'completion requires the exact current task version'
);

select results_eq(
  $$ select public.assistant_reschedule_task(
       'assistant_' || md5(
         '00000000-0000-4000-8000-0000000000a1:chatgpt-test-client:add-task-0001'
       ),
       1, '2026-07-20', 'schedule-stale-0001', 'write-conflict'
     ) ->> 'status' $$,
  $$ values ('conflict'::text) $$,
  'a stale reschedule returns conflict instead of overwriting the newer record'
);

select throws_ok(
  $$ select public.assistant_add_task(
       'Sensitive write', 'goal-recovery', 'Today', 'short', null,
       'recovery-denied-0001', 'write-denied'
     ) $$,
  '42501',
  'task goal is outside assistant access',
  'recovery goals stay hard-denied even when their id is accidentally allowlisted'
);

select throws_ok(
  $$ select public.assistant_add_task(
       'Different content', 'goal-shared', 'Today', 'short', '2026-07-16',
       'add-task-0001', 'write-reused-key'
     ) $$,
  '22023',
  'idempotency key was already used for different arguments',
  'an idempotency key cannot be reused for different arguments'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated',
    'client_id', 'chatgpt-test-client',
    'aud', 'https://attacker.example/mcp',
    'resource', 'https://attacker.example/mcp',
    'scope', 'openid',
    'ligand_mcp', true
  )::text,
  true
);

select throws_ok(
  $$ select public.assistant_get_tasks('today', 'open', 50, 'bad-resource') $$,
  '42501',
  'oauth client or resource is not allowed',
  'a token for the wrong resource cannot call the task RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated',
    'client_id', 'other-test-client',
    'aud', 'https://ligand.example/mcp',
    'resource', 'https://ligand.example/mcp',
    'scope', 'openid',
    'ligand_mcp', true
  )::text,
  true
);

select throws_ok(
  $$ select public.assistant_get_tasks('today', 'open', 50, 'wrong-client') $$,
  '42501',
  'oauth client or resource is not allowed',
  'an unlisted OAuth client cannot call the task RPC directly'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000b2',
    'role', 'authenticated',
    'client_id', 'chatgpt-test-client',
    'aud', 'https://ligand.example/mcp',
    'resource', 'https://ligand.example/mcp',
    'scope', 'openid',
    'ligand_mcp', true
  )::text,
  true
);

select throws_ok(
  $$ select public.assistant_get_tasks('today', 'open', 50, 'wrong-user') $$,
  '42501',
  'oauth client or resource is not allowed',
  'the private OAuth client cannot be used by another Ligand user'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated',
    'client_id', 'chatgpt-test-client',
    'aud', 'https://ligand.example/mcp',
    'resource', 'https://ligand.example/mcp',
    'scope', 'openid',
    'ligand_mcp', false
  )::text,
  true
);

select throws_ok(
  $$ select public.assistant_get_tasks('today', 'open', 50, 'missing-marker') $$,
  '42501',
  'oauth token is not authorized for ligand mcp',
  'a token without the server-issued Ligand MCP marker is denied'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-0000000000a1',
    'role', 'authenticated'
  )::text,
  true
);

select results_eq(
  $$ select count(*)::integer from public.assistant_audit_log
      where request_id in ('request-1', 'request-2', 'request-3')
        and item_count = 1 $$,
  $$ values (3) $$,
  'the user can inspect audit metadata without exposing task or goal content'
);

select * from finish();

rollback;
