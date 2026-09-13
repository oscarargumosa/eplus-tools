#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   Da de alta en intake_programs las acciones KA2 de Agencia Nacional, que
   es lo que hace que una convocatoria se pueda TRABAJAR en la herramienta
   (el listado marca `available_in_efs` cuando el action_type coincide con
   un programa activo).

   Las convocatorias en sí las genera scripts/build-extra-calls.js; este script
   es el otro lado: el molde de intake para cada una.

   Idempotente: `program_id` es único y se hace upsert, así que se puede
   ejecutar las veces que haga falta sin duplicar ni pisar lo editado a mano
   salvo en los campos que aquí se declaran.

       node scripts/seed-na-programs.js

   Todas usan la plantilla «KA2 Cooperation Partnerships (National Agency)»,
   que ya existía en form_templates sin que ningún programa la usara.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

require('dotenv').config();
const pool = require('../node/src/utils/db');
const { randomUUID } = require('crypto');

const PLANTILLA_KA2_NA = '00000000-0000-4000-b000-000000000220';

/* Convocatoria 2026 · ronda 2. Hora de Bruselas. */
const DEADLINE = '2026-10-01';
const DEADLINE_TIME = '12:00';

const RESUMEN_KA220 = (sector) => `Asociaciones de cooperación (KA220) en ${sector}, gestionadas por la Agencia Nacional del país del coordinador.

Financian proyectos que permiten a las organizaciones ganar experiencia en cooperación internacional, reforzar sus capacidades y producir resultados tangibles de calidad: prácticas nuevas, métodos, materiales y redes estables de socios.

El presupuesto es a tanto alzado: se elige una de las tres bandas —120.000 €, 250.000 € o 400.000 €— según el alcance del proyecto. No se justifica factura a factura, pero hay que demostrar que las actividades se han completado con calidad. El coste real del proyecto suele ser mayor que la subvención.

Mínimo 3 organizaciones de 3 países del programa. Duración de 12 a 36 meses.

El plazo y las reglas generales son comunes a los 33 países del programa. Lo que cambia por país es el idioma de la solicitud, el presupuesto disponible y las prioridades nacionales: eso lo fija cada Agencia Nacional.`;

const PROGRAMAS = [
  ...[
    ['ADU', 'educación de personas adultas'],
    ['HED', 'educación superior'],
    ['SCH', 'educación escolar'],
    ['VET', 'formación profesional'],
    ['YOU', 'el ámbito de la juventud'],
  ].map(([cod, sector]) => ({
    program_id:  `ka220_${cod.toLowerCase()}_2026`,
    name:        `Asociaciones de cooperación en ${sector} (KA220-${cod}) · 2026`,
    action_type: `KA220-${cod}-2026`,
    duration_min_months: 12,
    duration_max_months: 36,
    eu_grant_max: 400000,
    min_partners: 3,
    call_summary: RESUMEN_KA220(sector),
  })),
  {
    program_id:  'ka240_sch_2026',
    name:        'Asociaciones europeas para el desarrollo escolar (KA240-SCH) · 2026',
    action_type: 'KA240-SCH-2026',
    duration_min_months: 36,
    duration_max_months: 36,
    eu_grant_max: 400000,
    // Acción nueva en 2026: el mínimo de socios no está confirmado. La columna
    // es NOT NULL, así que se deja el valor por defecto de la tabla (2) y queda
    // anotado en el resumen que hay que verificarlo en la guía del programa,
    // en vez de afirmar un número que el usuario daría por bueno.
    min_partners: 2,
    verificar_min_partners: true,
    call_summary: `Asociaciones europeas para el desarrollo escolar (KA240-SCH), acción nueva en 2026, gestionada por la Agencia Nacional.

Apoya la innovación, el desarrollo de capacidades y el intercambio de prácticas entre los agentes clave de los sistemas de educación escolar: autoridades educativas, organismos de coordinación, centros escolares y otras partes interesadas.

Importe a tanto alzado fijo de 400.000 € y 36 meses de duración. Se espera que las autoridades educativas aporten recursos adicionales para lograr impacto sistémico.

El plazo y las reglas generales son comunes a los 33 países del programa. El idioma de la solicitud, el presupuesto disponible y las prioridades nacionales los fija cada Agencia Nacional.

Nota: por ser una acción nueva, el número mínimo de socios está pendiente de verificar en la guía del programa 2026.`,
  },
];

async function main() {
  for (const p of PROGRAMAS) {
    await pool.query(
      `INSERT INTO intake_programs
         (id, program_id, name, action_type, deadline, deadline_time,
          duration_min_months, duration_max_months, eu_grant_max,
          cofin_pct, indirect_pct, hide_cofin, hide_indirect,
          min_partners, call_summary, form_template_id, active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          action_type = VALUES(action_type),
          deadline = VALUES(deadline),
          deadline_time = VALUES(deadline_time),
          duration_min_months = VALUES(duration_min_months),
          duration_max_months = VALUES(duration_max_months),
          eu_grant_max = VALUES(eu_grant_max),
          cofin_pct = VALUES(cofin_pct),
          indirect_pct = VALUES(indirect_pct),
          hide_cofin = VALUES(hide_cofin),
          hide_indirect = VALUES(hide_indirect),
          min_partners = VALUES(min_partners),
          call_summary = VALUES(call_summary),
          form_template_id = VALUES(form_template_id),
          active = 1`,
      [
        randomUUID(), p.program_id, p.name, p.action_type, DEADLINE, DEADLINE_TIME,
        p.duration_min_months, p.duration_max_months, p.eu_grant_max,
        // Lump sum: no hay porcentaje de cofinanciación ni costes indirectos
        // que calcular, así que se ocultan en el presupuesto.
        100, 0, 1, 1,
        p.min_partners, p.call_summary, PLANTILLA_KA2_NA,
      ]
    );
    console.log(`✓ ${p.action_type.padEnd(16)} ${p.name}`);
  }

  const [rows] = await pool.query(
    "SELECT COUNT(*) n FROM intake_programs WHERE action_type LIKE 'KA2%-2026' AND active=1"
  );
  console.log(`\nProgramas KA2 de Agencia Nacional activos: ${rows[0].n}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
