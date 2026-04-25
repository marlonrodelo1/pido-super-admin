// Hook ligero para media queries — sin dependencias externas
import { useState, useEffect } from 'react'

/**
 * Devuelve true si la media query coincide.
 * Ejemplo: const isTablet = useMediaQuery('(max-width: 1279px)')
 */
export function useMediaQuery(query) {
  const getMatch = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }
  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const handler = e => setMatches(e.matches)
    setMatches(mq.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler) // Safari < 14
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [query])

  return matches
}

// Breakpoints alineados con el resto de Pidoo (DESIGN.md)
export const BP = {
  // <768 → móvil (no soportado oficialmente)
  // 768-1279 → tablet
  // ≥1280 → desktop
  desktop: '(min-width: 1280px)',
  tabletDown: '(max-width: 1279px)',
  tablet: '(min-width: 768px) and (max-width: 1279px)',
  mobile: '(max-width: 767px)',
}
