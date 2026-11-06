'use strict';

/*
 * Contrato de la presentación (docs/index.html).
 *
 * La navegación tiene que ser nativa: scroll-snap en el documento, sin
 * listeners que cancelen el scroll ni JS que mueva el scroll en cada cambio.
 * Las animaciones de entrada y de gráficos solo pueden tocar transform y
 * opacity. Este test falla si vuelve a aparecer cualquiera de esas cosas.
 *
 *   node tests/presentacion.js
 */

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'docs', 'sw.js'), 'utf8');
const PRECACHE = SW.split('const PRECACHE = [')[1].split('];')[0];

const checks = [];
function check(name, ok, detail) {
  checks.push({ name: name, ok: !!ok, detail: detail || '' });
}

function jpegDimensions(file) {
  const data = fs.readFileSync(file);
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) { i += 1; continue; }
    const marker = data[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
    i += 2 + data.readUInt16BE(i + 2);
  }
  return null;
}

function luminance(rgb) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function over(foreground, background, alpha) {
  return foreground.map((value, index) => value * alpha + background[index] * (1 - alpha));
}

// Navegación nativa: el navegador maneja rueda, touch y teclado.
check('scroll-snap-type en el documento', /scroll-snap-type:\s*y\s+(proximity|mandatory)/.test(HTML));
check('cada diapositiva declara scroll-snap-align', /scroll-snap-align:\s*start/.test(HTML));
check('no hay listener de touchmove', !/addEventListener\(\s*['"]touchmove['"]/.test(HTML));
check('no hay listener de pointermove', !/addEventListener\(\s*['"]pointermove['"]/.test(HTML));
check('no hay listener de wheel', !/addEventListener\(\s*['"]wheel['"]/.test(HTML));
check('ningun handler cancela el scroll', !/preventDefault/.test(HTML));
check('el JS no mueve el scroll en cada cambio', !/scrollTop\s*=/.test(HTML));
check('los botones navegan con scrollIntoView', /scrollIntoView\(\s*\{/.test(HTML));
check('las flechas izquierda/derecha cambian de diapositiva', /ArrowRight/.test(HTML) && /ArrowLeft/.test(HTML));
check('el revelado usa IntersectionObserver', /IntersectionObserver/.test(HTML));
check('respeta prefers-reduced-motion', /prefers-reduced-motion/.test(HTML));

// Nada de trabajo pesado por frame.
check('sin backdrop-filter', !/backdrop-filter/.test(HTML));
check('sin animaciones infinitas de fondo', !/@keyframes aurora/.test(HTML) && !/@keyframes logo-drift/.test(HTML));
check('barras animan transform (no width)',
  /\.slide\.charts-in \.bar-fill \{ transform: scaleX/.test(HTML) && !/\.bar-fill[^}]*transition: width/.test(HTML));
check('columnas animan transform (no height)',
  /\.slide\.charts-in \.course-bar \{ transform: scaleY/.test(HTML) && !/\.course-bar[^}]*transition: height/.test(HTML));
check('stack anima transform (no width)', /\.slide\.charts-in \.stack \.seg \{ transform: scaleX/.test(HTML));
check('sin estados ocultos de entrada (nada depende de clases)', !/\.slide:not\(\.settled\)/.test(HTML) && !/\.slide\.in-view/.test(HTML) && !/\.slide\.instant/.test(HTML));
check('blur solo en los logos de fondo decorativos (4 reglas, nada mas)', (HTML.match(/filter:\s*blur\(/g) || []).length === 4 && !/backdrop-filter/.test(HTML) && /filter:\s*blur\(8\px\);/.test(HTML) && /filter:\s*blur\(10\px\);/.test(HTML));
check('sin stagger del efecto', !/transition-delay: \.\d/.test(HTML));
check('sin will-change', !/will-change|willChange/.test(HTML));
check('el IO solo dispara contadores y graficos, sin clase de visibilidad',
  /chartsSlide/.test(HTML) && /classList\.add\('charts-in'\)/.test(HTML) && !/classList\.add\('in-view'\)/.test(HTML) && !/classList\.add\('settled'\)/.test(HTML));
check('la barra de progreso anima transform', /\.progress \{[^}]*transform: scaleX\(0\)/.test(HTML));
check('los graficos no animan layout',
  !/transition:\s*(width|height)\b/.test(HTML));

// Contenido.
check('23 diapositivas', (HTML.match(/<section class="slide/g) || []).length === 23);
check('7 diapositivas de fotos de la promo', (HTML.match(/class="slide promo-foto"/g) || []).length === 7);
check('14 fotos referenciadas como src', (HTML.match(/ src="assets\/promo\//g) || []).length === 14);
check('ninguna foto va lazy: todo el DOM desde el arranque', !/loading="lazy"/.test(HTML) && (HTML.match(/<img [^>]*src="assets\/promo\/[^>]*decoding="async"/g) || []).length === 14);
check('las fotos van en webp con srcset 800w/1280w', (HTML.match(/ src="assets\/promo\/[a-z0-9-]+\.webp[?]v=(2|3)"/g) || []).length === 14 && (HTML.match(/-800\.webp[?]v=(2|3) 800w, assets\/promo\//g) || []).length === 14 && (HTML.match(/\.webp[?]v=(2|3) 1280w"/g) || []).length === 14 && !/assets\/promo\/[a-z0-9-]+\.jpg/.test(HTML));
check('cada foto ofrece avif y webp de respaldo', (HTML.match(/<source type="image\/avif"/g) || []).length === 14 && (HTML.match(/ src="assets\/promo\//g) || []).length === 14);
check('todas las fotos referenciadas existen en disco', (HTML.match(/assets\/promo\/[a-z0-9-]+\.(?:webp|avif)(?:\?v=\d+)?/g) || [])
  .map((p) => p.replace(/\?.*$/, ''))
  .every((p) => fs.existsSync(path.join(__dirname, '..', 'docs', p))));
check('visor de fotos en grande con dialogo accesible y cierre por X, afuera, Escape y swipe',
  /id="lightbox"[^>]*role="dialog"[^>]*aria-modal="true"/.test(HTML) &&
  /id="lightbox-cerrar"[^>]*aria-label="Cerrar foto"/.test(HTML) &&
  /id="lightbox-prev"[^>]*aria-label="Foto anterior"/.test(HTML) &&
  /id="lightbox-next"[^>]*aria-label="Foto siguiente"/.test(HTML) &&
  /lightboxCerrar\.addEventListener\('click', cerrarLightbox\)/.test(HTML) &&
  /event\.target === lightbox/.test(HTML) &&
  /event\.key === 'Escape'/.test(HTML) &&
  /Math\.abs\(dy\) > 70/.test(HTML) && /if \(dy > 0\) cerrarLightbox\(\)/.test(HTML));
check('el visor usa la foto de 1280, bloquea solo el scroll y vuelve al mismo lugar',
  /lightboxImg\.src = foto\.getAttribute\('src'\)/.test(HTML) &&
  !/lightboxImg\.src = foto\.currentSrc/.test(HTML) &&
  /html\.lightbox-abierto, html\.lightbox-abierto body \{ overflow: hidden; \}/.test(HTML) &&
  /document\.documentElement\.classList\.add\('lightbox-abierto'\)/.test(HTML) &&
  /scrollAnterior = window\.scrollY/.test(HTML) &&
  /window\.scrollTo\(0, scrollAnterior\)/.test(HTML) &&
  /lightboxCerrar\.focus\(\{ preventScroll: true \}\)/.test(HTML) &&
  /focoAnterior\.focus\(\{ preventScroll: true \}\)/.test(HTML));
check('el visor solo anima opacity 150 ms y pasa fotos de la misma diapositiva',
  /transition: opacity \.15s ease/.test(HTML) &&
  /const slide = foto\.closest\('\.slide'\)/.test(HTML) &&
  /fotoLightbox = \(fotoLightbox \+ delta \+ fotosLightbox\.length\) % fotosLightbox\.length/.test(HTML) &&
  /moverFotoLightbox\(dx < 0 \? 1 : -1\)/.test(HTML));
check('modo presentacion: boton play/pausa, 8 s por diapositiva y fin en la ultima',
  /id="autoplay"[^>]*aria-pressed="false"/.test(HTML) &&
  /const AUTOPLAY_MS = 8000/.test(HTML) &&
  /let autoplayOn = false/.test(HTML) &&
  /goTo\(siguiente\)/.test(HTML) &&
  /if \(current >= slides\.length - 1\) pausarAutoplay\(\)/.test(HTML) &&
  /scrollIntoView/.test(HTML));
check('autoplay se pausa con toque, scroll, teclado, visor o pestana oculta y nunca arranca solo',
  /addEventListener\('scroll', \(\) => \{/.test(HTML) &&
  /if \(autoplayOn\) pausarAutoplay\(\)/.test(HTML) &&
  /addEventListener\('mousedown', pausaPorUsuario, true\)/.test(HTML) &&
  /addEventListener\('touchstart', pausaPorUsuario/.test(HTML) &&
  /event\.key === 'p' \|\| event\.key === 'P'/.test(HTML) &&
  /addEventListener\('visibilitychange'/.test(HTML) &&
  /if \(typeof pausarAutoplay === 'function'\) pausarAutoplay\(\)/.test(HTML) &&
  !/^\s*activarAutoplay\(\);/m.test(HTML));
check('el modo presentacion se oculta con prefers-reduced-motion y muestra pausa + barra fina',
  /autoplayBtn\.hidden = reduceMotion\.matches/.test(HTML) &&
  /autoplayPlay\.hidden = autoplayOn/.test(HTML) &&
  /autoplayPausa\.hidden = !autoplayOn/.test(HTML) &&
  /id="autoplay-barra"/.test(HTML) &&
  /transition: transform 8s linear/.test(HTML) &&
  /transform: scaleX\(1\)/.test(HTML));
check('musica opcional: audio sin precarga, bucle y boton oculto hasta confirmar el archivo',
  /<audio id="musica-audio" src="assets\/audio\/fondo\.mp3" loop preload="none"/.test(HTML) &&
  !/<audio[^>]*autoplay/.test(HTML) &&
  /id="musica"[^>]*aria-pressed="false"[^>]*title="Activar música de fondo" hidden/.test(HTML) &&
  /method: 'HEAD'/.test(HTML) &&
  /esperarServiceWorker\(\)/.test(HTML) &&
  /if \(!respuesta \|\| respuesta\.status !== 200\) return/.test(HTML) &&
  /musicaBtn\.hidden = false/.test(HTML) &&
  /\.catch\(\(\) => \{ \/\* sin archivo o sin red/);
check('musica: volumen 0,4, fades de 600 ms y preferencia recordada sin autoplay',
  /const MUSICA_VOLUMEN = 0\.4/.test(HTML) &&
  /const MUSICA_FADE_MS = 600/.test(HTML) &&
  /try \{ prefMusica = localStorage\.getItem\('esi-musica'\) === '1'; \} catch/.test(HTML) &&
  /try \{ localStorage\.setItem\('esi-musica'/.test(HTML) &&
  /addEventListener\('click', alternarMusica\)/.test(HTML) &&
  /fadeMusica\(MUSICA_VOLUMEN, MUSICA_FADE_MS\)/.test(HTML) &&
  /if \(!musicaAudio\.paused\) musicaAudio\.pause\(\)/.test(HTML));
check('service worker relativo con scope del proyecto y precache de HTML, logos y 56 fotos',
  /register\('sw\.js'\)/.test(HTML) &&
  !/register\('\/sw\.js'\)/.test(HTML) &&
  /const CACHE = 'esi-v1'/.test(SW) &&
  /const INDEX = new URL\('\.\/index\.html', SCOPE\)\.href/.test(SW) &&
  (PRECACHE.match(/\.\/assets\/promo\//g) || []).length === 56 &&
  PRECACHE.indexOf('assets/audio') < 0 &&
  /\.\/assets\/logo-iss-round\.webp/.test(PRECACHE) &&
  /\.\/assets\/logo-aes-round\.webp/.test(PRECACHE) &&
  /await cache\.addAll\(PRECACHE\)/.test(SW));
check('service worker: HTML network-first, assets cache-first y sin duplicar ?v=N',
  /request\.mode === 'navigate'/.test(SW) &&
  /async function redPrimero/.test(SW) &&
  /async function cachePrimero/.test(SW) &&
  /const respuesta = await fetch\(request, \{ cache: 'no-store' \}\)/.test(SW) &&
  /limpia\.search = ''/.test(SW) &&
  /function clave\(request\)/.test(SW) &&
  /await cache\.put\(key, respuesta\.clone\(\)\)/.test(SW) &&
  /cache\.match\(key\)/.test(SW));
check('service worker: version nueva limpia caches viejas, toma control y no toca el audio',
  /self\.addEventListener\('install'/.test(SW) &&
  /await self\.skipWaiting\(\)/.test(SW) &&
  /self\.addEventListener\('activate'/.test(SW) &&
  /nombre\.indexOf\('esi-'\) === 0 && nombre !== CACHE/.test(SW) &&
  /await self\.clients\.claim\(\)/.test(SW) &&
  /request\.method === 'HEAD'/.test(SW) &&
  /status: 204/.test(SW) &&
  /request\.method !== 'GET'/.test(SW) &&
  /url\.pathname\.indexOf\('\/assets\/audio\/'\) >= 0\) return/.test(SW));
check('la foto horizontal del aula va con version 3', /aula-pizarron\.webp[?]v=3/.test(HTML) && /aula-pizarron-800\.webp[?]v=3/.test(HTML) && /aula-pizarron\.webp[?]v=3 1280w/.test(HTML) && /width="1280" height="720" decoding="async" style="--pos: 50% 55%"/.test(HTML));
check('pantalla de carga con techo de 2,5 s', /id="carga"/.test(HTML) && /2500/.test(HTML) && /carga-listo/.test(HTML));
check('fetchpriority solo en el logo del loader, el header y la primera foto', (HTML.match(/fetchpriority="\high"/g) || []).length === 3 && /fetchpriority="\high"[^>]*src="assets\/promo\/bandera-humo\.webp[?]v=2"/.test(HTML));
check('sizes por grupo de galeria', (HTML.match(/sizes="\(max-width: 768px\) 88vw, 532px"/g) || []).length === 16 && (HTML.match(/sizes="\(max-width: 768px\) 88vw, 349px"/g) || []).length === 6 && (HTML.match(/sizes="\(max-width: 768px\) 88vw, 880px"/g) || []).length === 2 && (HTML.match(/sizes="\(max-width: 768px\) 88vw, 1080px"/g) || []).length === 4);
check('logos en webp y sin png/jpg grandes', /assets\/logo-iss-round\.webp/.test(HTML) && /assets\/logo-aes-round\.webp/.test(HTML) && !/logo-iss-round\.png/.test(HTML) && !/logo-aes-round\.png/.test(HTML));
check('logo del header con fetchpriority high', /class="brand-logo"[^>]*fetchpriority="high"/.test(HTML));

check('el CSS cierra todas las llaves', (() => {
  const css = HTML.split('<style>')[1].split('</style>')[0];
  return (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length;
})());
check('prefers-reduced-motion no queda anidado en otro @media', (() => {
  const css = HTML.split('<style>')[1].split('</style>')[0];
  const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (at < 0) return false;
  const before = css.slice(0, at);
  return (before.match(/\{/g) || []).length === (before.match(/\}/g) || []).length;
})());
check('preview al compartir (Open Graph y Twitter Card)',
  /property="og:type" content="website"/.test(HTML) &&
  /property="og:locale" content="es_AR"/.test(HTML) &&
  /property="og:title" content="Jornada ESI 2026 · Una historia que no se detuvo"/.test(HTML) &&
  /property="og:url" content="https:\/\/lxchoooo\.github\.io\/esi-inscripcion-demo\/"/.test(HTML) &&
  /property="og:image" content="https:\/\/lxchoooo\.github\.io\/esi-inscripcion-demo\/assets\/og-cover\.jpg\?v=1"/.test(HTML) &&
  /name="twitter:card" content="summary_large_image"/.test(HTML) &&
  /name="twitter:image" content="https:\/\/lxchoooo\.github\.io\/esi-inscripcion-demo\/assets\/og-cover\.jpg\?v=1"/.test(HTML));
check('la imagen para compartir es un JPEG 1200x630 de menos de 250 KB', (() => {
  const file = path.join(__dirname, '..', 'docs', 'assets', 'og-cover.jpg');
  if (!fs.existsSync(file)) return false;
  const size = jpegDimensions(file);
  return /property="og:image:type" content="image\/jpeg"/.test(HTML) &&
    /property="og:image:width" content="1200"/.test(HTML) &&
    /property="og:image:height" content="630"/.test(HTML) &&
    size && size.width === 1200 && size.height === 630 &&
    fs.statSync(file).size < 250 * 1024;
})());
check('la presentacion no se indexa y no depende de robots.txt',
  /<meta name="robots" content="noindex, nofollow, noarchive">/.test(HTML) &&
  /Google no la muestra en búsquedas, pero cualquiera con el enlace puede verla/.test(HTML) &&
  !fs.existsSync(path.join(__dirname, '..', 'docs', 'robots.txt')) &&
  !fs.existsSync(path.join(__dirname, '..', 'robots.txt')));
check('cuatro datos en la slide de charlas usan 2x2, sin tarjeta huerfana',
  /class="stat-row four"/.test(HTML) && /\.stat-row\.four \{ grid-template-columns: repeat\(2/.test(HTML));
check('el grafico por curso tiene role=img y detalle accesible',
  /id="courseChart" role="img"/.test(HTML) && /setAttribute\('aria-label', 'Asistencia a charlas/.test(HTML));
check('pantalla completa se oculta si el navegador no la soporta',
  /document\.fullscreenEnabled/.test(HTML) && /aria-pressed/.test(HTML));
check('la cola de fotos se decodifica de a una, sin Promise.all',
  /requestIdleCallback\(siguiente/.test(HTML) && !/Promise\.all\(pendientes\.map\(revelar\)\)/.test(HTML));
check('los porcentajes de las franjas usan coma decimal',
  /numberText\(slot\.presentRate, 1\)/.test(HTML));
check('la segunda franja no dice que tuvo mas ausencias que las otras',
  /En la segunda hubo menos asistencias/.test(HTML) && !/En la segunda aparecieron más ausencias/.test(HTML));
check('el 85% se explica sobre las reservas marcadas',
  /De las reservas que quedaron marcadas, el 85%/.test(HTML));
check('color-scheme oscuro para scrollbars y controles nativos',
  /color-scheme:\s*dark/.test(HTML));
check('recorte horizontal con respaldo para navegadores sin overflow:clip',
  /@supports not \(overflow: clip\)/.test(HTML) && /overflow-x: hidden/.test(HTML));
check('un enlace #slide-N pegado con la pagina abierta tambien navega',
  /addEventListener\('hashchange'/.test(HTML) && /location\.hash\.match\(\/slide-/.test(HTML));
check('el texto tenue pasa WCAG AA sobre el fondo y sobre las tarjetas', (() => {
  const css = HTML.split('<style>')[1].split('</style>')[0];
  const raw = (css.match(/--faint:\s*rgba\(245,\s*241,\s*232,\s*([\d.]+)\)/) || [])[1];
  if (!raw) return false;
  const alpha = parseFloat(raw);
  const ink = [11, 31, 23];
  /* .glass arranca en blanco al 10% sobre el fondo: ese es el peor caso. */
  const glass = [255 * 0.1 + ink[0] * 0.9, 255 * 0.1 + ink[1] * 0.9, 255 * 0.1 + ink[2] * 0.9];
  const cream = [245, 241, 232];
  return contrast(over(cream, ink, alpha), ink) >= 4.5 &&
    contrast(over(cream, glass, alpha), glass) >= 4.5;
})());
check('los botones navegan por data-title, no por indice',
  (HTML.match(/data-go="/g) || []).length >= 6 && !/data-go="\d+"/.test(HTML));
check('un solo role=img por grafico',
  /el\.setAttribute\('aria-label'/.test(HTML) && /svg\.setAttribute\('aria-hidden', 'true'\)/.test(HTML));

check('contador inicial 01 / 23', /01 \/ 23</.test(HTML));
check('contadores con data-count', (HTML.match(/data-count=/g) || []).length >= 4);
check('graficos de entrada y charlas', /id="entryDonut"/.test(HTML) && /id="talksDonut"/.test(HTML));
check('graficos de temas, cursos y franjas',
  /id="topicsChart"/.test(HTML) && /id="courseChart"/.test(HTML) && /id="slotChart"/.test(HTML));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log((c.ok ? 'ok    ' : 'FALLA ') + c.name + (c.detail ? ' · ' + c.detail : ''));
}
console.log('\n' + (checks.length - failed.length) + ' ok, ' + failed.length + ' fallas');
if (failed.length) process.exit(1);
