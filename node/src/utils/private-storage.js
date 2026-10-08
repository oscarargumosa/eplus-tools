/* ── Almacenamiento privado de subidas ────────────────────────────
   Los ficheros de usuario (documentos, papers, evaluaciones) NO viven en
   public/ (express.static los serviría sin login). Se guardan en
   PRIVATE_UPLOADS_DIR (por defecto <raíz>/node/private/uploads) con una
   subcarpeta por tipo, y solo salen por rutas autenticadas.

   En BD se sigue guardando la ruta lógica '/uploads/<tipo>/<fichero>', así
   que las filas antiguas valen tal cual: resolvePath busca primero en la
   carpeta privada y, si no está, en public/uploads (ubicación antigua). */
const fsp  = require('fs/promises');
const path = require('path');

const APP_ROOT   = path.join(__dirname, '../../..');
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const KINDS      = ['documents', 'research', 'evaluator'];

function privateRoot() {
  return path.resolve(process.env.PRIVATE_UPLOADS_DIR || path.join(APP_ROOT, 'node', 'private', 'uploads'));
}

/** Carpeta privada de un tipo (la crea si no existe). */
async function dirFor(kind) {
  if (!KINDS.includes(kind)) throw new Error('Tipo de subida no válido: ' + kind);
  const dir = path.join(privateRoot(), kind);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** '/uploads/documents/x.pdf', 'uploads/research/x.pdf' o ruta absoluta → { kind, file } */
function parse(storagePath) {
  if (!storagePath) return null;
  let s = String(storagePath).replace(/\\/g, '/');
  if (path.isAbsolute(s)) {
    // Compatibilidad: algunos llamadores pasaban la ruta absoluta del disco
    for (const base of [privateRoot(), path.join(PUBLIC_DIR, 'uploads')]) {
      const rel = path.relative(base, s);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) { s = 'uploads/' + rel.split(path.sep).join('/'); break; }
    }
  }
  const m = s.replace(/^\/+/, '').match(/^uploads\/([a-z]+)\/([^/]+)$/);
  if (!m || !KINDS.includes(m[1]) || m[2] === '.' || m[2] === '..') return null;
  return { kind: m[1], file: m[2] };
}

/** Rutas candidatas en disco: primero la privada, luego la antigua en public/. */
function candidates(storagePath) {
  const p = parse(storagePath);
  if (!p) return [];
  return [
    path.join(privateRoot(), p.kind, p.file),
    path.join(PUBLIC_DIR, 'uploads', p.kind, p.file),
  ];
}

async function resolvePath(storagePath) {
  for (const c of candidates(storagePath)) {
    try { await fsp.access(c); return c; } catch { /* siguiente */ }
  }
  return null;
}

async function readStored(storagePath) {
  const full = await resolvePath(storagePath);
  if (!full) { const e = new Error('File not found'); e.code = 'ENOENT'; e.status = 404; throw e; }
  return fsp.readFile(full);
}

/** Guarda en la carpeta privada y devuelve la ruta lógica para la BD. */
async function saveStored(kind, filename, buffer) {
  const dir = await dirFor(kind);
  const safe = path.basename(String(filename));
  await fsp.writeFile(path.join(dir, safe), buffer);
  return `/uploads/${kind}/${safe}`;
}

async function removeStored(storagePath) {
  for (const c of candidates(storagePath)) {
    try { await fsp.unlink(c); } catch { /* puede no existir */ }
  }
}

/** Extensión segura a partir del nombre original ('.pdf', '.docx'…). */
function safeExt(originalName) {
  return (path.extname(String(originalName || '')) || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
}

module.exports = { KINDS, privateRoot, dirFor, parse, resolvePath, readStored, saveStored, removeStored, safeExt };
