// Suite de pruebas unitarias para Abasto
// Ejecutable con: node test/tests.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  centimosToSoles,
  formatMoney,
  solesToCentimos,
  calcularSubtotalCentimos,
  sumarCentimos,
  calcularDiferenciaCentimos,
  describirDiferencia
} from '../js/money.js';

import {
  normalizarTexto,
  normalizarUnidad,
  crearId,
  crearSalida,
  crearStand,
  crearLinea,
  crearItemPlanificado,
  crearGasto,
  calcularTotalesStand,
  calcularTotalesSalida,
  deducirCatalogo,
  agruparPorProductoYUnidad,
  derivarEstadoLista,
  obtenerComprobantesStand
} from '../js/models.js';

import {
  interpretarLineaTexto,
  interpretarTextoCompleto,
  parsearCSV,
  decodificarBufferTexto
} from '../js/parser.js';

import {
  generarJSONRespaldo,
  validarJSONRespaldo,
  procesarImportacionSalidas,
  generarCSVResumen,
  generarTextoWhatsAppResumen,
  generarTextoWhatsAppStand,
  generarCSVListaPlanificada,
  generarTextoWhatsAppLista
} from '../js/export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('\n--- PRUEBAS: MANEJO DE DINERO EN CÉNTIMOS (money.js) ---');

test('centimosToSoles formatea enteros a dos decimales', () => {
  assert.strictEqual(centimosToSoles(15050), '150.50');
  assert.strictEqual(centimosToSoles(0), '0.00');
  assert.strictEqual(centimosToSoles(5), '0.05');
  assert.strictEqual(centimosToSoles(99), '0.99');
  assert.strictEqual(centimosToSoles(100), '1.00');
  assert.strictEqual(centimosToSoles(-450), '-4.50');
});

test('formatMoney incluye símbolo oficial S/ de Perú', () => {
  assert.strictEqual(formatMoney(15050), 'S/ 150.50');
  assert.strictEqual(formatMoney(0), 'S/ 0.00');
  assert.strictEqual(formatMoney(450, false), '4.50');
});

test('solesToCentimos convierte texto o número a céntimos enteros sin error flotante', () => {
  assert.strictEqual(solesToCentimos('150.50'), 15050);
  assert.strictEqual(solesToCentimos('150,50'), 15050);
  assert.strictEqual(solesToCentimos('4.5'), 450);
  assert.strictEqual(solesToCentimos(4.5), 450);
  assert.strictEqual(solesToCentimos('0.10'), 10);
  assert.strictEqual(solesToCentimos(''), 0);
  assert.strictEqual(solesToCentimos(null), 0);
  assert.strictEqual(solesToCentimos(undefined), 0);
});

test('calcularSubtotalCentimos realiza producto exacto', () => {
  assert.strictEqual(calcularSubtotalCentimos(2, 15000), 30000);
  assert.strictEqual(calcularSubtotalCentimos(10, 450), 4500);
  assert.strictEqual(calcularSubtotalCentimos(2.5, 450), 1125);
  assert.strictEqual(calcularSubtotalCentimos(3, 10), 30);
});

test('sumarCentimos acumula valores sin pérdida de céntimos', () => {
  const compras = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
  assert.strictEqual(sumarCentimos(compras), 100);
  assert.strictEqual(centimosToSoles(sumarCentimos(compras)), '1.00');

  const lineas = [30000, 4500, 1125];
  assert.strictEqual(sumarCentimos(lineas), 35625);
  assert.strictEqual(formatMoney(sumarCentimos(lineas)), 'S/ 356.25');
});

test('calcularDiferenciaCentimos y describirDiferencia calculan descuentos y redondeos', () => {
  const diffDescuento = calcularDiferenciaCentimos(35000, 35625);
  assert.strictEqual(diffDescuento, -625);
  const desc1 = describirDiferencia(diffDescuento);
  assert.strictEqual(desc1.tipo, 'descuento');
  assert.strictEqual(desc1.montoStr, '-S/ 6.25');

  const diffRecargo = calcularDiferenciaCentimos(35700, 35625);
  assert.strictEqual(diffRecargo, 75);
  const desc2 = describirDiferencia(diffRecargo);
  assert.strictEqual(desc2.tipo, 'recargo');
  assert.strictEqual(desc2.montoStr, '+S/ 0.75');

  assert.strictEqual(calcularDiferenciaCentimos(null, 35625), 0);
  assert.strictEqual(calcularDiferenciaCentimos(35625, 35625), 0);
});

console.log('\n--- PRUEBAS: MODELOS Y REGLAS DE NEGOCIO (models.js) ---');

test('normalizarTexto solo elimina mayúsculas, tildes y espacios (sin fonética)', () => {
  assert.strictEqual(normalizarTexto('  Harina   ANITA  '), 'harina anita');
  assert.strictEqual(normalizarTexto('Aceite Beltrán'), 'aceite beltran');
  assert.strictEqual(normalizarTexto('Azúcar Rubia Del Norte'), 'azucar rubia del norte');
  assert.strictEqual(normalizarTexto('Cebolla'), 'cebolla');
  assert.strictEqual(normalizarTexto('Sebolla'), 'sebolla');
});

