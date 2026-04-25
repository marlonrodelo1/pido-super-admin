import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { AdminProvider, useAdmin } from './context/AdminContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Establecimientos from './pages/Establecimientos'
import Usuarios from './pages/Usuarios'
import Pedidos from './pages/Pedidos'
import SoporteAdmin from './pages/SoporteAdmin'
import Finanzas from './pages/Finanzas'
import Configuracion from './pages/Configuracion'
import Notificaciones from './pages/Notificaciones'
import MapaAdmin from './pages/MapaAdmin'
import Reembolsos from './pages/Reembolsos'
import Repartidores from './pages/Repartidores'
import Socios from './pages/Socios'
import LandingRiders from './pages/LandingRiders'
import { useMediaQuery, BP } from './lib/useMediaQuery'
import './index.css'

const SECCION_TITULOS = {
  dashboard: 'Dashboard',
  establecimientos: 'Establecimientos',
  usuarios: 'Usuarios',
  pedidos: 'Pedidos',
  mapa: 'Mapa en vivo',
  notificaciones: 'Notificaciones',
  soporte: 'Soporte',
  finanzas: 'Finanzas',
  reembolsos: 'Reembolsos',
  repartidores: 'Repartidores',
  socios: 'Socios',
  'landing-riders': 'Landing Riders',
  config: 'Configuración',
}

const FONT = "'Inter', system-ui, -apple-system, sans-serif"

function AppContent() {
  const { user, loading, logout } = useAdmin()
  const [seccion, setSeccion] = useState('dashboard')
  const isTabletDown = useMediaQuery(BP.tabletDown)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Cerrar drawer al cambiar de sección en tablet
  useEffect(() => {
    if (isTabletDown) setSidebarOpen(false)
  }, [seccion, isTabletDown])

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (isTabletDown && sidebarOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isTabletDown, sidebarOpen])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: FONT, background: 'var(--c-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg,#FF6B2C,#FF3D00)',
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 900, fontSize: 14,
            boxShadow: '0 0 0 1px rgba(255,107,44,0.35), 0 8px 20px -6px rgba(255,107,44,0.45)',
          }}>P</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.3px' }}>Pidoo</div>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  const drawerOpen = isTabletDown && sidebarOpen
  const userInitial = (user?.email?.[0] || 'M').toUpperCase()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: FONT, background: 'var(--c-bg)' }}>
      {/* Sidebar: en desktop fijo siempre visible; en tablet se muestra como drawer overlay */}
      {(!isTabletDown || drawerOpen) && (
        <Sidebar
          active={seccion}
          onChange={setSeccion}
          onLogout={logout}
          user={user}
          mobile={isTabletDown}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Backdrop oscuro cuando drawer abierto */}
      {drawerOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main
        style={{
          flex: 1,
          marginLeft: isTabletDown ? 0 : 220,
          background: 'var(--c-bg)',
          minHeight: '100vh',
        }}
      >
        {/* Topbar visible solo en tablet */}
        {isTabletDown && (
          <header
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 14px',
              background: 'var(--c-surface)',
              borderBottom: '1px solid var(--c-border)',
              zIndex: 30,
              boxShadow: '0 1px 2px rgba(15,15,15,0.04)',
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
              style={{
                width: 44, height: 44,
                display: 'grid', placeItems: 'center',
                borderRadius: 10,
                background: 'transparent',
                color: 'var(--c-text)',
                cursor: 'pointer',
              }}
            >
              <Menu size={22} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg,#FF6B2C,#FF3D00)',
                display: 'grid', placeItems: 'center',
                color: '#fff', fontWeight: 900, fontSize: 13,
              }}>P</div>
              <div style={{
                fontSize: 15, fontWeight: 800, color: 'var(--c-text)',
                letterSpacing: '-0.3px', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {SECCION_TITULOS[seccion] || 'Pidoo'}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 9, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase',
              color: 'var(--c-primary)',
              padding: '3px 6px',
              border: '1px solid var(--c-primary-border)',
              background: 'var(--c-primary-soft)',
              borderRadius: 4,
            }}>LIVE</span>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--c-surface2)',
              border: '1px solid var(--c-border)',
              display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 13, color: 'var(--c-text)',
            }}>{userInitial}</div>
          </header>
        )}

        <div
          className={`admin-main-container ${isTabletDown ? 'admin-main-with-topbar' : ''}`}
          style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 32px 48px' }}
        >
          {seccion === 'dashboard' && <Dashboard />}
          {seccion === 'establecimientos' && <Establecimientos />}
          {seccion === 'usuarios' && <Usuarios />}
          {seccion === 'pedidos' && <Pedidos />}
          {seccion === 'mapa' && <MapaAdmin />}
          {seccion === 'notificaciones' && <Notificaciones />}
          {seccion === 'soporte' && <SoporteAdmin />}
          {seccion === 'finanzas' && <Finanzas />}
          {seccion === 'reembolsos' && <Reembolsos />}
          {seccion === 'repartidores' && <Repartidores />}
          {seccion === 'socios' && <Socios />}
          {seccion === 'landing-riders' && <LandingRiders />}
          {seccion === 'config' && <Configuracion />}
        </div>
      </main>
      <ToastNotification />
      <ConfirmModal />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AdminProvider>
        <AppContent />
      </AdminProvider>
    </ErrorBoundary>
  )
}

