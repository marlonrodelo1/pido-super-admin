// Allowed origins for CORS
const ALLOWED_ORIGINS: string[] = [
  'https://pidoo.es',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
]

// Regex to match any subdomain of pidoo.es (e.g. https://admin.pidoo.es, https://partner.pidoo.es)
const SUBDOMAIN_REGEX = /^https:\/\/([a-z0-9-]+\.)?pidoo\.es$/

/**
 * Check if the given origin is allowed by our CORS policy.
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  if (SUBDOMAIN_REGEX.test(origin)) return true
  return false
}

/**
 * Build CORS headers for a given request.
 * If the request's Origin is in the whitelist, it is reflected back.
 * Otherwise, no Access-Control-Allow-Origin header is set (browser will block).
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key, x-shipday-signature',
  }

  if (isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!
    headers['Vary'] = 'Origin'
  }

  return headers
}

/**
 * Handle an OPTIONS preflight request with the proper CORS headers.
 */
export function handleCorsPreflightRequest(req: Request): Response {
  return new Response('ok', { status: 200, headers: getCorsHeaders(req) })
}
