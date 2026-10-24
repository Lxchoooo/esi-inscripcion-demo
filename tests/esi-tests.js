'use strict';

global.Logger = { log: function () { } };

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('Usage: node esi-tests.js <esi-panel-dir>');
  process.exit(2);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function compile(name, src) {
  try {
    new Function(src);
    console.log('PASS syntax ' + name);
    return true;
  } catch (e) {
    console.log('FAIL syntax ' + name + ' -> ' + e.message);
    return false;
  }
}

function extractScripts(html) {
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

let ok = 0;
let fail = 0;

let asyncPending = 0;
let summarized = false;

function msg(e) {
  return e && e.message ? e.message : e;
}

function t(name, fn) {
  let r;
  try {
    r = fn();
  } catch (e) {
    fail++;
    console.log('FAIL ' + name + ' -> ' + msg(e));
    return;
  }
  if (r && typeof r.then === 'function') {
    asyncPending++;
    r.then(() => {
      ok++;
      console.log('PASS ' + name);
      finish();
    }).catch((e) => {
      fail++;
      console.log('FAIL ' + name + ' -> ' + msg(e));
      finish();
    });
    return;
  }
  ok++;
  console.log('PASS ' + name);
}

function summary() {
  if (asyncPending > 0) return;
  if (summarized) return;
  summarized = true;
  console.log('');
  console.log(ok + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
}

function finish() {
  asyncPending--;
  summary();
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const codeSrc = read('Code.gs');
const panelHtml = read('Panel.html');
const publishedCandidates = [path.join(ROOT, '..', 'index.html'), path.join(ROOT, 'web', 'index.html')];
for (const file of publishedCandidates) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== panelHtml) {
    console.error('FAIL published index.html is stale: ' + file);
    process.exit(1);
  }
}
const apps = read('appsscript.json');

compile('Code.gs', codeSrc);
const panelScripts = extractScripts(panelHtml);
if (panelScripts.length === 0) {
  console.log('FAIL syntax Panel.html -> no <script> found');
  fail++;
} else {
  let allOk = true;
  panelScripts.forEach((s, i) => {
    if (!compile('Panel.html#' + i, s)) allOk = false;
  });
  if (!allOk) fail++;
}
try {
  JSON.parse(apps);
  ok++;
  console.log('PASS appsscript.json is valid JSON');
} catch (e) {
  fail++;
  console.log('FAIL appsscript.json -> ' + e.message);
}

const Core = new Function(codeSrc + '\nreturn EsiCore;')();

const juana = { emailKey: 'juana@secundariosalsipuedes.edu.ar', ciclo: 'basico' };

function talks() {
  return {
    B1: { id: 'B1', titulo: 'A', ciclo: 'basico', slot_id: 1, cupo: 2, activa: true },
    B2: { id: 'B2', titulo: 'B', ciclo: 'basico', slot_id: 1, cupo: 2, activa: true },
    B5: { id: 'B5', titulo: 'E', ciclo: 'basico', slot_id: 2, cupo: 2, activa: true },
    B8: { id: 'B8', titulo: 'H', ciclo: 'basico', slot_id: 3, cupo: 1, activa: true },
    O9: { id: 'O9', titulo: 'I', ciclo: 'orientado', slot_id: 3, cupo: 1, activa: true }
  };
}

function signup(id, emailKey, slot, talkId, ciclo) {
  return { id: id, emailKey: emailKey, slot_id: slot, talk_id: talkId, ciclo: ciclo || 'basico' };
}

t('normalizeEmail lowercases and trims', () => {
  assertEq(Core.normalizeEmail('  Juana@SecundariosAlsipuedes.Edu.AR '), 'juana@secundariosalsipuedes.edu.ar');
});

t('isValidEmail accepts institutional mails and rejects junk', () => {
  assertEq(Core.isValidEmail('juana@secundariosalsipuedes.edu.ar'), true);
  assertEq(Core.isValidEmail('juana.mendez@secundariosalsipuedes.edu.ar'), true);
  assertEq(Core.isValidEmail('juana@esc'), false);
  assertEq(Core.isValidEmail('juana esc.edu.ar'), false);
  assertEq(Core.isValidEmail(''), false);
});

t('cicloFromCurso derives cycles by year', () => {
  assertEq(Core.cicloFromCurso('2°A'), 'basico');
  assertEq(Core.cicloFromCurso('1'), 'basico');
  assertEq(Core.cicloFromCurso('5°'), 'orientado');
  assertEq(Core.cicloFromCurso('6to'), 'orientado');
  assertEq(Core.cicloFromCurso('CB'), null);
  assertEq(Core.cicloFromCurso('AB'), null);
});

t('validateStudentInput returns identity and cycle', () => {
  const v = Core.validateStudentInput('  Juana@SecundariosAlsipuedes.Edu.AR ', '  Juana   Pérez ', '2°A');
  assertEq(v.ok, true);
  assertEq(v.email, 'juana@secundariosalsipuedes.edu.ar');
  assertEq(v.nombre, 'Juana Pérez');
  assertEq(v.nombreKey, 'juana perez');
  assertEq(v.ciclo, 'basico');
});

t('validateStudentInput rejects bad email, short name and unknown year', () => {
  assertEq(Core.validateStudentInput('juana@esc', 'Juana Perez', '2°A').error, 'email');
  assertEq(Core.validateStudentInput('juana@secundariosalsipuedes.edu.ar', 'J', '2°A').error, 'nombre');
  assertEq(Core.validateStudentInput('juana@secundariosalsipuedes.edu.ar', 'Juana Perez', 'CB').error, 'curso');
});

t('insert when talk free', () => {
  const p = Core.planRegistration([], talks(), juana, 'B1');
  assertEq(p.action, 'insert');
});

t('duplicate same mail, slot and talk is noop', () => {
  const s = [signup('u1', juana.emailKey, 1, 'B1')];
  const p = Core.planRegistration(s, talks(), juana, 'B1');
  assertEq(p.action, 'none');
});

t('change within slot when target has room', () => {
  const s = [signup('u1', juana.emailKey, 1, 'B1')];
  const p = Core.planRegistration(s, talks(), juana, 'B2');
  assertEq(p.action, 'change');
  assertEq(p.signupId, 'u1');
  assertEq(p.previousTalkId, 'B1');
});

t('cannot change into full talk, keeps previous', () => {
  const s = [
    signup('u1', juana.emailKey, 1, 'B1'),
    signup('u2', 'otro@secundariosalsipuedes.edu.ar', 1, 'B2'),
    signup('u3', 'dos@secundariosalsipuedes.edu.ar', 1, 'B2')
  ];
  const p = Core.planRegistration(s, talks(), juana, 'B2');
  assertEq(p.error, 'full');
});

t('different mails add different students to same talk', () => {
  const s = [signup('u1', 'juana@secundariosalsipuedes.edu.ar', 1, 'B1')];
  const p = Core.planRegistration(s, talks(), { emailKey: 'melina@secundariosalsipuedes.edu.ar', ciclo: 'basico' }, 'B1');
  assertEq(p.action, 'insert');
});

t('new slot insert allowed, one per slot', () => {
  const s = [
    signup('u1', juana.emailKey, 1, 'B1'),
    signup('u2', juana.emailKey, 3, 'B8')
  ];
  const p = Core.planRegistration(s, talks(), juana, 'B5');
  assertEq(p.action, 'insert');
  const q = Core.planRegistration(s, talks(), juana, 'B2');
  assertEq(q.action, 'change');
});

t('cannot take a full talk in a free slot', () => {
  const s = [signup('u9', 'otra@secundariosalsipuedes.edu.ar', 3, 'B8')];
  const p = Core.planRegistration(s, talks(), juana, 'B8');
  assertEq(p.error, 'full');
});

t('cycle mismatch rejected', () => {
  const p = Core.planRegistration([], talks(), { emailKey: 'x@secundariosalsipuedes.edu.ar', ciclo: 'orientado' }, 'B1');
  assertEq(p.error, 'talkWrongCycle');
});

t('student with all three slots replaces, never exceeds three', () => {
  const s = [
    signup('u1', juana.emailKey, 1, 'B1'),
    signup('u2', juana.emailKey, 2, 'B5'),
    signup('u3', juana.emailKey, 3, 'B8')
  ];
  const p = Core.planRegistration(s, talks(), juana, 'B2');
  assertEq(p.action, 'change');
});

t('identity is the mail, name spelling does not split a student', () => {
  const s = [signup('u1', juana.emailKey, 1, 'B1')];
  const sameMailDifferentName = { emailKey: juana.emailKey, ciclo: 'basico' };
  const p = Core.planRegistration(s, talks(), sameMailDifferentName, 'B1');
  assertEq(p.action, 'none');
});

const panelSrc = panelScripts.join('\n');
const sandboxWindow = { location: { search: '' } };
const sandboxDoc = { addEventListener: function () { } };
const Client = new Function('window', 'document', panelSrc + '\nreturn EsiClient;')(
  sandboxWindow,
  sandboxDoc
);

t('Panel EsiClient parity: normalizeEmail/isValidEmail/cicloFromCurso', () => {
  assertEq(Client.normalizeEmail('  Juana@SecundariosAlsipuedes.Edu.AR '), Core.normalizeEmail('  Juana@SecundariosAlsipuedes.Edu.AR '));
  assertEq(Client.isValidEmail('juana@secundariosalsipuedes.edu.ar'), Core.isValidEmail('juana@secundariosalsipuedes.edu.ar'));
  assertEq(Client.isValidEmail('junk'), false);
  assertEq(Client.cicloFromCurso('5°'), Core.cicloFromCurso('5°'));
  assertEq(Client.cicloFromCurso('CB'), null);
});

t('Panel EsiClient parity: validateStudentInput', () => {
  const a = Client.validateStudentInput(' juana@secundariosalsipuedes.edu.ar ', ' Juana Perez ', '2°A');
  const b = Core.validateStudentInput(' juana@secundariosalsipuedes.edu.ar ', ' Juana Perez ', '2°A');
  ['ok', 'email', 'nombre', 'nombreKey', 'ciclo'].forEach((k) => assertEq(a[k], b[k], 'key ' + k));
  assertEq(Client.validateStudentInput('juana@secundariosalsipuedes.edu.ar', 'J', '2°A').error, 'nombre');
  assertEq(Client.validateStudentInput('juana@secundariosalsipuedes.edu.ar', 'Juana Perez', 'CB').error, 'curso');
});

t('Panel EsiClient parity: planRegistration scenarios', () => {
  const scen = [
    [[], 'B1'],
    [[signup('u1', juana.emailKey, 1, 'B1')], 'B1'],
    [[signup('u1', juana.emailKey, 1, 'B1')], 'B2'],
    [[signup('u9', 'o@secundariosalsipuedes.edu.ar', 3, 'B8')], 'B8'],
    [[signup('u1', juana.emailKey, 1, 'B1'), signup('u2', juana.emailKey, 3, 'B8')], 'B5']
  ];
  scen.forEach((pair, i) => {
    const a = Client.planRegistration(pair[0], talks(), juana, pair[1]);
    const b = Core.planRegistration(pair[0], talks(), juana, pair[1]);
    assertEq(JSON.stringify(a), JSON.stringify(b), 'scenario ' + i);
  });
});

t('Code.gs exposes all API functions referenced by API_FN_MAP_', () => {
  const m = codeSrc.match(/var API_FN_MAP_ = \{([\s\S]*?)\};/);
  if (!m) throw new Error('API_FN_MAP_ missing');
  const names = [...m[1].matchAll(/(\w+):/g)].map((x) => x[1]);
  if (names.length !== 30) throw new Error('expected 30 api fns, got ' + names.length);
  const want = ['apiBootstrap', 'apiLookup', 'apiGetData', 'apiResumeSession', 'apiStudentLogout', 'apiRegister', 'apiSetReminder', 'apiAdminLogin', 'apiAdminGetData', 'apiAdminSetOpen', 'apiAdminDeleteSignup', 'apiAdminImportRoster', 'apiAdminTalkRoster', 'apiAdminPending', 'apiAdminSetPresent', 'apiAdminReports', 'apiAdminMailPreview', 'apiAdminSendReminders', 'apiAdminGetConfig', 'apiAdminSetConfig', 'apiAdminStatus', 'apiAdminDuplicates', 'apiAdminAddStudent', 'apiAdminCorrectStudent', 'apiAdminMoveTalk', 'apiAdminMergeDuplicates', 'apiAdminDeleteStudent', 'apiAdminDeleteTestData', 'apiAdminCloseEvent', 'apiAdminErasePersonalData'];
  want.forEach((n) => {
    if (!names.includes(n)) throw new Error('missing in map: ' + n);
    if (!new RegExp('function ' + n + '\\(').test(codeSrc)) throw new Error('missing function ' + n);
  });
});

t('Code.gs serves JSONP router in doGet', () => {
  if (!/function apiJsonp_\(/.test(codeSrc)) throw new Error('apiJsonp_ missing');
  if (!/if \(String\(p\.fn \|\| ''\)\) return apiJsonp_\(p\);/.test(codeSrc)) throw new Error('doGet does not route to JSONP');
  if (!/MimeType\.JAVASCRIPT/.test(codeSrc)) throw new Error('JSONP mime missing');
});

t('Panel.html has demo mode, JSONP transport and api persistence', () => {
  for (const needle of ["TRANSPORT = 'unconfigured'", 'TRANSPORT === \'jsonp\'', 'esi_api', 'esi_demo_signups']) {
    if (!panelSrc.includes(needle)) throw new Error('missing ' + needle);
  }
  for (const needle of ['MODO DEMO', 'Sin servidor configurado', 'btn-demo']) {
    if (!panelHtml.includes(needle)) throw new Error('missing markup ' + needle);
  }
});

t('Panel does not ship a demo PIN or store the admin key', () => {
  if (/DEMO_PIN/.test(panelSrc)) throw new Error('demo pin found');
  if (/sessionStorage\.setItem\(['"]esi_admin_pin/.test(panelSrc)) throw new Error('admin pin stored');
  var demoPin = String.fromCharCode(49,50,51,52);
  if (panelHtml.indexOf(demoPin) !== -1 || codeSrc.indexOf(demoPin) !== -1) throw new Error('hardcoded PIN found');
  if (!codeSrc.includes('PropertiesService.getScriptProperties')) throw new Error('Script Properties missing');
});

t('Panel transport requires an explicit demo or a backend', () => {
  const makeWin = (search, store) => ({
    location: { search: search },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  });
  const doc = { addEventListener: function () { } };
  const plain = {};
  const t1 = new Function('window', 'document', panelSrc + '\nreturn TRANSPORT;')(makeWin('', plain), doc);
  assertEq(t1, 'unconfigured', 'bare url');
  const demoStore = {};
  const t2 = new Function('window', 'document', panelSrc + '\nreturn TRANSPORT;')(makeWin('?demo=1', demoStore), doc);
  assertEq(t2, 'demo', 'explicit demo');
  const apiStore = { esi_api: 'https://example.com/exec' };
  const t3 = new Function('window', 'document', panelSrc + '\nreturn TRANSPORT;')(makeWin('', apiStore), doc);
  assertEq(t3, 'jsonp', 'stored api');
});

t('cursoFromParts: A/B for basic, Turismo/Economia for orientado', () => {
  assertEq(Core.cursoFromParts(2, 'B'), '2\u00B0B');
  assertEq(Core.cursoFromParts(1, 'a'), '1\u00B0A');
  assertEq(Core.cursoFromParts('5', 'Turismo'), '5\u00B0Turismo');
  assertEq(Core.cursoFromParts(6, 't'), '6\u00B0Turismo');
  assertEq(Core.cursoFromParts(4, 'Economía'), '4\u00B0Econom\u00EDa');
  assertEq(Core.cursoFromParts(4, 'e'), '4\u00B0Econom\u00EDa');
  assertEq(Core.cursoFromParts(2, 'Turismo'), null);
  assertEq(Core.cursoFromParts(5, 'A'), null);
  assertEq(Core.cursoFromParts(7, 'A'), null);
  assertEq(Core.cursoFromParts(0, 'A'), null);
  assertEq(Core.cursoFromParts(3, ''), '3\u00B0');
  assertEq(Core.cursoFromParts('x', 'A'), null);
  assertEq(Core.divisionsForYear(2).join(','), 'A,B');
  assertEq(Core.divisionsForYear(5).join(','), 'Turismo,Econom\u00EDa');
  assertEq(Core.divisionsForYear(9).length, 0);
});

t('parseCurso: school spellings for both cycles', () => {
  assertEq(Core.parseCurso('2\u00B0B'), '2\u00B0B');
  assertEq(Core.parseCurso('2b'), '2\u00B0B');
  assertEq(Core.parseCurso(' 1 \u00b0 a '), '1\u00B0A');
  assertEq(Core.parseCurso('5turismo'), '5\u00B0Turismo');
  assertEq(Core.parseCurso('6 ECONOMÍA'), '6\u00B0Econom\u00EDa');
  assertEq(Core.parseCurso('4economia'), '4\u00B0Econom\u00EDa');
  assertEq(Core.parseCurso('3'), '3\u00B0');
  assertEq(Core.parseCurso('3C'), null);
  assertEq(Core.parseCurso('5A'), null);
  assertEq(Core.parseCurso('6B'), null);
  assertEq(Core.parseCurso('CB'), null);
  assertEq(Core.parseCurso('7\u00B0A'), null);
  assertEq(Core.parseCurso(''), null);
});

t('parseCurso tolerates school spellings, rejects junk', () => {
  assertEq(Core.parseCurso('2\u00B0B'), '2\u00B0B');
  assertEq(Core.parseCurso('2b'), '2\u00B0B');
  assertEq(Core.parseCurso(' 2 \u00b0 b '), '2\u00B0B');
  assertEq(Core.parseCurso('3'), '3\u00B0');
  assertEq(Core.parseCurso('CB'), null);
  assertEq(Core.parseCurso('7\u00B0A'), null);
  assertEq(Core.parseCurso(''), null);
});

t('parseRoster handles separators, header, dupes, invalids', () => {
  const txt = [
    'mail;nombre;curso',
    ' juana1@secundariosalsipuedes.edu.ar ; Juana Perez ; 2b ',
    'mateo2@secundariosalsipuedes.edu.ar,Mateo Gomez,5Turismo',
    'lucia3@secundariosalsipuedes.edu.ar',
    'juana1@secundariosalsipuedes.edu.ar; otra; 3A',
    'malo@esc',
    '   '
  ].join('\n');
  const r = Core.parseRoster(txt);
  assertEq(r.rows.length, 3, 'rows');
  assertEq(r.duplicados, 1, 'dupes');
  assertEq(r.invalidos.length, 1, 'invalid');
  assertEq(r.rows[0].email, 'juana1@secundariosalsipuedes.edu.ar');
  assertEq(r.rows[0].nombre, 'Juana Perez');
  assertEq(r.rows[0].curso, '2\u00B0B');
  assertEq(r.rows[1].curso, '5\u00B0Turismo');
  assertEq(r.rows[2].nombre, '');
  assertEq(r.rows[2].curso, '');
});

t('parseCurso rejects ambiguous junk like two-digit cursos', () => {
  assertEq(Core.parseCurso('12B'), null);
});

t('aggregateTalks counts, per cycle and remaining seats', () => {
  const talks = [
    { id: 'B1', titulo: 'A', ciclo: 'basico', slot_id: 1, cupo: 3, activa: true, lugar: 'X' },
    { id: 'O9', titulo: 'I', ciclo: 'orientado', slot_id: 3, cupo: 1, activa: true, lugar: 'Y' }
  ];
  const s = [
    signup('u1', 'a@e.co', 1, 'B1'),
    signup('u2', 'b@e.co', 1, 'B1'),
    signup('u3', 'c@e.co', 3, 'O9', 'orientado')
  ];
  const agg = Core.aggregateTalks(s, talks);
  assertEq(agg.total, 3);
  assertEq(agg.porCiclo.basico, 2);
  assertEq(agg.porCiclo.orientado, 1);
  assertEq(agg.rows[0].anotados, 2);
  assertEq(agg.rows[0].restantes, 1);
  assertEq(agg.rows[1].anotados, 1);
  assertEq(agg.rows[1].restantes, 0);
});

t('Panel parity: parseCurso/parseRoster/aggregateTalks/cursoFromParts', () => {
  assertEq(Client.cursoFromParts('4', 'C'), Core.cursoFromParts('4', 'C'));
  assertEq(Client.parseCurso('5\u00b0a'), Core.parseCurso('5\u00b0a'));
  const txt = 'mail\nana1@secundariosalsipuedes.edu.ar; Ana Ana; 2B\nbea2@secundariosalsipuedes.edu.ar;Bea,4Turismo\nbea2@secundariosalsipuedes.edu.ar x';
  assertEq(JSON.stringify(Client.parseRoster(txt)), JSON.stringify(Core.parseRoster(txt)));
  const talks = [{ id: 'B1', titulo: 'A', ciclo: 'basico', slot_id: 1, cupo: 2, activa: true, lugar: 'X' }];
  const s = [signup('u1', 'a@e.co', 1, 'B1'), signup('u2', 'b@e.co', 1, 'B1')];
  assertEq(JSON.stringify(Client.aggregateTalks(s, talks)), JSON.stringify(Core.aggregateTalks(s, talks)));
});

t('Panel.html exposes roster import UI and api', () => {
  for (const needle of ['apiAdminImportRoster', 'btn-import-add', 'btn-import-rep', 'ta-roster', 'a-roster-info']) {
    if (!panelSrc.includes(needle)) throw new Error('missing ' + needle);
  }
  if (!codeSrc.includes('apiAdminImportRoster')) throw new Error('server import missing');
  if (!codeSrc.includes('rebuildReport_()')) throw new Error('report hook missing');
});

t('Panel demo backend: register, full, keep previous, admin, close/open, delete', () => {
  const store = {};
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const win = { location: { search: '' }, localStorage: ls };
  const doc = {
    addEventListener: function () { },
    body: { appendChild: function () { }, classList: { add: function () { } } }
  };
  const api = new Function('window', 'document', panelSrc + '\nreturn { call: demoCall };')(win, doc);
  const seed = [];
  for (let i = 0; i < 40; i++) {
    seed.push({
      id: 's' + i, ts: 0, email: 'f' + i + '@secundariosalsipuedes.edu.ar', nombre: 'Fulano ' + i,
      curso: '2°A', ciclo: 'basico', slot_id: 1, talk_id: 'B2', emailKey: 'f' + i + '@secundariosalsipuedes.edu.ar'
    });
  }

  let sess = '';
  return api.call('apiGetData', ['ana.lopez@secundariosalsipuedes.edu.ar', 'Ana Lopez', '2°B']).then((start) => {
    sess = start.session;
    return api.call('apiRegister', ['ana.lopez@secundariosalsipuedes.edu.ar', 'Ana Lopez', '2°B', 'B1', '', sess]);
  }).then((r1) => {
    assertEq(r1.ok, true, 'ana B1');
    if (!/Listo, quedaste anotado/.test(r1.message)) throw new Error('msg: ' + r1.message);
    assertEq(r1.data.mine[1], 'B1', 'mine slot1');
    if ('signups' in r1.data || 'students' in r1.data) throw new Error('public data leaks lists');
    if (JSON.stringify(r1.data).includes('@secundariosalsipuedes.edu.ar')) throw new Error('public data leaks mails');
    const cur = JSON.parse(ls.getItem('esi_demo_signups'));
    for (let i = 0; i < 40; i++) cur.push(seed[i]);
    ls.setItem('esi_demo_signups', JSON.stringify(cur));
    return api.call('apiRegister', ['ana.lopez@secundariosalsipuedes.edu.ar', 'Ana Lopez', '2°B', 'B2', '', sess]);
  }).then((r2) => {
    assertEq(r2.ok, false, 'B2 full rejected');
    if (!/Sin lugares/.test(r2.message)) throw new Error('msg: ' + r2.message);
    assertEq(r2.data.mine[1], 'B1', 'kept previous B1');
    return api.call('apiRegister', ['ana.lopez@secundariosalsipuedes.edu.ar', 'Ana Lopez', '2°B', 'B5', '', sess]);
  }).then((r3) => {
    assertEq(r3.ok, true, 'ana B5 slot2');
    assertEq(r3.data.mine[2], 'B5', 'mine slot2');
    return api.call('apiAdminLogin', ['demo']);
  }).then((r4) => {
    assertEq(r4.ok, true, 'demo login');
    return api.call('apiAdminSetOpen', ['demo', false]);
  }).then((r5) => {
    assertEq(r5.ok, true, 'closed by admin');
    return api.call('apiRegister', ['bea@secundariosalsipuedes.edu.ar', 'Bea Diaz', '1°A', 'B1']);
  }).then((r6) => {
    assertEq(r6.ok, false, 'register blocked when closed');
    if (!/cerrada/.test(r6.message)) throw new Error('msg: ' + r6.message);
    return api.call('apiAdminSetOpen', ['demo', true]);
  }).then((r7) => {
    assertEq(r7.ok, true, 'reopened');
    return api.call('apiRegister', ['bea@secundariosalsipuedes.edu.ar', 'Bea Diaz', '1°A', 'B1']);
  }).then((r8) => {
    assertEq(r8.ok, true, 'register after reopen');
    return api.call('apiAdminGetData', ['demo']);
  }).then((r9) => {
    assertEq(r9.ok, true, 'admin data');
    assertEq(r9.total, 43, 'total = 40 seed + ana x2 + bea');
    assertEq(r9.signups.some((s) => s.email === 'bea@secundariosalsipuedes.edu.ar'), true, 'bea listed');
    return api.call('apiAdminDeleteSignup', ['demo', r9.signups[0].id]);
  }).then((r10) => {
    assertEq(r10.ok, true, 'deleted');
    return api.call('apiAdminGetData', ['demo']);
  }).then((r11) => {
    assertEq(r11.total, 42, 'total after delete');
  });
});

t('Panel demo backend: roster import does not restrict mail access', () => {
  const store = {};
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const win = { location: { search: '' }, localStorage: ls };
  const doc = {
    addEventListener: function () { },
    body: { appendChild: function () { }, classList: { add: function () { } } }
  };
  const api = new Function('window', 'document', panelSrc + '\nreturn { call: demoCall };')(win, doc);

  return api.call('apiAdminImportRoster', ['demo', 'ana1@secundariosalsipuedes.edu.ar; Ana Ruiz; 2b\nbea2@secundariosalsipuedes.edu.ar', 'reemplazar']).then((r1) => {
    assertEq(r1.ok, true, 'import ok');
    assertEq(r1.total, 2, 'total roster');
    assertEq(r1.nuevos, 2, 'nuevos');
    assertEq(r1.modo, 'reemplazar', 'modo');
    return api.call('apiLookup', ['bea2@secundariosalsipuedes.edu.ar']);
  }).then((r2) => {
    assertEq(r2.ok, true, 'roster mail lookup');
    assertEq(r2.rosterLoaded, true, 'rosterLoaded');
    assertEq(r2.needsNombre, true, 'needsNombre');
    assertEq(r2.needsApellido, true, 'needsApellido');
    assertEq(r2.needsCurso, true, 'needsCurso');
    return api.call('apiLookup', ['desconocido@secundariosalsipuedes.edu.ar']);
  }).then((r3) => {
    assertEq(r3.ok, true, 'unknown mail still enters');
    return api.call('apiRegister', ['desconocido@secundariosalsipuedes.edu.ar', 'Pepe Gomez', '2A', 'B1']);
  }).then((r4) => {
    assertEq(r4.ok, true, 'unknown mail can register');
  });
});


t('Code.gs keeps the admin key in Script Properties and rate limits failures', () => {
  const props = { ADMIN_PIN: '9876' };
  const fakeProps = {
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: (k) => { delete props[k]; }
  };
  const lock = { waitLock: function () { }, releaseLock: function () { } };
  const services = {
    PropertiesService: { getScriptProperties: () => fakeProps },
    LockService: { getScriptLock: () => lock }
  };
  const api = new Function('PropertiesService', 'LockService', codeSrc + '\nreturn { adminAuth_: adminAuth_ };')(services.PropertiesService, services.LockService);
  for (let i = 0; i < 5; i++) {
    const r = api.adminAuth_('bad');
    assertEq(r.ok, false, 'bad pin');
  }
  const blocked = api.adminAuth_('9876');
  assertEq(blocked.ok, false, 'blocked after 5');
  if (!/Demasiados intentos/.test(blocked.message)) throw new Error('block msg: ' + blocked.message);
  delete props.ADMIN_BLOCK_UNTIL;
  const ok = api.adminAuth_('9876');
  assertEq(ok.ok, true, 'valid pin after block');
  assertEq(props.ADMIN_PIN, '9876', 'pin kept in properties');
});

t('Code.gs admin APIs reject invalid keys before reading data', () => {
  const names = ['apiAdminGetData', 'apiAdminSetOpen', 'apiAdminDeleteSignup', 'apiAdminImportRoster'];
  const make = () => {
    const props = { ADMIN_PIN: '9876' };
    const fakeProps = {
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; }
    };
    const lock = { waitLock: function () { }, releaseLock: function () { } };
    const api = new Function('PropertiesService', 'LockService', codeSrc + '\nreturn {' + names.join(',') + '};')(
      { getScriptProperties: () => fakeProps },
      { getScriptLock: () => lock }
    );
    return api;
  };
  names.forEach((name) => {
    const api = make();
    const args = name === 'apiAdminGetData' ? ['bad']
      : name === 'apiAdminSetOpen' ? ['bad', true]
        : name === 'apiAdminDeleteSignup' ? ['bad', 'x']
          : ['bad', 'a@b.co', 'agregar'];
    const r = api[name].apply(null, args);
    assertEq(r.ok, false, name + ' rejects');
    if (r.signups || r.students || r.email || r.nombre) throw new Error(name + ' leaked data');
  });
});

t('Code.gs seeds no admin PIN and logs no key', () => {
  if (!/ADMIN_MAX_FAILS\s*=\s*5/.test(codeSrc)) throw new Error('max fails missing');
  if (!/ADMIN_BLOCK_MS\s*=\s*15 \* 60 \* 1000/.test(codeSrc)) throw new Error('block window missing');
  if (/\[[\s]*['"]admin_pin['"],\s*randomPin_/.test(codeSrc)) throw new Error('seeded admin pin');
  if (/Logger\.log\([^)]*PIN de profes/i.test(codeSrc)) throw new Error('logs pin');
  if (!/ensureAdminPin_/.test(codeSrc)) throw new Error('ensureAdminPin_ missing');
});

t('Code.gs issues a session token that replaces the pin on later calls', () => {
  const props = { ADMIN_PIN: '9876' };
  const fakeProps = {
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: (k) => { delete props[k]; }
  };
  const cache = new Map();
  let uuid = 0;
  const services = {
    props,
    cache,
    PropertiesService: { getScriptProperties: () => fakeProps },
    LockService: { getScriptLock: () => ({ waitLock: function () { }, releaseLock: function () { } }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => { cache.set(k, v); },
        remove: (k) => { cache.delete(k); }
      })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => 'uuid-' + (++uuid),
      computeDigest: (algo, value) => {
        let h = 7;
        const s = String(value);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 255;
        return [h, (h + 17) & 255, (h + 91) & 255, 250, 255];
      }
    }
  };
  const api = new Function('PropertiesService', 'LockService', 'CacheService', 'Utilities',
    codeSrc + '\nreturn { adminAuth_: adminAuth_, apiAdminLogin: apiAdminLogin };')(
    services.PropertiesService, services.LockService, services.CacheService, services.Utilities);
  const login = api.apiAdminLogin('9876');
  assertEq(login.ok, true, 'login ok');
  if (typeof login.token !== 'string' || login.token.indexOf('t_') !== 0) throw new Error('token not issued');
  assertEq(api.adminAuth_(login.token).ok, true, 'token accepted');
  const badToken = api.adminAuth_('t_nope');
  assertEq(badToken.ok, false, 'bad token rejected');
  if (!/Sesión vencida/.test(badToken.message)) throw new Error('bad token message: ' + badToken.message);
  assertEq(api.adminAuth_('9876').ok, true, 'pin still works');
  const wrongPin = api.adminAuth_('0000');
  assertEq(wrongPin.ok, false, 'wrong pin rejected');
  if (!/Clave incorrecta/.test(wrongPin.message)) throw new Error('wrong pin message: ' + wrongPin.message);
  if (cache.size < 1) throw new Error('token not cached');
});

t('Code.gs keeps the session token short lived and out of the sheet', () => {
  if (!/ADMIN_TOKEN_TTL\s*=\s*7200/.test(codeSrc)) throw new Error('token ttl missing');
  if (!/ADMIN_TOKEN_PREFIX\s*=\s*'t_'/.test(codeSrc)) throw new Error('token prefix missing');
  if (!/adminIssueToken_/.test(codeSrc)) throw new Error('adminIssueToken_ missing');
  if (!/CacheService/.test(codeSrc)) throw new Error('cache missing');
  if (/writeConfig_\([^)]*token/i.test(codeSrc)) throw new Error('token written to sheet');
});

t('Panel keeps the session token in memory and not the pin in storage', () => {
  if (!/adminCred\s*=\s*resp\.token/.test(panelSrc)) throw new Error('panel does not use the token');
  if (/sessionStorage\.setItem\([^)]*adminCred/.test(panelSrc)) throw new Error('token stored');
  if (/lsSet\([^)]*adminCred/.test(panelSrc)) throw new Error('token stored');
  if (!/aAuthLost/.test(panelSrc)) throw new Error('no session expiry handling');
});

function cssVar(block, name) {
  const m = block.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
  if (!m) throw new Error('missing --' + name);
  return m[1];
}

function contrast(a, b) {
  function lum(hex) {
    const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

t('Panel keeps control borders and focus rings above the contrast minimum', () => {
  const root = panelHtml.match(/:root \{([\s\S]*?)\}/)[1];
  const dark = panelHtml.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/)[1];
  const pairs = [
    ['claro accent/paper', cssVar(root, 'accent'), cssVar(root, 'paper'), 4.5],
    ['claro accent/surface', cssVar(root, 'accent'), cssVar(root, 'surface'), 4.5],
    ['claro accent/soft', cssVar(root, 'accent'), cssVar(root, 'accent-soft'), 4.5],
    ['claro strong/soft', cssVar(root, 'accent-strong'), cssVar(root, 'accent-soft'), 4.5],
    ['claro paper/accent', cssVar(root, 'paper'), cssVar(root, 'accent'), 4.5],
    ['oscuro accent/paper', cssVar(dark, 'accent'), cssVar(dark, 'paper'), 4.5],
    ['oscuro accent/surface', cssVar(dark, 'accent'), cssVar(dark, 'surface'), 4.5],
    ['oscuro accent/soft', cssVar(dark, 'accent'), cssVar(dark, 'accent-soft'), 4.5],
    ['claro line-ui/paper', cssVar(root, 'line-ui'), cssVar(root, 'paper'), 3.2],
    ['claro line-ui/surface', cssVar(root, 'line-ui'), cssVar(root, 'surface'), 3.2],
    ['oscuro line-ui/paper', cssVar(dark, 'line-ui'), cssVar(dark, 'paper'), 3.2],
    ['oscuro line-ui/surface', cssVar(dark, 'line-ui'), cssVar(dark, 'surface'), 3.2]
  ];
  for (const p of pairs) {
    const r = contrast(p[1], p[2]);
    if (r < p[3]) throw new Error(p[0] + ' contrast ' + r.toFixed(2));
  }
  if (!/\.talk \{[^}]*border:\s*1px solid var\(--line-ui\)/.test(panelHtml)) throw new Error('talk border not using line-ui');
  if (!/border:\s*1px solid var\(--line-ui\); border-radius: var\(--radius-sm\)/.test(panelHtml)) throw new Error('inputs not using line-ui');
  if (/focus-visible[^}]*var\(--accent-soft\)/.test(panelHtml)) throw new Error('weak focus ring');
  if (/focus-visible[^}]*var\(--accent-fill\)/.test(panelHtml)) throw new Error('weak focus ring');
  if (!/focus-visible[^}]*var\(--accent\)/.test(panelHtml)) throw new Error('focus ring missing');
  if (!/overflow-wrap:\s*anywhere/.test(panelHtml)) throw new Error('long text can overflow on narrow screens');
});

t('Panel carries the ISS identity and an accessible green palette', () => {
  if (!/var SCHOOL_NAME = 'Instituto Secundario Salsipuedes \(ISS\)';/.test(panelSrc)) throw new Error('SCHOOL_NAME placeholder');
  if (!/var EVENT_NAME = 'Jornada ESI 2026';/.test(panelSrc)) throw new Error('EVENT_NAME');
  for (const needle of ['brand-logo', 'Instituto Secundario Salsipuedes (ISS)',
    'ISS · Jornada ESI 2026', '<title>ISS · Jornada ESI 2026</title>',
    'aria-label="Inicio, Instituto Secundario Salsipuedes"',
    'src="assets/logo.png"',
    '<span class="brand-school">Instituto Secundario Salsipuedes</span>']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
  if (/brand-iss/.test(panelHtml)) throw new Error('header still carries the ISS prefix');
  const logoPath = [path.join(ROOT, '..', 'assets', 'logo.png'),
    path.join(ROOT, 'web', 'assets', 'logo.png'), path.join(ROOT, 'assets', 'logo.png')]
    .find((file) => fs.existsSync(file));
  if (!logoPath) throw new Error('logo.png missing');
  const logo = fs.readFileSync(logoPath);
  if (logo.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('logo.png is not a PNG');
  if (logo.length < 500) throw new Error('logo.png is suspiciously small');
  if (!/@media \(prefers-color-scheme: dark\)[\s\S]*?--accent: #9BD3A6/.test(panelHtml)) throw new Error('dark accent');
});

t('Panel uses a dense desktop admin layout with keyboard shortcuts', () => {
  for (const needle of ['@media (min-width: 1024px)', 'body.admin .wrap { max-width: 1240px',
    'body.admin .filters { display: flex', 'position: sticky; top: 0',
    'body.admin .roster-who { display: flex', 'class="kbd-hint"',
    'function aOnKey_', "if (ev.key === '/')", 'document.addEventListener(\'keydown\', aOnKey_)']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
});

t('Panel stays usable at 360px with 44px targets and safe overflow', () => {
  for (const needle of ['@media (max-width: 380px)', 'overflow-wrap: anywhere',
    'text-overflow: ellipsis', 'min-height: 44px', 'z-index: 50',
    'box-shadow: 0 -8px 24px', 'padding-bottom: calc(128px',
    '100dvh', 'interactive-widget=resizes-content', 'font-size: 16px']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
  if (!/\.present-btn \{[^}]*min-height: 44px/s.test(panelHtml)) throw new Error('present button target');
  if (!/\.present-mini \{[^}]*min-height: 44px/s.test(panelHtml)) throw new Error('present mini target');
  if (!/\.sel-bar \{[^}]*z-index: 50/s.test(panelHtml)) throw new Error('sel bar stacking');
});

t('Access screen follows the 4/8/12/16/24 spacing scale', () => {
  for (const needle of ['class="login-fields"', 'class="field"', 'id="btn-login"',
    'id="input-nombre"', 'id="input-apellido"', 'id="input-dni"', 'id="input-mail"',
    'id="select-anio"', 'id="select-division"',
    'placeholder="usuario@secundariosalsipuedes.edu.ar"', 'placeholder="Solo números"',
    '<h2 class="intro" id="login-title">Ingresar</h2>',
    'Completá tus datos. Si ya te inscribiste, alcanza con el mail o el DNI.',
    '.login-fields { display: grid; gap: 16px; }',
    '.field { display: grid; gap: 8px; }',
    'margin: 0 0 20px', '.seg-btn.active { color: #FFFFFF; background: #0E7A2F; }']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
  if (!/\.steps \{[^}]*margin: 0 0 8px/s.test(panelHtml)) throw new Error('steps gap');
  if (!/h2\.intro \{[^}]*margin: 0 0 12px/s.test(panelHtml)) throw new Error('title gap');
  if (!/p\.hint \{[^}]*margin: 0 0 24px/s.test(panelHtml)) throw new Error('hint gap');
  if (contrast('#0E7A2F', '#FFFFFF') < 4.5) throw new Error('active segment contrast');
  if (!/id="mail-help"/.test(panelHtml)) throw new Error('mail help missing');
  if (!/Tu mail es tu apellido, tu nombre y tu año de egreso/.test(panelHtml)) throw new Error('mail help text missing');
  if (!/2026 \+ \(6 \- año que cursa\)/.test(panelSrc) && !/2026 \+ \(6 - year\)/.test(panelSrc)) throw new Error('mail help formula missing');
  if (!/\-webkit\-line\-clamp: 2/.test(panelHtml)) throw new Error('school name not clamped');
  if (!/\.panel-head \{ flex-wrap: wrap; \}/.test(panelHtml)) throw new Error('panel head does not wrap');
});

function fakeSheet(name, headers, rows) {
  const sh = {
    name: name,
    data: [headers.slice()].concat((rows || []).map((r) => r.slice())),
    getDataRange() {
      return { getValues: () => sh.data.map((r) => r.slice()) };
    },
    appendRow(row) { sh.data.push(row.slice()); },
    getRange(r, c, nr, nc) {
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < (nr || 1); i++) {
            const row = [];
            for (let j = 0; j < (nc || 1); j++) {
              const cell = sh.data[r - 1 + i] || [];
              row.push(cell[c - 1 + j]);
            }
            out.push(row);
          }
          return out;
        },
        setValue: (v) => { sh.data[r - 1][c - 1] = v; },
        setNumberFormat: () => { },
        setValues: (vals) => {
          for (let i = 0; i < vals.length; i++) {
            if (!sh.data[r - 1 + i]) sh.data[r - 1 + i] = [];
            for (let j = 0; j < vals[i].length; j++) sh.data[r - 1 + i][j] = vals[i][j];
          }
        },
        clearContent: () => {
          for (let i = r - 1; i < sh.data.length; i++) sh.data[i] = sh.data[i].map(() => '');
        }
      };
    },
    getLastRow() { return sh.data.length; },
    getLastColumn() { return sh.data[0] ? sh.data[0].length : 0; },
    deleteRow(r) { sh.data.splice(r - 1, 1); },
    setFrozenRows() { },
    clear() { sh.data = [headers.slice()]; },
    clearContent() {
      for (let i = 0; i < sh.data.length; i++) sh.data[i] = sh.data[i].map(() => '');
    },
    clearContents() {
      sh.data = [];
    }
  };
  return sh;
}

function backendStub(props, seed) {
  props = props || {};
  const cache = new Map();
  let uuid = 0;
  const sheets = {
    Config: fakeSheet('Config', ['clave', 'valor'], [['evento_abierto', 'abierto']]),
    Slots: fakeSheet('Slots', ['id', 'nombre', 'inicio', 'fin', 'orden'], [
      [1, '1ra', '10:30', '11:20', 1],
      [2, '2da', '11:30', '12:20', 2],
      [3, '3ra', '12:30', '13:30', 3]
    ]),
    Talks: fakeSheet('Talks', ['id', 'titulo', 'ciclo', 'slot_id', 'lugar', 'cupo', 'activa'], [
      ['B1', 'Charla uno', 'basico', 1, 'Aula 1', 40, 'si'],
      ['B2', 'Charla dos', 'basico', 2, 'Aula 2', 40, 'si'],
      ['O1', 'Charla tres', 'orientado', 3, 'Aula 3', 40, 'si']
    ]),
    Students: fakeSheet('Students', ['email', 'nombre', 'curso'], (seed && seed.students) || [
      ['ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B'],
      ['beto@secundariosalsipuedes.edu.ar', 'Beto Sanchez', '5°Turismo'],
      ['carla@secundariosalsipuedes.edu.ar', 'Carla Diaz', '3°A']
    ]),
    Mails: fakeSheet('Mails', ['email', 'fecha', 'asunto'], []),
    Signups: fakeSheet('Signups', ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id', 'recordatorio'],
      (seed && seed.signups) || [
        ['s1', new Date(), 'ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', 'basico', 1, 'B1', true],
        ['s2', new Date(), 'beto@secundariosalsipuedes.edu.ar', 'Beto Sanchez', '5°Turismo', 'orientado', 2, 'B2', true],
        ['s3', new Date(), 'carla@secundariosalsipuedes.edu.ar', 'Carla Diaz', '3°A', 'basico', 3, 'O1', true]
      ])
  };
  const fakeProps = {
    getProperty: (k) => (k in props ? props[k] : null),
    setProperty: (k, v) => { props[k] = String(v); },
    deleteProperty: (k) => { delete props[k]; }
  };
  const spreadsheet = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = fakeSheet(n, [], []); return sheets[n]; },
    getSpreadsheetTimeZone: () => 'America/Argentina/Cordoba',
    toast: () => { }
  };
  return {
    props: props,
    cache: cache,
    sheets: sheets,
    PropertiesService: { getScriptProperties: () => fakeProps },
    LockService: { getScriptLock: () => ({ waitLock: function () { }, releaseLock: function () { } }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => { cache.set(k, v); },
        remove: (k) => { cache.delete(k); }
      })
    },
    SpreadsheetApp: { getActive: () => spreadsheet },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => 'uuid-' + (++uuid),
      formatDate: (d) => '01/01 10:00',
      computeDigest: (algo, value) => Array.from(
        crypto.createHash('sha256').update(String(value)).digest()
      )
    }
  };
}

function loginTicketFor(services, email, nombre, curso, apellido) {
  const api = backendApi(services, 'issueLoginTicket_');
  return api.issueLoginTicket_({ email: email, nombre: nombre, curso: curso, apellido: apellido || '' });
}

function backendApi(services, names) {
  const src = names.split(',').map((n) => n.trim());
  const body = src.map((n) => n + ': ' + n).join(',');
  return new Function('PropertiesService', 'LockService', 'CacheService', 'SpreadsheetApp', 'Utilities', 'MailApp',
    codeSrc + '\nreturn {' + body + '};')(
    services.PropertiesService, services.LockService, services.CacheService,
    services.SpreadsheetApp, services.Utilities, services.MailApp);
}

t('Landing opens with the event poster and a primary call to action', () => {
  for (const needle of ['id="btn-hero-start"', 'Reservar mi lugar', 'class="hero-poster"',
    'class="poster-day">04', '10:30', '11:30', '12:30', 'Elegí tus charlas.']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
  if (!/btn-hero-start[\s\S]*?s-screen-mail[\s\S]*?scrollIntoView/.test(panelSrc)) {
    throw new Error('hero CTA does not go to the login form');
  }
  if (!/\.hero-grid \{[^}]*display: grid/s.test(panelHtml)) throw new Error('hero grid missing');
});

t('Login asks for nombre before apellido', () => {
  const nombre = panelHtml.indexOf('id="input-nombre"');
  const apellido = panelHtml.indexOf('id="input-apellido"');
  if (nombre < 0 || apellido < 0 || nombre > apellido) {
    throw new Error('nombre must come before apellido');
  }
  if (!/function sUseLoginData_[\s\S]*?needsNombre[\s\S]*?input-nombre'\)\.focus\(\)/s.test(panelSrc)) {
    throw new Error('focus order does not start with nombre');
  }
});

t('Access screen starts with one Ingresar gate and a separate form', () => {
  for (const needle of ['id="s-screen-mail"', 'id="btn-login-start"',
    'id="s-screen-login"', 'id="login-form" class="login-form"',
    'id="login-intro"', 'id="btn-login"', 'id="btn-login-back"',
    'role="status" aria-live="polite"',
    'aria-describedby="mail-hint"', 'enterkeyhint="go"', 'function sLoginSubmit',
    'function sSetLoginBusy_', 'function sMailError_', 'aria-invalid']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
  const gate = panelHtml.match(/<section id="s-screen-mail"[\s\S]*?<\/section>/);
  if (!gate) throw new Error('login gate missing');
  if (!/id="btn-login-start"/.test(gate[0])) throw new Error('gate has no Ingresar button');
  if (/id="login-form"/.test(gate[0])) throw new Error('form is still inside the gate');
  if (!/btn-login-start'\)\.addEventListener\('click'[\s\S]*?s-screen-login/.test(panelSrc)) {
    throw new Error('gate does not open the form screen');
  }
  if (!/btn-login-back'\)\.addEventListener\('click'[\s\S]*?s-screen-mail/.test(panelSrc)) {
    throw new Error('form has no back button');
  }
  if (!/S_SCREENS = \['s-screen-mail', 's-screen-login', 's-screen-hello', 's-screen-panel'\]/.test(panelSrc)) {
    throw new Error('login screen is not in S_SCREENS');
  }
  if (/id="login-form"[^>]*hidden/.test(panelHtml)) throw new Error('login form is hidden');
  if (!/function sSalir\(\)[\s\S]*?s-screen-mail[\s\S]*?btn-login-start'\)\.focus\(\)/.test(panelSrc)) {
    throw new Error('Salir does not return to the gate');
  }
  if (!/function sHelloNo\(\)[\s\S]*?s-screen-login[\s\S]*?input-mail'\)\.focus\(\)/.test(panelSrc)) {
    throw new Error('No soy yo does not return to the form');
  }
  if (!/EsiClient\.isInstitutionalEmail\(email\)/.test(panelSrc)) {
    throw new Error('mail is not validated before the call');
  }
  if (!/function sLoginSubmit\(\)[\s\S]*?sLookup\(\)[\s\S]*?sLookupDni\(\)/.test(panelSrc)) {
    throw new Error('login submit does not choose mail or DNI');
  }
  if (!/\$\('login-form'\)\.addEventListener\('submit'/.test(panelSrc)) {
    throw new Error('login form has no submit handler');
  }
});

t('Code.gs has two roles and a separate guide key', () => {
  if (!/GUIDE_PIN_PROP\s*=\s*'GUIDE_PIN'/.test(codeSrc)) throw new Error('guide pin property missing');
  if (!/function ensureGuidePin_/.test(codeSrc)) throw new Error('ensureGuidePin_ missing');
  if (!/ROLE_ADMIN\s*=\s*'admin'/.test(codeSrc)) throw new Error('admin role missing');
  if (!/ROLE_GUIDE\s*=\s*'guide'/.test(codeSrc)) throw new Error('guide role missing');
  if (!/setup\(\)[\s\S]{0,2000}ensureGuidePin_\(\)/.test(codeSrc)) throw new Error('setup does not create guide pin');
  if (/\[.'admin_pin',/.test(codeSrc) || /\[.'guide_pin',/.test(codeSrc)) throw new Error('pin seeded in sheet');
});

t('Code.gs resolves the role from the key and keeps it in the token', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  const api = backendApi(services, 'adminAuth_, apiAdminLogin');
  assertEq(api.adminAuth_('1111').role, 'admin', 'admin role');
  assertEq(api.adminAuth_('2222').role, 'guide', 'guide role');
  assertEq(api.adminAuth_('3333').ok, false, 'wrong key');
  const login = api.apiAdminLogin('2222');
  assertEq(login.ok, true, 'guide login');
  assertEq(login.role, 'guide', 'guide role in login');
  if (!login.token) throw new Error('no token issued');
  assertEq(api.adminAuth_(login.token).role, 'guide', 'role kept in token');
  const adminLogin = api.apiAdminLogin('1111');
  assertEq(api.adminAuth_(adminLogin.token).role, 'admin', 'admin role in token');
});

t('Code.gs blocks write actions for the guide role', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  const api = backendApi(services, 'apiAdminSetOpen, apiAdminDeleteSignup, apiAdminImportRoster');
  const setOpen = api.apiAdminSetOpen('2222', false);
  assertEq(setOpen.ok, false, 'guide cannot close signup');
  if (!/no permite esta acción/.test(setOpen.message)) throw new Error('message: ' + setOpen.message);
  const del = api.apiAdminDeleteSignup('2222', 'x');
  assertEq(del.ok, false, 'guide cannot delete');
  const imp = api.apiAdminImportRoster('2222', 'a@b.co', 'agregar');
  assertEq(imp.ok, false, 'guide cannot import');
  const noKey = api.apiAdminSetOpen('', false);
  assertEq(noKey.ok, false, 'no key');
  if (!/Clave incorrecta/.test(noKey.message)) throw new Error('no key message: ' + noKey.message);
});

t('Code.gs guide payload has no signup list', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  const api = backendApi(services, 'apiAdminGetData');
  const noKey = api.apiAdminGetData('');
  assertEq(noKey.ok, false, 'no key rejected');
  const guideData = api.apiAdminGetData('2222');
  assertEq(guideData.ok, true, 'guide can read');
  assertEq(guideData.role, 'guide', 'role in payload');
  assertEq(guideData.signups.length, 0, 'guide gets no full signup list');
  if (JSON.stringify(guideData).indexOf('@') >= 0) throw new Error('guide payload leaks a mail');
  const adminData = api.apiAdminGetData('1111');
  assertEq(adminData.signups.length, 3, 'admin sees the signups');
  assertEq(adminData.signups[0].email, 'ana@secundariosalsipuedes.edu.ar', 'admin sees the mails');
});

t('Code.gs counts unique students separately from reservations', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminGetData, apiAdminStatus');
  const admin = api.apiAdminGetData('1111');
  assertEq(admin.total, 6, 'admin sees reservations');
  assertEq(admin.studentCount, 3, 'admin sees unique students');
  assertEq(admin.porCiclo.basico, 3, 'cycle counts unique students');
  const guide = api.apiAdminGetData('2222');
  assertEq(guide.total, 6, 'guide sees reservation total');
  assertEq(guide.studentCount, 3, 'guide sees unique students');
  assertEq(guide.signups.length, 0, 'guide still gets no list');
  if (JSON.stringify(guide).indexOf('@') >= 0) throw new Error('guide totals leak a mail');
  const status = api.apiAdminStatus('1111');
  assertEq(status.total, 6, 'status reservations');
  assertEq(status.student_count, 3, 'status unique students');
});

t('Code.gs lookup accepts an institutional mail without a roster', () => {
  const services = backendStub({});
  services.sheets.Students = fakeSheet('Students', ['email', 'nombre', 'curso'], []);
  const api = backendApi(services, 'apiLookup');
  const r = api.apiLookup('ana@secundariosalsipuedes.edu.ar');
  assertEq(r.ok, true, 'lookup ok');
  assertEq(r.nombre, '', 'lookup never invents a name');
  assertEq(r.curso, '', 'lookup never invents a course');
  assertEq(r.needsNombre, true, 'name needed');
  assertEq(r.needsApellido, true, 'surname needed');
  assertEq(r.needsCurso, true, 'course needed');
  assertEq(r.rosterLoaded, false, 'roster state exposed');
  const out = api.apiLookup('nadie@secundariosalsipuedes.edu.ar');
  assertEq(out.ok, true, 'any institutional mail can enter');
  const bad = api.apiLookup('nadie@gmail.com');
  assertEq(bad.ok, false, 'external mail rejected');
  if (JSON.stringify([r, out]).indexOf('@') >= 0) throw new Error('lookup leaks a mail');
});

t('Code.gs guide reads of the new views never leak mails', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  const api = backendApi(services, 'apiAdminTalkRoster, apiAdminPending');
  const roster = api.apiAdminTalkRoster('2222', 'B1');
  assertEq(roster.ok, true, 'guide can read talk roster');
  const pending = api.apiAdminPending('2222');
  assertEq(pending.ok, true, 'guide can read pending');
  if (JSON.stringify(roster).indexOf('@') >= 0) throw new Error('talk roster leaks mail');
  if (JSON.stringify(pending).indexOf('@') >= 0) throw new Error('pending leaks mail');
});

t('Code.gs caches reads and invalidates on writes', () => {
  if (!/DATA_CACHE_TTL\s*=\s*12/.test(codeSrc)) throw new Error('cache ttl missing');
  if (!/function readSignupsCached_/.test(codeSrc)) throw new Error('cached signups missing');
  if (!/function readStudentsCached_/.test(codeSrc)) throw new Error('cached students missing');
  if (!/function invalidateDataCache_/.test(codeSrc)) throw new Error('invalidate missing');
  const writes = codeSrc.match(/invalidateDataCache_\(\);/g) || [];
  if (writes.length < 3) throw new Error('cache not invalidated on every write');
});

t('Code.gs pending list tells which slots each student is missing', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  const api = backendApi(services, 'apiAdminPending');
  const r = api.apiAdminPending('1111');
  assertEq(r.ok, true, 'pending ok');
  assertEq(r.total, 3, 'roster size');
  assertEq(r.pending, 3, 'three pending');
  const names = r.students.map((s) => s.nombre);
  assertEq(names[0], 'Carla Diaz', 'sorted by surname');
  const ana = r.students.filter((s) => s.nombre === 'Ana Gomez')[0];
  assertEq(ana.faltan.join(','), '2da,3ra', 'missing slots');
  assertEq(ana.curso, '2°B', 'course kept');
});

t('Code.gs talk roster counts and sorts by surname', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  const api = backendApi(services, 'apiAdminTalkRoster');
  const r = api.apiAdminTalkRoster('1111', 'B1');
  assertEq(r.ok, true, 'talk roster ok');
  assertEq(r.count, 1, 'count');
  assertEq(r.talk.cupo, 40, 'cupo');
  assertEq(r.students[0].nombre, 'Ana Gomez', 'student in talk');
  assertEq(r.students[0].email, 'ana@secundariosalsipuedes.edu.ar', 'admin sees the mail');
  const missing = api.apiAdminTalkRoster('1111', 'NOPE');
  assertEq(missing.ok, false, 'unknown talk');
});

t('Code.gs marks attendance under lock and counts it per talk', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  const calls = [];
  services.LockService = {
    getScriptLock: () => ({
      waitLock: () => calls.push('lock'),
      releaseLock: () => calls.push('unlock')
    })
  };
  const api = backendApi(services, 'apiAdminSetPresent, apiAdminTalkRoster');
  const first = api.apiAdminSetPresent('2222', 's1', true);
  assertEq(first.ok, true, 'guide can mark attendance');
  if (calls.indexOf('lock') < 0) throw new Error('write without lock');
  const roster = api.apiAdminTalkRoster('2222', 'B1');
  assertEq(roster.presentes, 1, 'present counter');
  assertEq(roster.students[0].presente, true, 'student marked');
  const second = api.apiAdminSetPresent('2222', 's1', false);
  assertEq(second.ok, true, 'unmark');
  const after = api.apiAdminTalkRoster('2222', 'B1');
  assertEq(after.presentes, 0, 'counter back to zero');
  assertEq(after.students[0].presente, false, 'student unmarked');
  const missing = api.apiAdminSetPresent('2222', 'nope', true);
  assertEq(missing.ok, false, 'unknown signup');
  const noKey = api.apiAdminSetPresent('', 's1', true);
  assertEq(noKey.ok, false, 'no key');
});

