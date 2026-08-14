import { useEffect, useState } from 'react'
import {
  BarChart3, Store, Users, User, ClipboardList, Map,
  MessageCircle, Settings, LogOut, X, Truck, Bell, RotateCcw, FileText, Receipt,
  Activity, Scale, Video,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors } from '../lib/darkStyles'

// Bundle s6-admin → AdminSidebar: nav plana (sin grupos), dark ink, badge NUEVO terracotta.
// Mantenemos los ítems extra que la web ya tenía (mapa, soporte rider, landing, etc.)
//
// 24 jul 2026: se elimina la página "Aprobaciones". Todo lo que hacía se puede hacer ya en la
// ficha del establecimiento (vinculaciones y tarifas en "Socios vinculados", verificar el alta
// en "Horario y estado"); su cola de riders llevaba muerta desde que se retiró Shipday.
// Lo único que aportaba de verdad era AVISAR, así que ese contador vive ahora aquí.
const menuItems = [
  { id: 'dashboard',          label: 'Dashboard',          Icon: BarChart3 },
  { id: 'establecimientos',   label: 'Establecimientos',   Icon: Store },
  { id: 'socios',             label: 'Socios',             Icon: Users },
  { id: 'usuarios',           label: 'Usuarios',           Icon: User },
  { id: 'pedidos',            label: 'Pedidos',            Icon: ClipboardList },
  { id: 'mapa',               label: 'Mapa en vivo',       Icon: Map },
  { id: 'reembolsos',         label: 'Reembolsos',         Icon: RotateCcw },
  { id: 'liquidaciones',      label: 'Liquidaciones',      Icon: Receipt },
  { id: 'cargos',             label: 'Cargos',             Icon: Scale },
  { id: 'creadores',          label: 'Creadores',          Icon: Video },
  { id: 'notificaciones',     label: 'Notificaciones',     Icon: Bell },
  { id: 'soporte',            label: 'Soporte',            Icon: MessageCircle },
  { id: 'soporte-rider',      label: 'Soporte rider',      Icon: Truck },
  { id: 'landing-riders',     label: 'Landing Riders',     Icon: FileText },
  { id: 'salud',              label: 'Salud del sistema',  Icon: Activity },
  { id: 'config',             label: 'Configuración',      Icon: Settings },
]

