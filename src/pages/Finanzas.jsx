import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'

function StatCard({ label, value, color = '#F5F5F5' }) {
  return (
    <div style={ds.card}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
    </div>
  )
}

export default function Finanzas() {
  const [tab, setTab] = useState('resumen')
  const [balancesRest, setBalancesRest] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [resumen, setResumen] = useState({ comisionesTotal: 0, pagadoRest: 0, pendiente: 0 })
  const [facturas, setFacturas] = useState([])

  useEffect(() => {
    loadResumen()
    loadBalancesRest()
    loadMovimientos()
    loadFacturas()
  }, [])

  async function loadFacturas() {
    const { data } = await supabase.from('facturas_semanales').select('*, establecimientos(nombre)')
      .order('created_at', { ascending: false }).limit(50)
    setFacturas(data || [])
  }

  async function marcarFacturaPagada(id) {
    await supabase.from('facturas_semanales').update({ estado: 'pagado' }).eq('id', id)
    loadFacturas()
  }

  async function loadResumen() {
    const { data: comisiones } = await supabase.from('comisiones').select('comision_plataforma, estado_pago')
    const all = comisiones || []
    const comisionesTotal = all.reduce((s, c) => s + (c.comision_plataforma || 0), 0)
    const pagado = all.filter(c => c.estado_pago === 'pagado').reduce((s, c) => s + (c.comision_plataforma || 0), 0)
    setResumen({ comisionesTotal, pagadoRest: 0, pendiente: comisionesTotal - pagado })
  }

  async function loadBalancesRest() {
    const { data } = await supabase.from('balances_restaurante').select('*, establecimientos(nombre)')
      .order('created_at', { ascending: false }).limit(50)
    setBalancesRest(data || [])
  }

  async function loadMovimientos() {
    const { data } = await supabase.from('movimientos_cuenta').select('*')
      .order('created_at', { ascending: false }).limit(100)
    setMovimientos(data || [])
  }

  async function marcarPagado(tabla, id) {
    await supabase.from(tabla).update({ estado: 'pagado', pagado_at: new Date().toISOString() }).eq('id', id)
    loadBalancesRest()
  }

  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'restaurantes', label: 'Balance Restaurantes' },
    { id: 'facturas', label: 'Facturas' },
    { id: 'movimientos', label: 'Movimientos' },
  ]

  return (
    <div>
      <h1 style={{ ...ds.h1, marginBottom: 20 }}>Finanzas</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...ds.filterBtn,
            background: tab === t.id ? '#FF6B2C' : 'rgba(255,255,255,0.08)',
            color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.5)',
            padding: '7px 16px', fontSize: 12,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <StatCard label="Comisiones totales plataforma" value={`${resumen.comisionesTotal.toFixed(2)}EUR`} color="#F5F5F5" />
          <StatCard label="Pendiente de cobro" value={`${resumen.pendiente.toFixed(2)}EUR`} color="#FF6B2C" />
        </div>
      )}

      {tab === 'restaurantes' && (
        <div style={ds.table}>
          <div style={ds.tableHeader}>
            <span style={{ flex: 1 }}>Restaurante</span>
            <span style={{ width: 80 }}>Tarjeta</span>
            <span style={{ width: 80 }}>Efectivo</span>
            <span style={{ width: 90 }}>A favor</span>
            <span style={{ width: 90 }}>Debe</span>
            <span style={{ width: 90 }}>Balance</span>
            <span style={{ width: 80 }}>Estado</span>
            <span style={{ width: 70 }}></span>
          </div>
          {balancesRest.map(b => (
            <div key={b.id} style={ds.tableRow}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{b.establecimientos?.nombre || '-'}</span>
              <span style={{ width: 80, fontSize: 12 }}>{b.pedidos_tarjeta}</span>
              <span style={{ width: 80, fontSize: 12 }}>{b.pedidos_efectivo}</span>
              <span style={{ width: 90, fontSize: 12, color: '#F5F5F5' }}>{b.a_favor_restaurante?.toFixed(2)}EUR</span>
              <span style={{ width: 90, fontSize: 12, color: '#EF4444' }}>{b.debe_restaurante?.toFixed(2)}EUR</span>
              <span style={{ width: 90, fontSize: 12, fontWeight: 700, color: b.balance_neto >= 0 ? '#F5F5F5' : '#EF4444' }}>{b.balance_neto?.toFixed(2)}EUR</span>
              <span style={{ width: 80 }}>
                <span style={{ ...ds.badge, background: b.estado === 'pagado' ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.15)', color: b.estado === 'pagado' ? '#4ADE80' : '#FBBF24' }}>{b.estado}</span>
              </span>
              <span style={{ width: 70 }}>
                {b.estado === 'pendiente' && <button onClick={() => marcarPagado('balances_restaurante', b.id)} style={styles.payBtn}>Pagar</button>}
              </span>
            </div>
          ))}
          {balancesRest.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin balances</div>}
        </div>
      )}

      {tab === 'facturas' && (
        <div style={ds.table}>
          <div style={ds.tableHeader}>
            <span style={{ width: 120 }}>Factura</span>
            <span style={{ flex: 1 }}>Restaurante</span>
            <span style={{ width: 100 }}>Semana</span>
            <span style={{ width: 50 }}>Ped.</span>
            <span style={{ width: 80 }}>Comisiones</span>
            <span style={{ width: 70 }}>Envíos</span>
            <span style={{ width: 80 }}>Total</span>
            <span style={{ width: 70 }}>Estado</span>
            <span style={{ width: 60 }}></span>
          </div>
          {facturas.map(f => (
            <div key={f.id} style={ds.tableRow}>
              <span style={{ width: 120, fontSize: 11, fontWeight: 700, color: '#FF6B2C' }}>{f.numero_factura || '—'}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>{f.establecimientos?.nombre || '—'}</span>
              <span style={{ width: 100, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{f.semana_inicio?.slice(5)}<br/>{f.semana_fin?.slice(5)}</span>
              <span style={{ width: 50, fontSize: 12 }}>{f.pedidos_entregados}/{f.total_pedidos}</span>
              <span style={{ width: 80, fontSize: 12 }}>{f.total_comisiones?.toFixed(2)}€</span>
              <span style={{ width: 70, fontSize: 12 }}>{f.total_envios?.toFixed(2)}€</span>
              <span style={{ width: 80, fontSize: 12, fontWeight: 700, color: '#F5F5F5' }}>{f.total_ganado?.toFixed(2)}€</span>
              <span style={{ width: 70 }}>
                <span style={{ ...ds.badge, background: f.estado === 'pagado' ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.15)', color: f.estado === 'pagado' ? '#4ADE80' : '#FBBF24' }}>{f.estado}</span>
              </span>
              <span style={{ width: 60 }}>
                {f.estado === 'pendiente' && <button onClick={() => marcarFacturaPagada(f.id)} style={styles.payBtn}>Pagar</button>}
              </span>
            </div>
          ))}
          {facturas.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin facturas generadas</div>}
        </div>
      )}

      {tab === 'movimientos' && (
        <div style={ds.table}>
          <div style={ds.tableHeader}>
            <span style={{ width: 140 }}>Tipo</span>
            <span style={{ width: 100 }}>Monto</span>
            <span style={{ flex: 1 }}>Descripcion</span>
            <span style={{ width: 100 }}>Referencia</span>
            <span style={{ width: 140 }}>Fecha</span>
          </div>
          {movimientos.map(m => {
            const tipoColor = { entrada_tarjeta: '#F5F5F5', pago_restaurante: '#FF6B2C', cobro_comision: '#FF6B2C' }
            return (
              <div key={m.id} style={ds.tableRow}>
                <span style={{ width: 140 }}><span style={{ ...ds.badge, background: (tipoColor[m.tipo] || '#6B7280') + '15', color: tipoColor[m.tipo] || '#6B7280' }}>{m.tipo?.replace('_', ' ')}</span></span>
                <span style={{ width: 100, fontSize: 13, fontWeight: 700 }}>{m.monto?.toFixed(2)}EUR</span>
                <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{m.descripcion || '-'}</span>
                <span style={{ width: 100, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{m.referencia || '-'}</span>
                <span style={{ width: 140, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{new Date(m.created_at).toLocaleString('es-ES')}</span>
              </div>
            )
          })}
          {movimientos.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin movimientos</div>}
        </div>
      )}
    </div>
  )
}

const styles = {
  payBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: 'rgba(255,255,255,0.06)', color: '#4ADE80' },
}