test('normalizarUnidad utiliza tabla cerrada de equivalencias para agrupar singular/plural', () => {
  // cajas -> caja
  assert.strictEqual(normalizarUnidad('cajas'), 'caja');
  assert.strictEqual(normalizarUnidad('CAJA'), 'caja');
  assert.strictEqual(normalizarUnidad('cja'), 'caja');

  // baldes -> balde
  assert.strictEqual(normalizarUnidad('balde'), 'balde');
  assert.strictEqual(normalizarUnidad('baldes'), 'balde');
  assert.strictEqual(normalizarUnidad('BLDE'), 'balde');

  // sacos -> saco
  assert.strictEqual(normalizarUnidad('sacos'), 'saco');
  assert.strictEqual(normalizarUnidad('saco'), 'saco');

  // bolsas -> bolsa
  assert.strictEqual(normalizarUnidad('bolsas'), 'bolsa');
  assert.strictEqual(normalizarUnidad('bolsa'), 'bolsa');

  // kilos -> kg
  assert.strictEqual(normalizarUnidad('kilos'), 'kg');
  assert.strictEqual(normalizarUnidad('kilo'), 'kg');
  assert.strictEqual(normalizarUnidad('kg'), 'kg');
  assert.strictEqual(normalizarUnidad('kgs'), 'kg');

  // bidón -> bidón
  assert.strictEqual(normalizarUnidad('bidones'), 'bidón');
  assert.strictEqual(normalizarUnidad('bidon'), 'bidón');

  // jabas -> jaba, cartones -> cartón
  assert.strictEqual(normalizarUnidad('jabas'), 'jaba');
  assert.strictEqual(normalizarUnidad('cartones'), 'cartón');

  // unidad no en tabla conserva texto limpio sin heurística
  assert.strictEqual(normalizarUnidad('cilindro'), 'cilindro');
});

test('crearStand y obtenerComprobantesStand soportan una o múltiples fotos con compatibilidad hacia atrás', () => {
  const stand1 = crearStand('Puesto 5');
  assert.strictEqual(stand1.comprobante, null);
  assert.deepStrictEqual(stand1.comprobantes, []);
  assert.deepStrictEqual(obtenerComprobantesStand(stand1), []);

  const fakeDataUrl1 = 'data:image/jpeg;base64,/9j/foto1...';
  const fakeDataUrl2 = 'data:image/jpeg;base64,/9j/foto2...';
  const fakeDataUrl3 = 'data:image/jpeg;base64,/9j/foto3...';

  // Creación con un solo comprobante en string (modo clásico)
  const stand2 = crearStand('Puesto 6', 'Pasaje 3', 'Nota', fakeDataUrl1);
  assert.strictEqual(stand2.comprobante, fakeDataUrl1);
  assert.deepStrictEqual(stand2.comprobantes, [fakeDataUrl1]);
  assert.deepStrictEqual(obtenerComprobantesStand(stand2), [fakeDataUrl1]);

  // Creación con arreglo de múltiples fotos (2 o 3 comprobantes)
  const stand3 = crearStand('Puesto 7', 'Pasaje 4', 'Nota', [fakeDataUrl1, fakeDataUrl2, fakeDataUrl3]);
  assert.strictEqual(stand3.comprobante, fakeDataUrl1); // primer elemento para compatibilidad
  assert.deepStrictEqual(stand3.comprobantes, [fakeDataUrl1, fakeDataUrl2, fakeDataUrl3]);
  assert.deepStrictEqual(obtenerComprobantesStand(stand3), [fakeDataUrl1, fakeDataUrl2, fakeDataUrl3]);

  // Stand heredado que solo tiene la propiedad comprobante (sin comprobantes)
  const standHeredado = { id: 'old1', nombre: 'Puesto Viejo', comprobante: fakeDataUrl2 };
  assert.deepStrictEqual(obtenerComprobantesStand(standHeredado), [fakeDataUrl2]);

  // Stand nulo o vacío
  assert.deepStrictEqual(obtenerComprobantesStand(null), []);
  assert.deepStrictEqual(obtenerComprobantesStand({}), []);
});

test('calcularTotalesStand calcula total calculado, total efectivo y diferencia', () => {
  const stand = crearStand('Puesto 10');
  stand.lineas.push(crearLinea('Aceite', 2, 'caja', 15000));
  stand.lineas.push(crearLinea('Fideos', 10, 'bolsa', 450));

  const tot1 = calcularTotalesStand(stand);
  assert.strictEqual(tot1.totalCalculadoCentimos, 34500);
  assert.strictEqual(tot1.totalEfectivoCentimos, 34500);
  assert.strictEqual(tot1.diferenciaCentimos, 0);

  stand.totalPagadoRealCentimos = 34000;
  const tot2 = calcularTotalesStand(stand);
  assert.strictEqual(tot2.totalCalculadoCentimos, 34500);
  assert.strictEqual(tot2.totalEfectivoCentimos, 34000);
  assert.strictEqual(tot2.diferenciaCentimos, -500);
});