export default function Sidebar({ active, onChange, onLogout, user, mobile = false, onClose }) {
  const [pendientes, setPendientes] = useState(0)
  const [unreadRider, setUnreadRider] = useState(0)
  const [creadoresPend, setCreadoresPend] = useState(0)

  useEffect(() => {
    loadPendientes()
    loadUnreadRider()
    loadCreadoresPend()
    const ch1 = supabase.channel('sidebar-pendientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'socio_establecimiento' }, loadPendientes)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'establecimientos' }, loadPendientes)
      .subscribe()
    const ch2 = supabase.channel('sidebar-unread-rider')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_support_messages' }, loadUnreadRider)
      .subscribe()
    // Creadores va por polling y NO por realtime: `participaciones_creador` no está
    // en la publicación `supabase_realtime`, así que un .subscribe() devolvería
    // SUBSCRIBED y no llegaría jamás un evento — fallo mudo.
    const t = setInterval(loadCreadoresPend, 60000)
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); clearInterval(t) }
  }, [])

  // Lo que espera decisión del superadmin, agregado sobre "Establecimientos" (donde se resuelve):
  // solicitudes de vinculación, propuestas de tarifa (¡estas se aplican solas al vencer!) y
  // altas de restaurante sin verificar (invisibles en la app del cliente hasta que se activan).
  async function loadPendientes() {
    const [vinc, tarifas, altas] = await Promise.all([
      supabase.from('socio_establecimiento').select('id', { count: 'exact', head: true })
        .in('estado', ['pendiente', 'solicitada']),
      supabase.from('socio_establecimiento').select('id', { count: 'exact', head: true })
        .not('tarifa_pendiente', 'is', null),
      supabase.from('establecimientos').select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente_verificacion'),
    ])
    setPendientes((vinc.count || 0) + (tarifas.count || 0) + (altas.count || 0))
  }

  async function loadUnreadRider() {
    const { count } = await supabase.from('rider_support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('remitente', 'rider')
      .eq('leido', false)
    setUnreadRider(count || 0)
  }

  // Vídeos en juego que llevan más de 24 h sin que nadie mire sus visualizaciones.
  // Con las lecturas a mano, el enganche del cliente se pierde por aquí mucho antes
  // que por volumen: ve su barra congelada varios días y deja de mirar.
  async function loadCreadoresPend() {
    const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { count } = await supabase.from('participaciones_creador')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['activa', 'en_espera_tope'])
      .or(`ultima_revision_at.is.null,ultima_revision_at.lt.${hace24h}`)
    setCreadoresPend(count || 0)
  }

  const userEmail = user?.email || ''
  const userInitial = (userEmail[0] || 'M').toUpperCase()
  const userName = userEmail.split('@')[0] || 'admin'

  const sidebarStyle = {
    width: mobile ? 260 : 240,
    minHeight: '100vh',
    background: colors.ink,
    color: colors.cream,
    borderRight: '1px solid #3A3530',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    left: 0,
    top: 0,
    overflow: 'hidden',
    padding: '20px 12px',
    zIndex: mobile ? 999 : 'auto',
    boxShadow: mobile ? '2px 0 20px rgba(0,0,0,0.35)' : 'none',
    animation: mobile ? 'slide-in-left 0.18s ease' : 'none',
  }

  return (
    <aside style={sidebarStyle}>
      {/* Brand */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 8px',
        marginBottom: 6,
      }}>
        {/* Logo block: 32x32 terracotta tile with white "P" */}
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: `linear-gradient(135deg, ${colors.terracotta} 0%, ${colors.terracotta2} 100%)`,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 900,
          fontSize: 16,
          boxShadow: '0 0 0 1px rgba(197,86,44,0.35), 0 8px 20px -6px rgba(197,86,44,0.45)',
          flexShrink: 0,
        }}>P</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 17,
            fontWeight: 800,
            color: colors.cream,
            letterSpacing: '-0.3px',
          }}>pidoo</span>
          <span style={{
            fontSize: 9,
            color: colors.stone2,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>Super admin</span>
        </div>
        {mobile && (
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            style={{
              width: 32, height: 32,
              display: 'grid', placeItems: 'center',
              borderRadius: 8,
              background: 'transparent',
              color: '#A8A29E',
              cursor: 'pointer',
              border: 'none',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav items (flat, no groups) */}
      <nav style={{
        flex: 1,
        marginTop: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
      }}>
        {menuItems.map(item => {
          const isActive = active === item.id
          const dynamicBadge =
            item.id === 'establecimientos' ? pendientes :
            item.id === 'soporte-rider' ? unreadRider :
            item.id === 'creadores' ? creadoresPend :
            0

          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = colors.cream
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#A8A29E'
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: mobile ? '12px 10px' : '9px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: isActive ? colors.cream : '#A8A29E',
                fontWeight: isActive ? 600 : 500,
                fontSize: mobile ? 14 : 14,
                border: 'none',
                textAlign: 'left',
                width: '100%',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <item.Icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>

              {/* Badge estático "NUEVO" terracotta */}
              {item.badge && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: colors.terracotta,
                  color: '#fff',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}>{item.badge}</span>
              )}

              {/* Badge dinámico (contadores live) */}
              {dynamicBadge > 0 && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: colors.terracotta,
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#fff',
                    animation: 'pulse-p 1.8s infinite',
                  }} />
                  {dynamicBadge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer: avatar + name + logout */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 10px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
      }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: '50%',
          // terracotta a secas deja el blanco en 4,43:1; terracotta2 lo sube a 5,9:1
          background: colors.terracotta2,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}>{userInitial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: colors.cream,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{userName}</div>
          <div style={{ fontSize: 11, color: '#A8A29E' }}>Super admin</div>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          style={{
            width: 28, height: 28,
            borderRadius: 7,
            display: 'grid', placeItems: 'center',
            color: '#A8A29E',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = colors.cream }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A8A29E' }}
        >
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  )
}
