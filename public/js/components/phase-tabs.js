/* ═══════════════════════════════════════════════════════════════
   PhaseTabs — Unified horizontal sub-navigation component
   Single visual pattern for the sub-steps of every phase
   (Diseñar, Escribir, Evaluar). Each phase calls render()
   with its own list of sub-steps and a callback.

   Usage:
     PhaseTabs.render('container-id', {
       tabs:    [{ key, label, icon, status? }],   // status: 'pending'|'in_progress'|'complete'
       activeKey: 'tarifas',
       onSelect: (key) => { ... },
       projectName: 'ARISE',                       // optional, shown above tabs
       onBack: () => location.hash = 'my-projects' // optional back button
     });
     PhaseTabs.setActive('container-id', 'budget');
     PhaseTabs.setStatus('container-id', 'tarifas', 'complete');
   ═══════════════════════════════════════════════════════════════ */

const PhaseTabs = (() => {

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Visual marker per status (○ pending, ◐ in progress, ● complete)
  function statusGlyph(status) {
    if (status === 'complete')    return '<span class="text-emerald-500 text-xs leading-none mr-1" aria-label="completado">●</span>';
    if (status === 'in_progress') return '<span class="text-amber-500 text-xs leading-none mr-1" aria-label="en curso">◐</span>';
    return ''; // pending: no glyph (cleaner default)
  }

  function tabButtonHTML(t, isActive) {
    const base = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap';
    const cls = isActive
      ? `${base} bg-primary text-white shadow-md`
      : `${base} text-on-surface-variant hover:bg-surface-container-low`;
    const icon = t.icon ? `<span class="material-symbols-outlined text-sm">${esc(t.icon)}</span>` : '';
    return `<button type="button" data-phase-tab="${esc(t.key)}" class="${cls}">${statusGlyph(t.status)}${icon} ${esc(t.label)}</button>`;
  }

  function render(containerId, opts) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    const { tabs = [], activeKey = null, onSelect, projectName, onBack } = opts || {};

    const backBtn = onBack
      ? `<button type="button" data-phase-back class="mr-2 text-on-surface-variant hover:text-primary transition-colors shrink-0" title="Volver">
           <span class="material-symbols-outlined text-xl">arrow_back</span>
         </button>`
      : '';
    const projectLabel = projectName
      ? `<span class="font-headline text-sm font-bold text-primary mr-4 truncate max-w-[220px] shrink-0">${esc(projectName)}</span>`
      : '';
    const tabsHTML = tabs.map(t => tabButtonHTML(t, t.key === activeKey)).join('');

    el.innerHTML = `
      <div class="flex items-center gap-1 mb-6 border-b border-outline-variant/30 pb-3 overflow-x-auto" data-phase-tabs-bar>
        ${backBtn}${projectLabel}${tabsHTML}
      </div>`;

    if (typeof onSelect === 'function') {
      el.querySelectorAll('[data-phase-tab]').forEach(btn => {
        btn.addEventListener('click', () => onSelect(btn.dataset.phaseTab));
      });
    }
    if (onBack) {
      el.querySelector('[data-phase-back]')?.addEventListener('click', onBack);
    }
  }

  function setActive(containerId, key) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    el.querySelectorAll('[data-phase-tab]').forEach(btn => {
      const isActive = btn.dataset.phaseTab === key;
      btn.className = isActive
        ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-primary text-white shadow-md'
        : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap text-on-surface-variant hover:bg-surface-container-low';
    });
  }

  function setStatus(containerId, key, status) {
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) return;
    const btn = el.querySelector(`[data-phase-tab="${CSS.escape(key)}"]`);
    if (!btn) return;
    // Re-render glyph slot: remove existing leading status span if any.
    const firstSpan = btn.querySelector('span');
    if (firstSpan && (firstSpan.classList.contains('text-emerald-500') || firstSpan.classList.contains('text-amber-500'))) {
      firstSpan.remove();
    }
    if (status === 'complete' || status === 'in_progress') {
      btn.insertAdjacentHTML('afterbegin', statusGlyph(status));
    }
  }

  return { render, setActive, setStatus };
})();
