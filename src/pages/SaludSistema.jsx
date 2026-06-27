import { useState, useEffect } from 'react'
import {
  RefreshCw, Database, Table2, Clock3, PackageX, ScrollText,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ds, colors } from '../lib/darkStyles'
import { toast } from '../App'

// Limite del free tier de Supabase
const DB_LIMIT_BYTES = 500 * 1024 * 1024 // 500 MB

const fmtBytes = (b) => {
  const n = Number(b) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// "hace X" relativo
function relativo(iso) {
  if (!iso) return 'sin datos'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'sin datos'
  const diff = Math.max(0, Date.now() - t)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace segundos'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

function SectionCard({ icon, title, children, sub }) {
  return (
    <div style={{ ...ds.card, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px',
        borderBottom: `1px solid ${colors.border}`, background: colors.elev2,
      }}>
        <span style={{ color: colors.primary, display: 'inline-flex' }}>{icon}</span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text, letterSpacing: '-0.01em' }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: colors.textMute, marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function CronStatusBadge({ status }) {
  let cfg
  if (status === 'succeeded') cfg = { color: colors.sage2, bg: colors.sageSoft, icon: <CheckCircle2 size={12} />, label: 'OK' }
  else if (status === 'failed') cfg = { color: colors.danger, bg: colors.dangerSoft, icon: <XCircle size={12} />, label: 'Fallo' }
  else cfg = { color: colors.stone, bg: colors.cream2, icon: <MinusCircle size={12} />, label: 'Sin datos' }
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      color: cfg.color, background: cfg.bg, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

export default function SaludSistema() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const { data: res, error: err } = await supabase.functions.invoke('admin-system-health')
      if (err) throw new Error(err.message || 'Error al invocar la función')
      if (res?.error) throw new Error(res.message || res.error)
      setData(res)
    } catch (e) {
      const msg = e?.message || String(e)
      setError(msg)
      toast('No se pudo cargar la salud del sistema: ' + msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // ── Derivados de DB ──
  const dbBytes = Number(data?.db?.size_bytes || 0)
  const dbPct = Math.min(100, (dbBytes / DB_LIMIT_BYTES) * 100)
  const dbColor = dbPct >= 85 ? colors.danger : dbPct >= 60 ? colors.warning : colors.sage2

  const atascados = data?.pedidos_atascados || {}
  const cronsFallando = (data?.crons || []).filter(c => c.active && c.last_status === 'failed')

  return (
    <div>
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={ds.h1}>Salud del sistema</h1>
          <div style={{ fontSize: 13, color: colors.textMute, marginTop: 4 }}>
            Estado de la infraestructura: base de datos, crons y pedidos atascados.
          </div>
        </div>
        <button onClick={cargar} disabled={loading} style={{ ...ds.secondaryBtn, opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Actualizar
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>

      {/* Alerta global crons fallando */}
      {!loading && !error && cronsFallando.length > 0 && (
        <div style={{
          ...ds.card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          background: colors.dangerSoft, border: `1px solid ${colors.danger}`,
        }}>
          <AlertTriangle size={18} style={{ color: colors.danger, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: colors.dangerText, fontWeight: 600 }}>
            {cronsFallando.length} cron{cronsFallando.length > 1 ? 's activos están' : ' activo está'} fallando: {cronsFallando.map(c => c.jobname).join(', ')}
          </div>
        </div>
      )}

      {/* Estados de carga / error */}
      {loading ? (
        <div style={{ ...ds.card, textAlign: 'center', padding: 48, color: colors.textMute, fontSize: 14 }}>
          Cargando salud del sistema…
        </div>
      ) : error ? (
        <div style={{ ...ds.card, textAlign: 'center', padding: 40 }}>
          <XCircle size={28} style={{ color: colors.danger, marginBottom: 10 }} />
          <div style={{ fontSize: 14, color: colors.text, fontWeight: 600, marginBottom: 6 }}>No se pudo cargar la salud del sistema</div>
          <div style={{ fontSize: 12.5, color: colors.textMute, marginBottom: 16 }}>{error}</div>
          <button onClick={cargar} style={ds.primaryBtn}><RefreshCw size={14} /> Reintentar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Fila superior: DB + Pedidos atascados */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            {/* Base de datos */}
            <SectionCard
              icon={<Database size={16} />}
              title="Base de datos"
              sub="Free tier: límite 500 MB"
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: dbColor, letterSpacing: '-0.02em' }}>
                  {data?.db?.size_pretty || fmtBytes(dbBytes)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: dbColor }}>{dbPct.toFixed(1)}%</div>
              </div>
              <div style={{ height: 12, borderRadius: 999, background: colors.cream2, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
                <div style={{ width: `${dbPct}%`, height: '100%', background: dbColor, borderRadius: 999, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 11.5, color: colors.textMute, marginTop: 8 }}>
                {fmtBytes(dbBytes)} de 500 MB usados
                {dbPct >= 85 && <span style={{ color: colors.danger, fontWeight: 700 }}> · ¡atención, casi lleno!</span>}
                {dbPct >= 60 && dbPct < 85 && <span style={{ color: colors.warning, fontWeight: 700 }}> · vigilar crecimiento</span>}
              </div>
            </SectionCard>

            {/* Pedidos atascados */}
            <SectionCard
              icon={<PackageX size={16} />}
              title="Pedidos atascados"
              sub="Posibles incidencias operativas"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { label: 'Sin rider', val: Number(atascados.sin_rider || 0) },
                  { label: 'Pago huérfano', val: Number(atascados.pago_huerfano || 0) },
                  { label: 'Estancados', val: Number(atascados.estancados || 0) },
                ].map((k) => {
                  const bad = k.val > 0
                  return (
                    <div key={k.label} style={{
                      borderRadius: 10, padding: '12px 10px', textAlign: 'center',
                      background: bad ? colors.dangerSoft : colors.cream2,
                      border: `1px solid ${bad ? colors.danger : colors.border}`,
                    }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: bad ? colors.danger : colors.sage2, lineHeight: 1 }}>{k.val}</div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMute, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 11, color: colors.textMute, marginTop: 10 }}>
                Sin rider: dispatch agotado · Pago huérfano: &gt;1h sin pagar · Estancados: &gt;3h en proceso
              </div>
            </SectionCard>
          </div>

          {/* Crons */}
          <SectionCard icon={<Clock3 size={16} />} title="Crons (pg_cron)" sub={`${(data?.crons || []).length} jobs programados`}>
            <div style={{ ...ds.table, boxShadow: 'none' }}>
              <div style={ds.tableHeader}>
                <div style={{ flex: '2 1 180px' }}>Job</div>
                <div style={{ flex: '1 1 100px' }}>Schedule</div>
                <div style={{ flex: '0 0 80px', textAlign: 'center' }}>Activo</div>
                <div style={{ flex: '1 1 130px' }}>Último run</div>
              </div>
              {(data?.crons || []).map((c) => {
                const resaltar = c.active && c.last_status === 'failed'
                return (
                  <div key={c.jobid} style={{
                    ...ds.tableRow,
                    background: resaltar ? colors.dangerSoft : 'transparent',
                  }}>
                    <div style={{ flex: '2 1 180px', minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.jobname}</div>
                      <div style={{ fontSize: 10.5, color: colors.textMute }}>#{c.jobid}</div>
                    </div>
                    <div style={{ flex: '1 1 100px', fontFamily: 'monospace', fontSize: 11.5, color: colors.textMute }}>{c.schedule}</div>
                    <div style={{ flex: '0 0 80px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        color: c.active ? colors.sage2 : colors.stone,
                        background: c.active ? colors.sageSoft : colors.cream2,
                      }}>{c.active ? 'SÍ' : 'NO'}</span>
                    </div>
                    <div style={{ flex: '1 1 130px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <CronStatusBadge status={c.last_status} />
                      <span style={{ fontSize: 11, color: colors.textMute }}>{relativo(c.last_run)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>

          {/* Fila inferior: Tablas + Logs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            {/* Tablas más grandes */}
            <SectionCard icon={<Table2 size={16} />} title="Tablas más grandes" sub="Schema public · top 6">
              <div>
                {(data?.tablas_top || []).map((t, i) => {
                  const maxBytes = Number(data?.tablas_top?.[0]?.bytes || 1)
                  const w = Math.max(3, (Number(t.bytes) / maxBytes) * 100)
                  return (
                    <div key={t.relname} style={{ marginBottom: i === (data.tablas_top.length - 1) ? 0 : 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.text, fontFamily: 'monospace' }}>{t.relname}</span>
                        <span style={{ fontSize: 12, color: colors.textMute, fontVariantNumeric: 'tabular-nums' }}>{t.pretty}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: colors.cream2, overflow: 'hidden' }}>
                        <div style={{ width: `${w}%`, height: '100%', background: colors.primary, opacity: 0.55, borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>

            {/* Logs */}
            <SectionCard icon={<ScrollText size={16} />} title="Logs" sub="Tablas de registro que pueden crecer">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ borderRadius: 10, padding: '14px 12px', background: colors.cream2, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.text, lineHeight: 1 }}>
                    {Number(data?.push_debug_logs_count || 0).toLocaleString('es-ES')}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMute, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>push_debug_logs</div>
                </div>
                <div style={{ borderRadius: 10, padding: '14px 12px', background: colors.cream2, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.text, lineHeight: 1 }}>
                    {Number(data?.cron_history_rows || 0).toLocaleString('es-ES')}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMute, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>cron.job_run_details</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: colors.textMute, marginTop: 10 }}>
                El historial de crons fue la causa de la caída por disco lleno. El job <code>prune-cron-history</code> lo poda a diario.
              </div>
            </SectionCard>
          </div>

          {/* Pie */}
          {data?.generated_at && (
            <div style={{ fontSize: 11, color: colors.textFaint, textAlign: 'right' }}>
              Generado: {new Date(data.generated_at).toLocaleString('es-ES')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
