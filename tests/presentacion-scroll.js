'use strict';

/*
 * Verificación real de la presentación en Chromium (CI).
 *
 * - Viewport de celular 390x844 con touch emulado.
 * - Recorre las 29 diapositivas y comprueba que todas son alcanzables,
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
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg'
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(String(req.url || '/').split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
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

function observeLongTasks() {
  window.__long = { task: [], frame: [] };
  const push = (bucket) => (list) => {
    list.getEntries().forEach((e) => window.__long[bucket].push({
      d: Math.round(e.duration),
      t: Math.round(e.startTime)
    }));
  };
  try {
    new PerformanceObserver(push('task')).observe({ entryTypes: ['longtask'] });
  } catch (e) { /* sin soporte */ }
  try {
    new PerformanceObserver(push('frame')).observe({ entryTypes: ['long-animation-frame'] });
  } catch (e) { /* sin soporte */ }
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
  globalThis.__cleanup = async () => {
    try { await browser.close(); } catch (e) { /* noop */ }
    try { server.close(); } catch (e) { /* noop */ }
  };
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

  await page.addInitScript(observeLongTasks);

  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await page.waitForTimeout(900);

  // 1. Estructura y navegación nativa.
  const total = await page.locator('section.slide').count();
  check('29 diapositivas en el documento', total === 29, total + ' encontradas');
  const totalSlides = total;

  const snapAlign = await page.evaluate(() => {
    const slide = document.querySelector('section.slide');
    return getComputedStyle(slide).scrollSnapAlign;
  });
  check('scroll-snap-align start en las diapositivas', snapAlign === 'start', snapAlign);

  const snapType = await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType);
  check('scroll-snap en el documento', /y/.test(snapType), snapType);

  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight * 10);
  check('el documento scrollea de forma nativa', scrollable);

  const heights = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section.slide')).map((slide) => Math.round(slide.getBoundingClientRect().height))
  );
  const huge = heights.map((height, i) => ({ height: height, index: i + 1 })).filter((item) => item.height > 844 * 2);
  console.log('\naltos en 390x844: ' + heights.join(', '));
  check('ninguna diapositiva pasa de dos pantallas', huge.length === 0,
    huge.map((item) => '#' + item.index + '=' + item.height).join(', ') || 'max ' + Math.max.apply(null, heights) + ' px');

  const initial = await page.evaluate(() => {
    const slidesAll = document.querySelectorAll('section.slide');
    const slide = slidesAll[slidesAll.length - 1];
    const el = slide.querySelector('h2, h1, .lead, .eyebrow');
    const cs = getComputedStyle(el);
    return { filter: cs.filter, opacity: cs.opacity };
  });
  check('el contenido arranca visible en celu (sin ninguna clase de entrada)', initial.opacity === '1' && initial.filter === 'none',
    'opacity ' + initial.opacity + ', filter ' + initial.filter);

  // 2. Todas las diapositivas alcanzables y reveladas.
  await page.evaluate(() => { window.__scrollStart = performance.now(); });
  const unreachable = [];
  const notRevealed = [];
  for (let i = 0; i < totalSlides; i += 1) {
    await page.evaluate((index) => {
      document.querySelectorAll('section.slide')[index].scrollIntoView({ block: 'start' });
    }, i);
    await page.waitForTimeout(220);
    const state = await page.evaluate((index) => {
      const slide = document.querySelectorAll('section.slide')[index];
      const top = Math.round(slide.getBoundingClientRect().top);
      return { top: top, charts: slide.classList.contains('charts-in') };
    }, i);
    if (Math.abs(state.top) > 2) unreachable.push(i + 1 + ' (top ' + state.top + ')');
    if (!state.charts) notRevealed.push(i + 1);
  }
  check('todas las diapositivas llegan al tope', unreachable.length === 0, unreachable.join(', ') || totalSlides + '/' + totalSlides);
  check('todas las diapositivas disparan sus graficos y contadores', notRevealed.length === 0, notRevealed.join(', ') || totalSlides + '/' + totalSlides);

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
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('section.slide')[3].querySelectorAll('[data-count]'))
      .map((el) => el.textContent.trim()).join('|') === '393|1.173|30|90,9%',
    { timeout: 7000 });
  const counters = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section.slide')[3].querySelectorAll('[data-count]')).map((el) => el.textContent.trim())
  );
  check('los contadores llegan al valor final',
    counters.join('|') === '393|1.173|30|90,9%', counters.join(' | '));

  const settled = await page.evaluate(() => {
    const slide = document.querySelectorAll('section.slide')[3];
    const el = slide.querySelector('.kpi');
    const cs = getComputedStyle(el);
    return { filter: cs.filter, opacity: cs.opacity, will: el.style.willChange };
  });
  check('el contenido queda nítido y visible', settled.filter === 'none' && settled.opacity === '1',
    'opacity ' + settled.opacity + ', filter ' + settled.filter);
  check('sin will-change en el contenido', settled.will === '', settled.will || 'vacío');

  // Con el efecto repetido, cada gráfico se anima cuando su diapositiva entra:
  // primero se llega a ella y después se espera la animación.
  const chartScales = await (async () => {
    const out = {};
    // Lecturas defensivas y transparentes: se espera el TEXTO del transform
    // (sin DOMMatrix, que lanza con 'none') y el parseo es local.
    const num = (value) => (typeof value === 'number' && isFinite(value) ? value : -1);
    // Deterministico: el estado base ya es matrix(0,...), asi que se espera la
    // clase charts-in primero, y despues de la transicion se lee el valor final.
    const chartsIn = async (index) => {
      await page.waitForFunction((o) => {
        const slide = document.querySelectorAll('section.slide')[o.index];
        return slide && slide.classList.contains('charts-in');
      }, { index }, { timeout: 7000, polling: 120 });
      await page.waitForTimeout(800);
    };
    const scale = async (index, selector) => {
      await got(index);
      try {
        await chartsIn(index);
        const text = await page.evaluate((o) => {
          const slide = document.querySelectorAll('section.slide')[o.index];
          const el = slide && slide.querySelector(o.selector);
          return el ? getComputedStyle(el).transform : '';
        }, { index, selector });
        const m = /matrix\(([^)]+)\)/.exec(String(text || ''));
        if (!m) {
          return { sx: -1, sy: -1, err: 'transform=' + String(text).slice(0, 60) };
        }
        const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
        return { sx: num(parts[0]), sy: num(parts[3]), err: '' };
      } catch (err) {
        return { sx: -1, sy: -1, err: ('charts-in o timeout: ' + String((err && err.message) || err)).slice(0, 120) };
      }
    };
    const donutText = async (index) => {
      await got(index);
      try {
        await chartsIn(index);
        return String(await page.evaluate((o) => {
          const slide = document.querySelectorAll('section.slide')[o.index];
          const el = slide && slide.querySelector('.donut .seg');
          return el ? getComputedStyle(el).strokeDasharray : '';
        }, { index }) || '');
      } catch (err) {
        return '(charts-in o timeout: ' + String((err && err.message) || err) + ')';
      }
    };
    const got = (index) => page.evaluate((n) => {
      document.querySelectorAll('section.slide')[n].scrollIntoView({ block: 'start' });
    }, index);
    out.bar = await scale(6, '.bar-fill');
    out.course = await scale(7, '.course-bar');
    out.stack = await scale(8, '.stack .seg');
    out.donut = await donutText(4);
    return out;
  })();
  const fmt = (value) => (typeof value === 'number' ? value.toFixed(2) : String(value));
  const detail = (scale, label) =>
    label + ' ' + fmt(scale.sx) + (scale.err ? ' (' + scale.err + ')' : '');
  check('barras de temas animadas', chartScales.bar.sx > 0.2, detail(chartScales.bar, 'scaleX'));
  check('columnas de cursos animadas', chartScales.course.sy > 0.2, detail(chartScales.course, 'scaleY'));
  check('franjas animadas', chartScales.stack.sx > 0.5, detail(chartScales.stack, 'scaleX'));
  check('donas dibujadas', !/^0px[, ]+999px$/.test(chartScales.donut.trim()) && chartScales.donut !== '', chartScales.donut);

  // 4b. Una diapositiva larga se puede leer hasta el final (el snap no la traba).
  const longSlide = await page.evaluate(() => {
    const slides = Array.from(document.querySelectorAll('section.slide'));
    let best = 0;
    let max = 0;
    slides.forEach((slide, i) => {
      const height = slide.getBoundingClientRect().height;
      if (height > max) { max = height; best = i; }
    });
    return { index: best, height: Math.round(max) };
  });
  if (longSlide.height > 900) {
    await page.evaluate((index) => {
      document.querySelectorAll('section.slide')[index].scrollIntoView({ block: 'start' });
    }, longSlide.index);
    await page.waitForTimeout(350);
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => window.scrollY);
    check('una diapositiva larga se scrollea sin que el snap la devuelva',
      after - before >= 450, 'alto ' + longSlide.height + ' px, avance ' + (after - before) + ' px');

    await page.evaluate((data) => {
      window.scrollTo(0, data.start + data.height - window.innerHeight);
    }, { start: before, height: longSlide.height });
    await page.waitForTimeout(500);
    const end = await page.evaluate((index) => {
      const slide = document.querySelectorAll('section.slide')[index];
      const last = slide.lastElementChild || slide;
      const rect = last.getBoundingClientRect();
      return { bottom: Math.round(rect.bottom), viewport: window.innerHeight, scrollY: Math.round(window.scrollY) };
    }, longSlide.index);
    check('el final de la diapositiva larga es alcanzable',
      end.bottom <= end.viewport + 2, 'bottom ' + end.bottom + ' / ' + end.viewport);
  } else {
    check('una diapositiva larga se scrollea sin que el snap la devuelva', true, 'sin diapositivas > 900 px');
    check('el final de la diapositiva larga es alcanzable', true, 'sin diapositivas > 900 px');
  }

  // 5. Flechas de presentación (sin tocar el scroll vertical nativo).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  const beforeArrow = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1000);
  const afterArrow = await page.evaluate(() => window.scrollY);
  check('la flecha derecha avanza una diapositiva', afterArrow - beforeArrow > 500,
    'scrollY ' + afterArrow);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1000);
  const backArrow = await page.evaluate(() => window.scrollY);
  check('la flecha izquierda vuelve a la anterior', Math.abs(backArrow - beforeArrow) < 24,
    'scrollY ' + backArrow);

  // 6. Fluidez: frames largos durante scroll touch, rueda y teclado.
  const cdp = await context.newCDPSession(page);
  // Se mide desde la carga, incluido todo el recorrido.
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.waitForTimeout(300);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function touchSwipe(fromY, toY) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: fromY }] });
    for (let step = 1; step <= 12; step += 1) {
      const y = Math.round(fromY + ((toY - fromY) * step) / 12);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y }] });
      await wait(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(150);
  }

  for (let i = 0; i < 20; i += 1) await touchSwipe(700, 120);
  let afterTouch = await page.evaluate(() => window.scrollY);
  let touchMethod = 'touch nativo';
  if (afterTouch < 500) {
    for (let i = 0; i < 18; i += 1) {
      await cdp.send('Input.synthesizeScrollGesture', {
        x: 195, y: 600, xDistance: 0, yDistance: -600, speed: 1400, gestureSourceType: 'touch'
      });
      await wait(120);
    }
    afterTouch = await page.evaluate(() => window.scrollY);
    touchMethod = 'gesto sintético touch';
  }
  check('el gesto touch scrollea el documento', afterTouch > 500, touchMethod + ', scrollY ' + afterTouch);

  // 5b. Escritorio: el contenido no se estira ni queda perdido en pantallas anchas.
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 }
  ];
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const layout = await p.evaluate(() => {
      const slide = document.querySelector('section.slide');
      const wrap = slide.querySelector('.wrap');
      const r = wrap.getBoundingClientRect();
      const h2 = document.querySelector('.slide h2') || document.querySelector('.slide h1');
      const kpi = document.querySelector('.kpi');
      const donut = document.querySelector('.donut');
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        wrapWidth: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(window.innerWidth - r.right),
        h2: Math.round(parseFloat(getComputedStyle(h2).fontSize)),
        kpi: kpi ? Math.round(kpi.getBoundingClientRect().width) : 0,
        donut: donut ? Math.round(donut.getBoundingClientRect().width) : 0
      };
    });
    const label = vp.width + 'x' + vp.height;
    check('sin desborde horizontal a ' + label, !layout.overflow, 'wrap ' + layout.wrapWidth + ' px');
    check('contenido centrado a ' + label, Math.abs(layout.left - layout.right) <= 2,
      'izq ' + layout.left + ' / der ' + layout.right);
    check('max-width razonable a ' + label, layout.wrapWidth <= 1200 && layout.wrapWidth >= 900,
      layout.wrapWidth + ' px');
    check('tipografia escala a ' + label, layout.h2 >= 60, layout.h2 + ' px');
    check('graficos y tarjetas en proporcion a ' + label,
      (!layout.kpi || layout.kpi >= 200) && (!layout.donut || layout.donut >= 300),
      'kpi ' + layout.kpi + ' px, dona ' + layout.donut + ' px');
    await ctx.close();
  }

  // 6. Rueda, touchpad y teclado en escritorio.
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const deskPage = await desktop.newPage();
  await deskPage.addInitScript(observeLongTasks);
  await deskPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await deskPage.waitForTimeout(800);
  await deskPage.evaluate(() => { window.__scrollStart = performance.now(); });
  const slideH = await deskPage.evaluate(() => Math.round(document.querySelector('section.slide').getBoundingClientRect().height));

  // Un gesto de rueda de 900 px debe caer en la diapositiva siguiente.
  await deskPage.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  for (let i = 0; i < 3; i += 1) {
    await deskPage.mouse.wheel(0, 300);
    await wait(20);
  }
  await wait(1200);
  const strongWheel = await deskPage.evaluate(() => window.scrollY);
  check('un gesto de rueda avanza una diapositiva',
    strongWheel > slideH * 0.5 && strongWheel < slideH * 1.6,
    'scrollY ' + strongWheel + ' con diapositiva de ' + slideH + ' px');

  // Touchpad: varios ticks cortos seguidos.
  await deskPage.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  for (let i = 0; i < 6; i += 1) {
    await deskPage.mouse.wheel(0, 120);
    await wait(50);
  }
  await wait(1000);
  const touchpad = await deskPage.evaluate(() => window.scrollY);
  check('el touchpad avanza una diapositiva',
    touchpad > slideH * 0.5 && touchpad < slideH * 1.6,
    'scrollY ' + touchpad + ' con diapositiva de ' + slideH + ' px');

  // Teclado: AvPág, espacio, flecha abajo, Fin e Inicio.
  await deskPage.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  await deskPage.keyboard.press('PageDown');
  await wait(900);
  const pageDown = await deskPage.evaluate(() => window.scrollY);
  check('AvPág avanza una diapositiva',
    pageDown > slideH * 0.5 && pageDown < slideH * 1.6,
    'scrollY ' + pageDown + ' con diapositiva de ' + slideH + ' px');

  await deskPage.keyboard.press('PageUp');
  await wait(900);
  const pageUp = await deskPage.evaluate(() => window.scrollY);
  check('RePág vuelve a la diapositiva anterior', pageUp <= 4, 'scrollY ' + pageUp);

  await deskPage.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  await deskPage.keyboard.press('Space');
  await wait(900);
  const spaceScroll = await deskPage.evaluate(() => window.scrollY);
  check('la barra espaciadora avanza una diapositiva',
    spaceScroll > slideH * 0.5 && spaceScroll < slideH * 1.6,
    'scrollY ' + spaceScroll + ' con diapositiva de ' + slideH + ' px');

  await deskPage.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  await deskPage.keyboard.press('ArrowDown');
  await wait(300);
  const arrowDown = await deskPage.evaluate(() => window.scrollY);
  check('la flecha abajo scrollea', arrowDown > 0, 'scrollY ' + arrowDown);

  await deskPage.keyboard.press('End');
  // El final importa, no el reloj: esperamos a que scrollY se estabilice
  // (3 lecturas iguales seguidas) con techo de 9 s, porque con más diapositivas
  // el scroll liso de End tarda más en llegar.
  const settledEnd = async () => {
    let last = -1, same = 0;
    const t0 = Date.now();
    while (same < 3 && Date.now() - t0 < 9000) {
      await wait(80);
      const y = await deskPage.evaluate(() => Math.round(window.scrollY));
      if (y === last) { same += 1; } else { same = 0; last = y; }
    }
    return last;
  };
  await settledEnd();
  const endPos = await deskPage.evaluate(() => {
    const slides = Array.prototype.slice.call(document.querySelectorAll('section.slide'));
    const last = slides[slides.length - 1];
    const y = Math.round(window.scrollY);
    const max = Math.round(document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, 1e9);
    const forced = Math.round(window.scrollY);
    window.scrollTo(0, y);
    return {
      y: y,
      forced: forced,
      last: Math.round(last.getBoundingClientRect().top + y),
      max: max,
      bodySH: Math.round(document.body.scrollHeight),
      docSH: Math.round(document.documentElement.scrollHeight),
      ih: window.innerHeight,
      tops: slides.slice(-4).map((s) => Math.round(s.getBoundingClientRect().top + y))
    };
  });
  check('el final del documento es alcanzable', endPos.forced >= endPos.max - 4,
    JSON.stringify(endPos));
  check('Fin llega al tramo final', endPos.y >= endPos.max - 2 * endPos.ih,
    JSON.stringify(endPos));

  await deskPage.keyboard.press('Home');
  // Igual que con Fin: el principio importa, no el reloj del constructor.
  let homeY = -1, iguales = 0;
  const t0H = Date.now();
  while (iguales < 3 && Date.now() - t0H < 2500) {
    await wait(80);
    const y = await deskPage.evaluate(() => Math.round(window.scrollY));
    if (y === homeY) { iguales += 1; } else { iguales = 0; homeY = y; }
  }
  const homePos = homeY;
  check('Inicio vuelve al principio', homePos <= 4, 'scrollY ' + homePos);

  // Rueda sostenida: recorre todo el documento.
  await deskPage.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  for (let i = 0; i < 20; i += 1) {
    await deskPage.mouse.wheel(0, 700);
    await wait(60);
  }
  const afterWheel = await deskPage.evaluate(() => window.scrollY);
  check('la rueda recorre el documento', afterWheel > 500, 'scrollY ' + afterWheel);

  const deskPerf = await deskPage.evaluate(() => ({ task: window.__long.task, frame: window.__long.frame, start: window.__scrollStart || 0 }));
  await desktop.close();

  // Recarga: siempre arranca en la primera diapositiva; el enlace #slide-N solo en visita nueva.
  const reloadCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const reloadPage = await reloadCtx.newPage();
  await reloadPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await reloadPage.waitForTimeout(500);
  await reloadPage.evaluate(() => window.scrollTo(0, 99999));
  await wait(800);
  await reloadPage.reload({ waitUntil: 'load' });
  await wait(500);
  const reloadPos = await reloadPage.evaluate(() => Math.round(window.scrollY));
  check('la recarga vuelve a la primera diapositiva', reloadPos <= 8, 'scrollY ' + reloadPos);

  const deepPage = await reloadCtx.newPage();
  await deepPage.goto('http://127.0.0.1:' + port + '/#slide-3', { waitUntil: 'load' });
  await wait(800);
  const deepPos = await deepPage.evaluate(() => ({
    y: Math.round(window.scrollY),
    top3: Math.round(document.querySelectorAll('section.slide')[2].getBoundingClientRect().top + window.scrollY)
  }));
  check('el enlace #slide-3 abre en esa diapositiva', Math.abs(deepPos.y - deepPos.top3) <= 4,
    'scrollY ' + deepPos.y + ', tope de la 3 ' + deepPos.top3);
  await reloadCtx.close();

  // Visor de fotos: abre la version de 1280, bloquea el scroll, pasa a la
  // siguiente foto de la misma diapositiva y vuelve al mismo lugar.
  const lbCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const lbPage = await lbCtx.newPage();
  await lbPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await lbPage.waitForFunction(() => document.documentElement.classList.contains('carga-listo'));
  await lbPage.evaluate(() => document.querySelector('section.slide.promo-foto').scrollIntoView({ block: 'start' }));
  await wait(600);
  const antesLightbox = await lbPage.evaluate(() => Math.round(window.scrollY));
  await lbPage.locator('section.slide.promo-foto img').first().click();
  await wait(250);
  await lbPage.waitForFunction(() => {
    const img = document.getElementById('lightbox-img');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 5000 }).catch(() => {});
  const abierto = await lbPage.evaluate(() => {
    const caja = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    return {
      visible: !caja.hidden,
      modal: caja.getAttribute('role') === 'dialog' && caja.getAttribute('aria-modal') === 'true',
      bloqueado: getComputedStyle(document.documentElement).overflow === 'hidden',
      foco: document.activeElement && document.activeElement.id,
      src: img.getAttribute('src') || '',
      natural: img.naturalWidth,
      siguienteVisible: !document.getElementById('lightbox-next').hidden
    };
  });
  check('la foto se abre en un dialogo con el scroll bloqueado',
    abierto.visible && abierto.modal && abierto.bloqueado && abierto.foco === 'lightbox-cerrar',
    JSON.stringify(abierto));
  check('el visor carga la version de 1280 px en el mismo formato y ofrece pasar de foto',
    /\.(avif|webp)\?v=\d+$/.test(abierto.src) && !/-800\./.test(abierto.src) && abierto.natural > 0 && abierto.siguienteVisible,
    abierto.src);
  const srcPrimera = abierto.src;

  // Zoom: pellizco de dos dedos (CDP), teclado, y vuelta al tamaño al pasar.
  const lbCdp = await lbCtx.newCDPSession(lbPage);
  await lbCdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 170, y: 430, id: 0 }, { x: 220, y: 430, id: 1 }]
  });
  await wait(80);
  for (let i = 1; i <= 6; i += 1) {
    await lbCdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 170 - i * 12, y: 430, id: 0 }, { x: 220 + i * 12, y: 430, id: 1 }]
    });
    await wait(30);
  }
  await lbCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(400);
  const conZoom = await lbPage.evaluate(() => {
    const img = document.getElementById('lightbox-img');
    return {
      escala: Number(img.dataset.zoom || 0),
      transform: img.style.transform,
      abierto: !document.getElementById('lightbox').hidden,
      src: img.getAttribute('src')
    };
  });
  check('el pellizco de dos dedos acerca la foto sin cerrarla ni cambiarla',
    conZoom.abierto && conZoom.escala > 1.4 && /scale\(/.test(conZoom.transform) && conZoom.src === srcPrimera,
    JSON.stringify(conZoom));
  await lbPage.keyboard.press('0');
  await wait(300);
  const sinZoom = await lbPage.evaluate(() => Number(document.getElementById('lightbox-img').dataset.zoom || 0));
  check('la tecla 0 vuelve la foto a su tamaño', sinZoom === 1, String(sinZoom));
  await lbPage.keyboard.press('+');
  await wait(300);
  const zoomTecla = await lbPage.evaluate(() => Number(document.getElementById('lightbox-img').dataset.zoom || 0));
  check('la tecla + acerca la foto', zoomTecla > 1.2, String(zoomTecla));

  await lbPage.locator('#lightbox-next').click();
  await wait(250);
  const srcSegunda = await lbPage.evaluate(() => document.getElementById('lightbox-img').getAttribute('src'));
  check('las flechas pasan a otra foto de la misma diapositiva', srcSegunda !== srcPrimera, srcSegunda);
  const zoomPasando = await lbPage.evaluate(() => Number(document.getElementById('lightbox-img').dataset.zoom || 0));
  check('al pasar de foto el zoom vuelve a 1', zoomPasando === 1, String(zoomPasando));
  await lbPage.keyboard.press('Escape');
  await wait(300);
  const cerrado = await lbPage.evaluate(() => ({
    oculto: document.getElementById('lightbox').hidden,
    y: Math.round(window.scrollY),
    overflow: getComputedStyle(document.documentElement).overflow,
    foco: document.activeElement && document.activeElement.tagName
  }));
  check('Escape cierra, vuelve la misma diapositiva y devuelve el foco',
    cerrado.oculto && Math.abs(cerrado.y - antesLightbox) <= 4 && cerrado.overflow !== 'hidden' && cerrado.foco === 'IMG',
    JSON.stringify(cerrado));
  await lbCtx.close();

  // Modo presentación: arranca solo con el botón, avanza a los 8 s y P pausa.
  const apCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const apPage = await apCtx.newPage();
  await apPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await apPage.waitForFunction(() => document.documentElement.classList.contains('carga-listo'));
  await wait(1200);
  if (!fs.existsSync(path.join(__dirname, '..', 'docs', 'assets', 'audio', 'promo.mp3'))) {
    const musicaOculta = await apPage.evaluate(() => document.getElementById('musica').hidden);
    check('sin archivo de audio el boton de musica no aparece', musicaOculta);
  } else {
    await apPage.waitForFunction(
      () => !document.getElementById('musica').hidden,
      null,
      { timeout: 20000 }
    ).catch(() => {});
    const musicaVisible = await apPage.evaluate(() => !document.getElementById('musica').hidden);
    check('con archivo de audio el boton de musica aparece', musicaVisible);
    if (musicaVisible) {
      await apPage.locator('#musica').click();
      await wait(700);
      const musicaOn = await apPage.evaluate(() => {
        const audio = document.getElementById('musica-audio');
        return {
          paused: audio.paused,
          volume: audio.volume,
          pressed: document.getElementById('musica').getAttribute('aria-pressed'),
          time: audio.currentTime
        };
      });
      check('la musica se reproduce con volumen 0,4',
        !musicaOn.paused && Math.abs(musicaOn.volume - 0.4) < 0.01 &&
        musicaOn.pressed === 'true' && musicaOn.time > 0, JSON.stringify(musicaOn));
      await apPage.locator('#musica').click();
      await wait(700);
      const musicaOff = await apPage.evaluate(() => ({
        paused: document.getElementById('musica-audio').paused,
        pressed: document.getElementById('musica').getAttribute('aria-pressed')
      }));
      check('el boton de musica vuelve a apagar y pausar',
        musicaOff.paused && musicaOff.pressed === 'false', JSON.stringify(musicaOff));
    }
  }
  await apPage.locator('#autoplay').click();
  await wait(300);
  const apOn = await apPage.evaluate(() => ({
    pressed: document.getElementById('autoplay').getAttribute('aria-pressed'),
    barra: !document.getElementById('autoplay-barra').hidden,
    activa: document.getElementById('autoplay-barra').classList.contains('activo')
  }));
  check('el boton de autoplay se marca activo con su barra',
    apOn.pressed === 'true' && apOn.barra && apOn.activa, JSON.stringify(apOn));
  await wait(8300);
  const apY = await apPage.evaluate(() => Math.round(window.scrollY));
  check('el autoplay avanza una diapositiva a los 8 s', apY > 400, 'scrollY ' + apY);
  await apPage.keyboard.press('p');
  await wait(200);
  const apPaused = await apPage.evaluate(() => ({
    pressed: document.getElementById('autoplay').getAttribute('aria-pressed'),
    barra: document.getElementById('autoplay-barra').hidden
  }));
  check('la tecla P pausa el autoplay', apPaused.pressed === 'false' && apPaused.barra,
    JSON.stringify(apPaused));
  await apPage.keyboard.press('p');
  await wait(200);
  const apResumed = await apPage.evaluate(() => document.getElementById('autoplay').getAttribute('aria-pressed'));
  check('la tecla P vuelve a activar el autoplay', apResumed === 'true', apResumed);
  await apPage.keyboard.press('p');

  // Service worker: instala, precachea y la pagina abre offline tras la primera visita.
  const swInfo = await apPage.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((ok) => {
        const timer = setTimeout(ok, 5000);
        navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); ok(); }, { once: true });
      });
    }
    const keys = await caches.keys();
    const nombre = keys.find((k) => k.indexOf('esi-') === 0) || '';
    const cache = nombre ? await caches.open(nombre) : null;
    const entradas = cache ? await cache.keys() : [];
    return {
      scope: reg.scope,
      nombre: nombre,
      entradas: entradas.length,
      audio: entradas.some((request) => request.url.indexOf('/assets/audio/promo.mp3') >= 0),
      controlada: !!navigator.serviceWorker.controller
    };
  });
  if (!swInfo.controlada) {
    await apPage.reload({ waitUntil: 'load' });
    await wait(500);
    swInfo.controlada = await apPage.evaluate(() => !!navigator.serviceWorker.controller);
  }
  check('el service worker instala y precachea las fotos y la música',
    swInfo.nombre === 'esi-v2' && swInfo.entradas >= 30 && swInfo.audio && swInfo.controlada,
    JSON.stringify(swInfo));
  await apCtx.setOffline(true);
  let offline = null;
  try {
    await apPage.reload({ waitUntil: 'domcontentloaded', timeout: 8000 });
    offline = await apPage.evaluate(() => ({
      slides: document.querySelectorAll('section.slide').length,
      titulo: document.querySelector('h1') ? document.querySelector('h1').textContent : ''
    }));
  } catch (e) {
    offline = { error: String(e).slice(0, 160) };
  }
  await apCtx.setOffline(false);
  check('la presentacion abre sin internet despues de la primera visita',
    offline && offline.slides === 29 && /no se detuvo/.test(offline.titulo || ''),
    JSON.stringify(offline));
  await apCtx.close();

  // La canción de la presentación arranca en "Palabras para la promo" y
  // sigue hasta el final; al volver más arriba se pausa, y el botón de la
  // diapositiva la silencia o la vuelve a poner.
  const palCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const palPage = await palCtx.newPage();
  const palErrors = [];
  palPage.on('pageerror', (err) => palErrors.push(String(err)));
  palPage.on('console', (msg) => { if (msg.type() === 'error') palErrors.push(msg.text()); });
  await palPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await palPage.waitForFunction(() => document.documentElement.classList.contains('carga-listo'));
  await wait(500);
  const palIndex = await palPage.evaluate(() => {
    const all = Array.from(document.querySelectorAll('section.slide'));
    return {
      gracias: all.findIndex((s) => s.dataset.title === 'Gracias') + 1,
      palabras: all.findIndex((s) => s.dataset.title === 'Palabras para la promo') + 1
    };
  });
  await palPage.waitForFunction(() => !document.getElementById('musica').hidden, null, { timeout: 20000 }).catch(() => {});
  await palPage.evaluate((n) => { location.hash = '#slide-' + n; }, palIndex.gracias);
  await wait(900);
  await palPage.locator('[data-go="Palabras para la promo"]').click();
  await wait(1600);
  const palOn = await palPage.evaluate(() => {
    const audio = document.getElementById('musica-audio');
    return {
      paused: audio.paused,
      volume: audio.volume,
      pressed: document.getElementById('palabras-musica').getAttribute('aria-pressed'),
      topbar: document.getElementById('musica').getAttribute('aria-pressed'),
      time: audio.currentTime
    };
  });
  check('al entrar a Palabras arranca la canción',
    !palOn.paused && Math.abs(palOn.volume - 0.4) < 0.03 &&
    palOn.pressed === 'true' && palOn.topbar === 'true' && palOn.time > 0,
    JSON.stringify(palOn));
  await palPage.locator('[data-go="Seis años, un solo nombre"]').click();
  await wait(1000);
  const palSigue = await palPage.evaluate(() => ({
    paused: document.getElementById('musica-audio').paused,
    pressed: document.getElementById('musica').getAttribute('aria-pressed')
  }));
  check('la canción sigue sonando en las diapositivas siguientes',
    !palSigue.paused && palSigue.pressed === 'true', JSON.stringify(palSigue));
  await palPage.evaluate((n) => { location.hash = '#slide-' + n; }, palIndex.gracias);
  await wait(1000);
  const palArriba = await palPage.evaluate(() => ({
    paused: document.getElementById('musica-audio').paused,
    pressed: document.getElementById('musica').getAttribute('aria-pressed')
  }));
  check('al volver más arriba de Palabras la canción se pausa',
    palArriba.paused && palArriba.pressed === 'false', JSON.stringify(palArriba));
  await palPage.locator('[data-go="Palabras para la promo"]').click();
  await wait(1600);
  const palVuelve = await palPage.evaluate(() => ({
    paused: document.getElementById('musica-audio').paused,
    pressed: document.getElementById('palabras-musica').getAttribute('aria-pressed')
  }));
  check('al volver a bajar a Palabras la canción arranca sola otra vez',
    !palVuelve.paused && palVuelve.pressed === 'true', JSON.stringify(palVuelve));
  await palPage.locator('#palabras-musica').click();
  await wait(900);
  const palOff = await palPage.evaluate(() => ({
    paused: document.getElementById('musica-audio').paused,
    pressed: document.getElementById('palabras-musica').getAttribute('aria-pressed')
  }));
  check('el botón de Palabras silencia la canción', palOff.paused && palOff.pressed === 'false',
    JSON.stringify(palOff));
  await palPage.locator('#palabras-musica').click();
  await wait(900);
  const palAgain = await palPage.evaluate(() => ({
    paused: document.getElementById('musica-audio').paused,
    pressed: document.getElementById('palabras-musica').getAttribute('aria-pressed')
  }));
  check('el botón de Palabras vuelve a reproducirla', !palAgain.paused && palAgain.pressed === 'true',
    JSON.stringify(palAgain));
  check('sin errores en la diapositiva de Palabras', palErrors.length === 0, palErrors.join(' | '));
  await palCtx.close();

  // Deslizando con el dedo (sin tocar ningún botón) la música también arranca.
  const swipeCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const swipePage = await swipeCtx.newPage();
  await swipePage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await swipePage.waitForFunction(() => document.documentElement.classList.contains('carga-listo'));
  await wait(500);
  await swipePage.waitForFunction(() => !document.getElementById('musica').hidden, null, { timeout: 20000 }).catch(() => {});
  await swipePage.evaluate((n) => { location.hash = '#slide-' + n; }, palIndex.gracias);
  await wait(900);
  const swipeCdp = await swipeCtx.newCDPSession(swipePage);
  for (let i = 0; i < 8; i += 1) {
    const at = await swipePage.evaluate(() => location.hash);
    if (at === '#slide-' + palIndex.palabras) break;
    await swipeCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 700 }] });
    for (let step = 1; step <= 10; step += 1) {
      await swipeCdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 700 - step * 38 }] });
      await wait(16);
    }
    await swipeCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(700);
  }
  await wait(1400);
  const swipePal = await swipePage.evaluate(() => ({
    hash: location.hash,
    paused: document.getElementById('musica-audio').paused,
    volume: document.getElementById('musica-audio').volume,
    pressed: document.getElementById('palabras-musica').getAttribute('aria-pressed')
  }));
  check('deslizando hasta Palabras la canción arranca sola',
    swipePal.hash === '#slide-' + palIndex.palabras && !swipePal.paused &&
    swipePal.volume > 0.3 && swipePal.pressed === 'true',
    JSON.stringify(swipePal));
  await swipeCtx.close();

  // Sin efecto de entrada: el contenido ya esta nítido apenas entra.
  const fadeInCtx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const fadePage = await fadeInCtx.newPage();
  await fadePage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  const filterOf = () => fadePage.evaluate(() => {
    const slide = document.querySelectorAll('section.slide')[1];
    const el = slide.querySelector('.wrap > *') || slide.querySelector('.wrap');
    return getComputedStyle(el).filter;
  });
  await fadePage.keyboard.press('PageDown');
  await wait(120);
  const midBlur = await filterOf();
  check('a mitad de entrada ya es nítido (sin estado oculto)', midBlur === 'none', midBlur);
  await wait(2600);
  const endBlur = await filterOf();
  check('el contenido queda nítido tras la entrada', endBlur === 'none', endBlur);

  // Reposo sin cruzar el 45%: la diapositiva igual se revela (red de seguridad).
  await fadePage.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.7)));
  await wait(500);
  const restState = await fadePage.evaluate(() => {
    const slide = document.querySelectorAll('section.slide')[1];
    const el = slide.querySelector('.wrap > *') || slide.querySelector('.wrap');
    const cs = getComputedStyle(el);
    return { filter: cs.filter, opacity: cs.opacity, cls: slide.className };
  });
  check('la diapositiva a media vista no queda oculta',
    restState.opacity === '1',
    JSON.stringify(restState));
  await wait(2600);
  const restEnd = await filterOf();
  check('la diapositiva a media vista termina nítida', restEnd === 'none', restEnd);

  // Repetido: al volver del final, la portada sigue con el contenido visible.
  await fadePage.keyboard.press('End');
  await wait(1200);
  await fadePage.keyboard.press('Home');
  await wait(320);
  const reBlur = await fadePage.evaluate(() => {
    const el = document.querySelector('section.slide .wrap').firstElementChild;
    return getComputedStyle(el).filter;
  });
  check('al volver atrás el contenido sigue visible', reBlur === 'none', reBlur);
  await wait(2600);
  const reEnd = await fadePage.evaluate(() => {
    const el = document.querySelector('section.slide .wrap').firstElementChild;
    return getComputedStyle(el).filter;
  });
  check('el repetido también termina nítido', reEnd === 'none', reEnd);
  await fadeInCtx.close();

  // Movimiento reducido: sin blur, sin desplazamiento y contenido visible.
  const rmContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const rmPage = await rmContext.newPage();
  await rmPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
  await rmPage.waitForTimeout(400);
  const reduced = await rmPage.evaluate(() => {
    const slide = document.querySelectorAll('section.slide')[0];
    const el = slide.querySelector('h2, h1, .lead, .eyebrow');
    const cs = getComputedStyle(el);
    return { filter: cs.filter, opacity: cs.opacity, transform: cs.transform };
  });
  check('movimiento reducido: sin blur, sin desplazamiento y visible',
    reduced.filter === 'none' && reduced.opacity === '1' && reduced.transform === 'none',
    'opacity ' + reduced.opacity + ', filter ' + reduced.filter + ', transform ' + reduced.transform);
  await rmContext.close();

  const mobilePerf = await page.evaluate(() => ({ task: window.__long.task, frame: window.__long.frame, start: window.__scrollStart || 0 }));
  const perf = {
    task: mobilePerf.task.concat(deskPerf.task),
    frame: mobilePerf.frame.concat(deskPerf.frame)
  };
  const durations = (list) => list.map((entry) => entry.d);
  const scrollTasks = mobilePerf.task.filter((entry) => entry.t >= mobilePerf.start)
    .concat(deskPerf.task.filter((entry) => entry.t >= deskPerf.start));
  const scrollFrames = mobilePerf.frame.filter((entry) => entry.t >= mobilePerf.start)
    .concat(deskPerf.frame.filter((entry) => entry.t >= deskPerf.start));
  const loadTasks = perf.task.filter((entry) => !scrollTasks.includes(entry));
  const maxTask = perf.task.length ? Math.max.apply(null, durations(perf.task)) : 0;
  const overTask = scrollTasks.filter((entry) => entry.d > 50);
  const maxFrame = perf.frame.length ? Math.max.apply(null, durations(perf.frame)) : 0;
  const overFrame = perf.frame.filter((entry) => entry.d > 50);

  console.log('\nlongtask: ' + perf.task.length + ' (max ' + maxTask + ' ms, >50 ms: ' + overTask.length + ')');
  console.log('longtask detalle: ' + JSON.stringify(perf.task));
  console.log('long-animation-frame: ' + perf.frame.length + ' (max ' + maxFrame + ' ms, >50 ms: ' + overFrame.length + ')');
  console.log('loaf detalle: ' + JSON.stringify(perf.frame));

  check('sin tareas largas (>50 ms) al pasar las diapositivas', overTask.length === 0,
    overTask.map((entry) => entry.d + ' ms @ ' + entry.t).join(', ') || '0');
  // LoAF se informa siempre; en runners sin GPU puede haber frames lentos por
  // software rendering, así que solo falla si es claramente patológico.
  check('sin frames patológicos (>120 ms) durante la carga y el scroll', maxFrame <= 120, 'max ' + maxFrame + ' ms');
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
      '- longtask al pasar diapositivas: ' + scrollTasks.length + ' (max ' +
        (scrollTasks.length ? Math.max.apply(null, durations(scrollTasks)) : 0) + ' ms)',
      '- longtask en carga: ' + loadTasks.length + ' (max ' +
        (loadTasks.length ? Math.max.apply(null, durations(loadTasks)) : 0) + ' ms)',
      '- long-animation-frame: ' + perf.frame.length + ' (max ' + maxFrame + ' ms)',
      '- altos 390x844: ' + heights.join(', ')
    ]);

  console.log('\n' + (results.length - failed.length) + ' ok, ' + failed.length + ' fallas');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
  }

  await browser.close();
  server.close();
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(async (err) => {
  console.error('ERROR inesperado: ' + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
  if (globalThis.__cleanup) {
    try { await globalThis.__cleanup(); } catch (e) { /* noop */ }
  }
  process.exit(1); // sin esto el Chromium y el servidor mantienen vivo el proceso
});
