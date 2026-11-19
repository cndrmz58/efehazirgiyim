import { z } from 'zod'
import { currencies, type CurrencyCode } from '../../lib/currencies'

const amountSchema = z.string().trim()
  .regex(/^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,2})?$/, 'En fazla 12 tam ve 2 ondalık basamak girin; binlik ayırıcı kullanmayın.')
  .transform((value) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.')
    return `${whole}.${fraction.padEnd(2, '0')}`
  })
  .refine((value) => BigInt(value.replace('.', '')) > 0n, 'Tutar sıfırdan büyük olmalı.')

const optionalDate = z.union([z.literal(''), z.iso.date('Geçerli bir tarih girin.')])

const paymentFields = z.object({
  organizationId: z.uuid('Şirket seçin.'),
  detail: z.string().trim().min(1, 'Ödeme detayını girin.').max(200, 'En fazla 200 karakter girin.'),
  type: z.enum(['tax', 'credit', 'invoice', 'salary', 'insurance', 'rent', 'other']),
  paymentMethod: z.enum(['check', 'cash', 'bank']),
  amount: amountSchema,
  currency: z.enum(['TRY', 'EUR', 'USD']),
  dueOn: optionalDate.default(''),
  paidOn: optionalDate,
  notes: z.string().trim().max(2000, 'En fazla 2000 karakter girin.'),
  status: z.enum(['paid', 'unpaid']),
})

const checkPaymentDate = (payment: { status: 'paid' | 'unpaid'; paidOn: string }, context: z.RefinementCtx) => {
  if (payment.status === 'paid' && !payment.paidOn) {
    context.addIssue({ code: 'custom', path: ['paidOn'], message: 'Ödenen kayıt için gerçekleşen ödeme tarihini girin.' })
  }
  if (payment.status === 'unpaid' && payment.paidOn) {
    context.addIssue({ code: 'custom', path: ['paidOn'], message: 'Ödenmemiş kayıtta gerçekleşen ödeme tarihi boş olmalı.' })
  }
}

export const paymentInputSchema = paymentFields.superRefine(checkPaymentDate)
export const paymentSchema = paymentFields.extend({
  paymentMethod: z.enum(['check', 'cash', 'bank']).nullable(),
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive(),
}).superRefine(checkPaymentDate)

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
    const paidRecords = records.filter((payment) => payment.status === 'paid')
    const paid = paidRecords.reduce((sum, payment) => sum + toMinorUnits(payment.amount), 0n)
    const latestPaidOn = paidRecords.reduce<string | null>(
      (latest, { paidOn }) => latest === null || paidOn > latest ? paidOn : latest, null,
    )
    // Round to the nearest tenth of a percent before converting the bounded ratio to a number.
    const paidRatio = total === 0n ? null : Number((paid * 1000n + total / 2n) / total) / 1000
    return { code, label, count: records.length, total, paid, unpaid: total - paid, paidCount: paidRecords.length, paidRatio, latestPaidOn }
  })
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
