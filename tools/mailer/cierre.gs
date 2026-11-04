/**
 * Campaña de cierre de la Jornada ESI 2026 (agradecimiento + disculpas).
 *
 * Vive en el MISMO proyecto de Apps Script que el robot (esi-mailer.gs) y usa
 * la misma cola `MailQueue`: no manda nada por su cuenta, deja una fila por
 * alumno y el trigger de cada minuto se encarga del envío con la cuenta esi@.
 *
 * Correr a mano desde el editor (cuenta esi@):
 *   encolarCierrePrueba()  -> un mail de muestra a la propia casilla
 *   encolarCierre()        -> a todos los inscriptos de `Signups`
 *   diagnosticoCierre()    -> cómo va la campaña (sin mandar nada)
 *
 * Es idempotente: si un mail ya tiene una fila tipo 'cierre' (pendiente,
 * enviada o con error) no se vuelve a encolar. Se puede cortar en cualquier
 * momento pasando esas filas a 'error'.
 *
 * No toca Talks, Students ni Config: solo lee `Signups`/`Config` y agrega
 * filas al final de `MailQueue`.
 */

var CIERRE_TIPO_ = 'cierre';
var CIERRE_ASUNTO_ = 'Gracias por participar de la Jornada ESI 2026';
var CIERRE_SIGNUPS_ = 'Signups';
var CIERRE_GRACIA_MS_ = 60 * 1000; // un minuto de aire para que el trigger tome la fila

// Equipo de la jornada: mismo mail, saludado por su nombre (no salen de
// Signups, así que se agregan a mano). "directivos" es el saludo del buzón
// compartido de dirección.
var CIERRE_EQUIPO_ = [
  { email: 'pablopreceptoria@secundariosalsipuedes.edu.ar', nombre: 'Pablo' },
  { email: 'eugeniapreceptoria@secundariosalsipuedes.edu.ar', nombre: 'Euge' },
  { email: 'virginiapreceptoria@secundariosalsipuedes.edu.ar', nombre: 'Virgi' },
  { email: 'direccioniss@secundariosalsipuedes.edu.ar', nombre: 'directivos' }
];

function cierreParrafos_() {
  return [
    'Ya terminó la Jornada ESI 2026 y queríamos escribirte para agradecerte por haber sido parte.',
    '',
    'Gracias por anotarte, por elegir tus charlas, por venir y por sostener los horarios. Gracias también a quienes preguntaron, contaron algo propio o se animaron a escuchar temas que no siempre son fáciles de poner en palabras. Una jornada así no se hace sola: se hace con cada curso que entra al aula dispuesto a escuchar y a respetar lo que cuenta el otro.',
    '',
    'También queremos pedirte disculpas por los problemas técnicos que hubo. Esta fue la primera vez que organizamos la jornada de esta manera, con inscripción por horarios, cupos y un panel para elegir las charlas, y hubo cosas que no funcionaron bien: el panel que se trababa o tardaba en cargar, inscripciones que se cruzaron, cupos que se llenaron, cambios de charla a último momento y algún mail que no llegó o llegó dos veces. Sabemos que eso generó dudas, enojos y tiempo perdido, y lo sentimos de verdad. No fue por falta de trabajo: fue una primera versión, hecha con muchas ganas y aprendiendo sobre la marcha.',
    '',
    'Todo lo que salió mal quedó anotado y lo vamos a corregir para el año que viene: un panel más simple y más rápido, una organización más clara de los cupos y de la asistencia, y avisos más ordenados antes del evento. La idea es que la Jornada ESI siga creciendo y que la próxima vez la pases mejor.',
    '',
    'Si querés contarnos algo de tu experiencia, alguna sugerencia o algo que no te gustó, respondé este mail: nos sirve mucho para la próxima. Gracias también a los docentes y preceptores que acompañaron ese día.',
    '',
    'Nos vemos en la Jornada ESI 2027.',
    '',
    'Luciano Arias',
    'Coordinación Jornada ESI · Instituto Secundario Salsipuedes'
  ];
}

