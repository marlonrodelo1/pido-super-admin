import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import AsignarManualModal from '../components/AsignarManualModal'

const ESTADOS_ACTIVOS = ['nuevo', 'aceptado', 'preparando', 'listo', 'recogido', 'en_camino']

// Detecta si un pedido delivery esta "atascado":
// - Sin rider y > 5 min desde creado, o
// - Con rider esperando aceptacion > 90s sin progresar
function detectarAtasco(p) {
  if (p.modo_entrega !== 'delivery') return false
  if (!ESTADOS_ACTIVOS.includes(p.estado)) return false
  const ahora = Date.now()
  if (!p.rider_account_id) {
    const created = new Date(p.created_at).getTime()
    if (ahora - created > 5 * 60 * 1000) return true
  } else if (p.shipday_status === 'created' && p.assigned_at) {
    const assigned = new Date(p.assigned_at).getTime()
    if (ahora - assigned > 90 * 1000) return true
  }
  return false
}

export default function Pedidos() {
  const [items, setItems] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [filtroPago, setFiltroPago] = useState('todos')
  const [detalle, setDetalle] = useState(null)
  const [detalleItems, setDetalleItems] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [estabDetalle, setEstabDetalle] = useState(null)
  const [riderDetalle, setRiderDetalle] = useState(null)
  const [modalAsignar, setModalAsignar] = useState(null) // { pedido, establecimiento }

  useEffect(() => {
    load()
    const channel = supabase.channel('admin-pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function load() {
    const { data } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false }).limit(200)
    setItems(data || [])
  }

  async function verDetalle(p) {
    setDetalle(p)
    const [itemsRes, asignRes, estRes, riderRes] = await Promise.all([
      supabase.from('pedido_items').select('*').eq('pedido_id', p.id),
      supabase
        .from('pedido_asignaciones')
        .select('*, rider_accounts(nombre, telefono)')
        .eq('pedido_id', p.id)
        .order('created_at', { ascending: false }),
      p.establecimiento_id
        ? supabase.from('establecimientos').select('id, nombre, direccion, latitud, longitud, telefono').eq('id', p.establecimiento_id).maybeSingle()
        : Promise.resolve({ data: null }),
      p.rider_account_id
        ? supabase.from('rider_accounts').select('id, nombre, telefono').eq('id', p.rider_account_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setDetalleItems(itemsRes.data || [])
    setAsignaciones(asignRes.data || [])
    setEstabDetalle(estRes.data || null)
    setRiderDetalle(riderRes.data || null)
  }

  async function refrescarDetalle() {
    if (!detalle) return
    const { data: pedidoFresh } = await supabase.from('pedidos').select('*').eq('id', detalle.id).maybeSingle()
    if (pedidoFresh) {
      setDetalle(pedidoFresh)
      verDetalle(pedidoFresh)
    }
    load()
  }

  async function cancelarPedido(id) {
    await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', id)
    setDetalle(null)
    load()
  }

  async function abrirAsignar(pedido) {
    let est = null
    if (pedido.establecimiento_id) {
      const { data } = await supabase
        .from('establecimientos')
        .select('id, nombre, latitud, longitud')
        .eq('id', pedido.establecimiento_id)
        .maybeSingle()
      est = data
    }
    setModalAsignar({ pedido, establecimiento: est })
  }

  const filtrados = items.filter(p => {
    if (filtro !== 'todos' && p.estado !== filtro) return false
    if (filtroPago !== 'todos' && p.metodo_pago !== filtroPago) return false
    return true
  })

  const estadoColor = { nuevo: '#FF6B2C', aceptado: '#FF6B2C', preparando: '#FF6B2C', listo: 'var(--c-text-soft)', recogido: 'var(--c-text-soft)', en_camino: '#FF6B2C', entregado: 'var(--c-text)', cancelado: 'var(--c-danger)', fallido: 'var(--c-danger)' }
  const estados = ['todos', 'nuevo', 'aceptado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado']

  if (detalle) {
    const sinRider = detalle.shipday_status === 'no_rider'
    const atascado = detectarAtasco(detalle)
    const puedeAsignar = detalle.modo_entrega === 'delivery'
      && detalle.estado !== 'entregado'
      && detalle.estado !== 'cancelado'

    return (
      <div>
        <button onClick={() => setDetalle(null)} style={ds.backBtn}>← Volver</button>
        <div style={ds.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)' }}>{detalle.codigo}</h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ ...ds.badge, background: (estadoColor[detalle.estado] || '#6B7280') + '15', color: estadoColor[detalle.estado] }}>{detalle.estado}</span>
                <span style={{ ...ds.badge, background: detalle.metodo_pago === 'tarjeta' ? 'var(--c-info-soft)' : 'var(--c-warning-soft)', color: detalle.metodo_pago === 'tarjeta' ? 'var(--c-info)' : 'var(--c-warning)' }}>{detalle.metodo_pago}</span>
                <span style={{ ...ds.badge, background: 'var(--c-primary-soft)', color: '#FF6B2C' }}>PIDO</span>
                {sinRider && (
                  <span style={{ ...ds.badge, background: colors.dangerSoft, color: colors.danger, border: `1px solid ${colors.danger}` }}>
                    🚨 Sin rider
                  </span>
                )}
                {atascado && !sinRider && (
                  <span style={{ ...ds.badge, background: colors.warningSoft, color: colors.warning, border: `1px solid ${colors.warning}` }}>
                    ⏰ Atascado
                  </span>
                )}
                {detalle.intento_asignacion > 0 && (
                  <span style={{ ...ds.badge, background: colors.primarySoft, color: colors.primary }}>
                    Intento {detalle.intento_asignacion}/3
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {puedeAsignar && (
                <button
                  onClick={() => abrirAsignar(detalle)}
                  style={{
                    ...ds.primaryBtn,
                    background: sinRider || atascado ? colors.danger : colors.primary,
                    padding: '8px 14px', fontWeight: 700,
                  }}
                >
                  {detalle.rider_account_id ? 'Reasignar' : 'Asignar manual'}
                </button>
              )}
              {detalle.estado !== 'cancelado' && detalle.estado !== 'entregado' && (
                <button onClick={() => cancelarPedido(detalle.id)} style={{ ...ds.actionBtn, color: 'var(--c-danger)', padding: '6px 14px' }}>Cancelar pedido</button>
              )}
            </div>
          </div>

          <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, marginBottom: 24, color: 'var(--c-text)' }}>
            <div><strong>Subtotal:</strong> {detalle.subtotal?.toFixed(2)}EUR</div>
            <div><strong>Envio:</strong> {detalle.coste_envio?.toFixed(2)}EUR</div>
            <div><strong>Propina:</strong> {detalle.propina?.toFixed(2)}EUR</div>
            <div><strong>Total:</strong> <span style={{ fontWeight: 800 }}>{detalle.total?.toFixed(2)}EUR</span></div>
            <div><strong>Direccion:</strong> {detalle.direccion_entrega || '-'}</div>
            <div><strong>Notas:</strong> {detalle.notas || '-'}</div>
            <div><strong>Preparacion:</strong> {detalle.minutos_preparacion || '-'} min</div>
            <div><strong>Creado:</strong> {new Date(detalle.created_at).toLocaleString('es-ES')}</div>
            <div><strong>Restaurante:</strong> {estabDetalle?.nombre || '-'}</div>
            <div>
              <strong>Rider:</strong>{' '}
              {riderDetalle ? `${riderDetalle.nombre}${riderDetalle.telefono ? ' · ' + riderDetalle.telefono : ''}` : 'Sin asignar'}
            </div>
            {detalle.assigned_at && (
              <div><strong>Asignado:</strong> {new Date(detalle.assigned_at).toLocaleString('es-ES')}</div>
            )}
            {detalle.shipday_status && (
              <div><strong>Shipday:</strong> {detalle.shipday_status}</div>
            )}
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'var(--c-text)' }}>Items del pedido</h3>
          <div style={{ background: 'var(--c-surface2)', borderRadius: 10, overflow: 'hidden' }}>
            {detalleItems.map(item => (
              <div key={item.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-text)' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{item.cantidad}x</span> {item.nombre_producto}
                  {item.tamano && <span style={{ color: 'var(--c-muted)' }}> ({item.tamano})</span>}
                  {item.extras?.length > 0 && <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 2 }}>+ {item.extras.join(', ')}</div>}
                  {item.notas && <div style={{ fontSize: 11, color: '#FF6B2C', marginTop: 2 }}>{item.notas}</div>}
                </div>
                <span style={{ fontWeight: 700 }}>{(item.precio_unitario * item.cantidad).toFixed(2)}EUR</span>
              </div>
            ))}
            {detalleItems.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>Sin items</div>}
          </div>

          {/* Historial de asignaciones */}
          {asignaciones.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: colors.text }}>
                Historial de asignacion ({asignaciones.length})
              </h3>
              <div style={{ background: colors.elev2, borderRadius: 10, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
                {asignaciones.map((a) => {
                  const rider = a.rider_accounts
                  const estadoColors = {
                    aceptado: { bg: colors.successSoft, fg: colors.success },
                    esperando_aceptacion: { bg: colors.primarySoft, fg: colors.primary },
                    timeout: { bg: colors.warningSoft, fg: colors.warning },
                    rechazado: { bg: colors.dangerSoft, fg: colors.danger },
                    cancelado_manual: { bg: colors.elev2, fg: colors.textMute },
                    sin_riders: { bg: colors.dangerSoft, fg: colors.danger },
                  }
                  const c = estadoColors[a.estado] || { bg: colors.elev2, fg: colors.textMute }
                  return (
                    <div key={a.id} style={{
                      padding: '10px 14px',
                      borderBottom: `1px solid ${colors.border}`,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      fontSize: 12.5, color: colors.text,
                    }}>
                      <span style={{
                        ...ds.badge,
                        background: colors.primarySoft, color: colors.primary,
                        minWidth: 60, justifyContent: 'center',
                      }}>
                        Intento {a.intento}
                      </span>
                      <span style={{ flex: 1, minWidth: 120, fontWeight: 700 }}>
                        {rider?.nombre || 'Rider eliminado'}
                        {rider?.telefono && (
                          <span style={{ fontWeight: 400, color: colors.textMute }}> · {rider.telefono}</span>
                        )}
                      </span>
                      <span style={{ ...ds.badge, background: c.bg, color: c.fg }}>
                        {a.estado}
                      </span>
                      {a.distancia_metros != null && (
                        <span style={{ fontSize: 11, color: colors.textMute }}>
                          {(a.distancia_metros / 1000).toFixed(2)} km
                        </span>
                      )}
                      {a.asignado_por_admin && (
                        <span style={{ ...ds.badge, background: colors.warningSoft, color: colors.warning }}>
                          Manual
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: colors.textFaint, marginLeft: 'auto' }}>
                        {new Date(a.created_at).toLocaleString('es-ES')}
                      </span>
                      {a.motivo_asignacion_manual && (
                        <div style={{ width: '100%', fontSize: 11, color: colors.textDim, fontStyle: 'italic', marginTop: 2 }}>
                          Motivo: {a.motivo_asignacion_manual}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {modalAsignar && (
          <AsignarManualModal
            pedido={modalAsignar.pedido}
            establecimiento={modalAsignar.establecimiento}
            onClose={() => setModalAsignar(null)}
            onAsignado={() => {
              setModalAsignar(null)
              refrescarDetalle()
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Pedidos</h1>
        <span style={{ fontSize: 13, color: 'var(--c-muted)', fontWeight: 600 }}>{filtrados.length} pedidos</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {estados.map(e => (
          <button key={e} onClick={() => setFiltro(e)} style={{ ...ds.filterBtn, background: filtro === e ? '#FF6B2C' : 'var(--c-surface2)', color: filtro === e ? '#fff' : 'var(--c-muted)' }}>
            {e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['todos', 'tarjeta', 'efectivo'].map(p => (
          <button key={p} onClick={() => setFiltroPago(p)} style={{ ...ds.filterBtn, background: filtroPago === p ? '#FF6B2C' : 'var(--c-surface2)', color: filtroPago === p ? '#fff' : 'var(--c-muted)' }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 80 }}>Codigo</span>
          <span style={{ width: 80 }}>Total</span>
          <span style={{ width: 90 }}>Estado</span>
          <span style={{ width: 70 }}>Pago</span>
          <span data-tablet-sm-hide="true" style={{ width: 70 }}>Canal</span>
          <span style={{ width: 100 }}>Alerta</span>
          <span style={{ flex: 1 }}>Fecha</span>
          <span style={{ width: 130 }}></span>
        </div>
        {filtrados.map(p => {
          const sinRider = p.shipday_status === 'no_rider'
          const atascado = detectarAtasco(p)
          const puedeAsignar = p.modo_entrega === 'delivery'
            && p.estado !== 'entregado'
            && p.estado !== 'cancelado'
          return (
            <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
              <span style={{ width: 80, fontWeight: 700, fontSize: 12 }}>{p.codigo}</span>
              <span style={{ width: 80, fontSize: 12 }}>{p.total?.toFixed(2)}EUR</span>
              <span style={{ width: 90 }}><span style={{ ...ds.badge, background: (estadoColor[p.estado] || '#6B7280') + '15', color: estadoColor[p.estado] }}>{p.estado}</span></span>
              <span style={{ width: 70 }}><span style={{ ...ds.badge, background: p.metodo_pago === 'tarjeta' ? 'var(--c-info-soft)' : 'var(--c-warning-soft)', color: p.metodo_pago === 'tarjeta' ? 'var(--c-info)' : 'var(--c-warning)' }}>{p.metodo_pago}</span></span>
              <span data-tablet-sm-hide="true" style={{ width: 70 }}><span style={{ ...ds.badge, background: 'var(--c-primary-soft)', color: '#FF6B2C' }}>PIDO</span></span>
              <span style={{ width: 100 }}>
                {sinRider ? (
                  <span style={{ ...ds.badge, background: colors.dangerSoft, color: colors.danger, border: `1px solid ${colors.danger}` }}>
                    🚨 Sin rider
                  </span>
                ) : atascado ? (
                  <span style={{ ...ds.badge, background: colors.warningSoft, color: colors.warning, border: `1px solid ${colors.warning}` }}>
                    ⏰ Atascado
                  </span>
                ) : null}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--c-muted)' }}>{new Date(p.created_at).toLocaleString('es-ES')}</span>
              <span style={{ width: 130, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {puedeAsignar && (sinRider || atascado) && (
                  <button
                    className="admin-action-btn"
                    onClick={(e) => { e.stopPropagation(); abrirAsignar(p) }}
                    style={{
                      ...ds.actionBtn,
                      background: sinRider ? colors.danger : colors.warning,
                      color: '#fff', fontWeight: 700,
                    }}
                  >
                    {p.rider_account_id ? 'Reasignar' : 'Asignar'}
                  </button>
                )}
                <button className="admin-action-btn" onClick={() => verDetalle(p)} style={ds.actionBtn}>Ver</button>
              </span>
            </div>
          )
        })}
        {filtrados.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>Sin pedidos</div>}
      </div>

      {modalAsignar && (
        <AsignarManualModal
          pedido={modalAsignar.pedido}
          establecimiento={modalAsignar.establecimiento}
          onClose={() => setModalAsignar(null)}
          onAsignado={() => {
            setModalAsignar(null)
            load()
          }}
        />
      )}
    </div>
  )
}