test('calcularTotalesSalida acumula usando total pagado real si existe y muestra diferencia neta', () => {
  const salida = crearSalida('Salida prueba');

  const stand1 = crearStand('Stand 1');
  stand1.lineas.push(crearLinea('Aceite', 2, 'caja', 15000));
  stand1.lineas.push(crearLinea('Fideos', 10, 'bolsa', 450));
  stand1.totalPagadoRealCentimos = 34000;
  salida.stands.push(stand1);

  const stand2 = crearStand('Stand 2');
  stand2.lineas.push(crearLinea('Arroz', 1, 'saco', 5000));
  salida.stands.push(stand2);

  const totSalida = calcularTotalesSalida(salida);
  assert.strictEqual(totSalida.totalCalculadoCentimos, 39500);
  assert.strictEqual(totSalida.totalEfectivoCentimos, 39000);
  assert.strictEqual(totSalida.diferenciaCentimos, -500);
  assert.strictEqual(totSalida.totalStands, 2);
  assert.strictEqual(totSalida.totalLineas, 3);
  assert.strictEqual(totSalida.totalGastosCentimos, 0);
  assert.strictEqual(totSalida.granTotalCentimos, 39000);
});

test('crearGasto y calcularTotalesSalida con gastos personales y viaticos', () => {
  const salida = crearSalida('Compra con viáticos');
  const stand = crearStand('Puesto 1');
  stand.lineas.push(crearLinea('Arroz', 2, 'saco', 5000)); // S/ 100.00
  salida.stands.push(stand);

  // Gastos
  const gasto1 = crearGasto('Pasajes bus ida y vuelta', 650, 'pasajes'); // S/ 6.50
  const gasto2 = crearGasto('Desayuno sandwich y café', 1200, 'comida'); // S/ 12.00
  const gasto3 = crearGasto('Estibador descarga', 1500, 'estibador');    // S/ 15.00

  assert.strictEqual(gasto1.montoCentimos, 650);
  assert.strictEqual(gasto1.categoria, 'pasajes');
  assert.ok(gasto1.id, 'Debe generar id único');

  salida.gastos.push(gasto1, gasto2, gasto3);

  const tot = calcularTotalesSalida(salida);
  assert.strictEqual(tot.totalCalculadoCentimos, 10000);
  assert.strictEqual(tot.totalEfectivoCentimos, 10000);
  assert.strictEqual(tot.totalGastosCentimos, 3350); // S/ 33.50
  assert.strictEqual(tot.granTotalCentimos, 13350);  // S/ 100.00 + S/ 33.50 = S/ 133.50
});

test('deducirCatalogo incluye botones rápidos (con balde) y aprende unidades del historial', () => {
  const salida = crearSalida();
  const stand = crearStand('Stand 1');
  stand.lineas.push(crearLinea('Pintura', 2, 'baldes', 3500));
  stand.lineas.push(crearLinea('Aceite Suelto', 1, 'galon', 4500)); // Unidad personalizada aprendida
  salida.stands.push(stand);

  const catalogo = deducirCatalogo([salida]);

  // Debe contener 'balde' entre las unidades
  assert.ok(catalogo.unidades.includes('balde'));
  // Debe haber aprendido 'galon' del historial
  assert.ok(catalogo.unidades.includes('galon'));
});

console.log('\n--- PRUEBAS ETAPA 2: LISTADO GENERAL Y RESUMEN POR PRODUCTO ---');

test('agruparPorProductoYUnidad agrupa singular y plural (caja/cajas) en un solo consolidado', () => {
  const salida = crearSalida('Salida Mayorista');

  const stand1 = crearStand('Distribuidora A');
  stand1.lineas.push(crearLinea('Aceite Beltrán', 2, 'cajas', 15000)); // S/ 300.00
  salida.stands.push(stand1);

  const stand2 = crearStand('Distribuidora B');
  stand2.lineas.push(crearLinea('Aceite Beltran', 3, 'caja', 14000));  // S/ 420.00 (Tilde y singular diferente)
  salida.stands.push(stand2);

  const grupos = agruparPorProductoYUnidad(salida);
  assert.strictEqual(grupos.length, 1, 'Debe haber un único grupo para Aceite Beltrán en cajas');

  const grupo = grupos[0];
  assert.strictEqual(grupo.cantidadTotal, 5);
  assert.strictEqual(grupo.unidad, 'caja');
  assert.strictEqual(grupo.totalGastadoCentimos, 72000); // 30000 + 42000 = S/ 720.00
});

test('agruparPorProductoYUnidad calcula precio promedio ponderado exacto', () => {
  const salida = crearSalida();
  const stand1 = crearStand('Stand 1');
  // 2 cajas a S/ 150.00 = S/ 300.00
  stand1.lineas.push(crearLinea('Aceite Beltrán', 2, 'cajas', 15000));
  salida.stands.push(stand1);

  const stand2 = crearStand('Stand 2');
  // 3 cajas a S/ 140.00 = S/ 420.00
  stand2.lineas.push(crearLinea('Aceite Beltrán', 3, 'caja', 14000));
  salida.stands.push(stand2);

  const grupos = agruparPorProductoYUnidad(salida);
  const grupo = grupos[0];

  // Ponderado: (2*15000 + 3*14000) / 5 = (30000 + 42000) / 5 = 72000 / 5 = 14400 céntimos (S/ 144.00)
  assert.strictEqual(grupo.precioPromedioCentimos, 14400);
  assert.strictEqual(formatMoney(grupo.precioPromedioCentimos), 'S/ 144.00');
});

