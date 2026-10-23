#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Comprobación de idiomas (se ejecuta al construir la imagen: si
   falla, no se despliega). Reglas en node/src/utils/i18n.js.

   Errores:
   1. Un texto de una zona `data-i18n` de cualquier HTML de public/
      sin su inglés en public/i18n/en.json.
   2. Un _t('…') / tl(lang, '…') / req.t('…') sin su inglés.
   3. En los ficheros ya migrados (public/i18n/migrados.json):
      - JS del navegador: texto en español fuera de _t().
      - Servidor: texto en español que no está en el diccionario
        (los mensajes de la API se traducen solos si están).
      Para un texto que no se ve (una clave interna, un aviso solo para
      el equipo), añade en esa línea el comentario  i18n-no , o rodea el
      bloque con  i18n-no-inicio … i18n-no-fin . Los console.* no cuentan.
   4. Una traducción que pierde o inventa un {hueco}.
   Avisos (no bloquean): traducciones que ya nadie usa.

   Uso:  node scripts/i18n-check.js            (informe)
         node scripts/i18n-check.js --faltan   (JSON con lo que falta, para rellenar)
         node scripts/i18n-check.js --faltan --donde   (… y dónde aparece cada texto)
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const i18n = require(path.join(ROOT, 'node/src/utils/i18n'));
const MANIFEST = path.join(ROOT, 'public/i18n/migrados.json');

const args = process.argv.slice(2);
const FALTAN = args.includes('--faltan');
const DONDE = args.includes('--donde');   // con --faltan: dónde aparece cada texto

/* ── Diccionario ─────────────────────────────────────────────── */
let dict;
try {
  const raw = JSON.parse(fs.readFileSync(i18n.DICT_FILE, 'utf8'));
  dict = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) dict[i18n.norm(k)] = v;
} catch (e) {
  console.error('✗ public/i18n/en.json no es un JSON válido:', e.message);
  process.exit(1);
}

const errors = [];       // { file, line, msg, key? }
const missing = new Map(); // key → primer sitio
const used = new Set();

function rel(f) { return path.relative(ROOT, f); }
function need(key, file, line, how) {
  key = i18n.norm(key);
  if (!key) return;
  used.add(key);
  if (typeof dict[key] === 'string' && dict[key].trim()) return;
  if (!missing.has(key)) missing.set(key, `${rel(file)}:${line}`);
  errors.push({ file, line, msg: `${how} sin traducción: «${key.length > 90 ? key.slice(0, 87) + '…' : key}»` });
}

/* ── 1 · HTML ────────────────────────────────────────────────── */
function listFiles(dir, re, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'uploads' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(f, re, out);
    else if (re.test(e.name)) out.push(f);
  }
  return out;
}

function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

const cheerio = require('cheerio');
for (const file of listFiles(path.join(ROOT, 'public'), /\.html?$/i)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/\bdata-i18n\b/.test(src)) continue;
  const $ = cheerio.load(src, { sourceCodeLocationInfo: true });
  i18n.walkScopes($, (kind, node, name) => {
    const loc = (node.sourceCodeLocation || (node.parent && node.parent.sourceCodeLocation) || {}).startLine || 0;
    if (kind === 'text') need(node.data, file, loc, 'Texto');
    else if (kind === 'attr') need(node.attribs[name], file, loc, `Atributo ${name}`);
    else if (kind === 'html') need(i18n.htmlKey($, node), file, loc, 'Bloque data-i18n-html');
  });
}

/* ── 2 y 3 · JavaScript ──────────────────────────────────────── */
/* Lector mínimo de JS: devuelve los literales de texto ('…', "…", `…`)
   con su posición. Salta comentarios y expresiones regulares. */
