/**
 * Full KA220-YOU evaluation briefs — Part A (question block) + Part B (criteria),
 * loaded from the canonical Word guide
 * "_KA 220 YOU CRITERIAS HOW TO WRITE A PROJECT.docx".
 *
 * The earlier seed (119) only filled ~18 questions with a single criterion each and
 * left Part A (general_context / connections) empty. This migration recreates the
 * whole set for the call: for every form field present in the guide it fills the
 * question's Part A and REPLACES its criteria with the full guide content.
 *
 * Source data: migrations/data/120_ka220_you_criteria.json
 *   (built from the docx — 39 fields, ~166 criteria, mapped to template field_id).
 *
 * Idempotent + canonical: migrations re-run on every deploy (no tracking table), so
 * this always restores the guide content. The Word guide is the source of truth —
 * manual UI edits to KA220-YOU criteria are reset on the next deploy by design.
 * Runs after 119, so the eval tree (sections/questions, bound by field_id) exists.
 */
'use strict';

const path = require('path');
const DATA = require(path.join(__dirname, 'data', '120_ka220_you_criteria.json'));
const { randomUUID } = require('crypto');
const uuid = () => randomUUID();

module.exports = async function (db) {
  // Resolve the KA220-YOU program
  const [progs] = await db.query(
    "SELECT id FROM intake_programs WHERE action_type = 'KA220-YOU' OR program_id = 'new_1780385232134' LIMIT 1"
  );
  if (!progs.length) { console.log('  ⊘ KA220-YOU program not found, skipping criteria load'); return; }
  const programId = progs[0].id;

  // Need the eval tree (built by 119) so questions exist and bind by field_id
  const [[secCount]] = await db.query('SELECT COUNT(*) AS n FROM eval_sections WHERE program_id = ?', [programId]);
  if (secCount.n === 0) { console.log('  ⊘ KA220-YOU has no eval sections yet (119 not applied?), skipping'); return; }

  let nQ = 0, nC = 0, nMiss = 0;
  await db.beginTransaction();
  try {
    for (const f of DATA) {
      // Find the question for this template field within this program
      const [qrows] = await db.query(
        `SELECT q.id FROM eval_questions q
           JOIN eval_sections s ON q.section_id = s.id
          WHERE s.program_id = ? AND q.field_id = ?
          LIMIT 1`,
        [programId, f.field_id]
      );
      if (!qrows.length) { console.log(`  · no question for field_id ${f.field_id}`); nMiss++; continue; }
      const qId = qrows[0].id;

      // Part A — question block
      await db.query(
        `UPDATE eval_questions
            SET general_context = ?, writing_guidance = ?, connects_to = ?
          WHERE id = ?`,
        [f.general_context || null, f.writing_guidance || null, f.connects_to || null, qId]
      );
      nQ++;

      // Part B — replace criteria with the guide's full set
      await db.query('DELETE FROM eval_criteria WHERE question_id = ?', [qId]);
      let order = 0;
      for (const c of f.criteria) {
        await db.query(
          `INSERT INTO eval_criteria
             (id, question_id, title, max_score, mandatory, priority,
              intent, elements, example_weak, example_strong, avoid, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), qId, c.title, 1, c.mandatory ? 1 : 0, c.priority || 'media',
           c.intent || null, c.elements || null, c.example_weak || null,
           c.example_strong || null, c.avoid || null, order]
        );
        order++; nC++;
      }
    }
    await db.commit();
  } catch (e) {
    await db.rollback();
    throw e;
  }

  console.log(`  ✓ KA220-YOU criteria loaded: ${nQ} questions (Part A), ${nC} criteria${nMiss ? `, ${nMiss} fields without a question` : ''}`);
};
