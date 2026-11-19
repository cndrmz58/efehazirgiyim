import { describe, expect, it } from 'vitest'
import { filterPayments, formatMoney, paymentInputSchema, paymentSchema, summarizePaidByPeriod, summarizePayments } from './payment-model'

const draft = { organizationId: '00000000-0000-4000-8000-000000000011', detail: 'Örnek test', type: 'invoice', paymentMethod: 'bank', amount: '0,10', remainingAmount: '0,10', currency: 'TRY', paidOn: '', notes: '', status: 'unpaid' }

function payment(overrides: Record<string, unknown> = {}) {
  const amount = overrides.amount ?? draft.amount
  const status = overrides.status ?? draft.status
  return paymentSchema.parse({
    ...draft,
    amount,
    remainingAmount: overrides.remainingAmount ?? (status === 'paid' ? '0.00' : amount),
    id: crypto.randomUUID(), createdAt: '2026-11-18T12:00:00Z', updatedAt: '2026-11-18T12:00:00Z', revision: 1, ...overrides,
  })
}

describe('ödeme doğrulaması ve özetleri', () => {
  it.each(['0', '-1', '1.005', '1.000,00', 'abc', '1e3', '1000000000000'])('geçersiz tutarı reddeder: %s', (amount) => {
    expect(paymentInputSchema.safeParse({ ...draft, amount }).success).toBe(false)
  })

  it('ödeme şekli seçimini zorunlu tutar ve eski kayıtların bilinmeyen şeklini kabul eder', () => {
    expect(paymentInputSchema.safeParse({ ...draft, paymentMethod: '' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, paymentMethod: 'transfer' }).success).toBe(false)
    expect(paymentSchema.safeParse({
      ...draft, paymentMethod: null, id: crypto.randomUUID(), createdAt: '2026-11-18T12:00:00Z',
      updatedAt: '2026-11-18T12:00:00Z', revision: 1,
    }).success).toBe(true)
  })

  it('gerçekleşen tarihi yalnızca ödenen kayıtta zorunlu tutar ve takvim tarihini doğrular', () => {
    expect(paymentInputSchema.safeParse({ ...draft, status: 'paid' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, paidOn: '2026-11-18' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, status: 'paid', paidOn: '2026-02-30' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, remainingAmount: '0', status: 'paid', paidOn: '2026-11-18' }).success).toBe(true)
  })

  it('kalan tutarı toplamla sınırlar ve kısmi durumu yalnızca pozitif ara bakiyede kabul eder', () => {
    expect(paymentInputSchema.safeParse({ ...draft, amount: '100', remainingAmount: '20', status: 'partially_paid' }).success).toBe(true)
    expect(paymentInputSchema.safeParse({ ...draft, amount: '100', remainingAmount: '0', status: 'partially_paid' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, amount: '100', remainingAmount: '101' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, amount: '100', remainingAmount: '0' }).success).toBe(true)
    expect(paymentInputSchema.safeParse({ ...draft, amount: '100', remainingAmount: '1', status: 'paid', paidOn: '2026-11-18' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, amount: '100', remainingAmount: '0', status: 'paid', paidOn: '2026-11-18' }).success).toBe(true)
  })

  it('eski kayıtları vadesiz açar ve girilen vadeyi durumdan bağımsız doğrular', () => {
    expect(payment().dueOn).toBe('')
    expect(payment({ dueOn: '2026-11-30' })).toMatchObject({ dueOn: '2026-11-30', status: 'unpaid', paidOn: '' })
    expect(paymentInputSchema.safeParse({ ...draft, dueOn: '2026-02-30' }).success).toBe(false)
  })

  it('ondalıkları kesin toplar; para birimlerini ve durumları birbirine karıştırmaz', () => {
    const records = [
      payment({ amount: '0,10', status: 'paid', paidOn: '2026-11-18' }),
      payment({ amount: '0.20' }),
      payment({ amount: '999999999999.99', currency: 'EUR' }),
      payment({ amount: '7.50', currency: 'USD', status: 'paid', paidOn: '2026-11-18' }),
    ]
    const [trySummary, eurSummary, usdSummary] = summarizePayments(records)
    expect(trySummary).toMatchObject({ total: 30n, paid: 10n, unpaid: 20n, count: 2 })
    expect(eurSummary).toMatchObject({ total: 99999999999999n, paid: 0n, unpaid: 99999999999999n })
    expect(usdSummary).toMatchObject({ total: 750n, paid: 750n, unpaid: 0n })
    expect(formatMoney(30n, 'TRY')).toBe('0,30 TL')
    expect(formatMoney(99999999999999n, 'EUR')).toBe('999.999.999.999,99 EUR')
  })

  it('Türkçe aramayı tür, durum ve para birimi filtreleriyle birleştirir', () => {
    const matching = payment({ detail: 'FATURA İŞLEMİ', notes: 'ÖRNEK', type: 'invoice' })
    const records = [matching, payment({ detail: 'FATURA İŞLEMİ', currency: 'EUR' }), payment({ type: 'tax' })]
    expect(filterPayments(records, { query: 'işlemi örnek', type: 'invoice', status: 'unpaid', currency: 'TRY', year: '', month: '' })).toEqual([matching])
  })

  it('vade yılı ve ayını birlikte veya ayrı ayrı filtreler; vadesiz kayıtları tarih seçilince hariç tutar', () => {
    const november2025 = payment({ detail: 'Kasım 2025', dueOn: '2025-11-30' })
    const november2026 = payment({ detail: 'Kasım 2026', dueOn: '2026-11-30' })
    const october2025 = payment({ detail: 'Ekim 2025', dueOn: '2025-10-30' })
    const noDueDate = payment({ detail: 'Vadesiz' })
    const records = [november2025, november2026, october2025, noDueDate]
    const commonFilters = { query: '', type: '', status: '', currency: '', year: '', month: '' }

    expect(filterPayments(records, { ...commonFilters, year: '2025' })).toEqual([november2025, october2025])
    expect(filterPayments(records, { ...commonFilters, month: '11' })).toEqual([november2025, november2026])
    expect(filterPayments(records, { ...commonFilters, year: '2025', month: '11' })).toEqual([november2025])
  })

  it('ödenen tutar oranını ve en son gerçekleşen tarihi para birimine göre hesaplar', () => {
    const records = [
      payment({ amount: '0,01', status: 'paid', paidOn: '2026-11-18' }),
      payment({ amount: '0,01', status: 'paid', paidOn: '2026-11-17' }),
      payment({ amount: '0,04' }),
      payment({ amount: '1', currency: 'EUR' }),
    ]
    const [trySummary, eurSummary, usdSummary] = summarizePayments(records)

    expect(trySummary).toMatchObject({ paidCount: 2, paidRatio: 0.333, latestPaidOn: '2026-11-18' })
    expect(eurSummary).toMatchObject({ paidCount: 0, paidRatio: 0, latestPaidOn: null })
    expect(usdSummary).toMatchObject({ paidCount: 0, paidRatio: null, latestPaidOn: null })
  })

  it('kısmi ödemelerde ödenen ve kalan tutarları bakiyeden hesaplar, durum sayılarını ayrı tutar', () => {
    const partial = payment({
      amount: '100',
      remainingAmount: '20',
      status: 'partially_paid',
      paidOn: '2026-11-18',
    })
    const [trySummary] = summarizePayments([partial])

    expect(trySummary).toMatchObject({
      total: 10000n,
      paid: 8000n,
      unpaid: 2000n,
      paidCount: 0,
      partiallyPaidCount: 1,
      unpaidCount: 0,
      paidRatio: 0.8,
      latestPaidOn: '2026-11-18',
    })
  })

  it('ödenen tutarı gerçekleşen tarihe göre aylık veya yıllık gruplar; dövizleri ve vadesiz ödemeleri karıştırmaz', () => {
    const records = [
      payment({ amount: '100', remainingAmount: '0', status: 'paid', paidOn: '2026-01-15', dueOn: '2025-12-15' }),
      payment({ amount: '100', remainingAmount: '40', status: 'partially_paid', paidOn: '2026-01-20' }),
      payment({ amount: '75', remainingAmount: '0', status: 'paid', paidOn: '2026-02-01' }),
      payment({ amount: '60', remainingAmount: '0', status: 'paid', paidOn: '2025-01-01', currency: 'EUR' }),
      payment({ amount: '50', status: 'unpaid', dueOn: '2026-01-01' }),
    ]

    expect(summarizePaidByPeriod(records, { currency: 'TRY', year: '2026', month: '' }))
      .toEqual(Array.from({ length: 12 }, (_, index) => ({
        period: `2026-${String(index + 1).padStart(2, '0')}`,
        amount: index === 0 ? 16000n : index === 1 ? 7500n : 0n,
      })))
    expect(summarizePaidByPeriod(records, { currency: 'TRY', year: '', month: '' }))
      .toEqual([{ period: '2026', amount: 23500n }])
    expect(summarizePaidByPeriod(records, { currency: 'TRY', year: '', month: '01' }))
      .toEqual([{ period: '2026', amount: 16000n }])
    expect(summarizePaidByPeriod(records, { currency: 'EUR', year: '', month: '' }))
      .toEqual([{ period: '2025', amount: 6000n }])
  })
})