t('Code.gs writes attendance after taking the lock', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  const calls = [];
  services.LockService = {
    getScriptLock: () => ({
      waitLock: () => calls.push('lock'),
      releaseLock: () => calls.push('unlock')
    })
  };
  const sh = services.sheets.Signups;
  const setValue = sh.getRange.bind(sh);
  sh.getRange = (r, c) => {
    const range = setValue(r, c);
    const original = range.setValue;
    range.setValue = (v) => { calls.push('write'); original(v); };
    return range;
  };
  const api = backendApi(services, 'apiAdminSetPresent');
  api.apiAdminSetPresent('1111', 's1', true);
  if (calls.indexOf('lock') > calls.indexOf('write')) {
    throw new Error('write happened before the lock: ' + calls.join(','));
  }
  if (calls.indexOf('write') < 0) throw new Error('no write');
});

t('Code.gs exposes the attendance column and the attendance api', () => {
  if (!/function ensureColumn_/.test(codeSrc)) throw new Error('ensureColumn_ missing');
  if (!/apiAdminSetPresent: apiAdminSetPresent/.test(codeSrc)) throw new Error('api not in map');
  if (!/'presente'/.test(codeSrc)) throw new Error('presente column missing');
  if (!/presentes: presentes/.test(codeSrc)) throw new Error('present counter missing');
});


