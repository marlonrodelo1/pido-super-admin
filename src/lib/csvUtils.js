import Papa from 'papaparse'

const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB

// Normaliza: minúsculas, sin tildes, sin espacios extra
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// Detecta formato del CSV por los nombres de columnas
function detectarFormato(headers) {
  const H = headers.map(norm)
  // Uber Eats: "ID del producto en el catálogo", "Categoría", "Nombre", "Precio", "Descripción"
  if (H.includes('nombre') && H.includes('precio') && H.includes('categoria') &&
      (H.includes('id del producto en el catalogo') || H.includes('id del producto en la organizacion'))) {
    return 'ubereats'
  }
  // Pidoo nativo: "nombre", "precio", "categoria", "descripcion", "imagen_url", "disponible"
  if (H.includes('nombre') && H.includes('precio')) {
    return 'pidoo'
  }
  return 'unknown'
}

// Parsea precio soportando "14,00 €", "14.00", "14,00", "€ 14,00"
function parsePrecio(raw) {
  if (raw === null || raw === undefined) return NaN
  let s = String(raw).trim()
  if (!s) return NaN
  // Quitar símbolo euro y espacios
  s = s.replace(/€/g, '').replace(/\s/g, '')
  // Si tiene coma decimal (formato EU), convertir a punto
  if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.')
  } else if (s.includes(',') && s.includes('.')) {
    // Puede ser "1.234,56" (mil separador punto, decimal coma) — quitar puntos y cambiar coma
    s = s.replace(/\./g, '').replace(',', '.')
  }
  const n = parseFloat(s)
  return isFinite(n) ? n : NaN
}

export function parseCSV(file) {
  return new Promise((resolve) => {
    if (file.size > MAX_FILE_SIZE) {
      return resolve({ data: [], errors: ['El archivo supera 1MB'] })
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return resolve({ data: [], errors: ['El archivo debe ser .csv'] })
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (!results.data || results.data.length === 0) {
          return resolve({ data: [], errors: ['El archivo esta vacio'] })
        }

        const headers = Object.keys(results.data[0])
        const formato = detectarFormato(headers)

        if (formato === 'unknown') {
          return resolve({
            data: [],
            errors: [`No reconozco el formato. Encabezados encontrados: ${headers.join(', ')}. Usa la plantilla Pidoo o el CSV exportado de Uber Eats.`],
          })
        }

        // Normaliza cada fila a { nombre, precio_raw, categoria, descripcion, imagen_url?, disponible? }
        const normalized = results.data.map(row => {
          const mapped = {}
          // Map por formato
          for (const [key, val] of Object.entries(row)) {
            const k = norm(key)
            const v = typeof val === 'string' ? val.trim() : val
            if (formato === 'ubereats') {
              if (k === 'nombre') mapped.nombre = v
              else if (k === 'precio') mapped.precio_raw = v
              else if (k === 'categoria') mapped.categoria = v
              else if (k === 'descripcion') mapped.descripcion = v
              else if (k === 'id del producto en el catalogo') mapped.external_id = v
            } else {
              // Pidoo nativo
              if (k === 'nombre') mapped.nombre = v
              else if (k === 'precio') mapped.precio_raw = v
              else if (k === 'categoria') mapped.categoria = v
              else if (k === 'descripcion') mapped.descripcion = v
              else if (k === 'imagen_url') mapped.imagen_url = v
              else if (k === 'disponible') mapped.disponible = v
            }
          }
          return mapped
        }).filter(r => r.nombre)  // fuera filas vacías

        const parseErrors = (results.errors || [])
          .filter(e => e.type !== 'FieldMismatch')
          .map(e => `Fila ${(e.row || 0) + 2}: ${e.message}`)

        resolve({ data: normalized, errors: parseErrors, formato })
      },
      error(err) {
        resolve({ data: [], errors: [`Error al leer CSV: ${err.message}`] })
      },
    })
  })
}

export function validateProducts(rows) {
  const valid = []
  const errors = []
  const seen = new Set() // dedupe por nombre+categoria

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const rowErrors = []

    if (!row.nombre) rowErrors.push('nombre es requerido')
    else if (row.nombre.length > 200) rowErrors.push('nombre max 200 caracteres')

    const precio = parsePrecio(row.precio_raw)
    if (!row.precio_raw || isNaN(precio)) {
      rowErrors.push('precio invalido')
    } else if (precio <= 0) {
      rowErrors.push('precio debe ser mayor a 0')
    }

    if (row.descripcion && row.descripcion.length > 2000) {
      rowErrors.push('descripcion max 2000 caracteres')
    }

    if (row.imagen_url && !/^https?:\/\//i.test(row.imagen_url)) {
      rowErrors.push('imagen_url debe empezar con http')
    }

    let disponible = true
    if (row.disponible !== undefined && row.disponible !== '') {
      const val = String(row.disponible).toLowerCase().trim()
      if (['false', 'no', '0'].includes(val)) disponible = false
      else if (['true', 'si', 'sí', '1'].includes(val)) disponible = true
    }

    // Dedupe
    const key = `${(row.nombre || '').toLowerCase()}|${(row.categoria || '').toLowerCase()}`
    if (!rowErrors.length && seen.has(key)) {
      rowErrors.push('duplicado (mismo nombre en misma categoria)')
    }
    seen.add(key)

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, messages: rowErrors, data: row })
    } else {
      valid.push({
        _rowNum: rowNum,
        nombre: row.nombre,
        descripcion: row.descripcion || null,
        precio: Math.round(precio * 100) / 100,
        categoria: row.categoria || null,
        imagen_url: row.imagen_url || null,
        disponible,
      })
    }
  })

  return { valid, errors }
}

export function generateTemplate() {
  const bom = '\uFEFF'
  const csv = bom + [
    'nombre,descripcion,precio,categoria,imagen_url,disponible',
    'Pizza Margarita,Base de tomate y mozzarella,8.50,Pizzas,,si',
    'Coca-Cola 33cl,Refresco,2.50,Bebidas,,si',
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_productos.csv'
  a.click()
  URL.revokeObjectURL(url)
}