function scanJs(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  const KW = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'delete', 'throw', 'new', 'instanceof']);

  function readString(q) {
    const start = i; i++;
    let val = '';
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { val += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
      if (src[i] === '\n') break;
      val += src[i++];
    }
    i++;
    return { start, end: i, value: val, tpl: false, holes: 0 };
  }
  function readTemplate() {
    const start = i; i++;
    let val = '', holes = 0;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { val += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2; holes++; val += '${}';
        scanCode(true);
        continue;
      }
      val += src[i++];
    }
    i++;
    return { start, end: i, value: val, tpl: true, holes };
  }
  // Código JS; con insideHole, hasta la llave que cierra el ${…}.
  function scanCode(insideHole) {
    let prev = '';          // último carácter significativo
    let prevWord = '';
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '\'' || c === '"') { out.push(readString(c)); prev = 'x'; prevWord = ''; continue; }
      if (c === '`') { out.push(readTemplate()); prev = 'x'; prevWord = ''; continue; }
      if (c === '/' && (REGEX_AFTER.has(prev) || KW.has(prevWord))) {
        i++;
        let inClass = false;
        while (i < n && src[i] !== '\n') {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          i++;
        }
        while (i < n && /[a-z]/i.test(src[i])) i++;
        prev = 'x'; prevWord = '';
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        let w = '';
        while (i < n && /[\w$]/.test(src[i])) w += src[i++];
        prevWord = w; prev = 'x';
        continue;
      }
      if (insideHole) {
        if (c === '{') depth++;
        else if (c === '}') { if (depth === 0) { i++; return; } depth--; }
      }
      if (!/\s/.test(c)) { prev = c; prevWord = ''; }
      i++;
    }
  }
  scanCode(false);
  return out;
}

const STOP = new Set(('de la el los las un una unos unas y o en con para por tu tus que se no al del lo es su sus mi mis ' +
  'más ya te le nos si ha has hay está este esta estos estas ese esa como pero sin sobre entre cuando muy todo todos').split(' '));
// Palabras sueltas en mayúscula que no son texto para personas.
const IGNORE_WORDS = new Set(('Escape Enter Tab Backspace ArrowDown ArrowUp ArrowLeft ArrowRight Home End Bearer Error Promise Date ' +
  'Image Object Array JSON Math None Content Accept Authorization Infinity NaN Node Element Event CustomEvent FormData URL Blob File ' +
  'Poppins Helvetica Arial Inter Google Resend Canva ORS OID PIC EU Studio Beta').split(' '));

function visibleChunks(s) {
  // Texto de un literal con HTML: lo que hay entre etiquetas + atributos visibles.
  if (!/<[a-zA-Z/!]/.test(s)) return [s];
  const chunks = [];
  s.replace(/\b(?:placeholder|title|aria-label|alt)\s*=\s*"([^"]*)"/g, (m, v) => { chunks.push(v); return m; });
  s.replace(/\b(?:placeholder|title|aria-label|alt)\s*=\s*'([^']*)'/g, (m, v) => { chunks.push(v); return m; });
  // Los iconos (material-symbols) llevan nombres en inglés: fuera.
  const noIcons = s.replace(/<span[^>]*material-symbols[^>]*>[^<]*<\/span>/g, ' ');
  noIcons.replace(/<[^>]*>/g, '\u0000').split('\u0000').forEach(t => chunks.push(t));
  return chunks;
}

