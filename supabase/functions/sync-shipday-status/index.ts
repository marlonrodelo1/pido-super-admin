import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

// Map Shipday status to Pidoo status (same as shipday-webhook)
function mapShipdayStatus(shipdayStatus: string): string {
  const statusMap: Record<string, string> = {
    'created': 'en_camino',
    'assigned': 'en_camino',
    'picked_up': 'recogido',
    'in_transit': 'en_camino',
    'delivered': 'entregado',
    'cancelled': 'cancelado',
    'failed': 'cancelado',
  }
  return statusMap[shipdayStatus.toLowerCase()] || shipdayStatus
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const CORS = getCorsHeaders(req)

  const json = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  try {
    // Parse body
    const { pedido_id } = await req.json()

    if (!pedido_id) {
      return json({ ok: false, error: 'missing pedido_id' })
    }

    // Create Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Find the order
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, shipday_order_id, estado, socio_id')
      .eq('id', pedido_id)
      .single()

    if (pedidoError || !pedido || !pedido.shipday_order_id) {
      return json({ ok: true, synced: false })
    }

    // Get the socio's Shipday API key
    let apiKey: string | null = null

    const { data: socioData } = await supabase
      .from('socios')
      .select('shipday_api_key')
      .eq('id', pedido.socio_id)
      .single()

    apiKey = socioData?.shipday_api_key || null

    // Fallback to global API key
    if (!apiKey) {
      apiKey = Deno.env.get('SHIPDAY_CARRIER_API_KEY') || null
    }

    if (!apiKey) {
      return json({ ok: true, synced: false })
    }

    // Call Shipday API to get order status
    const shipdayRes = await fetch(`https://api.shipday.com/orders/${pedido.shipday_order_id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!shipdayRes.ok) {
      console.warn(`Shipday API returned ${shipdayRes.status} for order ${pedido.shipday_order_id}`)
      return json({ ok: true, synced: false })
    }

    const shipdayData = await shipdayRes.json()

    // Extract status and tracking URL from Shipday response
    const shipdayStatus = shipdayData.orderStatus?.status
      || shipdayData.status
      || shipdayData.delivery_status
      || null

    if (!shipdayStatus) {
      return json({ ok: true, synced: false })
    }

    const mappedStatus = mapShipdayStatus(shipdayStatus)
    const trackingUrl = shipdayData.trackingUrl || shipdayData.tracking_url || null

    // Build update object
    const updateData: Record<string, unknown> = {
      shipday_status: shipdayStatus,
    }

    if (trackingUrl) {
      updateData.shipday_tracking_url = trackingUrl
    }

    // Only update estado for terminal states, and only if not already terminal
    const terminalStates = ['entregado', 'cancelado']
    const isAlreadyTerminal = terminalStates.includes(pedido.estado)

    if (terminalStates.includes(mappedStatus) && !isAlreadyTerminal) {
      updateData.estado = mappedStatus

      if (mappedStatus === 'entregado') {
        updateData.entregado_at = new Date().toISOString()
      } else if (mappedStatus === 'cancelado') {
        updateData.cancelado_at = new Date().toISOString()
      }
    }

    // Update the order
    await supabase
      .from('pedidos')
      .update(updateData)
      .eq('id', pedido_id)

    return json({ ok: true, synced: true })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('sync-shipday-status error:', msg)
    // Always return 200 (fire-and-forget)
    return json({ ok: false, error: msg })
  }
})
