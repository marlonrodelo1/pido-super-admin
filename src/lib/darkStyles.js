// Estilos compartidos super-admin — alineados al design system Pidoo Admin
// Paleta: Inter + JetBrains Mono, fondo #0D0D0D, primario #FF6B2C, acentos en grises neutros
// Variables CSS equivalentes disponibles en :root (ver index.css)

export const colors = {
  bg: '#0D0D0D',
  sidebar: '#111111',
  elev: '#161616',
  elev2: '#1C1C1C',
  surface: 'rgba(255,255,255,0.04)',
  surfaceHover: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F5F5F5',
  textDim: 'rgba(245,245,245,0.62)',
  textMute: 'rgba(245,245,245,0.40)',
  textFaint: 'rgba(245,245,245,0.22)',
  primary: '#FF6B2C',
  primarySoft: 'rgba(255,107,44,0.12)',
  primaryBorder: 'rgba(255,107,44,0.32)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.12)',
  dangerText: '#F8B4B4',
}

const FONT = "'Inter', system-ui, -apple-system, sans-serif"

export const ds = {
  // Cards / surfaces
  card: {
    background: colors.surface,
    borderRadius: 12,
    padding: '16px 18px',
    border: `1px solid ${colors.border}`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },

  // Tables (flex-based)
  table: {
    background: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
  },
  tableHeader: {
    display: 'flex', alignItems: 'center', padding: '9px 14px', gap: 12,
    fontSize: 10.5, fontWeight: 700, color: colors.textMute,
    borderBottom: `1px solid ${colors.border}`,
    textTransform: 'uppercase', letterSpacing: '0.1em',
    background: colors.elev,
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 12,
    borderBottom: `1px solid ${colors.border}`, color: colors.textDim,
    fontSize: 13, fontWeight: 500,
  },

  // Badges / tags
  badge: {
    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    background: 'rgba(255,255,255,0.05)', color: colors.textDim,
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
    fontFamily: FONT, background: '#1A1A1A',
    color: colors.text, outline: 'none', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(245,245,245,0.40)" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>')}")`,
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
    boxShadow: '0 6px 18px -6px rgba(255,107,44,0.55)',
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
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 1000, display: 'flex', alignItems: 'center',
    justifyContent: 'center', backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: colors.elev, borderRadius: 14, padding: 24,
    width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
    border: `1px solid ${colors.borderStrong}`,
    boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
  },
}