t('parseRoster accepts separate surname and name columns', () => {
  const txt = [
    'mail;apellido;nombre;curso',
    'ana@secundariosalsipuedes.edu.ar;Gómez;Ana;2B',
    'beto@secundariosalsipuedes.edu.ar;Díaz;Beto;5Turismo'
  ].join('\n');
  const r = Core.parseRoster(txt);
  assertEq(r.rows.length, 2);
  assertEq(r.rows[0].apellido, 'Gómez');
  assertEq(r.rows[0].nombre, 'Ana');
  assertEq(r.rows[0].nombreCompleto, 'Ana Gómez');
  assertEq(r.rows[0].curso, '2°B');
  assertEq(r.rows[1].apellido, 'Díaz');
});

t('parseRoster keeps a full name as is and never guesses the surname', () => {
  const txt = 'mail;nombre;curso\nana@secundariosalsipuedes.edu.ar;Ana María Gómez;2B';
  const r = Core.parseRoster(txt);
  assertEq(r.rows[0].apellido, '');
  assertEq(r.rows[0].nombre, 'Ana María Gómez');
  assertEq(r.rows[0].nombreCompleto, 'Ana María Gómez');
});

t('parseRoster accepts positional separate columns without header', () => {
  const r = Core.parseRoster('ana@secundariosalsipuedes.edu.ar;Gómez;Ana;2B');
  assertEq(r.rows[0].apellido, 'Gómez');
  assertEq(r.rows[0].nombre, 'Ana');
  assertEq(r.rows[0].nombreCompleto, 'Ana Gómez');
});

