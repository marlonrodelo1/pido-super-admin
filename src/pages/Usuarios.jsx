import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Save, X } from 'lucide-react'

export default function Usuarios() {
  const [items, setItems] = useState([])
  const [buscar, setBuscar] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [pedidosUsuario, setPedidosUsuario] = useState([])
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('usuarios').select('*').order('created_at', { ascending: false })
    setItems(data || [])
  }

  async function verDetalle(u) {
    setDetalle(u)
    setEditando(false)
    const { data } = await supabase.from('pedidos').select('id, codigo, total, subtotal, coste_envio, propina, estado, metodo_pago, canal, modo_entrega, created_at, establecimientos(nombre)')
      .eq('usuario_id', u.id).order('created_at', { ascending: false }).limit(30)
    setPedidosUsuario(data || [])
  }

  async function guardarUsuario() {
    setSaving(true)
    const { error } = await supabase.from('usuarios').update({
      nombre: form.nombre?.trim(),
      apellido: form.apellido?.trim() || null,
      telefono: form.telefono?.trim() || null,
      direccion: form.direccion?.trim() || null,
      metodo_pago_preferido: form.metodo_pago_preferido,
    }).eq('id', detalle.id)
    if (!error) {
      const updated = { ...detalle, ...form }
      setDetalle(updated)
      setItems(prev => prev.map(u => u.id === detalle.id ? updated : u))
      setEditando(false)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    }
    setSaving(false)
  }

  const filtrados = items.filter(u => {
    if (!buscar) return true
    const q = buscar.toLowerCase()
    return (u.nombre || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.telefono || '').includes(q)
  })

  const estadoColor = { entregado: '#F5F5F5', cancelado: '#EF4444', fallido: '#EF4444', nuevo: '#FF6B2C', aceptado: '#FF6B2C', preparando: '#FF6B2C', listo: 'rgba(245,245,245,0.62)', en_camino: '#FF6B2C', recogido: '#FF6B2C' }

  // Total gastado por el usuario
  const totalGastado = pedidosUsuario.filter(p => p.estado === 'entregado').reduce((s, p) => s + (p.total || 0), 0)
  const totalPedidos = pedidosUsuario.length
  const pedidosEntregados = pedidosUsuario.filter(p => p.estado === 'entregado').length

  if (detalle) {
    return (
      <div>
        <button onClick={() => { setDetalle(null); setEditando(false) }} style={ds.backBtn}>← Volver</button>

        <div style={ds.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,107,44,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#FF6B2C', overflow: 'hidden' }}>
              {detalle.avatar_url ? <img src={detalle.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (detalle.nombre?.[0] || 'U').toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{detalle.nombre} {detalle.apellido || ''}</h2>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{detalle.email}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!editando ? (
                <button onClick={() => { setForm({ nombre: detalle.nombre || '', apellido: detalle.apellido || '', telefono: detalle.telefono || '', direccion: detalle.direccion || '', metodo_pago_preferido: detalle.metodo_pago_preferido || 'tarjeta' }); setEditando(true) }} style={ds.primaryBtn}>Editar</button>
              ) : (
                <>
                  <button onClick={guardarUsuario} disabled={saving} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditando(false)} style={ds.secondaryBtn}>Cancelar</button>
                </>
              )}
            </div>
          </div>

          {guardado && <div style={{ background: 'rgba(255,255,255,0.06)', color: '#F5F5F5', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>Cambios guardados</div>}

          {editando ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={ds.label}>Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Apellido</label><input value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Método de pago</label>
                <select value={form.metodo_pago_preferido} onChange={e => setForm({ ...form, metodo_pago_preferido: e.target.value })} style={ds.select}>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Dirección</label><input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={ds.label}>Email (no editable)</label>
                <input value={detalle.email || ''} disabled style={{ ...ds.formInput, opacity: 0.4, cursor: 'not-allowed' }} />
              </div>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 4 }}>Total gastado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#FF6B2C' }}>{totalGastado.toFixed(2)} €</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 4 }}>Pedidos</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{totalPedidos}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 4 }}>Entregados</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{pedidosEntregados}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: '#F5F5F5', marginBottom: 20 }}>
                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Teléfono:</span> {detalle.telefono || '—'}</div>
                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Dirección:</span> {detalle.direccion || '—'}</div>
                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Pago preferido:</span> {detalle.metodo_pago_preferido === 'efectivo' ? '💵 Efectivo' : '💳 Tarjeta'}</div>
                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Registrado:</span> {new Date(detalle.created_at).toLocaleDateString('es-ES')}</div>
                <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Favoritos:</span> {detalle.favoritos?.length || 0}</div>
              </div>
            </>
          )}
        </div>

        {/* Historial de pedidos */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#F5F5F5' }}>Historial de pedidos ({pedidosUsuario.length})</h3>
          {pedidosUsuario.map(p => (
            <div key={p.id} style={{ ...ds.card, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{p.codigo}</span>
                  <span style={{ ...ds.badge, background: (estadoColor[p.estado] || '#6B7280') + '20', color: estadoColor[p.estado] || '#6B7280', fontSize: 10 }}>{p.estado?.replace('_', ' ')}</span>
                  <span style={{ fontSize: 10, color: p.metodo_pago === 'tarjeta' ? '#60A5FA' : '#4ADE80' }}>{p.metodo_pago === 'tarjeta' ? '💳' : '💵'}</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>PIDO</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.establecimientos?.nombre || '—'} · {new Date(p.created_at).toLocaleDateString('es-ES')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#F5F5F5' }}>{p.total?.toFixed(2)} €</div>
                {p.coste_envio > 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>envío {p.coste_envio?.toFixed(2)}€</div>}
              </div>
            </div>
          ))}
          {pedidosUsuario.length === 0 && <div style={{ ...ds.card, textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin pedidos</div>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Usuarios</h1>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{filtrados.length} total</span>
      </div>

      <input
        placeholder="Buscar por nombre, email o teléfono..."
        value={buscar} onChange={e => setBuscar(e.target.value)}
        style={{ ...ds.input, marginBottom: 20, width: 320 }}
      />

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 44 }}></span>
          <span style={{ flex: 1 }}>Nombre</span>
          <span style={{ width: 200 }}>Email</span>
          <span style={{ width: 110 }}>Teléfono</span>
          <span style={{ width: 90 }}>Registro</span>
          <span style={{ width: 60 }}>Acción</span>
        </div>
        {filtrados.map(u => (
          <div key={u.id} style={ds.tableRow}>
            <span style={{ width: 44 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,107,44,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#FF6B2C', overflow: 'hidden' }}>
                {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.nombre?.[0] || 'U').toUpperCase()}
              </div>
            </span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: '#F5F5F5', cursor: 'pointer' }} onClick={() => verDetalle(u)}>{u.nombre} {u.apellido || ''}</span>
            <span style={{ width: 200, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{u.email}</span>
            <span style={{ width: 110, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{u.telefono || '—'}</span>
            <span style={{ width: 90, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{new Date(u.created_at).toLocaleDateString('es-ES')}</span>
            <span style={{ width: 60 }}>
              <button onClick={() => verDetalle(u)} style={ds.actionBtn}>Ver</button>
            </span>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin usuarios</div>}
      </div>
    </div>
  )
}
