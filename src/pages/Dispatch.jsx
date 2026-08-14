import { useState, useEffect, useMemo, useRef } from 'react'
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF, PolylineF } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, EstadoBadge, GhostBtn, GlossyBtn, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { RefreshCw, MapPin, Phone, Navigation, AlertTriangle } from 'lucide-react'
import AsignarManualModal from '../components/AsignarManualModal'

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

const mapStyle = { width: '100%', height: 540, borderRadius: radius.lg }

const temaClaro = [
  { elementType: 'geometry', stylers: [{ color: '#EFE9DD' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B6356' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#2B2823' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DCE8F0' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E8E1D3' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E8E1D3' }] },
]

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

// Marcador SVG: círculo de color con un glifo dentro
function pin(fondo, borde, glifo) {
  return {
    url: `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"><circle cx="19" cy="19" r="15" fill="${fondo}" stroke="${borde}" stroke-width="3"/><text x="19" y="24" text-anchor="middle" font-size="15">${glifo}</text></svg>`
    )}`,
    scaledSize: window.google ? new window.google.maps.Size(38, 38) : undefined,
  }
}

export default function Dispatch() {
  const [pedidos, setPedidos] = useState([])
  const [socios, setSocios] = useState([])
  const [cuentas, setCuentas] = useState([])          // rider_accounts
  const [establecimientos, setEstablecimientos] = useState([])
  const [pedidoSel, setPedidoSel] = useState(null)     // id del pedido elegido
  const [marcador, setMarcador] = useState(null)       // { tipo, dato } para el InfoWindow
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
    const [pedRes, socRes, cuentasRes, estRes] = await Promise.all([
      supabase.from('pedidos')
        .select('id, codigo, estado, modo_entrega, total, created_at, assigned_at, socio_id, rider_account_id, shipday_status, intento_asignacion, establecimiento_id, direccion_entrega, lat_entrega, lng_entrega, metodo_pago, establecimientos(nombre, latitud, longitud)')
        .in('estado', ESTADOS_EN_VUELO)
        .order('created_at', { ascending: true }),
      supabase.from('socios')
        .select('id, nombre, telefono, en_servicio, activo, latitud_actual, longitud_actual, last_gps_at')
        .eq('activo', true),
      supabase.from('rider_accounts')
        .select('id, nombre, socio_id, activa, estado')
        .eq('activa', true).eq('estado', 'activa'),
      supabase.from('establecimientos')
        .select('id, nombre, latitud, longitud, activo, estado')
        .eq('activo', true),
    ])
    setPedidos(pedRes.data || [])
    setSocios(socRes.data || [])
    setCuentas(cuentasRes.data || [])
    setEstablecimientos(estRes.data || [])
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

  const centro = useMemo(() => {
    const conGps = flota.filter(f => f.gpsFresco)
    if (pedido?.establecimientos?.latitud) return { lat: pedido.establecimientos.latitud, lng: pedido.establecimientos.longitud }
    if (conGps.length) return { lat: conGps[0].latitud_actual, lng: conGps[0].longitud_actual }
    return { lat: 28.4148, lng: -16.5477 } // Puerto de la Cruz
  }, [pedido, flota])

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
                  onClick={() => { setPedidoSel(activo ? null : p.id); setMarcador(null) }}
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
                    {p.modo_entrega === 'recogida'
                      ? <Chip tono="neutral">Recogida</Chip>
                      : socio
                        ? <Chip tono="sage" dot>{socio.nombre?.split(' ')[0]}</Chip>
                        : <Chip tono="danger">Sin repartidor</Chip>}
                    {(p.intento_asignacion || 0) > 0 && <Chip tono="warning">Intento {p.intento_asignacion}/3</Chip>}
                  </div>
                  <div style={{ ...type.caption, color: colors.stone, marginTop: 6 }}>Entró hace {hace(p.created_at)}</div>
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
            <GoogleMap
              mapContainerStyle={mapStyle}
              center={centro}
              zoom={13}
              options={{ styles: temaClaro, disableDefaultUI: true, zoomControl: true }}
              onClick={() => setMarcador(null)}
            >
              {establecimientos.map(e => e.latitud && e.longitud && (
                <MarkerF
                  key={`est-${e.id}`}
                  position={{ lat: e.latitud, lng: e.longitud }}
                  onClick={() => setMarcador({ tipo: 'est', dato: e })}
                  icon={pin('#FFFFFF', pedido?.establecimiento_id === e.id ? '#A8451F' : '#D8CDB8', '🍽️')}
                  zIndex={pedido?.establecimiento_id === e.id ? 3 : 1}
                />
              ))}

              {flota.filter(f => f.latitud_actual && f.longitud_actual && (f.en_servicio || f.gpsFresco)).map(f => (
                <MarkerF
                  key={`soc-${f.id}`}
                  position={{ lat: f.latitud_actual, lng: f.longitud_actual }}
                  onClick={() => setMarcador({ tipo: 'socio', dato: f })}
                  icon={pin(f.disponible ? '#DDE3D3' : '#EFE9DD', f.disponible ? '#6F8460' : '#8A8174', '🛵')}
                  zIndex={f.disponible ? 4 : 2}
                />
              ))}

              {pedido?.lat_entrega && pedido?.lng_entrega && (
                <MarkerF
                  position={{ lat: pedido.lat_entrega, lng: pedido.lng_entrega }}
                  icon={pin('#F1D9CC', '#A8451F', '🏠')}
                  zIndex={5}
                />
              )}

              {/* Restaurante → cliente del pedido elegido */}
              {pedido?.lat_entrega && pedido?.establecimientos?.latitud && (
                <PolylineF
                  path={[
                    { lat: pedido.establecimientos.latitud, lng: pedido.establecimientos.longitud },
                    { lat: pedido.lat_entrega, lng: pedido.lng_entrega },
                  ]}
                  options={{ strokeColor: '#A8451F', strokeOpacity: 0.75, strokeWeight: 3 }}
                />
              )}

              {marcador && (
                <InfoWindowF
                  position={marcador.tipo === 'socio'
                    ? { lat: marcador.dato.latitud_actual, lng: marcador.dato.longitud_actual }
                    : { lat: marcador.dato.latitud, lng: marcador.dato.longitud }}
                  onCloseClick={() => setMarcador(null)}
                  options={{ pixelOffset: new window.google.maps.Size(0, -20) }}
                >
                  <div style={{ fontFamily: type.family, padding: 2, minWidth: 170 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1A1815' }}>{marcador.dato.nombre}</div>
                    {marcador.tipo === 'socio' ? (
                      <>
                        <div style={{ fontSize: 12, color: '#6B6356', marginTop: 2 }}>
                          {marcador.dato.disponible ? 'Disponible' : marcador.dato.en_servicio ? 'En línea, sin GPS reciente' : 'Fuera de servicio'}
                        </div>
                        <div style={{ fontSize: 12, color: '#6B6356' }}>
                          GPS de hace {hace(marcador.dato.last_gps_at)} · {marcador.dato.carga} pedido(s)
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#6B6356', marginTop: 2 }}>Restaurante abierto</div>
                    )}
                  </div>
                </InfoWindowF>
              )}
            </GoogleMap>
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
