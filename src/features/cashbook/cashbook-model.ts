import { z } from 'zod'
import { decimalAmountSchema, toMinorUnits } from '../payments/payment-model'

const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})\.\d{2}$/, 'Tutar, en fazla 12 tam ve tam 2 ondalık basamak içermeli.')

export const cashbookEntryTypes = [
  'Avans', 'Diğer', 'Fazla Mesai', 'Gelen Para', 'Kasa (Devir)',
  'Maaş Ödemesi', 'Mutfak Masrafı', 'Yemek', 'Yol Ücreti',
] as const
export const cashbookEntryTypeSchema = z.enum(cashbookEntryTypes)

export const cashbookEntrySchema = z.object({
  id: z.string().min(1),
  date: z.iso.date(),
  description: z.string(),
  type: cashbookEntryTypeSchema,
  incoming: amountSchema,
  outgoing: amountSchema,
})

export type CashbookEntry = z.infer<typeof cashbookEntrySchema>

export const cashbookInputSchema = z.object({
  organizationId: z.uuid('Şirket seçin.'),
  date: z.iso.date('Geçerli bir tarih girin.'),
  description: z.string().trim().min(1, 'Açıklama girin.').max(2000, 'En fazla 2000 karakter girin.'),
  type: cashbookEntryTypeSchema,
  incoming: decimalAmountSchema,
  outgoing: decimalAmountSchema,
}).superRefine((entry, context) => {
  if (!amountSchema.safeParse(entry.incoming).success || !amountSchema.safeParse(entry.outgoing).success) return
  const incoming = toMinorUnits(entry.incoming)
  const outgoing = toMinorUnits(entry.outgoing)
  if (!((incoming > 0n && outgoing === 0n) || (outgoing > 0n && incoming === 0n))) {
    context.addIssue({ code: 'custom', path: ['incoming'], message: 'Yalnızca giren veya çıkan tutarı pozitif olmalı; diğer alan sıfır olmalı.' })
  }
})

export const cashbookRecordSchema = cashbookInputSchema.safeExtend({
  id: z.uuid(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
})

export type CashbookInput = z.infer<typeof cashbookInputSchema>
export type CashbookRecord = z.infer<typeof cashbookRecordSchema>

export function summarizeCashbookMonth(entries: readonly CashbookEntry[], period: string) {
  z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).parse(period)
  const records = z.array(cashbookEntrySchema).parse(entries)
    .filter((entry) => entry.date.slice(0, 7) === period)
  const incoming = records.reduce((sum, entry) => sum + toMinorUnits(entry.incoming), 0n)
  const outgoing = records.reduce((sum, entry) => sum + toMinorUnits(entry.outgoing), 0n)

  return { records, incoming, outgoing, balance: incoming - outgoing }
}
