import { useState } from 'react'
import { useAdmin } from '../context/AdminContext'

export default function Login() {
  const { login, accessDenied } = useAdmin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await login(email, password)
    if (error) setError('Credenciales incorrectas')
    setLoading(false)
  }

  const denied = accessDenied || error === 'access_denied'

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: 'linear-gradient(135deg,#FF6B2C,#FF3D00)',
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 900, fontSize: 14,
            boxShadow: '0 0 0 1px rgba(255,107,44,0.35), 0 8px 20px -6px rgba(255,107,44,0.45)',
          }}>P</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--c-text)', letterSpacing: '-0.3px' }}>Pidoo</div>
        </div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--c-muted)', marginBottom: 28, fontWeight: 700 }}>Super Admin</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} required />
          {denied && <div style={{ color: 'var(--c-danger)', fontSize: 12, fontWeight: 600, background: 'var(--c-danger-soft)', padding: '10px 14px', borderRadius: 8, textAlign: 'center' }}>Acceso denegado. Solo usuarios superadmin pueden acceder.</div>}
          {error && !denied && <div style={{ color: 'var(--c-danger)', fontSize: 12, fontWeight: 600 }}>{error}</div>}
          <button type="submit" disabled={loading} style={styles.btn}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--c-bg)', fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  card: {
    background: 'var(--c-surface)', borderRadius: 14, padding: '40px 36px', width: 380,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    border: '1px solid var(--c-border)', boxShadow: '0 24px 60px rgba(15,15,15,0.10)',
  },
  input: {
    width: '100%', padding: '0 12px', height: 38, borderRadius: 8, border: '1px solid var(--c-border)',
    fontSize: 13, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", outline: 'none',
    background: 'var(--c-surface)', color: 'var(--c-text)',
  },
  btn: {
    padding: '0 14px', height: 38, borderRadius: 8, border: '1px solid #FF6B2C', background: '#FF6B2C', color: '#fff',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", marginTop: 8,
    boxShadow: '0 6px 18px -6px rgba(255,107,44,0.55)',
  },
}
