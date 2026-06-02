// Load seed corpus of evaluator letters into evaluation_letters + evaluation_findings.
// Idempotent: re-running does not duplicate.
//
// Usage: node scripts/diagnose/load-seed-corpus.js
//
// Expected layout (see data/seed_evaluator_letters/README.md):
//   data/seed_evaluator_letters/{program_code}/{filename}

require('dotenv').config();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../node/src/utils/db');
const { parseLetterFromFile } = require('../../node/src/modules/diagnose/parser');

// ─── Metadata table (mirrors data/seed_evaluator_letters/README.md) ─────────
const SEED = [
  {
    program_code: 'cove_horizon_2025',
    program_uuid: '11111111-1111-4111-8111-111111111101',
    files: [{
      filename: '3d_cove_letter.txt',
      proposal_number: null,
      proposal_acronym: '3D-CoVE',
      proposal_title: '3D-CoVE — Centres of Vocational Excellence using 3D printing technologies',
      result: 'awarded',
      // Total = 28+17+18+16 = 79
      total_score: 79.00,
      total_threshold: 60.00,
      source_format: 'eacea_pdf',
    }],
  },
  {
    program_code: 'ka3_youth_together_2026',
    program_uuid: '00000000-0000-4000-a000-000000000001',
    files: [
      {
        filename: 'focus_101246479.pdf',
        proposal_number: '101246479',
        proposal_acronym: 'FOCUS',
        proposal_title: 'FOCUS – Framing Our Civic Unity for Sustainable Development Goals',
        result: 'rejected_threshold',
        total_score: 53.00,
        total_threshold: 60.00,
        source_format: 'eacea_pdf',
      },
      {
        filename: 'rise_101246449.pdf',
        proposal_number: '101246449',
        proposal_acronym: 'RISE',
        proposal_title: 'RISE: "Rural Inclusion, Sustainability & Empowerment"',
        result: 'rejected_ranking',
        total_score: 68.00,
        total_threshold: 60.00,
        source_format: 'eacea_pdf',
      },
    ],
  },
  {
    program_code: 'sport_volunteering_2025',
    program_uuid: '11111111-1111-4111-8111-111111111102',
    files: [{
      filename: 'dance_plus.docx',
      proposal_number: null,
      proposal_acronym: 'DANCE+',
      proposal_title: 'DANCE+ — Volunteering in Sport',
      result: 'unknown',
      total_score: null,
      total_threshold: null,
      source_format: 'narrative',
    }],
  },
];

const SEED_DIR = path.join(__dirname, '..', '..', 'data', 'seed_evaluator_letters');

async function findExistingLetter(conn, programUuid, proposalNumber, filename) {
  if (proposalNumber) {
    const [rows] = await conn.query(
      `SELECT id FROM evaluation_letters
       WHERE program_id = ? AND proposal_number = ? LIMIT 1`,
      [programUuid, proposalNumber]
    );
    if (rows.length) return rows[0].id;
  }
  // Fallback: filename
  const [rows2] = await conn.query(
    `SELECT id FROM evaluation_letters
     WHERE program_id = ? AND source_filename = ? LIMIT 1`,
    [programUuid, filename]
  );
  return rows2.length ? rows2[0].id : null;
}

async function insertLetter(conn, programUuid, meta, parsed, filename) {
  const id = uuidv4();
  await conn.query(
    `INSERT INTO evaluation_letters
     (id, program_id, proposal_number, proposal_acronym, proposal_title,
      total_score, total_threshold, result, source_format, source_filename,
      raw_text, scores_by_criterion, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      programUuid,
      meta.proposal_number,
      meta.proposal_acronym,
      meta.proposal_title,
      meta.total_score,
      meta.total_threshold,
      meta.result,
      parsed.sourceFormat || meta.source_format,
      filename,
      parsed.rawText,
      JSON.stringify(parsed.scoresByCriterion || {}),
      'en',
    ]
  );
  return id;
}

async function insertFindings(conn, letterId, programUuid, findings) {
  if (!findings || findings.length === 0) return 0;
  const rows = findings.map((f, idx) => [
    uuidv4(),
    letterId,
    programUuid,
    f.criterion || 'GENERAL',
    f.sub_criterion || null,
    f.severity || 'medium',
    f.is_positive ? 1 : 0,
    f.finding_text,
    f.fragment_quote,
    f.applies_to_section || null,
    idx,
  ]);
  await conn.query(
    `INSERT INTO evaluation_findings
     (id, letter_id, program_id, criterion, sub_criterion, severity,
      is_positive, finding_text, fragment_quote, applies_to_section, sort_order)
     VALUES ?`,
    [rows]
  );
  return rows.length;
}

(async () => {
  const conn = pool;
  let totalLetters = 0, totalFindings = 0, skipped = 0;

  console.log(`\nSeed corpus loader — ${new Date().toISOString()}`);
  console.log(`Source dir: ${SEED_DIR}\n`);

  for (const programBlock of SEED) {
    console.log(`Program: ${programBlock.program_code} (${programBlock.program_uuid})`);

    // Verify program exists
    const [progRows] = await conn.query(
      `SELECT id, program_id, name FROM intake_programs WHERE id = ?`,
      [programBlock.program_uuid]
    );
    if (progRows.length === 0) {
      console.log(`  ⚠ Program UUID not found in intake_programs — skipping entire block`);
      continue;
    }

    for (const file of programBlock.files) {
      const fullPath = path.join(SEED_DIR, programBlock.program_code, file.filename);
      console.log(`  • ${file.filename}`);

      // Idempotency check
      const existing = await findExistingLetter(
        conn, programBlock.program_uuid, file.proposal_number, file.filename
      );
      if (existing) {
        console.log(`    ⊘ Already loaded (letter_id=${existing}) — skipped`);
        skipped++;
        continue;
      }

      let parsed;
      try {
        parsed = await parseLetterFromFile(fullPath);
      } catch (err) {
        console.error(`    ✗ Parse failed: ${err.message}`);
        continue;
      }

      const letterId = await insertLetter(conn, programBlock.program_uuid, file, parsed, file.filename);
      const n = await insertFindings(conn, letterId, programBlock.program_uuid, parsed.findings);
      console.log(`    ✓ letter_id=${letterId} · ${n} findings`);
      totalLetters++;
      totalFindings += n;
    }
  }

  console.log(`\nSummary: ${totalLetters} letters loaded, ${totalFindings} findings inserted, ${skipped} skipped (already present).`);
  await conn.end();
})().catch(err => {
  console.error('Loader error:', err);
  process.exit(1);
});
