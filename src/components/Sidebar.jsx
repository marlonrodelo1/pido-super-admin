import { useEffect, useState } from 'react'
import {
  BarChart3, Store, Users, User, ClipboardList, Radar,
  MessageCircle, Settings, LogOut, X, Truck, Bell, RotateCcw, FileText, Receipt,
  Activity, Scale, Video, PanelLeftClose, PanelLeftOpen, Workflow, Tag,
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
      { id: 'promociones',      label: 'Promociones',       Icon: Tag },
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
      // Pantalla de lectura: cómo funciona el reparto y el dinero, con las cifras en vivo.
      { id: 'algoritmo',        label: 'Algoritmo',         Icon: Workflow },
      { id: 'config',           label: 'Configuración',     Icon: Settings },
    ],
  },
]

// Ancho de la barra en sus dos estados. `ANCHO_PLEGADA` lo lee también App.jsx
// para el margen del contenido: si los dos números se separan, queda una franja
// muerta o el contenido se mete debajo de la barra.
export const ANCHO_SIDEBAR = 240
export const ANCHO_SIDEBAR_PLEGADA = 64

export default function Sidebar({ active, onChange, onLogout, user, mobile = false, onClose, plegada = false, onPlegar }) {
  // En el cajón de tablet nunca se pliega: allí la barra se abre y se cierra
  // entera, y una tira de iconos sobre el contenido no se entendería.
  const mini = plegada && !mobile
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
    width: mobile ? 260 : mini ? ANCHO_SIDEBAR_PLEGADA : ANCHO_SIDEBAR,
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
    padding: mini ? '20px 8px' : '20px 12px',
    zIndex: mobile ? 999 : 'auto',
    boxShadow: mobile ? '2px 0 20px rgba(26,24,21,0.18)' : 'none',
    animation: mobile ? 'slide-in-left 0.18s ease' : 'none',
    transition: mobile ? 'none' : 'width 0.16s ease, padding 0.16s ease',
  }

  const botonPlegar = onPlegar && !mobile && (
    <button
      onClick={onPlegar}
      title={mini ? 'Desplegar el menú' : 'Plegar el menú a iconos'}
      aria-label={mini ? 'Desplegar el menú' : 'Plegar el menú a iconos'}
      aria-expanded={!mini}
      onMouseEnter={e => { e.currentTarget.style.background = colors.cream2 }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: mini ? 'center' : 'flex-start',
        padding: '8px 10px', marginBottom: 8,
        borderRadius: radius.sm, cursor: 'pointer',
        background: 'transparent', color: colors.stone,
        border: 'none', width: '100%', fontFamily: type.family,
        fontSize: 13, fontWeight: 500, textAlign: 'left',
      }}
    >
      {mini ? <PanelLeftOpen size={17} strokeWidth={1.8} /> : <PanelLeftClose size={17} strokeWidth={1.8} />}
      {!mini && <span>Plegar menú</span>}
    </button>
  )

  return (
    <aside style={sidebarStyle}>
      {/* Brand */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: mini ? 0 : '0 8px',
        justifyContent: mini ? 'center' : 'flex-start',
        marginBottom: 6,
      }}>
        {/* El logo de verdad, del kit de identidad (6 ago 2026):
            `Pidoo-Identidad-Visual/01-logo/svg`, copiado a `public/`.
            Antes era una pastilla naranja con una "P" y la palabra "pidoo"
            escrita con la fuente del panel — parecido, pero no era la marca.
            Plegada va el isotipo (la moto) solo; desplegada, el logo completo. */}
        {mini ? (
          <img
            src="/pidoo-isotipo.svg"
            alt="Pidoo"
            style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <img
              src="/pidoo-logo.svg"
              alt="Pidoo"
              style={{ height: 26, width: 'auto', maxWidth: '100%', objectFit: 'contain', alignSelf: 'flex-start' }}
            />
            <span style={{
              ...type.caption,
              color: colors.stone,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>Super admin</span>
          </div>
        )}
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
          <div key={grupo.titulo} style={{ marginTop: i === 0 ? 0 : mini ? 8 : 14 }}>
            {/* Plegada no cabe el rótulo del grupo, pero la agrupación sí hay que
                conservarla: pasa a ser una línea de separación */}
            {mini ? (
              i > 0 && <div style={{ height: 1, background: colors.border, margin: '0 6px 8px' }} />
            ) : (
              <div style={{
                ...type.caption,
                color: colors.stone,
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '0 10px',
                marginBottom: 4,
              }}>{grupo.titulo}</div>
            )}

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
                  // Plegada, el nombre solo existe en el tooltip del navegador
                  title={mini ? item.label + (dynamicBadge > 0 ? ` · ${dynamicBadge} pendiente${dynamicBadge === 1 ? '' : 's'}` : '') : undefined}
                  aria-label={mini ? item.label : undefined}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = colors.cream2
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent'
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: mini ? 'center' : 'flex-start',
                    gap: 10,
                    padding: mobile ? '11px 10px' : mini ? '9px 0' : '8px 10px',
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
                    position: 'relative',
                  }}
                >
                  <item.Icon size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                  {!mini && (
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  )}

                  {/* Contador en vivo: vinculaciones y altas pendientes, soporte del
                      rider sin leer, y vídeos de Creadores sin revisar en 24 h.
                      Plegada NO se puede perder: es lo único que avisa de que hay
                      trabajo esperando. Pasa a una pastilla sobre el icono. */}
                  {dynamicBadge > 0 && (
                    <span
                      title={`${dynamicBadge} pendiente${dynamicBadge === 1 ? '' : 's'}`}
                      style={{
                        fontSize: mini ? 10 : 11,
                        fontWeight: 700,
                        padding: mini ? '0 4px' : '1px 7px',
                        borderRadius: radius.full,
                        // terracotta2 y no terracotta: el blanco encima sube de 4,43:1 a 5,9:1
                        background: colors.terracotta2,
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        flexShrink: 0,
                        ...(mini ? {
                          position: 'absolute',
                          top: 3,
                          right: 6,
                          minWidth: 15,
                          height: 15,
                          justifyContent: 'center',
                          lineHeight: 1,
                          border: `1.5px solid ${colors.paper}`,
                        } : null),
                      }}
                    >
                      {!mini && (
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: '#fff',
                          animation: 'pulse-p 1.8s infinite',
                        }} />
                      )}
                      {dynamicBadge > 99 ? '99+' : dynamicBadge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {botonPlegar}

      {/* Footer: avatar + name + logout */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        flexDirection: mini ? 'column' : 'row',
        gap: mini ? 6 : 10,
        padding: mini ? '10px 0' : '10px 10px',
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
        }} title={mini ? userEmail : undefined}>{userInitial}</div>
        <div style={{ flex: 1, minWidth: 0, display: mini ? 'none' : 'block' }}>
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
