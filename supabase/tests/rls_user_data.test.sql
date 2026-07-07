begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

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
    'ligand-rls-a@example.test',
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
    'ligand-rls-b@example.test',
    'test',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  )
on conflict (id) do nothing;

delete from public.ai_rate_limits
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);
delete from public.user_data
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b2'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ insert into public.user_data (user_id, data)
     values ('00000000-0000-4000-8000-0000000000a1', '{"marker":"A"}'::jsonb) $$,
  'user A can insert its own row'
);

select results_eq(
  $$ select data->>'marker' from public.user_data where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('A'::text) $$,
  'user A can read its own row'
);

select throws_ok(
  $$ insert into public.user_data (user_id, data)
     values ('00000000-0000-4000-8000-0000000000b2', '{"marker":"bad"}'::jsonb) $$,
  '42501',
  null,
  'user A cannot insert a row owned by user B'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ insert into public.user_data (user_id, data)
     values ('00000000-0000-4000-8000-0000000000b2', '{"marker":"B"}'::jsonb) $$,
  'user B can insert its own row'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is_empty(
  $$ select 1 from public.user_data where user_id = '00000000-0000-4000-8000-0000000000b2' $$,
  'user A cannot select user B row'
);

select is_empty(
  $$ update public.user_data
       set data = '{"marker":"hijacked"}'::jsonb
     where user_id = '00000000-0000-4000-8000-0000000000b2'
     returning 1 $$,
  'user A cannot update user B row'
);

select throws_ok(
  $$ update public.user_data
       set user_id = '00000000-0000-4000-8000-0000000000b2'
     where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  '42501',
  null,
  'user A cannot transfer ownership to user B'
);

select is_empty(
  $$ delete from public.user_data
     where user_id = '00000000-0000-4000-8000-0000000000b2'
     returning 1 $$,
  'user A cannot delete user B row'
);

select results_eq(
  $$ select data->>'marker' from public.user_data where user_id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ values ('A'::text) $$,
  'user A row remains intact'
);

select throws_ok(
  $$ select count(*) from public.ai_rate_limits $$,
  '42501',
  null,
  'authenticated users cannot read AI quota table directly'
);

select results_eq(
  $$ select allowed, remaining from public.consume_ai_rate_limit('goal-summary', 2, 60) $$,
  $$ values (true, 1) $$,
  'first AI quota consume is allowed'
);

select results_eq(
  $$ select allowed, remaining from public.consume_ai_rate_limit('goal-summary', 2, 60) $$,
  $$ values (true, 0) $$,
  'second AI quota consume is allowed'
);

select results_eq(
  $$ select allowed, remaining from public.consume_ai_rate_limit('goal-summary', 2, 60) $$,
  $$ values (false, 0) $$,
  'third AI quota consume is denied'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select count(*) from public.user_data $$,
  '42501',
  null,
  'anonymous users cannot read user_data'
);

select throws_ok(
  $$ select * from public.consume_ai_rate_limit('goal-summary', 2, 60) $$,
  '42501',
  null,
  'anonymous users cannot execute AI quota RPC'
);

select * from finish();

rollback;
