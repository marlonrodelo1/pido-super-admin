import Papa from 'papaparse'

const REQUIRED_HEADERS = ['nombre', 'precio']
const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1MB

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

        // Trim header names
        const headers = Object.keys(results.data[0]).map(h => h.trim().toLowerCase())
        const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h))
        if (missing.length > 0) {
          return resolve({ data: [], errors: [`Faltan columnas requeridas: ${missing.join(', ')}`] })
        }

        // Normalize keys
        const normalized = results.data.map(row => {
          const clean = {}
          for (const [key, val] of Object.entries(row)) {
            clean[key.trim().toLowerCase()] = typeof val === 'string' ? val.trim() : val
          }
          return clean
        })

        const parseErrors = (results.errors || [])
          .filter(e => e.type !== 'FieldMismatch')
          .map(e => `Fila ${(e.row || 0) + 2}: ${e.message}`)

        resolve({ data: normalized, errors: parseErrors })
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

  rows.forEach((row, i) => {
    const rowNum = i + 2 // +1 for 0-index, +1 for header
    const rowErrors = []

    // nombre: required
    if (!row.nombre) {
      rowErrors.push('nombre es requerido')
    } else if (row.nombre.length > 200) {
      rowErrors.push('nombre max 200 caracteres')
    }

    // precio: required, positive number
    const precio = parseFloat(row.precio)
    if (!row.precio || isNaN(precio)) {
      rowErrors.push('precio debe ser un numero')
    } else if (precio <= 0) {
      rowErrors.push('precio debe ser mayor a 0')
    }

    // descripcion: optional
    if (row.descripcion && row.descripcion.length > 500) {
      rowErrors.push('descripcion max 500 caracteres')
    }

    // imagen_url: optional, must be http
    if (row.imagen_url && !/^https?:\/\//i.test(row.imagen_url)) {
      rowErrors.push('imagen_url debe empezar con http')
    }

    // disponible: normalize
    let disponible = true
    if (row.disponible !== undefined && row.disponible !== '') {
      const val = String(row.disponible).toLowerCase().trim()
      if (['false', 'no', '0'].includes(val)) disponible = false
      else if (['true', 'si', 'sí', '1'].includes(val)) disponible = true
      else rowErrors.push('disponible debe ser si/no/true/false/1/0')
    }

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
