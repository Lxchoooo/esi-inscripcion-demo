'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('Usage: node ui-smoke.js <esi-panel-dir>');
  process.exit(2);
}
const html = fs.readFileSync(path.join(ROOT, 'Panel.html'), 'utf8');
const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

function makeEl(id) {
  const el = {
    id: id,
    innerHTML: '',
    textContent: '',
    value: '',
    className: '',
    hidden: false,
    disabled: false,
    style: {},
    children: [],
    attrs: {},
    classList: {
      add(c) { if (!el.className.split(' ').includes(c)) el.className = (el.className + ' ' + c).trim(); },
      remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
      toggle(c, on) { if (on === undefined ? !el.className.split(' ').includes(c) : on) el.classList.add(c); else el.classList.remove(c); },
      contains(c) { return el.className.split(' ').includes(c); }
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return el.attrs[k]; },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() { },
    focus() { },
    scrollIntoView() { },
    querySelector() { return null; }
  };
  let inner = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return inner; },
    set(v) { inner = String(v); if (inner === '') el.children.length = 0; }
  });
  return el;
}

const els = new Map();
const store = {
  esi_demo: '1',
  esi_demo_roster: JSON.stringify([
    { email: 'ana@esc.edu.ar', nombre: 'Ana Gomez', curso: '2°B' },
    { email: 'beto@esc.edu.ar', nombre: 'Beto Sanchez', curso: '5°Turismo' }
  ])
};
const document = {
  getElementById(id) {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  createElement() { return makeEl(null); },
  querySelectorAll(sel) {
    if (sel === '.admin-only') {
      return ['tab-inscriptos', 'tab-mails', 'btn-copiar-link', 'btn-csv']
        .map((id) => document.getElementById(id));
    }
    return [];
  },
  addEventListener() { },
  body: Object.assign(makeEl('body'), { classList: makeEl('body').classList }),
  visibilityState: 'visible'
};
const window = {
  location: { search: '' },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  setTimeout,
  clearTimeout,
  addEventListener() { },
  scrollY: 0,
  confirm: () => true,
  prompt() { },
  matchMedia: () => ({ matches: false })
};

const ui = new Function('window', 'document', src + `
return {
  sRender: sRender, sBuildTalk: sBuildTalk, sConfirmar: sConfirmar, sOnTalk: sOnTalk,
  aRender: aRender, aRenderTable: aRenderTable, aTab: aTab,
  sLookup: sLookup, sHelloYes: sHelloYes, sHelloNo: sHelloNo, sForgotMail: sForgotMail,
  aRenderTalk: aRenderTalk, aRenderPending: aRenderPending, aApplyRole: aApplyRole,
  aOnPresent: aOnPresent,
  setCred: function (v) { adminCred = v; },
  sState: sState, setA: function (v) { aData = v; },
  setTalk: function (v) { aTalkData = v; },
  setPending: function (v) { aPendingData = v; },
  setRole: function (r) { aRole = r; },
  DEMO_TALKS: DEMO_TALKS, DEMO_SLOTS: DEMO_SLOTS
};`)(window, document);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

ui.sState.student = { nombre: 'Ana', curso: '2°B', email: 'ana@esc.edu.ar', ciclo: 'basico' };
ui.sState.data = {
  evento_abierto: true,
  slots: [
    { id: 1, label: '10:30 a 11:20' },
    { id: 2, label: '11:30 a 12:20' },
    { id: 3, label: '12:30 a 13:30' }
  ],
  talks: [
    { id: 'B1', titulo: 'Ansiedad', slot_id: 1, lugar: 'Aula 5', cupo: 40, restantes: 40 },
    { id: 'B2', titulo: 'Alcohol', slot_id: 1, lugar: 'Aula 6', cupo: 40, restantes: 3 },
    { id: 'B3', titulo: 'Vapeo', slot_id: 1, lugar: 'Aula 7', cupo: 40, restantes: 0 },
    { id: 'B5', titulo: 'Autolesiones', slot_id: 2, lugar: 'Aula 7', cupo: 40, restantes: 12 },
    { id: 'B8', titulo: 'Juegos', slot_id: 3, lugar: 'Aula 9', cupo: 40, restantes: 9 }
  ],
  mine: { 1: 'B1' }
};
ui.sRender();

const slots = document.getElementById('slots-container');
assert(slots.children.length === 3, 'tres horarios');
const grid = slots.children[0].children[1];
assert(grid.className === 'slot-grid', 'grid de charlas');
assert(grid.children.length === 3, 'tres charlas en horario 1');
assert(grid.children[0].className.includes('selected'), 'primera elegida');
assert(grid.children[1].className.includes('low'), 'segunda con ultimos lugares');
assert(grid.children[2].className.includes('full'), 'tercera completa');
assert(grid.children[2].disabled === true, 'completa deshabilitada');
assert(grid.children[1].innerHTML.includes('Últimos 3'), 'texto ultimos lugares');
assert(grid.children[2].innerHTML.includes('Completa'), 'texto completa');
assert(grid.children[0].innerHTML.includes('Elegida'), 'texto elegida');
assert(grid.children[1].innerHTML.includes('is-low'), 'barra casi llena');
assert(grid.children[2].innerHTML.includes('is-full'), 'barra completa');
assert(document.getElementById('sel-count').textContent === '1 de 3 elegidas', 'contador');
assert(document.getElementById('summary').innerHTML.includes('Ana'), 'resumen identidad');
ui.sConfirmar();
assert(document.getElementById('sel-hint').hidden === false, 'aviso horario faltante visible');
assert(document.getElementById('sel-hint').textContent === 'Falta elegir el horario 2', 'texto horario faltante');
assert(slots.children[1].className.includes('is-missing'), 'horario 2 resaltado');
assert(slots.children[2].className.includes('is-missing'), 'horario 3 resaltado');
assert(!slots.children[0].className.includes('is-missing'), 'horario 1 completo');
assert(document.getElementById('sheet-title').textContent === '', 'no abre resumen incompleto');

const talk = { id: 'B5', titulo: 'Autolesiones', slot_id: 2, lugar: 'Aula 7', cupo: 40, restantes: 12 };
ui.sOnTalk(talk);
assert(document.getElementById('sheet-title').textContent === 'Elegir charla', 'sheet elegir');
assert(document.getElementById('sheet-body').innerHTML.includes('12 lugares'), 'sheet lugares');

ui.sState.data.mine = { 1: 'B1', 2: 'B5', 3: 'B8' };
ui.sRender();
ui.sConfirmar();
assert(document.getElementById('sheet-title').textContent === 'Tus charlas', 'sheet confirmar completo');
assert(document.getElementById('sheet-body').innerHTML.includes('Autolesiones'), 'resumen charlas');
assert(document.getElementById('sel-hint').hidden === true, 'sin aviso al completar');

ui.setA({
  total: 2,
  porCiclo: { basico: 1, orientado: 1 },
  evento_abierto: true,
  rosterLoaded: false,
  rosterCount: 0,
  slots: [{ id: 1, label: '10:30 a 11:20' }, { id: 2, label: '11:30 a 12:20' }],
  talks: [
    { id: 'B1', titulo: 'Ansiedad', ciclo: 'basico', slot_id: 1, cupo: 40, activa: true, anotados: 1 },
    { id: 'O1', titulo: 'Ansiedad', ciclo: 'orientado', slot_id: 1, cupo: 40, activa: true, anotados: 1 }
  ],
  signups: [
    { id: 's1', cuando: '20/10 10:00', email: 'ana@esc.edu.ar', nombre: 'Ana', curso: '2°B', ciclo: 'basico', slotLabel: '10:30 a 11:20', talkTitulo: 'Ansiedad' },
    { id: 's2', cuando: '20/10 10:05', email: 'beto@esc.edu.ar', nombre: 'Beto', curso: '5°Turismo', ciclo: 'orientado', slotLabel: '10:30 a 11:20', talkTitulo: 'Ansiedad' }
  ]
});
ui.aRender();
const totals = document.getElementById('a-totals');
assert(totals.innerHTML.includes('Inscriptos'), 'stat inscriptos');
assert(totals.innerHTML.includes('Abierta'), 'estado abierta');
assert(document.getElementById('a-roster-info').textContent === 'Sin lista cargada', 'roster sin cargar');
assert(document.getElementById('a-cupos').innerHTML.includes('Cupos por charla'), 'cupos titulo');
assert(document.getElementById('a-table').innerHTML.includes('Ana'), 'tabla con inscriptos');
assert(document.getElementById('filter-curso').innerHTML.includes('2°B'), 'filtro curso');
assert(document.getElementById('filter-division').innerHTML.includes('Turismo'), 'filtro division');

document.getElementById('filter-division').value = 'B';
ui.aRenderTable();
assert(document.getElementById('a-table').innerHTML.includes('Ana'), 'filtro division incluye');
assert(!document.getElementById('a-table').innerHTML.includes('Beto'), 'filtro division excluye');

document.getElementById('filter-division').value = '';
document.getElementById('filter-curso').value = '5°Turismo';
ui.aRenderTable();
assert(document.getElementById('a-table').innerHTML.includes('Beto'), 'filtro curso');
assert(!document.getElementById('a-table').innerHTML.includes('Ana'), 'filtro curso excluye');

document.getElementById('filter-curso').value = '';
document.getElementById('filter-charla').value = 'Ansiedad';
document.getElementById('input-buscar').value = 'beto';
ui.aRenderTable();
assert(document.getElementById('a-table').innerHTML.includes('Beto'), 'busqueda');
assert(!document.getElementById('a-table').innerHTML.includes('Ana'), 'busqueda excluye');

ui.setA({
  total: 0, porCiclo: { basico: 0, orientado: 0 }, evento_abierto: false,
  rosterLoaded: true, rosterCount: 4, slots: [], talks: [], signups: []
});
ui.aRender();
assert(document.getElementById('a-table').innerHTML.includes('Todavía no hay inscriptos'), 'estado vacio');
assert(document.getElementById('a-roster-info').textContent === '4 mails', 'roster cargado');

ui.aTab('mails');
assert(document.getElementById('pane-mails').hidden === false, 'tab mails visible');
assert(document.getElementById('pane-inscriptos').hidden === true, 'tab inscriptos oculto');
ui.aTab('inscriptos');
assert(document.getElementById('pane-mails').hidden === true, 'tab mails oculto');


function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

(async function () {
  document.getElementById('input-mail').value = 'ana@esc.edu.ar';
  ui.sLookup();
  await tick();
  assert(document.getElementById('hello-text').textContent === 'Hola, Ana. ¿Sos de 2°B?', 'saludo de identidad');
  assert(document.body.getAttribute('data-screen') === 's-screen-hello', 'pantalla de identidad');

  ui.sHelloNo();
  assert(document.getElementById('input-mail').value === '', 'mail borrado');
  assert(document.body.getAttribute('data-screen') === 's-screen-mail', 'vuelve al mail');
  assert(document.getElementById('s-banner').textContent === 'Escribí tu mail de nuevo.', 'aviso no soy yo');

  document.getElementById('input-mail').value = 'ana@esc.edu.ar';
  ui.sLookup();
  await tick();
  ui.sHelloYes();
  await tick();
  assert(document.body.getAttribute('data-screen') === 's-screen-panel', 'saltea el paso de datos');
  assert(ui.sState.email === 'ana@esc.edu.ar', 'mail guardado');

  ui.sForgotMail();
  assert(document.getElementById('sheet-title').textContent === 'No te acordás tu mail?', 'titulo del sheet');
  assert(document.getElementById('sheet-body').innerHTML.includes('preceptor'), 'texto del sheet');

  ui.setTalk({
    ok: true, role: 'admin', talk: { id: 'B1', titulo: 'Ansiedad', cupo: 40 },
    count: 1, presentes: 0,
    students: [{ id: 's1', nombre: 'Ana Gomez', curso: '2°B', presente: false }]
  });
  ui.setCred('demo');
  ui.aOnPresent('s1');
  await tick();
  assert(document.getElementById('charla-list').innerHTML.includes('is-present'), 'presente marcado');
  assert(document.getElementById('charla-presentes').textContent === 'presentes 1 de 1', 'contador de presentes');

  ui.setRole('guide');
  ui.aApplyRole();
  assert(document.getElementById('hdr-sub').textContent === 'ESI 2026 · Guía', 'subtitulo de guia');
  assert(document.getElementById('btn-csv').style.display === 'none', 'csv oculto para guia');
  assert(document.getElementById('tab-mails').style.display === 'none', 'tab de mails oculto');
  ui.setRole('admin');
  ui.aApplyRole();
  assert(document.getElementById('btn-csv').style.display === '', 'csv visible para profe');

  ui.setTalk({
    ok: true, role: 'guide', talk: { id: 'B1', titulo: 'Ansiedad', cupo: 40 },
    count: 2,
    students: [
      { nombre: 'Beto Sanchez', curso: '5°Turismo' },
      { nombre: 'Ana Gomez', curso: '2°B' }
    ]
  });
  ui.aRenderTalk();
  assert(document.getElementById('charla-count').textContent === '2 de 40', 'contador por charla');
  const lista = document.getElementById('charla-list').innerHTML;
  assert(lista.includes('Ana Gomez'), 'lista por charla');
  assert(!lista.includes('@'), 'la vista por charla no muestra mails');
  document.getElementById('input-buscar-charla').value = 'beto';
  ui.aRenderTalk();
  assert(document.getElementById('charla-list').innerHTML.includes('Beto'), 'busqueda por nombre');
  assert(!document.getElementById('charla-list').innerHTML.includes('Ana'), 'busqueda excluye');
  document.getElementById('input-buscar-charla').value = '';

  ui.setPending({
    ok: true, total: 10, pending: 1,
    students: [{ nombre: 'Ana Gomez', curso: '2°B', faltan: ['2da', '3ra'] }]
  });
  ui.aRenderPending();
  assert(document.getElementById('pend-count').textContent === '1 sin completar', 'contador sin anotar');
  assert(document.getElementById('pend-list').innerHTML.includes('Falta 2da y 3ra'), 'horarios que faltan');

})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

console.log('UI smoke: OK');
