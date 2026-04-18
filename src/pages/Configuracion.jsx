import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds } from '../lib/darkStyles'
import { Trash2, Truck, DollarSign, MapPin, Zap } from 'lucide-react'

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
    setConfigLoading(false)
  }

  function setConfigVal(clave, valor) {
    setConfig(prev => ({ ...prev, [clave]: valor }))
  }

  async function guardarConfig() {
    setConfigSaving(true)
    setConfigMsg(null)
    try {
      const updates = Object.entries(config).map(([clave, valor]) => ({
        clave,
        valor: String(valor),
        updated_at: new Date().toISOString(),
      }))
      for (const u of updates) {
        await supabase.from('configuracion_plataforma').upsert({ clave: u.clave, valor: u.valor, updated_at: u.updated_at }, { onConflict: 'clave' })
      }
      setConfigMsg('Configuración guardada correctamente')
      setTimeout(() => setConfigMsg(null), 3000)
    } catch (err) {
      setConfigMsg('Error al guardar: ' + err.message)
    }
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={ds.h1}>Configuración</h1>
      </div>

      {configLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>Cargando configuración...</div>
      ) : (
        <>
          {/* ==================== TARIFAS DE ENVÍO ==================== */}
          <div style={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Truck size={18} color="#FF6B2C" />
              <h2 style={styles.sectionTitle}>Tarifas de envío (canal Pido)</h2>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20, marginTop: -8 }}>
              Estas tarifas se aplican cuando un cliente pide desde la app principal (pidoo.es). Los socios configuran sus propias tarifas desde su panel.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={ds.label}>Tarifa base (€)</label>
                <input type="number" step="0.10" min="0" value={config.envio_tarifa_base ?? '2.50'}
                  onChange={e => setConfigVal('envio_tarifa_base', e.target.value)} style={ds.formInput} />
                <div style={styles.hint}>Coste mínimo de envío</div>
              </div>
              <div>
                <label style={ds.label}>Radio base (km)</label>
                <input type="number" step="0.5" min="0.5" value={config.envio_radio_base_km ?? '2'}
                  onChange={e => setConfigVal('envio_radio_base_km', e.target.value)} style={ds.formInput} />
                <div style={styles.hint}>Distancia cubierta por la tarifa base</div>
              </div>
              <div>
                <label style={ds.label}>€ por km adicional</label>
                <input type="number" step="0.10" min="0" value={config.envio_precio_km_adicional ?? '0.50'}
                  onChange={e => setConfigVal('envio_precio_km_adicional', e.target.value)} style={ds.formInput} />
                <div style={styles.hint}>Cada km fuera del radio base</div>
              </div>
              <div>
                <label style={ds.label}>Tarifa máxima (€)</label>
                <input type="number" step="0.50" min="0" value={config.envio_tarifa_maxima ?? '15.00'}
                  onChange={e => setConfigVal('envio_tarifa_maxima', e.target.value)} style={ds.formInput} />
                <div style={styles.hint}>Tope máximo que paga el cliente</div>
              </div>
            </div>

            {/* Simulador */}
            <div style={{ background: 'rgba(255,107,44,0.08)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,107,44,0.15)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#FF6B2C', marginBottom: 10 }}>Vista previa de tarifas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[1, 2, 3, 5, 8, 10, 15].map(km => (
                  <div key={km} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{km} km</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#F5F5F5' }}>€{ejemploEnvio(km)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ==================== COMISIONES ==================== */}
          <div style={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <DollarSign size={18} color="#FF6B2C" />
              <h2 style={styles.sectionTitle}>Porcentajes de comisiones</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <label style={ds.label}>Comisión plataforma (%)</label>
                <input type="number" min={0} max={50} value={config.comision_plataforma ?? '10'}
                  onChange={e => setConfigVal('comision_plataforma', e.target.value)} style={ds.formInput} />
                <div style={styles.hint}>Se cobra al restaurante por cada pedido</div>
              </div>
            </div>
          </div>

          {/* ==================== ALGORITMO DE ASIGNACIÓN Y COMISIONES ==================== */}
          <div style={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Zap size={18} color="#FF6B2C" />
              <h2 style={styles.sectionTitle}>Algoritmo de asignación y comisiones</h2>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20, marginTop: -8 }}>
              Define cómo se asignan los pedidos a los riders y cómo se reparte el dinero entre Pidoo, rider y restaurante.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={ds.label}>Algoritmo de asignación por defecto</label>
                <select
                  value={config.default_algoritmo_asignacion ?? 'nearest'}
                  onChange={e => setConfigVal('default_algoritmo_asignacion', e.target.value)}
                  style={ds.formInput}
                >
                  <option value="nearest">Más cercano</option>
                  <option value="fewest_orders">Menos pedidos activos</option>
                  <option value="same_area">Misma zona</option>
                  <option value="broadcast_all">Difundir a todos</option>
                </select>
                <div style={styles.hint}>Se aplica cuando un restaurante acepta un pedido delivery</div>
              </div>
              <div>
                <label style={ds.label}>Envío al rider</label>
                <select
                  value={config.default_timing_envio_rider ?? 'on_accept'}
                  onChange={e => setConfigVal('default_timing_envio_rider', e.target.value)}
                  style={ds.formInput}
                >
                  <option value="on_accept">Al aceptar el pedido</option>
                  <option value="on_ready">Cuando esté listo para recoger</option>
                </select>
                <div style={styles.hint}>Momento en que se crea la orden Shipday al rider</div>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={ds.label}>Comisión Pidoo (% del subtotal)</label>
                <input
                  type="number" min={0} max={50} step="0.5"
                  value={config.comision_pidoo_pct ?? '10'}
                  onChange={e => setConfigVal('comision_pidoo_pct', e.target.value)}
                  style={ds.formInput}
                />
                <div style={styles.hint}>Se descuenta al restaurante</div>
              </div>
              <div>
                <label style={ds.label}>Comisión rider (% del subtotal)</label>
                <input
                  type="number" min={0} max={50} step="0.5"
                  value={config.comision_rider_pct ?? '10'}
                  onChange={e => setConfigVal('comision_rider_pct', e.target.value)}
                  style={ds.formInput}
                />
                <div style={styles.hint}>Además del 100% del envío y 100% de la propina</div>
              </div>
            </div>

            {/* Ejemplo visual del split */}
            <SplitPreview
              pidooPct={configNum('comision_pidoo_pct', 10)}
              riderPct={configNum('comision_rider_pct', 10)}
            />
          </div>

          {/* ==================== RADIO DEFAULT ==================== */}
          <div style={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <MapPin size={18} color="#FF6B2C" />
              <h2 style={styles.sectionTitle}>Radio de cobertura por defecto</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input type="range" min={1} max={30} value={config.radio_cobertura_default ?? '10'}
                onChange={e => setConfigVal('radio_cobertura_default', e.target.value)} style={{ flex: 1, maxWidth: 400 }} />
              <span style={{ fontSize: 20, fontWeight: 800, color: '#F5F5F5', minWidth: 60 }}>{config.radio_cobertura_default ?? 10} km</span>
            </div>
            <div style={styles.hint}>Radio que se asigna a nuevos establecimientos por defecto</div>
          </div>

          {/* Botón guardar toda la configuración */}
          <div style={{ marginBottom: 24 }}>
            <button onClick={guardarConfig} disabled={configSaving} style={{ ...ds.primaryBtn, padding: '14px 40px', fontSize: 15 }}>
              {configSaving ? 'Guardando...' : 'Guardar toda la configuración'}
            </button>
            {configMsg && (
              <span style={{ marginLeft: 16, fontSize: 13, fontWeight: 600, color: configMsg.includes('Error') ? '#EF4444' : '#F5F5F5' }}>
                {configMsg}
              </span>
            )}
          </div>
        </>
      )}

      {/* ==================== CATEGORÍAS GENERALES ==================== */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Categorías generales (se muestran en pido-app)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {catsGenerales.map(cat => (
            <span key={cat.id} style={styles.tag}>
              {cat.emoji} {cat.nombre}
              <button onClick={() => removeCatGeneral(cat.id)} style={styles.tagRemove}><Trash2 size={11} /></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={nuevaCatGen.emoji} onChange={e => setNuevaCatGen({ ...nuevaCatGen, emoji: e.target.value })}
            placeholder="🍽️" style={{ ...ds.formInput, width: 60, textAlign: 'center' }} />
          <input value={nuevaCatGen.nombre} onChange={e => setNuevaCatGen({ ...nuevaCatGen, nombre: e.target.value })}
            placeholder="Nombre categoría..." style={{ ...ds.formInput, flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addCatGeneral()} />
          <button onClick={addCatGeneral} style={ds.primaryBtn}>Añadir</button>
        </div>
      </div>

      {/* ==================== PÁGINAS LEGALES ==================== */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Páginas legales</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Edita los textos legales que se muestran en pidoo.es/terminos y pidoo.es/privacidad</p>

        {editLegal ? (
          <div>
            <button onClick={() => setEditLegal(null)} style={{ background: 'none', border: 'none', color: '#FF6B2C', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", marginBottom: 16, padding: 0 }}>← Volver a la lista</button>
            <div style={{ marginBottom: 12 }}>
              <label style={ds.label}>Título</label>
              <input value={legalForm.titulo} onChange={e => setLegalForm({ ...legalForm, titulo: e.target.value })} style={ds.formInput} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={ds.label}>Contenido (HTML)</label>
              <textarea value={legalForm.contenido} onChange={e => setLegalForm({ ...legalForm, contenido: e.target.value })} rows={18} style={{ ...ds.formInput, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }} />
            </div>
            <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Vista previa</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: '#F5F5F5' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(legalForm.contenido) }} />
            </div>
            <button onClick={guardarPaginaLegal} disabled={savingLegal} style={{ ...ds.primaryBtn, width: '100%' }}>
              {savingLegal ? 'Guardando...' : 'Guardar página'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {paginasLegales.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#F5F5F5' }}>{p.titulo}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>pidoo.es/{p.slug} · Editado: {new Date(p.updated_at).toLocaleDateString('es-ES')}</div>
                </div>
                <button onClick={() => { setEditLegal(p); setLegalForm({ titulo: p.titulo, contenido: p.contenido }) }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#FF6B2C', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>Editar</button>
              </div>
            ))}
            {paginasLegales.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No hay páginas legales configuradas</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 13, color: '#F5F5F5', fontWeight: 600 }}>{label}</span>
      <span style={{
        width: 38, height: 22, borderRadius: 22, padding: 2,
        background: value ? '#FF6B2C' : 'rgba(255,255,255,0.15)',
        transition: 'background 0.2s', display: 'flex', alignItems: 'center',
      }}>
        <span style={{
          width: 18, height: 18, borderRadius: 18, background: '#fff',
          transform: value ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s',
        }} />
      </span>
    </div>
  )
}

function SplitPreview({ pidooPct, riderPct }) {
  const subtotal = 20
  const envio = 3
  const propina = 0
  const pidoo = (subtotal * (pidooPct || 0)) / 100
  const rider = (subtotal * (riderPct || 0)) / 100 + envio + propina
  const restaurante = subtotal - pidoo - (subtotal * (riderPct || 0)) / 100
  return (
    <div style={{ background: 'rgba(255,107,44,0.08)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,107,44,0.15)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#FF6B2C', marginBottom: 10 }}>
        Ejemplo: pedido con subtotal 20€ + envío 3€
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Pidoo</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#F5F5F5' }}>€{pidoo.toFixed(2)}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 16px', minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Rider (+ envío + propina)</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#F5F5F5' }}>€{rider.toFixed(2)}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Restaurante</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#F5F5F5' }}>€{restaurante.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  section: { background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 24, marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#F5F5F5', margin: 0 },
  tag: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 600, color: '#F5F5F5' },
  tagRemove: { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center' },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 },
}
