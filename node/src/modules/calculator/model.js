const db = require('../../utils/db');
const genUUID = require('../../utils/uuid');

// ============ PARTNER RATES ============

async function getPartnerRates(projectId) {
  const sql = `
    SELECT pr.id, pr.partner_id, pr.accommodation_rate, pr.subsistence_rate,
           p.name as partner_name
    FROM partner_rates pr
    JOIN partners p ON p.id = pr.partner_id
    WHERE p.project_id = ?
    ORDER BY p.name
  `;
  const [rows] = await db.execute(sql, [projectId, projectId]);
  return rows;
}

async function updatePartnerRate(id, { accommodation_rate, subsistence_rate }) {
  const sql = `
    UPDATE partner_rates
    SET accommodation_rate = ?, subsistence_rate = ?, updated_at = NOW()
    WHERE id = ?
  `;
  await db.execute(sql, [accommodation_rate, subsistence_rate, id]);

  // Return updated fields
  const [rows] = await db.execute(
    'SELECT id, accommodation_rate, subsistence_rate, updated_at FROM partner_rates WHERE id = ?',
    [id]
  );
  return rows[0];
}

// ============ WORKER RATES ============

async function getWorkerRates(projectId) {
  const sql = `
    SELECT wr.id, wr.partner_id, wr.category, wr.rate,
           p.name as partner_name
    FROM worker_rates wr
    JOIN partners p ON p.id = wr.partner_id
    WHERE p.project_id = ?
    ORDER BY p.name, wr.category
  `;
  const [rows] = await db.execute(sql, [projectId]);
  return rows;
}

async function updateWorkerRate(id, { rate }) {
  const sql = `
    UPDATE worker_rates
    SET rate = ?, updated_at = NOW()
    WHERE id = ?
  `;
  await db.execute(sql, [rate, id]);

  const [rows] = await db.execute(
    'SELECT id, rate, updated_at FROM worker_rates WHERE id = ?',
    [id]
  );
  return rows[0];
}

// ============ ROUTES ============

async function getRoutes(projectId) {
  const sql = `
    SELECT id, project_id, endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate, distance_band
    FROM routes
    WHERE project_id = ?
    ORDER BY created_at
  `;
  const [rows] = await db.execute(sql, [projectId]);
  return rows;
}

