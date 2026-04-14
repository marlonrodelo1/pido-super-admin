import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { encode as base64url } from 'https://deno.land/std@0.177.0/encoding/base64url.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') || 'pidoo-push'
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') || 'firebase-adminsdk-fbsvc@pidoo-push.iam.gserviceaccount.com'
const FIREBASE_PRIVATE_KEY = Deno.env.get('FIREBASE_PRIVATE_KEY') || ''

let cachedAccessToken: string | null = null

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = { iss: FIREBASE_CLIENT_EMAIL, sub: FIREBASE_CLIENT_EMAIL, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/firebase.messaging' }
  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)))
  const unsignedToken = `${headerB64}.${payloadB64}`
  const pemContent = FIREBASE_PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\\\\n/g, '').replace(/\\n/g, '').replace(/\s/g, '')
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedToken))
  const jwt = `${unsignedToken}.${base64url(new Uint8Array(signature))}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error('Failed to get FCM access token')
  cachedAccessToken = tokenData.access_token
  return cachedAccessToken!
}

async function sendFCM(fcmToken: string, title: string, body: string, data: Record<string, string> = {}): Promise<{ ok: boolean; error?: string; unregistered?: boolean }> {
  const accessToken = await getAccessToken()
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: fcmToken, notification: { title, body }, data: data || {}, android: { priority: 'high', notification: { sound: 'default', channel_id: 'pedidos' } }, apns: { payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } } }, webpush: { notification: { title, body, icon: '/favicon.png', requireInteraction: true, vibrate: [500, 200, 500, 200, 500] }, headers: { Urgency: 'high' } } } }),
  })
  if (res.ok) return { ok: true }
  const errBody = await res.text()
  const unregistered = errBody.includes('UNREGISTERED') || errBody.includes('NOT_FOUND') || errBody.includes('INVALID_ARGUMENT') || res.status === 404
  return { ok: false, error: errBody, unregistered }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const CORS = getCorsHeaders(req)
  cachedAccessToken = null

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verificar auth: acepta service_role_key, JWT de usuario, O anon_key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: CORS })
    }
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    if (token !== serviceRoleKey && token !== anonKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Token invalido' }), { status: 401, headers: CORS })
      }
    }

    const { target_type, target_id, title, body, data } = await req.json()
    console.log(`[enviar_push] target=${target_type}/${target_id} title="${title}"`)

    let query = supabase.from('push_subscriptions').select('*')
    if (target_type === 'cliente' && target_id) query = query.eq('user_id', target_id).eq('user_type', 'cliente')
    else if (target_type === 'restaurante' && target_id) query = query.eq('establecimiento_id', target_id).eq('user_type', 'restaurante')
    else if (target_type === 'socio' && target_id) query = query.eq('socio_id', target_id).eq('user_type', 'socio')

    const { data: subs } = await query
    if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

    let sent = 0
    const toDelete: string[] = []

    for (const sub of subs) {
      if (!sub.fcm_token || sub.fcm_token === 'DEBUG') continue
      try {
        const result = await sendFCM(sub.fcm_token, title, body, data || {})
        if (result.ok) sent++
        else if (result.unregistered) toDelete.push(sub.id)
      } catch (e) {
        console.error(`[enviar_push] Exception sending to ${sub.id}:`, e.message || e)
      }
    }

    if (toDelete.length > 0) await supabase.from('push_subscriptions').delete().in('id', toDelete)
    if (target_type === 'cliente' && target_id) {
      await supabase.from('notificaciones').insert({ usuario_id: target_id, titulo: title, descripcion: body, leida: false })
    }

    return new Response(JSON.stringify({ sent, total: subs.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('[enviar_push] Fatal error:', error.message || error)
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
