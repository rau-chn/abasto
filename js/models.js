/**
 * Modelos de datos, normalización y cálculos derivados de Abasto.
 */

import { calcularSubtotalCentimos, sumarCentimos, calcularDiferenciaCentimos } from './money.js';

/**
 * Tabla cerrada de equivalencias para normalización de unidades de compra.
 * Agrupa singulares, plurales y abreviaturas comunes en mercados peruanos.
 * No utiliza reglas heurísticas de singularización automática ni fonética.
 */
const TABLA_EQUIVALENCIAS_UNIDADES = {
  // caja
  'caja': 'caja',
  'cajas': 'caja',
  'cja': 'caja',
  'cjas': 'caja',

  // saco
  'saco': 'saco',
  'sacos': 'saco',
  'sco': 'saco',

  // bolsa
  'bolsa': 'bolsa',
  'bolsas': 'bolsa',
  'bls': 'bolsa',

  // balde
  'balde': 'balde',
  'baldes': 'balde',
  'blde': 'balde',

  // bidón
  'bidon': 'bidón',
  'bidones': 'bidón',
  'bidón': 'bidón',

  // jaba
  'jaba': 'jaba',
  'jabas': 'jaba',

  // cartón
  'carton': 'cartón',
  'cartones': 'cartón',
  'cartón': 'cartón',

  // paquete
  'paquete': 'paquete',
  'paquetes': 'paquete',
  'pqte': 'paquete',
  'pqtes': 'paquete',

  // docena
  'docena': 'docena',
  'docenas': 'docena',
  'doc': 'docena',
  'dz': 'docena',

  // kg
  'kg': 'kg',
  'kgs': 'kg',
  'kilo': 'kg',
  'kilos': 'kg',
  'kilogramo': 'kg',
  'kilogramos': 'kg',

  // unidad
  'unidad': 'unidad',
  'unidades': 'unidad',
  'und': 'unidad',
  'unds': 'unidad',
  'unid': 'unidad',
  'unids': 'unidad',
  'uni': 'unidad',
  'u': 'unidad',

  // Otros frecuentes de bodega
  'fardo': 'fardo',
  'fardos': 'fardo',
  'lata': 'lata',
  'latas': 'lata',
  'botella': 'botella',
  'botellas': 'botella',
  'bot': 'botella',
  'plancha': 'plancha',
  'planchas': 'plancha',
  'tira': 'tira',
  'tiras': 'tira',
  'litro': 'litro',
  'litros': 'litro',
  'lt': 'litro',
  'lts': 'litro',
  'atado': 'atado',
  'atados': 'atado',
  'malla': 'malla',
  'mallas': 'malla'
};

/**
 * Normaliza una cadena de texto eliminando solo:
 * - Mayúsculas
 * - Tildes y signos diacríticos
 * - Espacios redundantes en extremos e intermedios
 * No realiza normalización fonética.
 * @param {string} str - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
export function normalizarTexto(str) {
  if (!str) return '';
  return str
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza la unidad de compra utilizando exclusivamente la tabla cerrada de equivalencias.
 * Si la unidad no está en la tabla, conserva el texto limpio en minúsculas sin alterar.
 * @param {string} unidad - Unidad a normalizar
 * @returns {string} - Unidad normalizada
 */
export function normalizarUnidad(unidad) {
  if (!unidad) return 'unidad';
  const clave = normalizarTexto(unidad);
  if (TABLA_EQUIVALENCIAS_UNIDADES[clave]) {
    return TABLA_EQUIVALENCIAS_UNIDADES[clave];
  }
  return clave;
}

/**
 * Genera un UUID v4 usando crypto.randomUUID() o fallback compatible.
 * @returns {string}
 */
export function crearId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Crea una nueva salida de compra.
 * @param {string} [nombre=''] - Nombre opcional (ej. "Compra lunes")
 * @param {string} [fecha=null] - Fecha ISO YYYY-MM-DD
 * @returns {object}
 */
