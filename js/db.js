/**
 * Capa de persistencia local usando IndexedDB nativo con Promesas.
 * Diseñado para ser 100% offline, sin dependencias externas y con cero costo.
 */

const DB_NAME = 'abasto_db';
const DB_VERSION = 1;
const STORE_SALIDAS = 'salidas';

let dbInstance = null;

/**
 * Abre y retorna la conexión a IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está soportado en este entorno.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SALIDAS)) {
        const store = db.createObjectStore(STORE_SALIDAS, { keyPath: 'id' });
        store.createIndex('fecha', 'fecha', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;

      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`Error al abrir IndexedDB: ${event.target.error}`));
    };
  });
}

/**
 * Obtiene todas las salidas guardadas ordenadas por fecha descendente.
 * @returns {Promise<Array<object>>}
 */
export async function getAllSalidas() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SALIDAS], 'readonly');
    const store = tx.objectStore(STORE_SALIDAS);
    const request = store.getAll();

    request.onsuccess = () => {
      const salidas = request.result || [];
      salidas.sort((a, b) => {
        const fechaCmp = (b.fecha || '').localeCompare(a.fecha || '');
        if (fechaCmp !== 0) return fechaCmp;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      resolve(salidas);
    };

    request.onerror = () => {
      reject(new Error(`Error al obtener salidas: ${request.error}`));
    };
  });
}

/**
 * Obtiene una salida específica por su ID.
 * @param {string} id - UUID de la salida
 * @returns {Promise<object|null>}
 */
export async function getSalida(id) {
  if (!id) return null;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SALIDAS], 'readonly');
    const store = tx.objectStore(STORE_SALIDAS);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error(`Error al obtener salida ${id}: ${request.error}`));
    };
  });
}

/**
 * Guarda o actualiza una salida en IndexedDB.
 * Garantiza schemaVersion: 1 y actualiza updatedAt.
 * @param {object} salida - Objeto de salida
 * @returns {Promise<object>} - Salida guardada
 */
export async function saveSalida(salida) {
  if (!salida || !salida.id) {
    throw new Error('La salida debe tener un ID válido.');
  }

  const salidaAGuardar = {
    ...salida,
    schemaVersion: 1,
    updatedAt: Date.now()
  };

  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SALIDAS], 'readwrite');
    const store = tx.objectStore(STORE_SALIDAS);
    const request = store.put(salidaAGuardar);

    request.onsuccess = () => {
      resolve(salidaAGuardar);
    };

    request.onerror = () => {
      reject(new Error(`Error al guardar salida: ${request.error}`));
    };
  });
}

/**
 * Guarda múltiples salidas en una sola transacción atómica.
 * @param {Array<object>} salidas - Lista de salidas
 * @returns {Promise<void>}
 */
export async function saveMultipleSalidas(salidas) {
  if (!Array.isArray(salidas) || salidas.length === 0) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SALIDAS], 'readwrite');
    const store = tx.objectStore(STORE_SALIDAS);

    for (const salida of salidas) {
      if (salida && salida.id) {
        store.put({
          ...salida,
          schemaVersion: 1,
          updatedAt: Date.now()
        });
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Error en transacción masiva: ${tx.error}`));
  });
}

/**
 * Elimina una salida por su ID.
 * @param {string} id - UUID de la salida
 * @returns {Promise<void>}
 */
export async function deleteSalida(id) {
  if (!id) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SALIDAS], 'readwrite');
    const store = tx.objectStore(STORE_SALIDAS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Error al eliminar salida: ${request.error}`));
  });
}

/**
 * Borra todas las salidas (utilizado en 'Reemplazar todo' durante importación).
 * @returns {Promise<void>}
 */
export async function clearAllSalidas() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SALIDAS], 'readwrite');
    const store = tx.objectStore(STORE_SALIDAS);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Error al vaciar almacén: ${request.error}`));
  });
}
