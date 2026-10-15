/**
 * Vista de Exportación, Importación y Respaldo:
 * - Respaldo JSON (exportar/importar con modal de 'Reemplazar todo' o 'Combinar por id').
 * - Exportar Resumen a CSV compatible con Excel (BOM UTF-8).
 * - Compartir por WhatsApp y vista de impresión.
 * - Almacenamiento persistente (navigator.storage.persist) y recordatorio periódico.
 */

import { getState, importarRespaldoAction, setStoragePersisted } from '../store.js';
import {
  exportarJSONRespaldo,
  validarJSONRespaldo,
  exportarCSVResumen,
  compartirResumenWhatsApp,
  necesitaRecordatorioRespaldo
} from '../export.js';
import { formatMoney } from '../money.js';

export function renderBackupView(container) {
  const state = getState();
  const salidas = Array.isArray(state.salidas) ? state.salidas : [];
  const isPersisted = state.isStoragePersisted;
  const showReminder = necesitaRecordatorioRespaldo(salidas.length);

  // Fecha del último respaldo
  const lastBackupStr = localStorage.getItem('abasto_last_backup');
  let textoUltimoRespaldo = 'Aún no has generado ningún respaldo.';
  if (lastBackupStr) {
    const ts = parseInt(lastBackupStr, 10);
    if (!isNaN(ts)) {
      const fechaObj = new Date(ts);
      const opciones = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      textoUltimoRespaldo = `Último respaldo generado: ${fechaObj.toLocaleDateString('es-PE', opciones)}`;
    }
  }

  const html = `
    <!-- Barra superior de navegación -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button id="btn-volver-atras" class="btn btn-outline" style="min-height: 40px; padding: 6px 12px; font-size: 0.9rem;">
        ◀ Volver
      </button>
      <div style="text-align: right; flex: 1;">
        <h2 style="font-size: 1.25rem; font-weight: 800; line-height: 1.2;">
          Respaldos y Exportación
        </h2>
        <span style="font-size: 0.8rem; color: var(--color-text-dim);">
          Protege tus compras y transfiérelas a tu PC
        </span>
      </div>
    </div>

    <!-- Banner de Recordatorio de Respaldo periódico (> 7 días) -->
    ${showReminder ? `
      <div class="card" style="background: var(--color-warning-light); border: 2px solid var(--color-warning); padding: 14px; display: flex; align-items: flex-start; gap: 10px;">
        <span style="font-size: 1.5rem;">⚠️</span>
        <div style="flex: 1;">
          <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--color-text);">
            Recordatorio de Seguridad
          </h4>
          <p style="font-size: 0.85rem; color: var(--color-text); margin-top: 2px;">
            Hace más de 7 días que no descargas un respaldo de tus compras. Recuerda que los datos están guardados solo en este dispositivo.
          </p>
        </div>
      </div>
    ` : ''}

    <!-- SECCIÓN 1: Respaldo Completo (JSON) -->
    <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.5rem;">💾</span>
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 800;">Respaldo Completo (JSON)</h3>
          <p style="font-size: 0.85rem; color: var(--color-text-dim);">
            Exporta o restaura todas tus compras, stands y listas planificadas.
          </p>
        </div>
      </div>

      <div style="background: var(--color-surface-hover); padding: 10px; border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--color-text-muted);">
        ℹ️ <strong>Uso recomendado:</strong> Descarga este archivo en tu celular y pásalo a tu computadora por WhatsApp o cable, o úsalo para restaurar si cambias de teléfono.
        <div style="margin-top: 4px; font-weight: 600; color: var(--color-primary);">
          ${textoUltimoRespaldo}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <button id="btn-exportar-json" class="btn btn-primary" style="font-weight: 800; font-size: 0.9rem; padding: 12px 8px;">
          ⬇️ Descargar Respaldo
        </button>
        <button id="btn-importar-json-trigger" class="btn btn-outline" style="font-weight: 800; font-size: 0.9rem; padding: 12px 8px;">
          📁 Elegir Archivo
        </button>
        <input type="file" id="input-archivo-json" accept=".json,application/json,text/plain,*/*" style="display: none;" />
      </div>

      <button id="btn-pegar-json-trigger" class="btn btn-outline" style="font-size: 0.85rem; padding: 10px 8px; font-weight: 700; width: 100%; border-style: dashed;">
        📋 O pegar texto del respaldo directamente (Sin buscar archivos)
      </button>
    </div>

    <!-- SECCIÓN 2: Exportar Resumen a Excel (CSV) y Compartir -->
    <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.5rem;">📊</span>
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 800;">Resumen para Excel y WhatsApp</h3>
          <p style="font-size: 0.85rem; color: var(--color-text-dim);">
            Exporta el reporte en CSV (compatible con Excel con tildes) o compártelo.
          </p>
        </div>
      </div>

      ${salidas.length === 0 ? `
        <p style="font-size: 0.85rem; color: var(--color-text-muted); text-align: center; padding: 12px;">
          No tienes salidas de compras registradas aún.
        </p>
      ` : `
        <div class="form-group">
          <label class="form-label" for="select-salida-exportar">Selecciona la compra a exportar:</label>
          <select id="select-salida-exportar" class="form-select" style="min-height: 44px; font-size: 0.95rem; font-weight: 600;">
            ${salidas.map(s => `
              <option value="${s.id}">
                ${s.fecha} - ${escapeHtml(s.nombre || 'Sin nombre')} (${(s.stands || []).length} stands)
              </option>
            `).join('')}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button id="btn-exportar-csv" class="btn btn-outline" style="font-weight: 700; font-size: 0.85rem; padding: 10px 6px;">
            📄 Exportar CSV (Excel)
          </button>
          <button id="btn-compartir-whatsapp" class="btn btn-outline" style="font-weight: 700; font-size: 0.85rem; padding: 10px 6px; color: #16a34a; border-color: #16a34a;">
            📲 Enviar por WhatsApp
          </button>
        </div>
      `}
    </div>

    <!-- SECCIÓN 3: Estado de Almacenamiento Persistente -->
    <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 1.5rem;">🔒</span>
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 800;">Protección del Navegador</h3>
          <p style="font-size: 0.85rem; color: var(--color-text-dim);">
            Almacenamiento persistente en IndexedDB (100% local, costo S/ 0).
          </p>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--color-surface-hover); padding: 12px; border-radius: var(--radius-sm);">
        <div>
          <div style="font-weight: 800; font-size: 0.9rem; color: ${isPersisted ? 'var(--color-success)' : 'var(--color-warning)'};">
            ${isPersisted ? '✓ Almacenamiento Persistente Activado' : '⚠️ Almacenamiento Local Estándar'}
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-dim); margin-top: 2px;">
            ${isPersisted
              ? 'Tus datos están protegidos contra limpiezas automáticas del navegador.'
              : 'El navegador podría borrar datos si el espacio en disco es bajo.'}
          </div>
        </div>

        ${!isPersisted ? `
          <button id="btn-solicitar-persistencia" class="btn btn-outline" style="min-height: 36px; padding: 4px 10px; font-size: 0.8rem; font-weight: 700; white-space: nowrap;">
            Activar Protección
          </button>
        ` : ''}
      </div>
    </div>

    <!-- MODAL DE IMPORTACIÓN: Opciones 'Reemplazar todo' vs 'Combinar por id' -->
    <div id="modal-importar-json" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 520px;" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Restaurar Respaldo</h3>
          <button id="btn-cerrar-modal-imp" class="btn-icon">✕</button>
        </div>

        <div id="resumen-archivo-importar" style="background: var(--color-surface-hover); padding: 12px; border-radius: var(--radius-sm); font-size: 0.9rem; line-height: 1.4;">
          <!-- Detalle del archivo analizado -->
        </div>

        <div style="margin-top: 12px;">
          <label style="font-weight: 800; font-size: 0.9rem; display: block; margin-bottom: 8px;">
            ¿Cómo deseas importar estas salidas?
          </label>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <!-- Opción Combinar -->
            <label style="display: flex; gap: 10px; padding: 10px; border: 1.5px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; align-items: flex-start;">
              <input type="radio" name="modo-importacion" value="combinar" checked style="margin-top: 4px;" />
              <div>
                <strong style="color: var(--color-primary);">Combinar por ID (Recomendado)</strong>
                <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                  Conserva tus salidas actuales. Agrega las nuevas del archivo y actualiza solo las que coincidan por ID si el archivo es más reciente. No duplica información.
                </p>
              </div>
            </label>

            <!-- Opción Reemplazar -->
            <label style="display: flex; gap: 10px; padding: 10px; border: 1.5px solid var(--color-danger); border-radius: var(--radius-sm); cursor: pointer; align-items: flex-start; background: rgba(239, 68, 68, 0.05);">
              <input type="radio" name="modo-importacion" value="reemplazar" style="margin-top: 4px;" />
              <div>
                <strong style="color: var(--color-danger);">Reemplazar Todo</strong>
                <p style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                  ⚠️ Borra todas las salidas actuales de este dispositivo y las reemplaza por las del archivo de respaldo. Acción irreversible.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 16px;">
          <button id="btn-cancelar-importacion" class="btn btn-outline">Cancelar</button>
          <button id="btn-confirmar-importacion" class="btn btn-primary" style="font-weight: 800;">
            Confirmar e Importar
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL PEGAR TEXTO JSON DIRECTO (Sin buscar en el gestor de archivos) -->
    <div id="modal-pegar-json" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 520px;" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Pegar Texto del Respaldo</h3>
          <button id="btn-cerrar-modal-pegar-json" class="btn-icon">✕</button>
        </div>

        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 8px;">
          Abre el archivo en tu celular o copia el texto de tu mensaje y pégalo aquí:
        </p>

        <textarea
          id="textarea-pegar-json"
          class="form-textarea"
          rows="8"
          placeholder='Pega aquí el contenido que empieza con {"app":"Abasto"...'
          style="font-family: monospace; font-size: 0.8rem;"
        ></textarea>

        <div class="modal-actions" style="margin-top: 12px;">
          <button id="btn-cancelar-pegar-json" class="btn btn-outline">Cancelar</button>
          <button id="btn-procesar-pegar-json" class="btn btn-primary" style="font-weight: 800;">
            Validar y Continuar ➔
          </button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Botón Volver
  container.querySelector('#btn-volver-atras')?.addEventListener('click', () => {
    window.history.back();
  });

  // Exportar Respaldo JSON
  container.querySelector('#btn-exportar-json')?.addEventListener('click', () => {
    if (salidas.length === 0) {
      if (!confirm('No tienes ninguna salida guardada todavía. ¿Deseas descargar un respaldo vacío?')) {
        return;
      }
    }
    const nombre = exportarJSONRespaldo(salidas);
    alert(`✓ Respaldo descargado exitosamente como:\n${nombre}`);
    renderBackupView(container);
  });

  // Selector de Archivo JSON para Importar
  const inputJson = container.querySelector('#input-archivo-json');
  const btnImportarTrigger = container.querySelector('#btn-importar-json-trigger');
  const modalImportar = container.querySelector('#modal-importar-json');
  const resumenImportar = container.querySelector('#resumen-archivo-importar');
  let datosValidadosAImportar = null;

  btnImportarTrigger?.addEventListener('click', () => {
    inputJson.value = '';
    inputJson.click();
  });

  // Modal Pegar Texto JSON
  const modalPegarJson = container.querySelector('#modal-pegar-json');
  const textareaPegarJson = container.querySelector('#textarea-pegar-json');
  const btnPegarJsonTrigger = container.querySelector('#btn-pegar-json-trigger');

  btnPegarJsonTrigger?.addEventListener('click', () => {
    textareaPegarJson.value = '';
    modalPegarJson.style.display = 'flex';
    setTimeout(() => textareaPegarJson.focus(), 50);
  });

  const cerrarModalPegarJson = () => {
    modalPegarJson.style.display = 'none';
  };
  container.querySelector('#btn-cerrar-modal-pegar-json')?.addEventListener('click', cerrarModalPegarJson);
  container.querySelector('#btn-cancelar-pegar-json')?.addEventListener('click', cerrarModalPegarJson);

  container.querySelector('#btn-procesar-pegar-json')?.addEventListener('click', () => {
    const contenido = textareaPegarJson.value.trim();
    if (!contenido) {
      alert('Pega el texto del respaldo en la casilla.');
      textareaPegarJson.focus();
      return;
    }

    const resultado = validarJSONRespaldo(contenido);
    if (!resultado.ok) {
      alert('❌ Error al validar el texto:\n' + resultado.error);
      return;
    }

    datosValidadosAImportar = resultado.data;
    const cantSalidas = datosValidadosAImportar.salidas.length;
    const fechaExport = datosValidadosAImportar.exportedAt
      ? new Date(datosValidadosAImportar.exportedAt).toLocaleString('es-PE')
      : 'Desconocida';

    resumenImportar.innerHTML = `
      <div><strong>Origen:</strong> Texto pegado directamente</div>
      <div><strong>Fecha de exportación:</strong> ${fechaExport}</div>
      <div><strong>Salidas encontradas:</strong> ${cantSalidas}</div>
      <div><strong>Salidas locales actuales:</strong> ${salidas.length}</div>
    `;

    cerrarModalPegarJson();
    modalImportar.style.display = 'flex';
  });

  inputJson?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const contenido = evt.target.result;
      const resultado = validarJSONRespaldo(contenido);

      if (!resultado.ok) {
        alert('❌ Error al leer el respaldo:\n' + resultado.error);
        return;
      }

      datosValidadosAImportar = resultado.data;
      const cantSalidas = datosValidadosAImportar.salidas.length;
      const fechaExport = datosValidadosAImportar.exportedAt
        ? new Date(datosValidadosAImportar.exportedAt).toLocaleString('es-PE')
        : 'Desconocida';

      resumenImportar.innerHTML = `
        <div><strong>Archivo:</strong> ${escapeHtml(file.name)}</div>
        <div><strong>Fecha de exportación:</strong> ${fechaExport}</div>
        <div><strong>Salidas encontradas:</strong> ${cantSalidas}</div>
        <div><strong>Salidas locales actuales:</strong> ${salidas.length}</div>
      `;

      modalImportar.style.display = 'flex';
    };
    reader.readAsText(file);
  });

  const cerrarModalImportar = () => {
    modalImportar.style.display = 'none';
    datosValidadosAImportar = null;
  };

  container.querySelector('#btn-cerrar-modal-imp')?.addEventListener('click', cerrarModalImportar);
  container.querySelector('#btn-cancelar-importacion')?.addEventListener('click', cerrarModalImportar);

  // Confirmar Importación
  container.querySelector('#btn-confirmar-importacion')?.addEventListener('click', async () => {
    if (!datosValidadosAImportar) return;

    const radios = container.querySelectorAll('input[name="modo-importacion"]');
    let modoSeleccionado = 'combinar';
    radios.forEach(r => {
      if (r.checked) modoSeleccionado = r.value;
    });

    if (modoSeleccionado === 'reemplazar') {
      const confirma = confirm('⚠️ ATENCIÓN: Se eliminarán todas las salidas actuales del dispositivo y se reemplazarán con las del archivo.\n\n¿Estás completamente seguro de continuar?');
      if (!confirma) return;
    }

    try {
      await importarRespaldoAction(datosValidadosAImportar.salidas, modoSeleccionado);
      cerrarModalImportar();
      alert(`✓ Importación completada con éxito en modo '${modoSeleccionado}'.`);
      window.location.hash = '#home';
    } catch (err) {
      alert('❌ Error al guardar las salidas importadas: ' + err.message);
    }
  });

  // Exportar Resumen CSV de Salida Seleccionada
  const selectSalida = container.querySelector('#select-salida-exportar');
  container.querySelector('#btn-exportar-csv')?.addEventListener('click', () => {
    if (!selectSalida) return;
    const salidaId = selectSalida.value;
    const salida = salidas.find(s => s.id === salidaId);
    if (!salida) {
      alert('Selecciona una salida válida.');
      return;
    }
    const nombre = exportarCSVResumen(salida);
    alert(`✓ Resumen CSV descargado exitosamente como:\n${nombre}\n\nPuedes abrirlo directamente en Excel.`);
  });

  // Compartir por WhatsApp
  container.querySelector('#btn-compartir-whatsapp')?.addEventListener('click', async () => {
    if (!selectSalida) return;
    const salidaId = selectSalida.value;
    const salida = salidas.find(s => s.id === salidaId);
    if (!salida) {
      alert('Selecciona una salida válida.');
      return;
    }
    await compartirResumenWhatsApp(salida);
  });

  // Solicitar Almacenamiento Persistente
  container.querySelector('#btn-solicitar-persistencia')?.addEventListener('click', async () => {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const persisted = await navigator.storage.persist();
        setStoragePersisted(persisted);
        if (persisted) {
          alert('✓ ¡Protección activada! El navegador ha concedido almacenamiento persistente.');
        } else {
          alert('ℹ️ El navegador no concedió almacenamiento persistente automáticamente. Instala la app como PWA para otorgarle mayor prioridad.');
        }
        renderBackupView(container);
      } catch (e) {
        alert('No se pudo solicitar persistencia: ' + e.message);
      }
    } else {
      alert('Tu navegador no soporta la API de persistencia de almacenamiento.');
    }
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