export function crearSalida(nombre = '', fecha = null) {
  const hoy = new Date().toISOString().split('T')[0];
  const now = Date.now();
  return {
    id: crearId(),
    schemaVersion: 1,
    fecha: fecha || hoy,
    nombre: (nombre || '').trim(),
    createdAt: now,
    updatedAt: now,
    stands: [],
    listaPlanificada: [],
    gastos: []
  };
}

/**
 * Crea un nuevo stand dentro de una salida.
 * @param {string} nombre - Nombre del stand (ej. "Puesto 12 - Don Lucho")
 * @param {string} [direccion=''] - Dirección en texto libre
 * @param {string} [notas=''] - Notas opcionales
 * @param {string|null} [comprobante=null] - Imagen en Base64 o URL del comprobante/boleta
 * @returns {object}
 */
export function crearStand(nombre, direccion = '', notas = '', comprobante = null) {
  return {
    id: crearId(),
    nombre: (nombre || '').trim(),
    direccion: (direccion || '').trim(),
    notas: (notas || '').trim(),
    ubicacion: null, // { lat: number, lng: number, timestamp: number } (sin mapsUrl guardado)
    totalPagadoRealCentimos: null,
    comprobante: comprobante || null,
    lineas: []
  };
}

/**
 * Crea una línea de compra.
 * @param {string} producto - Nombre del producto
 * @param {number} cantidad - Cantidad adquirida
 * @param {string} unidad - Unidad de compra (caja, saco, etc.)
 * @param {number} precioUnitarioCentimos - Precio por unidad en céntimos
 * @param {string|null} [listaItemId=null] - ID opcional de la lista planificada
 * @returns {object}
 */
export function crearLinea(producto, cantidad, unidad, precioUnitarioCentimos, listaItemId = null) {
  const cant = typeof cantidad === 'number' ? cantidad : parseFloat(cantidad) || 0;
  const precio = Math.round(Number(precioUnitarioCentimos) || 0);
  const unidadLimpia = (unidad || '').trim() || 'unidad';
  return {
    id: crearId(),
    producto: (producto || '').trim(),
    cantidad: cant,
    unidad: unidadLimpia,
    precioUnitarioCentimos: precio,
    subtotalCentimos: calcularSubtotalCentimos(cant, precio),
    listaItemId: listaItemId || null
  };
}

/**
 * Crea un ítem de la lista planificada.
 * NOTA: NO almacena el booleano 'comprado'; se deriva dinámicamente de las líneas existentes.
 * @param {string} producto - Nombre del producto planeado
 * @param {number} cantidadPlaneada - Cantidad estimada a comprar
 * @param {string} [unidad=''] - Unidad sugerida
 * @returns {object}
 */
export function crearItemPlanificado(producto, cantidadPlaneada, unidad = '') {
  return {
    id: crearId(),
    producto: (producto || '').trim(),
    cantidadPlaneada: Number(cantidadPlaneada) || 0,
    unidad: (unidad || '').trim()
  };
}

/**
 * Crea un gasto operativo o viático de la salida (pasajes, comida, estibador, flete, etc.).
 * @param {string} descripcion - Descripción del gasto
 * @param {number} montoCentimos - Monto en céntimos
 * @param {string} [categoria='otro'] - Categoría (pasajes, comida, estibador, flete, cochera, otro)
 * @returns {object}
 */
export function crearGasto(descripcion, montoCentimos, categoria = 'otro') {
  return {
    id: crearId(),
    descripcion: (descripcion || '').trim(),
    montoCentimos: Math.round(Number(montoCentimos) || 0),
    categoria: (categoria || 'otro').trim()
  };
}

/**
 * Calcula los totales de un stand.
 * @param {object} stand - Stand a evaluar
 * @returns {{ totalCalculadoCentimos: number, totalEfectivoCentimos: number, diferenciaCentimos: number, tienePagadoReal: boolean }}
 */
