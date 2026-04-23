import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SendHorizontal, Lightbulb, Code, PenTool, Compass,
  Construction, X, RefreshCw, Square, Plus, ThumbsUp,
  ThumbsDown, Copy, ChevronDown, Cpu, Check, Brain, Zap
} from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './Homescreen.css';

const BACKEND_URL = 'https://uxnai.onrender.com';
const TEXT_SESSIONS_KEY = 'oneai:textSessions';
const ACTIVE_TEXT_SESSION_KEY = 'oneai:activeTextSessionId';
const MODEL_DISPLAY = 'Perception · MoA Pipeline';

const ROLE_COLORS = {
  Analyst: { accent: '#60a5fa', bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.15)' },
  Contrarian: { accent: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)' },
  Contextualiser: { accent: '#34d399', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.15)' },
  Pragmatist: { accent: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.15)' },
  default: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)' },
};
const roleStyle = (role) => ROLE_COLORS[role] || ROLE_COLORS.default;

const readJson = (key, fb) => { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; } };
const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { } };

const slugTitle = (text) => {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  const l = t.split('\n')[0].trim();
  return l.length > 60 ? `${l.slice(0, 60)}…` : l;
};

// =============================================================================
// Sub-components
// =============================================================================

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { }
  };
  return (
    <pre className="markdown-code-block">
      <div className="code-block-header">
        <span className="markdown-code-lang">{lang || 'code'}</span>
        <button type="button" className={`code-copy-btn ${copied ? 'code-copy-btn--copied' : ''}`} onClick={handleCopy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <code>{code}</code>
    </pre>
  );
}

