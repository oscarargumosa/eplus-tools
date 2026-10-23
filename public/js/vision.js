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
  const LOC = () => (I18N.lang === 'en' ? 'en-GB' : 'es-ES');
  const eur = (n) => n == null ? null : (I18N.lang === 'en' ? '€' + Number(n).toLocaleString(LOC()) : Number(n).toLocaleString(LOC()) + ' €');
  const fmtDate = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };
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
  // Nombres en español; en inglés se sacan del navegador (Intl.DisplayNames). Se guardan códigos ISO.
  const WORLD_ES = Object.fromEntries(('AF:Afganistán,AL:Albania,DZ:Argelia,AD:Andorra,AO:Angola,AG:Antigua y Barbuda,AR:Argentina,AM:Armenia,AU:Australia,AT:Austria,AZ:Azerbaiyán,BS:Bahamas,BH:Baréin,BD:Bangladés,BB:Barbados,BY:Bielorrusia,BE:Bélgica,BZ:Belice,BJ:Benín,BT:Bután,BO:Bolivia,BA:Bosnia y Herzegovina,BW:Botsuana,BR:Brasil,BN:Brunéi,BG:Bulgaria,BF:Burkina Faso,BI:Burundi,CV:Cabo Verde,KH:Camboya,CM:Camerún,CA:Canadá,CF:República Centroafricana,TD:Chad,CL:Chile,CN:China,CO:Colombia,KM:Comoras,CG:Congo,CD:Rep. Dem. del Congo,CR:Costa Rica,CI:Costa de Marfil,HR:Croacia,CU:Cuba,CY:Chipre,CZ:Chequia,DK:Dinamarca,DJ:Yibuti,DM:Dominica,DO:República Dominicana,EC:Ecuador,EG:Egipto,SV:El Salvador,GQ:Guinea Ecuatorial,ER:Eritrea,EE:Estonia,SZ:Esuatini,ET:Etiopía,FJ:Fiyi,FI:Finlandia,FR:Francia,GA:Gabón,GM:Gambia,GE:Georgia,DE:Alemania,GH:Ghana,GR:Grecia,GD:Granada,GT:Guatemala,GN:Guinea,GW:Guinea-Bisáu,GY:Guyana,HT:Haití,HN:Honduras,HU:Hungría,IS:Islandia,IN:India,ID:Indonesia,IR:Irán,IQ:Irak,IE:Irlanda,IL:Israel,IT:Italia,JM:Jamaica,JP:Japón,JO:Jordania,KZ:Kazajistán,KE:Kenia,KI:Kiribati,KW:Kuwait,KG:Kirguistán,LA:Laos,LV:Letonia,LB:Líbano,LS:Lesoto,LR:Liberia,LY:Libia,LI:Liechtenstein,LT:Lituania,LU:Luxemburgo,MG:Madagascar,MW:Malaui,MY:Malasia,MV:Maldivas,ML:Malí,MT:Malta,MH:Islas Marshall,MR:Mauritania,MU:Mauricio,MX:México,FM:Micronesia,MD:Moldavia,MC:Mónaco,MN:Mongolia,ME:Montenegro,MA:Marruecos,MZ:Mozambique,MM:Birmania,NA:Namibia,NR:Nauru,NP:Nepal,NL:Países Bajos,NZ:Nueva Zelanda,NI:Nicaragua,NE:Níger,NG:Nigeria,MK:Macedonia del Norte,NO:Noruega,OM:Omán,PK:Pakistán,PW:Palaos,PS:Palestina,PA:Panamá,PG:Papúa Nueva Guinea,PY:Paraguay,PE:Perú,PH:Filipinas,PL:Polonia,PT:Portugal,QA:Catar,RO:Rumanía,RU:Rusia,RW:Ruanda,KN:San Cristóbal y Nieves,LC:Santa Lucía,VC:San Vicente y las Granadinas,WS:Samoa,SM:San Marino,ST:Santo Tomé y Príncipe,SA:Arabia Saudita,SN:Senegal,RS:Serbia,SC:Seychelles,SL:Sierra Leona,SG:Singapur,SK:Eslovaquia,SI:Eslovenia,SB:Islas Salomón,SO:Somalia,ZA:Sudáfrica,KR:Corea del Sur,SS:Sudán del Sur,ES:España,LK:Sri Lanka,SD:Sudán,SR:Surinam,SE:Suecia,CH:Suiza,SY:Siria,TW:Taiwán,TJ:Tayikistán,TZ:Tanzania,TH:Tailandia,TL:Timor Oriental,TG:Togo,TO:Tonga,TT:Trinidad y Tobago,TN:Túnez,TR:Turquía,TM:Turkmenistán,TV:Tuvalu,UG:Uganda,UA:Ucrania,AE:Emiratos Árabes Unidos,GB:Reino Unido,US:Estados Unidos,UY:Uruguay,UZ:Uzbekistán,VU:Vanuatu,VA:Ciudad del Vaticano,VE:Venezuela,VN:Vietnam,YE:Yemen,ZM:Zambia,ZW:Zimbabue').split(',').map(p => { const i = p.indexOf(':'); return [p.slice(0, i), p.slice(i + 1)]; }));  // i18n-no (en inglés: Intl.DisplayNames)
  const WORLD = (() => {
    if (I18N.lang !== 'en') return WORLD_ES;
    try {
      const dn = new Intl.DisplayNames(['en-GB'], { type: 'region' });
      return Object.fromEntries(Object.keys(WORLD_ES).map(c => [c, dn.of(c) || WORLD_ES[c]]));
    } catch { return WORLD_ES; }
  })();
  const cName = (cc) => WORLD[String(cc).toUpperCase()] || cc;

  /* Tipos de socio — perfiles de entidad habituales en proyectos europeos
     (Erasmus+, Horizon, CERV, ESF+…). El usuario puede además escribir uno
     propio si no está en la lista. */
  const PARTNER_TYPES = [
    _t('ONG / Organización sin ánimo de lucro'), _t('Asociación'), _t('Fundación'),
    _t('Universidad / Educación superior'), _t('Centro de investigación'), _t('Instituto tecnológico'),
    _t('Escuela (infantil / primaria / secundaria)'), _t('Centro de Formación Profesional (FP/VET)'),
    _t('Organización de educación de adultos'), _t('Organización juvenil'), _t('Grupo informal de jóvenes'),
    _t('Cooperativa'), _t('Empresa social'), _t('PYME'), _t('Gran empresa'), _t('Startup'), _t('Incubadora / Aceleradora'),
    _t('Consultora'), _t('Cámara de comercio / industria'), _t('Clúster empresarial'),
    _t('Administración pública local (ayuntamiento)'), _t('Administración pública regional'),
    _t('Administración pública nacional'), _t('Agencia pública'), _t('Organismo intermedio'),
    _t('Organización cultural'), _t('Museo'), _t('Biblioteca'), _t('Archivo'), _t('Teatro / Compañía artística'),
    _t('Club o federación deportiva'), _t('Organización sanitaria / hospital'), _t('Centro social'),
    _t('Sindicato'), _t('Organización de empleadores'), _t('Think tank'), _t('Red / Federación europea'),
    _t('Organización internacional'), _t('Medio de comunicación'), _t('Organización de voluntariado'),
    _t('Entidad religiosa'), _t('Cooperativa agraria / agrupación de agricultores'),
    _t('Grupo de Acción Local (LEADER)'), _t('Parque científico / tecnológico'),
  ];
  function resolveCountry(raw) {
    if (!raw) return null;
    const v = String(raw).trim(); if (!v) return null;
    const up = v.toUpperCase(); if (WORLD[up]) return up;
    const low = v.toLowerCase();
    for (const names of [WORLD, WORLD_ES]) for (const [c, n] of Object.entries(names)) if (n.toLowerCase() === low) return c;
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
            <span class="vz-pill ${complete ? 'vz-pill-ok' : 'vz-pill-draft'}">${complete ? '✓ ' + _t('Completa') : '● ' + _t('Borrador')}</span>
            <span class="vz-pill ${pub ? 'vz-pill-ok' : 'vz-pill-priv'}">${pub ? '🌍 ' + _t('Pública') : '🔒 ' + _t('Privada')}</span>
          </div>
          <h3>${esc(v.title || _t('Visión sin título'))}</h3>
          <span class="vz-callchip">🎯 <b>${esc(v.programme || _t('Convocatoria'))}</b> · ${esc(v.call_title || v.call_id)}</span>
          <div class="vz-muted vz-sm">${complete
            ? (pub
              ? (Number(v.interest_count) === 1 ? _t('Publicada · 1 interesado') : _t('Publicada · {n} interesados', { n: v.interest_count || 0 }))
              : _t('Lista para publicar'))
            : _t('Paso {n} de {total}', { n: v.current_step || 1, total: 5 })}</div>
        </div>`;
    }).join('');

    $root().innerHTML = `
      <div class="vz-head">
        <div>
          <div class="vz-eyebrow">${_t('Paso 0 · antes de diseñar')}</div>
          <h1 class="vz-h1">${_t('Mis Visiones')}</h1>
          <p class="vz-lead">${_t('Da forma a tu idea en 5–10 minutos: el reto, a quién buscas y por qué importa a Europa. Compártela con la comunidad y llévala a Diseñar.')}</p>
        </div>
        <button class="vz-btn vz-btn-primary" data-act="new">+ ${_t('Nueva visión')}</button>
      </div>
      <div class="vz-grid">
        <div class="vz-card vz-card-new" data-act="new">
          <div class="vz-plus">+</div>
          <h3>${_t('Empezar una visión')}</h3>
          <div class="vz-muted vz-sm">${_t('Elige una convocatoria y te guiamos')}</div>
        </div>
        ${cards}
      </div>`;
  }

  /* ── VIEW: elegir convocatoria ────────────────────────────────── */
  async function renderPicker() {
    view = 'picker';
    $root().innerHTML = `
      <div class="vz-head"><div>
        <div class="vz-eyebrow">${_t('Nueva visión · paso previo')}</div>
        <h1 class="vz-h1">${_t('¿Sobre qué convocatoria?')}</h1>
        <p class="vz-lead">${_t('Tu visión se construye sobre una convocatoria concreta: de ella sacamos criterios, presupuesto y tipo de socio, para preguntarte solo lo tuyo.')}</p>
      </div></div>
      <div class="vz-eyebrow" style="margin:6px 0 10px">${_t('Convocatorias principales · Studio te acompaña de principio a fin')}</div>
      <div id="vz-call-main" class="vz-call-list"><div class="vz-muted vz-sm">${_t('Cargando convocatorias…')}</div></div>
      <div class="vz-pk-row">
        <div><h2 class="vz-pk-h2">${_t('Otras convocatorias abiertas')}</h2>
          <p class="vz-muted vz-sm" style="margin:0">${_t('De otros programas europeos. Búscala aquí o explórala con todos los filtros en Convocatorias.')}</p></div>
        <button class="vz-btn vz-btn-ghost vz-btn-sm" data-act="go-convocatorias">${_t('Explorar en Convocatorias')} →</button>
      </div>
      <div class="vz-call-filters">
        <input id="vz-call-q" class="vz-input" type="search" placeholder="${_t('Buscar por título, programa o código')}" aria-label="${_t('Buscar convocatoria')}">
        <select id="vz-call-prog" class="vz-input" aria-label="${_t('Programa')}"><option value="">${_t('Todos los programas')}</option></select>
      </div>
      <div id="vz-call-list" class="vz-call-list"></div>
      <div id="vz-call-more" style="margin-top:12px"></div>`;

    let all;
    try {
      const r = await API.get('/convocatorias?limit=2000');
      all = arr(r.items).filter(c => c.deadline).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
    } catch (e) {
      document.getElementById('vz-call-main').innerHTML = `<div class="vz-muted vz-sm">${_t('No se pudieron cargar las convocatorias.')} <a href="#convocatorias">${_t('Ir a Convocatorias')}</a></div>`;
      return;
    }
    if (view !== 'picker') return;

    // Una sola cifra: lo máximo por proyecto si se conoce; si no, el total de la convocatoria.
    const short = (n) => {
      if (n < 1e6) return eur(n);
      const m = (n / 1e6).toLocaleString(LOC(), { maximumFractionDigits: 1 });
      return I18N.lang === 'en' ? `€${m}M` : `${m} M€`;
    };
    const money = (c) => {
      const pp = c.budget_per_project_max_eur ?? c.budget_per_project_min_eur;
      if (pp) {
        const upTo = pp === c.budget_per_project_max_eur && c.budget_per_project_min_eur && c.budget_per_project_min_eur !== pp;
        return `<div class="vz-callrow-dl">${_t('por proyecto')}<b>${upTo ? _t('hasta {importe}', { importe: short(pp) }) : short(pp)}</b></div>`;
      }
      if (c.budget_total_eur) return `<div class="vz-callrow-dl">${_t('presupuesto total')}<b>${short(c.budget_total_eur)}</b></div>`;
      return '';
    };
    const row = (c) => `
      <div class="vz-callrow" data-act="pick-call" data-id="${esc(c.call_id)}">
        <span class="vz-badge">${esc((c.programme || 'EU').toUpperCase())}</span>
        <div class="vz-callrow-main">
          <h3>${esc(c.title || c.call_id)}</h3>
          <div class="vz-muted vz-sm">${esc(c.main_objective || c.summary_es || c.sub_programme || '')}</div>
        </div>
        ${money(c)}
        <div class="vz-callrow-dl">${_t('deadline')}<b>${fmtDate(c.deadline) || '—'}</b></div>
        <span class="vz-go">›</span>
      </div>`;

    // Arriba, solo lo que Studio soporta entero: las acciones activas en
    // Admin → Programas (available_in_efs). Las familias que se van a dar de
    // alta pronto salen como «Próximamente» hasta que haya una activa.
    const main = all.filter(c => c.available_in_efs);
    const PROXIMAMENTE = [
      { label: 'KA3 · European Youth Together', re: /YOUTH-TOG|european youth together/i },
      { label: _t('Capacity Building · Juventud'), re: /capacity building|\bCBY\b|CB-Y|CBHE|CB-YOUTH/i },
      { label: _t('KA2 · Asociaciones de cooperación'), re:/\bKA2\d*\b|KA220|KA210|cooperation partnership|small-scale/i },
    ].filter(f => !main.some(c => f.re.test(`${c.title} ${c.source_id}`)));
    document.getElementById('vz-call-main').innerHTML = main.map(row).join('') + PROXIMAMENTE.map(f => `
      <div class="vz-callrow vz-callrow-soon" aria-disabled="true">
        <span class="vz-badge">ERASMUS+</span>
        <div class="vz-callrow-main"><h3>${esc(f.label)}</h3><div class="vz-muted vz-sm">${_t('Próximamente en Studio')}</div></div>
      </div>`).join('');

    // Abajo, el resto, con buscador y filtro por programa.
    const rest = all.filter(c => !c.available_in_efs);
    const progs = [...new Set(rest.map(c => c.programme).filter(Boolean))].sort((a, b) => a.localeCompare(b, I18N.lang === 'en' ? 'en-GB' : 'es-ES'));
    const sel = document.getElementById('vz-call-prog');
    sel.insertAdjacentHTML('beforeend', progs.map(p => `<option>${esc(p)}</option>`).join(''));
    const qBox = document.getElementById('vz-call-q');
    const PAGE = 10;
    let shown = PAGE;
    const paint = () => {
      const q = qBox.value.trim().toLowerCase(), p = sel.value;
      const hits = rest.filter(c => (!p || c.programme === p) &&
        (!q || [c.title, c.programme, c.sub_programme, c.source_id, c.summary_es, c.summary_en].filter(Boolean).join(' ').toLowerCase().includes(q)));
      document.getElementById('vz-call-list').innerHTML = hits.length
        ? hits.slice(0, shown).map(row).join('')
        : `<div class="vz-muted vz-sm">${_t('Ninguna convocatoria abierta coincide con la búsqueda.')}</div>`;
      const more = document.getElementById('vz-call-more');
      const left = hits.length - shown;
      more.innerHTML = left > 0
        ? `<button class="vz-btn vz-btn-ghost vz-btn-sm" id="vz-call-more-btn">${left === 1 ? _t('Ver más (1 restante)') : _t('Ver más ({n} restantes)', { n: left })}</button>` : '';
      document.getElementById('vz-call-more-btn')?.addEventListener('click', () => { shown += PAGE; paint(); });
    };
    qBox.addEventListener('input', () => { shown = PAGE; paint(); });
    sel.addEventListener('change', () => { shown = PAGE; paint(); });
    paint();
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
      Toast.show(e.message || _t('No se pudo crear la visión'), 'error');
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
    } catch (e) { Toast.show(e.message || _t('No se pudo abrir la visión'), 'error'); }
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
    if (min != null) bOpts.push({ v: min, l: _t('Mínimo por proyecto') });
    if (max != null && max !== min) bOpts.push({ v: max, l: _t('Máximo por proyecto') });
    const budgetHtml = bOpts.length
      ? `<div class="vz-radio-row">${bOpts.map(o => `<div class="vz-radio ${Number(V.budget_option_eur) === Number(o.v) ? 'vz-sel' : ''}" data-act="pick-budget" data-v="${o.v}" data-l="${esc(o.l)}"><div class="vz-amt">${eur(o.v)}</div><div class="vz-rlbl">${esc(o.l)}</div></div>`).join('')}</div>`
      : `<input type="number" class="vz-field" id="vz-budget" placeholder="${_t('Presupuesto objetivo (€)')}" value="${V.budget_option_eur != null ? V.budget_option_eur : ''}">`;

    $root().innerHTML = `
      <div class="vz-comp-head">
        <div><span class="vz-tag-navy">${_t('CONVOCATORIA')}</span> <b>${esc(V.call_title || V.call_id)}</b>
          <span class="vz-muted vz-sm"> · ${_t('deadline {fecha}', { fecha: fmtDate(V.call_deadline) || '—' })}${dl != null ? ' · ' + (dl === 1 ? _t('1 día') : _t('{n} días', { n: dl })) : ''}</span></div>
        <button class="vz-btn vz-btn-ghost vz-btn-sm" data-act="back-list">← ${_t('Mis visiones')}</button>
      </div>

      <div id="vz-callpanel-top"></div>

      <div class="vz-main vz-comp-single">
          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">1</span> ${_t('Cuéntanos tu idea')}</div>
            <p class="vz-help">${_t('Con tus palabras, sencillo y cercano. Luego la IA la convierte en una visión clara.')}</p>
            <textarea class="vz-field" id="vz-idea" rows="4" placeholder="${_t('Lo que quieres hacer, el problema que ves…')}">${esc(V.problem || '')}</textarea>
            ${themes.length ? `<div class="vz-chip-hint">${_t('Temas de la convocatoria — marca los que encajen:')}</div>
              <div class="vz-chips">${themes.slice(0, 10).map(t => `<span class="vz-chip ${arr(V.themes).includes(t) ? 'vz-sel' : ''}" data-act="toggle-theme" data-v="${esc(t)}">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>

          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">2</span> ${_t('Proyectos de referencia')} <span class="vz-muted vz-sm"> · ${_t('opcional')}</span></div>
            <p class="vz-help">${_t('Busca proyectos aprobados parecidos a tu idea y elige los que te inspiren.')}</p>
            <div class="vz-ref-search">
              <input class="vz-field" id="vz-ref-q" placeholder="${_t('Tema o palabras clave (por defecto, tu idea)…')}" autocomplete="off">
              <button class="vz-btn vz-btn-navy vz-btn-sm" data-act="suggest">🔎 ${_t('Buscar')}</button>
            </div>
            <div id="vz-refs-area"></div>
          </div>

          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">3</span> ${_t('Tu visión')} <span class="vz-muted vz-sm"> · ${_t('un solo texto')}</span></div>
            <p class="vz-help">${_t('La IA combina tu idea + lo que pide la convocatoria + los proyectos elegidos en un texto claro para cualquiera. Edítalo a tu gusto.')}</p>
            <button class="vz-btn vz-btn-primary" data-act="ai-generate" style="margin-bottom:10px">✨ ${_t('Generar mi visión con IA')}</button>
            <input class="vz-field" id="vz-title" placeholder="${_t('Título de la visión')}" value="${esc(V.title || '')}" style="margin-bottom:10px">
            <textarea class="vz-field" id="vz-vision" rows="7" placeholder="${_t('Aquí aparecerá tu visión redactada… (o escríbela tú)')}">${esc(V.vision_text || '')}</textarea>
          </div>

          <div class="vz-block">
            <div class="vz-block-h"><span class="vz-num-badge">4</span> ${_t('Detalles')}</div>
            <label class="vz-lbl">${_t('Escala')}</label>
            ${budgetHtml}
            <div class="vz-num-row" style="margin-top:12px">
              <span class="vz-muted vz-sm">${_t('Paquetes de trabajo:')}</span>
              <div class="vz-num"><button data-act="wp-dec" aria-label="${_t('Quitar un paquete de trabajo')}">–</button><div class="vz-num-v" id="vz-wp">${V.wp_count || 3}</div><button data-act="wp-inc" aria-label="${_t('Añadir un paquete de trabajo')}">+</button></div>
            </div>
            <div id="vz-consorcio-area" style="margin-top:16px"></div>
          </div>

          <div class="vz-btns">
            <span></span>
            <button class="vz-btn vz-btn-primary" data-act="review">${_t('Revisar ficha')} →</button>
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
      ? `<div class="vz-chips" style="margin:10px 0 4px">${refs.map(r => `<span class="vz-chip vz-sel" data-act="remove-ref" data-id="${r.id}" title="${_t('Quitar')}">${esc(r.title || r.project_identifier)} ✕</span>`).join('')}</div>`
      : '';
    const cards = suggestions.length
      ? `<div class="vz-simi-grid" style="margin-top:10px">${suggestions.map((p, i) => `
          <div class="vz-scard" data-act="open-proj" data-i="${i}">
            <span class="vz-score">◆ ${_t('{puntos} match', { puntos: p.score != null ? Number(p.score).toFixed(2) : '—' })}</span>
            <h4>${esc(p.title || p.project_identifier)}</h4>
            <div class="vz-muted vz-sm">${esc(p.programme || '')} ${p.funding_year ? '· ' + p.funding_year : ''} ${p.coordinator_country ? '· ' + esc(p.coordinator_country) : ''}</div>
            <div class="vz-add">📖 ${_t('Abrir y leer')} →</div>
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
      <label class="vz-lbl">${_t('Tu entidad (OID del directorio — necesario para publicar)')}</label>
      <input type="text" class="vz-field" id="vz-entity" placeholder="${_t('p. ej. {ejemplo}', { ejemplo: 'E10151149' })}" value="${esc(V.entity_oid || '')}">
      <label class="vz-lbl" style="margin-top:14px">${_t('Tipo de socio que buscas')}</label>
      ${types.length ? `<div class="vz-chips" style="margin-bottom:8px">${types.map(t => `<span class="vz-chip vz-sel" data-act="remove-type" data-v="${esc(t)}" title="${_t('Quitar')}">${esc(t)} ✕</span>`).join('')}</div>` : ''}
      <input type="text" class="vz-field" id="vz-type-input" list="vz-types-list" placeholder="${_t('Escribe o elige un tipo de socio…')}" autocomplete="off">
      <datalist id="vz-types-list">${typeList}</datalist>
      <label class="vz-lbl" style="margin-top:14px">${_t('Países — UE y cualquier país del mundo')}</label>
      ${countries.length ? `<div class="vz-chips" style="margin-bottom:8px">${countries.map(c => `<span class="vz-chip vz-sel" data-act="remove-cty" data-v="${c}" title="${_t('Quitar')}">${flag(c)} ${esc(cName(c))} ✕</span>`).join('')}</div>` : ''}
      <input type="text" class="vz-field" id="vz-cty-input" list="vz-world" placeholder="${_t('Escribe o elige un país…')}" autocomplete="off">
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
          <span>📋 ${_t('Lo que pide la convocatoria')}</span>
          <span class="vz-muted vz-sm" style="margin-left:auto;margin-right:8px;font-weight:500">${callPanelOpen ? '' : _t('objetivo, actividades y financiación')}</span>
          <span class="vz-chev">${callPanelOpen ? '▾' : '▸'}</span>
        </button>
        ${callPanelOpen ? `<div class="vz-cp-body">
          ${item(_t('Objetivo'), esc(call.main_objective || call.summary_es || ''))}
          ${arr(call.eligible_activities).length ? `<div class="vz-rc-item"><div class="vz-rc-k">${_t('Actividades esperadas')}</div><div class="vz-rc-v">${arr(call.eligible_activities).slice(0, 6).map(esc).join(' · ')}</div></div>` : ''}
          ${arr(call.expected_outcomes).length ? `<div class="vz-rc-item"><div class="vz-rc-k">${_t('Resultados esperados')}</div><div class="vz-rc-v">${arr(call.expected_outcomes).slice(0, 4).map(esc).join(' · ')}</div></div>` : ''}
          ${budget.length ? item(_t('Financiación'), budget.join(' – ') + (call.cofinancing_pct ? ' · ' + _t('UE {pct}%', { pct: call.cofinancing_pct }) : '')) : ''}
          ${arr(call.coordinator_types_allowed).length ? `<div class="vz-rc-item"><div class="vz-rc-k">${_t('Quién puede liderar')}</div><div class="vz-rc-tags">${arr(call.coordinator_types_allowed).slice(0, 6).map(t => `<span class="vz-rc-tag">${esc(t)}</span>`).join('')}</div></div>` : ''}
        </div>` : ''}
      </div>`;
  }

  async function doSuggest() {
    await saveComposer(); // persistir la idea antes de buscar
    const qBox = document.getElementById('vz-ref-q');
    const q = [(qBox && qBox.value.trim()) || V.problem, arr(V.themes).join(' '), arr(call?.themes_ai).join(' ')].filter(Boolean).join('. ').slice(0, 1500);
    if (q.trim().length < 6) { Toast.show(_t('Escribe tu idea o unas palabras clave para buscar'), 'error'); return; }
    const btn = document.querySelector('[data-act="suggest"]');
    if (btn) { btn.textContent = _t('Buscando…'); btn.disabled = true; }
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
      if (!suggestions.length) Toast.show(_t('No se encontraron proyectos parecidos'), 'ok');
    } catch (e) {
      Toast.show(e.code === 'AI_UNAVAILABLE' ? _t('El buscador de proyectos no está disponible ahora') : _t('No se pudieron cargar proyectos'), 'error');
    } finally {
      if (btn) { btn.textContent = '🔎 ' + _t('Buscar'); btn.disabled = false; }
      renderRefs();
    }
  }

  /* ── Drawer de lectura de un proyecto ─────────────────────────── */
  async function openProject(i) {
    const p = suggestions[i];
    if (!p) return;
    ensureDrawer();
    const ov = document.getElementById('vz-drawer-ov'), dr = document.getElementById('vz-drawer');
    document.getElementById('vz-dr-score').textContent = '◆ ' + _t('{puntos} match', { puntos: p.score != null ? Number(p.score).toFixed(2) : '—' });
    document.getElementById('vz-dr-title').textContent = p.title || p.project_identifier;
    document.getElementById('vz-dr-meta').textContent = [p.programme, p.funding_year, p.coordinator_country].filter(Boolean).join(' · ');
    const body = document.getElementById('vz-dr-body');
    body.innerHTML = `<div class="vz-muted vz-sm">${_t('Cargando resumen…')}</div>`;
    ov.classList.add('vz-on'); dr.classList.add('vz-on');
    dr.dataset.ref = i;
    try {
      const f = await API.get('/vision/project/' + encodeURIComponent(p.project_identifier) + '/full');
      const summary = f.project_summary_full || f.summary || f.project_summary || '';
      const secs = [];
      const addSec = (label, val) => { if (val && String(val).trim()) secs.push(`<div class="vz-dr-sec"><div class="vz-eyebrow">${label}</div><p>${esc(val)}</p></div>`); };
      addSec(_t('De qué iba'), summary);
      addSec(_t('Objetivos'), f.summary_objectives || f.report_objectives);
      addSec(_t('Actividades'), f.summary_activities || f.report_implementation);
      addSec(_t('Impacto / resultados'), f.summary_impact || f.report_results);
      body.innerHTML = secs.join('') || `<div class="vz-muted vz-sm">${_t('Este proyecto aún no tiene resumen ampliado.')}</div>`;
    } catch (e) {
      body.innerHTML = `<div class="vz-muted vz-sm">${_t('No se pudo cargar el resumen del proyecto.')}</div>`;
    }
  }

  function ensureDrawer() {
    if (document.getElementById('vz-drawer')) return;
    const ov = document.createElement('div'); ov.id = 'vz-drawer-ov'; ov.className = 'vz-drawer-ov';
    const dr = document.createElement('aside'); dr.id = 'vz-drawer'; dr.className = 'vz-drawer';
    dr.innerHTML = `
      <div class="vz-dr-top">
        <button class="vz-dr-close" data-act="close-drawer" aria-label="${_t('Cerrar')}">✕</button>
        <span class="vz-dr-score" id="vz-dr-score"></span>
        <h2 id="vz-dr-title"></h2>
        <div class="vz-dr-meta" id="vz-dr-meta"></div>
      </div>
      <div class="vz-dr-body" id="vz-dr-body"></div>
      <div class="vz-dr-actions">
        <button class="vz-btn vz-btn-primary" style="flex:1;justify-content:center" data-act="take-ref">+ ${_t('Tomar como referencia')}</button>
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
      Toast.show(_t('Referencia añadida'), 'ok');
      closeDrawer();
      renderRefs();
    } catch (e) { Toast.show(e.message || _t('No se pudo añadir'), 'error'); }
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
    if (!patch) SaveStatus.cancel('vision:' + V.id);   // ya se guarda ahora lo escrito
    // Un fallo lo avisa el indicador global («No se ha guardado · Reintentar»).
    try { V = await API.patch('/vision/' + V.id, p); } catch (e) { console.warn('[vision] no se guardó', e); }
  }

  /* ── VIEW: Ficha ──────────────────────────────────────────────── */
  async function review() {
    await saveComposer();
    if (!V.title) { const t = (V.vision_text || V.problem || _t('Mi visión')).split(/[.\n]/)[0].slice(0, 80); await API.patch('/vision/' + V.id, { title: t }); }
    V = await API.get('/vision/' + V.id).then(d => { refs = d.references || []; return d.vision; });
    renderBrief();
  }

  function renderBrief() {
    view = 'brief';
    const pub = V.visibility === 'public';
    const seek = (k, v) => `<div class="vz-seek"><div class="vz-seek-k">${k}</div><div class="vz-seek-v">${v || '—'}</div></div>`;
    $root().innerHTML = `
      <div class="vz-head" style="margin-bottom:16px"><div>
        <div class="vz-eyebrow">${_t('Ficha de visión')}</div>
        <h1 class="vz-h1">${_t('Tu visión, lista para compartir')}</h1>
      </div>
      <div style="display:flex;gap:10px">
        <button class="vz-btn vz-btn-ghost" data-act="edit">✎ ${_t('Seguir editando')}</button>
        <button class="vz-btn vz-btn-ghost" data-act="back-list">${_t('Mis visiones')}</button>
      </div></div>
      <div class="vz-brief-wrap">
        <article class="vz-brief">
          <div class="vz-brief-hero">
            <div class="vz-eyebrow" style="color:var(--vz-lavsoft)">${esc(V.programme || _t('Convocatoria'))} · ${pub ? _t('buscando socios') : _t('borrador privado')}</div>
            <h1>${esc(V.title || _t('Mi visión'))}</h1>
            <div class="vz-hero-meta">
              ${V.budget_option_eur != null ? `<span class="vz-hm vz-hm-y">${eur(V.budget_option_eur)}</span>` : ''}
              ${V.wp_count ? `<span class="vz-hm">${Number(V.wp_count) === 1 ? _t('1 paquete de trabajo') : _t('{n} paquetes de trabajo', { n: V.wp_count })}</span>` : ''}
              ${V.call_deadline ? `<span class="vz-hm">${_t('Deadline {fecha}', { fecha: fmtDate(V.call_deadline) })}</span>` : ''}
            </div>
          </div>
          <div class="vz-brief-body">
            <div class="vz-bsec vz-euval"><div class="vz-eyebrow">${_t('La visión')}</div>${paras(V.vision_text || V.problem)}
              ${arr(V.themes).length ? `<div class="vz-chips" style="margin-top:12px">${arr(V.themes).map(t => `<span class="vz-rc-tag">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>
            <div class="vz-bsec"><div class="vz-eyebrow">${_t('A quién busco')}</div>
              <div class="vz-seek-grid">
                ${seek(_t('Tipo de socio'), esc(arr(V.partner_types).join(' · ')))}
                ${seek(_t('Países'), arr(V.partner_countries).map(c => flag(c) + ' ' + esc(cName(c))).join(' · '))}
                ${seek(_t('Mi entidad'), esc(V.entity_oid || _t('sin vincular')))}
              </div>
            </div>
          </div>
        </article>
        <aside class="vz-brief-side">
          <div class="vz-toggle-card">
            <div class="vz-toggle-row">
              <div><h4>${_t('Visibilidad')}</h4><div class="vz-muted vz-sm" style="max-width:24ch">${_t('Nace privada. Publícala cuando quieras que la comunidad la vea.')}</div></div>
              <div class="vz-switch ${pub ? 'vz-on' : ''}" data-act="toggle-vis" role="switch" aria-checked="${pub}" aria-label="${_t('Visión pública')}"></div>
            </div>
            <div class="vz-vis-state ${pub ? 'vz-vis-pub' : 'vz-vis-priv'}" id="vz-vis-state">${pub ? '🌍 ' + _t('Pública · visible para la comunidad') : '🔒 ' + _t('Privada · solo tú la ves')}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:9px">
            <button class="vz-btn vz-btn-primary" style="justify-content:center" data-act="promote">🏗️ ${_t('Llevar a Diseñar')}${(typeof BetaAccess !== 'undefined' && !BetaAccess.has('proyectos')) ? '<span class="beta-tag"><svg class="beta-lock" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V6z"/></svg>Beta</span>' : ''}</button>
          </div>
          <div class="vz-note vz-sm" style="display:block">${_t('Al publicarla, otras entidades podrán marcar “Me interesa participar”. Los invitados podrán verla, pero no mostrar interés.')}</div>
        </aside>
      </div>`;
  }

  async function toggleVis() {
    const next = V.visibility === 'public' ? 'private' : 'public';
    try {
      V = await API.post('/vision/' + V.id + '/publish', { visibility: next });
      renderBrief();
      Toast.show(next === 'public' ? _t('Visión publicada') : _t('Visión ahora privada'), 'ok');
    } catch (e) {
      if (e.code === 'ENTITY_REQUIRED') Toast.show(_t('Vincula tu entidad (OID) antes de publicar: edita el paso Detalles'), 'error');
      else if (e.code === 'INCOMPLETE') Toast.show(_t('Completa la visión antes de publicar'), 'error');
      else Toast.show(e.message || _t('No se pudo publicar'), 'error');
    }
  }

  async function promote() {
    // Fase beta: pasar a proyecto pide el área «proyectos» → «Solicitar acceso».
    if (typeof BetaAccess !== 'undefined' && !BetaAccess.guard('proyectos')) return;
    try {
      const r = await API.post('/vision/' + V.id + '/promote', {});
      Toast.show(r.already ? _t('Ya estaba en Diseñar — abriendo…') : _t('Proyecto creado en Diseñar'), 'ok');
      if (r.project_id && typeof Intake !== 'undefined') { App.navigate('intake'); Intake.openProject(r.project_id); }
      else App.navigate('my-projects');
    } catch (e) { Toast.show(e.message || _t('No se pudo llevar a Diseñar'), 'error'); }
  }

  /* ── Redacción asistida por IA (Claude de suscripción) — rellena en línea ── */
  async function genAI() {
    await saveComposer(); // persistir la idea escrita antes de generar
    if (!V.problem && !refs.length && !arr(V.themes).length) {
      Toast.show(_t('Escribe tu idea, marca algún tema o añade un proyecto de referencia primero'), 'error');
      return;
    }
    const btn = document.querySelector('[data-act="ai-generate"]');
    if (btn) { btn.dataset.label = btn.textContent; btn.textContent = _t('Generando… (~15 s)'); btn.disabled = true; }
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
      Toast.show(_t('Visión generada — revísala y edítala a tu gusto'), 'ok');
    } catch (e) {
      const msg = e.code === 'AI_UNAVAILABLE' ? _t('La IA de suscripción no está disponible en este entorno')
        : e.code === 'AI_TIMEOUT' ? _t('La IA tardó demasiado. Inténtalo de nuevo.')
        : (e.message || _t('No se pudo generar la visión'));
      Toast.show(msg, 'error');
    } finally {
      if (btn) { btn.textContent = btn.dataset.label || '✨ ' + _t('Generar mi visión con IA'); btn.disabled = false; }
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
      'remove-ref': async () => { try { refs = await API.del('/vision/' + V.id + '/references/' + t.dataset.id); renderRefs(); } catch (e) { Toast.show(_t('No se pudo quitar'), 'error'); } },
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

  // Autosave del composer: con espera mientras se escribe (antes solo al salir
  // del campo, y al cerrar la pestaña con el cursor dentro se perdía) y al
  // salir de un campo de texto. Lo de la espera se toma al teclear, con su id.
  const COMPOSER_FIELDS = ['vz-idea', 'vz-vision', 'vz-title', 'vz-entity', 'vz-budget'];
  document.addEventListener('input', (e) => {
    if (!e.target || !COMPOSER_FIELDS.includes(e.target.id) || !V) return;
    const id = V.id, p = collectComposer();
    SaveStatus.debounce('vision:' + id, async () => {
      try { const r = await API.patch('/vision/' + id, p); if (V && V.id === id) V = r; }
      catch (err) { console.warn('[vision] no se guardó', err); }
    }, 1200);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target && COMPOSER_FIELDS.includes(e.target.id)) saveComposer();
  });

  // Añadir país desde el input/datalist (Enter o selección del datalist).
  function addCountryFromInput(inp) {
    const code = resolveCountry(inp.value);
    if (!code) { if (inp.value.trim()) Toast.show(_t('País no reconocido: {pais}', { pais: inp.value }), 'error'); return; }
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
    const css = /* i18n-no (estilos) */ `
    /* Tokens del manual de marca: azul, violeta, tinta, lavanda, lima, crema. «green» = estado activo (azul + lima suave) */
    #vision-root{--vz-navy:#4312d8;--vz-navy2:#7349f0;--vz-ink:#1b0759;--vz-muted:#55577a;--vz-line:#efe8fe;--vz-line2:#d6d3dc;--vz-yellow:#e9ff60;--vz-lav:#b392f6;--vz-lavsoft:#efe8fe;--vz-violet:#7349f0;--vz-green:#4312d8;--vz-greensoft:#f8ffd9;--vz-card:#fff;--vz-ground:#f2f2f2;color:var(--vz-ink);font-family:inherit}
    #vision-root h1,#vision-root h2,#vision-root h3,#vision-root h4{margin:0}
    #vision-root .vz-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--vz-muted)}
    #vision-root .vz-muted{color:var(--vz-muted)} #vision-root .vz-sm{font-size:12.5px}
    #vision-root .vz-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap}
    #vision-root .vz-h1{font-size:24px;font-weight:600;color:var(--vz-navy);margin-top:4px} #vision-root .vz-lead{color:var(--vz-muted);font-size:13.5px;margin-top:4px;max-width:56ch}
    #vision-root .vz-btn{border:none;border-radius:999px;padding:11px 18px;font-weight:700;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;font-family:inherit}
    #vision-root .vz-btn-sm{padding:8px 14px;font-size:12.5px} #vision-root .vz-btn-primary{background:var(--vz-yellow);color:var(--vz-navy)} #vision-root .vz-btn-primary:hover{background:#d4ec3c} #vision-root .vz-btn-navy{background:var(--vz-navy);color:#fff} #vision-root .vz-btn-navy:hover{background:var(--vz-violet)}
    #vision-root .vz-btn-ghost{background:transparent;color:var(--vz-navy);border:1px solid var(--vz-navy)}
    #vision-root .vz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
    #vision-root .vz-card{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:11px;cursor:pointer;box-shadow:0 8px 24px -14px rgba(67,18,216,.18)}
    #vision-root .vz-card:hover{border-color:var(--vz-lav)}
    #vision-root .vz-card-new{border-style:dashed;align-items:center;justify-content:center;text-align:center;color:var(--vz-muted);background:transparent;min-height:170px}
    #vision-root .vz-plus{width:42px;height:42px;border-radius:12px;background:var(--vz-lavsoft);color:var(--vz-navy);display:grid;place-items:center;font-size:24px}
    #vision-root .vz-card h3{font-size:16px;font-weight:600;color:var(--vz-navy);line-height:1.25}
    #vision-root .vz-row-between{display:flex;justify-content:space-between;align-items:center}
    #vision-root .vz-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px}
    #vision-root .vz-pill-draft{background:var(--vz-lavsoft);color:var(--vz-navy)} #vision-root .vz-pill-ok{background:var(--vz-greensoft);color:var(--vz-green)} #vision-root .vz-pill-priv{background:var(--vz-ground);color:var(--vz-navy)}
    #vision-root .vz-callchip{display:inline-flex;gap:6px;font-size:11.5px;font-weight:600;color:var(--vz-muted);background:var(--vz-lavsoft);border-radius:8px;padding:5px 9px;align-self:flex-start}
    #vision-root .vz-callchip b{color:var(--vz-navy)}
    #vision-root .vz-note{background:var(--vz-lavsoft);border:1px solid var(--vz-lav);border-radius:12px;padding:14px 16px;font-size:13px;color:var(--vz-navy);line-height:1.55;display:flex;gap:10px;align-items:flex-start}
    #vision-root .vz-call-list{display:flex;flex-direction:column;gap:11px}
    #vision-root .vz-callrow{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:18px;padding:15px 17px;display:flex;align-items:center;gap:16px;cursor:pointer;box-shadow:0 8px 24px -16px rgba(67,18,216,.18)}
    #vision-root .vz-callrow:hover{border-color:var(--vz-lav)}
    #vision-root .vz-badge{font-size:10px;font-weight:700;letter-spacing:.06em;background:var(--vz-navy);color:#fff;padding:4px 10px;border-radius:999px;white-space:nowrap}
    #vision-root .vz-callrow-main{flex:1;min-width:0} #vision-root .vz-callrow-main h3{font-size:14.5px;color:var(--vz-ink)}
    #vision-root .vz-callrow-dl{font-size:11.5px;color:var(--vz-muted);text-align:right;white-space:nowrap} #vision-root .vz-callrow-dl b{color:var(--vz-ink);display:block}
    #vision-root .vz-callrow-main .vz-sm{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #vision-root .vz-callrow-soon{cursor:default;background:var(--vz-lavsoft);border-style:dashed;box-shadow:none}
    #vision-root .vz-callrow-soon:hover{border-color:var(--vz-line)}
    #vision-root .vz-callrow-soon .vz-badge{background:var(--vz-violet)}
    #vision-root .vz-pk-h2{font-size:18px;font-weight:700;color:var(--vz-navy);margin:0 0 4px;letter-spacing:-.01em}
    #vision-root .vz-pk-row{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin:30px 0 12px}
    #vision-root .vz-call-filters{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
    #vision-root .vz-call-filters .vz-input{flex:1 1 240px;min-width:0;border:1px solid var(--vz-line2);border-radius:10px;padding:10px 13px;font:inherit;font-size:13.5px;background:var(--vz-card);color:var(--vz-ink)}
    #vision-root .vz-call-filters select.vz-input{flex:0 1 260px}
    #vision-root .vz-call-filters .vz-input:focus{outline:none;border-color:var(--vz-navy)}
    #vision-root .vz-go{font-size:20px;color:var(--vz-lav)}
    #vision-root .vz-banner{background:linear-gradient(100deg,var(--vz-navy),var(--vz-navy2));color:#fff;border-radius:20px;padding:16px 20px;display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
    #vision-root .vz-tag{font-size:10px;font-weight:700;letter-spacing:.1em;background:var(--vz-yellow);color:var(--vz-navy);padding:3px 9px;border-radius:999px}
    #vision-root .vz-banner h2{font-size:16px;flex:1;min-width:200px;font-weight:600} #vision-root .vz-dl{font-size:12px;color:var(--vz-lavsoft)} #vision-root .vz-dl b{color:#fff}
    #vision-root .vz-ai-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;background:linear-gradient(100deg,var(--vz-lavsoft),#fff);border:1px solid var(--vz-lav);border-radius:12px;padding:12px 16px;margin-bottom:18px;flex-wrap:wrap}
    #vision-root .vz-ai-banner > div{font-size:12.5px;color:var(--vz-navy);flex:1;min-width:240px;line-height:1.5}
    #vision-root .vz-comp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap;font-size:14px;color:var(--vz-ink)}
    #vision-root .vz-tag-navy{font-size:10px;font-weight:700;letter-spacing:.1em;background:var(--vz-navy);color:#fff;padding:3px 9px;border-radius:999px;margin-right:6px}
    #vision-root .vz-main{display:flex;flex-direction:column;gap:16px}
    #vision-root .vz-block{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:20px;padding:20px 22px;box-shadow:0 8px 24px -16px rgba(67,18,216,.18)}
    #vision-root .vz-block-h{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700;color:var(--vz-ink)}
    #vision-root .vz-num-badge{width:24px;height:24px;border-radius:8px;background:var(--vz-navy);color:var(--vz-yellow);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0}
    #vision-root .vz-block .vz-help{margin:6px 0 12px}
    #vision-root .vz-ref-search{display:flex;gap:8px;align-items:center}
    #vision-root .vz-ref-search .vz-field{flex:1}
    #vision-root .vz-ref-search .vz-btn{white-space:nowrap}
    #vision-root .vz-num-row{display:flex;align-items:center;gap:12px}
    #vision-root .vz-comp-single{max-width:860px;margin:0 auto}
    #vision-root .vz-cp-bar{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:12px;margin-bottom:16px;box-shadow:0 8px 24px -18px rgba(67,18,216,.18);overflow:hidden}
    #vision-root .vz-cp-toggle{width:100%;display:flex;align-items:center;gap:8px;background:transparent;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;color:var(--vz-ink);padding:12px 16px}
    #vision-root .vz-cp-bar.vz-open .vz-cp-toggle{border-bottom:1px solid var(--vz-line)}
    #vision-root .vz-chev{color:var(--vz-lav);font-size:12px}
    #vision-root .vz-cp-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 22px;padding:6px 16px 12px}
    #vision-root .vz-stepper{display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap}
    /* modal IA (fuera de #vision-root) */
    .vz-modal-ov{position:fixed;inset:0;background:rgba(27,7,89,.5);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit}
    .vz-modal{background:#fff;border-radius:20px;width:min(560px,96vw);max-height:88vh;overflow:auto;box-shadow:0 30px 80px -20px rgba(27,7,89,.6)}
    .vz-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;font-weight:700;color:#4312d8;font-size:15px;border-bottom:1px solid #efe8fe}
    .vz-modal-x{border:none;background:#f2f2f2;width:28px;height:28px;border-radius:999px;cursor:pointer;color:#55577a;font-size:14px}
    .vz-modal-body{padding:10px 20px 16px}
    .vz-modal-body .vz-help{font-size:13px;color:#55577a}
    .vz-modal-body .vz-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#55577a;margin-bottom:6px}
    .vz-modal-body .vz-field{width:100%;border:1.5px solid #d6d3dc;border-radius:12px;padding:11px 13px;font-family:inherit;font-size:14px;color:#1b0759;background:#f2f2f2;resize:vertical;box-sizing:border-box;line-height:1.55}
    .vz-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #efe8fe}
    .vz-modal .vz-btn{border:none;border-radius:999px;padding:10px 16px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
    .vz-modal .vz-btn-primary{background:#e9ff60;color:#4312d8} .vz-modal .vz-btn-ghost{background:transparent;color:#4312d8;border:1px solid #4312d8}
    #vision-root .vz-step{flex:1;min-width:110px;border-top:3px solid var(--vz-line2);padding-top:9px;cursor:pointer}
    #vision-root .vz-step-n{font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--vz-muted)} #vision-root .vz-step-t{font-size:12.5px;font-weight:600;color:var(--vz-muted)}
    #vision-root .vz-step.vz-done{border-color:var(--vz-green)} #vision-root .vz-step.vz-done .vz-step-n{color:var(--vz-green)}
    #vision-root .vz-step.vz-active{border-color:var(--vz-yellow)} #vision-root .vz-step.vz-active .vz-step-n,#vision-root .vz-step.vz-active .vz-step-t{color:var(--vz-ink)}
    #vision-root .vz-cols{display:grid;grid-template-columns:1.55fr 1fr;gap:20px;align-items:start}
    @media(max-width:900px){#vision-root .vz-cols{grid-template-columns:1fr}}
    #vision-root .vz-q{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:20px;padding:24px;box-shadow:0 8px 24px -14px rgba(67,18,216,.18)}
    #vision-root .vz-qn{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--vz-violet);text-transform:uppercase}
    #vision-root .vz-q h2{font-size:21px;font-weight:600;color:var(--vz-navy);margin:8px 0 6px;line-height:1.25} #vision-root .vz-help{font-size:13px;color:var(--vz-muted);margin-bottom:16px}
    #vision-root .vz-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--vz-muted);margin-bottom:6px}
    #vision-root .vz-field{width:100%;border:1.5px solid var(--vz-line2);border-radius:12px;padding:13px 14px;font-family:inherit;font-size:14px;color:var(--vz-ink);background:var(--vz-ground);resize:vertical}
    #vision-root .vz-field:focus{outline:none;border-color:var(--vz-lav)}
    #vision-root .vz-chip-hint{font-size:11.5px;color:var(--vz-muted);margin-top:14px} #vision-root .vz-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    #vision-root .vz-chip{font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;border:1.5px solid var(--vz-line2);color:var(--vz-muted);cursor:pointer;background:var(--vz-card)}
    #vision-root .vz-chip.vz-sel{background:var(--vz-navy);color:#fff;border-color:var(--vz-navy)} #vision-root .vz-chip-suggest{border-style:dashed}
    #vision-root .vz-radio-row{display:flex;gap:10px;flex-wrap:wrap} #vision-root .vz-radio{flex:1;min-width:150px;border:1.5px solid var(--vz-line2);border-radius:12px;padding:13px;cursor:pointer;background:var(--vz-card)}
    #vision-root .vz-radio.vz-sel{border-color:var(--vz-navy);box-shadow:inset 0 0 0 1px var(--vz-navy)} #vision-root .vz-amt{font-size:20px;font-weight:300;color:var(--vz-navy)} #vision-root .vz-rlbl{font-size:11.5px;color:var(--vz-muted)}
    #vision-root .vz-num{display:inline-flex;align-items:center;border:1.5px solid var(--vz-line2);border-radius:10px;overflow:hidden} #vision-root .vz-num button{width:38px;height:40px;border:none;background:var(--vz-ground);font-size:18px;color:var(--vz-navy);cursor:pointer} #vision-root .vz-num-v{width:48px;text-align:center;font-weight:300;font-size:20px;color:var(--vz-navy)}
    #vision-root .vz-review{background:var(--vz-ground);border-radius:12px;padding:16px;font-size:13px;color:var(--vz-muted);line-height:1.9}
    #vision-root .vz-btns{display:flex;justify-content:space-between;gap:12px;margin-top:18px}
    #vision-root .vz-rail{display:flex;flex-direction:column;gap:14px;position:sticky;top:16px}
    #vision-root .vz-rail-card{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:16px 17px;box-shadow:0 8px 24px -16px rgba(67,18,216,.18)}
    #vision-root .vz-rail-soft{background:var(--vz-lavsoft);border-color:var(--vz-lav)}
    #vision-root .vz-rc-head{display:flex;align-items:center;gap:8px;margin-bottom:10px} #vision-root .vz-dot{width:7px;height:7px;border-radius:50%;background:var(--vz-green)} #vision-root .vz-rc-head h4{font-size:12.5px;color:var(--vz-ink)} #vision-root .vz-locked{margin-left:auto;font-size:10px;font-weight:700;color:var(--vz-muted)}
    #vision-root .vz-rc-item{padding:8px 0;border-top:1px solid var(--vz-line);font-size:12.5px} #vision-root .vz-rc-item:first-of-type{border-top:none}
    #vision-root .vz-rc-k{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vz-muted);margin-bottom:2px} #vision-root .vz-rc-v{color:var(--vz-ink);line-height:1.45}
    #vision-root .vz-rc-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:3px} #vision-root .vz-rc-tag{font-size:11px;background:var(--vz-lavsoft);color:var(--vz-navy);padding:2px 8px;border-radius:6px;font-weight:600}
    #vision-root .vz-simi{margin-top:20px} #vision-root .vz-simi-head{display:flex;align-items:center;gap:8px;margin-bottom:12px} #vision-root .vz-simi-head h3{font-size:15px;color:var(--vz-ink)}
    #vision-root .vz-simi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:12px}
    #vision-root .vz-scard{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:12px;padding:14px;cursor:pointer;box-shadow:0 8px 24px -16px rgba(67,18,216,.18)}
    #vision-root .vz-scard:hover{border-color:var(--vz-lav)} #vision-root .vz-score{display:inline-flex;gap:5px;font-size:11px;font-weight:700;color:var(--vz-green);background:var(--vz-greensoft);padding:2px 8px;border-radius:20px}
    #vision-root .vz-scard h4{font-size:13px;color:var(--vz-ink);margin:9px 0 5px;line-height:1.3} #vision-root .vz-add{margin-top:10px;font-size:11.5px;font-weight:700;color:var(--vz-navy)}
    #vision-root .vz-brief-wrap{display:grid;grid-template-columns:1fr 260px;gap:22px;align-items:start} @media(max-width:820px){#vision-root .vz-brief-wrap{grid-template-columns:1fr}}
    #vision-root .vz-brief{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:24px;overflow:hidden;box-shadow:0 8px 24px -14px rgba(67,18,216,.18)}
    #vision-root .vz-brief-hero{background:linear-gradient(120deg,var(--vz-navy),var(--vz-navy2));color:#fff;padding:26px 28px} #vision-root .vz-brief-hero h1{font-size:25px;margin:8px 0 12px;color:#fff;line-height:1.2}
    #vision-root .vz-hero-meta{display:flex;gap:8px;flex-wrap:wrap} #vision-root .vz-hm{font-size:11.5px;font-weight:600;background:rgba(255,255,255,.12);padding:5px 12px;border-radius:999px} #vision-root .vz-hm-y{background:var(--vz-yellow);color:var(--vz-navy)}
    #vision-root .vz-brief-body{padding:24px 28px;display:flex;flex-direction:column;gap:22px} #vision-root .vz-bsec p{font-size:14px;color:var(--vz-ink);line-height:1.6;margin-top:7px} #vision-root .vz-euval p{border-left:3px solid var(--vz-yellow);padding-left:14px}
    #vision-root .vz-seek-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:7px} #vision-root .vz-seek{background:var(--vz-ground);border-radius:16px;padding:13px 15px}
    #vision-root .vz-seek-k{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vz-muted)} #vision-root .vz-seek-v{font-size:13.5px;color:var(--vz-ink);font-weight:600;margin-top:4px;line-height:1.4}
    #vision-root .vz-ref-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:7px} #vision-root .vz-ref{background:var(--vz-ground);border-radius:10px;padding:11px 13px;font-size:12px} #vision-root .vz-ref b{color:var(--vz-ink);display:block;margin-bottom:3px;line-height:1.3} #vision-root .vz-ref span{color:var(--vz-muted)}
    #vision-root .vz-brief-side{display:flex;flex-direction:column;gap:14px;position:sticky;top:16px}
    #vision-root .vz-toggle-card{background:var(--vz-card);border:1px solid var(--vz-line);border-radius:16px;padding:17px;box-shadow:0 8px 24px -16px rgba(67,18,216,.18)}
    #vision-root .vz-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:10px} #vision-root .vz-toggle-row h4{font-size:13.5px;color:var(--vz-ink)}
    #vision-root .vz-switch{width:44px;height:25px;border-radius:20px;background:var(--vz-line2);position:relative;cursor:pointer;flex-shrink:0;transition:background .2s} #vision-root .vz-switch::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.25)}
    #vision-root .vz-switch.vz-on{background:var(--vz-navy)} #vision-root .vz-switch.vz-on::after{left:22px}
    #vision-root .vz-vis-state{font-size:12px;font-weight:700;margin-top:12px;padding:9px 12px;border-radius:9px;text-align:center} #vision-root .vz-vis-priv{background:var(--vz-ground);color:var(--vz-navy)} #vision-root .vz-vis-pub{background:var(--vz-greensoft);color:var(--vz-green)}
    /* drawer (fuera de #vision-root) */
    .vz-drawer-ov{position:fixed;inset:0;background:rgba(27,7,89,.42);z-index:60;opacity:0;pointer-events:none;transition:opacity .2s} .vz-drawer-ov.vz-on{opacity:1;pointer-events:auto}
    .vz-drawer{position:fixed;top:0;right:0;height:100%;width:min(440px,92vw);background:#fff;z-index:61;box-shadow:-16px 0 40px -18px rgba(27,7,89,.5);transform:translateX(100%);transition:transform .26s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;font-family:inherit}
    .vz-drawer.vz-on{transform:translateX(0)}
    .vz-dr-top{background:linear-gradient(120deg,#4312d8,#7349f0);color:#fff;padding:20px 22px 18px;position:relative} .vz-dr-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:999px;border:none;background:rgba(255,255,255,.14);color:#fff;font-size:16px;cursor:pointer}
    .vz-dr-score{display:inline-flex;gap:5px;font-size:11px;font-weight:700;color:#4312d8;background:#e9ff60;padding:3px 9px;border-radius:20px} .vz-dr-top h2{font-size:18px;margin:12px 0 6px;color:#fff;line-height:1.28} .vz-dr-meta{font-size:12px;color:#efe8fe}
    .vz-dr-body{padding:20px 22px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:18px} .vz-dr-body .vz-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#55577a;display:block;margin-bottom:6px} .vz-dr-sec p{font-size:13.5px;color:#1b0759;line-height:1.62;margin:0}
    .vz-dr-actions{padding:14px 22px;border-top:1px solid #efe8fe;display:flex;gap:9px} .vz-drawer .vz-btn{border:none;border-radius:999px;padding:10px 14px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit} .vz-drawer .vz-btn-primary{background:#e9ff60;color:#4312d8}
    `;
    const st = document.createElement('style'); st.id = 'vision-styles'; st.textContent = css; document.head.appendChild(st);
  }

  return { init, startForCall };
})();
