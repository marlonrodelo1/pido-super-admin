// Estilos compartidos super-admin
// Design system: Plus Jakarta Sans + paleta cream/terracotta/sage
// Pivote SaaS — paleta artesanal cálida (mayo 2026)
//
// Mantenemos el nombre del archivo `darkStyles.js` (ya no es dark theme)
// para no romper los imports existentes en pages/*.

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"

export const colors = {
  // === Bases (cream world) ===
  cream:    '#F7F3EC',
  cream2:   '#EFE9DD',
  paper:    '#FBF8F2',

  // === Tinta ===
  ink:      '#1A1815',
  ink2:     '#2B2823',
  stone:    '#6B6356',
  stone2:   '#8A8174',

  // === Acentos ===
  terracotta:      '#C5562C',
  terracotta2:     '#A8451F',
  terracottaSoft:  '#F1D9CC',

  sage:      '#8B9D7A',
  sage2:     '#6F8460',
  sageSoft:  '#DDE3D3',

  // === Funcionales ===
  warning:     '#C99551',
  warningSoft: '#F0E1C8',
  danger:      '#B5564A',
  dangerSoft:  '#F1D0CB',
  info:        '#7B8FA8',
  infoSoft:    '#DBE0E8',

  // === Compatibilidad hacia atrás ===
  bg:           '#F7F3EC',
  sidebar:      '#1A1815',  // Sidebar dark ink según diseño
  sidebarText:  '#F7F3EC',  // texto cream sobre sidebar oscuro
  elev:         '#FBF8F2',
  elev2:        '#EFE9DD',
  surface:      '#FBF8F2',
  surfaceHover: '#EFE9DD',
  border:       '#E8E1D3',
  borderStrong: '#D8CDB8',

  text:      '#1A1815',
  textDim:   '#2B2823',
  textMute:  '#6B6356',
  textFaint: '#8A8174',

  primary:       '#C5562C',
  primaryDark:   '#A8451F',
  primarySoft:   '#F1D9CC',
  primaryBorder: 'rgba(197,86,44,0.32)',

  success:     '#8B9D7A',  // alias sage
  successSoft: '#DDE3D3',
  dangerText:  '#A8451F',

  // === Texto SOBRE los fondos *Soft (contraste medido ≥ 4.5:1) ===
  // Los acentos de arriba están pensados para trazos y bordes, no para texto:
  // sage2 sobre sageSoft daba 3.11:1 y warning sobre warningSoft 2.06:1.
  onSageSoft:       '#3F5230',
  onDangerSoft:     '#7A2F26',
  onWarningSoft:    '#6B4A12',
  onInfoSoft:       '#33465B',
  onTerracottaSoft: '#8F3A18',
  onCream2:         '#4A4438',

  // === Sombras ===
  shadow:   '0 1px 3px rgba(26,24,21,0.05), 0 1px 1px rgba(26,24,21,0.03)',
  shadowMd: '0 4px 12px rgba(26,24,21,0.06), 0 1px 3px rgba(26,24,21,0.04)',
  shadowLg: '0 14px 40px rgba(26,24,21,0.10), 0 4px 12px rgba(26,24,21,0.06)',
  shadowGlossy: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(26,24,21,0.20)',
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 }

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }

