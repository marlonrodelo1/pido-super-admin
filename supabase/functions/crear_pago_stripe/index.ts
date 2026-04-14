import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

interface PaymentRequest {
  amount: number
  currency: string
  pedido_codigo: string
  customer_email: string
  user_id: string
  action?: string
  payment_method_id?: string
}

interface StripeResponse {
  client_secret?: string
  clientSecret?: string
  paymentIntentId?: string
  id?: string
  status?: string
  error?: { message: string }
}

async function callStripeAPI(method: string, endpoint: string, data: unknown): Promise<StripeResponse> {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }

  const basicAuth = btoa(`${secretKey}:`)
  const response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data instanceof FormData ? data : new URLSearchParams(data as Record<string, string>).toString(),
  })

  const result = await response.json()

  if (!response.ok) {
    const error = result.error?.message || result.message || 'Stripe API error'
    throw new Error(error)
  }

  return result as StripeResponse
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const CORS = getCorsHeaders(req)

  try {
    const body = (await req.json()) as PaymentRequest

    // Handle list_cards action
    if (body.action === 'list_cards') {
      // TODO: Implement list saved cards for user
      // This would require storing payment methods per user in Stripe
      return Response.json(
        { cards: [] },
        { status: 200, headers: CORS }
      )
    }

    // Handle pay_saved action (charge saved card)
    if (body.action === 'pay_saved') {
      // TODO: Implement charging a saved payment method
      // This would use Stripe's saved payment methods feature
      return Response.json(
        { error: 'Saved card payments not yet implemented' },
        { status: 400, headers: CORS }
      )
    }

    // Default: Create PaymentIntent for new card
    const { amount, currency = 'eur', pedido_codigo, customer_email, user_id } = body

    if (!amount || !pedido_codigo || !customer_email || !user_id) {
      return Response.json(
        { error: 'Missing required fields: amount, pedido_codigo, customer_email, user_id' },
        { status: 400, headers: CORS }
      )
    }

    // Create PaymentIntent
    const params = new URLSearchParams()
    params.append('amount', (Math.round(amount * 100)).toString()) // Convert to cents
    params.append('currency', currency.toLowerCase())
    params.append('payment_method_types[]', 'card')
    params.append('description', `Pedido ${pedido_codigo}`)
    params.append('metadata[pedido_codigo]', pedido_codigo)
    params.append('metadata[user_id]', user_id)
    params.append('receipt_email', customer_email)
    params.append('statement_descriptor', 'PIDO DELIVERY')

    const result = await callStripeAPI('POST', '/payment_intents', params.toString())

    if (!result.client_secret || !result.id) {
      throw new Error('Invalid Stripe response: missing client_secret or id')
    }

    return Response.json(
      {
        clientSecret: result.client_secret,
        paymentIntentId: result.id,
      },
      { status: 200, headers: CORS }
    )

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error'
    console.error('Stripe error:', msg)
    return Response.json(
      { error: msg },
      { status: 400, headers: CORS }
    )
  }
})
