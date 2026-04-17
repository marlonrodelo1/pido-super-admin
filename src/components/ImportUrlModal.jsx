import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Link2, CheckCircle, AlertCircle, X, Search, Upload, Store } from 'lucide-react'
import { toast, confirmar } from '../App'

export default function ImportUrlModal({ establecimiento, onClose, onComplete }) {
  const [step, setStep] = useState('idle') // idle | analyzing | preview | importing | done
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function invoke(action) {
    const { data, error } = await supabase.functions.invoke('import-menu-from-url', {
      body: { url: url.trim(), establecimiento_id: establecimiento.id, action },
    })
    if (error) throw new Error(error.message || 'Error de red')
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function analizar() {
    if (!url.trim()) return toast('Pega la URL primero', 'error')
    setStep('analyzing'); setError(null)
    try {
      const data = await invoke('preview')
      setPreview(data)
      setStep('preview')
    } catch (e) {
      setError(e.message)
      setStep('idle')
      toast(e.message, 'error')
    }
  }

  async function importar() {
    const existentes = await supabase
      .from('productos').select('id', { count: 'exact', head: true })
      .eq('establecimiento_id', establecimiento.id)
    if ((existentes.count || 0) > 0) {
      const ok = await confirmar(`Este restaurante ya tiene ${existentes.count} productos. Se van a AÑADIR los nuevos encima (no se reemplaza). ¿Continuar?`)
      if (!ok) return
    }
    setStep('importing'); setError(null)
    try {
      const data = await invoke('import')
      setResult(data)
      setStep('done')
    } catch (e) {
      setError(e.message)
      setStep('preview')
      toast(e.message, 'error')
    }
  }

  function handleClose() {
    if (step === 'done' && result?.productos > 0) onComplete?.()
    onClose()
  }

  // ── idle ──
  if (step === 'idle') return (
    <div style={ds.modal} onClick={onClose}>
      <div style={{ ...ds.modalContent, maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={18} color="#FF6B2C" />
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#F5F5F5', margin: 0 }}>Importar desde URL</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 16, lineHeight: 1.6 }}>
          Pega la URL pública de la tienda y el sistema extrae categorías, productos, precios, imágenes y extras automáticamente.
        </p>

        <div style={{
          padding: '10px 12px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          fontSize: 11, color: '#4ADE80', lineHeight: 1.5,
        }}>
          <strong>Last.shop</strong> funciona al 100%. Glovo y Uber Eats próximamente (usa el CSV mientras tanto).
        </div>

        <label style={ds.label}>URL de la tienda</label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://nombre.last.shop/es/..."
          style={{ ...ds.formInput, fontFamily: 'monospace', fontSize: 12 }}
          onKeyDown={e => { if (e.key === 'Enter') analizar() }}
        />

        {error && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#F87171', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={ds.secondaryBtn}>Cancelar</button>
          <button onClick={analizar} disabled={!url.trim()} style={{
            ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6,
            opacity: !url.trim() ? 0.5 : 1,
          }}>
            <Search size={13} /> Analizar
          </button>
        </div>
      </div>
    </div>
  )

  // ── analyzing ──
  if (step === 'analyzing') return (
    <div style={ds.modal}>
      <div style={{ ...ds.modalContent, maxWidth: 400, textAlign: 'center', padding: 28 }}>
        <Link2 size={32} color="#FF6B2C" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 6 }}>Analizando tienda…</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Descargando catálogo y extras desde el servidor.</div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 18 }}>
          <div style={{ height: '100%', width: '40%', background: '#FF6B2C', animation: 'slideIn 1.5s ease-in-out infinite' }} />
        </div>
      </div>
    </div>
  )

  // ── preview ──
  if (step === 'preview' && preview) return (
    <div style={ds.modal} onClick={() => setStep('idle')}>
      <div style={{ ...ds.modalContent, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Store size={18} color="#FF6B2C" />
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#F5F5F5', margin: 0 }}>Vista previa</h2>
          </div>
          <button onClick={() => setStep('idle')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        {preview.shop_name && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>
            Tienda detectada: <strong style={{ color: '#F5F5F5' }}>{preview.shop_name}</strong>
            <span style={{ ...ds.badge, background: 'rgba(255,107,44,0.15)', color: '#FF6B2C', marginLeft: 10, textTransform: 'uppercase' }}>
              {preview.plataforma}
            </span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
          <Stat label="Categorías" value={preview.stats.categorias} color="#FF6B2C" />
          <Stat label="Productos" value={preview.stats.productos} color="#4ADE80" />
          <Stat label="Con imagen" value={preview.stats.productos_con_imagen} color="#60A5FA" />
          <Stat label="Grupos extras" value={preview.stats.grupos_extras} color="#C084FC" />
          <Stat label="Opciones" value={preview.stats.opciones_extras} color="#FBBF24" />
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', fontWeight: 700 }}>
          Primeros productos
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
          {preview.sample_productos.map((p, i) => (
            <div key={i} style={{ display: 'flex', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 12, color: '#F5F5F5', fontWeight: 600 }}>{p.nombre}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flex: 1 }}>{p.categoria}</span>
              {p.tiene_imagen && <span style={{ fontSize: 10, color: '#60A5FA' }}>🖼</span>}
              <span style={{ fontSize: 12, color: '#4ADE80', fontWeight: 700, minWidth: 55, textAlign: 'right' }}>{p.precio.toFixed(2)} €</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setStep('idle')} style={ds.secondaryBtn}>Volver</button>
          <button onClick={importar} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={13} /> Importar {preview.stats.productos} productos
          </button>
        </div>
      </div>
    </div>
  )

  // ── importing ──
  if (step === 'importing') return (
    <div style={ds.modal}>
      <div style={{ ...ds.modalContent, maxWidth: 400, textAlign: 'center', padding: 28 }}>
        <Upload size={32} color="#FF6B2C" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 6 }}>Importando…</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Creando categorías, productos y extras en la base de datos.</div>
        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 18 }}>
          <div style={{ height: '100%', width: '40%', background: '#FF6B2C', animation: 'slideIn 1.5s ease-in-out infinite' }} />
        </div>
      </div>
    </div>
  )

  // ── done ──
  if (step === 'done' && result) return (
    <div style={ds.modal}>
      <div style={{ ...ds.modalContent, maxWidth: 420, textAlign: 'center', padding: 28 }}>
        <CheckCircle size={40} color="#22C55E" style={{ marginBottom: 12 }} />
        <h2 style={{ fontSize: 17, fontWeight: 800, color: '#F5F5F5', margin: '0 0 16px' }}>Importación completa</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
          <ResultLine label="Categorías creadas" value={result.categorias} />
          <ResultLine label="Productos creados" value={result.productos} />
          <ResultLine label="Grupos de extras" value={result.grupos_extras} />
          <ResultLine label="Opciones de extras" value={result.opciones_extras} />
          <ResultLine label="Vínculos producto-extra" value={result.vinculos} />
        </div>

        <button onClick={handleClose} style={{ ...ds.primaryBtn, width: '100%', marginTop: 20 }}>Cerrar</button>
      </div>
    </div>
  )

  return null
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
    </div>
  )
}

function ResultLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#FF6B2C' }}>{value}</span>
    </div>
  )
}
