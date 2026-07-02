import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import ElectronTitlebar from './components/ElectronTitlebar.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Custom desktop titlebar — sits above every screen in the Electron
        shell, and renders nothing in the browser. */}
    <ElectronTitlebar />
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
