import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { toast } from '../App'

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
  const [riderFacturas, setRiderFacturas] = useState([])
  const [riderFiltroEstado, setRiderFiltroEstado] = useState('pendiente')
  const [riderFiltroSemana, setRiderFiltroSemana] = useState('')
  const [riderStats, setRiderStats] = useState({ pendiente: 0, pagadoMes: 0, activos: 0 })
  const [pagoModal, setPagoModal] = useState(null)
  const [pagoRef, setPagoRef] = useState('')
  const [pagoSaving, setPagoSaving] = useState(false)

  useEffect(() => {
    loadResumen()
    loadBalancesRest()
    loadMovimientos()
    loadFacturas()
    loadRiderFacturas()
    loadRiderStats()
  }, [])

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
    { id: 'restaurantes', label: 'Balance Restaurantes' },
    { id: 'facturas', label: 'Facturas' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'riders', label: 'Pagos a riders' },
  ]

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

      {tab === 'riders' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            <StatCard label="Total pendiente" value={`${riderStats.pendiente.toFixed(2)}EUR`} color="#FF6B2C" />
            <StatCard label="Pagado este mes" value={`${riderStats.pagadoMes.toFixed(2)}EUR`} color="#4ADE80" />
            <StatCard label="Riders activos" value={riderStats.activos} color="#F5F5F5" />
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
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{f.rider_accounts?.telefono || f.rider_accounts?.email || ''}</div>
                </span>
                <span style={{ width: 120, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{fmtSemana(f.semana_inicio, f.semana_fin)}</span>
                <span style={{ width: 50, fontSize: 12 }}>{f.total_pedidos || 0}</span>
                <span style={{ width: 70, fontSize: 12 }}>{(f.total_envios || 0).toFixed(2)}€</span>
                <span style={{ width: 80, fontSize: 12 }}>{(f.total_comisiones || 0).toFixed(2)}€</span>
                <span style={{ width: 70, fontSize: 12 }}>{(f.total_propinas || 0).toFixed(2)}€</span>
                <span style={{ width: 80, fontSize: 13, fontWeight: 700, color: '#F5F5F5' }}>{(f.total_neto || 0).toFixed(2)}€</span>
                <span style={{ width: 70 }}>
                  <span style={{ ...ds.badge, background: f.estado === 'pagado' ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.15)', color: f.estado === 'pagado' ? '#4ADE80' : '#FBBF24' }}>{f.estado}</span>
                </span>
                <span style={{ width: 110 }}>
                  {f.estado === 'pendiente' && (
                    <button onClick={() => abrirPago(f)} style={styles.payBtn}>Marcar pagado</button>
                  )}
                  {f.estado === 'pagado' && f.referencia_pago && (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }} title={f.referencia_pago}>Ref: {f.referencia_pago.slice(0, 10)}…</span>
                  )}
                </span>
              </div>
            ))}
            {riderFiltered.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin facturas de riders</div>
            )}
          </div>
        </>
      )}

      {pagoModal && (
        <div style={ds.modal} onClick={() => !pagoSaving && setPagoModal(null)}>
          <div style={{ ...ds.modalContent, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F5F5F5', marginBottom: 6 }}>Marcar factura como pagada</h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
              {pagoModal.rider_accounts?.nombre} · {fmtSemana(pagoModal.semana_inicio, pagoModal.semana_fin)} · <strong style={{ color: '#F5F5F5' }}>{(pagoModal.total_neto || 0).toFixed(2)}€</strong>
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
  payBtn: { padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: 'rgba(255,255,255,0.06)', color: '#4ADE80' },
}
