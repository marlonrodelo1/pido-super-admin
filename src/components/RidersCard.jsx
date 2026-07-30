import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import {
  Plus, Truck, X, CheckCircle2, AlertCircle, Phone, Mail, Package,
  Euro, Pause, Play, Link2Off, Pencil, Clock,
} from 'lucide-react'
import { toast, confirmar } from '../App'

// Socios vinculados a un restaurante.
//
// IMPORTANTE (24 jul 2026): esta tarjeta lee `socio_establecimiento`, que es la tabla
// que gobierna el reparto (create-shipday-order v56) y el dinero (comisión + tarifa
// pactada). Hasta hoy leía `restaurante_riders`, un espejo legacy de la época Shipday
// que estaba desincronizado: 28 vinculaciones reales frente a 8 filas, y 4 de 9
// restaurantes salían como "Sin socios vinculados" mientras repartían con normalidad.
//
// Quién escribe qué:
//   · estado (aprobar/rechazar/desvincular) → edge `aprobar-vinculacion-socio` v9
//     (notifica al socio y congela la tarifa propuesta al aprobar).
//   · tarifas y comisión → edges `proponer-tarifa-socio` v7 + `responder-tarifa-pendiente` v8.
//     Nunca por UPDATE directo: las edges validan los techos (50 €, 10 €/km) y dejan
//     rastro en socio_establecimiento_tarifa_log. El superadmin puede fijar tarifa al
//     instante porque proponemos y aceptamos en el mismo clic.
//   · reparto_activo y alta de vínculo nuevo → escritura directa (el trigger
//     socio_est_guard_update trata al superadmin como trusted writer).

const MAX_LOC_AGE_MS = 12 * 60 * 1000 // misma frescura de GPS que usa el dispatcher

const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

function fmtFecha(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return s }
}

// Resumen legible de una tarifa (vigente o propuesta).
export function describirTarifa(t) {
  if (!t) return 'Sin tarifa pactada'
  const modo = t.tarifa_modo === 'fija' ? 'fija' : 'distancia'
  if (modo === 'fija') {
    if (t.tarifa_fija == null) return 'Fija (importe sin definir)'
    return `Fija ${eur(t.tarifa_fija)} por entrega`
  }
  if (t.tarifa_base == null) return 'Sin tarifa pactada'
  const partes = [`${eur(t.tarifa_base)} hasta ${Number(t.tarifa_radio_base_km || 0)} km`]
  if (t.tarifa_precio_km != null) partes.push(`+${eur(t.tarifa_precio_km)}/km`)
  if (t.tarifa_maxima != null) partes.push(`máx. ${eur(t.tarifa_maxima)}`)
  return partes.join(' · ')
}

