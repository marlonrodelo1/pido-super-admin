import { useState, useEffect, useMemo, useRef } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, EstadoBadge, GhostBtn, GlossyBtn, MiniBtn, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { RefreshCw, MapPin, Phone, Navigation, AlertTriangle, Eye } from 'lucide-react'
import AsignarManualModal from '../components/AsignarManualModal'
import MapaFlota from '../components/MapaFlota'
import PedidoDrawer from '../components/PedidoDrawer'

// ─────────────────────────────────────────────────────────────────────────────
// TORRE DE CONTROL
//
// Sustituye a la antigua pantalla "Mapa en vivo", que solo pintaba los
// restaurantes y no servía para operar.
//
// Aquí conviven las dos mitades del reparto, que en la base de datos son dos
// tablas distintas y es la trampa de esta pantalla:
//   · `socios`         → la PERSONA. Es quien manda el GPS (`latitud_actual`,
//                        `longitud_actual`, `last_gps_at`) y quien se pone en
//                        servicio (`en_servicio`). Aquí se ve dónde está.
//   · `rider_accounts` → la CUENTA de reparto (DeltaFood, Deli Santana…). Es lo
//                        que entiende el dispatcher: `pedidos.rider_account_id`
//                        y `pedido_asignaciones.rider_account_id`. Aquí se asigna.
// Las une `rider_accounts.socio_id`, 1 a 1.
//
// ⚠️ NO usar `rider_status` para saber quién está disponible: es la tabla de
// Shipday, está VACÍA (0 filas) y ya no la alimenta ningún cron.
// ─────────────────────────────────────────────────────────────────────────────

// El socio se marca fuera de servicio solo a los 12 min sin GPS (cron 28). Con
// el GPS más viejo que eso sigue diciendo "En línea" pero NO se le puede repartir:
// el dispatcher lo descarta por falta de posición.
const GPS_FRESCO_MIN = 12

const ESTADOS_EN_VUELO = ['nuevo', 'aceptado', 'preparando', 'listo', 'recogido', 'en_camino']

function metros(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v == null)) return null
  const R = 6371000
  const rad = d => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

