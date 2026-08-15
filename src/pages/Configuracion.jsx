import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, GlossyBtn, GhostBtn, SectionLabel, Toggle, Vacio, fmtEUR } from '../lib/ui'
import { Trash2, Truck, DollarSign, MapPin, Zap, Tags, FileText, ChevronLeft, Plus, Check } from 'lucide-react'

// Sanitizar HTML para prevenir XSS (mismo patron que PaginaLegal.jsx)
function sanitizeHtml(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, form').forEach(el => el.remove())
  doc.querySelectorAll('*').forEach(el => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}

export default function Configuracion() {
  // Configuración de plataforma (desde DB)
  const [config, setConfig] = useState({})
  // Copia de lo que se cargó, para saber QUÉ ha cambiado y mandar solo eso.
  const [configOriginal, setConfigOriginal] = useState({})
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState(null)

  // Categorías generales
  const [catsGenerales, setCatsGenerales] = useState([])
  const [nuevaCatGen, setNuevaCatGen] = useState({ nombre: '', emoji: '🍽️' })

  // Páginas legales
  const [paginasLegales, setPaginasLegales] = useState([])
  const [editLegal, setEditLegal] = useState(null)
  const [legalForm, setLegalForm] = useState({ titulo: '', contenido: '' })
  const [savingLegal, setSavingLegal] = useState(false)

  useEffect(() => { loadConfig(); loadCatsGenerales(); loadPaginasLegales() }, [])

  // ==================== CONFIGURACIÓN PLATAFORMA ====================

  async function loadConfig() {
    setConfigLoading(true)
    const { data } = await supabase.from('configuracion_plataforma').select('clave, valor')
    const map = {}
    for (const row of (data || [])) map[row.clave] = row.valor
    setConfig(map)
    setConfigOriginal(map)
    setConfigLoading(false)
  }

  function setConfigVal(clave, valor) {
    setConfig(prev => ({ ...prev, [clave]: valor }))
  }

  // Lo que ha cambiado respecto a lo cargado. Es la pieza central del arreglo:
  // antes se mandaban las 40 claves de la tabla aunque la pantalla solo controle
  // 11, así que las otras 29 —los tiempos de los crons, presencia, creadores, la
  // IA, y `comision_pidoo_pct`, que es la que reparte el dinero de verdad— se
  // reescribían a ciegas con lo que hubiera en memoria de React. Y son justo las
  // que se tocan por SQL cada pocos días.
  const cambios = Object.fromEntries(
    Object.entries(config).filter(([k, v]) => String(v) !== String(configOriginal[k] ?? ''))
  )
  const hayCambios = Object.keys(cambios).length > 0

  async function guardarConfig() {
    if (!hayCambios) {
      setConfigMsg('No has cambiado nada')
      setTimeout(() => setConfigMsg(null), 3000)
      return
    }
    setConfigSaving(true)
    setConfigMsg(null)

    // Una sola llamada transaccional. La RPC valida TODO antes de escribir nada,
    // así que o entra entero o no entra nada.
    //
    // ⚠️ HAY QUE LEER `error`: supabase-js NO lanza excepción cuando la llamada
    // falla, la devuelve en `{ error }`. El código anterior tenía un try/catch que
    // por eso no saltaba nunca, y enseñaba "guardada correctamente" aunque no se
    // hubiera guardado nada. Es la mitad del bug, y sobrevive a la RPC si esto no
    // se mira.
    const { data, error } = await supabase.rpc('guardar_configuracion_plataforma', {
      p_cambios: cambios,
    })

    if (error) {
      // El mensaje de la RPC viene en español y nombra la clave y el motivo.
      setConfigMsg('Error al guardar: ' + (error.message || 'no se pudo guardar'))
      setConfigSaving(false)
      return
    }

    setConfigOriginal(config)
    setConfigMsg(data === 0
      ? 'No había nada que cambiar'
      : `Configuración guardada (${data} ${data === 1 ? 'clave' : 'claves'})`)
    setTimeout(() => setConfigMsg(null), 3000)
    setConfigSaving(false)
  }

  // ==================== CATEGORÍAS GENERALES ====================

  async function loadCatsGenerales() {
    const { data } = await supabase.from('categorias_generales').select('*').order('orden')
    setCatsGenerales(data || [])
  }

  async function addCatGeneral() {
    if (!nuevaCatGen.nombre.trim()) return
    await supabase.from('categorias_generales').insert({
      nombre: nuevaCatGen.nombre.trim(),
      emoji: nuevaCatGen.emoji || '🍽️',
      orden: catsGenerales.length + 1,
    })
    setNuevaCatGen({ nombre: '', emoji: '🍽️' })
    loadCatsGenerales()
  }

  async function removeCatGeneral(id) {
    await supabase.from('categorias_generales').delete().eq('id', id)
    loadCatsGenerales()
  }

  // ==================== PÁGINAS LEGALES ====================

  async function loadPaginasLegales() {
    const { data } = await supabase.from('paginas_legales').select('*').order('created_at')
    setPaginasLegales(data || [])
  }

  async function guardarPaginaLegal() {
    if (!legalForm.titulo.trim() || !legalForm.contenido.trim()) return
    setSavingLegal(true)
    await supabase.from('paginas_legales').update({
      titulo: legalForm.titulo.trim(),
      contenido: legalForm.contenido.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', editLegal.id)
    setSavingLegal(false)
    setEditLegal(null)
    loadPaginasLegales()
  }

  // ==================== HELPERS ====================

  const configNum = (clave, fallback = 0) => parseFloat(config[clave] ?? fallback)

  // Simulador de ejemplo de envío
  const ejemploEnvio = (km) => {
    const base = configNum('envio_tarifa_base', 2.5)
    const radio = configNum('envio_radio_base_km', 2)
    const extra = configNum('envio_precio_km_adicional', 0.5)
    const max = configNum('envio_tarifa_maxima', 15)
    let cost = km <= radio ? base : base + ((km - radio) * extra)
    if (cost > max) cost = max
    return cost.toFixed(2)
  }

  const errorAlGuardar = !!configMsg && configMsg.includes('Error')

  return (
    <div>
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Configuración</h1>
          <div style={{ ...type.body, color: colors.textMute }}>
            Tarifas, comisiones y cobertura de la plataforma. Afecta a todos los restaurantes.
          </div>
        </div>
      </div>

      {configLoading ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando configuración…</div></Card>
      ) : (
        <>
          {/* ==================== TARIFAS DE ENVÍO ==================== */}
          <Seccion
            icono={<Truck size={18} color={colors.terracotta} />}
            titulo="Tarifas de envío (canal Pido)"
            texto="Estas tarifas se aplican cuando un cliente pide desde la app principal (pidoo.es). Los socios configuran sus propias tarifas desde su panel."
          >
            <div className="ds-fields" style={{ marginBottom: 20 }}>
              <div>
                <label style={ds.label}>Tarifa base (€)</label>
                <input type="number" step="0.10" min="0" max="20" value={config.envio_tarifa_base ?? '2.50'}
                  onChange={e => setConfigVal('envio_tarifa_base', e.target.value)} style={ds.formInput} />
                <div style={hint}>Coste mínimo de envío</div>
              </div>
              <div>
                <label style={ds.label}>Radio base (km)</label>
                <input type="number" step="0.5" min="0.5" max="30" value={config.envio_radio_base_km ?? '2'}
                  onChange={e => setConfigVal('envio_radio_base_km', e.target.value)} style={ds.formInput} />
                <div style={hint}>Distancia cubierta por la tarifa base</div>
              </div>
              <div>
                <label style={ds.label}>€ por km adicional</label>
                <input type="number" step="0.10" min="0" max="5" value={config.envio_precio_km_adicional ?? '0.50'}
                  onChange={e => setConfigVal('envio_precio_km_adicional', e.target.value)} style={ds.formInput} />
                <div style={hint}>Cada km fuera del radio base</div>
              </div>
              <div>
                <label style={ds.label}>Tarifa máxima (€)</label>
                <input type="number" step="0.50" min="0.5" max="50" value={config.envio_tarifa_maxima ?? '15.00'}
                  onChange={e => setConfigVal('envio_tarifa_maxima', e.target.value)} style={ds.formInput} />
                <div style={hint}>Tope máximo que paga el cliente</div>
              </div>
            </div>

            {/* Simulador. Iba en un tinte naranja con las cifras en gris claro:
                el número, que es lo único que se viene a mirar, era lo que menos
                se veía. Ahora cada tramo es una fichita de papel sobre crema. */}
            <div style={{ background: colors.cream2, borderRadius: radius.md, padding: 16, border: `1px solid ${colors.border}` }}>
              <SectionLabel style={{ marginBottom: 10 }}>Vista previa de tarifas</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[1, 2, 3, 5, 8, 10, 15].map(km => (
                  <div key={km} style={{
                    background: colors.paper, border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm, padding: '8px 14px', textAlign: 'center', minWidth: 72,
                  }}>
                    <div style={{ ...type.caption, color: colors.textMute }}>{km} km</div>
                    <div style={{ ...type.num, fontSize: type.h3.fontSize, color: colors.ink, marginTop: 2 }}>{fmtEUR(ejemploEnvio(km))}</div>
                  </div>
                ))}
              </div>
            </div>
          </Seccion>

          {/* ==================== COMISIONES ==================== */}
          <Seccion
            icono={<DollarSign size={18} color={colors.terracotta} />}
            titulo="Porcentajes de comisiones"
          >
            {/* Una sola casilla: con `1fr` se estiraba a todo el ancho de la
                pantalla para pedir un número de dos cifras */}
            <div className="ds-fields">
              {/* ⚠️ Este campo escribe `comision_plataforma`, que NO cobra nada: solo
                  es el % con el que el Dashboard pinta las comisiones estimadas.
                  La que se queda Pidoo de verdad es `comision_pidoo_pct`, que la usa
                  el corte de los lunes y hoy NO está en esta pantalla (se toca por
                  SQL). El rótulo decía "Se cobra al restaurante por cada pedido", que
                  era falso; en la BD las dos claves tenían además la MISMA
                  `descripcion`, palabra por palabra. */}
              <div>
                <label style={ds.label}>Comisión mostrada en el Dashboard (%)</label>
                <input type="number" step="0.1" min={0} max={50} value={config.comision_plataforma ?? '10'}
                  onChange={e => setConfigVal('comision_plataforma', e.target.value)} style={ds.formInput} />
                <div style={hint}>
                  Solo cambia el número que estima el Dashboard. <strong>No cobra nada.</strong> Lo
                  que Pidoo se queda de verdad ({config.comision_pidoo_pct ?? '10'} %) vive en
                  <code style={{ fontSize: 11 }}> comision_pidoo_pct</code> y lo aplica el corte de los lunes.
                </div>
              </div>
            </div>
          </Seccion>

          {/* ==================== ALGORITMO DE ASIGNACIÓN Y COMISIONES ==================== */}
          <Seccion
            icono={<Zap size={18} color={colors.terracotta} />}
            titulo="Algoritmo de asignación y comisiones"
            texto="Define cómo se asignan los pedidos a los riders y cómo se reparte el dinero entre Pidoo, rider y restaurante."
          >
            <div className="ds-fields" style={{ marginBottom: 16 }}>
              <div>
                <label style={ds.label}>Algoritmo de asignación por defecto</label>
                <select
                  value={config.default_algoritmo_asignacion ?? 'nearest'}
                  onChange={e => setConfigVal('default_algoritmo_asignacion', e.target.value)}
                  style={ds.select}
                >
                  <option value="nearest">Más cercano</option>
                  <option value="fewest_orders">Menos pedidos activos</option>
                  <option value="same_area">Misma zona</option>
                  <option value="broadcast_all">Difundir a todos</option>
                </select>
                <div style={hint}>Se aplica cuando un restaurante acepta un pedido delivery</div>
              </div>
              <div>
                <label style={ds.label}>Envío al rider</label>
                <select
                  value={config.default_timing_envio_rider ?? 'on_accept'}
                  onChange={e => setConfigVal('default_timing_envio_rider', e.target.value)}
                  style={ds.select}
                >
                  <option value="on_accept">Al aceptar el pedido</option>
                  <option value="on_ready">Cuando esté listo para recoger</option>
                </select>
                <div style={hint}>Momento en que se asigna la orden de reparto al rider</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <ToggleRow
                label="Permitir que los restaurantes configuren su propio algoritmo"
                value={config.override_algoritmo_permitido === 'true'}
                onChange={v => setConfigVal('override_algoritmo_permitido', v ? 'true' : 'false')}
              />
              <ToggleRow
                label="Permitir que los restaurantes configuren su propia tarifa de envío"
                value={config.override_tarifa_permitido === 'true'}
                onChange={v => setConfigVal('override_tarifa_permitido', v ? 'true' : 'false')}
              />
            </div>

            {/* El texto del modelo iba en terracota puro sobre su propio tinte:
                2,x:1 de contraste. El token onTerracottaSoft es el que se lee. */}
            <div style={{
              background: colors.terracottaSoft,
              border: `1px solid ${colors.terracotta}`,
              borderRadius: radius.md, padding: 14,
              ...type.label, color: colors.onTerracottaSoft, lineHeight: 1.55,
            }}>
              <span style={{ fontWeight: 700 }}>Modelo Pidoo:</span>{' '}
              Pidoo cobra el <strong>10% del subtotal</strong> de cada pedido. El restaurante se queda el 80% del subtotal.
              El socio/rider cobra el envío + 10% del subtotal + el 100% de la propina. El alta son 150€ únicos en efectivo (fuera de plataforma). <strong>No hay cuota mensual.</strong>
            </div>
          </Seccion>

          {/* ==================== RADIO DEFAULT ==================== */}
          <Seccion
            icono={<MapPin size={18} color={colors.terracotta} />}
            titulo="Radio de cobertura por defecto"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input type="range" min={1} max={30} value={config.radio_cobertura_default ?? '10'}
                aria-label="Radio de cobertura por defecto en kilómetros"
                onChange={e => setConfigVal('radio_cobertura_default', e.target.value)}
                style={{ flex: 1, maxWidth: 400, accentColor: colors.terracotta }} />
              <span style={{ ...type.num, fontSize: type.h2.fontSize, color: colors.ink, minWidth: 68 }}>{config.radio_cobertura_default ?? 10} km</span>
            </div>
            <div style={hint}>Radio que se asigna a nuevos establecimientos por defecto (cobertura delivery)</div>
          </Seccion>

          {/* ==================== RADIO DESCUBRIMIENTO ==================== */}
          <Seccion
            icono={<MapPin size={18} color={colors.terracotta} />}
            titulo="Radio de descubrimiento (visibilidad)"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input type="range" min={3} max={100} value={config.radio_descubrimiento_km ?? '15'}
                aria-label="Radio de descubrimiento en kilómetros"
                onChange={e => setConfigVal('radio_descubrimiento_km', e.target.value)}
                style={{ flex: 1, maxWidth: 400, accentColor: colors.terracotta }} />
              <span style={{ ...type.num, fontSize: type.h2.fontSize, color: colors.ink, minWidth: 68 }}>{config.radio_descubrimiento_km ?? 15} km</span>
            </div>
            <div style={hint}>
              Distancia máxima desde la ubicación del cliente para que un restaurante aparezca en el listado de la app y en el mapa.
              Si el cliente no comparte ubicación, no se filtra. Cada socio puede definir su propio radio en su marketplace.
            </div>
          </Seccion>

          {/* Botón guardar toda la configuración */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            <GlossyBtn accent size="lg" onClick={guardarConfig} disabled={configSaving || !hayCambios} style={{ opacity: (configSaving || !hayCambios) ? 0.6 : 1 }}>
              <Check size={16} /> {configSaving ? 'Guardando…' : hayCambios ? `Guardar ${Object.keys(cambios).length} ${Object.keys(cambios).length === 1 ? 'cambio' : 'cambios'}` : 'Sin cambios'}
            </GlossyBtn>
            {configMsg && (
              <Chip tono={errorAlGuardar ? 'danger' : 'sage'} style={{ whiteSpace: 'normal' }}>
                {configMsg}
              </Chip>
            )}
          </div>
        </>
      )}

      {/* ==================== CATEGORÍAS GENERALES ==================== */}
      <Seccion
        icono={<Tags size={18} color={colors.terracotta} />}
        titulo="Categorías generales"
        texto="Son las que se muestran en pido-app para filtrar restaurantes."
      >
        {catsGenerales.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {catsGenerales.map(cat => (
              <Chip key={cat.id} tono="neutral" style={{ paddingRight: 5 }}>
                {cat.emoji} {cat.nombre}
                <button
                  onClick={() => removeCatGeneral(cat.id)}
                  aria-label={`Quitar la categoría ${cat.nombre}`}
                  title={`Quitar la categoría ${cat.nombre}`}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                    marginLeft: 1, color: colors.stone, display: 'inline-flex', alignItems: 'center',
                    borderRadius: radius.full, lineHeight: 0,
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </Chip>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={nuevaCatGen.emoji} onChange={e => setNuevaCatGen({ ...nuevaCatGen, emoji: e.target.value })}
            aria-label="Emoji de la categoría"
            placeholder="🍽️" style={{ ...ds.formInput, width: 62, flexShrink: 0, textAlign: 'center' }} />
          <input value={nuevaCatGen.nombre} onChange={e => setNuevaCatGen({ ...nuevaCatGen, nombre: e.target.value })}
            aria-label="Nombre de la categoría"
            placeholder="Nombre categoría…" style={{ ...ds.formInput, flex: '1 1 180px', width: 'auto' }}
            onKeyDown={e => e.key === 'Enter' && addCatGeneral()} />
          <GlossyBtn accent onClick={addCatGeneral}><Plus size={15} /> Añadir</GlossyBtn>
        </div>
      </Seccion>

      {/* ==================== PÁGINAS LEGALES ==================== */}
      <Seccion
        icono={<FileText size={18} color={colors.terracotta} />}
        titulo="Páginas legales"
        texto="Edita los textos que se muestran en pidoo.es/terminos y pidoo.es/privacidad."
      >
        {editLegal ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <GhostBtn size="sm" onClick={() => setEditLegal(null)}>
                <ChevronLeft size={15} /> Volver a la lista
              </GhostBtn>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={ds.label}>Título</label>
              <input value={legalForm.titulo} onChange={e => setLegalForm({ ...legalForm, titulo: e.target.value })} style={ds.formInput} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={ds.label}>Contenido (HTML)</label>
              {/* `ds.formInput` fija height 38: en un textarea eso ganaba a `rows`
                  y el editor de los términos legales medía UNA línea de alto. */}
              {/* El único campo que SÍ quiere todo el ancho de la pantalla: es
                  HTML a pelo y con 720px se parte en cien líneas */}
              <textarea data-keep-size="true"
                value={legalForm.contenido} onChange={e => setLegalForm({ ...legalForm, contenido: e.target.value })} rows={18}
                style={{
                  ...ds.formInput, ...type.mono,
                  height: 'auto', minHeight: 300, padding: '10px 12px',
                  fontSize: type.label.fontSize, lineHeight: 1.6, resize: 'vertical',
                }} />
              <div style={hint}>Se limpian scripts, iframes y atributos on* antes de mostrarlo.</div>
            </div>
            <div style={{ marginBottom: 16, background: colors.cream2, borderRadius: radius.md, padding: 16, border: `1px solid ${colors.border}` }}>
              <SectionLabel>Vista previa</SectionLabel>
              <div style={{ ...type.body, lineHeight: 1.7, color: colors.text }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(legalForm.contenido) }} />
            </div>
            <GlossyBtn accent full onClick={guardarPaginaLegal} disabled={savingLegal} style={{ opacity: savingLegal ? 0.6 : 1 }}>
              <Check size={15} /> {savingLegal ? 'Guardando…' : 'Guardar página'}
            </GlossyBtn>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paginasLegales.map(p => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                padding: '14px 16px', background: colors.cream2, borderRadius: radius.md, border: `1px solid ${colors.border}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...type.bodyLg, fontWeight: 600, color: colors.text }}>{p.titulo}</div>
                  <div style={{ ...type.caption, color: colors.textMute, marginTop: 3 }}>
                    pidoo.es/{p.slug} · Editado: {new Date(p.updated_at).toLocaleDateString('es-ES')}
                  </div>
                </div>
                <GhostBtn
                  size="sm"
                  aria-label={`Editar la página ${p.titulo}`}
                  onClick={() => { setEditLegal(p); setLegalForm({ titulo: p.titulo, contenido: p.contenido }) }}
                >
                  Editar
                </GhostBtn>
              </div>
            ))}
            {paginasLegales.length === 0 && (
              <Vacio
                titulo="No hay páginas legales configuradas"
                texto="Aquí aparecerán los términos y la política de privacidad que publica pidoo.es."
              />
            )}
          </div>
        )}
      </Seccion>
    </div>
  )
}

/* ── Piezas de la pantalla ───────────────────────────────────────────────── */

// Cada bloque de ajustes es una tarjeta de papel con su título en `ds.h3`.
// Antes cada sección repetía a mano el mismo `div` + `h2` de 17/700.
function Seccion({ icono, titulo, texto, children }) {
  return (
    <Card pad={24} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: texto ? 6 : 16 }}>
        {icono}
        <h2 style={{ ...ds.h3, margin: 0 }}>{titulo}</h2>
      </div>
      {texto && (
        <p style={{ ...type.body, color: colors.textMute, margin: '0 0 20px' }}>{texto}</p>
      )}
      {children}
    </Card>
  )
}

// El interruptor sigue viviendo en la fila entera (se pulsa en cualquier punto);
// lo único que cambia es que el switch ya no se dibuja a mano aquí: es el
// `Toggle` del sistema, que además expone role="switch" y aria-checked.
function ToggleRow({ label, value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 14px', borderRadius: radius.md,
        background: colors.cream2, border: `1px solid ${colors.border}`,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{ ...type.label, fontWeight: 600, color: colors.text }}>{label}</span>
      <Toggle on={value} size="sm" tone="terracotta" aria-label={label} />
    </div>
  )
}

// La ayuda que va debajo de cada campo. Un solo estilo, y sale de `type`.
const hint = { ...type.caption, color: colors.textMute, marginTop: 6, letterSpacing: 'normal', textTransform: 'none' }
