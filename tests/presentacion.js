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

const checks = [];
function check(name, ok, detail) {
  checks.push({ name: name, ok: !!ok, detail: detail || '' });
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
check('ninguna foto va lazy: todo el DOM desde el arranque', !/loading="lazy"/.test(HTML) && (HTML.match(/decoding="async"/g) || []).length === 14);
check('las fotos van en webp con srcset 800w/1280w', (HTML.match(/ src="assets\/promo\/[a-z0-9-]+\.webp[?]v=(2|3)"/g) || []).length === 14 && (HTML.match(/-800\.webp[?]v=(2|3) 800w, assets\/promo\//g) || []).length === 14 && (HTML.match(/\.webp[?]v=(2|3) 1280w"/g) || []).length === 14 && !/assets\/promo\/[a-z0-9-]+\.jpg/.test(HTML));
check('la foto horizontal del aula va con version 3', /aula-pizarron\.webp[?]v=3/.test(HTML) && /aula-pizarron-800\.webp[?]v=3/.test(HTML) && /aula-pizarron\.webp[?]v=3 1280w/.test(HTML) && /width="1280" height="720" decoding="async" style="--pos: 50% 55%"/.test(HTML));
check('pantalla de carga con techo de 2,5 s', /id="carga"/.test(HTML) && /2500/.test(HTML) && /carga-listo/.test(HTML));
check('fetchpriority solo en el logo del loader, el header y la primera foto', (HTML.match(/fetchpriority="high"/g) || []).length === 3 && /fetchpriority="high"[^>]*src="assets\/promo\/bandera-humo\.webp[?]v=2"/.test(HTML));
check('sizes por grupo de galeria', (HTML.match(/sizes="\(max-width: 768px\) 88vw, 532px"/g) || []).length === 8 && (HTML.match(/sizes="\(max-width: 768px\) 88vw, 349px"/g) || []).length === 3 && (HTML.match(/sizes="\(max-width: 768px\) 88vw, 880px"/g) || []).length === 1 && (HTML.match(/sizes="\(max-width: 768px\) 88vw, 1080px"/g) || []).length === 2);
check('logos en webp y sin png/jpg grandes', /assets\/logo-iss-round\.webp/.test(HTML) && /assets\/logo-aes-round\.webp/.test(HTML) && !/logo-iss-round\.png/.test(HTML) && !/logo-aes-round\.png/.test(HTML));
check('logo del header con fetchpriority high', /class="brand-logo"[^>]*fetchpriority="high"/.test(HTML));

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
