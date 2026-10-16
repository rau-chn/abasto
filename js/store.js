/**
 * Store simple basado en el patrón Pub/Sub.
 * Sin dependencias ni estado reactivo complejo.
 * Se encarga del estado en memoria y sincronización con IndexedDB.
 */

import * as db from './db.js';
import { deducirCatalogo, crearSalida, crearStand, crearLinea, crearItemPlanificado, crearGasto } from './models.js';

const state = {
  salidas: [],
  currentSalidaId: null,
  currentStandId: null,
  catalogo: { productos: [], stands: [], unidades: [] },
  isStoragePersisted: false,
  hasUpdateAvailable: false,
  waitingWorker: null
};

const listeners = new Set();

/**
 * Suscribe una función para escuchar cambios en el estado.
 * @param {Function} listener - Callback (state) => void
 * @returns {Function} - Función para desuscribirse
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notifica a todos los suscriptores.
 */
export function notify() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (e) {
      console.error('Error en listener de store:', e);
    }
  }
}

/**
 * Retorna una copia superficial del estado actual.
 */
export function getState() {
  return state;
}

/**
 * Recalcula el catálogo en memoria a partir de las salidas actuales.
 */
function refrescarCatalogo() {
  state.catalogo = deducirCatalogo(state.salidas);
}

/**
 * Inicializa el store cargando las salidas desde IndexedDB.
 */
export async function initStore() {
  try {
    state.salidas = await db.getAllSalidas();
    refrescarCatalogo();
    notify();
  } catch (err) {
    console.error('Error al inicializar el store desde IndexedDB:', err);
  }
}

/**
 * Retorna la salida actualmente activa o null.
 */
export function getCurrentSalida() {
  if (!state.currentSalidaId) return null;
  return state.salidas.find(s => s.id === state.currentSalidaId) || null;
}

/**
 * Retorna el stand actualmente activo o null.
 */
export function getCurrentStand() {
  const salida = getCurrentSalida();
  if (!salida || !state.currentStandId) return null;
  return (salida.stands || []).find(st => st.id === state.currentStandId) || null;
}

/**
 * Establece los identificadores de contexto activo.
 */
export function setContext(salidaId = null, standId = null) {
  state.currentSalidaId = salidaId;
  state.currentStandId = standId;
  notify();
}

/**
 * Marca la persistencia del almacenamiento del navegador.
 */
export function setStoragePersisted(persisted) {
  state.isStoragePersisted = Boolean(persisted);
  notify();
}

/**
 * Registra que hay una nueva versión del Service Worker esperando ser activada.
 */
export function setUpdateAvailable(hasUpdate, worker = null) {
  state.hasUpdateAvailable = hasUpdate;
  state.waitingWorker = worker;
  notify();
}

/**
 * Crea una nueva salida y la guarda de inmediato.
 * @param {string} nombre
 * @param {string} fecha
 * @returns {Promise<object>}
 */
export async function crearSalidaAction(nombre = '', fecha = null) {
  const nuevaSalida = crearSalida(nombre, fecha);
  await db.saveSalida(nuevaSalida);
  state.salidas.unshift(nuevaSalida);
  state.currentSalidaId = nuevaSalida.id;
  refrescarCatalogo();
  notify();
  return nuevaSalida;
}

/**
 * Elimina una salida por su ID.
 * @param {string} id
 */
export async function eliminarSalidaAction(id) {
  await db.deleteSalida(id);
  state.salidas = state.salidas.filter(s => s.id !== id);
  if (state.currentSalidaId === id) {
    state.currentSalidaId = null;
    state.currentStandId = null;
  }
  refrescarCatalogo();
  notify();
}

/**
 * Actualiza una salida completa y la persiste.
 * @param {object} salida
 */
export async function actualizarSalidaAction(salida) {
  await db.saveSalida(salida);
  const idx = state.salidas.findIndex(s => s.id === salida.id);
  if (idx !== -1) {
    state.salidas[idx] = salida;
  } else {
    state.salidas.unshift(salida);
  }
  refrescarCatalogo();
  notify();
}

/**
 * Agrega un nuevo stand a la salida activa.
 * @param {string} salidaId
 * @param {string} nombre
 * @param {string} direccion
 * @param {string} notas
 * @returns {Promise<object>}
 */
