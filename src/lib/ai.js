import { supabase } from '../supabase';

// Thin wrapper around the `ai-assist` Supabase Edge Function. Every AI
// feature in the app goes through this one function — see
// supabase/functions/ai-assist/index.ts for the server-side prompts and
// AI_FEATURES.md for what each task does and which model it uses.
//
// This works independently of TEST_MODE — it only needs the edge function
// deployed and GEMINI_API_KEY set as a Supabase secret. See the setup
// guide for the exact commands.
export async function callAI(task, payload) {
  const { data, error } = await supabase.functions.invoke('ai-assist', {
    body: { task, ...payload }
  });

  if (error) {
    // supabase-js only gives a generic "non-2xx status code" message here
    // — the actual reason we threw server-side is in the response body,
    // reachable via error.context (the raw Response object).
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        throw new Error(body.error || error.message || 'The AI assistant is unavailable right now.');
      } catch (parseErr) {
        // Body wasn't JSON (or already consumed) — fall back to the
        // generic message rather than hiding the failure entirely.
        throw new Error(error.message || 'The AI assistant is unavailable right now.');
      }
    }
    throw new Error(error.message || 'The AI assistant is unavailable right now.');
  }
  if (data && data.error) {
    throw new Error(data.error);
  }
  return data;
}
