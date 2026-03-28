import React, { useState } from 'react';
import { SendHorizontal, Lightbulb, Code, PenTool, Compass, Construction, X, RefreshCw } from 'lucide-react';
import './Homescreen.css';

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

  const suggestions = [
    { icon: <Compass size={18} />, text: "Plan a 3-day trip to Tokyo" },
    { icon: <Lightbulb size={18} />, text: "Explain quantum physics simply" },
    { icon: <Code size={18} />, text: "Help me debug a React useEffect" },
    { icon: <PenTool size={18} />, text: "Write a professional email for a job" },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      console.log("User Query:", query);
      setQuery('');
    }
  };

  return (
    <div className="home-screen">
      {showWip && <WipToast onClose={() => setShowWip(false)} />}

      <div className="home-header">
        <p className="tagline_home">How can I help you today?</p>
        <button className="wip-btn" onClick={() => setShowWip(true)}>
          <Construction size={13} />
          Work in Progress
        </button>
      </div>

      <div className="main-content">
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
      </div>

      <form className="input-container" onSubmit={handleSubmit}>
        <input
          type="text"
          className="input-bar"
          placeholder="Message OneAI..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="send-btn" disabled={!query.trim()}>
          <SendHorizontal size={20} />
        </button>
      </form>
    </div>
  );
}

export default Homescreen;