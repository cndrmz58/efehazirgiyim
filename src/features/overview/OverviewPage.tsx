import { CalendarClock, CalendarX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { currencies, defaultCurrency } from '../../lib/currencies'
import { formatMoney, localIsoDate, summarizeDue, summarizePaidByPeriod, summarizePayments, toMinorUnits, type DueBucket } from '../payments/payment-model'
import { usePayments } from '../payments/payment-store'
import { tr } from '../../locales/tr'

const percentFormat = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 })
const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const shortMonths = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function DueCard({ variant, title, description, bucket, organizations }: {
  variant: 'overdue' | 'upcoming'
  title: string
  description: string
  bucket: DueBucket
  organizations: ReadonlyMap<string, string>
}) {
  const Icon = variant === 'overdue' ? CalendarX : CalendarClock
  return (
    <article className={`settings-card due-card due-${variant}`} aria-label={title}>
      <span className="due-icon"><Icon size={22} aria-hidden="true" /></span>
      <div className="due-body">
        <h2>{title}</h2>
        <p className="due-count">{bucket.count} <span>kayıt</span></p>
        {bucket.totals.length > 0 && (
          <dl className="due-amounts">
            {bucket.totals.map(({ code, amount }) => (
              <div key={code}><dt>Kalan ({code})</dt><dd>{formatMoney(amount, code)}</dd></div>
            ))}
          </dl>
        )}
        {bucket.records.length > 0 ? (
          <ul className="due-record-list" aria-label={`${title} listesi`} tabIndex={0}>
            {bucket.records.map((payment) => (
              <li key={payment.id}>
                <div className="due-record-main">
                  <strong>{payment.detail}</strong>
                  <span>{organizations.get(payment.organizationId) ?? '—'}</span>
                  <span>{tr.payments.types[payment.type]}</span>
                </div>
                <div className="due-record-meta">
                  <span className={`payment-status status-${payment.status.replace('_', '-')}`}>{tr.payments.statuses[payment.status]}</span>
                  <time dateTime={payment.dueOn}>{payment.dueOn.split('-').reverse().join('.')}</time>
                  <strong>{formatMoney(toMinorUnits(payment.remainingAmount), payment.currency)}</strong>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="due-empty">{variant === 'overdue' ? 'Gecikmiş açık kayıt yok.' : 'Bu aralıkta vadesi gelen açık kayıt yok.'}</p>
        )}
        <p className="field-help">{description}</p>
      </div>
    </article>
  )
}

export function OverviewPage() {
  const store = usePayments()
  const [currency, setCurrency] = useState(defaultCurrency)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [type, setType] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const payments = store.payments
  const summaries = summarizePayments(payments)
  const paidCount = summaries.reduce((count, summary) => count + summary.paidCount, 0)
  const partiallyPaidCount = summaries.reduce((count, summary) => count + summary.partiallyPaidCount, 0)
  const unpaidCount = summaries.reduce((count, summary) => count + summary.unpaidCount, 0)
  const statusSegments = [
    { key: 'paid', label: 'Ödendi', count: paidCount },
    { key: 'partial', label: 'Kısmen ödendi', count: partiallyPaidCount },
    { key: 'unpaid', label: 'Ödenmedi', count: unpaidCount },
  ]
  const due = summarizeDue(payments, localIsoDate())
  const organizations = new Map(store.organizations.map(({ id, name }) => [id, name]))
  const years = [...new Set(payments.filter((payment) => payment.status !== 'unpaid' && payment.paidOn).map(({ paidOn }) => paidOn.slice(0, 4)))]
    .sort((left, right) => right.localeCompare(left))
  const periods = summarizePaidByPeriod(payments, { currency, year, month, type, organizationId })
  const maxAmount = periods.reduce((maximum, period) => period.amount > maximum ? period.amount : maximum, 0n)
  const paidTotal = periods.reduce((sum, period) => sum + period.amount, 0n)
  const peak = periods.reduce((best, period) => period.amount > best.amount ? period : best, { period: '', amount: 0n })
  const periodLabel = (period: string, short: boolean) =>
    year ? (short ? shortMonths : months)[Number(period.slice(5, 7)) - 1] ?? period : period
  const typeRows = Object.entries(tr.payments.types)
    .map(([type, label]) => ({ type, label, count: payments.filter((payment) => payment.type === type).length }))
    .sort((left, right) => right.count - left.count)

  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">ÖDEME KAYITLARINA GÖRE</p><h1>Genel Bakış</h1><p className="page-description">Erişiminiz olan şirketlerdeki elle girilmiş ödeme kayıtlarının özeti. Tutarlar Kalan alanından, kayıt sayıları Durum seçiminden hesaplanır; banka bakiyesi değildir.</p></div>
        <Link className="button-secondary" to="/payments">Ödeme tablosuna git</Link>
      </header>
      {store.status === 'ready' && (
        <section className="due-grid" aria-label="Vade göstergeleri">
          <DueCard variant="overdue" title="Gecikmiş ödemeler" description="Vade tarihi geçmiş, ödenmemiş veya kısmen ödenmiş kayıtlar." bucket={due.overdue} organizations={organizations} />
          <DueCard variant="upcoming" title="Yaklaşan vadeler · 30 gün" description="Bugünden itibaren 30 gün içinde vadesi gelen açık kayıtlar." bucket={due.upcoming} organizations={organizations} />
        </section>
      )}
      {store.status === 'ready' && (
        <section className="settings-card paid-trend" aria-labelledby="paid-trend-heading">
          <div className="paid-trend-heading">
            <div>
              <h2 id="paid-trend-heading">Ödenen tutar eğilimi</h2>
              <p className="page-description">
                {year ? `${year} yılı aylarına göre` : month ? `${months[Number(month) - 1]} ayının yıllara göre` : 'Yıllara göre'}
                {' · '}Gerçekleşen ödeme tarihi
              </p>
            </div>
            <div className="paid-trend-filters">
              <label className="filter-field">
                <span>Para birimi</span>
                <select value={currency} onChange={(event) => {
                  const selected = currencies.find(({ code }) => code === event.target.value)
                  if (selected) setCurrency(selected.code)
                }}>
                  {currencies.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>Gerçekleşen ödeme yılı</span>
                <select value={year} onChange={(event) => setYear(event.target.value)}>
                  <option value="">Tüm yıllar</option>
                  {years.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>Ay filtresi</span>
                <select value={month} onChange={(event) => setMonth(event.target.value)}>
                  <option value="">Tüm aylar</option>
                  {months.map((label, index) => {
                    const value = String(index + 1).padStart(2, '0')
                    return <option key={value} value={value}>{label}</option>
                  })}
                </select>
              </label>
              <label className="filter-field">
                <span>Ödeme türü</span>
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="">Tüm türler</option>
                  {Object.entries(tr.payments.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="filter-field">
                <span>Şirket</span>
                <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                  <option value="">Tüm şirketler</option>
                  {store.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
              </label>
            </div>
          </div>
          <p className="field-help paid-trend-note">
            Kısmi ödemelerde tutar, toplam tutar ile kalan tutar farkıdır; kayıttaki gerçekleşen ödeme tarihine göre gruplanır.
          </p>
          {maxAmount === 0n ? (
            <p className="paid-trend-empty">Seçilen para birimi ve dönemde gerçekleşen ödeme yok.</p>
          ) : (
            <>
              <div className="trend-columns" role="list" aria-label={`${currency} cinsinden dönemlere göre ödenen tutarlar`} data-dense={periods.length > 6}>
                {periods.map(({ period, amount }) => {
                  const height = amount > 0n ? Math.max(Number((amount * 1000n) / maxAmount) / 10, 2) : 0
                  return (
                    <div role="listitem" className="trend-column" key={period} aria-label={`${periodLabel(period, false)}: ${formatMoney(amount, currency)}`} title={`${periodLabel(period, false)}: ${formatMoney(amount, currency)}`}>
                      <span className="trend-column-area" aria-hidden="true">
                        {amount > 0n && <span className="trend-column-value" style={{ bottom: `calc(${height}% + 4px)` }}>{formatMoney(amount, currency)}</span>}
                        <span className="trend-column-bar" style={{ height: `${height}%` }} />
                      </span>
                      <span className="trend-column-label" aria-hidden="true">{periodLabel(period, true)}</span>
                    </div>
                  )
                })}
              </div>
              <dl className="trend-stats">
                <div><dt>Dönem toplamı</dt><dd>{formatMoney(paidTotal, currency)}</dd></div>
                <div><dt>En yüksek dönem</dt><dd>{periodLabel(peak.period, false)} · {formatMoney(peak.amount, currency)}</dd></div>
              </dl>
            </>
          )}
        </section>
      )}
      {store.status === 'unconfigured' ? (
        <section className="settings-card"><h2>Veri bağlantısı yapılandırılmadı</h2><p className="page-description">Özet için Supabase bağlantı ayarları gerekir.</p></section>
      ) : store.status === 'loading' ? (
        <section className="settings-card"><p role="status">Özet yükleniyor…</p></section>
      ) : store.status === 'error' ? (
        <section className="settings-card"><h2>Özet hesaplanamadı</h2><p className="page-description" role="alert">{store.error}</p>
          <button type="button" className="button-secondary mt-5" onClick={store.reload}>Yeniden dene</button></section>
      ) : (
        <>
          {payments.length === 0 && <p className="overview-empty">Henüz ödeme kaydı yok. Ödeme tablosuna kayıt eklediğinizde bu özet güncellenir.</p>}
          <section className="settings-card currency-summary status-summary" aria-labelledby="status-summary-heading">
            <h2 id="status-summary-heading">Kayıt durumları</h2>
            {payments.length > 0 && (
              <div className="status-composition">
                <div className="status-composition-bar" role="img" aria-label={`Kayıt dağılımı: ${paidCount} ödendi, ${partiallyPaidCount} kısmen ödendi, ${unpaidCount} ödenmedi`}>
                  {statusSegments.map(({ key, count }) => count > 0 && (
                    <span key={key} className={`segment-${key}`} style={{ width: `${(count / payments.length) * 100}%` }} />
                  ))}
                </div>
                <ul className="status-legend">
                  {statusSegments.map(({ key, label, count }) => (
                    <li key={key}><span className={`legend-swatch segment-${key}`} aria-hidden="true" />{label} · {percentFormat.format(count / payments.length)}</li>
                  ))}
                </ul>
              </div>
            )}
            <dl>
              <div><dt>Toplam kayıt</dt><dd>{payments.length}</dd></div>
              <div><dt>Ödenen kayıt</dt><dd className="paid-amount">{paidCount}</dd></div>
              <div><dt>Kısmen ödenen kayıt</dt><dd>{partiallyPaidCount}</dd></div>
              <div><dt>Ödenmeyen kayıt</dt><dd>{unpaidCount}</dd></div>
            </dl>
          </section>
          <section className="currency-summary-grid" aria-label="Para birimine göre ödeme özetleri">
            {summaries.map((summary) => (
              <article className="settings-card currency-summary" key={summary.code} aria-label={`${summary.code} özeti`}>
                <div className="currency-summary-heading"><h2>{summary.label}</h2><span className="record-count">{summary.count} kayıt</span></div>
                <div className="paid-progress" aria-hidden="true">
                  <span style={{ width: `${(summary.paidRatio ?? 0) * 100}%` }} />
                </div>
                <dl>
                  <div><dt>Toplam tutar</dt><dd>{formatMoney(summary.total, summary.code)}</dd></div>
                  <div><dt>Ödenen tutar</dt><dd className="paid-amount">{formatMoney(summary.paid, summary.code)}</dd></div>
                  <div><dt>Ödenmeyen tutar</dt><dd>{formatMoney(summary.unpaid, summary.code)}</dd></div>
                  <div><dt>Ödenen tutar oranı</dt><dd>{summary.paidRatio === null ? '—' : percentFormat.format(summary.paidRatio)}</dd></div>
                  <div><dt>Son gerçekleşen ödeme</dt><dd>{summary.latestPaidOn
                    ? <time dateTime={summary.latestPaidOn}>{summary.latestPaidOn.split('-').reverse().join('.')}</time>
                    : '—'}</dd></div>
                </dl>
              </article>
            ))}
          </section>
          <section className="settings-card type-distribution" aria-labelledby="type-distribution-heading">
            <h2 id="type-distribution-heading">Ödeme türü dağılımı</h2>
            <p className="page-description">{payments.length} kayıt · Kayıt sayısına göre azalan sıralama. Tutarlar farklı para birimleri arasında toplanmaz.</p>
            {typeRows.map(({ type, label, count }) => (
              <div className="distribution-row" key={type}>
                <span>{label}</span>
                <meter aria-label={`${label} kayıt oranı`} min={0} max={Math.max(payments.length, 1)} value={count} />
                <strong>{count} kayıt</strong>
                <span className="distribution-share">{percentFormat.format(count / Math.max(payments.length, 1))}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  )
}
