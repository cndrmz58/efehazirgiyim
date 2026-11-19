import { AuthApiError, createClient } from '@supabase/supabase-js'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthForm } from './AuthPage'

const appUrl = 'http://localhost:5173'

function renderForm(callback = false) {
  const client = createClient('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  render(<MemoryRouter><AuthForm client={client} appUrl={appUrl} callback={callback} /></MemoryRouter>)
  return client
}

afterEach(() => window.history.replaceState(null, '', '/'))

it('keeps password recovery responses generic for an unknown account', async () => {
  const user = userEvent.setup()
  const client = renderForm()
  const reset = vi.spyOn(client.auth, 'resetPasswordForEmail').mockResolvedValue({
    data: null, error: new AuthApiError('Unknown user', 404, 'user_not_found'),
  })
  await user.click(await screen.findByRole('button', { name: 'Parolamı unuttum' }))
  await user.type(screen.getByLabelText('Kurumsal e-posta'), 'test@example.com')
  await user.click(screen.getByRole('button', { name: 'Bağlantı iste' }))
  expect(reset).toHaveBeenCalledWith('test@example.com', { redirectTo: `${appUrl}/auth/callback` })
  expect(await screen.findByRole('status')).toHaveTextContent('e-posta gönderilecektir')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('scrubs invitation tokens and does not change a password for an invalid invite', async () => {
  const user = userEvent.setup()
  window.history.replaceState(null, '', '/auth/callback#type=invite&token_hash=fixture')
  const client = renderForm(true)
  const verify = vi.spyOn(client.auth, 'verifyOtp').mockResolvedValue({
    data: { user: null, session: null }, error: new AuthApiError('Expired', 403, 'otp_expired'),
  })
  const update = vi.spyOn(client.auth, 'updateUser')
  const form = await screen.findByRole('form', { name: 'Parola belirleme' })
  const passwordInput = within(form).getByLabelText(/Yeni parola/)
  await user.type(passwordInput, 'example-password')
  expect(passwordInput).toHaveValue('example-password')
  expect(passwordInput).toBeValid()
  expect(window.location.hash).toBe('')
  expect(verify).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Parolayı kaydet' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Bağlantı geçersiz')
  expect(verify).toHaveBeenCalledWith({ type: 'invite', token_hash: 'fixture' })
  expect(update).not.toHaveBeenCalled()
})
