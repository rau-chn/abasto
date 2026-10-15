/**
 * Vista de Salida: Lista de stands, total acumulado visible siempre y botón grande "Agregar stand".
 */

import { getState, agregarStandAction, eliminarStandAction } from '../store.js';
import { calcularTotalesStand, calcularTotalesSalida } from '../models.js';
import { formatMoney, describirDiferencia } from '../money.js';

export function renderSalidaView(container, salidaId) {
  const state = getState();
  const salida = (state.salidas || []).find(s => s.id === salidaId);

  if (!salida) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <h3>Salida no encontrada</h3>
        <p style="margin-top: 8px; color: var(--color-text-dim);">Es posible que haya sido eliminada.</p>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.location.hash='#home'">
          Volver al Inicio
        </button>
      </div>
    `;
    return;
  }

  const totalesSalida = calcularTotalesSalida(salida);
  const descDiff = describirDiferencia(totalesSalida.diferenciaCentimos);
  const stands = Array.isArray(salida.stands) ? salida.stands : [];
  const catalogoStands = state.catalogo.stands || [];

  const html = `
    <!-- Barra de navegación secundaria de la salida -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button id="btn-volver-home" class="btn btn-outline" style="min-height: 40px; padding: 6px 12px; font-size: 0.9rem;">
        ◀ Inicio
      </button>
      <div style="text-align: right; flex: 1;">
        <h2 style="font-size: 1.15rem; font-weight: 800; line-height: 1.2;">
          ${escapeHtml(salida.nombre || 'Compra')}
        </h2>
        <span style="font-size: 0.8rem; color: var(--color-text-muted);">
          📅 ${formatearFecha(salida.fecha)}
        </span>
      </div>
    </div>

    <!-- Pestañas de la salida actual -->
    <div class="nav-tabs">
      <button class="nav-tab-btn active">Stands (${stands.length})</button>
      <button id="tab-lista" class="nav-tab-btn">Lista Planificada</button>
      <button id="tab-resumen" class="nav-tab-btn">Resumen Final</button>
    </div>

    <!-- Botón grande para agregar stand -->
    <button id="btn-abrir-modal-stand" class="btn btn-primary btn-lg" style="box-shadow: var(--shadow-md);">
      ➕ AGREGAR STAND
    </button>

    <!-- Lista de Stands -->
    ${stands.length === 0 ? `
      <div class="card" style="text-align: center; padding: 36px 16px; color: var(--color-text-dim);">
        <p style="font-size: 2.2rem; margin-bottom: 8px;">🏬</p>
        <h3 style="color: var(--color-text); margin-bottom: 6px;">No hay stands en esta salida</h3>
        <p style="font-size: 0.95rem;">Toca "Agregar Stand" para registrar el primer puesto o distribuidora que visites.</p>
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${stands.map((stand, index) => {
          const totStand = calcularTotalesStand(stand);
          const descStandDiff = describirDiferencia(totStand.diferenciaCentimos);
          const numLineas = (stand.lineas || []).length;

          return `
            <div class="card card-clickable" data-stand-id="${stand.id}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="badge" style="background: var(--color-primary); color: white; border-radius: 4px; font-size: 0.75rem;">
                      #${index + 1}
                    </span>
                    <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--color-text);">
                      ${escapeHtml(stand.nombre)}
                    </h3>
                  </div>

                  ${stand.direccion ? `
                    <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 3px;">
                      📍 ${escapeHtml(stand.direccion)}
                    </div>
                  ` : ''}

                  <div style="font-size: 0.85rem; color: var(--color-text-dim); margin-top: 4px;">
                    ${numLineas} ${numLineas === 1 ? 'producto registrado' : 'productos registrados'}
                    ${stand.ubicacion ? '· 📌 GPS guardado' : ''}
                  </div>
                </div>

                <div style="text-align: right;">
                  <div style="font-size: 1.25rem; font-weight: 800; color: var(--color-text);">
                    ${formatMoney(totStand.totalEfectivoCentimos)}
                  </div>
                  ${totStand.tienePagadoReal ? `
                    <div style="font-size: 0.75rem; color: var(--color-text-dim);">
                      Calculado: ${formatMoney(totStand.totalCalculadoCentimos)}
                    </div>
                    <span class="badge ${descStandDiff.tipo === 'descuento' ? 'badge-success' : 'badge-warning'}" style="margin-top: 2px;">
                      ${descStandDiff.montoStr}
                    </span>
                  ` : ''}
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);" onclick="event.stopPropagation();">
                <button class="btn btn-outline" style="min-height: 38px; padding: 4px 14px; font-size: 0.9rem;" data-action="abrir-stand" data-id="${stand.id}">
                  Ver y registrar productos ➔
                </button>
                <button class="btn btn-danger-outline btn-icon" style="min-height: 38px; width: 38px;" data-action="eliminar-stand" data-id="${stand.id}" title="Eliminar stand">
                  🗑️
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}

    <!-- Barra flotante fija inferior con Total Acumulado Siempre Visible -->
    <div class="bottom-total-bar">
      <div class="bottom-total-inner">
        <div class="total-display-group">
          <span class="total-label">Total Acumulado de la Salida</span>
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span class="total-amount">${formatMoney(totalesSalida.totalEfectivoCentimos)}</span>
            ${totalesSalida.diferenciaCentimos !== 0 ? `
              <span class="badge ${descDiff.tipo === 'descuento' ? 'badge-success' : 'badge-warning'}">
                ${descDiff.montoStr}
              </span>
            ` : ''}
          </div>
        </div>

        <button id="btn-agregar-stand-flotante" class="btn btn-primary" style="padding: 10px 16px;">
          ➕ Stand
        </button>
      </div>
    </div>

    <!-- Modal para Agregar Stand -->
    <div id="modal-agregar-stand" class="modal-overlay" style="display: none;">
      <div class="modal-content" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Agregar Nuevo Stand</h3>
          <button id="btn-cerrar-modal-stand" class="btn-icon" style="color: var(--color-text-dim);">✕</button>
        </div>

        <div class="form-group">
          <label class="form-label" for="input-nombre-stand">Nombre del puesto / stand *</label>
          <input type="text" id="input-nombre-stand" class="form-input" placeholder="Ej. Puesto 45 - Don Lucho" list="sugerencias-stands" autofocus />
          <datalist id="sugerencias-stands">
            ${catalogoStands.map(s => `<option value="${escapeHtml(s.nombre)}">${s.direccion ? escapeHtml(s.direccion) : ''}</option>`).join('')}
          </datalist>
        </div>

        <div class="form-group">
          <label class="form-label" for="input-direccion-stand">Dirección o ubicación interna (opcional)</label>
          <input type="text" id="input-direccion-stand" class="form-input" placeholder="Ej. Pabellón A, Puesto 14 / Pasaje 2" />
        </div>

        <div class="form-group">
          <label class="form-label" for="input-notas-stand">Notas del stand (opcional)</label>
          <textarea id="input-notas-stand" class="form-textarea" rows="2" placeholder="Ej. Traer sencillo / pedir factura"></textarea>
        </div>

        <div class="modal-actions" style="margin-top: 10px;">
          <button id="btn-cancelar-stand" class="btn btn-outline">Cancelar</button>
          <button id="btn-confirmar-stand" class="btn btn-primary">Crear Stand</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Navegación
  container.querySelector('#btn-volver-home')?.addEventListener('click', () => {
    window.location.hash = '#home';
  });

  container.querySelector('#tab-lista')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}/lista`;
  });

  container.querySelector('#tab-resumen')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}/resumen`;
  });

  // Modal de Stand
  const modalStand = container.querySelector('#modal-agregar-stand');
  const inputNombre = container.querySelector('#input-nombre-stand');
  const inputDireccion = container.querySelector('#input-direccion-stand');
  const inputNotas = container.querySelector('#input-notas-stand');

  const abrirModal = () => {
    modalStand.style.display = 'flex';
    inputNombre.value = '';
    inputDireccion.value = '';
    inputNotas.value = '';
    setTimeout(() => inputNombre.focus(), 50);
  };

  const cerrarModal = () => {
    modalStand.style.display = 'none';
  };

  // Autocompletar dirección si el stand ya fue usado en salidas anteriores
  inputNombre.addEventListener('change', () => {
    const val = inputNombre.value.trim().toLowerCase();
    const encontrado = catalogoStands.find(s => s.nombre.toLowerCase() === val);
    if (encontrado && encontrado.direccion && !inputDireccion.value) {
      inputDireccion.value = encontrado.direccion;
    }
  });

  container.querySelector('#btn-abrir-modal-stand')?.addEventListener('click', abrirModal);
  container.querySelector('#btn-agregar-stand-flotante')?.addEventListener('click', abrirModal);
  container.querySelector('#btn-cerrar-modal-stand')?.addEventListener('click', cerrarModal);
  container.querySelector('#btn-cancelar-stand')?.addEventListener('click', cerrarModal);

  modalStand.addEventListener('click', (e) => {
    if (e.target === modalStand) cerrarModal();
  });

  const confirmarStand = async () => {
    const nombre = inputNombre.value.trim();
    if (!nombre) {
      alert('Ingresa el nombre o número del stand.');
      inputNombre.focus();
      return;
    }
    const direccion = inputDireccion.value.trim();
    const notas = inputNotas.value.trim();

    const nuevoStand = await agregarStandAction(salidaId, nombre, direccion, notas);
    cerrarModal();
    // Entrar inmediatamente al stand para registrar productos
    window.location.hash = `#stand/${salidaId}/${nuevoStand.id}`;
  };

  container.querySelector('#btn-confirmar-stand')?.addEventListener('click', confirmarStand);
  inputNombre?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarStand();
  });

  // Clic en tarjetas de stand
  container.querySelectorAll('.card-clickable').forEach(card => {
    card.addEventListener('click', () => {
      const standId = card.dataset.standId;
      window.location.hash = `#stand/${salidaId}/${standId}`;
    });
  });

  // Botones de acción en tarjetas de stand
  container.querySelectorAll('[data-action="abrir-stand"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#stand/${salidaId}/${btn.dataset.id}`;
    });
  });

  container.querySelectorAll('[data-action="eliminar-stand"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const standId = btn.dataset.id;
      if (confirm('¿Eliminar este stand y todos sus productos registrados?')) {
        await eliminarStandAction(salidaId, standId);
      }
    });
  });
}

function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
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
