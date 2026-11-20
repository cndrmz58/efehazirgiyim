import { Building2, Plus } from 'lucide-react'

export function FirmsPage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">İŞ ORTAKLARI</p>
          <h1>Firmalar</h1>
          <p className="page-description">Çalıştığınız firmaların iletişim dizini.</p>
        </div>
        <button type="button" className="button-primary firm-add-button" disabled aria-describedby="firm-backend-note">
          <Plus size={17} aria-hidden="true" />
          Firma ekle
        </button>
      </header>
      <section className="table-card firm-directory" aria-labelledby="firm-list-heading">
        <header className="table-card-heading">
          <h2 id="firm-list-heading">Firma listesi</h2>
          <span className="record-count">0 firma</span>
        </header>
        <div className="table-scroll">
          <table aria-label="Firma listesi">
            <thead>
              <tr><th>Firma</th><th>İlgili kişi</th><th>E-posta</th><th>Telefon</th></tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}>
                  <div className="firm-empty-state">
                    <span className="firm-empty-icon"><Building2 size={24} aria-hidden="true" /></span>
                    <h3>Henüz firma kaydı yok</h3>
                    <p>Firma kayıtları burada görüntülenecek.</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <p className="field-help firm-backend-note" id="firm-backend-note">
        Firma ekleme ve kayıt işlemleri backend bağlantısı tamamlandığında açılacak.
      </p>
    </>
  )
}