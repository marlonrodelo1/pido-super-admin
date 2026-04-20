// Estilos compartidos super-admin — paleta LIGHT tipo Claude (abril 2026)
// Mantenemos el nombre del archivo `darkStyles.js` para no romper imports
// Paleta y tokens: ver C:\Users\Marlon Rodelo Ayala\Desktop\Pidoo\DESIGN.md
// Variables CSS equivalentes en :root (ver index.css)

export const colors = {
  bg: '#FAFAF7',
  sidebar: '#FFFFFF',
  elev: '#FFFFFF',
  elev2: '#F4F2EC',
  surface: '#FFFFFF',
  surfaceHover: '#F4F2EC',
  border: '#E8E6E0',
  borderStrong: '#D4D2CC',
  text: '#1F1F1E',
  textDim: '#3D3D3B',
  textMute: '#6B6B68',
  textFaint: '#8A8A86',
  primary: '#FF6B2C',
  primaryDark: '#E85A1F',
  primarySoft: 'rgba(255,107,44,0.10)',
  primaryBorder: 'rgba(255,107,44,0.32)',
  success: '#16A34A',
  successSoft: 'rgba(22,163,74,0.10)',
  danger: '#DC2626',
  dangerSoft: 'rgba(220,38,38,0.10)',
  dangerText: '#DC2626',
  warning: '#D97706',
  warningSoft: 'rgba(217,119,6,0.12)',
  info: '#2563EB',
  infoSoft: 'rgba(37,99,235,0.10)',
  shadow: '0 1px 2px rgba(15,15,15,0.04), 0 1px 3px rgba(15,15,15,0.06)',
  shadowMd: '0 4px 12px rgba(15,15,15,0.08)',
}

const FONT = "'Inter', system-ui, -apple-system, sans-serif"

export const ds = {
  // Cards / surfaces
  card: {
    background: colors.surface,
    borderRadius: 12,
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
    background: colors.surface2 || colors.elev2,
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
    padding: '0 12px', height: 34, borderRadius: 8,
    border: `1px solid ${colors.border}`, fontSize: 13,
    fontFamily: FONT, width: 260, outline: 'none',
    background: colors.surface, color: colors.text,
  },
  formInput: {
    width: '100%', padding: '0 12px', height: 36, borderRadius: 8,
    border: `1px solid ${colors.border}`, fontSize: 13,
    fontFamily: FONT, background: colors.surface,
    color: colors.text, outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '0 36px 0 12px', height: 36, borderRadius: 8,
    border: `1px solid ${colors.border}`, fontSize: 13,
    fontFamily: FONT, background: colors.surface,
    color: colors.text, outline: 'none', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="%236B6B68" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>')}")`,
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
    padding: '0 14px', height: 34, borderRadius: 8, border: `1px solid ${colors.primary}`,
    background: colors.primary, color: '#fff', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT,
    boxShadow: '0 4px 10px -4px rgba(255,107,44,0.45)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  secondaryBtn: {
    padding: '0 14px', height: 34, borderRadius: 8,
    border: `1px solid ${colors.border}`,
    background: colors.surface, color: colors.text,
    fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },

  // Typography
  h1: { fontSize: 22, fontWeight: 800, color: colors.text, letterSpacing: '-0.4px' },
  h2: { fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 12, letterSpacing: '-0.2px' },
  muted: { color: colors.textMute },
  dim: { color: colors.textDim },

  // Modal
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(15,15,15,0.45)',
    zIndex: 1000, display: 'flex', alignItems: 'center',
    justifyContent: 'center', backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: colors.surface, borderRadius: 14, padding: 24,
    width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 24px 60px rgba(15,15,15,0.18)',
  },
}
