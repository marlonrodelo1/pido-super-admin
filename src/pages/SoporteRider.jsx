// Bandeja de soporte con socios/riders.
// Lista lateral de socios con conversaciones, panel derecho con el hilo +
// caja de envio. Realtime sobre rider_support_messages.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { MessageCircle, Send } from 'lucide-react'

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1)
  const dDia = new Date(d); dDia.setHours(0, 0, 0, 0)
  if (dDia.getTime() === hoy.getTime()) return 'Hoy'
  if (dDia.getTime() === ayer.getTime()) return 'Ayer'
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export default function SoporteRider() {
  const [socios, setSocios] = useState([])
  const [activoId, setActivoId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  // Cargar lista de socios con mensajes (agrupados)
  async function loadSocios() {
    const { data: rows } = await supabase
      .from('rider_support_messages')
      .select('socio_id, remitente, mensaje, created_at, leido')
      .order('created_at', { ascending: false })
      .limit(500)
    if (!rows) { setSocios([]); return }

    // Agrupa por socio_id, conserva ultimo mensaje y unread del rider
    const map = new Map()
    for (const r of rows) {
      const cur = map.get(r.socio_id)
      if (!cur) {
        map.set(r.socio_id, {
          socio_id: r.socio_id,
          ultimo: r,
          unread: 0,
        })
      }
      const entry = map.get(r.socio_id)
      if (r.remitente === 'rider' && !r.leido) entry.unread += 1
    }
    const ids = [...map.keys()]
    if (ids.length === 0) { setSocios([]); return }
    const { data: socs } = await supabase
      .from('socios')
      .select('id, nombre, nombre_comercial, telefono')
      .in('id', ids)
    const byId = new Map((socs || []).map((s) => [s.id, s]))
    const list = ids.map((id) => ({
      ...map.get(id),
      socio: byId.get(id) || null,
    })).sort((a, b) => new Date(b.ultimo.created_at) - new Date(a.ultimo.created_at))
    setSocios(list)
    if (!activoId && list.length) setActivoId(list[0].socio_id)
  }

  useEffect(() => {
    loadSocios()
    const ch = supabase.channel('superadmin-soporte-rider')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rider_support_messages' },
        () => loadSocios())
      .subscribe()
    return () => { try { supabase.removeChannel(ch) } catch (_) {} }
  }, [])

  // Cargar y suscribir hilo activo
  useEffect(() => {
    if (!activoId) { setMsgs([]); return }
    let cancel = false
    ;(async () => {
      const { data } = await supabase
        .from('rider_support_messages')
        .select('id, remitente, mensaje, created_at, leido')
        .eq('socio_id', activoId)
        .order('created_at', { ascending: true })
      if (!cancel) setMsgs(data || [])
      // Marca como leido los mensajes del rider
      const noLeidos = (data || []).filter((m) => m.remitente === 'rider' && !m.leido).map((m) => m.id)
      if (noLeidos.length) {
        await supabase.from('rider_support_messages').update({ leido: true }).in('id', noLeidos)
        loadSocios()
      }
    })()
    const ch = supabase.channel('superadmin-rider-chat-' + activoId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rider_support_messages', filter: `socio_id=eq.${activoId}` },
        (payload) => setMsgs((prev) => [...prev, payload.new]))
      .subscribe()
    return () => { cancel = true; try { supabase.removeChannel(ch) } catch (_) {} }
  }, [activoId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999 })
  }, [msgs.length, activoId])

  const send = async (e) => {
    e?.preventDefault?.()
    const t = text.trim()
    if (!t || !activoId || sending) return
    setSending(true)
    try {
      await supabase.from('rider_support_messages').insert({
        socio_id: activoId, remitente: 'soporte', mensaje: t,
      })
      setText('')
    } catch (err) {
      alert('Error al enviar: ' + (err?.message || ''))
    } finally {
      setSending(false)
    }
  }

  const activo = useMemo(() => socios.find((s) => s.socio_id === activoId), [socios, activoId])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <MessageCircle size={20} color="#FF6B2C" />
        <h1 style={{ ...ds.h1 }}>Soporte rider</h1>
        <span style={{ ...ds.muted, fontSize: 12 }}>
          {socios.length} {socios.length === 1 ? 'conversación' : 'conversaciones'}
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16,
        height: 'calc(100vh - 160px)',
      }}>
        {/* Lista de socios */}
        <div style={{ ...ds.card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {socios.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
                Sin conversaciones aún
              </div>
            )}
            {socios.map((s) => {
              const active = s.socio_id === activoId
              return (
                <button key={s.socio_id} onClick={() => setActivoId(s.socio_id)} style={{
                  width: '100%', padding: '12px 14px', textAlign: 'left',
                  background: active ? 'var(--c-primary-soft)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--c-border)',
                  cursor: 'pointer', color: 'var(--c-text)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {s.socio?.nombre || s.socio?.nombre_comercial || 'Socio sin nombre'}
                    </div>
                    {s.unread > 0 && (
                      <span style={{
                        background: 'var(--c-primary)', color: '#fff',
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      }}>{s.unread}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.ultimo.remitente === 'rider' ? '' : '✓ '}{s.ultimo.mensaje}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--c-muted)' }}>
                    {fmtDateLabel(s.ultimo.created_at)} · {fmtTime(s.ultimo.created_at)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Hilo */}
        <div style={{ ...ds.card, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {!activo ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--c-muted)', fontSize: 13 }}>
              Selecciona una conversación
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>
                  {activo.socio?.nombre || activo.socio?.nombre_comercial}
                </div>
                <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>
                  {activo.socio?.telefono || '—'}
                </div>
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                {msgs.map((m) => {
                  const mine = m.remitente === 'soporte'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                      <div style={{
                        maxWidth: '70%', padding: '8px 12px', borderRadius: 14,
                        background: mine ? 'var(--c-primary)' : 'var(--c-surface2)',
                        color: mine ? '#fff' : 'var(--c-text)',
                        fontSize: 13, lineHeight: 1.4,
                      }}>
                        {m.mensaje}
                        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4, textAlign: 'right' }}>
                          {fmtTime(m.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--c-border)' }}>
                <input value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Responde al rider…"
                  style={{ ...ds.input, flex: 1 }} />
                <button type="submit" disabled={sending || !text.trim()}
                  style={{ ...ds.primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={14} /> Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
