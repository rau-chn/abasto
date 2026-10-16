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
import { calcularTotalesStand, normalizarTexto, derivarEstadoLista } from '../models.js';
import {
  formatMoney,
  solesToCentimos,
  centimosToSoles,
  calcularSubtotalCentimos,
  describirDiferencia
} from '../money.js';

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

  const html = `
    <!-- Encabezado del Stand -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button id="btn-volver-salida" class="btn btn-outline" style="min-height: 40px; padding: 6px 12px; font-size: 0.9rem;">
        ◀ Volver a Stands
      </button>
      <div style="text-align: right; flex: 1;">
        <span style="font-size: 0.8rem; color: var(--color-text-dim);">
          ${escapeHtml(salida.nombre || 'Compra')}
        </span>
        <h2 style="font-size: 1.2rem; font-weight: 800; line-height: 1.2;">
          ${escapeHtml(stand.nombre)}
        </h2>
      </div>
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

    <!-- Tarjeta de Comprobante / Boleta del Stand -->
    <div class="card" style="padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="font-size: 0.95rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">
          🧾 Foto de Boleta / Comprobante
        </h3>
        ${stand.comprobante ? `
          <span class="badge badge-success" style="font-size: 0.75rem;">Adjunta</span>
        ` : `
          <span style="font-size: 0.8rem; color: var(--color-text-dim);">Opcional</span>
        `}
      </div>

      <!-- Inputs ocultos para captura por cámara o archivo -->
      <input type="file" id="input-camara-comprobante" accept="image/*" capture="environment" style="display: none;" />
      <input type="file" id="input-archivo-comprobante" accept="image/*" style="display: none;" />

      <div id="comprobante-estado" style="display: none; padding: 8px; margin-bottom: 8px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 700; background: var(--color-warning-bg); color: var(--color-warning); text-align: center;">
      </div>

      ${stand.comprobante ? `
        <div style="display: flex; gap: 12px; align-items: center;">
          <!-- Miniatura interactiva con zoom -->
          <div id="btn-ver-miniatura" style="position: relative; width: 85px; height: 85px; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid var(--color-border); cursor: pointer; flex-shrink: 0; background: #000000;" title="Toca para ver en pantalla completa">
            <img src="${stand.comprobante}" alt="Comprobante de compra" style="width: 100%; height: 100%; object-fit: cover;" />
            <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.25rem;">
              🔍
            </div>
          </div>

          <!-- Acciones de comprobante -->
          <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
            <button type="button" id="btn-abrir-visor" class="btn btn-outline" style="min-height: 36px; padding: 4px 10px; font-size: 0.85rem; justify-content: flex-start;">
              🔍 Ver foto completa
            </button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-cambiar-camara" class="btn btn-outline" style="min-height: 36px; padding: 4px 8px; font-size: 0.8rem; flex: 1;" title="Tomar nueva foto con cámara">
                📷 Cámara
              </button>
              <button type="button" id="btn-cambiar-archivo" class="btn btn-outline" style="min-height: 36px; padding: 4px 8px; font-size: 0.8rem; flex: 1;" title="Elegir otra imagen o archivo">
                📁 Archivo
              </button>
              <button type="button" id="btn-eliminar-comprobante" class="btn btn-danger-outline btn-icon" style="min-height: 36px; width: 36px;" title="Eliminar foto">
                🗑️
              </button>
            </div>
          </div>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <p style="font-size: 0.85rem; color: var(--color-text-dim);">
            Toma foto a la boleta, factura o ticket para tener respaldo visual de tu compra en este stand.
          </p>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-tomar-foto" class="btn btn-outline" style="flex: 1; min-height: 42px; font-size: 0.9rem; font-weight: 700;">
              📷 Tomar foto
            </button>
            <button type="button" id="btn-subir-archivo" class="btn btn-outline" style="flex: 1; min-height: 42px; font-size: 0.9rem; font-weight: 700;">
              📁 Elegir archivo
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

      <!-- Atajo para elegir de la lista planificada -->
      ${itemsPendientes.length > 0 ? `
        <div style="background-color: var(--color-warning-bg); border: 1px solid var(--color-warning); border-radius: var(--radius-sm); padding: 8px 10px;">
          <div style="font-size: 0.8rem; font-weight: 800; color: var(--color-warning); text-transform: uppercase; margin-bottom: 4px;">
            📋 De tu lista (${itemsPendientes.length} pendientes):
          </div>
          <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch;">
            ${itemsPendientes.map(item => `
              <button
                type="button"
                class="btn btn-outline btn-item-plan-chip"
                data-item-id="${item.id}"
                data-item-nombre="${escapeHtml(item.producto)}"
                data-item-cant="${item.cantidadPlaneada}"
                data-item-unid="${escapeHtml(item.unidad || 'unidad')}"
                style="min-height: 32px; padding: 2px 8px; font-size: 0.8rem; background: var(--color-surface); white-space: nowrap; flex-shrink: 0;"
              >
                ${escapeHtml(item.producto)} (${item.cantidadPlaneada} ${escapeHtml(item.unidad || 'und')})
              </button>
            `).join('')}
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

    <!-- Modal Visor de Comprobante / Boleta en pantalla completa -->
    <div id="modal-visor-comprobante" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 600px; padding: 14px; max-height: 95vh; display: flex; flex-direction: column;" onclick="event.stopPropagation();">
        <div class="modal-header" style="margin-bottom: 8px;">
          <div>
            <h3 class="modal-title" style="font-size: 1.1rem;">Comprobante de compra</h3>
            <span style="font-size: 0.8rem; color: var(--color-text-dim);">${escapeHtml(stand.nombre)}</span>
          </div>
          <button id="btn-cerrar-visor" class="btn-icon" style="font-size: 1.2rem;">✕</button>
        </div>

        <div style="flex: 1; overflow: auto; text-align: center; background: #000000; border-radius: var(--radius-sm); min-height: 250px; display: flex; align-items: center; justify-content: center; padding: 4px;">
          <img id="img-visor-comprobante" src="${stand.comprobante || ''}" alt="Foto boleta" style="max-width: 100%; max-height: 65vh; object-fit: contain; border-radius: 4px;" />
        </div>

        <div class="modal-actions" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          <a id="btn-descargar-comprobante" href="${stand.comprobante || '#'}" download="comprobante-${escapeHtml(stand.nombre).toLowerCase().replace(/[^a-z0-9]/g, '_')}.jpg" class="btn btn-outline" style="min-height: 40px; padding: 4px 12px; font-size: 0.85rem; text-decoration: none;">
            ⬇️ Descargar foto
          </a>
          <button id="btn-cerrar-visor-footer" class="btn btn-primary" style="min-height: 40px; padding: 4px 16px;">
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

  container.querySelectorAll('.btn-item-plan-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedListaItemId = btn.dataset.itemId;
      inputProdNombre.value = btn.dataset.itemNombre;
      inputProdCantidad.value = btn.dataset.itemCant;
      inputProdUnidad.value = btn.dataset.itemUnid;
      actualizarChipsActivos();

      const valNorm = normalizarTexto(btn.dataset.itemNombre);
      const prodEncontrado = catalogo.productos.find(p => normalizarTexto(p.nombre) === valNorm);
      if (prodEncontrado && prodEncontrado.ultimoPrecioCentimos) {
        inputProdPrecio.value = centimosToSoles(prodEncontrado.ultimoPrecioCentimos);
      } else {
        inputProdPrecio.value = '';
      }

      actualizarPreviewSubtotal();
      if (indicadorPlan && textoEnlacePlan) {
        textoEnlacePlan.textContent = `✓ Enlazado a lista: ${btn.dataset.itemNombre}`;
        indicadorPlan.style.display = 'flex';
      }
      inputProdPrecio.focus();
    });
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

  // Gestión de Foto de Comprobante / Boleta
  const inputCamara = container.querySelector('#input-camara-comprobante');
  const inputArchivo = container.querySelector('#input-archivo-comprobante');
  const estadoComprobante = container.querySelector('#comprobante-estado');

  const procesarFotoSeleccionada = async (file) => {
    if (!file) return;
    if (estadoComprobante) {
      estadoComprobante.style.display = 'block';
      estadoComprobante.textContent = '⏳ Optimizando y guardando foto del comprobante...';
    }
    try {
      const dataUrl = await comprimirImagen(file, 1200, 0.75);
      const mod = {
        ...stand,
        nombre: inputStandNombre?.value.trim() || stand.nombre,
        direccion: inputStandDireccion?.value.trim() ?? (stand.direccion || ''),
        notas: inputStandNotas?.value.trim() ?? (stand.notas || ''),
        comprobante: dataUrl
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
    const file = e.target.files?.[0];
    if (file) procesarFotoSeleccionada(file);
    e.target.value = '';
  });

  inputArchivo?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) procesarFotoSeleccionada(file);
    e.target.value = '';
  });

  container.querySelector('#btn-tomar-foto')?.addEventListener('click', () => inputCamara?.click());
  container.querySelector('#btn-subir-archivo')?.addEventListener('click', () => inputArchivo?.click());
  container.querySelector('#btn-cambiar-camara')?.addEventListener('click', () => inputCamara?.click());
  container.querySelector('#btn-cambiar-archivo')?.addEventListener('click', () => inputArchivo?.click());

  container.querySelector('#btn-eliminar-comprobante')?.addEventListener('click', async () => {
    if (confirm('¿Eliminar la foto del comprobante de este stand?')) {
      const mod = {
        ...stand,
        nombre: inputStandNombre?.value.trim() || stand.nombre,
        direccion: inputStandDireccion?.value.trim() ?? (stand.direccion || ''),
        notas: inputStandNotas?.value.trim() ?? (stand.notas || ''),
        comprobante: null
      };
      await actualizarStandAction(salidaId, mod);
    }
  });

  // Visor de foto en pantalla completa
  const modalVisor = container.querySelector('#modal-visor-comprobante');
  const abrirVisor = () => {
    if (modalVisor) modalVisor.style.display = 'flex';
  };
  const cerrarVisor = () => {
    if (modalVisor) modalVisor.style.display = 'none';
  };

  container.querySelector('#btn-ver-miniatura')?.addEventListener('click', abrirVisor);
  container.querySelector('#btn-abrir-visor')?.addEventListener('click', abrirVisor);
  container.querySelector('#btn-cerrar-visor')?.addEventListener('click', cerrarVisor);
  container.querySelector('#btn-cerrar-visor-footer')?.addEventListener('click', cerrarVisor);
  modalVisor?.addEventListener('click', (e) => {
    if (e.target === modalVisor) cerrarVisor();
  });

  // Botones de navegación
  container.querySelector('#btn-volver-salida')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#btn-finalizar-stand')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
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
