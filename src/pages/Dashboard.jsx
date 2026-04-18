import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'

function StatCard({ label, value, color = '#FF6B2C' }) {
  return (
    <div style={ds.card}>
      <div style={{ fontSize: 11, ...ds.muted, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ pedidos: 0, ventas: 0, comisiones: 0, usuarios: 0, establecimientos: 0 })
  const [periodo, setPeriodo] = useState('hoy')
  const [recientes, setRecientes] = useState([])

  useEffect(() => { loadStats(); loadRecientes() }, [periodo])

  async function loadStats() {
    const now = new Date()
    let desde
    if (periodo === 'hoy') desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    else if (periodo === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 7); desde = d.toISOString() }
    else { const d = new Date(now); d.setMonth(d.getMonth() - 1); desde = d.toISOString() }

    const [pedidosRes, usersRes, estRes, configRes] = await Promise.all([
      supabase.from('pedidos').select('total, estado').gte('created_at', desde),
      supabase.from('usuarios').select('id', { count: 'exact', head: true }),
      supabase.from('establecimientos').select('id', { count: 'exact', head: true }),
      supabase.from('configuracion_plataforma').select('valor').eq('clave', 'comision_plataforma').single(),
    ])
    const pedidos = pedidosRes.data || []
    const entregados = pedidos.filter(p => p.estado === 'entregado')
    const ventas = entregados.reduce((s, p) => s + (p.total || 0), 0)
    const pctComision = parseFloat(configRes.data?.valor || '10') / 100
    setStats({ pedidos: pedidos.length, ventas, comisiones: ventas * pctComision, usuarios: usersRes.count || 0, establecimientos: estRes.count || 0 })
  }

  async function loadRecientes() {
    const { data } = await supabase.from('pedidos').select('id, codigo, total, estado, metodo_pago, canal, created_at').order('created_at', { ascending: false }).limit(10)
    setRecientes(data || [])
  }

  const estadoColor = { nuevo: '#FF6B2C', aceptado: '#FF6B2C', preparando: '#FF6B2C', listo: 'rgba(245,245,245,0.62)', recogido: 'rgba(245,245,245,0.62)', en_camino: '#FF6B2C', entregado: '#F5F5F5', cancelado: '#EF4444', fallido: '#EF4444' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={ds.h1}>Dashboard</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {['hoy', 'semana', 'mes'].map(p => (
            <button key={p} onClick={() => setPeriodo(p)} style={{
              ...ds.filterBtn, background: periodo === p ? '#FF6B2C' : 'rgba(255,255,255,0.08)',
              color: periodo === p ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Pedidos" value={stats.pedidos} />
        <StatCard label="Ventas" value={`${stats.ventas.toFixed(2)}€`} color="#F5F5F5" />
        <StatCard label="Comisiones" value={`${stats.comisiones.toFixed(2)}€`} color="rgba(245,245,245,0.62)" />
        <StatCard label="Usuarios" value={stats.usuarios} color="#FF6B2C" />
        <StatCard label="Establecimientos" value={stats.establecimientos} color="#EF4444" />
      </div>

      <h2 style={ds.h2}>Pedidos recientes</h2>
      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 100 }}>Codigo</span>
          <span style={{ width: 80 }}>Total</span>
          <span style={{ width: 80 }}>Estado</span>
          <span style={{ width: 70 }}>Pago</span>
          <span style={{ width: 70 }}>Canal</span>
          <span style={{ flex: 1 }}>Fecha</span>
        </div>
        {recientes.map(p => (
          <div key={p.id} style={ds.tableRow}>
            <span style={{ width: 100, fontWeight: 700, fontSize: 12 }}>{p.codigo}</span>
            <span style={{ width: 80, fontSize: 12 }}>{p.total?.toFixed(2)}€</span>
            <span style={{ width: 80 }}>
              <span style={{ ...ds.badge, background: (estadoColor[p.estado] || '#6B7280') + '25', color: estadoColor[p.estado] || '#6B7280' }}>{p.estado}</span>
            </span>
            <span style={{ width: 70 }}>
              <span style={{ ...ds.badge, background: p.metodo_pago === 'tarjeta' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)', color: p.metodo_pago === 'tarjeta' ? '#60A5FA' : '#FBBF24' }}>
                {p.metodo_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
              </span>
            </span>
            <span style={{ width: 70 }}>
              <span style={{ ...ds.badge, background: 'rgba(255,107,44,0.15)', color: '#FF6B2C' }}>PIDO</span>
            </span>
            <span style={{ flex: 1, fontSize: 11, ...ds.muted }}>{new Date(p.created_at).toLocaleString('es-ES')}</span>
          </div>
        ))}
        {recientes.length === 0 && <div style={{ padding: 24, textAlign: 'center', ...ds.muted, fontSize: 13 }}>Sin pedidos</div>}
      </div>
    </div>
  )
}
