/**
 * Robot de mails ESI en la nube (Google Apps Script, cuenta institucional).
 *
 * POR QUE EXISTE: el poller de Termux y la via Gmail API del Playground
 * dependen de un refresh_token que Google revoca cada tanto; regenerarlo a
 * mano es molesto y el dia del evento no te podes quedar sin mails. Este
 * proyecto corre DENTRO de la cuenta esi@: usa GmailApp (manda como esi@) y
 * SpreadsheetApp (lee la cola) con la autorizacion propia de la cuenta. No
 * hay tokens, no hay secretos, no depende de que el celular este prendido.
 *
 * INSTALACION (una sola vez, ~3 minutos, en el navegador con la cuenta esi@):
 * 1. Compartir la planilla de la jornada con esi@ como Editor
 *    (la comparte el dueno del panel; sin esto el paso 4 falla con "no puedo
 *    abrir la planilla").
 * 2. Entrar a https://script.google.com con esi@ y crear "Nuevo proyecto".
 * 3. Borrar el Codigo.gs de ejemplo, pegar TODO este archivo y guardar.
 * 4. Elegir la funcion setup y tocar Ejecutar. Autorizar Sheets + Gmail.
 *    setup() verifica la planilla, instala el trigger de cada minuto y manda
 *    un mail de prueba a la propia cuenta (esi@).
 * 5. Revisar "Ejecuciones" (debe decir setup OK) y, si queres, correr
 *    diagnostico() para ver el estado de la cola.
 *
 * DESPUES: el trigger flushQueue corre cada minuto, toma las filas
 * `pendiente` vencidas, las reclama como `cola_nube` (asi el trigger viejo de
 * la webapp no las toca), manda y marca `enviado`. Si el proceso muere, a los
 * 5 minutos retoma las `cola_nube`. Con esto se puede apagar el poller de
 * Termux: `pkill -f supervisor.sh; pkill -f poller.mjs`.
 *
 * La planilla NO se toca desde aca salvo la columna estado/envio_at/intentos.
 */

var SPREADSHEET_ID = '1Gd9Tc-6t_WEtBPZnuNVYWKEs0aypM2RKPtKAtDjPP8I';
var SHEET_NAME = 'MailQueue';
var MAX_PER_RUN = 40;          // tope por corrida (cuota Gmail del Workspace)
var MAX_TRIES = 5;
var CLAIMED = 'cola_nube';     // estado de reclamo, igual que espera la webapp
var STALE_MS = 5 * 60 * 1000;  // reclamo viejo => se retoma
var TZ_OFFSET_H = -3;          // America/Argentina/Cordoba
var SENDER_NAME = 'Equipo ESI';

/** Instalacion: verifica acceso, instala el trigger y manda un mail de prueba. */
function setup() {
  var out = {
    cuenta: Session.getActiveUser().getEmail(),
    planilla: SPREADSHEET_ID,
    hoja: false,
    filas: 0,
    pendientes: 0,
    trigger: false,
    prueba: false
  };
  var ss;
  try {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    out.error = 'No puedo abrir la planilla. Compartila con ' + out.cuenta +
      ' como Editor. Detalle: ' + (e && e.message ? e.message : e);
    Logger.log(JSON.stringify(out));
    return out;
  }
  var sh = ss.getSheetByName(SHEET_NAME);
  out.hoja = !!sh;
  if (!sh) {
    out.error = 'La planilla no tiene la hoja ' + SHEET_NAME + '. Revisa el ID.';
    Logger.log(JSON.stringify(out));
    return out;
  }
  var vals = sh.getDataRange().getValues();
  out.filas = Math.max(0, vals.length - 1);
  var map = headerMap_(vals[0] || []);
  out.pendientes = countState_(vals, map, 'pendiente');
  out.trigger = installTrigger_();
  try {
    GmailApp.sendEmail(out.cuenta, 'ESI: prueba del robot de mails',
      'Si estas leyendo esto, el robot de mails de la ESI ya corre en la nube ' +
      'con la cuenta ' + out.cuenta + '.\n\n' +
      'Trigger cada 1 minuto: ' + (out.trigger ? 'instalado' : 'FALLO') + '\n' +
      'Cola: ' + out.filas + ' filas, ' + out.pendientes + ' pendientes.');
    out.prueba = true;
  } catch (eMail) {
    out.error = 'Sheet OK pero Gmail fallo: ' + (eMail && eMail.message ? eMail.message : eMail);
  }
  Logger.log(JSON.stringify(out));
  return out;
}

/**
 * Mail de prueba a una casilla concreta (para confirmar que llega afuera):
 * correr prueba('docente@example.com') desde el editor.
 */
