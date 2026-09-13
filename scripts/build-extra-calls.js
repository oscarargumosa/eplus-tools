#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Genera data/erasmus_extra_calls.json — convocatorias que no llegan por SEDIA:
   las KA2 que gestionan las Agencias Nacionales (ese feed solo trae las
   centralizadas de EACEA) y las que aún no se han publicado pero ya se conocen.

   Modelo acordado con Óscar (13-sep-2026):
   · Una fila por ACCIÓN, no por país. KA220-ADU es una sola convocatoria
     aplicable en los 33 países del programa; el país es un dato del
     proyecto (projects.national_agency), no una entrada del catálogo.
     Lo contrario daría ~30 acciones × 33 agencias × 2 rondas ≈ 2.000
     filas prácticamente idénticas.
   · Las bandas de lump sum (120k/250k/400k) son un ATRIBUTO, no tres
     convocatorias. En data/erasmus_plus_2026_calls.clean.json están como
     tres filas y por eso cada KA220 aparecía triplicada.
   · Solo KA2 y KA3. Las KA1 (acreditaciones KA120/KA150 y movilidades
     KA122/KA15x/KA182) quedan fuera: las acreditaciones no son proyectos
     y las movilidades necesitan otro flujo.
   · Una fecha sin confirmar se marca con `deadline_provisional` y se dice en
     la primera línea del resumen, que es lo que se lee en la tarjeta.

   Fuentes de los datos:
   · Importes, duración y tipo de financiación → data/erasmus_plus_2026_calls.clean.json
   · Fechas límite y descripciones oficiales en español → portal de
     oportunidades de la Comisión, convocatoria 2026 ronda 2.

       node scripts/build-extra-calls.js
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');

const RAIZ    = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'data', 'erasmus_extra_calls.json');

/* Convocatoria 2026, ronda 2. Hora de Bruselas. */
const DEADLINE = '2026-10-01';
const DEADLINE_TIME = '12:00';
const RONDA = 'Convocatoria 2026 · Ronda 2';

/* Los 33 países del programa: los únicos con Agencia Nacional. Salen de
   ref_countries (eu_member + associated); se listan aquí para que el feed
   no dependa de la base de datos al generarse. */
const PAISES_PROGRAMA = [
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',          // UE-27
  'IS','LI','NO','MK','RS','TR',                                        // asociados
];

const RESUMEN_KA220 =
  'Esta acción permite a las organizaciones participantes adquirir experiencia en cooperación ' +
  'internacional y consolidar sus capacidades, pero también producir resultados tangibles ' +
  'innovadores de gran calidad. El objetivo principal de las asociaciones de cooperación es ' +
  'permitir que las organizaciones incrementen la calidad y pertinencia de sus actividades, ' +
  'amplíen y refuercen sus redes de organizaciones asociadas e incrementen su capacidad para ' +
  'operar de manera conjunta a nivel transnacional, impulsando la internacionalización de sus ' +
  'actividades, intercambiando o desarrollando prácticas y métodos nuevos, así como poniendo en ' +
  'común y confrontando ideas.';

const NOTA_PAIS =
  'Se solicita a la Agencia Nacional del país del coordinador. Las condiciones (idioma de la ' +
  'solicitud, presupuesto disponible y prioridades nacionales) las fija cada agencia; el plazo y ' +
  'las reglas generales son comunes a los 33 países del programa.';

const NOTA_LUMP =
  'Importe a tanto alzado: se elige una de las tres bandas (120.000 €, 250.000 € o 400.000 €) ' +
  'según el alcance del proyecto. El coste total real suele ser mayor que la subvención.';

const SECTORES_KA220 = [
  ['ADU', 'educación de personas adultas', 'Adult Education'],
  ['HED', 'educación superior',            'Higher Education'],
  ['SCH', 'educación escolar',             'School Education'],
  ['VET', 'formación profesional',         'VET'],
  ['YOU', 'el ámbito de la juventud',      'Youth'],
];

function base(id, titulo, resumenEs, resumenEn, extra) {
  return {
    call_id: id,
    source: 'e+na',                 // Erasmus+ gestionado por Agencia Nacional
    source_id: id,
    level: 'EU',
    category: 'Erasmus+',
    programme: 'Erasmus+',
    sub_programme: 'KA2 — Cooperación entre organizaciones',
    title: titulo,
    title_lang: 'es',
    summary_es: `${resumenEs}\n\n${NOTA_PAIS}`,
    summary_en: resumenEn,
    status: 'open',
    open_date: null,
    publication_date: null,
    deadline: DEADLINE,
    deadline_model: 'single-stage',
    deadlines_extra: [{ label: RONDA, date: DEADLINE, time: DEADLINE_TIME, timezone: 'Europe/Brussels' }],
    cofinancing_pct: null,           // lump sum: no hay porcentaje de cofinanciación
    expected_grants: null,
    budget_total_eur: null,
    eligible_countries: PAISES_PROGRAMA,
    eligible_orgs: null,
    crossCuttingPriorities: [],
    managed_by: 'National Agency',
    apply_url: 'https://webgate.ec.europa.eu/app-forms/af-ui-opportunities/#/erasmus-plus',
    details_url: 'https://erasmus-plus.ec.europa.eu/programme-guide/erasmusplus-programme-guide',
    fetched_at: new Date().toISOString(),
    ...extra,
  };
}

