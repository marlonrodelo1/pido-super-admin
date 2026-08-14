import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type } from '../lib/darkStyles'
import { EstadoBadge, Chip, MiniBtn, Segmented, PillTabs, Vacio, fmtEUR } from '../lib/ui'
import AsignarManualModal from '../components/AsignarManualModal'
import PedidoDrawer from '../components/PedidoDrawer'

const ESTADOS_ACTIVOS = ['nuevo', 'aceptado', 'preparando', 'listo', 'recogido', 'en_camino']

// Fecha corta: en una tabla, "13/8/2026, 20:41:57" es ruido — el ano y los
// segundos no aportan nada y en movil se comen la linea entera.
function fechaCorta(iso) {
  const d = new Date(iso)
  const hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) {
    return `Hoy · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

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
  const [detalle, setDetalle] = useState(null)           // pedido con la ficha abierta
  const [modalAsignar, setModalAsignar] = useState(null) // { pedido, establecimiento }

  useEffect(() => {
    load()
    const channel = supabase.channel('admin-pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function load() {
    const { data } = await supabase.from('pedidos').select('*, establecimientos(nombre)').order('created_at', { ascending: false }).limit(200)
    setItems(data || [])
  }

  // `verDetalle`, `refrescarDetalle` y `cancelarPedido` vivían aquí y se han ido
  // con la ficha: ahora los hace PedidoDrawer, que carga sus propios datos.
  //
  // El cancelar de aquí, además, ni pedía confirmación ni leía el error de la
  // base de datos: si el guard `pedidos_guard_update` rechazaba el cambio, la
  // pantalla decía que se había cancelado igualmente. El de la ficha compartida
  // hace las dos cosas.

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

  // El mapa de colores por estado vivía aquí (y otro distinto en Usuarios.jsx).
  // Se pintaba con `estadoColor[estado] + '15'` para lograr el fondo claro, y eso
  // solo produce un color válido cuando el valor es un hex: con `var(--c-danger)`
  // salía la cadena `var(--c-danger)15`, que el navegador descarta — listo,
  // recogido, entregado y cancelado se quedaban SIN fondo. Ahora lo resuelve
  // EstadoBadge, que además escribe la etiqueta en castellano.
  const estados = ['todos', 'nuevo', 'aceptado', 'preparando', 'listo', 'en_camino', 'entregado', 'cancelado']

  // La ficha del pedido ya NO vive aquí: es <PedidoDrawer>, la misma que usa
  // Dispatch. Antes había dos fichas distintas y ya habían divergido: esta
  // seguía imprimiendo "17.00EUR" y no enseñaba ni quién había pedido ni el
  // motivo de cancelación.

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Pedidos</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            {filtrados.length === items.length
              ? `${items.length} pedidos`
              : `${filtrados.length} de ${items.length} pedidos`}
          </div>
        </div>
        <Segmented
          value={filtroPago}
          onChange={setFiltroPago}
          options={[
            { value: 'todos', label: 'Todo' },
            { value: 'tarjeta', label: 'Tarjeta' },
            { value: 'efectivo', label: 'Efectivo' },
          ]}
        />
      </div>

      {/* Cada filtro lleva su recuento: antes había que pinchar para descubrir
          que un estado estaba vacío. */}
      <PillTabs
        style={{ marginBottom: 20 }}
        value={filtro}
        onChange={setFiltro}
        options={estados.map(e => ({
          value: e,
          label: e === 'todos' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1).replace('_', ' '),
          count: e === 'todos'
            ? items.length
            : items.filter(p => p.estado === e && (filtroPago === 'todos' || p.metodo_pago === filtroPago)).length,
        }))}
      />

      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ width: 104, flexShrink: 0 }}>Código</span>
          <span style={{ flex: '3 1 150px', minWidth: 0 }}>Restaurante</span>
          <span style={{ width: 84, flexShrink: 0 }}>Total</span>
          <span style={{ flex: '1 1 96px', minWidth: 0 }}>Estado</span>
          <span style={{ width: 84, flexShrink: 0 }}>Pago</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1 1 76px', minWidth: 0 }}>Origen</span>
          <span style={{ flex: '1 1 76px', minWidth: 0 }}>Alerta</span>
          <span data-tablet-sm-hide="true" style={{ width: 120, flexShrink: 0 }}>Fecha</span>
          <span style={{ width: 140, flexShrink: 0 }}></span>
        </div>
        {filtrados.map(p => {
          const sinRider = p.shipday_status === 'no_rider'
          const atascado = detectarAtasco(p)
          const puedeAsignar = p.modo_entrega === 'delivery'
            && p.estado !== 'entregado'
            && p.estado !== 'cancelado'
          return (
            <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
              <span data-col="cod" style={{ ...type.mono, width: 104, flexShrink: 0, fontSize: 13 }}>{p.codigo}</span>
              <span data-col="nom" style={{ flex: '3 1 150px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.establecimientos?.nombre || ''}>
                {p.establecimientos?.nombre || '—'}
              </span>
              <span data-col="tot" style={{ width: 84, flexShrink: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(p.total)}</span>
              <span data-col="est" style={{ flex: '1 1 96px', minWidth: 0, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <EstadoBadge estado={p.estado} />
                {/* Sin aceptar por el restaurante: el hueco por el que se
                    pierden los pedidos (10 auto-cancelados en 45 días). */}
                {!p.aceptado_at && !['cancelado', 'fallido', 'entregado'].includes(p.estado) && (
                  <Chip tono="danger" title="El restaurante todavía no lo ha aceptado">Sin aceptar</Chip>
                )}
              </span>
              <span data-col="pag" style={{ width: 84, flexShrink: 0 }}>
                <Chip tono={p.metodo_pago === 'tarjeta' ? 'info' : 'warning'}>
                  {p.metodo_pago === 'tarjeta' ? 'Tarjeta' : p.metodo_pago === 'datafono' ? 'Datáfono' : 'Efectivo'}
                </Chip>
              </span>
              <span data-col="ori" data-tablet-sm-hide="true" style={{ flex: '1 1 76px', minWidth: 0 }}>
                <Chip tono="terracotta">
                  {p.origen_pedido === 'telefonico' ? 'Teléfono' : p.origen_pedido === 'marketplace_socio' ? 'Socio' : 'App'}
                </Chip>
              </span>
              {/* En movil cada celda ocupa su propia linea, asi que una celda de
                  alerta VACIA gastaria una linea entera en las 119 filas */}
              {(sinRider || atascado) ? (
                <span data-col="ale" style={{ flex: '1 1 76px', minWidth: 0 }}>
                  {sinRider
                    ? <Chip tono="danger" style={{ border: `1px solid ${colors.danger}` }}>🚨 Sin rider</Chip>
                    : <Chip tono="warning" style={{ border: `1px solid ${colors.warning}` }}>⏰ Atascado</Chip>}
                </span>
              ) : <span className="ds-col-hueco" style={{ flex: '1 1 76px', minWidth: 0 }} />}
              <span data-col="fec" data-tablet-sm-hide="true" style={{ width: 120, flexShrink: 0, ...type.caption, color: colors.textMute }}>{fechaCorta(p.created_at)}</span>
              <span data-col="acc" style={{ width: 140, flexShrink: 0, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
                <MiniBtn className="admin-action-btn" onClick={() => setDetalle(p)} aria-label={`Ver el pedido ${p.codigo}`}>Ver</MiniBtn>
              </span>
            </div>
          )
        })}
        {filtrados.length === 0 && (
          <Vacio
            titulo="Ningún pedido con esos filtros"
            texto={filtro === 'todos' && filtroPago === 'todos'
              ? 'Todavía no ha entrado ningún pedido.'
              : 'Prueba a quitar el filtro de estado o el de método de pago.'}
          />
        )}
      </div>

      {detalle && (
        <PedidoDrawer
          pedido={detalle}
          onClose={() => setDetalle(null)}
          onReasignar={(p) => abrirAsignar(p)}
          onCambiado={load}
        />
      )}

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
