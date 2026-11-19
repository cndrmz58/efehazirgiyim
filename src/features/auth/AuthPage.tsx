import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getLoginClient, type AuthConfig } from './auth-client'

type GateState =
  | { status: 'loading'; pathname: string }
  | { status: 'ready'; pathname: string; session: Session | null }
  | { status: 'error'; pathname: string }

function readEmailLink() {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const type = fragment.get('type')
  const token_hash = fragment.get('token_hash')
  return token_hash && (type === 'invite' || type === 'recovery') ? { token_hash, type } as const : null
}

export default function AuthPage({ config, callback = false }: { config: AuthConfig | null; callback?: boolean }) {
  const [client] = useState(() => {
    if (!config) return null
    const url = config.VITE_SUPABASE_URL
    const key = config.VITE_SUPABASE_PUBLISHABLE_KEY
    // Keep invite/recovery sessions separate from the signed-in browser account.
    return callback
      ? createClient(url, key, { auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: false, storageKey: 'efe:auth-callback' } })
      : getLoginClient(config)
  })

  return (
    <main className="auth-page">
      <section className="auth-brand" aria-label="EFE Hazır Giyim">
        <div className="auth-brand-glow" aria-hidden="true" />
        <Link to="/giris" className="auth-brand-lockup">
          <span className="auth-brand-mark">E</span>
          <span>
            <strong>EFE HAZIR GİYİM</strong>
            <small>FİNANSAL OPERASYONLAR</small>
          </span>
        </Link>
        <div className="auth-brand-copy">
          <p className="auth-brand-overline">KURUMSAL ÇALIŞMA ALANI</p>
          <h2>İşimize yakışan<br /><span>özenli bir kontrol.</span></h2>
          <p>Ödeme süreçleri için sade, güvenilir ve yalnızca ekibimize özel bir çalışma alanı.</p>
        </div>
        <div className="auth-brand-footer">
          <ShieldCheck size={18} aria-hidden="true" />
          <span className="auth-brand-rule" aria-hidden="true" />
          <span>Detaylarda özen. İşimizde güven.</span>
        </div>
      </section>
      <section className="auth-entry" aria-label="Hesap girişi">
        <Link to="/giris" className="auth-mobile-lockup">
          <span className="auth-brand-mark">E</span>
          <span>
            <strong>EFE HAZIR GİYİM</strong>
            <small>FİNANSAL OPERASYONLAR</small>
          </span>
        </Link>
        <div className="auth-entry-content">
          <AuthForm client={client} appUrl={config?.VITE_APP_URL ?? ''} callback={callback} />
          <p className="auth-entry-note">Bu alan yalnızca yetkilendirilmiş ekip üyeleri içindir.</p>
        </div>
      </section>
    </main>
  )
}

export function AuthGate({ config, children }: { config: AuthConfig; children: ReactNode }) {
  const { pathname } = useLocation()
  const publicRoute = pathname === '/giris' || pathname === '/auth' || pathname === '/auth/callback'
  const [gate, setGate] = useState<GateState>({ status: 'loading', pathname: '' })

  useEffect(() => {
    let active = true
    let receivedAuthEvent = false
    const client = getLoginClient(config)
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true
      if (active) setGate({ status: 'ready', pathname, session })
    })

    void client.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return
      setGate(error
        ? { status: 'error', pathname }
        : { status: 'ready', pathname, session: data.session })
    }).catch(() => {
      if (active && !receivedAuthEvent) setGate({ status: 'error', pathname })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [config, pathname])

  if (publicRoute) return children
  if (gate.pathname !== pathname || gate.status === 'loading') {
    return <p role="status">Oturum kontrol ediliyor…</p>
  }
  if (gate.status === 'error') {
    return <p role="alert">Oturum kontrol edilemedi. Lütfen sayfayı yenileyin.</p>
  }
  if (!gate.session) return <Navigate to="/giris" replace />
  return children
}

