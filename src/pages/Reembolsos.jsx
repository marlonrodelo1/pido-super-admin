import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { RotateCcw, CheckCircle, Clock, AlertTriangle, CreditCard, Search } from 'lucide-react'
import { toast, confirmar } from '../App'

export default function Reembolsos() {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendientes') // pendientes | procesados | todos
  const [procesando, setProcesando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [stats, setStats] = useState({ pendientes: 0, procesados: 0, totalReembolsado: 0 })

  useEffect(() => { cargarPedidos() }, [filtro])

  async function cargarPedidos() {
    setLoading(true)

    let query = supabase
      .from('pedidos')
      .select('id, codigo, estado, metodo_pago, total, subtotal, coste_envio, stripe_payment_id, stripe_refund_id, reembolsado_at, monto_reembolsado, motivo_cancelacion, cancelado_at, created_at, usuario_id, establecimientos(nombre)')
      .eq('metodo_pago', 'tarjeta')
      .in('estado', ['cancelado', 'fallido'])
      .order('cancelado_at', { ascending: false })

    if (filtro === 'pendientes') {
      query = query.is('stripe_refund_id', null)
    } else if (filtro === 'procesados') {
      query = query.not('stripe_refund_id', 'is', null)
    }

    const { data } = await query
    setPedidos(data || [])

    // Stats
    const { data: allCancelados } = await supabase
      .from('pedidos')
      .select('id, stripe_refund_id, monto_reembolsado')
      .eq('metodo_pago', 'tarjeta')
      .in('estado', ['cancelado', 'fallido'])

    const pend = (allCancelados || []).filter(p => !p.stripe_refund_id).length
    const proc = (allCancelados || []).filter(p => p.stripe_refund_id).length
    const totalR = (allCancelados || []).reduce((s, p) => s + (p.monto_reembolsado || 0), 0)
    setStats({ pendientes: pend, procesados: proc, totalReembolsado: totalR })

    setLoading(false)
  }

  async function procesarReembolso(pedidoId) {
    if (!(await confirmar('Vas a reembolsar el importe completo al cliente. El dinero saldra de la cuenta Stripe. ¿Continuar?'))) return

    setProcesando(pedidoId)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear_reembolso_stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pedido_id: pedidoId }),
      })
      const data = await res.json()

      if (data.success) {
        toast(`Reembolso procesado: ${data.monto_reembolsado?.toFixed(2)} EUR devueltos al cliente.`)
        cargarPedidos()
      } else {
        toast(data.error || data.message || 'No se pudo procesar el reembolso', 'error')
      }
    } catch (err) {
      toast('Error de conexion al procesar el reembolso', 'error')
    }
    setProcesando(null)
  }

  const pedidosFiltrados = pedidos.filter(p => {
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    return p.codigo?.toLowerCase().includes(q) || p.establecimientos?.nombre?.toLowerCase().includes(q)
  })

  const tiempoDesde = (fecha) => {
    if (!fecha) return '-'
    const diff = (Date.now() - new Date(fecha).getTime()) / 1000
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
    return `hace ${Math.floor(diff / 86400)}d`
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={ds.h1}>Reembolsos</h1>
          <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
            Gestiona los reembolsos de pedidos cancelados pagados con tarjeta
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ ...ds.card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={20} color="#FBBF24" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{stats.pendientes}</div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600 }}>Pendientes de reembolso</div>
          </div>
        </div>
        <div style={{ ...ds.card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={20} color='var(--c-text)' />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{stats.procesados}</div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600 }}>Reembolsos procesados</div>
          </div>
        </div>
        <div style={{ ...ds.card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--c-danger-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={20} color="#EF4444" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{stats.totalReembolsado.toFixed(2)} EUR</div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600 }}>Total reembolsado</div>
          </div>
        </div>
      </div>

      {/* Filtros y busqueda */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { id: 'pendientes', label: 'Pendientes', color: 'var(--c-warning)' },
          { id: 'procesados', label: 'Procesados', color: 'var(--c-text)' },
          { id: 'todos', label: 'Todos', color: '#FF6B2C' },
        ].map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)} style={{
            ...ds.filterBtn,
            background: filtro === f.id ? f.color : 'var(--c-surface2)',
            color: filtro === f.id ? '#fff' : 'var(--c-muted)',
          }}>{f.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-muted)' }} />
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por codigo o restaurante..."
            style={{ ...ds.input, paddingLeft: 30, width: 260 }}
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-muted)' }}>Cargando...</div>
      ) : pedidosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-muted)' }}>
          <RotateCcw size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {filtro === 'pendientes' ? 'No hay reembolsos pendientes' : 'No hay reembolsos'}
          </div>
        </div>
      ) : (
        <div style={ds.table}>
          {/* Header */}
          <div style={{ ...ds.tableHeader, gridTemplateColumns: '1fr' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 90px 90px 140px', width: '100%', gap: 12 }}>
              <span>Codigo</span>
              <span>Restaurante</span>
              <span>Total</span>
              <span>Estado</span>
              <span>Cuando</span>
              <span style={{ textAlign: 'right' }}>Accion</span>
            </div>
          </div>

          {/* Rows */}
          {pedidosFiltrados.map(p => (
            <div key={p.id} style={{
              ...ds.tableRow,
              background: !p.stripe_refund_id ? 'rgba(251,191,36,0.03)' : 'transparent',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 90px 90px 140px', width: '100%', gap: 12, alignItems: 'center' }}>
                {/* Codigo */}
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)' }}>{p.codigo}</span>
                </div>

                {/* Restaurante + motivo */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                    {p.establecimientos?.nombre || '-'}
                  </div>
                  {p.motivo_cancelacion && (
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2, lineHeight: 1.3 }}>
                      {p.motivo_cancelacion}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-text)' }}>
                  {p.total?.toFixed(2)} EUR
                </div>

                {/* Estado reembolso */}
                <div>
                  {p.stripe_refund_id ? (
                    <span style={{ ...ds.badge, background: 'var(--c-surface2)', color: 'var(--c-text)' }}>
                      Reembolsado
                    </span>
                  ) : (
                    <span style={{ ...ds.badge, background: 'var(--c-warning-soft)', color: 'var(--c-warning)' }}>
                      Pendiente
                    </span>
                  )}
                </div>

                {/* Tiempo */}
                <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>
                  {p.stripe_refund_id
                    ? tiempoDesde(p.reembolsado_at)
                    : tiempoDesde(p.cancelado_at)
                  }
                </div>

                {/* Accion */}
                <div style={{ textAlign: 'right' }}>
                  {p.stripe_refund_id ? (
                    <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>
                      {p.monto_reembolsado?.toFixed(2)} EUR devueltos
                    </div>
                  ) : !p.stripe_payment_id ? (
                    <span style={{ ...ds.badge, background: 'var(--c-danger-soft)', color: 'var(--c-danger)' }}>
                      <AlertTriangle size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Sin ID de pago
                    </span>
                  ) : (
                    <button
                      onClick={() => procesarReembolso(p.id)}
                      disabled={procesando === p.id}
                      style={{
                        ...ds.primaryBtn,
                        padding: '8px 16px', fontSize: 12,
                        opacity: procesando === p.id ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginLeft: 'auto',
                      }}
                    >
                      <RotateCcw size={13} />
                      {procesando === p.id ? 'Procesando...' : 'Reembolsar'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div style={{
        marginTop: 20, padding: '14px 18px', borderRadius: 12,
        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#FF6B2C', marginBottom: 6 }}>Informacion importante</div>
        <ul style={{ fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.8, margin: 0, paddingLeft: 16 }}>
          <li>Los reembolsos se procesan a traves de Stripe y pueden tardar 5-10 dias habiles en reflejarse en la tarjeta del cliente.</li>
          <li>Al procesar un reembolso, se devuelve el importe completo del pedido y se notifica automaticamente al cliente.</li>
          <li>Los pedidos sin "ID de pago" no se pueden reembolsar (el cobro no llego a completarse).</li>
          <li>Cada reembolso queda registrado en los movimientos de cuenta.</li>
        </ul>
      </div>
    </div>
  )
}
