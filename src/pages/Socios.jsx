import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type } from '../lib/darkStyles'
import {
  Card, StatCard, Chip, EstadoBadge, GlossyBtn, GhostBtn, MiniBtn,
  Segmented, PillTabs, Toggle, Vacio, fmtEUR,
} from '../lib/ui'
import {
  Users, ExternalLink, Plus, Eye, EyeOff, ChevronRight, ArrowLeft, X, Save, KeyRound,
  Search, Truck, Store,
  Pencil, Check, AlertCircle, Copy, Phone, Mail, Globe, AtSign, Music, Trash2,
} from 'lucide-react'
import { toast, confirmar } from '../App'
import ResetPasswordModal from '../components/ResetPasswordModal'
import EliminarEntidadModal from '../components/EliminarEntidadModal'

// ──────────────────────────────────────────────────────────────────────────────
// NOTA SOBRE EL MODELO DE DATOS
// ──────────────────────────────────────────────────────────────────────────────
// `rider_accounts` NO tiene FK directa a `socios`. La relación se determina por
// `shipday_api_key` (los rider_accounts cuya `shipday_api_key` coincide con
// la del socio se consideran su "cuenta principal"; si el socio tiene
// empleados con OTRAS API keys, esas cuentas no se pueden vincular
// programáticamente y deben gestionarse desde Shipday del socio).
//
// Como heurística adicional usamos `establecimiento_origen_id`: si un rider fue
// creado desde un establecimiento al que el socio está vinculado, también lo
// listamos como "rider en su red".
//
// Fuente principal de pedidos del socio: `pedidos.socio_id`.
// Ganancias del socio: cálculo en vivo desde pedidos entregados (envío + 10% subtotal + propina).
// ──────────────────────────────────────────────────────────────────────────────

const ESTADOS_VINC = ['pendiente', 'activa', 'rechazada']

// ──────────────────────────────────────────────────────────────────────────────
// QUIÉN ESTÁ EN LÍNEA
// ──────────────────────────────────────────────────────────────────────────────
// ⚠️ Antes esto salía de `rider_status.is_online`. Esa tabla es de Shipday, tiene
// CERO filas y ya no la alimenta ningún cron, así que la pantalla decía "0 online"
// y "0/1 online" en los once socios, SIEMPRE — incluso con tres repartiendo.
// Es el mismo fallo que tenía el modal de asignación de Dispatch.
//
// La verdad está en `socios`: la PERSONA es quien se pone en servicio y quien
// manda el GPS. Y hacen falta las dos cosas: con el GPS más viejo de 12 min el
// socio sigue diciendo "En línea" pero el dispatcher NO le puede dar pedidos
// porque no sabe dónde está (mismo umbral que el cron 28 de auto-offline).
//
// Por eso son TRES estados y no dos, igual que en Dispatch.
const GPS_FRESCO_MIN = 12

// `socios` tiene DOS columnas de posición, `last_location_at` y `last_gps_at`, y hoy se
// escriben a la vez. La que decide de verdad es `last_location_at`: es la que mira el filtro
// duro del dispatcher (`create-shipday-order` v59, MAX_LOC_AGE_MIN). Se lee esa primero para
// que el panel no pueda decir "En línea" de alguien a quien el motor descarta.
export function ultimaPosicion(s) {
  return s?.last_location_at || s?.last_gps_at || null
}

export function estadoLineaSocio(s) {
  if (!s?.en_servicio) return 'fuera'
  const iso = ultimaPosicion(s)
  const t = iso ? new Date(iso).getTime() : 0
  const fresco = t > 0 && (Date.now() - t) < GPS_FRESCO_MIN * 60000
  return fresco ? 'disponible' : 'sin_gps'
}

const LINEA = {
  disponible: { tono: 'sage',    label: 'En línea',  ayuda: 'En servicio y con posición reciente: puede recibir pedidos' },
  sin_gps:    { tono: 'warning', label: 'Sin GPS',   ayuda: `En servicio pero sin posición desde hace más de ${GPS_FRESCO_MIN} min: el dispatcher no le puede asignar` },
  fuera:      { tono: 'neutral', label: 'Fuera',     ayuda: 'No está en servicio' },
}

function hace(iso) {
  if (!iso) return 'nunca'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

// Las pestañas de la ficha van con `PillTabs`, que espera { value, label, count }.
const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'riders', label: 'Riders' },
  { value: 'restaurantes', label: 'Restaurantes' },
  { value: 'pedidos', label: 'Pedidos' },
  { value: 'finanzas', label: 'Balances' },
  { value: 'config', label: 'Configuración' },
]

