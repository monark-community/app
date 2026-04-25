-- Avatars bucket RLS policies.
-- The bucket itself is created via supabase/config.toml on `supabase start`
-- (and via the dashboard / CLI in production). This migration only owns the
-- row-level policies on `storage.objects`.
--
-- Contract:
--  - Anyone can read (public bucket + storage exposes objects via the
--    /object/public/... URL; no policy needed for read on a public bucket).
--  - Authenticated users can write only under `avatars/<their-auth-uid>/*`,
--    so one user can't overwrite another's avatar.
--  - The authenticated user can delete only their own files.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_user_insert_own'
  ) then
    create policy "avatars_user_insert_own"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_user_update_own'
  ) then
    create policy "avatars_user_update_own"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_user_delete_own'
  ) then
    create policy "avatars_user_delete_own"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end
$$;
