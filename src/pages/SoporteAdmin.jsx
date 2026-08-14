// Bandeja de soporte con restaurantes.
//
// Gemela de SoporteRider.jsx: misma cabecera, misma rejilla `soporte-grid`,
// mismas burbujas y mismo estado vacío. Las dos pantallas hacían lo mismo con
// maquetación distinta (300px vs 320px de lista, burbujas naranja sólido en
// una y `var(--c-primary)` en la otra, alturas de caja distintas); ahora
// comparten patrón para que dejen de divergir.
//
// Los colores de texto sobre los fondos *Soft salen de los tokens `on*Soft`:
// el terracota puro sobre `terracottaSoft` se quedaba en 2,4:1.

import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Inbox, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, GlossyBtn, Vacio } from '../lib/ui'

// Hora sola si el mensaje es de hoy; si no, el día delante. El original
// pintaba `toLocaleString()` entero ("14/8/2026, 21:05:33"), que en una lista
// de 320px se salía de la fila.
function fmtHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

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

export default function SoporteAdmin() {
  const [conversaciones, setConversaciones] = useState([])
  const [selected, setSelected] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const selectedRef = useRef(null)

  useEffect(() => { selectedRef.current = selected }, [selected])

  useEffect(() => {
    loadConversaciones()
    const channel = supabase.channel('admin-soporte')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, payload => {
        if (payload.new.tipo !== 'soporte') return
        if (selectedRef.current && payload.new.establecimiento_id === selectedRef.current.establecimiento_id) {
          setMensajes(prev => [...prev, payload.new])
        }
        loadConversaciones()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function loadConversaciones() {
    const { data } = await supabase.from('mensajes')
      .select('establecimiento_id, texto, created_at, leido')
      .eq('tipo', 'soporte')
      .order('created_at', { ascending: false })

    const agrupados = {}
    ;(data || []).forEach(m => {
      if (!m.establecimiento_id) return
      if (!agrupados[m.establecimiento_id]) {
        agrupados[m.establecimiento_id] = {
          establecimiento_id: m.establecimiento_id,
          ultimo: m.texto,
          fecha: m.created_at,
          sinLeer: 0,
        }
      }
      if (!m.leido) agrupados[m.establecimiento_id].sinLeer++
    })
    const lista = Object.values(agrupados).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    const ids = lista.map(c => c.establecimiento_id).filter(Boolean)
    if (ids.length > 0) {
      const { data: ests } = await supabase.from('establecimientos').select('id, nombre').in('id', ids)
      const map = {}
      ;(ests || []).forEach(e => { map[e.id] = e })
      lista.forEach(c => { c.establecimiento = map[c.establecimiento_id] })
    }
    setConversaciones(lista)
  }

  async function selectConv(conv) {
    setSelected(conv)
    const { data } = await supabase.from('mensajes')
      .select('*')
      .eq('tipo', 'soporte')
      .eq('establecimiento_id', conv.establecimiento_id)
      .order('created_at', { ascending: true })
    setMensajes(data || [])
    await supabase.from('mensajes').update({ leido: true })
      .eq('tipo', 'soporte')
      .eq('establecimiento_id', conv.establecimiento_id)
      .neq('de', 'soporte')
    loadConversaciones()
  }

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim() || !selected) return
    await supabase.from('mensajes').insert({
      tipo: 'soporte',
      establecimiento_id: selected.establecimiento_id,
      de: 'soporte',
      texto: texto.trim(),
    })
    setTexto('')
    selectConv(selected)
  }

  // Derivados de pintado (sin estado ni hooks nuevos)
  const conSinLeer = conversaciones.filter(c => c.sinLeer > 0).length
  const nombreDe = (c) => c?.establecimiento?.nombre || 'Restaurante'

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Soporte</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Conversaciones con los restaurantes, en directo.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Chip tono="neutral">
            {conversaciones.length} {conversaciones.length === 1 ? 'conversación' : 'conversaciones'}
          </Chip>
          <Chip tono={conSinLeer > 0 ? 'terracotta' : 'sage'} dot>
            {conSinLeer > 0
              ? `${conSinLeer} sin leer`
              : 'Todo leído'}
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
        {/* Lista de conversaciones */}
        <Card className="soporte-lista" pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ ...ds.sectionLabel, margin: 0, padding: '12px 14px', borderBottom: `1px solid ${colors.border}`, background: colors.elev2 }}>
            Conversaciones
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {conversaciones.length === 0 ? (
              <Vacio icon={<Inbox size={26} />} titulo="Sin conversaciones" texto="Aquí aparecerán los restaurantes que escriban a soporte." />
            ) : conversaciones.map(c => {
              const activa = selected?.establecimiento_id === c.establecimiento_id
              const fgMute = activa ? colors.onTerracottaSoft : colors.stone
              return (
                <button
                  key={c.establecimiento_id}
                  onClick={() => selectConv(c)}
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
                      {nombreDe(c)}
                    </span>
                    {c.sinLeer > 0 && <Chip tono="terracotta">{c.sinLeer}</Chip>}
                  </div>
                  <div style={{ ...type.label, color: fgMute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.ultimo}
                  </div>
                  <div style={{ ...type.caption, color: fgMute, marginTop: 3 }}>
                    {fmtRel(c.fecha)}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Hilo */}
        <Card className="soporte-chat" pad={0} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {selected ? (
            <>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, background: colors.elev2 }}>
                <div style={{ ...type.h3, color: colors.ink }}>{nombreDe(selected)}</div>
                <div style={{ ...type.caption, color: colors.stone, marginTop: 2 }}>Restaurante</div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 16, background: colors.cream }}>
                {mensajes.length === 0 ? (
                  <Vacio icon={<MessageSquare size={26} />} titulo="Sin mensajes" texto="Escribe el primero desde la caja de abajo." />
                ) : mensajes.map(m => {
                  const mio = m.de === 'soporte'
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
                        {m.texto}
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

              <form onSubmit={enviar} style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${colors.border}` }}>
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  placeholder="Escribe un mensaje…"
                  aria-label="Mensaje para el restaurante"
                  style={{ ...ds.formInput, flex: 1 }}
                />
                <GlossyBtn accent type="submit" style={{ flexShrink: 0 }}>
                  <Send size={15} /> Enviar
                </GlossyBtn>
              </form>
            </>
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
              <Vacio
                icon={<MessageSquare size={28} />}
                titulo="Elige una conversación"
                texto="Selecciona un restaurante de la izquierda para ver el hilo y responder."
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