// ── Toast notifications ──────────────────────────────────────────────────────
let _setToastState = null

export function toast(msg, type = 'success') {
  if (_setToastState) _setToastState({ visible: true, msg, type })
}

function ToastNotification() {
  const [state, setState] = useState({ visible: false, msg: '', type: 'success' })
  useEffect(() => { _setToastState = setState }, [])

  useEffect(() => {
    if (!state.visible) return
    const t = setTimeout(() => setState(s => ({ ...s, visible: false })), state.type === 'error' ? 4000 : 3000)
    return () => clearTimeout(t)
  }, [state.visible, state.msg])

  if (!state.visible) return null

  const isError = state.type === 'error'
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9998, maxWidth: 'calc(100% - 40px)', width: 'max-content',
      background: isError ? 'var(--c-danger-soft)' : 'var(--c-surface)',
      border: `1px solid ${isError ? 'var(--c-danger)' : 'var(--c-border)'}`,
      color: isError ? 'var(--c-danger)' : 'var(--c-text)',
      borderRadius: 10, padding: '10px 16px',
      fontSize: 13, fontWeight: 600, textAlign: 'center',
      boxShadow: '0 12px 32px rgba(15,15,15,0.12)',
      fontFamily: FONT,
    }}>
      {state.msg}
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
let _confirmResolve = null
let _setConfirmState = null

export function confirmar(mensaje) {
  return new Promise(resolve => {
    _confirmResolve = resolve
    if (_setConfirmState) _setConfirmState({ visible: true, mensaje })
  })
}

function ConfirmModal() {
  const [state, setState] = useState({ visible: false, mensaje: '' })
  useEffect(() => { _setConfirmState = setState }, [])

  if (!state.visible) return null

  const responder = (val) => {
    setState({ visible: false, mensaje: '' })
    if (_confirmResolve) { _confirmResolve(val); _confirmResolve = null }
  }

  return (
    <div onClick={() => responder(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)', fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--c-surface)', borderRadius: 14, padding: '22px 20px', width: '100%', maxWidth: 360, border: '1px solid var(--c-border)', boxShadow: '0 24px 60px rgba(15,15,15,0.18)' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)', marginBottom: 20, lineHeight: 1.5, textAlign: 'center' }}>{state.mensaje}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => responder(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => responder(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--c-danger)', background: 'var(--c-danger-soft)', color: 'var(--c-danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
