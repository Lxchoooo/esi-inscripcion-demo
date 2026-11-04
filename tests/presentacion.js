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
check('el revelado usa IntersectionObserver', /IntersectionObserver/.test(HTML));
check('cada diapositiva se revela una sola vez', /classList\.contains\(\s*['"]in-view['"]\s*\)/.test(HTML));
check('respeta prefers-reduced-motion', /prefers-reduced-motion/.test(HTML));

// Nada de trabajo pesado por frame.
check('sin backdrop-filter', !/backdrop-filter/.test(HTML));
check('sin animaciones infinitas de fondo', !/@keyframes aurora/.test(HTML) && !/@keyframes logo-drift/.test(HTML));
check('barras animan transform (no width)',
  /\.slide\.in-view \.bar-fill \{ transform: scaleX/.test(HTML) && !/\.bar-fill[^}]*transition: width/.test(HTML));
check('columnas animan transform (no height)',
  /\.slide\.in-view \.course-bar \{ transform: scaleY/.test(HTML) && !/\.course-bar[^}]*transition: height/.test(HTML));
check('stack anima transform (no width)', /\.slide\.in-view \.stack \.seg \{ transform: scaleX/.test(HTML));
check('la barra de progreso anima transform', /\.progress \{[^}]*transform: scaleX\(0\)/.test(HTML));
check('los graficos no animan layout',
  !/transition:\s*(width|height)\b/.test(HTML));

// Contenido.
check('16 diapositivas', (HTML.match(/<section class="slide/g) || []).length === 16);
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
