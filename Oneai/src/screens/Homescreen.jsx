import React, { useState, useRef } from 'react';
import { SendHorizontal, Lightbulb, Code, PenTool, Compass, Construction, X, RefreshCw, Square, Plus } from 'lucide-react';
import './Homescreen.css';

const MODEL = 'stepfun/step-3.5-flash:free';
const MODEL_DISPLAY = 'Step 3.5 Flash';
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

function WipToast({ onClose }) {
  return (
    <div className="wip-overlay" onClick={onClose}>
      <div className="wip-toast" onClick={(e) => e.stopPropagation()}>
        <button className="wip-close" onClick={onClose}>
          <X size={14} />
        </button>
        <div className="wip-icon-wrap">
          <Construction size={22} />
        </div>
        <div className="wip-body">
          <h3 className="wip-title">Under Development</h3>
          <p className="wip-desc">
            uXnAI is actively being built. New features and improvements drop every day — check back tomorrow for what's new.
          </p>
        </div>
        <div className="wip-footer">
          <RefreshCw size={11} />
          <span>Check back every day for updates</span>
        </div>
      </div>
    </div>
  );
}

function Homescreen() {
  const [query, setQuery] = useState('');
  const [showWip, setShowWip] = useState(false);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const abortRef = useRef(null);

  const parseMarkdownBold = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const suggestions = [
    { icon: <Compass size={18} />, text: "Plan a 3-day trip to Tokyo" },
    { icon: <Lightbulb size={18} />, text: "Explain quantum physics simply" },
    { icon: <Code size={18} />, text: "Help me debug a React useEffect" },
    { icon: <PenTool size={18} />, text: "Write a professional email for a job" },
  ];

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || streaming) return;

    const userMessage = query.trim();
    setQuery('');
    setHasStarted(true);

    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(updatedMessages);
    setStreaming(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'uXnAI',
        },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          messages: updatedMessages,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error?.message || 'API error');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content || '';
            if (token) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + token,
                };
                return updated;
              });
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `⚠️ Error: ${err.message}`,
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="home-screen">
      {showWip && <WipToast onClose={() => setShowWip(false)} />}

      {/* Header — fades out once chat starts */}
      <div className={`home-header ${hasStarted ? 'home-header--hidden' : ''}`}>
        <p className="tagline_home">How can I help you today?</p>
        <button className="wip-btn" onClick={() => setShowWip(true)}>
          <Construction size={13} />
          Work in Progress
        </button>
      </div>

      <div className="main-content">
        {!hasStarted ? (
          <div className="suggestions-grid">
            {suggestions.map((item, index) => (
              <div
                key={index}
                className="suggestion-card"
                onClick={() => setQuery(item.text)}
              >
                <div className="suggestion-icon">{item.icon}</div>
                <p className="suggestion-text">{item.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg, i) => (
              <div key={i} className={`message message--${msg.role}`}>
                <span className="message-role">
                  {msg.role === 'user' ? 'You' : 'uXnAI'}
                </span>
                <p className="message-content">
                  {parseMarkdownBold(msg.content)}
                  {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="cursor-blink" />
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="input-wrapper">
        <div className="model-dropdown-wrapper">
          <button 
            className="model-tag" 
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            type="button"
          >
            <span className="model-dot" />
            {MODEL_DISPLAY}
            <span className="dropdown-arrow">▼</span>
          </button>
          {showModelDropdown && (
            <div className="model-dropdown-menu">
              <div className="model-option selected">
                <span className="model-dot" />
                {MODEL_DISPLAY}
              </div>
            </div>
          )}
        </div>

        <form className="input-container" onSubmit={handleSubmit}>
          <button type="button" className="plus-btn" title="Attach">
            <Plus size={18} />
          </button>

          <input
            type="text"
            className="input-bar"
            placeholder="Message uXnAI..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={streaming}
          />

          {streaming ? (
            <button type="button" className="send-btn stop-btn" onClick={handleStop}>
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" className="send-btn" disabled={!query.trim()}>
              <SendHorizontal size={20} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default Homescreen;