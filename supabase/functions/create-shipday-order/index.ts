import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

interface ShipdayOrder {
  orderId?: string
  orderNumber: string
  pickupLocation: {
    address: string
    latitude: number
    longitude: number
    contactName: string
    contactPhone: string
  }
  deliveryLocation: {
    address: string
    latitude: number
    longitude: number
    contactName: string
    contactPhone: string
  }
  items: Array<{
    name: string
    quantity: number
  }>
  trackingUrl?: string
  status?: string
}

async function crearPedidoEnShipday(order: ShipdayOrder, apiKey: string): Promise<{ id: string; trackingUrl: string }> {
  const response = await fetch('https://api.shipday.com/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Shipday API error: ${errorData.message || response.statusText}`)
  }

  const result = await response.json()
  return {
    id: result.id || result.orderId,
    trackingUrl: result.trackingUrl || '',
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const CORS = getCorsHeaders(req)

  try {
    const { pedido_id } = await req.json()

    if (!pedido_id) {
      return Response.json(
        { error: 'Missing required parameter: pedido_id' },
        { status: 400, headers: CORS }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get order details
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select(`
        id, codigo, establecimiento_id, usuario_id, socio_id,
        direccion_entrega, lat_entrega, lng_entrega,
        establecimientos(nombre, direccion, latitud, longitud, telefono),
        usuarios(nombre, apellido, telefono)
      `)
      .eq('id', pedido_id)
      .single()

    if (pedidoError || !pedido) {
      return Response.json(
        { error: 'Pedido no encontrado' },
        { status: 404, headers: CORS }
      )
    }

    // Get order items
    const { data: items, error: itemsError } = await supabase
      .from('pedido_items')
      .select('nombre_producto, cantidad')
      .eq('pedido_id', pedido_id)

    if (itemsError) {
      console.error('Error fetching items:', itemsError)
      return Response.json(
        { error: 'Error fetching order items' },
        { status: 500, headers: CORS }
      )
    }

    // Determine which API key to use
    let apiKey = Deno.env.get('SHIPDAY_CARRIER_API_KEY') || ''

    if (pedido.socio_id) {
      const { data: socio } = await supabase
        .from('socios')
        .select('shipday_api_key')
        .eq('id', pedido.socio_id)
        .single()

      if (socio?.shipday_api_key) {
        apiKey = socio.shipday_api_key
      }
    }

    if (!apiKey) {
      return Response.json(
        { error: 'Shipday API key not configured' },
        { status: 500, headers: CORS }
      )
    }

    // Validate coordinates before building the order
    if (!pedido.establecimientos?.latitud || !pedido.establecimientos?.longitud) {
      return Response.json(
        { error: 'El establecimiento no tiene coordenadas configuradas' },
        { status: 400, headers: CORS }
      )
    }

    if (!pedido.lat_entrega || !pedido.lng_entrega) {
      return Response.json(
        { error: 'La dirección de entrega no tiene coordenadas válidas' },
        { status: 400, headers: CORS }
      )
    }

    if (!items || items.length === 0) {
      return Response.json(
        { error: 'El pedido no tiene productos' },
        { status: 400, headers: CORS }
      )
    }

    // Build Shipday order
    const clientName = pedido.usuarios
      ? `${pedido.usuarios.nombre}${pedido.usuarios.apellido ? ' ' + pedido.usuarios.apellido : ''}`
      : 'Cliente'
    const clientPhone = pedido.usuarios?.telefono || ''

    const shipdayOrder: ShipdayOrder = {
      orderNumber: pedido.codigo,
      pickupLocation: {
        address: pedido.establecimientos?.direccion || 'Establecimiento',
        latitude: pedido.establecimientos?.latitud || 0,
        longitude: pedido.establecimientos?.longitud || 0,
        contactName: pedido.establecimientos?.nombre || 'Restaurante',
        contactPhone: pedido.establecimientos?.telefono || '',
      },
      deliveryLocation: {
        address: pedido.direccion_entrega || 'Dirección de entrega',
        latitude: pedido.lat_entrega || 0,
        longitude: pedido.lng_entrega || 0,
        contactName: clientName,
        contactPhone: clientPhone,
      },
      items: (items || []).map(item => ({
        name: item.nombre_producto,
        quantity: item.cantidad,
      })),
    }

    // Create order in Shipday
    const shipdayResult = await crearPedidoEnShipday(shipdayOrder, apiKey)

    // Update order with Shipday tracking info
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        shipday_order_id: shipdayResult.id,
        shipday_tracking_url: shipdayResult.trackingUrl,
        shipday_status: 'created',
      })
      .eq('id', pedido_id)

    if (updateError) {
      console.error('Error updating order:', updateError)
      // Order was created in Shipday, but local update failed
      // Still return success since Shipday order exists
    }

    return Response.json(
      {
        success: true,
        shipdayOrderId: shipdayResult.id,
      },
      { status: 200, headers: CORS }
    )

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error'
    console.error('Shipday error:', msg)
    return Response.json(
      { error: msg },
      { status: 400, headers: CORS }
    )
  }
})