test('agruparPorProductoYUnidad calcula precio mínimo, máximo y resalta el stand más barato', () => {
  const salida = crearSalida();
  const stand1 = crearStand('Don Lucho');
  stand1.lineas.push(crearLinea('Aceite Beltrán', 2, 'caja', 15000)); // S/ 150.00
  salida.stands.push(stand1);

  const stand2 = crearStand('Distribuidora San José');
  stand2.lineas.push(crearLinea('Aceite Beltrán', 3, 'caja', 13800)); // S/ 138.00 (MÁS BARATO)
  salida.stands.push(stand2);

  const stand3 = crearStand('Puesto 8');
  stand3.lineas.push(crearLinea('Aceite Beltrán', 1, 'caja', 15200)); // S/ 152.00 (MÁXIMO)
  salida.stands.push(stand3);

  const grupos = agruparPorProductoYUnidad(salida);
  const grupo = grupos[0];

  assert.strictEqual(grupo.precioMinimoCentimos, 13800);
  assert.strictEqual(grupo.precioMaximoCentimos, 15200);
  assert.deepStrictEqual(grupo.standsMasBaratos, ['Distribuidora San José']);
});

test('agruparPorProductoYUnidad NUNCA mezcla unidades distintas en un mismo grupo o promedio', () => {
  const salida = crearSalida();
  const stand = crearStand('Mercado');
  // Se compraron cajas de aceite y botellas de aceite del mismo producto
  stand.lineas.push(crearLinea('Aceite Beltrán', 2, 'caja', 15000));
  stand.lineas.push(crearLinea('Aceite Beltrán', 12, 'botella', 1200));
  salida.stands.push(stand);

  const grupos = agruparPorProductoYUnidad(salida);
  assert.strictEqual(grupos.length, 2, 'Debe haber 2 grupos independientes: caja y botella');

  const grupoCaja = grupos.find(g => g.unidad === 'caja');
  const grupoBotella = grupos.find(g => g.unidad === 'botella');

  assert.ok(grupoCaja);
  assert.ok(grupoBotella);
  assert.strictEqual(grupoCaja.cantidadTotal, 2);
  assert.strictEqual(grupoCaja.precioPromedioCentimos, 15000);
  assert.strictEqual(grupoBotella.cantidadTotal, 12);
  assert.strictEqual(grupoBotella.precioPromedioCentimos, 1200);
});

test('la suma del listado general + diferencia acumulada coincide exactamente con el total de la salida', () => {
  const salida = crearSalida('Compra Completa');

  // Stand 1: Líneas suman S/ 300.00, pero pagó S/ 295.00 (descuento -5.00)
  const stand1 = crearStand('Stand 1');
  stand1.lineas.push(crearLinea('Aceite', 2, 'caja', 15000));
  stand1.totalPagadoRealCentimos = 29500;
  salida.stands.push(stand1);

  // Stand 2: Líneas suman S/ 102.50, pero pagó S/ 103.00 (redondeo +0.50)
  const stand2 = crearStand('Stand 2');
  stand2.lineas.push(crearLinea('Fideos', 10, 'bolsa', 450)); // S/ 45.00
  stand2.lineas.push(crearLinea('Harina', 1, 'saco', 5750)); // S/ 57.50
  stand2.totalPagadoRealCentimos = 10300;
  salida.stands.push(stand2);

  // Stand 3: Líneas suman S/ 50.00, sin total pagado real (diferencia 0)
  const stand3 = crearStand('Stand 3');
  stand3.lineas.push(crearLinea('Arroz', 1, 'saco', 5000));
  salida.stands.push(stand3);

  // Totales de la salida
  const totalesSalida = calcularTotalesSalida(salida);

  // Agrupación general por producto
  const grupos = agruparPorProductoYUnidad(salida);
  const sumaLineasConsolidada = grupos.reduce((acc, g) => acc + g.totalGastadoCentimos, 0);

  // 1. La suma de líneas en la agrupación general coincide con el total calculado
  assert.strictEqual(sumaLineasConsolidada, totalesSalida.totalCalculadoCentimos);

  // 2. Suma de líneas + diferencia = Total efectivo pagado de la salida
  const reconciliacion = sumaLineasConsolidada + totalesSalida.diferenciaCentimos;
  assert.strictEqual(reconciliacion, totalesSalida.totalEfectivoCentimos);

  // Verificación numérica:
  // Líneas: 300.00 + 102.50 + 50.00 = 452.50 (45250)
  // Diferencia: -5.00 + 0.50 + 0 = -4.50 (-450)
  // Total efectivo: 295.00 + 103.00 + 50.00 = 448.00 (44800)
  assert.strictEqual(sumaLineasConsolidada, 45250);
  assert.strictEqual(totalesSalida.diferenciaCentimos, -450);
  assert.strictEqual(totalesSalida.totalEfectivoCentimos, 44800);
});

console.log('\n--- PRUEBAS ETAPA 3: LISTA DE COMPRAS Y PARSER HEURÍSTICO ---');

