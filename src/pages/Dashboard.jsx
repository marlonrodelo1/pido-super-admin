import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'

function StatCard({ label, value, sub, accent = colors.ink }) {
  return (
    <div style={{ ...ds.card, padding: '16px 18px' }}>
      <div style={{
        fontSize: 10.5,
        color: colors.textMute,
        fontWeight: 700,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>{label}</div>
      <div style={{
        fontSize: 26,
        fontWeight: 700,
        color: accent,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: colors.textMute, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const fmtEUR = (n) => (Number(n) || 0).toLocaleString('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export default function Dashboard() {
  const [stats, setStats] = useState({ pedidos: 0, entregados: 0, gmv: 0, comisiones: 0, ticket: 0, usuarios: 0, establecimientos: 0, establecimientosActivos: 0 })
  const [periodo, setPeriodo] = useState('hoy')
  const [recientes, setRecientes] = useState([])

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
  }

  const canalLabel = (o) => {
    const map = { tienda_publica: 'Tienda', pido: 'App', app: 'App', marketplace_socio: 'Socio', socio: 'Socio', telefonico: 'Teléfono' }
    return map[o] || (o ? o.charAt(0).toUpperCase() + o.slice(1) : '—')
  }

  const estadoChip = (estado) => {
    const map = {
      nuevo:      { bg: colors.terracottaSoft, color: colors.terracotta2 },
      aceptado:   { bg: colors.terracottaSoft, color: colors.terracotta2 },
      preparando: { bg: colors.warningSoft,    color: colors.warning },
      listo:      { bg: colors.infoSoft,       color: colors.info },
      recogido:   { bg: colors.infoSoft,       color: colors.info },
      en_camino:  { bg: colors.terracottaSoft, color: colors.terracotta2 },
      entregado:  { bg: colors.sageSoft,       color: colors.sage2 },
      cancelado:  { bg: colors.dangerSoft,     color: colors.danger },
      fallido:    { bg: colors.dangerSoft,     color: colors.danger },
    }
    return map[estado] || { bg: colors.cream2, color: colors.stone }
  }

  // Pills periodo
  const pillStyles = (active) => ({
    padding: '6px 14px',
    height: 30,
    borderRadius: 999,
    border: `1px solid ${active ? colors.ink : colors.border}`,
    background: active ? colors.ink : colors.surface,
    color: active ? colors.cream : colors.textDim,
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'all 0.12s',
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Dashboard</h1>
          <div style={{ fontSize: 13, color: colors.textMute }}>Visión general de Pidoo a día de hoy</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'hoy', label: 'Hoy' },
            { id: 'semana', label: 'Semana' },
            { id: 'mes', label: 'Mes' },
          ].map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} style={pillStyles(periodo === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 28,
      }}>
        <StatCard label="Pedidos"          value={stats.pedidos} sub={periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'últimos 7 días' : 'último mes'} accent={colors.ink} />
        <StatCard label="Entregados"       value={stats.entregados} sub={`de ${stats.pedidos} pedidos`} accent={colors.ink} />
        <StatCard label="GMV entregado"    value={fmtEUR(stats.gmv)} sub="valor total entregado" accent={colors.terracotta} />
        <StatCard label="Comisión Pidoo (10%)" value={fmtEUR(stats.comisiones)} sub="sobre subtotal" accent={colors.sage2} />
        <StatCard label="Ticket medio"     value={fmtEUR(stats.ticket)} accent={colors.ink} />
        <StatCard label="Usuarios"         value={stats.usuarios} accent={colors.ink} />
        <StatCard label="Restaurantes activos" value={stats.establecimientosActivos} sub={`de ${stats.establecimientos} totales`} accent={colors.ink} />
      </div>

      <h2 style={ds.h2}>Pedidos recientes</h2>
      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 100, flexShrink: 0 }}>Código</span>
          <span style={{ width: 80, flexShrink: 0 }}>Total</span>
          <span style={{ flex: '1 1 96px', minWidth: 0 }}>Estado</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1 1 84px', minWidth: 0 }}>Pago</span>
          <span data-tablet-hide="true" style={{ flex: '1 1 84px', minWidth: 0 }}>Origen</span>
          <span style={{ flex: '1 1 140px', minWidth: 0 }}>Fecha</span>
        </div>
        {recientes.map(p => {
          const chip = estadoChip(p.estado)
          return (
            <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
              <span style={{ width: 100, flexShrink: 0, fontWeight: 700, fontSize: 12, color: colors.ink, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{p.codigo}</span>
              <span style={{ width: 80, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: colors.ink }}>{p.total?.toFixed(2)}€</span>
              <span style={{ flex: '1 1 96px', minWidth: 0 }}>
                <span style={{ ...ds.badge, background: chip.bg, color: chip.color }}>{p.estado}</span>
              </span>
              <span data-tablet-sm-hide="true" style={{ flex: '1 1 84px', minWidth: 0 }}>
                <span style={{ ...ds.badge, background: p.metodo_pago === 'tarjeta' ? colors.infoSoft : colors.warningSoft, color: p.metodo_pago === 'tarjeta' ? colors.info : colors.warning }}>
                  {p.metodo_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
                </span>
              </span>
              <span data-tablet-hide="true" style={{ flex: '1 1 84px', minWidth: 0 }}>
                <span style={{ ...ds.badge, background: colors.terracottaSoft, color: colors.terracotta2 }}>
                  {p.origen_pedido === 'telefonico' ? 'Teléfono' : p.origen_pedido === 'marketplace_socio' ? 'Socio' : 'App'}
                </span>
              </span>
              <span style={{ flex: '1 1 140px', minWidth: 0, fontSize: 11.5, color: colors.textMute }}>{new Date(p.created_at).toLocaleString('es-ES')}</span>
            </div>
          )
        })}
        {recientes.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Sin pedidos</div>}
      </div>
    </div>
  )
}
