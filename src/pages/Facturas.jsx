import { useEffect, useMemo, useState } from 'react'
import { BadgeEuro, Download, Send, Plus, Trash2, PlugZap, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, ds, type } from '../lib/darkStyles'
import { Card, Chip, GhostBtn, GlossyBtn, MiniBtn, SectionLabel, Segmented, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { MARCAS, fechaCorta, llamarComercial, mensajeBD } from '../lib/comercial'
import { Campo } from './Precios'
import { toast, confirmar } from '../App'

// Facturas de Marlon (RODELO AYALA MARLON JOSE · serie INV/AAAA/), módulo
// Comercial, 3 nov 2026. Solo el superadmin (la BD no deja leerlas a nadie más).
// Salen solas al cobrar un plazo o una cuota; aquí también se hace una a mano
// (lo cobrado en efectivo o por transferencia sin presupuesto).
// Una factura emitida no se cambia ni se borra (PD405/PD406).

const ORIGEN = { plazo: 'Presupuesto', cuota: 'Plan mensual', manual: 'A mano' }

export default function Facturas() {
  const [facturas, setFacturas] = useState([])
  const [ajustes, setAjustes] = useState(null)
  const [stripeEstado, setStripeEstado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [manual, setManual] = useState(false)
  const [reenvio, setReenvio] = useState(null)
  const [ocupado, setOcupado] = useState('')

  async function cargar() {
    setCargando(true)
    const [f, a] = await Promise.all([
      supabase.from('comercial_facturas').select('id, codigo, fecha, marca, cliente, base, igic, total, origen, forma_pago, periodo, enviada_at, enviada_a').order('fecha', { ascending: false }).order('numero', { ascending: false }),
      supabase.from('comercial_ajustes').select('*').eq('id', 1).single(),
    ])
    if (f.error) toast(mensajeBD(f.error), 'error')
    setFacturas(f.data || [])
    setAjustes(a.data)
    setCargando(false)
  }
  async function cargarStripe() {
    try { setStripeEstado(await llamarComercial('estado_stripe')) }
    catch (e) { setStripeEstado({ error: e.message }) }
  }
  useEffect(() => { cargar(); cargarStripe() }, [])

  const filtradas = useMemo(() => facturas.filter(f => {
    if (!busqueda) return true
    const s = busqueda.toLowerCase()
    return [f.codigo, f.cliente?.razon_social, f.cliente?.nombre_comercial, f.cliente?.nif].some(x => (x || '').toLowerCase().includes(s))
  }), [facturas, busqueda])

  const stats = useMemo(() => {
    const anio = String(new Date().getFullYear())
    const mes = new Date().toISOString().slice(0, 7)
    const delAnio = facturas.filter(f => f.fecha.startsWith(anio))
    return {
      anio: delAnio.reduce((s, f) => s + Number(f.total), 0),
      base: delAnio.reduce((s, f) => s + Number(f.base), 0),
      igic: delAnio.reduce((s, f) => s + Number(f.igic), 0),
      mes: facturas.filter(f => f.fecha.startsWith(mes)).reduce((s, f) => s + Number(f.total), 0),
    }
  }, [facturas])

  async function abrir(f) {
    try { window.open((await llamarComercial('descargar', { tipo: 'factura', id: f.id })).url, '_blank') }
    catch (e) { toast(e.message, 'error') }
  }

  async function conectarStripe() {
    setOcupado('stripe')
    try {
      const r = await llamarComercial('configurar_stripe')
      toast(r.ya ? 'Stripe ya estaba conectado' : `Conectado con ${r.cuenta}${r.modo_prueba ? ' (MODO PRUEBA)' : ''}`)
      await cargarStripe()
    } catch (e) { toast(e.message, 'error') }
    setOcupado('')
  }

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Facturas</h1>
          <p style={{ ...type.body, color: colors.textMute, maxWidth: 760 }}>
            Tus facturas como {ajustes?.emisor_nombre || 'autónomo'} (serie {ajustes?.factura_serie || 'INV/'}). Salen solas al cobrar cada plazo y cada mes del plan mensual.
            Una factura emitida no se cambia ni se borra.
          </p>
        </div>
        <GlossyBtn onClick={() => setManual(true)} disabled={ajustes?.factura_ultimo_numero == null}><Plus size={16} /> Factura a mano</GlossyBtn>
      </div>

      <div className="ds-cards" style={{ marginBottom: 20 }}>
        <StatCard label={`Facturado ${new Date().getFullYear()}`} value={fmtEUR(stats.anio)} sub={`Base ${fmtEUR(stats.base)} · IGIC ${fmtEUR(stats.igic)}`} icon={<BadgeEuro size={17} />} />
        <StatCard label="Este mes" value={fmtEUR(stats.mes)} sub="con IGIC" />
        <StatCard label="Siguiente número" value={ajustes?.factura_ultimo_numero == null ? '—' : `${ajustes.factura_serie}${String(ajustes.factura_ultimo_numero + 1).padStart(ajustes.factura_relleno, '0')}`} sub={ajustes?.factura_ultimo_numero == null ? 'Falta tu último número' : 'Correlativo, sin huecos'} tone={ajustes?.factura_ultimo_numero == null ? 'danger' : 'ink'} />
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start', marginBottom: 20 }}>
        <ConexionStripe estado={stripeEstado} ocupado={ocupado === 'stripe'} onConectar={conectarStripe} onRefrescar={cargarStripe} />
        {ajustes && <Ajustes ajustes={ajustes} hayFacturas={facturas.some(f => f.codigo.startsWith(ajustes.factura_serie))} onGuardado={cargar} />}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ ...ds.h2, marginBottom: 0, flex: 1 }}>Emitidas</h2>
        <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.stone }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar facturas" placeholder="Número, cliente o NIF…" style={{ ...ds.input, paddingLeft: 34, width: '100%', boxSizing: 'border-box' }} />
        </div>
      </div>

      {cargando ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : filtradas.length === 0 ? (
        <Card pad={0}><Vacio icon={<BadgeEuro size={28} />} titulo="Ninguna factura todavía" texto="La primera saldrá sola cuando un cliente pague un presupuesto." /></Card>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtradas.map(f => (
            <Card key={f.id} pad={12}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...type.mono, fontWeight: 700, fontSize: 13 }}>{f.codigo}</span>
                    <Chip>{ORIGEN[f.origen]}</Chip>
                    <Chip tono={f.marca === 'pidoo' ? 'terracotta' : 'info'}>{MARCAS.find(m => m.value === f.marca)?.label}</Chip>
                  </div>
                  <div style={{ ...type.label, fontWeight: 600, marginTop: 3 }}>{f.cliente?.razon_social} <span style={{ color: colors.stone, fontWeight: 400 }}>· {f.cliente?.nif}</span></div>
                  <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>
                    {fechaCorta(f.fecha)}{f.periodo ? ` · ${f.periodo}` : ''}{f.forma_pago ? ` · ${f.forma_pago}` : ''}{f.enviada_at ? ` · enviada a ${f.enviada_a}` : ' · sin enviar'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <div style={{ ...type.num, fontSize: 16 }}>{fmtEUR(f.total)}</div>
                  <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>base {fmtEUR(f.base)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <MiniBtn onClick={() => abrir(f)} aria-label="Ver PDF"><Download size={14} /> PDF</MiniBtn>
                  <MiniBtn onClick={() => setReenvio({ f, email: f.enviada_a || f.cliente?.email || '' })} aria-label="Reenviar"><Send size={14} /></MiniBtn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {manual && <FacturaManual onCerrar={() => setManual(false)} onHecha={() => { setManual(false); cargar() }} />}

      {reenvio && (
        <div style={ds.modal} onClick={() => !ocupado && setReenvio(null)}>
          <div style={ds.modalContent} onClick={e => e.stopPropagation()}>
            <h2 style={ds.h2}>Reenviar {reenvio.f.codigo}</h2>
            <Campo etiqueta="Correo"><input style={ds.formInput} type="email" value={reenvio.email} onChange={e => setReenvio({ ...reenvio, email: e.target.value })} autoFocus /></Campo>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={ds.secondaryBtn} onClick={() => setReenvio(null)}>Cancelar</button>
              <GlossyBtn disabled={!!ocupado} onClick={async () => {
                setOcupado('reenvio')
                try { await llamarComercial('reenviar_factura', { factura_id: reenvio.f.id, email: reenvio.email.trim() }); toast('Factura reenviada'); setReenvio(null); cargar() }
                catch (e) { toast(e.message, 'error') }
                setOcupado('')
              }}>{ocupado ? 'Enviando…' : 'Reenviar'}</GlossyBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConexionStripe({ estado, ocupado, onConectar, onRefrescar }) {
  const c = estado?.cuenta
  const listo = estado?.clave && estado?.webhook && c?.cobros
  return (
    <Card>
      <SectionLabel>Cobros · cuenta de Stripe de Rogotech</SectionLabel>
      {!estado ? <div style={{ ...type.body, color: colors.stone }}>Mirando…</div> : (
        <div style={{ display: 'grid', gap: 6 }}>
          <Linea ok={estado.clave} texto={estado.clave ? `Clave puesta${estado.modo_prueba ? ' · MODO PRUEBA' : ' · cobros reales'}` : 'Falta la clave secreta (STRIPE_SECRET_KEY_ROGOTECH en Supabase)'} />
          {c && <Linea ok={!/pidoo/i.test(c.nombre || '')} texto={`Cuenta: ${c.nombre || c.id}`} />}
          {c && <Linea ok={c.cobros} texto={c.cobros ? 'Puede cobrar' : 'Stripe aún no deja cobrar: termina el alta de la cuenta'} />}
          {c && <Linea ok={c.sepa === 'active'} texto={c.sepa === 'active' ? 'Domiciliación SEPA activa' : 'Activa «Adeudo directo SEPA» en Stripe > Métodos de pago'} />}
          <Linea ok={estado.webhook} texto={estado.webhook ? 'Avisos de pago conectados' : 'Avisos de pago sin conectar: pulsa «Conectar Stripe»'} />
          <Linea ok={estado.resend} texto={estado.resend ? 'Correo listo' : 'Falta RESEND_API_KEY'} />
          {estado.error && <div style={{ ...type.caption, letterSpacing: 0, color: colors.danger }}>{estado.error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {estado.clave && <GhostBtn size="sm" onClick={onConectar} disabled={ocupado}><PlugZap size={14} /> {ocupado ? 'Conectando…' : (estado.webhook ? 'Volver a conectar' : 'Conectar Stripe')}</GhostBtn>}
            <MiniBtn onClick={onRefrescar}>Comprobar</MiniBtn>
            {listo && <Chip tono="sage" dot>Listo para cobrar</Chip>}
          </div>
        </div>
      )}
    </Card>
  )
}

const Linea = ({ ok, texto }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', ...type.body, fontSize: 13 }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: ok ? colors.sage2 : colors.danger }} />
    <span style={{ color: ok ? colors.ink : colors.onDangerSoft }}>{texto}</span>
  </div>
)

function Ajustes({ ajustes, hayFacturas, onGuardado }) {
  const [a, setA] = useState(ajustes)
  const [abierto, setAbierto] = useState(ajustes.factura_ultimo_numero == null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setA(ajustes), [ajustes])
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value })
  const setMarca = (m, k) => (e) => setA({ ...a, marcas: { ...a.marcas, [m]: { ...a.marcas[m], [k]: e.target.value } } })

  async function guardar() {
    const datos = {
      emisor_nombre: a.emisor_nombre.trim(), emisor_nif: a.emisor_nif.trim().toUpperCase(), emisor_direccion: a.emisor_direccion.trim(),
      emisor_cp: a.emisor_cp.trim(), emisor_municipio: a.emisor_municipio.trim(), emisor_provincia: a.emisor_provincia.trim(),
      emisor_email: a.emisor_email?.trim() || null, emisor_telefono: a.emisor_telefono?.trim() || null,
      validez_dias_defecto: Number(a.validez_dias_defecto) || 30, marcas: a.marcas,
    }
    if (!hayFacturas) {
      if (a.factura_ultimo_numero === '' || a.factura_ultimo_numero == null || Number(a.factura_ultimo_numero) < 0) return toast('Pon el número de tu última factura (0 si no has hecho ninguna)', 'error')
      datos.factura_serie = a.factura_serie.trim()
      datos.factura_ultimo_numero = Number(a.factura_ultimo_numero)
      datos.factura_relleno = Number(a.factura_relleno) || 5
      const ejemplo = `${datos.factura_serie}${String(datos.factura_ultimo_numero + 1).padStart(datos.factura_relleno, '0')}`
      if (!(await confirmar(`La siguiente factura será la ${ejemplo}. Desde ahora no hagas más facturas de esa serie en el programa viejo. ¿Correcto?`))) return
    }
    setGuardando(true)
    const { data, error } = await supabase.from('comercial_ajustes').update(datos).eq('id', 1).select('id')
    setGuardando(false)
    if (error || !data?.length) return toast(error ? mensajeBD(error) : 'No se ha guardado', 'error')
    toast('Ajustes guardados')
    setAbierto(false)
    onGuardado()
  }

  if (!abierto) {
    return (
      <Card>
        <SectionLabel>Emisor y numeración</SectionLabel>
        <div style={{ ...type.body, fontSize: 13 }}>
          <b>{ajustes.emisor_nombre}</b> · NIF {ajustes.emisor_nif}<br />
          {ajustes.emisor_direccion} · {ajustes.emisor_cp} {ajustes.emisor_municipio}<br />
          <span style={{ color: colors.stone }}>Serie {ajustes.factura_serie} · última {ajustes.factura_ultimo_numero ?? '—'} · presupuestos válidos {ajustes.validez_dias_defecto} días</span>
        </div>
        <div style={{ marginTop: 10 }}><MiniBtn onClick={() => setAbierto(true)}>Cambiar</MiniBtn></div>
      </Card>
    )
  }

  return (
    <Card>
      <SectionLabel>Emisor y numeración</SectionLabel>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <Campo etiqueta="Nombre fiscal"><input style={ds.formInput} value={a.emisor_nombre} onChange={set('emisor_nombre')} /></Campo>
          <Campo etiqueta="NIF"><input style={ds.formInput} value={a.emisor_nif} onChange={set('emisor_nif')} /></Campo>
          <Campo etiqueta="Dirección fiscal"><input style={ds.formInput} value={a.emisor_direccion} onChange={set('emisor_direccion')} /></Campo>
          <Campo etiqueta="CP"><input style={ds.formInput} value={a.emisor_cp} onChange={set('emisor_cp')} /></Campo>
          <Campo etiqueta="Municipio"><input style={ds.formInput} value={a.emisor_municipio} onChange={set('emisor_municipio')} /></Campo>
          <Campo etiqueta="Provincia"><input style={ds.formInput} value={a.emisor_provincia} onChange={set('emisor_provincia')} /></Campo>
          <Campo etiqueta="Correo"><input style={ds.formInput} value={a.emisor_email || ''} onChange={set('emisor_email')} /></Campo>
          <Campo etiqueta="Teléfono"><input style={ds.formInput} value={a.emisor_telefono || ''} onChange={set('emisor_telefono')} /></Campo>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Campo etiqueta="Serie" ayuda={hayFacturas ? 'Ya hay facturas: no se toca' : 'Como en tu última factura'}>
            <input style={ds.formInput} value={a.factura_serie} onChange={set('factura_serie')} disabled={hayFacturas} />
          </Campo>
          <Campo etiqueta="Nº de tu última factura" ayuda={hayFacturas ? 'Lo lleva el sistema' : 'Solo el número: 7 si era INV/2026/00007'}>
            <input style={ds.formInput} type="number" min="0" value={a.factura_ultimo_numero ?? ''} onChange={set('factura_ultimo_numero')} disabled={hayFacturas} />
          </Campo>
          <Campo etiqueta="Cifras del número"><input style={ds.formInput} type="number" min="1" max="8" value={a.factura_relleno} onChange={set('factura_relleno')} disabled={hayFacturas} /></Campo>
          <Campo etiqueta="Validez (días)"><input style={ds.formInput} type="number" min="1" max="365" value={a.validez_dias_defecto} onChange={set('validez_dias_defecto')} /></Campo>
        </div>
        {MARCAS.map(m => (
          <div key={m.value} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Campo etiqueta={`Remitente ${m.label}`} ayuda={m.value === 'rogotech' ? 'El dominio tiene que estar verificado en Resend' : null}>
              <input style={ds.formInput} value={a.marcas?.[m.value]?.remitente || ''} onChange={setMarca(m.value, 'remitente')} />
            </Campo>
            <Campo etiqueta={`Responder a (${m.label})`}><input style={ds.formInput} value={a.marcas?.[m.value]?.responder_a || ''} onChange={setMarca(m.value, 'responder_a')} /></Campo>
          </div>
        ))}
        <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>Las condiciones por defecto de cada marca se editan en cada presupuesto; las de fábrica salen de aquí.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {ajustes.factura_ultimo_numero != null && <button style={ds.secondaryBtn} onClick={() => { setA(ajustes); setAbierto(false) }}>Cancelar</button>}
          <GlossyBtn onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</GlossyBtn>
        </div>
      </div>
    </Card>
  )
}

function FacturaManual({ onCerrar, onHecha }) {
  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [marca, setMarca] = useState('rogotech')
  const [lineas, setLineas] = useState([{ concepto: '', precio_base: '', cantidad: 1, igic_pct: 7 }])
  const [forma, setForma] = useState('transferencia')
  const [notas, setNotas] = useState('')
  const [enviar, setEnviar] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('comercial_clientes').select('id, razon_social, nif, email').order('razon_social').then(({ data }) => setClientes(data || []))
  }, [])

  const total = lineas.reduce((s, l) => {
    const b = (Number(l.cantidad) || 0) * (Number(l.precio_base) || 0)
    return s + b + Math.round(b * (Number(l.igic_pct) || 0)) / 100
  }, 0)
  const cli = clientes.find(c => c.id === clienteId)

  async function emitir() {
    if (!cli) return toast('Elige el cliente', 'error')
    if (!cli.nif) return toast('Ese cliente no tiene NIF: complétalo en su presupuesto', 'error')
    if (lineas.some(l => l.concepto.trim().length < 2 || l.precio_base === '')) return toast('Revisa las líneas', 'error')
    if (!(await confirmar(`¿Emitir la factura a ${cli.razon_social} por ${fmtEUR(total)}? Una vez emitida no se puede cambiar ni borrar.`))) return
    setGuardando(true)
    try {
      const r = await llamarComercial('factura_manual', {
        cliente_id: clienteId, marca, forma_pago: forma, notas: notas.trim() || null, enviar,
        lineas: lineas.map(l => ({ concepto: l.concepto.trim(), cantidad: Number(l.cantidad), precio_base: Number(l.precio_base), igic_pct: Number(l.igic_pct) })),
      })
      toast(`Factura ${r.codigo} emitida`)
      onHecha()
    } catch (e) {
      toast(e.message, 'error')
      setGuardando(false)
    }
  }

  return (
    <div style={ds.modal} onClick={() => !guardando && onCerrar()}>
      <div style={{ ...ds.modalContent, maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <h2 style={ds.h2}>Factura a mano</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Campo etiqueta="Cliente">
              <select style={ds.select} value={clienteId} onChange={e => setClienteId(e.target.value)}>
                <option value="">Elige…</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}{c.nif ? ` · ${c.nif}` : ' · SIN NIF'}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Marca"><Segmented full options={MARCAS} value={marca} onChange={setMarca} /></Campo>
          </div>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 3fr) repeat(3, minmax(70px, 1fr)) auto', gap: 8, alignItems: 'end' }}>
              <Campo etiqueta={i === 0 ? 'Concepto' : ''}><input style={ds.formInput} value={l.concepto} onChange={e => setLineas(lineas.map((x, j) => j === i ? { ...x, concepto: e.target.value } : x))} /></Campo>
              <Campo etiqueta={i === 0 ? 'Cant.' : ''}><input style={ds.formInput} type="number" min="0.01" value={l.cantidad} onChange={e => setLineas(lineas.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} /></Campo>
              <Campo etiqueta={i === 0 ? 'Precio' : ''}><input style={ds.formInput} type="number" min="0" step="0.01" value={l.precio_base} onChange={e => setLineas(lineas.map((x, j) => j === i ? { ...x, precio_base: e.target.value } : x))} /></Campo>
              <Campo etiqueta={i === 0 ? 'IGIC %' : ''}><input style={ds.formInput} type="number" min="0" max="20" value={l.igic_pct} onChange={e => setLineas(lineas.map((x, j) => j === i ? { ...x, igic_pct: e.target.value } : x))} /></Campo>
              <MiniBtn danger aria-label="Quitar" onClick={() => setLineas(lineas.filter((_, j) => j !== i))} disabled={lineas.length === 1}><Trash2 size={14} /></MiniBtn>
            </div>
          ))}
          <div><MiniBtn onClick={() => setLineas([...lineas, { concepto: '', precio_base: '', cantidad: 1, igic_pct: 7 }])}><Plus size={14} /> Línea</MiniBtn></div>
          <Campo etiqueta="Cómo se cobró">
            <Segmented full value={forma} onChange={setForma} options={[{ value: 'transferencia', label: 'Transferencia' }, { value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }]} />
          </Campo>
          <Campo etiqueta="Notas (salen en la factura)"><input style={ds.formInput} value={notas} onChange={e => setNotas(e.target.value)} /></Campo>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', ...type.body }}>
            <input type="checkbox" checked={enviar} onChange={e => setEnviar(e.target.checked)} /> Mandársela por correo{cli?.email ? ` a ${cli.email}` : ''}
          </label>
          <div style={{ ...type.num, fontSize: 18, textAlign: 'right' }}>Total {fmtEUR(total)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={ds.secondaryBtn} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <GlossyBtn onClick={emitir} disabled={guardando}>{guardando ? 'Emitiendo…' : 'Emitir factura'}</GlossyBtn>
        </div>
      </div>
    </div>
  )
}
