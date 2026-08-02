import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download, Check, AlertTriangle, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../App'

const euro = (v) => `${Number(v || 0).toFixed(2)} €`
const periodoLabel = (i, f) => {
  if (!i) return '—'
  const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  return `${fmt(i)} – ${fmt(f)}`
}
const fechaCorta = (ts) => ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''
// Fecha de hoy en local (no UTC): con toISOString() de madrugada se marcaría el día anterior.
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ESTADOS = {
  pendiente: { label: 'Pendiente', color: '#C99551', bg: 'rgba(201,149,81,0.15)' },
  pagada: { label: 'Pagada', color: '#6F8460', bg: 'rgba(139,157,122,0.18)' },
  sin_movimiento: { label: 'Sin movimiento', color: '#8A8174', bg: 'rgba(138,129,116,0.15)' },
  fallida: { label: 'Fallida', color: '#B5564A', bg: 'rgba(181,86,74,0.15)' },
  arrastrada: { label: 'Arrastrada', color: '#7B8FA8', bg: 'rgba(123,143,168,0.15)' },
}

export default function Liquidaciones() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('todos')
  const [recalc, setRecalc] = useState(false)
  const [pagoModal, setPagoModal] = useState(null) // { row, referencia, fecha, guardando }

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('liquidaciones_semanales')
      .select('*, establecimientos(id, nombre, logo_url, stripe_connect_status, stripe_connect_account_id)')
      .order('periodo_inicio', { ascending: false })
      .order('subtotal_total', { ascending: false })
    if (error) toast('Error cargando liquidaciones: ' + error.message, 'error')
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const periodos = useMemo(() => {
    const set = new Map()
    rows.forEach(r => { const k = `${r.periodo_inicio}|${r.periodo_fin}`; if (!set.has(k)) set.set(k, { i: r.periodo_inicio, f: r.periodo_fin }) })
    return Array.from(set.entries()).map(([k, v]) => ({ k, ...v }))
  }, [rows])

  const filtradas = periodo === 'todos' ? rows : rows.filter(r => `${r.periodo_inicio}|${r.periodo_fin}` === periodo)

  // Quién paga a quién se deduce del SIGNO de neto_a_pagar, nunca de la columna
  // 'direccion': hay filas históricas con esa columna corrupta (con una dirección
  // postal dentro). Es el mismo criterio que usa la edge pagar-liquidaciones.
  const cobraElRestaurante = (r) => Number(r.neto_a_pagar || 0) > 0
  const pendiente = (r) => r.estado === 'pendiente'

  const totPidoPaga = filtradas.filter(r => pendiente(r) && cobraElRestaurante(r)).reduce((s, r) => s + Number(r.neto_a_pagar || 0), 0)
  const totRestPaga = filtradas.filter(r => pendiente(r) && Number(r.neto_a_pagar || 0) < 0).reduce((s, r) => s + Math.abs(Number(r.neto_a_pagar || 0)), 0)
  const totComision = filtradas.reduce((s, r) => s + Number(r.comision_pido || 0), 0)

  // Stripe Connect: el pago automático al restaurante (dirección pido_paga) solo
  // corre si el establecimiento tiene Connect activo. Si no, hay que avisar.
  const connectActiva = (r) => ['active', 'activa'].includes(r.establecimientos?.stripe_connect_status)
  const sinConnect = useMemo(
    () => filtradas.filter(r => pendiente(r) && cobraElRestaurante(r) && !connectActiva(r)),
    [filtradas]
  )

  async function reenviarOnboarding(row) {
    const estId = row.establecimientos?.id
    if (!estId) return toast('Sin establecimiento asociado', 'error')
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboarding', { body: { establecimiento_id: estId } })
      if (error) throw new Error(error.message)
      if (!data?.url) throw new Error(data?.error || 'Sin URL de onboarding')
      try { await navigator.clipboard.writeText(data.url) } catch {}
      window.open(data.url, '_blank', 'noopener')
      toast('Enlace de onboarding generado y copiado — envíaselo al restaurante', 'success')
    } catch (e) {
      toast('No se pudo generar el enlace: ' + e.message, 'error')
    }
  }

  // Marcar pagada pide fecha y referencia: sin eso no queda rastro de cuándo ni
  // con qué transferencia se pagó, y en dinero eso es insuficiente.
  function abrirPago(row) {
    setPagoModal({ row, referencia: '', fecha: hoyISO(), guardando: false })
  }

  async function confirmarPago() {
    if (!pagoModal || pagoModal.guardando) return
    const { row, referencia, fecha } = pagoModal
    if (!fecha) { toast('Indica la fecha del pago', 'error'); return }
    setPagoModal(m => ({ ...m, guardando: true }))
    const { error } = await supabase.from('liquidaciones_semanales').update({
      estado: 'pagada',
      // Mediodía local: evita que la fecha se desplace un día al convertir a UTC.
      pagado_at: new Date(`${fecha}T12:00:00`).toISOString(),
      referencia_pago: referencia.trim() || null,
    }).eq('id', row.id)
    if (error) {
      toast('Error: ' + error.message, 'error')
      setPagoModal(m => (m ? { ...m, guardando: false } : m))
      return
    }
    toast('Marcada como pagada', 'success')
    setPagoModal(null)
    cargar()
  }

  async function recalcular() {
    setRecalc(true)
    try {
      const { data, error } = await supabase.functions.invoke('liquidacion-semanal', { body: {} })
      if (error) throw new Error(error.message || 'Error')
      toast(`Recalculado: ${data?.restaurantes ?? 0} restaurantes (${data?.periodo?.inicio} – ${data?.periodo?.fin})`, 'success')
      cargar()
    } catch (e) {
      toast('No se pudo recalcular: ' + e.message, 'error')
    } finally {
      setRecalc(false)
    }
  }

  function exportarCSV() {
    const cols = ['Restaurante', 'Periodo inicio', 'Periodo fin', 'Pedidos', 'Subtotal', 'Comision Pido', 'Efectivo', 'Tarjeta', 'Envios', 'Propinas', 'Transfer semana', 'Arrastre', 'Neto a pagar', 'Direccion', 'Estado', 'Pagado el', 'Referencia']
    const lines = filtradas.map(r => [
      r.establecimientos?.nombre || '', r.periodo_inicio, r.periodo_fin, r.pedidos_count,
      r.subtotal_total, r.comision_pido, r.efectivo_total, r.tarjeta_total, r.envios_total, r.propinas_total,
      r.transfer_restaurante, r.saldo_arrastre, r.neto_a_pagar, r.direccion, r.estado,
      r.pagado_at ? new Date(r.pagado_at).toISOString().slice(0, 10) : '', r.referencia_pago || '',
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [cols.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `liquidaciones_${periodo === 'todos' ? 'todas' : periodo.split('|')[0]}.csv`
    a.click()
  }

  const titSty = { fontSize: 22, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.4px', margin: 0 }
  const card = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 16 }
  const btn = (primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 9,
    border: primary ? 'none' : '1px solid var(--c-border)',
    background: primary ? 'var(--c-primary)' : 'var(--c-surface)',
    color: primary ? '#fff' : 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={titSty}>Liquidaciones</h1>
          <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
            Cortes semanales (lunes). El sistema calcula; el pago lo lanzas tú.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={recalcular} disabled={recalc} style={{ ...btn(false), opacity: recalc ? 0.6 : 1 }}>
            <RefreshCw size={15} /> {recalc ? 'Recalculando…' : 'Recalcular semana'}
          </button>
          <button onClick={exportarCSV} disabled={filtradas.length === 0} style={{ ...btn(false), opacity: filtradas.length === 0 ? 0.5 : 1 }}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pido paga (pendiente)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#6F8460', marginTop: 6 }}>{euro(totPidoPaga)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Restaurantes deben (pendiente)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-primary)', marginTop: 6 }}>{euro(totRestPaga)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Comisión Pido (total)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-text)', marginTop: 6 }}>{euro(totComision)}</div>
        </div>
      </div>

      {/* Aviso Stripe Connect no activo */}
      {sinConnect.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(181,86,74,0.12)', border: '1px solid rgba(181,86,74,0.4)', color: '#B5564A', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><b>{sinConnect.length} restaurante(s)</b> con liquidación pendiente a su favor NO tienen Stripe Connect activo. El pago automático no se ejecutará hasta que completen el onboarding. Genera el enlace en cada fila marcada y envíaselo.</span>
        </div>
      )}

      {/* Filtro periodo */}
      <div style={{ marginBottom: 14 }}>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{
          padding: '9px 12px', borderRadius: 9, border: '1px solid var(--c-border)',
          background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
        }}>
          <option value="todos">Todas las semanas</option>
          {periodos.map(p => <option key={p.k} value={p.k}>{periodoLabel(p.i, p.f)}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--c-muted)', fontSize: 14 }}>Cargando…</div>
      ) : filtradas.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: 36, color: 'var(--c-muted)', fontSize: 14 }}>
          Aún no hay liquidaciones. Se generan cada lunes (o pulsa "Recalcular semana").
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <div style={{ minWidth: 880 }}>
            <div style={{ display: 'flex', padding: '12px 16px', borderBottom: '1px solid var(--c-border)', fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div style={{ flex: '2 1 160px' }}>Restaurante</div>
              <div style={{ flex: '1 1 90px', textAlign: 'right' }}>Pedidos</div>
              <div style={{ flex: '1 1 100px', textAlign: 'right' }}>Subtotal</div>
              <div style={{ flex: '1 1 100px', textAlign: 'right' }}>Com. Pido</div>
              <div style={{ flex: '1 1 100px', textAlign: 'right' }}>Efectivo</div>
              <div style={{ flex: '1.4 1 150px', textAlign: 'right' }}>Liquidación</div>
              <div style={{ flex: '1.2 1 130px', textAlign: 'right' }}>Estado</div>
            </div>
            {filtradas.map(r => {
              // Un estado desconocido NUNCA se pinta como "Pendiente": había una fila
              // con estado 'pagado' (en masculino) que aparecía como pendiente estando
              // ya cobrada. Mejor enseñar el valor crudo que mentir.
              const est = ESTADOS[r.estado] || { label: r.estado || '—', color: 'var(--c-muted)', bg: 'var(--c-bg)' }
              const neto = Number(r.neto_a_pagar || 0)
              const arr = Number(r.saldo_arrastre || 0)
              const sinMov = r.estado === 'sin_movimiento' || (!r.pedidos_count && Math.abs(neto) < 0.005)
              const liqTxt = r.estado === 'arrastrada' ? '↳ incluida en la siguiente'
                : sinMov ? '—'
                : neto > 0 ? `Pido paga ${euro(neto)}`
                : `Restaurante debe ${euro(Math.abs(neto))}`
              const liqColor = r.estado === 'arrastrada' || sinMov ? 'var(--c-muted)'
                : neto > 0 ? '#6F8460' : 'var(--c-primary)'
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text)' }}>
                  <div style={{ flex: '2 1 160px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.establecimientos?.nombre || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>{periodoLabel(r.periodo_inicio, r.periodo_fin)}</div>
                    {pendiente(r) && cobraElRestaurante(r) && !connectActiva(r) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: '#B5564A', background: 'rgba(181,86,74,0.15)' }}>Connect no activo</span>
                        <button onClick={() => reenviarOnboarding(r)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <Link2 size={11} /> Enlace onboarding
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: '1 1 90px', textAlign: 'right' }}>{r.pedidos_count}</div>
                  <div style={{ flex: '1 1 100px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(r.subtotal_total)}</div>
                  <div style={{ flex: '1 1 100px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(r.comision_pido)}</div>
                  <div style={{ flex: '1 1 100px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{euro(r.efectivo_total)}</div>
                  <div style={{ flex: '1.4 1 150px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontWeight: 700, color: liqColor }}>{liqTxt}</div>
                    {r.estado === 'pendiente' && Math.abs(arr) >= 0.005 && (
                      <div style={{ fontSize: 10, color: 'var(--c-muted)', marginTop: 2 }}>incl. arrastre {euro(arr)}</div>
                    )}
                    {r.estado === 'pagada' && (r.pagado_at || r.referencia_pago) && (
                      <div style={{ fontSize: 10, color: 'var(--c-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[fechaCorta(r.pagado_at), r.referencia_pago].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: '1.2 1 130px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: est.color, background: est.bg, whiteSpace: 'nowrap' }}>{est.label}</span>
                    {r.estado === 'pendiente' && (
                      <button onClick={() => abrirPago(r)} title="Marcar pagada" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: '#6F8460', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Marcar pagada: fecha + referencia de la transferencia */}
      {pagoModal && (() => {
        const r = pagoModal.row
        const neto = Number(r.neto_a_pagar || 0)
        const cobra = neto > 0
        const inputSty = {
          width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--c-border)',
          background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
        }
        const labelSty = { fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }
        return (
          <div
            onClick={() => { if (!pagoModal.guardando) setPagoModal(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 100 }}
          >
            <div onClick={e => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 420, padding: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-text)', letterSpacing: '-0.2px' }}>Marcar como pagada</div>
              <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>
                {r.establecimientos?.nombre || 'Restaurante'} · {periodoLabel(r.periodo_inicio, r.periodo_fin)}
              </div>

              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cobra ? 'Le transfieres' : 'Te ingresa el restaurante'}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: cobra ? '#6F8460' : 'var(--c-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {euro(Math.abs(neto))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={labelSty}>Fecha del pago</label>
                <input
                  type="date" value={pagoModal.fecha} style={inputSty}
                  onChange={e => setPagoModal(m => ({ ...m, fecha: e.target.value }))}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={labelSty}>Referencia (opcional)</label>
                <input
                  type="text" value={pagoModal.referencia} autoFocus style={inputSty}
                  placeholder="Nº de transferencia, Bizum, concepto…"
                  onChange={e => setPagoModal(m => ({ ...m, referencia: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarPago() }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button onClick={() => setPagoModal(null)} disabled={pagoModal.guardando} style={{ ...btn(false), opacity: pagoModal.guardando ? 0.6 : 1 }}>
                  Cancelar
                </button>
                <button onClick={confirmarPago} disabled={pagoModal.guardando} style={{ ...btn(true), opacity: pagoModal.guardando ? 0.6 : 1 }}>
                  <Check size={15} /> {pagoModal.guardando ? 'Guardando…' : 'Confirmar pago'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