export default function Socios() {
  const [socios, setSocios] = useState([])
  const [riderAccounts, setRiderAccounts] = useState([])
  const [vinculaciones, setVinculaciones] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)

  // Filtros listado
  const [buscar, setBuscar] = useState('')
  const [fEstado, setFEstado] = useState('todos') // todos | activos | inactivos
  const [fOnline, setFOnline] = useState('todos') // todos | online
  const [fMarketplace, setFMarketplace] = useState('todos') // todos | activos | inactivos

  // Vista detalle
  const [socioActivo, setSocioActivo] = useState(null) // socio object
  const [tab, setTab] = useState('resumen')

  // Modales
  const [showNuevo, setShowNuevo] = useState(false)
  const [resetPwdSocio, setResetPwdSocio] = useState(null)
  const [editSocio, setEditSocio] = useState(null)
  const [eliminarSocio, setEliminarSocio] = useState(null)

  useEffect(() => { load() }, [])

  // Realtime: el estado en línea sale de `socios` (en_servicio + posición),
  // que es justo lo que el socio actualiza al ponerse en servicio y al latir.
  useEffect(() => {
    const channel = supabase.channel('socios-hub-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_accounts' }, () => loadRiders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'socios' }, () => loadSocios())
      .subscribe()

    // Cada 30s se recargan los socios aunque no llegue nada por realtime. No es
    // solo por si falla: la frescura del GPS CADUCA con el reloj, así que sin
    // volver a pintar, un socio se quedaría "En línea" en pantalla para siempre.
    const interval = setInterval(() => { loadSocios() }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  async function load() {
    setLoading(true)
    await Promise.all([loadSocios(), loadRiders(), loadVinc(), loadBalances()])
    setLoading(false)
  }

  async function loadSocios() {
    const { data } = await supabase.from('socios').select('*').order('created_at', { ascending: false })
    setSocios(data || [])
    return data || []
  }

  async function loadRiders() {
    const { data } = await supabase.from('rider_accounts').select('*').order('created_at', { ascending: false })
    setRiderAccounts(data || [])
  }

  async function loadVinc() {
    const { data } = await supabase.from('socio_establecimiento')
      .select('id, socio_id, establecimiento_id, estado, exclusivo, es_captador, destacado, orden_destacado, solicitado_at, aceptado_at, establecimientos(id, nombre, logo_url)')
      .order('solicitado_at', { ascending: false })
    setVinculaciones(data || [])
  }

  async function loadBalances() {
    // La deuda al socio NO está materializada en ninguna tabla; se calcula en vivo
    // desde los pedidos entregados de cada socio (envío + 10% subtotal + propina).
    const lunes = new Date()
    lunes.setHours(0, 0, 0, 0)
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7)) // lunes de esta semana
    const { data } = await supabase.from('pedidos')
      .select('socio_id, coste_envio, subtotal, propina, created_at')
      .eq('estado', 'entregado')
      .not('socio_id', 'is', null)
    const map = {}
    ;(data || []).forEach(p => {
      const ganado = (Number(p.coste_envio) || 0) + (Number(p.subtotal) || 0) * 0.10 + (Number(p.propina) || 0)
      const e = map[p.socio_id] || { ganado_total: 0, ganado_semana: 0, pedidos_count: 0 }
      e.ganado_total += ganado
      e.pedidos_count += 1
      if (new Date(p.created_at) >= lunes) e.ganado_semana += ganado
      map[p.socio_id] = e
    })
    setBalances(map)
  }

  // Determina los rider_accounts (carriers) de un socio:
  // 1) Match directo por rider_accounts.socio_id (prioritario, modelo nuevo)
  // 2) Fallback: match por shipday_api_key (compatibilidad pre-migración)
  // 3) Fallback: establecimiento_origen_id (legacy, anterior al modelo socio)
  const ridersBySocio = useMemo(() => {
    const map = {}
    socios.forEach(s => {
      const ridersDelSocio = []

      // 1) Match directo por socio_id
      riderAccounts.forEach(r => {
        if (r.socio_id && r.socio_id === s.id) {
          ridersDelSocio.push({ ...r, _matchBy: 'socio_id' })
        }
      })

      // 2) Match por API key (riders que aún no tienen socio_id seteado)
      if (s.shipday_api_key) {
        riderAccounts.forEach(r => {
          if (!r.socio_id && r.shipday_api_key === s.shipday_api_key) {
            if (!ridersDelSocio.some(x => x.id === r.id)) {
              ridersDelSocio.push({ ...r, _matchBy: 'api_key' })
            }
          }
        })
      }

      // 3) Match por establecimiento_origen_id (legacy)
      const estIdsSocio = vinculaciones
        .filter(v => v.socio_id === s.id && v.estado === 'activa')
        .map(v => v.establecimiento_id)
      if (estIdsSocio.length > 0) {
        riderAccounts.forEach(r => {
          if (!r.socio_id && r.establecimiento_origen_id && estIdsSocio.includes(r.establecimiento_origen_id)) {
            if (!ridersDelSocio.some(x => x.id === r.id)) {
              ridersDelSocio.push({ ...r, _matchBy: 'establecimiento_origen' })
            }
          }
        })
      }

      map[s.id] = ridersDelSocio
    })
    return map
  }, [socios, riderAccounts, vinculaciones])

  const countsRest = useMemo(() => {
    const c = {}
    vinculaciones.forEach(v => {
      if (v.estado === 'activa') c[v.socio_id] = (c[v.socio_id] || 0) + 1
    })
    return c
  }, [vinculaciones])

  const sociosFiltered = useMemo(() => {
    return socios.filter(s => {
      if (fEstado === 'activos' && !s.activo) return false
      if (fEstado === 'inactivos' && s.activo) return false
      if (fMarketplace === 'activos' && !s.marketplace_activo) return false
      if (fMarketplace === 'inactivos' && s.marketplace_activo) return false
      if (fOnline === 'online' && estadoLineaSocio(s) !== 'disponible') return false
      if (fOnline === 'sin_gps' && estadoLineaSocio(s) !== 'sin_gps') return false
      if (buscar) {
        const q = buscar.toLowerCase()
        if (!(s.nombre_comercial || '').toLowerCase().includes(q)
          && !(s.nombre || '').toLowerCase().includes(q)
          && !(s.slug || '').toLowerCase().includes(q)
          && !(s.email || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [socios, fEstado, fMarketplace, fOnline, buscar])

  const stats = useMemo(() => {
    const activos = socios.filter(s => s.activo).length
    const marketplaces = socios.filter(s => s.marketplace_activo && s.slug).length
    const online = socios.filter(s => estadoLineaSocio(s) === 'disponible').length
    const sinGps = socios.filter(s => estadoLineaSocio(s) === 'sin_gps').length
    const pendientes = riderAccounts.filter(r => r.estado === 'pendiente').length
    return { activos, marketplaces, online, sinGps, pendientes }
  }, [socios, riderAccounts])

  async function toggleActivo(s) {
    const { error } = await supabase.from('socios').update({ activo: !s.activo }).eq('id', s.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(!s.activo ? 'Socio activado' : 'Socio desactivado')
    loadSocios()
  }

  async function toggleMarketplace(s) {
    const { error } = await supabase.from('socios').update({ marketplace_activo: !s.marketplace_activo }).eq('id', s.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(!s.marketplace_activo ? 'Marketplace abierto' : 'Marketplace cerrado')
    loadSocios()
  }

  // ── Vista DETALLE ──
  if (socioActivo) {
    const sActual = socios.find(s => s.id === socioActivo.id) || socioActivo
    return (
      <>
        <SocioDetalle
          socio={sActual}
          riders={ridersBySocio[sActual.id] || []}
          vinculaciones={vinculaciones.filter(v => v.socio_id === sActual.id)}
          balance={balances[sActual.id]}
          tab={tab}
          setTab={setTab}
          onBack={() => { setSocioActivo(null); setTab('resumen') }}
          onReload={load}
          onResetPwd={() => setResetPwdSocio(sActual)}
          onEdit={() => setEditSocio(sActual)}
          onDelete={() => setEliminarSocio(sActual)}
          onToggleActivo={() => toggleActivo(sActual)}
          onToggleMarketplace={() => toggleMarketplace(sActual)}
        />
        {eliminarSocio && (
          <EliminarEntidadModal
            tipo="socio"
            entidad={eliminarSocio}
            onClose={() => setEliminarSocio(null)}
            onDeleted={() => {
              const id = eliminarSocio.id
              setEliminarSocio(null)
              setSocioActivo(null)
              setSocios(prev => prev.filter(s => s.id !== id))
              load()
            }}
          />
        )}
      </>
    )
  }

  // ── Vista LISTADO ──
  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Socios</h1>
          <div style={{ ...type.body, color: colors.stone }}>
            {socios.length} socio{socios.length === 1 ? '' : 's'} registrado{socios.length === 1 ? '' : 's'}
            {sociosFiltered.length !== socios.length && ` · ${sociosFiltered.length} con los filtros actuales`}
          </div>
        </div>
        <GlossyBtn onClick={() => setShowNuevo(true)}>
          <Plus size={15} /> Nuevo socio
        </GlossyBtn>
      </div>

      {/* KPIs */}
      <div className="ds-cards" style={{ marginBottom: 20 }}>
        <StatCard label="Socios activos" value={stats.activos} sub={`de ${socios.length} registrados`} icon={<Users size={16} />} />
        <StatCard label="Marketplaces abiertos" value={stats.marketplaces} sub="Con tienda pública" icon={<Store size={16} />} />
        <StatCard
          label="En línea ahora"
          value={stats.online}
          sub={stats.sinGps > 0 ? `+${stats.sinGps} en servicio sin GPS` : 'En servicio y con GPS'}
          tone={stats.online > 0 ? 'sage' : 'ink'}
          icon={<Truck size={16} />}
        />
        <StatCard
          label="Riders pendientes"
          value={stats.pendientes}
          sub={stats.pendientes > 0 ? 'Esperando aprobación' : 'Nada por aprobar'}
          tone={stats.pendientes > 0 ? 'terracotta' : 'ink'}
          icon={<AlertCircle size={16} />}
        />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.stone, pointerEvents: 'none' }} />
          <input
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar socio, slug o email…"
            style={{ ...ds.input, width: '100%', paddingLeft: 32 }}
          />
        </div>
        <select value={fEstado} onChange={e => setFEstado(e.target.value)} style={{ ...ds.select, width: 140 }}>
          <option value="todos">Estado: todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <select value={fMarketplace} onChange={e => setFMarketplace(e.target.value)} style={{ ...ds.select, width: 170 }}>
          <option value="todos">Marketplace: todos</option>
          <option value="activos">Abierto</option>
          <option value="inactivos">Cerrado</option>
        </select>
        <select value={fOnline} onChange={e => setFOnline(e.target.value)} style={{ ...ds.select, width: 160 }}>
          <option value="todos">En línea: todos</option>
          <option value="online">En línea ahora</option>
          <option value="sin_gps">En servicio sin GPS</option>
        </select>
      </div>

      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ flex: '3 1 180px', minWidth: 0 }}>Socio</span>
          <span data-tablet-hide="true" style={{ width: 130, flexShrink: 0 }}>Slug</span>
          <span style={{ width: 116, flexShrink: 0 }}>Riders</span>
          <span data-tablet-sm-hide="true" style={{ width: 96, flexShrink: 0 }}>Restaurantes</span>
          <span style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>Esta semana</span>
          <span style={{ width: 36, flexShrink: 0 }} />
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', ...type.body, color: colors.stone }}>Cargando…</div>}

        {!loading && sociosFiltered.length === 0 && (
          <Vacio
            icon={<Users size={30} />}
            titulo={socios.length === 0 ? 'Todavía no hay socios' : 'Sin resultados'}
            texto={socios.length === 0
              ? 'Cuando des de alta un socio aparecerá aquí con sus riders, sus restaurantes y lo que lleva ganado.'
              : 'Prueba a quitar algún filtro o a cambiar el texto de búsqueda.'}
          />
        )}

        {sociosFiltered.map(s => {
          const linea = LINEA[estadoLineaSocio(s)]
          const hasMarketplace = s.marketplace_activo && s.slug
          const bal = balances[s.id]
          const ganadoSemana = bal?.ganado_semana || 0

          return (
            <div
              key={s.id}
              className="ds-row-touch"
              style={{ ...ds.tableRow, cursor: 'pointer' }}
              onClick={() => { setSocioActivo(s); setTab('resumen') }}
              onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <span data-col="nom" style={{ flex: '3 1 180px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {s.logo_url
                  ? <img src={s.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', background: colors.cream2, flexShrink: 0 }} />
                  : <span style={{ width: 36, height: 36, borderRadius: 8, background: colors.cream2, display: 'grid', placeItems: 'center', ...type.label, fontWeight: 700, color: colors.stone, flexShrink: 0 }}>
                      {(s.nombre_comercial || s.nombre || 'S').charAt(0).toUpperCase()}
                    </span>}
                <span style={{ minWidth: 0, lineHeight: 1.3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: colors.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.nombre_comercial || s.nombre || '—'}
                    </span>
                    {!s.activo && <Chip tono="neutral">Inactivo</Chip>}
                    {hasMarketplace && <Chip tono="sage" dot title="Marketplace público abierto">Tienda</Chip>}
                  </span>
                  <span style={{ display: 'block', ...type.caption, letterSpacing: 0, color: colors.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.email || s.telefono || '—'}
                  </span>
                </span>
              </span>
              <span data-col="cod" data-tablet-hide="true" style={{ width: 130, flexShrink: 0, ...type.mono, fontSize: 13, color: colors.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.slug ? `/${s.slug}` : '—'}
              </span>
              <span data-col="est" style={{ width: 116, flexShrink: 0 }}>
                <Chip
                  tono={linea.tono}
                  dot
                  title={`${linea.ayuda}${ultimaPosicion(s) ? ` · última posición ${hace(ultimaPosicion(s))}` : ''}`}
                >
                  {linea.label}
                </Chip>
              </span>
              <span data-col="pag" data-tablet-sm-hide="true" style={{ width: 96, flexShrink: 0 }}>
                <Chip tono="neutral" title="Restaurantes vinculados y activos">{countsRest[s.id] || 0} rest.</Chip>
              </span>
              <span
                data-col="tot"
                style={{ width: 110, flexShrink: 0, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ganadoSemana > 0 ? colors.text : colors.stone }}
                title="Ganado esta semana (envío + 10% del subtotal + propina)"
              >
                {ganadoSemana > 0 ? fmtEUR(ganadoSemana) : '—'}
              </span>
              {/* La flecha solo tiene sentido en escritorio: en móvil la ficha
                  entera es el área táctil y una fila propia para un chevron sobra */}
              <span className="ds-col-hueco" style={{ width: 36, flexShrink: 0, textAlign: 'right' }}>
                <ChevronRight size={16} color={colors.stone2} />
              </span>
            </div>
          )
        })}
      </div>

      {showNuevo && <NuevoSocioModal onClose={() => setShowNuevo(false)} onSaved={() => { setShowNuevo(false); load() }} />}

      {resetPwdSocio && resetPwdSocio.user_id && (
        <ResetPasswordModal
          userId={resetPwdSocio.user_id}
          userEmail={resetPwdSocio.email}
          userLabel={resetPwdSocio.nombre_comercial || resetPwdSocio.nombre || 'Socio'}
          userRole="socio"
          hasAuthAccount={true}
          onClose={() => setResetPwdSocio(null)}
        />
      )}

      {editSocio && (
        <EditSocioModal
          socio={editSocio}
          onClose={() => setEditSocio(null)}
          onSaved={() => { setEditSocio(null); load() }}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Vista DETALLE de un socio
// ──────────────────────────────────────────────────────────────────────────────
function SocioDetalle({
  socio, riders, vinculaciones, balance, tab, setTab,
  onBack, onReload, onResetPwd, onEdit, onDelete, onToggleActivo, onToggleMarketplace,
}) {
  const ridersActivos = riders.filter(r => r.estado === 'activa')
  const linea = LINEA[estadoLineaSocio(socio)]
  const hasMarketplace = socio.marketplace_activo && socio.slug

  return (
    <div>
      <button onClick={onBack} style={{ ...ds.backBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={14} /> Todos los socios
      </button>

      {/* Hero */}
      <Card pad={20} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {socio.logo_url
            ? <img src={socio.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', background: colors.cream2, flexShrink: 0 }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, background: colors.cream2, display: 'grid', placeItems: 'center', ...type.h2, color: colors.stone, flexShrink: 0 }}>
                {(socio.nombre_comercial || socio.nombre || 'S').charAt(0).toUpperCase()}
              </div>}

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ ...ds.h1, margin: 0 }}>{socio.nombre_comercial || socio.nombre || '—'}</h1>
              {!socio.activo && <Chip tono="danger">Inactivo</Chip>}
              {hasMarketplace && <Chip tono="sage">Marketplace</Chip>}
              <Chip tono={linea.tono} dot title={linea.ayuda}>{linea.label}</Chip>
            </div>
            <div style={{ ...type.body, color: colors.stone, marginBottom: 8 }}>
              {socio.nombre && socio.nombre !== socio.nombre_comercial ? socio.nombre : ''}
              {socio.slug && <> · <span style={{ ...type.mono, fontSize: 13 }}>/{socio.slug}</span></>}
            </div>
            <div style={{ display: 'flex', gap: 14, ...type.label, color: colors.stone, flexWrap: 'wrap' }}>
              {socio.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={13} /> {socio.email}</span>}
              {socio.telefono && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={13} /> {socio.telefono}</span>}
              <span title="Última posición recibida del móvil del socio">Posición {hace(ultimaPosicion(socio))}</span>
              {hasMarketplace && (
                <a href={`https://pidoo.es/s/${socio.slug}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: colors.terracotta2, textDecoration: 'none', fontWeight: 600 }}>
                  <ExternalLink size={13} /> Ver tienda
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostBtn size="sm" onClick={onEdit}><Pencil size={13} /> Editar</GhostBtn>
            <GhostBtn
              size="sm"
              onClick={onResetPwd}
              disabled={!socio.user_id}
              title={socio.user_id ? 'Restablecer contraseña' : 'Sin cuenta auth'}
              style={{ opacity: socio.user_id ? 1 : 0.4 }}
            >
              <KeyRound size={13} /> Contraseña
            </GhostBtn>
            <GhostBtn size="sm" danger onClick={onDelete} title="Eliminar socio definitivamente">
              <Trash2 size={13} /> Eliminar socio
            </GhostBtn>
          </div>
        </div>

        {/* Toggles rápidos */}
        <div style={{ display: 'flex', gap: 18, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${colors.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleRow label="Cuenta activa" on={!!socio.activo} onClick={onToggleActivo} />
          <ToggleRow label="Marketplace abierto" on={!!socio.marketplace_activo} onClick={onToggleMarketplace} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center', ...type.label, color: colors.stone, flexWrap: 'wrap' }}>
            <span><b style={{ color: colors.text }}>{vinculaciones.filter(v => v.estado === 'activa').length}</b> rests. activos</span>
            <span><b style={{ color: colors.text }}>{ridersActivos.length}</b> riders activos</span>
            {(balance?.ganado_semana || 0) > 0 && (
              <Chip tono="warning">{fmtEUR(balance.ganado_semana)} esta semana</Chip>
            )}
          </div>
        </div>
      </Card>

      {/* Pestañas */}
      <PillTabs
        value={tab}
        onChange={setTab}
        style={{ marginBottom: 18 }}
        options={TABS.map(t => (
          t.value === 'riders' ? { ...t, count: riders.length }
            : t.value === 'restaurantes' ? { ...t, count: vinculaciones.length }
              : t
        ))}
      />

      {tab === 'resumen' && <TabResumen socio={socio} balance={balance} />}
      {tab === 'riders' && <TabRiders socio={socio} riders={riders} onReload={onReload} />}
      {tab === 'restaurantes' && <TabRestaurantes socio={socio} vinculaciones={vinculaciones} onReload={onReload} />}
      {tab === 'pedidos' && <TabPedidos socio={socio} riders={riders} />}
      {tab === 'finanzas' && <TabFinanzas socio={socio} />}
      {tab === 'config' && <TabConfig socio={socio} riders={riders} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Resumen
// ──────────────────────────────────────────────────────────────────────────────
function TabResumen({ socio, balance }) {
  const redes = socio.redes || {}
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }} className="admin-grid-2col-collapse">
      <Card pad={18}>
        <h3 style={ds.h2}>Datos comerciales</h3>
        <DetailRow label="Descripción">{socio.descripcion || '—'}</DetailRow>
        <DetailRow label="Color primario">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: socio.color_primario || '#C5562C', border: `1px solid ${colors.border}` }} />
            <span style={type.mono}>{socio.color_primario || '#C5562C'}</span>
          </span>
        </DetailRow>
        <DetailRow label="Redes">
          {redes && Object.keys(redes).length > 0 ? (
            <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {redes.instagram && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><AtSign size={13} color={colors.stone} /> {redes.instagram}</span>}
              {redes.tiktok && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Music size={13} color={colors.stone} /> {redes.tiktok}</span>}
              {redes.web && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Globe size={13} color={colors.stone} /> {redes.web}</span>}
            </span>
          ) : <span style={{ color: colors.stone }}>—</span>}
        </DetailRow>
        <DetailRow label="Tarifa de envío">
          {socio.tarifa_base != null ? fmtEUR(socio.tarifa_base) : '—'}
          {' base · '}
          <span style={{ color: colors.stone }}>radio {socio.radio_km != null ? `${socio.radio_km} km` : '—'}</span>
        </DetailRow>
        <DetailRow label="Modo entrega">{socio.modo_entrega || '—'}</DetailRow>
        <DetailRow label="Límite de restaurantes">
          <b>{socio.limite_restaurantes ?? '—'}</b>
        </DetailRow>
      </Card>

      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        {/* En una pantalla de dinero, "todavía no hay datos" y "0,00 €" NO son lo
            mismo: si no hay balance se dice, no se pinta un cero que parece un
            cálculo hecho. */}
        <StatCard
          label="Ganado esta semana"
          value={balance ? fmtEUR(balance.ganado_semana || 0) : '—'}
          sub={balance ? 'Envío + 10% subtotal + propina' : 'Sin pedidos entregados aún'}
          tone={balance ? 'sage' : 'ink'}
        />
        <StatCard
          label="Total entregado"
          value={balance ? fmtEUR(balance.ganado_total || 0) : '—'}
          sub={balance ? `${balance.pedidos_count || 0} pedidos entregados` : 'Sin histórico'}
        />
        <StatCard
          label="Valoración"
          value={socio.rating != null ? Number(socio.rating).toFixed(1) : '—'}
          sub={socio.total_resenas > 0 ? `${socio.total_resenas} reseñas` : 'Sin reseñas todavía'}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Riders
// ──────────────────────────────────────────────────────────────────────────────
function TabRiders({ socio, riders }) {
  // socio = rider: la cuenta de reparto la lleva la misma persona, así que su
  // estado en línea es el del socio (en_servicio + GPS fresco), no el de la
  // tabla `rider_status`, que está vacía.
  const linea = LINEA[estadoLineaSocio(socio)]
  const enLinea = estadoLineaSocio(socio) === 'disponible'
  const [pedidosCount, setPedidosCount] = useState({}) // rider_account_id -> count entregados

  useEffect(() => {
    if (riders.length === 0) return
    ;(async () => {
      const ids = riders.map(r => r.id)
      const { data } = await supabase.from('pedidos')
        .select('rider_account_id')
        .in('rider_account_id', ids)
        .eq('estado', 'entregado')
      const counts = {}
      ;(data || []).forEach(p => { counts[p.rider_account_id] = (counts[p.rider_account_id] || 0) + 1 })
      setPedidosCount(counts)
    })()
  }, [riders.map(r => r.id).join(',')])

  const ridersActivos = riders.filter(r => r.activa !== false && r.estado === 'activa')

  if (riders.length === 0) {
    return (
      <div>
        <Card pad={8}>
          <Vacio
            icon={<Truck size={30} />}
            titulo="Este socio no tiene riders"
            texto="Los riders se dan de alta desde la app del socio. Cuando el socio (o su equipo) se registre como repartidor, aparecerá aquí."
          />
        </Card>
        <ExplicacionRiders />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...ds.h3 }}>Riders del socio</div>
        <div style={{ ...type.label, color: colors.stone, marginTop: 2 }}>
          {ridersActivos.length} activo{ridersActivos.length === 1 ? '' : 's'} · {riders.length} en total
        </div>
      </div>

      <div className="ds-panels">
        {riders.map(r => {
          const isOnline = enLinea
          return (
            <Card key={r.id} pad={14} style={{ opacity: r.activa === false ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.cream2, display: 'grid', placeItems: 'center', ...type.num, fontSize: 15, color: colors.stone }}>
                    {(r.nombre || 'R').charAt(0).toUpperCase()}
                  </div>
                  {r.estado === 'activa' && r.activa !== false && (
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 12, height: 12, borderRadius: '50%',
                      background: isOnline ? colors.sage : colors.stone2,
                      border: `2px solid ${colors.paper}`,
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...type.body, fontWeight: 700, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nombre || '—'}
                  </div>
                  <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.email || r.telefono || '—'}
                  </div>
                </div>
                <EstadoBadge estado={r.activa === false ? 'inactivo' : r.estado} />
              </div>

              <div style={{ ...type.label, color: colors.stone, lineHeight: 1.6 }}>
                {r.estado === 'activa' && r.activa !== false && (
                  <div>
                    <b style={{ color: isOnline ? colors.onSageSoft : colors.ink2 }}>{linea.label}</b>
                    <span> · posición {hace(ultimaPosicion(socio))}</span>
                  </div>
                )}
                <div>Pedidos entregados: <b style={{ color: colors.text }}>{pedidosCount[r.id] || 0}</b></div>
              </div>
            </Card>
          )
        })}
      </div>

      <ExplicacionRiders />
    </div>
  )
}

function ExplicacionRiders() {
  return (
    <Card pad={14} style={{ marginTop: 14, background: colors.cream2, boxShadow: 'none' }}>
      <div style={{ ...type.label, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
        Cómo funcionan los riders del socio
      </div>
      <div style={{ ...type.label, color: colors.onCream2, lineHeight: 1.6 }}>
        El reparto lo gestiona el dispatcher propio de Pidoo. Cada rider se registra desde la app del socio
        y aparece aquí con su estado online/offline en vivo. Pidoo asigna automáticamente cada pedido
        delivery al rider disponible más cercano.
      </div>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Restaurantes vinculados
// ──────────────────────────────────────────────────────────────────────────────
function TabRestaurantes({ socio, vinculaciones, onReload }) {
  async function setEstado(v, nuevo) {
    const patch = { estado: nuevo }
    if (nuevo === 'activa' && !v.aceptado_at) patch.aceptado_at = new Date().toISOString()
    const { error } = await supabase.from('socio_establecimiento').update(patch).eq('id', v.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(`Estado: ${nuevo}`)
    onReload()
  }

  async function toggleDestacado(v) {
    const { error } = await supabase.from('socio_establecimiento').update({ destacado: !v.destacado }).eq('id', v.id)
    if (error) return toast('Error: ' + error.message, 'error')
    onReload()
  }

  if (vinculaciones.length === 0) {
    return (
      <Card pad={8}>
        <Vacio
          icon={<Store size={30} />}
          titulo="Sin restaurantes vinculados"
          texto="El socio aún no ha solicitado vinculación con ningún restaurante."
        />
      </Card>
    )
  }

  return (
    <div className="ds-table-stack" style={ds.table}>
      <div className="ds-th" style={ds.tableHeader}>
        <span style={{ flex: '3 1 180px', minWidth: 0 }}>Restaurante</span>
        <span style={{ width: 130, flexShrink: 0 }}>Estado</span>
        <span data-tablet-hide="true" style={{ width: 200, flexShrink: 0 }}>Fechas</span>
        <span style={{ width: 96, flexShrink: 0, textAlign: 'center' }}>Destacado</span>
        <span style={{ width: 210, flexShrink: 0, textAlign: 'right' }}>Acciones</span>
      </div>
      {vinculaciones.map(v => (
        <div key={v.id} className="ds-row-touch" style={ds.tableRow}>
          <span data-col="nom" style={{ flex: '3 1 180px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {v.establecimientos?.logo_url
              ? <img src={v.establecimientos.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              : <span style={{ width: 28, height: 28, borderRadius: 6, background: colors.cream2, flexShrink: 0 }} />}
            <span style={{ fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.establecimientos?.nombre || '—'}
            </span>
            {v.exclusivo && <Chip tono="neutral">Exclusivo</Chip>}
            {v.es_captador && <Chip tono="terracotta">Captador</Chip>}
          </span>
          <span data-col="est" style={{ width: 130, flexShrink: 0 }}>
            <EstadoBadge estado={v.estado} />
          </span>
          {/* Las dos fechas van juntas y con su etiqueta: en móvil la cabecera
              desaparece y dos fechas sueltas no dicen cuál es cuál */}
          <span data-col="ale" data-tablet-hide="true" style={{ width: 200, flexShrink: 0, ...type.label, color: colors.stone }}>
            Solicitado {fmtDate(v.solicitado_at)}
            {v.aceptado_at && ` · aceptado ${fmtDate(v.aceptado_at)}`}
          </span>
          <span data-col="pag" style={{ width: 96, flexShrink: 0, textAlign: 'center' }}>
            <button
              onClick={() => toggleDestacado(v)}
              title={v.destacado ? 'Quitar destacado' : 'Destacar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 2, color: v.destacado ? colors.terracotta : colors.stone2 }}
            >★</button>
          </span>
          <span data-col="acc" style={{ width: 210, flexShrink: 0, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {(v.estado === 'pendiente' || v.estado === 'solicitada') && (
              <>
                <MiniBtn onClick={() => setEstado(v, 'activa')}><Check size={12} /> Aprobar</MiniBtn>
                <MiniBtn danger onClick={() => setEstado(v, 'rechazada')}><X size={12} /> Rechazar</MiniBtn>
              </>
            )}
            {v.estado === 'activa' && (
              <MiniBtn danger onClick={() => setEstado(v, 'rechazada')}><X size={12} /> Desvincular</MiniBtn>
            )}
            {v.estado === 'rechazada' && (
              <MiniBtn onClick={() => setEstado(v, 'activa')}>Reactivar</MiniBtn>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Pedidos
// ──────────────────────────────────────────────────────────────────────────────
function TabPedidos({ socio, riders }) {
  const [periodo, setPeriodo] = useState('semana') // hoy | semana | mes
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const PER_PAGE = 50

  useEffect(() => {
    setPage(0)
    cargar(0)
  }, [periodo])

  useEffect(() => {
    cargar(page)
  }, [page])

  async function cargar(p) {
    setLoading(true)
    const desde = new Date()
    if (periodo === 'hoy') desde.setHours(0, 0, 0, 0)
    else if (periodo === 'semana') desde.setDate(desde.getDate() - 7)
    else desde.setMonth(desde.getMonth() - 1)

    const { data } = await supabase.from('pedidos')
      .select('id, codigo, created_at, estado, metodo_pago, total, subtotal, coste_envio, propina, rider_account_id, establecimientos(id, nombre)')
      .eq('socio_id', socio.id)
      .gte('created_at', desde.toISOString())
      .order('created_at', { ascending: false })
      .range(p * PER_PAGE, (p + 1) * PER_PAGE - 1)

    setPedidos(data || [])
    setLoading(false)
  }

  const ridersMap = useMemo(() => {
    const m = {}
    riders.forEach(r => { m[r.id] = r.nombre })
    return m
  }, [riders])

  return (
    <div>
      <Segmented
        value={periodo}
        onChange={setPeriodo}
        style={{ marginBottom: 14 }}
        options={[
          { value: 'hoy', label: 'Hoy' },
          { value: 'semana', label: 'Última semana' },
          { value: 'mes', label: 'Último mes' },
        ]}
      />

      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ width: 104, flexShrink: 0 }}>Código</span>
          <span style={{ flex: '3 1 150px', minWidth: 0 }}>Restaurante</span>
          <span style={{ width: 96, flexShrink: 0 }}>Estado</span>
          <span data-tablet-sm-hide="true" style={{ width: 96, flexShrink: 0 }}>Pago</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1 1 110px', minWidth: 0 }}>Rider</span>
          <span data-tablet-hide="true" style={{ width: 120, flexShrink: 0 }}>Fecha</span>
          <span style={{ width: 90, flexShrink: 0, textAlign: 'right' }}>Total</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.stone }}>Cargando…</div>}
        {!loading && pedidos.length === 0 && (
          <Vacio titulo="Sin pedidos en este periodo" texto="Cambia el periodo de arriba para ver más histórico." />
        )}
        {pedidos.map(p => (
          <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
            <span data-col="cod" style={{ width: 104, flexShrink: 0, ...type.mono, fontSize: 13, fontWeight: 700, color: colors.text }}>{p.codigo}</span>
            <span data-col="nom" style={{ flex: '3 1 150px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.establecimientos?.nombre || ''}>
              {p.establecimientos?.nombre || '—'}
            </span>
            <span data-col="est" style={{ width: 96, flexShrink: 0 }}>
              <EstadoBadge estado={p.estado} />
            </span>
            <span data-col="pag" data-tablet-sm-hide="true" style={{ width: 96, flexShrink: 0 }}>
              <Chip tono={p.metodo_pago === 'tarjeta' ? 'info' : 'warning'}>
                {p.metodo_pago === 'tarjeta' ? 'Tarjeta' : p.metodo_pago === 'datafono' ? 'Datáfono' : p.metodo_pago === 'efectivo' ? 'Efectivo' : (p.metodo_pago || '—')}
              </Chip>
            </span>
            <span data-col="ori" data-tablet-sm-hide="true" style={{ flex: '1 1 110px', minWidth: 0, ...type.label, color: colors.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ridersMap[p.rider_account_id] || (p.rider_account_id ? '(externo)' : '—')}
            </span>
            <span data-col="fec" data-tablet-hide="true" style={{ width: 120, flexShrink: 0, ...type.label, color: colors.stone }}>{fmtDateTime(p.created_at)}</span>
            <span data-col="tot" style={{ width: 90, flexShrink: 0, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.text }}>
              {fmtEUR(p.total)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 12, ...type.label, color: colors.stone }}>
        <GhostBtn size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ opacity: page === 0 ? 0.4 : 1 }}>Anterior</GhostBtn>
        <span>Página {page + 1}</span>
        <GhostBtn size="sm" onClick={() => setPage(page + 1)} disabled={pedidos.length < PER_PAGE} style={{ opacity: pedidos.length < PER_PAGE ? 0.4 : 1 }}>Siguiente</GhostBtn>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Finanzas / Balances
// ──────────────────────────────────────────────────────────────────────────────
function TabFinanzas({ socio }) {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('pedidos')
        .select('id, codigo, coste_envio, subtotal, propina, total, created_at')
        .eq('socio_id', socio.id)
        .eq('estado', 'entregado')
        .order('created_at', { ascending: false })
      setPedidos(data || [])
      setLoading(false)
    })()
  }, [socio.id])

  const ganadoDe = (p) => (Number(p.coste_envio) || 0) + (Number(p.subtotal) || 0) * 0.10 + (Number(p.propina) || 0)

  const stats = useMemo(() => {
    const ahora = new Date()
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    const lunes = new Date(); lunes.setHours(0, 0, 0, 0)
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
    let semana = 0, mes = 0, total = 0
    pedidos.forEach(p => {
      const g = ganadoDe(p)
      total += g
      if (new Date(p.created_at) >= inicioMes) mes += g
      if (new Date(p.created_at) >= lunes) semana += g
    })
    return { semana, mes, total }
  }, [pedidos])

  return (
    <div>
      <div className="ds-cards" style={{ marginBottom: 10 }}>
        <StatCard label="Esta semana" value={fmtEUR(stats.semana)} sub="Pendiente del corte del lunes" tone={stats.semana > 0 ? 'terracotta' : 'ink'} />
        <StatCard label="Este mes" value={fmtEUR(stats.mes)} sub="Desde el día 1" />
        <StatCard label="Total entregado" value={fmtEUR(stats.total)} sub={`${pedidos.length} pedidos entregados`} tone="sage" />
      </div>
      <div style={{ ...type.label, color: colors.stone, marginBottom: 16, lineHeight: 1.5 }}>
        Cálculo en vivo: por cada pedido entregado el socio cobra envío + 10% del subtotal + propina. La liquidación se paga los lunes.
      </div>

      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ width: 110, flexShrink: 0 }}>Código</span>
          <span data-tablet-hide="true" style={{ width: 110, flexShrink: 0 }}>Fecha</span>
          <span style={{ flex: '2 1 220px', minWidth: 0 }}>Desglose</span>
          <span style={{ width: 110, flexShrink: 0, textAlign: 'right' }}>Ganado</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.stone }}>Cargando…</div>}
        {!loading && pedidos.length === 0 && (
          <Vacio titulo="Sin pedidos entregados aún" texto="En cuanto el socio entregue su primer pedido verás aquí el desglose de lo que cobra." />
        )}
        {pedidos.map(p => (
          <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
            <span data-col="nom" style={{ width: 110, flexShrink: 0, ...type.mono, fontSize: 13, fontWeight: 700, color: colors.text }}>{p.codigo}</span>
            <span data-col="fec" data-tablet-hide="true" style={{ width: 110, flexShrink: 0, ...type.label, color: colors.stone }}>
              {new Date(p.created_at).toLocaleDateString('es-ES')}
            </span>
            {/* Envío, subtotal y propina en una sola celda: cada uno con su
                etiqueta, que en móvil la cabecera de la tabla ya no está */}
            <span data-col="ale" style={{ flex: '2 1 220px', minWidth: 0, ...type.label, color: colors.stone, fontVariantNumeric: 'tabular-nums' }}>
              Envío {fmtEUR(p.coste_envio)} · Subtotal {fmtEUR(p.subtotal)} · Propina {fmtEUR(p.propina)}
            </span>
            <span data-col="tot" style={{ width: 110, flexShrink: 0, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.text }}>
              {fmtEUR(ganadoDe(p))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Configuración avanzada
// ──────────────────────────────────────────────────────────────────────────────
function TabConfig({ socio, riders }) {
  const [showKey, setShowKey] = useState(false)

  function copy(value) {
    if (!value) return
    navigator.clipboard.writeText(value)
    toast('Copiado')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="admin-grid-2col-collapse">
      <Card pad={18}>
        <h3 style={ds.h2}>Datos de reparto del socio</h3>
        <DetailRow label="API key">
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ ...type.mono, fontSize: 13, color: colors.stone, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {socio.shipday_api_key
                ? (showKey ? socio.shipday_api_key : `${socio.shipday_api_key.slice(0, 6)}•••••${socio.shipday_api_key.slice(-4)}`)
                : '—'}
            </span>
            {socio.shipday_api_key && (
              <>
                <MiniBtn onClick={() => setShowKey(!showKey)} title={showKey ? 'Ocultar' : 'Mostrar'} style={{ padding: '5px 8px' }}>
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </MiniBtn>
                <MiniBtn onClick={() => copy(socio.shipday_api_key)} title="Copiar" style={{ padding: '5px 8px' }}>
                  <Copy size={13} />
                </MiniBtn>
              </>
            )}
          </span>
        </DetailRow>
        <DetailRow label="Carrier ID">
          <span style={type.mono}>{socio.shipday_carrier_id || '—'}</span>
        </DetailRow>
        {/* Antes aquí ponía "Última sync rider_status", que salía siempre de una
            tabla vacía y por tanto siempre "Sin datos". Lo que de verdad dice si
            se le puede asignar un pedido es la última posición de su móvil. */}
        <DetailRow label="Última posición">
          {ultimaPosicion(socio)
            ? `${hace(ultimaPosicion(socio))} · ${fmtDateTime(ultimaPosicion(socio))}`
            : 'Nunca ha mandado posición'}
        </DetailRow>
        <DetailRow label="En servicio">
          {socio.en_servicio ? 'Sí (interruptor de su app)' : 'No'}
        </DetailRow>
      </Card>

      <Card pad={18}>
        <h3 style={ds.h2}>Datos fiscales</h3>
        <DetailRow label="Razón social">{socio.razon_social || '—'}</DetailRow>
        <DetailRow label="NIF"><span style={type.mono}>{socio.nif || '—'}</span></DetailRow>
        <DetailRow label="Dirección fiscal">
          {[socio.direccion_fiscal, socio.codigo_postal, socio.ciudad, socio.provincia].filter(Boolean).join(', ') || '—'}
        </DetailRow>
        <DetailRow label="IBAN"><span style={type.mono}>{socio.iban || '—'}</span></DetailRow>
      </Card>

      <Card pad={18}>
        <h3 style={ds.h2}>Stripe Connect</h3>
        <div style={{ ...type.body, color: colors.stone, lineHeight: 1.6 }}>
          La suscripción y el onboarding Connect se gestionan desde el panel del socio.
          Para liquidaciones automáticas, ver edge functions <code style={type.mono}>liquidacion-semanal</code> y <code style={type.mono}>stripe-connect-onboarding</code>.
        </div>
      </Card>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de UI
// ──────────────────────────────────────────────────────────────────────────────
// `EstadoBadge`, `Chip`, `StatCard` y `Toggle` vivían aquí duplicados (con un
// mapa de estados propio que pintaba el valor crudo de la columna, "en_camino",
// y una tarjeta de cifra con su propio tamaño). Ahora salen de `lib/ui.jsx`.

function ToggleRow({ label, on, onClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Toggle on={on} onChange={onClick} size="sm" aria-label={label} />
      <span style={{ ...type.label, fontWeight: 600, color: colors.text }}>{label}</span>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...type.caption, color: colors.stone, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ ...type.body, color: colors.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  catch { return '—' }
}

function fmtDateTime(d) {
  if (!d) return '—'
  try {
    const date = new Date(d)
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' +
      date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

function fmtRelative(d) {
  if (!d) return '—'
  try {
    const diff = Date.now() - new Date(d).getTime()
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return `hace ${sec}s`
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`
    return `hace ${Math.floor(sec / 86400)}d`
  } catch { return '—' }
}

// ──────────────────────────────────────────────────────────────────────────────
// Modal: Editar socio
// ──────────────────────────────────────────────────────────────────────────────
function EditSocioModal({ socio, onClose, onSaved }) {
  const [nombre, setNombre] = useState(socio.nombre || '')
  const [nombreComercial, setNombreComercial] = useState(socio.nombre_comercial || '')
  const [email, setEmail] = useState(socio.email || '')
  const [telefono, setTelefono] = useState(socio.telefono || '')
  const [descripcion, setDescripcion] = useState(socio.descripcion || '')
  const [colorPrimario, setColorPrimario] = useState(socio.color_primario || '#C5562C')
  const [tarifaBase, setTarifaBase] = useState(socio.tarifa_base ?? '')
  const [radioKm, setRadioKm] = useState(socio.radio_km ?? '')
  const [limite, setLimite] = useState(socio.limite_restaurantes ?? 5)
  const [shipdayKey, setShipdayKey] = useState(socio.shipday_api_key || '')
  const [redes, setRedes] = useState(socio.redes || {})
  const [confirmSlug, setConfirmSlug] = useState(false)
  const [slug, setSlug] = useState(socio.slug || '')
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    const payload = {
      nombre: nombre.trim() || null,
      nombre_comercial: nombreComercial.trim() || null,
      email: email.trim() || null,
      telefono: telefono.trim() || null,
      descripcion: descripcion.trim() || null,
      color_primario: colorPrimario || '#C5562C',
      tarifa_base: tarifaBase === '' ? null : Number(tarifaBase),
      radio_km: radioKm === '' ? null : Number(radioKm),
      limite_restaurantes: limite === '' ? null : parseInt(limite, 10),
      shipday_api_key: shipdayKey.trim() || null,
      redes: redes && Object.keys(redes).length > 0 ? redes : null,
    }
    if (confirmSlug && slug.trim() !== (socio.slug || '')) {
      payload.slug = slug.trim().toLowerCase() || null
    }
    const { error } = await supabase.from('socios').update(payload).eq('id', socio.id)
    if (error) { setSaving(false); return toast('Error: ' + error.message, 'error') }
    toast('Socio actualizado')
    onSaved()
  }

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Pencil size={18} color={colors.terracotta} />
          <h2 style={{ ...ds.h3, flex: 1, margin: 0 }}>Editar socio</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: colors.stone, cursor: 'pointer', display: 'flex', padding: 2 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Nombre comercial</label>
              <input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div>
            <label style={ds.label}>Descripción</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
              style={{ ...ds.formInput, height: 'auto', padding: '8px 12px', resize: 'vertical' }} />
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Color primario</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)}
                  style={{ width: 38, height: 36, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 2 }} />
                <input value={colorPrimario} onChange={e => setColorPrimario(e.target.value)}
                  style={{ ...ds.formInput, ...type.mono, fontSize: ds.formInput.fontSize }} />
              </div>
            </div>
            <div>
              <label style={ds.label}>Límite restaurantes</label>
              <input type="number" min={0} value={limite} onChange={e => setLimite(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Tarifa base (€)</label>
              <input type="number" step="0.1" value={tarifaBase} onChange={e => setTarifaBase(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Radio km</label>
              <input type="number" step="0.5" value={radioKm} onChange={e => setRadioKm(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div>
            <label style={ds.label}>Shipday API key</label>
            <input value={shipdayKey} onChange={e => setShipdayKey(e.target.value)}
              style={{ ...ds.formInput, ...type.mono, fontSize: 13 }} placeholder="(opcional)" />
          </div>

          <div>
            <label style={ds.label}>Redes sociales</label>
            <div style={{ display: 'grid', gap: 6 }}>
              <input value={redes.instagram || ''} onChange={e => setRedes({ ...redes, instagram: e.target.value })} placeholder="Instagram (@usuario)" style={ds.formInput} />
              <input value={redes.tiktok || ''} onChange={e => setRedes({ ...redes, tiktok: e.target.value })} placeholder="TikTok" style={ds.formInput} />
              <input value={redes.web || ''} onChange={e => setRedes({ ...redes, web: e.target.value })} placeholder="Web (https://…)" style={ds.formInput} />
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, ...type.body, color: colors.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmSlug} onChange={e => setConfirmSlug(e.target.checked)} />
              Cambiar slug (con cuidado, rompe URL pública)
            </label>
            {confirmSlug && (
              <input value={slug} onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                style={{ ...ds.formInput, ...type.mono, fontSize: ds.formInput.fontSize, marginTop: 6 }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <GhostBtn onClick={onClose}>Cancelar</GhostBtn>
            <GlossyBtn accent onClick={guardar} disabled={saving} style={{ flex: 1, opacity: saving ? 0.5 : 1 }}>
              <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
            </GlossyBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Modal: Nuevo socio (igual que antes)
// ──────────────────────────────────────────────────────────────────────────────
function NuevoSocioModal({ onClose, onSaved }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [nombreComercial, setNombreComercial] = useState('')
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState(null)
  const [socioEmail, setSocioEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [shipdayApiKey, setShipdayApiKey] = useState('')
  const [tarifaBase, setTarifaBase] = useState('')
  const [radioKm, setRadioKm] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!slug.trim()) { setSlugStatus(null); return }
    const s = slug.trim().toLowerCase()
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const { data } = await supabase.from('socios').select('id').eq('slug', s).maybeSingle()
      setSlugStatus(data ? 'taken' : 'free')
    }, 350)
    return () => clearTimeout(t)
  }, [slug])

  async function guardar() {
    if (!email.trim() || !nombre.trim() || !nombreComercial.trim()) {
      return toast('Email, nombre y nombre comercial son obligatorios', 'error')
    }
    if (slug && slugStatus === 'taken') return toast('Slug no disponible', 'error')
    setSaving(true)

    const { data: user, error: uErr } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (uErr || !user) {
      setSaving(false)
      return toast('No existe usuario con ese email', 'error')
    }

    const payload = {
      user_id: user.id,
      nombre: nombre.trim(),
      nombre_comercial: nombreComercial.trim(),
      slug: slug.trim().toLowerCase() || null,
      email: socioEmail.trim() || email.trim().toLowerCase(),
      telefono: telefono.trim() || null,
      shipday_api_key: shipdayApiKey.trim() || null,
      tarifa_base: tarifaBase ? Number(tarifaBase) : null,
      radio_km: radioKm ? Number(radioKm) : null,
      activo: true,
    }
    const { error: sErr } = await supabase.from('socios').insert(payload)
    if (sErr) { setSaving(false); return toast('Error creando socio: ' + sErr.message, 'error') }

    if (user.rol !== 'socio') {
      await supabase.from('usuarios').update({ rol: 'socio' }).eq('id', user.id)
    }

    toast('Socio creado')
    onSaved()
  }

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Users size={18} color={colors.terracotta} />
          <h2 style={{ ...ds.h3, flex: 1, margin: 0 }}>Nuevo socio</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: colors.stone, cursor: 'pointer', display: 'flex', padding: 2 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={ds.label}>Email del usuario existente *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="socio@email.com" style={ds.formInput} />
            <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, marginTop: 4 }}>
              Debe existir en `usuarios`. Se le cambiará el rol a `socio`.
            </div>
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Nombre *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Nombre comercial *</label>
              <input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div>
            <label style={ds.label}>Slug público</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
              placeholder="mi-slug"
              style={{ ...ds.formInput, ...type.mono, fontSize: ds.formInput.fontSize }}
            />
            {slug && (
              <div style={{ ...type.label, marginTop: 4, color: slugStatus === 'taken' ? colors.onDangerSoft : slugStatus === 'free' ? colors.onSageSoft : colors.stone }}>
                {slugStatus === 'checking' && 'Comprobando…'}
                {slugStatus === 'free' && `✓ Disponible — pidoo.es/s/${slug}`}
                {slugStatus === 'taken' && '✗ Ya está en uso'}
              </div>
            )}
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Email contacto socio</label>
              <input value={socioEmail} onChange={e => setSocioEmail(e.target.value)} placeholder="(opcional, defaults al email)" style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div>
            <label style={ds.label}>Shipday API key</label>
            <input value={shipdayApiKey} onChange={e => setShipdayApiKey(e.target.value)} placeholder="(opcional)" style={{ ...ds.formInput, ...type.mono, fontSize: 13 }} />
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Tarifa base (€)</label>
              <input type="number" step="0.1" value={tarifaBase} onChange={e => setTarifaBase(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Radio km</label>
              <input type="number" step="0.5" value={radioKm} onChange={e => setRadioKm(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <GhostBtn onClick={onClose}>Cancelar</GhostBtn>
            <GlossyBtn accent onClick={guardar} disabled={saving} style={{ flex: 1, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Creando…' : 'Crear socio'}
            </GlossyBtn>
          </div>
        </div>
      </div>
    </div>
  )
}


