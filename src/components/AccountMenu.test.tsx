import type { Session } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountMenu } from './AccountMenu'
import { getLoginClient } from '../features/auth/auth-client'

const config = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  VITE_APP_URL: 'https://app.example.com',
}
const client = getLoginClient(config)

const user: Session['user'] = {
  id: 'user-id',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  email: 'muhasebe@example.com',
}
const session: Session = {
  access_token: 'test-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'test-refresh-token',
  user,
}

afterEach(async () => {
  vi.restoreAllMocks()
  await client.auth.signOut({ scope: 'local' })
  window.localStorage.clear()
})

it('hides account controls without an authenticated user', async () => {
  const subscription = client.auth.onAuthStateChange(() => {})
  vi.spyOn(client.auth, 'onAuthStateChange').mockReturnValue(subscription)
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null })

  render(<AccountMenu config={config} />)

  expect(await screen.queryByRole('button', { name: /Oturumum/ })).not.toBeInTheDocument()
})

it('shows the signed-in user and signs out from the account menu', async () => {
  const interaction = userEvent.setup()
  const subscription = client.auth.onAuthStateChange(() => {})
  vi.spyOn(client.auth, 'onAuthStateChange').mockReturnValue(subscription)
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session }, error: null })
  const signOut = vi.spyOn(client.auth, 'signOut').mockResolvedValue({ error: null })

  render(<AccountMenu config={config} />)

  const trigger = await screen.findByText('Oturumum')
  await interaction.click(trigger.closest('summary') as HTMLElement)
  expect(screen.getAllByText('muhasebe@example.com')).toHaveLength(2)
  await interaction.click(screen.getByRole('button', { name: 'Oturumu kapat' }))

  expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
})