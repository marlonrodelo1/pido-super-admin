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

  // === Sombras ===
  shadow:   '0 1px 3px rgba(26,24,21,0.05), 0 1px 1px rgba(26,24,21,0.03)',
  shadowMd: '0 4px 12px rgba(26,24,21,0.06), 0 1px 3px rgba(26,24,21,0.04)',
  shadowLg: '0 14px 40px rgba(26,24,21,0.10), 0 4px 12px rgba(26,24,21,0.06)',
  shadowGlossy: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 1px 2px rgba(26,24,21,0.20)',
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 }

export const ds = {
  // Cards / surfaces
  card: {
    background: colors.surface,
    borderRadius: radius.md,
    padding: '14px 16px',
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadow,
  },

  // Tables (flex-based, densidad alta)
  table: {
    background: colors.surface,
    borderRadius: 10,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    boxShadow: colors.shadow,
  },
  tableHeader: {
    display: 'flex', alignItems: 'center', padding: '9px 14px', gap: 12,
    fontSize: 10.5, fontWeight: 700, color: colors.textMute,
    borderBottom: `1px solid ${colors.border}`,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    background: colors.elev2,
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 12,
    borderBottom: `1px solid ${colors.border}`, color: colors.text,
    fontSize: 13, fontWeight: 500,
  },

  // Badges / tags
  badge: {
    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    background: colors.elev2, color: colors.textDim,
    border: `1px solid ${colors.border}`, display: 'inline-flex',
    alignItems: 'center', gap: 5,
  },

  // Inputs
  input: {
    padding: '0 12px', height: 34, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`, fontSize: 13,
    fontFamily: FONT, width: 260, outline: 'none',
    background: colors.surface, color: colors.text,
  },
  formInput: {
    width: '100%', padding: '0 12px', height: 36, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`, fontSize: 13,
    fontFamily: FONT, background: colors.surface,
    color: colors.text, outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '0 36px 0 12px', height: 36, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`, fontSize: 13,
    fontFamily: FONT, background: colors.surface,
    color: colors.text, outline: 'none', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="%236B6356" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>')}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    cursor: 'pointer',
  },
  label: {
    fontSize: 11, fontWeight: 700, color: colors.textMute,
    marginBottom: 6, display: 'block',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  },

  // Buttons
  filterBtn: {
    padding: '0 10px', height: 28, borderRadius: 6,
    border: `1px solid ${colors.border}`,
    fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    fontFamily: FONT, background: colors.surface, color: colors.textDim,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  actionBtn: {
    padding: '0 10px', height: 26, borderRadius: 6, border: `1px solid ${colors.border}`,
    fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
    background: colors.surface, color: colors.text,
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
    color: colors.primary, cursor: 'pointer', fontFamily: FONT,
    marginBottom: 16, padding: 0,
  },
  primaryBtn: {
    padding: '0 14px', height: 34, borderRadius: radius.sm,
    border: `1px solid ${colors.primary}`,
    background: colors.primary, color: colors.cream, fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT,
    boxShadow: '0 4px 10px -4px rgba(197,86,44,0.45)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  // CTA glossy ink — botón hero del nuevo sistema
  glossyBtn: {
    padding: '0 18px', height: 38, borderRadius: radius.sm,
    background: `linear-gradient(180deg, ${colors.ink2} 0%, ${colors.ink} 100%)`,
    color: colors.cream, border: '1px solid #000',
    boxShadow: colors.shadowGlossy,
    fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  secondaryBtn: {
    padding: '0 14px', height: 34, borderRadius: radius.sm,
    border: `1px solid ${colors.border}`,
    background: colors.surface, color: colors.text,
    fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },

  // Typography
  h1: { fontSize: 22, fontWeight: 700, color: colors.text, letterSpacing: '-0.02em', fontFamily: FONT },
  h2: { fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 12, letterSpacing: '-0.015em', fontFamily: FONT },
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
