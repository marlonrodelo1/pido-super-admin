import { useEffect, useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, Tag, AlertTriangle, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors, type } from '../lib/darkStyles'
import { Card, Chip, GhostBtn, GlossyBtn, MiniBtn, Toggle, Vacio, fmtEUR } from '../lib/ui'
import { toast, confirmar } from '../App'

// Promociones de TODOS los restaurantes desde un solo sitio.
//
// Hasta ahora solo se podían crear desde el panel del restaurante — que además
// únicamente ofrece 4 de los 6 tipos — o a pelo por SQL, que es como se
// montaron las de Mamma Mia, Rincón de Fran y Octava Isla.
//
// Ojo con dónde se aplica cada tipo, porque no todos viven en el mismo sitio:
//   · descuento_porcentaje / descuento_fijo / 2x1 / producto_gratis -> los
//     resuelve el CARRITO de pido-app. Los cuatro los soporta desde siempre,
//     así que el cambio llega también a los móviles ya instalados.
//   · combo -> solo escaparate: el precio ya está cerrado en un producto de la
//     carta y el motor del carrito NUNCA descuenta nada.
//   · regalo_por_cantidad -> lo resuelve un TRIGGER en el servidor
//     (`aplicar_regalo_por_cantidad`), así que funciona igual en web, en la app
//     vieja, en efectivo y por teléfono, y sale en la comanda impresa.
// Por eso esta pantalla no calcula nada: solo escribe la fila.

const TIPOS = [
  {
    id: 'regalo_por_cantidad', label: 'Regalo por cantidad', icon: '🎁',
    desc: 'Compra N unidades de unos productos y se añade solo un regalo a 0 €. Lo aplica el servidor: funciona en la app ya instalada, en efectivo y por teléfono.',
    campos: { regalo: true, condicion: true, cantidad: true },
  },
  {
    id: 'producto_gratis', label: 'Producto gratis por importe', icon: '🥤',
    desc: 'Un producto gratis al superar un importe mínimo. Lo resuelve el carrito y NO mira cantidades: salta con cualquier pedido que llegue al mínimo.',
    campos: { regalo: true, minimo: true },
  },
  {
    id: 'descuento_porcentaje', label: '% sobre el total', icon: '🏷️',
    desc: 'Descuento en porcentaje sobre el total del carrito.',
    campos: { valor: true, minimo: true, sufijo: '%' },
  },
  {
    id: 'descuento_fijo', label: '€ de descuento', icon: '💰',
    desc: 'Descuento de una cantidad fija en euros.',
    campos: { valor: true, minimo: true, sufijo: '€' },
  },
  {
    id: '2x1', label: '2x1', icon: '🔥',
    desc: 'Lleva 2 y paga 1 del MISMO producto. No sirve para "compra A y te regalo B".',
    campos: { producto: true },
  },
  {
    id: 'combo', label: 'Combo (solo escaparate)', icon: '📣',
    desc: 'Solo anuncia. El precio ya está cerrado en un producto de la carta y no se descuenta nada. Es como está montada la de Rincón de Fran.',
    campos: { escaparate: true },
  },
]
const tipoDe = (id) => TIPOS.find((t) => t.id === id) || null

const hoyMas = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)

