import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { UserPlus, X, AlertCircle, MapPin, Phone, Check, Loader2 } from 'lucide-react'
import { toast } from '../App'

// Modal del super-admin para asignar / reasignar un pedido a un rider concreto.
// Props:
//  - pedido (object)            — pedido completo (con codigo, establecimiento_id, etc.)
//  - establecimiento (object?)  — opcional, datos del restaurante (nombre, latitud, longitud)
//  - onClose ()                 — cerrar
//  - onAsignado (rider)         — callback tras exito
//
// Llama a la edge function `asignar-pedido-manual` con JWT del admin actual.

const PESO_CARGA = 1500 // mismo peso que el algoritmo automatico
const GPS_FRESCO_MIN = 12 // igual que el auto-offline de socios (cron 28)

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

export default function AsignarManualModal({ pedido, establecimiento, onClose, onAsignado }) {
  const [vinculados, setVinculados] = useState([])      // riders del restaurante
  const [todos, setTodos] = useState([])                // todos los riders (para forzar)
  const [statusMap, setStatusMap] = useState({})        // rider_account_id -> { is_online, last_checked }
  const [cargaMap, setCargaMap] = useState({})          // rider_account_id -> n pedidos activos
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    cargarRiders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarRiders() {
    setCargando(true)
    try {
      // Vinculados al restaurante
      const { data: rrData } = await supabase
        .from('restaurante_riders')
        .select('prioridad, rider_account_id, rider_accounts!inner(id, nombre, telefono, activa, estado, socio_id)')
        .eq('establecimiento_id', pedido.establecimiento_id)
        .eq('rider_accounts.activa', true)
        .eq('rider_accounts.estado', 'activa')
      const vincList = (rrData || [])
        .map((r) => ({ ...r.rider_accounts, prioridad: r.prioridad }))
        .filter((r) => !!r.id)
      setVinculados(vincList)

      // Todos los activos (para forzar)
      const { data: allRiders } = await supabase
        .from('rider_accounts')
        .select('id, nombre, telefono, activa, estado, socio_id')
        .eq('activa', true)
        .eq('estado', 'activa')
      setTodos(allRiders || [])

      const ids = Array.from(new Set([...(allRiders || []).map((r) => r.id), ...vincList.map((r) => r.id)]))
      if (ids.length > 0) {
        // La disponibilidad sale de `socios`, NO de `rider_status`.
        // `rider_status` es la tabla de Shipday: tiene 0 filas y ya no la alimenta
        // ningun cron, asi que este modal pintaba a TODO el mundo como desconectado.
        // El dato bueno es `socios.en_servicio` + la frescura de `last_gps_at`
        // (el socio se auto-marca fuera a los 12 min sin posicion, cron 28), y de
        // paso trae el GPS, con lo que ya se puede ordenar por distancia real.
        const socioIds = Array.from(new Set(
          [...(allRiders || []), ...vincList].map((r) => r.socio_id).filter(Boolean)
        ))
        const sm = {}
        if (socioIds.length > 0) {
          const { data: socData } = await supabase
            .from('socios')
            .select('id, en_servicio, latitud_actual, longitud_actual, last_gps_at')
            .in('id', socioIds)
          const porSocio = {}
          for (const s of socData || []) porSocio[s.id] = s
          for (const r of [...(allRiders || []), ...vincList]) {
            const s = r.socio_id ? porSocio[r.socio_id] : null
            if (!s) continue
            const minGps = s.last_gps_at ? (Date.now() - new Date(s.last_gps_at).getTime()) / 60000 : null
            const gpsFresco = minGps != null && minGps <= GPS_FRESCO_MIN
            sm[r.id] = {
              is_online: !!s.en_servicio && gpsFresco,
              en_servicio: !!s.en_servicio,
              gpsFresco,
              last_checked: s.last_gps_at,
              lat: s.latitud_actual,
              lng: s.longitud_actual,
            }
          }
        }
        setStatusMap(sm)

        // Cargar pedidos activos (asignaciones esperando o aceptadas no resueltas)
        const { data: act } = await supabase
          .from('pedido_asignaciones')
          .select('rider_account_id')
          .in('rider_account_id', ids)
          .in('estado', ['esperando_aceptacion', 'aceptado'])
          .is('resolved_at', null)
        const cm = {}
        for (const a of act || []) cm[a.rider_account_id] = (cm[a.rider_account_id] || 0) + 1
        setCargaMap(cm)
      }
    } catch (e) {
      setError(e.message || 'Error cargando riders')
    } finally {
      setCargando(false)
    }
  }

  // Lista visible (vinculados o todos)
  const lista = useMemo(() => {
    const base = mostrarTodos ? todos : vinculados
    const idsVinc = new Set(vinculados.map((r) => r.id))
    const restLat = establecimiento?.latitud ?? null
    const restLng = establecimiento?.longitud ?? null
    const calcular = (r) => {
      const st = statusMap[r.id]
      const carga = cargaMap[r.id] || 0
      // Ahora SI hay GPS: viene de `socios` a traves de rider_accounts.socio_id.
      // Solo se usa si la posicion es reciente; con GPS viejo la distancia mentiria.
      const distancia = (st?.gpsFresco && restLat != null && restLng != null)
        ? distanceMeters(st.lat, st.lng, restLat, restLng)
        : null
      const score = distancia != null ? carga * PESO_CARGA + distancia : null
      return {
        ...r,
        prioridad: r.prioridad ?? 999,
        vinculado: idsVinc.has(r.id),
        is_online: !!st?.is_online,
        en_servicio: !!st?.en_servicio,
        gpsFresco: !!st?.gpsFresco,
        last_checked: st?.last_checked || null,
        carga,
        distancia,
        score,
      }
    }
    const enriched = base.map(calcular)
    enriched.sort((a, b) => {
      // Disponible primero, luego menos carga, luego el mas cercano, luego prioridad
      if (a.is_online !== b.is_online) return a.is_online ? -1 : 1
      if (a.carga !== b.carga) return a.carga - b.carga
      if (a.distancia != null && b.distancia != null) return a.distancia - b.distancia
      if (a.distancia != null) return -1
      if (b.distancia != null) return 1
      return (a.prioridad || 999) - (b.prioridad || 999)
    })
    return enriched
  }, [mostrarTodos, vinculados, todos, statusMap, cargaMap, establecimiento])

  async function confirmar() {
    if (!seleccionado) return toast('Selecciona un rider', 'error')
    setEnviando(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        toast('Sesion expirada', 'error')
        setEnviando(false)
        return
      }
      const forzar = !seleccionado.vinculado
      const { data, error: fnErr } = await supabase.functions.invoke('asignar-pedido-manual', {
        body: {
          pedido_id: pedido.id,
          rider_account_id: seleccionado.id,
          motivo: motivo || null,
          forzar,
        },
      })
      if (fnErr) {
        const msg = data?.error || fnErr.message || 'Error desconocido'
        setError(msg)
        toast('Error: ' + msg, 'error')
      } else if (data?.success) {
        toast(`Pedido asignado a ${data.rider?.nombre || seleccionado.nombre}`)
        if (onAsignado) onAsignado(data)
        onClose()
      } else {
        const msg = data?.error || 'Respuesta inesperada'
        setError(msg)
        toast('Error: ' + msg, 'error')
      }
    } catch (e) {
      setError(e.message || String(e))
      toast('Error: ' + (e.message || e), 'error')
    } finally {
      setEnviando(false)
    }
  }

  const restNombre = establecimiento?.nombre || pedido?.establecimientos?.nombre || '—'

  return (
    <div style={ds.modal} onClick={onClose}>
      <div
        className="admin-modal-content"
        style={{ ...ds.modalContent, maxWidth: 640, width: '90vw', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: colors.primarySoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserPlus size={18} color={colors.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>
              {pedido?.rider_account_id ? 'Reasignar pedido' : 'Asignar pedido manual'}
            </h2>
            <div style={{ fontSize: 12, color: colors.textMute }}>
              {pedido?.codigo} · {restNombre}
              {pedido?.direccion_entrega ? ` · ${pedido.direccion_entrega}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: colors.textMute,
            cursor: 'pointer', padding: 4,
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Toggle mostrar todos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: colors.textDim, cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={mostrarTodos}
              onChange={(e) => { setMostrarTodos(e.target.checked); setSeleccionado(null) }}
              style={{ cursor: 'pointer' }}
            />
            Mostrar tambien riders no vinculados a este restaurante
          </label>
          {mostrarTodos && (
            <span style={{
              ...ds.badge,
              background: colors.warningSoft, color: colors.warning,
              border: `1px solid ${colors.warningSoft}`,
            }}>
              Modo forzar
            </span>
          )}
        </div>

        {/* Lista */}
        {cargando ? (
          <div style={{
            padding: 28, textAlign: 'center',
            color: colors.textMute, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Loader2 size={14} className="spin" /> Cargando repartidores...
          </div>
        ) : lista.length === 0 ? (
          <div style={{
            padding: 16, borderRadius: 10,
            background: colors.warningSoft, color: colors.warning,
            fontSize: 12.5, lineHeight: 1.5,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {mostrarTodos
                ? 'No hay riders activos en el sistema.'
                : 'Este restaurante no tiene riders vinculados. Activa la opcion de "mostrar todos" para forzar.'}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            maxHeight: 320, overflowY: 'auto', marginBottom: 14,
            border: `1px solid ${colors.border}`, borderRadius: 10, padding: 4,
          }}>
            {lista.map((r) => {
              const activo = seleccionado?.id === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setSeleccionado(r)}
                  style={{
                    textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    border: `1px solid ${activo ? colors.primary : 'transparent'}`,
                    background: activo ? colors.primarySoft : 'transparent',
                    cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                >
                  {/* Disponible / en linea sin posicion / fuera de servicio.
                      Son TRES estados, no dos: "en servicio" con el GPS caducado
                      no se puede repartir, y antes se pintaba igual que fuera. */}
                  <span
                    title={
                      r.is_online ? 'Disponible: en servicio y con posicion reciente'
                        : r.en_servicio ? 'En servicio pero sin posicion reciente: el dispatcher no puede darle pedidos'
                        : 'Fuera de servicio'
                    }
                    style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: r.is_online ? colors.sage : r.en_servicio ? colors.warning : colors.textFaint,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
                      {r.nombre || 'Sin nombre'}
                      {!r.vinculado && (
                        <span style={{
                          ...ds.badge, marginLeft: 6,
                          background: colors.warningSoft, color: colors.warning,
                          border: 'none',
                        }}>
                          No vinculado
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: colors.textMute, marginTop: 2,
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}>
                      {r.telefono && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Phone size={10} /> {r.telefono}
                        </span>
                      )}
                      <span>Carga: {r.carga} pedido{r.carga === 1 ? '' : 's'}</span>
                      {r.distancia != null && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <MapPin size={10} /> {(r.distancia / 1000).toFixed(2)} km
                        </span>
                      )}
                      {r.last_checked && (
                        <span style={{ color: colors.textFaint }}>
                          · ult. chequeo {new Date(r.last_checked).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  {activo && <Check size={16} color={colors.primary} />}
                </button>
              )
            })}
          </div>
        )}

        {/* Motivo */}
        <div style={{ marginBottom: 14 }}>
          <label style={ds.label}>Motivo (opcional)</label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: rider habitual no conecto, reasignacion manual..."
            style={ds.formInput}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: 10, borderRadius: 10, marginBottom: 12,
            background: colors.dangerSoft, color: colors.danger,
            fontSize: 12.5, lineHeight: 1.5,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ds.secondaryBtn} disabled={enviando}>
            Cerrar
          </button>
          <button
            onClick={confirmar}
            disabled={enviando || !seleccionado}
            style={{
              ...ds.primaryBtn,
              opacity: enviando || !seleccionado ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {enviando ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            {enviando ? 'Asignando...' : 'Asignar'}
          </button>
        </div>
      </div>
    </div>
  )
}