test('interpretarLineaTexto extrae cantidad, unidad y producto al inicio o final', () => {
  // Cantidad y unidad al inicio
  const p1 = interpretarLineaTexto('10 sacos harina Anita');
  assert.strictEqual(p1.cantidadPlaneada, 10);
  assert.strictEqual(p1.unidad, 'saco');
  assert.strictEqual(p1.producto, 'harina Anita');

  const p2 = interpretarLineaTexto('2 cajas aceite Beltrán');
  assert.strictEqual(p2.cantidadPlaneada, 2);
  assert.strictEqual(p2.unidad, 'caja');
  assert.strictEqual(p2.producto, 'aceite Beltrán');

  const p3 = interpretarLineaTexto('5 bolsas fideos');
  assert.strictEqual(p3.cantidadPlaneada, 5);
  assert.strictEqual(p3.unidad, 'bolsa');
  assert.strictEqual(p3.producto, 'fideos');

  // Cantidad al final con unidad
  const p4 = interpretarLineaTexto('Arroz costeño 50 kg');
  assert.strictEqual(p4.cantidadPlaneada, 50);
  assert.strictEqual(p4.unidad, 'kg');
  assert.strictEqual(p4.producto, 'Arroz costeño');

  // Solo cantidad al inicio sin unidad conocida
  const p5 = interpretarLineaTexto('3 atún real');
  assert.strictEqual(p5.cantidadPlaneada, 3);
  assert.strictEqual(p5.unidad, 'unidad');
  assert.strictEqual(p5.producto, 'atún real');

  // Decimales con coma o punto
  const p6 = interpretarLineaTexto('2,5 kg azúcar');
  assert.strictEqual(p6.cantidadPlaneada, 2.5);
  assert.strictEqual(p6.unidad, 'kg');
  assert.strictEqual(p6.producto, 'azúcar');
});

test('interpretarTextoCompleto procesa texto multilínea', () => {
  const texto = `
    10 sacos harina Anita
    2 cajas aceite Beltrán
    3 atún real
  `;
  const items = interpretarTextoCompleto(texto);
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].producto, 'harina Anita');
  assert.strictEqual(items[1].producto, 'aceite Beltrán');
  assert.strictEqual(items[2].producto, 'atún real');
});

test('parsearCSV interpreta archivos con delimitador de coma y punto y coma (Excel)', () => {
  // Formato con coma
  const csvComas = `producto,cantidad,unidad\nAceite Beltrán,2,cajas\nHarina Anita,10,sacos`;
  const itemsComas = parsearCSV(csvComas);
  assert.strictEqual(itemsComas.length, 2);
  assert.strictEqual(itemsComas[0].producto, 'Aceite Beltrán');
  assert.strictEqual(itemsComas[0].cantidadPlaneada, 2);
  assert.strictEqual(itemsComas[0].unidad, 'caja'); // Normalizada

  // Formato con punto y coma (típico de Windows en español)
  const csvPuntoComas = `Producto;Cantidad;Unidad\nLeche Gloria;12;lata\nFideos Tallarín;5;bolsa`;
  const itemsPuntoComas = parsearCSV(csvPuntoComas);
  assert.strictEqual(itemsPuntoComas.length, 2);
  assert.strictEqual(itemsPuntoComas[0].producto, 'Leche Gloria');
  assert.strictEqual(itemsPuntoComas[0].cantidadPlaneada, 12);
  assert.strictEqual(itemsPuntoComas[1].producto, 'Fideos Tallarín');
  assert.strictEqual(itemsPuntoComas[1].cantidadPlaneada, 5);
});

test('decodificarBufferTexto decodifica tildes y eñes tanto en Windows-1252 (Excel) como en UTF-8', () => {
  // 1. Simulación de archivo CSV exportado por Microsoft Excel en Windows (Codepage 1252 / ANSI)
  // Beltrán (0xe1), Tallarín (0xed), Costeño (0xf1), Azúcar (0xfa)
  const bytesExcelWin = new Uint8Array([
    0x42, 0x65, 0x6c, 0x74, 0x72, 0xe1, 0x6e, // Beltrán
    0x0a,
    0x54, 0x61, 0x6c, 0x6c, 0x61, 0x72, 0xed, 0x6e, // Tallarín
    0x0a,
    0x43, 0x6f, 0x73, 0x74, 0x65, 0xf1, 0x6f, // Costeño
    0x0a,
    0x41, 0x7a, 0xfa, 0x63, 0x61, 0x72 // Azúcar
  ]);

  const textoDecodificadoWin = decodificarBufferTexto(bytesExcelWin);
  assert.ok(textoDecodificadoWin.includes('Beltrán'), 'Debe decodificar á en Beltrán');
  assert.ok(textoDecodificadoWin.includes('Tallarín'), 'Debe decodificar í en Tallarín');
  assert.ok(textoDecodificadoWin.includes('Costeño'), 'Debe decodificar ñ en Costeño');
  assert.ok(textoDecodificadoWin.includes('Azúcar'), 'Debe decodificar ú en Azúcar');
  assert.ok(!textoDecodificadoWin.includes('\uFFFD'), 'No debe contener caracteres de reemplazo');

  // 2. Simulación de archivo UTF-8 estándar
  const textoUtf8Original = 'Aceite Beltrán\nFideos Tallarín\nArroz Costeño\nAzúcar';
  const bytesUtf8 = new TextEncoder().encode(textoUtf8Original);
  const textoDecodificadoUtf8 = decodificarBufferTexto(bytesUtf8);
  assert.strictEqual(textoDecodificadoUtf8, textoUtf8Original);

  // 3. Simulación de archivo UTF-8 con BOM
  const bytesConBOM = new Uint8Array([0xEF, 0xBB, 0xBF, ...bytesUtf8]);
  const textoDecodificadoBOM = decodificarBufferTexto(bytesConBOM);
  assert.strictEqual(textoDecodificadoBOM, textoUtf8Original);

  // 4. Simulación de archivo UTF-16 LE con BOM (Excel Texto Unicode)
  const bytesUtf16Le = new Uint8Array([
    0xFF, 0xFE, // BOM UTF-16 LE
    0x42, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x74, 0x00, 0x72, 0x00, 0xE1, 0x00, 0x6E, 0x00 // Beltrán
  ]);
  const textoDecodificadoUtf16 = decodificarBufferTexto(bytesUtf16Le);
  assert.strictEqual(textoDecodificadoUtf16, 'Beltrán');
});

