import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
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

  const euro = (v) => `${Number(v || 0).toFixed(2)} EUR`
  const fecha = (f) => f ? new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'
  const badgeEstado = {
    pendiente: { bg: 'var(--c-warning-soft)', color: 'var(--c-warning)', label: 'Pendiente' },
    aplicado: { bg: 'var(--c-surface2)', color: 'var(--c-text)', label: 'Saldado' },
    anulado: { bg: 'var(--c-surface2)', color: 'var(--c-muted)', label: 'Anulado' },
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={ds.h1}>Cargos a socios</h1>
          <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
            Compensación del 80% del subtotal cuando un pedido se cancela porque ningún repartidor lo aceptó (2 vueltas). Lo asume el primer repartidor asignado.
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
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600 }}>Cargos pendientes</div>
          </div>
        </div>
        <div style={{ ...ds.card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--c-danger-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scale size={20} color="#EF4444" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{euro(stats.totalPendiente)}</div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600 }}>Total pendiente</div>
          </div>
        </div>
        <div style={{ ...ds.card, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--c-surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ban size={20} color="var(--c-muted)" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{stats.anulados}</div>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', fontWeight: 600 }}>Anulados</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { id: 'pendiente', label: 'Pendientes', color: 'var(--c-warning)' },
          { id: 'aplicado', label: 'Saldados', color: 'var(--c-text)' },
          { id: 'anulado', label: 'Anulados', color: 'var(--c-muted)' },
          { id: 'todos', label: 'Todos', color: '#C5562C' },
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
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por socio, restaurante o código..."
            style={{ ...ds.input, paddingLeft: 30, width: 280 }} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-muted)' }}>Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--c-muted)' }}>
          <Scale size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay cargos {filtro !== 'todos' ? `(${filtro}s)` : ''}</div>
        </div>
      ) : (
        <div style={ds.table}>
          <div style={{ ...ds.tableHeader, gridTemplateColumns: '1fr' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 90px 80px 160px', width: '100%', gap: 12 }}>
              <span>Socio</span>
              <span>Restaurante / pedido</span>
              <span>Importe</span>
              <span>Estado</span>
              <span>Fecha</span>
              <span style={{ textAlign: 'right' }}>Acción</span>
            </div>
          </div>

          {filtrados.map(c => {
            const b = badgeEstado[c.estado] || badgeEstado.pendiente
            return (
              <div key={c.id} style={{ ...ds.tableRow, background: c.estado === 'pendiente' ? 'rgba(251,191,36,0.03)' : 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 90px 80px 160px', width: '100%', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>
                    {c.socio?.nombre_comercial || c.socio?.nombre || '—'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{c.establecimiento?.nombre || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>{c.pedido?.codigo || '—'}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#EF4444' }}>{euro(c.monto)}</div>
                  <div><span style={{ ...ds.badge, background: b.bg, color: b.color }}>{b.label}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{fecha(c.created_at)}</div>
                  <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {c.estado === 'pendiente' ? (
                      <>
                        <button onClick={() => marcarAplicado(c)} disabled={procesando === c.id}
                          style={{ ...ds.filterBtn, background: 'var(--c-surface2)', color: 'var(--c-text)', fontSize: 12, opacity: procesando === c.id ? 0.6 : 1 }}>
                          Saldar
                        </button>
                        <button onClick={() => anular(c)} disabled={procesando === c.id}
                          style={{ ...ds.filterBtn, background: 'transparent', color: 'var(--c-danger)', border: '1px solid var(--c-danger)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: procesando === c.id ? 0.6 : 1 }}>
                          <Ban size={12} /> Anular
                        </button>
                      </>
                    ) : c.estado === 'anulado' ? (
                      <span style={{ fontSize: 11, color: 'var(--c-muted)' }} title={c.anulado_motivo || ''}>Anulado</span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--c-muted)' }}><CheckCircle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Saldado</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#C5562C', marginBottom: 6 }}>Cómo funciona</div>
        <ul style={{ fontSize: 12, color: 'var(--c-muted)', lineHeight: 1.8, margin: 0, paddingLeft: 16 }}>
          <li>El cargo se crea automáticamente cuando un pedido delivery se cancela porque nadie lo aceptó tras 2 vueltas.</li>
          <li>Lo asume el <b>primer repartidor asignado</b> (el más cercano) = 80% del subtotal, para que el restaurante no pierda la comida.</li>
          <li><b>Saldar</b>: marcarlo como ya reconciliado en el pago (el restaurante cobró menos del socio). <b>Anular</b>: perdonarlo (accidente justificado).</li>
          <li>El movimiento real del dinero se reconcilia en el pago socio↔restaurante (semi-manual).</li>
        </ul>
      </div>
    </div>
  )
}
