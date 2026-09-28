import { useState } from 'react'
import { CreditCard, Smartphone, AlertCircle, RotateCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle, Segmented, Chip, MiniBtn } from '../lib/ui'
import { toast, confirmar } from '../App'

// Cobro con tarjeta en la puerta (Tap to Pay de Stripe) — 28 sep 2026.
//
// El repartidor (socio) cobra la tarjeta del cliente acercándola a su móvil. Lo deciden DOS
// claves de `configuracion_plataforma`, que lee la edge `socio-cobro-movil`:
//   · cobro_movil_modo           'off' = nadie · 'pruebas' = solo la lista · 'on' = todos
//   · cobro_movil_socios_prueba  ids de socios separados por coma (solo cuenta en 'pruebas')
// Y además la edge exige `socios.activo !== false`: un socio desactivado no lo ve nunca.
// Eso es el PERMISO (habilitadoEnServidor). Que le salga el botón depende además de su móvil: solo
// en la app de Android (estadoCobroTarjeta). La pantalla solo dice «puede cobrar» con las dos cosas.
//
// Se lee y se escribe SOLO por las RPC admin_cobro_movil_* (04_admin_cobro_movil.sql):
//   · `guardar_configuracion_plataforma` (la de Configuración) rechaza estas claves con PD213.
//   · La lista se reconstruye en la BD en un solo UPDATE: dos clics seguidos no se pisan.
// Nada optimista: tras cada cambio se vuelve a leer el estado y se comprueba que ha quedado
// como se pidió (un guardado que "no da error" no es lo mismo que un guardado hecho).
//
// La app del socio guarda la respuesta 5 minutos: un cambio tarda hasta 5 min en verse.
// El botón solo sale en Android; en iPhone falta el permiso de Apple.

export const COBRO_VACIO = { cargado: false, error: null, modo: null, ids: [] }

const MODOS = [
  { value: 'off', label: 'Apagado' },
  { value: 'pruebas', label: 'Solo los socios elegidos' },
  { value: 'on', label: 'Todos los socios' },
]

const PLATAFORMA = { android: 'Android', ios: 'iPhone', web: 'Navegador (web)' }

const REQUISITOS_ANDROID = 'Android 13 o más nuevo, el NFC encendido y las «Opciones de desarrollador» apagadas'

export async function cargarCobroTarjeta() {
  try {
    const { data, error } = await supabase.rpc('admin_cobro_movil_estado')
    if (error) {
      const falta = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')
      return {
        ...COBRO_VACIO,
        cargado: true,
        error: falta
          ? 'falta un paso en la base de datos (04_admin_cobro_movil.sql sin aplicar).'
          : (error.message || 'error desconocido'),
      }
    }
    const modo = ['off', 'pruebas', 'on'].includes(data?.modo) ? data.modo : 'off'
    const ids = Array.isArray(data?.socios) ? data.socios.map(x => String(x)) : []
    return { cargado: true, error: null, modo, ids }
  } catch (e) {
    return { ...COBRO_VACIO, cargado: true, error: e?.message || 'sin conexión' }
  }
}

// Cuenta desactivada con la MISMA regla que la edge (`socio.activo !== false`): un NULL es activo.
const desactivado = (s) => s?.activo === false

// Lo que decide el SERVIDOR (la edge): ¿tiene permiso este socio?
export function habilitadoEnServidor(cfg, s) {
  if (!cfg?.cargado || cfg.error || !s || desactivado(s)) return false
  if (cfg.modo === 'on') return true
  if (cfg.modo === 'pruebas') return cfg.ids.includes(s.id)
  return false
}

// Lo que pasa DE VERDAD en su móvil: con permiso, el botón solo sale en la app de Android.
//   null        → no tiene permiso
//   'si'        → permiso + app de Android: puede cobrar
//   'iphone'    → permiso, pero en iPhone todavía no le sale (falta el permiso de Apple)
//   'web'       → permiso, pero entra desde el navegador: solo sale en la app de Android
//   'sin_datos' → permiso, pero no ha abierto la versión nueva de la app: no sabemos qué móvil tiene
export function estadoCobroTarjeta(cfg, s) {
  if (!habilitadoEnServidor(cfg, s)) return null
  if (s.app_plataforma === 'android') return 'si'
  if (s.app_plataforma === 'ios') return 'iphone'
  if (s.app_plataforma === 'web') return 'web'
  return 'sin_datos'
}

