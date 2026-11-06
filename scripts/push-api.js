'use strict';

/*
 * Publica por la API de Git Data los commits locales que falten en main.
 *
 * Sirve de plan B cuando `git push` falla con
 *   remote: fatal error in commit_refs
 * (un error interno del servicio de Git de GitHub, no de permisos). La API
 * reconstruye blobs, trees y commits con los mismos datos, así que los SHA
 * no cambian.
 *
 *   node scripts/push-api.js
 *
 * Token: GITHUB_TOKEN, GH_TOKEN o ~/.github-token.txt (una línea).
 * Owner y repo se leen del remoto `origin`.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CWD = path.join(__dirname, '..');

function git(...args) {
  return execFileSync('git', args, {
    cwd: CWD,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 128 * 1024 * 1024
  });
}

function readToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv.trim();
  const file = path.join(os.homedir(), '.github-token.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  throw new Error('falta el token: definí GITHUB_TOKEN o creá ~/.github-token.txt');
}

function readRemote() {
  const url = git('remote', 'get-url', 'origin').trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error('origin no es un repo de GitHub: ' + url);
  return { owner: m[1], repo: m[2] };
}

const TOKEN = readToken();
const { owner, repo } = readRemote();
const API = `https://api.github.com/repos/${owner}/${repo}`;

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'esi-inscripcion-push-api'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function commitInfo(sha) {
  const raw = git('cat-file', '-p', sha);
  const [head, ...rest] = raw.split('\n\n');
  const message = rest.join('\n\n').replace(/\n$/, '');
  const lines = head.split('\n');
  const field = (name) => lines.find((l) => l.startsWith(name + ' ')).slice(name.length + 1);
  return {
    sha,
    tree: field('tree'),
    parent: field('parent'),
    author: field('author'),
    committer: field('committer'),
    message
  };
}

function parseWho(line) {
  const m = line.match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
  if (!m) throw new Error('autor inesperado: ' + line);
  return { name: m[1], email: m[2], date: new Date(Number(m[3]) * 1000).toISOString() };
}

function modeFor(sha, file) {
  try {
    const out = git('ls-tree', sha, '--', file).trim();
    const m = out.match(/^(\d{6})\s/);
    return m ? m[1] : '100644';
  } catch (e) {
    return '100644';
  }
}

function blobFor(sha, file) {
  return execFileSync('git', ['show', `${sha}:${file}`], {
    cwd: CWD,
    maxBuffer: 128 * 1024 * 1024
  }).toString('base64');
}

function changedFiles(sha) {
  return git('diff-tree', '--no-commit-id', '--name-status', '-r', '-M', sha)
    .trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\t');
      return { path: parts[parts.length - 1], deleted: parts[0][0] === 'D' };
    });
}

async function createCommit(info, baseTree, files) {
  const entries = [];
  for (const file of files) {
    const mode = modeFor(info.sha, file.path);
    if (file.deleted) {
      entries.push({ path: file.path, mode, type: 'blob', sha: null });
    } else {
      const blob = await api('POST', '/git/blobs', { content: blobFor(info.sha, file.path), encoding: 'base64' });
      entries.push({ path: file.path, mode, type: 'blob', sha: blob.sha });
    }
  }

  const tree = await api('POST', '/git/trees', { base_tree: baseTree, tree: entries });
  if (tree.sha !== info.tree) throw new Error(`tree distinto en ${info.sha.slice(0, 7)}`);

  const commit = await api('POST', '/git/commits', {
    message: info.message + '\n',
    tree: tree.sha,
    parents: [info.parent],
    author: parseWho(info.author),
    committer: parseWho(info.committer)
  });
  if (commit.sha !== info.sha) throw new Error(`commit distinto: ${commit.sha} != ${info.sha}`);
  return commit.sha;
}

(async () => {
  const head = git('rev-parse', 'HEAD').trim();
  try { git('fetch', '--quiet', 'origin', 'main'); } catch (e) { /* sin red igual se intenta */ }
  const remote = (await api('GET', '/git/ref/heads/main')).object.sha;
  console.log('main remoto:', remote.slice(0, 7), '| local:', head.slice(0, 7));
  if (remote === head) { console.log('nada para publicar'); return; }

  const pendientes = git('rev-list', '--reverse', `${remote}..${head}`).trim().split('\n').filter(Boolean);
  if (!pendientes.length) throw new Error('main local no contiene commits nuevos sobre el remoto');

  let baseTree = commitInfo(remote).tree;
  for (const sha of pendientes) {
    const info = commitInfo(sha);
    const nuevo = await createCommit(info, baseTree, changedFiles(sha));
    console.log('commit ok:', nuevo.slice(0, 7), '-', info.message.split('\n')[0]);
    baseTree = info.tree;
  }

  const updated = await api('PATCH', '/git/refs/heads/main', { sha: head, force: false });
  console.log('main actualizado a:', updated.object.sha.slice(0, 7));
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
