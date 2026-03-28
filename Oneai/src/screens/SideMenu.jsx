import { useState } from "react";
import { FolderKanban, Bot, Clock, ChevronRight, Plus, MessageSquare } from "lucide-react";
import "./SideMenu.css";

const chatHistory = [
  { id: 1, title: "Debug React useEffect hook", time: "2m ago", active: true },
  { id: 2, title: "Plan a 3-day trip to Tokyo", time: "1h ago", active: false },
  { id: 3, title: "Explain quantum entanglement", time: "3h ago", active: false },
  { id: 4, title: "Write a job application email", time: "Yesterday", active: false },
  { id: 5, title: "Build a REST API in Node.js", time: "Yesterday", active: false },
  { id: 6, title: "Summarize this research paper", time: "2d ago", active: false },
  { id: 7, title: "Create a landing page layout", time: "3d ago", active: false },
];

export default function SideMenu() {
  const [activeChat, setActiveChat] = useState(1);

  return (
    <div className="sidemenu">
      {/* Quick Access Cards */}
      <div className="sidemenu-section">
        <span className="section-label">Quick Access</span>
        <div className="quick-cards">
          <button className="quick-card">
            <div className="quick-card-icon projects">
              <FolderKanban size={16} />
            </div>
            <div className="quick-card-body">
              <span className="quick-card-title">Projects</span>
              <span className="quick-card-meta">4 active</span>
            </div>
            <ChevronRight size={14} className="quick-card-arrow" />
          </button>

          <button className="quick-card">
            <div className="quick-card-icon agents">
              <Bot size={16} />
            </div>
            <div className="quick-card-body">
              <span className="quick-card-title">Agents</span>
              <span className="quick-card-meta">2 running</span>
            </div>
            <ChevronRight size={14} className="quick-card-arrow" />
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="sidemenu-divider" />

      {/* Chat History */}
      <div className="sidemenu-section history-section">
        <div className="section-header">
          <span className="section-label">
            <Clock size={12} style={{ display: "inline", marginRight: 5, opacity: 0.5 }} />
            Recent Chats
          </span>
          <button className="new-chat-inline" title="New Chat">
            <Plus size={13} />
          </button>
        </div>

        <div className="chat-list">
          {chatHistory.map((chat) => (
            <button
              key={chat.id}
              className={`chat-item ${activeChat === chat.id ? "active" : ""}`}
              onClick={() => setActiveChat(chat.id)}
            >
              <MessageSquare size={13} className="chat-item-icon" />
              <div className="chat-item-body">
                <span className="chat-item-title">{chat.title}</span>
                <span className="chat-item-time">{chat.time}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}