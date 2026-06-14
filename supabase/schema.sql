-- ============================================================
-- Ligand — Supabase schema + Row Level Security
-- ============================================================
-- HOW TO RUN (one time, ~30 seconds):
--   1. Open your project at https://supabase.com/dashboard
--   2. Left sidebar → SQL Editor → "New query"
--   3. Paste this entire file and click "Run"
--   4. You should see "Success. No rows returned."
--
-- This is safe to run more than once — it uses IF NOT EXISTS and
-- drops/recreates the policies, so re-running won't error.
--
-- WHY THIS IS NEEDED: the app ships only the publishable (anon) key,
-- which by design cannot create tables or alter security. Schema
-- changes must be applied from the dashboard (or the Supabase CLI).
-- ============================================================

-- One row per user. The whole Ligand localStorage blob (goals, tasks,
-- settings, tweaks, journal, etc.) is stored together as a single JSON
-- object in `data`, keyed by the user's auth id.
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Turn ON Row Level Security. With RLS enabled and the policies below,
-- a user can ONLY ever see or change the row whose user_id equals their
-- own auth.uid(). Anonymous (unauthenticated) requests match no policy
-- and are denied entirely.
alter table public.user_data enable row level security;

-- Re-create policies idempotently so this file is safe to re-run.
drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

-- SELECT: only your own row.
create policy "user_data_select_own"
  on public.user_data
  for select
  using (auth.uid() = user_id);

-- INSERT: you may only insert a row that belongs to you.
create policy "user_data_insert_own"
  on public.user_data
  for insert
  with check (auth.uid() = user_id);

-- UPDATE: you may only update your own row, and may not reassign it
-- to someone else (both USING and WITH CHECK pin user_id to auth.uid()).
create policy "user_data_update_own"
  on public.user_data
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: only your own row.
create policy "user_data_delete_own"
  on public.user_data
  for delete
  using (auth.uid() = user_id);

-- Optional but recommended: keep updated_at fresh on every write.
-- (The app also sets updated_at explicitly, so this is belt-and-suspenders.)
create or replace function public.user_data_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute function public.user_data_touch_updated_at();
