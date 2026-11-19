import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import './styles/index.css'

// Removes records left by the retired browser-only test mode; they were never shared or authoritative.
try {
  window.localStorage.removeItem('efe:test-payments:v1')
} catch {
  // Storage may be blocked; there is nothing to clean up in that case.
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Uygulama kök öğesi bulunamadı.')
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
