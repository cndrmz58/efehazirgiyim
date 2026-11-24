import { describe, expect, it } from 'vitest'
import { summarizeCashbookMonth, type CashbookEntry } from './cashbook-model'

const entry = (id: string, date: string, incoming: string, outgoing: string): CashbookEntry => ({
  id, date, incoming, outgoing, description: id, type: '',
})

const entries = [
  entry('onceki-ay', '2026-10-31', '9999.99', '0.00'),
  entry('kasim-ilk', '2026-11-01', '100.10', '0.00'),
  entry('kasim-son', '2026-11-30', '0.20', '80.03'),
  entry('aralik-ilk', '2026-12-01', '1000.00', '0.00'),
  entry('aralik-son', '2026-12-31', '0.00', '1000.00'),
  entry('ocak', '2027-01-01', '0.10', '0.30'),
  entry('diger-yil', '2027-11-01', '900.00', '0.00'),
]

describe('aylık kasa bakiyesi', () => {
  it.each([
    ['2026-11', 10030n, 8003n, 2027n, ['kasim-ilk', 'kasim-son']],
    ['2026-12', 100000n, 100000n, 0n, ['aralik-ilk', 'aralik-son']],
    ['2027-01', 10n, 30n, -20n, ['ocak']],
    ['2027-11', 90000n, 0n, 90000n, ['diger-yil']],
    ['2027-02', 0n, 0n, 0n, []],
  ] as const)('yalnızca %s kayıtlarını hesaplar ve ters denklemle doğrular', (period, incoming, outgoing, balance, ids) => {
    const result = summarizeCashbookMonth(entries, period)
    expect(result).toMatchObject({ incoming, outgoing, balance })
    expect(result.records.map(({ id }) => id)).toEqual(ids)
    expect(result.balance + outgoing).toBe(incoming)
    expect(incoming - result.balance).toBe(outgoing)
    expect(summarizeCashbookMonth([...entries].reverse(), period).balance).toBe(balance)
  })

  it('büyük toplamları kayan nokta veya güvenli tamsayı sınırına takılmadan hesaplar', () => {
    const records = Array.from({ length: 100 }, (_, index) =>
      entry(String(index), '2026-11-24', '999999999999.99', '0.01'))
    expect(summarizeCashbookMonth(records, '2026-11')).toMatchObject({
      incoming: 9999999999999900n, outgoing: 100n, balance: 9999999999999800n,
    })
  })

  it('geçersiz tarih, dönem ve tutarları sessizce toplamaya dahil etmez', () => {
    expect(() => summarizeCashbookMonth([entry('hata', '2026-11-31', '1.00', '0.00')], '2026-11')).toThrow()
    expect(() => summarizeCashbookMonth([], '2026-13')).toThrow()
    for (const amount of ['0.001', '-1.00', '1,00', 'abc']) {
      expect(() => summarizeCashbookMonth([entry('hata', '2026-11-24', amount, '0.00')], '2026-11')).toThrow()
    }
  })
})
