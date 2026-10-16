/**
 * Módulo de interpretación de listas de compras:
 * 1. Intérprete heurístico de texto libre (pegar texto línea por línea).
 * 2. Intérprete de CSV (compatible con Excel y Google Sheets).
 * Siempre entrega datos estructurados listos para vista previa editable.
 */

import { normalizarTexto, normalizarUnidad } from './models.js';

// Lista de unidades conocidas para búsqueda de patrones
const UNIDADES_CONOCIDAS = [
  'caja', 'cajas', 'cja', 'cjas',
  'saco', 'sacos', 'sco',
  'bolsa', 'bolsas', 'bls',
  'balde', 'baldes', 'blde',
  'bidon', 'bidones', 'bidón',
  'jaba', 'jabas',
  'carton', 'cartones', 'cartón',
  'paquete', 'paquetes', 'pqte', 'pqtes',
  'docena', 'docenas', 'doc', 'dz',
  'kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos',
  'unidad', 'unidades', 'und', 'unds', 'unid', 'unids',
  'fardo', 'fardos', 'lata', 'latas',
  'botella', 'botellas', 'bot',
  'plancha', 'planchas', 'tira', 'tiras',
  'litro', 'litros', 'lt', 'lts'
];

/**
 * Interpreta una sola línea de texto libre para extraer cantidad, unidad y nombre de producto.
 * @param {string} linea - Ej. "10 sacos harina Anita" o "Aceite Beltran 2 cajas"
 * @returns {{ producto: string, cantidadPlaneada: number, unidad: string }}
 */