t('parseRoster leaves the name empty when the line only has a mail', () => {
  const r = Core.parseRoster('ana@secundariosalsipuedes.edu.ar');
  assertEq(r.rows[0].nombre, '');
  assertEq(r.rows[0].apellido, '');
  assertEq(r.rows[0].nombreCompleto, '');
});

t('sortBySurname_ orders by surname and then by name', () => {
  const services = backendStub({});
  const api = backendApi(services, 'sortBySurname_');
  const list = [
    { apellido: 'Gómez', nombre: 'Beto', email: 'b@e.co' },
    { apellido: 'Díaz', nombre: 'Carla', email: 'c@e.co' },
    { apellido: 'Gómez', nombre: 'Ana', email: 'a@e.co' }
  ];
  const out = api.sortBySurname_(list);
  assertEq(out[0].nombre, 'Carla');
  assertEq(out[1].nombre, 'Ana');
  assertEq(out[2].nombre, 'Beto');
});

t('sortBySurname_ keeps a legacy full name untouched but sorts by its last word', () => {
  const services = backendStub({});
  const api = backendApi(services, 'sortBySurname_');
  const list = [
    { nombre: 'Ana Gómez', email: 'a@e.co' },
    { nombre: 'Beto Díaz', email: 'b@e.co' }
  ];
  const out = api.sortBySurname_(list);
  assertEq(out[0].nombre, 'Beto Díaz');
  assertEq(out[0].apellido === undefined || out[0].apellido === '', true);
});

t('apiBootstrap reports an empty roster and open signup', () => {
  const services = backendStub({});
  services.sheets.Students = fakeSheet('Students', ['email', 'nombre', 'curso'], []);
  const api = backendApi(services, 'apiBootstrap');
  const r = api.apiBootstrap();
  assertEq(r.ok, true);
  assertEq(r.rosterLoaded, false);
  assertEq(r.evento_abierto, true);
});

