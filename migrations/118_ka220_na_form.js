/**
 * KA220 / KA2 National-Agency application form ("KA2 TEMPLATE").
 *
 * National-Agency (NA) calls do NOT let you upload a Word Part B — the applicant
 * must copy-paste every question/answer into the EU web eForm. So this form is a
 * distinct, selectable form_template (meta.output_mode = 'copy_paste') with the
 * REAL NA question set and character limits, independent from the EACEA template.
 *
 * What this migration does (all idempotent):
 *   1. Adds eval_questions.field_id + eval_questions.char_limit (data-driven criteria
 *      mapping + per-question character limits — NA forms use chars, not words).
 *   2. Upserts the KA220 NA form_template (template_json).
 *   3. Links the existing "KA 220 YOU" program (action_type KA220-YOU) to it, if
 *      it has no template yet.
 *
 * The evaluation criteria for this form are seeded separately (119_seed_ka220_you).
 */
'use strict';

const TEMPLATE_ID = '00000000-0000-4000-b000-000000000220';
const TEMPLATE_SLUG = 'ka2-na-cooperation';

// ── Helper to build a question subsection (one textarea field per question) ──
let _n = 0;
function q(number, fieldId, title, guidance, charLimit) {
  return {
    id: 'sub_' + fieldId,
    number,
    title,
    guidance: Array.isArray(guidance) ? guidance : [guidance],
    fields: [{ id: fieldId, label: title, type: 'textarea', placeholder: 'Insert text', char_limit: charLimit }],
  };
}

