import { z } from 'zod'
import { toMinorUnits } from '../payments/payment-model'

const amountSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})\.\d{2}$/, 'Tutar, en fazla 12 tam ve tam 2 ondalık basamak içermeli.')

export const cashbookEntrySchema = z.object({
  id: z.string().min(1),
  date: z.iso.date(),
  description: z.string(),
  type: z.string(),
  incoming: amountSchema,
  outgoing: amountSchema,
})

export type CashbookEntry = z.infer<typeof cashbookEntrySchema>

export function summarizeCashbookMonth(entries: readonly CashbookEntry[], period: string) {
  z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).parse(period)
  const records = z.array(cashbookEntrySchema).parse(entries)
    .filter((entry) => entry.date.slice(0, 7) === period)
  const incoming = records.reduce((sum, entry) => sum + toMinorUnits(entry.incoming), 0n)
  const outgoing = records.reduce((sum, entry) => sum + toMinorUnits(entry.outgoing), 0n)

  return { records, incoming, outgoing, balance: incoming - outgoing }
}
