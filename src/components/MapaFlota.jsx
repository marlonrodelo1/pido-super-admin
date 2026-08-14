import { useRef, useMemo, useState, useCallback } from 'react'
import { GoogleMap, OverlayViewF, OverlayView, PolylineF } from '@react-google-maps/api'
import { colors, type, radius } from '../lib/darkStyles'
import { Plus, Minus, Maximize2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// El mapa de Dispatch.
//
// Antes cada punto era un círculo SVG con un emoji dentro, y con seis motos
// iguales en pantalla no había forma de saber cuál era cuál. Ahora cada
// marcador lleva el logo y el nombre.
//
// ⚠️ El icono de un `Marker` es una IMAGEN: no puede cargar el logo del socio
// desde un data-URI SVG (las referencias externas dentro de un SVG en data:
// están bloqueadas). Por eso los marcadores son `OverlayViewF`, que pinta HTML
// de verdad encima del mapa y sí puede llevar un <img>.
// ─────────────────────────────────────────────────────────────────────────────

const TEMA = [
  { elementType: 'geometry', stylers: [{ color: '#EFE9DD' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B6356' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#2B2823' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DCE8F0' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E8E1D3' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#E8E1D3' }] },
]

const centrar = (w, h) => ({ x: -(w / 2), y: -(h / 2) })

function iniciales(nombre) {
  const partes = (nombre || '?').trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase()
}

const recortar = (t, n) => (!t ? '' : t.length > n ? t.slice(0, n - 1) + '…' : t)

// Avatar circular con logo; si no hay logo o la imagen falla, iniciales.
function Avatar({ url, nombre, tam, anillo }) {
  const [roto, setRoto] = useState(false)
  const comun = {
    width: tam, height: tam, borderRadius: '50%',
    border: `3px solid ${anillo}`,
    boxShadow: '0 2px 8px rgba(26,24,21,0.28)',
    display: 'grid', placeItems: 'center',
    overflow: 'hidden', background: colors.paper,
    boxSizing: 'border-box',
  }
  if (!url || roto) {
    return (
      <div style={{ ...comun, background: colors.terracotta2 }}>
        <span style={{ ...type.caption, letterSpacing: 0, fontWeight: 700, color: colors.cream, fontSize: tam < 38 ? 11 : 13 }}>
          {iniciales(nombre)}
        </span>
      </div>
    )
  }
  return (
    <div style={comun}>
      <img
        src={url}
        alt=""
        onError={() => setRoto(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  )
}

function Etiqueta({ children, fuerte }) {
  return (
    <div style={{
      marginTop: 3,
      padding: '2px 7px',
      borderRadius: radius.full,
      background: colors.paper,
      border: `1px solid ${colors.border}`,
      boxShadow: '0 1px 4px rgba(26,24,21,0.18)',
      ...type.caption,
      letterSpacing: 0,
      fontWeight: fuerte ? 700 : 600,
      color: colors.text,
      whiteSpace: 'nowrap',
      maxWidth: 150,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {children}
    </div>
  )
}

const botonMapa = {
  width: 34, height: 34, borderRadius: 9,
  display: 'grid', placeItems: 'center',
  background: colors.paper,
  border: `1px solid ${colors.borderStrong}`,
  color: colors.text,
  boxShadow: '0 2px 8px rgba(26,24,21,0.18)',
  cursor: 'pointer',
}

export default function MapaFlota({
  socios = [],
  establecimientos = [],
  pedido = null,
  onSocio,
  onEstablecimiento,
  altura = 540,
}) {
  const mapa = useRef(null)

  const contenedor = useMemo(() => ({ width: '100%', height: altura, borderRadius: radius.lg }), [altura])

  const opciones = useMemo(() => ({
    styles: TEMA,
    disableDefaultUI: true,
    zoomControl: false,          // los ponemos nosotros, con el estilo del panel
    // Sin esto, en un mapa que NO ocupa toda la página Google exige Ctrl+rueda
    // para hacer zoom. Es exactamente el "no puedo acercar" que se reportó.
    gestureHandling: 'greedy',
    clickableIcons: false,
  }), [])

  const centro = useMemo(() => {
    if (pedido?.establecimientos?.latitud) {
      return { lat: pedido.establecimientos.latitud, lng: pedido.establecimientos.longitud }
    }
    const conGps = socios.find(s => s.gpsFresco && s.latitud_actual != null)
    if (conGps) return { lat: conGps.latitud_actual, lng: conGps.longitud_actual }
    return { lat: 28.4148, lng: -16.5477 } // Puerto de la Cruz
  }, [pedido, socios])

  const encajar = useCallback(() => {
    const m = mapa.current
    if (!m || !window.google) return
    const b = new window.google.maps.LatLngBounds()
    let n = 0
    for (const s of socios) {
      if (s.latitud_actual != null && s.longitud_actual != null && (s.en_servicio || s.gpsFresco)) {
        b.extend({ lat: s.latitud_actual, lng: s.longitud_actual }); n++
      }
    }
    for (const e of establecimientos) {
      if (e.latitud != null && e.longitud != null) { b.extend({ lat: e.latitud, lng: e.longitud }); n++ }
    }
    if (pedido?.lat_entrega != null) { b.extend({ lat: pedido.lat_entrega, lng: pedido.lng_entrega }); n++ }
    if (n === 0) return
    m.fitBounds(b, 60)
    // Con un solo punto fitBounds se va a zoom 21 y se ve el tejado de la casa.
    if (n === 1) window.google.maps.event.addListenerOnce(m, 'idle', () => {
      if (m.getZoom() > 15) m.setZoom(15)
    })
  }, [socios, establecimientos, pedido])

  const zoom = (delta) => {
    const m = mapa.current
    if (m) m.setZoom((m.getZoom() || 13) + delta)
  }

  // Solo llegan aquí socios en servicio, así que son dos estados: puede recibir pedidos
  // (verde) o está en servicio pero con la posición caducada y el dispatcher no le puede
  // asignar nada (ámbar).
  const anilloSocio = (s) => (s.disponible ? colors.sage : colors.warning)

  return (
    <div style={{ position: 'relative' }}>
      <GoogleMap
        mapContainerStyle={contenedor}
        center={centro}
        zoom={13}
        options={opciones}
        onLoad={(m) => { mapa.current = m }}
        onUnmount={() => { mapa.current = null }}
      >
        {/* Restaurantes */}
        {establecimientos.map(e => (e.latitud != null && e.longitud != null) && (
          <OverlayViewF
            key={`est-${e.id}`}
            position={{ lat: e.latitud, lng: e.longitud }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={centrar}
          >
            <div
              onClick={() => onEstablecimiento?.(e)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
            >
              <Avatar
                url={e.logo_url}
                nombre={e.nombre}
                tam={34}
                anillo={pedido?.establecimiento_id === e.id ? colors.terracotta2 : colors.borderStrong}
              />
              <Etiqueta fuerte={pedido?.establecimiento_id === e.id}>{recortar(e.nombre, 18)}</Etiqueta>
            </div>
          </OverlayViewF>
        ))}

        {/* Repartidores EN SERVICIO. Nadie más.
            ⚠️ Antes el filtro era `(s.en_servicio || s.gpsFresco)`, y ese OR es lo que hacía
            que un socio que acababa de quitarse siguiera saliendo en el mapa hasta 12 minutos
            (los que tarda su última posición en caducar). Se reportó justo así: "me quité de
            en línea y sigo saliendo con mi foto".
            La posición de alguien que se ha quitado es una posición VIEJA — ya no manda GPS —,
            así que pintarla invita a contar con alguien que no está. Quien no está en
            servicio desaparece del mapa; en la lista de abajo sigue apareciendo como "Fuera",
            que es donde tiene sentido verlo. */}
        {socios.filter(s => s.latitud_actual != null && s.longitud_actual != null && s.en_servicio).map(s => (
          <OverlayViewF
            key={`soc-${s.id}`}
            position={{ lat: s.latitud_actual, lng: s.longitud_actual }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={centrar}
          >
            <div
              onClick={() => onSocio?.(s)}
              title={s.disponible ? 'Disponible' : s.en_servicio ? 'En servicio, sin posición reciente' : 'Fuera de servicio'}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
            >
              <Avatar url={s.logo_url} nombre={s.nombre} tam={40} anillo={anilloSocio(s)} />
              <Etiqueta fuerte>
                {recortar((s.nombre || '').split(' ')[0], 14)}
                {s.carga > 0 && <span style={{ color: colors.onTerracottaSoft }}> · {s.carga}</span>}
              </Etiqueta>
            </div>
          </OverlayViewF>
        ))}

        {/* Cliente del pedido seleccionado */}
        {pedido?.lat_entrega != null && pedido?.lng_entrega != null && (
          <OverlayViewF
            position={{ lat: pedido.lat_entrega, lng: pedido.lng_entrega }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            getPixelPositionOffset={centrar}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: colors.terracottaSoft,
                border: `3px solid ${colors.terracotta2}`,
                boxShadow: '0 2px 8px rgba(26,24,21,0.28)',
                boxSizing: 'border-box',
              }} />
              <Etiqueta>Entrega</Etiqueta>
            </div>
          </OverlayViewF>
        )}

        {/* Recorrido restaurante → cliente */}
        {pedido?.lat_entrega != null && pedido?.establecimientos?.latitud != null && (
          <PolylineF
            path={[
              { lat: pedido.establecimientos.latitud, lng: pedido.establecimientos.longitud },
              { lat: pedido.lat_entrega, lng: pedido.lng_entrega },
            ]}
            options={{ strokeColor: colors.terracotta2, strokeOpacity: 0.75, strokeWeight: 3 }}
          />
        )}
      </GoogleMap>

      {/* Controles propios */}
      <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={encajar} title="Encajar todo" aria-label="Encajar todo en el mapa" style={botonMapa}>
          <Maximize2 size={15} />
        </button>
        <button onClick={() => zoom(1)} title="Acercar" aria-label="Acercar" style={botonMapa}>
          <Plus size={16} />
        </button>
        <button onClick={() => zoom(-1)} title="Alejar" aria-label="Alejar" style={botonMapa}>
          <Minus size={16} />
        </button>
      </div>

      {/* Leyenda */}
      <div style={{
        position: 'absolute', left: 12, bottom: 12,
        display: 'flex', gap: 10, flexWrap: 'wrap',
        padding: '6px 10px', borderRadius: radius.full,
        background: colors.paper, border: `1px solid ${colors.border}`,
        boxShadow: '0 1px 6px rgba(26,24,21,0.16)',
        ...type.caption, letterSpacing: 0, color: colors.stone,
      }}>
        {/* "Fuera" ya no está: quien no está en servicio no se pinta en el mapa */}
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors.sage, marginRight: 5 }} />Disponible</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors.warning, marginRight: 5 }} />En servicio, sin GPS</span>
        <span style={{ color: colors.stone2 }}>Los que están fuera no salen en el mapa</span>
      </div>
    </div>
  )
}
