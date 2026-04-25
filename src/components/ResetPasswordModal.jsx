import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { KeyRound, Copy, Eye, EyeOff, Mail, Wand2, Check, AlertCircle, X } from 'lucide-react'
import { toast } from '../App'

// Modal reutilizable para restablecer la contraseña de cualquier usuario.
// Props:
//  - userId (string)        — id del usuario en `usuarios` y `auth.users`
//  - userEmail (string)     — email mostrado y usado para el link de recuperación
//  - userLabel (string)     — nombre legible para mostrar en el header
//  - userRole (string)      — rol (cliente/restaurante/socio/admin/superadmin) — informativo
//  - hasAuthAccount (bool)  — si false, deshabilita el modal (no hay auth.users)
//  - onClose ()             — cerrar
//
// El modal hace POST a la edge function `admin-reset-password` con el JWT del admin actual.
// Modos: set_password (manual) | send_recovery_email (link de recuperación).

function generarPasswordAleatoria(length = 12) {
  const charset = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*'
  let out = ''
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  for (let i = 0; i < length; i++) out += charset[arr[i] % charset.length]
  return out
}

export default function ResetPasswordModal({
  userId,
  userEmail,
  userLabel,
  userRole,
  hasAuthAccount = true,
  onClose,
}) {
  const [modo, setModo] = useState('manual') // 'manual' | 'email'
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null) // { ok, mensaje, link?, email? }

  useEffect(() => {
    if (!password) setPassword(generarPasswordAleatoria(12))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const passwordValida = useMemo(() => password && password.length >= 8, [password])

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto)
      toast('Copiado al portapapeles')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }

  async function confirmar() {
    if (!hasAuthAccount) return
    if (!userId) return toast('Falta user_id', 'error')

    setResultado(null)
    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        toast('Sesión expirada', 'error')
        setEnviando(false)
        return
      }

      const payload = modo === 'manual'
        ? { user_id: userId, mode: 'set_password', new_password: password }
        : { user_id: userId, mode: 'send_recovery_email' }

      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: payload,
      })

      if (error) {
        const msg = data?.message || data?.error || error.message || 'Error desconocido'
        const reason = data?.reason ? ` (${data.reason})` : ''
        setResultado({ ok: false, mensaje: msg + reason })
        toast('Error: ' + msg, 'error')
      } else if (data?.success) {
        if (modo === 'manual') {
          setResultado({ ok: true, mensaje: 'Contraseña actualizada. Compártela con el usuario.', password })
          toast('Contraseña actualizada')
        } else {
          setResultado({
            ok: true,
            mensaje: 'Link de recuperación generado.',
            link: data.action_link,
            email: data.email,
          })
          toast('Link de recuperación generado')
        }
      } else {
        setResultado({ ok: false, mensaje: data?.error || 'Respuesta inesperada' })
      }
    } catch (e) {
      setResultado({ ok: false, mensaje: e.message || String(e) })
      toast('Error: ' + (e.message || e), 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={ds.modal} onClick={onClose}>
      <div className="admin-modal-content" style={ds.modalContent} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: colors.primarySoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <KeyRound size={18} color={colors.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>Restablecer contraseña</h2>
            <div style={{ fontSize: 12, color: colors.textMute }}>
              {userLabel || '—'}{userEmail ? ` · ${userEmail}` : ''}{userRole ? ` · ${userRole}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: colors.textMute,
            cursor: 'pointer', padding: 4,
          }}>
            <X size={18} />
          </button>
        </div>

        {!hasAuthAccount ? (
          <div style={{
            padding: 14, borderRadius: 10,
            background: colors.warningSoft, color: colors.warning,
            fontSize: 12.5, lineHeight: 1.5,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Este usuario no tiene cuenta de acceso (solo Shipday). No se le puede restablecer
              contraseña porque no existe en <code>auth.users</code>.
            </span>
          </div>
        ) : (
          <>
            {/* Selector modo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => { setModo('manual'); setResultado(null) }}
                style={radioBtn(modo === 'manual')}
              >
                <KeyRound size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>Generar contraseña manual</div>
                  <div style={{ fontSize: 11, color: colors.textMute, marginTop: 2 }}>
                    Tú la fijas y se la entregas al usuario.
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setModo('email'); setResultado(null) }}
                style={radioBtn(modo === 'email')}
              >
                <Mail size={14} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>Enviar email de recuperación</div>
                  <div style={{ fontSize: 11, color: colors.textMute, marginTop: 2 }}>
                    El usuario recibe (o tú reenvías) un link.
                  </div>
                </div>
              </button>
            </div>

            {modo === 'manual' && (
              <div style={{ marginBottom: 14 }}>
                <label style={ds.label}>Nueva contraseña (mín. 8 caracteres)</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ ...ds.formInput, fontFamily: 'monospace', flex: 1 }}
                  />
                  <button
                    onClick={() => setShowPwd(s => !s)}
                    title={showPwd ? 'Ocultar' : 'Mostrar'}
                    style={{ ...ds.secondaryBtn, padding: 0, width: 38, justifyContent: 'center' }}
                  >
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    onClick={() => copiar(password)}
                    title="Copiar"
                    style={{ ...ds.secondaryBtn, padding: 0, width: 38, justifyContent: 'center' }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <button
                  onClick={() => setPassword(generarPasswordAleatoria(12))}
                  style={{ ...ds.filterBtn, marginTop: 8, gap: 5 }}
                >
                  <Wand2 size={12} /> Generar aleatoria
                </button>
                {!passwordValida && (
                  <div style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}>
                    La contraseña debe tener al menos 8 caracteres.
                  </div>
                )}
              </div>
            )}

            {modo === 'email' && (
              <div style={{
                padding: 12, borderRadius: 10, background: colors.elev2,
                fontSize: 12.5, color: colors.textDim, marginBottom: 14,
                lineHeight: 1.5,
              }}>
                Se generará un link de recuperación para <b>{userEmail || '—'}</b>. Si Supabase
                tiene SMTP configurado, el usuario recibirá el email automáticamente. En cualquier
                caso, el link aparecerá aquí para que puedas copiarlo y compartirlo manualmente.
              </div>
            )}

            {/* Resultado */}
            {resultado && (
              <div style={{
                padding: 12, borderRadius: 10, marginBottom: 14,
                background: resultado.ok ? colors.successSoft : colors.dangerSoft,
                color: resultado.ok ? colors.success : colors.danger,
                fontSize: 12.5, lineHeight: 1.5,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  {resultado.ok ? <Check size={14} /> : <AlertCircle size={14} />}
                  {resultado.mensaje}
                </div>
                {resultado.password && (
                  <div style={{
                    background: colors.surface, padding: '8px 10px', borderRadius: 8,
                    fontFamily: 'monospace', fontSize: 12.5, color: colors.text,
                    display: 'flex', alignItems: 'center', gap: 8,
                    border: `1px solid ${colors.border}`,
                  }}>
                    <span style={{ flex: 1, wordBreak: 'break-all' }}>{resultado.password}</span>
                    <button onClick={() => copiar(resultado.password)} style={{ ...ds.actionBtn, height: 24 }}>
                      <Copy size={11} />
                    </button>
                  </div>
                )}
                {resultado.link && (
                  <div style={{
                    background: colors.surface, padding: '8px 10px', borderRadius: 8,
                    fontFamily: 'monospace', fontSize: 11.5, color: colors.text,
                    display: 'flex', alignItems: 'center', gap: 8,
                    border: `1px solid ${colors.border}`, wordBreak: 'break-all',
                  }}>
                    <span style={{ flex: 1 }}>{resultado.link}</span>
                    <button onClick={() => copiar(resultado.link)} style={{ ...ds.actionBtn, height: 24, flexShrink: 0 }}>
                      <Copy size={11} />
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={ds.secondaryBtn} disabled={enviando}>Cerrar</button>
              <button
                onClick={confirmar}
                disabled={enviando || (modo === 'manual' && !passwordValida)}
                style={{
                  ...ds.primaryBtn,
                  opacity: enviando || (modo === 'manual' && !passwordValida) ? 0.5 : 1,
                }}
              >
                {enviando ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function radioBtn(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${active ? colors.primary : colors.border}`,
    background: active ? colors.primarySoft : colors.surface,
    color: colors.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    textAlign: 'left',
  }
}
