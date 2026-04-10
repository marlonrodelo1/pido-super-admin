import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/upload'
import { ds } from '../lib/darkStyles'
import { CheckCircle, XCircle, FileText, Eye, Save, Upload } from 'lucide-react'
import { toast, confirmar } from '../App'

export default function Socios() {
  const [items, setItems] = useState([])
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [detalle, setDetalle] = useState(null)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [solicitudes, setSolicitudes] = useState([])
  const [resenas, setResenas] = useState([])
  const logoRef = useRef()

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('socios').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setSolicitudes((data || []).filter(s => !s.activo && !s.rechazado))
  }

  async function toggleActivo(id, activo) {
    await supabase.from('socios').update({ activo: !activo }).eq('id', id)
    load()
  }

  async function aceptarSocio(id) {
    await supabase.from('socios').update({ activo: true }).eq('id', id)
    // Actualizar rol en usuarios a 'socio' si aún es 'cliente'
    const socio = items.find(s => s.id === id)
    if (socio?.user_id) {
      await supabase.from('usuarios').update({ rol: 'socio' }).eq('id', socio.user_id)
    }
    load()
  }

  async function rechazarSocio(id) {
    await supabase.from('socios').update({ activo: false, rechazado: true }).eq('id', id)
    load()
  }

  async function guardarSocio() {
    setSaving(true)
    const { error } = await supabase.from('socios').update(form).eq('id', detalle.id)
    if (error) toast('Error: ' + error.message, 'error')
    else { setDetalle({ ...detalle, ...form }); setEditando(false); load() }
    setSaving(false)
  }

  async function handleLogoUpload(file) {
    if (!file) return
    try {
      const url = await uploadImage(file, 'logos', 'socios')
      await supabase.from('socios').update({ logo_url: url }).eq('id', detalle.id)
      setDetalle(prev => ({ ...prev, logo_url: url }))
      setForm(prev => ({ ...prev, logo_url: url }))
    } catch (e) { toast(e.message, 'error') }
  }

  async function loadResenas(socioId) {
    const { data } = await supabase.from('resenas').select('*, usuarios(nombre, email), establecimientos(nombre)').eq('socio_id', socioId).order('created_at', { ascending: false }).limit(20)
    setResenas(data || [])
  }

  async function eliminarResena(id) {
    if (!(await confirmar('¿Eliminar esta resena?'))) return
    await supabase.from('resenas').delete().eq('id', id)
    if (detalle) loadResenas(detalle.id)
  }

  const filtrados = items.filter(s => {
    if (filtro === 'activos' && !s.activo) return false
    if (filtro === 'inactivos' && s.activo) return false
    if (filtro === 'en_servicio' && !s.en_servicio) return false
    if (buscar && !s.nombre.toLowerCase().includes(buscar.toLowerCase()) && !s.nombre_comercial?.toLowerCase().includes(buscar.toLowerCase())) return false
    return true
  })

  if (detalle) {
    return (
      <div>
        <button onClick={() => setDetalle(null)} style={ds.backBtn}>← Volver</button>
        <div style={{ ...ds.card, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 60, height: 60, borderRadius: 14, background: '#FF5733', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', overflow: 'hidden' }}>
              {detalle.logo_url ? <img src={detalle.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : detalle.nombre_comercial?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{detalle.nombre}</h2>
              <div style={{ fontSize: 12, ...ds.muted }}>{detalle.nombre_comercial} · /{detalle.slug}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ ...ds.badge, background: detalle.activo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: detalle.activo ? '#22C55E' : '#EF4444' }}>{detalle.activo ? 'Activo' : 'Inactivo'}</span>
              {!editando ? (
                <button onClick={() => { setForm({ nombre: detalle.nombre, nombre_comercial: detalle.nombre_comercial, email: detalle.email, telefono: detalle.telefono, modo_entrega: detalle.modo_entrega, radio_km: detalle.radio_km }); setEditando(true) }} style={ds.primaryBtn}>Editar</button>
              ) : (
                <>
                  <button onClick={guardarSocio} disabled={saving} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 4 }}><Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}</button>
                  <button onClick={() => setEditando(false)} style={ds.secondaryBtn}>Cancelar</button>
                </>
              )}
            </div>
          </div>

          {editando ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={ds.label}>Nombre</label><input value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Nombre comercial</label><input value={form.nombre_comercial || ''} onChange={e => setForm({ ...form, nombre_comercial: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Email</label><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Teléfono</label><input value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Modo entrega</label><select value={form.modo_entrega || ''} onChange={e => setForm({ ...form, modo_entrega: e.target.value })} style={ds.select}>
                <option value="delivery">Delivery</option><option value="recogida">Recogida</option><option value="ambos">Ambos</option>
              </select></div>
              <div><label style={ds.label}>Radio (km)</label><input type="number" value={form.radio_km || 0} onChange={e => setForm({ ...form, radio_km: +e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Logo</label>
                <label style={{ ...ds.formInput, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Upload size={14} /> Subir logo...
                  <input type="file" accept="image/*" hidden onChange={e => handleLogoUpload(e.target.files[0])} />
                </label>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: '#F5F5F5' }}>
              <div><span style={ds.muted}>Email:</span> {detalle.email || '-'}</div>
              <div><span style={ds.muted}>Telefono:</span> {detalle.telefono || '-'}</div>
              <div><span style={ds.muted}>Modo entrega:</span> {detalle.modo_entrega}</div>
              <div><span style={ds.muted}>Radio:</span> {detalle.radio_km} km</div>
              <div><span style={ds.muted}>Rating:</span> {detalle.rating?.toFixed(1)} ({detalle.total_resenas} reseñas)</div>
              <div><span style={ds.muted}>Creado:</span> {new Date(detalle.created_at).toLocaleDateString('es-ES')}</div>
            </div>
          )}

          {/* Documentación */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F5F5F5', marginBottom: 10 }}>Documentación</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['DNI / NIE', 'Permiso de conducir', 'Seguro vehículo', 'Alta autónomo'].map(doc => (
                <div key={doc} style={{ ...ds.card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={14} color="rgba(255,255,255,0.4)" />
                  <span style={{ fontSize: 12, color: '#F5F5F5', flex: 1 }}>{doc}</span>
                  <span style={{ ...ds.badge, background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>Pendiente</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reseñas */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F5F5F5' }}>Reseñas ({resenas.length})</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#F5F5F5' }}>{detalle.rating?.toFixed(1) || '—'}</span>
                <div style={{ display: 'flex', gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= Math.round(detalle.rating || 0) ? '#FBBF24' : 'rgba(255,255,255,0.15)', fontSize: 14 }}>★</span>)}</div>
              </div>
            </div>
            {resenas.map(r => (
              <div key={r.id} style={{ ...ds.card, padding: '10px 16px', marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: '#F5F5F5' }}>{r.usuarios?.nombre || 'Usuario'}</span>
                    <div style={{ display: 'flex', gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= r.rating ? '#FBBF24' : 'rgba(255,255,255,0.15)', fontSize: 10 }}>★</span>)}</div>
                    {r.establecimientos?.nombre && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>· {r.establecimientos.nombre}</span>}
                  </div>
                  {r.texto && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{r.texto}</div>}
                  {!r.texto && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>Sin comentario</div>}
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>{new Date(r.created_at).toLocaleDateString('es-ES')}</div>
                </div>
                <button onClick={() => eliminarResena(r.id)} style={{ ...ds.actionBtn, color: '#EF4444', fontSize: 10, flexShrink: 0 }}>Eliminar</button>
              </div>
            ))}
            {resenas.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Sin reseñas</div>}
          </div>

          {/* Acciones */}
          {!detalle.activo && (
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { aceptarSocio(detalle.id); setDetalle({ ...detalle, activo: true }) }} style={{ ...ds.primaryBtn, background: '#16A34A', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CheckCircle size={16} /> Aceptar socio
              </button>
              <button onClick={() => { rechazarSocio(detalle.id); setDetalle(null) }} style={{ ...ds.primaryBtn, background: '#EF4444', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <XCircle size={16} /> Rechazar
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Socios / Riders</h1>
        <span style={{ fontSize: 13, ...ds.muted, fontWeight: 600 }}>{filtrados.length} total</span>
      </div>

      {/* Solicitudes pendientes */}
      {solicitudes.length > 0 && (
        <div style={{ ...ds.card, marginBottom: 20, borderColor: 'rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#FBBF24', marginBottom: 12 }}>
            📋 {solicitudes.length} solicitud{solicitudes.length > 1 ? 'es' : ''} pendiente{solicitudes.length > 1 ? 's' : ''}
          </div>
          {solicitudes.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FF5733', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>
                {s.nombre_comercial?.[0]?.toUpperCase() || 'S'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{s.nombre}</div>
                <div style={{ fontSize: 11, ...ds.muted }}>{s.nombre_comercial} · {s.email}</div>
              </div>
              <button onClick={() => { setDetalle(s); loadResenas(s.id) }} style={{ ...ds.actionBtn, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Eye size={12} /> Revisar
              </button>
              <button onClick={() => aceptarSocio(s.id)} style={{ ...ds.actionBtn, color: '#22C55E' }}>Aceptar</button>
              <button onClick={() => rechazarSocio(s.id)} style={{ ...ds.actionBtn, color: '#EF4444' }}>Rechazar</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por nombre..." value={buscar} onChange={e => setBuscar(e.target.value)} style={ds.input} />
        <div style={{ display: 'flex', gap: 4 }}>
          {['todos', 'activos', 'inactivos', 'en_servicio'].map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{ ...ds.filterBtn, background: filtro === f ? '#FF6B2C' : 'rgba(255,255,255,0.08)', color: filtro === f ? '#fff' : 'rgba(255,255,255,0.5)' }}>
              {f === 'todos' ? 'Todos' : f === 'activos' ? 'Activos' : f === 'inactivos' ? 'Inactivos' : 'En servicio'}
            </button>
          ))}
        </div>
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 44 }}></span>
          <span style={{ flex: 1 }}>Nombre</span>
          <span style={{ width: 120 }}>Comercial</span>
          <span style={{ width: 80 }}>Modo</span>
          <span style={{ width: 60 }}>Rating</span>
          <span style={{ width: 80 }}>Estado</span>
          <span style={{ width: 120 }}>Acciones</span>
        </div>
        {filtrados.map(s => (
          <div key={s.id} style={ds.tableRow}>
            <span style={{ width: 44 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FF5733', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden' }}>
                {s.logo_url ? <img src={s.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.nombre_comercial?.[0]?.toUpperCase()}
              </div>
            </span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#F5F5F5' }} onClick={() => { setDetalle(s); loadResenas(s.id) }}>{s.nombre}</span>
            <span style={{ width: 120, fontSize: 12, ...ds.muted }}>{s.nombre_comercial}</span>
            <span style={{ width: 80 }}><span style={{ ...ds.badge, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>{s.modo_entrega}</span></span>
            <span style={{ width: 60, fontSize: 12, color: '#F5F5F5' }}>{s.rating?.toFixed(1)}</span>
            <span style={{ width: 80 }}>
              <span style={{ ...ds.badge, background: s.activo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: s.activo ? '#22C55E' : '#EF4444' }}>{s.activo ? 'Activo' : 'Inactivo'}</span>
            </span>
            <span style={{ width: 120, display: 'flex', gap: 6 }}>
              <button onClick={() => { setDetalle(s); loadResenas(s.id) }} style={ds.actionBtn}>Ver</button>
              <button onClick={() => toggleActivo(s.id, s.activo)} style={{ ...ds.actionBtn, color: s.activo ? '#EF4444' : '#22C55E' }}>
                {s.activo ? 'Desactivar' : 'Activar'}
              </button>
            </span>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 32, textAlign: 'center', ...ds.muted, fontSize: 13 }}>Sin socios</div>}
      </div>
    </div>
  )
}
