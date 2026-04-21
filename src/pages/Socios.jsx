import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { Users, ExternalLink, Plus, Eye, EyeOff, ChevronDown, ChevronUp, X, Save } from 'lucide-react'
import { toast, confirmar } from '../App'

const ESTADOS_VINC = ['pendiente', 'activa', 'rechazada']

export default function Socios() {
  const [tab, setTab] = useState('socios')
  const [socios, setSocios] = useState([])
  const [countsRest, setCountsRest] = useState({})
  const [balances, setBalances] = useState({})
  const [vinculaciones, setVinculaciones] = useState([])
  const [establecimientos, setEstablecimientos] = useState([])
  const [loading, setLoading] = useState(true)

  const [buscar, setBuscar] = useState('')
  const [soloActivos, setSoloActivos] = useState(false)
  const [soloMarketplace, setSoloMarketplace] = useState(false)

  const [expandido, setExpandido] = useState(null)
  const [showApiKey, setShowApiKey] = useState({})
  const [editLimite, setEditLimite] = useState({})

  const [showNuevo, setShowNuevo] = useState(false)

  // Filtros vinculaciones
  const [fEstado, setFEstado] = useState('todos')
  const [fSocio, setFSocio] = useState('todos')
  const [fEst, setFEst] = useState('todos')
  const [editEstadoVinc, setEditEstadoVinc] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [sRes, vRes, eRes] = await Promise.all([
      supabase.from('socios').select('*').order('created_at', { ascending: false }),
      supabase.from('socio_establecimiento')
        .select('id, socio_id, establecimiento_id, estado, solicitado_at, aceptado_at, destacado, socios(id, nombre_comercial, nombre), establecimientos(id, nombre)')
        .order('solicitado_at', { ascending: false }),
      supabase.from('establecimientos').select('id, nombre').order('nombre'),
    ])
    const sociosData = sRes.data || []
    setSocios(sociosData)
    setVinculaciones(vRes.data || [])
    setEstablecimientos(eRes.data || [])

    // Count restaurantes activos por socio
    const counts = {}
    ;(vRes.data || []).forEach(v => {
      if (v.estado === 'activa') counts[v.socio_id] = (counts[v.socio_id] || 0) + 1
    })
    setCountsRest(counts)

    // Balance más reciente por socio
    if (sociosData.length > 0) {
      const ids = sociosData.map(s => s.id)
      const { data: bals } = await supabase.from('balances_socio')
        .select('*')
        .in('socio_id', ids)
        .order('periodo_fin', { ascending: false })
      const bmap = {}
      ;(bals || []).forEach(b => { if (!bmap[b.socio_id]) bmap[b.socio_id] = b })
      setBalances(bmap)
    }
    setLoading(false)
  }

  async function toggleActivo(s) {
    const { error } = await supabase.from('socios').update({ activo: !s.activo }).eq('id', s.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(!s.activo ? 'Socio activado' : 'Socio desactivado')
    load()
  }

  async function toggleMarketplace(s) {
    const { error } = await supabase.from('socios').update({ marketplace_activo: !s.marketplace_activo }).eq('id', s.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast(!s.marketplace_activo ? 'Marketplace abierto' : 'Marketplace cerrado')
    load()
  }

  async function guardarLimite(s) {
    const val = parseInt(editLimite[s.id], 10)
    if (isNaN(val) || val < 0) return toast('Valor inválido', 'error')
    const { error } = await supabase.from('socios').update({ limite_restaurantes: val }).eq('id', s.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Límite actualizado')
    setEditLimite(e => { const cp = { ...e }; delete cp[s.id]; return cp })
    load()
  }

  async function cambiarEstadoVinc(v) {
    const nuevo = editEstadoVinc[v.id]
    if (!nuevo || nuevo === v.estado) return
    const patch = { estado: nuevo }
    if (nuevo === 'activa' && !v.aceptado_at) patch.aceptado_at = new Date().toISOString()
    const { error } = await supabase.from('socio_establecimiento').update(patch).eq('id', v.id)
    if (error) return toast('Error: ' + error.message, 'error')
    toast('Estado actualizado')
    setEditEstadoVinc(e => { const cp = { ...e }; delete cp[v.id]; return cp })
    load()
  }

  const sociosFiltered = socios.filter(s => {
    if (soloActivos && !s.activo) return false
    if (soloMarketplace && !s.marketplace_activo) return false
    if (buscar) {
      const q = buscar.toLowerCase()
      if (!(s.nombre_comercial || '').toLowerCase().includes(q)
        && !(s.nombre || '').toLowerCase().includes(q)
        && !(s.slug || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const vincFiltered = vinculaciones.filter(v => {
    if (fEstado !== 'todos' && v.estado !== fEstado) return false
    if (fSocio !== 'todos' && v.socio_id !== fSocio) return false
    if (fEst !== 'todos' && v.establecimiento_id !== fEst) return false
    return true
  })

  const stats = {
    activos: socios.filter(s => s.activo).length,
    marketplaces: socios.filter(s => s.marketplace_activo && s.slug).length,
    vinculos: vinculaciones.filter(v => v.estado === 'activa').length,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={ds.h1}>Socios</h1>
        {tab === 'socios' && (
          <button onClick={() => setShowNuevo(true)} style={{ ...ds.primaryBtn }}>
            <Plus size={14} /> Nuevo socio
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Socios activos" value={stats.activos} />
        <StatCard label="Marketplaces abiertos" value={stats.marketplaces} />
        <StatCard label="Vinculaciones activas" value={stats.vinculos} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
        {[
          { id: 'socios', l: 'Socios registrados' },
          { id: 'vinculos', l: 'Vinculaciones' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
            background: 'none', border: 'none',
            borderBottom: tab === t.id ? `2px solid ${colors.primary}` : '2px solid transparent',
            color: tab === t.id ? colors.primary : colors.textMute,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'socios' && (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o slug..." style={{ ...ds.input, width: 300 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: colors.textDim, cursor: 'pointer' }}>
              <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} /> Solo activos
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: colors.textDim, cursor: 'pointer' }}>
              <input type="checkbox" checked={soloMarketplace} onChange={e => setSoloMarketplace(e.target.checked)} /> Solo marketplace on
            </label>
          </div>

          <div style={ds.table}>
            <div style={ds.tableHeader}>
              <span style={{ flex: 1 }}>Socio</span>
              <span style={{ width: 120 }}>Slug</span>
              <span style={{ width: 180 }}>Contacto</span>
              <span style={{ width: 70, textAlign: 'center' }}>Rests.</span>
              <span style={{ width: 110 }}>Límite</span>
              <span style={{ width: 70, textAlign: 'center' }}>Activo</span>
              <span style={{ width: 100, textAlign: 'center' }}>Marketplace</span>
              <span style={{ width: 80, textAlign: 'right' }}></span>
            </div>

            {loading && (
              <div style={{ padding: 32, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Cargando…</div>
            )}

            {!loading && sociosFiltered.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>
                {socios.length === 0 ? 'Sin socios registrados.' : 'Sin resultados.'}
              </div>
            )}

            {sociosFiltered.map(s => {
              const isOpen = expandido === s.id
              const bal = balances[s.id]
              const limiteVal = editLimite[s.id] !== undefined ? editLimite[s.id] : (s.limite_restaurantes ?? '')
              const limiteDirty = editLimite[s.id] !== undefined && String(editLimite[s.id]) !== String(s.limite_restaurantes ?? '')
              const showKey = !!showApiKey[s.id]
              const hasMarketplace = s.marketplace_activo && s.slug

              return (
                <div key={s.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ ...ds.tableRow, borderBottom: 'none' }}>
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {s.logo_url
                        ? <img src={s.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', background: colors.elev2, flexShrink: 0 }} />
                        : <div style={{ width: 32, height: 32, borderRadius: 8, background: colors.elev2, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: colors.textMute, flexShrink: 0 }}>
                            {(s.nombre_comercial || s.nombre || 'S').charAt(0).toUpperCase()}
                          </div>
                      }
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {hasMarketplace ? (
                            <a href={`https://pidoo.es/s/${s.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: colors.text, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onMouseEnter={e => e.currentTarget.style.color = colors.primary}
                              onMouseLeave={e => e.currentTarget.style.color = colors.text}>
                              {s.nombre_comercial || s.nombre}
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <>{s.nombre_comercial || s.nombre || '—'}</>
                          )}
                        </div>
                        {s.nombre && s.nombre !== s.nombre_comercial && (
                          <div style={{ fontSize: 11, color: colors.textMute }}>{s.nombre}</div>
                        )}
                      </span>
                    </span>
                    <span style={{ width: 120, fontSize: 12, color: colors.textDim, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.slug || '—'}
                    </span>
                    <span style={{ width: 180, fontSize: 11, color: colors.textMute, lineHeight: 1.4 }}>
                      {s.email && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>}
                      {s.telefono && <div>{s.telefono}</div>}
                      {!s.email && !s.telefono && '—'}
                    </span>
                    <span style={{ width: 70, textAlign: 'center', fontSize: 13, fontWeight: 700, color: colors.text }}>
                      {countsRest[s.id] || 0}
                    </span>
                    <span style={{ width: 110, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="number" min={0}
                        value={limiteVal === null ? '' : limiteVal}
                        onChange={e => setEditLimite(prev => ({ ...prev, [s.id]: e.target.value }))}
                        style={{ ...ds.formInput, height: 28, padding: '0 8px', fontSize: 12, width: 60 }}
                      />
                      {limiteDirty && (
                        <button onClick={() => guardarLimite(s)} style={{ ...ds.actionBtn, padding: '0 6px', height: 28, color: colors.primary, borderColor: colors.primaryBorder }}>
                          <Save size={12} />
                        </button>
                      )}
                    </span>
                    <span style={{ width: 70, textAlign: 'center' }}>
                      <Toggle on={!!s.activo} onClick={() => toggleActivo(s)} />
                    </span>
                    <span style={{ width: 100, textAlign: 'center' }}>
                      <Toggle on={!!s.marketplace_activo} onClick={() => toggleMarketplace(s)} />
                    </span>
                    <span style={{ width: 80, textAlign: 'right' }}>
                      <button onClick={() => setExpandido(isOpen ? null : s.id)} style={{ ...ds.actionBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {isOpen ? 'Cerrar' : 'Detalle'}
                      </button>
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '14px 18px 18px 18px', background: colors.elev2, borderTop: `1px solid ${colors.border}`, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                      <div>
                        <DetailRow label="Descripción">
                          <span style={{ fontSize: 12.5, color: colors.textDim }}>{s.descripcion || '—'}</span>
                        </DetailRow>
                        <DetailRow label="Redes">
                          {s.redes && typeof s.redes === 'object' && Object.keys(s.redes).length > 0 ? (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                              {Object.entries(s.redes).map(([k, v]) => (
                                <span key={k} style={{ color: colors.textDim }}><b style={{ color: colors.text }}>{k}:</b> {v}</span>
                              ))}
                            </div>
                          ) : <span style={{ fontSize: 12.5, color: colors.textMute }}>—</span>}
                        </DetailRow>
                        <DetailRow label="Tarifa base">
                          <span style={{ fontSize: 12.5, color: colors.text }}>
                            {s.tarifa_base != null ? `${Number(s.tarifa_base).toFixed(2)} €` : '—'}
                            {' · '}
                            <span style={{ color: colors.textMute }}>Radio: {s.radio_km != null ? `${s.radio_km} km` : '—'}</span>
                          </span>
                        </DetailRow>
                        <DetailRow label="Shipday API key">
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors.textDim, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {s.shipday_api_key
                              ? (showKey ? s.shipday_api_key : `${s.shipday_api_key.slice(0, 6)}•••••${s.shipday_api_key.slice(-4)}`)
                              : '—'}
                            {s.shipday_api_key && (
                              <button onClick={() => setShowApiKey(p => ({ ...p, [s.id]: !p[s.id] }))} style={{ ...ds.actionBtn, height: 22, padding: '0 6px', fontSize: 11 }}>
                                {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
                              </button>
                            )}
                          </span>
                        </DetailRow>
                        <DetailRow label="Carrier ID">
                          <span style={{ fontSize: 12, color: colors.textDim, fontFamily: 'monospace' }}>{s.shipday_carrier_id || '—'}</span>
                        </DetailRow>
                      </div>

                      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                          Último balance
                        </div>
                        {bal ? (
                          <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.7 }}>
                            <div><b style={{ color: colors.text }}>Periodo:</b> {fmtDate(bal.periodo_inicio)} → {fmtDate(bal.periodo_fin)}</div>
                            <div><b style={{ color: colors.text }}>Estado:</b> {bal.estado || '—'}</div>
                            <div><b style={{ color: colors.text }}>Total a pagar:</b> {Number(bal.total_pagar_socio || 0).toFixed(2)} €</div>
                            <div><b style={{ color: colors.text }}>Efectivo recaudado:</b> {Number(bal.total_efectivo_recaudado || 0).toFixed(2)} €</div>
                            <div style={{ fontSize: 11, color: colors.textMute, marginTop: 6 }}>
                              Comisiones tarjeta: {Number(bal.comisiones_tarjeta || 0).toFixed(2)} €<br />
                              Envíos tarjeta: {Number(bal.envios_tarjeta || 0).toFixed(2)} €<br />
                              Propinas: {Number(bal.propinas_tarjeta || 0).toFixed(2)} €
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: colors.textMute }}>Sin balances aún.</div>
                        )}
                        <div style={{ fontSize: 11, color: colors.textMute, marginTop: 12 }}>
                          <b>Rating:</b> {s.rating != null ? Number(s.rating).toFixed(1) : '—'}
                          {s.total_resenas > 0 && ` (${s.total_resenas})`}
                        </div>
                        <div style={{ fontSize: 11, color: colors.textMute }}>
                          <b>Color:</b> <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color_primario || '#FF6B2C', verticalAlign: 'middle', marginRight: 4, border: `1px solid ${colors.border}` }} />
                          {s.color_primario || '—'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'vinculos' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={fEstado} onChange={e => setFEstado(e.target.value)} style={{ ...ds.select, width: 180 }}>
              <option value="todos">Todos los estados</option>
              {ESTADOS_VINC.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={fSocio} onChange={e => setFSocio(e.target.value)} style={{ ...ds.select, width: 220 }}>
              <option value="todos">Todos los socios</option>
              {socios.map(s => <option key={s.id} value={s.id}>{s.nombre_comercial || s.nombre || s.id.slice(0, 8)}</option>)}
            </select>
            <select value={fEst} onChange={e => setFEst(e.target.value)} style={{ ...ds.select, width: 240 }}>
              <option value="todos">Todos los restaurantes</option>
              {establecimientos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div style={ds.table}>
            <div style={ds.tableHeader}>
              <span style={{ flex: 1 }}>Socio</span>
              <span style={{ flex: 1 }}>Restaurante</span>
              <span style={{ width: 150 }}>Estado</span>
              <span style={{ width: 120 }}>Solicitado</span>
              <span style={{ width: 120 }}>Aceptado</span>
              <span style={{ width: 90, textAlign: 'center' }}>Destacado</span>
              <span style={{ width: 90, textAlign: 'right' }}></span>
            </div>
            {vincFiltered.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>Sin vinculaciones.</div>
            )}
            {vincFiltered.map(v => {
              const current = editEstadoVinc[v.id] ?? v.estado
              const dirty = current !== v.estado
              return (
                <div key={v.id} style={ds.tableRow}>
                  <span style={{ flex: 1, fontSize: 13, color: colors.text, fontWeight: 600 }}>
                    {v.socios?.nombre_comercial || v.socios?.nombre || '—'}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: colors.text }}>
                    {v.establecimientos?.nombre || '—'}
                  </span>
                  <span style={{ width: 150 }}>
                    <select value={current} onChange={e => setEditEstadoVinc(p => ({ ...p, [v.id]: e.target.value }))} style={{ ...ds.select, height: 28, fontSize: 12, padding: '0 28px 0 10px', width: 140 }}>
                      {ESTADOS_VINC.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </span>
                  <span style={{ width: 120, fontSize: 11.5, color: colors.textMute }}>{fmtDate(v.solicitado_at)}</span>
                  <span style={{ width: 120, fontSize: 11.5, color: colors.textMute }}>{fmtDate(v.aceptado_at)}</span>
                  <span style={{ width: 90, textAlign: 'center', fontSize: 12, color: v.destacado ? colors.primary : colors.textMute }}>
                    {v.destacado ? '★' : '—'}
                  </span>
                  <span style={{ width: 90, textAlign: 'right' }}>
                    {dirty && (
                      <button onClick={() => cambiarEstadoVinc(v)} style={{ ...ds.actionBtn, color: colors.primary, borderColor: colors.primaryBorder }}>
                        <Save size={11} /> Guardar
                      </button>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showNuevo && <NuevoSocioModal onClose={() => setShowNuevo(false)} onSaved={() => { setShowNuevo(false); load() }} />}
    </div>
  )
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 34, height: 20, borderRadius: 999,
      background: on ? colors.primary : colors.elev2,
      border: `1px solid ${on ? colors.primaryBorder : colors.border}`,
      position: 'relative', cursor: 'pointer',
      transition: 'background 0.15s',
    }}>
      <span style={{
        position: 'absolute',
        top: 1, left: on ? 15 : 1,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'left 0.15s',
      }} />
    </button>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{ ...ds.card, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: colors.text, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  catch { return '—' }
}

// ─── Modal Nuevo Socio ─────────────────────────────────────────────────────────
function NuevoSocioModal({ onClose, onSaved }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [nombreComercial, setNombreComercial] = useState('')
  const [slug, setSlug] = useState('')
  const [slugStatus, setSlugStatus] = useState(null) // null | 'checking' | 'free' | 'taken'
  const [socioEmail, setSocioEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [shipdayApiKey, setShipdayApiKey] = useState('')
  const [tarifaBase, setTarifaBase] = useState('')
  const [radioKm, setRadioKm] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!slug.trim()) { setSlugStatus(null); return }
    const s = slug.trim().toLowerCase()
    setSlugStatus('checking')
    const t = setTimeout(async () => {
      const { data } = await supabase.from('socios').select('id').eq('slug', s).maybeSingle()
      setSlugStatus(data ? 'taken' : 'free')
    }, 350)
    return () => clearTimeout(t)
  }, [slug])

  async function guardar() {
    if (!email.trim() || !nombre.trim() || !nombreComercial.trim()) {
      return toast('Email, nombre y nombre comercial son obligatorios', 'error')
    }
    if (slug && slugStatus === 'taken') return toast('Slug no disponible', 'error')
    setSaving(true)

    // Buscar usuario por email
    const { data: user, error: uErr } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (uErr || !user) {
      setSaving(false)
      return toast('No existe usuario con ese email', 'error')
    }

    // Crear fila socios
    const payload = {
      user_id: user.id,
      nombre: nombre.trim(),
      nombre_comercial: nombreComercial.trim(),
      slug: slug.trim().toLowerCase() || null,
      email: socioEmail.trim() || email.trim().toLowerCase(),
      telefono: telefono.trim() || null,
      shipday_api_key: shipdayApiKey.trim() || null,
      tarifa_base: tarifaBase ? Number(tarifaBase) : null,
      radio_km: radioKm ? Number(radioKm) : null,
      activo: true,
    }
    const { error: sErr } = await supabase.from('socios').insert(payload)
    if (sErr) { setSaving(false); return toast('Error creando socio: ' + sErr.message, 'error') }

    // Actualizar rol usuario
    if (user.rol !== 'socio') {
      await supabase.from('usuarios').update({ rol: 'socio' }).eq('id', user.id)
    }

    toast('Socio creado')
    onSaved()
  }

  return (
    <div style={ds.modal} onClick={onClose}>
      <div style={{ ...ds.modalContent, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Users size={18} color={colors.primary} />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.text, flex: 1, margin: 0 }}>Nuevo socio</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: colors.textMute, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={ds.label}>Email del usuario existente *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="socio@email.com" style={ds.formInput} />
            <div style={{ fontSize: 10.5, color: colors.textMute, marginTop: 4 }}>
              Debe existir en `usuarios`. Se le cambiará el rol a `socio`.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Nombre *</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Nombre comercial *</label>
              <input value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div>
            <label style={ds.label}>Slug público</label>
            <input
              value={slug}
              onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
              placeholder="mi-slug"
              style={{ ...ds.formInput, fontFamily: 'monospace' }}
            />
            {slug && (
              <div style={{ fontSize: 11, marginTop: 4, color: slugStatus === 'taken' ? colors.danger : slugStatus === 'free' ? colors.success : colors.textMute }}>
                {slugStatus === 'checking' && 'Comprobando…'}
                {slugStatus === 'free' && `✓ Disponible — pidoo.es/s/${slug}`}
                {slugStatus === 'taken' && '✗ Ya está en uso'}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Email contacto socio</label>
              <input value={socioEmail} onChange={e => setSocioEmail(e.target.value)} placeholder="(opcional, defaults al email)" style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div>
            <label style={ds.label}>Shipday API key</label>
            <input value={shipdayApiKey} onChange={e => setShipdayApiKey(e.target.value)} placeholder="(opcional)" style={{ ...ds.formInput, fontFamily: 'monospace', fontSize: 12 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={ds.label}>Tarifa base (€)</label>
              <input type="number" step="0.1" value={tarifaBase} onChange={e => setTarifaBase(e.target.value)} style={ds.formInput} />
            </div>
            <div>
              <label style={ds.label}>Radio km</label>
              <input type="number" step="0.5" value={radioKm} onChange={e => setRadioKm(e.target.value)} style={ds.formInput} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={onClose} style={ds.secondaryBtn}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{ ...ds.primaryBtn, flex: 1, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Creando…' : 'Crear socio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
