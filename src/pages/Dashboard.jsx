import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type } from '../lib/darkStyles'
import { StatCard, EstadoBadge, Chip, Segmented, Vacio, fmtEUR } from '../lib/ui'

export default function Dashboard() {
  const [stats, setStats] = useState({ pedidos: 0, entregados: 0, gmv: 0, comisiones: 0, ticket: 0, usuarios: 0, establecimientos: 0, establecimientosActivos: 0 })
  const [periodo, setPeriodo] = useState('hoy')
  const [recientes, setRecientes] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => { loadStats(); loadRecientes() }, [periodo])

  async function loadStats() {
    const now = new Date()
    let desde
    if (periodo === 'hoy') desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    else if (periodo === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 7); desde = d.toISOString() }
    else { const d = new Date(now); d.setMonth(d.getMonth() - 1); desde = d.toISOString() }

    const [pedidosRes, usersRes, estRes, estActivosRes, configRes] = await Promise.all([
      supabase.from('pedidos').select('total, subtotal, estado').gte('created_at', desde),
      supabase.from('usuarios').select('id', { count: 'exact', head: true }),
      supabase.from('establecimientos').select('id', { count: 'exact', head: true }),
      supabase.from('establecimientos').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('configuracion_plataforma').select('valor').eq('clave', 'comision_plataforma').maybeSingle(),
    ])
    const pedidos = pedidosRes.data || []
    const entregados = pedidos.filter(p => p.estado === 'entregado')
    // GMV = valor total de pedidos entregados (incluye envío + propina)
    const gmv = entregados.reduce((s, p) => s + (p.total || 0), 0)
    // La comisión de Pidoo es el 10% del SUBTOTAL (NO del total: el envío y la propina no comisionan)
    const baseComision = entregados.reduce((s, p) => s + (p.subtotal || 0), 0)
    const pctComision = parseFloat(configRes.data?.valor || '10') / 100
    setStats({
      pedidos: pedidos.length,
      entregados: entregados.length,
      gmv,
      comisiones: baseComision * pctComision,
      ticket: entregados.length ? gmv / entregados.length : 0,
      usuarios: usersRes.count || 0,
      establecimientos: estRes.count || 0,
      establecimientosActivos: estActivosRes.count || 0,
    })
  }

  async function loadRecientes() {
    const { data } = await supabase.from('pedidos').select('id, codigo, total, estado, metodo_pago, canal, origen_pedido, created_at').order('created_at', { ascending: false }).limit(10)
    setRecientes(data || [])
    setCargando(false)
  }

  const canalLabel = (o) => {
    const map = { tienda_publica: 'Tienda', pido: 'App', app: 'App', marketplace_socio: 'Socio', socio: 'Socio', telefonico: 'Teléfono' }
    return map[o] || (o ? o.charAt(0).toUpperCase() + o.slice(1) : '—')
  }

  const fecha = (iso) => {
    const d = new Date(iso)
    const hoy = new Date()
    const mismoDia = d.toDateString() === hoy.toDateString()
    return mismoDia
      ? `Hoy · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
      : d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const subPeriodo = periodo === 'hoy' ? 'Hoy' : periodo === 'semana' ? 'Últimos 7 días' : 'Último mes'

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Dashboard</h1>
          <div style={{ ...type.body, color: colors.textMute }}>Visión general de Pidoo a día de hoy</div>
        </div>
        <Segmented
          value={periodo}
          onChange={setPeriodo}
          options={[
            { value: 'hoy', label: 'Hoy' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mes' },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 32 }}>
        <StatCard label="Pedidos"              value={stats.pedidos}            sub={subPeriodo} />
        <StatCard label="Entregados"           value={stats.entregados}         sub={`de ${stats.pedidos} pedidos`} />
        <StatCard label="GMV entregado"        value={fmtEUR(stats.gmv)}        sub="Valor total entregado" tone="terracotta" />
        <StatCard label="Comisión Pidoo (10%)" value={fmtEUR(stats.comisiones)} sub="Sobre subtotal" tone="sage" />
        <StatCard label="Ticket medio"         value={fmtEUR(stats.ticket)}     sub="Por pedido entregado" />
        <StatCard label="Usuarios"             value={stats.usuarios}           sub="Registrados en total" />
        <StatCard label="Restaurantes activos" value={stats.establecimientosActivos} sub={`de ${stats.establecimientos} totales`} />
      </div>

      <h2 style={ds.h2}>Pedidos recientes</h2>
      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 104, flexShrink: 0 }}>Código</span>
          <span style={{ width: 88, flexShrink: 0 }}>Total</span>
          <span style={{ flex: '1 1 120px', minWidth: 0 }}>Estado</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1 1 92px', minWidth: 0 }}>Pago</span>
          <span data-tablet-hide="true" style={{ flex: '1 1 92px', minWidth: 0 }}>Origen</span>
          <span style={{ flex: '1 1 132px', minWidth: 0 }}>Fecha</span>
        </div>

        {recientes.map(p => (
          <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
            <span style={{ ...type.mono, width: 104, flexShrink: 0, fontSize: 13, color: colors.ink }}>{p.codigo}</span>
            <span style={{ width: 88, flexShrink: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(p.total)}</span>
            <span style={{ flex: '1 1 120px', minWidth: 0 }}>
              <EstadoBadge estado={p.estado} />
            </span>
            <span data-tablet-sm-hide="true" style={{ flex: '1 1 92px', minWidth: 0 }}>
              <Chip tono={p.metodo_pago === 'tarjeta' ? 'info' : 'warning'}>
                {p.metodo_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
              </Chip>
            </span>
            <span data-tablet-hide="true" style={{ flex: '1 1 92px', minWidth: 0 }}>
              <Chip tono="neutral">{canalLabel(p.origen_pedido)}</Chip>
            </span>
            <span style={{ flex: '1 1 132px', minWidth: 0, ...type.label, color: colors.textMute }}>{fecha(p.created_at)}</span>
          </div>
        ))}

        {recientes.length === 0 && (
          cargando
            ? <div style={{ padding: 32, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando pedidos…</div>
            : <Vacio titulo="Sin pedidos todavía" texto="Aquí aparecerán los diez últimos pedidos en cuanto entre el primero." />
        )}
      </div>
    </div>
  )
}
