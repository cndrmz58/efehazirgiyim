import { FlaskConical } from 'lucide-react'
import { useTestPayments } from './test-payment-store'

export function TestModePanel() {
  const store = useTestPayments()

  return (
    <section className="test-mode-panel" aria-label="Test modu">
      <div className="test-mode-description">
        <FlaskConical size={22} aria-hidden="true" />
        <div>
          <h2>{store.enabled ? 'TEST MODU AÇIK · Gerçek şirket verisi girmeyin' : 'Ödeme tablosunu test edin'}</h2>
          <p>Yalnızca bu tarayıcıda saklanır; ortak veritabanına gönderilmez. Tarayıcı verileri silinirse kayıtlar kaybolur.</p>
        </div>
      </div>
      <div className="test-mode-actions">
        <button type="button" className="button-secondary" disabled={!store.available} onClick={() => store.setEnabled(!store.enabled)}>
          {store.enabled ? 'Test modunu kapat' : 'Test modunu aç'}
        </button>
        {(store.enabled || store.payments.length > 0 || !store.available) && (
          <button type="button" className="button-text danger-text" onClick={() => {
            if (window.confirm('Bu tarayıcıdaki tüm test ödemeleri silinecek. Devam edilsin mi?')) store.clearPayments()
          }}>Tüm test verilerini sil</button>
        )}
      </div>
      {store.error && <p className="form-error" role="alert">{store.error}</p>}
      {store.feedback && <p className="test-feedback" role="status">{store.feedback}</p>}
    </section>
  )
}
