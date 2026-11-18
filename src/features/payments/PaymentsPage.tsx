import { ArrowDownUp, Plus, Search, Table2 } from 'lucide-react'
import { useState } from 'react'
import { currencies, defaultCurrency } from '../../lib/currencies'
import { tr } from '../../locales/tr'
import { PaymentForm } from './PaymentForm'
import { filterPayments, formatMoney, toMinorUnits, type Payment, type PaymentInput } from './payment-model'
import { useTestPayments } from './test-payment-store'

const labels = tr.payments

function displayDate(date: string) {
  return date ? <time dateTime={date}>{date.split('-').reverse().join('.')}</time> : '—'
}

export function PaymentsPage() {
  const store = useTestPayments()
  const [editor, setEditor] = useState<Payment | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [currency, setCurrency] = useState<string>(defaultCurrency)
  const filtered = Boolean(query || type || status || currency !== defaultCurrency)
  const payments = store.enabled ? store.payments : []
  const visible = filterPayments(payments, { query, type, status, currency })

  function clearFilters() {
    setQuery('')
    setType('')
    setStatus('')
    setCurrency(defaultCurrency)
  }

  function save(input: PaymentInput) {
    if (store.savePayment(input, editor && editor !== 'new' ? editor : undefined)) {
      setEditor(null)
      clearFilters()
      setCurrency(input.currency)
    }
  }

  function actions(payment: Payment) {
    return (
      <div className="row-actions">
        <button type="button" className="button-text" aria-label={`Ödemeyi düzenle: ${payment.detail}`} onClick={() => setEditor(payment)}>Düzenle</button>
        <button type="button" className="button-text danger-text" aria-label={`Ödemeyi sil: ${payment.detail}`} onClick={() => {
          if (window.confirm(`“${payment.detail}” test ödemesi silinsin mi?`) && store.deletePayment(payment)) {
            if (editor !== 'new' && editor?.id === payment.id) setEditor(null)
          }
        }}>Sil</button>
      </div>
    )
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">ÖDEME TAKİBİ</p>
          <h1>{labels.title}</h1>
          <p className="page-description">{labels.description}</p>
        </div>
        <div>
          <button type="button" className="button-primary" disabled={!store.enabled || !store.available} aria-describedby="entry-unavailable" onClick={() => setEditor('new')}>
            <Plus size={18} aria-hidden="true" /> Test Ödemesi Ekle
          </button>
          <p id="entry-unavailable" className="entry-help">{store.enabled ? 'Yalnızca bu tarayıcıya kaydedilir' : 'Kayıt girişi için test modunu açın'}</p>
        </div>
      </header>

      {store.enabled && store.available && editor !== null && (
        <PaymentForm key={editor === 'new' ? 'new' : editor.id} original={editor === 'new' ? null : editor} onSave={save} onCancel={() => setEditor(null)} />
      )}

      {!store.available ? <section className="settings-card"><h2>Test kayıtları yüklenemedi</h2><p className="page-description">Yukarıdaki depolama hatasını giderin. Mevcut verilerin üzerine yazılmadı.</p></section> : (
      <section className="table-card" aria-label="Ödeme kayıtları">
        <div className="table-card-heading">
          <div className="flex items-center gap-3">
            <h2>Ödeme Tablosu</h2>
            <span className="record-count">{visible.length} / {payments.length} test kaydı</span>
          </div>
          <span className="table-hint"><ArrowDownUp size={15} aria-hidden="true" /> Elle giriş</span>
        </div>

        <form className="table-filters" role="search" aria-label="Ödemeleri filtrele" onSubmit={(event) => event.preventDefault()}>
          <label className="search-field">
            <span className="sr-only">Ödeme ara</span>
            <Search size={18} aria-hidden="true" />
            <input type="search" placeholder="Ödeme veya açıklama ara…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <label className="filter-field">
            <span>Ödeme türü</span>
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">Tüm türler</option>
              {Object.entries(labels.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Durum</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tüm durumlar</option>
              {Object.entries(labels.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Para birimi</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              <option value="">Tüm para birimleri</option>
              {currencies.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          {filtered && <button className="button-text filter-reset" type="button" onClick={clearFilters}>Filtreleri temizle</button>}
        </form>

        <div className={`table-scroll ${visible.length ? 'populated-payment-table' : ''}`} tabIndex={0} role="region" aria-label="Yatay kaydırılabilir ödeme tablosu">
          <table>
            <caption className="sr-only">Tarayıcıda saklanan test ödemeleri. Gerçek şirket kaydı değildir.</caption>
            <thead>
              <tr>
                <th scope="col">{labels.detail}</th>
                <th scope="col">{labels.type}</th>
                <th scope="col" className="amount-heading">{labels.amount}</th>
                <th scope="col">{labels.dueDate}</th>
                <th scope="col">{labels.date}</th>
                <th scope="col">{labels.notes}</th>
                <th scope="col">{labels.status}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((payment) => (
                <tr key={payment.id} className="payment-row">
                  <td><strong>{payment.detail}</strong>{actions(payment)}</td>
                  <td>{labels.types[payment.type]}</td>
                  <td className="amount-cell">{formatMoney(toMinorUnits(payment.amount), payment.currency)}</td>
                  <td>{displayDate(payment.dueOn)}</td>
                  <td>{displayDate(payment.paidOn)}</td>
                  <td className="notes-cell">{payment.notes || '—'}</td>
                  <td><span className={`payment-status status-${payment.status}`}>{labels.statuses[payment.status]}</span></td>
                </tr>
              ))}
              {visible.length === 0 && <tr>
                <td colSpan={7}>
                  <div className="empty-state" aria-live="polite">
                    <span className="empty-icon"><Table2 size={28} aria-hidden="true" /></span>
                    <h3>{!store.enabled ? 'Test modu kapalı' : filtered || payments.length > 0 ? 'Filtrelere uygun test kaydı bulunamadı' : 'Henüz test ödemesi yok'}</h3>
                    <p>{store.enabled ? 'Test Ödemesi Ekle düğmesiyle örnek kayıt oluşturabilirsiniz.' : 'Örnek kayıt eklemek için yukarıdan test modunu açın.'}</p>
                    <p>Gerçek şirket verisi girmeyin.</p>
                  </div>
                </td>
              </tr>}
            </tbody>
          </table>
        </div>
        {visible.length > 0 && (
          <div className="payment-mobile-list" aria-label="Mobil test ödemeleri">
            {visible.map((payment) => (
              <article className="payment-mobile-card" key={payment.id}>
                <div className="mobile-card-heading"><h3>{payment.detail}</h3><span className={`payment-status status-${payment.status}`}>{labels.statuses[payment.status]}</span></div>
                <p className="mobile-amount">{formatMoney(toMinorUnits(payment.amount), payment.currency)}</p>
                <dl>
                  <div><dt>Ödeme türü</dt><dd>{labels.types[payment.type]}</dd></div>
                  <div><dt>{labels.dueDate}</dt><dd>{displayDate(payment.dueOn)}</dd></div>
                  <div><dt>Gerçekleşen ödeme tarihi</dt><dd>{displayDate(payment.paidOn)}</dd></div>
                  <div><dt>Açıklama</dt><dd>{payment.notes || '—'}</dd></div>
                </dl>
                {actions(payment)}
              </article>
            ))}
          </div>
        )}
        <div className="table-footer">
          <span>Varsayılan para birimi: TL · EUR ve USD seçilebilir</span>
          <span>Otomatik kur dönüşümü yapılmaz</span>
        </div>
      </section>
      )}
    </>
  )
}
