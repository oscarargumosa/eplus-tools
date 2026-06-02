/* ═══════════════════════════════════════════════════════════════
   Movilidades — Shared utilities (used by V1 and V2 layouts)
   ═══════════════════════════════════════════════════════════════ */

const MovilidadesUtils = (() => {

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return Math.round((d - today) / 86400000);
  }

  function deadlinePill(item) {
    const d = daysUntil(item.deadline_iso);
    if (d === null) return '';
    if (d < 0)    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 whitespace-nowrap">Closed</span>`;
    if (d === 0)  return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white whitespace-nowrap">Today</span>`;
    if (d <= 7)   return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">${d} day${d === 1 ? '' : 's'} left</span>`;
    if (d <= 30)  return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">${d} days left</span>`;
    return         `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">${d} days left</span>`;
  }

  /* ── Coverage parsing ──────────────────────────────────────────────
     Returns { status, short, detail } per dimension (fee/travel/accommodation)
     Status palette:
       covered → green   (no cost to you)
       partial → amber   (capped reimbursement, must check)
       cost    → red     (you pay)
       na      → blue    (not applicable, e.g. online activity)
       unknown → gray    (no data)
  ─────────────────────────────────────────────────────────────────── */

  function feeCoverage(item) {
    if (item.fee_type === 'free') return { status: 'covered', short: 'Free', detail: item.fee_text || 'No participation fee' };
    if (item.fee_type === 'paid') {
      const amt = item.fee_amount_eur ? `€${item.fee_amount_eur}` : 'Paid';
      return { status: 'cost', short: amt, detail: item.fee_text || `Participation fee: ${amt}` };
    }
    if (item.fee_type === 'mixed') return { status: 'partial', short: 'Mixed', detail: item.fee_text || 'Mixed fee model — check details' };
    return { status: 'unknown', short: '?', detail: item.fee_text || 'Fee model not specified' };
  }

  function analyseTextCoverage(text) {
    if (!text || text === 'N/A' || !text.trim()) {
      return { status: 'unknown', short: '?', detail: 'Not specified' };
    }
    const t = text.toLowerCase();

    // Online — no travel/accom needed
    if (/^online\b|^free \(online\)|online activity|this is an online activity/.test(t) ||
        /no accommodation or food is provided.*online/.test(t) ||
        /no travel reimbursement is provided.*online/.test(t)) {
      return { status: 'na', short: 'Online', detail: 'Online activity — not applicable' };
    }

    // Negative — explicitly NOT covered
    if (/no (travel|accommodation|food|reimbursement)\b.{0,40}(provided|covered|reimburs)/.test(t) ||
        /at (their|your) own (cost|expense)/.test(t) ||
        /\bnot (covered|reimbursed|included|provided)\b/.test(t)) {
      return { status: 'cost', short: 'Not covered', detail: text.slice(0, 200) };
    }

    // Capped / Erasmus+ distance bands → partial
    const hasCap = /distance band|reimbursement limit|up to \d|km:|km –|km -|per participant.*€|cost limit/.test(t);
    const hasAmount = /\d+\s*€|€\s*\d+|\beur\b/.test(t);
    const hasCovered = /covered|reimburs|included|provided|will be covered/.test(t);

    if (hasCap || (hasAmount && hasCovered)) {
      return { status: 'partial', short: 'Capped', detail: text.slice(0, 200) };
    }

    // Positive — fully covered
    if (hasCovered ||
        /all costs|fully covered|free of charge|organi[sz]e.*accommodation|funds of erasmus/.test(t) ||
        /co.financ/.test(t)) {
      return { status: 'covered', short: 'Covered', detail: text.slice(0, 200) };
    }

    return { status: 'unknown', short: '?', detail: text.slice(0, 200) };
  }

  function coverageInfo(item) {
    return {
      fee:           feeCoverage(item),
      travel:        analyseTextCoverage(item.travel_reimbursement_text),
      accommodation: analyseTextCoverage(item.accommodation_food_text),
    };
  }

  function chipClass(status) {
    return ({
      covered: 'bg-green-100 text-green-800 border-green-200',
      partial: 'bg-amber-100 text-amber-900 border-amber-200',
      cost:    'bg-red-100 text-red-700 border-red-200',
      na:      'bg-blue-100 text-blue-700 border-blue-200',
      unknown: 'bg-gray-100 text-gray-500 border-gray-200',
    })[status] || 'bg-gray-100 text-gray-500 border-gray-200';
  }

  /**
   * Render the 3 coverage chips inline (used only in modal detail).
   */
  function coverageChips(cov, compact) {
    const c = compact !== false;
    const chip = (icon, label, info, status) => `
      <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${chipClass(status)} whitespace-nowrap"
        title="${escapeHtml(label)}: ${escapeHtml(info.detail)}">
        <span class="material-symbols-outlined" style="font-size:13px;line-height:1;">${icon}</span>
        ${c ? escapeHtml(info.short) : escapeHtml(label + ' ' + info.short)}
      </span>`;
    return [
      chip('payments',       'Fee',           cov.fee,           cov.fee.status),
      chip('flight_takeoff', 'Travel',        cov.travel,        cov.travel.status),
      chip('hotel',          'Accommodation', cov.accommodation, cov.accommodation.status),
    ].join('');
  }

  /**
   * Inline icon + text for the card meta row (place · date · deadline · fee).
   * Filled icon, color tied to status (green=free, red=paid, gray=unknown).
   */
  function feeIconInline(item) {
    const f = feeCoverage(item);
    const colors = {
      covered: 'text-emerald-700',
      cost:    'text-rose-700',
      partial: 'text-amber-700',
      na:      'text-blue-700',
      unknown: 'text-on-surface-variant',
    };
    const color = colors[f.status] || colors.unknown;
    return `<div class="flex items-center gap-1.5 ${color}" title="${escapeHtml(f.detail)}">
      <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1,'wght' 600">payments</span>
      <span class="font-semibold">${escapeHtml(f.short)}</span>
    </div>`;
  }

  /* ── Detail modal rendering (shared) ──────────────────────────── */

  function row(label, val) {
    if (!val || val === 'N/A') return '';
    return `<div class="flex flex-col gap-0.5">
      <span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">${escapeHtml(label)}</span>
      <span class="text-sm text-on-surface">${escapeHtml(val)}</span>
    </div>`;
  }

  function block(label, val) {
    if (!val || val === 'N/A') return '';
    return `<div>
      <div class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">${escapeHtml(label)}</div>
      <p class="text-sm text-on-surface whitespace-pre-line">${escapeHtml(val)}</p>
    </div>`;
  }

  function renderDetail(item) {
    const cov = coverageInfo(item);

    const apply = item.application_url
      ? `<a href="${escapeHtml(item.application_url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1b1464] text-[#fbff12] text-sm font-bold hover:bg-[#1b1464]/80 transition-colors">
            <span>Apply on SALTO</span>
            <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const moreInfo = item.url
      ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-transparent border border-outline-variant/30 text-on-surface-variant text-sm font-bold hover:bg-[#f8f8f8] transition-colors">
            <span>View on SALTO</span>
            <span class="material-symbols-outlined" style="font-size:16px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const contact = [item.contact_name, item.contact_email, item.contact_phone]
      .filter(x => x && x !== 'N/A').join(' · ');

    const participants = item.participants_count
      ? `${item.participants_count}${item.participants_countries ? ' from ' + item.participants_countries : ''}`
      : item.participants_countries;

    const description = item.description_text
      ? (item.description_text + (item.description_truncated ? '…' : ''))
      : '';

    return `
      <div class="space-y-5">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-primary">${escapeHtml(item.type || 'Activity')}</span>
            ${deadlinePill(item)}
          </div>
          <h2 class="text-xl font-bold text-on-surface leading-tight pr-12">${escapeHtml(item.title || '')}</h2>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${coverageChips(cov, false)}
        </div>

        ${item.summary ? `<p class="text-sm text-on-surface-variant">${escapeHtml(item.summary)}</p>` : ''}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-container-low rounded-xl">
          ${row('Location', item.location_raw || [item.city, item.country].filter(Boolean).join(', '))}
          ${row('Dates', item.dates)}
          ${row('Application deadline', item.deadline_raw)}
          ${row('Selection date', item.selection_date)}
          ${row('Participants', participants)}
          ${row('Working languages', item.working_languages)}
          ${row('Organiser', `${item.organiser_name || ''}${item.organiser_type ? ' (' + item.organiser_type + ')' : ''}`.trim())}
          ${row('Contact', contact)}
        </div>

        ${block('Fee', item.fee_text)}
        ${block('Accommodation & food', item.accommodation_food_text)}
        ${block('Travel reimbursement', item.travel_reimbursement_text)}
        ${block('Description', description)}

        <div class="flex items-center justify-between pt-4 border-t border-outline-variant/20 flex-wrap gap-3">
          <div>${moreInfo}</div>
          <div>${apply}</div>
        </div>
      </div>
    `;
  }

  /* ── Filter / sort helpers ────────────────────────────────────── */

  function filterAndSort(items, state) {
    let out = items.slice();
    const today = todayISO();

    if (!state.includePast) {
      out = out.filter(i => !i.deadline_iso || i.deadline_iso >= today);
    }
    if (state.q) {
      const needle = state.q.toLowerCase();
      out = out.filter(i =>
        [i.title, i.summary, i.country, i.city, i.organiser_name, i.organiser_type, i.type, i.working_languages, i.participants_countries, i.description_text]
          .filter(Boolean).join(' ').toLowerCase().includes(needle)
      );
    }
    if (state.sort === 'deadline') {
      out.sort((a, b) => {
        if (!a.deadline_iso && !b.deadline_iso) return 0;
        if (!a.deadline_iso) return 1;
        if (!b.deadline_iso) return -1;
        return a.deadline_iso.localeCompare(b.deadline_iso);
      });
    } else if (state.sort === 'recent') {
      out.sort((a, b) => (b.enriched_at || '').localeCompare(a.enriched_at || ''));
    } else if (state.sort === 'title') {
      out.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return out;
  }

  return {
    escapeHtml, daysUntil, deadlinePill,
    coverageInfo, coverageChips, chipClass, feeIconInline,
    renderDetail, filterAndSort, todayISO,
  };
})();
