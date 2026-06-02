/* ── Intake Controller — Business logic for intake endpoints ───────── */

const model = require('./model');
const subscribersModel = require('../subscribers/model');

/* ── GET /v1/intake/programs ─────────────────────────────────────── */
async function listPrograms(req, res, next) {
  try {
    const programs = await model.findActivePrograms();
    res.json({
      ok: true,
      data: programs
    });
  } catch (err) {
    next(err);
  }
}

/* ── GET /v1/intake/projects ─────────────────────────────────────── */
async function listProjects(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = Math.min(parseInt(req.query.per_page) || 20, 100);

    const result = await model.findProjectsByUserId(req.user.id, page, perPage);

    res.json({
      ok: true,
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        per_page: result.per_page,
        total_pages: result.total_pages
      }
    });
  } catch (err) {
    next(err);
  }
}

/* ── GET /v1/intake/projects/:id ─────────────────────────────────── */
async function getProject(req, res, next) {
  try {
    const project = await model.findProjectById(req.params.id, req.user.id);
    if (!project) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }
    res.json({
      ok: true,
      data: project
    });
  } catch (err) {
    next(err);
  }
}

/* ── POST /v1/intake/projects ────────────────────────────────────── */
async function createProject(req, res, next) {
  try {
    const { name, type, description, start_date, duration_months, deadline, eu_grant, cofin_pct, indirect_pct } = req.body;

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Project name is required' }
      });
    }

    const projectData = {
      name,
      type,
      description,
      start_date,
      duration_months,
      deadline,
      eu_grant: eu_grant || 0,
      cofin_pct: cofin_pct || 0,
      indirect_pct: indirect_pct || 0
    };

    const project = await model.createProject(req.user.id, projectData);

    // Fire-and-forget: real project → promote newsletter subscriber to 'hot'.
    // Sandbox projects never trigger this (they go via /v1/sandbox/start).
    if (req.user?.email && !project.is_sandbox) {
      subscribersModel
        .promoteByEmail(req.user.email, 'hot', req.user.id)
        .catch(err => console.warn('[subscribers] promote hot failed:', err.message));
    }

    res.status(201).json({
      ok: true,
      data: project
    });
  } catch (err) {
    next(err);
  }
}

/* ── PATCH /v1/intake/projects/:id ───────────────────────────────── */
async function updateProject(req, res, next) {
  try {
    const result = await model.updateProjectFields(req.params.id, req.user.id, req.body);
    if (!result) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }
    res.json({
      ok: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/* ── DELETE /v1/intake/projects/:id ──────────────────────────────── */
async function deleteProject(req, res, next) {
  try {
    const deleted = await model.deleteProject(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }
    res.json({
      ok: true,
      data: { message: 'Project deleted' }
    });
  } catch (err) {
    next(err);
  }
}

/* ── PATCH /v1/intake/projects/:id/launch ───────────────────────── */
async function launchProject(req, res, next) {
  try {
    const db = require('../../utils/db');
    const projectId = req.params.id;
    const userId = req.user.id;

    // Block launch for sandbox projects — user must graduate first.
    const [sbRows] = await db.execute(
      'SELECT is_sandbox FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (sbRows.length && sbRows[0].is_sandbox) {
      return res.status(422).json({
        ok: false,
        error: {
          code: 'SANDBOX_LOCKED',
          message: 'Este proyecto está en modo demo. Gradúalo a proyecto real para continuar.'
        }
      });
    }

    const [result] = await db.execute(
      'UPDATE projects SET status = ? WHERE id = ? AND user_id = ?',
      ['writing', projectId, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // Always (re)create budget from intake data
    try {
      const budgetModel = require('../budget/model');
      await budgetModel.createFromIntake(userId, projectId);
      console.log('[Launch] Budget created/recreated for project', projectId);
    } catch (budgetErr) {
      console.warn('[Launch] Budget creation warning:', budgetErr.message);
    }

    res.json({ ok: true, data: { status: 'writing' } });
  } catch (err) {
    next(err);
  }
}

/* ── GET /v1/intake/projects/:projectId/partners ─────────────────── */
async function listPartners(req, res, next) {
  try {
    const partners = await model.findPartnersByProjectId(req.params.projectId, req.user.id);
    if (partners === null) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }
    res.json({
      ok: true,
      data: partners
    });
  } catch (err) {
    next(err);
  }
}

/* ── POST /v1/intake/projects/:projectId/partners ────────────────── */
async function createPartner(req, res, next) {
  try {
    const { name, legal_name, city, country, organization_id } = req.body;

    if (!name) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Partner name is required' }
      });
    }

    const partner = await model.createPartner(req.params.projectId, req.user.id, {
      name,
      legal_name,
      city,
      country,
      organization_id
    });

    if (!partner) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }

    res.status(201).json({
      ok: true,
      data: partner
    });
  } catch (err) {
    next(err);
  }
}

