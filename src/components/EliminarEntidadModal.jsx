import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { Trash2, X, AlertTriangle } from 'lucide-react'
import { toast } from '../App'

// Estados de pedido considerados activos (bloquean borrado)
const ESTADOS_ACTIVOS = ['nuevo', 'aceptado', 'preparando', 'listo', 'recogido', 'en_camino']

/**
 * Modal de eliminación definitiva para usuarios, establecimientos y socios.
 *
 * Props:
 *  - tipo: 'usuario' | 'establecimiento' | 'socio'
 *  - entidad: registro completo de la tabla (con id, nombre/email/etc)
 *  - onClose(): cerrar sin borrar
 *  - onDeleted(resumen): callback al borrar con éxito
 */
export default function EliminarEntidadModal({ tipo, entidad, onClose, onDeleted }) {
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [incluirDueno, setIncluirDueno] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [errorDetalles, setErrorDetalles] = useState(null)

  // Texto exacto que el admin debe teclear
  const expected = useMemo(() => {
    if (tipo === 'usuario') return entidad?.email || ''
    if (tipo === 'establecimiento') return entidad?.nombre || ''
    if (tipo === 'socio') return entidad?.nombre_comercial || entidad?.nombre || entidad?.slug || entidad?.email || ''
    return ''
  }, [tipo, entidad])

  const titulo = useMemo(() => {
    if (tipo === 'usuario') return `${entidad?.nombre || ''} ${entidad?.apellido || ''}`.trim() || entidad?.email
    if (tipo === 'establecimiento') return entidad?.nombre
    if (tipo === 'socio') return entidad?.nombre_comercial || entidad?.nombre
    return ''
  }, [tipo, entidad])

  const labelTipo = tipo === 'usuario' ? 'usuario'
    : tipo === 'establecimiento' ? 'restaurante'
    : 'socio'

  useEffect(() => {
    cargarPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarPreview() {
    setLoadingPreview(true)
    try {
      if (tipo === 'usuario') {
        const [activos, pasados, dirs, resenas] = await Promise.all([
          supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('usuario_id', entidad.id).in('estado', ESTADOS_ACTIVOS),
          supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('usuario_id', entidad.id).not('estado', 'in', `(${ESTADOS_ACTIVOS.map(e => `"${e}"`).join(',')})`),
          supabase.from('direcciones_usuario').select('id', { count: 'exact', head: true }).eq('usuario_id', entidad.id),
          supabase.from('resenas').select('id', { count: 'exact', head: true }).eq('usuario_id', entidad.id),
        ])
        setPreview({
          pedidos_activos: activos.count || 0,
          pedidos_pasados: pasados.count || 0,
          direcciones: dirs.count || 0,
          resenas: resenas.count || 0,
        })
      } else if (tipo === 'establecimiento') {
        const [activos, pasados, productos, categorias, vinc, balPend, multi] = await Promise.all([
          supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('establecimiento_id', entidad.id).in('estado', ESTADOS_ACTIVOS),
          supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('establecimiento_id', entidad.id).not('estado', 'in', `(${ESTADOS_ACTIVOS.map(e => `"${e}"`).join(',')})`),
          supabase.from('productos').select('id', { count: 'exact', head: true }).eq('establecimiento_id', entidad.id),
          supabase.from('categorias').select('id', { count: 'exact', head: true }).eq('establecimiento_id', entidad.id),
          supabase.from('socio_establecimiento').select('id', { count: 'exact', head: true }).eq('establecimiento_id', entidad.id),
          supabase.from('balances_restaurante').select('id', { count: 'exact', head: true }).eq('establecimiento_id', entidad.id),
          Promise.resolve({ data: entidad?.stripe_subscription_multirider_id ? [{ id: 'sub' }] : [] }),
        ])
        setPreview({
          pedidos_activos: activos.count || 0,
          pedidos_pasados: pasados.count || 0,
          productos: productos.count || 0,
          categorias: categorias.count || 0,
          socios_vinculados: vinc.count || 0,
          balances: balPend.count || 0,
          tiene_subscription: !!entidad?.stripe_subscription_multirider_id,
          dueno_email: entidad?.email || null,
          tiene_dueno: !!entidad?.user_id,
        })
      } else if (tipo === 'socio') {
        // Riders del socio
        const { data: ridersData } = await supabase.from('rider_accounts').select('id').eq('socio_id', entidad.id)
        const riderIds = (ridersData || []).map(r => r.id)
        const [activosSocio, activosRiders, pasados, vinc, balPend] = await Promise.all([
          supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('socio_id', entidad.id).in('estado', ESTADOS_ACTIVOS),
          riderIds.length
            ? supabase.from('pedidos').select('id', { count: 'exact', head: true }).in('rider_account_id', riderIds).in('estado', ESTADOS_ACTIVOS)
            : Promise.resolve({ count: 0 }),
          supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('socio_id', entidad.id),
          supabase.from('socio_establecimiento').select('id', { count: 'exact', head: true }).eq('socio_id', entidad.id),
          supabase.from('balances_socio').select('id', { count: 'exact', head: true }).eq('socio_id', entidad.id).eq('estado', 'pendiente'),
        ])
        setPreview({
          pedidos_activos: (activosSocio.count || 0) + (activosRiders.count || 0),
          pedidos_pasados: pasados.count || 0,
          riders: riderIds.length,
          vinculaciones: vinc.count || 0,
          balances_pendientes: balPend.count || 0,
          tiene_subscription: !!(entidad?.stripe_subscription_multirider_id || entidad?.stripe_customer_id),
          tiene_user: !!entidad?.user_id,
        })
      }
    } catch (e) {
      console.error('preview error', e)
      setPreview({ error: e?.message || 'Error cargando preview' })
    } finally {
      setLoadingPreview(false)
    }
  }

  async function ejecutar() {
    setErrorMsg(null)
    setErrorDetalles(null)
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        setErrorMsg('Sesión no válida. Vuelve a iniciar sesión.')
        setSubmitting(false)
        return
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-eliminar-entidad`
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          tipo,
          id: entidad.id,
          opciones: {
            confirmacion: confirmText,
            ...(tipo === 'establecimiento' ? { incluir_dueno: incluirDueno } : {}),
          },
        }),
      })
      const data = await resp.json().catch(() => null)
      if (!resp.ok || !data?.success) {
        setErrorMsg(data?.message || data?.error || `Error ${resp.status}`)
        setErrorDetalles(data?.detalles || null)
        setSubmitting(false)
        return
      }
      toast(`${labelTipo[0].toUpperCase() + labelTipo.slice(1)} eliminado definitivamente`)
      onDeleted?.(data.resumen)
    } catch (e) {
      setErrorMsg(e?.message || String(e))
      setSubmitting(false)
    }
  }

  const habilitado = !submitting
    && !loadingPreview
    && !!preview
    && !preview?.error
    && (preview?.pedidos_activos || 0) === 0
    && (tipo !== 'socio' || (preview?.balances_pendientes || 0) === 0)
    && confirmText.trim().toLowerCase() === (expected || '').trim().toLowerCase()
    && (expected || '').trim().length > 0

  return (
    <div style={ds.modal} onClick={onClose}>
      <div
        style={{
          ...ds.modalContent,
          maxWidth: 560,
          padding: 0,
          overflow: 'hidden',
          borderTop: `4px solid ${colors.danger}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'flex-start', gap: 12, borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: colors.dangerSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Trash2 size={18} color={colors.danger} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: colors.text, margin: 0 }}>
              Eliminar {labelTipo} definitivamente
            </h2>
            <div style={{ fontSize: 12, color: colors.textMute, marginTop: 2 }}>
              Esta acción es <b style={{ color: colors.danger }}>irreversible</b>. Quedará registrada en auditoría.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMute, padding: 4 }} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 24px 22px' }}>
          <div style={{ fontSize: 13.5, color: colors.text, lineHeight: 1.55, marginBottom: 12 }}>
            Vas a eliminar definitivamente <b>"{titulo}"</b>.
          </div>

          {loadingPreview && (
            <div style={{ fontSize: 12.5, color: colors.textMute, padding: '12px 0' }}>Calculando impacto…</div>
          )}

          {preview?.error && (
            <div style={{ fontSize: 12.5, color: colors.danger, padding: '12px 0' }}>{preview.error}</div>
          )}

          {!loadingPreview && preview && !preview.error && (
            <div style={{ background: colors.elev2, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMute, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Impacto
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: colors.textDim, lineHeight: 1.7 }}>
                {tipo === 'usuario' && <ListaUsuario p={preview} />}
                {tipo === 'establecimiento' && <ListaEstablecimiento p={preview} />}
                {tipo === 'socio' && <ListaSocio p={preview} />}
              </ul>
            </div>
          )}

          {/* Avisos críticos */}
          {!loadingPreview && preview && (preview.pedidos_activos || 0) > 0 && (
            <div style={avisoStyle('danger')}>
              <AlertTriangle size={14} />
              <span><b>Bloqueado:</b> hay {preview.pedidos_activos} pedido(s) en curso. Espera a que terminen o cancélalos antes de eliminar.</span>
            </div>
          )}

          {tipo === 'socio' && !loadingPreview && preview && (preview.balances_pendientes || 0) > 0 && (
            <div style={avisoStyle('danger')}>
              <AlertTriangle size={14} />
              <span><b>Bloqueado:</b> el socio tiene {preview.balances_pendientes} balance(s) pendiente(s). Liquida o marca pagado antes.</span>
            </div>
          )}

          {tipo === 'socio' && !loadingPreview && preview?.tiene_subscription && (
            <div style={avisoStyle('warning')}>
              <AlertTriangle size={14} />
              <span>Este socio tiene una suscripción Stripe activa. Se cancelará inmediatamente al eliminar.</span>
            </div>
          )}

          {tipo === 'establecimiento' && !loadingPreview && preview?.tiene_subscription && (
            <div style={avisoStyle('warning')}>
              <AlertTriangle size={14} />
              <span>Este restaurante tiene la suscripción multi-rider activa. Se cancelará al eliminar.</span>
            </div>
          )}

          {/* Checkbox dueño establecimiento */}
          {tipo === 'establecimiento' && preview?.tiene_dueno && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: 8, marginBottom: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={incluirDueno}
                onChange={e => setIncluirDueno(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 12.5, color: colors.text, lineHeight: 1.45 }}>
                Eliminar también la cuenta del dueño
                {preview?.dueno_email && <> (<code style={{ fontFamily: 'monospace', color: colors.textMute }}>{preview.dueno_email}</code>)</>}.
                <div style={{ fontSize: 11, color: colors.textMute, marginTop: 2 }}>
                  Solo si esa cuenta no es dueña de otros restaurantes ni de un socio.
                </div>
              </span>
            </label>
          )}

          {/* Confirmación por texto */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...ds.label, marginBottom: 6 }}>
              Escribe <b style={{ color: colors.danger, fontFamily: 'monospace', textTransform: 'none', letterSpacing: 'normal' }}>{expected}</b> para confirmar
            </label>
            <input
              autoFocus
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={expected}
              style={{
                ...ds.formInput,
                borderColor: confirmText && confirmText.toLowerCase() === expected.toLowerCase() ? colors.danger : colors.border,
              }}
              disabled={submitting}
            />
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={avisoStyle('danger')}>
              <AlertTriangle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
          {errorDetalles && Array.isArray(errorDetalles) && errorDetalles.length > 0 && (
            <div style={{ background: colors.dangerSoft, border: `1px solid ${colors.danger}`, padding: '8px 10px', borderRadius: 6, marginTop: -8, marginBottom: 14, fontSize: 11.5, color: colors.danger, maxHeight: 120, overflowY: 'auto' }}>
              {errorDetalles.slice(0, 10).map((d, i) => (
                <div key={i}>{d.codigo || d.id} · {d.estado}</div>
              ))}
              {errorDetalles.length > 10 && <div>… y {errorDetalles.length - 10} más</div>}
            </div>
          )}

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={onClose} disabled={submitting} style={ds.secondaryBtn}>
              Cancelar
            </button>
            <button
              onClick={ejecutar}
              disabled={!habilitado}
              style={{
                ...ds.primaryBtn,
                background: habilitado ? colors.danger : colors.elev2,
                borderColor: habilitado ? colors.danger : colors.border,
                color: habilitado ? '#fff' : colors.textMute,
                boxShadow: habilitado ? '0 4px 10px -4px rgba(220,38,38,0.45)' : 'none',
                cursor: habilitado ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (habilitado) e.currentTarget.style.background = '#B91C1C' }}
              onMouseLeave={e => { if (habilitado) e.currentTarget.style.background = colors.danger }}
            >
              <Trash2 size={14} /> {submitting ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ListaUsuario({ p }) {
  return (
    <>
      {p.pedidos_pasados > 0 && <li>{p.pedidos_pasados} pedido(s) pasado(s) — se anonimizarán (se conservan para contabilidad).</li>}
      {p.direcciones > 0 && <li>{p.direcciones} dirección(es) guardada(s) — se borrarán.</li>}
      {p.resenas > 0 && <li>{p.resenas} reseña(s) — se anonimizarán.</li>}
      <li>Cuenta auth + perfil — se borrarán.</li>
    </>
  )
}

function ListaEstablecimiento({ p }) {
  return (
    <>
      {p.pedidos_pasados > 0 && <li>{p.pedidos_pasados} pedido(s) pasado(s) — se anonimizarán (se conservan para contabilidad).</li>}
      {p.productos > 0 && <li>{p.productos} producto(s) — se borrarán.</li>}
      {p.categorias > 0 && <li>{p.categorias} categoría(s) — se borrarán.</li>}
      {p.socios_vinculados > 0 && <li>{p.socios_vinculados} socio(s) vinculado(s) — se desvincularán.</li>}
      {p.balances > 0 && <li>{p.balances} balance(s) histórico(s) — se borrarán.</li>}
      <li>Configuración de delivery, riders vinculados, suscripciones, mensajes — se borrarán.</li>
    </>
  )
}

function ListaSocio({ p }) {
  return (
    <>
      {p.pedidos_pasados > 0 && <li>{p.pedidos_pasados} pedido(s) pasado(s) — se anonimizarán (se conservan para contabilidad).</li>}
      {p.riders > 0 && <li>{p.riders} cuenta(s) rider del socio — se borrarán junto con sus earnings y facturas.</li>}
      {p.vinculaciones > 0 && <li>{p.vinculaciones} restaurante(s) vinculado(s) — se desvincularán.</li>}
      <li>Reseñas, snapshots de riders, balances liquidados — se borrarán.</li>
      {p.tiene_user && <li>Cuenta auth + perfil del socio — se borrarán.</li>}
    </>
  )
}

function avisoStyle(tipo) {
  const c = tipo === 'danger' ? colors.danger : colors.warning
  const bg = tipo === 'danger' ? colors.dangerSoft : colors.warningSoft
  return {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '10px 12px', borderRadius: 8,
    background: bg, color: c,
    fontSize: 12.5, lineHeight: 1.45, marginBottom: 12,
    border: `1px solid ${c}33`,
  }
}
