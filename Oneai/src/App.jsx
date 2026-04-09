import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Sidebar from './screens/Sidebar.jsx'
import SideMenu from './screens/SideMenu.jsx'
import Homescreen from './screens/Homescreen.jsx'
import SettingsScreen from './screens/Settings.jsx'
import Welcome from './screens/Welcome.jsx'
import { ChevronLeft, Menu, User, Settings, MessageCirclePlus } from 'lucide-react'

function MainLayout() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onLogout = () => {
      setIsLoggedIn(false)
      navigate('/', { replace: true })
    }
    window.addEventListener('oneai:logout', onLogout)
    return () => window.removeEventListener('oneai:logout', onLogout)
  }, [navigate])

  useEffect(() => {
    const saved = localStorage.getItem('oneai:theme')
    if (saved) document.documentElement.setAttribute('data-theme', saved)
  }, [])

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
            className='new_chat'
            type="button"
            onClick={() => window.dispatchEvent(new Event('oneai:newChat'))}
            title="New chat"
            aria-label="New chat"
          >
            <MessageCirclePlus size={20} />
          </button>
        )}

        <div className="panel-content">
          {isLoggedIn
            ? <SideMenu />
            : <Sidebar
                onGoogleLogin={() => setIsLoggedIn(true)}
                onEmailLogin={() => setIsLoggedIn(true)}
              />
          }
        </div>

        {/* Footer: show when panel is CLOSED — restored to original behaviour */}
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
        <Outlet />
      </div>
    </div>
  )
}

function WelcomeRoute() {
  const navigate = useNavigate()

  return <Welcome onTryFree={() => navigate('/chat')} />
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