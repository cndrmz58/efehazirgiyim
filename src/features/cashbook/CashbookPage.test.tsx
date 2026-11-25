import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CashbookPage } from './CashbookPage'
import type { CashbookEntry } from './cashbook-model'

const entries: CashbookEntry[] = [
  { id: 'kasim', date: '2026-11-30', description: 'Kasım hareketi', type: 'Yemek', incoming: '100.10', outgoing: '80.03' },
  { id: 'aralik', date: '2026-12-01', description: 'Aralık hareketi', type: 'Avans', incoming: '0.00', outgoing: '0.01' },
  { id: 'gelecek-kasim', date: '2027-11-01', description: 'Gelecek yılın hareketi', type: 'Maaş Ödemesi', incoming: '900.00', outgoing: '0.00' },
]

describe('kasa özeti', () => {
  it('aylar arasında ileri ve geri geçerken başlığı, satırları ve bakiyeyi birlikte günceller', async () => {
    const user = userEvent.setup()
    render(<CashbookPage entries={entries} />)
    const summary = within(screen.getByRole('region', { name: 'Seçilen ayın kasa özeti' }))
    const table = within(screen.getByRole('table', { name: 'Kasa hareketleri' }))
    const months = within(screen.getByRole('navigation', { name: 'Kasa defteri ayları' }))
    expect(summary.getByRole('heading', { name: 'Kasım 2026 — Güncel Bakiye' })).toBeVisible()
    expect(summary.getByText('20,07 TL')).toBeVisible()
    expect(summary.getByText('20,07 TL')).toHaveClass('cashbook-balance-positive')
    expect(summary.getByText('100,10 TL')).toHaveClass('cashbook-incoming-amount')
    expect(table.getByText('100,10 TL')).toHaveClass('cashbook-incoming-amount')
    expect(table.getByText('Kasım hareketi')).toBeVisible()
    expect(table.queryByText('Aralık hareketi')).not.toBeInTheDocument()
    expect(table.queryByText('Gelecek yılın hareketi')).not.toBeInTheDocument()

    await user.click(months.getByRole('button', { name: 'Aralık 2026' }))
    expect(summary.getByRole('heading', { name: 'Aralık 2026 — Güncel Bakiye' })).toBeVisible()
    expect(summary.getByText('-0,01 TL')).toBeVisible()
    expect(summary.getByText('-0,01 TL')).toHaveClass('cashbook-balance-negative')
    expect(table.getByText('Aralık hareketi')).toBeVisible()
    expect(table.queryByText('Kasım hareketi')).not.toBeInTheDocument()

    await user.click(months.getByRole('button', { name: 'Kasım 2027' }))
    expect(summary.getByRole('heading', { name: 'Kasım 2027 — Güncel Bakiye' })).toBeVisible()
    expect(summary.getAllByText('900,00 TL')).toHaveLength(2)
    expect(table.getByText('Gelecek yılın hareketi')).toBeVisible()

    await user.click(months.getByRole('button', { name: 'Ocak 2027' }))
    expect(summary.getAllByText('0,00 TL')).toHaveLength(3)
    expect(summary.getAllByText('0,00 TL')[2]).not.toHaveClass('cashbook-balance-positive')
    expect(summary.getAllByText('0,00 TL')[2]).not.toHaveClass('cashbook-balance-negative')
    expect(table.getByRole('heading', { name: 'Henüz kasa kaydı yok' })).toBeVisible()
    await user.click(months.getByRole('button', { name: 'Kasım 2026' }))
    expect(summary.getByText('20,07 TL')).toBeVisible()
    expect(table.getByText('Kasım hareketi')).toBeVisible()
  })

  it('kayıt değişikliği ve çıkarılmasında eski bakiyeyi tutmaz', () => {
    const { rerender } = render(<CashbookPage entries={entries} />)
    const summary = within(screen.getByRole('region', { name: 'Seçilen ayın kasa özeti' }))
    expect(summary.getByText('20,07 TL')).toBeVisible()

    rerender(<CashbookPage entries={entries.map((entry) => entry.id === 'kasim' ? { ...entry, outgoing: '100.00' } : entry)} />)
    expect(summary.getByText('0,10 TL')).toBeVisible()
    rerender(<CashbookPage entries={entries.filter((entry) => entry.id !== 'kasim')} />)
    expect(summary.getAllByText('0,00 TL')).toHaveLength(3)
  })

  it('bağlanmamış veriyi sıfır bakiye gibi göstermez', () => {
    render(<CashbookPage />)
    const summary = within(screen.getByRole('region', { name: 'Seçilen ayın kasa özeti' }))
    expect(summary.getAllByText('—')).toHaveLength(3)
    expect(summary.queryByText('0,00 TL')).not.toBeInTheDocument()
    expect(summary.getByText(/gerçek bakiye hesaplanamıyor/)).toBeVisible()
  })
})
