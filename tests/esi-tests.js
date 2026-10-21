'use strict';

const fs = require('fs');
const path = require('path');

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

const juana = { emailKey: 'juana@esc.edu.ar', ciclo: 'basico' };

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
  assertEq(Core.normalizeEmail('  Juana@Esc.Edu.AR '), 'juana@esc.edu.ar');
});

t('isValidEmail accepts institutional mails and rejects junk', () => {
  assertEq(Core.isValidEmail('juana@esc.edu.ar'), true);
  assertEq(Core.isValidEmail('juana.mendez@esc.edu.ar'), true);
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
  const v = Core.validateStudentInput('  Juana@Esc.Edu.AR ', '  Juana   Pérez ', '2°A');
  assertEq(v.ok, true);
  assertEq(v.email, 'juana@esc.edu.ar');
  assertEq(v.nombre, 'Juana Pérez');
  assertEq(v.nombreKey, 'juana perez');
  assertEq(v.ciclo, 'basico');
});

t('validateStudentInput rejects bad email, short name and unknown year', () => {
  assertEq(Core.validateStudentInput('juana@esc', 'Juana Perez', '2°A').error, 'email');
  assertEq(Core.validateStudentInput('juana@esc.edu.ar', 'Ju', '2°A').error, 'nombre');
  assertEq(Core.validateStudentInput('juana@esc.edu.ar', 'Juana Perez', 'CB').error, 'curso');
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
    signup('u2', 'otro@esc.edu.ar', 1, 'B2'),
    signup('u3', 'dos@esc.edu.ar', 1, 'B2')
  ];
  const p = Core.planRegistration(s, talks(), juana, 'B2');
  assertEq(p.error, 'full');
});

t('different mails add different students to same talk', () => {
  const s = [signup('u1', 'juana@esc.edu.ar', 1, 'B1')];
  const p = Core.planRegistration(s, talks(), { emailKey: 'melina@esc.edu.ar', ciclo: 'basico' }, 'B1');
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
  const s = [signup('u9', 'otra@esc.edu.ar', 3, 'B8')];
  const p = Core.planRegistration(s, talks(), juana, 'B8');
  assertEq(p.error, 'full');
});

t('cycle mismatch rejected', () => {
  const p = Core.planRegistration([], talks(), { emailKey: 'x@esc.edu.ar', ciclo: 'orientado' }, 'B1');
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
  assertEq(Client.normalizeEmail('  Juana@Esc.Edu.AR '), Core.normalizeEmail('  Juana@Esc.Edu.AR '));
  assertEq(Client.isValidEmail('juana@esc.edu.ar'), Core.isValidEmail('juana@esc.edu.ar'));
  assertEq(Client.isValidEmail('junk'), false);
  assertEq(Client.cicloFromCurso('5°'), Core.cicloFromCurso('5°'));
  assertEq(Client.cicloFromCurso('CB'), null);
});

t('Panel EsiClient parity: validateStudentInput', () => {
  const a = Client.validateStudentInput(' juana@esc.edu.ar ', ' Juana Perez ', '2°A');
  const b = Core.validateStudentInput(' juana@esc.edu.ar ', ' Juana Perez ', '2°A');
  ['ok', 'email', 'nombre', 'nombreKey', 'ciclo'].forEach((k) => assertEq(a[k], b[k], 'key ' + k));
  assertEq(Client.validateStudentInput('juana@esc.edu.ar', 'Ju', '2°A').error, 'nombre');
  assertEq(Client.validateStudentInput('juana@esc.edu.ar', 'Juana Perez', 'CB').error, 'curso');
});

