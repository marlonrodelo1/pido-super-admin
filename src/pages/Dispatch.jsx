import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, EstadoBadge, GhostBtn, GlossyBtn, MiniBtn, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { RefreshCw, MapPin, Phone, Navigation, AlertTriangle, Eye } from 'lucide-react'
import AsignarManualModal from '../components/AsignarManualModal'
import MapaFlota from '../components/MapaFlota'
import PedidoDrawer from '../components/PedidoDrawer'
import { useMediaQuery, BP } from '../lib/useMediaQuery'

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

  // A partir de 1500px caben TRES columnas (cola · mapa · repartidores). Por
  // debajo, los repartidores vuelven a su banda de siempre debajo del mapa:
  // con menos de eso, meter una tercera columna dejaría el mapa en 300px.
  //
  // El alto sale de la VENTANA en todo el escritorio, no solo con tres
  // columnas: con los 540px fijos de antes la cola enseñaba 3 pedidos y medio,
  // y en hora punta con veinte pedidos eso es un tubo con scroll. En una
  // ventana de 900px de alto pasa a 650, y en una de 1300 a 900.
  // (el salto a tres columnas lo hace `.dispatch-grid` en index.css con BP.wide)
  const esEscritorio = useMediaQuery(BP.desktop)
  const altoPanel = esEscritorio ? 'min(calc(100vh - 250px), 900px)' : 540
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
        .select('id, codigo, estado, modo_entrega, total, created_at, aceptado_at, assigned_at, socio_id, rider_account_id, shipday_status, intento_asignacion, establecimiento_id, direccion_entrega, lat_entrega, lng_entrega, metodo_pago, establecimientos(nombre, latitud, longitud, delivery_sin_socio)')
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

  // Restaurantes que reparten por su cuenta (Max's Pizza hoy): sus pedidos de
  // delivery NUNCA van a tener socio de Pidoo, así que salían aquí eternamente
  // en rojo, arriba de la cola y con botón "Asignar" — el cliente que menos
  // atención necesita era el que más gritaba.
  //
  // Se filtra la INTERPRETACIÓN, no la consulta: sus pedidos siguen viéndose en
  // la cola, porque si uno se queda sin aceptar eso sí hay que verlo (es donde
  // está el dinero perdido: 10 pedidos y 162,78 € en 45 días). Lo que se quita
  // es tratarlos como una avería del reparto, que no lo son.
  const repartoPropio = (p) => p?.establecimientos?.delivery_sin_socio === true

  const sinAsignar = pedidos.filter(p => p.modo_entrega === 'delivery' && !p.socio_id && !repartoPropio(p))
  const enApuros = pedidos.filter(p => !repartoPropio(p) && (p.shipday_status === 'no_rider' || (p.intento_asignacion || 0) >= 2))
  const disponibles = flota.filter(f => f.disponible)
  const enLineaSinGps = flota.filter(f => f.en_servicio && !f.gpsFresco)

  // La lista se parte en dos por `en_servicio`, que es el interruptor que toca
  // el socio. Dentro de "En línea" siguen conviviendo DOS estados y por eso el
  // badge no desaparece: en servicio sin GPS fresco NO recibe pedidos (el
  // dispatcher lo descarta), así que fundirlo con "Disponible" mentiría.
  const enLinea = flota.filter(f => f.en_servicio)
  const fueraServicio = flota.filter(f => !f.en_servicio)

  // Cola: primero lo que necesita mano, después por antigüedad. El reparto propio
  // va al fondo (4): sigue estando, pero no compite con lo que sí hay que resolver.
  const cola = useMemo(() => {
    const urgencia = (p) =>
      repartoPropio(p) ? 4
        : p.shipday_status === 'no_rider' ? 0
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

      {/* `.ds-cards` (index.css): en móvil dos columnas, en escritorio la
          tarjeta se queda en ~260px en vez de estirarse a 377 */}
      <div className="ds-cards" style={{ marginBottom: 20 }}>
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

      {/* La rejilla la define `.dispatch-grid` en index.css: 2 columnas hasta
          1500px y 3 a partir de ahí. No puede ir inline porque un estilo inline
          gana a la media query. */}
      <div className="dispatch-grid">

        {/* ── Cola de pedidos ─────────────────────────────────────────────── */}
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ ...ds.tableHeader, borderRadius: 0 }}>
            <span style={{ flex: 1 }}>En vuelo ({pedidos.length})</span>
          </div>
          <div style={{ maxHeight: altoPanel, overflowY: 'auto' }}>
            {cola.map(p => {
              const activo = p.id === pedidoSel
              const socio = socios.find(s => s.id === p.socio_id)
              // Un pedido de reparto propio no es huérfano: no le falta un socio,
              // es que no lleva. Sin esto se pintaba con la franja roja de avería.
              const huerfano = p.modo_entrega === 'delivery' && !p.socio_id && !repartoPropio(p)
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
                      : repartoPropio(p)
                      ? <Chip tono="neutral" title="Este restaurante reparte por su cuenta: Pidoo no le busca repartidor">
                          Reparto propio
                        </Chip>
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
                    {/* Sin botón de asignar en reparto propio: ofrecerlo era una
                        trampa. El modal manda `forzar: true` al no encontrar
                        socios vinculados, y desde el 15 ago el candado PD220
                        rechaza asignar un socio de Pidoo a un pedido al 0 %. */}
                    {p.modo_entrega === 'delivery' && !repartoPropio(p) && !['cancelado', 'fallido', 'entregado'].includes(p.estado) && (
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
            <div style={{ height: altoPanel, borderRadius: radius.lg, background: colors.elev2, display: 'grid', placeItems: 'center', ...type.body, color: colors.textMute }}>
              Cargando mapa…
            </div>
          ) : (
            <MapaFlota
              socios={flota}
              establecimientos={establecimientos}
              pedido={pedido}
              onSocio={(s) => { if (pedido && pedido.modo_entrega === 'delivery') abrirAsignar(pedido) }}
              onEstablecimiento={() => {}}
              altura={altoPanel}
            />
          )}
        </div>

        {/* ── Flota ───────────────────────────────────────────────────────── */}
        {/* Tercera columna a partir de 1500px. Por debajo, `.dispatch-flota-col`
            la manda a una fila propia a todo lo ancho, que es como estaba.
            El motivo de moverla: ocupaba una banda entera debajo del mapa y
            dejaba la cola de pedidos en 340×540 — un tubo en cuanto entran
            veinte pedidos. Ahora la cola se estira a lo alto de la ventana. */}
        <div className="dispatch-flota-col">
          <Card pad={0} style={{ overflow: 'hidden' }}>
            <div style={{ ...ds.tableHeader, borderRadius: 0 }}>
              <span style={{ flex: 1 }}>
                Repartidores ({flota.length})
                {pedido && (
                  <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                    {' · distancia a '}{pedido.establecimientos?.nombre}
                  </span>
                )}
              </span>
            </div>
            <div className="dispatch-flota" style={{ maxHeight: altoPanel, overflowY: 'auto', padding: 12 }}>
              {/* Dos grupos, no una lista corrida de diez. Con nueve de diez
                  socios fuera de servicio, el único que puede coger el pedido
                  se perdía entre los que no. El separador ocupa la fila entera
                  (`.dispatch-flota-sep`) para que no se cuele como una tarjeta
                  más cuando la lista va en varias columnas. */}
              {[
                { clave: 'linea', titulo: 'En línea', socios: enLinea },
                { clave: 'fuera', titulo: 'Fuera de servicio', socios: fueraServicio },
              ].filter(g => g.socios.length > 0).map(g => (
                <Fragment key={g.clave}>
                  <div className="dispatch-flota-sep">
                    <span>{g.titulo}</span>
                    <span style={{ color: colors.stone, fontWeight: 700 }}>{g.socios.length}</span>
                  </div>
                  {g.socios.map(f => (
                    <FichaSocio
                      key={f.id}
                      f={f}
                      pedido={pedido}
                      onAsignar={() => abrirAsignar(pedido)}
                    />
                  ))}
                </Fragment>
              ))}
              {flota.length === 0 && !cargando && (
                <Vacio titulo="Ningún socio dado de alta" texto="Los socios aparecen aquí en cuanto completan su alta." />
              )}
            </div>
          </Card>
        </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Ficha compacta del repartidor: dos líneas en vez de cuatro (de ~120px de alto
// a ~62). La cuenta de reparto, el GPS y la carga viven en UNA línea de datos, y
// "Llamar" es un icono al final de esa misma línea. El botón de asignar solo
// aparece cuando hay un pedido elegido, que es cuando sirve.
//
// ─────────────────────────────────────────────────────────────────────────────
function FichaSocio({ f, pedido, onAsignar }) {
  return (
    <Card pad={10} style={{ borderRadius: 12, borderColor: f.disponible ? colors.sage : colors.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          title={f.nombre}
          style={{ ...type.label, fontWeight: 600, color: colors.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >{f.nombre}</div>
        {f.disponible
          ? <Chip tono="sage" dot style={{ fontSize: 11, padding: '2px 7px' }}>Disponible</Chip>
          : f.en_servicio
            ? <Chip tono="warning" title={`Última posición hace ${hace(f.last_gps_at)}`} style={{ fontSize: 11, padding: '2px 7px' }}>Sin GPS</Chip>
            : <Chip tono="neutral" style={{ fontSize: 11, padding: '2px 7px' }}>Fuera</Chip>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
        {/* Medido: con la línea entera en una sola fila de 208px, 7 de 10 fichas
            se cortaban con puntos suspensivos. Y lo que se cortaba era siempre lo
            mismo: "sin posición · 0 en curso" de los que están fuera de servicio,
            que no aporta nada — si no está en servicio, ni manda GPS ni recibe
            pedidos, y eso ya lo dice el badge. Así que a los de fuera solo se les
            pinta la cuenta de reparto, y la línea cabe entera.
            La excepción es la que importa: alguien fuera de servicio CON pedidos
            todavía encima. Eso no se calla nunca. */}
        <div style={{ ...type.caption, color: colors.stone, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.cuenta?.nombre || 'Sin cuenta'}
          {f.en_servicio && (
            <>
              {' · '}
              <Navigation size={10} style={{ verticalAlign: -1 }} /> {f.gpsFresco ? hace(f.last_gps_at) : 'sin posición'}
              {' · '}{f.carga} en curso
            </>
          )}
          {!f.en_servicio && f.carga > 0 && (
            <span style={{ color: colors.onWarningSoft, fontWeight: 700 }}>{' · '}{f.carga} en curso</span>
          )}
          {pedido && f.distancia != null && (
            <span style={{ color: colors.onSageSoft, fontWeight: 700 }}>{' · '}<MapPin size={10} style={{ verticalAlign: -1 }} /> {km(f.distancia)}</span>
          )}
        </div>
        {f.telefono && (
          <button
            onClick={() => window.open(`tel:${f.telefono}`)}
            title={`Llamar a ${f.nombre} · ${f.telefono}`}
            aria-label={`Llamar a ${f.nombre}`}
            style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              border: `1px solid ${colors.border}`,
              background: colors.paper, color: colors.stone, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = colors.terracotta2 }}
            onMouseLeave={e => { e.currentTarget.style.color = colors.stone }}
          >
            <Phone size={12} />
          </button>
        )}
      </div>

      {pedido && pedido.modo_entrega === 'delivery' && (
        <GlossyBtn size="sm" accent full onClick={onAsignar} style={{ marginTop: 8, height: 30 }}>
          Asignar {pedido.codigo}
        </GlossyBtn>
      )}
    </Card>
  )
}
