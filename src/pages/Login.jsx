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
        <div style={{ fontWeight: 800, fontSize: 28, color: '#FF6B2C', letterSpacing: -1, marginBottom: 4 }}>pidoo</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 32, fontWeight: 500 }}>Super Admin Panel</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} required />
          {denied && <div style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, background: 'rgba(239,68,68,0.1)', padding: '10px 14px', borderRadius: 8, textAlign: 'center' }}>Acceso denegado. Solo usuarios superadmin pueden acceder.</div>}
          {error && !denied && <div style={{ color: '#EF4444', fontSize: 12, fontWeight: 600 }}>{error}</div>}
          <button type="submit" disabled={loading} style={styles.btn}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0D0D0D', fontFamily: "'DM Sans', sans-serif",
  },
  card: {
    background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: '48px 40px', width: 380,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)',
  },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none',
    background: 'rgba(255,255,255,0.06)', color: '#F5F5F5',
  },
  btn: {
    padding: '12px', borderRadius: 10, border: 'none', background: '#FF6B2C', color: '#fff',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: 8,
  },
}
