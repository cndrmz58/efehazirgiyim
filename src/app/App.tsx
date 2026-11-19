import {
  ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, ChevronRight,
  CircleHelp, Files, LayoutGrid, Menu, Settings, ShieldCheck, Users, X,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { SetupNotice } from '../components/SetupNotice'
import { PaymentsPage } from '../features/payments/PaymentsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { PaymentsProvider } from '../features/payments/PaymentsProvider'
import { getLoginClient, type AuthConfig } from '../features/auth/auth-client'
import { readEnvironment } from '../lib/environment'
import type { EnvironmentState } from '../lib/environment'
import { tr } from '../locales/tr'

const navigation = [
  { path: '/overview', label: tr.navigation.overview, icon: LayoutGrid },
  { path: '/payments', label: tr.navigation.payments, icon: ArrowUpRight },
  { path: '/collections', label: tr.navigation.collections, icon: ArrowDownLeft },
  { path: '/calendar', label: tr.navigation.calendar, icon: CalendarDays },
  { path: '/contacts', label: tr.navigation.contacts, icon: Users },
  { path: '/departments', label: tr.navigation.departments, icon: Building2 },
  { path: '/documents', label: tr.navigation.documents, icon: Files },
  { path: '/users', label: tr.navigation.users, icon: ShieldCheck },
  { path: '/settings', label: tr.navigation.settings, icon: Settings },
]

const AuthPage = lazy(() => import('../features/auth/AuthPage'))
const AuthGate = lazy(() => import('../features/auth/AuthPage').then(({ AuthGate: Gate }) => ({ default: Gate })))

function PlannedPage({ title }: { title: string }) {
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">ÇALIŞMA ALANI</p><h1>{title}</h1></div></header>
      <section className="settings-card">
        <h2>Bu bölüm sonraki aşamada hazırlanacak</h2>
        <p className="page-description">Şu anda ödeme tablosu ve Genel Bakış kullanılabilir.</p>
        <Link className="button-text inline-flex mt-5" to="/payments">Ödeme tablosuna dön <ChevronRight size={18} aria-hidden="true" /></Link>
      </section>
    </>
  )
}

function Workspace({ environment, authConfig }: { environment: EnvironmentState; authConfig: AuthConfig | null }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  if (pathname === '/auth') return <Navigate to="/giris" replace />
  if (pathname === '/giris' || pathname === '/auth/callback') {
    return <Suspense fallback={<p role="status">Giriş yükleniyor…</p>}>
      <AuthPage key={pathname} config={authConfig} callback={pathname === '/auth/callback'} />
    </Suspense>
  }

  return (
    <PaymentsProvider client={authConfig ? getLoginClient(authConfig) : null}>
    <div className="app-shell">
      <a className="skip-link" href="#main-content">İçeriğe geç</a>
      <header className="mobile-header">
        <Link to="/payments" className="brand-link" onClick={() => setMenuOpen(false)}><span className="brand-mark">E</span><span>{tr.company}</span></Link>
        <button type="button" className="icon-button" aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>

      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} id="primary-navigation">
        <Link to="/payments" className="brand-link desktop-brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">E</span>
          <span><span className="brand-name">{tr.company}</span><span className="brand-subtitle">{tr.application}</span></span>
        </Link>
        <p className="navigation-label">ÇALIŞMA ALANI</p>
        <nav aria-label="Ana menü">
          {navigation.map(({ path, label, icon: Icon }) => {
            const content = <><Icon size={19} aria-hidden="true" /><span>{label}</span></>
            return path === '/overview' || path === '/payments' ? (
              <NavLink key={path} to={path} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={() => setMenuOpen(false)}>
                {content}
              </NavLink>
            ) : (
              <button key={path} type="button" className="nav-link" disabled>{content}</button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <CircleHelp size={18} aria-hidden="true" />
          <div><p>Yardım</p><span>Erişim ve yetki için yöneticinize başvurun</span></div>
        </div>
      </aside>

      <div className="workspace">
        <div className="workspace-header">
          <span>{tr.application} <ChevronRight size={14} aria-hidden="true" /> Çalışma Alanı</span>
          {authConfig && <Link className="button-text" to="/giris">Oturum</Link>}
          {import.meta.env.DEV && <span className="development-badge">Geliştirme ortamı</span>}
        </div>
        <main id="main-content" tabIndex={-1}>
          <SetupNotice environment={environment} />
          <Routes>
            <Route path="/" element={<Navigate to="/payments" replace />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {navigation.filter(({ path }) => !['/payments', '/settings', '/overview'].includes(path)).map(({ path, label }) => (
              <Route key={path} path={path} element={<PlannedPage title={label} />} />
            ))}
            <Route path="*" element={<PlannedPage title="Sayfa bulunamadı" />} />
          </Routes>
          <footer className="workspace-footer">EFE HAZIR GİYİM <span>Finansal Operasyonlar</span></footer>
        </main>
      </div>
    </div>
    </PaymentsProvider>
  )
}

export function App({ environment = readEnvironment(import.meta.env) }: { environment?: EnvironmentState }) {
  const authConfig = environment.status === 'configured' ? environment.config : null

  if (import.meta.env.PROD && !authConfig) {
    return (
      <main className="min-h-screen p-8">
        <section className="settings-card" role="alert">
          <h1>Güvenli giriş kullanılamıyor</h1>
          <p>Üretim Supabase ayarları eksik veya geçersiz. Çalışma alanı kapalı.</p>
          {environment.status === 'invalid' && <p>Kontrol edilecek alanlar: {environment.fields.join(', ')}.</p>}
        </section>
      </main>
    )
  }

  const workspace = <Workspace environment={environment} authConfig={authConfig} />

  return authConfig
    ? <Suspense fallback={<p role="status">Oturum kontrol ediliyor…</p>}><AuthGate config={authConfig}>{workspace}</AuthGate></Suspense>
    : workspace
}
