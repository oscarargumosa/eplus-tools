#!/usr/bin/env node
/**
 * patch-form-template.js
 *
 * Edita el .docx oficial EACEA Form Part B sustituyendo los placeholders
 * de texto ("X EUR", "X person months", "X travels", "[name]" …) de la
 * tabla "Estimated budget — Resources" por placeholders docxtemplater
 * variables, de forma que `render-form-b.js` pueda inyectar datos reales.
 *
 * Estructura modificada:
 *   · Header rows (0-2): SE CONSERVAN intactos.
 *   · Partner placeholder rows (3 y 4): row 4 SE ELIMINA. Row 3 se convierte
 *     en un loop docxtemplater `{#summary_by_partner}…{/summary_by_partner}`
 *     que se replicará una vez por partner.
 *   · Empty separator row (5): SE ELIMINA.
 *   · Total row (6): textos placeholder sustituidos por variables
 *     {{sbp_total_pm}}, {{sbp_total_a}}, etc.
 *   · Footer row (7): SE CONSERVA.
 *
 * Uso:
 *   node scripts/patch-form-template.js
 *
 * Genera backup `form_part_b_eacea_template.original.docx` si no existe.
 * Sobreescribe el template original.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const TPL_DIR = path.join(__dirname, '..', 'docs', 'templates');
const TPL_PATH = path.join(TPL_DIR, 'form_part_b_eacea_template.docx');
const BACKUP_PATH = path.join(TPL_DIR, 'form_part_b_eacea_template.original.docx');

// Mapping placeholders en el orden de aparición en cada fila.
// Cada celda tiene runs partidos en Word; reemplazamos secuencialmente.
//
// Estructura real del template EACEA (verificada con tmp/inspect-template.js).
// La tabla tiene 15 grid-columns. La row de partner (row 3) tiene 15 celdas;
// la primera contiene [name], el resto 14 markers. La row Total (row 6) tiene
// los mismos 14 markers en cells 1..14, PERO cell 11 contiene DOS markers
// ("X grants" y "X prizes") → 15 markers en total.
//
// Mapeo grid-column → header oficial → marker en row 3:
//   col 0  Participant                        [name]              → {sbp_acronym}
//   col 1  A. Personnel (sub: PM count)       X person months     → {sbp_pm}
//   col 2  A. Personnel (€)                   X EUR               → {sbp_a}
//   col 3  B. Subcontracting (€)              X EUR               → {sbp_b}
//   col 4  C.1a Travel (# travels)            X travels           → {sbp_travels}
//   col 5  C.1a Travel (# persons travelling) X persons travel…   → {sbp_persons}
//   col 6  C.1a Travel (€)                    X EUR               → {sbp_c1a}
//   col 7  C.1b Accommodation (€)             X EUR               → {sbp_c1b}
//   col 8  C.1c Subsistence (€)               X EUR               → {sbp_c1c}
//   col 9  C.2 Equipment (€)                  X EUR               → {sbp_c2}
//   col 10 C.3 Other (€)                      X EUR               → {sbp_c3}
//   col 11 D.1 FSTP (# grants)                X grants            → {sbp_grants}
//   col 12 D.1 FSTP (€)                       X EUR               → {sbp_d1}
//   col 13 E. Indirect costs (€)              X EUR               → {sbp_indirect}
//   col 14 Total costs (€)                    X EUR               → {sbp_total}
//
// Total row además: cell 11 contiene "X grants" Y "X prizes" → 15 markers.

const PARTNER_ROW_PLACEHOLDERS = [
  '{sbp_pm}',           // col 1  X person months
  '{sbp_a}',            // col 2  X EUR — A. Personnel
  '{sbp_b}',            // col 3  X EUR — B. Subcontracting
  '{sbp_travels}',      // col 4  X travels
  '{sbp_persons}',      // col 5  X persons travelling
  '{sbp_c1a}',          // col 6  X EUR — C.1a Travel
  '{sbp_c1b}',          // col 7  X EUR — C.1b Accommodation
  '{sbp_c1c}',          // col 8  X EUR — C.1c Subsistence
  '{sbp_c2}',           // col 9  X EUR — C.2 Equipment
  '{sbp_c3}',           // col 10 X EUR — C.3 Other
  '{sbp_grants}',       // col 11 X grants — # grants
  '{sbp_d1}',           // col 12 X EUR — D.1 FSTP €
  '{sbp_indirect}',     // col 13 X EUR — E. Indirect
  '{sbp_total}',        // col 14 X EUR — Total costs
];

const TOTAL_ROW_PLACEHOLDERS = [
  '{tot_pm}',           // col 1  X person months
  '{tot_a}',            // col 2  X EUR — A. Personnel
  '{tot_b}',            // col 3  X EUR — B. Subcontracting
  '{tot_travels}',      // col 4  X travels
  '{tot_persons}',      // col 5  X persons travelling
  '{tot_c1a}',          // col 6  X EUR — C.1a Travel
  '{tot_c1b}',          // col 7  X EUR — C.1b Accommodation
  '{tot_c1c}',          // col 8  X EUR — C.1c Subsistence
  '{tot_c2}',           // col 9  X EUR — C.2 Equipment
  '{tot_c3}',           // col 10 X EUR — C.3 Other
  '{tot_grants}',       // col 11 X grants
  '{tot_prizes}',       // col 11 X prizes (mismo cell, segundo marker)
  '{tot_d1}',           // col 12 X EUR — D.1 FSTP €
  '{tot_indirect}',     // col 13 X EUR — E. Indirect
  '{tot_total}',        // col 14 X EUR — Total costs
];

// Helper: reemplaza el contenido textual de los runs en orden secuencial
// (las cadenas pueden venir partidas en multiple <w:t>; recolectamos todas,
// reseteamos a vacío excepto la primera, y ponemos el placeholder ahí).
function replaceTextRunsInRow(rowXml, replacements) {
  // Buscamos todos los marcadores de texto placeholder en orden
  // y los reemplazamos por la siguiente entrada del array.
  // Marker patterns reconocidos: "[name]", "X person months", "X EUR",
  // "X travels", "X persons travelling", "X grants", "X prizes".
  const MARKERS = [
    /\[name\]/g,
    /X person months/g,
    /X EUR/g,
    /X travels/g,
    /X persons travelling/g,
    /X grants/g,
    /X prizes/g,
  ];
  // Construimos un regex que matchee CUALQUIERA de los marcadores en orden de aparición
  const combined = /(\[name\]|X person months|X EUR|X travels|X persons travelling|X grants|X prizes)/g;
  let i = 0;
  return rowXml.replace(combined, (match) => {
    const v = replacements[i++] ?? '';
    // Si el reemplazo está vacío, dejamos el texto original (no podemos eliminar el run)
    return v || match;
  });
}

// Reemplaza los runs textuales partidos en Word: si "X EUR" está dividido
// como `<w:t>X</w:t>...<w:t>EUR</w:t>`, primero los unimos en un run.
// Estrategia: dentro de cada celda, colapsamos runs consecutivos al primer
// <w:t> y luego aplicamos el replace.
function normalizeCellRuns(cellXml) {
  // Encuentra cada <w:p>...</w:p> y dentro colapsa los <w:t>
  return cellXml.replace(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g, (pBlock) => {
    // Capturar pPr si existe (mantener formato)
    // Capturar todos los <w:t [xml:space="preserve"]>contenido</w:t>
    const texts = [];
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = tRegex.exec(pBlock)) !== null) {
      texts.push(m[1]);
    }
    if (texts.length <= 1) return pBlock;
    const joined = texts.join('');
    // Reemplazar el primer <w:t>...</w:t> con el joined y vaciar los demás
    let first = true;
    let result = pBlock.replace(tRegex, (full, inner) => {
      if (first) { first = false; return `<w:t xml:space="preserve">${joined}</w:t>`; }
      return `<w:t xml:space="preserve"></w:t>`;
    });
    return result;
  });
}

function transformRow(rowXml, replacements, wrapLoopName) {
  // 1. Normalizar runs dentro de cada celda
  let out = rowXml.replace(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g, (cell) => normalizeCellRuns(cell));
  // 2. Sustituir los marcadores secuencialmente
  out = replaceTextRunsInRow(out, replacements);
  // 3. Si hay loop wrap, añadir marcadores en el primer y último <w:t> de la fila
  if (wrapLoopName) {
    // Insertar {#name} en el primer <w:t> y {/name} en el último <w:t>
    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    const matches = [...out.matchAll(tRegex)];
    if (matches.length >= 1) {
      // Insertar al inicio del primer <w:t>
      const first = matches[0];
      const firstReplaced = first[0].replace(/<w:t(?:\s[^>]*)?>/, m => m + `{#${wrapLoopName}}`);
      out = out.substring(0, first.index) + firstReplaced + out.substring(first.index + first[0].length);
      // Re-buscar el último (después de la modificación)
      const matches2 = [...out.matchAll(tRegex)];
      if (matches2.length >= 1) {
        const last = matches2[matches2.length - 1];
        const lastReplaced = last[0].replace(/<\/w:t>/, `{/${wrapLoopName}}</w:t>`);
        out = out.substring(0, last.index) + lastReplaced + out.substring(last.index + last[0].length);
      }
    }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────

if (!fs.existsSync(TPL_PATH)) {
  console.error(`Template no encontrado: ${TPL_PATH}`);
  process.exit(1);
}

// Backup
if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(TPL_PATH, BACKUP_PATH);
  console.log(`✓ Backup creado: ${BACKUP_PATH}`);
} else {
  console.log(`· Backup ya existe: ${BACKUP_PATH}`);
}

const buf = fs.readFileSync(TPL_PATH);
const zip = new PizZip(buf);
let xml = zip.file('word/document.xml').asText();

// Localizar la tabla "Estimated budget"
const budgetIdx = xml.indexOf('Estimated budget');
if (budgetIdx === -1) { console.error('No se encontró "Estimated budget" en el template.'); process.exit(2); }
const tblStart = xml.lastIndexOf('<w:tbl>', budgetIdx);
const tblEnd = xml.indexOf('</w:tbl>', budgetIdx) + 8;
const tableXml = xml.substring(tblStart, tblEnd);

// Extraer filas
const trMatches = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
if (trMatches.length < 8) { console.error(`Esperaba >= 8 filas, encontré ${trMatches.length}`); process.exit(3); }
console.log(`· Filas detectadas en la tabla: ${trMatches.length}`);

const rows = trMatches.map(m => m[0]);
const before = tableXml.substring(0, trMatches[0].index);
const after = tableXml.substring(trMatches[trMatches.length - 1].index + trMatches[trMatches.length - 1][0].length);

// row 0,1,2 = headers; row 3 = partner placeholder; row 4 = second partner (eliminar);
// row 5 = empty (eliminar); row 6 = Total; row 7 = footer
const headerRows = rows.slice(0, 3);
const partnerRow = rows[3];
const totalRow = rows[6];
const footerRow = rows[7];

// Transformar fila partner: replaces secuenciales (después de [name])
// El primer marcador en la fila es "[name]" — lo trato aparte.
const partnerWithName = partnerRow.replace(/\[name\]/, '{sbp_acronym}');
const partnerTransformed = transformRow(partnerWithName, PARTNER_ROW_PLACEHOLDERS, 'summary_by_partner');

// Transformar fila total
const totalTransformed = transformRow(totalRow, TOTAL_ROW_PLACEHOLDERS, null);

// Reconstruir la tabla
const newRows = [...headerRows, partnerTransformed, totalTransformed, footerRow];
const newTableXml = before + newRows.join('') + after;

// Sustituir en el XML general
const newXml = xml.substring(0, tblStart) + newTableXml + xml.substring(tblEnd);

// Guardar
zip.file('word/document.xml', newXml);
const outBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(TPL_PATH, outBuf);
console.log(`✓ Template parcheado: ${TPL_PATH}`);
console.log(`  · Fila partner: convertida en loop {#summary_by_partner}…{/summary_by_partner}`);
console.log(`  · Fila Total: actualizada con placeholders {tot_*}`);
console.log(`  · Filas duplicadas/vacías eliminadas`);
console.log(`\nSiguiente paso: actualizar render-form-b.js para inyectar summary_by_partner + tot_*`);
