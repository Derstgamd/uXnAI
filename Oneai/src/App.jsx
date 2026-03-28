import { useState } from 'react'
import './App.css'
import Sidebar from './screens/Sidebar.jsx'
import SideMenu from './screens/SideMenu.jsx'
import Homescreen from './screens/Homescreen.jsx'
import { ChevronLeft, Menu, User, Settings, MessageCirclePlus } from 'lucide-react'

function App() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  return (
    <div className="App">
      <div className={`panel ${panelOpen ? 'open' : 'closed'}`}>
        <button
          className="panel-toggle"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? 'Close panel' : 'Open panel'}
        >
          {panelOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
        </button>

        {isLoggedIn && (
          <button className='new_chat'>
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
            <button className="footer-btn" title="Settings" aria-label="Settings">
              <Settings size={20} />
              <span className="footer-label">Settings</span>
            </button>
          </div>
        )}
      </div>

      <div className="content">
        <h1>uXnAI</h1>
        <Homescreen />
      </div>
    </div>
  )
}

export default App