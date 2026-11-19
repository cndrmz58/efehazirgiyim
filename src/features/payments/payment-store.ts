import { createContext, useContext } from 'react'
import type { Payment, PaymentInput } from './payment-model'
import type { PaymentOrganization } from './payment-repository'

export type PaymentStoreStatus = 'unconfigured' | 'loading' | 'ready' | 'error'

export type PaymentStore = {
  status: PaymentStoreStatus
  payments: readonly Payment[]
  organizations: readonly PaymentOrganization[]
  canEdit: boolean
  busy: boolean
  error: string | null
  feedback: string
  reload: () => void
  savePayment: (input: PaymentInput, original?: Payment) => Promise<boolean>
  deletePayment: (payment: Payment) => Promise<boolean>
}

export const PaymentContext = createContext<PaymentStore | null>(null)

export function usePayments() {
  const context = useContext(PaymentContext)
  if (!context) throw new Error('Ödeme sağlayıcısı bulunamadı.')
  return context
}
