import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'https://unxai.onrender.com'

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
  const [user, setUser] = useState(undefined) // undefined = loading, null = logged out
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Fetch current session on mount ────────────────────────────────────────
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { res, data } = await apiCall('/auth/me')
        if (res.ok && data.user) {
          setUser(data.user)
        } else {
          setUser(null)
        }
      } catch (err) {
        console.error('Session fetch error:', err)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

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
    }
  }, [])

  return { user, loading, error, login, register, loginWithGoogle, logout, setError }
}