/* ── PATCH /v1/intake/partners/:id ───────────────────────────────── */
async function updatePartner(req, res, next) {
  try {
    const result = await model.updatePartner(req.params.id, req.user.id, req.body);
    if (!result) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Partner not found or access denied' }
      });
    }
    res.json({
      ok: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/* ── DELETE /v1/intake/partners/:id ──────────────────────────────── */
async function deletePartner(req, res, next) {
  try {
    const deleted = await model.deletePartner(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Partner not found or access denied' }
      });
    }
    res.json({
      ok: true,
      data: { message: 'Partner deleted' }
    });
  } catch (err) {
    next(err);
  }
}

/* ── PATCH /v1/intake/projects/:projectId/partners/reorder ───────── */
async function reorderPartners(req, res, next) {
  try {
    const { order } = req.body;

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'order array is required' }
      });
    }

    const success = await model.reorderPartners(req.params.projectId, req.user.id, order);
    if (!success) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project or partner not found' }
      });
    }

    res.json({
      ok: true,
      data: { message: 'Partners reordered' }
    });
  } catch (err) {
    next(err);
  }
}

/* ── GET /v1/intake/projects/:projectId/context ──────────────────── */
async function listContexts(req, res, next) {
  try {
    const contexts = await model.findContextsByProjectId(req.params.projectId, req.user.id);
    if (contexts === null) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }
    res.json({
      ok: true,
      data: contexts
    });
  } catch (err) {
    next(err);
  }
}

/* ── PATCH /v1/intake/contexts/:id ───────────────────────────────── */
async function updateContext(req, res, next) {
  try {
    const result = await model.updateContextFields(req.params.id, req.user.id, req.body);
    if (!result) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Context not found or access denied' }
      });
    }
    res.json({
      ok: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

/* ── GET /v1/intake/entities/search?q=... ──────────────────────── */
async function searchEntities(req, res, next) {
  try {
    const { q, country, type } = req.query;
    const results = await model.searchEntities({ q, country, type });
    res.json({ ok: true, data: results });
  } catch (err) {
    next(err);
  }
}

/* ── Parse Form Part B (DOCX upload) ─────────────────────────── */
async function parseFormB(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: { message: 'No file provided' } });

    const ext = req.file.originalname.toLowerCase().split('.').pop();
    if (ext !== 'docx') return res.status(400).json({ ok: false, error: { message: 'Only .docx files are supported' } });

    const { parseFormB: parse } = require('../../services/parse-form-b');
    const result = await parse(req.file.buffer);

    res.json({ ok: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPrograms,
  listProjects,
  getProject,
  createProject,
  updateProject,
  launchProject,
  deleteProject,
  listPartners,
  createPartner,
  updatePartner,
  deletePartner,
  reorderPartners,
  listContexts,
  updateContext,
  searchEntities,
  parseFormB,
  // Tasks
  getTaskTemplates,
  listTasks,
  createTask,
  generateTasks,
  updateTask,
  deleteTask,
  deleteAllTasks,
  // Interview
  getInterview,
  interviewNext,
  resetInterview,
};

/* ── Task Templates ──────────────────────────────────────────── */

const TASK_TEMPLATES = require('../../data/task-templates');

async function getTaskTemplates(req, res) {
  res.json({ ok: true, data: TASK_TEMPLATES });
}

/* ── Project Tasks ───────────────────────────────────────────── */

async function listTasks(req, res) {
  try {
    const tasks = await model.listTasks(req.params.projectId);
    res.json({ ok: true, data: tasks });
  } catch (e) { res.status(500).json({ ok: false, error: { message: e.message } }); }
}

async function createTask(req, res) {
  try {
    const result = await model.createTask({ project_id: req.params.projectId, ...req.body });
    res.json({ ok: true, data: result });
  } catch (e) { res.status(500).json({ ok: false, error: { message: e.message } }); }
}

async function generateTasks(req, res) {
  try {
    const { activities } = req.body;
    // activities = [{ wp_id, category, subtype }, ...]
    if (!activities || !Array.isArray(activities)) {
      return res.status(400).json({ ok: false, error: { message: 'activities array required' } });
    }

    const created = [];
    for (let i = 0; i < activities.length; i++) {
      const act = activities[i];
      // Find template
      const cat = TASK_TEMPLATES.find(c => c.category === act.category);
      if (!cat) continue;
      const sub = cat.subtypes.find(s => s.key === act.subtype);
      if (!sub) continue;

      const result = await model.createTask({
        project_id: req.params.projectId,
        wp_id: act.wp_id || null,
        category: act.category,
        subtype: act.subtype,
        title: sub.title,
        description: sub.description,
        sort_order: i,
      });
      created.push({ ...result, title: sub.title, category: act.category, subtype: act.subtype });
    }

    res.json({ ok: true, data: created });
  } catch (e) { res.status(500).json({ ok: false, error: { message: e.message } }); }
}

async function updateTask(req, res) {
  try {
    await model.updateTask(req.params.id, req.body);
    res.json({ ok: true, data: { updated: true } });
  } catch (e) { res.status(500).json({ ok: false, error: { message: e.message } }); }
}

async function deleteTask(req, res) {
  try {
    await model.deleteTask(req.params.id);
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: { message: e.message } }); }
}

