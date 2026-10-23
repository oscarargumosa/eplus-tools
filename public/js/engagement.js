/* ═══════════════════════════════════════════════════════════════
   Engagement — analítica conductual (TASK-009), admin-only, read-only
   Lee /v1/events/engagement y pinta KPIs + secciones + interés + leads.
   Separado de Data E+ (Admin): aquí no se cargan datos, solo se miran.
   Por defecto muestra solo la gente de fuera: el equipo (cuentas de
   casa y sus dispositivos) y los robots van aparte (events/model.js).
   ═══════════════════════════════════════════════════════════════ */

const Engagement = (() => {
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const locale = () => ((window.I18N && I18N.lang) === 'en' ? 'en-GB' : 'es');
  const num = n => Number(n || 0).toLocaleString(locale());
  let origen = 'fuera';
  let bound = false;

  function fmtSecs(s) {
    s = Number(s) || 0;
    if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm';
    if (s >= 60)   return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return s + 's';
  }

  // Pista del dispositivo a partir del user-agent: «Móvil · Safari».
  function device(ua) {
    ua = String(ua || '');
    if (!ua) return '—';
    const kind = /iPad|Tablet/i.test(ua) ? _t('Tableta')
      : /Mobile|iPhone|Android/i.test(ua) ? _t('Móvil') : _t('Ordenador');
    const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' // i18n-no
      : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''; // i18n-no
    return browser ? `${kind} · ${browser}` : kind;
  }

  function originsLine(rows) {
    const by = {};
    (rows || []).forEach(r => { by[r.origen] = Number(r.visitors) || 0; });
    return _t('Visitantes: {fuera} de fuera · {casa} del equipo · {robot} robots', {
      fuera: num(by.fuera), casa: num(by.casa), robot: num(by.robot),
    });
  }

  function bind() {
    if (bound) return;
    const sel = document.getElementById('eng-origen');
    if (!sel) return;
    bound = true;
    sel.value = origen;
    sel.addEventListener('change', () => { origen = sel.value; init(); });
  }

  async function init() {
    bind();
    const kpis = document.getElementById('eng-kpis');
    if (kpis) kpis.innerHTML = `<div class="col-span-full text-sm text-on-surface-variant py-6 text-center">${esc(_t('Cargando…'))}</div>`;
    try {
      const res = await API.get('/events/engagement?origen=' + encodeURIComponent(origen));
      const d = res.data || res;
      const s = d.summary || {};

      const origEl = document.getElementById('eng-origins');
      if (origEl) origEl.textContent = originsLine(d.byOrigin);

      const card = (label, val) => `
        <div class="rounded-2xl bg-cream p-4">
          <div class="text-3xl font-light text-primary tabular-nums leading-none">${val}</div>
          <div class="text-[11px] uppercase tracking-wide text-on-surface-variant mt-1">${esc(label)}</div>
        </div>`;
      if (kpis) kpis.innerHTML =
        card(_t('Eventos'), num(s.total)) +
        card(_t('Visitantes'), num(s.devices)) +
        card(_t('Sesiones'), num(s.sessions)) +
        card(_t('Últimos 7 días'), num(s.last7d));

      const secEl = document.getElementById('eng-sections');
      if (secEl) secEl.innerHTML = (d.sections || []).length
        ? d.sections.map(r => `
            <tr class="border-t border-outline-variant/20">
              <td class="px-3 py-2 font-medium">${esc(r.route)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${Number(r.views || 0)}</td>
              <td class="px-3 py-2 text-right tabular-nums text-on-surface-variant">${fmtSecs(r.secs)}</td>
            </tr>`).join('')
        : `<tr><td colspan="3" class="px-3 py-4 text-center text-on-surface-variant">${esc(_t('Sin datos aún'))}</td></tr>`;

      const chip = (label, n, cls) => `
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cls}">
          ${esc(label)} <span class="tabular-nums opacity-70">${n}</span></span>`;
      const progEl = document.getElementById('eng-programmes');
      if (progEl) progEl.innerHTML = (d.programmes || []).length
        ? d.programmes.map(p => chip(p.programme, p.n, 'bg-lavender-soft text-primary')).join('')
        : `<span class="text-xs text-on-surface-variant">${esc(_t('Nadie ha abierto una convocatoria todavía'))}</span>`;

      const gateEl = document.getElementById('eng-gates');
      if (gateEl) gateEl.innerHTML = (d.gates || []).length
        ? d.gates.map(g => chip(g.route || '—', g.n, 'bg-secondary-fixed/40 text-primary')).join('')
        : `<span class="text-xs text-on-surface-variant">${esc(_t('Ningún muro disparado'))}</span>`;

      const tag = { casa: _t('equipo'), robot: _t('robot'), fuera: _t('de fuera') };
      const when = v => (v ? String(v).replace('T', ' ').slice(0, 16) : '—');
      const visEl = document.getElementById('eng-visitors');
      if (visEl) visEl.innerHTML = (d.visitors || []).length
        ? d.visitors.map(v => {
            const who = v.user_id
              ? `<div class="font-medium">${esc(v.name || '')}</div><div class="text-[11px] text-on-surface-variant break-all">${esc(v.email || '')}</div>`
              : `<span class="font-mono text-[11px] text-on-surface-variant">${esc(String(v.who || '').slice(0, 8))}…</span>`;
            const type = (v.user_id
              ? `<span class="text-primary font-semibold">${esc(_t('con cuenta'))}</span>`
              : `<span class="text-on-surface-variant">${esc(_t('invitado'))}</span>`)
              + (origen === 'todo' ? ` <span class="text-[10px] uppercase text-on-surface-variant">${esc(tag[v.origen] || '')}</span>` : '');
            return `
            <tr class="border-t border-outline-variant/20">
              <td class="px-3 py-2">${who}</td>
              <td class="px-3 py-2 whitespace-nowrap">${type}</td>
              <td class="px-3 py-2 whitespace-nowrap text-on-surface-variant" title="${esc(v.ua || '')}">${esc(device(v.ua))}</td>
              <td class="px-3 py-2 text-right tabular-nums">${Number(v.events || 0)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${Number(v.sections || 0)}</td>
              <td class="px-3 py-2 text-right tabular-nums">${fmtSecs(v.secs)}</td>
              <td class="px-3 py-2 whitespace-nowrap text-on-surface-variant" title="${esc(_t('Primera vez: {fecha}', { fecha: when(v.first_seen) }))}">${when(v.last_seen)}</td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="7" class="px-3 py-4 text-center text-on-surface-variant">${esc(_t('Sin visitantes aún'))}</td></tr>`;
    } catch (e) {
      if (kpis) kpis.innerHTML = `<div class="col-span-full text-sm text-error py-6 text-center">${esc(_t('Error: {mensaje}', { mensaje: e.message || '' }))}</div>`;
    }
  }

  return { init };
})();
