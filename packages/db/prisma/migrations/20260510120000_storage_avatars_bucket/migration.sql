-- Provisions the `avatars` Supabase Storage bucket + its RLS policies.
--
-- Local dev gets the bucket from `supabase start` reading the
-- `[storage.buckets.avatars]` block in supabase/config.toml ; on managed
-- Supabase (production / staging) the bucket has to be created via the
-- dashboard or the storage API. Doing it here as part of `prisma migrate
-- deploy` removes one manual deploy-time step — every environment that
-- runs migrations automatically gets the bucket + the policies.
--
-- The bucket carries the same constraints as config.toml :
--   public read (avatar `<img src>` works without signed URLs)
--   2 MiB file size cap (matches what the upload pipeline pre-resizes to)
--   image/jpeg + image/png + image/webp only
--
-- The three RLS policies on `storage.objects` gate writes / updates /
-- deletes to `avatars/<auth.uid()>/...` so one user can't overwrite
-- another's avatar. Admin-uploaded paths (`avatars/org-logos/<orgId>/...`)
-- bypass RLS via the service-role client ; rbac is enforced in the
-- application layer instead. See [services/web/src/app/(authed)/admin/
-- organizations/actions.ts](../../../../services/web/src/app/(authed)/admin/organizations/actions.ts)
-- for the design rationale.
--
-- Idempotent : `ON CONFLICT (id) DO NOTHING` for the bucket row +
-- `IF NOT EXISTS` guards for each policy. Safe to re-run on an
-- environment where the bucket was already created via the dashboard.

-- 1. Bucket row.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MiB in bytes
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 2. RLS policies on storage.objects, scoped to the avatars bucket.
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
