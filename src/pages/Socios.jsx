import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import {
  Users, ExternalLink, Plus, Eye, EyeOff, ChevronRight, ArrowLeft, X, Save, KeyRound,
  Search, CircleDot, Truck, Store, ClipboardList, Wallet, Settings, FileText,
  Pencil, Check, AlertCircle, Copy, Phone, Mail, Globe, AtSign, Music, RefreshCw, Trash2,
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

const TABS = [
  { id: 'resumen', label: 'Resumen', Icon: Users },
  { id: 'riders', label: 'Riders', Icon: Truck },
  { id: 'restaurantes', label: 'Restaurantes', Icon: Store },
  { id: 'pedidos', label: 'Pedidos', Icon: ClipboardList },
  { id: 'finanzas', label: 'Balances', Icon: Wallet },
  { id: 'config', label: 'Configuración', Icon: Settings },
]

export default function Socios() {
  const [socios, setSocios] = useState([])
  const [riderAccounts, setRiderAccounts] = useState([])
  const [riderStatus, setRiderStatus] = useState({}) // rider_account_id -> {is_online, last_checked, ...}
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

  // Realtime: refresca riders/status para puntito online en vista listado y ficha
  useEffect(() => {
    const channel = supabase.channel('socios-hub-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_status' }, () => loadRiderStatus())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_accounts' }, () => loadRiders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'socios' }, () => loadSocios())
      .subscribe()

    // Fallback polling 30s por si Realtime falla
    const interval = setInterval(() => { loadRiderStatus() }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  async function load() {
    setLoading(true)
    await Promise.all([loadSocios(), loadRiders(), loadRiderStatus(), loadVinc(), loadBalances()])
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

  async function loadRiderStatus() {
    const { data } = await supabase.from('rider_status').select('*')
    const map = {}
    ;(data || []).forEach(s => { map[s.rider_account_id] = s })
    setRiderStatus(map)
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
      if (fOnline === 'online') {
        const riders = ridersBySocio[s.id] || []
        const anyOnline = riders.some(r => riderStatus[r.id]?.is_online && r.estado === 'activa')
        if (!anyOnline) return false
      }
      if (buscar) {
        const q = buscar.toLowerCase()
        if (!(s.nombre_comercial || '').toLowerCase().includes(q)
          && !(s.nombre || '').toLowerCase().includes(q)
          && !(s.slug || '').toLowerCase().includes(q)
          && !(s.email || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [socios, ridersBySocio, riderStatus, fEstado, fMarketplace, fOnline, buscar])

  const stats = useMemo(() => {
    const activos = socios.filter(s => s.activo).length
    const marketplaces = socios.filter(s => s.marketplace_activo && s.slug).length
    let online = 0
    socios.forEach(s => {
      const riders = ridersBySocio[s.id] || []
      if (riders.some(r => riderStatus[r.id]?.is_online && r.estado === 'activa')) online++
    })
    const pendientes = riderAccounts.filter(r => r.estado === 'pendiente').length
    return { activos, marketplaces, online, pendientes }
  }, [socios, ridersBySocio, riderStatus, riderAccounts])

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
          riderStatus={riderStatus}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={ds.h1}>Socios</h1>
        <button onClick={() => setShowNuevo(true)} style={ds.primaryBtn}>
          <Plus size={14} /> Nuevo socio
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Socios activos" value={stats.activos} />
        <StatCard label="Marketplaces abiertos" value={stats.marketplaces} />
        <StatCard label="Online ahora" value={stats.online} accent />
        <StatCard label="Riders pendientes" value={stats.pendientes} warning={stats.pendientes > 0} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textMute, pointerEvents: 'none' }} />
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
        <select value={fOnline} onChange={e => setFOnline(e.target.value)} style={{ ...ds.select, width: 140 }}>
          <option value="todos">Online: todos</option>
          <option value="online">Online ahora</option>
        </select>
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ flex: 1 }}>Socio</span>
          <span data-tablet-hide="true" style={{ width: 130 }}>Slug</span>
          <span style={{ width: 90, textAlign: 'center' }}>Riders</span>
          <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'center' }}>Online</span>
          <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'center' }}>Rests.</span>
          <span data-tablet-hide="true" style={{ width: 110, textAlign: 'right' }}>Esta semana</span>
          <span style={{ width: 60, textAlign: 'right' }}></span>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Cargando…</div>}

        {!loading && sociosFiltered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>
            {socios.length === 0 ? 'Sin socios registrados.' : 'Sin resultados.'}
          </div>
        )}

        {sociosFiltered.map(s => {
          const riders = ridersBySocio[s.id] || []
          const ridersActivos = riders.filter(r => r.estado === 'activa')
          const ridersOnline = ridersActivos.filter(r => riderStatus[r.id]?.is_online).length
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
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {s.logo_url
                  ? <img src={s.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', background: colors.elev2, flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 8, background: colors.elev2, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, color: colors.textMute, flexShrink: 0 }}>
                      {(s.nombre_comercial || s.nombre || 'S').charAt(0).toUpperCase()}
                    </div>}
                <span style={{ minWidth: 0, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.nombre_comercial || s.nombre || '—'}
                    {!s.activo && <span style={{ ...ds.badge, padding: '1px 6px', fontSize: 9 }}>INACTIVO</span>}
                    {hasMarketplace && (
                      <span title="Marketplace público abierto" style={{ width: 6, height: 6, borderRadius: '50%', background: colors.success }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.email || s.telefono || '—'}
                  </div>
                </span>
              </span>
              <span data-tablet-hide="true" style={{ width: 130, fontSize: 11.5, color: colors.textDim, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.slug ? `/${s.slug}` : '—'}
              </span>
              <span style={{ width: 90, textAlign: 'center', fontSize: 13, fontWeight: 700, color: colors.text }}>
                {ridersActivos.length}
              </span>
              <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'center' }}>
                <OnlineDot online={ridersOnline > 0} count={ridersOnline} total={ridersActivos.length} />
              </span>
              <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'center', fontSize: 13, fontWeight: 700, color: colors.text }}>
                {countsRest[s.id] || 0}
              </span>
              <span data-tablet-hide="true" style={{ width: 110, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: ganadoSemana > 0 ? colors.text : colors.textMute }} title="Ganado esta semana (envío + 10% + propina)">
                {ganadoSemana > 0 ? `${ganadoSemana.toFixed(2)} €` : '—'}
              </span>
              <span style={{ width: 60, textAlign: 'right' }}>
                <ChevronRight size={16} color={colors.textMute} />
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
  socio, riders, riderStatus, vinculaciones, balance, tab, setTab,
  onBack, onReload, onResetPwd, onEdit, onDelete, onToggleActivo, onToggleMarketplace,
}) {
  const ridersActivos = riders.filter(r => r.estado === 'activa')
  const ridersOnline = ridersActivos.filter(r => riderStatus[r.id]?.is_online).length
  const hasMarketplace = socio.marketplace_activo && socio.slug

  return (
    <div>
      <button onClick={onBack} style={{ ...ds.backBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeft size={14} /> Todos los socios
      </button>

      {/* Hero */}
      <div style={{ ...ds.card, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {socio.logo_url
            ? <img src={socio.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', background: colors.elev2, flexShrink: 0 }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, background: colors.elev2, display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800, color: colors.textMute, flexShrink: 0 }}>
                {(socio.nombre_comercial || socio.nombre || 'S').charAt(0).toUpperCase()}
              </div>}

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ ...ds.h1, margin: 0 }}>{socio.nombre_comercial || socio.nombre || '—'}</h1>
              {!socio.activo && <span style={{ ...ds.badge, background: colors.dangerSoft, color: colors.danger, borderColor: 'rgba(220,38,38,0.3)' }}>INACTIVO</span>}
              {hasMarketplace && <span style={{ ...ds.badge, background: colors.successSoft, color: colors.success, borderColor: 'rgba(22,163,74,0.3)' }}>MARKETPLACE</span>}
              <OnlineDot online={ridersOnline > 0} count={ridersOnline} total={ridersActivos.length} showLabel />
            </div>
            <div style={{ fontSize: 13, color: colors.textDim, marginBottom: 8 }}>
              {socio.nombre && socio.nombre !== socio.nombre_comercial ? socio.nombre : ''}
              {socio.slug && <> · <span style={{ fontFamily: 'monospace', color: colors.textMute }}>/{socio.slug}</span></>}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: colors.textMute, flexWrap: 'wrap' }}>
              {socio.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={11} /> {socio.email}</span>}
              {socio.telefono && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {socio.telefono}</span>}
              {hasMarketplace && (
                <a href={`https://pidoo.es/s/${socio.slug}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.primary, textDecoration: 'none' }}>
                  <ExternalLink size={11} /> Ver tienda
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onEdit} style={ds.secondaryBtn}><Pencil size={13} /> Editar</button>
            <button onClick={onResetPwd} disabled={!socio.user_id} title={socio.user_id ? 'Restablecer contraseña' : 'Sin cuenta auth'}
              style={{ ...ds.secondaryBtn, opacity: socio.user_id ? 1 : 0.4 }}>
              <KeyRound size={13} /> Contraseña
            </button>
            <button
              onClick={onDelete}
              title="Eliminar socio definitivamente"
              style={{
                ...ds.secondaryBtn,
                color: '#B5564A',
                borderColor: 'rgba(220,38,38,0.32)',
                background: 'rgba(220,38,38,0.06)',
              }}
            >
              <Trash2 size={13} /> Eliminar socio
            </button>
          </div>
        </div>

        {/* Toggles rápidos */}
        <div style={{ display: 'flex', gap: 18, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${colors.border}`, flexWrap: 'wrap' }}>
          <ToggleRow label="Cuenta activa" on={!!socio.activo} onClick={onToggleActivo} />
          <ToggleRow label="Marketplace abierto" on={!!socio.marketplace_activo} onClick={onToggleMarketplace} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: colors.textMute }}>
            <span><b style={{ color: colors.text }}>{vinculaciones.filter(v => v.estado === 'activa').length}</b> rests. activos</span>
            <span><b style={{ color: colors.text }}>{ridersActivos.length}</b> riders activos</span>
            {(balance?.ganado_semana || 0) > 0 && (
              <span style={{ color: colors.warning, fontWeight: 700 }}>
                {Number(balance.ganado_semana).toFixed(2)} € esta semana
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${colors.border}`, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 14px', fontSize: 12.5, fontWeight: 600,
            background: 'none', border: 'none',
            borderBottom: tab === t.id ? `2px solid ${colors.primary}` : '2px solid transparent',
            color: tab === t.id ? colors.primary : colors.textMute,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}>
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <TabResumen socio={socio} balance={balance} />}
      {tab === 'riders' && <TabRiders socio={socio} riders={riders} riderStatus={riderStatus} onReload={onReload} />}
      {tab === 'restaurantes' && <TabRestaurantes socio={socio} vinculaciones={vinculaciones} onReload={onReload} />}
      {tab === 'pedidos' && <TabPedidos socio={socio} riders={riders} />}
      {tab === 'finanzas' && <TabFinanzas socio={socio} />}
      {tab === 'config' && <TabConfig socio={socio} riders={riders} riderStatus={riderStatus} />}
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
      <div style={{ ...ds.card, padding: 18 }}>
        <h3 style={ds.h2}>Datos comerciales</h3>
        <DetailRow label="Descripción">
          <span style={{ fontSize: 13, color: colors.textDim, lineHeight: 1.5 }}>{socio.descripcion || '—'}</span>
        </DetailRow>
        <DetailRow label="Color primario">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.textDim }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: socio.color_primario || '#C5562C', border: `1px solid ${colors.border}` }} />
            <span style={{ fontFamily: 'monospace' }}>{socio.color_primario || '#C5562C'}</span>
          </span>
        </DetailRow>
        <DetailRow label="Redes">
          {redes && Object.keys(redes).length > 0 ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
              {redes.instagram && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.textDim }}><AtSign size={12} /> {redes.instagram}</span>}
              {redes.tiktok && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.textDim }}><Music size={12} /> {redes.tiktok}</span>}
              {redes.web && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.textDim }}><Globe size={12} /> {redes.web}</span>}
            </div>
          ) : <span style={{ fontSize: 12.5, color: colors.textMute }}>—</span>}
        </DetailRow>
        <DetailRow label="Tarifa de envío">
          <span style={{ fontSize: 13, color: colors.text }}>
            {socio.tarifa_base != null ? `${Number(socio.tarifa_base).toFixed(2)} €` : '—'}
            {' base · '}
            <span style={{ color: colors.textMute }}>radio {socio.radio_km != null ? `${socio.radio_km} km` : '—'}</span>
          </span>
        </DetailRow>
        <DetailRow label="Modo entrega">
          <span style={{ fontSize: 12.5, color: colors.textDim }}>{socio.modo_entrega || '—'}</span>
        </DetailRow>
        <DetailRow label="Límite restaurantes">
          <span style={{ fontSize: 12.5, color: colors.text, fontWeight: 700 }}>{socio.limite_restaurantes ?? '—'}</span>
        </DetailRow>
      </div>

      <div>
        <div style={{ ...ds.card, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Ganancias del socio
          </div>
          {balance ? (
            <div style={{ fontSize: 12.5, color: colors.textDim, lineHeight: 1.7 }}>
              <div><b style={{ color: colors.text }}>Esta semana:</b> {Number(balance.ganado_semana || 0).toFixed(2)} €</div>
              <div><b style={{ color: colors.text }}>Total entregado:</b> {Number(balance.ganado_total || 0).toFixed(2)} €</div>
              <div style={{ fontSize: 11.5, color: colors.textMute, marginTop: 6 }}>
                {balance.pedidos_count || 0} pedidos entregados<br />
                envío + 10% subtotal + propina
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: colors.textMute }}>Sin pedidos entregados aún.</div>
          )}
        </div>
        <div style={{ ...ds.card, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Reseñas
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.text }}>
            {socio.rating != null ? Number(socio.rating).toFixed(1) : '—'}
            <span style={{ fontSize: 11, color: colors.textMute, fontWeight: 500, marginLeft: 6 }}>
              {socio.total_resenas > 0 ? `(${socio.total_resenas} reseñas)` : 'sin reseñas'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Riders
// ──────────────────────────────────────────────────────────────────────────────
function TabRiders({ socio, riders, riderStatus }) {
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
        <div style={{ ...ds.card, padding: 32, textAlign: 'center' }}>
          <Truck size={32} color={colors.textMute} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
            Este socio no tiene riders
          </div>
          <div style={{ fontSize: 12.5, color: colors.textMute, lineHeight: 1.5, maxWidth: 520, margin: '0 auto' }}>
            Los riders se dan de alta desde la app del socio. Cuando el socio (o su equipo) se registre como repartidor, aparecerá aquí.
          </div>
        </div>
        <ExplicacionRiders />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
            Riders del socio
          </div>
          <div style={{ fontSize: 11.5, color: colors.textMute, marginTop: 2 }}>
            {ridersActivos.length} activo{ridersActivos.length === 1 ? '' : 's'} · {riders.length} en total
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {riders.map(r => {
          const st = riderStatus[r.id]
          const isOnline = !!st?.is_online
          const estadoStyle = ESTADO_BADGE[r.estado] || ESTADO_BADGE.pendiente
          return (
            <div key={r.id} style={{ ...ds.card, padding: 14, opacity: r.activa === false ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.elev2, display: 'grid', placeItems: 'center', fontWeight: 700, color: colors.textDim, fontSize: 14 }}>
                    {(r.nombre || 'R').charAt(0).toUpperCase()}
                  </div>
                  {r.estado === 'activa' && r.activa !== false && (
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 12, height: 12, borderRadius: '50%',
                      background: isOnline ? colors.success : colors.textFaint,
                      border: `2px solid ${colors.surface}`,
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nombre || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.email || r.telefono || '—'}
                  </div>
                </div>
                <span style={{ ...ds.badge, ...estadoStyle }}>{r.activa === false ? 'inactivo' : r.estado}</span>
              </div>

              <div style={{ fontSize: 11.5, color: colors.textMute, lineHeight: 1.6 }}>
                {r.estado === 'activa' && r.activa !== false && (
                  <div>
                    <b style={{ color: isOnline ? colors.success : colors.textDim }}>{isOnline ? 'Online' : 'Offline'}</b>
                    {st?.last_checked && <span> · revisado {fmtRelative(st.last_checked)}</span>}
                  </div>
                )}
                {st?.last_error && (
                  <div style={{ color: colors.danger, fontSize: 11, marginTop: 2 }}>
                    <AlertCircle size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {st.last_error}
                  </div>
                )}
                <div>Pedidos entregados: <b style={{ color: colors.text }}>{pedidosCount[r.id] || 0}</b></div>
              </div>
            </div>
          )
        })}
      </div>

      <ExplicacionRiders />
    </div>
  )
}

function ExplicacionRiders() {
  return (
    <div style={{ ...ds.card, padding: 14, marginTop: 14, background: 'transparent' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 6 }}>
        Cómo funcionan los riders del socio
      </div>
      <div style={{ fontSize: 12, color: colors.textMute, lineHeight: 1.55 }}>
        El reparto lo gestiona el dispatcher propio de Pidoo. Cada rider se registra desde la app del socio
        y aparece aquí con su estado online/offline en vivo. Pidoo asigna automáticamente cada pedido
        delivery al rider disponible más cercano.
      </div>
    </div>
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
      <div style={{ ...ds.card, padding: 32, textAlign: 'center' }}>
        <Store size={32} color={colors.textMute} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Sin restaurantes vinculados</div>
        <div style={{ fontSize: 12.5, color: colors.textMute }}>El socio aún no ha solicitado vinculación con ningún restaurante.</div>
      </div>
    )
  }

  return (
    <div style={ds.table}>
      <div style={ds.tableHeader}>
        <span style={{ flex: 1 }}>Restaurante</span>
        <span style={{ width: 130 }}>Estado</span>
        <span data-tablet-hide="true" style={{ width: 110 }}>Solicitado</span>
        <span data-tablet-hide="true" style={{ width: 110 }}>Aceptado</span>
        <span style={{ width: 90, textAlign: 'center' }}>Destacado</span>
        <span style={{ width: 200, textAlign: 'right' }}>Acciones</span>
      </div>
      {vinculaciones.map(v => (
        <div key={v.id} style={ds.tableRow}>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {v.establecimientos?.logo_url
              ? <img src={v.establecimientos.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 28, height: 28, borderRadius: 6, background: colors.elev2 }} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.establecimientos?.nombre || '—'}
            </span>
            {v.exclusivo && <span style={{ ...ds.badge, fontSize: 9, padding: '1px 5px' }}>EXCL</span>}
            {v.es_captador && <span style={{ ...ds.badge, fontSize: 9, padding: '1px 5px', background: colors.primarySoft, color: colors.primary, borderColor: colors.primaryBorder }}>CAPTADOR</span>}
          </span>
          <span style={{ width: 130 }}>
            <EstadoBadge estado={v.estado} />
          </span>
          <span data-tablet-hide="true" style={{ width: 110, fontSize: 11.5, color: colors.textMute }}>{fmtDate(v.solicitado_at)}</span>
          <span data-tablet-hide="true" style={{ width: 110, fontSize: 11.5, color: colors.textMute }}>{fmtDate(v.aceptado_at)}</span>
          <span style={{ width: 90, textAlign: 'center' }}>
            <button onClick={() => toggleDestacado(v)} title={v.destacado ? 'Quitar destacado' : 'Destacar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: v.destacado ? colors.primary : colors.textMute }}>★</button>
          </span>
          <span style={{ width: 200, textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {(v.estado === 'pendiente' || v.estado === 'solicitada') && (
              <>
                <button onClick={() => setEstado(v, 'activa')} style={{ ...ds.actionBtn, color: colors.success, borderColor: 'rgba(22,163,74,0.3)' }}><Check size={11} /> Aprobar</button>
                <button onClick={() => setEstado(v, 'rechazada')} style={{ ...ds.actionBtn, color: colors.danger, borderColor: 'rgba(220,38,38,0.3)' }}><X size={11} /> Rechazar</button>
              </>
            )}
            {v.estado === 'activa' && (
              <button onClick={() => setEstado(v, 'rechazada')} style={ds.actionBtn}><X size={11} /> Desvincular</button>
            )}
            {v.estado === 'rechazada' && (
              <button onClick={() => setEstado(v, 'activa')} style={{ ...ds.actionBtn, color: colors.primary, borderColor: colors.primaryBorder }}>Reactivar</button>
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[
          { id: 'hoy', l: 'Hoy' },
          { id: 'semana', l: 'Última semana' },
          { id: 'mes', l: 'Último mes' },
        ].map(p => (
          <button key={p.id} onClick={() => setPeriodo(p.id)} style={{
            ...ds.filterBtn,
            background: periodo === p.id ? colors.primarySoft : colors.surface,
            color: periodo === p.id ? colors.primary : colors.textDim,
            borderColor: periodo === p.id ? colors.primaryBorder : colors.border,
          }}>{p.l}</button>
        ))}
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 90 }}>Código</span>
          <span data-tablet-hide="true" style={{ width: 130 }}>Fecha</span>
          <span style={{ flex: 1 }}>Restaurante</span>
          <span data-tablet-sm-hide="true" style={{ flex: 1 }}>Rider</span>
          <span style={{ width: 90 }}>Estado</span>
          <span data-tablet-sm-hide="true" style={{ width: 80 }}>Pago</span>
          <span style={{ width: 80, textAlign: 'right' }}>Total</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Cargando…</div>}
        {!loading && pedidos.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Sin pedidos en este periodo.</div>
        )}
        {pedidos.map(p => (
          <div key={p.id} style={ds.tableRow}>
            <span style={{ width: 90, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: colors.text }}>{p.codigo}</span>
            <span data-tablet-hide="true" style={{ width: 130, fontSize: 11.5, color: colors.textMute }}>{fmtDateTime(p.created_at)}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.establecimientos?.nombre || '—'}
            </span>
            <span data-tablet-sm-hide="true" style={{ flex: 1, fontSize: 12.5, color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ridersMap[p.rider_account_id] || (p.rider_account_id ? '(externo)' : '—')}
            </span>
            <span style={{ width: 90 }}>
              <EstadoBadge estado={p.estado} />
            </span>
            <span data-tablet-sm-hide="true" style={{ width: 80, fontSize: 11.5, color: colors.textMute, textTransform: 'capitalize' }}>
              {p.metodo_pago || '—'}
            </span>
            <span style={{ width: 80, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: colors.text }}>
              {Number(p.total || 0).toFixed(2)} €
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, fontSize: 12, color: colors.textMute }}>
        <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ ...ds.actionBtn, opacity: page === 0 ? 0.4 : 1 }}>Anterior</button>
        <span style={{ alignSelf: 'center' }}>Página {page + 1}</span>
        <button onClick={() => setPage(page + 1)} disabled={pedidos.length < PER_PAGE} style={{ ...ds.actionBtn, opacity: pedidos.length < PER_PAGE ? 0.4 : 1 }}>Siguiente</button>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 8 }}>
        <StatCard label="Esta semana" value={`${stats.semana.toFixed(2)} €`} warning={stats.semana > 0} />
        <StatCard label="Este mes" value={`${stats.mes.toFixed(2)} €`} />
        <StatCard label="Total entregado" value={`${stats.total.toFixed(2)} €`} />
      </div>
      <div style={{ fontSize: 11.5, color: colors.textMute, marginBottom: 16 }}>
        Cálculo en vivo: por cada pedido entregado el socio cobra envío + 10% del subtotal + propina. La liquidación se paga los lunes.
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 110 }}>Código</span>
          <span style={{ flex: 1 }}>Fecha</span>
          <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'right' }}>Envío</span>
          <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'right' }}>Subtotal</span>
          <span data-tablet-hide="true" style={{ width: 90, textAlign: 'right' }}>Propina</span>
          <span style={{ width: 100, textAlign: 'right' }}>Ganado</span>
        </div>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Cargando…</div>}
        {!loading && pedidos.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Sin pedidos entregados aún.</div>
        )}
        {pedidos.map(p => (
          <div key={p.id} style={ds.tableRow}>
            <span style={{ width: 110, fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: colors.text }}>{p.codigo}</span>
            <span style={{ flex: 1, fontSize: 12, color: colors.textMute }}>{new Date(p.created_at).toLocaleDateString('es-ES')}</span>
            <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'right', fontSize: 12, color: colors.textMute }}>{(Number(p.coste_envio) || 0).toFixed(2)} €</span>
            <span data-tablet-sm-hide="true" style={{ width: 90, textAlign: 'right', fontSize: 12, color: colors.textMute }}>{(Number(p.subtotal) || 0).toFixed(2)} €</span>
            <span data-tablet-hide="true" style={{ width: 90, textAlign: 'right', fontSize: 12, color: colors.textMute }}>{(Number(p.propina) || 0).toFixed(2)} €</span>
            <span style={{ width: 100, textAlign: 'right', fontSize: 13, fontWeight: 700, color: colors.text }}>{ganadoDe(p).toFixed(2)} €</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Tab: Configuración avanzada
// ──────────────────────────────────────────────────────────────────────────────
function TabConfig({ socio, riders, riderStatus }) {
  const [showKey, setShowKey] = useState(false)
  const ultimaSync = useMemo(() => {
    let max = null
    riders.forEach(r => {
      const t = riderStatus[r.id]?.last_checked
      if (t && (!max || new Date(t) > new Date(max))) max = t
    })
    return max
  }, [riders, riderStatus])

  function copy(value) {
    if (!value) return
    navigator.clipboard.writeText(value)
    toast('Copiado')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="admin-grid-2col-collapse">
      <div style={{ ...ds.card, padding: 18 }}>
        <h3 style={ds.h2}>Datos de reparto del socio</h3>
        <DetailRow label="API key">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors.textDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {socio.shipday_api_key
                ? (showKey ? socio.shipday_api_key : `${socio.shipday_api_key.slice(0, 6)}•••••${socio.shipday_api_key.slice(-4)}`)
                : '—'}
            </span>
            {socio.shipday_api_key && (
              <>
                <button onClick={() => setShowKey(!showKey)} style={{ ...ds.actionBtn, padding: '0 6px', height: 24 }}>
                  {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
                <button onClick={() => copy(socio.shipday_api_key)} style={{ ...ds.actionBtn, padding: '0 6px', height: 24 }}>
                  <Copy size={11} />
                </button>
              </>
            )}
          </div>
        </DetailRow>
        <DetailRow label="Carrier ID">
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors.textDim }}>{socio.shipday_carrier_id || '—'}</span>
        </DetailRow>
        <DetailRow label="Última sync rider_status">
          <span style={{ fontSize: 12, color: colors.textDim }}>{ultimaSync ? fmtRelative(ultimaSync) : 'Sin datos'}</span>
        </DetailRow>
      </div>

      <div style={{ ...ds.card, padding: 18 }}>
        <h3 style={ds.h2}>Datos fiscales</h3>
        <DetailRow label="Razón social"><span style={{ fontSize: 12.5, color: colors.textDim }}>{socio.razon_social || '—'}</span></DetailRow>
        <DetailRow label="NIF"><span style={{ fontSize: 12.5, fontFamily: 'monospace', color: colors.textDim }}>{socio.nif || '—'}</span></DetailRow>
        <DetailRow label="Dirección fiscal">
          <span style={{ fontSize: 12.5, color: colors.textDim }}>
            {[socio.direccion_fiscal, socio.codigo_postal, socio.ciudad, socio.provincia].filter(Boolean).join(', ') || '—'}
          </span>
        </DetailRow>
        <DetailRow label="IBAN"><span style={{ fontSize: 12.5, fontFamily: 'monospace', color: colors.textDim }}>{socio.iban || '—'}</span></DetailRow>
      </div>

      <div style={{ ...ds.card, padding: 18 }}>
        <h3 style={ds.h2}>Stripe Connect</h3>
        <div style={{ fontSize: 12.5, color: colors.textMute, lineHeight: 1.6 }}>
          La suscripción y el onboarding Connect se gestionan desde el panel del socio.
          Para liquidaciones automáticas, ver edge functions <code>liquidacion-semanal</code> y <code>stripe-connect-onboarding</code>.
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de UI
// ──────────────────────────────────────────────────────────────────────────────
const ESTADO_BADGE = {
  activa: { background: colors.successSoft, color: colors.success, borderColor: 'rgba(22,163,74,0.3)' },
  pendiente: { background: colors.warningSoft, color: colors.warning, borderColor: 'rgba(217,119,6,0.3)' },
  rechazada: { background: colors.dangerSoft, color: colors.danger, borderColor: 'rgba(220,38,38,0.3)' },
  solicitada: { background: colors.warningSoft, color: colors.warning, borderColor: 'rgba(217,119,6,0.3)' },
  pagado: { background: colors.successSoft, color: colors.success, borderColor: 'rgba(22,163,74,0.3)' },
  entregado: { background: colors.successSoft, color: colors.success, borderColor: 'rgba(22,163,74,0.3)' },
  cancelado: { background: colors.dangerSoft, color: colors.danger, borderColor: 'rgba(220,38,38,0.3)' },
  nuevo: { background: colors.infoSoft, color: colors.info, borderColor: 'rgba(37,99,235,0.3)' },
  preparando: { background: colors.infoSoft, color: colors.info, borderColor: 'rgba(37,99,235,0.3)' },
  listo: { background: colors.infoSoft, color: colors.info, borderColor: 'rgba(37,99,235,0.3)' },
  recogido: { background: colors.infoSoft, color: colors.info, borderColor: 'rgba(37,99,235,0.3)' },
  en_camino: { background: colors.infoSoft, color: colors.info, borderColor: 'rgba(37,99,235,0.3)' },
}

function EstadoBadge({ estado }) {
  const st = ESTADO_BADGE[estado] || { background: colors.elev2, color: colors.textMute, borderColor: colors.border }
  return <span style={{ ...ds.badge, ...st }}>{estado || '—'}</span>
}

function OnlineDot({ online, count, total, showLabel }) {
  const color = online ? colors.success : colors.textFaint
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: online ? colors.success : colors.textMute }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: online ? `0 0 0 3px ${colors.successSoft}` : 'none' }} />
      {showLabel && (online ? `${count}/${total} online` : (total > 0 ? 'Offline' : 'Sin riders'))}
      {!showLabel && total > 0 && <span style={{ color: colors.textMute }}>{count}/{total}</span>}
    </span>
  )
}

function ToggleRow({ label, on, onClick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Toggle on={on} onClick={onClick} />
      <span style={{ fontSize: 12.5, color: colors.textDim, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 34, height: 20, borderRadius: 999,
      background: on ? colors.primary : colors.elev2,
      border: `1px solid ${on ? colors.primaryBorder : colors.border}`,
      position: 'relative', cursor: 'pointer',
      transition: 'background 0.15s',
    }}>
      <span style={{
        position: 'absolute',
        top: 1, left: on ? 15 : 1,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'left 0.15s',
      }} />
    </button>
  )
}

function StatCard({ label, value, accent, warning }) {
  const color = warning ? colors.warning : (accent ? colors.success : colors.text)
  return (
    <div style={{ ...ds.card, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div>{children}</div>
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
          <Pencil size={18} color={colors.primary} />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.text, flex: 1, margin: 0 }}>Editar socio</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textMute, cursor: 'pointer' }}><X size={18} /></button>
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
                  style={{ ...ds.formInput, fontFamily: 'monospace' }} />
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
              style={{ ...ds.formInput, fontFamily: 'monospace', fontSize: 12 }} placeholder="(opcional)" />
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.textDim, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmSlug} onChange={e => setConfirmSlug(e.target.checked)} />
              Cambiar slug (con cuidado, rompe URL pública)
            </label>
            {confirmSlug && (
              <input value={slug} onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                style={{ ...ds.formInput, marginTop: 6, fontFamily: 'monospace' }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={onClose} style={ds.secondaryBtn}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{ ...ds.primaryBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
              <Save size={13} /> {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
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
          <Users size={18} color={colors.primary} />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.text, flex: 1, margin: 0 }}>Nuevo socio</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textMute, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={ds.label}>Email del usuario existente *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="socio@email.com" style={ds.formInput} />
            <div style={{ fontSize: 10.5, color: colors.textMute, marginTop: 4 }}>
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
              style={{ ...ds.formInput, fontFamily: 'monospace' }}
            />
            {slug && (
              <div style={{ fontSize: 11, marginTop: 4, color: slugStatus === 'taken' ? colors.danger : slugStatus === 'free' ? colors.success : colors.textMute }}>
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
            <input value={shipdayApiKey} onChange={e => setShipdayApiKey(e.target.value)} placeholder="(opcional)" style={{ ...ds.formInput, fontFamily: 'monospace', fontSize: 12 }} />
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
            <button onClick={onClose} style={ds.secondaryBtn}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{ ...ds.primaryBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Creando…' : 'Crear socio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


