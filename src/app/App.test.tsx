import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { EnvironmentState } from '../lib/environment'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const authConfig = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  VITE_APP_URL: 'https://app.example.com',
}

function renderApp(path = '/', environment: EnvironmentState = { status: 'unconfigured' }) {
  return render(<MemoryRouter initialEntries={[path]}><App environment={environment} /></MemoryRouter>)
}

describe('Türkçe ödeme çalışma alanı', () => {
  it('veri bağlantısı yokken kayıt göstermez ve girişi kapatır', () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ödeme Ekle' })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('Veri bağlantısı yapılandırılmadı')
    expect(screen.getByRole('heading', { name: 'Veri bağlantısı yapılandırılmadı' })).toBeVisible()
  })

  it('yalnızca Genel Bakış ve Ödemeler ile gezinir ve mobil menüyü kapatır', async () => {
    const user = userEvent.setup()
    renderApp()
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }))

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(screen.getByRole('button', { name: 'Menüyü kapat' })).toHaveAttribute('aria-expanded', 'true')

    expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual(['Genel Bakış', 'Ödemeler'])
    for (const name of ['Tahsilatlar', 'Takvim', 'İş Ortakları', 'Departmanlar', 'Belgeler', 'Kullanıcı Yönetimi', 'Ayarlar']) {
      const item = menu.getByRole('button', { name })
      expect(item).toBeDisabled()
      await user.click(item)
    }
    expect(screen.getByRole('button', { name: 'Menüyü kapat' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()

    await user.click(menu.getByRole('link', { name: 'Genel Bakış' }))
    expect(screen.getByRole('button', { name: 'Menüyü aç' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: 'Genel Bakış', level: 1 })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    await user.click(menu.getByRole('link', { name: 'Ödemeler' }))
    expect(screen.getByRole('button', { name: 'Menüyü aç' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()
  })

  it('Ayarlar doğrudan açıldığında manuel kurun henüz çalışmadığını belirtir', () => {
    renderApp('/settings')
    expect(screen.getByRole('heading', { name: 'Ayarlar', level: 1 })).toBeVisible()
    expect(screen.getByText(/Şu anda kur kaydedilmez/)).toBeVisible()
  })

  it('giriş sayfasını ayrı ve kurumsal bir ekran olarak gösterir', async () => {
    renderApp('/giris')

    expect(await screen.findByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible()
    expect(screen.getByRole('main')).toHaveClass('auth-page')
    expect(screen.queryByRole('navigation', { name: 'Ana menü' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Giriş hizmeti yapılandırılmadan oturum açılamaz')
  })

  it('Supabase yapılandırıldığında giriş formunu çalışma alanı dışında gösterir', async () => {
    renderApp('/giris', { status: 'configured', config: authConfig })

    expect(await screen.findByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible()
    expect(await screen.findByLabelText('Kurumsal e-posta')).toBeVisible()
    expect(screen.getByLabelText('Parola')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Ana menü' })).not.toBeInTheDocument()
  })

  it('eski giriş adresini yeni giriş sayfasına yönlendirir', async () => {
    renderApp('/auth')

    expect(await screen.findByRole('heading', { name: 'Hoş geldiniz' })).toBeVisible()
  })

  it('bilinmeyen adreste boş veya yanıltıcı bir ekran göstermez', () => {
    renderApp('/bilinmeyen')
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ödeme tablosuna dön' })).toHaveAttribute('href', '/payments')
  })
})