function looksSpanish(raw) {
  const s = String(raw).replace(/\$\{\}/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').trim();
  if (!/\p{L}/u.test(s)) return false;
  if (/[áéíóúñü¿¡«»]/i.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const w = words[0].replace(/[.,:;!?…)(]+$/g, '').replace(/^[(]+/, '');
    if (IGNORE_WORDS.has(w)) return false;
    return /^[A-ZÑ][a-zñ]{2,}$/.test(w);
  }
  const lower = words.map(w => w.toLowerCase().replace(/[.,:;!?…()«»"]/g, ''));
  if (lower.some(w => STOP.has(w))) return true;
  // Clases CSS / código: todo en minúsculas con guiones, barras, dos puntos…
  if (words.every(w => /^[a-z0-9!:\[\]\/._%#()&=>{}-]+$/.test(w))) return false;
  return /^[A-ZÑ][a-zñ]+\b/.test(s) && words.length >= 2;
}

const WRAP_CLIENT = /(?:\b_t|\bI18N\.t|(?<![.\w$])t)\(\s*$/;   // t() es el nombre interno en public/js/i18n.js
const WRAP_SERVER = /(?:\breq\.t\(|\btl\(\s*[\w.$]+\s*,)\s*$/;

let manifest = { js: [], servidor: [] };
try { manifest = Object.assign(manifest, JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))); }
catch (e) { errors.push({ file: MANIFEST, line: 0, msg: 'migrados.json no se puede leer: ' + e.message }); }
// I18N_MIGRANDO=fich1,fich2: tratar esos ficheros como migrados mientras se trabaja en ellos.
const extra = (process.env.I18N_MIGRANDO || '').split(',').map(f => f.trim()).filter(Boolean);
(manifest.js = manifest.js || []).push(...extra.filter(f => f.startsWith('public/')));
(manifest.servidor = manifest.servidor || []).push(...extra.filter(f => !f.startsWith('public/')));
const migratedClient = new Set((manifest.js || []).map(f => path.join(ROOT, f)));
const migratedServer = new Set((manifest.servidor || []).map(f => path.join(ROOT, f)));
for (const f of [...migratedClient, ...migratedServer]) {
  if (!fs.existsSync(f)) errors.push({ file: MANIFEST, line: 0, msg: `migrados.json nombra un fichero que no existe: ${rel(f)}` });
}

const jsFiles = [
  ...listFiles(path.join(ROOT, 'public/js'), /\.js$/),
  ...listFiles(path.join(ROOT, 'node/src'), /\.js$/),
  path.join(ROOT, 'server.js'),
];

for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const isClient = file.startsWith(path.join(ROOT, 'public'));
  const strict = isClient ? migratedClient.has(file) : migratedServer.has(file);
  if (!strict && !/\b_t\(|\bI18N\.t\(|\breq\.t\(|\btl\(/.test(src)) continue;
  const lines = src.split('\n');
  // Bloques que no ve la persona (avisos internos): entre «i18n-no-inicio» e «i18n-no-fin».
  const off = new Set();
  let inOff = false;
  lines.forEach((l, k) => {
    if (/i18n-no-inicio/.test(l)) inOff = true;
    if (inOff || /i18n-no\b/.test(l) || /\bconsole\.(log|warn|error|info|debug)\(/.test(l)) off.add(k + 1);
    if (/i18n-no-fin/.test(l)) inOff = false;
  });
  for (const lit of scanJs(src)) {
    const line = lineOf(src, lit.start);
    if (off.has(line)) continue;
    const before = src.slice(Math.max(0, lit.start - 60), lit.start);
    const wrapped = WRAP_CLIENT.test(before) || WRAP_SERVER.test(before);
    if (wrapped) {
      if (lit.holes) errors.push({ file, line, msg: 'Dentro de _t() usa huecos {x}, no ${…}: «' + lit.value.slice(0, 60) + '»' });
      else need(lit.value, file, line, isClient ? '_t()' : 'tl()');
      continue;
    }
    if (!strict) continue;
    const bad = visibleChunks(lit.value).filter(looksSpanish);
    if (!bad.length) continue;
    if (isClient) {
      errors.push({ file, line, msg: `Texto fuera de _t(): «${i18n.norm(bad[0]).slice(0, 80)}»` });
    } else if (lit.holes || /<[a-z]/i.test(lit.value)) {
      errors.push({ file, line, msg: `Texto del servidor sin tl(): «${i18n.norm(bad[0]).slice(0, 80)}»` });
    } else {
      need(lit.value, file, line, 'Mensaje del servidor');
    }
  }
}

/* ── 4 · Huecos {x} ──────────────────────────────────────────── */
for (const [k, v] of Object.entries(dict)) {
  if (typeof v !== 'string') { errors.push({ file: i18n.DICT_FILE, line: 0, msg: `Valor no válido para «${k}»` }); continue; }
  const holes = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
  if (holes(k) !== holes(v)) errors.push({ file: i18n.DICT_FILE, line: 0, msg: `Los huecos no coinciden en «${k}» → «${v}»` });
}

/* ── Informe ─────────────────────────────────────────────────── */
if (FALTAN) {
  const o = {};
  for (const [k, where] of missing) o[k] = DONDE ? where : '';
  process.stdout.write(JSON.stringify(o, null, 2) + '\n');
  process.exit(missing.size ? 1 : 0);
}

const unused = Object.keys(dict).filter(k => !used.has(k));
if (errors.length) {
  const byFile = new Map();
  for (const e of errors) {
    const k = rel(e.file);
    if (!byFile.has(k)) byFile.set(k, []);
    byFile.get(k).push(e);
  }
  console.error(`✗ Idiomas: ${errors.length} problema(s)\n`);
  for (const [f, list] of byFile) {
    console.error(f);
    for (const e of list) console.error(`  ${e.line ? 'línea ' + e.line + ': ' : ''}${e.msg}`);
  }
  console.error('\nAñade lo que falta a public/i18n/en.json (node scripts/i18n-check.js --faltan lo saca en JSON).');
  process.exit(1);
}
console.log(`✓ Idiomas: todo traducido (${Object.keys(dict).length} textos en inglés).`);
if (unused.length) console.log(`  Aviso: ${unused.length} traducción(es) que ya no se usan en ningún sitio fijo (pueden ser textos dinámicos).`);
