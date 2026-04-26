import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { toast, confirmar } from '../App'
import { Truck } from 'lucide-react'

// Toggle del feature flag establecimientos.usa_dispatcher_propio.
// Cuando se activa, los pedidos delivery de este restaurante se asignan
// con el dispatcher propio (app de socios/riders Pidoo) en vez de Shipday.

export default function DispatcherPropioCard({ establecimiento, onChanged }) {
  const [toggling, setToggling] = useState(false)
  const activo = !!establecimiento?.usa_dispatcher_propio

  async function toggle() {
    const nuevo = !activo
    const ok = await confirmar(
      nuevo
        ? `¿Activar dispatcher propio en "${establecimiento.nombre}"?\n\nLos pedidos delivery se asignarán a los socios/riders Pidoo (app móvil) en vez de Shipday. Asegúrate de que tiene riders vinculados.`
        : `¿Desactivar dispatcher propio en "${establecimiento.nombre}"?\n\nVolverá a usar Shipday para todos los pedidos.`
    )
    if (!ok) return
    setToggling(true)
    const { error } = await supabase
      .from('establecimientos')
      .update({ usa_dispatcher_propio: nuevo })
      .eq('id', establecimiento.id)
    setToggling(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(`usa_dispatcher_propio = ${nuevo}`, 'success')
    onChanged?.()
  }

  const badge = activo
    ? { label: 'Pidoo', bg: 'var(--c-success-soft)', color: 'var(--c-success)' }
    : { label: 'Shipday', bg: 'var(--c-surface2)', color: 'var(--c-text-soft)' }

  return (
    <div style={{ ...ds.card, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Truck size={18} color="#FF6B2C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>Despacho de pedidos</h3>
        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {badge.label}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        {activo
          ? 'Los pedidos delivery se reparten con socios/riders Pidoo (app móvil propia). Shipday queda desactivado para este restaurante.'
          : 'Los pedidos delivery se reparten con Shipday. Activa para usar el sistema propio de socios/riders Pidoo.'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={toggle} disabled={toggling} style={ds.secondaryBtn}>
          {toggling ? '...' : activo ? 'Volver a Shipday' : 'Activar dispatcher Pidoo'}
        </button>
      </div>
    </div>
  )
}
