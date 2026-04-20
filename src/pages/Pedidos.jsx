import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'

export default function Pedidos() {
  const [items, setItems] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [filtroPago, setFiltroPago] = useState('todos')
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
    return true
  })

  const estadoColor = { nuevo: '#FF6B2C', aceptado: '#FF6B2C', preparando: '#FF6B2C', listo: 'var(--c-text-soft)', recogido: 'var(--c-text-soft)', en_camino: '#FF6B2C', entregado: 'var(--c-text)', cancelado: 'var(--c-danger)', fallido: 'var(--c-danger)' }
  const estados = ['todos', 'nuevo', 'aceptado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado']

  if (detalle) {
    return (
      <div>
        <button onClick={() => setDetalle(null)} style={ds.backBtn}>← Volver</button>
        <div style={ds.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{detalle.codigo}</h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ ...ds.badge, background: (estadoColor[detalle.estado] || '#6B7280') + '15', color: estadoColor[detalle.estado] }}>{detalle.estado}</span>
                <span style={{ ...ds.badge, background: detalle.metodo_pago === 'tarjeta' ? 'var(--c-info-soft)' : 'var(--c-warning-soft)', color: detalle.metodo_pago === 'tarjeta' ? 'var(--c-info)' : 'var(--c-warning)' }}>{detalle.metodo_pago}</span>
                <span style={{ ...ds.badge, background: 'var(--c-primary-soft)', color: '#FF6B2C' }}>PIDO</span>
              </div>
            </div>
            {detalle.estado !== 'cancelado' && detalle.estado !== 'entregado' && (
              <button onClick={() => cancelarPedido(detalle.id)} style={{ ...ds.actionBtn, color: 'var(--c-danger)', padding: '6px 14px' }}>Cancelar pedido</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 24, color: 'var(--c-text)' }}>
            <div><strong>Subtotal:</strong> {detalle.subtotal?.toFixed(2)}EUR</div>
            <div><strong>Envio:</strong> {detalle.coste_envio?.toFixed(2)}EUR</div>
            <div><strong>Propina:</strong> {detalle.propina?.toFixed(2)}EUR</div>
            <div><strong>Total:</strong> <span style={{ fontWeight: 800 }}>{detalle.total?.toFixed(2)}EUR</span></div>
            <div><strong>Direccion:</strong> {detalle.direccion_entrega || '-'}</div>
            <div><strong>Notas:</strong> {detalle.notas || '-'}</div>
            <div><strong>Preparacion:</strong> {detalle.minutos_preparacion || '-'} min</div>
            <div><strong>Creado:</strong> {new Date(detalle.created_at).toLocaleString('es-ES')}</div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--c-text)' }}>Items del pedido</h3>
          <div style={{ background: 'var(--c-surface2)', borderRadius: 10, overflow: 'hidden' }}>
            {detalleItems.map(item => (
              <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-text)' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{item.cantidad}x</span> {item.nombre_producto}
                  {item.tamano && <span style={{ color: 'var(--c-muted)' }}> ({item.tamano})</span>}
                  {item.extras?.length > 0 && <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>+ {item.extras.join(', ')}</div>}
                  {item.notas && <div style={{ fontSize: 11, color: '#FF6B2C', marginTop: 2 }}>{item.notas}</div>}
                </div>
                <span style={{ fontWeight: 700 }}>{(item.precio_unitario * item.cantidad).toFixed(2)}EUR</span>
              </div>
            ))}
            {detalleItems.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>Sin items</div>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Pedidos</h1>
        <span style={{ fontSize: 13, color: 'var(--c-muted)', fontWeight: 600 }}>{filtrados.length} pedidos</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {estados.map(e => (
          <button key={e} onClick={() => setFiltro(e)} style={{ ...ds.filterBtn, background: filtro === e ? '#FF6B2C' : 'var(--c-surface2)', color: filtro === e ? '#fff' : 'var(--c-muted)' }}>
            {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['todos', 'tarjeta', 'efectivo'].map(p => (
          <button key={p} onClick={() => setFiltroPago(p)} style={{ ...ds.filterBtn, background: filtroPago === p ? '#FF6B2C' : 'var(--c-surface2)', color: filtroPago === p ? '#fff' : 'var(--c-muted)' }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
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
            <span style={{ width: 70 }}><span style={{ ...ds.badge, background: p.metodo_pago === 'tarjeta' ? 'var(--c-info-soft)' : 'var(--c-warning-soft)', color: p.metodo_pago === 'tarjeta' ? 'var(--c-info)' : 'var(--c-warning)' }}>{p.metodo_pago}</span></span>
            <span style={{ width: 70 }}><span style={{ ...ds.badge, background: 'var(--c-primary-soft)', color: '#FF6B2C' }}>PIDO</span></span>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--c-muted)' }}>{new Date(p.created_at).toLocaleString('es-ES')}</span>
            <span style={{ width: 50 }}><button onClick={() => verDetalle(p)} style={ds.actionBtn}>Ver</button></span>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin pedidos</div>}
      </div>
    </div>
  )
}
