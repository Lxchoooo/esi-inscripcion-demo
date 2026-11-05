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
check('cada diapositiva se revela una sola vez', /classList\.contains\(\s*['"]in-view['"]\s*\)/.test(HTML));
check('respeta prefers-reduced-motion', /prefers-reduced-motion/.test(HTML));

// Nada de trabajo pesado por frame.
check('sin backdrop-filter', !/backdrop-filter/.test(HTML));
check('sin animaciones infinitas de fondo', !/@keyframes aurora/.test(HTML) && !/@keyframes logo-drift/.test(HTML));
check('barras animan transform (no width)',
  /\.slide\.charts-in \.bar-fill \{ transform: scaleX/.test(HTML) && !/\.bar-fill[^}]*transition: width/.test(HTML));
check('columnas animan transform (no height)',
  /\.slide\.charts-in \.course-bar \{ transform: scaleY/.test(HTML) && !/\.course-bar[^}]*transition: height/.test(HTML));
check('stack anima transform (no width)', /\.slide\.charts-in \.stack \.seg \{ transform: scaleX/.test(HTML));
check('entrada con fade y blur marcado en el contenido', /filter:\s*blur\(14px\)/.test(HTML) && /filter:\s*none/.test(HTML));
check('blur movil a 8px', /filter:\s*blur\(8px\)/.test(HTML));
check('transicion anima filter 0,9s', /filter \.9s cubic/.test(HTML));
check('reset instantaneo al salir de pantalla', /\.js \.slide\.instant/.test(HTML));
check('disparo del efecto al 45 por ciento', /threshold:\s*\[0\.45\]/.test(HTML));
check('los graficos arrancan despues de la entrada', /charts-in/.test(HTML) && /classList\.add\(\s*['"]charts-in['"]\s*\)/.test(HTML));
check('la barra de progreso anima transform', /\.progress \{[^}]*transform: scaleX\(0\)/.test(HTML));
check('los graficos no animan layout',
  !/transition:\s*(width|height)\b/.test(HTML));

// Contenido.
check('23 diapositivas', (HTML.match(/<section class="slide/g) || []).length === 23);
check('7 diapositivas de fotos de la promo', (HTML.match(/class="slide promo-foto"/g) || []).length === 7);
check('14 fotos de la promo referenciadas', (HTML.match(/assets\/promo\//g) || []).length === 14);
check('las fotos cargan lazy y async', /assets\/promo\/bandera-humo\.jpg"[^>]*loading="lazy"[^>]*decoding="async"/.test(HTML));
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
