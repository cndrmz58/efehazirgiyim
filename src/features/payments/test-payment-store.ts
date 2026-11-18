import { createContext, useContext } from 'react'
import { z } from 'zod'
import { paymentSchema, type Payment, type PaymentInput } from './payment-model'

export const testPaymentsStorageKey = 'efe:test-payments:v1'

const storedSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  payments: z.array(paymentSchema),
}).refine((value) => new Set(value.payments.map((payment) => payment.id)).size === value.payments.length)

export type StoredTestPayments = z.infer<typeof storedSchema>
export type TestPaymentState = { data: StoredTestPayments | null; raw: string | null; error: string | null }

export const emptyTestPayments = (): StoredTestPayments => ({ version: 1, enabled: false, payments: [] })

export function readTestPayments(): TestPaymentState {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(testPaymentsStorageKey)
  } catch {
    return { data: null, raw: null, error: 'Tarayıcı depolamasına erişilemiyor. Depolama iznini kontrol edip sayfayı yenileyin.' }
  }
  if (raw === null) return { data: emptyTestPayments(), raw, error: null }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { data: null, raw, error: 'Saklanan test verisi okunamıyor. Veriler otomatik silinmedi; sıfırlamak için test verilerini silin.' }
  }
  const parsed = storedSchema.safeParse(value)
  if (!parsed.success) {
    return { data: null, raw, error: 'Saklanan test verisinin biçimi geçersiz. Veriler otomatik silinmedi; sıfırlamak için test verilerini silin.' }
  }
  return { data: parsed.data, raw, error: null }
}

type TestPaymentContextValue = {
  enabled: boolean
  available: boolean
  payments: readonly Payment[]
  error: string | null
  feedback: string
  setEnabled: (enabled: boolean) => void
  savePayment: (input: PaymentInput, original?: Payment) => boolean
  deletePayment: (payment: Payment) => boolean
  clearPayments: () => void
}

export const TestPaymentContext = createContext<TestPaymentContextValue | null>(null)

export function useTestPayments() {
  const context = useContext(TestPaymentContext)
  if (!context) throw new Error('Test ödeme sağlayıcısı bulunamadı.')
  return context
}
