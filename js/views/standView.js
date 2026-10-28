/**
 * Vista de Stand: Registro ultra-rápido de líneas de compra, sugerencias, GPS y cálculo en tiempo real.
 */

import {
  getState,
  actualizarStandAction,
  agregarLineaAction,
  actualizarLineaAction,
  eliminarLineaAction
} from '../store.js';
import {
  calcularTotalesStand,
  normalizarTexto,
  derivarEstadoLista,
  obtenerComprobantesStand
} from '../models.js';
import {
  formatMoney,
  solesToCentimos,
  centimosToSoles,
  calcularSubtotalCentimos,
  describirDiferencia
} from '../money.js';
import { compartirStandWhatsApp } from '../export.js';

/**
 * Comprime una imagen a JPEG utilizando HTML5 Canvas nativo.
 * Reduce resolución manteniendo proporción a un máximo de 1200px y calidad ~75%.
 * Esto reduce una foto de cámara de 5-10 MB a unos 80-150 KB para no saturar IndexedDB ni los respaldos JSON.
 * @param {File} file
 * @param {number} [maxDim=1200]
 * @param {number} [calidad=0.75]
 * @returns {Promise<string>} Data URL base64
 */
export function comprimirImagen(file, maxDim = 1200, calidad = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('El archivo seleccionado no es una imagen válida.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Error al cargar la imagen.'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('No se pudo inicializar el procesador gráfico.'));
        }

        // Fondo blanco para evitar fondos negros si era PNG transparente
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const dataUrl = canvas.toDataURL('image/jpeg', calidad);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function renderStandView(container, salidaId, standId) {
  const state = getState();
  const salida = (state.salidas || []).find(s => s.id === salidaId);
  const stand = (salida?.stands || []).find(st => st.id === standId);

  if (!salida || !stand) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <h3>Stand no encontrado</h3>
        <p style="margin-top: 8px; color: var(--color-text-dim);">Es posible que haya sido eliminado.</p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.location.hash='#salida/${salidaId}'">
          Volver a la Salida
        </button>
      </div>
    `;
    return;
  }

  const totalesStand = calcularTotalesStand(stand);
  const descDiff = describirDiferencia(totalesStand.diferenciaCentimos);
  const catalogo = state.catalogo || { productos: [], stands: [], unidades: [] };
  const lineas = Array.isArray(stand.lineas) ? stand.lineas : [];
  const itemsPendientes = derivarEstadoLista(salida).filter(i => !i.comprado);
  const comprobantes = obtenerComprobantesStand(stand);
  const tieneComprobantes = comprobantes.length > 0;

  const html = `
    <!-- Encabezado del Stand -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button id="btn-volver-salida" class="btn btn-outline" style="min-height: 40px; padding: 6px 12px; font-size: 0.9rem;">
        ◀ Volver
      </button>
      <div style="text-align: center; flex: 1; min-width: 0;">
        <span style="font-size: 0.75rem; color: var(--color-text-dim); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(salida.nombre || 'Compra')}
        </span>
        <h2 style="font-size: 1.15rem; font-weight: 800; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(stand.nombre)}
        </h2>
      </div>
      <button id="btn-whatsapp-stand" class="btn btn-outline" style="min-height: 40px; padding: 6px 10px; font-size: 0.85rem; color: #16a34a; border-color: #16a34a; font-weight: 700; white-space: nowrap;" title="Compartir compra de este stand por WhatsApp">
        📲 WhatsApp
      </button>
    </div>

    <!-- Tarjeta de Datos y GPS del Stand -->
    <div class="card" style="padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <div style="flex: 1;">
          <input type="text" id="input-stand-nombre" class="form-input" value="${escapeHtml(stand.nombre)}" placeholder="Nombre del stand" style="font-weight: 700; margin-bottom: 6px;" />
          <input type="text" id="input-stand-direccion" class="form-input" value="${escapeHtml(stand.direccion || '')}" placeholder="Dirección / puesto (ej. Pasaje 2)" style="font-size: 0.9rem; margin-bottom: 6px;" />
          <input type="text" id="input-stand-notas" class="form-input" value="${escapeHtml(stand.notas || '')}" placeholder="Notas opcionales..." style="font-size: 0.85rem;" />
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-border);">
        <button id="btn-guardar-gps" class="btn btn-outline" style="min-height: 36px; padding: 4px 10px; font-size: 0.85rem;">
          📍 ${stand.ubicacion ? 'Actualizar GPS' : 'Guardar ubicación GPS'}
        </button>

        ${stand.ubicacion ? `
          <a href="https://www.google.com/maps?q=${stand.ubicacion.lat},${stand.ubicacion.lng}" target="_blank" rel="noopener noreferrer" style="font-size: 0.85rem; color: var(--color-primary); font-weight: 700; text-decoration: underline;">
            Ver en Google Maps ↗
          </a>
        ` : `
          <span style="font-size: 0.8rem; color: var(--color-text-dim);">Sin GPS</span>
        `}
      </div>
    </div>

    <!-- Tarjeta de Comprobantes / Boletas del Stand (Soporte de múltiples fotos) -->
    <div class="card" style="padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <h3 style="font-size: 0.95rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">
            🧾 Boletas / Comprobantes
          </h3>
          <span style="font-size: 0.8rem; color: var(--color-text-dim);">
            (${comprobantes.length})
          </span>
        </div>
        ${tieneComprobantes ? `
          <span class="badge badge-success" style="font-size: 0.75rem;">
            ${comprobantes.length === 1 ? '1 foto' : `${comprobantes.length} fotos`}
          </span>
        ` : `
          <span style="font-size: 0.8rem; color: var(--color-text-dim);">Opcional</span>
        `}
      </div>

      <!-- Inputs ocultos para captura por cámara o archivo múltiple -->
      <input type="file" id="input-camara-comprobante" accept="image/*" capture="environment" style="display: none;" />
      <input type="file" id="input-archivo-comprobante" accept="image/*" multiple style="display: none;" />

      <div id="comprobante-estado" style="display: none; padding: 8px; margin-bottom: 8px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 700; background: var(--color-warning-bg); color: var(--color-warning); text-align: center;">
      </div>

      ${tieneComprobantes ? `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <!-- Tira horizontal deslizable con miniaturas de comprobantes -->
          <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; -webkit-overflow-scrolling: touch; align-items: center;">
            ${comprobantes.map((foto, idx) => `
              <div style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid var(--color-border); flex-shrink: 0; background: #000; box-shadow: var(--shadow-sm);">
                <img
                  src="${foto}"
                  alt="Comprobante ${idx + 1}"
                  class="btn-abrir-visor-foto"
                  data-foto-idx="${idx}"
                  style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;"
                  title="Toca para ampliar foto #${idx + 1}"
                />
                <span style="position: absolute; bottom: 2px; left: 2px; background: rgba(0,0,0,0.7); color: #fff; font-size: 0.7rem; font-weight: 800; padding: 1px 5px; border-radius: 3px; pointer-events: none;">
                  #${idx + 1}
                </span>
                <button
                  type="button"
                  class="btn-eliminar-foto-individual"
                  data-foto-idx="${idx}"
                  title="Eliminar esta foto #${idx + 1}"
                  style="position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; background: rgba(220,38,38,0.9); color: #fff; border: none; border-radius: 50%; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;"
                >✕</button>
              </div>
            `).join('')}

            <!-- Botón de acceso rápido para agregar más a la tira -->
            <button
              type="button"
              id="btn-tira-agregar-mas"
              class="btn btn-outline"
              style="width: 80px; height: 80px; border: 2px dashed var(--color-border); border-radius: var(--radius-sm); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; flex-shrink: 0; background: var(--color-surface); cursor: pointer;"
              title="Agregar más fotos de boletas"
            >
              <span style="font-size: 1.3rem; line-height: 1;">➕</span>
              <span style="font-size: 0.7rem; font-weight: 700; color: var(--color-text-dim);">Agregar</span>
            </button>
          </div>

          <!-- Acciones para tomar otra o seleccionar más archivos -->
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" id="btn-cambiar-camara" class="btn btn-outline" style="min-height: 38px; padding: 4px 10px; font-size: 0.82rem; flex: 1; font-weight: 700; white-space: nowrap;" title="Tomar otra foto con la cámara">
              📷 Tomar otra foto
            </button>
            <button type="button" id="btn-cambiar-archivo" class="btn btn-outline" style="min-height: 38px; padding: 4px 10px; font-size: 0.82rem; flex: 1; font-weight: 700; white-space: nowrap;" title="Elegir más fotos de tu dispositivo">
              📁 Elegir archivo(s)
            </button>
            <button type="button" id="btn-abrir-visor-principal" class="btn btn-outline" style="min-height: 38px; padding: 4px 10px; font-size: 0.82rem; font-weight: 700; white-space: nowrap;" title="Ver fotos en pantalla completa">
              🔍 Ver visor
            </button>
          </div>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <p style="font-size: 0.85rem; color: var(--color-text-dim);">
            Toma foto a las boletas, facturas o tickets para tener respaldo visual (puedes subir 1, 2, 3 o más).
          </p>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-tomar-foto" class="btn btn-outline" style="flex: 1; min-height: 42px; font-size: 0.9rem; font-weight: 700;">
              📷 Tomar foto
            </button>
            <button type="button" id="btn-subir-archivo" class="btn btn-outline" style="flex: 1; min-height: 42px; font-size: 0.9rem; font-weight: 700;">
              📁 Elegir archivo(s)
            </button>
          </div>
        </div>
      `}
    </div>

    <!-- Formulario Rápido: AGREGAR PRODUCTO (Optimizado para 1 mano y < 1 minuto) -->
    <div class="card" style="border: 2px solid var(--color-primary); background-color: var(--color-surface);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 1rem; font-weight: 800; color: var(--color-primary); text-transform: uppercase;">
          ➕ Registrar Producto
        </h3>
        <span id="preview-subtotal" style="font-size: 1.15rem; font-weight: 800; color: var(--color-primary);">
          S/ 0.00
        </span>
      </div>

      <!-- Atajo y buscador de la lista planificada -->
      ${itemsPendientes.length > 0 ? `
        <div style="background-color: var(--color-warning-bg); border: 1.5px solid var(--color-warning); border-radius: var(--radius-sm); padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.8rem; font-weight: 800; color: var(--color-warning); text-transform: uppercase;">
              📋 De tu lista (${itemsPendientes.length} pendientes)
            </span>
            <span style="font-size: 0.75rem; color: var(--color-text-dim);">Toca para autollenar</span>
          </div>

          <!-- Botón Buscador Principal para abrir el selector -->
          <button
            type="button"
            id="btn-abrir-selector-pendientes"
            class="btn btn-outline"
            style="width: 100%; min-height: 44px; background: var(--color-surface); font-size: 0.9rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1.5px solid var(--color-warning); box-shadow: var(--shadow-sm);"
          >
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.1rem;">🔍</span>
              <span style="color: var(--color-text);">Buscar en los ${itemsPendientes.length} pendientes...</span>
            </span>
            <span style="color: var(--color-warning); font-size: 1.2rem; font-weight: 800;">▾</span>
          </button>

          <!-- Atajos rápidos horizontales -->
          <div style="display: flex; gap: 6px; align-items: center; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-dim); white-space: nowrap;">Atajos:</span>
            ${itemsPendientes.slice(0, 5).map(item => `
              <button
                type="button"
                class="btn btn-outline btn-item-plan-chip"
                data-item-id="${item.id}"
                data-item-nombre="${escapeHtml(item.producto)}"
                data-item-cant="${item.cantidadPlaneada}"
                data-item-unid="${escapeHtml(item.unidad || 'unidad')}"
                style="min-height: 30px; padding: 2px 8px; font-size: 0.78rem; background: var(--color-surface); white-space: nowrap; flex-shrink: 0;"
              >
                ${escapeHtml(item.producto)} (${item.cantidadPlaneada} ${escapeHtml(item.unidad || 'und')})
              </button>
            `).join('')}
            ${itemsPendientes.length > 5 ? `
              <button
                type="button"
                id="btn-ver-mas-pendientes"
                class="btn btn-outline"
                style="min-height: 30px; padding: 2px 8px; font-size: 0.78rem; background: var(--color-surface); color: var(--color-primary); font-weight: 800; white-space: nowrap; flex-shrink: 0;"
              >
                +${itemsPendientes.length - 5} más ➔
              </button>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <div id="indicador-enlace-plan" style="display: none; align-items: center; justify-content: space-between; background: var(--color-success-bg); color: var(--color-success); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 700;">
        <span id="texto-enlace-plan">✓ Enlazado a lista</span>
        <button type="button" id="btn-desvincular-plan" style="background: transparent; border: none; color: var(--color-danger); cursor: pointer; font-weight: 800; font-size: 1rem;">✕</button>
      </div>

      <!-- Nombre del producto con autocompletado del catálogo -->
      <div class="form-group">
        <label class="form-label" for="input-prod-nombre">Producto *</label>
        <input type="text" id="input-prod-nombre" class="form-input" placeholder="Ej. Aceite Beltrán" list="catalogo-productos" autocomplete="off" autofocus />
        <datalist id="catalogo-productos">
          ${catalogo.productos.map(p => `
            <option value="${escapeHtml(p.nombre)}">${p.ultimaUnidad ? `${escapeHtml(p.ultimaUnidad)} - ${formatMoney(p.ultimoPrecioCentimos)}` : ''}</option>
          `).join('')}
        </datalist>
      </div>

      <!-- Fila: Cantidad, Unidad, Precio Unitario -->
      <div class="linea-form-grid-3">
        <div class="form-group">
          <label class="form-label" for="input-prod-cantidad">Cant. *</label>
          <input type="number" id="input-prod-cantidad" class="form-input input-money" step="any" min="0.01" value="1" inputmode="decimal" />
        </div>

        <div class="form-group">
          <label class="form-label" for="input-prod-unidad">Unidad *</label>
          <div class="dropdown-wrapper">
            <div class="dropdown-input-group">
              <input
                type="text"
                id="input-prod-unidad"
                class="form-input"
                placeholder="caja"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
              />
              <button
                type="button"
                id="btn-toggle-unidades"
                class="dropdown-toggle-btn"
                title="Mostrar todas las unidades"
                aria-label="Desplegar unidades"
              >
                ▼
              </button>
            </div>
            <div id="menu-unidades" class="dropdown-menu" style="display: none;"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="input-prod-precio">P. Unit (S/) *</label>
          <input type="number" id="input-prod-precio" class="form-input input-money" step="0.01" min="0" placeholder="0.00" inputmode="decimal" />
        </div>
      </div>

      <!-- Chips de unidades frecuentes de compra para un solo toque -->
      <div style="display: flex; gap: 6px; overflow-x: auto; padding: 4px 0; -webkit-overflow-scrolling: touch;">
        ${['caja', 'saco', 'bolsa', 'balde', 'bidón', 'jaba', 'cartón', 'paquete', 'docena', 'kg', 'unidad'].map(u => `
          <button type="button" class="btn btn-outline btn-chip-unidad" data-unidad="${u}" style="min-height: 34px; padding: 2px 10px; font-size: 0.85rem; border-radius: 999px; white-space: nowrap; flex-shrink: 0;">
            ${u}
          </button>
        `).join('')}
      </div>

      <button id="btn-agregar-linea" class="btn btn-primary btn-lg" style="font-weight: 800; margin-top: 4px;">
        ➕ AGREGAR LÍNEA (Enter)
      </button>
    </div>

    <!-- Lista de Líneas Compradas en este Stand -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 1rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">
          Productos en este Stand (${lineas.length})
        </h3>
        <span style="font-size: 0.85rem; color: var(--color-text-dim);">
          Suma: ${formatMoney(totalesStand.totalCalculadoCentimos)}
        </span>
      </div>

      ${lineas.length === 0 ? `
        <div style="text-align: center; padding: 24px 8px; color: var(--color-text-dim);">
          <p>No has registrado productos en este stand aún.</p>
          <p style="font-size: 0.85rem; margin-top: 4px;">Usa el formulario arriba para agregar el primero.</p>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column;">
          ${lineas.map(linea => `
            <div class="linea-item" data-linea-id="${linea.id}">
              <div class="linea-info">
                <span class="linea-titulo">${escapeHtml(linea.producto)}</span>
                <span class="linea-detalle">
                  ${linea.cantidad} ${escapeHtml(linea.unidad)} × ${formatMoney(linea.precioUnitarioCentimos)} c/u
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="linea-subtotal">${formatMoney(linea.subtotalCentimos)}</span>
                <button class="btn btn-outline btn-icon" style="min-height: 36px; width: 36px;" data-action="editar-linea" data-id="${linea.id}" title="Editar">
                  ✏️
                </button>
                <button class="btn btn-danger-outline btn-icon" style="min-height: 36px; width: 36px;" data-action="eliminar-linea" data-id="${linea.id}" title="Eliminar">
                  🗑️
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Tarjeta de Cuadre: Total Calculado vs Total Pagado Real -->
    <div class="card" style="background-color: var(--color-surface-hover);">
      <h3 style="font-size: 1rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">
        Ajuste y Pago del Stand
      </h3>

      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-size: 0.95rem; color: var(--color-text-muted);">Suma calculada de productos:</span>
        <span style="font-size: 1.15rem; font-weight: 800;">${formatMoney(totalesStand.totalCalculadoCentimos)}</span>
      </div>

      <div class="form-group" style="margin-top: 4px;">
        <label class="form-label" for="input-total-pagado-real">
          Total pagado real (opcional si hubo descuento o redondeo)
        </label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input
            type="number"
            id="input-total-pagado-real"
            class="form-input input-money"
            step="0.01"
            min="0"
            placeholder="${centimosToSoles(totalesStand.totalCalculadoCentimos)}"
            value="${stand.totalPagadoRealCentimos !== null && stand.totalPagadoRealCentimos !== undefined ? centimosToSoles(stand.totalPagadoRealCentimos) : ''}"
            inputmode="decimal"
          />
          <button id="btn-limpiar-pagado-real" class="btn btn-outline" style="min-height: 48px; padding: 0 12px; font-size: 0.85rem;" title="Usar suma exacta calculada">
            Exacto
          </button>
        </div>
      </div>

      ${totalesStand.tienePagadoReal ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--color-border);">
          <span style="font-size: 0.9rem; font-weight: 700; color: var(--color-text-muted);">Diferencia (casero):</span>
          <span class="badge ${descDiff.tipo === 'descuento' ? 'badge-success' : 'badge-warning'}" style="font-size: 0.9rem;">
            ${descDiff.texto}
          </span>
        </div>
      ` : ''}
    </div>

    <!-- Barra flotante fija inferior con Total Efectivo del Stand -->
    <div class="bottom-total-bar">
      <div class="bottom-total-inner">
        <div class="total-display-group">
          <span class="total-label">Total de este Stand</span>
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span class="total-amount">${formatMoney(totalesStand.totalEfectivoCentimos)}</span>
            ${totalesStand.tienePagadoReal && totalesStand.diferenciaCentimos !== 0 ? `
              <span class="badge ${descDiff.tipo === 'descuento' ? 'badge-success' : 'badge-warning'}">
                ${descDiff.montoStr}
              </span>
            ` : ''}
          </div>
        </div>

        <button id="btn-finalizar-stand" class="btn btn-primary" style="padding: 10px 16px;">
          ✓ Listo
        </button>
      </div>
    </div>

    <!-- Modal para Editar Línea -->
    <div id="modal-editar-linea" class="modal-overlay" style="display: none;">
      <div class="modal-content" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Editar Producto</h3>
          <button id="btn-cerrar-modal-linea" class="btn-icon">✕</button>
        </div>

        <input type="hidden" id="edit-linea-id" />

        <div class="form-group">
          <label class="form-label" for="edit-prod-nombre">Producto</label>
          <input type="text" id="edit-prod-nombre" class="form-input" />
        </div>

        <div class="linea-form-grid-3">
          <div class="form-group">
            <label class="form-label" for="edit-prod-cantidad">Cantidad</label>
            <input type="number" id="edit-prod-cantidad" class="form-input input-money" step="any" min="0.01" inputmode="decimal" />
          </div>

          <div class="form-group">
            <label class="form-label" for="edit-prod-unidad">Unidad</label>
            <input type="text" id="edit-prod-unidad" class="form-input" />
          </div>

          <div class="form-group">
            <label class="form-label" for="edit-prod-precio">P. Unit (S/)</label>
            <input type="number" id="edit-prod-precio" class="form-input input-money" step="0.01" min="0" inputmode="decimal" />
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 10px;">
          <button id="btn-cancelar-edit-linea" class="btn btn-outline">Cancelar</button>
          <button id="btn-guardar-edit-linea" class="btn btn-primary">Guardar Cambios</button>
        </div>
      </div>
    </div>

    <!-- Modal Visor de Comprobante / Boleta en pantalla completa con navegación múltiple -->
    <div id="modal-visor-comprobante" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 600px; padding: 14px; max-height: 95vh; display: flex; flex-direction: column;" onclick="event.stopPropagation();">
        <div class="modal-header" style="margin-bottom: 8px;">
          <div>
            <h3 class="modal-title" style="font-size: 1.1rem;">Comprobante de compra</h3>
            <span id="visor-indicador-cuenta" style="font-size: 0.8rem; color: var(--color-text-dim);">
              ${escapeHtml(stand.nombre)} ${comprobantes.length > 0 ? `· Foto 1 de ${comprobantes.length}` : ''}
            </span>
          </div>
          <button id="btn-cerrar-visor" class="btn-icon" style="font-size: 1.2rem;">✕</button>
        </div>

        <div style="position: relative; flex: 1; overflow: auto; text-align: center; background: #000000; border-radius: var(--radius-sm); min-height: 250px; display: flex; align-items: center; justify-content: center; padding: 4px;">
          <img id="img-visor-comprobante" src="${comprobantes[0] || ''}" alt="Foto boleta" style="max-width: 100%; max-height: 65vh; object-fit: contain; border-radius: 4px;" />

          <!-- Flechas de navegación Anterior / Siguiente -->
          <button
            type="button"
            id="btn-visor-prev"
            style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; background: rgba(0,0,0,0.65); color: #fff; border: 2px solid rgba(255,255,255,0.3); font-size: 1.3rem; cursor: pointer; display: ${comprobantes.length > 1 ? 'flex' : 'none'}; align-items: center; justify-content: center; z-index: 10;"
            title="Foto anterior"
          >◀</button>
          <button
            type="button"
            id="btn-visor-next"
            style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%; background: rgba(0,0,0,0.65); color: #fff; border: 2px solid rgba(255,255,255,0.3); font-size: 1.3rem; cursor: pointer; display: ${comprobantes.length > 1 ? 'flex' : 'none'}; align-items: center; justify-content: center; z-index: 10;"
            title="Foto siguiente"
          >▶</button>
        </div>

        <div class="modal-actions" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div style="display: flex; gap: 6px;">
            <a id="btn-descargar-comprobante" href="${comprobantes[0] || '#'}" download="comprobante-${escapeHtml(stand.nombre).toLowerCase().replace(/[^a-z0-9]/g, '_')}-1.jpg" class="btn btn-outline" style="min-height: 40px; padding: 4px 10px; font-size: 0.85rem; text-decoration: none;">
              ⬇️ Descargar
            </a>
            <button id="btn-eliminar-foto-visor" type="button" class="btn btn-danger-outline" style="min-height: 40px; padding: 4px 10px; font-size: 0.85rem;" title="Eliminar esta foto">
              🗑️ Eliminar
            </button>
          </div>
          <button id="btn-cerrar-visor-footer" class="btn btn-primary" style="min-height: 40px; padding: 4px 16px;">
            Cerrar
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: Selector Rápido de Productos Pendientes de la Lista -->
    <div id="modal-selector-pendientes" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; padding: 14px;" onclick="event.stopPropagation();">
        <div class="modal-header" style="margin-bottom: 6px;">
          <div>
            <h3 class="modal-title" style="font-size: 1.15rem;">📋 Productos Pendientes</h3>
            <span id="contador-modal-pendientes" style="font-size: 0.8rem; color: var(--color-text-dim);">
              ${itemsPendientes.length} productos por comprar
            </span>
          </div>
          <button id="btn-cerrar-modal-pendientes" class="btn-icon" style="font-size: 1.2rem;">✕</button>
        </div>

        <!-- Buscador dentro del modal -->
        <div style="position: relative; margin-bottom: 8px;">
          <input
            type="search"
            id="input-filtro-pendientes-modal"
            class="form-input"
            placeholder="🔍 Escribe para buscar (ej. arroz, azucar, aceite)..."
            autocomplete="off"
            style="padding-left: 36px; padding-right: 32px; min-height: 44px; font-size: 0.95rem; font-weight: 600;"
          />
          <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; pointer-events: none;">🔍</span>
          <button
            type="button"
            id="btn-limpiar-filtro-pendientes"
            style="display: none; position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: none; font-size: 1.1rem; color: var(--color-text-dim); cursor: pointer; padding: 4px;"
            title="Borrar texto"
          >✕</button>
        </div>

        <!-- Contenedor scrollable de la lista filtrable -->
        <div id="lista-pendientes-modal-contenedor" style="flex: 1; overflow-y: auto; max-height: 55vh; display: flex; flex-direction: column; gap: 6px; padding-right: 2px;">
        </div>

        <div class="modal-actions" style="margin-top: 8px;">
          <button id="btn-cerrar-modal-pendientes-footer" class="btn btn-outline" style="width: 100%;">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Referencias a elementos
  const inputProdNombre = container.querySelector('#input-prod-nombre');
  const inputProdCantidad = container.querySelector('#input-prod-cantidad');
  const inputProdUnidad = container.querySelector('#input-prod-unidad');
  const inputProdPrecio = container.querySelector('#input-prod-precio');
  const previewSubtotal = container.querySelector('#preview-subtotal');
  const btnAgregarLinea = container.querySelector('#btn-agregar-linea');

  // Actualización en tiempo real del preview del subtotal
  const actualizarPreviewSubtotal = () => {
    const cant = parseFloat(inputProdCantidad.value) || 0;
    const precioCentimos = solesToCentimos(inputProdPrecio.value);
    const subtotal = calcularSubtotalCentimos(cant, precioCentimos);
    previewSubtotal.textContent = formatMoney(subtotal);
  };

  inputProdCantidad.addEventListener('input', actualizarPreviewSubtotal);
  inputProdPrecio.addEventListener('input', actualizarPreviewSubtotal);

  const btnToggleUnidades = container.querySelector('#btn-toggle-unidades');
  const menuUnidades = container.querySelector('#menu-unidades');
  const chipsUnidad = container.querySelectorAll('.btn-chip-unidad');

  // Lista consolidada de unidades: botones rápidos + aprendidas del historial
  const botonesRapidos = ['caja', 'saco', 'bolsa', 'balde', 'bidón', 'jaba', 'cartón', 'paquete', 'docena', 'kg', 'unidad'];
  const unidadesDisponibles = Array.from(new Set([
    ...botonesRapidos,
    ...(catalogo.unidades || [])
  ]));

  const actualizarChipsActivos = () => {
    const valorActualNorm = normalizarTexto(inputProdUnidad.value);
    chipsUnidad.forEach(chip => {
      const chipNorm = normalizarTexto(chip.dataset.unidad);
      if (valorActualNorm && chipNorm === valorActualNorm) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  };

  const seleccionarUnidad = (u) => {
    inputProdUnidad.value = u;
    actualizarChipsActivos();
    if (menuUnidades) menuUnidades.style.display = 'none';
    inputProdPrecio.focus();
    actualizarPreviewSubtotal();
  };

  const poblarMenuUnidades = (filtro = '') => {
    if (!menuUnidades) return;
    const filtroNorm = normalizarTexto(filtro);
    const lista = filtroNorm
      ? unidadesDisponibles.filter(u => normalizarTexto(u).includes(filtroNorm))
      : unidadesDisponibles;

    if (lista.length === 0) {
      menuUnidades.innerHTML = `
        <div style="padding: 10px 14px; font-size: 0.85rem; color: var(--color-text-dim);">
          Toca Enter para usar "${escapeHtml(filtro)}"
        </div>
      `;
    } else {
      menuUnidades.innerHTML = lista.map(u => {
        const esActivo = normalizarTexto(inputProdUnidad.value) === normalizarTexto(u);
        return `
          <button type="button" class="dropdown-item ${esActivo ? 'active' : ''}" data-unidad="${escapeHtml(u)}">
            <span>${escapeHtml(u)}</span>
            ${esActivo ? '<span style="color: var(--color-primary); font-weight: 800;">✓</span>' : ''}
          </button>
        `;
      }).join('');

      menuUnidades.querySelectorAll('.dropdown-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          seleccionarUnidad(btn.dataset.unidad);
        });
      });
    }
    menuUnidades.style.display = 'flex';
  };

  // Botón toggle ▼ siempre muestra la lista completa de todas las unidades
  btnToggleUnidades?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuUnidades.style.display === 'flex') {
      menuUnidades.style.display = 'none';
    } else {
      poblarMenuUnidades('');
    }
  });

  // Al enfocar el input, mostrar desplegable completo
  inputProdUnidad.addEventListener('focus', () => {
    poblarMenuUnidades('');
  });

  inputProdUnidad.addEventListener('input', () => {
    poblarMenuUnidades(inputProdUnidad.value);
    actualizarChipsActivos();
    actualizarPreviewSubtotal();
  });

  // Cerrar desplegable al hacer clic fuera
  const cerrarMenuClickAfuera = (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
      if (menuUnidades) menuUnidades.style.display = 'none';
    }
  };
  document.addEventListener('click', cerrarMenuClickAfuera);

  // Autocompletar unidad y último precio al seleccionar o tipear producto del catálogo
  inputProdNombre.addEventListener('change', () => {
    const valNorm = normalizarTexto(inputProdNombre.value);
    const prodEncontrado = catalogo.productos.find(p => normalizarTexto(p.nombre) === valNorm);
    if (prodEncontrado) {
      if (prodEncontrado.ultimaUnidad && !inputProdUnidad.value) {
        inputProdUnidad.value = prodEncontrado.ultimaUnidad;
        actualizarChipsActivos();
      }
      if (prodEncontrado.ultimoPrecioCentimos && !inputProdPrecio.value) {
        inputProdPrecio.value = centimosToSoles(prodEncontrado.ultimoPrecioCentimos);
      }
      actualizarPreviewSubtotal();
    }
  });

  // Chips de unidad rápida
  chipsUnidad.forEach(chip => {
    chip.addEventListener('click', () => {
      seleccionarUnidad(chip.dataset.unidad);
    });
  });

  // Inicializar estado de chips
  actualizarChipsActivos();

  // Manejo de enlace con lista planificada
  let selectedListaItemId = null;
  const indicadorPlan = container.querySelector('#indicador-enlace-plan');
  const textoEnlacePlan = container.querySelector('#texto-enlace-plan');
  const btnDesvincularPlan = container.querySelector('#btn-desvincular-plan');

  const desvincularPlan = () => {
    selectedListaItemId = null;
    if (indicadorPlan) indicadorPlan.style.display = 'none';
  };
  btnDesvincularPlan?.addEventListener('click', desvincularPlan);

  const seleccionarItemPlanificado = (item) => {
    if (!item) return;
    selectedListaItemId = item.id;
    inputProdNombre.value = item.producto;
    inputProdCantidad.value = item.cantidadPlaneada;
    inputProdUnidad.value = item.unidad || 'unidad';
    actualizarChipsActivos();

    const valNorm = normalizarTexto(item.producto);
    const prodEncontrado = catalogo.productos.find(p => normalizarTexto(p.nombre) === valNorm);
    if (prodEncontrado && prodEncontrado.ultimoPrecioCentimos) {
      inputProdPrecio.value = centimosToSoles(prodEncontrado.ultimoPrecioCentimos);
    } else {
      inputProdPrecio.value = '';
    }

    actualizarPreviewSubtotal();
    if (indicadorPlan && textoEnlacePlan) {
      textoEnlacePlan.textContent = `✓ Enlazado a lista: ${item.producto}`;
      indicadorPlan.style.display = 'flex';
    }
    inputProdPrecio.focus();
    inputProdPrecio.select();
  };

  container.querySelectorAll('.btn-item-plan-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.itemId;
      const item = itemsPendientes.find(i => i.id === itemId);
      if (item) seleccionarItemPlanificado(item);
    });
  });

  // Selector y buscador de pendientes en modal
  const modalSelectorPendientes = container.querySelector('#modal-selector-pendientes');
  const inputFiltroModal = container.querySelector('#input-filtro-pendientes-modal');
  const btnLimpiarFiltroModal = container.querySelector('#btn-limpiar-filtro-pendientes');
  const contenedorPendientesModal = container.querySelector('#lista-pendientes-modal-contenedor');
  const contadorModalPendientes = container.querySelector('#contador-modal-pendientes');

  const renderizarListaPendientesModal = (filtro = '') => {
    if (!contenedorPendientesModal) return;
    const filtroNorm = normalizarTexto(filtro);
    const filtrados = filtroNorm
      ? itemsPendientes.filter(it => {
          const pNorm = normalizarTexto(it.producto);
          const uNorm = normalizarTexto(it.unidad || '');
          return pNorm.includes(filtroNorm) || uNorm.includes(filtroNorm);
        })
      : itemsPendientes;

    if (contadorModalPendientes) {
      contadorModalPendientes.textContent = filtroNorm
        ? `Mostrando ${filtrados.length} de ${itemsPendientes.length} pendientes`
        : `${itemsPendientes.length} productos por comprar`;
    }

    if (btnLimpiarFiltroModal) {
      btnLimpiarFiltroModal.style.display = filtro.trim() ? 'block' : 'none';
    }

    if (filtrados.length === 0) {
      contenedorPendientesModal.innerHTML = `
        <div style="text-align: center; padding: 24px 8px; color: var(--color-text-dim);">
          <p style="font-size: 1.6rem; margin-bottom: 4px;">🔍</p>
          <p style="font-weight: 700; color: var(--color-text);">No hay productos con "${escapeHtml(filtro)}"</p>
          <p style="font-size: 0.8rem; margin-top: 2px;">Prueba con otra palabra o escribe el producto en el formulario.</p>
        </div>
      `;
      return;
    }

    contenedorPendientesModal.innerHTML = filtrados.map(item => `
      <button
        type="button"
        class="btn btn-outline btn-fila-pendiente"
        data-item-id="${item.id}"
        style="min-height: 48px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; text-align: left; background: var(--color-surface); border: 1.5px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s;"
      >
        <div style="flex: 1; min-width: 0; padding-right: 8px;">
          <div style="font-weight: 800; font-size: 0.95rem; color: var(--color-text); word-break: break-word;">
            ${escapeHtml(item.producto)}
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-dim); margin-top: 2px;">
            Planeado: <strong style="color: var(--color-primary);">${item.cantidadPlaneada} ${escapeHtml(item.unidad || 'unidad')}</strong>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <span class="badge badge-warning" style="font-size: 0.75rem; font-weight: 800;">
            ${item.cantidadPlaneada} ${escapeHtml(item.unidad || 'und')}
          </span>
          <span style="font-size: 1.1rem; color: var(--color-primary); font-weight: 800;">➔</span>
        </div>
      </button>
    `).join('');

    contenedorPendientesModal.querySelectorAll('.btn-fila-pendiente').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.itemId;
        const item = itemsPendientes.find(i => i.id === itemId);
        if (item) {
          seleccionarItemPlanificado(item);
          cerrarModalSelectorPendientes();
        }
      });
    });
  };

  const abrirModalSelectorPendientes = () => {
    if (!modalSelectorPendientes) return;
    if (inputFiltroModal) inputFiltroModal.value = '';
    renderizarListaPendientesModal('');
    modalSelectorPendientes.style.display = 'flex';
    setTimeout(() => {
      if (inputFiltroModal) inputFiltroModal.focus();
    }, 60);
  };

  const cerrarModalSelectorPendientes = () => {
    if (modalSelectorPendientes) modalSelectorPendientes.style.display = 'none';
  };

  container.querySelector('#btn-abrir-selector-pendientes')?.addEventListener('click', abrirModalSelectorPendientes);
  container.querySelector('#btn-ver-mas-pendientes')?.addEventListener('click', abrirModalSelectorPendientes);
  container.querySelector('#btn-cerrar-modal-pendientes')?.addEventListener('click', cerrarModalSelectorPendientes);
  container.querySelector('#btn-cerrar-modal-pendientes-footer')?.addEventListener('click', cerrarModalSelectorPendientes);
  modalSelectorPendientes?.addEventListener('click', (e) => {
    if (e.target === modalSelectorPendientes) cerrarModalSelectorPendientes();
  });

  inputFiltroModal?.addEventListener('input', (e) => {
    renderizarListaPendientesModal(e.target.value);
  });

  inputFiltroModal?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const primeraFila = contenedorPendientesModal?.querySelector('.btn-fila-pendiente');
      if (primeraFila) {
        primeraFila.click();
      }
    }
  });

  btnLimpiarFiltroModal?.addEventListener('click', () => {
    if (inputFiltroModal) {
      inputFiltroModal.value = '';
      inputFiltroModal.focus();
      renderizarListaPendientesModal('');
    }
  });

  // Agregar línea (Enter o Clic)
  const ejecutarAgregarLinea = async () => {
    const producto = inputProdNombre.value.trim();
    if (!producto) {
      inputProdNombre.focus();
      return;
    }

    const cantidad = parseFloat(inputProdCantidad.value) || 0;
    if (cantidad <= 0) {
      inputProdCantidad.focus();
      return;
    }

    const unidad = inputProdUnidad.value.trim() || 'caja';
    const precioUnitarioCentimos = solesToCentimos(inputProdPrecio.value);

    await agregarLineaAction(salidaId, standId, {
      producto,
      cantidad,
      unidad,
      precioUnitarioCentimos,
      listaItemId: selectedListaItemId
    });

    // Limpiar para el siguiente producto y volver a enfocar (flujo veloz de 1 mano)
    desvincularPlan();
    inputProdNombre.value = '';
    inputProdCantidad.value = '1';
    inputProdUnidad.value = ''; // ¡Limpieza garantizada de unidad para el próximo producto!
    inputProdPrecio.value = '';
    actualizarChipsActivos();
    if (menuUnidades) menuUnidades.style.display = 'none';
    actualizarPreviewSubtotal();
    inputProdNombre.focus();
  };

  btnAgregarLinea.addEventListener('click', ejecutarAgregarLinea);

  [inputProdNombre, inputProdCantidad, inputProdUnidad, inputProdPrecio].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ejecutarAgregarLinea();
      }
    });
  });

  // Guardado de datos del stand (nombre, dirección, notas)
  const inputStandNombre = container.querySelector('#input-stand-nombre');
  const inputStandDireccion = container.querySelector('#input-stand-direccion');
  const inputStandNotas = container.querySelector('#input-stand-notas');

  const guardarDatosStand = async () => {
    const mod = {
      ...stand,
      nombre: inputStandNombre.value.trim() || stand.nombre,
      direccion: inputStandDireccion.value.trim(),
      notas: inputStandNotas.value.trim()
    };
    await actualizarStandAction(salidaId, mod);
  };

  inputStandNombre.addEventListener('blur', guardarDatosStand);
  inputStandDireccion.addEventListener('blur', guardarDatosStand);
  inputStandNotas.addEventListener('blur', guardarDatosStand);

  // Botón GPS
  container.querySelector('#btn-guardar-gps')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Tu navegador o dispositivo no soporta geolocalización.');
      return;
    }
    const btnGps = container.querySelector('#btn-guardar-gps');
    btnGps.textContent = '📍 Obteniendo GPS...';
    btnGps.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ubicacion = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          timestamp: Date.now()
        };
        const mod = { ...stand, ubicacion };
        await actualizarStandAction(salidaId, mod);
      },
      (err) => {
        alert('No se pudo obtener la ubicación GPS: ' + err.message);
        btnGps.textContent = '📍 Guardar ubicación GPS';
        btnGps.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  // Campo Total Pagado Real
  const inputPagadoReal = container.querySelector('#input-total-pagado-real');
  const btnLimpiarPagadoReal = container.querySelector('#btn-limpiar-pagado-real');

  inputPagadoReal.addEventListener('change', async () => {
    const val = inputPagadoReal.value.trim();
    const centimos = val === '' ? null : solesToCentimos(val);
    const mod = { ...stand, totalPagadoRealCentimos: centimos };
    await actualizarStandAction(salidaId, mod);
  });

  btnLimpiarPagadoReal.addEventListener('click', async () => {
    inputPagadoReal.value = '';
    const mod = { ...stand, totalPagadoRealCentimos: null };
    await actualizarStandAction(salidaId, mod);
  });

  // Acciones en líneas (Editar / Eliminar)
  container.querySelectorAll('[data-action="eliminar-linea"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const lineaId = btn.dataset.id;
      if (confirm('¿Eliminar esta línea de producto?')) {
        await eliminarLineaAction(salidaId, standId, lineaId);
      }
    });
  });

  // Modal para editar línea
  const modalEditLinea = container.querySelector('#modal-editar-linea');
  const editId = container.querySelector('#edit-linea-id');
  const editNombre = container.querySelector('#edit-prod-nombre');
  const editCantidad = container.querySelector('#edit-prod-cantidad');
  const editUnidad = container.querySelector('#edit-prod-unidad');
  const editPrecio = container.querySelector('#edit-prod-precio');

  container.querySelectorAll('[data-action="editar-linea"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lineaId = btn.dataset.id;
      const linea = lineas.find(l => l.id === lineaId);
      if (!linea) return;

      editId.value = linea.id;
      editNombre.value = linea.producto;
      editCantidad.value = linea.cantidad;
      editUnidad.value = linea.unidad;
      editPrecio.value = centimosToSoles(linea.precioUnitarioCentimos);

      modalEditLinea.style.display = 'flex';
      editCantidad.focus();
    });
  });

  const cerrarModalEdit = () => {
    modalEditLinea.style.display = 'none';
  };

  container.querySelector('#btn-cerrar-modal-linea')?.addEventListener('click', cerrarModalEdit);
  container.querySelector('#btn-cancelar-edit-linea')?.addEventListener('click', cerrarModalEdit);

  container.querySelector('#btn-guardar-edit-linea')?.addEventListener('click', async () => {
    const id = editId.value;
    const producto = editNombre.value.trim();
    const cantidad = parseFloat(editCantidad.value) || 0;
    const unidad = editUnidad.value.trim() || 'unidad';
    const precioUnitarioCentimos = solesToCentimos(editPrecio.value);

    if (!producto || cantidad <= 0) {
      alert('Ingresa un producto y cantidad válidos.');
      return;
    }

    const lineaExistente = lineas.find(l => l.id === id);
    const mod = {
      ...lineaExistente,
      producto,
      cantidad,
      unidad,
      precioUnitarioCentimos,
      subtotalCentimos: calcularSubtotalCentimos(cantidad, precioUnitarioCentimos)
    };

    await actualizarLineaAction(salidaId, standId, mod);
    cerrarModalEdit();
  });

  // Gestión de Fotos de Comprobante / Boleta (Múltiples fotos por stand)
  const inputCamara = container.querySelector('#input-camara-comprobante');
  const inputArchivo = container.querySelector('#input-archivo-comprobante');
  const estadoComprobante = container.querySelector('#comprobante-estado');

  const procesarFotosSeleccionadas = async (archivos) => {
    const files = Array.from(archivos || []).filter(f => f && f.type.startsWith('image/'));
    if (files.length === 0) return;

    if (estadoComprobante) {
      estadoComprobante.style.display = 'block';
      estadoComprobante.textContent = files.length === 1
        ? '⏳ Optimizando y guardando comprobante...'
        : `⏳ Optimizando y guardando ${files.length} fotos...`;
    }

    try {
      const nuevasFotos = [];
      for (const file of files) {
        const dataUrl = await comprimirImagen(file, 1200, 0.75);
        nuevasFotos.push(dataUrl);
      }

      const fotosPrevias = obtenerComprobantesStand(stand);
      const listaFinal = [...fotosPrevias, ...nuevasFotos];

      const mod = {
        ...stand,
        nombre: inputStandNombre?.value.trim() || stand.nombre,
        direccion: inputStandDireccion?.value.trim() ?? (stand.direccion || ''),
        notas: inputStandNotas?.value.trim() ?? (stand.notas || ''),
        comprobante: listaFinal[0] || null,
        comprobantes: listaFinal
      };
      await actualizarStandAction(salidaId, mod);
    } catch (err) {
      alert('No se pudo procesar la foto: ' + (err.message || err));
      if (estadoComprobante) {
        estadoComprobante.style.display = 'none';
      }
    }
  };

  inputCamara?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) procesarFotosSeleccionadas(files);
    e.target.value = '';
  });

  inputArchivo?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) procesarFotosSeleccionadas(files);
    e.target.value = '';
  });

  container.querySelector('#btn-tomar-foto')?.addEventListener('click', () => inputCamara?.click());
  container.querySelector('#btn-subir-archivo')?.addEventListener('click', () => inputArchivo?.click());
  container.querySelector('#btn-cambiar-camara')?.addEventListener('click', () => inputCamara?.click());
  container.querySelector('#btn-cambiar-archivo')?.addEventListener('click', () => inputArchivo?.click());
  container.querySelector('#btn-tira-agregar-mas')?.addEventListener('click', () => inputArchivo?.click());

  // Eliminación individual de una foto
  const eliminarFotoPorIndice = async (idx) => {
    const fotos = obtenerComprobantesStand(stand);
    if (idx < 0 || idx >= fotos.length) return;
    if (confirm(`¿Eliminar la foto #${idx + 1} del comprobante de este stand?`)) {
      const listaFinal = fotos.filter((_, i) => i !== idx);
      const mod = {
        ...stand,
        nombre: inputStandNombre?.value.trim() || stand.nombre,
        direccion: inputStandDireccion?.value.trim() ?? (stand.direccion || ''),
        notas: inputStandNotas?.value.trim() ?? (stand.notas || ''),
        comprobante: listaFinal[0] || null,
        comprobantes: listaFinal
      };
      await actualizarStandAction(salidaId, mod);
    }
  };

  container.querySelectorAll('.btn-eliminar-foto-individual').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.fotoIdx, 10);
      await eliminarFotoPorIndice(idx);
    });
  });

  // Visor de fotos en pantalla completa con navegación múltiple
  let visorFotoIdx = 0;
  const modalVisor = container.querySelector('#modal-visor-comprobante');
  const imgVisor = container.querySelector('#img-visor-comprobante');
  const indicadorCuentaVisor = container.querySelector('#visor-indicador-cuenta');
  const btnVisorPrev = container.querySelector('#btn-visor-prev');
  const btnVisorNext = container.querySelector('#btn-visor-next');
  const btnDescargarVisor = container.querySelector('#btn-descargar-comprobante');
  const btnEliminarFotoVisor = container.querySelector('#btn-eliminar-foto-visor');

  const actualizarVisorFoto = (idx) => {
    const fotos = obtenerComprobantesStand(stand);
    if (fotos.length === 0) {
      cerrarVisor();
      return;
    }
    if (idx < 0) idx = fotos.length - 1;
    if (idx >= fotos.length) idx = 0;
    visorFotoIdx = idx;

    if (imgVisor) imgVisor.src = fotos[visorFotoIdx];
    if (indicadorCuentaVisor) {
      indicadorCuentaVisor.textContent = `${stand.nombre} · Foto ${visorFotoIdx + 1} de ${fotos.length}`;
    }
    if (btnDescargarVisor) {
      btnDescargarVisor.href = fotos[visorFotoIdx];
      btnDescargarVisor.download = `comprobante-${escapeHtml(stand.nombre).toLowerCase().replace(/[^a-z0-9]/g, '_')}-${visorFotoIdx + 1}.jpg`;
    }
    if (btnVisorPrev) btnVisorPrev.style.display = fotos.length > 1 ? 'flex' : 'none';
    if (btnVisorNext) btnVisorNext.style.display = fotos.length > 1 ? 'flex' : 'none';
  };

  const abrirVisor = (idx = 0) => {
    const fotos = obtenerComprobantesStand(stand);
    if (fotos.length === 0) return;
    actualizarVisorFoto(idx);
    if (modalVisor) modalVisor.style.display = 'flex';
  };

  const cerrarVisor = () => {
    if (modalVisor) modalVisor.style.display = 'none';
  };

  btnVisorPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    actualizarVisorFoto(visorFotoIdx - 1);
  });

  btnVisorNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    actualizarVisorFoto(visorFotoIdx + 1);
  });

  btnEliminarFotoVisor?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const idxAEliminar = visorFotoIdx;
    await eliminarFotoPorIndice(idxAEliminar);
    const fotosRestantes = obtenerComprobantesStand(stand);
    if (fotosRestantes.length === 0) {
      cerrarVisor();
    } else {
      actualizarVisorFoto(Math.min(idxAEliminar, fotosRestantes.length - 1));
    }
  });

  container.querySelectorAll('.btn-abrir-visor-foto').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.fotoIdx, 10) || 0;
      abrirVisor(idx);
    });
  });

  container.querySelector('#btn-abrir-visor-principal')?.addEventListener('click', () => abrirVisor(0));
  container.querySelector('#btn-cerrar-visor')?.addEventListener('click', cerrarVisor);
  container.querySelector('#btn-cerrar-visor-footer')?.addEventListener('click', cerrarVisor);
  modalVisor?.addEventListener('click', (e) => {
    if (e.target === modalVisor) cerrarVisor();
  });

  container.querySelector('#btn-volver-salida')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#btn-finalizar-stand')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#btn-whatsapp-stand')?.addEventListener('click', async () => {
    await compartirStandWhatsApp(salida, stand);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
