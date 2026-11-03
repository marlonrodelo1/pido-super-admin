import { useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Search, Send, CircleCheck, PenLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAdmin } from '../context/AdminContext'
import { colors, ds, type } from '../lib/darkStyles'
import { Card, Chip, GlossyBtn, PillTabs, Segmented, StatCard, Vacio, fmtEUR } from '../lib/ui'
import { ESTADOS_PRESUPUESTO, MARCAS, PLANTILLAS_PLAZOS, fechaCorta, mensajeBD } from '../lib/comercial'
import PresupuestoEditor from '../components/comercial/PresupuestoEditor'
import PresupuestoDetalle from '../components/comercial/PresupuestoDetalle'
import { Campo } from './Precios'
import { toast } from '../App'

// Presupuestos (módulo Comercial, 3 nov 2026). Lo ven el superadmin (todos) y
// el comercial (solo los suyos: lo filtra la BD, no esta pantalla).
//   · Borrador → PresupuestoEditor (se cambia todo).
//   · Enviado en adelante → PresupuestoDetalle (congelado; acciones y cobros).

const FILTROS = [
  { value: 'abiertos', label: 'En curso' },
  { value: 'borrador', label: 'Borradores' },
  { value: 'enviado', label: 'Enviados' },
  { value: 'aceptado', label: 'Aceptados' },
  { value: 'cerrados', label: 'Cerrados' },
  { value: 'todos', label: 'Todos' },
]

