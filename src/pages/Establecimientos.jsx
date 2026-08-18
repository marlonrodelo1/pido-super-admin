import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { uploadImage } from '../lib/upload'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, EstadoBadge, GhostBtn, GlossyBtn, MiniBtn, PillTabs, SectionLabel, Toggle, Vacio } from '../lib/ui'
import { Plus, X, Upload, Save, Trash2, KeyRound, Search, ChevronLeft, ChevronRight, Pencil, Copy, Eye, EyeOff, Wand2, Check, Share2, ExternalLink } from 'lucide-react'
import { toast, confirmar } from '../App'
import CargaMasivaModal from '../components/CargaMasivaModal'
import ImportUrlModal from '../components/ImportUrlModal'
import RidersCard from '../components/RidersCard'
import HorarioEstadoCard from '../components/HorarioEstadoCard'
import CreadoresCard from '../components/CreadoresCard'
// PlanTiendaCard eliminado: el plan SaaS 39€/mes está muerto. El alta/plan se gestiona en AltaPlanCard (abajo).
import ResetPasswordModal from '../components/ResetPasswordModal'
import EliminarEntidadModal from '../components/EliminarEntidadModal'
import AddressAutocomplete from '../components/AddressAutocomplete'

const CATEGORIAS_PADRE = ['comida', 'farmacia', 'marketplace']

// Fila de listado dentro de una Card. Antes cada producto/extra/reseña era otra
// `ds.card` metida dentro de la card de la sección: dos sombras y dos bordes del
// mismo color, uno dentro de otro, que no separaban nada.
const filaLista = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px', marginBottom: 6,
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  background: colors.cream,
}

// Aspa de cerrar modal — repetida a mano en los tres modales de la pantalla.
const cerrarModalBtn = {
  background: colors.cream2, border: 'none', borderRadius: radius.sm,
  width: 32, height: 32, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// Opción de contraseña (radio grande) del modal de creación.
const opcionPwd = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '10px 12px', minHeight: 44, borderRadius: radius.sm,
  border: '1px solid transparent', cursor: 'pointer',
  ...type.body, color: colors.text,
}