async function deleteAllTasks(req, res) {
  try {
    await model.deleteAllTasks(req.params.projectId);
    res.json({ ok: true, data: null });
  } catch (e) { res.status(500).json({ ok: false, error: { message: e.message } }); }
}

/* ══ INTERVIEW ══════════════════════════════════════════════════ */
const { callClaudeChat, callClaude: callClaudeSingle } = require('../../utils/ai');

const INTERVIEW_SYSTEM = (context, proposalLang) => `You are a senior Erasmus+ evaluator acting as a friendly consultant. You are interviewing the project coordinator to extract the essential human insights that ONLY they can provide. You already have all the technical project data (partners, WPs, activities, budget) — what you need is the coordinator's personal vision, their real-world observations, and what makes this project unique.

YOUR APPROACH: You ALWAYS put something on the table FIRST — context, proposals, examples — and then ask the coordinator to react, confirm, or add their personal perspective. Never ask a blank open question. The coordinator should REACT to your proposals, not create from scratch.

INTERVIEW PROTOCOL:
- ONE question per turn, simple language (as if explaining to a teenager)
- ALWAYS provide context, data, or a proposal BEFORE asking
- Be warm, encouraging, use the coordinator's name or organization name
- Reference specific project data (partner names, activity types, budget, WP titles)
- If an answer is weak (<15 words or vague) → rephrase with an example and ask again (does NOT count as a new turn)
- After the coordinator has answered 5-6 substantive questions, respond with ONLY the token [INTERVIEW_COMPLETE]

QUESTION FLOW (6 turns, adapt based on answers):

TURN 1 — DEMONSTRATE UNDERSTANDING + ASK FOR THE HUMAN STORY
You MUST open by showing you have READ and UNDERSTOOD the Work Packages and activities. Summarize what you see: "Looking at your project, I can see that [WP1] focuses on [title/activities], [WP2] on [title/activities], and [WP3] on [title/activities]. So this is a project about [your synthesis of what the project does]."
Then provide brief EU context (relevant policies, SDGs) that connects to what you see in the WPs.
Finally ask: "I understand WHAT you want to do, but I need to understand WHY. What have you seen with your own eyes — in your community, in your daily work — that made you think 'we need to do this project'? Tell me the real story behind this idea."
Give them a concrete example to inspire them based on their project theme.

TURN 2 — DEEPER INTO THE PROBLEM + CONTEXT
Take their answer and dig deeper. Show that you understood their observation. Add EU-level data or policy context that reinforces their point. Then ask for more detail: "That's a strong observation. Can you tell me more about [specific aspect they mentioned]? For example, [concrete follow-up based on their answer]."

TURN 3 — TARGET GROUPS (propose + validate)
Based on the project type and activities in the WPs, PROPOSE the natural target groups: "Looking at your project activities, the natural beneficiaries would be [group A: X people], [group B: Y people], and [group C: Z people]. Does this match your vision, or is there a specific group you want to focus on? Any particular profile — young migrants, rural youth, people with disabilities — that I should keep in mind?"

TURN 4 — WHAT MAKES IT DIFFERENT (provoke reflection)
Challenge them: "Europe receives hundreds of proposals about [their theme] every year. Many do similar workshops and exchanges. I need something that will make an evaluator stop and say 'this is different.' What is your secret ingredient? What are you doing that nobody else does? Maybe a unique methodology, a surprising partnership, a creative twist?" Give an example from their own data if possible.

TURN 5 — RESULTS & SUSTAINABILITY (propose + validate)
Based on the WPs and activities, PROPOSE concrete results and sustainability paths: "From your Work Packages, I can see the project will produce [X, Y, Z results]. For sustainability, I'd suggest: [path A], [path B], [path C]. Does this sound right? Would you add or change anything?"

TURN 6 — FINAL CHECK
Quick summary of what you've gathered and one last chance: "Before I write your summary, is there anything important I've missed? Any detail you'd like to highlight that we haven't discussed?"

After turn 6 (or when you have enough quality information from 5+ substantive answers), respond with ONLY: [INTERVIEW_COMPLETE]

THINGS YOU DO NOT NEED TO ASK (you can build these yourself from the project data):
- "Why is this important now?" → You know the EU context, SDGs, current policies
- "What activities will you do?" → You have the full WP structure
- "What are your KPIs?" → You can derive them from activities
- "Step by step methodology" → You can infer from activity types

LANGUAGE: Respond in the same language the user writes in. Default to ${proposalLang === 'es' ? 'Spanish' : 'English'}.

═══ PROJECT DATA ═══
${context}
═══ END DATA ═══`;

