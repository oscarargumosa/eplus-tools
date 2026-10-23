/* Comunidad — listas cerradas. El cliente las recibe de GET /v1/community/me
   (campo `catalog`), así que solo se mantienen aquí. Las claves se guardan
   separadas por comas en community_profiles; nunca texto libre. */

const SECTORS = {
  escolar:  'Educación escolar',
  fp:       'Formación Profesional',
  adultos:  'Educación de adultos',
  superior: 'Educación superior',
  juventud: 'Juventud',
  deporte:  'Deporte',
};

const ACTIONS = {
  ka1:        'KA1 · Movilidad',
  ka2:        'KA2 · Cooperación',
  ka3:        'KA3 · Apoyo a políticas',
  jeanmonnet: 'Jean Monnet',
  ces:        'Cuerpo Europeo de Solidaridad',
  cerv:       'CERV · Ciudadanía y valores',
  creativa:   'Europa Creativa',
  horizonte:  'Horizonte Europa',
  interreg:   'Interreg',
  life:       'LIFE',
};

// Qué papel hace la persona en los proyectos (se pueden marcar varios).
const ROLES = {
  redactor:  'Redactor/a de proyectos',
  evaluador: 'Evaluador/a de proyectos',
  manager:   'Project manager',
  formador:  'Formador/a',
  logistica: 'Logística de actividades',
};

// Ya no se pide ni se muestra (23-oct-2026); queda para leer perfiles antiguos.
const LANGUAGES = {
  es: 'Español', en: 'Inglés', fr: 'Francés', de: 'Alemán', it: 'Italiano', pt: 'Portugués',
  ca: 'Catalán', eu: 'Euskera', gl: 'Gallego', nl: 'Neerlandés', pl: 'Polaco', ro: 'Rumano',
  el: 'Griego', bg: 'Búlgaro', hr: 'Croata', cs: 'Checo', sk: 'Eslovaco', sl: 'Esloveno',
  hu: 'Húngaro', lt: 'Lituano', lv: 'Letón', et: 'Estonio', fi: 'Finés', sv: 'Sueco',
  da: 'Danés', tr: 'Turco', uk: 'Ucraniano', ar: 'Árabe',
};

// Países del programa Erasmus+ y vecinos frecuentes (nombre en español).
const COUNTRIES = {
  AT: 'Austria', BE: 'Bélgica', BG: 'Bulgaria', HR: 'Croacia', CY: 'Chipre', CZ: 'Chequia',
  DK: 'Dinamarca', EE: 'Estonia', FI: 'Finlandia', FR: 'Francia', DE: 'Alemania', GR: 'Grecia',
  HU: 'Hungría', IE: 'Irlanda', IT: 'Italia', LV: 'Letonia', LT: 'Lituania', LU: 'Luxemburgo',
  MT: 'Malta', NL: 'Países Bajos', PL: 'Polonia', PT: 'Portugal', RO: 'Rumanía', SK: 'Eslovaquia',
  SI: 'Eslovenia', ES: 'España', SE: 'Suecia',
  IS: 'Islandia', LI: 'Liechtenstein', NO: 'Noruega', MK: 'Macedonia del Norte', RS: 'Serbia', TR: 'Turquía',
  AL: 'Albania', BA: 'Bosnia y Herzegovina', ME: 'Montenegro', XK: 'Kosovo', MD: 'Moldavia', UA: 'Ucrania',
  GE: 'Georgia', AM: 'Armenia', CH: 'Suiza', GB: 'Reino Unido', MA: 'Marruecos', TN: 'Túnez',
  EG: 'Egipto', JO: 'Jordania', LB: 'Líbano', IL: 'Israel', PS: 'Palestina',
};

// En «Mi entidad» el país es texto libre («Spain», «EL», «Italia»…). Se
// traduce a código cuando se reconoce; si no, el perfil queda sin país.
const COUNTRY_ALIASES = {
  spain: 'ES', espana: 'ES', españa: 'ES', italy: 'IT', italia: 'IT', france: 'FR', francia: 'FR',
  germany: 'DE', alemania: 'DE', deutschland: 'DE', portugal: 'PT', greece: 'GR', grecia: 'GR', el: 'GR',
  belgium: 'BE', belgica: 'BE', bélgica: 'BE', netherlands: 'NL', 'the netherlands': 'NL', 'paises bajos': 'NL',
  poland: 'PL', polonia: 'PL', romania: 'RO', rumania: 'RO', rumanía: 'RO', bulgaria: 'BG', croatia: 'HR', croacia: 'HR',
  cyprus: 'CY', chipre: 'CY', 'czech republic': 'CZ', czechia: 'CZ', chequia: 'CZ', denmark: 'DK', dinamarca: 'DK',
  estonia: 'EE', finland: 'FI', finlandia: 'FI', hungary: 'HU', hungria: 'HU', hungría: 'HU', ireland: 'IE', irlanda: 'IE',
  latvia: 'LV', letonia: 'LV', lithuania: 'LT', lituania: 'LT', luxembourg: 'LU', luxemburgo: 'LU', malta: 'MT',
  slovakia: 'SK', eslovaquia: 'SK', slovenia: 'SI', eslovenia: 'SI', sweden: 'SE', suecia: 'SE', austria: 'AT',
  iceland: 'IS', islandia: 'IS', norway: 'NO', noruega: 'NO', turkey: 'TR', turkiye: 'TR', türkiye: 'TR', turquia: 'TR', turquía: 'TR',
  serbia: 'RS', 'north macedonia': 'MK', uk: 'GB', 'united kingdom': 'GB', 'reino unido': 'GB',
  switzerland: 'CH', suiza: 'CH', ukraine: 'UA', ucrania: 'UA', tunisia: 'TN', tunez: 'TN', túnez: 'TN',
  morocco: 'MA', marruecos: 'MA', albania: 'AL', georgia: 'GE', armenia: 'AM', moldova: 'MD', moldavia: 'MD',
};

function countryCode(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^[A-Za-z]{2}$/.test(s)) {
    const up = s.toUpperCase();
    if (up === 'EL') return 'GR';
    if (up === 'UK') return 'GB';
    return COUNTRIES[up] ? up : null;
  }
  return COUNTRY_ALIASES[s.toLowerCase()] || null;
}

// Temas de las conversaciones generales (en este orden en la interfaz).
// `ask` = la pregunta que guía el formulario según el tema.
const TOPICS = {
  preguntas:      { label: 'Preguntas',      ask: '¿Qué quieres preguntar a la comunidad?' },
  socios:         { label: 'Busco socios',   ask: '¿Qué proyecto preparas y qué socio te falta?' },
  convocatorias:  { label: 'Convocatorias',  ask: '¿Qué convocatoria quieres comentar?' },
  recursos:       { label: 'Recursos',       ask: '¿Qué recurso compartes y por qué es útil?', linkRequired: true },
  presentaciones: { label: 'Presentaciones', ask: 'Preséntate: quién eres, tu entidad y qué te trae aquí.' },
  exitos:         { label: 'Éxitos',         ask: '¿Qué ha salido bien? Un proyecto aprobado, una movilidad, un aprendizaje…' },
};

module.exports = { SECTORS, ACTIONS, ROLES, LANGUAGES, COUNTRIES, TOPICS, countryCode };
