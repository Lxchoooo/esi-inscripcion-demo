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
/* El visor de fotos es un modal aparte: ahí sí hace falta leer pointermove y
   cancelar el gesto para el zoom. El scroll de la presentación queda nativo. */
const VISOR = (HTML.match(/\/\* Visor de fotos:[\s\S]*?\/\* Los botones apuntan/) || [''])[0];
const SIN_VISOR = HTML.replace(VISOR, '');
check('el visor de fotos esta aislado del scroll de la presentacion', VISOR.length > 2000);
check('no hay listener de touchmove', !/addEventListener\(\s*['"]touchmove['"]/.test(SIN_VISOR));
check('no hay listener de pointermove', !/addEventListener\(\s*['"]pointermove['"]/.test(SIN_VISOR));
check('no hay listener de wheel', !/addEventListener\(\s*['"]wheel['"]/.test(SIN_VISOR));
check('ningun handler cancela el scroll', !/preventDefault/.test(SIN_VISOR));
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
check('sin will-change fuera del visor', (HTML.match(/will-change/g) || []).length === 1 &&
  /\.lightbox-figura img \{[^}]*will-change: transform;/.test(HTML));
check('el IO solo dispara contadores y graficos, sin clase de visibilidad',
  /chartsSlide/.test(HTML) && /classList\.add\('charts-in'\)/.test(HTML) && !/classList\.add\('in-view'\)/.test(HTML) && !/classList\.add\('settled'\)/.test(HTML));
check('la barra de progreso anima transform', /\.progress \{[^}]*transform: scaleX\(0\)/.test(HTML));
check('los graficos no animan layout',
  !/transition:\s*(width|height)\b/.test(HTML));

// Contenido.
check('28 diapositivas', (HTML.match(/<section class="slide/g) || []).length === 28);
check('7 diapositivas de fotos de la promo', (HTML.match(/class="slide promo-foto"/g) || []).length === 7);
check('5 diapositivas nuevas de texto de la promo', (HTML.match(/class="slide promo-mensaje"/g) || []).length === 5);
check('las 5 de texto van en orden entre el ultimo abrazo y Cinco anos', (() => {
  const pos = (name) => HTML.indexOf('data-title="' + name + '"');
  return pos('Todavía queda un último abrazo') < pos('Lo que no sale en las fotos') &&
    pos('Lo que no sale en las fotos') < pos('Carta al chico de primer año') &&
    pos('Carta al chico de primer año') < pos('A nuestras familias') &&
    pos('A nuestras familias') < pos('A los que nos enseñaron') &&
    pos('A los que nos enseñaron') < pos('Cuando pasen los años') &&
    pos('Cuando pasen los años') < pos('Cinco años');
})());
check('las 5 de texto van sin fotos, centradas y etiquetadas como la promo', !/promo-mensaje[^>]*>[\s\S]*?<img/.test(HTML.slice(HTML.indexOf('data-title="Lo que no sale en las fotos"'), HTML.indexOf('data-title="Cinco años"'))) &&
  /<p class="eyebrow">Promo 26 Turismo<\/p>\s*<h2>Lo que no sale/.test(HTML));
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
check('visor de fotos con zoom: pellizco, doble toque, rueda, teclado y topes',
  /const ZOOM_MAX = 4/.test(HTML) &&
  /\.lightbox-figura \{[^}]*overflow: hidden;/.test(HTML) &&
  /\.lightbox\.zoomado \.lightbox-figura img \{ cursor: grab; \}/.test(HTML) &&
  /lightboxImg\.dataset\.zoom = escala\.toFixed\(2\)/.test(HTML) &&
  /lightboxImg\.style\.transform = escala > 1/.test(HTML) &&
  /function reiniciarZoom\(\)/.test(HTML) &&
  /function zoomEnPunto\(escala, cx, cy\)/.test(HTML) &&
  /addEventListener\('pointerdown'/.test(HTML) &&
  /addEventListener\('pointermove'/.test(HTML) &&
  /addEventListener\('pointerup', soltarPuntero\)/.test(HTML) &&
  /addEventListener\('wheel'/.test(HTML) &&
  /event\.key === '\+'/.test(HTML) &&
  /zoomEnPunto\(zoomFoto\.escala > 1 \? 1 : 2\.5, evento\.clientX, evento\.clientY\)/.test(HTML) &&
  /if \(zoomFoto\.escala > 1\) \{/.test(HTML) &&
  /moverFotoLightbox\(dx < 0 \? 1 : -1\)/.test(HTML) &&
  /reiniciarZoom\(\);\n  const varias/.test(HTML));
check('el visor solo anima opacity 150 ms y pasa fotos de la misma diapositiva',
  /transition: opacity \.15s ease/.test(HTML) &&
  /const slide = foto\.closest\('\.slide'\)/.test(HTML) &&
  /fotoLightbox = \(fotoLightbox \+ delta \+ fotosLightbox\.length\) % fotosLightbox\.length/.test(HTML) &&
  /moverFotoLightbox\(dx < 0 \? 1 : -1\)/.test(HTML));
check('modo presentacion: 8 s por diapositiva y tiempo proporcional (8 a 18 s) en las de texto',
  /id="autoplay"[^>]*aria-pressed="false"/.test(HTML) &&
  /const AUTOPLAY_MS = 8000/.test(HTML) &&
  /const AUTOPLAY_MS_MAX = 18000/.test(HTML) &&
  /function duracionAutoplay\(\)/.test(HTML) &&
  /promo-mensaje'\)\) return AUTOPLAY_MS/.test(HTML) &&
  /empezarBarraAutoplay\(ms\)/.test(HTML) &&
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
check('musica: mezcla de canciones propia, sin precarga, con lista y boton oculto hasta confirmar el archivo',
  /<audio id="musica-audio" src="assets\/audio\/promo\.mp3(?:\?v=\d+)?" preload="none"/.test(HTML) &&
  /const MUSICA_PISTAS = \[/.test(HTML) &&
  /addEventListener\('ended'/.test(HTML) &&
  /ponerPista\(musicaPista \+ 1\)/.test(HTML) &&
  /ponerPista\(0\)/.test(HTML) &&
  !/<audio[^>]*autoplay/.test(HTML) &&
  !/id="palabras-audio"/.test(HTML) &&
  !/palabras\.mp3/.test(HTML) &&
  /id="musica"[^>]*aria-pressed="false"[^>]*title="Activar la música" hidden/.test(HTML) &&
  /method: 'HEAD'/.test(HTML) &&
  /esperarServiceWorker\(\)/.test(HTML) &&
  /respuesta\.status !== 200/.test(HTML) &&
  /musicaBtn\.hidden = false/.test(HTML) &&
  /\.catch\(\(\) => \{ \/\* sin archivo o sin red/.test(HTML));
check('musica: arranca en Palabras y sigue hasta el final, con volumen 0,4 y fades de 600 ms',
  /const MUSICA_VOLUMEN = 0\.4/.test(HTML) &&
  /const MUSICA_FADE_MS = 600/.test(HTML) &&
  /const i = slides\.findIndex\(\(s\) => s\.dataset\.title === 'Palabras para la promo'\);\n  return i < 0 \? slides\.length : i;/.test(HTML) &&
  /if \(n >= MUSICA_DESDE\) \{\n    reintentarMusica\(\);/.test(HTML) &&
  /function reintentarMusica\(\) \{\n  if \(sonandoMusica \|\| musicaBloqueada \|\| !musicaAudio \|\| !musicaDisponible\) return;\n  if \(current < MUSICA_DESDE\) return;\n  encenderMusica\(false\);/.test(HTML) &&
  /if \(sonandoMusica && !musicaManual\) \{\n      apagarMusica\(false\);/.test(HTML) &&
  /function precargarMusica\(\)/.test(HTML) &&
  /if \(n >= MUSICA_DESDE - 3\) precargarMusica\(\);/.test(HTML) &&
  /addEventListener\('click', alternarMusica\)/.test(HTML) &&
  /fadeMusica\(MUSICA_VOLUMEN, MUSICA_FADE_MS\)/.test(HTML) &&
  /if \(!musicaAudio\.paused\) musicaAudio\.pause\(\)/.test(HTML));
check('musica: el boton de Palabras controla la misma cancion y respeta el silencio manual',
  /id="palabras-musica"[^>]*aria-pressed="false"/.test(HTML) &&
  /if \(palabrasBtn\) palabrasBtn\.addEventListener\('click', alternarMusica\)/.test(HTML) &&
  /palabrasBtn\.textContent = sonandoMusica \? 'Pausar música' : '♪ Escuchar música'/.test(HTML) &&
  /let musicaManual = false;/.test(HTML) &&
  /let musicaBloqueada = false;/.test(HTML) &&
  /if \(manual\) \{ musicaManual = false; musicaBloqueada = true; \}/.test(HTML) &&
  !/localStorage\.getItem\('esi-musica'\)/.test(HTML));
const PRIMAR_MUSICA = (HTML.match(/function primarMusica\(evento\)[\s\S]*?\n\}/) || [''])[0];
check('musica: se prima en silencio con el gesto para sonar sola al deslizar hasta Palabras',
  /closest\('#musica, #palabras-musica'\)/.test(PRIMAR_MUSICA) &&
  /let musicaDisponible = true;/.test(HTML) &&
  /musicaAudio\.volume = 0;/.test(PRIMAR_MUSICA) &&
  /musicaAudio\.play\(\)/.test(PRIMAR_MUSICA) &&
  /musicaPrimadaTimer/.test(PRIMAR_MUSICA) &&
  /if \(current >= MUSICA_DESDE\) \{\n    encenderMusica\(false\);/.test(PRIMAR_MUSICA) &&
  /const MUSICA_PRIMADA_MS = 4000/.test(HTML) &&
  /addEventListener\('touchstart', primarMusica, \{ passive: true, capture: true \}\)/.test(HTML) &&
  /addEventListener\('pointerdown', primarMusica, \{ passive: true, capture: true \}\)/.test(HTML) &&
  /addEventListener\('touchend', primarMusica, \{ passive: true, capture: true \}\)/.test(HTML) &&
  /addEventListener\('pointerup', primarMusica, \{ passive: true, capture: true \}\)/.test(HTML) &&
  /addEventListener\('keydown', primarMusica, true\)/.test(HTML) &&
  /addEventListener\('keyup', primarMusica, true\)/.test(HTML));
check('musica: la mezcla existe, pesa menos de 7 MB y no viaja en el precache',
  fs.existsSync(path.join(__dirname, '..', 'docs', 'assets', 'audio', 'promo.mp3')) &&
  fs.statSync(path.join(__dirname, '..', 'docs', 'assets', 'audio', 'promo.mp3')).size < 7340032 &&
  !/assets\/audio\/promo\.mp3/.test(PRECACHE));
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
  /menos asistencias/.test(HTML) && !/En la segunda aparecieron más ausencias/.test(HTML));
check('el 85% se explica sobre las reservas marcadas',
  /Entre las reservas que sí se registraron, el 85%/.test(HTML));
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

check('contador inicial 01 / 28', /01 \/ 28</.test(HTML));
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
