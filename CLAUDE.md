# Super Admin Panel - Documentacion Completa

## Resumen
Panel de administracion global de la plataforma PIDOO. Gestion completa de establecimientos, socios/riders, usuarios, pedidos, finanzas, reembolsos Stripe, notificaciones push, soporte y configuracion de la plataforma.

**Stack:** React 19.2 + Vite 8 + Supabase 2.100 + Google Maps API + Lucide React
**Theme:** Dark mode, color primario #FF6B2C, fondo #0D0D0D, tipografia DM Sans
**Puerto dev:** 5177
**Web:** admin.pidoo.es (Dokploy auto-deploy)
**Dockerfile raiz:** Dockerfile.super-admin

---

## Arquitectura

SPA web-only con sidebar fijo (240px) y navegacion por secciones via `useState`. No usa react-router-dom para rutas (aunque esta en package.json). Toda la data se opera directamente contra Supabase desde el cliente.

- **Auth:** Supabase Auth email/password con validacion de `usuarios.rol === 'superadmin'`
- **Datos:** Queries directas a Supabase (select, insert, update, delete)
- **Realtime:** Suscripcion en `pedidos` (Pedidos.jsx) y `socios` (MapaAdmin.jsx)
- **Push:** Llama a Edge Function `enviar_push` para enviar notificaciones
- **Pagos:** Llama a Edge Function `crear_reembolso_stripe` para reembolsos
- **Storage:** Supabase Storage para logos, banners, productos (via `upload.js`)

---

## Estructura de archivos

```
super-admin/
├── src/
│   ├── App.jsx              # AdminProvider + Sidebar + seccion routing + ErrorBoundary + toast/confirmar
│   ├── main.jsx             # Entry point (StrictMode)
│   ├── index.css            # DM Sans font, dark theme global, scrollbar, input reset
│   ├── context/
│   │   └── AdminContext.jsx # Auth + validacion rol superadmin (login, logout, session)
│   ├── components/
│   │   ├── Sidebar.jsx      # 11 items de menu, lucide icons, sidebar fijo 240px
│   │   └── ErrorBoundary.jsx # Captura errores React, muestra pantalla de error con retry
│   ├── lib/
│   │   ├── supabase.js      # Cliente Supabase (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
│   │   ├── darkStyles.js    # Objeto `ds` con estilos dark compartidos (card, table, badge, btn, etc)
│   │   └── upload.js        # uploadImage(file, bucket, folder) → URL publica Supabase Storage
│   └── pages/
│       ├── Login.jsx              # Login email/password, muestra error si no es superadmin
│       ├── Dashboard.jsx          # Stats globales + pedidos recientes (filtro hoy/semana/mes)
│       ├── Establecimientos.jsx   # CRUD completo: lista, detalle, editar, crear, categorias, productos, extras, resenas
│       ├── Socios.jsx             # Lista, detalle, editar, aceptar/rechazar solicitudes, documentacion, resenas
│       ├── Usuarios.jsx           # Lista, detalle, editar, historial de pedidos del usuario
│       ├── Pedidos.jsx            # Lista con realtime, filtros estado/pago/canal, detalle con items, cancelar
│       ├── MapaAdmin.jsx          # Google Maps dark con riders en tiempo real + establecimientos
│       ├── Notificaciones.jsx     # Enviar push a segmentos (todos/clientes/restaurantes/socios), historial
│       ├── SoporteAdmin.jsx       # Chat soporte con socios en tiempo real
│       ├── Finanzas.jsx           # Tabs: resumen, balance restaurantes, balance socios, facturas, movimientos
│       ├── Reembolsos.jsx         # Gestion reembolsos Stripe para pedidos cancelados con tarjeta
│       └── Configuracion.jsx      # Tarifas envio, comisiones, radio, categorias generales, paginas legales
├── Dockerfile                     # Multi-stage build (node + nginx con security headers)
├── nginx.conf                     # Security headers + gzip + cache + SPA routing
├── vite.config.js                 # Port 5177
├── package.json
└── .env.example
```

---

## App.jsx — Exports globales

```javascript
// Funciones globales importables desde cualquier pagina:
import { toast, confirmar } from './App'

toast('Mensaje de exito')                    // Toast verde auto-dismiss 3s
toast('Algo fallo', 'error')                 // Toast rojo auto-dismiss 4s
const ok = await confirmar('¿Estas seguro?') // Modal confirm/cancel → Promise<boolean>
```

**Estructura:**
- `<AdminProvider>` envuelve todo
- `<ErrorBoundary>` captura errores de render
- `<AppContent>` verifica auth, muestra Login o layout con Sidebar
- Navegacion via `useState('dashboard')` con 11 secciones
- Sidebar fijo a la izquierda (240px), main con `marginLeft: 240`

---

## AdminContext.jsx — Autenticacion

```javascript
const { user, loading, login, logout, accessDenied } = useAdmin()
```

