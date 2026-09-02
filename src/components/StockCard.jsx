import { useState, useEffect, useCallback } from 'react'
import { Boxes, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { colors, radius, type } from '../lib/darkStyles'
import { Toggle } from '../lib/ui'
import { toast, confirmar } from '../App'

// Interruptor MAESTRO del módulo de Almacén (stock + escandallos) de un restaurante.
//
// Mismo contrato de poder que el TPV y que Creadores: lo enciende PIDOO y lo pausa el
// RESTAURANTE, y son dos columnas distintas. `stock_config.activo` está congelada para
// el dueño por `stock_config_guard` (PD231), así que este toggle es el ÚNICO sitio
// desde el que se puede encender.
//
// Va por RPC `stock_activar` y no por UPDATE directo porque además SIEMBRA la fila:
// que exista la fila ES tener el módulo. `stock_config` no tiene policy de INSERT
// para nadie, precisamente para que no se pueda regalar el módulo desde el panel.
//
// Lo que enseña de un vistazo: si ya hizo el recuento inicial (mientras no lo haga,
// los números del almacén no significan nada), cuántos artículos controla, cuánto
// vale su inventario y si tiene existencias en negativo.

const fmtEur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

export default function StockCard({ establecimiento, onChanged }) {
  const estId = establecimiento?.id

  const [cfg, setCfg] = useState(null)
  const [stats, setStats] = useState({ articulos: 0, valor: 0, enNegativo: 0, sinCoste: 0, movsMes: 0 })
  const [cargando, setCargando] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!estId) return
    const mes = new Date()
    mes.setDate(1); mes.setHours(0, 0, 0, 0)

    const [c, v, m] = await Promise.all([
      supabase.from('stock_config').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('v_stock_valor_inventario').select('*').eq('establecimiento_id', estId).maybeSingle(),
      supabase.from('stock_movimientos').select('id', { count: 'exact', head: true })
        .eq('establecimiento_id', estId).gte('created_at', mes.toISOString()),
    ])

    setCfg(c.data || null)
    setStats({
      articulos: v.data?.articulos || 0,
      valor: v.data?.valor || 0,
      enNegativo: v.data?.en_negativo || 0,
      sinCoste: v.data?.sin_coste || 0,
      movsMes: m.count || 0,
    })
    setCargando(false)
  }, [estId])

  useEffect(() => { load() }, [load])

  async function toggle() {
    const nuevo = !cfg?.activo
    if (nuevo && !(await confirmar(
      `Vas a activar el Almacén de ${establecimiento?.nombre || 'este restaurante'}.\n\n` +
      `A partir de ese momento cada venta descuenta los artículos del escandallo, y los ` +
      `platos que se queden sin género desaparecen de la carta en pidoo.es y en el QR hasta que vuelva a entrar.\n\n` +
      `El TPV nunca se bloquea: en barra se vende igual aunque las existencias queden en negativo.\n\n` +
      `Tiene que hacer el recuento inicial antes de fiarse de los números.`
    ))) return

    setBusy(true)
    const { error } = await supabase.rpc('stock_activar', {
      p_establecimiento_id: estId,
      p_activo: nuevo,
    })
    setBusy(false)
    // supabase-js NO lanza excepción: devuelve `{ error }`. Un try/catch no saltaría.
    if (error) return toast('Error: ' + error.message, 'error')
    toast(nuevo ? 'Almacén activado' : 'Almacén desactivado', 'success')
    load()
    onChanged?.()
  }

  if (cargando) return null

  const activo = !!cfg?.activo
  const pausado = !!cfg?.pausado_por_restaurante
  const arrancado = !!cfg?.arranque_at

  return (
    <div style={{
      background: colors.paper, borderRadius: radius.lg, padding: 16,
      border: `1px solid ${colors.border}`, boxShadow: colors.shadow, marginTop: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Boxes size={18} color={colors.terracotta} />
        <h3 style={{ ...type.h3, color: colors.text, margin: 0 }}>Almacén y escandallos</h3>
      </div>
      <div style={{ ...type.label, color: colors.textMute, marginBottom: 14 }}>
        Lo que le compra al proveedor, el coste de cada plato de su carta y las facturas.
        Se gestiona desde el panel web.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderRadius: radius.md, border: `1px solid ${colors.border}`, background: colors.cream,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...type.body, fontWeight: 600, color: colors.text }}>
            {cfg ? 'Módulo dado de alta' : 'Módulo sin dar de alta'}
          </div>
          <div style={{ ...type.label, color: colors.textMute, marginTop: 2 }}>
            {!cfg
              ? 'Al activarlo se crea su configuración de almacén.'
              : activo
                ? (pausado
                  ? 'Activo, pero el restaurante lo tiene en pausa ahora mismo.'
                  : arrancado
                    ? 'Descontando existencias en cada venta.'
                    : 'Encendido, pero todavía sin recuento inicial: los números aún no valen.')
                : 'Dado de alta pero apagado: no descuenta nada.'}
          </div>
        </div>
        <Toggle on={activo} disabled={busy} tone="terracotta" onChange={toggle} aria-label="Activar el almacén" />
      </div>

      {activo && (
        <>
          <div className="ds-cards" style={{ marginTop: 12 }}>
            <Mini label="Artículos de compra" value={stats.articulos} />
            <Mini label="Valor del inventario" value={fmtEur(stats.valor)} />
            <Mini label="Movimientos este mes" value={stats.movsMes} />
            {stats.enNegativo > 0 && (
              <Mini label="En negativo" value={stats.enNegativo} alerta />
            )}
          </div>

          {!arrancado && (
            <Aviso>
              Todavía no ha hecho el <strong>recuento inicial</strong>. Hasta que lo haga,
              el valor del inventario es cero aunque tenga género en la cámara: el módulo
              solo cuenta desde ahí.
            </Aviso>
          )}

          {arrancado && stats.sinCoste > 0 && (
            <Aviso>
              {stats.sinCoste} artículo{stats.sinCoste === 1 ? '' : 's'} sin precio de coste.
              Sus platos saldrán con margen del 100 % hasta que meta una factura de compra
              o le ponga el coste en el recuento.
            </Aviso>
          )}
        </>
      )}
    </div>
  )
}

function Mini({ label, value, alerta }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: radius.md,
      border: `1px solid ${alerta ? colors.danger : colors.border}`,
      background: alerta ? colors.dangerSoft : colors.cream,
    }}>
      <div style={{ ...type.caption, color: alerta ? colors.onDangerSoft : colors.textMute }}>{label}</div>
      <div style={{ ...type.num, fontSize: 20, color: alerta ? colors.onDangerSoft : colors.text, marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

function Aviso({ children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12,
      padding: '10px 12px', borderRadius: radius.md,
      border: `1px solid ${colors.warning}`, background: colors.warningSoft,
    }}>
      <TriangleAlert size={15} color={colors.onWarningSoft} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ ...type.label, color: colors.onWarningSoft, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}
