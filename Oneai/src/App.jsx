import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Sidebar from './screens/Sidebar.jsx'
import SideMenu from './screens/SideMenu.jsx'
import Homescreen from './screens/Homescreen.jsx'
import SettingsScreen from './screens/Settings.jsx'
import Welcome from './screens/Welcome.jsx'
import { useAuth } from '../components/useAuth.js'
import { ChevronLeft, Menu, User, Settings, MessageCirclePlus } from 'lucide-react'

function MainLayout() {
  const [panelOpen, setPanelOpen] = useState(true)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading, error, login, register, loginWithGoogle, logout } = useAuth()

  useEffect(() => {
    const onLogout = async () => {
      await logout()
      navigate('/', { replace: true })
    }
    window.addEventListener('oneai:logout', onLogout)
    return () => window.removeEventListener('oneai:logout', onLogout)
  }, [navigate, logout])

  useEffect(() => {
    const saved = localStorage.getItem('oneai:theme')
    if (saved) document.documentElement.setAttribute('data-theme', saved)
  }, [])

  const isLoggedIn = !!user

  return (
    <div className="App">
      <div className={`panel ${panelOpen ? 'open' : 'closed'} after-welcome`}>
        <button
          className="panel-toggle"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? 'Close panel' : 'Open panel'}
        >
          {panelOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
        </button>

        {isLoggedIn && (
          <button
            className="new_chat"
            type="button"
            onClick={() => window.dispatchEvent(new Event('oneai:newChat'))}
            title="New chat"
            aria-label="New chat"
          >
            <MessageCirclePlus size={20} />
          </button>
        )}

        <div className="panel-content">
          {loading ? (
            <div className="auth-loading">
              <span className="auth-loading-dot" />
            </div>
          ) : isLoggedIn ? (
            <SideMenu />
          ) : (
            <Sidebar
              onGoogleLogin={loginWithGoogle}
              onEmailLogin={login}
              onEmailRegister={register}
              authError={error}
            />
          )}
        </div>

        {!panelOpen && (
          <div className="panel-footer">
            <button className="footer-btn" title="User Profile" aria-label="User Profile">
              <User size={20} />
              <span className="footer-label">Profile</span>
            </button>
            <button
              className="footer-btn"
              title="Settings"
              aria-label="Settings"
              type="button"
              onClick={() => navigate('/settings')}
              style={{ opacity: location.pathname === '/settings' ? 1 : undefined }}
            >
              <Settings size={20} />
              <span className="footer-label">Settings</span>
            </button>
          </div>
        )}
      </div>

      <div className="content">
        <h1>uXnAI</h1>
        <Outlet context={{ user, logout }} />
      </div>
    </div>
  )
}

// ── Welcome route — handles all auth actions directly ────────────────────────
function WelcomeRoute() {
  const navigate = useNavigate()
  const { user, loading, error, login, register, loginWithGoogle } = useAuth()

  // Already logged in — skip welcome
  useEffect(() => {
    if (!loading && user) navigate('/chat', { replace: true })
  }, [user, loading, navigate])

  // Google OAuth redirect back
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth_success')) {
      window.history.replaceState({}, '', window.location.pathname)
      navigate('/chat', { replace: true })
    }
    if (params.get('auth_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [navigate])

  if (loading) return null

  const handleTryFree = () => navigate('/chat')

  const handleGoogleClick = () => loginWithGoogle()

  // For the double-click email flow on the welcome page we just navigate to /chat
  // The sidebar inside MainLayout will handle the actual login form
  const handleEmailClick = () => navigate('/chat')

  return (
    <Welcome
      onTryFree={handleTryFree}
      onGoogleLogin={handleGoogleClick}
      onEmailLogin={handleEmailClick}
      authError={error}
    />
  )
}

// ── Guard: redirect to / if not logged in ────────────────────────────────────
function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  return <Outlet />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomeRoute />} />
      <Route element={<MainLayout />}>
        <Route path="/chat" element={<Homescreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App