export function AuthForm({ client, appUrl, callback = false }: {
  client: SupabaseClient | null
  appUrl: string
  callback?: boolean
}) {
  const navigate = useNavigate()
  const [emailLink] = useState(() => callback ? readEmailLink() : null)
  const [session, setSession] = useState<Session | null>()
  const [recovery, setRecovery] = useState(false)
  const [verified, setVerified] = useState(false)
  const [complete, setComplete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!client) return
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, current) => setSession(current))
    return () => subscription.unsubscribe()
  }, [client])

  useEffect(() => {
    if (callback && window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [callback])

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div className="auth-card-intro">
        <p className="auth-card-overline">{callback ? 'HESAP GÜVENLİĞİ' : recovery ? 'PAROLA YENİLEME' : 'YETKİLİ KULLANICI GİRİŞİ'}</p>
        <h1 id="auth-heading">{callback ? 'Yeni parolanızı oluşturun' : recovery ? 'Parolanızı yenileyin' : 'Hoş geldiniz'}</h1>
        <p>{callback
          ? 'Hesabınız için yeni ve güvenli bir parola belirleyin.'
          : recovery
            ? 'Kurumsal e-posta adresinizi girin; parola yenileme bağlantısı uygunsa size gönderilecektir.'
            : 'EFE Hazır Giyim çalışma alanına erişmek için giriş yapın.'}</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {!client ? <p className="auth-notice" role="alert">Giriş hizmeti yapılandırılmadan oturum açılamaz.</p>
        : session === undefined ? <p role="status">Oturum kontrol ediliyor…</p>
        : callback && (complete || !emailLink) ? (
          <>
            {!emailLink && <p role="alert">Davet veya parola yenileme bağlantısı eksik ya da geçersiz.</p>}
            <Link to="/giris" className="auth-return-link">Giriş ekranına dön</Link>
          </>
        ) : !callback && session ? (
          <>
            <p className="auth-session">Oturum açık: <strong>{session.user.email}</strong></p>
            <div className="auth-form-actions">
              <button type="button" className="button-primary auth-submit" onClick={() => navigate('/payments', { replace: true })}>Çalışma alanına geç <ArrowRight size={17} aria-hidden="true" /></button>
              <button type="button" className="auth-link-button" disabled={busy} onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  const result = await client.auth.signOut({ scope: 'local' })
                  if (result.error) setError('Oturum kapatılamadı. Lütfen yeniden deneyin.')
                } catch {
                  setError('Oturum kapatılamadı. Lütfen yeniden deneyin.')
                } finally {
                  setBusy(false)
                }
              }}>Oturumu kapat</button>
            </div>
          </>
        ) : (
          <form className="auth-form" aria-label={callback ? 'Parola belirleme' : recovery ? 'Parola yenileme' : 'Giriş'} onSubmit={async (event) => {
            event.preventDefault()
            const fields = new FormData(event.currentTarget)
            const email = String(fields.get('email') ?? '').trim()
            const password = String(fields.get('password') ?? '')
            setBusy(true)
            setError('')
            setNotice('')
            try {
              if (callback && emailLink) {
                if (!verified) {
                  const link = await client.auth.verifyOtp(emailLink)
                  if (link.error || !link.data.session) {
                    setError('Bağlantı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.')
                    return
                  }
                  setVerified(true)
                }
                const result = await client.auth.updateUser({ password })
                if (result.error) {
                  setError('Parola kaydedilemedi. Farklı bir parola ile yeniden deneyin.')
                  return
                }
                setComplete(true)
                setNotice('Parolanız kaydedildi. Giriş sayfasından oturum açabilirsiniz.')
              } else if (recovery) {
                const result = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL('/auth/callback', appUrl).href })
                if (result.error && result.error.status !== 400 && result.error.status !== 404) {
                  setError('İstek şu anda işlenemedi. Lütfen daha sonra tekrar deneyin.')
                  return
                }
                setNotice('Bu adres için parola yenileme uygunsa e-posta gönderilecektir.')
              } else {
                const result = await client.auth.signInWithPassword({ email, password })
                if (result.error) {
                  setError('Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.')
                } else {
                  navigate('/payments', { replace: true })
                }
              }
            } catch {
              setError('İşlem tamamlanamadı. Lütfen yeniden deneyin.')
            } finally {
              setBusy(false)
            }
          }}>
            <div className="auth-form-fields">
              {!callback && <label className="form-field auth-field">Kurumsal e-posta
                <span className="auth-input-wrap">
                  <Mail size={18} aria-hidden="true" />
                  <input type="email" name="email" autoComplete="email" required disabled={busy} />
                </span>
              </label>}
              {!recovery && <label className="form-field auth-field">{callback ? 'Yeni parola' : 'Parola'}
                <span className="auth-input-wrap">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input type="password" name="password" autoComplete={callback ? 'new-password' : 'current-password'} minLength={callback ? 12 : undefined} required disabled={busy} />
                </span>
                {callback && <span className="field-help">En az 12 karakter.</span>}
              </label>}
            </div>
            <div className="auth-form-actions">
              <button type="submit" className="button-primary auth-submit" disabled={busy}>{callback ? 'Parolayı kaydet' : recovery ? 'Bağlantı iste' : 'Giriş yap'} <ArrowRight size={17} aria-hidden="true" /></button>
              {!callback && <button type="button" className="auth-link-button" disabled={busy} onClick={() => {
                setRecovery(!recovery)
                setError('')
                setNotice('')
              }}>{recovery ? 'Girişe dön' : 'Parolamı unuttum'}</button>}
            </div>
          </form>
        )}
    </section>
  )
}
