/**
 * Vista de Resumen Final de la Salida:
 * Selector con dos vistas: "Por stand" y "General por producto" (agrupado por producto+unidad).
 */

import { getState } from '../store.js';
import {
  calcularTotalesStand,
  calcularTotalesSalida,
  agruparPorProductoYUnidad,
  normalizarTexto,
  derivarEstadoLista
} from '../models.js';
import { formatMoney, centimosToSoles, describirDiferencia } from '../money.js';
import { exportarCSVResumen, compartirResumenWhatsApp } from '../export.js';

let vistaActiva = 'general'; // 'general' | 'stands'
let ordenActivo = 'gasto';   // 'gasto' | 'nombre'
let busquedaFiltro = '';
const expandidos = new Set();

export function renderResumenView(container, salidaId) {
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
  const gruposProductos = agruparPorProductoYUnidad(salida);
  const itemsPlanificados = derivarEstadoLista(salida);
  const compradosCount = itemsPlanificados.filter(i => i.comprado).length;
  const pendientesCount = itemsPlanificados.length - compradosCount;

  // Filtrado y ordenamiento de grupos de productos
  let gruposFiltrados = gruposProductos.filter(g => {
    if (!busquedaFiltro) return true;
    const term = normalizarTexto(busquedaFiltro);
    return g.productoNorm.includes(term) || normalizarTexto(g.unidad).includes(term);
  });

  if (ordenActivo === 'gasto') {
    gruposFiltrados.sort((a, b) => b.totalGastadoCentimos - a.totalGastadoCentimos);
  } else if (ordenActivo === 'nombre') {
    gruposFiltrados.sort((a, b) => a.productoNombre.localeCompare(b.productoNombre));
  }

  // Suma total calculada de líneas a partir de los grupos
  const sumaLineasGruposCentimos = gruposProductos.reduce((acc, g) => acc + g.totalGastadoCentimos, 0);

  const html = `
    <!-- Barra superior de navegación y acciones -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button id="btn-volver-stands" class="btn btn-outline" style="min-height: 40px; padding: 6px 12px; font-size: 0.9rem;">
        ◀ Volver a Stands
      </button>

      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
        <button id="btn-whatsapp-resumen" class="btn btn-outline" style="min-height: 38px; padding: 4px 8px; font-size: 0.8rem; color: #16a34a; border-color: #16a34a;" title="Compartir resumen por WhatsApp">
          📲 WhatsApp
        </button>
        <button id="btn-csv-resumen" class="btn btn-outline" style="min-height: 38px; padding: 4px 8px; font-size: 0.8rem;" title="Exportar a CSV compatible con Excel">
          📊 Excel
        </button>
        <button id="btn-imprimir-resumen" class="btn btn-outline" style="min-height: 38px; padding: 4px 8px; font-size: 0.8rem;" title="Imprimir o guardar PDF">
          🖨️ PDF
        </button>
      </div>
    </div>

    <!-- Título de la compra -->
    <div style="padding: 4px 0;">
      <h2 style="font-size: 1.3rem; font-weight: 800; line-height: 1.2;">
        Resumen de Compra
      </h2>
      <p style="font-size: 0.85rem; color: var(--color-text-muted);">
        ${escapeHtml(salida.nombre || 'Salida sin nombre')} · 📅 ${formatearFecha(salida.fecha)}
      </p>
    </div>

    <!-- Pestañas de la salida actual -->
    <div class="nav-tabs no-print">
      <button id="tab-stands-nav" class="nav-tab-btn">Stands (${stands.length})</button>
      <button id="tab-lista-nav" class="nav-tab-btn">Lista Planificada</button>
      <button class="nav-tab-btn active">Resumen Final</button>
    </div>

    <!-- Selector de Sub-Vistas del Resumen -->
    <div class="card no-print" style="padding: 6px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1.1fr; gap: 6px;">
        <button id="btn-vista-general" class="btn ${vistaActiva === 'general' ? 'btn-primary' : 'btn-outline'}" style="min-height: 42px; font-size: 0.85rem; padding: 4px 6px;">
          📦 Productos
        </button>
        <button id="btn-vista-stands" class="btn ${vistaActiva === 'stands' ? 'btn-primary' : 'btn-outline'}" style="min-height: 42px; font-size: 0.85rem; padding: 4px 6px;">
          🏬 Stands (${stands.length})
        </button>
        <button id="btn-vista-plan" class="btn ${vistaActiva === 'plan' ? 'btn-primary' : 'btn-outline'}" style="min-height: 42px; font-size: 0.85rem; padding: 4px 6px;">
          📋 Plan vs Comprado
        </button>
      </div>
    </div>

    ${vistaActiva === 'general' ? `
      <!-- SUB-VISTA: GENERAL POR PRODUCTO -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Barra de búsqueda y orden -->
        <div class="card no-print" style="padding: 10px; display: flex; flex-direction: column; gap: 8px;">
          <input
            type="search"
            id="input-filtro-prod"
            class="form-input"
            placeholder="🔍 Buscar por producto o unidad..."
            value="${escapeHtml(busquedaFiltro)}"
            style="min-height: 42px;"
          />
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span style="font-size: 0.85rem; font-weight: 700; color: var(--color-text-muted);">
              ${gruposFiltrados.length} ${gruposFiltrados.length === 1 ? 'grupo' : 'grupos'} (producto + unidad)
            </span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="select-orden-prod" style="font-size: 0.8rem; font-weight: 700; color: var(--color-text-dim);">Orden:</label>
              <select id="select-orden-prod" class="form-select" style="min-height: 36px; padding: 4px 8px; font-size: 0.85rem; width: auto;">
                <option value="gasto" ${ordenActivo === 'gasto' ? 'selected' : ''}>Mayor gasto</option>
                <option value="nombre" ${ordenActivo === 'nombre' ? 'selected' : ''}>A – Z</option>
              </select>
            </div>
          </div>
        </div>

        ${gruposFiltrados.length === 0 ? `
          <div class="card" style="text-align: center; padding: 32px 16px; color: var(--color-text-dim);">
            <p style="font-size: 2rem; margin-bottom: 6px;">📦</p>
            <p style="font-weight: 700; color: var(--color-text);">No hay productos que coincidan</p>
            <p style="font-size: 0.85rem; margin-top: 4px;">Registra productos en tus stands para ver el consolidado.</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${gruposFiltrados.map(grupo => {
              const estaExpandido = expandidos.has(grupo.clave);
              const mismoPrecio = grupo.precioMinimoCentimos === grupo.precioMaximoCentimos;

              return `
                <div class="card" style="padding: 12px; cursor: pointer; transition: border-color 0.15s;" data-action="toggle-grupo" data-clave="${escapeHtml(grupo.clave)}">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--color-text);">
                          ${escapeHtml(grupo.productoNombre)}
                        </h3>
                        <span class="badge" style="background: var(--color-primary-dark); color: #ffffff; text-transform: uppercase;">
                          ${escapeHtml(grupo.unidad)}
                        </span>
                      </div>

                      <div style="font-size: 0.95rem; font-weight: 700; color: var(--color-primary); margin-top: 4px;">
                        Cantidad total: ${grupo.cantidadTotal} ${escapeHtml(grupo.unidad)}
                      </div>

                      <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 2px;">
                        Promedio ponderado: <strong>${formatMoney(grupo.precioPromedioCentimos)}</strong> / ${escapeHtml(grupo.unidad)}
                      </div>

                      ${!mismoPrecio ? `
                        <div style="font-size: 0.8rem; color: var(--color-text-dim); margin-top: 2px;">
                          Rango: Mín. ${formatMoney(grupo.precioMinimoCentimos)} · Máx. ${formatMoney(grupo.precioMaximoCentimos)}
                        </div>
                      ` : ''}

                      <!-- Stand más barato resaltado -->
                      <div style="margin-top: 6px;">
                        <span class="badge badge-success" style="font-size: 0.8rem;">
                          ⭐ Más barato: ${formatMoney(grupo.precioMinimoCentimos)} en ${escapeHtml(grupo.standsMasBaratos.join(', '))}
                        </span>
                      </div>
                    </div>

                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                      <span style="font-size: 1.3rem; font-weight: 800; color: var(--color-text); font-variant-numeric: tabular-nums;">
                        ${formatMoney(grupo.totalGastadoCentimos)}
                      </span>
                      <span style="font-size: 0.8rem; color: var(--color-primary); font-weight: 700; margin-top: 6px;">
                        ${estaExpandido ? '▲ Ocultar detalle' : '▼ Ver detalle (' + grupo.compras.length + ')'}
                      </span>
                    </div>
                  </div>

                  <!-- Detalle desplegable de compras de este producto -->
                  ${estaExpandido ? `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1.5px dashed var(--color-border);" onclick="event.stopPropagation();">
                      <div style="font-size: 0.8rem; font-weight: 800; color: var(--color-text-dim); text-transform: uppercase; margin-bottom: 6px;">
                        Detalle por stand:
                      </div>
                      <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${grupo.compras.map(c => {
                          const esElMasBarato = c.precioUnitarioCentimos === grupo.precioMinimoCentimos;
                          return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background-color: var(--color-surface-hover); border-radius: var(--radius-sm); border-left: 3px solid ${esElMasBarato ? 'var(--color-success)' : 'var(--color-border)'};">
                              <div>
                                <span style="font-weight: 700; font-size: 0.9rem;">${escapeHtml(c.standNombre)}</span>
                                ${c.standDireccion ? `<span style="font-size: 0.75rem; color: var(--color-text-dim);"> (${escapeHtml(c.standDireccion)})</span>` : ''}
                                <div style="font-size: 0.8rem; color: var(--color-text-muted);">
                                  ${c.cantidad} ${escapeHtml(grupo.unidad)} × ${formatMoney(c.precioUnitarioCentimos)} c/u
                                </div>
                              </div>
                              <div style="text-align: right;">
                                <span style="font-weight: 800; font-size: 0.95rem;">${formatMoney(c.subtotalCentimos)}</span>
                                ${esElMasBarato ? `
                                  <div><span class="badge badge-success" style="font-size: 0.65rem;">MÍNIMO</span></div>
                                ` : ''}
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    ` : vistaActiva === 'stands' ? `
      <!-- SUB-VISTA: POR STAND -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${stands.length === 0 ? `
          <div class="card" style="text-align: center; padding: 32px 16px; color: var(--color-text-dim);">
            <p style="font-size: 2rem; margin-bottom: 6px;">🏬</p>
            <p style="font-weight: 700; color: var(--color-text);">No hay stands registrados en esta salida</p>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${stands.map((stand, idx) => {
              const totStand = calcularTotalesStand(stand);
              const descStandDiff = describirDiferencia(totStand.diferenciaCentimos);
              const lineasStand = Array.isArray(stand.lineas) ? stand.lineas : [];

              return `
                <div class="card" style="padding: 14px;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="badge" style="background: var(--color-primary); color: white; border-radius: 4px; font-size: 0.75rem;">
                          #${idx + 1}
                        </span>
                        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--color-text);">
                          ${escapeHtml(stand.nombre)}
                        </h3>
                      </div>
                      ${stand.direccion ? `
                        <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top: 2px;">
                          📍 ${escapeHtml(stand.direccion)}
                        </div>
                      ` : ''}
                      ${stand.notas ? `
                        <div style="font-size: 0.8rem; color: var(--color-text-dim); margin-top: 2px;">
                          📝 ${escapeHtml(stand.notas)}
                        </div>
                      ` : ''}
                    </div>

                    <div style="text-align: right;">
                      <span style="font-size: 1.25rem; font-weight: 800; color: var(--color-text);">
                        ${formatMoney(totStand.totalEfectivoCentimos)}
                      </span>
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

                  <!-- Líneas compradas en este stand -->
                  <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--color-border);">
                    ${lineasStand.length === 0 ? `
                      <span style="font-size: 0.85rem; color: var(--color-text-dim); font-style: italic;">Sin productos</span>
                    ` : `
                      <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${lineasStand.map(l => `
                          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding: 3px 0;">
                            <span>
                              <strong>${escapeHtml(l.producto)}</strong> (${l.cantidad} ${escapeHtml(l.unidad)} × ${formatMoney(l.precioUnitarioCentimos)})
                            </span>
                            <span style="font-weight: 700;">${formatMoney(l.subtotalCentimos)}</span>
                          </div>
                        `).join('')}
                      </div>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    ` : `
      <!-- SUB-VISTA: PLANIFICADO VS COMPRADO -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${itemsPlanificados.length === 0 ? `
          <div class="card" style="text-align: center; padding: 32px 16px; color: var(--color-text-dim);">
            <p style="font-size: 2rem; margin-bottom: 6px;">📝</p>
            <p style="font-weight: 700; color: var(--color-text);">No creaste una lista de compras planificada</p>
            <p style="font-size: 0.85rem; margin-top: 4px;">Puedes definirla para comparar lo planificado contra lo que compraste.</p>
            <button class="btn btn-primary" style="margin: 12px auto 0 auto;" onclick="window.location.hash='#salida/${salidaId}/lista'">
              Crear lista planificada
            </button>
          </div>
        ` : `
          <!-- Métricas de cumplimiento -->
          <div class="card" style="padding: 12px; background-color: var(--color-surface-hover);">
            <div style="display: flex; justify-content: space-around; text-align: center;">
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-dim); text-transform: uppercase;">Planeados</span>
                <div style="font-size: 1.3rem; font-weight: 800;">${itemsPlanificados.length}</div>
              </div>
              <div style="border-left: 1px solid var(--color-border); padding-left: 14px;">
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-success); text-transform: uppercase;">Comprados</span>
                <div style="font-size: 1.3rem; font-weight: 800; color: var(--color-success);">${compradosCount}</div>
              </div>
              <div style="border-left: 1px solid var(--color-border); padding-left: 14px;">
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-warning); text-transform: uppercase;">Faltaron</span>
                <div style="font-size: 1.3rem; font-weight: 800; color: var(--color-warning);">${pendientesCount}</div>
              </div>
            </div>
          </div>

          <!-- Listado de items planificados -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${itemsPlanificados.map(item => `
              <div class="card" style="padding: 12px; border-left: 5px solid ${item.comprado ? 'var(--color-success)' : 'var(--color-warning)'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                  <div>
                    <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--color-text);">
                      ${escapeHtml(item.producto)}
                    </h4>
                    <div style="font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin-top: 2px;">
                      Planeado: ${item.cantidadPlaneada} ${escapeHtml(item.unidad || 'unidad')}
                      ${item.comprado ? ` · Comprado: ${item.cantidadComprada} ${escapeHtml(item.unidad || 'unidad')}` : ''}
                    </div>
                    ${item.comprado && item.lineasAsociadas && item.lineasAsociadas.length > 0 ? `
                      <div style="font-size: 0.8rem; color: var(--color-text-dim); margin-top: 2px;">
                        Comprado en: ${item.lineasAsociadas.map(l => `${escapeHtml(l.standNombre)} (${l.cantidad})`).join(', ')}
                      </div>
                    ` : `
                      <div style="font-size: 0.8rem; color: var(--color-danger); margin-top: 2px; font-weight: 700;">
                        ⚠️ Faltó comprar en esta salida
                      </div>
                    `}
                  </div>
                  <span class="badge ${item.comprado ? 'badge-success' : 'badge-warning'}">
                    ${item.comprado ? '✓ Comprado' : '⏳ Faltó'}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `}

    <!-- TARJETA FINAL DE TOTALES CONSOLIDADA (Siempre visible) -->
    <div class="card" style="background-color: var(--color-surface); border: 2px solid var(--color-primary); box-shadow: var(--shadow-md); margin-top: 8px;">
      <h3 style="font-size: 1rem; font-weight: 800; color: var(--color-primary); text-transform: uppercase; margin-bottom: 6px;">
        Consolidado Total de la Salida
      </h3>

      <!-- 1. Total de las líneas (suma de subtotales) -->
      <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0;">
        <span style="font-size: 0.95rem; font-weight: 700; color: var(--color-text-muted);">
          Total de productos (suma de líneas):
        </span>
        <span style="font-size: 1.15rem; font-weight: 800; font-variant-numeric: tabular-nums;">
          ${formatMoney(totalesSalida.totalCalculadoCentimos)}
        </span>
      </div>

      <!-- 2. Línea separada con la diferencia total si algún stand tiene total pagado real -->
      ${totalesSalida.diferenciaCentimos !== 0 ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-top: 1px dashed var(--color-border); margin-top: 4px;">
          <div>
            <span style="font-size: 0.9rem; font-weight: 700; color: var(--color-text);">
              Diferencia total (descuentos / redondeos):
            </span>
            <div style="font-size: 0.75rem; color: var(--color-text-dim);">
              Ajuste aplicado directamente en stands
            </div>
          </div>
          <span class="badge ${descDiff.tipo === 'descuento' ? 'badge-success' : 'badge-warning'}" style="font-size: 0.95rem; font-weight: 800;">
            ${descDiff.texto}
          </span>
        </div>
      ` : ''}

      <!-- 3. Total final pagado -->
      <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0 2px 0; border-top: 2px solid var(--color-border); margin-top: 6px;">
        <span style="font-size: 1.1rem; font-weight: 900; color: var(--color-text);">
          TOTAL FINAL PAGADO:
        </span>
        <span style="font-size: 1.5rem; font-weight: 900; color: var(--color-primary); font-variant-numeric: tabular-nums;">
          ${formatMoney(totalesSalida.totalEfectivoCentimos)}
        </span>
      </div>

      <p style="font-size: 0.75rem; color: var(--color-text-dim); margin-top: 6px; font-style: italic;">
        * La diferencia de stands se refleja en el total final y no se reparte entre los precios individuales de los productos.
      </p>
    </div>
  `;

  container.innerHTML = html;

  // Event Listeners de Navegación
  container.querySelector('#btn-volver-stands')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#tab-stands-nav')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}`;
  });

  container.querySelector('#tab-lista-nav')?.addEventListener('click', () => {
    window.location.hash = `#salida/${salidaId}/lista`;
  });

  container.querySelector('#btn-imprimir-resumen')?.addEventListener('click', () => {
    window.print();
  });

  container.querySelector('#btn-whatsapp-resumen')?.addEventListener('click', async () => {
    await compartirResumenWhatsApp(salida);
  });

  container.querySelector('#btn-csv-resumen')?.addEventListener('click', () => {
    const nombre = exportarCSVResumen(salida);
    alert(`✓ Resumen CSV descargado como:\n${nombre}\n\nPuedes abrirlo directamente en Excel.`);
  });

  // Selector de sub-vistas
  container.querySelector('#btn-vista-general')?.addEventListener('click', () => {
    vistaActiva = 'general';
    renderResumenView(container, salidaId);
  });

  container.querySelector('#btn-vista-stands')?.addEventListener('click', () => {
    vistaActiva = 'stands';
    renderResumenView(container, salidaId);
  });

  container.querySelector('#btn-vista-plan')?.addEventListener('click', () => {
    vistaActiva = 'plan';
    renderResumenView(container, salidaId);
  });

  // Filtro de búsqueda y orden
  const inputFiltro = container.querySelector('#input-filtro-prod');
  const selectOrden = container.querySelector('#select-orden-prod');

  if (inputFiltro) {
    inputFiltro.addEventListener('input', (e) => {
      busquedaFiltro = e.target.value;
      renderResumenView(container, salidaId);
      // Mantener foco tras re-render
      const nuevoInput = container.querySelector('#input-filtro-prod');
      if (nuevoInput) {
        nuevoInput.focus();
        nuevoInput.setSelectionRange(busquedaFiltro.length, busquedaFiltro.length);
      }
    });
  }

  if (selectOrden) {
    selectOrden.addEventListener('change', (e) => {
      ordenActivo = e.target.value;
      renderResumenView(container, salidaId);
    });
  }

  // Acordeón de grupos de productos
  container.querySelectorAll('[data-action="toggle-grupo"]').forEach(card => {
    card.addEventListener('click', () => {
      const clave = card.dataset.clave;
      if (expandidos.has(clave)) {
        expandidos.delete(clave);
      } else {
        expandidos.add(clave);
      }
      renderResumenView(container, salidaId);
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
