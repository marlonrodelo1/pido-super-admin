import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { colors, type, radius, ds } from '../lib/darkStyles'
import { Chip, EstadoBadge, GhostBtn, GlossyBtn, MiniBtn, Vacio, fmtEUR } from '../lib/ui'
import { X, Phone, RefreshCw, Ban, Copy, ExternalLink, Undo2, AlertTriangle, User } from 'lucide-react'
import { toast, confirmar } from '../App'

// ─────────────────────────────────────────────────────────────────────────────
// LA ficha de pedido. Una sola para Dispatch y para Pedidos: antes eran dos
// distintas y ya habían divergido (la de Pedidos seguía imprimiendo "17.00EUR"
// y no enseñaba ni el cliente ni el motivo de cancelación).
//
// Props:
//   pedido        objeto del listado (se recarga entero al abrir)
//   onClose()     cerrar
//   onReasignar(p) el contenedor abre AsignarManualModal — la asignación NO se
//                 implementa aquí, solo la llama quien sabe hacerlo
//   onCambiado()  avisar al contenedor de que recargue su lista
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS_CERRADOS = ['entregado', 'cancelado', 'fallido']

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
const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null
const fechaHora = (iso) => iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const km = (m) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

function Dato({ etiqueta, children, ancho }) {
  return (
    <div style={ancho ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ ...type.caption, color: colors.stone, marginBottom: 2 }}>{etiqueta}</div>
      <div style={{ ...type.label, color: colors.text }}>{children || '—'}</div>
    </div>
  )
}

function Seccion({ titulo, children, extra }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={ds.h3}>{titulo}</h3>
        {extra}
      </div>
      {children}
    </div>
  )
}

