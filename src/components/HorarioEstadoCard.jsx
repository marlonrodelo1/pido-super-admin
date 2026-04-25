import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Clock, CheckCircle2, Pause, Play, Copy as CopyIcon, Trash2, Plus } from 'lucide-react'
import { toast, confirmar } from '../App'

const DIAS = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
]

function emptyHorario() {
  const obj = {}
  DIAS.forEach(d => { obj[d.key] = [] })
  return obj
}

export default function HorarioEstadoCard({ establecimiento, onChanged }) {
  const [horario, setHorario] = useState(() => establecimiento?.horario || emptyHorario())
  const [estado, setEstado] = useState(establecimiento?.estado || 'pendiente_verificacion')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setHorario(establecimiento?.horario || emptyHorario())
    setEstado(establecimiento?.estado || 'pendiente_verificacion')
    setDirty(false)
  }, [establecimiento?.id])

  function setSlot(dia, idx, campo, valor) {
    setHorario(prev => {
      const next = { ...prev }
      const slots = [...(next[dia] || [])]
      slots[idx] = { ...slots[idx], [campo]: valor }
      next[dia] = slots
      return next
    })
    setDirty(true)
  }

  function addSlot(dia) {
    setHorario(prev => {
      const next = { ...prev }
      next[dia] = [...(next[dia] || []), { abre: '09:00', cierra: '22:00' }]
      return next
    })
    setDirty(true)
  }

  function removeSlot(dia, idx) {
    setHorario(prev => {
      const next = { ...prev }
      next[dia] = (next[dia] || []).filter((_, i) => i !== idx)
      return next
    })
    setDirty(true)
  }

  function aplicarATodos() {
    const lunes = horario.lunes || []
    if (lunes.length === 0) return toast('Configura el lunes primero', 'error')
    const next = {}
    DIAS.forEach(d => { next[d.key] = JSON.parse(JSON.stringify(lunes)) })
    setHorario(next)
    setDirty(true)
    toast('Horario del lunes aplicado a toda la semana')
  }

  function aplicarPreset() {
    const slots = [{ abre: '09:00', cierra: '22:00' }]
    const next = {}
    DIAS.forEach(d => { next[d.key] = [...slots] })
    setHorario(next)
    setDirty(true)
    toast('Aplicado 09:00 - 22:00 toda la semana')
  }

  async function guardar() {
    setSaving(true)
    const { error } = await supabase.from('establecimientos')
      .update({ horario, estado })
      .eq('id', establecimiento.id)
    setSaving(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Horario y estado guardados')
    setDirty(false)
    onChanged?.()
  }

  async function cambiarEstado(nuevoEstado) {
    if (nuevoEstado === 'activo' && estado !== 'activo') {
      const ok = await confirmar('¿Activar el restaurante? Aparecerá visible en pidoo.es y podrá recibir pedidos.')
      if (!ok) return
    }
    setEstado(nuevoEstado)
    setSaving(true)
    const { error } = await supabase.from('establecimientos')
      .update({ estado: nuevoEstado })
      .eq('id', establecimiento.id)
    setSaving(false)
    if (error) {
      setEstado(establecimiento.estado)
      return toast('Error: ' + error.message, 'error')
    }
    toast(nuevoEstado === 'activo' ? 'Restaurante activado' : nuevoEstado === 'pausado' ? 'Restaurante pausado' : 'Estado actualizado')
    onChanged?.()
  }

  const estadoBadge = (() => {
    if (estado === 'activo') return { label: 'Activo', bg: 'var(--c-success-soft)', color: 'var(--c-success)' }
    if (estado === 'pausado') return { label: 'Pausado', bg: 'var(--c-warning-soft)', color: 'var(--c-warning)' }
    return { label: 'Pendiente verificación', bg: 'var(--c-warning-soft)', color: 'var(--c-warning)' }
  })()

  return (
    <div style={{ ...ds.card, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Clock size={18} color="#FF6B2C" />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', flex: 1, minWidth: 160 }}>Horario y estado</h3>
        <span style={{ ...ds.badge, background: estadoBadge.bg, color: estadoBadge.color }}>● {estadoBadge.label}</span>
      </div>

      {/* Acciones de estado */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {estado !== 'activo' && (
          <button
            onClick={() => cambiarEstado('activo')}
            disabled={saving}
            style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <CheckCircle2 size={14} /> Activar restaurante
          </button>
        )}
        {estado === 'activo' && (
          <button
            onClick={() => cambiarEstado('pausado')}
            disabled={saving}
            style={{ ...ds.secondaryBtn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <Pause size={14} /> Pausar
          </button>
        )}
        {estado === 'pausado' && (
          <button
            onClick={() => cambiarEstado('activo')}
            disabled={saving}
            style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <Play size={14} /> Reanudar
          </button>
        )}
      </div>

      {/* Editor horario */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={aplicarPreset} style={{ ...ds.secondaryBtn, fontSize: 12, padding: '6px 10px' }}>
          Preset 09:00 - 22:00 toda la semana
        </button>
        <button onClick={aplicarATodos} style={{ ...ds.secondaryBtn, fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CopyIcon size={12} /> Copiar lunes al resto
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {DIAS.map(d => {
          const slots = horario[d.key] || []
          const cerrado = slots.length === 0
          return (
            <div key={d.key} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', background: 'var(--c-surface2)', borderRadius: 10, flexWrap: 'wrap',
            }}>
              <div style={{ width: 90, fontSize: 13, fontWeight: 700, color: 'var(--c-text)', paddingTop: 6 }}>
                {d.label}
              </div>
              <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 6 }}>
                {cerrado ? (
                  <div style={{ fontSize: 12, color: 'var(--c-muted)', fontStyle: 'italic', paddingTop: 6 }}>Cerrado</div>
                ) : (
                  slots.map((slot, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        type="time"
                        value={slot.abre || ''}
                        onChange={e => setSlot(d.key, i, 'abre', e.target.value)}
                        style={{ ...ds.formInput, width: 110, padding: '6px 8px', fontSize: 13 }}
                      />
                      <span style={{ color: 'var(--c-muted)', fontSize: 13 }}>—</span>
                      <input
                        type="time"
                        value={slot.cierra || ''}
                        onChange={e => setSlot(d.key, i, 'cierra', e.target.value)}
                        style={{ ...ds.formInput, width: 110, padding: '6px 8px', fontSize: 13 }}
                      />
                      <button
                        onClick={() => removeSlot(d.key, i)}
                        aria-label="Quitar turno"
                        style={{ ...ds.actionBtn, color: 'var(--c-danger)', padding: '6px 8px' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => addSlot(d.key)}
                style={{ ...ds.secondaryBtn, fontSize: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={12} /> {cerrado ? 'Abrir' : 'Turno'}
              </button>
            </div>
          )
        })}
      </div>

      {dirty && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            onClick={() => { setHorario(establecimiento?.horario || emptyHorario()); setDirty(false) }}
            style={ds.secondaryBtn}
          >
            Descartar
          </button>
          <button onClick={guardar} disabled={saving} style={{ ...ds.primaryBtn, opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Guardando...' : 'Guardar horario'}
          </button>
        </div>
      )}
    </div>
  )
}