const calls = [];

for (const [cod, sectorEs, sectorEn] of SECTORES_KA220) {
  calls.push(base(
    `KA220-${cod}-2026`,
    `Asociaciones de cooperación en ${sectorEs} (KA220-${cod})`,
    RESUMEN_KA220,
    `Cooperation Partnerships in ${sectorEn} (KA220-${cod}).`,
    {
      budget_per_project_min_eur: 120000,
      budget_per_project_max_eur: 400000,
      lump_sum_bands_eur: [120000, 250000, 400000],
      duration_months: 36,
      duration_min_months: 12,
      keywords: ['KA220', 'cooperation partnerships', 'asociaciones de cooperación', sectorEn, 'agencia nacional'],
      notes: NOTA_LUMP,
    }
  ));
}

/* ── KA3 · European Youth Together ───────────────────────────────────
   Esta sí es centralizada (EACEA), pero tampoco llega por SEDIA: la única
   que figura allí es la de 2024, con el plazo cerrado, y la siguiente aún no
   se ha publicado. Se adelanta para poder ir preparándola, con el plazo
   marcado como PROVISIONAL hasta que salga la guía del programa. */
calls.push({
  ...base(
    'KA3-YOUTH-TOG-2027',
    'European Youth Together (KA3) · juventud',
    'FECHA PROVISIONAL hasta que se publique la guía del programa. European Youth Together apoya ' +
    'redes de organizaciones juveniles de varios países que trabajan juntas en proyectos de ' +
    'participación, inclusión y valores europeos, con voz real de las personas jóvenes en el diseño ' +
    'y en la ejecución.',
    'European Youth Together (KA3). Provisional deadline until the programme guide is published.',
    {
      keywords: ['KA3', 'European Youth Together', 'juventud', 'participación', 'EACEA'],
      notes: 'Plazo provisional: 1 de febrero de 2027, pendiente de confirmar con la guía del ' +
             'programa. El importe y la duración se dejan sin fijar a propósito, para no dar por ' +
             'buenos los datos de la convocatoria anterior.',
    }
  ),
  source: 'e+eacea',          // esta es centralizada, no de agencia nacional
  sub_programme: 'KA3 — Apoyo a la reforma de las políticas',
  managed_by: 'EACEA',
  deadline: '2027-02-01',
  deadline_provisional: true,
  deadlines_extra: [{ label: 'Convocatoria 2027 · plazo provisional', date: '2027-02-01', timezone: 'Europe/Brussels' }],
  // Sin importe ni duración: los de 2024 no tienen por qué repetirse.
  budget_per_project_min_eur: null,
  budget_per_project_max_eur: null,
  duration_months: null,
});

calls.push(base(
  'KA240-SCH-2026',
  'Asociaciones europeas para el desarrollo escolar (KA240-SCH)',
  'Las asociaciones europeas para el desarrollo escolar apoyan la innovación, el desarrollo de ' +
  'capacidades y el intercambio de prácticas entre los agentes clave de los sistemas de educación ' +
  'escolar: autoridades educativas, organismos de coordinación, centros escolares y otras partes ' +
  'interesadas. Es una acción nueva en 2026.',
  'European partnerships for school development will support innovation, capacity building and ' +
  'sharing of practices among key actors in school education systems: school authorities, ' +
  'coordinating bodies, schools, and other key stakeholders.',
  {
    budget_per_project_min_eur: 400000,
    budget_per_project_max_eur: 400000,
    lump_sum_bands_eur: [400000],
    duration_months: 36,
    duration_min_months: 36,
    keywords: ['KA240', 'EPSD', 'desarrollo escolar', 'School Education', 'agencia nacional'],
    notes: 'Acción nueva en 2026. Importe a tanto alzado fijo de 400.000 € y 36 meses de duración. ' +
           'Se espera que las autoridades educativas aporten recursos adicionales para lograr impacto sistémico.',
  }
));

fs.writeFileSync(DESTINO, JSON.stringify(calls, null, 2) + '\n', 'utf8');
console.log(`Escritas ${calls.length} convocatorias en ${path.relative(RAIZ, DESTINO)}`);
for (const c of calls) console.log(`  ${c.call_id.padEnd(16)} ${c.title}`);
