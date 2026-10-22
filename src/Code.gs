var CONFIG_SHEET = 'Config';
var SLOTS_SHEET = 'Slots';
var TALKS_SHEET = 'Talks';
var SIGNUPS_SHEET = 'Signups';
var STUDENTS_SHEET = 'Students';
var SESSIONS_SHEET = 'Sessions';
var MAX_EMAIL_ = 120;
var INSTITUTIONAL_DOMAIN = '@secundariosalsipuedes.edu.ar';
var ADMIN_PIN_PROP = 'ADMIN_PIN';
var GUIDE_PIN_PROP = 'GUIDE_PIN';
var ADMIN_FAIL_PROP = 'ADMIN_FAIL_COUNT';
var ADMIN_BLOCK_PROP = 'ADMIN_BLOCK_UNTIL';
var ADMIN_MAX_FAILS = 5;
var ADMIN_BLOCK_MS = 60000;
var ADMIN_TOKEN_PREFIX = 't_';
var ADMIN_TOKEN_TTL = 7200;
var STUDENT_TOKEN_PREFIX = 's_';
var STUDENT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var STUDENT_SESSION_GRACE_MS = 24 * 60 * 60 * 1000;
// 2026-11-04 23:59:59 -03. Sessions can live 24 h past the event.
var EVENT_DEFAULT_DATE_ = '2026-11-04';
var EVENT_DEFAULT_TZ_ = 'America/Argentina/Cordoba';
var EVENT_TITLE_ = 'Jornada ESI 2026';
var REMINDER_BATCH_ = 20;
var REMINDER_MAX_BATCH_ = 40;
var ROLE_ADMIN = 'admin';
var ROLE_GUIDE = 'guide';
var DATA_CACHE_TTL = 12;
var BUSY_MESSAGE = 'El servidor está ocupado. Probá de nuevo.';
var REGISTER_LOCK_MS = 8000;
var ADMIN_LOCK_MS = 5000;

var ERROR_MESSAGES_ = {
  full: 'Sin lugares.',
  talkNotFound: 'No encontramos esa charla.',
  talkInactive: 'Esa charla no está disponible.',
  talkWrongCycle: 'Esa charla no es de tu ciclo.',
  closed: 'La inscripción está cerrada.'
};

