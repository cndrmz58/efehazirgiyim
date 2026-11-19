import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { testPaymentsStorageKey } from '../features/payments/test-payment-store'
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
  it('ödeme tablosunda istenen sütunları ve dürüst kurulum durumunu gösterir', () => {
    renderApp()

    expect(screen.getByRole('heading', { name: 'Ödemeler', level: 1 })).toBeVisible()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Ödeme Detayı', 'Ödeme Türü', 'Tutar', 'Vade Tarihi', 'Gerçekleşen Ödeme Tarihi', 'Açıklama', 'Durum',
    ])
    expect(screen.getByRole('button', { name: 'Test Ödemesi Ekle' })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('Gerçek veri bağlantısı kapalı')
    expect(screen.getByText('Test modu kapalı')).toBeVisible()
  })

  it('TL varsayılanını, EUR/USD seçimini ve filtrelerin sıfırlanmasını destekler', async () => {
    const user = userEvent.setup()
    renderApp('/payments')

    const currency = screen.getByRole('combobox', { name: 'Para birimi' })
    expect(currency).toHaveValue('TRY')
    await user.selectOptions(currency, 'EUR')
    expect(currency).toHaveValue('EUR')
    await user.selectOptions(currency, 'USD')
    expect(currency).toHaveValue('USD')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Ödeme türü' }), 'tax')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Durum' }), 'paid')
    await user.type(screen.getByRole('searchbox', { name: 'Ödeme ara' }), 'aranan')
    await user.click(screen.getByRole('button', { name: 'Filtreleri temizle' }))

    expect(currency).toHaveValue('TRY')
    expect(screen.getByRole('combobox', { name: 'Ödeme türü' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Durum' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Ödeme ara' })).toHaveValue('')
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

  it('bozuk test verisini sessizce silmez veya boş kayıtlar gibi göstermez', () => {
    window.localStorage.setItem(testPaymentsStorageKey, '{bozuk-json')
    renderApp()

    expect(screen.getByRole('alert')).toHaveTextContent('Saklanan test verisi okunamıyor')
    expect(screen.getByRole('heading', { name: 'Test kayıtları yüklenemedi' })).toBeVisible()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(testPaymentsStorageKey)).toBe('{bozuk-json')
  })

  it('depolama hatasında kayıt başarı mesajı vermez ve formu kapatmaz', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Test modunu aç' }))
    const storedBefore = window.localStorage.getItem(testPaymentsStorageKey)
    await user.click(screen.getByRole('button', { name: 'Test Ödemesi Ekle' }))
    const form = within(screen.getByRole('form', { name: 'Test ödeme formu' }))
    await user.type(form.getByLabelText('Ödeme detayı'), 'Yalnızca test')
    await user.type(form.getByLabelText(/Tutar/), '12,50')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('QuotaExceededError') })
    await user.click(form.getByRole('button', { name: 'Test ödemesini kaydet' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Test verileri kaydedilemedi')
    expect(screen.getByRole('form', { name: 'Test ödeme formu' })).toBeInTheDocument()
    expect(screen.queryByText('Test ödemesi bu tarayıcıya kaydedildi.')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(testPaymentsStorageKey)).toBe(storedBefore)
  })

  it('tarayıcı depolaması engelliyken yazmayı kapatır', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('SecurityError') })
    renderApp()
    expect(screen.getByRole('alert')).toHaveTextContent('Tarayıcı depolamasına erişilemiyor')
    expect(screen.getByRole('button', { name: 'Test modunu aç' })).toBeDisabled()
  })
})
