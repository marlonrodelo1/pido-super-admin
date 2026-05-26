import { useState } from 'react'
import { useAdmin } from '../context/AdminContext'
import { colors } from '../lib/darkStyles'

const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: colors.ink,
      fontFamily: FONT,
      padding: 16,
    }}>
      <div style={{
        background: colors.ink2,
        borderRadius: 16,
        padding: '44px 36px',
        width: 400,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid #3A3530',
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.terracotta} 0%, ${colors.terracotta2} 100%)`,
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 900, fontSize: 16,
            boxShadow: '0 0 0 1px rgba(197,86,44,0.35), 0 8px 20px -6px rgba(197,86,44,0.45)',
          }}>P</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: colors.cream, letterSpacing: '-0.3px' }}>pidoo</div>
        </div>
        <div style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: colors.stone2,
          marginBottom: 32,
          fontWeight: 700,
        }}>Super Admin</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              autoFocus
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {denied && (
            <div style={{
              color: colors.danger,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(181,86,74,0.12)',
              border: '1px solid rgba(181,86,74,0.30)',
              padding: '10px 14px',
              borderRadius: 8,
              textAlign: 'center',
            }}>
              Acceso denegado. Solo usuarios superadmin pueden acceder.
            </div>
          )}
          {error && !denied && (
            <div style={{
              color: colors.danger,
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(181,86,74,0.10)',
              padding: '8px 12px',
              borderRadius: 8,
              textAlign: 'center',
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            padding: '0 14px',
            height: 42,
            borderRadius: 10,
            border: `1px solid ${colors.terracotta}`,
            background: loading ? colors.terracotta2 : colors.terracotta,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: FONT,
            marginTop: 8,
            boxShadow: '0 8px 24px -8px rgba(197,86,44,0.55)',
            letterSpacing: '-0.01em',
          }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div style={{
          marginTop: 28,
          paddingTop: 18,
          borderTop: '1px solid #3A3530',
          fontSize: 11,
          color: colors.stone2,
          width: '100%',
          textAlign: 'center',
        }}>
          admin.pidoo.es · acceso restringido
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: colors.stone2,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  padding: '0 12px',
  height: 42,
  borderRadius: 10,
  border: '1px solid #3A3530',
  fontSize: 14,
  fontFamily: FONT,
  outline: 'none',
  background: '#1F1C18',
  color: colors.cream,
  boxSizing: 'border-box',
}
