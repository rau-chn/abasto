/**
 * Módulo de Exportación, Importación y Respaldo para Abasto.
 * 1. Respaldo JSON completo (exportar e importar con schemaVersion).
 * 2. Modos de importación: 'Reemplazar todo' o 'Combinar por id'.
 * 3. Exportación de resumen a CSV compatible con Excel (UTF-8 con BOM).
 * 4. Compartir resumen por WhatsApp (Web Share API con fallback).
 */

import {
  calcularTotalesStand,
  calcularTotalesSalida,
  agruparPorProductoYUnidad,
  derivarEstadoLista
} from './models.js';
import { centimosToSoles, formatMoney, describirDiferencia } from './money.js';

/**
 * Escapa un valor para formatearlo como celda CSV estándar.
 * @param {string|number} valor
 * @returns {string}
 */
function escaparCSV(valor) {
  if (valor === null || valor === undefined) return '""';
  const str = String(valor);
  if (str.includes('"') || str.includes(',') || str.includes(';') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Dispara la descarga de un archivo de texto en el navegador del usuario.
 * @param {string} nombreArchivo
 * @param {string} contenido
 * @param {string} mimeType
 */
export function descargarArchivo(nombreArchivo, contenido, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([contenido], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Genera el objeto de respaldo JSON estándar con schemaVersion: 1.
 * @param {Array<object>} salidas
 * @returns {string}
 */
export function generarJSONRespaldo(salidas) {
  const payload = {
    app: 'Abasto',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    totalSalidas: Array.isArray(salidas) ? salidas.length : 0,
    salidas: Array.isArray(salidas) ? salidas : []
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Exporta y descarga el archivo de respaldo JSON completo.
 * Nombre requerido: abasto-respaldo-AAAA-MM-DD.json
 * @param {Array<object>} salidas
 * @returns {string} - Nombre del archivo generado
 */
export function exportarJSONRespaldo(salidas) {
  const hoy = new Date().toISOString().split('T')[0];
  const nombreArchivo = `abasto-respaldo-${hoy}.json`;
  const jsonStr = generarJSONRespaldo(salidas);

  descargarArchivo(nombreArchivo, jsonStr, 'application/json;charset=utf-8');

  // Registrar fecha de último respaldo exitoso
  try {
    localStorage.setItem('abasto_last_backup', Date.now().toString());
  } catch (e) {
    // ignorar restricciones de localStorage si las hay
  }

  return nombreArchivo;
}

/**
 * Valida la estructura y versión del esquema de un archivo de respaldo JSON.
 * @param {string} jsonStr
 * @returns {{ ok: boolean, data?: { schemaVersion: number, exportedAt: string, salidas: Array<object> }, error?: string }}
 */
export function validarJSONRespaldo(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    return { ok: false, error: 'El archivo está vacío o el formato no es válido.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { ok: false, error: 'El archivo no contiene un JSON válido: ' + err.message };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'El contenido del respaldo debe ser un objeto JSON.' };
  }

  if (parsed.schemaVersion !== 1) {
    return {
      ok: false,
      error: `Versión de esquema no soportada (schemaVersion: ${parsed.schemaVersion || 'desconocida'}). Se requiere schemaVersion: 1.`
    };
  }

  if (!Array.isArray(parsed.salidas)) {
    return { ok: false, error: 'El respaldo no contiene un arreglo de salidas válido.' };
  }

  return {
    ok: true,
    data: {
      schemaVersion: parsed.schemaVersion,
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      salidas: parsed.salidas
    }
  };
}

/**
 * Aplica la importación según el modo elegido ('reemplazar' o 'combinar').
 * @param {Array<object>} salidasImportadas
 * @param {'reemplazar'|'combinar'} modo
 * @param {Array<object>} salidasActuales
 * @returns {Array<object>} - Lista consolidada de salidas
 */
export function procesarImportacionSalidas(salidasImportadas, modo, salidasActuales = []) {
  if (!Array.isArray(salidasImportadas)) return salidasActuales;

  if (modo === 'reemplazar') {
    return [...salidasImportadas];
  }

  // Modo 'combinar por id':
  // Si la salida ya existe en el dispositivo, se conserva la versión más recientemente actualizada
  // Si es nueva, se agrega
  const mapa = new Map();

  for (const actual of salidasActuales) {
    if (actual && actual.id) {
      mapa.set(actual.id, actual);
    }
  }

  for (const importada of salidasImportadas) {
    if (importada && importada.id) {
      const existente = mapa.get(importada.id);
      if (!existente) {
        mapa.set(importada.id, importada);
      } else {
        const timeExistente = existente.updatedAt || existente.createdAt || 0;
        const timeImportada = importada.updatedAt || importada.createdAt || 0;
        if (timeImportada >= timeExistente) {
          mapa.set(importada.id, importada);
        }
      }
    }
  }

  const consolidado = Array.from(mapa.values());
  // Ordenar por fecha desc
  consolidado.sort((a, b) => {
    const fechaCmp = (b.fecha || '').localeCompare(a.fecha || '');
    if (fechaCmp !== 0) return fechaCmp;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return consolidado;
}

/**
 * Genera el texto CSV completo del resumen de una salida.
 * Incluye BOM UTF-8 (\uFEFF) para visualización sin fallas en Excel.
 * @param {object} salida
 * @returns {string}
 */
export function generarCSVResumen(salida) {
  if (!salida) return '';

  const totales = calcularTotalesSalida(salida);
  const stands = Array.isArray(salida.stands) ? salida.stands : [];
  const grupos = agruparPorProductoYUnidad(salida);

  const lineasCSV = [];

  // BOM UTF-8 indispensable para Excel en Windows
  const BOM = '\uFEFF';

  // --- SECCIÓN 1: CABECERA Y METADATOS ---
  lineasCSV.push('REPORTE DE COMPRA - ABASTO');
  lineasCSV.push(`Fecha,${escaparCSV(salida.fecha || '')}`);
  lineasCSV.push(`Nombre de Compra,${escaparCSV(salida.nombre || 'Sin nombre')}`);
  lineasCSV.push(`Total Stands,${escaparCSV(totales.totalStands)}`);
  lineasCSV.push(`Total Líneas Compradas,${escaparCSV(totales.totalLineas)}`);
  lineasCSV.push(`Total Calculado (S/),${escaparCSV(centimosToSoles(totales.totalCalculadoCentimos))}`);
  lineasCSV.push(`Total Pagado Real (S/),${escaparCSV(centimosToSoles(totales.totalEfectivoCentimos))}`);
  lineasCSV.push(`Diferencia Neta (S/),${escaparCSV(centimosToSoles(totales.diferenciaCentimos))}`);
  if (totales.totalGastosCentimos > 0) {
    lineasCSV.push(`Total Viáticos / Gastos (S/),${escaparCSV(centimosToSoles(totales.totalGastosCentimos))}`);
    lineasCSV.push(`Costo Total Real Salida (S/),${escaparCSV(centimosToSoles(totales.granTotalCentimos))}`);
  }
  lineasCSV.push(''); // Fila vacía

  // --- SECCIÓN 2: RESUMEN POR STAND ---
  lineasCSV.push('--- RESUMEN POR STAND ---');
  lineasCSV.push('Stand,Dirección,Notas,Total Calculado (S/),Total Pagado Real (S/),Diferencia (S/)');
  for (const st of stands) {
    const tSt = calcularTotalesStand(st);
    const pagadoReal = tSt.tienePagadoReal ? centimosToSoles(tSt.totalEfectivoCentimos) : 'N/A';
    lineasCSV.push([
      escaparCSV(st.nombre || 'Stand sin nombre'),
      escaparCSV(st.direccion || ''),
      escaparCSV(st.notas || ''),
      escaparCSV(centimosToSoles(tSt.totalCalculadoCentimos)),
      escaparCSV(pagadoReal),
      escaparCSV(centimosToSoles(tSt.diferenciaCentimos))
    ].join(','));
  }
  lineasCSV.push(''); // Fila vacía

  // --- SECCIÓN 3: GASTOS PERSONALES Y VIÁTICOS (SI EXISTEN) ---
  const gastos = Array.isArray(salida.gastos) ? salida.gastos : [];
  if (gastos.length > 0) {
    lineasCSV.push('--- GASTOS PERSONALES Y VIÁTICOS ---');
    lineasCSV.push('Categoría,Descripción,Monto (S/)');
    for (const g of gastos) {
      lineasCSV.push([
        escaparCSV(g.categoria || 'otro'),
        escaparCSV(g.descripcion || ''),
        escaparCSV(centimosToSoles(g.montoCentimos))
      ].join(','));
    }
    lineasCSV.push(''); // Fila vacía
  }

  // --- SECCIÓN 4: LISTADO GENERAL POR PRODUCTO (CONSOLIDADO) ---
  lineasCSV.push('--- LISTADO GENERAL POR PRODUCTO (CONSOLIDADO) ---');
  lineasCSV.push('Producto,Unidad,Cantidad Total,Precio Promedio Ponderado (S/),Precio Mínimo (S/),Precio Máximo (S/),Stand(s) Más Barato(s),Total Gastado (S/)');
  for (const g of grupos) {
    lineasCSV.push([
      escaparCSV(g.productoNombre),
      escaparCSV(g.unidad),
      escaparCSV(g.cantidadTotal),
      escaparCSV(centimosToSoles(g.precioPromedioCentimos)),
      escaparCSV(centimosToSoles(g.precioMinimoCentimos)),
      escaparCSV(centimosToSoles(g.precioMaximoCentimos)),
      escaparCSV(g.standsMasBaratos.join('; ')),
      escaparCSV(centimosToSoles(g.totalGastadoCentimos))
    ].join(','));
  }
  lineasCSV.push(''); // Fila vacía

  // --- SECCIÓN 5: DETALLE COMPLETO DE LÍNEAS DE COMPRA ---
  lineasCSV.push('--- DETALLE DE LÍNEAS DE COMPRA ---');
  lineasCSV.push('Stand,Producto,Cantidad,Unidad,Precio Unitario (S/),Subtotal (S/)');
  for (const st of stands) {
    for (const l of (st.lineas || [])) {
      lineasCSV.push([
        escaparCSV(st.nombre || 'Stand sin nombre'),
        escaparCSV(l.producto),
        escaparCSV(l.cantidad),
        escaparCSV(l.unidad || 'unidad'),
        escaparCSV(centimosToSoles(l.precioUnitarioCentimos)),
        escaparCSV(centimosToSoles(l.subtotalCentimos))
      ].join(','));
    }
  }

  return BOM + lineasCSV.join('\r\n');
}

/**
 * Exporta y descarga el archivo CSV del resumen de una salida.
 * Nombre requerido: abasto-resumen-AAAA-MM-DD.csv
 * @param {object} salida
 * @returns {string} - Nombre del archivo generado
 */
export function exportarCSVResumen(salida) {
  if (!salida) return '';
  const fecha = salida.fecha || new Date().toISOString().split('T')[0];
  const nombreArchivo = `abasto-resumen-${fecha}.csv`;
  const csvContent = generarCSVResumen(salida);

  descargarArchivo(nombreArchivo, csvContent, 'text/csv;charset=utf-8');
  return nombreArchivo;
}

/**
 * Genera el texto formateado para compartir el resumen por WhatsApp o portapapeles.
 * @param {object} salida
 * @returns {string}
 */
export function generarTextoWhatsAppResumen(salida) {
  if (!salida) return '';

  const totales = calcularTotalesSalida(salida);
  const descDiff = describirDiferencia(totales.diferenciaCentimos);
  const stands = Array.isArray(salida.stands) ? salida.stands : [];
  const grupos = agruparPorProductoYUnidad(salida);

  let texto = `*📦 ABASTO - RESUMEN DE COMPRA*\n`;
  texto += `📅 Fecha: ${salida.fecha || 'Hoy'}\n`;
  if (salida.nombre) texto += `📝 Salida: ${salida.nombre}\n`;
  texto += `🏪 Stands visitados: ${totales.totalStands}\n`;
  texto += `💰 Total Mercadería: *${formatMoney(totales.totalEfectivoCentimos)}*\n`;
  if (totales.totalGastosCentimos > 0) {
    texto += `🛵 Viáticos / Gastos: ${formatMoney(totales.totalGastosCentimos)}\n`;
    texto += `🏁 Costo Total Real: *${formatMoney(totales.granTotalCentimos)}*\n`;
  }
  if (totales.diferenciaCentimos !== 0) {
    texto += `⚖️ Diferencia vs lista: ${descDiff.textoLargo}\n`;
  }
  texto += `\n*🛒 PRODUCTOS COMPRADOS:*\n`;

  for (const g of grupos) {
    texto += `• *${g.productoNombre}* (${g.cantidadTotal} ${g.unidad}): Prom: ${formatMoney(g.precioPromedioCentimos)} | Mín: ${formatMoney(g.precioMinimoCentimos)} (${g.standsMasBaratos.join(', ')}) | Total: ${formatMoney(g.totalGastadoCentimos)}\n`;
  }

  texto += `\n*🏬 TOTAL POR STAND:*\n`;
  for (const st of stands) {
    const tSt = calcularTotalesStand(st);
    texto += `• *${st.nombre || 'Stand'}*: ${formatMoney(tSt.totalEfectivoCentimos)}`;
    if (st.direccion) texto += ` (${st.direccion})`;
    if (tSt.diferenciaCentimos !== 0) {
      const d = describirDiferencia(tSt.diferenciaCentimos);
      texto += ` [${d.signo}${formatMoney(Math.abs(tSt.diferenciaCentimos))}]`;
    }
    texto += `\n`;
  }

  const gastos = Array.isArray(salida.gastos) ? salida.gastos : [];
  if (gastos.length > 0) {
    texto += `\n*🛵 GASTOS Y VIÁTICOS:*\n`;
    for (const g of gastos) {
      texto += `• ${g.descripcion || g.categoria}: ${formatMoney(g.montoCentimos)}\n`;
    }
  }

  texto += `\n_Generado automáticamente con Abasto Bodega_`;
  return texto;
}

/**
 * Comparte el resumen mediante Web Share API o redirige a WhatsApp.
 * @param {object} salida
 * @returns {Promise<boolean>}
 */
export async function compartirResumenWhatsApp(salida) {
  const texto = generarTextoWhatsAppResumen(salida);
  const titulo = `Resumen de Compra - ${salida.nombre || salida.fecha || 'Abasto'}`;

  // 1. Probar Web Share API si está soportada (móviles Android, iOS)
  if (navigator.share) {
    try {
      await navigator.share({
        title: titulo,
        text: texto
      });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        return false; // El usuario canceló compartir
      }
      // Si falla por permisos u otro motivo, continuar al fallback
    }
  }

  // 2. Fallback: Enlace directo a WhatsApp Web / App
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
  return true;
}

/**
 * Verifica si es necesario mostrar un recordatorio de respaldo (> 7 días sin respaldar).
 * @param {number} totalSalidas
 * @returns {boolean}
 */
export function necesitaRecordatorioRespaldo(totalSalidas) {
  if (totalSalidas === 0) return false;
  const lastBackupStr = localStorage.getItem('abasto_last_backup');
  if (!lastBackupStr) return true; // Nunca ha respaldado y ya tiene salidas

  const lastBackup = parseInt(lastBackupStr, 10);
  if (isNaN(lastBackup)) return true;

  const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
  return (Date.now() - lastBackup) > SIETE_DIAS_MS;
}

/**
 * Genera el texto CSV completo de la lista de compras planificada.
 * Incluye BOM UTF-8 (\uFEFF) para visualización sin caracteres extraños en Excel.
 * @param {object} salida
 * @param {boolean} [soloPendientes=false]
 * @returns {string}
 */
export function generarCSVListaPlanificada(salida, soloPendientes = false) {
  if (!salida) return '';

  const itemsEnriquecidos = derivarEstadoLista(salida);
  const items = soloPendientes
    ? itemsEnriquecidos.filter(i => !i.comprado)
    : itemsEnriquecidos;

  const BOM = '\uFEFF';
  const lineasCSV = [];

  lineasCSV.push('LISTA DE COMPRAS - ABASTO');
  lineasCSV.push(`Fecha,${escaparCSV(salida.fecha || '')}`);
  lineasCSV.push(`Salida,${escaparCSV(salida.nombre || 'Compra')}`);
  lineasCSV.push(`Alcance,${escaparCSV(soloPendientes ? 'Solo Pendientes por comprar' : 'Lista Completa')}`);
  lineasCSV.push(`Total Ítems en este reporte,${escaparCSV(items.length)}`);
  lineasCSV.push('');

  lineasCSV.push('Estado,Cantidad Planeada,Unidad,Producto,Cantidad Comprada,Puesto(s) de Compra');

  for (const item of items) {
    const estado = item.comprado ? 'COMPRADO' : 'PENDIENTE';
    const cantPlaneada = item.cantidadPlaneada;
    const unidad = item.unidad || 'unidad';
    const prod = item.producto;
    const cantComprada = item.cantidadComprada || 0;
    const standsComprados = (item.lineasAsociadas || [])
      .map(l => l.standNombre)
      .filter(Boolean);
    const standsStr = Array.from(new Set(standsComprados)).join('; ');

    lineasCSV.push([
      escaparCSV(estado),
      escaparCSV(cantPlaneada),
      escaparCSV(unidad),
      escaparCSV(prod),
      escaparCSV(cantComprada),
      escaparCSV(standsStr)
    ].join(','));
  }

  return BOM + lineasCSV.join('\r\n');
}

/**
 * Descarga el archivo CSV de la lista de compras para Excel.
 * @param {object} salida
 * @param {boolean} [soloPendientes=false]
 * @returns {string} - Nombre del archivo generado
 */
export function exportarCSVListaPlanificada(salida, soloPendientes = false) {
  if (!salida) return '';
  const fecha = salida.fecha || new Date().toISOString().split('T')[0];
  const sufijo = soloPendientes ? 'pendientes' : 'completa';
  const nombreArchivo = `abasto-lista-${sufijo}-${fecha}.csv`;
  const csvContent = generarCSVListaPlanificada(salida, soloPendientes);

  descargarArchivo(nombreArchivo, csvContent, 'text/csv;charset=utf-8');
  return nombreArchivo;
}

/**
 * Genera el texto formateado de la lista de compras para compartir por WhatsApp o notas.
 * @param {object} salida
 * @param {boolean} [soloPendientes=false]
 * @returns {string}
 */
export function generarTextoWhatsAppLista(salida, soloPendientes = false) {
  if (!salida) return '';

  const items = derivarEstadoLista(salida);
  const pendientes = items.filter(i => !i.comprado);
  const comprados = items.filter(i => i.comprado);

  let texto = `*📋 ABASTO - LISTA DE COMPRAS*\n`;
  texto += `📅 Fecha: ${salida.fecha || 'Hoy'}\n`;
  if (salida.nombre) texto += `📝 Salida: ${salida.nombre}\n`;
  texto += `📊 Total: ${items.length} ítems (${pendientes.length} pendientes, ${comprados.length} comprados)\n\n`;

  if (pendientes.length > 0) {
    texto += `*⏳ PENDIENTES POR COMPRAR (${pendientes.length}):*\n`;
    pendientes.forEach((p, idx) => {
      texto += `${idx + 1}. [ ] *${p.cantidadPlaneada} ${p.unidad || 'unidad'}* - ${p.producto}\n`;
    });
  } else {
    texto += `🎉 *¡Todo comprado! No tienes productos pendientes.*\n`;
  }

  if (!soloPendientes && comprados.length > 0) {
    texto += `\n*✅ YA COMPRADOS (${comprados.length}):*\n`;
    comprados.forEach((c, idx) => {
      texto += `${idx + 1}. [✓] *${c.cantidadPlaneada} ${c.unidad || 'unidad'}* - ${c.producto} (Adquirido: ${c.cantidadComprada} ${c.unidad || 'unidad'})\n`;
    });
  }

  texto += `\n_Generado automáticamente con Abasto Bodega_`;
  return texto;
}

/**
 * Comparte la lista de compras mediante Web Share API o WhatsApp.
 * @param {object} salida
 * @param {boolean} [soloPendientes=false]
 * @returns {Promise<boolean>}
 */
export async function compartirListaWhatsApp(salida, soloPendientes = false) {
  const texto = generarTextoWhatsAppLista(salida, soloPendientes);
  const titulo = `Lista de Compras - ${salida.nombre || salida.fecha || 'Abasto'}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: titulo,
        text: texto
      });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
  return true;
}

/**
 * Copia un texto al portapapeles de forma compatible en PC y móvil.
 * @param {string} texto
 * @returns {Promise<boolean>}
 */
export async function copiarTextoPortapapeles(texto) {
  if (!texto) return false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      // Continuar con fallback
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = texto;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch (err) {
    document.body.removeChild(textArea);
    return false;
  }
}
