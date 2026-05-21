/**
 * One-shot import for the SUSTRAI CV batch (2026-05-19).
 *
 * Inputs are the polished CV summaries provided by Oscar — see ./cv-pdfs.
 * Each entry: (a) ensures the person exists in org_key_staff for the given
 * organization (insert if missing, update if found by name); (b) ensures a
 * project_partner_staff row with selected=1 + project_role + custom_skills
 * for the SUSTRAI project so the consorcio shows the staff already marked.
 *
 * Idempotent. Safe to re-run.
 */
'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const SUSTRAI_PROJECT_ID = '11373f08-a611-4ce7-9249-fa81b588a18e';

// Partners → organization_id  (from `partners` join `organizations`)
const ORG_PERMACULTURA = 'a95547b3-ed92-4b7f-acd4-1d9911983124';
const ORG_GOIMEN       = '1302e6f9-9d47-4625-92bb-15408c465d85';
const ORG_GOIERRI_TUR  = '032a1f7d-3db0-486d-a807-777da9496e78';
const ORG_CAMARA_GIP   = '47590d4e-c63b-4951-81e9-9d0c32674532';

const PARTNER_PERMACULTURA = '103c7d30-75e3-4b88-8dd1-39206884310b';
const PARTNER_GOIMEN       = 'f9e90991-6146-43bc-8ca5-f9de0ce345aa';
const PARTNER_GOIERRI_TUR  = 'fe8ecf7a-93ec-4e7b-b611-fac208107e9d';
const PARTNER_CAMARA_GIP   = '26122b40-2888-42c6-8a55-d79a6fc76477';

