import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Plus, Truck, X, Trash2, CheckCircle2, AlertCircle, Phone, Mail, Calendar, Package } from 'lucide-react'
import { toast, confirmar } from '../App'

export default function RidersCard({ establecimiento, onChanged }) {
  const [vinc, setVinc] = useState([])
  const [status, setStatus] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [detalleSocio, setDetalleSocio] = useState(null)

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
      .select('prioridad, created_at, rider_accounts(id, nombre, telefono, email, activa, estado, shipday_api_key, aprobado_en)')
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

  async function desvincular(e, riderId, nombre) {
    e.stopPropagation()
    const ok = await confirmar(`¿Desvincular "${nombre}" de este restaurante?`)
    if (!ok) return
    const { error } = await supabase.from('restaurante_riders')
      .delete()
      .eq('establecimiento_id', establecimiento.id)
      .eq('rider_account_id', riderId)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Socio desvinculado')
    load()
    onChanged?.()
  }

  const online = vinc.filter(v => v.rider_accounts?.estado === 'activa' && status[v.rider_accounts?.id]?.is_online).length
  const total = vinc.filter(v => v.rider_accounts?.activa && v.rider_accounts?.estado === 'activa').length

  const headerBadge = (() => {
    if (total === 0) return { bg: 'var(--c-danger-soft)', border: 'rgba(239,68,68,0.35)', color: 'var(--c-danger)', label: 'Sin socios vinculados' }
    if (online === 0) return { bg: 'var(--c-danger-soft)', border: 'rgba(239,68,68,0.35)', color: 'var(--c-danger)', label: `Ninguno en línea (0/${total})` }
    return { bg: 'var(--c-success-soft)', border: 'rgba(34,197,94,0.35)', color: 'var(--c-success)', label: `${online}/${total} en línea` }
  })()

  return (
    <div style={{ ...ds.card, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Truck size={18} color="#FF6B2C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', flex: 1 }}>Socios vinculados</h3>
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
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
          Aún no hay socios vinculados a este restaurante.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vinc.map(v => {
            const r = v.rider_accounts
            if (!r) return null
            const st = status[r.id]
            const online = st?.is_online
            return (
              <button
                key={r.id}
                onClick={() => setDetalleSocio({ rider: r, vinculacion: v, status: st })}
                aria-label={`Ver detalle de ${r.nombre}`}
                style={{
                  display: 'flex', alignItems: 'center', padding: '10px 14px',
                  background: 'var(--c-surface2)', borderRadius: 10,
                  opacity: r.activa ? 1 : 0.5,
                  border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-surface3, var(--c-surface2))' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-surface2)' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>
                    {r.nombre}{!r.activa && <span style={{ fontSize: 10, color: 'var(--c-danger)', marginLeft: 6 }}>(inactivo)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{r.telefono || 'Sin teléfono'}</div>
                </div>
                {r.estado === 'pendiente' ? (
                  <span style={{ ...ds.badge, background: 'var(--c-warning-soft)', color: 'var(--c-warning)', marginRight: 8 }}>Pendiente</span>
                ) : r.estado === 'rechazada' ? (
                  <span style={{ ...ds.badge, background: 'var(--c-danger-soft)', color: 'var(--c-danger)', marginRight: 8 }}>Rechazado</span>
                ) : !r.activa ? (
                  <span style={{ ...ds.badge, background: 'var(--c-danger-soft)', color: 'var(--c-danger)', marginRight: 8 }}>Inactivo</span>
                ) : st?.last_error ? (
                  <span style={{ ...ds.badge, background: 'var(--c-warning-soft)', color: 'var(--c-warning)', marginRight: 8 }} title={st.last_error}>Error</span>
                ) : online ? (
                  <span style={{ ...ds.badge, background: 'var(--c-surface2)', color: 'var(--c-success)', marginRight: 8 }}>● En línea</span>
                ) : (
                  <span style={{ ...ds.badge, background: 'var(--c-surface2)', color: 'var(--c-muted)', marginRight: 8 }}>○ Offline</span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={e => desvincular(e, r.id, r.nombre)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); desvincular(e, r.id, r.nombre) } }}
                  style={{
                    ...ds.actionBtn, color: 'var(--c-danger)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Trash2 size={11} /> Desvincular
                </span>
              </button>
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

      {detalleSocio && (
        <SocioVinculadoModal
          rider={detalleSocio.rider}
          vinculacion={detalleSocio.vinculacion}
          status={detalleSocio.status}
          establecimiento={establecimiento}
          onClose={() => setDetalleSocio(null)}
        />
      )}
    </div>
  )
}

function SocioVinculadoModal({ rider, vinculacion, status, establecimiento, onClose }) {
  const [pedidosCount, setPedidosCount] = useState(null)

  useEffect(() => {
    let cancel = false
    supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('establecimiento_id', establecimiento.id)
      .eq('rider_account_id', rider.id)
      .then(({ count }) => { if (!cancel) setPedidosCount(count ?? 0) })
    return () => { cancel = true }
  }, [rider.id, establecimiento.id])

  function fmtFecha(s) {
    if (!s) return '—'
    try { return new Date(s).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return s }
  }

  const online = status?.is_online
  const estadoLabel = !rider.activa ? 'Inactivo'
    : rider.estado === 'pendiente' ? 'Pendiente'
    : rider.estado === 'rechazada' ? 'Rechazado'
    : online ? 'En línea' : 'Offline'
  const estadoColor = !rider.activa || rider.estado === 'rechazada' ? 'var(--c-danger)'
    : rider.estado === 'pendiente' ? 'var(--c-warning)'
    : online ? 'var(--c-success)' : 'var(--c-muted)'

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Truck size={18} color="#FF6B2C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', flex: 1 }}>{rider.nombre}</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color='var(--c-text)' /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ ...ds.badge, background: 'var(--c-surface2)', color: estadoColor, fontWeight: 700 }}>● {estadoLabel}</span>
          {status?.last_checked && (
            <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>chequeado: {fmtFecha(status.last_checked)}</span>
          )}
        </div>

        {/* Datos del socio */}
        <div style={{ ...ds.card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Datos del socio</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text)' }}>
              <Phone size={14} color="var(--c-muted)" />{rider.telefono || '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text)' }}>
              <Mail size={14} color="var(--c-muted)" />{rider.email || '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text)' }}>
              <Calendar size={14} color="var(--c-muted)" />Aprobado: {fmtFecha(rider.aprobado_en)}
            </div>
            {status?.last_error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-warning)', background: 'var(--c-warning-soft)', padding: '6px 10px', borderRadius: 8 }}>
                <AlertCircle size={14} />Último error: {status.last_error}
              </div>
            )}
          </div>
        </div>

        {/* Datos de la vinculación */}
        <div style={{ ...ds.card, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Vinculación con {establecimiento.nombre}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--c-muted)' }}>Prioridad</span>
              <span style={{ color: 'var(--c-text)', fontWeight: 700 }}>{vinculacion.prioridad ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--c-muted)' }}>Vinculado el</span>
              <span style={{ color: 'var(--c-text)' }}>{fmtFecha(vinculacion.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ ...ds.card, padding: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--c-primary-soft)', display: 'grid', placeItems: 'center' }}>
            <Package size={18} color="#FF6B2C" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pedidos hechos</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>{pedidosCount === null ? '...' : pedidosCount}</div>
          </div>
        </div>

        <button onClick={onClose} style={{ ...ds.secondaryBtn, width: '100%' }}>Cerrar</button>
      </div>
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
    toast(`${selectedIds.size} socio${selectedIds.size === 1 ? '' : 's'} vinculado${selectedIds.size === 1 ? '' : 's'}`)
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
    toast('Socio creado y vinculado')
    onSaved()
  }

  const disponibles = riders.filter(r =>
    !vinculados.includes(r.id) &&
    (!buscar || r.nombre.toLowerCase().includes(buscar.toLowerCase()))
  )

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={ds.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Truck size={18} color="#FF6B2C" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', flex: 1 }}>Añadir socio</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--c-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--c-border)' }}>
          {[{ id: 'existente', l: 'Elegir existente' }, { id: 'nuevo', l: 'Crear nuevo' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 16px', border: 'none', background: 'transparent',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              color: tab === t.id ? '#FF6B2C' : 'var(--c-muted)',
              borderBottom: tab === t.id ? '2px solid #FF6B2C' : '2px solid transparent',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            }}>{t.l}</button>
          ))}
        </div>

        {tab === 'existente' ? (
          <div>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar socio..." style={{ ...ds.formInput, marginBottom: 12 }} />
            {disponibles.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
                {riders.length === 0 ? 'No hay socios creados aún. Usa "Crear nuevo".' : 'Todos los socios activos ya están vinculados.'}
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {disponibles.map(r => {
                  const sel = selectedIds.has(r.id)
                  return (
                    <button key={r.id} onClick={() => toggle(r.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer',
                      border: sel ? '1.5px solid #FF6B2C' : '1px solid var(--c-border)',
                      background: sel ? 'var(--c-primary-soft)' : 'var(--c-surface2)',
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif", textAlign: 'left',
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        border: sel ? 'none' : '1.5px solid var(--c-muted)',
                        background: sel ? '#FF6B2C' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {sel && <CheckCircle2 size={14} color="#fff" />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{r.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{r.telefono || 'Sin teléfono'}</div>
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
                background: verifyResult.ok ? 'var(--c-success-soft)' : 'var(--c-danger-soft)',
                color: verifyResult.ok ? 'var(--c-success)' : 'var(--c-danger)',
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