function cierreSaludo_(nombre) {
  return nombre ? 'Hola ' + nombre + ':' : 'Hola:';
}

function cierreCuerpo_(nombre) {
  return [cierreSaludo_(nombre)].concat(cierreParrafos_()).join('\n');
}

function cierreEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Versión HTML del mismo texto: párrafos reales en lugar de una línea larga,
 * así la app de Gmail (y cualquier otro cliente) no reacomoda el texto y se ve
 * igual en todos lados. Estilos en línea: los clientes de mail ignoran <style>.
 */
function cierreHtml_(nombre) {
  var parrafos = cierreParrafos_();
  var firma = parrafos.slice(parrafos.length - 2);
  var cuerpo = parrafos.slice(0, parrafos.length - 2);
  var partes = [];
  var buffer = [];
  for (var i = 0; i < cuerpo.length; i++) {
    if (cuerpo[i] === '') {
      if (buffer.length) {
        partes.push(buffer.join(' '));
        buffer = [];
      }
      continue;
    }
    buffer.push(cuerpo[i]);
  }
  if (buffer.length) partes.push(buffer.join(' '));
  var est = 'font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#222222';
  var html = ['<div style="' + est + ';max-width:600px">'];
  html.push('<p style="margin:0 0 16px">' + cierreEsc_(cierreSaludo_(nombre)) + '</p>');
  for (var j = 0; j < partes.length; j++) {
    html.push('<p style="margin:0 0 16px">' + cierreEsc_(partes[j]) + '</p>');
  }
  html.push('<p style="margin:28px 0 0">' + cierreEsc_(firma[0]) + '<br>' + cierreEsc_(firma[1]) + '</p>');
  html.push('</div>');
  return html.join('\n');
}


/** "abril" -> "Abril"; no corrige tildes ni inventa nada. */
function cierreNombre_(v) {
  var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Valores de hoja que significan "si" (el backend escribe 'si'/'no'). */
function cierreSi_(v) {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'si' || s === 'sí' || s === 'true' || s === '1' || s === 'x';
}

/** Lee Config y corta si los avisos por mail están apagados. */
function cierreAvisosActivos_() {
  try {
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Config');
    if (!sh) return true;
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim().toLowerCase() !== 'avisos_mail') continue;
      var v = String(vals[i][1] || '').trim().toLowerCase();
      return !(v === 'no' || v === 'false' || v === '0' || v === 'off');
    }
  } catch (e) {
    // Si no puedo leer Config no freno la campaña: es un switch de comodidad.
  }
  return true;
}

/**
 * Un destinatario por mail único de `Signups` (las filas de prueba quedan
 * afuera). Devuelve además cuántas filas se leyeron y cuántos quedaron sin
 * nombre, para poder diagnosticar.
 */
function cierreDestinatarios_(limite) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(CIERRE_SIGNUPS_);
  if (!sh) throw new Error('no existe la hoja ' + CIERRE_SIGNUPS_);
  var vals = sh.getDataRange().getValues();
  var out = { lista: [], filas: 0, sinNombre: 0, pruebaFuera: 0, repetidos: 0, sinMail: 0 };
  if (vals.length < 2) return out;
  out.filas = vals.length - 1;
  var map = headerMap_(vals[0] || []);
  if (map.email == null) throw new Error('la hoja Signups no tiene columna email');
  var vistos = {};
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var email = String(r[map.email] || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) {
      out.sinMail++;
      continue;
    }
    if (map.prueba != null && cierreSi_(r[map.prueba])) {
      out.pruebaFuera++;
      continue;
    }
    if (vistos[email]) {
      out.repetidos++;
      continue;
    }
    vistos[email] = true;
    var nombre = map.nombre != null ? cierreNombre_(r[map.nombre]) : '';
    if (!nombre) out.sinNombre++;
    out.lista.push({ email: email, nombre: nombre });
    if (limite && out.lista.length >= limite) break;
  }
  return out;
}

