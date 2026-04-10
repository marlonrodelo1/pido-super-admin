import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { parseCSV, validateProducts, generateTemplate } from '../lib/csvUtils'
import { toast } from '../App'
import { Upload, Download, CheckCircle, AlertCircle, X, FileSpreadsheet } from 'lucide-react'

export default function CargaMasivaModal({ establecimiento, categorias, onClose, onComplete }) {
  const [step, setStep] = useState('idle') // idle | preview | uploading | done
  const [validRows, setValidRows] = useState([])
  const [errorRows, setErrorRows] = useState([])
  const [categoryMap, setCategoryMap] = useState({}) // nombre → { exists, id }
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState({ created: 0, catCreated: [], errors: [] })
  const fileRef = useRef()

  async function handleFile(file) {
    if (!file) return
    const { data, errors } = await parseCSV(file)
    if (errors.length > 0) {
      toast(errors[0], 'error')
      return
    }

    const { valid, errors: valErrors } = validateProducts(data)
    setValidRows(valid)
    setErrorRows(valErrors)

    // Resolve categories
    const catNames = [...new Set(valid.map(r => r.categoria).filter(Boolean))]
    const map = {}
    for (const name of catNames) {
      const existing = categorias.find(c => c.nombre.toLowerCase() === name.toLowerCase())
      map[name] = existing ? { exists: true, id: existing.id } : { exists: false, id: null }
    }
    setCategoryMap(map)
    setStep('preview')
  }

  async function handleBulkInsert() {
    setStep('uploading')
    const estId = establecimiento.id

    // 1. Create missing categories
    const newCats = []
    const resolvedMap = { ...categoryMap }
    for (const [name, info] of Object.entries(resolvedMap)) {
      if (!info.exists) {
        const { data, error } = await supabase
          .from('categorias')
          .insert({ establecimiento_id: estId, nombre: name, orden: 0, activa: true })
          .select('id')
          .single()
        if (data) {
          resolvedMap[name] = { exists: true, id: data.id }
          newCats.push(name)
        } else if (error) {
          toast(`Error creando categoria "${name}": ${error.message}`, 'error')
        }
      }
    }

    // 2. Get current max orden
    const { data: existing } = await supabase
      .from('productos')
      .select('orden')
      .eq('establecimiento_id', estId)
      .order('orden', { ascending: false })
      .limit(1)
    let maxOrden = existing?.[0]?.orden ?? -1

    // 3. Batch insert in chunks of 50
    const total = validRows.length
    setProgress({ current: 0, total })
    let created = 0
    const insertErrors = []
    const chunkSize = 50

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize).map((row, idx) => ({
        establecimiento_id: estId,
        nombre: row.nombre,
        descripcion: row.descripcion,
        precio: row.precio,
        categoria_id: row.categoria ? resolvedMap[row.categoria]?.id || null : null,
        imagen_url: row.imagen_url,
        disponible: row.disponible,
        orden: ++maxOrden,
      }))

      const { data, error } = await supabase.from('productos').insert(chunk).select('id')
      if (error) {
        insertErrors.push(`Lote ${Math.floor(i / chunkSize) + 1}: ${error.message}`)
      } else {
        created += data.length
      }
      setProgress({ current: Math.min(i + chunkSize, total), total })
    }

    setResults({ created, catCreated: newCats, errors: insertErrors })
    setStep('done')
  }

  function handleClose() {
    if (step === 'done' && results.created > 0) onComplete()
    onClose()
  }

  const newCatCount = Object.values(categoryMap).filter(c => !c.exists).length
  const existingCatCount = Object.values(categoryMap).filter(c => c.exists).length

  // ── idle ──
  if (step === 'idle') return (
    <div style={ds.modal} onClick={onClose}>
      <div style={{ ...ds.modalContent, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F5F5F5', margin: 0 }}>Carga masiva de productos</h2>
          <button onClick={onClose} style={{ ...ds.actionBtn, color: 'rgba(255,255,255,0.4)' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.6 }}>
          Sube un archivo CSV con los productos para <strong style={{ color: '#FF6B2C' }}>{establecimiento.nombre}</strong>. Las categorias que no existan se crearan automaticamente.
        </p>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
          style={{
            ...ds.card, padding: 40, textAlign: 'center', cursor: 'pointer',
            border: '2px dashed rgba(255,107,44,0.3)', borderRadius: 14,
            background: 'rgba(255,107,44,0.04)',
          }}
        >
          <FileSpreadsheet size={36} style={{ color: '#FF6B2C', marginBottom: 10 }} />
          <div style={{ fontWeight: 700, fontSize: 14, color: '#F5F5F5', marginBottom: 6 }}>Arrastra tu CSV aqui</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>o haz click para seleccionar (max 1MB)</div>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => handleFile(e.target.files[0])} />
        </div>

        <button onClick={generateTemplate} style={{ ...ds.secondaryBtn, fontSize: 11, padding: '8px 14px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
          <Download size={13} /> Descargar plantilla CSV
        </button>
      </div>
    </div>
  )

  // ── preview ──
  if (step === 'preview') return (
    <div style={ds.modal} onClick={() => setStep('idle')}>
      <div style={{ ...ds.modalContent, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F5F5F5', margin: 0 }}>Vista previa</h2>
          <button onClick={() => setStep('idle')} style={{ ...ds.actionBtn, color: 'rgba(255,255,255,0.4)' }}><X size={16} /></button>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <span style={{ ...ds.badge, background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
            <CheckCircle size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{validRows.length} validos
          </span>
          {errorRows.length > 0 && (
            <span style={{ ...ds.badge, background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
              <AlertCircle size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />{errorRows.length} con errores
            </span>
          )}
        </div>

        {/* Category resolution */}
        {Object.keys(categoryMap).length > 0 && (
          <div style={{ ...ds.card, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Categorias</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(categoryMap).map(([name, info]) => (
                <span key={name} style={{
                  ...ds.badge,
                  background: info.exists ? 'rgba(34,197,94,0.12)' : 'rgba(255,107,44,0.12)',
                  color: info.exists ? '#22C55E' : '#FF6B2C',
                }}>
                  {info.exists ? '✓' : '+ nueva'} {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ maxHeight: 360, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ ...ds.tableHeader, position: 'sticky', top: 0, background: '#1A1A1A', zIndex: 1 }}>
            <span style={{ width: 36 }}>#</span>
            <span style={{ flex: 2 }}>Nombre</span>
            <span style={{ width: 70, textAlign: 'right' }}>Precio</span>
            <span style={{ flex: 1 }}>Categoria</span>
            <span style={{ width: 60, textAlign: 'center' }}>Estado</span>
          </div>
          {validRows.map(r => (
            <div key={r._rowNum} style={ds.tableRow}>
              <span style={{ width: 36, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{r._rowNum}</span>
              <span style={{ flex: 2, fontSize: 12 }}>{r.nombre}</span>
              <span style={{ width: 70, textAlign: 'right', fontSize: 12, color: '#FF6B2C', fontWeight: 700 }}>{r.precio.toFixed(2)} €</span>
              <span style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.categoria || '—'}</span>
              <span style={{ width: 60, textAlign: 'center' }}><CheckCircle size={13} style={{ color: '#22C55E' }} /></span>
            </div>
          ))}
          {errorRows.map(r => (
            <div key={r.row} style={{ ...ds.tableRow, background: 'rgba(239,68,68,0.06)' }}>
              <span style={{ width: 36, fontSize: 10, color: '#EF4444' }}>{r.row}</span>
              <span style={{ flex: 2, fontSize: 12, color: '#EF4444' }}>{r.data.nombre || '(vacio)'}</span>
              <span style={{ width: 70, textAlign: 'right', fontSize: 12, color: '#EF4444' }}>{r.data.precio || '—'}</span>
              <span style={{ flex: 1, fontSize: 11, color: '#EF4444' }}>{r.messages.join(', ')}</span>
              <span style={{ width: 60, textAlign: 'center' }}><AlertCircle size={13} style={{ color: '#EF4444' }} /></span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={() => setStep('idle')} style={ds.secondaryBtn}>Cancelar</button>
          <button
            onClick={handleBulkInsert}
            disabled={validRows.length === 0}
            style={{ ...ds.primaryBtn, opacity: validRows.length === 0 ? 0.4 : 1 }}
          >
            <Upload size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Subir {validRows.length} producto{validRows.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )

  // ── uploading ──
  if (step === 'uploading') return (
    <div style={ds.modal}>
      <div style={{ ...ds.modalContent, maxWidth: 400, textAlign: 'center' }}>
        <FileSpreadsheet size={32} style={{ color: '#FF6B2C', marginBottom: 12 }} />
        <div style={{ fontWeight: 800, fontSize: 16, color: '#F5F5F5', marginBottom: 8 }}>Subiendo productos...</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
          Procesando {progress.current}/{progress.total}
        </div>
        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, background: '#FF6B2C',
            width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    </div>
  )

  // ── done ──
  return (
    <div style={ds.modal}>
      <div style={{ ...ds.modalContent, maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <CheckCircle size={40} style={{ color: '#22C55E', marginBottom: 10 }} />
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F5F5F5', margin: 0 }}>Carga completada</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.created > 0 && (
            <div style={{ ...ds.card, padding: '12px 16px', borderLeft: '3px solid #22C55E' }}>
              <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 700 }}>{results.created}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 6 }}>producto{results.created !== 1 ? 's' : ''} creado{results.created !== 1 ? 's' : ''}</span>
            </div>
          )}
          {results.catCreated.length > 0 && (
            <div style={{ ...ds.card, padding: '12px 16px', borderLeft: '3px solid #FF6B2C' }}>
              <span style={{ fontSize: 13, color: '#FF6B2C', fontWeight: 700 }}>{results.catCreated.length}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 6 }}>categoria{results.catCreated.length !== 1 ? 's' : ''} nueva{results.catCreated.length !== 1 ? 's' : ''}: </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{results.catCreated.join(', ')}</span>
            </div>
          )}
          {errorRows.length > 0 && (
            <div style={{ ...ds.card, padding: '12px 16px', borderLeft: '3px solid rgba(255,255,255,0.2)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{errorRows.length}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>fila{errorRows.length !== 1 ? 's' : ''} omitida{errorRows.length !== 1 ? 's' : ''} por errores</span>
            </div>
          )}
          {results.errors.length > 0 && (
            <div style={{ ...ds.card, padding: '12px 16px', borderLeft: '3px solid #EF4444' }}>
              <div style={{ fontSize: 13, color: '#EF4444', fontWeight: 700, marginBottom: 4 }}>Errores de insercion</div>
              {results.errors.map((err, i) => (
                <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{err}</div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleClose} style={{ ...ds.primaryBtn, width: '100%', marginTop: 20 }}>Cerrar</button>
      </div>
    </div>
  )
}
