// supabase/functions/reminder-sweep/index.ts
//
// Runs on a schedule (CRON_SETUP.sql). Checks employee_status and profiles for
// anyone past a reminder threshold who hasn't been notified yet, then sends an
// email and a desktop push. Works with every tab closed.
// - Push only reaches browsers where the employee turned on desktop
//   notifications (src/lib/push.js). Otherwise it's email only.
// - Also does the 8h15m auto clock-out: saves the record and sets them
//   clocked_out.
//
// Needs REMINDER_SWEEP_SCHEMA.sql and PUSH_SUBSCRIPTIONS_SCHEMA.sql run first,
// plus the EMAILJS_PRIVATE_KEY and VAPID_* secrets.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ---------------- Config ----------------

// Org timezone as a UTC offset in minutes. One timezone for everyone for now,
// would need to be per-employee if I hire outside Ghana.
const ORG_UTC_OFFSET_MINUTES = 0; // Africa/Accra, UTC+0 all year

// Grace period before a clock-in counts as missed.
const MISSED_CLOCK_IN_GRACE_MINUTES = 15;

// Days with no missed-clock-in check (getUTCDay(): 0 = Sun, 6 = Sat). Org-wide
// for now, no per-employee schedules yet.
const NON_WORKING_DAYS = [0, 6];

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Same EmailJS service/template as Dashboard.js.
const EMAILJS_SERVICE_ID = 'service_qo5r5ol';
const EMAILJS_TEMPLATE_ID = 'template_iyjajm8';
const EMAILJS_PUBLIC_KEY = 'EWbasKvfwG1WXLCuA';
// Private key from a function secret, not in source:
//   supabase secrets set EMAILJS_PRIVATE_KEY=xxxxx
// (EmailJS dashboard > Account > API Keys). Needed because this call doesn't
// come from the registered site origin.
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY');

async function sendEmail(toEmail: string, toName: string, title: string, message: string) {
  if (!toEmail) return;
  if (!EMAILJS_PRIVATE_KEY) {
    console.log('[reminder-sweep] EMAILJS_PRIVATE_KEY not set — skipping email:', title, toEmail);
    return;
  }
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          title,
          to_name: toName,
          to_email: toEmail,
          message
        }
      })
    });
    if (!res.ok) {
      console.log('[reminder-sweep] EmailJS error:', res.status, await res.text());
    }
  } catch (err) {
    console.log('[reminder-sweep] EmailJS request failed:', err);
  }
}

// VAPID keys from `npx web-push generate-vapid-keys`, stored as secrets
// (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT).
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Push to every browser the employee enabled (push_subscriptions). No rows =
// never enabled, nothing to send.
async function sendPush(userId: string, title: string, body: string, tag: string) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.log('[reminder-sweep] VAPID secrets not set — skipping push for', userId);
    return;
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.log('[reminder-sweep] Failed to load push_subscriptions for', userId, error);
    return;
  }
  if (!subs || subs.length === 0) return;

  const payload = JSON.stringify({ title, body, tag });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      await supabase
        .from('push_subscriptions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', sub.id);
    } catch (err: any) {
      // 404/410 = dead subscription. Remove it so it doesn't fail every run.
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        console.log('[reminder-sweep] Removing expired push subscription', sub.id);
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.log('[reminder-sweep] Push send failed for', sub.id, err);
      }
    }
  }
}


function secondsToHms(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Same worked-seconds maths as applyServerClockState in Dashboard.js so both
// show the same time.
function workedSecondsFor(status: any, now: Date) {
  const clockInAt = status.clock_in_at ? new Date(status.clock_in_at).getTime() : now.getTime();
  const breakAccum = status.break_accum_seconds || 0;

  if (status.status === 'on_break' && status.break_started_at) {
    const breakStartAt = new Date(status.break_started_at).getTime();
    return Math.max(0, Math.round((breakStartAt - clockInAt) / 1000) - breakAccum);
  }
  return Math.max(0, Math.round((now.getTime() - clockInAt) / 1000) - breakAccum);
}

async function sweepBreakAndClockOutReminders(now: Date) {
  const { data: statuses, error } = await supabase
    .from('employee_status')
    .select('*')
    .in('status', ['clocked_in', 'on_break']);

  if (error) {
    console.log('[reminder-sweep] Failed to load employee_status:', error);
    return;
  }
  if (!statuses || statuses.length === 0) return;

  const userIds = statuses.map((s: any) => s.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds);
  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));

  for (const status of statuses) {
    const profile = profileById.get(status.user_id);
    if (!profile) continue; // no profile, nothing to email

    const worked = workedSecondsFor(status, now);
    const updates: Record<string, any> = {};

    if (worked >= 7200 && !status.break_2h_sent) {
      updates.break_2h_sent = true;
      await sendEmail(profile.email, profile.full_name, 'Break Nudge',
        'You have been working for 2 hours. A short break can help.');
      await sendPush(status.user_id, 'Mmer3 — Break Reminder',
        'You\u2019ve been working for 2 hours. Consider taking a short break.', 'break-2h');
    }
    if (worked >= 10800 && !status.break_3h_sent) {
      updates.break_3h_sent = true;
      await sendEmail(profile.email, profile.full_name, 'Break Reminder',
        'You have been working for 3 hours. Time to take a break.');
      await sendPush(status.user_id, 'Mmer3 — Break Reminder',
        'You\u2019ve been working for 3 hours. It\u2019s time to take a break.', 'break-3h');
    }
    if (worked >= 28800 && !status.clock_out_8h_sent) {
      updates.clock_out_8h_sent = true;
      await sendEmail(profile.email, profile.full_name, 'Clock Out Reminder',
        'You have worked 8 hours. Please clock out.');
      await sendPush(status.user_id, 'Mmer3 — Clock-Out Reminder',
        'You\u2019ve worked 8 hours. Please clock out when you\u2019re finished.', 'clock-out-8h');
    }
    if (worked >= 29700 && !status.auto_clock_out_sent) {
      updates.auto_clock_out_sent = true;
      await sendEmail(profile.email, profile.full_name, 'Auto Clock Out',
        'You are being automatically clocked out after 8 hours 15 minutes.');
      await sendPush(status.user_id, 'Mmer3 — Automatic Clock-Out',
        'You\u2019ve reached 8 hours 15 minutes, so Mmer3 has automatically clocked you out.', 'auto-clock-out');

      // Auto clock-out, same steps as handleAdminClockOut: save the record,
      // reset employee_status. Location comes from employee_status (was
      // hardcoded to 'unavailable', which showed N/A).
      const clockInAt = status.clock_in_at ? new Date(status.clock_in_at) : now;
      const totalSeconds = Math.max(0, Math.round((now.getTime() - clockInAt.getTime()) / 1000) - (status.break_accum_seconds || 0));

      await supabase.from('records').insert([{
        user_id: status.user_id,
        date: now.toLocaleDateString('en-GB'),
        clock_in: clockInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clock_out: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hours_worked: secondsToHms(totalSeconds),
        break_time: secondsToHms(status.break_accum_seconds || 0),
        location_status: status.location_status || 'unavailable',
        adjusted_by_admin: false
      }]);

      updates.status = 'clocked_out';
      updates.clock_in_at = null;
      updates.break_started_at = null;
      updates.break_accum_seconds = 0;
      // Only if the column exists, so the update can't fail and leave them
      // clocked in before location_status.sql is run.
      if ('location_status' in status) updates.location_status = null;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = now.toISOString();
      await supabase.from('employee_status').update(updates).eq('user_id', status.user_id);
    }
  }
}

