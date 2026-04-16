import { useState, useEffect, useRef } from "react";
import "./Welcome.css";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const EmailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

export default function Welcome({ onTryFree, onGoogleLogin, onEmailLogin, authError }) {
  const [mounted, setMounted] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const texts = [
    'Welcome to the consensus',
    'Powered by OneAI',
    'Make smarter decisions',
    'Real-time insights',
    'Your AI companion',
    'Helping you stay informed',
  ];
  const animationState = useRef({ charIndex: 0, textIndex: 0, isErasing: false, isHolding: false });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      const state = animationState.current;
      const currentText = texts[state.textIndex];

      if (state.isHolding) return;

      if (!state.isErasing) {
        if (state.charIndex < currentText.length) {
          setDisplayedText(currentText.slice(0, state.charIndex + 1));
          state.charIndex++;
        } else {
          state.isHolding = true;
          setTimeout(() => { state.isHolding = false; state.isErasing = true; }, 2000);
        }
      } else {
        if (state.charIndex > 0) {
          state.charIndex--;
          setDisplayedText(currentText.slice(0, state.charIndex));
        } else {
          state.isHolding = true;
          setTimeout(() => {
            state.isHolding = false;
            state.isErasing = false;
            state.textIndex = (state.textIndex + 1) % texts.length;
          }, 2000);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="welcome-root">
      <div className="noise" />
      <div className="grid-bg" />
      <div className="glow" />

      <div className="welcome-container">
        <div className="welcome-content">
          <h1 className="welcome-title">Welcome to OneAI</h1>
          <p className="welcome-subtitle typewriter">
            {displayedText}<span className="rotating-square"></span>
          </p>

          {authError && (
            <div className="welcome-error">{authError}</div>
          )}

          <button className="btn btn-try-free" onClick={onTryFree}>
            Try it for free
          </button>

          <div className="separator">
            <div className="sep-line" />
            <span className="sep-text">or</span>
            <div className="sep-line" />
          </div>

          <button className="btn btn-google" onClick={onGoogleLogin}>
            <span className="btn-icon"><GoogleIcon /></span>
            <span className="btn-label">Continue with Google</span>
          </button>

          <button className="btn btn-email" onClick={onEmailLogin}>
            <span className="btn-icon"><EmailIcon /></span>
            <span className="btn-label">Continue with Email</span>
          </button>
        </div>

        <footer className="welcome-footer">
          <a href="#tos" className="footer-link">Terms of Service</a>
          <span className="footer-separator">•</span>
          <a href="#privacy" className="footer-link">Privacy Policy</a>
          <span className="footer-separator">•</span>
          <a href="#whitepaper" className="footer-link">Whitepaper</a>
        </footer>
      </div>
    </div>
  );
}