import { useState, useEffect, useCallback } from 'react'
import { Calculator, Wallet, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle } from '../lib/ui'
import { toast, confirmar } from '../App'

// Interruptor MAESTRO del TPV del mostrador para un restaurante.
//
// El TPV lo enciende Pidoo y lo pausa el restaurante: son dos columnas distintas.
// `tpv_config.activo` está congelada para el dueño por `tpv_config_guard` (PD190),
// así que este toggle es el ÚNICO sitio desde el que se puede encender. Lo mismo
// con la serie del ticket y el tipo de IGIC (PD191 y PD192): si el dueño pudiera
// cambiar la serie a mitad de año, su numeración dejaría de ser correlativa, que
// es lo único que un registro de facturación tiene que garantizar.
//
// Va por RPC `tpv_activar` y no por UPDATE directo porque además SIEMBRA la fila
// con su serie y su IGIC. Sin eso, el restaurante abriría su panel el día del alta
// y no encontraría el módulo por ninguna parte.
//
// Ojo: que exista la fila ES tener el módulo dado de alta. `tpv_config` no tiene
// policy de INSERT para nadie más.

const fmtEur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`
const fmtFecha = (iso) => new Date(iso).toLocaleDateString('es-ES',
  { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function TpvCard({ establecimiento, onChanged }) {
  const estId = establecimiento?.id

  const [cfg, setCfg] = useState(null)
  const [stats, setStats] = useState({ tickets: 0, ventas: 0, caja: null, ultimo: null })
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)
  const [serie, setSerie] = useState('A')
  const [igic, setIgic] = useState('7')
  // Liquidación diaria (21 nov 2026): cobros con tarjeta en persona pagados cada día.
  const [liqDesde, setLiqDesde] = useState(null)
  const [busyDiaria, setBusyDiaria] = useState(false)

  const load = useCallback(async () => {
    if (!estId) return
    // Desde el día 1 del mes: es el corte con el que se mira cualquier volumen aquí.
    const mes = new Date()
    mes.setDate(1); mes.setHours(0, 0, 0, 0)

    const [c, t, caja, ult, est] = await Promise.all([
      supabase.from('tpv_config').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('tpv_tickets').select('total')
        .eq('establecimiento_id', estId).gte('emitido_at', mes.toISOString()),
      supabase.from('tpv_cajas')
        .select('id, abierta_at, fondo_inicial')
        .eq('establecimiento_id', estId).is('cerrada_at', null).maybeSingle(),
      // El ultimo ticket de SIEMPRE, sin filtro de mes. Hace falta para distinguir
      // "no lo ha estrenado nunca" de "lo usa, pero no este mes": los dos dan 0 en el
      // contador de arriba y no son lo mismo ni de lejos.
      supabase.from('tpv_tickets').select('emitido_at')
        .eq('establecimiento_id', estId)
        .order('emitido_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('establecimientos').select('liquidacion_diaria_desde').eq('id', estId).maybeSingle(),
    ])

    setCfg(c.data || null)
    setLiqDesde(est.data?.liquidacion_diaria_desde || null)
    if (c.data) { setSerie(c.data.serie_ticket || 'A'); setIgic(String(c.data.igic_pct ?? 7)) }
    const filas = t.data || []
    setStats({
      tickets: filas.length,
      ventas: filas.reduce((s, x) => s + Number(x.total || 0), 0),
      caja: caja.data || null,
      ultimo: ult.data?.emitido_at || null,
    })
    setCargando(false)
  }, [estId])

  useEffect(() => { load() }, [load])

  async function toggle() {
    const nuevo = !cfg?.activo
    if (nuevo && !(await confirmar(
      `Vas a activar el TPV de ${establecimiento?.nombre || 'este restaurante'}.\n\n` +
      `Podrá cobrar en su mostrador desde la app: esas ventas van a precio de local, ` +
      `NO pagan comisión y quedan fuera del corte de los lunes.\n\n` +
      `Necesita tener la carta con precio de local y sus datos fiscales rellenos ` +
      `(son los que imprime la cabecera del ticket).`
    ))) return

    setBusy(true)
    const { error } = await supabase.rpc('tpv_activar', {
      p_establecimiento_id: estId,
      p_activo: nuevo,
      p_serie: (serie || 'A').toUpperCase(),
      p_igic_pct: Number(String(igic).replace(',', '.')) || 7,
    })
    setBusy(false)
    // supabase-js NO lanza excepción: devuelve `{ error }`. Un try/catch no saltaría.
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'TPV activado' : 'TPV desactivado', 'success')
    load()
    onChanged?.()
  }

  // La activa SOLO Pidoo (RPC liquidacion_diaria_configurar, superadmin). Empieza con el
  // siguiente día del negocio (las 05:00 que vienen) para que todos los días vayan completos.
  async function toggleDiaria() {
    const nombre = establecimiento?.nombre || 'este restaurante'
    const nuevo = !liqDesde
    const ok = await confirmar(nuevo
      ? `Liquidación diaria para ${nombre}.\n\n` +
        `Lo que cobre con tarjeta en persona (su lector del local y el móvil del repartidor) se le paga ` +
        `cada día, al día siguiente, menos la comisión de Stripe. Ese dinero sale de la liquidación de los ` +
        `lunes: lo de la app y la web sigue el lunes con el 10 %.\n\n` +
        `Empieza mañana a las 05:00 (días completos de 05:00 a 05:00).`
      : `Apagar la liquidación diaria de ${nombre}.\n\n` +
        `Lo que ya está en una liquidación diaria se sigue pagando por la diaria. Lo que cobre a partir de ` +
        `ahora con tarjeta en persona vuelve a la liquidación de los lunes.`)
    if (!ok) return
    setBusyDiaria(true)
    const { data, error } = await supabase.rpc('liquidacion_diaria_configurar', { p_est: estId, p_activa: nuevo })
    setBusyDiaria(false)
    if (error) return toast('Error: ' + error.message, 'error')
    setLiqDesde(data || null)
    toast(nuevo ? 'Liquidación diaria activada' : 'Liquidación diaria apagada', 'success')
    onChanged?.()
  }

  async function guardarSerie() {
    setBusy(true)
    const { error } = await supabase.rpc('tpv_activar', {
      p_establecimiento_id: estId,
      p_activo: !!cfg?.activo,
      p_serie: (serie || 'A').toUpperCase(),
      p_igic_pct: Number(String(igic).replace(',', '.')) || 7,
    })
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Serie e IGIC guardados')
    load()
  }

  if (cargando) return null

  const activo = !!cfg?.activo
  const pausado = !!cfg?.pausado_por_restaurante
  const cambioPendiente = cfg && (
    (cfg.serie_ticket || 'A') !== (serie || '').toUpperCase() ||
    Number(cfg.igic_pct) !== Number(String(igic).replace(',', '.'))
  )

  return (
    <div style={{
      background: colors.paper, borderRadius: radius.lg, padding: 16,
      border: `1px solid ${colors.border}`, boxShadow: colors.shadow, marginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Calculator size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>TPV del mostrador</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>
        Cobrar en barra desde la app instalada en su tablet.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            {cfg ? 'Módulo dado de alta' : 'Módulo sin dar de alta'}
          </div>
          {/* 🔴 Este texto decia "Cobrando en su mostrador" en cuanto el modulo estaba
              encendido, y eso afirmaba un cobro que nadie habia comprobado: en la misma
              tarjeta, tres centimetros mas abajo, podia poner 0 tickets y caja cerrada.
              Marlon se topo con ello el 2 sep 2026 mirando Duende Burger.

              Y no vale mirar solo `stats.tickets`, que cuenta DESDE EL DIA 1 DEL MES:
              Duende Burger emitio sus 6 tickets el 31 de agosto, asi que en septiembre
              da 0 sin haber dejado de usarlo. Por eso se mira ademas el ultimo ticket
              de siempre, y salen tres estados distintos. */}
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            {!cfg
              ? 'Al activarlo se crea su configuración con serie e IGIC.'
              : !activo
                ? 'Dado de alta pero apagado: no puede cobrar.'
                : pausado
                  ? 'Activo, pero el restaurante lo tiene en pausa ahora mismo.'
                  : stats.tickets > 0
                    ? 'Cobrando en su mostrador. Sin comisión y fuera del corte.'
                    : stats.ultimo
                      ? `Sin cobrar nada este mes. Su último ticket fue el ${fmtFecha(stats.ultimo)}.`
                      : 'Todavía sin estrenar: no ha emitido ningún ticket. Necesita la app instalada en su tablet.'}
          </div>
        </div>
        <Toggle on={activo} disabled={busy} tone="terracotta" onChange={toggle} aria-label="Activar el TPV" />
      </div>

      {activo && (
        <>
          <div className="ds-cards" style={{ marginTop: 12 }}>
            <Mini label="Tickets este mes" value={stats.tickets} />
            <Mini label="Vendido en barra" value={fmtEur(stats.ventas)} />
            <Mini
              label="Caja"
              value={stats.caja ? 'Abierta' : 'Cerrada'}
              alerta={!!stats.caja}
            />
          </div>

          {stats.caja && (
            <div style={{ ...type.label, color: colors.textMute, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wallet size={14} color={colors.terracotta} />
              Abierta desde {new Date(stats.caja.abierta_at).toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })} con {fmtEur(stats.caja.fondo_inicial)} de fondo
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
                Serie del ticket
              </label>
              <input value={serie} maxLength={4}
                onChange={(e) => setSerie(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                style={campo} />
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ ...type.label, color: colors.textMute, display: 'block', marginBottom: 6 }}>
                IGIC %
              </label>
              <input value={igic}
                onChange={(e) => setIgic(e.target.value.replace(/[^\d.,]/g, ''))}
                style={campo} />
            </div>
            <button onClick={guardarSerie} disabled={busy || !cambioPendiente} style={{
              height: 38, padding: '0 18px', borderRadius: radius.md, border: 'none',
              background: colors.terracotta2, color: '#fff', fontWeight: 700,
              fontSize: 13, fontFamily: 'inherit',
              cursor: (busy || !cambioPendiente) ? 'not-allowed' : 'pointer',
              opacity: (busy || !cambioPendiente) ? 0.5 : 1,
            }}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>

          <div style={{ ...type.label, color: colors.textMute, marginTop: 8, lineHeight: 1.5 }}>
            Cambiar la serie con tickets ya emitidos rompe la correlatividad: solo
            se toca al dar de alta, o para arreglar un alta mal hecha.
          </div>
        </>
      )}

      {/* Se enseña también con el TPV apagado si sigue activa: así siempre se puede apagar. */}
      {(activo || liqDesde) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginTop: 14,
          borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
        }}>
          <CalendarClock size={18} color={colors.terracotta} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>Liquidación diaria</div>
            <div style={{ ...type.label, color: colors.textMute, marginTop: 2, lineHeight: 1.45 }}>
              {liqDesde
                ? `Activa desde el ${new Date(liqDesde).toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Lo cobrado con tarjeta en su local y por el repartidor se le paga cada día (Liquidaciones › Diarias).`
                : 'Apagada: lo cobrado con tarjeta en su local y por el repartidor va en la liquidación de los lunes.'}
            </div>
          </div>
          <Toggle on={!!liqDesde} disabled={busyDiaria} tone="sage" onChange={toggleDiaria} aria-label="Liquidación diaria" />
        </div>
      )}
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
