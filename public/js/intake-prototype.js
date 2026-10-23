/* Script de intake-prototype.html: en fichero aparte (no en línea) por la CSP. */
/* ─── PARTNER DATABASE (mock) ───────────────────────────────────── */
const PARTNER_DB = [
  {id:'db1',  name:'PERMA',    full:'Perma Foundation',                city:'Santander', country:'España',       types:['ONG','Juventud']},
  {id:'db2',  name:'3PO',      full:'3PO Consulting',                  city:'París',     country:'Francia',      types:['Consultoría','VET']},
  {id:'db3',  name:'ORIEL',    full:'Oriel Institute',                 city:'Roma',      country:'Italia',       types:['Formación','IO']},
  {id:'db4',  name:'EDUCA',    full:'Educa Consortium',                city:'Berlín',    country:'Alemania',     types:['Universidad','I+D']},
  {id:'db5',  name:'NEXUS',    full:'Nexus Youth NGO',                 city:'Varsovia',  country:'Polonia',      types:['ONG','Juventud']},
  {id:'db6',  name:'INNOVA',   full:'Innova Training Centre',          city:'Lisboa',    country:'Portugal',     types:['VET','Formación']},
  {id:'db7',  name:'EQUAL',    full:'Equal Opportunities Foundation',  city:'Atenas',    country:'Grecia',       types:['ONG','Inclusión']},
  {id:'db8',  name:'BRIDGE',   full:'Bridge Intercultural',            city:'Praga',     country:'Chequia',      types:['ONG','Movilidad']},
  {id:'db9',  name:'CRAFT',    full:'Craft Skills Institute',          city:'Bucarest',  country:'Rumanía',      types:['VET','Formación']},
  {id:'db10', name:'FUTURA',   full:'Futura Social Lab',               city:'Bruselas',  country:'Bélgica',      types:['Consultoría','Política']},
  {id:'db11', name:'NORTICA',  full:'Nórtica Education',               city:'Estocolmo', country:'Suecia',       types:['Universidad','I+D']},
  {id:'db12', name:'IMPULSO',  full:'Impulso Formación y Empleo',      city:'Sevilla',   country:'España',       types:['VET','Empleo']},
  {id:'db13', name:'OPEN',     full:'Open Doors Association',          city:'Ámsterdam', country:'Países Bajos', types:['ONG','Inclusión']},
  {id:'db14', name:'VITAS',    full:'Vitas Learning Group',            city:'Dublín',    country:'Irlanda',      types:['Formación','Movilidad']},
  {id:'db15', name:'KREA',     full:'Krea Innovation Hub',             city:'Helsinki',  country:'Finlandia',    types:['I+D','Tecnología']},
  {id:'db16', name:'TERANGA',  full:'Teranga Intercultural',           city:'Burdeos',   country:'Francia',      types:['ONG','Interculturalidad']},
  {id:'db17', name:'MENTOR',   full:'Mentor Youth Services',           city:'Dublín',    country:'Irlanda',      types:['Juventud','ONG']},
  {id:'db18', name:'EMPOWER',  full:'Empower VET Alliance',            city:'Viena',     country:'Austria',      types:['VET','Empleabilidad']},
  {id:'db19', name:'SINERGIA', full:'Sinergia Formació',               city:'Barcelona', country:'España',       types:['Formación','Consultoría']},
  {id:'db20', name:'AGORA',    full:'Agora Cultural Foundation',       city:'Salónica',  country:'Grecia',       types:['Cultura','Juventud']},
];
const DB_TYPES = [...new Set(PARTNER_DB.flatMap(o => o.types))].sort();

/* ─── WORD COUNTER CONFIG ───────────────────────────────────────── */
const WC = [
  {ta:'ctx-prob', bar:'wb-prob', badge:'wc-prob', min:200, max:500},
  {ta:'ctx-tgt',  bar:'wb-tgt',  badge:'wc-tgt',  min:150, max:400},
  {ta:'ctx-app',  bar:'wb-app',  badge:'wc-app',  min:200, max:500},
];

/* ─── STATE ─────────────────────────────────────────────────────── */
let step = 0;
let progKey = 'ka3';
let partners = [{id:1, name:'', city:'', country:'', role:'applicant', order_index:1}];
let pCounter = 1;
let dbFilter = null;
let dbSel = new Set();

const PROGS = {
  ka3: {
    type:'KA3-Youth-Together',
    deadline:'2026-02-26', dlLabel:'26 feb 2026 · 17:00 BXL',
    startMin:'2026-09-01', startMax:'2027-03-01',
    sfLabel:'01/09/2026', stLabel:'01/03/2027',
    grant:500000, grantLabel:'500.000 €',
    cofin:80, cofinLabel:'80 %',
    indirect:7, indirectLabel:'7 %',
  }
};

