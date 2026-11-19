import type { Session } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthGate } from './AuthPage'
import { getLoginClient } from './auth-client'

const config = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  VITE_APP_URL: 'https://app.example.com',
}

function renderGate(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthGate config={config}>
        <Routes>
          <Route path="/payments" element={<p>Çalışma alanı</p>} />
          <Route path="/giris" element={<p>Giriş ekranı</p>} />
          <Route path="/auth/callback" element={<p>Parola bağlantısı</p>} />
        </Routes>
      </AuthGate>
    </MemoryRouter>,
  )
}

afterEach(async () => {
  await getLoginClient(config).auth.signOut({ scope: 'local' })
  window.localStorage.clear()
  vi.restoreAllMocks()
})

it('redirects an unauthenticated protected route to login', async () => {
  renderGate('/payments')

  expect(await screen.findByText('Giriş ekranı')).toBeVisible()
  expect(screen.queryByText('Çalışma alanı')).not.toBeInTheDocument()
})

it('keeps the password callback public without a signed-in session', () => {
  renderGate('/auth/callback')

  expect(screen.getByText('Parola bağlantısı')).toBeVisible()
  expect(screen.queryByText('Giriş ekranı')).not.toBeInTheDocument()
})

it('keeps the login route public without a signed-in session', () => {
  renderGate('/giris')

  expect(screen.getByText('Giriş ekranı')).toBeVisible()
  expect(screen.queryByText('Çalışma alanı')).not.toBeInTheDocument()
})

it('renders a protected route when Supabase returns an active session', async () => {
  const client = getLoginClient(config)
  const user: Session['user'] = {
    id: 'user-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'user@example.com',
  }
  const session: Session = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user,
  }
  const subscription = client.auth.onAuthStateChange(() => {})
  vi.spyOn(client.auth, 'onAuthStateChange').mockReturnValue(subscription)
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session }, error: null })

  renderGate('/payments')

  expect(await screen.findByText('Çalışma alanı')).toBeVisible()
})
