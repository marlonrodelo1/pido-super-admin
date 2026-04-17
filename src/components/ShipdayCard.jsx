import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { ExternalLink, CheckCircle2, AlertCircle, Copy, Truck } from 'lucide-react'
import { toast, confirmar } from '../App'

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shipday-webhook`
const SHIPDAY_DASHBOARD = 'https://dispatch.shipday.com/'

export default function ShipdayCard({ establecimiento, onKeyUpdated }) {
  const [apiKey, setApiKey] = useState(establecimiento?.shipday_api_key || '')
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [drivers, setDrivers] = useState(null)

  const savedKey = establecimiento?.shipday_api_key || ''
  const hasKey = !!savedKey
  const dirty = apiKey.trim() !== savedKey

  useEffect(() => {
    setApiKey(savedKey)
    setVerifyResult(null)
  }, [establecimiento?.id, savedKey])

  // Lee drivers_status + Realtime
  useEffect(() => {
    if (!establecimiento?.id) return
    let cancel = false
    const apply = (row) => !cancel && setDrivers(row ? { online: row.online_count, total: row.total_count, lastChecked: row.last_checked } : null)

    supabase.from('drivers_status')
      .select('online_count,total_count,last_checked')
      .eq('establecimiento_id', establecimiento.id)
      .maybeSingle()
      .then(({ data }) => apply(data))

    const channel = supabase.channel(`drivers_status_${establecimiento.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'drivers_status',
        filter: `establecimiento_id=eq.${establecimiento.id}`,
      }, (payload) => apply(payload.new))
      .subscribe()

    return () => { cancel = true; supabase.removeChannel(channel) }
  }, [establecimiento?.id])

  async function verificar() {
    const key = apiKey.trim()
    if (!key) { toast('Pega una API key primero', 'error'); return }
    setVerifying(true)
    setVerifyResult(null)
    try {
      const resp = await fetch('https://api.shipday.com/carriers', {
        method: 'GET',
        headers: { 'Authorization': `Basic ${key}`, 'Content-Type': 'application/json' },
      })
      if (!resp.ok) {
        setVerifyResult({ ok: false, msg: `Key inválida (HTTP ${resp.status})` })
        toast(`Key inválida — Shipday respondió ${resp.status}`, 'error')
        setVerifying(false); return
      }
      const data = await resp.json()
      const list = Array.isArray(data) ? data : (data.carriers || data.data || [])
      const total = list.length
      const online = list.filter(c => c?.isOnShift === true).length
      setVerifyResult({ ok: true, total, online })
      toast(`Key válida — ${total} rider${total === 1 ? '' : 's'} en esta cuenta (${online} online)`)
    } catch (e) {
      setVerifyResult({ ok: false, msg: 'Error de red al contactar Shipday' })
      toast('No se pudo contactar con Shipday', 'error')
    }
    setVerifying(false)
  }

  async function guardar() {
    const key = apiKey.trim()
    if (hasKey && !key) {
      const ok = await confirmar('¿Quitar la API key? Esto desactivará delivery en este restaurante.')
      if (!ok) return
    }
    setSaving(true)
    const { error } = await supabase.from('establecimientos')
      .update({ shipday_api_key: key || null })
      .eq('id', establecimiento.id)
    if (error) {
      toast('Error guardando: ' + error.message, 'error')
      setSaving(false); return
    }
    toast(key ? 'API key guardada — delivery activado' : 'API key eliminada — delivery desactivado')
    onKeyUpdated?.(key || null)
    setSaving(false)
  }

  function copiarWebhook() {
    navigator.clipboard.writeText(WEBHOOK_URL)
    toast('URL del webhook copiada')
  }

  const badgeStyle = (() => {
    if (!hasKey) return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', color: '#F87171', label: 'Delivery desactivado' }
    if (!drivers) return { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', color: '#94A3B8', label: 'Comprobando repartidores...' }
    if (drivers.online === 0) return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', color: '#F87171', label: `Sin repartidores online (0/${drivers.total})` }
    return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', color: '#4ADE80', label: `${drivers.online}/${drivers.total} repartidor${drivers.total === 1 ? '' : 'es'} online` }
  })()

  return (
    <div style={{ ...ds.card, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Truck size={18} color="#FF6B2C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', flex: 1 }}>Integración Shipday</h3>
        <a href={SHIPDAY_DASHBOARD} target="_blank" rel="noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#FF6B2C',
          textDecoration: 'none', fontWeight: 600,
        }}>
          Abrir Shipday <ExternalLink size={12} />
        </a>
      </div>

      <div style={{
        padding: '8px 12px', borderRadius: 10, marginBottom: 14,
        background: badgeStyle.bg, border: `1px solid ${badgeStyle.border}`,
        color: badgeStyle.color, fontSize: 12, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>{badgeStyle.label}</span>
        {drivers?.lastChecked && (
          <span style={{ fontSize: 10, opacity: 0.7 }}>
            Último chequeo: {new Date(drivers.lastChecked).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <label style={ds.label}>API Key Shipday del restaurante</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setVerifyResult(null) }}
          placeholder="Pegar API key de Shipday (Settings → API)"
          style={{ ...ds.formInput, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
        />
        <button onClick={verificar} disabled={verifying || !apiKey.trim()} style={{
          ...ds.secondaryBtn, opacity: verifying || !apiKey.trim() ? 0.5 : 1,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {verifying ? 'Verificando...' : 'Verificar'}
        </button>
        <button onClick={guardar} disabled={saving || !dirty} style={{
          ...ds.primaryBtn, opacity: saving || !dirty ? 0.5 : 1,
        }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {verifyResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: verifyResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: verifyResult.ok ? '#4ADE80' : '#F87171',
          fontSize: 12, fontWeight: 600,
        }}>
          {verifyResult.ok
            ? <><CheckCircle2 size={14} /> Key válida — {verifyResult.total} rider{verifyResult.total === 1 ? '' : 's'} ({verifyResult.online} online)</>
            : <><AlertCircle size={14} /> {verifyResult.msg}</>
          }
        </div>
      )}

      <div style={{
        padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.6)',
      }}>
        <div style={{ fontWeight: 700, color: '#F5F5F5', marginBottom: 6 }}>
          Configuración webhook en la cuenta Shipday del restaurante
        </div>
        <div style={{ marginBottom: 4 }}>
          En Shipday: <strong>Settings → Webhooks → Add</strong>, pega esta URL:
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 8,
          fontFamily: 'monospace', fontSize: 11, color: '#F5F5F5', wordBreak: 'break-all',
        }}>
          <span style={{ flex: 1 }}>{WEBHOOK_URL}</span>
          <button onClick={copiarWebhook} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#FF6B2C', padding: 4, display: 'flex', alignItems: 'center',
          }}>
            <Copy size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
