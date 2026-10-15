/**
 * Vista de Lista de Compras Planificada:
 * Checklist de lo planificado (estado comprado derivado dinámicamente).
 * Carga manual, pegar texto e importación CSV con Vista Previa Editable obligatoria.
 */

import {
  getState,
  agregarItemPlanificadoAction,
  agregarMultiplesItemsPlanificadosAction,
  actualizarItemPlanificadoAction,
  eliminarItemPlanificadoAction,
  limpiarListaPlanificadaAction
} from '../store.js';
import { derivarEstadoLista, normalizarTexto, normalizarUnidad } from '../models.js';
import { interpretarTextoCompleto, parsearCSV, decodificarBufferTexto } from '../parser.js';

let filtroEstado = 'todos'; // 'todos' | 'pendientes' | 'comprados'

export function renderListaView(container, salidaId) {
  const state = getState();
  const salida = (state.salidas || []).find(s => s.id === salidaId);

  if (!salida) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <h3>Salida no encontrada</h3>
        <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.location.hash='#home'">
          Volver al Inicio
        </button>
      </div>
    `;
    return;
  }

  const itemsEnriquecidos = derivarEstadoLista(salida);
  const totalItems = itemsEnriquecidos.length;
  const compradosCount = itemsEnriquecidos.filter(i => i.comprado).length;
  const pendientesCount = totalItems - compradosCount;
  const stands = Array.isArray(salida.stands) ? salida.stands : [];
  const catalogo = state.catalogo || { productos: [], unidades: [] };

  // Filtrar según píldora seleccionada
  let itemsFiltrados = itemsEnriquecidos;
  if (filtroEstado === 'pendientes') {
    itemsFiltrados = itemsEnriquecidos.filter(i => !i.comprado);
  } else if (filtroEstado === 'comprados') {
    itemsFiltrados = itemsEnriquecidos.filter(i => i.comprado);
  }

  const html = `
    <!-- Barra superior de navegación -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button id="btn-volver-stands" class="btn btn-outline" style="min-height: 40px; padding: 6px 12px; font-size: 0.9rem;">
        ◀ Volver a Stands
      </button>
      <div style="text-align: right; flex: 1;">
        <span style="font-size: 0.8rem; color: var(--color-text-dim);">
          ${escapeHtml(salida.nombre || 'Compra')}
        </span>
        <h2 style="font-size: 1.2rem; font-weight: 800; line-height: 1.2;">
          Lista Planificada
        </h2>
      </div>
    </div>

    <!-- Pestañas de la salida actual -->
    <div class="nav-tabs">
      <button id="tab-stands-nav" class="nav-tab-btn">Stands (${stands.length})</button>
      <button class="nav-tab-btn active">Lista Planificada (${totalItems})</button>
      <button id="tab-resumen-nav" class="nav-tab-btn">Resumen Final</button>
    </div>

    <!-- Botones de Acción Rápida: Pegar Texto y CSV -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <button id="btn-abrir-pegar-texto" class="btn btn-outline" style="font-size: 0.9rem; font-weight: 700; padding: 8px;">
        📋 Pegar texto
      </button>
      <button id="btn-abrir-importar-csv" class="btn btn-outline" style="font-size: 0.9rem; font-weight: 700; padding: 8px;">
        📁 Importar CSV (Excel)
      </button>
      <input type="file" id="input-archivo-csv" accept=".csv,text/csv" style="display: none;" />
    </div>

    <!-- Formulario de Entrada Manual de Ítems -->
    <div class="card" style="padding: 12px; border: 1.5px solid var(--color-border);">
      <h3 style="font-size: 0.95rem; font-weight: 800; color: var(--color-text-muted); text-transform: uppercase;">
        ➕ Agregar Ítem a la Lista
      </h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        <div class="form-group">
          <input
            type="text"
            id="manual-prod-nombre"
            class="form-input"
            placeholder="Producto (ej. Harina Anita)"
            list="sug-lista-prod"
            autocomplete="off"
          />
          <datalist id="sug-lista-prod">
            ${catalogo.productos.map(p => `<option value="${escapeHtml(p.nombre)}"></option>`).join('')}
          </datalist>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1.5fr auto; gap: 8px;">
          <input
            type="number"
            id="manual-prod-cantidad"
            class="form-input input-money"
            step="any"
            min="0.01"
            value="1"
            inputmode="decimal"
            placeholder="Cant."
          />
          <input
            type="text"
            id="manual-prod-unidad"
            class="form-input"
            placeholder="Unidad (saco, caja...)"
            list="sug-lista-unid"
            autocomplete="off"
          />
          <datalist id="sug-lista-unid">
            ${['caja', 'saco', 'bolsa', 'balde', 'bidón', 'jaba', 'cartón', 'paquete', 'docena', 'kg', 'unidad'].map(u => `<option value="${u}"></option>`).join('')}
          </datalist>
          <button id="btn-manual-agregar" class="btn btn-primary" style="padding: 0 16px; font-weight: 800;">
            ➕
          </button>
        </div>
      </div>
    </div>

    <!-- Filtros de Estado: Todos / Pendientes / Comprados -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <div style="display: flex; gap: 4px;">
        <button class="btn btn-outline btn-filtro ${filtroEstado === 'todos' ? 'active' : ''}" data-filtro="todos" style="min-height: 36px; padding: 4px 10px; font-size: 0.85rem; border-radius: 999px;">
          Todos (${totalItems})
        </button>
        <button class="btn btn-outline btn-filtro ${filtroEstado === 'pendientes' ? 'active' : ''}" data-filtro="pendientes" style="min-height: 36px; padding: 4px 10px; font-size: 0.85rem; border-radius: 999px;">
          ⏳ Pendientes (${pendientesCount})
        </button>
        <button class="btn btn-outline btn-filtro ${filtroEstado === 'comprados' ? 'active' : ''}" data-filtro="comprados" style="min-height: 36px; padding: 4px 10px; font-size: 0.85rem; border-radius: 999px;">
          ✓ Comprados (${compradosCount})
        </button>
      </div>

      ${totalItems > 0 ? `
        <button id="btn-limpiar-lista" class="btn btn-danger-outline" style="min-height: 36px; padding: 4px 8px; font-size: 0.75rem;">
          Vaciar lista
        </button>
      ` : ''}
    </div>

    <!-- Lista de Ítems Planificados -->
    ${itemsFiltrados.length === 0 ? `
      <div class="card" style="text-align: center; padding: 32px 16px; color: var(--color-text-dim);">
        <p style="font-size: 2rem; margin-bottom: 6px;">📝</p>
        <p style="font-weight: 700; color: var(--color-text);">No hay ítems en esta vista</p>
        <p style="font-size: 0.85rem; margin-top: 4px;">
          ${totalItems === 0
            ? 'Agrega productos manualmente, pega tu lista en texto o importa un CSV desde Excel.'
            : 'No hay productos que coincidan con el filtro seleccionado.'}
        </p>
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${itemsFiltrados.map(item => {
          return `
            <div class="card" style="padding: 12px; border-left: 5px solid ${item.comprado ? 'var(--color-success)' : 'var(--color-warning)'};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--color-text); text-decoration: ${item.comprado ? 'line-through' : 'none'}; opacity: ${item.comprado ? '0.85' : '1'};">
                      ${escapeHtml(item.producto)}
                    </h4>
                    <span class="badge ${item.comprado ? 'badge-success' : 'badge-warning'}">
                      ${item.comprado ? '✓ Comprado' : '⏳ Pendiente'}
                    </span>
                  </div>

                  <div style="font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin-top: 3px;">
                    Planeado: ${item.cantidadPlaneada} ${escapeHtml(item.unidad || 'unidad')}
                    ${item.comprado ? ` · Comprado: ${item.cantidadComprada} ${escapeHtml(item.unidad || 'unidad')}` : ''}
                  </div>

                  ${item.comprado && item.lineasAsociadas && item.lineasAsociadas.length > 0 ? `
                    <div style="font-size: 0.8rem; color: var(--color-text-dim); margin-top: 2px;">
                      Comprado en: ${item.lineasAsociadas.map(l => `${escapeHtml(l.standNombre)} (${l.cantidad})`).join(', ')}
                    </div>
                  ` : ''}
                </div>

                <div style="display: flex; align-items: center; gap: 4px;">
                  <button class="btn btn-outline btn-icon" style="min-height: 36px; width: 36px;" data-action="editar-item" data-id="${item.id}" title="Editar">
                    ✏️
                  </button>
                  <button class="btn btn-danger-outline btn-icon" style="min-height: 36px; width: 36px;" data-action="eliminar-item" data-id="${item.id}" title="Eliminar">
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}

    <!-- MODAL 1: Pegar Texto Libre -->
    <div id="modal-pegar-texto" class="modal-overlay" style="display: none;">
      <div class="modal-content" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Pegar Lista de Compras</h3>
          <button id="btn-cerrar-pegar" class="btn-icon">✕</button>
        </div>

        <p style="font-size: 0.85rem; color: var(--color-text-muted);">
          Pega un producto por línea (ej. <em>"10 sacos harina Anita"</em> o <em>"2 cajas aceite Beltrán"</em>). Podrás revisar y editar antes de guardar.
        </p>

        <textarea
          id="textarea-pegar-lista"
          class="form-textarea"
          rows="7"
          placeholder="10 sacos harina Anita&#10;2 cajas aceite Beltrán&#10;5 bolsas fideo tallarín&#10;arroz costeño 50 kg"
          style="font-size: 0.95rem; line-height: 1.4;"
        ></textarea>

        <div class="modal-actions">
          <button id="btn-cancelar-pegar" class="btn btn-outline">Cancelar</button>
          <button id="btn-procesar-texto" class="btn btn-primary">Interpretar y Revisar ➔</button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: VISTA PREVIA EDITABLE OBLIGATORIA (Requisito fundamental) -->
    <div id="modal-vista-previa" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 620px;" onclick="event.stopPropagation();">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Vista Previa Editable</h3>
            <span style="font-size: 0.8rem; color: var(--color-text-muted);">
              Verifica y corrige la interpretación antes de confirmar.
            </span>
          </div>
          <button id="btn-cerrar-previa" class="btn-icon">✕</button>
        </div>

        <!-- Tabla editable de filas interpretadas -->
        <div id="contenedor-filas-previa" style="max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
          <!-- Se inyectan las filas editables dinámicamente -->
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--color-border);">
          <button id="btn-agregar-fila-previa" class="btn btn-outline" style="min-height: 36px; padding: 4px 10px; font-size: 0.85rem;">
            ➕ Agregar otra fila
          </button>
          <div class="modal-actions">
            <button id="btn-cancelar-previa" class="btn btn-outline">Descartar</button>
            <button id="btn-confirmar-previa" class="btn btn-primary" style="font-weight: 800;">
              Confirmar y Guardar
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 3: Editar Ítem Existente -->
    <div id="modal-editar-item" class="modal-overlay" style="display: none;">
      <div class="modal-content" onclick="event.stopPropagation();">
        <div class="modal-header">
          <h3 class="modal-title">Editar Producto Planeado</h3>
          <button id="btn-cerrar-edit-item" class="btn-icon">✕</button>
        </div>

        <input type="hidden" id="edit-item-id" />

        <div class="form-group">
          <label class="form-label" for="edit-item-nombre">Producto</label>
          <input type="text" id="edit-item-nombre" class="form-input" />
        </div>

        <div class="linea-form-grid">
          <div class="form-group">
            <label class="form-label" for="edit-item-cantidad">Cantidad Planeada</label>
            <input type="number" id="edit-item-cantidad" class="form-input input-money" step="any" min="0.01" inputmode="decimal" />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-item-unidad">Unidad</label>
            <input type="text" id="edit-item-unidad" class="form-input" />
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 10px;">
          <button id="btn-cancelar-edit-item" class="btn btn-outline">Cancelar</button>
          <button id="btn-guardar-edit-item" class="btn btn-primary">Guardar Cambios</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Navegación entre pestañas
  container.querySelector('#btn-volver-stands')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#tab-stands-nav')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#tab-resumen-nav')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}/resumen`;
  });

  // Filtros de estado (Todos / Pendientes / Comprados)
  container.querySelectorAll('.btn-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroEstado = btn.dataset.filtro;
      renderListaView(container, salidaId);
    });
  });

  // Agregar Ítem Manual
  const inputManualProd = container.querySelector('#manual-prod-nombre');
  const inputManualCant = container.querySelector('#manual-prod-cantidad');
  const inputManualUnid = container.querySelector('#manual-prod-unidad');
  const btnManualAgregar = container.querySelector('#btn-manual-agregar');

  const ejecutarAgregarManual = async () => {
    const producto = inputManualProd.value.trim();
    if (!producto) {
      inputManualProd.focus();
      return;
    }
    const cantidadPlaneada = parseFloat(inputManualCant.value) || 1;
    const unidad = normalizarUnidad(inputManualUnid.value.trim() || 'unidad');

    await agregarItemPlanificadoAction(salidaId, producto, cantidadPlaneada, unidad);

    inputManualProd.value = '';
    inputManualCant.value = '1';
    inputManualUnid.value = '';
    inputManualProd.focus();
  };

  btnManualAgregar?.addEventListener('click', ejecutarAgregarManual);
  [inputManualProd, inputManualCant, inputManualUnid].forEach(input => {
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ejecutarAgregarManual();
      }
    });
  });

  // Modal Pegar Texto
  const modalPegar = container.querySelector('#modal-pegar-texto');
  const textareaPegar = container.querySelector('#textarea-pegar-lista');

  container.querySelector('#btn-abrir-pegar-texto')?.addEventListener('click', () => {
    modalPegar.style.display = 'flex';
    textareaPegar.value = '';
    setTimeout(() => textareaPegar.focus(), 50);
  });

  const cerrarModalPegar = () => {
    modalPegar.style.display = 'none';
  };
  container.querySelector('#btn-cerrar-pegar')?.addEventListener('click', cerrarModalPegar);
  container.querySelector('#btn-cancelar-pegar')?.addEventListener('click', cerrarModalPegar);
  modalPegar.addEventListener('click', (e) => {
    if (e.target === modalPegar) cerrarModalPegar();
  });

  // Modal Vista Previa Editable (Obligatoria)
  const modalPrevia = container.querySelector('#modal-vista-previa');
  const contenedorFilas = container.querySelector('#contenedor-filas-previa');
  let itemsEnPrevia = [];

  const abrirVistaPrevia = (items) => {
    itemsEnPrevia = items.map((it, idx) => ({
      _id: idx,
      producto: it.producto || '',
      cantidadPlaneada: it.cantidadPlaneada || 1,
      unidad: it.unidad || 'unidad'
    }));

    renderFilasPrevia();
    modalPrevia.style.display = 'flex';
  };

  const renderFilasPrevia = () => {
    if (itemsEnPrevia.length === 0) {
      contenedorFilas.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--color-text-dim);">
          No hay filas para importar. Agrega una fila abajo.
        </div>
      `;
      return;
    }

    contenedorFilas.innerHTML = itemsEnPrevia.map(item => `
      <div class="fila-previa" data-previa-id="${item._id}" style="display: grid; grid-template-columns: 2fr 1fr 1.2fr auto; gap: 6px; align-items: center; background: var(--color-surface-hover); padding: 6px; border-radius: var(--radius-sm);">
        <input type="text" class="form-input input-previa-prod" value="${escapeHtml(item.producto)}" placeholder="Producto" style="min-height: 38px; font-size: 0.9rem;" />
        <input type="number" class="form-input input-previa-cant input-money" value="${item.cantidadPlaneada}" step="any" min="0.01" inputmode="decimal" style="min-height: 38px; font-size: 0.9rem;" />
        <input type="text" class="form-input input-previa-unid" value="${escapeHtml(item.unidad)}" placeholder="Unidad" style="min-height: 38px; font-size: 0.9rem;" />
        <button type="button" class="btn btn-danger-outline btn-icon btn-quitar-fila-previa" style="min-height: 38px; width: 38px;" title="Quitar">
          🗑️
        </button>
      </div>
    `).join('');

    // Listeners en cada fila
    contenedorFilas.querySelectorAll('.fila-previa').forEach(row => {
      const id = parseInt(row.dataset.previaId, 10);
      const inputProd = row.querySelector('.input-previa-prod');
      const inputCant = row.querySelector('.input-previa-cant');
      const inputUnid = row.querySelector('.input-previa-unid');
      const btnQuitar = row.querySelector('.btn-quitar-fila-previa');

      inputProd.addEventListener('input', () => {
        const it = itemsEnPrevia.find(x => x._id === id);
        if (it) it.producto = inputProd.value;
      });

      inputCant.addEventListener('input', () => {
        const it = itemsEnPrevia.find(x => x._id === id);
        if (it) it.cantidadPlaneada = parseFloat(inputCant.value) || 1;
      });

      inputUnid.addEventListener('input', () => {
        const it = itemsEnPrevia.find(x => x._id === id);
        if (it) it.unidad = inputUnid.value;
      });

      btnQuitar.addEventListener('click', () => {
        itemsEnPrevia = itemsEnPrevia.filter(x => x._id !== id);
        renderFilasPrevia();
      });
    });
  };

  container.querySelector('#btn-agregar-fila-previa')?.addEventListener('click', () => {
    const nuevoId = itemsEnPrevia.length > 0 ? Math.max(...itemsEnPrevia.map(x => x._id)) + 1 : 1;
    itemsEnPrevia.push({ _id: nuevoId, producto: '', cantidadPlaneada: 1, unidad: 'unidad' });
    renderFilasPrevia();
    setTimeout(() => {
      const inputs = contenedorFilas.querySelectorAll('.input-previa-prod');
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 50);
  });

  const cerrarModalPrevia = () => {
    modalPrevia.style.display = 'none';
  };
  container.querySelector('#btn-cerrar-previa')?.addEventListener('click', cerrarModalPrevia);
  container.querySelector('#btn-cancelar-previa')?.addEventListener('click', cerrarModalPrevia);

  // Procesar texto pegado -> Abre Vista Previa Editable
  container.querySelector('#btn-procesar-texto')?.addEventListener('click', () => {
    const texto = textareaPegar.value.trim();
    if (!texto) {
      alert('Pega al menos una línea con productos.');
      textareaPegar.focus();
      return;
    }

    const itemsParseados = interpretarTextoCompleto(texto);
    if (itemsParseados.length === 0) {
      alert('No se pudieron identificar productos en el texto.');
      return;
    }

    cerrarModalPegar();
    abrirVistaPrevia(itemsParseados);
  });

  // Importar CSV -> Abre Vista Previa Editable
  const inputCsv = container.querySelector('#input-archivo-csv');
  container.querySelector('#btn-abrir-importar-csv')?.addEventListener('click', () => {
    inputCsv.value = '';
    inputCsv.click();
  });

  inputCsv?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const buffer = evt.target.result;
      const csvContent = decodificarBufferTexto(buffer);
      const itemsCSV = parsearCSV(csvContent);
      if (itemsCSV.length === 0) {
        alert('El archivo CSV está vacío o no contiene columnas válidas (producto, cantidad, unidad).');
        return;
      }
      abrirVistaPrevia(itemsCSV);
    };
    reader.readAsArrayBuffer(file);
  });

  // Confirmar y Guardar Ítems de la Vista Previa
  container.querySelector('#btn-confirmar-previa')?.addEventListener('click', async () => {
    const validos = itemsEnPrevia
      .map(it => ({
        producto: it.producto.trim(),
        cantidadPlaneada: Number(it.cantidadPlaneada) || 1,
        unidad: normalizarUnidad(it.unidad.trim() || 'unidad')
      }))
      .filter(it => it.producto.length > 0);

    if (validos.length === 0) {
      alert('Debes ingresar al menos un producto con nombre válido.');
      return;
    }

    await agregarMultiplesItemsPlanificadosAction(salidaId, validos);
    cerrarModalPrevia();
  });

  // Modal Editar Ítem
  const modalEdit = container.querySelector('#modal-editar-item');
  const editId = container.querySelector('#edit-item-id');
  const editNombre = container.querySelector('#edit-item-nombre');
  const editCantidad = container.querySelector('#edit-item-cantidad');
  const editUnidad = container.querySelector('#edit-item-unidad');

  container.querySelectorAll('[data-action="editar-item"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = itemsEnriquecidos.find(i => i.id === id);
      if (!item) return;

      editId.value = item.id;
      editNombre.value = item.producto;
      editCantidad.value = item.cantidadPlaneada;
      editUnidad.value = item.unidad || 'unidad';

      modalEdit.style.display = 'flex';
      setTimeout(() => editCantidad.focus(), 50);
    });
  });

  const cerrarModalEdit = () => {
    modalEdit.style.display = 'none';
  };
  container.querySelector('#btn-cerrar-edit-item')?.addEventListener('click', cerrarModalEdit);
  container.querySelector('#btn-cancelar-edit-item')?.addEventListener('click', cerrarModalEdit);

  container.querySelector('#btn-guardar-edit-item')?.addEventListener('click', async () => {
    const id = editId.value;
    const producto = editNombre.value.trim();
    const cantidadPlaneada = parseFloat(editCantidad.value) || 1;
    const unidad = normalizarUnidad(editUnidad.value.trim() || 'unidad');

    if (!producto) {
      alert('Ingresa el nombre del producto.');
      return;
    }

    const itemExistente = salida.listaPlanificada.find(i => i.id === id);
    if (itemExistente) {
      await actualizarItemPlanificadoAction(salidaId, {
        ...itemExistente,
        producto,
        cantidadPlaneada,
        unidad
      });
    }
    cerrarModalEdit();
  });

  // Eliminar Ítem
  container.querySelectorAll('[data-action="eliminar-item"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('¿Eliminar este ítem de la lista planificada?')) {
        await eliminarItemPlanificadoAction(salidaId, id);
      }
    });
  });

  // Vaciar Lista Completa
  container.querySelector('#btn-limpiar-lista')?.addEventListener('click', async () => {
    if (confirm('¿Vaciar toda la lista planificada de esta salida?')) {
      await limpiarListaPlanificadaAction(salidaId);
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