async function createRoute(projectId, { endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate, distance_band }) {
  const id = genUUID();
  const sql = `
    INSERT INTO routes (id, project_id, endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate, distance_band, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  await db.execute(sql, [id, projectId, endpoint_a, endpoint_b, distance_km, eco_travel || 0, custom_rate || null, distance_band || null]);

  const [rows] = await db.execute(
    'SELECT id, endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate, distance_band, created_at, updated_at FROM routes WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function updateRoute(id, { endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate, distance_band }) {
  const updates = [];
  const params = [];

  if (endpoint_a !== undefined) {
    updates.push('endpoint_a = ?');
    params.push(endpoint_a);
  }
  if (endpoint_b !== undefined) {
    updates.push('endpoint_b = ?');
    params.push(endpoint_b);
  }
  if (distance_km !== undefined) {
    updates.push('distance_km = ?');
    params.push(distance_km);
  }
  if (eco_travel !== undefined) {
    updates.push('eco_travel = ?');
    params.push(eco_travel);
  }
  if (custom_rate !== undefined) {
    updates.push('custom_rate = ?');
    params.push(custom_rate);
  }
  if (distance_band !== undefined) {
    updates.push('distance_band = ?');
    params.push(distance_band);
  }

  if (updates.length === 0) return null;

  updates.push('updated_at = NOW()');
  params.push(id);

  const sql = `UPDATE routes SET ${updates.join(', ')} WHERE id = ?`;
  await db.execute(sql, params);

  const [rows] = await db.execute(
    'SELECT id, endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate, distance_band, updated_at FROM routes WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function deleteRoute(id) {
  await db.execute('DELETE FROM routes WHERE id = ?', [id]);
}

// ============ EXTRA DESTINATIONS ============

async function getExtraDestinations(projectId) {
  const sql = `
    SELECT id, project_id, name, country, accommodation_rate, subsistence_rate
    FROM extra_destinations
    WHERE project_id = ?
    ORDER BY created_at
  `;
  const [rows] = await db.execute(sql, [projectId]);
  return rows;
}

async function createExtraDestination(projectId, { name, country, accommodation_rate, subsistence_rate }) {
  const id = genUUID();
  const sql = `
    INSERT INTO extra_destinations (id, project_id, name, country, accommodation_rate, subsistence_rate, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  await db.execute(sql, [id, projectId, name, country, accommodation_rate, subsistence_rate]);

  const [rows] = await db.execute(
    'SELECT id, name, country, accommodation_rate, subsistence_rate, created_at, updated_at FROM extra_destinations WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function updateExtraDestination(id, { name, country, accommodation_rate, subsistence_rate }) {
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (country !== undefined) {
    updates.push('country = ?');
    params.push(country);
  }
  if (accommodation_rate !== undefined) {
    updates.push('accommodation_rate = ?');
    params.push(accommodation_rate);
  }
  if (subsistence_rate !== undefined) {
    updates.push('subsistence_rate = ?');
    params.push(subsistence_rate);
  }

  if (updates.length === 0) return null;

  updates.push('updated_at = NOW()');
  params.push(id);

  const sql = `UPDATE extra_destinations SET ${updates.join(', ')} WHERE id = ?`;
  await db.execute(sql, params);

  const [rows] = await db.execute(
    'SELECT id, name, country, accommodation_rate, subsistence_rate, updated_at FROM extra_destinations WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function deleteExtraDestination(id) {
  await db.execute('DELETE FROM extra_destinations WHERE id = ?', [id]);
}

// ============ WORK PACKAGES ============

async function getWorkPackages(projectId) {
  const sql = `
    SELECT id, project_id, order_index, code, title, summary, category, leader_id
    FROM work_packages
    WHERE project_id = ?
    ORDER BY order_index
  `;
  const [rows] = await db.execute(sql, [projectId]);
  return rows;
}

async function createWorkPackage(projectId, { title, summary, category, leader_id }) {
  // Get next order_index
  const [maxOrder] = await db.execute(
    'SELECT MAX(order_index) as max_order FROM work_packages WHERE project_id = ?',
    [projectId]
  );
  const nextOrder = (maxOrder[0]?.max_order || 0) + 1;
  const code = 'WP' + nextOrder;

  const id = genUUID();
  const sql = `
    INSERT INTO work_packages (id, project_id, order_index, code, title, summary, category, leader_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  await db.execute(sql, [id, projectId, nextOrder, code, title, summary || null, category, leader_id]);

  const [rows] = await db.execute(
    'SELECT id, order_index, code, title, summary, category, leader_id, created_at, updated_at FROM work_packages WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function updateWorkPackage(id, { title, summary, category, leader_id, order_index }) {
  const updates = [];
  const params = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (summary !== undefined) {
    updates.push('summary = ?');
    params.push(summary);
  }
  if (category !== undefined) {
    updates.push('category = ?');
    params.push(category);
  }
  if (leader_id !== undefined) {
    updates.push('leader_id = ?');
    params.push(leader_id);
  }
  if (order_index !== undefined) {
    updates.push('order_index = ?');
    params.push(order_index);
  }

  if (updates.length === 0) return null;

  updates.push('updated_at = NOW()');
  params.push(id);

  const sql = `UPDATE work_packages SET ${updates.join(', ')} WHERE id = ?`;
  await db.execute(sql, params);

  const [rows] = await db.execute(
    'SELECT id, code, title, summary, category, leader_id, order_index, updated_at FROM work_packages WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function deleteWorkPackage(id) {
  // Delete all activities in this WP (which cascades to details)
  await db.execute('DELETE FROM activities WHERE wp_id = ?', [id]);
  await db.execute('DELETE FROM work_packages WHERE id = ?', [id]);
}

// ============ ACTIVITIES ============

async function getActivities(wpId) {
  const sql = `
    SELECT id, wp_id, type, label, order_index
    FROM activities
    WHERE wp_id = ?
    ORDER BY order_index
  `;
  const [rows] = await db.execute(sql, [wpId]);
  return rows;
}

async function createActivity(wpId, { type, label }) {
  // Get WP to find project_id
  const [wpRows] = await db.execute('SELECT project_id FROM work_packages WHERE id = ?', [wpId]);
  if (!wpRows.length) throw new Error('WP not found');

  // Get next order_index
  const [maxOrder] = await db.execute(
    'SELECT MAX(order_index) as max_order FROM activities WHERE wp_id = ?',
    [wpId]
  );
  const nextOrder = (maxOrder[0]?.max_order || 0) + 1;

  const id = genUUID();
  const sql = `
    INSERT INTO activities (id, wp_id, type, label, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  `;
  await db.execute(sql, [id, wpId, type, label, nextOrder]);

  const [rows] = await db.execute(
    'SELECT id, wp_id, type, label, order_index, created_at, updated_at FROM activities WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function updateActivity(id, { type, label, order_index }) {
  const updates = [];
  const params = [];

  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (label !== undefined) {
    updates.push('label = ?');
    params.push(label);
  }
  if (order_index !== undefined) {
    updates.push('order_index = ?');
    params.push(order_index);
  }

  if (updates.length === 0) return null;

  updates.push('updated_at = NOW()');
  params.push(id);

  const sql = `UPDATE activities SET ${updates.join(', ')} WHERE id = ?`;
  await db.execute(sql, params);

  const [rows] = await db.execute(
    'SELECT id, type, label, order_index, updated_at FROM activities WHERE id = ?',
    [id]
  );
  return rows[0];
}

async function deleteActivity(id) {
  // Get activity type to know which detail tables to clean
  const [actRows] = await db.execute('SELECT type FROM activities WHERE id = ?', [id]);
  if (!actRows.length) throw new Error('Activity not found');

  const type = actRows[0].type;

  // Delete detail records based on type
  switch (type) {
    case 'mgmt':
      await db.execute('DELETE FROM activity_management_partners WHERE activity_id = ?', [id]);
      await db.execute('DELETE FROM activity_management WHERE activity_id = ?', [id]);
      break;
    case 'meeting':
    case 'ltta':
      await db.execute('DELETE FROM activity_mobility_participants WHERE activity_id = ?', [id]);
      await db.execute('DELETE FROM activity_mobility WHERE activity_id = ?', [id]);
      break;
    case 'io':
      await db.execute('DELETE FROM activity_intellectual_outputs WHERE activity_id = ?', [id]);
      break;
    case 'me':
      await db.execute('DELETE FROM activity_multiplier_events WHERE activity_id = ?', [id]);
      break;
    case 'local_ws':
      await db.execute('DELETE FROM activity_local_workshops WHERE activity_id = ?', [id]);
      break;
    case 'campaign':
      await db.execute('DELETE FROM activity_campaigns WHERE activity_id = ?', [id]);
      break;
    case 'website':
    case 'artistic':
    case 'extraordinary':
    case 'equipment':
    case 'consumables':
    case 'other':
      await db.execute('DELETE FROM activity_generic_costs WHERE activity_id = ?', [id]);
      break;
  }

  // Delete activity itself
  await db.execute('DELETE FROM activities WHERE id = ?', [id]);
}

// ============ ACTIVITY DETAILS ============

async function getActivityDetail(activityId) {
  const [actRows] = await db.execute(
    'SELECT id, type FROM activities WHERE id = ?',
    [activityId]
  );

  if (!actRows.length) throw new Error('Activity not found');

  const type = actRows[0].type;
  const detail = { activity_id: activityId, type };

  switch (type) {
    case 'mgmt': {
      const [mgmt] = await db.execute(
        'SELECT id, activity_id, rate_applicant, rate_partner FROM activity_management WHERE activity_id = ?',
        [activityId]
      );
      const [partners] = await db.execute(
        'SELECT activity_id, partner_id, active FROM activity_management_partners WHERE activity_id = ?',
        [activityId]
      );
      detail.management = mgmt[0] || null;
      detail.partners = partners;
      break;
    }
    case 'meeting':
    case 'ltta': {
      const [mob] = await db.execute(
        'SELECT id, activity_id, host_partner_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax FROM activity_mobility WHERE activity_id = ?',
        [activityId]
      );
      const [participants] = await db.execute(
        'SELECT activity_id, partner_id, active FROM activity_mobility_participants WHERE activity_id = ?',
        [activityId]
      );
      detail.mobility = mob[0] || null;
      detail.participants = participants;
      break;
    }
    case 'io': {
      const [io] = await db.execute(
        'SELECT id, activity_id, partner_id, days, worker_category FROM activity_intellectual_outputs WHERE activity_id = ?',
        [activityId]
      );
      detail.intellectual_outputs = io;
      break;
    }
    case 'me': {
      const [me] = await db.execute(
        'SELECT id, activity_id, partner_id, active, local_pax, intl_pax, local_rate, intl_rate FROM activity_multiplier_events WHERE activity_id = ?',
        [activityId]
      );
      detail.multiplier_events = me;
      break;
    }
    case 'local_ws': {
      const [ws] = await db.execute(
        'SELECT id, activity_id, partner_id, active, participants, sessions, cost_per_pax FROM activity_local_workshops WHERE activity_id = ?',
        [activityId]
      );
      detail.local_workshops = ws;
      break;
    }
    case 'campaign': {
      const [camp] = await db.execute(
        'SELECT id, activity_id, partner_id, active, monthly_amount, months, cpm FROM activity_campaigns WHERE activity_id = ?',
        [activityId]
      );
      detail.campaigns = camp;
      break;
    }
    case 'website':
    case 'artistic':
    case 'extraordinary':
    case 'equipment':
    case 'consumables':
    case 'other': {
      const [generic] = await db.execute(
        'SELECT id, activity_id, partner_id, active, note, amount, project_pct, lifetime_pct FROM activity_generic_costs WHERE activity_id = ?',
        [activityId]
      );
      detail.generic_costs = generic;
      break;
    }
  }

  return detail;
}

async function createActivityDetail(activityId, data) {
  const [actRows] = await db.execute(
    'SELECT type FROM activities WHERE id = ?',
    [activityId]
  );

  if (!actRows.length) throw new Error('Activity not found');

  const type = actRows[0].type;

  switch (type) {
    case 'mgmt': {
      const { rate_applicant, rate_partner } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_management (id, activity_id, rate_applicant, rate_partner, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, rate_applicant, rate_partner]
      );
      const [rows] = await db.execute(
        'SELECT id, rate_applicant, rate_partner FROM activity_management WHERE id = ?',
        [id]
      );
      return rows[0];
    }
    case 'meeting':
    case 'ltta': {
      const { host_partner_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_mobility (id, activity_id, host_partner_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, host_partner_id, host_active || 0, pax_per_partner, duration_days, local_pax || 0, local_transport || 0, mat_cost_per_pax || null]
      );
      const [rows] = await db.execute(
        'SELECT id, host_partner_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax FROM activity_mobility WHERE id = ?',
        [id]
      );
      return rows[0];
    }
    case 'io': {
      const { partner_id, days, worker_category } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_intellectual_outputs (id, activity_id, partner_id, days, worker_category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, partner_id, days, worker_category]
      );
      const [rows] = await db.execute(
        'SELECT id, partner_id, days, worker_category FROM activity_intellectual_outputs WHERE id = ?',
        [id]
      );
      return rows[0];
    }
    case 'me': {
      const { partner_id, active, local_pax, intl_pax, local_rate, intl_rate } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_multiplier_events (id, activity_id, partner_id, active, local_pax, intl_pax, local_rate, intl_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, partner_id, active || 0, local_pax, intl_pax, local_rate, intl_rate]
      );
      const [rows] = await db.execute(
        'SELECT id, partner_id, active, local_pax, intl_pax, local_rate, intl_rate FROM activity_multiplier_events WHERE id = ?',
        [id]
      );
      return rows[0];
    }
    case 'local_ws': {
      const { partner_id, active, participants, sessions, cost_per_pax } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_local_workshops (id, activity_id, partner_id, active, participants, sessions, cost_per_pax, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, partner_id, active || 0, participants, sessions, cost_per_pax]
      );
      const [rows] = await db.execute(
        'SELECT id, partner_id, active, participants, sessions, cost_per_pax FROM activity_local_workshops WHERE id = ?',
        [id]
      );
      return rows[0];
    }
    case 'campaign': {
      const { partner_id, active, monthly_amount, months, cpm } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_campaigns (id, activity_id, partner_id, active, monthly_amount, months, cpm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, partner_id, active || 0, monthly_amount, months, cpm]
      );
      const [rows] = await db.execute(
        'SELECT id, partner_id, active, monthly_amount, months, cpm FROM activity_campaigns WHERE id = ?',
        [id]
      );
      return rows[0];
    }
    case 'website':
    case 'artistic':
    case 'extraordinary':
    case 'equipment':
    case 'consumables':
    case 'other': {
      const { partner_id, active, note, amount, project_pct, lifetime_pct } = data;
      const id = genUUID();
      await db.execute(
        'INSERT INTO activity_generic_costs (id, activity_id, partner_id, active, note, amount, project_pct, lifetime_pct, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [id, activityId, partner_id, active || 0, note, amount, project_pct || null, lifetime_pct || null]
      );
      const [rows] = await db.execute(
        'SELECT id, partner_id, active, note, amount, project_pct, lifetime_pct FROM activity_generic_costs WHERE id = ?',
        [id]
      );
      return rows[0];
    }
  }
}

async function updateActivityDetail(activityId, detailId, data) {
  const [actRows] = await db.execute(
    'SELECT type FROM activities WHERE id = ?',
    [activityId]
  );

  if (!actRows.length) throw new Error('Activity not found');

  const type = actRows[0].type;

  switch (type) {
    case 'mgmt': {
      const { rate_applicant, rate_partner } = data;
      const updates = [];
      const params = [];
      if (rate_applicant !== undefined) {
        updates.push('rate_applicant = ?');
        params.push(rate_applicant);
      }
      if (rate_partner !== undefined) {
        updates.push('rate_partner = ?');
        params.push(rate_partner);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_management SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, rate_applicant, rate_partner, updated_at FROM activity_management WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
    case 'meeting':
    case 'ltta': {
      const { host_partner_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax } = data;
      const updates = [];
      const params = [];
      if (host_partner_id !== undefined) {
        updates.push('host_partner_id = ?');
        params.push(host_partner_id);
      }
      if (host_active !== undefined) {
        updates.push('host_active = ?');
        params.push(host_active);
      }
      if (pax_per_partner !== undefined) {
        updates.push('pax_per_partner = ?');
        params.push(pax_per_partner);
      }
      if (duration_days !== undefined) {
        updates.push('duration_days = ?');
        params.push(duration_days);
      }
      if (local_pax !== undefined) {
        updates.push('local_pax = ?');
        params.push(local_pax);
      }
      if (local_transport !== undefined) {
        updates.push('local_transport = ?');
        params.push(local_transport);
      }
      if (mat_cost_per_pax !== undefined) {
        updates.push('mat_cost_per_pax = ?');
        params.push(mat_cost_per_pax);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_mobility SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, host_partner_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax, updated_at FROM activity_mobility WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
    case 'io': {
      const { days, worker_category } = data;
      const updates = [];
      const params = [];
      if (days !== undefined) {
        updates.push('days = ?');
        params.push(days);
      }
      if (worker_category !== undefined) {
        updates.push('worker_category = ?');
        params.push(worker_category);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_intellectual_outputs SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, days, worker_category, updated_at FROM activity_intellectual_outputs WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
    case 'me': {
      const { local_pax, intl_pax, local_rate, intl_rate, active } = data;
      const updates = [];
      const params = [];
      if (local_pax !== undefined) {
        updates.push('local_pax = ?');
        params.push(local_pax);
      }
      if (intl_pax !== undefined) {
        updates.push('intl_pax = ?');
        params.push(intl_pax);
      }
      if (local_rate !== undefined) {
        updates.push('local_rate = ?');
        params.push(local_rate);
      }
      if (intl_rate !== undefined) {
        updates.push('intl_rate = ?');
        params.push(intl_rate);
      }
      if (active !== undefined) {
        updates.push('active = ?');
        params.push(active);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_multiplier_events SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, local_pax, intl_pax, local_rate, intl_rate, active, updated_at FROM activity_multiplier_events WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
    case 'local_ws': {
      const { participants, sessions, cost_per_pax, active } = data;
      const updates = [];
      const params = [];
      if (participants !== undefined) {
        updates.push('participants = ?');
        params.push(participants);
      }
      if (sessions !== undefined) {
        updates.push('sessions = ?');
        params.push(sessions);
      }
      if (cost_per_pax !== undefined) {
        updates.push('cost_per_pax = ?');
        params.push(cost_per_pax);
      }
      if (active !== undefined) {
        updates.push('active = ?');
        params.push(active);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_local_workshops SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, participants, sessions, cost_per_pax, active, updated_at FROM activity_local_workshops WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
    case 'campaign': {
      const { monthly_amount, months, cpm, active } = data;
      const updates = [];
      const params = [];
      if (monthly_amount !== undefined) {
        updates.push('monthly_amount = ?');
        params.push(monthly_amount);
      }
      if (months !== undefined) {
        updates.push('months = ?');
        params.push(months);
      }
      if (cpm !== undefined) {
        updates.push('cpm = ?');
        params.push(cpm);
      }
      if (active !== undefined) {
        updates.push('active = ?');
        params.push(active);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_campaigns SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, monthly_amount, months, cpm, active, updated_at FROM activity_campaigns WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
    case 'website':
    case 'artistic':
    case 'extraordinary':
    case 'equipment':
    case 'consumables':
    case 'other': {
      const { note, amount, project_pct, lifetime_pct, active } = data;
      const updates = [];
      const params = [];
      if (note !== undefined) {
        updates.push('note = ?');
        params.push(note);
      }
      if (amount !== undefined) {
        updates.push('amount = ?');
        params.push(amount);
      }
      if (project_pct !== undefined) {
        updates.push('project_pct = ?');
        params.push(project_pct);
      }
      if (lifetime_pct !== undefined) {
        updates.push('lifetime_pct = ?');
        params.push(lifetime_pct);
      }
      if (active !== undefined) {
        updates.push('active = ?');
        params.push(active);
      }
      if (updates.length === 0) return null;
      updates.push('updated_at = NOW()');
      params.push(detailId);
      const sql = `UPDATE activity_generic_costs SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(sql, params);
      const [rows] = await db.execute(
        'SELECT id, note, amount, project_pct, lifetime_pct, active, updated_at FROM activity_generic_costs WHERE id = ?',
        [detailId]
      );
      return rows[0];
    }
  }
}

// ============ BUDGET SUMMARY ============

function getTravelBandRate(distanceKm, ecoTravel) {
  const km = parseInt(distanceKm);

  if (km >= 10 && km <= 99) return 23;
  if (km >= 100 && km <= 499) return ecoTravel ? 210 : 180;
  if (km >= 500 && km <= 1999) return ecoTravel ? 320 : 275;
  if (km >= 2000 && km <= 2999) return ecoTravel ? 410 : 360;
  if (km >= 3000 && km <= 3999) return ecoTravel ? 610 : 530;
  if (km >= 4000 && km <= 7999) return 820;
  if (km >= 8000) return 1500;

  return 0;
}

async function getBudgetSummary(projectId) {
  // Get all WPs
  const [wps] = await db.execute(
    'SELECT id, code, title FROM work_packages WHERE project_id = ? ORDER BY order_index',
    [projectId]
  );

  const budgetByWp = {};
  const costCategories = {
    travel: 0,
    accommodation: 0,
    subsistence: 0,
    management: 0,
    intellectual_outputs: 0,
    multiplier_events: 0,
    local_workshops: 0,
    campaigns: 0,
    generic: 0
  };

  for (const wp of wps) {
    budgetByWp[wp.id] = {
      code: wp.code,
      title: wp.title,
      total: 0,
      breakdown: {}
    };

    // Get activities in this WP
    const [acts] = await db.execute(
      'SELECT id, type FROM activities WHERE wp_id = ?',
      [wp.id]
    );

    for (const act of acts) {
      let actCost = 0;

      switch (act.type) {
        case 'meeting':
        case 'ltta': {
          // Travel + mobility per diem
          const [mob] = await db.execute(
            'SELECT pax_per_partner, duration_days FROM activity_mobility WHERE activity_id = ?',
            [act.id]
          );

          if (mob.length > 0) {
            const m = mob[0];
            const paxPerPartner = m.pax_per_partner || 0;
            const days = m.duration_days || 0;

            // Get all routes used in this activity (simplified: count all routes in project)
            const [routes] = await db.execute(
              'SELECT distance_km, eco_travel FROM routes WHERE project_id = ?',
              [projectId]
            );

            let travelCost = 0;
            for (const route of routes) {
              const rate = getTravelBandRate(route.distance_km, route.eco_travel);
              travelCost += rate * paxPerPartner * 2; // Return trip
            }
            costCategories.travel += travelCost;
            actCost += travelCost;

            // Per diem (accommodation + subsistence) per partner
            const [partners] = await db.execute(
              'SELECT partner_id FROM activity_mobility_participants WHERE activity_id = ? AND active = 1',
              [act.id]
            );

            for (const p of partners) {
              const [pr] = await db.execute(
                'SELECT accommodation_rate, subsistence_rate FROM partner_rates WHERE partner_id = ?',
                [p.partner_id]
              );
              if (pr.length > 0) {
                const perDiem = (pr[0].accommodation_rate || 0) + (pr[0].subsistence_rate || 0);
                const cost = perDiem * days * paxPerPartner;
                costCategories.accommodation += (pr[0].accommodation_rate || 0) * days * paxPerPartner;
                costCategories.subsistence += (pr[0].subsistence_rate || 0) * days * paxPerPartner;
                actCost += cost;
              }
            }
          }
          break;
        }

        case 'mgmt': {
          // Management costs
          const [mgmt] = await db.execute(
            'SELECT rate_applicant, rate_partner FROM activity_management WHERE activity_id = ?',
            [act.id]
          );

          if (mgmt.length > 0) {
            const cost = (mgmt[0].rate_applicant || 0) + (mgmt[0].rate_partner || 0);
            costCategories.management += cost;
            actCost += cost;
          }
          break;
        }

        case 'io': {
          // IO costs: days × worker_rate
          const [ios] = await db.execute(
            'SELECT partner_id, days, worker_category FROM activity_intellectual_outputs WHERE activity_id = ?',
            [act.id]
          );

          for (const io of ios) {
            const [wr] = await db.execute(
              'SELECT rate FROM worker_rates WHERE partner_id = ? AND category = ?',
              [io.partner_id, io.worker_category]
            );
            if (wr.length > 0) {
              const cost = (wr[0].rate || 0) * (io.days || 0);
              costCategories.intellectual_outputs += cost;
              actCost += cost;
            }
          }
          break;
        }

        case 'me': {
          // Multiplier events
          const [mes] = await db.execute(
            'SELECT local_pax, intl_pax, local_rate, intl_rate FROM activity_multiplier_events WHERE activity_id = ? AND active = 1',
            [act.id]
          );

          for (const me of mes) {
            const cost = (me.local_pax || 0) * (me.local_rate || 0) + (me.intl_pax || 0) * (me.intl_rate || 0);
            costCategories.multiplier_events += cost;
            actCost += cost;
          }
          break;
        }

        case 'local_ws': {
          // Local workshops
          const [wss] = await db.execute(
            'SELECT participants, sessions, cost_per_pax FROM activity_local_workshops WHERE activity_id = ? AND active = 1',
            [act.id]
          );

          for (const ws of wss) {
            const cost = (ws.participants || 0) * (ws.sessions || 0) * (ws.cost_per_pax || 0);
            costCategories.local_workshops += cost;
            actCost += cost;
          }
          break;
        }

        case 'campaign': {
          // Campaigns
          const [camps] = await db.execute(
            'SELECT monthly_amount, months FROM activity_campaigns WHERE activity_id = ? AND active = 1',
            [act.id]
          );

          for (const camp of camps) {
            const cost = (camp.monthly_amount || 0) * (camp.months || 0);
            costCategories.campaigns += cost;
            actCost += cost;
          }
          break;
        }

        case 'website':
        case 'artistic':
        case 'extraordinary':
        case 'equipment':
        case 'consumables':
        case 'other': {
          // Generic costs
          const [generics] = await db.execute(
            'SELECT amount FROM activity_generic_costs WHERE activity_id = ? AND active = 1',
            [act.id]
          );

          for (const gen of generics) {
            const cost = gen.amount || 0;
            costCategories.generic += cost;
            actCost += cost;
          }
          break;
        }
      }

      budgetByWp[wp.id].total += actCost;
    }
  }

  const totalBudget = Object.values(costCategories).reduce((a, b) => a + b, 0);

  return {
    total_budget: totalBudget,
    by_cost_category: costCategories,
    by_work_package: Object.values(budgetByWp)
  };
}

module.exports = {
  getPartnerRates,
  updatePartnerRate,
  getWorkerRates,
  updateWorkerRate,
  getRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  getExtraDestinations,
  createExtraDestination,
  updateExtraDestination,
  deleteExtraDestination,
  getWorkPackages,
  createWorkPackage,
  updateWorkPackage,
  deleteWorkPackage,
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getActivityDetail,
  createActivityDetail,
  updateActivityDetail,
  getBudgetSummary,
  saveFullState,
  loadFullState
};

// ============ BULK SAVE / LOAD ============

async function saveFullState(projectId, data) {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // Get partner IDs for this project
    const [partners] = await conn.execute(
      'SELECT id FROM partners WHERE project_id = ?', [projectId]
    );
    const partnerIds = partners.map(p => p.id);

    // 0. Snapshot de campos que SOLO toca el Writer/Developer y que el
    //    DELETE+INSERT siguiente machacaría si no los preservamos.
    //    Bug raíz: el state del Designer no incluye summary/objectives/
    //    description (esos son del Writer); al re-aprobar Diseñar el
    //    INSERT los ponía a NULL y se perdía el trabajo del Writer.
    const wpPreserveByOrder = {};
    const actPreserveByTypeLabel = {};   // primary key: wp_order|type|label|subtype
    const actPreserveByPosition = {};    // fallback key: wp_order|act_order
    {
      const [existingWPs] = await conn.execute(
        'SELECT id, order_index, summary, objectives, duration_from_month, duration_to_month FROM work_packages WHERE project_id = ? ORDER BY order_index',
        [projectId]
      );
      for (const wp of existingWPs) {
        wpPreserveByOrder[wp.order_index] = {
          summary: wp.summary,
          objectives: wp.objectives,
          duration_from_month: wp.duration_from_month,
          duration_to_month: wp.duration_to_month,
        };
      }
      if (existingWPs.length) {
        const wpIds = existingWPs.map(w => w.id);
        const wpPh = wpIds.map(() => '?').join(',');
        const [existingActs] = await conn.execute(
          `SELECT a.id, a.wp_id, a.type, a.label, a.subtype, a.description, a.order_index, w.order_index AS wp_order
           FROM activities a JOIN work_packages w ON w.id = a.wp_id
           WHERE w.project_id = ?
           ORDER BY w.order_index, a.order_index`,
          [projectId]
        );
        for (const a of existingActs) {
          if (!a.description) continue;
          const kTL = `${a.wp_order}|${a.type}|${a.label || ''}|${a.subtype || ''}`;
          const kPos = `${a.wp_order}|${a.order_index}`;
          if (!(kTL in actPreserveByTypeLabel)) actPreserveByTypeLabel[kTL] = a.description;
          if (!(kPos in actPreserveByPosition)) actPreserveByPosition[kPos] = a.description;
        }
      }
    }

    // 1. Delete existing data (reverse dependency order)
    if (partnerIds.length) {
      const ph = partnerIds.map(() => '?').join(',');
      // Activity details depend on activities which depend on WPs
      const [existingWPs] = await conn.execute(
        'SELECT id FROM work_packages WHERE project_id = ?', [projectId]
      );
      if (existingWPs.length) {
        const wpIds = existingWPs.map(w => w.id);
        const wpPh = wpIds.map(() => '?').join(',');
        const [existingActs] = await conn.execute(
          `SELECT id, type FROM activities WHERE wp_id IN (${wpPh})`, wpIds
        );
        for (const act of existingActs) {
          await deleteActivityDetails(conn, act.id, act.type);
        }
        await conn.execute(`DELETE FROM activities WHERE wp_id IN (${wpPh})`, wpIds);
      }
      await conn.execute('DELETE FROM work_packages WHERE project_id = ?', [projectId]);
      await conn.execute(`DELETE FROM worker_rates WHERE partner_id IN (${ph})`, partnerIds);
      await conn.execute(`DELETE FROM partner_rates WHERE partner_id IN (${ph})`, partnerIds);
    }
    await conn.execute('DELETE FROM routes WHERE project_id = ?', [projectId]);
    await conn.execute('DELETE FROM extra_destinations WHERE project_id = ?', [projectId]);

    // 2. Insert partner rates
    if (data.partnerRates) {
      for (const [pid, rates] of Object.entries(data.partnerRates)) {
        if (!partnerIds.includes(pid)) continue;
        await conn.execute(
          'INSERT INTO partner_rates (id, partner_id, accommodation_rate, subsistence_rate) VALUES (?, ?, ?, ?)',
          [genUUID(), pid, rates.aloj || 0, rates.mant || 0]
        );
      }
    }

    // 3. Insert worker rates
    if (data.workerRates && data.workerRates.length) {
      for (const wr of data.workerRates) {
        if (!partnerIds.includes(wr.pid)) continue;
        await conn.execute(
          'INSERT INTO worker_rates (id, partner_id, category, rate) VALUES (?, ?, ?, ?)',
          [genUUID(), wr.pid, wr.category || '', wr.rate || 0]
        );
      }
    }

    // 4. Insert extra destinations FIRST (antes que routes) — necesitamos el
    //    mapping { frontendId(_edN) → dbUuid } para traducir los endpoints
    //    de las routes que apuntan a extra_dests (ej. Brussels Event).
    const extraDestIdMap = {};
    if (data.extraDests && data.extraDests.length) {
      let edIdx = 0;
      for (const ed of data.extraDests) {
        if (!ed.name) continue;
        const newId = genUUID();
        extraDestIdMap[ed.id] = newId;
        await conn.execute(
          'INSERT INTO extra_destinations (id, project_id, name, country, accommodation_rate, subsistence_rate, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [newId, projectId, ed.name, ed.country || null, ed.aloj || 0, ed.mant || 0, edIdx]
        );
        edIdx++;
      }
    }

    // 5. Insert routes — el frontend genera el key con routeKey(a,b) =
    //    (a<b ? a+'_'+b : b+'_'+a). Si un endpoint es '_edN' (extra_dest)
    //    aparece primero porque '_' < '0-9a-f'. Entonces key='_edN_UUID'.
    //    Un split('_') ingenuo daría ['', 'edN', 'UUID'] y rompe todo.
    //
    //    Parser robusto: identifica los dos endpoints sabiendo que un
    //    endpoint válido es o un UUID (36 chars con 4 guiones) o '_edN'.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const EDN_RE  = /^_?ed\d+$/i;
    function isValidEndpoint(s) { return !!s && (UUID_RE.test(s) || EDN_RE.test(s)); }
    function parseRouteKey(key) {
      for (let i = 1; i < key.length - 1; i++) {
        if (key[i] !== '_') continue;
        const a = key.substring(0, i);
        const b = key.substring(i + 1);
        if (isValidEndpoint(a) && isValidEndpoint(b)) return [a, b];
      }
      return null;
    }
    function translateEndpoint(ep) {
      if (!ep) return null;
      if (UUID_RE.test(ep)) return ep;                      // partner UUID — tal cual
      if (extraDestIdMap[ep]) return extraDestIdMap[ep];    // _edN exacto
      if (extraDestIdMap['_' + ep]) return extraDestIdMap['_' + ep]; // edN → _edN
      if (ep.startsWith('_') && extraDestIdMap[ep.slice(1)]) return extraDestIdMap[ep.slice(1)];
      return null;
    }
    if (data.routes) {
      for (const [key, route] of Object.entries(data.routes)) {
        const parsed = parseRouteKey(key);
        if (!parsed) continue; // key malformada → descarta
        const a = translateEndpoint(parsed[0]);
        const b = translateEndpoint(parsed[1]);
        if (!a || !b) continue;
        await conn.execute(
          'INSERT INTO routes (id, project_id, endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [genUUID(), projectId, a, b, route.km || 0, route.green ? 1 : 0, route.custom_rate != null ? route.custom_rate : null]
        );
      }
    }

    // 6. Insert work packages + activities + details
    if (data.wps && data.wps.length) {
      for (let wi = 0; wi < data.wps.length; wi++) {
        const wp = data.wps[wi];
        const wpId = genUUID();
        // Preservar campos del Writer si el state del Designer no los trae.
        // El Designer no incluye summary/objectives/duration_*; sin esto se
        // perdería el trabajo del Writer al re-aprobar Diseñar.
        const preserved = wpPreserveByOrder[wi] || {};
        const finalSummary    = (wp.summary    != null && wp.summary    !== '') ? wp.summary    : (preserved.summary    || null);
        // objectives y duration_* hoy no se insertan aquí (mantenemos lo que
        // ya hay en BD): para eso movemos a UPDATE tras el INSERT.
        await conn.execute(
          'INSERT INTO work_packages (id, project_id, order_index, code, title, summary, category, leader_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [wpId, projectId, wi, `WP${wi + 1}`, wp.name || wp.desc || `WP${wi + 1}`, finalSummary, wp._cat || null, wp.leader || null]
        );
        // Restaurar también objectives + duration_* si los teníamos
        if (preserved.objectives != null || preserved.duration_from_month != null || preserved.duration_to_month != null) {
          await conn.execute(
            'UPDATE work_packages SET objectives = ?, duration_from_month = ?, duration_to_month = ? WHERE id = ?',
            [preserved.objectives || null, preserved.duration_from_month, preserved.duration_to_month, wpId]
          );
        }

        if (wp.activities && wp.activities.length) {
          for (let ai = 0; ai < wp.activities.length; ai++) {
            const act = wp.activities[ai];
            const actId = genUUID();
            // Preservar description de actividades: match primero por
            // (wp_order, type, label, subtype) y fallback por (wp_order, position).
            let preservedDesc = null;
            if (!act.desc) {
              const kTL = `${wi}|${act.type}|${act.label || ''}|${act.subtype || ''}`;
              const kPos = `${wi}|${ai}`;
              preservedDesc = actPreserveByTypeLabel[kTL] || actPreserveByPosition[kPos] || null;
            }
            const finalDesc = (act.desc != null && act.desc !== '') ? act.desc : preservedDesc;
            await conn.execute(
              `INSERT INTO activities (id, wp_id, type, label, subtype, description, date_start, date_end, online, order_index, gantt_start_month, gantt_end_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [actId, wpId, act.type, act.label || '', act.subtype || null, finalDesc,
               act.date_start || null, act.date_end || null, act.online ? 1 : 0, ai,
               act._gantt_start || null, act._gantt_end || null]
            );
            await insertActivityDetails(conn, actId, act, partnerIds, extraDestIdMap);
          }
        }
      }
    }

    await conn.commit();
    console.log(`[saveFullState] ${projectId} OK — ${data.wps?.length || 0} WPs, ${data.wps?.reduce((s, w) => s + (w.activities?.length || 0), 0) || 0} activities`);
  } catch (err) {
    await conn.rollback();
    console.error(`[saveFullState] ${projectId} ROLLBACK — ${err.code || ''}: ${err.message}`);
    throw err;
  } finally {
    conn.release();
  }
}

async function deleteActivityDetails(conn, actId, type) {
  switch (type) {
    case 'mgmt':
      await conn.execute('DELETE FROM activity_management_partners WHERE activity_id = ?', [actId]);
      await conn.execute('DELETE FROM activity_management WHERE activity_id = ?', [actId]);
      break;
    case 'meeting': case 'ltta':
      await conn.execute('DELETE FROM activity_mobility_participants WHERE activity_id = ?', [actId]);
      await conn.execute('DELETE FROM activity_mobility WHERE activity_id = ?', [actId]);
      break;
    case 'io':
      await conn.execute('DELETE FROM activity_intellectual_outputs WHERE activity_id = ?', [actId]);
      break;
    case 'me':
      await conn.execute('DELETE FROM activity_multiplier_events WHERE activity_id = ?', [actId]);
      break;
    case 'local_ws':
      await conn.execute('DELETE FROM activity_local_workshops WHERE activity_id = ?', [actId]);
      break;
    case 'campaign':
      await conn.execute('DELETE FROM activity_campaigns WHERE activity_id = ?', [actId]);
      break;
    default:
      await conn.execute('DELETE FROM activity_generic_costs WHERE activity_id = ?', [actId]);
      break;
  }
}

async function insertActivityDetails(conn, actId, act, partnerIds, extraDestIdMap = {}) {
  // partnerIds = valid partner IDs for this project (used to filter FK references)
  const validPid = pid => !partnerIds || partnerIds.includes(pid);

  switch (act.type) {
    case 'mgmt': {
      await conn.execute(
        'INSERT INTO activity_management (id, activity_id, rate_applicant, rate_partner) VALUES (?, ?, ?, ?)',
        [genUUID(), actId, act.rate_applicant || 0, act.rate_partner || 0]
      );
      break;
    }
    case 'meeting': case 'ltta': {
      // Host can be either a partner uuid or an extra_destination frontend id (_edN).
      const isPartner = act.host && validPid(act.host);
      const extraDestUuid = act.host && extraDestIdMap[act.host];
      if (!isPartner && !extraDestUuid) {
        console.warn(`[saveFullState] activity ${act.label}: host '${act.host}' is neither a valid partner nor a known extra_destination, skipping mobility details`);
        break;
      }
      await conn.execute(
        'INSERT INTO activity_mobility (id, activity_id, host_partner_id, host_extra_dest_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [genUUID(), actId,
         isPartner ? act.host : null,
         isPartner ? null : extraDestUuid,
         act.host_active !== false ? 1 : 0,
         act.pax || 2, act.days || 3, act.local_pax || 0, act.local_transport || 0, act.mat_cost || 0]
      );
      // Participant toggles — only valid partner IDs
      if (act.participants) {
        for (const [pid, active] of Object.entries(act.participants)) {
          if (!validPid(pid)) { console.warn(`[saveFullState] skipping participant '${pid}' — not a valid partner`); continue; }
          await conn.execute(
            'INSERT INTO activity_mobility_participants (activity_id, partner_id, active) VALUES (?, ?, ?)',
            [actId, pid, active !== false ? 1 : 0]
          );
        }
      }
      break;
    }
    case 'io': {
      if (act.io_staff) {
        for (const [pid, ps] of Object.entries(act.io_staff)) {
          if (!ps.active || !validPid(pid)) continue;
          for (const s of (ps.staff || [])) {
            await conn.execute(
              'INSERT INTO activity_intellectual_outputs (id, activity_id, partner_id, days, worker_category) VALUES (?, ?, ?, ?, ?)',
              [genUUID(), actId, pid, s.days || 0, s.profileId || null]
            );
          }
        }
      }
      break;
    }
    case 'me': {
      if (act.me_events) {
        for (const [pid, ev] of Object.entries(act.me_events)) {
          if (!validPid(pid)) continue;
          await conn.execute(
            'INSERT INTO activity_multiplier_events (id, activity_id, partner_id, active, local_pax, intl_pax, local_rate, intl_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [genUUID(), actId, pid, ev.active ? 1 : 0, ev.local_pax || 0, ev.intl_pax || 0, ev.local_rate || 0, ev.intl_rate || 0]
          );
        }
      }
      break;
    }
    case 'local_ws': {
      if (act.ws_partners) {
        for (const [pid, w] of Object.entries(act.ws_partners)) {
          if (!validPid(pid)) continue;
          await conn.execute(
            'INSERT INTO activity_local_workshops (id, activity_id, partner_id, active, participants, sessions, cost_per_pax) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [genUUID(), actId, pid, w.active ? 1 : 0, w.ws_pax || 0, w.ws_n || 0, w.ws_cost || 0]
          );
        }
      }
      break;
    }
    case 'campaign': {
      if (act.camp_partners) {
        for (const [pid, c] of Object.entries(act.camp_partners)) {
          if (!validPid(pid)) continue;
          await conn.execute(
            'INSERT INTO activity_campaigns (id, activity_id, partner_id, active, monthly_amount, months) VALUES (?, ?, ?, ?, ?, ?)',
            [genUUID(), actId, pid, c.active ? 1 : 0, c.monthly || 0, c.months || 0]
          );
        }
      }
      break;
    }
    default: { // website, artistic, equipment, goods, consumables, other
      if (act.note_partners) {
        for (const [pid, np] of Object.entries(act.note_partners)) {
          if (!validPid(pid)) continue;
          await conn.execute(
            'INSERT INTO activity_generic_costs (id, activity_id, partner_id, active, note, amount, project_pct, lifetime_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [genUUID(), actId, pid, np.active ? 1 : 0, np.note || null, np.amount || 0, np.project_pct || null, np.lifetime_pct || null]
          );
        }
      }
      break;
    }
  }
}

async function loadFullState(projectId) {
  // Get partners
  const [partners] = await db.execute(
    'SELECT id, name, city, country, role, order_index FROM partners WHERE project_id = ? ORDER BY order_index', [projectId]
  );
  if (!partners.length) return null;

  const partnerIds = partners.map(p => p.id);
  const ph = partnerIds.map(() => '?').join(',');

  // Partner rates
  const [prRows] = await db.execute(
    `SELECT partner_id, accommodation_rate, subsistence_rate FROM partner_rates WHERE partner_id IN (${ph})`, partnerIds
  );
  const partnerRates = {};
  for (const r of prRows) {
    partnerRates[r.partner_id] = { aloj: Number(r.accommodation_rate), mant: Number(r.subsistence_rate) };
  }

  // Worker rates
  const [wrRows] = await db.execute(
    `SELECT partner_id, category, rate FROM worker_rates WHERE partner_id IN (${ph}) ORDER BY partner_id, category`, partnerIds
  );
  const workerRates = wrRows.map(r => ({ pid: r.partner_id, category: r.category, rate: Number(r.rate) }));

  // Routes
  const [routeRows] = await db.execute(
    'SELECT endpoint_a, endpoint_b, distance_km, eco_travel, custom_rate FROM routes WHERE project_id = ?', [projectId]
  );
  const routes = {};
  for (const r of routeRows) {
    const key = r.endpoint_a < r.endpoint_b ? r.endpoint_a + '_' + r.endpoint_b : r.endpoint_b + '_' + r.endpoint_a;
    routes[key] = { km: r.distance_km || 0, green: !!r.eco_travel, custom_rate: r.custom_rate != null ? Number(r.custom_rate) : null };
  }

  // Extra destinations — preservamos el uuid de BD para poder mapear host_extra_dest_id
  // al _edN del state. El frontend identifica cada extra_dest por su posición (_ed0, _ed1...).
  // Ordenamos por order_index (migración 102) para garantizar el mismo orden que en el save.
  const [edRows] = await db.execute(
    'SELECT id, name, country, accommodation_rate, subsistence_rate FROM extra_destinations WHERE project_id = ? ORDER BY order_index, id', [projectId]
  );
  // db_id es el uuid real en BD — el frontend lo necesita para traducir
  // las keys de routes (que en BD usan el uuid pero en el state usan _edN).
  const extraDests = edRows.map(r => ({ db_id: r.id, name: r.name, country: r.country || '', aloj: Number(r.accommodation_rate), mant: Number(r.subsistence_rate) }));
  // El frontend hidrata extraDests con id '_ed1', '_ed2', ... (ver calculator.js:2901
  // donde map (ed, i) => '_ed' + (i + 1)), empieza en 1, no en 0. Aquí seguimos esa
  // convención para que el dropdown encuentre el match al renderizar.
  const extraDestUuidToEdN = {};
  edRows.forEach((r, idx) => { extraDestUuidToEdN[r.id] = `_ed${idx + 1}`; });

  // Work packages + activities + details
  const [wpRows] = await db.execute(
    'SELECT id, order_index, code, title, summary, category, leader_id FROM work_packages WHERE project_id = ? ORDER BY order_index', [projectId]
  );

  const wps = [];
  for (const wp of wpRows) {
    const [actRows] = await db.execute(
      'SELECT id, type, label, subtype, description, date_start, date_end, online, order_index, gantt_start_month, gantt_end_month FROM activities WHERE wp_id = ? ORDER BY order_index', [wp.id]
    );
    const activities = [];
    for (const act of actRows) {
      const a = {
        type: act.type,
        label: act.label,
        subtype: act.subtype || undefined,
        desc: act.description || '',
        date_start: act.date_start ? act.date_start.toISOString().split('T')[0] : undefined,
        date_end: act.date_end ? act.date_end.toISOString().split('T')[0] : undefined,
        online: !!act.online,
        _gantt_start: act.gantt_start_month || null,
        _gantt_end: act.gantt_end_month || null,
      };
      // Load type-specific details
      await loadActivityDetails(a, act.id, act.type, extraDestUuidToEdN);
      activities.push(a);
    }
    wps.push({
      name: wp.title,
      desc: wp.title,
      summary: wp.summary || '',
      leader: wp.leader_id,
      _cat: wp.category || undefined,
      activities
    });
  }

  return { partnerRates, workerRates, routes, extraDests, wps };
}

async function loadActivityDetails(a, actId, type, extraDestUuidToEdN = {}) {
  switch (type) {
    case 'mgmt': {
      const [rows] = await db.execute('SELECT rate_applicant, rate_partner FROM activity_management WHERE activity_id = ?', [actId]);
      if (rows[0]) { a.rate_applicant = Number(rows[0].rate_applicant); a.rate_partner = Number(rows[0].rate_partner); }
      break;
    }
    case 'meeting': case 'ltta': {
      const [rows] = await db.execute('SELECT host_partner_id, host_extra_dest_id, host_active, pax_per_partner, duration_days, local_pax, local_transport, mat_cost_per_pax FROM activity_mobility WHERE activity_id = ?', [actId]);
      if (rows[0]) {
        // Host puede ser un partner uuid o un extra_destination uuid. Si es extra_dest,
        // lo mapeamos al _edN que el frontend espera. Si por algún motivo el uuid no
        // está en el mapa (extra_dest borrado tras el save), devolvemos null para que
        // el frontend no intente referenciar algo inexistente.
        if (rows[0].host_extra_dest_id) {
          a.host = extraDestUuidToEdN[rows[0].host_extra_dest_id] || null;
        } else {
          a.host = rows[0].host_partner_id;
        }
        a.pax = rows[0].pax_per_partner; a.days = rows[0].duration_days;
        a.local_pax = rows[0].local_pax; a.local_transport = Number(rows[0].local_transport); a.mat_cost = Number(rows[0].mat_cost_per_pax);
      }
      const [parts] = await db.execute('SELECT partner_id, active FROM activity_mobility_participants WHERE activity_id = ?', [actId]);
      if (parts.length) { a.participants = {}; for (const p of parts) a.participants[p.partner_id] = !!p.active; }
      break;
    }
    case 'io': {
      const [rows] = await db.execute('SELECT partner_id, days, worker_category FROM activity_intellectual_outputs WHERE activity_id = ?', [actId]);
      if (rows.length) {
        a.io_staff = {};
        for (const r of rows) {
          if (!a.io_staff[r.partner_id]) a.io_staff[r.partner_id] = { active: true, staff: [] };
          a.io_staff[r.partner_id].staff.push({ days: r.days, profileId: r.worker_category });
        }
      }
      break;
    }
    case 'me': {
      const [rows] = await db.execute('SELECT partner_id, active, local_pax, intl_pax, local_rate, intl_rate FROM activity_multiplier_events WHERE activity_id = ?', [actId]);
      if (rows.length) {
        a.me_events = {};
        for (const r of rows) a.me_events[r.partner_id] = { active: !!r.active, local_pax: r.local_pax, intl_pax: r.intl_pax, local_rate: Number(r.local_rate), intl_rate: Number(r.intl_rate) };
      }
      break;
    }
    case 'local_ws': {
      const [rows] = await db.execute('SELECT partner_id, active, participants, sessions, cost_per_pax FROM activity_local_workshops WHERE activity_id = ?', [actId]);
      if (rows.length) {
        a.ws_partners = {};
        for (const r of rows) a.ws_partners[r.partner_id] = { active: !!r.active, ws_pax: r.participants, ws_n: r.sessions, ws_cost: Number(r.cost_per_pax) };
      }
      break;
    }
    case 'campaign': {
      const [rows] = await db.execute('SELECT partner_id, active, monthly_amount, months FROM activity_campaigns WHERE activity_id = ?', [actId]);
      if (rows.length) {
        a.camp_partners = {};
        for (const r of rows) a.camp_partners[r.partner_id] = { active: !!r.active, monthly: Number(r.monthly_amount), months: r.months };
      }
      break;
    }
    default: {
      const [rows] = await db.execute('SELECT partner_id, active, note, amount, project_pct, lifetime_pct FROM activity_generic_costs WHERE activity_id = ?', [actId]);
      if (rows.length) {
        a.note_partners = {};
        for (const r of rows) a.note_partners[r.partner_id] = { active: !!r.active, note: r.note, amount: Number(r.amount), project_pct: r.project_pct ? Number(r.project_pct) : null, lifetime_pct: r.lifetime_pct ? Number(r.lifetime_pct) : null };
      }
      break;
    }
  }
}