function buildTemplate() {
  return {
    meta: {
      id: 'KA2_NA_COOP',
      tag: 'KA2-NA-COOP',
      title: 'KA220 Cooperation Partnerships — National Agency form',
      version: '1.0',
      scope: 'Erasmus+ KA2 Cooperation Partnerships managed by National Agencies (KA220-YOU, KA220-ADU, KA220-SCH, KA220-VET).',
      managing_body: 'national_agency',
      // No Word upload: the applicant pastes Q/A field-by-field into the EU web eForm.
      output_mode: 'copy_paste',
      no_upload: true,
      limit_unit: 'characters',
    },

    sections: [
      // 1 — Participating Organisations -------------------------------------
      {
        id: 'sec_org', number: '1', title: 'PARTICIPATING ORGANISATIONS',
        subsections: [
          q('1.1', 'org_applicant_present', 'Applicant — presentation of the organisation',
            'Please briefly present the applicant organisation (e.g. its type, scope of work, areas of activity and, if applicable, approximate number of paid/unpaid staff, learners).', 4000),
          q('1.2', 'org_applicant_experience', 'Applicant — activities and experience relevant to the project',
            'What are the activities and experience of the applicant organisation in the areas relevant for this project? What are the skills and/or expertise of the key persons involved in this project?', 4000),
          q('1.3', 'org_applicant_pastpart', 'Applicant — comments on past participation',
            'Would you like to make any comments or add any information to the summary of the applicant organisation’s past participation in Erasmus+?', 3000),
          q('1.4', 'org_partners_present', 'Partner organisations — presentation',
            'Briefly present EACH partner organisation (one short paragraph per partner: type, scope, areas of activity, approximate number of paid/unpaid staff or learners). Keep the partners in the same order as the consortium.', 4000),
          q('1.5', 'org_partners_experience', 'Partner organisations — activities and experience',
            'For EACH partner organisation: what are its activities and experience in the areas relevant for this project, and the skills/expertise of its key persons involved? One short paragraph per partner.', 4000),
        ],
      },

      // 2 — Relevance --------------------------------------------------------
      {
        id: 'sec_rel', number: '2', title: 'RELEVANCE OF THE PROJECT',
        subsections: [
          q('2.1', 'rel_priorities_addressed', 'How the project addresses the selected priorities',
            'How does the project address the selected priority (and, if relevant, up to two additional priorities) according to the objectives of your project?', 3000),
          q('2.2', 'rel_motivation', 'Motivation and why it should be funded',
            'Please describe the motivation for your project and explain why it should be funded.', 3000),
          q('2.3', 'rel_objectives_results', 'Objectives and concrete results',
            'What are the objectives you would like to achieve and the concrete results you would like to produce? How are these objectives linked to the priorities you have selected?', 3000),
          q('2.4', 'rel_innovative', 'Innovation',
            'What makes your proposal innovative?', 2000),
          q('2.5', 'rel_complementary', 'Complementarity with other initiatives',
            'How is this project complementary to other initiatives already carried out by the participating organisations?', 2000),
          q('2.6', 'rel_synergies', 'Synergies / cross-field impact',
            'How is your proposal suitable for creating synergies between different fields of education, training, youth and sport, or how does it have a strong potential impact on one or more of those fields?', 3000),
          q('2.7', 'rel_eu_value', 'European added value',
            'How does the proposal bring added value at European level through results that would not be attained by activities carried out in a single country?', 2000),
        ],
      },

      // 3 — Needs analysis ---------------------------------------------------
      {
        id: 'sec_needs', number: '3', title: 'NEEDS ANALYSIS',
        subsections: [
          q('3.1', 'needs_address', 'Needs to be addressed',
            'What needs do you want to address by implementing your project?', 3000),
          q('3.2', 'needs_target_groups', 'Target groups',
            'What are the target groups of the project? How do the participating organisations engage with the project target groups in their activities?', 2000),
          q('3.3', 'needs_identification', 'How the needs were identified',
            'How did you identify the needs of your partnership and those of your target groups?', 2000),
          q('3.4', 'needs_how_address', 'How the project addresses the needs',
            'How will this project address those needs?', 2000),
        ],
      },

      // 4 — Partnership and cooperation arrangements -------------------------
      {
        id: 'sec_part', number: '4', title: 'PARTNERSHIP AND COOPERATION ARRANGEMENTS',
        subsections: [
          q('4.1', 'part_formation', 'How the partnership was formed',
            'How did you form your partnership? How does the mix of participating organisations complement each other, and what will be the added value of their collaboration in the framework of the project?', 3000),
          q('4.2', 'part_task_allocation', 'Task allocation',
            'What is the task allocation, and how does it reflect the commitment and active contribution of all participating organisations?', 3000),
          q('4.3', 'part_coordination', 'Coordination and communication',
            'Describe the mechanisms for coordination and communication between the participating organisations, as well as with other relevant stakeholders, in particular with the use of educational platforms (e.g. the School Education platform including eTwinning, and the Erasmus+ space on EPALE).', 3000),
        ],
      },

      // 5 — WP1 Project Management (fixed horizontal questions) --------------
      {
        id: 'sec_wp1', number: '5', title: 'WORK PACKAGE 1 — PROJECT MANAGEMENT',
        subsections: [
          q('5.1', 'wp1_monitoring', 'Monitoring of progress and quality',
            'How will the progress, quality and achievement of project activities be monitored? Please give information about the staff involved, as well as the timing and frequency of the monitoring activities.', 3000),
          q('5.2', 'wp1_budget_control', 'Budget control and time management',
            'How will you ensure proper budget control and time management in your project?', 3000),
          q('5.3', 'wp1_risks', 'Risk management',
            'What are your plans for handling risks for project implementation (e.g. delays, budget, conflicts, etc.)?', 2000),
          q('5.4', 'wp1_inclusive', 'Accessibility and inclusion',
            'How will you ensure that the activities are designed in an accessible and inclusive way?', 3000),
          q('5.5', 'wp1_digital', 'Digital tools and learning methods',
            'How does the project incorporate the use of digital tools and learning methods to complement the physical activities and to improve cooperation between partner organisations?', 3000),
          q('5.6', 'wp1_green', 'Green practices',
            'How does the project incorporate green practices in the different project phases?', 3000),
          q('5.7', 'wp1_civic', 'Participation and civic engagement',
            'How does the project encourage participation and civic engagement in the different project phases?', 3000),
        ],
      },

      // 6 — Work Packages (content) — expanded per content WP ----------------
      {
        id: 'sec_wpc', number: '6', title: 'WORK PACKAGES',
        per_wp: true,   // frontend expands these questions once per content WP
        subsections: [
          q('WPx.1', 'wp_objectives', 'Specific objectives of the work package',
            'What are the specific objectives of this work package and how do they contribute to the general objectives of the project?', 2000),
          q('WPx.2', 'wp_results', 'Main results of the work package',
            'What will be the main results of this work package?', 2000),
          q('WPx.3', 'wp_qual_indicators', 'Qualitative indicators',
            'What qualitative indicators will you use to measure the level of achievement of the work package objectives and the quality of the results?', 2000),
          q('WPx.4', 'wp_quant_indicators', 'Quantitative indicators',
            'What quantitative indicators will you use to measure the level of achievement of the work package objectives and the quality of the results?', 2000),
          q('WPx.5', 'wp_tasks_partners', 'Tasks and responsibilities per partner',
            'Please describe the tasks and responsibilities of each partner organisation in the work package.', 2000),
          q('WPx.6', 'wp_cost_effective', 'Cost-effectiveness of the work package budget',
            'Please explain how the grant amount attributed to this work package constitutes a cost-effective use of the budget.', 5000),
          q('WPx.7', 'wp_activities', 'Activities of the work package',
            'For the activities of this work package, describe the content of the proposed activities, explain how they help reach the WP objectives, describe their expected results, and give the expected number and profile of participants.', 2000),
        ],
      },

      // 7 — Impact -----------------------------------------------------------
      {
        id: 'sec_impact', number: '7', title: 'IMPACT',
        subsections: [
          q('7.1', 'impact_assess', 'Assessment of objective achievement',
            'How are you going to assess whether the project objectives have been achieved?', 3000),
          q('7.2', 'impact_sustainability', 'Sustainability and continuation',
            'Explain how you will ensure the sustainability of the project: how will participation in this project contribute to the development of the involved organisations in the long term? Do you plan to continue using the project results or implement some of the activities after the project’s end?', 3000),
          q('7.3', 'impact_wider', 'Wider impact',
            'Please describe the potential wider impact of your project: will the impact be equally spread among the involved organisations? What is the potential impact on each participating organisation as a whole? Are there other groups or organisations at local, regional, national or European level that will benefit from your project? Please explain how.', 3000),
          q('7.4', 'impact_dissemination', 'Sharing and promotion of results',
            'Please describe your plans for sharing and promoting the project results: how do you intend to make the results of your project known within your partnership, in your local communities and to the wider public? Who are the main target groups you intend to share your results with?', 3000),
        ],
      },

      // 8 — Project summary (placed last; synthesises the whole project) -----
      {
        id: 'sec_summary', number: '8', title: 'PROJECT SUMMARY',
        subsections: [
          q('8.1', 'sum_objectives', 'Summary — Objectives',
            'Objectives: what do you want to achieve by implementing the project? (Be concise and clear.)', 500),
          q('8.2', 'sum_implementation', 'Summary — Implementation',
            'Implementation: what activities are you going to implement?', 500),
          q('8.3', 'sum_results', 'Summary — Results',
            'Results: what project results and other outcomes do you expect your project to have?', 500),
        ],
      },
    ],
  };
}

