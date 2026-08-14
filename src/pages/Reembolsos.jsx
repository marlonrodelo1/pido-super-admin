import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { RotateCcw, CheckCircle, Clock, AlertTriangle, CreditCard, Search } from 'lucide-react'
import { Card, Chip, GlossyBtn, PillTabs, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { toast, confirmar } from '../App'

// Anchos de columna compartidos entre cabecera y filas: si se escriben dos
// veces a ojo, la cabecera y el contenido dejan de cuadrar al primer retoque.
const COL = {
  cod: { width: 104, flexShrink: 0 },
  nom: { flex: '2 1 170px', minWidth: 0 },
  tot: { width: 96, flexShrink: 0, textAlign: 'right' },
  est: { flex: '1 1 136px', minWidth: 0 },
  fec: { flex: '1 1 104px', minWidth: 0 },
  acc: { flex: '1.3 1 150px', minWidth: 0 },
}

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
      // La edge (v12+) exige el JWT del superadmin (auth.getUser + check rol).
      // Con el anon key devolvía 401 invalid_auth y el botón quedaba roto.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast('Sesión caducada. Vuelve a iniciar sesión.', 'error')
        setProcesando(null)
        return
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear_reembolso_stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pedido_id: pedidoId }),
      })
      const data = await res.json()

      if (data.success) {
        toast(`Reembolso procesado: ${fmtEUR(data.monto_reembolsado)} devueltos al cliente.`)
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
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Reembolsos</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Devoluciones de pedidos cancelados que se pagaron con tarjeta. El dinero sale de la cuenta Stripe.
          </div>
        </div>
      </div>

      {/* Cifras */}
      <div className="ds-cards" style={{ marginBottom: 20 }}>
        <StatCard
          label="Pendientes de reembolso"
          value={stats.pendientes}
          sub="Esperando a que los proceses"
          tone="terracotta"
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Reembolsos procesados"
          value={stats.procesados}
          sub="Ya devueltos al cliente"
          tone="sage"
          icon={<CheckCircle size={16} />}
        />
        <StatCard
          label="Total reembolsado"
          value={fmtEUR(stats.totalReembolsado)}
          sub="Salido de la cuenta Stripe"
          icon={<CreditCard size={16} />}
        />
      </div>

      {/* Filtros y búsqueda */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Los recuentos salen de `stats`, que ya está cargado: no se consulta nada extra */}
        <PillTabs
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'pendientes', label: 'Pendientes', count: stats.pendientes },
            { value: 'procesados', label: 'Procesados', count: stats.procesados },
            { value: 'todos', label: 'Todos', count: stats.pendientes + stats.procesados },
          ]}
        />
        <div style={{ flex: 1, minWidth: 8 }} />
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.textFaint, pointerEvents: 'none' }} />
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por código o restaurante…"
            style={{ ...ds.input, paddingLeft: 34 }}
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : pedidosFiltrados.length === 0 ? (
        <Card pad={0}>
          <Vacio
            icon={<RotateCcw size={30} />}
            titulo={filtro === 'pendientes' ? 'No hay reembolsos pendientes' : busqueda ? 'Ningún reembolso coincide' : 'Todavía no hay reembolsos'}
            texto={
              busqueda
                ? 'Prueba con otro código de pedido o con el nombre del restaurante.'
                : filtro === 'pendientes'
                  ? 'Aquí aparecen los pedidos cancelados pagados con tarjeta que aún no se han devuelto.'
                  : 'Cuando canceles un pedido pagado con tarjeta, aparecerá en esta lista.'
            }
          />
        </Card>
      ) : (
        <div className="ds-table-stack" style={ds.table}>
          <div className="ds-th" style={ds.tableHeader}>
            <span style={COL.cod}>Código</span>
            <span style={COL.nom}>Restaurante</span>
            <span style={COL.tot}>Total</span>
            <span style={COL.est}>Reembolso</span>
            <span data-tablet-sm-hide="true" style={COL.fec}>Cuándo</span>
            <span style={{ ...COL.acc, textAlign: 'right' }}>Acción</span>
          </div>

          {pedidosFiltrados.map(p => {
            const reembolsado = !!p.stripe_refund_id
            const sinPago = !reembolsado && !p.stripe_payment_id
            return (
              <div
                key={p.id}
                className="ds-row-touch"
                style={{
                  ...ds.tableRow,
                  // Tinte muy suave para lo que sigue pendiente de devolver
                  background: reembolsado ? colors.surface : colors.cream,
                }}
              >
                <span data-col="cod" style={{ ...COL.cod, ...type.mono, fontSize: 13, color: colors.ink }}>
                  {p.codigo}
                </span>

                <span data-col="nom" style={COL.nom}>
                  <span style={{ ...type.label, fontWeight: 600, color: colors.text, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.establecimientos?.nombre || '—'}
                  </span>
                  {p.motivo_cancelacion && (
                    <span style={{ ...type.caption, letterSpacing: 0, color: colors.textMute, display: 'block', marginTop: 2 }}>
                      {p.motivo_cancelacion}
                    </span>
                  )}
                </span>

                <span data-col="tot" style={{ ...COL.tot, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEUR(p.total)}
                </span>

                {/* Tres situaciones distintas, tres etiquetas distintas: devuelto,
                    pendiente de devolver y "no hay pago que devolver". */}
                <span data-col="est" style={COL.est}>
                  {reembolsado ? (
                    <Chip tono="sage" dot>Reembolsado</Chip>
                  ) : sinPago ? (
                    <Chip tono="danger" title="El cobro nunca llegó a completarse en Stripe, así que no hay importe que devolver.">
                      <AlertTriangle size={12} /> Sin ID de pago
                    </Chip>
                  ) : (
                    <Chip tono="warning" dot>Pendiente</Chip>
                  )}
                </span>

                <span data-col="fec" data-tablet-sm-hide="true" style={{ ...COL.fec, ...type.label, color: colors.textMute }}>
                  {reembolsado ? tiempoDesde(p.reembolsado_at) : tiempoDesde(p.cancelado_at)}
                </span>

                <span data-col="acc" style={{ ...COL.acc, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                  {reembolsado ? (
                    <span style={{ ...type.label, color: colors.onSageSoft, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEUR(p.monto_reembolsado)} devueltos
                    </span>
                  ) : sinPago ? (
                    <span style={{ ...type.label, color: colors.textMute }}>No reembolsable</span>
                  ) : (
                    <GlossyBtn
                      accent
                      size="sm"
                      onClick={() => procesarReembolso(p.id)}
                      disabled={procesando === p.id}
                      title={`Devolver ${fmtEUR(p.total)} al cliente del pedido ${p.codigo}`}
                      style={{ opacity: procesando === p.id ? 0.6 : 1 }}
                    >
                      <RotateCcw size={14} />
                      {procesando === p.id ? 'Procesando…' : 'Reembolsar'}
                    </GlossyBtn>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Info */}
      <Card pad={16} style={{ marginTop: 20, background: colors.infoSoft, borderColor: colors.info, borderRadius: radius.md }}>
        <div style={{ ...type.label, fontWeight: 700, color: colors.onInfoSoft, marginBottom: 8 }}>
          Información importante
        </div>
        <ul style={{ ...type.body, color: colors.onInfoSoft, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          <li>Los reembolsos se procesan a través de Stripe y pueden tardar 5-10 días hábiles en reflejarse en la tarjeta del cliente.</li>
          <li>Al procesar un reembolso, se devuelve el importe completo del pedido y se notifica automáticamente al cliente.</li>
          <li>Los pedidos sin «ID de pago» no se pueden reembolsar (el cobro no llegó a completarse).</li>
          <li>Cada reembolso queda registrado en los movimientos de cuenta.</li>
        </ul>
      </Card>
    </div>
  )
}
