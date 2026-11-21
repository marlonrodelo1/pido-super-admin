import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Check, ChevronDown, ChevronRight, Undo2, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, GhostBtn, GlossyBtn, MiniBtn, StatCard, Vacio, Segmented, fmtEUR } from '../lib/ui'
import { toast, confirmar } from '../App'

// Liquidación DIARIA (21 nov 2026, Marlon).
//
// Lo cobrado con tarjeta EN PERSONA a través del Stripe de Pidoo — el lector del local
// (pedido_cobros_movil.plataforma 'lector_tpv') y el móvil del repartidor (Tap to Pay de Pidoo
// Socios) — se le envía al restaurante al día siguiente, menos la comisión de Stripe. Cada
// mañana a las 06:00 UTC el cron `liquidacion-diaria` deja el día anterior (de 05:00 a 05:00)
// como "por enviar". Aquí se marca enviado con fecha y referencia. Lo de la app y la web sigue
// en la liquidación semanal: lo que entra en una diaria SALE de la semanal (nunca dos veces).
//
// Toda la lógica del dinero está en la base de datos (liquidacion_diaria_*). Esta pantalla
// solo lee las tablas y llama a las RPC.

const euro = (v) => fmtEUR(v)
const ESTADOS = {
  pendiente:  { label: 'Por enviar', tono: 'warning' },
  enviada:    { label: 'Enviada', tono: 'sage' },
  arrastrada: { label: 'Descontada en el día siguiente', tono: 'neutral' },
}
const dia = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
const fechaCorta = (ts) => ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''
const hora = (ts) => new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const quien = (pl) => (pl === 'lector_tpv' ? 'Lector del local' : 'Móvil del repartidor')
// Fecha de hoy en local (no UTC): de madrugada toISOString() daría el día anterior.
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function LiquidacionesDiarias() {
  const [rows, setRows] = useState([])
  const [activos, setActivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendientes')
  const [sel, setSel] = useState(() => new Set())
  const [abierta, setAbierta] = useState(null)
  const [lineas, setLineas] = useState({})
  const [generando, setGenerando] = useState(false)
  const [modal, setModal] = useState(null) // { filas, total, fecha, referencia, guardando }

  async function cargar() {
    setLoading(true)
    const [r, a] = await Promise.all([
      supabase.from('liquidaciones_diarias')
        .select('*, establecimientos(id, nombre)')
        .order('jornada', { ascending: false })
        .order('neto', { ascending: false })
        .limit(400),
      supabase.from('establecimientos')
        .select('id, nombre, liquidacion_diaria_desde')
        .not('liquidacion_diaria_desde', 'is', null)
        .order('nombre'),
    ])
    if (r.error) toast('Error cargando las liquidaciones diarias: ' + r.error.message, 'error')
    setRows(r.data || [])
    setActivos(a.data || [])
    setSel(new Set())
    setLineas({})
    setAbierta(null)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const enviable = (r) => r.estado === 'pendiente' && Number(r.neto) > 0
  const visibles = filtro === 'pendientes' ? rows.filter(r => r.estado === 'pendiente') : rows
  const totPorEnviar = rows.filter(enviable).reduce((s, r) => s + Number(r.neto || 0), 0)
  const totDeben = rows.filter(r => r.estado === 'pendiente' && Number(r.neto) < 0)
    .reduce((s, r) => s + Math.abs(Number(r.neto || 0)), 0)
  const enviadoMes = useMemo(() => {
    const ahora = new Date()
    return rows.filter(r => r.estado === 'enviada' && r.enviado_at
      && new Date(r.enviado_at).getMonth() === ahora.getMonth()
      && new Date(r.enviado_at).getFullYear() === ahora.getFullYear())
      .reduce((s, r) => s + Number(r.neto || 0), 0)
  }, [rows])

  const seleccion = rows.filter(r => sel.has(r.id))
  const totSel = seleccion.reduce((s, r) => s + Number(r.neto || 0), 0)

  function toggleSel(r) {
    if (!enviable(r)) return
    setSel(prev => {
      const n = new Set(prev)
      if (n.has(r.id)) n.delete(r.id); else n.add(r.id)
      return n
    })
  }

  function seleccionarRestaurante(estId) {
    setSel(new Set(rows.filter(r => r.establecimiento_id === estId && enviable(r)).map(r => r.id)))
  }

  async function verCobros(r) {
    if (abierta === r.id) { setAbierta(null); return }
    setAbierta(r.id)
    if (lineas[r.id]) return
    const { data, error } = await supabase.from('liquidacion_diaria_lineas')
      .select('*').eq('liquidacion_id', r.id).order('cobrado_at')
    if (error) { toast('No se pudieron cargar los cobros: ' + error.message, 'error'); return }
    setLineas(prev => ({ ...prev, [r.id]: data || [] }))
  }

  async function generar() {
    setGenerando(true)
    const { data, error } = await supabase.rpc('liquidacion_diaria_generar', {})
    setGenerando(false)
    if (error) { toast('No se pudo generar: ' + error.message, 'error'); return }
    const lista = data?.restaurantes || []
    const errores = lista.filter(x => x.error)
    if (errores.length) {
      toast(`Generado con errores: ${errores.map(x => `${x.nombre}: ${x.error}`).join(' · ')}`, 'error')
    } else if (lista.length === 0) {
      toast('Ningún restaurante tiene la liquidación diaria activa', 'error')
    } else {
      const conDinero = lista.filter(x => !x.sin_movimiento && !x.omitido)
      toast(`Día ${dia(data.jornada)}: ${conDinero.length} con cobros${conDinero.length ? ' · ' + conDinero.map(x => `${x.nombre} ${euro(x.neto)}`).join(' · ') : ''}`, 'success')
    }
    cargar()
  }

  function abrirEnvio() {
    if (seleccion.length === 0) return
    // Varias filas = UNA transferencia: tienen que ser del mismo restaurante.
    if (new Set(seleccion.map(r => r.establecimiento_id)).size > 1) {
      toast('Elige días de un solo restaurante: se marcan juntos porque van en la misma transferencia', 'error')
      return
    }
    setModal({ filas: seleccion, total: totSel, fecha: hoyISO(), referencia: '', guardando: false })
  }

  async function confirmarEnvio() {
    if (!modal || modal.guardando) return
    if (!modal.fecha) { toast('Indica la fecha de la transferencia', 'error'); return }
    setModal(m => ({ ...m, guardando: true }))
    const { error } = await supabase.rpc('liquidacion_diaria_marcar_enviada', {
      p_ids: modal.filas.map(r => r.id),
      // Mediodía local: evita que la fecha se desplace un día al pasar a UTC.
      p_enviado_at: new Date(`${modal.fecha}T12:00:00`).toISOString(),
      p_referencia: modal.referencia.trim() || null,
      // Si mientras tanto el cron ha rehecho algún día, la RPC se niega (PD426).
      p_total_esperado: Math.round(modal.total * 100) / 100,
    })
    if (error) {
      toast('No se pudo marcar: ' + error.message, 'error')
      setModal(m => (m ? { ...m, guardando: false } : m))
      return
    }
    toast(`Marcado como enviado: ${euro(modal.total)} a ${modal.filas[0]?.establecimientos?.nombre || 'el restaurante'}`, 'success')
    setModal(null)
    cargar()
  }

  async function deshacer(r) {
    const ok = await confirmar(
      `¿Deshacer el envío de ${r.establecimientos?.nombre || 'este restaurante'} del ${dia(r.jornada)} (${euro(r.neto)})?\n\n` +
      'Vuelve a "Por enviar". Úsalo solo si lo marcaste por error y la transferencia NO se hizo.'
    )
    if (!ok) return
    const { error } = await supabase.rpc('liquidacion_diaria_deshacer_envio', { p_id: r.id })
    if (error) { toast('No se pudo deshacer: ' + error.message, 'error'); return }
    toast('Envío deshecho', 'success')
    cargar()
  }

  return (
    <div>
      <div className="ds-cards" style={{ marginBottom: 16 }}>
        <StatCard label="Por enviar" value={euro(totPorEnviar)} sub="A favor de los restaurantes" tone="sage" />
        <StatCard label="Enviado este mes" value={euro(enviadoMes)} sub="Liquidaciones diarias marcadas" />
        {totDeben > 0.004 && (
          <StatCard label="Restaurantes deben" value={euro(totDeben)} sub="Devoluciones: se descuentan solas en los días siguientes" tone="terracotta" />
        )}
      </div>

      <Card pad={14} style={{ marginBottom: 16, background: colors.infoSoft, borderColor: colors.info }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: colors.onInfoSoft, ...type.label, lineHeight: 1.5 }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Se generan solas cada mañana con el día anterior (de 05:00 a 05:00). Entran los cobros con tarjeta en persona:
            el <b>lector del local</b> y el <b>móvil del repartidor</b>, menos la comisión de Stripe (la paga el restaurante).
            Lo de la app y la web va en la semanal. Si se devuelve un cobro ya enviado, se descuenta solo en el siguiente día.
            {' '}{activos.length === 0
              ? 'Ningún restaurante la tiene activa: se enciende en su ficha, en la tarjeta del TPV.'
              : <>Activa en: <b>{activos.map(a => a.nombre).join(', ')}</b>.</>}
          </span>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Segmented
          options={[{ value: 'pendientes', label: 'Por enviar' }, { value: 'todas', label: 'Todas' }]}
          value={filtro} onChange={setFiltro}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <GhostBtn onClick={generar} disabled={generando} style={{ opacity: generando ? 0.6 : 1 }}
            title="Rehace el día de ayer (y los que sigan por enviar). Normalmente lo hace el sistema solo a las 06:00.">
            <RefreshCw size={15} /> {generando ? 'Generando…' : 'Generar ayer'}
          </GhostBtn>
          <GlossyBtn accent onClick={abrirEnvio} disabled={seleccion.length === 0}
            style={{ opacity: seleccion.length === 0 ? 0.5 : 1 }}>
            <Check size={15} /> {seleccion.length === 0 ? 'Marcar enviadas' : `Marcar enviadas (${seleccion.length} · ${euro(totSel)})`}
          </GlossyBtn>
        </div>
      </div>

      {loading ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : visibles.length === 0 ? (
        <Card pad={0}>
          <Vacio
            titulo={filtro === 'pendientes' ? 'Nada por enviar' : 'Todavía no hay liquidaciones diarias'}
            texto={activos.length === 0
              ? 'Actívala en la ficha del restaurante (tarjeta del TPV). Empieza al día siguiente a las 05:00.'
              : 'Cada mañana aparece aquí lo que cobraron el día anterior con tarjeta en persona.'}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibles.map(r => {
            const est = ESTADOS[r.estado] || { label: r.estado || '—', tono: 'neutral' }
            const neto = Number(r.neto || 0)
            const puede = enviable(r)
            const marcada = sel.has(r.id)
            const nombre = r.establecimientos?.nombre || '—'
            const ls = lineas[r.id]
            return (
              <Card key={r.id} pad={14} style={marcada ? { borderColor: colors.terracotta, boxShadow: `0 0 0 1px ${colors.terracotta}` } : undefined}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 22, paddingTop: 2 }}>
                    {puede && (
                      <input type="checkbox" checked={marcada} onChange={() => toggleSel(r)}
                        aria-label={`Elegir ${nombre} del ${dia(r.jornada)}`}
                        style={{ width: 18, height: 18, accentColor: colors.terracotta, cursor: 'pointer' }} />
                    )}
                  </div>
                  <div style={{ flex: '2 1 220px', minWidth: 0 }}>
                    <div style={{ ...type.label, fontWeight: 700, color: colors.text }}>{nombre}</div>
                    <div style={{ ...type.caption, color: colors.textMute, marginTop: 2, textTransform: 'capitalize' }}>
                      {dia(r.jornada)} · {r.cobros_count} cobro{r.cobros_count === 1 ? '' : 's'}
                    </div>
                    <div style={{ ...type.caption, color: colors.textMute, marginTop: 6, lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
                      Cobrado {euro(r.bruto)} · Stripe −{euro(r.comision_stripe)}
                      {Number(r.devoluciones) > 0.004 && <> · Devoluciones −{euro(r.devoluciones)}</>}
                      {Math.abs(Number(r.saldo_anterior)) > 0.004 && <> · Días anteriores {euro(r.saldo_anterior)}</>}
                    </div>
                  </div>
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, textAlign: 'right' }}>
                    <div style={{ ...type.num, fontSize: 20, color: r.estado === 'arrastrada' ? colors.textMute : neto >= 0 ? colors.onSageSoft : colors.onTerracottaSoft }}>
                      {r.estado === 'arrastrada' ? euro(neto) : neto >= 0 ? `Enviar ${euro(neto)}` : `Debe ${euro(Math.abs(neto))}`}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Chip tono={est.tono}>{est.label}</Chip>
                      {r.estado === 'enviada' && (r.enviado_at || r.referencia) && (
                        <span style={{ ...type.caption, color: colors.textMute }}>
                          {[fechaCorta(r.enviado_at), r.referencia].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <MiniBtn onClick={() => verCobros(r)} aria-expanded={abierta === r.id}>
                        {abierta === r.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Ver cobros
                      </MiniBtn>
                      {puede && !marcada && rows.filter(x => x.establecimiento_id === r.establecimiento_id && enviable(x)).length > 1 && (
                        <MiniBtn onClick={() => seleccionarRestaurante(r.establecimiento_id)}
                          title="Elegir todos sus días por enviar (una sola transferencia)">
                          Todos sus días
                        </MiniBtn>
                      )}
                      {r.estado === 'enviada' && (
                        <MiniBtn onClick={() => deshacer(r)} title="Solo si se marcó por error">
                          <Undo2 size={13} /> Deshacer
                        </MiniBtn>
                      )}
                    </div>
                  </div>
                </div>

                {abierta === r.id && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
                    {!ls ? (
                      <div style={{ ...type.caption, color: colors.textMute }}>Cargando…</div>
                    ) : ls.length === 0 ? (
                      <div style={{ ...type.caption, color: colors.textMute }}>
                        Sin cobros propios: solo arrastra el saldo de días anteriores.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ls.map(l => (
                          <div key={l.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', ...type.caption, padding: '6px 0', borderBottom: `1px dashed ${colors.border}` }}>
                            <span style={{ color: colors.text, minWidth: 150 }}>
                              {l.tipo === 'devolucion' ? <b style={{ color: colors.onTerracottaSoft }}>Devolución · </b> : null}
                              {l.pedido_codigo || 'Pedido'} · {hora(l.cobrado_at)}
                            </span>
                            <span style={{ color: colors.textMute, minWidth: 130 }}>{quien(l.plataforma)}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.textMute }}>
                              {euro(l.importe)} − {euro(l.comision)} = <b style={{ color: Number(l.neto) < 0 ? colors.onTerracottaSoft : colors.text }}>{euro(l.neto)}</b>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {modal && (() => {
        const nombre = modal.filas[0]?.establecimientos?.nombre || 'Restaurante'
        return (
          <div onClick={() => { if (!modal.guardando) setModal(null) }} style={ds.modal}>
            <div onClick={e => e.stopPropagation()} className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 440 }}>
              <div style={ds.h3}>Marcar como enviado</div>
              <div style={{ ...type.body, color: colors.textMute, marginTop: 4 }}>
                {nombre} · {modal.filas.length} día{modal.filas.length === 1 ? '' : 's'}
              </div>

              <div style={{ marginTop: 12, borderRadius: radius.md, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                {modal.filas.slice().sort((a, b) => (a.jornada < b.jornada ? -1 : 1)).map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, ...type.label }}>
                    <span style={{ color: colors.textMute, textTransform: 'capitalize' }}>{dia(f.jornada)}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: colors.text }}>{euro(f.neto)}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: radius.md, background: colors.elev2, border: `1px solid ${colors.border}` }}>
                <div style={{ ...type.label, color: colors.textMute }}>Le transfieres</div>
                <div style={{ ...type.num, fontSize: 28, marginTop: 4, color: colors.onSageSoft }}>{euro(modal.total)}</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={ds.label}>Fecha de la transferencia</label>
                <input type="date" value={modal.fecha} style={ds.formInput}
                  onChange={e => setModal(m => ({ ...m, fecha: e.target.value }))} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={ds.label}>Referencia (opcional)</label>
                <input type="text" value={modal.referencia} autoFocus style={ds.formInput}
                  placeholder="Nº de transferencia, Bizum, concepto…"
                  onChange={e => setModal(m => ({ ...m, referencia: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarEnvio() }} />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <GhostBtn onClick={() => setModal(null)} disabled={modal.guardando}>Cancelar</GhostBtn>
                <GlossyBtn accent onClick={confirmarEnvio} disabled={modal.guardando} style={{ opacity: modal.guardando ? 0.6 : 1 }}>
                  <Check size={15} /> {modal.guardando ? 'Guardando…' : 'Confirmar envío'}
                </GlossyBtn>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
