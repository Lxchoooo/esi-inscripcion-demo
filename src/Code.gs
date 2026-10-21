var CONFIG_SHEET = 'Config';
var SLOTS_SHEET = 'Slots';
var TALKS_SHEET = 'Talks';
var SIGNUPS_SHEET = 'Signups';
var STUDENTS_SHEET = 'Students';
var MAX_EMAIL_ = 120;
var ADMIN_PIN_PROP = 'ADMIN_PIN';
var GUIDE_PIN_PROP = 'GUIDE_PIN';
var ADMIN_FAIL_PROP = 'ADMIN_FAIL_COUNT';
var ADMIN_BLOCK_PROP = 'ADMIN_BLOCK_UNTIL';
var ADMIN_MAX_FAILS = 5;
var ADMIN_BLOCK_MS = 60000;
var ADMIN_TOKEN_PREFIX = 't_';
var ADMIN_TOKEN_TTL = 7200;
var ROLE_ADMIN = 'admin';
var ROLE_GUIDE = 'guide';
var DATA_CACHE_TTL = 12;

var ERROR_MESSAGES_ = {
  full: 'Sin lugares.',
  talkNotFound: 'No encontramos esa charla.',
  talkInactive: 'Esa charla no está disponible.',
  talkWrongCycle: 'Esa charla no es de tu ciclo.',
  closed: 'La inscripción está cerrada.'
};

var STUDENT_ERRORS_ = {
  email: 'Escribí tu mail institucional.',
  nombre: 'Escribí nombre y apellido.',
  curso: 'Elegí año y división.',
  notInRoster: 'Ese mail no está en la lista.'
};

