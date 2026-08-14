import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { colors, type, radius, ds } from '../lib/darkStyles'
import { Chip, EstadoBadge, GhostBtn, GlossyBtn, Vacio, fmtEUR } from '../lib/ui'
import { X, Phone, RefreshCw, Ban } from 'lucide-react'
import { toast, confirmar } from '../App'

// Panel lateral de Dispatch: todo lo que se puede hacer con UN pedido sin
// salir de la torre de control. La asignación NO se implementa aquí — se
// delega en `onReasignar`, que abre el modal que ya existe y que es el único
// sitio que llama a la edge `asignar-pedido-manual`.

const ESTADOS_CERRADOS = ['entregado', 'cancelado']

const RESULTADO_INTENTO = {
  aceptado:             { tono: 'sage',    texto: 'Lo aceptó' },
  esperando_aceptacion: { tono: 'warning', texto: 'Esperando respuesta' },
  timeout:              { tono: 'neutral', texto: 'No contestó a tiempo' },
  rechazado:            { tono: 'danger',  texto: 'Lo rechazó' },
  cancelado_manual:     { tono: 'neutral', texto: 'Cancelado a mano' },
  sin_riders:           { tono: 'danger',  texto: 'No había nadie libre' },
}

function hace(iso) {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`
}

const km = (m) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

function Dato({ etiqueta, children }) {
  return (
    <div>
      <div style={{ ...type.caption, color: colors.stone, marginBottom: 2 }}>{etiqueta}</div>
      <div style={{ ...type.label, color: colors.text }}>{children || '—'}</div>
    </div>
  )
}

export default function PedidoDrawer({ pedido, onClose, onReasignar, onCambiado }) {
  const [items, setItems] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [establecimiento, setEstablecimiento] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [cancelando, setCancelando] = useState(false)

  useEffect(() => {
    if (!pedido?.id) return
    let vivo = true
    ;(async () => {
      setCargando(true)
      const [itRes, asRes, estRes] = await Promise.all([
        supabase.from('pedido_items').select('*').eq('pedido_id', pedido.id),
        supabase.from('pedido_asignaciones')
          .select('id, intento, estado, distancia_metros, motivo_rechazo, created_at, resolved_at, asignado_por_admin, motivo_asignacion_manual, rider_account_id, rider_accounts(nombre)')
          .eq('pedido_id', pedido.id)
          .order('intento', { ascending: true }),
        // El pedido no siempre trae `establecimientos` embebido, y aquí hace
        // falta el teléfono para poder llamar al restaurante.
        pedido.establecimiento_id
          ? supabase.from('establecimientos').select('id, nombre, telefono, latitud, longitud, logo_url').eq('id', pedido.establecimiento_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!vivo) return
      setItems(itRes.data || [])
      setAsignaciones(asRes.data || [])
      setEstablecimiento(estRes.data || null)
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [pedido?.id])

  if (!pedido) return null

  const cerrado = ESTADOS_CERRADOS.includes(pedido.estado)
  const nombreRest = establecimiento?.nombre || pedido.establecimientos?.nombre || '—'

  async function cancelar() {
    const ok = await confirmar(
      `¿Cancelar el pedido ${pedido.codigo}?\n\n` +
      (pedido.metodo_pago === 'tarjeta'
        ? 'OJO: cancelar NO devuelve el dinero. El reembolso de la tarjeta se hace aparte, en la pantalla Reembolsos.'
        : 'El pedido se marcará como cancelado y dejará de contar para el reparto.')
    )
    if (!ok) return
    setCancelando(true)
    const { error } = await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedido.id)
    setCancelando(false)
    // Sin leer el error, un rechazo del guard de la base de datos pasaría por
    // "cancelado" y el pedido seguiría vivo.
    if (error) return toast('No se pudo cancelar: ' + error.message, 'error')
    toast(`Pedido ${pedido.codigo} cancelado`)
    onCambiado?.()
    onClose?.()
  }

  const total = Number(pedido.total) || 0

  return (
    <aside
      className="dispatch-drawer"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw',
        background: colors.paper, borderLeft: `1px solid ${colors.border}`,
        boxShadow: '-8px 0 32px rgba(26,24,21,0.16)',
        zIndex: 1200, display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Cabecera */}
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...type.mono, fontSize: 15, color: colors.ink }}>{pedido.codigo}</div>
            <div style={{ ...type.label, color: colors.textMute, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nombreRest} · entró hace {hace(pedido.created_at)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar ficha"
            style={{ width: 32, height: 32, borderRadius: radius.sm, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: colors.stone, cursor: 'pointer', flexShrink: 0 }}
          >
            <X size={17} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <EstadoBadge estado={pedido.estado} />
          <Chip tono={pedido.metodo_pago === 'tarjeta' ? 'info' : 'warning'}>
            {pedido.metodo_pago === 'tarjeta' ? 'Tarjeta' : pedido.metodo_pago === 'datafono' ? 'Datáfono' : 'Efectivo'}
          </Chip>
          <Chip tono="neutral">{pedido.modo_entrega === 'delivery' ? 'Reparto' : 'Recogida'}</Chip>
          <span style={{ marginLeft: 'auto', ...type.h3, color: colors.text }}>{fmtEUR(total)}</span>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <Dato etiqueta="Dirección">{pedido.direccion_entrega}</Dato>
          <Dato etiqueta="Preparación">{pedido.minutos_preparacion ? `${pedido.minutos_preparacion} min` : null}</Dato>
          <Dato etiqueta="Asignado">{pedido.assigned_at ? `hace ${hace(pedido.assigned_at)}` : 'Sin asignar'}</Dato>
          <Dato etiqueta="Intentos">{pedido.intento_asignacion ? `${pedido.intento_asignacion} de 3` : 'Ninguno'}</Dato>
        </div>

        <h3 style={{ ...ds.h3, marginBottom: 10 }}>Contenido</h3>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden', marginBottom: 20 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...type.label, color: colors.text }}>
                  <span style={{ fontWeight: 700 }}>{it.cantidad}×</span> {it.nombre_producto}
                  {it.tamano && <span style={{ color: colors.stone }}> ({it.tamano})</span>}
                </div>
                {Array.isArray(it.extras) && it.extras.length > 0 && (
                  <div style={{ ...type.caption, color: colors.stone, marginTop: 2 }}>+ {it.extras.join(', ')}</div>
                )}
                {it.notas && <div style={{ ...type.caption, color: colors.onTerracottaSoft, marginTop: 2 }}>{it.notas}</div>}
              </div>
              <div style={{ ...type.label, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {fmtEUR((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0))}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', ...type.label, color: colors.textMute }}>
              {cargando ? 'Cargando…' : 'Sin líneas'}
            </div>
          )}
        </div>

        <h3 style={{ ...ds.h3, marginBottom: 10 }}>A quién se le ofreció</h3>
        {asignaciones.length === 0 ? (
          <Vacio
            titulo={cargando ? 'Cargando…' : 'Todavía a nadie'}
            texto={cargando ? '' : 'Este pedido aún no se ha ofrecido a ningún repartidor.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {asignaciones.map(a => {
              const r = RESULTADO_INTENTO[a.estado] || { tono: 'neutral', texto: a.estado }
              const primero = a.intento === 1
              const d = km(a.distancia_metros)
              return (
                <div key={a.id} style={{
                  border: `1px solid ${primero ? colors.borderStrong : colors.border}`,
                  borderRadius: radius.md, padding: '10px 12px',
                  background: primero ? colors.elev2 : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ ...type.label, fontWeight: 600, color: colors.text }}>
                      {a.rider_accounts?.nombre || 'Repartidor eliminado'}
                    </span>
                    <Chip tono={r.tono}>{r.texto}</Chip>
                  </div>
                  <div style={{ ...type.caption, color: colors.stone, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{primero ? 'El primero' : `Intento ${a.intento}`}</span>
                    {d && <span>{d}</span>}
                    <span>hace {hace(a.created_at)}</span>
                    {a.asignado_por_admin && <span style={{ color: colors.onWarningSoft, fontWeight: 600 }}>a mano</span>}
                  </div>
                  {a.motivo_rechazo && (
                    <div style={{ ...type.caption, color: colors.onDangerSoft, marginTop: 4 }}>Motivo: {a.motivo_rechazo}</div>
                  )}
                  {a.motivo_asignacion_manual && (
                    <div style={{ ...type.caption, color: colors.stone, marginTop: 4, fontStyle: 'italic' }}>{a.motivo_asignacion_manual}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ padding: 14, borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, background: colors.surface }}>
        {establecimiento?.telefono && (
          <GhostBtn size="sm" onClick={() => window.open(`tel:${establecimiento.telefono}`)}>
            <Phone size={13} /> Restaurante
          </GhostBtn>
        )}
        {!cerrado && (
          <GhostBtn size="sm" danger onClick={cancelar} disabled={cancelando}>
            <Ban size={13} /> {cancelando ? 'Cancelando…' : 'Cancelar'}
          </GhostBtn>
        )}
        {!cerrado && pedido.modo_entrega === 'delivery' && (
          <GlossyBtn size="sm" accent style={{ flex: 1, minWidth: 140 }} onClick={() => onReasignar?.(pedido)}>
            <RefreshCw size={13} /> {pedido.rider_account_id ? 'Reasignar' : 'Asignar'}
          </GlossyBtn>
        )}
      </div>
    </aside>
  )
}
