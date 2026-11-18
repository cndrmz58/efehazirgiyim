import { useEffect, useState } from 'react'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { Link } from 'react-router-dom'
import type { EnvironmentState } from '../../lib/environment'

type AuthConfig = Extract<EnvironmentState, { status: 'configured' }>['config']
let loginClient: SupabaseClient | undefined

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
      : (loginClient ??= createClient(url, key, { auth: { detectSessionInUrl: false } }))
  })

  return <AuthForm client={client} appUrl={config?.VITE_APP_URL ?? ''} callback={callback} />
}

export function AuthForm({ client, appUrl, callback = false }: {
  client: SupabaseClient | null
  appUrl: string
  callback?: boolean
}) {
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
    <section className="settings-card payment-editor" aria-labelledby="auth-heading">
      <h1 id="auth-heading">{callback ? 'Parola belirle' : 'Güvenli giriş'}</h1>
      <p className="page-description">Yalnızca davetli hesaplar içindir. Bu bölüm test ödemelerini Supabase’e aktarmaz.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!client ? <p>Supabase yapılandırılmadan giriş kullanılamaz.</p>
        : session === undefined ? <p role="status">Oturum kontrol ediliyor…</p>
        : callback && (complete || !emailLink) ? (
          <>
            {!emailLink && <p role="alert">Davet veya parola yenileme bağlantısı eksik ya da geçersiz.</p>}
            <Link to="/auth" className="button-text">Giriş sayfasına dön</Link>
          </>
        ) : !callback && session ? (
          <>
            <p>Oturum açık: {session.user.email}</p>
            <button type="button" className="button-secondary" disabled={busy} onClick={async () => {
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
          </>
        ) : (
          <form aria-label={callback ? 'Parola belirleme' : recovery ? 'Parola yenileme' : 'Giriş'} onSubmit={async (event) => {
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
                if (result.error) setError('Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.')
              }
            } catch {
              setError('İşlem tamamlanamadı. Lütfen yeniden deneyin.')
            } finally {
              setBusy(false)
            }
          }}>
            <div className="payment-form-grid">
              {!callback && <label className="form-field">E-posta
                <input type="email" name="email" autoComplete="email" required disabled={busy} />
              </label>}
              {!recovery && <label className="form-field">{callback ? 'Yeni parola' : 'Parola'}
                <input type="password" name="password" autoComplete={callback ? 'new-password' : 'current-password'} minLength={callback ? 12 : undefined} required disabled={busy} />
                {callback && <span className="field-help">En az 12 karakter.</span>}
              </label>}
            </div>
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={busy}>{callback ? 'Parolayı kaydet' : recovery ? 'Yenileme bağlantısı iste' : 'Giriş yap'}</button>
              {!callback && <button type="button" className="button-text" disabled={busy} onClick={() => {
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
