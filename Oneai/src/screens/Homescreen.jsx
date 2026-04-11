import React, { useEffect, useState, useRef } from 'react';
import { SendHorizontal, Lightbulb, Code, PenTool, Compass, Construction, X, RefreshCw, Square, Plus, ThumbsUp, ThumbsDown, Copy, ChevronDown, Cpu, Check } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './Homescreen.css';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://uxnai.onrender.com';
const TEXT_SESSIONS_KEY = 'oneai:textSessions';
const ACTIVE_TEXT_SESSION_KEY = 'oneai:activeTextSessionId';
const MODEL_DISPLAY = 'uXnAI · 3-Model Pipeline';

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
};

const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const slugTitleFromText = (text) => {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  const firstLine = t.split('\n')[0].trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
};

// ── Code block with copy button ──────────────────────────────────────────────
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <pre className="markdown-code-block">
      <div className="code-block-header">
        <span className="markdown-code-lang">{lang || 'code'}</span>
        <button
          type="button"
          className={`code-copy-btn ${copied ? 'code-copy-btn--copied' : ''}`}
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <code>{code}</code>
    </pre>
  );
}

// ── Insight loader ────────────────────────────────────────────────────────────
function InsightLoader() {
  return (
    <div className="insight-loader">
      <Cpu size={13} className="insight-loader-icon" />
      <span>Consulting specialist models…</span>
    </div>
  );
}

