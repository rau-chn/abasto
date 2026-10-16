/**
 * Vista de Inicio: Listado de salidas anteriores y creación de nueva salida.
 */

import { getState, crearSalidaAction, eliminarSalidaAction } from '../store.js';
import { calcularTotalesSalida } from '../models.js';
import { formatMoney, describirDiferencia } from '../money.js';
import { necesitaRecordatorioRespaldo } from '../export.js';

export function renderHomeView(container) {
  const state = getState();
  const { salidas } = state;

  const html = `
    <div class="card" style="background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); color: white; border: none;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h2 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 4px;">Compras de Bodega</h2>
          <p style="font-size: 0.9rem; opacity: 0.9;">Registra stands y compras 100% offline.</p>
        </div>
        <span class="badge" style="background: rgba(255,255,255,0.2); color: white;">
          ${salidas.length} ${salidas.length === 1 ? 'salida' : 'salidas'}
        </span>
      </div>
      <button id="btn-nueva-salida-hero" class="btn btn-accent btn-lg" style="margin-top: 10px; font-weight: 800; color: #ffffff; background-color: var(--color-accent);">
        <span style="color: #ffffff; font-weight: 900; font-size: 1.4rem; line-height: 1; margin-right: 4px;">+</span> NUEVA SALIDA DE COMPRAS
      </button>
    </div>

    ${necesitaRecordatorioRespaldo(salidas.length) ? `
      <div class="card" style="background: var(--color-warning-light); border: 2px solid var(--color-warning); padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.3rem;">⚠️</span>
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-text);">
            Hace más de 7 días no descargas un respaldo.
          </span>
        </div>
        <a href="#backup" class="btn btn-outline" style="min-height: 32px; padding: 2px 10px; font-size: 0.8rem; font-weight: 800; white-space: nowrap; text-decoration: none;">
          Respaldar ➔
        </a>
      </div>
    ` : ''}

    ${salidas.length === 0 ? `
      <div class="card" style="text-align: center; padding: 36px 16px; color: var(--color-text-dim);">
        <p style="font-size: 2.2rem; margin-bottom: 8px;">🛒</p>
        <h3 style="color: var(--color-text); margin-bottom: 6px;">No hay salidas registradas</h3>
        <p style="font-size: 0.95rem; margin-bottom: 16px;">Inicia una nueva salida cuando vayas al mercado mayorista.</p>
        <button id="btn-nueva-salida-vacio" class="btn btn-primary" style="margin: 0 auto;">
          Comenzar primera salida
        </button>
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <h3 style="font-size: 1rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
          Historial de Salidas
        </h3>
        ${salidas.map(salida => {
          const totales = calcularTotalesSalida(salida);
          const descDiff = describirDiferencia(totales.diferenciaCentimos);
          const fechaFormateada = formatearFecha(salida.fecha);

          return `
            <div class="card card-clickable" data-salida-id="${salida.id}" style="position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 1.1rem; font-weight: 800; color: var(--color-primary);">
                      ${escapeHtml(salida.nombre || 'Compra sin nombre')}
                    </span>
                    <span class="badge badge-neutral">📅 ${fechaFormateada}</span>
                  </div>
                  <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 4px;">
                    ${totales.totalStands} ${totales.totalStands === 1 ? 'stand' : 'stands'} · ${totales.totalLineas} ${totales.totalLineas === 1 ? 'producto' : 'productos'}${totales.totalGastosCentimos > 0 ? ` · 🛵 Viáticos` : ''}
                  </div>
                </div>

                <div style="text-align: right;">
                  <div style="font-size: 1.25rem; font-weight: 800; color: var(--color-text);">
                    ${formatMoney(totales.granTotalCentimos)}
                  </div>
                  ${totales.totalGastosCentimos > 0 ? `
                    <div style="font-size: 0.72rem; color: #b45309; font-weight: 700;">
                      (incl. ${formatMoney(totales.totalGastosCentimos)} viáticos)
                    </div>
                  ` : ''}
                  ${totales.diferenciaCentimos !== 0 ? `
                    <span class="badge ${descDiff.tipo === 'descuento' ? 'badge-success' : 'badge-warning'}" style="margin-top: 2px;">
                      ${descDiff.montoStr}
                    </span>
                  ` : ''}
                </div>
              </div>

              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--color-border);" onclick="event.stopPropagation();">
                <button class="btn btn-outline" style="min-height: 36px; padding: 4px 12px; font-size: 0.85rem;" data-action="abrir" data-id="${salida.id}">
                  Abrir compra ➔
                </button>
                <button class="btn btn-danger-outline btn-icon" style="min-height: 36px; width: 36px;" data-action="eliminar" data-id="${salida.id}" title="Eliminar salida">
                  🗑️
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}

    <!-- Modal para Nueva Salida -->
    <div id="modal-nueva-salida" class="modal-overlay" style="display: none;">
      <div class="modal-content" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Nueva Salida de Compras</h3>
          <button id="btn-cerrar-modal-salida" class="btn-icon" style="color: var(--color-text-dim);">✕</button>
        </div>

        <div class="form-group">
          <label class="form-label" for="input-fecha-salida">Fecha de compra</label>
          <input type="date" id="input-fecha-salida" class="form-input" value="${new Date().toISOString().split('T')[0]}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="input-nombre-salida">Nombre opcional</label>
          <input type="text" id="input-nombre-salida" class="form-input" placeholder="Ej. Compra lunes Mayorista" autofocus />
        </div>

        <div class="modal-actions" style="margin-top: 10px;">
          <button id="btn-cancelar-salida" class="btn btn-outline">Cancelar</button>
          <button id="btn-confirmar-salida" class="btn btn-primary">Crear e Iniciar</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Event Listeners
  const modal = container.querySelector('#modal-nueva-salida');
  const inputNombre = container.querySelector('#input-nombre-salida');
  const inputFecha = container.querySelector('#input-fecha-salida');

  const abrirModal = () => {
    modal.style.display = 'flex';
    inputNombre.value = '';
    inputFecha.value = new Date().toISOString().split('T')[0];
    setTimeout(() => inputNombre.focus(), 50);
  };

  const cerrarModal = () => {
    modal.style.display = 'none';
  };

  container.querySelector('#btn-nueva-salida-hero')?.addEventListener('click', abrirModal);
  container.querySelector('#btn-nueva-salida-vacio')?.addEventListener('click', abrirModal);
  container.querySelector('#btn-cerrar-modal-salida')?.addEventListener('click', cerrarModal);
  container.querySelector('#btn-cancelar-salida')?.addEventListener('click', cerrarModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal();
  });

  const confirmarSalida = async () => {
    const nombre = inputNombre.value.trim();
    const fecha = inputFecha.value || new Date().toISOString().split('T')[0];
    const nueva = await crearSalidaAction(nombre, fecha);
    cerrarModal();
    window.location.hash = `#salida/${nueva.id}`;
  };

  container.querySelector('#btn-confirmar-salida')?.addEventListener('click', confirmarSalida);
  inputNombre?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarSalida();
  });

  // Clics en tarjetas de salida
  container.querySelectorAll('.card-clickable').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.salidaId;
      window.location.hash = `#salida/${id}`;
    });
  });

  // Botones de acción dentro de tarjetas
  container.querySelectorAll('[data-action="abrir"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#salida/${btn.dataset.id}`;
    });
  });

  container.querySelectorAll('[data-action="eliminar"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('¿Eliminar esta salida y todos sus stands registrados? Esta acción no se puede deshacer.')) {
        await eliminarSalidaAction(id);
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
