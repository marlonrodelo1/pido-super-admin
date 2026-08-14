// Primitivas de UI del super-admin.
//
// Portadas del diseño entregado por claude.ai/design (mayo 2026):
//   _design-pidoo-saas-v2/pidoo-saas/project/lib/ui.jsx
// De aquel handoff solo se copió la paleta a darkStyles.js; los componentes se
// quedaron fuera y cada pantalla acabó reconstruyendo tarjetas, badges y
// botones a mano (1.485 bloques `style={{…}}`, la StatCard reimplementada 7
// veces con 5 tamaños de cifra distintos).
//
// Diferencia con el bundle original: allí eran maquetas (`Input` pintaba texto,
// no aceptaba escritura). Aquí son componentes de verdad.

import { colors, radius, type } from './darkStyles'

const FONT = type.family

/* ── Tarjeta ─────────────────────────────────────────────────────────────── */

export function Card({ children, style, pad = 16, onClick, ...rest }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.paper,
        borderRadius: radius.lg,
        padding: pad,
        border: `1px solid ${colors.border}`,
        boxShadow: colors.shadow,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children, style }) {
  return (
    <div style={{ ...type.caption, color: colors.stone, textTransform: 'uppercase', fontWeight: 600, marginBottom: 8, ...style }}>
      {children}
    </div>
  )
}

/* ── Cifra grande (KPI) ──────────────────────────────────────────────────── */

const TONOS_VALOR = {
  ink: colors.ink,
  terracotta: colors.terracotta,
  sage: colors.sage2,
  danger: colors.danger,
}

export function StatCard({ label, value, sub, tone = 'ink', icon, style }) {
  return (
    <Card pad={18} style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ ...type.label, color: colors.stone }}>{label}</span>
        {icon && <span style={{ color: colors.stone2, display: 'flex' }}>{icon}</span>}
      </div>
      <div style={{ ...type.num, fontSize: 30, color: TONOS_VALOR[tone] || colors.ink, margin: '6px 0 2px', lineHeight: 1.1 }}>
        {value}
      </div>
      {/* stone2 (#8A8174) sobre papel se queda en 3,62:1 — para texto va stone */}
      {sub && <div style={{ ...type.caption, color: colors.stone }}>{sub}</div>}
    </Card>
  )
}

/* ── Badges ──────────────────────────────────────────────────────────────── */

// Los colores de texto salen de los tokens `on*Soft`: los acentos normales
// (sage2, warning, danger) sobre sus fondos Soft se quedaban entre 2,06:1 y
// 3,33:1, por debajo del mínimo legible.
const TONOS = {
  neutral:    { bg: colors.cream2,          fg: colors.onCream2 },
  terracotta: { bg: colors.terracottaSoft,  fg: colors.onTerracottaSoft },
  sage:       { bg: colors.sageSoft,        fg: colors.onSageSoft },
  danger:     { bg: colors.dangerSoft,      fg: colors.onDangerSoft },
  warning:    { bg: colors.warningSoft,     fg: colors.onWarningSoft },
  info:       { bg: colors.infoSoft,        fg: colors.onInfoSoft },
  ink:        { bg: colors.ink,             fg: colors.cream },
}

export function Chip({ children, tono = 'neutral', dot, style, onClick, title }) {
  const t = TONOS[tono] || TONOS.neutral
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        ...type.label, fontWeight: 600, fontSize: 12,
        background: t.bg, color: t.fg,
        padding: '4px 9px', borderRadius: radius.full,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        lineHeight: 1.3, whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0 }} />}
      {children}
    </span>
  )
}

// Estados de pedido y de alta. La etiqueta se escribe aquí una sola vez: antes
// cada pantalla tenía su propio mapa (Pedidos.jsx y Usuarios.jsx definían dos
// distintos para los mismos estados) y la tabla pintaba el valor crudo de la
// columna, en minúsculas y con guion bajo ("en_camino").
const ESTADOS = {
  nuevo:                  { tono: 'terracotta', label: 'Nuevo' },
  aceptado:               { tono: 'terracotta', label: 'Aceptado' },
  preparando:             { tono: 'warning',    label: 'Preparando' },
  listo:                  { tono: 'info',       label: 'Listo' },
  recogido:               { tono: 'info',       label: 'Recogido' },
  en_camino:              { tono: 'terracotta', label: 'En camino' },
  entregado:              { tono: 'sage',       label: 'Entregado' },
  cancelado:              { tono: 'neutral',    label: 'Cancelado' },
  fallido:                { tono: 'danger',     label: 'Fallido' },
  pendiente_pago:         { tono: 'warning',    label: 'Pendiente de pago' },
  activo:                 { tono: 'sage',       label: 'Activo' },
  activa:                 { tono: 'sage',       label: 'Activa' },
  inactivo:               { tono: 'neutral',    label: 'Inactivo' },
  pendiente:              { tono: 'warning',    label: 'Pendiente' },
  pendiente_verificacion: { tono: 'warning',    label: 'Sin verificar' },
  rechazado:              { tono: 'danger',     label: 'Rechazado' },
  rechazada:              { tono: 'danger',     label: 'Rechazada' },
  solicitada:             { tono: 'warning',    label: 'Solicitada' },
  pagado:                 { tono: 'sage',       label: 'Pagado' },
  suspendido:             { tono: 'danger',     label: 'Suspendido' },
}

