/* ──────────────────────────────────────────────────────────────────────────
 * ConsumoIACard — lo que gastan los camareros de voz este mes.
 *
 * POR QUÉ EXISTE: los agentes de ElevenLabs se cobran por minuto hablado, y
 * hasta ahora el contador marcaba 0,00 con Dar Kebab ya atendiendo el teléfono
 * en producción. Se estaba gastando sin verlo. Esta tarjeta es el sitio donde
 * se ve, antes de que haya un cliente pagando una cuota con minutos incluidos.
 *
 * Los datos salen de `ia_consumo`, que es el libro mayor: lo alimentan el
 * webhook de fin de conversación y el cron horario `ia-minutos`, siempre con
 * la duración que dice ElevenLabs y no la que diga el agente.
 * ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useState } from 'react'
import { Mic, RefreshCw, AlertTriangle, Phone, Armchair } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'

const eur = (n) => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function inicioMesISO() {
  const h = new Date()
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1)).toISOString()
}

export default function ConsumoIACard() {
  const [filas, setFilas] = useState([])
  const [sueltas, setSueltas] = useState({ n: 0, seg: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [sinDetalle, setSinDetalle] = useState(0)

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    const desde = inicioMesISO()

    const [porRest, huerfanas, faltanCreditos] = await Promise.all([
      supabase.from('v_ia_consumo_mes').select('*').order('minutos', { ascending: false }),
      // Conversaciones que ElevenLabs factura pero que no son de nadie: agentes
      // de prueba o sin mapear. Es gasto real que no se le puede repercutir a
      // ningún restaurante, así que se enseña aparte en vez de esconderlo.
      supabase.from('ia_consumo').select('duracion_seg')
        .is('establecimiento_id', null).gte('inicio_at', desde),
      supabase.from('ia_consumo').select('conversation_id', { count: 'exact', head: true })
        .is('coste_creditos', null).gte('inicio_at', desde),
    ])

    if (porRest.error) { setError(porRest.error.message); setCargando(false); return }
    setFilas(porRest.data || [])
    const h = huerfanas.data || []
    setSueltas({ n: h.length, seg: h.reduce((a, x) => a + (x.duracion_seg || 0), 0) })
    setSinDetalle(faltanCreditos.count || 0)
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const totMin = filas.reduce((a, f) => a + Number(f.minutos || 0), 0) + sueltas.seg / 60
  const totUsd = filas.reduce((a, f) => a + Number(f.coste_usd || 0), 0)
  const totConv = filas.reduce((a, f) => a + Number(f.conversaciones || 0), 0) + sueltas.n
  const totCred = filas.reduce((a, f) => a + Number(f.creditos || 0), 0)

  return (
    <div style={{ ...ds.card, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px',
        borderBottom: `1px solid ${colors.border}`, background: colors.elev2,
      }}>
        <span style={{ color: colors.primary, display: 'inline-flex' }}><Mic size={16} /></span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text, letterSpacing: '-0.01em' }}>
            Camareros de voz
          </div>
          <div style={{ fontSize: 11, color: colors.textMute, marginTop: 1 }}>
            Minutos hablados este mes · los cobra ElevenLabs
          </div>
        </div>
        <button onClick={cargar} disabled={cargando}
          style={{ ...ds.secondaryBtn, marginLeft: 'auto', padding: '5px 9px', opacity: cargando ? 0.6 : 1 }}>
          <RefreshCw size={13} style={{ animation: cargando ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      <div style={{ padding: 16 }}>
        {cargando ? (
          <div style={{ color: colors.textMute, fontSize: 13, padding: '8px 0' }}>Cargando…</div>
        ) : error ? (
          <div style={{ color: colors.danger, fontSize: 12.5 }}>{error}</div>
        ) : (
          <>
            {/* Totales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(92px,1fr))', gap: 10, marginBottom: 14 }}>
              {[
                ['Minutos', totMin.toFixed(1)],
                ['Conversaciones', String(totConv)],
                ['Créditos', totCred ? totCred.toLocaleString('es-ES') : '—'],
                ['Coste aprox.', '$' + eur(totUsd)],
              ].map(([k, v]) => (
                <div key={k} style={{ background: colors.elev2, borderRadius: 9, padding: '9px 11px', border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.text, letterSpacing: '-0.02em' }}>{v}</div>
                  <div style={{ fontSize: 10.5, color: colors.textMute, marginTop: 1 }}>{k}</div>
                </div>
              ))}
            </div>

            {/* Por restaurante */}
            {filas.length === 0 ? (
              <div style={{ fontSize: 12.5, color: colors.textMute }}>
                Nadie ha hablado con un camarero de voz este mes.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {filas.map((f) => {
                  const inc = Number(f.incluidos || 0)
                  const pct = inc > 0 ? Math.min(100, (Number(f.minutos) / inc) * 100) : 0
                  const col = pct >= 90 ? colors.danger : pct >= 70 ? colors.warning : colors.sage2
                  return (
                    <div key={f.establecimiento_id + f.canal}
                      style={{ background: colors.elev2, borderRadius: 9, padding: '9px 11px', border: `1px solid ${colors.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ color: colors.textMute, display: 'inline-flex' }}>
                          {f.canal === 'mesa' ? <Armchair size={12} /> : <Phone size={12} />}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.text }}>{f.restaurante}</span>
                        <span style={{ fontSize: 10.5, color: colors.textMute }}>
                          {f.conversaciones} conv · {f.media_seg}s de media
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: col }}>
                          {Number(f.minutos).toFixed(1)}{inc > 0 ? ` / ${inc} min` : ' min'}
                        </span>
                      </div>
                      {inc > 0 && (
                        <div style={{ height: 6, borderRadius: 999, background: colors.border, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 999, transition: 'width .3s' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Gasto que no es de nadie */}
            {sueltas.n > 0 && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: colors.textMute, lineHeight: 1.5 }}>
                Además, <b style={{ color: colors.text }}>{sueltas.n} conversaciones</b> ({(sueltas.seg / 60).toFixed(1)} min)
                de agentes de prueba o sin asignar a ningún restaurante. Se pagan igual.
              </div>
            )}

            {/* El aviso que importa: si esto no está configurado, no se mide */}
            {sinDetalle > 0 && (
              <div style={{
                marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start',
                background: colors.dangerSoft, border: `1px solid ${colors.danger}`,
                borderRadius: 9, padding: '9px 11px',
              }}>
                <AlertTriangle size={14} style={{ color: colors.danger, flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11.5, color: colors.dangerText, lineHeight: 1.5 }}>
                  {sinDetalle} conversaciones sin los créditos reales de ElevenLabs. Falta el
                  secreto <b>ELEVENLABS_API_KEY</b> en Supabase para que el cron horario pueda
                  traerlos; hasta entonces el coste que ves es una estimación.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
