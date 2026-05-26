import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { toast } from '../App'
import { Search, Download, X, ExternalLink, Store } from 'lucide-react'

const fmtEUR = (n) => (Number(n) || 0).toLocaleString('es-ES', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
})
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const MENSUAL = 39

function StatCard({ label, value, sub, accent = colors.ink }) {
  return (
    <div style={{ ...ds.card, padding: '16px 18px' }}>
      <div style={{ fontSize: 10.5, color: colors.textMute, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: colors.textMute, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function statusChip(status) {
  switch (status) {
    case 'activa':
      return { bg: colors.sageSoft, color: colors.sage2, border: colors.sage, label: 'Activa' }
    case 'onboarding':
    case 'pendiente':
      return { bg: colors.warningSoft, color: colors.warning, border: colors.warning, label: status === 'onboarding' ? 'Onboarding' : 'Pendiente' }
    case 'suspendida':
    case 'rechazada':
      return { bg: colors.dangerSoft, color: colors.danger, border: colors.danger, label: status === 'suspendida' ? 'Suspendida' : 'Rechazada' }
    default:
      return { bg: colors.elev2, color: colors.stone, border: colors.borderStrong, label: 'Sin conectar' }
  }
}

export default function SuscripcionesSaaS() {
  const [restaurantes, setRestaurantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | activa | trial | sin_conectar
  const [drawer, setDrawer] = useState(null) // restaurante seleccionado
  const [ownerEmail, setOwnerEmail] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('establecimientos')
      .select('id, nombre, slug, logo_url, plan_pro, stripe_connect_account_id, stripe_connect_status, stripe_connect_onboarded_at, created_at, user_id, activo')
      .order('created_at', { ascending: false })
    if (error) { toast('Error cargando restaurantes: ' + error.message, 'error'); setLoading(false); return }
    setRestaurantes(data || [])
    setLoading(false)
  }

  async function loadOwnerEmail(userId) {
    if (!userId) { setOwnerEmail(null); return }
    const { data } = await supabase.from('usuarios').select('email').eq('id', userId).maybeSingle()
    setOwnerEmail(data?.email || null)
  }

  function openDrawer(r) {
    setDrawer(r)
    setOwnerEmail(null)
    loadOwnerEmail(r.user_id)
  }

  function closeDrawer() {
    setDrawer(null)
    setOwnerEmail(null)
  }

  // ── Métricas SaaS ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activas = restaurantes.filter(r => r.stripe_connect_status === 'activa')
    const trial = restaurantes.filter(r => r.plan_pro === true && r.stripe_connect_status !== 'activa')
    const mrr = activas.length * MENSUAL
    const arr = mrr * 12
    return {
      activas: activas.length,
      trial: trial.length,
      mrr,
      arr,
    }
  }, [restaurantes])

  // ── Filtros ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return restaurantes.filter(r => {
      if (filtro === 'activa' && r.stripe_connect_status !== 'activa') return false
      if (filtro === 'trial' && !(r.plan_pro === true && r.stripe_connect_status !== 'activa')) return false
      if (filtro === 'sin_conectar' && r.stripe_connect_status) return false
      if (q) {
        const nom = (r.nombre || '').toLowerCase()
        const slug = (r.slug || '').toLowerCase()
        if (!nom.includes(q) && !slug.includes(q)) return false
      }
      return true
    })
  }, [restaurantes, filtro, search])

  function exportCSV() {
    // TODO: implementar exportación
    console.log('TODO exportar', filtered)
    toast('Export CSV: pendiente de implementar')
  }

  const pillStyles = (active) => ({
    padding: '6px 12px',
    height: 30,
    borderRadius: 999,
    border: `1px solid ${active ? colors.ink : colors.border}`,
    background: active ? colors.ink : colors.surface,
    color: active ? colors.cream : colors.textDim,
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'all 0.12s',
  })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Suscripciones SaaS</h1>
          <div style={{ fontSize: 13, color: colors.textMute }}>
            Gestión de las cuentas activas Pidoo SaaS · 39€/mes
          </div>
        </div>
        <button onClick={exportCSV} style={ds.secondaryBtn}>
          <Download size={14} strokeWidth={2} />
          Exportar CSV
        </button>
      </div>

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 28,
      }}>
        <StatCard
          label="MRR"
          value={fmtEUR(stats.mrr)}
          sub={`${stats.activas} restaurantes × ${MENSUAL}€`}
          accent={colors.terracotta}
        />
        <StatCard
          label="ARR"
          value={fmtEUR(stats.arr)}
          sub="MRR × 12"
          accent={colors.ink}
        />
        <StatCard
          label="Restaurantes activos"
          value={stats.activas}
          sub="Connect activa"
          accent={colors.sage2}
        />
        <StatCard
          label="Trial activos"
          value={stats.trial}
          sub="plan_pro sin Connect"
          accent={colors.warning}
        />
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            strokeWidth={2}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textMute, pointerEvents: 'none' }}
          />
          <input
            placeholder="Buscar por nombre o slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...ds.input, paddingLeft: 32, width: 280 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setFiltro('todos')} style={pillStyles(filtro === 'todos')}>Todos · {restaurantes.length}</button>
          <button onClick={() => setFiltro('activa')} style={pillStyles(filtro === 'activa')}>Activa · {stats.activas}</button>
          <button onClick={() => setFiltro('trial')} style={pillStyles(filtro === 'trial')}>Trial · {stats.trial}</button>
          <button onClick={() => setFiltro('sin_conectar')} style={pillStyles(filtro === 'sin_conectar')}>Sin conectar</button>
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: colors.textMute }}>{filtered.length} de {restaurantes.length}</span>
      </div>

      {/* Tabla */}
      <div style={ds.table}>
        <div style={ds.tableHeader}>
          <span style={{ flex: 1 }}>Restaurante</span>
          <span style={{ width: 110 }}>Plan</span>
          <span style={{ width: 130 }}>Estado Connect</span>
          <span style={{ width: 110 }}>Onboarded</span>
          <span style={{ width: 110 }}>Alta</span>
          <span style={{ width: 100, textAlign: 'right' }}>Acciones</span>
        </div>

        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>
            Cargando suscripciones…
          </div>
        )}

        {!loading && filtered.map(r => {
          const chip = statusChip(r.stripe_connect_status)
          return (
            <div
              key={r.id}
              style={{
                ...ds.tableRow,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onClick={() => openDrawer(r)}
              onMouseEnter={e => { e.currentTarget.style.background = colors.cream2 }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {r.logo_url ? (
                  <img src={r.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', border: `1px solid ${colors.border}`, flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: colors.elev2,
                    border: `1px solid ${colors.border}`,
                    display: 'grid', placeItems: 'center',
                    color: colors.textMute,
                    flexShrink: 0,
                  }}>
                    <Store size={14} strokeWidth={1.8} />
                  </div>
                )}
                <span style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre || '—'}</div>
                  <div style={{ fontSize: 11, color: colors.textMute, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{r.slug || r.id.slice(0, 8)}</div>
                </span>
              </span>

              <span style={{ width: 110 }}>
                <span style={{
                  ...ds.badge,
                  background: colors.terracottaSoft,
                  color: colors.terracotta2,
                  border: `1px solid ${colors.terracotta}33`,
                }}>SaaS 39€</span>
              </span>

              <span style={{ width: 130 }}>
                <span style={{
                  ...ds.badge,
                  background: chip.bg,
                  color: chip.color,
                  border: `1px solid ${chip.border}33`,
                }}>{chip.label}</span>
              </span>

              <span style={{ width: 110, fontSize: 12, color: colors.textMute }}>
                {fmtDate(r.stripe_connect_onboarded_at)}
              </span>

              <span style={{ width: 110, fontSize: 12, color: colors.textMute }}>
                {fmtDate(r.created_at)}
              </span>

              <span style={{ width: 100, textAlign: 'right' }}>
                <button
                  onClick={e => { e.stopPropagation(); openDrawer(r) }}
                  style={{ ...ds.actionBtn, padding: '0 10px', height: 28 }}
                >
                  Ver detalle
                </button>
              </span>
            </div>
          )
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: colors.textMute, fontSize: 13 }}>
            Sin restaurantes coincidentes
          </div>
        )}
      </div>

      {/* Drawer detalle */}
      {drawer && (
        <DrawerDetalle
          restaurante={drawer}
          ownerEmail={ownerEmail}
          onClose={closeDrawer}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Drawer detalle
// ─────────────────────────────────────────────────────────────────────
function DrawerDetalle({ restaurante: r, ownerEmail, onClose }) {
  const chip = statusChip(r.stripe_connect_status)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26,24,21,0.40)',
        zIndex: 9000,
        backdropFilter: 'blur(2px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          height: '100vh',
          background: colors.surface,
          borderLeft: `1px solid ${colors.border}`,
          boxShadow: '-12px 0 40px rgba(26,24,21,0.18)',
          display: 'flex', flexDirection: 'column',
          animation: 'slide-in-right 0.18s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {r.logo_url ? (
            <img src={r.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: `1px solid ${colors.border}` }} />
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: colors.elev2,
              border: `1px solid ${colors.border}`,
              display: 'grid', placeItems: 'center',
              color: colors.textMute,
            }}>
              <Store size={18} strokeWidth={1.8} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.nombre}
            </div>
            <div style={{ fontSize: 11, color: colors.textMute, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {r.slug || r.id.slice(0, 8)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${colors.border}`,
              background: colors.surface,
              color: colors.textMute,
              display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {/* Plan SaaS */}
          <Section title="Plan SaaS">
            <Row label="Plan" value={
              <span style={{
                ...ds.badge,
                background: colors.terracottaSoft,
                color: colors.terracotta2,
                border: `1px solid ${colors.terracotta}33`,
              }}>SaaS 39€/mes</span>
            } />
            <Row label="plan_pro" value={
              <span style={{
                ...ds.badge,
                background: r.plan_pro ? colors.sageSoft : colors.elev2,
                color: r.plan_pro ? colors.sage2 : colors.stone,
                border: `1px solid ${r.plan_pro ? colors.sage : colors.borderStrong}33`,
              }}>{r.plan_pro ? 'Sí' : 'No'}</span>
            } />
            <Row label="Activo" value={
              <span style={{
                ...ds.badge,
                background: r.activo ? colors.sageSoft : colors.elev2,
                color: r.activo ? colors.sage2 : colors.stone,
                border: `1px solid ${r.activo ? colors.sage : colors.borderStrong}33`,
              }}>{r.activo ? 'Sí' : 'No'}</span>
            } />
          </Section>

          {/* Estado Stripe Connect */}
          <Section title="Stripe Connect">
            <Row label="Estado" value={
              <span style={{
                ...ds.badge,
                background: chip.bg,
                color: chip.color,
                border: `1px solid ${chip.border}33`,
              }}>{chip.label}</span>
            } />
            <Row label="Cuenta" value={
              r.stripe_connect_account_id
                ? <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: colors.textDim }}>{r.stripe_connect_account_id}</span>
                : <span style={{ color: colors.textMute, fontSize: 12 }}>—</span>
            } />
            <Row label="Onboarded" value={
              <span style={{ fontSize: 13, color: colors.textDim }}>{fmtDate(r.stripe_connect_onboarded_at)}</span>
            } />
          </Section>

          {/* Propietario */}
          <Section title="Propietario">
            <Row label="Email" value={
              ownerEmail
                ? <span style={{ fontSize: 13, color: colors.textDim }}>{ownerEmail}</span>
                : <span style={{ color: colors.textMute, fontSize: 12 }}>{r.user_id ? 'Cargando…' : '—'}</span>
            } />
            <Row label="User ID" value={
              r.user_id
                ? <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: colors.textDim }}>{r.user_id}</span>
                : <span style={{ color: colors.textMute, fontSize: 12 }}>—</span>
            } />
            <Row label="Creado" value={
              <span style={{ fontSize: 13, color: colors.textDim }}>{fmtDate(r.created_at)}</span>
            } />
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex', gap: 8, flexWrap: 'wrap',
          background: colors.elev,
        }}>
          {r.stripe_connect_account_id ? (
            <a
              href={`https://dashboard.stripe.com/connect/accounts/${r.stripe_connect_account_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...ds.secondaryBtn,
                textDecoration: 'none',
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <ExternalLink size={13} strokeWidth={2} />
              Ver en Stripe
            </a>
          ) : (
            <button
              disabled
              style={{
                ...ds.secondaryBtn,
                opacity: 0.5,
                cursor: 'not-allowed',
                flex: 1,
                justifyContent: 'center',
              }}
            >
              <ExternalLink size={13} strokeWidth={2} />
              Sin cuenta Stripe
            </button>
          )}
          <button
            disabled
            onClick={() => console.log('TODO cancelar suscripción', r.id)}
            style={{
              padding: '0 14px', height: 34, borderRadius: 8,
              border: `1px solid ${colors.dangerSoft}`,
              background: colors.dangerSoft,
              color: colors.danger,
              fontSize: 12.5, fontWeight: 600,
              cursor: 'not-allowed',
              opacity: 0.55,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              flex: 1,
            }}
            title="Funcionalidad pendiente"
          >
            Cancelar suscripción
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700,
        color: colors.textMute,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 10,
      }}>{title}</div>
      <div style={{
        background: colors.elev,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px',
      borderBottom: `1px solid ${colors.border}`,
      gap: 12,
    }}>
      <span style={{ fontSize: 12, color: colors.textMute, fontWeight: 500 }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}
