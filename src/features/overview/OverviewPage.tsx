import { Link } from 'react-router-dom'
import { useState } from 'react'
import { currencies, defaultCurrency } from '../../lib/currencies'
import { formatMoney, summarizePaidByPeriod, summarizePayments } from '../payments/payment-model'
import { usePayments } from '../payments/payment-store'
import { tr } from '../../locales/tr'

const percentFormat = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 })
const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export function OverviewPage() {
  const store = usePayments()
  const [currency, setCurrency] = useState(defaultCurrency)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const payments = store.payments
  const summaries = summarizePayments(payments)
  const paidCount = summaries.reduce((count, summary) => count + summary.paidCount, 0)
  const partiallyPaidCount = summaries.reduce((count, summary) => count + summary.partiallyPaidCount, 0)
  const unpaidCount = summaries.reduce((count, summary) => count + summary.unpaidCount, 0)
  const years = [...new Set(payments.filter((payment) => payment.status !== 'unpaid' && payment.paidOn).map(({ paidOn }) => paidOn.slice(0, 4)))]
    .sort((left, right) => right.localeCompare(left))
  const periods = summarizePaidByPeriod(payments, { currency, year, month })
  const maxAmount = periods.reduce((maximum, period) => period.amount > maximum ? period.amount : maximum, 0n)

  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">ÖDEME KAYITLARINA GÖRE</p><h1>Genel Bakış</h1><p className="page-description">Erişiminiz olan şirketlerdeki elle girilmiş ödeme kayıtlarının özeti. Tutarlar Kalan alanından, kayıt sayıları Durum seçiminden hesaplanır; banka bakiyesi değildir.</p></div>
        <Link className="button-secondary" to="/payments">Ödeme tablosuna git</Link>
      </header>
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
              </div>
            </div>
            <p className="field-help paid-trend-note">
              Kısmi ödemelerde tutar, toplam tutar ile kalan tutar farkıdır; kayıttaki gerçekleşen ödeme tarihine göre gruplanır.
            </p>
            {maxAmount === 0n ? (
              <p className="paid-trend-empty">Seçilen para birimi ve dönemde gerçekleşen ödeme yok.</p>
            ) : (
              <div className="paid-trend-chart" aria-label={`${currency} cinsinden ödenen tutarlar`}>
                {periods.map(({ period, amount }) => {
                  const periodLabel = year
                    ? months[Number(period.slice(5, 7)) - 1]
                    : period
                  const ratio = maxAmount === 0n ? 0 : Number((amount * 1000n) / maxAmount) / 1000
                  return (
                    <div className="paid-trend-row" key={period}>
                      <span>{periodLabel}</span>
                      <meter min={0} max={1} value={ratio} aria-label={`${periodLabel} ödenen tutar`} />
                      <strong>{formatMoney(amount, currency)}</strong>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
          <section className="settings-card type-distribution" aria-labelledby="type-distribution-heading">
            <h2 id="type-distribution-heading">Ödeme türü dağılımı</h2>
            <p className="page-description">{payments.length} kayıt · Tutarlar farklı para birimleri arasında toplanmaz.</p>
            {Object.entries(tr.payments.types).map(([type, label]) => {
              const count = payments.filter((payment) => payment.type === type).length
              return (
                <div className="distribution-row" key={type}>
                  <span>{label}</span>
                  <meter aria-label={`${label} kayıt oranı`} min={0} max={Math.max(payments.length, 1)} value={count} />
                  <strong>{count} kayıt</strong>
                </div>
              )
            })}
          </section>
        </>
      )}
    </>
  )
}