t('apiAdminImportRoster writes surname, name and the optional DNI', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  const api = backendApi(services, 'apiAdminImportRoster, readStudents_');
  const r = api.apiAdminImportRoster('1111', 'mail;apellido;nombre;curso;dni\nd@secundariosalsipuedes.edu.ar;Díaz;Dora;3A;12.345.678', 'agregar');
  assertEq(r.ok, true);
  const head = services.sheets.Students.data[0];
  assertEq(head.join(','), 'email,apellido,nombre,curso,dni');
  const saved = api.readStudents_().filter((s) => s.email === 'd@secundariosalsipuedes.edu.ar')[0];
  assertEq(saved.apellido, 'Díaz');
  assertEq(saved.nombre, 'Dora');
  assertEq(saved.nombreCompleto, 'Dora Díaz');
  assertEq(saved.dni, '12345678');
});

t('apiAdminImportRoster drops duplicate DNIs and reports them', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  const api = backendApi(services, 'apiAdminImportRoster, readStudents_');
  const r = api.apiAdminImportRoster('1111',
    'ana@secundariosalsipuedes.edu.ar;Gómez;Ana;2B;12345678\nbeto@secundariosalsipuedes.edu.ar;Díaz;Beto;2B;12345678', 'agregar');
  assertEq(r.dnisDuplicados, 1);
  const rows = api.readStudents_();
  assertEq(rows[0].dni, '12345678');
  assertEq(rows[1].dni, '', 'duplicate dni cleared');
});

t('parseRoster reads an optional DNI column and rejects duplicates', () => {
  const r = Core.parseRoster('mail;apellido;nombre;curso;dni\n'
    + 'ana@secundariosalsipuedes.edu.ar;Gómez;Ana;2°B;12.345.678\n'
    + 'beto@secundariosalsipuedes.edu.ar;Díaz;Beto;2°B;12345678\n'
    + 'caro@secundariosalsipuedes.edu.ar;Paz;Caro;2°B;999\n');
  assertEq(r.rows.length, 3);
  assertEq(r.rows[0].dni, '12345678');
  assertEq(r.rows[1].dni, '', 'duplicate dni dropped');
  assertEq(r.dnisDuplicados, 1);
  assertEq(r.rows[2].dni, '', 'invalid dni dropped');
});

t('parseRoster accepts a documento header in any order', () => {
  const r = Core.parseRoster('Curso;DNI;Mail;Apellido;Nombre\n2B;30111222;ana@secundariosalsipuedes.edu.ar;Gómez;Ana');
  assertEq(r.rows[0].dni, '30111222');
  assertEq(r.rows[0].curso, '2°B');
  assertEq(r.rows[0].apellido, 'Gómez');
});

t('CSV keeps the mail last and includes the attendance columns', () => {
  if (!/\[\['Apellido', 'Nombre', 'Curso', 'Horario', 'Charla', 'Lugar', 'Presente', 'Mail'\]\]/.test(panelSrc)) {
    throw new Error('csv header changed');
  }
  if (!/s\.presente \? 'si' : 'no'/.test(panelSrc)) throw new Error('csv present column missing');
});


function reportSeed(services) {
  services.sheets.Students = fakeSheet('Students', ['email', 'apellido', 'nombre', 'curso'], [
    ['ana@secundariosalsipuedes.edu.ar', 'Gómez', 'Ana', '2°B'],
    ['beto@secundariosalsipuedes.edu.ar', 'Díaz', 'Beto', '2°B'],
    ['carla@secundariosalsipuedes.edu.ar', 'Sosa', 'Carla', '2°B'],
    ['dora@secundariosalsipuedes.edu.ar', 'Paz', 'Dora', '5°Turismo']
  ]);
  services.sheets.Signups = fakeSheet('Signups', ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id', 'presente', 'apellido', 'recordatorio'], [
    ['s1', new Date(), 'ana@secundariosalsipuedes.edu.ar', 'Ana Gómez', '2°B', 'basico', 1, 'B1', 'si', 'Gómez', true],
    ['s2', new Date(), 'ana@secundariosalsipuedes.edu.ar', 'Ana Gómez', '2°B', 'basico', 2, 'B2', 'no', 'Gómez', true],
    ['s3', new Date(), 'ana@secundariosalsipuedes.edu.ar', 'Ana Gómez', '2°B', 'basico', 3, 'O1', 'si', 'Gómez', true],
    ['s4', new Date(), 'beto@secundariosalsipuedes.edu.ar', 'Beto Díaz', '2°B', 'basico', 1, 'B1', 'no', 'Díaz', true],
    ['s5', new Date(), 'beto@secundariosalsipuedes.edu.ar', 'Beto Díaz', '2°B', 'basico', 2, 'B2', 'si', 'Díaz', true],
    ['s6', new Date(), 'carla@secundariosalsipuedes.edu.ar', 'Carla Sosa', '2°B', 'basico', 1, 'B1', 'no', 'Sosa', true]
  ]);
}

t('apiAdminReports computes totals from signups, without a roster', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  services.sheets.Students = fakeSheet('Students', ['email', 'nombre', 'curso'], []);
  const api = backendApi(services, 'apiAdminReports');
  const r = api.apiAdminReports('1111');
  assertEq(r.ok, true);
  assertEq(r.rosterLoaded, true);
  assertEq(r.totals.roster, 3);
  assertEq(r.totals.complete, 1);
  assertEq(r.totals.incomplete, 2);
  assertEq(r.totals.missing, 0);
  assertEq(r.totals.presentBySlot[0].presentes, 1);
  assertEq(r.courses.length, 1);
  const curso = r.courses.filter((c) => c.curso === '2°B')[0];
  assertEq(curso.roster, 3);
  assertEq(curso.complete, 1);
  assertEq(curso.incomplete, 2);
  assertEq(curso.missing, 0);
  assertEq(curso.presentBySlot[1].presentes, 1);
});

t('apiAdminReports sorts each course by surname and lists the three slots', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminReports');
  const curso = api.apiAdminReports('1111').courses.filter((c) => c.curso === '2°B')[0];
  assertEq(curso.students[0].apellido, 'Díaz');
  assertEq(curso.students[1].apellido, 'Gómez');
  assertEq(curso.students[2].apellido, 'Sosa');
  const ana = curso.students.filter((st) => st.email === 'ana@secundariosalsipuedes.edu.ar')[0];
  assertEq(ana.talks.length, 3);
  assertEq(ana.talks[0].titulo, 'Charla uno');
  assertEq(ana.talks[0].presente, true);
  assertEq(ana.talks[1].presente, false);
  assertEq(ana.talks[2].titulo, 'Charla tres');
  assertEq(ana.count, 3);
});

t('apiAdminMailPreview prepares a reminder only for signed-up students', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminMailPreview');
  assertEq(api.apiAdminMailPreview('').ok, false, 'preview needs a key');
  const p = api.apiAdminMailPreview('1111');
  assertEq(p.ok, true, 'preview ok');
  assertEq(p.total, 3, 'three unique recipients');
  if (!/4 de noviembre de 2026/.test(p.subject)) throw new Error('date missing from subject');
  if (!/Tus charlas:/.test(p.sample.body)) throw new Error('body missing schedule');
  if (!/Charla uno/.test(p.sample.body)) throw new Error('body missing chosen talk');
  if (/@/.test(p.sample.body)) throw new Error('body should not expose mails');
  assertEq(p.quota, -1, 'no MailApp means no quota');
  assertEq(api.apiAdminMailPreview('2222').ok, false, 'guide cannot mail');
});

t('apiAdminSendReminders does not resend a subject already sent', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  reportSeed(services);
  const subject = 'Recordatorio: Jornada ESI 2026 del 4 de noviembre de 2026';
  services.sheets.Mails.appendRow(['beto@secundariosalsipuedes.edu.ar', new Date(), subject]);
  const out = [];
  services.MailApp = {
    getRemainingDailyQuota: () => 50,
    sendEmail: (msg) => { out.push(msg); }
  };
  const api = backendApi(services, 'apiAdminMailPreview, apiAdminSendReminders');
  const preview = api.apiAdminMailPreview('1111');
  assertEq(preview.pending, 2, 'already sent excluded');
  const first = api.apiAdminSendReminders('1111', 0, 2);
  assertEq(first.sent, 1, 'one new mail');
  assertEq(first.skipped, 1, 'one skipped');
  assertEq(first.done, false, 'third still pending');
  const second = api.apiAdminSendReminders('1111', first.nextOffset, 20);
  assertEq(second.sent, 1, 'last new mail');
  assertEq(second.done, true, 'finished');
  assertEq(out.length, 2, 'no duplicate send');
  assertEq(out[0].to, 'ana@secundariosalsipuedes.edu.ar', 'skipped surname goes next');
});

t('apiAdminSendReminders sends in batches and respects quota', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  reportSeed(services);
  const out = [];
  services.MailApp = {
    getRemainingDailyQuota: () => 50,
    sendEmail: (msg) => { out.push(msg); }
  };
  const api = backendApi(services, 'apiAdminSendReminders');
  assertEq(api.apiAdminSendReminders('', 0, 20).ok, false, 'send needs a key');
  assertEq(api.apiAdminSendReminders('2222', 0, 20).ok, false, 'guide cannot send');
  const first = api.apiAdminSendReminders('1111', 0, 2);
  assertEq(first.ok, true, 'first batch ok');
  assertEq(first.sent, 2, 'first batch size');
  assertEq(first.done, false, 'more left');
  assertEq(out.length, 2, 'two mails sent');
  assertEq(out[0].to, 'beto@secundariosalsipuedes.edu.ar', 'surname order');
  if (!/Hola Beto:/.test(out[0].body)) throw new Error('body not personalised');
  const second = api.apiAdminSendReminders('1111', first.nextOffset, 20);
  assertEq(second.sent, 1, 'last batch size');
  assertEq(second.done, true, 'all sent');
  assertEq(new Set(out.map((m) => m.to)).size, 3, 'no duplicate recipients');
  services.MailApp.getRemainingDailyQuota = () => 0;
  const none = api.apiAdminSendReminders('1111', 0, 20);
  assertEq(none.ok, false, 'quota exhausted');
});

t('apiAdminGetConfig and apiAdminSetConfig validate admin changes', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  const api = backendApi(services, 'apiAdminGetConfig, apiAdminSetConfig');
  assertEq(api.apiAdminGetConfig('').ok, false, 'config needs a key');
  assertEq(api.apiAdminGetConfig('2222').ok, false, 'guide cannot read config');
  const before = api.apiAdminGetConfig('1111');
  assertEq(before.ok, true, 'admin reads config');
  assertEq(before.event.fecha, '2026-11-04', 'default date');
  const saved = api.apiAdminSetConfig('1111', {
    evento_fecha: '2026-11-05',
    evento_zona: 'America/Argentina/Buenos_Aires',
    evento_abierto: false
  });
  assertEq(saved.ok, true, 'config saved');
  assertEq(saved.event.fecha, '2026-11-05', 'date saved');
  assertEq(saved.event.zona, 'America/Argentina/Buenos_Aires', 'zone saved');
  assertEq(saved.evento_abierto, false, 'closed saved');
  assertEq(api.apiAdminSetConfig('1111', { evento_fecha: '05/11/2026' }).ok, false, 'bad date rejected');
  assertEq(api.apiAdminSetConfig('1111', { evento_zona: 'bad zone!' }).ok, false, 'bad zone rejected');
  assertEq(api.apiAdminSetConfig('2222', { evento_fecha: '2026-11-05' }).ok, false, 'guide cannot write');
});

t('apiAdminReports rejects requests without a key or token', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminReports');
  const r = api.apiAdminReports('');
  assertEq(r.ok, false);
  assertEq(/Clave incorrecta/.test(r.message), true);
});

t('apiAdminReports never sends mails to the guide role', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminReports');
  const admin = api.apiAdminReports('1111');
  assertEq(admin.courses[0].students[0].email, 'beto@secundariosalsipuedes.edu.ar');
  const guide = api.apiAdminReports('2222');
  assertEq(guide.ok, true);
  assertEq(guide.role, 'guide');
  if (JSON.stringify(guide).indexOf('@') >= 0) throw new Error('guide report leaks a mail');
  if (guide.courses[0].students[0].email) throw new Error('guide report has email field');
  assertEq(guide.courses[0].students[0].apellido, 'Díaz');
});

t('Panel exposes the reports tab and the print button', () => {
  for (const needle of ['tab-reportes', 'pane-reportes', 'rep-tab-curso', 'rep-tab-charla', 'rep-tab-total', 'rep-curso', 'rep-out', 'btn-print']) {
    if (!panelHtml.includes(needle) && !panelSrc.includes(needle)) throw new Error('missing ' + needle);
  }
  if (!/apiAdminReports/.test(panelSrc)) throw new Error('panel does not call the report api');
});


t('apiAdminReports computes per-talk seats, attendance and course breakdown', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminReports');
  const r = api.apiAdminReports('1111');
  assertEq(r.talks.length, 3);
  const b1 = r.talks.filter((t) => t.id === 'B1')[0];
  assertEq(b1.anotados, 3);
  assertEq(b1.presentes, 1);
  assertEq(b1.ausentes, 2);
  assertEq(b1.cupo, 40);
  assertEq(b1.slotLabel, '10:30 a 11:20');
  assertEq(b1.porCurso.length, 1);
  assertEq(b1.porCurso[0].curso, '2°B');
  assertEq(b1.porCurso[0].anotados, 3);
  assertEq(b1.students[0].apellido, 'Díaz');
  assertEq(b1.students[1].apellido, 'Gómez');
  const b2 = r.talks.filter((t) => t.id === 'B2')[0];
  assertEq(b2.anotados, 2);
  assertEq(b2.presentes, 1);
  assertEq(b2.ausentes, 1);
});

t('apiAdminReports talk rows respect the guide role', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminReports');
  const guide = api.apiAdminReports('2222');
  if (JSON.stringify(guide.talks).indexOf('@') >= 0) throw new Error('guide talk report leaks a mail');
  if (guide.talks[0].students[0].email) throw new Error('guide talk student has email');
  assertEq(guide.talks[0].students[0].apellido, 'Díaz');
});


t('apiAdminReports keeps overall totals for the total report', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const api = backendApi(services, 'apiAdminReports');
  const r = api.apiAdminReports('1111');
  assertEq(r.totals.roster, 3);
  assertEq(r.totals.signups, 6);
  assertEq(r.totals.presentBySlot.length, 3);
  assertEq(r.totals.presentBySlot[0].slot, '1ra');
  assertEq(r.totals.presentBySlot[0].label, '10:30 a 11:20');
  const sum = r.talks.reduce((acc, t) => acc + t.anotados, 0);
  assertEq(sum, 6);
  const present = r.talks.reduce((acc, t) => acc + t.presentes, 0);
  assertEq(present, 3);
});

t('Panel renders the total report with a summary line', () => {
  for (const needle of ['aRenderTotalReport', 'sumAnotados', 'sumPresentes', 'sumCupo', 'Total: ']) {
    if (!panelSrc.includes(needle)) throw new Error('missing ' + needle);
  }
});