// Etiqueta para la lista de socios y la cabecera de la ficha. Verde/azul solo si puede cobrar DE
// VERDAD; con permiso pero sin botón en su móvil, en aviso y diciendo por qué.
const ETIQUETA = {
  si: {
    tono: 'info', corto: 'Tarjeta', largo: 'Cobra con tarjeta',
    title: 'Puede cobrar con tarjeta en la puerta con su móvil Android (Tap to Pay)',
  },
  iphone: {
    tono: 'warning', corto: 'Tarjeta · iPhone (aún no)', largo: 'Tarjeta: iPhone, aún no',
    title: 'Está activado, pero en iPhone todavía no le sale el botón: falta el permiso de Apple',
  },
  web: {
    tono: 'warning', corto: 'Tarjeta · sin la app', largo: 'Tarjeta: le falta la app',
    title: 'Está activado, pero entra desde el navegador: el botón solo sale en la app de Android',
  },
  sin_datos: {
    tono: 'warning', corto: 'Tarjeta · sin confirmar', largo: 'Tarjeta: sin confirmar',
    title: 'Está activado, pero todavía no ha abierto la versión nueva de la app: no sabemos si tiene Android',
  },
}

export function ChipCobroTarjeta({ cfg, socio, largo, onClick }) {
  const e = ETIQUETA[estadoCobroTarjeta(cfg, socio)]
  if (!e) return null
  return (
    <Chip
      tono={e.tono}
      onClick={onClick}
      title={onClick ? `${e.title}. Se cambia en la pestaña Configuración.` : e.title}
    >
      {largo ? e.largo : e.corto}
    </Chip>
  )
}

