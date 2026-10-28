var CONFIG_SHEET = 'Config';
var SLOTS_SHEET = 'Slots';
var TALKS_SHEET = 'Talks';
var SIGNUPS_SHEET = 'Signups';
var STUDENTS_SHEET = 'Students';
var SESSIONS_SHEET = 'Sessions';
var SENT_MAILS_SHEET = 'Mails';
var LOG_SHEET = 'Log';
var BACKUP_SHEET = 'Backup';
var RESUMEN_SHEET = 'Resumen';
var BACKUP_KEEP = 20;
var MAX_EMAIL_ = 120;
var INSTITUTIONAL_DOMAIN = '@secundariosalsipuedes.edu.ar';
var ADMIN_PIN_PROP = 'ADMIN_PIN';
var GUIDE_PIN_PROP = 'GUIDE_PIN';
var ADMIN_FAIL_PROP = 'ADMIN_FAIL_COUNT';
var ADMIN_BLOCK_PROP = 'ADMIN_BLOCK_UNTIL';
var ADMIN_MAX_FAILS = 5;
var ADMIN_BLOCK_MS = 15 * 60 * 1000;
var ADMIN_TOKEN_PREFIX = 't_';
var ADMIN_TOKEN_TTL = 7200;
var STUDENT_TOKEN_PREFIX = 's_';
var STUDENT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
var STUDENT_SESSION_GRACE_MS = 24 * 60 * 60 * 1000;
var LOGIN_TICKET_PREFIX = 'l_';
var LOGIN_TICKET_TTL = 300;
var CONFIG_TEST_MODE = 'modo_prueba';
var CONFIG_DATA_ERASED = 'datos_personales_borrados';
var CONFIG_BACKUP_ACTIVE = 'backup_activo';
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
  nombre: 'Escribí tu nombre con letras, espacios, apóstrofe o guion.',
  apellido: 'Escribí tu apellido con letras, espacios, apóstrofe o guion.',
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
  var NAME_RE_ = /^[A-Za-zÀ-ÖØ-öø-ÿ' \u2019-]+$/;
  var NAME_LETTER_RE_ = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

  function sanitizeName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function isValidName(value) {
    var raw = String(value == null ? '' : value);
    if (/[\r\n\t]/.test(raw)) return false;
    var name = sanitizeName(raw);
    if (name.length < 2 || name.length > 60) return false;
    if (!NAME_RE_.test(name) || !NAME_LETTER_RE_.test(name)) return false;
    return !/^['\u2019-]|['\u2019-]$/.test(name);
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
    if (!isValidName(nombre)) return { ok: false, error: 'nombre' };
    if (apellido != null && String(apellido).trim() && !isValidName(apellido)) {
      return { ok: false, error: 'apellido' };
    }
    var n = sanitizeName(nombre);
    var ap = sanitizeName(apellido);
    var c = parseCurso(curso);
    if (!c) return { ok: false, error: 'curso' };
    var ciclo = cicloFromCurso(c);
    if (!ciclo) return { ok: false, error: 'curso' };
    var completa = n;
    if (ap && normalizeText(n).slice(-normalizeText(ap).length) !== normalizeText(ap)) completa = n + ' ' + ap;
    if (completa.length > 60) return { ok: false, error: 'nombre' };
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
      if (looksLikeFormula_(nombreCompleto) || looksLikeFormula_(apellido) || looksLikeFormula_(cursoRaw)) {
        invalidos.push({ linea: i + 1, texto: cols.join(';').slice(0, 80) });
        continue;
      }
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

  function looksLikeFormula_(value) {
    return /^[=+\-@\t\r]/.test(String(value == null ? '' : value).trim());
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
    sanitizeName: sanitizeName,
    isValidName: isValidName,
    normalizeEmail: normalizeEmail,
    isValidEmail: isValidEmail,
    isInstitutionalEmail: isInstitutionalEmail,
    normalizeDni: normalizeDni,
    isValidDni: isValidDni,
    looksLikeFormula_: looksLikeFormula_,
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
    if (sg.recordatorio) row.recordatorio = true;
    if (!row.bySlot[Number(sg.slot_id)]) row.bySlot[Number(sg.slot_id)] = sg;
  }
  var out = [];
  for (var j = 0; j < order.length; j++) {
    var r = byEmail[order[j]];
    if (!r.recordatorio) continue;
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

function mailLine_(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reminderBody_(r, cfg) {
  var lines = [
    'Hola ' + mailLine_(r.nombre) + ':',
    '',
    'Te recordamos que el ' + eventDateLabel_(cfg) + ' es la ' + EVENT_TITLE_ + '.',
    '',
    'Tus charlas:'
  ];
  for (var i = 0; i < r.items.length; i++) {
    var it = r.items[i];
    var when = mailLine_(it.slot) + ' (' + mailLine_(it.inicio) + ' a ' + mailLine_(it.fin) + ')';
    if (it.elegida) {
      lines.push('- ' + when + ': ' + mailLine_(it.titulo) + (it.lugar ? ' (' + mailLine_(it.lugar) + ')' : ''));
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

function readSentMails_(subject) {
  try {
    var sh = sheet_(SENT_MAILS_SHEET);
    if (!sh) return null;
    var vals = sh.getDataRange().getValues();
    if (!vals.length) return {};
    var head = EsiCore.normalizeText(vals[0][0]);
    if (head !== 'email' && head !== 'mail') return {};
    var out = {};
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][2]) !== subject) continue;
      var email = String(vals[i][0]).trim().toLowerCase();
      if (email) out[email] = true;
    }
    return out;
  } catch (e) {
    return null;
  }
}

function appendSentMail_(email, subject) {
  sheet_(SENT_MAILS_SHEET).appendRow([String(email).trim().toLowerCase(), new Date(), String(subject)]);
}

function apiAdminMailPreview(cred) {
  var auth = adminAuth_(cred);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.role !== ROLE_ADMIN) return { ok: false, message: 'Tu clave no permite esta acción.' };
  try {
    var cfg = readConfigCached_();
    var rows = reminderRecipients_();
    var subject = reminderSubject_(cfg);
    var sent = readSentMails_(subject);
    if (!sent) {
      return {
        ok: true,
        total: rows.length,
        pending: rows.length,
        dedup: false,
        subject: subject,
        sample: null,
        quota: mailQuota_(),
        batchSize: REMINDER_BATCH_,
        event: eventInfo_(cfg),
        from: mailSender_(cfg),
        message: 'Falta la hoja Mails. Ejecutá setup() otra vez.'
      };
    }
    var pending = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      if (!sent[String(rows[ri].email).trim().toLowerCase()]) pending++;
    }
    var sample = rows[0] || null;
    return {
      ok: true,
      total: rows.length,
      pending: pending,
      dedup: true,
      subject: subject,
      sample: sample ? { nombre: sample.nombre, curso: sample.curso, body: reminderBody_(sample, cfg) } : null,
      quota: mailQuota_(),
      batchSize: REMINDER_BATCH_,
      event: eventInfo_(cfg),
      from: mailSender_(cfg)
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
  var lockKey = 'mail_send_lock';
  var lock = LockService.getScriptLock();
  try { lock.waitLock(2000); } catch (e) { return { ok: false, busy: true, message: BUSY_MESSAGE }; }
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    if (cache.get(lockKey)) {
      try { lock.releaseLock(); } catch (e2) { }
      return { ok: false, busy: true, message: 'Ya hay un envío en curso.' };
    }
    cache.put(lockKey, '1', 180);
  } catch (e) {
    try { lock.releaseLock(); } catch (e2) { }
    return { ok: false, message: 'No se pudo bloquear el envío.' };
  }
  try { lock.releaseLock(); } catch (e) { }
  try {
    var cfg = readConfigCached_();
    var rows = reminderRecipients_();
    var start = Math.max(0, Number(offset) || 0);
    var take = Math.min(REMINDER_MAX_BATCH_, Math.max(1, Number(limit) || REMINDER_BATCH_));
    var subject = reminderSubject_(cfg);
    var sentSet = readSentMails_(subject);
    if (!sentSet) return { ok: false, message: 'Falta la hoja Mails. Ejecutá setup() otra vez.' };
    var end = Math.min(rows.length, start + take);
    var sent = 0;
    var failed = 0;
    var skipped = 0;
    for (var i = start; i < end; i++) {
      var key = String(rows[i].email).trim().toLowerCase();
      if (sentSet[key]) { skipped++; continue; }
      var delivered = false;
      try {
        var mailOpts = {
          to: rows[i].email,
          subject: subject,
          body: reminderBody_(rows[i], cfg),
          name: EVENT_TITLE_
        };
        var sender = mailSender_(cfg);
        if (sender) { mailOpts.from = sender; mailOpts.replyTo = sender; }
        MailApp.sendEmail(mailOpts);
        delivered = true;
      } catch (err) {
        failed++;
      }
      if (!delivered) continue;
      sentSet[key] = true;
      sent++;
      try { appendSentMail_(rows[i].email, subject); } catch (err2) { }
    }
    return {
      ok: true,
      sent: sent,
      failed: failed,
      skipped: skipped,
      total: rows.length,
      nextOffset: end,
      done: end >= rows.length,
      quota: Math.max(0, quota - sent)
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  } finally {
    try { if (cache) cache.remove(lockKey); } catch (e) { }
  }
}

function mailSender_(cfg) {
  return String((cfg && cfg.mail_remitente) || '').trim().toLowerCase();
}

function apiAdminGetConfig(cred) {
  var auth = adminAuth_(cred);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.role !== ROLE_ADMIN) return { ok: false, message: 'Tu clave no permite esta acción.' };
  try {
    var cfg = readConfig_();
    return {
      ok: true,
      evento_abierto: isOpen_(cfg),
      event: eventInfo_(cfg),
      mail_remitente: mailSender_(cfg),
      backup_activo: convertBool_(cfg[CONFIG_BACKUP_ACTIVE])
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function normalizeEventDate_(value) {
  var raw = String(value == null ? '' : value).trim();
  var m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return y + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
  }
  return '';
}

function apiAdminSetConfig(cred, values) {
  var auth = adminAuth_(cred);
  if (!auth.ok) return { ok: false, message: auth.message };
  if (auth.role !== ROLE_ADMIN) return { ok: false, message: 'Tu clave no permite esta acción.' };
  var v = values && typeof values === 'object' ? values : {};
  return withScriptLock_(3000, function () {
    try {
      if (v.evento_abierto != null) {
        var open = v.evento_abierto === true || String(v.evento_abierto).toLowerCase() === 'abierto';
        writeConfig_('evento_abierto', open ? 'abierto' : 'cerrado');
      }
      if (v.evento_fecha != null && String(v.evento_fecha).trim() !== '') {
        var date = normalizeEventDate_(v.evento_fecha);
        if (!date) return { ok: false, message: 'Fecha inválida. Usá AAAA-MM-DD.' };
        writeConfig_('evento_fecha', date);
      }
      if (v.evento_zona != null && String(v.evento_zona).trim() !== '') {
        var zone = String(v.evento_zona).trim();
        if (!/^[A-Za-z0-9_+\-\/]+$/.test(zone)) {
          return { ok: false, message: 'Zona horaria inválida. Usá algo como America/Argentina/Cordoba.' };
        }
        writeConfig_('evento_zona', zone);
      }
      if (v.mail_remitente != null) {
        var sender = String(v.mail_remitente).trim().toLowerCase();
        if (sender && !EsiCore.isValidEmail(sender)) {
          return { ok: false, message: 'Remitente inválido. Usá un mail completo.' };
        }
        writeConfig_('mail_remitente', sender);
      }
      if (v.modo_prueba != null) {
        writeConfig_(CONFIG_TEST_MODE, convertBool_(v.modo_prueba) ? 'si' : 'no');
      }
      if (v.backup_activo != null) {
        writeConfig_(CONFIG_BACKUP_ACTIVE, convertBool_(v.backup_activo) ? 'si' : 'no');
        configureBackupTrigger_();
      }
      invalidateDataCache_();
      var cfg = readConfig_();
      return {
        ok: true,
        evento_abierto: isOpen_(cfg),
        event: eventInfo_(cfg),
        mail_remitente: mailSender_(cfg),
        backup_activo: convertBool_(cfg[CONFIG_BACKUP_ACTIVE])
      };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

var API_FN_MAP_ = {
  apiBootstrap: apiBootstrap,
  apiLookup: apiLookup,
  apiLookupDni: apiLookupDni,
  apiGetData: apiGetData,
  apiResumeSession: apiResumeSession,
  apiStudentLogout: apiStudentLogout,
  apiSetReminder: apiSetReminder,
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
  apiAdminSendReminders: apiAdminSendReminders,
  apiAdminGetConfig: apiAdminGetConfig,
  apiAdminSetConfig: apiAdminSetConfig,
  apiAdminStatus: apiAdminStatus,
  apiAdminDuplicates: apiAdminDuplicates,
  apiAdminAddStudent: apiAdminAddStudent,
  apiAdminCorrectStudent: apiAdminCorrectStudent,
  apiAdminMoveTalk: apiAdminMoveTalk,
  apiAdminMergeDuplicates: apiAdminMergeDuplicates,
  apiAdminDeleteStudent: apiAdminDeleteStudent,
  apiAdminDeleteTestData: apiAdminDeleteTestData,
  apiAdminCloseEvent: apiAdminCloseEvent,
  apiAdminErasePersonalData: apiAdminErasePersonalData
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (String(p.fn || '')) return apiJsonp_(p);
  var admin = String(p.admin || '') === '1';
  var t = HtmlService.createTemplateFromFile('Panel');
  t.IS_ADMIN = admin;
  var out = t.evaluate();
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
    var fnName = String(p.fn || '');
    var f = API_FN_MAP_[fnName];
    if (fnName.indexOf('apiAdmin') === 0 && String(p.admin || '') !== '1') {
      payload = { ok: false, message: 'Entrá por /exec?admin=1.' };
    } else if (!f) {
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
  ensureConfigDefault_(CONFIG_TEST_MODE, 'no');
  ensureConfigDefault_(CONFIG_BACKUP_ACTIVE, 'si');
  ensureSheet_(ss, SLOTS_SHEET, ['id', 'nombre', 'inicio', 'fin', 'orden'], [
    [1, '1ra', '10:30', '11:20', 1],
    [2, '2da', '11:30', '12:20', 2],
    [3, '3ra', '12:30', '13:30', 3]
  ]);
  ensureSheet_(ss, TALKS_SHEET, ['id', 'titulo', 'ciclo', 'slot_id', 'lugar', 'cupo', 'activa'], seedTalks_());
  ensureSheet_(ss, STUDENTS_SHEET, ['email', 'nombre', 'curso'], []);
  ensureSheet_(ss, SESSIONS_SHEET, ['token_hash', 'email', 'nombre', 'curso', 'ciclo', 'created_at', 'expires_at', 'revoked'], []);
  ensureSheet_(ss, SIGNUPS_SHEET, ['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id'], []);
  repairErasedSignups_(ss);
  ensureSheet_(ss, SENT_MAILS_SHEET, ['email', 'fecha', 'asunto'], []);
  ensureSheet_(ss, LOG_SHEET, ['fecha', 'accion', 'signup_id', 'detalle'], []);
  ensureSheet_(ss, BACKUP_SHEET, ['backup_at', 'id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id', 'presente', 'apellido', 'recordatorio', 'prueba'], []);
  var signupsSh = sheet_(SIGNUPS_SHEET);
  ensureColumn_(signupsSh, 'presente');
  ensureColumn_(signupsSh, 'apellido');
  ensureColumn_(signupsSh, 'recordatorio');
  ensureColumn_(signupsSh, 'prueba');
  ensureAdminPin_();
  ensureGuidePin_();
  configureBackupTrigger_();
  ss.toast('Listo. Las claves están en Script Properties (ADMIN_PIN y GUIDE_PIN).');
  rebuildReport_();
}

function configureBackupTrigger_() {
  if (typeof ScriptApp === 'undefined') return;
  try {
    var active = convertBool_(readConfig_()[CONFIG_BACKUP_ACTIVE]);
    var triggers = ScriptApp.getProjectTriggers();
    var existing = [];
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'backupSignups_') existing.push(triggers[i]);
    }
    if (active && !existing.length) {
      ScriptApp.newTrigger('backupSignups_').timeBased().everyMinutes(30).create();
    } else if (!active) {
      for (var j = 0; j < existing.length; j++) ScriptApp.deleteTrigger(existing[j]);
    }
  } catch (e) { }
}

function logAction_(action, signupId, detail) {
  try {
    sheet_(LOG_SHEET).appendRow([new Date(), String(action || ''), String(signupId || ''), String(detail || '')]);
  } catch (e) { }
}

function backupSignups_() {
  return withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      var cfg = readConfig_();
      if (!convertBool_(cfg[CONFIG_BACKUP_ACTIVE])) return { ok: false, message: 'Respaldo desactivado.' };
      var signups = readSignups_();
      if (!signups.length) return { ok: true, rows: 0, copies: 0 };
      var sh = sheet_(BACKUP_SHEET);
      var stamp = new Date();
      var rows = [];
      for (var i = 0; i < signups.length; i++) {
        var s = signups[i];
        rows.push([
          stamp, s.id, s.ts, s.email, s.nombre, s.curso, s.ciclo, s.slot_id, s.talk_id,
          s.presente ? 'si' : 'no', s.apellido, s.recordatorio ? 'si' : 'no', s.prueba ? 'si' : 'no'
        ]);
      }
      if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 13).setValues(rows);
      var copies = pruneBackup_(sh);
      return { ok: true, rows: rows.length, copies: copies };
    } catch (e) {
      return { ok: false, message: 'No se pudo respaldar.' };
    }
  });
}

function pruneBackup_(sh) {
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return 0;
  var groups = {};
  var order = [];
  for (var i = 1; i < vals.length; i++) {
    var key = vals[i][0] instanceof Date ? String(vals[i][0].getTime()) : String(vals[i][0]);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(vals[i]);
  }
  order.sort(function (a, b) { return Number(a) - Number(b); });
  var keep = order.slice(-BACKUP_KEEP);
  var out = [vals[0]];
  for (var k = 0; k < keep.length; k++) out = out.concat(groups[keep[k]]);
  var lastRow = sh.getLastRow();
  var width = Math.max(out[0].length, sh.getLastColumn());
  sh.getRange(1, 1, out.length, out[0].length).setValues(out);
  if (lastRow > out.length) {
    sh.getRange(out.length + 1, 1, lastRow - out.length, width).clearContent();
  }
  return keep.length;
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
  var raw = Utilities.getUuid().replace(/-/g, '');
  var pin = '';
  for (var i = 0; i < 6; i++) pin += String(parseInt(raw.charAt(i), 16) % 10);
  return pin.charAt(0) === '0' ? '1' + pin.slice(1) : pin;
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

function repairErasedSignups_(ss) {
  var sh = ss.getSheetByName(SIGNUPS_SHEET);
  if (!sh || sh.getLastColumn() < 1) return;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = signupsHeaderMap_(head);
  if (map.id >= 0 && map.email >= 0) return;
  var rows = sh.getDataRange().getValues();
  if (rows.length > 1) {
    var resumen = ensureSheet_(ss, RESUMEN_SHEET,
      ['talk_id', 'slot_id', 'ciclo', 'anotados', 'presentes'], []);
    resumen.clearContents();
    resumen.getRange(1, 1, rows.length, Math.max(5, rows[0].length)).setValues(rows);
  }
  sh.clearContents();
  sh.getRange(1, 1, 1, 8).setValues([['id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id']]);
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
    zona: String((cfg && cfg.evento_zona) || EVENT_DEFAULT_TZ_).trim() || EVENT_DEFAULT_TZ_,
    modo_prueba: convertBool_(cfg && cfg.modo_prueba),
    datos_personales_borrados: convertBool_(cfg && cfg.datos_personales_borrados)
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

function slotTime_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return ('0' + v.getUTCHours()).slice(-2) + ':' + ('0' + v.getUTCMinutes()).slice(-2);
  }
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : s;
}

function readSlots_() {
  var vals = sheet_(SLOTS_SHEET).getDataRange().getValues();
  var slots = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === '') continue;
    slots.push({
      id: Number(vals[i][0]),
      nombre: String(vals[i][1]),
      inicio: slotTime_(vals[i][2]),
      fin: slotTime_(vals[i][3]),
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
  var map = { id: -1, ts: -1, email: -1, nombre: -1, apellido: -1, curso: -1, ciclo: -1, slot_id: -1, talk_id: -1, presente: -1, recordatorio: -1, prueba: -1 };
  for (var i = 0; i < (head || []).length; i++) {
    var h = EsiCore.normalizeText(head[i]);
    if (h === 'id') map.id = i;
    else if (h === 'ts') map.ts = i;
    else if (h === 'email' || h === 'mail') map.email = i;
    else if (h === 'nombre') map.nombre = i;
    else if (h === 'presente') map.presente = i;
    else if (h === 'apellido') map.apellido = i;
    else if (h === 'curso') map.curso = i;
    else if (h === 'ciclo') map.ciclo = i;
    else if (h === 'slot_id') map.slot_id = i;
    else if (h === 'talk_id') map.talk_id = i;
    else if (h === 'recordatorio') map.recordatorio = i;
    else if (h === 'prueba') map.prueba = i;
  }
  return map;
}

function readSignups_() {
  var vals = sheet_(SIGNUPS_SHEET).getDataRange().getValues();
  if (!vals.length) return [];
  var map = signupsHeaderMap_(vals[0]);
  if (map.id < 0 || map.email < 0) return [];
  var signups = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][map.id] === '') continue;
    signups.push({
      id: String(vals[i][map.id]),
      ts: map.ts >= 0 ? vals[i][map.ts] : vals[i][1],
      email: String(vals[i][map.email]),
      nombre: map.nombre >= 0 ? String(vals[i][map.nombre]) : String(vals[i][3]),
      apellido: map.apellido >= 0 ? String(vals[i][map.apellido] == null ? '' : vals[i][map.apellido]).replace(/\s+/g, ' ').trim() : '',
      curso: map.curso >= 0 ? String(vals[i][map.curso]) : String(vals[i][4]),
      ciclo: String(map.ciclo >= 0 ? vals[i][map.ciclo] : vals[i][5]).trim().toLowerCase(),
      slot_id: Number(map.slot_id >= 0 ? vals[i][map.slot_id] : vals[i][6]),
      talk_id: String(map.talk_id >= 0 ? vals[i][map.talk_id] : vals[i][7]),
      presente: map.presente >= 0 ? convertBool_(vals[i][map.presente]) : false,
      recordatorio: map.recordatorio >= 0 ? convertBool_(vals[i][map.recordatorio]) : false,
      prueba: map.prueba >= 0 ? convertBool_(vals[i][map.prueba]) : false,
      emailKey: EsiCore.normalizeEmail(vals[i][map.email])
    });
  }
  return signups;
}

function appendSignupRow_(student, talk) {
  var sh = sheet_(SIGNUPS_SHEET);
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var row = [];
  var newId = Utilities.getUuid();
  for (var i = 0; i < head.length; i++) {
    var key = EsiCore.normalizeText(head[i]);
    if (key === 'id') row.push(newId);
    else if (key === 'ts') row.push(new Date());
    else if (key === 'email' || key === 'mail') row.push(student.email);
    else if (key === 'nombre') row.push(student.nombre);
    else if (key === 'apellido') row.push(student.apellido || '');
    else if (key === 'curso') row.push(student.curso);
    else if (key === 'ciclo') row.push(student.ciclo);
    else if (key === 'slot_id') row.push(Number(talk.slot_id));
    else if (key === 'talk_id') row.push(String(talk.id));
    else if (key === 'presente') row.push('');
    else if (key === 'recordatorio') row.push(!!student.recordatorio);
    else if (key === 'prueba') row.push(!!student.prueba);
    else row.push('');
  }
  sh.appendRow(row);
  return newId;
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
    if (!map) return [];
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
var DNI_BLOCK_MS = 2 * 60 * 1000;

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
    var hasAp = ap.length >= 2 && ap.length <= 60;
    var valid = EsiCore.isValidDni(norm) && (ap === '' || hasAp);
    var roster = readStudentsCached_();
    var out = {
      ok: false,
      message: 'No pudimos entrar. Revisá el DNI y el apellido.',
      email: '',
      login: '',
      rosterLoaded: roster.length > 0,
      needsNombre: false,
      needsApellido: false,
      needsCurso: false,
      apellido: '',
      nombreCompleto: '',
      nombre: '',
      curso: ''
    };
    if (!valid) return out;
    var lookup = withScriptLock_(ADMIN_LOCK_MS, function () {
      if (dniFails_(norm) >= DNI_MAX_FAILS) return { blocked: true };
      var matches = [];
      for (var i = 0; i < roster.length; i++) {
        if (roster[i].dni && roster[i].dni === norm) matches.push(roster[i]);
      }
      var entry = null;
      if (hasAp) {
        for (var j = 0; j < matches.length; j++) {
          if (EsiCore.normalizeText(matches[j].apellido) === ap) {
            entry = matches[j];
            break;
          }
        }
      } else if (matches.length === 1) {
        entry = matches[0];
      }
      if (!entry) {
        if (!hasAp && matches.length > 1) return { needsApellido: true };
        noteDniFailure_(norm);
        return { entry: null };
      }
      clearDniFailures_(norm);
      return { entry: entry };
    });
    if (lookup.busy) {
      out.message = BUSY_MESSAGE;
      return out;
    }
    if (lookup.blocked) {
      out.message = 'Demasiados intentos. Esperá dos minutos.';
      return out;
    }
    if (lookup.needsApellido) {
      out.message = 'Hay más de un alumno con ese DNI. Escribí el apellido.';
      out.needsApellido = true;
      return out;
    }
    var entry = lookup.entry;
    if (!entry) return out;
    var nombreCompleto = entry.nombreCompleto || entry.nombre || '';
    var pc = EsiCore.parseCurso(entry.curso);
    var login = issueLoginTicket_({
      email: entry.email,
      nombre: nombreCompleto,
      apellido: entry.apellido || '',
      curso: pc || ''
    });
    return {
      ok: true,
      message: '',
      email: '',
      login: login,
      rosterLoaded: true,
      needsNombre: !nombreCompleto,
      needsApellido: false,
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

function reminderOptIn_(signups, email) {
  var key = EsiCore.normalizeEmail(email);
  for (var i = 0; i < (signups || []).length; i++) {
    if (signups[i].emailKey === key && signups[i].recordatorio) return true;
  }
  return false;
}

function apiSetReminder(token, value) {
  var sess = studentSession_(token);
  if (!sess) return studentSessionExpired_();
  return withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      var sh = sheet_(SIGNUPS_SHEET);
      var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
      var map = signupsHeaderMap_(head);
      if (map.email < 0 || map.recordatorio < 0) {
        return { ok: false, message: 'Falta una columna de Signups. Ejecutá setup().' };
      }
      var vals = sh.getDataRange().getValues();
      var wanted = convertBool_(value);
      var updated = 0;
      for (var i = 1; i < vals.length; i++) {
        if (EsiCore.normalizeEmail(vals[i][map.email]) !== sess.email) continue;
        sh.getRange(i + 1, map.recordatorio + 1).setValue(wanted);
        updated++;
      }
      if (updated) invalidateDataCache_();
      return { ok: true, recordatorio: wanted, updated: updated };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function apiGetData(email, nombre, curso, sessionToken, apellido, loginToken) {
  try {
    var current = sessionToken ? studentSession_(sessionToken) : null;
    if (sessionToken && !current) return studentSessionExpired_();
    var ticket = loginTicket_(loginToken);
    if (current && ticket && ticket.email !== current.email) {
      return { ok: false, message: 'La sesión no coincide con el mail.' };
    }
    if (current && email && EsiCore.normalizeEmail(email) !== current.email) return studentSessionExpired_();
    if (ticket && email && EsiCore.normalizeEmail(email) !== ticket.email) {
      return { ok: false, message: 'La sesión no coincide con el mail.' };
    }
    var identity = current || ticket;
    var bs = identity
      ? buildStudent_(identity.email, identity.nombre || nombre, identity.curso || curso, identity.apellido || apellido)
      : buildStudent_(email, nombre, curso, apellido);
    if (!bs.ok) {
      return { ok: false, message: STUDENT_ERRORS_[bs.error] || 'Datos inválidos.' };
    }
    var s = bs.student;
    var signups = readSignupsCached_();
    var mine = mineMap_(signups, s.email);
    if (!current && !ticket && hasSignupsForEmail_(signups, s.email)) {
      return {
        ok: false,
        needsLogin: true,
        message: 'Ese mail ya tiene inscripciones. Entrá con tu DNI y apellido.'
      };
    }
    var session = '';
    if (!current) {
      if (ticket) revokeSessionsForEmail_(s.email, '');
      session = issueStudentSession_(s);
    }
    if (ticket) consumeLoginTicket_(loginToken);
    return {
      ok: true,
      student: { email: s.email, nombre: s.nombre, apellido: s.apellido, curso: s.curso, ciclo: s.ciclo },
      data: publicData_(s.ciclo, mine),
      recordatorio: reminderOptIn_(signups, s.email),
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

function loginTicketHash_(token) {
  return 'login_ticket_' + studentTokenHash_(token);
}

function issueLoginTicket_(student) {
  try {
    var token = LOGIN_TICKET_PREFIX + Utilities.getUuid().replace(/-/g, '');
    var payload = {
      email: student.email,
      nombre: student.nombre || '',
      apellido: student.apellido || '',
      curso: student.curso || '',
      expires: Date.now() + LOGIN_TICKET_TTL * 1000
    };
    CacheService.getScriptCache().put(loginTicketHash_(token), JSON.stringify(payload), LOGIN_TICKET_TTL);
    return token;
  } catch (e) {
    return '';
  }
}

function loginTicket_(token) {
  var raw = String(token == null ? '' : token).trim();
  if (!raw || raw.indexOf(LOGIN_TICKET_PREFIX) !== 0) return null;
  try {
    var hit = CacheService.getScriptCache().get(loginTicketHash_(raw));
    if (!hit) return null;
    var data = JSON.parse(hit);
    if (!data || Number(data.expires) < Date.now() || !data.email) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function consumeLoginTicket_(token) {
  try { CacheService.getScriptCache().remove(loginTicketHash_(token)); } catch (e) { }
}

function hasSignupsForEmail_(signups, email) {
  var key = EsiCore.normalizeEmail(email);
  for (var i = 0; i < (signups || []).length; i++) {
    if (signups[i].emailKey === key) return true;
  }
  return false;
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

function signupStamp_(value, tz) {
  var ms = sessionDateMs_(value);
  if (!ms) return '';
  return Utilities.formatDate(new Date(ms), tz, 'dd/MM HH:mm');
}

function readSessions_() {
  var sh = sessionsSheet_();
  var vals = sh.getDataRange().getValues();
  if (!vals.length) return [];
  var idx = {};
  for (var h = 0; h < vals[0].length; h++) {
    idx[EsiCore.normalizeText(vals[0][h])] = h;
  }
  if (idx.token_hash == null) return [];
  var col = function (name, fallback) {
    return idx[name] == null ? fallback : idx[name];
  };
  var hashCol = col('token_hash', 0);
  var emailCol = col('email', 1);
  var nombreCol = col('nombre', 2);
  var cursoCol = col('curso', 3);
  var cicloCol = col('ciclo', 4);
  var createdCol = col('created_at', 5);
  var expiresCol = col('expires_at', 6);
  var revokedCol = col('revoked', 7);
  var apellidoCol = col('apellido', -1);
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    if (!String(vals[i][hashCol] || '').trim()) continue;
    rows.push({
      row: i + 1,
      hash: String(vals[i][hashCol]).trim(),
      email: EsiCore.normalizeEmail(vals[i][emailCol]),
      nombre: String(vals[i][nombreCol] == null ? '' : vals[i][nombreCol]).replace(/\s+/g, ' ').trim(),
      curso: EsiCore.parseCurso(vals[i][cursoCol]) || String(vals[i][cursoCol] == null ? '' : vals[i][cursoCol]).trim(),
      ciclo: String(vals[i][cicloCol] == null ? '' : vals[i][cicloCol]).trim().toLowerCase(),
      apellido: apellidoCol >= 0 ? String(vals[i][apellidoCol] == null ? '' : vals[i][apellidoCol]).replace(/\s+/g, ' ').trim() : '',
      created: sessionDateMs_(vals[i][createdCol]),
      expires: sessionDateMs_(vals[i][expiresCol]),
      revoked: convertBool_(vals[i][revokedCol]),
      revokedCol: revokedCol + 1
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
  var sh = sessionsSheet_();
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var values = {
    token_hash: studentTokenHash_(raw),
    email: EsiCore.normalizeEmail(student.email),
    nombre: String(student.nombre || '').trim(),
    curso: String(student.curso || '').trim(),
    ciclo: String(student.ciclo || '').trim(),
    created_at: new Date(now),
    expires_at: new Date(expires),
    revoked: false,
    apellido: String(student.apellido || '').trim()
  };
  var row = [];
  for (var i = 0; i < head.length; i++) {
    var key = EsiCore.normalizeText(head[i]);
    row.push(Object.prototype.hasOwnProperty.call(values, key) ? values[key] : '');
  }
  sh.appendRow(row);
  return raw;
}

function revokeStudentSession_(token) {
  var raw = String(token == null ? '' : token).trim();
  if (raw.indexOf(STUDENT_TOKEN_PREFIX) !== 0) return false;
  var hash = studentTokenHash_(raw);
  var rows = readSessions_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].hash !== hash) continue;
    sessionsSheet_().getRange(rows[i].row, rows[i].revokedCol).setValue(true);
    return true;
  }
  return false;
}

// Cierra las sesiones abiertas de un mail. `keepHash` conserva la del que
// escribe; sin hash, las cierra todas (ingreso con DNI).
function revokeSessionsForEmail_(email, keepHash) {
  var key = EsiCore.normalizeEmail(email);
  if (!key) return 0;
  var rows = readSessions_();
  var sh = null;
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].email !== key || rows[i].revoked) continue;
    if (keepHash && rows[i].hash === keepHash) continue;
    if (!sh) sh = sessionsSheet_();
    sh.getRange(rows[i].row, rows[i].revokedCol).setValue(true);
    count++;
  }
  return count;
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
      data: out.data,
      recordatorio: !!out.recordatorio
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

function apiRegister(email, nombre, curso, talkId, apellido, sessionToken, loginToken) {
  var resp = withScriptLock_(REGISTER_LOCK_MS, function () {
    return registerLocked_(email, nombre, curso, talkId, apellido, sessionToken, loginToken);
  });
  if (resp && resp.busy) return resp;
  if (resp && resp.ok) {
    try { rebuildReport_(); } catch (e) { }
  }
  return resp;
}

function registerLocked_(email, nombre, curso, talkId, apellido, sessionToken, loginToken) {
  try {
    var current = sessionToken ? studentSession_(sessionToken) : null;
    if (sessionToken && !current) return studentSessionExpired_();
    var ticket = loginTicket_(loginToken);
    if (current && ticket && ticket.email !== current.email) {
      return { ok: false, message: 'La sesión no coincide con el mail.' };
    }
    if (current && email && EsiCore.normalizeEmail(email) !== current.email) return studentSessionExpired_();
    if (ticket && email && EsiCore.normalizeEmail(email) !== ticket.email) {
      return { ok: false, message: 'La sesión no coincide con el mail.' };
    }
    var identity = current || ticket;
    var bs = identity
      ? buildStudent_(identity.email, identity.nombre || nombre, identity.curso || curso, identity.apellido || apellido)
      : buildStudent_(email, nombre, curso, apellido);
    if (!bs.ok) {
      return { ok: false, message: STUDENT_ERRORS_[bs.error] || 'Datos inválidos.' };
    }
    var s = bs.student;

    var cfg = readConfig_();
    var abierto = isOpen_(cfg);
    var slots = readSlotsCached_();
    var talks = readTalksCached_();
    var talksById = {};
    for (var i = 0; i < talks.length; i++) {
      talksById[talks[i].id] = talks[i];
    }
    var signups = readSignups_();
    if (!current && !ticket && hasSignupsForEmail_(signups, s.email)) {
      return {
        ok: false,
        needsLogin: true,
        message: 'Ese mail ya tiene inscripciones. Entrá con tu DNI y apellido.'
      };
    }
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
      s.recordatorio = reminderOptIn_(readSignups_(), s.email);
      s.prueba = convertBool_(cfg.modo_prueba);
      appendSignupRow_(s, talk);
      message = 'Listo, quedaste anotado.';
    } else if (plan.action === 'change') {
      var row = findSignupRow_(plan.signupId);
      if (!row) throw new Error('Inscripción anterior no encontrada');
      var sh = sheet_(SIGNUPS_SHEET);
      var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
      var map = signupsHeaderMap_(head);
      if (map.ts < 0 || map.talk_id < 0) throw new Error('Falta una columna de Signups');
      sh.getRange(row, map.ts + 1).setValue(new Date());
      sh.getRange(row, map.talk_id + 1).setValue(talkId);
      message = 'Cambiaste tu charla de ese horario a ' + talk.titulo + '.';
    } else {
      message = 'Ya estabas anotado.';
    }

    var rotated = '';
    if (plan.action === 'insert' || plan.action === 'change') {
      var keepHash = current && sessionToken ? studentTokenHash_(sessionToken) : '';
      revokeSessionsForEmail_(s.email, keepHash);
      if (!current) rotated = issueStudentSession_(s);
    }
    if (ticket) consumeLoginTicket_(loginToken);
    var fresh = readSignups_();
    invalidateDataCache_();
    return {
      ok: true,
      message: message,
      student: { email: s.email, nombre: s.nombre, apellido: s.apellido, curso: s.curso, ciclo: s.ciclo },
      data: publicData_(s.ciclo, mineMap_(fresh, s.email), fresh),
      recordatorio: reminderOptIn_(fresh, s.email),
      session: rotated
    };
  } catch (err) {
    return { ok: false, message: 'Error inesperado: ' + (err && err.message ? err.message : err) };
  }
}

function findSignupRow_(id) {
  var sh = sheet_(SIGNUPS_SHEET);
  var vals = sh.getDataRange().getValues();
  if (!vals.length) return 0;
  var map = signupsHeaderMap_(vals[0]);
  if (map.id < 0) return 0;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][map.id]) === String(id)) return i + 1;
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
  var adminPin = getAdminPin_();
  var guidePin = getGuidePin_();
  if (!adminPin && !guidePin) {
    return { ok: false, message: 'Clave no configurada. Ejecutá setup().' };
  }
  if (given && given === adminPin) {
    resetAdminFailures_();
    return { ok: true, role: ROLE_ADMIN };
  }
  if (given && given === guidePin) {
    resetAdminFailures_();
    return { ok: true, role: ROLE_GUIDE };
  }
  var now = Date.now();
  var blockedUntil = Number(props.getProperty(ADMIN_BLOCK_PROP) || 0);
  if (blockedUntil > now) {
    return { ok: false, message: 'Demasiados intentos. Esperá 15 minutos.' };
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
        cuando: signupStamp_(s.ts, tz),
        email: s.email,
        apellido: s.apellido || apellidos[s.emailKey] || '',
        nombre: givenName_(s.nombre, s.apellido || apellidos[s.emailKey] || ''),
        nombreCompleto: s.nombre,
        curso: s.curso,
        ciclo: s.ciclo,
        slot_id: Number(s.slot_id),
        talk_id: s.talk_id,
        slotLabel: slotLabelFor_(slots, s.slot_id),
        talkTitulo: titulos[s.talk_id] || s.talk_id,
        lugar: lugares[s.talk_id] || '',
        presente: !!s.presente,
        prueba: !!s.prueba
      };
    }) : [];
    var porCiclo = { basico: 0, orientado: 0 };
    var vistos = {};
    var studentCount = 0;
    for (var c = 0; c < signupsRaw.length; c++) {
      var alumno = signupsRaw[c];
      var clave = alumno.emailKey || EsiCore.normalizeEmail(alumno.email);
      if (!clave || vistos[clave]) continue;
      vistos[clave] = true;
      studentCount++;
      if (porCiclo[alumno.ciclo] != null) porCiclo[alumno.ciclo]++;
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
      mail_remitente: mailSender_(cfg),
      backup_activo: convertBool_(cfg[CONFIG_BACKUP_ACTIVE]),
      rosterLoaded: students.length > 0,
      rosterCount: students.length,
      slots: slots.map(function (s) {
        return { id: Number(s.id), label: s.inicio + ' a ' + s.fin, nombre: s.nombre, inicio: s.inicio, fin: s.fin };
      }),
      talks: talksOut,
      signups: signups,
      total: signupsRaw.length,
      studentCount: studentCount,
      testCount: admin ? signupsRaw.filter(function (x) { return !!x.prueba; }).length : 0,
      data_erased: convertBool_(cfg[CONFIG_DATA_ERASED]),
      porCiclo: porCiclo,
      event: eventInfo_(cfg)
    };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminStatus(cred) {
  try {
    var auth = adminAuth_(cred);
    if (!auth.ok) return { ok: false, message: auth.message };
    var cfg = readConfigCached_();
    var signups = readSignups_();
    var last = 0;
    for (var i = 0; i < signups.length; i++) {
      var t = sessionDateMs_(signups[i].ts);
      if (t > last) last = t;
    }
    var sessions = readSessions_();
    var active = 0;
    var now = Date.now();
    for (var j = 0; j < sessions.length; j++) {
      if (!sessions[j].revoked && sessions[j].expires > now) active++;
    }
    var vistos = {};
    var studentCount = 0;
    for (var k = 0; k < signups.length; k++) {
      var clave = signups[k].emailKey || EsiCore.normalizeEmail(signups[k].email);
      if (!clave || vistos[clave]) continue;
      vistos[clave] = true;
      studentCount++;
    }
    return {
      ok: true,
      role: auth.role,
      server_time: new Date().toISOString(),
      evento_abierto: isOpen_(cfg),
      last_signup: last ? new Date(last).toISOString() : '',
      total: signups.length,
      student_count: studentCount,
      active_sessions: active,
      mail_quota: mailQuota_(),
      test_count: signups.filter(function (x) { return !!x.prueba; }).length,
      data_erased: convertBool_(cfg[CONFIG_DATA_ERASED]),
      modo_prueba: convertBool_(cfg[CONFIG_TEST_MODE])
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
      logAction_('delete_signup', signupId, '');
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

function signupRowsByEmail_(email) {
  var key = EsiCore.normalizeEmail(email);
  var signups = readSignups_();
  var out = [];
  for (var i = 0; i < signups.length; i++) {
    if (signups[i].emailKey !== key) continue;
    out.push({ row: findSignupRow_(signups[i].id), signup: signups[i] });
  }
  return out;
}

function setSignupFields_(sh, map, row, fields) {
  for (var key in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    if (map[key] == null || map[key] < 0) continue;
    sh.getRange(row, map[key] + 1).setValue(fields[key]);
  }
}

function updateSessionsStudent_(student) {
  try {
    var sh = sessionsSheet_();
    var vals = sh.getDataRange().getValues();
    if (!vals.length || EsiCore.normalizeText(vals[0][0]) !== 'token_hash') return;
    var apellidoCol = -1;
    for (var h = 0; h < vals[0].length; h++) {
      if (EsiCore.normalizeText(vals[0][h]) === 'apellido') { apellidoCol = h; break; }
    }
    for (var i = 1; i < vals.length; i++) {
      if (EsiCore.normalizeEmail(vals[i][1]) !== student.email) continue;
      sh.getRange(i + 1, 3).setValue(student.nombre);
      sh.getRange(i + 1, 4).setValue(student.curso);
      sh.getRange(i + 1, 5).setValue(student.ciclo);
      if (apellidoCol >= 0) sh.getRange(i + 1, apellidoCol + 1).setValue(student.apellido || '');
    }
  } catch (e) { }
}

function updateRosterStudent_(student) {
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(STUDENTS_SHEET);
    if (!sh) return;
    var vals = sh.getDataRange().getValues();
    if (!vals.length) return;
    var map = studentsHeader_(vals[0]);
    if (!map) return;
    for (var i = 1; i < vals.length; i++) {
      if (EsiCore.normalizeEmail(vals[i][map.email]) !== student.email) continue;
      if (map.apellido != null) sh.getRange(i + 1, map.apellido + 1).setValue(student.apellido || '');
      if (map.completo != null) sh.getRange(i + 1, map.completo + 1).setValue(student.nombre);
      else if (map.nombre != null) sh.getRange(i + 1, map.nombre + 1).setValue(givenName_(student.nombre, student.apellido));
      if (map.curso != null) sh.getRange(i + 1, map.curso + 1).setValue(student.curso);
      return;
    }
  } catch (e) { }
}

function revokeAllStudentSessions_() {
  try {
    var rows = readSessions_();
    var sh = sessionsSheet_();
    var count = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].revoked) continue;
      sh.getRange(rows[i].row, rows[i].revokedCol).setValue(true);
      count++;
    }
    return count;
  } catch (e) {
    return 0;
  }
}

function apiAdminDuplicates(cred) {
  try {
    var auth = adminAuth_(cred);
    var perm = requireAdmin_(auth);
    if (!perm.ok) return { ok: false, message: perm.message };
    var signups = readSignups_();
    var talks = readTalksCached_();
    var slots = readSlotsCached_();
    var talkById = {};
    for (var t = 0; t < talks.length; t++) talkById[String(talks[t].id)] = talks[t];
    var groups = {};
    var order = [];
    for (var i = 0; i < signups.length; i++) {
      var s = signups[i];
      var ap = EsiCore.normalizeText(s.apellido);
      var nom = EsiCore.normalizeText(givenName_(s.nombre, s.apellido));
      if (!ap && !nom) continue;
      var key = ap + '|' + nom + '|' + EsiCore.normalizeText(s.curso);
      if (!groups[key]) {
        groups[key] = {
          apellido: s.apellido || '',
          nombre: givenName_(s.nombre, s.apellido),
          curso: s.curso || '',
          emails: {},
          talks: []
        };
        order.push(key);
      }
      var g = groups[key];
      if (!g.emails[s.email]) g.emails[s.email] = true;
      var talk = talkById[String(s.talk_id)] || null;
      g.talks.push({
        signup_id: s.id,
        email: s.email,
        talk_id: s.talk_id,
        titulo: talk ? talk.titulo : s.talk_id,
        lugar: talk ? (talk.lugar || '') : '',
        slotLabel: slotLabelFor_(slots, s.slot_id),
        presente: !!s.presente
      });
    }
    var out = [];
    for (var j = 0; j < order.length; j++) {
      var group = groups[order[j]];
      var emails = Object.keys(group.emails);
      if (emails.length < 2) continue;
      emails.sort();
      group.emails = emails;
      group.talks.sort(function (a, b) { return String(a.slotLabel).localeCompare(String(b.slotLabel), 'es'); });
      out.push(group);
    }
    out.sort(function (a, b) {
      return String(a.apellido).localeCompare(String(b.apellido), 'es', { sensitivity: 'base' });
    });
    return { ok: true, groups: out, total: out.length };
  } catch (err) {
    return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
  }
}

function apiAdminAddStudent(cred, data) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var d = data && typeof data === 'object' ? data : {};
  var v = EsiCore.validateStudentInput(d.email, d.nombre, d.curso, d.apellido);
  if (!v.ok) return { ok: false, message: STUDENT_ERRORS_[v.error] || 'Datos inválidos.' };
  if (!EsiCore.isInstitutionalEmail(v.email)) return { ok: false, message: STUDENT_ERRORS_.email };
  var ids = d.talkIds;
  if (Object.prototype.toString.call(ids) !== '[object Array]' || !ids.length) {
    return { ok: false, message: 'Elegí al menos una charla.' };
  }
  return withScriptLock_(ADMIN_LOCK_MS * 2, function () {
    try {
      var talks = readTalksCached_();
      var talkById = {};
      for (var i = 0; i < talks.length; i++) talkById[String(talks[i].id)] = talks[i];
      var signups = readSignups_();
      var counts = countByTalk_(signups);
      var bySlot = {};
      var mine = {};
      for (var m = 0; m < signups.length; m++) {
        if (signups[m].emailKey === v.email) {
          bySlot[Number(signups[m].slot_id)] = true;
          mine[String(signups[m].talk_id)] = true;
        }
      }
      var chosen = [];
      for (var j = 0; j < ids.length; j++) {
        var talk = talkById[String(ids[j])];
        if (!talk) return { ok: false, message: 'No encontramos una de las charlas.' };
        if (!talk.activa) return { ok: false, message: 'Esa charla no está disponible.' };
        if (talk.ciclo !== v.ciclo) return { ok: false, message: 'Esa charla no es del ciclo del alumno.' };
        if (bySlot[Number(talk.slot_id)]) return { ok: false, message: 'Ya tiene una charla en ese horario.' };
        if (mine[String(talk.id)]) return { ok: false, message: 'Ya está anotado en esa charla.' };
        if ((counts[talk.id] || 0) >= Number(talk.cupo)) return { ok: false, message: 'Sin lugares en ' + talk.titulo + '.' };
        bySlot[Number(talk.slot_id)] = true;
        mine[String(talk.id)] = true;
        chosen.push(talk);
      }
      var cfg = readConfig_();
      var student = {
        email: v.email,
        nombre: v.nombre,
        apellido: v.apellido,
        curso: v.curso,
        ciclo: v.ciclo,
        emailKey: v.emailKey,
        prueba: convertBool_(cfg.modo_prueba),
        recordatorio: reminderOptIn_(signups, v.email)
      };
      var added = [];
      for (var k = 0; k < chosen.length; k++) {
        var id = appendSignupRow_(student, chosen[k]);
        logAction_('manual_add', id, chosen[k].id);
        added.push({ id: id, talk_id: chosen[k].id });
      }
      invalidateDataCache_();
      return { ok: true, added: added, message: 'Alumno anotado.' };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function apiAdminCorrectStudent(cred, email, data) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var d = data && typeof data === 'object' ? data : {};
  var v = EsiCore.validateStudentInput(email, d.nombre, d.curso, d.apellido);
  if (!v.ok) return { ok: false, message: STUDENT_ERRORS_[v.error] || 'Datos inválidos.' };
  return withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      var rows = signupRowsByEmail_(v.email);
      if (!rows.length) return { ok: false, message: 'Ese mail no tiene inscripciones.' };
      var talks = readTalksCached_();
      var talkById = {};
      for (var t = 0; t < talks.length; t++) talkById[String(talks[t].id)] = talks[t];
      for (var i = 0; i < rows.length; i++) {
        var talk = talkById[String(rows[i].signup.talk_id)];
        if (talk && talk.ciclo !== v.ciclo) {
          return { ok: false, message: 'Ese cambio de ciclo no coincide con las charlas anotadas.' };
        }
      }
      var sh = sheet_(SIGNUPS_SHEET);
      var map = signupsHeaderMap_(sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]);
      for (var j = 0; j < rows.length; j++) {
        setSignupFields_(sh, map, rows[j].row, {
          nombre: v.nombre,
          apellido: v.apellido,
          curso: v.curso,
          ciclo: v.ciclo
        });
      }
      updateSessionsStudent_(v);
      updateRosterStudent_(v);
      logAction_('correct_student', rows[0].signup.id, '');
      invalidateDataCache_();
      return { ok: true, updated: rows.length, student: { email: v.email, nombre: v.nombre, apellido: v.apellido, curso: v.curso, ciclo: v.ciclo } };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function apiAdminMoveTalk(cred, signupId, talkId) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  return withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      var row = findSignupRow_(signupId);
      if (!row) return { ok: false, message: 'No encontramos esa inscripción.' };
      var signups = readSignups_();
      var current = null;
      for (var i = 0; i < signups.length; i++) {
        if (String(signups[i].id) === String(signupId)) { current = signups[i]; break; }
      }
      if (!current) return { ok: false, message: 'No encontramos esa inscripción.' };
      var talks = readTalksCached_();
      var talk = null;
      for (var j = 0; j < talks.length; j++) {
        if (String(talks[j].id) === String(talkId)) { talk = talks[j]; break; }
      }
      if (!talk) return { ok: false, message: 'No encontramos esa charla.' };
      if (!talk.activa) return { ok: false, message: 'Esa charla no está disponible.' };
      if (Number(talk.slot_id) !== Number(current.slot_id)) return { ok: false, message: 'Solo se puede mover dentro del mismo horario.' };
      if (talk.ciclo !== current.ciclo) return { ok: false, message: 'Esa charla no es del ciclo del alumno.' };
      if (String(talk.id) === String(current.talk_id)) return { ok: true, changed: false };
      var counts = countByTalk_(signups);
      if ((counts[talk.id] || 0) >= Number(talk.cupo)) return { ok: false, message: 'Sin lugares en ' + talk.titulo + '.' };
      for (var k = 0; k < signups.length; k++) {
        if (signups[k].emailKey === current.emailKey && String(signups[k].talk_id) === String(talk.id)) {
          return { ok: false, message: 'Ya está anotado en esa charla.' };
        }
      }
      var sh = sheet_(SIGNUPS_SHEET);
      var map = signupsHeaderMap_(sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]);
      setSignupFields_(sh, map, row, { talk_id: String(talk.id) });
      logAction_('move_talk', signupId, talk.id);
      invalidateDataCache_();
      return { ok: true, changed: true, talk: { id: talk.id, titulo: talk.titulo } };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function apiAdminMergeDuplicates(cred, keepEmail, dropEmail) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var keep = EsiCore.normalizeEmail(keepEmail);
  var drop = EsiCore.normalizeEmail(dropEmail);
  if (!EsiCore.isInstitutionalEmail(keep) || !EsiCore.isInstitutionalEmail(drop) || keep === drop) {
    return { ok: false, message: 'Elegí dos mails distintos.' };
  }
  return withScriptLock_(ADMIN_LOCK_MS * 2, function () {
    try {
      var keepRows = signupRowsByEmail_(keep);
      var dropRows = signupRowsByEmail_(drop);
      if (!keepRows.length || !dropRows.length) return { ok: false, message: 'Faltan inscripciones para fusionar.' };
      var keepSignup = keepRows[0].signup;
      var keepSlots = {};
      for (var i = 0; i < keepRows.length; i++) keepSlots[Number(keepRows[i].signup.slot_id)] = true;
      var sh = sheet_(SIGNUPS_SHEET);
      var map = signupsHeaderMap_(sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]);
      var deleted = [];
      var moved = 0;
      for (var j = 0; j < dropRows.length; j++) {
        var dr = dropRows[j];
        if (keepSlots[Number(dr.signup.slot_id)]) {
          deleted.push(dr.row);
          continue;
        }
        setSignupFields_(sh, map, dr.row, {
          email: keepSignup.email,
          nombre: keepSignup.nombre,
          apellido: keepSignup.apellido,
          curso: keepSignup.curso,
          ciclo: keepSignup.ciclo
        });
        keepSlots[Number(dr.signup.slot_id)] = true;
        moved++;
      }
      deleted.sort(function (a, b) { return b - a; });
      for (var k = 0; k < deleted.length; k++) sh.deleteRow(deleted[k]);
      revokeSessionsForEmail_(drop);
      logAction_('merge_duplicates', keepSignup.id, 'moved=' + moved + ';deleted=' + deleted.length);
      invalidateDataCache_();
      return { ok: true, moved: moved, deleted: deleted.length };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function apiAdminDeleteStudent(cred, email) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  var norm = EsiCore.normalizeEmail(email);
  if (!EsiCore.isInstitutionalEmail(norm)) return { ok: false, message: STUDENT_ERRORS_.email };
  var resp = withScriptLock_(ADMIN_LOCK_MS, function () {
    try {
      var rows = signupRowsByEmail_(norm);
      if (!rows.length) return { ok: false, message: 'Ese mail no tiene inscripciones.' };
      var sh = sheet_(SIGNUPS_SHEET);
      rows.sort(function (a, b) { return b.row - a.row; });
      for (var i = 0; i < rows.length; i++) sh.deleteRow(rows[i].row);
      revokeSessionsForEmail_(norm);
      logAction_('delete_student', rows[0].signup.id, 'rows=' + rows.length);
      invalidateDataCache_();
      return { ok: true, deleted: rows.length };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
  if (resp && resp.ok) {
    try { rebuildReport_(); } catch (e) { }
  }
  return resp;
}

function apiAdminDeleteTestData(cred, confirmation) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  if (String(confirmation || '') !== 'BORRAR PRUEBA') return { ok: false, message: 'Confirmación inválida.' };
  var resp = withScriptLock_(ADMIN_LOCK_MS * 2, function () {
    try {
      var signups = readSignups_();
      var rows = [];
      for (var i = 0; i < signups.length; i++) {
        if (signups[i].prueba) rows.push({ id: signups[i].id, row: findSignupRow_(signups[i].id) });
      }
      rows.sort(function (a, b) { return b.row - a.row; });
      var sh = sheet_(SIGNUPS_SHEET);
      for (var j = 0; j < rows.length; j++) sh.deleteRow(rows[j].row);
      logAction_('delete_test_data', '', 'rows=' + rows.length);
      invalidateDataCache_();
      return { ok: true, deleted: rows.length };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
  if (resp && resp.ok) {
    try { rebuildReport_(); } catch (e) { }
  }
  return resp;
}

function apiAdminCloseEvent(cred) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  return withScriptLock_(ADMIN_LOCK_MS * 2, function () {
    try {
      writeConfig_('evento_abierto', 'cerrado');
      var revoked = revokeAllStudentSessions_();
      logAction_('close_event', '', 'revoked=' + revoked);
      invalidateDataCache_();
      return { ok: true, evento_abierto: false, revoked: revoked };
    } catch (err) {
      return { ok: false, message: 'Error: ' + (err && err.message ? err.message : err) };
    }
  });
}

function csvCell_(value) {
  var v = String(value == null ? '' : value);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function exportPersonalData_(signups) {
  if (typeof DriveApp === 'undefined') return { ok: false, skipped: true };
  try {
    var head = ['email', 'nombre', 'apellido', 'curso', 'ciclo', 'slot_id', 'talk_id', 'presente', 'recordatorio', 'prueba'];
    var lines = [head.join(',')];
    for (var i = 0; i < signups.length; i++) {
      var s = signups[i];
      lines.push([
        s.email, s.nombre, s.apellido, s.curso, s.ciclo, s.slot_id, s.talk_id,
        s.presente ? 'si' : 'no', s.recordatorio ? 'si' : 'no', s.prueba ? 'si' : 'no'
      ].map(csvCell_).join(','));
    }
    var name = 'esi-datos-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    var file = DriveApp.createFile(name, lines.join('\n'), 'text/csv');
    return { ok: true, name: name, fileId: file.getId() };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
}

function apiAdminErasePersonalData(cred, confirmation) {
  var auth = adminAuth_(cred);
  var perm = requireAdmin_(auth);
  if (!perm.ok) return { ok: false, message: perm.message };
  if (String(confirmation || '') !== 'BORRAR') return { ok: false, message: 'Confirmación inválida.' };
  var resp = withScriptLock_(ADMIN_LOCK_MS * 3, function () {
    try {
      var signups = readSignups_();
      var byTalk = {};
      var order = [];
      for (var i = 0; i < signups.length; i++) {
        var s = signups[i];
        var key = String(s.talk_id) + '|' + String(s.slot_id) + '|' + String(s.ciclo);
        if (!byTalk[key]) {
          byTalk[key] = { talk_id: s.talk_id, slot_id: s.slot_id, ciclo: s.ciclo, anotados: 0, presentes: 0 };
          order.push(key);
        }
        byTalk[key].anotados++;
        if (s.presente) byTalk[key].presentes++;
      }
      var sessions = readSessions_();
      var mailsSh = sheet_(SENT_MAILS_SHEET);
      var mailCount = Math.max(0, mailsSh.getLastRow() - 1);

      var dump = exportPersonalData_(signups);
      if (!dump.ok && !dump.skipped) {
        return { ok: false, message: 'No se pudo exportar antes de borrar: ' + (dump.message || 'error') };
      }

      var ss = SpreadsheetApp.getActive();
      var signupsSh = sheet_(SIGNUPS_SHEET);
      var signupHead = signupsSh.getRange(1, 1, 1, Math.max(1, signupsSh.getLastColumn())).getValues()[0];
      signupsSh.clearContents();
      signupsSh.getRange(1, 1, 1, signupHead.length).setValues([signupHead]);

      var sRows = [['talk_id', 'slot_id', 'ciclo', 'anotados', 'presentes']];
      for (var k = 0; k < order.length; k++) {
        var r = byTalk[order[k]];
        sRows.push([r.talk_id, r.slot_id, r.ciclo, r.anotados, r.presentes]);
      }
      var resumenSh = ensureSheet_(ss, RESUMEN_SHEET,
        ['talk_id', 'slot_id', 'ciclo', 'anotados', 'presentes'], []);
      resumenSh.clearContents();
      resumenSh.getRange(1, 1, sRows.length, 5).setValues(sRows);

      var sessionsSh = sessionsSheet_();
      var sessionsHead = sessionsSh.getRange(1, 1, 1, Math.max(1, sessionsSh.getLastColumn())).getValues()[0];
      sessionsSh.clearContents();
      sessionsSh.getRange(1, 1, 1, sessionsHead.length).setValues([sessionsHead]);

      var mailHead = mailsSh.getRange(1, 1, 1, Math.max(1, mailsSh.getLastColumn())).getValues()[0];
      mailsSh.clearContents();
      mailsSh.getRange(1, 1, 1, mailHead.length).setValues([mailHead]);

      var studentsSh = ss.getSheetByName(STUDENTS_SHEET);
      if (studentsSh) {
        var studentsHead = studentsSh.getRange(1, 1, 1, Math.max(1, studentsSh.getLastColumn())).getValues()[0];
        studentsSh.clearContents();
        studentsSh.getRange(1, 1, 1, studentsHead.length).setValues([studentsHead]);
      }
      var backupSh = ensureSheet_(ss, BACKUP_SHEET,
        ['backup_at', 'id', 'ts', 'email', 'nombre', 'curso', 'ciclo', 'slot_id', 'talk_id', 'presente', 'apellido', 'recordatorio', 'prueba'], []);
      var backupHead = backupSh.getRange(1, 1, 1, Math.max(1, backupSh.getLastColumn())).getValues()[0];
      backupSh.clearContents();
      backupSh.getRange(1, 1, 1, backupHead.length).setValues([backupHead]);

      writeConfig_('evento_abierto', 'cerrado');
      writeConfig_(CONFIG_DATA_ERASED, 'si');
      logAction_('erase_personal_data', '', 'signups=' + signups.length + ';sessions=' + sessions.length + ';mails=' + mailCount);
      invalidateDataCache_();
      return {
        ok: true, signups: signups.length, sessions: sessions.length, mails: mailCount,
        talks: order.length, export: dump.name || ''
      };
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
    var target = sh.getRange(1, 1, outRows.length, 5);
    target.setNumberFormat('@');
    target.setValues(outRows);
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
    var lastRow = sh.getLastRow();
    if (lastRow > 0) sh.getRange(1, 1, lastRow, Math.max(width, sh.getLastColumn() || width)).clearContent();
    sh.getRange(1, 1, rows.length, width).setValues(rows);
    sh.setFrozenRows(2);
  } catch (e) {
    Logger.log('rebuildReport_ fallo: ' + e);
  }
}
