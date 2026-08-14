import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, SectionLabel, StatCard, GlossyBtn, Vacio, Chip } from '../lib/ui'
import { Send, Bell, Users, Store, CheckCircle, AlertTriangle, Clock } from 'lucide-react'

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

  // El destino puede no coincidir con ninguna opción (el estado arranca en 'all',
  // que no está en la lista). No lo damos por bueno: se avisa en pantalla.
  const destinoActual = destinos.find(d => d.id === destino)
  const total = stats.clientes + stats.restaurantes
  const listo = !!titulo.trim() && !!mensaje.trim()

  const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ ...ds.h1, marginBottom: 4 }}>Notificaciones push</h1>
        <div style={{ ...type.body, color: colors.textMute }}>
          Avisos que suenan en el móvil de clientes y restaurantes. Se entregan al instante y no se pueden retirar.
        </div>
      </div>

      {/* Suscripciones */}
      <div className="ds-cards" style={{ marginBottom: 28 }}>
        <StatCard label="Suscripciones" value={total} sub="Dispositivos alcanzables" icon={<Bell size={16} />} />
        <StatCard label="Clientes" value={stats.clientes} sub="Apps de cliente" tone="terracotta" icon={<Users size={16} />} />
        <StatCard label="Restaurantes" value={stats.restaurantes} sub="Paneles de restaurante" tone="sage" icon={<Store size={16} />} />
      </div>

      {/* Enviar notificación */}
      <Card pad={22} style={{ marginBottom: 28 }}>
        <h2 style={{ ...ds.h3, marginBottom: 2 }}>Enviar notificación</h2>
        <div style={{ ...type.body, color: colors.textMute, marginBottom: 18 }}>
          Escribe el aviso, comprueba la vista previa y envíalo.
        </div>

        {/* Destino */}
        <div style={{ marginBottom: 16 }}>
          <label style={ds.label}>Enviar a</label>
          <select value={destino} onChange={e => setDestino(e.target.value)} style={{ ...ds.select, maxWidth: 320 }}>
            {destinos.map(d => (
              <option key={d.id} value={d.id}>{d.label} · {d.desc}</option>
            ))}
          </select>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {destinoActual ? (
              <>
                <Chip tono="info" dot>{destinoActual.label}</Chip>
                <span>Se enviará a {destinoActual.desc}.</span>
              </>
            ) : (
              <>
                <Chip tono="warning" dot>Sin elegir</Chip>
                <span>Elige a quién va dirigido antes de enviar.</span>
              </>
            )}
          </div>
        </div>

        {/* Título */}
        <div style={{ marginBottom: 12 }}>
          <label style={ds.label}>Título</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej: ¡Oferta especial!" style={ds.formInput} />
        </div>

        {/* Mensaje */}
        <div style={{ marginBottom: 18 }}>
          <label style={ds.label}>Mensaje</label>
          <textarea
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            placeholder="Ej: 20% de descuento en todos los pedidos este fin de semana"
            rows={3}
            style={{ ...ds.formInput, height: 'auto', padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }}
          />
        </div>

        {/* Vista previa: se pinta como el aviso real que sale en la pantalla del móvil */}
        {(titulo || mensaje) && (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel>Así se verá en el móvil</SectionLabel>
            <div style={{ background: colors.cream2, borderRadius: radius.lg, padding: 18, border: `1px solid ${colors.border}` }}>
              <div style={{
                maxWidth: 380, margin: '0 auto', display: 'flex', gap: 11, alignItems: 'flex-start',
                background: colors.paper, borderRadius: 14, padding: 12,
                border: `1px solid ${colors.border}`, boxShadow: colors.shadowMd,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: `linear-gradient(180deg, ${colors.terracotta} 0%, ${colors.terracotta2} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bell size={17} color={colors.cream} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ ...type.caption, color: colors.stone, textTransform: 'uppercase' }}>Pidoo</span>
                    <span style={{ ...type.caption, color: colors.stone, flexShrink: 0 }}>ahora</span>
                  </div>
                  <div style={{ ...type.label, fontWeight: 700, color: colors.ink, marginTop: 3, overflowWrap: 'anywhere' }}>
                    {titulo || 'Título de la notificación'}
                  </div>
                  <div style={{ ...type.label, color: colors.stone, marginTop: 2, overflowWrap: 'anywhere' }}>
                    {mensaje || 'Aquí va el mensaje que leerá quien la reciba…'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div style={{
            padding: '12px 14px', borderRadius: radius.md, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 9,
            background: resultado.ok ? colors.sageSoft : colors.dangerSoft,
            color: resultado.ok ? colors.onSageSoft : colors.onDangerSoft,
            ...type.label, fontWeight: 600,
          }}>
            {resultado.ok ? <CheckCircle size={16} style={{ flexShrink: 0 }} /> : <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
            {resultado.ok ? `Enviada a ${resultado.enviados}/${resultado.total} dispositivos` : `Error: ${resultado.error}`}
          </div>
        )}

        {/* Botón enviar */}
        <GlossyBtn
          accent
          full
          size="lg"
          onClick={enviarNotificacion}
          disabled={enviando || !listo}
          style={{ opacity: enviando || !listo ? 0.55 : 1, cursor: enviando || !listo ? 'default' : 'pointer' }}
        >
          <Send size={16} />
          {enviando ? 'Enviando…' : 'Enviar notificación'}
        </GlossyBtn>
        <div style={{ ...type.caption, color: colors.textMute, textAlign: 'center', marginTop: 10 }}>
          El envío es inmediato y no se puede deshacer.
        </div>
      </Card>

      {/* Historial */}
      <h2 style={ds.h2}>Historial reciente</h2>
      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ flex: '1 1 200px', minWidth: 0 }}>Notificación</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1.6 1 240px', minWidth: 0 }}>Mensaje</span>
          <span style={{ width: 150, flexShrink: 0 }}>Enviada</span>
        </div>

        {historial.map(n => (
          <div key={n.id} className="ds-row-touch" style={ds.tableRow}>
            <span data-col="nom" style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
              <Bell size={14} color={colors.stone} style={{ flexShrink: 0 }} />
              <span style={{ ...type.label, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.titulo}
              </span>
            </span>
            <span data-col="ale" data-tablet-sm-hide="true" style={{ flex: '1.6 1 240px', minWidth: 0, ...type.label, color: colors.textMute }}>
              {n.descripcion}
            </span>
            <span data-col="fec" style={{ width: 150, flexShrink: 0, ...type.label, color: colors.textMute, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={12} style={{ flexShrink: 0 }} />
              {fecha(n.created_at)}
            </span>
          </div>
        ))}

        {historial.length === 0 && (
          <Vacio
            icon={<Bell size={26} />}
            titulo="Sin notificaciones enviadas"
            texto="Aquí quedará el rastro de los últimos veinte avisos que mandes."
          />
        )}
      </div>
    </div>
  )
}
