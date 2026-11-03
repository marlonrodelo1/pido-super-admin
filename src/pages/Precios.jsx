import { useEffect, useState } from 'react'
import { Tags, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, ds, type } from '../lib/darkStyles'
import { Card, GlossyBtn, MiniBtn, Toggle, Vacio, Chip, fmtEUR } from '../lib/ui'
import { MARCAS, mensajeBD } from '../lib/comercial'
import { toast, confirmar } from '../App'

// Catálogo de precios del módulo Comercial (3 nov 2026). Solo el superadmin.
// El precio es la BASE sin IGIC: en cada presupuesto sale como valor de partida
// y se puede cambiar línea a línea; el IGIC lo suma la BD.

const VACIO = { concepto: '', detalle: '', marca: 'rogotech', tipo: 'unico', precio_base: '', igic_pct: 7, activo: true, orden: 100 }

export default function Precios() {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('comercial_catalogo').select('*').order('orden').order('concepto')
    if (error) toast(mensajeBD(error), 'error')
    setFilas(data || [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  async function guardar() {
    const f = editando
    if (!f.concepto.trim()) return toast('Falta el concepto', 'error')
    if (f.precio_base === '' || Number(f.precio_base) < 0) return toast('Falta el precio', 'error')
    setGuardando(true)
    const datos = {
      concepto: f.concepto.trim(), detalle: f.detalle?.trim() || null, marca: f.marca || null, tipo: f.tipo,
      precio_base: Number(f.precio_base), igic_pct: Number(f.igic_pct), activo: !!f.activo, orden: Number(f.orden) || 0,
    }
    const q = f.id
      ? supabase.from('comercial_catalogo').update(datos).eq('id', f.id).select('id')
      : supabase.from('comercial_catalogo').insert(datos).select('id')
    const { data, error } = await q
    setGuardando(false)
    if (error || !data?.length) return toast(error ? mensajeBD(error) : 'No se ha guardado (¿sin permiso?)', 'error')
    toast('Precio guardado')
    setEditando(null)
    cargar()
  }

  async function borrar(f) {
    if (!(await confirmar(`¿Borrar «${f.concepto}» del catálogo? Los presupuestos que ya lo usan no cambian.`))) return
    const { data, error } = await supabase.from('comercial_catalogo').delete().eq('id', f.id).select('id')
    if (error || !data?.length) return toast(error ? mensajeBD(error) : 'No se ha borrado', 'error')
    toast('Borrado')
    cargar()
  }

  async function alternar(f) {
    const { data, error } = await supabase.from('comercial_catalogo').update({ activo: !f.activo }).eq('id', f.id).select('activo')
    if (error || !data?.length) return toast(error ? mensajeBD(error) : 'No se ha cambiado', 'error')
    cargar()
  }

  const conIgic = (f) => Number(f.precio_base) * (1 + Number(f.igic_pct) / 100)

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Precios</h1>
          <p style={{ ...type.body, color: colors.textMute, maxWidth: 720 }}>
            Lo que se puede añadir a un presupuesto. El precio es la base sin IGIC; en cada presupuesto se puede cambiar.
            Edinson ve los activos pero no los cambia.
          </p>
        </div>
        <GlossyBtn onClick={() => setEditando({ ...VACIO })}><Plus size={16} /> Nuevo precio</GlossyBtn>
      </div>

      {cargando ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : filas.length === 0 ? (
        <Card pad={0}><Vacio icon={<Tags size={28} />} titulo="Sin precios" texto="Añade el primero con «Nuevo precio»." /></Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filas.map(f => (
            <Card key={f.id} pad={14} style={{ opacity: f.activo ? 1 : 0.6 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...type.label, fontWeight: 700, color: colors.ink }}>{f.concepto}</span>
                    <Chip tono={f.marca === 'pidoo' ? 'terracotta' : f.marca === 'rogotech' ? 'info' : 'neutral'}>
                      {f.marca ? MARCAS.find(m => m.value === f.marca)?.label : 'Las dos marcas'}
                    </Chip>
                    <Chip>{f.tipo === 'mensual' ? 'Cada mes' : 'Una vez'}</Chip>
                  </div>
                  {f.detalle && <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, marginTop: 4 }}>{f.detalle}</div>}
                </div>
                <div style={{ textAlign: 'right', minWidth: 140 }}>
                  <div style={{ ...type.num, fontSize: 17 }}>{fmtEUR(f.precio_base)}{f.tipo === 'mensual' ? ' /mes' : ''}</div>
                  <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>{fmtEUR(conIgic(f))} con IGIC {Number(f.igic_pct)} %</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Toggle size="sm" on={f.activo} onChange={() => alternar(f)} aria-label={f.activo ? 'Desactivar' : 'Activar'} />
                  <MiniBtn onClick={() => setEditando({ ...f, detalle: f.detalle || '' })}>Editar</MiniBtn>
                  <MiniBtn danger onClick={() => borrar(f)} aria-label="Borrar"><Trash2 size={14} /></MiniBtn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editando && (
        <div style={ds.modal} onClick={() => !guardando && setEditando(null)}>
          <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
            <h2 style={{ ...ds.h2 }}>{editando.id ? 'Editar precio' : 'Nuevo precio'}</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <Campo etiqueta="Concepto">
                <input style={ds.formInput} value={editando.concepto} onChange={e => setEditando({ ...editando, concepto: e.target.value })} placeholder="Web a medida con tienda online" />
              </Campo>
              <Campo etiqueta="Detalle (sale debajo, en pequeño)">
                <textarea style={{ ...ds.formInput, height: 64, padding: 10, resize: 'vertical' }} value={editando.detalle} onChange={e => setEditando({ ...editando, detalle: e.target.value })} />
              </Campo>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <Campo etiqueta="Marca">
                  <select style={ds.select} value={editando.marca || ''} onChange={e => setEditando({ ...editando, marca: e.target.value || null })}>
                    {MARCAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    <option value="">Las dos</option>
                  </select>
                </Campo>
                <Campo etiqueta="Se cobra">
                  <select style={ds.select} value={editando.tipo} onChange={e => setEditando({ ...editando, tipo: e.target.value })}>
                    <option value="unico">Una vez</option>
                    <option value="mensual">Cada mes</option>
                  </select>
                </Campo>
                <Campo etiqueta="Precio sin IGIC (€)">
                  <input style={ds.formInput} type="number" min="0" step="0.01" inputMode="decimal" value={editando.precio_base} onChange={e => setEditando({ ...editando, precio_base: e.target.value })} />
                </Campo>
                <Campo etiqueta="IGIC %">
                  <input style={ds.formInput} type="number" min="0" max="20" step="0.5" value={editando.igic_pct} onChange={e => setEditando({ ...editando, igic_pct: e.target.value })} />
                </Campo>
                <Campo etiqueta="Orden">
                  <input style={ds.formInput} type="number" value={editando.orden} onChange={e => setEditando({ ...editando, orden: e.target.value })} />
                </Campo>
              </div>
              {editando.precio_base !== '' && (
                <div style={{ ...type.body, color: colors.stone }}>
                  Con IGIC: <b style={{ color: colors.ink }}>{fmtEUR(conIgic(editando))}</b>{editando.tipo === 'mensual' ? ' al mes' : ''}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={ds.secondaryBtn} onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
              <GlossyBtn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</GlossyBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Campo({ etiqueta, children, ayuda }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={ds.label}>{etiqueta}</span>
      {children}
      {ayuda && <span style={{ ...type.caption, letterSpacing: 0, color: colors.stone, display: 'block', marginTop: 4 }}>{ayuda}</span>}
    </label>
  )
}
