import { Info } from 'lucide-react'
import type { EnvironmentState } from '../lib/environment'

export function SetupNotice({ environment }: { environment: EnvironmentState }) {
  const invalid = environment.status === 'invalid'

  return (
    <section className={`setup-notice ${invalid ? 'setup-notice-error' : ''}`} role={invalid ? 'alert' : 'note'}>
      <Info size={20} aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {invalid ? 'Bağlantı ayarlarını kontrol edin' : 'Geliştirme aşaması · Gerçek veri bağlantısı kapalı'}
        </p>
        <p>
          {invalid
            ? `Geçersiz veya eksik ayarlar: ${environment.fields.join(', ')}.`
            : environment.status === 'configured'
              ? 'Güvenli giriş yapılandırıldı. Ödemeler ortak veritabanına kaydedilmez; yalnızca test modu kullanılabilir.'
              : 'Güvenli giriş ve ortak veritabanı henüz kurulmadı. Yalnızca aşağıdaki test modu kullanılabilir.'}
        </p>
      </div>
    </section>
  )
}
