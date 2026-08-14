import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, MiniBtn, PillTabs, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { Scale, Ban, Clock, CheckCircle, Search } from 'lucide-react'
import { toast, confirmar } from '../App'

// Cargos a socios por pedidos cancelados por no-cobertura (nadie los acepto en 2 vueltas).
// El socio responsable (R1) asume el 80% del subtotal. El super-admin puede ANULAR un cargo
// (accidente justificado). El descuento real se reconcilia en el pago (semi-manual).
export default function Cargos() {
  const [cargos, setCargos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendiente') // pendiente | aplicado | anulado | todos
  const [busqueda, setBusqueda] = useState('')
  const [procesando, setProcesando] = useState(null)
  const [stats, setStats] = useState({ pendientes: 0, totalPendiente: 0, anulados: 0 })

  useEffect(() => { cargar() }, [filtro])

  async function cargar() {
    setLoading(true)
    let q = supabase.from('cargos_socio')
      .select('id, tipo, monto, concepto, estado, created_at, anulado_motivo, anulado_at, socio:socios(nombre, nombre_comercial), establecimiento:establecimientos(nombre), pedido:pedidos(codigo)')
      .order('created_at', { ascending: false })
    if (filtro !== 'todos') q = q.eq('estado', filtro)
    const { data } = await q
    setCargos(data || [])

    const { data: all } = await supabase.from('cargos_socio').select('estado, monto')
    const pend = (all || []).filter(c => c.estado === 'pendiente')
    setStats({
      pendientes: pend.length,
      totalPendiente: pend.reduce((s, c) => s + Number(c.monto || 0), 0),
      anulados: (all || []).filter(c => c.estado === 'anulado').length,
    })
    setLoading(false)
  }

  async function anular(cargo) {
    const quien = cargo.socio?.nombre_comercial || cargo.socio?.nombre || 'el socio'
    const motivo = window.prompt(`Anular el cargo de ${Number(cargo.monto).toFixed(2)} EUR a ${quien}. Motivo (opcional):`, 'Anulado por el super-admin')
    if (motivo === null) return
    if (!(await confirmar(`Vas a ANULAR el cargo de ${Number(cargo.monto).toFixed(2)} EUR a ${quien}. No se le descontará nada. ¿Continuar?`))) return
    setProcesando(cargo.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.from('cargos_socio')
        .update({ estado: 'anulado', anulado_por: session?.user?.id || null, anulado_motivo: motivo || null, anulado_at: new Date().toISOString() })
        .eq('id', cargo.id).eq('estado', 'pendiente')
      if (error) throw error
      toast('Cargo anulado. No se le descontará al socio.')
      cargar()
    } catch (e) { toast(e.message || 'No se pudo anular el cargo', 'error') }
    setProcesando(null)
  }

  async function marcarAplicado(cargo) {
    if (!(await confirmar(`Marcar como saldado el cargo de ${Number(cargo.monto).toFixed(2)} EUR (ya reconciliado en el pago). ¿Continuar?`))) return
    setProcesando(cargo.id)
    try {
      const { error } = await supabase.from('cargos_socio')
        .update({ estado: 'aplicado' }).eq('id', cargo.id).eq('estado', 'pendiente')
      if (error) throw error
      toast('Cargo marcado como saldado.')
      cargar()
    } catch (e) { toast(e.message || 'No se pudo actualizar', 'error') }
    setProcesando(null)
  }

  const filtrados = cargos.filter(c => {
    if (!busqueda) return true
    const s = busqueda.toLowerCase()
    return (c.socio?.nombre_comercial || c.socio?.nombre || '').toLowerCase().includes(s)
      || (c.establecimiento?.nombre || '').toLowerCase().includes(s)
      || (c.pedido?.codigo || '').toLowerCase().includes(s)
  })

  const euro = (v) => fmtEUR(v)
  const fecha = (f) => f ? new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
  const badgeEstado = {
    pendiente: { tono: 'warning', label: 'Pendiente' },
    aplicado:  { tono: 'sage',    label: 'Saldado' },
    anulado:   { tono: 'neutral', label: 'Anulado' },
  }

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 20 }}>
        <h1 style={{ ...ds.h1, marginBottom: 4 }}>Cargos a socios</h1>
        <p style={{ ...type.body, color: colors.textMute, maxWidth: 760 }}>
          Compensación del 80 % del subtotal cuando un pedido se cancela porque ningún repartidor lo aceptó (2 vueltas). Lo asume el primer repartidor asignado.
        </p>
      </div>

      <div className="ds-cards" style={{ marginBottom: 20 }}>
        <StatCard label="Cargos pendientes" value={stats.pendientes} sub="Sin saldar ni anular" icon={<Clock size={17} />} tone={stats.pendientes ? 'terracotta' : 'ink'} />
        <StatCard label="Total pendiente" value={euro(stats.totalPendiente)} sub="Por descontar a socios" icon={<Scale size={17} />} tone={stats.totalPendiente ? 'danger' : 'ink'} />
        <StatCard label="Anulados" value={stats.anulados} sub="Perdonados" icon={<Ban size={17} />} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <PillTabs
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'aplicado', label: 'Saldados' },
            { value: 'anulado', label: 'Anulados' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.stone }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            aria-label="Buscar cargos"
            placeholder="Socio, restaurante o código…"
            style={{ ...ds.input, paddingLeft: 34, width: 280 }} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : filtrados.length === 0 ? (
        <Card pad={0}>
          <Vacio
            icon={<Scale size={28} />}
            titulo={busqueda ? 'Ningún cargo con esa búsqueda' : 'Ningún cargo aquí'}
            texto={busqueda
              ? 'Prueba con el nombre del socio, el del restaurante o el código del pedido.'
              : filtro === 'pendiente'
                ? 'No hay cargos pendientes: ningún pedido se ha quedado sin repartidor.'
                : 'No hay cargos en este estado.'}
          />
        </Card>
      ) : (
        <div className="ds-table-stack" style={ds.table}>
          <div className="ds-th" style={ds.tableHeader}>
            <span style={{ flex: '1.4 1 140px', minWidth: 0 }}>Socio</span>
            <span style={{ flex: '1.4 1 150px', minWidth: 0 }}>Restaurante / pedido</span>
            <span style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>Importe</span>
            <span style={{ width: 110, flexShrink: 0 }}>Estado</span>
            <span data-tablet-sm-hide="true" style={{ width: 90, flexShrink: 0 }}>Fecha</span>
            <span style={{ width: 160, flexShrink: 0 }} />
          </div>

          {filtrados.map(c => {
            const b = badgeEstado[c.estado] || badgeEstado.pendiente
            return (
              <div key={c.id} className="ds-row-touch" style={{ ...ds.tableRow, background: c.estado === 'pendiente' ? colors.warningSoft : 'transparent' }}>
                <div data-col="nom" style={{ flex: '1.4 1 140px', minWidth: 0, ...type.label, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.socio?.nombre_comercial || c.socio?.nombre || '—'}
                </div>
                <div data-col="cod" style={{ flex: '1.4 1 150px', minWidth: 0 }}>
                  <div style={{ ...type.label, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.establecimiento?.nombre || '—'}</div>
                  <div style={{ ...type.mono, fontSize: 12, color: colors.textMute, marginTop: 2 }}>{c.pedido?.codigo || '—'}</div>
                </div>
                <div data-col="tot" style={{ width: 100, flexShrink: 0, textAlign: 'right', ...type.label, fontWeight: 700, color: colors.onDangerSoft, fontVariantNumeric: 'tabular-nums' }}>
                  {euro(c.monto)}
                </div>
                <div data-col="est" style={{ width: 110, flexShrink: 0 }}>
                  <Chip tono={b.tono} title={c.estado === 'anulado' ? (c.anulado_motivo || '') : ''}>{b.label}</Chip>
                </div>
                <div data-col="fec" data-tablet-sm-hide="true" style={{ width: 90, flexShrink: 0, ...type.caption, color: colors.textMute }}>
                  {fecha(c.created_at)}
                </div>
                <div data-col="acc" style={{ width: 160, flexShrink: 0, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {c.estado === 'pendiente' ? (
                    <>
                      <MiniBtn onClick={() => marcarAplicado(c)} disabled={procesando === c.id} style={{ opacity: procesando === c.id ? 0.6 : 1 }}>
                        Saldar
                      </MiniBtn>
                      <MiniBtn danger onClick={() => anular(c)} disabled={procesando === c.id} style={{ opacity: procesando === c.id ? 0.6 : 1 }}>
                        <Ban size={12} /> Anular
                      </MiniBtn>
                    </>
                  ) : c.estado === 'anulado' ? (
                    <span style={{ ...type.caption, color: colors.textMute }} title={c.anulado_motivo || ''}>Perdonado</span>
                  ) : (
                    <span style={{ ...type.caption, color: colors.onSageSoft, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} /> Saldado
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Card pad={16} style={{ marginTop: 20, background: colors.infoSoft, borderColor: colors.info }}>
        <div style={{ ...type.label, fontWeight: 700, color: colors.onInfoSoft, marginBottom: 6 }}>Cómo funciona</div>
        <ul style={{ ...type.label, color: colors.onInfoSoft, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>El cargo se crea automáticamente cuando un pedido delivery se cancela porque nadie lo aceptó tras 2 vueltas.</li>
          <li>Lo asume el <b>primer repartidor asignado</b> (el más cercano) = 80% del subtotal, para que el restaurante no pierda la comida.</li>
          <li><b>Saldar</b>: marcarlo como ya reconciliado en el pago (el restaurante cobró menos del socio). <b>Anular</b>: perdonarlo (accidente justificado).</li>
          <li>El movimiento real del dinero se reconcilia en el pago socio↔restaurante (semi-manual).</li>
        </ul>
      </Card>
    </div>
  )
}