export async function agregarStandAction(salidaId, nombre, direccion = '', notas = '') {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) throw new Error('Salida no encontrada');

  const nuevoStand = crearStand(nombre, direccion, notas);
  if (!Array.isArray(salida.stands)) salida.stands = [];
  salida.stands.push(nuevoStand);

  await db.saveSalida(salida);
  refrescarCatalogo();
  notify();
  return nuevoStand;
}

/**
 * Actualiza los datos de un stand (nombre, dirección, notas, ubicación, totalPagadoRealCentimos).
 * @param {string} salidaId
 * @param {object} standModificado
 */
export async function actualizarStandAction(salidaId, standModificado) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) throw new Error('Salida no encontrada');

  const idx = salida.stands.findIndex(st => st.id === standModificado.id);
  if (idx === -1) throw new Error('Stand no encontrado');

  salida.stands[idx] = standModificado;
  await db.saveSalida(salida);
  refrescarCatalogo();
  notify();
}

/**
 * Elimina un stand de una salida.
 * @param {string} salidaId
 * @param {string} standId
 */
export async function eliminarStandAction(salidaId, standId) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  salida.stands = (salida.stands || []).filter(st => st.id !== standId);
  if (state.currentStandId === standId) {
    state.currentStandId = null;
  }

  await db.saveSalida(salida);
  refrescarCatalogo();
  notify();
}

/**
 * Agrega una línea de compra a un stand y autoguarda al instante.
 * @param {string} salidaId
 * @param {string} standId
 * @param {object} lineaData - { producto, cantidad, unidad, precioUnitarioCentimos, listaItemId }
 * @returns {Promise<object>}
 */
export async function agregarLineaAction(salidaId, standId, lineaData) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) throw new Error('Salida no encontrada');

  const stand = (salida.stands || []).find(st => st.id === standId);
  if (!stand) throw new Error('Stand no encontrado');

  const nuevaLinea = crearLinea(
    lineaData.producto,
    lineaData.cantidad,
    lineaData.unidad,
    lineaData.precioUnitarioCentimos,
    lineaData.listaItemId
  );

  if (!Array.isArray(stand.lineas)) stand.lineas = [];
  stand.lineas.push(nuevaLinea);

  await db.saveSalida(salida);
  refrescarCatalogo();
  notify();
  return nuevaLinea;
}

/**
 * Actualiza una línea de compra existente dentro de un stand.
 * @param {string} salidaId
 * @param {string} standId
 * @param {object} lineaModificada
 */
export async function actualizarLineaAction(salidaId, standId, lineaModificada) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  const stand = (salida.stands || []).find(st => st.id === standId);
  if (!stand) return;

  const idx = (stand.lineas || []).findIndex(l => l.id === lineaModificada.id);
  if (idx !== -1) {
    stand.lineas[idx] = lineaModificada;
    await db.saveSalida(salida);
    refrescarCatalogo();
    notify();
  }
}

/**
 * Elimina una línea de compra de un stand.
 * @param {string} salidaId
 * @param {string} standId
 * @param {string} lineaId
 */
export async function eliminarLineaAction(salidaId, standId, lineaId) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  const stand = (salida.stands || []).find(st => st.id === standId);
  if (!stand) return;

  stand.lineas = (stand.lineas || []).filter(l => l.id !== lineaId);
  await db.saveSalida(salida);
  refrescarCatalogo();
  notify();
}

/**
 * Reemplaza la lista completa de salidas (usado en importación o reset).
 * @param {Array<object>} nuevasSalidas
 */
export async function setSalidasAction(nuevasSalidas) {
  state.salidas = nuevasSalidas;
  refrescarCatalogo();
  notify();
}

/**
 * Importa un conjunto de salidas persistiendo en IndexedDB con modo 'reemplazar' o 'combinar'.
 * @param {Array<object>} salidasImportadas
 * @param {'reemplazar'|'combinar'} modo
 */
export async function importarRespaldoAction(salidasImportadas, modo) {
  if (!Array.isArray(salidasImportadas)) return;

  if (modo === 'reemplazar') {
    await db.clearAllSalidas();
    await db.saveMultipleSalidas(salidasImportadas);
    state.salidas = await db.getAllSalidas();
  } else {
    // Combinar por ID
    const mapa = new Map();
    for (const actual of state.salidas) {
      if (actual && actual.id) mapa.set(actual.id, actual);
    }
    for (const imp of salidasImportadas) {
      if (imp && imp.id) {
        const exist = mapa.get(imp.id);
        if (!exist) {
          mapa.set(imp.id, imp);
        } else {
          const timeExist = exist.updatedAt || exist.createdAt || 0;
          const timeImp = imp.updatedAt || imp.createdAt || 0;
          if (timeImp >= timeExist) {
            mapa.set(imp.id, imp);
          }
        }
      }
    }
    const combinadas = Array.from(mapa.values());
    await db.saveMultipleSalidas(combinadas);
    state.salidas = await db.getAllSalidas();
  }

  refrescarCatalogo();
  notify();
}

