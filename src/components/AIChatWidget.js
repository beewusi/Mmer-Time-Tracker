import { useState, useRef, useEffect } from 'react';
import { callAI } from '../lib/ai';
import { HelpIcon, XIcon } from '../icons';
import './AIChatWidget.css';

// Floating support assistant, mounted once on the employee dashboard so
// it's available from any tab. Answers are grounded only in the FAQ
// text and the employee's own stats passed in via `context` — see
// buildChatContext() in Dashboard.js.
function AIChatWidget({ context }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I can help with clocking in/out, breaks, timesheets or time off. What's up?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await callAI('chat', { messages: nextMessages, context });
      setMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
    } catch (err) {
      console.log('AI assistant error:', err);
      setError("Couldn't reach the assistant — please try again in a moment.");
    }
    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="ai-chat-root">
      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <span>Assistant</span>
            <button className="ai-chat-close" onClick={() => setOpen(false)} aria-label="Close assistant">
              <XIcon width={15} height={15} />
            </button>
          </div>
          <div className="ai-chat-messages" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`ai-chat-bubble ai-chat-bubble-${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="ai-chat-bubble ai-chat-bubble-assistant ai-chat-typing">Thinking...</div>
            )}
          </div>
          {error && <p className="ai-chat-error">{error}</p>}
          <div className="ai-chat-input-row">
            <input
              type="text"
              placeholder="Ask a question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()}>Send</button>
          </div>
        </div>
      )}
      <button className="ai-chat-fab" onClick={() => setOpen(o => !o)} aria-label="Open assistant">
        <HelpIcon width={20} height={20} />
      </button>
    </div>
  );
}

export default AIChatWidget;
