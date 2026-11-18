import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { testPaymentsStorageKey } from '../features/payments/test-payment-store'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
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

  it('mobil menüyü seçimden sonra kapatır ve manuel kurun henüz çalışmadığını belirtir', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Menüyü aç' }))
    expect(screen.getByRole('button', { name: 'Menüyü kapat' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('link', { name: 'Ayarlar' }))

    expect(screen.getByRole('button', { name: 'Menüyü aç' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('heading', { name: 'Ayarlar', level: 1 })).toBeVisible()
    expect(screen.getByText(/Şu anda kur kaydedilmez/)).toBeVisible()
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