async function sweepMissedClockIn(now: Date) {
  // "today"/"now" in the org timezone, not the server's UTC. Shift by the
  // offset then read with the UTC getters. No-op for Accra but ready if the
  // offset changes.
  const localNow = new Date(now.getTime() + ORG_UTC_OFFSET_MINUTES * 60000);
  const dayOfWeek = localNow.getUTCDay();
  if (NON_WORKING_DAYS.includes(dayOfWeek)) return;

  const todayIso = localNow.toISOString().slice(0, 10);

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, expected_clock_in_time, missed_clock_in_notified_date, optional_reminders, is_admin, status')
    .eq('is_admin', false)
    .eq('status', 'approved');

  if (error) {
    console.log('[reminder-sweep] Failed to load profiles for missed clock-in:', error);
    return;
  }
  if (!profiles || profiles.length === 0) return;

  // Only people who turned this reminder on and haven't been notified today.
  const candidates = profiles.filter((p: any) =>
    p.optional_reminders && p.optional_reminders.missedClockIn &&
    p.missed_clock_in_notified_date !== todayIso
  );
  if (candidates.length === 0) return;
  const candidateIds = candidates.map((p: any) => p.id);

  const { data: statuses } = await supabase
    .from('employee_status')
    .select('*')
    .in('user_id', candidateIds);
  const statusById = new Map((statuses || []).map((s: any) => [s.user_id, s]));

  const { data: timeOff } = await supabase
    .from('time_off_requests')
    .select('user_id, status, start_date, end_date')
    .in('user_id', candidateIds)
    .eq('status', 'approved')
    .lte('start_date', todayIso)
    .gte('end_date', todayIso);
  const onLeaveIds = new Set((timeOff || []).map((t: any) => t.user_id));

  for (const profile of candidates) {
    if (onLeaveIds.has(profile.id)) continue;

    const status = statusById.get(profile.id);
    // Already clocked in/out today, not missed. Checking the date because a
    // stale 'clocked_out' from another day doesn't count (same as getStatus in
    // AdminDashboard.js).
    if (status) {
      const relevantAt = status.clock_in_at || status.updated_at;
      const relevantDateIso = relevantAt
        ? new Date(new Date(relevantAt).getTime() + ORG_UTC_OFFSET_MINUTES * 60000).toISOString().slice(0, 10)
        : null;
      if (relevantDateIso === todayIso && status.status !== 'not_clocked_in') continue;
    }

    const expected = profile.expected_clock_in_time || '08:00:00';
    const [expH, expM] = expected.split(':').map((n: string) => parseInt(n, 10));
    const deadline = new Date(localNow);
    deadline.setUTCHours(expH, expM + MISSED_CLOCK_IN_GRACE_MINUTES, 0, 0);

    if (localNow.getTime() < deadline.getTime()) continue; // grace period not up yet

    await sendEmail(profile.email, profile.full_name, 'Missed Clock-In — Mmerℇ',
      `It's past ${expected.slice(0, 5)} and I don't see you clocked in yet today. If this is expected (leave, a late start, etc.) you can ignore this.`);
    await sendPush(profile.id, 'Mmer3 — Missed Clock-In',
      'You haven\u2019t clocked in yet today. If you\u2019re starting late or on leave, you can ignore this reminder.', 'missed-clock-in');

    await supabase
      .from('profiles')
      .update({ missed_clock_in_notified_date: todayIso })
      .eq('id', profile.id);
  }
}

Deno.serve(async (_req) => {
  const now = new Date();
  await sweepBreakAndClockOutReminders(now);
  await sweepMissedClockIn(now);
  return new Response(JSON.stringify({ ok: true, ranAt: now.toISOString() }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