const PEOPLE = [
  {
    name: 'Óscar Argumosa Sainz',
    aliases: ['Oscar Argumosa', 'Óscar Argumosa', 'Argumosa'],
    org_id:     ORG_PERMACULTURA,
    partner_id: PARTNER_PERMACULTURA,
    org_role:        'Project Manager — Founder & President',
    project_role:    'Project Manager',
    skills_summary:
      'Founder & President of Permacultura Cantabria (since 2005). 25+ years leading community-based initiatives, rural innovation, permaculture and European cooperation projects. Coordinated 20+ Erasmus+ and international programmes focused on sustainability, eco-tourism, environmental education, regenerative practices, community resilience and multi-stakeholder collaboration. Promoter of the EuroMotional network. Supervised bio-construction initiatives during Expo Zaragoza 2008. Diploma in Permaculture (El Hayal — Emilia Hazelip, 1998–2002), Diploma in Emotional Management (Re-evaluation Counseling, Philadelphia, 2005–2007), Electro-Mechanical Technician (Augusto Linares VET Centre). Languages: Spanish (native), English (professional).',
  },
  {
    name: 'Silvia Abascal Díaz',
    aliases: ['Silvia Abascal'],
    org_id:     ORG_PERMACULTURA,
    partner_id: PARTNER_PERMACULTURA,
    org_role:        'Treasurer & EU Project Coordinator',
    project_role:    'Deputy Project Manager',
    skills_summary:
      'Experienced European project professional (Permacultura Cantabria since 2005, formal coordinator since 2012). Treasurer, project writer and KA1/KA2 coordinator. Expertise across the full project cycle: proposal development, consortium building, partner liaison, implementation monitoring, quality assurance, reporting, dissemination and exploitation. Strong background in non-formal education, sustainability, agro-tourism, permaculture, eco-building and inclusion/safeguarding (prior experience in Cantabrian youth programmes with ADHD, autism, disabilities and mental-health support). Completed long-term EVS in Greece (environmental association). Degree in English Philology + Postgraduate Teacher Training (CAP) at Complutense Madrid. Specialised training in Dragon Dreaming, group facilitation, emotional intelligence (annual), Red Cross first aid, sign language and Spanish-as-foreign-language teaching. Languages: ES native, EN advanced, FR/DE intermediate, GR/IT/PT basic.',
  },
  {
    name: 'Ana González Gutiérrez',
    aliases: ['Ana Gonzalez', 'Ana González'],
    org_id:     ORG_PERMACULTURA,
    partner_id: PARTNER_PERMACULTURA,
    org_role:        'Head of Communication & Graphic Design',
    project_role:    'Communication & PR Expert',
    skills_summary:
      'Head of Communication and Graphic Design at Permacultura Cantabria (2022–2025). Creative communication and branding professional specialised in visual identity, public relations, social media and digital dissemination for sustainability-oriented organisations. Previously Graphic Designer at Sidecar Publicidad S.L. (2017–2022), covering branding, packaging, digital communication and visual identity from concept to final production. Master in Branding and Brand Communication (SHIFTA by Elisava, 2023), Bachelor in Graphic Design (ESDIR, 2017), Advanced Technician in Plastic Arts & Design in Advertising Graphics (Vinsac Design School). Recent training in Virtual Community Management (100 h), Digital Innovation II and VET Teaching Qualification (340 h, 2024). Advanced Adobe Illustrator and Photoshop; intermediate InDesign, After Effects, Figma, Cinema 4D. Languages: Spanish (native), English (CAE C1).',
  },
  {
    name: 'Helena Bohigues',
    aliases: ['Helena Bohigues, PhD', 'Bohigues'],
    org_id:     ORG_PERMACULTURA,
    partner_id: PARTNER_PERMACULTURA,
    org_role:        'Project Coordinator — Capacity Building',
    project_role:    'Capacity Building Expert',
    skills_summary:
      'Project Coordinator at Permacultura Cantabria (2024–present) supporting Erasmus+ KA2/KA3 implementation, partner coordination and organisational capacity building. Previously Cultural Heritage Manager / Project Management Assistant at the Spanish Association of Cultural Heritage Managers (AEGPC, 2021–2023) with Horizon 2020 experience. Interdisciplinary expertise across cultural heritage, sustainability, project planning/scheduling/budgeting, stakeholder engagement, training support and dissemination. PhD in Art History (Complutense Madrid, 2021), MA in Advanced Studies of Museums and Historical-Artistic Heritage, BA in History of Art (Complutense Madrid). Certified Expert Manager in 2030 Agenda & SDGs and European Project Management: Next Generation Funds (UNED, 2023); Digital Technologies Applied to Cultural Heritage (UNED, 2024). Languages: Spanish & Catalan/Valencian (native), English (C1).',
  },
  {
    name: 'Manex Aranburu Iraeta',
    aliases: ['Manex Aranburu', 'Aranburu'],
    org_id:     ORG_GOIMEN,
    partner_id: PARTNER_GOIMEN,
    org_role:        'Manager — Rural Development Lead',
    project_role:    'SME Support & Tourism Consultancy Expert',
    skills_summary:
      'Manager of GOIMEN Rural Development Association (Goierri, Gipuzkoa) since 2016 — joined as Rural Development Technician in 1999. 25+ years of expertise designing, coordinating and implementing rural development strategies with social, economic, environmental and tourism impact. Strong background supporting rural SMEs, sustainable tourism initiatives, territorial cooperation and community-based development. Led strategic rural projects including Mutiloa (Berpiztu programme – Mendikoi) and Zegama (Izartu, Erein, Hurbiltzen). Active in biodiversity, landscape management, ecological transition and mountain ecosystems; collaboration with the Gipuzkoa Beekeepers Association. Forestry Engineering — Environmental Specialisation (University of Lleida, 1999) + Agricultural Technical Engineering (Public University of Navarra, 1996). GIS toolset: QGIS, ArcInfo, ArcView, MapInfo, IDRISI. Languages: Basque (native), Spanish (professional), English (intermediate).',
  },
  {
    name: 'Mikele Bustillo',
    aliases: ['Bustillo'],
    org_id:     ORG_GOIERRI_TUR,
    partner_id: PARTNER_GOIERRI_TUR,
    org_role:        'Communication & Digital Dissemination',
    project_role:    'Communication Expert',
    skills_summary:
      'Communication and digital dissemination professional combining journalism, digital marketing and public communication. Degree in Journalism (University of the Basque Country UPV/EHU, 2017) with Séneca exchange at FCOM Sevilla; Digital Journalism Course and 200-hour Digital Marketing Manager training (Escuela de Empresa, 2019–2020). Experience in content writing, social media, storytelling, multilingual communication and customer-oriented environments, plus cultural publications and a published book (Editorial Huerga y Fierro — "De todos mis insomnios"). Articles in La web de la cultura and Fleekmag. Volunteer with Save the Children (Seville, 2014–2015). Well-suited to communication, dissemination and stakeholder outreach for sustainable tourism and European cooperation projects. Languages: Basque (bilingual EGA), Spanish (native), English (Cambridge C1 Advanced, preparing C2).',
  },
  {
    name: 'Asier Barandiaran',
    aliases: ['Barandiaran'],
    org_id:     ORG_CAMARA_GIP,
    partner_id: PARTNER_CAMARA_GIP,
    org_role:        'Senior Consultant — Internationalisation, Tourism & Retail',
    project_role:    'Internationalisation & Tourism Promotion Expert',
    skills_summary:
      'Senior consultant at Cámara Oficial de Comercio, Industria y Navegación de Gipuzkoa since July 2004, leading external promotion (international missions, joint participation in fairs, B2B encounters) and customised consultancy in foreign markets (commercial, sourcing, legal, HR and investments). Director of the BasquEAT Agri-food Consortium and retail-trade consultancy expert. Previously Delegation Manager for ADAICO International (Büren, Germany, 2002–2004) and ADAICO Belgium (1999–2001) covering Central, Northern and Eastern European truck-component markets. Earlier liaison role at FAGOR Industriecommerz GmbH (Germany) and V. Luzuriaga (1994–1999) with Opel Bochum, Continental Teves, Lucas Automotive (TRW), Ford Wülfrath and Opel Rüsselsheim. Started as Basque Government Foreign-Trade Scholar at the Embassy of Spain in Germany (1994). Bachelor in Business and Economic Sciences — Marketing specialisation (University of Deusto, 1992; Erasmus at Haarlem 1992). Degree in Industrial Organisation Engineering (UDIMA, 2016). Expert in Foreign Trade postgraduate (Cámara de Gipuzkoa, 500 h, 1993). Languages: Basque & Spanish (native), English & German (advanced), French (intermediate-advanced).',
  },
];

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'eplus_tools',
    charset: 'utf8mb4',
  });

  let inserted = 0, updated = 0, linked = 0;

  for (const p of PEOPLE) {
    // 1. Find existing staff in the org (case-insensitive name match on full name or any alias).
    const candidates = [p.name, ...(p.aliases || [])].map(s => s.toLowerCase().trim());
    const [rows] = await conn.execute(
      `SELECT id, name, role FROM org_key_staff WHERE organization_id = ?`,
      [p.org_id]
    );
    let staffId = null;
    for (const r of rows) {
      const n = (r.name || '').toLowerCase().trim();
      if (!n) continue;
      if (candidates.some(c => n === c || n.includes(c) || c.includes(n))) {
        staffId = r.id;
        break;
      }
    }

    if (staffId) {
      // UPDATE: refresh name, role and skills with the polished CV content.
      await conn.execute(
        `UPDATE org_key_staff
            SET name = ?, role = ?, skills_summary = ?
          WHERE id = ?`,
        [p.name, p.org_role, p.skills_summary, staffId]
      );
      updated++;
      console.log(`  ↻  Updated ${p.name} (${staffId})`);
    } else {
      staffId = randomUUID();
      await conn.execute(
        `INSERT INTO org_key_staff (id, organization_id, name, role, skills_summary)
         VALUES (?, ?, ?, ?, ?)`,
        [staffId, p.org_id, p.name, p.org_role, p.skills_summary]
      );
      inserted++;
      console.log(`  +  Inserted ${p.name} (${staffId})`);
    }

    // 2. Link to SUSTRAI project with selected=1, project_role and custom_skills.
    await conn.execute(
      `INSERT INTO project_partner_staff
         (id, project_id, partner_id, staff_id, selected, project_role, custom_skills)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         selected = 1,
         project_role = VALUES(project_role),
         custom_skills = VALUES(custom_skills)`,
      [randomUUID(), SUSTRAI_PROJECT_ID, p.partner_id, staffId, p.project_role, p.skills_summary]
    );
    linked++;
    console.log(`     ↳ linked to SUSTRAI (selected=1, role=${p.project_role})`);
  }

  // Clean up the empty placeholder row in Permacultura (NULL name + NULL role)
  // that has been sitting there from an old import.
  const [del] = await conn.execute(
    `DELETE FROM org_key_staff
      WHERE organization_id = ? AND name IS NULL AND role IS NULL AND skills_summary IS NULL`,
    [ORG_PERMACULTURA]
  );
  if (del.affectedRows) console.log(`  ✓ Removed ${del.affectedRows} empty placeholder row(s).`);

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`  Inserted:        ${inserted}`);
  console.log(`  Updated:         ${updated}`);
  console.log(`  Linked to SUSTRAI: ${linked}`);
  console.log('');

  await conn.end();
}

run().catch(err => { console.error('Import failed:', err); process.exit(1); });
