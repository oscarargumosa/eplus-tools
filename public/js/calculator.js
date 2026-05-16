/* ═══════════════════════════════════════════════════════════════
   Calculator — Erasmus+ Budget Wizard
   ═══════════════════════════════════════════════════════════════ */

const Calculator = (() => {
  let initialized = false;
  let currentProjectId = null;
  let currentStep = -1; // -1 = project selector
  let maxReached = -1;
  let saveTimer = null;

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

  /* ── State ──────────────────────────────────────────────────── */
  let state = {
    project: null,
    partners: [],
    partnerRates: {},   // pid → { aloj, mant }
    workerRates: [],
    wrCounter: 0,
    routes: {},         // "min_max" → { km, green, custom_rate }
    extraDests: [],     // [{ id, name, country }]
    extraDestCounter: 0,
    wps: [],
    actCounter: 0,
    mgmt: { rate_applicant: 500, rate_partner: 250 },
  };

  /* ── Autosave ─────────────────────────────────────────────── */
  let _saving = false;
  let _saveQueued = false;

  function serializeState() {
    return {
      partnerRates: state.partnerRates,
      workerRates: state.workerRates,
      routes: state.routes,
      extraDests: state.extraDests,
      wps: state.wps,
    };
  }

  async function doSave() {
    if (!currentProjectId || _saving) { _saveQueued = true; return; }
    _saving = true;
    showSaveStatus('saving');
    try {
      await API.put('/calculator/projects/' + currentProjectId + '/state', serializeState());
      showSaveStatus('saved');
    } catch (err) {
      console.error('[Calc] autosave error:', err && (err.code || err.status), err && err.message, err);
      showSaveStatus('error');
      // Soft retry once after 6s — handles transient 401-after-refresh and brief network blips
      setTimeout(() => { if (currentProjectId && !_saving) scheduleSave(); }, 6000);
    } finally {
      _saving = false;
      if (_saveQueued) { _saveQueued = false; scheduleSave(); }
    }
  }

  function scheduleSave() {
    if (!currentProjectId) return;
    // Never autosave against a temporary id — would 403 and risk masking real loads.
    // The save fires only when openProject/loadFromServer has bound a real BD id.
    if (String(currentProjectId).startsWith('intake-temp-')) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 2000);
  }

  function showSaveStatus(status) {
    let el = document.getElementById('calc-save-status');
    if (!el) {
      el = document.createElement('span');
      el.id = 'calc-save-status';
      el.className = 'text-[10px] font-medium ml-2 transition-opacity duration-500';
      const topbar = document.getElementById('topbar-title');
      if (topbar) topbar.parentElement.appendChild(el);
    }
    if (status === 'saving') { el.textContent = 'Guardando...'; el.style.color = '#9ca3af'; el.style.opacity = '1'; }
    else if (status === 'saved') { el.textContent = 'Guardado'; el.style.color = '#22c55e'; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 2000); }
    else if (status === 'error') { el.textContent = 'Error al guardar — reintentando'; el.style.color = '#ef4444'; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 4000); }
  }

  /* ── Constants ──────────────────────────────────────────────── */
  const WP_COLORS = ['#1D4ED8','#B45309','#7C3AED','#0F766E','#BE185D','#065F46','#9A3412','#1E40AF','#6B21A8','#0E7490','#4D7C0F','#7F1D1D'];
  const WP_BG     = ['rgba(29,78,216,.06)','rgba(180,83,9,.06)','rgba(124,58,237,.06)','rgba(15,118,110,.06)','rgba(190,24,93,.06)','rgba(6,95,70,.06)','rgba(154,52,18,.06)','rgba(30,64,175,.06)','rgba(107,33,168,.06)','rgba(14,116,144,.06)','rgba(77,124,15,.06)','rgba(127,29,29,.06)'];

  const DISTANCE_BANDS = [
    { min:0,    max:9,    label:'< 10 km',        green:0,    std:0    },
    { min:10,   max:99,   label:'10 – 99 km',     green:56,   std:28   },
    { min:100,  max:499,  label:'100 – 499 km',   green:285,  std:211  },
    { min:500,  max:1999, label:'500 – 1999 km',  green:417,  std:309  },
    { min:2000, max:2999, label:'2000 – 2999 km', green:535,  std:395  },
    { min:3000, max:3999, label:'3000 – 3999 km', green:785,  std:580  },
    { min:4000, max:7999, label:'4000 – 7999 km', green:1188, std:1188 },
    { min:8000, max:Infinity, label:'≥ 8000 km',  green:1735, std:1735 },
  ];

  /* ── Reference staff rates (loaded from Data E+ via API) ────── */
  let REF_STAFF_CATEGORIES = []; // [{code, name_en, zones:{A:{rate_day},B:{rate_day},...}}]
  let REF_COUNTRY_ZONES = {};    // { "spain":"B", "germany":"A", ... }
  let _refRatesLoaded = false;

  async function loadRefRates() {
    if (_refRatesLoaded) return;
    try {
      const res = await API.get('/calculator/ref/staff-rates');
      console.log('[Calc] ref/staff-rates raw response:', JSON.stringify(res).slice(0, 500));
      if (res && res.categories && res.categories.length) {
        REF_STAFF_CATEGORIES = res.categories.filter(c => c.active);
        REF_COUNTRY_ZONES = res.countryZones || {};
        if (res.perdiem && Object.keys(res.perdiem).length) {
          PERDIEM_DEFAULTS = res.perdiem;
        }
        _refRatesLoaded = true;
        console.log('[Calc] Loaded', REF_STAFF_CATEGORIES.length, 'staff categories from Data E+');
        console.log('[Calc] Categories:', REF_STAFF_CATEGORIES.map(c => c.code + ':' + c.name_en).join(', '));
        console.log('[Calc] Country zones sample:', Object.entries(REF_COUNTRY_ZONES).slice(0, 5).map(([k,v]) => k+'='+v).join(', '));
      } else {
        console.error('[Calc] ref/staff-rates returned empty or invalid data:', res);
      }
    } catch (err) {
      console.error('[Calc] FAILED to load ref staff rates:', err);
    }
  }

  function getCountryZone(country) {
    if (!country) return 'C';
    return REF_COUNTRY_ZONES[country.toLowerCase().trim()] || 'C';
  }

  /* Per diem defaults — overridden by Data E+ when available */
  let PERDIEM_DEFAULTS = {
    'A': { aloj:108, mant:72 },
    'B': { aloj:96,  mant:64 },
    'C': { aloj:84,  mant:56 },
    'D': { aloj:72,  mant:48 },
  };

  const ACT_TYPES = {
    mgmt:       { label:'Management',           icon:'settings',        color:'#474551', bg:'rgba(71,69,81,.08)',   mobility:false, descHint:'In your own words, tell us how you plan to coordinate the project. How will you organise internal communication, monitor progress and handle reporting?' },
    meeting:    { label:'Transnational Meeting', icon:'groups',          color:'#1D4ED8', bg:'rgba(29,78,216,.08)', mobility:true,  descHint:'Tell us about this meeting in your own words. What do you want to achieve? Who will be there? What decisions or outcomes do you expect?',
      subtypes: ['Kick-off meeting','Mid-term meeting','Final meeting','Coordination meeting','Technical working meeting','Strategic planning meeting'] },
    ltta:       { label:'LTTA / Mobility',       icon:'flight_takeoff',  color:'#0F766E', bg:'rgba(15,118,110,.08)',mobility:true,  descHint:'Describe this mobility in your own words. What will participants learn? What methodology will you use? Who is the target group and what skills will they develop?',
      subtypes: ['Training mobility','Study visit mobility','Group mobility','Youth exchange mobility','Staff mobility','Job shadowing mobility','Peer learning mobility','Blended mobility','Pilot mobility','Volunteering mobility','Expert mobility','Community immersion mobility'] },
    io:         { label:'Intellectual Output',   icon:'menu_book',       color:'#7C3AED', bg:'rgba(124,58,237,.08)',mobility:false, descHint:'Tell us what you want to create. What kind of product is it (guide, toolkit, platform...)? How will you develop it and who will use it?',
      subtypes: ['Educational manual','Methodological guide','Training course / module','Toolkit','Research report / needs analysis','Digital platform / interactive tool'] },
    me:         { label:'Multiplier Event',      icon:'campaign',        color:'#BE185D', bg:'rgba(190,24,93,.08)', mobility:false, descHint:'Describe this event in your own words. What is it about? Who do you want to reach? What format are you thinking (conference, workshop, open day...)?',
      subtypes: ['Launch event','Dissemination conference','Final conference','Stakeholder event','Networking event','Public presentation event'] },
    local_ws:   { label:'Local Workshop',        icon:'school',          color:'#B45309', bg:'rgba(180,83,9,.08)',  mobility:false, descHint:'Tell us about this local activity. What topics will you cover? Who will participate? What do you hope they will take away from it?',
      subtypes: ['Training workshop','Participatory workshop','Awareness workshop','Co-creation workshop','Community workshop','Testing / pilot workshop'] },
    personal_work:{ label:'Personal Work',       icon:'psychology',      color:'#16A34A', bg:'rgba(22,163,74,.08)', mobility:false, descHint:'Tell us about the personal work this involves. What kind of one-to-one accompaniment, mentoring or guided personal exploration will participants experience? How is each pathway structured and what individual result will each participant produce?',
      subtypes: ['One-to-one mentoring','Personal accompaniment','Coaching pathway','Reflective journaling','Individual portfolio','Personal creation project'] },
    campaign:   { label:'Dissemination',         icon:'share',           color:'#065F46', bg:'rgba(6,95,70,.08)',   mobility:false, descHint:'How do you plan to spread the word? Which channels will you use? Who do you want to reach and what message do you want to convey?',
      subtypes: ['Social media dissemination','Newsletter dissemination','Press / media dissemination','Video dissemination','Community / stakeholder dissemination','Printed dissemination'] },
    website:    { label:'Website',               icon:'language',        color:'#1D4ED8', bg:'rgba(29,78,216,.08)', mobility:false, descHint:'Tell us about the website or platform you want to build. What is its purpose? What will users find there? In which languages?',
      subtypes: ['Project website','Landing page','Resource website','Learning platform','Community platform','Results repository'] },
    artistic:   { label:'Artistic Fees',         icon:'palette',         color:'#BE185D', bg:'rgba(190,24,93,.08)', mobility:false, descHint:'What kind of artistic or creative work do you need? What is it for (video, design, performance...)? How does it connect to the project goals?',
      subtypes: ['Graphic design','Video production / editing','Photography','Illustration / branding','Audio / podcast production','Artistic facilitation / performance'] },
    equipment:  { label:'Equipment',             icon:'devices',         color:'#0369A1', bg:'rgba(3,105,161,.08)', mobility:false, depreciation:true, descHint:'What equipment do you need to purchase? Why is it essential for the project? Which activities will use it?',
      subtypes: ['Computers / laptops','Tablets / mobile devices','Audio-visual equipment','Recording equipment','Educational / workshop equipment','Event technical equipment'] },
    goods:      { label:'Other Goods',           icon:'inventory_2',     color:'#7C3AED', bg:'rgba(124,58,237,.08)',mobility:false, depreciation:true, descHint:'What goods or services do you need? Why are they necessary for the project and which activities do they support?',
      subtypes: ['Printed materials','Educational materials','Visibility materials','Workshop materials','Event materials','Participant kits / welcome packs'] },
    consumables:{ label:'Consumables',           icon:'science',         color:'#0F766E', bg:'rgba(15,118,110,.08)',mobility:false, depreciation:true, descHint:'What materials or supplies do you need? What are they for and which project activities require them?',
      subtypes: ['Printing consumables','Workshop consumables','Office consumables','Hygiene / cleaning consumables','Catering consumables','Technical consumables'] },
    other:      { label:'Other Costs',           icon:'add_circle',      color:'#6B7280', bg:'rgba(107,114,128,.08)',mobility:false, depreciation:true, descHint:'Tell us about this cost. What does it cover, why is it needed and how did you estimate the amount?',
      subtypes: ['Translation / interpretation costs','External expert / trainer costs','Venue / space rental costs','Hosting / software / platform costs','Travel / accommodation support costs','Evaluation / administrative support costs'] },
  };

  const WP1_TITLES = [
    'Project Management and Coordination',
    'Project Coordination, Management and Monitoring',
    'Project Governance, Coordination and Administration',
    'Project Management, Quality Assurance and Internal Communication',
    'Strategic Project Management and Partnership Coordination',
    'Project Leadership, Coordination and Operational Management',
  ];

  const LAST_WP_TITLES = [
    'Dissemination, Evaluation and Sustainability',
    'Impact, Dissemination and Sustainability',
    'Dissemination, Exploitation and Sustainability of Results',
    'Communication, Dissemination and Impact Maximisation',
    'Evaluation, Quality Assurance and Dissemination',
    'Impact, Evaluation and Long-term Sustainability',
  ];

  const WP_TAXONOMY = [
    { cat:'Research / Mapping / Diagnosis', titles:[
      'Research, Mapping and Needs Analysis',
      'Context Analysis, Diagnosis and Stakeholder Mapping',
      'Needs Assessment and Baseline Research',
      'Territorial Mapping and Contextual Diagnosis',
    ]},
    { cat:'Methodology / Framework Development', titles:[
      'Methodology and Educational Framework Development',
      'Pedagogical Framework and Intervention Design',
      'Conceptual Model and Methodological Design',
      'Project Methodology and Learning Framework',
    ]},
    { cat:'Content / Tools / Training Resources', titles:[
      'Content Development and Training Resources',
      'Educational Materials, Tools and Learning Resources',
      'Toolkit and Capacity Building Resources Development',
      'Training Content and Practical Tools Production',
    ]},
    { cat:'Pilot / Implementation / Validation', titles:[
      'Pilot Implementation and Validation',
      'Testing, Implementation and Evaluation of the Model',
      'Pilot Actions, Field Testing and Validation',
      'Practical Implementation and Methodology Validation',
    ]},
  ];

  /* ── Auto-generated WP summaries per title ──────────────────── */
  const WP_SUMMARIES = {
    // WP1 titles
    'Project Management and Coordination':
      'We will coordinate all project activities and ensure smooth collaboration among consortium partners. We will set up operational planning tools, establish internal communication protocols (shared drive, mailing lists, project management platform), oversee the budget execution, and track progress against milestones. The coordinator will lead regular steering committee meetings, manage timelines, and produce all required reports for the funding agency. All partners will contribute to risk management, administrative duties, and quality control throughout the project lifecycle.',

    'Project Coordination, Management and Monitoring':
      'We will establish the governance and operational framework for the entire project. We will define roles and responsibilities, set up coordination mechanisms, manage the partnership agreement, and implement a continuous monitoring system with clear indicators and targets. The coordinator will organise periodic consortium meetings, produce management reports, oversee budget execution, and take corrective actions when deviations are identified. We will develop a dedicated quality assurance plan to guide all monitoring activities.',

    'Project Governance, Coordination and Administration':
      'We will define the governance structure and administrative procedures for the entire project. We will establish decision-making bodies (steering committee, advisory board), set up communication workflows, create financial management protocols, and ensure contractual compliance across the consortium. The coordinator will guarantee transparent reporting, efficient resource allocation, and timely resolution of administrative issues.',

    'Project Management, Quality Assurance and Internal Communication':
      'We will integrate project management with a structured quality assurance framework and a proactive internal communication strategy. We will oversee the work plan, review deliverable quality at each stage, identify and mitigate risks, and set up digital collaboration tools (Slack, Teams, shared workspace) for continuous partner engagement. We will run regular quality checkpoints and peer-review cycles to ensure all outputs meet agreed standards before dissemination.',

    'Strategic Project Management and Partnership Coordination':
      'We will provide strategic oversight of the project and strengthen the consortium partnership beyond day-to-day management. We will organise strategic alignment sessions, plan stakeholder engagement, map synergies with complementary initiatives, and coordinate cross-cutting priorities such as inclusion, sustainability, and digital transformation. The coordinator will facilitate strategic retreats and maintain a living roadmap that adapts to emerging opportunities and challenges.',

    'Project Leadership, Coordination and Operational Management':
      'We will provide the operational backbone of the project through strong leadership and structured coordination. We will handle detailed work planning, resource allocation, partner capacity assessment, logistics coordination for all transnational activities, and systematic progress reporting. The project leader will maintain an operational dashboard, chair monthly coordination calls, and produce consolidated reports for the funding agency.',

    // Research / Mapping / Diagnosis
    'Research, Mapping and Needs Analysis':
      'We will conduct a comprehensive research and mapping exercise to understand the current landscape, identify existing gaps, and establish a solid evidence base for the project. We will collect and analyse quantitative and qualitative data from all partner countries through desk research, surveys, interviews with key stakeholders, and focus groups with target beneficiaries. We will map existing practices, policies, and resources relevant to the project topic, identify best practices and transferable models, and produce a comparative needs analysis report that will inform the design and implementation of all subsequent work packages.',

    'Context Analysis, Diagnosis and Stakeholder Mapping':
      'We will analyse the context in each partner country and map relevant stakeholders to build a comprehensive understanding of the environment in which the project operates. We will examine the policy landscape, institutional frameworks, and local conditions through desk research and targeted consultations. We will identify and engage key stakeholders — practitioners, policy-makers, beneficiaries, and multipliers — creating a stakeholder map with engagement strategies. The diagnosis will produce a structured report highlighting common challenges, country-specific needs, and actionable recommendations that will guide the design of the project methodology and activities.',

    'Needs Assessment and Baseline Research':
      'We will carry out a structured needs assessment and baseline study to establish the starting point for measuring project impact. We will design and distribute surveys, conduct interviews and focus groups, and review existing literature and data sources in each partner country. The baseline research will measure current knowledge levels, skills, attitudes, and practices among target groups, and identify specific gaps that the project will address. We will produce a baseline report with clear indicators and benchmarks against which progress and impact will be measured throughout and after the project.',

    'Territorial Mapping and Contextual Diagnosis':
      'We will map the territorial and institutional context in each partner region to understand local dynamics, resources, and barriers. We will conduct field visits, stakeholder interviews, and community consultations alongside desk research on regional policies and programmes. We will identify territorial assets, social infrastructure, and existing networks that can support the project, as well as structural challenges and underserved areas. The resulting territorial diagnosis will provide a differentiated, place-based foundation for tailoring project activities to the specific realities of each partner context.',

    // Methodology / Framework Development
    'Methodology and Educational Framework Development':
      'We will design the overarching methodology and educational framework that will guide all project activities. We will draw on the findings from the research phase, review relevant pedagogical theories and best practices, and co-create with partners and stakeholders a coherent methodological approach adapted to the needs of target groups. The framework will define learning objectives, competence profiles, pedagogical principles, and assessment criteria. We will produce a comprehensive methodology guide that all partners will use to ensure consistency and quality across all implementation activities.',

    'Pedagogical Framework and Intervention Design':
      'We will develop a pedagogical framework and design the specific interventions that form the core of the project. Building on the needs analysis, we will define learning outcomes, select appropriate pedagogical approaches (non-formal education, experiential learning, peer learning), and design structured intervention protocols. We will co-design activities with practitioners and target groups to ensure relevance and accessibility. The framework will include facilitation guides, session plans, and quality standards, providing a clear and replicable blueprint for implementation across all partner countries.',

    'Conceptual Model and Methodological Design':
      'We will develop the conceptual model underpinning the project and translate it into a practical methodological design. We will synthesise theoretical foundations, empirical findings from the research phase, and practitioner expertise to build an innovative and coherent model. The methodological design will specify the phases of intervention, roles and responsibilities, tools and instruments, and quality assurance mechanisms. We will validate the model through expert review and stakeholder feedback before piloting, ensuring it is robust, adaptable, and aligned with the project objectives.',

    'Project Methodology and Learning Framework':
      'We will create the project methodology and learning framework that integrates all educational and operational components. We will define the pedagogical approach, learning pathways, competence development stages, and assessment methods. The framework will address diverse learning styles and needs, incorporate digital tools and blended learning strategies, and include guidelines for inclusive and accessible delivery. We will produce a methodology handbook for trainers and facilitators, and organise a capacity-building session to ensure all partners can implement the framework effectively.',

    // Content / Tools / Training Resources
    'Content Development and Training Resources':
      'We will develop the educational content and training resources needed to implement the project methodology. We will create curriculum modules, training manuals, facilitator guides, participant workbooks, and multimedia learning materials. All content will be designed following the pedagogical framework, ensuring alignment with learning objectives and competence profiles. We will involve practitioners and target groups in content co-creation and review cycles. Materials will be produced in multiple languages and formats (print, digital, interactive) to ensure accessibility and broad reach.',

    'Educational Materials, Tools and Learning Resources':
      'We will design and produce a comprehensive set of educational materials, practical tools, and learning resources. We will develop toolkits, handbooks, interactive digital resources, video tutorials, and assessment instruments based on the project methodology. All materials will be tested with sample groups from partner countries and refined based on feedback. We will ensure materials are inclusive, culturally sensitive, and available in accessible formats. The complete resource package will be published under open-access licence to maximise reuse and sustainability.',

    'Toolkit and Capacity Building Resources Development':
      'We will produce a practical toolkit and capacity building resources designed for practitioners, trainers, and organisations working with the target groups. The toolkit will include step-by-step implementation guides, training session templates, evaluation instruments, case studies, and ready-to-use facilitation materials. We will conduct capacity building workshops with partners to ensure they can effectively use and adapt the toolkit. All resources will be designed for easy replication and will be made available as an open-access digital toolkit with downloadable and editable formats.',

    'Training Content and Practical Tools Production':
      'We will create training content and practical tools that translate the project methodology into concrete, usable resources. We will develop structured training programmes, practical exercises, real-world case studies, simulation activities, and digital learning modules. Each tool will include clear instructions, time allocations, material requirements, and facilitation tips. We will pilot all training content during the implementation phase and incorporate feedback for final refinement. The complete set of tools will be published on the project platform for free access and download.',

    // Pilot / Implementation / Validation
    'Pilot Implementation and Validation':
      'We will pilot the project methodology, tools, and training resources in real-world settings across all partner countries. We will organise pilot activities with target groups, applying the developed framework and materials under controlled conditions. We will collect systematic feedback from participants, facilitators, and stakeholders using structured evaluation instruments. The pilot results will be analysed to identify strengths, weaknesses, and areas for improvement. We will validate the approach through cross-partner comparison and produce a validation report with evidence-based recommendations for scaling and mainstreaming.',

    'Testing, Implementation and Evaluation of the Model':
      'We will test and implement the project model in each partner context and evaluate its effectiveness through rigorous assessment. We will conduct structured pilot actions following the methodology guide, track participation and engagement metrics, and collect qualitative and quantitative data on learning outcomes and behavioural change. We will organise peer observation visits between partners to exchange implementation insights. The evaluation will combine formative assessment (during implementation) and summative assessment (post-implementation), producing a comprehensive evaluation report with recommendations for model refinement.',

    'Pilot Actions, Field Testing and Validation':
      'We will carry out pilot actions and field testing of all project outputs in diverse real-world contexts across partner countries. We will recruit and engage target group participants, implement the designed activities and training programmes, and systematically collect data on process quality, participant satisfaction, and learning outcomes. We will organise feedback sessions and validation workshops with participants and stakeholders to assess relevance, quality, and impact. The field testing results will directly inform the final revision of all project outputs before their wider dissemination.',

    'Practical Implementation and Methodology Validation':
      'We will implement the project activities in practice and validate the methodology through evidence-based assessment. We will deliver the training programmes, workshops, and other planned activities with target groups in each partner country, following the methodological framework developed in the previous phase. We will monitor implementation quality through observation protocols, participant diaries, and facilitator reports. Validation will be based on triangulated data from multiple sources, ensuring the methodology is effective, replicable, and adaptable to different national and institutional contexts.',

    // LAST WP titles
    'Dissemination, Evaluation and Sustainability':
      'We will design and execute a comprehensive dissemination strategy using the project website, social media campaigns, publications, and multiplier events to reach the widest possible audience. We will implement an internal and external evaluation framework with quantitative and qualitative indicators to measure real impact. We will develop a detailed sustainability plan that identifies concrete pathways — institutional commitments, licensing, open-access publication — for the continuation, transfer, and scaling of results after the funding period ends.',

    'Impact, Dissemination and Sustainability':
      'We will maximise the societal and institutional impact of the project through targeted dissemination and long-term sustainability planning. We will map key stakeholders for each dissemination channel, produce policy briefs and practice guidelines, organise multiplier events in each partner country, and develop a sustainability roadmap with concrete institutional commitments. We will measure impact using quantitative and qualitative indicators aligned with the programme objectives.',

    'Dissemination, Exploitation and Sustainability of Results':
      'We will make all project results accessible, usable, and long-lasting. We will create an exploitation plan for each intellectual output, publish materials under open-access licences, run targeted dissemination campaigns for policy-makers, practitioners, and end-users, and negotiate institutional commitments with each partner to sustain and update results after the funding concludes. Every output will include clear usage guidelines and sustainability provisions.',

    'Communication, Dissemination and Impact Maximisation':
      'We will develop a multi-channel communication strategy to maximise visibility, engagement, and impact. We will create a project brand identity, produce digital content (videos, infographics, social media campaigns), manage press relations, present at conferences, and run targeted outreach to underrepresented communities. All partners will act as dissemination ambassadors within their national networks. We will track communication KPIs monthly and adjust our strategy based on performance data.',

    'Evaluation, Quality Assurance and Dissemination':
      'We will combine continuous quality assurance with a robust evaluation methodology and strategic dissemination. We will design internal quality standards for all deliverables, conduct formative and summative evaluation using mixed methods (surveys, interviews, focus groups, analytics), produce an evaluation report with actionable recommendations, and disseminate both process and outcome findings to relevant stakeholders through targeted channels.',

    'Impact, Evaluation and Long-term Sustainability':
      'We will assess the real-world impact of the project and establish the conditions for its long-term sustainability. We will conduct baseline and endline studies, implement beneficiary feedback loops, commission an independent external evaluation, develop exploitation agreements among partners, and produce a detailed sustainability plan with financial, institutional, and technical provisions for the post-project period. All evaluation data will be published transparently.',
  };

  /* ── Helpers ────────────────────────────────────────────────── */
  const euros = n => '€' + Math.round(n).toLocaleString('es-ES');
  const pct   = (n, t) => t > 0 ? (n / t * 100).toFixed(1) + '%' : '0%';
  const $ = id => document.getElementById(id);
  const debounce = (fn, ms = 1500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function getCountryZoneLabel(country) {
    const zone = getCountryZone(country);
    return 'Zone ' + zone;
  }
  function getStaffRatesForCountry(country) {
    const zone = getCountryZone(country);
    return REF_STAFF_CATEGORIES.map(cat => ({
      code: cat.code,
      label: cat.name_es || cat.name_en,
      rate: cat.zones[zone] ? Number(cat.zones[zone].rate_day) : 100
    }));
  }
  function getPerdiemRef(country) {
    const zone = getCountryZone(country);
    return PERDIEM_DEFAULTS[zone] ? { ...PERDIEM_DEFAULTS[zone] } : { aloj:84, mant:56 };
  }
  function getPartnerPerdiem(pid) { return state.partnerRates[pid] || { aloj:105, mant:40 }; }
  function getPartnerPerdiemTotal(pid) { const r = getPartnerPerdiem(pid); return (r.aloj||0) + (r.mant||0); }
  function getBand(km) { return DISTANCE_BANDS.find(b => km >= b.min && km <= b.max) || DISTANCE_BANDS[0]; }
  function routeKey(a, b) { return a < b ? a + '_' + b : b + '_' + a; }

  /* ── Haversine — distancia geodésica en km (gran círculo)
     E+ Distance Calculator usa exactamente esta fórmula, no carretera. */
  function haversineKm(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const R = 6371; // radio terrestre km
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }
  function partnerCoords(pid) {
    const p = state.partners.find(x => x.id === pid);
    if (!p || p.lat == null || p.lng == null) return null;
    return { lat: Number(p.lat), lng: Number(p.lng) };
  }
  function autoKmBetween(aId, bId) {
    const a = partnerCoords(aId), b = partnerCoords(bId);
    if (!a || !b) return null;
    return haversineKm(a.lat, a.lng, b.lat, b.lng);
  }
  function getRoute(a, b) {
    const k = routeKey(a, b);
    if (!state.routes[k]) {
      // Auto-create with default band (2000-2999km eco)
      const defBand = DISTANCE_BANDS[4];
      state.routes[k] = { km: 2500, green: true, custom_rate: defBand.green };
    }
    return state.routes[k];
  }
  function getRouteCost(a, b) {
    const r = getRoute(a, b);
    return (r.custom_rate !== null && r.custom_rate !== undefined && r.custom_rate !== '') ? parseFloat(r.custom_rate)||0 : (r.green ? getBand(r.km).green : getBand(r.km).std);
  }
  function getWorkerRateDefault() {
    if (state.workerRates.length > 0) return Math.round(state.workerRates.reduce((s,w)=>s+w.rate,0)/state.workerRates.length);
    return 140;
  }
  function getPartnerDayRate(pid, profileId) {
    const rates = state.workerRates.filter(w => w.pid === pid);
    if (profileId) { const r = rates.find(w => String(w.id) === String(profileId)); if (r) return r.rate; }
    if (rates.length > 0) return Math.round(rates.reduce((s,w)=>s+w.rate,0)/rates.length);
    return getWorkerRateDefault();
  }
  // Stable deterministic workerRate id — survives reloads.
  // Two categories with same name for same partner would collide; addWorkerRate handles that.
  function wrId(pid, category) { return pid + '::' + category; }
  function getFinancials(actualTotal) {
    const p = state.project;
    if (!p) return { maxGrant:500000, euGrant:0, cofinPct:80, totalProject:0, ownFunds:0, indirectPct:7 };
    const maxGrant = p.eu_grant || 500000;
    const cofinPct = p.cofin_pct || 80;
    const indirectPct = p.indirect_pct || 7;
    // Calculate EU grant as cofinPct% of actual budget, capped at max grant
    const total = actualTotal || 0;
    const euGrant = Math.min(Math.round(total * cofinPct / 100), maxGrant);
    const ownFunds = total - euGrant;
    const totalProject = maxGrant / (cofinPct / 100); // target total
    return { maxGrant, euGrant, cofinPct, totalProject, ownFunds, indirectPct };
  }
  function applyIndirectCosts(direct) {
    const { indirectPct } = getFinancials();
    const indirect = direct * (indirectPct / 100);
    return { directCosts: direct, indirect, total: direct + indirect };
  }
  function wpLabel(wp, idx) { return `WP${idx+1} · ${wp.desc || wp.name || 'Sin título'}`; }

  function getProjectStart() {
    return state.project?.start_date ? new Date(state.project.start_date) : null;
  }
  function getProjectMonths() { return state.project?.duration_months || 24; }
  function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth()+n); return r; }
  function toISO(d) { return d ? d.toISOString().split('T')[0] : ''; }
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
  }
  function calcDepreciation(np) { return (parseFloat(np.amount)||0) * ((parseFloat(np.project_pct)||100)/100) * ((parseFloat(np.lifetime_pct)||100)/100); }

  /* ── Save indicator ─────────────────────────────────────────── */
  function showSave(status) {
    const el = $('calc-save-indicator');
    if (!el) return;
    el.className = 'calc-save ' + status;
    el.textContent = status === 'saving' ? 'Guardando...' : status === 'saved' ? 'Guardado' : 'Error al guardar';
    if (status === 'saved') setTimeout(() => el.classList.add('hidden'), 2000);
  }

  /* ══════════════════════════════════════════════════════════════
     INIT & PROJECT SELECTOR
     ══════════════════════════════════════════════════════════════ */

  function init() {
    if (currentProjectId && currentStep >= 0) {
      // Already loaded, just re-render current step
      return;
    }
    renderProjectSelector();
  }

  async function renderProjectSelector() {
    currentStep = -1;
    const root = $('calc-root');
    root.innerHTML = `
      <div class="mb-6">
        <h1 class="font-headline text-2xl font-bold text-on-surface tracking-tight">Budget Calculator</h1>
        <p class="text-on-surface-variant text-sm mt-1">Select a project to start building its budget.</p>
      </div>
      <div id="calc-projects-list" class="space-y-3">
        <div class="text-center py-12 text-on-surface-variant"><span class="spinner"></span></div>
      </div>`;

    try {
      const projects = await API.get('/intake/projects') || [];
      const list = $('calc-projects-list');

      if (!projects.length) {
        list.innerHTML = `
          <div class="text-center py-16">
            <span class="material-symbols-outlined text-5xl text-outline-variant mb-3">folder_off</span>
            <p class="text-on-surface-variant mb-4">No projects yet. Create one in Intake first.</p>
            <button onclick="App.navigate('intake',true,true)" class="px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-container transition-colors">
              <span class="material-symbols-outlined text-[16px] align-middle mr-1">add_circle</span>
              New Project
            </button>
          </div>`;
        return;
      }

      list.innerHTML = projects.map(p => {
        const typeLabel = p.type || 'No type';
        const partnerCount = p.partner_count || '?';
        return `
        <div class="flex items-center gap-4 p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
             onclick="Calculator._loadProject('${p.id}')">
          <div class="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-content-center shrink-0">
            <span class="material-symbols-outlined text-primary text-xl m-auto">calculate</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-headline font-bold text-on-surface truncate group-hover:text-primary transition-colors">${p.name || 'Untitled'}</div>
            <div class="text-xs text-on-surface-variant mt-0.5 flex items-center gap-3 flex-wrap">
              <span>${typeLabel}</span>
              <span>·</span>
              <span>${p.duration_months || '?'} months</span>
              <span>·</span>
              <span>${euros(p.eu_grant || 0)}</span>
            </div>
          </div>
          <span class="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">arrow_forward</span>
        </div>`;
      }).join('');
    } catch (e) {
      $('calc-projects-list').innerHTML = `<div class="text-center py-8 text-error">${e.message || 'Error loading projects'}</div>`;
    }
  }

  async function loadProject(projectId) {
    console.log('[Calc] loadProject called with:', projectId);
    currentProjectId = projectId;
    const root = $('calc-root');
    root.innerHTML = `<div class="text-center py-16"><span class="spinner"></span><p class="text-on-surface-variant text-sm mt-3">Loading project...</p></div>`;

    try {
      const [projRes, partnersRes] = await Promise.all([
        API.get(`/intake/projects/${projectId}`),
        API.get(`/intake/projects/${projectId}/partners`),
        loadRefRates(),
      ]);
      console.log('[Calc] projRes:', projRes);
      console.log('[Calc] partnersRes:', partnersRes);
      state.project = projRes;
      state.partners = (partnersRes || []).sort((a,b) => a.order_index - b.order_index);

      // Init rates from partner countries (using Data E+ reference rates)
      state.partnerRates = {};
      state.workerRates = [];
      state.wrCounter = 0;
      state.partners.forEach(p => {
        state.partnerRates[p.id] = getPerdiemRef(p.country);
        const staffRates = getStaffRatesForCountry(p.country);
        staffRates.forEach(sr => {
          state.workerRates.push({ id: wrId(p.id, sr.label), pid: p.id, category: sr.label, rate: sr.rate });
        });
      });

      // Init routes — auto-derive km vía Haversine si ambos partners tienen lat/lng,
      // si no, fallback al default 2000-2999km band con eco
      state.routes = {};
      const defaultBand = DISTANCE_BANDS[4]; // 2000-2999 km
      const defaultKm = Math.round((defaultBand.min + defaultBand.max) / 2);
      for (let i = 0; i < state.partners.length; i++) {
        for (let j = i + 1; j < state.partners.length; j++) {
          const aId = state.partners[i].id, bId = state.partners[j].id;
          const km = autoKmBetween(aId, bId);
          const useKm = km != null ? km : defaultKm;
          const band = getBand(useKm);
          state.routes[routeKey(aId, bId)] = {
            km: useKm,
            green: true,
            custom_rate: band.green,
            auto: km != null, // marca para mostrar el badge "auto"
          };
        }
      }

      // Init WPs
      state.wps = [];
      state.actCounter = 0;
      syncWPCount(4);

      maxReached = 0;
      renderShell();
      goToStep(0);
    } catch (e) {
      console.error('[Calc] loadProject error:', e);
      root.innerHTML = `<div class="text-center py-12 text-error">Error: ${e.message || JSON.stringify(e)}</div>`;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     SHELL & NAVIGATION
     ══════════════════════════════════════════════════════════════ */

  const STEP_LABELS = ['Rates','Routes','Work Packages','Activities','Budget','Gantt'];

  function renderShell() {
    const p = state.project;
    const root = $('calc-root');
    root.innerHTML = `
      <div class="flex items-center gap-3 mb-1">
        <button onclick="Calculator._backToSelector()" class="text-on-surface-variant hover:text-primary transition-colors" title="Back to projects">
          <span class="material-symbols-outlined text-xl">arrow_back</span>
        </button>
        <div class="flex-1 min-w-0">
          <h1 class="font-headline text-xl font-bold text-on-surface tracking-tight truncate">${p.name || 'Project'}</h1>
          <p class="text-xs text-on-surface-variant">${p.type || ''} · ${state.partners.length} partners · ${p.duration_months || 24} months · ${euros(p.eu_grant || 0)}</p>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="flex items-center gap-1 my-5 px-2" id="calc-progress">
        ${STEP_LABELS.map((label, i) => `
          <button class="flex flex-col items-center gap-1 group" onclick="Calculator._goTo(${i})" id="calc-prog-${i}">
            <div class="calc-prog-dot ${i === 0 ? 'active' : 'locked'}">${i+1}</div>
            <span class="calc-prog-label text-[10px] font-semibold text-on-surface-variant group-hover:text-primary transition-colors">${label}</span>
          </button>
          ${i < STEP_LABELS.length - 1 ? '<div class="calc-prog-line"></div>' : ''}
        `).join('')}
      </div>

      <!-- Step container -->
      <div id="calc-step-container"></div>

      <!-- Save indicator -->
      <div id="calc-save-indicator" class="calc-save hidden"></div>
    `;
  }

  function goToStep(n) {
    if (n > maxReached + 1) return;
    if (n > maxReached) maxReached = n;
    currentStep = n;

    // Update progress dots
    STEP_LABELS.forEach((_, i) => {
      const dot = document.querySelector(`#calc-prog-${i} .calc-prog-dot`);
      if (!dot) return;
      dot.classList.remove('active','done','locked');
      if (i === n) dot.classList.add('active');
      else if (i < n) dot.classList.add('done');
      else if (i <= maxReached) { /* clickable but not styled */ }
      else dot.classList.add('locked');
    });
    document.querySelectorAll('.calc-prog-line').forEach((line, i) => {
      line.classList.toggle('done', i < n);
    });

    // Render step content
    const container = $('calc-step-container');
    if (!container) return; // embedded mode — navigation handled by Intake
    switch(n) {
      case 0: renderRates(container); break;
      case 1: renderRoutes(container); break;
      case 2: renderWorkPackages(container); break;
      case 3: renderActivities(container); break;
      case 4: renderResults(container); break;
      case 5: renderGantt(container); break;
    }
    window.scrollTo(0, 0);
  }

  function navButtons(prev, next, nextLabel) {
    return `<div class="flex justify-between mt-6">
      ${prev !== null ? `<button onclick="Calculator._goTo(${prev})" class="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface border border-outline-variant rounded-lg transition-colors">← Back</button>` : '<span></span>'}
      ${next !== null ? `<button onclick="Calculator._goTo(${next})" class="px-5 py-2.5 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary-container transition-colors">${nextLabel || 'Next →'}</button>` : ''}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 0: RATES
     ══════════════════════════════════════════════════════════════ */

  function renderRates(container) {
    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Routes, Costs & Rates</h2>
      <p class="text-sm text-on-surface-variant mb-5">Define travel routes and distances between partners. Per diem and staff rates are auto-filled from Erasmus+ tables.</p>

      ${buildRoutesSection()}

      <!-- Note: European reference rates -->
      <div class="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <span class="material-symbols-outlined text-amber-600 text-xl mt-0.5">info</span>
        <div>
          <p class="text-sm font-semibold text-amber-900 mb-1">European reference rates</p>
          <p class="text-xs text-amber-800">The following amounts (Per Diem and Worker Rates) are pre-configured based on standard Erasmus+ rates for each country group. You should keep these values unless you have a specific reason to change them.</p>
        </div>
      </div>

      <!-- Per diem -->
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 mb-4">
        <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">hotel</span> Per Diem Rates
        </h3>
        <div class="overflow-x-auto">
          <table class="calc-table">
            <thead><tr>
              <th class="text-left">Partner</th>
              <th class="text-left">Group</th>
              <th class="text-right">Accommodation €/day</th>
              <th class="text-right">Subsistence €/day</th>
              <th class="text-right">Total/day</th>
            </tr></thead>
            <tbody>
              ${state.partners.map((p, i) => {
                const r = state.partnerRates[p.id] || getPerdiemRef(p.country);
                const zLabel = getCountryZoneLabel(p.country);
                const total = (r.aloj||0) + (r.mant||0);
                const c = WP_COLORS[i % WP_COLORS.length];
                return `<tr>
                  <td>
                    <div class="flex items-center gap-2">
                      <span class="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style="background:${c}">${i+1}</span>
                      <div>
                        <div class="font-semibold text-sm">${p.name || 'Partner '+(i+1)}</div>
                        <div class="text-[11px] text-on-surface-variant">${p.country || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="text-[11px] bg-surface-container-high px-2 py-0.5 rounded-full">${zLabel}</span></td>
                  <td class="text-right"><input type="number" value="${r.aloj}" min="0" onchange="Calculator._setPerdiem('${p.id}','aloj',this.value)"></td>
                  <td class="text-right"><input type="number" value="${r.mant}" min="0" onchange="Calculator._setPerdiem('${p.id}','mant',this.value)"></td>
                  <td class="text-right font-bold" style="color:${c}" id="calc-pd-total-${p.id}">${euros(total)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Worker rates -->
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 mb-4">
        <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">badge</span> Worker Rates (€/day)
        </h3>
        <div id="calc-worker-rates">${buildWorkerRatesHTML()}</div>
      </div>

      ${_embeddedMode ? embeddedNavButtons(0, 2, 'Work Packages \u2192') : navButtons(null, 1, 'Work Packages \u2192')}
    `;
  }

  function buildWorkerRatesHTML() {
    return state.partners.map((p, pi) => {
      const rates = state.workerRates.filter(w => w.pid === p.id);
      const zoneLabel = getCountryZoneLabel(p.country);
      const c = WP_COLORS[pi % WP_COLORS.length];
      return `
      <div class="border border-outline-variant/20 rounded-lg mb-3 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/10" style="background:${WP_BG[pi % WP_BG.length]}">
          <span class="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style="background:${c}">${pi+1}</span>
          <span class="font-semibold text-sm" style="color:${c}">${p.name || 'Partner '+(pi+1)}</span>
          <span class="text-xs text-on-surface-variant ml-1">${zoneLabel}</span>
        </div>
        <table class="calc-table">
          <tbody>
            ${rates.map(w => { const idJs = String(w.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); return `<tr>
              <td class="w-5/12"><input type="text" value="${w.category}" class="w-full px-2 py-1 text-sm border border-outline-variant/30 rounded" onchange="Calculator._setWorkerRate('${idJs}','category',this.value)"></td>
              <td class="text-right"><input type="number" value="${w.rate}" min="0" onchange="Calculator._setWorkerRate('${idJs}','rate',this.value)"><span class="text-[11px] text-on-surface-variant ml-1">\u20AC/day</span></td>
              <td class="text-right"><span class="text-sm font-bold text-primary/70">\u20AC${(w.rate * 22).toLocaleString('en')}</span><span class="text-[10px] text-on-surface-variant/50 ml-1">/PM</span></td>
              <td class="w-8 text-center"><button onclick="Calculator._removeWorkerRate('${idJs}')" class="text-error hover:text-error-container text-lg leading-none">&times;</button></td>
            </tr>`; }).join('')}
          </tbody>
        </table>
        <div class="px-3 py-2 bg-surface-container">
          <button onclick="Calculator._addWorkerRate('${p.id}')" class="text-xs font-semibold text-primary hover:underline">+ Add profile</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 1: ROUTES
     ══════════════════════════════════════════════════════════════ */

  function routeLabel(p) {
    const acronym = (p.name || '').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 5);
    const loc = [p.city, p.country].filter(Boolean).join(', ');
    return `<span class="font-mono font-bold text-xs text-primary">${acronym}</span> <span class="text-xs text-on-surface-variant">${loc}</span>`;
  }

  function routeRowHTML(aId, aLabel, bId, bLabel) {
    const k = routeKey(aId, bId);
    const r = getRoute(aId, bId);
    const bandIdx = DISTANCE_BANDS.findIndex(bd => r.km >= bd.min && r.km <= bd.max);
    const selIdx = bandIdx >= 0 ? bandIdx : 0;
    const band = DISTANCE_BANDS[selIdx];
    const official = r.green ? band.green : band.std;
    const custom = (r.custom_rate !== null && r.custom_rate !== undefined) ? r.custom_rate : '';
    const autoKm = autoKmBetween(aId, bId);
    const autoBadge = autoKm != null
      ? `<button title="Recalcular distancia desde coordenadas (${autoKm} km)" onclick="Calculator._autoRoute('${aId}','${bId}')" class="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${r.auto ? 'bg-secondary-fixed text-primary' : 'bg-outline-variant/30 text-on-surface-variant hover:bg-secondary-fixed hover:text-primary'}">⌖ ${autoKm}km</button>`
      : '';
    return `<tr>
      <td>${aLabel} <span class="text-on-surface-variant mx-1">↔</span> ${bLabel}${autoBadge}</td>
      <td class="text-center">
        <label class="flex items-center justify-center gap-1 cursor-pointer">
          <input type="checkbox" ${r.green?'checked':''} class="w-3.5 h-3.5" onchange="Calculator._setRoute('${aId}','${bId}','green',this.checked)">
          <span class="text-[10px] text-[#065F46] font-semibold">Eco</span>
        </label>
      </td>
      <td>
        <select class="text-xs px-2 py-1 border border-outline-variant/30 rounded" onchange="Calculator._setRouteBand('${aId}','${bId}',parseInt(this.value))">
          ${DISTANCE_BANDS.map((bd,idx) => `<option value="${idx}" ${idx===selIdx?'selected':''}>${bd.label}</option>`).join('')}
        </select>
      </td>
      <td class="text-right text-sm text-on-surface-variant" id="calc-route-off-${k}">€${official}</td>
      <td class="text-right"><input type="number" value="${custom}" min="0" placeholder="—" class="w-24" onchange="Calculator._setRoute('${aId}','${bId}','custom_rate',this.value)" id="calc-route-custom-${k}"></td>
    </tr>`;
  }

  function buildRoutesSection() {
    // Auto-fix routes with km=0 to default band (2000-2999km eco)
    const defBand = DISTANCE_BANDS[4];
    const defKm = Math.round((defBand.min + defBand.max) / 2);
    Object.keys(state.routes).forEach(k => {
      const r = state.routes[k];
      if (!r.km || r.km === 0) {
        r.km = defKm;
        r.green = true;
        r.custom_rate = defBand.green;
      }
    });

    const partners = state.partners;
    const pairs = [];
    for (let i = 0; i < partners.length; i++)
      for (let j = i+1; j < partners.length; j++)
        pairs.push([partners[i], partners[j]]);

    // Extra destination routes: each partner ↔ each extra dest
    const extraRows = [];
    for (const p of partners) {
      for (const d of state.extraDests) {
        const dLabel = `<span class="font-mono font-bold text-xs text-amber-700">${(d.name||'').split(/[\s(]/)[0].toUpperCase().slice(0,5)}</span> <span class="text-xs text-on-surface-variant">${[d.name, d.country].filter(Boolean).join(', ')}</span>`;
        extraRows.push(routeRowHTML(p.id, routeLabel(p), d.id, dLabel));
      }
    }

    // No auto-creation of empty slots — user adds them via button

    return `
      <!-- Routes & Distances -->
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 mb-4">
        <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">route</span> Routes & Distances
        </h3>
        <p class="text-xs text-on-surface-variant mb-3">Set distance bands between partners. Use the <a href="https://erasmus-plus.ec.europa.eu/resources-and-tools/distance-calculator" target="_blank" class="text-primary font-semibold hover:underline">EC distance calculator ↗</a>.</p>
        <div class="overflow-x-auto">
          <table class="calc-table">
            <thead><tr>
              <th class="text-left">Route</th>
              <th class="text-center">Eco</th>
              <th>Distance Band</th>
              <th class="text-right">Official</th>
              <th class="text-right">Actual €</th>
            </tr></thead>
            <tbody>
              ${pairs.map(([a, b]) => routeRowHTML(a.id, routeLabel(a), b.id, routeLabel(b))).join('')}
              ${extraRows.length ? `<tr><td colspan="5" class="pt-4 pb-2"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Otros destinos</span></td></tr>` + extraRows.join('') : ''}
            </tbody>
          </table>
        </div>
        <p class="text-[11px] text-on-surface-variant mt-3">The <strong>Actual €</strong> amount is used in calculations. If left blank, the official rate applies.</p>
      </div>

      <!-- Extra destinations -->
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 mb-4">
        <h3 class="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="material-symbols-outlined text-[16px]">add_location</span> Otros destinos
        </h3>
        <p class="text-xs text-on-surface-variant mb-3">Añade ciudades o sedes que no son socios pero donde se realizarán actividades (ej. Bruselas, sede de la agencia, etc.).</p>
        <div id="calc-extra-dests">
          ${state.extraDests.map((d, i) => `
            <div class="flex items-center gap-2 mb-2" data-ed-idx="${i}">
              <input type="text" value="${esc(d.name)}" placeholder="City (e.g. Brussels)" class="flex-1 px-3 py-2 rounded-lg border border-outline-variant text-sm" oninput="Calculator._setExtraDest(${i},'name',this.value)" onblur="Calculator._refreshRoutes()">
              <input type="text" value="${esc(d.country || '')}" placeholder="Country (e.g. Belgium)" class="w-36 px-3 py-2 rounded-lg border border-outline-variant text-sm" oninput="Calculator._setExtraDest(${i},'country',this.value)" onblur="Calculator._refreshRoutes()">
              <button onclick="Calculator._removeExtraDest(${i})" class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors">
                <span class="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          `).join('')}
        </div>
        <button onclick="Calculator._addExtraDest()" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/5 transition-colors mt-1">
          <span class="material-symbols-outlined text-sm">add</span> Añadir destino
        </button>
      </div>
    `;
  }

  function renderRoutes(container) {
    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Per diem, Worker Rates & Routes</h2>
      <p class="text-sm text-on-surface-variant mb-5">All cost parameters in one place.</p>
      ${buildRoutesSection()}
      ${navButtons(null, 1, 'Work Packages \u2192')}
    `;
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 2: WORK PACKAGES
     ══════════════════════════════════════════════════════════════ */

  function syncWPCount(n) {
    // If old last WP had a dissemination title, reset it (it's no longer last)
    if (state.wps.length > 1 && n > state.wps.length) {
      const oldLast = state.wps[state.wps.length - 1];
      if (LAST_WP_TITLES.includes(oldLast.name)) {
        oldLast.name = `WP${state.wps.length}`;
        oldLast.desc = '';
      }
    }
    while (state.wps.length < n) {
      const wi = state.wps.length;
      const defaultLeader = state.partners[wi]?.id || state.partners[0]?.id || null;
      let name = `WP${wi+1}`;
      if (wi === 0) name = WP1_TITLES[0];
      else if (wi === n-1 && n > 1) name = LAST_WP_TITLES[0];
      state.wps.push({ name, desc: '', summary: '', leader: defaultLeader, activities: [] });
    }
    state.wps = state.wps.slice(0, n);
    // Ensure last WP has a dissemination title if it was just assigned a generic name
    if (n > 1) {
      const last = state.wps[n - 1];
      if (last.name === `WP${n}` && !last._cat) {
        last.name = LAST_WP_TITLES[0];
      }
    }
  }

  function renderWorkPackages(container) {
    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Work Packages</h2>
      <p class="text-sm text-on-surface-variant mb-5">Define WP structure, titles and leaders.</p>

      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-semibold text-on-surface-variant">Number of WPs</label>
        <input type="number" id="calc-n-wps" value="${state.wps.length}" min="1" max="12" class="w-20 px-2 py-1.5 text-sm border border-outline-variant/30 rounded-lg text-center font-bold" onchange="Calculator._syncWPs(parseInt(this.value))">
      </div>

      <div id="calc-wp-list" class="space-y-3">${buildWPListHTML()}</div>

      ${navButtons(1, 3, 'Activities →')}
    `;
  }

  function buildWPListHTML() {
    const lastWi = state.wps.length - 1;
    return state.wps.map((wp, wi) => {
      const c = WP_COLORS[wi % WP_COLORS.length];
      const leaderOpts = state.partners.map(p => `<option value="${p.id}" ${p.id===wp.leader?'selected':''}>${p.name||'Partner '+p.order_index}</option>`).join('');

      const isFirst = wi === 0;
      const isLast  = wi === lastWi && state.wps.length > 1;
      const isMid   = !isFirst && !isLast;

      // Title selector: direct list for WP1 and last, category+title for middle
      let titleSelectHTML = '';
      if (isFirst) {
        const opts = WP1_TITLES.map(t => `<option value="${t}" ${t===wp.name?'selected':''}>${t}</option>`).join('');
        titleSelectHTML = `
          <div>
            <label class="text-[11px] font-semibold text-on-surface-variant uppercase">Title</label>
            <select class="text-xs w-full px-2 py-1.5 border border-outline-variant/30 rounded" onchange="Calculator._applyWPTitle(${wi},this.value)">${opts}</select>
          </div>`;
      } else if (isLast) {
        const opts = LAST_WP_TITLES.map(t => `<option value="${t}" ${t===wp.name?'selected':''}>${t}</option>`).join('');
        titleSelectHTML = `
          <div>
            <label class="text-[11px] font-semibold text-on-surface-variant uppercase">Title</label>
            <select class="text-xs w-full px-2 py-1.5 border border-outline-variant/30 rounded" onchange="Calculator._applyWPTitle(${wi},this.value)">${opts}</select>
          </div>`;
      } else {
        const catOpts = '<option value="">— Category —</option>' + WP_TAXONOMY.map(g => `<option value="${g.cat}" ${g.cat===wp._cat?'selected':''}>${g.cat}</option>`).join('');
        const titleOpts = wp._cat
          ? (WP_TAXONOMY.find(g=>g.cat===wp._cat)?.titles||[]).map(t => `<option value="${t}" ${t===wp.name?'selected':''}>${t}</option>`).join('')
          : '';
        titleSelectHTML = `
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[11px] font-semibold text-on-surface-variant uppercase">Category</label>
              <select class="text-xs w-full px-2 py-1.5 border border-outline-variant/30 rounded" onchange="Calculator._setWPCat(${wi},this.value)">${catOpts}</select>
            </div>
            <div>
              <label class="text-[11px] font-semibold text-on-surface-variant uppercase">Suggested title</label>
              <select class="text-xs w-full px-2 py-1.5 border border-outline-variant/30 rounded" ${!titleOpts?'disabled':''} onchange="Calculator._applyWPTitle(${wi},this.value)">
                <option value="">${wp._cat ? '— Pick title —' : '← Pick category'}</option>
                ${titleOpts}
              </select>
            </div>
          </div>`;
      }

      const summaryVal = (wp.summary || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return `
      <div class="border border-outline-variant/20 rounded-xl overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10" style="background:${WP_BG[wi%WP_BG.length]}">
          <span class="w-8 h-8 rounded-full text-white text-xs font-extrabold flex items-center justify-center shrink-0" style="background:${c}">WP${wi+1}</span>
          <span class="flex-1 font-headline font-bold text-sm" style="color:${c}">${wp.name || 'WP'+(wi+1)}</span>
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[11px] text-on-surface-variant">Leader:</span>
            <select class="text-xs px-1.5 py-1 border border-outline-variant/20 rounded font-medium" style="color:${c}" onchange="Calculator._setWP(${wi},'leader',this.value)">${leaderOpts}</select>
          </div>
        </div>
        <div class="p-4 bg-surface-container-lowest space-y-3">
          ${titleSelectHTML}
          <div>
            <label class="text-[11px] font-semibold text-on-surface-variant uppercase">Summary — what is this WP about?</label>
            <textarea rows="2" class="w-full mt-1 px-2.5 py-2 text-xs border border-outline-variant/30 rounded-lg resize-vertical leading-relaxed" placeholder="Briefly describe the purpose and main activities of this work package..." onchange="Calculator._setWP(${wi},'summary',this.value)" oninput="Calculator._setWP(${wi},'summary',this.value)">${summaryVal}</textarea>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 3: ACTIVITIES
     ══════════════════════════════════════════════════════════════ */

  function renderActivities(container) {
    // Ensure WP1 has mgmt
    if (state.wps[0] && state.wps[0].activities.length === 0) {
      state.wps[0].activities.push({
        id: ++state.actCounter, type:'mgmt', label:'Project Management',
        rate_applicant:500, rate_partner:250,
        desc: 'We will coordinate and manage all project operations throughout its full duration. We will handle internal communication between partners, financial oversight, progress monitoring against milestones, and quality assurance. The coordinator will organise regular online meetings and prepare interim and final reports. All partners will contribute to administrative tasks, reporting, and compliance with the grant agreement.',
        date_start: toISO(getProjectStart()), date_end: toISO(addMonths(getProjectStart()||new Date(), getProjectMonths()))
      });
    }

    const directTotal = state.wps.reduce((s, wp) => s + wp.activities.reduce((ss, a) => ss + calcActivity(a).total, 0), 0);
    const { total } = applyIndirectCosts(directTotal);
    const { totalProject } = getFinancials();
    const usePct = totalProject > 0 ? Math.min(total / totalProject * 100, 100).toFixed(1) : 0;
    const isOver = Math.round(totalProject - total) < 0;

    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Activities</h2>
      <p class="text-sm text-on-surface-variant mb-4">Add and configure activities for each Work Package.</p>

      <!-- Summary bar -->
      <div class="bg-primary text-white rounded-xl p-4 mb-5 flex items-center gap-5 flex-wrap">
        <div class="flex-1 min-w-[120px]">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Total calculated</div>
          <div class="font-headline text-2xl font-bold" id="calc-live-total">${euros(total)}</div>
        </div>
        <div class="min-w-[90px]">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Target</div>
          <div class="text-sm font-mono">${euros(totalProject)}</div>
        </div>
        <div class="min-w-[90px]">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Difference</div>
          <div class="text-sm font-mono" id="calc-live-diff">${euros(totalProject - total)}</div>
        </div>
        <div class="flex-[2] min-w-[150px]">
          <div class="text-[10px] opacity-40 mb-1">Budget usage</div>
          <div class="h-3 rounded-full bg-white/20 overflow-hidden">
            <div class="h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'} transition-all" id="calc-live-bar" style="width:${usePct}%"></div>
          </div>
        </div>
      </div>

      <div id="calc-wps-container">
        ${state.wps.map((wp, wi) => buildWPSection(wp, wi)).join('')}
      </div>

      ${navButtons(2, 4, 'Budget Summary →')}
    `;

    // Calculate all
    state.wps.forEach((_, wi) => recalcWP(wi));
  }

  const WP_SECTION_BG = ['rgba(29,78,216,.08)','rgba(180,83,9,.08)','rgba(124,58,237,.08)','rgba(15,118,110,.08)','rgba(190,24,93,.08)','rgba(6,95,70,.08)','rgba(154,52,18,.08)','rgba(30,64,175,.08)','rgba(107,33,168,.08)','rgba(14,116,144,.08)','rgba(77,124,15,.08)','rgba(127,29,29,.08)'];

  function buildWPTitleOpts(wi, wp) {
    const lastWi = state.wps.length - 1;
    const isFirst = wi === 0;
    const isLast  = wi === lastWi && state.wps.length > 1;
    const current = wp.name || '';
    if (isFirst) {
      return WP1_TITLES.map(t => `<option value="${t}" ${t===current?'selected':''}>${t}</option>`).join('');
    }
    if (isLast) {
      return LAST_WP_TITLES.map(t => `<option value="${t}" ${t===current?'selected':''}>${t}</option>`).join('');
    }
    let opts = '';
    for (const g of WP_TAXONOMY) {
      opts += `<optgroup label="${g.cat}">`;
      for (const t of g.titles) opts += `<option value="${t}" ${t===current?'selected':''}>${t}</option>`;
      opts += '</optgroup>';
    }
    return opts;
  }

  function buildWPTitleMenu(wi, wp) {
    const lastWi = state.wps.length - 1;
    const isFirst = wi === 0;
    const isLast  = wi === lastWi && state.wps.length > 1;
    const esc = t => t.replace(/'/g, "\\'");
    let items = '';
    if (isFirst) {
      items = WP1_TITLES.map(t => `<button type="button" class="wp-title-item" onclick="Calculator._applyWPTitle(${wi},'${esc(t)}');this.closest('.wp-title-menu').remove()">${t}</button>`).join('');
    } else if (isLast) {
      items = LAST_WP_TITLES.map(t => `<button type="button" class="wp-title-item" onclick="Calculator._applyWPTitle(${wi},'${esc(t)}');this.closest('.wp-title-menu').remove()">${t}</button>`).join('');
    } else {
      for (const g of WP_TAXONOMY) {
        items += `<div class="wp-title-group">${g.cat}</div>`;
        for (const t of g.titles) {
          items += `<button type="button" class="wp-title-item" onclick="Calculator._applyWPTitle(${wi},'${esc(t)}');this.closest('.wp-title-menu').remove()">${t}</button>`;
        }
      }
    }
    return items;
  }

  function buildWPSection(wp, wi) {
    const c = WP_COLORS[wi % WP_COLORS.length];
    const bg = WP_SECTION_BG[wi % WP_SECTION_BG.length];
    const titleOpts = buildWPTitleOpts(wi, wp);
    const leaderOpts = state.partners.map(p =>
      `<option value="${p.id}" ${wp.leader === p.id ? 'selected' : ''}>${p.name || 'Partner ' + (state.partners.indexOf(p)+1)}</option>`
    ).join('');
    const sumVal = (wp.summary || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Calculate textarea rows based on content length
    const sumRows = Math.max(3, Math.ceil((wp.summary || '').length / 90));
    return `
    <div class="calc-wp open" id="calc-wp-${wi}" style="--wp-color:${c};background:${bg};border-color:${c}30">
      <div class="calc-wp-head" onclick="Calculator._toggleWP(${wi})" style="background:${c}18">
        <span class="w-9 h-9 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center shrink-0" style="background:${c}">WP${wi+1}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1" onclick="event.stopPropagation()">
            <input type="text" value="${(wp.name||'WP'+(wi+1)).replace(/"/g,'&quot;')}" class="font-headline text-sm font-bold text-on-surface bg-transparent border-none focus:outline-none flex-1 min-w-0 px-0" onchange="Calculator._setWPName(${wi},this.value)" onkeydown="if(event.key==='Enter')this.blur()">
            <div class="relative shrink-0">
              <button type="button" class="w-6 h-6 rounded flex items-center justify-center hover:bg-white/40 transition-colors" onclick="event.stopPropagation();Calculator._showWPTitleMenu(${wi},this)" title="Suggested titles">
                <span class="material-symbols-outlined text-base" style="color:${c}">expand_more</span>
              </button>
            </div>
          </div>
        </div>
        <span class="text-sm font-mono font-bold" style="color:${c}" id="calc-wp-total-${wi}">\u2014</span>
        <span class="material-symbols-outlined calc-wp-chevron">expand_more</span>
      </div>
      <div class="px-4 py-3 border-b border-outline-variant/10" style="background:${c}10" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between mb-2">
          <label class="text-[11px] font-semibold uppercase tracking-wide" style="color:${c}">WP Summary</label>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-on-surface-variant font-semibold">Leader:</span>
            <select class="text-sm px-2.5 py-1.5 border border-outline-variant/20 rounded-lg bg-white font-semibold min-w-[140px]" style="color:${c}" onchange="Calculator._setWPLeader(${wi},this.value)">${leaderOpts}</select>
          </div>
        </div>
        <textarea rows="${sumRows}" class="w-full px-3 py-2.5 text-sm border rounded-lg leading-relaxed bg-white focus:ring-2 outline-none transition-all" style="border-color:${c}30;--tw-ring-color:${c}40;min-height:80px" placeholder="Briefly describe the purpose and main activities of this work package..." onchange="Calculator._setWP(${wi},'summary',this.value)" oninput="Calculator._setWP(${wi},'summary',this.value);this.style.height='auto';this.style.height=this.scrollHeight+'px'">${sumVal}</textarea>
      </div>
      <div class="calc-wp-body">
        <div id="calc-wp-acts-${wi}">
          ${wp.activities.map(a => buildActivityCard(a, wi)).join('')}
        </div>
        <div class="mt-3">
          <div class="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Add activity</div>
          <div class="calc-act-picker">
            ${Object.entries(ACT_TYPES).filter(([k]) => (k !== 'mgmt' && k !== 'meeting') || wi === 0).map(([k, v]) => `
              <button class="calc-act-pick" onclick="Calculator._addActivity(${wi},'${k}')">
                <span class="material-symbols-outlined text-base mb-1" style="color:${v.color}">${v.icon}</span>
                <span class="block text-xs font-semibold text-on-surface">${v.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  function buildActivityCard(act, wi) {
    const def = ACT_TYPES[act.type];
    const subtypes = def.subtypes || [];
    const subtypeSelect = subtypes.length > 0 ? `
      <select class="text-xs px-2 py-1 rounded-lg border border-outline-variant/30 bg-white focus:outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer" style="color:${def.color}" onchange="Calculator._setActSubtype(${wi},${act.id},this.value)">
        <option value="" ${!act.subtype ? 'selected' : ''}>Select type...</option>
        ${subtypes.map(s => `<option value="${s}" ${act.subtype === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>` : '';
    return `
    <div class="calc-act" id="calc-act-${act.id}" style="--act-color:${def.color}">
      <div class="flex items-center gap-2 mb-2">
        <span class="calc-act-badge" style="background:${def.bg};color:${def.color}">
          <span class="material-symbols-outlined text-[12px] align-middle mr-0.5">${def.icon}</span> ${def.label}
        </span>
        ${subtypeSelect}
        <input type="text" value="${act.label}" placeholder="Name..." class="flex-1 bg-transparent border-b border-outline-variant/30 px-1 py-0.5 text-sm font-semibold font-headline focus:outline-none focus:border-primary" onchange="Calculator._setAct(${wi},${act.id},'label',this.value)">
        <button onclick="Calculator._moveAct(${wi},${act.id},-1)" class="text-on-surface-variant/40 hover:text-primary text-base leading-none" title="Mover arriba"><span class="material-symbols-outlined text-[16px]">expand_less</span></button>
        <button onclick="Calculator._moveAct(${wi},${act.id},1)" class="text-on-surface-variant/40 hover:text-primary text-base leading-none" title="Mover abajo"><span class="material-symbols-outlined text-[16px]">expand_more</span></button>
        <button onclick="Calculator._removeAct(${wi},${act.id})" class="text-error/60 hover:text-error text-lg leading-none ml-1">&times;</button>
      </div>
      <div class="mb-2">
        <label class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-1 block">Description</label>
        <textarea rows="3" placeholder="${act.subtype ? def.descHint : 'Select a type above or write your own description of this ' + def.label.toLowerCase() + '...'}" class="w-full px-3 py-2.5 text-sm bg-white border border-outline-variant/30 rounded-xl resize-vertical focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 leading-relaxed" onchange="Calculator._setActDesc(${wi},${act.id},this.value)">${act.desc || ''}</textarea>
      </div>
      <div id="calc-act-fields-${act.id}">${buildActFields(act, wi)}</div>
      <div class="mt-2 pt-2 border-t border-outline-variant/10" id="calc-act-result-${act.id}"></div>
    </div>`;
  }

  /* ── Activity field builders ────────────────────────────────── */

  function buildActFields(act, wi) {
    const n = state.partners.length;
    const mo = getProjectMonths();

    if (ACT_TYPES[act.type]?.mobility) return buildMobilityFields(act, wi);
    if (act.type === 'me') return buildMEFields(act, wi);

    switch (act.type) {
      case 'mgmt':
        return `<div class="grid grid-cols-3 gap-2">
          <div><label class="text-[11px] text-on-surface-variant">€/month applicant</label><input type="number" value="${act.rate_applicant||500}" min="0" class="w-full" onchange="Calculator._setAct(${wi},${act.id},'rate_applicant',this.value)"></div>
          <div><label class="text-[11px] text-on-surface-variant">€/month partners</label><input type="number" value="${act.rate_partner||250}" min="0" class="w-full" onchange="Calculator._setAct(${wi},${act.id},'rate_partner',this.value)"></div>
          <div class="text-[11px] text-on-surface-variant self-end pb-2">Duration: <strong>${mo} months</strong></div>
        </div>`;

      case 'io':
        return buildIOFields(act, wi);

      case 'local_ws':
        return buildPerPartnerFields(act, wi, 'ws_partners',
          { ws_pax:10, ws_n:6, ws_cost:50 },
          (pid, d) => `
            <td class="text-center"><label class="text-[10px] text-on-surface-variant block">Pax/session</label><input type="number" value="${d.ws_pax}" min="0" class="w-16" ${!d.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'ws_partners','${pid}','ws_pax',this.value)"></td>
            <td class="text-center"><label class="text-[10px] text-on-surface-variant block">Sessions</label><input type="number" value="${d.ws_n}" min="0" class="w-16" ${!d.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'ws_partners','${pid}','ws_n',this.value)"></td>
            <td class="text-center"><label class="text-[10px] text-on-surface-variant block">€/pax/day</label><input type="number" value="${d.ws_cost}" min="0" class="w-16" ${!d.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'ws_partners','${pid}','ws_cost',this.value)"></td>`,
          d => (d.ws_pax||0) * (d.ws_n||0) * (d.ws_cost||0),
          ['Pax/session','Sessions','€/pax/day']
        );

      case 'campaign':
        return buildPerPartnerFields(act, wi, 'camp_partners',
          { monthly:100, months: mo },
          (pid, d) => `
            <td class="text-center"><label class="text-[10px] text-on-surface-variant block">€/month</label><input type="number" value="${d.monthly}" min="0" class="w-20" ${!d.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'camp_partners','${pid}','monthly',this.value)"></td>
            <td class="text-center"><label class="text-[10px] text-on-surface-variant block">Months</label><input type="number" value="${d.months}" min="0" max="${mo}" class="w-16" ${!d.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'camp_partners','${pid}','months',this.value)"></td>`,
          d => (d.monthly||0) * (d.months||0),
          ['€/month','Months']
        );

      case 'equipment': case 'goods': case 'consumables': case 'other':
        return buildDepreciationFields(act, wi);

      case 'website': case 'artistic':
        return buildNoteAmountFields(act, wi);

      default: return '';
    }
  }

  /* ── Mobility fields ────────────────────────────────────────── */

  function buildMobilityFields(act, wi) {
    if (!act.host) act.host = state.partners[0]?.id;
    if (act.pax === undefined) act.pax = 2;
    if (act.days === undefined) act.days = 3;
    if (act.local_pax === undefined) act.local_pax = 0;
    if (act.local_transport === undefined) act.local_transport = 25;
    if (!act.participants) { act.participants = {}; state.partners.forEach(p => { if (p.id !== act.host) act.participants[p.id] = true; }); }

    const hostPartner = state.partners.find(p => p.id === act.host) || state.extraDests.find(d => d.id === act.host);
    const hostName = hostPartner?.name || 'Host';
    const hostLoc = hostPartner ? [hostPartner.city, hostPartner.country].filter(Boolean).join(', ') : '';

    const hostOpts = state.partners.map(p => `<option value="${p.id}" ${p.id===act.host?'selected':''}>${p.name||'P'+p.order_index}</option>`).join('')
      + (state.extraDests.length ? '<option disabled>\u2500\u2500\u2500</option>' + state.extraDests.filter(d => d.name).map(d => `<option value="${d.id}" ${d.id===act.host?'selected':''}>${d.name}</option>`).join('') : '');

    const pax = act.pax || 2;
    const days = act.days || 3;
    const isOnline = !!act.online;

    // Ensure all partners have participation state
    if (!act.participants) { act.participants = {}; state.partners.forEach(p => { act.participants[p.id] = true; }); }

    // All partners — same rules, host just has travel=0 to itself
    const rows = state.partners.map((p, i) => {
      const isHost = p.id === act.host;
      const active = act.participants[p.id] !== false;
      const rate = isHost || isOnline ? 0 : getRouteCost(p.id, act.host);
      const travelCost = active ? rate * pax : 0;
      const perdiem = getPartnerPerdiemTotal(p.id);
      const accomCost = active && !isOnline ? perdiem * pax * days : 0;
      const rowTotal = travelCost + accomCost;

      return `<tr style="opacity:${active?1:.4}">
        <td><label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" ${active?'checked':''} class="w-3.5 h-3.5" onchange="Calculator._setParticipant(${wi},${act.id},'${p.id}',this.checked)">
          <div>
            <div class="font-medium text-sm">${p.name||'P'+p.order_index} ${isHost ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary ml-1">HOST</span>' : ''}</div>
            <div class="text-[10px] text-on-surface-variant">${[p.city,p.country].filter(Boolean).join(', ')}</div>
          </div>
        </label></td>
        <td class="text-right font-mono text-xs">${active && !isHost ? `${pax}p \u00D7 \u20AC${rate}` : '\u2014'}</td>
        <td class="text-right font-mono text-xs">${active && !isHost ? euros(travelCost) : '\u2014'}</td>
        <td class="text-right font-mono text-xs">${active ? `${pax}p \u00D7 ${days}d \u00D7 \u20AC${perdiem}` : '\u2014'}</td>
        <td class="text-right font-mono text-xs">${active ? euros(accomCost) : '\u2014'}</td>
        <td class="text-right font-mono text-sm font-bold">${active ? euros(rowTotal) : '\u2014'}</td>
      </tr>`;
    }).join('');

    return `
      <!-- Online toggle -->
      <div class="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-xl ${isOnline ? 'bg-amber-50 border-2 border-amber-300' : 'bg-gray-50 border border-outline-variant/20'}">
        <label class="flex items-center gap-2 cursor-pointer flex-1">
          <input type="checkbox" ${isOnline ? 'checked' : ''} class="w-4 h-4 accent-amber-500" onchange="Calculator._setActOnline(${wi},${act.id},this.checked)">
          <span class="material-symbols-outlined text-lg ${isOnline ? 'text-amber-600' : 'text-on-surface-variant/40'}">videocam</span>
          <span class="text-sm font-bold ${isOnline ? 'text-amber-700' : 'text-on-surface-variant'}">ONLINE</span>
          ${isOnline ? '<span class="text-[10px] text-amber-600 ml-1">No travel or accommodation costs</span>' : '<span class="text-[10px] text-on-surface-variant/50 ml-1">Mark as online to set budget to zero</span>'}
        </label>
      </div>
      <div class="grid grid-cols-3 gap-2 mb-3 ${isOnline ? 'opacity-30 pointer-events-none' : ''}">
        <div><label class="text-[11px] text-on-surface-variant">Host</label><select class="w-full text-sm" onchange="Calculator._setActHost(${wi},${act.id},this.value)">${hostOpts}</select></div>
        <div><label class="text-[11px] text-on-surface-variant">Travellers/partner</label><input type="number" value="${act.pax}" min="0" class="w-full" onchange="Calculator._setAct(${wi},${act.id},'pax',this.value)"></div>
        <div><label class="text-[11px] text-on-surface-variant">Days</label><input type="number" value="${act.days}" min="0" class="w-full" onchange="Calculator._setAct(${wi},${act.id},'days',this.value)"></div>
      </div>
      ${isOnline ? `<div class="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
        <span class="material-symbols-outlined text-xs align-middle mr-1">info</span>
        This activity is marked as online. Travel and accommodation costs are set to zero. If you need budget for platform, technical support or other costs, add them as "Other Costs" in this work package.
      </div>` : ''}
      <details class="mb-3 rounded-lg bg-blue-50/50 border border-blue-100">
        <summary class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-xs">
          <span class="material-symbols-outlined text-sm text-blue-400">info</span>
          <span class="font-semibold text-blue-600">How mobility budgets work</span>
        </summary>
        <div class="px-3 pb-2 text-[11px] text-blue-800/70 space-y-1">
          <p><strong>Travel:</strong> Based on distance bands between partner cities. Use the EC distance calculator to determine the correct band. Eco-travel rates apply when sustainable transport is used.</p>
          <p><strong>Accommodation &amp; subsistence:</strong> Per diem rates based on the destination country. Covers hotel + daily expenses for each traveller for the duration of the activity.</p>
          <p><strong>Other costs</strong> (organisation, local transport, venue, catering, etc.) should be added as separate "Other Costs" activities within the same work package if needed.</p>
        </div>
      </details>
      ${state.partners.length ? `<div class="overflow-x-auto"><table class="calc-table"><thead><tr>
        <th class="text-left">Partner</th>
        <th class="text-right">Travel rate</th>
        <th class="text-right">Travel cost</th>
        <th class="text-right">Accom. rate</th>
        <th class="text-right">Accom. cost</th>
        <th class="text-right">Total</th>
      </tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    `;
  }

  /* ── IO fields ──────────────────────────────────────────────── */

  function buildIOFields(act, wi) {
    if (!act.io_staff) {
      act.io_staff = {};
      state.partners.forEach(p => {
        const rates = state.workerRates.filter(w => w.pid === p.id);
        act.io_staff[p.id] = {
          active: true,
          staff: [{ profileId: rates[0]?.id || null, days: 20, tasks: '' }]
        };
      });
    }

    let totalCost = 0;
    state.partners.forEach(p => {
      const ps = act.io_staff[p.id];
      if (!ps || !ps.active) return;
      ps.staff.forEach(s => { totalCost += (s.days || 0) * getPartnerDayRate(p.id, s.profileId); });
    });

    const blocks = state.partners.map((p, i) => {
      const ps = act.io_staff[p.id] || { active: false, staff: [] };
      const rates = state.workerRates.filter(w => w.pid === p.id);
      const color = WP_COLORS[i % WP_COLORS.length];
      const bg = WP_BG[i % WP_BG.length];
      let pTotal = 0;
      if (ps.active) ps.staff.forEach(s => { pTotal += (s.days || 0) * getPartnerDayRate(p.id, s.profileId); });

      const staffRows = ps.staff.map((s, si) => {
        const rate = getPartnerDayRate(p.id, s.profileId);
        const profOpts = `<option value="">Select profile...</option>` + rates.map(w =>
          `<option value="${w.id}" ${String(w.id)===String(s.profileId)?'selected':''}>${w.category} \u2014 \u20AC${w.rate}/day</option>`).join('');
        return `<div class="flex gap-2 items-start mb-2 ${!ps.active?'opacity-40 pointer-events-none':''}">
          <div class="flex-1 space-y-1">
            <select class="text-xs w-full px-2 py-1.5 rounded-lg border border-outline-variant/20" onchange="Calculator._setIOStaff(${wi},${act.id},'${p.id}',${si},'profileId',this.value)">${profOpts}</select>
            <div class="flex gap-2">
              <div class="w-20"><label class="text-[9px] text-on-surface-variant">Days</label>
                <input type="number" value="${s.days}" min="0" class="w-full text-xs px-2 py-1 rounded border border-outline-variant/20" onchange="Calculator._setIOStaff(${wi},${act.id},'${p.id}',${si},'days',this.value)"></div>
              <div class="flex-1"><label class="text-[9px] text-on-surface-variant">Tasks</label>
                <input type="text" value="${s.tasks||''}" placeholder="Brief description of tasks..." class="w-full text-xs px-2 py-1 rounded border border-outline-variant/20" onchange="Calculator._setIOStaff(${wi},${act.id},'${p.id}',${si},'tasks',this.value)"></div>
            </div>
            <div class="text-[10px] font-mono" style="color:${color}">${s.days} days \u00D7 \u20AC${rate} = ${euros(s.days*rate)}</div>
          </div>
          <button onclick="Calculator._removeIOStaff(${wi},${act.id},'${p.id}',${si})" class="text-on-surface-variant/30 hover:text-error mt-1 text-base leading-none">\u00D7</button>
        </div>`;
      }).join('');

      return `<div class="rounded-xl border border-outline-variant/20 overflow-hidden mb-2">
        <div class="flex items-center gap-2 px-3 py-2" style="background:${bg}">
          <input type="checkbox" ${ps.active?'checked':''} class="w-3.5 h-3.5 accent-primary" onchange="Calculator._setIOPartnerActive(${wi},${act.id},'${p.id}',this.checked)">
          <span class="text-xs font-bold flex-1" style="color:${color}">${p.name||'P'+(i+1)}</span>
          <span class="text-[10px] font-mono font-semibold" style="color:${color}">${ps.active?euros(pTotal):'\u2014'}</span>
        </div>
        ${ps.active?`<div class="px-3 py-2">${staffRows}
          <button onclick="Calculator._addIOStaff(${wi},${act.id},'${p.id}')" class="text-[10px] font-semibold text-primary hover:underline">+ Add worker</button>
        </div>`:''}
      </div>`;
    }).join('');

    return `<div class="text-xs text-on-surface-variant mb-2">Assign staff per partner. Uncheck partners not involved. <span class="font-mono font-semibold text-primary">${euros(totalCost)}</span></div>${blocks}`;
  }

  /* ── ME fields ──────────────────────────────────────────────── */

  function buildMEFields(act, wi) {
    if (!act.me_events) { act.me_events = {}; state.partners.forEach(p => { act.me_events[p.id] = { active:true, local_pax:20, intl_pax:0, local_rate:100, intl_rate:200 }; }); }

    const rows = state.partners.map((p, i) => {
      const ev = act.me_events[p.id] || { active:true, local_pax:20, intl_pax:0, local_rate:100, intl_rate:200 };
      const total = ev.active ? ev.local_pax * ev.local_rate + ev.intl_pax * ev.intl_rate : 0;
      return `<tr style="opacity:${ev.active?1:.4}">
        <td><label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" ${ev.active?'checked':''} class="w-3.5 h-3.5" onchange="Calculator._setME(${wi},${act.id},'${p.id}','active',this.checked)">
          <span class="font-semibold text-sm" style="color:${WP_COLORS[i%WP_COLORS.length]}">${p.name||'P'+(i+1)}</span>
        </label></td>
        <td class="text-center"><div class="flex items-center gap-1 justify-center"><input type="number" value="${ev.local_pax}" min="0" class="w-14" ${!ev.active?'disabled':''} onchange="Calculator._setME(${wi},${act.id},'${p.id}','local_pax',this.value)"><span class="text-[10px]">×</span><input type="number" value="${ev.local_rate}" min="0" class="w-16" ${!ev.active?'disabled':''} onchange="Calculator._setME(${wi},${act.id},'${p.id}','local_rate',this.value)"></div></td>
        <td class="text-center"><div class="flex items-center gap-1 justify-center"><input type="number" value="${ev.intl_pax}" min="0" class="w-14" ${!ev.active?'disabled':''} onchange="Calculator._setME(${wi},${act.id},'${p.id}','intl_pax',this.value)"><span class="text-[10px]">×</span><input type="number" value="${ev.intl_rate}" min="0" class="w-16" ${!ev.active?'disabled':''} onchange="Calculator._setME(${wi},${act.id},'${p.id}','intl_rate',this.value)"></div></td>
        <td class="text-right font-mono font-semibold text-sm">${ev.active ? euros(total) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="overflow-x-auto"><table class="calc-table"><thead><tr>
      <th class="text-left">Partner</th><th class="text-center">Local pax × €</th><th class="text-center">Intl pax × €</th><th class="text-right">Total</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ── Generic per-partner fields ─────────────────────────────── */

  function buildPerPartnerFields(act, wi, stateKey, defaults, buildCells, calcTotal, colHeaders) {
    if (!act[stateKey]) { act[stateKey] = {}; state.partners.forEach(p => { act[stateKey][p.id] = { active:true, ...defaults }; }); }
    const rows = state.partners.map((p, i) => {
      const d = act[stateKey][p.id] || { active:true, ...defaults };
      const total = d.active ? calcTotal(d) : 0;
      return `<tr style="opacity:${d.active?1:.4}">
        <td><label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" ${d.active?'checked':''} class="w-3.5 h-3.5" onchange="Calculator._setPartnerDetail(${wi},${act.id},'${stateKey}','${p.id}','active',this.checked)">
          <span class="font-semibold text-sm" style="color:${WP_COLORS[i%WP_COLORS.length]}">${p.name||'P'+(i+1)}</span>
        </label></td>
        ${buildCells(p.id, d)}
        <td class="text-right font-mono font-semibold text-sm">${d.active ? euros(total) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="overflow-x-auto"><table class="calc-table"><thead><tr>
      <th class="text-left">Partner</th>${colHeaders.map(h => `<th class="text-center">${h}</th>`).join('')}<th class="text-right">Total</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ── Depreciation fields ────────────────────────────────────── */

  function buildDepreciationFields(act, wi) {
    if (!act.note_partners) act.note_partners = {};
    // Ensure all partners have entries with proper defaults
    state.partners.forEach(p => {
      if (!act.note_partners[p.id]) act.note_partners[p.id] = { active:true, note:'', amount:0, project_pct:100, lifetime_pct:100 };
      const np = act.note_partners[p.id];
      if (np.project_pct == null) np.project_pct = 100;
      if (np.lifetime_pct == null) np.lifetime_pct = 100;
    });
    const rows = state.partners.map((p, i) => {
      const np = act.note_partners[p.id];
      const charged = np.active ? calcDepreciation(np) : 0;
      return `<tr style="opacity:${np.active?1:.4}">
        <td><label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" ${np.active?'checked':''} class="w-3.5 h-3.5" onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','active',this.checked)">
          <span class="font-semibold text-sm" style="color:${WP_COLORS[i%WP_COLORS.length]}">${p.name||'P'+(i+1)}</span>
        </label></td>
        <td><input type="text" value="${np.note||''}" placeholder="Description..." class="w-full text-xs" ${!np.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','note',this.value)"></td>
        <td class="text-right"><input type="number" value="${np.amount||''}" min="0" class="w-20" ${!np.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','amount',this.value)"></td>
        <td class="text-right"><input type="number" value="${np.project_pct??100}" min="0" max="100" class="w-16" ${!np.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','project_pct',this.value)"></td>
        <td class="text-right"><input type="number" value="${np.lifetime_pct??100}" min="0" max="100" class="w-16" ${!np.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','lifetime_pct',this.value)"></td>
        <td class="text-right font-mono font-semibold text-sm">${charged > 0 ? euros(charged) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="text-xs text-on-surface-variant mb-2"><strong>Charged = Investment × % project use × % useful life</strong></div>
    <div class="overflow-x-auto"><table class="calc-table"><thead><tr>
      <th class="text-left">Partner</th><th>Description</th><th class="text-right">Invest €</th><th class="text-right">% Project</th><th class="text-right">% Life</th><th class="text-right">Charged</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ── Note+Amount fields ─────────────────────────────────────── */

  function buildNoteAmountFields(act, wi) {
    if (!act.note_partners) { act.note_partners = {}; state.partners.forEach(p => { act.note_partners[p.id] = { active:true, note:'', amount:0 }; }); }
    const rows = state.partners.map((p, i) => {
      const np = act.note_partners[p.id] || { active:true, note:'', amount:0 };
      return `<tr style="opacity:${np.active?1:.4}">
        <td><label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" ${np.active?'checked':''} class="w-3.5 h-3.5" onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','active',this.checked)">
          <span class="font-semibold text-sm" style="color:${WP_COLORS[i%WP_COLORS.length]}">${p.name||'P'+(i+1)}</span>
        </label></td>
        <td><input type="text" value="${np.note||''}" placeholder="Description..." class="w-full text-xs" ${!np.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','note',this.value)"></td>
        <td class="text-right"><input type="number" value="${np.amount||''}" min="0" class="w-24" ${!np.active?'disabled':''} onchange="Calculator._setPartnerDetail(${wi},${act.id},'note_partners','${p.id}','amount',this.value)"></td>
        <td class="text-right font-mono font-semibold text-sm">${np.active && np.amount ? euros(np.amount) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="overflow-x-auto"><table class="calc-table"><thead><tr>
      <th class="text-left">Partner</th><th>Description</th><th class="text-right">Amount €</th><th class="text-right">Total</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     CALCULATION ENGINE
     ══════════════════════════════════════════════════════════════ */

  function calcActivity(act) {
    const n = state.partners.length;
    const mo = getProjectMonths();
    const og = 70; // org cost per person per day

    switch (act.type) {
      case 'mgmt': {
        const app = (act.rate_applicant||500) * mo;
        const partners = (act.rate_partner||250) * mo * (n - 1);
        return { total: app + partners, app, partners };
      }
      case 'meeting': case 'ltta': {
        if (act.online) return { total: 0, viaje: 0, aloj: 0 };
        const pax = act.pax || 2;
        const days = act.days || 3;
        let travel = 0, aloj = 0;
        // Si el host es un extra_destination, todos los partners usan su perdiem
        const hostExtraDest = state.extraDests.find(d => d.id === act.host);
        const destPerdiemTotal = hostExtraDest ? ((hostExtraDest.aloj || 0) + (hostExtraDest.mant || 0)) : null;
        const activePartners = state.partners.filter(p => (act.participants||{})[p.id] !== false);
        activePartners.forEach(p => {
          const isHost = p.id === act.host;
          if (!isHost) travel += getRouteCost(p.id, act.host) * pax;
          const pdTotal = destPerdiemTotal != null ? destPerdiemTotal : getPartnerPerdiemTotal(p.id);
          aloj += pax * days * pdTotal;
        });
        return { total: travel + aloj, viaje: travel, aloj };
      }
      case 'me': {
        if (!act.me_events) return { total:0 };
        let total = 0;
        const perPartner = [];
        state.partners.forEach(p => {
          const ev = act.me_events[p.id];
          if (!ev || !ev.active) return;
          const t = ev.local_pax * ev.local_rate + ev.intl_pax * ev.intl_rate;
          total += t;
          perPartner.push({ pid:p.id, name:p.name, total:t });
        });
        return { total, perPartner };
      }
      case 'io': {
        let total = 0;
        if (act.io_staff) {
          Object.entries(act.io_staff).forEach(([pid, ps]) => {
            if (!ps.active) return;
            ps.staff.forEach(s => { total += (s.days||0) * getPartnerDayRate(pid, s.profileId); });
          });
        } else if (act.io_partner_days) {
          Object.entries(act.io_partner_days).forEach(([pid, days]) => {
            const profId = act.io_partner_profiles ? (act.io_partner_profiles[pid] || null) : null;
            total += (days||0) * getPartnerDayRate(pid, profId);
          });
        }
        return { total };
      }
      case 'local_ws': {
        if (!act.ws_partners) return { total:0 };
        let total = 0;
        state.partners.forEach(p => { const w = act.ws_partners[p.id]; if (w?.active) total += (w.ws_pax||0)*(w.ws_n||0)*(w.ws_cost||0); });
        return { total };
      }
      case 'campaign': {
        if (!act.camp_partners) return { total:0 };
        let total = 0;
        state.partners.forEach(p => { const c = act.camp_partners[p.id]; if (c?.active) total += (c.monthly||0)*(c.months||0); });
        return { total };
      }
      case 'equipment': case 'goods': case 'consumables': case 'other': {
        if (!act.note_partners) return { total:0 };
        let total = 0;
        state.partners.forEach(p => { const np = act.note_partners[p.id]; if (np?.active) total += calcDepreciation(np); });
        return { total };
      }
      case 'website': case 'artistic': {
        if (!act.note_partners) return { total:0 };
        let total = 0;
        state.partners.forEach(p => { const np = act.note_partners[p.id]; if (np?.active) total += np.amount||0; });
        return { total };
      }
      default: return { total:0 };
    }
  }

  function recalcWP(wi) {
    const wp = state.wps[wi];
    let wpTotal = 0;
    const mo = getProjectMonths();
    wp.activities.forEach(act => {
      const res = calcActivity(act);
      const def = ACT_TYPES[act.type];
      const color = def?.color || '#474551';
      wpTotal += res.total;
      const el = $(`calc-act-result-${act.id}`);
      if (!el) return;

      if (act.type === 'mgmt') {
        const appCost = (act.rate_applicant||500) * mo;
        const partnerCost = (act.rate_partner||250) * mo;
        const rows = state.partners.map((p, i) => {
          const isApp = i === 0;
          const cost = isApp ? appCost : partnerCost;
          const rate = isApp ? (act.rate_applicant||500) : (act.rate_partner||250);
          return `<div class="flex justify-between text-xs py-0.5"><span class="text-on-surface-variant">${p.name||'P'+(i+1)} <span class="text-[10px] text-on-surface-variant/50">${rate}/mo × ${mo}mo</span></span><span class="font-mono font-semibold">${euros(cost)}</span></div>`;
        }).join('');
        el.innerHTML = `${rows}<div class="flex justify-between text-sm font-bold pt-1 mt-1 border-t border-outline-variant/10" style="color:${color}"><span>Total</span><span>${euros(res.total)}</span></div>`;

      } else if (act.type === 'meeting' || act.type === 'ltta') {
        const lines = [];
        if (res.viaje) lines.push(`<div class="flex justify-between text-xs py-0.5"><span class="text-on-surface-variant">Travel</span><span class="font-mono">${euros(res.viaje)}</span></div>`);
        if (res.aloj) lines.push(`<div class="flex justify-between text-xs py-0.5"><span class="text-on-surface-variant">Accommodation & subsistence</span><span class="font-mono">${euros(res.aloj)}</span></div>`);
        el.innerHTML = lines.join('') + `<div class="flex justify-between text-sm font-bold pt-1 mt-1 border-t border-outline-variant/10" style="color:${color}"><span>Total</span><span>${euros(res.total)}</span></div>`;

      } else if (act.type === 'io' && act.io_staff) {
        const rows = state.partners.map((p, i) => {
          const ps = act.io_staff[p.id];
          if (!ps?.active) return '';
          const pTotal = ps.staff.reduce((s, st) => s + (st.days||0) * getPartnerDayRate(p.id, st.profileId), 0);
          return `<div class="flex justify-between text-xs py-0.5"><span class="text-on-surface-variant">${p.name||'P'+(i+1)} <span class="text-[10px] text-on-surface-variant/50">${ps.staff.length} worker${ps.staff.length>1?'s':''}</span></span><span class="font-mono">${euros(pTotal)}</span></div>`;
        }).filter(Boolean).join('');
        el.innerHTML = rows + `<div class="flex justify-between text-sm font-bold pt-1 mt-1 border-t border-outline-variant/10" style="color:${color}"><span>Total</span><span>${euros(res.total)}</span></div>`;

      } else if (res.perPartner && res.perPartner.length) {
        const rows = res.perPartner.map(pp =>
          `<div class="flex justify-between text-xs py-0.5"><span class="text-on-surface-variant">${pp.name||'Partner'}</span><span class="font-mono">${euros(pp.total)}</span></div>`
        ).join('');
        el.innerHTML = rows + `<div class="flex justify-between text-sm font-bold pt-1 mt-1 border-t border-outline-variant/10" style="color:${color}"><span>Total</span><span>${euros(res.total)}</span></div>`;

      } else {
        el.innerHTML = `<div class="flex justify-end text-sm font-bold" style="color:${color}">${euros(res.total)}</div>`;
      }
    });
    const totEl = $(`calc-wp-total-${wi}`);
    if (totEl) totEl.textContent = euros(wpTotal);
    refreshSummaryBar();
    return wpTotal;
  }

  function refreshSummaryBar() {
    const { totalProject } = getFinancials();
    const direct = state.wps.reduce((s, wp) => s + wp.activities.reduce((ss, a) => ss + calcActivity(a).total, 0), 0);
    const { total } = applyIndirectCosts(direct);
    const diff = Math.round(totalProject - total);
    const usePct = totalProject > 0 ? Math.min(total / totalProject * 100, 100).toFixed(1) : 0;

    const elTotal = $('calc-live-total');
    const elDiff = $('calc-live-diff');
    const elBar = $('calc-live-bar');
    if (elTotal) elTotal.textContent = euros(total);
    if (elDiff) { elDiff.textContent = (diff >= 0 ? '+ ' : '− ') + euros(Math.abs(diff)); elDiff.style.color = diff < 0 ? '#FCA5A5' : ''; }
    if (elBar) {
      elBar.style.width = usePct + '%';
      const over = diff < 0; // diff = Math.round(totalProject - total), céntimos no cuentan
      elBar.classList.toggle('bg-red-500', over);
      elBar.classList.toggle('bg-green-500', !over);
      elBar.classList.remove('bg-white');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 4: RESULTS
     ══════════════════════════════════════════════════════════════ */

  function renderResults(container) {
    state.wps.forEach((_, wi) => recalcWP(wi));
    const n = state.partners.length;
    const mo = getProjectMonths();

    const wpResults = state.wps.map((wp, wi) => {
      const acts = wp.activities.map(a => ({ ...a, ...calcActivity(a) }));
      const total = acts.reduce((s, a) => s + a.total, 0);
      return { ...wp, acts, total, color: WP_COLORS[wi%WP_COLORS.length], bg: WP_BG[wi%WP_BG.length] };
    });

    const directCosts = wpResults.reduce((s, w) => s + w.total, 0);
    const { indirect, total: subtotal } = applyIndirectCosts(directCosts);
    const { maxGrant, euGrant, cofinPct, totalProject, ownFunds, indirectPct } = getFinancials(subtotal);
    const ownPct = 100 - cofinPct;
    const over = subtotal > totalProject;

    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Budget Summary</h2>
      <p class="text-sm text-on-surface-variant mb-4">${state.project?.name || 'Project'} · ${n} partners · ${mo} months</p>

      <!-- Hero: Progress toward target -->
      ${(() => {
        const pct = totalProject > 0 ? Math.min(subtotal / totalProject * 100, 100) : 0;
        const gap = Math.round(totalProject - subtotal);
        const isOver = gap < 0;
        const targetDirect = totalProject / (1 + indirectPct / 100);
        const targetIndirect = totalProject - targetDirect;
        const targetOwnFunds = totalProject - Math.min(totalProject * cofinPct / 100, euGrant);
        const barColor = isOver ? 'bg-red-500' : 'bg-green-500';
        const borderColor = isOver ? 'border-red-200' : 'border-green-200';
        return `
      <div class="rounded-xl border ${borderColor} overflow-hidden mb-5">
        <!-- Progress bar -->
        <div class="bg-primary text-white p-5">
          <div class="flex items-end justify-between mb-3">
            <div>
              <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Budget actual</div>
              <div class="font-headline text-3xl font-bold">${euros(subtotal)}</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Target</div>
              <div class="font-headline text-xl font-bold opacity-80">${euros(totalProject)}</div>
            </div>
          </div>
          <div class="h-3 rounded-full bg-white/20 overflow-hidden">
            <div class="${barColor} h-full rounded-full transition-all" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="flex justify-between mt-2 text-xs">
            <span class="opacity-70">${pct.toFixed(1)}% del target</span>
            <span class="font-bold ${isOver ? 'text-red-300' : 'text-green-300'}">
              ${isOver ? 'Excede en ' + euros(Math.abs(gap)) : gap === 0 ? 'Ajustado' : 'Faltan ' + euros(gap)}
            </span>
          </div>
        </div>

        <!-- Comparative table -->
        <div class="bg-surface-container-lowest p-5">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                <th class="text-left py-1"></th>
                <th class="text-right py-1">Actual</th>
                <th class="text-right py-1">Target</th>
                <th class="text-right py-1">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-outline-variant/15">
                <td class="py-2 text-on-surface-variant">Costes directos</td>
                <td class="py-2 text-right font-mono font-medium">${euros(directCosts)}</td>
                <td class="py-2 text-right font-mono text-on-surface-variant">${euros(targetDirect)}</td>
                <td class="py-2 text-right font-mono ${directCosts >= targetDirect ? 'text-green-600' : 'text-amber-600'}">${euros(directCosts - targetDirect)}</td>
              </tr>
              <tr class="border-b border-outline-variant/15">
                <td class="py-2 text-on-surface-variant">Indirectos (${indirectPct}%)</td>
                <td class="py-2 text-right font-mono font-medium">${euros(indirect)}</td>
                <td class="py-2 text-right font-mono text-on-surface-variant">${euros(targetIndirect)}</td>
                <td class="py-2 text-right font-mono ${indirect >= targetIndirect ? 'text-green-600' : 'text-amber-600'}">${euros(indirect - targetIndirect)}</td>
              </tr>
              <tr class="border-b border-outline-variant/30 font-bold">
                <td class="py-2.5">Total presupuesto</td>
                <td class="py-2.5 text-right font-mono">${euros(subtotal)}</td>
                <td class="py-2.5 text-right font-mono">${euros(totalProject)}</td>
                <td class="py-2.5 text-right font-mono ${isOver ? 'text-red-600' : 'text-amber-600'}">${euros(subtotal - totalProject)}</td>
              </tr>
              <tr class="border-b border-outline-variant/15">
                <td class="py-2 text-blue-700">EU Grant (${cofinPct}%)</td>
                <td class="py-2 text-right font-mono font-medium text-blue-700">${euros(euGrant)}</td>
                <td class="py-2 text-right font-mono text-on-surface-variant">${euros(Math.min(totalProject * cofinPct / 100, maxGrant))}</td>
                <td class="py-2 text-right font-mono">${euros(euGrant - Math.min(totalProject * cofinPct / 100, maxGrant))}</td>
              </tr>
              <tr>
                <td class="py-2 text-amber-700">Fondos propios (${ownPct}%)</td>
                <td class="py-2 text-right font-mono font-medium text-amber-700">${euros(ownFunds)}</td>
                <td class="py-2 text-right font-mono text-on-surface-variant">${euros(totalProject - Math.min(totalProject * cofinPct / 100, maxGrant))}</td>
                <td class="py-2 text-right font-mono">${euros(ownFunds - (totalProject - Math.min(totalProject * cofinPct / 100, maxGrant)))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Financing bar -->
        <div class="px-5 pb-4 bg-surface-container-lowest">
          <div class="h-8 rounded-lg overflow-hidden flex">
            ${subtotal > 0 ? `
            <div class="bg-blue-600 flex items-center justify-center" style="width:${Math.round(euGrant / subtotal * 100)}%"><span class="text-xs font-bold text-white">EU ${Math.round(euGrant / subtotal * 100)}%</span></div>
            <div class="bg-amber-600 flex items-center justify-center" style="width:${Math.round(ownFunds / subtotal * 100)}%"><span class="text-xs font-bold text-white">Own ${Math.round(ownFunds / subtotal * 100)}%</span></div>
            ` : `
            <div class="bg-blue-600 flex items-center justify-center" style="width:${cofinPct}%"><span class="text-xs font-bold text-white">EU ${cofinPct}%</span></div>
            <div class="bg-amber-600 flex items-center justify-center" style="width:${ownPct}%"><span class="text-xs font-bold text-white">Own ${ownPct}%</span></div>
            `}
          </div>
        </div>
      </div>`;
      })()}

      <!-- Tabs -->
      <div class="flex gap-0 border-b-2 border-outline-variant/20 mb-5">
        <button class="calc-res-tab active" onclick="Calculator._switchResTab('partner')">By Partner</button>
        <button class="calc-res-tab" onclick="Calculator._switchResTab('wp')">By WP</button>
        <button class="calc-res-tab" onclick="Calculator._switchResTab('summary')">Summary</button>
      </div>

      <div id="calc-res-partner">${buildResPartner(wpResults, directCosts, indirect, subtotal, totalProject, indirectPct)}</div>
      <div id="calc-res-wp" style="display:none">${buildResWP(wpResults, directCosts, indirect, subtotal, indirectPct)}</div>
      <div id="calc-res-summary" style="display:none">${buildResSummary(wpResults, directCosts, indirect, subtotal, totalProject, indirectPct)}</div>

      <!-- Financing bar is now integrated in the hero above -->

      ${_embeddedMode ? embeddedNavButtons(2, 4, 'Resumen \u2192') : navButtons(2, 4, 'Resumen \u2192')}
    `;
  }

  function buildResSummary(wpR, direct, indirect, subtotal, target, indPct) {
    return `<div class="grid grid-cols-[1fr_280px] gap-5 items-start max-lg:grid-cols-1">
      <div class="space-y-2">
        ${wpR.map((wp, wi) => {
          const wpInd = wp.total * (indPct/100);
          const wpFull = wp.total + wpInd;
          return `<div class="rounded-lg border border-outline-variant/20 p-3" style="border-left:3px solid ${wp.color}">
            <div class="flex justify-between items-baseline mb-1">
              <span class="text-xs font-semibold" style="color:${wp.color}">${wpLabel(wp, wi)}</span>
              <span class="font-mono text-sm font-semibold">${euros(wpFull)}</span>
            </div>
            <div class="text-[11px] text-on-surface-variant">${pct(wpFull, target)} · direct ${euros(wp.total)} + indirect ${euros(wpInd)}</div>
            <div class="h-1 rounded bg-surface-container-high mt-1.5"><div class="h-full rounded transition-all" style="width:${pct(wpFull, target)};background:${wp.color}"></div></div>
          </div>`;
        }).join('')}
      </div>
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-4 sticky top-5">
        <h4 class="text-xs font-bold text-on-surface-variant uppercase mb-3">Totals</h4>
        ${wpR.map((wp, wi) => `<div class="flex justify-between py-1 text-xs border-b border-outline-variant/10"><span style="color:${wp.color}" class="font-medium">${wpLabel(wp, wi)}</span><span class="font-mono">${euros(wp.total)}</span></div>`).join('')}
        <div class="flex justify-between py-1.5 text-xs border-t border-outline-variant/30 mt-1 pt-2 text-on-surface-variant"><span>Direct costs</span><span class="font-mono">${euros(direct)}</span></div>
        <div class="flex justify-between py-1 text-xs text-on-surface-variant"><span>Indirect ${indPct}%</span><span class="font-mono">+ ${euros(indirect)}</span></div>
        <div class="flex justify-between py-2 font-bold text-sm border-t-2 border-outline-variant/30 mt-1"><span>Total</span><span class="font-mono">${euros(subtotal)}</span></div>
      </div>
    </div>`;
  }

  function buildResWP(wpR, direct, indirect, subtotal, indPct) {
    return wpR.map((wp, wi) => {
      const wpInd = wp.total * (indPct/100);
      return `<div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-4 mb-3" style="border-top:3px solid ${wp.color}">
        <div class="flex justify-between items-center mb-3">
          <span class="font-headline font-bold text-sm" style="color:${wp.color}">${wpLabel(wp, wi)}</span>
          <span class="font-mono font-bold">${euros(wp.total + wpInd)}</span>
        </div>
        ${wp.acts.map(a => {
          const def = ACT_TYPES[a.type];
          return `<div class="flex justify-between items-baseline py-1.5 border-b border-outline-variant/10 text-sm">
            <span><span class="material-symbols-outlined text-[14px] align-middle mr-1" style="color:${def.color}">${def.icon}</span>${a.label}</span>
            <span class="font-mono font-semibold">${euros(a.total)}</span>
          </div>`;
        }).join('')}
        <div class="flex justify-between py-1.5 text-xs text-on-surface-variant mt-1"><span>Direct</span><span class="font-mono">${euros(wp.total)}</span></div>
        <div class="flex justify-between py-1.5 text-xs text-on-surface-variant"><span>+ Indirect ${indPct}%</span><span class="font-mono">+ ${euros(wpInd)}</span></div>
        <div class="flex justify-between py-2 font-bold text-sm rounded px-2 mt-1" style="background:${wp.bg};color:${wp.color}"><span>Total ${wpLabel(wp, wi)}</span><span class="font-mono">${euros(wp.total + wpInd)}</span></div>
      </div>`;
    }).join('') + `
      <div class="bg-primary text-white rounded-xl p-4 flex justify-between items-center">
        <span class="font-headline font-bold">TOTAL PROJECT</span>
        <span class="font-mono text-xl font-bold">${euros(subtotal)}</span>
      </div>`;
  }

  function buildResPartner(wpR, direct, indirect, subtotal, target, indPct) {
    const mo = getProjectMonths();
    const dash = '\u2014';
    const fmtN = n => n ? Number(n).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2}) : dash;

    // ── Build EACEA data per partner (units, rate, total) ──
    function partnerEACEA(pi) {
      const p = state.partners[pi];
      if (!p) return { lines:{}, A1:0, A:0, C1:0, C2:0, C3:0, C:0, directTotal:0 };
      const pd = getPartnerPerdiem(p.id);
      const L = { A1_workers:{}, A2:[], A3:[], A4:[], A5:[], B:[],
                  C1_travel:[], C1_accom:[], C1_subs:[], C2:[], C3_cons:[], C3_meet:[],
                  C3_comms:[], C3_web:[], C3_art:[], C3_other:[], D1:[] };

      // Initialize a bucket for each worker category this partner has
      const partnerRates = state.workerRates.filter(w => w.pid === p.id);
      partnerRates.forEach(wr => { L.A1_workers[wr.id] = { category: wr.category, rate: wr.rate, items: [] }; });

      function add(k, wi, label, units, rate, total) {
        if (!total || total <= 0) return;
        L[k].push({ label, units, rate: Math.round(rate*100)/100, total: Math.round(total*100)/100,
                     wp: wpLabel(wpR[wi], wi), wpColor: wpR[wi].color, wpIdx: wi });
      }

      function addWorker(profileId, wi, label, units, rate, total) {
        if (!total || total <= 0) return;
        const entry = { label, units, rate: Math.round(rate*100)/100, total: Math.round(total*100)/100,
                        wp: wpLabel(wpR[wi], wi), wpColor: wpR[wi].color, wpIdx: wi };
        if (L.A1_workers[profileId]) {
          L.A1_workers[profileId].items.push(entry);
        } else {
          // Fallback: create a bucket for unknown profiles
          if (!L.A1_workers['_other']) L.A1_workers['_other'] = { category: 'Other Staff', rate: 0, items: [] };
          L.A1_workers['_other'].items.push(entry);
        }
      }

      wpR.forEach((wp, wi) => {
        wp.acts.forEach(act => {
          switch (act.type) {
            case 'mgmt': {
              // Mgmt cost: distribute to the FIRST profile (coordinator) using mgmt flat rate
              const rate = pi === 0 ? (act.rate_applicant||500) : (act.rate_partner||250);
              const coordProfile = partnerRates[0];
              addWorker(coordProfile ? coordProfile.id : '_other', wi, 'Project Management', mo, rate, rate * mo);
              break;
            }
            case 'meeting': case 'ltta': {
              if (act.online) break;
              const pax = act.pax||2, days = act.days||3;
              const isHost = p.id === act.host;
              if ((act.participants||{})[p.id] === false) break;
              if (!isHost) {
                const rc = getRouteCost(p.id, act.host);
                add('C1_travel', wi, act.label, pax, rc, rc * pax);
              }
              // Perdiem del DESTINO, no del partner que viaja:
              //   - Si el host es un extra_destination (Bruselas, etc.),
              //     usa el perdiem del extra_dest.
              //   - Si el host es un partner, sigue el comportamiento previo
              //     (perdiem del partner que viaja, ya que cada uno conoce
              //     sus propias tarifas para alojarse en su país).
              const hostExtraDest = state.extraDests.find(d => d.id === act.host);
              const destAccom = hostExtraDest ? (hostExtraDest.aloj || 0) : (pd.aloj || 0);
              const destSubs  = hostExtraDest ? (hostExtraDest.mant || 0) : (pd.mant || 0);
              add('C1_accom', wi, act.label, pax * days, destAccom, pax * days * destAccom);
              add('C1_subs',  wi, act.label, pax * days, destSubs,  pax * days * destSubs);
              break;
            }
            case 'io': {
              const ps = act.io_staff?.[p.id];
              if (!ps?.active) break;
              ps.staff.forEach(st => {
                const rate = getPartnerDayRate(p.id, st.profileId);
                const pName = state.workerRates.find(w => w.id === st.profileId)?.category || 'Staff';
                addWorker(st.profileId, wi, `${act.label} — ${pName}`, st.days||0, rate, (st.days||0)*rate);
              });
              break;
            }
            case 'me': {
              const ev = act.me_events?.[p.id]; if (!ev?.active) break;
              const tot = (ev.local_pax||0)*(ev.local_rate||0) + (ev.intl_pax||0)*(ev.intl_rate||0);
              const tPax = (ev.local_pax||0) + (ev.intl_pax||0);
              add('C3_comms', wi, act.label, tPax, tPax>0?tot/tPax:0, tot);
              break;
            }
            case 'campaign': {
              const c = act.camp_partners?.[p.id]; if (!c?.active) break;
              add('C3_comms', wi, act.label, c.months||0, c.monthly||0, (c.monthly||0)*(c.months||0));
              break;
            }
            case 'local_ws': {
              const w = act.ws_partners?.[p.id]; if (!w?.active) break;
              const u = (w.ws_pax||0)*(w.ws_n||0);
              add('C3_meet', wi, act.label, u, w.ws_cost||0, u*(w.ws_cost||0));
              break;
            }
            case 'website':    { const np = act.note_partners?.[p.id]; if (np?.active) add('C3_web',   wi, act.label, 1, np.amount||0, np.amount||0); break; }
            case 'artistic':   { const np = act.note_partners?.[p.id]; if (np?.active) add('C3_art',   wi, act.label, 1, np.amount||0, np.amount||0); break; }
            case 'equipment':  { const np = act.note_partners?.[p.id]; if (np?.active) add('C2',       wi, act.label, 1, calcDepreciation(np), calcDepreciation(np)); break; }
            case 'consumables':{ const np = act.note_partners?.[p.id]; if (np?.active) add('C3_cons',  wi, act.label, 1, calcDepreciation(np), calcDepreciation(np)); break; }
            case 'goods': case 'other': {
              const np = act.note_partners?.[p.id]; if (np?.active) add('C3_other', wi, act.label, 1, calcDepreciation(np), calcDepreciation(np)); break;
            }
          }
        });
      });

      const sm = k => L[k].reduce((s, it) => s + it.total, 0);
      const A1 = Object.values(L.A1_workers).reduce((s, w) => s + w.items.reduce((ss, it) => ss + it.total, 0), 0);
      const A = A1;
      const C1 = sm('C1_travel') + sm('C1_accom') + sm('C1_subs');
      const C2 = sm('C2');
      const C3 = sm('C3_cons') + sm('C3_meet') + sm('C3_comms') + sm('C3_web') + sm('C3_art') + sm('C3_other');
      const C = C1 + C2 + C3;
      return { lines:L, A1, A, C1, C2, C3, C, directTotal: A + C };
    }

    // ── Render helper: expandable sub-line with activity detail ──
    function subRow(label, items, pColor) {
      const total = items.reduce((s,it) => s+it.total, 0);
      const units = items.reduce((s,it) => s+it.units, 0);
      const avgRate = units > 0 ? total / units : 0;
      const uid = 'bp-' + Math.random().toString(36).slice(2,8);
      const has = items.length > 0;
      return `
        <tr class="border-b border-outline-variant/8 ${has?'cursor-pointer hover:bg-surface-container-low':''}"
            ${has ? `onclick="document.querySelectorAll('.${uid}').forEach(r=>r.classList.toggle('hidden'))"` : ''}>
          <td class="py-1" style="padding-left:2.5rem">
            ${has ? '<span class="material-symbols-outlined text-[10px] align-middle mr-0.5 text-on-surface-variant">expand_more</span>' : ''}
            ${label}
          </td>
          <td class="text-right font-mono px-2">${has ? fmtN(units) : dash}</td>
          <td class="text-right font-mono px-2">${has && avgRate ? fmtN(avgRate) : dash}</td>
          <td class="text-right font-mono px-3 font-medium">${total > 0 ? euros(total) : dash}</td>
        </tr>
        ${items.map(it => `
          <tr class="${uid} hidden border-b border-outline-variant/4 text-[10px]">
            <td class="py-0.5 text-on-surface-variant" style="padding-left:3.5rem">
              <span class="font-semibold" style="color:${it.wpColor}">${it.wp}</span>
              <span class="ml-1">${it.label}</span>
            </td>
            <td class="text-right font-mono px-2">${fmtN(it.units)}</td>
            <td class="text-right font-mono px-2">${fmtN(it.rate)}</td>
            <td class="text-right font-mono px-3">${euros(it.total)}</td>
          </tr>
        `).join('')}`;
    }

    // ── Helper: filter items by WP index ──
    function filterByWP(items, wi) { return items.filter(it => it.wpIdx === wi); }
    function filterWorkersByWP(workers, wi) {
      const result = {};
      Object.entries(workers).forEach(([id, w]) => {
        result[id] = { ...w, items: w.items.filter(it => it.wpIdx === wi) };
      });
      return result;
    }
    function sumWorkers(workers) { return Object.values(workers).reduce((s, w) => s + w.items.reduce((ss, it) => ss + it.total, 0), 0); }
    function sumItems(items) { return items.reduce((s, it) => s + it.total, 0); }

    // ── Render EACEA table body for a given set of lines ──
    function eaceaTableBody(lines, c, indPctVal) {
      const A1 = sumWorkers(lines.A1_workers);
      const A = A1;
      const C1 = sumItems(lines.C1_travel) + sumItems(lines.C1_accom) + sumItems(lines.C1_subs);
      const C2 = sumItems(lines.C2);
      const C3 = sumItems(lines.C3_cons) + sumItems(lines.C3_meet) + sumItems(lines.C3_comms) + sumItems(lines.C3_web) + sumItems(lines.C3_art) + sumItems(lines.C3_other);
      const C = C1 + C2 + C3;
      const directTotal = A + C;
      const indAmt = directTotal * indPctVal / 100;
      const grandTotal = directTotal + indAmt;

      return `
                <tr class="font-bold border-b border-outline-variant/20" style="background:${c}06">
                  <td class="py-2 px-3" colspan="3">A. DIRECT PERSONNEL COSTS</td>
                  <td class="text-right py-2 px-3 font-mono">${A > 0 ? euros(A) : dash}</td>
                </tr>
                <tr class="border-b border-outline-variant/10 font-semibold">
                  <td class="py-1 pl-5">A.1 Employees (or equivalent)</td>
                  <td class="text-right font-mono px-2 text-on-surface-variant text-[9px]" colspan="2">person months</td>
                  <td class="text-right font-mono px-3">${A1 > 0 ? euros(A1) : dash}</td>
                </tr>
                ${Object.values(lines.A1_workers).map(w => subRow(w.category + (w.rate ? ' <span class="text-[9px] text-on-surface-variant/50 font-normal">(' + euros(w.rate) + '/day)</span>' : ''), w.items, c)).join('')}
                <tr class="border-b border-outline-variant/5 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.2 Natural persons under direct contract</td><td class="text-right px-2">${dash}</td><td class="text-right px-2">${dash}</td><td class="text-right px-3">${dash}</td></tr>
                <tr class="border-b border-outline-variant/5 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.3 Seconded persons</td><td class="text-right px-2">${dash}</td><td class="text-right px-2">${dash}</td><td class="text-right px-3">${dash}</td></tr>
                <tr class="border-b border-outline-variant/5 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.4 SME Owners without salary</td><td class="text-right px-2">${dash}</td><td class="text-right px-2">${dash}</td><td class="text-right px-3">${dash}</td></tr>
                <tr class="border-b border-outline-variant/10 text-on-surface-variant/50"><td class="py-0.5 pl-5">A.5 Volunteers</td><td class="text-right px-2">${dash}</td><td class="text-right px-2">${dash}</td><td class="text-right px-3">${dash}</td></tr>
                <tr class="font-bold border-b border-outline-variant/20 text-on-surface-variant/60" style="background:${c}06">
                  <td class="py-2 px-3" colspan="3">B. Subcontracting costs</td>
                  <td class="text-right py-2 px-3 font-mono">${dash}</td>
                </tr>
                <tr class="font-bold border-b border-outline-variant/20" style="background:${c}06">
                  <td class="py-2 px-3" colspan="3">C. Purchase costs</td>
                  <td class="text-right py-2 px-3 font-mono">${C > 0 ? euros(C) : dash}</td>
                </tr>
                <tr class="border-b border-outline-variant/10 font-semibold">
                  <td class="py-1 pl-5">C.1 Travel and subsistence</td>
                  <td class="text-right font-mono px-2 text-on-surface-variant text-[9px]" colspan="2">per travel or day</td>
                  <td class="text-right font-mono px-3">${C1 > 0 ? euros(C1) : dash}</td>
                </tr>
                ${subRow('Travel', lines.C1_travel, c)}
                ${subRow('Accommodation', lines.C1_accom, c)}
                ${subRow('Subsistence', lines.C1_subs, c)}
                <tr class="border-b border-outline-variant/10 font-semibold">
                  <td class="py-1 pl-5">C.2 Equipment</td>
                  <td colspan="2"></td>
                  <td class="text-right font-mono px-3">${C2 > 0 ? euros(C2) : dash}</td>
                </tr>
                ${lines.C2.length ? subRow('Equipment items', lines.C2, c) : ''}
                <tr class="border-b border-outline-variant/10 font-semibold">
                  <td class="py-1 pl-5">C.3 Other goods, works and services</td>
                  <td colspan="2"></td>
                  <td class="text-right font-mono px-3">${C3 > 0 ? euros(C3) : dash}</td>
                </tr>
                ${subRow('Consumables', lines.C3_cons, c)}
                ${subRow('Services for Meetings, Seminars', lines.C3_meet, c)}
                ${subRow('Services for communication/dissemination', lines.C3_comms, c)}
                ${subRow('Website', lines.C3_web, c)}
                ${subRow('Artistic Fees', lines.C3_art, c)}
                ${subRow('Other', lines.C3_other, c)}
                <tr class="font-bold border-b border-outline-variant/20 text-on-surface-variant/60" style="background:${c}06">
                  <td class="py-2 px-3" colspan="3">D. Other cost categories</td>
                  <td class="text-right py-2 px-3 font-mono">${dash}</td>
                </tr>
                <tr class="border-b border-outline-variant/10 text-on-surface-variant/50"><td class="py-0.5 pl-5">D.1 Financial support to third parties</td><td class="text-right px-2">${dash}</td><td class="text-right px-2">${dash}</td><td class="text-right px-3">${dash}</td></tr>
                <tr class="font-bold border-y-2 border-outline-variant/30" style="background:${c}0c">
                  <td class="py-2 px-3" colspan="3">TOTAL DIRECT COSTS (A+B+C+D)</td>
                  <td class="text-right py-2 px-3 font-mono">${euros(directTotal)}</td>
                </tr>
                <tr class="border-b border-outline-variant/20">
                  <td class="py-2 px-3 font-semibold" colspan="3">E. Indirect costs ${indPctVal}%</td>
                  <td class="text-right py-2 px-3 font-mono font-semibold">${euros(indAmt)}</td>
                </tr>
                <tr class="font-bold text-white" style="background:${c}">
                  <td class="py-2.5 px-3" colspan="3">TOTAL COSTS (A+B+C+D+E)</td>
                  <td class="text-right py-2.5 px-3 font-mono">${euros(grandTotal)}</td>
                </tr>`;
    }

    // ── Render each partner with WP breakdown ──
    return state.partners.map((p, i) => {
      const b = partnerEACEA(i);
      const c = WP_COLORS[i%WP_COLORS.length];
      const indAmt = b.directTotal * indPct / 100;
      const grandTotal = b.directTotal + indAmt;
      const grandPct = target > 0 ? (grandTotal / target * 100).toFixed(1) : '0';
      const partnerId = 'bp-partner-' + i;

      // Build WP sub-tables
      const wpTables = wpR.map((wp, wi) => {
        const wc = WP_COLORS[wi%WP_COLORS.length];
        const wpLines = {
          A1_workers: filterWorkersByWP(b.lines.A1_workers, wi),
          C1_travel: filterByWP(b.lines.C1_travel, wi),
          C1_accom: filterByWP(b.lines.C1_accom, wi),
          C1_subs: filterByWP(b.lines.C1_subs, wi),
          C2: filterByWP(b.lines.C2, wi),
          C3_cons: filterByWP(b.lines.C3_cons, wi),
          C3_meet: filterByWP(b.lines.C3_meet, wi),
          C3_comms: filterByWP(b.lines.C3_comms, wi),
          C3_web: filterByWP(b.lines.C3_web, wi),
          C3_art: filterByWP(b.lines.C3_art, wi),
          C3_other: filterByWP(b.lines.C3_other, wi),
        };
        const wpDirect = sumWorkers(wpLines.A1_workers) + sumItems(wpLines.C1_travel) + sumItems(wpLines.C1_accom) + sumItems(wpLines.C1_subs) + sumItems(wpLines.C2) + sumItems(wpLines.C3_cons) + sumItems(wpLines.C3_meet) + sumItems(wpLines.C3_comms) + sumItems(wpLines.C3_web) + sumItems(wpLines.C3_art) + sumItems(wpLines.C3_other);
        if (wpDirect === 0) return '';

        const wpIndAmt = wpDirect * indPct / 100;
        const wpTotal = wpDirect + wpIndAmt;
        const wpUid = 'bp-wp-' + i + '-' + wi;

        return `
          <div class="border-b border-outline-variant/15">
            <div class="flex items-center gap-2 px-4 py-2 cursor-pointer select-none hover:bg-surface-container-low" onclick="document.getElementById('${wpUid}').classList.toggle('hidden');this.querySelector('.wp-arr').classList.toggle('rotate-180')">
              <span class="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0" style="background:${wc}">WP${wi+1}</span>
              <span class="text-xs font-bold flex-1 truncate" style="color:${wc}">${wpLabel(wp, wi)}</span>
              <span class="text-xs font-mono font-bold" style="color:${wc}">${euros(wpTotal)}</span>
              <span class="material-symbols-outlined text-sm text-on-surface-variant wp-arr transition-transform">expand_more</span>
            </div>
            <div id="${wpUid}" class="hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-[11px] border-collapse">
                  <thead>
                    <tr class="text-[9px] uppercase tracking-wider text-on-surface-variant border-y border-outline-variant/20" style="background:${wc}06">
                      <th class="text-left py-1.5 px-3 font-bold"></th>
                      <th class="text-right py-1.5 px-2 font-bold w-20">Units</th>
                      <th class="text-right py-1.5 px-2 font-bold w-20">Cost/Unit</th>
                      <th class="text-right py-1.5 px-3 font-bold w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${eaceaTableBody(wpLines, wc, indPct)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>`;
      }).join('');

      // Partner total EACEA table (all WPs combined)
      const totalUid = 'bp-total-' + i;

      return `
      <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 mb-4 overflow-hidden" style="border-top:3px solid ${c}">
        <!-- Partner Header -->
        <div class="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onclick="document.getElementById('${partnerId}').classList.toggle('hidden');this.querySelector('.bp-arrow').classList.toggle('rotate-180')">
          <span class="w-8 h-8 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0" style="background:${c}">BE${String(i+1).padStart(2,'0')}</span>
          <div class="flex-1 min-w-0">
            <div class="font-headline font-bold truncate">${p.name||'Partner '+(i+1)}</div>
            <div class="text-[10px] text-on-surface-variant">${p.country || ''}${i===0 ? ' \u00B7 Coordinator' : ''}</div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="font-mono font-bold" style="color:${c}">${euros(grandTotal)}</div>
            <div class="text-[10px] text-on-surface-variant">${grandPct}% of total</div>
          </div>
          <span class="material-symbols-outlined text-base text-on-surface-variant bp-arrow transition-transform">expand_more</span>
        </div>

        <!-- WP breakdown + Total -->
        <div id="${partnerId}" class="hidden">
          <!-- Per-WP sub-tables -->
          ${wpTables}

          <!-- Partner Total (all WPs) -->
          <div class="border-t-2 border-outline-variant/30">
            <div class="flex items-center gap-2 px-4 py-2 cursor-pointer select-none" style="background:${c}08" onclick="document.getElementById('${totalUid}').classList.toggle('hidden');this.querySelector('.wp-arr').classList.toggle('rotate-180')">
              <span class="material-symbols-outlined text-sm" style="color:${c}">functions</span>
              <span class="text-xs font-bold flex-1" style="color:${c}">TOTAL ${p.name||'Partner '+(i+1)}</span>
              <span class="text-sm font-mono font-bold" style="color:${c}">${euros(grandTotal)}</span>
              <span class="material-symbols-outlined text-sm text-on-surface-variant wp-arr transition-transform">expand_more</span>
            </div>
            <div id="${totalUid}" class="hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-[11px] border-collapse">
                  <thead>
                    <tr class="text-[9px] uppercase tracking-wider text-on-surface-variant border-y border-outline-variant/30" style="background:${c}08">
                      <th class="text-left py-2 px-3 font-bold"></th>
                      <th class="text-right py-2 px-2 font-bold w-20">Units</th>
                      <th class="text-right py-2 px-2 font-bold w-20">Cost/Unit</th>
                      <th class="text-right py-2 px-3 font-bold w-28">Beneficiary<br>Total Costs</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${eaceaTableBody(b.lines, c, indPct)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="h-1.5" style="background:${c}15"><div class="h-full transition-all" style="width:${grandPct}%;background:${c}"></div></div>
      </div>`;
    }).join('') + `
      <div class="bg-primary text-white rounded-xl p-4 flex justify-between items-center">
        <span class="font-headline font-bold">TOTAL PROJECT</span>
        <span class="font-mono text-xl font-bold">${euros(subtotal)}</span>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 5: GANTT
     ══════════════════════════════════════════════════════════════ */

  let ganttView = 'months';
  const ganttCollapsed = {};

  function renderGantt(container) {
    const ps = getProjectStart();
    if (!ps) {
      container.innerHTML = `<div class="text-center py-16 text-on-surface-variant">Set a project start date in Intake to see the Gantt chart.</div>${_embeddedMode ? embeddedNavButtons(4, 6, 'Resumen \u2192') : navButtons(3, null)}`;
      return;
    }

    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Project Timeline</h2>
      <p class="text-sm text-on-surface-variant mb-4">Gantt chart of all WPs and activities.</p>

      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-1">
          <span class="text-xs font-semibold text-on-surface-variant">View:</span>
          <button id="calc-gantt-months" class="px-3 py-1 text-xs font-semibold rounded ${ganttView==='months'?'bg-primary text-white':'bg-surface-container-high text-on-surface-variant'}" onclick="Calculator._setGanttView('months')">Months</button>
          <button id="calc-gantt-weeks" class="px-3 py-1 text-xs font-semibold rounded ${ganttView==='weeks'?'bg-primary text-white':'bg-surface-container-high text-on-surface-variant'}" onclick="Calculator._setGanttView('weeks')">Weeks</button>
        </div>
        <div class="ml-auto flex gap-2">
          <button class="px-2 py-1 text-[11px] font-semibold border border-outline-variant/30 rounded hover:bg-surface-container-high" onclick="Calculator._ganttCollapseAll()">− Collapse</button>
          <button class="px-2 py-1 text-[11px] font-semibold border border-outline-variant/30 rounded hover:bg-surface-container-high" onclick="Calculator._ganttExpandAll()">+ Expand</button>
        </div>
      </div>

      <div class="overflow-x-auto border border-outline-variant/20 rounded-xl bg-white">
        <div id="calc-gantt-inner" style="min-width:800px"></div>
      </div>
      <div id="calc-gantt-legend" class="flex flex-wrap gap-3 mt-3 text-xs"></div>
      <div id="calc-gantt-tooltip" class="calc-gantt-tip"></div>

      ${_embeddedMode ? embeddedNavButtons(4, 6, 'Resumen \u2192') : navButtons(3, null)}
    `;
    buildGanttChart();
  }

  function buildGanttChart() {
    const ps = getProjectStart();
    if (!ps) return;
    const pe = addMonths(ps, getProjectMonths()); pe.setDate(pe.getDate()-1);
    const totalMs = pe - ps;
    const LABEL_W = 180;

    const cols = [];
    if (ganttView === 'months') {
      let d = new Date(ps.getFullYear(), ps.getMonth(), 1), mo = 1;
      while (d <= pe) { cols.push({ label: d.toLocaleDateString('es-ES',{month:'short'}).toUpperCase(), sub: d.getFullYear().toString().slice(-2) }); d.setMonth(d.getMonth()+1); mo++; }
    } else {
      let d = new Date(ps); const dow = d.getDay(); d.setDate(d.getDate()-(dow===0?6:dow-1)); let wk = 1;
      while (d <= pe) { cols.push({ label:'S'+wk, sub:d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}) }); d.setDate(d.getDate()+7); wk++; }
    }

    function posW(ds, de) {
      if (!ds||!de) return null;
      const s = new Date(ds), e = new Date(de);
      if (s > pe || e < ps) return { out:true };
      const cs = s < ps ? ps : s, ce = e > pe ? pe : e;
      return { left:((cs-ps)/totalMs*100).toFixed(3)+'%', width:((ce-cs+86400000)/totalMs*100).toFixed(3)+'%', days: Math.round((ce-cs)/86400000)+1 };
    }

    const today = new Date();
    const showToday = today >= ps && today <= pe;
    const todayPct = showToday ? ((today-ps)/totalMs*100).toFixed(3)+'%' : null;

    const stripeCols = cols.map((_,ci) => `<div style="flex:1;border-left:1px solid #e5e7eb;background:${ci%2===0?'transparent':'rgba(0,0,0,.012)'}"></div>`).join('');
    const headerCols = cols.map((c,ci) => `<div style="flex:1;text-align:center;padding:4px 0;background:${ci%2===0?'#eceef0':'#e6e8ea'};border-left:1px solid #d1d5db"><div style="font-size:11px;font-weight:700;color:#374151">${c.label}</div><div style="font-size:9px;color:#9ca3af">${c.sub}</div></div>`).join('');

    let html = `<div style="display:flex;position:sticky;top:0;z-index:30;box-shadow:0 2px 6px rgba(0,0,0,.08)">
      <div style="width:${LABEL_W}px;flex-shrink:0;background:#1e293b;display:flex;align-items:center;padding:0 14px"><span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.06em">Activity</span></div>
      <div style="flex:1;display:flex">${headerCols}</div>
    </div>`;

    state.wps.forEach((wp, wi) => {
      const c = WP_COLORS[wi%WP_COLORS.length];
      const collapsed = ganttCollapsed[wi];

      html += `<div style="display:flex;align-items:stretch;background:${c}12;border-top:3px solid ${c};cursor:pointer;min-height:42px" onclick="Calculator._ganttToggle(${wi})">
        <div style="width:${LABEL_W}px;flex-shrink:0;padding:0 10px 0 14px;display:flex;align-items:center;gap:8px;overflow:hidden">
          <span style="font-size:10px;color:${c};font-weight:800">${collapsed?'▶':'▼'}</span>
          <span style="width:10px;height:10px;border-radius:50%;background:${c}"></span>
          <span style="font-size:12px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wpLabel(wp,wi)}</span>
        </div>
        <div style="flex:1;position:relative;display:flex"><div style="position:absolute;inset:0;display:flex">${stripeCols}</div>
          ${todayPct?`<div style="position:absolute;left:${todayPct};top:0;bottom:0;width:2px;background:#ef4444;opacity:.6;z-index:5"></div>`:''}
        </div>
      </div>`;

      if (!collapsed) {
        wp.activities.forEach((act, ai) => {
          const def = ACT_TYPES[act.type];
          const pos = posW(act.date_start, act.date_end);
          let bar = '';
          if (pos && !pos.out) {
            bar = `<div style="position:absolute;left:${pos.left};width:${pos.width};top:50%;transform:translateY(-50%);height:22px;background:${c};border-radius:5px;display:flex;align-items:center;padding:0 8px;overflow:hidden;z-index:4;box-shadow:0 1px 3px rgba(0,0,0,.15)">
              <span style="font-size:10px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${act.label}</span>
            </div>`;
          }

          html += `<div style="display:flex;align-items:stretch;background:${ai%2===0?'#fff':'#f9fafb'};border-top:1px solid #e5e7eb;min-height:36px">
            <div style="width:${LABEL_W}px;flex-shrink:0;padding:0 8px 0 32px;display:flex;align-items:center;gap:7px;overflow:hidden">
              <span class="material-symbols-outlined" style="font-size:14px;color:${def.color}">${def.icon}</span>
              <span style="font-size:11px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${act.label}</span>
            </div>
            <div style="flex:1;position:relative;display:flex"><div style="position:absolute;inset:0;display:flex">${stripeCols}</div>${bar}
              ${todayPct?`<div style="position:absolute;left:${todayPct};top:0;bottom:0;width:2px;background:#ef4444;opacity:.5;z-index:5"></div>`:''}
            </div>
          </div>`;
        });
      }
    });

    $('calc-gantt-inner').innerHTML = html;
    $('calc-gantt-legend').innerHTML = state.wps.map((wp, wi) => {
      const c = WP_COLORS[wi%WP_COLORS.length];
      return `<span class="flex items-center gap-1"><span class="w-3 h-3 rounded" style="background:${c}"></span>${wpLabel(wp,wi)}</span>`;
    }).join('') + (showToday ? '<span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-500"></span>Today</span>' : '');
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT HANDLERS (exposed for onclick)
     ══════════════════════════════════════════════════════════════ */

  function setPerdiem(pid, field, value) {
    if (!state.partnerRates[pid]) state.partnerRates[pid] = { aloj:105, mant:40 };
    state.partnerRates[pid][field] = parseFloat(value) || 0;
    const r = state.partnerRates[pid];
    const el = $('calc-pd-total-' + pid);
    if (el) el.textContent = euros((r.aloj||0) + (r.mant||0));
  }

  function setWorkerRate(id, field, value) {
    const w = state.workerRates.find(x => String(x.id) === String(id));
    if (!w) return;
    if (field === 'rate') {
      w.rate = parseFloat(value) || 0;
    } else if (field === 'category') {
      // Renaming category: keep the same id (which is pid::oldName) so existing
      // task profileIds keep matching. The displayed text changes; the link survives.
      w.category = value;
    } else {
      w[field] = value;
    }
    scheduleSave();
  }
  function addWorkerRate(pid) {
    // Find a non-colliding name (pid + name forms the id)
    let base = 'New category', name = base, n = 1;
    while (state.workerRates.some(w => w.pid === pid && w.category === name)) { name = base + ' ' + (++n); }
    state.workerRates.push({ id: wrId(pid, name), pid, category: name, rate: 100 });
    const el = $('calc-worker-rates');
    if (el) el.innerHTML = buildWorkerRatesHTML();
    scheduleSave();
  }
  function removeWorkerRate(id) {
    state.workerRates = state.workerRates.filter(w => String(w.id) !== String(id));
    const el = $('calc-worker-rates');
    if (el) el.innerHTML = buildWorkerRatesHTML();
    scheduleSave();
  }

  /* ── Extra destinations ──────────────────────────────────────── */
  function addExtraDest() {
    state.extraDestCounter++;
    state.extraDests.push({ id: '_ed' + state.extraDestCounter, name: '', country: '' });
    renderRoutes(getRouteContainer());
    // Focus the new city input
    const inputs = document.querySelectorAll('#calc-extra-dests input[placeholder*="City"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function removeExtraDest(idx) {
    const removed = state.extraDests[idx];
    if (removed) {
      // Clean up routes referencing this dest
      Object.keys(state.routes).forEach(k => {
        if (k.includes(removed.id)) delete state.routes[k];
      });
      state.extraDests.splice(idx, 1);
    }
    // Full re-render to update route table and reindex
    renderRoutes(getRouteContainer());
  }

  function setExtraDest(idx, field, value) {
    const ed = state.extraDests[idx];
    if (!ed) return;
    ed[field] = value;
    // Cuando el usuario rellena/cambia country, autocompletar aloj y mant
    // desde la tabla de perdiems-país. Sin esto el backend persiste 0/0
    // y el budget v2 calcula accom+subs=0 en mobilities hacia este destino.
    if (field === 'country' && value) {
      const ref = getPerdiemRef(value);
      if (ref) {
        ed.aloj = ref.aloj;
        ed.mant = ref.mant;
      }
    }
  }

  let _routeRefreshTimer = null;
  function refreshRoutes() {
    clearTimeout(_routeRefreshTimer);
    _routeRefreshTimer = setTimeout(() => {
      const container = getRouteContainer();
      if (!container) return;
      if (_embeddedMode) {
        renderRates(container);
      } else {
        renderRoutes(container);
      }
    }, 600);
  }

  function setRouteBand(a, b, bandIdx) {
    const k = routeKey(a, b);
    if (!state.routes[k]) state.routes[k] = { km:2500, green:true, custom_rate:DISTANCE_BANDS[4].green };
    const band = DISTANCE_BANDS[bandIdx] || DISTANCE_BANDS[0];
    state.routes[k].km = band.max === Infinity ? 8000 : Math.round((band.min + band.max) / 2);
    state.routes[k].auto = false;  // user manual override
    const official = state.routes[k].green ? band.green : band.std;
    state.routes[k].custom_rate = official;
    const offEl = $('calc-route-off-' + k);
    const custEl = $('calc-route-custom-' + k);
    if (offEl) offEl.textContent = '€' + official;
    if (custEl) custEl.value = official;
  }

  /* ── Auto-recalcular km de una ruta desde coords del partner ── */
  function autoRoute(aId, bId) {
    const km = autoKmBetween(aId, bId);
    if (km == null) {
      if (typeof Toast !== 'undefined') Toast.show('No hay coordenadas para esos partners', 'err');
      return;
    }
    const k = routeKey(aId, bId);
    if (!state.routes[k]) state.routes[k] = { km, green:true, custom_rate:0 };
    const r = state.routes[k];
    r.km = km;
    r.auto = true;
    const band = getBand(km);
    r.custom_rate = r.green ? band.green : band.std;
    renderRoutes(getRouteContainer());
    if (typeof Toast !== 'undefined') Toast.show(`Distancia: ${km} km · ${band.label}`, 'ok');
  }

  function getRouteContainer() {
    return $('intake-calc-container') || $('calc-step-container');
  }

  function setRoute(a, b, field, value) {
    const k = routeKey(a, b);
    if (!state.routes[k]) state.routes[k] = { km:2500, green:true, custom_rate:DISTANCE_BANDS[4].green };
    if (field === 'green') {
      const r = state.routes[k];
      r.green = !!value;
      const band = getBand(r.km);
      const newOfficial = r.green ? band.green : band.std;
      r.custom_rate = newOfficial;
      renderRoutes(getRouteContainer());
    } else if (field === 'custom_rate') {
      state.routes[k].custom_rate = value === '' ? null : parseFloat(value)||0;
    }
  }

  function setWP(wi, field, value) { state.wps[wi][field] = value; }
  function setWPCat(wi, cat) {
    state.wps[wi]._cat = cat;
    const el = $('calc-wp-list');
    if (el) el.innerHTML = buildWPListHTML();
  }
  function applyWPTitle(wi, title) {
    if (!title) return;
    state.wps[wi].name = title;
    state.wps[wi].desc = title;
    // Auto-fill summary if a predefined one exists and user hasn't written their own
    if (WP_SUMMARIES[title]) {
      const current = (state.wps[wi].summary || '').trim();
      // Only auto-fill if empty or if it matches another predefined summary (user hasn't customised)
      const isPredefined = !current || Object.values(WP_SUMMARIES).some(s => s === current);
      if (isPredefined) {
        state.wps[wi].summary = WP_SUMMARIES[title];
      }
    }
    // Update the text input and summary textarea in the WP header without full re-render
    const wpEl = document.getElementById('calc-wp-' + wi);
    if (wpEl) {
      const inp = wpEl.querySelector('input[type="text"]');
      if (inp) inp.value = title;
      const ta = wpEl.querySelector('textarea');
      if (ta && state.wps[wi].summary) ta.value = state.wps[wi].summary;
    }
    const el = $('calc-wp-list');
    if (el) el.innerHTML = buildWPListHTML();
  }
  function syncWPs(n) {
    syncWPCount(n);
    const el = $('calc-wp-list');
    if (el) el.innerHTML = buildWPListHTML();
  }

  function addActivity(wi, type) {
    if ((type === 'mgmt' || type === 'meeting') && wi !== 0) return;
    const id = ++state.actCounter;
    const def = ACT_TYPES[type];
    const act = { id, type, label: def.label };
    const ps = getProjectStart() || new Date();
    const mo = getProjectMonths();

    if (def.mobility) {
      act.host = state.partners[0]?.id;
      act.pax = 2; act.days = 3; act.local_pax = 0; act.local_transport = 25;
      act.participants = {};
      state.partners.forEach(p => { if (p.id !== act.host) act.participants[p.id] = true; });
    } else if (type === 'me') {
      act.me_events = {};
      state.partners.forEach(p => { act.me_events[p.id] = { active:true, local_pax:20, intl_pax:0, local_rate:100, intl_rate:200 }; });
    } else if (type === 'local_ws') {
      act.ws_partners = {};
      state.partners.forEach(p => { act.ws_partners[p.id] = { active:true, ws_pax:10, ws_n:6, ws_cost:50 }; });
    } else if (type === 'campaign') {
      act.camp_partners = {};
      state.partners.forEach(p => { act.camp_partners[p.id] = { active:true, monthly:100, months:mo }; });
    } else if (['equipment','goods','consumables','website','artistic','other'].includes(type)) {
      act.note_partners = {};
      state.partners.forEach(p => {
        act.note_partners[p.id] = ACT_TYPES[type]?.depreciation ? { active:true, note:'', amount:0, project_pct:100, lifetime_pct:100 } : { active:true, note:'', amount:0 };
      });
    } else if (type === 'io') {
      act.io_partner_days = {}; act.io_partner_profiles = {};
      state.partners.forEach(p => { act.io_partner_days[p.id] = 40; });
    } else if (type === 'mgmt') {
      act.rate_applicant = 500; act.rate_partner = 250;
    }

    act.date_start = toISO(ps);
    act.date_end = toISO(addMonths(ps, Math.min(6, mo)));

    state.wps[wi].activities.push(act);
    const actContainer = $(`calc-wp-acts-${wi}`);
    if (actContainer) actContainer.insertAdjacentHTML('beforeend', buildActivityCard(act, wi));
    recalcWP(wi);
  }

  function moveAct(wi, actId, dir) {
    const acts = state.wps[wi].activities;
    const idx = acts.findIndex(a => a.id === actId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= acts.length) return;
    [acts[idx], acts[newIdx]] = [acts[newIdx], acts[idx]];
    // Re-render the WP activities
    const container = $(`calc-wp-acts-${wi}`);
    if (container) {
      container.innerHTML = acts.map(a => buildActivityCard(a, wi)).join('');
      recalcWP(wi);
    }
  }

  function removeAct(wi, actId) {
    state.wps[wi].activities = state.wps[wi].activities.filter(a => a.id !== actId);
    const el = $(`calc-act-${actId}`);
    if (el) el.remove();
    recalcWP(wi);
  }

  function setAct(wi, actId, field, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    act[field] = isNaN(value) ? value : (parseFloat(value)||0);
    // Re-render mobility fields when pax/days change so partner table updates
    if ((field === 'pax' || field === 'days') && (act.type === 'meeting' || act.type === 'ltta')) {
      const el = $('calc-act-fields-' + actId);
      if (el) el.innerHTML = buildActFields(act, wi);
    }
    recalcWP(wi);
  }

  const SUBTYPE_DESC = {
    // Transnational Meetings
    'Kick-off meeting': 'We will bring all consortium partners together for the official launch of the project. During this meeting we will finalise roles and responsibilities, validate the work plan and timeline, set up communication tools (shared drive, project management platform, mailing lists), and agree on quality standards and reporting procedures. Each partner will present their institutional capacity and confirm their commitment to specific deliverables.',
    'Mid-term meeting': 'We will organise a face-to-face review session at the midpoint of the project to assess progress against milestones, analyse budget execution, and address any implementation challenges. Partners will present the status of their activities, share preliminary results, and collectively decide on any necessary adjustments to the work plan, calendar, or resource allocation for the remaining period.',
    'Final meeting': 'We will hold a closing consortium meeting to consolidate all project results, review the achievement of objectives and indicators, discuss lessons learned, and formalise the sustainability plan. Partners will sign off on final deliverables, agree on exploitation commitments, and plan any follow-up actions or spin-off initiatives beyond the project funding period.',
    'Coordination meeting': 'We will run a focused working session among partners to resolve specific operational issues, synchronise ongoing tasks, clarify deadlines, and redistribute workload where needed. This meeting will address practical coordination matters such as logistics for upcoming activities, document preparation, and internal communication improvements.',
    'Technical working meeting': 'We will dedicate this meeting to the hands-on development of specific project outputs, tools, or methodologies. Partners will work in task groups to co-develop content, review drafts, solve technical problems, and ensure consistency and quality across intellectual outputs. The meeting will produce concrete deliverables or validated prototypes.',
    'Strategic planning meeting': 'We will convene a high-level session to evaluate the project strategic direction, assess external opportunities and risks, plan synergies with other initiatives, and make decisions on dissemination positioning, policy engagement, and long-term partnership development. This meeting will connect day-to-day work with the broader impact goals of the consortium.',

    // LTTA / Mobility
    'Training mobility': 'We will deliver a structured training programme for participants travelling to the host country. The programme will combine expert-led sessions, hands-on workshops, group exercises, and real-case scenarios. Participants will acquire specific competences directly applicable to their professional practice, and each will produce a personal action plan for transferring the learning to their home organisation.',
    'Study visit mobility': 'We will organise guided visits to relevant organisations, institutions, or initiatives in the host country. Participants will observe working methods, interview practitioners, and document good practices through structured observation protocols. The visit findings will be compiled into a comparative report that feeds into the project methodology.',
    'Group mobility': 'We will bring together a mixed group of participants from all partner countries for an intensive collaborative learning experience. The programme will include team challenges, intercultural workshops, joint production sessions, and reflection activities. The aim is to build a shared knowledge base and strengthen the transnational dimension of the project.',
    'Youth exchange mobility': 'We will organise a non-formal learning programme for young participants from different countries. The programme will use participatory methods such as group dynamics, creative workshops, debates, cultural activities, and peer-to-peer exchange. Participants will develop key competences including teamwork, communication, intercultural awareness, and active citizenship.',
    'Staff mobility': 'We will send staff members to a partner organisation for professional development and exchange of practices. Participants will take part in job-related activities, attend internal training sessions, and collaborate with the host team on project-related tasks. The mobility will strengthen institutional cooperation and bring back concrete improvements to the sending organisation.',
    'Job shadowing mobility': 'We will embed participants in the daily operations of a host organisation to observe and learn from their working methods, internal processes, and professional culture. Participants will follow specific colleagues through their routines, attend meetings, and document insights. The experience will generate a structured reflection report with transferable recommendations.',
    'Peer learning mobility': 'We will facilitate a horizontal exchange where participants from different organisations share their expertise, challenges, and solutions around a common theme. The programme will use peer coaching, case clinics, fishbowl discussions, and collaborative problem-solving. Each participant will contribute their experience and leave with practical ideas tested by peers.',
    'Blended mobility': 'We will combine an online preparatory phase with a physical mobility and a follow-up phase. Participants will complete pre-arrival learning modules, engage in intensive face-to-face activities during the mobility, and then apply and reflect on their learning through post-mobility online tasks. This structure maximises learning depth and ensures continuity.',
    'Pilot mobility': 'We will use this mobility to field-test tools, methods, or approaches developed earlier in the project. Participants will run structured pilot sessions, collect quantitative and qualitative feedback through evaluation forms and focus groups, and produce a validation report with specific improvement recommendations for the final versions of the outputs.',
    'Volunteering mobility': 'We will place participants in community-based settings where they will contribute to local initiatives while developing personal and professional skills. Activities will combine practical service (supporting workshops, assisting events, community outreach) with structured reflection sessions. Participants will document their experience in a learning portfolio.',
    'Expert mobility': 'We will invite subject-matter experts to travel to a partner location and deliver specialised input — training sessions, technical reviews, mentoring, or quality assessment of project outputs. The expert will work directly with the local team and provide a written report with recommendations. This ensures high-level technical quality in specific project areas.',
    'Community immersion mobility': 'We will immerse participants in a local community context where they will engage directly with residents, local organisations, and grassroots initiatives. Activities will include participatory observation, interviews, joint workshops, and collaborative reflection. Participants will produce an immersion diary and a set of community-validated insights for the project.',

    // Intellectual Outputs
    'Educational manual': 'We will produce a comprehensive educational manual that combines theoretical foundations, practical activities, case studies, and facilitation guidelines. The manual will be structured in modules, tested with real users during pilot phases, and published in multiple languages. It will serve as the primary reference resource for trainers and educators using the project methodology.',
    'Methodological guide': 'We will develop a step-by-step methodological guide that documents the approach, processes, and tools created by the project. The guide will include implementation instructions, quality criteria, adaptation tips for different contexts, and real examples from the pilot phase. It will enable any organisation to replicate the methodology independently.',
    'Training course / module': 'We will design a complete training programme with learning objectives, session plans, activities, assessment methods, and supporting materials. The course will be structured in self-contained modules that can be delivered together or independently. It will be validated through pilot delivery and refined based on participant and trainer feedback.',
    'Toolkit': 'We will create a practical, ready-to-use toolkit containing templates, checklists, activity cards, decision frameworks, and facilitation resources. Each tool will include clear instructions and real-world examples. The toolkit will be designed for practitioners who need to act quickly and effectively without extensive prior training.',
    'Research report / needs analysis': 'We will conduct primary and secondary research including surveys, interviews, focus groups, and desk analysis to map the current situation, identify gaps, and establish an evidence base for the project approach. The report will include data analysis, key findings, comparative country perspectives, and actionable recommendations that directly inform the next project phases.',
    'Digital platform / interactive tool': 'We will build a web-based platform or interactive digital tool that serves the project target groups. The platform will include user accounts, content management, interactive features (quizzes, forums, resource libraries), and multilingual support. It will be developed iteratively with user testing at each stage and designed for sustainability beyond the project period.',

    // Multiplier Events
    'Launch event': 'We will organise a public event to officially present the project to key stakeholders, potential beneficiaries, media, and institutional partners. The event will include project presentations, panel discussions, networking sessions, and distribution of promotional materials. We aim to generate media coverage and secure early engagement commitments from external organisations.',
    'Dissemination conference': 'We will host a conference to present project activities, interim or final results, and key outputs to a targeted professional audience. The programme will include keynote presentations, thematic workshops, poster sessions, and open Q&A. We will produce a conference report and distribute it through our networks to multiply the reach of our findings.',
    'Final conference': 'We will organise a high-profile closing event to showcase all project achievements, present final outputs, and demonstrate impact with concrete data and testimonials. The conference will feature partner presentations, beneficiary stories, policy recommendations, and a formal handover of sustainability commitments. We will invite institutional representatives and media.',
    'Stakeholder event': 'We will convene key stakeholders — policy-makers, practitioners, institutional representatives, and community leaders — for a structured dialogue session around the project theme. The event will include presentations of project findings, working group discussions, and the co-production of recommendations. We will publish the outcomes as a stakeholder brief.',
    'Networking event': 'We will facilitate a structured networking session connecting project participants with external organisations, potential collaborators, and sector professionals. The event will use speed networking, thematic roundtables, and collaboration mapping exercises to create concrete connections. Each participant will leave with a minimum of five new professional contacts and potential follow-up actions.',
    'Public presentation event': 'We will present a specific project output or achievement to the general public through an open event combining live demonstrations, interactive exhibits, short talks, and audience participation. The event will be designed to be accessible and engaging for non-specialist audiences, with clear messaging about the project value and how people can benefit from or contribute to the results.',

    // Local Workshops
    'Training workshop': 'We will deliver a hands-on training workshop for local participants focused on building specific skills and competences related to the project theme. The workshop will combine expert input, practical exercises, group work, and individual reflection. Each participant will complete a pre- and post-assessment to measure learning progress.',
    'Participatory workshop': 'We will run a collaborative workshop where participants actively contribute their knowledge, experiences, and ideas. Using facilitation techniques such as world café, open space, and dotmocracy, we will ensure every voice is heard. The workshop outputs will be documented and directly integrated into the project development process.',
    'Awareness workshop': 'We will organise an interactive session to raise awareness about the core issues addressed by the project. The workshop will use storytelling, data visualisation, group discussion, and reflective exercises to help participants understand the problem, its impact, and possible responses. We will measure awareness change through pre/post questionnaires.',
    'Co-creation workshop': 'We will facilitate a collaborative production session where participants jointly develop content, tools, or solutions for the project. Using design thinking, brainstorming, prototyping, and iterative feedback, participants will produce tangible draft outputs. The results will be refined by the project team and credited to the co-creation group.',
    'Community workshop': 'We will engage local community members in a workshop that connects the project theme with their lived experiences and local context. Activities will include community mapping, storytelling circles, group problem-solving, and action planning. The workshop will produce community-validated recommendations that ground the project in real local needs.',
    'Testing / pilot workshop': 'We will run a controlled test session where participants experience a draft tool, method, or activity exactly as it would be delivered in its final form. We will collect structured feedback through observation, questionnaires, and group debriefing. The results will produce a detailed validation report with specific revision points for the final version.',

    // Personal Work
    'One-to-one mentoring': 'We will pair each participant with a qualified mentor for a structured series of individual sessions. Each pair will define personal learning goals, follow a regular meeting cadence, and document progress through reflection notes. Mentors will receive a guide and supervision. The process will support self-awareness, skill development, and personal growth aligned with the project theme.',
    'Personal accompaniment': 'We will provide individualised accompaniment throughout the participant\'s journey in the project. Each participant will have a reference person who follows their evolution, removes barriers, adapts the pathway, and offers continuous support. The accompaniment will be documented with case notes and personal milestones, ensuring inclusion and personalised quality.',
    'Coaching pathway': 'We will deliver a structured coaching pathway combining goal-setting sessions, action plans, accountability check-ins, and reflective practice. A qualified coach will accompany each participant through a defined number of sessions, supporting them in achieving concrete personal or professional objectives related to the project topic.',
    'Reflective journaling': 'We will introduce reflective journaling as a personal work practice across the project. Participants will keep a structured journal with prompts, exercises, and milestones designed to deepen self-awareness and document the learning journey. Selected anonymised excerpts will inform the project evaluation and quality outputs.',
    'Individual portfolio': 'Each participant will produce a personal portfolio compiling their work, reflections, evidence of learning, and competence development throughout the project. The portfolio will follow a shared template, include peer and self-assessment, and serve as a tangible personal output that participants can use beyond the project (CV, applications, further studies).',
    'Personal creation project': 'Each participant will design and develop an individual creation project aligned with the project theme — an artwork, plan, prototype, short publication, or any tangible result that expresses their personal contribution. The process will include guidance sessions, peer feedback, and a final presentation. The personal creations will form part of the project\'s collective outputs.',

    // Dissemination
    'Social media dissemination': 'We will run targeted social media campaigns across TikTok, Instagram, Facebook, LinkedIn, and X (Twitter) to disseminate project activities, results, and calls to action. We will produce platform-specific content — short videos, reels, carousels, infographics, and stories — following a monthly editorial calendar. We will track engagement metrics (reach, impressions, clicks, shares) and adjust our strategy quarterly.',
    'Newsletter dissemination': 'We will produce and distribute a periodic newsletter (monthly or quarterly) to a curated mailing list of stakeholders, participants, and interested organisations. Each issue will include project updates, partner highlights, upcoming events, resource links, and calls for engagement. We will use an email marketing platform to track open rates, click-throughs, and subscriber growth.',
    'Press / media dissemination': 'We will engage traditional and digital media through press releases, media kits, journalist briefings, and opinion articles placed in relevant outlets. We will target sector-specific publications, regional newspapers, radio stations, and online news platforms. Each major project milestone will be accompanied by a media outreach action with measurable coverage targets.',
    'Video dissemination': 'We will produce professional video content — project trailers, activity highlights, beneficiary testimonials, explainer animations, and event recaps — to communicate our work in the most engaging format. Videos will be optimised for social media, embedded on the project website, and submitted to relevant video platforms and conferences. We will subtitle all content in the consortium languages.',
    'Community / stakeholder dissemination': 'We will carry out direct outreach to local communities, professional networks, institutional partners, and sector stakeholders through targeted presentations, information sessions, printed materials, and personal invitations. We will attend external events, contribute to partner newsletters, and establish a referral network to ensure our results reach the people who can use them most.',
    'Printed dissemination': 'We will design and produce high-quality printed materials — brochures, posters, flyers, factsheets, and executive summaries — for distribution at events, partner premises, public institutions, and community spaces. All materials will follow the project brand guidelines and include EU co-funding acknowledgement. We will print in the languages of the consortium countries.',

    // Website
    'Project website': 'We will build and maintain a professional project website that serves as the central hub for all public information. The site will include project description, partner profiles, news and blog, event calendar, downloadable resources, contact form, and EU visibility requirements. We will optimise it for SEO, mobile responsiveness, and accessibility (WCAG 2.1 AA).',
    'Landing page': 'We will create a focused single-page site designed to drive a specific action — event registration, resource download, survey participation, or newsletter sign-up. The page will use clear messaging, a strong call-to-action, and integrated analytics to measure conversion rates. We will create multiple landing pages for different campaign purposes throughout the project.',
    'Resource website': 'We will develop a dedicated online space where all project outputs, publications, tools, and multimedia resources can be browsed, previewed, and downloaded. The site will include search and filter functionality, metadata tags, and multilingual support. It will be designed for long-term hosting to ensure post-project availability of results.',
    'Learning platform': 'We will develop an online learning environment where users can access training modules, complete exercises, track their progress, and obtain certificates. The platform will support multimedia content, interactive assessments, discussion forums, and learner profiles. We will use an open-source LMS (e.g. Moodle) or build a custom solution depending on project needs.',
    'Community platform': 'We will create an interactive online space where project participants, alumni, and stakeholders can connect, share resources, participate in discussions, and collaborate on follow-up initiatives. The platform will include user profiles, messaging, content sharing, and group spaces. It will be designed to sustain the project community beyond the funding period.',
    'Results repository': 'We will build a structured online repository that catalogues, organises, and makes permanently accessible all project deliverables, datasets, reports, and tools. Each entry will include metadata, version history, licensing information, and usage guidelines. The repository will be hosted on a sustainable infrastructure to guarantee availability for at least five years after the project ends.',

    // Artistic Fees
    'Graphic design': 'We will commission professional graphic design services to create the project visual identity (logo, colour palette, typography, templates) and to design all key materials — reports, presentations, social media assets, infographics, and event visuals. The designer will produce a brand manual and deliver all files in editable and print-ready formats.',
    'Video production / editing': 'We will hire professional videographers and editors to produce high-quality video content including project documentary footage, interviews, event coverage, educational content, and promotional clips. All videos will be colour-graded, subtitled in consortium languages, and delivered in formats optimised for web, social media, and conference projection.',
    'Photography': 'We will engage a professional photographer to document key project activities, events, and outputs with high-resolution imagery. The photo archive will be used across all communication channels — website, social media, reports, and printed materials. All images will be properly released and credited, with model consent forms collected where applicable.',
    'Illustration / branding': 'We will commission custom illustrations and visual elements to give the project a distinctive, recognisable identity. This includes character design, infographic illustrations, icon sets, and decorative elements for publications and digital media. The illustrator will work closely with the communication team to ensure visual consistency across all outputs.',
    'Audio / podcast production': 'We will produce a series of podcast episodes or audio resources covering project themes, partner perspectives, expert interviews, and beneficiary stories. Each episode will be professionally recorded, edited, and published on major podcast platforms (Spotify, Apple Podcasts, Google Podcasts). We will promote episodes through our social media channels and newsletter.',
    'Artistic facilitation / performance': 'We will engage artists or creative facilitators to lead participatory activities during workshops, events, or training sessions. This may include theatre-based methods, visual facilitation, music, movement, or storytelling techniques. The artistic dimension will make activities more inclusive, emotionally engaging, and memorable for participants.',

    // Equipment
    'Computers / laptops': 'We will purchase computers or laptops necessary for project implementation — content development, platform management, video editing, online training delivery, and day-to-day coordination. Equipment will be assigned to specific project tasks, and depreciation will be calculated according to EU financial rules. After the project, equipment will remain with the partner organisations for continued use.',
    'Tablets / mobile devices': 'We will acquire tablets or mobile devices to support fieldwork, data collection, interactive workshop facilitation, and participant access to digital resources. Devices will be configured with project-specific apps and tools. They will be particularly useful for activities in community settings or locations without fixed computer infrastructure.',
    'Audio-visual equipment': 'We will purchase projectors, screens, portable speakers, and related AV equipment to ensure professional delivery of training sessions, workshops, and public events across partner locations. Equipment will be shared among partners as needed and managed through an inventory tracking system.',
    'Recording equipment': 'We will acquire professional-grade microphones, cameras, tripods, lighting kits, and audio interfaces for recording project activities, producing video content, and creating podcast episodes. Equipment specifications will be aligned with our production quality standards and will serve multiple activities throughout the project lifecycle.',
    'Educational / workshop equipment': 'We will purchase specialised equipment needed to deliver hands-on workshop activities — this may include demonstration materials, training simulators, modular furniture, display boards, or field equipment depending on the project methodology. Each item will be justified by its direct connection to planned activities.',
    'Event technical equipment': 'We will acquire technical equipment for organising professional events — portable PA systems, wireless microphones, presentation clickers, streaming hardware, and signage displays. This equipment will be reused across multiple project events and will remain available for partner organisations after the project.',

    // Other Goods
    'Printed materials': 'We will produce printed brochures, handbooks, reference cards, posters, and other materials needed for training sessions, events, and public dissemination. All materials will be professionally designed, printed on quality paper, and distributed to participants, institutions, and public spaces. Print runs will be calculated based on confirmed participant numbers plus a dissemination margin.',
    'Educational materials': 'We will produce physical educational resources — printed manuals, activity card decks, learning kits, visual aids, and reference guides — that participants will use during and after training activities. Materials will be designed to be durable, self-explanatory, and usable in both facilitated and self-directed learning contexts.',
    'Visibility materials': 'We will produce branded visibility items — roll-up banners, table displays, flag banners, name badges, and event signage — that will be used at all project events and partner premises. All items will comply with EU co-funding visibility requirements and feature the project logo, EU emblem, and funding acknowledgement.',
    'Workshop materials': 'We will purchase stationery, flip charts, sticky notes, markers, printed worksheets, and other practical materials needed to run interactive workshops effectively. Materials will be prepared in advance for each session and budgeted based on planned participant numbers and workshop methodology requirements.',
    'Event materials': 'We will produce event-specific materials including programmes, name badges, feedback forms, signage, participant folders, and evaluation questionnaires. Materials will be tailored to each event format (conference, workshop, networking) and produced in the relevant languages. Digital alternatives will be used where appropriate to reduce environmental impact.',
    'Participant kits / welcome packs': 'We will prepare welcome packs for participants at major project events and mobilities. Each kit will include a project folder, programme, relevant publications, a branded notebook and pen, practical information sheet, and feedback form. Kits will be designed to be useful and informative while reinforcing the project brand identity.',

    // Consumables
    'Printing consumables': 'We will purchase paper, ink cartridges, toner, and binding materials needed for in-house production of project documents, workshop handouts, draft reports, and internal communication materials. Quantities will be estimated based on planned print volumes across all project activities.',
    'Workshop consumables': 'We will purchase disposable materials consumed during workshops — marker refills, flip chart paper, adhesive materials, craft supplies, printed exercise sheets, and other activity-specific items. Budget is calculated per workshop based on methodology and participant numbers.',
    'Office consumables': 'We will cover the cost of everyday office supplies needed for project administration — paper, envelopes, folders, pens, printer cartridges, and filing materials. These consumables support the continuous operational needs of project coordination and reporting across all partner offices.',
    'Hygiene / cleaning consumables': 'We will provide cleaning and hygiene supplies for project spaces used during workshops, meetings, and events — hand sanitiser, surface disinfectant, paper towels, and waste bags. This ensures safe and comfortable conditions for all participants, particularly in shared or rented venues.',
    'Catering consumables': 'We will purchase disposable catering items — cups, plates, napkins, cutlery, and serving materials — needed for coffee breaks, working lunches, and networking receptions during project events. Quantities will be planned per event based on confirmed participant numbers. We will prioritise recyclable or compostable options.',
    'Technical consumables': 'We will purchase small technical items consumed during project activities — USB drives, batteries, memory cards, adapter cables, and replacement parts for recording or workshop equipment. These items support the reliable functioning of technical infrastructure across events, production sessions, and training activities.',

    // Other Costs
    'Translation / interpretation costs': 'We will hire professional translators and interpreters to ensure all key project outputs, events, and communications are accessible in the consortium languages. This includes written translation of deliverables, simultaneous or consecutive interpretation at transnational meetings and events, and proofreading of multilingual publications.',
    'External expert / trainer costs': 'We will contract external specialists to deliver specific training sessions, provide technical consultancy, review project outputs, or contribute expertise that is not available within the consortium. Each expert engagement will be documented with a terms of reference, contract, and deliverable report.',
    'Venue / space rental costs': 'We will rent appropriate venues for workshops, training sessions, conferences, and consortium meetings when partner premises are not available or suitable. Venue selection will consider capacity, accessibility, technical equipment, and location. We will negotiate institutional rates and prioritise venues with inclusive access.',
    'Hosting / software / platform costs': 'We will cover hosting fees, domain registrations, software licences, and subscription costs for digital tools used in project implementation — website hosting, learning platform, project management tools, video conferencing, cloud storage, and design software. All tools will be selected based on functionality, data protection compliance, and cost-effectiveness.',
    'Travel / accommodation support costs': 'We will cover supplementary travel and accommodation costs that fall outside standard mobility unit costs — additional transport legs, visa fees, accessible travel arrangements, pre-arrival hotel nights, or travel insurance. These costs ensure that all participants, including those with specific needs, can fully participate in project activities.',
    'Evaluation / administrative support costs': 'We will contract external evaluators or administrative support to strengthen project quality assurance, produce independent evaluation reports, assist with financial reporting, or manage specific logistical tasks. External evaluation will follow a structured methodology with clear indicators and will produce mid-term and final assessment reports.',
  };

  function setActSubtype(wi, actId, subtype) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    act.subtype = subtype;
    if (subtype) {
      act.label = subtype;
      // Auto-fill description with base text if empty or was auto-generated
      const baseDesc = SUBTYPE_DESC[subtype] || '';
      if (baseDesc && (!act.desc || act._autoDesc)) {
        act.desc = baseDesc;
        act._autoDesc = true; // flag to know it was auto-generated
      }
    }
    // Re-render
    const container = getRouteContainer()?.closest('#intake-calc-container') || $('calc-root');
    if (container) renderMergedWPs(container);
  }

  function setActOnline(wi, actId, online) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    act.online = online;
    // Re-render
    const container = getRouteContainer()?.closest('#intake-calc-container') || $('calc-root');
    if (container) renderMergedWPs(container);
    recalcWP(wi);
  }

  function setActDesc(wi, actId, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    act.desc = value;
    act._autoDesc = false; // user edited, don't overwrite on subtype change
  }

  function setActHost(wi, actId, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    act.host = value;
    act.participants = {};
    state.partners.forEach(p => { if (p.id !== act.host) act.participants[p.id] = true; });
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildActFields(act, wi);
    recalcWP(wi);
  }

  function setParticipant(wi, actId, pid, active) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    if (!act.participants) act.participants = {};
    act.participants[pid] = active;
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildActFields(act, wi);
    recalcWP(wi);
  }

  function setIOStaff(wi, actId, pid, si, field, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act || !act.io_staff || !act.io_staff[pid]) return;
    const s = act.io_staff[pid].staff[si];
    if (!s) return;
    if (field === 'days') s.days = parseFloat(value) || 0;
    else if (field === 'profileId') s.profileId = value || null;
    else s[field] = value;
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildIOFields(act, wi);
    recalcWP(wi);
  }
  function addIOStaff(wi, actId, pid) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act || !act.io_staff || !act.io_staff[pid]) return;
    act.io_staff[pid].staff.push({ profileId: null, days: 10, tasks: '' });
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildIOFields(act, wi);
  }
  function removeIOStaff(wi, actId, pid, si) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act || !act.io_staff || !act.io_staff[pid]) return;
    act.io_staff[pid].staff.splice(si, 1);
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildIOFields(act, wi);
    recalcWP(wi);
  }
  function setIOPartnerActive(wi, actId, pid, active) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act || !act.io_staff) return;
    if (!act.io_staff[pid]) act.io_staff[pid] = { active: true, staff: [{ profileId: null, days: 20, tasks: '' }] };
    act.io_staff[pid].active = active;
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildIOFields(act, wi);
    recalcWP(wi);
  }
  // Legacy compatibility
  function setIODays(wi, actId, pid, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    if (!act.io_partner_days) act.io_partner_days = {};
    act.io_partner_days[pid] = parseFloat(value)||0;
    recalcWP(wi);
  }
  function setIOProfile(wi, actId, pid, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act) return;
    if (!act.io_partner_profiles) act.io_partner_profiles = {};
    act.io_partner_profiles[pid] = value ? parseInt(value) : null;
    const el = $('calc-act-fields-' + actId);
    if (el) el.innerHTML = buildActFields(act, wi);
    recalcWP(wi);
  }

  function setME(wi, actId, pid, field, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act || !act.me_events) return;
    if (!act.me_events[pid]) act.me_events[pid] = { active:true, local_pax:20, intl_pax:0, local_rate:100, intl_rate:200 };
    if (field === 'active') {
      act.me_events[pid].active = value;
      const el = $('calc-act-fields-' + actId);
      if (el) el.innerHTML = buildActFields(act, wi);
    } else {
      act.me_events[pid][field] = parseFloat(value)||0;
    }
    recalcWP(wi);
  }

  function setPartnerDetail(wi, actId, stateKey, pid, field, value) {
    const act = state.wps[wi].activities.find(a => a.id === actId);
    if (!act || !act[stateKey]) return;
    if (field === 'active') {
      act[stateKey][pid][field] = value;
      const el = $('calc-act-fields-' + actId);
      if (el) el.innerHTML = buildActFields(act, wi);
    } else {
      act[stateKey][pid][field] = ['note'].includes(field) ? value : (parseFloat(value)||0);
      // Re-render fields so per-partner totals update live
      const el = $('calc-act-fields-' + actId);
      if (el) el.innerHTML = buildActFields(act, wi);
    }
    recalcWP(wi);
  }

  function toggleWP(wi) { $(`calc-wp-${wi}`)?.classList.toggle('open'); }

  function switchResTab(name) {
    document.querySelectorAll('.calc-res-tab').forEach(t => t.classList.remove('active'));
    ['summary','wp','partner'].forEach(n => { const el = $('calc-res-'+n); if (el) el.style.display = 'none'; });
    document.querySelector(`.calc-res-tab:nth-child(${name==='partner'?1:name==='wp'?2:3})`).classList.add('active');
    const el = $('calc-res-'+name);
    if (el) el.style.display = 'block';
  }

  function setGanttView(mode) { ganttView = mode; renderGantt(getRouteContainer()); }
  function ganttToggle(wi) { ganttCollapsed[wi] = !ganttCollapsed[wi]; buildGanttChart(); }
  function ganttCollapseAll() { state.wps.forEach((_,wi) => ganttCollapsed[wi]=true); buildGanttChart(); }
  function ganttExpandAll() { state.wps.forEach((_,wi) => ganttCollapsed[wi]=false); buildGanttChart(); }

  function backToSelector() {
    currentProjectId = null;
    currentStep = -1;
    maxReached = -1;
    state = { project:null, partners:[], partnerRates:{}, workerRates:[], wrCounter:0, routes:{}, extraDests:[], extraDestCounter:0, wps:[], actCounter:0, mgmt:{rate_applicant:500,rate_partner:250} };
    renderProjectSelector();
  }

  /* ══════════════════════════════════════════════════════════════
     LIBRARY API — used by Intake to embed calculator steps
     ══════════════════════════════════════════════════════════════ */

  let _embeddedMode = false;
  let _navCallback = null;

  /**
   * Initialize Calculator state from Intake data, without rendering the shell/selector.
   * @param {Object} projectData - project object {id, name, type, start_date, duration_months, eu_grant, cofin_pct, indirect_pct}
   * @param {Array} partnerList - array of partner objects [{id, name, city, country, order_index, role}]
   */
  async function initFromIntake(projectData, partnerList) {
    _embeddedMode = true;
    currentProjectId = projectData.id;
    state.project = projectData;
    state.partners = (partnerList || []).sort((a, b) => a.order_index - b.order_index);

    // Load reference rates from Data E+
    await loadRefRates();

    // Init default rates from partner countries (using Data E+ reference rates)
    state.partnerRates = {};
    state.workerRates = [];
    state.wrCounter = 0;
    state.partners.forEach(p => {
      state.partnerRates[p.id] = getPerdiemRef(p.country);
      const staffRates = getStaffRatesForCountry(p.country);
      staffRates.forEach(sr => {
        state.workerRates.push({ id: wrId(p.id, sr.label), pid: p.id, category: sr.label, rate: sr.rate });
      });
    });

    // Init default routes — auto-derive km vía Haversine si hay coords
    state.routes = {};
    const defaultBand2 = DISTANCE_BANDS[4]; // 2000-2999 km
    const defaultKm2 = Math.round((defaultBand2.min + defaultBand2.max) / 2);
    for (let i = 0; i < state.partners.length; i++) {
      for (let j = i + 1; j < state.partners.length; j++) {
        const aId = state.partners[i].id, bId = state.partners[j].id;
        const km = autoKmBetween(aId, bId);
        const useKm = km != null ? km : defaultKm2;
        const band = getBand(useKm);
        state.routes[routeKey(aId, bId)] = {
          km: useKm,
          green: true,
          custom_rate: band.green,
          auto: km != null,
        };
      }
    }

    // Init default WPs (4)
    state.wps = [];
    state.actCounter = 0;
    syncWPCount(4);

    // Try to load saved state from server (overlays defaults)
    if (currentProjectId && !currentProjectId.startsWith('intake-temp-')) {
      try {
        const saved = await API.get('/calculator/projects/' + currentProjectId + '/state');
        if (saved) {
          if (saved.partnerRates && Object.keys(saved.partnerRates).length) {
            // Merge: saved rates + defaults for new partners
            state.partnerRates = { ...state.partnerRates, ...saved.partnerRates };
          }
          // Worker rates: keep fresh Data E+ category list, but preserve
          // user-edited rates and any custom categories the user added.
          if (saved.workerRates && saved.workerRates.length) {
            state.workerRates = state.workerRates.map(fresh => {
              const m = saved.workerRates.find(s => s.pid === fresh.pid && s.category === fresh.category);
              return m ? { ...fresh, rate: m.rate } : fresh;
            });
            saved.workerRates.forEach(s => {
              const exists = state.workerRates.some(fresh => fresh.pid === s.pid && fresh.category === s.category);
              if (!exists) state.workerRates.push({ id: wrId(s.pid, s.category), pid: s.pid, category: s.category, rate: s.rate });
            });
          }
          // Map para traducir uuid del extra_dest (cómo viene en saved.routes
          // desde BD) al id frontend (_edN) que usaremos para las keys de
          // state.routes. Sin esto, las routes hacia extra_dests cargadas
          // de BD nunca matchean la key que el frontend genera al renderizar.
          const edDbToFront = {};
          if (saved.extraDests && saved.extraDests.length) {
            state.extraDests = saved.extraDests.map((ed, i) => {
              const frontId = '_ed' + (i + 1);
              if (ed.db_id) edDbToFront[ed.db_id] = frontId;
              const out = { id: frontId, ...ed };
              if (out.country && (!out.aloj || !out.mant)) {
                const ref = getPerdiemRef(out.country);
                if (ref) {
                  out.aloj = out.aloj || ref.aloj;
                  out.mant = out.mant || ref.mant;
                }
              }
              delete out.db_id;
              return out;
            });
            state.extraDestCounter = saved.extraDests.length;
          }
          // Traduce las keys de saved.routes: si un endpoint es el uuid de un
          // extra_dest, sustitúyelo por su id frontend (_edN).
          if (saved.routes && Object.keys(saved.routes).length) {
            const translatedRoutes = {};
            for (const [key, val] of Object.entries(saved.routes)) {
              const parts = key.split('_').filter(Boolean);
              const ep = parts.map(p => edDbToFront[p] || p);
              // Reordena canónicamente y normaliza prefijo del _edN
              const aa = ep[0] || '';
              const bb = ep[1] || '';
              const nk = (aa < bb) ? aa + '_' + bb : bb + '_' + aa;
              translatedRoutes[nk] = val;
            }
            state.routes = { ...state.routes, ...translatedRoutes };
          }
          if (saved.wps && saved.wps.length) {
            // Restore WPs with sequential activity IDs
            let actId = 0;
            state.wps = saved.wps.map(wp => ({
              ...wp,
              activities: (wp.activities || []).map(a => ({ ...a, id: ++actId }))
            }));
            state.actCounter = actId;

            // Heal orphan profileIds: tasks created before workerRate ids became deterministic
            // had numeric profileIds that no longer match. Re-bind to the partner's first
            // category so dropdown and calc agree, instead of dropdown=first / calc=average.
            const validIds = new Set(state.workerRates.map(w => String(w.id)));
            let orphanCount = 0;
            state.wps.forEach(wp => (wp.activities || []).forEach(act => {
              if (!act.io_staff) return;
              for (const pid of Object.keys(act.io_staff)) {
                const slot = act.io_staff[pid];
                if (!slot || !slot.staff) continue;
                const first = state.workerRates.find(w => w.pid === pid);
                slot.staff.forEach(st => {
                  if (st.profileId == null) return;
                  if (!validIds.has(String(st.profileId))) {
                    st.profileId = first ? first.id : null;
                    orphanCount++;
                  }
                });
              }
            }));
            if (orphanCount > 0) {
              console.log('[Calc] healed', orphanCount, 'orphan task profileIds (re-bound to partner first category)');
              scheduleSave();
            }
          }
          console.log('[Calc] loaded saved state from server — wps:', state.wps.length, 'total acts:', state.wps.reduce((s,w)=>s+w.activities.length,0));
        }
      } catch (err) {
        console.error('[Calc] loadFullState error:', err);
        console.log('[Calc] no saved state found, using defaults');
      }
    }

    // Ensure WP1 always has a mgmt activity (same as renderMergedWPs does)
    if (state.wps[0] && state.wps[0].activities.length === 0) {
      state.wps[0].activities.push({
        id: ++state.actCounter, type: 'mgmt', label: 'Project Management',
        rate_applicant: 500, rate_partner: 250,
        desc: 'We will coordinate and manage all project operations throughout its full duration.',
        date_start: toISO(getProjectStart()), date_end: toISO(addMonths(getProjectStart() || new Date(), getProjectMonths()))
      });
      scheduleSave();
    }

    maxReached = 0;
    console.log('[Calc] initFromIntake done —', state.partners.length, 'partners');
  }

  /** Set a callback for navigation buttons instead of Calculator._goTo */
  function setNavCallback(fn) { _navCallback = fn; }

  /** Build nav buttons that call the nav callback if set, or Calculator._goTo */
  function embeddedNavButtons(prevStep, nextStep, nextLabel) {
    const navFn = _navCallback ? 'Intake._calcNav' : 'Calculator._goTo';
    return `<div class="flex justify-between mt-6">
      ${prevStep !== null ? `<button onclick="${navFn}(${prevStep})" class="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface border border-outline-variant rounded-lg transition-colors">\u2190 Back</button>` : '<span></span>'}
      ${nextStep !== null ? `<button onclick="${navFn}(${nextStep})" class="px-5 py-2.5 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary-container transition-colors">${nextLabel || 'Next \u2192'}</button>` : ''}
    </div>`;
  }

  /** Render Rates step into a container (for Intake embedding) */
  function renderRatesInto(container) { renderRates(container); }

  /** Render Routes step into a container */
  function renderRoutesInto(container) { renderRoutes(container); }

  /** Render merged WP + Activities into a single step */
  function renderMergedWPs(container) {
    // Ensure WP1 has mgmt
    if (state.wps[0] && state.wps[0].activities.length === 0) {
      state.wps[0].activities.push({
        id: ++state.actCounter, type: 'mgmt', label: 'Project Management',
        rate_applicant: 500, rate_partner: 250,
        desc: 'We will coordinate and manage all project operations throughout its full duration. We will handle internal communication between partners, financial oversight, progress monitoring against milestones, and quality assurance. The coordinator will organise regular online meetings and prepare interim and final reports. All partners will contribute to administrative tasks, reporting, and compliance with the grant agreement.',
        date_start: toISO(getProjectStart()), date_end: toISO(addMonths(getProjectStart() || new Date(), getProjectMonths()))
      });
    }

    const directTotal = state.wps.reduce((s, wp) => s + wp.activities.reduce((ss, a) => ss + calcActivity(a).total, 0), 0);
    const { total } = applyIndirectCosts(directTotal);
    const { totalProject } = getFinancials();
    const usePct = totalProject > 0 ? Math.min(total / totalProject * 100, 100).toFixed(1) : 0;
    const isOver = Math.round(totalProject - total) < 0;

    const nav = _embeddedMode ? embeddedNavButtons(1, 3, 'Presupuesto \u2192') : navButtons(0, 2, 'Activities \u2192');

    container.innerHTML = `
      <h2 class="font-headline text-lg font-bold mb-1">Work Packages & Activities</h2>
      <p class="text-sm text-on-surface-variant mb-4">Define WPs and add activities to each one. 4 WPs pre-loaded.</p>

      <!-- WP count -->
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-semibold text-on-surface-variant">Number of WPs</label>
        <input type="number" id="calc-n-wps" value="${state.wps.length}" min="1" max="12" class="w-20 px-2 py-1.5 text-sm border border-outline-variant/30 rounded-lg text-center font-bold" onchange="Calculator._syncWPsMerged(parseInt(this.value))">
      </div>

      <!-- Summary bar -->
      <div class="bg-primary text-white rounded-xl p-4 mb-5 flex items-center gap-5 flex-wrap">
        <div class="flex-1 min-w-[120px]">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Total calculated</div>
          <div class="font-headline text-2xl font-bold" id="calc-live-total">${euros(total)}</div>
        </div>
        <div class="min-w-[90px]">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Target</div>
          <div class="text-sm font-mono">${euros(totalProject)}</div>
        </div>
        <div class="min-w-[90px]">
          <div class="text-[10px] uppercase tracking-wider opacity-50 mb-1">Difference</div>
          <div class="text-sm font-mono" id="calc-live-diff">${euros(totalProject - total)}</div>
        </div>
        <div class="flex-[2] min-w-[150px]">
          <div class="text-[10px] opacity-40 mb-1">Budget usage</div>
          <div class="h-3 rounded-full bg-white/20 overflow-hidden">
            <div class="h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'} transition-all" id="calc-live-bar" style="width:${usePct}%"></div>
          </div>
        </div>
      </div>

      <div id="calc-wps-container">
        ${state.wps.map((wp, wi) => buildWPSection(wp, wi)).join('')}
      </div>

      ${nav}
    `;

    // Calculate all
    state.wps.forEach((_, wi) => recalcWP(wi));
  }

  /** Render Results step into a container */
  function renderResultsInto(container) { renderResults(container); }

  /** Render Gantt step into a container */
  function renderGanttInto(container) { renderGantt(container); }

  /** Get partner budget breakdowns for Intake summary — EACEA official structure */
  function getPartnerBudgets() {
    state.wps.forEach((_, wi) => recalcWP(wi));
    const wpResults = state.wps.map((wp, wi) => {
      const acts = wp.activities.map(a => ({ ...a, ...calcActivity(a) }));
      const total = acts.reduce((s, a) => s + a.total, 0);
      return { ...wp, acts, total, color: WP_COLORS[wi%WP_COLORS.length], bg: WP_BG[wi%WP_BG.length] };
    });
    const { indirectPct } = getFinancials();
    const mo = getProjectMonths();

    function partnerBudgetEACEA(pi) {
      const p = state.partners[pi];
      if (!p) return { lines: {}, grand: 0 };
      const pd = getPartnerPerdiem(p.id);

      // Each EACEA line accumulates items: {label, units, rate, total, wp}
      const lines = {
        A1_coord:    [], // Project Coordinator
        A1_staff:    [], // Other employees (IO staff)
        A2: [], A3: [], A4: [], A5: [],
        B:  [],
        C1_travel:   [],
        C1_accom:    [],
        C1_subs:     [],
        C2:          [],
        C3_cons:     [],
        C3_meet:     [],
        C3_comms:    [],
        C3_web:      [],
        C3_art:      [],
        C3_other:    [],
        D1:          [],
      };

      function add(lineKey, wi, label, units, rate, total) {
        if (!total || total <= 0) return;
        const wpL = wpLabel(wpResults[wi], wi);
        lines[lineKey].push({ label, units, rate: Math.round(rate*100)/100, total: Math.round(total*100)/100, wp: wpL, wpIdx: wi });
      }

      wpResults.forEach((wp, wi) => {
        wp.acts.forEach(act => {
          switch (act.type) {
            case 'mgmt': {
              const rate = pi === 0 ? (act.rate_applicant||500) : (act.rate_partner||250);
              add('A1_coord', wi, act.label, mo, rate, rate * mo);
              break;
            }
            case 'meeting': case 'ltta': {
              if (act.online) break;
              const pax = act.pax||2, days = act.days||3;
              const isHost = p.id === act.host;
              const excluded = (act.participants||{})[p.id] === false;
              if (excluded) break;
              if (!isHost) {
                const routeCost = getRouteCost(p.id, act.host);
                add('C1_travel', wi, act.label, pax, routeCost, routeCost * pax);
              }
              // Perdiem del destino (extra_dest si aplica), no del partner que viaja
              const hostExtraDest = state.extraDests.find(d => d.id === act.host);
              const destAccom = hostExtraDest ? (hostExtraDest.aloj || 0) : (pd.aloj || 0);
              const destSubs  = hostExtraDest ? (hostExtraDest.mant || 0) : (pd.mant || 0);
              add('C1_accom', wi, act.label, pax * days, destAccom, pax * days * destAccom);
              add('C1_subs',  wi, act.label, pax * days, destSubs,  pax * days * destSubs);
              break;
            }
            case 'io': {
              const ps = act.io_staff?.[p.id];
              if (!ps?.active) break;
              ps.staff.forEach(st => {
                const rate = getPartnerDayRate(p.id, st.profileId);
                const profileName = state.workerRates.find(w => w.id === st.profileId)?.category || 'Staff';
                add('A1_staff', wi, `${act.label} — ${profileName}`, st.days||0, rate, (st.days||0) * rate);
              });
              break;
            }
            case 'me': {
              const ev = act.me_events?.[p.id];
              if (!ev?.active) break;
              const total = (ev.local_pax||0)*(ev.local_rate||0) + (ev.intl_pax||0)*(ev.intl_rate||0);
              const totalPax = (ev.local_pax||0) + (ev.intl_pax||0);
              add('C3_comms', wi, act.label, totalPax, totalPax > 0 ? total/totalPax : 0, total);
              break;
            }
            case 'campaign': {
              const c = act.camp_partners?.[p.id];
              if (!c?.active) break;
              add('C3_comms', wi, act.label, c.months||0, c.monthly||0, (c.monthly||0)*(c.months||0));
              break;
            }
            case 'local_ws': {
              const w = act.ws_partners?.[p.id];
              if (!w?.active) break;
              const units = (w.ws_pax||0)*(w.ws_n||0);
              add('C3_meet', wi, act.label, units, w.ws_cost||0, units*(w.ws_cost||0));
              break;
            }
            case 'website':    { const np = act.note_partners?.[p.id]; if (np?.active) add('C3_web',   wi, act.label, 1, np.amount||0, np.amount||0); break; }
            case 'artistic':   { const np = act.note_partners?.[p.id]; if (np?.active) add('C3_art',   wi, act.label, 1, np.amount||0, np.amount||0); break; }
            case 'equipment':  { const np = act.note_partners?.[p.id]; if (np?.active) add('C2',       wi, act.label, 1, calcDepreciation(np), calcDepreciation(np)); break; }
            case 'consumables':{ const np = act.note_partners?.[p.id]; if (np?.active) add('C3_cons',  wi, act.label, 1, calcDepreciation(np), calcDepreciation(np)); break; }
            case 'goods': case 'other': {
              const np = act.note_partners?.[p.id]; if (np?.active) add('C3_other', wi, act.label, 1, calcDepreciation(np), calcDepreciation(np)); break;
            }
          }
        });
      });

      // Compute section totals
      const sum = key => lines[key].reduce((s, it) => s + it.total, 0);
      const A1 = sum('A1_coord') + sum('A1_staff');
      const A = A1; // A2-A5 are always 0 in our tool
      const C1 = sum('C1_travel') + sum('C1_accom') + sum('C1_subs');
      const C2 = sum('C2');
      const C3 = sum('C3_cons') + sum('C3_meet') + sum('C3_comms') + sum('C3_web') + sum('C3_art') + sum('C3_other');
      const C = C1 + C2 + C3;
      const directTotal = A + C;

      return { lines, A1, A, C1, C2, C3, C, directTotal };
    }

    return {
      partners: state.partners.map((p, i) => ({
        id: p.id,
        name: p.name || 'Partner ' + (i+1),
        acronym: p.acronym || '',
        country: p.country || '',
        isApplicant: i === 0,
        budget: partnerBudgetEACEA(i),
        color: WP_COLORS[i % WP_COLORS.length],
      })),
      indirectPct,
      wpLabels: wpResults.map((wp, wi) => wpLabel(wp, wi)),
      wpColors: wpResults.map((wp, wi) => WP_COLORS[wi % WP_COLORS.length]),
    };
  }

  /** Get current state for Intake summary */
  function getCalcState() {
    const directCosts = state.wps.reduce((s, wp) => s + wp.activities.reduce((ss, a) => ss + calcActivity(a).total, 0), 0);
    const { indirectPct } = getFinancials();
    const { indirect, total } = applyIndirectCosts(directCosts);
    return {
      directCosts,
      indirect,
      indirectPct,
      total,
      wps: state.wps,
      partners: state.partners,
      financials: getFinancials(),
      projectMonths: getProjectMonths(),
      projectStart: state.project?.start_date || null,
    };
  }

  /** Update project-level data without reinitializing rates/WPs/activities */
  function updateProjectData(projectData) {
    if (!state.project) return;
    Object.assign(state.project, projectData);
  }

  /** Check if Calculator state is initialized */
  function isInitialized() { return state.project !== null; }

  function setWPLeader(wi, partnerId) {
    if (state.wps[wi]) {
      state.wps[wi].leader = partnerId;
      scheduleSave();
    }
  }

  /** Sync WPs and re-render merged view */
  function syncWPsMerged(n) {
    syncWPCount(n);
    const container = document.getElementById('intake-calc-container');
    if (container && _embeddedMode) renderMergedWPs(container);
  }

  /* ── Public API ─────────────────────────────────────────────── */
  return {
    init,
    // Library API for Intake embedding
    initFromIntake,
    updateProjectData,
    setNavCallback,
    renderRatesInto,
    renderRoutesInto,
    renderMergedWPs,
    renderResultsInto,
    renderGanttInto,
    getCalcState,
    getPartnerBudgets,
    isInitialized,
    forceSave: doSave,
    scheduleSave,
    // Exposed for onclick handlers (prefixed with _ to signal internal use)
    _loadProject: loadProject,
    _backToSelector: backToSelector,
    _goTo: goToStep,
    _setPerdiem: (...a) => { setPerdiem(...a); scheduleSave(); },
    _setWorkerRate: (...a) => { setWorkerRate(...a); scheduleSave(); },
    _addWorkerRate: (...a) => { addWorkerRate(...a); scheduleSave(); },
    _removeWorkerRate: (...a) => { removeWorkerRate(...a); scheduleSave(); },
    _setRouteBand: (...a) => { setRouteBand(...a); scheduleSave(); },
    _setRoute: (...a) => { setRoute(...a); scheduleSave(); },
    _autoRoute: (...a) => { autoRoute(...a); scheduleSave(); },
    _addExtraDest: (...a) => { addExtraDest(...a); scheduleSave(); },
    _removeExtraDest: (...a) => { removeExtraDest(...a); scheduleSave(); },
    _setExtraDest: (...a) => { setExtraDest(...a); scheduleSave(); },
    _refreshRoutes: () => { refreshRoutes(); },
    WP1_TITLES,
    LAST_WP_TITLES,
    WP_TAXONOMY,
    _setWP: (...a) => { setWP(...a); scheduleSave(); },
    _setWPCat: (...a) => { setWPCat(...a); scheduleSave(); },
    _applyWPTitle: (...a) => { applyWPTitle(...a); scheduleSave(); },
    _setWPName: (wi, name) => { state.wps[wi].name = name; scheduleSave(); },
    _showWPTitleMenu: (wi, btnEl) => {
      // Close any existing menu
      document.querySelectorAll('.wp-title-menu').forEach(m => m.remove());
      const wp = state.wps[wi];
      const menu = document.createElement('div');
      menu.className = 'wp-title-menu';
      menu.innerHTML = buildWPTitleMenu(wi, wp);
      btnEl.parentElement.appendChild(menu);
      // Close on click outside
      setTimeout(() => {
        const close = (e) => { if (!menu.contains(e.target) && e.target !== btnEl) { menu.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }, 10);
    },
    _syncWPs: (...a) => { syncWPs(...a); scheduleSave(); },
    _syncWPsMerged: (...a) => { syncWPsMerged(...a); scheduleSave(); },
    _setWPLeader: (...a) => { setWPLeader(...a); },
    _addActivity: (...a) => { addActivity(...a); scheduleSave(); },
    _moveAct: (...a) => { moveAct(...a); scheduleSave(); },
    _removeAct: (...a) => { removeAct(...a); scheduleSave(); },
    _setAct: (...a) => { setAct(...a); scheduleSave(); },
    _setActOnline: (...a) => { setActOnline(...a); scheduleSave(); },
    _setActSubtype: (...a) => { setActSubtype(...a); scheduleSave(); },
    _setActDesc: (...a) => { setActDesc(...a); scheduleSave(); },
    _setActHost: (...a) => { setActHost(...a); scheduleSave(); },
    _setParticipant: (...a) => { setParticipant(...a); scheduleSave(); },
    _setIOStaff: (...a) => { setIOStaff(...a); scheduleSave(); },
    _addIOStaff: (...a) => { addIOStaff(...a); scheduleSave(); },
    _removeIOStaff: (...a) => { removeIOStaff(...a); scheduleSave(); },
    _setIOPartnerActive: (...a) => { setIOPartnerActive(...a); scheduleSave(); },
    _setIODays: (...a) => { setIODays(...a); scheduleSave(); },
    _setIOProfile: (...a) => { setIOProfile(...a); scheduleSave(); },
    _setME: (...a) => { setME(...a); scheduleSave(); },
    _setPartnerDetail: (...a) => { setPartnerDetail(...a); scheduleSave(); },
    _toggleWP: toggleWP,
    _downloadBudgetExcel: async () => {
      const btn = document.getElementById('calc-download-xlsx');
      const original = btn ? btn.innerHTML : '';
      const projectId = state.project?.id || currentProjectId;
      if (!projectId || String(projectId).startsWith('intake-temp-')) {
        alert('Guarda el proyecto antes de exportar.');
        return;
      }
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined text-base animate-spin">progress_activity</span> Generando...'; }
      try {
        let budget;
        try {
          budget = await API.get(`/budget/by-project/${projectId}`);
        } catch (notFound) {
          if (!confirm('Este proyecto aún no tiene un presupuesto en el módulo Budget. ¿Quieres crearlo ahora desde los datos del Intake? (Se poblará con los costes calculados.)')) return;
          const created = await API.post(`/budget/from-intake/${projectId}`);
          const newId = created?.id || created?.data?.id;
          if (!newId) throw new Error('No se pudo crear el presupuesto');
          budget = { id: newId, name: state.project?.name || 'budget' };
        }
        const res = await fetch(`/v1/budget/${budget.id}/export-excel`, {
          headers: { 'Authorization': `Bearer ${API.getToken()}` },
          credentials: 'include',
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`${res.status}: ${txt.substring(0, 200)}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safe = (state.project?.name || budget.name || 'budget').replace(/[^a-z0-9_\-]+/gi, '_').substring(0, 40);
        a.download = `${safe}_EACEA.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('[Calc] download error:', e);
        alert('Error descargando Excel: ' + (e.message || e));
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
      }
    },
    _switchResTab: switchResTab,
    _setGanttView: setGanttView,
    _ganttToggle: ganttToggle,
    _ganttCollapseAll: ganttCollapseAll,
    _ganttExpandAll: ganttExpandAll,
  };
})();