export default function PedidoDrawer({ pedido: pedidoProp, onClose, onReasignar, onCambiado }) {
  const [pedido, setPedido] = useState(pedidoProp)
  const [items, setItems] = useState([])
  const [asignaciones, setAsignaciones] = useState([])
  const [establecimiento, setEstablecimiento] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [socio, setSocio] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState(null) // 'cancelar' | 'reembolso'

  const id = pedidoProp?.id

  useEffect(() => {
    if (!id) return
    let vivo = true
    ;(async () => {
      setCargando(true)
      // El pedido del listado viene con `select('*')` en unos sitios y recortado
      // en otros (Dispatch pide columnas sueltas): se recarga entero para que la
      // ficha no dependa de con qué columnas la llamaron.
      const { data: p } = await supabase.from('pedidos').select('*').eq('id', id).maybeSingle()
      const base = p || pedidoProp
      if (!vivo) return
      setPedido(base)

      const [itRes, asRes, estRes, cliRes, socRes] = await Promise.all([
        supabase.from('pedido_items').select('*').eq('pedido_id', id),
        supabase.from('pedido_asignaciones')
          .select('id, intento, estado, distancia_metros, motivo_rechazo, created_at, resolved_at, asignado_por_admin, motivo_asignacion_manual, rider_account_id, rider_accounts(nombre, telefono)')
          .eq('pedido_id', id)
          .order('intento', { ascending: true }),
        base?.establecimiento_id
          ? supabase.from('establecimientos').select('id, nombre, telefono, direccion, latitud, longitud').eq('id', base.establecimiento_id).maybeSingle()
          : Promise.resolve({ data: null }),
        base?.usuario_id
          ? supabase.from('usuarios').select('id, nombre, apellido, telefono, email').eq('id', base.usuario_id).maybeSingle()
          : Promise.resolve({ data: null }),
        base?.socio_id
          ? supabase.from('socios').select('id, nombre, telefono').eq('id', base.socio_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!vivo) return
      setItems(itRes.data || [])
      setAsignaciones(asRes.data || [])
      setEstablecimiento(estRes.data || null)
      setCliente(cliRes.data || null)
      setSocio(socRes.data || null)
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [id])

  if (!pedido) return null

  const cerrado = ESTADOS_CERRADOS.includes(pedido.estado)
  const esTarjeta = pedido.metodo_pago === 'tarjeta'
  const yaReembolsado = !!pedido.reembolsado_at || Number(pedido.monto_reembolsado) > 0
  const puedeReembolsar = esTarjeta && !!pedido.stripe_payment_id && !yaReembolsado
    && ['cancelado', 'fallido'].includes(pedido.estado)

  // Cliente: puede ser una cuenta o un pedido de invitado (crear_pedido_invitado)
  const nombreCliente = cliente
    ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
    : (pedido.guest_nombre || null)
  const telCliente = cliente?.telefono || pedido.guest_telefono || pedido.cliente_telefono || null
  const emailCliente = cliente?.email || pedido.guest_email || null

  const motivo = pedido.motivo_cancelacion || pedido.motivo_fallo || null

  // Línea de tiempo. Solo se pintan los hitos que existen; el que falta se ve.
  const hitos = [
    { k: 'Entró', ts: pedido.created_at },
    { k: 'Aceptado por el restaurante', ts: pedido.aceptado_at },
    { k: 'Asignado a un repartidor', ts: pedido.assigned_at },
    { k: 'Recogido', ts: pedido.recogido_at },
    { k: 'Entregado', ts: pedido.entregado_at },
    { k: 'Cancelado', ts: pedido.cancelado_at },
    { k: 'Fallido', ts: pedido.fallido_at },
  ].filter(h => h.ts || ['Entró'].includes(h.k))

  async function cancelar() {
    const ok = await confirmar(
      `¿Cancelar el pedido ${pedido.codigo}?\n\n` +
      (esTarjeta
        ? 'OJO: cancelar NO devuelve el dinero. El reembolso se hace aparte, con el botón Reembolsar o en la pantalla Reembolsos.'
        : 'El pedido se marcará como cancelado y dejará de contar para el reparto.')
    )
    if (!ok) return
    setTrabajando('cancelar')
    const { error } = await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedido.id)
    setTrabajando(null)
    // Sin leer el error, un rechazo del guard de la base de datos pasaría por
    // "cancelado" y el pedido seguiría vivo.
    if (error) return toast('No se pudo cancelar: ' + error.message, 'error')
    toast(`Pedido ${pedido.codigo} cancelado`)
    onCambiado?.()
    onClose?.()
  }

  // Mismo camino que la pantalla Reembolsos: la edge exige el JWT del superadmin.
  async function reembolsar() {
    if (!(await confirmar(`Vas a reembolsar ${fmtEUR(pedido.total)} al cliente del pedido ${pedido.codigo}. El dinero sale de la cuenta de Stripe. ¿Continuar?`))) return
    setTrabajando('reembolso')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { toast('Sesión caducada. Vuelve a iniciar sesión.', 'error'); return }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear_reembolso_stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pedido_id: pedido.id }),
      })
      const data = await res.json()
      if (data.success) {
        toast(`Reembolso procesado: ${fmtEUR(data.monto_reembolsado)} devueltos al cliente.`)
        onCambiado?.()
        onClose?.()
      } else {
        toast('No se pudo reembolsar: ' + (data.error || 'error desconocido'), 'error')
      }
    } catch (e) {
      toast('No se pudo reembolsar: ' + e.message, 'error')
    } finally {
      setTrabajando(null)
    }
  }

  function copiarCodigo() {
    navigator.clipboard?.writeText(pedido.codigo)
      .then(() => toast(`Código ${pedido.codigo} copiado`))
      .catch(() => toast('No se pudo copiar', 'error'))
  }

  const urlSeguimiento = pedido.tracking_url
    || (pedido.tracking_token ? `https://pidoo.es/seguimiento/${pedido.codigo}?t=${pedido.tracking_token}` : null)

  const descuento = Number(pedido.descuento) || 0

  return (
    <aside
      className="dispatch-drawer"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '100vw',
        background: colors.paper, borderLeft: `1px solid ${colors.border}`,
        boxShadow: '-8px 0 32px rgba(26,24,21,0.16)',
        zIndex: 1200, display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Cabecera */}
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...type.mono, fontSize: 16, color: colors.ink }}>{pedido.codigo}</span>
              <MiniBtn onClick={copiarCodigo} title="Copiar código" aria-label="Copiar código del pedido">
                <Copy size={12} />
              </MiniBtn>
            </div>
            <div style={{ ...type.label, color: colors.textMute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {establecimiento?.nombre || pedido.establecimientos?.nombre || '—'} · entró hace {hace(pedido.created_at)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar ficha"
            style={{ width: 32, height: 32, borderRadius: radius.sm, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: colors.stone, cursor: 'pointer', flexShrink: 0 }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <EstadoBadge estado={pedido.estado} />
          <Chip tono={esTarjeta ? 'info' : 'warning'}>
            {esTarjeta ? 'Tarjeta' : pedido.metodo_pago === 'datafono' ? 'Datáfono' : 'Efectivo'}
          </Chip>
          <Chip tono="neutral">{pedido.modo_entrega === 'delivery' ? 'Reparto' : 'Recogida'}</Chip>
          {yaReembolsado && <Chip tono="sage">Reembolsado</Chip>}
          <span style={{ marginLeft: 'auto', ...type.h3, color: colors.text }}>{fmtEUR(pedido.total)}</span>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

        {/* Por qué se murió el pedido. Esto no se veía en ninguna parte y es lo
            primero que hace falta cuando algo sale mal. */}
        {motivo && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: colors.dangerSoft, color: colors.onDangerSoft,
            border: `1px solid ${colors.danger}`, borderRadius: radius.md,
            padding: '12px 14px', marginBottom: 20, ...type.label, lineHeight: 1.5,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{motivo}</span>
          </div>
        )}

        <Seccion titulo="Cliente">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Dato etiqueta="Nombre">
              {nombreCliente || <span style={{ color: colors.stone }}>Sin nombre</span>}
              {!pedido.usuario_id && nombreCliente && (
                <Chip tono="neutral" style={{ marginLeft: 8 }}>Invitado</Chip>
              )}
            </Dato>
            <Dato etiqueta="Teléfono">{telCliente}</Dato>
            {emailCliente && <Dato etiqueta="Email" ancho>{emailCliente}</Dato>}
            <Dato etiqueta="Dirección" ancho>{pedido.direccion_entrega}</Dato>
            {pedido.notas && <Dato etiqueta="Notas del cliente" ancho>{pedido.notas}</Dato>}
          </div>
        </Seccion>

        <Seccion titulo="Qué ha pasado">
          <div style={{ borderLeft: `2px solid ${colors.border}`, paddingLeft: 14, marginLeft: 4 }}>
            {hitos.map((h, i) => (
              <div key={h.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0' }}>
                <span style={{ ...type.label, color: h.ts ? colors.text : colors.stone2, position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: -21, top: 5, width: 8, height: 8, borderRadius: '50%',
                    background: h.ts ? (i === hitos.length - 1 ? colors.terracotta2 : colors.sage) : colors.border,
                  }} />
                  {h.k}
                </span>
                <span style={{ ...type.caption, color: colors.stone, whiteSpace: 'nowrap' }}>
                  {h.ts ? `${fechaHora(h.ts)}` : 'nunca'}
                </span>
              </div>
            ))}
            {/* El hueco que explica la mayoría de los marrones */}
            {!pedido.aceptado_at && ['cancelado', 'fallido'].includes(pedido.estado) && (
              <div style={{ ...type.caption, color: colors.onDangerSoft, marginTop: 6 }}>
                El restaurante nunca llegó a aceptarlo.
              </div>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Dinero">
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
            {[
              ['Comida', fmtEUR(pedido.subtotal)],
              ...(descuento > 0 ? [[`Descuento${pedido.promo_titulo ? ` · ${pedido.promo_titulo}` : ''}`, `−${fmtEUR(descuento)}`]] : []),
              ['Envío', fmtEUR(pedido.coste_envio)],
              ...(Number(pedido.propina) > 0 ? [['Propina', fmtEUR(pedido.propina)]] : []),
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${colors.border}`, ...type.label }}>
                <span style={{ color: colors.stone }}>{k}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '11px 14px', background: colors.elev2, ...type.label, fontWeight: 700 }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEUR(pedido.total)}</span>
            </div>
          </div>
          {esTarjeta && (
            <div style={{ ...type.caption, color: colors.stone, marginTop: 8 }}>
              {yaReembolsado
                ? `Reembolsado ${fmtEUR(pedido.monto_reembolsado)} el ${fechaHora(pedido.reembolsado_at)}`
                : pedido.stripe_payment_id
                  ? 'Cobrado por Stripe. El dinero lo tiene Pidoo.'
                  : 'Sin pago de Stripe registrado: no se puede reembolsar.'}
            </div>
          )}
          {!esTarjeta && (
            <div style={{ ...type.caption, color: colors.stone, marginTop: 8 }}>
              En efectivo: el restaurante recibe el importe íntegro en mano y la comisión queda a deber.
            </div>
          )}
        </Seccion>

        <Seccion titulo="Contenido">
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
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
        </Seccion>

        <Seccion titulo="Reparto" extra={socio ? <Chip tono="sage" dot>{socio.nombre?.split(' ')[0]}</Chip> : null}>
          {asignaciones.length === 0 ? (
            <Vacio
              titulo={cargando ? 'Cargando…' : 'Todavía a nadie'}
              texto={cargando ? '' : 'Este pedido no se ha ofrecido a ningún repartidor.'}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      <span>{hora(a.created_at)}</span>
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
        </Seccion>
      </div>

      {/* Acciones */}
      <div style={{ padding: 14, borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, background: colors.surface }}>
        {telCliente && (
          <GhostBtn size="sm" onClick={() => window.open(`tel:${telCliente}`)} title={`Llamar a ${nombreCliente || 'el cliente'}`}>
            <User size={13} /> Cliente
          </GhostBtn>
        )}
        {establecimiento?.telefono && (
          <GhostBtn size="sm" onClick={() => window.open(`tel:${establecimiento.telefono}`)} title={`Llamar a ${establecimiento.nombre}`}>
            <Phone size={13} /> Restaurante
          </GhostBtn>
        )}
        {urlSeguimiento && (
          <GhostBtn size="sm" onClick={() => window.open(urlSeguimiento, '_blank', 'noopener')} title="Abrir el seguimiento que ve el cliente">
            <ExternalLink size={13} /> Seguimiento
          </GhostBtn>
        )}
        {puedeReembolsar && (
          <GhostBtn size="sm" danger onClick={reembolsar} disabled={trabajando === 'reembolso'}>
            <Undo2 size={13} /> {trabajando === 'reembolso' ? 'Reembolsando…' : 'Reembolsar'}
          </GhostBtn>
        )}
        {!cerrado && (
          <GhostBtn size="sm" danger onClick={cancelar} disabled={trabajando === 'cancelar'}>
            <Ban size={13} /> {trabajando === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
          </GhostBtn>
        )}
        {!cerrado && pedido.modo_entrega === 'delivery' && (
          <GlossyBtn size="sm" accent style={{ flex: 1, minWidth: 150 }} onClick={() => onReasignar?.(pedido)}>
            <RefreshCw size={13} /> {pedido.rider_account_id ? 'Reasignar' : 'Asignar'}
          </GlossyBtn>
        )}
      </div>
    </aside>
  )
}
