// supabase/functions/admin-reject-user/index.ts
//
// Deletes a rejected sign-up completely: the profiles row AND the
// underlying auth.users row. Deleting only the profiles row (e.g. by hand
// in the Table Editor) leaves a "ghost" auth user behind — Supabase then
// silently refuses to let that email sign up again, since as far as it's
// concerned the account already exists.
//
// Only the admin (matched by email, same as ADMIN_EMAIL in src/supabase.js)
// can call this. The service role key is required to delete an auth user
// and is never exposed to the browser — it's only available inside this
// function, and Supabase auto-injects it as an env var on deploy.
//
// Deploy: supabase functions deploy admin-reject-user
// (No `supabase secrets set` needed — SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically to every function.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_EMAIL = 'admin@mmer3.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // Confirm the caller is actually the signed-in admin before doing
    // anything destructive — this runs with the caller's own JWT, not
    // elevated privileges, so it can only tell us who's asking.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller || caller.email !== ADMIN_EMAIL) {
      return jsonResponse({ error: 'Not authorized' }, 403);
    }

    const { userId } = await req.json();
    if (!userId) {
      return jsonResponse({ error: 'Missing userId' }, 400);
    }

    // Only now do we use the service role key — the one client in this
    // whole app that's allowed to delete an auth user outright.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Clear anything that references this user first. Postgres blocks
    // deleting an auth user while other tables still point at their id
    // (foreign key constraints) — for an employee who's clocked in or
    // requested time off before, that's records and time_off_requests.
    // Deleting those here means Delete/Reject always actually succeeds,
    // instead of silently failing on employees who have history.
    await adminClient.from('time_off_requests').delete().eq('user_id', userId);
    await adminClient.from('records').delete().eq('user_id', userId);
    await adminClient.from('profiles').delete().eq('id', userId);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 400);
  }
});