export function interpretarLineaTexto(linea) {
  if (!linea || !linea.trim()) {
    return { producto: '', cantidadPlaneada: 1, unidad: 'unidad' };
  }

  const limpia = linea.trim().replace(/\s+/g, ' ');

  // Patrón 1: Cantidad al inicio (ej. "10 sacos harina Anita", "2.5 kg azucar", "5 fideos")
  const regexInicio = /^([\d]+(?:[.,]\d+)?)\s*(?:([a-zA-ZáéíóúñÁÉÍÓÚÑ]+)\s+)?(.*)$/i;
  const matchInicio = limpia.match(regexInicio);

  if (matchInicio) {
    const rawCant = matchInicio[1].replace(',', '.');
    const cantidad = parseFloat(rawCant) || 1;
    const posibleUnidad = (matchInicio[2] || '').toLowerCase();
    const resto = (matchInicio[3] || '').trim();

    // Verificar si la palabra inmediata tras el número es una unidad conocida
    if (posibleUnidad && UNIDADES_CONOCIDAS.includes(posibleUnidad)) {
      // Limpiar prefijo 'de ' si existe (ej. '10 sacos de harina' -> 'harina')
      const prodSinDe = resto.replace(/^de\s+/i, '').trim();
      return {
        producto: prodSinDe || resto || posibleUnidad,
        cantidadPlaneada: cantidad,
        unidad: normalizarUnidad(posibleUnidad)
      };
    } else {
      // No era unidad, es parte del nombre del producto (ej. "5 fideos don victorio")
      const nombreCompleto = (posibleUnidad ? `${posibleUnidad} ${resto}` : resto).trim();
      return {
        producto: nombreCompleto || 'Producto',
        cantidadPlaneada: cantidad,
        unidad: 'unidad'
      };
    }
  }

  // Patrón 2: Cantidad y unidad al final (ej. "Aceite Beltran 2 cajas", "Arroz costeno 50 kg")
  const regexFinal = /^(.*?)\s+([\d]+(?:[.,]\d+)?)\s*([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+)?$/i;
  const matchFinal = limpia.match(regexFinal);

  if (matchFinal) {
    const posibleProd = matchFinal[1].trim();
    const rawCant = matchFinal[2].replace(',', '.');
    const cantidad = parseFloat(rawCant) || 1;
    const posibleUnidad = (matchFinal[3] || '').toLowerCase();

    if (posibleProd) {
      const unidad = posibleUnidad && UNIDADES_CONOCIDAS.includes(posibleUnidad)
        ? normalizarUnidad(posibleUnidad)
        : (posibleUnidad || 'unidad');

      return {
        producto: posibleProd,
        cantidadPlaneada: cantidad,
        unidad
      };
    }
  }

  // Si no hay número identificable, se asume 1 unidad del texto completo
  return {
    producto: limpia,
    cantidadPlaneada: 1,
    unidad: 'unidad'
  };
}

/**
 * Interpreta un texto multilínea pegado por el usuario.
 * @param {string} texto - Texto con un producto por línea
 * @returns {Array<{ producto: string, cantidadPlaneada: number, unidad: string }>}
 */
export function interpretarTextoCompleto(texto) {
  if (!texto) return [];

  const lineas = texto.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  return lineas.map(linea => interpretarLineaTexto(linea));
}

/**
 * Parsea un archivo o cadena CSV exportada de Excel o Google Sheets.
 * Soporta comas (,), puntos y comas (;) y tabuladores (\t).
 * Detecta automáticamente encabezados en español como producto, cantidad, unidad.
 * @param {string} csvText - Contenido del CSV
 * @returns {Array<{ producto: string, cantidadPlaneada: number, unidad: string }>}
 */
export function parsearCSV(csvText) {
  if (!csvText) return [];

  // Eliminar posible BOM UTF-8 (\uFEFF)
  const limpio = csvText.replace(/^\uFEFF/, '').trim();
  const lineas = limpio.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lineas.length === 0) return [];

  // Detectar delimitador (coma, punto y coma o tabulación) buscando en las primeras líneas
  let delimitador = ',';
  for (const l of lineas.slice(0, 5)) {
    const countComas = (l.match(/,/g) || []).length;
    const countPuntosComas = (l.match(/;/g) || []).length;
    const countTabs = (l.match(/\t/g) || []).length;
    if (countComas > 0 || countPuntosComas > 0 || countTabs > 0) {
      if (countPuntosComas > countComas && countPuntosComas >= countTabs) {
        delimitador = ';';
      } else if (countTabs > countComas && countTabs > countPuntosComas) {
        delimitador = '\t';
      } else {
        delimitador = ',';
      }
      break;
    }
  }

  // Parser básico de línea CSV respetando comillas
  function separarCampos(linea) {
    const campos = [];
    let actual = '';
    let dentroComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];
      if (char === '"') {
        if (dentroComillas && linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          dentroComillas = !dentroComillas;
        }
      } else if (char === delimitador && !dentroComillas) {
        campos.push(actual.trim());
        actual = '';
      } else {
        actual += char;
      }
    }
    campos.push(actual.trim());
    return campos;
  }

  const filas = lineas.map(separarCampos);
  if (filas.length === 0) return [];

  // Buscar la fila de encabezados entre las primeras filas (para tolerar posibles títulos de reporte)
  let idxProd = -1;
  let idxCant = -1;
  let idxUnid = -1;
  let filaCabecera = -1;

  for (let f = 0; f < Math.min(filas.length, 10); f++) {
    const filaNorm = filas[f].map(c => normalizarTexto(c));
    let p = -1;
    let c = -1;
    let u = -1;

    filaNorm.forEach((col, i) => {
      // Ignorar expresamente "estado" o "status" para no confundirlo jamás con el nombre del producto
      if (col === 'estado' || col === 'status') {
        return;
      }

      if (
        col === 'producto' ||
        col === 'articulo' ||
        col === 'item' ||
        col.includes('prod') ||
        col.includes('nombre') ||
        col.includes('descripcion') ||
        col.includes('art') ||
        col.includes('merc') ||
        col.includes('detall')
      ) {
        if (p === -1 || col === 'producto' || col === 'articulo') {
          p = i;
        }
      } else if (
        col === 'cantidad' ||
        col === 'cantidad planeada' ||
        col.includes('cant') ||
        col.includes('qty') ||
        col === 'q'
      ) {
        // Priorizar la columna de cantidad planeada/principal antes que "cantidad comprada"
        if (c === -1 || col === 'cantidad' || col === 'cantidad planeada') {
          c = i;
        }
      } else if (
        col === 'unidad' ||
        col.includes('unid') ||
        col.includes('unit') ||
        col.includes('medida') ||
        col.includes('present') ||
        col === 'um' ||
        col === 'u.m.'
      ) {
        if (u === -1 || col === 'unidad') {
          u = i;
        }
      }
    });

    if (p !== -1 || (c !== -1 && u !== -1)) {
      idxProd = p;
      idxCant = c;
      idxUnid = u;
      filaCabecera = f;
      break;
    }
  }

  let inicioDatos = 0;
  if (filaCabecera !== -1) {
    inicioDatos = filaCabecera + 1;
  } else {
    // No se detectó fila de cabecera: asumir orden estándar col 0: producto, col 1: cantidad, col 2: unidad
    idxProd = 0;
    idxCant = 1;
    idxUnid = 2;
    inicioDatos = 0;
  }

  // Asignar posiciones lógicas si no se especificaron todas
  if (idxProd === -1) idxProd = 0;
  if (idxCant === -1) idxCant = 1;
  if (idxUnid === -1) idxUnid = 2;

  const resultados = [];

  for (let i = inicioDatos; i < filas.length; i++) {
    const fila = filas[i];
    if (fila.length === 0) continue;

    let producto = (fila[idxProd] || '').trim();
    if (!producto) continue;

    const prodNorm = normalizarTexto(producto);

    // Si la celda detectada como producto es la palabra 'producto', 'articulo', o un estado como 'pendiente'/'comprado',
    // verificar si el nombre real del producto está en otra columna disponible
    if (
      prodNorm === 'producto' ||
      prodNorm === 'articulo' ||
      prodNorm === 'descripcion' ||
      prodNorm === 'item' ||
      prodNorm === 'estado' ||
      prodNorm === 'pendiente' ||
      prodNorm === 'comprado'
    ) {
      let prodAlternativo = '';
      for (let colIdx = 0; colIdx < fila.length; colIdx++) {
        if (colIdx !== idxProd && colIdx !== idxCant && colIdx !== idxUnid) {
          const val = (fila[colIdx] || '').trim();
          const valNorm = normalizarTexto(val);
          if (
            val &&
            valNorm !== 'pendiente' &&
            valNorm !== 'comprado' &&
            valNorm !== 'estado' &&
            isNaN(val)
          ) {
            prodAlternativo = val;
            break;
          }
        }
      }

      if (prodAlternativo) {
        producto = prodAlternativo;
      } else {
        // Era una fila de encabezado o metadata sin producto real
        continue;
      }
    }

    const rawCant = (fila[idxCant] || '1').replace(',', '.');
    const cantidadPlaneada = parseFloat(rawCant) || 1;
    const rawUnidad = (fila[idxUnid] || 'unidad').trim();
    const unidad = normalizarUnidad(rawUnidad);

    resultados.push({
      producto,
      cantidadPlaneada,
      unidad
    });
  }

  return resultados;
}