t('Panel EsiClient parity: planRegistration scenarios', () => {
  const scen = [
    [[], 'B1'],
    [[signup('u1', juana.emailKey, 1, 'B1')], 'B1'],
    [[signup('u1', juana.emailKey, 1, 'B1')], 'B2'],
    [[signup('u9', 'o@esc.edu.ar', 3, 'B8')], 'B8'],
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
  if (names.length !== 11) throw new Error('expected 11 api fns, got ' + names.length);
  const want = ['apiLookup', 'apiGetData', 'apiRegister', 'apiAdminLogin', 'apiAdminGetData', 'apiAdminSetOpen', 'apiAdminDeleteSignup', 'apiAdminImportRoster', 'apiAdminTalkRoster', 'apiAdminPending', 'apiAdminSetPresent'];
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
  for (const needle of ['MODO PRUEBA', 'Sin servidor configurado', 'btn-demo']) {
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
    ' juana1@esc.edu.ar ; Juana Perez ; 2b ',
    'mateo2@esc.edu.ar,Mateo Gomez,5Turismo',
    'lucia3@esc.edu.ar',
    'juana1@esc.edu.ar; otra; 3A',
    'malo@esc',
    '   '
  ].join('\n');
  const r = Core.parseRoster(txt);
  assertEq(r.rows.length, 3, 'rows');
  assertEq(r.duplicados, 1, 'dupes');
  assertEq(r.invalidos.length, 1, 'invalid');
  assertEq(r.rows[0].email, 'juana1@esc.edu.ar');
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
  const txt = 'mail\nana1@esc.edu.ar; Ana Ana; 2B\nbea2@esc.edu.ar;Bea,4Turismo\nbea2@esc.edu.ar x';
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
      id: 's' + i, ts: 0, email: 'f' + i + '@instituto.edu.ar', nombre: 'Fulano ' + i,
      curso: '2°A', ciclo: 'basico', slot_id: 1, talk_id: 'B2', emailKey: 'f' + i + '@instituto.edu.ar'
    });
  }

  return api.call('apiRegister', ['ana.lopez@instituto.edu.ar', 'Ana Lopez', '2°B', 'B1']).then((r1) => {
    assertEq(r1.ok, true, 'ana B1');
    if (!/Listo, quedaste anotado/.test(r1.message)) throw new Error('msg: ' + r1.message);
    assertEq(r1.data.mine[1], 'B1', 'mine slot1');
    if ('signups' in r1.data || 'students' in r1.data) throw new Error('public data leaks lists');
    if (JSON.stringify(r1.data).includes('@instituto.edu.ar')) throw new Error('public data leaks mails');
    const cur = JSON.parse(ls.getItem('esi_demo_signups'));
    for (let i = 0; i < 40; i++) cur.push(seed[i]);
    ls.setItem('esi_demo_signups', JSON.stringify(cur));
    return api.call('apiRegister', ['ana.lopez@instituto.edu.ar', 'Ana Lopez', '2°B', 'B2']);
  }).then((r2) => {
    assertEq(r2.ok, false, 'B2 full rejected');
    if (!/Sin lugares/.test(r2.message)) throw new Error('msg: ' + r2.message);
    assertEq(r2.data.mine[1], 'B1', 'kept previous B1');
    return api.call('apiRegister', ['ana.lopez@instituto.edu.ar', 'Ana Lopez', '2°B', 'B5']);
  }).then((r3) => {
    assertEq(r3.ok, true, 'ana B5 slot2');
    assertEq(r3.data.mine[2], 'B5', 'mine slot2');
    return api.call('apiAdminLogin', ['demo']);
  }).then((r4) => {
    assertEq(r4.ok, true, 'demo login');
    return api.call('apiAdminSetOpen', ['demo', false]);
  }).then((r5) => {
    assertEq(r5.ok, true, 'closed by admin');
    return api.call('apiRegister', ['bea@instituto.edu.ar', 'Bea Diaz', '1°A', 'B1']);
  }).then((r6) => {
    assertEq(r6.ok, false, 'register blocked when closed');
    if (!/cerrada/.test(r6.message)) throw new Error('msg: ' + r6.message);
    return api.call('apiAdminSetOpen', ['demo', true]);
  }).then((r7) => {
    assertEq(r7.ok, true, 'reopened');
    return api.call('apiRegister', ['bea@instituto.edu.ar', 'Bea Diaz', '1°A', 'B1']);
  }).then((r8) => {
    assertEq(r8.ok, true, 'register after reopen');
    return api.call('apiAdminGetData', ['demo']);
  }).then((r9) => {
    assertEq(r9.ok, true, 'admin data');
    assertEq(r9.total, 43, 'total = 40 seed + ana x2 + bea');
    assertEq(r9.signups.some((s) => s.email === 'bea@instituto.edu.ar'), true, 'bea listed');
    return api.call('apiAdminDeleteSignup', ['demo', r9.signups[0].id]);
  }).then((r10) => {
    assertEq(r10.ok, true, 'deleted');
    return api.call('apiAdminGetData', ['demo']);
  }).then((r11) => {
    assertEq(r11.total, 42, 'total after delete');
  });
});

