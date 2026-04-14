import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

interface StripeRefundResponse {
  id?: string
  amount?: number
  status?: string
  error?: { message: string }
}

async function crearReembolsoStripe(paymentIntentId: string, amount?: number): Promise<StripeRefundResponse> {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }

  const basicAuth = btoa(`${secretKey}:`)
  const params = new URLSearchParams()
  params.append('payment_intent', paymentIntentId)

  if (amount) {
    params.append('amount', (Math.round(amount * 100)).toString()) // Convert to cents
  }

  const response = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const result = await response.json()

  if (!response.ok) {
    const error = result.error?.message || 'Failed to create refund'
    throw new Error(error)
  }

  return result as StripeRefundResponse
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
      .select('id, stripe_payment_id, total, stripe_refund_id')
      .eq('id', pedido_id)
      .single()

    if (pedidoError || !pedido) {
      return Response.json(
        { error: 'Pedido no encontrado' },
        { status: 404, headers: CORS }
      )
    }

    // Check if already refunded
    if (pedido.stripe_refund_id) {
      return Response.json(
        { error: 'Este pedido ya ha sido reembolsado', already_refunded: true },
        { status: 400, headers: CORS }
      )
    }

    if (!pedido.stripe_payment_id) {
      return Response.json(
        { error: 'Este pedido no tiene un payment_id de Stripe' },
        { status: 400, headers: CORS }
      )
    }

    // Create refund in Stripe
    const refund = await crearReembolsoStripe(pedido.stripe_payment_id, pedido.total)

    if (!refund.id) {
      throw new Error('No refund ID returned from Stripe')
    }

    // Update order with refund info
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        stripe_refund_id: refund.id,
        monto_reembolsado: pedido.total,
        reembolsado_at: new Date().toISOString(),
      })
      .eq('id', pedido_id)

    if (updateError) {
      console.error('Error updating order:', updateError)
      // Even if DB update fails, refund was created in Stripe
      return Response.json(
        {
          success: true,
          refund_id: refund.id,
          monto_reembolsado: pedido.total,
          warning: 'Refund created in Stripe but failed to update local database',
        },
        { status: 200, headers: CORS }
      )
    }

    return Response.json(
      {
        success: true,
        refund_id: refund.id,
        monto_reembolsado: pedido.total,
      },
      { status: 200, headers: CORS }
    )

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error'
    console.error('Refund error:', msg)
    return Response.json(
      { error: msg },
      { status: 400, headers: CORS }
    )
  }
})
