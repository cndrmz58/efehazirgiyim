import {
  ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, ChevronRight,
  CircleHelp, Files, LayoutGrid, Menu, Settings, ShieldCheck, Users, X,
} from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { SetupNotice } from '../components/SetupNotice'
import { PaymentsPage } from '../features/payments/PaymentsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { OverviewPage } from '../features/overview/OverviewPage'
import { TestPaymentsProvider } from '../features/payments/TestPaymentsProvider'
import { TestModePanel } from '../features/payments/TestModePanel'
import { useTestPayments } from '../features/payments/test-payment-store'
import { readEnvironment } from '../lib/environment'
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

const environment = readEnvironment(import.meta.env)
const authConfig = environment.status === 'configured' ? environment.config : null
const AuthPage = lazy(() => import('../features/auth/AuthPage'))

function PlannedPage({ title }: { title: string }) {
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">ÇALIŞMA ALANI</p><h1>{title}</h1></div></header>
      <section className="settings-card">
        <h2>Bu bölüm sonraki aşamada hazırlanacak</h2>
        <p className="page-description">Şu anda ödeme tablosu ve Genel Bakış, yalnızca test kayıtlarıyla kullanılabilir.</p>
        <Link className="button-text inline-flex mt-5" to="/payments">Ödeme tablosuna dön <ChevronRight size={18} aria-hidden="true" /></Link>
      </section>
    </>
  )
}

function Workspace() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { enabled } = useTestPayments()

  return (
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
          {navigation.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={() => setMenuOpen(false)}>
              <Icon size={19} aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <CircleHelp size={18} aria-hidden="true" />
          <div><p>Test sürümü</p><span>Güvenli veri bağlantısı hazırlanıyor</span></div>
        </div>
      </aside>

      <div className="workspace">
        <div className="workspace-header">
          <span>{tr.application} <ChevronRight size={14} aria-hidden="true" /> Çalışma Alanı</span>
          {authConfig && <Link className="button-text" to="/auth">Güvenli giriş</Link>}
          <span className="development-badge">Geliştirme ortamı</span>
        </div>
        <main id="main-content" tabIndex={-1}>
          <SetupNotice environment={environment} />
          <TestModePanel />
          <Routes>
            <Route path="/" element={<Navigate to="/payments" replace />} />
            <Route path="/payments" element={<PaymentsPage key={enabled ? 'test' : 'disabled'} />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/auth" element={<Suspense fallback={<p role="status">Giriş yükleniyor…</p>}><AuthPage key="login" config={authConfig} /></Suspense>} />
            <Route path="/auth/callback" element={<Suspense fallback={<p role="status">Giriş yükleniyor…</p>}><AuthPage key="callback" config={authConfig} callback /></Suspense>} />
            {navigation.filter(({ path }) => !['/payments', '/settings', '/overview'].includes(path)).map(({ path, label }) => (
              <Route key={path} path={path} element={<PlannedPage title={label} />} />
            ))}
            <Route path="*" element={<PlannedPage title="Sayfa bulunamadı" />} />
          </Routes>
          <footer className="workspace-footer">EFE HAZIR GİYİM <span>Finansal Operasyonlar · Test çalışma alanı</span></footer>
        </main>
      </div>
    </div>
  )
}

export function App() {
  return <TestPaymentsProvider><Workspace /></TestPaymentsProvider>
}
