import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { toast } from '../App'

const ICONOS_DISPONIBLES = [
  'Clock', 'Zap', 'Bike', 'Wallet', 'Shield', 'Star', 'Trophy',
  'Heart', 'Home', 'MapPin', 'Gift', 'CircleDollarSign', 'Rocket',
  'Calendar', 'Smartphone', 'UserCheck', 'TrendingUp',
]

const DEFAULT = {
  hero: {
    titulo_linea1: 'Gana dinero',
    titulo_linea2: 'repartiendo con',
    titulo_highlight: 'Pidoo',
    cta_texto: 'Empezar ahora',
    cta_url: 'https://dispatch.shipday.com/signUp/mcFdlOIL19',
  },
  ganancia: {
    visible: true,
    etiqueta: 'Ganancia promedio mensual',
    monto: '2.000€',
    descripcion: 'Basado en riders activos de alto rendimiento en zonas premium',
  },
  beneficios: {
    visible: true,
    titulo: 'Tus beneficios',
    cards: [
      { icono: 'Clock', label: 'Tu Horario' },
      { icono: 'Zap', label: 'Libertad' },
    ],
  },
  pasos: {
    visible: true,
    titulo: 'Cómo funciona',
    items: [
      { titulo: 'Registra tu cuenta', desc: 'Crea tu perfil en nuestra plataforma de reparto con tus datos básicos.' },
      { titulo: 'Elige tus restaurantes aliados', desc: 'Selecciona con qué restaurantes quieres repartir. Ellos serán tus clientes.' },
      { titulo: 'Recibe pedidos y cobra', desc: 'Los pedidos te llegan cuando los restaurantes aceptan. Cobras cada semana el envío + 10% del pedido + propinas.' },
    ],
  },
  home_cta: {
    visible: true,
    titulo: 'Gana dinero repartiendo',
    subtitulo: 'Crea tu propio negocio',
    boton: 'APLICAR',
  },
}