t('Panel demo backend: roster import restricts lookup and register', () => {
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

  return api.call('apiAdminImportRoster', ['demo', 'ana1@instituto.edu.ar; Ana Ruiz; 2b\nbea2@x.edu.ar', 'reemplazar']).then((r1) => {
    assertEq(r1.ok, true, 'import ok');
    assertEq(r1.total, 2, 'total roster');
    assertEq(r1.nuevos, 2, 'nuevos');
    assertEq(r1.modo, 'reemplazar', 'modo');
    return api.call('apiLookup', ['bea2@x.edu.ar']);
  }).then((r2) => {
    assertEq(r2.ok, true, 'roster mail lookup');
    assertEq(r2.rosterLoaded, true, 'rosterLoaded');
    assertEq(r2.needsNombre, true, 'needsNombre');
    assertEq(r2.needsCurso, true, 'needsCurso');
    return api.call('apiLookup', ['desconocido@x.edu.ar']);
  }).then((r3) => {
    assertEq(r3.ok, false, 'unknown mail rejected');
    if (!/no está en la lista/.test(r3.message)) throw new Error('msg: ' + r3.message);
    return api.call('apiRegister', ['desconocido@x.edu.ar', 'Pepe Gomez', '2A', 'B1']);
  }).then((r4) => {
    assertEq(r4.ok, false, 'unknown mail cannot register');
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
  if (!/ADMIN_BLOCK_MS\s*=\s*60000/.test(codeSrc)) throw new Error('block window missing');
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

t('Panel keeps control borders and focus rings above the contrast minimum', () => {
  if (!/--line-ui:\s*#8E8A80/.test(panelHtml)) throw new Error('line-ui claro missing');
  if (!/--line-ui:\s*#787C71/.test(panelHtml)) throw new Error('line-ui oscuro missing');
  if (!/\.talk \{[^}]*border:\s*1px solid var\(--line-ui\)/.test(panelHtml)) throw new Error('talk border not using line-ui');
  if (!/border:\s*1px solid var\(--line-ui\); border-radius: var\(--radius-sm\)/.test(panelHtml)) throw new Error('inputs not using line-ui');
  if (/focus-visible[^}]*var\(--accent-soft\)/.test(panelHtml)) throw new Error('weak focus ring');
  if (/focus-visible[^}]*var\(--accent-fill\)/.test(panelHtml)) throw new Error('weak focus ring');
  if (!/focus-visible[^}]*var\(--accent\)/.test(panelHtml)) throw new Error('focus ring missing');
  if (!/overflow-wrap:\s*anywhere/.test(panelHtml)) throw new Error('long text can overflow on narrow screens');
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
        setValues: (vals) => {
          for (let i = 0; i < vals.length; i++) {
            for (let j = 0; j < vals[i].length; j++) sh.data[r - 1 + i][j] = vals[i][j];
          }
        },
        clearContent: () => {
          for (let i = r - 1; i < sh.data.length; i++) sh.data[i] = sh.data[i].map(() => '');
        }
      };
    },
    getLastRow() { return sh.data.length; },
    getLastColumn() { return Math.max(1, sh.data[0] ? sh.data[0].length : 1); },
    deleteRow(r) { sh.data.splice(r - 1, 1); },
    setFrozenRows() { },
    clear() { sh.data = [headers.slice()]; }
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
      ['ana@esc.edu.ar', 'Ana Gomez', '2°B'],
      ['beto@esc.edu.ar', 'Beto Sanchez', '5°Turismo'],
      ['carla@esc.edu.ar', 'Carla Diaz', '3°A']
    ]),
    Signups: fakeSheet('Signups', ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id'],
      (seed && seed.signups) || [
        ['s1', new Date(), 'ana@esc.edu.ar', 'Ana Gomez', '2°B', 'basico', 1, 'B1'],
        ['s2', new Date(), 'beto@esc.edu.ar', 'Beto Sanchez', '5°Turismo', 'orientado', 2, 'B2'],
        ['s3', new Date(), 'carla@esc.edu.ar', 'Carla Diaz', '3°A', 'basico', 3, 'O1']
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
      computeDigest: (algo, value) => {
        let h = 7;
        const s = String(value);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 255;
        return [h, (h + 17) & 255, (h + 91) & 255, 250, 255];
      }
    }
  };
}

function backendApi(services, names) {
  const src = names.split(',').map((n) => n.trim());
  const body = src.map((n) => n + ': ' + n).join(',');
  return new Function('PropertiesService', 'LockService', 'CacheService', 'SpreadsheetApp', 'Utilities',
    codeSrc + '\nreturn {' + body + '};')(
    services.PropertiesService, services.LockService, services.CacheService,
    services.SpreadsheetApp, services.Utilities);
}

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
  assertEq(adminData.signups[0].email, 'ana@esc.edu.ar', 'admin sees the mails');
});

t('Code.gs lookup returns the roster name and course and nothing else', () => {
  const services = backendStub({});
  const api = backendApi(services, 'apiLookup');
  const r = api.apiLookup('ana@esc.edu.ar');
  assertEq(r.ok, true, 'lookup ok');
  assertEq(r.nombre, 'Ana Gomez', 'name from roster');
  assertEq(r.curso, '2°B', 'course from roster');
  assertEq(r.needsNombre, false, 'name not needed');
  assertEq(r.needsCurso, false, 'course not needed');
  if (JSON.stringify(r).indexOf('@') >= 0) throw new Error('lookup leaks a mail');
  if (JSON.stringify(r).indexOf('beto@') >= 0) throw new Error('lookup leaks the list');
  const out = api.apiLookup('nadie@esc.edu.ar');
  assertEq(out.ok, false, 'mail out of roster');
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
  assertEq(r.students[0].email, 'ana@esc.edu.ar', 'admin sees the mail');
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

summary();
process.exitCode = fail ? 1 : 0;
