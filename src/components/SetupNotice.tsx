import { Info } from 'lucide-react'
import type { EnvironmentState } from '../lib/environment'

export function SetupNotice({ environment }: { environment: EnvironmentState }) {
  const invalid = environment.status === 'invalid'
  if (environment.status === 'configured') return null

  return (
    <section className={`setup-notice ${invalid ? 'setup-notice-error' : ''}`} role={invalid ? 'alert' : 'note'}>
      <Info size={20} aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {invalid ? 'Bağlantı ayarlarını kontrol edin' : 'Veri bağlantısı yapılandırılmadı'}
        </p>
        <p>
          {invalid
            ? `Geçersiz veya eksik ayarlar: ${environment.fields.join(', ')}.`
            : 'Güvenli giriş ve ortak veritabanı ayarları eksik. Kayıt görüntülenemez veya eklenemez.'}
        </p>
      </div>
    </section>
  )
}
