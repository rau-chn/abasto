/**
 * Aplicación Principal Abasto: Enrutador SPA, inicialización y gestión PWA.
 */

import {
  initStore,
  subscribe,
  getState,
  setStoragePersisted,
  setUpdateAvailable
} from './store.js';
import { renderHomeView } from './views/homeView.js';
import { renderSalidaView } from './views/salidaView.js';
import { renderStandView } from './views/standView.js';
import { renderResumenView } from './views/resumenView.js';
import { renderListaView } from './views/listaView.js';
import { renderBackupView } from './views/backupView.js';

const appRoot = document.getElementById('app-root');
const updateBanner = document.getElementById('sw-update-banner');
const btnSwUpdate = document.getElementById('btn-sw-update');
const btnToggleTheme = document.getElementById('btn-toggle-theme');
const storageBadge = document.getElementById('storage-status-badge');

let currentRoute = { name: 'home', params: {} };

/**
 * Resuelve la ruta activa a partir del hash de la URL.
 */
function parseHash(hash) {
  const clean = hash.replace(/^#\/?/, '').trim();
  if (!clean || clean === 'home') {
    return { name: 'home', params: {} };
  }

  const parts = clean.split('/');

  // #salida/:id
  if (parts[0] === 'salida' && parts[1]) {
    if (parts[2] === 'lista') {
      return { name: 'lista', params: { salidaId: parts[1] } };
    }
    if (parts[2] === 'resumen') {
      return { name: 'resumen', params: { salidaId: parts[1] } };
    }
    return { name: 'salida', params: { salidaId: parts[1] } };
  }

  // #stand/:salidaId/:standId
  if (parts[0] === 'stand' && parts[1] && parts[2]) {
    return { name: 'stand', params: { salidaId: parts[1], standId: parts[2] } };
  }

  // #backup
  if (parts[0] === 'backup') {
    return { name: 'backup', params: {} };
  }

  return { name: 'home', params: {} };
}

/**
 * Renderiza la vista que corresponda a la ruta activa.
 */
function renderCurrentView() {
  if (!appRoot) return;

  switch (currentRoute.name) {
    case 'home':
      renderHomeView(appRoot);
      break;

    case 'salida':
      renderSalidaView(appRoot, currentRoute.params.salidaId);
      break;

    case 'stand':
      renderStandView(appRoot, currentRoute.params.salidaId, currentRoute.params.standId);
      break;

    case 'lista':
      renderListaView(appRoot, currentRoute.params.salidaId);
      break;

    case 'resumen':
      renderResumenView(appRoot, currentRoute.params.salidaId);
      break;

    case 'backup':
      renderBackupView(appRoot);
      break;

    default:
      renderHomeView(appRoot);
  }
}

/**
 * Manejador del evento hashchange.
 */
function handleHashChange() {
  currentRoute = parseHash(window.location.hash);
  renderCurrentView();
  window.scrollTo(0, 0);
}

/**
 * Gestión del tema claro/oscuro.
 */
function initTheme() {
  const saved = localStorage.getItem('abasto_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (!saved && prefersDark);

  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (btnToggleTheme) btnToggleTheme.textContent = '☀️';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (btnToggleTheme) btnToggleTheme.textContent = '🌙';
  }

  btnToggleTheme?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('abasto_theme', 'light');
      btnToggleTheme.textContent = '🌙';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('abasto_theme', 'dark');
      btnToggleTheme.textContent = '☀️';
    }
  });
}

/**
 * Solicita almacenamiento persistente a la API del navegador.
 */
async function checkStoragePersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      setStoragePersisted(isPersisted);
      if (storageBadge) {
        storageBadge.style.display = 'inline-flex';
        storageBadge.textContent = isPersisted ? '💾 Persistente' : '💾 Local';
        storageBadge.title = isPersisted
          ? 'Tus datos están protegidos contra limpieza automática del navegador'
          : 'Almacenamiento no garantizado por el navegador. Recuerda respaldar con frecuencia.';
      }
    } catch (e) {
      console.warn('No se pudo verificar persistencia:', e);
    }
  }
}

/**
 * Registro y actualización del Service Worker con detección de nueva versión.
 */
function initServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      // Si ya hay un worker esperando al cargar
      if (registration.waiting) {
        showUpdateBanner(registration.waiting);
      }

      // Si se encuentra una actualización mientras está abierto
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch((err) => {
      console.warn('No se pudo registrar Service Worker:', err);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

function showUpdateBanner(worker) {
  setUpdateAvailable(true, worker);
  if (updateBanner) {
    updateBanner.style.display = 'flex';
  }
  btnSwUpdate?.addEventListener('click', () => {
    if (worker) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

/**
 * Gestión del evento de instalación nativa PWA (beforeinstallprompt).
 */
let deferredPrompt = null;
const btnInstallPwa = document.getElementById('btn-install-pwa');

function initPwaInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstallPwa) {
      btnInstallPwa.style.display = 'inline-flex';
    }
  });

  btnInstallPwa?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted' && btnInstallPwa) {
        btnInstallPwa.style.display = 'none';
      }
    } catch (err) {
      // ignorar
    }
    deferredPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    if (btnInstallPwa) btnInstallPwa.style.display = 'none';
    deferredPrompt = null;
  });
}

// Inicialización de la aplicación
async function initApp() {
  initTheme();
  window.addEventListener('hashchange', handleHashChange);

  // Suscribirse a cambios del store para refrescar la vista activa
  subscribe(() => {
    renderCurrentView();
  });

  // Cargar datos de IndexedDB
  await initStore();

  // Resolver ruta inicial
  handleHashChange();

  // Tareas en segundo plano
  checkStoragePersistence();
  initServiceWorker();
  initPwaInstall();
}

// Arrancar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