export default function Promociones() {
  const [promos, setPromos] = useState([])
  const [ests, setEsts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEst, setFiltroEst] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState(null)   // null = cerrado
  const [catalogo, setCatalogo] = useState({ productos: [], categorias: [] })
  const [guardando, setGuardando] = useState(false)
  // nombres de producto/categoría por id, para describir la condición en la tabla
  const [nombres, setNombres] = useState({})

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [pRes, eRes] = await Promise.all([
      supabase.from('promociones')
        .select('*, establecimientos(id, nombre)')
        .order('created_at', { ascending: false }),
      supabase.from('establecimientos').select('id, nombre').eq('estado', 'activo').order('nombre'),
    ])
    if (pRes.error) {
      toast('No se pudieron cargar las promociones: ' + pRes.error.message, 'error')
      setLoading(false)
      return
    }
    const filas = pRes.data || []
    setPromos(filas)
    setEsts(eRes.data || [])

    // Resolver los nombres de lo que condiciona cada promo y del producto
    // regalo, para que la tabla diga "2 x Pollo asado" y no un uuid.
    const ids = new Set()
    const cats = new Set()
    for (const p of filas) {
      if (p.producto_id) ids.add(p.producto_id)
      for (const x of (p.condicion_producto_ids || [])) ids.add(x)
      for (const x of (p.condicion_categoria_ids || [])) cats.add(x)
    }
    const mapa = {}
    if (ids.size) {
      const { data } = await supabase.from('productos').select('id, nombre, precio').in('id', [...ids])
      for (const x of (data || [])) mapa[x.id] = { nombre: x.nombre, precio: x.precio }
    }
    if (cats.size) {
      const { data } = await supabase.from('categorias').select('id, nombre').in('id', [...cats])
      for (const x of (data || [])) mapa[x.id] = { nombre: x.nombre }
    }
    setNombres(mapa)
    setLoading(false)
  }

  // El catálogo del restaurante se carga al abrir el formulario, no antes:
  // traerse los productos de los nueve restaurantes de golpe eran cientos de
  // filas para nada.
  async function cargarCatalogo(estId) {
    if (!estId) { setCatalogo({ productos: [], categorias: [] }); return }
    const [pRes, cRes] = await Promise.all([
      supabase.from('productos').select('id, nombre, precio, disponible, categoria_id')
        .eq('establecimiento_id', estId).order('nombre'),
      supabase.from('categorias').select('id, nombre').eq('establecimiento_id', estId).order('orden'),
    ])
    setCatalogo({ productos: pRes.data || [], categorias: cRes.data || [] })
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return promos.filter((p) => {
      if (filtroEst !== 'todos' && p.establecimiento_id !== filtroEst) return false
      if (filtroEstado === 'activas' && !p.activa) return false
      if (filtroEstado === 'inactivas' && p.activa) return false
      if (q && !((p.titulo || '') + ' ' + (p.establecimientos?.nombre || '')).toLowerCase().includes(q)) return false
      return true
    })
  }, [promos, filtroEst, filtroEstado, busca])

  // Aviso real: el trigger coge UNA sola promo `regalo_por_cantidad` por
  // restaurante (order by created_at limit 1). Con dos activas, la segunda no
  // se aplica nunca y en silencio.
  const duplicadasRegalo = useMemo(() => {
    const cuenta = {}
    for (const p of promos) {
      if (p.tipo !== 'regalo_por_cantidad' || !p.activa) continue
      cuenta[p.establecimiento_id] = (cuenta[p.establecimiento_id] || 0) + 1
    }
    return new Set(Object.keys(cuenta).filter((k) => cuenta[k] > 1))
  }, [promos])

  function resumen(p) {
    const n = (id) => nombres[id]?.nombre || '—'
    if (p.tipo === 'regalo_por_cantidad') {
      const cond = (p.condicion_producto_ids || []).length
        ? (p.condicion_producto_ids || []).map(n).join(' o ')
        : (p.condicion_categoria_ids || []).map(n).join(' o ')
      return (p.condicion_cantidad || 2) + ' x ' + (cond || '—') + ' → ' + (p.producto_nombre || n(p.producto_id)) + ' gratis'
    }
    if (p.tipo === 'producto_gratis') {
      // La de Rincón de Fran tiene `producto_id` a NULL A PROPÓSITO: así el
      // motor del carrito nunca lo encuentra y no descuenta nada (es puro
      // escaparate). Por eso aquí manda el nombre escrito a mano.
      const qué = p.producto_nombre || n(p.producto_id)
      const desde = Number(p.minimo_compra) > 0 ? ' desde ' + fmtEUR(p.minimo_compra) : ''
      return qué + ' gratis' + desde
    }
    if (p.tipo === 'descuento_porcentaje') return '-' + (p.valor || 0) + '%' + (Number(p.minimo_compra) > 0 ? ' desde ' + fmtEUR(p.minimo_compra) : '')
    if (p.tipo === 'descuento_fijo') return '-' + fmtEUR(p.valor || 0) + (Number(p.minimo_compra) > 0 ? ' desde ' + fmtEUR(p.minimo_compra) : '')
    if (p.tipo === '2x1') return '2x1 en ' + n(p.producto_id)
    if (p.tipo === 'combo') return 'Solo escaparate, sin descuento'
    return '—'
  }

  async function alternar(p) {
    const { error } = await supabase.from('promociones').update({ activa: !p.activa }).eq('id', p.id)
    if (error) { toast('No se pudo cambiar: ' + error.message, 'error'); return }
    setPromos((xs) => xs.map((x) => (x.id === p.id ? { ...x, activa: !x.activa } : x)))
    toast(p.activa ? 'Promoción pausada' : 'Promoción activada', 'success')
  }

  async function borrar(p) {
    const ok = await confirmar('¿Borrar "' + p.titulo + '"? No se puede deshacer.')
    if (!ok) return
    const { error } = await supabase.from('promociones').delete().eq('id', p.id)
    if (error) { toast('No se pudo borrar: ' + error.message, 'error'); return }
    setPromos((xs) => xs.filter((x) => x.id !== p.id))
    toast('Promoción borrada', 'success')
  }

  function abrir(p) {
    const base = p || {
      establecimiento_id: filtroEst !== 'todos' ? filtroEst : '',
      tipo: 'regalo_por_cantidad', titulo: '', descripcion: '',
      valor: '', minimo_compra: '', producto_id: '', producto_nombre: '',
      condicion_producto_ids: [], condicion_categoria_ids: [], condicion_cantidad: 2,
      fecha_fin: '', activa: true,
    }
    setForm({
      ...base,
      valor: base.valor ?? '',
      minimo_compra: base.minimo_compra ?? '',
      producto_id: base.producto_id || '',
      producto_nombre: base.producto_nombre || '',
      condicion_producto_ids: base.condicion_producto_ids || [],
      condicion_categoria_ids: base.condicion_categoria_ids || [],
      condicion_cantidad: base.condicion_cantidad || 2,
      fecha_fin: base.fecha_fin ? String(base.fecha_fin).slice(0, 10) : '',
      _editando: !!p,
    })
    cargarCatalogo(base.establecimiento_id)
  }

  async function guardar() {
    if (!form || guardando) return
    const t = tipoDe(form.tipo)
    if (!form.establecimiento_id) { toast('Elige el restaurante', 'error'); return }
    if (!form.titulo.trim()) { toast('Ponle un título: es lo que ve el cliente', 'error'); return }

    if (t?.campos?.regalo && !form.producto_id) { toast('Elige el producto que se regala', 'error'); return }
    if (t?.campos?.producto && !form.producto_id) { toast('Elige el producto', 'error'); return }
    if (t?.campos?.valor && !(Number(form.valor) > 0)) { toast('El valor del descuento tiene que ser mayor que 0', 'error'); return }
    if (t?.campos?.condicion) {
      const nCond = (form.condicion_producto_ids || []).length + (form.condicion_categoria_ids || []).length
      if (!nCond) { toast('Marca con qué productos (o categorías) salta la promo', 'error'); return }
      if (!(Number(form.condicion_cantidad) >= 1)) { toast('La cantidad tiene que ser 1 o más', 'error'); return }
    }
    // El regalo TIENE que estar a 0: `enforce_pedido_item_precio` sube al precio
    // del producto cualquier línea que llegue por debajo, así que un regalo
    // apuntando al producto normal se re-facturaría solo y lo pagaría el cliente.
    if (form.tipo === 'regalo_por_cantidad') {
      const prod = catalogo.productos.find((x) => x.id === form.producto_id)
      if (prod && Number(prod.precio) > 0) {
        toast('"' + prod.nombre + '" cuesta ' + fmtEUR(prod.precio) + '. El producto regalo debe estar a 0 € o el cliente acabará pagándolo.', 'error')
        return
      }
    }

    setGuardando(true)
    const esProd = !!(t?.campos?.regalo || t?.campos?.producto)
    const fila = {
      establecimiento_id: form.establecimiento_id,
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion?.trim() || null,
      valor: t?.campos?.valor ? Number(form.valor) : null,
      minimo_compra: t?.campos?.minimo ? Number(form.minimo_compra || 0) : 0,
      producto_id: esProd ? form.producto_id : null,
      producto_nombre: esProd
        ? (form.producto_nombre?.trim() || catalogo.productos.find((x) => x.id === form.producto_id)?.nombre || null)
        : (form.producto_nombre?.trim() || null),
      condicion_producto_ids: t?.campos?.condicion && form.condicion_producto_ids.length ? form.condicion_producto_ids : null,
      condicion_categoria_ids: t?.campos?.condicion && form.condicion_categoria_ids.length ? form.condicion_categoria_ids : null,
      condicion_cantidad: t?.campos?.cantidad ? Number(form.condicion_cantidad) : null,
      fecha_fin: form.fecha_fin ? new Date(form.fecha_fin + 'T23:59:59').toISOString() : null,
      activa: !!form.activa,
    }
    const res = form._editando && form.id
      ? await supabase.from('promociones').update(fila).eq('id', form.id)
      : await supabase.from('promociones').insert(fila)
    setGuardando(false)
    if (res.error) { toast('No se pudo guardar: ' + res.error.message, 'error'); return }
    toast(form._editando ? 'Promoción actualizada' : 'Promoción creada', 'success')
    setForm(null)
    cargar()
  }

  const t = form ? tipoDe(form.tipo) : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={ds.h1}>Promociones</h1>
          <div style={{ ...ds.caption, marginTop: 4 }}>
            Las de todos los restaurantes. Se activan y se pausan aquí mismo.
          </div>
        </div>
        <GlossyBtn accent onClick={() => abrir(null)}><Plus size={15} /> Nueva promoción</GlossyBtn>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: 12, color: colors.textMute }} />
            <input style={{ ...ds.input, paddingLeft: 32, width: 220 }} placeholder="Buscar…"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select style={{ ...ds.select, width: 240 }} value={filtroEst} onChange={(e) => setFiltroEst(e.target.value)}>
            <option value="todos">Todos los restaurantes</option>
            {ests.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <select style={{ ...ds.select, width: 170 }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="activas">Solo activas</option>
            <option value="inactivas">Solo pausadas</option>
          </select>
          <div style={{ marginLeft: 'auto', ...ds.caption }}>
            {filtradas.length} de {promos.length}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card><div style={ds.muted}>Cargando…</div></Card>
      ) : filtradas.length === 0 ? (
        <Card pad={0}>
          <Vacio icon={<Tag size={22} />} titulo="Sin promociones"
            texto="Crea la primera con el botón de arriba."
            accion={<GlossyBtn accent onClick={() => abrir(null)}><Plus size={15} /> Nueva promoción</GlossyBtn>} />
        </Card>
      ) : (
        <div style={ds.table}>
          <div style={ds.tableHeader}>
            <div style={{ flex: '1.2 1 150px' }}>Restaurante</div>
            <div style={{ flex: '2 1 260px' }}>Promoción</div>
            <div style={{ flex: '1 1 130px' }}>Tipo</div>
            <div style={{ flex: '0 0 90px', textAlign: 'center' }}>Activa</div>
            <div style={{ flex: '0 0 84px' }} />
          </div>
          {filtradas.map((p) => {
            const tp = tipoDe(p.tipo)
            const avisa = p.tipo === 'regalo_por_cantidad' && p.activa && duplicadasRegalo.has(p.establecimiento_id)
            return (
              <div key={p.id} style={ds.tableRow}>
                <div style={{ flex: '1.2 1 150px', fontWeight: 600 }}>{p.establecimientos?.nombre || '—'}</div>
                <div style={{ flex: '2 1 260px' }}>
                  <div style={{ fontWeight: 600 }}>{p.titulo}</div>
                  <div style={{ ...ds.caption, marginTop: 2 }}>{resumen(p)}</div>
                  {p.fecha_fin && (
                    <div style={{ ...ds.caption, marginTop: 2 }}>
                      Hasta el {new Date(p.fecha_fin).toLocaleDateString('es-ES')}
                    </div>
                  )}
                  {avisa && (
                    <div style={{ ...ds.caption, marginTop: 4, color: colors.warning, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={12} /> Hay otra de regalo activa aquí: solo se aplica la más antigua
                    </div>
                  )}
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <Chip tono={p.tipo === 'regalo_por_cantidad' ? 'sage' : p.tipo === 'combo' ? 'info' : 'neutral'}>
                    {tp ? tp.icon + ' ' + tp.label : p.tipo}
                  </Chip>
                </div>
                <div style={{ flex: '0 0 90px', display: 'flex', justifyContent: 'center' }}>
                  <Toggle on={p.activa} onChange={() => alternar(p)} aria-label={p.activa ? 'Pausar' : 'Activar'} />
                </div>
                <div style={{ flex: '0 0 84px', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <MiniBtn onClick={() => abrir(p)} title="Editar"><Edit2 size={13} /></MiniBtn>
                  <MiniBtn danger onClick={() => borrar(p)} title="Borrar"><Trash2 size={13} /></MiniBtn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && (
        <div style={ds.modal} onClick={(e) => { if (e.target === e.currentTarget) setForm(null) }}>
          <div style={{ ...ds.modalContent, maxWidth: 620 }}>
            <h2 style={ds.h2}>{form._editando ? 'Editar promoción' : 'Nueva promoción'}</h2>

            <label style={ds.label}>Restaurante</label>
            <select style={ds.select} value={form.establecimiento_id} disabled={form._editando}
              onChange={(e) => {
                setForm({ ...form, establecimiento_id: e.target.value, producto_id: '', condicion_producto_ids: [], condicion_categoria_ids: [] })
                cargarCatalogo(e.target.value)
              }}>
              <option value="">Elige…</option>
              {ests.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>

            <label style={{ ...ds.label, marginTop: 14 }}>Tipo</label>
            <select style={ds.select} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.label}</option>)}
            </select>
            {t?.desc && <div style={{ ...ds.caption, marginTop: 6, lineHeight: 1.45 }}>{t.desc}</div>}

            <label style={{ ...ds.label, marginTop: 14 }}>Título (lo ve el cliente)</label>
            <input style={ds.formInput} value={form.titulo} maxLength={80}
              placeholder="2 pollos asados = refresco 1,5 L gratis"
              onChange={(e) => setForm({ ...form, titulo: e.target.value })} />

            <label style={{ ...ds.label, marginTop: 14 }}>Descripción (opcional)</label>
            <input style={ds.formInput} value={form.descripcion || ''} maxLength={200}
              placeholder="Pide dos pollos asados y te regalamos un refresco de 1,5 L."
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />

            {t?.campos?.condicion && (
              <>
                <label style={{ ...ds.label, marginTop: 14 }}>¿Con qué salta?</label>
                <div style={{ ...ds.caption, marginBottom: 8, lineHeight: 1.45 }}>
                  Marca productos concretos. Si marcas una categoría entera cuenta CUALQUIER producto
                  de ella: mira antes qué más vive ahí dentro.
                </div>
                <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid ' + colors.border, borderRadius: 8, padding: 10 }}>
                  {catalogo.productos.filter((x) => Number(x.precio) > 0).map((x) => {
                    const on = form.condicion_producto_ids.includes(x.id)
                    return (
                      <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: type.body.fontSize }}>
                        <input type="checkbox" checked={on} onChange={() => setForm({
                          ...form,
                          condicion_producto_ids: on
                            ? form.condicion_producto_ids.filter((y) => y !== x.id)
                            : [...form.condicion_producto_ids, x.id],
                        })} />
                        <span style={{ flex: 1 }}>{x.nombre}</span>
                        <span style={ds.caption}>{fmtEUR(x.precio)}</span>
                      </label>
                    )
                  })}
                  {catalogo.productos.length === 0 && <div style={ds.muted}>Elige antes el restaurante.</div>}
                </div>

                <label style={{ ...ds.label, marginTop: 14 }}>…o por categoría entera</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {catalogo.categorias.map((c) => {
                    const on = form.condicion_categoria_ids.includes(c.id)
                    return (
                      <Chip key={c.id} tono={on ? 'sage' : 'neutral'} onClick={() => setForm({
                        ...form,
                        condicion_categoria_ids: on
                          ? form.condicion_categoria_ids.filter((y) => y !== c.id)
                          : [...form.condicion_categoria_ids, c.id],
                      })}>{c.nombre}</Chip>
                    )
                  })}
                </div>
              </>
            )}

            {t?.campos?.cantidad && (
              <>
                <label style={{ ...ds.label, marginTop: 14 }}>¿Cuántas unidades hacen falta?</label>
                <input style={{ ...ds.formInput, width: 120 }} type="number" min={1} value={form.condicion_cantidad}
                  onChange={(e) => setForm({ ...form, condicion_cantidad: e.target.value })} />
              </>
            )}

            {(t?.campos?.regalo || t?.campos?.producto) && (
              <>
                <label style={{ ...ds.label, marginTop: 14 }}>
                  {t.campos.regalo ? 'Producto que se regala' : 'Producto'}
                </label>
                <select style={ds.select} value={form.producto_id}
                  onChange={(e) => {
                    const prod = catalogo.productos.find((x) => x.id === e.target.value)
                    setForm({ ...form, producto_id: e.target.value, producto_nombre: form.producto_nombre || prod?.nombre || '' })
                  }}>
                  <option value="">Elige…</option>
                  {catalogo.productos.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre} — {fmtEUR(x.precio)}{Number(x.precio) === 0 ? ' (regalo)' : ''}
                    </option>
                  ))}
                </select>
                {form.tipo === 'regalo_por_cantidad' && (
                  <div style={{ ...ds.caption, marginTop: 6, lineHeight: 1.45 }}>
                    Tiene que estar a <b>0 €</b> y oculto de la carta. Si no, el servidor lo re-factura
                    y acaba pagándolo el cliente.
                  </div>
                )}
                <label style={{ ...ds.label, marginTop: 14 }}>Cómo se llama en el ticket</label>
                <input style={ds.formInput} value={form.producto_nombre || ''} maxLength={60}
                  placeholder="Refresco 1,5 L"
                  onChange={(e) => setForm({ ...form, producto_nombre: e.target.value })} />
              </>
            )}

            {t?.campos?.valor && (
              <>
                <label style={{ ...ds.label, marginTop: 14 }}>Valor del descuento ({t.campos.sufijo})</label>
                <input style={{ ...ds.formInput, width: 140 }} type="number" min={0} step="0.01" value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </>
            )}

            {t?.campos?.minimo && (
              <>
                <label style={{ ...ds.label, marginTop: 14 }}>Importe mínimo del pedido (€)</label>
                <input style={{ ...ds.formInput, width: 140 }} type="number" min={0} step="0.01" value={form.minimo_compra}
                  placeholder="0" onChange={(e) => setForm({ ...form, minimo_compra: e.target.value })} />
              </>
            )}

            <label style={{ ...ds.label, marginTop: 14 }}>Hasta cuándo (opcional)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...ds.formInput, width: 180 }} type="date" value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
              <GhostBtn size="sm" onClick={() => setForm({ ...form, fecha_fin: hoyMas(7) })}>7 días</GhostBtn>
              <GhostBtn size="sm" onClick={() => setForm({ ...form, fecha_fin: hoyMas(30) })}>30 días</GhostBtn>
              {form.fecha_fin && <GhostBtn size="sm" onClick={() => setForm({ ...form, fecha_fin: '' })}>Sin fin</GhostBtn>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
              <Toggle on={form.activa} onChange={() => setForm({ ...form, activa: !form.activa })} aria-label="Activa" />
              <span style={ds.body}>{form.activa ? 'Se activa al guardar' : 'Se guarda pausada'}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
              <GhostBtn onClick={() => setForm(null)}>Cancelar</GhostBtn>
              <GlossyBtn accent onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : form._editando ? 'Guardar cambios' : 'Crear promoción'}
              </GlossyBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
