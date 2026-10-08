/**
 * Load KA3 Youth Together documents into the database
 * and link them to the program.
 *
 * Usage: node scripts/load-ka3-docs.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SOURCE_DIR = path.join(__dirname, '..', 'tmp', 'ka3-docs');
// Carpeta privada de documentos (ver node/src/utils/private-storage.js)
const UPLOAD_DIR = path.join(require('../node/src/utils/private-storage').privateRoot(), 'documents');
const PROGRAM_ID = '00000000-0000-4000-a000-000000000001'; // KA3 Youth Together

// Classify documents by type
const DOC_TYPES = {
  'KA3 GUIAS 2026.pdf': { type: 'programme_guide', label: 'KA3 Programme Guide 2026' },
  'GUIAS 2026 BUENAS parte c y d.pdf': { type: 'programme_guide', label: 'Programme Guide 2026 - Parts C & D' },
  'GUIAS 2026 BUENAS-parte A-36.pdf': { type: 'programme_guide', label: 'Programme Guide 2026 - Part A' },
  'Part C - Information for applicants - Erasmus+.pdf': { type: 'call_document', label: 'Part C - Information for Applicants' },
  'Tpl_Application Form (Part B) (ERASMUS BB and LSII) (4).rtf': { type: 'template', label: 'Application Form Part B Template (ERASMUS BB/LSII)' },
  'DECISION authorising the use of lump sums and unit costs under the Erasmus+.pdf': { type: 'annex', label: 'Decision on Lump Sums and Unit Costs (Erasmus+)' },
  'EU Youth Strategy 2019–2027 - PDF ENGLISH.pdf': { type: 'other', label: 'EU Youth Strategy 2019-2027' },
  'European Youth Work Agenda.pdf': { type: 'other', label: 'European Youth Work Agenda' },
  '4 TH EUROPEAN YOUTH WORK CONVENTION.pdf': { type: 'other', label: '4th European Youth Work Convention' },
  'Revising-the-European-Youth-Goals - december 2025.pdf': { type: 'other', label: 'Revised European Youth Goals (December 2025)' },
  'Review of the 9 cycles of the EU Youth Dialogue (2010-2022) .pdf': { type: 'other', label: 'Review of EU Youth Dialogue Cycles (2010-2022)' },
  'Communication on the European Year of Youth 2022.pdf': { type: 'other', label: 'European Year of Youth 2022 Communication' },
  'Inclusion and Diversity Strategy (Erasmus+ ESC).pdf': { type: 'other', label: 'Inclusion & Diversity Strategy (Erasmus+ / ESC)' },
  'The European Green Deal.pdf': { type: 'other', label: 'The European Green Deal' },
  'New European Bauhaus.pdf': { type: 'other', label: 'New European Bauhaus' },
  'Conference on the Future of Europe – outcomes.pdf': { type: 'other', label: 'Conference on the Future of Europe - Outcomes' },
  'Article 2 TEU  EU Common Values.pdf': { type: 'other', label: 'Article 2 TEU - EU Common Values' },
  'DECISION (EU) 2018 - 646 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL.pdf': { type: 'other', label: 'Decision (EU) 2018/646 - European Parliament & Council' },
  'Political Guidelines 2024-2029_President von der Leyen Commission Political Guidelines.pdf': { type: 'other', label: 'Political Guidelines 2024-2029 (von der Leyen Commission)' },
  'Leaflet - revised key competences.pdf': { type: 'other', label: 'Revised Key Competences for Lifelong Learning' },
  'OER - open licensing references.pdf': { type: 'other', label: 'OER - Open Licensing References' },
};

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
  });

  // Ensure upload dir exists
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.pdf') || f.endsWith('.rtf'));
  console.log(`Found ${files.length} documents to load.\n`);

  let loaded = 0;
  for (const file of files) {
    const info = DOC_TYPES[file] || { type: 'other', label: file.replace(/\.[^.]+$/, '') };
    const srcPath = path.join(SOURCE_DIR, file);
    const stat = fs.statSync(srcPath);
    const ext = path.extname(file).slice(1);

    // Generate safe filename
    const safeName = file.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
    const destPath = path.join(UPLOAD_DIR, safeName);

    // Copy file
    fs.copyFileSync(srcPath, destPath);
    const storagePath = '/uploads/documents/' + safeName;

    // Check if already exists
    const [existing] = await conn.execute(
      'SELECT id FROM documents WHERE storage_path = ?', [storagePath]
    );

    let docId;
    if (existing.length) {
      docId = existing[0].id;
      console.log(`  ⊘ ${info.label} (already exists, id=${docId})`);
    } else {
      // Insert document
      const [result] = await conn.execute(
        `INSERT INTO documents (owner_type, owner_id, doc_type, title, description, file_type, file_size_bytes, storage_path, tags, status)
         VALUES ('system', NULL, ?, ?, ?, ?, ?, ?, '[]', 'active')`,
        [info.type, info.label, 'KA3 Youth Together 2026 call document', ext, stat.size, storagePath]
      );
      docId = result.insertId;
      console.log(`  ✓ ${info.label} (${ext}, ${(stat.size / 1024).toFixed(0)}KB) → id=${docId}`);
    }

    // Link to program
    await conn.execute(
      'INSERT IGNORE INTO document_programs (document_id, program_id) VALUES (?, ?)',
      [docId, PROGRAM_ID]
    );
    loaded++;
  }

  console.log(`\n✓ ${loaded} documents loaded and linked to KA3 Youth Together.`);
  await conn.end();
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
