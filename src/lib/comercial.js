// Módulo Comercial (3 nov 2026): llamadas a la edge `comercial` y cálculo de
// totales para verlos en vivo mientras se escribe.
//
// Los totales que valen son los de la BD (comercial_recalcular): esto solo
// adelanta en pantalla lo que la BD va a calcular, con el mismo redondeo
// (IGIC sobre la base agregada por tipo; el último plazo se lleva el resto de
// la base si los plazos suman 100 %).

import { supabase } from './supabase'

const URL_COMERCIAL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comercial`

// Por fetch y no por functions.invoke: así el mensaje de error de la edge
// (en español, para la persona) llega entero sea cual sea el código HTTP.
export async function llamarComercial(accion, datos = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(URL_COMERCIAL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ accion, ...datos }),
  })
  const j = await r.json().catch(() => ({ ok: false, error: `La función respondió ${r.status}` }))
  if (!r.ok || j.ok === false) throw new Error(j.error || `La función respondió ${r.status}`)
  return j
}

// Los errores PD4xx de la BD traen su explicación después de los dos puntos.
export const mensajeBD = (e) => String(e?.message || e || 'Error').replace(/^PD4\d\d:\s*/, '')

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

function desglose(lineas, tipo) {
  const grupos = new Map()
  for (const l of lineas) {
    if (l.tipo !== tipo) continue
    const t = Number(l.igic_pct) || 0
    grupos.set(t, r2((grupos.get(t) || 0) + r2((Number(l.cantidad) || 0) * (Number(l.precio_base) || 0))))
  }
  return [...grupos.entries()].sort((a, b) => a[0] - b[0])
    .map(([igic_pct, base]) => ({ igic_pct, base, igic: r2(base * igic_pct / 100) }))
}

export function calcularTotales(lineas, plazos) {
  const du = desglose(lineas, 'unico')
  const dm = desglose(lineas, 'mensual')
  const suma = (d, k) => r2(d.reduce((s, x) => s + x[k], 0))
  const unico = { desglose: du, base: suma(du, 'base'), igic: suma(du, 'igic') }
  unico.total = r2(unico.base + unico.igic)
  const mensual = { desglose: dm, base: suma(dm, 'base'), igic: suma(dm, 'igic') }
  mensual.total = r2(mensual.base + mensual.igic)

  const sumaPct = plazos.reduce((s, p) => s + (Number(p.pct) || 0), 0)
  const acum = new Map()
  const conImportes = plazos.map((p, i) => {
    let base = 0, igic = 0
    for (const g of du) {
      const b = i === plazos.length - 1 && Math.abs(sumaPct - 100) < 0.001
        ? r2(g.base - (acum.get(g.igic_pct) || 0))
        : r2(g.base * (Number(p.pct) || 0) / 100)
      acum.set(g.igic_pct, r2((acum.get(g.igic_pct) || 0) + b))
      base = r2(base + b)
      igic = r2(igic + r2(b * g.igic_pct / 100))
    }
    return { ...p, base, igic, total: r2(base + igic) }
  })
  return { unico, mensual, plazos: conImportes, sumaPct }
}

export const ESTADOS_PRESUPUESTO = {
  borrador:  { tono: 'neutral',    label: 'Borrador' },
  enviado:   { tono: 'info',       label: 'Enviado' },
  aceptado:  { tono: 'sage',       label: 'Aceptado' },
  rechazado: { tono: 'danger',     label: 'Rechazado' },
  caducado:  { tono: 'warning',    label: 'Caducado' },
  anulado:   { tono: 'neutral',    label: 'Anulado' },
}

export const ESTADOS_PLAZO = {
  pendiente:      { tono: 'neutral',    label: 'Pendiente' },
  enlace_enviado: { tono: 'info',       label: 'Enlace enviado' },
  procesando:     { tono: 'warning',    label: 'Confirmándose' },
  pagado:         { tono: 'sage',       label: 'Pagado' },
  fallido:        { tono: 'danger',     label: 'Fallido' },
  anulado:        { tono: 'neutral',    label: 'Anulado' },
}

export const ESTADOS_SUSCRIPCION = {
  pendiente_inicio: { tono: 'warning', label: 'Empieza al publicar' },
  activa:           { tono: 'sage',    label: 'Activa' },
  impagada:         { tono: 'danger',  label: 'Impagada' },
  cancelada:        { tono: 'neutral', label: 'Cancelada' },
}

export const MARCAS = [
  { value: 'rogotech', label: 'Rogotech' },
  { value: 'pidoo', label: 'Pidoo' },
]

export const PLANTILLAS_PLAZOS = [
  { label: '100 % al aceptar', plazos: [{ descripcion: 'Al aceptar el presupuesto', pct: 100, al_aceptar: true }] },
  { label: '40 / 60', plazos: [
    { descripcion: 'Al aceptar el presupuesto', pct: 40, al_aceptar: true },
    { descripcion: 'Al publicar el trabajo', pct: 60, al_aceptar: false },
  ] },
  { label: '50 / 50', plazos: [
    { descripcion: 'Al aceptar el presupuesto', pct: 50, al_aceptar: true },
    { descripcion: 'Al entregar el trabajo', pct: 50, al_aceptar: false },
  ] },
]

export function abrirPdfBase64(b64, nombre) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const w = window.open(url, '_blank')
  if (!w) {
    const a = document.createElement('a')
    a.href = url; a.download = nombre || 'presupuesto.pdf'; a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export const fechaCorta = (f) => f
  ? new Date(String(f).length <= 10 ? `${f}T12:00:00Z` : f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—'
export const fechaHora = (f) => f
  ? new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'
