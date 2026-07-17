import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AssistantApproval from './components/AssistantApproval.jsx'
import OAuthConsent from './components/OAuthConsent.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'

const rootScreen = window.location.pathname === '/oauth/consent'
  ? <OAuthConsent />
  : window.location.pathname === '/assistant/approve'
    ? <AssistantApproval />
    : <App />

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      {rootScreen}
    </AuthProvider>
  </StrictMode>,
)
