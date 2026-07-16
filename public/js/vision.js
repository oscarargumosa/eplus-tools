/* ═══════════════════════════════════════════════════════════════
   EU Vision (TASK-012 · F2) — asistente idea → ficha de visión
   Vive en #vision-root. Vistas internas: list · picker · wizard · brief.
   Backend: /v1/vision/* · contexto de call: /v1/convocatorias/:id
   ═══════════════════════════════════════════════════════════════ */

const Vision = (() => {
  let view = 'list';      // list | picker | wizard | brief
  let visions = [];       // mis visiones
  let V = null;           // visión activa
  let refs = [];          // referencias de la visión activa
  let call = null;        // contexto de la convocatoria (solo lectura)
  let step = 1;           // paso del asistente (1..5)
  let suggestions = [];    // proyectos similares (Experience RAG)
  let pendingCallId = null; // call precargada desde Convocatorias ("Empezar mi visión")
  let callPanelOpen = false; // panel "lo que pide la convocatoria" (colapsado por defecto)
  let stylesInjected = false;

  const $root = () => document.getElementById('vision-root');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = (n) => n == null ? null : Number(n).toLocaleString('es-ES') + ' €';
  const fmtDate = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };
  const daysLeft = (d) => { if (!d) return null; const ms = new Date(d) - new Date(); return ms > 0 ? Math.round(ms / 86400000) : null; };
  const arr = (x) => Array.isArray(x) ? x : [];
  // Renderiza un texto multipárrafo (separado por saltos de línea) en <p>.
  const paras = (t) => String(t || '').split(/\n+/).map(s => s.trim()).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('') || '<p>—</p>';

  /* ── Países ───────────────────────────────────────────────────────
     UE + países del programa como acceso rápido; el input permite añadir
     cualquier país del mundo. Bandera derivada del código ISO-2.        */
  const flag = (cc) => { try { return String(cc).toUpperCase().replace(/[A-Z]/g, c => String.fromCodePoint(127397 + c.charCodeAt(0))); } catch { return ''; } };
  // EU27 + países del programa Erasmus+ (acceso rápido)
  const EU_CODES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'MK', 'RS', 'TR'];
  const WORLD = Object.fromEntries(('AF:Afganistán,AL:Albania,DZ:Argelia,AD:Andorra,AO:Angola,AG:Antigua y Barbuda,AR:Argentina,AM:Armenia,AU:Australia,AT:Austria,AZ:Azerbaiyán,BS:Bahamas,BH:Baréin,BD:Bangladés,BB:Barbados,BY:Bielorrusia,BE:Bélgica,BZ:Belice,BJ:Benín,BT:Bután,BO:Bolivia,BA:Bosnia y Herzegovina,BW:Botsuana,BR:Brasil,BN:Brunéi,BG:Bulgaria,BF:Burkina Faso,BI:Burundi,CV:Cabo Verde,KH:Camboya,CM:Camerún,CA:Canadá,CF:República Centroafricana,TD:Chad,CL:Chile,CN:China,CO:Colombia,KM:Comoras,CG:Congo,CD:Rep. Dem. del Congo,CR:Costa Rica,CI:Costa de Marfil,HR:Croacia,CU:Cuba,CY:Chipre,CZ:Chequia,DK:Dinamarca,DJ:Yibuti,DM:Dominica,DO:República Dominicana,EC:Ecuador,EG:Egipto,SV:El Salvador,GQ:Guinea Ecuatorial,ER:Eritrea,EE:Estonia,SZ:Esuatini,ET:Etiopía,FJ:Fiyi,FI:Finlandia,FR:Francia,GA:Gabón,GM:Gambia,GE:Georgia,DE:Alemania,GH:Ghana,GR:Grecia,GD:Granada,GT:Guatemala,GN:Guinea,GW:Guinea-Bisáu,GY:Guyana,HT:Haití,HN:Honduras,HU:Hungría,IS:Islandia,IN:India,ID:Indonesia,IR:Irán,IQ:Irak,IE:Irlanda,IL:Israel,IT:Italia,JM:Jamaica,JP:Japón,JO:Jordania,KZ:Kazajistán,KE:Kenia,KI:Kiribati,KW:Kuwait,KG:Kirguistán,LA:Laos,LV:Letonia,LB:Líbano,LS:Lesoto,LR:Liberia,LY:Libia,LI:Liechtenstein,LT:Lituania,LU:Luxemburgo,MG:Madagascar,MW:Malaui,MY:Malasia,MV:Maldivas,ML:Malí,MT:Malta,MH:Islas Marshall,MR:Mauritania,MU:Mauricio,MX:México,FM:Micronesia,MD:Moldavia,MC:Mónaco,MN:Mongolia,ME:Montenegro,MA:Marruecos,MZ:Mozambique,MM:Birmania,NA:Namibia,NR:Nauru,NP:Nepal,NL:Países Bajos,NZ:Nueva Zelanda,NI:Nicaragua,NE:Níger,NG:Nigeria,MK:Macedonia del Norte,NO:Noruega,OM:Omán,PK:Pakistán,PW:Palaos,PS:Palestina,PA:Panamá,PG:Papúa Nueva Guinea,PY:Paraguay,PE:Perú,PH:Filipinas,PL:Polonia,PT:Portugal,QA:Catar,RO:Rumanía,RU:Rusia,RW:Ruanda,KN:San Cristóbal y Nieves,LC:Santa Lucía,VC:San Vicente y las Granadinas,WS:Samoa,SM:San Marino,ST:Santo Tomé y Príncipe,SA:Arabia Saudita,SN:Senegal,RS:Serbia,SC:Seychelles,SL:Sierra Leona,SG:Singapur,SK:Eslovaquia,SI:Eslovenia,SB:Islas Salomón,SO:Somalia,ZA:Sudáfrica,KR:Corea del Sur,SS:Sudán del Sur,ES:España,LK:Sri Lanka,SD:Sudán,SR:Surinam,SE:Suecia,CH:Suiza,SY:Siria,TW:Taiwán,TJ:Tayikistán,TZ:Tanzania,TH:Tailandia,TL:Timor Oriental,TG:Togo,TO:Tonga,TT:Trinidad y Tobago,TN:Túnez,TR:Turquía,TM:Turkmenistán,TV:Tuvalu,UG:Uganda,UA:Ucrania,AE:Emiratos Árabes Unidos,GB:Reino Unido,US:Estados Unidos,UY:Uruguay,UZ:Uzbekistán,VU:Vanuatu,VA:Ciudad del Vaticano,VE:Venezuela,VN:Vietnam,YE:Yemen,ZM:Zambia,ZW:Zimbabue').split(',').map(p => { const i = p.indexOf(':'); return [p.slice(0, i), p.slice(i + 1)]; }));
  const cName = (cc) => WORLD[String(cc).toUpperCase()] || cc;

  /* Tipos de socio — perfiles de entidad habituales en proyectos europeos
     (Erasmus+, Horizon, CERV, ESF+…). El usuario puede además escribir uno
     propio si no está en la lista. */
  const PARTNER_TYPES = [
    'ONG / Organización sin ánimo de lucro', 'Asociación', 'Fundación',
    'Universidad / Educación superior', 'Centro de investigación', 'Instituto tecnológico',
    'Escuela (infantil / primaria / secundaria)', 'Centro de Formación Profesional (FP/VET)',
    'Organización de educación de adultos', 'Organización juvenil', 'Grupo informal de jóvenes',
    'Cooperativa', 'Empresa social', 'PYME', 'Gran empresa', 'Startup', 'Incubadora / Aceleradora',
    'Consultora', 'Cámara de comercio / industria', 'Clúster empresarial',
    'Administración pública local (ayuntamiento)', 'Administración pública regional',
    'Administración pública nacional', 'Agencia pública', 'Organismo intermedio',
    'Organización cultural', 'Museo', 'Biblioteca', 'Archivo', 'Teatro / Compañía artística',
    'Club o federación deportiva', 'Organización sanitaria / hospital', 'Centro social',
    'Sindicato', 'Organización de empleadores', 'Think tank', 'Red / Federación europea',
    'Organización internacional', 'Medio de comunicación', 'Organización de voluntariado',
    'Entidad religiosa', 'Cooperativa agraria / agrupación de agricultores',
    'Grupo de Acción Local (LEADER)', 'Parque científico / tecnológico',
  ];
  function resolveCountry(raw) {
    if (!raw) return null;
    const v = String(raw).trim(); if (!v) return null;
    const up = v.toUpperCase(); if (WORLD[up]) return up;
    const low = v.toLowerCase();
    for (const [c, n] of Object.entries(WORLD)) if (n.toLowerCase() === low) return c;
    return null;
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  async function init() {
    injectStyles();
    // Entrada directa desde Convocatorias: arranca una visión sobre esa call.
    if (pendingCallId) { const id = pendingCallId; pendingCallId = null; await pickCall(id); return; }
    view = 'list';
    await loadList();
  }

  // Llamado desde Convocatorias ("Empezar mi visión"): navega a EU Vision con
  // la convocatoria precargada y arranca el asistente.
  function startForCall(callId) {
    pendingCallId = callId;
    App.navigate('eu-vision');
  }

  async function loadList() {
    try {
      visions = await API.get('/vision');
    } catch (e) { visions = []; }
    renderList();
  }

  /* ── VIEW: Mis Visiones ───────────────────────────────────────── */
  function renderList() {
    view = 'list';
    const cards = visions.map(v => {
      const pub = v.visibility === 'public';
      const complete = v.status === 'complete';
      return `
        <div class="vz-card" data-act="open" data-id="${v.id}">
          <div class="vz-row-between">
            <span class="vz-pill ${complete ? 'vz-pill-ok' : 'vz-pill-draft'}">${complete ? '✓ Completa' : '● Borrador'}</span>
            <span class="vz-pill ${pub ? 'vz-pill-ok' : 'vz-pill-priv'}">${pub ? '🌍 Pública' : '🔒 Privada'}</span>
          </div>
          <h3>${esc(v.title || 'Visión sin título')}</h3>
          <span class="vz-callchip">🎯 <b>${esc(v.programme || 'Convocatoria')}</b> · ${esc(v.call_title || v.call_id)}</span>
          <div class="vz-muted vz-sm">${complete ? (pub ? `Publicada · ${v.interest_count || 0} interesados` : 'Lista para publicar') : `Paso ${v.current_step || 1} de 5`}</div>
        </div>`;
    }).join('');

    $root().innerHTML = `
      <div class="vz-head">
        <div>
          <div class="vz-eyebrow">Paso 0 · antes de diseñar</div>
          <h1 class="vz-h1">Mis Visiones</h1>
          <p class="vz-lead">Da forma a tu idea en 5–10 minutos: el reto, a quién buscas y por qué importa a Europa. Compártela con la comunidad y llévala a Diseñar.</p>
        </div>
        <button class="vz-btn vz-btn-primary" data-act="new">+ Nueva visión</button>
      </div>
      <div class="vz-grid">
        <div class="vz-card vz-card-new" data-act="new">
          <div class="vz-plus">+</div>
          <h3>Empezar una visión</h3>
          <div class="vz-muted vz-sm">Elige una convocatoria y te guiamos</div>
        </div>
        ${cards}
      </div>`;
  }

  /* ── VIEW: elegir convocatoria ────────────────────────────────── */
  async function renderPicker() {
    view = 'picker';
    $root().innerHTML = `
      <div class="vz-head"><div>
        <div class="vz-eyebrow">Nueva visión · paso previo</div>
        <h1 class="vz-h1">¿Sobre qué convocatoria?</h1>
        <p class="vz-lead">Tu visión se construye sobre una convocatoria concreta: de ella sacamos criterios, presupuesto y tipo de socio, para preguntarte solo lo tuyo.</p>
      </div></div>
      <div class="vz-note">
        <span style="font-size:16px">🧭</span>
        <div><b>¿Aún no sabes cuál?</b> Explora las convocatorias abiertas, filtra por programa y presupuesto, y vuelve aquí desde la que elijas.
        <button class="vz-btn vz-btn-navy vz-btn-sm" data-act="go-convocatorias" style="margin-top:10px">Ir a Convocatorias →</button></div>
      </div>
      <div class="vz-eyebrow" style="margin:16px 0 10px">O parte de una convocatoria abierta reciente</div>
      <div id="vz-call-list" class="vz-call-list"><div class="vz-muted vz-sm">Cargando convocatorias…</div></div>`;

    try {
      const r = await API.get('/convocatorias?status=open&limit=12');
      const items = arr(r.items).filter(c => c.deadline).slice(0, 8);
      const host = document.getElementById('vz-call-list');
      if (!items.length) { host.innerHTML = `<div class="vz-muted vz-sm">No hay convocatorias abiertas ahora. Ve a Convocatorias.</div>`; return; }
      host.innerHTML = items.map(c => `
        <div class="vz-callrow" data-act="pick-call" data-id="${esc(c.call_id)}">
          <span class="vz-badge">${esc((c.programme || 'EU').toUpperCase())}</span>
          <div class="vz-callrow-main">
            <h3>${esc(c.title || c.call_id)}</h3>
            <div class="vz-muted vz-sm">${esc(c.main_objective || c.summary_es || c.sub_programme || '')}</div>
          </div>
          <div class="vz-callrow-dl">deadline<b>${fmtDate(c.deadline) || '—'}</b></div>
          <span class="vz-go">›</span>
        </div>`).join('');
    } catch (e) {
      document.getElementById('vz-call-list').innerHTML = `<div class="vz-muted vz-sm">No se pudieron cargar las convocatorias. <a href="#convocatorias">Ir a Convocatorias</a></div>`;
    }
  }

  async function pickCall(callId) {
    // buscar la card para denormalizar título/programa/deadline
    let card = null;
    try { card = await API.get('/convocatorias/' + encodeURIComponent(callId)); } catch (e) {}
    try {
      V = await API.post('/vision', {
        call_id: callId,
        call_title: card?.title || null,
        programme: card?.programme || null,
        call_deadline: card?.deadline || null,
      });
      call = card;
      refs = [];
      suggestions = [];
      renderComposer();
    } catch (e) {
      Toast.show(e.message || 'No se pudo crear la visión', 'error');
    }
  }

  /* ── VIEW: asistente ──────────────────────────────────────────── */
  async function openVision(id) {
    try {
      const d = await API.get('/vision/' + id);
      V = d.vision; refs = d.references || [];
      call = null; suggestions = [];
      // cargar contexto de la call
      if (V.call_id) { try { call = await API.get('/convocatorias/' + encodeURIComponent(V.call_id)); } catch (e) {} }
      if (V.status === 'complete') { renderBrief(); }
      else { renderComposer(); }
    } catch (e) { Toast.show(e.message || 'No se pudo abrir la visión', 'error'); }
  }

  /* ══ Composer: TODO en una sola ventana ══════════════════════════
     Flujo vertical: idea → referencias → generar UN texto → detalles →
     revisar ficha. Panel "lo que pide la convocatoria" colapsable a la
     derecha. */
  function renderComposer() {
    view = 'wizard';
    if (V.wp_count == null) { V.wp_count = 3; saveComposer({ wp_count: 3 }); }
    const dl = daysLeft(V.call_deadline);
    const themes = arr(call?.themes_ai);
    const min = call?.budget_per_project_min_eur, max = call?.budget_per_project_max_eur;
    const bOpts = [];
    if (min != null) bOpts.push({ v: min, l: 'Mínimo por proyecto' });
    if (max != null && max !== min) bOpts.push({ v: max, l: 'Máximo por proyecto' });
    const budgetHtml = bOpts.length
      ? `<div class="vz-radio-row">${bOpts.map(o => `<div class="vz-radio ${Number(V.budget_option_eur) === Number(o.v) ? 'vz-sel' : ''}" data-act="pick-budget" data-v="${o.v}" data-l="${esc(o.l)}"><div class="vz-amt">${eur(o.v)}</div><div class="vz-rlbl">${o.l}</div></div>`).join('')}</div>`
      : `<input type="number" class="vz-field" id="vz-budget" placeholder="Presupuesto objetivo (€)" value="${V.budget_option_eur != null ? V.budget_option_eur : ''}">`;

    $root().innerHTML = `
      <div class="vz-comp-head">
        <div><span class="vz-tag-navy">CONVOCATORIA</span> <b>${esc(V.call_title || V.call_id)}</b>
          <span class="vz-muted vz-sm"> · deadline ${fmtDate(V.call_deadline) || '—'}${dl != null ? ` · ${dl} días` : ''}</span></div>
        <button class="vz-btn vz-btn-ghost vz-btn-sm" data-act="back-list">← Mis visiones</button>
      </div>

      <div id="vz-callpanel-top"></div>

      <div class="vz-main vz-comp-single">
          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">1</span> Cuéntanos tu idea</div>
            <p class="vz-help">Con tus palabras, sencillo y cercano. Luego la IA la convierte en una visión clara.</p>
            <textarea class="vz-field" id="vz-idea" rows="4" placeholder="Lo que quieres hacer, el problema que ves…">${esc(V.problem || '')}</textarea>
            ${themes.length ? `<div class="vz-chip-hint">Temas de la convocatoria — marca los que encajen:</div>
              <div class="vz-chips">${themes.slice(0, 10).map(t => `<span class="vz-chip ${arr(V.themes).includes(t) ? 'vz-sel' : ''}" data-act="toggle-theme" data-v="${esc(t)}">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>

          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">2</span> Proyectos de referencia <span class="vz-muted vz-sm"> · opcional</span></div>
            <p class="vz-help">Busca proyectos aprobados parecidos a tu idea y elige los que te inspiren.</p>
            <div class="vz-ref-search">
              <input class="vz-field" id="vz-ref-q" placeholder="Tema o palabras clave (por defecto, tu idea)…" autocomplete="off">
              <button class="vz-btn vz-btn-navy vz-btn-sm" data-act="suggest">🔎 Buscar</button>
            </div>
            <div id="vz-refs-area"></div>
          </div>

          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">3</span> Tu visión <span class="vz-muted vz-sm"> · un solo texto</span></div>
            <p class="vz-help">La IA combina tu idea + lo que pide la convocatoria + los proyectos elegidos en un texto claro para cualquiera. Edítalo a tu gusto.</p>
            <button class="vz-btn vz-btn-primary" data-act="ai-generate" style="margin-bottom:10px">✨ Generar mi visión con IA</button>
            <input class="vz-field" id="vz-title" placeholder="Título de la visión" value="${esc(V.title || '')}" style="margin-bottom:10px">
            <textarea class="vz-field" id="vz-vision" rows="7" placeholder="Aquí aparecerá tu visión redactada… (o escríbela tú)">${esc(V.vision_text || '')}</textarea>
          </div>

          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">4</span> Detalles</div>
            <label class="vz-lbl">Escala</label>
            ${budgetHtml}
            <div class="vz-num-row" style="margin-top:12px">
              <span class="vz-muted vz-sm">Paquetes de trabajo:</span>
              <div class="vz-num"><button data-act="wp-dec">–</button><div class="vz-num-v" id="vz-wp">${V.wp_count || 3}</div><button data-act="wp-inc">+</button></div>
            </div>
            <div id="vz-consorcio-area" style="margin-top:16px"></div>
          </div>

          <div class="vz-btns">
            <span></span>
            <button class="vz-btn vz-btn-primary" data-act="review">Revisar ficha →</button>
          </div>
      </div>`;

    renderRefs();
    renderConsorcio();
    renderCallPanel();
  }

  function renderRefs() {
    const host = document.getElementById('vz-refs-area');
    if (!host) return;
    const selected = refs.length
      ? `<div class="vz-chips" style="margin:10px 0 4px">${refs.map(r => `<span class="vz-chip vz-sel" data-act="remove-ref" data-id="${r.id}">${esc(r.title || r.project_identifier)} ✕</span>`).join('')}</div>`
      : '';
    const cards = suggestions.length
      ? `<div class="vz-simi-grid" style="margin-top:10px">${suggestions.map((p, i) => `
          <div class="vz-scard" data-act="open-proj" data-i="${i}">
            <span class="vz-score">◆ ${(p.score != null ? Number(p.score).toFixed(2) : '—')} match</span>
            <h4>${esc(p.title || p.project_identifier)}</h4>
            <div class="vz-muted vz-sm">${esc(p.programme || '')} ${p.funding_year ? '· ' + p.funding_year : ''} ${p.coordinator_country ? '· ' + esc(p.coordinator_country) : ''}</div>
            <div class="vz-add">📖 Abrir y leer →</div>
          </div>`).join('')}</div>`
      : '';
    host.innerHTML = selected + cards;
  }

  function renderConsorcio() {
    const host = document.getElementById('vz-consorcio-area');
    if (!host) return;
    const types = arr(V.partner_types);
    const countries = arr(V.partner_countries);
    const typeList = PARTNER_TYPES.map(t => `<option value="${esc(t)}">`).join('');
    const ctyList = Object.entries(WORLD).map(([c, n]) => `<option value="${esc(n)}">`).join('');
    host.innerHTML = `
      <label class="vz-lbl">Tu entidad (OID del directorio — necesario para publicar)</label>
      <input type="text" class="vz-field" id="vz-entity" placeholder="p.ej. E10151149" value="${esc(V.entity_oid || '')}">
      <label class="vz-lbl" style="margin-top:14px">Tipo de socio que buscas</label>
      ${types.length ? `<div class="vz-chips" style="margin-bottom:8px">${types.map(t => `<span class="vz-chip vz-sel" data-act="remove-type" data-v="${esc(t)}">${esc(t)} ✕</span>`).join('')}</div>` : ''}
      <input type="text" class="vz-field" id="vz-type-input" list="vz-types-list" placeholder="Escribe o elige un tipo de socio…" autocomplete="off">
      <datalist id="vz-types-list">${typeList}</datalist>
      <label class="vz-lbl" style="margin-top:14px">Países — UE y cualquier país del mundo</label>
      ${countries.length ? `<div class="vz-chips" style="margin-bottom:8px">${countries.map(c => `<span class="vz-chip vz-sel" data-act="remove-cty" data-v="${c}">${flag(c)} ${esc(cName(c))} ✕</span>`).join('')}</div>` : ''}
      <input type="text" class="vz-field" id="vz-cty-input" list="vz-world" placeholder="Escribe o elige un país…" autocomplete="off">
      <datalist id="vz-world">${ctyList}</datalist>`;
  }

  function renderCallPanel() {
    const host = document.getElementById('vz-callpanel-top');
    if (!host) return;
    if (!call) { host.innerHTML = ''; return; }
    const item = (k, v) => v ? `<div class="vz-rc-item"><div class="vz-rc-k">${k}</div><div class="vz-rc-v">${v}</div></div>` : '';
    const budget = [call.budget_per_project_min_eur, call.budget_per_project_max_eur].filter(x => x != null).map(eur);
    host.innerHTML = `
      <div class="vz-cp-bar ${callPanelOpen ? 'vz-open' : ''}">
        <button class="vz-cp-toggle" data-act="toggle-callpanel">
          <span>📋 Lo que pide la convocatoria</span>
          <span class="vz-muted vz-sm" style="margin-left:auto;margin-right:8px;font-weight:500">${callPanelOpen ? '' : 'objetivo, actividades y financiación'}</span>
          <span class="vz-chev">${callPanelOpen ? '▾' : '▸'}</span>
        </button>
        ${callPanelOpen ? `<div class="vz-cp-body">
          ${item('Objetivo', esc(call.main_objective || call.summary_es || ''))}
          ${arr(call.eligible_activities).length ? `<div class="vz-rc-item"><div class="vz-rc-k">Actividades esperadas</div><div class="vz-rc-v">${arr(call.eligible_activities).slice(0, 6).map(esc).join(' · ')}</div></div>` : ''}
          ${arr(call.expected_outcomes).length ? `<div class="vz-rc-item"><div class="vz-rc-k">Resultados esperados</div><div class="vz-rc-v">${arr(call.expected_outcomes).slice(0, 4).map(esc).join(' · ')}</div></div>` : ''}
          ${budget.length ? item('Financiación', budget.join(' – ') + (call.cofinancing_pct ? ` · UE ${call.cofinancing_pct}%` : '')) : ''}
          ${arr(call.coordinator_types_allowed).length ? `<div class="vz-rc-item"><div class="vz-rc-k">Quién puede liderar</div><div class="vz-rc-tags">${arr(call.coordinator_types_allowed).slice(0, 6).map(t => `<span class="vz-rc-tag">${esc(t)}</span>`).join('')}</div></div>` : ''}
        </div>` : ''}
      </div>`;
  }

  async function doSuggest() {
    await saveComposer(); // persistir la idea antes de buscar
    const qBox = document.getElementById('vz-ref-q');
    const q = [(qBox && qBox.value.trim()) || V.problem, arr(V.themes).join(' '), arr(call?.themes_ai).join(' ')].filter(Boolean).join('. ').slice(0, 1500);
    if (q.trim().length < 6) { Toast.show('Escribe tu idea o unas palabras clave para buscar', 'error'); return; }
    const btn = document.querySelector('[data-act="suggest"]');
    if (btn) { btn.textContent = 'Buscando…'; btn.disabled = true; }
    try {
      const d = await API.post('/vision/suggest-projects', { query_text: q, entity_oid: V.entity_oid || undefined, k: 6 });
      const list = arr(d.results || d.projects || d);
      suggestions = list.map(p => ({
        project_identifier: p.project_identifier || p.identifier || p.id,
        title: p.title || p.name,
        score: p.score != null ? p.score : p.match_score,
        programme: p.programme,
        funding_year: p.funding_year || p.year,
        coordinator_country: p.coordinator_country || p.country,
      }));
      if (!suggestions.length) Toast.show('No se encontraron proyectos parecidos', 'ok');
    } catch (e) {
      Toast.show(e.code === 'AI_UNAVAILABLE' ? 'El buscador de proyectos no está disponible ahora' : 'No se pudieron cargar proyectos', 'error');
    } finally {
      if (btn) { btn.textContent = '🔎 Buscar'; btn.disabled = false; }
      renderRefs();
    }
  }

  /* ── Drawer de lectura de un proyecto ─────────────────────────── */
  async function openProject(i) {
    const p = suggestions[i];
    if (!p) return;
    ensureDrawer();
    const ov = document.getElementById('vz-drawer-ov'), dr = document.getElementById('vz-drawer');
    document.getElementById('vz-dr-score').textContent = '◆ ' + (p.score != null ? Number(p.score).toFixed(2) : '—') + ' match';
    document.getElementById('vz-dr-title').textContent = p.title || p.project_identifier;
    document.getElementById('vz-dr-meta').textContent = [p.programme, p.funding_year, p.coordinator_country].filter(Boolean).join(' · ');
    const body = document.getElementById('vz-dr-body');
    body.innerHTML = `<div class="vz-muted vz-sm">Cargando resumen…</div>`;
    ov.classList.add('vz-on'); dr.classList.add('vz-on');
    dr.dataset.ref = i;
    try {
      const f = await API.get('/vision/project/' + encodeURIComponent(p.project_identifier) + '/full');
      const summary = f.project_summary_full || f.summary || f.project_summary || '';
      const secs = [];
      const addSec = (label, val) => { if (val && String(val).trim()) secs.push(`<div class="vz-dr-sec"><div class="vz-eyebrow">${label}</div><p>${esc(val)}</p></div>`); };
      addSec('De qué iba', summary);
      addSec('Objetivos', f.summary_objectives || f.report_objectives);
      addSec('Actividades', f.summary_activities || f.report_implementation);
      addSec('Impacto / resultados', f.summary_impact || f.report_results);
      body.innerHTML = secs.join('') || `<div class="vz-muted vz-sm">Este proyecto aún no tiene resumen ampliado.</div>`;
    } catch (e) {
      body.innerHTML = `<div class="vz-muted vz-sm">No se pudo cargar el resumen del proyecto.</div>`;
    }
  }

  function ensureDrawer() {
    if (document.getElementById('vz-drawer')) return;
    const ov = document.createElement('div'); ov.id = 'vz-drawer-ov'; ov.className = 'vz-drawer-ov';
    const dr = document.createElement('aside'); dr.id = 'vz-drawer'; dr.className = 'vz-drawer';
    dr.innerHTML = `
      <div class="vz-dr-top">
        <button class="vz-dr-close" data-act="close-drawer">✕</button>
        <span class="vz-dr-score" id="vz-dr-score"></span>
        <h2 id="vz-dr-title"></h2>
        <div class="vz-dr-meta" id="vz-dr-meta"></div>
      </div>
      <div class="vz-dr-body" id="vz-dr-body"></div>
      <div class="vz-dr-actions">
        <button class="vz-btn vz-btn-primary" style="flex:1;justify-content:center" data-act="take-ref">+ Tomar como referencia</button>
      </div>`;
    document.body.appendChild(ov); document.body.appendChild(dr);
    ov.addEventListener('click', closeDrawer);
  }
  function closeDrawer() {
    document.getElementById('vz-drawer')?.classList.remove('vz-on');
    document.getElementById('vz-drawer-ov')?.classList.remove('vz-on');
  }
  async function takeRef() {
    const i = parseInt(document.getElementById('vz-drawer')?.dataset.ref, 10);
    const p = suggestions[i]; if (!p) return;
    try {
      refs = await API.post('/vision/' + V.id + '/references', {
        project_identifier: p.project_identifier, title: p.title, programme: p.programme,
        funding_year: p.funding_year, coordinator_country: p.coordinator_country, match_score: p.score,
      });
      Toast.show('Referencia añadida', 'ok');
      closeDrawer();
      renderRefs();
    } catch (e) { Toast.show(e.message || 'No se pudo añadir', 'error'); }
  }

  /* ── Autosave del composer (una sola ventana) ─────────────────── */
  function collectComposer() {
    const g = (id) => document.getElementById(id);
    const p = {};
    if (g('vz-idea')) p.problem = g('vz-idea').value.trim();
    if (g('vz-vision')) p.vision_text = g('vz-vision').value.trim();
    if (g('vz-title')) p.title = g('vz-title').value.trim();
    if (g('vz-entity')) p.entity_oid = g('vz-entity').value.trim() || null;
    if (g('vz-budget')) { const b = g('vz-budget').value; if (b) p.budget_option_eur = Number(b); }
    return p;
  }
  async function saveComposer(patch) {
    const p = patch || collectComposer();
    try { V = await API.patch('/vision/' + V.id, p); } catch (e) { /* silencioso */ }
  }

  /* ── VIEW: Ficha ──────────────────────────────────────────────── */
  async function review() {
    await saveComposer();
    if (!V.title) { const t = (V.vision_text || V.problem || 'Mi visión').split(/[.\n]/)[0].slice(0, 80); await API.patch('/vision/' + V.id, { title: t }); }
    V = await API.get('/vision/' + V.id).then(d => { refs = d.references || []; return d.vision; });
    renderBrief();
  }

  function renderBrief() {
    view = 'brief';
    const pub = V.visibility === 'public';
    const seek = (k, v) => `<div class="vz-seek"><div class="vz-seek-k">${k}</div><div class="vz-seek-v">${v || '—'}</div></div>`;
    $root().innerHTML = `
      <div class="vz-head" style="margin-bottom:16px"><div>
        <div class="vz-eyebrow">Ficha de visión</div>
        <h1 class="vz-h1">Tu visión, lista para compartir</h1>
      </div>
      <div style="display:flex;gap:10px">
        <button class="vz-btn vz-btn-ghost" data-act="edit">✎ Seguir editando</button>
        <button class="vz-btn vz-btn-ghost" data-act="back-list">Mis visiones</button>
      </div></div>
      <div class="vz-brief-wrap">
        <article class="vz-brief">
          <div class="vz-brief-hero">
            <div class="vz-eyebrow" style="color:var(--vz-lav)">${esc(V.programme || 'Convocatoria')} · ${pub ? 'buscando socios' : 'borrador privado'}</div>
            <h1>${esc(V.title || 'Mi visión')}</h1>
            <div class="vz-hero-meta">
              ${V.budget_option_eur != null ? `<span class="vz-hm vz-hm-y">${eur(V.budget_option_eur)}</span>` : ''}
              ${V.wp_count ? `<span class="vz-hm">${V.wp_count} paquetes de trabajo</span>` : ''}
              ${V.call_deadline ? `<span class="vz-hm">Deadline ${fmtDate(V.call_deadline)}</span>` : ''}
            </div>
          </div>
          <div class="vz-brief-body">
            <div class="vz-bsec vz-euval"><div class="vz-eyebrow">La visión</div>${paras(V.vision_text || V.problem)}
              ${arr(V.themes).length ? `<div class="vz-chips" style="margin-top:12px">${arr(V.themes).map(t => `<span class="vz-rc-tag">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>
            <div class="vz-bsec"><div class="vz-eyebrow">A quién busco</div>
              <div class="vz-seek-grid">
                ${seek('Tipo de socio', esc(arr(V.partner_types).join(' · ')))}
                ${seek('Países', arr(V.partner_countries).map(c => flag(c) + ' ' + esc(cName(c))).join(' · '))}
                ${seek('Mi entidad', esc(V.entity_oid || 'sin vincular'))}
              </div>
            </div>
          </div>
        </article>
        <aside class="vz-brief-side">
          <div class="vz-toggle-card">
            <div class="vz-toggle-row">
              <div><h4>Visibilidad</h4><div class="vz-muted vz-sm" style="max-width:24ch">Nace privada. Publícala cuando quieras que la comunidad la vea.</div></div>
              <div class="vz-switch ${pub ? 'vz-on' : ''}" data-act="toggle-vis"></div>
            </div>
            <div class="vz-vis-state ${pub ? 'vz-vis-pub' : 'vz-vis-priv'}" id="vz-vis-state">${pub ? '🌍 Pública · visible para la comunidad' : '🔒 Privada · solo tú la ves'}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:9px">
            <button class="vz-btn vz-btn-primary" style="justify-content:center" data-act="promote">🏗️ Llevar a Diseñar</button>
          </div>
          <div class="vz-note vz-sm" style="display:block">Al publicarla, otras entidades podrán marcar “Me interesa participar”. Los invitados podrán verla, pero no mostrar interés.</div>
        </aside>
      </div>`;
  }

  async function toggleVis() {
    const next = V.visibility === 'public' ? 'private' : 'public';
    try {
      V = await API.post('/vision/' + V.id + '/publish', { visibility: next });
      renderBrief();
      Toast.show(next === 'public' ? 'Visión publicada' : 'Visión ahora privada', 'ok');
    } catch (e) {
      if (e.code === 'ENTITY_REQUIRED') Toast.show('Vincula tu entidad (OID) antes de publicar — edita el paso Consorcio', 'error');
      else if (e.code === 'INCOMPLETE') Toast.show('Completa la visión antes de publicar', 'error');
      else Toast.show(e.message || 'No se pudo publicar', 'error');
    }
  }

  async function promote() {
    try {
      const r = await API.post('/vision/' + V.id + '/promote', {});
      Toast.show(r.already ? 'Ya estaba en Diseñar — abriendo…' : 'Proyecto creado en Diseñar', 'ok');
      if (r.project_id && typeof Intake !== 'undefined') { App.navigate('intake'); Intake.openProject(r.project_id); }
      else App.navigate('my-projects');
    } catch (e) { Toast.show(e.message || 'No se pudo llevar a Diseñar', 'error'); }
  }

  /* ── Redacción asistida por IA (Claude de suscripción) — rellena en línea ── */
  async function genAI() {
    await saveComposer(); // persistir la idea escrita antes de generar
    if (!V.problem && !refs.length && !arr(V.themes).length) {
      Toast.show('Escribe tu idea, marca algún tema o añade un proyecto de referencia primero', 'error');
      return;
    }
    const btn = document.querySelector('[data-act="ai-generate"]');
    if (btn) { btn.dataset.label = btn.textContent; btn.textContent = 'Generando… (~15s)'; btn.disabled = true; }
    try {
      const cc = call ? {
        title: call.title, programme: call.programme, main_objective: call.main_objective, summary_es: call.summary_es,
        eligible_activities: call.eligible_activities, expected_outcomes: call.expected_outcomes, themes_ai: call.themes_ai,
        budget_per_project_min_eur: call.budget_per_project_min_eur, budget_per_project_max_eur: call.budget_per_project_max_eur,
        cofinancing_pct: call.cofinancing_pct,
      } : {};
      const draft = await API.post('/vision/' + V.id + '/generate', { call_context: cc });
      const tEl = document.getElementById('vz-title'), vEl = document.getElementById('vz-vision');
      if (tEl && draft.title) tEl.value = draft.title;
      if (vEl && draft.vision_text) vEl.value = draft.vision_text;
      await saveComposer();
      Toast.show('Visión generada — revísala y edítala a tu gusto', 'ok');
    } catch (e) {
      const msg = e.code === 'AI_UNAVAILABLE' ? 'La IA de suscripción no está disponible en este entorno'
        : e.code === 'AI_TIMEOUT' ? 'La IA tardó demasiado. Inténtalo de nuevo.'
        : (e.message || 'No se pudo generar la visión');
      Toast.show(msg, 'error');
    } finally {
      if (btn) { btn.textContent = btn.dataset.label || '✨ Generar mi visión con IA'; btn.disabled = false; }
    }
  }

  /* ── Delegación de eventos ────────────────────────────────────── */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const inRoot = t.closest('#vision-root') || t.closest('#vz-drawer');
    if (!inRoot) return;
    const act = t.dataset.act;
    const map = {
      'new': () => renderPicker(),
      'go-convocatorias': () => App.navigate('convocatorias'),
      'pick-call': () => pickCall(t.dataset.id),
      'open': () => openVision(t.dataset.id),
      'back-list': () => loadList(),
      'suggest': () => doSuggest(),
      'review': () => review(),
      'open-proj': () => openProject(parseInt(t.dataset.i, 10)),
      'close-drawer': () => closeDrawer(),
      'take-ref': () => takeRef(),
      'remove-ref': async () => { try { refs = await API.del('/vision/' + V.id + '/references/' + t.dataset.id); renderRefs(); } catch (e) { Toast.show('No se pudo quitar', 'error'); } },
      'toggle-callpanel': () => { callPanelOpen = !callPanelOpen; renderCallPanel(); },
      'pick-budget': () => { V.budget_option_eur = Number(t.dataset.v); V.budget_label = t.dataset.l; saveComposer({ budget_option_eur: Number(t.dataset.v), budget_label: t.dataset.l }); document.querySelectorAll('[data-act="pick-budget"]').forEach(el => el.classList.toggle('vz-sel', el === t)); },
      'wp-inc': () => { V.wp_count = Math.min(20, (V.wp_count || 3) + 1); document.getElementById('vz-wp').textContent = V.wp_count; saveComposer({ wp_count: V.wp_count }); },
      'wp-dec': () => { V.wp_count = Math.max(1, (V.wp_count || 3) - 1); document.getElementById('vz-wp').textContent = V.wp_count; saveComposer({ wp_count: V.wp_count }); },
      'remove-cty': () => { V.partner_countries = arr(V.partner_countries).filter(c => c !== t.dataset.v); saveComposer({ partner_countries: V.partner_countries }); renderConsorcio(); },
      'remove-type': () => { V.partner_types = arr(V.partner_types).filter(x => x !== t.dataset.v); saveComposer({ partner_types: V.partner_types }); renderConsorcio(); },
      'toggle-theme': () => { const s = new Set(arr(V.themes)); s.has(t.dataset.v) ? s.delete(t.dataset.v) : s.add(t.dataset.v); V.themes = [...s]; t.classList.toggle('vz-sel'); saveComposer({ themes: V.themes }); },
      'edit': () => renderComposer(),
      'ai-generate': () => genAI(),
      'toggle-vis': () => toggleVis(),
      'promote': () => promote(),
    };
    if (map[act]) { e.preventDefault(); map[act](); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // Autosave del composer al salir de un campo de texto.
  document.addEventListener('focusout', (e) => {
    if (e.target && ['vz-idea', 'vz-vision', 'vz-title', 'vz-entity', 'vz-budget'].includes(e.target.id)) saveComposer();
  });

  // Añadir país desde el input/datalist (Enter o selección del datalist).
  function addCountryFromInput(inp) {
    const code = resolveCountry(inp.value);
    if (!code) { if (inp.value.trim()) Toast.show('País no reconocido: ' + inp.value, 'error'); return; }
    const s = new Set(arr(V.partner_countries)); s.add(code); V.partner_countries = [...s];
    inp.value = '';
    saveComposer({ partner_countries: V.partner_countries });
    renderConsorcio();
  }
  // Añadir tipo de socio: acepta uno de la lista o texto libre del usuario.
  function addTypeFromInput(inp) {
    const raw = String(inp.value || '').trim();
    if (!raw) return;
    const known = PARTNER_TYPES.find(x => x.toLowerCase() === raw.toLowerCase());
    const val = known || raw;
    const s = new Set(arr(V.partner_types)); s.add(val); V.partner_types = [...s];
    inp.value = '';
    saveComposer({ partner_types: V.partner_types });
    renderConsorcio();
  }
  function addFromInput(el) {
    if (el.id === 'vz-cty-input') addCountryFromInput(el);
    else if (el.id === 'vz-type-input') addTypeFromInput(el);
  }
  const INPUT_IDS = new Set(['vz-cty-input', 'vz-type-input']);
  document.addEventListener('change', (e) => { if (e.target && INPUT_IDS.has(e.target.id)) addFromInput(e.target); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && INPUT_IDS.has(e.target.id)) { e.preventDefault(); addFromInput(e.target); } });

  /* ── Estilos (scoped, prefijo vz-) ────────────────────────────── */
  function injectStyles() {
    if (stylesInjected) return; stylesInjected = true;
    const css = `
    #vision-root{--vz-navy:#1b1464;--vz-navy2:#241a7a;--vz-ink:#241d52;--vz-muted:#736ea0;--vz-line:#e7e3f2;--vz-line2:#d9d3ee;--vz-yellow:#fbff12;--vz-lav:#c7afdf;--vz-lavsoft:#efeafa;--vz-green:#1f9d6b;--vz-greensoft:#e5f5ee;--vz-card:#fff;--vz-ground:#f4f3f9;color:var(--vz-ink);font-family:inherit}
    #vision-root h1,#vision-root h2,#vision-root h3,#vision-root h4{margin:0}
    #vision-root .vz-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--vz-muted)}
    #vision-root .vz-muted{color:var(--vz-muted)} #vision-root .vz-sm{font-size:12.5px}
    #vision-root .vz-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap}
    #vision-root .vz-h1{font-size:24px;color:var(--vz-ink);margin-top:4px} #vision-root .vz-lead{color:var(--vz-muted);font-size:13.5px;margin-top:4px;max-width:56ch}
    #vision-root .vz-btn{border:none;border-radius:10px;padding:11px 18px;font-weight:700;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-family:inherit}
    #vision-root .vz-btn-sm{padding:8px 13px;font-size:12.5px} #vision-root .vz-btn-primary{background:var(--vz-yellow);color:var(--vz-navy)} #vision-root .vz-btn-navy{background:var(--vz-navy);color:#fff}
    #vision-root .vz-btn-ghost{background:transparent;color:var(--vz-muted);border:1px solid var(--vz-line2)}
    #vision-root .vz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
    #vision-root .vz-card{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:11px;cursor:pointer;box-shadow:0 8px 24px -14px rgba(27,20,100,.18)}
    #vision-root .vz-card:hover{border-color:var(--vz-lav)}
    #vision-root .vz-card-new{border-style:dashed;align-items:center;justify-content:center;text-align:center;color:var(--vz-muted);background:transparent;min-height:170px}
    #vision-root .vz-plus{width:42px;height:42px;border-radius:12px;background:var(--vz-lavsoft);color:var(--vz-navy);display:grid;place-items:center;font-size:24px}
    #vision-root .vz-card h3{font-size:16px;color:var(--vz-ink);line-height:1.25}
    #vision-root .vz-row-between{display:flex;justify-content:space-between;align-items:center}
    #vision-root .vz-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px}
    #vision-root .vz-pill-draft{background:var(--vz-lavsoft);color:var(--vz-navy)} #vision-root .vz-pill-ok{background:var(--vz-greensoft);color:var(--vz-green)} #vision-root .vz-pill-priv{background:#e9eafb;color:var(--vz-navy)}
    #vision-root .vz-callchip{display:inline-flex;gap:6px;font-size:11.5px;font-weight:600;color:var(--vz-muted);background:var(--vz-lavsoft);border-radius:8px;padding:5px 9px;align-self:flex-start}
    #vision-root .vz-callchip b{color:var(--vz-navy)}
    #vision-root .vz-note{background:var(--vz-lavsoft);border:1px solid var(--vz-lav);border-radius:12px;padding:14px 16px;font-size:13px;color:var(--vz-navy);line-height:1.55;display:flex;gap:10px;align-items:flex-start}
    #vision-root .vz-call-list{display:flex;flex-direction:column;gap:11px}
    #vision-root .vz-callrow{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:14px;padding:15px 17px;display:flex;align-items:center;gap:16px;cursor:pointer;box-shadow:0 8px 24px -16px rgba(27,20,100,.18)}
    #vision-root .vz-callrow:hover{border-color:var(--vz-lav)}
    #vision-root .vz-badge{font-size:10px;font-weight:700;letter-spacing:.06em;background:var(--vz-navy);color:#fff;padding:4px 9px;border-radius:7px;white-space:nowrap}
    #vision-root .vz-callrow-main{flex:1;min-width:0} #vision-root .vz-callrow-main h3{font-size:14.5px;color:var(--vz-ink)}
    #vision-root .vz-callrow-dl{font-size:11.5px;color:var(--vz-muted);text-align:right;white-space:nowrap} #vision-root .vz-callrow-dl b{color:var(--vz-ink);display:block}
    #vision-root .vz-go{font-size:20px;color:var(--vz-lav)}
    #vision-root .vz-banner{background:linear-gradient(100deg,var(--vz-navy),var(--vz-navy2));color:#fff;border-radius:16px;padding:16px 20px;display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
    #vision-root .vz-tag{font-size:10px;font-weight:700;letter-spacing:.1em;background:var(--vz-yellow);color:var(--vz-navy);padding:3px 8px;border-radius:6px}
    #vision-root .vz-banner h2{font-size:16px;flex:1;min-width:200px;font-weight:600} #vision-root .vz-dl{font-size:12px;color:var(--vz-lav)} #vision-root .vz-dl b{color:#fff}
    #vision-root .vz-ai-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;background:linear-gradient(100deg,var(--vz-lavsoft),#fff);border:1px solid var(--vz-lav);border-radius:12px;padding:12px 16px;margin-bottom:18px;flex-wrap:wrap}
    #vision-root .vz-ai-banner > div{font-size:12.5px;color:var(--vz-navy);flex:1;min-width:240px;line-height:1.5}
    #vision-root .vz-comp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap;font-size:14px;color:var(--vz-ink)}
    #vision-root .vz-tag-navy{font-size:10px;font-weight:700;letter-spacing:.1em;background:var(--vz-navy);color:#fff;padding:3px 8px;border-radius:6px;margin-right:6px}
    #vision-root .vz-main{display:flex;flex-direction:column;gap:16px}
    #vision-root .vz-block{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:20px 22px;box-shadow:0 8px 24px -16px rgba(27,20,100,.18)}
    #vision-root .vz-block-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700;color:var(--vz-ink)}
    #vision-root .vz-num-badge{width:24px;height:24px;border-radius:8px;background:var(--vz-navy);color:var(--vz-yellow);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
    #vision-root .vz-block .vz-help{margin:6px 0 12px}
    #vision-root .vz-ref-search{display:flex;gap:8px;align-items:center}
    #vision-root .vz-ref-search .vz-field{flex:1}
    #vision-root .vz-ref-search .vz-btn{white-space:nowrap}
    #vision-root .vz-num-row{display:flex;align-items:center;gap:12px}
    #vision-root .vz-comp-single{max-width:860px;margin:0 auto}
    #vision-root .vz-cp-bar{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:12px;margin-bottom:16px;box-shadow:0 8px 24px -18px rgba(27,20,100,.18);overflow:hidden}
    #vision-root .vz-cp-toggle{width:100%;display:flex;align-items:center;gap:8px;background:transparent;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;color:var(--vz-ink);padding:12px 16px}
    #vision-root .vz-cp-bar.vz-open .vz-cp-toggle{border-bottom:1px solid var(--vz-line)}
    #vision-root .vz-chev{color:var(--vz-lav);font-size:12px}
    #vision-root .vz-cp-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 22px;padding:6px 16px 12px}
    #vision-root .vz-stepper{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}
    /* modal IA (fuera de #vision-root) */
    .vz-modal-ov{position:fixed;inset:0;background:rgba(20,15,60,.5);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit}
    .vz-modal{background:#fff;border-radius:16px;width:min(560px,96vw);max-height:88vh;overflow:auto;box-shadow:0 30px 80px -20px rgba(20,15,60,.6)}
    .vz-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;font-weight:700;color:#1b1464;font-size:15px;border-bottom:1px solid #e7e3f2}
    .vz-modal-x{border:none;background:#f4f3f9;width:28px;height:28px;border-radius:8px;cursor:pointer;color:#736ea0;font-size:14px}
    .vz-modal-body{padding:10px 20px 16px}
    .vz-modal-body .vz-help{font-size:13px;color:#736ea0}
    .vz-modal-body .vz-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#736ea0;margin-bottom:6px}
    .vz-modal-body .vz-field{width:100%;border:1.5px solid #d9d3ee;border-radius:12px;padding:11px 13px;font-family:inherit;font-size:14px;color:#241d52;background:#f4f3f9;resize:vertical;box-sizing:border-box;line-height:1.55}
    .vz-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e7e3f2}
    .vz-modal .vz-btn{border:none;border-radius:10px;padding:10px 16px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
    .vz-modal .vz-btn-primary{background:#fbff12;color:#1b1464} .vz-modal .vz-btn-ghost{background:transparent;color:#736ea0;border:1px solid #d9d3ee}
    #vision-root .vz-step{flex:1;min-width:110px;border-top:3px solid var(--vz-line2);padding-top:9px;cursor:pointer}
    #vision-root .vz-step-n{font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--vz-muted)} #vision-root .vz-step-t{font-size:12.5px;font-weight:600;color:var(--vz-muted)}
    #vision-root .vz-step.vz-done{border-color:var(--vz-green)} #vision-root .vz-step.vz-done .vz-step-n{color:var(--vz-green)}
    #vision-root .vz-step.vz-active{border-color:var(--vz-yellow)} #vision-root .vz-step.vz-active .vz-step-n,#vision-root .vz-step.vz-active .vz-step-t{color:var(--vz-ink)}
    #vision-root .vz-cols{display:grid;grid-template-columns:1.55fr 1fr;gap:20px;align-items:start}
    @media(max-width:900px){#vision-root .vz-cols{grid-template-columns:1fr}}
    #vision-root .vz-q{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:24px;box-shadow:0 8px 24px -14px rgba(27,20,100,.18)}
    #vision-root .vz-qn{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--vz-lav);text-transform:uppercase}
    #vision-root .vz-q h2{font-size:21px;color:var(--vz-ink);margin:8px 0 6px;line-height:1.25} #vision-root .vz-help{font-size:13px;color:var(--vz-muted);margin-bottom:16px}
    #vision-root .vz-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--vz-muted);margin-bottom:6px}
    #vision-root .vz-field{width:100%;border:1.5px solid var(--vz-line2);border-radius:12px;padding:13px 14px;font-family:inherit;font-size:14px;color:var(--vz-ink);background:var(--vz-ground);resize:vertical}
    #vision-root .vz-field:focus{outline:none;border-color:var(--vz-lav)}
    #vision-root .vz-chip-hint{font-size:11.5px;color:var(--vz-muted);margin-top:14px} #vision-root .vz-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    #vision-root .vz-chip{font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;border:1.5px solid var(--vz-line2);color:var(--vz-muted);cursor:pointer;background:var(--vz-card)}
    #vision-root .vz-chip.vz-sel{background:var(--vz-navy);color:#fff;border-color:var(--vz-navy)} #vision-root .vz-chip-suggest{border-style:dashed}
    #vision-root .vz-radio-row{display:flex;gap:10px;flex-wrap:wrap} #vision-root .vz-radio{flex:1;min-width:150px;border:1.5px solid var(--vz-line2);border-radius:12px;padding:13px;cursor:pointer;background:var(--vz-card)}
    #vision-root .vz-radio.vz-sel{border-color:var(--vz-navy);box-shadow:inset 0 0 0 1px var(--vz-navy)} #vision-root .vz-amt{font-size:16px;font-weight:700;color:var(--vz-ink)} #vision-root .vz-rlbl{font-size:11.5px;color:var(--vz-muted)}
    #vision-root .vz-num{display:inline-flex;align-items:center;border:1.5px solid var(--vz-line2);border-radius:10px;overflow:hidden} #vision-root .vz-num button{width:38px;height:40px;border:none;background:var(--vz-ground);font-size:18px;color:var(--vz-navy);cursor:pointer} #vision-root .vz-num-v{width:48px;text-align:center;font-weight:700;font-size:16px}
    #vision-root .vz-review{background:var(--vz-ground);border-radius:12px;padding:16px;font-size:13px;color:var(--vz-muted);line-height:1.9}
    #vision-root .vz-btns{display:flex;justify-content:space-between;gap:12px;margin-top:18px}
    #vision-root .vz-rail{display:flex;flex-direction:column;gap:14px;position:sticky;top:16px}
    #vision-root .vz-rail-card{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:16px 17px;box-shadow:0 8px 24px -16px rgba(27,20,100,.18)}
    #vision-root .vz-rail-soft{background:var(--vz-lavsoft);border-color:var(--vz-lav)}
    #vision-root .vz-rc-head{display:flex;align-items:center;gap:8px;margin-bottom:10px} #vision-root .vz-dot{width:7px;height:7px;border-radius:50%;background:var(--vz-green)} #vision-root .vz-rc-head h4{font-size:12.5px;color:var(--vz-ink)} #vision-root .vz-locked{margin-left:auto;font-size:10px;font-weight:700;color:var(--vz-muted)}
    #vision-root .vz-rc-item{padding:8px 0;border-top:1px solid var(--vz-line);font-size:12.5px} #vision-root .vz-rc-item:first-of-type{border-top:none}
    #vision-root .vz-rc-k{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vz-muted);margin-bottom:2px} #vision-root .vz-rc-v{color:var(--vz-ink);line-height:1.45}
    #vision-root .vz-rc-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:3px} #vision-root .vz-rc-tag{font-size:11px;background:var(--vz-lavsoft);color:var(--vz-navy);padding:2px 8px;border-radius:6px;font-weight:600}
    #vision-root .vz-simi{margin-top:20px} #vision-root .vz-simi-head{display:flex;align-items:center;gap:8px;margin-bottom:12px} #vision-root .vz-simi-head h3{font-size:15px;color:var(--vz-ink)}
    #vision-root .vz-simi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:12px}
    #vision-root .vz-scard{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:12px;padding:14px;cursor:pointer;box-shadow:0 8px 24px -16px rgba(27,20,100,.18)}
    #vision-root .vz-scard:hover{border-color:var(--vz-lav)} #vision-root .vz-score{display:inline-flex;gap:5px;font-size:11px;font-weight:700;color:var(--vz-green);background:var(--vz-greensoft);padding:2px 8px;border-radius:20px}
    #vision-root .vz-scard h4{font-size:13px;color:var(--vz-ink);margin:9px 0 5px;line-height:1.3} #vision-root .vz-add{margin-top:10px;font-size:11.5px;font-weight:700;color:var(--vz-navy)}
    #vision-root .vz-brief-wrap{display:grid;grid-template-columns:1fr 260px;gap:22px;align-items:start} @media(max-width:820px){#vision-root .vz-brief-wrap{grid-template-columns:1fr}}
    #vision-root .vz-brief{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;overflow:hidden;box-shadow:0 8px 24px -14px rgba(27,20,100,.18)}
    #vision-root .vz-brief-hero{background:linear-gradient(120deg,var(--vz-navy),var(--vz-navy2));color:#fff;padding:26px 28px} #vision-root .vz-brief-hero h1{font-size:25px;margin:8px 0 12px;color:#fff;line-height:1.2}
    #vision-root .vz-hero-meta{display:flex;gap:8px;flex-wrap:wrap} #vision-root .vz-hm{font-size:11.5px;font-weight:600;background:rgba(255,255,255,.12);padding:5px 11px;border-radius:8px} #vision-root .vz-hm-y{background:var(--vz-yellow);color:var(--vz-navy)}
    #vision-root .vz-brief-body{padding:24px 28px;display:flex;flex-direction:column;gap:22px} #vision-root .vz-bsec p{font-size:14px;color:var(--vz-ink);line-height:1.6;margin-top:7px} #vision-root .vz-euval p{border-left:3px solid var(--vz-yellow);padding-left:14px}
    #vision-root .vz-seek-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:7px} #vision-root .vz-seek{background:var(--vz-ground);border-radius:12px;padding:13px 15px}
    #vision-root .vz-seek-k{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vz-muted)} #vision-root .vz-seek-v{font-size:13.5px;color:var(--vz-ink);font-weight:600;margin-top:4px;line-height:1.4}
    #vision-root .vz-ref-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:7px} #vision-root .vz-ref{background:var(--vz-ground);border-radius:10px;padding:11px 13px;font-size:12px} #vision-root .vz-ref b{color:var(--vz-ink);display:block;margin-bottom:3px;line-height:1.3} #vision-root .vz-ref span{color:var(--vz-muted)}
    #vision-root .vz-brief-side{display:flex;flex-direction:column;gap:14px;position:sticky;top:16px}
    #vision-root .vz-toggle-card{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:17px;box-shadow:0 8px 24px -16px rgba(27,20,100,.18)}
    #vision-root .vz-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:10px} #vision-root .vz-toggle-row h4{font-size:13.5px;color:var(--vz-ink)}
    #vision-root .vz-switch{width:44px;height:25px;border-radius:20px;background:var(--vz-line2);position:relative;cursor:pointer;flex-shrink:0;transition:background .2s} #vision-root .vz-switch::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.25)}
    #vision-root .vz-switch.vz-on{background:var(--vz-green)} #vision-root .vz-switch.vz-on::after{left:22px}
    #vision-root .vz-vis-state{font-size:12px;font-weight:700;margin-top:12px;padding:9px 12px;border-radius:9px;text-align:center} #vision-root .vz-vis-priv{background:#e9eafb;color:var(--vz-navy)} #vision-root .vz-vis-pub{background:var(--vz-greensoft);color:var(--vz-green)}
    /* drawer (fuera de #vision-root) */
    .vz-drawer-ov{position:fixed;inset:0;background:rgba(20,15,60,.42);z-index:60;opacity:0;pointer-events:none;transition:opacity .2s} .vz-drawer-ov.vz-on{opacity:1;pointer-events:auto}
    .vz-drawer{position:fixed;top:0;right:0;height:100%;width:min(440px,92vw);background:#fff;z-index:61;box-shadow:-16px 0 40px -18px rgba(20,15,60,.5);transform:translateX(100%);transition:transform .26s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;font-family:inherit}
    .vz-drawer.vz-on{transform:translateX(0)}
    .vz-dr-top{background:linear-gradient(120deg,#1b1464,#241a7a);color:#fff;padding:20px 22px 18px;position:relative} .vz-dr-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:none;background:rgba(255,255,255,.14);color:#fff;font-size:16px;cursor:pointer}
    .vz-dr-score{display:inline-flex;gap:5px;font-size:11px;font-weight:700;color:#1b1464;background:#fbff12;padding:3px 9px;border-radius:20px} .vz-dr-top h2{font-size:18px;margin:12px 0 6px;color:#fff;line-height:1.28} .vz-dr-meta{font-size:12px;color:#c7afdf}
    .vz-dr-body{padding:20px 22px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:18px} .vz-dr-body .vz-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#736ea0;display:block;margin-bottom:6px} .vz-dr-sec p{font-size:13.5px;color:#241d52;line-height:1.62;margin:0}
    .vz-dr-actions{padding:14px 22px;border-top:1px solid #e7e3f2;display:flex;gap:9px} .vz-drawer .vz-btn{border:none;border-radius:10px;padding:10px 14px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit} .vz-drawer .vz-btn-primary{background:#fbff12;color:#1b1464}
    `;
    const st = document.createElement('style'); st.id = 'vision-styles'; st.textContent = css; document.head.appendChild(st);
  }

  return { init, startForCall };
})();
