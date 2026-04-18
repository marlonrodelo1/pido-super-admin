import { useState, useEffect } from 'react'
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
import './index.css'

const FONT = "'Inter', system-ui, -apple-system, sans-serif"

function AppContent() {
  const { user, loading, logout } = useAdmin()
  const [seccion, setSeccion] = useState('dashboard')

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: FONT, background: '#0D0D0D' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg,#FF6B2C,#FF3D00)',
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 900, fontSize: 14,
            boxShadow: '0 0 0 1px rgba(255,107,44,0.35), 0 8px 20px -6px rgba(255,107,44,0.45)',
          }}>P</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#F5F5F5', letterSpacing: '-0.3px' }}>Pidoo</div>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: FONT, background: '#0D0D0D' }}>
      <Sidebar active={seccion} onChange={setSeccion} onLogout={logout} user={user} />
      <main style={{ flex: 1, marginLeft: 220, padding: '24px 28px 40px', background: '#0D0D0D', minHeight: '100vh' }}>
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
        {seccion === 'config' && <Configuracion />}
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
      background: isError ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${isError ? 'rgba(239,68,68,0.32)' : 'rgba(255,255,255,0.14)'}`,
      color: isError ? '#F8B4B4' : '#F5F5F5',
      borderRadius: 10, padding: '10px 16px',
      fontSize: 13, fontWeight: 600, textAlign: 'center',
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
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
    <div onClick={() => responder(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)', fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#161616', borderRadius: 14, padding: '22px 20px', width: '100%', maxWidth: 360, border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#F5F5F5', marginBottom: 20, lineHeight: 1.5, textAlign: 'center' }}>{state.mensaje}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => responder(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'rgba(245,245,245,0.62)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => responder(true)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.12)', color: '#F8B4B4', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
