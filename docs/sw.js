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
 * - Fotos, logos y demás assets: cache-first.
 * - Audio: se cachea la copia completa durante la pantalla de carga y se
 *   sirve con soporte de Range para que el <audio> pueda buscar sin red.
 * - El precache de instalación es chico (HTML y logos). La página le manda
 *   por mensaje las fotos y la música que necesita este dispositivo, así no
 *   baja las 56 variantes (AVIF/WebP, 800/1280) en todos los casos.
 *
 * Si cambian las fotos o cualquier asset, subir CACHE a esi-v4 (o siguiente)
 * para que se descarte la copia vieja.
 */

const CACHE = 'esi-v3';
const SCOPE = self.registration.scope;
const INDEX = new URL('./index.html', SCOPE).href;

/* Cascarón mínimo: alcanza para abrir la página sin red. Las fotos y la
   música las pide la página después, según el formato y el tamaño que usa. */
const PRECACHE = [
  './',
  './index.html',
  './assets/logo-iss-round.webp',
  './assets/logo-aes-round.webp',
  './assets/og-cover.jpg'
];

function absoluta(url) {
  return new URL(url, SCOPE).href;
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
  try {
    const respuesta = await fetch(request, { cache: 'no-store' });
    if (respuesta && respuesta.ok) await cache.put(request.url, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(request.url, { ignoreVary: true });
    if (guardada) return guardada;
    const indice = await cache.match(INDEX, { ignoreVary: true }) || await cache.match(absoluta('./'), { ignoreVary: true });
    return indice || Response.error();
  }
}

async function cachePrimero(request) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(request.url, { ignoreVary: true });
  if (guardada) return guardada;
  const respuesta = await fetch(request);
  if (respuesta && respuesta.ok && respuesta.type === 'basic') {
    await cache.put(request.url, respuesta.clone());
  }
  return respuesta;
}

/* El <audio> pide rangos (bytes=...). Si la canción está completa en caché,
   se parte el ArrayBuffer y se devuelve un 206. Si no está cacheada, se deja
   pasar el pedido a la red para no romper la reproducción online. */
async function responderAudio(cacheada, request) {
  const rango = request.headers.get('range');
  if (!rango) return cacheada;

  const buffer = await cacheada.arrayBuffer();
  const total = buffer.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rango.trim());
  if (!match || total <= 0) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
  }

  let inicio;
  let fin;
  if (match[1] === '') {
    inicio = total - Number(match[2]);
    fin = total - 1;
  } else {
    inicio = Number(match[1]);
    fin = match[2] === '' ? total - 1 : Math.min(Number(match[2]), total - 1);
  }
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio < 0 || inicio > fin || inicio >= total) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
  }

  const trozo = buffer.slice(inicio, fin + 1);
  return new Response(trozo, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cacheada.headers.get('content-type') || 'audio/mpeg',
      'Content-Range': 'bytes ' + inicio + '-' + fin + '/' + total,
      'Content-Length': String(trozo.byteLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    }
  });
}

function esAudio(url) {
  return url.pathname.indexOf('/assets/audio/') >= 0;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* HEAD del audio: 200 si está cacheado o existe en la red, 204 si no.
     La página lo usa para saber si mostrar el botón de música. */
  if (request.method === 'HEAD' && esAudio(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardada = await cache.match(request.url, { ignoreVary: true });
      if (guardada) {
        return new Response(null, {
          status: 200,
          headers: {
            'X-ESI-Size': guardada.headers.get('content-length') || '',
            'X-ESI-Audio': '1'
          }
        });
      }
      try {
        const respuesta = await fetch(request, { cache: 'no-store' });
        if (respuesta.ok) {
          return new Response(null, {
            status: 200,
            headers: {
              'X-ESI-Size': respuesta.headers.get('content-length') || '',
              'X-ESI-Audio': '1'
            }
          });
        }
      } catch (error) { /* sin red */ }
      return new Response(null, { status: 204, headers: { 'X-ESI-Audio': '0' } });
    })());
    return;
  }

  if (request.method !== 'GET') return;

  if (esAudio(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const guardada = await cache.match(request.url, { ignoreVary: true });
      if (guardada) return responderAudio(guardada, request);
      return fetch(request);
    })());
    return;
  }

  const aceptaHtml = (request.headers.get('accept') || '').indexOf('text/html') >= 0;
  if (request.mode === 'navigate' || aceptaHtml) {
    event.respondWith(redPrimero(request));
    return;
  }
  event.respondWith(cachePrimero(request));
});

/* --------------------------------------------------------------------------
 * Precarga con progreso
 * ------------------------------------------------------------------------ */

function publicar(port, datos) {
  if (!port) return;
  try { port.postMessage(datos); } catch (error) { /* puerto cerrado */ }
}

