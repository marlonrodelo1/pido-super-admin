import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Plus, Truck, X, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast, confirmar } from '../App'

export default function RidersCard({ establecimiento, onChanged }) {
  const [vinc, setVinc] = useState([])
  const [status, setStatus] = useState({})
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (!establecimiento?.id) return
    load()
    const channel = supabase.channel(`riders-rest-${establecimiento.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_status' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurante_riders', filter: `establecimiento_id=eq.${establecimiento.id}` }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [establecimiento?.id])

  async function load() {
    const { data } = await supabase.from('restaurante_riders')
      .select('prioridad, rider_accounts(id, nombre, telefono, activa, estado)')
      .eq('establecimiento_id', establecimiento.id)
      .order('prioridad', { ascending: true })
    setVinc(data || [])
    const ids = (data || []).map(v => v.rider_accounts?.id).filter(Boolean)
    if (ids.length > 0) {
      const { data: st } = await supabase.from('rider_status').select('*').in('rider_account_id', ids)
      const map = {}
      ;(st || []).forEach(s => { map[s.rider_account_id] = s })
      setStatus(map)
    } else {
      setStatus({})
    }
  }

  async function desvincular(riderId, nombre) {
    const ok = await confirmar(`¿Desvincular "${nombre}" de este restaurante?`)
    if (!ok) return
    const { error } = await supabase.from('restaurante_riders')
      .delete()
      .eq('establecimiento_id', establecimiento.id)
      .eq('rider_account_id', riderId)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Rider desvinculado')
    load()
    onChanged?.()
  }

  const online = vinc.filter(v => v.rider_accounts?.estado === 'activa' && status[v.rider_accounts?.id]?.is_online).length
  const total = vinc.filter(v => v.rider_accounts?.activa && v.rider_accounts?.estado === 'activa').length

  const headerBadge = (() => {
    if (total === 0) return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', color: '#F87171', label: 'Sin repartidores vinculados' }
    if (online === 0) return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', color: '#F87171', label: `Ninguno en línea (0/${total})` }
    return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', color: '#4ADE80', label: `${online}/${total} en línea` }
  })()

  return (
    <div style={{ ...ds.card, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Truck size={18} color="#FF6B2C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', flex: 1 }}>Repartidores vinculados</h3>
        <button onClick={() => setShowAdd(true)} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '8px 14px' }}>
          <Plus size={12} /> Añadir
        </button>
      </div>

      <div style={{
        padding: '8px 12px', borderRadius: 10, marginBottom: 14,
        background: headerBadge.bg, border: `1px solid ${headerBadge.border}`,
        color: headerBadge.color, fontSize: 12, fontWeight: 600,
      }}>
        {headerBadge.label}
      </div>

      {vinc.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
          Aún no hay repartidores vinculados a este restaurante.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vinc.map(v => {
            const r = v.rider_accounts
            if (!r) return null
            const st = status[r.id]
            const online = st?.is_online
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)', borderRadius: 10,
                opacity: r.activa ? 1 : 0.5,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F5F5F5' }}>
                    {r.nombre}{!r.activa && <span style={{ fontSize: 10, color: '#F87171', marginLeft: 6 }}>(inactivo)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.telefono || 'Sin teléfono'}</div>
                </div>
                {r.estado === 'pendiente' ? (
                  <span style={{ ...ds.badge, background: 'rgba(245,158,11,0.15)', color: '#FBBF24', marginRight: 8 }}>Pendiente</span>
                ) : r.estado === 'rechazada' ? (
                  <span style={{ ...ds.badge, background: 'rgba(239,68,68,0.15)', color: '#F87171', marginRight: 8 }}>Rechazado</span>
                ) : !r.activa ? (
                  <span style={{ ...ds.badge, background: 'rgba(239,68,68,0.15)', color: '#F87171', marginRight: 8 }}>Inactivo</span>
                ) : st?.last_error ? (
                  <span style={{ ...ds.badge, background: 'rgba(245,158,11,0.15)', color: '#FBBF24', marginRight: 8 }} title={st.last_error}>Error</span>
                ) : online ? (
                  <span style={{ ...ds.badge, background: 'rgba(255,255,255,0.06)', color: '#4ADE80', marginRight: 8 }}>● En línea</span>
                ) : (
                  <span style={{ ...ds.badge, background: 'rgba(148,163,184,0.15)', color: '#94A3B8', marginRight: 8 }}>○ Offline</span>
                )}
                <button onClick={() => desvincular(r.id, r.nombre)} style={{
                  ...ds.actionBtn, color: '#EF4444',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Trash2 size={11} /> Desvincular
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddRiderModal
          establecimiento={establecimiento}
          vinculados={vinc.map(v => v.rider_accounts?.id).filter(Boolean)}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); onChanged?.() }}
        />
      )}
    </div>
  )
}

function AddRiderModal({ establecimiento, vinculados, onClose, onSaved }) {
  const [tab, setTab] = useState('existente')
  const [riders, setRiders] = useState([])
  const [buscar, setBuscar] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [saving, setSaving] = useState(false)

  // Nuevo rider
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)

  useEffect(() => {
    supabase.from('rider_accounts').select('*').eq('activa', true).eq('estado', 'activa').order('nombre')
      .then(({ data }) => setRiders(data || []))
  }, [])

  function toggle(id) {
    const s = new Set(selectedIds)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelectedIds(s)
  }

  async function vincularExistentes() {
    if (selectedIds.size === 0) return toast('Selecciona al menos uno', 'error')
    setSaving(true)
    const rows = Array.from(selectedIds).map((id, idx) => ({
      establecimiento_id: establecimiento.id,
      rider_account_id: id,
      prioridad: 100 + idx,
    }))
    const { error } = await supabase.from('restaurante_riders').insert(rows)
    if (error) { toast('Error: ' + error.message, 'error'); setSaving(false); return }
    toast(`${selectedIds.size} rider${selectedIds.size === 1 ? '' : 's'} vinculado${selectedIds.size === 1 ? '' : 's'}`)
    onSaved()
  }

  async function verificarNuevo() {
    const key = apiKey.trim()
    if (!key) return toast('Pega la API key primero', 'error')
    setVerifying(true)
    setVerifyResult(null)
    try {
      const resp = await fetch('https://api.shipday.com/carriers', {
        method: 'GET', headers: { 'Authorization': `Basic ${key}` },
      })
      if (!resp.ok) {
        setVerifyResult({ ok: false, msg: `Key inválida (HTTP ${resp.status})` })
      } else {
        const data = await resp.json()
        const list = Array.isArray(data) ? data : (data.carriers || data.data || [])
        setVerifyResult({ ok: true, total: list.length })
      }
    } catch {
      setVerifyResult({ ok: false, msg: 'Error de red' })
    }
    setVerifying(false)
  }

  async function crearYVincular() {
    if (!nombre.trim() || !apiKey.trim()) return toast('Nombre y API key obligatorios', 'error')
    setSaving(true)
    const { data: nuevo, error: e1 } = await supabase.from('rider_accounts')
      .insert({
        nombre: nombre.trim(), telefono: telefono.trim() || null,
        shipday_api_key: apiKey.trim(),
        activa: true, estado: 'activa', aprobado_en: new Date().toISOString(),
        establecimiento_origen_id: establecimiento.id,
      })
      .select().single()
    if (e1) { toast('Error: ' + e1.message, 'error'); setSaving(false); return }
    const { error: e2 } = await supabase.from('restaurante_riders').insert({
      establecimiento_id: establecimiento.id, rider_account_id: nuevo.id, prioridad: 100,
    })
    if (e2) { toast('Error vinculando: ' + e2.message, 'error'); setSaving(false); return }
    toast('Rider creado y vinculado')
    onSaved()
  }

  const disponibles = riders.filter(r =>
    !vinculados.includes(r.id) &&
    (!buscar || r.nombre.toLowerCase().includes(buscar.toLowerCase()))
  )

  return (
    <div style={ds.modal} onClick={onClose}>
      <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Truck size={18} color="#FF6B2C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F5F5F5', flex: 1 }}>Añadir repartidor</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {[{ id: 'existente', l: 'Elegir existente' }, { id: 'nuevo', l: 'Crear nuevo' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 16px', border: 'none', background: 'transparent',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              color: tab === t.id ? '#FF6B2C' : 'rgba(255,255,255,0.5)',
              borderBottom: tab === t.id ? '2px solid #FF6B2C' : '2px solid transparent',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            }}>{t.l}</button>
          ))}
        </div>

        {tab === 'existente' ? (
          <div>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar rider..." style={{ ...ds.formInput, marginBottom: 12 }} />
            {disponibles.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                {riders.length === 0 ? 'No hay riders creados aún. Usa "Crear nuevo".' : 'Todos los riders activos ya están vinculados.'}
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {disponibles.map(r => {
                  const sel = selectedIds.has(r.id)
                  return (
                    <button key={r.id} onClick={() => toggle(r.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer',
                      border: sel ? '1.5px solid #FF6B2C' : '1px solid rgba(255,255,255,0.08)',
                      background: sel ? 'rgba(255,107,44,0.1)' : 'rgba(255,255,255,0.04)',
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif", textAlign: 'left',
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        border: sel ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
                        background: sel ? '#FF6B2C' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {sel && <CheckCircle2 size={14} color="#fff" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#F5F5F5' }}>{r.nombre}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.telefono || 'Sin teléfono'}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} style={{ ...ds.secondaryBtn, flex: 1 }}>Cancelar</button>
              <button onClick={vincularExistentes} disabled={saving || selectedIds.size === 0} style={{
                ...ds.primaryBtn, flex: 1, opacity: saving || selectedIds.size === 0 ? 0.5 : 1,
              }}>
                {saving ? 'Vinculando...' : `Vincular (${selectedIds.size})`}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <label style={ds.label}>Nombre</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={ds.formInput} placeholder="Ej: Pedro Martín" />
            </div>
            <div>
              <label style={ds.label}>Teléfono (opcional)</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} style={ds.formInput} placeholder="600 123 456" />
            </div>
            <div>
              <label style={ds.label}>API Key Shipday personal</label>
              <input value={apiKey} onChange={e => { setApiKey(e.target.value); setVerifyResult(null) }} style={{ ...ds.formInput, fontFamily: 'monospace', fontSize: 12 }} placeholder="xxxxx.xxxxxxxx" />
            </div>
            {verifyResult && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: verifyResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: verifyResult.ok ? '#4ADE80' : '#F87171',
              }}>
                {verifyResult.ok
                  ? <><CheckCircle2 size={14} /> Key válida — {verifyResult.total} carrier{verifyResult.total === 1 ? '' : 's'}</>
                  : <><AlertCircle size={14} /> {verifyResult.msg}</>
                }
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={verificarNuevo} disabled={verifying || !apiKey.trim()} style={{ ...ds.secondaryBtn, opacity: verifying || !apiKey.trim() ? 0.5 : 1 }}>
                {verifying ? 'Verificando...' : 'Verificar'}
              </button>
              <button onClick={crearYVincular} disabled={saving} style={{ ...ds.primaryBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Guardando...' : 'Crear y vincular'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
