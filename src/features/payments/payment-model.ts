import { z } from 'zod'
import { currencies, type CurrencyCode } from '../../lib/currencies'

const decimalAmountSchema = z.string().trim()
  .regex(/^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,2})?$/, 'En fazla 12 tam ve 2 ondalık basamak girin; binlik ayırıcı kullanmayın.')
  .transform((value) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.')
    return `${whole}.${fraction.padEnd(2, '0')}`
  })
const amountSchema = decimalAmountSchema.refine((value) => BigInt(value.replace('.', '')) > 0n, 'Tutar sıfırdan büyük olmalı.')

const optionalDate = z.union([z.literal(''), z.iso.date('Geçerli bir tarih girin.')])

function canonicalMinorUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(value)) return null
  return BigInt(value.replace('.', ''))
}

const paymentFields = z.object({
  organizationId: z.uuid('Şirket seçin.'),
  detail: z.string().trim().min(1, 'Ödeme detayını girin.').max(200, 'En fazla 200 karakter girin.'),
  type: z.enum(['tax', 'credit', 'invoice', 'salary', 'insurance', 'rent', 'other']),
  paymentMethod: z.enum(['check', 'cash', 'bank']),
  amount: amountSchema,
  remainingAmount: decimalAmountSchema,
  currency: z.enum(['TRY', 'EUR', 'USD']),
  dueOn: optionalDate.default(''),
  paidOn: optionalDate,
  notes: z.string().trim().max(2000, 'En fazla 2000 karakter girin.'),
  status: z.enum(['paid', 'unpaid', 'partially_paid']),
})

const checkPayment = (payment: {
  amount: string
  remainingAmount: string
  status: 'paid' | 'unpaid' | 'partially_paid'
  paidOn: string
}, context: z.RefinementCtx) => {
  const amount = canonicalMinorUnits(payment.amount)
  const remainingAmount = canonicalMinorUnits(payment.remainingAmount)

  if (amount !== null && remainingAmount !== null && remainingAmount > amount) {
    context.addIssue({ code: 'custom', path: ['remainingAmount'], message: 'Kalan tutar, toplam tutardan büyük olamaz.' })
  }
  if (payment.status === 'paid' && !payment.paidOn) {
    context.addIssue({ code: 'custom', path: ['paidOn'], message: 'Ödenen kayıt için gerçekleşen ödeme tarihini girin.' })
  }
  if (payment.status === 'unpaid' && payment.paidOn) {
    context.addIssue({ code: 'custom', path: ['paidOn'], message: 'Ödenmemiş kayıtta gerçekleşen ödeme tarihi boş olmalı.' })
  }
  if (payment.status === 'paid' && remainingAmount !== null && remainingAmount !== 0n) {
    context.addIssue({ code: 'custom', path: ['remainingAmount'], message: 'Ödendi durumunda kalan tutar sıfır olmalı.' })
  }
  if (payment.status === 'partially_paid' && amount !== null && remainingAmount !== null &&
    (remainingAmount === 0n || remainingAmount >= amount)) {
    context.addIssue({ code: 'custom', path: ['remainingAmount'], message: 'Kısmen ödendi durumunda kalan tutar sıfırdan büyük ve toplam tutardan küçük olmalı.' })
  }
}

export const paymentInputSchema = paymentFields.superRefine(checkPayment)
export const paymentSchema = paymentFields.extend({
  paymentMethod: z.enum(['check', 'cash', 'bank']).nullable(),
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
}).superRefine(checkPayment)

export type PaymentInput = z.infer<typeof paymentInputSchema>
export type Payment = z.infer<typeof paymentSchema>

export function toMinorUnits(amount: string): bigint {
  return BigInt(amount.replace('.', ''))
}

export function formatMoney(minorUnits: bigint, currency: CurrencyCode): string {
  const whole = new Intl.NumberFormat('tr-TR').format(minorUnits / 100n)
  const fraction = (minorUnits % 100n).toString().padStart(2, '0')
  return `${whole},${fraction} ${currency === 'TRY' ? 'TL' : currency}`
}

