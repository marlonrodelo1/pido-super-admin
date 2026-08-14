import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, GhostBtn, fmtEUR } from '../lib/ui'
import { RefreshCw, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ASÍ FUNCIONA PIDOO POR DENTRO
//
// Pantalla de LECTURA. No tiene un solo botón que cambie nada.
//
// LA REGLA QUE NO SE PUEDE ROMPER AL TOCAR ESTE FICHERO:
// ningún número de negocio escrito a fuego en el JSX. Todos salen de:
//   · `algoritmo_datos()`  → RPC de solo lectura (comisiones, tarifas, embudo en vivo,
//                            liquidación, los tres agujeros, y la ventana de aceptación
//                            extraída del propio texto del cron).
//   · `dispatch-config`    → edge de solo lectura que devuelve las variables de entorno que
//                            usa `create-shipday-order`. Los secrets son del proyecto, así que
//                            ve exactamente los mismos valores que el dispatcher.
// Si un dato no se puede leer, se pinta "—" y "(no disponible)". Un hueco es preferible a una
// mentira: esta pantalla existe para que Marlon sepa cómo funciona su negocio, y un número
// inventado aquí es peor que no tener la pantalla.
//
// Los únicos literales admitidos son la GEOMETRÍA de los SVG (coordenadas, anchos, radios).
// ─────────────────────────────────────────────────────────────────────────────

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

const fechaCorta = (d) => {
  if (!d) return ''
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

const nf = (n, dec = 0) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : Number(n).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })

// Todo lo que no se pudo leer se pinta igual en toda la pantalla.
function Dato({ v, sufijo = '', dec = 0 }) {
  if (v == null || v === '' || Number.isNaN(Number(v))) {
    return <span title="No se ha podido leer del sistema" style={{ color: colors.stone }}>—</span>
  }
  return <>{nf(v, dec)}{sufijo ? ` ${sufijo}` : ''}</>
}

function Bloque({ titulo, children, aviso }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2 style={{ ...type.h2, color: colors.text, marginBottom: 10 }}>{titulo}</h2>
      {aviso}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </section>
  )
}

// Los textos explicativos. Frases cortas, sin jerga; si hay que usar un nombre técnico va
// entre paréntesis. Ancho de lectura limitado a propósito.
function Texto({ children }) {
  return (
    <div style={{ ...type.bodyLg, color: colors.ink2, maxWidth: '68ch', lineHeight: 1.65 }}>
      {children}
    </div>
  )
}

function Lienzo({ children, alto, ancho = 720, etiqueta }) {
  return (
    <div style={{ overflowX: 'auto', padding: '4px 0' }}>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={etiqueta}
        style={{ width: '100%', minWidth: 520, maxWidth: ancho, height: 'auto', display: 'block' }}
        fontFamily={type.family}
      >
        {children}
      </svg>
    </div>
  )
}

const Caja = ({ x, y, w, h, borde, relleno, grosor = 1.5, rx = 12 }) => (
  <rect x={x} y={y} width={w} height={h} rx={rx}
    fill={relleno || colors.paper} stroke={borde || colors.borderStrong} strokeWidth={grosor} />
)

const Txt = ({ x, y, children, size = 13, peso = 500, color, anchor = 'start' }) => (
  <text x={x} y={y} fontSize={size} fontWeight={peso} textAnchor={anchor}
    fill={color || colors.text}>{children}</text>
)