test('parsearCSV soporta delimitador por tabulador (TSV) y encabezados extendidos (Artículo, Descripción, U.M.)', () => {
  const tsv = `Artículo\tCantidad\tU.M.\nAceite Beltrán\t2\tcajas\nArroz Costeño\t50\tkg`;
  const items = parsearCSV(tsv);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].producto, 'Aceite Beltrán');
  assert.strictEqual(items[0].cantidadPlaneada, 2);
  assert.strictEqual(items[0].unidad, 'caja');
  assert.strictEqual(items[1].producto, 'Arroz Costeño');
  assert.strictEqual(items[1].cantidadPlaneada, 50);
  assert.strictEqual(items[1].unidad, 'kg');
});

console.log('\n--- PRUEBAS ETAPA 4: EXPORTACIÓN, IMPORTACIÓN Y RESPALDO ---');

test('generarJSONRespaldo y validarJSONRespaldo validan correctamente el schemaVersion 1', () => {
  const salida = crearSalida('Compra Respaldo');
  const jsonStr = generarJSONRespaldo([salida]);

  const validacion = validarJSONRespaldo(jsonStr);
  assert.ok(validacion.ok, 'Debe ser un JSON válido');
  assert.strictEqual(validacion.data.schemaVersion, 1);
  assert.strictEqual(validacion.data.salidas.length, 1);
  assert.strictEqual(validacion.data.salidas[0].id, salida.id);

  // Validar rechazo de JSON corrupto o esquema incompatible
  assert.strictEqual(validarJSONRespaldo('{ corrupto:').ok, false);
  assert.strictEqual(validarJSONRespaldo(JSON.stringify({ schemaVersion: 99, salidas: [] })).ok, false);
  assert.strictEqual(validarJSONRespaldo(JSON.stringify({ schemaVersion: 1, salidas: 'no-array' })).ok, false);
});

test('procesarImportacionSalidas maneja correctamente los modos reemplazar y combinar por id', () => {
  const salidaLocal1 = crearSalida('Salida Local 1');
  salidaLocal1.updatedAt = 1000;
  const salidaLocal2 = crearSalida('Salida Local 2');
  salidaLocal2.updatedAt = 1000;
  const locales = [salidaLocal1, salidaLocal2];

  const salidaModificada1 = { ...salidaLocal1, nombre: 'Salida 1 Modificada en PC', updatedAt: 2000 };
  const salidaNueva3 = crearSalida('Salida Nueva 3');
  salidaNueva3.updatedAt = 1500;
  const importadas = [salidaModificada1, salidaNueva3];

  // Modo Reemplazar: borra locales y solo quedan importadas
  const resultadoReemplazar = procesarImportacionSalidas(importadas, 'reemplazar', locales);
  assert.strictEqual(resultadoReemplazar.length, 2);
  assert.strictEqual(resultadoReemplazar.find(s => s.id === salidaLocal2.id), undefined);
  assert.ok(resultadoReemplazar.find(s => s.id === salidaNueva3.id));

  // Modo Combinar: conserva local2, actualiza local1 con la versión más reciente, y agrega nueva3
  const resultadoCombinar = procesarImportacionSalidas(importadas, 'combinar', locales);
  assert.strictEqual(resultadoCombinar.length, 3);
  const s1EnCombinado = resultadoCombinar.find(s => s.id === salidaLocal1.id);
  assert.strictEqual(s1EnCombinado.nombre, 'Salida 1 Modificada en PC');
  assert.ok(resultadoCombinar.find(s => s.id === salidaLocal2.id));
  assert.ok(resultadoCombinar.find(s => s.id === salidaNueva3.id));
});

test('generarCSVResumen incluye BOM UTF-8, secciones obligatorias, tildes y cálculo exacto', () => {
  const salida = crearSalida('Compra CSV Test');
  const stand = crearStand('Puesto 5 - Doña María', 'Pasaje B-12', 'Boleta pendiente');
  stand.lineas.push(crearLinea('Aceite Beltrán', 2, 'caja', 15000));
  stand.lineas.push(crearLinea('Fideos Tallarín', 5, 'bolsa', 450));
  stand.totalPagadoRealCentimos = 32000; // S/ 320.00 vs S/ 322.50 calculado (-2.50 descuento)
  salida.stands.push(stand);

  const csv = generarCSVResumen(salida);

  // Verificar BOM UTF-8 en el primer carácter (\uFEFF)
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF, 'Debe iniciar con BOM UTF-8');

  // Verificar preservación de tildes y ñ
  assert.ok(csv.includes('Doña María'), 'Debe conservar la ñ y tilde del stand');
  assert.ok(csv.includes('Aceite Beltrán'), 'Debe conservar tilde en Beltrán');
  assert.ok(csv.includes('Fideos Tallarín'), 'Debe conservar tilde en Tallarín');

  // Verificar secciones del reporte
  assert.ok(csv.includes('REPORTE DE COMPRA - ABASTO'));
  assert.ok(csv.includes('--- RESUMEN POR STAND ---'));
  assert.ok(csv.includes('--- LISTADO GENERAL POR PRODUCTO (CONSOLIDADO) ---'));
  assert.ok(csv.includes('--- DETALLE DE LÍNEAS DE COMPRA ---'));

  // Verificar montos en soles exactos
  assert.ok(csv.includes('322.50'), 'Debe incluir total calculado S/ 322.50');
  assert.ok(csv.includes('320.00'), 'Debe incluir total pagado real S/ 320.00');
  assert.ok(csv.includes('-2.50'), 'Debe incluir diferencia neta -2.50');
});