export function EstadoBadge({ estado, style }) {
  const e = ESTADOS[estado] || { tono: 'neutral', label: (estado || '—').replace(/_/g, ' ') }
  return <Chip tono={e.tono} style={style}>{e.label}</Chip>
}

/* ── Botones ─────────────────────────────────────────────────────────────── */

const ALTURAS = { sm: 32, md: 38, lg: 44 }
const PADS    = { sm: '0 12px', md: '0 16px', lg: '0 20px' }
const FUENTES = { sm: 13, md: 14, lg: 15 }

function baseBtn(size, full) {
  return {
    height: ALTURAS[size], padding: PADS[size], fontSize: FUENTES[size],
    borderRadius: 10, fontFamily: FONT, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, lineHeight: 1.2, width: full ? '100%' : 'auto',
  }
}

export function GlossyBtn({ children, size = 'md', full, style, accent, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        ...baseBtn(size, full),
        background: accent
          ? `linear-gradient(180deg, ${colors.terracotta} 0%, ${colors.terracotta2} 100%)`
          : `linear-gradient(180deg, ${colors.ink2} 0%, ${colors.ink} 100%)`,
        color: colors.cream,
        border: '1px solid rgba(0,0,0,.4)',
        boxShadow: colors.shadowGlossy,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function GhostBtn({ children, size = 'md', full, danger, style, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        ...baseBtn(size, full),
        background: colors.paper,
        color: danger ? colors.danger : colors.ink,
        border: `1px solid ${danger ? colors.danger : colors.borderStrong}`,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function MiniBtn({ children, danger, style, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        padding: '6px 11px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        fontFamily: FONT, cursor: 'pointer', lineHeight: 1.2,
        border: `1px solid ${danger ? 'transparent' : colors.border}`,
        background: danger ? colors.dangerSoft : colors.paper,
        color: danger ? colors.onDangerSoft : colors.stone,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/* ── Selectores ──────────────────────────────────────────────────────────── */

// `options`: ['a','b'] o [{ value, label, count }]
const norm = (opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt)

export function Segmented({ options, value, onChange, full, style }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, background: colors.cream2, borderRadius: 10, width: full ? '100%' : 'auto', ...style }}>
      {options.map((raw) => {
        const opt = norm(raw)
        const activo = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange?.(opt.value)}
            style={{
              flex: full ? 1 : 'none', padding: '7px 14px', borderRadius: 8,
              border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
              fontSize: 13, lineHeight: 1.2,
              background: activo ? colors.paper : 'transparent',
              color: activo ? colors.ink : colors.stone,
              boxShadow: activo ? colors.shadow : 'none',
              transition: 'background .12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function PillTabs({ options, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', ...style }}>
      {options.map((raw) => {
        const opt = norm(raw)
        const activo = opt.value === value
        return (
          <button
            key={opt.value}
            onClick={() => onChange?.(opt.value)}
            style={{
              padding: '7px 14px', borderRadius: radius.full, cursor: 'pointer',
              border: activo ? '1px solid transparent' : `1px solid ${colors.border}`,
              background: activo ? colors.terracotta : colors.paper,
              color: activo ? colors.cream : colors.stone,
              fontFamily: FONT, fontWeight: 600, fontSize: 13, lineHeight: 1.2,
              display: 'inline-flex', gap: 6, alignItems: 'center',
            }}
          >
            {opt.label}
            {/* El fondo del contador cuando la pestaña está activa se OSCURECE:
                aclarar el terracota con blanco al 22% dejaba la cifra en 2,82:1. */}
            {opt.count != null && (
              <span style={{
                fontSize: 11, padding: '0 6px', borderRadius: radius.full,
                background: activo ? 'rgba(26,24,21,0.22)' : colors.cream2,
                color: activo ? colors.cream : colors.stone,
              }}>{opt.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ on, onChange, size = 'md', tone = 'sage', disabled, 'aria-label': ariaLabel }) {
  const w = size === 'sm' ? 36 : size === 'lg' ? 60 : 48
  const h = size === 'sm' ? 20 : size === 'lg' ? 32 : 28
  const knob = h - 6
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: w, height: h, borderRadius: radius.full, border: 'none', padding: 0,
        background: on ? (tone === 'sage' ? colors.sage : colors.terracotta) : '#C8C1B0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        position: 'relative', transition: 'background .15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? w - knob - 3 : 3,
        width: knob, height: knob, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.15)',
        transition: 'left .18s ease',
      }} />
    </button>
  )
}

/* ── Estado vacío ────────────────────────────────────────────────────────── */

export function Vacio({ icon, titulo, texto, accion }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      {icon && <div style={{ color: colors.stone2, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <div style={{ ...type.h3, color: colors.text, marginBottom: 4 }}>{titulo}</div>
      {texto && <div style={{ ...type.body, color: colors.stone, maxWidth: 380, margin: '0 auto' }}>{texto}</div>}
      {accion && <div style={{ marginTop: 16 }}>{accion}</div>}
    </div>
  )
}

/* ── Formato ─────────────────────────────────────────────────────────────── */

export const fmtEUR = (n) =>
  (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