- **login(email, password):** Autentica con Supabase, verifica `usuarios.rol === 'superadmin'`
- **logout():** Cierra sesion Supabase
- **user:** Objeto usuario de Supabase (null si no autenticado o no superadmin)
- **accessDenied:** true si el usuario esta autenticado pero NO es superadmin
- **Validacion:** Al iniciar sesion, consulta `usuarios` para verificar el rol. Si no es superadmin, hace signOut y muestra error.

---

## Paginas — Detalle

### Dashboard.jsx
- **Stats grid:** pedidos totales, ventas, comisiones (dinamicas desde config), usuarios, socios, establecimientos
- **Filtro periodo:** hoy / semana / mes
- **Tabla:** 10 pedidos mas recientes con codigo, total, estado, pago, canal, fecha
- **Comisiones:** Lee porcentaje de `configuracion_plataforma` (clave `comision_plataforma`)

### Establecimientos.jsx (~540 lineas)
- **Lista:** Filtro por categoria_padre (comida/farmacia/marketplace), busqueda por nombre
- **Crear:** Modal con nombre, tipo, categoria padre, email, telefono, direccion, radio, logo, banner, descripcion
- **Detalle:** Logo/banner upload, editar campos, toggle activo/inactivo
- **Categorias generales:** Toggle asignacion de categorias generales al establecimiento
- **Categorias de carta:** CRUD categorias propias del establecimiento
- **Productos:** CRUD completo con modal, imagen upload, asignacion de extras
- **Extras:** Visualizacion de grupos de extras y sus opciones
- **Resenas:** Lista con eliminar
- **Tablas:** establecimientos, categorias, categorias_generales, establecimiento_categorias, productos, grupos_extras, extras_opciones, producto_extras, resenas

### Socios.jsx (~275 lineas)
- **Lista:** Filtros (todos/activos/inactivos/en_servicio), busqueda por nombre
- **Solicitudes:** Banner con solicitudes pendientes (activo=false, rechazado=false), aceptar/rechazar
- **Detalle:** Editar nombre, email, telefono, modo_entrega, radio_km, logo upload
- **Documentacion:** DNI, permiso conducir, seguro vehiculo, alta autonomo (pendiente de implementar upload)
- **Resenas:** Lista con eliminar
- **Al aceptar:** Actualiza `socios.activo=true` Y `usuarios.rol='socio'`

### Usuarios.jsx (~208 lineas)
- **Lista:** Busqueda por nombre, email, telefono
- **Detalle:** Avatar, stats (total gastado, pedidos, entregados), editar nombre/apellido/telefono/direccion/metodo_pago
- **Historial:** Ultimos 30 pedidos con join a establecimientos, estado coloreado, metodo pago, canal

### Pedidos.jsx (~151 lineas)
- **Realtime:** Suscripcion a cambios en tabla `pedidos` (INSERT/UPDATE/DELETE)
- **Filtros:** Por estado (8 estados), metodo_pago (tarjeta/efectivo), canal (pido/pidogo)
- **Detalle:** Subtotal, envio, propina, total, direccion, notas, items del pedido
- **Cancelar:** Boton para cambiar estado a 'cancelado' (no disponible si ya entregado/cancelado)

### MapaAdmin.jsx (~180 lineas)
- **Google Maps:** Dark theme, centrado en Puerto de la Cruz (28.4148, -16.5477)
- **Riders:** Marcadores verdes con emoji scooter, realtime via Supabase channel + polling 10s
- **Establecimientos:** Marcadores con borde naranja, emoji segun tipo
- **InfoWindows:** Nombre, rating, tipo/estado
- **Lista:** Grid de riders activos con click para centrar mapa
- **Requiere:** VITE_GOOGLE_MAPS_API_KEY

### Notificaciones.jsx (~235 lineas)
- **Stats:** Conteo de suscripciones por tipo (clientes/restaurantes/socios)
- **Enviar:** Selector destino, titulo, mensaje, preview visual
- **Mecanismo:** Itera suscripciones unicas y llama `enviar_push` edge function por cada una
- **Historial:** Ultimas 20 notificaciones de tabla `notificaciones`

### SoporteAdmin.jsx (~134 lineas)
- **Layout:** Panel izquierdo (conversaciones) + panel derecho (chat)
- **Conversaciones:** Agrupadas por socio_id, filtro tipo='soporte'
- **Realtime:** Suscripcion a mensajes nuevos para auto-actualizar
- **Enviar:** Como 'soporte' (de='soporte')
- **Marcar leido:** Al abrir conversacion, marca mensajes del socio como leidos

### Finanzas.jsx (~233 lineas)
- **5 tabs:** Resumen, Balance Restaurantes, Balance Socios, Facturas, Movimientos
- **Resumen:** Comisiones totales plataforma, pendiente de cobro
- **Restaurantes:** Pedidos tarjeta/efectivo, a_favor, debe, balance_neto, boton "Pagar"
- **Socios:** Comisiones, envios, propinas, total_pagar, efectivo recaudado, boton "Pagar"
- **Facturas:** Facturas semanales con numero, socio, restaurante, semana, pedidos, totales, boton "Pagar"
- **Movimientos:** Tipo (entrada_tarjeta, pago_restaurante, pago_socio, cobro_comision), monto, descripcion
- **Tablas:** comisiones, balances_restaurante, balances_socio, facturas_semanales, movimientos_cuenta