function prueba(destino) {
  var to = String(destino || Session.getActiveUser().getEmail()).trim();
  GmailApp.sendEmail(to, 'ESI: prueba del robot de mails',
    'Mail de prueba enviado desde el robot de la ESI con la cuenta ' +
    Session.getActiveUser().getEmail() + '. Si llego, el envio anda.');
  Logger.log('prueba enviada a ' + to);
  return { ok: true, to: to };
}

/** Estado de la cola y del trigger (para revisar a mano desde el editor). */function diagnostico() {
  var out = { cuenta: Session.getActiveUser().getEmail(), hoja: false, trigger: false };
  try {
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sh) throw new Error('falta la hoja ' + SHEET_NAME);
    out.hoja = true;
    var vals = sh.getDataRange().getValues();
    var map = headerMap_(vals[0] || []);
    out.filas = Math.max(0, vals.length - 1);
    out.estados = {};
    for (var i = 1; i < vals.length; i++) {
      var st = String(vals[i][map.estado] || '').toLowerCase().trim() || '(vacio)';
      out.estados[st] = (out.estados[st] || 0) + 1;
    }
    var triggers = ScriptApp.getProjectTriggers();
    out.trigger = triggers.some(function (t) { return t.getHandlerFunction() === 'flushQueue'; });
    out.ultimos = ultimosEnvios_(vals, map, 3);
  } catch (e) {
    out.error = e && e.message ? e.message : String(e);
  }
  Logger.log(JSON.stringify(out));
  return out;
}

/** Trigger de cada minuto (idempotente). */
function installTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'flushQueue') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('flushQueue').timeBased().everyMinutes(1).create();
  return true;
}

/** Handler del trigger. */
function flushQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sh) return;
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return;
    var map = headerMap_(vals[0] || []);
    if (map.estado == null || map.envio_at == null) {
      Logger.log('faltan columnas estado/envio_at');
      return;
    }
    var now = Date.now();
    var sent = 0;
    for (var i = 1; i < vals.length && sent < MAX_PER_RUN; i++) {
      var r = vals[i];
      var estado = String(r[map.estado] || '').toLowerCase().trim();
      var tries = Number(r[map.intentos] || 0);
      if (tries >= MAX_TRIES) continue;
      var due = dueMs_(r[map.envio_at]);
      var stale = estado === CLAIMED && !isNaN(due) && (now - due > STALE_MS);
      if (estado !== 'pendiente' && !stale) continue;
      if (estado === 'pendiente' && !(due <= now)) continue;
      var to = String(r[map.email] || '').trim();
      var subject = String(r[map.asunto] || '').trim();
      var body = String(r[map.cuerpo] || '');
      if (!to || !subject) continue;
      // Reclamo antes de mandar: si el proceso muere, a los 5 min se retoma.
      sh.getRange(i + 1, map.estado + 1).setValue(CLAIMED);
      sh.getRange(i + 1, map.envio_at + 1).setValue(new Date());
      try {
        GmailApp.sendEmail(to, subject, body, { name: SENDER_NAME });
        sh.getRange(i + 1, map.estado + 1).setValue('enviado');
        sent++;
      } catch (e) {
        tries++;
        sh.getRange(i + 1, map.estado + 1).setValue(tries >= MAX_TRIES ? 'error' : 'pendiente');
        sh.getRange(i + 1, map.intentos + 1).setValue(tries);
        Logger.log('fallo fila ' + (i + 1) + ': ' + (e && e.message ? e.message : e));
      }
    }
    if (sent) Logger.log('enviados: ' + sent);
  } finally {
    lock.releaseLock();
  }
}

function headerMap_(head) {
  var map = {};
  for (var c = 0; c < head.length; c++) {
    var h = String(head[c] || '').toLowerCase().trim();
    if (h) map[h] = c;
  }
  return map;
}

function countState_(vals, map, state) {
  var n = 0;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][map.estado] || '').toLowerCase().trim() === state) n++;
  }
  return n;
}

function ultimosEnvios_(vals, map, n) {
  var rows = [];
  for (var i = vals.length - 1; i >= 1 && rows.length < n; i--) {
    if (String(vals[i][map.estado] || '').toLowerCase().trim() !== 'enviado') continue;
    rows.push({
      fila: i + 1,
      asunto: String(vals[i][map.asunto] || '').slice(0, 60),
      envio_at: String(vals[i][map.envio_at] || '')
    });
  }
  return rows;
}

// La hoja puede devolver Date (lo normal), string o el serial crudo (filas
// viejas que escribio la webapp con otra zona).
function dueMs_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return (v - 25569) * 86400000 - TZ_OFFSET_H * 3600000;
  if (typeof v === 'string') {
    var t = new Date(v).getTime();
    if (!isNaN(t)) return t;
  }
  return NaN;
}