// ── Deliberation panel ────────────────────────────────────────────────────────
function DeliberationPanel({ deliberation, activeRound }) {
  const [open, setOpen] = useState(true);
  const models = Object.entries(deliberation);
  if (!models.length) return null;

  return (
    <div className="deliberation-panel">
      <button className="deliberation-toggle" onClick={() => setOpen(o => !o)} type="button">
        <Brain size={12} />
        <span>Deliberation</span>
        {activeRound > 0 && <span className="deliberation-round-badge">Round {activeRound}</span>}
        <ChevronDown
          size={12}
          style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
        />
      </button>
      {open && (
        <div className="deliberation-body">
          {models.map(([modelName, { role, rounds }]) => {
            const { accent, bg } = roleStyle(role);
            // BUG FIX 1: Object.keys on a numeric-keyed object can return strings;
            // guard against empty rounds object before calling Math.max
            const roundKeys = Object.keys(rounds).map(Number);
            const latestRound = roundKeys.length ? Math.max(...roundKeys) : 1;
            const content = rounds[latestRound] || '';
            return (
              <div
                key={modelName}
                className="deliberation-model"
                style={{ '--model-accent': accent, '--model-bg': bg }}
              >
                <div className="deliberation-model-header">
                  <span className="deliberation-model-dot" />
                  <span className="deliberation-model-name">{modelName}</span>
                  <span className="deliberation-model-role">{role}</span>
                  {latestRound > 1 && (
                    <span className="deliberation-model-round">R{latestRound}</span>
                  )}
                </div>
                <div className="deliberation-model-content">
                  {content
                    ? content
                    : <span className="deliberation-thinking">thinking<span className="deliberation-dots" /></span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Collapsible reasoning block ───────────────────────────────────────────────
function ThinkingBlock({ content, parseMarkdown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="think-block">
      <button className="think-toggle" onClick={() => setOpen(o => !o)} type="button">
        <Cpu size={12} />
        <span>Reasoning</span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>
      {open && <div className="think-content">{parseMarkdown(content)}</div>}
    </div>
  );
}

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
          <p className="wip-desc">Perception is actively being built. New features and improvements drop every day — check back tomorrow for what's new.</p>
        </div>
        <div className="wip-footer"><RefreshCw size={11} /><span>Check back every day for updates</span></div>
      </div>
    </div>
  );
}

// =============================================================================
// Markdown parser
// =============================================================================
function useMarkdown() {
  const parseInline = useCallback((text) => {
    if (!text) return text;
    const parts = [];
    let lastIndex = 0;
    const tokenRegex = /\\\((.+?)\\\)|\$(?!\$)([^$\n]+?)\$(?!\$)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*/g;
    const allMatches = [];
    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
      let type, content;
      if (match[1] !== undefined) { type = 'math'; content = match[1]; }
      else if (match[2] !== undefined) { type = 'math'; content = match[2]; }
      else if (match[3] !== undefined) { type = 'code'; content = match[3]; }
      else if (match[4] !== undefined) { type = 'bold'; content = match[4]; }
      else if (match[5] !== undefined) { type = 'strike'; content = match[5]; }
      else { type = 'italic'; content = match[6]; }
      allMatches.push({ start: match.index, end: tokenRegex.lastIndex, content, type });
    }
    allMatches.forEach((m, i) => {
      if (m.start > lastIndex) parts.push(text.substring(lastIndex, m.start));
      if (m.type === 'math') {
        try {
          const html = katex.renderToString(m.content, { throwOnError: false });
          parts.push(<span key={`math-${i}`} className="markdown-inline-math" dangerouslySetInnerHTML={{ __html: html }} />);
        } catch { parts.push(`$${m.content}$`); }
      } else if (m.type === 'code') parts.push(<code key={`c-${i}`} className="markdown-inline-code">{m.content}</code>);
      else if (m.type === 'bold') parts.push(<strong key={`b-${i}`}>{m.content}</strong>);
      else if (m.type === 'strike') parts.push(<del key={`s-${i}`}>{m.content}</del>);
      else if (m.type === 'italic') parts.push(<em key={`e-${i}`}>{m.content}</em>);
      lastIndex = m.end;
    });
    if (lastIndex < text.length) parts.push(text.substring(lastIndex));
    return parts.length > 0 ? parts : text;
  }, []);

  const parseMarkdown = useCallback((text) => {
    // BUG FIX 2: parseMarkdown was not guarding against undefined/null —
    // causes a crash when msg.content is '' during deliberation phase
    if (!text) return null;

    const elements = [];
    const lines = text.split('\n');
    let ei = 0, inCode = false, inMath = false, inLatex = false;
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
    const normRow = (row) => row.replace(/^\s*#{1,6}\s+/, '').trim();
    const isSep = (row) => { const n = row.trim().replace(/^\|/, '').replace(/\|$/, ''); return n && n.split('|').every(c => /^:?-{3,}:?$/.test(c.trim())); };
    const isPipe = (row) => row.includes('|') && splitPipe(row).length >= 2;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i], t = line.trim();

      if (t.startsWith('```')) {
        if (!inCode) { flushList(); inCode = true; codeLang = t.slice(3).trim(); codeLines = []; }
        else { elements.push(<CodeBlock key={`code-${ei++}`} lang={codeLang} code={codeLines.join('\n')} />); inCode = false; codeLang = ''; codeLines = []; }
        continue;
      }
      if (inCode) { codeLines.push(line); continue; }

      if (t.startsWith('$$')) {
        if (!inMath) {
          flushList(); inMath = true; mathLines = [];
          const rest = t.slice(2).trim();
          if (rest && t.endsWith('$$') && rest !== '$$') { elements.push(mathBlock(rest.endsWith('$$') ? rest.slice(0, -2).trim() : rest, `mb-${ei++}`)); inMath = false; }
          else if (rest) mathLines.push(rest);
        } else {
          const rest = t.slice(0, -2).trim();
          if (rest) mathLines.push(rest);
          elements.push(mathBlock(mathLines.join('\n'), `mb-${ei++}`)); inMath = false; mathLines = [];
        }
        continue;
      }
      if (inMath) { mathLines.push(line); continue; }

      const hm = line.match(/^(#{1,6})\s+(.+)$/);
      if (hm) { flushList(); elements.push(React.createElement(`h${hm[1].length}`, { key: ei++, className: `markdown-h${hm[1].length}` }, parseInline(hm[2]))); continue; }

      const cl = normRow(line), nl = normRow(lines[i + 1] || '');
      if (isPipe(cl) && (isSep(nl) || isPipe(nl))) {
        flushList();
        const hcells = splitPipe(cl), hasSep = isSep(nl);
        const aligns = (hasSep ? splitPipe(nl) : hcells).map(c => { if (!hasSep) return 'left'; const tc = c.trim(); return tc.startsWith(':') && tc.endsWith(':') ? 'center' : tc.endsWith(':') ? 'right' : 'left'; });
        const rows = []; let j = i + (hasSep ? 2 : 1);
        while (j < lines.length) { const bc = normRow(lines[j]); if (!bc || !bc.includes('|')) break; rows.push(splitPipe(bc)); j++; }
        elements.push(
          <div key={`tw-${ei++}`} className="markdown-table-wrap">
            <table className="markdown-table">
              <thead><tr>{hcells.map((c, idx) => <th key={idx} style={{ textAlign: aligns[idx] || 'left' }}>{parseInline(c)}</th>)}</tr></thead>
              {rows.length > 0 && <tbody>{rows.map((row, ri) => <tr key={ri}>{hcells.map((_, ci) => <td key={ci} style={{ textAlign: aligns[ci] || 'left' }}>{parseInline(row[ci] || '')}</td>)}</tr>)}</tbody>}
            </table>
          </div>
        );
        i = j - 1; continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushList(); elements.push(<hr key={`hr-${ei++}`} className="markdown-hr" />); continue; }

      const qm = line.match(/^>\s?(.*)$/);
      if (qm) { flushList(); elements.push(<blockquote key={`q-${ei++}`} className="markdown-quote">{parseInline(qm[1])}</blockquote>); continue; }

      const ul = line.match(/^\s*[-*+]\s+(.*)$/), ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ul || ol) {
        const ct = ol ? 'ordered' : 'unordered', content = (ul?.[1] || ol?.[1] || '').trim();
        const tm = content.match(/^\[( |x|X)\]\s+(.*)$/);
        if (listType && listType !== ct) flushList();
        listType = ct;
        listItems.push({ checked: tm ? tm[1].toLowerCase() === 'x' : null, content: tm ? tm[2] : content });
        continue;
      }

      if (!t) { flushList(); elements.push(<div key={`sp-${ei++}`} className="markdown-spacing" />); continue; }

      flushList();
      const pLines = [line]; let j = i + 1;
      while (j < lines.length) {
        const nt = lines[j].trim();
        if (!nt || nt.startsWith('#') || nt.startsWith('>') || nt.match(/^\s*[-*+]\s+/) || nt.match(/^\s*\d+\.\s+/) || nt.startsWith('```') || nt.startsWith('$$')) break;
        pLines.push(lines[j]); j++;
      }
      elements.push(<p key={`p-${ei++}`} className="markdown-p">{parseInline(pLines.map(pl => pl.trim()).join(' '))}</p>);
      i = j - 1;
    }

    if (inCode && codeLines.length) elements.push(<CodeBlock key={`co-${ei++}`} lang={codeLang} code={codeLines.join('\n')} />);
    if ((inMath || inLatex) && mathLines.length) elements.push(mathBlock(mathLines.join('\n'), `mu-${ei++}`));
    flushList();
    return elements;
  }, [parseInline]);

  return { parseMarkdown, parseInline };
}

// =============================================================================
// Main component
// =============================================================================
function Homescreen() {
  const [query, setQuery] = useState('');
  const [showWip, setShowWip] = useState(false);
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'deliberating' | 'synthesising'
  const [hasStarted, setHasStarted] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState({});
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem(ACTIVE_TEXT_SESSION_KEY) || '');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [firstUnreadIdx, setFirstUnreadIdx] = useState(null);

  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const messagesListRef = useRef(null);
  const autoScrollRef = useRef(true);
  const messageRefs = useRef([]);
  const prevMsgCount = useRef(0);

  const { parseMarkdown } = useMarkdown();

  const isStreaming = phase !== 'idle';

  // ── Scroll ──────────────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesListRef.current?.scrollTo({ top: messagesListRef.current.scrollHeight, behavior: 'smooth' });
    autoScrollRef.current = true;
    setShowScrollBtn(false);
    setFirstUnreadIdx(null);
  }, []);

  const scrollToFirstUnread = useCallback(() => {
    if (firstUnreadIdx !== null && messageRefs.current[firstUnreadIdx]) {
      messageRefs.current[firstUnreadIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      scrollToBottom();
    }
  }, [firstUnreadIdx, scrollToBottom]);

  const handleScroll = useCallback((e) => {
    const el = e.target;
    const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 60;
    autoScrollRef.current = atBottom;
    setShowScrollBtn(!atBottom);
    // BUG FIX 3: clear firstUnreadIdx when user manually scrolls to bottom
    if (atBottom) setFirstUnreadIdx(null);
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      setTimeout(() => messagesListRef.current?.scrollTo({ top: messagesListRef.current?.scrollHeight, behavior: 'smooth' }), 0);
    }
    const newCount = messages.length;
    if (newCount > prevMsgCount.current && !autoScrollRef.current && firstUnreadIdx === null) {
      setFirstUnreadIdx(prevMsgCount.current);
    }
    prevMsgCount.current = newCount;
  }, [messages]);

  // ── Textarea auto-resize ─────────────────────────────────────────────────────
  const autoResizeTextarea = useCallback((el) => {
    if (!el) return;
    const maxHeight = window.innerHeight * 0.25;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, []);

  // BUG FIX 4: reset textarea height when query is cleared after send,
  // not just when query becomes empty (which missed the send case)
  const resetTextareaHeight = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, []);

  // ── Session helpers ──────────────────────────────────────────────────────────
  const persistSession = useCallback((sessionId, nextMessages, titleHint) => {
    const sessions = readJson(TEXT_SESSIONS_KEY, []);
    const id = String(sessionId || '');
    if (!id) return;
    const existing = Array.isArray(sessions) ? sessions : [];
    const idx = existing.findIndex(s => String(s.id) === id);
    // Strip deliberation — only role + final content persisted
    const persistable = nextMessages.map(m => ({ role: m.role, content: m.content }));
    const payload = { id, title: titleHint || existing[idx]?.title || 'New chat', updatedAt: Date.now(), messages: persistable };
    const next = idx >= 0
      ? [...existing.slice(0, idx), { ...existing[idx], ...payload }, ...existing.slice(idx + 1)]
      : [payload, ...existing];
    writeJson(TEXT_SESSIONS_KEY, next);
    window.dispatchEvent(new Event('oneai:textSessionsUpdated'));
  }, []);

  useEffect(() => {
    const onNewChat = () => {
      setActiveSessionId('');
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, '');
      setMessages([]); setQuery(''); setHasStarted(false);
      setMessageFeedback({}); setFirstUnreadIdx(null);
      resetTextareaHeight();
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
      setMessageFeedback({}); setFirstUnreadIdx(null);
      resetTextareaHeight();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('oneai:newChat', onNewChat);
    window.addEventListener('oneai:openTextSession', onOpen);
    return () => {
      window.removeEventListener('oneai:newChat', onNewChat);
      window.removeEventListener('oneai:openTextSession', onOpen);
    };
  }, [resetTextareaHeight]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); inputRef.current?.focus(); }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); window.dispatchEvent(new Event('oneai:newChat')); }
      if (e.key === 'Escape' && isStreaming) { e.preventDefault(); handleStop(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isStreaming]);

  const handleStop = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setPhase('idle'); }
  }, []);

  // ── Core: send message → multiplexed SSE ────────────────────────────────────
  const requestAssistantResponse = useCallback(async (updatedMessages) => {
    const userMessage = updatedMessages[updatedMessages.length - 1]?.content;
    if (!userMessage) return;

    setMessages([...updatedMessages, {
      role: 'assistant',
      content: '',
      deliberation: {},
      activeRound: 0,
    }]);
    setPhase('deliberating');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!res.ok) {
        let errMsg = `Server error ${res.status}`;
        try { const e = await res.json(); errMsg = e?.error || e?.message || errMsg; } catch { }
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // BUG FIX 5: track whether stream is still live so we don't
      // set phase to idle prematurely if done event arrives mid-loop
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }

          if (evt.type === 'deliberation') {
            const { model, role, round, delta } = evt;
            setPhase('deliberating');
            setMessages(prev => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              const delib = { ...last.deliberation };
              // BUG FIX 6: always clone the entry deeply to avoid mutating prev state
              const entry = delib[model]
                ? { role: delib[model].role, rounds: { ...delib[model].rounds } }
                : { role, rounds: {} };
              entry.rounds[round] = (entry.rounds[round] || '') + delta;
              delib[model] = entry;
              last.deliberation = delib;
              last.activeRound = Math.max(last.activeRound || 0, round);
              updated[updated.length - 1] = last;
              return updated;
            });
          }

          else if (evt.type === 'synthesis') {
            setPhase('synthesising');
            setMessages(prev => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };
              last.content = (last.content || '') + evt.delta;
              updated[updated.length - 1] = last;
              return updated;
            });
          }

          else if (evt.type === 'done') {
            streamDone = true;
            break;
          }

          else if (evt.type === 'error') {
            throw new Error(evt.message);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        const msg = err?.message || String(err);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `⚠️ Error: ${msg}`,
            deliberation: {},
            activeRound: 0,
          };
          return updated;
        });
      }
    } finally {
      setPhase('idle');
      abortRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async (rawText) => {
    const userMessage = (rawText || '').trim();
    if (!userMessage || isStreaming) return;

    setHasStarted(true);
    setQuery('');
    setFirstUnreadIdx(null);
    resetTextareaHeight();

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto?.randomUUID?.() || String(Date.now());
      setActiveSessionId(sessionId);
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, sessionId);
    }

    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    const isFirst = updatedMessages.filter(m => m.role === 'user').length === 1;
    persistSession(sessionId, updatedMessages, isFirst ? slugTitle(userMessage) : undefined);

    await requestAssistantResponse(updatedMessages);
  }, [isStreaming, activeSessionId, messages, persistSession, requestAssistantResponse, resetTextareaHeight]);

  const handleSendClick = useCallback(() => sendMessage(query), [sendMessage, query]);

  const handleFeedback = useCallback((idx, type) =>
    setMessageFeedback(prev => ({ ...prev, [idx]: prev[idx] === type ? null : type })), []);

  const handleCopy = useCallback(async (idx, text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(idx);
      window.setTimeout(() => setCopiedMessageId(prev => prev === idx ? null : prev), 1400);
    } catch { }
  }, []);

  const handleRegenerate = useCallback(async (assistantIndex) => {
    if (isStreaming) return;
    let ui = assistantIndex - 1;
    while (ui >= 0 && messages[ui]?.role !== 'user') ui--;
    if (ui < 0) return;
    const ctx = messages.slice(0, ui + 1);
    setMessages(ctx);
    setHasStarted(true);
    setFirstUnreadIdx(null);
    await requestAssistantResponse(ctx);
  }, [isStreaming, messages, requestAssistantResponse]);

  const handleInputKeyDown = useCallback((e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape' && isStreaming) { e.preventDefault(); handleStop(); return; }
    if (e.key !== 'Enter' && e.key !== 'NumpadEnter') return;
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    sendMessage(e.currentTarget.value);
  }, [isStreaming, handleStop, sendMessage]);

  // BUG FIX 7: close model dropdown when clicking outside
  useEffect(() => {
    if (!showModelDropdown) return;
    const close = (e) => {
      if (!e.target.closest('.model-dropdown-wrapper')) setShowModelDropdown(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showModelDropdown]);

  const suggestions = [
    { icon: <Compass size={18} />, text: "Plan a 3-day trip to Tokyo" },
    { icon: <Lightbulb size={18} />, text: "Explain quantum physics simply" },
    { icon: <Code size={18} />, text: "Help me debug a React useEffect" },
    { icon: <PenTool size={18} />, text: "Write a professional email for a job" },
  ];

  const phaseLabel = phase === 'deliberating' ? 'Deliberating…' : phase === 'synthesising' ? 'Synthesising…' : '';

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
              <div
                key={i}
                className={`message message--${msg.role}`}
                ref={el => { messageRefs.current[i] = el; }}
              >
                <span className="message-role">{msg.role === 'user' ? 'You' : 'Perception'}</span>
                <div className="message-content">
                  {msg.role === 'assistant' && i === messages.length - 1 && phase === 'deliberating'
                    && !msg.content && Object.keys(msg.deliberation || {}).length === 0
                    ? <InsightLoader />
                    : <>
                      {msg.role === 'assistant' && Object.keys(msg.deliberation || {}).length > 0 && (
                        <DeliberationPanel
                          deliberation={msg.deliberation}
                          activeRound={msg.activeRound || 1}
                        />
                      )}
                      {msg.reasoning && (
                        <ThinkingBlock content={msg.reasoning} parseMarkdown={parseMarkdown} />
                      )}
                      {parseMarkdown(msg.content)}
                    </>
                  }
                  {phase === 'synthesising' && i === messages.length - 1 && msg.role === 'assistant' && (
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

            {showScrollBtn && (
              <button
                type="button"
                className="scroll-to-bottom-btn"
                onClick={scrollToFirstUnread}
                title={firstUnreadIdx !== null ? 'Jump to first unread' : 'Scroll to bottom'}
              >
                {firstUnreadIdx !== null
                  ? <><Zap size={14} /><span className="scroll-btn-label">New</span></>
                  : <ChevronDown size={18} />
                }
              </button>
            )}
          </div>
        )}
      </div>

      <div className="input-wrapper">
        <div>
          <div className="model-dropdown-wrapper">
            {phase !== 'idle' && (
              <span className="phase-indicator">
                <span className="phase-dot" />
                {phaseLabel}
              </span>
            )}
            <button className="model-tag" onClick={() => setShowModelDropdown(o => !o)} type="button">
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
              placeholder="Message Perception..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                autoResizeTextarea(e.target);
              }}
              onKeyDown={handleInputKeyDown}
              disabled={isStreaming}
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