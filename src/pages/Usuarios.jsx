import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { ds, colors, type, radius } from '../lib/darkStyles'
import { Card, Chip, EstadoBadge, GhostBtn, GlossyBtn, MiniBtn, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { toast } from '../App'
import { Save, KeyRound, Trash2, Users, Search, Receipt } from 'lucide-react'
import ResetPasswordModal from '../components/ResetPasswordModal'
import EliminarEntidadModal from '../components/EliminarEntidadModal'

// Etiqueta/valor de la ficha: la etiqueta con `ds.label` y el valor con
// `type.body`. Antes era "Teléfono:" en gris seguido del dato en la misma línea
// a 13px sueltos, y no había forma de leer la ficha en diagonal.
function Dato({ etiqueta, children }) {
  return (
    <div>
      <div style={{ ...ds.label, marginBottom: 2 }}>{etiqueta}</div>
      <div style={{ ...type.body, color: colors.text }}>{children}</div>
    </div>
  )
}

export default function Usuarios() {
  const [items, setItems] = useState([])
  const [buscar, setBuscar] = useState('')
  const [detalle, setDetalle] = useState(null)
  const [pedidosUsuario, setPedidosUsuario] = useState([])
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [resetPwd, setResetPwd] = useState(false)
  const [showEliminar, setShowEliminar] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('usuarios').select('*').is('eliminado_at', null).order('created_at', { ascending: false })
    setItems(data || [])
  }

  async function verDetalle(u) {
    setDetalle(u)
    setEditando(false)
    const { data } = await supabase.from('pedidos').select('id, codigo, total, subtotal, coste_envio, propina, estado, metodo_pago, canal, modo_entrega, created_at, establecimientos(nombre)')
      .eq('usuario_id', u.id).order('created_at', { ascending: false }).limit(30)
    setPedidosUsuario(data || [])
  }

  async function guardarUsuario() {
    setSaving(true)
    const { error } = await supabase.from('usuarios').update({
      nombre: form.nombre?.trim(),
      apellido: form.apellido?.trim() || null,
      telefono: form.telefono?.trim() || null,
      direccion: form.direccion?.trim() || null,
      metodo_pago_preferido: form.metodo_pago_preferido,
    }).eq('id', detalle.id)
    if (!error) {
      const updated = { ...detalle, ...form }
      setDetalle(updated)
      setItems(prev => prev.map(u => u.id === detalle.id ? updated : u))
      setEditando(false)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    } else {
      toast('Error al guardar: ' + error.message, 'error')
    }
    setSaving(false)
  }

  const filtrados = items.filter(u => {
    if (!buscar) return true
    const q = buscar.toLowerCase()
    return (u.nombre || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.telefono || '').includes(q)
  })

  // (El mapa de colores por estado que había aquí era el segundo del repo, con
  //  valores distintos a los de Pedidos.jsx para los mismos estados, y tenía el
  //  mismo fallo: `'var(--c-danger)' + '20'` no es un color. Ahora: EstadoBadge.)

  // Total gastado por el usuario
  const totalGastado = pedidosUsuario.filter(p => p.estado === 'entregado').reduce((s, p) => s + (p.total || 0), 0)
  const totalPedidos = pedidosUsuario.length
  const pedidosEntregados = pedidosUsuario.filter(p => p.estado === 'entregado').length

  // Avatar redondo. Una sola definición para la ficha (60px) y la lista (34px):
  // antes eran dos bloques calcados con el terracota escrito a pelo.
  const avatar = (u, px) => (
    <div style={{
      width: px, height: px, borderRadius: radius.full, flexShrink: 0,
      background: colors.terracottaSoft, color: colors.onTerracottaSoft,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      ...(px >= 48 ? type.h2 : { ...type.label, fontWeight: 700 }),
    }}>
      {u.avatar_url
        ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : (u.nombre?.[0] || 'U').toUpperCase()}
    </div>
  )

  if (detalle) {
    const esCliente = (detalle.rol || 'cliente') === 'cliente'
    return (
      <div>
        <button onClick={() => { setDetalle(null); setEditando(false) }} style={ds.backBtn}>← Volver</button>

        <Card>
          <div className="admin-page-header" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {avatar(detalle, 60)}
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <h1 style={{ ...ds.h1, marginBottom: 2 }}>{detalle.nombre} {detalle.apellido || ''}</h1>
              <div style={{ ...type.body, color: colors.textMute, overflow: 'hidden', textOverflow: 'ellipsis' }}>{detalle.email}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!editando ? (
                <>
                  <GhostBtn onClick={() => setResetPwd(true)} title="Restablecer contraseña">
                    <KeyRound size={15} /> Contraseña
                  </GhostBtn>
                  {esCliente && (
                    <GhostBtn danger onClick={() => setShowEliminar(true)} title="Eliminar usuario definitivamente">
                      <Trash2 size={15} /> Eliminar
                    </GhostBtn>
                  )}
                  <GlossyBtn accent onClick={() => { setForm({ nombre: detalle.nombre || '', apellido: detalle.apellido || '', telefono: detalle.telefono || '', direccion: detalle.direccion || '', metodo_pago_preferido: detalle.metodo_pago_preferido || 'tarjeta' }); setEditando(true) }}>
                    Editar
                  </GlossyBtn>
                </>
              ) : (
                <>
                  <GlossyBtn accent onClick={guardarUsuario} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
                    <Save size={15} /> {saving ? 'Guardando…' : 'Guardar'}
                  </GlossyBtn>
                  <GhostBtn onClick={() => setEditando(false)}>Cancelar</GhostBtn>
                </>
              )}
            </div>
          </div>

          {guardado && (
            <div style={{
              ...type.label, fontWeight: 600, textAlign: 'center',
              background: colors.sageSoft, color: colors.onSageSoft,
              padding: '9px 14px', borderRadius: radius.sm, marginBottom: 16,
            }}>
              Cambios guardados
            </div>
          )}

          {editando ? (
            <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={ds.label}>Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Apellido</label><input value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} style={ds.formInput} /></div>
              <div><label style={ds.label}>Método de pago</label>
                <select value={form.metodo_pago_preferido} onChange={e => setForm({ ...form, metodo_pago_preferido: e.target.value })} style={ds.select}>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="efectivo">Efectivo</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}><label style={ds.label}>Dirección</label><input value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} style={ds.formInput} /></div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={ds.label}>Email (no editable)</label>
                <input value={detalle.email || ''} disabled style={{ ...ds.formInput, background: colors.elev2, color: colors.textMute, cursor: 'not-allowed' }} />
              </div>
            </div>
          ) : (
            <>
              {/* Las tres cifras: mismo componente y mismo tamaño que en el resto
                  del panel (antes eran 20px inventados sobre un rectángulo gris) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
                <StatCard label="Total gastado" value={fmtEUR(totalGastado)} sub="Pedidos entregados" tone="terracotta" />
                <StatCard label="Pedidos" value={totalPedidos} sub="Últimos 30" />
                <StatCard label="Entregados" value={pedidosEntregados} sub={`de ${totalPedidos} pedidos`} tone="sage" />
              </div>

              <div className="admin-grid-2col-collapse" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Dato etiqueta="Teléfono">{detalle.telefono || '—'}</Dato>
                <Dato etiqueta="Dirección">{detalle.direccion || '—'}</Dato>
                <Dato etiqueta="Pago preferido">
                  <Chip tono={detalle.metodo_pago_preferido === 'efectivo' ? 'warning' : 'info'}>
                    {detalle.metodo_pago_preferido === 'efectivo' ? 'Efectivo' : 'Tarjeta'}
                  </Chip>
                </Dato>
                <Dato etiqueta="Registrado">{new Date(detalle.created_at).toLocaleDateString('es-ES')}</Dato>
                <Dato etiqueta="Favoritos">{detalle.favoritos?.length || 0}</Dato>
              </div>
            </>
          )}
        </Card>

        {/* Historial de pedidos */}
        <div style={{ marginTop: 24 }}>
          <h2 style={ds.h2}>Historial de pedidos ({pedidosUsuario.length})</h2>
          {pedidosUsuario.map(p => (
            <Card key={p.id} pad={14} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ ...type.mono, fontSize: type.label.fontSize, fontWeight: 600, color: colors.ink }}>{p.codigo}</span>
                  <EstadoBadge estado={p.estado} />
                  <Chip tono={p.metodo_pago === 'tarjeta' ? 'info' : 'warning'}>
                    {p.metodo_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}
                  </Chip>
                </div>
                <div style={{ ...type.caption, color: colors.textMute, letterSpacing: 0 }}>
                  {p.establecimientos?.nombre || '—'} · {new Date(p.created_at).toLocaleDateString('es-ES')} · PIDO
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ ...type.num, fontSize: type.bodyLg.fontSize, color: colors.text }}>{fmtEUR(p.total)}</div>
                {p.coste_envio > 0 && (
                  <div style={{ ...type.caption, color: colors.textMute, letterSpacing: 0, marginTop: 2 }}>
                    envío {fmtEUR(p.coste_envio)}
                  </div>
                )}
              </div>
            </Card>
          ))}
          {pedidosUsuario.length === 0 && (
            <Card pad={0}>
              <Vacio
                icon={<Receipt size={30} />}
                titulo="Sin pedidos todavía"
                texto="Cuando este cliente haga su primer pedido aparecerá aquí."
              />
            </Card>
          )}
        </div>

        {resetPwd && (
          <ResetPasswordModal
            userId={detalle.id}
            userEmail={detalle.email}
            userLabel={`${detalle.nombre || ''} ${detalle.apellido || ''}`.trim() || 'Usuario'}
            userRole={detalle.rol || 'cliente'}
            hasAuthAccount={true}
            onClose={() => setResetPwd(false)}
          />
        )}

        {showEliminar && (
          <EliminarEntidadModal
            tipo="usuario"
            entidad={detalle}
            onClose={() => setShowEliminar(false)}
            onDeleted={() => {
              setShowEliminar(false)
              setDetalle(null)
              setItems(prev => prev.filter(u => u.id !== detalle.id))
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 20 }}>
        <h1 style={{ ...ds.h1, marginBottom: 4 }}>Usuarios</h1>
        <div style={{ ...type.body, color: colors.textMute }}>
          {filtrados.length === items.length
            ? `${items.length} cliente${items.length === 1 ? '' : 's'} registrado${items.length === 1 ? '' : 's'}`
            : `${filtrados.length} de ${items.length} clientes`}
        </div>
      </div>

      <div style={{ position: 'relative', width: 320, maxWidth: '100%', marginBottom: 20 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.stone, pointerEvents: 'none' }} />
        <input
          aria-label="Buscar usuarios por nombre, email o teléfono"
          placeholder="Buscar por nombre, email o teléfono…"
          value={buscar} onChange={e => setBuscar(e.target.value)}
          style={{ ...ds.input, width: '100%', paddingLeft: 34 }}
        />
      </div>

      <div className="ds-table-stack" style={ds.table}>
        <div className="ds-th" style={ds.tableHeader}>
          <span style={{ flex: '1 1 180px', minWidth: 0 }}>Nombre</span>
          <span data-tablet-sm-hide="true" style={{ flex: '1 1 200px', minWidth: 0 }}>Email</span>
          <span data-tablet-hide="true" style={{ width: 120, flexShrink: 0 }}>Teléfono</span>
          <span data-tablet-hide="true" style={{ width: 96, flexShrink: 0 }}>Registro</span>
          <span style={{ width: 60, flexShrink: 0 }}>Acción</span>
        </div>

        {filtrados.map(u => (
          <div key={u.id} className="ds-row-touch" style={ds.tableRow}>
            <span data-col="nom" style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              {avatar(u, 34)}
              {/* Sin fontSize propio: en móvil la regla `[data-col="nom"]` sube
                  el nombre a 15px y un tamaño inline aquí se lo comería. */}
              <span
                onClick={() => verDetalle(u)}
                style={{ fontWeight: 600, color: colors.text, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {u.nombre} {u.apellido || ''}
              </span>
            </span>
            <span data-col="cod" data-tablet-sm-hide="true" style={{ flex: '1 1 200px', minWidth: 0, ...type.label, color: colors.textMute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.email}
            </span>
            <span data-col="ori" data-tablet-hide="true" style={{ width: 120, flexShrink: 0, ...type.label, color: colors.textMute, fontVariantNumeric: 'tabular-nums' }}>
              {u.telefono || '—'}
            </span>
            <span data-col="fec" data-tablet-hide="true" style={{ width: 96, flexShrink: 0, ...type.label, color: colors.textMute, fontVariantNumeric: 'tabular-nums' }}>
              {new Date(u.created_at).toLocaleDateString('es-ES')}
            </span>
            <span data-col="acc" style={{ width: 60, flexShrink: 0 }}>
              <MiniBtn className="admin-action-btn" onClick={() => verDetalle(u)} aria-label={`Ver la ficha de ${u.nombre || 'este usuario'}`}>
                Ver
              </MiniBtn>
            </span>
          </div>
        ))}

        {filtrados.length === 0 && (
          <Vacio
            icon={<Users size={30} />}
            titulo={buscar ? 'Ningún usuario coincide' : 'Todavía no hay usuarios'}
            texto={buscar ? `No se ha encontrado nada para "${buscar}". Prueba con otro nombre, email o teléfono.` : 'Aquí aparecerán los clientes en cuanto se registren en la app.'}
          />
        )}
      </div>
    </div>
  )
}