/* ─── INIT ──────────────────────────────────────────────────────── */
(function init() {
  const sel = document.getElementById('f-dur');
  for (let m = 12; m <= 24; m++) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m + ' meses';
    if (m === 24) o.selected = true;
    sel.appendChild(o);
  }
  selectProg('ka3');
  renderPartners();
  WC.forEach(c => document.getElementById(c.ta).addEventListener('input', () => updateWC(c)));
  document.getElementById('db-filters').innerHTML = DB_TYPES.map(t =>
    `<span class="text-xs font-semibold px-3 py-1 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface-variant cursor-pointer hover:border-outline transition-all" data-t="${esc(t)}" data-action="Prototipo.toggleFilter" data-args="${Acciones.args(String(t ?? ''))}">${esc(t)}</span>`
  ).join('');
  loadSample();
})();

/* ─── SAMPLE DATA: ARISE ────────────────────────────────────────── */
function loadSample() {
  document.getElementById('f-name').value = 'ARISE';
  document.getElementById('f-desc').value = 'ARISE (Addressing Resilience, Inclusion and Social Empowerment for Youth) es una red transnacional de 5 organizaciones juveniles de España, Francia, Italia, Alemania y Polonia que trabajan conjuntamente para fortalecer la resiliencia y la salud mental de jóvenes de 16-29 años con menos oportunidades, mediante metodologías de aprendizaje no formal, apoyo entre pares e intercambios transnacionales.';
  document.getElementById('f-start').value = '2026-09-01';
  for (let o of document.getElementById('f-dur').options) { if (o.value == 24) { o.selected = true; break; } }

  partners = [
    {id:1, name:'PERMA',  city:'Santander', country:'España',   role:'applicant', order_index:1},
    {id:2, name:'PULSE',  city:'Lyon',       country:'Francia',  role:'partner',   order_index:2},
    {id:3, name:'NEXO',   city:'Milán',      country:'Italia',   role:'partner',   order_index:3},
    {id:4, name:'WAVE',   city:'Berlín',     country:'Alemania', role:'partner',   order_index:4},
    {id:5, name:'ROOTS',  city:'Cracovia',   country:'Polonia',  role:'partner',   order_index:5},
  ];
  pCounter = 5;
  renderPartners();

  document.getElementById('ctx-prob').value = `La crisis de salud mental juvenil constituye uno de los desafíos más urgentes de Europa en la actualidad. Según la Organización Mundial de la Salud, el 20% de los jóvenes europeos de entre 15 y 29 años padece algún trastorno mental, siendo la depresión y la ansiedad las condiciones más prevalentes. La pandemia de COVID-19 agravó dramáticamente esta situación: los datos de Eurostat (2024) muestran que el 41% de los jóvenes europeos reporta síntomas persistentes de ansiedad, frente al 23% registrado en 2018. Este deterioro es especialmente pronunciado entre los jóvenes con menos oportunidades: aquellos provenientes de entornos socioeconómicamente desfavorecidos, zonas rurales y remotas, y jóvenes con antecedentes migrantes.\n\nA pesar de la magnitud del problema, los sistemas de apoyo psicosocial en los cinco países del consorcio presentan déficits estructurales similares: escasa accesibilidad de los servicios de salud mental para menores de 25 años, ausencia de programas preventivos basados en aprendizaje no formal dentro de las organizaciones juveniles, y una marcada estigmatización social que impide que los jóvenes busquen ayuda. En España, solo el 35% de los jóvenes que necesitan apoyo psicológico accede efectivamente a él (Ministerio de Sanidad, 2023). Cifras análogas se registran en los países socios.\n\nLa Estrategia de Juventud de la UE 2019-2027 identifica explícitamente el bienestar mental y la resiliencia como áreas prioritarias de acción dentro de los pilares "Conectar" y "Empoderar". Sin embargo, la dimensión transnacional de la salud mental juvenil sigue siendo escasamente abordada: las organizaciones de base carecen de metodologías compartidas, marcos comunes de evaluación y redes de apoyo mutuo que les permitan escalar sus intervenciones más allá de sus fronteras nacionales.\n\nSi no se actúa de forma coordinada a nivel europeo, la brecha entre la necesidad de apoyo psicosocial y la oferta disponible continuará ampliándose, con consecuencias directas sobre la participación cívica, el empleo juvenil y la cohesión social. El proyecto ARISE responde directamente a esta necesidad estructural identificada de forma convergente por todas las organizaciones del consorcio en sus respectivos contextos nacionales.`;

  document.getElementById('ctx-tgt').value = `Los beneficiarios directos del proyecto ARISE son jóvenes de entre 16 y 29 años con menos oportunidades en los cinco países del consorcio, con especial énfasis en: (1) jóvenes de zonas rurales y remotas con acceso limitado a servicios de salud mental; (2) jóvenes de entornos socioeconómicamente desfavorecidos; (3) jóvenes con antecedentes migrantes o de minorías étnicas; y (4) jóvenes que han experimentado aislamiento social prolongado como consecuencia de la pandemia.\n\nA lo largo del proyecto, ARISE movilizará directamente a un mínimo de 250 jóvenes a través de intercambios transnacionales, talleres de aprendizaje entre pares y actividades formativas para líderes juveniles. Adicionalmente, se formarán 80 trabajadores juveniles y educadores no formales como facilitadores de programas de resiliencia, multiplicando exponencialmente el alcance de las intervenciones más allá del proyecto.\n\nLos beneficiarios indirectos son las comunidades locales de los cinco países participantes y el ecosistema de organizaciones juveniles europeas. La diseminación activa de los resultados del proyecto —incluyendo la publicación en abierto de metodologías, guías prácticas y recursos formativos— garantizará que el impacto trascienda a los participantes directos, llegando a redes nacionales de organizaciones de base que no operan aún en contextos transnacionales.`;

  document.getElementById('ctx-app').value = `ARISE adopta un enfoque metodológico basado en el aprendizaje no formal y el apoyo entre pares (peer support), reconocido internacionalmente como una de las estrategias más efectivas para la promoción de la salud mental en poblaciones juveniles. El proyecto se articula en torno a tres pilares complementarios: (1) Formación transnacional de facilitadores juveniles; (2) Intercambios de jóvenes centrados en el desarrollo de competencias de resiliencia; y (3) Co-creación de una Caja de Herramientas Europea de Resiliencia Juvenil (European Youth Resilience Toolkit).\n\nEl valor añadido transnacional de ARISE reside en la naturaleza sistémica del reto que aborda: la crisis de salud mental juvenil no reconoce fronteras nacionales, y sus soluciones más efectivas emergen del intercambio de experiencias entre organizaciones que operan en contextos socioculturales distintos. La diversidad geográfica del consorcio —España, Francia, Italia, Alemania y Polonia, representando tradiciones muy diferentes en materia de política juvenil— garantiza que la Caja de Herramientas desarrollada sea robusta, contextualizable y genuinamente pan-europea.\n\nARISE necesita socios europeos porque las metodologías de resiliencia más innovadoras están distribuidas de forma desigual entre los países: el enfoque de peer support de las organizaciones polacas, los modelos de educación emocional desarrollados en Francia, y los programas de intervención temprana del contexto alemán son complementarios y mutuamente enriquecedores. Solo a través de la cooperación transnacional estructurada es posible sintetizar este conocimiento disperso en un marco metodológico coherente, validado en múltiples contextos y accesible para organizaciones de base de toda Europa.\n\nEl proyecto utiliza Youthpass como herramienta de reconocimiento de los aprendizajes adquiridos por los participantes, en línea con el Programa de Juventud Europeo 2021-2027 y la Agenda Europea de Trabajo Juvenil. Todos los resultados del proyecto se publicarán como recursos educativos abiertos (OER), conforme a los requisitos de la convocatoria ERASMUS-YOUTH-2026-YOUTH-TOG.`;

  WC.forEach(c => updateWC(c));
}

