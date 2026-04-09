import React, { useEffect, useState, useRef } from 'react';
import { SendHorizontal, Lightbulb, Code, PenTool, Compass, Construction, X, RefreshCw, Square, Plus, ThumbsUp, ThumbsDown, Copy, ChevronDown } from 'lucide-react';
import './Homescreen.css';

const MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';
const MODEL_DISPLAY = 'Nemotron 3 Nano';
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const TEXT_SESSIONS_KEY = 'oneai:textSessions';
const ACTIVE_TEXT_SESSION_KEY = 'oneai:activeTextSessionId';

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

const slugTitleFromText = (text) => {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  const firstLine = t.split('\n')[0].trim();
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
};

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
  const [messageFeedback, setMessageFeedback] = useState({});
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem(ACTIVE_TEXT_SESSION_KEY) || '');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const messagesListRef = useRef(null);
  const autoScrollRef = useRef(true);

  const handleScroll = (e) => {
    const element = e.target;
    const isAtBottom =
      Math.abs(
        element.scrollHeight - element.clientHeight - element.scrollTop
      ) < 50;
    setShowScrollButton(!isAtBottom);
    autoScrollRef.current = isAtBottom;
  };

  const scrollToBottom = () => {
    if (messagesListRef.current) {
      messagesListRef.current.scrollTo({
        top: messagesListRef.current.scrollHeight,
        behavior: 'smooth',
      });
      autoScrollRef.current = true;
    }
  };

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (autoScrollRef.current && messagesListRef.current) {
      setTimeout(() => {
        messagesListRef.current?.scrollTo({
          top: messagesListRef.current?.scrollHeight,
          behavior: 'smooth',
        });
      }, 0);
    }
  }, [messages]);

  const parseInline = (text) => {
    const parts = [];
    let lastIndex = 0;
    const tokenRegex = /`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*/g;
    const allMatches = [];
    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
      allMatches.push({
        start: match.index,
        end: tokenRegex.lastIndex,
        content: match[1] || match[2] || match[3] || match[4],
        type: match[1] ? 'code' : match[2] ? 'bold' : match[3] ? 'strike' : 'italic',
      });
    }

    allMatches.forEach((match, i) => {
      if (match.start > lastIndex) {
        parts.push(text.substring(lastIndex, match.start));
      }

      if (match.type === 'code') {
        parts.push(
          <code key={`code-${i}`} className="markdown-inline-code">
            {match.content}
          </code>
        );
      } else if (match.type === 'bold') {
        parts.push(
          <strong key={`bold-${i}`}>{match.content}</strong>
        );
      } else if (match.type === 'strike') {
        parts.push(
          <del key={`strike-${i}`}>{match.content}</del>
        );
      } else if (match.type === 'italic') {
        parts.push(
          <em key={`italic-${i}`}>{match.content}</em>
        );
      }

      lastIndex = match.end;
    });

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const parseMarkdown = (text) => {
    const elements = [];
    const lines = text.split('\n');
    let elementIndex = 0;
    let inCodeBlock = false;
    let codeLang = '';
    let codeLines = [];
    let listType = null;
    let listItems = [];

    const flushList = () => {
      if (listItems.length === 0) return;
      const ListTag = listType === 'ordered' ? 'ol' : 'ul';
      elements.push(
        <ListTag key={`list-${elementIndex++}`} className="markdown-list">
          {listItems.map((item, idx) => (
            <li key={`li-${idx}`} className={`markdown-li ${item.checked !== null ? 'markdown-li-task' : ''}`}>
              {item.checked !== null && (
                <span className={`task-checkbox ${item.checked ? 'checked' : ''}`} />
              )}
              <span>{parseInline(item.content)}</span>
            </li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    };

    const splitPipeRow = (row) => {
      const normalized = row.trim().replace(/^\|/, '').replace(/\|$/, '');
      return normalized.split('|').map((cell) => cell.trim());
    };

    const normalizeTableCandidateRow = (row) => row.replace(/^\s*#{1,6}\s+/, '').trim();

    const isSeparatorRow = (row) => {
      const normalized = row.trim().replace(/^\|/, '').replace(/\|$/, '');
      if (!normalized) return false;
      return normalized.split('|').every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          flushList();
          inCodeBlock = true;
          codeLang = trimmed.slice(3).trim();
          codeLines = [];
        } else {
          elements.push(
            <pre key={`code-${elementIndex++}`} className="markdown-code-block">
              {codeLang ? <div className="markdown-code-lang">{codeLang}</div> : null}
              <code>{codeLines.join('\n')}</code>
            </pre>
          );
          inCodeBlock = false;
          codeLang = '';
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      const nextLine = lines[i + 1] || '';
      const candidateLine = normalizeTableCandidateRow(line);
      const candidateNextLine = normalizeTableCandidateRow(nextLine);
      const looksLikePipeRow = candidateLine.includes('|') && splitPipeRow(candidateLine).length >= 2;
      const nextIsPipeRow = candidateNextLine.includes('|') && splitPipeRow(candidateNextLine).length >= 2;

      if (looksLikePipeRow && (isSeparatorRow(candidateNextLine) || nextIsPipeRow)) {
        flushList();
        const headerCells = splitPipeRow(candidateLine);
        const hasSeparator = isSeparatorRow(candidateNextLine);
        const alignments = (hasSeparator ? splitPipeRow(candidateNextLine) : headerCells).map((cell) => {
          if (!hasSeparator) return 'left';
          const trimmedCell = cell.trim();
          if (trimmedCell.startsWith(':') && trimmedCell.endsWith(':')) return 'center';
          if (trimmedCell.endsWith(':')) return 'right';
          return 'left';
        });

        const bodyRows = [];
        let j = i + (hasSeparator ? 2 : 1);
        while (j < lines.length) {
          const bodyCandidate = normalizeTableCandidateRow(lines[j]);
          if (!bodyCandidate || !bodyCandidate.includes('|')) break;
          bodyRows.push(splitPipeRow(bodyCandidate));
          j += 1;
        }

        elements.push(
          <div key={`table-wrap-${elementIndex++}`} className="markdown-table-wrap">
            <table className="markdown-table">
              <thead>
                <tr>
                  {headerCells.map((cell, idx) => (
                    <th key={`th-${idx}`} style={{ textAlign: alignments[idx] || 'left' }}>
                      {parseInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              {bodyRows.length > 0 && (
                <tbody>
                  {bodyRows.map((row, rowIdx) => (
                    <tr key={`tr-${rowIdx}`}>
                      {headerCells.map((_, colIdx) => (
                        <td key={`td-${rowIdx}-${colIdx}`} style={{ textAlign: alignments[colIdx] || 'left' }}>
                          {parseInline(row[colIdx] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        );

        i = j - 1;
        continue;
      }

      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        flushList();
        const level = headerMatch[1].length;
        const content = headerMatch[2];
        const headingTag = `h${level}`;
        elements.push(React.createElement(headingTag, { key: elementIndex++, className: `markdown-h${level}` }, parseInline(content)));
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushList();
        elements.push(<hr key={`hr-${elementIndex++}`} className="markdown-hr" />);
        continue;
      }

      const quoteMatch = line.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        flushList();
        elements.push(
          <blockquote key={`quote-${elementIndex++}`} className="markdown-quote">
            {parseInline(quoteMatch[1])}
          </blockquote>
        );
        continue;
      }

      const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
      const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (unordered || ordered) {
        const currentType = ordered ? 'ordered' : 'unordered';
        const content = (unordered?.[1] || ordered?.[1] || '').trim();
        const taskMatch = content.match(/^\[( |x|X)\]\s+(.*)$/);

        if (listType && listType !== currentType) {
          flushList();
        }

        listType = currentType;
        listItems.push({
          checked: taskMatch ? taskMatch[1].toLowerCase() === 'x' : null,
          content: taskMatch ? taskMatch[2] : content,
        });
        continue;
      }

      if (!trimmed) {
        flushList();
        elements.push(<div key={`space-${elementIndex++}`} className="markdown-spacing" />);
        continue;
      }

      flushList();
      elements.push(
        <p key={`p-${elementIndex++}`} className="markdown-p">
          {parseInline(line)}
        </p>
      );
    }

    if (inCodeBlock && codeLines.length > 0) {
      elements.push(
        <pre key={`code-open-${elementIndex++}`} className="markdown-code-block">
          {codeLang ? <div className="markdown-code-lang">{codeLang}</div> : null}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
    }

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
      setStreaming(false);
    }
  };

  const requestAssistantResponse = async (updatedMessages) => {
    setStreaming(true);
    setMessages([...updatedMessages, { role: 'assistant', content: '' }]);

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

  const persistSession = (sessionId, nextMessages, titleHint) => {
    const sessions = readJson(TEXT_SESSIONS_KEY, []);
    const id = sessionId || '';
    if (!id) return;
    const existing = Array.isArray(sessions) ? sessions : [];
    const idx = existing.findIndex((s) => String(s.id) === String(id));
    const updatedAt = Date.now();
    const nextTitle = titleHint || (idx >= 0 ? existing[idx]?.title : '') || 'New chat';
    const payload = { id, title: nextTitle, updatedAt, messages: nextMessages };
    const nextSessions = idx >= 0
      ? [...existing.slice(0, idx), { ...existing[idx], ...payload }, ...existing.slice(idx + 1)]
      : [payload, ...existing];
    writeJson(TEXT_SESSIONS_KEY, nextSessions);
    window.dispatchEvent(new Event('oneai:textSessionsUpdated'));
  };

  useEffect(() => {
    const onNewChat = () => {
      setActiveSessionId('');
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, '');
      setMessages([]);
      setQuery('');
      setHasStarted(false);
      setMessageFeedback({});
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    const onOpen = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      const sessions = readJson(TEXT_SESSIONS_KEY, []);
      const found = (Array.isArray(sessions) ? sessions : []).find((s) => String(s.id) === String(id));
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
    return () => {
      window.removeEventListener('oneai:newChat', onNewChat);
      window.removeEventListener('oneai:openTextSession', onOpen);
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();

    const onGlobalKeyDown = (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
      const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      
      // Ctrl/Cmd+K: Focus input
      if (metaOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      
      // Ctrl/Cmd+C: Copy last assistant message
      if (metaOrCtrl && (e.key === 'c' || e.key === 'C') && !inputRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant?.content) {
          handleCopy(messages.indexOf(lastAssistant), lastAssistant.content);
        }
        return;
      }
      
      // Alt+N: New chat
      if ((isMac ? e.altKey : e.altKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        window.dispatchEvent(new Event('oneai:newChat'));
        return;
      }
      
      // Escape: Stop streaming
      if (e.key === 'Escape' && streaming) {
        e.preventDefault();
        handleStop();
        return;
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [messages, streaming]);

  const sendMessage = async (rawText) => {
    const userMessage = (rawText || '').trim();
    if (!userMessage || streaming) return;

    setHasStarted(true);
    setQuery('');

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = crypto?.randomUUID?.() || String(Date.now());
      setActiveSessionId(sessionId);
      localStorage.setItem(ACTIVE_TEXT_SESSION_KEY, sessionId);
    }

    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    if (updatedMessages.filter((m) => m.role === 'user').length === 1) {
      const title = slugTitleFromText(userMessage);
      persistSession(sessionId, updatedMessages, title);
    } else {
      persistSession(sessionId, updatedMessages);
    }

    await requestAssistantResponse(updatedMessages);
  };

  const handleSendClick = async () => {
    await sendMessage(query);
  };

  const handleFeedback = (messageIndex, type) => {
    setMessageFeedback((prev) => {
      const current = prev[messageIndex];
      return {
        ...prev,
        [messageIndex]: current === type ? null : type,
      };
    });
  };

  const handleCopy = async (messageIndex, text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageIndex);
      window.setTimeout(() => {
        setCopiedMessageId((prev) => (prev === messageIndex ? null : prev));
      }, 1400);
    } catch {
      // Clipboard may fail in unsupported contexts.
    }
  };

  const handleRegenerate = async (assistantIndex) => {
    if (streaming) return;

    let userIndex = assistantIndex - 1;
    while (userIndex >= 0 && messages[userIndex]?.role !== 'user') {
      userIndex -= 1;
    }
    if (userIndex < 0) return;

    const contextMessages = messages.slice(0, userIndex + 1);
    setMessages(contextMessages);
    setHasStarted(true);
    await requestAssistantResponse(contextMessages);
  };

  const handleInputKeyDown = (e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape' && streaming) {
      e.preventDefault();
      handleStop();
      return;
    }

    if (e.key !== 'Enter') return;

    const shouldSend = !e.shiftKey || e.ctrlKey || e.metaKey;
    if (!shouldSend) return;

    e.preventDefault();
    sendMessage(query);
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
          <div className="messages-list" ref={messagesListRef} onScroll={handleScroll}>
            {messages.map((msg, i) => (
              <div key={i} className={`message message--${msg.role}`}>
                <span className="message-role">
                  {msg.role === 'user' ? 'You' : 'uXnAI'}
                </span>
                <div className="message-content">
                  {parseMarkdown(msg.content)}
                  {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="cursor-blink" />
                  )}
                </div>
                {msg.role === 'assistant' && msg.content && (
                  <div className="message-actions">
                    <button
                      type="button"
                      className={`message-action-btn ${messageFeedback[i] === 'like' ? 'active' : ''}`}
                      onClick={() => handleFeedback(i, 'like')}
                      title="Like response"
                      aria-label="Like response"
                    >
                      <ThumbsUp size={14} />
                    </button>
                    <button
                      type="button"
                      className={`message-action-btn ${messageFeedback[i] === 'dislike' ? 'active' : ''}`}
                      onClick={() => handleFeedback(i, 'dislike')}
                      title="Dislike response"
                      aria-label="Dislike response"
                    >
                      <ThumbsDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="message-action-btn"
                      onClick={() => handleCopy(i, msg.content)}
                      title="Copy response"
                      aria-label="Copy response"
                    >
                      <Copy size={14} />
                      <span className="action-label">{copiedMessageId === i ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      className="message-action-btn"
                      onClick={() => handleRegenerate(i)}
                      disabled={streaming}
                      title="Regenerate response"
                      aria-label="Regenerate response"
                    >
                      <RefreshCw size={14} />
                      <span className="action-label">Regenerate</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {showScrollButton && (
              <button
                type="button"
                className="scroll-to-bottom-btn"
                onClick={scrollToBottom}
                title="Scroll to latest"
                aria-label="Scroll to latest"
              >
                <ChevronDown size={20} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="input-wrapper" onMouseDown={() => inputRef.current?.focus()}>
        <div>
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

          <div className="input-container" role="group" aria-label="Chat input">
            <button type="button" className="plus-btn" title="Attach">
              <Plus size={18} />
            </button>

            <textarea
              ref={inputRef}
              className="input-bar"
              placeholder="Message uXnAI..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={streaming}
              rows={1}
            />

            {streaming ? (
              <button type="button" className="send-btn stop-btn" onClick={handleStop}>
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button type="button" className="send-btn" onClick={handleSendClick} disabled={!query.trim()}>
                <SendHorizontal size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Homescreen;