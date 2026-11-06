'use strict';

/*
 * Service worker de la presentación (GitHub Pages proyecto).
 *
 * Vive en docs/sw.js y se registra desde index.html con una ruta relativa
 * ('sw.js'), así el scope queda en /esi-inscripcion-demo/ y no en la raíz
 * del dominio.
 *
 * Estrategia:
 * - Navegación / HTML: network-first. Si hay red, siempre llega la versión
 *   nueva; si no hay red, se usa la copia cacheada.
 * - CSS, JS, logos, fotos y demás assets: cache-first.
 * - El audio (assets/audio/) no se precachea ni se guarda en runtime.
 * - Las URLs se normalizan sin ?v=N para que una foto no ocupe dos entradas.
 *
 * Si cambian las fotos o cualquier asset, subir CACHE a esi-v2 (o siguiente)
 * para que se descarte la copia vieja. El HTML se actualiza solo por la
 * estrategia network-first.
 *
 * No hay archivos CSS/JS externos ni fuentes: los estilos y scripts están
 * inline en index.html y las fuentes son del sistema. Por eso el precache
 * cubre el HTML, los logos y las 56 variantes de las fotos (1280 y 800).
 */

const CACHE = 'esi-v1';
const SCOPE = self.registration.scope;
const INDEX = new URL('./index.html', SCOPE).href;

const PRECACHE = [
  './',
  './index.html',
  './assets/logo-iss-round.webp',
  './assets/logo-aes-round.webp',
  './assets/og-cover.jpg',
  './assets/promo/aula-pizarron-800.avif',
  './assets/promo/aula-pizarron-800.webp',
  './assets/promo/aula-pizarron.avif',
  './assets/promo/aula-pizarron.webp',
  './assets/promo/bandera-humo-800.avif',
  './assets/promo/bandera-humo-800.webp',
  './assets/promo/bandera-humo.avif',
  './assets/promo/bandera-humo.webp',
  './assets/promo/cavernicolas-800.avif',
  './assets/promo/cavernicolas-800.webp',
  './assets/promo/cavernicolas.avif',
  './assets/promo/cavernicolas.webp',
  './assets/promo/corazones-pared-800.avif',
  './assets/promo/corazones-pared-800.webp',
  './assets/promo/corazones-pared.avif',
  './assets/promo/corazones-pared.webp',
  './assets/promo/escalera-buzos-800.avif',
  './assets/promo/escalera-buzos-800.webp',
  './assets/promo/escalera-buzos.avif',
  './assets/promo/escalera-buzos.webp',
  './assets/promo/festejo-torta-800.avif',
  './assets/promo/festejo-torta-800.webp',
  './assets/promo/festejo-torta.avif',
  './assets/promo/festejo-torta.webp',
  './assets/promo/manos-arriba-bn-800.avif',
  './assets/promo/manos-arriba-bn-800.webp',
  './assets/promo/manos-arriba-bn.avif',
  './assets/promo/manos-arriba-bn.webp',
  './assets/promo/naranja-turquesa-patio-800.avif',
  './assets/promo/naranja-turquesa-patio-800.webp',
  './assets/promo/naranja-turquesa-patio.avif',
  './assets/promo/naranja-turquesa-patio.webp',
  './assets/promo/pasillo-naranja-turquesa-800.avif',
  './assets/promo/pasillo-naranja-turquesa-800.webp',
  './assets/promo/pasillo-naranja-turquesa.avif',
  './assets/promo/pasillo-naranja-turquesa.webp',
  './assets/promo/pasto-bn-800.avif',
  './assets/promo/pasto-bn-800.webp',
  './assets/promo/pasto-bn.avif',
  './assets/promo/pasto-bn.webp',
  './assets/promo/patio-certificado-800.avif',
  './assets/promo/patio-certificado-800.webp',
  './assets/promo/patio-certificado.avif',
  './assets/promo/patio-certificado.webp',
  './assets/promo/selfie-aula-800.avif',
  './assets/promo/selfie-aula-800.webp',
  './assets/promo/selfie-aula.avif',
  './assets/promo/selfie-aula.webp',
  './assets/promo/vaqueros-800.avif',
  './assets/promo/vaqueros-800.webp',
  './assets/promo/vaqueros.avif',
  './assets/promo/vaqueros.webp',
  './assets/promo/verano-800.avif',
  './assets/promo/verano-800.webp',
  './assets/promo/verano.avif',
  './assets/promo/verano.webp'
];

function sinVersion(url) {
  const limpia = new URL(url, SCOPE);
  limpia.search = '';
  limpia.hash = '';
  return limpia.href;
}

function clave(request) {
  return sinVersion(request.url);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres
      .filter((nombre) => nombre.indexOf('esi-') === 0 && nombre !== CACHE)
      .map((nombre) => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

async function redPrimero(request) {
  const cache = await caches.open(CACHE);
  const key = clave(request);
  try {
    const respuesta = await fetch(request, { cache: 'no-store' });
    if (respuesta && respuesta.ok) await cache.put(key, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(key);
    if (guardada) return guardada;
    const indice = await cache.match(sinVersion(INDEX));
    return indice || Response.error();
  }
}

async function cachePrimero(request) {
  const cache = await caches.open(CACHE);
  const key = clave(request);
  const guardada = await cache.match(key);
  if (guardada) return guardada;
  const respuesta = await fetch(request);
  if (respuesta && respuesta.ok && respuesta.type === 'basic') {
    await cache.put(key, respuesta.clone());
  }
  return respuesta;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* El audio opcional no forma parte del offline: no se precachea ni se
     guarda cuando el usuario lo reproduce. */
  if (url.pathname.indexOf('/assets/audio/') >= 0) return;

  const aceptaHtml = (request.headers.get('accept') || '').indexOf('text/html') >= 0;
  if (request.mode === 'navigate' || aceptaHtml) {
    event.respondWith(redPrimero(request));
    return;
  }
  event.respondWith(cachePrimero(request));
});
