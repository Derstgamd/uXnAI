import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'https://uxnai.onrender.com'

// ── Fetch helper with proper CORS + error handling ──────────────────────────
const apiCall = async (endpoint, options = {}) => {
  const defaultOptions = {
    credentials: 'include', // Send/receive cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }

  const res = await fetch(`${API}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  })

  // Handle non-JSON responses
  let data
  try {
    data = await res.json()
  } catch {
    data = { error: res.statusText || 'Unknown error' }
  }

  return { res, data }
}

export function useAuth() {
  // Seed from sessionStorage so tab-level navigation never shows loading spinner
  const cached = (() => { try { const r = sessionStorage.getItem('oneai:session'); return r ? JSON.parse(r) : undefined } catch { return undefined } })()

  const [user, setUser] = useState(cached !== undefined ? cached : undefined) // undefined = loading, null = logged out
  const [loading, setLoading] = useState(cached === undefined) // skip loading if we have a cache hit
  const [error, setError] = useState(null)

  // ── Fetch current session on mount ────────────────────────────────────────
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { res, data } = await apiCall('/auth/me')
        if (res.ok && data.user) {
          setUser(data.user)
          try { sessionStorage.setItem('oneai:session', JSON.stringify(data.user)) } catch {}
        } else {
          setUser(null)
          try { sessionStorage.removeItem('oneai:session') } catch {}
        }
      } catch (err) {
        console.error('Session fetch error:', err)
        setUser(null)
        try { sessionStorage.removeItem('oneai:session') } catch {}
      } finally {
        setLoading(false)
      }
    }

    // If we have a cached session, still revalidate in the background
    // but don't block the UI on it
    fetchSession()

    // Handle Google OAuth redirect back to frontend
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth_success')) {
      window.history.replaceState({}, '', window.location.pathname)
      // Re-fetch user after Google redirect
      fetchSession()
    }
    if (params.get('auth_error')) {
      setError(`Login failed: ${params.get('auth_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── Email register ──────────────────────────────────────────────────────────
  const register = useCallback(async (email, password) => {
    setError(null)
    try {
      const { res, data } = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        return false
      }

      if (data.user) {
        setUser(data.user)
      }
      return true
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message || 'Registration failed')
      return false
    }
  }, [])

  // ── Email login ─────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    setError(null)
    try {
      const { res, data } = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return false
      }

      if (data.user) {
        setUser(data.user)
      }
      return true
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Login failed')
      return false
    }
  }, [])

  // ── Google login — redirect to backend ───────────────────────────────────────
  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API}/auth/google`
  }, [])

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await apiCall('/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setUser(null)
      setError(null)
      try { sessionStorage.removeItem('oneai:session') } catch {}
    }
  }, [])

  return { user, loading, error, login, register, loginWithGoogle, logout, setError }
}