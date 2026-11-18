import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { z } from 'zod'
import { currencies, defaultCurrency } from '../../lib/currencies'
import { tr } from '../../locales/tr'
import { paymentInputSchema, type Payment, type PaymentInput } from './payment-model'

type FormValues = { detail: string; type: string; amount: string; currency: string; dueOn: string; paidOn: string; notes: string; status: string }
type FormErrors = Partial<Record<keyof FormValues, string[]>>

export function PaymentForm({ original, onSave, onCancel }: {
  original: Payment | null
  onSave: (input: PaymentInput) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<FormValues>(original ?? {
    detail: '', type: 'invoice', amount: '', currency: defaultCurrency, dueOn: '', paidOn: '', notes: '', status: 'unpaid',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const detailInput = useRef<HTMLInputElement>(null)
  useEffect(() => { detailInput.current?.focus() }, [])

  function field(name: keyof FormValues) {
    return {
      id: `payment-${name}`,
      name,
      value: values[name],
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': errors[name] ? `payment-${name}-error` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = event.target.value
        setValues((current) => ({ ...current, [name]: value, ...(name === 'status' && value === 'unpaid' ? { paidOn: '' } : {}) }))
      },
    }
  }

  function error(name: keyof FormValues) {
    return errors[name] && <span className="form-error" id={`payment-${name}-error`}>{errors[name]?.[0]}</span>
  }

  return (
    <section className="settings-card payment-editor" aria-labelledby="payment-form-heading">
      <h2 id="payment-form-heading">{original ? 'Test Ödemesini Düzenle' : 'Test Ödemesi Ekle'}</h2>
      <p className="page-description">Yalnızca örnek bilgi girin. Bu kayıt gerçek ödeme işlemi gerçekleştirmez.</p>
      <form aria-label="Test ödeme formu" noValidate onSubmit={(event) => {
        event.preventDefault()
        const parsed = paymentInputSchema.safeParse(values)
        if (!parsed.success) {
          setErrors(z.flattenError(parsed.error).fieldErrors)
          return
        }
        setErrors({})
        onSave(parsed.data)
      }}>
        {Object.keys(errors).length > 0 && <p role="alert" className="form-error">Kaydedilemedi. İşaretli alanları kontrol edin.</p>}
        <div className="payment-form-grid">
          <label className="form-field form-wide" htmlFor="payment-detail">Ödeme detayı
            <input ref={detailInput} {...field('detail')} maxLength={200} required />
            {error('detail')}
          </label>
          <label className="form-field" htmlFor="payment-type">Ödeme türü
            <select {...field('type')}>{Object.entries(tr.payments.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            {error('type')}
          </label>
          <label className="form-field" htmlFor="payment-status">Durum
            <select {...field('status')}>{Object.entries(tr.payments.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            {error('status')}
          </label>
          <label className="form-field" htmlFor="payment-amount">Tutar
            <input {...field('amount')} inputMode="decimal" placeholder="Örn. 1250,50" required />
            <span className="field-help">Binlik ayırıcı kullanmayın; en fazla 2 ondalık basamak.</span>
            {error('amount')}
          </label>
          <label className="form-field" htmlFor="payment-currency">Para birimi
            <select {...field('currency')}>{currencies.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}</select>
            {error('currency')}
          </label>
          <label className="form-field" htmlFor="payment-dueOn">{tr.payments.dueDate}
            <input {...field('dueOn')} type="date" />
            <span className="field-help">İsteğe bağlıdır.</span>
            {error('dueOn')}
          </label>
          <label className="form-field" htmlFor="payment-paidOn">Gerçekleşen ödeme tarihi
            <input {...field('paidOn')} type="date" disabled={values.status === 'unpaid'} required={values.status === 'paid'} />
            <span className="field-help">Ödendi seçildiğinde zorunludur. Ödenmedi kayıtlarında boş bırakılır.</span>
            {error('paidOn')}
          </label>
          <label className="form-field form-wide" htmlFor="payment-notes">Açıklama
            <textarea {...field('notes')} maxLength={2000} rows={3} />
            {error('notes')}
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="button-primary">{original ? 'Değişiklikleri kaydet' : 'Test ödemesini kaydet'}</button>
          <button type="button" className="button-secondary" onClick={onCancel}>Vazgeç</button>
        </div>
      </form>
    </section>
  )
}
