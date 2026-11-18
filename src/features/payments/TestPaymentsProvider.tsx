import { useEffect, useState, type ReactNode } from 'react'
import { paymentInputSchema, type Payment, type PaymentInput } from './payment-model'
import {
  emptyTestPayments, readTestPayments, TestPaymentContext, testPaymentsStorageKey,
  type StoredTestPayments,
} from './test-payment-store'

export function TestPaymentsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readTestPayments)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (event.key === testPaymentsStorageKey || event.key === null) {
        setState(readTestPayments())
        setFeedback('Test verileri başka bir sekmede değiştirildi; görünüm güncellendi.')
      }
    }
    window.addEventListener('storage', synchronize)
    return () => window.removeEventListener('storage', synchronize)
  }, [])

  function fail(message: string) {
    setState((current) => ({ ...current, error: message }))
    setFeedback('')
    return false
  }

  function commit(data: StoredTestPayments, message: string): boolean {
    const raw = JSON.stringify(data)
    try {
      if (window.localStorage.getItem(testPaymentsStorageKey) !== state.raw) {
        return fail('Test verileri başka bir sekmede değişti. Üzerine yazılmadı; sayfayı yenileyin.')
      }
      window.localStorage.setItem(testPaymentsStorageKey, raw)
    } catch {
      return fail('Test verileri kaydedilemedi. Tarayıcı depolaması dolu veya erişim engelli olabilir; değişiklik uygulanmadı.')
    }
    setState({ data, raw, error: null })
    setFeedback(message)
    return true
  }

  function setEnabled(enabled: boolean) {
    if (!state.data) return
    commit({ ...state.data, enabled }, enabled ? 'Test modu açıldı. Yalnızca örnek veri girin.' : 'Test modu kapatıldı. Test kayıtları bu tarayıcıda saklanmaya devam ediyor.')
  }

  function savePayment(input: PaymentInput, original?: Payment): boolean {
    if (!state.data?.enabled) return fail('Kayıt eklemek veya düzenlemek için test modunu açın.')
    const parsed = paymentInputSchema.safeParse(input)
    if (!parsed.success) return fail('Test kaydı geçersiz. Form alanlarını kontrol edin.')
    const payments = state.data.payments
    if (original && !payments.some((payment) => payment.id === original.id && payment.revision === original.revision)) {
      return fail('Bu kayıt değişmiş veya silinmiş. Düzenlemeyi iptal edip güncel kaydı yeniden açın.')
    }
    const now = new Date().toISOString()
    const payment: Payment = {
      ...parsed.data,
      id: original?.id ?? crypto.randomUUID(),
      createdAt: original?.createdAt ?? now,
      updatedAt: now,
      revision: (original?.revision ?? 0) + 1,
    }
    return commit({
      ...state.data,
      payments: original ? payments.map((item) => item.id === original.id ? payment : item) : [payment, ...payments],
    }, original ? 'Test ödemesi güncellendi.' : 'Test ödemesi bu tarayıcıya kaydedildi.')
  }

  function deletePayment(target: Payment) {
    if (!state.data?.enabled) {
      return fail('Kayıt silmek için test modunu açın.')
    }
    if (!state.data.payments.some((payment) => payment.id === target.id && payment.revision === target.revision)) {
      return fail('Silinecek kayıt değişmiş veya silinmiş. Güncel görünümü kontrol edin.')
    }
    return commit({ ...state.data, payments: state.data.payments.filter((payment) => payment.id !== target.id) }, 'Test ödemesi silindi.')
  }

  function clearPayments() {
    try {
      window.localStorage.removeItem(testPaymentsStorageKey)
    } catch {
      fail('Test verileri silinemedi. Tarayıcı depolama iznini kontrol edin.')
      return
    }
    setState({ data: emptyTestPayments(), raw: null, error: null })
    setFeedback('Tüm test verileri silindi ve test modu kapatıldı.')
  }

  return (
    <TestPaymentContext.Provider value={{
      enabled: state.data?.enabled ?? false,
      available: state.data !== null,
      payments: state.data?.payments ?? [],
      error: state.error,
      feedback,
      setEnabled,
      savePayment,
      deletePayment,
      clearPayments,
    }}>
      {children}
    </TestPaymentContext.Provider>
  )
}