const km = (m) => (m == null ? '—' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

function hace(iso) {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`
}

export default function Dispatch() {
  const [pedidos, setPedidos] = useState([])
  const [socios, setSocios] = useState([])
  const [cuentas, setCuentas] = useState([])          // rider_accounts
  const [establecimientos, setEstablecimientos] = useState([])
  const [asignaciones, setAsignaciones] = useState({}) // pedido_id -> última oferta sin resolver
  const [pedidoSel, setPedidoSel] = useState(null)     // id del pedido elegido (lo enfoca el mapa)
  const [ficha, setFicha] = useState(null)             // id del pedido con la ficha abierta
  const [modalAsignar, setModalAsignar] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [ultima, setUltima] = useState(null)
  const timer = useRef(null)

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' })

  useEffect(() => {
    cargar()
    // El GPS del socio entra por latido cada 60 s: con sondear cada 20 s va sobrado.
    timer.current = setInterval(cargar, 20000)
    // Los pedidos sí llegan por realtime, que es lo que tiene que ser instantáneo.
    const ch = supabase.channel('dispatch-pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, cargar)
      .subscribe()
    return () => { clearInterval(timer.current); supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    const [pedRes, socRes, cuentasRes, estRes, asigRes] = await Promise.all([
      supabase.from('pedidos')
        // `aceptado_at` es imprescindible: sin él la insignia "Sin aceptar" salía
        // SIEMPRE, porque una columna que no se pide llega como undefined y eso
        // es falsy. Es la misma clase de fallo que documenta lib/estColumns.js
        // en pido-app: cada listado escribiendo su propia lista de columnas.
        .select('id, codigo, estado, modo_entrega, total, created_at, aceptado_at, assigned_at, socio_id, rider_account_id, shipday_status, intento_asignacion, establecimiento_id, direccion_entrega, lat_entrega, lng_entrega, metodo_pago, establecimientos(nombre, latitud, longitud)')
        .in('estado', ESTADOS_EN_VUELO)
        .order('created_at', { ascending: true }),
      supabase.from('socios')
        .select('id, nombre, telefono, logo_url, en_servicio, activo, latitud_actual, longitud_actual, last_gps_at')
        .eq('activo', true),
      supabase.from('rider_accounts')
        .select('id, nombre, socio_id, activa, estado')
        .eq('activa', true).eq('estado', 'activa'),
      supabase.from('establecimientos')
        .select('id, nombre, latitud, longitud, logo_url, activo, estado')
        .eq('activo', true),
      // Última oferta de cada pedido: es lo único que dice si el repartidor
      // ACEPTÓ o sigue sin contestar. Sin esto, un pedido con repartidor
      // asignado y uno ya aceptado se ven igual.
      supabase.from('pedido_asignaciones')
        .select('pedido_id, intento, estado, created_at, rider_account_id')
        .is('resolved_at', null)
        .order('intento', { ascending: false }),
    ])
    setPedidos(pedRes.data || [])
    setSocios(socRes.data || [])
    setCuentas(cuentasRes.data || [])
    setEstablecimientos(estRes.data || [])
    const ultima = {}
    for (const a of (asigRes.data || [])) if (!ultima[a.pedido_id]) ultima[a.pedido_id] = a
    setAsignaciones(ultima)
    setUltima(new Date())
    setCargando(false)
  }

  const pedido = useMemo(() => pedidos.find(p => p.id === pedidoSel) || null, [pedidos, pedidoSel])

  // Un socio "disponible" es el que está en servicio Y con GPS fresco. Los dos a la vez:
  // en servicio sin posición reciente no se le puede asignar nada.
  const flota = useMemo(() => {
    const porSocio = {}
    for (const c of cuentas) if (c.socio_id) porSocio[c.socio_id] = c
    const cargaPorSocio = {}
    for (const p of pedidos) if (p.socio_id) cargaPorSocio[p.socio_id] = (cargaPorSocio[p.socio_id] || 0) + 1

    const restLat = pedido?.establecimientos?.latitud ?? null
    const restLng = pedido?.establecimientos?.longitud ?? null

    return socios.map(s => {
      const minGps = s.last_gps_at ? (Date.now() - new Date(s.last_gps_at).getTime()) / 60000 : null
      const gpsFresco = minGps != null && minGps <= GPS_FRESCO_MIN
      const distancia = gpsFresco ? metros(s.latitud_actual, s.longitud_actual, restLat, restLng) : null
      return {
        ...s,
        cuenta: porSocio[s.id] || null,
        carga: cargaPorSocio[s.id] || 0,
        minGps,
        gpsFresco,
        disponible: !!s.en_servicio && gpsFresco,
        distancia,
      }
    }).sort((a, b) => {
      if (a.disponible !== b.disponible) return a.disponible ? -1 : 1
      if (a.carga !== b.carga) return a.carga - b.carga
      if (a.distancia != null && b.distancia != null) return a.distancia - b.distancia
      return (a.nombre || '').localeCompare(b.nombre || '')
    })
  }, [socios, cuentas, pedidos, pedido])

  const sinAsignar = pedidos.filter(p => p.modo_entrega === 'delivery' && !p.socio_id)
  const enApuros = pedidos.filter(p => p.shipday_status === 'no_rider' || (p.intento_asignacion || 0) >= 2)
  const disponibles = flota.filter(f => f.disponible)
  const enLineaSinGps = flota.filter(f => f.en_servicio && !f.gpsFresco)

  // Cola: primero lo que necesita mano, después por antigüedad
  const cola = useMemo(() => {
    const urgencia = (p) =>
      p.shipday_status === 'no_rider' ? 0
        : (p.modo_entrega === 'delivery' && !p.socio_id) ? 1
        : (p.intento_asignacion || 0) >= 2 ? 2
        : 3
    return [...pedidos].sort((a, b) => urgencia(a) - urgencia(b) || new Date(a.created_at) - new Date(b.created_at))
  }, [pedidos])

  function abrirAsignar(p) {
    const est = establecimientos.find(e => e.id === p.establecimiento_id)
      || (p.establecimientos ? { ...p.establecimientos, id: p.establecimiento_id } : null)
    setModalAsignar({ pedido: p, establecimiento: est })
  }

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Dispatch</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Quién está repartiendo, dónde está y qué pedido va sin dueño
            {ultima && <span style={{ ...type.caption, color: colors.stone }}> · actualizado {hace(ultima.toISOString())}</span>}
          </div>
        </div>
        <GhostBtn onClick={cargar}><RefreshCw size={14} /> Actualizar</GhostBtn>
      </div>

      {/* 155 y no 180: en un móvil de 375px eso da dos columnas en vez de cuatro
          tarjetas en fila india, igual que en el Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Pedidos en vuelo" value={pedidos.length} sub="Sin entregar ni cancelar" />
        <StatCard label="Sin repartidor" value={sinAsignar.length} sub="Reparto sin socio asignado" tone={sinAsignar.length ? 'danger' : 'ink'} />
        <StatCard label="Disponibles ahora" value={disponibles.length} sub={`De ${flota.length} socios dados de alta`} tone="sage" />
        <StatCard label="En línea sin GPS" value={enLineaSinGps.length} sub={`Más de ${GPS_FRESCO_MIN} min sin posición`} tone={enLineaSinGps.length ? 'terracotta' : 'ink'} />
      </div>

      {enApuros.length > 0 && (
        <Card pad={14} style={{ marginBottom: 16, background: colors.dangerSoft, borderColor: colors.danger }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.onDangerSoft, ...type.label, fontWeight: 600 }}>
            <AlertTriangle size={16} />
            {enApuros.length === 1
              ? '1 pedido lleva demasiados intentos o se quedó sin repartidor'
              : `${enApuros.length} pedidos llevan demasiados intentos o se quedaron sin repartidor`}
          </div>
        </Card>
      )}

      <div className="dispatch-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* ── Cola de pedidos ─────────────────────────────────────────────── */}
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ ...ds.tableHeader, borderRadius: 0 }}>
            <span style={{ flex: 1 }}>En vuelo ({pedidos.length})</span>
          </div>
          <div style={{ maxHeight: 540, overflowY: 'auto' }}>
            {cola.map(p => {
              const activo = p.id === pedidoSel
              const socio = socios.find(s => s.id === p.socio_id)
              const huerfano = p.modo_entrega === 'delivery' && !p.socio_id
              return (
                <div
                  key={p.id}
                  onClick={() => { setPedidoSel(p.id); setFicha(p.id) }}
                  style={{
                    padding: '12px 14px',
                    borderBottom: `1px solid ${colors.border}`,
                    cursor: 'pointer',
                    background: activo ? colors.terracottaSoft : 'transparent',
                    borderLeft: `3px solid ${activo ? colors.terracotta2 : huerfano ? colors.danger : 'transparent'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ ...type.mono, fontSize: 13, color: colors.ink }}>{p.codigo}</span>
                    <span style={{ ...type.label, fontWeight: 600 }}>{fmtEUR(p.total)}</span>
                  </div>
                  <div style={{ ...type.label, color: colors.text, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.establecimientos?.nombre || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <EstadoBadge estado={p.estado} />
                    {/* ¿Lo ha aceptado el RESTAURANTE? `aceptado_at` es el sello.
                        Un pedido recién entrado y uno ya aceptado se veían igual,
                        y es justo el hueco por el que se pierden (10 auto-
                        cancelados en 45 días por no aceptar a tiempo). */}
                    {!p.aceptado_at && !['cancelado', 'fallido', 'entregado'].includes(p.estado) && (
                      <Chip tono="danger" title="El restaurante todavía no lo ha aceptado">Sin aceptar</Chip>
                    )}
                    {p.modo_entrega === 'recogida'
                      ? <Chip tono="neutral">Recogida</Chip>
                      : socio
                        ? (
                          // Con repartidor asignado hay dos situaciones muy
                          // distintas: que lo haya aceptado o que siga sin
                          // contestar. Antes las dos se pintaban igual.
                          asignaciones[p.id]?.estado === 'esperando_aceptacion'
                            ? <Chip tono="warning" title={`Ofrecido hace ${hace(asignaciones[p.id].created_at)}, sin respuesta`}>
                                {socio.nombre?.split(' ')[0]}: sin contestar
                              </Chip>
                            : <Chip tono="sage" dot title="Repartidor que ha aceptado el pedido">
                                {socio.nombre?.split(' ')[0]} lo aceptó
                              </Chip>
                        )
                        : <Chip tono="danger">Sin repartidor</Chip>}
                    {(p.intento_asignacion || 0) > 0 && <Chip tono="warning">Intento {p.intento_asignacion}/3</Chip>}
                  </div>
                  <div style={{ ...type.caption, color: colors.stone, marginTop: 6 }}>Entró hace {hace(p.created_at)}</div>

                  {/* Las dos acciones, en el propio pedido */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    <MiniBtn onClick={() => { setPedidoSel(p.id); setFicha(p.id) }} aria-label={`Ver el pedido ${p.codigo}`}>
                      <Eye size={12} /> Ver pedido
                    </MiniBtn>
                    {p.modo_entrega === 'delivery' && !['cancelado', 'fallido', 'entregado'].includes(p.estado) && (
                      <MiniBtn onClick={() => abrirAsignar(p)} aria-label={`Reasignar el pedido ${p.codigo}`}>
                        <RefreshCw size={12} /> {p.socio_id ? 'Reasignar' : 'Asignar'}
                      </MiniBtn>
                    )}
                  </div>
                </div>
              )
            })}
            {pedidos.length === 0 && (
              <Vacio
                titulo={cargando ? 'Cargando…' : 'Nada en vuelo'}
                texto={cargando ? '' : 'Cuando entre un pedido aparecerá aquí solo, sin recargar.'}
              />
            )}
          </div>
        </Card>

        {/* ── Mapa ────────────────────────────────────────────────────────── */}
        <div>
          {!isLoaded ? (
            <div style={{ height: 540, borderRadius: radius.lg, background: colors.elev2, display: 'grid', placeItems: 'center', ...type.body, color: colors.textMute }}>
              Cargando mapa…
            </div>
          ) : (
            <MapaFlota
              socios={flota}
              establecimientos={establecimientos}
              pedido={pedido}
              onSocio={(s) => { if (pedido && pedido.modo_entrega === 'delivery') abrirAsignar(pedido) }}
              onEstablecimiento={() => {}}
            />
          )}
        </div>
      </div>

      {/* ── Flota ─────────────────────────────────────────────────────────── */}
      <h2 style={{ ...ds.h2, marginTop: 28 }}>
        Repartidores {pedido && <span style={{ ...type.body, fontWeight: 400, color: colors.textMute }}>· distancia a {pedido.establecimientos?.nombre}</span>}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {flota.map(f => (
          <Card key={f.id} pad={14} style={{ borderColor: f.disponible ? colors.sage : colors.border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...type.label, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</div>
                <div style={{ ...type.caption, color: colors.stone }}>{f.cuenta?.nombre || 'Sin cuenta de reparto'}</div>
              </div>
              {f.disponible
                ? <Chip tono="sage" dot>Disponible</Chip>
                : f.en_servicio
                  ? <Chip tono="warning" title={`Última posición hace ${hace(f.last_gps_at)}`}>Sin GPS</Chip>
                  : <Chip tono="neutral">Fuera</Chip>}
            </div>

            <div style={{ display: 'flex', gap: 14, ...type.caption, color: colors.stone, marginBottom: 10, flexWrap: 'wrap' }}>
              <span><Navigation size={11} style={{ verticalAlign: -1 }} /> {f.gpsFresco ? `GPS ${hace(f.last_gps_at)}` : 'sin posición'}</span>
              <span>{f.carga} en curso</span>
              {pedido && f.distancia != null && <span style={{ color: colors.onSageSoft, fontWeight: 600 }}><MapPin size={11} style={{ verticalAlign: -1 }} /> {km(f.distancia)}</span>}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {f.telefono && (
                <GhostBtn size="sm" onClick={() => window.open(`tel:${f.telefono}`)} aria-label={`Llamar a ${f.nombre}`}>
                  <Phone size={13} /> Llamar
                </GhostBtn>
              )}
              {pedido && pedido.modo_entrega === 'delivery' && (
                <GlossyBtn size="sm" accent full onClick={() => abrirAsignar(pedido)}>
                  Asignar {pedido.codigo}
                </GlossyBtn>
              )}
            </div>
          </Card>
        ))}
        {flota.length === 0 && !cargando && (
          <Vacio titulo="Ningún socio dado de alta" texto="Los socios aparecen aquí en cuanto completan su alta." />
        )}
      </div>

      {ficha && (
        <PedidoDrawer
          pedido={pedidos.find(p => p.id === ficha) || null}
          onClose={() => setFicha(null)}
          onReasignar={(p) => abrirAsignar(p)}
          onCambiado={cargar}
        />
      )}

      {modalAsignar && (
        <AsignarManualModal
          pedido={modalAsignar.pedido}
          establecimiento={modalAsignar.establecimiento}
          onClose={() => setModalAsignar(null)}
          onAsignado={() => { setModalAsignar(null); cargar() }}
        />
      )}
    </div>
  )
}
