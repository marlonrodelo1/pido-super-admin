import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'

// Haversine formula to calculate distance between two points
function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const CORS = getCorsHeaders(req)

  try {
    const { establecimiento_id, lat_cliente, lng_cliente, socio_id, canal } = await req.json()

    // Validate inputs
    if (!establecimiento_id || lat_cliente === undefined || lng_cliente === undefined) {
      return Response.json(
        { error: 'Missing required parameters: establecimiento_id, lat_cliente, lng_cliente' },
        { status: 400, headers: CORS }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get establishment location
    const { data: establecimiento, error: estError } = await supabase
      .from('establecimientos')
      .select('latitud, longitud')
      .eq('id', establecimiento_id)
      .single()

    if (estError || !establecimiento) {
      return Response.json(
        { error: 'Establecimiento no encontrado' },
        { status: 404, headers: CORS }
      )
    }

    // Calculate distance
    const distancia_km = calcularDistancia(
      establecimiento.latitud,
      establecimiento.longitud,
      lat_cliente,
      lng_cliente
    )

    // Get delivery tariff configuration
    // First try to get partner-specific tariff, then fall back to global config
    let tariffQuery = supabase
      .from('configuracion_envio')
      .select('tarifa_base, precio_por_km, radio_maximo')

    if (socio_id) {
      tariffQuery = tariffQuery.eq('socio_id', socio_id)
    } else {
      tariffQuery = tariffQuery.is('socio_id', null)
    }

    const { data: tarifas, error: tariffError } = await tariffQuery

    // Use default tariff if not found
    const tariff = tarifas?.[0] || {
      tarifa_base: 2.5,
      precio_por_km: 0.5,
      radio_maximo: 15
    }

    // Check if client is within delivery radius
    if (distancia_km > tariff.radio_maximo) {
      return Response.json(
        {
          error: `La dirección está fuera del área de reparto (${Math.round(distancia_km)} km, máximo ${tariff.radio_maximo} km)`,
          fuera_de_radio: true,
          distancia_km: Math.round(distancia_km * 100) / 100
        },
        { status: 400, headers: CORS }
      )
    }

    // Calculate delivery cost
    const envio = Math.max(
      tariff.tarifa_base,
      tariff.tarifa_base + (distancia_km * tariff.precio_por_km)
    )

    return Response.json(
      {
        success: true,
        envio: Math.round(envio * 100) / 100, // Round to 2 decimals
        distancia_km: Math.round(distancia_km * 100) / 100,
      },
      { status: 200, headers: CORS }
    )

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return Response.json({ error: msg }, { status: 500, headers: CORS })
  }
})
