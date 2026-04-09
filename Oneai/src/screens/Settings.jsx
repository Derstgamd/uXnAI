import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Trash2, Sun, Moon } from "lucide-react";
import "./Settings.css";

const THEME_KEY = "oneai:theme";

const getSystemTheme = () => (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light");

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
};

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || getSystemTheme());

  const isDark = theme === "dark";
  const themeLabel = useMemo(() => (isDark ? "Dark" : "Light"), [isDark]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [theme]);

  const handleLogout = () => {
    window.dispatchEvent(new Event("oneai:logout"));
    navigate("/", { replace: true });
  };

  const handleDeleteAccount = () => {
    const ok = window.confirm(
      "Delete account (local placeholder)? This will clear local chats/projects and log you out."
    );
    if (!ok) return;

    try {
      localStorage.removeItem("oneai:textSessions");
      localStorage.removeItem("oneai:activeTextSessionId");
      localStorage.removeItem("oneai:projects");
      localStorage.removeItem("oneai:activeProject");
      localStorage.removeItem("oneai:mode");
    } catch {
      // ignore
    }

    window.dispatchEvent(new Event("oneai:newChat"));
    window.dispatchEvent(new Event("oneai:textSessionsUpdated"));
    handleLogout();
  };

  return (
    <div className="settings-root">
      <div className="settings-header">
        <button
          className="settings-back"
          type="button"
          onClick={() => (location.key === "default" ? navigate("/chat") : navigate(-1))}
          aria-label="Back"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="settings-title">Settings</div>
        <div className="settings-spacer" />
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-title">Theme</div>
            <div className="settings-row-sub">Choose light or dark appearance</div>
          </div>
          <button
            type="button"
            className={`theme-toggle ${isDark ? "dark" : "light"}`}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label="Toggle theme"
            title={`Current: ${themeLabel}`}
          >
            {isDark ? <Moon size={14} /> : <Sun size={14} />}
            <span>{themeLabel}</span>
          </button>
        </div>

        <div className="settings-divider" />

        <div className="settings-row">
          <div className="settings-row-left">
            <div className="settings-row-title">Account</div>
            <div className="settings-row-sub">Session controls (placeholders until backend)</div>
          </div>
          <div className="settings-actions">
            <button type="button" className="settings-btn" onClick={handleLogout}>
              <LogOut size={14} />
              Logout
            </button>
            <button type="button" className="settings-btn danger" onClick={handleDeleteAccount}>
              <Trash2 size={14} />
              Delete account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