function cabecerasLimpias(headers) {
  const copia = new Headers(headers);
  copia.delete('content-encoding');
  copia.delete('content-length');
  copia.delete('transfer-encoding');
  copia.delete('connection');
  copia.delete('keep-alive');
  copia.delete('vary');
  return copia;
}

async function tamanoDe(url) {
  try {
    const respuesta = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const n = Number(respuesta.headers.get('content-length') || respuesta.headers.get('x-esi-size'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (error) {
    return 0;
  }
}

async function precargar(urls, port) {
  const cache = await caches.open(CACHE);
  const lista = Array.from(new Set((urls || []).map(absoluta)));
  if (!lista.length) {
    publicar(port, { type: 'done', loaded: 0, total: 0, files: 0, failed: 0, cached: 0 });
    return;
  }

  const tamanos = new Array(lista.length).fill(0);
  const enCache = new Array(lista.length).fill(false);

  for (let i = 0; i < lista.length; i += 1) {
    const guardada = await cache.match(lista[i], { ignoreVary: true });
    if (!guardada) continue;
    enCache[i] = true;
    const n = Number(guardada.headers.get('content-length') || guardada.headers.get('x-esi-size'));
    tamanos[i] = Number.isFinite(n) && n > 0 ? n : (await guardada.clone().blob()).size;
  }

  /* HEAD para saber cuánto pesa cada archivo y que la barra sea real. */
  let cursor = 0;
  const medir = async () => {
    while (cursor < lista.length) {
      const i = cursor;
      cursor += 1;
      if (!enCache[i]) tamanos[i] = await tamanoDe(lista[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, lista.length) }, medir));

  /* Si el servidor no manda Content-Length en todos los archivos, la barra
     avanza por archivo en vez de por bytes. Así no se llena a los 2 KB. */
  const porBytes = tamanos.every((n) => n > 0);
  if (!porBytes) tamanos.fill(1);

  let total = tamanos.reduce((a, b) => a + b, 0);
  if (!total) total = lista.length;

  let hecho = 0;
  let completados = 0;
  let fallos = 0;
  for (let i = 0; i < lista.length; i += 1) {
    if (enCache[i]) {
      hecho += tamanos[i] || 0;
      completados += 1;
    }
  }
  publicar(port, {
    type: 'progress',
    loaded: Math.min(hecho, total),
    total,
    files: lista.length,
    completed: completados,
    failed: 0,
    cached: enCache.filter(Boolean).length
  });

  /* Tres descargas a la vez: suficiente para avanzar rápido sin saturar
     la conexión del celular ni competir con las fotos de la página. */
  let siguiente = 0;
  const descargar = async () => {
    while (true) {
      const i = siguiente;
      siguiente += 1;
      if (i >= lista.length) return;
      if (enCache[i]) continue;

      const url = lista[i];
      const peso = tamanos[i] || 1;
      try {
        const respuesta = await fetch(url, { cache: 'default' });
        if (!respuesta || respuesta.status !== 200) throw new Error('HTTP ' + (respuesta && respuesta.status));
        let recibido = 0;
        let contenido;
        if (respuesta.body && respuesta.body.getReader) {
          const lector = respuesta.body.getReader();
          const trozos = [];
          while (true) {
            const { done, value } = await lector.read();
            if (done) break;
            trozos.push(value);
            recibido += value.length;
            publicar(port, {
              type: 'progress',
              loaded: Math.min(total, porBytes ? hecho + recibido : hecho),
              total,
              files: lista.length,
              completed: completados,
              failed: fallos,
              cached: enCache.filter(Boolean).length
            });
          }
          contenido = new Blob(trozos, { type: respuesta.headers.get('content-type') || '' });
        } else {
          contenido = await respuesta.blob();
          recibido = contenido.size;
        }
        const cabeceras = cabecerasLimpias(respuesta.headers);
        cabeceras.set('Content-Length', String(contenido.size));
        if (url.indexOf('/assets/audio/') >= 0) cabeceras.set('Accept-Ranges', 'bytes');
        await cache.put(url, new Response(contenido, {
          status: respuesta.status,
          statusText: respuesta.statusText,
          headers: cabeceras
        }));
        hecho += porBytes ? (recibido || peso) : 1;
      } catch (error) {
        fallos += 1;
        hecho += porBytes ? peso : 1;
      }

      completados += 1;
      publicar(port, {
        type: 'progress',
        loaded: Math.min(hecho, total),
        total,
        files: lista.length,
        completed: completados,
        failed: fallos,
        cached: enCache.filter(Boolean).length
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, lista.length) }, descargar));

  publicar(port, {
    type: 'done',
    loaded: Math.min(hecho, total),
    total,
    files: lista.length,
    completed: completados,
    failed: fallos,
    cached: enCache.filter(Boolean).length
  });
}

self.addEventListener('message', (event) => {
  const datos = event.data || {};
  if (datos.type !== 'PRECACHE') return;
  const port = event.ports && event.ports[0];
  event.waitUntil(precargar(datos.urls, port));
});
