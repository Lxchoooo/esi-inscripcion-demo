#!/usr/bin/env node
'use strict';

/*
 * Simulacro de carga para la Jornada ESI.
 *
 * Escribe inscripciones de verdad (Signups, Sessions), por eso se niega a
 * correr sin --copia-ok: la unica URL valida es la de un deployment de una
 * COPIA de la planilla, nunca la real.
 *
 *   node scripts/loadtest.js <url-exec> --alumnos 50 --rampa 10,30,50 --copia-ok
 *
 * La clave admin, si hace falta verificar invariantes, va SOLO en la variable
 * de entorno ESI_ADMIN_KEY. Nunca por argumento, nunca en el log.
 *
 * Sin dependencias: solo modulos de Node.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DOMINIO = '@secundariosalsipuedes.edu.ar';
const CUPO = 40;
const CURSO = '1A';
const PAUSA_MAX_MS = 2000;
const TIMEOUT_MS = 20000;
const MAX_SEGUIDORES = 3;
const EXEC_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const LOG_REL = path.join('build', 'loadtest.log');

function usage() {
  return [
    'uso: node scripts/loadtest.js <url-exec> [--alumnos 50] [--rampa 10,30,50] --copia-ok',
    '',
    '  <url-exec>      /exec de una COPIA de la planilla (deployment propio)',
    '  --alumnos N     alumnos virtuales por tanda (1 a 300, por defecto 50)',
    '  --rampa A,B,C   simultaneos por tanda (por defecto 10,30,50)',
    '  --copia-ok      confirma que la planilla es una copia y se puede ensuciar',
    '',
    '  ESI_ADMIN_KEY   opcional: clave admin para verificar invariantes',
    '                  (tiene que estar activo modo_prueba)'
  ].join('\n');
}

function entero(valor, nombre) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 300) {
    throw new Error(nombre + ' tiene que ser un entero entre 1 y 300');
  }
  return n;
}

function parseArgs(argv) {
  const opts = { url: '', alumnos: 50, rampa: [10, 30, 50], copiaOk: false, ayuda: false };
  const args = (argv || []).slice();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      opts.ayuda = true;
    } else if (a === '--copia-ok') {
      opts.copiaOk = true;
    } else if (a === '--alumnos') {
      opts.alumnos = entero(args[++i], '--alumnos');
    } else if (a === '--rampa') {
      const valor = args[++i];
      const bruto = String(valor == null ? '' : valor).split(',');
      opts.rampa = bruto.map(function (x) { return entero(x.trim(), '--rampa'); });
    } else if (/^--(clave|key|pin|password)/i.test(a)) {
      throw new Error('la clave no va por argumento: usá la variable de entorno ESI_ADMIN_KEY');
    } else if (a.charAt(0) === '-') {
      throw new Error('opcion desconocida: ' + a);
    } else if (!opts.url) {
      opts.url = a;
    } else {
      throw new Error('sobra un argumento: ' + a);
    }
  }
  if (opts.ayuda) return opts;
  if (!opts.url) throw new Error('falta la URL /exec de la copia');
  if (!EXEC_URL.test(opts.url)) {
    throw new Error('la URL tiene que ser https://script.google.com/macros/s/<id>/exec');
  }
  opts.rampa = opts.rampa.filter(function (n, i, arr) { return arr.indexOf(n) === i; })
    .sort(function (a, b) { return a - b; });
  return opts;
}

function negativas(opts) {
  const motivos = [];
  if (!opts.copiaOk) {
    motivos.push(
      'falta --copia-ok: este script escribe filas reales en Signups y Sessions.\n' +
      'Corrélo solo contra el /exec de una COPIA de la planilla (Archivo > Hacer una copia,\n' +
      'y su propio deployment), y si es esa, repetí el comando agregando --copia-ok.'
    );
  }
  if (opts.rampa[opts.rampa.length - 1] > opts.alumnos) {
    motivos.push('--rampa pide mas simultaneos que alumnos: subí --alumnos');
  }
  return motivos;
}

function redactar(texto, clave) {
  let out = String(texto == null ? '' : texto);
  if (clave) out = out.split(clave).join('[clave]');
  return out.replace(/([?&](?:key|clave|pin|token)=)[^&\s]+/gi, '$1[clave]');
}

function pedir(url) {
  return new Promise(function (resolve, reject) {
    let saltos = 0;
    const ir = function (destino) {
      const req = https.get(destino, { headers: { 'User-Agent': 'esi-loadtest' } }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && saltos < MAX_SEGUIDORES) {
          saltos++;
          res.resume();
          return ir(res.headers.location);
        }
        let cuerpo = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { cuerpo += c; });
        res.on('end', function () {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
          resolve(cuerpo);
        });
      });
      req.setTimeout(TIMEOUT_MS, function () { req.destroy(new Error('timeout')); });
      req.on('error', reject);
    };
    ir(url);
  });
}

function leerJsonp(cuerpo) {
  const desde = cuerpo.indexOf('{');
  const hasta = cuerpo.lastIndexOf('}');
  if (desde < 0 || hasta < desde) throw new Error('respuesta inesperada');
  return JSON.parse(cuerpo.slice(desde, hasta + 1));
}

async function llamar(base, fn, args, admin) {
  let url = base + '?fn=' + encodeURIComponent(fn) +
    '&args=' + encodeURIComponent(JSON.stringify(args || []));
  if (admin) url += '&admin=1';
  const inicio = process.hrtime.bigint();
  try {
    const res = leerJsonp(await pedir(url));
    return { res: res, ms: Number(process.hrtime.bigint() - inicio) / 1e6 };
  } catch (err) {
    return { res: { ok: false, message: String(err && err.message ? err.message : err) }, ms: 0, transporte: true };
  }
}

function clasificar(res) {
  if (!res) return 'error';
  if (res.busy) return 'busy';
  if (res.ok) return 'ok';
  if (/ocupad|busy/i.test(String(res.message || ''))) return 'busy';
  return 'error';
}

function porcentaje(valores, p) {
  if (!valores.length) return 0;
  const orden = valores.slice().sort(function (a, b) { return a - b; });
  const i = Math.min(orden.length - 1, Math.max(0, Math.ceil(p * orden.length) - 1));
  return orden[i];
}

function pausa() {
  const ms = Math.floor(Math.random() * (PAUSA_MAX_MS + 1));
  return new Promise(function (r) { setTimeout(r, ms); });
}

function mail(n) {
  return 'carga' + String(n).padStart(3, '0') + DOMINIO;
}

async function correrPool(items, limite, tarea) {
  const out = new Array(items.length);
  let siguiente = 0;
  const tope = Math.max(1, Math.min(limite, items.length));
  const workers = [];
  for (let w = 0; w < tope; w++) {
    workers.push((async function () {
      for (;;) {
        const i = siguiente++;
        if (i >= items.length) return;
        out[i] = await tarea(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return out;
}

async function alumno(base, email, nombre) {
  const inicio = process.hrtime.bigint();
  const fallo = function (motivo) {
    return { estado: 'error', motivo: motivo, ms: Number(process.hrtime.bigint() - inicio) / 1e6 };
  };
  const entrada = await llamar(base, 'apiLookup', [email]);
  if (!entrada.res.ok && !entrada.res.needsNombre) return fallo('ingreso: ' + entrada.res.message);
  await pausa();
  const datos = await llamar(base, 'apiGetData', [email, nombre, CURSO, '', '']);
  if (!datos.res.ok) {
    const c = clasificar(datos.res);
    return c === 'busy' ? { estado: 'busy', motivo: 'datos ocupados', ms: Number(process.hrtime.bigint() - inicio) / 1e6 }
      : fallo('datos: ' + datos.res.message);
  }
  const info = datos.res.data || {};
  const charlas = info.talks || [];
  const franjas = (info.slots || []).map(function (s) { return s.id; });
  const elegidas = [];
  const usadas = {};
  for (const franja of franjas) {
    const libre = charlas.filter(function (t) {
      return Number(t.slot_id) === Number(franja) && t.restantes > 0 && !usadas[t.id];
    })[0];
    if (libre) { usadas[libre.id] = true; elegidas.push(libre.id); }
  }
  if (!elegidas.length) return fallo('sin charlas libres');
  let estado = 'ok';
  let motivo = '';
  for (const talkId of elegidas) {
    await pausa();
    // recordatorio por mail: no se toca, queda como vino (opt-in del alumno)
    const alta = await llamar(base, 'apiRegister',
      [email, nombre, CURSO, talkId, '', datos.res.session || '']);
    const c = clasificar(alta.res);
    if (c === 'busy') { estado = 'busy'; motivo = 'alta ocupada'; break; }
    if (c !== 'ok') {
      estado = 'error';
      motivo = 'alta: ' + (alta.res.message || 'sin detalle') + ' (' + talkId + ')';
      break;
    }
  }
  return { estado: estado, motivo: motivo, ms: Number(process.hrtime.bigint() - inicio) / 1e6, charlas: elegidas.length };
}

async function tandaCupo(base, alumnos) {
  const sonda = await llamar(base, 'apiGetData', [mail(1), 'Alumno Prueba', CURSO, '', '']);
  if (!sonda.res.ok) return { ok: false, motivo: 'no pude leer charlas: ' + sonda.res.message };
  const objetivo = (sonda.res.data.talks || []).filter(function (t) { return t.restantes > 0; })
    .sort(function (a, b) { return a.id.localeCompare(b.id); })[0];
  if (!objetivo) return { ok: false, motivo: 'no hay charlas con lugar' };
  const esperado = Math.min(CUPO, objetivo.restantes);
  const gente = [];
  for (let i = 0; i < alumnos; i++) gente.push(mail(1000 + i));
  const res = await correrPool(gente, alumnos, async function (email) {
    const entrada = await llamar(base, 'apiLookup', [email]);
    if (!entrada.res.ok && !entrada.res.needsNombre) return { estado: 'error' };
    const alta = await llamar(base, 'apiRegister', [email, 'Alumno Prueba', CURSO, objetivo.id, '', '']);
    return { estado: clasificar(alta.res), message: alta.res.message || '' };
  });
  const aceptados = res.filter(function (r) { return r.estado === 'ok'; }).length;
  const completas = res.filter(function (r) { return r.estado === 'error' && /complet|sin lugar|cupo/i.test(r.message); }).length;
  const otros = res.length - aceptados - completas;
  return {
    ok: aceptados === esperado && otros === 0,
    charla: objetivo.id,
    esperado: esperado,
    aceptados: aceptados,
    completas: completas,
    otros: otros
  };
}

async function invariantes(base, clave) {
  const estado = await llamar(base, 'apiAdminStatus', [clave], true);
  if (!estado.res.ok) return { ok: false, motivo: 'la clave no entro: ' + estado.res.message };
  if (!estado.res.modo_prueba) return { ok: false, motivo: 'modo_prueba apagado: no verifico invariantes sobre datos reales' };
  const datos = await llamar(base, 'apiAdminGetData', [clave], true);
  if (!datos.res.ok) return { ok: false, motivo: 'sin datos: ' + datos.res.message };
  const d = datos.res;
  const problemas = [];
  (d.talks || []).forEach(function (t) {
    if (Number(t.anotados) > Number(t.cupo)) {
      problemas.push('charla ' + t.id + ' con ' + t.anotados + ' anotados y cupo ' + t.cupo);
    }
  });
  const altas = d.signups || [];
  const porCharla = {};
  const porFranja = {};
  altas.forEach(function (s) {
    const email = String(s.email || '').toLowerCase();
    const k1 = email + '|' + s.talk_id;
    const k2 = email + '|' + s.slot_id;
    if (porCharla[k1]) problemas.push('duplicado ' + email + ' en ' + s.talk_id);
    porCharla[k1] = true;
    if (porFranja[k2]) problemas.push('dos charlas en la misma franja: ' + email);
    porFranja[k2] = true;
  });
  const suma = (d.talks || []).reduce(function (n, t) { return n + Number(t.anotados || 0); }, 0);
  if (suma !== Number(d.total)) problemas.push('totales: charlas ' + suma + ' vs total ' + d.total);
  return { ok: problemas.length === 0, problemas: problemas, total: d.total, alumnos: d.studentCount };
}

function linea(texto) {
  process.stdout.write(texto + '\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    linea('error: ' + err.message);
    linea(usage());
    return 2;
  }
  if (opts.ayuda) { linea(usage()); return 0; }
  const motivos = negativas(opts);
  if (motivos.length) {
    motivos.forEach(function (m) { linea('no corro: ' + m); });
    return 2;
  }

  const clave = process.env.ESI_ADMIN_KEY || '';
  const log = [];
  const anotar = function (texto) {
    const t = redactar(texto, clave);
    log.push(t);
    linea(t);
  };

  if (clave) {
    const estado = await llamar(opts.url, 'apiAdminStatus', [clave], true);
    if (!estado.res.ok) {
      anotar('no corro: la clave de ESI_ADMIN_KEY no entro (' + estado.res.message + ')');
      return 2;
    }
    if (!estado.res.modo_prueba) {
      anotar('no corro: modo_prueba tiene que estar activo para ensuciar la copia con datos de carga.');
      return 2;
    }
  }

  anotar('simulacro ' + new Date().toISOString() + ' · alumnos ' + opts.alumnos +
    ' · rampas ' + opts.rampa.join(',') + ' · cupo ' + CUPO);
  let fallo = false;

  const cupo = await tandaCupo(opts.url, opts.alumnos);
  if (!cupo.ok) fallo = true;
  anotar('cupo: charla ' + (cupo.charla || '?') + ' · esperados ' + cupo.esperado +
    ' · aceptados ' + cupo.aceptados + ' · completas ' + cupo.completas + ' · otros ' + cupo.otros +
    (cupo.motivo ? ' · ' + cupo.motivo : ''));

  let n = 1;
  for (const simultaneos of opts.rampa) {
    const gente = [];
    for (let i = 0; i < opts.alumnos; i++) gente.push(mail(n++));
    const res = await correrPool(gente, simultaneos, function (email) {
      return alumno(opts.url, email, 'Alumno Prueba');
    });
    const ok = res.filter(function (r) { return r.estado === 'ok'; }).length;
    const busy = res.filter(function (r) { return r.estado === 'busy'; }).length;
    const errores = res.filter(function (r) { return r.estado === 'error'; });
    const tiempos = res.map(function (r) { return r.ms; });
    if (errores.length) fallo = true;
    anotar('tanda ' + simultaneos + ' simultaneos: ok ' + ok + ' · busy ' + busy +
      ' · errores ' + errores.length +
      ' · p50 ' + porcentaje(tiempos, 0.5).toFixed(0) + ' ms' +
      ' · p95 ' + porcentaje(tiempos, 0.95).toFixed(0) + ' ms');
    errores.slice(0, 3).forEach(function (e) { anotar('  error: ' + e.motivo); });
  }

  if (clave) {
    const inv = await invariantes(opts.url, clave);
    if (!inv.ok) fallo = true;
    anotar('invariantes: ' + (inv.ok ? 'ok' : 'FALLA') +
      (inv.total != null ? ' · total ' + inv.total + ' · alumnos ' + inv.alumnos : ' · ' + inv.motivo));
    (inv.problemas || []).slice(0, 5).forEach(function (p) { anotar('  ' + p); });
  } else {
    anotar('invariantes: salteados (definí ESI_ADMIN_KEY para verificarlos)');
  }

  try {
    fs.mkdirSync(path.dirname(LOG_REL), { recursive: true });
    fs.appendFileSync(LOG_REL, log.join('\n') + '\n\n');
    anotar('log: ' + LOG_REL);
  } catch (err) {
    anotar('no pude escribir el log: ' + (err && err.message ? err.message : err));
  }
  anotar('Borrá los datos de prueba desde el panel antes de usar esta planilla');
  return fallo ? 1 : 0;
}

module.exports = {
  parseArgs: parseArgs,
  negativas: negativas,
  clasificar: clasificar,
  porcentaje: porcentaje,
  redactar: redactar,
  mail: mail,
  usage: usage,
  DOMINIO: DOMINIO,
  CUPO: CUPO,
  EXEC_URL: EXEC_URL,
  LOG_REL: LOG_REL
};

if (require.main === module) {
  main().then(function (codigo) {
    process.exitCode = codigo;
  }, function (err) {
    linea('error: ' + (err && err.message ? err.message : err));
    process.exitCode = 2;
  });
}