// Cómo está cada socio elegido, para las etiquetas de la tarjeta general.
function motivoElegido(s) {
  if (desactivado(s)) return { tono: 'warning', extra: ' · cuenta desactivada', title: 'Su cuenta está desactivada: no puede cobrar aunque esté elegido' }
  if (s.app_plataforma === 'ios') return { tono: 'warning', extra: ' · iPhone (aún no)', title: 'Tiene iPhone: todavía no le sale el botón (falta el permiso de Apple)' }
  if (s.app_plataforma === 'web') return { tono: 'warning', extra: ' · sin la app', title: 'Entra desde el navegador: el botón solo sale en la app de Android' }
  if (s.app_plataforma === 'android') return { tono: 'neutral', extra: ' · Android', title: 'Su móvil: Android' }
  return { tono: 'warning', extra: ' · sin confirmar', title: 'Todavía no ha abierto la versión nueva de la app: no sabemos qué móvil tiene' }
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

function hace(iso) {
  if (!iso) return null
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

const nombreDe = (s) => s?.nombre_comercial || s?.nombre || 'Este socio'

// Tras guardar, la RPC ha ido bien pero la segunda lectura (la de comprobar) ha fallado: no se sabe
// si ha quedado. No se dice «no se ha guardado», que podría ser mentira.
const NO_COMPROBADO =
  'Se ha enviado el cambio, pero no se ha podido comprobar si ha quedado guardado. Pulsa «Reintentar» para verlo.'

// ──────────────────────────────────────────────────────────────────────────────
// Interruptor GENERAL (pantalla de la lista de socios)
// ──────────────────────────────────────────────────────────────────────────────
// `cargando`: la lista de socios todavía no ha llegado. Sin ella los recuentos salen a 0 y la
// tarjeta diría «no lo tiene nadie» durante un momento.
export function CobroTarjetaGeneral({ cfg, socios, cargando, onRecargar, style }) {
  const [busy, setBusy] = useState(false)
  const listo = cfg.cargado && !cfg.error && !cargando

  const elegidos = listo ? socios.filter(s => cfg.ids.includes(s.id)) : []
  const elegidosActivos = elegidos.filter(s => !desactivado(s))
  const activos = socios.filter(s => !desactivado(s))

  // Con permiso del servidor y, de esos, a cuántos les sale DE VERDAD el botón (app de Android).
  const conPermiso = listo ? socios.filter(s => habilitadoEnServidor(cfg, s)) : []
  const pueden = conPermiso.filter(s => estadoCobroTarjeta(cfg, s) === 'si').length
  const conIphone = conPermiso.filter(s => s.app_plataforma === 'ios').length
  const sinConfirmar = conPermiso.length - pueden - conIphone
  const inactivosElegidos = elegidos.length - elegidosActivos.length
  const partes = [
    conIphone > 0 && `${conIphone} con iPhone, aún no`,
    sinConfirmar > 0 && `${sinConfirmar} sin la app de Android confirmada`,
    cfg.modo === 'pruebas' && inactivosElegidos > 0 && `${inactivosElegidos} con la cuenta desactivada`,
  ].filter(Boolean)
  const detalle = partes.length ? ` (${partes.join(' · ')})` : ''
  const nombres = (lista) => lista.map(nombreDe).join(', ')

  async function cambiarModo(nuevo) {
    if (busy || !listo || nuevo === cfg.modo) return

    // Se pregunta SIEMPRE que el cambio cambia al momento quién cobra con dinero real.
    if (nuevo === 'on' && !(await confirmar(
      '¿Encender el cobro con tarjeta para TODOS los socios? Cualquier repartidor con la app en ' +
      'Android podrá cobrar pedidos con tarjeta en la puerta. Es dinero real que entra por Stripe.'
    ))) return
    if (nuevo === 'off' && !(await confirmar(
      '¿Apagar el cobro con tarjeta para todos los socios? Ningún repartidor podrá cobrar con ' +
      'tarjeta con su móvil. Los socios elegidos se quedan guardados para cuando lo vuelvas a encender.'
    ))) return
    if (nuevo === 'pruebas' && cfg.modo === 'on' && !(await confirmar(
      elegidosActivos.length
        ? `Solo podrán cobrar con tarjeta los socios elegidos (${nombres(elegidosActivos)}). ` +
          'Todos los demás dejarán de poder cobrar con tarjeta. ¿Seguimos?'
        : 'Todavía no has elegido a ningún socio: nadie podrá cobrar con tarjeta hasta que elijas ' +
          'alguno en su ficha. ¿Seguimos?'
    ))) return
    if (nuevo === 'pruebas' && cfg.modo === 'off' && elegidosActivos.length > 0 && !(await confirmar(
      `¿Encender el cobro con tarjeta para ${elegidosActivos.length === 1 ? 'este socio' : 'estos socios'}: ` +
      `${nombres(elegidosActivos)}? Es dinero real que entra por Stripe.`
    ))) return

    setBusy(true)
    const { error } = await supabase.rpc('admin_cobro_movil_modo', { p_modo: nuevo })
    const fresco = await onRecargar()
    setBusy(false)
    // supabase-js NO lanza excepción: devuelve `{ error }`.
    if (error) return toast('No se ha podido cambiar: ' + error.message, 'error')
    if (!fresco || fresco.error) return toast(NO_COMPROBADO, 'error')
    if (fresco.modo !== nuevo) return toast('No se ha guardado el cambio. Vuelve a intentarlo.', 'error')
    toast(nuevo === 'on'
      ? 'Cobro con tarjeta encendido para todos los socios'
      : nuevo === 'off'
        ? 'Cobro con tarjeta apagado para todos'
        : elegidosActivos.length
          ? 'Cobro con tarjeta solo para los socios elegidos'
          : 'Hecho. Ahora elige los socios en su ficha, pestaña «Configuración»')
  }

  return (
    <div style={{ ...tarjeta, ...style }}>
      <Cabecera
        titulo="Cobro con tarjeta en la puerta"
        sub="El repartidor cobra la tarjeta del cliente acercándola a su móvil (Tap to Pay)."
      />

      {!cfg.error && !listo && <div style={{ ...type.label, color: colors.textMute }}>Cargando…</div>}

      {cfg.error && (
        <Aviso tono="danger">
          No se puede ver ni cambiar ahora mismo: {cfg.error}
          <BotonReintentar onRecargar={onRecargar} />
        </Aviso>
      )}

      {listo && (
        <>
          <div
            aria-busy={busy}
            style={{ maxWidth: 560, opacity: busy ? 0.55 : 1, pointerEvents: busy ? 'none' : 'auto' }}
          >
            <Segmented full options={MODOS} value={cfg.modo} onChange={cambiarModo} />
          </div>

          <div style={{ ...type.body, color: colors.text, marginTop: 12, lineHeight: 1.5 }}>
            {cfg.modo === 'off' && (
              <>
                Ningún repartidor puede cobrar con tarjeta con su móvil.
                {elegidos.length > 0 && (
                  <span style={{ color: colors.textMute }}>
                    {' '}Tienes {plural(elegidos.length, 'socio elegido', 'socios elegidos')} esperando a que lo pongas en «Solo los socios elegidos».
                  </span>
                )}
              </>
            )}
            {cfg.modo === 'on' && (
              <>
                Tienen permiso todos los socios con la cuenta activa ({activos.length}).
                {' '}Pueden cobrar ya: <b>{pueden}</b>{detalle}.
              </>
            )}
            {cfg.modo === 'pruebas' && (
              elegidos.length === 0
                ? <>Ahora mismo no lo tiene nadie: elige los socios en su ficha, pestaña «Configuración».</>
                : <>Has elegido {plural(elegidos.length, 'socio', 'socios')}. Pueden cobrar ya: <b>{pueden}</b>{detalle}.</>
            )}
          </div>

          {cfg.modo !== 'on' && elegidos.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {elegidos.map(s => {
                const m = motivoElegido(s)
                return (
                  <Chip key={s.id} tono={m.tono} title={m.title}>
                    {nombreDe(s)}{m.extra}
                  </Chip>
                )
              })}
            </div>
          )}

          <div style={{ ...type.label, color: colors.textMute, marginTop: 12, lineHeight: 1.5 }}>
            Solo funciona en móviles Android ({REQUISITOS_ANDROID}). En iPhone todavía no:
            falta el permiso de Apple. Los cambios tardan hasta 5 minutos en llegar al móvil.
          </div>
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Interruptor de UN socio (ficha del socio, pestaña Configuración)
// ──────────────────────────────────────────────────────────────────────────────
const TITULAR = {
  si: 'Puede cobrar con tarjeta',
  iphone: 'Activado, pero en iPhone todavía no le sale',
  web: 'Activado, pero solo le sale en la app de Android',
  sin_datos: 'Activado, pero aún no sabemos qué móvil tiene',
}

export function CobroTarjetaSocio({ socio, cfg, onRecargar, style }) {
  const [busy, setBusy] = useState(false)
  const listo = cfg.cargado && !cfg.error
  const elegido = listo && cfg.ids.includes(socio.id)
  const estado = estadoCobroTarjeta(cfg, socio)
  const nombre = nombreDe(socio)
  const plat = socio.app_plataforma || null

  async function cambiar() {
    if (busy || !listo) return
    const nuevo = !elegido

    // Solo se pregunta cuando el cambio tiene efecto inmediato en dinero real.
    if (nuevo && cfg.modo === 'pruebas' && !desactivado(socio) && !(await confirmar(
      `${nombre} podrá cobrar pedidos con tarjeta en la puerta con su móvil. ` +
      'Es dinero real que entra por Stripe. ¿Seguimos?' +
      (plat === 'ios' ? ' (Tiene iPhone: no le saldrá el botón hasta que Apple dé el permiso.)' : '')
    ))) return

    setBusy(true)
    const { error } = await supabase.rpc('admin_cobro_movil_socio', { p_socio: socio.id, p_activo: nuevo })
    const fresco = await onRecargar()
    setBusy(false)
    if (error) return toast('No se ha podido guardar: ' + error.message, 'error')
    if (!fresco || fresco.error) return toast(NO_COMPROBADO, 'error')
    if (fresco.ids.includes(socio.id) !== nuevo) {
      return toast('No se ha guardado el cambio. Vuelve a intentarlo.', 'error')
    }
    const ahora = estadoCobroTarjeta(fresco, socio)
    toast(nuevo
      ? (ahora === 'si'
        ? `${nombre} ya puede cobrar con tarjeta (tarda hasta 5 min en salirle)`
        : ahora === 'iphone'
          ? `${nombre} elegido. En iPhone todavía no le sale: falta el permiso de Apple`
          : ahora
            ? `${nombre} elegido. Le saldrá solo en la app de Android (tarda hasta 5 min)`
            : desactivado(socio)
              ? `${nombre} elegido, pero su cuenta está desactivada: no podrá cobrar`
              : fresco.modo === 'off'
                ? `${nombre} elegido. Lo tendrá cuando pongas el general en «Solo los socios elegidos»`
                : `${nombre} elegido`)
      : (fresco.modo === 'pruebas'
        ? `${nombre} ya no puede cobrar con tarjeta`
        : `${nombre} quitado de los elegidos`))
  }

  // Por qué está así según el interruptor general (lo que decide el servidor).
  let explicacion = null
  if (listo) {
    if (desactivado(socio)) {
      explicacion = 'Su cuenta está desactivada: no puede cobrar con tarjeta aunque esté elegido.'
    } else if (cfg.modo === 'on') {
      explicacion = 'Activado para todos los socios desde el interruptor general (lista de Socios). ' +
        'Este interruptor solo cuenta cuando el general está en «Solo los socios elegidos».'
    } else if (cfg.modo === 'off') {
      explicacion = 'El cobro con tarjeta está apagado para todos desde el interruptor general (lista de Socios).' +
        (elegido ? ' Está elegido: lo tendrá en cuanto lo pongas en «Solo los socios elegidos».' : '')
    } else {
      explicacion = elegido
        ? 'Está entre los socios elegidos.'
        : 'Enciende el interruptor para dejarle cobrar con tarjeta.'
    }
  }

  return (
    <div style={{ ...tarjeta, ...style }}>
      <Cabecera
        titulo="Cobro con tarjeta (Tap to Pay)"
        sub="Cobrar la tarjeta del cliente en la puerta acercándola a su móvil."
      />

      <div style={caja}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            {!cfg.cargado
              ? 'Cargando…'
              : cfg.error
                ? 'No se puede ver ni cambiar ahora mismo'
                : TITULAR[estado] || 'No puede cobrar con tarjeta'}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2, lineHeight: 1.5 }}>
            {cfg.error ? cfg.error : explicacion}
          </div>
          {cfg.error && <BotonReintentar onRecargar={onRecargar} />}
        </div>
        {/* Sin estado leído no se enseña el interruptor: un «No elegido» sería mentira. */}
        {listo && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Toggle
              on={elegido}
              disabled={busy}
              tone="terracotta"
              onChange={cambiar}
              aria-label={`Elegir a ${nombre} para cobrar con tarjeta`}
            />
            <span style={{ ...type.caption, color: colors.textMute }}>
              {busy ? 'Guardando…' : elegido ? 'Elegido' : 'No elegido'}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, ...type.body, color: colors.text, flexWrap: 'wrap' }}>
        <Smartphone size={15} color={colors.stone} />
        <span>
          <b>Su móvil:</b> {plat ? (PLATAFORMA[plat] || plat) : 'sin datos todavía'}
          {socio.app_version ? ` · versión ${socio.app_version}` : ''}
        </span>
        {socio.app_datos_at && (
          <span style={{ ...type.label, color: colors.textMute }}>· último dato {hace(socio.app_datos_at)}</span>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        {plat === 'ios' ? (
          <Aviso tono="warning">
            En iPhone todavía no se puede: falta el permiso de Apple. Aunque esté elegido, no le saldrá el botón de cobrar con tarjeta.
          </Aviso>
        ) : plat === 'web' ? (
          <Aviso tono="warning">
            Ha entrado desde el navegador, no desde la app. El cobro con tarjeta solo funciona en la app de Android ({REQUISITOS_ANDROID}).
          </Aviso>
        ) : plat === 'android' ? (
          <Aviso>Para que le funcione necesita {REQUISITOS_ANDROID}.</Aviso>
        ) : (
          <Aviso>
            Todavía no ha abierto la versión nueva de la app, así que no sabemos qué móvil tiene.
            Solo funciona en Android: {REQUISITOS_ANDROID}. En iPhone aún no.
          </Aviso>
        )}
      </div>

      <div style={{ ...type.label, color: colors.textMute, marginTop: 10 }}>
        Los cambios tardan hasta 5 minutos en llegarle al móvil.
      </div>
    </div>
  )
}

// Volver a leer el estado cuando ha fallado la lectura (sin esto había que salir de la sección).
function BotonReintentar({ onRecargar }) {
  const [cargando, setCargando] = useState(false)
  async function reintentar() {
    if (cargando) return
    setCargando(true)
    try { await onRecargar() } finally { setCargando(false) }
  }
  return (
    <div style={{ marginTop: 8 }}>
      <MiniBtn onClick={reintentar} disabled={cargando} style={{ opacity: cargando ? 0.6 : 1 }}>
        <RotateCw size={13} /> {cargando ? 'Cargando…' : 'Reintentar'}
      </MiniBtn>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Piezas
// ──────────────────────────────────────────────────────────────────────────────
function Cabecera({ titulo, sub }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CreditCard size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>{titulo}</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>{sub}</div>
    </>
  )
}

const AVISOS = {
  info:    { bg: colors.infoSoft,    fg: colors.onInfoSoft },
  warning: { bg: colors.warningSoft, fg: colors.onWarningSoft },
  danger:  { bg: colors.dangerSoft,  fg: colors.onDangerSoft },
}

function Aviso({ tono = 'info', children }) {
  const t = AVISOS[tono] || AVISOS.info
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px',
      borderRadius: radius.md, background: t.bg, color: t.fg, ...type.label, lineHeight: 1.5,
    }}>
      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

const tarjeta = {
  background: colors.paper, borderRadius: radius.lg, padding: 16,
  border: `1px solid ${colors.border}`, boxShadow: colors.shadow,
}

const caja = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
  borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
}
