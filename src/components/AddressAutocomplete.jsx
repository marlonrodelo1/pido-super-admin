import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { ds } from '../lib/darkStyles'

/**
 * AddressAutocomplete
 * Autocomplete de direcciones con Google Places (AutocompleteService + PlacesService).
 * Carga el script JS de Google Maps una sola vez (singleton compartido entre instancias
 * y compatible con @react-google-maps/api que pueda haberlo cargado ya).
 *
 * Props:
 *  - value (string)            texto del input
 *  - onChange(value)           cambios mientras escribe
 *  - onSelect(payload)         al elegir sugerencia: { direccion, latitud, longitud, place_id, ciudad, provincia }
 *  - placeholder (string)
 *  - country (string)          ISO2, default 'es'
 *  - bias ({lat,lng})          sesgo geográfico (default Tenerife)
 *  - style (object)            estilos extra del input
 */

const DEFAULT_BIAS = { lat: 28.4682, lng: -16.2546 } // Tenerife
const SCRIPT_ID = 'google-maps-places-loader'

// Loader singleton: reusa window.google si ya existe.
let loadPromise = null
function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.google?.maps?.places) return Promise.resolve(window.google)
  if (loadPromise) return loadPromise

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'))
  }

  loadPromise = new Promise((resolve, reject) => {
    // Si @react-google-maps/api ya inyectó el script, esperar a que termine.
    const existing = document.getElementById(SCRIPT_ID) || document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')
    if (existing) {
      const check = () => {
        if (window.google?.maps?.places) resolve(window.google)
        else setTimeout(check, 80)
      }
      check()
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es&region=ES`
    script.onload = () => {
      if (window.google?.maps?.places) resolve(window.google)
      else reject(new Error('Google Maps cargado pero places no disponible'))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error('No se pudo cargar Google Maps'))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}

function extractCity(components = []) {
  const byType = (t) => components.find(c => c.types?.includes(t))
  const locality = byType('locality') || byType('postal_town') || byType('administrative_area_level_3')
  return locality?.long_name || null
}
function extractProvince(components = []) {
  const byType = (t) => components.find(c => c.types?.includes(t))
  const prov = byType('administrative_area_level_2') || byType('administrative_area_level_1')
  return prov?.long_name || null
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Empieza a escribir la dirección…',
  country = 'es',
  bias = DEFAULT_BIAS,
  style,
}) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(-1)

  const acServiceRef = useRef(null)
  const placesServiceRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const debounceRef = useRef(null)
  const placesAttachRef = useRef(null) // div invisible para PlacesService
  const wrapperRef = useRef(null)

  // Cargar Google Maps
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then((google) => {
        if (cancelled) return
        acServiceRef.current = new google.maps.places.AutocompleteService()
        // PlacesService necesita un nodo DOM
        if (placesAttachRef.current) {
          placesServiceRef.current = new google.maps.places.PlacesService(placesAttachRef.current)
        }
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [])

  // Cierra el dropdown al hacer click fuera
  useEffect(() => {
    function onDocClick(e) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const fetchPredictions = useCallback((input) => {
    if (!acServiceRef.current || !window.google?.maps) return
    if (!input || input.trim().length < 3) {
      setPredictions([])
      setOpen(false)
      return
    }
    setLoading(true)
    const request = {
      input,
      sessionToken: sessionTokenRef.current,
      componentRestrictions: country ? { country } : undefined,
      language: 'es',
    }
    if (bias && bias.lat && bias.lng) {
      try {
        request.locationBias = new window.google.maps.LatLng(bias.lat, bias.lng)
      } catch (_) { /* ignore */ }
    }
    acServiceRef.current.getPlacePredictions(request, (preds, status) => {
      setLoading(false)
      const okStatus = window.google.maps.places.PlacesServiceStatus
      if (status === okStatus.OK && preds?.length) {
        setPredictions(preds.slice(0, 5))
        setOpen(true)
        setHighlight(-1)
      } else {
        setPredictions([])
        setOpen(status === okStatus.ZERO_RESULTS) // mostrar vacío para indicar "sin resultados"
      }
    })
  }, [country, bias])

  function handleInputChange(e) {
    const v = e.target.value
    onChange?.(v)
    if (!ready) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchPredictions(v), 200)
  }

  function handleSelect(pred) {
    if (!placesServiceRef.current || !window.google?.maps) return
    setOpen(false)
    setLoading(true)
    placesServiceRef.current.getDetails({
      placeId: pred.place_id,
      fields: ['geometry', 'formatted_address', 'address_components', 'name'],
      sessionToken: sessionTokenRef.current,
    }, (place, status) => {
      setLoading(false)
      const okStatus = window.google.maps.places.PlacesServiceStatus
      if (status !== okStatus.OK || !place?.geometry?.location) {
        return
      }
      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()
      const direccion = place.formatted_address || pred.description
      const components = place.address_components || []
      const payload = {
        direccion,
        latitud: lat,
        longitud: lng,
        place_id: pred.place_id,
        ciudad: extractCity(components),
        provincia: extractProvince(components),
      }
      onChange?.(direccion)
      onSelect?.(payload)
      // Renovar session token (cada selección cierra una sesión de cobro)
      try {
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
      } catch (_) { /* ignore */ }
    })
  }

  function handleKeyDown(e) {
    if (!open || predictions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, predictions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && predictions[highlight]) {
        e.preventDefault()
        handleSelect(predictions[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const inputStyle = {
    ...ds.formInput,
    paddingLeft: 36,
    paddingRight: loading ? 36 : 12,
    minHeight: 44,
    ...(style || {}),
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Nodo invisible para PlacesService */}
      <div ref={placesAttachRef} style={{ display: 'none' }} />

      <div style={{ position: 'relative' }}>
        <MapPin
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--c-muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={handleInputChange}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={failed ? 'Dirección (autocomplete no disponible)' : placeholder}
          style={inputStyle}
          autoComplete="off"
        />
        {loading && (
          <Loader2
            size={14}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--c-muted)',
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
      </div>

      {open && predictions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 1000,
            overflow: 'hidden',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {predictions.map((p, i) => {
            const main = p.structured_formatting?.main_text || p.description
            const secondary = p.structured_formatting?.secondary_text || ''
            const isHi = i === highlight
            return (
              <button
                key={p.place_id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => handleSelect(p)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  width: '100%',
                  padding: '12px 14px',
                  minHeight: 56,
                  background: isHi ? 'rgba(255,107,44,0.08)' : 'transparent',
                  border: 'none',
                  borderBottom: i < predictions.length - 1 ? '1px solid var(--c-border)' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <MapPin size={14} style={{ color: '#FF6B2C', marginTop: 3, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {main}
                  </div>
                  {secondary && (
                    <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {secondary}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {open && !loading && predictions.length === 0 && (value || '').trim().length >= 3 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            padding: '12px 14px',
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border-strong)',
            borderRadius: 10,
            fontSize: 12.5,
            color: 'var(--c-muted)',
            zIndex: 1000,
          }}
        >
          Sin resultados
        </div>
      )}

      <style>{`@keyframes spin { from{transform:translateY(-50%) rotate(0)} to{transform:translateY(-50%) rotate(360deg)} }`}</style>
    </div>
  )
}
