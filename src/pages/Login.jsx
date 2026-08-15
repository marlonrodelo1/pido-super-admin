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
      background: colors.bg,
      fontFamily: FONT,
      padding: 16,
    }}>
      <div style={{
        background: colors.surface,
        borderRadius: 16,
        padding: '44px 36px',
        width: 400,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: `1px solid ${colors.border}`,
        boxShadow: '0 24px 60px -24px rgba(26,24,21,0.18)',
      }}>
        {/* Brand — el logo de verdad del kit de identidad (`public/pidoo-logo.svg`),
            el mismo que la barra lateral. Antes aquí había una pastilla naranja
            con una "P" y la palabra "pidoo" escrita con la fuente del panel. */}
        <img
          src="/pidoo-logo.svg"
          alt="Pidoo"
          style={{ height: 34, width: 'auto', maxWidth: '70%', objectFit: 'contain', marginBottom: 10 }}
        />
        <div style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: colors.stone,
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

          {/* `onDangerSoft` y no `danger`: sobre el fondo claro, el acento como
              texto se queda en 3,3:1. Es la misma regla que ya sigue el panel. */}
          {denied && (
            <div style={{
              color: colors.onDangerSoft,
              fontSize: 12,
              fontWeight: 600,
              background: colors.dangerSoft,
              border: `1px solid rgba(181,86,74,0.35)`,
              padding: '10px 14px',
              borderRadius: 8,
              textAlign: 'center',
            }}>
              Acceso denegado. Solo usuarios superadmin pueden acceder.
            </div>
          )}
          {error && !denied && (
            <div style={{
              color: colors.onDangerSoft,
              fontSize: 12,
              fontWeight: 600,
              background: colors.dangerSoft,
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
          borderTop: `1px solid ${colors.border}`,
          fontSize: 11,
          color: colors.stone,
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
  // `stone` y no `stone2`: a 11px sobre crema, stone2 se queda en 3,6:1.
  color: colors.stone,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  padding: '0 12px',
  height: 42,
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  fontFamily: FONT,
  outline: 'none',
  // Blanco sobre la tarjeta crema: con `surface` en los dos, el campo
  // desaparecía dentro de la tarjeta.
  background: '#FFFFFF',
  color: colors.text,
  boxSizing: 'border-box',
}
