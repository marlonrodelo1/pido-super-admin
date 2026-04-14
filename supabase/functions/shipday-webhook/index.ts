import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

// Map Shipday status to Pidoo status
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

/**
 * Verify HMAC-SHA256 signature from Shipday webhook.
 * Returns true if the signature is valid, false otherwise.
 */
async function verifyShipdaySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const computedHex = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison to prevent timing attacks
  if (computedHex.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const CORS = getCorsHeaders(req)

  // Always return 200 to Shipday to avoid retries
  const sendSuccess = () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

  try {
    // Read the raw body first (needed for both signature verification and JSON parsing)
    const rawBody = await req.text()

    // --- Webhook signature verification ---
    const webhookSecret = Deno.env.get('SHIPDAY_WEBHOOK_SECRET')
    const signatureHeader = req.headers.get('x-shipday-signature')

    if (webhookSecret) {
      // Secret is configured: verify signature
      if (!signatureHeader) {
        console.error('Shipday webhook rejected: missing x-shipday-signature header')
        return new Response(JSON.stringify({ error: 'Missing signature' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      const isValid = await verifyShipdaySignature(rawBody, signatureHeader, webhookSecret)
      if (!isValid) {
        console.error('Shipday webhook rejected: invalid signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Secret NOT configured: log warning for the operator
      console.warn(
        '[SECURITY] SHIPDAY_WEBHOOK_SECRET is not configured. ' +
        'Webhook signature verification is disabled. ' +
        'Please set this secret in your Supabase Edge Function environment variables.'
      )
    }

    // Parse webhook payload
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.error('Shipday webhook rejected: invalid JSON body')
      return sendSuccess()
    }

    // Shipday webhook format varies, but typically includes:
    // - orderId, orderNumber, status, trackingUrl, etc.
    const orderNumber = body.orderNumber || body.order_number || body.codigo || null
    const shipdayStatus = body.status || body.delivery_status || null

    if (!orderNumber || !shipdayStatus) {
      console.warn('Invalid Shipday webhook payload: missing orderNumber or status', body)
      return sendSuccess()
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Find order by codigo (order number)
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, estado')
      .eq('codigo', orderNumber)
      .single()

    if (pedidoError || !pedido) {
      console.warn(`Order ${orderNumber} not found in database`)
      return sendSuccess()
    }

    // Map Shipday status to our status
    const newStatus = mapShipdayStatus(shipdayStatus as string)
    const trackingUrl = body.trackingUrl || body.tracking_url || null

    // Prepare update object
    const updateData: Record<string, unknown> = {
      shipday_status: shipdayStatus,
    }

    if (trackingUrl) {
      updateData.shipday_tracking_url = trackingUrl
    }

    // Update estado only if status indicates delivery or cancellation
    if (['entregado', 'cancelado'].includes(newStatus) && pedido.estado !== newStatus) {
      updateData.estado = newStatus

      if (newStatus === 'entregado') {
        updateData.entregado_at = new Date().toISOString()
      } else if (newStatus === 'cancelado') {
        updateData.cancelado_at = new Date().toISOString()
        updateData.motivo_cancelacion = 'Cancelado por repartidor'
      }
    }

    // Update order
    const { error: updateError } = await supabase
      .from('pedidos')
      .update(updateData)
      .eq('id', pedido.id)

    if (updateError) {
      console.error('Error updating order:', updateError)
      // Still return 200 to avoid Shipday retries
      return sendSuccess()
    }

    console.log(`Order ${orderNumber} updated: ${shipdayStatus} -> ${newStatus}`)
    return sendSuccess()

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Webhook processing error'
    console.error('Shipday webhook error:', msg)
    // Return 200 even on error to prevent Shipday retries
    return sendSuccess()
  }
})
