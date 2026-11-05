'use strict';

/*
 * Medición de rendimiento de la presentación (CI).
 *
 * - Viewport de celular 390x844 con DPR 2 (igual que presentacion-scroll.js).
 * - Carga inicial: LCP, CLS, frames largos, bytes transferidos, pedidos y
 *   cuántas imágenes (y cuántos kB) se descargan al tocar fondo.
 * - Recorrido de las 23 diapositivas: imágenes incompletas al llegar.
 * - Segunda pasada con Fast 3G emulado (1,6 Mbps / 150 ms de RTT): la
 *   diapositiva en pantalla no puede quedar con fotos sin terminar.
 *
 *   node tests/presentacion-perf.js
 *
 * Salida: una línea "PERF {...}" para comparar antes y después.
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
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
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
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function main() {
  server = await serve();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');

  // Registro de transferencia: requestId -> { url, resourceType, bytes }
  const inFlight = new Map();
  const xfer = { bytes: 0, images: 0, imageBytes: 0, requests: 0, done: new Map() };
  cdp.on('Network.requestWillBeSent', (e) => {
    if (inFlight.has(e.requestId)) return;
    inFlight.set(e.requestId, { url: e.request.url });
  });
  cdp.on('Network.responseReceived', (e) => {
    const id = e.requestId;
    if (!inFlight.has(id)) return;
    inFlight.get(id).type = e.type;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const id = e.requestId;
    if (!inFlight.has(id)) return;
    const entry = inFlight.get(id);
    inFlight.delete(id);
    const bytes = e.encodedDataLength || 0;
    xfer.bytes += bytes;
    xfer.requests += 1;
    if (entry.type === 'Image') {
      xfer.images += 1;
      xfer.imageBytes += bytes;
    }
    xfer.done.set(id, entry);
  });
  cdp.on('Network.loadingFailed', (e) => inFlight.delete(e.requestId));

  // Métricas del renderer: LCP y CLS con PerformanceObserver
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, longTasks: 0 };
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.startTime > window.__perf.lcp) window.__perf.lcp = e.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) { /* sin soporte */ }
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (!e.hadRecentInput) window.__perf.cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_) { /* sin soporte */ }
    try {
      new PerformanceObserver((l) => {
        window.__perf.longTasks += l.getEntries().length;
        window.__perf.longTaskMax = Math.max.call(
          null, window.__perf.longTaskMax || 0,
          ...l.getEntries().map((e) => e.duration)
        );
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) { /* sin soporte */ }
  });

  await page.goto(url, { waitUntil: 'load' });
  // Meta de LCP: se sigue esperando hasta que el último candidato no cambie
  await page.waitForTimeout(2500);

  const atLoad = { ...JSON.parse(JSON.stringify(await page.evaluate(() => window.__perf))) };
  const imgsLoad = await page.evaluate(() =>
    Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length
  );
  const loadSnapshot = { ...xfer };
  const pendingAtLoad = inFlight.size;

  const gotoSlide = async (index) => {
    await page.evaluate((n) => {
      const s = document.querySelectorAll('.slide')[n];
      if (s) s.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, index);
    await page.waitForTimeout(650);
  };

  // Recorrido completo 4G: nada puede quedar con imágenes sin terminar
  const slides = await page.evaluate(() => document.querySelectorAll('.slide').length);
  const incompletas = [];
  for (let i = 0; i < slides; i += 1) {
    await gotoSlide(i);
    const bad = await page.evaluate((n) => {
      const s = document.querySelectorAll('.slide')[n];
      return Array.from(s.querySelectorAll('img'))
        .filter((im) => !(im.complete && im.naturalWidth > 0))
        .map((im) => im.getAttribute('src'));
    }, i);
    if (bad.length) incompletas.push(`slide ${i + 1}: ${bad.join(', ')}`);
  }
  const fullSnapshot = { ...xfer };
  const post = await page.evaluate(() => JSON.parse(JSON.stringify(window.__perf)));

  // === Medición de la entrada: tiempo desde que la diapositiva asoma por el
  // borde inferior hasta que su primer texto supera opacity .5. Se re-carga la
  // página (estado inicial limpio) y se recorre con rAF a ~720 px/s. La
  // segunda pasada desactiva la animacion con un estilo inyectado para aislar
  // la latencia del disparo del observer. ===
  const SIN_ANIM = '.js .slide:not(.settled) :is('
    + ' .wrap > *:not(.mini-grid):not(.kpi-grid):not(.lesson-grid):not(.thanks-grid):not(.timeline):not(.slot-grid):not(.chart-grid):not(.split):not(.effort-grid):not(.promo-frames)'
    + ', .split > div > *, .chart-grid > div > *, .effort-grid > *'
    + ', .mini-grid > *, .kpi-grid > *, .lesson-grid > *'
    + ', .timeline > *, .slot-grid > *, .promo-frames > *, .thanks-card'
    + ') { filter: none !important; transform: none !important; transition: none !important; }';
  const SIN_SNAP = 'html { scroll-snap-type: none !important; }';
  const medirEntrada = () => page.evaluate(() => (async () => {
    const lista = Array.prototype.slice.call(document.querySelectorAll('section.slide'));
    const textoDe = (s) => s.querySelector('h2, h1, .lead, .eyebrow, .kpi, p');
    const filas = [];
    const y = () => (window.scrollY || document.documentElement.scrollTop || 0);
    for (let i = 1; i < lista.length; i += 1) {
      const slide = lista[i];
      const txt = textoDe(slide);
      if (!txt) { continue; }
      const top = slide.getBoundingClientRect().top + y();
      window.scrollTo(0, Math.max(0, top - window.innerHeight - 2));
      await new Promise((r) => setTimeout(r, 500));
      const ms = await new Promise((ok2) => {
        let entro = false;
        let tEnter = 0;
        const t0 = performance.now();
        const paso = () => {
          window.scrollBy(0, 12);
          if (!entro && slide.getBoundingClientRect().top < window.innerHeight) { entro = true; tEnter = performance.now(); }
          if (entro && parseFloat(getComputedStyle(txt).opacity) > 0.5) {
            ok2(performance.now() - tEnter);
            return;
          }
          if (performance.now() - t0 > 4000) {
            ok2(entro ? performance.now() - tEnter : -1);
            return;
          }
          requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      });
      filas.push({
        n: i + 1,
        ms: Math.max(0, Math.round(ms)),
        inView: slide.classList.contains('in-view'),
        settled: slide.classList.contains('settled')
      });
    }
    const arr = filas.map((f) => f.ms).sort((a, b) => a - b);
    return { mediana: arr[Math.floor(arr.length / 2)], peor: arr[arr.length - 1], filas };
  })(), undefined);

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: SIN_SNAP });
  const entradaAnim = await medirEntrada();
  await page.addStyleTag({ content: SIN_ANIM });
  await page.waitForTimeout(400);
  const entradaSin = await medirEntrada();
  console.log('ENTRADA ' + JSON.stringify({ con_anim: entradaAnim, sin_anim: entradaSin }));

  if (incompletas.length) {
    console.error('FALLA: imágenes incompletas a velocidad normal');
    console.error(incompletas.join('\n'));
  }

  // Pasada con Fast 3G: recarga y recorrida otra vez
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1.6 * 125000,
    uploadThroughput: 0.75 * 125000
  });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForTimeout(6000); // carga completa con red chata

  const inc3G = [];
  let peorEspera3G = 0;
  const getIncompletas = (n) => page.evaluate((i) => {
    const s = document.querySelectorAll('.slide')[i];
    return Array.from(s.querySelectorAll('img'))
      .filter((im) => !(im.complete && im.naturalWidth > 0))
      .map((im) => im.getAttribute('src'));
  }, n);
  for (let i = 0; i < slides; i += 1) {
    await gotoSlide(i);
    const t0 = Date.now();
    let bad = await getIncompletas(i);
    while (bad.length && Date.now() - t0 < 4000) {
      await page.waitForTimeout(200);
      bad = await getIncompletas(i);
    }
    if (bad.length) inc3G.push(`slide ${i + 1}: ${bad.join(', ')}`);
    peorEspera3G = Math.max(peorEspera3G, Math.ceil((Date.now() - t0) / 100) * 100);
  }
  const total3G = { ...xfer };
  const post3G = await page.evaluate(() => JSON.parse(JSON.stringify(window.__perf)));

  const kb = (n) => Math.round(n / 1024);
  console.log('PERF ' + JSON.stringify({
    lcp_ms: Math.round(atLoad.lcp),
    cls: Number(atLoad.cls.toFixed(3)),
    long_tasks_carga: atLoad.longTasks,
    long_task_max_ms: Math.round(atLoad.longTaskMax || 0),
    kb_carga: kb(loadSnapshot.bytes),
    kb_imagenes_carga: kb(loadSnapshot.imageBytes),
    imgs_carga: imgsLoad,
    pedidos_carga: loadSnapshot.requests,
    pendientes_carga: pendingAtLoad,
    kb_total: kb(fullSnapshot.bytes),
    kb_imagenes_total: kb(fullSnapshot.imageBytes),
    imgs_total: fullSnapshot.images,
    pedidos_total: fullSnapshot.requests,
    cls_recorrido: Number((post.cls - atLoad.cls).toFixed(3)),
    g3_kb_total: kb(total3G.bytes),
    g3_kb_imagenes: kb(total3G.imageBytes),
    g3_imgs_total: total3G.images,
    g3_cls: Number(post3G.cls.toFixed(3)),
    incompletas_recorrido: incompletas.length,
    incompletas_3G: inc3G.length,
    g3_peor_espera_ms: peorEspera3G,
    entrada_mediana_ms: entradaAnim.mediana,
    entrada_peor_ms: entradaAnim.peor,
    trigger_mediana_ms: entradaSin.mediana,
    trigger_peor_ms: entradaSin.peor
  }));

  if (inc3G.length) {
    console.error('FALLA 3G: fotos que siguen sin terminar despues de 4 s al llegar');
    console.error(inc3G.join('\n'));
  }
  if (peorEspera3G > 3500) {
    console.error(`FALLA 3G: peor espera al llegar una foto ${peorEspera3G} ms (> 3500)`);
  }

  await browser.close();
  server.close();

  const clean = incompletas.length === 0 && inc3G.length === 0 && peorEspera3G <= 3500;
  process.exit(clean ? 0 : 1);
}

let server;
main().catch((err) => {
  console.error('FALLA del propio test:', err && err.message ? err.message : err);
  if (server) server.close();
  process.exit(1);
});
