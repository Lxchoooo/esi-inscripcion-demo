#!/usr/bin/env node
'use strict';

/*
 * Servidor local para pasar archivos desde el navegador del teléfono.
 *
 * - Escucha solo en 127.0.0.1:8787.
 * - Guarda todo en .file-drop/uploads (ignorado por git).
 * - Acepta cualquier tipo de archivo y subidas grandes por streaming.
 * - No usa dependencias: solo módulos de Node.
 *
 *   node scripts/file-drop.js
 *   PORT=8787 node scripts/file-drop.js
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const ROOT = path.join(__dirname, '..', '.file-drop');
const UPLOADS = path.join(ROOT, 'uploads');
const UI = path.join(__dirname, 'file-drop.html');
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 4 * 1024 * 1024 * 1024); // 4 GB
const MAX_LABEL = '4 GB';

fs.mkdirSync(UPLOADS, { recursive: true });

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function texto(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': (type || 'text/plain') + '; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function nombreSeguro(raw) {
  let name = '';
  try {
    name = decodeURIComponent(String(raw || ''));
  } catch (error) {
    name = String(raw || '');
  }
  name = path.basename(name)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  if (!name || name === '.' || name === '..') name = 'archivo';
  if (Buffer.byteLength(name) > 180) {
    const ext = path.extname(name).slice(0, 20);
    const base = name.slice(0, name.length - ext.length);
    name = base.slice(0, 160 - ext.length) + ext;
  }
  return name;
}

async function rutaLibre(name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = path.join(UPLOADS, name);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(UPLOADS, base + ' (' + i + ')' + ext);
    i += 1;
  }
  return candidate;
}

function tipoDe(name) {
  const ext = path.extname(name).toLowerCase();
  const tipos = {
    '.aac': 'audio/aac',
    '.avif': 'image/avif',
    '.avi': 'video/x-msvideo',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.gz': 'application/gzip',
    '.heic': 'image/heic',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.rar': 'application/vnd.rar',
    '.svg': 'image/svg+xml',
    '.tar': 'application/x-tar',
    '.txt': 'text/plain',
    '.wav': 'audio/wav',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml',
    '.zip': 'application/zip'
  };
  return tipos[ext] || 'application/octet-stream';
}

async function listar() {
  const entries = await fsp.readdir(UPLOADS, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.charAt(0) === '.') continue;
    const info = await fsp.stat(path.join(UPLOADS, entry.name));
    files.push({
      name: entry.name,
      size: info.size,
      mtime: info.mtimeMs,
      type: tipoDe(entry.name)
    });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  let free = null;
  try {
    const stat = await fsp.statfs(ROOT);
    free = stat.bavail * stat.bsize;
  } catch (error) { /* statfs no está en todos los sistemas */ }
  return {
    files,
    total: files.reduce((sum, file) => sum + file.size, 0),
    free,
    path: UPLOADS,
    max: MAX_BYTES,
    maxLabel: MAX_LABEL
  };
}

function buscarArchivo(name) {
  const safe = nombreSeguro(name);
  const file = path.join(UPLOADS, safe);
  if (file.indexOf(UPLOADS + path.sep) !== 0) return null;
  return { name: safe, file };
}

async function subir(req, res) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BYTES) {
    req.resume();
    json(res, 413, { ok: false, error: 'El archivo supera el máximo de ' + MAX_LABEL + '.' });
    return;
  }

  const original = nombreSeguro(req.headers['x-file-name']);
  const destino = await rutaLibre(original);
  const temp = destino + '.part-' + process.pid + '-' + Date.now();
  const out = fs.createWriteStream(temp, { flags: 'wx' });
  let recibido = 0;
  let terminado = false;

  const limpiar = () => {
    if (terminado) return;
    terminado = true;
    try { out.destroy(); } catch (error) { /* ignorar */ }
    fsp.unlink(temp).catch(() => {});
  };

  req.on('data', (chunk) => {
    recibido += chunk.length;
    if (recibido > MAX_BYTES && !terminado) {
      limpiar();
      json(res, 413, { ok: false, error: 'El archivo supera el máximo de ' + MAX_LABEL + '.' });
      req.destroy();
    }
  });
  req.on('aborted', limpiar);
  req.on('error', limpiar);
  out.on('error', (error) => {
    limpiar();
    if (!res.headersSent) json(res, 500, { ok: false, error: 'No se pudo guardar: ' + error.message });
  });
  out.on('finish', async () => {
    if (terminado) return;
    terminado = true;
    try {
      await fsp.rename(temp, destino);
      json(res, 201, {
        ok: true,
        name: path.basename(destino),
        original,
        size: recibido
      });
    } catch (error) {
      fsp.unlink(temp).catch(() => {});
      if (!res.headersSent) json(res, 500, { ok: false, error: 'No se pudo guardar: ' + error.message });
    }
  });

  req.pipe(out);
}

async function descargar(req, res, url) {
  const found = buscarArchivo(url.searchParams.get('name'));
  if (!found) { json(res, 400, { ok: false, error: 'Nombre inválido.' }); return; }
  try {
    const info = await fsp.stat(found.file);
    if (!info.isFile()) throw new Error('No es un archivo.');
    res.writeHead(200, {
      'Content-Type': tipoDe(found.name),
      'Content-Length': info.size,
      'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(found.name),
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(found.file).pipe(res);
  } catch (error) {
    json(res, 404, { ok: false, error: 'El archivo no existe.' });
  }
}

async function borrar(req, res, url) {
  const found = buscarArchivo(url.searchParams.get('name'));
  if (!found) { json(res, 400, { ok: false, error: 'Nombre inválido.' }); return; }
  try {
    await fsp.unlink(found.file);
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 404, { ok: false, error: 'El archivo no existe.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + HOST + ':' + PORT);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = await fsp.readFile(UI, 'utf8');
      texto(res, 200, html, 'text/html');
    } catch (error) {
      texto(res, 500, 'Falta scripts/file-drop.html');
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/files') {
    try { json(res, 200, await listar()); }
    catch (error) { json(res, 500, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    try { await subir(req, res); }
    catch (error) { if (!res.headersSent) json(res, 500, { ok: false, error: error.message }); }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/download') {
    await descargar(req, res, url);
    return;
  }

  if (req.method === 'DELETE' && url.pathname === '/api/file') {
    await borrar(req, res, url);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  json(res, 404, { ok: false, error: 'No encontrado.' });
});

server.on('error', (error) => {
  console.error('No se pudo iniciar el servidor:', error.message);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log('Pasar archivos: http://' + HOST + ':' + PORT);
  console.log('Guardando en: ' + UPLOADS);
  console.log('Máximo por archivo: ' + MAX_LABEL);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
