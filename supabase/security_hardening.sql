-- Security Advisor fixes

-- 1. SECURITY DEFINER functions open to anon + authenticated via the API
-- auto_clock_out_overdue: not called by the app
-- handle_new_user: sign-up trigger only
revoke execute on function public.auto_clock_out_overdue() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2. Functions with no fixed search_path
-- pinned to public so a different search_path can't swap in other objects
alter function public.handle_new_user() set search_path = public;
alter function public.auto_clock_out_overdue() set search_path = public;
alter function public.hms_string set search_path = public;

-- 3. avatars bucket: anyone could list every file in it
-- public URLs still work without a select policy. Kept select for own files
-- only, since the upload in Profile.js uses upsert (needs select on the file).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_own_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '-%');

-- 4. Leaked password protection
-- Pro plan only, left off for now. Stronger password rules set in the
-- dashboard instead (Authentication > Sign In / Providers > Email).
