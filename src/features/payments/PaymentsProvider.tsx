import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { paymentInputSchema, type Payment, type PaymentInput } from './payment-model'
import {
  createPayment, deletePayment as removePayment, loadPaymentWorkspace, updatePayment,
  type Department, type Failure,
} from './payment-repository'
import { PaymentContext, type PaymentStoreStatus } from './payment-store'

const messages: Record<Failure, string> = {
  conflict: 'Kayıt başka bir kullanıcı tarafından değiştirilmiş veya silinmiş ya da bu işlem için yetkiniz yok. Değişiklik uygulanmadı; liste yenilendi. Açık düzenlemeyi iptal edip güncel kaydı yeniden açın.',
  forbidden: 'Bu işlem için yetkiniz yok. Yetki gerekiyorsa yöneticinize başvurun.',
  invalid: 'Kayıt veritabanı kurallarına uymuyor. Alanları kontrol edip yeniden deneyin.',
  incomplete: 'Tüm ödeme kayıtları yüklenemedi. Eksik tablo veya özet gösterilmiyor; lütfen yöneticinize bildirin.',
  unavailable: 'Veritabanına ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.',
}

type State = {
  status: PaymentStoreStatus
  userId: string | null
  payments: Payment[]
  departments: Department[]
  error: string | null
}

const emptyState = (status: PaymentStoreStatus): State => ({ status, userId: null, payments: [], departments: [], error: null })

export function PaymentsProvider({ client, children }: { client: SupabaseClient | null; children: ReactNode }) {
  const [state, setState] = useState<State>(() => emptyState(client ? 'loading' : 'unconfigured'))
  const [reloadKey, setReloadKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const userId = useRef<string | null>(null)

  const reload = useCallback(() => {
    setState((current) => ({ ...current, status: 'loading' }))
    setReloadKey((key) => key + 1)
  }, [])

  useEffect(() => {
    if (!client) return
    let active = true
    void loadPaymentWorkspace(client).then((result) => {
      if (!active) return
      if (result.ok) {
        userId.current = result.value.userId
        setState({ status: 'ready', error: null, ...result.value })
      } else {
        // Do not keep records from a previous load when the current one fails.
        setState({ ...emptyState('error'), error: result.reason === 'forbidden' ? 'Oturum doğrulanamadı. Yeniden giriş yapın.' : messages[result.reason] })
      }
    })
    return () => { active = false }
  }, [client, reloadKey])

  useEffect(() => {
    if (!client) return
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        userId.current = null
        setState(emptyState('loading'))
        setFeedback('')
        setActionError(null)
      } else if (session && userId.current && session.user.id !== userId.current) {
        setState(emptyState('loading'))
        setFeedback('')
        setActionError(null)
        reload()
      }
    })
    return () => subscription.unsubscribe()
  }, [client, reload])

  function fail(reason: Failure) {
    setActionError(messages[reason])
    setFeedback('')
    if (reason === 'conflict') reload()
    return false
  }

  async function savePayment(input: PaymentInput, original?: Payment): Promise<boolean> {
    if (!client || busy) return false
    const parsed = paymentInputSchema.safeParse(input)
    if (!parsed.success) return fail('invalid')
    const department = state.departments.find(({ id }) => id === (original?.departmentId ?? parsed.data.departmentId))
    if (!department?.canEdit) return fail('forbidden')

    setBusy(true)
    const result = original
      ? await updatePayment(client, original, parsed.data)
      : await createPayment(client, parsed.data, department.organizationId)
    setBusy(false)
    if (!result.ok) return fail(result.reason)

    const saved = result.value
    setActionError(null)
    setState((current) => ({
      ...current,
      payments: original ? current.payments.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.payments],
    }))
    setFeedback(original ? 'Ödeme güncellendi.' : 'Ödeme kaydedildi.')
    return true
  }

  async function deletePayment(target: Payment): Promise<boolean> {
    if (!client || busy) return false
    setBusy(true)
    const result = await removePayment(client, target)
    setBusy(false)
    if (!result.ok) return fail(result.reason)
    setActionError(null)
    setState((current) => ({ ...current, payments: current.payments.filter(({ id }) => id !== target.id) }))
    setFeedback('Ödeme silindi. Silinen kayıt denetim geçmişinde saklanır.')
    return true
  }

  return (
    <PaymentContext.Provider value={{
      status: state.status,
      payments: state.payments,
      departments: state.departments,
      canEdit: state.departments.some(({ canEdit }) => canEdit),
      busy,
      error: state.error ?? actionError,
      feedback,
      reload,
      savePayment,
      deletePayment,
    }}>
      {children}
    </PaymentContext.Provider>
  )
}
