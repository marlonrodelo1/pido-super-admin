import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { toast } from '../App'

function StatCard({ label, value, color = 'var(--c-text)' }) {
  return (
    <div style={ds.card}>
      <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
    </div>
  )
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rmrbxrabngdmpgpfmjbo.supabase.co'
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const fmtEUR = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const connectBadge = (status) => {
  switch (status) {
    case 'activa':     return { bg: 'var(--c-success-soft)', color: 'var(--c-success)', label: 'Activa' }
    case 'onboarding': return { bg: 'var(--c-warning-soft)', color: 'var(--c-warning)', label: 'Onboarding' }
    case 'suspendida': return { bg: 'var(--c-danger-soft)',  color: 'var(--c-danger)',  label: 'Suspendida' }
    case 'rechazada':  return { bg: 'var(--c-danger-soft)',  color: 'var(--c-danger)',  label: 'Rechazada' }
    case 'pendiente':  return { bg: 'var(--c-warning-soft)', color: 'var(--c-warning)', label: 'Pendiente' }
    default:           return { bg: 'var(--c-surface2)',     color: 'var(--c-muted)',   label: 'Sin conectar' }
  }
}

export default function Finanzas() {
  const [tab, setTab] = useState('resumen')
  const [balancesRest, setBalancesRest] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [resumen, setResumen] = useState({ comisionesTotal: 0, pagadoRest: 0, pendiente: 0 })
  const [facturas, setFacturas] = useState([])
  const [riderFacturas, setRiderFacturas] = useState([])
  const [riderFiltroEstado, setRiderFiltroEstado] = useState('pendiente')
  const [riderFiltroSemana, setRiderFiltroSemana] = useState('')
  const [riderStats, setRiderStats] = useState({ pendiente: 0, pagadoMes: 0, activos: 0 })
  const [pagoModal, setPagoModal] = useState(null)
  const [pagoRef, setPagoRef] = useState('')
  const [pagoSaving, setPagoSaving] = useState(false)
  // Cuotas tiendas (plan 39€/mes)
  const [cuotas, setCuotas] = useState([])
  const [cuotasStats, setCuotasStats] = useState({ activas: 0, mrr: 0, churnMes: 0, pastDue: 0 })
  // Liquidaciones — Stripe Connect
  const [connectRows, setConnectRows] = useState([])
  const [connectFiltroEstado, setConnectFiltroEstado] = useState('todos')
  const [connectFiltroBalance, setConnectFiltroBalance] = useState(false)
  const [connectFiltroDeuda, setConnectFiltroDeuda] = useState(false)
  const [connectExpanded, setConnectExpanded] = useState(null)
  const [connectHistorico, setConnectHistorico] = useState({})
  const [limiteDraft, setLimiteDraft] = useState({})
  const [liqAllModal, setLiqAllModal] = useState(false)
  const [liqRunning, setLiqRunning] = useState(false)
  const [dryRunResult, setDryRunResult] = useState(null)
  const [liquidacionesGlobales, setLiquidacionesGlobales] = useState([])

  useEffect(() => {
    loadResumen()
    loadBalancesRest()
    loadMovimientos()
    loadFacturas()
    loadRiderFacturas()
    loadRiderStats()
    loadCuotas()
    loadConnectRows()
    loadLiquidacionesGlobales()
  }, [])

  async function callLiquidacion({ establecimiento_id = null, dry_run = false } = {}) {
    const params = new URLSearchParams()
    if (establecimiento_id) params.set('establecimiento_id', establecimiento_id)
    if (dry_run) params.set('dry_run', '1')
    const qs = params.toString() ? `?${params.toString()}` : ''
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || SUPABASE_ANON
    const res = await fetch(`${SUPABASE_URL}/functions/v1/liquidacion-semanal${qs}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify({}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`)
    return body
  }

  async function loadConnectRows() {
    const { data } = await supabase.from('establecimientos')
      .select('id, nombre, slug, activo, stripe_connect_account_id, stripe_connect_status, balance_card_acumulado, deuda_cash_acumulada, cash_bloqueado_por_deuda, limite_deuda_cash, ultima_liquidacion_at')
      .eq('activo', true)
      .order('nombre', { ascending: true })
    setConnectRows(data || [])
  }

  async function loadLiquidacionesGlobales() {
    const { data } = await supabase.from('facturas_semanales')
      .select('*, establecimientos(nombre, slug)')
      .order('created_at', { ascending: false })
      .limit(200)
    setLiquidacionesGlobales(data || [])
  }

  async function loadHistoricoEst(id) {
    const { data } = await supabase.from('facturas_semanales')
      .select('*')
      .eq('establecimiento_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
    setConnectHistorico(prev => ({ ...prev, [id]: data || [] }))
  }

  function toggleExpand(id) {
    if (connectExpanded === id) {
      setConnectExpanded(null)
    } else {
      setConnectExpanded(id)
      if (!connectHistorico[id]) loadHistoricoEst(id)
    }
  }

  async function guardarLimiteDeuda(id) {
    const v = limiteDraft[id]
    const parsed = parseFloat(v)
    if (isNaN(parsed) || parsed < 0) return toast('Valor inválido', 'error')
    const { error } = await supabase.from('establecimientos').update({ limite_deuda_cash: parsed }).eq('id', id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Límite actualizado')
    setLimiteDraft(prev => { const n = { ...prev }; delete n[id]; return n })
    loadConnectRows()
  }

  async function forzarLiquidacion(id, nombre) {
    if (!window.confirm(`¿Forzar liquidación ahora para "${nombre}"?`)) return
    try {
      setLiqRunning(true)
      const body = await callLiquidacion({ establecimiento_id: id })
      toast(`Liquidación ejecutada: ${body?.processed ?? 1} restaurante`)
      loadConnectRows()
      loadLiquidacionesGlobales()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setLiqRunning(false)
    }
  }

  async function ejecutarLiquidacionGlobal() {
    try {
      setLiqRunning(true)
      const body = await callLiquidacion({})
      toast(`Liquidación semanal ejecutada: ${body?.processed ?? '?'} restaurantes`)
      setLiqAllModal(false)
      loadConnectRows()
      loadLiquidacionesGlobales()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setLiqRunning(false)
    }
  }

  async function ejecutarDryRun() {
    try {
      setLiqRunning(true)
      const body = await callLiquidacion({ dry_run: true })
      setDryRunResult(body)
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setLiqRunning(false)
    }
  }

  async function loadCuotas() {
    const { data } = await supabase.from('suscripciones_tienda')
      .select('*, establecimientos(nombre, slug, plan_pro)')
      .order('created_at', { ascending: false })
    const arr = data || []
    setCuotas(arr)
    const activas = arr.filter(s => s.estado === 'active').length
    const pastDue = arr.filter(s => s.estado === 'past_due' || s.estado === 'unpaid').length
    const mrr = activas * 39
    const now = new Date()
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const churnMes = arr.filter(s => s.estado === 'canceled' && s.updated_at && new Date(s.updated_at) >= startMonth).length
    setCuotasStats({ activas, mrr, churnMes, pastDue })
  }

  function exportCuotasCSV() {
    const headers = ['Restaurante', 'Slug', 'Estado', 'plan_pro', 'Fecha alta', 'Próximo pago', 'Monto', 'Intentos fallidos', 'Stripe sub id']
    const rows = cuotas.map(c => [
      (c.establecimientos?.nombre || '').replace(/;/g, ','),
      c.establecimientos?.slug || '',
      c.estado,
      c.establecimientos?.plan_pro ? 'sí' : 'no',
      c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '',
      c.fecha_proximo_pago ? new Date(c.fecha_proximo_pago).toISOString().slice(0, 10) : '',
      (c.monto_mensual || 39).toFixed(2),
      c.intentos_fallidos || 0,
      c.stripe_subscription_id || '',
    ].join(';'))
    const bom = '\uFEFF'
    const csv = bom + [headers.join(';'), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cuotas_tiendas_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function loadRiderFacturas() {
    const { data } = await supabase
      .from('rider_facturas_semanales')
      .select('*, rider_accounts(nombre, telefono, email)')
      .order('semana_inicio', { ascending: false })
      .limit(100)
    setRiderFacturas(data || [])
  }

  async function loadRiderStats() {
    const [{ data: pend }, { data: pag }, { data: riders }] = await Promise.all([
      supabase.from('rider_facturas_semanales').select('total_neto').eq('estado', 'pendiente'),
      supabase.from('rider_facturas_semanales').select('total_neto, pagado_at').eq('estado', 'pagado'),
      supabase.from('rider_accounts').select('id').eq('estado', 'activa'),
    ])
    const pendiente = (pend || []).reduce((s, r) => s + (r.total_neto || 0), 0)
    const now = new Date()
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const pagadoMes = (pag || [])
      .filter(r => r.pagado_at && new Date(r.pagado_at) >= startMonth)
      .reduce((s, r) => s + (r.total_neto || 0), 0)
    setRiderStats({ pendiente, pagadoMes, activos: (riders || []).length })
  }

  function abrirPago(f) {
    setPagoModal(f)
    setPagoRef('')
  }

  async function confirmarPago() {
    if (!pagoModal) return
    setPagoSaving(true)
    const now = new Date().toISOString()
    const ref = pagoRef.trim() || null
    const { error } = await supabase.from('rider_facturas_semanales').update({
      estado: 'pagado', pagado_at: now, referencia_pago: ref,
    }).eq('id', pagoModal.id)
    if (error) { setPagoSaving(false); return toast('Error: ' + error.message, 'error') }
    // Actualizar rider_earnings en el rango de la semana
    await supabase.from('rider_earnings').update({
      estado_pago: 'pagado', pagado_at: now, referencia_pago: ref,
    }).eq('rider_account_id', pagoModal.rider_account_id)
      .gte('created_at', pagoModal.semana_inicio)
      .lte('created_at', pagoModal.semana_fin + 'T23:59:59')
      .eq('estado_pago', 'pendiente')
    toast('Factura marcada como pagada')
    setPagoSaving(false)
    setPagoModal(null)
    loadRiderFacturas()
    loadRiderStats()
  }

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
    { id: 'connect', label: 'Connect restaurantes' },
    { id: 'liquidaciones', label: 'Histórico liquidaciones' },
    { id: 'restaurantes', label: 'Balance Restaurantes' },
    { id: 'facturas', label: 'Facturas' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'riders', label: 'Pagos a riders' },
    { id: 'cuotas', label: 'Cuotas tiendas' },
  ]

  // Filtrado y totales de Connect
  const connectFiltered = connectRows.filter(r => {
    if (connectFiltroEstado !== 'todos') {
      const s = r.stripe_connect_status || 'sin_conectar'
      if (connectFiltroEstado === 'sin_conectar' && r.stripe_connect_status) return false
      if (connectFiltroEstado !== 'sin_conectar' && s !== connectFiltroEstado) return false
    }
    if (connectFiltroDeuda && !((r.deuda_cash_acumulada || 0) > 0)) return false
    if (connectFiltroBalance && !((r.balance_card_acumulado || 0) > 0)) return false
    return true
  })

  const totales = connectRows.reduce((acc, r) => {
    const bal = Number(r.balance_card_acumulado || 0)
    const deu = Number(r.deuda_cash_acumulada || 0)
    acc.aPagar += bal
    acc.deudaCash += deu
    acc.neto += (bal - deu)
    return acc
  }, { aPagar: 0, deudaCash: 0, neto: 0 })

  const riderFiltered = riderFacturas.filter(f => {
    if (riderFiltroEstado !== 'todos' && f.estado !== riderFiltroEstado) return false
    if (riderFiltroSemana && f.semana_inicio !== riderFiltroSemana) return false
    return true
  })

  const semanasDisponibles = [...new Set(riderFacturas.map(f => f.semana_inicio).filter(Boolean))].sort().reverse()

  function fmtSemana(ini, fin) {
    if (!ini || !fin) return '—'
    const di = new Date(ini), df = new Date(fin)
    const f = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    return `${f(di)} - ${f(df)}`
  }

  return (
    <div>
      <h1 style={{ ...ds.h1, marginBottom: 20 }}>Finanzas</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...ds.filterBtn,
            background: tab === t.id ? '#FF6B2C' : 'var(--c-surface2)',
            color: tab === t.id ? '#fff' : 'var(--c-muted)',
            padding: '7px 16px', fontSize: 12,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <StatCard label="Comisiones totales plataforma" value={`${resumen.comisionesTotal.toFixed(2)}EUR`} color='var(--c-text)' />
          <StatCard label="Pendiente de cobro" value={`${resumen.pendiente.toFixed(2)}EUR`} color="#FF6B2C" />
        </div>
      )}

      {tab === 'connect' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="A pagar a restaurantes" value={fmtEUR(totales.aPagar)} color="#4ADE80" />
            <StatCard label="Pendiente de cobro (deuda cash)" value={fmtEUR(totales.deudaCash)} color="#F87171" />
            <StatCard label="Neto plataforma" value={fmtEUR(totales.neto)} color={totales.neto >= 0 ? 'var(--c-text)' : 'var(--c-danger)'} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={connectFiltroEstado} onChange={e => setConnectFiltroEstado(e.target.value)} style={{ ...ds.formInput, width: 180 }}>
              <option value="todos">Todos los estados</option>
              <option value="activa">Activa</option>
              <option value="onboarding">Onboarding</option>
              <option value="pendiente">Pendiente</option>
              <option value="suspendida">Suspendida</option>
              <option value="rechazada">Rechazada</option>
              <option value="sin_conectar">Sin conectar</option>
            </select>
            <label style={{ fontSize: 12, color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={connectFiltroDeuda} onChange={e => setConnectFiltroDeuda(e.target.checked)} />
              Solo con deuda &gt; 0
            </label>
            <label style={{ fontSize: 12, color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={connectFiltroBalance} onChange={e => setConnectFiltroBalance(e.target.checked)} />
              Solo con balance &gt; 0
            </label>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{connectFiltered.length} de {connectRows.length}</span>
          </div>

          <div style={ds.table}>
            <div style={ds.tableHeader}>
              <span style={{ flex: 1 }}>Restaurante</span>
              <span style={{ width: 110 }}>Connect</span>
              <span style={{ width: 90 }}>Balance card</span>
              <span style={{ width: 90 }}>Deuda cash</span>
              <span style={{ width: 90 }}>Neto</span>
              <span style={{ width: 150 }}>Límite deuda</span>
              <span style={{ width: 100 }}>Cash bloq.</span>
              <span style={{ width: 180, textAlign: 'right' }}>Acciones</span>
            </div>
            {connectFiltered.map(r => {
              const bal = Number(r.balance_card_acumulado || 0)
              const deu = Number(r.deuda_cash_acumulada || 0)
              const neto = bal - deu
              const badge = connectBadge(r.stripe_connect_status)
              const draft = limiteDraft[r.id]
              const limVal = draft !== undefined ? draft : (r.limite_deuda_cash ?? 150)
              const historico = connectHistorico[r.id] || []
              return (
                <div key={r.id} style={{ flexDirection: 'column' }}>
                  <div style={{ ...ds.tableRow, alignItems: 'center' }}>
                    <span style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{r.slug || r.id.slice(0, 8)}</div>
                    </span>
                    <span style={{ width: 110 }}>
                      <span style={{ ...ds.badge, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </span>
                    <span style={{ width: 90, fontSize: 12, color: 'var(--c-success)' }}>{fmtEUR(bal)}</span>
                    <span style={{ width: 90, fontSize: 12, color: 'var(--c-danger)' }}>{fmtEUR(deu)}</span>
                    <span style={{ width: 90, fontSize: 13, fontWeight: 700, color: neto >= 0 ? 'var(--c-success)' : 'var(--c-danger)' }}>{fmtEUR(neto)}</span>
                    <span style={{ width: 150, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="number"
                        value={limVal}
                        min={0}
                        step={10}
                        onChange={e => setLimiteDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                        style={{ ...ds.formInput, width: 72, padding: '4px 6px', fontSize: 12 }}
                      />
                      {draft !== undefined && (
                        <button onClick={() => guardarLimiteDeuda(r.id)} style={{ ...styles.payBtn, color: '#FF6B2C' }}>OK</button>
                      )}
                    </span>
                    <span style={{ width: 100 }}>
                      {r.cash_bloqueado_por_deuda
                        ? <span style={{ ...ds.badge, background: 'var(--c-danger-soft)', color: 'var(--c-danger)' }}>Bloqueado</span>
                        : <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>—</span>}
                    </span>
                    <span style={{ width: 180, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => forzarLiquidacion(r.id, r.nombre)}
                        disabled={liqRunning || r.stripe_connect_status !== 'activa'}
                        title={r.stripe_connect_status !== 'activa' ? 'Connect no activa' : 'Forzar liquidación'}
                        style={{ ...styles.payBtn, opacity: (liqRunning || r.stripe_connect_status !== 'activa') ? 0.5 : 1 }}
                      >
                        Liquidar
                      </button>
                      <button onClick={() => toggleExpand(r.id)} style={styles.payBtn}>
                        {connectExpanded === r.id ? 'Cerrar' : 'Histórico'}
                      </button>
                    </span>
                  </div>
                  {connectExpanded === r.id && (
                    <div style={{ background: 'var(--c-surface2)', padding: '12px 16px', borderTop: '1px solid var(--c-border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', marginBottom: 8, letterSpacing: 0.3 }}>
                        FACTURAS SEMANALES · {r.nombre} {r.ultima_liquidacion_at && <>· última: {new Date(r.ultima_liquidacion_at).toLocaleString('es-ES')}</>}
                      </div>
                      {historico.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '8px 0' }}>Sin liquidaciones previas</div>
                      )}
                      {historico.map(f => (
                        <div key={f.id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--c-border)' }}>
                          <span style={{ color: 'var(--c-muted)', width: 90 }}>{f.created_at ? new Date(f.created_at).toLocaleDateString('es-ES') : '—'}</span>
                          <span style={{ flex: 1, fontWeight: 600 }}>{fmtSemana(f.semana_inicio, f.semana_fin)}</span>
                          <span>Card: {fmtEUR(f.total_tarjeta || f.total_ganado || 0)}</span>
                          <span>Cash: {fmtEUR(f.total_efectivo || 0)}</span>
                          <span style={{ fontWeight: 700 }}>Neto: {fmtEUR(f.total_neto || f.total_ganado || 0)}</span>
                          <span style={{ ...ds.badge, background: f.estado === 'pagado' ? 'var(--c-success-soft)' : 'var(--c-warning-soft)', color: f.estado === 'pagado' ? 'var(--c-success)' : 'var(--c-warning)' }}>{f.estado}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {connectFiltered.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin restaurantes coincidentes</div>}
          </div>
        </>
      )}

      {tab === 'liquidaciones' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => setLiqAllModal(true)}
              disabled={liqRunning}
              style={{ ...ds.primaryBtn, opacity: liqRunning ? 0.5 : 1 }}
            >
              Ejecutar liquidación semanal ahora
            </button>
            <button
              onClick={ejecutarDryRun}
              disabled={liqRunning}
              style={{ ...ds.secondaryBtn, opacity: liqRunning ? 0.5 : 1 }}
            >
              Dry run (simulación)
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={loadLiquidacionesGlobales} style={ds.secondaryBtn}>Recargar</button>
          </div>

          {dryRunResult && (
            <div style={{ ...ds.card, marginBottom: 16, background: 'var(--c-warning-soft)', border: '1px solid var(--c-warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-warning)' }}>Simulación (no se escribió nada)</div>
                <button onClick={() => setDryRunResult(null)} style={{ ...ds.secondaryBtn, padding: '4px 10px', fontSize: 11 }}>Cerrar</button>
              </div>
              <pre style={{ fontSize: 11, color: 'var(--c-text)', whiteSpace: 'pre-wrap', maxHeight: 280, overflow: 'auto', margin: 0 }}>
                {JSON.stringify(dryRunResult, null, 2)}
              </pre>
            </div>
          )}

          <div style={ds.table}>
            <div style={ds.tableHeader}>
              <span style={{ width: 110 }}>Fecha</span>
              <span style={{ flex: 1 }}>Restaurante</span>
              <span style={{ width: 110 }}>Periodo</span>
              <span style={{ width: 80 }}>Card ped.</span>
              <span style={{ width: 80 }}>Cash ped.</span>
              <span style={{ width: 90 }}>A favor</span>
              <span style={{ width: 90 }}>Debe</span>
              <span style={{ width: 90 }}>Neto</span>
              <span style={{ width: 90 }}>Estado</span>
              <span style={{ width: 130 }}>Transfer</span>
            </div>
            {liquidacionesGlobales.map(f => {
              const transferId = f.stripe_transfer_id || f.transfer_id || null
              const aFavor = f.total_a_favor ?? f.a_favor_restaurante ?? f.total_tarjeta ?? f.total_ganado ?? 0
              const debe = f.total_debe ?? f.debe_restaurante ?? f.total_efectivo ?? 0
              const neto = f.total_neto ?? (aFavor - debe)
              const estadoColor = f.estado === 'pagado'
                ? { bg: 'var(--c-success-soft)', color: 'var(--c-success)' }
                : f.estado === 'fallida'
                  ? { bg: 'var(--c-danger-soft)', color: 'var(--c-danger)' }
                  : { bg: 'var(--c-warning-soft)', color: 'var(--c-warning)' }
              return (
                <div key={f.id} style={ds.tableRow}>
                  <span style={{ width: 110, fontSize: 11, color: 'var(--c-muted)' }}>
                    {f.created_at ? new Date(f.created_at).toLocaleDateString('es-ES') : '—'}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>{f.establecimientos?.nombre || '—'}</span>
                  <span style={{ width: 110, fontSize: 11, color: 'var(--c-muted)' }}>{fmtSemana(f.semana_inicio, f.semana_fin)}</span>
                  <span style={{ width: 80, fontSize: 12 }}>{f.pedidos_tarjeta ?? '—'}</span>
                  <span style={{ width: 80, fontSize: 12 }}>{f.pedidos_efectivo ?? '—'}</span>
                  <span style={{ width: 90, fontSize: 12, color: 'var(--c-success)' }}>{fmtEUR(aFavor)}</span>
                  <span style={{ width: 90, fontSize: 12, color: 'var(--c-danger)' }}>{fmtEUR(debe)}</span>
                  <span style={{ width: 90, fontSize: 13, fontWeight: 700, color: neto >= 0 ? 'var(--c-text)' : 'var(--c-danger)' }}>{fmtEUR(neto)}</span>
                  <span style={{ width: 90 }}>
                    <span style={{ ...ds.badge, background: estadoColor.bg, color: estadoColor.color }}>{f.estado || 'pendiente'}</span>
                  </span>
                  <span style={{ width: 130, fontSize: 11 }}>
                    {transferId ? (
                      <a href={`https://dashboard.stripe.com/connect/transfers/${transferId}`} target="_blank" rel="noopener noreferrer" style={{ color: '#FF6B2C', textDecoration: 'none' }} title={transferId}>
                        {transferId.slice(0, 14)}…
                      </a>
                    ) : (
                      <span style={{ color: 'var(--c-muted)' }}>—</span>
                    )}
                  </span>
                </div>
              )
            })}
            {liquidacionesGlobales.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin liquidaciones registradas</div>}
          </div>
        </>
      )}

      {liqAllModal && (
        <div style={ds.modal} onClick={() => !liqRunning && setLiqAllModal(false)}>
          <div style={{ ...ds.modalContent, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Ejecutar liquidación semanal</h2>
            <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Se ejecutará <code>liquidacion-semanal</code> para <strong>todos los restaurantes activos con Stripe Connect activa</strong>. Esta acción realizará transferencias Stripe reales y no se puede revertir.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setLiqAllModal(false)} disabled={liqRunning} style={ds.secondaryBtn}>Cancelar</button>
              <button onClick={ejecutarLiquidacionGlobal} disabled={liqRunning} style={{ ...ds.primaryBtn, flex: 1 }}>
                {liqRunning ? 'Ejecutando...' : 'Confirmar y ejecutar'}
              </button>
            </div>
          </div>
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
              <span style={{ width: 90, fontSize: 12, color: 'var(--c-text)' }}>{b.a_favor_restaurante?.toFixed(2)}EUR</span>
              <span style={{ width: 90, fontSize: 12, color: 'var(--c-danger)' }}>{b.debe_restaurante?.toFixed(2)}EUR</span>
              <span style={{ width: 90, fontSize: 12, fontWeight: 700, color: b.balance_neto >= 0 ? 'var(--c-text)' : 'var(--c-danger)' }}>{b.balance_neto?.toFixed(2)}EUR</span>
              <span style={{ width: 80 }}>
                <span style={{ ...ds.badge, background: b.estado === 'pagado' ? 'var(--c-surface2)' : 'var(--c-warning-soft)', color: b.estado === 'pagado' ? 'var(--c-success)' : 'var(--c-warning)' }}>{b.estado}</span>
              </span>
              <span style={{ width: 70 }}>
                {b.estado === 'pendiente' && <button onClick={() => marcarPagado('balances_restaurante', b.id)} style={styles.payBtn}>Pagar</button>}
              </span>
            </div>
          ))}
          {balancesRest.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin balances</div>}
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
              <span style={{ width: 100, fontSize: 10, color: 'var(--c-muted)' }}>{f.semana_inicio?.slice(5)}<br/>{f.semana_fin?.slice(5)}</span>
              <span style={{ width: 50, fontSize: 12 }}>{f.pedidos_entregados}/{f.total_pedidos}</span>
              <span style={{ width: 80, fontSize: 12 }}>{f.total_comisiones?.toFixed(2)}€</span>
              <span style={{ width: 70, fontSize: 12 }}>{f.total_envios?.toFixed(2)}€</span>
              <span style={{ width: 80, fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>{f.total_ganado?.toFixed(2)}€</span>
              <span style={{ width: 70 }}>
                <span style={{ ...ds.badge, background: f.estado === 'pagado' ? 'var(--c-surface2)' : 'var(--c-warning-soft)', color: f.estado === 'pagado' ? 'var(--c-success)' : 'var(--c-warning)' }}>{f.estado}</span>
              </span>
              <span style={{ width: 60 }}>
                {f.estado === 'pendiente' && <button onClick={() => marcarFacturaPagada(f.id)} style={styles.payBtn}>Pagar</button>}
              </span>
            </div>
          ))}
          {facturas.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin facturas generadas</div>}
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
            const tipoColor = { entrada_tarjeta: 'var(--c-text)', pago_restaurante: '#FF6B2C', cobro_comision: '#FF6B2C' }
            return (
              <div key={m.id} style={ds.tableRow}>
                <span style={{ width: 140 }}><span style={{ ...ds.badge, background: (tipoColor[m.tipo] || '#6B7280') + '15', color: tipoColor[m.tipo] || '#6B7280' }}>{m.tipo?.replace('_', ' ')}</span></span>
                <span style={{ width: 100, fontSize: 13, fontWeight: 700 }}>{m.monto?.toFixed(2)}EUR</span>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--c-muted)' }}>{m.descripcion || '-'}</span>
                <span style={{ width: 100, fontSize: 11, color: 'var(--c-muted)' }}>{m.referencia || '-'}</span>
                <span style={{ width: 140, fontSize: 11, color: 'var(--c-muted)' }}>{new Date(m.created_at).toLocaleString('es-ES')}</span>
              </div>
            )
          })}
          {movimientos.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin movimientos</div>}
        </div>
      )}

      {tab === 'riders' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total pendiente" value={`${riderStats.pendiente.toFixed(2)}EUR`} color="#FF6B2C" />
            <StatCard label="Pagado este mes" value={`${riderStats.pagadoMes.toFixed(2)}EUR`} color="#4ADE80" />
            <StatCard label="Riders activos" value={riderStats.activos} color='var(--c-text)' />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={riderFiltroEstado} onChange={e => setRiderFiltroEstado(e.target.value)} style={{ ...ds.formInput, width: 160 }}>
              <option value="pendiente">Pendientes</option>
              <option value="pagado">Pagadas</option>
              <option value="todos">Todas</option>
            </select>
            <select value={riderFiltroSemana} onChange={e => setRiderFiltroSemana(e.target.value)} style={{ ...ds.formInput, width: 200 }}>
              <option value="">Todas las semanas</option>
              {semanasDisponibles.map(s => (
                <option key={s} value={s}>{fmtSemana(s, riderFacturas.find(f => f.semana_inicio === s)?.semana_fin)}</option>
              ))}
            </select>
          </div>

          <div style={ds.table}>
            <div style={ds.tableHeader}>
              <span style={{ flex: 1 }}>Rider</span>
              <span style={{ width: 120 }}>Semana</span>
              <span style={{ width: 50 }}>Ped.</span>
              <span style={{ width: 70 }}>Envíos</span>
              <span style={{ width: 80 }}>Comis.</span>
              <span style={{ width: 70 }}>Propinas</span>
              <span style={{ width: 80 }}>Neto</span>
              <span style={{ width: 70 }}>Estado</span>
              <span style={{ width: 110 }}></span>
            </div>
            {riderFiltered.map(f => (
              <div key={f.id} style={ds.tableRow}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{f.rider_accounts?.nombre || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{f.rider_accounts?.telefono || f.rider_accounts?.email || ''}</div>
                </span>
                <span style={{ width: 120, fontSize: 11, color: 'var(--c-text-soft)' }}>{fmtSemana(f.semana_inicio, f.semana_fin)}</span>
                <span style={{ width: 50, fontSize: 12 }}>{f.total_pedidos || 0}</span>
                <span style={{ width: 70, fontSize: 12 }}>{(f.total_envios || 0).toFixed(2)}€</span>
                <span style={{ width: 80, fontSize: 12 }}>{(f.total_comisiones || 0).toFixed(2)}€</span>
                <span style={{ width: 70, fontSize: 12 }}>{(f.total_propinas || 0).toFixed(2)}€</span>
                <span style={{ width: 80, fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>{(f.total_neto || 0).toFixed(2)}€</span>
                <span style={{ width: 70 }}>
                  <span style={{ ...ds.badge, background: f.estado === 'pagado' ? 'var(--c-surface2)' : 'var(--c-warning-soft)', color: f.estado === 'pagado' ? 'var(--c-success)' : 'var(--c-warning)' }}>{f.estado}</span>
                </span>
                <span style={{ width: 110 }}>
                  {f.estado === 'pendiente' && (
                    <button onClick={() => abrirPago(f)} style={styles.payBtn}>Marcar pagado</button>
                  )}
                  {f.estado === 'pagado' && f.referencia_pago && (
                    <span style={{ fontSize: 10, color: 'var(--c-muted)' }} title={f.referencia_pago}>Ref: {f.referencia_pago.slice(0, 10)}…</span>
                  )}
                </span>
              </div>
            ))}
            {riderFiltered.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin facturas de riders</div>
            )}
          </div>
        </>
      )}

      {tab === 'cuotas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Suscripciones activas" value={cuotasStats.activas} color="#4ADE80" />
            <StatCard label="MRR (mensual)" value={`${cuotasStats.mrr.toFixed(2)}EUR`} color="#FF6B2C" />
            <StatCard label="Pago fallido" value={cuotasStats.pastDue} color="#F87171" />
            <StatCard label="Churn este mes" value={cuotasStats.churnMes} color='var(--c-text)' />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={exportCuotasCSV} disabled={cuotas.length === 0} style={{ ...ds.secondaryBtn, fontSize: 12, opacity: cuotas.length === 0 ? 0.5 : 1 }}>
              Exportar CSV
            </button>
          </div>

          <div style={ds.table}>
            <div style={ds.tableHeader}>
              <span style={{ flex: 1 }}>Restaurante</span>
              <span style={{ width: 110 }}>Estado</span>
              <span style={{ width: 100 }}>plan_pro</span>
              <span style={{ width: 110 }}>Fecha alta</span>
              <span style={{ width: 110 }}>Próximo pago</span>
              <span style={{ width: 70 }}>Monto</span>
              <span style={{ width: 70 }}>Fallidos</span>
            </div>
            {cuotas.map(c => {
              const info = {
                active:   { bg: 'var(--c-success-soft)',  color: 'var(--c-success)' },
                pending:  { bg: 'var(--c-warning-soft)', color: 'var(--c-warning)' },
                past_due: { bg: 'var(--c-danger-soft)',  color: 'var(--c-danger)' },
                unpaid:   { bg: 'var(--c-danger-soft)',  color: 'var(--c-danger)' },
                canceled: { bg: 'var(--c-surface2)', color: 'var(--c-muted)' },
              }[c.estado] || { bg: 'var(--c-surface2)', color: 'var(--c-muted)' }
              return (
                <div key={c.id} style={ds.tableRow}>
                  <span style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.establecimientos?.nombre || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{c.establecimientos?.slug || ''}</div>
                  </span>
                  <span style={{ width: 110 }}>
                    <span style={{ ...ds.badge, background: info.bg, color: info.color }}>{c.estado}</span>
                  </span>
                  <span style={{ width: 100 }}>
                    <span style={{ ...ds.badge, background: c.establecimientos?.plan_pro ? 'var(--c-success-soft)' : 'var(--c-surface2)', color: c.establecimientos?.plan_pro ? 'var(--c-success)' : 'var(--c-muted)' }}>
                      {c.establecimientos?.plan_pro ? 'SÍ' : 'NO'}
                    </span>
                  </span>
                  <span style={{ width: 110, fontSize: 11, color: 'var(--c-muted)' }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('es-ES') : '—'}
                  </span>
                  <span style={{ width: 110, fontSize: 11, color: 'var(--c-muted)' }}>
                    {c.fecha_proximo_pago ? new Date(c.fecha_proximo_pago).toLocaleDateString('es-ES') : '—'}
                  </span>
                  <span style={{ width: 70, fontSize: 12, fontWeight: 700 }}>{(c.monto_mensual || 39).toFixed(2)}€</span>
                  <span style={{ width: 70, fontSize: 12, color: (c.intentos_fallidos || 0) >= 1 ? 'var(--c-danger)' : 'var(--c-muted)' }}>
                    {c.intentos_fallidos || 0}/3
                  </span>
                </div>
              )
            })}
            {cuotas.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin suscripciones aún</div>}
          </div>
        </>
      )}

      {pagoModal && (
        <div style={ds.modal} onClick={() => !pagoSaving && setPagoModal(null)}>
          <div style={{ ...ds.modalContent, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', marginBottom: 6 }}>Marcar factura como pagada</h2>
            <p style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 16 }}>
              {pagoModal.rider_accounts?.nombre} · {fmtSemana(pagoModal.semana_inicio, pagoModal.semana_fin)} · <strong style={{ color: 'var(--c-text)' }}>{(pagoModal.total_neto || 0).toFixed(2)}€</strong>
            </p>
            <label style={ds.label}>Referencia de pago (opcional)</label>
            <textarea
              value={pagoRef}
              onChange={e => setPagoRef(e.target.value)}
              rows={3}
              placeholder="Ej: Transferencia Bizum #12345, fecha..."
              style={{ ...ds.formInput, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setPagoModal(null)} disabled={pagoSaving} style={ds.secondaryBtn}>Cancelar</button>
              <button onClick={confirmarPago} disabled={pagoSaving} style={{ ...ds.primaryBtn, flex: 1 }}>
                {pagoSaving ? 'Guardando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  payBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: 'var(--c-surface2)', color: 'var(--c-success)' },
}
