import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Plus, MessageSquare, Type, Image, Video, Mic, FolderKanban, MoreVertical, Trash2, FolderPlus, ChevronDown } from "lucide-react";
import "./SideMenu.css";

const TEXT_SESSIONS_KEY = "oneai:textSessions";
const MODE_KEY = "oneai:mode";
const PROJECTS_KEY = "oneai:projects";
const ACTIVE_PROJECT_KEY = "oneai:activeProject";

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
  } catch { }
};

const formatRelativeTime = (ts) => {
  if (!ts) return "";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};



const MODE_OPTIONS = [
  { id: "text", label: "Text", icon: Type },
  { id: "image", label: "Image", icon: Image },
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Mic },
];



export default function SideMenu() {
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "text");
  const [textSessions, setTextSessions] = useState(() => readJson(TEXT_SESSIONS_KEY, []));
  const [activeTextSessionId, setActiveTextSessionId] = useState(() => localStorage.getItem("oneai:activeTextSessionId") || null);
  const [projects, setProjects] = useState(() => readJson(PROJECTS_KEY, [{ id: "default", name: "Default" }]));
  const [activeProjectId, setActiveProjectId] = useState(() => localStorage.getItem(ACTIVE_PROJECT_KEY) || (projects[0]?.id ?? "default"))
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [activeChatMenu, setActiveChatMenu] = useState(null);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === TEXT_SESSIONS_KEY) {
        setTextSessions(readJson(TEXT_SESSIONS_KEY, []));
      }
      if (e.key === "oneai:activeTextSessionId") {
        setActiveTextSessionId(localStorage.getItem("oneai:activeTextSessionId"));
      }

      if (e.key === PROJECTS_KEY) {
        setProjects(readJson(PROJECTS_KEY, [{ id: "default", name: "Default" }]));
      }

      if (e.key === ACTIVE_PROJECT_KEY) {
        setActiveProjectId(localStorage.getItem(ACTIVE_PROJECT_KEY));
      }

      if (e.key === MODE_KEY) {
        setMode(localStorage.getItem(MODE_KEY) || "text");
      }
    };

    const onCustom = () => {
      setTextSessions(readJson(TEXT_SESSIONS_KEY, []));
      setActiveTextSessionId(localStorage.getItem("oneai:activeTextSessionId"));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("oneai:textSessionsUpdated", onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("oneai:textSessionsUpdated", onCustom);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (!activeProjectId && projects[0]?.id) {
      setActiveProjectId(projects[0].id);
    }
    localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId || "");
  }, [activeProjectId, projects]);

  const sortedTextSessions = useMemo(() => {
    const list = Array.isArray(textSessions) ? textSessions : [];
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [textSessions]);

  const placeholderHistory = useMemo(() => {
    return [
      { id: "p1", title: "History for this mode", meta: "Coming soon" },
      { id: "p2", title: "Backend not wired yet", meta: "Placeholder" },
      { id: "p3", title: "Session list will appear here", meta: "Placeholder" },
    ];

  }, []);

  const setAndPersistActiveTextSessionId = (id) => {
    const next = id || "";
    localStorage.setItem("oneai:activeTextSessionId", next);
    setActiveTextSessionId(next || null);
  };

  const handleNewChat = () => {
    setAndPersistActiveTextSessionId("");
    window.dispatchEvent(new CustomEvent("oneai:newChat"));
    navigate("/chat");
  };

  const handleOpenTextSession = (id) => {
    setAndPersistActiveTextSessionId(id);
    window.dispatchEvent(new CustomEvent("oneai:openTextSession", { detail: { id } }));
    navigate("/chat");
  };

  const handleAddProject = () => {
    const id = crypto?.randomUUID?.() || String(Date.now());
    const next = [...projects, { id, name: `Project ${projects.length + 1}` }];
    setProjects(next);
    writeJson(PROJECTS_KEY, next);
    setActiveProjectId(id);
  };

  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    const updated = textSessions.filter(s => s.id !== sessionId);
    setTextSessions(updated);
    writeJson(TEXT_SESSIONS_KEY, updated);
    if (activeTextSessionId === sessionId) {
      setAndPersistActiveTextSessionId("");
    }
    setActiveChatMenu(null);
  };

  const handleAddToProject = (sessionId, projectId, e) => {
    e.stopPropagation();
    console.log(`Added session ${sessionId} to project ${projectId}`);
    setActiveChatMenu(null);
  };

  const toggleModeDropdown = () => setModeDropdownOpen(!modeDropdownOpen);

  const selectMode = (modeId) => {
    setMode(modeId);
    setModeDropdownOpen(false);
  };

  const toggleChatMenu = (sessionId, e) => {
    e.stopPropagation();
    setActiveChatMenu(activeChatMenu === sessionId ? null : sessionId)
  };

  const activeMode = MODE_OPTIONS.find(m => m.id === mode);
  const ActiveIcon = activeMode?.icon || Type;

  return (
    <div className="sidemenu">
      {/* Mode Dropdown */}
      <div className="sidemenu-section">
        <span className="section-label">Mode</span>
        <div className="mode-dropdown-container">
          <button
            type="button"
            className="mode-dropdown-trigger"
            onClick={toggleModeDropdown}
            aria-expanded={modeDropdownOpen}
            aria-haspopup="listbox"
          >
            <ActiveIcon size={14} />
            <span>{activeMode?.label || "Text"}</span>
            <ChevronDown size={14} className={`dropdown-chevron ${modeDropdownOpen ? "open" : ""}`} />
          </button>

          {modeDropdownOpen && (
            <div className="mode-dropdown-menu" role="listbox">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`mode-dropdown-item ${mode === option.id ? "active" : ""}`}
                    onClick={() => selectMode(option.id)}
                    role="option"
                    aria-selected={mode === option.id}
                  >
                    <Icon size={14} />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="sidemenu-divider" />
      <div className="sidemenu-section">
        <div className="section-header">
          <span className="section-label">
            <FolderKanban size={12} style={{ display: "inline", marginRight: 5, opacity: 0.5 }} />
            Projects
          </span>

          <button className="new-chat-inline" title="New Project" onClick={handleAddProject} aria-label="New Project">
            <Plus size={13} />
          </button>
        </div>

        <div className="projects-bar">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`project-chip ${activeProjectId === p.id ? "active" : ""}`}
              onClick={() => setActiveProjectId(p.id)}
              title={p.name}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sidemenu-divider" />

      {/* Chat History */}
      <div className="sidemenu-section history-section">
        <div className="section-header">
          <span className="section-label">
            <Clock size={12} style={{ display: "inline", marginRight: 5, opacity: 0.5 }} />
            {mode === "text" ? "Text History" : mode === "image" ? "Image History" : mode === "video" ? "Video History" : "Audio History"}
          </span>

          <button className="new-chat-inline" title="New Chat" onClick={handleNewChat} aria-label="New Chat">
            <Plus size={13} />
          </button>
        </div>

        <div className="chat-list">
          {mode === "text" ? (
            sortedTextSessions.length > 0 ? (
              sortedTextSessions.map((s) => (
                <div
                  key={s.id}
                  className={`chat-item-wrapper ${String(activeTextSessionId) === String(s.id) ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="chat-item"
                    onClick={() => handleOpenTextSession(s.id)}
                    title={s.title}
                  >
                    <MessageSquare size={13} className="chat-item-icon" />
                    <div className="chat-item-body">
                      <span className="chat-item-title">{s.title || "New chat"}</span>
                      <span className="chat-item-time">{formatRelativeTime(s.updatedAt)}</span>
                    </div>
                  </button>

                  {/* 3-dot menu */}
                  <div className="chat-actions">
                    <button
                      type="button"
                      className="chat-menu-btn"
                      onClick={(e) => toggleChatMenu(s.id, e)}
                      aria-label="Chat actions"
                    >
                      <MoreVertical size={14} />
                    </button>

                    {activeChatMenu === s.id && (
                      <div className="chat-action-menu">
                        <div className="chat-action-header">Actions</div>
                        <button
                          className="chat-action-item"
                          onClick={(e) => handleAddToProject(s.id, activeProjectId, e)}
                        >
                          <FolderPlus size={14} />
                          <span>Add to Project</span>
                        </button>
                        <div className="chat-action-divider" />
                        <button
                          className="chat-action-item danger"
                          onClick={(e) => handleDeleteSession(s.id, e)}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="history-empty">
                <div className="history-empty-title">No chats yet</div>
                <div className="history-empty-sub">Start a conversation to see it here.</div>
              </div>
            )
          ) : (
            placeholderHistory.map((item) => (
              <button key={item.id} type="button" className="chat-item disabled" disabled>
                <MessageSquare size={13} className="chat-item-icon" />
                <div className="chat-item-body">
                  <span className="chat-item-title">{item.title}</span>
                  <span className="chat-item-time">{item.meta}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}