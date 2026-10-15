# Abasto 🛒

> **Registro ágil de compras mayoristas de bodega 100% offline.**
> Construida para usarse de pie en mercados de abastos (Perú), con una sola mano, sin señal y con costo S/ 0.

---

## 🚀 Cómo Ejecutar la App en Local

> [!IMPORTANT]
> **NO abras `index.html` con doble clic desde el explorador de archivos (`file:///`)**.
> Por especificación de seguridad de los navegadores modernos, los **Módulos ES (`import/export`)** y los **Service Workers** requieren ser servidos bajo el protocolo HTTP o HTTPS.

Para levantar el servidor local incluido (sin dependencias externas):

### Opción 1: Con Node.js (Servidor nativo incluido)
```bash
# Desde la carpeta raíz del proyecto:
npm run serve
# O directamente:
node server.mjs
```
Abre en tu navegador: **`http://localhost:8080`**

### Opción 2: Con herramientas globales o Python
```bash
# Con npx serve:
npx serve .

# O con Python:
python -m http.server 8080
```

---

## 🧪 Pruebas Unitarias

La aplicación incluye una suite de pruebas para verificar cálculos monetarios en céntimos enteros, modelos de datos, reglas de negocio y la integridad de precaché del Service Worker:

```bash
npm test
# O directamente:
node test/tests.mjs
```

---

## 📱 Cómo Instalar como PWA en Celular y PC

Abasto cuenta con manifiesto PWA (`manifest.webmanifest`) y Service Worker (`sw.js`). Una vez abierta por primera vez, funciona **100% offline**:

### En Celular Android (Google Chrome):
1. Abre la URL en Chrome.
2. Toca el menú de tres puntos (arriba a la derecha).
3. Selecciona **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
4. Aparecerá el icono de **Abasto** junto a tus demás aplicaciones.

### En iPhone / iPad (Safari):
1. Abre la URL en Safari.
2. Toca el botón **Compartir** (icono de cuadrado con flecha hacia arriba).
3. Selecciona **"Agregar al inicio"** (Add to Home Screen).
4. Confirma el nombre "Abasto".

### En Computadora (Chrome / Edge / Brave):
1. En la barra de direcciones verás un icono de instalación (una pantalla con flecha o un `+`).
2. Haz clic en **"Instalar Abasto"**.
3. Se abrirá en una ventana independiente, rápida y accesible desde el escritorio o menú inicio.

---

## 🌐 Publicación 100% Gratuita (Costo S/ 0)

La app no requiere backend, base de datos externa ni servidor Node en producción. Es una suite de archivos estáticos puros:

### Opción A: GitHub Pages
1. Sube este repositorio a GitHub.
2. Ve a **Settings** $\rightarrow$ **Pages**.
3. En **Branch**, selecciona `main` (o `master`) y carpeta `/ (root)`.
4. Haz clic en **Save**. En un minuto estará disponible en `https://tu-usuario.github.io/tu-repo/`.

### Opción B: Cloudflare Pages
1. Inicia sesión en Cloudflare Dashboard $\rightarrow$ **Workers & Pages**.
2. Conecta tu repositorio o sube la carpeta directamente.
3. Build command: *(dejar vacío)*, Build output directory: `.` (raíz).
4. Despliega con SSL gratis y red CDN global ultrarrápida.

---

## 💾 Respaldo, Exportación y Protección de Datos

1. **Almacenamiento Local (IndexedDB)**: Todo se guarda al instante sin necesidad de pulsar botones "guardar", con costo S/ 0 y sin servicios externos.
2. **Persistencia Garantizada**: La app solicita `navigator.storage.persist()` para que el navegador y el sistema operativo no borren la base de datos local ante limpiezas de almacenamiento.
3. **Respaldo JSON Completo**:
   - Genera archivos con nombre estandarizado `abasto-respaldo-AAAA-MM-DD.json` con `schemaVersion: 1`.
   - Al restaurar ofrece dos modos claros con confirmación:
     - **Combinar por ID**: Conserva las salidas locales, añade las nuevas y actualiza si el archivo es más reciente (sin duplicar).
     - **Reemplazar Todo**: Sustituye por completo el almacén local con los datos del respaldo.
4. **Exportar a Excel (CSV con BOM UTF-8)**:
   - Genera archivos `abasto-resumen-AAAA-MM-DD.csv` con encabezados, totales por stand, listado consolidado por producto y detalle de líneas.
   - Incluye BOM UTF-8 (`\uFEFF`) para que Microsoft Excel en Windows abra las tildes (`á, í, ú`) y la letra `ñ` sin caracteres extraños ni desconfiguración.
5. **Compartir por WhatsApp**:
   - Envía el resumen consolidado de la salida directamente por WhatsApp mediante la Web Share API o enlace web.
6. **Aviso Periódico de Respaldo**:
   - Muestra una alerta automática en la app si han transcurrido más de 7 días sin descargar una copia de seguridad.

---

## 🛠️ Estructura del Proyecto

* `index.html`: Shell SPA accesible, botones grandes para uso con una mano y contraste optimizado bajo sol.
* `manifest.webmanifest`: Manifiesto PWA oficial (`name: "Abasto"`, `short_name: "Abasto"`).
* `sw.js`: Service Worker versionado (`abasto-v7`) con limpieza automática y caché offline.
* `css/styles.css`: Estilos táctiles (zonas táctiles $\ge 48$ px), tema claro/oscuro y reglas de impresión/PDF.
* `js/money.js`: Lógica financiera estricta en céntimos enteros (elimina errores de punto flotante).
* `js/models.js`: Normalización de texto, tabla cerrada de unidades de compra, consolidación producto+unidad y totales.
* `js/parser.js`: Intérprete heurístico de texto libre y parser CSV con autodetección de encodings (Windows-1252, UTF-8, UTF-16).
* `js/export.js`: Generación de JSON con schemaVersion, CSV con BOM, compartir en WhatsApp y recordatorios.
* `js/db.js`: Persistencia local en IndexedDB nativo con promesas y transacciones atómicas.
* `js/store.js`: Estado Pub/Sub simple con persistencia inmediata y catálogo in-memory deducido del historial.
* `js/views/`: Vistas modulares (`homeView`, `salidaView`, `standView`, `resumenView`, `listaView`, `backupView`).
* `test/tests.mjs`: Suite de 27 pruebas unitarias ejecutables con Node.js (`npm test`).
