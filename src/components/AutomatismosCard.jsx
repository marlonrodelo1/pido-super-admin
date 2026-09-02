// Los dos automatismos del restaurante, del lado de Pidoo.
//
// 1) ABRE POR SU HORARIO. El restaurante con TPV no tiene tablet, tiene el ordenador
//    del mostrador, asi que no tiene sentido cerrarlo porque no se vea una app
//    conectada: manda su horario. Por defecto se aplica solo a quien tenga el modulo
//    TPV; `abre_por_horario` es el escape para meter o sacar a uno a mano.
//    🔴 Esta columna la congela `guard_establecimientos_protected_fields`: el dueno
//    no puede tocarla. Si pudiera, se sacaria solo de la regla.
//
// 2) ACEPTAR LOS PEDIDOS SOLOS. Esa SI la puede tocar el dueno desde su panel; aqui
//    esta para poder configurarsela nosotros por telefono sin que tenga que entrar.
//
// El motor del horario tiene ademas un interruptor GLOBAL
// (`configuracion_plataforma.horario_restaurantes_modo`). Se ensena aqui porque sin
// el encendido esta pantalla no hace nada, y no saberlo es perder media hora.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle } from '../lib/ui'
import { toast } from '../App'
import { Clock, Zap, Save } from 'lucide-react'

const MIN = 5
const MAX = 180

