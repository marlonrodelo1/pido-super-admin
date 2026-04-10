import { LayoutGrid, Store, Users, User, ClipboardList, MessageCircle, DollarSign, Settings, LogOut, Map, Bell, RotateCcw } from 'lucide-react'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { id: 'establecimientos', label: 'Establecimientos', Icon: Store },
  { id: 'socios', label: 'Socios / Riders', Icon: Users },
  { id: 'usuarios', label: 'Usuarios', Icon: User },
  { id: 'pedidos', label: 'Pedidos', Icon: ClipboardList },
  { id: 'mapa', label: 'Mapa en vivo', Icon: Map },
  { id: 'notificaciones', label: 'Notificaciones', Icon: Bell },
  { id: 'soporte', label: 'Soporte', Icon: MessageCircle },
  { id: 'finanzas', label: 'Finanzas', Icon: DollarSign },
  { id: 'reembolsos', label: 'Reembolsos', Icon: RotateCcw },
  { id: 'config', label: 'Configuracion', Icon: Settings },
]

export default function Sidebar({ active, onChange, onLogout }) {
  return (
    <div style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={{ fontWeight: 800, fontSize: 22, color: '#FF6B2C', letterSpacing: -1 }}>pidoo</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Super Admin</span>
      </div>

      <nav style={styles.nav}>
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              ...styles.navItem,
              background: active === item.id ? 'rgba(255,107,44,0.15)' : 'transparent',
              color: active === item.id ? '#FF6B2C' : 'rgba(255,255,255,0.5)',
              fontWeight: active === item.id ? 700 : 500,
            }}
          >
            <item.Icon size={18} strokeWidth={active === item.id ? 2.2 : 1.8} />
            {item.label}
          </button>
        ))}
      </nav>

      <button onClick={onLogout} style={styles.logout}>
        <LogOut size={16} strokeWidth={2} />
        Cerrar sesion
      </button>
    </div>
  )
}

const styles = {
  sidebar: {
    width: 240, minHeight: '100vh', background: '#111111', borderRight: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', flexDirection: 'column', padding: '20px 12px', position: 'fixed', left: 0, top: 0,
  },
  logo: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 12px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16,
  },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
    border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    transition: 'all 0.15s', textAlign: 'left', width: '100%',
  },
  logout: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10,
    border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
    color: '#EF4444', background: 'transparent', fontWeight: 600, marginTop: 'auto',
  },
}