export default function LandingRiders() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activa, setActiva] = useState(true)
  const [cfg, setCfg] = useState(DEFAULT)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase
      .from('landing_repartidores_config')
      .select('activa, config')
      .eq('id', 'default')
      .maybeSingle()
    if (data) {
      setActiva(data.activa !== false)
      setCfg({
        hero: { ...DEFAULT.hero, ...(data.config?.hero || {}) },
        ganancia: { ...DEFAULT.ganancia, ...(data.config?.ganancia || {}) },
        beneficios: {
          ...DEFAULT.beneficios,
          ...(data.config?.beneficios || {}),
          cards: data.config?.beneficios?.cards || DEFAULT.beneficios.cards,
        },
        pasos: {
          ...DEFAULT.pasos,
          ...(data.config?.pasos || {}),
          items: data.config?.pasos?.items || DEFAULT.pasos.items,
        },
        home_cta: { ...DEFAULT.home_cta, ...(data.config?.home_cta || {}) },
      })
    }
    setLoading(false)
  }

  async function guardar() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('landing_repartidores_config')
      .upsert({
        id: 'default',
        activa,
        config: cfg,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
    setSaving(false)
    if (error) {
      console.error(error)
      toast('Error al guardar: ' + error.message, 'error')
    } else {
      toast('Cambios guardados')
    }
  }

  function updateHero(patch) { setCfg(c => ({ ...c, hero: { ...c.hero, ...patch } })) }
  function updateGanancia(patch) { setCfg(c => ({ ...c, ganancia: { ...c.ganancia, ...patch } })) }
  function updateBeneficios(patch) { setCfg(c => ({ ...c, beneficios: { ...c.beneficios, ...patch } })) }
  function updatePasos(patch) { setCfg(c => ({ ...c, pasos: { ...c.pasos, ...patch } })) }
  function updateHomeCta(patch) { setCfg(c => ({ ...c, home_cta: { ...c.home_cta, ...patch } })) }

  function addBeneficio() {
    updateBeneficios({ cards: [...cfg.beneficios.cards, { icono: 'Star', label: 'Nuevo beneficio' }] })
  }
  function delBeneficio(i) {
    updateBeneficios({ cards: cfg.beneficios.cards.filter((_, idx) => idx !== i) })
  }
  function editBeneficio(i, patch) {
    updateBeneficios({ cards: cfg.beneficios.cards.map((c, idx) => idx === i ? { ...c, ...patch } : c) })
  }
  function moveBeneficio(i, dir) {
    const j = i + dir
    if (j < 0 || j >= cfg.beneficios.cards.length) return
    const arr = [...cfg.beneficios.cards]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    updateBeneficios({ cards: arr })
  }

  function addPaso() {
    updatePasos({ items: [...cfg.pasos.items, { titulo: 'Nuevo paso', desc: '' }] })
  }
  function delPaso(i) {
    updatePasos({ items: cfg.pasos.items.filter((_, idx) => idx !== i) })
  }
  function editPaso(i, patch) {
    updatePasos({ items: cfg.pasos.items.map((p, idx) => idx === i ? { ...p, ...patch } : p) })
  }
  function movePaso(i, dir) {
    const j = i + dir
    if (j < 0 || j >= cfg.pasos.items.length) return
    const arr = [...cfg.pasos.items]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    updatePasos({ items: arr })
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: colors.textMute }}>Cargando…</div>
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.text, margin: 0, letterSpacing: '-0.02em' }}>
            Landing de Repartidores
          </h1>
          <p style={{ fontSize: 13, color: colors.textDim, margin: '6px 0 0' }}>
            Edita la página "Gana dinero repartiendo" y el CTA del Home
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setActiva(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${activa ? 'rgba(74,222,128,0.35)' : 'rgba(245,158,11,0.35)'}`,
              background: activa ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)',
              color: activa ? 'var(--c-success)' : '#F59E0B',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            {activa ? <Eye size={14} /> : <EyeOff size={14} />}
            {activa ? 'VISIBLE' : 'OCULTA'}
          </button>
          <button
            onClick={guardar}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
              border: 'none', background: colors.primary, color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Save size={14} />
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* HERO */}
      <Section titulo="Encabezado (Hero)">
        <Grid>
          <Field label="Título línea 1" value={cfg.hero.titulo_linea1} onChange={v => updateHero({ titulo_linea1: v })} />
          <Field label="Título línea 2" value={cfg.hero.titulo_linea2} onChange={v => updateHero({ titulo_linea2: v })} />
          <Field label="Palabra destacada (naranja)" value={cfg.hero.titulo_highlight} onChange={v => updateHero({ titulo_highlight: v })} />
          <Field label="Texto del botón" value={cfg.hero.cta_texto} onChange={v => updateHero({ cta_texto: v })} />
        </Grid>
        <Field label="URL del botón (Shipday signup)" value={cfg.hero.cta_url} onChange={v => updateHero({ cta_url: v })} />
      </Section>

      {/* GANANCIA */}
      <Section
        titulo="Card de ganancia"
        toggle={{ value: cfg.ganancia.visible, onChange: v => updateGanancia({ visible: v }) }}
      >
        <Grid>
          <Field label="Etiqueta superior" value={cfg.ganancia.etiqueta} onChange={v => updateGanancia({ etiqueta: v })} />
          <Field label="Monto grande" value={cfg.ganancia.monto} onChange={v => updateGanancia({ monto: v })} />
        </Grid>
        <Field label="Descripción pequeña" value={cfg.ganancia.descripcion} onChange={v => updateGanancia({ descripcion: v })} textarea />
      </Section>

      {/* BENEFICIOS */}
      <Section
        titulo={`Tarjetas de beneficios (${cfg.beneficios.cards.length})`}
        toggle={{ value: cfg.beneficios.visible, onChange: v => updateBeneficios({ visible: v }) }}
      >
        <Field label="Título de la sección" value={cfg.beneficios.titulo} onChange={v => updateBeneficios({ titulo: v })} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {cfg.beneficios.cards.map((b, i) => (
            <div key={i} style={rowStyle}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => moveBeneficio(i, -1)} disabled={i === 0} style={arrowBtn}>▲</button>
                <button onClick={() => moveBeneficio(i, 1)} disabled={i === cfg.beneficios.cards.length - 1} style={arrowBtn}>▼</button>
              </div>
              <select
                value={b.icono}
                onChange={e => editBeneficio(i, { icono: e.target.value })}
                style={{ ...ds.formInput, width: 150 }}
              >
                {ICONOS_DISPONIBLES.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input
                value={b.label}
                onChange={e => editBeneficio(i, { label: e.target.value })}
                placeholder="Texto"
                style={{ ...ds.formInput, flex: 1 }}
              />
              <button onClick={() => delBeneficio(i)} style={delBtn}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={addBeneficio} style={addBtn}><Plus size={14} /> Añadir beneficio</button>
      </Section>

      {/* PASOS */}
      <Section
        titulo={`Pasos "Cómo funciona" (${cfg.pasos.items.length})`}
        toggle={{ value: cfg.pasos.visible, onChange: v => updatePasos({ visible: v }) }}
      >
        <Field label="Título de la sección" value={cfg.pasos.titulo} onChange={v => updatePasos({ titulo: v })} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {cfg.pasos.items.map((p, i) => (
            <div key={i} style={{ ...rowStyle, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                <button onClick={() => movePaso(i, -1)} disabled={i === 0} style={arrowBtn}>▲</button>
                <button onClick={() => movePaso(i, 1)} disabled={i === cfg.pasos.items.length - 1} style={arrowBtn}>▼</button>
              </div>
              <div style={{ ...stepNumber }}>{i + 1}</div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={p.titulo}
                  onChange={e => editPaso(i, { titulo: e.target.value })}
                  placeholder="Título del paso"
                  style={ds.formInput}
                />
                <textarea
                  value={p.desc}
                  onChange={e => editPaso(i, { desc: e.target.value })}
                  placeholder="Descripción"
                  rows={2}
                  style={{ ...ds.formInput, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <button onClick={() => delPaso(i)} style={delBtn}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={addPaso} style={addBtn}><Plus size={14} /> Añadir paso</button>
      </Section>

      {/* HOME CTA */}
      <Section
        titulo="Banner del Home (app cliente)"
        toggle={{ value: cfg.home_cta.visible, onChange: v => updateHomeCta({ visible: v }) }}
      >
        <p style={{ fontSize: 12, color: colors.textDim, margin: '0 0 12px' }}>
          Es el banner naranja "Gana dinero repartiendo" que aparece en la página principal de pidoo.es
        </p>
        <Grid>
          <Field label="Título" value={cfg.home_cta.titulo} onChange={v => updateHomeCta({ titulo: v })} />
          <Field label="Subtítulo" value={cfg.home_cta.subtitulo} onChange={v => updateHomeCta({ subtitulo: v })} />
          <Field label="Texto botón" value={cfg.home_cta.boton} onChange={v => updateHomeCta({ boton: v })} />
        </Grid>
      </Section>

      {/* Guardar final */}
      <div style={{ marginTop: 24, padding: '16px 20px', background: 'rgba(255,107,44,0.06)', border: `1px solid ${colors.primaryBorder}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: colors.textDim }}>
          Los cambios se reflejan inmediatamente en pidoo.es (puede tardar unos segundos por el caché).
        </div>
        <button onClick={guardar} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 16px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
          border: 'none', background: colors.primary, color: '#fff',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          opacity: saving ? 0.6 : 1,
        }}>
          <Save size={14} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

function Section({ titulo, toggle, children }) {
  return (
    <div style={{ ...ds.card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: colors.text, margin: 0 }}>{titulo}</h2>
        {toggle && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: colors.textDim, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={toggle.value}
              onChange={e => toggle.onChange(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: colors.primary }}
            />
            Visible
          </label>
        )}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, textarea }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {textarea ? (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={2}
          style={{ ...ds.formInput, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'inherit' }}
        />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)} style={ds.formInput} />
      )}
    </div>
  )
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>{children}</div>
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: 10, borderRadius: 10,
  background: colors.elev, border: `1px solid ${colors.border}`,
}
const arrowBtn = {
  width: 20, height: 16, border: 'none', background: 'transparent',
  color: colors.textMute, cursor: 'pointer', fontSize: 10, padding: 0,
}
const delBtn = {
  width: 32, height: 32, borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: 'var(--c-danger-soft)', color: 'var(--c-danger)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}
const addBtn = {
  marginTop: 12, padding: '8px 14px', borderRadius: 8,
  border: `1px dashed ${colors.border}`,
  background: 'transparent', color: colors.textDim,
  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const stepNumber = {
  width: 28, height: 28, borderRadius: 999,
  background: colors.primary, color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 4,
}