test('generarTextoWhatsAppResumen formatea texto legible con emojis y totales exactos', () => {
  const salida = crearSalida('Compra Lunes');
  const stand = crearStand('Don Lucho');
  stand.lineas.push(crearLinea('Harina Anita', 10, 'saco', 5500));
  salida.stands.push(stand);

  const txt = generarTextoWhatsAppResumen(salida);
  assert.ok(txt.includes('ABASTO - RESUMEN DE COMPRA'));
  assert.ok(txt.includes('Don Lucho'));
  assert.ok(txt.includes('Harina Anita'));
  assert.ok(txt.includes('• *Harina Anita*: 10 saco x S/ 55.00 = *S/ 550.00*'));
  assert.ok(!txt.includes('Prom:'), 'No debe incluir la palabra Prom:');
  assert.ok(!txt.includes('Mín:'), 'No debe incluir la palabra Mín:');
});

test('generarTextoWhatsAppStand formatea la compra de un stand individual para WhatsApp', () => {
  const salida = crearSalida('Salida Central');
  const stand = crearStand('Distribuidora San José', 'Pasaje 4', 'Pedir factura');
  stand.lineas.push(crearLinea('Arroz Costeño', 2, 'saco', 5000));
  stand.lineas.push(crearLinea('Aceite Primor', 1, 'caja', 8000));
  salida.stands.push(stand);

  const txt = generarTextoWhatsAppStand(salida, stand);
  assert.ok(txt.includes('COMPRA EN STAND'));
  assert.ok(txt.includes('Distribuidora San José'));
  assert.ok(txt.includes('Pasaje 4'));
  assert.ok(txt.includes('Pedir factura'));
  assert.ok(txt.includes('• *Arroz Costeño*: 2 saco x S/ 50.00 = *S/ 100.00*'));
  assert.ok(txt.includes('TOTAL STAND: S/ 180.00'));
  assert.ok(!txt.includes('Prom:'));
  assert.ok(!txt.includes('Mín:'));
});

test('generarCSVResumen y generarTextoWhatsAppResumen incluyen sección y totales de viaticos si existen', () => {
  const salida = crearSalida('Compra con Viáticos');
  const stand = crearStand('Distribuidora El Sol');
  stand.lineas.push(crearLinea('Aceite', 2, 'caja', 10000));
  salida.stands.push(stand);

  salida.gastos.push(
    crearGasto('Taxi ida y vuelta', 2500, 'pasajes'),
    crearGasto('Almuerzo menú ejecutivo', 1400, 'comida')
  );

  // 1. Validar CSV
  const csv = generarCSVResumen(salida);
  assert.ok(csv.includes('--- GASTOS PERSONALES Y VIÁTICOS ---'));
  assert.ok(csv.includes('Total Viáticos / Gastos (S/)'));
  assert.ok(csv.includes('Costo Total Real Salida (S/)'));
  assert.ok(csv.includes('Taxi ida y vuelta'));
  assert.ok(csv.includes('25.00'));
  assert.ok(csv.includes('14.00'));
  assert.ok(csv.includes('39.00')); // Total viáticos
  assert.ok(csv.includes('239.00')); // Total real (200.00 mercadería + 39.00 viáticos)

  // 2. Validar WhatsApp
  const txt = generarTextoWhatsAppResumen(salida);
  assert.ok(txt.includes('*🛵 GASTOS Y VIÁTICOS:*'));
  assert.ok(txt.includes('Taxi ida y vuelta'));
  assert.ok(txt.includes('S/ 25.00'));
  assert.ok(txt.includes('Viáticos / Gastos: S/ 39.00'));
  assert.ok(txt.includes('Costo Total Real: *S/ 239.00*'));
});

