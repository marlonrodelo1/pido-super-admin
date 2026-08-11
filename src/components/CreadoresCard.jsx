import { useState, useEffect, useCallback } from 'react'
import { Video } from 'lucide-react'
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

const fmtEur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

export default function CreadoresCard({ establecimiento }) {
  const [cfg, setCfg] = useState(null)
  const [escalones, setEscalones] = useState([])
  const [stats, setStats] = useState({ participaciones: 0, cupones: 0 })
  const [busy, setBusy] = useState(false)
  const [cargando, setCargando] = useState(true)

  const estId = establecimiento?.id

  const load = useCallback(async () => {
    if (!estId) return
    const [c, e, p, cu] = await Promise.all([
      supabase.from('creadores_config').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('escalera_premios').select('nivel, views_necesarias, tipo_premio, valor, descripcion, coste_estimado, activo')
        .eq('establecimiento_id', estId).order('nivel'),
      supabase.from('participaciones_creador').select('id', { count: 'exact', head: true }).eq('establecimiento_id', estId),
      supabase.from('cupones_creador').select('id', { count: 'exact', head: true }).eq('establecimiento_id', estId),
    ])
    setCfg(c.data || null)
    setEscalones(e.data || [])
    setStats({ participaciones: p.count || 0, cupones: cu.count || 0 })
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

      {activo && escalones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Escalera
          </div>
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
            La escalera la edita el restaurante desde su panel. Estos valores son los que
            se sembraron al activar.
          </div>
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