export default function Presupuestos() {
  const { rol, user } = useAdmin()
  const [lista, setLista] = useState([])
  const [autores, setAutores] = useState({})
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState('abiertos')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(null)
  const [creando, setCreando] = useState(false)

  async function cargar() {
    setCargando(true)
    const { data, error } = await supabase.from('comercial_presupuestos')
      .select('id, numero, version, marca, proyecto, estado, fecha, valido_hasta, total_unico, total_mensual, enviado_at, aceptado_at, created_by, cliente:comercial_clientes(razon_social, nombre_comercial)')
      .order('created_at', { ascending: false })
    if (error) toast(mensajeBD(error), 'error')
    setLista(data || [])
    const ids = [...new Set((data || []).map(p => p.created_by).filter(Boolean))]
    if (ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id, nombre, apellido, email').in('id', ids)
      setAutores(Object.fromEntries((us || []).map(u => [u.id, [u.nombre, u.apellido].filter(Boolean).join(' ') || u.email])))
    }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const filtrados = useMemo(() => lista.filter(p => {
    if (filtro === 'abiertos' && !['borrador', 'enviado', 'aceptado'].includes(p.estado)) return false
    if (filtro === 'cerrados' && !['rechazado', 'caducado', 'anulado'].includes(p.estado)) return false
    if (['borrador', 'enviado', 'aceptado'].includes(filtro) && p.estado !== filtro) return false
    if (!busqueda) return true
    const s = busqueda.toLowerCase()
    return [p.numero, p.proyecto, p.cliente?.razon_social, p.cliente?.nombre_comercial].some(x => (x || '').toLowerCase().includes(s))
  }), [lista, filtro, busqueda])

  const stats = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7)
    const enviados = lista.filter(p => p.estado === 'enviado')
    const aceptadosMes = lista.filter(p => p.estado === 'aceptado' && (p.aceptado_at || '').slice(0, 7) === mes)
    return {
      enviados: enviados.length,
      enJuego: enviados.reduce((s, p) => s + Number(p.total_unico), 0),
      aceptadosMes: aceptadosMes.length,
      ganadoMes: aceptadosMes.reduce((s, p) => s + Number(p.total_unico), 0),
      mensual: lista.filter(p => p.estado === 'aceptado').reduce((s, p) => s + Number(p.total_mensual), 0),
    }
  }, [lista])

  if (abierto) {
    const volver = () => { setAbierto(null); cargar() }
    return abierto.estado === 'borrador'
      ? <PresupuestoEditor id={abierto.id} onVolver={volver} onEnviado={(id) => setAbierto({ id, estado: 'enviado' })} />
      : <PresupuestoDetalle id={abierto.id} onVolver={volver} onAbrir={(id, estado) => setAbierto({ id, estado })} />
  }

  return (
    <div>
      <div className="admin-page-header" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ ...ds.h1, marginBottom: 4 }}>Presupuestos</h1>
          <p style={{ ...type.body, color: colors.textMute, maxWidth: 760 }}>
            Se envían por correo; el cliente los acepta y paga el primer plazo desde el propio correo (tarjeta o domiciliación).
            El plan mensual queda domiciliado con el mismo medio de pago.
            {rol === 'comercial' && ' Aquí ves solo los tuyos.'}
          </p>
        </div>
        <GlossyBtn onClick={() => setCreando(true)}><Plus size={16} /> Nuevo presupuesto</GlossyBtn>
      </div>

      <div className="ds-cards" style={{ marginBottom: 20 }}>
        <StatCard label="Enviados sin respuesta" value={stats.enviados} sub={`${fmtEUR(stats.enJuego)} en juego`} icon={<Send size={17} />} />
        <StatCard label="Aceptados este mes" value={stats.aceptadosMes} sub={fmtEUR(stats.ganadoMes)} icon={<CircleCheck size={17} />} tone={stats.aceptadosMes ? 'sage' : 'ink'} />
        <StatCard label="Planes mensuales" value={fmtEUR(stats.mensual)} sub="al mes, de los aceptados" icon={<PenLine size={17} />} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <PillTabs value={filtro} onChange={setFiltro} options={FILTROS} />
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.stone }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar presupuestos"
            placeholder="Número, cliente o proyecto…" style={{ ...ds.input, paddingLeft: 34, width: '100%', boxSizing: 'border-box' }} />
        </div>
      </div>

      {cargando ? (
        <Card><div style={{ padding: 24, textAlign: 'center', ...type.body, color: colors.textMute }}>Cargando…</div></Card>
      ) : filtrados.length === 0 ? (
        <Card pad={0}>
          <Vacio icon={<FileText size={28} />} titulo={busqueda ? 'Ninguno con esa búsqueda' : 'Ningún presupuesto aquí'}
            texto={lista.length ? 'Prueba con otro filtro.' : 'Empieza con «Nuevo presupuesto».'} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtrados.map(p => {
            const e = ESTADOS_PRESUPUESTO[p.estado] || { tono: 'neutral', label: p.estado }
            return (
              <Card key={p.id} pad={14} onClick={() => setAbierto({ id: p.id, estado: p.estado })}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ ...type.mono, fontSize: 13, fontWeight: 700, color: colors.ink }}>{p.numero}{p.version > 1 ? ` v${p.version}` : ''}</span>
                      <Chip tono={e.tono} dot>{e.label}</Chip>
                      <Chip tono={p.marca === 'pidoo' ? 'terracotta' : 'info'}>{MARCAS.find(m => m.value === p.marca)?.label}</Chip>
                    </div>
                    <div style={{ ...type.label, fontWeight: 700, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.cliente?.nombre_comercial || p.cliente?.razon_social}
                    </div>
                    <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.proyecto}{rol === 'superadmin' && p.created_by && p.created_by !== user?.id ? ` · de ${autores[p.created_by] || '—'}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 130 }}>
                    <div style={{ ...type.num, fontSize: 17 }}>{fmtEUR(p.total_unico)}</div>
                    <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>
                      {Number(p.total_mensual) > 0 ? `+ ${fmtEUR(p.total_mensual)}/mes · ` : ''}{fechaCorta(p.fecha)}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {creando && <NuevoPresupuesto onCerrar={() => setCreando(false)} onCreado={(id) => { setCreando(false); setAbierto({ id, estado: 'borrador' }) }} />}
    </div>
  )
}

const CLIENTE_VACIO = { razon_social: '', nombre_comercial: '', nif: '', email: '', telefono: '', contacto_nombre: '', direccion: '', cp: '', municipio: '', provincia: 'Santa Cruz de Tenerife', establecimiento_id: null }

function NuevoPresupuesto({ onCerrar, onCreado }) {
  const [marca, setMarca] = useState('rogotech')
  const [proyecto, setProyecto] = useState('')
  const [modo, setModo] = useState('nuevo')
  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [cli, setCli] = useState(CLIENTE_VACIO)
  const [buscaRest, setBuscaRest] = useState('')
  const [restaurantes, setRestaurantes] = useState([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('comercial_clientes').select('id, razon_social, nombre_comercial, email').order('razon_social')
      .then(({ data }) => { setClientes(data || []); if (data?.length) setModo('existente') })
  }, [])

  useEffect(() => {
    if (modo !== 'restaurante' || buscaRest.trim().length < 2) { setRestaurantes([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('establecimientos')
        .select('id, nombre, razon_social, nif, email, telefono, direccion, direccion_fiscal, ciudad_fiscal, provincia_fiscal')
        .ilike('nombre', `%${buscaRest.trim()}%`).limit(8)
      setRestaurantes(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [buscaRest, modo])

  const elegirRestaurante = (r) => {
    setCli({
      ...CLIENTE_VACIO,
      razon_social: r.razon_social || r.nombre, nombre_comercial: r.nombre, nif: r.nif || '', email: r.email || '',
      telefono: r.telefono || '', direccion: r.direccion_fiscal || r.direccion || '', municipio: r.ciudad_fiscal || '',
      provincia: r.provincia_fiscal || 'Santa Cruz de Tenerife', establecimiento_id: r.id,
    })
    setModo('nuevo')
    setRestaurantes([])
  }

  async function crear() {
    if (proyecto.trim().length < 2) return toast('Pon el nombre del proyecto', 'error')
    setGuardando(true)
    try {
      let idCliente = clienteId
      let establecimientoId = null
      if (modo !== 'existente') {
        if (cli.razon_social.trim().length < 2) throw new Error('Falta la razón social (o el nombre) del cliente')
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cli.email.trim())) throw new Error('El correo del cliente no es válido')
        const limpio = Object.fromEntries(Object.entries(cli).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]))
        const { data, error } = await supabase.from('comercial_clientes').insert(limpio).select('id').single()
        if (error) throw error
        idCliente = data.id
        establecimientoId = cli.establecimiento_id
      }
      if (!idCliente) throw new Error('Elige el cliente')
      const { data: p, error: e1 } = await supabase.from('comercial_presupuestos')
        .insert({ marca, cliente_id: idCliente, proyecto: proyecto.trim(), establecimiento_id: establecimientoId })
        .select('id').single()
      if (e1) throw e1
      const plantilla = PLANTILLAS_PLAZOS[marca === 'pidoo' ? 0 : 1].plazos
      const { error: e2 } = await supabase.from('comercial_plazos')
        .insert(plantilla.map((pl, i) => ({ ...pl, presupuesto_id: p.id, orden: i + 1 })))
      if (e2) throw e2
      onCreado(p.id)
    } catch (e) {
      toast(mensajeBD(e), 'error')
      setGuardando(false)
    }
  }

  const set = (k) => (e) => setCli({ ...cli, [k]: e.target.value })

  return (
    <div style={ds.modal} onClick={() => !guardando && onCerrar()}>
      <div style={{ ...ds.modalContent, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <h2 style={ds.h2}>Nuevo presupuesto</h2>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Campo etiqueta="Marca" ayuda="Cambia la cabecera, el remitente y las condiciones">
              <Segmented options={MARCAS} value={marca} onChange={setMarca} full />
            </Campo>
            <Campo etiqueta="Proyecto">
              <input style={ds.formInput} value={proyecto} onChange={e => setProyecto(e.target.value)} placeholder="Web a medida con tienda online" />
            </Campo>
          </div>

          <div>
            <span style={ds.label}>Cliente</span>
            <Segmented full value={modo} onChange={setModo} options={[
              ...(clientes.length ? [{ value: 'existente', label: 'Ya existe' }] : []),
              { value: 'nuevo', label: 'Nuevo' },
              { value: 'restaurante', label: 'Desde un restaurante' },
            ]} />
          </div>

          {modo === 'existente' && (
            <select style={ds.select} value={clienteId} onChange={e => setClienteId(e.target.value)}>
              <option value="">Elige…</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre_comercial || c.razon_social} · {c.email}</option>)}
            </select>
          )}

          {modo === 'restaurante' && (
            <div>
              <input style={ds.formInput} value={buscaRest} onChange={e => setBuscaRest(e.target.value)} placeholder="Nombre del restaurante…" autoFocus />
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {restaurantes.map(r => (
                  <button key={r.id} onClick={() => elegirRestaurante(r)} style={{ ...ds.secondaryBtn, justifyContent: 'space-between', height: 'auto', padding: '9px 12px', textAlign: 'left' }}>
                    <span>{r.nombre}</span>
                    <span style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>{r.razon_social || 'sin razón social'}{r.nif ? ` · ${r.nif}` : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {modo === 'nuevo' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Campo etiqueta="Razón social"><input style={ds.formInput} value={cli.razon_social} onChange={set('razon_social')} placeholder="Panadería Marrero" /></Campo>
              <Campo etiqueta="Nombre comercial"><input style={ds.formInput} value={cli.nombre_comercial} onChange={set('nombre_comercial')} placeholder="El Molino del Pan" /></Campo>
              <Campo etiqueta="NIF / CIF" ayuda="Si no lo sabes, lo escribe él al aceptar"><input style={ds.formInput} value={cli.nif} onChange={set('nif')} /></Campo>
              <Campo etiqueta="Correo"><input style={ds.formInput} type="email" value={cli.email} onChange={set('email')} /></Campo>
              <Campo etiqueta="Persona de contacto"><input style={ds.formInput} value={cli.contacto_nombre} onChange={set('contacto_nombre')} /></Campo>
              <Campo etiqueta="Teléfono"><input style={ds.formInput} type="tel" value={cli.telefono} onChange={set('telefono')} /></Campo>
              <Campo etiqueta="Dirección"><input style={ds.formInput} value={cli.direccion} onChange={set('direccion')} /></Campo>
              <Campo etiqueta="Código postal"><input style={ds.formInput} value={cli.cp} onChange={set('cp')} inputMode="numeric" /></Campo>
              <Campo etiqueta="Municipio"><input style={ds.formInput} value={cli.municipio} onChange={set('municipio')} /></Campo>
            </div>
          )}
          {modo === 'nuevo' && cli.establecimiento_id && (
            <div style={{ ...type.caption, letterSpacing: 0, color: colors.stone }}>Datos sacados de la ficha del restaurante. Revísalos.</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={ds.secondaryBtn} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <GlossyBtn onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear y seguir'}</GlossyBtn>
        </div>
      </div>
    </div>
  )
}