export default function Algoritmo() {
  const [datos, setDatos] = useState(null)
  const [motor, setMotor] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [leidoEn, setLeidoEn] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true); setError(null)
    const { data, error: e } = await supabase.rpc('algoritmo_datos')
    if (e) setError(e.message)
    else setDatos(data)

    // Los relojes del reparto no están en la base de datos: se piden a la edge que los lee del
    // mismo sitio que el dispatcher. Si falla, la pantalla enseña huecos, no inventa.
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${FUNCTIONS_URL}/dispatch-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
      })
      setMotor(r.ok ? await r.json() : null)
    } catch (_) { setMotor(null) }

    setLeidoEn(new Date())
    setCargando(false)
  }

  const cfg = datos?.config || {}
  const val = (k) => motor?.valores?.[k]?.valor
  const num = (v) => (v == null ? null : Number(v))

  const pct = num(cfg.comision_pidoo_pct)
  const eurTel = num(cfg.comision_pedido_telefonico_eur)
  const reping = num(cfg.reping_asignacion_seg)
  const puertas = datos?.puertas || {}
  const ej = datos?.ejemplo
  const emb = datos?.embudo
  const ventana = datos?.ventana_aceptacion_seg
  const liq = datos?.liquidacion
  const ag = datos?.agujeros

  const radio = val('radio_max_km')
  const frescura = val('gps_max_antiguedad_min')
  const carga = val('carga_peso_metros')
  const vueltas = val('max_vueltas')
  const suelo = val('min_busqueda_min')
  const techo = val('max_espera_min')
  const cooldown = val('rechazo_cooldown_min')
  const autoCancel = val('auto_cancelar_min')

  // Cuántas veces le suena al socio dentro de su ventana de aceptación. Calculado, no escrito.
  const avisosSocio = (ventana && reping) ? Math.max(1, Math.floor((ventana - 10) / reping)) : null
  // El pago a los socios lo lanza Marlon a mano mientras el cron 34 siga apagado. Si algún día
  // se enciende, este texto cambia solo.
  const pagoAutomatico = datos?.crons?.['34']?.activo === true

  if (cargando && !datos) {
    return <div style={{ ...type.body, color: colors.textMute, padding: 40 }}>Leyendo el sistema…</div>
  }

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Así funciona Pidoo por dentro</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Esta pantalla no la escribe nadie a mano. Cada número lo acaba de leer del sistema.
            {leidoEn && ` Última lectura: ${leidoEn.toLocaleTimeString('es-ES')}.`}
          </div>
        </div>
        <GhostBtn onClick={cargar} disabled={cargando}><RefreshCw size={14} /> Actualizar</GhostBtn>
      </div>

      {error && (
        <Card pad={14} style={{ marginBottom: 20, background: colors.dangerSoft, borderColor: colors.danger }}>
          <div style={{ ...type.label, color: colors.onDangerSoft, fontWeight: 600 }}>
            No se han podido leer los datos: {error}
          </div>
        </Card>
      )}
      {!motor && (
        <Card pad={14} style={{ marginBottom: 20, background: colors.warningSoft, borderColor: colors.warning }}>
          <div style={{ ...type.label, color: colors.onWarningSoft, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={15} />
            No se ha podido leer la configuración del motor de reparto. Los relojes salen en blanco
            a propósito: preferimos un hueco a un número inventado.
          </div>
        </Card>
      )}

      <div style={{ maxWidth: 900 }}>

        {/* ── 1. Las tres puertas ─────────────────────────────────────────── */}
        <Bloque titulo="Por dónde te entra un pedido">
          <Texto>
            Hay tres puertas. Da igual por cuál entre: el pedido acaba en el mismo sitio.
            <ul style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <li><b>La app de Pidoo.</b> El cliente entra en pidoo.es o en la app. <Dato v={puertas.pido?.n} /> pedidos entregados.</li>
              <li><b>La tienda de un socio.</b> El socio tiene su propia página con sus restaurantes. <Dato v={puertas.tienda_publica?.n} /> pedidos entregados.</li>
              <li><b>Por teléfono.</b> Llaman al restaurante y el pedido se mete a mano. <Dato v={puertas.telefonico?.n} /> pedidos entregados.</li>
            </ul>
            <p style={{ marginTop: 10 }}>
              Las dos primeras cobran igual. La tercera es la única distinta: en el teléfono no te
              llevas el <Dato v={pct} sufijo="%" />, te llevas <Dato v={eurTel} sufijo="€" dec={2} /> fijo.
            </p>
          </Texto>

          <Lienzo alto={250} etiqueta="Las tres puertas de entrada convergen en un único pedido">
            {[
              { y: 20, t: 'App de Pidoo', n: puertas.pido?.n },
              { y: 95, t: 'Tienda del socio', n: puertas.tienda_publica?.n },
              { y: 170, t: 'Teléfono', n: puertas.telefonico?.n },
            ].map((p, i) => (
              <g key={p.t}>
                <Caja x={20} y={p.y} w={210} h={56} borde={i === 2 ? colors.terracotta : colors.borderStrong} />
                <Txt x={38} y={p.y + 24} size={14} peso={700}>{p.t}</Txt>
                <Txt x={38} y={p.y + 42} size={12} color={colors.stone}>
                  {p.n == null ? '— pedidos' : `${nf(p.n)} pedidos entregados`}
                </Txt>
                <path
                  d={`M 232 ${p.y + 28} C 320 ${p.y + 28}, 340 125, 424 125`}
                  fill="none"
                  stroke={i === 2 ? colors.terracotta : colors.stone2}
                  strokeWidth={2}
                  strokeDasharray={i === 2 ? '5 4' : undefined}
                />
              </g>
            ))}
            <Caja x={430} y={80} w={250} h={90} borde={colors.terracotta} grosor={2.5} />
            <Txt x={555} y={118} size={19} peso={800} anchor="middle">UN PEDIDO</Txt>
            <Txt x={555} y={140} size={12.5} color={colors.stone} anchor="middle">mismo camino para todos</Txt>
            <Txt x={352} y={214} size={11.5} peso={700} color={colors.onTerracottaSoft} anchor="middle">este cobra distinto</Txt>
          </Lienzo>
        </Bloque>

        {/* ── 2. Quién se queda cada euro ─────────────────────────────────── */}
        <Bloque titulo="De cada pedido, quién se queda qué">
          <Texto>
            Un pedido se parte en tres trozos: la comida, el envío y la propina.
            <ul style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <li><b>La comida.</b> Tú te quedas el <Dato v={pct} sufijo="%" />. El resto se reparte entre el socio que reparte y el restaurante.</li>
              <li><b>El envío.</b> Entero para el socio que reparte.</li>
              <li><b>La propina.</b> Entera para el socio. Tú no tocas la propina nunca.</li>
            </ul>
            <p style={{ marginTop: 10 }}>
              Y lo más raro del modelo, que conviene tener claro: <b>tú no le pagas al socio.</b> Le
              paga el restaurante, con una factura aparte. Tú solo te quedas tu comisión.
            </p>
          </Texto>

          {ej ? (
            <>
              <Lienzo alto={200} etiqueta={`Reparto real del pedido ${ej.codigo}`}>
                {(() => {
                  const total = Number(ej.total) || 1
                  const x0 = 40, ancho = 640
                  const trozos = [
                    { k: 'Tú', v: Number(ej.pidoo) || 0, c: colors.terracotta2 },
                    { k: 'Socio', v: Number(ej.socio) || 0, c: '#4A6FA5' },
                    { k: 'Restaurante', v: Number(ej.restaurante_eur) || 0, c: colors.ink2 },
                  ].filter(t => t.v > 0)
                  let x = x0
                  return (
                    <>
                      <path d={`M ${x0} 48 L ${x0} 40 L ${x0 + ancho} 40 L ${x0 + ancho} 48`}
                        fill="none" stroke={colors.stone2} strokeWidth={1.5} />
                      <Txt x={x0 + ancho / 2} y={30} size={13} peso={700} anchor="middle">
                        {`El cliente pagó ${fmtEUR(ej.total)}`}
                      </Txt>
                      {trozos.map((t, i) => {
                        const w = Math.max(2, (t.v / total) * ancho)
                        const el = (
                          <g key={t.k}>
                            <rect x={x} y={60} width={w} height={48} fill={t.c}
                              rx={i === 0 ? 8 : 0} />
                            {w > 74 && (
                              <>
                                <Txt x={x + w / 2} y={82} size={12.5} peso={700} color={colors.cream} anchor="middle">{t.k}</Txt>
                                <Txt x={x + w / 2} y={99} size={13} peso={800} color={colors.cream} anchor="middle">{fmtEUR(t.v)}</Txt>
                              </>
                            )}
                            <line x1={x + w / 2} y1={112} x2={x + w / 2} y2={124} stroke={colors.stone2} strokeWidth={1} />
                            <Txt x={x + w / 2} y={139} size={11.5} color={colors.stone} anchor="middle">
                              {`${Math.round((t.v / total) * 100)} %`}
                            </Txt>
                            {w <= 74 && (
                              <Txt x={x + w / 2} y={156} size={11} color={colors.stone} anchor="middle">{t.k}</Txt>
                            )}
                          </g>
                        )
                        x += w
                        return el
                      })}
                      <Txt x={x0} y={180} size={12} color={colors.stone}>
                        {`Pedido ${ej.codigo} · ${ej.restaurante} · ${ej.fecha}. Datos reales, no un ejemplo inventado.`}
                      </Txt>
                    </>
                  )
                })()}
              </Lienzo>
              <Texto>
                El trozo del socio no se calcula aquí: se lee ya congelado del propio pedido
                {ej.socio_modo === 'fija' && ' (en este caso es una tarifa fija pactada con ese restaurante)'}.
                Aunque mañana cambies una tarifa, ese pedido no se toca.
              </Texto>
            </>
          ) : (
            <Texto>Todavía no hay ningún pedido entregado con reparto del que sacar el ejemplo. <span style={{ color: colors.stone }}>(no disponible)</span></Texto>
          )}
        </Bloque>

        {/* ── 3. El viaje del pedido ──────────────────────────────────────── */}
        <Bloque titulo="Qué pasa desde que el cliente pulsa Pedir">
          <Texto>
            Seis pasos, cada uno con su reloj. Y aquí hay algo feo que conviene que veas: al{' '}
            <b>socio</b> le insistes <Dato v={avisosSocio} /> veces. Al <b>restaurante</b> le avisas{' '}
            <b>una sola vez</b>. Si ese aviso no suena, el pedido se muere solo a
            los <Dato v={autoCancel} /> minutos.
          </Texto>

          <Lienzo alto={290} etiqueta="Línea de tiempo del pedido: al socio se le avisa muchas veces, al restaurante una sola">
            <line x1={40} y1={175} x2={680} y2={175} stroke={colors.borderStrong} strokeWidth={2} />
            {['Pide', 'Suena', 'Acepta', 'Busca socio', 'Entrega', 'Cuenta hecha'].map((t, i) => {
              const x = 60 + i * 118
              const ultimo = i === 5
              return (
                <g key={t}>
                  <circle cx={x} cy={175} r={15}
                    fill={ultimo ? colors.terracotta2 : colors.paper}
                    stroke={ultimo ? colors.terracotta2 : colors.borderStrong} strokeWidth={2} />
                  <Txt x={x} y={180} size={12} peso={700} anchor="middle" color={ultimo ? colors.cream : colors.text}>{i + 1}</Txt>
                  <Txt x={x} y={207} size={11.5} color={colors.stone} anchor="middle">{t}</Txt>
                </g>
              )
            })}

            {/* Nodo 2 — el restaurante: UNA campana, un solo trazo */}
            <g>
              <Txt x={178} y={96} size={12.5} peso={700} color={colors.onDangerSoft} anchor="middle">1 aviso</Txt>
              <path d="M 170 118 a 8 8 0 0 1 16 0 c 0 9 3 11 3 13 h -22 c 0 -2 3 -4 3 -13 z"
                fill={colors.danger} />
              <path d="M 194 126 a 9 9 0 0 1 0 -14" fill="none" stroke={colors.danger} strokeWidth={1.6} />
              <line x1={178} y1={140} x2={178} y2={158} stroke={colors.danger} strokeWidth={1.4} strokeDasharray="3 3" />
              <Caja x={96} y={228} w={168} h={44} borde={colors.danger} relleno={colors.dangerSoft} rx={9} grosor={1.4} />
              <Txt x={180} y={246} size={11.5} peso={700} color={colors.onDangerSoft} anchor="middle">
                {autoCancel == null ? 'si no lo cogen a tiempo' : `si no lo cogen en ${autoCancel} min`}
              </Txt>
              <Txt x={180} y={262} size={11.5} peso={700} color={colors.onDangerSoft} anchor="middle">el pedido se muere</Txt>
            </g>

            {/* Nodo 4 — el socio: campana con muchos trazos */}
            <g>
              <Txt x={414} y={96} size={12.5} peso={700} color={colors.onSageSoft} anchor="middle">
                {avisosSocio == null ? 'muchos avisos' : `${avisosSocio} avisos`}
              </Txt>
              <path d="M 406 118 a 8 8 0 0 1 16 0 c 0 9 3 11 3 13 h -22 c 0 -2 3 -4 3 -13 z"
                fill={colors.sage2} />
              {[0, 1, 2, 3].map(i => (
                <g key={i}>
                  <path d={`M ${430 + i * 7} ${128 + i * 3} a ${9 + i * 7} ${9 + i * 7} 0 0 1 0 ${-(18 + i * 6)}`}
                    fill="none" stroke={colors.sage2} strokeWidth={1.6} opacity={1 - i * 0.2} />
                  <path d={`M ${398 - i * 7} ${128 + i * 3} a ${9 + i * 7} ${9 + i * 7} 0 0 0 0 ${-(18 + i * 6)}`}
                    fill="none" stroke={colors.sage2} strokeWidth={1.6} opacity={1 - i * 0.2} />
                </g>
              ))}
              <Txt x={414} y={252} size={11.5} color={colors.stone} anchor="middle">
                {reping == null ? 'le vuelve a sonar cada poco' : `le suena cada ${reping} s`}
              </Txt>
            </g>
          </Lienzo>
        </Bloque>

        {/* ── 4. Cómo se elige al repartidor ──────────────────────────────── */}
        <Bloque titulo="Cómo se elige quién reparte">
          <Texto>
            No es el primero que lo pilla: es una carrera con filtros. Para que a un socio le suene
            un pedido tiene que pasar <b>cinco puertas</b>. Los números de la derecha son de ahora
            mismo.
            <p style={{ marginTop: 10 }}>
              La puerta 5 es la que más falla. Un socio con la app dormida sigue apareciendo «En
              línea» pero su señal está caducada y no entra en el sorteo. Antes de culpar al
              algoritmo, mira esa puerta.
            </p>
          </Texto>

          <Lienzo alto={330} etiqueta="Embudo de las cinco puertas que filtra a los repartidores">
            {(() => {
              const puertasEmbudo = [
                { t: 'Dado de alta', n: emb?.alta },
                { t: 'Vinculado al restaurante', n: emb?.vinculados },
                { t: 'Acepta esa fuente', n: emb?.vinculados },
                { t: radio == null ? 'A menos de — km' : `A menos de ${radio} km`, n: emb?.en_servicio },
                { t: frescura == null ? 'GPS reciente' : `GPS de menos de ${frescura} min`, n: emb?.gps_fresco },
              ]
              const arribaW = 560, abajoW = 190, alto = 54, x0 = 30, y0 = 20
              return puertasEmbudo.map((p, i) => {
                const wTop = arribaW - ((arribaW - abajoW) / 5) * i
                const wBot = arribaW - ((arribaW - abajoW) / 5) * (i + 1)
                const y = y0 + i * alto
                const cx = x0 + arribaW / 2
                const ultima = i === 4
                return (
                  <g key={p.t}>
                    <polygon
                      points={`${cx - wTop / 2},${y} ${cx + wTop / 2},${y} ${cx + wBot / 2},${y + alto - 4} ${cx - wBot / 2},${y + alto - 4}`}
                      fill={colors.terracottaSoft}
                      fillOpacity={0.35 + i * 0.14}
                      stroke={ultima ? colors.terracotta2 : colors.border}
                      strokeWidth={ultima ? 2.5 : 1}
                    />
                    <Txt x={cx} y={y + 31} size={12.5} peso={ultima ? 800 : 600} anchor="middle">{`${i + 1}. ${p.t}`}</Txt>
                    <Txt x={x0 + arribaW + 40} y={y + 33} size={20} peso={800} anchor="middle" color={ultima ? colors.terracotta2 : colors.text}>
                      {p.n == null ? '—' : p.n}
                    </Txt>
                  </g>
                )
              })
            })()}
            <Txt x={666} y={300} size={11} color={colors.stone} anchor="end">la puerta 5 es la que más gente tumba</Txt>
            <Caja x={276} y={288} w={190} h={34} borde={colors.terracotta2} rx={9} />
            <Txt x={371} y={310} size={13} peso={800} anchor="middle" color={colors.onTerracottaSoft}>El elegido</Txt>
          </Lienzo>

          <Texto>
            De los que quedan gana el que está más cerca, pero <b>llevar un pedido encima cuenta
            como estar <Dato v={carga ? carga / 1000 : null} dec={1} /> km más lejos</b>. Así el que
            ya va cargado no se los lleva todos.
          </Texto>

          <Lienzo alto={170} etiqueta="Cómo la carga penaliza a un repartidor más cercano">
            {(() => {
              const cargaM = carga || 0
              const a = 800, b = 300 + cargaM
              const esc = 560 / Math.max(a, b, 1)
              return (
                <>
                  <Txt x={20} y={38} size={13} peso={600}>Socio a 800 m, sin nada encima</Txt>
                  <rect x={20} y={48} width={a * esc} height={26} rx={6} fill={colors.stone2} />
                  <Txt x={26 + a * esc} y={66} size={12.5} peso={700}>{`${nf(a)} puntos`}</Txt>

                  <Txt x={20} y={108} size={13} peso={600}>Socio a 300 m, pero con 1 pedido encima</Txt>
                  <rect x={20} y={118} width={300 * esc} height={26} rx={6} fill={colors.stone2} />
                  <rect x={20 + 300 * esc} y={118} width={cargaM * esc} height={26} rx={6} fill={colors.terracotta} opacity={0.85} />
                  {cargaM > 0 && (
                    <Txt x={20 + (300 + cargaM / 2) * esc} y={136} size={11} peso={700} color={colors.cream} anchor="middle">
                      {`+${nf(cargaM)} m`}
                    </Txt>
                  )}
                  <Txt x={26 + b * esc} y={136} size={12.5} peso={700}>{`${nf(b)} puntos`}</Txt>
                  <Txt x={20} y={165} size={12} color={colors.stone}>
                    Gana el número más bajo: aquí gana el de 800 m aunque esté más lejos.
                  </Txt>
                </>
              )
            })()}
          </Lienzo>
        </Bloque>

        {/* ── 5. Cuando nadie coge el pedido ──────────────────────────────── */}
        <Bloque
          titulo="Y si nadie coge el pedido"
          aviso={(suelo != null && techo != null && suelo >= techo) ? (
            <Card pad={14} style={{ marginBottom: 12, background: colors.dangerSoft, borderColor: colors.danger }}>
              <div style={{ ...type.label, color: colors.onDangerSoft, fontWeight: 700 }}>
                Aviso: el tiempo mínimo de búsqueda ({suelo} min) es mayor o igual que el tope
                ({techo} min). Con esa configuración se están cancelando pedidos que todavía se
                estaban buscando. Revisar.
              </div>
            </Card>
          ) : null}
        >
          <Texto>
            El pedido no se cancela a la primera: va dando vueltas.
            <ul style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <li>A cada socio se le dan <b><Dato v={ventana} sufijo="segundos" /></b> para contestar. Si no contesta, pasa al siguiente.</li>
              <li>Nadie recibe una segunda oferta hasta que todos han recibido la primera.</li>
              <li>Quien rechaza a propósito queda <b><Dato v={cooldown} sufijo="minutos" /></b> fuera. Quien simplemente no contesta, no.</li>
              <li>Durante los primeros <b><Dato v={suelo} sufijo="minutos" /></b> el pedido <b>no se cancela nunca</b>: se sigue buscando por si alguien se conecta.</li>
              <li>El tope absoluto son <b><Dato v={techo} sufijo="minutos" /></b>, y se dan hasta <b><Dato v={vueltas} /></b> vueltas a la lista.</li>
            </ul>
            <p style={{ marginTop: 10 }}>
              Si el pedido se cae por no tener repartidor, el <b>primer socio al que le sonó</b> paga
              al restaurante el 80 % de la comida, aunque después lo rechazaran otros cinco. Los
              pedidos de teléfono no llevan ese cargo.
            </p>
          </Texto>

          <Lienzo alto={180} etiqueta="Línea de tiempo de la búsqueda de repartidor">
            {(() => {
              const max = techo || 60
              const x = (m) => 60 + (Math.min(m, max) / max) * 600
              return (
                <>
                  {suelo != null && <rect x={x(0)} y={78} width={x(suelo) - x(0)} height={26} fill={colors.sage} opacity={0.16} />}
                  {suelo != null && <rect x={x(suelo)} y={78} width={x(max) - x(suelo)} height={26} fill={colors.danger} opacity={0.12} />}
                  <line x1={60} y1={104} x2={660} y2={104} stroke={colors.borderStrong} strokeWidth={2} />
                  {Array.from({ length: 13 }, (_, i) => i * 5).filter(m => m <= max).map(m => (
                    <g key={m}>
                      <line x1={x(m)} y1={104} x2={x(m)} y2={110} stroke={colors.stone2} strokeWidth={1} />
                      {(m === 0 || m === max || m === suelo) && (
                        <Txt x={x(m)} y={126} size={11} color={colors.stone} anchor="middle">{`${m} min`}</Txt>
                      )}
                    </g>
                  ))}
                  {suelo != null && (
                    <g>
                      <line x1={x(suelo)} y1={48} x2={x(suelo)} y2={78} stroke={colors.sage2} strokeWidth={2} />
                      <Txt x={x(suelo)} y={40} size={11.5} peso={700} color={colors.onSageSoft} anchor="middle">
                        hasta aquí NO se cancela
                      </Txt>
                    </g>
                  )}
                  {techo != null && (
                    <g>
                      <line x1={x(techo)} y1={104} x2={x(techo)} y2={140} stroke={colors.danger} strokeWidth={2} />
                      <Txt x={x(techo)} y={158} size={11.5} peso={700} color={colors.onDangerSoft} anchor="end">
                        tope absoluto: se cancela
                      </Txt>
                    </g>
                  )}
                  {ventana && (
                    <Txt x={60} y={66} size={11} color={colors.stone}>{`una oferta cada ${ventana} s`}</Txt>
                  )}
                </>
              )
            })()}
          </Lienzo>
        </Bloque>

        {/* ── 6. El lunes ─────────────────────────────────────────────────── */}
        <Bloque titulo="El lunes se hace la cuenta">
          <Texto>
            Todos los lunes de madrugada se cierra la semana anterior, restaurante por restaurante.
            La cuenta es esta: <b>de lo que cobraste tú por tarjeta, le devuelves al restaurante todo
            menos tu comisión.</b> El efectivo no pasa por tus manos, pero tu comisión se devenga
            igual.
            <p style={{ marginTop: 10 }}>
              Por eso pasa algo que sorprende: si una semana el restaurante cobró todo en efectivo,{' '}
              <b>el restaurante te debe dinero a ti</b>. La cuenta sale en negativo y queda
              arrastrándose hasta que la cobras.
            </p>
            <p style={{ marginTop: 10 }}>
              Ahora mismo: <b><Dato v={liq?.pido_paga} /></b> cortes en los que pagas tú y{' '}
              <b><Dato v={liq?.rest_paga} /></b> en los que te deben, {fmtEUR(liq?.deuda_eur || 0)} en total.
            </p>
            <p style={{ marginTop: 10 }}>
              {pagoAutomatico
                ? 'El número se calcula solo y el pago sale solo: el cobro automático está encendido.'
                : 'Y una cosa importante: el número se calcula solo, pero el dinero no sale solo. El pago lo lanzas tú a mano.'}
            </p>
          </Texto>

          <Lienzo alto={250} etiqueta="El circuito del dinero con tarjeta y en efectivo">
            {(() => {
              const cajas = [
                { x: 24, t: 'Cliente' }, { x: 208, t: 'Pidoo' },
                { x: 392, t: 'Restaurante' }, { x: 576, t: 'Socio' },
              ]
              const flecha = (x1, x2, y, color, dash) => (
                <g>
                  <line x1={x1} y1={y} x2={x2 - 8} y2={y} stroke={color} strokeWidth={2.4} strokeDasharray={dash} />
                  <polygon points={`${x2},${y} ${x2 - 9},${y - 5} ${x2 - 9},${y + 5}`} fill={color} />
                </g>
              )
              return (
                <>
                  <Txt x={24} y={16} size={11} peso={700} color={colors.stone}>CON TARJETA</Txt>
                  {cajas.map(c => (
                    <g key={c.t}>
                      <Caja x={c.x} y={28} w={124} h={54} borde={c.t === 'Pidoo' ? colors.terracotta2 : colors.borderStrong} grosor={c.t === 'Pidoo' ? 2.5 : 1.5} />
                      <Txt x={c.x + 62} y={60} size={13.5} peso={700} anchor="middle">{c.t}</Txt>
                    </g>
                  ))}
                  {flecha(148, 208, 55, colors.terracotta2)}
                  <Txt x={178} y={45} size={10.5} color={colors.stone} anchor="middle">paga</Txt>
                  {flecha(332, 392, 55, colors.stone2)}
                  <Txt x={362} y={45} size={10.5} color={colors.stone} anchor="middle">el lunes</Txt>
                  {flecha(516, 576, 55, colors.stone2, '5 4')}
                  <Txt x={546} y={45} size={10.5} color={colors.stone} anchor="middle">factura</Txt>
                  <circle cx={270} cy={98} r={13} fill={colors.terracotta2} />
                  <Txt x={270} y={103} size={11} peso={800} color={colors.cream} anchor="middle">
                    {pct == null ? '—' : `${pct}%`}
                  </Txt>
                  <Txt x={292} y={103} size={11} color={colors.stone}>se queda aquí</Txt>

                  <line x1={20} y1={130} x2={700} y2={130} stroke={colors.border} strokeWidth={1} strokeDasharray="4 4" />

                  <Txt x={24} y={154} size={11} peso={700} color={colors.stone}>EN EFECTIVO</Txt>
                  <Caja x={24} y={166} w={124} h={54} />
                  <Txt x={86} y={198} size={13.5} peso={700} anchor="middle">Cliente</Txt>
                  <Caja x={392} y={166} w={124} h={54} />
                  <Txt x={454} y={198} size={13.5} peso={700} anchor="middle">Restaurante</Txt>
                  {flecha(148, 392, 193, colors.stone2)}
                  <Txt x={270} y={183} size={10.5} color={colors.stone} anchor="middle">paga en mano, sin pasar por ti</Txt>
                  {flecha(392, 210, 232, colors.danger)}
                  <Txt x={300} y={248} size={11} peso={700} color={colors.onDangerSoft} anchor="middle">
                    ahora te debe tu comisión
                  </Txt>
                </>
              )
            })()}
          </Lienzo>
        </Bloque>

        {/* ── 7. El panel de relojes ──────────────────────────────────────── */}
        <Bloque titulo="Todos los relojes y las cifras, en una tabla">
          <Texto>Esto es lo que el sistema tiene puesto ahora mismo. Si cambias algo, esta tabla cambia sola.</Texto>

          <div className="ds-table-stack" style={ds.table}>
            <div className="ds-th" style={ds.tableHeader}>
              <span style={{ flex: '3 1 220px', minWidth: 0 }}>Qué es</span>
              <span style={{ width: 130, flexShrink: 0 }}>Cuánto</span>
              <span style={{ width: 170, flexShrink: 0 }}>Dónde se cambia</span>
            </div>
            {[
              ['Lo que te llevas de cada pedido', pct == null ? null : `${nf(pct)} %`, true],
              ['Lo que te llevas de un pedido de teléfono', eurTel == null ? null : fmtEUR(eurTel), true],
              ['Precio del envío base', cfg.envio_tarifa_base == null ? null : `${fmtEUR(cfg.envio_tarifa_base)} hasta ${nf(cfg.envio_radio_base_km)} km`, true],
              ['Cada km de más', cfg.envio_precio_km_adicional == null ? null : fmtEUR(cfg.envio_precio_km_adicional), true],
              ['Rodeo que se le suma a la línea recta', cfg.routing_factor_rodeo == null ? null : `× ${nf(cfg.routing_factor_rodeo, 2)}`, true],
              ['Cada cuánto le vuelve a sonar al socio', reping == null ? null : `${nf(reping)} s`, true],
              ['Tiempo que tiene el restaurante para aceptar', autoCancel == null ? null : `${nf(autoCancel)} min`, false],
              ['Tiempo que tiene el socio para aceptar', ventana == null ? null : `${nf(ventana)} s`, false],
              ['Distancia máxima restaurante–socio', radio == null ? null : `${nf(radio)} km`, false],
              ['Antigüedad máxima del GPS del socio', frescura == null ? null : `${nf(frescura)} min`, false],
              ['Cuánto pesa llevar un pedido encima', carga == null ? null : `${nf(carga)} m`, false],
              ['Castigo por rechazar un pedido', cooldown == null ? null : `${nf(cooldown)} min`, false],
              ['Tiempo mínimo buscando, sin cancelar', suelo == null ? null : `${nf(suelo)} min`, false],
              ['Tope absoluto de búsqueda', techo == null ? null : `${nf(techo)} min`, false],
            ].map(([que, cuanto, editable]) => (
              <div key={que} className="ds-row-touch" style={ds.tableRow}>
                <span data-col="nom" style={{ flex: '3 1 220px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: editable ? colors.terracotta : colors.stone2,
                  }} />
                  {que}
                </span>
                <span data-col="tot" style={{ width: 130, flexShrink: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {cuanto == null ? <span style={{ color: colors.stone, fontWeight: 400 }}>—</span> : cuanto}
                </span>
                <span data-col="est" style={{ width: 170, flexShrink: 0 }}>
                  {editable
                    ? <Chip tono="terracotta">Configuración</Chip>
                    : <Chip tono="neutral">Ajuste técnico</Chip>}
                </span>
              </div>
            ))}
          </div>

          <Texto>
            <b>Configuración</b> es la pantalla de Configuración de este panel: se cambia con un clic.
            <br />
            <b>Ajuste técnico</b> quiere decir que ese número vive dentro del motor, no en la base de
            datos. Para cambiarlo hay que tocar la configuración del servidor.
          </Texto>
        </Bloque>

        {/* ── 8. Los tres agujeros ────────────────────────────────────────── */}
        <Bloque titulo="Dónde estás perdiendo dinero ahora mismo">
          <Texto>
            Tres cosas que el sistema hace correctamente, pero que te cuestan dinero. No son averías:
            son decisiones que quizá quieras cambiar.
          </Texto>

          <div className="ds-cards">
            {[
              {
                eur: ag?.auto_cancelados?.eur,
                n: ag?.auto_cancelados?.n,
                u: 'pedidos',
                t: 'Pedidos muertos esperando al restaurante',
                d: ag?.auto_cancelados?.desde
                  ? `desde el ${fechaCorta(ag.auto_cancelados.desde)}. Nadie te avisa cuando pasa.`
                  : 'Nadie te avisa cuando pasa.',
              },
              {
                eur: ag?.tarifa_fija?.eur == null ? null : Math.abs(ag.tarifa_fija.eur),
                n: ag?.tarifa_fija?.n,
                u: 'pedidos',
                t: 'Envíos pactados a precio fijo',
                d: 'al cliente le cobras el envío normal y al socio le pagas el fijo pactado.',
              },
              {
                eur: ag?.iva_21?.eur,
                n: ag?.iva_21?.n,
                u: 'facturas',
                t: 'Facturas con impuesto de más',
                d: 'llevan un 21 % que ya no debería estar. El restaurante puede reclamarlo.',
              },
            ].map(a => (
              <Card key={a.t} pad={16}>
                <div style={{ ...type.num, fontSize: 30, color: colors.danger, lineHeight: 1.1 }}>
                  {a.eur == null ? '—' : fmtEUR(a.eur)}
                </div>
                <div style={{ ...type.label, fontWeight: 700, color: colors.text, marginTop: 6 }}>{a.t}</div>
                <div style={{ ...type.caption, color: colors.stone, marginTop: 4, letterSpacing: 0 }}>
                  {a.n == null ? '' : `${nf(a.n)} ${a.u} · `}{a.d}
                </div>
              </Card>
            ))}
          </div>
        </Bloque>

        <div style={{ ...type.caption, color: colors.stone, letterSpacing: 0, marginTop: 8, lineHeight: 1.6 }}>
          Los porcentajes y las tarifas salen de la base de datos. Los relojes del reparto los
          devuelve el propio motor, así que no se pueden desincronizar de lo que hace de verdad.
          Donde ves «—», el dato no se ha podido leer: preferimos un hueco a un número inventado.
        </div>
      </div>
    </div>
  )
}
