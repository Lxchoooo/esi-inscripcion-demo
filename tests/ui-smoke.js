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
const store = {};
const document = {
  getElementById(id) {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  createElement() { return makeEl(null); },
  querySelectorAll() { return []; },
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
  sState: sState, setA: function (v) { aData = v; },
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

console.log('UI smoke: OK');
