/**
 * Seed script: populate organizations with sample data.
 * Usage: node scripts/seed-orgs.js
 */
require('dotenv').config();
const pool = require('../node/src/utils/db');
const uuid = require('../node/src/utils/uuid');

async function run() {
  const userId = 'b9150dd3-ebe1-4583-baf9-eacef3a7a666'; // Oscar

  // ── 1. Permacultura Cantabria (Mi Organización) ───────────
  const orgPC = uuid();
  await pool.query(`INSERT INTO organizations (
    id, owner_user_id, organization_name, legal_name_national, legal_name_latin,
    acronym, org_type, national_id, pic, foundation_date,
    country, region, city, address, post_code, website, email, telephone1,
    is_public_body, is_non_profit,
    description, activities_experience, has_eu_projects,
    legal_rep_title, legal_rep_gender, legal_rep_first_name, legal_rep_family_name,
    legal_rep_department, legal_rep_position, legal_rep_email, legal_rep_telephone1,
    legal_rep_same_address, legal_rep_address, legal_rep_country, legal_rep_region, legal_rep_city, legal_rep_post_code,
    cp_title, cp_gender, cp_first_name, cp_family_name,
    cp_department, cp_position, cp_email, cp_telephone1,
    cp_same_address, cp_address, cp_country, cp_region, cp_city, cp_post_code,
    is_public
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    orgPC, userId,
    'Permacultura Cantabria',
    'Asociación cultural y medioambiental Permacultura Cantabria',
    'Asociación cultural y medioambiental Permacultura Cantabria',
    'ACYMPC', 'NGO', 'Nº registration: 3705. VAT Code: G39617584', '940435371', '2005-05-24',
    'Spain', 'Cantabria', 'Penagos', 'C/ La llama s/n', '39627',
    'www.permaculturacantabria.com', 'contacto@example.org', '0034000000000',
    0, 1,
    `Permacultura Cantabria is a non-profit organisation, composed of more or less 40 people, whose aim is to offer new alternatives to improve society, recover values and the benchmarks of a naturally balanced way of life. The main goal of the group is to continually investigate the different alternatives to achieve a sustainable culture, to take care of each other and enjoy what they do. The two main lines of work are related to sustainability and natural balance (permaculture, bioconstruction, organic agriculture) and human development (personal growth, emotional intelligence, active listening, inclusion). They organise seminars, workshops, conferences, courses and meetings. The intention is to create an international reference platform based on ecological and healthy systems. They created an experimental, sustainable and self-sufficient property more than 13 years ago.`,
    `In Permacultura Cantabria we have been working for 18 years on youth inclusion, rural and local development. We work in close cooperation with public institutions and local initiatives. We collaborate with education centers to create inter-institutional ways of learning. At local and regional level, we train and coach young people using innovative techniques like Dragon Dreaming. Tourism is another important work line — we are part of the route of Santiago de Compostela. At European level, we have coordinated eight Erasmus+ projects and participated in more than 16.`,
    1,
    'Mr.', 'Male', 'Óscar', 'Argumosa Sainz',
    'Direction', 'President', 'contacto@example.org', '0034000000000',
    0, 'Dirección del representante (ver nota interna del VPS)', 'Spain', 'Cantabria', 'La Helguera, Penagos', '39627',
    'Mr.', 'Male', 'Óscar', 'Argumosa Sainz',
    'Direction', 'President', 'contacto@example.org', '0034000000000',
    0, 'Dirección del representante (ver nota interna del VPS)', 'Spain', 'Cantabria', 'La Helguera, Penagos', '39627',
    1
  ]);

  // Link user → org
  await pool.query('UPDATE users SET organization_id=? WHERE id=?', [orgPC, userId]);

  // Accreditation
  await pool.query('INSERT INTO org_accreditations (id, organization_id, accreditation_type, accreditation_reference) VALUES (?,?,?,?)',
    [uuid(), orgPC, 'EVS (Sending, Coordinating)', '2017-1-ES02-KA110-010259']);

  // EU Projects — applicant
  for (const [yr, cid] of [
    [2014, '2014-3-ES02-KA105-005400'], [2014, '2014-2-ES02-KA105-000979'],
    [2015, '2015-1-ES02-KA105-005900'], [2015, '2015-2-ES02-KA105-006430'],
    [2015, '2015-3-ES02-KA105-007260'], [2016, '2016-1-ES02-KA105-007777'],
    [2016, '2016-3-ES02-KA105-008949'], [2017, '2017-1-ES02-KA105-009554'],
  ]) {
    await pool.query('INSERT INTO org_eu_projects (id, organization_id, programme, year, project_id_or_contract, role, beneficiary_name) VALUES (?,?,?,?,?,?,?)',
      [uuid(), orgPC, 'Erasmus +', yr, cid, 'applicant', 'Permacultura Cantabria']);
  }
  // EU Projects — partner
  for (const [yr, cid, ben] of [
    [2016, '2016-1-AT02-KA105-001527', 'Balu&Du'],
    [2017, '2017-1-IT02-KA201-036895', 'Direzione Didattica C. Maneri-Ingrassia'],
    [2017, '2017-2-PL01-KA205-039157', 'Active Woman Association'],
  ]) {
    await pool.query('INSERT INTO org_eu_projects (id, organization_id, programme, year, project_id_or_contract, role, beneficiary_name) VALUES (?,?,?,?,?,?,?)',
      [uuid(), orgPC, 'Erasmus +', yr, cid, 'partner', ben]);
  }

  // Key staff
  for (const [name, skills] of [
    ['Oscar Argumosa', 'President. Certification in Permaculture and Emotional Management Training. 15+ years experience in rural development and Permaculture. Experience in facilitating international projects and creating partnerships.'],
    ['Carmen Solla', 'International Area Coordinator. BSc in Environmental Sciences. 15+ years in project management (Terracycle, Greenpeace, Save the Children). Expertise in environmental legislation, international development cooperation and inclusive education.'],
    ['Julia Ramos', 'Facilitator of Dragon Dreaming Methodology. Master in Leadership and Strategy Sustainable Planning (TU Sweden). 8 years in Hotel Business. Master in Communication Management and Public Relations.'],
    ['Angie Larenas Álvarez', 'Sociologist specialized in social research with training in international studies. 10+ years as researcher, consultant, trainer and editor. Expert in youth participation and diversity.'],
  ]) {
    await pool.query('INSERT INTO org_key_staff (id, organization_id, name, skills_summary) VALUES (?,?,?,?)',
      [uuid(), orgPC, name, skills]);
  }

  // ── 2. Citizens In Power (Cyprus) ─────────────────────────
  const orgCIP = uuid();
  await pool.query(`INSERT INTO organizations (
    id, organization_name, legal_name_national, legal_name_latin,
    acronym, org_type, pic, foundation_date,
    country, region, city, address, post_code, website, email, telephone1,
    is_public_body, is_non_profit, description, activities_experience, has_eu_projects, is_public
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    orgCIP,
    'Citizens In Power', 'Citizens In Power', 'Citizens In Power',
    'CIP', 'NGO', '940477275', '2010-03-15',
    'Cyprus', 'Nicosia', 'Nicosia', '5 Promitheos, Engomi', '2411',
    'www.citizensinpower.org', 'info@citizensinpower.org', '+35722466725',
    0, 1,
    'Citizens In Power (CIP) is an independent non-profit, non-governmental organization based in Nicosia, Cyprus, active in education, training, research and innovation. CIP activities aim to empower citizens to participate in civic life and democratic processes through education, technology and intercultural learning. The organisation brings together professionals from diverse fields including IT, education, social sciences, and project management.',
    'CIP has coordinated and participated in more than 80 Erasmus+, Horizon and CERV projects. Key areas include digital education, social inclusion, cultural heritage, entrepreneurship and AI in education. The team develops innovative digital tools, training methodologies, and open educational resources (OER), with extensive experience in project design, implementation, financial management, dissemination, and quality assurance.',
    1, 1
  ]);

  await pool.query('INSERT INTO org_eu_projects (id, organization_id, programme, year, project_id_or_contract, role, beneficiary_name) VALUES (?,?,?,?,?,?,?)',
    [uuid(), orgCIP, 'Erasmus +', 2016, '2016-1-CY01-KA104-017192', 'applicant', 'Citizens In Power']);
  await pool.query('INSERT INTO org_eu_projects (id, organization_id, programme, year, project_id_or_contract, role, beneficiary_name) VALUES (?,?,?,?,?,?,?)',
    [uuid(), orgCIP, 'Erasmus +', 2017, '2017-1-CY01-KA104-026628', 'applicant', 'Citizens In Power']);

  await pool.query('INSERT INTO org_key_staff (id, organization_id, name, skills_summary) VALUES (?,?,?,?)',
    [uuid(), orgCIP, 'Christiana Koundouri', 'Founder & Executive Director. PhD in Education. 15+ years coordinating EU-funded projects. Expert in digital education, social inclusion, and intercultural learning.']);
  await pool.query('INSERT INTO org_key_staff (id, organization_id, name, skills_summary) VALUES (?,?,?,?)',
    [uuid(), orgCIP, 'Marcos Guillen', 'Project Manager. MSc in International Relations. 10 years experience in Erasmus+ KA2 partnerships. Specialist in quality assurance and financial reporting.']);

  await pool.query('INSERT INTO org_stakeholders (id, organization_id, related_org_id, entity_name, relationship_type, description) VALUES (?,?,?,?,?,?)',
    [uuid(), orgCIP, orgPC, 'Permacultura Cantabria', 'Project partner', 'Partner in multiple KA1 and KA2 Erasmus+ projects since 2016']);

  // ── 3. Culture Goes Europe (Germany) ──────────────────────
  const orgCGE = uuid();
  await pool.query(`INSERT INTO organizations (
    id, organization_name, legal_name_national, legal_name_latin,
    acronym, org_type, pic, foundation_date,
    country, region, city, address, post_code, website, email, telephone1,
    is_public_body, is_non_profit, description, activities_experience, has_eu_projects, is_public
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    orgCGE,
    'Culture Goes Europe', 'Culture Goes Europe - Soziokulturelle Initiative e.V.', 'Culture Goes Europe',
    'CGE', 'NGO', '932617074', '2008-06-01',
    'Germany', 'Sachsen-Anhalt', 'Magdeburg', 'Thiemstrasse 12', '39104',
    'www.culturegoeseurope.eu', 'info@culturegoeseurope.eu', '+4915773428956',
    0, 1,
    'Culture Goes Europe (CGE) is a socio-cultural initiative based in Magdeburg, Germany, founded in 2008 to support international youth exchange, intercultural learning and civic participation. CGE works at the intersection of culture, education and social innovation, providing non-formal education opportunities. CGE is a hosting, sending and coordinating organisation for the European Solidarity Corps.',
    'CGE has coordinated more than 30 EU-funded projects under Erasmus+ KA1, KA2 and KA3, as well as ESC volunteering projects. Key competences: intercultural youth work, non-formal education, civic education and democratic participation, media literacy, rural development and community building. Strong networks in Eastern Europe and the Western Balkans.',
    1, 1
  ]);

  await pool.query('INSERT INTO org_eu_projects (id, organization_id, programme, year, project_id_or_contract, role, beneficiary_name) VALUES (?,?,?,?,?,?,?)',
    [uuid(), orgCGE, 'Erasmus +', 2017, '2017-1-DE02-KA104-003881', 'applicant', 'Culture Goes Europe']);
  await pool.query('INSERT INTO org_eu_projects (id, organization_id, programme, year, project_id_or_contract, role, beneficiary_name) VALUES (?,?,?,?,?,?,?)',
    [uuid(), orgCGE, 'Erasmus +', 2018, '2018-2-DE04-KA105-016432', 'applicant', 'Culture Goes Europe']);

  await pool.query('INSERT INTO org_key_staff (id, organization_id, name, skills_summary) VALUES (?,?,?,?)',
    [uuid(), orgCGE, 'Tobias Dreissig', 'Founder & Director. MA in Cultural Sciences. 15+ years in international youth work and non-formal education. Certified trainer for Council of Europe and SALTO-YOUTH.']);

  // Cross-stakeholders
  await pool.query('INSERT INTO org_stakeholders (id, organization_id, related_org_id, entity_name, relationship_type, description) VALUES (?,?,?,?,?,?)',
    [uuid(), orgCGE, orgPC, 'Permacultura Cantabria', 'Project partner', 'Collaborated in KA1 mobility project 2017-1-DE02-KA104-003881']);
  await pool.query('INSERT INTO org_stakeholders (id, organization_id, related_org_id, entity_name, relationship_type, description) VALUES (?,?,?,?,?,?)',
    [uuid(), orgCGE, orgCIP, 'Citizens In Power', 'Network member', 'Joint member of Mediterranean Youth Network']);

  // Stakeholders for Permacultura Cantabria
  await pool.query('INSERT INTO org_stakeholders (id, organization_id, related_org_id, entity_name, relationship_type, description) VALUES (?,?,?,?,?,?)',
    [uuid(), orgPC, orgCIP, 'Citizens In Power', 'Project partner', 'Partner in multiple Erasmus+ projects since 2016']);
  await pool.query('INSERT INTO org_stakeholders (id, organization_id, related_org_id, entity_name, relationship_type, description) VALUES (?,?,?,?,?,?)',
    [uuid(), orgPC, orgCGE, 'Culture Goes Europe', 'Project partner', 'Collaborated in KA1 mobility and adult education projects']);
  await pool.query('INSERT INTO org_stakeholders (id, organization_id, entity_name, relationship_type, description) VALUES (?,?,?,?,?)',
    [uuid(), orgPC, 'Gobierno de Cantabria', 'Institutional', 'Public institution — collaboration on rural development and youth programmes']);

  console.log('Seed complete!');
  console.log('  Permacultura Cantabria:', orgPC);
  console.log('  Citizens In Power:', orgCIP);
  console.log('  Culture Goes Europe:', orgCGE);
  process.exit();
}

run().catch(e => { console.error('Seed error:', e.message); process.exit(1); });