function WipToast({ onClose }) {
  return (
    <div className="wip-overlay" onClick={onClose}>
      <div className="wip-toast" onClick={(e) => e.stopPropagation()}>
        <button className="wip-close" onClick={onClose}><X size={14} /></button>
        <div className="wip-icon-wrap"><Construction size={22} /></div>
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
  const [phase, setPhase] = useState('idle'); // 'idle' | 'gathering' | 'streaming'
  const [hasStarted, setHasStarted] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState({});
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(
    () => localStorage.getItem(ACTIVE_TEXT_SESSION_KEY) || ''
  );
  const [showScrollButton, setShowScrollButton] = useState(false);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const messagesListRef = useRef(null);
  const autoScrollRef = useRef(true);

  const isStreaming = phase !== 'idle';

  // ── Scroll ──────────────────────────────────────────────────────────────────
  const handleScroll = (e) => {
    const el = e.target;
    const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 50;
    setShowScrollButton(!atBottom);
    autoScrollRef.current = atBottom;
  };

  const scrollToBottom = () => {
    messagesListRef.current?.scrollTo({ top: messagesListRef.current.scrollHeight, behavior: 'smooth' });
    autoScrollRef.current = true;
  };

  useEffect(() => {
    if (autoScrollRef.current) {
      setTimeout(() => messagesListRef.current?.scrollTo({ top: messagesListRef.current?.scrollHeight, behavior: 'smooth' }), 0);
    }
  }, [messages]);

  // ── Inline parser ────────────────────────────────────────────────────────────
  const parseInline = (text) => {
    const parts = [];
    let lastIndex = 0;
    const tokenRegex = /\\\((.+?)\\\)|\$(?!\$)([^$\n]+?)\$(?!\$)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*/g;
    const allMatches = [];
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      let type, content;
      if      (match[1] !== undefined) { type = 'math';   content = match[1]; }
      else if (match[2] !== undefined) { type = 'math';   content = match[2]; }
      else if (match[3] !== undefined) { type = 'code';   content = match[3]; }
      else if (match[4] !== undefined) { type = 'bold';   content = match[4]; }
      else if (match[5] !== undefined) { type = 'strike'; content = match[5]; }
      else                             { type = 'italic'; content = match[6]; }
      allMatches.push({ start: match.index, end: tokenRegex.lastIndex, content, type });
    }

    allMatches.forEach((m, i) => {
      if (m.start > lastIndex) parts.push(text.substring(lastIndex, m.start));
      if (m.type === 'math') {
        try {
          const html = katex.renderToString(m.content, { throwOnError: false });
          parts.push(<span key={`math-${i}`} className="markdown-inline-math" dangerouslySetInnerHTML={{ __html: html }} />);
        } catch { parts.push(`$${m.content}$`); }
      } else if (m.type === 'code')   parts.push(<code    key={`c-${i}`} className="markdown-inline-code">{m.content}</code>);
      else if (m.type === 'bold')     parts.push(<strong  key={`b-${i}`}>{m.content}</strong>);
      else if (m.type === 'strike')   parts.push(<del     key={`s-${i}`}>{m.content}</del>);
      else if (m.type === 'italic')   parts.push(<em      key={`e-${i}`}>{m.content}</em>);
      lastIndex = m.end;
    });

    if (lastIndex < text.length) parts.push(text.substring(lastIndex));
    return parts.length > 0 ? parts : text;
  };

  // ── Block parser ─────────────────────────────────────────────────────────────
  const parseMarkdown = (text) => {
    const elements = [];
    const lines = text.split('\n');
    let ei = 0;
    let inCode = false, inMath = false, inLatex = false;
    let codeLang = '', codeLines = [], mathLines = [];
    let listType = null, listItems = [];

    const flushList = () => {
      if (!listItems.length) return;
      const Tag = listType === 'ordered' ? 'ol' : 'ul';
      elements.push(
        <Tag key={`list-${ei++}`} className="markdown-list">
          {listItems.map((item, idx) => (
            <li key={idx} className={`markdown-li ${item.checked !== null ? 'markdown-li-task' : ''}`}>
              {item.checked !== null && <span className={`task-checkbox ${item.checked ? 'checked' : ''}`} />}
              <span>{parseInline(item.content)}</span>
            </li>
          ))}
        </Tag>
      );
      listItems = []; listType = null;
    };

    const mathBlock = (content, key) => {
      try {
        const html = katex.renderToString(content, { displayMode: true, throwOnError: false });
        return <div key={key} className="markdown-math-block"><div dangerouslySetInnerHTML={{ __html: html }} /></div>;
      } catch { return <p key={key} className="markdown-p">{content}</p>; }
    };

    const splitPipe = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const normRow   = (row) => row.replace(/^\s*#{1,6}\s+/, '').trim();
    const isSep     = (row) => { const n = row.trim().replace(/^\|/, '').replace(/\|$/, ''); return n && n.split('|').every(c => /^:?-{3,}:?$/.test(c.trim())); };
    const isPipe    = (row) => row.includes('|') && splitPipe(row).length >= 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();

      // Code blocks — renders as <CodeBlock> with copy button
      if (t.startsWith('```')) {
        if (!inCode) {
          flushList(); inCode = true; codeLang = t.slice(3).trim(); codeLines = [];
        } else {
          elements.push(<CodeBlock key={`code-${ei++}`} lang={codeLang} code={codeLines.join('\n')} />);
          inCode = false; codeLang = ''; codeLines = [];
        }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      // $$ math
      if (t.startsWith('$$')) {
        if (!inMath) {
          flushList(); inMath = true; mathLines = [];
          const rest = t.slice(2).trim();
          if (rest && t.endsWith('$$') && rest !== '$$') { elements.push(mathBlock(rest.endsWith('$$') ? rest.slice(0,-2).trim() : rest, `mb-${ei++}`)); inMath = false; }
          else if (rest) mathLines.push(rest);
        } else {
          const rest = t.slice(0,-2).trim();
          if (rest) mathLines.push(rest);
          elements.push(mathBlock(mathLines.join('\n'), `mb-${ei++}`));
          inMath = false; mathLines = [];
        }
        continue;
      }
      if (inMath) { mathLines.push(line); continue; }

      // \[ \] math
      if (t === '\\[' || t.startsWith('\\[')) {
        if (!inLatex) {
          flushList(); inLatex = true; mathLines = [];
          const rest = t.slice(2).trim();
          if (rest.endsWith('\\]')) { elements.push(mathBlock(rest.slice(0,-2).trim(), `lb-${ei++}`)); inLatex = false; }
          else if (rest) mathLines.push(rest);
        }
        continue;
      }
      if (inLatex) {
        if (t === '\\]' || t.endsWith('\\]')) {
          const rest = t.endsWith('\\]') ? t.slice(0,-2).trim() : '';
          if (rest) mathLines.push(rest);
          elements.push(mathBlock(mathLines.join('\n'), `lb-${ei++}`));
          inLatex = false; mathLines = [];
        } else mathLines.push(line);
        continue;
      }

      // Headings
      const hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) { flushList(); elements.push(React.createElement(`h${hm[1].length}`, { key: ei++, className: `markdown-h${hm[1].length}` }, parseInline(hm[2]))); continue; }

      // Tables
      const cl = normRow(line), nl = normRow(lines[i+1] || '');
      if (isPipe(cl) && (isSep(nl) || isPipe(nl))) {
        flushList();
        const hcells = splitPipe(cl), hasSep = isSep(nl);
        const aligns = (hasSep ? splitPipe(nl) : hcells).map(c => { if (!hasSep) return 'left'; const tc = c.trim(); return tc.startsWith(':') && tc.endsWith(':') ? 'center' : tc.endsWith(':') ? 'right' : 'left'; });
        const rows = []; let j = i + (hasSep ? 2 : 1);
        while (j < lines.length) { const bc = normRow(lines[j]); if (!bc || !bc.includes('|')) break; rows.push(splitPipe(bc)); j++; }
        elements.push(
          <div key={`tw-${ei++}`} className="markdown-table-wrap">
            <table className="markdown-table">
              <thead><tr>{hcells.map((c,idx) => <th key={idx} style={{textAlign: aligns[idx]||'left'}}>{parseInline(c)}</th>)}</tr></thead>
              {rows.length > 0 && <tbody>{rows.map((row,ri) => <tr key={ri}>{hcells.map((_,ci) => <td key={ci} style={{textAlign: aligns[ci]||'left'}}>{parseInline(row[ci]||'')}</td>)}</tr>)}</tbody>}
            </table>
          </div>
        );
        i = j - 1; continue;
      }

      // HR
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushList(); elements.push(<hr key={`hr-${ei++}`} className="markdown-hr" />); continue; }

      // Blockquote
      const qm = line.match(/^>\s?(.*)$/);
      if (qm) { flushList(); elements.push(<blockquote key={`q-${ei++}`} className="markdown-quote">{parseInline(qm[1])}</blockquote>); continue; }

      // Lists
      const ul = line.match(/^\s*[-*+]\s+(.*)$/), ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ul || ol) {
        const ct = ol ? 'ordered' : 'unordered', content = (ul?.[1] || ol?.[1] || '').trim();
        const tm = content.match(/^\[( |x|X)\]\s+(.*)$/);
        if (listType && listType !== ct) flushList();
        listType = ct;
        listItems.push({ checked: tm ? tm[1].toLowerCase() === 'x' : null, content: tm ? tm[2] : content });
        continue;
      }

      // Empty line
      if (!t) { flushList(); elements.push(<div key={`sp-${ei++}`} className="markdown-spacing" />); continue; }

      // Paragraph
      flushList();
      const pLines = [line]; let j = i + 1;
      while (j < lines.length) {
        const nt = lines[j].trim();
        if (!nt || nt.startsWith('#') || nt.startsWith('>') || nt.match(/^\s*[-*+]\s+/) || nt.match(/^\s*\d+\.\s+/) || nt.startsWith('```') || nt.startsWith('$$') || nt.startsWith('\\[')) break;
        pLines.push(lines[j]); j++;
      }
      elements.push(<p key={`p-${ei++}`} className="markdown-p">{parseInline(pLines.map(pl => pl.trim()).join(' '))}</p>);
      i = j - 1;
    }

    if (inCode && codeLines.length) elements.push(<CodeBlock key={`co-${ei++}`} lang={codeLang} code={codeLines.join('\n')} />);
    if ((inMath || inLatex) && mathLines.length) elements.push(mathBlock(mathLines.join('\n'), `mu-${ei++}`));
    flushList();
    return elements;
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
      setPhase('idle');
    }
  };

  const requestAssistantResponse = async (updatedMessages) => {
    const userMessage = updatedMessages[updatedMessages.length - 1]?.content;
    if (!userMessage) return;

    setMessages([...updatedMessages, { role: 'assistant', content: '' }]);
    setPhase('gathering');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err?.error || 'Server error');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let firstToken = true;

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
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              if (firstToken) { setPhase('streaming'); firstToken = false; }
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + token,
                };
                return updated;
              });
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `⚠️ Error: ${err.message}` };
          return updated;
        });
      }
    } finally {
      setPhase('idle');
      abortRef.current = null;
    }
  };

  const persistSession = (sessionId, nextMessages, titleHint) => {
    const sessions = readJson(TEXT_SESSIONS_KEY, []);
    const id = String(sessionId || '');
    if (!id) return;
    const existing = Array.isArray(sessions) ? sessions : [];
    const idx = existing.findIndex(s => String(s.id) === id);
    const payload = { id, title: titleHint || existing[idx]?.title || 'New chat', updatedAt: Date.now(), messages: nextMessages };
    const next = idx >= 0
      ? [...existing.slice(0, idx), { ...existing[idx], ...payload }, ...existing.slice(idx + 1)]
      : [payload, ...existing];
    writeJson(TEXT_SESSIONS_KEY, next);
    window.dispatchEvent(new Event('oneai:textSessionsUpdated'));
  };

  useEffect(() => {
    const onNewChat = () => {
      setActiveSessionId('');
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, '');
      setMessages([]); setQuery(''); setHasStarted(false); setMessageFeedback({});
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    const onOpen = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      const sessions = readJson(TEXT_SESSIONS_KEY, []);
      const found = (Array.isArray(sessions) ? sessions : []).find(s => String(s.id) === String(id));
      if (!found) return;
      setActiveSessionId(String(id));
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, String(id));
      setMessages(found.messages || []);
      setHasStarted((found.messages || []).length > 0);
      setMessageFeedback({});
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('oneai:newChat', onNewChat);
    window.addEventListener('oneai:openTextSession', onOpen);
    return () => { window.removeEventListener('oneai:newChat', onNewChat); window.removeEventListener('oneai:openTextSession', onOpen); };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); inputRef.current?.focus(); }
      if (mod && (e.key === 'c' || e.key === 'C') && !inputRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        const last = [...messages].reverse().find(m => m.role === 'assistant');
        if (last?.content) handleCopy(messages.lastIndexOf(last), last.content);
      }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); window.dispatchEvent(new Event('oneai:newChat')); }
      if (e.key === 'Escape' && isStreaming) { e.preventDefault(); handleStop(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [messages, isStreaming]);

  const sendMessage = async (rawText) => {
    const userMessage = (rawText || '').trim();
    if (!userMessage || isStreaming) return;

    setHasStarted(true);
    setQuery('');

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto?.randomUUID?.() || String(Date.now());
      setActiveSessionId(sessionId);
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, sessionId);
    }

    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    const isFirst = updatedMessages.filter(m => m.role === 'user').length === 1;
    persistSession(sessionId, updatedMessages, isFirst ? slugTitleFromText(userMessage) : undefined);

    await requestAssistantResponse(updatedMessages);
  };

  const handleSendClick = () => sendMessage(query);

  const handleFeedback = (idx, type) =>
    setMessageFeedback(prev => ({ ...prev, [idx]: prev[idx] === type ? null : type }));

  const handleCopy = async (idx, text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(idx);
      window.setTimeout(() => setCopiedMessageId(prev => prev === idx ? null : prev), 1400);
    } catch {}
  };

  const handleRegenerate = async (assistantIndex) => {
    if (isStreaming) return;
    let ui = assistantIndex - 1;
    while (ui >= 0 && messages[ui]?.role !== 'user') ui--;
    if (ui < 0) return;
    const ctx = messages.slice(0, ui + 1);
    setMessages(ctx);
    setHasStarted(true);
    await requestAssistantResponse(ctx);
  };

  const handleInputKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape' && isStreaming) { e.preventDefault(); handleStop(); return; }
    if (e.key !== 'Enter' && e.key !== 'NumpadEnter') return;
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    sendMessage(e.currentTarget.value);
  };

  return (
    <div className="home-screen">
      {showWip && <WipToast onClose={() => setShowWip(false)} />}

      <div className={`home-header ${hasStarted ? 'home-header--hidden' : ''}`}>
        <p className="tagline_home">How can I help you today?</p>
        <button className="wip-btn" onClick={() => setShowWip(true)}>
          <Construction size={13} /> Work in Progress
        </button>
      </div>

      <div className="main-content">
        {!hasStarted ? (
          <div className="suggestions-grid">
            {suggestions.map((item, index) => (
              <div key={index} className="suggestion-card" onClick={() => setQuery(item.text)}>
                <div className="suggestion-icon">{item.icon}</div>
                <p className="suggestion-text">{item.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="messages-list" ref={messagesListRef} onScroll={handleScroll}>
            {messages.map((msg, i) => (
              <div key={i} className={`message message--${msg.role}`}>
                <span className="message-role">{msg.role === 'user' ? 'You' : 'uXnAI'}</span>
                <div className="message-content">
                  {msg.role === 'assistant' && i === messages.length - 1 && phase === 'gathering' && !msg.content
                    ? <InsightLoader />
                    : parseMarkdown(msg.content)
                  }
                  {phase === 'streaming' && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="cursor-blink" />
                  )}
                </div>
                {msg.role === 'assistant' && msg.content && phase === 'idle' && (
                  <div className="message-actions">
                    <button type="button" className={`message-action-btn ${messageFeedback[i] === 'like' ? 'active' : ''}`} onClick={() => handleFeedback(i, 'like')} title="Like"><ThumbsUp size={14} /></button>
                    <button type="button" className={`message-action-btn ${messageFeedback[i] === 'dislike' ? 'active' : ''}`} onClick={() => handleFeedback(i, 'dislike')} title="Dislike"><ThumbsDown size={14} /></button>
                    <button type="button" className="message-action-btn" onClick={() => handleCopy(i, msg.content)} title="Copy">
                      <Copy size={14} /><span className="action-label">{copiedMessageId === i ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button type="button" className="message-action-btn" onClick={() => handleRegenerate(i)} title="Regenerate">
                      <RefreshCw size={14} /><span className="action-label">Regenerate</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {showScrollButton && (
              <button type="button" className="scroll-to-bottom-btn" onClick={scrollToBottom} title="Scroll to latest">
                <ChevronDown size={20} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="input-wrapper">
        <div>
          <div className="model-dropdown-wrapper">
            <button className="model-tag" onClick={() => setShowModelDropdown(!showModelDropdown)} type="button">
              <span className="model-dot" />{MODEL_DISPLAY}<span className="dropdown-arrow">▼</span>
            </button>
            {showModelDropdown && (
              <div className="model-dropdown-menu">
                <div className="model-option selected"><span className="model-dot" />{MODEL_DISPLAY}</div>
              </div>
            )}
          </div>

          <div className="input-container" role="group" aria-label="Chat input">
            <button type="button" className="plus-btn" title="Attach"><Plus size={18} /></button>
            <textarea
              ref={inputRef}
              className="input-bar"
              placeholder="Message uXnAI..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={isStreaming}
              rows={1}
            />
            {isStreaming ? (
              <button type="button" className="send-btn stop-btn" onClick={handleStop}><Square size={16} fill="currentColor" /></button>
            ) : (
              <button type="button" className="send-btn" onClick={handleSendClick} disabled={!query.trim()}><SendHorizontal size={20} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Homescreen;