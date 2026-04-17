import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/upload'
import { ds } from '../lib/darkStyles'
import { Plus, X, Upload, Save, Trash2 } from 'lucide-react'
import { toast, confirmar } from '../App'
import CargaMasivaModal from '../components/CargaMasivaModal'
import ImportUrlModal from '../components/ImportUrlModal'
import RidersCard from '../components/RidersCard'

const CATEGORIAS_PADRE = ['comida', 'farmacia', 'marketplace']

export default function Establecimientos() {
  const [items, setItems] = useState([])
  const [buscar, setBuscar] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [detalle, setDetalle] = useState(null)
  const [editando, setEditando] = useState(false)
  const [showCrear, setShowCrear] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [catsGenerales, setCatsGenerales] = useState([])
  const [estCats, setEstCats] = useState([])
  const [form, setForm] = useState({})
  const [catForm, setCatForm] = useState({ nombre: '', orden: 0 })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  // Productos y extras
  const [productos, setProductos] = useState([])
  const [gruposExtras, setGruposExtras] = useState([])
  const [editProd, setEditProd] = useState(null)
  const [prodForm, setProdForm] = useState({ nombre: '', descripcion: '', precio: '', categoria_id: '', imagen_url: '' })
  const [prodExtras, setProdExtras] = useState([])
  const [savingProd, setSavingProd] = useState(false)
  const [resenas, setResenas] = useState([])
  const [showCargaMasiva, setShowCargaMasiva] = useState(false)
  const [showImportUrl, setShowImportUrl] = useState(false)
  const logoRef = useRef()
  const bannerRef = useRef()
  const prodImgRef = useRef()

  useEffect(() => { load(); loadCatsGenerales() }, [])

  async function load() {
    const { data } = await supabase.from('establecimientos').select('*').order('created_at', { ascending: false })
    setItems(data || [])
  }

  async function loadCatsGenerales() {
    const { data } = await supabase.from('categorias_generales').select('*').order('orden')
    setCatsGenerales(data || [])
  }

  async function loadCategorias(estId) {
    const { data } = await supabase.from('categorias').select('*').eq('establecimiento_id', estId).order('orden')
    setCategorias(data || [])
  }

  async function loadEstCats(estId) {
    const { data } = await supabase.from('establecimiento_categorias').select('categoria_id').eq('establecimiento_id', estId)
    setEstCats((data || []).map(d => d.categoria_id))
  }

  async function toggleActivo(id, activo) {
    await supabase.from('establecimientos').update({ activo: !activo }).eq('id', id)
    load()
  }

  function initForm(est) {
    return {
      nombre: est?.nombre || '', tipo: est?.tipo || 'restaurante', categoria_padre: est?.categoria_padre || 'comida',
      email: est?.email || '', telefono: est?.telefono || '', direccion: est?.direccion || '',
      radio_cobertura_km: est?.radio_cobertura_km || 5, descripcion: est?.descripcion || '',
      banner_url: est?.banner_url || '', logo_url: est?.logo_url || '',
    }
  }

  async function guardarEstablecimiento() {
    setSaving(true)
    if (detalle) {
      const { error } = await supabase.from('establecimientos').update(form).eq('id', detalle.id)
      if (error) { toast('Error: ' + error.message, 'error'); setSaving(false); return }
      setDetalle({ ...detalle, ...form })
      setEditando(false)
    } else {
      const { error } = await supabase.from('establecimientos').insert({ ...form, activo: true, rating: 0, total_resenas: 0 })
      if (error) { toast('Error: ' + error.message, 'error'); setSaving(false); return }
      setShowCrear(false)
    }
    setForm({})
    load()
    setSaving(false)
  }

  async function handleUpload(file, field) {
    if (!file) return
    setUploading(field)
    try {
      const bucket = field === 'logo_url' ? 'logos' : 'banners'
      const url = await uploadImage(file, bucket, 'establecimientos')
      setForm(prev => ({ ...prev, [field]: url }))
      if (detalle) {
        await supabase.from('establecimientos').update({ [field]: url }).eq('id', detalle.id)
        setDetalle(prev => ({ ...prev, [field]: url }))
      }
    } catch (e) { toast(e.message, 'error') }
    setUploading(null)
  }

  async function agregarCategoria() {
    if (!catForm.nombre.trim()) return
    await supabase.from('categorias').insert({ establecimiento_id: detalle.id, nombre: catForm.nombre.trim(), orden: catForm.orden, activa: true })
    setCatForm({ nombre: '', orden: 0 })
    loadCategorias(detalle.id)
  }

  async function eliminarCategoria(id) {
    await supabase.from('categorias').delete().eq('id', id)
    loadCategorias(detalle.id)
  }

  async function toggleCatGeneral(catId) {
    if (estCats.includes(catId)) {
      await supabase.from('establecimiento_categorias').delete().eq('establecimiento_id', detalle.id).eq('categoria_id', catId)
      setEstCats(prev => prev.filter(c => c !== catId))
    } else {
      await supabase.from('establecimiento_categorias').insert({ establecimiento_id: detalle.id, categoria_id: catId })
      setEstCats(prev => [...prev, catId])
    }
  }

  // --- Productos ---
  async function loadResenas(estId) {
    const { data } = await supabase.from('resenas').select('*, usuarios(nombre, email)').eq('establecimiento_id', estId).order('created_at', { ascending: false }).limit(20)
    setResenas(data || [])
  }

  async function eliminarResena(id, estId) {
    if (!(await confirmar('¿Eliminar esta resena?'))) return
    await supabase.from('resenas').delete().eq('id', id)
    loadResenas(estId)
  }

  async function loadProductos(estId) {
    const [prodRes, grpRes] = await Promise.all([
      supabase.from('productos').select('*').eq('establecimiento_id', estId).order('orden'),
      supabase.from('grupos_extras').select('*, extras_opciones(*)').eq('establecimiento_id', estId),
    ])
    setProductos(prodRes.data || [])
    setGruposExtras(grpRes.data || [])
  }

  async function abrirEditarProd(p) {
    setProdForm({ nombre: p.nombre, descripcion: p.descripcion || '', precio: p.precio, categoria_id: p.categoria_id || '', imagen_url: p.imagen_url || '' })
    const { data } = await supabase.from('producto_extras').select('grupo_id').eq('producto_id', p.id)
    setProdExtras((data || []).map(d => d.grupo_id))
    setEditProd(p)
  }

  async function guardarProd() {
    if (!prodForm.nombre.trim() || !prodForm.precio) return
    setSavingProd(true)
    const data = { nombre: prodForm.nombre.trim(), descripcion: prodForm.descripcion.trim() || null, precio: Number(prodForm.precio), categoria_id: prodForm.categoria_id || null, imagen_url: prodForm.imagen_url || null, establecimiento_id: detalle.id, disponible: true, orden: productos.length }
    let prodId
    if (editProd) {
      await supabase.from('productos').update(data).eq('id', editProd.id)
      prodId = editProd.id
    } else {
      const { data: nuevo } = await supabase.from('productos').insert(data).select().single()
      prodId = nuevo?.id
    }
    if (prodId) {
      await supabase.from('producto_extras').delete().eq('producto_id', prodId)
      if (prodExtras.length > 0) await supabase.from('producto_extras').insert(prodExtras.map(gid => ({ producto_id: prodId, grupo_id: gid })))
    }
    setSavingProd(false)
    setEditProd(null)
    setProdForm({ nombre: '', descripcion: '', precio: '', categoria_id: '', imagen_url: '' })
    setProdExtras([])
    loadProductos(detalle.id)
  }

  async function eliminarProd(id) {
    if (!(await confirmar('¿Eliminar este producto?'))) return
    await supabase.from('productos').delete().eq('id', id)
    loadProductos(detalle.id)
  }

  async function toggleDisponible(id, current) {
    await supabase.from('productos').update({ disponible: !current }).eq('id', id)
    loadProductos(detalle.id)
  }

  async function handleProdImage(file) {
    if (!file) return
    const bucket = 'productos'
    const url = await uploadImage(file, bucket, detalle.id)
    setProdForm(prev => ({ ...prev, imagen_url: url }))
  }

  const filtrados = items.filter(e => {
    if (filtroTipo !== 'todos' && e.categoria_padre !== filtroTipo) return false
    if (buscar && !e.nombre.toLowerCase().includes(buscar.toLowerCase())) return false
    return true
  })

  // --- DETALLE ---
  if (detalle) {
    return (
      <div>
        <button onClick={() => { setDetalle(null); setEditando(false) }} style={ds.backBtn}>← Volver</button>

        <div style={{ ...ds.card, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 60, height: 60, borderRadius: 14, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
              onClick={() => logoRef.current?.click()}>
              {(form.logo_url || detalle.logo_url) ? <img src={form.logo_url || detalle.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍽️'}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                <Upload size={16} color="#fff" />
              </div>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'logo_url')} />
            </div>
            <div style={{ flex: 1 }}>
              {editando ? (
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={{ ...ds.formInput, fontSize: 18, fontWeight: 800 }} />
              ) : (
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5' }}>{detalle.nombre}</h2>
              )}
              <div style={{ fontSize: 12, ...ds.muted }}>{detalle.tipo} · {detalle.categoria_padre}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!editando ? (
                <button onClick={() => { setForm(initForm(detalle)); setEditando(true) }} style={ds.primaryBtn}>Editar</button>
              ) : (
                <>
                  <button onClick={guardarEstablecimiento} disabled={saving} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditando(false)} style={ds.secondaryBtn}>Cancelar</button>
                </>
              )}
            </div>
          </div>

          {/* Banner upload */}
          <div style={{ height: 120, borderRadius: 12, marginBottom: 16, overflow: 'hidden', cursor: 'pointer', position: 'relative',
            background: (form.banner_url || detalle.banner_url) ? `url(${form.banner_url || detalle.banner_url}) center/cover` : 'rgba(255,255,255,0.06)',
          }} onClick={() => bannerRef.current?.click()}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0, transition: '0.2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <Upload size={16} color="#fff" /><span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{uploading === 'banner_url' ? 'Subiendo...' : 'Cambiar banner (800x300 px)'}</span>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'banner_url')} />
          </div>

          {editando ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={ds.label}>Tipo</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={ds.select}>
                <option value="restaurante">Restaurante</option><option value="cafeteria">Cafetería</option><option value="panaderia">Panadería</option>
                <option value="supermercado">Supermercado</option><option value="farmacia">Farmacia</option><option value="tienda">Tienda</option>
              </select></div>
              <div><label style={ds.label}>Categoría padre</label><select value={form.categoria_padre} onChange={e => setForm({ ...form, categoria_padre: e.target.value })} style={ds.select}>
                {CATEGORIAS_PADRE.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
              <div><label style={ds.label}>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Dirección</label><input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Radio (km)</label><input type="number" value={form.radio_cobertura_km} onChange={e => setForm({ ...form, radio_cobertura_km: +e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Descripción</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} style={{ ...ds.formInput, resize: 'vertical' }} /></div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: '#F5F5F5' }}>
              <div><span style={ds.muted}>Email:</span> {detalle.email || '-'}</div>
              <div><span style={ds.muted}>Telefono:</span> {detalle.telefono || '-'}</div>
              <div><span style={ds.muted}>Direccion:</span> {detalle.direccion || '-'}</div>
              <div><span style={ds.muted}>Radio:</span> {detalle.radio_cobertura_km} km</div>
              <div><span style={ds.muted}>Rating:</span> {detalle.rating?.toFixed(1)} ({detalle.total_resenas} reseñas)</div>
              <div><span style={ds.muted}>Creado:</span> {new Date(detalle.created_at).toLocaleDateString('es-ES')}</div>
            </div>
          )}
        </div>

        {/* Repartidores vinculados */}
        <RidersCard
          establecimiento={detalle}
          onChanged={() => load()}
        />

        {/* Categorías generales */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 10 }}>Categorías generales</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {catsGenerales.map(c => {
              const sel = estCats.includes(c.id)
              return (
                <button key={c.id} onClick={() => toggleCatGeneral(c.id)} style={{
                  padding: '8px 14px', borderRadius: 10, border: sel ? '2px solid #FF6B2C' : '1px solid rgba(255,255,255,0.1)',
                  background: sel ? 'rgba(255,107,44,0.15)' : 'rgba(255,255,255,0.04)',
                  color: sel ? '#FF6B2C' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {c.emoji} {c.nombre}
                </button>
              )
            })}
          </div>
        </div>

        {/* Categorías de la carta */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 10 }}>Categorías de la carta</h3>
          {categorias.map(c => (
            <div key={c.id} style={{ ...ds.card, padding: '10px 16px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#F5F5F5' }}>{c.nombre}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, ...ds.muted }}>Orden: {c.orden}</span>
                <button onClick={() => eliminarCategoria(c.id)} style={{ ...ds.actionBtn, color: '#EF4444' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={catForm.nombre} onChange={e => setCatForm({ ...catForm, nombre: e.target.value })} placeholder="Nueva categoría..." style={{ ...ds.formInput, flex: 1 }} />
            <input type="number" value={catForm.orden} onChange={e => setCatForm({ ...catForm, orden: +e.target.value })} style={{ ...ds.formInput, width: 70 }} placeholder="Ord" />
            <button onClick={agregarCategoria} style={ds.primaryBtn}>Añadir</button>
          </div>
        </div>

        {/* Productos */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5' }}>Productos ({productos.length})</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setShowImportUrl(true)} style={{ ...ds.secondaryBtn, fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>🔗 Importar URL</button>
              <button onClick={() => setShowCargaMasiva(true)} style={{ ...ds.secondaryBtn, fontSize: 11, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}><Upload size={12} /> Carga masiva</button>
              <button onClick={() => { setEditProd('new'); setProdForm({ nombre: '', descripcion: '', precio: '', categoria_id: '', imagen_url: '' }); setProdExtras([]) }} style={{ ...ds.primaryBtn, fontSize: 11, padding: '6px 12px' }}>+ Producto</button>
            </div>
          </div>

          {productos.map(p => (
            <div key={p.id} style={{ ...ds.card, padding: '10px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, opacity: p.disponible ? 1 : 0.4 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                {p.imagen_url ? <img src={p.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{p.nombre}</div>
                {p.descripcion && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.descripcion}</div>}
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#FF6B2C', minWidth: 60, textAlign: 'right' }}>{p.precio.toFixed(2)} €</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggleDisponible(p.id, p.disponible)} style={{ ...ds.actionBtn, color: p.disponible ? '#22C55E' : '#EF4444', fontSize: 10 }}>{p.disponible ? 'On' : 'Off'}</button>
                <button onClick={() => abrirEditarProd(p)} style={{ ...ds.actionBtn, fontSize: 10 }}>Editar</button>
                <button onClick={() => eliminarProd(p.id)} style={{ ...ds.actionBtn, color: '#EF4444', fontSize: 10 }}>×</button>
              </div>
            </div>
          ))}
          {productos.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Sin productos</div>}
        </div>

        {/* Extras */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 10 }}>Grupos de extras ({gruposExtras.length})</h3>
          {gruposExtras.map(g => (
            <div key={g.id} style={{ ...ds.card, padding: '10px 16px', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{g.nombre} <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>· {g.tipo === 'single' ? 'Elige 1' : `Máx. ${g.max_selecciones}`}</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {(g.extras_opciones || []).map(o => (
                  <span key={o.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>{o.nombre} +{o.precio.toFixed(2)}€</span>
                ))}
              </div>
            </div>
          ))}
          {gruposExtras.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Sin extras</div>}
        </div>

        {/* Reseñas */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#F5F5F5', marginBottom: 10 }}>Reseñas ({resenas.length})</h3>
          {resenas.map(r => (
            <div key={r.id} style={{ ...ds.card, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#F5F5F5' }}>{r.usuarios?.nombre || 'Usuario'}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{r.usuarios?.email}</span>
                  <div style={{ display: 'flex', gap: 1 }}>
                    {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= r.rating ? '#FBBF24' : 'rgba(255,255,255,0.15)', fontSize: 12 }}>★</span>)}
                  </div>
                </div>
                {r.texto && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{r.texto}</div>}
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('es-ES')}</div>
              </div>
              <button onClick={() => eliminarResena(r.id, detalle.id)} style={{ ...ds.actionBtn, color: '#EF4444', fontSize: 10, flexShrink: 0 }}>Eliminar</button>
            </div>
          ))}
          {resenas.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Sin reseñas</div>}
        </div>

        {/* Modal carga masiva */}
        {showCargaMasiva && (
          <CargaMasivaModal
            establecimiento={detalle}
            categorias={categorias}
            onClose={() => setShowCargaMasiva(false)}
            onComplete={() => { loadProductos(detalle.id); loadCategorias(detalle.id) }}
          />
        )}

        {/* Modal importar desde URL (last.shop) */}
        {showImportUrl && (
          <ImportUrlModal
            establecimiento={detalle}
            onClose={() => setShowImportUrl(false)}
            onComplete={() => { loadProductos(detalle.id); loadCategorias(detalle.id) }}
          />
        )}

        {/* Modal editar/crear producto */}
        {editProd && (
          <div style={ds.modal} onClick={() => setEditProd(null)}>
            <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F5F5F5' }}>{editProd === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2>
                <button onClick={() => setEditProd(null)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#F5F5F5" /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Nombre *</label><input value={prodForm.nombre} onChange={e => setProdForm({ ...prodForm, nombre: e.target.value })} style={ds.formInput} /></div>
                <div><label style={ds.label}>Precio (€) *</label><input type="number" step="0.01" value={prodForm.precio} onChange={e => setProdForm({ ...prodForm, precio: e.target.value })} style={ds.formInput} /></div>
                <div><label style={ds.label}>Categoría</label>
                  <select value={prodForm.categoria_id} onChange={e => setProdForm({ ...prodForm, categoria_id: e.target.value })} style={ds.select}>
                    <option value="">Sin categoría</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Descripción</label><textarea value={prodForm.descripcion} onChange={e => setProdForm({ ...prodForm, descripcion: e.target.value })} rows={2} style={{ ...ds.formInput, resize: 'vertical' }} /></div>
                <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Imagen</label>
                  <label style={{ ...ds.formInput, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <Upload size={14} /> {prodForm.imagen_url ? 'Imagen subida ✓' : 'Subir imagen'}
                    <input type="file" accept="image/*" hidden onChange={e => handleProdImage(e.target.files[0])} />
                  </label>
                  {prodForm.imagen_url && <img src={prodForm.imagen_url} alt="" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', marginTop: 8 }} />}
                </div>
              </div>

              {/* Extras asignados */}
              {gruposExtras.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <label style={ds.label}>Grupos de extras</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {gruposExtras.map(g => {
                      const sel = prodExtras.includes(g.id)
                      return (
                        <button key={g.id} onClick={() => setProdExtras(prev => sel ? prev.filter(id => id !== g.id) : [...prev, g.id])} style={{
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                          border: sel ? '2px solid #FF6B2C' : '1px solid rgba(255,255,255,0.1)',
                          background: sel ? 'rgba(255,107,44,0.15)' : 'rgba(255,255,255,0.04)',
                          color: sel ? '#FF6B2C' : 'rgba(255,255,255,0.5)',
                        }}>
                          {sel && '✓ '}{g.nombre}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setEditProd(null)} style={ds.secondaryBtn}>Cancelar</button>
                <button onClick={guardarProd} disabled={savingProd || !prodForm.nombre?.trim() || !prodForm.precio} style={{ ...ds.primaryBtn, opacity: savingProd || !prodForm.nombre?.trim() ? 0.5 : 1 }}>
                  {savingProd ? 'Guardando...' : editProd === 'new' ? 'Crear' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- LISTA ---
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={ds.h1}>Establecimientos</h1>
        <button onClick={() => { setForm(initForm()); setShowCrear(true) }} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Crear
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar..." value={buscar} onChange={e => setBuscar(e.target.value)} style={ds.input} />
        <div style={{ display: 'flex', gap: 4 }}>
          {['todos', ...CATEGORIAS_PADRE].map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)} style={{ ...ds.filterBtn, background: filtroTipo === t ? '#FF6B2C' : 'rgba(255,255,255,0.08)', color: filtroTipo === t ? '#fff' : 'rgba(255,255,255,0.5)' }}>
              {t === 'todos' ? 'Todos' : t === 'comida' ? '🍕 Comida' : t === 'farmacia' ? '💊 Farmacia' : '🛒 Market'}
            </button>
          ))}
        </div>
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 44 }}></span><span style={{ flex: 1 }}>Nombre</span><span style={{ width: 100 }}>Categoría</span>
          <span style={{ width: 60 }}>Rating</span><span style={{ width: 80 }}>Estado</span><span style={{ width: 120 }}>Acciones</span>
        </div>
        {filtrados.map(e => (
          <div key={e.id} style={ds.tableRow}>
            <span style={{ width: 44 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden' }}>
                {e.logo_url ? <img src={e.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍽️'}
              </div>
            </span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#F5F5F5' }} onClick={() => { setDetalle(e); loadCategorias(e.id); loadEstCats(e.id); loadProductos(e.id); loadResenas(e.id) }}>{e.nombre}</span>
            <span style={{ width: 100 }}>
              <span style={{ ...ds.badge, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                {e.categoria_padre === 'comida' ? '🍕' : e.categoria_padre === 'farmacia' ? '💊' : '🛒'} {e.categoria_padre}
              </span>
            </span>
            <span style={{ width: 60, fontSize: 12, color: '#F5F5F5' }}>{e.rating?.toFixed(1)}</span>
            <span style={{ width: 80 }}>
              <span style={{ ...ds.badge, background: e.activo ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: e.activo ? '#22C55E' : '#EF4444' }}>{e.activo ? 'Activo' : 'Inactivo'}</span>
            </span>
            <span style={{ width: 120, display: 'flex', gap: 6 }}>
              <button onClick={() => { setDetalle(e); loadCategorias(e.id); loadEstCats(e.id); loadProductos(e.id); loadResenas(e.id) }} style={ds.actionBtn}>Editar</button>
              <button onClick={() => toggleActivo(e.id, e.activo)} style={{ ...ds.actionBtn, color: e.activo ? '#EF4444' : '#22C55E' }}>
                {e.activo ? 'Off' : 'On'}
              </button>
            </span>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 32, textAlign: 'center', ...ds.muted, fontSize: 13 }}>Sin establecimientos</div>}
      </div>

      {/* Modal crear */}
      {showCrear && (
        <div style={ds.modal} onClick={() => setShowCrear(false)}>
          <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#F5F5F5' }}>Crear establecimiento</h2>
              <button onClick={() => setShowCrear(false)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#F5F5F5" /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Nombre *</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Tipo</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} style={ds.select}>
                <option value="restaurante">Restaurante</option><option value="cafeteria">Cafetería</option><option value="supermercado">Supermercado</option><option value="farmacia">Farmacia</option><option value="tienda">Tienda</option>
              </select></div>
              <div><label style={ds.label}>Categoría padre</label><select value={form.categoria_padre} onChange={e => setForm({ ...form, categoria_padre: e.target.value })} style={ds.select}>
                {CATEGORIAS_PADRE.map(c => <option key={c} value={c}>{c === 'comida' ? '🍕 Comida' : c === 'farmacia' ? '💊 Farmacia' : '🛒 Market'}</option>)}
              </select></div>
              <div><label style={ds.label}>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Dirección</label><input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Radio (km)</label><input type="number" value={form.radio_cobertura_km} onChange={e => setForm({ ...form, radio_cobertura_km: +e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Logo</label>
                <label style={{ ...ds.formInput, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Upload size={14} /> {form.logo_url ? 'Logo subido ✓' : 'Subir logo (200x200 px)'}
                  <input type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'logo_url')} />
                </label>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Banner</label>
                <label style={{ ...ds.formInput, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Upload size={14} /> {form.banner_url ? 'Banner subido ✓' : 'Subir banner (800x300 px)'}
                  <input type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'banner_url')} />
                </label>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Descripción</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} style={{ ...ds.formInput, resize: 'vertical' }} /></div>
              <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                Tras crear el restaurante, añade sus repartidores desde la ficha para activar Delivery.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowCrear(false)} style={ds.secondaryBtn}>Cancelar</button>
              <button onClick={guardarEstablecimiento} disabled={saving || !form.nombre?.trim()} style={{ ...ds.primaryBtn, opacity: saving || !form.nombre?.trim() ? 0.5 : 1 }}>
                {saving ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
