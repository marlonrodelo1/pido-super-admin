import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || String(error) }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Crash:', error?.message || error, info?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0D0D0D', color: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
          <div style={{ textAlign: 'center', padding: 32, maxWidth: 360 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Algo salio mal</h2>
            {this.state.errorMsg ? (
              <p style={{ fontSize: 11, color: '#FF6B2C', background: 'rgba(255,107,44,0.1)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, textAlign: 'left', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {this.state.errorMsg}
              </p>
            ) : null}
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 24 }}>
              Ha ocurrido un error inesperado. Recarga la pagina para continuar.
            </p>
            <button onClick={() => window.location.reload()} style={{
              padding: '14px 32px', borderRadius: 14, border: 'none',
              background: '#FF6B2C', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