/* ─── NAVIGATION ────────────────────────────────────────────────── */
function setStep(s) {
  document.querySelectorAll('.panel').forEach((p, i) => p.classList.toggle('active', i === s));
  for (let i = 0; i <= 3; i++) {
    const dot = document.getElementById('sd' + i);
    const lbl = document.getElementById('sl' + i);
    const con = i < 3 ? document.getElementById('sc' + i) : null;
    // Reset
    dot.className = 'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-headline border-2 transition-all';
    if (i === s) {
      dot.className += ' border-primary bg-primary text-white';
      dot.textContent = i + 1;
      lbl.className = 'font-headline text-xs font-bold uppercase tracking-widest text-primary transition-colors';
    } else if (i < s) {
      dot.className += ' border-primary bg-primary/10 text-primary';
      dot.textContent = '✓';
      lbl.className = 'font-headline text-xs font-bold uppercase tracking-widest text-on-surface transition-colors';
    } else {
      dot.className += ' border-outline-variant bg-surface text-on-surface-variant';
      dot.textContent = i + 1;
      lbl.className = 'font-headline text-xs font-bold uppercase tracking-widest text-on-surface-variant transition-colors';
    }
    if (con) con.className = i < s
      ? 'flex-1 h-px bg-primary mx-3 transition-colors'
      : 'flex-1 h-px bg-outline-variant mx-3 transition-colors';
  }
  step = s;
  window.scrollTo({top: 0, behavior: 'smooth'});
}
function tryGo(s) { if (s <= step) setStep(s); }
function next() { if (!validate(step)) return; if (step === 2) buildSummary(); setStep(step + 1); }
function prev() { setStep(step - 1); }

