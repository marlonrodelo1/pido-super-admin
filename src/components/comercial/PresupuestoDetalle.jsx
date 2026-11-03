import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Send, FileText, RotateCcw, Ban, Rocket, CreditCard, Landmark, Download, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAdmin } from '../../context/AdminContext'
import { colors, ds, type } from '../../lib/darkStyles'
import { Card, Chip, GhostBtn, GlossyBtn, MiniBtn, SectionLabel, Segmented, fmtEUR } from '../../lib/ui'
import { ESTADOS_PLAZO, ESTADOS_PRESUPUESTO, ESTADOS_SUSCRIPCION, MARCAS, fechaCorta, fechaHora, llamarComercial, mensajeBD } from '../../lib/comercial'
import { Campo } from '../../pages/Precios'
import { toast, confirmar } from '../../App'

// Presupuesto ya enviado: no se edita (la BD lo congela, PD410). Aquí se sigue
// su vida: aceptación, cobros de cada plazo, plan mensual, facturas e historial.
// Todo lo que mueve dinero es solo del superadmin; el comercial ve el estado,
// reenvía, anula o hace una versión nueva de los suyos.

const EVENTOS = {
  enviado: 'Enviado', reenviado: 'Reenviado', correo_fallido: 'El correo no salió', aceptado: 'Aceptado',
  aceptado_por_escrito: 'Aceptado por escrito', pago_recibido: 'Pago recibido', pago_fallido: 'Pago fallido',
  factura_emitida: 'Factura emitida', factura_pendiente: 'Pago SIN factura', plazo_pedido: 'Pago pedido',
  cobro_lanzado: 'Cobro lanzado', cobro_fallido: 'Cobro fallido', publicado: 'Trabajo publicado',
  mantenimiento_activado: 'Plan mensual activado', mantenimiento_domiciliado: 'Plan mensual domiciliado',
  domiciliacion_pedida: 'Domiciliación pedida', cuota_cobrada: 'Cuota cobrada', cuota_fallida: 'Cuota fallida',
  baja_mantenimiento: 'Baja del plan pedida', baja_programada: 'Baja programada', mantenimiento_cancelado: 'Plan cancelado',
  anulado: 'Anulado', caducado: 'Caducado', nueva_version: 'Versión nueva', creado_como_version: 'Creado como versión nueva',
  importe_distinto: 'Importe distinto en Stripe',
}