function diasHasta(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

function haceCuanto(iso) {
  if (!iso) return null
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(min) || min < 0) return null
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

export default function RidersCard({ establecimiento, onChanged }) {
  const [vinc, setVinc] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [tarifaModal, setTarifaModal] = useState(null)   // vinculación a editar
  const [detalle, setDetalle] = useState(null)
  const [busy, setBusy] = useState({})

  const setRowBusy = (id, v) => setBusy(b => ({ ...b, [id]: v }))

  const load = useCallback(async () => {
    if (!establecimiento?.id) return
    const { data, error } = await supabase.from('socio_establecimiento')
      .select(`
        id, socio_id, estado, reparto_activo, comision_pct,
        tarifa_modo, tarifa_fija, tarifa_base, tarifa_radio_base_km, tarifa_precio_km, tarifa_maxima,
        tarifa_aceptada_en, tarifa_pendiente, tarifa_pendiente_origen, tarifa_pendiente_expira_en,
        solicitado_at, aceptado_at, motivo_rechazo,
        socios(id, nombre, nombre_comercial, telefono, email, activo, en_servicio, last_location_at, limite_restaurantes)
      `)
      .eq('establecimiento_id', establecimiento.id)
    if (error) toast('Error cargando socios: ' + error.message, 'error')
    setVinc(data || [])
    setLoading(false)
  }, [establecimiento?.id])

  useEffect(() => {
    load()
    if (!establecimiento?.id) return
    const ch = supabase.channel(`socios-rest-${establecimiento.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'socio_establecimiento', filter: `establecimiento_id=eq.${establecimiento.id}` }, load)
      // El estado "en línea" NO vive aquí, vive en `socios` (en_servicio + last_location_at).
      // Sin esta segunda suscripción la tarjeta se quedaba congelada con la foto del
      // momento en que se abrió la página: un socio se conectaba y el super-admin
      // seguía diciendo "Ninguno en línea" mientras el panel del restaurante y la app
      // del cliente ya lo daban por disponible (30 jul 2026).
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'socios' }, load)
      .subscribe()
    // Además, la frescura del GPS (12 min) caduca sola con el paso del tiempo y eso no
    // genera ningún evento: sin este repaso periódico, un socio que apaga el móvil
    // seguiría saliendo "en línea" indefinidamente.
    const t = setInterval(load, 60000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [establecimiento?.id, load])

  const esPendiente = v => v.estado === 'pendiente' || v.estado === 'solicitada'
  const estaOnline = v => {
    const s = v.socios
    if (!s || s.en_servicio !== true || s.activo === false) return false
    const ts = s.last_location_at ? new Date(s.last_location_at).getTime() : NaN
    return Number.isFinite(ts) && (Date.now() - ts) <= MAX_LOC_AGE_MS
  }

  const activos = vinc.filter(v => v.estado === 'activa')
  const pendientes = vinc.filter(esPendiente)
  const online = activos.filter(v => estaOnline(v) && v.reparto_activo !== false).length
  const propuestas = vinc.filter(v => v.tarifa_pendiente)

  // Orden: primero los que reparten, luego pendientes, al final desvinculados.
  const orden = { activa: 0, pendiente: 1, solicitada: 1, rechazada: 2 }
  const lista = [...vinc].sort((a, b) =>
    (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3) ||
    (a.socios?.nombre_comercial || '').localeCompare(b.socios?.nombre_comercial || '')
  )

  async function resolverVinculo(v, accion) {
    const nombre = v.socios?.nombre_comercial || v.socios?.nombre || 'este socio'
    let motivo
    if (accion === 'desvincular') {
      const ok = await confirmar(`¿Desvincular a "${nombre}" de ${establecimiento.nombre}?\n\nDejará de recibir pedidos al instante. La tarifa pactada se conserva por si lo vuelves a vincular.`)
      if (!ok) return
      motivo = 'Desvinculado por el superadmin.'
    } else if (accion === 'rechazar') {
      const ok = await confirmar(`¿Rechazar la solicitud de "${nombre}"?`)
      if (!ok) return
      motivo = 'Solicitud rechazada por el superadmin.'
    }
    setRowBusy(v.id, true)
    try {
      const { data, error } = await supabase.functions.invoke('aprobar-vinculacion-socio', {
        body: { vinculacion_id: v.id, accion, motivo },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast(accion === 'aceptar' ? 'Socio vinculado' : accion === 'rechazar' ? 'Solicitud rechazada' : 'Socio desvinculado')
      load(); onChanged?.()
    } catch (e) {
      toast(traducirError(e), 'error')
    } finally { setRowBusy(v.id, false) }
  }

  async function responderTarifa(v, accion) {
    const nombre = v.socios?.nombre_comercial || v.socios?.nombre || 'el socio'
    const resumen = describirTarifa(v.tarifa_pendiente)
    const ok = await confirmar(
      accion === 'aceptar'
        ? `¿Aceptar la tarifa propuesta por ${nombre}?\n\n${resumen} · comisión ${Number(v.tarifa_pendiente?.comision_pct ?? 10)}%\n\nSe aplicará de inmediato a los pedidos nuevos.`
        : `¿Rechazar la propuesta de ${nombre}?\n\nSe mantiene la tarifa actual: ${describirTarifa(v)}`
    )
    if (!ok) return
    setRowBusy(v.id, true)
    try {
      const { data, error } = await supabase.functions.invoke('responder-tarifa-pendiente', {
        body: {
          socio_establecimiento_id: v.id,
          accion,
          motivo: accion === 'aceptar' ? 'Aceptada por el superadmin.' : 'Rechazada por el superadmin.',
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast(accion === 'aceptar' ? 'Tarifa aplicada' : 'Propuesta rechazada')
      load(); onChanged?.()
    } catch (e) {
      toast(traducirError(e), 'error')
    } finally { setRowBusy(v.id, false) }
  }

  async function togglePausa(v) {
    const nuevo = !(v.reparto_activo !== false)
    setRowBusy(v.id, true)
    const { error } = await supabase.from('socio_establecimiento')
      .update({ reparto_activo: nuevo }).eq('id', v.id)
    setRowBusy(v.id, false)
    if (error) return toast(traducirError(error), 'error')
    toast(nuevo ? 'Reparto reanudado' : 'Reparto pausado para este socio')
    load(); onChanged?.()
  }

  const headerBadge = (() => {
    if (activos.length === 0) return { bg: 'var(--c-danger-soft)', color: 'var(--c-danger)', label: 'Sin socios vinculados' }
    if (online === 0) return { bg: 'var(--c-warning-soft)', color: '#B45309', label: `Ninguno en línea (0/${activos.length})` }
    return { bg: 'var(--c-success-soft)', color: 'var(--c-success)', label: `${online}/${activos.length} en línea` }
  })()

  return (
    <div style={{ ...ds.card, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Truck size={18} color="#C5562C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', flex: 1, minWidth: 140 }}>Socios vinculados</h3>
        <button onClick={() => setShowAdd(true)} style={{ ...ds.primaryBtn, fontSize: 12, padding: '8px 14px' }}>
          <Plus size={12} /> Vincular socio
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ padding: '8px 12px', borderRadius: 10, background: headerBadge.bg, color: headerBadge.color, fontSize: 12, fontWeight: 700 }}>
          {headerBadge.label}
        </span>
        {pendientes.length > 0 && (
          <span style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--c-warning-soft)', color: '#B45309', fontSize: 12, fontWeight: 700 }}>
            {pendientes.length} solicitud{pendientes.length === 1 ? '' : 'es'} sin responder
          </span>
        )}
      </div>

      {/* Aviso: propuestas de tarifa que el cron aplicará solo si nadie responde */}
      {propuestas.length > 0 && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '10px 12px', borderRadius: 10, marginBottom: 14,
          background: 'var(--c-warning-soft)', border: '1px solid rgba(201,149,81,0.45)',
        }}>
          <Clock size={15} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--c-text)', lineHeight: 1.5 }}>
            <b>{propuestas.length} propuesta{propuestas.length === 1 ? '' : 's'} de tarifa sin responder.</b>{' '}
            Si nadie contesta antes de que expire, se aplica automáticamente (revisión cada hora).
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
          Aún no hay socios vinculados a este restaurante.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(v => (
            <FilaSocio
              key={v.id}
              v={v}
              online={estaOnline(v)}
              pendiente={esPendiente(v)}
              busy={!!busy[v.id]}
              onDetalle={() => setDetalle(v)}
              onTarifa={() => setTarifaModal(v)}
              onResponder={responderTarifa}
              onResolver={resolverVinculo}
              onPausa={togglePausa}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddSocioModal
          establecimiento={establecimiento}
          existentes={vinc}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); onChanged?.() }}
        />
      )}

      {tarifaModal && (
        <TarifaModal
          vinculacion={tarifaModal}
          establecimiento={establecimiento}
          onClose={() => setTarifaModal(null)}
          onSaved={() => { setTarifaModal(null); load(); onChanged?.() }}
        />
      )}

      {detalle && (
        <SocioVinculadoModal
          vinculacion={detalle}
          establecimiento={establecimiento}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  )
}

// Mensajes de error del backend traducidos a algo accionable.
function traducirError(e) {
  const msg = (e?.message || String(e || '')).toLowerCase()
  if (msg.includes('limite_restaurantes_excedido')) {
    return 'Ese socio ya está en su número máximo de restaurantes. Súbele el límite en su ficha de Socios.'
  }
  if (msg.includes('tarifa_fuera_de_rango')) return 'Importe fuera de rango: máximo 50 € por entrega y 10 €/km.'
  if (msg.includes('ya_procesada')) return 'Esa solicitud ya se había resuelto. Refresca la ficha.'
  if (msg.includes('no hay tarifa pendiente')) return 'Ya no hay propuesta pendiente (puede haber expirado).'
  if (msg.includes('solo se cambian por el flujo de propuestas')) {
    return 'La base de datos ha bloqueado el cambio directo de tarifa. Usa "Cambiar tarifa".'
  }
  return e?.message || 'Ha fallado la operación'
}

function FilaSocio({ v, online, pendiente, busy, onDetalle, onTarifa, onResponder, onResolver, onPausa }) {
  const s = v.socios || {}
  const nombre = s.nombre_comercial || s.nombre || 'Socio'
  const pausado = v.reparto_activo === false
  const desvinculado = v.estado === 'rechazada'
  const tienePropuesta = !!v.tarifa_pendiente
  const dias = diasHasta(v.tarifa_pendiente_expira_en)

  const estadoChip = desvinculado
    ? { bg: 'var(--c-surface2)', color: 'var(--c-muted)', label: 'Desvinculado' }
    : pendiente
      ? { bg: 'var(--c-warning-soft)', color: '#B45309', label: 'Solicitud pendiente' }
      : pausado
        ? { bg: 'var(--c-warning-soft)', color: '#B45309', label: 'Reparto pausado' }
        : online
          ? { bg: 'var(--c-success-soft)', color: 'var(--c-success)', label: '● En línea' }
          : { bg: 'var(--c-surface2)', color: 'var(--c-muted)', label: '○ Offline' }

  return (
    <div style={{
      background: 'var(--c-surface2)', borderRadius: 10, padding: '12px 14px',
      opacity: desvinculado ? 0.6 : 1,
      border: tienePropuesta ? '1px solid rgba(201,149,81,0.55)' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onDetalle}
          style={{ flex: '1 1 160px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{s.telefono || 'Sin teléfono'}</div>
        </button>
        <span style={{ ...ds.badge, background: estadoChip.bg, color: estadoChip.color, flexShrink: 0 }}>{estadoChip.label}</span>
      </div>

      {/* Tarifa vigente */}
      {!pendiente && !desvinculado && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Euro size={13} color="var(--c-muted)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--c-text)' }}>{describirTarifa(v)}</span>
          <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>· comisión {Number(v.comision_pct ?? 10)}%</span>
        </div>
      )}

      {/* Solicitud de vinculación (lo que antes vivía en la página "Aprobaciones").
          Aquí la tarifa NO lleva botones propios: al vincular se congela la que propuso
          (aprobar-vinculacion-socio v10 la copia), así que una sola decisión basta. */}
      {pendiente && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--c-warning-soft)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Pide vincularse{haceCuanto(v.solicitado_at) ? ` · ${haceCuanto(v.solicitado_at)}` : ''}
          </div>
          {s.email && <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>{s.email}</div>}
          <div style={{ fontSize: 12.5, color: 'var(--c-text)' }}>
            {v.tarifa_pendiente
              ? <>Tarifa que propone: <b>{describirTarifa(v.tarifa_pendiente)}</b> · comisión {Number(v.tarifa_pendiente?.comision_pct ?? 10)}%</>
              : 'No propone tarifa: entrará con la comisión por defecto (10 %) y sin envío pactado.'}
          </div>
        </div>
      )}

      {/* Propuesta de tarifa sobre un vínculo ya activo */}
      {tienePropuesta && !pendiente && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--c-warning-soft)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Propuesta {v.tarifa_pendiente_origen === 'socio' ? 'del socio' : v.tarifa_pendiente_origen === 'restaurante' ? 'del restaurante' : 'pendiente'}
            {dias != null && ` · ${dias <= 0 ? 'vencida' : dias === 1 ? 'expira mañana' : `expira en ${dias} días`}`}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--c-text)', marginBottom: 8 }}>
            {describirTarifa(v.tarifa_pendiente)} · comisión {Number(v.tarifa_pendiente?.comision_pct ?? 10)}%
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button disabled={busy} onClick={() => onResponder(v, 'aceptar')} style={{ ...ds.primaryBtn, height: 30, fontSize: 12 }}>
              <CheckCircle2 size={12} /> Aceptar
            </button>
            <button disabled={busy} onClick={() => onResponder(v, 'rechazar')} style={{ ...ds.secondaryBtn, height: 30, fontSize: 12, color: 'var(--c-danger)' }}>
              <X size={12} /> Rechazar
            </button>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {pendiente ? (
          <>
            <button disabled={busy} onClick={() => onResolver(v, 'aceptar')} style={{ ...ds.primaryBtn, height: 30, fontSize: 12 }}>
              <CheckCircle2 size={12} /> {v.tarifa_pendiente ? 'Vincular y aceptar tarifa' : 'Vincular'}
            </button>
            <button disabled={busy} onClick={() => onResolver(v, 'rechazar')} style={{ ...ds.secondaryBtn, height: 30, fontSize: 12, color: 'var(--c-danger)' }}>
              Rechazar solicitud
            </button>
          </>
        ) : desvinculado ? (
          <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>
            {v.motivo_rechazo || 'Desvinculado.'} Puedes volver a vincularlo con “Vincular socio”.
          </span>
        ) : (
          <>
            <button disabled={busy} onClick={onTarifa} style={{ ...ds.secondaryBtn, height: 30, fontSize: 12 }}>
              <Pencil size={12} /> Cambiar tarifa
            </button>
            <button disabled={busy} onClick={() => onPausa(v)} style={{ ...ds.secondaryBtn, height: 30, fontSize: 12 }}>
              {v.reparto_activo === false ? <><Play size={12} /> Reanudar</> : <><Pause size={12} /> Pausar</>}
            </button>
            <button disabled={busy} onClick={() => onResolver(v, 'desvincular')} style={{ ...ds.secondaryBtn, height: 30, fontSize: 12, color: 'var(--c-danger)' }}>
              <Link2Off size={12} /> Desvincular
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Modal: cambiar tarifa ────────────────────────────────────────────────────
// El superadmin fija la tarifa al instante: se propone y se acepta en el mismo clic.
// Así se respetan los techos de las edges y quedan las dos entradas en la auditoría.
function TarifaModal({ vinculacion: v, establecimiento, onClose, onSaved }) {
  const [modo, setModo] = useState(v.tarifa_modo === 'fija' ? 'fija' : 'distancia')
  const [fija, setFija] = useState(v.tarifa_fija ?? '')
  const [base, setBase] = useState(v.tarifa_base ?? '')
  const [radio, setRadio] = useState(v.tarifa_radio_base_km ?? '')
  const [precioKm, setPrecioKm] = useState(v.tarifa_precio_km ?? '')
  const [maxima, setMaxima] = useState(v.tarifa_maxima ?? '')
  const [comision, setComision] = useState(v.comision_pct ?? 10)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const nombre = v.socios?.nombre_comercial || v.socios?.nombre || 'el socio'

  function validar() {
    const cp = Number(comision)
    if (!Number.isFinite(cp) || cp < 0 || cp > 100) return 'La comisión debe estar entre 0 y 100.'
    if (modo === 'fija') {
      const f = Number(fija)
      if (!Number.isFinite(f) || f < 0) return 'Indica el importe fijo por entrega.'
      if (f > 50) return 'El importe fijo no puede superar 50 €.'
    } else {
      const b = Number(base), r = Number(radio), pk = Number(precioKm)
      if (![b, r, pk].every(n => Number.isFinite(n) && n >= 0)) return 'Rellena tarifa base, radio y precio por km.'
      if (b > 50 || (maxima !== '' && Number(maxima) > 50)) return 'Los importes no pueden superar 50 €.'
      if (pk > 10) return 'El precio por km no puede superar 10 €.'
      if (r > 50) return 'El radio no puede superar 50 km.'
    }
    return null
  }

  async function guardar() {
    const err = validar()
    if (err) return toast(err, 'error')
    const cuerpo = modo === 'fija'
      ? { tarifa_modo: 'fija', tarifa_fija: Number(fija) }
      : {
          tarifa_modo: 'distancia',
          tarifa_base: Number(base),
          tarifa_radio_base_km: Number(radio),
          tarifa_precio_km: Number(precioKm),
          tarifa_maxima: maxima === '' ? null : Number(maxima),
        }
    const nota = motivo.trim() || `Tarifa fijada por el superadmin desde la ficha de ${establecimiento.nombre}.`

    setSaving(true)
    try {
      // 1) Propuesta (valida techos y deja rastro en la auditoría)
      const { data: prop, error: e1 } = await supabase.functions.invoke('proponer-tarifa-socio', {
        body: {
          socio_establecimiento_id: v.id,
          origen: 'restaurante',
          comision_pct: Number(comision),
          motivo: nota,
          ...cuerpo,
        },
      })
      if (e1) throw e1
      if (prop?.error) throw new Error(prop.error)

      // 2) Aceptación inmediata: el superadmin no necesita esperar a la otra parte.
      const { data: resp, error: e2 } = await supabase.functions.invoke('responder-tarifa-pendiente', {
        body: { socio_establecimiento_id: v.id, accion: 'aceptar', motivo: nota },
      })
      if (e2) throw e2
      if (resp?.error) throw new Error(resp.error)

      toast('Tarifa actualizada y aplicada')
      onSaved()
    } catch (e) {
      toast(traducirError(e), 'error')
    } finally { setSaving(false) }
  }

  const inputRow = (label, value, setter, props = {}) => (
    <div>
      <label style={ds.label}>{label}</label>
      <input type="number" step="0.10" min="0" value={value}
        onChange={e => setter(e.target.value)} style={ds.formInput} {...props} />
    </div>
  )

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Euro size={18} color="#C5562C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', flex: 1 }}>Tarifa con {nombre}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={16} color="var(--c-text)" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Se aplica de inmediato a los pedidos nuevos de {establecimiento.nombre}, sin esperar respuesta del socio. Queda registrado en la auditoría.
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[{ id: 'fija', l: 'Precio fijo' }, { id: 'distancia', l: 'Por distancia' }].map(m => (
            <button key={m.id} onClick={() => setModo(m.id)} style={{
              ...ds.secondaryBtn, flex: 1, justifyContent: 'center',
              background: modo === m.id ? '#C5562C' : 'var(--c-surface)',
              color: modo === m.id ? '#fff' : 'var(--c-text)',
              borderColor: modo === m.id ? '#C5562C' : 'var(--c-border)',
            }}>{m.l}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
          {modo === 'fija' ? (
            inputRow('Importe por entrega (€) · máx. 50', fija, setFija)
          ) : (
            <>
              <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {inputRow('Tarifa base (€)', base, setBase)}
                {inputRow('Radio incluido (km)', radio, setRadio, { step: '0.5' })}
              </div>
              <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {inputRow('Precio por km extra (€) · máx. 10', precioKm, setPrecioKm)}
                {inputRow('Tope máximo (€, opcional)', maxima, setMaxima)}
              </div>
            </>
          )}
          <div>
            <label style={ds.label}>Comisión del socio sobre el pedido (%)</label>
            <input type="number" step="1" min="0" max="100" value={comision}
              onChange={e => setComision(e.target.value)} style={ds.formInput} />
            <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 4 }}>
              Lo que se lleva el socio del subtotal, además del envío. Por defecto 10 %.
            </div>
          </div>
          <div>
            <label style={ds.label}>Motivo (opcional)</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Pacto cerrado por teléfono" style={ds.formInput} />
          </div>
        </div>

        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--c-surface2)', fontSize: 12, color: 'var(--c-text)', marginBottom: 14 }}>
          <b>Quedará así:</b> {describirTarifa(modo === 'fija'
            ? { tarifa_modo: 'fija', tarifa_fija: fija || 0 }
            : { tarifa_modo: 'distancia', tarifa_base: base || 0, tarifa_radio_base_km: radio || 0, tarifa_precio_km: precioKm || 0, tarifa_maxima: maxima === '' ? null : maxima })}
          {' '}· comisión {Number(comision) || 0}%
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...ds.secondaryBtn, flex: 1, justifyContent: 'center' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ ...ds.primaryBtn, flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Aplicando…' : 'Aplicar tarifa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: vincular socio ────────────────────────────────────────────────────
function AddSocioModal({ establecimiento, existentes, onClose, onSaved }) {
  const [socios, setSocios] = useState([])
  const [buscar, setBuscar] = useState('')
  const [sel, setSel] = useState(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('socios')
      .select('id, user_id, nombre, nombre_comercial, telefono, activo, limite_restaurantes')
      .eq('activo', true).order('nombre_comercial')
      .then(({ data }) => setSocios(data || []))
  }, [])

  // Un socio ya "ocupado" es el que tiene vínculo activo o solicitud pendiente.
  // Los rechazados sí se pueden volver a vincular (reactivamos su fila).
  const ocupados = new Map()
  for (const v of existentes) {
    if (v.estado === 'activa' || v.estado === 'pendiente' || v.estado === 'solicitada') ocupados.set(v.socio_id, v.estado)
  }
  const rechazados = new Map(existentes.filter(v => v.estado === 'rechazada').map(v => [v.socio_id, v]))

  const disponibles = socios.filter(s =>
    !ocupados.has(s.id) &&
    (!buscar || (s.nombre_comercial || s.nombre || '').toLowerCase().includes(buscar.toLowerCase()))
  )

  function toggle(id) {
    const n = new Set(sel)
    n.has(id) ? n.delete(id) : n.add(id)
    setSel(n)
  }

  async function vincular() {
    if (sel.size === 0) return toast('Selecciona al menos un socio', 'error')
    setSaving(true)
    const ahora = new Date().toISOString()
    let ok = 0
    const errores = []
    for (const socioId of sel) {
      const previa = rechazados.get(socioId)
      const socio = socios.find(s => s.id === socioId)
      const nombre = socio?.nombre_comercial || socio?.nombre || 'socio'
      // Reactivar el vínculo antiguo conserva la tarifa pactada; si no había, se crea.
      const { error } = previa
        ? await supabase.from('socio_establecimiento')
            .update({ estado: 'activa', aceptado_at: ahora, motivo_rechazo: null }).eq('id', previa.id)
        : await supabase.from('socio_establecimiento')
            .insert({ socio_id: socioId, establecimiento_id: establecimiento.id, estado: 'activa', solicitado_at: ahora, aceptado_at: ahora })
      if (error) { errores.push(`${nombre}: ${traducirError(error)}`); continue }
      ok++
      // OJO con las columnas: la tabla es usuario_id/titulo/descripcion/tipo/data.
      // Varias edges insertan aquí user_id/cuerpo/url (columnas inexistentes) y fallan
      // en silencio — ver nota al superadmin del 24 jul 2026.
      if (socio?.user_id) {
        const { error: nErr } = await supabase.from('notificaciones').insert({
          usuario_id: socio.user_id,
          titulo: 'Nuevo restaurante asignado',
          descripcion: `Pidoo te ha vinculado con ${establecimiento.nombre}. Ya puedes recibir sus pedidos.`,
          tipo: 'vinculacion',
          data: { establecimiento_id: establecimiento.id },
        })
        if (nErr) console.warn('[RidersCard] notificación al socio no enviada:', nErr.message)
      }
    }
    setSaving(false)
    if (ok > 0) toast(`${ok} socio${ok === 1 ? '' : 's'} vinculado${ok === 1 ? '' : 's'}`)
    if (errores.length) toast(errores[0], 'error')
    if (ok > 0) onSaved()
  }

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={ds.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Truck size={18} color="#C5562C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', flex: 1 }}>Vincular socio</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={16} color="var(--c-text)" />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Quedan vinculados al instante, sin esperar aprobación. Empiezan con la comisión por defecto (10 %) y sin tarifa de envío pactada; ajústala después con “Cambiar tarifa”.
        </div>

        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar socio..." style={{ ...ds.formInput, marginBottom: 12 }} />

        {disponibles.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
            {socios.length === 0
              ? 'No hay socios activos. Que se registren en socio.pidoo.es.'
              : 'Todos los socios activos ya están vinculados o tienen una solicitud abierta.'}
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {disponibles.map(s => {
              const marcado = sel.has(s.id)
              const revincular = rechazados.has(s.id)
              return (
                <button key={s.id} onClick={() => toggle(s.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: marcado ? '1.5px solid #C5562C' : '1px solid var(--c-border)',
                  background: marcado ? 'var(--c-primary-soft)' : 'var(--c-surface2)',
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: marcado ? 'none' : '1.5px solid var(--c-muted)',
                    background: marcado ? '#C5562C' : 'transparent',
                    display: 'grid', placeItems: 'center',
                  }}>
                    {marcado && <CheckCircle2 size={14} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{s.nombre_comercial || s.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{s.telefono || 'Sin teléfono'}</div>
                  </div>
                  {revincular && (
                    <span style={{ ...ds.badge, background: 'var(--c-surface2)', color: 'var(--c-muted)', flexShrink: 0 }}>Revincular</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...ds.secondaryBtn, flex: 1, justifyContent: 'center' }}>Cancelar</button>
          <button onClick={vincular} disabled={saving || sel.size === 0} style={{ ...ds.primaryBtn, flex: 1, justifyContent: 'center', opacity: saving || sel.size === 0 ? 0.5 : 1 }}>
            {saving ? 'Vinculando…' : `Vincular (${sel.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: detalle del socio ─────────────────────────────────────────────────
function SocioVinculadoModal({ vinculacion: v, establecimiento, onClose }) {
  const [pedidos, setPedidos] = useState(null)
  const [historial, setHistorial] = useState([])
  const s = v.socios || {}

  useEffect(() => {
    let cancel = false
    supabase.from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('establecimiento_id', establecimiento.id)
      .eq('socio_id', v.socio_id)
      .then(({ count }) => { if (!cancel) setPedidos(count ?? 0) })
    supabase.from('socio_establecimiento_tarifa_log')
      .select('id, evento, origen, motivo, tarifa_nueva, created_at')
      .eq('socio_id', v.socio_id).eq('establecimiento_id', establecimiento.id)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (!cancel) setHistorial(data || []) })
    return () => { cancel = true }
  }, [v.socio_id, establecimiento.id])

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Truck size={18} color="#C5562C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', flex: 1 }}>{s.nombre_comercial || s.nombre}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={16} color="var(--c-text)" />
          </button>
        </div>

        <div style={{ ...ds.card, padding: 14, marginBottom: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text)' }}>
            <Phone size={14} color="var(--c-muted)" />{s.telefono || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text)' }}>
            <Mail size={14} color="var(--c-muted)" />{s.email || '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text)' }}>
            <AlertCircle size={14} color="var(--c-muted)" />Última señal GPS: {fmtFecha(s.last_location_at)}
          </div>
        </div>

        <div style={{ ...ds.card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Acuerdo con {establecimiento.nombre}
          </div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <Linea etiqueta="Tarifa" valor={describirTarifa(v)} />
            <Linea etiqueta="Comisión" valor={`${Number(v.comision_pct ?? 10)}%`} />
            <Linea etiqueta="Pactada el" valor={fmtFecha(v.tarifa_aceptada_en)} />
            <Linea etiqueta="Vinculado el" valor={fmtFecha(v.aceptado_at || v.solicitado_at)} />
            <Linea etiqueta="Reparto" valor={v.reparto_activo === false ? 'Pausado' : 'Activo'} />
          </div>
        </div>

        <div style={{ ...ds.card, padding: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--c-primary-soft)', display: 'grid', placeItems: 'center' }}>
            <Package size={18} color="#C5562C" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pedidos de este restaurante</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>{pedidos === null ? '…' : pedidos}</div>
          </div>
        </div>

        {historial.length > 0 && (
          <div style={{ ...ds.card, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Historial de tarifas
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {historial.map(h => (
                <div key={h.id} style={{ fontSize: 12, color: 'var(--c-text)', borderLeft: '2px solid var(--c-border)', paddingLeft: 10 }}>
                  <div style={{ fontWeight: 700 }}>{h.evento?.replace(/_/g, ' ')} <span style={{ fontWeight: 500, color: 'var(--c-muted)' }}>· {h.origen}</span></div>
                  <div style={{ color: 'var(--c-muted)' }}>{describirTarifa(h.tarifa_nueva)} — {fmtFecha(h.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} style={{ ...ds.secondaryBtn, width: '100%', justifyContent: 'center' }}>Cerrar</button>
      </div>
    </div>
  )
}

function Linea({ etiqueta, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--c-muted)' }}>{etiqueta}</span>
      <span style={{ color: 'var(--c-text)', fontWeight: 600, textAlign: 'right' }}>{valor}</span>
    </div>
  )
}
