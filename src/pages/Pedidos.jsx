import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'

export default function Pedidos() {
  const [items, setItems] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [filtroPago, setFiltroPago] = useState('todos')
  const [filtroCanal, setFiltroCanal] = useState('todos')
  const [detalle, setDetalle] = useState(null)
  const [detalleItems, setDetalleItems] = useState([])

  useEffect(() => {
    load()
    const channel = supabase.channel('admin-pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function load() {
    const { data } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false }).limit(200)
    setItems(data || [])
  }

  async function verDetalle(p) {
    setDetalle(p)
    const { data } = await supabase.from('pedido_items').select('*').eq('pedido_id', p.id)
    setDetalleItems(data || [])
  }

  async function cancelarPedido(id) {
    await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', id)
    setDetalle(null)
    load()
  }

  const filtrados = items.filter(p => {
    if (filtro !== 'todos' && p.estado !== filtro) return false
    if (filtroPago !== 'todos' && p.metodo_pago !== filtroPago) return false
    if (filtroCanal !== 'todos' && p.canal !== filtroCanal) return false
    return true
  })

  const estadoColor = { nuevo: '#3B82F6', aceptado: '#F59E0B', preparando: '#F59E0B', listo: '#8B5CF6', recogido: '#8B5CF6', en_camino: '#3B82F6', entregado: '#16A34A', cancelado: '#EF4444', fallido: '#EF4444' }
  const estados = ['todos', 'nuevo', 'aceptado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado']

  if (detalle) {
    return (
      <div>
        <button onClick={() => setDetalle(null)} style={ds.backBtn}>← Volver</button>
        <div style={ds.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#F5F5F5' }}>{detalle.codigo}</h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ ...ds.badge, background: (estadoColor[detalle.estado] || '#6B7280') + '15', color: estadoColor[detalle.estado] }}>{detalle.estado}</span>
                <span style={{ ...ds.badge, background: detalle.metodo_pago === 'tarjeta' ? 'rgba(29,78,216,0.15)' : 'rgba(245,158,11,0.15)', color: detalle.metodo_pago === 'tarjeta' ? '#60A5FA' : '#FBBF24' }}>{detalle.metodo_pago}</span>
                <span style={{ ...ds.badge, background: detalle.canal === 'pido' ? 'rgba(255,107,44,0.15)' : 'rgba(22,101,52,0.15)', color: detalle.canal === 'pido' ? '#FF6B2C' : '#4ADE80' }}>{detalle.canal}</span>
              </div>
            </div>
            {detalle.estado !== 'cancelado' && detalle.estado !== 'entregado' && (
              <button onClick={() => cancelarPedido(detalle.id)} style={{ ...ds.actionBtn, color: '#EF4444', padding: '6px 14px' }}>Cancelar pedido</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 24, color: '#F5F5F5' }}>
            <div><strong>Subtotal:</strong> {detalle.subtotal?.toFixed(2)}EUR</div>
            <div><strong>Envio:</strong> {detalle.coste_envio?.toFixed(2)}EUR</div>
            <div><strong>Propina:</strong> {detalle.propina?.toFixed(2)}EUR</div>
            <div><strong>Total:</strong> <span style={{ fontWeight: 800 }}>{detalle.total?.toFixed(2)}EUR</span></div>
            <div><strong>Direccion:</strong> {detalle.direccion_entrega || '-'}</div>
            <div><strong>Notas:</strong> {detalle.notas || '-'}</div>
            <div><strong>Preparacion:</strong> {detalle.minutos_preparacion || '-'} min</div>
            <div><strong>Creado:</strong> {new Date(detalle.created_at).toLocaleString('es-ES')}</div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#F5F5F5' }}>Items del pedido</h3>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, overflow: 'hidden' }}>
            {detalleItems.map(item => (
              <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#F5F5F5' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{item.cantidad}x</span> {item.nombre_producto}
                  {item.tamano && <span style={{ color: 'rgba(255,255,255,0.4)' }}> ({item.tamano})</span>}
                  {item.extras?.length > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>+ {item.extras.join(', ')}</div>}
                  {item.notas && <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 2 }}>{item.notas}</div>}
                </div>
                <span style={{ fontWeight: 700 }}>{(item.precio_unitario * item.cantidad).toFixed(2)}EUR</span>
              </div>
            ))}
            {detalleItems.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Sin items</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Pedidos</h1>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{filtrados.length} pedidos</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {estados.map(e => (
          <button key={e} onClick={() => setFiltro(e)} style={{ ...ds.filterBtn, background: filtro === e ? '#FF6B2C' : 'rgba(255,255,255,0.08)', color: filtro === e ? '#fff' : 'rgba(255,255,255,0.5)' }}>
            {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['todos', 'tarjeta', 'efectivo'].map(p => (
          <button key={p} onClick={() => setFiltroPago(p)} style={{ ...ds.filterBtn, background: filtroPago === p ? '#3B82F6' : 'rgba(255,255,255,0.08)', color: filtroPago === p ? '#fff' : 'rgba(255,255,255,0.5)' }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        {['todos', 'pido', 'pidogo'].map(c => (
          <button key={c} onClick={() => setFiltroCanal(c)} style={{ ...ds.filterBtn, background: filtroCanal === c ? '#8B5CF6' : 'rgba(255,255,255,0.08)', color: filtroCanal === c ? '#fff' : 'rgba(255,255,255,0.5)' }}>
            {c === 'todos' ? 'Canales' : c.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 80 }}>Codigo</span>
          <span style={{ width: 80 }}>Total</span>
          <span style={{ width: 90 }}>Estado</span>
          <span style={{ width: 70 }}>Pago</span>
          <span style={{ width: 70 }}>Canal</span>
          <span style={{ flex: 1 }}>Fecha</span>
          <span style={{ width: 50 }}></span>
        </div>
        {filtrados.map(p => (
          <div key={p.id} style={ds.tableRow}>
            <span style={{ width: 80, fontWeight: 700, fontSize: 12 }}>{p.codigo}</span>
            <span style={{ width: 80, fontSize: 12 }}>{p.total?.toFixed(2)}EUR</span>
            <span style={{ width: 90 }}><span style={{ ...ds.badge, background: (estadoColor[p.estado] || '#6B7280') + '15', color: estadoColor[p.estado] }}>{p.estado}</span></span>
            <span style={{ width: 70 }}><span style={{ ...ds.badge, background: p.metodo_pago === 'tarjeta' ? 'rgba(29,78,216,0.15)' : 'rgba(245,158,11,0.15)', color: p.metodo_pago === 'tarjeta' ? '#60A5FA' : '#FBBF24' }}>{p.metodo_pago}</span></span>
            <span style={{ width: 70 }}><span style={{ ...ds.badge, background: p.canal === 'pido' ? 'rgba(255,107,44,0.15)' : 'rgba(22,101,52,0.15)', color: p.canal === 'pido' ? '#FF6B2C' : '#4ADE80' }}>{p.canal}</span></span>
            <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{new Date(p.created_at).toLocaleString('es-ES')}</span>
            <span style={{ width: 50 }}><button onClick={() => verDetalle(p)} style={ds.actionBtn}>Ver</button></span>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin pedidos</div>}
      </div>
    </div>
  )
}
