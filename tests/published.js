'use strict';

/*
 * Avisa si el sitio publicado en Pages quedo viejo respecto de src/.
 *
 * Se corre a mano despues de que Pages termina de publicar, no en cada push:
 * Pages tarda mas que los tests y fallaria por carrera.
 *
 *   node tests/published.js [url-base]
 *
 * Salidas: 0 coincide, 1 quedo viejo, 2 no se pudo comprobar.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'Panel.html');
const SITIO = process.env.ESI_SITE || 'https://lxchoooo.github.io/esi-inscripcion-demo/';
const MARCAS = ['id="tab-evento"', 'id="pane-evento"', 'id="priv-mail"'];

function versionDe(html) {
  const m = String(html == null ? '' : html).match(/var APP_VERSION = '(v\d+)'/);
  return m ? m[1] : '';
}

function comparar(htmlPublicado, esperada) {
  const texto = String(htmlPublicado == null ? '' : htmlPublicado);
  const publicada = versionDe(texto);
  const faltan = MARCAS.filter((m) => texto.indexOf(m) < 0);
  return { ok: publicada === esperada && !faltan.length, publicada: publicada, faltan: faltan };
}

async function bajar(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' }
  });
  return { status: res.status, texto: await res.text() };
}

async function main(argv) {
  const base = argv && argv[0] ? String(argv[0]) : SITIO;
  const local = fs.readFileSync(SRC, 'utf8');
  const esperada = versionDe(local);
  if (!esperada) {
    console.error('no encuentro APP_VERSION en src/Panel.html');
    return 2;
  }
  const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
  let res;
  try {
    res = await bajar(url);
  } catch (err) {
    console.error('no pude bajar ' + base + ': ' + (err && err.message ? err.message : err));
    return 2;
  }
  if (res.status !== 200) {
    console.error('el sitio respondio HTTP ' + res.status + ': ' + base);
    return 2;
  }
  const r = comparar(res.texto, esperada);
  const publicada = r.publicada;
  const faltan = r.faltan;
  if (r.ok) {
    console.log('publicado ' + publicada + ' = src ' + esperada + ' · marcadores ok');
    return 0;
  }
  if (publicada !== esperada) {
    console.error('el sitio quedo viejo: publicado ' + (publicada || 'sin version') + ', src ' + esperada);
  }
  if (faltan.length) console.error('falta en el sitio: ' + faltan.join(', '));
  console.error('revisa el run de pages-build-deployment y volve a correr despues.');
  return 1;
}

module.exports = { versionDe: versionDe, comparar: comparar, MARCAS: MARCAS, SITIO: SITIO };

if (require.main === module) {
  main(process.argv.slice(2)).then((codigo) => {
    process.exitCode = codigo;
  }, (err) => {
    console.error('error: ' + (err && err.message ? err.message : err));
    process.exitCode = 2;
  });
}