// Escala tipográfica del diseño entregado (claude.ai/design, mayo 2026):
// _design-pidoo-saas-v2/pidoo-saas/project/lib/tokens.js
// Se copió la paleta pero NO esta escala, y cada pantalla acabó inventándose
// la suya: 20 tamaños distintos (10.5, 11.5, 12.5, 13.5…) repartidos en 599
// declaraciones sueltas. Todo tamaño nuevo debe salir de aquí.
export const type = {
  family: FONT,
  h1:      { fontFamily: FONT, fontWeight: 700, fontSize: 32, letterSpacing: '-0.02em',  lineHeight: 1.15 },
  h2:      { fontFamily: FONT, fontWeight: 700, fontSize: 22, letterSpacing: '-0.015em', lineHeight: 1.2 },
  h3:      { fontFamily: FONT, fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em',  lineHeight: 1.25 },
  body:    { fontFamily: FONT, fontWeight: 400, fontSize: 14, lineHeight: 1.5 },
  bodyLg:  { fontFamily: FONT, fontWeight: 400, fontSize: 15, lineHeight: 1.5 },
  label:   { fontFamily: FONT, fontWeight: 500, fontSize: 13, lineHeight: 1.4 },
  caption: { fontFamily: FONT, fontWeight: 500, fontSize: 11, lineHeight: 1.35, letterSpacing: '0.04em' },
  mono:    { fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' },
  num:     { fontFamily: FONT, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' },
}

export const ds = {
  // Cards / surfaces
  card: {
    background: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadow,
  },

  // Tables (flex-based)
  table: {
    background: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadow,
  },
  tableHeader: {
    display: 'flex', alignItems: 'center', padding: '11px 16px', gap: 12,
    fontSize: type.caption.fontSize, fontWeight: 600, color: colors.textMute,
    borderBottom: `1px solid ${colors.border}`,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    background: colors.elev2,
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12,
    borderBottom: `1px solid ${colors.border}`, color: colors.text,
    fontSize: type.body.fontSize, fontWeight: 400,
  },

  // Badges / tags
  badge: {
    fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
    letterSpacing: '0.04em', textTransform: 'uppercase',
    background: colors.elev2, color: colors.onCream2,
    border: `1px solid ${colors.border}`, display: 'inline-flex',
    alignItems: 'center', gap: 5, whiteSpace: 'nowrap', lineHeight: 1.35,
  },

  // Inputs
  input: {
    padding: '0 12px', height: 38, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`, fontSize: type.body.fontSize,
    fontFamily: FONT, width: 260, outline: 'none',
    background: colors.surface, color: colors.text,
  },
  formInput: {
    width: '100%', padding: '0 12px', height: 38, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`, fontSize: type.body.fontSize,
    fontFamily: FONT, background: colors.surface,
    color: colors.text, outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '0 36px 0 12px', height: 38, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`, fontSize: type.body.fontSize,
    fontFamily: FONT, background: colors.surface,
    color: colors.text, outline: 'none', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="%236B6356" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>')}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    cursor: 'pointer',
  },
  // Etiqueta de campo. Era 11px en MAYÚSCULAS y peso 700: en un formulario de
  // 20 campos, veinte gritos. El diseño la define en 13/500 y frase normal.
  label: {
    ...type.label, color: colors.textMute,
    marginBottom: 6, display: 'block',
  },
  // Rótulo de sección pequeño (el que sí va en mayúsculas, como en el diseño)
  sectionLabel: {
    ...type.caption, color: colors.textMute, textTransform: 'uppercase',
    fontWeight: 600, marginBottom: 8, display: 'block',
  },

  // Buttons
  filterBtn: {
    padding: '0 12px', height: 32, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    fontSize: type.label.fontSize, fontWeight: 600, cursor: 'pointer',
    fontFamily: FONT, background: colors.surface, color: colors.textDim,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  actionBtn: {
    padding: '0 11px', height: 30, borderRadius: radius.sm, border: `1px solid ${colors.border}`,
    fontSize: type.label.fontSize, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
    background: colors.surface, color: colors.text,
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: type.body.fontSize, fontWeight: 600,
    color: colors.primary, cursor: 'pointer', fontFamily: FONT,
    marginBottom: 16, padding: 0,
  },
  primaryBtn: {
    padding: '0 16px', height: 38, borderRadius: 10,
    border: `1px solid ${colors.primary}`,
    background: colors.primary, color: colors.cream,
    fontSize: type.body.fontSize, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT,
    boxShadow: '0 4px 10px -4px rgba(197,86,44,0.45)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  // CTA glossy ink — botón hero del nuevo sistema
  glossyBtn: {
    padding: '0 18px', height: 40, borderRadius: 10,
    background: `linear-gradient(180deg, ${colors.ink2} 0%, ${colors.ink} 100%)`,
    color: colors.cream, border: '1px solid #000',
    boxShadow: colors.shadowGlossy,
    fontSize: type.body.fontSize, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  secondaryBtn: {
    padding: '0 16px', height: 38, borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.surface, color: colors.text,
    fontSize: type.body.fontSize, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },

  // Typography — sale toda de `type`
  h1: { ...type.h1, color: colors.text },
  h2: { ...type.h3, color: colors.text, marginBottom: 12 },
  h3: { ...type.h3, color: colors.text },
  body: { ...type.body, color: colors.text },
  caption: { ...type.caption, color: colors.textMute },
  muted: { color: colors.textMute },
  dim: { color: colors.textDim },

  // Modal
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(26,24,21,0.45)',
    zIndex: 1000, display: 'flex', alignItems: 'center',
    justifyContent: 'center', backdropFilter: 'blur(4px)',
    padding: 16,
  },
  modalContent: {
    background: colors.surface, borderRadius: radius.lg, padding: 24,
    width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadowLg,
  },
}
