# Supabase Edge Functions - Pidoo

This directory contains all Supabase Edge Functions for the Pidoo platform.

## Functions Overview

### 1. `calcular_envio`
Calculates delivery cost based on distance and tariff configuration.

**Endpoint:** `POST /functions/v1/calcular_envio`

**Request Body:**
```json
{
  "establecimiento_id": "uuid",
  "lat_cliente": 40.4168,
  "lng_cliente": -3.7038,
  "socio_id": "uuid|null",
  "canal": "pido"
}
```

**Response:**
```json
{
  "success": true,
  "envio": 4.50,
  "distancia_km": 8.5
}
```

**Error Response (out of range):**
```json
{
  "error": "La dirección está fuera del área de reparto...",
  "fuera_de_radio": true,
  "distancia_km": 25.3
}
```

### 2. `generar_codigo_pedido`
Generates a unique order code (PD-XXXXXX format) with automatic retry if code already exists.

**Endpoint:** `POST /functions/v1/generar_codigo_pedido`

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "codigo": "PD-AB12CD"
}
```

### 3. `crear_pago_stripe`
Creates a Stripe PaymentIntent for new card payments.

**Endpoint:** `POST /functions/v1/crear_pago_stripe`

**Request Body:**
```json
{
  "amount": 34.50,
  "currency": "eur",
  "pedido_codigo": "PD-AB12CD",
  "customer_email": "client@example.com",
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxxxx_secret_yyyyy",
  "paymentIntentId": "pi_xxxxx"
}
```

### 4. `crear_reembolso_stripe`
Processes a refund for a cancelled order with Stripe payment.

**Endpoint:** `POST /functions/v1/crear_reembolso_stripe`

**Request Body:**
```json
{
  "pedido_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "refund_id": "re_xxxxx",
  "monto_reembolsado": 34.50
}
```

### 5. `create-shipday-order`
Creates a delivery order in Shipday for logistics management.

**Endpoint:** `POST /functions/v1/create-shipday-order`

**Request Body:**
```json
{
  "pedido_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "shipdayOrderId": "shipday_order_id"
}
```

### 6. `shipday-webhook`
Webhook endpoint to receive Shipday delivery status updates.

**Endpoint:** `POST /functions/v1/shipday-webhook`

**Shipday Payload (example):**
```json
{
  "orderNumber": "PD-AB12CD",
  "status": "delivered",
  "trackingUrl": "https://shipday.com/track/...",
  "id": "shipday_order_id"
}
```

**Response:** Always `200 OK` to prevent Shipday retries.

## Environment Variables

Configure these in your Supabase project settings:

- **STRIPE_SECRET_KEY**: Stripe API secret key (starts with `sk_`)
  - Get from: https://dashboard.stripe.com/apikeys

- **SHIPDAY_CARRIER_API_KEY**: Shipday API key for default carrier
  - Get from: https://shipday.com/settings/api

- **SUPABASE_URL**: Your Supabase project URL
  - Format: `https://xxxxx.supabase.co`

- **SUPABASE_SERVICE_ROLE_KEY**: Service role key (full access)
  - Get from: Supabase Dashboard > Settings > API

- **SUPABASE_ANON_KEY**: Anonymous key (public)
  - Get from: Supabase Dashboard > Settings > API

## Database Schema Requirements

The functions expect these tables to exist:

### `establecimientos`
```sql
- id (uuid) PRIMARY KEY
- nombre (text)
- direccion (text)
- latitud (float)
- longitud (float)
- telefono (text)
- activo (boolean)
```

### `pedidos`
```sql
- id (uuid) PRIMARY KEY
- codigo (text) UNIQUE
- usuario_id (uuid) FK
- establecimiento_id (uuid) FK
- socio_id (uuid) FK
- estado (text): 'nuevo', 'aceptado', 'preparando', 'listo', 'recogido', 'en_camino', 'entregado', 'cancelado'
- metodo_pago (text): 'tarjeta' | 'efectivo'
- modo_entrega (text): 'delivery' | 'recogida'
- stripe_payment_id (text)
- stripe_refund_id (text)
- shipday_order_id (text)
- shipday_tracking_url (text)
- shipday_status (text)
- total (numeric)
- subtotal (numeric)
- coste_envio (numeric)
- propina (numeric)
- descuento (numeric)
- lat_entrega (float)
- lng_entrega (float)
- direccion_entrega (text)
- motivo_cancelacion (text)
- entregado_at (timestamp)
- cancelado_at (timestamp)
- reembolsado_at (timestamp)
- monto_reembolsado (numeric)
- created_at (timestamp)
```

### `pedido_items`
```sql
- id (uuid) PRIMARY KEY
- pedido_id (uuid) FK
- producto_id (uuid)
- nombre_producto (text)
- cantidad (integer)
- precio_unitario (numeric)
- tamano (text)
- extras (jsonb)
```

### `configuracion_envio`
```sql
- id (uuid) PRIMARY KEY
- socio_id (uuid) FK (nullable for global config)
- tarifa_base (numeric) DEFAULT 2.50
- precio_por_km (numeric) DEFAULT 0.50
- radio_maximo (numeric) DEFAULT 15
```

### `socios`
```sql
- id (uuid) PRIMARY KEY
- nombre (text)
- shipday_api_key (text)
- activo (boolean)
```

### `usuarios`
```sql
- id (uuid) PRIMARY KEY
- nombre (text)
- apellido (text)
- telefono (text)
- latitud (float)
- longitud (float)
- direccion (text)
```

## Deployment

### Deploy a single function:
```bash
supabase functions deploy calcular_envio
```

### Deploy all functions:
```bash
supabase functions deploy
```

### View function logs:
```bash
supabase functions list
supabase functions logs calcular_envio
```

## Testing

### Using cURL:
```bash
# Test calcular_envio
curl -X POST https://your-project.supabase.co/functions/v1/calcular_envio \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "establecimiento_id": "uuid-here",
    "lat_cliente": 40.4168,
    "lng_cliente": -3.7038,
    "canal": "pido"
  }'

# Test generar_codigo_pedido
curl -X POST https://your-project.supabase.co/functions/v1/generar_codigo_pedido \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{}'
```

## Troubleshooting

### Function returns 401 Unauthorized
- Ensure you're including proper Authorization header
- Check that the user token is valid

### Function times out
- Check database connection
- Verify that Stripe/Shipday APIs are reachable
- Check function logs for specific errors

### Webhook not receiving updates
- Configure the Shipday webhook URL to point to: `https://your-project.supabase.co/functions/v1/shipday-webhook`
- Test webhook delivery in Shipday dashboard

## Notes

- All functions include CORS headers for browser requests
- Stripe operations use the API in "cents" format (multiply by 100)
- Shipday webhook always returns 200 OK to prevent retry loops
- Distance calculations use Haversine formula
- Order codes are prefixed with "PD-" for easy identification