export function calcularTotalesStand(stand) {
  if (!stand) {
    return {
      totalCalculadoCentimos: 0,
      totalEfectivoCentimos: 0,
      diferenciaCentimos: 0,
      tienePagadoReal: false
    };
  }

  const lineas = Array.isArray(stand.lineas) ? stand.lineas : [];
  const totalCalculadoCentimos = sumarCentimos(lineas.map(l => l.subtotalCentimos || 0));

  const tienePagadoReal = stand.totalPagadoRealCentimos !== null &&
                          stand.totalPagadoRealCentimos !== undefined &&
                          !isNaN(stand.totalPagadoRealCentimos);

  const totalEfectivoCentimos = tienePagadoReal
    ? Math.round(Number(stand.totalPagadoRealCentimos))
    : totalCalculadoCentimos;

  const diferenciaCentimos = tienePagadoReal
    ? calcularDiferenciaCentimos(totalEfectivoCentimos, totalCalculadoCentimos)
    : 0;

  return {
    totalCalculadoCentimos,
    totalEfectivoCentimos,
    diferenciaCentimos,
    tienePagadoReal
  };
}

/**
 * Calcula los totales acumulados de una salida.
 * Regla: usa el 'total pagado real' del stand si existe; si no, el calculado.
 * Muestra siempre la diferencia neta.
 * @param {object} salida - Salida a evaluar
 * @returns {{ totalCalculadoCentimos: number, totalEfectivoCentimos: number, diferenciaCentimos: number, totalStands: number, totalLineas: number, totalGastosCentimos: number, granTotalCentimos: number }}
 */
export function calcularTotalesSalida(salida) {
  if (!salida) {
    return {
      totalCalculadoCentimos: 0,
      totalEfectivoCentimos: 0,
      diferenciaCentimos: 0,
      totalStands: 0,
      totalLineas: 0,
      totalGastosCentimos: 0,
      granTotalCentimos: 0
    };
  }

  const stands = Array.isArray(salida.stands) ? salida.stands : [];
  let totalCalculadoCentimos = 0;
  let totalEfectivoCentimos = 0;
  let diferenciaCentimos = 0;
  let totalLineas = 0;

  for (const stand of stands) {
    const totalesStand = calcularTotalesStand(stand);
    totalCalculadoCentimos += totalesStand.totalCalculadoCentimos;
    totalEfectivoCentimos += totalesStand.totalEfectivoCentimos;
    diferenciaCentimos += totalesStand.diferenciaCentimos;
    totalLineas += (stand.lineas || []).length;
  }

  const gastos = Array.isArray(salida.gastos) ? salida.gastos : [];
  const totalGastosCentimos = sumarCentimos(gastos.map(g => g.montoCentimos || 0));
  const granTotalCentimos = sumarCentimos([totalEfectivoCentimos, totalGastosCentimos]);

  return {
    totalCalculadoCentimos,
    totalEfectivoCentimos,
    diferenciaCentimos,
    totalStands: stands.length,
    totalLineas,
    totalGastosCentimos,
    granTotalCentimos
  };
}

/**
 * Deduce en memoria el catálogo de autocompletado a partir de todas las salidas guardadas.
 * No requiere una store separada en IndexedDB.
 * Aprende unidades personalizadas escritas por el usuario además de los botones rápidos estándar.
 * @param {object[]} salidas - Lista completa de salidas guardadas
 * @returns {{ productos: Array<{ nombre: string, ultimaUnidad: string, ultimoPrecioCentimos: number, frecuencia: number }>, stands: Array<{ nombre: string, direccion: string, frecuencia: number }>, unidades: string[] }}
 */