function validate(s) {
  if (s === 0) { if (!progKey) { toast('Selecciona un programa', 'err'); return false; } return true; }
  if (s === 1) {
    if (!document.getElementById('f-name').value.trim()) {
      toast('El acrónimo del proyecto es obligatorio', 'err');
      document.getElementById('f-name').focus(); return false;
    }
    if (partners.length < 5) { toast('KA3 Youth Together requiere mínimo 5 organizaciones de 5 países distintos', 'err'); return false; }
    const countries = new Set(partners.map(p => p.country.trim().toLowerCase()).filter(Boolean));
    if (countries.size < 5) { toast('Las 5 organizaciones deben ser de al menos 5 países distintos', 'err'); return false; }
    for (let i = 0; i < partners.length; i++) {
      if (!partners[i].name)    { toast('Introduce el nombre de la organización ' + (i + 1), 'err'); return false; }
      if (!partners[i].country) { toast('Introduce el país de la organización '   + (i + 1), 'err'); return false; }
    }
    return true;
  }
  return true;
}

/* ─── PROGRAM ───────────────────────────────────────────────────── */
function selectProg(k) {
  progKey = k;
  const p = PROGS[k];
  document.getElementById('ro-dl').textContent = p.dlLabel;
  document.getElementById('ro-gr').textContent = p.grantLabel;
  document.getElementById('ro-co').textContent = p.cofinLabel;
  document.getElementById('ro-in').textContent = p.indirectLabel;
  document.getElementById('ro-sf').textContent = p.sfLabel;
  document.getElementById('ro-st').textContent = p.stLabel;
  document.getElementById('f-type').value      = p.type;
  document.getElementById('f-start').min       = p.startMin;
  document.getElementById('f-start').max       = p.startMax;
  if (!document.getElementById('f-start').value) document.getElementById('f-start').value = p.startMin;
}

/* ─── PARTNERS ──────────────────────────────────────────────────── */
function renderPartners() {
  const list = document.getElementById('pt-list');
  list.innerHTML = '';
  partners.forEach((p, i) => {
    const isApp = i === 0;
    const row = document.createElement('div');
    row.className = 'grid gap-2 items-center py-2 border-b border-outline-variant/50';
    row.style.gridTemplateColumns = '28px 1fr 100px 110px 80px 32px';
    row.innerHTML = `
      <span class="text-xs font-bold text-on-surface-variant text-center">${i + 1}</span>
      <input type="text" placeholder="Acrónimo" value="${esc(p.name)}" data-on-input="proto.socio" data-args="${Acciones.args(i, 'name')}"
        class="px-2.5 py-2 rounded-lg bg-white border border-outline-variant text-on-surface text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
      <input type="text" placeholder="Ciudad" value="${esc(p.city)}" data-on-input="proto.socio" data-args="${Acciones.args(i, 'city')}"
        class="px-2.5 py-2 rounded-lg bg-white border border-outline-variant text-on-surface text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
      <input type="text" placeholder="País" value="${esc(p.country)}" data-on-input="proto.socio" data-args="${Acciones.args(i, 'country')}"
        class="px-2.5 py-2 rounded-lg bg-white border border-outline-variant text-on-surface text-sm focus:border-primary focus:ring-2 focus:ring-secondary-fixed outline-none transition-all">
      <span class="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded text-center ${isApp
        ? 'bg-secondary-fixed/20 text-primary-container border border-secondary-fixed-dim/40'
        : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'
      }">${isApp ? 'Coord.' : 'Socio'}</span>
      <button class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors ${isApp ? 'opacity-20 pointer-events-none' : ''}" data-action="Prototipo.removePartner" data-args="${Acciones.args(i)}">
        <span class="material-symbols-outlined text-base">close</span>
      </button>
    `;
    list.appendChild(row);
  });
}
function addPartner() {
  pCounter++;
  partners.push({id: pCounter, name:'', city:'', country:'', role:'partner', order_index: partners.length + 1});
  renderPartners();
}
function removePartner(i) {
  if (i === 0) return;
  partners.splice(i, 1);
  partners.forEach((p, j) => { p.order_index = j + 1; p.role = j === 0 ? 'applicant' : 'partner'; });
  renderPartners();
}