var STUDENT_ERRORS_ = {
  email: 'Escribí tu mail institucional.',
  nombre: 'Escribí tu nombre.',
  apellido: 'Escribí tu apellido.',
  curso: 'Elegí año y división.',
  notInRoster: 'Ese mail no está en la lista.',
  domain: 'Usá tu mail institucional @secundariosalsipuedes.edu.ar.'
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

  function isInstitutionalEmail(email) {
    var e = normalizeEmail(email);
    if (!isValidEmail(e)) return false;
    return e.slice(e.indexOf('@')) === INSTITUTIONAL_DOMAIN;
  }
  function normalizeDni(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function isValidDni(value) {
    return /^\d{7,8}$/.test(String(value == null ? '' : value));
  }

  function cicloFromCurso(curso) {
    var m = String(curso == null ? '' : curso).match(/\d/);
    if (!m) return null;
    var year = Number(m[0]);
    if (year >= 1 && year <= 3) return 'basico';
    if (year >= 4 && year <= 6) return 'orientado';
    return null;
  }

  function validateStudentInput(email, nombre, curso, apellido) {
    var e = normalizeEmail(email);
    if (!isValidEmail(e)) return { ok: false, error: 'email' };
    var n = String(nombre == null ? '' : nombre).replace(/\s+/g, ' ').trim();
    var ap = String(apellido == null ? '' : apellido).replace(/\s+/g, ' ').trim();
    if (n.length < 2 || n.length > 60) return { ok: false, error: 'nombre' };
    if (ap && (ap.length < 2 || ap.length > 60)) return { ok: false, error: 'apellido' };
    var ciclo = cicloFromCurso(curso);
    if (!ciclo) return { ok: false, error: 'curso' };
    var c = String(curso == null ? '' : curso).replace(/\s+/g, ' ').trim();
    var completa = n;
    if (ap && normalizeText(n).slice(-normalizeText(ap).length) !== normalizeText(ap)) completa = n + ' ' + ap;
    return {
      ok: true,
      email: e,
      nombre: completa,
      apellido: ap,
      curso: c,
      ciclo: ciclo,
      nombreKey: normalizeText(completa),
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
    var seenDni = {};
    var duplicados = 0;
    var dnisDuplicados = 0;
    var firstIdx = -1;
    for (var p = 0; p < raw.length; p++) {
      if (raw[p].replace(/[^A-Za-z0-9@.]/g, '').trim()) {
        if (firstIdx < 0) firstIdx = p;
        break;
      }
    }
    function clean(value) {
      return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }
    function cells(line) {
      return String(line == null ? '' : line)
        .replace(/\t/g, ';')
        .replace(/,/g, ';')
        .replace(/\s*;\s*/g, ';')
        .split(';')
        .map(clean);
    }
    function headerMap(cols) {
      var map = {};
      for (var i = 0; i < cols.length; i++) {
        var h = normalizeText(cols[i]);
        if (!h) continue;
        if (/^(mail|email|correo|e-mail)$/.test(h)) map.email = i;
        else if (/^(apellido|apellidos)$/.test(h)) map.apellido = i;
        else if (/^(nombre|nombres)$/.test(h)) map.nombre = i;
        else if (/^(nombre completo|nombre y apellido|apellido y nombre|alumno|alumna)$/.test(h)) map.completo = i;
        else if (/^(curso|division|a\u00F1o|ano)$/.test(h)) map.curso = i;
        else if (/^(dni|documento|doc)$/.test(h)) map.dni = i;
      }
      if (map.email == null) return null;
      if (map.apellido == null && map.nombre == null && map.completo == null) return null;
      return map;
    }
    var header = null;
    for (var i = 0; i < raw.length; i++) {
      var cols = cells(raw[i]);
      if (!cols[0]) continue;
      if (i === firstIdx) {
        header = headerMap(cols);
        if (header) continue;
        if (/mail|correo/.test(normalizeText(cols[0])) && !isValidEmail(normalizeEmail(cols[0]))) continue;
      }
      var email = normalizeEmail(cols[0]);
      var apellido = '';
      var nombre = '';
      var completo = '';
      var cursoRaw = '';
      var dniRaw = '';
      if (header) {
        email = normalizeEmail(cols[header.email]);
        if (header.apellido != null) apellido = cols[header.apellido] || '';
        if (header.completo != null) completo = cols[header.completo] || '';
        else if (header.nombre != null) nombre = cols[header.nombre] || '';
        if (header.curso != null) cursoRaw = cols[header.curso] || '';
        if (header.dni != null) dniRaw = cols[header.dni] || '';
      } else if (cols.length >= 5) {
        apellido = cols[1];
        nombre = cols[2];
        cursoRaw = cols[3];
        dniRaw = cols[4];
      } else if (cols.length === 4) {
        apellido = cols[1];
        nombre = cols[2];
        cursoRaw = cols[3];
      } else if (cols.length === 3) {
        completo = cols[1];
        cursoRaw = cols[2];
      } else if (cols.length === 2) {
        completo = cols[1];
      }
      if (!email) continue;
      if (seen[email]) { duplicados++; continue; }
      if (!isValidEmail(email)) {
        invalidos.push({ linea: i + 1, texto: cols.join(';').slice(0, 80) });
        continue;
      }
      seen[email] = true;
      var dni = normalizeDni(dniRaw);
      if (!isValidDni(dni)) dni = '';
      if (dni && seenDni[dni]) {
        dnisDuplicados++;
        dni = '';
      }
      if (dni) seenDni[dni] = true;
      var nombreCompleto = completo || clean([nombre, apellido].filter(Boolean).join(' '));
      if (completo) {
        nombre = completo;
        apellido = '';
      }
      rows.push({
        email: email,
        apellido: apellido,
        nombre: nombre,
        nombreCompleto: nombreCompleto,
        curso: parseCurso(cursoRaw) || '',
        dni: dni
      });
    }
    return { rows: rows, invalidos: invalidos, duplicados: duplicados, dnisDuplicados: dnisDuplicados };
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
    isInstitutionalEmail: isInstitutionalEmail,
    normalizeDni: normalizeDni,
    isValidDni: isValidDni,
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


var MESES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function eventDateLabel_(cfg) {
  var raw = eventDate_(cfg);
  var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return Number(m[3]) + ' de ' + MESES_[Number(m[2]) - 1] + ' de ' + m[1];
}

function reminderRecipients_() {
  var signups = readSignupsCached_();
  var slots = readSlotsCached_();
  var talks = readTalksCached_();
  var talkById = {};
  for (var t = 0; t < talks.length; t++) talkById[String(talks[t].id)] = talks[t];
  var byEmail = {};
  var order = [];
  for (var i = 0; i < signups.length; i++) {
    var sg = signups[i];
    var key = EsiCore.normalizeEmail(sg.email);
    if (!key) continue;
    if (!byEmail[key]) {
      byEmail[key] = { email: key, nombre: '', apellido: '', curso: '', bySlot: {} };
      order.push(key);
    }
    var row = byEmail[key];
    if (!row.nombre) row.nombre = sg.nombre || '';
    if (!row.apellido) row.apellido = sg.apellido || '';
    if (!row.curso) row.curso = sg.curso || '';
    if (!row.bySlot[Number(sg.slot_id)]) row.bySlot[Number(sg.slot_id)] = sg;
  }
  var out = [];
  for (var j = 0; j < order.length; j++) {
    var r = byEmail[order[j]];
    var items = [];
    for (var k = 0; k < slots.length; k++) {
      var choice = r.bySlot[Number(slots[k].id)];
      var info = choice ? talkById[String(choice.talk_id)] : null;
      items.push({
        slot: slots[k].nombre,
        inicio: slots[k].inicio,
        fin: slots[k].fin,
        titulo: info ? info.titulo : '',
        lugar: info ? (info.lugar || '') : '',
        elegida: !!info
      });
    }
    out.push({
      email: r.email,
      nombre: givenName_(r.nombre, r.apellido),
      apellido: r.apellido,
      nombreCompleto: r.nombre,
      curso: r.curso,
      items: items
    });
  }
  out.sort(function (a, b) {
    var c = String(a.apellido || '').localeCompare(String(b.apellido || ''), 'es', { sensitivity: 'base' });
    if (c) return c;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });
  return out;
}

function reminderSubject_(cfg) {
  return 'Recordatorio: ' + EVENT_TITLE_ + ' del ' + eventDateLabel_(cfg);
}

function reminderBody_(r, cfg) {
  var lines = [
    'Hola ' + (r.nombre || '') + ':',
    '',
    'Te recordamos que el ' + eventDateLabel_(cfg) + ' es la ' + EVENT_TITLE_ + '.',
    '',
    'Tus charlas:'
  ];
  for (var i = 0; i < r.items.length; i++) {
    var it = r.items[i];
    var when = it.slot + ' (' + it.inicio + ' a ' + it.fin + ')';
    if (it.elegida) {
      lines.push('- ' + when + ': ' + it.titulo + (it.lugar ? ' (' + it.lugar + ')' : ''));
    } else {
      lines.push('- ' + when + ': todavía no elegiste.');
    }
  }
  lines.push('');
  lines.push('Llegá 10 minutos antes de cada charla. Si no podés asistir, avisale a un preceptor.');
  lines.push('');
  lines.push('Equipo ESI');
  return lines.join('\n');
}

function mailQuota_() {
  try {
    if (typeof MailApp === 'undefined' || !MailApp) return -1;
    return Number(MailApp.getRemainingDailyQuota());
  } catch (e) {
    return -1;
  }
}

function apiAdminMailPreview(cred) {
  var auth = adminAuth_(cred);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.role !== ROLE_ADMIN) return { ok: false, message: 'Tu clave no permite esta acción.' };
  try {
    var cfg = readConfigCached_();
    var rows = reminderRecipients_();
    var sample = rows[0] || null;
    return {
      ok: true,
      total: rows.length,
      subject: reminderSubject_(cfg),
      sample: sample ? { nombre: sample.nombre, curso: sample.curso, body: reminderBody_(sample, cfg) } : null,
      quota: mailQuota_(),
      batchSize: REMINDER_BATCH_,
      event: eventInfo_(cfg)
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminSendReminders(cred, offset, limit) {
  var auth = adminAuth_(cred);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.role !== ROLE_ADMIN) return { ok: false, message: 'Tu clave no permite esta acción.' };
  if (mailQuota_() < 0) return { ok: false, message: 'El envío de mails no está disponible.' };
  var quota = mailQuota_();
  if (quota <= 0) return { ok: false, message: 'No queda cuota de mails por hoy.' };
  try {
    var cfg = readConfigCached_();
    var rows = reminderRecipients_();
    var start = Math.max(0, Number(offset) || 0);
    var take = Math.min(REMINDER_MAX_BATCH_, Math.max(1, Number(limit) || REMINDER_BATCH_));
    var end = Math.min(rows.length, start + take, start + quota);
    var subject = reminderSubject_(cfg);
    var sent = 0;
    var failed = 0;
    for (var i = start; i < end; i++) {
      try {
        MailApp.sendEmail({
          to: rows[i].email,
          subject: subject,
          body: reminderBody_(rows[i], cfg),
          name: EVENT_TITLE_
        });
        sent++;
      } catch (err) {
        failed++;
      }
    }
    return {
      ok: true,
      sent: sent,
      failed: failed,
      total: rows.length,
      nextOffset: end,
      done: end >= rows.length,
      quota: Math.max(0, quota - sent)
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

var API_FN_MAP_ = {
  apiBootstrap: apiBootstrap,
  apiLookup: apiLookup,
  apiGetData: apiGetData,
  apiResumeSession: apiResumeSession,
  apiStudentLogout: apiStudentLogout,
  apiRegister: apiRegister,
  apiAdminLogin: apiAdminLogin,
  apiAdminGetData: apiAdminGetData,
  apiAdminSetOpen: apiAdminSetOpen,
  apiAdminDeleteSignup: apiAdminDeleteSignup,
  apiAdminImportRoster: apiAdminImportRoster,
  apiAdminTalkRoster: apiAdminTalkRoster,
  apiAdminPending: apiAdminPending,
  apiAdminSetPresent: apiAdminSetPresent,
  apiAdminReports: apiAdminReports,
  apiAdminMailPreview: apiAdminMailPreview,
  apiAdminSendReminders: apiAdminSendReminders
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
  ensureConfigDefault_('evento_fecha', EVENT_DEFAULT_DATE_);
  ensureConfigDefault_('evento_zona', EVENT_DEFAULT_TZ_);
  ensureSheet_(ss, SLOTS_SHEET, ['id', 'nombre', 'inicio', 'fin', 'orden'], [
    [1, '1ra', '10:30', '11:20', 1],
    [2, '2da', '11:30', '12:20', 2],
    [3, '3ra', '12:30', '13:30', 3]
  ]);
  ensureSheet_(ss, TALKS_SHEET, ['id', 'titulo', 'ciclo', 'slot_id', 'lugar', 'cupo', 'activa'], seedTalks_());
  ensureSheet_(ss, STUDENTS_SHEET, ['email', 'nombre', 'curso'], []);
  ensureSheet_(ss, SESSIONS_SHEET, ['token_hash', 'email', 'nombre', 'curso', 'ciclo', 'created_at', 'expires_at', 'revoked'], []);
  ensureSheet_(ss, SIGNUPS_SHEET, ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id'], []);
  var signupsSh = sheet_(SIGNUPS_SHEET);
  ensureColumn_(signupsSh, 'presente');
  ensureColumn_(signupsSh, 'apellido');
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

function ensureConfigDefault_(key, value) {
  var cfg = readConfig_();
  if (cfg[key] == null || String(cfg[key]).trim() === '') writeConfig_(key, value);
}

function eventDate_(cfg) {
  var raw = String((cfg && cfg.evento_fecha) || EVENT_DEFAULT_DATE_).trim();
  var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + (m[2].length < 2 ? '0' + m[2] : m[2]) + '-' + (m[1].length < 2 ? '0' + m[1] : m[1]);
  return EVENT_DEFAULT_DATE_;
}

function eventInfo_(cfg) {
  return {
    fecha: eventDate_(cfg),
    zona: String((cfg && cfg.evento_zona) || EVENT_DEFAULT_TZ_).trim() || EVENT_DEFAULT_TZ_
  };
}

function eventDayEndMs_(cfg) {
  var date = eventDate_(cfg);
  var m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return Date.UTC(2026, 10, 5, 2, 59, 59);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1, 2, 59, 59);
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

function signupsHeaderMap_(head) {
  var map = { presente: -1, apellido: -1 };
  for (var i = 0; i < (head || []).length; i++) {
    var h = EsiCore.normalizeText(head[i]);
    if (h === 'presente') map.presente = i;
    else if (h === 'apellido') map.apellido = i;
  }
  return map;
}

function readSignups_() {
  var vals = sheet_(SIGNUPS_SHEET).getDataRange().getValues();
  var map = signupsHeaderMap_(vals[0]);
  var signups = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === '') continue;
    signups.push({
      id: String(vals[i][0]),
      ts: vals[i][1],
      email: String(vals[i][2]),
      nombre: String(vals[i][3]),
      apellido: map.apellido >= 0 ? String(vals[i][map.apellido] == null ? '' : vals[i][map.apellido]).replace(/\s+/g, ' ').trim() : '',
      curso: String(vals[i][4]),
      ciclo: String(vals[i][5]).trim().toLowerCase(),
      slot_id: Number(vals[i][6]),
      talk_id: String(vals[i][7]),
      presente: map.presente >= 0 ? convertBool_(vals[i][map.presente]) : false,
      emailKey: EsiCore.normalizeEmail(vals[i][2])
    });
  }
  return signups;
}

function appendSignupRow_(student, talk) {
  var sh = sheet_(SIGNUPS_SHEET);
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var row = [];
  for (var i = 0; i < head.length; i++) {
    var key = EsiCore.normalizeText(head[i]);
    if (key === 'id') row.push(Utilities.getUuid());
    else if (key === 'ts') row.push(new Date());
    else if (key === 'email' || key === 'mail') row.push(student.email);
    else if (key === 'nombre') row.push(student.nombre);
    else if (key === 'apellido') row.push(student.apellido || '');
    else if (key === 'curso') row.push(student.curso);
    else if (key === 'ciclo') row.push(student.ciclo);
    else if (key === 'slot_id') row.push(Number(talk.slot_id));
    else if (key === 'talk_id') row.push(String(talk.id));
    else if (key === 'presente') row.push('');
    else row.push('');
  }
  sh.appendRow(row);
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

function studentsHeader_(head) {
  var map = {};
  for (var i = 0; i < (head || []).length; i++) {
    var h = EsiCore.normalizeText(head[i]);
    if (!h) continue;
    if (/^(mail|email|correo|e-mail)$/.test(h)) map.email = i;
    else if (/^(apellido|apellidos)$/.test(h)) map.apellido = i;
    else if (/^(nombre|nombres)$/.test(h)) map.nombre = i;
    else if (/^(nombre completo|nombre y apellido|apellido y nombre|alumno|alumna)$/.test(h)) map.completo = i;
    else if (/^(curso|division|a\u00F1o|ano)$/.test(h)) map.curso = i;
    else if (/^(dni|documento|doc)$/.test(h)) map.dni = i;
  }
  if (map.email == null) return null;
  if (map.apellido == null && map.nombre == null && map.completo == null) return null;
  return map;
}

function readStudents_() {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(STUDENTS_SHEET);
    if (!sh) return [];
    var vals = sh.getDataRange().getValues();
    if (!vals.length) return [];
    var map = studentsHeader_(vals[0]);
    function cell(row, idx) {
      return String(row[idx] == null ? '' : row[idx]).replace(/\s+/g, ' ').trim();
    }
    var students = [];
    for (var i = 1; i < vals.length; i++) {
      var row = vals[i];
      var email = EsiCore.normalizeEmail(map ? cell(row, map.email) : cell(row, 0));
      if (!email) continue;
      var apellido = '';
      var nombre = '';
      if (map) {
        if (map.apellido != null) apellido = cell(row, map.apellido);
        if (map.completo != null) nombre = cell(row, map.completo);
        else if (map.nombre != null) nombre = cell(row, map.nombre);
      } else {
        nombre = cell(row, 1);
      }
      var curso = cell(row, map && map.curso != null ? map.curso : 2);
      var dni = map && map.dni != null ? EsiCore.normalizeDni(cell(row, map.dni)) : '';
      if (!EsiCore.isValidDni(dni)) dni = '';
      students.push({
        email: email,
        apellido: apellido,
        nombre: nombre,
        nombreCompleto: apellido && nombre ? nombre + ' ' + apellido : (nombre || apellido),
        curso: curso,
        dni: dni
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
    var hit = CacheService.getScriptCache().get('signups_v2');
    if (hit) return JSON.parse(hit);
  } catch (e) { }
  var signups = readSignups_();
  try {
    CacheService.getScriptCache().put('signups_v2', JSON.stringify(signups), DATA_CACHE_TTL);
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

function readTalksCached_() {
  try {
    var hit = CacheService.getScriptCache().get('talks_v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { }
  var talks = readTalks_();
  try {
    CacheService.getScriptCache().put('talks_v1', JSON.stringify(talks), DATA_CACHE_TTL);
  } catch (e) { }
  return talks;
}

function readSlotsCached_() {
  try {
    var hit = CacheService.getScriptCache().get('slots_v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { }
  var slots = readSlots_();
  try {
    CacheService.getScriptCache().put('slots_v1', JSON.stringify(slots), DATA_CACHE_TTL);
  } catch (e) { }
  return slots;
}

function readConfigCached_() {
  try {
    var hit = CacheService.getScriptCache().get('config_v1');
    if (hit) return JSON.parse(hit);
  } catch (e) { }
  var cfg = readConfig_();
  try {
    CacheService.getScriptCache().put('config_v1', JSON.stringify(cfg), DATA_CACHE_TTL);
  } catch (e) { }
  return cfg;
}

function invalidateDataCache_() {
  try {
    var cache = CacheService.getScriptCache();
    cache.remove('signups_v1');
    cache.remove('signups_v2');
    cache.remove('students_v1');
    cache.remove('talks_v1');
    cache.remove('slots_v1');
    cache.remove('config_v1');
  } catch (e) { }
}

function withScriptLock_(timeoutMs, fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(Number(timeoutMs) || ADMIN_LOCK_MS);
  } catch (e) {
    return { ok: false, busy: true, message: BUSY_MESSAGE };
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

function sortKey_(row) {
  var ap = String(row.apellido == null ? '' : row.apellido).replace(/\s+/g, ' ').trim();
  var nombre = String(row.nombre == null ? '' : row.nombre).replace(/\s+/g, ' ').trim();
  var completo = String(row.nombreCompleto == null ? '' : row.nombreCompleto).replace(/\s+/g, ' ').trim() || nombre;
  if (!ap && completo) {
    var parts = completo.split(' ');
    ap = parts.length > 1 ? parts[parts.length - 1] : completo;
    nombre = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  }
  return { key: ap + ' ' + nombre, full: nombre + ' ' + ap };
}

function sortBySurname_(list) {
  return list.sort(function (a, b) {
    var ka = sortKey_(a);
    var kb = sortKey_(b);
    var c = ka.key.localeCompare(kb.key, 'es', { sensitivity: 'base' });
    if (c) return c;
    c = ka.full.localeCompare(kb.full, 'es', { sensitivity: 'base' });
    if (c) return c;
    return String(a.email || '').localeCompare(String(b.email || ''));
  });
}

function givenName_(full, apellido) {
  var n = String(full == null ? '' : full).replace(/\s+/g, ' ').trim();
  var ap = String(apellido == null ? '' : apellido).replace(/\s+/g, ' ').trim();
  if (!n || !ap) return n;
  var nn = EsiCore.normalizeText(n);
  var na = EsiCore.normalizeText(ap);
  if (nn.length > na.length && nn.slice(-na.length) === na) return n.slice(0, n.length - ap.length).trim();
  return n;
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

function publicData_(ciclo, mine, signupsNow) {
  var cfg = readConfigCached_();
  var slots = readSlotsCached_();
  var counts = countByTalk_(signupsNow || readSignupsCached_());
  var talks = readTalksCached_()
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
    event: eventInfo_(cfg),
    slots: slots.map(function (s) {
      return { id: Number(s.id), label: s.inicio + ' a ' + s.fin, nombre: s.nombre, inicio: s.inicio, fin: s.fin };
    }),
    talks: talks,
    mine: mine || {}
  };
}

function rosterLoaded_() {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(STUDENTS_SHEET);
    return !!(sh && sh.getLastRow() > 1);
  } catch (e) {
    return false;
  }
}

function apiBootstrap() {
  try {
    var cfg = readConfigCached_();
    return {
      ok: true,
      evento_abierto: isOpen_(cfg),
      rosterLoaded: rosterLoaded_(),
      event: eventInfo_(cfg)
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function buildStudent_(email, nombre, curso, apellido) {
  var norm = EsiCore.normalizeEmail(email);
  if (!EsiCore.isInstitutionalEmail(norm)) return { ok: false, error: 'email' };
  var v = EsiCore.validateStudentInput(norm, nombre, curso, apellido);
  if (!v.ok) return v;
  return { ok: true, student: v };
}

function apiLookup(email) {
  try {
    var norm = EsiCore.normalizeEmail(email);
    if (!EsiCore.isInstitutionalEmail(norm)) {
      return {
        ok: false,
        message: STUDENT_ERRORS_.email,
        rosterLoaded: rosterLoaded_(),
        needsNombre: true,
        needsApellido: true,
        needsCurso: true,
        apellido: '',
        nombreCompleto: '',
        nombre: '',
        curso: ''
      };
    }
    return {
      ok: true,
      message: '',
      rosterLoaded: rosterLoaded_(),
      needsNombre: true,
      needsApellido: true,
      needsCurso: true,
      apellido: '',
      nombreCompleto: '',
      nombre: '',
      curso: ''
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

var DNI_MAX_FAILS = 5;
var DNI_BLOCK_MS = 60000;

function dniCacheKey_(dni) {
  var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(dni));
  var out = '';
  for (var i = 0; i < 6; i++) out += ('0' + (sig[i] & 255).toString(16)).slice(-2);
  return 'dni_fail_' + out;
}

function dniFails_(dni) {
  try {
    return Number(CacheService.getScriptCache().get(dniCacheKey_(dni)) || 0);
  } catch (e) {
    return 0;
  }
}

function noteDniFailure_(dni) {
  try {
    var cache = CacheService.getScriptCache();
    var key = dniCacheKey_(dni);
    cache.put(key, String(dniFails_(dni) + 1), Math.ceil(DNI_BLOCK_MS / 1000));
  } catch (e) { }
}

function clearDniFailures_(dni) {
  try {
    CacheService.getScriptCache().remove(dniCacheKey_(dni));
  } catch (e) { }
}

function apiLookupDni(dni, apellido) {
  try {
    var norm = EsiCore.normalizeDni(dni);
    var ap = EsiCore.normalizeText(apellido);
    var valid = EsiCore.isValidDni(norm) && ap.length >= 2 && ap.length <= 60;
    var roster = readStudentsCached_();
    var out = {
      ok: false,
      message: 'No pudimos entrar. Revisá el DNI y el apellido.',
      email: '',
      rosterLoaded: roster.length > 0,
      needsNombre: false,
      needsCurso: false,
      apellido: '',
      nombreCompleto: '',
      nombre: '',
      curso: ''
    };
    if (!valid) return out;
    if (dniFails_(norm) >= DNI_MAX_FAILS) {
      out.message = 'Demasiados intentos. Esperá un minuto.';
      return out;
    }
    var matches = [];
    for (var i = 0; i < roster.length; i++) {
      if (roster[i].dni && roster[i].dni === norm) matches.push(roster[i]);
    }
    var entry = matches.length === 1 ? matches[0] : null;
    if (!entry || EsiCore.normalizeText(entry.apellido) !== ap) {
      noteDniFailure_(norm);
      return out;
    }
    clearDniFailures_(norm);
    var nombreCompleto = entry.nombreCompleto || entry.nombre || '';
    var pc = EsiCore.parseCurso(entry.curso);
    return {
      ok: true,
      message: '',
      email: entry.email,
      rosterLoaded: true,
      needsNombre: !nombreCompleto,
      needsCurso: !pc,
      apellido: entry.apellido || '',
      nombreCompleto: nombreCompleto,
      nombre: entry.nombre || '',
      curso: pc || ''
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiGetData(email, nombre, curso, sessionToken, apellido) {
  try {
    var bs = buildStudent_(email, nombre, curso, apellido);
    if (!bs.ok) {
      return { ok: false, message: STUDENT_ERRORS_[bs.error] || 'Datos inválidos.' };
    }
    var s = bs.student;
    var mine = mineMap_(readSignupsCached_(), s.email);
    var current = sessionToken ? studentSession_(sessionToken) : null;
    if (sessionToken && (!current || current.email !== s.email)) return studentSessionExpired_();
    var session = current ? '' : issueStudentSession_(s);
    return {
      ok: true,
      student: { email: s.email, nombre: s.nombre, apellido: s.apellido, curso: s.curso, ciclo: s.ciclo },
      data: publicData_(s.ciclo, mine),
      session: session
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function studentSessionExpiry_(now) {
  var base = Number(now) || Date.now();
  return Math.min(base + STUDENT_SESSION_TTL_MS, eventDayEndMs_(readConfigCached_()) + STUDENT_SESSION_GRACE_MS);
}

function studentTokenHash_(token) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''))
    .map(function (b) {
      return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
    }).join('');
}

function sessionsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ensureSheet_(ss, SESSIONS_SHEET,
    ['token_hash', 'email', 'nombre', 'curso', 'ciclo', 'created_at', 'expires_at', 'revoked'], []);
  ensureColumn_(sh, 'apellido');
  return sh;
}

function sessionDateMs_(value) {
  if (value instanceof Date) return value.getTime();
  var n = Number(value);
  if (n) return n;
  var t = new Date(value).getTime();
  return isNaN(t) ? 0 : t;
}

function readSessions_() {
  var vals = sessionsSheet_().getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][0] || '').trim()) continue;
    rows.push({
      row: i + 1,
      hash: String(vals[i][0]).trim(),
      email: EsiCore.normalizeEmail(vals[i][1]),
      nombre: String(vals[i][2] == null ? '' : vals[i][2]).replace(/\s+/g, ' ').trim(),
      curso: EsiCore.parseCurso(vals[i][3]) || String(vals[i][3] == null ? '' : vals[i][3]).trim(),
      ciclo: String(vals[i][4] == null ? '' : vals[i][4]).trim().toLowerCase(),
      apellido: String(vals[i][8] == null ? '' : vals[i][8]).replace(/\s+/g, ' ').trim(),
      created: sessionDateMs_(vals[i][5]),
      expires: sessionDateMs_(vals[i][6]),
      revoked: convertBool_(vals[i][7])
    });
  }
  return rows;
}

function studentSession_(token) {
  var raw = String(token == null ? '' : token).trim();
  if (raw.indexOf(STUDENT_TOKEN_PREFIX) !== 0 || raw.length < 8) return null;
  var hash = studentTokenHash_(raw);
  var rows = readSessions_();
  var now = Date.now();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].hash !== hash) continue;
    if (rows[i].revoked || rows[i].expires <= now) return null;
    return rows[i];
  }
  return null;
}

function issueStudentSession_(student) {
  if (!student || !EsiCore.isValidEmail(student.email)) return '';
  var now = Date.now();
  var expires = studentSessionExpiry_(now);
  if (!(expires > now)) return '';
  var raw = STUDENT_TOKEN_PREFIX + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  sessionsSheet_().appendRow([
    studentTokenHash_(raw),
    EsiCore.normalizeEmail(student.email),
    String(student.nombre || '').trim(),
    String(student.curso || '').trim(),
    String(student.ciclo || '').trim(),
    new Date(now),
    new Date(expires),
    false,
    String(student.apellido || '').trim()
  ]);
  return raw;
}

function revokeStudentSession_(token) {
  var raw = String(token == null ? '' : token).trim();
  if (raw.indexOf(STUDENT_TOKEN_PREFIX) !== 0) return false;
  var hash = studentTokenHash_(raw);
  var rows = readSessions_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].hash !== hash) continue;
    sessionsSheet_().getRange(rows[i].row, 8).setValue(true);
    return true;
  }
  return false;
}

function studentSessionExpired_() {
  return { ok: false, expired: true, message: 'Tu sesión venció. Entrá de nuevo.' };
}

function apiResumeSession(token) {
  try {
    var sess = studentSession_(token);
    if (!sess) return studentSessionExpired_();
    var out = apiGetData(sess.email, sess.nombre, sess.curso, token, sess.apellido);
    if (!out.ok) return studentSessionExpired_();
    return {
      ok: true,
      email: out.student.email,
      student: out.student,
      data: out.data
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiStudentLogout(token) {
  try {
    revokeStudentSession_(token);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiRegister(email, nombre, curso, talkId, apellido) {
  var resp = withScriptLock_(REGISTER_LOCK_MS, function () {
    return registerLocked_(email, nombre, curso, talkId, apellido);
  });
  if (resp && resp.busy) return resp;
  if (resp && resp.ok) {
    try { rebuildReport_(); } catch (e) { }
  }
  return resp;
}

function registerLocked_(email, nombre, curso, talkId, apellido) {
  try {
    var bs = buildStudent_(email, nombre, curso, apellido);
    if (!bs.ok) {
      return { ok: false, message: STUDENT_ERRORS_[bs.error] || 'Datos inválidos.' };
    }
    var s = bs.student;

    var abierto = isOpen_(readConfig_());
    var slots = readSlotsCached_();
    var talks = readTalksCached_();
    var talksById = {};
    for (var i = 0; i < talks.length; i++) {
      talksById[talks[i].id] = talks[i];
    }
    var signups = readSignups_();
    var mine = mineMap_(signups, s.email);
    talkId = String(talkId || '');
    var talk = talksById[talkId];

    if (!abierto) {
      return { ok: false, message: ERROR_MESSAGES_.closed, data: publicData_(s.ciclo, mine, signups) };
    }
    if (!talk) {
      return { ok: false, message: ERROR_MESSAGES_.talkNotFound, data: publicData_(s.ciclo, mine, signups) };
    }
    if (!talk.activa) {
      return { ok: false, message: ERROR_MESSAGES_.talkInactive, data: publicData_(s.ciclo, mine, signups) };
    }
    if (talk.ciclo !== s.ciclo) {
      return { ok: false, message: ERROR_MESSAGES_.talkWrongCycle, data: publicData_(s.ciclo, mine, signups) };
    }

    var plan = EsiCore.planRegistration(signups, talksById, {
      emailKey: s.emailKey,
      ciclo: s.ciclo
    }, talkId);

    if (plan.error) {
      return { ok: false, message: ERROR_MESSAGES_[plan.error] || 'No se pudo anotar.', data: publicData_(s.ciclo, mine, signups) };
    }

    if (plan.action !== 'none') {
      var fresh = readSignups_();
      var duplicate = false;
      if (plan.action === 'insert') {
        for (var d = 0; d < fresh.length; d++) {
          if (fresh[d].emailKey === s.emailKey && String(fresh[d].talk_id) === talkId) {
            duplicate = true;
            break;
          }
        }
      }
      if (duplicate) {
        plan = { action: 'none' };
      } else {
        var targetCount = countByTalk_(fresh)[talkId] || 0;
        if (targetCount >= Number(talk.cupo)) {
          return {
            ok: false,
            message: ERROR_MESSAGES_.full,
            data: publicData_(s.ciclo, mineMap_(fresh, s.email), fresh)
          };
        }
      }
    }

    var message = '';
    if (plan.action === 'insert') {
      var slot = slotLabelFor_(slots, talk.slot_id);
      appendSignupRow_(s, talk);
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
    return {
      ok: true,
      message: message,
      student: { email: s.email, nombre: s.nombre, apellido: s.apellido, curso: s.curso, ciclo: s.ciclo },
      data: publicData_(s.ciclo, mineMap_(fresh, s.email), fresh)
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
    var cfg = readConfigCached_();
    var slots = readSlotsCached_();
    var talks = readTalksCached_();
    var students = readStudentsCached_();
    var apellidos = {};
    for (var st = 0; st < students.length; st++) {
      apellidos[students[st].email] = students[st].apellido || '';
    }
    var signupsRaw = readSignupsCached_();
    var counts = countByTalk_(signupsRaw);
    var titulos = {};
    var lugares = {};
    for (var t = 0; t < talks.length; t++) {
      titulos[talks[t].id] = talks[t].titulo;
      lugares[talks[t].id] = talks[t].lugar || '';
    }
    var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    var signups = admin ? signupsRaw.map(function (s) {
      return {
        id: s.id,
        cuando: s.ts ? Utilities.formatDate(s.ts, tz, 'dd/MM HH:mm') : '',
        email: s.email,
        apellido: s.apellido || apellidos[s.emailKey] || '',
        nombre: givenName_(s.nombre, s.apellido || apellidos[s.emailKey] || ''),
        nombreCompleto: s.nombre,
        curso: s.curso,
        ciclo: s.ciclo,
        slotLabel: slotLabelFor_(slots, s.slot_id),
        talkTitulo: titulos[s.talk_id] || s.talk_id,
        lugar: lugares[s.talk_id] || '',
        presente: !!s.presente
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
        return { id: Number(s.id), label: s.inicio + ' a ' + s.fin, nombre: s.nombre, inicio: s.inicio, fin: s.fin };
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
  return withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      writeConfig_('evento_abierto', open ? 'abierto' : 'cerrado');
      invalidateDataCache_();
      return { ok: true, evento_abierto: !!open };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function apiAdminDeleteSignup(cred, signupId) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var resp = withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      var row = findSignupRow_(signupId);
      if (!row) return { ok: false, message: 'No encontramos esa inscripción.' };
      sheet_(SIGNUPS_SHEET).deleteRow(row);
      invalidateDataCache_();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
  if (resp && resp.ok) {
    try { rebuildReport_(); } catch (e) { }
  }
  return resp;
}

function apiAdminImportRoster(cred, text, mode) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  return withScriptLock_(ADMIN_LOCK_MS * 2, function () {
    return importRosterLocked_(auth, text, mode);
  });
}

function importRosterLocked_(auth, text, mode) {
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
        if (before.nombreCompleto !== r.nombreCompleto || before.curso !== r.curso
          || (before.dni || '') !== (r.dni || '')) actualizados++;
        byEmail[r.email] = r;
      } else {
        byEmail[r.email] = r;
        ordered.push(r.email);
        nuevos++;
      }
    }
    var outRows = [['email', 'apellido', 'nombre', 'curso', 'dni']];
    for (var k = 0; k < ordered.length; k++) {
      var s = byEmail[ordered[k]];
      outRows.push([s.email, s.apellido || '', s.nombre || '', s.curso || '', s.dni || '']);
    }
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, Math.max(5, sh.getLastColumn())).clearContent();
    sh.getRange(1, 1, outRows.length, 5).setValues(outRows);
    invalidateDataCache_();
    return {
      ok: true,
      total: outRows.length,
      nuevos: nuevos,
      actualizados: actualizados,
      invalidos: parsed.invalidos.length,
      duplicados: parsed.duplicados,
      dnisDuplicados: parsed.dnisDuplicados || 0,
      modo: replace ? 'reemplazar' : 'agregar'
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminTalkRoster(cred, talkId) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var admin = isAdmin_(auth);
    var talks = readTalksCached_();
    var slots = readSlotsCached_();
    var talk = null;
    for (var i = 0; i < talks.length; i++) {
      if (String(talks[i].id) === String(talkId)) { talk = talks[i]; break; }
    }
    if (!talk) return { ok: false, message: 'No encontramos esa charla.' };
    var roster = readStudentsCached_();
    var apellidos = {};
    for (var r = 0; r < roster.length; r++) {
      apellidos[roster[r].email] = roster[r].apellido || '';
    }
    var signups = readSignupsCached_();
    var rows = [];
    for (var j = 0; j < signups.length; j++) {
      if (String(signups[j].talk_id) !== String(talk.id)) continue;
      var row = {
        id: signups[j].id,
        apellido: signups[j].apellido || apellidos[signups[j].emailKey] || '',
        nombre: givenName_(signups[j].nombre, signups[j].apellido || apellidos[signups[j].emailKey] || ''),
        nombreCompleto: signups[j].nombre,
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
  return withScriptLock_(ADMIN_LOCK_MS, function () {
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
    }
  });
}

function apiAdminPending(cred) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var admin = isAdmin_(auth);
    var signups = readSignupsCached_();
    var slots = readSlotsCached_();
    var byEmail = {};
    var order = [];
    for (var i = 0; i < signups.length; i++) {
      var sg = signups[i];
      var key = sg.emailKey;
      if (!byEmail[key]) {
        byEmail[key] = {
          email: sg.email,
          apellido: sg.apellido || '',
          nombre: givenName_(sg.nombre, sg.apellido),
          nombreCompleto: sg.nombre || '',
          curso: sg.curso || '',
          done: {}
        };
        order.push(key);
      }
      if (!byEmail[key].apellido && sg.apellido) byEmail[key].apellido = sg.apellido;
      if (!byEmail[key].curso && sg.curso) byEmail[key].curso = sg.curso;
      byEmail[key].done[Number(sg.slot_id)] = true;
    }
    var rows = [];
    for (var j = 0; j < order.length; j++) {
      var st = byEmail[order[j]];
      var faltan = [];
      for (var s = 0; s < slots.length; s++) {
        if (!st.done[Number(slots[s].id)]) faltan.push(slots[s].nombre || String(slots[s].id));
      }
      if (!faltan.length) continue;
      var row = {
        apellido: st.apellido,
        nombre: st.nombre,
        nombreCompleto: st.nombreCompleto,
        curso: st.curso,
        faltan: faltan
      };
      if (admin) row.email = st.email;
      rows.push(row);
    }
    sortBySurname_(rows);
    return {
      ok: true,
      role: auth.role,
      total: order.length,
      pending: rows.length,
      students: rows
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function reportSlots_(slots) {
  return slots.map(function (s) {
    return {
      id: Number(s.id),
      nombre: s.nombre || String(s.id),
      label: s.inicio + ' a ' + s.fin
    };
  });
}

function apiAdminReports(cred) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var admin = isAdmin_(auth);
    var cfg = readConfigCached_();
    var signups = readSignupsCached_();
    var slots = reportSlots_(readSlotsCached_());
    var talks = readTalksCached_();
    var talkById = {};
    for (var t = 0; t < talks.length; t++) talkById[talks[t].id] = talks[t];

    var mineByEmail = {};
    var meta = {};
    var order = [];
    for (var i = 0; i < signups.length; i++) {
      var sg = signups[i];
      if (!mineByEmail[sg.emailKey]) {
        mineByEmail[sg.emailKey] = {};
        meta[sg.emailKey] = {
          email: sg.email,
          apellido: sg.apellido || '',
          nombre: givenName_(sg.nombre, sg.apellido),
          nombreCompleto: sg.nombre || '',
          curso: sg.curso || 'Sin curso',
          ciclo: sg.ciclo || 'basico'
        };
        order.push(sg.emailKey);
      }
      if (!meta[sg.emailKey].apellido && sg.apellido) meta[sg.emailKey].apellido = sg.apellido;
      if (!mineByEmail[sg.emailKey][Number(sg.slot_id)]) {
        mineByEmail[sg.emailKey][Number(sg.slot_id)] = sg;
      }
    }

    function talksFor_(emailKey) {
      var mine = mineByEmail[emailKey] || {};
      var out = [];
      for (var k = 0; k < slots.length; k++) {
        var slot = slots[k];
        var signup = mine[Number(slot.id)] || null;
        var talk = signup ? talkById[signup.talk_id] : null;
        out.push({
          slot_id: slot.id,
          slot: slot.nombre,
          slotLabel: slot.label,
          talk_id: talk ? talk.id : '',
          titulo: talk ? talk.titulo : '',
          lugar: talk ? (talk.lugar || '') : '',
          signup_id: signup ? signup.id : '',
          presente: !!(signup && signup.presente)
        });
      }
      return out;
    }

    var totals = {
      roster: order.length,
      complete: 0,
      incomplete: 0,
      missing: 0,
      signups: signups.length,
      present: 0,
      absent: 0,
      byCiclo: { basico: 0, orientado: 0 },
      presentBySlot: slots.map(function (slot) {
        return { slot_id: slot.id, slot: slot.nombre, label: slot.label, total: 0, presentes: 0, ausentes: 0 };
      })
    };
    var coursesMap = {};
    function courseRow_(curso) {
      if (!coursesMap[curso]) {
        coursesMap[curso] = {
          curso: curso,
          roster: 0,
          complete: 0,
          incomplete: 0,
          missing: 0,
          presentBySlot: slots.map(function (slot) {
            return { slot_id: slot.id, slot: slot.nombre, label: slot.label, total: 0, presentes: 0, ausentes: 0 };
          }),
          students: []
        };
      }
      return coursesMap[curso];
    }

    for (var s = 0; s < order.length; s++) {
      var st = meta[order[s]];
      var row = courseRow_(st.curso);
      var stTalks = talksFor_(order[s]);
      var filled = 0;
      var presentes = 0;
      for (var k = 0; k < stTalks.length; k++) {
        if (stTalks[k].signup_id) {
          filled++;
          row.presentBySlot[k].total++;
          totals.presentBySlot[k].total++;
        }
        if (stTalks[k].presente) {
          presentes++;
          totals.present++;
          row.presentBySlot[k].presentes++;
          totals.presentBySlot[k].presentes++;
        }
      }
      var student = {
        apellido: st.apellido,
        nombre: st.nombre,
        nombreCompleto: st.nombreCompleto,
        curso: st.curso,
        count: filled,
        presentes: presentes,
        talks: stTalks
      };
      if (admin) student.email = st.email;
      row.students.push(student);
      row.roster++;
      totals.byCiclo[st.ciclo === 'orientado' ? 'orientado' : 'basico']++;
      if (filled >= slots.length) {
        row.complete++;
        totals.complete++;
      } else if (filled > 0) {
        row.incomplete++;
        totals.incomplete++;
      } else {
        row.missing++;
        totals.missing++;
      }
    }
    totals.absent = Math.max(0, totals.signups - totals.present);
    for (var pb = 0; pb < totals.presentBySlot.length; pb++) {
      totals.presentBySlot[pb].ausentes = Math.max(0, totals.presentBySlot[pb].total - totals.presentBySlot[pb].presentes);
    }

    var courseList = Object.keys(coursesMap).map(function (key) {
      sortBySurname_(coursesMap[key].students);
      return coursesMap[key];
    });
    courseList.sort(function (a, b) {
      return String(a.curso).localeCompare(String(b.curso), 'es', { numeric: true });
    });

    var slotLabels = {};
    for (var sl = 0; sl < slots.length; sl++) slotLabels[Number(slots[sl].id)] = slots[sl].label;
    var talksOut = talks.map(function (talk) {
      return {
        id: talk.id,
        titulo: talk.titulo,
        ciclo: talk.ciclo,
        slot_id: Number(talk.slot_id),
        slotLabel: slotLabels[Number(talk.slot_id)] || '',
        lugar: talk.lugar || '',
        cupo: Number(talk.cupo),
        activa: !!talk.activa,
        anotados: 0,
        presentes: 0,
        ausentes: 0,
        porCurso: {},
        students: []
      };
    });
    var talkIndex = {};
    for (var ti = 0; ti < talksOut.length; ti++) talkIndex[talksOut[ti].id] = talksOut[ti];
    for (var si = 0; si < signups.length; si++) {
      var signup = signups[si];
      var talkRow = talkIndex[signup.talk_id];
      if (!talkRow) continue;
      talkRow.anotados++;
      if (signup.presente) talkRow.presentes++;
      var cursoKey = signup.curso || 'Sin curso';
      talkRow.porCurso[cursoKey] = (talkRow.porCurso[cursoKey] || 0) + 1;
      var talkStudent = {
        id: signup.id,
        apellido: signup.apellido || '',
        nombre: givenName_(signup.nombre, signup.apellido),
        nombreCompleto: signup.nombre || '',
        curso: signup.curso,
        presente: !!signup.presente
      };
      if (admin) talkStudent.email = signup.email;
      talkRow.students.push(talkStudent);
    }
    for (var to = 0; to < talksOut.length; to++) {
      var rowOut = talksOut[to];
      rowOut.ausentes = Math.max(0, rowOut.anotados - rowOut.presentes);
      sortBySurname_(rowOut.students);
      var porCurso = [];
      var cursoKeys = Object.keys(rowOut.porCurso);
      for (var ck = 0; ck < cursoKeys.length; ck++) {
        porCurso.push({ curso: cursoKeys[ck], anotados: rowOut.porCurso[cursoKeys[ck]] });
      }
      porCurso.sort(function (a, b) {
        return String(a.curso).localeCompare(String(b.curso), 'es', { numeric: true });
      });
      rowOut.porCurso = porCurso;
    }

    return {
      ok: true,
      role: auth.role,
      rosterLoaded: order.length > 0,
      event: eventInfo_(cfg),
      generatedAt: Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm'),
      slots: slots,
      totals: totals,
      courses: courseList,
      talks: talksOut
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
