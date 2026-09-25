// supabase/functions/reminder-sweep/index.ts
//
// I'm calling this "reminder-sweep" because that's exactly what it does
// every time it runs: it sweeps the employee_status and profiles tables
// for anyone who has crossed a reminder threshold and hasn't been
// notified yet, and emails them. Unlike the in-app timers in
// Dashboard.js, this runs on Supabase's servers on a schedule (see
// CRON_SETUP.sql), so it keeps working even if every employee's browser
// tab is closed.
//
// What this can and can't do, so I don't oversell it to myself later:
// - It CAN send email reminders regardless of whether anyone has the
//   app open, because it runs on a schedule on Supabase's servers, not
//   in anyone's browser.
// - It now ALSO sends real desktop push notifications, the same way —
//   these show up even with the Mmerℇ tab fully closed, as long as the
//   employee clicked "Enable Desktop Notifications" at least once on
//   this browser (see src/lib/push.js). If they haven't, or they're on
//   a browser/device that was never enabled, they only get the email.
// - It also now performs the real 8h15m auto clock-out server-side —
//   inserting the finished record and marking the employee clocked_out
//   — instead of the old comment in Dashboard.js that claimed this was
//   already happening when it wasn't.
//
// Before deploying this, I need to have already run
// supabase/REMINDER_SWEEP_SCHEMA.sql and
// supabase/PUSH_SUBSCRIPTIONS_SCHEMA.sql once, and set the
// EMAILJS_PRIVATE_KEY and VAPID_* secrets (see the notes near where
// each is read below).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// ---------------- Config I might want to tweak later ----------------

// My org's single timezone, expressed as an offset from UTC in minutes.
// I'm assuming one timezone for the whole company here, since that's
// what I actually have today. Accra doesn't observe daylight saving, so
// this stays constant year-round — if I ever hire outside Ghana, this
// needs to become a per-employee value instead of one constant.
const ORG_UTC_OFFSET_MINUTES = 0; // Africa/Accra is UTC+0 all year

// How long after someone's expected clock-in time I wait before I call
// it "missed" — this is the 15-minute grace period from my second idea.
const MISSED_CLOCK_IN_GRACE_MINUTES = 15;

// Days I skip the missed-clock-in check on (JS getUTCDay(): 0 = Sun,
// 6 = Sat). I don't have a per-employee work-schedule concept yet, so
// this is a single org-wide assumption — worth revisiting if that's
// wrong for some of my staff.
const NON_WORKING_DAYS = [0, 6];

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Same EmailJS service/template Dashboard.js already sends through, so
// an email from this function looks identical to one sent from an open
// tab.
const EMAILJS_SERVICE_ID = 'service_qo5r5ol';
const EMAILJS_TEMPLATE_ID = 'template_iyjajm8';
const EMAILJS_PUBLIC_KEY = 'EWbasKvfwG1WXLCuA';
// I'm keeping the private key out of source and reading it from a
// function secret instead:
//   supabase secrets set EMAILJS_PRIVATE_KEY=xxxxx
// (found in the EmailJS dashboard under Account > API Keys). EmailJS
// needs this to accept a send request that isn't coming from my
// registered site origin, which is exactly what a server-to-server call
// from this function is.
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

// These three are the VAPID credentials I generated once with
// `npx web-push generate-vapid-keys` and stored as function secrets —
// see supabase secrets set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT. They're what let a browser trust that a push actually
// came from my server and nobody else's.
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT');

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Sends a desktop push to every browser this employee has enabled
// notifications on (there can be more than one — see
// push_subscriptions in PUSH_SUBSCRIPTIONS_SCHEMA.sql). If they've
// never enabled it anywhere, there are simply no rows for their
// user_id, and this quietly does nothing — that's expected, not an
// error, since push is opt-in per browser.
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
      // A 404 or 410 here means the browser itself has told us this
      // subscription is dead — the person uninstalled/cleared data,
      // the browser expired it, whatever the reason. I'm removing it
      // rather than leaving it to fail the same way every 5 minutes
      // forever.
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

// This mirrors the worked-seconds math in
// Dashboard.js/applyServerClockState on purpose — I want this function
// to agree with what the employee's own screen would show, not invent a
// second definition of "how long have I worked".
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
    if (!profile) continue; // no matching profile — nothing to email

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

      // I'm performing the actual auto clock-out here, for real, since
      // this function is the one place in the whole app that now
      // reliably runs regardless of whether any tab is open. This
      // mirrors handleAdminClockOut in AdminDashboard.js: write the
      // finished session to records, then reset employee_status.
      const clockInAt = status.clock_in_at ? new Date(status.clock_in_at) : now;
      const totalSeconds = Math.max(0, Math.round((now.getTime() - clockInAt.getTime()) / 1000) - (status.break_accum_seconds || 0));

      await supabase.from('records').insert([{
        user_id: status.user_id,
        date: now.toLocaleDateString('en-GB'),
        clock_in: clockInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        clock_out: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hours_worked: secondsToHms(totalSeconds),
        break_time: secondsToHms(status.break_accum_seconds || 0),
        location_status: 'unavailable',
        adjusted_by_admin: false
      }]);

      updates.status = 'clocked_out';
      updates.clock_in_at = null;
      updates.break_started_at = null;
      updates.break_accum_seconds = 0;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = now.toISOString();
      await supabase.from('employee_status').update(updates).eq('user_id', status.user_id);
    }
  }
}

async function sweepMissedClockIn(now: Date) {
  // I want "today" and "now" in my org's timezone, not the server's
  // (which runs in UTC) — otherwise an 8am Accra threshold would fire
  // at the wrong wall-clock moment. Since Accra is UTC+0 all year, this
  // is a no-op today, but it's here so the offset constant above
  // actually does something the day I change it. The trick: shift the
  // real UTC time by my offset, then read it back with the UTC getters
  // — that gives me "local" wall-clock values without needing a
  // timezone database.
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

  // Only people who've opted into this reminder (the toggle already on
  // the Reminders page) and who I haven't already notified today.
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
    // Already clocked in (or on break, or clocked out) TODAY — not
    // missed. I'm comparing dates here rather than just checking
    // status !== 'not_clocked_in', for the same reason I fixed
    // AdminDashboard.js/getStatus: a stale 'clocked_out' from a
    // previous day shouldn't count as "already handled today".
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

    if (localNow.getTime() < deadline.getTime()) continue; // grace period isn't up yet

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
