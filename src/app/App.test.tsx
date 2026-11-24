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
    expect(screen.queryByRole('button', { name: /Oturumum/ })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Veri bağlantısı yapılandırılmadı')
    expect(screen.getByRole('heading', { name: 'Veri bağlantısı yapılandırılmadı' })).toBeVisible()
  })

  it('üst çubuktaki bildirim menüsünü boş açar ve kapatır', async () => {
    const user = userEvent.setup()
    renderApp()

    const trigger = screen.getByRole('button', { name: 'Bildirimler' })
    expect(trigger).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Bildirimler' })).not.toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole('region', { name: 'Bildirimler' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Bildirimler' })).toHaveTextContent('Bildirimler')
    expect(screen.getByRole('region', { name: 'Bildirimler' }).children).toHaveLength(1)

    await user.click(trigger)
    expect(screen.queryByRole('region', { name: 'Bildirimler' })).not.toBeInTheDocument()
  })

  it('kullanılabilir sayfalarla gezinir ve mobil menüyü kapatır', async () => {
    const user = userEvent.setup()
    renderApp()
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }))

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(screen.getByRole('button', { name: 'Menüyü kapat' })).toHaveAttribute('aria-expanded', 'true')

    expect(menu.getAllByRole('link').map((link) => link.textContent)).toEqual(['Genel Bakış', 'Ödemeler', 'Kasa Defteri', 'Firmalar'])
    for (const name of ['Tahsilatlar', 'Takvim', 'Departmanlar', 'Belgeler', 'Kullanıcı Yönetimi', 'Ayarlar']) {
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
    await user.click(menu.getByRole('link', { name: 'Kasa Defteri' }))
    expect(screen.getByRole('button', { name: 'Menüyü aç' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: 'Kasa Defteri', level: 1 })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    await user.click(menu.getByRole('link', { name: 'Ödemeler' }))
    expect(screen.getByRole('button', { name: 'Menüyü aç' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()
  })

  it('Firmalar dizinini boş ve kayıt altyapısı olmadan açar', () => {
    renderApp('/firms')

    expect(screen.getByRole('heading', { name: 'Firmalar', level: 1 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Firmalar' })).toHaveClass('nav-link-active')
    expect(screen.getByRole('heading', { name: 'Henüz firma kaydı yok' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Firma ekle' })).toBeDisabled()
    expect(screen.getByText(/backend bağlantısı tamamlandığında açılacak/)).toBeVisible()
  })

  it('Kasa Defterini bağlantı olmadan kayıt işlemleri kapalı açar', () => {
    renderApp('/cashbook')

    expect(screen.getByRole('heading', { name: 'Kasa Defteri', level: 1 })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Kasa Defteri' })).toHaveClass('nav-link-active')
    const table = within(screen.getByRole('table', { name: 'Kasa hareketleri' }))
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Tarih', 'Açıklama', 'İşlem Türü', 'Borç (Giren)', 'Alacak (Çıkan)',
    ])
    expect(table.getAllByRole('row')).toHaveLength(2)
    expect(table.getByRole('heading', { name: 'Kasa verileri gösterilemiyor' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Kayıt ekle' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Kayıt ekle' })).toHaveAccessibleDescription(/Yalnızca yetkilendirilmiş muhasebe hesabı/)
    expect(screen.getByRole('region', { name: 'Yatay kaydırılabilir kasa defteri tablosu' })).toHaveAttribute('tabindex', '0')
  })

  it('Kasım 2026 ile Aralık 2027 arasında ay seçimini ve tablo başlığını değiştirir', async () => {
    const user = userEvent.setup()
    renderApp('/cashbook')
    const months = within(screen.getByRole('navigation', { name: 'Kasa defteri ayları' }))
    expect(months.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Kasım 2026', 'Aralık 2026', 'Ocak 2027', 'Şubat 2027', 'Mart 2027', 'Nisan 2027',
      'Mayıs 2027', 'Haziran 2027', 'Temmuz 2027', 'Ağustos 2027', 'Eylül 2027',
      'Ekim 2027', 'Kasım 2027', 'Aralık 2027',
    ])
    expect(months.getByRole('button', { name: 'Kasım 2026', pressed: true })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Kasım 2026 — Kasa hareketleri' })).toBeVisible()

    await user.click(months.getByRole('button', { name: 'Aralık 2026' }))
    expect(screen.getByRole('heading', { name: 'Aralık 2026 — Kasa hareketleri' })).toBeVisible()
    await user.click(months.getByRole('button', { name: 'Ocak 2027' }))
    expect(screen.getByRole('heading', { name: 'Ocak 2027 — Kasa hareketleri' })).toBeVisible()
    await user.click(months.getByRole('button', { name: 'Aralık 2027' }))
    expect(months.getAllByRole('button', { pressed: true })).toHaveLength(1)
    expect(months.getByRole('button', { name: 'Aralık 2027', pressed: true })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Aralık 2027 — Kasa hareketleri' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Kasa verileri gösterilemiyor' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Kayıt ekle' })).toBeDisabled()
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
