import { useState, useEffect, useCallback } from 'react'
import { Video, Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { toast, confirmar } from '../App'

// Interruptor MAESTRO de Pidoo Creadores para un restaurante.
//
// El programa lo enciende Pidoo y lo pausa el restaurante: son dos columnas
// distintas. `programa_activo` está congelada para el dueño por el trigger
// `creadores_config_guard` (mismo patrón que plan_pro y carta_local_activa), así
// que este toggle es el ÚNICO sitio desde el que se puede encender. Si el
// restaurante abusa, aquí se apaga y él no puede volver a encenderlo.
//
// Va por RPC y no por UPDATE directo porque `creadores_activar_programa` además
// siembra una escalera por defecto: sin eso, el dueño abre su pantalla el día del
// despliegue y se encuentra un editor vacío.
//
// La escalera la edita normalmente el RESTAURANTE desde su panel — él la paga y
// él la decide. Este editor es la red de seguridad: montársela por teléfono el
// día del alta, o arreglarle un disparate sin entrar por SQL. Va por
// `creadores_guardar_escalera`, el mismo RPC que usa su panel, así que las
// reglas son idénticas y el nivel lo ordena el servidor por visualizaciones.
//
// Aquí NO se ofrece "producto gratis": exige elegir un plato de su carta y esa
// pantalla ya existe en su panel. Con eso este editor no necesita cargar la
// carta entera de cada restaurante.

const fmtEur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

const TIPOS_ADMIN = [
  { id: 'descuento_fijo', label: '€ fijos' },
  { id: 'porcentaje',     label: '% del pedido' },
  { id: 'envio_gratis',   label: 'Envío gratis' },
]

// Lo que el premio le cuesta al restaurante. El servidor tiene la última
// palabra (`creadores_coste_minimo`, PD131) y su mensaje dice la cifra exacta.
const costeSugerido = (tipo, valor) => {
  if (tipo === 'descuento_fijo') return Number(valor) || 0
  if (tipo === 'envio_gratis') return 2.5
  return 5
}

export default function CreadoresCard({ establecimiento }) {
  const [cfg, setCfg] = useState(null)
  const [escalones, setEscalones] = useState([])
  const [stats, setStats] = useState({ participaciones: 0, cupones: 0 })
  const [busy, setBusy] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [edit, setEdit] = useState(null)      // filas en edición, null = solo lectura
  const [topeInput, setTopeInput] = useState('')

  const estId = establecimiento?.id

  const load = useCallback(async () => {
    if (!estId) return
    const [c, e, p, cu] = await Promise.all([
      supabase.from('creadores_config').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('escalera_premios').select('nivel, views_necesarias, tipo_premio, valor, producto_id, descripcion, coste_estimado, activo')
        .eq('establecimiento_id', estId).order('nivel'),
      supabase.from('participaciones_creador').select('id', { count: 'exact', head: true }).eq('establecimiento_id', estId),
      supabase.from('cupones_creador').select('id', { count: 'exact', head: true }).eq('establecimiento_id', estId),
    ])
    setCfg(c.data || null)
    setEscalones(e.data || [])
    setStats({ participaciones: p.count || 0, cupones: cu.count || 0 })
    setTopeInput(c.data?.tope_mensual_euros != null ? String(c.data.tope_mensual_euros) : '')
    setCargando(false)
  }, [estId])

  useEffect(() => { load() }, [load])

  async function toggle() {
    const nuevo = !cfg?.programa_activo
    if (nuevo && !(await confirmar(
      `Activar Pidoo Creadores en ${establecimiento?.nombre}?\n\nSe le sembrará una escalera por defecto (2 EUR a las 500 visualizaciones, 5 EUR a las 2.000 y 15 EUR a las 10.000) con un tope de 30 EUR al mes. El restaurante podrá cambiarla y pausar el programa, pero no volver a encenderlo.`
    ))) return

    setBusy(true)
    const { data, error } = await supabase.rpc('creadores_activar_programa', {
      p_establecimiento_id: estId,
      p_activo: nuevo,
      p_tope_mensual: 30,
    })
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo
      ? (data?.escalones_sembrados ? 'Programa activado con escalera por defecto' : 'Programa activado')
      : 'Programa desactivado')
    load()
  }

  async function guardarEscalera() {
    const filas = edit.map(f => ({
      views_necesarias: Number(f.views_necesarias),
      tipo_premio: f.tipo_premio,
      valor: (f.tipo_premio === 'descuento_fijo' || f.tipo_premio === 'porcentaje') ? Number(f.valor) : null,
      producto_id: f.producto_id || null,
      descripcion: (f.descripcion || '').trim(),
      coste_estimado: Number(f.coste_estimado),
      activo: f.activo !== false,
    }))
    setBusy(true)
    const { error } = await supabase.rpc('creadores_guardar_escalera', {
      p_establecimiento_id: estId,
      p_escalones: filas,
    })
    setBusy(false)
    if (error) return toast(error.message, 'error')
    toast('Escalera guardada')
    setEdit(null)
    load()
  }

  async function guardarTope() {
    const v = topeInput.trim() === '' ? null : Number(topeInput.replace(',', '.'))
    if (v !== null && (!Number.isFinite(v) || v <= 0 || v > 5000)) {
      return toast('El tope tiene que estar entre 0,01 y 5.000 €', 'error')
    }
    setBusy(true)
    const { error } = await supabase.from('creadores_config')
      .update({ tope_mensual_euros: v }).eq('establecimiento_id', estId)
    setBusy(false)
    if (error) return toast(error.message, 'error')
    toast(v === null ? 'Tope quitado' : `Tope puesto en ${fmtEur(v)} al mes`)
    load()
  }

  if (cargando) return null

  const activo = !!cfg?.programa_activo
  const pausado = !!cfg?.pausado_por_restaurante
  const gasto = Number(cfg?.gasto_mes_actual || 0)
  const tope = cfg?.tope_mensual_euros != null ? Number(cfg.tope_mensual_euros) : null

  return (
    <div style={{ ...ds.card, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Video size={16} color={colors.terracotta} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Pidoo Creadores</h3>
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Los clientes graban vídeos de sus pedidos y ganan cupones de descuento.
        Va incluido en el alta, sin cuota. <strong>Los premios los paga el restaurante.</strong>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: 10, border: '1px solid var(--c-border)', background: 'var(--c-surface)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>
            Programa {activo ? (pausado ? 'activo, pausado por el restaurante' : 'activo') : 'apagado'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--c-muted)', marginTop: 2 }}>
            {activo
              ? (pausado
                  ? 'No entran vídeos nuevos. Las participaciones en curso siguen contando.'
                  : 'Los clientes con un pedido entregado pueden registrar vídeos.')
              : 'Solo tú puedes encenderlo. El restaurante no puede.'}
          </div>
        </div>
        <button onClick={toggle} disabled={busy} aria-pressed={activo} style={{
          width: 46, height: 26, borderRadius: 999, border: 'none',
          cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0,
          background: activo ? '#C5562C' : 'var(--c-surface2)', position: 'relative',
          opacity: busy ? 0.6 : 1, transition: 'background 0.15s',
        }}>
          <span style={{
            position: 'absolute', top: 3, left: activo ? 23 : 3, width: 20, height: 20,
            borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }} />
        </button>
      </div>

      {activo && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <Mini label="Gasto del mes" value={tope != null ? `${fmtEur(gasto)} / ${fmtEur(tope)}` : fmtEur(gasto)}
                alerta={tope != null && gasto >= tope} />
          <Mini label="Vídeos" value={stats.participaciones} />
          <Mini label="Premios dados" value={stats.cupones} />
        </div>
      )}

      {/* ── Escalera de premios ── */}
      {activo && !edit && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Escalera
            </div>
            <button onClick={() => setEdit(escalones.map(e => ({ ...e })))} style={{
              ...ds.secondaryBtn, padding: '4px 9px', fontSize: 11,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <Pencil size={11} /> Editar
            </button>
          </div>

          {escalones.length === 0 && (
            <div style={{ fontSize: 12, color: colors.warning, padding: '8px 0' }}>
              Sin ningún premio: los clientes pueden grabar vídeos que no ganarán nada.
            </div>
          )}

          {escalones.map(e => (
            <div key={e.nivel} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
              borderTop: '1px solid var(--c-border)', fontSize: 12.5,
              opacity: e.activo ? 1 : 0.45,
            }}>
              <span style={{ width: 78, flexShrink: 0, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {Number(e.views_necesarias).toLocaleString('es-ES')}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.descripcion}
              </span>
              <span style={{ flexShrink: 0, color: 'var(--c-muted)' }}>
                le cuesta {fmtEur(e.coste_estimado)}
              </span>
            </div>
          ))}

          <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Normalmente la edita el restaurante desde su panel — la paga él. Edítala tú si
            hay que montársela o arreglársela.
          </div>
        </div>
      )}

      {/* ── Editor ── */}
      {activo && edit && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${colors.terracotta}`, background: 'var(--c-surface)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>
            Editar escalera de {establecimiento?.nombre}
          </div>

          {edit.map((f, i) => (
            <div key={i} style={{ display: 'grid', gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--c-border)' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TIPOS_ADMIN.map(t => (
                  <button key={t.id}
                    onClick={() => setEdit(l => l.map((x, j) => j === i ? {
                      ...x, tipo_premio: t.id,
                      valor: t.id === 'porcentaje' ? 10 : (t.id === 'descuento_fijo' ? 2 : null),
                      coste_estimado: costeSugerido(t.id, t.id === 'descuento_fijo' ? 2 : 10),
                    } : x))}
                    style={{
                      padding: '4px 9px', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${f.tipo_premio === t.id ? colors.terracotta : 'var(--c-border)'}`,
                      background: f.tipo_premio === t.id ? 'rgba(197,86,44,0.15)' : 'transparent',
                      color: 'var(--c-text)',
                    }}>{t.label}</button>
                ))}
                {f.tipo_premio === 'producto_gratis' && (
                  <span style={{ fontSize: 11, color: colors.warning, alignSelf: 'center' }}>
                    Producto gratis — solo editable desde el panel del restaurante
                  </span>
                )}
                <button onClick={() => setEdit(l => l.filter((_, j) => j !== i))}
                  style={{ ...ds.secondaryBtn, marginLeft: 'auto', padding: '4px 8px', fontSize: 11 }}>
                  <Trash2 size={11} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 6 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--c-muted)' }}>Views (mín. 100)</label>
                  <input style={ds.formInput} type="number" min={100} value={f.views_necesarias ?? ''}
                         onChange={ev => setEdit(l => l.map((x, j) => j === i ? { ...x, views_necesarias: ev.target.value } : x))} />
                </div>
                {(f.tipo_premio === 'descuento_fijo' || f.tipo_premio === 'porcentaje') && (
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--c-muted)' }}>
                      {f.tipo_premio === 'porcentaje' ? '% (máx. 50)' : '€ (máx. 25)'}
                    </label>
                    <input style={ds.formInput} type="number" step="0.5" value={f.valor ?? ''}
                           onChange={ev => setEdit(l => l.map((x, j) => j === i ? {
                             ...x, valor: ev.target.value,
                             coste_estimado: costeSugerido(x.tipo_premio, ev.target.value),
                           } : x))} />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 10, color: 'var(--c-muted)' }}>Le cuesta (€)</label>
                  <input style={ds.formInput} type="number" step="0.5" value={f.coste_estimado ?? ''}
                         onChange={ev => setEdit(l => l.map((x, j) => j === i ? { ...x, coste_estimado: ev.target.value } : x))} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, color: 'var(--c-muted)' }}>Cómo lo ve el cliente</label>
                <input style={ds.formInput} maxLength={80} placeholder="2 € de descuento en tu próximo pedido"
                       value={f.descripcion || ''}
                       onChange={ev => setEdit(l => l.map((x, j) => j === i ? { ...x, descripcion: ev.target.value } : x))} />
              </div>
            </div>
          ))}

          {edit.length < 5 && (
            <button onClick={() => setEdit(l => [...l, {
              views_necesarias: (Number(l.at(-1)?.views_necesarias) || 0) * 4 || 200,
              tipo_premio: 'descuento_fijo', valor: 2, descripcion: '', coste_estimado: 2, activo: true,
            }])} style={{ ...ds.secondaryBtn, fontSize: 11, padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus size={11} /> Añadir premio
            </button>
          )}

          <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 10, lineHeight: 1.5 }}>
            Se ordenan solos de menos a más visualizaciones. Tiene que quedar al menos uno.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setEdit(null)} style={ds.secondaryBtn} disabled={busy}>Cancelar</button>
            <button onClick={guardarEscalera} style={ds.primaryBtn} disabled={busy || edit.length === 0}>
              {busy ? 'Guardando…' : 'Guardar escalera'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tope mensual ── */}
      {activo && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, maxWidth: 200 }}>
            <label style={{ fontSize: 10, color: 'var(--c-muted)' }}>Tope mensual (€, vacío = sin tope)</label>
            <input style={ds.formInput} type="number" step="5" min="1" placeholder="Sin tope"
                   value={topeInput} onChange={e => setTopeInput(e.target.value)} />
          </div>
          <button onClick={guardarTope} style={ds.secondaryBtn} disabled={busy}>Guardar tope</button>
        </div>
      )}
    </div>
  )
}

function Mini({ label, value, alerta }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8,
      border: `1px solid ${alerta ? colors.warning : 'var(--c-border)'}`,
      background: alerta ? colors.warningSoft : 'var(--c-surface2)',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