/**
 * Limpia el markdown generado por el LLM para el Project Summary.
 * - Quita listas/headings que rompen la estética prosa.
 * - Mantiene **bold** (lo renderiza el front).
 * - Quita italicos `*x*` (suelen colarse y se ven feos).
 * - Normaliza saltos: garantiza línea en blanco entre párrafos y
 *   colapsa secuencias largas de \n.
 */
function sanitizeSummaryMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  let out = text
    // Strip leading "#" headings (we don't render them, leave the title text)
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    // Strip list bullets/numbered lists at line start
    .replace(/^[ \t]{0,3}([*+\-]|\d+[.)])[ \t]+/gm, '')
    // Strip stray italics `*x*` (single asterisks NOT part of a `**x**` pair)
    .replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1$2');

  // Normalize excessive blank lines (3+ → 2) and trim
  out = out.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

const SUMMARY_SYSTEM = (context, proposalLang) => `You are an expert Erasmus+ proposal writer. Write a compelling Project Summary (250-400 words) combining the interview insights with the full project data.

The interview gave you the HUMAN elements: the real problem, the coordinator's vision, the innovation, the personal motivation. The PROJECT DATA gives you the TECHNICAL elements: partners, activities, WPs, budget, timeline. Merge both into a single coherent summary.

STRUCTURE:
1. Context/background: Open with the real problem the coordinator described (their personal observation) + EU-level context (policies, SDGs, statistics you know)
2. Objectives: What the project aims to achieve (derive from WPs + interview)
3. Participants: Number and profile (from partners data + target groups from interview)
4. Activities: Key activities (from WP data, summarized, not listed mechanically)
5. Methodology: How they'll do it (infer from activity types + the coordinator's unique approach)
6. Results and impact: Concrete expected outcomes (derive from WPs + interview insights)
7. Longer-term benefits: Sustainability and legacy (from interview + your proposal expertise)

RULES:
- Write in ${proposalLang === 'es' ? 'Spanish' : proposalLang === 'fr' ? 'French' : proposalLang === 'de' ? 'German' : 'English'}
- Write as the project coordinator (first person plural: "we")
- Be specific: use partner names, countries, activity names, participant numbers, budget figures
- REFERENCE THE WORK PACKAGES AND ACTIVITIES BY NAME when describing what the project does. You have full WP titles and activity descriptions in the PROJECT DATA — use them explicitly. For example: "Through WP2 'Research and Mapping', we will conduct..." or "Our volunteering mobility (WP3) brings together..."
- Every sentence must carry concrete information — no filler
- Avoid: "this innovative project", "in today's rapidly changing world", "the importance of", "aims to foster"
- The first sentence must hook the evaluator with a concrete observation or striking fact
- Mention the call priorities and how the project addresses them

FORMAT (very important — readers care about visual structure):
- Open with a single section heading "**Project Summary**" on its own line, followed by a blank line, then the opening paragraph.
- Wrap WP titles in markdown bold the FIRST time each one is referenced, e.g. **WP1 Project Management and Coordination** — then refer to them in plain prose afterwards.
- Separate each major content block (context, objectives, activities, methodology, results, sustainability) with a blank line so each becomes its own paragraph. Do NOT cram everything into one wall of text.
- Use ONLY markdown bold (\`**text**\`) — never use italics (\`*text*\`), headings (\`#\`), or list bullets. The output must read as clean prose with bold accents and clear paragraph breaks.

═══ PROJECT DATA ═══
${context}
═══ END DATA ═══`;

