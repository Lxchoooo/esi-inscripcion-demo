'use strict';

/*
 * Verificación real de la presentación en Chromium (CI).
 *
 * - Viewport de celular 390x844 con touch emulado.
 * - Recorre las 16 diapositivas y comprueba que todas son alcanzables,
 *   que no se superponen y que los contadores y gráficos terminan de animarse.
 * - Mide frames largos durante el scroll (touch, rueda y teclado).
 *
 *   node tests/presentacion-scroll.js
 *
 * Requiere Playwright y su Chromium (se instalan en el workflow).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'docs');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(String(req.url || '/').split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log((ok ? 'ok    ' : 'FALLA ') + name + (detail === undefined ? '' : ' · ' + detail));
}

async function rects(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('section.slide')).map((slide) => {
    const r = slide.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  }));
}

async function main() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  await page.addInitScript(() => {
    window.__long = { task: [], frame: [] };
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => window.__long.task.push(Math.round(e.duration)));
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) { /* sin soporte */ }
    try {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((e) => window.__long.frame.push(Math.round(e.duration)));
      }).observe({ entryTypes: ['long-animation-frame'] });
    } catch (e) { /* sin soporte */ }
  });

  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await page.waitForTimeout(900);

  // 1. Estructura y navegación nativa.
  const total = await page.locator('section.slide').count();
  check('16 diapositivas en el documento', total === 16, total + ' encontradas');

  const snapAlign = await page.evaluate(() => {
    const slide = document.querySelector('section.slide');
    return getComputedStyle(slide).scrollSnapAlign;
  });
  check('scroll-snap-align start en las diapositivas', snapAlign === 'start', snapAlign);

  const snapType = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
  check('scroll-snap en el documento', /y/.test(snapType), snapType);

  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight * 10);
  check('el documento scrollea de forma nativa', scrollable);

  // 2. Todas las diapositivas alcanzables y reveladas.
  const unreachable = [];
  const notRevealed = [];
  for (let i = 0; i < 16; i += 1) {
    await page.evaluate((index) => {
      document.querySelectorAll('section.slide')[index].scrollIntoView({ block: 'start' });
    }, i);
    await page.waitForTimeout(220);
    const state = await page.evaluate((index) => {
      const slide = document.querySelectorAll('section.slide')[index];
      const top = Math.round(slide.getBoundingClientRect().top);
      return { top: top, inView: slide.classList.contains('in-view') };
    }, i);
    if (Math.abs(state.top) > 2) unreachable.push(i + 1 + ' (top ' + state.top + ')');
    if (!state.inView) notRevealed.push(i + 1);
  }
  check('todas las diapositivas llegan al tope', unreachable.length === 0, unreachable.join(', ') || '16/16');
  check('todas las diapositivas se revelan', notRevealed.length === 0, notRevealed.join(', ') || '16/16');

  // 3. Sin superposición entre diapositivas.
  const boxes = await rects(page);
  const overlaps = [];
  for (let i = 1; i < boxes.length; i += 1) {
    if (boxes[i].top < boxes[i - 1].bottom - 1) {
      overlaps.push((i + 1) + ' (top ' + boxes[i].top + ' < ' + boxes[i - 1].bottom + ')');
    }
  }
  check('las diapositivas no se superponen', overlaps.length === 0, overlaps.join(', ') || 'ok');

  // 4. Contadores y gráficos terminan de animarse.
  await page.evaluate(() => {
    document.querySelectorAll('section.slide')[3].scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(1500);
  const counters = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section.slide')[3].querySelectorAll('[data-count]')).map((el) => el.textContent.trim())
  );
  check('los contadores llegan al valor final',
    counters.join('|') === '393|1.173|30|90,9%', counters.join(' | '));

  const charts = await page.evaluate(() => {
    const matrix = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const slide = (index) => document.querySelectorAll('section.slide')[index];
    const bar = matrix(slide(6).querySelector('.bar-fill'));
    const course = matrix(slide(7).querySelector('.course-bar'));
    const stack = matrix(slide(8).querySelector('.stack .seg'));
    return {
      bar: bar.a,
      course: course.d,
      stack: stack.a,
      donut: getComputedStyle(slide(4).querySelector('.donut .seg')).strokeDasharray
    };
  });
  check('barras de temas animadas', charts.bar > 0.2, 'scaleX ' + charts.bar.toFixed(2));
  check('columnas de cursos animadas', charts.course > 0.2, 'scaleY ' + charts.course.toFixed(2));
  check('franjas animadas', charts.stack > 0.5, 'scaleX ' + charts.stack.toFixed(2));
  check('donas dibujadas', !/^0px[, ]+999px$/.test(charts.donut.trim()), charts.donut);

  // 5. Fluidez: frames largos durante scroll touch, rueda y teclado.
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => { window.scrollTo(0, 0); window.__long = { task: [], frame: [] }; });
  await page.waitForTimeout(300);

  for (let i = 0; i < 18; i += 1) {
    await cdp.send('Input.synthesizeScrollGesture', {
      x: 195, y: 500, xDistance: 0, yDistance: -620, speed: 1400, gestureSourceType: 'touch'
    });
    await page.waitForTimeout(90);
  }
  const afterTouch = await page.evaluate(() => window.scrollY);
  check('el gesto touch scrollea el documento', afterTouch > 500, 'scrollY ' + afterTouch);

  for (let i = 0; i < 20; i += 1) {
    try {
      await page.mouse.wheel(0, -700);
    } catch (e) {
      console.log('rueda no disponible en este entorno: ' + e.message);
      break;
    }
    await page.waitForTimeout(60);
  }
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  await page.keyboard.press('Home');
  await page.waitForTimeout(600);

  const perf = await page.evaluate(() => ({
    task: window.__long.task,
    frame: window.__long.frame,
    scrollY: window.scrollY
  }));
  const maxTask = perf.task.length ? Math.max.apply(null, perf.task) : 0;
  const overTask = perf.task.filter((d) => d > 50);
  const maxFrame = perf.frame.length ? Math.max.apply(null, perf.frame) : 0;
  const overFrame = perf.frame.filter((d) => d > 50);

  console.log('\nlongtask: ' + perf.task.length + ' (max ' + maxTask + ' ms, >50 ms: ' + overTask.length + ')');
  console.log('long-animation-frame: ' + perf.frame.length + ' (max ' + maxFrame + ' ms, >50 ms: ' + overFrame.length + ')');

  check('sin tareas largas (>50 ms) durante el scroll', overTask.length === 0, overTask.join(', ') + ' ms');
  // LoAF se informa siempre; en runners sin GPU puede haber frames lentos por
  // software rendering, así que solo falla si es claramente patológico.
  check('sin frames patológicos (>120 ms) durante el scroll', maxFrame <= 120, 'max ' + maxFrame + ' ms');
  check('sin errores de página', pageErrors.length === 0, pageErrors.join(' | '));

  const failed = results.filter((r) => !r.ok);
  const summary = [
    '## Presentación ESI · scroll real',
    '',
    '| chequeo | resultado |',
    '| --- | --- |'
  ].concat(results.map((r) => '| ' + r.name + ' | ' + (r.ok ? 'ok' : 'FALLA: ' + r.detail) + ' |'))
    .concat([
      '',
      '- longtask: ' + perf.task.length + ' (max ' + maxTask + ' ms)',
      '- long-animation-frame: ' + perf.frame.length + ' (max ' + maxFrame + ' ms)'
    ]);

  console.log('\n' + (results.length - failed.length) + ' ok, ' + failed.length + ' fallas');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
  }

  await browser.close();
  server.close();
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