test('generarCSVListaPlanificada exporta CSV con formato directo PRODUCTO,CANTIDAD,UNIDAD reimportable', () => {
  const salida = crearSalida('Compra Mayorista');
  const item1 = crearItemPlanificado('Arroz Costeño', 5, 'saco');
  const item2 = crearItemPlanificado('Azúcar Rubia', 2, 'bolsa');
  salida.listaPlanificada.push(item1, item2);

  // Simular que Arroz Costeño ya fue comprado en un stand
  const stand = crearStand('Puesto 12');
  stand.lineas.push(crearLinea('Arroz Costeño', 5, 'saco', 6000, item1.id));
  salida.stands.push(stand);

  // 1. Toda la lista
  const csvCompleto = generarCSVListaPlanificada(salida, false);
  assert.ok(csvCompleto.startsWith('\uFEFF'), 'Debe incluir BOM UTF-8');
  assert.ok(csvCompleto.includes('PRODUCTO,CANTIDAD,UNIDAD'));
  assert.ok(csvCompleto.includes('"Arroz Costeño"'));
  assert.ok(csvCompleto.includes('"Azúcar Rubia"'));

  // 2. Solo pendientes
  const csvPendientes = generarCSVListaPlanificada(salida, true);
  assert.ok(csvPendientes.includes('"Azúcar Rubia"'));
  assert.ok(!csvPendientes.includes('"Arroz Costeño"'), 'No debe incluir ítems comprados en solo pendientes');

  // 3. Round-trip: Re-importar el CSV exportado debe interpretarse 100% idéntico en producto, cantidad y unidad
  const reimportados = parsearCSV(csvCompleto);
  assert.strictEqual(reimportados.length, 2);
  assert.strictEqual(reimportados[0].producto, 'Arroz Costeño');
  assert.strictEqual(reimportados[0].cantidadPlaneada, 5);
  assert.strictEqual(reimportados[0].unidad, 'saco');
  assert.strictEqual(reimportados[1].producto, 'Azúcar Rubia');
  assert.strictEqual(reimportados[1].cantidadPlaneada, 2);
  assert.strictEqual(reimportados[1].unidad, 'bolsa');
});

test('parsearCSV tolera CSV con metadatos y columna Estado sin confundir Estado con Producto', () => {
  const csvConMetadatos = `LISTA DE COMPRAS - ABASTO\nFecha,2026-10-05\n\nEstado,Cantidad Planeada,Unidad,Producto,Cantidad Comprada\n"PENDIENTE",3,"caja","Aceite cielo de 1L",0\n"PENDIENTE",2,"saco","Harina Cielo",0`;
  const items = parsearCSV(csvConMetadatos);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].producto, 'Aceite cielo de 1L');
  assert.strictEqual(items[0].cantidadPlaneada, 3);
  assert.strictEqual(items[0].unidad, 'caja');
  assert.strictEqual(items[1].producto, 'Harina Cielo');
  assert.strictEqual(items[1].cantidadPlaneada, 2);
  assert.strictEqual(items[1].unidad, 'saco');
});

test('generarTextoWhatsAppLista formatea lista con casillas [ ] y soporte de pendientes vs todos', () => {
  const salida = crearSalida('Compra del Día');
  const item1 = crearItemPlanificado('Aceite Primor', 3, 'caja');
  const item2 = crearItemPlanificado('Fideos Molitalia', 10, 'bolsa');
  salida.listaPlanificada.push(item1, item2);

  // Comprar item1
  const stand = crearStand('Abarrotes Juan');
  stand.lineas.push(crearLinea('Aceite Primor', 3, 'caja', 18000, item1.id));
  salida.stands.push(stand);

  // Modo solo pendientes
  const txtPendientes = generarTextoWhatsAppLista(salida, true);
  assert.ok(txtPendientes.includes('ABASTO - LISTA DE COMPRAS'));
  assert.ok(txtPendientes.includes('PENDIENTES POR COMPRAR (1)'));
  assert.ok(txtPendientes.includes('Fideos Molitalia'));
  assert.ok(!txtPendientes.includes('YA COMPRADOS'), 'No debe incluir sección de comprados en modo solo pendientes');

  // Modo todos
  const txtTodos = generarTextoWhatsAppLista(salida, false);
  assert.ok(txtTodos.includes('PENDIENTES POR COMPRAR (1)'));
  assert.ok(txtTodos.includes('YA COMPRADOS (1)'));
  assert.ok(txtTodos.includes('Aceite Primor'));
});

console.log('\n--- PRUEBAS: INTEGRIDAD DE PRECACHÉ DEL SERVICE WORKER ---');

test('todos los módulos JS compilan y se importan sin errores de sintaxis', async () => {
  const modulos = [
    '../js/store.js',
    '../js/db.js',
    '../js/money.js',
    '../js/models.js',
    '../js/parser.js',
    '../js/export.js',
    '../js/views/homeView.js',
    '../js/views/salidaView.js',
    '../js/views/standView.js',
    '../js/views/resumenView.js',
    '../js/views/listaView.js',
    '../js/views/backupView.js'
  ];

  for (const mod of modulos) {
    const res = await import(mod);
    assert.ok(res, `El módulo ${mod} debe exportar contenido`);
  }
});

test('todos los archivos listados en PRECACHE_ASSETS existen en disco y no están vacíos', () => {
  const swContent = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf-8');
  const match = swContent.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, 'PRECACHE_ASSETS debe estar definido en sw.js');

  const assets = match[1]
    .split('\n')
    .map(line => line.trim().replace(/[',]/g, ''))
    .filter(line => line.length > 0);

  assert.ok(assets.length > 5, 'Debe haber activos en el precaché');

  for (const asset of assets) {
    const relativePath = asset === './' ? 'index.html' : asset.replace(/^\.\//, '');
    const fullPath = path.join(rootDir, relativePath);
    assert.ok(fs.existsSync(fullPath), `El archivo de precaché no existe: ${relativePath}`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 0, `El archivo de precaché está vacío: ${relativePath}`);
  }
});

console.log(`\nResultados: ${passedTests} superadas, ${failedTests} fallidas.\n`);
if (failedTests > 0) {
  process.exit(1);
}
