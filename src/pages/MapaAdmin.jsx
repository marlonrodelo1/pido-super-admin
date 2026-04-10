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
  const [riders, setRiders] = useState([])
  const [establecimientos, setEstablecimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [map, setMap] = useState(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  })

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    const channel = supabase.channel('admin-riders')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'socios' }, payload => {
        setRiders(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
      })
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(channel) }
  }, [])

  async function loadData() {
    const [ridersRes, estRes] = await Promise.all([
      supabase.from('socios').select('id, nombre, nombre_comercial, latitud_actual, longitud_actual, en_servicio, rating, logo_url').eq('activo', true),
      supabase.from('establecimientos').select('id, nombre, latitud, longitud, tipo, logo_url, rating, total_resenas, activo').eq('activo', true),
    ])
    setRiders(ridersRes.data || [])
    setEstablecimientos(estRes.data || [])
    setLoading(false)
  }

  const onLoad = useCallback(m => setMap(m), [])
  const enServicio = riders.filter(r => r.en_servicio)
  const fuera = riders.filter(r => !r.en_servicio)

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={ds.card}>
          <div style={{ fontSize: 11, ...ds.muted, fontWeight: 600 }}>Riders activos</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#22C55E' }}>{enServicio.length}</div>
        </div>
        <div style={ds.card}>
          <div style={{ fontSize: 11, ...ds.muted, fontWeight: 600 }}>Riders fuera</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>{fuera.length}</div>
        </div>
        <div style={ds.card}>
          <div style={{ fontSize: 11, ...ds.muted, fontWeight: 600 }}>Establecimientos</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#FF6B2C' }}>{establecimientos.length}</div>
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
          onLoad={onLoad}
          options={{ styles: darkTheme, disableDefaultUI: true, zoomControl: true }}
          onClick={() => setSelected(null)}
        >
          {/* Establecimientos */}
          {establecimientos.map(e => (
            e.latitud && e.longitud && (
              <MarkerF
                key={`est-${e.id}`}
                position={{ lat: e.latitud, lng: e.longitud }}
                onClick={() => setSelected({ type: 'est', data: e })}
                icon={{
                  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#1A1A1A" stroke="#FF6B2C" stroke-width="2.5"/><text x="18" y="23" text-anchor="middle" font-size="16">${e.tipo === 'restaurante' ? '🍽️' : '🏪'}</text></svg>`)}`,
                  scaledSize: new window.google.maps.Size(36, 36),
                }}
              />
            )
          ))}

          {/* Riders activos */}
          {enServicio.map(r => (
            r.latitud_actual && r.longitud_actual && (
              <MarkerF
                key={`rider-${r.id}`}
                position={{ lat: r.latitud_actual, lng: r.longitud_actual }}
                onClick={() => setSelected({ type: 'rider', data: r })}
                icon={{
                  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect x="2" y="2" width="36" height="36" rx="10" fill="#22C55E"/><text x="20" y="26" text-anchor="middle" font-size="18">🛵</text></svg>`)}`,
                  scaledSize: new window.google.maps.Size(40, 40),
                }}
              />
            )
          ))}

          {/* InfoWindow */}
          {selected && (
            <InfoWindowF
              position={selected.type === 'est'
                ? { lat: selected.data.latitud, lng: selected.data.longitud }
                : { lat: selected.data.latitud_actual, lng: selected.data.longitud_actual }
              }
              onCloseClick={() => setSelected(null)}
              options={{ pixelOffset: new window.google.maps.Size(0, -20) }}
            >
              <div style={{ fontFamily: "'DM Sans', sans-serif", padding: 4, minWidth: 160 }}>
                {selected.type === 'est' ? (
                  <>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#1A1A1A', marginBottom: 2 }}>{selected.data.nombre}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>★ {selected.data.rating?.toFixed(1)} · {selected.data.total_resenas} reseñas</div>
                    <div style={{ fontSize: 10, color: '#999', marginTop: 2, textTransform: 'capitalize' }}>{selected.data.tipo}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#1A1A1A', marginBottom: 2 }}>🛵 {selected.data.nombre}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{selected.data.nombre_comercial}</div>
                    <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 600, marginTop: 2 }}>● En servicio · ★ {selected.data.rating?.toFixed(1)}</div>
                  </>
                )}
              </div>
            </InfoWindowF>
          )}
        </GoogleMap>
      )}

      {/* Lista de riders */}
      <h2 style={{ ...ds.h2, marginTop: 24 }}>Riders activos</h2>
      {enServicio.length === 0 && (
        <div style={{ ...ds.card, textAlign: 'center', padding: 32, ...ds.muted, fontSize: 13 }}>No hay riders activos en este momento</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {enServicio.map(r => (
          <div key={r.id} style={{ ...ds.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => { if (map && r.latitud_actual) { map.panTo({ lat: r.latitud_actual, lng: r.longitud_actual }); map.setZoom(16); setSelected({ type: 'rider', data: r }) } }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FF5733', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden' }}>
              {r.logo_url ? <img src={r.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🛵'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{r.nombre}</div>
              <div style={{ fontSize: 11, ...ds.muted }}>★ {r.rating?.toFixed(1)} · {r.nombre_comercial}</div>
            </div>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: '#22C55E', boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
