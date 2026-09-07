import { useState, useEffect, useCallback } from 'react'
import { PhoneCall, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle } from '../lib/ui'
import { toast, confirmar } from '../App'

// Interruptor MAESTRO de la IA que coge el teléfono del restaurante.
//
// Mismo patrón que el TPV y que Creadores: lo enciende Pidoo y lo pausa el
// restaurante, en dos columnas distintas. `ia_config_establecimiento.activo`
// está congelada para el dueño por `ia_config_guard` (PD300), igual que el
// número y la credencial (PD301, PD302), así que este toggle es el único sitio
// desde el que se enciende.
//
// Va por RPC `ia_activar` y no por UPDATE directo porque SIEMBRA la fila con su
// saludo. Que exista la fila ES tener el módulo dado de alta.
//
// Sin número no se puede encender (PD306): la centralita resuelve de qué
// restaurante es cada llamada por el número marcado, así que una IA sin DID no
// existe para nadie.
//
// Las estadísticas salen de `ia_llamadas`, que la escribe esta misma centralita.
// NO se usa `ia_config_establecimiento.minutos_consumidos_mes`: ese espejo lo
// congela PD182 y lleva parado en agosto. Los minutos de verdad están en
// `v_ia_consumo_mes`, el libro mayor que cuadra con la factura de ElevenLabs.

const fmtFecha = (iso) => new Date(iso).toLocaleDateString('es-ES',
  { day: '2-digit', month: '2-digit', year: '2-digit' })

// El aviso de que se habla con una máquina tiene que decir "inteligencia
// artificial" con todas las letras: es lo que exige el art. 50 del Reglamento
// Europeo de IA desde el 2 de agosto de 2026, y "asistente virtual" a secas no
// declara nada. El saludo que se pega en ElevenLabs sale de aquí, así que si
// está mal se ve en esta tarjeta y no dentro de una llamada.
const declaraIA = (saludo) => /inteligencia\s+artificial/i.test(saludo || '')

