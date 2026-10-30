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
    style: {
      props: {},
      setProperty(k, v) { this.props[k] = String(v); this[k] = String(v); },
      removeProperty(k) { delete this.props[k]; delete this[k]; }
    },
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
const cardProbe = makeEl('card-probe');
cardProbe.clientWidth = 360;
const store = {
  esi_demo: '1',
  esi_demo_roster: JSON.stringify([
    { email: 'ana@secundariosalsipuedes.edu.ar', nombre: 'Ana Gomez', curso: '2°B', apellido: 'Gomez', dni: '30111222' },
    { email: 'beto@secundariosalsipuedes.edu.ar', nombre: 'Beto Sanchez', curso: '5°Turismo' }
  ])
};
const document = {
  getElementById(id) {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  createElement() { return makeEl(null); },
  querySelectorAll(sel) {
    if (sel === '.report-table, #a-table') return [cardProbe];
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
  print() { },
  prompt() { },
  matchMedia: () => ({ matches: false })
};

const ui = new Function('window', 'document', src + `
return {
  sRender: sRender, sBuildTalk: sBuildTalk, sConfirmar: sConfirmar, sOnTalk: sOnTalk,
  aRender: aRender, aRenderTable: aRenderTable, aTab: aTab,
  sLookup: sLookup, sLookupDni: sLookupDni, sLoginSubmit: sLoginSubmit, sSalir: sSalir, sRegister: sRegister,
  sHelloYes: sHelloYes, sHelloNo: sHelloNo, demoCall: demoCall,
  sSessionToken_: sSessionToken_, sClearStudentSession_: sClearStudentSession_,
  aRenderTalk: aRenderTalk, aRenderPending: aRenderPending, aApplyRole: aApplyRole,
  aSyncTableCards_: aSyncTableCards_,
  aShowMail_: aShowMail_, aCopyText_: aCopyText_, closeSheet: closeSheet,
  aOnPresent: aOnPresent, aRepSetType: aRepSetType, aBuildPrint: aBuildPrint,
  retryTransient_: retryTransient_,
  setReports: function (v) { aReports = v; },
  setCred: function (v) { adminCred = v; },
  sState: sState, getState: function () { return sState; }, setA: function (v) { aData = v; },
  setTalk: function (v) { aTalkData = v; }, setTalkFilter: function (v) { aTalkFilter = v; aRenderTalk(); }, aSaveConfig: aSaveConfig,
  setPending: function (v) { aPendingData = v; },
  setRole: function (r) { aRole = r; },
  aRosterAdd_: aRosterAdd_, aRosterDivisions_: aRosterDivisions_, aRosterLines_: aRosterLines_,
  aMenuSet_: aMenuSet_,
  DEMO_TALKS: DEMO_TALKS, DEMO_SLOTS: DEMO_SLOTS
};`)(window, document);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

ui.sState.student = { nombre: 'Ana', curso: '2°B', email: 'ana@secundariosalsipuedes.edu.ar', ciclo: 'basico' };
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
assert(grid.className === 'slot-grid stagger', 'grid de charlas');
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
assert(document.getElementById('btn-confirmar').style.display === 'none', 'confirmar oculto con faltantes');
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
assert(document.getElementById('btn-confirmar').style.display !== 'none', 'confirmar visible al completar');
assert(document.getElementById('sel-count').textContent === 'Todo elegido, confirmá tu inscripción', 'estado listo');
ui.sConfirmar();
assert(document.body.getAttribute('data-screen') === 's-screen-done', 'va a pantalla final');
assert(document.getElementById('done-list').innerHTML.includes('Autolesiones'), 'resumen charlas');
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
assert(totals.innerHTML.includes('Alumnos'), 'stat alumnos');
assert(totals.innerHTML.includes('Reservas'), 'stat reservas');
assert(totals.innerHTML.includes('Abierta'), 'estado abierta');
assert(document.getElementById('a-roster-info').textContent === 'Sin lista cargada · el acceso por mail sigue funcionando', 'roster sin cargar');
assert(document.getElementById('a-cupos').innerHTML.includes('Cupos por charla'), 'cupos titulo');
assert(document.getElementById('a-table').innerHTML.includes('Ana'), 'tabla con inscriptos');
assert(document.getElementById('a-table').innerHTML.includes('data-mail="ana@esc.edu.ar"'), 'mail disponible en inscriptos');
assert(document.getElementById('a-table-count').textContent === '2 de 2 alumnos', 'contador de alumnos');
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
assert(document.getElementById('a-roster-info').textContent === '4 mails cargados · habilitan DNI y recordatorios', 'roster cargado');

ui.aTab('mails');
assert(document.getElementById('pane-mails').hidden === false, 'tab mails visible');
assert(document.getElementById('pane-inscriptos').hidden === true, 'tab inscriptos oculto');
ui.aTab('inscriptos');
assert(document.getElementById('pane-mails').hidden === true, 'tab mails oculto');


function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

(async function () {
  document.getElementById('input-nombre').value = 'Ana';
  document.getElementById('input-apellido').value = 'Gomez';
  document.getElementById('select-anio').value = '2';
  document.getElementById('select-division').value = 'B';
  document.getElementById('input-mail').value = 'ana@secundariosalsipuedes.edu.ar';
  ui.sLoginSubmit();
  await tick();
  assert(document.body.getAttribute('data-screen') === 's-screen-panel', 'entra con mail');
  assert(ui.sState.email === 'ana@secundariosalsipuedes.edu.ar', 'mail guardado');
  assert(ui.sState.apellido === 'Gomez', 'apellido guardado');
  document.getElementById('input-dni').value = '30.111.222';
  document.getElementById('input-apellido').value = 'gomez';
  ui.sLookupDni();
  await tick();
  assert(document.getElementById('hello-text').textContent === 'Hola, Ana. ¿Sos de 2°B?', 'saludo por dni');
  ui.sHelloYes();
  await tick();
  assert(document.body.getAttribute('data-screen') === 's-screen-panel', 'entra con dni');
  const token = store.esi_session;
  assert(typeof token === 'string' && token.indexOf('s_demo_') === 0, 'solo se guarda el token opaco');
  assert(!('esi_student' in store), 'no se guarda la identidad');
  assert(!token.includes('30111222'), 'el dni no se guarda');
  const resumed = await ui.demoCall('apiResumeSession', [token]);
  assert(resumed.ok, 'la sesion se reanuda');
  assert(resumed.student.email === 'ana@secundariosalsipuedes.edu.ar', 'la sesion reanuda al mismo alumno');
  const mismatch = await ui.demoCall('apiGetData', ['beto@secundariosalsipuedes.edu.ar', 'Beto Sanchez', '5°Turismo', token]);
  assert(!mismatch.ok && mismatch.expired, 'el token no lee datos de otro alumno');
  ui.sSalir();
  await tick();
  assert(!('esi_session' in store), 'salir borra el token');
  assert(!('esi_student' in store), 'salir no deja identidad');
  assert(!('esi_student_data' in store), 'salir borra la copia vieja');
  const revoked = await ui.demoCall('apiResumeSession', [token]);
  assert(!revoked.ok, 'salir invalida el token en el backend');
  assert(ui.getState().email === '' && ui.getState().nombre === '' && ui.getState().curso === '', 'salir limpia el estado');
  assert(ui.getState().data === null && ui.getState().lookup === null, 'salir limpia los datos');
  assert(document.getElementById('input-mail').value === '', 'salir limpia el mail');
  assert(document.getElementById('input-dni').value === '', 'salir limpia el dni');
  assert(document.getElementById('input-apellido').value === '', 'salir limpia el apellido');
  assert(document.getElementById('input-nombre').value === '', 'salir limpia el nombre');
  assert(document.getElementById('summary').innerHTML === '', 'salir limpia el resumen');
  assert(document.getElementById('hello-text').textContent === 'Hola. ¿Sos vos?', 'salir limpia el saludo');
  assert(document.body.getAttribute('data-screen') === 's-screen-mail', 'salir vuelve al ingreso');
  assert(document.getElementById('btn-login').disabled === false, 'boton de ingreso activo');
  document.getElementById('input-dni').value = '30.111.222';
  document.getElementById('input-apellido').value = '';
  ui.sLookupDni();
  await tick();
  assert(document.getElementById('hello-text').textContent === 'Hola, Ana. ¿Sos de 2°B?', 'entra solo con dni');
  ui.sHelloYes();
  await tick();
  assert(document.body.getAttribute('data-screen') === 's-screen-panel', 'panel solo con dni');
  ui.sSalir();
  await tick();
  assert(document.body.getAttribute('data-screen') === 's-screen-mail', 'vuelve al ingreso tras dni');
  document.getElementById('input-mail').value = 'nadie@gmail.com';
  ui.sLoginSubmit();
  assert(document.getElementById('s-banner').textContent.includes('@secundariosalsipuedes.edu.ar'), 'mail externo rechazado en cliente');
  assert(document.getElementById('mail-hint').hidden === false, 'error de mail visible');

  ui.setTalk({
    ok: true, role: 'admin', talk: { id: 'B1', titulo: 'Ansiedad', cupo: 40 },
    count: 1, presentes: 0,
    students: [{ id: 's1', nombre: 'Ana Gomez', curso: '2°B', presente: false }]
  });
  ui.setCred('demo');
  ui.aOnPresent('s1');
  await tick();
  assert(document.getElementById('charla-list').innerHTML.includes('is-present'), 'presente marcado');
  assert(document.getElementById('a-msg').innerHTML.includes('Deshacer'), 'aviso con deshacer');
  assert(document.getElementById('charla-presentes').textContent === 'Presentes 1 de 1', 'contador de presentes');

  ui.setRole('admin');
  ui.aApplyRole();
  ui.setTalk({
    ok: true, role: 'admin', talk: { id: 'B1', titulo: 'Ansiedad', cupo: 40 },
    count: 1, presentes: 0,
    students: [{ id: 's1', apellido: 'Gómez', nombre: 'Ana', curso: '2°B', email: 'ana@esc.edu.ar', presente: false }]
  });
  ui.aRenderTalk();
  const conMail = document.getElementById('charla-list').innerHTML;
  assert(conMail.includes('Gómez, Ana'), 'apellido primero');
  assert(conMail.includes('student-mail-btn'), 'mail detras del nombre');
  assert(conMail.includes('data-mail="ana@esc.edu.ar"'), 'mail disponible al tocar');
  assert(!conMail.includes('roster-mail'), 'mail no ocupa la fila');
  ui.aShowMail_('ana@esc.edu.ar', 'Gómez, Ana', '2°B');
  assert(document.getElementById('sheet-title').textContent === 'Mail del alumno', 'sheet del mail');
  assert(document.getElementById('sheet-body').innerHTML.includes('ana@esc.edu.ar'), 'mail completo en el sheet');
  assert(document.getElementById('sheet-body').innerHTML.includes('Gómez, Ana'), 'nombre en el sheet');
  assert(document.getElementById('sheet-confirm').textContent === 'Copiar mail', 'accion de copiar');
  ui.closeSheet();
  ui.setRole('guide');
  ui.aApplyRole();
  ui.aRenderTalk();
  assert(document.getElementById('charla-list').innerHTML.includes('ana@esc.edu.ar'), 'la segunda clave ve el mismo mail');
  assert(document.getElementById('hdr-sub').textContent === 'Jornada ESI 2026', 'un solo subtitulo para las dos claves');
  assert(document.getElementById('btn-csv').style.display === '', 'csv visible con la segunda clave');
  assert(document.getElementById('tab-mails').style.display === '', 'tab de mails visible con la segunda clave');
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
  assert(document.getElementById('charla-count').textContent === '2 de 40 lugares', 'contador por charla');
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
  assert(document.getElementById('pend-count').textContent === '1 alumno con charlas pendientes de 10', 'contador incompletos');
  assert(document.getElementById('pend-list').innerHTML.includes('Falta 2da y 3ra'), 'horarios que faltan');

  const repCourses = [{
    curso: '2°B', roster: 2, complete: 1, incomplete: 1, missing: 0,
    presentBySlot: [
      { slot: '1ra', presentes: 1 },
      { slot: '2da', presentes: 0 },
      { slot: '3ra', presentes: 1 }
    ],
    students: [
      {
        apellido: 'Díaz', nombre: 'Beto', curso: '2°B', email: 'beto@esc.edu.ar',
        talks: [
          { slot: '1ra', titulo: 'Charla uno', lugar: 'Aula 1', signup_id: 's1', presente: true },
          { slot: '2da', titulo: '', lugar: '', signup_id: '', presente: false },
          { slot: '3ra', titulo: 'Charla tres', lugar: 'Aula 3', signup_id: 's2', presente: false }
        ]
      },
      {
        apellido: 'Gómez', nombre: 'Ana', curso: '2°B', email: 'ana@esc.edu.ar',
        talks: [
          { slot: '1ra', titulo: 'Charla uno', lugar: 'Aula 1', signup_id: 's3', presente: false },
          { slot: '2da', titulo: 'Charla dos', lugar: 'Aula 2', signup_id: 's4', presente: false },
          { slot: '3ra', titulo: 'Charla tres', lugar: 'Aula 3', signup_id: 's5', presente: false }
        ]
      }
    ]
  }];
  ui.setReports({
    ok: true, role: 'admin',
    slots: [{ id: 1, nombre: '1ra' }, { id: 2, nombre: '2da' }, { id: 3, nombre: '3ra' }],
    totals: { roster: 2, complete: 1, incomplete: 1, missing: 0, presentBySlot: [] },
    courses: repCourses,
    talks: []
  });
  ui.aRepSetType('curso');
  let rep = document.getElementById('rep-out').innerHTML;
  assert(rep.includes('Díaz, Beto'), 'apellido primero en el reporte');
  assert(rep.includes('Completos'), 'totales del curso');
  assert(rep.includes('Presentes por franja'), 'presentes por franja');
  assert(rep.includes('Sin anotar'), 'charla sin anotar en el reporte');
  assert(rep.includes('student-mail-btn'), 'mail detras del nombre en el reporte');
  assert(rep.includes('data-mail="beto@esc.edu.ar"'), 'mail disponible en el reporte');
  assert(!rep.includes('row-mail'), 'mail no ocupa la tabla');
  assert(cardProbe.classList.contains('is-cards'), 'tabla angosta en modo tarjeta');
  cardProbe.clientWidth = 800;
  ui.aSyncTableCards_();
  assert(cardProbe.classList.contains('is-cards'), 'tabla de 800px en modo tarjeta');
  cardProbe.clientWidth = 900;
  ui.aSyncTableCards_();
  assert(!cardProbe.classList.contains('is-cards'), 'tabla ancha en modo tabla');
  ui.setRole('guide');
  ui.setReports({
    ok: true, role: 'guide',
    slots: [{ id: 1, nombre: '1ra' }, { id: 2, nombre: '2da' }, { id: 3, nombre: '3ra' }],
    totals: { roster: 2, complete: 1, incomplete: 1, missing: 0, presentBySlot: [] },
    courses: [{
      curso: '2°B', roster: 2, complete: 1, incomplete: 1, missing: 0, presentBySlot: [],
      students: [{ apellido: 'Díaz', nombre: 'Beto', curso: '2°B', email: 'beto@esc.edu.ar', talks: [] },
        { apellido: 'Gómez', nombre: 'Ana', curso: '2°B', email: 'ana@esc.edu.ar', talks: [] }]
    }],
    talks: []
  });
  ui.aRepSetType('curso');
  rep = document.getElementById('rep-out').innerHTML;
  assert(rep.includes('Díaz, Beto'), 'la guia ve el apellido');
  assert(rep.includes('beto@esc.edu.ar'), 'la segunda clave ve los mails del reporte');
  ui.setRole('admin');

  ui.setReports({
    ok: true, role: 'admin',
    slots: [{ id: 1, nombre: '1ra' }],
    totals: { roster: 2, complete: 1, incomplete: 1, missing: 0, presentBySlot: [] },
    courses: [],
    talks: [{
      id: 'B1', titulo: 'Charla uno', slotLabel: '10:30 a 11:20', lugar: 'Aula 1',
      ciclo: 'basico', cupo: 40, anotados: 3, presentes: 1, ausentes: 2,
      porCurso: [{ curso: '2°B', anotados: 3 }],
      students: [{ id: 's1', apellido: 'Díaz', nombre: 'Beto', curso: '2°B', presente: true, email: 'beto@esc.edu.ar' }]
    }]
  });
  ui.aRepSetType('charla');
  let repTalk = document.getElementById('rep-out').innerHTML;
  assert(repTalk.includes('Reservas'), 'stat de reservas');
  assert(repTalk.includes('Ausentes'), 'stat de ausentes');
  assert(repTalk.includes('Por curso: 2°B 3'), 'desglose por curso');
  assert(repTalk.includes('Díaz, Beto'), 'alumno en la charla');
  assert(repTalk.includes('student-mail-btn'), 'mail detras del nombre en la charla');
  assert(repTalk.includes('data-mail="beto@esc.edu.ar"'), 'mail disponible en la charla');
  assert(!repTalk.includes('row-mail'), 'mail no ocupa la tabla de la charla');
  ui.setRole('guide');
  ui.setReports({
    ok: true, role: 'guide',
    slots: [{ id: 1, nombre: '1ra' }],
    totals: { roster: 2, complete: 1, incomplete: 1, missing: 0, presentBySlot: [] },
    courses: [],
    talks: [{
      id: 'B1', titulo: 'Charla uno', slotLabel: '10:30 a 11:20', lugar: 'Aula 1',
      ciclo: 'basico', cupo: 40, anotados: 1, presentes: 0, ausentes: 1,
      porCurso: [{ curso: '2°B', anotados: 1 }],
      students: [{ id: 's1', apellido: 'Díaz', nombre: 'Beto', curso: '2°B', presente: false, email: 'beto@esc.edu.ar' }]
    }]
  });
  ui.aRepSetType('charla');
  repTalk = document.getElementById('rep-out').innerHTML;
  assert(repTalk.includes('Díaz, Beto'), 'la guia ve la charla');
  assert(repTalk.includes('beto@esc.edu.ar'), 'la segunda clave ve los mails de la charla');
  ui.setRole('admin');

  ui.setReports({
    ok: true, role: 'admin',
    slots: [{ id: 1, nombre: '1ra' }],
    totals: {
      roster: 4, complete: 1, incomplete: 2, missing: 1, signups: 6,
      presentBySlot: [{ slot: '1ra', label: '10:30 a 11:20', presentes: 1 }]
    },
    courses: [],
    talks: [{
      id: 'B1', titulo: 'Charla uno', slotLabel: '10:30 a 11:20', lugar: 'Aula 1',
      ciclo: 'basico', cupo: 40, anotados: 3, presentes: 1, ausentes: 2, porCurso: [], students: []
    }]
  });
  ui.aRepSetType('total');
  let repTotal = document.getElementById('rep-out').innerHTML;
  assert(repTotal.includes('Alumnos'), 'totales generales');
  assert(repTotal.includes('Presentes por franja'), 'presentes por franja en el total');
  assert(repTotal.includes('Total: 3 reservas, 1 presentes'), 'resumen del total');
  assert(repTotal.includes('Básico'), 'ciclo en la tabla total');

  ui.setReports({
    ok: true, role: 'admin',
    slots: [
      { id: 1, nombre: '1ra' }, { id: 2, nombre: '2da' }, { id: 3, nombre: '3ra' }
    ],
    totals: { roster: 2, complete: 1, incomplete: 1, missing: 0, presentBySlot: [] },
    courses: [{
      curso: '2°B', roster: 2, complete: 1, incomplete: 1, missing: 0,
      presentBySlot: [{ slot: '1ra', presentes: 1 }],
      students: [{
        apellido: 'Gómez', nombre: 'Ana', curso: '2°B',
        talks: [
          { slot: '1ra', titulo: 'Charla uno', lugar: 'Aula 1', signup_id: 's1', presente: true },
          { slot: '2da', titulo: 'Charla dos', lugar: 'Aula 2', signup_id: 's2', presente: false },
          { slot: '3ra', titulo: '', lugar: '', signup_id: '', presente: false }
        ]
      }]
    }],
    talks: [{
      id: 'B1', titulo: 'Charla uno', slotLabel: '10:30 a 11:20', lugar: 'Aula 1',
      ciclo: 'basico', cupo: 40, anotados: 1, presentes: 1, ausentes: 0, porCurso: [], students: []
    }]
  });
  ui.aRepSetType('curso');
  ui.aBuildPrint();
  let printHtml = document.getElementById('print-area').innerHTML;
  assert(printHtml.includes('Firma o presente'), 'columna de firma en el PDF');
  assert(printHtml.includes('Reporte por curso: 2°B'), 'encabezado del curso');
  assert(printHtml.includes('Emitido el'), 'fecha de emision');
  assert(printHtml.includes('Instituto Secundario Salsipuedes (ISS)'), 'institucion en el PDF');
  assert(printHtml.includes('Jornada ESI 2026'), 'jornada en el PDF');
  assert(/Emitido el \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(printHtml), 'fecha y hora en el PDF');
  assert(printHtml.includes('Gómez, Ana'), 'apellido primero en el PDF');
  assert(printHtml.includes('Sin anotar'), 'charla vacia en el PDF');
  assert(printHtml.includes('print-page'), 'pagina de impresion');
  ui.aRepSetType('charla');
  ui.aBuildPrint();
  printHtml = document.getElementById('print-area').innerHTML;
  assert(printHtml.includes('Reporte por charla: Charla uno'), 'encabezado de la charla');
  assert(!printHtml.includes('@'), 'el PDF no lleva mails');
  ui.aRepSetType('total');
  ui.aBuildPrint();
  printHtml = document.getElementById('print-area').innerHTML;
  assert(printHtml.includes('Reporte total'), 'encabezado del total');
  assert(printHtml.includes('Reservas'), 'tabla total en el PDF');
  ui.aRepSetType('curso');

  let tries = 0;
  const retried = await ui.retryTransient_(function () {
    tries++;
    if (tries < 3) return Promise.reject(new Error('Sin conexión.'));
    return Promise.resolve({ ok: true });
  }, function () { return Promise.resolve(); });
  assert(retried.ok && tries === 3, 'network errors retry up to three attempts');

  let busyTries = 0;
  const busyRetried = await ui.retryTransient_(function () {
    busyTries++;
    if (busyTries === 1) return Promise.resolve({ ok: false, busy: true });
    return Promise.resolve({ ok: true });
  }, function () { return Promise.resolve(); });
  assert(busyRetried.ok && busyTries === 2, 'busy responses are retried with backoff');

  let valueTries = 0;
  const rejected = await ui.retryTransient_(function () {
    valueTries++;
    return Promise.resolve({ ok: false, message: 'Clave incorrecta.' });
  }, function () { return Promise.resolve(); });
  assert(!rejected.ok && valueTries === 1, 'validation errors are not retried');

  let netTries = 0;
  let gaveUp = false;
  try {
    await ui.retryTransient_(function () {
      netTries++;
      return Promise.reject(new Error('Sin conexión.'));
    }, function () { return Promise.resolve(); });
  } catch (e) { gaveUp = true; }
  assert(gaveUp && netTries === 3, 'network errors give up after three attempts');

  const dniLogin = await ui.demoCall('apiLookupDni', ['30111222', 'Gomez']);
  assert(dniLogin.ok && dniLogin.login, 'login por DNI');
  const dniData = await ui.demoCall('apiGetData', ['', '', '', '', '', dniLogin.login]);
  assert(dniData.ok && dniData.session, 'sesión por DNI');
  const dniReg = await ui.demoCall('apiRegister', ['', 'Ana Gomez', '2°B', 'B2', 'Gomez', dniData.session]);
  assert(dniReg.ok, 'inscripción con sesión de DNI');

  const pre = await ui.demoCall('apiGetData', ['recordatorio@secundariosalsipuedes.edu.ar', 'Recordatorio Prueba', '2°B']);
  await ui.demoCall('apiRegister', ['recordatorio@secundariosalsipuedes.edu.ar', 'Recordatorio Prueba', '2°B', 'B1', 'Prueba', pre.session]);
  const demoStudent = await ui.demoCall('apiGetData', ['recordatorio@secundariosalsipuedes.edu.ar', 'Recordatorio Prueba', '2°B', pre.session, 'Prueba']);
  assert(demoStudent.ok && demoStudent.recordatorio === false, 'demo reminder opt-out by default');
  await ui.demoCall('apiSetReminder', [pre.session, true]);
  ui.setCred('demo');
  document.getElementById('cfg-fecha').value = '2026-11-05';
  document.getElementById('cfg-zona').value = 'America/Argentina/Cordoba';
  ui.aSaveConfig();
  await tick();
  assert(document.getElementById('cfg-msg').textContent === 'Configuración guardada.', 'config guardada');
  const demoCfg = await ui.demoCall('apiAdminGetConfig', ['demo']);
  assert(demoCfg.ok && demoCfg.event.fecha === '2026-11-05', 'demo config fecha');

  const demoPreview = await ui.demoCall('apiAdminMailPreview', ['demo']);
  assert(demoPreview.ok && demoPreview.total >= 1, 'demo mail preview');
  assert(demoPreview.sample.body.includes('Tus charlas:'), 'demo mail body');
  const demoSent = await ui.demoCall('apiAdminSendReminders', ['demo', 0, 20]);
  assert(demoSent.ok && demoSent.done, 'demo reminders send');

  const regEmail = 'nueva.registro@secundariosalsipuedes.edu.ar';
  const regLogin = await ui.demoCall('apiGetData', [regEmail, 'Nueva Registro', '2°B']);
  assert(regLogin.ok && regLogin.session, 'sesion para registrar');
  store.esi_session = regLogin.session;
  const regState = ui.getState();
  regState.email = regEmail;
  regState.nombre = 'Nueva Registro';
  regState.curso = '2°B';
  regState.apellido = 'Registro';
  regState.data = {
    slots: [
      { id: 1, label: '10:30 a 11:20' },
      { id: 2, label: '11:30 a 12:20' },
      { id: 3, label: '12:30 a 13:30' }
    ],
    talks: ui.DEMO_TALKS.slice(),
    mine: {}
  };
  ui.sRegister('B1');
  await tick();
  ui.sRegister('B5');
  await tick();
  assert(regState.data.mine[1] === 'B1', 'primer horario registrado');
  assert(regState.data.mine[2] === 'B5', 'segundo horario con la misma sesion');

  const icsState = ui.getState();
  icsState.data = {
    slots: [
      { id: 1, nombre: '1ra', label: '10:30 a 11:20' },
      { id: 2, nombre: '2da', label: '11:30 a 12:20' },
      { id: 3, nombre: '3ra', label: '12:30 a 13:30' }
    ],
    talks: ui.DEMO_TALKS.slice(),
    mine: { 1: 'B1', 2: 'B5', 3: 'B9' }
  };
  ui.sConfirmar();
  assert(document.body.getAttribute('data-screen') === 's-screen-done', 'confirmar lleva al final');

  ui.setRole('admin');
  ui.setCred('demo');
  const tabNames = ['charla', 'pend', 'reportes', 'estado', 'inscriptos', 'mails', 'corr', 'config'];
  for (const name of tabNames) {
    ui.aTab(name);
    assert(!document.getElementById('pane-' + name).hidden, 'pane ' + name + ' visible');
    assert(document.getElementById('tab-' + name).attrs['aria-selected'] === 'true',
      'tab ' + name + ' seleccionada');
  }
  await tick();
  await tick();

  document.getElementById('roster-mail').value = 'nuevo.alumno@secundariosalsipuedes.edu.ar';
  document.getElementById('roster-apellido').value = 'Nuevo';
  document.getElementById('roster-nombre').value = 'Alumno';
  document.getElementById('roster-anio').value = '2';
  ui.aRosterDivisions_();
  document.getElementById('roster-division').value = 'B';
  document.getElementById('roster-dni').value = '31222333';
  ui.aRosterAdd_(null);
  await tick();
  await tick();
  assert(/Agregado|agregado/.test(document.getElementById('roster-add-msg').textContent),
    'alta de alumno en la lista');
  const rosterNow = JSON.parse(store.esi_demo_roster || '[]');
  assert(rosterNow.some((r) => r.email === 'nuevo.alumno@secundariosalsipuedes.edu.ar'),
    'alumno nuevo en la lista');

  // Mini resumen, estado por horario y filtro "solo con lugares".
  const st = ui.getState();
  st.student = { nombre: 'Ana', curso: '2\u00b0B', email: 'ana@secundariosalsipuedes.edu.ar', ciclo: 'basico' };
  st.data = {
    evento_abierto: true,
    slots: [{ id: 1, label: '10:30 a 11:20' }, { id: 2, label: '11:30 a 12:20' }, { id: 3, label: '12:30 a 13:30' }],
    talks: [
      { id: 'B1', titulo: 'Ansiedad', slot_id: 1, lugar: 'Aula 5', cupo: 40, restantes: 40 },
      { id: 'B2', titulo: 'Alcohol', slot_id: 1, lugar: 'Aula 6', cupo: 40, restantes: 0 },
      { id: 'B5', titulo: 'Autolesiones', slot_id: 2, lugar: 'Aula 7', cupo: 40, restantes: 12 }
    ],
    mine: { 1: 'B1' }
  };
  st.onlyAvailable = false;
  st.lastChosen = -1;
  ui.sRender();
  const mini = document.getElementById('mini-summary');
  assert(mini.hidden === false, 'mini resumen visible');
  assert(mini.innerHTML.includes('Ansiedad'), 'mini resumen muestra la elegida');
  assert(mini.innerHTML.includes('Falta elegir'), 'mini resumen marca lo que falta');
  const slot0 = document.getElementById('slots-container').children[0];
  assert(slot0.children[0].innerHTML.includes('Ya elegiste'), 'badge ya elegiste');
  assert(!document.getElementById('slots-container').children[1].children[0].innerHTML.includes('Ya elegiste'),
    'badge solo en el horario elegido');
  st.onlyAvailable = true;
  ui.sRender();
  const grid2 = document.getElementById('slots-container').children[0].children[1];
  assert(grid2.children.length === 1, 'filtro solo con lugares');
  st.onlyAvailable = false;
  assert(document.getElementById('slot-progress-fill').style.width === '33%',
    'barra de progreso al 33 por ciento');
  st.miniOpen = false;
  ui.sRender();
  assert(document.getElementById('mini-summary').className.includes('is-collapsed'),
    'mini resumen colapsable');
  st.miniOpen = true;

  console.log('UI smoke: OK');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