var EsiCore = (function () {
  'use strict';

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeEmail(value) {
    return String(value == null ? '' : value).replace(/\s+/g, '').trim().toLowerCase();
  }

  function isValidEmail(email) {
    var e = String(email == null ? '' : email);
    if (!e || e.length > MAX_EMAIL_) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  function cicloFromCurso(curso) {
    var m = String(curso == null ? '' : curso).match(/\d/);
    if (!m) return null;
    var year = Number(m[0]);
    if (year >= 1 && year <= 3) return 'basico';
    if (year >= 4 && year <= 6) return 'orientado';
    return null;
  }

  function validateStudentInput(email, nombre, curso) {
    var e = normalizeEmail(email);
    if (!isValidEmail(e)) return { ok: false, error: 'email' };
    var n = String(nombre == null ? '' : nombre).replace(/\s+/g, ' ').trim();
    if (n.length < 3 || n.length > 60) return { ok: false, error: 'nombre' };
    var ciclo = cicloFromCurso(curso);
    if (!ciclo) return { ok: false, error: 'curso' };
    var c = String(curso == null ? '' : curso).replace(/\s+/g, ' ').trim();
    return {
      ok: true,
      email: e,
      nombre: n,
      curso: c,
      ciclo: ciclo,
      nombreKey: normalizeText(n),
      emailKey: e
    };
  }

  function divisionsForYear(year) {
    var y = Number(year);
    if (y >= 1 && y <= 3) return ['A', 'B'];
    if (y >= 4 && y <= 6) return ['Turismo', 'Econom\u00EDa'];
    return [];
  }

  function cursoFromParts(year, division) {
    var y = Number(year);
    if (!(y >= 1 && y <= 6)) return null;
    var raw = String(division == null ? '' : division).replace(/\s+/g, ' ').trim();
    if (!raw) return y + '\u00B0';
    if (y <= 3) {
      var d = raw.charAt(0).toUpperCase();
      if (d !== 'A' && d !== 'B') return null;
      return y + '\u00B0' + d;
    }
    var first = raw.charAt(0).toLowerCase();
    if (first !== 't' && first !== 'e') return null;
    return y + '\u00B0' + (first === 't' ? 'Turismo' : 'Econom\u00EDa');
  }

  function parseCurso(value) {
    var s = normalizeText(value).replace(/\u00B0/g, '').replace(/\s+/g, '');
    var m = s.match(/^([1-6])(a|b|t|tur|turismo|e|eco|econ|econom|economia)?$/);
    if (!m) return null;
    var y = Number(m[1]);
    var d = m[2] || '';
    if (!d) return y + '\u00B0';
    if (y <= 3) {
      if (d !== 'a' && d !== 'b') return null;
      return y + '\u00B0' + d.toUpperCase();
    }
    if (d.charAt(0) !== 't' && d.charAt(0) !== 'e') return null;
    return y + '\u00B0' + (d.charAt(0) === 't' ? 'Turismo' : 'Econom\u00EDa');
  }

  function parseRoster(text) {
    var raw = String(text == null ? '' : text).split(/\r?\n/);
    var rows = [];
    var invalidos = [];
    var seen = {};
    var duplicados = 0;
    var firstIdx = -1;
    for (var p = 0; p < raw.length; p++) {
      if (raw[p].replace(/[^A-Za-z0-9@.]/g, '').trim()) {
        if (firstIdx < 0) firstIdx = p;
        break;
      }
    }
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i].replace(/\t/g, ';').replace(/,/g, ';').replace(/\s*;\s*/g, ';');
      var parts = line.split(';');
      var email = normalizeEmail(parts[0]);
      if (!email) continue;
      if (i === firstIdx && /mail|correo/.test(normalizeText(email)) && !isValidEmail(email)) continue;
      if (parts.length > 1) {
        var nombre = String(parts[1] || '').replace(/\s+/g, ' ').trim();
        var cursoRaw = parts[2] || '';
        var key = email;
        if (seen[key]) { duplicados++; continue; }
        if (!isValidEmail(email)) {
          invalidos.push({ linea: i + 1, texto: line.trim().slice(0, 80) });
          continue;
        }
        seen[key] = true;
        rows.push({ email: email, nombre: nombre, curso: parseCurso(cursoRaw) || '' });
      } else {
        if (seen[email]) { duplicados++; continue; }
        if (!isValidEmail(email)) {
          invalidos.push({ linea: i + 1, texto: email.slice(0, 80) });
          continue;
        }
        seen[email] = true;
        rows.push({ email: email, nombre: '', curso: '' });
      }
    }
    return { rows: rows, invalidos: invalidos, duplicados: duplicados };
  }

  function aggregateTalks(signups, talks) {
    var counts = {};
    var porCiclo = { basico: 0, orientado: 0 };
    for (var i = 0; i < signups.length; i++) {
      var s = signups[i];
      counts[s.talk_id] = (counts[s.talk_id] || 0) + 1;
      if (porCiclo[s.ciclo] != null) porCiclo[s.ciclo]++;
    }
    var rows = talks.map(function (t) {
      var anotados = counts[t.id] || 0;
      var cupo = Number(t.cupo);
      return {
        id: t.id,
        titulo: t.titulo,
        ciclo: t.ciclo,
        slot_id: t.slot_id,
        lugar: t.lugar,
        cupo: cupo,
        activa: !!t.activa,
        anotados: anotados,
        restantes: Math.max(0, cupo - anotados)
      };
    });
    return { counts: counts, porCiclo: porCiclo, rows: rows, total: signups.length };
  }

  function planRegistration(signups, talksById, student, talkId) {
    var talk = talksById[talkId];
    if (!talk) return { error: 'talkNotFound' };
    if (!talk.activa) return { error: 'talkInactive' };
    if (talk.ciclo !== student.ciclo) return { error: 'talkWrongCycle' };

    var counts = {};
    var mine = [];
    for (var i = 0; i < signups.length; i++) {
      var s = signups[i];
      counts[s.talk_id] = (counts[s.talk_id] || 0) + 1;
      if (s.emailKey === student.emailKey) mine.push(s);
    }

    var sameSlot = null;
    for (var j = 0; j < mine.length; j++) {
      if (Number(mine[j].slot_id) === Number(talk.slot_id)) {
        sameSlot = mine[j];
        break;
      }
    }

    var full = (counts[talkId] || 0) >= Number(talk.cupo);

    if (sameSlot) {
      if (sameSlot.talk_id === String(talkId)) return { action: 'none' };
      if (full) return { error: 'full' };
      return { action: 'change', signupId: sameSlot.id, previousTalkId: sameSlot.talk_id };
    }
    if (full) return { error: 'full' };
    return { action: 'insert' };
  }

  return {
    normalizeText: normalizeText,
    normalizeEmail: normalizeEmail,
    isValidEmail: isValidEmail,
    cicloFromCurso: cicloFromCurso,
    validateStudentInput: validateStudentInput,
    planRegistration: planRegistration,
    cursoFromParts: cursoFromParts,
    parseCurso: parseCurso,
    divisionsForYear: divisionsForYear,
    parseRoster: parseRoster,
    aggregateTalks: aggregateTalks
  };
})();

var API_FN_MAP_ = {
  apiLookup: apiLookup,
  apiGetData: apiGetData,
  apiRegister: apiRegister,
  apiAdminLogin: apiAdminLogin,
  apiAdminGetData: apiAdminGetData,
  apiAdminSetOpen: apiAdminSetOpen,
  apiAdminDeleteSignup: apiAdminDeleteSignup,
  apiAdminImportRoster: apiAdminImportRoster,
  apiAdminTalkRoster: apiAdminTalkRoster,
  apiAdminPending: apiAdminPending,
  apiAdminSetPresent: apiAdminSetPresent
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (String(p.fn || '')) return apiJsonp_(p);
  var admin = String(p.admin || '') === '1';
  var out = HtmlService.createTemplateFromFile('Panel').evaluate();
  out.setTitle(admin ? 'ESI - Panel de profes' : 'ESI - Inscripción a charlas');
  out.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return out;
}

