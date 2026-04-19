import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { toast, confirmar } from '../App'
import { CreditCard, CheckCircle2, AlertCircle } from 'lucide-react'

const ESTADO_INFO = {
  active:   { label: 'Activo',         bg: 'rgba(34,197,94,0.15)',  color: '#4ADE80' },
  pending:  { label: 'Procesando',     bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
  past_due: { label: 'Pago pendiente', bg: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  unpaid:   { label: 'Impagado',       bg: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  canceled: { label: 'Cancelado',      bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' },
  inactive: { label: 'Inactivo',       bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' },
}

export default function PlanTiendaCard({ establecimiento, onChanged }) {
  const [sub, setSub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!establecimiento?.id) return
    load()
  }, [establecimiento?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('suscripciones_tienda').select('*').eq('establecimiento_id', establecimiento.id).maybeSingle()
    setSub(data || null)
    setLoading(false)
  }

  async function togglePlanPro() {
    const nuevo = !establecimiento.plan_pro
    const ok = await confirmar(`¿${nuevo ? 'Activar' : 'Desactivar'} manualmente plan_pro de "${establecimiento.nombre}"? Uso solo emergencias.`)
    if (!ok) return
    setToggling(true)
    const patch = nuevo
      ? { plan_pro: true, plan_pro_activado_en: new Date().toISOString() }
      : { plan_pro: false }
    const { error } = await supabase.from('establecimientos').update(patch).eq('id', establecimiento.id)
    setToggling(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(`plan_pro = ${nuevo}`, 'success')
    onChanged?.()
  }

  async function cancelarForzado() {
    const ok = await confirmar(`¿Cancelar forzadamente la suscripción de "${establecimiento.nombre}"? Se cancelará en Stripe y plan_pro pasa a false.`)
    if (!ok) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancelar-suscripcion-tienda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ establecimiento_id: establecimiento.id, force: true }),
    })
    const json = await res.json()
    if (!res.ok) return toast('Error: ' + (json.error || 'cancelación forzada'), 'error')
    toast('Suscripción cancelada forzadamente')
    load()
    onChanged?.()
  }

  const estado = sub?.estado || (establecimiento.plan_pro ? 'active' : 'inactive')
  const info = ESTADO_INFO[estado] || ESTADO_INFO.inactive

  return (
    <div style={{ ...ds.card, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <CreditCard size={18} color="#FF6B2C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5' }}>Plan Tienda Pública</h3>
        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: info.bg, color: info.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {info.label}
        </span>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Cargando...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 12, color: '#F5F5F5' }}>
            <div>
              <div style={{ ...ds.muted, fontSize: 10 }}>plan_pro (BD)</div>
              <div style={{ fontWeight: 700, color: establecimiento.plan_pro ? '#4ADE80' : 'rgba(255,255,255,0.4)' }}>
                {String(!!establecimiento.plan_pro)}
              </div>
            </div>
            <div>
              <div style={{ ...ds.muted, fontSize: 10 }}>Estado suscripción</div>
              <div style={{ fontWeight: 700 }}>{estado}</div>
            </div>
            <div>
              <div style={{ ...ds.muted, fontSize: 10 }}>Próximo pago</div>
              <div style={{ fontWeight: 700 }}>
                {sub?.fecha_proximo_pago ? new Date(sub.fecha_proximo_pago).toLocaleDateString('es-ES') : '—'}
              </div>
            </div>
            <div>
              <div style={{ ...ds.muted, fontSize: 10 }}>Intentos fallidos</div>
              <div style={{ fontWeight: 700, color: (sub?.intentos_fallidos || 0) >= 1 ? '#F87171' : '#F5F5F5' }}>
                {sub?.intentos_fallidos || 0}/3
              </div>
            </div>
            <div>
              <div style={{ ...ds.muted, fontSize: 10 }}>Monto mensual</div>
              <div style={{ fontWeight: 700 }}>{sub?.monto_mensual ? `${sub.monto_mensual}€` : '39€'}</div>
            </div>
            <div>
              <div style={{ ...ds.muted, fontSize: 10 }}>Stripe subscription</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sub?.stripe_subscription_id || '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={togglePlanPro} disabled={toggling} style={ds.secondaryBtn}>
              {toggling ? '...' : establecimiento.plan_pro ? 'Desactivar plan_pro (forzado)' : 'Activar plan_pro (forzado)'}
            </button>
            {sub?.stripe_subscription_id && estado !== 'canceled' && (
              <button onClick={cancelarForzado} style={{ ...ds.secondaryBtn, color: '#EF4444' }}>
                Cancelar suscripción (forzado)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