export function summarizePayments(payments: readonly Payment[]) {
  return currencies.map(({ code, label }) => {
    const records = payments.filter((payment) => payment.currency === code)
    const total = records.reduce((sum, payment) => sum + toMinorUnits(payment.amount), 0n)
    const remaining = records.reduce((sum, payment) => sum + toMinorUnits(payment.remainingAmount), 0n)
    const paid = total - remaining
    const paidRecords = records.filter((payment) => payment.status === 'paid')
    const partiallyPaidRecords = records.filter((payment) => payment.status === 'partially_paid')
    const unpaidRecords = records.filter((payment) => payment.status === 'unpaid')
    const latestPaidOn = records.filter((payment) => payment.status !== 'unpaid' && payment.paidOn).reduce<string | null>(
      (latest, { paidOn }) => latest === null || paidOn > latest ? paidOn : latest, null,
    )
    // Round to the nearest tenth of a percent before converting the bounded ratio to a number.
    const paidRatio = total === 0n ? null : Number((paid * 1000n + total / 2n) / total) / 1000
    return {
      code, label, count: records.length, total, paid, unpaid: remaining,
      paidCount: paidRecords.length, partiallyPaidCount: partiallyPaidRecords.length,
      unpaidCount: unpaidRecords.length, paidRatio, latestPaidOn,
    }
  })
}

export function summarizePaidByPeriod(
  payments: readonly Payment[],
  filters: { currency: CurrencyCode; year: string; month: string },
) {
  const totals = new Map<string, bigint>()
  for (const payment of payments) {
    if (
      payment.currency !== filters.currency ||
      payment.status === 'unpaid' ||
      !payment.paidOn ||
      (filters.year && !payment.paidOn.startsWith(`${filters.year}-`)) ||
      (filters.month && payment.paidOn.slice(5, 7) !== filters.month)
    ) continue

    const paid = toMinorUnits(payment.amount) - toMinorUnits(payment.remainingAmount)
    if (paid <= 0n) continue
    const period = filters.year ? payment.paidOn.slice(0, 7) : payment.paidOn.slice(0, 4)
    totals.set(period, (totals.get(period) ?? 0n) + paid)
  }

  if (filters.year && !filters.month) {
    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0')
      const period = `${filters.year}-${month}`
      return { period, amount: totals.get(period) ?? 0n }
    })
  }

  return [...totals].sort(([left], [right]) => left.localeCompare(right))
    .map(([period, amount]) => ({ period, amount }))
}

export function filterPayments(payments: readonly Payment[], filters: { query: string; type: string; status: string; currency: string; year: string; month: string }) {
  const query = filters.query.trim().toLocaleLowerCase('tr-TR')
  return payments.filter((payment) =>
    (!filters.type || payment.type === filters.type) &&
    (!filters.status || payment.status === filters.status) &&
    (!filters.currency || payment.currency === filters.currency) &&
    (!filters.year || payment.dueOn.startsWith(`${filters.year}-`)) &&
    (!filters.month || payment.dueOn.slice(5, 7) === filters.month) &&
    (!query || `${payment.detail} ${payment.notes}`.toLocaleLowerCase('tr-TR').includes(query)),
  )
}

export function localIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

export type DueBucket = {
  count: number
  totals: { code: CurrencyCode; amount: bigint }[]
}

/** Vade tarihi girilmiş açık (ödenmemiş/kısmi) kayıtları gecikmiş ve yaklaşan olarak kalan tutarlarıyla özetler. */
export function summarizeDue(payments: readonly Payment[], today: string, horizonDays = 30): { overdue: DueBucket; upcoming: DueBucket } {
  const horizon = addDays(today, horizonDays)
  const open = payments.filter((payment) => payment.status !== 'paid' && payment.dueOn)
  const bucket = (records: readonly Payment[]): DueBucket => ({
    count: records.length,
    totals: currencies
      .map(({ code }) => ({
        code,
        amount: records.filter((payment) => payment.currency === code)
          .reduce((sum, payment) => sum + toMinorUnits(payment.remainingAmount), 0n),
      }))
      .filter(({ amount }) => amount > 0n),
  })
  return {
    overdue: bucket(open.filter((payment) => payment.dueOn < today)),
    upcoming: bucket(open.filter((payment) => payment.dueOn >= today && payment.dueOn <= horizon)),
  }
}
