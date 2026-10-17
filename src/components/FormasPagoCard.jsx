import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle } from '../lib/ui'
import { toast, confirmar } from '../App'

// Formas de pago del restaurante (17 oct 2026): las decide SOLO Pidoo.
//
// Las tres columnas (`acepta_tarjeta_online`, `acepta_datafono`, `acepta_efectivo`) las
// congela para el dueño `trg_tarjeta_app_siempre_activa` (PD334): desde su panel solo las
// ve. Aquí se cambian una a una, al momento. El CHECK `establecimientos_algun_metodo_pago`
// exige que quede al menos una encendida (23514).
//
// Quitar la tarjeta tiene consecuencia de dinero: Pidoo deja de tener el cobro y su
// comisión se le queda a deber el restaurante hasta la liquidación del lunes.

const METODOS = [
  {
    campo: 'acepta_tarjeta_online',
    titulo: 'Tarjeta en la app',
    nota: 'El cliente paga al pedir. El dinero lo tiene Pidoo y se lo transfiere el lunes.',
  },
  {
    campo: 'acepta_datafono',
    titulo: 'Datáfono (tarjeta al entregar)',
    nota: 'Se cobra en la puerta o en el local. Si el cliente no paga, lo pierde el restaurante.',
  },
  {
    campo: 'acepta_efectivo',
    titulo: 'Efectivo',
    nota: 'Se cobra en mano. La comisión de Pidoo se salda en la liquidación del lunes.',
  },
]

export default function FormasPagoCard({ establecimiento, onChanged }) {
  const estId = establecimiento?.id
  const [busy, setBusy] = useState(null) // campo que se está guardando

  if (!estId) return null

  const valor = (campo) => {
    const v = establecimiento?.[campo]
    // Mismos defaults que la columna en BD.
    return v == null ? campo !== 'acepta_datafono' : !!v
  }
  const encendidos = METODOS.filter((m) => valor(m.campo)).length

  async function cambiar(m) {
    const nuevo = !valor(m.campo)
    if (!nuevo && encendidos <= 1) {
      return toast('Tiene que quedar al menos una forma de pago activa.', 'error')
    }
    if (m.campo === 'acepta_tarjeta_online' && !nuevo && !(await confirmar(
      `Vas a quitar el pago con TARJETA EN LA APP a ${establecimiento?.nombre || 'este restaurante'}.\n\n` +
      `Sus clientes solo podrán pagar al recibir el pedido. Pidoo deja de tener el cobro: ` +
      `su comisión se le queda a deber el restaurante y se salda en la liquidación del lunes.`
    ))) return

    setBusy(m.campo)
    // .select('id'): un UPDATE que no toca ninguna fila no da error (RLS); hay que mirarlo.
    const { data, error } = await supabase.from('establecimientos')
      .update({ [m.campo]: nuevo })
      .eq('id', estId)
      .select('id')
    setBusy(null)
    if (error) {
      return toast(error.code === '23514'
        ? 'Tiene que quedar al menos una forma de pago activa.'
        : 'Error: ' + error.message, 'error')
    }
    if (!data?.length) return toast('No se ha guardado: no tienes permiso sobre este restaurante.', 'error')
    toast(`${m.titulo}: ${nuevo ? 'activado' : 'desactivado'}`, 'success')
    onChanged?.()
  }

  return (
    <div style={{
      background: colors.paper, borderRadius: radius.lg, padding: 16,
      border: `1px solid ${colors.border}`, boxShadow: colors.shadow, marginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CreditCard size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>Formas de pago</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>
        Solo las cambia Pidoo, desde aquí. El restaurante las ve en su panel pero no puede tocarlas.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {METODOS.map((m) => {
          const on = valor(m.campo)
          return (
            <div key={m.campo} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: radius.md, border: `1px solid ${colors.border}`,
              background: on ? 'transparent' : colors.cream,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
                  {m.titulo} · {on ? 'activo' : 'desactivado'}
                </div>
                <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>{m.nota}</div>
              </div>
              <Toggle on={on} disabled={!!busy} tone="terracotta"
                onChange={() => cambiar(m)} aria-label={m.titulo} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
