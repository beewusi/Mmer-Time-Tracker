// supabase/functions/ai-assist/index.ts
//
// One shared edge function behind every AI feature in the app. The
// frontend always calls this via supabase.functions.invoke('ai-assist',
// { body: { task, ...payload } }) — it never talks to Google directly,
// so the API key stays server-side only.
//
// Uses Google's Gemini API (gemini-2.5-flash), which has a genuinely
// free, non-expiring tier — unlike a trial credit that runs out after a
// month, this keeps working indefinitely under normal usage.
//
// Deploy:  supabase functions deploy ai-assist
// Get a key: https://aistudio.google.com/app/apikey (free, no card needed)
// Set key: supabase secrets set GEMINI_API_KEY=AIza...
//
// See AI_FEATURES.md for what each task does and why.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';

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

async function callGemini(system: string, userMessage: string, maxTokens = 400) {
  // Google is mid-migration from legacy "AIzaSy..." API keys to newer
  // "AQ...." Authentication Keys. The new format needs to be sent as an
  // Authorization header, not the old `?key=` query parameter — sending
  // it the old way is what caused 401 errors with a freshly-generated
  // AQ key.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = await res.json();

  // A blocked prompt (safety filters) or an empty response both come
  // back as a 200 with no usable candidate — surface that clearly
  // instead of returning an empty string silently.
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked this request: ${blockReason}`);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: { text?: string }) => p.text || '').join('');

  if (!text) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no text (finishReason: ${finishReason || 'unknown'})`);
  }

  return text;
}

// The model is asked for JSON-only, but this strips ```json fences too,
// in case it adds them anyway.
function jsonFromText(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=AIza...');
    }

    const body = await req.json();
    const { task } = body;

    // ---------- Time off decision message ----------
    if (task === 'time_off_message') {
      const { employeeName, type, startDate, endDate, status, reason } = body;
      const system = 'You write short, warm, professional messages from a workplace admin to an ' +
        'employee about a time off decision. 2-4 sentences. No greeting, sign-off, subject line or ' +
        'placeholders — just the message body itself. British English spelling.';
      const user = `Employee: ${employeeName}\nLeave type: ${type}\nDates: ${startDate} to ${endDate}\n` +
        `Employee's stated reason: ${reason || 'none given'}\nDecision: ${status}\n\n` +
        'Write the message the employee will see.';
      const text = await callGemini(system, user, 200);
      return jsonResponse({ message: text.trim() });
    }

    // ---------- Weekly summary ----------
    if (task === 'weekly_summary') {
      const { employeeName, weekLabel, hoursWorked, breakHours, sessionsCount, timeOffDays } = body;
      const system = 'You write a short, friendly weekly work summary (3-5 sentences) for an employee, ' +
        "based on their timesheet stats. Encouraging but factual — don't invent details beyond what's " +
        'given. British English spelling.';
      const user = `Employee: ${employeeName}\nWeek: ${weekLabel}\nHours worked: ${hoursWorked}\n` +
        `Break time: ${breakHours}\nSessions: ${sessionsCount}\nApproved time off this week: ${timeOffDays} day(s)\n\n` +
        'Write the summary.';
      const text = await callGemini(system, user, 250);
      return jsonResponse({ message: text.trim() });
    }

    // ---------- Timesheet anomaly note ----------
    // The app decides *whether* something is anomalous with plain maths
    // (see AdminDashboard.js) — the model is only asked to phrase the
    // note in one neutral sentence, never to judge the number itself.
    if (task === 'timesheet_anomaly') {
      const { employeeName, date, hoursToday, averageHours } = body;
      const system = "You write one short, neutral sentence flagging a timesheet entry that differs " +
        "from an employee's usual average, for an admin to see. Factual, not accusatory. British English spelling.";
      const user = `Employee: ${employeeName}\nDate: ${date}\nHours that day: ${hoursToday}\n` +
        `Their average: ${averageHours}\n\nWrite the one-sentence note.`;
      const text = await callGemini(system, user, 100);
      return jsonResponse({ message: text.trim() });
    }

    // ---------- Natural-language time off parsing ----------
    if (task === 'parse_time_off') {
      const { text: description, today } = body;
      const system = 'You convert a plain-English time off request into strict JSON with keys: ' +
        'type (one of "Annual Leave", "Sick Leave", "Unpaid Leave", "Emergency Leave", "Compassionate Leave"), ' +
        'start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), reason (short string, can be empty). ' +
        `Today's date is ${today}. Reply with ONLY the JSON object — no markdown fences, no commentary.`;
      const text = await callGemini(system, description, 200);
      const parsed = jsonFromText(text);
      return jsonResponse(parsed);
    }

    // ---------- Support chat ----------
    if (task === 'chat') {
      const { messages, context } = body;
      const system = 'You are a concise workplace assistant for the Mmerℇ time-tracking app. Answer ' +
        "only using the FAQ and the employee's own data given below — if you don't know, say so and " +
        'suggest they contact an admin. Keep answers to 2-4 sentences. British English spelling.\n\n' +
        `FAQ:\n${context?.faq || ''}\n\nThis employee's data:\n${context?.employeeData || ''}`;
      const lastMessages = (messages || []).slice(-8);
      const conversationText = lastMessages
        .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Employee' : 'Assistant'}: ${m.content}`)
        .join('\n');
      const text = await callGemini(system, conversationText, 300);
      return jsonResponse({ message: text.trim() });
    }

    throw new Error(`Unknown task: ${task}`);
  } catch (err) {
    console.error('ai-assist error:', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 400);
  }
});