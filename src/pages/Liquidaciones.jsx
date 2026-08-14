import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Download, Check, AlertTriangle, Link2, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, GhostBtn, GlossyBtn, MiniBtn, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { toast } from '../App'

// Este fichero era el único del panel que NO importaba el sistema de estilos:
// se definía su propia `card` y su propio `btn`, ya divergidos de los del resto.
// Ahora sale todo de darkStyles/ui. La lógica del dinero no se toca.
const euro = (v) => fmtEUR(v)
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

// Los colores salen ahora de los tonos del sistema: los de antes eran el acento
// puro sobre un tinte del mismo color y se quedaban en 2-3:1 de contraste.
const ESTADOS = {
  pendiente:      { label: 'Pendiente',      tono: 'warning' },
  pagada:         { label: 'Pagada',         tono: 'sage' },
  sin_movimiento: { label: 'Sin movimiento', tono: 'neutral' },
  fallida:        { label: 'Fallida',        tono: 'danger' },
  arrastrada:     { label: 'Arrastrada',     tono: 'info' },
}

export default function Liquidaciones() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState('todos')
  const [recalc, setRecalc] = useState(false)
  const [pack, setPack] = useState(false)
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

  // Pack semanal (los PDF de los lunes): una liquidación por restaurante, un
  // reparto por socio y el informe interno. Lo genera la edge, que lee los
  // mismos números que esta pantalla — no recalcula nada por su cuenta.
  async function generarPack() {
    if (periodo === 'todos') {
      toast('Elige primero una semana en el desplegable', 'error')
      return
    }
    const [ini, fin] = periodo.split('|')
    setPack(true)
    try {
      const { data, error } = await supabase.functions.invoke('generar-pack-liquidacion', {
        body: { periodo_inicio: ini, periodo_fin: fin },
      })
      if (error) throw new Error(data?.error || error.message)
      if (!data?.ok) throw new Error(data?.error || 'Respuesta inesperada')
      const n = data.generados?.length || 0
      toast(`Pack generado: ${n} documento${n === 1 ? '' : 's'}`, 'success')
      cargar()
    } catch (e) {
      toast('No se pudo generar el pack: ' + e.message, 'error')
    } finally {
      setPack(false)
    }
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

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Liquidaciones</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Cortes semanales (lunes). El sistema calcula; el pago lo lanzas tú.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <GhostBtn onClick={recalcular} disabled={recalc} style={{ opacity: recalc ? 0.6 : 1 }}>
            <RefreshCw size={15} /> {recalc ? 'Recalculando…' : 'Recalcular semana'}
          </GhostBtn>
          <GhostBtn onClick={exportarCSV} disabled={filtradas.length === 0} style={{ opacity: filtradas.length === 0 ? 0.5 : 1 }}>
            <Download size={15} /> Exportar CSV
          </GhostBtn>
          <GlossyBtn accent onClick={generarPack} disabled={pack || periodo === 'todos'}
            title={periodo === 'todos' ? 'Elige una semana para generar su pack' : 'Genera los PDF de la semana'}
            style={{ opacity: pack || periodo === 'todos' ? 0.6 : 1 }}>
            <FileText size={15} /> {pack ? 'Generando…' : 'Generar pack'}
          </GlossyBtn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Pido paga (pendiente)" value={euro(totPidoPaga)} sub="A favor del restaurante" tone="sage" />
        <StatCard label="Restaurantes deben (pendiente)" value={euro(totRestPaga)} sub="Comisión por cobrar" tone="terracotta" />
        <StatCard label="Comisión Pidoo (total)" value={euro(totComision)} sub="En el periodo mostrado" />
      </div>

      {/* Aviso Stripe Connect no activo */}
      {sinConnect.length > 0 && (
        <Card pad={14} style={{ marginBottom: 16, background: colors.dangerSoft, borderColor: colors.danger }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: colors.onDangerSoft, ...type.label, lineHeight: 1.5 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><b>{sinConnect.length} restaurante(s)</b> con liquidación pendiente a su favor NO tienen Stripe Connect activo. El pago automático no se ejecutará hasta que completen el onboarding. Genera el enlace en cada fila marcada y envíaselo.</span>
          </div>
        </Card>
      )}

      {/* Filtro periodo */}
      <div style={{ marginBottom: 14 }}>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ ...ds.select, width: 'auto', minWidth: 220 }}>
          <option value="todos">Todas las semanas</option>
          {periodos.map(p => <option key={p.k} value={p.k}>{periodoLabel(p.i, p.f)}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : filtradas.length === 0 ? (
        <Card pad={0}>
          <Vacio
            titulo="Todavía no hay liquidaciones"
            texto={'Se generan solas cada lunes. También puedes forzarlo con "Recalcular semana".'}
          />
        </Card>
      ) : (
        // El desbordamiento horizontal se queda SOLO para tablet/escritorio: en
        // móvil manda `ds-table-stack`, que convierte cada fila en una ficha.
        <div className="ds-table-stack" style={{ ...ds.table, padding: 0, overflowX: 'auto' }}>
          <div className="liq-min">
            <div className="ds-th" style={{ ...ds.tableHeader, gap: 0 }}>
              <div style={{ flex: '2 1 160px' }}>Restaurante</div>
              <div style={{ flex: '1 1 90px', textAlign: 'right' }}>Pedidos</div>
              <div style={{ flex: '1 1 100px', textAlign: 'right' }}>Subtotal</div>
              <div style={{ flex: '1 1 100px', textAlign: 'right' }}>Com. Pidoo</div>
              <div style={{ flex: '1 1 100px', textAlign: 'right' }}>Efectivo</div>
              <div style={{ flex: '1.4 1 150px', textAlign: 'right' }}>Liquidación</div>
              <div style={{ flex: '1.2 1 130px', textAlign: 'right' }}>Estado</div>
            </div>
            {filtradas.map(r => {
              // Un estado desconocido NUNCA se pinta como "Pendiente": había una fila
              // con estado 'pagado' (en masculino) que aparecía como pendiente estando
              // ya cobrada. Mejor enseñar el valor crudo que mentir.
              const est = ESTADOS[r.estado] || { label: r.estado || '—', tono: 'neutral' }
              const neto = Number(r.neto_a_pagar || 0)
              const arr = Number(r.saldo_arrastre || 0)
              const sinMov = r.estado === 'sin_movimiento' || (!r.pedidos_count && Math.abs(neto) < 0.005)
              const liqTxt = r.estado === 'arrastrada' ? '↳ incluida en la siguiente'
                : sinMov ? '—'
                : neto > 0 ? `Pido paga ${euro(neto)}`
                : `Restaurante debe ${euro(Math.abs(neto))}`
              const liqColor = r.estado === 'arrastrada' || sinMov ? colors.textMute
                : neto > 0 ? colors.onSageSoft : colors.onTerracottaSoft
              return (
                <div key={r.id} className="ds-row-touch" style={{ ...ds.tableRow, gap: 0 }}>
                  <div data-col="nom" style={{ flex: '2 1 160px', minWidth: 0 }}>
                    <div style={{ ...type.label, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.establecimientos?.nombre || '—'}
                    </div>
                    <div style={{ ...type.caption, color: colors.textMute, marginTop: 2 }}>{periodoLabel(r.periodo_inicio, r.periodo_fin)}</div>
                    {pendiente(r) && cobraElRestaurante(r) && !connectActiva(r) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Chip tono="danger">Connect no activo</Chip>
                        <MiniBtn onClick={() => reenviarOnboarding(r)}>
                          <Link2 size={12} /> Enlace onboarding
                        </MiniBtn>
                      </div>
                    )}
                  </div>
                  <div data-col="cod" style={{ flex: '1 1 90px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.pedidos_count}</div>
                  <div data-col="tot" style={{ flex: '1 1 100px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(r.subtotal_total)}</div>
                  <div data-col="pag" style={{ flex: '1 1 100px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{euro(r.comision_pido)}</div>
                  <div data-col="ori" style={{ flex: '1 1 100px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: colors.textMute }}>{euro(r.efectivo_total)}</div>
                  <div data-col="est" style={{ flex: '1.4 1 150px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ ...type.label, fontWeight: 700, color: liqColor }}>{liqTxt}</div>
                    {r.estado === 'pendiente' && Math.abs(arr) >= 0.005 && (
                      <div style={{ ...type.caption, color: colors.textMute, marginTop: 2 }}>incl. arrastre {euro(arr)}</div>
                    )}
                    {r.estado === 'pagada' && (r.pagado_at || r.referencia_pago) && (
                      <div style={{ ...type.caption, color: colors.textMute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[fechaCorta(r.pagado_at), r.referencia_pago].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div data-col="acc" style={{ flex: '1.2 1 130px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                    <Chip tono={est.tono}>{est.label}</Chip>
                    {r.pdf_url && (
                      <MiniBtn onClick={() => window.open(r.pdf_url, '_blank', 'noopener')}
                        title={`Abrir el PDF de ${r.establecimientos?.nombre || 'este restaurante'}`}>
                        <FileText size={13} /> PDF
                      </MiniBtn>
                    )}
                    {r.estado === 'pendiente' && (
                      <MiniBtn onClick={() => abrirPago(r)} title="Marcar pagada" aria-label={`Marcar pagada la liquidación de ${r.establecimientos?.nombre || 'este restaurante'}`}>
                        <Check size={14} /> Pagada
                      </MiniBtn>
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
        return (
          <div
            onClick={() => { if (!pagoModal.guardando) setPagoModal(null) }}
            style={ds.modal}
          >
            <div onClick={e => e.stopPropagation()} className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 420 }}>
              <div style={ds.h3}>Marcar como pagada</div>
              <div style={{ ...type.body, color: colors.textMute, marginTop: 4 }}>
                {r.establecimientos?.nombre || 'Restaurante'} · {periodoLabel(r.periodo_inicio, r.periodo_fin)}
              </div>

              <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: radius.md, background: colors.elev2, border: `1px solid ${colors.border}` }}>
                <div style={{ ...type.label, color: colors.textMute }}>
                  {cobra ? 'Le transfieres' : 'Te ingresa el restaurante'}
                </div>
                <div style={{ ...type.num, fontSize: 28, marginTop: 4, color: cobra ? colors.onSageSoft : colors.onTerracottaSoft }}>
                  {euro(Math.abs(neto))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={ds.label}>Fecha del pago</label>
                <input
                  type="date" value={pagoModal.fecha} style={ds.formInput}
                  onChange={e => setPagoModal(m => ({ ...m, fecha: e.target.value }))}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={ds.label}>Referencia (opcional)</label>
                <input
                  type="text" value={pagoModal.referencia} autoFocus style={ds.formInput}
                  placeholder="Nº de transferencia, Bizum, concepto…"
                  onChange={e => setPagoModal(m => ({ ...m, referencia: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarPago() }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <GhostBtn onClick={() => setPagoModal(null)} disabled={pagoModal.guardando}>
                  Cancelar
                </GhostBtn>
                <GlossyBtn accent onClick={confirmarPago} disabled={pagoModal.guardando} style={{ opacity: pagoModal.guardando ? 0.6 : 1 }}>
                  <Check size={15} /> {pagoModal.guardando ? 'Guardando…' : 'Confirmar pago'}
                </GlossyBtn>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
