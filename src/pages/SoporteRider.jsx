// Bandeja de soporte con socios/riders.
//
// Gemela de SoporteAdmin.jsx: misma cabecera, misma rejilla `soporte-grid`,
// mismas burbujas y mismo estado vacío. Realtime sobre
// `rider_support_messages` (lista + hilo activo), sin tocar.
//
// Los colores de texto sobre los fondos *Soft salen de los tokens `on*Soft`:
// el terracota puro sobre `terracottaSoft` se quedaba en 2,4:1.

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, GlossyBtn, Vacio } from '../lib/ui'
import { MessageSquare, Inbox, Send } from 'lucide-react'

function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// Hora sola si es de hoy, "Ayer · 21:05" o "03 ago · 18:12".
function fmtRel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1)
  const dia = new Date(d); dia.setHours(0, 0, 0, 0)
  if (dia.getTime() === hoy.getTime()) return fmtHora(iso)
  if (dia.getTime() === ayer.getTime()) return `Ayer · ${fmtHora(iso)}`
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · ${fmtHora(iso)}`
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

  // Derivados de pintado (sin estado ni hooks nuevos)
  const conSinLeer = socios.filter((s) => s.unread > 0).length
  const nombreDe = (s) => s?.socio?.nombre || s?.socio?.nombre_comercial || 'Socio sin nombre'

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Soporte rider</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Conversaciones con los socios que reparten, en directo.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Chip tono="neutral">
            {socios.length} {socios.length === 1 ? 'conversación' : 'conversaciones'}
          </Chip>
          <Chip tono={conSinLeer > 0 ? 'terracotta' : 'sage'} dot>
            {conSinLeer > 0 ? `${conSinLeer} sin leer` : 'Todo leído'}
          </Chip>
        </div>
      </div>

      {/* Dos columnas en escritorio; en móvil se apilan (regla `.soporte-grid`
          de index.css: los estilos de esta página son inline y no pueden
          llevar media query). */}
      <div
        className="soporte-grid"
        style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, height: 'calc(100vh - 200px)', minHeight: 420, alignItems: 'stretch' }}
      >
        {/* Lista de socios */}
        <Card className="soporte-lista" pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ ...ds.sectionLabel, margin: 0, padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, background: colors.elev2 }}>
            Conversaciones
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {socios.length === 0 ? (
              <Vacio icon={<Inbox size={26} />} titulo="Sin conversaciones" texto="Aquí aparecerán los socios que escriban a soporte." />
            ) : socios.map((s) => {
              const activa = s.socio_id === activoId
              const fgMute = activa ? colors.onTerracottaSoft : colors.stone
              return (
                <button
                  key={s.socio_id}
                  onClick={() => setActivoId(s.socio_id)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'block',
                    padding: '12px 14px', border: 'none', cursor: 'pointer',
                    borderBottom: `1px solid ${colors.border}`,
                    fontFamily: type.family,
                    background: activa ? colors.terracottaSoft : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ ...type.label, fontWeight: 700, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nombreDe(s)}
                    </span>
                    {s.unread > 0 && <Chip tono="terracotta">{s.unread}</Chip>}
                  </div>
                  <div style={{ ...type.label, color: fgMute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.ultimo.remitente === 'rider' ? '' : '✓ '}{s.ultimo.mensaje}
                  </div>
                  <div style={{ ...type.caption, color: fgMute, marginTop: 3 }}>
                    {fmtRel(s.ultimo.created_at)}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Hilo */}
        <Card className="soporte-chat" pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {!activo ? (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
              <Vacio
                icon={<MessageSquare size={28} />}
                titulo="Elige una conversación"
                texto="Selecciona un socio de la izquierda para ver el hilo y responder."
              />
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, background: colors.elev2 }}>
                <div style={{ ...type.h3, color: colors.ink }}>{nombreDe(activo)}</div>
                <div style={{ ...type.caption, color: colors.stone, marginTop: 2 }}>
                  {activo.socio?.telefono || 'Sin teléfono'}
                </div>
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 16, background: colors.cream }}>
                {msgs.length === 0 ? (
                  <Vacio icon={<MessageSquare size={26} />} titulo="Sin mensajes" texto="Escribe el primero desde la caja de abajo." />
                ) : msgs.map((m) => {
                  const mio = m.remitente === 'soporte'
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                      <div style={{
                        maxWidth: '76%', padding: '9px 13px',
                        borderRadius: radius.lg,
                        borderBottomRightRadius: mio ? radius.sm : radius.lg,
                        borderBottomLeftRadius: mio ? radius.lg : radius.sm,
                        background: mio ? colors.terracottaSoft : colors.elev2,
                        color: mio ? colors.onTerracottaSoft : colors.text,
                        ...type.body, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {m.mensaje}
                        {/* Sin `opacity`: rebajarla tumbaba el contraste de la hora
                            por debajo de lo legible sobre el fondo claro. */}
                        <div style={{ ...type.caption, marginTop: 4, textAlign: 'right', color: mio ? colors.onTerracottaSoft : colors.stone }}>
                          {fmtHora(m.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${colors.border}` }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Responde al rider…"
                  aria-label="Mensaje para el socio"
                  style={{ ...ds.formInput, flex: 1 }}
                />
                <GlossyBtn accent type="submit" disabled={sending || !text.trim()}
                  style={{ flexShrink: 0, opacity: sending || !text.trim() ? 0.6 : 1 }}>
                  <Send size={15} /> {sending ? 'Enviando…' : 'Enviar'}
                </GlossyBtn>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
