import { ArrowDownUp, Plus, RefreshCw, Search, SlidersHorizontal, Table2 } from 'lucide-react'
import { useState } from 'react'
import { currencies, defaultCurrency } from '../../lib/currencies'
import { tr } from '../../locales/tr'
import { PaymentForm } from './PaymentForm'
import { filterPayments, formatMoney, toMinorUnits, type Payment, type PaymentInput } from './payment-model'
import { usePayments } from './payment-store'

const labels = tr.payments
const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function displayDate(date: string) {
  return date ? <time dateTime={date}>{date.split('-').reverse().join('.')}</time> : '—'
}

export function PaymentsPage() {
  const store = usePayments()
  const [editor, setEditor] = useState<Payment | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [currency, setCurrency] = useState<string>(defaultCurrency)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = [type, status, year, month].filter(Boolean).length + (currency !== defaultCurrency ? 1 : 0)
  const filtered = Boolean(query || type || status || currency !== defaultCurrency || year || month)
  const payments = store.payments
  const years = [...new Set(payments.map(({ dueOn }) => dueOn.slice(0, 4)).filter(Boolean))].sort((left, right) => right.localeCompare(left))
  const organizations = new Map(store.organizations.map((organization) => [organization.id, organization]))
  const ready = store.status === 'ready'
  const visible = filterPayments(payments, { query, type, status, currency, year, month })

  function clearFilters() {
    setQuery('')
    setType('')
    setStatus('')
    setCurrency(defaultCurrency)
    setYear('')
    setMonth('')
  }

  async function save(input: PaymentInput) {
    if (await store.savePayment(input, editor && editor !== 'new' ? editor : undefined)) {
      setEditor(null)
      clearFilters()
      setCurrency(input.currency)
    }
  }

  function actions(payment: Payment) {
    const organization = organizations.get(payment.organizationId)
    if (!organization?.canEdit) return null
    return (
      <div className="row-actions">
        <button type="button" className="button-text" disabled={store.busy} aria-label={`Ödemeyi düzenle: ${payment.detail}`} onClick={() => setEditor(payment)}>Düzenle</button>
        <button type="button" className="button-text danger-text" disabled={store.busy} aria-label={`Ödemeyi sil: ${payment.detail}`} onClick={async () => {
          if (window.confirm(`“${payment.detail}” ödemesi silinsin mi? Silme işlemi denetim geçmişine kaydedilir.`) && await store.deletePayment(payment)) {
            if (editor !== 'new' && editor?.id === payment.id) setEditor(null)
          }
        }}>Sil</button>
      </div>
    )
  }

  function organizationName(payment: Payment) {
    return store.organizations.length > 1 && <span className="field-help">{organizations.get(payment.organizationId)?.name ?? '—'}</span>
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
          <button type="button" className="button-primary" disabled={!ready || !store.canEdit} aria-describedby="entry-unavailable" onClick={() => setEditor('new')}>
            <Plus size={18} aria-hidden="true" /> Ödeme Ekle
          </button>
          <p id="entry-unavailable" className="entry-help">{!ready ? 'Kayıtlar yüklendiğinde kullanılabilir' : store.canEdit ? 'Ortak veritabanına kaydedilir' : 'Kayıt ekleme yetkiniz yok'}</p>
        </div>
      </header>

      {store.error && <p className="form-error" role="alert">{store.error}</p>}
      {store.feedback && <p className="action-feedback" role="status">{store.feedback}</p>}

      {editor !== null && (ready || store.status === 'loading') && (
        <PaymentForm key={editor === 'new' ? 'new' : editor.id} original={editor === 'new' ? null : editor} organizations={store.organizations} busy={store.busy} onSave={save} onCancel={() => setEditor(null)} />
      )}

      {store.status === 'unconfigured' ? (
        <section className="settings-card"><h2>Veri bağlantısı yapılandırılmadı</h2><p className="page-description">Ödemeler için Supabase bağlantı ayarları gerekir.</p></section>
      ) : store.status === 'loading' ? (
        <section className="settings-card"><p role="status">Ödemeler yükleniyor…</p></section>
      ) : store.status === 'error' ? (
        <section className="settings-card"><h2>Ödemeler yüklenemedi</h2><p className="page-description">Eksik veya eski kayıt gösterilmiyor.</p>
          <button type="button" className="button-secondary mt-5" onClick={store.reload}><RefreshCw size={16} aria-hidden="true" /> Yeniden dene</button></section>
      ) : (
      <section className="table-card" aria-label="Ödeme kayıtları">
        <div className="table-card-heading">
          <div className="flex items-center gap-3">
            <h2>Ödeme Tablosu</h2>
            <span className="record-count">{visible.length} / {payments.length} kayıt</span>
          </div>
          <button type="button" className="button-text table-hint" onClick={store.reload}><RefreshCw size={15} aria-hidden="true" /> Yenile</button>
          <span className="table-hint"><ArrowDownUp size={15} aria-hidden="true" /> Elle giriş</span>
        </div>

        <form className="table-filters" role="search" aria-label="Ödemeleri filtrele" onSubmit={(event) => event.preventDefault()}>
          <label className="search-field">
            <span className="sr-only">Ödeme ara</span>
            <Search size={18} aria-hidden="true" />
            <input type="search" placeholder="Ödeme veya açıklama ara…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="button-secondary filter-toggle" aria-expanded={filtersOpen} aria-controls="payment-filter-fields" onClick={() => setFiltersOpen(!filtersOpen)}>
            <SlidersHorizontal size={16} aria-hidden="true" /> Filtreler{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
          <div id="payment-filter-fields" className={`filter-fields ${filtersOpen ? '' : 'filter-fields-closed'}`}>
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
          <label className="filter-field">
            <span>Vade yılı</span>
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">Tüm yıllar</option>
              {years.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Vade ayı</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="">Tüm aylar</option>
              {months.map((label, index) => {
                const value = String(index + 1).padStart(2, '0')
                return <option key={value} value={value}>{label}</option>
              })}
            </select>
          </label>
          {filtered && <button className="button-text filter-reset" type="button" onClick={clearFilters}>Filtreleri temizle</button>}
          </div>
        </form>

        <div className={`table-scroll ${visible.length ? 'populated-payment-table' : ''}`} tabIndex={0} role="region" aria-label="Yatay kaydırılabilir ödeme tablosu">
          <table>
            <caption className="sr-only">Ortak veritabanındaki ödeme kayıtları.</caption>
            <thead>
              <tr>
                <th scope="col">{labels.detail}</th>
                <th scope="col">{labels.type}</th>
                <th scope="col">{labels.paymentMethod}</th>
                <th scope="col" className="amount-heading">{labels.amount}</th>
                <th scope="col" className="amount-heading">{labels.remainingAmount}</th>
                <th scope="col">{labels.dueDate}</th>
                <th scope="col">{labels.date}</th>
                <th scope="col">{labels.notes}</th>
                <th scope="col">{labels.status}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((payment) => (
                <tr key={payment.id} className="payment-row">
                  <td><strong>{payment.detail}</strong>{organizationName(payment)}{actions(payment)}</td>
                  <td>{labels.types[payment.type]}</td>
                  <td>{payment.paymentMethod ? labels.paymentMethods[payment.paymentMethod] : 'Belirtilmedi'}</td>
                  <td className="amount-cell">{formatMoney(toMinorUnits(payment.amount), payment.currency)}</td>
                  <td className="amount-cell">{formatMoney(toMinorUnits(payment.remainingAmount), payment.currency)}</td>
                  <td>{displayDate(payment.dueOn)}</td>
                  <td>{displayDate(payment.paidOn)}</td>
                  <td className="notes-cell">{payment.notes || '—'}</td>
                  <td><span className={`payment-status status-${payment.status.replace('_', '-')}`}>{labels.statuses[payment.status]}</span></td>
                </tr>
              ))}
              {visible.length === 0 && <tr>
                <td colSpan={9}>
                  <div className="empty-state" aria-live="polite">
                    <span className="empty-icon"><Table2 size={28} aria-hidden="true" /></span>
                    <h3>{filtered || payments.length > 0 ? 'Filtrelere uygun kayıt bulunamadı' : 'Henüz ödeme kaydı yok'}</h3>
                    <p>{store.canEdit ? 'Ödeme Ekle düğmesiyle ilk kaydı oluşturabilirsiniz.' : store.organizations.length === 0 ? 'Hesabınıza ödeme erişimi atanmamış. Yöneticinize başvurun.' : 'Ödeme kaydı ekleme yetkiniz yok.'}</p>
                  </div>
                </td>
              </tr>}
            </tbody>
          </table>
        </div>
        {visible.length > 0 && (
          <div className="payment-mobile-list" aria-label="Mobil ödeme listesi">
            {visible.map((payment) => (
              <article className="payment-mobile-card" key={payment.id}>
                <div className="mobile-card-heading"><h3>{payment.detail}{organizationName(payment)}</h3><span className={`payment-status status-${payment.status.replace('_', '-')}`}>{labels.statuses[payment.status]}</span></div>
                <p className="mobile-amount">{formatMoney(toMinorUnits(payment.amount), payment.currency)}</p>
                <dl>
                  <div><dt>{labels.remainingAmount}</dt><dd>{formatMoney(toMinorUnits(payment.remainingAmount), payment.currency)}</dd></div>
                  <div><dt>Ödeme türü</dt><dd>{labels.types[payment.type]}</dd></div>
                  <div><dt>{labels.paymentMethod}</dt><dd>{payment.paymentMethod ? labels.paymentMethods[payment.paymentMethod] : 'Belirtilmedi'}</dd></div>
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