/** Encabezado de MailQueue y fila vacía respetando el orden real de columnas. */
function cierreCola_(q) {
  var vals = q.getDataRange().getValues();
  if (vals.length < 1) throw new Error('la hoja MailQueue está vacía');
  var map = headerMap_(vals[0] || []);
  var faltan = ['id', 'ts', 'envio_at', 'email', 'tipo', 'estado', 'intentos', 'asunto', 'cuerpo']
    .filter(function (c) { return map[c] == null; });
  if (faltan.length) throw new Error('MailQueue sin columnas: ' + faltan.join(', '));
  return { vals: vals, map: map, ancho: vals[0].length };
}

/** Emails que ya tienen una fila de esta campaña (cualquier estado). */
function cierreYaEncolados_(vals, map) {
  var ya = {};
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][map.tipo] || '').toLowerCase().trim() !== CIERRE_TIPO_) continue;
    var email = String(vals[i][map.email] || '').trim().toLowerCase();
    if (email) ya[email] = true;
  }
  return ya;
}

/**
 * Encola la campaña. `opciones`:
 *   destinatarios: [{email, nombre}] (por defecto, todos los de Signups)
 *   etiqueta: texto libre para el reporte
 */
function cierreEncolar_(opciones) {
  var o = opciones || {};
  if (!cierreAvisosActivos_()) {
    return { ok: false, message: 'Los avisos por mail están apagados en Config (avisos_mail=no).' };
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    return { ok: false, message: 'El robot está corriendo justo ahora. Probá de nuevo en un minuto.' };
  }
  try {
    var q = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!q) return { ok: false, message: 'no existe la hoja ' + SHEET_NAME };
    var cola = cierreCola_(q);
    var ya = cierreYaEncolados_(cola.vals, cola.map);
    var ahora = Date.now();
    var envioAt = new Date(ahora + CIERRE_GRACIA_MS_);
    var filas = [];
    var saltados = 0;
    for (var k = 0; k < o.destinatarios.length; k++) {
      var d = o.destinatarios[k];
      if (ya[d.email]) {
        saltados++;
        continue;
      }
      var f = new Array(cola.ancho);
      for (var c = 0; c < cola.ancho; c++) f[c] = '';
      f[cola.map.id] = CIERRE_TIPO_ + '-' + ahora + '-' + k;
      f[cola.map.ts] = new Date(ahora);
      f[cola.map.envio_at] = envioAt;
      f[cola.map.email] = d.email;
      f[cola.map.tipo] = CIERRE_TIPO_;
      f[cola.map.estado] = 'pendiente';
      f[cola.map.intentos] = 0;
      f[cola.map.asunto] = CIERRE_ASUNTO_;
      f[cola.map.cuerpo] = cierreCuerpo_(d.nombre);
      filas.push(f);
    }
    if (filas.length) {
      // appendRow por fila es muy lento con cientos de filas: un solo setValues.
      var inicio = q.getLastRow() + 1;
      var faltanFilas = inicio + filas.length - 1 - q.getMaxRows();
      if (faltanFilas > 0) q.insertRowsAfter(q.getMaxRows(), faltanFilas);
      q.getRange(inicio, 1, filas.length, cola.ancho).setValues(filas);
    }
    var resumen = {
      ok: true,
      etiqueta: o.etiqueta || '',
      encoladas: filas.length,
      saltados: saltados,
      total_destinatarios: o.destinatarios.length,
      envio_desde: 'esi@ (trigger de cada minuto)',
      primera_fila: filas.length ? inicio : 0,
      asunto: CIERRE_ASUNTO_
    };
    Logger.log('cierre: ' + JSON.stringify(resumen));
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Destinatarios de la campaña completa: un mail por alumno inscripto más el
 * equipo de la jornada (sin repetir si alguno ya está en Signups).
 */
function cierreDestinos_() {
  var d = cierreDestinatarios_();
  var vistos = {};
  var lista = [];
  var equipo = 0;
  for (var i = 0; i < d.lista.length; i++) {
    var a = d.lista[i];
    vistos[a.email] = true;
    lista.push(a);
  }
  for (var j = 0; j < CIERRE_EQUIPO_.length; j++) {
    var e = CIERRE_EQUIPO_[j];
    var em = String(e.email || '').trim().toLowerCase();
    if (!em || em.indexOf('@') < 1 || vistos[em]) continue;
    vistos[em] = true;
    lista.push({ email: em, nombre: e.nombre });
    equipo++;
  }
  d.lista = lista;
  d.equipo = equipo;
  return d;
}

/** Campaña completa: un mail por alumno inscripto más el equipo. */
function encolarCierre() {
  var d = cierreDestinos_();
  var r = cierreEncolar_({ destinatarios: d.lista, etiqueta: 'todos' });
  r.signups = { filas: d.filas, unicos: d.lista.length - d.equipo, sin_nombre: d.sinNombre, prueba_fuera: d.pruebaFuera, repetidos: d.repetidos, sin_mail: d.sinMail };
  r.equipo = d.equipo;
  Logger.log('cierre todos: ' + JSON.stringify(r));
  return r;
}

/** Muestra de un solo mail, a la casilla que ejecuta (esi@), con un nombre real. */
function encolarCierrePrueba() {
  var yo = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  var destinos = [{ email: yo || 'esi@secundariosalsipuedes.edu.ar', nombre: 'Luciano' }];
  var r = cierreEncolar_({ destinatarios: destinos, etiqueta: 'prueba' });
  Logger.log('cierre prueba: ' + JSON.stringify(r));
  return r;
}

/**
 * Manda el mismo texto en HTML, directo (sin pasar por la cola), para ver cómo
 * lo renderiza el cliente. Correr desde el editor con la cuenta esi@: sin
 * argumento va a la propia casilla; `enviarPruebaHtml('otro@mail')` a otra.
 */
function enviarPruebaHtml(destino) {
  var to = String(destino || Session.getActiveUser().getEmail() || '').trim();
  var texto = cierreCuerpo_('Luciano');
  var html = cierreHtml_('Luciano');
  GmailApp.sendEmail(to, CIERRE_ASUNTO_, texto, { htmlBody: html, name: SENDER_NAME });
  var out = { ok: true, para: to, asunto: CIERRE_ASUNTO_, html_bytes: html.length };
  Logger.log('cierre prueba html: ' + JSON.stringify(out));
  return out;
}

/** Estado de la campaña, sin mandar ni encolar nada. */
function diagnosticoCierre() {
  var q = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!q) return { ok: false, message: 'no existe la hoja ' + SHEET_NAME };
  var cola = cierreCola_(q);
  var estados = {};
  var filas = 0;
  for (var i = 1; i < cola.vals.length; i++) {
    if (String(cola.vals[i][cola.map.tipo] || '').toLowerCase().trim() !== CIERRE_TIPO_) continue;
    var e = String(cola.vals[i][cola.map.estado] || '(vacio)').toLowerCase().trim();
    estados[e] = (estados[e] || 0) + 1;
    filas++;
  }
  var d = cierreDestinos_();
  var ya = cierreYaEncolados_(cola.vals, cola.map);
  var out = {
    ok: true,
    campana: { filas: filas, estados: estados },
    signups: { filas: d.filas, unicos: d.lista.length - d.equipo, sin_nombre: d.sinNombre, prueba_fuera: d.pruebaFuera, repetidos: d.repetidos, sin_mail: d.sinMail },
    equipo: d.equipo,
    faltan_encolar: d.lista.filter(function (x) { return !ya[x.email]; }).length,
    cola_total: cola.vals.length - 1,
    ultimos: ultimosEnvios_(cola.vals, cola.map, 5)
  };
  Logger.log('cierre diag: ' + JSON.stringify(out));
  return out;
}