export default function Establecimientos() {
  const [items, setItems] = useState([])
  const [pendientes, setPendientes] = useState({}) // establecimiento_id -> { vinc, tarifas }
  const [buscar, setBuscar] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [soloPendientes, setSoloPendientes] = useState(false)
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
  const [prodForm, setProdForm] = useState({ nombre: '', descripcion: '', precio: '', precio_local: '', categoria_id: '', imagen_url: '' })
  const [prodExtras, setProdExtras] = useState([])
  const [savingProd, setSavingProd] = useState(false)
  const [resenas, setResenas] = useState([])
  const [showCargaMasiva, setShowCargaMasiva] = useState(false)
  const [showImportUrl, setShowImportUrl] = useState(false)
  const [resetPwd, setResetPwd] = useState(false)
  const [showEliminar, setShowEliminar] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState(null)
  // Crear restaurante: datos del dueño + estado del flujo
  const [duenoForm, setDuenoForm] = useState({ nombre: '', apellido: '', telefono: '', email: '', password: '', modoPwd: 'auto' })
  const [showCrearPwd, setShowCrearPwd] = useState(false)
  const [crearError, setCrearError] = useState(null)
  const [crearExito, setCrearExito] = useState(null) // { dueno: {email, password_temporal, id}, establecimiento: {id, nombre} }
  const [showExitoPwd, setShowExitoPwd] = useState(false)
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
    loadPendientes()
  }

  // Sustituye a la página "Aprobaciones" (eliminada el 24 jul 2026): en vez de una bandeja
  // aparte, cada restaurante enseña en la lista lo que tiene esperando decisión, y se resuelve
  // dentro de su ficha. Sin esto no habría forma de saber DÓNDE mirar sin abrirlos todos.
  async function loadPendientes() {
    const { data } = await supabase.from('socio_establecimiento')
      .select('establecimiento_id, estado, tarifa_pendiente')
    const mapa = {}
    for (const v of data || []) {
      const m = mapa[v.establecimiento_id] || (mapa[v.establecimiento_id] = { vinc: 0, tarifas: 0 })
      if (v.estado === 'pendiente' || v.estado === 'solicitada') m.vinc++
      if (v.tarifa_pendiente) m.tarifas++
    }
    setPendientes(mapa)
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

  // `activo` decide si el restaurante SE VE en la app del cliente, y además la pisa
  // el motor de presencia cada minuto. Antes esto era un botón que ponía "On"/"Off";
  // al pasar a interruptor se volvió mucho más fácil de accionar sin querer, así que
  // se pregunta. La escritura es exactamente la misma de siempre.
  async function toggleActivo(id, activo, nombre = 'este establecimiento') {
    const ok = await confirmar(
      activo
        ? `¿Cerrar «${nombre}» ahora mismo? Dejará de verse en la app del cliente hasta que se vuelva a abrir.`
        : `¿Abrir «${nombre}» ahora mismo?`
    )
    if (!ok) return
    const { error } = await supabase.from('establecimientos').update({ activo: !activo }).eq('id', id)
    if (error) return toast('Error: ' + error.message, 'error')
    load()
  }

  function initForm(est) {
    return {
      nombre: est?.nombre || '', tipo: est?.tipo || 'restaurante', categoria_padre: est?.categoria_padre || 'comida',
      email: est?.email || '', telefono: est?.telefono || '', direccion: est?.direccion || '',
      instagram_usuario: est?.instagram_usuario || '', tiktok_usuario: est?.tiktok_usuario || '',
      radio_cobertura_km: est?.radio_cobertura_km || 5, descripcion: est?.descripcion || '',
      banner_url: est?.banner_url || '', logo_url: est?.logo_url || '',
      latitud: est?.latitud ?? null, longitud: est?.longitud ?? null,
    }
  }

  async function guardarEstablecimiento() {
    setSaving(true)
    setCrearError(null)
    if (detalle) {
      const { error } = await supabase.from('establecimientos').update(form).eq('id', detalle.id)
      if (error) { toast('Error: ' + error.message, 'error'); setSaving(false); return }
      setDetalle({ ...detalle, ...form })
      setEditando(false)
      setForm({})
      load()
      setSaving(false)
      return
    }

    // Modo CREAR -> edge function admin-crear-restaurante
    const emailDueno = (duenoForm.email || '').trim().toLowerCase()
    if (!emailDueno) {
      setCrearError('Email del dueño obligatorio')
      setSaving(false)
      return
    }
    if (duenoForm.modoPwd === 'manual' && (!duenoForm.password || duenoForm.password.length < 8)) {
      setCrearError('La contraseña manual debe tener mínimo 8 caracteres')
      setSaving(false)
      return
    }

    try {
      const payload = {
        establecimiento: {
          nombre: form.nombre,
          tipo: form.tipo,
          categoria_padre: form.categoria_padre,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          latitud: form.latitud ?? null,
          longitud: form.longitud ?? null,
          radio_cobertura_km: form.radio_cobertura_km ?? 5,
          logo_url: form.logo_url || null,
          banner_url: form.banner_url || null,
          descripcion: form.descripcion || null,
        },
        dueno: {
          email: emailDueno,
          nombre: duenoForm.nombre || null,
          apellido: duenoForm.apellido || null,
          telefono: duenoForm.telefono || form.telefono || null,
          ...(duenoForm.modoPwd === 'manual' ? { password: duenoForm.password } : {}),
        },
      }
      // Llamada con fetch directo para poder leer siempre el body de error.
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setCrearError('Sesion no valida. Vuelve a entrar.')
        setSaving(false)
        return
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-crear-restaurante`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok) {
        setCrearError(data?.message || data?.error || `Error ${resp.status}`)
        setSaving(false)
        return
      }
      if (!data?.success) {
        setCrearError(data?.message || data?.error || 'Respuesta inesperada del servidor')
        setSaving(false)
        return
      }
      // Éxito: mostrar pantalla de credenciales
      setCrearExito({ dueno: data.dueno, establecimiento: data.establecimiento })
      setShowExitoPwd(false)
      load()
    } catch (e) {
      setCrearError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  function generarPasswordAleatoria(length = 12) {
    const charset = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let out = ''
    const arr = new Uint32Array(length)
    crypto.getRandomValues(arr)
    for (let i = 0; i < length; i++) out += charset[arr[i] % charset.length]
    return out
  }

  function cerrarModalCrear() {
    setShowCrear(false)
    setForm({})
    setDuenoForm({ nombre: '', apellido: '', telefono: '', email: '', password: '', modoPwd: 'auto' })
    setCrearError(null)
    setCrearExito(null)
    setShowCrearPwd(false)
    setShowExitoPwd(false)
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto)
      toast('Copiado al portapapeles')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }

  function textoCredenciales() {
    if (!crearExito) return ''
    const nombre = crearExito.establecimiento.nombre
    return `Bienvenido a Pidoo, ${nombre}!\n\nPara entrar a tu panel:\n- URL: https://panel.pidoo.es\n- Email: ${crearExito.dueno.email}\n- Contraseña: ${crearExito.dueno.password_temporal}\n\nCambia la contraseña en cuanto entres.`
  }

  async function compartirCredenciales() {
    const texto = textoCredenciales()
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Credenciales Pidoo', text: texto })
      } catch (e) {
        if (e?.name !== 'AbortError') toast('No se pudo compartir', 'error')
      }
    } else {
      await copiarTexto(texto)
    }
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
    setProdForm({ nombre: p.nombre, descripcion: p.descripcion || '', precio: p.precio, precio_local: p.precio_local ?? '', categoria_id: p.categoria_id || '', imagen_url: p.imagen_url || '' })
    const { data } = await supabase.from('producto_extras').select('grupo_id').eq('producto_id', p.id)
    setProdExtras((data || []).map(d => d.grupo_id))
    setEditProd(p)
  }

  function parsePrecio(raw) {
    if (raw === '' || raw === null || raw === undefined) return null
    const n = Number(String(raw).replace(',', '.'))
    return Number.isFinite(n) ? n : NaN
  }

  async function guardarProd() {
    if (!prodForm.nombre.trim()) { toast('El nombre es obligatorio', 'error'); return }
    const precio = parsePrecio(prodForm.precio)
    if (precio === null || Number.isNaN(precio) || precio < 0) {
      toast('Precio inválido. Usa punto como decimal (ej: 0.50)', 'error'); return
    }
    // Precio de la carta del local (QR de mesa). Vacio = null = usa el normal.
    const precioLocal = parsePrecio(prodForm.precio_local)
    if (precioLocal !== null && (Number.isNaN(precioLocal) || precioLocal < 0)) {
      toast('Precio de local invalido. Dejalo vacio si es el mismo.', 'error'); return
    }
    setSavingProd(true)
    const baseData = {
      nombre: prodForm.nombre.trim(),
      descripcion: prodForm.descripcion.trim() || null,
      precio,
      precio_local: precioLocal,
      categoria_id: prodForm.categoria_id || null,
      imagen_url: prodForm.imagen_url || null,
    }
    let prodId
    if (editProd && editProd !== 'new') {
      const { error } = await supabase.from('productos').update(baseData).eq('id', editProd.id)
      if (error) { setSavingProd(false); toast('Error al guardar: ' + error.message, 'error'); return }
      prodId = editProd.id
    } else {
      const insertData = { ...baseData, establecimiento_id: detalle.id, disponible: true, orden: productos.length }
      const { data: nuevo, error } = await supabase.from('productos').insert(insertData).select().single()
      if (error) { setSavingProd(false); toast('Error al crear: ' + error.message, 'error'); return }
      prodId = nuevo?.id
    }
    if (prodId) {
      await supabase.from('producto_extras').delete().eq('producto_id', prodId)
      if (prodExtras.length > 0) await supabase.from('producto_extras').insert(prodExtras.map(gid => ({ producto_id: prodId, grupo_id: gid })))
    }
    setSavingProd(false)
    setEditProd(null)
    setProdForm({ nombre: '', descripcion: '', precio: '', precio_local: '', categoria_id: '', imagen_url: '' })
    setProdExtras([])
    toast('Producto guardado', 'success')
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

  // Cuántas decisiones esperan en un restaurante: solicitudes de vinculación + propuestas de
  // tarifa + su propia alta sin verificar.
  const contarPendientes = (e) => {
    const p = pendientes[e.id] || { vinc: 0, tarifas: 0 }
    return p.vinc + p.tarifas + (e.estado === 'pendiente_verificacion' ? 1 : 0)
  }
  const totalPendientes = items.reduce((n, e) => n + contarPendientes(e), 0)

  const filtrados = items.filter(e => {
    if (soloPendientes && contarPendientes(e) === 0) return false
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

        <Card pad={24}>
          <div className="admin-page-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 60, height: 60, borderRadius: radius.md, background: colors.cream2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
              onClick={() => logoRef.current?.click()}>
              {(form.logo_url || detalle.logo_url) ? <img src={form.logo_url || detalle.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍽️'}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                <Upload size={16} color={colors.cream} />
              </div>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'logo_url')} />
            </div>
            <div style={{ flex: 1 }}>
              {editando ? (
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={{ ...ds.formInput, fontSize: type.h3.fontSize, fontWeight: 700, height: 44 }} />
              ) : (
                <h1 style={ds.h1}>{detalle.nombre}</h1>
              )}
              <div style={{ ...type.label, color: colors.textMute, marginTop: 4 }}>{detalle.tipo} · {detalle.categoria_padre}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!editando ? (
                <>
                  <GhostBtn
                    onClick={() => setResetPwd(true)}
                    disabled={!detalle.user_id}
                    title={detalle.user_id ? 'Restablecer contraseña del dueño' : 'Sin dueño vinculado'}
                    style={{ opacity: detalle.user_id ? 1 : 0.4 }}
                  >
                    <KeyRound size={14} /> Contraseña
                  </GhostBtn>
                  <GhostBtn
                    danger
                    onClick={() => setShowEliminar(true)}
                    title="Eliminar restaurante definitivamente"
                  >
                    <Trash2 size={14} /> Eliminar
                  </GhostBtn>
                  <GlossyBtn accent onClick={() => { setForm(initForm(detalle)); setEditando(true) }}>Editar</GlossyBtn>
                </>
              ) : (
                <>
                  <GlossyBtn accent onClick={guardarEstablecimiento} disabled={saving}>
                    <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
                  </GlossyBtn>
                  <GhostBtn onClick={() => setEditando(false)}>Cancelar</GhostBtn>
                </>
              )}
            </div>
          </div>

          {/* Banner upload */}
          <div style={{ height: 120, borderRadius: radius.md, marginBottom: 16, overflow: 'hidden', cursor: 'pointer', position: 'relative',
            background: (form.banner_url || detalle.banner_url) ? `url(${form.banner_url || detalle.banner_url}) center/cover` : colors.cream2,
          }} onClick={() => bannerRef.current?.click()}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0, transition: '0.2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
              <Upload size={16} color={colors.cream} /><span style={{ ...type.label, color: colors.cream, fontWeight: 600 }}>{uploading === 'banner_url' ? 'Subiendo...' : 'Cambiar banner (800x300 px)'}</span>
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
              {/* Pidoo Creadores obliga al cliente a etiquetar al restaurante:
                  sin el @ exacto, el texto que se le da para pegar no lleva la
                  mención. El servidor normaliza arroba, URL y mayúsculas. */}
              <div><label style={ds.label}>Instagram</label><input value={form.instagram_usuario || ''} placeholder="@tunegocio" onChange={e => setForm({ ...form, instagram_usuario: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>TikTok</label><input value={form.tiktok_usuario || ''} placeholder="@tunegocio" onChange={e => setForm({ ...form, tiktok_usuario: e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={ds.label}>Dirección</label>
                <AddressAutocomplete
                  value={form.direccion || ''}
                  onChange={(v) => setForm(prev => ({ ...prev, direccion: v }))}
                  onSelect={(p) => setForm(prev => ({ ...prev, direccion: p.direccion, latitud: p.latitud, longitud: p.longitud }))}
                  placeholder="Buscar dirección…"
                />
                {form.latitud != null && form.longitud != null && (
                  <div style={{ marginTop: 6, ...type.caption, color: colors.textMute }}>
                    Coordenadas: {Number(form.latitud).toFixed(6)}, {Number(form.longitud).toFixed(6)}
                  </div>
                )}
              </div>
              <div><label style={ds.label}>Radio (km)</label><input type="number" value={form.radio_cobertura_km} onChange={e => setForm({ ...form, radio_cobertura_km: +e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Descripción</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} style={{ ...ds.formInput, resize: 'vertical' }} /></div>
            </div>
          ) : (
            <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={ds.label}>Email</div>
                <div style={{ ...type.body, color: colors.text }}>{detalle.email || '—'}</div>
              </div>
              <div>
                <div style={ds.label}>Teléfono</div>
                <div style={{ ...type.body, color: colors.text }}>{detalle.telefono || '—'}</div>
              </div>
              <div>
                <div style={ds.label}>Dirección</div>
                <div style={{ ...type.body, color: colors.text }}>{detalle.direccion || '—'}</div>
              </div>
              <div>
                <div style={ds.label}>Radio de cobertura</div>
                <div style={{ ...type.body, color: colors.text }}>{detalle.radio_cobertura_km} km</div>
              </div>
              <div>
                <div style={ds.label}>Rating</div>
                <div style={{ ...type.body, color: colors.text }}>{detalle.rating?.toFixed(1)} ({detalle.total_resenas} reseñas)</div>
              </div>
              <div>
                <div style={ds.label}>Creado</div>
                <div style={{ ...type.body, color: colors.text }}>{new Date(detalle.created_at).toLocaleDateString('es-ES')}</div>
              </div>
            </div>
          )}
        </Card>

        {/* Socios vinculados */}
        <RidersCard
          establecimiento={detalle}
          onChanged={() => load()}
        />

        {/* Horario y estado */}
        <HorarioEstadoCard
          establecimiento={detalle}
          onChanged={async () => { const { data } = await supabase.from('establecimientos').select('*').eq('id', detalle.id).single(); if (data) setDetalle(data); load() }}
        />

        {/* Alta y plan (modelo 10% por pedido — sin cuota) */}
        <AltaPlanCard
          establecimiento={detalle}
          onChanged={async () => { await load(); const { data } = await supabase.from('establecimientos').select('*').eq('id', detalle.id).single(); if (data) setDetalle(data) }}
        />

        {/* Cómo cobra Pidoo a este restaurante (comisión por puerta + reparto) */}
        <ComisionCard
          establecimiento={detalle}
          onChanged={async () => { const { data } = await supabase.from('establecimientos').select('*').eq('id', detalle.id).single(); if (data) setDetalle(data) }}
        />

        {/* Pidoo Creadores — interruptor maestro (el dueño solo puede pausar) */}
        <CreadoresCard establecimiento={detalle} />

        {/* Categorías generales — chips asignadas + dropdown añadir */}
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ ...ds.h3, marginBottom: 10 }}>Categorías generales</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {catsAsignadas.length === 0 && (
              <span style={{ ...type.body, color: colors.textMute }}>Sin categorías asignadas</span>
            )}
            {catsAsignadas.map(c => (
              <Chip key={c.id} tono="terracotta" style={{ paddingRight: 5 }}>
                {c.emoji} {c.nombre}
                <button
                  aria-label={`Quitar categoría ${c.nombre}`}
                  onClick={() => toggleCatGeneral(c.id)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: colors.onTerracottaSoft, display: 'inline-flex', alignItems: 'center',
                    padding: 2, borderRadius: radius.full,
                  }}
                >
                  <X size={12} />
                </button>
              </Chip>
            ))}
            <div style={{ position: 'relative' }}>
              <GhostBtn
                size="sm"
                aria-label="Añadir categoría general"
                onClick={() => setShowAddCatGeneral(s => !s)}
                disabled={catsNoAsignadas.length === 0}
                style={{
                  opacity: catsNoAsignadas.length === 0 ? 0.5 : 1,
                  cursor: catsNoAsignadas.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <Plus size={12} /> {catsNoAsignadas.length === 0 ? 'Todas asignadas' : 'Añadir categoría'}
              </GhostBtn>
              {showAddCatGeneral && catsNoAsignadas.length > 0 && (
                <>
                  <div onClick={() => setShowAddCatGeneral(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 60,
                    minWidth: 220, maxWidth: 320, maxHeight: 280, overflowY: 'auto',
                    background: colors.paper, border: `1px solid ${colors.borderStrong}`,
                    borderRadius: radius.md, boxShadow: colors.shadowLg,
                    padding: 4,
                  }}>
                    {catsNoAsignadas.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { toggleCatGeneral(c.id); setShowAddCatGeneral(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '10px 12px', minHeight: 44,
                          background: 'transparent', border: 'none', borderRadius: radius.sm,
                          ...type.label, color: colors.text, cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = colors.cream2}
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
        </Card>

        {/* Categorías de la carta — selector + acciones */}
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ ...ds.h3, marginBottom: 10 }}>Categorías de la carta</h3>
          {categorias.length === 0 ? (
            <Vacio
              titulo="Aún no hay categorías"
              texto="Las categorías agrupan los productos dentro de la carta del restaurante."
              accion={(
                <GlossyBtn accent onClick={abrirCrearCategoriaModal}>
                  <Plus size={14} /> Crea tu primera categoría
                </GlossyBtn>
              )}
            />
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
              <GhostBtn onClick={abrirCrearCategoriaModal} aria-label="Nueva categoría">
                <Plus size={14} /> Nueva
              </GhostBtn>
              {selectedCartCatId && (() => {
                const c = categorias.find(x => x.id === selectedCartCatId)
                if (!c) return null
                return (
                  <>
                    <GhostBtn onClick={() => abrirEditarCategoriaModal(c)} aria-label={`Editar ${c.nombre}`}>
                      <Pencil size={12} /> Editar
                    </GhostBtn>
                    <GhostBtn danger onClick={() => eliminarCategoria(c.id)} aria-label={`Eliminar ${c.nombre}`}>
                      <Trash2 size={12} /> Eliminar
                    </GhostBtn>
                  </>
                )
              })()}
            </div>
          )}
        </Card>

        {/* Productos — buscador + filtro categoría + paginación */}
        <Card style={{ marginTop: 20 }}>
          <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <h3 style={ds.h3}>
              Productos ({productosFiltrados.length}{productosFiltrados.length !== productos.length ? ` de ${productos.length}` : ''})
            </h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <GhostBtn size="sm" onClick={() => setShowImportUrl(true)}>🔗 Importar URL</GhostBtn>
              <GhostBtn size="sm" onClick={() => setShowCargaMasiva(true)}><Upload size={12} /> Carga masiva</GhostBtn>
              <GlossyBtn size="sm" accent onClick={() => { setEditProd('new'); setProdForm({ nombre: '', descripcion: '', precio: '', precio_local: '', categoria_id: selectedCartCatId || '', imagen_url: '' }); setProdExtras([]) }}>
                <Plus size={14} /> Producto
              </GlossyBtn>
            </div>
          </div>

          {/* Toolbar buscador + filtro */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textMute, pointerEvents: 'none' }} />
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
            <div key={p.id} style={{ ...filaLista, opacity: p.disponible ? 1 : 0.45 }}>
              <div style={{ width: 40, height: 40, borderRadius: radius.sm, background: colors.cream2, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                {p.imagen_url ? <img src={p.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>{p.nombre}</div>
                {p.descripcion && <div style={{ ...type.label, color: colors.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</div>}
              </div>
              <span style={{ ...type.body, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colors.terracotta2, minWidth: 64, textAlign: 'right' }}>{Number(p.precio).toFixed(2)} €</span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <MiniBtn onClick={() => toggleDisponible(p.id, p.disponible)} aria-label={p.disponible ? 'Desactivar producto' : 'Activar producto'} style={{ color: p.disponible ? colors.text : colors.danger }}>{p.disponible ? 'On' : 'Off'}</MiniBtn>
                <MiniBtn onClick={() => abrirEditarProd(p)} aria-label="Editar producto">Editar</MiniBtn>
                <MiniBtn danger onClick={() => eliminarProd(p.id)} aria-label="Eliminar producto">×</MiniBtn>
              </div>
            </div>
          ))}

          {productosFiltrados.length === 0 && (
            <Vacio
              titulo={productos.length === 0 ? 'Sin productos' : 'No hay productos que coincidan'}
              texto={productos.length === 0
                ? 'Añade el primero a mano, o importa la carta desde una URL o un CSV.'
                : 'Prueba a quitar la búsqueda o el filtro de categoría.'}
              accion={productos.length > 0 && (
                <GhostBtn onClick={() => { setProdSearch(''); setProdFiltroCatId('all'); setSelectedCartCatId('') }}>Limpiar filtros</GhostBtn>
              )}
            />
          )}

          {/* Paginación */}
          {productosFiltrados.length > prodPageSize && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ ...type.caption, color: colors.textMute }}>
                Página {prodPage} de {totalPagesProd} · {productosFiltrados.length} productos
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <GhostBtn
                  size="sm"
                  onClick={() => setProdPage(p => Math.max(1, p - 1))}
                  disabled={prodPage === 1}
                  aria-label="Página anterior"
                  style={{ opacity: prodPage === 1 ? 0.5 : 1, cursor: prodPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={14} /> Anterior
                </GhostBtn>
                <GhostBtn
                  size="sm"
                  onClick={() => setProdPage(p => Math.min(totalPagesProd, p + 1))}
                  disabled={prodPage >= totalPagesProd}
                  aria-label="Página siguiente"
                  style={{ opacity: prodPage >= totalPagesProd ? 0.5 : 1, cursor: prodPage >= totalPagesProd ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente <ChevronRight size={14} />
                </GhostBtn>
              </div>
            </div>
          )}
        </Card>

        {/* Extras */}
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ ...ds.h3, marginBottom: 12 }}>Grupos de extras ({gruposExtras.length})</h3>
          {gruposExtras.map(g => (
            <div key={g.id} style={{ ...filaLista, display: 'block' }}>
              <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
                {g.nombre} <span style={{ ...type.caption, color: colors.textMute }}>· {g.tipo === 'single' ? 'Elige 1' : `Máx. ${g.max_selecciones}`}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(g.extras_opciones || []).map(o => (
                  <Chip key={o.id} tono="neutral">{o.nombre} +{o.precio.toFixed(2)}€</Chip>
                ))}
              </div>
            </div>
          ))}
          {gruposExtras.length === 0 && (
            <Vacio titulo="Sin extras" texto="Este restaurante todavía no tiene grupos de extras en su carta." />
          )}
        </Card>

        {/* Reseñas */}
        <Card style={{ marginTop: 20 }}>
          <h3 style={{ ...ds.h3, marginBottom: 12 }}>Reseñas ({resenas.length})</h3>
          {resenas.map(r => (
            <div key={r.id} style={{ ...filaLista, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ ...type.body, fontWeight: 600, color: colors.text }}>{r.usuarios?.nombre || 'Usuario'}</span>
                  <span style={{ ...type.label, color: colors.textMute }}>{r.usuarios?.email}</span>
                  <div style={{ display: 'flex', gap: 1 }}>
                    {[1,2,3,4,5].map(i => <span key={i} style={{ color: i <= r.rating ? colors.warning : colors.borderStrong, fontSize: type.label.fontSize }}>★</span>)}
                  </div>
                </div>
                {r.texto && <div style={{ ...type.body, color: colors.textDim }}>{r.texto}</div>}
                <div style={{ ...type.caption, color: colors.textMute, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString('es-ES')}</div>
              </div>
              <MiniBtn danger onClick={() => eliminarResena(r.id, detalle.id)} style={{ flexShrink: 0 }}>Eliminar</MiniBtn>
            </div>
          ))}
          {resenas.length === 0 && (
            <Vacio titulo="Sin reseñas" texto="Cuando un cliente valore un pedido de este restaurante, aparecerá aquí." />
          )}
        </Card>

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
                <h2 style={ds.h3}>{editProd === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2>
                <button onClick={() => setEditProd(null)} aria-label="Cerrar" style={cerrarModalBtn}><X size={16} color={colors.text} /></button>
              </div>
              <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Nombre *</label><input value={prodForm.nombre} onChange={e => setProdForm({ ...prodForm, nombre: e.target.value })} style={ds.formInput} /></div>
                <div><label style={ds.label}>Precio (€) *</label><input type="number" step="0.01" min="0" value={prodForm.precio} onChange={e => setProdForm({ ...prodForm, precio: e.target.value })} style={ds.formInput} /></div>
                {detalle?.carta_local_activa && (
                  <div>
                    <label style={ds.label}>Precio en el local (€)</label>
                    <input type="number" step="0.01" min="0" placeholder="El mismo" value={prodForm.precio_local} onChange={e => setProdForm({ ...prodForm, precio_local: e.target.value })} style={ds.formInput} />
                  </div>
                )}
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
                        <button key={g.id} onClick={() => setProdExtras(prev => sel ? prev.filter(id => id !== g.id) : [...prev, g.id])} aria-pressed={sel} style={{
                          padding: '6px 12px', borderRadius: radius.sm, cursor: 'pointer',
                          ...type.label, fontWeight: 600,
                          border: `1px solid ${sel ? colors.terracotta : colors.borderStrong}`,
                          background: sel ? colors.terracottaSoft : colors.cream2,
                          color: sel ? colors.onTerracottaSoft : colors.textMute,
                        }}>
                          {sel && '✓ '}{g.nombre}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <GhostBtn onClick={() => setEditProd(null)}>Cancelar</GhostBtn>
                <GlossyBtn accent onClick={guardarProd} disabled={savingProd || !prodForm.nombre?.trim() || !prodForm.precio} style={{ opacity: savingProd || !prodForm.nombre?.trim() ? 0.5 : 1 }}>
                  {savingProd ? 'Guardando...' : editProd === 'new' ? 'Crear' : 'Guardar'}
                </GlossyBtn>
              </div>
            </div>
          </div>
        )}

        {/* Modal crear/editar categoría de carta */}
        {showCatModal && (
          <div style={ds.modal} onClick={() => setShowCatModal(false)}>
            <div className="admin-modal-content" style={{ ...ds.modalContent, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={ds.h3}>
                  {catModalForm.id ? 'Editar categoría' : 'Nueva categoría'}
                </h2>
                <button onClick={() => setShowCatModal(false)} style={cerrarModalBtn} aria-label="Cerrar">
                  <X size={16} color={colors.text} />
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
                <GhostBtn onClick={() => setShowCatModal(false)}>Cancelar</GhostBtn>
                <GlossyBtn
                  accent
                  onClick={guardarCategoriaModal}
                  disabled={!catModalForm.nombre.trim()}
                  style={{ opacity: !catModalForm.nombre.trim() ? 0.5 : 1 }}
                >
                  {catModalForm.id ? 'Guardar' : 'Crear'}
                </GlossyBtn>
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

        {showEliminar && (
          <EliminarEntidadModal
            tipo="establecimiento"
            entidad={{ ...detalle, email: ownerEmail || detalle.email }}
            onClose={() => setShowEliminar(false)}
            onDeleted={() => {
              setShowEliminar(false)
              const id = detalle.id
              setDetalle(null)
              setItems(prev => prev.filter(e => e.id !== id))
              load()
            }}
          />
        )}
      </div>
    )
  }

  // --- LISTA ---
  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Establecimientos</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            {filtrados.length === items.length
              ? `${items.length} establecimiento${items.length === 1 ? '' : 's'}`
              : `${filtrados.length} de ${items.length} establecimientos`}
          </div>
        </div>
        <GlossyBtn accent onClick={() => { setForm(initForm()); setShowCrear(true) }}>
          <Plus size={16} /> Crear
        </GlossyBtn>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar restaurante..." aria-label="Buscar establecimiento" value={buscar} onChange={e => setBuscar(e.target.value)} style={ds.input} />
        {/* Cada categoría lleva su recuento: se calcula sobre `items`, que ya está
            en memoria — no hay ninguna consulta nueva por esto. */}
        <PillTabs
          value={filtroTipo}
          onChange={setFiltroTipo}
          options={['todos', ...CATEGORIAS_PADRE].map(t => ({
            value: t,
            label: t === 'todos' ? 'Todos' : t === 'comida' ? '🍕 Comida' : t === 'farmacia' ? '💊 Farmacia' : '🛒 Market',
            count: t === 'todos' ? items.length : items.filter(x => x.categoria_padre === t).length,
          }))}
        />
        {totalPendientes > 0 && (
          <button
            onClick={() => setSoloPendientes(v => !v)}
            title="Solicitudes de vinculación, propuestas de tarifa y altas sin verificar"
            style={{
              ...ds.filterBtn,
              height: 34, borderRadius: radius.full,
              background: soloPendientes ? colors.terracotta : colors.warningSoft,
              color: soloPendientes ? colors.cream : colors.onWarningSoft,
              borderColor: soloPendientes ? colors.terracotta : colors.warningSoft,
              fontWeight: 700,
            }}
          >
            {totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'} de decisión
          </button>
        )}
      </div>

      {/* Dos columnas separadas a propósito: `estado` es el ALTA administrativa
          (activo / pendiente_verificacion / suspendido) y `activo` es si está
          ABIERTO ahora mismo — lo gobierna el motor de presencia. Fundirlas en un
          solo indicador oculta que un restaurante verificado puede estar cerrado
          y que uno abierto puede no salir en la app por no estar verificado. */}
      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ flex: '2 1 220px', minWidth: 0 }}>Nombre</span>
          <span style={{ flex: '1 1 120px', minWidth: 0 }}>Categoría</span>
          <span data-tablet-hide="true" style={{ width: 64, flexShrink: 0 }}>Rating</span>
          <span style={{ flex: '1 1 120px', minWidth: 0 }}>Alta</span>
          <span style={{ flex: '1 1 110px', minWidth: 0 }}>Apertura</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1 1 130px', minWidth: 0 }}>Reparto</span>
          <span style={{ width: 150, flexShrink: 0 }}>Acciones</span>
        </div>
        {filtrados.map(e => (
          <div key={e.id} className="ds-row-touch" style={ds.tableRow}>
            <span
              data-col="nom"
              style={{ flex: '2 1 220px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => { setDetalle(e); loadCategorias(e.id); loadEstCats(e.id); loadProductos(e.id); loadResenas(e.id) }}
            >
              <span style={{ width: 36, height: 36, borderRadius: radius.md, background: colors.cream2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>
                {e.logo_url ? <img src={e.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍽️'}
              </span>
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ ...type.body, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nombre}</span>
                  {e.captador_socio_id && e.estado === 'pendiente_verificacion' && (
                    <Chip tono="warning" style={{ flexShrink: 0 }}>
                      {e.alta_confirmada_at ? '🟠 Socio · verificar' : '⏳ Socio · sin confirmar'}
                    </Chip>
                  )}
                  {(() => {
                    const p = pendientes[e.id]
                    if (!p || (p.vinc + p.tarifas) === 0) return null
                    const partes = []
                    if (p.vinc) partes.push(`${p.vinc} vinculación${p.vinc === 1 ? '' : 'es'}`)
                    if (p.tarifas) partes.push(`${p.tarifas} tarifa${p.tarifas === 1 ? '' : 's'}`)
                    return (
                      <Chip tono="warning" dot title={`Esperando tu decisión: ${partes.join(' y ')}`} style={{ flexShrink: 0 }}>
                        {p.vinc + p.tarifas} pendiente{p.vinc + p.tarifas === 1 ? '' : 's'}
                      </Chip>
                    )
                  })()}
                </span>
                {e.direccion && (
                  <span style={{ ...type.label, color: colors.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.direccion}</span>
                )}
              </span>
            </span>
            <span data-col="cod" style={{ flex: '1 1 120px', minWidth: 0 }}>
              <Chip tono="neutral">
                {e.categoria_padre === 'comida' ? '🍕' : e.categoria_padre === 'farmacia' ? '💊' : '🛒'} {e.categoria_padre}
              </Chip>
            </span>
            <span data-col="tot" data-tablet-hide="true" style={{ width: 64, flexShrink: 0, ...type.body, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: colors.text }}>
              {e.rating != null ? `★ ${e.rating.toFixed(1)}` : '—'}
            </span>
            {/* ALTA administrativa — no dice si está abierto */}
            <span
              data-col="est"
              title={e.estado === 'activo'
                ? 'Alta verificada: puede aparecer en la app'
                : 'Alta sin verificar: no aparece en la app aunque esté abierto'}
              style={{ flex: '1 1 120px', minWidth: 0 }}
            >
              <EstadoBadge estado={e.estado} />
            </span>
            {/* APERTURA ahora mismo — la escribe el motor de presencia.
                Si el alta no está verificada, el restaurante NO se ve en la app
                aunque esté "abierto": el chip va en gris para no dar a entender
                que está vendiendo. */}
            <span
              data-col="pag"
              title={e.estado !== 'activo'
                ? 'No se ve en la app hasta que el alta esté verificada'
                : e.activo
                  ? 'Abierto ahora mismo (intención del dueño + app conectada)'
                  : 'Cerrado ahora mismo: no acepta pedidos'}
              style={{ flex: '1 1 110px', minWidth: 0 }}
            >
              <Chip tono={e.estado === 'activo' && e.activo ? 'sage' : 'neutral'} dot>
                {e.activo ? 'Abierto' : 'Cerrado'}
              </Chip>
            </span>
            <span
              data-col="ori"
              data-tablet-sm-hide="true"
              title={e.tiene_delivery ? 'Tiene socios/riders vinculados y activos' : 'Sin socios vinculados: solo puede vender para recoger'}
              style={{ flex: '1 1 130px', minWidth: 0 }}
            >
              <Chip tono={e.tiene_delivery ? 'sage' : 'neutral'}>
                {e.tiene_delivery ? 'Reparto' : 'Solo recogida'}
              </Chip>
            </span>
            <span data-col="acc" style={{ width: 150, flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              <MiniBtn className="admin-action-btn" onClick={() => { setDetalle(e); loadCategorias(e.id); loadEstCats(e.id); loadProductos(e.id); loadResenas(e.id) }}>Editar</MiniBtn>
              {/* Este interruptor escribe `activo` DIRECTAMENTE, la misma columna
                  que apaga el motor de presencia y la que oculta el restaurante en
                  la app del cliente. Va en `sm` (36×20) y envuelto en un span para
                  que la regla móvil `[data-col="acc"] > button { flex: 1 }` no lo
                  estire a media pantalla: no debe ser fácil de pulsar sin querer. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                <Toggle
                  size="sm"
                  on={!!e.activo}
                  tone="sage"
                  onChange={() => toggleActivo(e.id, e.activo, e.nombre)}
                  aria-label={e.activo ? `Cerrar ahora ${e.nombre}` : `Abrir ahora ${e.nombre}`}
                />
              </span>
            </span>
          </div>
        ))}
        {filtrados.length === 0 && (
          <Vacio
            titulo="Ningún establecimiento con esos filtros"
            texto={items.length === 0
              ? 'Todavía no hay ningún restaurante dado de alta.'
              : 'Prueba a quitar la búsqueda, el filtro de categoría o el de pendientes.'}
          />
        )}
      </div>

      {/* Modal crear */}
      {showCrear && (
        <div style={ds.modal} onClick={cerrarModalCrear}>
          <div className="admin-modal-content" style={ds.modalContent} onClick={e => e.stopPropagation()}>
            {!crearExito ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={ds.h3}>Crear establecimiento</h2>
                  <button onClick={cerrarModalCrear} aria-label="Cerrar" style={cerrarModalBtn}><X size={16} color={colors.text} /></button>
                </div>

                {crearError && (
                  <div style={{
                    padding: '10px 12px', borderRadius: radius.sm, marginBottom: 14,
                    background: colors.dangerSoft, border: `1px solid ${colors.danger}`,
                    color: colors.onDangerSoft, ...type.body,
                  }}>
                    {crearError}
                  </div>
                )}

                {/* SECCIÓN 1: Datos del restaurante */}
                <SectionLabel>Datos del restaurante</SectionLabel>
                <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Nombre *</label><input value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} style={ds.formInput} /></div>
                  <div><label style={ds.label}>Tipo</label><select value={form.tipo || 'restaurante'} onChange={e => setForm({ ...form, tipo: e.target.value })} style={ds.select}>
                    <option value="restaurante">Restaurante</option><option value="cafeteria">Cafetería</option><option value="supermercado">Supermercado</option><option value="farmacia">Farmacia</option><option value="tienda">Tienda</option>
                  </select></div>
                  <div><label style={ds.label}>Categoría padre</label><select value={form.categoria_padre || 'comida'} onChange={e => setForm({ ...form, categoria_padre: e.target.value })} style={ds.select}>
                    {CATEGORIAS_PADRE.map(c => <option key={c} value={c}>{c === 'comida' ? '🍕 Comida' : c === 'farmacia' ? '💊 Farmacia' : '🛒 Market'}</option>)}
                  </select></div>
                  <div><label style={ds.label}>Teléfono restaurante</label><input value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} style={ds.formInput} /></div>
                  <div><label style={ds.label}>Radio (km)</label><input type="number" value={form.radio_cobertura_km ?? 5} onChange={e => setForm({ ...form, radio_cobertura_km: +e.target.value })} style={ds.formInput} /></div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={ds.label}>Dirección *</label>
                    <AddressAutocomplete
                      value={form.direccion || ''}
                      onChange={(v) => setForm(prev => ({ ...prev, direccion: v, latitud: null, longitud: null }))}
                      onSelect={(p) => setForm(prev => ({ ...prev, direccion: p.direccion, latitud: p.latitud, longitud: p.longitud }))}
                      placeholder="Empieza a escribir y elige una sugerencia…"
                    />
                    {form.direccion && (form.latitud == null || form.longitud == null) && (
                      <div style={{
                        marginTop: 6, padding: '8px 10px', borderRadius: radius.sm,
                        background: colors.warningSoft, border: `1px solid ${colors.warning}`,
                        color: colors.onWarningSoft, ...type.body,
                      }}>
                        No has elegido una sugerencia. Las coordenadas se aproximarán al crear el restaurante.
                      </div>
                    )}
                    {form.latitud != null && form.longitud != null && (
                      <div style={{ marginTop: 6, ...type.caption, color: colors.textMute }}>
                        Coordenadas: {form.latitud.toFixed(6)}, {form.longitud.toFixed(6)}
                      </div>
                    )}
                  </div>
                  <div><label style={ds.label}>Logo</label>
                    <label style={{ ...ds.formInput, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <Upload size={14} /> {form.logo_url ? 'Logo subido ✓' : 'Subir logo'}
                      <input type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'logo_url')} />
                    </label>
                  </div>
                  <div><label style={ds.label}>Banner</label>
                    <label style={{ ...ds.formInput, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <Upload size={14} /> {form.banner_url ? 'Banner subido ✓' : 'Subir banner'}
                      <input type="file" accept="image/*" hidden onChange={e => handleUpload(e.target.files[0], 'banner_url')} />
                    </label>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Descripción</label><textarea value={form.descripcion || ''} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} style={{ ...ds.formInput, resize: 'vertical' }} /></div>
                </div>

                {/* SECCIÓN 2: Datos del dueño */}
                <SectionLabel style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
                  Datos del dueño / acceso al panel
                </SectionLabel>
                <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={ds.label}>Nombre del dueño</label><input value={duenoForm.nombre} onChange={e => setDuenoForm({ ...duenoForm, nombre: e.target.value })} style={ds.formInput} /></div>
                  <div><label style={ds.label}>Teléfono dueño</label><input value={duenoForm.telefono} placeholder={form.telefono || ''} onChange={e => setDuenoForm({ ...duenoForm, telefono: e.target.value })} style={ds.formInput} /></div>
                  <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Email del dueño *</label><input type="email" value={duenoForm.email} onChange={e => setDuenoForm({ ...duenoForm, email: e.target.value })} style={ds.formInput} placeholder="dueno@ejemplo.com" /></div>

                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={ds.label}>Contraseña</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ ...opcionPwd, borderColor: duenoForm.modoPwd === 'auto' ? colors.terracotta : colors.borderStrong, background: duenoForm.modoPwd === 'auto' ? colors.terracottaSoft : colors.cream2 }}>
                        <input type="radio" name="modoPwd" checked={duenoForm.modoPwd === 'auto'} onChange={() => setDuenoForm({ ...duenoForm, modoPwd: 'auto' })} style={{ accentColor: colors.terracotta }} />
                        Generar contraseña automática (recomendado)
                      </label>
                      <label style={{ ...opcionPwd, borderColor: duenoForm.modoPwd === 'manual' ? colors.terracotta : colors.borderStrong, background: duenoForm.modoPwd === 'manual' ? colors.terracottaSoft : colors.cream2 }}>
                        <input type="radio" name="modoPwd" checked={duenoForm.modoPwd === 'manual'} onChange={() => setDuenoForm({ ...duenoForm, modoPwd: 'manual', password: duenoForm.password || generarPasswordAleatoria(12) })} style={{ accentColor: colors.terracotta }} />
                        Establecer contraseña manual
                      </label>
                      {duenoForm.modoPwd === 'manual' && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type={showCrearPwd ? 'text' : 'password'} value={duenoForm.password} onChange={e => setDuenoForm({ ...duenoForm, password: e.target.value })} style={{ ...ds.formInput, ...type.mono, flex: '1 1 220px', minWidth: 200 }} placeholder="Mínimo 8 caracteres" />
                          <GhostBtn type="button" onClick={() => setShowCrearPwd(s => !s)} style={{ minWidth: 44, minHeight: 44, padding: 0 }} title={showCrearPwd ? 'Ocultar' : 'Mostrar'} aria-label={showCrearPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                            {showCrearPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                          </GhostBtn>
                          <GhostBtn type="button" onClick={() => setDuenoForm({ ...duenoForm, password: generarPasswordAleatoria(12) })} style={{ minHeight: 44 }}>
                            <Wand2 size={14} /> Aleatoria 12
                          </GhostBtn>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ ...type.label, color: colors.textMute, marginTop: 14 }}>
                  Al crear se generará la cuenta del dueño en <code>panel.pidoo.es</code>. Tras crear el restaurante, añade sus repartidores desde la ficha para activar Delivery.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <GhostBtn onClick={cerrarModalCrear} style={{ minHeight: 44 }} disabled={saving}>Cancelar</GhostBtn>
                  <GlossyBtn accent onClick={guardarEstablecimiento} disabled={saving || !form.nombre?.trim() || !duenoForm.email?.trim()} style={{ minHeight: 44, opacity: saving || !form.nombre?.trim() || !duenoForm.email?.trim() ? 0.5 : 1 }}>
                    {saving ? 'Creando...' : 'Crear restaurante y cuenta'}
                  </GlossyBtn>
                </div>
              </>
            ) : (
              /* PANTALLA DE ÉXITO */
              <div>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: radius.full,
                    background: colors.sageSoft, border: `2px solid ${colors.sage}`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 12,
                  }}>
                    <Check size={32} color={colors.onSageSoft} strokeWidth={3} />
                  </div>
                  <h2 style={{ ...ds.h2, marginBottom: 4 }}>✓ Restaurante creado</h2>
                  <div style={{ ...type.bodyLg, color: colors.textMute }}>{crearExito.establecimiento.nombre}</div>
                </div>

                <div style={{
                  background: colors.cream2, borderRadius: radius.md, padding: 16,
                  border: `1px solid ${colors.borderStrong}`, marginBottom: 16,
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  {/* Email */}
                  <div>
                    <SectionLabel style={{ marginBottom: 4 }}>Email</SectionLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, ...type.mono, fontSize: type.bodyLg.fontSize, color: colors.text, wordBreak: 'break-all' }}>{crearExito.dueno.email}</div>
                      <GhostBtn onClick={() => copiarTexto(crearExito.dueno.email)} style={{ minWidth: 44, minHeight: 44, padding: 0 }} title="Copiar email" aria-label="Copiar email">
                        <Copy size={16} />
                      </GhostBtn>
                    </div>
                  </div>

                  {/* Contraseña */}
                  <div>
                    <SectionLabel style={{ marginBottom: 4 }}>Contraseña</SectionLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, ...type.mono, fontSize: type.h3.fontSize, fontWeight: 700, color: colors.text, wordBreak: 'break-all', letterSpacing: 0.5 }}>
                        {showExitoPwd ? crearExito.dueno.password_temporal : '•'.repeat(crearExito.dueno.password_temporal.length)}
                      </div>
                      <GhostBtn onClick={() => setShowExitoPwd(s => !s)} style={{ minWidth: 44, minHeight: 44, padding: 0 }} title={showExitoPwd ? 'Ocultar' : 'Mostrar'} aria-label={showExitoPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                        {showExitoPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </GhostBtn>
                      <GhostBtn onClick={() => copiarTexto(crearExito.dueno.password_temporal)} style={{ minWidth: 44, minHeight: 44, padding: 0 }} title="Copiar contraseña" aria-label="Copiar contraseña">
                        <Copy size={16} />
                      </GhostBtn>
                    </div>
                  </div>

                  {/* URL */}
                  <div>
                    <SectionLabel style={{ marginBottom: 4 }}>URL para entrar</SectionLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, ...type.mono, fontSize: type.bodyLg.fontSize, color: colors.text }}>https://panel.pidoo.es</div>
                      <GhostBtn onClick={() => copiarTexto('https://panel.pidoo.es')} style={{ minWidth: 44, minHeight: 44, padding: 0 }} title="Copiar URL" aria-label="Copiar URL">
                        <Copy size={16} />
                      </GhostBtn>
                    </div>
                  </div>
                </div>

                <GlossyBtn accent full size="lg" onClick={compartirCredenciales} style={{ minHeight: 52, marginBottom: 10 }}>
                  <Share2 size={18} />
                  📤 {typeof navigator !== 'undefined' && navigator.share ? 'Compartir credenciales' : 'Copiar todo'}
                </GlossyBtn>

                <GhostBtn full onClick={cerrarModalCrear} style={{ minHeight: 44 }}>
                  Cerrar y volver a la lista
                </GhostBtn>

                <div style={{
                  marginTop: 14, padding: '10px 12px', borderRadius: radius.sm,
                  background: colors.warningSoft, border: `1px solid ${colors.warning}`,
                  ...type.label, color: colors.onWarningSoft,
                }}>
                  ⚠️ Anota o comparte la contraseña ahora — no la podrás recuperar después (siempre puedes restablecerla desde la ficha del restaurante).
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// CÓMO COBRA PIDOO A ESTE RESTAURANTE.
//
// Hasta hoy esto no se podía tocar desde ninguna pantalla: la comisión era una
// sola cifra global para los nueve, y `delivery_sin_socio` se ponía por SQL a
// mano. Por eso el trato con Max's Pizza (30 €/mes sin comisión por su tienda)
// vivía solo en la cabeza de Marlon mientras la plataforma le cobraba el 10 %.
//
// Dos ejes, y NO se tocan entre ellos:
//   · qué se cobra  -> `establecimiento_comision`, una fila por puerta de entrada
//   · quién reparte -> `establecimientos.delivery_sin_socio`
// Un restaurante puede repartir por su cuenta Y pagar el 10 %: de hecho ese es el
// estado correcto por defecto. Atarlos sería impedir esa combinación.
//
// Los presets son solo eso, atajos que escriben las mismas filas. La verdad vive
// en los datos, no en el botón.
// ──────────────────────────────────────────────────────────────────────────────
const PUERTAS = [
  { clave: 'pido',              nombre: 'Por Pidoo',        detalle: 'La app y pidoo.es' },
  { clave: 'tienda_publica',    nombre: 'Su propia tienda', detalle: 'pidoo.es/su-slug y su QR' },
  { clave: 'marketplace_socio', nombre: 'Marketplace socio', detalle: 'Poco usado' },
]

function ComisionCard({ establecimiento, onChanged }) {
  const e = establecimiento || {}
  const [tarifas, setTarifas] = useState({})   // { puerta: pct } solo las pactadas
  const [suscripcion, setSuscripcion] = useState(null) // fila viva de suscripciones_tienda
  const [global, setGlobal] = useState('10')
  const [busy, setBusy] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargar() }, [e.id])

  async function cargar() {
    if (!e.id) return
    setCargando(true)
    const [{ data: filas }, { data: cfg }, { data: sus }] = await Promise.all([
      supabase.from('establecimiento_comision').select('origen_pedido, pct').eq('establecimiento_id', e.id),
      supabase.from('configuracion_plataforma').select('valor').eq('clave', 'comision_pidoo_pct').maybeSingle(),
      // Estado real del cobro. Lo escribe el webhook de Stripe, nunca el panel:
      // aqui solo se lee para saber si el restaurante esta pagando de verdad.
      supabase.from('suscripciones_tienda')
        .select('estado, monto_mensual, fecha_proximo_pago, intentos_fallidos, stripe_subscription_id')
        .eq('establecimiento_id', e.id).maybeSingle(),
    ])
    const m = {}
    for (const f of (filas || [])) m[f.origen_pedido] = String(Number(f.pct))
    setTarifas(m)
    if (cfg?.valor) setGlobal(String(Number(cfg.valor)))
    setSuscripcion(sus?.stripe_subscription_id ? sus : null)
    setCargando(false)
  }

  // Guardar una puerta. Dejarla vacía borra el trato y vuelve al global.
  async function guardarPuerta(puerta, valor) {
    setBusy(true)
    const txt = String(valor ?? '').trim()
    let error
    if (txt === '') {
      ;({ error } = await supabase.from('establecimiento_comision').delete()
        .eq('establecimiento_id', e.id).eq('origen_pedido', puerta))
    } else {
      const n = Number(txt.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setBusy(false)
        return toast('El porcentaje tiene que estar entre 0 y 100', 'error')
      }
      ;({ error } = await supabase.from('establecimiento_comision').upsert({
        establecimiento_id: e.id, origen_pedido: puerta, pct: n,
        nota: `Puesto desde el super-admin el ${new Date().toLocaleDateString('es-ES')}`,
        actualizado_at: new Date().toISOString(),
      }, { onConflict: 'establecimiento_id,origen_pedido' }))
    }
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(txt === '' ? 'Vuelve a la comisión general' : `Guardado: ${txt} %`)
    cargar()
  }

  async function aplicarPreset(cual) {
    const ok = await confirmar(cual === 'estandar'
      ? '¿Poner a este restaurante en el trato estándar? Pagará la comisión general por todo.'
      : '¿Dejar sin comisión lo que entre por su propia tienda? Seguirá pagando la comisión general por lo que entre por Pidoo, y repartirá él sus pedidos.')
    if (!ok) return
    setBusy(true)
    let error
    if (cual === 'estandar') {
      ;({ error } = await supabase.from('establecimiento_comision').delete().eq('establecimiento_id', e.id))
      if (!error) ({ error } = await supabase.from('establecimientos')
        .update({ delivery_sin_socio: false }).eq('id', e.id))
    } else {
      ;({ error } = await supabase.from('establecimiento_comision').upsert({
        establecimiento_id: e.id, origen_pedido: 'tienda_publica', pct: 0,
        nota: 'Sin comisión en su propia tienda. Reparte por su cuenta.',
        actualizado_at: new Date().toISOString(),
      }, { onConflict: 'establecimiento_id,origen_pedido' }))
      if (!error) ({ error } = await supabase.from('establecimientos')
        .update({ delivery_sin_socio: true }).eq('id', e.id))
    }
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(cual === 'estandar' ? 'Trato estándar aplicado' : 'Aplicado: sin comisión en su tienda')
    cargar(); onChanged?.()
  }

  // ── Plan de cuota mensual ───────────────────────────────────────────────────
  // Encenderlo NO cobra nada: hace aparecer la tarjeta "Mi plan" en el panel del
  // restaurante para que el dueno meta su tarjeta. Quien da la suscripcion por
  // buena es el webhook de Stripe cuando entra el pago.
  async function togglePlanCuota() {
    const nuevo = !e.plan_cuota_mensual
    if (!nuevo && suscripcion?.estado === 'active') {
      const ok = await confirmar(
        ['Este restaurante tiene la suscripción ACTIVA en Stripe.',
         '',
         'Apagar el plan aquí NO cancela el cobro: le seguirán pasando la cuota cada mes.',
         'Para dejar de cobrarle hay que cancelar la suscripción en Stripe.',
         '',
         '¿Apagar el plan igualmente?'].join('\n'))
      if (!ok) return
    }
    setBusy(true)
    const { error } = await supabase.from('establecimientos')
      .update({ plan_cuota_mensual: nuevo }).eq('id', e.id)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'Plan de cuota mensual activado: ya puede meter su tarjeta' : 'Plan de cuota mensual apagado')
    onChanged?.()
  }

  async function toggleRepartoPropio() {
    const nuevo = !e.delivery_sin_socio
    setBusy(true)
    const { error } = await supabase.from('establecimientos')
      .update({ delivery_sin_socio: nuevo }).eq('id', e.id)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'Reparte por su cuenta: Pidoo no le busca repartidor' : 'Vuelve al reparto de Pidoo')
    onChanged?.()
  }

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
  }
  const pactadas = Object.keys(tarifas).length

  return (
    <Card style={{ marginTop: 20 }}>
      <h3 style={{ ...ds.h3, marginBottom: 4 }}>Cómo cobra Pidoo a este restaurante</h3>
      <div style={{ ...type.body, color: colors.textMute, marginBottom: 14 }}>
        Por defecto paga la comisión general ({global} %) por todo. Aquí se pactan las excepciones.
      </div>

      {cargando ? (
        <div style={{ ...type.body, color: colors.textMute, padding: 12 }}>Cargando…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <GhostBtn disabled={busy} onClick={() => aplicarPreset('estandar')}>Trato estándar</GhostBtn>
            <GhostBtn disabled={busy} onClick={() => aplicarPreset('solo_tienda')}>Sin comisión en su tienda</GhostBtn>
          </div>

          {PUERTAS.map(pu => {
            const pactada = tarifas[pu.clave] !== undefined
            return (
              <div key={pu.clave} style={{ ...rowStyle, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>{pu.nombre}</div>
                  <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
                    {pu.detalle}{pactada ? ' · trato pactado' : ` · comisión general (${global} %)`}
                  </div>
                </div>
                <input
                  type="number" step="0.5" min="0" max="100"
                  placeholder={global}
                  defaultValue={tarifas[pu.clave] ?? ''}
                  disabled={busy}
                  onBlur={ev => { if (String(ev.target.value) !== String(tarifas[pu.clave] ?? '')) guardarPuerta(pu.clave, ev.target.value) }}
                  aria-label={`Comisión para ${pu.nombre}`}
                  style={{ ...ds.formInput, width: 88, flexShrink: 0, textAlign: 'right' }}
                />
                <span style={{ ...type.label, color: colors.textMute, flexShrink: 0 }}>%</span>
              </div>
            )
          })}
          <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>
            Deja una casilla vacía para que esa puerta vuelva a la comisión general.
          </div>

          <div style={{
            ...rowStyle,
            borderColor: e.delivery_sin_socio ? colors.warning : colors.border,
            background: e.delivery_sin_socio ? colors.warningSoft : colors.cream,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>Reparte por su cuenta</div>
              <div style={{ ...type.label, color: e.delivery_sin_socio ? colors.onWarningSoft : colors.textMute, marginTop: 2 }}>
                {e.delivery_sin_socio
                  ? 'Pidoo no le busca repartidor y sus pedidos no salen como urgentes en Dispatch.'
                  : 'Sus pedidos entran en el reparto de Pidoo.'}
              </div>
            </div>
            <Toggle on={!!e.delivery_sin_socio} disabled={busy} tone="terracotta"
              onChange={toggleRepartoPropio} aria-label="Reparte por su cuenta" />
          </div>

          <div style={{
            ...rowStyle, marginTop: 10,
            borderColor: e.plan_cuota_mensual ? colors.sage : colors.border,
            background: e.plan_cuota_mensual ? colors.sageSoft : colors.cream,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>Cuota mensual en vez de comisión</div>
              <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
                {e.plan_cuota_mensual
                  ? (suscripcion?.estado === 'active'
                      ? `Al día · ${fmtEUR(Number(suscripcion.monto_mensual || 30) * 1.07)}/mes${suscripcion.fecha_proximo_pago ? ' · próximo cobro el ' + new Date(suscripcion.fecha_proximo_pago).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''}`
                      : suscripcion?.estado === 'unpaid'
                        ? 'IMPAGADA: su tienda está pausada hasta que pague.'
                        : suscripcion?.estado === 'past_due'
                          ? `Cobro fallido (intento ${suscripcion.intentos_fallidos || 1} de 3). A la tercera se le pausa la tienda.`
                          : 'Todavía no ha metido la tarjeta. Le sale el aviso en su panel.')
                  : 'Paga comisión por pedido como todos. Enciéndelo para cobrarle una cuota fija.'}
              </div>
            </div>
            <Toggle on={!!e.plan_cuota_mensual} disabled={busy} tone="terracotta"
              onChange={togglePlanCuota} aria-label="Cuota mensual en vez de comisión" />
          </div>

          {pactadas > 0 && Object.values(tarifas).some(v => Number(v) === 0) && !e.delivery_sin_socio && (
            <div style={{
              ...type.label, marginTop: 10, padding: '10px 12px', borderRadius: radius.md,
              background: colors.warningSoft, color: colors.onWarningSoft,
            }}>
              Tiene una puerta al 0 % pero sigue en el reparto de Pidoo. Esos pedidos no se le
              podrán asignar a un repartidor: o le pones comisión, o marca que reparte por su cuenta.
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Visibilidad y permisos del restaurante.
// Solo quedan los dos interruptores que MUEVEN algo de verdad (comprobado contra
// producción el 14 ago 2026): la carta de mesa y el destacado de la Home.
// ──────────────────────────────────────────────────────────────────────────────
function AltaPlanCard({ establecimiento, onChanged }) {
  const [busy, setBusy] = useState(false)
  const e = establecimiento || {}
  // El interruptor propio de esta tarjeta (46×26, naranja a pelo) se sustituye por
  // el `Toggle` del sistema: mismos permisos, mismas escrituras, un solo aspecto.
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
  }

  // ── Sale o no en el marketplace de la app del cliente ───────────────────────
  // Para los clientes de CUOTA FIJA: tienen su tienda en pidoo.es/<slug> y trabajan
  // solo por ahi, asi que no pintan nada en el listado ni en el mapa de la app.
  //
  // Es una tercera cosa, distinta de las dos que ya habia, y por eso hizo falta
  // columna propia:
  //   · `activo` = "¿esta abierto AHORA?" — lo recalcula el motor de presencia.
  //   · `estado` = "¿existe para el cliente?" — apagarlo mata TAMBIEN su tienda,
  //     porque los seis sitios de pido-app filtran `.eq('estado','activo')`,
  //     incluida la tienda por slug.
  //   · `visible_en_marketplace` = "¿se promociona en la app de Pidoo?" — solo lo
  //     miran el listado de la Home y el mapa. Su URL abre igual.
  //
  // Ojo con no confundirlo con "Destacado": destacado es salir DELANTE en el
  // carrusel; esto es salir o no salir.
  async function toggleMarketplace() {
    setBusy(true)
    const nuevo = !e.visible_en_marketplace
    const { error } = await supabase.from('establecimientos')
      .update({ visible_en_marketplace: nuevo })
      .eq('id', e.id)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo
      ? 'Vuelve a salir en la app del cliente'
      : 'Fuera del marketplace: solo se le encuentra por su URL')
    onChanged?.()
  }

  async function toggleDestacado() {
    setBusy(true)
    const nuevo = !e.destacado
    const { error } = await supabase.from('establecimientos')
      .update({ destacado: nuevo })
      .eq('id', e.id)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'Destacado en la Home de pidoo.es' : 'Quitado de destacados')
    onChanged?.()
  }

  // ── Visible en la app del cliente ───────────────────────────────────────────
  // Escribe `estado`, NO `activo`. Es la diferencia que hace que esto funcione:
  //   · `activo`  = "¿está abierto AHORA?". Lo recalcula cada minuto el motor de
  //     presencia (cron 32) según el horario y si la app del restaurante está
  //     conectada. Apagarlo a mano desde aquí duraría 60 segundos, y además el
  //     trigger `trg_establecimientos_intencion_apertura` lo leería como si el
  //     DUEÑO hubiera cerrado su local.
  //   · `estado`  = "¿existe para el cliente?". No lo toca ningún cron, y
  //     `guard_establecimientos_protected_fields` se lo congela al dueño: solo lo
  //     cambia el super-admin.
  //
  // Con `estado='pausado'` el restaurante desaparece de Home, Mapa, Favoritos, la
  // tienda pública y los deep links (los seis sitios de pido-app filtran
  // `.eq('estado','activo')`), y además `enforce_restaurante_abierto` rechaza
  // cualquier pedido con PD101 aunque alguien tuviera la ficha ya abierta.
  // 'pausado' ya estaba permitido por el CHECK de la columna y no lo usaba nadie.
  // Nada lo revierte solo: `autoactivar_alta_confirmada` solo actúa sobre
  // 'pendiente_verificacion'.
  //
  // Por eso esto NO necesita tocar pido-app ni compilar una build nativa.
  const visibleEnApp = e.estado === 'activo'
  const pendienteDeAlta = e.estado === 'pendiente_verificacion' || e.estado === 'rechazado'

  async function toggleVisibleEnApp() {
    const nuevo = visibleEnApp ? 'pausado' : 'activo'
    if (!visibleEnApp && pendienteDeAlta) {
      return toast('Este restaurante está en "' + e.estado + '": termina su alta antes de publicarlo', 'error')
    }
    setBusy(true)
    const { error } = await supabase.from('establecimientos')
      .update({ estado: nuevo })
      .eq('id', e.id)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo === 'activo'
      ? 'Visible en la app del cliente'
      : 'Oculto: ya no aparece en la app y no puede recibir pedidos')
    onChanged?.()
  }

  // Carta del local (QR de mesa). Solo la puede activar el super-admin: el
  // trigger guard_establecimientos_protected_fields la congela para el dueño,
  // porque es la palanca con la que podría empujar su volumen fuera de Pidoo.
  async function toggleCartaLocal() {
    const nuevo = !e.carta_local_activa
    if (nuevo && !e.slug) return toast('Primero ponle un slug al restaurante', 'error')
    setBusy(true)
    const { error } = await supabase.from('establecimientos')
      .update({ carta_local_activa: nuevo })
      .eq('id', e.id)
    setBusy(false)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'Carta del local activada' : 'Carta del local desactivada')
    onChanged?.()
  }

  return (
    <Card style={{ marginTop: 20 }}>
      {/* 14 ago 2026: fuera la fila "Alta de 150 EUR (efectivo)" y la frase que
          la explicaba. El alta se cobra en mano y fuera de la plataforma, así
          que no pinta nada en una tarjeta de permisos; y el interruptor no lo
          había usado nadie (0 de 9 restaurantes marcados). La columna
          `alta_150_cobrada` se queda en la base de datos por si algún día se
          quiere un registro de cobros, pero no se toca desde aquí. */}
      <h3 style={{ ...ds.h3, marginBottom: 4 }}>Visibilidad y permisos</h3>
      <div style={{ ...type.body, color: colors.textMute, marginBottom: 14 }}>
        Donde aparece este restaurante y que paginas publicas tiene abiertas.
      </div>

      {/* 14 ago 2026: aqui habia un interruptor "Tienda publica" que escribia
          `establecimientos.plan_pro`. NO LO LEIA NADIE: en los cuatro repos solo
          aparecia dentro de dos `select(...)` sin usarse, y en la base de datos
          solo lo menciona el trigger que se lo congela al dueno. Comprobado
          contra produccion: Rincon de Fran tiene plan_pro=false y su tienda
          `pidoo.es/rincon-de-fran` carga entera. Era un resto del plan SaaS de
          39 EUR/mes, cuando decidia si se usaba `precio_tienda_publica` (columna
          hoy muerta: un trigger la iguala a `precio`).
          Un interruptor que miente es peor que ninguno: se puede apagar creyendo
          que se cierra una tienda. La pagina publica es gratis y esta siempre
          abierta; lo que de verdad la cierra es `activo` + el horario, que se
          gobiernan desde "Horario y estado". Aqui queda el enlace para verla. */}
      {/* Va la PRIMERA porque es la que decide si el restaurante existe o no para
          el cliente; todo lo demás de esta tarjeta es secundario si está oculto. */}
      <div style={{
        ...rowStyle,
        marginBottom: 10,
        // Cuando está oculto se ve, sin tener que leer: el interruptor es lo
        // único de esta pantalla que puede dejar a un restaurante sin ventas.
        borderColor: visibleEnApp ? colors.border : colors.warning,
        background: visibleEnApp ? colors.cream : colors.warningSoft,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            Visible en la app del cliente
          </div>
          <div style={{ ...type.label, color: visibleEnApp ? colors.textMute : colors.onWarningSoft, marginTop: 2 }}>
            {pendienteDeAlta
              ? `Su alta está en "${e.estado}": termina el alta para poder publicarlo.`
              : visibleEnApp
                ? 'Sale en el listado, el mapa, los favoritos y su página pública.'
                : 'OCULTO: no aparece en ningún sitio de la app y no puede recibir pedidos. Su horario y sus pedidos en curso no se tocan.'}
          </div>
        </div>
        <Toggle
          on={visibleEnApp}
          disabled={busy || pendienteDeAlta}
          tone="terracotta"
          onChange={toggleVisibleEnApp}
          aria-label="Visible en la app del cliente"
        />
      </div>

      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>Tienda publica</div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            {e.slug
              ? 'Gratis y siempre abierta. Se cierra al cliente desde "Horario y estado", no desde aqui.'
              : 'Este restaurante no tiene slug, asi que no tiene pagina publica.'}
          </div>
        </div>
        {e.slug && (
          <a
            href={`https://pidoo.es/${e.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...type.label, fontWeight: 600, color: colors.terracotta2,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            pidoo.es/{e.slug} <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div style={{ ...rowStyle, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            Carta del local {e.slug ? `(pidoo.es/${e.slug}/carta)` : ''}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            QR de mesa con precios propios del local. Solo carta: desde ahi no se puede pedir ni pagar,
            asi que no afecta a la comision ni a la liquidacion.
          </div>
        </div>
        <Toggle on={!!e.carta_local_activa} disabled={busy} tone="terracotta" onChange={toggleCartaLocal} aria-label="Carta del local (QR de mesa)" />
      </div>

      {e.carta_local_activa && <AvisoSaltoPrecios establecimientoId={e.id} />}

      <div style={{
        ...rowStyle, marginTop: 10,
        borderColor: e.visible_en_marketplace === false ? colors.warning : colors.border,
        background: e.visible_en_marketplace === false ? colors.warningSoft : colors.cream,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>Sale en la app del cliente</div>
          <div style={{
            ...type.label, marginTop: 2,
            color: e.visible_en_marketplace === false ? colors.onWarningSoft : colors.textMute,
          }}>
            {e.visible_en_marketplace === false
              ? `Fuera del listado, de Destacados y del mapa. Solo se le encuentra por ${e.slug ? `pidoo.es/${e.slug}` : 'su URL'}, que sigue funcionando con su carta, su recogida y su delivery.`
              : 'Aparece en el listado, en el mapa y puede entrar en Destacados. Apagalo para los clientes de cuota fija que solo trabajan por su propia URL.'}
          </div>
        </div>
        <Toggle on={e.visible_en_marketplace !== false} disabled={busy} tone="terracotta"
          onChange={toggleMarketplace} aria-label="Sale en la app del cliente" />
      </div>

      <div style={{ ...rowStyle, marginTop: 10, opacity: e.visible_en_marketplace === false ? 0.5 : 1 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>Destacado en la Home</div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            {e.visible_en_marketplace === false
              ? 'No hace nada mientras no salga en la app del cliente.'
              : 'Sale en el carrusel "Destacados" de pidoo.es, por delante de los automaticos por rating. Ojo: ahi entra solo todo el que tenga 4,5 o mas de nota, este marcado o no.'}
          </div>
        </div>
        <Toggle on={!!e.destacado} disabled={busy} tone="terracotta" onChange={toggleDestacado} aria-label="Destacado en la Home de pidoo.es" />
      </div>
    </Card>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * AvisoSaltoPrecios — cuánto sube un plato del local al domicilio.
 *
 * El QR de la mesa enseña `precio_local` y la app enseña `precio`. Cuando la
 * diferencia es grande, el QR trabaja EN CONTRA de la app: el cliente paga 7,80 €
 * por un sándwich en la mesa, se descarga Pidoo porque se lo hemos sugerido, y ve
 * el mismo sándwich a 15,50 €. No piensa "el reparto": piensa que le engañamos.
 *
 * Medido el 18 ago en Café Bar Australia: de 30 platos a la venta, 24 subían más
 * de un 25 % y 14 costaban más del doble. Por eso este aviso está aquí, pegado al
 * interruptor: para verlo ANTES de imprimir el QR y pegarlo en las mesas.
 *
 * Solo mira los productos que se pueden PEDIR (`disponible = true`). Los de
 * `solo_carta_local` no se venden a domicilio, así que comparar sus precios no
 * significa nada — y son mayoría (120 de 150 en Australia): incluirlos diluía la
 * media hasta hacerla inútil.
 * ────────────────────────────────────────────────────────────────────────── */
const SALTO_AVISO_PCT = 25

function AvisoSaltoPrecios({ establecimientoId }) {
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    if (!establecimientoId) return
    let vivo = true
    supabase
      .from('productos')
      .select('nombre, precio, precio_local')
      .eq('establecimiento_id', establecimientoId)
      .eq('disponible', true)
      .not('precio_local', 'is', null)
      .then(({ data }) => {
        if (!vivo) return
        const filas = (data || [])
          .filter(p => Number(p.precio_local) > 0)
          .map(p => ({
            nombre: p.nombre,
            pct: Math.round((Number(p.precio) - Number(p.precio_local)) / Number(p.precio_local) * 100),
          }))
        setDatos({
          total: filas.length,
          pasados: filas.filter(f => f.pct > SALTO_AVISO_PCT).length,
          dobles: filas.filter(f => f.pct >= 100).length,
          // Un plato más barato a domicilio que en la mesa no lo explica nadie.
          invertidos: filas.filter(f => f.pct < 0).length,
          peor: filas.sort((a, b) => b.pct - a.pct)[0] || null,
        })
      })
    return () => { vivo = false }
  }, [establecimientoId])

  if (!datos || datos.total === 0) return null
  if (datos.pasados === 0 && datos.invertidos === 0) return null

  return (
    <div style={{
      marginTop: 8, padding: '10px 12px', borderRadius: radius.sm,
      background: colors.warningSoft, border: `1px solid ${colors.warning}`,
    }}>
      <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
        {datos.pasados > 0
          ? `${datos.pasados} de ${datos.total} platos suben más de un ${SALTO_AVISO_PCT} % a domicilio`
          : `${datos.invertidos} plato${datos.invertidos === 1 ? '' : 's'} cuesta${datos.invertidos === 1 ? '' : 'n'} menos a domicilio que en el local`}
      </div>
      <div style={{ ...type.label, color: colors.onWarningSoft, marginTop: 3, lineHeight: 1.5 }}>
        {datos.dobles > 0 && <>· <strong>{datos.dobles}</strong> cuesta{datos.dobles === 1 ? '' : 'n'} más del doble.<br /></>}
        {datos.peor && datos.peor.pct > SALTO_AVISO_PCT && <>· El mayor salto es «{datos.peor.nombre}», un +{datos.peor.pct} %.<br /></>}
        {datos.invertidos > 0 && datos.pasados > 0 && <>· Y {datos.invertidos} {datos.invertidos === 1 ? 'es más barato' : 'son más baratos'} a domicilio, que no lo explica nadie.<br /></>}
        El cliente ve el precio del local en la mesa y este otro en la app. Con saltos así,
        el QR le quita las ganas de pedir a casa en vez de dárselas.
      </div>
    </div>
  )
}
