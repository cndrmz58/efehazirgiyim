import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getLoginClient, type AuthConfig } from '../features/auth/auth-client'

export function AccountMenu({ config }: { config: AuthConfig }) {
  const client = getLoginClient(config)
  const [user, setUser] = useState<User | null>(null)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    let active = true
    let receivedAuthEvent = false
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true
      if (active) setUser(session?.user ?? null)
    })

    void client.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return
      if (!error) setUser(data.session?.user ?? null)
    }).catch(() => {})

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [client])

  if (!user) return null

  return (
    <details className="account-menu">
      <summary className="account-trigger" aria-label={`Oturumum, ${user.email ?? 'Kullanıcı'}`}>
        <span className="account-avatar"><UserRound size={17} aria-hidden="true" /></span>
        <span className="account-trigger-copy">
          <span>Oturumum</span>
          <strong>{user.email ?? 'Hesap'}</strong>
        </span>
        <ChevronDown className="account-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="account-popover">
        <p className="account-menu-label">OTURUM AÇIK</p>
        <p className="account-email">{user.email ?? 'Hesap'}</p>
        {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
        <button type="button" className="account-logout" disabled={logoutBusy} onClick={async () => {
          setLogoutBusy(true)
          setLogoutError('')
          try {
            const { error } = await client.auth.signOut({ scope: 'local' })
            if (error) setLogoutError('Oturum kapatılamadı. Lütfen yeniden deneyin.')
          } catch {
            setLogoutError('Oturum kapatılamadı. Lütfen yeniden deneyin.')
          } finally {
            setLogoutBusy(false)
          }
        }}>
          <LogOut size={17} aria-hidden="true" />
          Oturumu kapat
        </button>
      </div>
    </details>
  )
}