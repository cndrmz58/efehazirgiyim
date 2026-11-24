import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { z } from 'zod'
import { tr } from '../../locales/tr'
import { TurkishDateInput } from '../payments/TurkishDateInput'
import { cashbookEntryTypes, cashbookInputSchema, type CashbookInput, type CashbookRecord } from './cashbook-model'
import type { CashbookOrganization } from './cashbook-repository'

export function CashbookForm({ original, organization, period, busy, onSave, onCancel }: {
  original: CashbookRecord | null
  organization: CashbookOrganization
  period: string
  busy: boolean
  onSave: (input: CashbookInput) => void
  onCancel: () => void
}) {
  const text = tr.cashbook
  type FormValues = Omit<CashbookInput, 'type'> & { type: string }
  const [values, setValues] = useState<FormValues>(original ?? {
    organizationId: organization.id, date: `${period}-01`, description: '', type: '', incoming: '0', outgoing: '0',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof CashbookInput, string[]>>>({})
  const firstInput = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { firstInput.current?.focus() }, [])

  function field(name: 'description' | 'incoming' | 'outgoing') {
    return {
      id: `cashbook-${name}`, value: values[name],
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': errors[name] ? `cashbook-${name}-error` : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [name]: event.target.value }),
    }
  }
  function error(name: keyof CashbookInput) {
    return errors[name] && <span className="form-error" id={`cashbook-${name}-error`}>{errors[name]?.[0]}</span>
  }

  return <section className="settings-card payment-editor" aria-labelledby="cashbook-form-heading">
    <h2 id="cashbook-form-heading">{original ? text.edit : text.add}</h2>
    <p className="field-help">{organization.name} — {text.formRule}</p>
    <form aria-label={text.form} aria-busy={busy} noValidate onSubmit={(event) => {
      event.preventDefault()
      const parsed = cashbookInputSchema.safeParse(values)
      if (!parsed.success) {
        setErrors(z.flattenError(parsed.error).fieldErrors)
      } else if (parsed.data.date.slice(0, 7) !== period) {
        setErrors({ date: [text.datePeriodError] })
      } else {
        setErrors({})
        onSave(parsed.data)
      }
    }}>
      {Object.keys(errors).length > 0 && <p className="form-error" role="alert">{text.validationError}</p>}
      <fieldset disabled={busy} className="payment-form-grid">
        <label className="form-field form-wide" htmlFor="cashbook-description">{text.descriptionColumn}
          <textarea ref={firstInput} {...field('description')} maxLength={2000} required rows={2} />
          {error('description')}
        </label>
        <div className="form-field">
          <label htmlFor="cashbook-date">{text.date}</label>
          <TurkishDateInput id="cashbook-date" name="date" label={text.date} value={values.date} required
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? 'cashbook-date-error cashbook-date-help' : 'cashbook-date-help'}
            onChange={(date) => setValues({ ...values, date })} />
          <span className="field-help" id="cashbook-date-help">{text.datePeriodHelp}</span>
          {error('date')}
        </div>
        <label className="form-field" htmlFor="cashbook-type">{text.type}
          <select id="cashbook-type" value={values.type} required
            aria-invalid={Boolean(errors.type)}
            aria-describedby={errors.type ? 'cashbook-type-error' : undefined}
            onChange={(event) => setValues({ ...values, type: event.target.value })}>
            <option value="">{text.typePlaceholder}</option>
            {cashbookEntryTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          {error('type')}
        </label>
        <label className="form-field" htmlFor="cashbook-incoming">{text.incoming}
          <input {...field('incoming')} inputMode="decimal" required />
          {error('incoming')}
        </label>
        <label className="form-field" htmlFor="cashbook-outgoing">{text.outgoing}
          <input {...field('outgoing')} inputMode="decimal" required />
          {error('outgoing')}
        </label>
      </fieldset>
      <div className="form-actions">
        <button className="button-primary" type="submit" disabled={busy}>{busy ? text.saving : text.save}</button>
        <button className="button-secondary" type="button" disabled={busy} onClick={onCancel}>{text.cancel}</button>
      </div>
    </form>
  </section>
}