function apiJsonp_(p) {
  var cb = String(p.callback || 'callback');
  var payload;
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cb)) {
    cb = 'callback';
    payload = { ok: false, message: 'Callback invalido.' };
  } else {
    var f = API_FN_MAP_[String(p.fn || '')];
    if (!f) {
      payload = { ok: false, message: 'Funcion desconocida.' };
    } else {
      var args = [];
      try {
        args = JSON.parse(String(p.args || '[]'));
      } catch (err) {
        args = null;
      }
      if (!args) {
        payload = { ok: false, message: 'Parametros invalidos.' };
      } else {
        try {
          payload = f.apply(null, args);
        } catch (err) {
          payload = { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
        }
      }
    }
  }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, CONFIG_SHEET, ['clave', 'valor'], [
    ['evento_abierto', 'abierto']
  ]);
  ensureSheet_(ss, SLOTS_SHEET, ['id', 'nombre', 'inicio', 'fin', 'orden'], [
    [1, '1ra', '10:30', '11:20', 1],
    [2, '2da', '11:30', '12:20', 2],
    [3, '3ra', '12:30', '13:30', 3]
  ]);
  ensureSheet_(ss, TALKS_SHEET, ['id', 'titulo', 'ciclo', 'slot_id', 'lugar', 'cupo', 'activa'], seedTalks_());
  ensureSheet_(ss, STUDENTS_SHEET, ['email', 'nombre', 'curso'], []);
  ensureSheet_(ss, SIGNUPS_SHEET, ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id'], []);
  ensureColumn_(sheet_(SIGNUPS_SHEET), 'presente');
  ensureAdminPin_();
  ensureGuidePin_();
  ss.toast('Listo. Las claves están en Script Properties (ADMIN_PIN y GUIDE_PIN).');
  rebuildReport_();
}

function ensureAdminPin_() {
  var props = PropertiesService.getScriptProperties();
  var pin = String(props.getProperty(ADMIN_PIN_PROP) || '').trim();
  var legacy = '';
  try { legacy = String(readConfig_().admin_pin || '').trim(); } catch (e) { }
  if (!pin) {
    pin = /^\d{4,12}$/.test(legacy) ? legacy : randomPin_();
    props.setProperty(ADMIN_PIN_PROP, pin);
    Logger.log('Clave de profes guardada en Script Properties (ADMIN_PIN).');
  }
  try { removeConfigKey_('admin_pin'); } catch (e) { }
  return pin;
}

function ensureGuidePin_() {
  var props = PropertiesService.getScriptProperties();
  var pin = String(props.getProperty(GUIDE_PIN_PROP) || '').trim();
  if (!pin) {
    pin = randomPin_();
    props.setProperty(GUIDE_PIN_PROP, pin);
    Logger.log('Clave de guías guardada en Script Properties (GUIDE_PIN).');
  }
  return pin;
}

function removeConfigKey_(key) {
  var sh = sheet_(CONFIG_SHEET);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === key) {
      sh.deleteRow(i + 1);
      return;
    }
  }
}

function randomPin_() {
  var pin = String(Math.floor(Math.random() * 9) + 1);
  for (var i = 0; i < 3; i++) {
    pin += String(Math.floor(Math.random() * 10));
  }
  return pin;
}

function ensureSheet_(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.setFrozenRows(1);
  if (sh.getLastColumn() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  if (rows && rows.length && sh.getLastRow() < 2) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  return sh;
}

function ensureColumn_(sh, header) {
  var last = Math.max(1, sh.getLastColumn());
  var vals = sh.getRange(1, 1, 1, last).getValues()[0];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i]).trim() === header) return i + 1;
  }
  var col = last + 1;
  sh.getRange(1, col).setValue(header);
  return col;
}

function seedTalks_() {
  var cupo = 40;
  return [
    ['B1', 'Salud Mental: Ansiedad', 'basico', 1, 'A confirmar', cupo, true],
    ['B2', 'Consumos Problemáticos: Alcohol', 'basico', 1, 'A confirmar', cupo, true],
    ['B3', 'Deportes y Alimentación saludable', 'basico', 1, 'A confirmar', cupo, true],
    ['B4', 'Ciberbullying y grooming', 'basico', 1, 'A confirmar', cupo, true],
    ['B5', 'Salud Mental: Autolesiones', 'basico', 2, 'A confirmar', cupo, true],
    ['B6', 'Consumos Problemáticos: Cigarrillo/Vapeo', 'basico', 2, 'A confirmar', cupo, true],
    ['B7', 'Masculinidades', 'basico', 2, 'A confirmar', cupo, true],
    ['B8', 'Consumos Problemáticos: Juegos/Ludopatía', 'basico', 3, 'A confirmar', cupo, true],
    ['B9', 'Relaciones sexuales, cuidado y prevención', 'basico', 3, 'A confirmar', cupo, true],
    ['B10', 'Nueva ley penal juvenil / Delitos informáticos', 'basico', 3, 'A confirmar', cupo, true],
    ['O1', 'Salud Mental: Ansiedad', 'orientado', 1, 'A confirmar', cupo, true],
    ['O2', 'Consumos Problemáticos: Alcohol', 'orientado', 1, 'A confirmar', cupo, true],
    ['O3', 'Deportes y Alimentación saludable', 'orientado', 1, 'A confirmar', cupo, true],
    ['O4', 'Ciberbullying y grooming', 'orientado', 1, 'A confirmar', cupo, true],
    ['O5', 'Salud Mental: Autolesiones', 'orientado', 2, 'A confirmar', cupo, true],
    ['O6', 'Consumos Problemáticos: Cigarrillo/Vapeo', 'orientado', 2, 'A confirmar', cupo, true],
    ['O7', 'Masculinidades', 'orientado', 2, 'A confirmar', cupo, true],
    ['O8', 'Consumos Problemáticos: Juegos/Ludopatía', 'orientado', 3, 'A confirmar', cupo, true],
    ['O9', 'ITS: adolescentes expuestos, sífilis y otras infecciones', 'orientado', 3, 'A confirmar', cupo, true]
  ];
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Falta la hoja ' + name + '. Ejecutá setup().');
  return sh;
}

