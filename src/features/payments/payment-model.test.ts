import { describe, expect, it } from 'vitest'
import { filterPayments, formatMoney, paymentInputSchema, paymentSchema, summarizePayments } from './payment-model'

const draft = { departmentId: '00000000-0000-4000-8000-000000000021', detail: 'Örnek test', type: 'invoice', amount: '0,10', currency: 'TRY', paidOn: '', notes: '', status: 'unpaid' }

function payment(overrides: Record<string, unknown> = {}) {
  return paymentSchema.parse({
    ...draft, id: crypto.randomUUID(), organizationId: '00000000-0000-4000-8000-000000000011', createdAt: '2026-11-18T12:00:00Z', updatedAt: '2026-11-18T12:00:00Z', revision: 1, ...overrides,
  })
}

describe('ödeme doğrulaması ve özetleri', () => {
  it.each(['0', '-1', '1.005', '1.000,00', 'abc', '1e3', '1000000000000'])('geçersiz tutarı reddeder: %s', (amount) => {
    expect(paymentInputSchema.safeParse({ ...draft, amount }).success).toBe(false)
  })

  it('gerçekleşen tarihi yalnızca ödenen kayıtta zorunlu tutar ve takvim tarihini doğrular', () => {
    expect(paymentInputSchema.safeParse({ ...draft, status: 'paid' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, paidOn: '2026-11-18' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, status: 'paid', paidOn: '2026-02-30' }).success).toBe(false)
    expect(paymentInputSchema.safeParse({ ...draft, status: 'paid', paidOn: '2026-11-18' }).success).toBe(true)
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
    expect(filterPayments(records, { query: 'işlemi örnek', type: 'invoice', status: 'unpaid', currency: 'TRY' })).toEqual([matching])
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
})
