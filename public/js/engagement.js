/* ═══════════════════════════════════════════════════════════════
   Engagement — analítica conductual (TASK-009), admin-only, read-only
   Lee /v1/events/engagement y pinta KPIs + secciones + interés + leads.
   Separado de Data E+ (Admin): aquí no se cargan datos, solo se miran.
   ═══════════════════════════════════════════════════════════════ */

const Engagement = (() => {
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function fmtSecs(s) {
    s = Number(s) || 0;
    if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm';
    if (s >= 60)   return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return s + 's';
  }

  async function init() {
    const kpis = document.getElementById('eng-kpis');
    if (kpis) kpis.innerHTML = '<div class="col-span-full text-sm text-on-surface-variant py-6 text-center">Cargando…</div>';
    try {
      const res = await API.get('/events/engagement');
      const d = res.data || res;
      const s = d.summary || {};

      const card = (label, val) => `
        <div class="rounded-xl border border-outline-variant/30 bg-white p-4">
          <div class="text-2xl font-black text-primary tabular-nums">${val}</div>
          <div class="text-[11px] uppercase tracking-wide text-on-surface-variant mt-1">${label}</div>
        </div>`;
      if (kpis) kpis.innerHTML =
        card('Eventos', Number(s.total || 0).toLocaleString('es')) +
        card('Visitantes', Number(s.devices || 0).toLocaleString('es')) +
        card('Sesiones', Number(s.sessions || 0).toLocaleString('es')) +
        card('Últimos 7 días', Number(s.last7d || 0).toLocaleString('es'));

      const secEl = document.getElementById('eng-sections');
      if (secEl) secEl.innerHTML = (d.sections || []).length
        ? d.sections.map(r => `
            <tr class="border-t border-outline-variant/20">
              <td class="px-3 py-2 font-medium">${esc(r.route)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${Number(r.views || 0)}</td>
              <td class="px-3 py-2 text-right tabular-nums text-on-surface-variant">${fmtSecs(r.secs)}</td>
            </tr>`).join('')
        : '<tr><td colspan="3" class="px-3 py-4 text-center text-on-surface-variant">Sin datos aún</td></tr>';

      const chip = (label, n, cls) => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cls}">
          ${esc(label)} <span class="tabular-nums opacity-70">${n}</span></span>`;
      const progEl = document.getElementById('eng-programmes');
      if (progEl) progEl.innerHTML = (d.programmes || []).length
        ? d.programmes.map(p => chip(p.programme, p.n, 'bg-primary/10 text-primary')).join('')
        : '<span class="text-xs text-on-surface-variant">Nadie ha abierto una convocatoria todavía</span>';

      const gateEl = document.getElementById('eng-gates');
      if (gateEl) gateEl.innerHTML = (d.gates || []).length
        ? d.gates.map(g => chip(g.route || '—', g.n, 'bg-secondary-fixed/40 text-primary')).join('')
        : '<span class="text-xs text-on-surface-variant">Ningún muro disparado</span>';

      const visEl = document.getElementById('eng-visitors');
      if (visEl) visEl.innerHTML = (d.visitors || []).length
        ? d.visitors.map(v => `
            <tr class="border-t border-outline-variant/20">
              <td class="px-3 py-2 font-mono text-[11px] text-on-surface-variant">${esc(String(v.who || '').slice(0, 8))}…</td>
              <td class="px-3 py-2">${Number(v.logged) ? '<span class="text-primary font-semibold">logueado</span>' : '<span class="text-on-surface-variant">invitado</span>'}</td>
              <td class="px-3 py-2 text-right tabular-nums">${Number(v.events || 0)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${Number(v.sections || 0)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${fmtSecs(v.secs)}</td>
              <td class="px-3 py-2 text-on-surface-variant">${v.last_seen ? String(v.last_seen).replace('T', ' ').slice(0, 16) : '—'}</td>
            </tr>`).join('')
        : '<tr><td colspan="6" class="px-3 py-4 text-center text-on-surface-variant">Sin visitantes aún</td></tr>';
    } catch (e) {
      if (kpis) kpis.innerHTML = `<div class="col-span-full text-sm text-error py-6 text-center">Error: ${esc(e.message || '')}</div>`;
    }
  }

  return { init };
})();
