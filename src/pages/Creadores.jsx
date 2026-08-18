import { useState, useEffect, useCallback } from 'react'
import { Video, ExternalLink, Check, X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { toast, confirmar } from '../App'

// Pidoo Creadores — consola de Marlon.
//
// En fase 1 las visualizaciones NO las lee ninguna API: se teclean aquí. Ese campo
// es la única superficie capaz de premiar a un cliente, y NO desaparece cuando
// llegue la fase 2 (el cron de TikTok): seguirá siendo la vía de corrección y el
// plan B si TikTok deniega la aprobación de la app.
//
// Todo pasa por RPC, nunca por UPDATE directo: `registrar_views_creador` valida el
// retroceso del contador, deja rastro del origen y encadena la entrega del premio
// en la misma transacción. Un UPDATE a pelo se saltaría las tres cosas.

const ESTADOS = {
  activa:               { label: 'Activa',        color: '#C5562C', bg: 'rgba(197,86,44,0.14)' },
  premiada:             { label: 'Premiada',      color: '#6F8460', bg: 'rgba(139,157,122,0.18)' },
  en_espera_tope:       { label: 'Espera tope',   color: '#C99551', bg: 'rgba(201,149,81,0.16)' },
  caducada:             { label: 'Caducada',      color: '#8A8174', bg: 'rgba(138,129,116,0.15)' },
  rechazada:            { label: 'Rechazada',     color: '#B5564A', bg: 'rgba(181,86,74,0.15)' },
  pendiente_validacion: { label: 'Por revisar',   color: '#C99551', bg: 'rgba(201,149,81,0.16)' },
}

const fmtEur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`
const fmtNum = (n) => Number(n || 0).toLocaleString('es-ES')
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

// Horas desde la última revisión. Es el número que de verdad importa en el día a
// día: un vídeo acumula visualizaciones durante 48-72 h, y si nadie las mira el
// cliente ve la barra congelada y se le pasan las ganas mucho antes de que el
// volumen sea un problema.
function horasSinRevisar(p) {
  if (p.estado !== 'activa' && p.estado !== 'en_espera_tope') return null
  const ref = p.ultima_revision_at || p.created_at
  return Math.floor((Date.now() - new Date(ref).getTime()) / 3600000)
}

export default function Creadores() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('por_revisar')
  const [filtroEst, setFiltroEst] = useState('todos')
  const [kpis, setKpis] = useState(null)
  const [views, setViews] = useState({})      // { participacion_id: valor tecleado }
  const [busy, setBusy] = useState({})        // { participacion_id: true }

  const setRowBusy = (id, v) => setBusy(b => ({ ...b, [id]: v }))

  const cargar = useCallback(async () => {
    const [parts, kpiPedidos, kpiCupones] = await Promise.all([
      supabase
        .from('participaciones_creador')
        .select('id, estado, origen, red, video_id, share_url, usuario_red, views_actual, nivel_alcanzado, created_at, ultima_revision_at, caduca_at, motivo_rechazo, validado_at, validado_por, usuario_id, establecimiento_id, establecimientos(nombre), usuarios(nombre)')
        .order('created_at', { ascending: false })
        .limit(300),
      // El KPI que justifica la feature entera: cuántos pedidos ha traído un vídeo.
      supabase.from('pedidos').select('total', { count: 'exact' }).not('cupon_creador_id', 'is', null),
      supabase.from('cupones_creador').select('coste_estimado, usado_at'),
    ])

    if (parts.error) { toast('Error cargando participaciones: ' + parts.error.message, 'error'); setLoading(false); return }

    const rows = parts.data || []
    setItems(rows)

    const cupones = kpiCupones.data || []
    setKpis({
      activas: rows.filter(r => r.estado === 'activa' || r.estado === 'en_espera_tope').length,
      alcance: rows.reduce((s, r) => s + (r.views_actual || 0), 0),
      premios: cupones.length,
      coste: cupones.reduce((s, c) => s + Number(c.coste_estimado || 0), 0),
      canjeados: cupones.filter(c => c.usado_at).length,
      pedidosGenerados: kpiPedidos.count || 0,
      ventaGenerada: (kpiPedidos.data || []).reduce((s, p) => s + Number(p.total || 0), 0),
    })
    setLoading(false)
  }, [])

  // Polling de 30 s, como el contador de socios pendientes del panel. Realtime NO:
  // estas tablas no están en la publicación `supabase_realtime`, así que un
  // .subscribe() diría SUBSCRIBED y no llegaría nunca un evento — fallo mudo.
  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 30000)
    return () => clearInterval(t)
  }, [cargar])

  async function guardarViews(p) {
    const raw = views[p.id]
    if (raw === undefined || raw === '') { toast('Escribe las visualizaciones', 'error'); return }
    const n = parseInt(String(raw).replace(/\D/g, ''), 10)
    if (!Number.isFinite(n) || n < 0) { toast('Número no válido', 'error'); return }

    // El servidor rechaza bajar el contador salvo que se fuerce; se pide aquí para
    // que la corrección sea una decisión consciente y no un dedazo.
    let forzar = false
    if (n < (p.views_actual || 0)) {
      forzar = await confirmar(`Vas a BAJAR las visualizaciones de ${fmtNum(p.views_actual)} a ${fmtNum(n)}. ¿Es una corrección?`)
      if (!forzar) return
    }

    setRowBusy(p.id, true)
    const { data, error } = await supabase.rpc('registrar_views_creador', {
      p_participacion_id: p.id,
      p_views: n,
      p_verificacion: 'manual',
      p_forzar: forzar,
    })
    setRowBusy(p.id, false)

    if (error) { toast(error.message || 'Error al guardar', 'error'); return }

    const r = data?.resultado
    if (r === 'premiada')            toast(`Premio entregado: ${data.descripcion} (${data.codigo})`)
    else if (r === 'en_espera_tope') toast('Guardado, pero el restaurante ha llegado a su tope del mes. Queda en espera.', 'error')
    else if (r === 'sin_escalon_nuevo') toast('Guardado. Todavía no llega al siguiente escalón.')
    else if (r === 'ya_premiada')    toast('Guardado. Este vídeo ya tenía premio.')
    // Sin este aviso, teclear visualizaciones en un vídeo de mesa sin validar
    // parece que no hace nada y da la sensación de que está roto. Sí hace: guarda
    // el contador. Lo que no puede es premiar hasta que el restaurante lo acepte.
    else if (r === 'sin_efecto')     toast('Visualizaciones guardadas, pero no premia: el restaurante todavía no ha validado este vídeo.', 'error')
    else                             toast('Guardado.')

    setViews(v => ({ ...v, [p.id]: undefined }))
    cargar()
  }

  async function rechazar(p) {
    const motivo = window.prompt('Motivo del rechazo (lo verá el restaurante en su panel):')
    if (motivo === null) return
    if (motivo.trim().length < 3) { toast('El motivo tiene que ser algo más explícito', 'error'); return }
    setRowBusy(p.id, true)
    const { error } = await supabase.rpc('rechazar_participacion_creador', {
      p_participacion_id: p.id, p_motivo: motivo.trim(),
    })
    setRowBusy(p.id, false)
    if (error) { toast(error.message || 'Error al rechazar', 'error'); return }
    toast('Participación rechazada')
    cargar()
  }

  const establecimientos = [...new Map(
    items.filter(i => i.establecimientos?.nombre)
         .map(i => [i.establecimiento_id, i.establecimientos.nombre])
  )].sort((a, b) => a[1].localeCompare(b[1]))

  const porRevisar = items.filter(i =>
    (i.estado === 'activa' || i.estado === 'en_espera_tope') && (horasSinRevisar(i) ?? 0) >= 24)

  const filtrados = items.filter(p => {
    if (filtroEst !== 'todos' && p.establecimiento_id !== filtroEst) return false
    if (filtro === 'todos') return true
    if (filtro === 'por_revisar') return porRevisar.includes(p)
    return p.estado === filtro
  })

  const TABS = [
    { id: 'por_revisar', label: `Por revisar (${porRevisar.length})` },
    { id: 'activa',      label: 'Activas' },
    { id: 'premiada',    label: 'Premiadas' },
    { id: 'en_espera_tope', label: 'En espera' },
    { id: 'rechazada',   label: 'Rechazadas' },
    { id: 'caducada',    label: 'Caducadas' },
    { id: 'todos',       label: 'Todas' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Video size={20} strokeWidth={2} color={colors.terracotta} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)', margin: 0 }}>Creadores</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 0, marginBottom: 20, maxWidth: 720, lineHeight: 1.5 }}>
        Los clientes registran vídeos de sus pedidos. Abre el enlace, mira las visualizaciones
        que marca la red y escríbelas aquí: el premio se entrega solo y le llega un aviso al
        cliente. Un vídeo gana un único premio, el escalón más alto que alcance.
      </p>

      {kpis && (
        <div className="ds-cards" style={{ marginBottom: 18 }}>
          <Kpi label="Vídeos en juego" value={fmtNum(kpis.activas)} />
          <Kpi label="Alcance total" value={fmtNum(kpis.alcance)} sub="visualizaciones" />
          <Kpi label="Premios entregados" value={fmtNum(kpis.premios)} sub={`${kpis.canjeados} canjeados`} />
          <Kpi label="Coste asumido" value={fmtEur(kpis.coste)} sub="lo pagan los restaurantes" />
          <Kpi
            label="Pedidos por cupón"
            value={fmtNum(kpis.pedidosGenerados)}
            sub={fmtEur(kpis.ventaGenerada) + ' de venta'}
            destacado
          />
        </div>
      )}

      {porRevisar.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 16,
          borderRadius: 10, background: colors.warningSoft, border: `1px solid ${colors.warning}`,
          fontSize: 13, color: colors.ink,
        }}>
          <RefreshCw size={15} />
          <span>
            <strong>{porRevisar.length}</strong> {porRevisar.length === 1 ? 'vídeo lleva' : 'vídeos llevan'} más
            de 24 h sin mirar. Mientras tanto el cliente ve su barra congelada.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setFiltro(t.id)} style={{
            ...ds.filterBtn,
            background: filtro === t.id ? '#C5562C' : 'var(--c-surface2)',
            color: filtro === t.id ? '#fff' : 'var(--c-muted)',
          }}>{t.label}</button>
        ))}
      </div>

      {establecimientos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltroEst('todos')} style={{
            ...ds.filterBtn,
            background: filtroEst === 'todos' ? '#C5562C' : 'var(--c-surface2)',
            color: filtroEst === 'todos' ? '#fff' : 'var(--c-muted)',
          }}>Todos los restaurantes</button>
          {establecimientos.map(([id, nombre]) => (
            <button key={id} onClick={() => setFiltroEst(id)} style={{
              ...ds.filterBtn,
              background: filtroEst === id ? '#C5562C' : 'var(--c-surface2)',
              color: filtroEst === id ? '#fff' : 'var(--c-muted)',
            }}>{nombre}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ ...ds.card, textAlign: 'center', padding: 40, color: 'var(--c-muted)' }}>Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div style={{ ...ds.card, textAlign: 'center', padding: 40 }}>
          <Video size={28} color={colors.textFaint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>Nada por aquí todavía</div>
          <div style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 4 }}>
            {items.length === 0
              ? 'Ningún cliente ha registrado un vídeo aún. Activa el programa en la ficha de un restaurante para empezar.'
              : 'No hay participaciones con este filtro.'}
          </div>
        </div>
      ) : (
        <div style={ds.table}>
          <div style={ds.tableHeader}>
            <span style={{ flex: '2 1 130px', minWidth: 0 }}>Restaurante</span>
            <span data-tablet-sm-hide="true" style={{ flex: '1 1 100px', minWidth: 0 }}>Cliente</span>
            <span style={{ width: 74, flexShrink: 0 }}>Vídeo</span>
            <span style={{ width: 178, flexShrink: 0 }}>Visualizaciones</span>
            <span style={{ flex: '1 1 96px', minWidth: 0 }}>Estado</span>
            <span data-tablet-hide="true" style={{ width: 96, flexShrink: 0 }}>Registrado</span>
            <span style={{ width: 92, flexShrink: 0 }}></span>
          </div>

          {filtrados.map(p => {
            const est = ESTADOS[p.estado] || ESTADOS.activa
            const editable = p.estado === 'activa' || p.estado === 'en_espera_tope'
            const horas = horasSinRevisar(p)
            const trabajando = !!busy[p.id]

            return (
              <div key={p.id} className="ds-row-touch" style={ds.tableRow}>
                <span style={{ flex: '2 1 130px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {p.establecimientos?.nombre || '—'}
                  {/* Un vídeo de mesa no tiene pedido detrás: nadie puede
                      comprobar que esa persona comió allí salvo el restaurante.
                      Por eso espera su visto bueno y por eso se distingue aquí. */}
                  {p.origen === 'mesa' && (
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                      color: '#C99551', textTransform: 'uppercase',
                    }}>mesa</span>
                  )}
                </span>

                <span data-tablet-sm-hide="true" style={{ flex: '1 1 100px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-muted)' }}>
                  {p.usuarios?.nombre || '—'}
                </span>

                <span style={{ width: 74, flexShrink: 0 }}>
                  <a href={p.share_url} target="_blank" rel="noopener noreferrer"
                     style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors.terracotta, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    {p.red === 'instagram' ? 'Reel' : 'TikTok'} <ExternalLink size={11} />
                  </a>
                </span>

                <span style={{ width: 178, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {editable ? (
                    <>
                      <input
                        type="text" inputMode="numeric"
                        value={views[p.id] ?? String(p.views_actual ?? 0)}
                        onChange={e => setViews(v => ({ ...v, [p.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') guardarViews(p) }}
                        disabled={trabajando}
                        style={{ ...ds.input, width: 96, padding: '5px 8px', fontSize: 13, textAlign: 'right' }}
                      />
                      <button
                        onClick={() => guardarViews(p)} disabled={trabajando}
                        title="Actualizar y otorgar premio"
                        style={{
                          ...ds.actionBtn, padding: '5px 9px',
                          background: colors.terracotta, color: '#fff', border: 'none',
                          opacity: trabajando ? 0.5 : 1, cursor: trabajando ? 'not-allowed' : 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <Check size={13} />
                      </button>
                    </>
                  ) : (
                    <span style={{ fontWeight: 700 }}>{fmtNum(p.views_actual)}</span>
                  )}
                </span>

                <span style={{ flex: '1 1 96px', minWidth: 0 }}>
                  <span style={{ ...ds.badge, background: est.bg, color: est.color }}>{est.label}</span>
                  {p.nivel_alcanzado > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--c-muted)', marginLeft: 6 }}>niv. {p.nivel_alcanzado}</span>
                  )}
                </span>

                <span data-tablet-hide="true" style={{ width: 96, flexShrink: 0, fontSize: 12, color: 'var(--c-muted)' }}>
                  {fmtFecha(p.created_at)}
                  {horas !== null && horas >= 24 && (
                    <div style={{ fontSize: 10.5, color: colors.warning, fontWeight: 700 }}>{horas} h sin mirar</div>
                  )}
                </span>

                <span style={{ width: 92, flexShrink: 0, textAlign: 'right' }}>
                  {editable && (
                    <button onClick={() => rechazar(p)} disabled={trabajando}
                      style={{ ...ds.actionBtn, padding: '5px 9px', color: colors.danger, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <X size={13} /> Rechazar
                    </button>
                  )}
                  {p.estado === 'rechazada' && p.motivo_rechazo && (
                    <span title={p.motivo_rechazo} style={{ fontSize: 11, color: 'var(--c-muted)', cursor: 'help' }}>ver motivo</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, destacado }) {
  return (
    <div style={{
      ...ds.card,
      borderColor: destacado ? colors.primaryBorder : colors.border,
      background: destacado ? colors.primarySoft : colors.surface,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)', marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--c-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
