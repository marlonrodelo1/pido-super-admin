import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'

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

  return (
    <div>
      <h1 style={{ ...ds.h1, marginBottom: 20 }}>Soporte</h1>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 160px)' }}>
        {/* Lista conversaciones */}
        <div style={styles.lista}>
          {conversaciones.map(c => (
            <button key={c.establecimiento_id} onClick={() => selectConv(c)} style={{
              ...styles.convItem,
              background: selected?.establecimiento_id === c.establecimiento_id ? 'rgba(255,107,44,0.12)' : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{c.establecimiento?.nombre || 'Restaurante'}</span>
                {c.sinLeer > 0 && <span style={styles.unread}>{c.sinLeer}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ultimo}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{new Date(c.fecha).toLocaleString('es-ES')}</div>
            </button>
          ))}
          {conversaciones.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin conversaciones</div>}
        </div>

        {/* Chat */}
        <div style={styles.chat}>
          {selected ? (
            <>
              <div style={styles.chatHeader}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#F5F5F5' }}>{selected.establecimiento?.nombre || 'Restaurante'}</span>
              </div>
              <div style={styles.chatMessages}>
                {mensajes.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.de === 'soporte' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: 14, fontSize: 13,
                      background: m.de === 'soporte' ? '#FF6B2C' : 'rgba(255,255,255,0.08)',
                      color: m.de === 'soporte' ? '#fff' : '#F5F5F5',
                      borderBottomRightRadius: m.de === 'soporte' ? 4 : 14,
                      borderBottomLeftRadius: m.de === 'soporte' ? 14 : 4,
                    }}>
                      {m.texto}
                      <div style={{ fontSize: 9, marginTop: 4, opacity: 0.6 }}>{new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={enviar} style={styles.chatInput}>
                <input
                  value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder="Escribe un mensaje..." style={styles.input}
                />
                <button type="submit" style={ds.primaryBtn}>Enviar</button>
              </form>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
              Selecciona una conversacion
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  lista: { width: 300, background: 'rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)' },
  convItem: { width: '100%', padding: '14px 16px', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'block' },
  unread: { width: 18, height: 18, borderRadius: 9, background: '#FF6B2C', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chat: { flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' },
  chatHeader: { padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 },
  chatMessages: { flex: 1, padding: 20, overflow: 'auto' },
  chatInput: { padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 },
  input: { flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none', background: 'rgba(255,255,255,0.06)', color: '#F5F5F5' },
}
