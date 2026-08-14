import { useEffect, useState } from 'react'
import {
  BarChart3, Store, Users, User, ClipboardList, Radar,
  MessageCircle, Settings, LogOut, X, Truck, Bell, RotateCcw, FileText, Receipt,
  Activity, Scale, Video,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, type, radius } from '../lib/darkStyles'

// 24 jul 2026: se elimina la página "Aprobaciones". Todo lo que hacía se puede hacer ya en la
// ficha del establecimiento (vinculaciones y tarifas en "Socios vinculados", verificar el alta
// en "Horario y estado"); su cola de riders llevaba muerta desde que se retiró Shipday.
// Lo único que aportaba de verdad era AVISAR, así que ese contador vive ahora aquí.
//
// 14 ago 2026: la barra deja de ser oscura y deja de ser una lista plana de 16 enlaces.
// - Fondo en papel, como las tarjetas del panel: el resto del ecosistema Pidoo (app,
//   panel del restaurante y panel del socio) es claro, y aquí el bloque oscuro era lo
//   único que no pertenecía a esa familia.
// - Los 16 enlaces se agrupan en 5 bloques por lo que haces en cada uno. Con la lista
//   plana, "Liquidaciones" quedaba pegada a "Mapa en vivo" y "Cargos" a "Creadores":
//   nada indicaba cuáles mueven dinero.
// Los `id` NO cambian: son las claves de la navegación en App.jsx.
const grupos = [
  {
    titulo: 'Operación',
    items: [
      { id: 'dashboard',        label: 'Dashboard',         Icon: BarChart3 },
      // "Mapa en vivo" (MapaAdmin) desaparece: solo pintaba los restaurantes y no
      // servía para operar. Dispatch lo absorbe y además trae la cola de pedidos,
      // el GPS de los socios y la asignación manual.
      { id: 'dispatch',         label: 'Dispatch',          Icon: Radar },
      { id: 'pedidos',          label: 'Pedidos',           Icon: ClipboardList },
    ],
  },
  {
    titulo: 'Negocio',
    items: [
      { id: 'establecimientos', label: 'Establecimientos',  Icon: Store },
      { id: 'socios',           label: 'Socios',            Icon: Users },
      { id: 'usuarios',         label: 'Usuarios',          Icon: User },
      { id: 'creadores',        label: 'Creadores',         Icon: Video },
    ],
  },
  {
    titulo: 'Dinero',
    items: [
      { id: 'liquidaciones',    label: 'Liquidaciones',     Icon: Receipt },
      { id: 'cargos',           label: 'Cargos',            Icon: Scale },
      { id: 'reembolsos',       label: 'Reembolsos',        Icon: RotateCcw },
    ],
  },
  {
    titulo: 'Atención',
    items: [
      { id: 'soporte',          label: 'Soporte',           Icon: MessageCircle },
      { id: 'soporte-rider',    label: 'Soporte rider',     Icon: Truck },
      { id: 'notificaciones',   label: 'Notificaciones',    Icon: Bell },
    ],
  },
  {
    titulo: 'Sistema',
    items: [
      { id: 'salud',            label: 'Salud del sistema', Icon: Activity },
      { id: 'landing-riders',   label: 'Landing Riders',    Icon: FileText },
      { id: 'config',           label: 'Configuración',     Icon: Settings },
    ],
  },
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
    background: colors.paper,
    color: colors.text,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    left: 0,
    top: 0,
    overflow: 'hidden',
    padding: '20px 12px',
    zIndex: mobile ? 999 : 'auto',
    boxShadow: mobile ? '2px 0 20px rgba(26,24,21,0.18)' : 'none',
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
          // El degradado arrancaba en terracotta y dejaba la "P" blanca en 4,43:1
          background: `linear-gradient(135deg, ${colors.terracotta2} 0%, #8F3A18 100%)`,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 900,
          fontSize: 16,
          boxShadow: '0 0 0 1px rgba(197,86,44,0.35), 0 8px 20px -6px rgba(197,86,44,0.45)',
          flexShrink: 0,
        }}>P</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 18,
            fontWeight: 800,
            color: colors.ink,
            letterSpacing: '-0.03em',
            // terracotta a 18px se queda en 4,18:1 sobre papel; terracotta2 sube a 5,5:1
          }}>pid<span style={{ color: colors.terracotta2 }}>oo</span></span>
          <span style={{
            ...type.caption,
            color: colors.stone,
            fontWeight: 600,
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
              color: colors.stone,
              cursor: 'pointer',
              border: 'none',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navegación agrupada */}
      <nav style={{
        flex: 1,
        marginTop: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflowY: 'auto',
      }}>
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo} style={{ marginTop: i === 0 ? 0 : 14 }}>
            <div style={{
              ...type.caption,
              color: colors.stone,
              fontWeight: 600,
              textTransform: 'uppercase',
              padding: '0 10px',
              marginBottom: 4,
            }}>{grupo.titulo}</div>

            {grupo.items.map(item => {
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
                    if (!isActive) e.currentTarget.style.background = colors.cream2
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: mobile ? '11px 10px' : '8px 10px',
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    background: isActive ? colors.terracottaSoft : 'transparent',
                    color: isActive ? colors.onTerracottaSoft : colors.stone,
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 14,
                    border: 'none',
                    textAlign: 'left',
                    width: '100%',
                    fontFamily: type.family,
                    transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  <item.Icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>

                  {/* Contador en vivo: vinculaciones y altas pendientes, soporte del
                      rider sin leer, y vídeos de Creadores sin revisar en 24 h */}
                  {dynamicBadge > 0 && (
                    <span
                      title={`${dynamicBadge} pendiente${dynamicBadge === 1 ? '' : 's'}`}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: radius.full,
                        // terracotta2 y no terracotta: el blanco encima sube de 4,43:1 a 5,9:1
                        background: colors.terracotta2,
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        flexShrink: 0,
                      }}
                    >
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
          </div>
        ))}
      </nav>

      {/* Footer: avatar + name + logout */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 10px',
        borderRadius: 8,
        background: colors.cream2,
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
            ...type.label,
            fontWeight: 600,
            color: colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{userName}</div>
          <div style={{ ...type.caption, color: colors.stone, letterSpacing: 0 }}>Super admin</div>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          style={{
            width: 30, height: 30,
            borderRadius: radius.sm,
            display: 'grid', placeItems: 'center',
            color: colors.stone,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = colors.paper; e.currentTarget.style.color = colors.danger }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.stone }}
        >
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  )
}
