import { supabase } from '../supabase';

// Wrapper around the ai-assist edge function. Every assistant feature goes
// through here. Prompts are in supabase/functions/ai-assist/index.ts. Needs
// GEMINI_API_KEY set as a Supabase secret.
export async function callAI(task, payload) {
  const { data, error } = await supabase.functions.invoke('ai-assist', {
    body: { task, ...payload }
  });

  if (error) {
    // supabase-js only returns a generic non-2xx message. The real error is in
    // the response body (error.context).
    if (error.context && typeof error.context.json === 'function') {
      try {
        const body = await error.context.json();
        throw new Error(body.error || error.message || 'The AI assistant is unavailable right now.');
      } catch (parseErr) {
        // Body wasn't JSON or was already read, use the generic message.
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