/**
 * Agrega un producto a la lista planificada de una salida.
 * @param {string} salidaId
 * @param {string} producto
 * @param {number} cantidadPlaneada
 * @param {string} unidad
 * @returns {Promise<object>}
 */
export async function agregarItemPlanificadoAction(salidaId, producto, cantidadPlaneada, unidad = '') {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) throw new Error('Salida no encontrada');

  const nuevoItem = crearItemPlanificado(producto, cantidadPlaneada, unidad);
  if (!Array.isArray(salida.listaPlanificada)) salida.listaPlanificada = [];
  salida.listaPlanificada.push(nuevoItem);

  await db.saveSalida(salida);
  notify();
  return nuevoItem;
}

/**
 * Agrega múltiples productos a la lista planificada en lote.
 * @param {string} salidaId
 * @param {Array<{ producto: string, cantidadPlaneada: number, unidad: string }>} items
 */
export async function agregarMultiplesItemsPlanificadosAction(salidaId, items) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) throw new Error('Salida no encontrada');

  if (!Array.isArray(salida.listaPlanificada)) salida.listaPlanificada = [];

  for (const item of items) {
    if (item.producto && item.producto.trim()) {
      salida.listaPlanificada.push(crearItemPlanificado(item.producto, item.cantidadPlaneada, item.unidad));
    }
  }

  await db.saveSalida(salida);
  notify();
}

/**
 * Actualiza un producto de la lista planificada.
 * @param {string} salidaId
 * @param {object} itemModificado
 */
export async function actualizarItemPlanificadoAction(salidaId, itemModificado) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  const idx = (salida.listaPlanificada || []).findIndex(i => i.id === itemModificado.id);
  if (idx !== -1) {
    salida.listaPlanificada[idx] = itemModificado;
    await db.saveSalida(salida);
    notify();
  }
}

/**
 * Elimina un producto de la lista planificada.
 * @param {string} salidaId
 * @param {string} itemId
 */
export async function eliminarItemPlanificadoAction(salidaId, itemId) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  salida.listaPlanificada = (salida.listaPlanificada || []).filter(i => i.id !== itemId);
  await db.saveSalida(salida);
  notify();
}

/**
 * Vacía la lista planificada de una salida.
 * @param {string} salidaId
 */
export async function limpiarListaPlanificadaAction(salidaId) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  salida.listaPlanificada = [];
  await db.saveSalida(salida);
  notify();
}

/**
 * Agrega un gasto operativo o viático a una salida.
 * @param {string} salidaId
 * @param {{ descripcion: string, montoCentimos: number, categoria?: string }} gastoData
 * @returns {Promise<object>}
 */
export async function agregarGastoAction(salidaId, gastoData) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) throw new Error('Salida no encontrada');

  const nuevoGasto = crearGasto(gastoData.descripcion, gastoData.montoCentimos, gastoData.categoria);
  if (!Array.isArray(salida.gastos)) salida.gastos = [];
  salida.gastos.push(nuevoGasto);

  await db.saveSalida(salida);
  notify();
  return nuevoGasto;
}

/**
 * Actualiza un gasto existente en una salida.
 * @param {string} salidaId
 * @param {object} gastoModificado
 */
export async function actualizarGastoAction(salidaId, gastoModificado) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  if (!Array.isArray(salida.gastos)) salida.gastos = [];
  const idx = salida.gastos.findIndex(g => g.id === gastoModificado.id);
  if (idx !== -1) {
    salida.gastos[idx] = gastoModificado;
    await db.saveSalida(salida);
    notify();
  }
}

/**
 * Elimina un gasto de una salida.
 * @param {string} salidaId
 * @param {string} gastoId
 */
export async function eliminarGastoAction(salidaId, gastoId) {
  const salida = state.salidas.find(s => s.id === salidaId);
  if (!salida) return;

  salida.gastos = (salida.gastos || []).filter(g => g.id !== gastoId);
  await db.saveSalida(salida);
  notify();
}