export default function IaTelefonoCard({ establecimiento }) {
  const estId = establecimiento?.id

  const [cfg, setCfg] = useState(null)
  const [stats, setStats] = useState({ llamadas: 0, pedidos: 0, minutos: 0, ultima: null })
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)
  const [did, setDid] = useState('')
  const [agente, setAgente] = useState('')
  const [transferir, setTransferir] = useState('')

  const load = useCallback(async () => {
    if (!estId) return
    const mes = new Date()
    mes.setDate(1); mes.setHours(0, 0, 0, 0)

    const [c, ll, ult, cons] = await Promise.all([
      supabase.from('ia_config_establecimiento').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('ia_llamadas').select('pedido_id')
        .eq('establecimiento_id', estId).gte('inicio_at', mes.toISOString()),
      // La última llamada de SIEMPRE, sin filtro de mes: distingue "no lo ha
      // estrenado nunca" de "lo tiene, pero este mes no ha entrado ninguna".
      supabase.from('ia_llamadas').select('inicio_at')
        .eq('establecimiento_id', estId)
        .order('inicio_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('v_ia_consumo_mes').select('minutos')
        .eq('establecimiento_id', estId).eq('canal', 'telefono').maybeSingle(),
    ])

    setCfg(c.data || null)
    if (c.data) {
      setDid(c.data.did_e164 || '')
      setAgente(c.data.nombre_agente || 'Lucía')
      setTransferir(c.data.transferir_a_telefono || '')
    }
    const filas = ll.data || []
    setStats({
      llamadas: filas.length,
      pedidos: filas.filter(x => x.pedido_id).length,
      minutos: Number(cons.data?.minutos || 0),
      ultima: ult.data?.inicio_at || null,
    })
    setCargando(false)
  }, [estId])

  useEffect(() => { load() }, [load])

  async function guardar(activo, aviso) {
    if (aviso && !(await confirmar(aviso))) return
    setBusy(true)
    const { error } = await supabase.rpc('ia_activar', {
      p_establecimiento_id: estId,
      p_activo: activo,
      p_did: did.trim() || null,
      p_nombre_agente: agente.trim() || null,
      p_transferir_a: transferir.trim() || null,
    })
    setBusy(false)
    // supabase-js NO lanza excepción: devuelve `{ error }`. Un try/catch no saltaría.
    if (error) return toast('Error: ' + error.message, 'error')
    load()
    return true
  }

  async function toggle() {
    const nuevo = !cfg?.activo
    const ok = await guardar(nuevo, nuevo ? (
      `Vas a encender la IA que coge el teléfono de ${establecimiento?.nombre || 'este restaurante'}.\n\n` +
      `A partir de ese momento atiende las llamadas que entren por su número, ` +
      `toma el pedido de la carta y lo mete en el panel como pedido telefónico.\n\n` +
      `Hace falta que el número esté comprado en Twilio y apuntando al agente de ` +
      `ElevenLabs, y que el restaurante desvíe su teléfono a ese número.`
    ) : null)
    if (ok) toast(nuevo ? 'IA telefónica encendida' : 'IA telefónica apagada', 'success')
  }

  async function guardarDatos() {
    const ok = await guardar(!!cfg?.activo, null)
    if (ok) toast('Datos guardados')
  }

  if (cargando) return null

  const activo = !!cfg?.activo
  const pausado = !!cfg?.pausado_por_restaurante
  const sinNumero = !cfg?.did_e164
  const cambioPendiente = cfg && (
    (cfg.did_e164 || '') !== did.trim() ||
    (cfg.nombre_agente || '') !== agente.trim() ||
    (cfg.transferir_a_telefono || '') !== transferir.trim()
  )
  // Sin fila, el botón da de alta el módulo apagado aunque no se escriba nada.
  const puedeGuardar = !cfg || cambioPendiente

  const estado = !cfg
    ? 'Al activarla se crea su configuración y su saludo.'
    : sinNumero
      ? 'Dada de alta, pero sin número. Hay que comprarle un DID español en Twilio para que pueda sonar.'
      : !activo
        ? 'Dada de alta pero apagada: no coge el teléfono.'
        : pausado
          ? 'Encendida, pero el restaurante la tiene en pausa ahora mismo.'
          : stats.llamadas > 0
            ? `Atendiendo el teléfono: ${stats.llamadas} llamada${stats.llamadas === 1 ? '' : 's'} este mes.`
            : stats.ultima
              ? `Sin llamadas este mes. La última entró el ${fmtFecha(stats.ultima)}.`
              : 'Todavía sin estrenar: no ha entrado ninguna llamada. El restaurante tiene que desviar su teléfono al número de la IA.'

  return (
    <div style={{
      background: colors.paper, borderRadius: radius.lg, padding: 16,
      border: `1px solid ${colors.border}`, boxShadow: colors.shadow, marginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <PhoneCall size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>IA que coge el teléfono</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>
        Atiende las llamadas, toma el pedido de su carta y lo mete en el panel.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            {cfg ? 'Módulo dado de alta' : 'Módulo sin dar de alta'}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>{estado}</div>
        </div>
        <Toggle on={activo} disabled={busy} tone="terracotta" onChange={toggle}
          aria-label="Encender la IA telefónica" />
      </div>

      {cfg && !declaraIA(cfg.saludo) && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px',
          borderRadius: radius.md, border: `1px solid ${colors.warning}`,
          background: colors.warningSoft,
        }}>
          <AlertTriangle size={16} color={colors.onWarningSoft} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ ...type.label, color: colors.onWarningSoft, lineHeight: 1.5 }}>
            El saludo no dice que sea una inteligencia artificial. Declararlo es
            obligatorio desde el 2 de agosto de 2026 y tiene que decirlo con esas
            palabras. Guarda los datos para regenerarlo, y acuérdate de pegar el
            saludo nuevo en el «Primer mensaje» del agente de ElevenLabs: ese
            texto es fijo y no lo lee de aquí.
          </div>
        </div>
      )}

      {activo && (
        <div className="ds-cards" style={{ marginTop: 12 }}>
          <Mini label="Llamadas este mes" value={stats.llamadas} />
          <Mini label="Pedidos cerrados" value={stats.pedidos} />
          <Mini
            label="Minutos hablados"
            value={`${stats.minutos.toFixed(1)} / ${cfg?.minutos_incluidos ?? 500}`}
            alerta={stats.minutos > (cfg?.minutos_incluidos ?? 500)}
          />
        </div>
      )}

      {/* Los campos se ven aunque el módulo no esté dado de alta: así se le puede
          dejar preparado (apagado, con su nombre y su saludo) mientras se compra
          el número, en vez de tener que inventarse uno de relleno para poder
          crear la fila. */}
      <>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
                Número de la IA
              </label>
              <input value={did} placeholder="+34822272642"
                onChange={(e) => setDid(e.target.value)} style={campo} />
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
                Se llama
              </label>
              <input value={agente} onChange={(e) => setAgente(e.target.value)} style={campo} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
                Pasa las llamadas a
              </label>
              <input value={transferir} placeholder="+34600000000"
                onChange={(e) => setTransferir(e.target.value)} style={campo} />
            </div>
            <button onClick={guardarDatos} disabled={busy || !puedeGuardar} style={{
              height: 38, padding: '0 18px', borderRadius: radius.md, border: 'none',
              background: colors.terracotta2, color: '#fff', fontWeight: 700,
              fontSize: 13, fontFamily: 'inherit',
              cursor: (busy || !puedeGuardar) ? 'not-allowed' : 'pointer',
              opacity: (busy || !puedeGuardar) ? 0.5 : 1,
            }}>
              {busy ? 'Guardando…' : cfg ? 'Guardar' : 'Dar de alta'}
            </button>
          </div>

          <div style={{ ...type.label, color: colors.textMute, marginTop: 8, lineHeight: 1.5 }}>
            El número es el que compras en Twilio y apunta al agente de ElevenLabs;
            es además la llave con la que la centralita sabe de qué restaurante es
            cada llamada. «Pasa las llamadas a» es el móvil del dueño, al que la IA
            transfiere cuando no sabe resolver.
          </div>
      </>
    </div>
  )
}

function Mini({ label, value, alerta }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: radius.md,
      border: `1px solid ${alerta ? colors.warning : colors.border}`,
      background: alerta ? colors.warningSoft : colors.cream,
    }}>
      <div style={{ ...type.caption, color: alerta ? colors.onWarningSoft : colors.textMute }}>{label}</div>
      <div style={{ ...type.num, fontSize: 20, color: colors.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

const campo = {
  width: '100%', height: 38, padding: '0 10px', borderRadius: radius.md,
  border: `1px solid ${colors.border}`, background: colors.paper,
  color: colors.text, fontSize: 14, fontFamily: 'inherit',
}