export default function PresupuestoDetalle({ id, onVolver, onAbrir }) {
  const { rol } = useAdmin()
  const esSuper = rol === 'superadmin'
  const [d, setD] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const [dialogo, setDialogo] = useState(null)

  async function cargar() {
    const { data: p, error } = await supabase.from('comercial_presupuestos').select('*').eq('id', id).single()
    if (error) return toast(mensajeBD(error), 'error')
    const [c, l, pl, s, h, f] = await Promise.all([
      supabase.from('comercial_clientes').select('*').eq('id', p.cliente_id).single(),
      supabase.from('comercial_presupuesto_lineas').select('*').eq('presupuesto_id', id).order('orden'),
      supabase.from('comercial_plazos').select('*').eq('presupuesto_id', id).order('orden'),
      supabase.from('comercial_suscripciones').select('*').eq('presupuesto_id', id).maybeSingle(),
      supabase.from('comercial_historial').select('*').eq('presupuesto_id', id).order('created_at', { ascending: false }),
      esSuper ? supabase.from('comercial_facturas').select('id, codigo, fecha, total, origen, periodo, enviada_at').eq('presupuesto_id', id).order('numero') : Promise.resolve({ data: [] }),
    ])
    setD({ p, cliente: c.data, lineas: l.data || [], plazos: pl.data || [], sus: s.data, historial: h.data || [], facturas: f.data || [] })
  }
  useEffect(() => { cargar() }, [id])

  async function accion(nombre, datos, { ok, confirmarCon } = {}) {
    if (confirmarCon && !(await confirmar(confirmarCon))) return null
    setOcupado(nombre)
    try {
      const r = await llamarComercial(nombre, { presupuesto_id: id, ...datos })
      if (r.aviso) toast(r.aviso, 'error')
      else if (ok) toast(ok)
      if (r.avisos?.length) toast(r.avisos.join(' · '), 'error')
      await cargar()
      return r
    } catch (e) {
      toast(e.message, 'error')
      return null
    } finally {
      setOcupado('')
    }
  }

  async function abrirPdf(tipo, idDoc) {
    try {
      const r = await llamarComercial('descargar', { tipo, id: idDoc || id })
      window.open(r.url, '_blank')
    } catch (e) { toast(e.message, 'error') }
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); toast('Enlace copiado') }
    catch { toast('No se pudo copiar: ' + texto, 'error') }
  }

  if (!d) return <Card><div style={{ padding: 24, ...type.body, color: colors.textMute }}>Cargando…</div></Card>
  const { p, cliente, plazos, sus } = d
  const e = ESTADOS_PRESUPUESTO[p.estado] || { tono: 'neutral', label: p.estado }
  const enlace1 = plazos[0]?.stripe_payment_link_url
  const pendientes = plazos.filter(x => !x.al_aceptar && !['pagado', 'procesando', 'anulado'].includes(x.estado))

  return (
    <div>
      <button style={ds.backBtn} onClick={onVolver}><ArrowLeft size={15} style={{ verticalAlign: '-2px' }} /> Presupuestos</button>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ ...type.mono, fontWeight: 700 }}>{p.numero}{p.version > 1 ? ` v${p.version}` : ''}</span>
            <Chip tono={e.tono} dot>{e.label}</Chip>
            <Chip tono={p.marca === 'pidoo' ? 'terracotta' : 'info'}>{MARCAS.find(m => m.value === p.marca)?.label}</Chip>
          </div>
          <h1 style={{ ...ds.h1, fontSize: 26, marginBottom: 2 }}>{p.proyecto}</h1>
          <div style={{ ...type.body, color: colors.stone }}>{cliente?.nombre_comercial || cliente?.razon_social} · {cliente?.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {p.estado === 'enviado' && enlace1 && <GhostBtn size="sm" onClick={() => copiar(enlace1)}><Copy size={14} /> Copiar enlace de pago</GhostBtn>}
          {p.estado === 'enviado' && <GhostBtn size="sm" onClick={() => setDialogo({ tipo: 'reenviar', email: p.enviado_a || cliente?.email || '' })} disabled={!!ocupado}><Send size={14} /> Reenviar</GhostBtn>}
          {['enviado', 'caducado', 'anulado', 'rechazado'].includes(p.estado) && (
            <GhostBtn size="sm" disabled={!!ocupado} onClick={async () => {
              const r = await accion('nueva_version', {}, { ok: 'Versión nueva creada', confirmarCon: p.estado === 'enviado' ? 'Se anula este (su enlace de pago deja de funcionar) y se abre una copia en borrador para cambiarla. ¿Seguir?' : null })
              if (r?.presupuesto_id) onAbrir(r.presupuesto_id, 'borrador')
            }}><RotateCcw size={14} /> Versión nueva</GhostBtn>
          )}
          {['enviado', 'caducado'].includes(p.estado) && (
            <GhostBtn size="sm" danger disabled={!!ocupado} onClick={() => setDialogo({ tipo: 'anular', motivo: '' })}><Ban size={14} /> Anular</GhostBtn>
          )}
          {esSuper && p.estado === 'enviado' && <GhostBtn size="sm" disabled={!!ocupado} onClick={() => setDialogo({ tipo: 'escrito', firmante_nombre: '', firmante_dni: '' })}>Aceptado por escrito</GhostBtn>}
          {esSuper && p.estado === 'aceptado' && (pendientes.length > 0 || (sus && !sus.stripe_subscription_id)) && (
            <GlossyBtn size="sm" disabled={!!ocupado} onClick={() => setDialogo({ tipo: 'publicar', cobro: p.stripe_payment_method_id ? 'enlace' : 'enlace' })}><Rocket size={14} /> Trabajo publicado</GlossyBtn>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <SectionLabel>Importes (IGIC incluido)</SectionLabel>
            <Fila k="Una sola vez" v={fmtEUR(p.total_unico)} fuerte />
            {Number(p.total_mensual) > 0 && <Fila k="Cada mes" v={`${fmtEUR(p.total_mensual)} /mes`} fuerte />}
            <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, marginTop: 8 }}>
              {d.lineas.map(l => `${l.concepto}${l.tipo === 'mensual' ? ' (mensual)' : ''}`).join(' · ')}
            </div>
            <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, marginTop: 6 }}>
              Fecha {fechaCorta(p.fecha)} · válido hasta {fechaCorta(p.valido_hasta)}{p.enviado_at ? ` · enviado ${fechaHora(p.enviado_at)} a ${p.enviado_a}` : ''}
            </div>
          </Card>

          <Card>
            <SectionLabel>Plazos</SectionLabel>
            <div style={{ display: 'grid', gap: 10 }}>
              {plazos.map((x, i) => {
                const ep = ESTADOS_PLAZO[x.estado] || { tono: 'neutral', label: x.estado }
                const puedeCobrar = esSuper && p.estado === 'aceptado' && !['pagado', 'procesando', 'anulado'].includes(x.estado)
                return (
                  <div key={x.id} style={{ borderBottom: i < plazos.length - 1 ? `1px solid ${colors.border}` : 'none', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ ...type.label, fontWeight: 700, flex: '1 1 160px' }}>{i + 1}. {x.descripcion} · {Number(x.pct)} %</span>
                      <Chip tono={ep.tono}>{ep.label}</Chip>
                      <span style={{ ...type.num, fontSize: 15 }}>{fmtEUR(x.total)}</span>
                    </div>
                    <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, marginTop: 4 }}>
                      {x.pagado_at ? `Pagado ${fechaHora(x.pagado_at)}${x.forma_pago ? ` · ${x.forma_pago}` : ''}` : ''}
                      {x.estado === 'enlace_enviado' && x.stripe_payment_link_url ? 'Esperando a que pague con el enlace' : ''}
                      {x.estado === 'procesando' ? 'Domiciliación en curso: tarda unos días' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {x.stripe_payment_link_url && x.estado === 'enlace_enviado' && <MiniBtn onClick={() => copiar(x.stripe_payment_link_url)}><Copy size={13} /> Enlace</MiniBtn>}
                      {puedeCobrar && <MiniBtn disabled={!!ocupado} onClick={() => accion('pedir_plazo', { plazo_id: x.id }, { ok: 'Enlace de pago enviado' })}><Send size={13} /> Pedir el pago</MiniBtn>}
                      {puedeCobrar && p.stripe_payment_method_id && (
                        <MiniBtn disabled={!!ocupado} onClick={() => accion('cobrar_guardado', { plazo_id: x.id }, {
                          ok: 'Cobro lanzado', confirmarCon: `¿Cobrar ${fmtEUR(x.total)} ahora con su ${p.stripe_payment_method_tipo === 'sepa_debit' ? 'cuenta domiciliada' : 'tarjeta guardada'}?`,
                        })}>{p.stripe_payment_method_tipo === 'sepa_debit' ? <Landmark size={13} /> : <CreditCard size={13} />} Cobrar con lo guardado</MiniBtn>
                      )}
                      {puedeCobrar && <MiniBtn disabled={!!ocupado} onClick={() => setDialogo({ tipo: 'pagado', plazo: x, forma: 'transferencia' })}>Cobrado fuera</MiniBtn>}
                      {esSuper && x.estado === 'pagado' && !x.factura_id && (
                        <MiniBtn danger disabled={!!ocupado} onClick={() => accion('emitir_pendiente', { plazo_id: x.id }, { ok: 'Factura emitida' })}>Emitir factura</MiniBtn>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {sus && (
            <Card>
              <SectionLabel>Plan mensual</SectionLabel>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...type.num, fontSize: 18, flex: 1 }}>{fmtEUR(sus.total)} /mes</span>
                <Chip tono={(ESTADOS_SUSCRIPCION[sus.estado] || {}).tono}>{(ESTADOS_SUSCRIPCION[sus.estado] || {}).label || sus.estado}</Chip>
              </div>
              <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, marginTop: 6 }}>
                {sus.forma_pago ? `Con ${sus.forma_pago}. ` : ''}
                {sus.proximo_cobro ? `Próximo cobro: ${fechaCorta(sus.proximo_cobro)}. ` : ''}
                {sus.intentos_fallidos ? `${sus.intentos_fallidos} intentos fallidos. ` : ''}
                {sus.baja_solicitada_at ? `Baja pedida el ${fechaCorta(sus.baja_solicitada_at)}: termina al final del mes pagado. ` : ''}
                {!sus.stripe_subscription_id && sus.estado === 'pendiente_inicio' ? (p.stripe_payment_method_id ? 'Su medio de pago está guardado: empieza a cobrarse al pulsar «Trabajo publicado».' : 'No quedó medio de pago guardado: habrá que pedirle la domiciliación.') : ''}
              </div>
              {esSuper && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {!sus.stripe_subscription_id && p.estado === 'aceptado' && p.stripe_payment_method_id && (
                    <MiniBtn disabled={!!ocupado} onClick={() => accion('activar_mantenimiento', {}, { ok: 'Plan mensual activado', confirmarCon: `¿Empezar a cobrarle ${fmtEUR(sus.total)} al mes desde hoy?` })}>Activar ya</MiniBtn>
                  )}
                  {!sus.stripe_subscription_id && p.estado === 'aceptado' && (
                    <MiniBtn disabled={!!ocupado} onClick={() => accion('pedir_domiciliacion', {}, { ok: 'Enlace de domiciliación enviado' })}>Pedir domiciliación</MiniBtn>
                  )}
                  {sus.stripe_payment_link_url && !sus.stripe_subscription_id && <MiniBtn onClick={() => copiar(sus.stripe_payment_link_url)}><Copy size={13} /> Enlace</MiniBtn>}
                  {sus.stripe_subscription_id && sus.estado !== 'cancelada' && !sus.baja_solicitada_at && (
                    <MiniBtn danger disabled={!!ocupado} onClick={() => accion('cancelar_mantenimiento', {}, { ok: 'Baja programada al final del mes pagado', confirmarCon: 'Se deja de cobrar al terminar el mes ya pagado. ¿Dar de baja?' })}>Dar de baja</MiniBtn>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {p.aceptado_at && (
            <Card>
              <SectionLabel>Aceptación</SectionLabel>
              <Fila k="Firma" v={p.firmante_nombre || '—'} />
              <Fila k="DNI / NIE" v={p.firmante_dni || '—'} />
              <Fila k="Correo" v={p.firmante_email || '—'} />
              <Fila k="Cuándo" v={fechaHora(p.aceptado_at)} />
              <Fila k="NIF del cliente" v={cliente?.nif || '—'} />
              {p.stripe_payment_method_tipo && <Fila k="Medio guardado" v={p.stripe_payment_method_tipo === 'sepa_debit' ? 'Domiciliación SEPA' : 'Tarjeta'} />}
            </Card>
          )}

          <Card>
            <SectionLabel>Documentos</SectionLabel>
            <div style={{ display: 'grid', gap: 6 }}>
              {p.pdf_path && <MiniBtn onClick={() => abrirPdf('presupuesto')}><FileText size={13} /> Presupuesto enviado</MiniBtn>}
              {p.pdf_aceptado_path && <MiniBtn onClick={() => abrirPdf('aceptado')}><FileText size={13} /> Copia aceptada</MiniBtn>}
              {d.facturas.map(f => (
                <MiniBtn key={f.id} onClick={() => abrirPdf('factura', f.id)}>
                  <Download size={13} /> {f.codigo} · {fmtEUR(f.total)}{f.periodo ? ` · ${f.periodo}` : ''}
                </MiniBtn>
              ))}
              {!esSuper && <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>Las facturas las ve Marlon.</div>}
            </div>
          </Card>

          <Card>
            <SectionLabel><History size={12} style={{ verticalAlign: '-1px' }} /> Historial</SectionLabel>
            <div style={{ display: 'grid', gap: 8 }}>
              {d.historial.length === 0 && <div style={{ ...type.body, color: colors.stone }}>Sin movimientos todavía.</div>}
              {d.historial.map(h => (
                <div key={h.id} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ ...type.caption, letterSpacing: 0, color: colors.stone, minWidth: 110 }}>{fechaHora(h.created_at)}</span>
                  <span style={{ ...type.body, fontSize: 13, color: ['correo_fallido', 'pago_fallido', 'factura_pendiente', 'cobro_fallido', 'cuota_fallida', 'importe_distinto'].includes(h.evento) ? colors.danger : colors.ink }}>
                    {EVENTOS[h.evento] || h.evento}
                    {h.detalle?.codigo ? ` · ${h.detalle.codigo}` : ''}
                    {h.detalle?.a ? ` · ${h.detalle.a}` : ''}
                    {h.detalle?.error ? ` · ${h.detalle.error}` : ''}
                    {h.detalle?.motivo ? ` · ${h.detalle.motivo}` : ''}
                    {h.detalle?.modo_prueba ? ' · MODO PRUEBA' : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {dialogo && (
        <div style={ds.modal} onClick={() => !ocupado && setDialogo(null)}>
          <div style={ds.modalContent} onClick={ev => ev.stopPropagation()}>
            {dialogo.tipo === 'reenviar' && <>
              <h2 style={ds.h2}>Reenviar {p.numero}</h2>
              <Campo etiqueta="Correo"><input style={ds.formInput} type="email" value={dialogo.email} onChange={ev => setDialogo({ ...dialogo, email: ev.target.value })} autoFocus /></Campo>
            </>}
            {dialogo.tipo === 'anular' && <>
              <h2 style={ds.h2}>Anular {p.numero}</h2>
              <p style={{ ...type.body, color: colors.stone, marginBottom: 12 }}>Su enlace de pago deja de funcionar. No se puede deshacer (sí hacer una versión nueva).</p>
              <Campo etiqueta="Motivo (opcional)"><input style={ds.formInput} value={dialogo.motivo} onChange={ev => setDialogo({ ...dialogo, motivo: ev.target.value })} /></Campo>
            </>}
            {dialogo.tipo === 'escrito' && <>
              <h2 style={ds.h2}>Aceptado por escrito</h2>
              <p style={{ ...type.body, color: colors.stone, marginBottom: 12 }}>Si lo firmó en papel o por correo. Se desactiva el enlace y se le manda la copia aceptada; luego cobras cada plazo desde aquí.</p>
              <div style={{ display: 'grid', gap: 10 }}>
                <Campo etiqueta="Quién firma"><input style={ds.formInput} value={dialogo.firmante_nombre} onChange={ev => setDialogo({ ...dialogo, firmante_nombre: ev.target.value })} autoFocus /></Campo>
                <Campo etiqueta="DNI / NIE"><input style={ds.formInput} value={dialogo.firmante_dni} onChange={ev => setDialogo({ ...dialogo, firmante_dni: ev.target.value })} /></Campo>
              </div>
            </>}
            {dialogo.tipo === 'pagado' && <>
              <h2 style={ds.h2}>Cobrado fuera de Stripe</h2>
              <p style={{ ...type.body, color: colors.stone, marginBottom: 12 }}>«{dialogo.plazo.descripcion}» · {fmtEUR(dialogo.plazo.total)}. Se apunta como pagado y se emite su factura.</p>
              <Segmented full value={dialogo.forma} onChange={v => setDialogo({ ...dialogo, forma: v })} options={[{ value: 'transferencia', label: 'Transferencia' }, { value: 'efectivo', label: 'Efectivo' }]} />
            </>}
            {dialogo.tipo === 'publicar' && <>
              <h2 style={ds.h2}>Trabajo publicado</h2>
              <p style={{ ...type.body, color: colors.stone, marginBottom: 12 }}>
                {pendientes.length ? `Se pide lo que queda (${pendientes.map(x => fmtEUR(x.total)).join(' + ')}). ` : ''}
                {sus && !sus.stripe_subscription_id ? `Y empieza el plan mensual de ${fmtEUR(sus.total)}${p.stripe_payment_method_id ? ' con su medio guardado' : ' (se le pide la domiciliación)'}.` : ''}
              </p>
              {pendientes.length > 0 && (
                <Segmented full value={dialogo.cobro} onChange={v => setDialogo({ ...dialogo, cobro: v })} options={[
                  { value: 'enlace', label: 'Mandarle el enlace' },
                  ...(p.stripe_payment_method_id ? [{ value: 'guardado', label: 'Cobrar con lo guardado' }] : []),
                ]} />
              )}
            </>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={ds.secondaryBtn} onClick={() => setDialogo(null)} disabled={!!ocupado}>Cancelar</button>
              <GlossyBtn disabled={!!ocupado} onClick={async () => {
                const t = dialogo.tipo
                let r = null
                if (t === 'reenviar') r = await accion('reenviar', { email: dialogo.email.trim() }, { ok: 'Reenviado' })
                if (t === 'anular') r = await accion('anular', { motivo: dialogo.motivo }, { ok: 'Anulado' })
                if (t === 'escrito') r = await accion('aceptar_manual', { firmante_nombre: dialogo.firmante_nombre, firmante_dni: dialogo.firmante_dni }, { ok: 'Aceptado' })
                if (t === 'pagado') r = await accion('marcar_pagado', { plazo_id: dialogo.plazo.id, forma: dialogo.forma }, { ok: 'Pagado y facturado' })
                if (t === 'publicar') {
                  r = await accion('publicar', { cobro: dialogo.cobro })
                  if (r?.hecho?.length) toast(r.hecho.join(' · '))
                }
                if (r) setDialogo(null)
              }}>{ocupado ? 'Un momento…' : 'Confirmar'}</GlossyBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Fila({ k, v, fuerte }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0' }}>
      <span style={{ ...type.body, color: colors.stone }}>{k}</span>
      <span style={{ ...(fuerte ? type.num : type.body), fontSize: fuerte ? 16 : 14, color: colors.ink, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}
