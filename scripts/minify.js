#!/usr/bin/env node
'use strict';

/* Genera index.html (la copia publicada) a partir de src/Panel.html.
   Solo saca peso muerto sin cambiar el comportamiento:
   - CSS: comentarios y espacios redundantes.
   - JS: indentacion y lineas en blanco (mantiene TODOS los saltos de linea,
     asi no se rompe el ASI de JavaScript).
   Despues valida que el JS resultante siga siendo sintacticamente valido. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'Panel.html');
const OUT = path.join(__dirname, '..', 'build', 'index.min.html');

function minifyCss(css) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/\s+/g, ' ');
  out = out.replace(/\s*([{}:,>])\s*/g, '$1');
  out = out.replace(/;}/g, '}');
  return out.trim();
}

function minifyScript(js) {
  const lines = js.split('\n').map((line) => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''));
  const kept = lines.filter((line) => line.length > 0);
  return kept.join('\n');
}

function build(htmlSource) {
  const html = htmlSource == null ? fs.readFileSync(SRC, 'utf8') : String(htmlSource);
  let scripts = 0;
  const out = html
    .replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => '<style>' + minifyCss(css) + '</style>')
    .replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => {
      scripts++;
      return '<script>' + minifyScript(js) + '</script>';
    });
  if (!scripts) throw new Error('no se encontro ningun <script> en ' + SRC);

  const chunks = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = chunks[chunks.length - 1][1];
  new vm.Script(code, { filename: 'Panel.min.js' });

  const must = ['id="btn-confirmar"', 'function sRender(', 'function aRenderTable(',
    'function sConfirmar(', 'id="s-screen-done"'];
  for (const needle of must) {
    if (out.indexOf(needle) < 0) throw new Error('se perdio "' + needle + '" al minificar');
  }
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  let out;
  try {
    out = build();
  } catch (e) {
    console.error('minify: ' + e.message);
    process.exit(1);
  }
  const before = fs.statSync(SRC).size;
  const after = Buffer.byteLength(out, 'utf8');
  if (check) {
    let current = '';
    try { current = fs.readFileSync(OUT, 'utf8'); } catch (e) { current = ''; }
    if (current !== out) {
      console.error('build/index.min.html esta desactualizado. Corré: node scripts/minify.js');
      process.exit(1);
    }
    console.log('build/index.min.html OK (' + Math.round(after / 1024) + ' KB, -'
      + Math.round((1 - after / before) * 100) + '% vs src)');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log('build/index.min.html generado: ' + Math.round(after / 1024) + ' KB (src '
    + Math.round(before / 1024) + ' KB, -' + Math.round((1 - after / before) * 100) + '%)');
}

if (require.main === module) main();

module.exports = { build, minifyCss, minifyScript };