export function deducirCatalogo(salidas) {
  const mapaProductos = new Map();
  const mapaStands = new Map();
  const conteoUnidades = new Map();

  // Lista oficial de botones rápidos: caja, saco, bolsa, balde, bidón, jaba, cartón, paquete, docena, kg, unidad
  const botonesRapidos = [
    'caja', 'saco', 'bolsa', 'balde', 'bidón', 'jaba',
    'cartón', 'paquete', 'docena', 'kg', 'unidad'
  ];

  for (const u of botonesRapidos) {
    conteoUnidades.set(normalizarUnidad(u), 100); // Prioridad alta a los rápidos
  }

  if (Array.isArray(salidas)) {
    // Procesar de más antigua a más reciente para que lo último sobreescriba "último precio"
    const salidasOrdenadas = [...salidas].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const salida of salidasOrdenadas) {
      if (!Array.isArray(salida.stands)) continue;

      for (const stand of salida.stands) {
        if (stand.nombre) {
          const keyStand = normalizarTexto(stand.nombre);
          if (keyStand) {
            const actual = mapaStands.get(keyStand) || {
              nombre: stand.nombre,
              direccion: stand.direccion || '',
              frecuencia: 0
            };
            actual.nombre = stand.nombre;
            if (stand.direccion) actual.direccion = stand.direccion;
            actual.frecuencia++;
            mapaStands.set(keyStand, actual);
          }
        }

        if (Array.isArray(stand.lineas)) {
          for (const linea of stand.lineas) {
            if (!linea.producto) continue;
            const keyProd = normalizarTexto(linea.producto);
            if (!keyProd) continue;

            const actualProd = mapaProductos.get(keyProd) || {
              nombre: linea.producto,
              ultimaUnidad: linea.unidad || '',
              ultimoPrecioCentimos: linea.precioUnitarioCentimos || 0,
              frecuencia: 0
            };

            actualProd.nombre = linea.producto;
            if (linea.unidad) actualProd.ultimaUnidad = linea.unidad;
            if (linea.precioUnitarioCentimos) actualProd.ultimoPrecioCentimos = linea.precioUnitarioCentimos;
            actualProd.frecuencia++;
            mapaProductos.set(keyProd, actualProd);

            if (linea.unidad) {
              const uNorm = normalizarUnidad(linea.unidad);
              conteoUnidades.set(uNorm, (conteoUnidades.get(uNorm) || 0) + 1);
            }
          }
        }
      }
    }
  }

  const productos = Array.from(mapaProductos.values())
    .sort((a, b) => b.frecuencia - a.frecuencia);

  const stands = Array.from(mapaStands.values())
    .sort((a, b) => b.frecuencia - a.frecuencia);

  // Unidades aprendidas del historial manteniendo orden por frecuencia
  const unidades = Array.from(conteoUnidades.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([u]) => u);

  return { productos, stands, unidades };
}

/**
 * Agrupa todas las líneas de compra de una salida por producto + unidad normalizada.
 * REGLA ESTRICTA: Jamás mezclar unidades distintas (caja vs bolsa) en un mismo promedio o total.
 * @param {object} salida - Salida de compras
 * @returns {Array<object>} - Lista de grupos ordenable con estadísticas completas
 */