/**
 * Decodifica un ArrayBuffer o Uint8Array detectando automáticamente la codificación:
 * 1. UTF-8 con BOM (EF BB BF)
 * 2. UTF-16 LE con BOM (FF FE)
 * 3. UTF-16 BE con BOM (FE FF)
 * 4. Heurística UTF-16 LE (patrón de bytes nulos intercalados)
 * 5. UTF-8 estándar estricto
 * 6. Windows-1252 / ISO-8859-1 (formato predeterminado de Microsoft Excel en Windows para español)
 * Garantiza que tildes (á, é, í, ó, ú, ü) y la letra ñ se reconozcan 100% perfecto.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function decodificarBufferTexto(buffer) {
  if (!buffer) return '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length === 0) return '';

  // 1. Detectar BOM UTF-8 (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  // 2. Detectar BOM UTF-16 LE (FF FE)
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }

  // 3. Detectar BOM UTF-16 BE (FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  // 4. Heurística UTF-16 LE sin BOM (patrón de bytes nulos en posiciones impares)
  if (bytes.length >= 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
    try {
      return new TextDecoder('utf-16le').decode(bytes);
    } catch (e) {
      // continuar
    }
  }

  // 5. Intentar decodificar como UTF-8 estricto
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    // 6. Si falla, es codificación ANSI / Windows-1252 (estándar de Excel en Windows en español)
    try {
      return new TextDecoder('windows-1252').decode(bytes);
    } catch (e2) {
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
  }
}