t('Panel prints A4 reports with a signature column and page breaks', () => {
  for (const needle of ['@page { size: A4 portrait;', 'window.print()', 'id="print-area"',
    'Firma o presente', 'break-after: page', 'btn-print', 'SCHOOL_NAME', 'EVENT_NAME',
    'Jornada ESI 2026', 'display: table-header-group']) {
    if (!panelHtml.includes(needle) && !panelSrc.includes(needle)) throw new Error('missing ' + needle);
  }
  if (!/var SCHOOL_NAME = 'Instituto Secundario Salsipuedes \(ISS\)';/.test(panelSrc)) throw new Error('SCHOOL_NAME is not the ISS name');
  if (!/@media print[\s\S]*?#nav, \.sel-bar, \.tabs, \.admin-actions, \.filters, button \{ display: none !important; \}/.test(panelHtml)) {
    throw new Error('print does not hide chrome');
  }
  if (/#print-area, #print-area \* \{[\s\S]*?color: #000 !important/.test(panelHtml) === false) {
    throw new Error('print does not force black ink');
  }
  if (!/function printDate_[\s\S]*?getHours\(\)[\s\S]*?getMinutes\(\)/.test(panelSrc)) {
    throw new Error('print date misses the time');
  }
  if (/print-table th \{[^}]*background: #eee/.test(panelHtml)) throw new Error('print keeps a gray header');
});

t('Panel keeps the closed sheet out of the tab order and announces errors', () => {
  if (!/\.sheet \{[^}]*visibility: hidden/s.test(panelHtml)) throw new Error('closed sheet is still focusable');
  if (!/\.sheet\.show \{[^}]*visibility: visible/s.test(panelHtml)) throw new Error('open sheet is hidden');
  if (!/id="sheet"[^>]*aria-hidden="true"/.test(panelHtml)) throw new Error('sheet aria-hidden missing');
  if (!/setAttribute\('aria-hidden', 'false'\)/.test(panelSrc)) throw new Error('sheet not exposed on open');
  if (!/id="gate-msg"[^>]*role="alert"/.test(panelHtml)) throw new Error('gate message is not announced');
  if (!/#gate-msg:empty \{ display: none; \}/.test(panelHtml)) throw new Error('empty gate error is visible');
});

t('Panel ignores stale talk loads and keeps focus after rerender', () => {
  if (!/function aLoadTalk\(\)[\s\S]*?if \(talkId !== aTalkId\) return;/.test(panelSrc)) {
    throw new Error('stale talk response not ignored');
  }
  if (!/function aRenderTalk\(\)[\s\S]*?focusId[\s\S]*?buttons\[b\]\.focus/.test(panelSrc)) {
    throw new Error('focus not restored after rerender');
  }
});

t('Panel clears offline talk caches on logout and erase', () => {
  if (!/function aClearTalkCaches_\(\)/.test(panelSrc)) throw new Error('cache wipe helper missing');
  if (!/function aLogout\(\)[\s\S]*?aClearTalkCaches_\(\)/.test(panelSrc)) throw new Error('logout keeps talk caches');
  if (!/apiAdminErasePersonalData[\s\S]*?aClearTalkCaches_\(\)/.test(panelSrc)) throw new Error('erase keeps talk caches');
});

t('Panel clears the offline attendance queue on logout and erase', () => {
  if (!/function aClearMarkQueue_\(\)/.test(panelSrc)) throw new Error('queue wipe helper missing');
  if (!/function aLogout\(\)[\s\S]*?aClearMarkQueue_\(\)/.test(panelSrc)) throw new Error('logout keeps queued marks');
  if (!/apiAdminErasePersonalData[\s\S]*?aClearMarkQueue_\(\)/.test(panelSrc)) throw new Error('erase keeps queued marks');
  if (!/function aFlushMarks_\(\)[\s\S]*?else if \(aAuthLost\(resp\)\) return;/.test(panelSrc)) {
    throw new Error('flush keeps looping after auth loss');
  }
});

t('Panel wipes student data on Salir and warns about shared phones', () => {
  if (!/function sClearStudentSession_\(\)[\s\S]*?'esi_session'[\s\S]*?'esi_student'[\s\S]*?ssDel/.test(panelSrc)) {
    throw new Error('session wipe helper');
  }
  if (!/function sSalir\(\) \{[\s\S]*?sRevokeSession_\(\)[\s\S]*?sClearStudentSession_\(\)[\s\S]*?sEmptyState_\(\)[\s\S]*?sClearLoginFields_\(\)[\s\S]*?s-screen-mail/.test(panelSrc)) {
    throw new Error('Salir does not reset the login');
  }
  for (const needle of ['id="login-note"', 'Si el celular es compartido',
    'sClearStudentSession_()', 'sClearLoginFields_()']) {
    if (!panelHtml.includes(needle)) throw new Error('missing ' + needle);
  }
});


t('Panel demo backend: reports for admin and guide', () => {
  const store = {};
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const win = { location: { search: '' }, localStorage: ls };
  const doc = {
    addEventListener: function () { },
    body: { appendChild: function () { }, classList: { add: function () { } } }
  };
  const api = new Function('window', 'document', panelSrc + '\nreturn { call: demoCall };')(win, doc);
  const roster = [
    'ana1@secundariosalsipuedes.edu.ar; Diaz; Ana; 2b',
    'bea2@secundariosalsipuedes.edu.ar; Sanchez; Bea; 5Turismo',
    'caro3@secundariosalsipuedes.edu.ar; Diaz; Caro; 2b',
    'lup4@secundariosalsipuedes.edu.ar; Perez; Lulu; 1°A'
  ].join('\n');
  const signups = [
    { id: 'u1', ts: 0, email: 'ana1@secundariosalsipuedes.edu.ar', nombre: 'Ana', curso: '2°B', ciclo: 'basico', slot_id: 1, talk_id: 'B1', presente: true },
    { id: 'u2', ts: 0, email: 'ana1@secundariosalsipuedes.edu.ar', nombre: 'Ana', curso: '2°B', ciclo: 'basico', slot_id: 2, talk_id: 'B5', presente: false },
    { id: 'u3', ts: 0, email: 'bea2@secundariosalsipuedes.edu.ar', nombre: 'Bea', curso: '5°Turismo', ciclo: 'orientado', slot_id: 1, talk_id: 'O1', presente: true },
    { id: 'u4', ts: 0, email: 'caro3@secundariosalsipuedes.edu.ar', nombre: 'Caro', curso: '2°B', ciclo: 'basico', slot_id: 3, talk_id: 'B8', presente: false }
  ];
  return api.call('apiAdminImportRoster', ['demo', roster, 'reemplazar']).then((r0) => {
    assertEq(r0.ok, true, 'roster import');
    ls.setItem('esi_demo_signups', JSON.stringify(signups));
    return api.call('apiAdminReports', ['demo']);
  }).then((r1) => {
    assertEq(r1.ok, true, 'reports ok');
    assertEq(r1.totals.roster, 3, 'signup total');
    assertEq(r1.totals.complete, 0, 'nobody complete');
    assertEq(r1.totals.incomplete, 3, 'three with partial picks');
    assertEq(r1.totals.missing, 0, 'nobody invisible without a roster');
    assertEq(r1.totals.signups, 4, 'signups total');
    assertEq(r1.totals.presentBySlot[0].slot, '1ra');
    assertEq(r1.totals.presentBySlot[0].presentes, 2, 'two present in slot 1');
    const b1 = r1.talks.filter((x) => x.id === 'B1')[0];
    assertEq(b1.anotados, 1, 'B1 anotados');
    assertEq(b1.presentes, 1, 'B1 presentes');
    assertEq(b1.students[0].apellido, 'Diaz', 'talk student surname');
    return api.call('apiAdminReports', ['guide']);
  }).then((r2) => {
    if (JSON.stringify(r2).includes('@')) throw new Error('guide demo report leaks a mail');
    const first = r2.courses[0].students[0];
    assertEq(first.apellido, 'Diaz', 'guide demo surname');
  });
});


t('Reports hide mails for guides even if the payload leaks one', () => {
  if (!/showMail = aRole === 'admin'/.test(panelSrc)) throw new Error('course report is not role aware');
  if (!/showMailTalk = aRole === 'admin'/.test(panelSrc)) throw new Error('talk report is not role aware');
  if (!/aStudentNameHtml_\(st, 'row-name', showMail\)/.test(panelSrc)) throw new Error('course mail is not gated');
  if (!/aStudentNameHtml_\(st, 'row-name', showMailTalk\)/.test(panelSrc)) throw new Error('talk mail is not gated');
});

t('Report tables turn into cards on narrow screens', () => {
  const block = panelHtml.slice(panelHtml.indexOf('@media (max-width: 900px)'));
  if (!/\.report-table tr \{[^}]*display: block/.test(block)) throw new Error('report rows are not cards');
  if (!block.includes('.report-table thead { display: none; }')) throw new Error('report head not hidden');
  if (!block.includes('.report-table td::before')) throw new Error('report labels missing');
  if (!/\.report-table \.present-mini \{[^}]*min-height: 44px/.test(block)) throw new Error('touch size missing');
  const chartBars = panelSrc.slice(panelSrc.indexOf('function chartBars_'), panelSrc.indexOf('function aCharts_'));
  if (!chartBars.includes("'</div>' + table + '</table></figure>'")) throw new Error('chart bars table is not closed');
  const chartTables = (chartBars.match(/<table/g) || []).length;
  const chartTableEnds = (chartBars.match(/<\/table>/g) || []).length;
  if (chartTables !== chartTableEnds) throw new Error('chart bars table tags are unbalanced');
  if (!/\.report-table\.is-cards table/.test(panelHtml)) throw new Error('container card mode missing');
  if (!/function aSyncTableCards_\(\)/.test(panelSrc)) throw new Error('container card mode not wired');
  if (!/\$\('a-table'\)\.innerHTML = rows;[\s\S]{0,80}aSyncTableCards_\(\)/.test(panelSrc)) {
    throw new Error('roster table does not sync card mode');
  }
});


t('Cached reads are invalidated by writes', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  services.cache.set('signups_v2', JSON.stringify([]));
  const api = backendApi(services, 'apiGetData, apiRegister, apiAdminSetOpen');
  let r = api.apiGetData('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B');
  assertEq(r.ok, true, 'getData ok');
  assertEq(r.data.mine[1], undefined, 'stale cache hides the row');
  const session = r.session;
  const reg = api.apiRegister('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', 'B1', '', session);
  assertEq(reg.ok, true, 'register ok');
  r = api.apiGetData('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', session);
  assertEq(r.data.mine[1], 'B1', 'write invalidates the signups cache');
  if (!services.cache.has('signups_v2')) throw new Error('cache not repopulated');
  if (!services.cache.has('talks_v1') || !services.cache.has('slots_v1')) {
    throw new Error('talks or slots not cached');
  }
  api.apiAdminSetOpen('1111', false);
  if (services.cache.has('config_v1')) throw new Error('config cache not invalidated');
  const blocked = api.apiRegister('beto@secundariosalsipuedes.edu.ar', 'Beto Sanchez', '5°Turismo', 'O1');
  assertEq(blocked.ok, false, 'closed signup rejected');
});


t('Registering the same student and talk twice keeps one row', () => {
  const services = backendStub({}, {
    students: [['nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A']],
    signups: []
  });
  const api = backendApi(services, 'apiGetData, apiRegister');
  const ticket = loginTicketFor(services, 'nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A', '');
  const login = api.apiGetData('', '', '', '', '', ticket);
  assertEq(login.ok, true, 'ticket login');
  const first = api.apiRegister('nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A', 'B1', '', login.session);
  const second = api.apiRegister('nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A', 'B1', '', login.session);
  assertEq(first.ok, true, 'first insert');
  assertEq(second.ok, true, 'second is accepted as already registered');
  if (!/Ya estabas anotado/.test(second.message)) throw new Error('message: ' + second.message);
  const rows = services.sheets.Signups.data.slice(1).filter((r) => r[2] === 'nueva@secundariosalsipuedes.edu.ar');
  assertEq(rows.length, 1, 'one row');
});

t('Panel sends the session when registering a second slot', () => {
  if (!/call\('apiRegister', \[sState\.email, sState\.nombre, sState\.curso, talkId, sState\.apellido, sSessionToken_\(\)\]\)/.test(panelSrc)) {
    throw new Error('apiRegister call drops the session token');
  }
});

t('A login ticket cannot be replayed through apiRegister', () => {
  const services = backendStub({}, { students: [], signups: [] });
  const api = backendApi(services, 'apiRegister');
  const ticket = loginTicketFor(services, 'nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A', '');
  const first = api.apiRegister('nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A', 'B1', '', '', ticket);
  assertEq(first.ok, true, 'ticket register');
  const replay = api.apiRegister('nueva@secundariosalsipuedes.edu.ar', 'Nueva Alumna', '1°A', 'B2', '', '', ticket);
  assertEq(replay.ok, false, 'ticket replay rejected');
  assertEq(replay.needsLogin, true, 'replay asks for a session');
});

t('Concurrent registrations never exceed the cap or duplicate rows', () => {
  const students = [];
  for (let i = 0; i < 50; i++) {
    students.push(['s' + i + '@secundariosalsipuedes.edu.ar', 'Alumno', '2°B']);
  }
  const services = backendStub({}, { students: students, signups: [] });
  const api = backendApi(services, 'apiGetData, apiRegister');
  const sessions = {};
  for (let i = 0; i < students.length; i++) {
    const ticket = loginTicketFor(services, students[i][0], students[i][1], students[i][2], '');
    const login = api.apiGetData('', '', '', '', '', ticket);
    if (!login.session) throw new Error('no session for ' + students[i][0]);
    sessions[students[i][0]] = login.session;
  }
  const order = [];
  for (let i = 0; i < 50; i++) {
    order.push(i);
    if (i < 10) order.push(i);
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = (i * 37 + 11) % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  let ok = 0;
  let full = 0;
  let busy = 0;
  for (let n = 0; n < order.length; n++) {
    const student = students[order[n]];
    const r = api.apiRegister(student[0], student[1], student[2], 'B1', '', sessions[student[0]]);
    if (r.busy) busy++;
    else if (r.ok) ok++;
    else if (/Sin lugares/.test(r.message)) full++;
    else throw new Error('unexpected: ' + r.message);
  }
  assertEq(busy, 0, 'no lock failures in the simulation');
  const rows = services.sheets.Signups.data.slice(1);
  const seats = rows.filter((r) => r[7] === 'B1');
  assertEq(seats.length, 40, 'cap respected');
  assertEq(ok + full, order.length, 'all attempts answered');
  assertEq(ok, 50, '40 seats plus 10 already-registered answers');
  assertEq(full, 10, 'ten attempts without a seat');
  const keys = seats.map((r) => r[2] + '|' + r[7]);
  assertEq(new Set(keys).size, keys.length, 'no duplicate rows');
});

t('A lock timeout returns the busy message and writes nothing', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  let released = 0;
  services.LockService = {
    getScriptLock: () => ({
      waitLock: function () { throw new Error('timeout'); },
      releaseLock: function () { released++; }
    })
  };
  const api = backendApi(services, 'apiRegister, apiAdminSetPresent, apiAdminDeleteSignup, apiAdminSetOpen');
  const r = api.apiRegister('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', 'B2');
  assertEq(r.ok, false, 'busy is not ok');
  assertEq(r.busy, true, 'busy flag');
  assertEq(r.message, 'El servidor está ocupado. Probá de nuevo.', 'busy message');
  assertEq(services.sheets.Signups.data.length, 4, 'no row added');
  assertEq(released, 0, 'nothing to release when the lock is not acquired');
  const present = api.apiAdminSetPresent('1111', 's1', true);
  assertEq(present.busy, true, 'present is busy too');
  const del = api.apiAdminDeleteSignup('1111', 's1');
  assertEq(del.busy, true, 'delete is busy too');
  const open = api.apiAdminSetOpen('1111', false);
  assertEq(open.busy, true, 'setOpen is busy too');
});


function dniRosterStub() {
  const services = backendStub({});
  services.sheets.Students = fakeSheet('Students', ['email', 'apellido', 'nombre', 'curso', 'dni'], [
    ['ana@secundariosalsipuedes.edu.ar', 'Gómez', 'Ana', '2°B', '12.345.678']
  ]);
  return services;
}

t('apiLookupDni accepts dots and a case-insensitive surname', () => {
  const services = dniRosterStub();
  const api = backendApi(services, 'apiLookupDni, apiGetData');
  const r = api.apiLookupDni('12.345.678', ' gomez ');
  assertEq(r.ok, true);
  assertEq(r.email, '');
  if (!/^l_/.test(r.login)) throw new Error('login ticket missing');
  assertEq(r.apellido, 'Gómez');
  assertEq(r.nombreCompleto, 'Ana Gómez');
  assertEq(r.curso, '2°B');
  assertEq(r.needsNombre, false);
  assertEq(r.needsCurso, false);
  if ('dni' in r) throw new Error('lookup leaks dni');
  const data = api.apiGetData('', '', '', '', '', r.login);
  assertEq(data.ok, true);
  assertEq(data.student.email, 'ana@secundariosalsipuedes.edu.ar');
  if ('dni' in data.student) throw new Error('student leaks dni');
  const replay = api.apiGetData('', '', '', '', '', r.login);
  assertEq(replay.ok, false, 'ticket is single use');
});

t('apiLookupDni lets a unique DNI in without apellido', () => {
  const services = dniRosterStub();
  const api = backendApi(services, 'apiLookupDni, apiGetData');
  const r = api.apiLookupDni('12.345.678', '');
  assertEq(r.ok, true);
  assertEq(r.needsApellido, false);
  assertEq(r.apellido, 'Gómez');
  const data = api.apiGetData('', '', '', '', '', r.login);
  assertEq(data.ok, true);
  assertEq(data.student.email, 'ana@secundariosalsipuedes.edu.ar');
});

t('apiLookupDni asks for apellido when the DNI repeats', () => {
  const services = backendStub({});
  services.sheets.Students = fakeSheet('Students', ['email', 'apellido', 'nombre', 'curso', 'dni'], [
    ['ana@secundariosalsipuedes.edu.ar', 'Gómez', 'Ana', '2°B', '12345678'],
    ['otra@secundariosalsipuedes.edu.ar', 'Pérez', 'Otra', '2°B', '12345678']
  ]);
  const api = backendApi(services, 'apiLookupDni');
  const r = api.apiLookupDni('12345678', '');
  assertEq(r.ok, false);
  assertEq(r.needsApellido, true);
  assertEq(r.message, 'Hay más de un alumno con ese DNI. Escribí el apellido.');
  const hit = api.apiLookupDni('12345678', 'Pérez');
  assertEq(hit.ok, true);
  assertEq(hit.apellido, 'Pérez');
});

t('apiLookupDni gives the same shape and message for misses', () => {
  const services = dniRosterStub();
  const api = backendApi(services, 'apiLookupDni');
  const hit = api.apiLookupDni('12345678', 'Gómez');
  const wrong = api.apiLookupDni('12345678', 'Pérez');
  const unknown = api.apiLookupDni('99999999', 'Gómez');
  const invalid = api.apiLookupDni('abc', 'Gómez');
  const shape = (o) => Object.keys(o).sort().join(',');
  assertEq(shape(hit), shape(wrong), 'hit and miss shape');
  assertEq(shape(hit), shape(unknown), 'hit and unknown shape');
  assertEq(shape(hit), shape(invalid), 'hit and invalid shape');
  assertEq(wrong.message, 'No pudimos entrar. Revisá el DNI y el apellido.');
  assertEq(unknown.message, wrong.message);
  assertEq(invalid.message, wrong.message);
  assertEq(wrong.email, '');
  if (JSON.stringify([wrong, unknown, invalid]).indexOf('@') >= 0) throw new Error('miss leaks a mail');
});

t('apiLookupDni blocks after five failures', () => {
  const services = dniRosterStub();
  const api = backendApi(services, 'apiLookupDni');
  for (let i = 0; i < 5; i++) assertEq(api.apiLookupDni('12345678', 'nadie').ok, false);
  const blocked = api.apiLookupDni('12345678', 'Gómez');
  assertEq(blocked.ok, false);
  assertEq(blocked.message, 'Demasiados intentos. Esperá dos minutos.');
});

t('Panel logs in with DNI, with or without apellido', () => {
  if (!/call\('apiLookupDni', \[dni, apellido\]\)/.test(panelSrc)) throw new Error('dni call missing');
  if (!/id="input-dni"/.test(panelHtml) || !/id="input-apellido"/.test(panelHtml)) throw new Error('dni inputs missing');
  if (!/function sLookupDni\(/.test(panelSrc)) throw new Error('sLookupDni missing');
  if (!/function sLoginSubmit\(\)[\s\S]*?sLookupDni\(\)/.test(panelSrc)) throw new Error('login does not use DNI');
  if (!/if \(apellido && !EsiClient\.isValidName\(apellido\)\)/.test(panelSrc)) {
    throw new Error('apellido is still required before the DNI call');
  }
  if (!/resp\.needsApellido/.test(panelSrc)) throw new Error('panel ignores needsApellido');
});

t('Panel stores only an opaque student token and resumes or revokes it', () => {
  if (!/lsSet\('esi_session', token\)/.test(panelSrc)) throw new Error('token not persisted');
  if (/lsSet\('esi_student'/.test(panelSrc)) throw new Error('identity persisted');
  if (!/call\('apiResumeSession', \[token\]\)/.test(panelSrc)) throw new Error('session not resumed');
  if (!/function sRevokeSession_[\s\S]*?call\('apiStudentLogout', \[token\]\)/.test(panelSrc)) {
    throw new Error('logout does not revoke the token');
  }
  if (!/id="btn-alumno-salir"/.test(panelHtml)) throw new Error('student logout missing');
  if (!/function sInit\(\)[\s\S]*?sSessionToken_\(\)[\s\S]*?apiResumeSession/.test(panelSrc)) {
    throw new Error('boot does not resume the session');
  }
  if (/lsSet\([^)]*(dni|input-dni)/i.test(panelSrc)) throw new Error('dni stored on device');
  if (!/function sClearStudentSession_\(\)[\s\S]*?'esi_session'/.test(panelSrc)) throw new Error('token not cleared');
});

t('Code.gs issues opaque sessions that resume only their own data', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  const api = backendApi(services, 'apiGetData, apiResumeSession, apiStudentLogout, apiAdminGetData');
  const ticket = loginTicketFor(services, 'ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', '');
  const first = api.apiGetData('', '', '', '', '', ticket);
  assertEq(first.ok, true, 'getData ok');
  if (typeof first.session !== 'string' || first.session.indexOf('s_') !== 0) {
    throw new Error('student token not issued');
  }
  const sheet = services.sheets.Sessions;
  if (!sheet || sheet.data.length !== 2) throw new Error('session row missing');
  const serialized = JSON.stringify(sheet.data);
  if (serialized.includes(first.session)) throw new Error('raw token stored in the sheet');
  if (!/^[0-9a-f]{40,}$/.test(String(sheet.data[1][0]))) throw new Error('token is not hashed');
  if (sheet.data[1][1] !== 'ana@secundariosalsipuedes.edu.ar') throw new Error('session not bound to the student');

  const resumed = api.apiResumeSession(first.session);
  assertEq(resumed.ok, true, 'resume ok');
  assertEq(resumed.student.email, 'ana@secundariosalsipuedes.edu.ar', 'resume email');
  assertEq(resumed.data.mine[1], 'B1', 'resume own choices');
  if (JSON.stringify(resumed).includes('beto@')) throw new Error('resume leaks another student');

  const other = api.apiGetData('beto@secundariosalsipuedes.edu.ar', 'Beto Sanchez', '5°Turismo', first.session);
  assertEq(other.ok, false, 'token cannot read another email');
  if (other.student || other.data) throw new Error('mismatched token leaked data');

  const admin = api.apiAdminGetData(first.session);
  assertEq(admin.ok, false, 'student token is not an admin credential');
  if (admin.signups || admin.students) throw new Error('student token reached admin data');

  const out = api.apiStudentLogout(first.session);
  assertEq(out.ok, true, 'logout responds');
  const revoked = api.apiResumeSession(first.session);
  assertEq(revoked.ok, false, 'revoked token rejected');
  if (!/sesión venció/i.test(revoked.message)) throw new Error('revoked message: ' + revoked.message);
});

t('Code.gs expires student sessions at seven days or after the event', () => {
  const services = backendStub({});
  const api = backendApi(services, 'apiGetData, apiResumeSession, studentSessionExpiry_');
  const week = 7 * 24 * 60 * 60 * 1000;
  const early = Date.UTC(2026, 9, 1, 12, 0, 0);
  assertEq(api.studentSessionExpiry_(early), early + week, 'seven day cap');
  const eventLimit = Date.UTC(2026, 10, 6, 2, 59, 59);
  assertEq(api.studentSessionExpiry_(Date.UTC(2026, 10, 5, 12, 0, 0)), eventLimit, 'event cap');
  const after = api.studentSessionExpiry_(Date.UTC(2026, 10, 7, 12, 0, 0));
  if (after > Date.UTC(2026, 10, 7, 12, 0, 0)) throw new Error('session outlives the event');

  const ticket = loginTicketFor(services, 'ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', '');
  const issued = api.apiGetData('', '', '', '', '', ticket);
  const row = services.sheets.Sessions.data[1];
  row[6] = new Date(Date.now() - 1000);
  const expired = api.apiResumeSession(issued.session);
  assertEq(expired.ok, false, 'expired token rejected');
  if (expired.student || expired.data) throw new Error('expired token leaked data');
});

t('Lookup answers have the same shape for any mail', () => {
  const services = backendStub({});
  const api = backendApi(services, 'apiLookup');
  const hit = api.apiLookup('ana@secundariosalsipuedes.edu.ar');
  const other = api.apiLookup('nadie@secundariosalsipuedes.edu.ar');
  const bad = api.apiLookup('no-es-mail');
  const shape = (o) => Object.keys(o).sort().join(',');
  assertEq(shape(hit), shape(other), 'hit and other shape');
  assertEq(shape(hit), shape(bad), 'hit and invalid shape');
  assertEq(hit.ok, true, 'institutional mail accepted');
  assertEq(other.ok, true, 'unknown institutional mail accepted');
  assertEq(bad.ok, false, 'invalid mail rejected');
  assertEq(other.nombre, '', 'no name from roster');
  assertEq(other.curso, '', 'no course from roster');
  assertEq(other.apellido, '', 'no surname from roster');
  assertEq(bad.message, 'Escribí tu mail institucional.', 'invalid message');
  if (JSON.stringify(other).indexOf('@') >= 0) throw new Error('lookup leaks a mail');
});

t('Name validation rejects formulas, markup, digits and line breaks', () => {
  const good = ['Ana', '  Ana   María  ', "O'Connor", 'D’Angelo', 'Ana-María', 'Ñandú'];
  const bad = ['A', 'Ana2', '=1+1', '+54 11 5555', '-Ana', '@ana', '<b>Ana</b>',
    'Ana;DROP', 'Ana\nBcc: x@y.z', 'Ana\tPerez', 'https://x.y', 'Ana!'];
  good.forEach((name) => {
    assertEq(Core.isValidName(name), true, 'good ' + name);
    assertEq(Client.isValidName(name), true, 'client good ' + name);
  });
  bad.forEach((name) => {
    assertEq(Core.isValidName(name), false, 'bad ' + name);
    assertEq(Client.isValidName(name), false, 'client bad ' + name);
  });
  assertEq(Core.sanitizeName('  Ana   María  '), 'Ana María', 'server collapses spaces');
  assertEq(Client.sanitizeName('  Ana   María  '), 'Ana María', 'client collapses spaces');
  assertEq(Core.validateStudentInput('ana@secundariosalsipuedes.edu.ar', '=cmd', '2°B').error, 'nombre');
  assertEq(Client.validateStudentInput('ana@secundariosalsipuedes.edu.ar', '<img>', '2°B').error, 'nombre');
});

t('apiRegister stores a sanitized name and rejects formula injection', () => {
  const services = backendStub({});
  const api = backendApi(services, 'apiRegister');
  const before = services.sheets.Signups.data.length;
  const bad = api.apiRegister('nueva@secundariosalsipuedes.edu.ar', '=HYPERLINK("http://x")', '2°B', 'B1');
  assertEq(bad.ok, false, 'formula name rejected');
  assertEq(services.sheets.Signups.data.length, before, 'nothing written');
  const ok = api.apiRegister('nueva@secundariosalsipuedes.edu.ar', '  Ana   María  ', '2°B', 'B1');
  assertEq(ok.ok, true, 'valid name accepted');
  const row = services.sheets.Signups.data.slice(1).filter((r) => r[2] === 'nueva@secundariosalsipuedes.edu.ar')[0];
  assertEq(row[3], 'Ana María', 'name sanitized before write');
});

t('Reminder opt-in is stored per mail and filters recipients', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  reportSeed(services);
  const sh = services.sheets.Signups;
  const col = sh.data[0].indexOf('recordatorio');
  sh.data.slice(1).forEach((r) => { if (r[2] === 'ana@secundariosalsipuedes.edu.ar') r[col] = false; });
  const api = backendApi(services, 'apiGetData, apiResumeSession, apiSetReminder, apiAdminMailPreview');
  const ticket = loginTicketFor(services, 'ana@secundariosalsipuedes.edu.ar', 'Ana Gómez', '2°B', '');
  const got = api.apiGetData('', '', '', '', '', ticket);
  assertEq(got.recordatorio, false, 'existing opt-out returned');
  assertEq(api.apiResumeSession(got.session).recordatorio, false, 'resume returns opt-out');
  assertEq(api.apiAdminMailPreview('1111').total, 2, 'only opted-in recipients');
  const on = api.apiSetReminder(got.session, true);
  assertEq(on.ok, true, 'set reminder ok');
  assertEq(on.updated, 3, 'all rows for the mail updated');
  assertEq(api.apiAdminMailPreview('1111').total, 3, 'opt-in adds recipient');
  const off = api.apiSetReminder(got.session, false);
  assertEq(off.recordatorio, false, 'opt-out returned');
  assertEq(api.apiAdminMailPreview('1111').total, 2, 'opt-out removes recipient');
  assertEq(api.apiSetReminder('bad-token', true).ok, false, 'bad session rejected');
});

t('apiRegister preserves an existing reminder preference', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  reportSeed(services);
  const sh = services.sheets.Signups;
  const col = sh.data[0].indexOf('recordatorio');
  sh.data.slice(1).forEach((r) => { if (r[2] === 'ana@secundariosalsipuedes.edu.ar') r[col] = false; });
  const api = backendApi(services, 'apiRegister, apiGetData');
  const ticket = loginTicketFor(services, 'ana@secundariosalsipuedes.edu.ar', 'Ana Gómez', '2°B', '');
  const got = api.apiGetData('', '', '', '', '', ticket);
  const r = api.apiRegister('ana@secundariosalsipuedes.edu.ar', 'Ana Gómez', '2°B', 'B1', '', got.session);
  assertEq(r.ok, true, 'register ok');
  assertEq(r.recordatorio, false, 'opt-out preserved');
});

t('Configurable sender is validated and used for reminders', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  reportSeed(services);
  const out = [];
  services.MailApp = { getRemainingDailyQuota: () => 50, sendEmail: (msg) => out.push(msg) };
  const api = backendApi(services, 'apiAdminGetConfig, apiAdminSetConfig, apiAdminMailPreview, apiAdminSendReminders, apiAdminGetData');
  assertEq(api.apiAdminGetConfig('1111').mail_remitente, '', 'empty sender by default');
  assertEq(api.apiAdminSetConfig('1111', { mail_remitente: 'no-es-mail' }).ok, false, 'invalid sender rejected');
  assertEq(api.apiAdminSetConfig('2222', { mail_remitente: 'guia@secundariosalsipuedes.edu.ar' }).ok, false, 'guide cannot change sender');
  const sender = 'recordatorios@secundariosalsipuedes.edu.ar';
  assertEq(api.apiAdminSetConfig('1111', { mail_remitente: sender }).ok, true, 'valid sender saved');
  assertEq(api.apiAdminGetConfig('1111').mail_remitente, sender, 'sender read back');
  assertEq(api.apiAdminGetData('1111').mail_remitente, sender, 'sender in admin data');
  assertEq(api.apiAdminMailPreview('1111').from, sender, 'sender in preview');
  const sent = api.apiAdminSendReminders('1111', 0, 20);
  assertEq(sent.sent, 3, 'three sent');
  assertEq(out[0].from, sender, 'from set');
  assertEq(out[0].replyTo, sender, 'replyTo set');
});

