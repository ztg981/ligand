-- Journal media (voice notes and short clips) in Supabase Storage.
--
-- These blobs deliberately do NOT go in public.user_data: that row is fetched
-- and pushed whole on every change, so a few megabytes of audio would make
-- every sync heavier for every device. The journal entry keeps only a
-- reference, and the bytes live here.
--
-- The bucket is PRIVATE. Objects are addressed as `<user_id>/<media_id>`, and
-- every policy checks that the first path segment is the caller's own uid, so
-- one user can never read, overwrite, or delete another's recordings. Reads go
-- through short-lived signed URLs rather than public links.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-media',
  'journal-media',
  false,
  26214400, -- 25 MB ceiling per object; the client caps recordings far below this
  array[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac',
    'video/webm', 'video/mp4', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Recreate policies idempotently so the migration can be re-run safely.
drop policy if exists "journal_media_select_own" on storage.objects;
drop policy if exists "journal_media_insert_own" on storage.objects;
drop policy if exists "journal_media_update_own" on storage.objects;
drop policy if exists "journal_media_delete_own" on storage.objects;

create policy "journal_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'journal-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "journal_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'journal-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "journal_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'journal-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'journal-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "journal_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'journal-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
