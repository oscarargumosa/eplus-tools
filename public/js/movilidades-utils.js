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

  // Píldora de plazo: escala de urgencia en la paleta de marca (azul > violeta > lavanda > blanco).
  function deadlinePill(item) {
    const d = daysUntil(item.deadline_iso);
    if (d === null) return '';
    const base = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap';
    if (d < 0)    return `<span class="${base} bg-surface-container-high text-on-surface-variant">${_t('Cerrada')}</span>`;
    if (d === 0)  return `<span class="${base} bg-primary text-white">${_t('Hoy')}</span>`;
    if (d <= 7)   return `<span class="${base} bg-violet text-white">${d === 1 ? _t('Queda {n} día', { n: d }) : _t('Quedan {n} días', { n: d })}</span>`;
    if (d <= 30)  return `<span class="${base} bg-lavender-soft text-primary">${_t('Quedan {n} días', { n: d })}</span>`;
    return         `<span class="${base} bg-white text-on-surface-variant border border-outline-variant">${_t('Quedan {n} días', { n: d })}</span>`;
  }

  // Partes de la fecha para la caja «día grande + mes/año» de la tarjeta.
  function dateParts(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return {
      day:   String(d.getDate()).padStart(2, '0'),
      month: d.toLocaleDateString(I18N.lang === 'en' ? 'en-GB' : 'es-ES', { month: 'short' }),
      year:  String(d.getFullYear()),
    };
  }

  /* ── Coverage parsing ──────────────────────────────────────────────
     Returns { status, short, detail } per dimension (fee/travel/accommodation)
     Paleta de estados (marca EU Funding Studio):
       covered → lima suave  (sin coste para ti)
       partial → lavanda     (reembolso con tope, revisar)
       cost    → blanco/azul (pagas tú)
       na      → crema       (no aplica, p. ej. online)
       unknown → gris cálido (sin datos)
  ─────────────────────────────────────────────────────────────────── */

  function feeCoverage(item) {
    if (item.fee_type === 'free') return { status: 'covered', short: _t('Gratis'), detail: item.fee_text || _t('Sin cuota de participación') };
    if (item.fee_type === 'paid') {
      const amt = item.fee_amount_eur ? `€${item.fee_amount_eur}` : _t('De pago');
      return { status: 'cost', short: amt, detail: item.fee_text || _t('Cuota de participación: {importe}', { importe: amt }) };
    }
    if (item.fee_type === 'mixed') return { status: 'partial', short: _t('Mixta'), detail: item.fee_text || _t('Cuota mixta: revisa los detalles') };
    return { status: 'unknown', short: '?', detail: item.fee_text || _t('Cuota no indicada') };
  }

  function analyseTextCoverage(text) {
    if (!text || text === 'N/A' || !text.trim()) {
      return { status: 'unknown', short: '?', detail: _t('No indicado') };
    }
    const t = text.toLowerCase();

    // Online — no travel/accom needed
    if (/^online\b|^free \(online\)|online activity|this is an online activity/.test(t) ||
        /no accommodation or food is provided.*online/.test(t) ||
        /no travel reimbursement is provided.*online/.test(t)) {
      return { status: 'na', short: _t('En línea'), detail: _t('Actividad en línea: no aplica') };
    }

    // Negative — explicitly NOT covered
    if (/no (travel|accommodation|food|reimbursement)\b.{0,40}(provided|covered|reimburs)/.test(t) ||
        /at (their|your) own (cost|expense)/.test(t) ||
        /\bnot (covered|reimbursed|included|provided)\b/.test(t)) {
      return { status: 'cost', short: _t('No cubierto'), detail: text.slice(0, 200) };
    }

    // Capped / Erasmus+ distance bands → partial
    const hasCap = /distance band|reimbursement limit|up to \d|km:|km –|km -|per participant.*€|cost limit/.test(t);
    const hasAmount = /\d+\s*€|€\s*\d+|\beur\b/.test(t);
    const hasCovered = /covered|reimburs|included|provided|will be covered/.test(t);

    if (hasCap || (hasAmount && hasCovered)) {
      return { status: 'partial', short: _t('Con tope'), detail: text.slice(0, 200) };
    }

    // Positive — fully covered
    if (hasCovered ||
        /all costs|fully covered|free of charge|organi[sz]e.*accommodation|funds of erasmus/.test(t) ||
        /co.financ/.test(t)) {
      return { status: 'covered', short: _t('Cubierto'), detail: text.slice(0, 200) };
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
      covered: 'bg-[#f8ffd9] text-ink border-secondary-fixed',
      partial: 'bg-lavender-soft text-violet border-lavender/40',
      cost:    'bg-white text-primary border-primary/30',
      na:      'bg-cream text-on-surface-variant border-outline-variant',
      unknown: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
    })[status] || 'bg-surface-container-high text-on-surface-variant border-outline-variant';
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
      chip('payments',       _t('Cuota'),           cov.fee,           cov.fee.status),
      chip('flight_takeoff', _t('Viaje'),        cov.travel,        cov.travel.status),
      chip('hotel',          _t('Alojamiento'), cov.accommodation, cov.accommodation.status),
    ].join('');
  }

  /**
   * Inline icon + text for the card meta row (place · date · deadline · fee).
   * Icono relleno; color según estado (azul=gratis, tinta=de pago, gris=sin datos).
   */
  function feeIconInline(item) {
    const f = feeCoverage(item);
    const colors = {
      covered: 'text-primary',
      cost:    'text-ink',
      partial: 'text-violet',
      na:      'text-primary',
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
            class="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-secondary-fixed text-primary text-sm font-bold hover:bg-secondary-fixed-dim transition-colors">
            <span>${_t('Inscribirse en SALTO')}</span>
            <span class="material-symbols-outlined" style="font-size:18px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const moreInfo = item.url
      ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-transparent border border-primary text-primary text-sm font-bold hover:bg-lavender-soft transition-colors">
            <span>${_t('Ver en SALTO')}</span>
            <span class="material-symbols-outlined" style="font-size:16px;line-height:1;">open_in_new</span>
          </a>`
      : '';

    const contact = [item.contact_name, item.contact_email, item.contact_phone]
      .filter(x => x && x !== 'N/A').join(' · ');

    const participants = item.participants_count
      ? (item.participants_countries
        ? _t('{n} de {paises}', { n: item.participants_count, paises: item.participants_countries })
        : String(item.participants_count))
      : item.participants_countries;

    const description = item.description_text
      ? (item.description_text + (item.description_truncated ? '…' : ''))
      : '';

    return `
      <div class="space-y-5">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-primary">${escapeHtml(item.type || _t('Actividad'))}</span>
            ${deadlinePill(item)}
          </div>
          <h2 class="text-xl font-bold text-primary leading-tight pr-12">${escapeHtml(item.title || '')}</h2>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${coverageChips(cov, false)}
        </div>

        ${item.summary ? `<p class="text-sm text-on-surface-variant">${escapeHtml(item.summary)}</p>` : ''}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-cream rounded-2xl">
          ${row(_t('Lugar'), item.location_raw || [item.city, item.country].filter(Boolean).join(', '))}
          ${row(_t('Fechas'), item.dates)}
          ${row(_t('Plazo de inscripción'), item.deadline_raw)}
          ${row(_t('Fecha de selección'), item.selection_date)}
          ${row(_t('Participantes'), participants)}
          ${row(_t('Idiomas de trabajo'), item.working_languages)}
          ${row(_t('Organizador'), `${item.organiser_name || ''}${item.organiser_type ? ' (' + item.organiser_type + ')' : ''}`.trim())}
          ${row(_t('Contacto'), contact)}
        </div>

        ${block(_t('Cuota'), item.fee_text)}
        ${block(_t('Alojamiento y comida'), item.accommodation_food_text)}
        ${block(_t('Reembolso del viaje'), item.travel_reimbursement_text)}
        ${block(_t('Descripción'), description)}

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
    escapeHtml, daysUntil, deadlinePill, dateParts,
    coverageInfo, coverageChips, chipClass, feeIconInline,
    renderDetail, filterAndSort, todayISO,
  };
})();
