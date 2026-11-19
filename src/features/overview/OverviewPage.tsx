import { Link } from 'react-router-dom'
import { formatMoney, summarizePayments } from '../payments/payment-model'
import { usePayments } from '../payments/payment-store'
import { tr } from '../../locales/tr'

const percentFormat = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 })

export function OverviewPage() {
  const store = usePayments()
  const payments = store.payments
  const summaries = summarizePayments(payments)
  const paidCount = summaries.reduce((count, summary) => count + summary.paidCount, 0)

  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">ÖDEME KAYITLARINA GÖRE</p><h1>Genel Bakış</h1><p className="page-description">Erişiminiz olan şirketlerdeki elle girilmiş ödeme kayıtlarının özeti. Banka bakiyesi değildir.</p></div>
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
              <div><dt>Ödenmeyen kayıt</dt><dd>{payments.length - paidCount}</dd></div>
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
