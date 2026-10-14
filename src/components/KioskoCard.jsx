import { useState, useEffect, useCallback } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle } from '../lib/ui'
import { toast, confirmar } from '../App'

// Interruptor MAESTRO del módulo KIOSKO (14 oct 2026): la pantalla táctil de
// autopedido del local (panel.pidoo.es/kiosko).
//
// Mismo contrato que el TPV y el Almacén: lo enciende PIDOO y lo pausa el
// RESTAURANTE. `kiosko_config.activo` está congelada para el dueño por
// `kiosko_config_guard` (PD350), así que este toggle es el ÚNICO sitio desde el que se
// enciende. Va por RPC `kiosko_activar` porque SIEMBRA la fila: que exista es tener el
// módulo, y nadie más tiene policy de INSERT.
//
// Los pedidos del kiosko entran como pedidos de mesa (precio de barra, 0 % de
// comisión, se cobran en caja) con la marca `kiosko`.

export default function KioskoCard({ establecimiento, onChanged }) {
  const estId = establecimiento?.id

  const [cfg, setCfg] = useState(null)
  const [hoy, setHoy] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!estId) return
    const desde = new Date()
    desde.setHours(0, 0, 0, 0)
    const [c, p] = await Promise.all([
      supabase.from('kiosko_config').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('pedidos').select('id', { count: 'exact', head: true })
        .eq('establecimiento_id', estId).eq('kiosko', true).gte('created_at', desde.toISOString()),
    ])
    setCfg(c.data || null)
    setHoy(p.count || 0)
    setCargando(false)
  }, [estId])

  useEffect(() => { load() }, [load])

  async function toggle() {
    const nuevo = !cfg?.activo
    if (nuevo && !(await confirmar(
      `Vas a activar el KIOSKO de ${establecimiento?.nombre || 'este restaurante'}.\n\n` +
      `Sus clientes podrán pedir para llevar desde una pantalla táctil del local ` +
      `(panel.pidoo.es/kiosko). El pedido entra en cocina al momento, a precio de barra ` +
      `y sin comisión, y se cobra en caja.\n\n` +
      `La comanda la imprime su TPV de escritorio.`
    ))) return

    setBusy(true)
    const { error } = await supabase.rpc('kiosko_activar', {
      p_establecimiento_id: estId,
      p_activo: nuevo,
    })
    setBusy(false)
    // supabase-js NO lanza excepción: devuelve `{ error }`.
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'Kiosko activado' : 'Kiosko desactivado', 'success')
    load()
    onChanged?.()
  }

  if (cargando) return null

  const activo = !!cfg?.activo
  const pausado = !!cfg?.pausado_por_restaurante

  return (
    <div style={{
      background: colors.paper, borderRadius: radius.lg, padding: 16,
      border: `1px solid ${colors.border}`, boxShadow: colors.shadow, marginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <MonitorSmartphone size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>Kiosko de autopedido</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>
        Pantalla táctil en el local para pedir para llevar. Se abre en panel.pidoo.es/kiosko
        con la cuenta del restaurante.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            {cfg ? 'Módulo dado de alta' : 'Módulo sin dar de alta'}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            {!cfg
              ? 'Al activarlo se crea su configuración de kiosko (PIN del personal: 1234).'
              : activo
                ? (pausado
                  ? 'Activo, pero el restaurante lo tiene en pausa ahora mismo.'
                  : `Recibiendo pedidos. Hoy: ${hoy} pedido${hoy === 1 ? '' : 's'} por el kiosko.`)
                : 'Dado de alta pero apagado: la pantalla dice que no está activado.'}
          </div>
        </div>
        <Toggle on={activo} disabled={busy} tone="terracotta" onChange={toggle} aria-label="Activar el kiosko" />
      </div>
    </div>
  )
}
