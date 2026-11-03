import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Eye, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { colors, ds, type, radius } from '../../lib/darkStyles'
import { Card, Chip, GhostBtn, GlossyBtn, MiniBtn, Segmented, SectionLabel, fmtEUR } from '../../lib/ui'
import { MARCAS, PLANTILLAS_PLAZOS, abrirPdfBase64, calcularTotales, llamarComercial, mensajeBD } from '../../lib/comercial'
import { Campo } from '../../pages/Precios'
import { toast, confirmar } from '../../App'

// Editor de un presupuesto en BORRADOR. Todo vive en el estado local y se guarda
// de una vez con «Guardar» (líneas y plazos se reescriben enteros: en borrador
// no hay nada colgado de ellos). Al guardar se vuelve a leer de la BD, que es
// la que calcula los totales de verdad.

const linea = (o = {}) => ({ concepto: '', detalle: '', tipo: 'unico', cantidad: 1, precio_base: '', igic_pct: 7, catalogo_id: null, ...o })

export default function PresupuestoEditor({ id, onVolver, onEnviado }) {
  const [p, setP] = useState(null)
  const [cli, setCli] = useState(null)
  const [lineas, setLineas] = useState([])
  const [plazos, setPlazos] = useState([])
  const [condiciones, setCondiciones] = useState('')
  const [catalogo, setCatalogo] = useState([])
  const [ajustes, setAjustes] = useState(null)
  const [sucio, setSucio] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [enviando, setEnviando] = useState(null)

  async function cargar() {
    const { data: pr, error } = await supabase.from('comercial_presupuestos').select('*').eq('id', id).single()
    if (error) return toast(mensajeBD(error), 'error')
    if (pr.estado !== 'borrador') { onEnviado(pr.id); return }
    const [c, l, pl, cat, aj] = await Promise.all([
      supabase.from('comercial_clientes').select('*').eq('id', pr.cliente_id).single(),
      supabase.from('comercial_presupuesto_lineas').select('*').eq('presupuesto_id', id).order('orden').order('id'),
      supabase.from('comercial_plazos').select('*').eq('presupuesto_id', id).order('orden'),
      supabase.from('comercial_catalogo').select('*').eq('activo', true).order('orden'),
      supabase.from('comercial_ajustes').select('marcas, validez_dias_defecto').eq('id', 1).single(),
    ])
    setP(pr)
    setCli(c.data)
    setLineas((l.data || []).map(x => linea({ ...x, detalle: x.detalle || '' })))
    setPlazos(pl.data || [])
    setCondiciones((pr.condiciones || []).join('\n'))
    setCatalogo(cat.data || [])
    setAjustes(aj.data)
    setSucio(false)
  }
  useEffect(() => { cargar() }, [id])

  const tot = useMemo(() => calcularTotales(lineas, plazos), [lineas, plazos])
  const catalogoMarca = catalogo.filter(c => !c.marca || c.marca === p?.marca)

  const cambiarP = (k, v) => { setP({ ...p, [k]: v }); setSucio(true) }
  const cambiarCli = (k, v) => { setCli({ ...cli, [k]: v }); setSucio(true) }
  const cambiarLinea = (i, k, v) => { setLineas(lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l))); setSucio(true) }
  const cambiarPlazo = (i, k, v) => { setPlazos(plazos.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setSucio(true) }

  function añadirDelCatalogo(idCat) {
    const c = catalogo.find(x => x.id === idCat)
    if (!c) return
    setLineas([...lineas, linea({ concepto: c.concepto, detalle: c.detalle || '', tipo: c.tipo, precio_base: c.precio_base, igic_pct: c.igic_pct, catalogo_id: c.id })])
    setSucio(true)
  }

  function plantillaPlazos(i) {
    setPlazos(PLANTILLAS_PLAZOS[i].plazos.map(x => ({ ...x })))
    setSucio(true)
  }

  function condicionesDeMarca() {
    const c = ajustes?.marcas?.[p.marca]?.condiciones || []
    setCondiciones(c.join('\n'))
    setSucio(true)
  }

  async function guardar({ silencioso } = {}) {
    if (lineas.some(l => l.concepto.trim().length < 2)) { toast('Hay una línea sin concepto', 'error'); return false }
    if (lineas.some(l => l.precio_base === '' || Number(l.precio_base) < 0 || !(Number(l.cantidad) > 0))) { toast('Revisa precios y cantidades', 'error'); return false }
    if (plazos.some(x => x.descripcion.trim().length < 2 || !(Number(x.pct) > 0))) { toast('Revisa los plazos', 'error'); return false }
    setOcupado('guardar')
    try {
      const datosCli = {}
      for (const k of ['razon_social', 'nombre_comercial', 'nif', 'email', 'telefono', 'contacto_nombre', 'direccion', 'cp', 'municipio', 'provincia']) {
        datosCli[k] = typeof cli[k] === 'string' ? (cli[k].trim() || null) : cli[k]
      }
      if (!datosCli.razon_social) throw new Error('Falta la razón social del cliente')
      if (!datosCli.email) throw new Error('Falta el correo del cliente')
      const r1 = await supabase.from('comercial_clientes').update(datosCli).eq('id', cli.id).select('id')
      if (r1.error) throw r1.error
      if (!r1.data?.length) throw new Error('No se pudo guardar el cliente (¿no es tuyo?)')

      const r2 = await supabase.from('comercial_presupuestos').update({
        marca: p.marca, proyecto: p.proyecto.trim(), descripcion: p.descripcion?.trim() || null,
        plazo_entrega: p.plazo_entrega?.trim() || null, valido_hasta: p.valido_hasta,
        condiciones: condiciones.split('\n').map(s => s.trim()).filter(Boolean),
      }).eq('id', p.id).select('id')
      if (r2.error) throw r2.error
      if (!r2.data?.length) throw new Error('No se pudo guardar el presupuesto')

      const r3 = await supabase.from('comercial_presupuesto_lineas').delete().eq('presupuesto_id', p.id)
      if (r3.error) throw r3.error
      if (lineas.length) {
        const r4 = await supabase.from('comercial_presupuesto_lineas').insert(lineas.map((l, i) => ({
          presupuesto_id: p.id, orden: i + 1, catalogo_id: l.catalogo_id || null, concepto: l.concepto.trim(),
          detalle: l.detalle?.trim() || null, tipo: l.tipo, cantidad: Number(l.cantidad), precio_base: Number(l.precio_base), igic_pct: Number(l.igic_pct),
        })))
        if (r4.error) throw r4.error
      }
      const r5 = await supabase.from('comercial_plazos').delete().eq('presupuesto_id', p.id)
      if (r5.error) throw r5.error
      if (plazos.length) {
        const r6 = await supabase.from('comercial_plazos').insert(plazos.map((x, i) => ({
          presupuesto_id: p.id, orden: i + 1, descripcion: x.descripcion.trim(), pct: Number(x.pct), al_aceptar: i === 0,
        })))
        if (r6.error) throw r6.error
      }
      await cargar()
      if (!silencioso) toast('Guardado')
      return true
    } catch (e) {
      toast(mensajeBD(e), 'error')
      return false
    } finally {
      setOcupado('')
    }
  }

  async function vistaPrevia() {
    if (sucio && !(await guardar({ silencioso: true }))) return
    setOcupado('vista')
    try {
      const r = await llamarComercial('vista_previa', { presupuesto_id: p.id })
      abrirPdfBase64(r.pdf_base64, r.nombre)
    } catch (e) { toast(e.message, 'error') }
    setOcupado('')
  }

  async function prepararEnvio() {
    if (sucio && !(await guardar({ silencioso: true }))) return
    setEnviando({ email: cli.email || '' })
  }

  async function enviar() {
    setOcupado('enviar')
    try {
      const r = await llamarComercial('enviar', { presupuesto_id: p.id, email: enviando.email.trim() })
      if (r.aviso) {
        try { await navigator.clipboard.writeText(r.enlace) } catch { /* sin permiso de portapapeles */ }
        toast('Enviado, pero el correo falló: el enlace está copiado', 'error')
      } else {
        toast(r.modo_prueba ? 'Enviado (Stripe en MODO PRUEBA)' : 'Presupuesto enviado')
      }
      setEnviando(null)
      onEnviado(p.id)
    } catch (e) {
      toast(e.message, 'error')
    }
    setOcupado('')
  }

  async function borrar() {
    if (!(await confirmar(`¿Borrar el borrador ${p.numero}? No se puede deshacer.`))) return
    const { data, error } = await supabase.from('comercial_presupuestos').delete().eq('id', p.id).select('id')
    if (error || !data?.length) return toast(error ? mensajeBD(error) : 'No se ha borrado', 'error')
    toast('Borrador borrado')
    onVolver()
  }

  if (!p || !cli) return <Card><div style={{ padding: 24, ...type.body, color: colors.textMute }}>Cargando…</div></Card>

  const okPlazos = Math.abs(tot.sumaPct - 100) < 0.001
  const sinUnico = tot.unico.total <= 0

  return (
    <div>
      <button style={ds.backBtn} onClick={async () => { if (!sucio || await confirmar('Hay cambios sin guardar. ¿Salir igualmente?')) onVolver() }}>
        <ArrowLeft size={15} style={{ verticalAlign: '-2px' }} /> Presupuestos
      </button>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ ...type.mono, fontWeight: 700 }}>{p.numero}{p.version > 1 ? ` v${p.version}` : ''}</span>
            <Chip>Borrador</Chip>
            {sucio && <Chip tono="warning">Sin guardar</Chip>}
          </div>
          <input value={p.proyecto} onChange={e => cambiarP('proyecto', e.target.value)} aria-label="Proyecto"
            style={{ ...ds.formInput, ...type.h2, height: 46, border: `1px solid transparent`, background: 'transparent', padding: '0 4px', marginLeft: -4 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <GhostBtn onClick={() => guardar()} disabled={!!ocupado}>{ocupado === 'guardar' ? 'Guardando…' : 'Guardar'}</GhostBtn>
          <GhostBtn onClick={vistaPrevia} disabled={!!ocupado}><Eye size={15} /> {ocupado === 'vista' ? 'Generando…' : 'Ver PDF'}</GhostBtn>
          <GlossyBtn onClick={prepararEnvio} disabled={!!ocupado || !okPlazos || sinUnico || !lineas.length}><Send size={15} /> Enviar</GlossyBtn>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
        {/* Columna 1: cliente y datos */}
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <SectionLabel>Cliente</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <Campo etiqueta="Razón social"><input style={ds.formInput} value={cli.razon_social || ''} onChange={e => cambiarCli('razon_social', e.target.value)} /></Campo>
              <Campo etiqueta="Nombre comercial"><input style={ds.formInput} value={cli.nombre_comercial || ''} onChange={e => cambiarCli('nombre_comercial', e.target.value)} /></Campo>
              <Campo etiqueta="NIF / CIF" ayuda="Si falta, lo escribe él al aceptar"><input style={ds.formInput} value={cli.nif || ''} onChange={e => cambiarCli('nif', e.target.value)} /></Campo>
              <Campo etiqueta="Correo"><input style={ds.formInput} type="email" value={cli.email || ''} onChange={e => cambiarCli('email', e.target.value)} /></Campo>
              <Campo etiqueta="Contacto"><input style={ds.formInput} value={cli.contacto_nombre || ''} onChange={e => cambiarCli('contacto_nombre', e.target.value)} /></Campo>
              <Campo etiqueta="Teléfono"><input style={ds.formInput} value={cli.telefono || ''} onChange={e => cambiarCli('telefono', e.target.value)} /></Campo>
              <Campo etiqueta="Dirección"><input style={ds.formInput} value={cli.direccion || ''} onChange={e => cambiarCli('direccion', e.target.value)} /></Campo>
              <Campo etiqueta="CP"><input style={ds.formInput} value={cli.cp || ''} onChange={e => cambiarCli('cp', e.target.value)} /></Campo>
              <Campo etiqueta="Municipio"><input style={ds.formInput} value={cli.municipio || ''} onChange={e => cambiarCli('municipio', e.target.value)} /></Campo>
            </div>
          </Card>

          <Card>
            <SectionLabel>Presupuesto</SectionLabel>
            <div style={{ display: 'grid', gap: 10 }}>
              <Campo etiqueta="Marca">
                <Segmented full options={MARCAS} value={p.marca} onChange={v => cambiarP('marca', v)} />
              </Campo>
              <Campo etiqueta="Descripción (opcional)">
                <textarea style={{ ...ds.formInput, height: 70, padding: 10, resize: 'vertical' }} value={p.descripcion || ''} onChange={e => cambiarP('descripcion', e.target.value)} />
              </Campo>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <Campo etiqueta="Plazo de entrega"><input style={ds.formInput} value={p.plazo_entrega || ''} onChange={e => cambiarP('plazo_entrega', e.target.value)} placeholder="18 días naturales desde que recibimos el material" /></Campo>
                <Campo etiqueta="Válido hasta"><input style={ds.formInput} type="date" value={p.valido_hasta} min={p.fecha} onChange={e => cambiarP('valido_hasta', e.target.value)} /></Campo>
              </div>
              <Campo etiqueta="Condiciones (una por línea)">
                <textarea style={{ ...ds.formInput, height: 170, padding: 10, resize: 'vertical', lineHeight: 1.45 }} value={condiciones} onChange={e => { setCondiciones(e.target.value); setSucio(true) }} />
              </Campo>
              <div><MiniBtn onClick={condicionesDeMarca}>Poner las de {MARCAS.find(m => m.value === p.marca)?.label}</MiniBtn></div>
            </div>
          </Card>
        </div>

        {/* Columna 2: líneas, plazos y totales */}
        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <SectionLabel>Qué incluye</SectionLabel>
            <div style={{ display: 'grid', gap: 10 }}>
              {lineas.map((l, i) => (
                <div key={i} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...ds.formInput, fontWeight: 600 }} value={l.concepto} onChange={e => cambiarLinea(i, 'concepto', e.target.value)} placeholder="Concepto" aria-label="Concepto" />
                    <MiniBtn danger aria-label="Quitar línea" onClick={() => { setLineas(lineas.filter((_, j) => j !== i)); setSucio(true) }}><Trash2 size={14} /></MiniBtn>
                  </div>
                  <textarea style={{ ...ds.formInput, height: 46, padding: 8, resize: 'vertical', fontSize: 13 }} value={l.detalle} onChange={e => cambiarLinea(i, 'detalle', e.target.value)} placeholder="Detalle (opcional)" aria-label="Detalle" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, alignItems: 'end' }}>
                    <Campo etiqueta="Se cobra">
                      <select style={ds.select} value={l.tipo} onChange={e => cambiarLinea(i, 'tipo', e.target.value)}>
                        <option value="unico">Una vez</option>
                        <option value="mensual">Cada mes</option>
                      </select>
                    </Campo>
                    <Campo etiqueta="Cant."><input style={ds.formInput} type="number" min="0.01" step="1" value={l.cantidad} onChange={e => cambiarLinea(i, 'cantidad', e.target.value)} /></Campo>
                    <Campo etiqueta="Precio sin IGIC"><input style={ds.formInput} type="number" min="0" step="0.01" inputMode="decimal" value={l.precio_base} onChange={e => cambiarLinea(i, 'precio_base', e.target.value)} /></Campo>
                    <Campo etiqueta="IGIC %"><input style={ds.formInput} type="number" min="0" max="20" step="0.5" value={l.igic_pct} onChange={e => cambiarLinea(i, 'igic_pct', e.target.value)} /></Campo>
                  </div>
                  <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, textAlign: 'right' }}>
                    Importe: <b style={{ color: colors.ink }}>{fmtEUR((Number(l.cantidad) || 0) * (Number(l.precio_base) || 0))}</b>{l.tipo === 'mensual' ? ' /mes' : ''} sin IGIC
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select style={{ ...ds.select, flex: '1 1 220px', width: 'auto' }} value="" onChange={e => añadirDelCatalogo(e.target.value)} aria-label="Añadir del catálogo">
                  <option value="">+ Añadir del catálogo…</option>
                  {catalogoMarca.map(c => <option key={c.id} value={c.id}>{c.concepto} · {fmtEUR(c.precio_base)}{c.tipo === 'mensual' ? '/mes' : ''}</option>)}
                </select>
                <MiniBtn onClick={() => { setLineas([...lineas, linea()]); setSucio(true) }}><Plus size={14} /> Línea libre</MiniBtn>
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Plazos de pago</SectionLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {PLANTILLAS_PLAZOS.map((t, i) => <MiniBtn key={t.label} onClick={() => plantillaPlazos(i)}>{t.label}</MiniBtn>)}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {tot.plazos.map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ ...type.label, width: 18, color: colors.stone }}>{i + 1}.</span>
                  <input style={{ ...ds.formInput, flex: '1 1 160px', width: 'auto' }} value={x.descripcion} onChange={e => cambiarPlazo(i, 'descripcion', e.target.value)} aria-label="Cuándo se paga" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input style={{ ...ds.formInput, width: 70 }} type="number" min="1" max="100" value={x.pct} onChange={e => cambiarPlazo(i, 'pct', e.target.value)} aria-label="Porcentaje" />
                    <span style={{ color: colors.stone }}>%</span>
                  </div>
                  <span style={{ ...type.num, fontSize: 14, minWidth: 90, textAlign: 'right' }}>{fmtEUR(x.total)}</span>
                  {i > 0 && <MiniBtn danger aria-label="Quitar plazo" onClick={() => { setPlazos(plazos.filter((_, j) => j !== i)); setSucio(true) }}><Trash2 size={14} /></MiniBtn>}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <MiniBtn onClick={() => { setPlazos([...plazos, { descripcion: 'Al entregar el trabajo', pct: Math.max(0, 100 - tot.sumaPct) || 10, al_aceptar: false }]); setSucio(true) }}><Plus size={14} /> Plazo</MiniBtn>
                <Chip tono={okPlazos ? 'sage' : 'danger'}>Suman {tot.sumaPct} %</Chip>
              </div>
              <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>
                El primero se paga al aceptar (ahí firma y deja domiciliado el plan mensual). Los demás se piden desde el presupuesto cuando toque.
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Totales (IGIC incluido)</SectionLabel>
            <Fila k="Una sola vez · base" v={fmtEUR(tot.unico.base)} />
            {tot.unico.desglose.map(d => <Fila key={d.igic_pct} k={`IGIC ${d.igic_pct} %`} v={fmtEUR(d.igic)} />)}
            <Fila k="Total una vez" v={fmtEUR(tot.unico.total)} fuerte />
            {tot.mensual.total > 0 && <>
              <div style={{ height: 10 }} />
              <Fila k="Cada mes · base" v={fmtEUR(tot.mensual.base)} />
              {tot.mensual.desglose.map(d => <Fila key={d.igic_pct} k={`IGIC ${d.igic_pct} %`} v={fmtEUR(d.igic)} />)}
              <Fila k="Total cada mes" v={`${fmtEUR(tot.mensual.total)} /mes`} fuerte />
            </>}
            {sinUnico && <div style={{ ...type.caption, letterSpacing: 0, color: colors.danger, marginTop: 8 }}>Hace falta al menos una línea «una vez»: es el pago con el que acepta.</div>}
          </Card>

          <div><GhostBtn danger size="sm" onClick={borrar}><Trash2 size={14} /> Borrar borrador</GhostBtn></div>
        </div>
      </div>

      {enviando && (
        <div style={ds.modal} onClick={() => !ocupado && setEnviando(null)}>
          <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
            <h2 style={ds.h2}>Enviar {p.numero}</h2>
            <p style={{ ...type.body, color: colors.stone, marginBottom: 14 }}>
              Le llega el PDF y el botón «Aceptar y pagar {fmtEUR(tot.plazos[0]?.total)}». Desde ese momento el presupuesto queda
              congelado: cualquier cambio será una versión nueva.
            </p>
            <Campo etiqueta="Correo del cliente">
              <input style={ds.formInput} type="email" value={enviando.email} onChange={e => setEnviando({ email: e.target.value })} autoFocus />
            </Campo>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={ds.secondaryBtn} onClick={() => setEnviando(null)} disabled={!!ocupado}>Cancelar</button>
              <GlossyBtn onClick={enviar} disabled={!!ocupado || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(enviando.email.trim())}>
                <Send size={15} /> {ocupado === 'enviar' ? 'Enviando…' : 'Enviar'}
              </GlossyBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Fila({ k, v, fuerte }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: fuerte ? `1px solid ${colors.ink}` : 'none', marginTop: fuerte ? 4 : 0 }}>
      <span style={{ ...type.body, color: fuerte ? colors.ink : colors.stone, fontWeight: fuerte ? 700 : 400 }}>{k}</span>
      <span style={{ ...type.num, fontSize: fuerte ? 16 : 14, fontWeight: fuerte ? 800 : 600 }}>{v}</span>
    </div>
  )
}
