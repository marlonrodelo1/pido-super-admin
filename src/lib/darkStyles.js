// Estilos dark compartidos para super-admin
export const ds = {
  card: {
    background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '20px 22px',
    border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)',
  },
  table: {
    background: 'rgba(255,255,255,0.04)', borderRadius: 14, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  tableHeader: {
    display: 'flex', alignItems: 'center', padding: '12px 20px', gap: 12,
    fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
    borderBottom: '1px solid rgba(255,255,255,0.06)', textTransform: 'uppercase',
  },
  tableRow: {
    display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 12,
    borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#F5F5F5',
  },
  badge: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 },
  input: {
    padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", width: 260, outline: 'none',
    background: 'rgba(255,255,255,0.06)', color: '#F5F5F5',
  },
  filterBtn: {
    padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11,
    fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  actionBtn: {
    padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    background: 'rgba(255,255,255,0.08)', color: '#3B82F6',
  },
  backBtn: {
    background: 'none', border: 'none', fontSize: 13, fontWeight: 600,
    color: '#FF6B2C', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    marginBottom: 16, padding: 0,
  },
  h1: { fontSize: 22, fontWeight: 800, color: '#F5F5F5' },
  h2: { fontSize: 16, fontWeight: 700, color: '#F5F5F5', marginBottom: 12 },
  muted: { color: 'rgba(255,255,255,0.4)' },
  label: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 4, display: 'block' },
  formInput: {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)', fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", background: 'rgba(255,255,255,0.06)',
    color: '#F5F5F5', outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)', fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", background: '#1A1A1A',
    color: '#F5F5F5', outline: 'none', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>')}")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
    paddingRight: 36, cursor: 'pointer',
  },
  primaryBtn: {
    padding: '10px 20px', borderRadius: 10, border: 'none',
    background: '#FF6B2C', color: '#fff', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  secondaryBtn: {
    padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent', color: '#F5F5F5', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalContent: {
    background: '#1A1A1A', borderRadius: 18, padding: 28, width: '100%', maxWidth: 520,
    maxHeight: '85vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)',
  },
}
