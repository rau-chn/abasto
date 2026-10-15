/**
 * Módulo de manejo financiero en céntimos enteros para la app Abasto.
 * Evita cualquier error de coma flotante de IEEE 754 (ej. 0.1 + 0.2 !== 0.3).
 * Moneda: Soles peruanos (S/) con 2 decimales.
 */

/**
 * Convierte un monto en céntimos enteros a cadena con 2 decimales.
 * @param {number} centimos - Entero en céntimos (ej. 15050)
 * @returns {string} - Ej. "150.50"
 */
export function centimosToSoles(centimos) {
  if (typeof centimos !== 'number' || isNaN(centimos)) {
    return '0.00';
  }
  const signo = centimos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centimos));
  const soles = Math.floor(abs / 100);
  const cents = (abs % 100).toString().padStart(2, '0');
  return `${signo}${soles}.${cents}`;
}

/**
 * Formatea un monto en céntimos a formato legible con símbolo S/.
 * @param {number} centimos - Monto en céntimos (ej. 15050)
 * @param {boolean} [includeSymbol=true] - Si debe incluir el prefijo "S/ "
 * @returns {string} - Ej. "S/ 150.50"
 */
export function formatMoney(centimos, includeSymbol = true) {
  const formatted = centimosToSoles(centimos);
  return includeSymbol ? `S/ ${formatted}` : formatted;
}

/**
 * Convierte una entrada del usuario (número o texto en soles con coma o punto)
 * a un valor entero en céntimos sin errores de aproximación.
 * @param {string|number|null|undefined} input - Ej. "150.50", "150,50", 150.5
 * @returns {number} - Entero en céntimos (ej. 15050)
 */
export function solesToCentimos(input) {
  if (input === null || input === undefined || input === '') {
    return 0;
  }
  if (typeof input === 'number') {
    if (isNaN(input) || !isFinite(input)) return 0;
    return Math.round(input * 100);
  }
  const cleanStr = input.toString().trim().replace(',', '.');
  const num = parseFloat(cleanStr);
  if (isNaN(num) || !isFinite(num)) {
    return 0;
  }
  return Math.round(num * 100);
}

/**
 * Calcula el subtotal en céntimos a partir de cantidad y precio unitario en céntimos.
 * La cantidad puede ser decimal (ej. 2.5 kg).
 * @param {number} cantidad - Cantidad adquirida (ej. 2, 2.5, 10)
 * @param {number} precioUnitarioCentimos - Precio unitario en céntimos (ej. 15000 para S/ 150.00)
 * @returns {number} - Subtotal en céntimos redondeado al entero más cercano
 */
export function calcularSubtotalCentimos(cantidad, precioUnitarioCentimos) {
  const cant = typeof cantidad === 'number' ? cantidad : parseFloat(cantidad);
  if (isNaN(cant) || cant <= 0) return 0;

  const precio = typeof precioUnitarioCentimos === 'number'
    ? precioUnitarioCentimos
    : solesToCentimos(precioUnitarioCentimos);
  if (isNaN(precio) || precio < 0) return 0;

  return Math.round(cant * precio);
}

/**
 * Suma un array de enteros en céntimos de manera exacta.
 * @param {number[]} listaCentimos - Array de valores en céntimos
 * @returns {number} - Suma total en céntimos
 */
export function sumarCentimos(listaCentimos) {
  if (!Array.isArray(listaCentimos)) return 0;
  return listaCentimos.reduce((acc, curr) => {
    const val = Number(curr);
    return acc + (isNaN(val) ? 0 : Math.round(val));
  }, 0);
}

/**
 * Calcula la diferencia entre el total pagado real y el total calculado de un stand.
 * @param {number|null|undefined} totalPagadoRealCentimos - Monto real pagado o null
 * @param {number} totalCalculadoCentimos - Monto calculado por suma de líneas
 * @returns {number} - Diferencia en céntimos (negativo = descuento/ahorro, positivo = recargo)
 */
export function calcularDiferenciaCentimos(totalPagadoRealCentimos, totalCalculadoCentimos) {
  if (totalPagadoRealCentimos === null || totalPagadoRealCentimos === undefined) {
    return 0;
  }
  const real = Number(totalPagadoRealCentimos);
  const calc = Number(totalCalculadoCentimos) || 0;
  return Math.round(real - calc);
}

/**
 * Retorna descripción amigable de la diferencia de dinero.
 * @param {number} diffCentimos - Diferencia en céntimos
 * @returns {{ texto: string, tipo: 'cero'|'descuento'|'recargo', montoStr: string }}
 */
export function describirDiferencia(diffCentimos) {
  if (!diffCentimos || diffCentimos === 0) {
    return { texto: 'Exacto', tipo: 'cero', montoStr: 'S/ 0.00' };
  }
  if (diffCentimos < 0) {
    const ahorro = Math.abs(diffCentimos);
    return {
      texto: `Ahorro / Descuento: -${formatMoney(ahorro)}`,
      tipo: 'descuento',
      montoStr: `-${formatMoney(ahorro)}`
    };
  }
  return {
    texto: `Redondeo / Adicional: +${formatMoney(diffCentimos)}`,
    tipo: 'recargo',
    montoStr: `+${formatMoney(diffCentimos)}`
  };
}
