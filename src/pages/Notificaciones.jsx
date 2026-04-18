import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Send, Bell, Users, Store, CheckCircle, Clock } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function Notificaciones() {
  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [destino, setDestino] = useState('all')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [stats, setStats] = useState({ clientes: 0, restaurantes: 0 })

  useEffect(() => { loadStats(); loadHistorial() }, [])

  async function loadStats() {
    const { data } = await supabase.from('push_subscriptions').select('user_type')
    if (!data) return
    setStats({
      clientes: data.filter(d => d.user_type === 'cliente').length,
      restaurantes: data.filter(d => d.user_type === 'restaurante').length,
    })
  }

  async function loadHistorial() {
    const { data } = await supabase.from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setHistorial(data || [])
  }

  async function enviarNotificacion() {
    if (!titulo.trim() || !mensaje.trim()) return
    setEnviando(true)
    setResultado(null)

    try {
      // Determinar target_type para la edge function
      let targetType = destino
      if (destino === 'todos') targetType = 'all'
      else if (destino === 'clientes') targetType = 'all_clientes'
      else if (destino === 'restaurantes') targetType = 'all_restaurantes'
      // Enviar a cada suscripción individualmente
      let enviados = 0
      const subsToSend = destino === 'todos'
        ? (await supabase.from('push_subscriptions').select('*')).data || []
        : (await supabase.from('push_subscriptions').select('*').eq('user_type', destino === 'clientes' ? 'cliente' : 'restaurante')).data || []

      // Usar la edge function para cada usuario único
      const uniqueTargets = new Map()
      for (const sub of subsToSend) {
        const key = sub.user_id || sub.establecimiento_id || sub.id
        if (!uniqueTargets.has(key)) {
          uniqueTargets.set(key, sub)
        }
      }

      // Obtener JWT del admin autenticado
      const { data: { session } } = await supabase.auth.getSession()
      const authToken = session?.access_token || SUPABASE_ANON_KEY

      for (const [, sub] of uniqueTargets) {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/enviar_push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              target_type: sub.user_type === 'cliente' ? 'cliente' : 'restaurante',
              target_id: sub.user_id || sub.establecimiento_id,
              title: titulo.trim(),
              body: mensaje.trim(),
            }),
          })
          if (res.ok) enviados++
        } catch {}
      }

      setResultado({ ok: true, enviados, total: uniqueTargets.size })
      setTitulo('')
      setMensaje('')
      loadHistorial()
    } catch (err) {
      setResultado({ ok: false, error: err.message })
    } finally {
      setEnviando(false)
    }
  }

  const destinos = [
    { id: 'todos', label: 'Todos', icon: Users, desc: `${stats.clientes + stats.restaurantes} dispositivos` },
    { id: 'clientes', label: 'Clientes', icon: Users, desc: `${stats.clientes} dispositivos` },
    { id: 'restaurantes', label: 'Restaurantes', icon: Store, desc: `${stats.restaurantes} dispositivos` },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={ds.h1}>Notificaciones Push</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={16} color="rgba(255,255,255,0.4)" />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{stats.clientes + stats.restaurantes} suscripciones activas</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={ds.card}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Clientes</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#3B82F6' }}>{stats.clientes}</div>
        </div>
        <div style={ds.card}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Restaurantes</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#FF6B2C' }}>{stats.restaurantes}</div>
        </div>
      </div>

      {/* Enviar notificación */}
      <div style={{ ...ds.card, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F5F5F5', marginBottom: 16 }}>Enviar notificación</h2>

        {/* Destino */}
        <div style={{ marginBottom: 16 }}>
          <label style={ds.label}>Enviar a</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {destinos.map(d => {
              const sel = destino === d.id
              return (
                <button key={d.id} onClick={() => setDestino(d.id)} style={{
                  padding: '12px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                  border: sel ? '2px solid #FF6B2C' : '1px solid rgba(255,255,255,0.1)',
                  background: sel ? 'rgba(255,107,44,0.12)' : 'rgba(255,255,255,0.04)',
                }}>
                  <d.icon size={18} color={sel ? '#FF6B2C' : 'rgba(255,255,255,0.4)'} style={{ margin: '0 auto 6px', display: 'block' }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: sel ? '#FF6B2C' : '#F5F5F5' }}>{d.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{d.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Título */}
        <div style={{ marginBottom: 12 }}>
          <label style={ds.label}>Título</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: ¡Oferta especial!" style={ds.formInput} />
        </div>

        {/* Mensaje */}
        <div style={{ marginBottom: 16 }}>
          <label style={ds.label}>Mensaje</label>
          <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder="Ej: 20% de descuento en todos los pedidos este fin de semana" rows={3} style={{ ...ds.formInput, resize: 'vertical' }} />
        </div>

        {/* Preview */}
        {(titulo || mensaje) && (
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8, fontWeight: 600 }}>PREVIEW</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FF6B2C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bell size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{titulo || 'Título'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{mensaje || 'Mensaje...'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
            background: resultado.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: resultado.ok ? '#22C55E' : '#EF4444', fontSize: 13, fontWeight: 600,
          }}>
            <CheckCircle size={16} />
            {resultado.ok ? `Enviada a ${resultado.enviados}/${resultado.total} dispositivos` : `Error: ${resultado.error}`}
          </div>
        )}

        {/* Botón enviar */}
        <button onClick={enviarNotificacion} disabled={enviando || !titulo.trim() || !mensaje.trim()} style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: enviando || !titulo.trim() || !mensaje.trim() ? 'rgba(255,255,255,0.1)' : '#FF6B2C',
          color: '#fff', fontSize: 15, fontWeight: 800, cursor: enviando ? 'default' : 'pointer',
          fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Send size={16} />
          {enviando ? 'Enviando...' : 'Enviar notificación'}
        </button>
      </div>

      {/* Historial */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F5F5F5', marginBottom: 12 }}>Historial reciente</h2>
      <div style={ds.table}>
        {historial.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Sin notificaciones enviadas</div>
        )}
        {historial.map(n => (
          <div key={n.id} style={{ ...ds.tableRow, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell size={14} color="rgba(255,255,255,0.3)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{n.titulo}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{n.descripcion}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              <Clock size={12} />
              {new Date(n.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
