import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/upload'
import { ds } from '../lib/darkStyles'
import { Plus, X, Upload, Save, Trash2, KeyRound, Search, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { toast, confirmar } from '../App'
import CargaMasivaModal from '../components/CargaMasivaModal'
import ImportUrlModal from '../components/ImportUrlModal'
import RidersCard from '../components/RidersCard'
import PlanTiendaCard from '../components/PlanTiendaCard'
import ResetPasswordModal from '../components/ResetPasswordModal'

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
  const [resetPwd, setResetPwd] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState(null)
  // Estado nuevo: dropdowns categorías + filtros productos
  const [showAddCatGeneral, setShowAddCatGeneral] = useState(false)
  const [selectedCartCatId, setSelectedCartCatId] = useState('') // categoría seleccionada en bloque "Categorías de la carta"
  const [showCatModal, setShowCatModal] = useState(false) // modal crear/editar categoría carta
  const [catModalForm, setCatModalForm] = useState({ id: null, nombre: '', orden: 0 })
  const [prodSearch, setProdSearch] = useState('')
  const [prodSearchDebounced, setProdSearchDebounced] = useState('')
  const [prodFiltroCatId, setProdFiltroCatId] = useState('all') // 'all' | 'none' | <id>
  const [prodPage, setProdPage] = useState(1)
  const [prodPageSize, setProdPageSize] = useState(10)

  // Debounce búsqueda productos (200ms)
  useEffect(() => {
    const t = setTimeout(() => setProdSearchDebounced(prodSearch), 200)
    return () => clearTimeout(t)
  }, [prodSearch])

  // Sincroniza filtro categoría productos con la categoría seleccionada arriba
  useEffect(() => {
    if (selectedCartCatId) setProdFiltroCatId(selectedCartCatId)
  }, [selectedCartCatId])

  // Reset página al cambiar filtros
  useEffect(() => { setProdPage(1) }, [prodSearchDebounced, prodFiltroCatId, prodPageSize])

  useEffect(() => {
    if (!detalle?.user_id) { setOwnerEmail(null); return }
    let cancelled = false
    supabase.from('usuarios').select('email').eq('id', detalle.user_id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setOwnerEmail(data?.email || null) })
    return () => { cancelled = true }
  }, [detalle?.user_id])
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

  async function eliminarCategoria(id) {
    if (!(await confirmar('¿Eliminar esta categoría? Los productos asignados quedarán sin categoría.'))) return
    await supabase.from('categorias').delete().eq('id', id)
    if (selectedCartCatId === id) setSelectedCartCatId('')
    loadCategorias(detalle.id)
  }

  function abrirCrearCategoriaModal() {
    setCatModalForm({ id: null, nombre: '', orden: categorias.length })
    setShowCatModal(true)
  }

  function abrirEditarCategoriaModal(c) {
    setCatModalForm({ id: c.id, nombre: c.nombre, orden: c.orden })
    setShowCatModal(true)
  }

  async function guardarCategoriaModal() {
    const nombre = catModalForm.nombre.trim()
    if (!nombre) return
    if (catModalForm.id) {
      await supabase.from('categorias').update({ nombre, orden: catModalForm.orden }).eq('id', catModalForm.id)
    } else {
      const { data } = await supabase.from('categorias').insert({ establecimiento_id: detalle.id, nombre, orden: catModalForm.orden, activa: true }).select().single()
      if (data?.id) setSelectedCartCatId(data.id)
    }
    setShowCatModal(false)
    setCatModalForm({ id: null, nombre: '', orden: 0 })
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

  // --- Memos productos (filtro + paginación) ---
  const productosFiltrados = useMemo(() => {
    const q = prodSearchDebounced.trim().toLowerCase()
    return productos.filter(p => {
      if (prodFiltroCatId === 'none' && p.categoria_id) return false
      if (prodFiltroCatId !== 'all' && prodFiltroCatId !== 'none' && p.categoria_id !== prodFiltroCatId) return false
      if (q && !p.nombre.toLowerCase().includes(q) && !(p.descripcion || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [productos, prodFiltroCatId, prodSearchDebounced])

  const totalPagesProd = Math.max(1, Math.ceil(productosFiltrados.length / prodPageSize))
  const productosPagina = useMemo(() => {
    const start = (prodPage - 1) * prodPageSize
    return productosFiltrados.slice(start, start + prodPageSize)
  }, [productosFiltrados, prodPage, prodPageSize])

  const catsNoAsignadas = useMemo(() => catsGenerales.filter(c => !estCats.includes(c.id)), [catsGenerales, estCats])
  const catsAsignadas = useMemo(() => catsGenerales.filter(c => estCats.includes(c.id)), [catsGenerales, estCats])

  // --- DETALLE ---
  if (detalle) {
    return (
      <div>
        <button onClick={() => { setDetalle(null); setEditando(false) }} style={ds.backBtn}>← Volver</button>

        <div style={{ ...ds.card, padding: 28 }}>
          <div className="admin-page-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--c-surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
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
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)' }}>{detalle.nombre}</h2>
              )}
              <div style={{ fontSize: 12, ...ds.muted }}>{detalle.tipo} · {detalle.categoria_padre}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!editando ? (
                <>
                  <button
                    onClick={() => setResetPwd(true)}
                    disabled={!detalle.user_id}
                    title={detalle.user_id ? 'Restablecer contraseña del dueño' : 'Sin dueño vinculado'}
                    style={{ ...ds.secondaryBtn, display: 'flex', alignItems: 'center', gap: 4, opacity: detalle.user_id ? 1 : 0.4 }}
                  >
                    <KeyRound size={14} /> Contraseña
                  </button>
                  <button onClick={() => { setForm(initForm(detalle)); setEditando(true) }} style={ds.primaryBtn}>Editar</button>
                </>
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
            background: (form.banner_url || detalle.banner_url) ? `url(${form.banner_url || detalle.banner_url}) center/cover` : 'var(--c-surface2)',
          }} onClick={() => bannerRef.current?.click()}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0, transition: '0.2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <Upload size={16} color="#fff" /><span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{uploading === 'banner_url' ? 'Subiendo...' : 'Cambiar banner (800x300 px)'}</span>
            </div>
            <input ref={bannerRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'banner_url')} />
          </div>

          {editando ? (
            <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: 'var(--c-text)' }}>
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

        {/* Plan Tienda Pública */}
        <PlanTiendaCard
          establecimiento={detalle}
          onChanged={async () => { await load(); const { data } = await supabase.from('establecimientos').select('*').eq('id', detalle.id).single(); if (data) setDetalle(data) }}
        />

        {/* Categorías generales — chips asignadas + dropdown añadir */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Categorías generales</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {catsAsignadas.length === 0 && (
              <span style={{ fontSize: 12, ...ds.muted }}>Sin categorías asignadas</span>
            )}
            {catsAsignadas.map(c => (
              <span key={c.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 8px 6px 12px', borderRadius: 999,
                border: '1px solid rgba(255,107,44,0.32)',
                background: 'rgba(255,107,44,0.10)',
                color: '#FF6B2C', fontSize: 12, fontWeight: 600,
                fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              }}>
                {c.emoji} {c.nombre}
                <button
                  aria-label={`Quitar categoría ${c.nombre}`}
                  onClick={() => toggleCatGeneral(c.id)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: '#FF6B2C', display: 'inline-flex', alignItems: 'center',
                    padding: 2, borderRadius: 999,
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <div style={{ position: 'relative' }}>
              <button
                aria-label="Añadir categoría general"
                onClick={() => setShowAddCatGeneral(s => !s)}
                disabled={catsNoAsignadas.length === 0}
                style={{
                  ...ds.secondaryBtn, fontSize: 12,
                  opacity: catsNoAsignadas.length === 0 ? 0.5 : 1,
                  cursor: catsNoAsignadas.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Plus size={12} /> {catsNoAsignadas.length === 0 ? 'Todas asignadas' : 'Añadir categoría'}
              </button>
              {showAddCatGeneral && catsNoAsignadas.length > 0 && (
                <>
                  <div onClick={() => setShowAddCatGeneral(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 60,
                    minWidth: 220, maxWidth: 320, maxHeight: 280, overflowY: 'auto',
                    background: '#fff', border: '1px solid var(--c-border-strong)',
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(15,15,15,0.14)',
                    padding: 4,
                  }}>
                    {catsNoAsignadas.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { toggleCatGeneral(c.id); setShowAddCatGeneral(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '10px 12px', minHeight: 44,
                          background: 'transparent', border: 'none', borderRadius: 6,
                          fontSize: 13, color: 'var(--c-text)', cursor: 'pointer',
                          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                          textAlign: 'left',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span>{c.emoji}</span> {c.nombre}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Categorías de la carta — selector + acciones */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Categorías de la carta</h3>
          {categorias.length === 0 ? (
            <div style={{ ...ds.card, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 10 }}>Aún no hay categorías</div>
              <button onClick={abrirCrearCategoriaModal} style={ds.primaryBtn}>
                <Plus size={14} /> Crea tu primera categoría
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                aria-label="Seleccionar categoría de la carta"
                value={selectedCartCatId}
                onChange={e => setSelectedCartCatId(e.target.value)}
                style={{ ...ds.select, flex: '1 1 220px', minWidth: 200, maxWidth: 380 }}
              >
                <option value="">— Selecciona categoría —</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} (orden {c.orden})</option>
                ))}
              </select>
              <button onClick={abrirCrearCategoriaModal} style={ds.secondaryBtn} aria-label="Nueva categoría">
                <Plus size={14} /> Nueva
              </button>
              {selectedCartCatId && (() => {
                const c = categorias.find(x => x.id === selectedCartCatId)
                if (!c) return null
                return (
                  <>
                    <button onClick={() => abrirEditarCategoriaModal(c)} style={ds.secondaryBtn} aria-label={`Editar ${c.nombre}`}>
                      <Pencil size={12} /> Editar
                    </button>
                    <button onClick={() => eliminarCategoria(c.id)} style={{ ...ds.secondaryBtn, color: 'var(--c-danger)', borderColor: 'rgba(220,38,38,0.32)' }} aria-label={`Eliminar ${c.nombre}`}>
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </>
                )
              })()}
            </div>
          )}
        </div>

        {/* Productos — buscador + filtro categoría + paginación */}
        <div style={{ marginTop: 20 }}>
          <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)' }}>
              Productos ({productosFiltrados.length}{productosFiltrados.length !== productos.length ? ` de ${productos.length}` : ''})
            </h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setShowImportUrl(true)} style={{ ...ds.secondaryBtn, fontSize: 11, padding: '0 12px', height: 30, display: 'flex', alignItems: 'center', gap: 4 }}>🔗 Importar URL</button>
              <button onClick={() => setShowCargaMasiva(true)} style={{ ...ds.secondaryBtn, fontSize: 11, padding: '0 12px', height: 30, display: 'flex', alignItems: 'center', gap: 4 }}><Upload size={12} /> Carga masiva</button>
              <button onClick={() => { setEditProd('new'); setProdForm({ nombre: '', descripcion: '', precio: '', categoria_id: selectedCartCatId || '', imagen_url: '' }); setProdExtras([]) }} style={{ ...ds.primaryBtn, fontSize: 11, padding: '0 12px', height: 30 }}>+ Producto</button>
            </div>
          </div>

          {/* Toolbar buscador + filtro */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-muted)', pointerEvents: 'none' }} />
              <input
                type="search"
                aria-label="Buscar producto"
                placeholder="Buscar producto..."
                value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
                style={{ ...ds.formInput, paddingLeft: 32, height: 38 }}
              />
            </div>
            <select
              aria-label="Filtrar por categoría"
              value={prodFiltroCatId}
              onChange={e => { setProdFiltroCatId(e.target.value); if (e.target.value !== selectedCartCatId) setSelectedCartCatId(e.target.value && e.target.value !== 'all' && e.target.value !== 'none' ? e.target.value : '') }}
              style={{ ...ds.select, flex: '1 1 200px', minWidth: 180, maxWidth: 280, height: 38 }}
            >
              <option value="all">Todas las categorías</option>
              <option value="none">Sin categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select
              aria-label="Productos por página"
              value={prodPageSize}
              onChange={e => setProdPageSize(Number(e.target.value))}
              style={{ ...ds.select, width: 110, height: 38 }}
            >
              <option value={10}>10 / pág</option>
              <option value={25}>25 / pág</option>
              <option value={50}>50 / pág</option>
            </select>
          </div>

          {/* Lista paginada */}
          {productosPagina.map(p => (
            <div key={p.id} style={{ ...ds.card, padding: '10px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12, opacity: p.disponible ? 1 : 0.4 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--c-surface2)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--c-muted)' }}>
                {p.imagen_url ? <img src={p.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)' }}>{p.nombre}</div>
                {p.descripcion && <div style={{ fontSize: 11, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</div>}
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#FF6B2C', minWidth: 60, textAlign: 'right' }}>{Number(p.precio).toFixed(2)} €</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggleDisponible(p.id, p.disponible)} style={{ ...ds.actionBtn, color: p.disponible ? 'var(--c-text)' : 'var(--c-danger)', fontSize: 10 }} aria-label={p.disponible ? 'Desactivar producto' : 'Activar producto'}>{p.disponible ? 'On' : 'Off'}</button>
                <button onClick={() => abrirEditarProd(p)} style={{ ...ds.actionBtn, fontSize: 10 }} aria-label="Editar producto">Editar</button>
                <button onClick={() => eliminarProd(p.id)} style={{ ...ds.actionBtn, color: 'var(--c-danger)', fontSize: 10 }} aria-label="Eliminar producto">×</button>
              </div>
            </div>
          ))}

          {productosFiltrados.length === 0 && (
            <div style={{ ...ds.card, padding: 24, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>
              {productos.length === 0 ? 'Sin productos' : 'No hay productos que coincidan'}
              {productos.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => { setProdSearch(''); setProdFiltroCatId('all'); setSelectedCartCatId('') }} style={ds.secondaryBtn}>Limpiar filtros</button>
                </div>
              )}
            </div>
          )}

          {/* Paginación */}
          {productosFiltrados.length > prodPageSize && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>
                Página {prodPage} de {totalPagesProd} · {productosFiltrados.length} productos
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setProdPage(p => Math.max(1, p - 1))}
                  disabled={prodPage === 1}
                  aria-label="Página anterior"
                  style={{ ...ds.secondaryBtn, opacity: prodPage === 1 ? 0.5 : 1, cursor: prodPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button
                  onClick={() => setProdPage(p => Math.min(totalPagesProd, p + 1))}
                  disabled={prodPage >= totalPagesProd}
                  aria-label="Página siguiente"
                  style={{ ...ds.secondaryBtn, opacity: prodPage >= totalPagesProd ? 0.5 : 1, cursor: prodPage >= totalPagesProd ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Extras */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Grupos de extras ({gruposExtras.length})</h3>
          {gruposExtras.map(g => (
            <div key={g.id} style={{ ...ds.card, padding: '10px 16px', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)' }}>{g.nombre} <span style={{ fontSize: 10, color: 'var(--c-muted)' }}>· {g.tipo === 'single' ? 'Elige 1' : `Máx. ${g.max_selecciones}`}</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {(g.extras_opciones || []).map(o => (
                  <span key={o.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--c-surface2)', color: 'var(--c-text-soft)' }}>{o.nombre} +{o.precio.toFixed(2)}€</span>
                ))}
              </div>
            </div>
          ))}
          {gruposExtras.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>Sin extras</div>}
        </div>

        {/* Reseñas */}
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>Reseñas ({resenas.length})</h3>
          {resenas.map(r => (
            <div key={r.id} style={{ ...ds.card, padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text)' }}>{r.usuarios?.nombre || 'Usuario'}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{r.usuarios?.email}</span>
                  <div style={{ display: 'flex', gap: 1 }}>
                    {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= r.rating ? 'var(--c-warning)' : 'var(--c-border-strong)', fontSize: 12 }}>★</span>)}
                  </div>
                </div>
                {r.texto && <div style={{ fontSize: 12, color: 'var(--c-text-soft)', lineHeight: 1.5 }}>{r.texto}</div>}
                <div style={{ fontSize: 10, color: 'var(--c-muted)', marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('es-ES')}</div>
              </div>
              <button onClick={() => eliminarResena(r.id, detalle.id)} style={{ ...ds.actionBtn, color: 'var(--c-danger)', fontSize: 10, flexShrink: 0 }}>Eliminar</button>
            </div>
          ))}
          {resenas.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--c-muted)', fontSize: 12 }}>Sin reseñas</div>}
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
            <div className="admin-modal-content" style={ds.modalContent} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>{editProd === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2>
                <button onClick={() => setEditProd(null)} style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color='var(--c-text)' /></button>
              </div>
              <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                          padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: 11, fontWeight: 600,
                          border: sel ? '2px solid #FF6B2C' : '1px solid var(--c-border-strong)',
                          background: sel ? 'var(--c-primary-soft)' : 'var(--c-surface2)',
                          color: sel ? '#FF6B2C' : 'var(--c-muted)',
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

        {/* Modal crear/editar categoría de carta */}
        {showCatModal && (
          <div style={ds.modal} onClick={() => setShowCatModal(false)}>
            <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>
                  {catModalForm.id ? 'Editar categoría' : 'Nueva categoría'}
                </h2>
                <button onClick={() => setShowCatModal(false)} style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Cerrar">
                  <X size={16} color='var(--c-text)' />
                </button>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={ds.label}>Nombre *</label>
                  <input
                    autoFocus
                    value={catModalForm.nombre}
                    onChange={e => setCatModalForm({ ...catModalForm, nombre: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter' && catModalForm.nombre.trim()) guardarCategoriaModal() }}
                    style={ds.formInput}
                  />
                </div>
                <div>
                  <label style={ds.label}>Orden</label>
                  <input
                    type="number"
                    value={catModalForm.orden}
                    onChange={e => setCatModalForm({ ...catModalForm, orden: +e.target.value })}
                    style={ds.formInput}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowCatModal(false)} style={ds.secondaryBtn}>Cancelar</button>
                <button
                  onClick={guardarCategoriaModal}
                  disabled={!catModalForm.nombre.trim()}
                  style={{ ...ds.primaryBtn, opacity: !catModalForm.nombre.trim() ? 0.5 : 1 }}
                >
                  {catModalForm.id ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        )}

        {resetPwd && detalle.user_id && (
          <ResetPasswordModal
            userId={detalle.user_id}
            userEmail={ownerEmail || detalle.email}
            userLabel={`Dueño de ${detalle.nombre}`}
            userRole="restaurante"
            hasAuthAccount={true}
            onClose={() => setResetPwd(false)}
          />
        )}
      </div>
    )
  }

  // --- LISTA ---
  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <h1 style={ds.h1}>Establecimientos</h1>
        <button onClick={() => { setForm(initForm()); setShowCrear(true) }} style={{ ...ds.primaryBtn, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Crear
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Buscar..." value={buscar} onChange={e => setBuscar(e.target.value)} style={ds.input} />
        <div style={{ display: 'flex', gap: 4 }}>
          {['todos', ...CATEGORIAS_PADRE].map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)} style={{ ...ds.filterBtn, background: filtroTipo === t ? '#FF6B2C' : 'var(--c-surface2)', color: filtroTipo === t ? '#fff' : 'var(--c-muted)' }}>
              {t === 'todos' ? 'Todos' : t === 'comida' ? '🍕 Comida' : t === 'farmacia' ? '💊 Farmacia' : '🛒 Market'}
            </button>
          ))}
        </div>
      </div>

      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ width: 44 }}></span>
          <span style={{ flex: 1 }}>Nombre</span>
          <span data-tablet-sm-hide="true" style={{ width: 100 }}>Categoría</span>
          <span data-tablet-hide="true" style={{ width: 60 }}>Rating</span>
          <span style={{ width: 80 }}>Estado</span>
          <span style={{ width: 120 }}>Acciones</span>
        </div>
        {filtrados.map(e => (
          <div key={e.id} className="ds-row-touch" style={ds.tableRow}>
            <span style={{ width: 44 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden' }}>
                {e.logo_url ? <img src={e.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍽️'}
              </div>
            </span>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--c-text)' }} onClick={() => { setDetalle(e); loadCategorias(e.id); loadEstCats(e.id); loadProductos(e.id); loadResenas(e.id) }}>{e.nombre}</span>
            <span data-tablet-sm-hide="true" style={{ width: 100 }}>
              <span style={{ ...ds.badge, background: 'var(--c-surface2)', color: 'var(--c-text-soft)' }}>
                {e.categoria_padre === 'comida' ? '🍕' : e.categoria_padre === 'farmacia' ? '💊' : '🛒'} {e.categoria_padre}
              </span>
            </span>
            <span data-tablet-hide="true" style={{ width: 60, fontSize: 12, color: 'var(--c-text)' }}>{e.rating?.toFixed(1)}</span>
            <span style={{ width: 80 }}>
              <span style={{ ...ds.badge, background: e.activo ? 'var(--c-surface2)' : 'var(--c-danger-soft)', color: e.activo ? 'var(--c-text)' : 'var(--c-danger)' }}>{e.activo ? 'Activo' : 'Inactivo'}</span>
            </span>
            <span style={{ width: 120, display: 'flex', gap: 6 }}>
              <button className="admin-action-btn" onClick={() => { setDetalle(e); loadCategorias(e.id); loadEstCats(e.id); loadProductos(e.id); loadResenas(e.id) }} style={ds.actionBtn}>Editar</button>
              <button className="admin-action-btn" onClick={() => toggleActivo(e.id, e.activo)} style={{ ...ds.actionBtn, color: e.activo ? 'var(--c-danger)' : 'var(--c-text)' }}>
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
          <div className="admin-modal-content" style={ds.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--c-text)' }}>Crear establecimiento</h2>
              <button onClick={() => setShowCrear(false)} style={{ background: 'var(--c-surface2)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color='var(--c-text)' /></button>
            </div>
            <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
              <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--c-muted)', marginTop: 4 }}>
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
