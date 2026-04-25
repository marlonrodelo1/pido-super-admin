import { useEffect, useState } from 'react'
import { LayoutGrid, Store, User, Users, ClipboardList, MessageCircle, DollarSign, Settings, LogOut, Map, Bell, RotateCcw, FileText, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid, group: 'Operación' },
  { id: 'pedidos', label: 'Pedidos', Icon: ClipboardList, group: 'Operación' },
  { id: 'mapa', label: 'Mapa en vivo', Icon: Map, group: 'Operación' },
  { id: 'socios', label: 'Socios', Icon: Users, group: 'Red' },
  { id: 'establecimientos', label: 'Establecimientos', Icon: Store, group: 'Red' },
  { id: 'usuarios', label: 'Usuarios', Icon: User, group: 'Red' },
  { id: 'finanzas', label: 'Finanzas', Icon: DollarSign, group: 'Negocio' },
  { id: 'reembolsos', label: 'Reembolsos', Icon: RotateCcw, group: 'Negocio' },
  { id: 'notificaciones', label: 'Notificaciones', Icon: Bell, group: 'Plataforma' },
  { id: 'soporte', label: 'Soporte', Icon: MessageCircle, group: 'Plataforma' },
  { id: 'landing-riders', label: 'Landing Riders', Icon: FileText, group: 'Plataforma' },
  { id: 'config', label: 'Configuración', Icon: Settings, group: 'Plataforma' },
]

export default function Sidebar({ active, onChange, onLogout, user, mobile = false, onClose }) {
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    loadPendientes()
    const channel = supabase.channel('sidebar-pendientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_accounts' }, loadPendientes)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadPendientes() {
    const { count } = await supabase.from('rider_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
    setPendientes(count || 0)
  }

  // Render grouped nav
  const groups = []
  menuItems.forEach(it => {
    const g = groups.find(x => x.name === it.group)
    if (g) g.items.push(it)
    else groups.push({ name: it.group, items: [it] })
  })

  const userEmail = user?.email || ''
  const userInitial = (userEmail[0] || 'M').toUpperCase()

  // En modo mobile, el sidebar es un drawer overlay con animación, ancho mayor (260px)
  // y un botón de cerrar.
  const sidebarStyle = mobile
    ? {
        ...styles.sidebar,
        width: 260,
        zIndex: 999,
        boxShadow: '2px 0 20px rgba(15,15,15,0.18)',
        animation: 'slide-in-left 0.18s ease',
      }
    : styles.sidebar

  return (
    <aside style={sidebarStyle}>
      {/* Brand */}
      <div style={styles.brand}>
        <img src="/favicon.svg" alt="Pidoo" style={styles.logo} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={styles.brandTitle}>Pidoo</span>
          <span style={styles.brandSub}>Super Admin</span>
        </div>
        {mobile ? (
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            style={{
              marginLeft: 'auto',
              width: 36, height: 36,
              display: 'grid', placeItems: 'center',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--c-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        ) : (
          <span style={styles.env}>LIVE</span>
        )}
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        {groups.map(g => (
          <div key={g.name}>
            <div style={styles.groupLabel}>{g.name}</div>
            {g.items.map(item => {
              const isActive = active === item.id
              const showBadge = item.id === 'socios' && pendientes > 0
              return (
                <button
                  key={item.id}
                  onClick={() => onChange(item.id)}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--c-surface2)'
                      e.currentTarget.style.color = 'var(--c-text)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--c-muted)'
                    }
                  }}
                  style={{
                    ...styles.navItem,
                    padding: mobile ? '12px 12px' : '8px 10px',
                    fontSize: mobile ? 14 : 13,
                    background: isActive ? 'var(--c-primary-soft)' : 'transparent',
                    color: isActive ? 'var(--c-primary)' : 'var(--c-muted)',
                  }}
                >
                  {isActive && <span style={styles.activeBar} />}
                  <item.Icon
                    size={mobile ? 18 : 16}
                    strokeWidth={1.8}
                    style={{ color: isActive ? 'var(--c-primary)' : 'var(--c-muted)', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  {showBadge && (
                    <span style={styles.badgeLive}>
                      <span style={styles.pulseDot} />
                      {pendientes}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Foot */}
      <div style={styles.foot}>
        <div style={styles.avatar}>{userInitial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.footName}>{userEmail.split('@')[0] || 'admin'}</div>
          <div style={styles.footRole}>Super admin</div>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          style={styles.logoutBtn}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-surface2)'; e.currentTarget.style.color = 'var(--c-text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-muted)' }}
        >
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    width: 220,
    minHeight: '100vh',
    background: 'var(--c-surface)',
    borderRight: '1px solid var(--c-border)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    left: 0, top: 0,
    overflow: 'hidden',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 18px',
    height: 56,
    borderBottom: '1px solid var(--c-border)',
  },
  logo: {
    width: 28, height: 28, borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(255,107,44,0.35), 0 8px 20px -6px rgba(255,107,44,0.45)',
    flexShrink: 0,
    display: 'block',
  },
  brandTitle: { fontWeight: 800, fontSize: 14, letterSpacing: '-0.3px', color: 'var(--c-text)' },
  brandSub: {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em',
    color: 'var(--c-muted)', fontWeight: 700,
  },
  env: {
    marginLeft: 'auto',
    fontSize: 9, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase',
    color: 'var(--c-primary)',
    padding: '3px 6px',
    border: '1px solid var(--c-primary-border)',
    background: 'var(--c-primary-soft)',
    borderRadius: 4,
  },
  nav: {
    padding: '12px 10px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  groupLabel: {
    margin: '14px 0 6px',
    padding: '0 10px',
    fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
    color: 'var(--c-muted)', fontWeight: 700,
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 7,
    border: 'none', cursor: 'pointer',
    fontFamily: "'Inter', sans-serif", fontSize: 13,
    fontWeight: 500,
    textAlign: 'left', width: '100%',
    position: 'relative',
    transition: 'background 0.12s, color 0.12s',
  },
  activeBar: {
    content: '',
    position: 'absolute',
    left: -10, top: 6, bottom: 6,
    width: 2,
    background: 'var(--c-primary)',
    borderRadius: '0 2px 2px 0',
  },
  badgeLive: {
    marginLeft: 'auto',
    fontSize: 10, fontWeight: 700,
    padding: '1px 6px', borderRadius: 999,
    background: 'var(--c-primary-soft)',
    color: 'var(--c-primary)',
    border: '1px solid var(--c-primary-border)',
    display: 'flex', alignItems: 'center', gap: 4,
  },
  pulseDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: 'var(--c-primary)',
    animation: 'pulse-p 1.8s infinite',
  },
  foot: {
    padding: 12,
    borderTop: '1px solid var(--c-border)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  avatar: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--c-surface2)',
    border: '1px solid var(--c-border)',
    display: 'grid', placeItems: 'center',
    fontWeight: 700, fontSize: 11, color: 'var(--c-text)',
    flexShrink: 0,
  },
  footName: {
    fontSize: 12, fontWeight: 600, color: 'var(--c-text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  footRole: { fontSize: 10, color: 'var(--c-muted)' },
  logoutBtn: {
    width: 28, height: 28, borderRadius: 7,
    display: 'grid', placeItems: 'center',
    color: 'var(--c-muted)',
    background: 'transparent', border: '1px solid transparent',
    cursor: 'pointer', flexShrink: 0,
    transition: 'background 0.12s, color 0.12s',
  },
}