module.exports = async function (db) {
  // 1) Columns for data-driven criteria mapping + character limits
  const [cols] = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='eval_questions' AND COLUMN_NAME IN ('field_id','char_limit')"
  );
  const have = cols.map(c => c.COLUMN_NAME);
  if (!have.includes('field_id')) {
    await db.query("ALTER TABLE eval_questions ADD COLUMN field_id VARCHAR(120) NULL COMMENT 'Maps this question to the form template field id (data-driven Writer/criteria binding)'");
  }
  if (!have.includes('char_limit')) {
    await db.query("ALTER TABLE eval_questions ADD COLUMN char_limit INT NULL COMMENT 'Character limit for NA eForm fields (chars, not words)'");
  }

  // form_ref was VARCHAR(10) (EACEA codes like sec_2_1); NA section refs are longer.
  await db.query("ALTER TABLE eval_sections MODIFY form_ref VARCHAR(40)");

  // 2) Upsert the KA220 NA form template
  const json = JSON.stringify(buildTemplate());
  await db.query(
    `INSERT INTO form_templates (id, name, slug, description, version, template_json)
     VALUES (?, ?, ?, ?, '1.0', ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
       version=VALUES(version), template_json=VALUES(template_json)`,
    [
      TEMPLATE_ID,
      'KA2 Cooperation Partnerships (National Agency)',
      TEMPLATE_SLUG,
      'National-Agency KA2 form (KA220/KA210). Copy-paste into the EU web eForm — no Word upload. Real NA question set with character limits.',
      json,
    ]
  );

  // 3) Link the existing KA 220 YOU program if it has no template yet
  const [progs] = await db.query(
    "SELECT id, form_template_id FROM intake_programs WHERE action_type = 'KA220-YOU' OR program_id = 'new_1780385232134'"
  );
  for (const p of progs) {
    if (!p.form_template_id) {
      await db.query('UPDATE intake_programs SET form_template_id = ? WHERE id = ?', [TEMPLATE_ID, p.id]);
      console.log(`  ✓ Linked program ${p.id} to KA220 NA template`);
    }
  }

  console.log(`  ✓ KA220 NA form template ready (${TEMPLATE_ID})`);
};