async function getInterview(req, res, next) {
  try {
    const projectId = req.params.id;
    const turns = await model.getInterviewTurns(projectId);
    const db = require('../../utils/db');
    const [rows] = await db.query('SELECT interview_summary FROM projects WHERE id = ? AND user_id = ?', [projectId, req.user.id]);
    const summary = rows[0]?.interview_summary || null;
    const completed = turns.some(t => t.role === 'assistant' && t.content.includes('[INTERVIEW_COMPLETE]')) || !!summary;
    res.json({ ok: true, data: { turns, completed, summary } });
  } catch (e) { next(e); }
}

async function interviewNext(req, res, next) {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { answer } = req.body;

    // Build context
    const context = await model.buildInterviewContext(projectId, userId);
    if (!context) return res.status(404).json({ ok: false, error: { message: 'Project not found' } });

    // Get proposal language
    const db = require('../../utils/db');
    const [projRows] = await db.query('SELECT proposal_lang FROM projects WHERE id = ?', [projectId]);
    const proposalLang = projRows[0]?.proposal_lang || 'en';

    // Load existing turns
    let turns = await model.getInterviewTurns(projectId);

    // Save user answer if provided
    if (answer !== null && answer !== undefined) {
      const nextIdx = turns.length;
      await model.saveInterviewTurn(projectId, userId, nextIdx, 'user', answer);
      turns.push({ turn_index: nextIdx, role: 'user', content: answer });
    }

    // Build messages array for Claude
    const messages = [];
    if (turns.length === 0) {
      // First call: seed with a user message asking to start
      messages.push({ role: 'user', content: 'Please start the interview. Ask me your first question about my project.' });
    } else {
      // Convert turns to Claude message format
      // Anthropic requires alternating roles starting with user
      // Our first assistant message was a response to implicit "start", so we need to handle that
      let lastRole = null;
      for (const t of turns) {
        if (t.role === lastRole) continue; // skip duplicates
        messages.push({ role: t.role, content: t.content });
        lastRole = t.role;
      }
      // Ensure it ends with user role (Claude needs user last)
      if (messages.length && messages[messages.length - 1].role !== 'user') {
        // This shouldn't happen normally, but just in case
        messages.push({ role: 'user', content: 'Please continue.' });
      }
    }

    // Call Claude
    const systemPrompt = INTERVIEW_SYSTEM(context, proposalLang);
    const aiResponse = await callClaudeChat(systemPrompt, messages, 1024);

    // Count user answers for progress
    const userAnswers = turns.filter(t => t.role === 'user').length;
    const totalQuestions = 6;

    // Check if interview is complete
    if (aiResponse.includes('[INTERVIEW_COMPLETE]')) {
      // Save the complete marker
      const nextIdx = turns.length;
      await model.saveInterviewTurn(projectId, userId, nextIdx, 'assistant', '[INTERVIEW_COMPLETE]');

      // Generate summary with a separate call
      const transcript = turns
        .filter(t => t.content !== '[INTERVIEW_COMPLETE]')
        .map(t => `${t.role === 'assistant' ? 'Q' : 'A'}: ${t.content}`)
        .join('\n\n');

      const summaryPrompt = `Based on this interview, write the Project Summary:\n\n${transcript}`;
      const rawSummary = await callClaudeSingle(SUMMARY_SYSTEM(context, proposalLang), summaryPrompt, 2048);
      const summary = sanitizeSummaryMarkdown(rawSummary);

      await model.saveInterviewSummary(projectId, summary);

      return res.json({
        ok: true,
        data: { type: 'summary', content: summary, progress: totalQuestions, total_questions: totalQuestions }
      });
    }

    // Save AI response
    const nextIdx = turns.length;
    await model.saveInterviewTurn(projectId, userId, nextIdx, 'assistant', aiResponse);

    res.json({
      ok: true,
      data: { type: 'question', content: aiResponse, progress: userAnswers, total_questions: totalQuestions }
    });
  } catch (e) { next(e); }
}

async function resetInterview(req, res, next) {
  try {
    await model.deleteInterview(req.params.id);
    res.json({ ok: true, data: null });
  } catch (e) { next(e); }
}