function readConfig_() {
  var vals = sheet_(CONFIG_SHEET).getDataRange().getValues();
  var cfg = {};
  for (var i = 1; i < vals.length; i++) {
    var k = String(vals[i][0]).trim();
    if (k) cfg[k] = vals[i][1];
  }
  return cfg;
}

function writeConfig_(key, value) {
  var sh = sheet_(CONFIG_SHEET);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function isOpen_(cfg) {
  var v = String(cfg.evento_abierto == null ? '' : cfg.evento_abierto).trim().toLowerCase();
  return v === 'abierto' || v === 'true';
}

function readSlots_() {
  var vals = sheet_(SLOTS_SHEET).getDataRange().getValues();
  var slots = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === '') continue;
    slots.push({
      id: Number(vals[i][0]),
      nombre: String(vals[i][1]),
      inicio: String(vals[i][2]),
      fin: String(vals[i][3]),
      orden: Number(vals[i][4] || 0)
    });
  }
  slots.sort(function (a, b) { return a.orden - b.orden; });
  return slots;
}

function convertBool_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === 'si' || s === 'sí' || s === '1';
}

function readTalks_() {
  var vals = sheet_(TALKS_SHEET).getDataRange().getValues();
  var talks = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === '') continue;
    talks.push({
      id: String(vals[i][0]),
      titulo: String(vals[i][1]),
      ciclo: String(vals[i][2]).trim().toLowerCase(),
      slot_id: Number(vals[i][3]),
      lugar: String(vals[i][4]),
      cupo: Number(vals[i][5] || 40),
      activa: convertBool_(vals[i][6])
    });
  }
  return talks;
}

function readSignups_() {
  var vals = sheet_(SIGNUPS_SHEET).getDataRange().getValues();
  var col = -1;
  for (var h = 0; h < (vals[0] || []).length; h++) {
    if (String(vals[0][h]).trim() === 'presente') { col = h; break; }
  }
  var signups = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === '') continue;
    signups.push({
      id: String(vals[i][0]),
      ts: vals[i][1],
      email: String(vals[i][2]),
      nombre: String(vals[i][3]),
      curso: String(vals[i][4]),
      ciclo: String(vals[i][5]).trim().toLowerCase(),
      slot_id: Number(vals[i][6]),
      talk_id: String(vals[i][7]),
      presente: col >= 0 ? convertBool_(vals[i][col]) : false,
      emailKey: EsiCore.normalizeEmail(vals[i][2])
    });
  }
  return signups;
}

function presenteCol_(sh) {
  var last = sh.getLastColumn();
  var vals = sh.getRange(1, 1, 1, Math.max(1, last)).getValues()[0];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i]).trim() === 'presente') return i + 1;
  }
  var col = Math.max(2, last + 1);
  sh.getRange(1, col).setValue('presente');
  return col;
}

function readStudents_() {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(STUDENTS_SHEET);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    var students = [];
    for (var i = 1; i < vals.length; i++) {
      if (vals[i][0] === '') continue;
      students.push({
        email: EsiCore.normalizeEmail(vals[i][0]),
        nombre: String(vals[i][1] == null ? '' : vals[i][1]).replace(/\s+/g, ' ').trim(),
        curso: String(vals[i][2] == null ? '' : vals[i][2]).replace(/\s+/g, ' ').trim()
      });
    }
    return students;
  } catch (e) {
    return [];
  }
}

function findStudent_(students, email) {
  for (var i = 0; i < students.length; i++) {
    if (students[i].email === email) return students[i];
  }
  return null;
}

