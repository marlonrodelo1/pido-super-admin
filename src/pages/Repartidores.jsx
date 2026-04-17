import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Plus, CheckCircle2, AlertCircle, Copy, Truck, X, Check, Ban } from 'lucide-react'
import { toast, confirmar } from '../App'

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shipday-webhook`

const ESTADOS = {
  pendiente: { label: 'Pendiente', bg: 'rgba(245,158,11,0.15)', color: '#FBBF24' },
  activa: { label: 'Activo', bg: 'rgba(34,197,94,0.15)', color: '#4ADE80' },
  rechazada: { label: 'Rechazado', bg: 'rgba(239,68,68,0.15)', color: '#F87171' },
}

export default function Repartidores() {
  const [riders, setRiders] = useState([])
  const [status, setStatus] = useState({})
  const [vinculos, setVinculos] = useState({})
  const [origenes, setOrigenes] = useState({})
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [showNuevo, setShowNuevo] = useState(false)
  const [detalle, setDetalle] = useState(null)

  useEffect(() => {
    load()
    const channel = supabase.channel('admin-riders-approval')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_status' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_accounts' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function load() {
    const [ridersRes, statusRes, vincRes] = await Promise.all([
      supabase.from('rider_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('rider_status').select('*'),
      supabase.from('restaurante_riders').select('rider_account_id, establecimientos(id, nombre)'),
    ])
    setRiders(ridersRes.data || [])

    const statusMap = {}
    ;(statusRes.data || []).forEach(s => { statusMap[s.rider_account_id] = s })
    setStatus(statusMap)

    const vincMap = {}
    ;(vincRes.data || []).forEach(v => {
      if (!vincMap[v.rider_account_id]) vincMap[v.rider_account_id] = []
      if (v.establecimientos?.nombre) vincMap[v.rider_account_id].push(v.establecimientos.nombre)
    })
    setVinculos(vincMap)

    // Cargar nombres de establecimientos origen
    const origenIds = [...new Set((ridersRes.data || []).map(r => r.establecimiento_origen_id).filter(Boolean))]
    if (origenIds.length > 0) {
      const { data: ests } = await supabase.from('establecimientos').select('id, nombre').in('id', origenIds)
      const map = {}
      ;(ests || []).forEach(e => { map[e.id] = e.nombre })
      setOrigenes(map)
    }
  }

  async function aprobar(r) {
    const { error } = await supabase.from('rider_accounts')
      .update({ estado: 'activa', aprobado_en: new Date().toISOString(), motivo_rechazo: null })
      .eq('id', r.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(`${r.nombre} aprobado`)
    load()
  }

  async function rechazar(r) {
    const motivo = prompt('Motivo del rechazo (opcional):', '')
    if (motivo === null) return
    const { error } = await supabase.from('rider_accounts')
      .update({ estado: 'rechazada', motivo_rechazo: motivo || null })
      .eq('id', r.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(`${r.nombre} rechazado`)
    load()
  }

  async function reactivar(r) {
    const ok = await confirmar(`¿Reactivar "${r.nombre}"?`)
    if (!ok) return
    const { error } = await supabase.from('rider_accounts')
      .update({ estado: 'activa', aprobado_en: new Date().toISOString(), motivo_rechazo: null })
      .eq('id', r.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Reactivado')
    load()
  }

  async function eliminar(r) {
    const ok = await confirmar(`¿Eliminar permanentemente "${r.nombre}"?`)
    if (!ok) return
    const { error } = await supabase.from('rider_accounts').delete().eq('id', r.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Eliminado')
    if (detalle?.id === r.id) setDetalle(null)
    load()
  }

  async function chequearAhora() {
    toast('Actualizando estado...')
    const { error } = await supabase.functions.invoke('check-shipday-drivers')
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Estado actualizado')
    load()
  }

  const contadores = {
    pendiente: riders.filter(r => r.estado === 'pendiente').length,
    activa: riders.filter(r => r.estado === 'activa').length,
    rechazada: riders.filter(r => r.estado === 'rechazada').length,
  }

  const filtered = riders.filter(r => {
    if (filtroEstado !== 'todos' && r.estado !== filtroEstado) return false
    if (buscar && !r.nombre.toLowerCase().includes(buscar.toLowerCase())
      && !(r.telefono || '').includes(buscar)
      && !(r.email || '').toLowerCase().includes(buscar.toLowerCase())) return false
    return true
  })

  if (detalle) {
    return <RiderDetalle rider={detalle} onBack={() => setDetalle(null)} onSaved={load} origenNombre={origenes[detalle.establecimiento_origen_id]} />
  }

  const tabs = [
    { id: 'pendiente', l: `Pendientes (${contadores.pendiente})` },
    { id: 'activa', l: `Activos (${contadores.activa})` },
    { id: 'rechazada', l: `Rechazados (${contadores.rechazada})` },
    { id: 'todos', l: 'Todos' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={ds.h1}>Repartidores</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={chequearAhora} style={ds.secondaryBtn}>Refrescar estado</button>
          <button onClick={() => setShowNuevo(true)} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nuevo repartidor
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setFiltroEstado(t.id)} style={{
            ...ds.filterBtn, padding: '7px 14px', fontSize: 12,
            background: filtroEstado === t.id ? '#FF6B2C' : 'rgba(255,255,255,0.08)',
            color: filtroEstado === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.l}
            {t.id === 'pendiente' && contadores.pendiente > 0 && filtroEstado !== 'pendiente' && (
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#F59E0B' }} />
            )}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, teléfono o email..." style={{ ...ds.input, width: '100%', maxWidth: 400 }} />
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ flex: 1 }}>Nombre</span>
          <span style={{ width: 130 }}>Contacto</span>
          <span style={{ width: 110 }}>Estado</span>
          <span style={{ width: 110 }}>Shipday</span>
          <span style={{ width: 150 }}>Registrado desde</span>
          <span style={{ width: 200, textAlign: 'right' }}></span>
        </div>
        {filtered.map(r => {
          const st = status[r.id]
          const online = st?.is_online
          const error = st?.last_error
          const estadoInfo = ESTADOS[r.estado] || ESTADOS.pendiente
          const origen = r.establecimiento_origen_id ? origenes[r.establecimiento_origen_id] : null
          return (
            <div key={r.id} style={ds.tableRow}>
              <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => setDetalle(r)}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{r.nombre}</div>
                {r.email && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.email}</div>}
              </span>
              <span style={{ width: 130, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{r.telefono || '—'}</span>
              <span style={{ width: 110 }}>
                <span style={{ ...ds.badge, background: estadoInfo.bg, color: estadoInfo.color }}>{estadoInfo.label}</span>
              </span>
              <span style={{ width: 110 }}>
                {r.estado !== 'activa' ? (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>—</span>
                ) : error ? (
                  <span style={{ ...ds.badge, background: 'rgba(239,68,68,0.15)', color: '#F87171' }} title={error}>Error</span>
                ) : online ? (
                  <span style={{ ...ds.badge, background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>● Online</span>
                ) : (
                  <span style={{ ...ds.badge, background: 'rgba(148,163,184,0.15)', color: '#94A3B8' }}>○ Offline</span>
                )}
              </span>
              <span style={{ width: 150, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{origen || '—'}</span>
              <span style={{ width: 200, textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {r.estado === 'pendiente' && (
                  <>
                    <button onClick={() => aprobar(r)} style={{ ...ds.actionBtn, background: 'rgba(34,197,94,0.15)', color: '#4ADE80', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Aprobar
                    </button>
                    <button onClick={() => rechazar(r)} style={{ ...ds.actionBtn, background: 'rgba(239,68,68,0.15)', color: '#F87171', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Ban size={11} /> Rechazar
                    </button>
                  </>
                )}
                {r.estado === 'rechazada' && (
                  <button onClick={() => reactivar(r)} style={{ ...ds.actionBtn, background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>Reactivar</button>
                )}
                {r.estado === 'activa' && (
                  <button onClick={() => setDetalle(r)} style={ds.actionBtn}>Ver</button>
                )}
                <button onClick={() => eliminar(r)} style={{ ...ds.actionBtn, color: '#EF4444' }}>Eliminar</button>
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            {riders.length === 0 ? 'Sin repartidores. Los restaurantes los registran desde su panel, tú los apruebas aquí.' : 'Sin resultados para este filtro.'}
          </div>
        )}
      </div>

      {showNuevo && <RiderModal onClose={() => setShowNuevo(false)} onSaved={() => { setShowNuevo(false); load() }} />}
    </div>
  )
}

function RiderModal({ rider, onClose, onSaved }) {
  const [nombre, setNombre] = useState(rider?.nombre || '')
  const [telefono, setTelefono] = useState(rider?.telefono || '')
  const [email, setEmail] = useState(rider?.email || '')
  const [apiKey, setApiKey] = useState(rider?.shipday_api_key || '')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [saving, setSaving] = useState(false)

  async function verificar() {
    const key = apiKey.trim()
    if (!key) return toast('Pega la API key primero', 'error')
    setVerifying(true); setVerifyResult(null)
    try {
      const resp = await fetch('https://api.shipday.com/carriers', {
        method: 'GET', headers: { 'Authorization': `Basic ${key}` },
      })
      if (!resp.ok) {
        setVerifyResult({ ok: false, msg: `Key inválida (HTTP ${resp.status})` })
        toast('Key inválida', 'error')
      } else {
        const data = await resp.json()
        const list = Array.isArray(data) ? data : (data.carriers || data.data || [])
        setVerifyResult({ ok: true, total: list.length })
        toast(`Key válida — ${list.length} carrier${list.length === 1 ? '' : 's'}`)
      }
    } catch {
      setVerifyResult({ ok: false, msg: 'Error de red' })
      toast('Error de red', 'error')
    }
    setVerifying(false)
  }

  async function guardar() {
    if (!nombre.trim() || !apiKey.trim()) return toast('Nombre y API key obligatorios', 'error')
    setSaving(true)
    const payload = {
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      shipday_api_key: apiKey.trim(),
    }
    const { error } = rider
      ? await supabase.from('rider_accounts').update(payload).eq('id', rider.id)
      : await supabase.from('rider_accounts').insert({ ...payload, activa: true, estado: 'activa', aprobado_en: new Date().toISOString() })
    if (error) { toast('Error: ' + error.message, 'error'); setSaving(false); return }
    toast(rider ? 'Rider actualizado' : 'Rider creado y aprobado')
    onSaved()
  }

  return (
    <div style={ds.modal} onClick={onClose}>
      <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Truck size={18} color="#FF6B2C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F5F5F5', flex: 1 }}>{rider ? 'Editar repartidor' : 'Nuevo repartidor'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div><label style={ds.label}>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Pedro Martín" style={ds.formInput} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={ds.label}>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="600 123 456" style={ds.formInput} />
            </div>
            <div><label style={ds.label}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="rider@email.com" style={ds.formInput} />
            </div>
          </div>
          <div><label style={ds.label}>API Key Shipday personal</label>
            <input value={apiKey} onChange={e => { setApiKey(e.target.value); setVerifyResult(null) }} placeholder="Pegar desde Shipday → Settings → API" style={{ ...ds.formInput, fontFamily: 'monospace', fontSize: 12 }} />
          </div>

          {verifyResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              background: verifyResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: verifyResult.ok ? '#4ADE80' : '#F87171',
              fontSize: 12, fontWeight: 600,
            }}>
              {verifyResult.ok
                ? <><CheckCircle2 size={14} /> Key válida — {verifyResult.total} carrier{verifyResult.total === 1 ? '' : 's'}</>
                : <><AlertCircle size={14} /> {verifyResult.msg}</>
              }
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={verificar} disabled={verifying || !apiKey.trim()} style={{ ...ds.secondaryBtn, opacity: verifying || !apiKey.trim() ? 0.5 : 1 }}>
              {verifying ? 'Verificando...' : 'Verificar'}
            </button>
            <button onClick={guardar} disabled={saving} style={{ ...ds.primaryBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Guardando...' : (rider ? 'Guardar' : 'Crear y activar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RiderDetalle({ rider, onBack, onSaved, origenNombre }) {
  const [edit, setEdit] = useState(false)
  const [restaurantes, setRestaurantes] = useState([])
  const [st, setSt] = useState(null)

  useEffect(() => { load() }, [rider.id])

  async function load() {
    const [rrRes, stRes] = await Promise.all([
      supabase.from('restaurante_riders')
        .select('establecimiento_id, prioridad, establecimientos(id, nombre)')
        .eq('rider_account_id', rider.id),
      supabase.from('rider_status').select('*').eq('rider_account_id', rider.id).maybeSingle(),
    ])
    setRestaurantes(rrRes.data || [])
    setSt(stRes.data)
  }

  const estadoInfo = ESTADOS[rider.estado] || ESTADOS.pendiente

  return (
    <div>
      <button onClick={onBack} style={ds.backBtn}>← Volver</button>
      <div style={{ ...ds.card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'rgba(255,107,44,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Truck size={22} color="#FF6B2C" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{rider.nombre}</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {rider.telefono && <span>📞 {rider.telefono}</span>}
              {rider.email && <span>✉ {rider.email}</span>}
            </div>
          </div>
          <span style={{ ...ds.badge, background: estadoInfo.bg, color: estadoInfo.color, fontSize: 12, padding: '6px 12px' }}>{estadoInfo.label}</span>
          {rider.estado === 'activa' && (st?.is_online ? (
            <span style={{ ...ds.badge, background: 'rgba(34,197,94,0.15)', color: '#4ADE80', fontSize: 12, padding: '6px 12px' }}>● En línea</span>
          ) : (
            <span style={{ ...ds.badge, background: 'rgba(148,163,184,0.15)', color: '#94A3B8', fontSize: 12, padding: '6px 12px' }}>○ Offline</span>
          ))}
          <button onClick={() => setEdit(true)} style={ds.primaryBtn}>Editar</button>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          <div style={{ marginBottom: 4 }}>
            <span style={ds.muted}>API Key:</span>{' '}
            <span style={{ fontFamily: 'monospace' }}>{rider.shipday_api_key.slice(0, 8)}•••••{rider.shipday_api_key.slice(-4)}</span>
          </div>
          {origenNombre && <div><span style={ds.muted}>Registrado desde:</span> {origenNombre}</div>}
          {rider.motivo_rechazo && <div style={{ color: '#F87171' }}><span style={ds.muted}>Motivo rechazo:</span> {rider.motivo_rechazo}</div>}
          {st?.last_checked && (
            <div><span style={ds.muted}>Último chequeo:</span> {new Date(st.last_checked).toLocaleString('es-ES')}</div>
          )}
          {st?.last_error && (
            <div style={{ color: '#F87171' }}><span style={ds.muted}>Error:</span> {st.last_error}</div>
          )}
        </div>
      </div>

      <div style={ds.card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 12 }}>
          Restaurantes vinculados ({restaurantes.length})
        </h3>
        {restaurantes.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Sin restaurantes vinculados.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {restaurantes.map(r => (
              <div key={r.establecimiento_id} style={{
                display: 'flex', alignItems: 'center', padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)', borderRadius: 10,
              }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#F5F5F5' }}>{r.establecimientos?.nombre}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Prioridad {r.prioridad}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && <RiderModal rider={rider} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onSaved(); load() }} />}
    </div>
  )
}