/* ─── DB MODAL ──────────────────────────────────────────────────── */
function toggleFilter(t) {
  dbFilter = dbFilter === t ? null : t;
  document.querySelectorAll('#db-filters span').forEach(el => {
    const isOn = el.dataset.t === dbFilter;
    el.className = isOn
      ? 'text-xs font-semibold px-3 py-1 rounded-lg border border-primary bg-primary/10 text-primary cursor-pointer transition-all'
      : 'text-xs font-semibold px-3 py-1 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface-variant cursor-pointer hover:border-outline transition-all';
  });
  renderDB();
}
function openDB() {
  dbSel = new Set();
  document.getElementById('db-q').value = '';
  dbFilter = null;
  document.querySelectorAll('#db-filters span').forEach(el => {
    el.className = 'text-xs font-semibold px-3 py-1 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface-variant cursor-pointer hover:border-outline transition-all';
  });
  renderDB();
  document.getElementById('db-modal').classList.remove('hidden');
  document.getElementById('db-modal').classList.add('flex');
}
function closeDB() {
  document.getElementById('db-modal').classList.add('hidden');
  document.getElementById('db-modal').classList.remove('flex');
}
function bgClose(e) { if (e.target === document.getElementById('db-modal')) closeDB(); }

function renderDB() {
  const q = document.getElementById('db-q').value.toLowerCase().trim();
  const inUse = new Set(partners.map(p => p.name.toUpperCase()));
  const list = PARTNER_DB.filter(o => {
    if (dbFilter && !o.types.includes(dbFilter)) return false;
    if (!q) return true;
    return o.name.toLowerCase().includes(q) || o.full.toLowerCase().includes(q)
        || o.city.toLowerCase().includes(q)  || o.country.toLowerCase().includes(q)
        || o.types.some(t => t.toLowerCase().includes(q));
  });
  const res = document.getElementById('db-results');
  if (!list.length) {
    res.innerHTML = '<div class="text-center py-6 text-on-surface-variant text-sm">Sin resultados</div>';
  } else {
    res.innerHTML = list.map(o => {
      const used = inUse.has(o.name.toUpperCase());
      const sel  = dbSel.has(o.id);
      return `<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 ${sel ? 'border-primary bg-primary/5' : 'border-transparent'} ${used ? 'opacity-30 pointer-events-none' : 'cursor-pointer hover:bg-surface-container-low'} transition-all mb-1" data-action="Prototipo.toggleOrg" data-args="${Acciones.args(String(o.id))}">
        <div class="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-base ${sel ? 'bg-white border border-primary/20' : 'bg-surface-container-low border border-outline-variant'}">
          ${orgIcon(o.types)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-headline text-sm font-bold text-primary">${esc(o.name)}</div>
          <div class="text-xs text-on-surface-variant">${esc(o.full)}</div>
          <div class="text-xs text-on-surface-variant/70">${esc(o.city)}, ${esc(o.country)}</div>
          <div class="flex gap-1 flex-wrap mt-1">${o.types.map(t => `<span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-container-low border border-outline-variant text-on-surface-variant">${esc(t)}</span>`).join('')}</div>
        </div>
        <div class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all ${sel ? 'bg-primary border-primary' : 'bg-white border-outline-variant'}">
          ${sel ? '<span class="material-symbols-outlined text-sm text-white">check</span>' : ''}
        </div>
      </div>`;
    }).join('');
  }
  const n = dbSel.size;
  document.getElementById('db-count').textContent = n ? n + ' seleccionada' + (n > 1 ? 's' : '') : '';
}
function toggleOrg(id) {
  if (dbSel.has(id)) dbSel.delete(id); else dbSel.add(id);
  renderDB();
}
function confirmDB() {
  if (!dbSel.size) { closeDB(); return; }
  PARTNER_DB.filter(o => dbSel.has(o.id)).forEach(o => {
    pCounter++;
    partners.push({id: pCounter, name: o.name, city: o.city, country: o.country, role: 'partner', order_index: partners.length + 1});
  });
  renderPartners();
  const n = dbSel.size;
  closeDB();
  toast(n + ' socio' + (n > 1 ? 's' : '') + ' añadido' + (n > 1 ? 's' : ''), 'ok');
}
function orgIcon(types) {
  if (types.includes('Universidad'))              return '<span class="material-symbols-outlined text-base text-primary">school</span>';
  if (types.includes('I+D') || types.includes('Tecnología')) return '<span class="material-symbols-outlined text-base text-primary">biotech</span>';
  if (types.includes('VET') || types.includes('Formación'))  return '<span class="material-symbols-outlined text-base text-primary">build</span>';
  if (types.includes('ONG') || types.includes('Juventud'))   return '<span class="material-symbols-outlined text-base text-primary">volunteer_activism</span>';
  if (types.includes('Cultura'))                  return '<span class="material-symbols-outlined text-base text-primary">palette</span>';
  return '<span class="material-symbols-outlined text-base text-primary">business</span>';
}

/* ─── WORD COUNTERS ─────────────────────────────────────────────── */
function updateWC(c) {
  const n = document.getElementById(c.ta).value.trim().split(/\s+/).filter(Boolean).length;
  const b = document.getElementById(c.badge);
  const f = document.getElementById(c.bar);
  b.textContent = n + ' palabra' + (n !== 1 ? 's' : '');
  if (n === 0) {
    b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant transition-all';
    f.style.width = '0%'; f.style.background = '#d6d3dc';
  } else if (n < c.min) {
    b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded-full border border-secondary-fixed bg-[#f8ffd9] text-primary transition-all';
    f.style.width = (n / c.max * 100) + '%'; f.style.background = '#d4ec3c';
  } else if (n > c.max) {
    b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded-full border border-error/40 bg-error-container text-on-error-container transition-all';
    f.style.width = '100%'; f.style.background = '#ba1a1a';
  } else {
    b.className = 'text-xs font-semibold font-headline px-2.5 py-0.5 rounded-full border border-primary/30 bg-lavender-soft text-primary transition-all';
    f.style.width = (n / c.max * 100) + '%'; f.style.background = '#4312d8';
  }
}

/* ─── SUMMARY ───────────────────────────────────────────────────── */
function buildSummary() {
  const p    = PROGS[progKey];
  const name = document.getElementById('f-name').value.trim();
  const start= document.getElementById('f-start').value;
  const dur  = document.getElementById('f-dur').value;
  const desc = document.getElementById('f-desc').value.trim();

  document.getElementById('sum-proj').innerHTML = `
    <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Nombre</span><span class="text-sm font-medium text-on-surface">${esc(name) || '—'}</span></div>
    <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Tipo</span><span class="text-sm font-medium text-on-surface">${p.type}</span></div>
    <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Inicio previsto</span><span class="text-sm font-medium text-on-surface">${fmtDate(start)}</span></div>
    <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Duración</span><span class="text-sm font-medium text-on-surface">${dur} meses</span></div>
    <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Subvención máx.</span><span class="text-sm font-medium text-on-surface">${p.grantLabel}</span></div>
    <div class="flex flex-col gap-0.5"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Plazo</span><span class="text-sm font-medium text-on-surface">${p.dlLabel}</span></div>
    ${desc ? `<div class="flex flex-col gap-0.5 col-span-2"><span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Descripción</span><span class="text-sm font-medium text-on-surface">${esc(desc)}</span></div>` : ''}
  `;

  document.getElementById('sum-partners').innerHTML = partners.map((pt, i) => `
    <div class="flex items-center gap-2 py-2.5 ${i < partners.length - 1 ? 'border-b border-outline-variant/50' : ''}">
      <span class="text-xs font-bold text-on-surface-variant w-4">${i + 1}</span>
      <span class="font-headline text-sm font-bold text-primary">${esc(pt.name) || '—'}</span>
      <span class="text-outline-variant">·</span>
      <span class="text-sm text-on-surface-variant flex-1">${[pt.city, pt.country].filter(Boolean).join(', ') || '—'}</span>
      <span class="text-[11px] font-bold uppercase tracking-wide ${i === 0 ? 'text-primary' : 'text-on-surface-variant'}">${i === 0 ? 'Coordinador' : 'Socio'}</span>
    </div>`).join('');

  document.getElementById('sum-ctx').innerHTML = [
    {lbl:'Problema / necesidad', id:'ctx-prob'},
    {lbl:'Grupos destinatarios',  id:'ctx-tgt'},
    {lbl:'Enfoque y propuesta',   id:'ctx-app'},
  ].map(r => {
    const v = document.getElementById(r.id).value.trim();
    return `<div class="mb-4">
      <span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">${r.lbl}</span>
      ${v ? `<div class="text-sm text-on-surface-variant leading-relaxed mt-1">${esc(v.substring(0, 200) + (v.length > 200 ? '…' : ''))}</div>`
          : `<div class="text-sm text-on-surface-variant italic mt-1">Sin rellenar</div>`}
    </div>`;
  }).join('');
}

/* ─── JSON BUILD ────────────────────────────────────────────────── */
function buildWizardJSON() {
  const p = PROGS[progKey];
  const perdiemRates = {};
  partners.forEach(pt => { perdiemRates[pt.id] = {aloj: 0, mant: 0}; });
  return {
    meta: {version:'1.0', tool:'erasmus-intake', generated_at: new Date().toISOString(), source_module:'intake'},
    fields: {
      proj_name:    document.getElementById('f-name').value.trim(),
      proj_type:    p.type,
      proj_desc:    document.getElementById('f-desc').value.trim(),
      proj_start:   document.getElementById('f-start').value,
      months:       String(document.getElementById('f-dur').value),
      eu_grant:     String(p.grant),
      cofin_pct:    String(p.cofin),
      indirect_pct: String(p.indirect),
      n_partners:   String(partners.length)
    },
    state: {
      maxReached:1, partners: partners.map(pt => ({...pt})),
      routes:{}, wps:[], workerRates:[], wrCounter:0, perdiemRates, extraDestinations:[]
    },
    intake: {
      idea: {
        problem:       document.getElementById('ctx-prob').value.trim(),
        target_groups: document.getElementById('ctx-tgt').value.trim(),
        approach:      document.getElementById('ctx-app').value.trim()
      },
      objectives:{general:'', specific:[], outcomes:''},
      deadline: p.deadline, keywords:[]
    }
  };
}
function buildIntakeJSON() {
  const p = PROGS[progKey];
  return {
    meta: {version:'1.0', tool:'erasmus-intake', generated_at: new Date().toISOString(), source_module:'intake'},
    program: progKey,
    fields: {
      proj_name:    document.getElementById('f-name').value.trim(),
      proj_type:    p.type,
      proj_desc:    document.getElementById('f-desc').value.trim(),
      proj_start:   document.getElementById('f-start').value,
      months:       String(document.getElementById('f-dur').value),
      eu_grant:     String(p.grant),
      cofin_pct:    String(p.cofin),
      indirect_pct: String(p.indirect),
      n_partners:   String(partners.length)
    },
    partners: partners.map(pt => ({...pt})),
    partnerCounter: pCounter,
    intake: {
      idea: {
        problem:       document.getElementById('ctx-prob').value.trim(),
        target_groups: document.getElementById('ctx-tgt').value.trim(),
        approach:      document.getElementById('ctx-app').value.trim()
      },
      objectives:{general:'', specific:[], outcomes:''},
      deadline: p.deadline, keywords:[]
    }
  };
}

/* ─── EXPORT / SAVE / LOAD ──────────────────────────────────────── */
function exportWizard() {
  const json = buildWizardJSON();
  const slug = (json.fields.proj_name || 'proyecto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  dlJSON(json, slug + '-wizard-ready.json');
  toast('JSON exportado para Calculator', 'ok');
}
function saveIntake() {
  const json = buildIntakeJSON();
  const slug = (json.fields.proj_name || 'intake').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  dlJSON(json, slug + '-intake.json');
  toast('Intake guardado', 'ok');
}
function dlJSON(obj, filename) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  } catch(e) { toast('Error al generar el archivo', 'err'); console.error(e); }
}
function triggerLoad() { document.getElementById('file-in').click(); }
function loadFile(ev) {
  const file = ev.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try { restoreState(JSON.parse(e.target.result)); toast('Archivo cargado', 'ok'); }
    catch(e2) { toast('Error al leer el JSON', 'err'); }
  };
  r.readAsText(file);
  ev.target.value = '';
}
function restoreState(d) {
  const f = d.fields || {};
  const k = d.program || (f.proj_type && f.proj_type.startsWith('KA3') ? 'ka3' : null);
  if (k && PROGS[k]) selectProg(k);
  if (f.proj_name)  document.getElementById('f-name').value  = f.proj_name;
  if (f.proj_desc)  document.getElementById('f-desc').value  = f.proj_desc;
  if (f.proj_start) document.getElementById('f-start').value = f.proj_start;
  if (f.proj_type)  document.getElementById('f-type').value  = f.proj_type;
  if (f.months) {
    for (let o of document.getElementById('f-dur').options) {
      if (o.value == f.months) { o.selected = true; break; }
    }
  }
  const pl = d.partners || (d.state && d.state.partners);
  if (pl && pl.length) {
    partners  = pl.map(p => ({...p}));
    pCounter  = d.partnerCounter || partners.reduce((m, p) => Math.max(m, p.id), 0);
    renderPartners();
  }
  const idea = (d.intake && d.intake.idea) || {};
  if (idea.problem)       { document.getElementById('ctx-prob').value = idea.problem;       updateWC(WC[0]); }
  if (idea.target_groups) { document.getElementById('ctx-tgt').value  = idea.target_groups; updateWC(WC[1]); }
  if (idea.approach)      { document.getElementById('ctx-app').value  = idea.approach;      updateWC(WC[2]); }
  setStep(0);
}

/* ─── UTILS ─────────────────────────────────────────────────────── */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`;
}
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show ' + type;
  clearTimeout(el._t); el._t = setTimeout(() => el.className = '', 3000);
}

/* ─── DB SAVE / LOAD ────────────────────────────────────────────── */
let currentProjectId = null;

async function saveToServer() {
  const json = buildIntakeJSON();
  if (!json.fields.proj_name) { toast('Escribe un nombre de proyecto', 'err'); return; }
  try {
    const method = currentProjectId ? 'PUT' : 'POST';
    const url = currentProjectId ? '/api/projects/' + currentProjectId : '/api/projects';
    const resp = await fetch(url, {
      method,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(json),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Error del servidor');
    currentProjectId = data.id;
    toast(method === 'PUT' ? 'Proyecto actualizado en servidor' : 'Proyecto guardado en servidor', 'ok');
    loadProjectList();
  } catch(e) { toast('Error: ' + e.message, 'err'); console.error(e); }
}

async function loadProjectList() {
  try {
    const resp = await fetch('/api/projects');
    const result = await resp.json();
    const projects = result.data || [];
    const el = document.getElementById('server-projects');
    if (!el) return;
    if (projects.length === 0) { el.innerHTML = '<p class="text-xs text-on-surface-variant">No hay proyectos guardados</p>'; return; }
    el.innerHTML = projects.map(p =>
      '<div class="flex items-center justify-between p-3 rounded-lg border border-outline-variant bg-white hover:border-primary cursor-pointer transition-all mb-1.5" data-action="Prototipo.loadFromServer" data-args="' + Acciones.args(String(p.id)) + '">' +
        '<div><span class="text-sm font-bold text-primary">' + esc(p.name) + '</span>' +
        '<span class="text-xs text-on-surface-variant ml-2">' + esc(p.type || '') + ' \u00b7 ' + (p.status || '') + '</span></div>' +
        '<span class="text-[10px] text-on-surface-variant">' + fmtDate((p.created_at || '').slice(0,10)) + '</span>' +
      '</div>'
    ).join('');
  } catch(e) { console.error('loadProjectList:', e); }
}

async function loadFromServer(id) {
  try {
    const resp = await fetch('/api/projects/' + id);
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error);
    const data = result.data;
    currentProjectId = data.id;
    const restored = {
      program: data.type,
      fields: {
        proj_name: data.name, proj_type: data.type,
        proj_desc: data.description, proj_start: data.start_date ? data.start_date.slice(0,10) : '',
        months: String(data.duration_months || ''), eu_grant: String(data.eu_grant || ''),
        cofin_pct: String(data.cofin_pct || ''), indirect_pct: String(data.indirect_pct || ''),
      },
      partners: (data.partners || []).map(p => ({id: p.id, name: p.name, city: p.city || '', country: p.country, role: p.role, order_index: p.order_index})),
      partnerCounter: (data.partners || []).length,
      intake: {
        idea: {
          problem: data.intake ? data.intake.problem || '' : '',
          target_groups: data.intake ? data.intake.target_groups || '' : '',
          approach: data.intake ? data.intake.approach || '' : '',
        },
        objectives: { general: '', specific: [], outcomes: '' },
        keywords: [],
      }
    };
    restoreState(restored);
    toast('Proyecto cargado: ' + data.name, 'ok');
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function deleteFromServer(id) {
  if (!confirm('\u00bfEliminar este proyecto del servidor?')) return;
  try {
    const resp = await fetch('/api/projects/' + id, { method: 'DELETE' });
    if (!resp.ok) throw new Error((await resp.json()).error);
    if (currentProjectId === id) currentProjectId = null;
    toast('Proyecto eliminado', 'ok');
    loadProjectList();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', loadProjectList);

/* Botones de la página: data-action="Prototipo.funcion" (js/acciones.js) */
Acciones.modulo('Prototipo', { addPartner, bgClose, closeDB, confirmDB, exportWizard, loadFile, loadFromServer, next, openDB, prev, removePartner, renderDB, saveIntake, saveToServer, selectProg, toggleFilter, toggleOrg, triggerLoad, tryGo });
Acciones.registrar({
  'proto.socio': (el, ev, i, campo) => { partners[i][campo] = el.value; },
});
