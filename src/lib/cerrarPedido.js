// ─────────────────────────────────────────────────────────────────────────────
// Cerrar un pedido a mano desde el super-admin.
//
// El caso real: el repartidor entregó el pedido y se le olvidó marcarlo en su
// app, así que se queda colgado en "listo" o "en camino" para siempre. Nadie
// vigila un pedido atascado en un estado intermedio (ningún cron lo mira), así
// que si no se cierra desde aquí no lo cierra nadie.
//
// VIVE EN UN SOLO SITIO A PROPÓSITO. Esto escribe dinero, y lo llaman dos
// pantallas (la cola del Dispatch y la ficha del pedido). Duplicar el UPDATE
// era garantizar que uno de los dos se quedara sin una de las dos reglas de
// abajo el día que alguien tocara solo una pantalla.
//
// LAS DOS REGLAS, y por qué van en el MISMO update:
//
//  · `socio_id` tiene que estar puesto ANTES. El pago al socio ya no vive en
//    rider_earnings (esa tabla se renombró a _deprecated_): hoy se congela en
//    las columnas pedidos.socio_liq_* y lo hace `trg_congelar_ganancia_socio`
//    (BEFORE UPDATE OF estado), cuya condición es:
//        NEW.estado='entregado' AND OLD.estado IS DISTINCT FROM 'entregado'
//        AND NEW.socio_id IS NOT NULL
//    Si se cierra sin socio, el socio NO cobra — y NO hay segunda oportunidad:
//    la condición OLD.estado <> 'entregado' ya no se volverá a cumplir nunca,
//    así que asignarle el socio después NO dispara el congelado. Por eso se
//    avisa en el confirm en vez de dejarlo pasar callando.
//
//  · `entregado_at` lo pone EL FRONTEND. No tiene default en la base de datos
//    y no lo escribe ningún trigger (el panel del restaurante hace lo mismo en
//    PedidosEnVivo.jsx). Si se cierra sin él, la liquidación aguanta porque usa
//    coalesce(entregado_at, recogido_at, created_at), pero el panel del socio
//    filtra por .gte('entregado_at') SIN fallback: el pedido desaparece de su
//    pantalla aunque lo esté cobrando. Justo el "nadie se entera".
//
// El `.neq('estado','entregado')` lo hace idempotente: dos clics seguidos no
// vuelven a disparar los AFTER UPDATE de estado (push al cliente incluido).
// ─────────────────────────────────────────────────────────────────────────────

const CERRADOS = ['entregado', 'cancelado', 'fallido']

export function sePuedeCerrar(pedido) {
  return !!pedido && !CERRADOS.includes(pedido.estado)
}

/**
 * @returns {Promise<boolean>} true si el pedido quedó cerrado.
 */
export async function marcarPedidoEntregado(supabase, pedido, { confirmar, toast }) {
  if (!sePuedeCerrar(pedido)) return false

  // Un pedido de recogida no lleva repartidor y no tiene que avisar de nada.
  const sinRepartidor = pedido.modo_entrega === 'delivery' && !pedido.socio_id

  const ok = await confirmar(
    `¿Marcar ${pedido.codigo} como entregado?\n\n` +
    (sinRepartidor
      ? 'OJO: este pedido NO tiene repartidor asignado. Si lo cierras así, ' +
        'nadie cobrará el reparto y ya no se puede corregir después. ' +
        'Si lo llevó un socio, asígnaselo primero y luego ciérralo.'
      : 'Se cierra con la hora de ahora y el repartidor cobra su reparto en la ' +
        'liquidación del lunes. Al cliente le llegará el aviso de entrega.')
  )
  if (!ok) return false

  const { error } = await supabase
    .from('pedidos')
    .update({ estado: 'entregado', entregado_at: new Date().toISOString() })
    .eq('id', pedido.id)
    .neq('estado', 'entregado')

  // Sin leer el error, un rechazo de un guard pasaría por "entregado" y el
  // pedido seguiría vivo — el mismo fallo que ya documenta cancelar().
  if (error) {
    toast('No se pudo cerrar: ' + error.message, 'error')
    return false
  }
  toast(`Pedido ${pedido.codigo} marcado como entregado`)
  return true
}
