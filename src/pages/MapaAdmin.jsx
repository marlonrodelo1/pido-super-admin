import { useState, useEffect, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { RefreshCw } from 'lucide-react'

const mapStyle = { width: '100%', height: 500, borderRadius: 16 }

const darkTheme = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#252525' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
]

export default function MapaAdmin() {
  const [establecimientos, setEstablecimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data } = await supabase.from('establecimientos').select('id, nombre, latitud, longitud, tipo, logo_url, rating, total_resenas, activo').eq('activo', true)
    setEstablecimientos(data || [])
    setLoading(false)
  }

  // Centro: Puerto de la Cruz
  const center = { lat: 28.4148, lng: -16.5477 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Mapa en vivo</h1>
        <button onClick={loadData} style={{ ...ds.secondaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={ds.card}>
          <div style={{ fontSize: 11, ...ds.muted, fontWeight: 600 }}>Establecimientos activos</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#FF6B2C' }}>{establecimientos.length}</div>
        </div>
        <div style={ds.card}>
          <div style={{ fontSize: 11, ...ds.muted, fontWeight: 600 }}>Riders</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.4)', paddingTop: 6 }}>Gestionados vía Shipday</div>
        </div>
      </div>

      {/* Google Maps */}
      {!isLoaded ? (
        <div style={{ height: 500, borderRadius: 16, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Cargando mapa...</span>
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={mapStyle}
          center={center}
          zoom={14}
          options={{ styles: darkTheme, disableDefaultUI: true, zoomControl: true }}
          onClick={() => setSelected(null)}
        >
          {/* Establecimientos */}
          {establecimientos.map(e => (
            e.latitud && e.longitud && (
              <MarkerF
                key={`est-${e.id}`}
                position={{ lat: e.latitud, lng: e.longitud }}
                onClick={() => setSelected(e)}
                icon={{
                  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#1A1A1A" stroke="#FF6B2C" stroke-width="2.5"/><text x="18" y="23" text-anchor="middle" font-size="16">${e.tipo === 'restaurante' ? '🍽️' : '🏪'}</text></svg>`)}`,
                  scaledSize: new window.google.maps.Size(36, 36),
                }}
              />
            )
          ))}

          {/* InfoWindow */}
          {selected && selected.latitud && (
            <InfoWindowF
              position={{ lat: selected.latitud, lng: selected.longitud }}
              onCloseClick={() => setSelected(null)}
              options={{ pixelOffset: new window.google.maps.Size(0, -20) }}
            >
              <div style={{ fontFamily: "'DM Sans', sans-serif", padding: 4, minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#1A1A1A', marginBottom: 2 }}>{selected.nombre}</div>
                <div style={{ fontSize: 11, color: '#666' }}>★ {selected.rating?.toFixed(1)} · {selected.total_resenas} reseñas</div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 2, textTransform: 'capitalize' }}>{selected.tipo}</div>
              </div>
            </InfoWindowF>
          )}
        </GoogleMap>
      )}
    </div>
  )
}
