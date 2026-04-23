import { useState, useEffect } from 'react'
import './Sidebar.css'

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const EmailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
)

export default function Sidebar({ onGoogleLogin, onEmailLogin, onEmailRegister, authError }) {
  const [mounted, setMounted] = useState(false)
  const [showForm, setShowForm] = useState(false)   // false = buttons, true = email form
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')

    if (!email || !password) { setLocalError('Please fill in all fields'); return }
    if (password.length < 8) { setLocalError('Password must be at least 8 characters'); return }

    setSubmitting(true)
    const ok = isRegister
      ? await onEmailRegister(email, password)
      : await onEmailLogin(email, password)
    setSubmitting(false)

    if (!ok) setLocalError(authError || 'Something went wrong')
  }

  const displayError = localError || authError

  return (
    <div className="auth-root">
      <div className="noise" />
      <div className="grid-bg" />
      <div className="glow" />

      <div className="auth-card">
        <div className="logo-block">
          <div>
            <span className="logo-text">Perception</span>
            <span className="logo-tag">Beta</span>
          </div>
          <div className="divider" />
          <p className="tagline">Your AI. One place. No noise.</p>
        </div>

        {displayError && (
          <div className="auth-error">{displayError}</div>
        )}

        {!showForm ? (
          <>
            <button className="btn btn-google" onClick={onGoogleLogin}>
              <span className="btn-icon"><GoogleIcon /></span>
              <span className="btn-label">Continue with Google</span>
            </button>

            <div className="separator">
              <div className="sep-line" />
              <span className="sep-text">or</span>
              <div className="sep-line" />
            </div>

            <button className="btn btn-email" onClick={() => setShowForm(true)}>
              <span className="btn-icon"><EmailIcon /></span>
              <span className="btn-label">Continue with Email</span>
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-toggle">
              <button
                type="button"
                className={`toggle-btn ${!isRegister ? 'active' : ''}`}
                onClick={() => { setIsRegister(false); setLocalError('') }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`toggle-btn ${isRegister ? 'active' : ''}`}
                onClick={() => { setIsRegister(true); setLocalError('') }}
              >
                Create account
              </button>
            </div>

            <input
              className="form-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
            <input
              className="form-input"
              type="password"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            <button className="btn btn-submit" type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              className="back-btn"
              onClick={() => { setShowForm(false); setLocalError(''); setEmail(''); setPassword('') }}
            >
              ← Back
            </button>
          </form>
        )}

        <p className="footer-text">
          By continuing, you agree to our{' '}
          <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}