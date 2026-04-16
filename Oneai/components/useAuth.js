import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'https://unxai.onrender.com'

export function useAuth() {
  const [user, setUser] = useState(undefined)  // undefined = loading, null = logged out
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Fetch current session on mount ──────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setUser(data.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))

    // Handle Google OAuth redirect back to frontend
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth_success')) {
      window.history.replaceState({}, '', window.location.pathname)
      // Re-fetch user after Google redirect
      fetch(`${API}/auth/me`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => { if (data.user) setUser(data.user) })
        .catch(() => {})
    }
    if (params.get('auth_error')) {
      setError(`Login failed: ${params.get('auth_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Email register ───────────────────────────────────────────────────────────
  const register = useCallback(async (email, password) => {
    setError(null)
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Registration failed'); return false }
    setUser(data.user)
    return true
  }, [])

  // ── Email login ──────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setError(null)
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Login failed'); return false }
    setUser(data.user)
    return true
  }, [])

  // ── Google login — redirect to backend ──────────────────────────────────────
  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API}/auth/google`
  }, [])

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
    setUser(null)
  }, [])

  return { user, loading, error, login, register, loginWithGoogle, logout, setError }
}