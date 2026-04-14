import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Eye, EyeOff, Truck, Save, UserCheck, UserX } from 'lucide-react'
import { toast } from '../App'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update_socio_admin`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function initShipStatus(key) {
  if (!key || key.trim() === '') return 'not_set'
  return 'unchecked'
}

const SHIP_BADGE = {
  unchecked: { label: '○ Sin verificar',  bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B' },
  valid:     { label: '✓ Conectado',       bg: 'rgba(22,163,74,0.15)',   color: '#16A34A' },
  invalid:   { label: '✗ Key inválida',    bg: 'rgba(239,68,68,0.15)',   color: '#EF4444' },
  not_set:   { label: '⚠ Sin configurar',  bg: 'rgba(107,114,128,0.15)', color: '#6B7280' },
}

export default function Socios() {
  const [items, setItems]         = useState([])
  const [buscar, setBuscar]       = useState('')
  const [detalle, setDetalle]     = useState(null)
  const [apiKey, setApiKey]       = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [shipStatus, setShipStatus] = useState('not_set')
  const [verifying, setVerifying]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [toggling, setToggling]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('socios')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast('Error cargando socios', 'error')
    setItems(data || [])
  }

  function verDetalle(socio) {
    setDetalle(socio)
    setApiKey(socio.shipday_api_key || '')
    setKeyVisible(false)
    setShipStatus(initShipStatus(socio.shipday_api_key))
  }

  function volverLista() {
    setDetalle(null)
    setApiKey('')
    setKeyVisible(false)
    setShipStatus('not_set')
  }

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': ANON_KEY,
    }
  }

  async function toggleActivo() {
    setToggling(true)
    const nuevoEstado = !detalle.activo
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'toggle_activo', socio_id: detalle.id, activo: nuevoEstado }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast(data.error || 'Error al cambiar estado', 'error')
        return
      }
      const updated = { ...detalle, activo: nuevoEstado }
      setDetalle(updated)
      setItems(prev => prev.map(s => s.id === detalle.id ? updated : s))
      toast(nuevoEstado ? 'Socio activado — ya puede entrar a rider.pidoo.es' : 'Socio desactivado')
    } catch {
      toast('Error de conexión', 'error')
    } finally {
      setToggling(false)
    }
  }

  async function verificarKey() {
    if (!apiKey.trim()) {
      toast('Introduce una API key antes de verificar', 'error')
      return
    }
    setVerifying(true)
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'verify', shipday_api_key: apiKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error || 'Error al verificar', 'error')
        setShipStatus('invalid')
        return
      }
      setShipStatus(data.valid ? 'valid' : 'invalid')
      toast(
        data.valid ? 'Key válida — Shipday conectado' : 'Key inválida',
        data.valid ? 'success' : 'error',
      )
    } catch {
      toast('Error de conexión al verificar', 'error')
      setShipStatus('invalid')
    } finally {
      setVerifying(false)
    }
  }

  async function guardarKey() {
    setSaving(true)
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'update', socio_id: detalle.id, shipday_api_key: apiKey }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast(data.error || 'Error al guardar', 'error')
        return
      }
      const updated = { ...detalle, shipday_api_key: apiKey.trim() || null }
      setDetalle(updated)
      setItems(prev => prev.map(s => s.id === detalle.id ? updated : s))
      setShipStatus(initShipStatus(apiKey))
      toast('API key guardada correctamente')
    } catch {
      toast('Error de conexión al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtrados = items.filter(s => {
    if (!buscar) return true
    const q = buscar.toLowerCase()
    return (
      (s.nombre || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    )
  })

  // ── DETALLE ────────────────────────────────────────────────────────────────
  if (detalle) {
    const badge = SHIP_BADGE[shipStatus] || SHIP_BADGE.not_set
    const initials = (detalle.nombre || 'S')[0].toUpperCase()

    return (
      <div>
        <button onClick={volverLista} style={ds.backBtn}>← Volver</button>

        {/* Header card */}
        <div style={ds.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(255,107,44,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, color: '#FF6B2C', overflow: 'hidden', flexShrink: 0,
            }}>
              {detalle.logo_url
                ? <img src={detalle.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5', margin: 0 }}>{detalle.nombre}</h2>
              {detalle.nombre_comercial && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{detalle.nombre_comercial}</div>
              )}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{detalle.email}</div>
            </div>
            <button
              onClick={toggleActivo}
              disabled={toggling}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 10, border: 'none',
                background: detalle.activo ? 'rgba(239,68,68,0.15)' : 'rgba(22,163,74,0.15)',
                color: detalle.activo ? '#EF4444' : '#16A34A',
                fontSize: 13, fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer',
                opacity: toggling ? 0.6 : 1, fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {detalle.activo ? <UserX size={15} /> : <UserCheck size={15} />}
              {toggling ? 'Guardando...' : detalle.activo ? 'Desactivar' : 'Activar socio'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: '#F5F5F5' }}>
            <div><span style={ds.muted}>Slug: </span>{detalle.slug || '—'}</div>
            <div><span style={ds.muted}>Teléfono: </span>{detalle.telefono || '—'}</div>
            <div><span style={ds.muted}>Tarifa base: </span>{detalle.tarifa_base != null ? `${detalle.tarifa_base} €` : '—'}</div>
            <div><span style={ds.muted}>Radio: </span>{detalle.radio_km != null ? `${detalle.radio_km} km` : '—'}</div>
            <div><span style={ds.muted}>Modo entrega: </span>{detalle.modo_entrega || '—'}</div>
            <div><span style={ds.muted}>Rating: </span>{detalle.rating != null ? `${detalle.rating} ★ (${detalle.total_resenas || 0})` : '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={ds.muted}>Estado: </span>
              <span style={{ ...ds.badge, background: detalle.activo ? 'rgba(22,163,74,0.15)' : 'rgba(107,114,128,0.15)', color: detalle.activo ? '#16A34A' : '#6B7280' }}>
                {detalle.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={ds.muted}>En servicio: </span>
              <span style={{ ...ds.badge, background: detalle.en_servicio ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)', color: detalle.en_servicio ? '#3B82F6' : '#6B7280' }}>
                {detalle.en_servicio ? 'Sí' : 'No'}
              </span>
            </div>
            <div><span style={ds.muted}>Registrado: </span>{new Date(detalle.created_at).toLocaleDateString('es-ES')}</div>
          </div>
        </div>

        {/* Shipday card */}
        <div style={{ ...ds.card, border: '1px solid rgba(255,87,51,0.2)', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Truck size={18} color="#FF5733" strokeWidth={2} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5' }}>Integración Shipday</span>
            <span style={{ ...ds.badge, background: badge.bg, color: badge.color, marginLeft: 'auto' }}>
              {badge.label}
            </span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={ds.label}>API Key de Shipday</label>
            <div style={{ position: 'relative' }}>
              <input
                type={keyVisible ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setShipStatus('unchecked') }}
                placeholder="Introduce la API key de Shipday..."
                style={{ ...ds.formInput, paddingRight: 44 }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setKeyVisible(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center',
                }}
              >
                {keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={verificarKey}
              disabled={verifying || !apiKey.trim()}
              style={{
                ...ds.secondaryBtn,
                border: '1px solid rgba(255,87,51,0.4)',
                color: '#FF5733',
                opacity: verifying || !apiKey.trim() ? 0.5 : 1,
                cursor: verifying || !apiKey.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {verifying ? 'Verificando...' : 'Verificar conexión'}
            </button>
            <button
              onClick={guardarKey}
              disabled={saving}
              style={{
                ...ds.primaryBtn,
                background: '#FF5733',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              <Save size={14} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── LISTA ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Socios</h1>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          {filtrados.length} total
        </span>
      </div>

      <input
        placeholder="Buscar por nombre o email..."
        value={buscar}
        onChange={e => setBuscar(e.target.value)}
        style={{ ...ds.input, marginBottom: 20, width: 320 }}
      />

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 44 }}></span>
          <span style={{ flex: 1 }}>Nombre</span>
          <span style={{ width: 150 }}>Comercial</span>
          <span style={{ width: 120 }}>Slug</span>
          <span style={{ width: 190 }}>Email</span>
          <span style={{ width: 80 }}>Estado</span>
          <span style={{ width: 130 }}>Shipday</span>
          <span style={{ width: 60 }}>Acción</span>
        </div>

        {filtrados.map(s => {
          const hasKey = !!(s.shipday_api_key && s.shipday_api_key.trim())
          const initials = (s.nombre || 'S')[0].toUpperCase()
          return (
            <div key={s.id} style={ds.tableRow}>
              <span style={{ width: 44 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'rgba(255,107,44,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: '#FF6B2C', overflow: 'hidden',
                }}>
                  {s.logo_url
                    ? <img src={s.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials}
                </div>
              </span>
              <span
                style={{ flex: 1, fontWeight: 700, fontSize: 13, color: '#F5F5F5', cursor: 'pointer' }}
                onClick={() => verDetalle(s)}
              >
                {s.nombre}
              </span>
              <span style={{ width: 150, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{s.nombre_comercial || '—'}</span>
              <span style={{ width: 120, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{s.slug || '—'}</span>
              <span style={{ width: 190, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{s.email || '—'}</span>
              <span style={{ width: 80 }}>
                <span style={{ ...ds.badge, background: s.activo ? 'rgba(22,163,74,0.15)' : 'rgba(107,114,128,0.15)', color: s.activo ? '#16A34A' : '#6B7280' }}>
                  {s.activo ? 'Activo' : 'Inactivo'}
                </span>
              </span>
              <span style={{ width: 130 }}>
                <span style={{
                  ...ds.badge,
                  background: hasKey ? 'rgba(22,163,74,0.15)' : 'rgba(107,114,128,0.12)',
                  color: hasKey ? '#16A34A' : '#6B7280',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: hasKey ? '#16A34A' : '#6B7280', display: 'inline-block' }} />
                  {hasKey ? 'Configurado' : 'Sin configurar'}
                </span>
              </span>
              <span style={{ width: 60 }}>
                <button onClick={() => verDetalle(s)} style={ds.actionBtn}>Ver</button>
              </span>
            </div>
          )
        })}

        {filtrados.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Sin socios
          </div>
        )}
      </div>
    </div>
  )
}