t('Reminder bodies remove header-injection line breaks', () => {
  const services = backendStub({ ADMIN_PIN: '1111' });
  reportSeed(services);
  const sh = services.sheets.Signups;
  sh.data.slice(1).forEach((r) => { if (r[2] === 'beto@secundariosalsipuedes.edu.ar') r[3] = 'Beto\r\nBcc: evil@example.com'; });
  const api = backendApi(services, 'apiAdminMailPreview, mailLine_');
  assertEq(api.mailLine_('Ana\r\nBcc: x'), 'Ana Bcc: x', 'line breaks collapsed');
  const body = api.apiAdminMailPreview('1111').sample.body;
  if (/\r|\n(Bcc|To|Subject):/i.test(body)) throw new Error('header injection survived');
  if (body.indexOf('Beto Bcc: evil@example.com') < 0) throw new Error('name missing from body');
});

t('Panel escapes HTML, CSV formulas and ICS control characters', () => {
  const dirty = "<img src=x onerror='alert(1)'>";
  const escaped = Client.esc(dirty);
  if (/[<>"']/.test(escaped)) throw new Error('raw HTML survived: ' + escaped);
  if (escaped.indexOf('&#39;') < 0) throw new Error('apostrophe not escaped');
  assertEq(Client.csvCell('=1+1'), "'=1+1", 'formula guarded');
  assertEq(Client.csvCell('+1'), "'+1", 'plus guarded');
  assertEq(Client.csvCell('-1'), "'-1", 'minus guarded');
  assertEq(Client.csvCell('@x'), "'@x", 'at guarded');
  assertEq(Client.csvCell('Ana'), 'Ana', 'plain text unchanged');
  const ics = Client.icsEscape('Ana\r\nB;c,d\\e');
  if (ics.indexOf('\r') >= 0) throw new Error('CR survived');
  if (ics.indexOf('\\n') < 0) throw new Error('newline not escaped');
  if (ics.indexOf('\\;') < 0 || ics.indexOf('\\,') < 0) throw new Error('separators not escaped');
});

t('ESI help text is exact and uses tel links', () => {
  const m = panelHtml.match(/<article class="esi-card" aria-label="Ayuda">([\s\S]*?)<\/article>/);
  if (!m) throw new Error('ESI help card missing');
  const text = m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const want = 'Línea 102: niñez y adolescencia. Línea 144: violencia de género. 0800-222-3444: salud sexual, gratuita y confidencial. También podés hablar con un docente o preceptor de confianza.';
  assertEq(text, want, 'ESI text changed');
  ['tel:102', 'tel:144', 'tel:08002223444'].forEach((href) => {
    if (m[1].indexOf(href) < 0) throw new Error('missing ' + href);
  });
});

t('Panel shows the /exec notice only on GitHub Pages', () => {
  if (!/id="login-notice"/.test(panelHtml) || !/URL \/exec/.test(panelHtml)) throw new Error('student notice missing');
  if (!/id="gate-notice"/.test(panelHtml) || !/\/exec\?admin=1/.test(panelHtml)) throw new Error('admin notice missing');
  if (!/function showPagesNotice_\(\)/.test(panelSrc) || !/github\\.io/.test(panelSrc)) throw new Error('pages detection missing');
});

t('Panel demo backend stores reminder opt-in and filters preview', () => {
  const store = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const win = { location: { search: '' }, localStorage: ls };
  const doc = { addEventListener: function () { }, body: { appendChild: function () { }, classList: { add: function () { } } } };
  const api = new Function('window', 'document', panelSrc + '\nreturn { call: demoCall };')(win, doc);
  const email = 'ana@secundariosalsipuedes.edu.ar';
  const rows = [
    { id: 'd1', email: email, emailKey: email, nombre: 'Ana', curso: '2°B', ciclo: 'basico', slot_id: 1, talk_id: 'B1', presente: false, recordatorio: false },
    { id: 'd2', email: 'beto@secundariosalsipuedes.edu.ar', emailKey: 'beto@secundariosalsipuedes.edu.ar', nombre: 'Beto', curso: '2°B', ciclo: 'basico', slot_id: 1, talk_id: 'B1', presente: false, recordatorio: true }
  ];
  ls.setItem('esi_demo_signups', JSON.stringify(rows));
  ls.setItem('esi_demo_roster', JSON.stringify([
    { email: email, apellido: 'Lopez', nombre: 'Ana', nombreCompleto: 'Ana Lopez', curso: '2°B', dni: '12345678' }
  ]));
  let sess = '';
  return api.call('apiLookupDni', ['12345678', 'Lopez']).then((login) => {
    return api.call('apiGetData', [email, 'Ana', '2°B', null, 'Lopez', login.login]);
  }).then((got) => {
    sess = got.session;
    assertEq(got.recordatorio, false, 'demo opt-out returned');
    return api.call('apiAdminMailPreview', ['demo']);
  }).then((p1) => {
    assertEq(p1.total, 1, 'demo preview filters opt-in');
    return api.call('apiSetReminder', [sess, true]);
  }).then((on) => {
    assertEq(on.ok, true, 'demo opt-in ok');
    return api.call('apiAdminMailPreview', ['demo']);
  }).then((p2) => {
    assertEq(p2.total, 2, 'demo opt-in adds recipient');
  });
});

t('setup adds the reminder column without touching existing rows', () => {
  const services = backendStub({});
  services.sheets.Signups = fakeSheet('Signups', ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id'], [
    ['s1', new Date(), 'ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', 'basico', 1, 'B1']
  ]);
  const api = backendApi(services, 'setup');
  api.setup();
  const head = services.sheets.Signups.data[0];
  assertEq(head.indexOf('recordatorio') >= 0, true, 'column added');
  assertEq(services.sheets.Signups.data[1][2], 'ana@secundariosalsipuedes.edu.ar', 'row kept');
});

t('admin r12 status, duplicates, manual fixes, test data, close and erase', () => {
  const services = backendStub({ ADMIN_PIN: '1111', GUIDE_PIN: '2222' });
  services.sheets.Talks = fakeSheet('Talks', ['id', 'titulo', 'ciclo', 'slot_id', 'lugar', 'cupo', 'activa'], [
    ['B1', 'Charla uno', 'basico', 1, 'Aula 1', 40, 'si'],
    ['B2', 'Charla dos', 'basico', 1, 'Aula 2', 40, 'si'],
    ['B5', 'Charla tres', 'basico', 2, 'Aula 3', 40, 'si'],
    ['O1', 'Charla cuatro', 'orientado', 3, 'Aula 4', 40, 'si']
  ]);
  const headers = ['id', 'ts', 'email', 'nombre', 'apellido', 'curso', 'ciclo', 'slot_id', 'talk_id', 'presente', 'recordatorio', 'prueba'];
  services.sheets.Signups = fakeSheet('Signups', headers, [
    ['s1', new Date(), 'ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', 'Gomez', '2°B', 'basico', 1, 'B1', false, false, false],
    ['s2', new Date(), 'ana.gomez@secundariosalsipuedes.edu.ar', 'Ana Gomez', 'Gomez', '2°B', 'basico', 2, 'B5', false, false, false],
    ['s3', new Date(), 'beto@secundariosalsipuedes.edu.ar', 'Beto Sanchez', 'Sanchez', '5°Turismo', 'orientado', 3, 'O1', false, false, false]
  ]);
  const api = backendApi(services, 'apiAdminLogin, apiAdminStatus, apiAdminDuplicates, apiAdminAddStudent, apiAdminCorrectStudent, apiAdminMoveTalk, apiAdminMergeDuplicates, apiAdminDeleteStudent, apiAdminDeleteTestData, apiAdminCloseEvent, apiAdminErasePersonalData, apiAdminGetData, apiAdminSetConfig');
  const token = api.apiAdminLogin('1111').token;
  const status = api.apiAdminStatus(token);
  assertEq(status.ok, true, 'status ok');
  assertEq(status.total, 3, 'status total');
  assertEq(status.test_count, 0, 'status test count');
  const dup = api.apiAdminDuplicates(token);
  assertEq(dup.ok, true, 'duplicates ok');
  assertEq(dup.total, 1, 'one duplicate group');
  assertEq(dup.groups[0].emails.length, 2, 'two mails in group');
  assertEq(api.apiAdminSetConfig(token, { modo_prueba: true }).ok, true, 'test mode on');
  const added = api.apiAdminAddStudent(token, {
    email: 'nueva@secundariosalsipuedes.edu.ar', nombre: 'Nueva Alumna', apellido: 'Alumna', curso: '2°A', talkIds: ['B1']
  });
  assertEq(added.ok, true, 'manual add ok');
  assertEq(added.added.length, 1, 'manual add one talk');
  const addedId = added.added[0].id;
  const afterAdd = api.apiAdminGetData(token).signups.filter((x) => x.email === 'nueva@secundariosalsipuedes.edu.ar');
  assertEq(afterAdd.length, 1, 'added row visible');
  assertEq(afterAdd[0].prueba, true, 'added row marked as test');
  assertEq(api.apiAdminStatus(token).test_count, 1, 'status counts test row');
  const corrected = api.apiAdminCorrectStudent(token, 'nueva@secundariosalsipuedes.edu.ar', {
    nombre: 'Nueva', apellido: 'Alumna', curso: '2°B'
  });
  assertEq(corrected.ok, true, 'manual correct ok');
  const afterCorrect = api.apiAdminGetData(token).signups.filter((x) => x.email === 'nueva@secundariosalsipuedes.edu.ar')[0];
  assertEq(afterCorrect.nombreCompleto, 'Nueva Alumna', 'corrected name kept');
  assertEq(afterCorrect.curso, '2°B', 'corrected course');
  assertEq(api.apiAdminMoveTalk(token, addedId, 'B2').ok, true, 'manual move same slot ok');
  assertEq(api.apiAdminMoveTalk(token, addedId, 'B5').ok, false, 'move across slot rejected');
  assertEq(api.apiAdminDeleteTestData(token, 'BORRAR PRUEBA').deleted, 1, 'test data deleted');
  assertEq(api.apiAdminGetData(token).signups.filter((x) => x.email === 'nueva@secundariosalsipuedes.edu.ar').length, 0, 'test row gone');
  const merged = api.apiAdminMergeDuplicates(token, 'ana@secundariosalsipuedes.edu.ar', 'ana.gomez@secundariosalsipuedes.edu.ar');
  assertEq(merged.ok, true, 'merge ok');
  assertEq(merged.moved, 1, 'merge moved one slot');
  assertEq(merged.deleted, 0, 'merge deleted none');
  assertEq(api.apiAdminGetData(token).signups.filter((x) => x.email === 'ana.gomez@secundariosalsipuedes.edu.ar').length, 0, 'drop mail gone');
  assertEq(api.apiAdminDeleteStudent(token, 'ana@secundariosalsipuedes.edu.ar').deleted, 2, 'delete student removes rows');
  assertEq(api.apiAdminCloseEvent(token).evento_abierto, false, 'event closed');
  const erased = api.apiAdminErasePersonalData(token, 'BORRAR');
  assertEq(erased.ok, true, 'erase personal data ok: ' + erased.message);
  assertEq(api.apiAdminGetData(token).signups.length, 0, 'no personal rows after erase');
  assertEq(api.apiAdminStatus(token).data_erased, true, 'erase flag set');
  assertEq(api.apiAdminStatus(token).evento_abierto, false, 'event stays closed');
  assertEq(services.sheets.Signups.data[0].indexOf('id') >= 0, true, 'Signups header kept');
  assertEq(services.sheets.Signups.data[0].indexOf('email') >= 0, true, 'Signups email header kept');
  assertEq(!!services.sheets.Resumen, true, 'Resumen sheet created');
  if (!services.sheets.Reporte) throw new Error('Reporte sheet not rebuilt after erase');
  assertEq(services.sheets.Reporte.data[2][6], 0, 'Reporte has no personal rows');
});

t('Session identity wins over client course and cycle', () => {
  const services = backendStub({}, { signups: [] });
  const api = backendApi(services, 'apiGetData, apiRegister');
  const first = api.apiGetData('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B');
  assertEq(first.ok, true, 'first login');
  const session = first.session;
  const same = api.apiGetData('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '5°Turismo', session);
  assertEq(same.ok, true, 'session resumes');
  assertEq(same.student.curso, '2°B', 'course comes from the session');
  const wrong = api.apiRegister('ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '5°Turismo', 'O1', '', session);
  assertEq(wrong.ok, false, 'session cannot switch to the other cycle');
  if (!/otro ciclo|no es de tu ciclo/i.test(wrong.message || '')) {
    throw new Error('unexpected cycle message: ' + wrong.message);
  }
});

t('Signup writes use header names, not fixed columns', () => {
  const services = backendStub({}, { students: [], signups: [] });
  services.sheets.Talks = fakeSheet('Talks', ['id', 'titulo', 'ciclo', 'slot_id', 'lugar', 'cupo', 'activa'], [
    ['B1', 'Charla uno', 'basico', 1, 'Aula 1', 40, 'si'],
    ['B2', 'Charla dos', 'basico', 1, 'Aula 2', 40, 'si']
  ]);
  services.sheets.Signups = fakeSheet('Signups',
    ['id', 'email', 'ts', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id', 'recordatorio'], [
      ['s1', 'ana@secundariosalsipuedes.edu.ar', new Date(), 'Ana Gomez', '2°B', 'basico', 1, 'B1', false]
    ]);
  const api = backendApi(services, 'apiGetData, apiSetReminder, apiRegister');
  const ticket = loginTicketFor(services, 'ana@secundariosalsipuedes.edu.ar', 'Ana Gomez', '2°B', '');
  const got = api.apiGetData('', '', '', '', '', ticket);
  assertEq(got.ok, true, 'ticket login');
  const reminder = api.apiSetReminder(got.session, true);
  assertEq(reminder.ok, true, 'reminder ok');
  assertEq(reminder.updated, 1, 'reminder matched by email column');
  assertEq(services.sheets.Signups.data[1][8], true, 'reminder written to its column');
  const changed = api.apiRegister('', '', '', 'B2', '', got.session);
  assertEq(changed.ok, true, 'change talk ok: ' + changed.message);
  assertEq(services.sheets.Signups.data[1][7], 'B2', 'talk_id column updated');
  assertEq(services.sheets.Signups.data[1][6], 1, 'slot_id column kept');
});

t('setup creates and rebuilds the Reporte sheet', () => {
  const services = backendStub({});
  const api = backendApi(services, 'setup');
  api.setup();
  const report = services.sheets.Reporte;
  if (!report) throw new Error('Reporte sheet missing');
  if (!report.data || report.data.length < 2) throw new Error('Reporte was not written');
  assertEq(report.data[1][0], 'ID', 'report header');
});

t('setup repairs Signups after an aggregate erase', () => {
  const services = backendStub({});
  services.sheets.Signups = fakeSheet('Signups',
    ['talk_id', 'slot_id', 'ciclo', 'anotados', 'presentes'], [
      ['B1', 1, 'basico', 3, 2]
    ]);
  const api = backendApi(services, 'setup');
  api.setup();
  const head = services.sheets.Signups.data[0];
  if (head.indexOf('id') < 0 || head.indexOf('email') < 0) throw new Error('Signups header not repaired');
  if (!services.sheets.Resumen) throw new Error('Resumen not created');
  assertEq(services.sheets.Resumen.data[0][0], 'talk_id', 'Resumen header');
  assertEq(services.sheets.Resumen.data[1][3], 3, 'aggregate copied');
});

t('Docs send staff to /exec and list shared sheets', () => {
  const docs = [read('../README.md'), read('../AGENTS.md')];
  docs.forEach((doc, i) => {
    if (!/\/exec/.test(doc)) throw new Error('doc ' + i + ' lacks /exec');
    if (!/google\.script\.run|POST/.test(doc)) throw new Error('doc ' + i + ' lacks POST login');
    if (!/Sessions/.test(doc) || !/Signups/.test(doc) || !/Mails/.test(doc)) {
      throw new Error('doc ' + i + ' lacks shared sheet warning');
    }
    if (/Compartir a profes.*\?api=/i.test(doc)) throw new Error('doc ' + i + ' recommends ?api=');
  });
});

summary();
process.exitCode = fail ? 1 : 0;