function readSignupsCached_() {
  try {
    var hit = CacheService.getScriptCache().get('signups_v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { }
  var signups = readSignups_();
  try {
    CacheService.getScriptCache().put('signups_v1', JSON.stringify(signups), DATA_CACHE_TTL);
  } catch (e) { }
  return signups;
}

function readStudentsCached_() {
  try {
    var hit = CacheService.getScriptCache().get('students_v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { }
  var students = readStudents_();
  try {
    CacheService.getScriptCache().put('students_v1', JSON.stringify(students), DATA_CACHE_TTL);
  } catch (e) { }
  return students;
}

function invalidateDataCache_() {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove('signups_v1');
    cache.remove('students_v1');
  } catch (e) { }
}

function apellidoDe_(nombre) {
  var n = String(nombre == null ? '' : nombre).replace(/\s+/g, ' ').trim();
  if (!n) return '';
  var parts = n.split(' ');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : n.toLowerCase();
}

function sortBySurname_(list) {
  return list.sort(function (a, b) {
    var ka = apellidoDe_(a.nombre);
    var kb = apellidoDe_(b.nombre);
    if (ka === kb) return String(a.nombre).localeCompare(String(b.nombre));
    return ka < kb ? -1 : 1;
  });
}

function countByTalk_(signups) {
  var counts = {};
  for (var i = 0; i < signups.length; i++) {
    counts[signups[i].talk_id] = (counts[signups[i].talk_id] || 0) + 1;
  }
  return counts;
}

function slotLabelFor_(slots, slotId) {
  for (var i = 0; i < slots.length; i++) {
    if (Number(slots[i].id) === Number(slotId)) {
      return slots[i].inicio + ' a ' + slots[i].fin;
    }
  }
  return 'Horario ' + slotId;
}

function mineMap_(signups, email) {
  var key = EsiCore.normalizeEmail(email);
  var m = {};
  for (var i = 0; i < signups.length; i++) {
    if (signups[i].emailKey === key) {
      m[Number(signups[i].slot_id)] = signups[i].talk_id;
    }
  }
  return m;
}

function publicData_(ciclo, mine) {
  var cfg = readConfig_();
  var slots = readSlots_();
  var counts = countByTalk_(readSignups_());
  var talks = readTalks_()
    .filter(function (t) {
      return t.ciclo === ciclo && t.activa;
    })
    .map(function (t) {
      return {
        id: t.id,
        titulo: t.titulo,
        slot_id: t.slot_id,
        lugar: t.lugar,
        cupo: Number(t.cupo),
        restantes: Math.max(0, Number(t.cupo) - (counts[t.id] || 0))
      };
    });
  return {
    evento_abierto: isOpen_(cfg),
    slots: slots.map(function (s) {
      return { id: Number(s.id), label: s.inicio + ' a ' + s.fin, nombre: s.nombre };
    }),
    talks: talks,
    mine: mine || {}
  };
}

function buildStudent_(email, nombre, curso) {
  var norm = EsiCore.normalizeEmail(email);
  if (!EsiCore.isValidEmail(norm)) return { ok: false, error: 'email' };
  var roster = readStudents_();
  var entry = findStudent_(roster, norm);
  if (roster.length && !entry) return { ok: false, error: 'notInRoster' };
  var n = entry && entry.nombre ? entry.nombre : nombre;
  var pc = entry ? EsiCore.parseCurso(entry.curso) : null;
  var c = pc || curso;
  var v = EsiCore.validateStudentInput(norm, n, c);
  if (!v.ok) return v;
  return { ok: true, student: v, rosterLoaded: roster.length > 0 };
}

function apiLookup(email) {
  try {
    var norm = EsiCore.normalizeEmail(email);
    if (!EsiCore.isValidEmail(norm)) {
      return { ok: false, message: STUDENT_ERRORS_.email };
    }
    var roster = readStudents_();
    var entry = findStudent_(roster, norm);
    if (roster.length && !entry) {
      return { ok: false, message: STUDENT_ERRORS_.notInRoster };
    }
    var nombre = entry && entry.nombre ? entry.nombre : '';
    var curso = entry && entry.curso ? entry.curso : '';
    var pc = EsiCore.parseCurso(curso);
    return {
      ok: true,
      rosterLoaded: roster.length > 0,
      needsNombre: !nombre,
      needsCurso: !pc,
      nombre: nombre,
      curso: pc || ''
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiGetData(email, nombre, curso) {
  try {
    var bs = buildStudent_(email, nombre, curso);
    if (!bs.ok) {
      return { ok: false, message: STUDENT_ERRORS_[bs.error] || 'Datos inválidos.' };
    }
    var s = bs.student;
    var mine = mineMap_(readSignups_(), s.email);
    return {
      ok: true,
      student: { email: s.email, nombre: s.nombre, curso: s.curso, ciclo: s.ciclo },
      data: publicData_(s.ciclo, mine)
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiRegister(email, nombre, curso, talkId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return registerLocked_(email, nombre, curso, talkId);
  } finally {
    lock.releaseLock();
  }
}

function registerLocked_(email, nombre, curso, talkId) {
  try {
    var bs = buildStudent_(email, nombre, curso);
    if (!bs.ok) {
      return { ok: false, message: STUDENT_ERRORS_[bs.error] || 'Datos inválidos.' };
    }
    var s = bs.student;

    var abierto = isOpen_(readConfig_());
    var slots = readSlots_();
    var talks = readTalks_();
    var talksById = {};
    for (var i = 0; i < talks.length; i++) {
      talksById[talks[i].id] = talks[i];
    }
    var signups = readSignups_();
    var mine = mineMap_(signups, s.email);
    talkId = String(talkId || '');
    var talk = talksById[talkId];

    if (!abierto) {
      return { ok: false, message: ERROR_MESSAGES_.closed, data: publicData_(s.ciclo, mine) };
    }
    if (!talk) {
      return { ok: false, message: ERROR_MESSAGES_.talkNotFound, data: publicData_(s.ciclo, mine) };
    }
    if (!talk.activa) {
      return { ok: false, message: ERROR_MESSAGES_.talkInactive, data: publicData_(s.ciclo, mine) };
    }
    if (talk.ciclo !== s.ciclo) {
      return { ok: false, message: ERROR_MESSAGES_.talkWrongCycle, data: publicData_(s.ciclo, mine) };
    }

    var plan = EsiCore.planRegistration(signups, talksById, {
      emailKey: s.emailKey,
      ciclo: s.ciclo
    }, talkId);

    if (plan.error) {
      return { ok: false, message: ERROR_MESSAGES_[plan.error] || 'No se pudo anotar.', data: publicData_(s.ciclo, mine) };
    }

    if (plan.action !== 'none') {
      var fresh = readSignups_();
      var targetCount = countByTalk_(fresh)[talkId] || 0;
      if (targetCount >= Number(talk.cupo)) {
        return {
          ok: false,
          message: ERROR_MESSAGES_.full,
          data: publicData_(s.ciclo, mineMap_(fresh, s.email))
        };
      }
    }

    var message = '';
    if (plan.action === 'insert') {
      var slot = slotLabelFor_(slots, talk.slot_id);
      sheet_(SIGNUPS_SHEET).appendRow([
        Utilities.getUuid(),
        new Date(),
        s.email,
        s.nombre,
        s.curso,
        s.ciclo,
        Number(talk.slot_id),
        talkId
      ]);
      message = 'Listo, quedaste anotado.';
    } else if (plan.action === 'change') {
      var row = findSignupRow_(plan.signupId);
      if (!row) throw new Error('Inscripción anterior no encontrada');
      var sh = sheet_(SIGNUPS_SHEET);
      sh.getRange(row, 2).setValue(new Date());
      sh.getRange(row, 8).setValue(talkId);
      message = 'Cambiaste tu charla de ese horario a ' + talk.titulo + '.';
    } else {
      message = 'Ya estabas anotado.';
    }

    var fresh = readSignups_();
    invalidateDataCache_();
    rebuildReport_();
    return {
      ok: true,
      message: message,
      student: { email: s.email, nombre: s.nombre, curso: s.curso, ciclo: s.ciclo },
      data: publicData_(s.ciclo, mineMap_(fresh, s.email))
    };
  } catch (err) {
    return { ok: false, message: 'Error inesperado: ' + (err && err.message ? err.message : err) };
  }
}

function findSignupRow_(id) {
  var sh = sheet_(SIGNUPS_SHEET);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return i + 1;
  }
  return 0;
}

function getAdminPin_() {
  return String(PropertiesService.getScriptProperties().getProperty(ADMIN_PIN_PROP) || '').trim();
}

function getGuidePin_() {
  return String(PropertiesService.getScriptProperties().getProperty(GUIDE_PIN_PROP) || '').trim();
}

function adminAuth_(cred) {
  var given = String(cred == null ? '' : cred).trim();
  if (given.indexOf(ADMIN_TOKEN_PREFIX) === 0) {
    return adminTokenAuth_(given);
  }
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var blockedUntil = Number(props.getProperty(ADMIN_BLOCK_PROP) || 0);
  if (blockedUntil > now) {
    return { ok: false, message: 'Demasiados intentos. Esperá un minuto.' };
  }
  if (!getAdminPin_() && !getGuidePin_()) {
    return { ok: false, message: 'Clave no configurada. Ejecutá setup().' };
  }
  if (given && given === getAdminPin_()) {
    resetAdminFailures_();
    return { ok: true, role: ROLE_ADMIN };
  }
  if (given && given === getGuidePin_()) {
    resetAdminFailures_();
    return { ok: true, role: ROLE_GUIDE };
  }
  noteAdminFailure_(now);
  return { ok: false, message: 'Clave incorrecta.' };
}

function adminTokenAuth_(token) {
  try {
    var hit = CacheService.getScriptCache().get(tokenCacheKey_(token));
    if (hit === ROLE_ADMIN || hit === ROLE_GUIDE) {
      return { ok: true, role: hit };
    }
  } catch (e) { }
  return { ok: false, message: 'Sesión vencida. Entrá de nuevo.' };
}

function tokenCacheKey_(token) {
  return 'admin_tok_' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token))
    .map(function (b) {
      return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
    }).join('');
}

function adminIssueToken_(role) {
  try {
    var raw = Utilities.getUuid() + Utilities.getUuid();
    var token = ADMIN_TOKEN_PREFIX + raw.replace(/-/g, '');
    CacheService.getScriptCache().put(tokenCacheKey_(token), role || ROLE_ADMIN, ADMIN_TOKEN_TTL);
    return token;
  } catch (e) {
    return '';
  }
}

function isAdmin_(auth) {
  return !!(auth && auth.ok && auth.role === ROLE_ADMIN);
}

function requireAdmin_(auth) {
  if (!auth || !auth.ok) return { ok: false, message: auth && auth.message ? auth.message : 'Clave incorrecta.' };
  if (auth.role !== ROLE_ADMIN) {
    return { ok: false, message: 'Tu clave no permite esta acción.' };
  }
  return { ok: true };
}

function noteAdminFailure_(now) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return; }
  try {
    var props = PropertiesService.getScriptProperties();
    var fails = Number(props.getProperty(ADMIN_FAIL_PROP) || 0) + 1;
    if (fails >= ADMIN_MAX_FAILS) {
      props.setProperty(ADMIN_BLOCK_PROP, String(now + ADMIN_BLOCK_MS));
      props.deleteProperty(ADMIN_FAIL_PROP);
    } else {
      props.setProperty(ADMIN_FAIL_PROP, String(fails));
    }
  } finally {
    lock.releaseLock();
  }
}

function resetAdminFailures_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(ADMIN_FAIL_PROP);
  props.deleteProperty(ADMIN_BLOCK_PROP);
}

function apiAdminLogin(pin) {
  try {
    var auth = adminAuth_(pin);
    if (!auth.ok) return { ok: false, message: auth.message };
    var token = adminIssueToken_(auth.role);
    return token ? { ok: true, role: auth.role, token: token } : { ok: true, role: auth.role };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminGetData(cred) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var admin = isAdmin_(auth);
    var cfg = readConfig_();
    var slots = readSlots_();
    var talks = readTalks_();
    var students = readStudents_();
    var signupsRaw = readSignupsCached_();
    var counts = countByTalk_(signupsRaw);
    var titulos = {};
    for (var t = 0; t < talks.length; t++) {
      titulos[talks[t].id] = talks[t].titulo;
    }
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var signups = admin ? signupsRaw.map(function (s) {
      return {
        id: s.id,
        cuando: s.ts ? Utilities.formatDate(s.ts, tz, 'dd/MM HH:mm') : '',
        email: s.email,
        nombre: s.nombre,
        curso: s.curso,
        ciclo: s.ciclo,
        slotLabel: slotLabelFor_(slots, s.slot_id),
        talkTitulo: titulos[s.talk_id] || s.talk_id
      };
    }) : [];
    var porCiclo = { basico: 0, orientado: 0 };
    for (var c = 0; c < signups.length; c++) {
      if (porCiclo[signups[c].ciclo] != null) porCiclo[signups[c].ciclo]++;
    }
    var talksOut = talks.map(function (t) {
      return {
        id: t.id,
        titulo: t.titulo,
        ciclo: t.ciclo,
        slot_id: t.slot_id,
        cupo: Number(t.cupo),
        activa: !!t.activa,
        anotados: counts[t.id] || 0
      };
    });
    return {
      ok: true,
      role: auth.role,
      evento_abierto: isOpen_(cfg),
      rosterLoaded: students.length > 0,
      rosterCount: students.length,
      slots: slots.map(function (s) {
        return { id: Number(s.id), label: s.inicio + ' a ' + s.fin, nombre: s.nombre };
      }),
      talks: talksOut,
      signups: signups,
      total: signups.length,
      porCiclo: porCiclo
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminSetOpen(cred, open) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    writeConfig_('evento_abierto', open ? 'abierto' : 'cerrado');
    return { ok: true, evento_abierto: !!open };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function apiAdminDeleteSignup(cred, signupId) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var row = findSignupRow_(signupId);
    if (!row) return { ok: false, message: 'No encontramos esa inscripción.' };
    sheet_(SIGNUPS_SHEET).deleteRow(row);
    invalidateDataCache_();
    rebuildReport_();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function apiAdminImportRoster(cred, text, mode) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var parsed = EsiCore.parseRoster(String(text == null ? '' : text));
    if (!parsed.rows.length) {
      return {
        ok: false,
        message: 'No hay mails válidos.',
        invalidos: parsed.invalidos.length,
        duplicados: parsed.duplicados
      };
    }
    var sh = sheet_(STUDENTS_SHEET);
    var replace = String(mode || 'agregar') === 'reemplazar';
    var byEmail = {};
    var ordered = [];
    if (!replace) {
      var existing = readStudents_();
      for (var i = 0; i < existing.length; i++) {
        byEmail[existing[i].email] = existing[i];
        ordered.push(existing[i].email);
      }
    }
    var nuevos = 0;
    var actualizados = 0;
    for (var j = 0; j < parsed.rows.length; j++) {
      var r = parsed.rows[j];
      if (byEmail[r.email]) {
        var before = byEmail[r.email];
        if (before.nombre !== r.nombre || before.curso !== r.curso) actualizados++;
        byEmail[r.email] = r;
      } else {
        byEmail[r.email] = r;
        ordered.push(r.email);
        nuevos++;
      }
    }
    var outRows = [];
    for (var k = 0; k < ordered.length; k++) {
      var s = byEmail[ordered[k]];
      outRows.push([s.email, s.nombre || '', s.curso || '']);
    }
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, Math.max(3, sh.getLastColumn())).clearContent();
    sh.getRange(2, 1, outRows.length, 3).setValues(outRows);
    invalidateDataCache_();
    return {
      ok: true,
      total: outRows.length,
      nuevos: nuevos,
      actualizados: actualizados,
      invalidos: parsed.invalidos.length,
      duplicados: parsed.duplicados,
      modo: replace ? 'reemplazar' : 'agregar'
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function apiAdminTalkRoster(cred, talkId) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var admin = isAdmin_(auth);
    var talks = readTalks_();
    var slots = readSlots_();
    var talk = null;
    for (var i = 0; i < talks.length; i++) {
      if (String(talks[i].id) === String(talkId)) { talk = talks[i]; break; }
    }
    if (!talk) return { ok: false, message: 'No encontramos esa charla.' };
    var signups = readSignupsCached_();
    var rows = [];
    for (var j = 0; j < signups.length; j++) {
      if (String(signups[j].talk_id) !== String(talk.id)) continue;
      var row = {
        id: signups[j].id,
        nombre: signups[j].nombre,
        curso: signups[j].curso,
        slotLabel: slotLabelFor_(slots, signups[j].slot_id),
        presente: !!signups[j].presente
      };
      if (admin) row.email = signups[j].email;
      rows.push(row);
    }
    sortBySurname_(rows);
    var presentes = 0;
    for (var p = 0; p < rows.length; p++) {
      if (rows[p].presente) presentes++;
    }
    return {
      ok: true,
      role: auth.role,
      talk: {
        id: talk.id,
        titulo: talk.titulo,
        ciclo: talk.ciclo,
        slot_id: talk.slot_id,
        slotLabel: slotLabelFor_(slots, talk.slot_id),
        lugar: talk.lugar,
        cupo: Number(talk.cupo)
      },
      count: rows.length,
      presentes: presentes,
      students: rows
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminSetPresent(cred, signupId, present) {
  var auth = adminAuth_(cred);
  if (!auth.ok) return { ok: false, message: auth.message };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_(SIGNUPS_SHEET);
    var row = findSignupRow_(signupId);
    if (!row) return { ok: false, message: 'No encontramos esa inscripción.' };
    var col = presenteCol_(sh);
    sh.getRange(row, col).setValue(present ? 'si' : 'no');
    invalidateDataCache_();
    return { ok: true, presente: !!present };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function apiAdminPending(cred) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var admin = isAdmin_(auth);
    var students = readStudentsCached_();
    var signups = readSignupsCached_();
    var slots = readSlots_();
    var byEmail = {};
    for (var i = 0; i < signups.length; i++) {
      var key = signups[i].emailKey;
      if (!byEmail[key]) byEmail[key] = {};
      byEmail[key][signups[i].slot_id] = true;
    }
    var rows = [];
    for (var j = 0; j < students.length; j++) {
      var st = students[j];
      var done = byEmail[st.email] || {};
      var faltan = [];
      for (var s = 0; s < slots.length; s++) {
        if (!done[Number(slots[s].id)]) {
          faltan.push(slots[s].nombre || String(slots[s].id));
        }
      }
      if (!faltan.length) continue;
      var row = {
        nombre: st.nombre || '',
        curso: st.curso || '',
        faltan: faltan
      };
      if (admin) row.email = st.email;
      rows.push(row);
    }
    sortBySurname_(rows);
    return {
      ok: true,
      role: auth.role,
      total: students.length,
      pending: rows.length,
      students: rows
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

var REPORTE_SHEET = 'Reporte';

function rebuildReport_() {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(REPORTE_SHEET) || ss.insertSheet(REPORTE_SHEET);
    var slots = readSlots_();
    var talks = readTalks_();
    var agg = EsiCore.aggregateTalks(readSignups_(), talks);
    var cfg = readConfig_();
    var rows = [];
    rows.push(['Estado', isOpen_(cfg) ? 'INSCRIPCIÓN ABIERTA' : 'INSCRIPCIÓN CERRADA', '', 'Actualizado', new Date(), '', 'Total', agg.total]);
    rows.push(['ID', 'Ciclo', 'Horario', 'Charla', 'Lugar', 'Cupo', 'Anotados', 'Restantes']);
    var cicloLabel = { basico: 'Básico', orientado: 'Orientado' };
    for (var i = 0; i < agg.rows.length; i++) {
      var t = agg.rows[i];
      rows.push([
        t.id,
        cicloLabel[t.ciclo] || t.ciclo,
        slotLabelFor_(slots, t.slot_id),
        t.titulo,
        t.lugar,
        t.cupo,
        t.anotados,
        t.restantes
      ]);
    }
    rows.push(['', '', '', 'Ciclo Básico', '', '', agg.porCiclo.basico, '']);
    rows.push(['', '', '', 'Ciclo Orientado', '', '', agg.porCiclo.orientado, '']);
    var width = 8;
    var lastRow = sh.getMaxRow();
    if (lastRow > 0) sh.getRange(1, 1, lastRow, Math.max(width, sh.getLastColumn() || width)).clearContent();
    sh.getRange(1, 1, rows.length, width).setValues(rows);
    sh.setFrozenRows(2);
  } catch (e) {
    Logger.log('rebuildReport_ fallo: ' + e);
  }
}