export function agruparPorProductoYUnidad(salida) {
  if (!salida || !Array.isArray(salida.stands)) {
    return [];
  }

  const grupos = new Map();

  for (const stand of salida.stands) {
    if (!Array.isArray(stand.lineas)) continue;

    for (const linea of stand.lineas) {
      if (!linea.producto) continue;

      const prodNorm = normalizarTexto(linea.producto);
      const unidNorm = normalizarUnidad(linea.unidad);
      const groupKey = `${prodNorm}:::${unidNorm}`;

      let grupo = grupos.get(groupKey);
      if (!grupo) {
        grupo = {
          clave: groupKey,
          productoNombre: linea.producto, // Nombre representativo
          productoNorm: prodNorm,
          unidad: unidNorm,               // Unidad normalizada canónica
          cantidadTotal: 0,
          totalGastadoCentimos: 0,
          compras: []
        };
        grupos.set(groupKey, grupo);
      }

      const cantidad = typeof linea.cantidad === 'number' ? linea.cantidad : parseFloat(linea.cantidad) || 0;
      const subtotalCentimos = Number(linea.subtotalCentimos) || 0;
      const precioUnitarioCentimos = Number(linea.precioUnitarioCentimos) || 0;

      grupo.cantidadTotal += cantidad;
      grupo.totalGastadoCentimos += subtotalCentimos;
      grupo.compras.push({
        standId: stand.id,
        standNombre: stand.nombre || 'Stand sin nombre',
        standDireccion: stand.direccion || '',
        cantidad,
        precioUnitarioCentimos,
        subtotalCentimos
      });
    }
  }

  const resultado = [];

  for (const grupo of grupos.values()) {
    if (grupo.cantidadTotal <= 0 || grupo.compras.length === 0) continue;

    // Redondear cantidad total para evitar problemas de coma flotante en decimales (ej. 2.5 + 2.5)
    grupo.cantidadTotal = Number(grupo.cantidadTotal.toFixed(3));

    // Precio promedio ponderado: total gastado ÷ cantidad total
    const precioPromedioCentimos = Math.round(grupo.totalGastadoCentimos / grupo.cantidadTotal);

    // Mínimo y Máximo precio unitario
    let precioMinimoCentimos = Infinity;
    let precioMaximoCentimos = -Infinity;

    for (const c of grupo.compras) {
      if (c.precioUnitarioCentimos < precioMinimoCentimos) {
        precioMinimoCentimos = c.precioUnitarioCentimos;
      }
      if (c.precioUnitarioCentimos > precioMaximoCentimos) {
        precioMaximoCentimos = c.precioUnitarioCentimos;
      }
    }

    // Stands donde se obtuvo el precio mínimo más barato
    const comprasMasBaratas = grupo.compras.filter(c => c.precioUnitarioCentimos === precioMinimoCentimos);
    const standsMasBaratos = Array.from(new Set(comprasMasBaratas.map(c => c.standNombre)));

    resultado.push({
      clave: grupo.clave,
      productoNombre: grupo.productoNombre,
      productoNorm: grupo.productoNorm,
      unidad: grupo.unidad,
      cantidadTotal: grupo.cantidadTotal,
      totalGastadoCentimos: grupo.totalGastadoCentimos,
      precioPromedioCentimos,
      precioMinimoCentimos,
      precioMaximoCentimos,
      standsMasBaratos,
      compras: grupo.compras
    });
  }

  return resultado;
}

/**
 * Deriva el estado de la lista planificada de una salida (si un ítem fue comprado o no).
 * Requisito: Se deriva de la existencia de líneas con listaItemId.
 * @param {object} salida - Salida que contiene listaPlanificada y stands
 * @returns {Array<object>} - Ítems enriquecidos con comprado, cantidadComprada y lineas
 */
export function derivarEstadoLista(salida) {
  if (!salida || !Array.isArray(salida.listaPlanificada)) {
    return [];
  }

  const todasLasLineas = [];
  if (Array.isArray(salida.stands)) {
    for (const stand of salida.stands) {
      if (Array.isArray(stand.lineas)) {
        for (const linea of stand.lineas) {
          todasLasLineas.push({ ...linea, standNombre: stand.nombre });
        }
      }
    }
  }

  return salida.listaPlanificada.map(item => {
    const normProdItem = normalizarTexto(item.producto);
    const normUnidItem = normalizarUnidad(item.unidad);

    const lineasAsociadas = todasLasLineas.filter(l => {
      if (l.listaItemId && l.listaItemId === item.id) return true;
      if (!l.listaItemId && normProdItem && normalizarTexto(l.producto) === normProdItem) {
        if (!normUnidItem || normalizarUnidad(l.unidad) === normUnidItem) {
          return true;
        }
      }
      return false;
    });

    const cantidadComprada = lineasAsociadas.reduce((acc, l) => acc + (l.cantidad || 0), 0);
    const comprado = lineasAsociadas.length > 0;

    return {
      ...item,
      comprado,
      cantidadComprada,
      lineasAsociadas
    };
  });
}