export default function AutomatismosCard({ establecimiento, onChanged }) {
  const estId = establecimiento?.id

  const [modoGlobal, setModoGlobal] = useState(null)
  const [mandaElReloj, setMandaElReloj] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)

  const [override, setOverride] = useState(null)      // null | true | false
  const [auto, setAuto] = useState(false)
  const [minReparto, setMinReparto] = useState('40')
  const [minRecogida, setMinRecogida] = useState('20')
  const [sucio, setSucio] = useState(false)

  const cargar = useCallback(async () => {
    if (!estId) return
    const [cfg, reloj] = await Promise.all([
      supabase.from('configuracion_plataforma').select('valor')
        .eq('clave', 'horario_restaurantes_modo').maybeSingle(),
      supabase.rpc('restaurante_abre_por_horario', { p_est_id: estId }),
    ])
    setModoGlobal(cfg.data?.valor ?? 'off')
    setMandaElReloj(reloj.data === true)
    setCargando(false)
  }, [estId])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    setOverride(establecimiento?.abre_por_horario ?? null)
    setAuto(!!establecimiento?.auto_aceptar)
    setMinReparto(String(establecimiento?.auto_aceptar_min_reparto ?? 40))
    setMinRecogida(String(establecimiento?.auto_aceptar_min_recogida ?? 20))
    setSucio(false)
  }, [establecimiento?.id, establecimiento?.abre_por_horario,
      establecimiento?.auto_aceptar, establecimiento?.auto_aceptar_min_reparto,
      establecimiento?.auto_aceptar_min_recogida])

  if (cargando) return null

  const fuera = (n) => !Number.isFinite(Number(n)) || Number(n) < MIN || Number(n) > MAX
  const malos = auto && (fuera(minReparto) || fuera(minRecogida))

  async function guardar() {
    if (malos) return toast(`Los minutos van entre ${MIN} y ${MAX}`, 'error')
    setBusy(true)
    const { error } = await supabase.from('establecimientos').update({
      abre_por_horario: override,
      auto_aceptar: auto,
      auto_aceptar_min_reparto: Number(minReparto),
      auto_aceptar_min_recogida: Number(minRecogida),
    }).eq('id', estId)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    setSucio(false)
    toast('Automatismos guardados')
    await cargar()
    onChanged?.()
  }

  async function cambiarModoGlobal(on) {
    setBusy(true)
    const { error } = await supabase.from('configuracion_plataforma')
      .update({ valor: on ? 'on' : 'off' })
      .eq('clave', 'horario_restaurantes_modo')
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    setModoGlobal(on ? 'on' : 'off')
    toast(on ? 'Motor del horario ENCENDIDO en toda la plataforma'
             : 'Motor del horario apagado en toda la plataforma')
  }

  const opciones = [
    { v: null,  txt: 'Automático', nota: 'Lo decide tener el módulo TPV' },
    { v: true,  txt: 'Siempre',    nota: 'Aunque no tenga TPV' },
    { v: false, txt: 'Nunca',      nota: 'Se queda con la señal de la app' },
  ]

  return (
    <div style={{
      background: colors.paper, borderRadius: radius.lg, padding: 16,
      border: `1px solid ${colors.border}`, boxShadow: colors.shadow, marginTop: 20,
    }}>
      {/* ── 1. El horario ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Clock size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>Abre por su horario</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 12 }}>
        En vez de cerrarse cuando no se ve su app conectada. Es lo que necesita quien
        cobra con el ordenador del mostrador y no tiene tablet encendida.
      </div>

      <div style={{
        padding: '10px 12px', borderRadius: radius.md, marginBottom: 12,
        border: `1px solid ${mandaElReloj ? colors.terracotta : colors.border}`,
        background: colors.cream,
      }}>
        <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
          {mandaElReloj
            ? 'A este restaurante le manda el RELOJ'
            : 'A este restaurante le manda la SEÑAL DE LA APP'}
        </div>
        <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
          {mandaElReloj
            ? 'Dentro de su horario figura abierto; fuera, cerrado.'
            : 'Se cierra solo si su app deja de estar conectada, como siempre.'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {opciones.map((o) => {
          const activa = override === o.v
          return (
            <button key={String(o.v)}
              onClick={() => { setOverride(o.v); setSucio(true) }}
              style={{
                flex: '1 1 130px', padding: '9px 12px', borderRadius: radius.md,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                border: `1px solid ${activa ? colors.terracotta : colors.border}`,
                background: activa ? colors.cream : 'transparent',
                color: colors.text,
              }}>
              <div style={{ ...type.body, fontWeight: activa ? 700 : 500 }}>{o.txt}</div>
              <div style={{ ...type.label, color: colors.textMute }}>{o.nota}</div>
            </button>
          )
        })}
      </div>

      {/* El interruptor GLOBAL. Sin el, nada de lo de arriba se ejecuta. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        borderRadius: radius.md, border: `1px solid ${colors.border}`,
        background: modoGlobal === 'on' ? 'transparent' : colors.cream,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            Motor del horario · {modoGlobal === 'on' ? 'encendido' : 'APAGADO'}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            {modoGlobal === 'on'
              ? 'Afecta a TODOS los restaurantes marcados arriba, no solo a este.'
              : 'Mientras esté apagado, esto no abre ni cierra a nadie. Es global.'}
          </div>
        </div>
        <Toggle on={modoGlobal === 'on'} disabled={busy} tone="terracotta"
          onChange={() => cambiarModoGlobal(modoGlobal !== 'on')}
          aria-label="Motor del horario" />
      </div>

      {/* ── 2. La aceptación automática ───────────────────────────────── */}
      <div style={{ height: 1, background: colors.border, margin: '18px 0 14px' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Zap size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>Aceptar los pedidos solos</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 12 }}>
        Esto también lo puede encender el dueño desde su panel. Aquí está para
        configurárselo tú sin que tenga que entrar.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        borderRadius: radius.md, border: `1px solid ${colors.border}`,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            {auto ? 'Los pedidos entran ya aceptados' : 'Cada pedido lo aceptan a mano'}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            Lo hace el servidor, así que funciona con su ordenador apagado.
          </div>
        </div>
        <Toggle on={auto} disabled={busy} tone="terracotta"
          onChange={() => { setAuto(!auto); setSucio(true) }}
          aria-label="Aceptar los pedidos solos" />
      </div>

      {auto && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 130px' }}>
            <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
              Minutos a domicilio
            </label>
            <input value={minReparto} inputMode="numeric"
              onChange={(e) => { setMinReparto(e.target.value.replace(/\D/g, '')); setSucio(true) }}
              style={{ ...campo, borderColor: fuera(minReparto) ? colors.danger : colors.border }} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
              Minutos para recoger
            </label>
            <input value={minRecogida} inputMode="numeric"
              onChange={(e) => { setMinRecogida(e.target.value.replace(/\D/g, '')); setSucio(true) }}
              style={{ ...campo, borderColor: fuera(minRecogida) ? colors.danger : colors.border }} />
          </div>
        </div>
      )}

      <button onClick={guardar} disabled={!sucio || busy || malos} style={{
        marginTop: 14, height: 40, padding: '0 16px', borderRadius: radius.md, border: 'none',
        background: sucio && !malos ? colors.terracotta : colors.border,
        color: sucio && !malos ? '#fff' : colors.textMute,
        fontWeight: 700, fontFamily: 'inherit', fontSize: 14,
        cursor: sucio && !busy && !malos ? 'pointer' : 'not-allowed',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Save size={15} /> {busy ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  )
}

const campo = {
  width: '100%', height: 40, padding: '0 12px', borderRadius: 10,
  border: '1px solid', background: 'transparent',
  color: 'inherit', fontSize: 14, fontFamily: 'inherit',
}
