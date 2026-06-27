import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { toast, confirmar } from '../App'
import {
  Inbox, Truck, Store, Building2, Check, X, RefreshCw,
  Mail, Phone, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react'

// ──────────────────────────────────────────────────────────────────────────────
// Aprobaciones — bandeja única de todo lo pendiente de aprobación.
//
// 3 colas (cada cosa sin resolver = dinero sin facturar o socio sin operar):
//
//  1. Riders/cuentas pendientes  → rider_accounts.estado = 'pendiente'
//       Aprobar   → estado='activa'  + aprobado_en = now()
//       Rechazar  → estado='rechazada' + motivo_rechazo
//     (update directo; superadmin tiene policies superadmin_full_* sobre rider_accounts)
//
//  2. Vinculaciones socio↔restaurante → socio_establecimiento.estado IN ('solicitada','pendiente')
//       Aprobar/Rechazar vía edge function `aprobar-vinculacion-socio`
//       payload: { vinculacion_id, accion: 'aceptar'|'rechazar', motivo? }
//
//  3. Altas de restaurante pendientes de verificación → establecimientos.estado = 'pendiente_verificacion'
//       Activar  → estado='activo'  (Puerta B del flujo socio-crear-restaurante / admin-crear-restaurante)
//       Rechazar → estado='rechazado' + rechazo_motivo
//     (update directo; el trigger guard_establecimientos_protected_fields permite al
//      super-admin cambiar `estado`. is_superadmin() === true con el JWT del super-admin)
// ──────────────────────────────────────────────────────────────────────────────

export default function Aprobaciones() {
  const [riders, setRiders] = useState([])
  const [vinculaciones, setVinculaciones] = useState([])
  const [altas, setAltas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({}) // id -> true mientras se procesa

  const loadRiders = useCallback(async () => {
    const { data, error } = await supabase
      .from('rider_accounts')
      .select('id, nombre, email, telefono, estado, shipday_api_key, establecimiento_origen_id, creado_por, created_at')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true })
    if (error) { toast(error.message, 'error'); return }
    setRiders(data || [])
  }, [])

  const loadVinculaciones = useCallback(async () => {
    const { data, error } = await supabase
      .from('socio_establecimiento')
      .select('id, socio_id, establecimiento_id, estado, solicitado_at, tarifa_pendiente, socios(id, nombre_comercial, nombre, email), establecimientos(id, nombre, logo_url)')
      .in('estado', ['solicitada', 'pendiente'])
      .order('solicitado_at', { ascending: true })
    if (error) { toast(error.message, 'error'); return }
    setVinculaciones(data || [])
  }, [])

  const loadAltas = useCallback(async () => {
    const { data, error } = await supabase
      .from('establecimientos')
      .select('id, nombre, email, telefono, direccion, estado, alta_confirmada_at, captador_socio_id, logo_url, created_at')
      .eq('estado', 'pendiente_verificacion')
      .order('created_at', { ascending: true })
    if (error) { toast(error.message, 'error'); return }
    setAltas(data || [])
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadRiders(), loadVinculaciones(), loadAltas()])
    setLoading(false)
  }, [loadRiders, loadVinculaciones, loadAltas])

  useEffect(() => { loadAll() }, [loadAll])

  // Realtime: refresca cada cola al cambiar su tabla
  useEffect(() => {
    const ch = supabase.channel('aprobaciones-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_accounts' }, () => loadRiders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'socio_establecimiento' }, () => loadVinculaciones())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'establecimientos' }, () => loadAltas())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadRiders, loadVinculaciones, loadAltas])

  const setRowBusy = (id, v) => setBusy(prev => ({ ...prev, [id]: v }))

  // ── Cola 1: Riders ──────────────────────────────────────────────────────────
  async function aprobarRider(r) {
    setRowBusy(r.id, true)
    const { error } = await supabase
      .from('rider_accounts')
      .update({ estado: 'activa', aprobado_en: new Date().toISOString(), motivo_rechazo: null })
      .eq('id', r.id)
    setRowBusy(r.id, false)
    if (error) return toast(error.message, 'error')
    toast(`Rider "${r.nombre || 'sin nombre'}" aprobado`)
    loadRiders()
  }

  async function rechazarRider(r) {
    const motivo = await pedirMotivo(`¿Rechazar al rider "${r.nombre || 'sin nombre'}"?`)
    if (motivo === null) return
    setRowBusy(r.id, true)
    const { error } = await supabase
      .from('rider_accounts')
      .update({ estado: 'rechazada', motivo_rechazo: motivo || null })
      .eq('id', r.id)
    setRowBusy(r.id, false)
    if (error) return toast(error.message, 'error')
    toast('Rider rechazado')
    loadRiders()
  }

  // ── Cola 2: Vinculaciones (edge function) ─────────────────────────────────────
  async function resolverVinculacion(v, accion) {
    let motivo = null
    if (accion === 'rechazar') {
      const nombreEst = v.establecimientos?.nombre || 'restaurante'
      motivo = await pedirMotivo(`¿Rechazar la vinculación con "${nombreEst}"?`)
      if (motivo === null) return
    }
    setRowBusy(v.id, true)
    try {
      const { data, error } = await supabase.functions.invoke('aprobar-vinculacion-socio', {
        body: { vinculacion_id: v.id, accion, motivo: motivo || undefined },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast(accion === 'aceptar' ? 'Vinculación aprobada' : 'Vinculación rechazada')
      loadVinculaciones()
    } catch (e) {
      toast(e?.message || 'Error procesando la vinculación', 'error')
    } finally {
      setRowBusy(v.id, false)
    }
  }

  // ── Cola 3: Altas de restaurante ──────────────────────────────────────────────
  async function activarAlta(e) {
    const ok = await confirmar(`¿Verificar y activar "${e.nombre}"? Pasará a estar público.`)
    if (!ok) return
    setRowBusy(e.id, true)
    const { error } = await supabase
      .from('establecimientos')
      .update({ estado: 'activo' })
      .eq('id', e.id)
    setRowBusy(e.id, false)
    if (error) return toast(error.message, 'error')
    toast(`"${e.nombre}" verificado y activado`)
    loadAltas()
  }

  async function rechazarAlta(e) {
    const motivo = await pedirMotivo(`¿Rechazar el alta de "${e.nombre}"?`)
    if (motivo === null) return
    setRowBusy(e.id, true)
    const { error } = await supabase
      .from('establecimientos')
      .update({ estado: 'rechazado', rechazo_motivo: motivo || null })
      .eq('id', e.id)
    setRowBusy(e.id, false)
    if (error) return toast(error.message, 'error')
    toast('Alta rechazada')
    loadAltas()
  }

  const total = riders.length + vinculaciones.length + altas.length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={ds.h1}>Aprobaciones</h1>
          <div style={{ fontSize: 13, color: colors.textMute, marginTop: 4 }}>
            Todo lo que está pendiente de tu visto bueno, en un solo sitio.
          </div>
        </div>
        <button onClick={loadAll} disabled={loading} style={{ ...ds.secondaryBtn, opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={14} className={loading ? 'aprob-spin' : ''} /> Actualizar
        </button>
      </div>

      <style>{`@keyframes aprob-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.aprob-spin{animation:aprob-spin 1s linear infinite}`}</style>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        <ResumenCard Icon={Truck} label="Riders pendientes" value={riders.length} />
        <ResumenCard Icon={Store} label="Vinculaciones" value={vinculaciones.length} />
        <ResumenCard Icon={Building2} label="Altas restaurante" value={altas.length} />
        <ResumenCard Icon={Inbox} label="Total pendiente" value={total} accent />
      </div>

      {loading ? (
        <div style={{ ...ds.card, padding: 40, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>
          Cargando colas…
        </div>
      ) : (
        <>
          {/* ── COLA 1: Riders ── */}
          <Seccion Icon={Truck} titulo="Riders / cuentas pendientes" count={riders.length}>
            {riders.length === 0 ? (
              <Vacio mensaje="Sin riders pendientes de aprobación." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {riders.map(r => (
                  <ItemRow
                    key={r.id}
                    busy={!!busy[r.id]}
                    titulo={r.nombre || 'Rider sin nombre'}
                    sub={[
                      r.email && { Icon: Mail, txt: r.email },
                      r.telefono && { Icon: Phone, txt: r.telefono },
                    ].filter(Boolean)}
                    meta={[
                      { Icon: Clock, txt: fmtRel(r.created_at) },
                      r.shipday_api_key && { txt: `key ${r.shipday_api_key.slice(0, 8)}…`, mono: true },
                    ].filter(Boolean)}
                    onApprove={() => aprobarRider(r)}
                    onReject={() => rechazarRider(r)}
                    approveLabel="Aprobar"
                  />
                ))}
              </div>
            )}
          </Seccion>

          {/* ── COLA 2: Vinculaciones socio↔restaurante ── */}
          <Seccion Icon={Store} titulo="Vinculaciones socio ↔ restaurante" count={vinculaciones.length}>
            {vinculaciones.length === 0 ? (
              <Vacio mensaje="Sin solicitudes de vinculación pendientes." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {vinculaciones.map(v => {
                  const socioNombre = v.socios?.nombre_comercial || v.socios?.nombre || 'Socio'
                  const estNombre = v.establecimientos?.nombre || 'Restaurante'
                  return (
                    <ItemRow
                      key={v.id}
                      busy={!!busy[v.id]}
                      logo={v.establecimientos?.logo_url}
                      titulo={`${socioNombre} → ${estNombre}`}
                      sub={[
                        v.socios?.email && { Icon: Mail, txt: v.socios.email },
                      ].filter(Boolean)}
                      meta={[
                        { txt: `Solicita: ${socioNombre}` },
                        { Icon: Clock, txt: fmtRel(v.solicitado_at) },
                      ]}
                      onApprove={() => resolverVinculacion(v, 'aceptar')}
                      onReject={() => resolverVinculacion(v, 'rechazar')}
                      approveLabel="Aprobar"
                    />
                  )
                })}
              </div>
            )}
          </Seccion>

          {/* ── COLA 3: Altas de restaurante ── */}
          <Seccion Icon={Building2} titulo="Altas de restaurante por verificar" count={altas.length} ultima>
            {altas.length === 0 ? (
              <Vacio mensaje="Sin altas de restaurante pendientes de verificación." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {altas.map(e => (
                  <ItemRow
                    key={e.id}
                    busy={!!busy[e.id]}
                    logo={e.logo_url}
                    titulo={e.nombre || 'Restaurante'}
                    sub={[
                      e.email && { Icon: Mail, txt: e.email },
                      e.telefono && { Icon: Phone, txt: e.telefono },
                    ].filter(Boolean)}
                    meta={[
                      { Icon: Clock, txt: fmtRel(e.created_at) },
                      e.captador_socio_id
                        ? { txt: 'Captado por socio' }
                        : { txt: 'Alta directa' },
                      e.alta_confirmada_at
                        ? { Icon: CheckCircle2, txt: 'Dueño confirmó', ok: true }
                        : { Icon: AlertCircle, txt: 'Dueño sin confirmar', warn: true },
                    ]}
                    onApprove={() => activarAlta(e)}
                    onReject={() => rechazarAlta(e)}
                    approveLabel="Verificar y activar"
                  />
                ))}
              </div>
            )}
          </Seccion>
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ──────────────────────────────────────────────────────────────────────────────

function ResumenCard({ Icon, label, value, accent }) {
  return (
    <div style={{
      ...ds.card,
      padding: 16,
      display: 'flex', alignItems: 'center', gap: 12,
      borderColor: accent && value > 0 ? colors.primaryBorder : colors.border,
      background: accent && value > 0 ? colors.primarySoft : colors.surface,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: value > 0 ? colors.primarySoft : colors.elev2,
        color: value > 0 ? colors.primary : colors.textMute,
      }}>
        <Icon size={18} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: colors.textMute, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function Seccion({ Icon, titulo, count, ultima, children }) {
  return (
    <div style={{ marginBottom: ultima ? 0 : 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Icon size={16} color={colors.primary} />
        <h2 style={{ ...ds.h2, margin: 0 }}>{titulo}</h2>
        <span style={{
          ...ds.badge,
          background: count > 0 ? colors.primarySoft : colors.elev2,
          color: count > 0 ? colors.primary : colors.textMute,
          borderColor: count > 0 ? colors.primaryBorder : colors.border,
        }}>{count}</span>
      </div>
      {children}
    </div>
  )
}

function Vacio({ mensaje }) {
  return (
    <div style={{ ...ds.card, padding: 24, textAlign: 'center' }}>
      <CheckCircle2 size={22} color={colors.success} style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 13, color: colors.textMute }}>{mensaje}</div>
    </div>
  )
}

function ItemRow({ busy, logo, titulo, sub = [], meta = [], onApprove, onReject, approveLabel }) {
  const inicial = (titulo || '?').charAt(0).toUpperCase()
  return (
    <div style={{ ...ds.card, padding: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', opacity: busy ? 0.6 : 1 }}>
      {logo
        ? <img src={logo} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', background: colors.elev2, flexShrink: 0 }} />
        : <div style={{ width: 42, height: 42, borderRadius: 10, background: colors.elev2, display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, color: colors.textMute, flexShrink: 0 }}>{inicial}</div>}

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{titulo}</div>
        {sub.length > 0 && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 3 }}>
            {sub.map((s, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: colors.textMute }}>
                {s.Icon && <s.Icon size={11} />} {s.txt}
              </span>
            ))}
          </div>
        )}
        {meta.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
            {meta.map((m, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: m.ok ? colors.success : m.warn ? colors.warning : colors.textFaint,
                fontFamily: m.mono ? 'monospace' : 'inherit',
              }}>
                {m.Icon && <m.Icon size={10} />} {m.txt}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={onApprove}
          disabled={busy}
          style={{
            ...ds.primaryBtn,
            background: colors.success, borderColor: colors.success,
            boxShadow: '0 4px 10px -4px rgba(139,157,122,0.5)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>
          <Check size={14} /> {approveLabel}
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          style={{
            ...ds.secondaryBtn,
            color: colors.danger,
            borderColor: 'rgba(181,86,74,0.35)',
            background: 'rgba(181,86,74,0.06)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}>
          <X size={14} /> Rechazar
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// Confirmación + motivo opcional. Devuelve string (puede ser '') si confirma,
// o null si cancela. Usa confirmar() (modal del panel) + prompt nativo para el motivo.
async function pedirMotivo(pregunta) {
  const ok = await confirmar(pregunta)
  if (!ok) return null
  const motivo = window.prompt('Motivo (opcional, se notifica al interesado):', '')
  // prompt devuelve null si cancela; lo tratamos como "sin motivo" pero confirmado
  return motivo == null ? '' : motivo.trim()
}

function fmtRel(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const dias = Math.floor(h / 24)
  if (dias < 30) return `hace ${dias} d`
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}