### Reembolsos.jsx (~281 lineas)
- **Filtros:** Pendientes / Procesados / Todos, busqueda por codigo o restaurante
- **Stats:** Pendientes, procesados, total reembolsado
- **Solo tarjeta:** Filtra pedidos cancelados/fallidos con metodo_pago='tarjeta'
- **Procesar:** Llama edge function `crear_reembolso_stripe` con pedido_id
- **Estados:** Sin ID de pago (no reembolsable), Pendiente, Reembolsado

### Configuracion.jsx (~323 lineas)
- **Tarifas envio:** Base, radio base, precio km adicional, tarifa maxima + simulador visual
- **Comisiones:** Plataforma %, socio reparto %, socio recogida %
- **Radio cobertura:** Slider 1-30 km (valor default para nuevos establecimientos)
- **Categorias generales:** CRUD con emoji + nombre (se muestran en pido-app)
- **Paginas legales:** Editor HTML con preview para terminos y privacidad
- **Tabla:** configuracion_plataforma (clave-valor), categorias_generales, paginas_legales

---

## darkStyles.js — Estilos compartidos

Objeto `ds` exportado con:
- `card` — Fondo glass con blur, bordes sutiles
- `table`, `tableHeader`, `tableRow` — Tabla con flex layout
- `badge` — Tags de estado coloreados
- `input`, `formInput`, `select` — Campos de formulario dark
- `filterBtn`, `actionBtn`, `primaryBtn`, `secondaryBtn` — Botones
- `backBtn` — Boton "volver" naranja
- `h1`, `h2`, `label`, `muted` — Tipografia
- `modal`, `modalContent` — Overlays modales

---

## Base de datos — Tablas usadas

| Tabla | Paginas que la usan |
|---|---|
| `establecimientos` | Establecimientos, Dashboard, MapaAdmin, Finanzas |
| `pedidos` | Dashboard, Pedidos, Usuarios, Reembolsos |
| `pedido_items` | Pedidos |
| `usuarios` | AdminContext, Dashboard, Usuarios |
| `socios` | Socios, Dashboard, MapaAdmin, Finanzas, SoporteAdmin |
| `productos` | Establecimientos |
| `categorias` | Establecimientos |
| `categorias_generales` | Establecimientos, Configuracion |
| `establecimiento_categorias` | Establecimientos |
| `grupos_extras` | Establecimientos |
| `extras_opciones` | Establecimientos |
| `producto_extras` | Establecimientos |
| `resenas` | Establecimientos, Socios |
| `mensajes` | SoporteAdmin |
| `push_subscriptions` | Notificaciones |
| `notificaciones` | Notificaciones |
| `configuracion_plataforma` | Configuracion, Dashboard |
| `comisiones` | Finanzas |
| `balances_restaurante` | Finanzas |
| `balances_socio` | Finanzas |
| `facturas_semanales` | Finanzas |
| `movimientos_cuenta` | Finanzas |
| `paginas_legales` | Configuracion |

---

## Edge Functions usadas

| Funcion | Uso |
|---|---|
| `enviar_push` | Notificaciones.jsx — enviar push FCM a segmentos |
| `crear_reembolso_stripe` | Reembolsos.jsx — reembolsar pagos Stripe de pedidos cancelados |

---

## Variables de entorno

```
VITE_SUPABASE_URL=https://rmrbxrabngdmpgpfmjbo.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_GOOGLE_MAPS_API_KEY=<google_maps_key>
```

---

## Build y Deploy

**Desarrollo:**
```bash
npm install
npm run dev    # http://localhost:5177
```

**Produccion (Dokploy):**
- Push a `main` → Dokploy usa `Dockerfile.super-admin` (raiz del repo)
- Multi-stage: node build → nginx con `nginx.conf` (security headers + gzip + cache)
- Variables de entorno se pasan como ARG en el Dockerfile

**Build local:**
```bash
npm run build   # Genera dist/
```

---

## Convenciones clave

- **Estilos:** Inline JS via `darkStyles.js` (ds). No CSS modules, no styled-components, no Tailwind
- **Navegacion:** `useState('seccion')` en App.jsx (no react-router)
- **Iconos:** Lucide React
- **Dialogos:** `toast()` y `confirmar()` exportados desde App.jsx
- **Fuente:** DM Sans (Google Fonts)
- **Colores:** #0D0D0D fondo, #111111 sidebar, #FF6B2C primario, #F5F5F5 texto, rgba(255,255,255,0.4) muted
- **Tablas:** Flex layout (no HTML table), header + rows
- **Formularios:** Grid 2 columnas, labels arriba, inputs full-width
- **Tiempo real:** Supabase channels para pedidos y posicion de riders
- **Uploads:** Supabase Storage via `uploadImage()` en lib/upload.js
