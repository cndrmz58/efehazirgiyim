export function SettingsPage() {
  return (
    <>
      <header className="page-heading">
        <div><p className="eyebrow">ÇALIŞMA ALANI</p><h1>Ayarlar</h1><p className="page-description">İlk aşama için belirlenen uygulama tercihleri.</p></div>
      </header>
      <section className="settings-card" aria-labelledby="preferences-heading">
        <h2 id="preferences-heading">Bölgesel tercihler</h2>
        <dl className="preference-list">
          <div><dt>Uygulama dili</dt><dd>Türkçe</dd></div>
          <div><dt>Saat dilimi</dt><dd>Europe/Istanbul</dd></div>
          <div><dt>Varsayılan para birimi</dt><dd>TL (TRY)</dd></div>
          <div><dt>Seçilebilir para birimleri</dt><dd>TL (TRY), Euro (EUR), ABD Doları (USD)</dd></div>
        </dl>
        <div className="planned-setting">
          <h3>Manuel döviz kuru · Planlanıyor</h3>
          <p>Elle doldurulabilecek kur alanının yeri ve kullanımı sonraki aşamada belirlenecek. Şu anda kur kaydedilmez ve dönüşüm hesabı yapılmaz.</p>
        </div>
      </section>
    </>
  )
}
