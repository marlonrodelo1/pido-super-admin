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

function AppContent() {
  const { user, loading, logout } = useAdmin()
  const [seccion, setSeccion] = useState('dashboard')

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#FF6B2C', letterSpacing: -1 }}>pidoo</div>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar active={seccion} onChange={setSeccion} onLogout={logout} />
      <main style={{ flex: 1, marginLeft: 240, padding: '28px 32px', background: '#0D0D0D', minHeight: '100vh' }}>
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
      background: isError ? '#7F1D1D' : '#14532D',
      border: `1px solid ${isError ? '#DC2626' : '#16A34A'}`,
      color: '#fff', borderRadius: 12, padding: '12px 18px',
      fontSize: 13, fontWeight: 600, textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {isError ? '⚠️ ' : '✅ '}{state.msg}
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
    <div onClick={() => responder(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1A1A1A', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 340, border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F5', marginBottom: 20, lineHeight: 1.5, textAlign: 'center' }}>{state.mensaje}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => responder(false)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => responder(true)} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: '#EF4444', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
