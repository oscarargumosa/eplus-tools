/* ═══════════════════════════════════════════════════════════════
   Mi cuenta → Mis cursos (ruta #account-courses). «Mis cursos» y
   «Mis certificados» de la Academia, como en el aula de Emociona:
   tarjeta con miniatura, barra de progreso, «x/y lecciones · %» y
   «Continuar» a la lección por la que va. API: GET /v1/academia/me.
   ═══════════════════════════════════════════════════════════════ */

const AccountAcademia = (() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = (d) => { try { return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; } };
  const ic = (n, cls = '') => `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${n}</span>`;

  function card(c) {
    const href = c.next ? `/academia/${encodeURIComponent(c.slug)}/${encodeURIComponent(c.next.slug)}` : `/academia/${encodeURIComponent(c.slug)}`;
    const label = c.certificate ? 'Ver el curso' : c.done ? 'Continuar' : 'Empezar';
    return `<article class="bg-white rounded-2xl border border-outline-variant/30 overflow-hidden flex flex-col sm:flex-row">
      ${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" width="320" height="180" loading="lazy" class="w-full sm:w-56 aspect-video sm:aspect-auto object-cover bg-cream">`
        : `<div class="w-full sm:w-56 aspect-video sm:aspect-auto bg-cream flex items-center justify-center">${ic('school', 'text-4xl text-primary/40')}</div>`}
      <div class="p-5 flex-1 min-w-0 flex flex-col gap-2">
        <h3 class="font-bold text-primary text-base leading-snug">${esc(c.title)}</h3>
        ${c.subtitle ? `<p class="text-sm text-on-surface-variant">${esc(c.subtitle)}</p>` : ''}
        <div class="mt-1 h-2 rounded-full bg-cream overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.percent}"
          aria-label="Progreso en ${esc(c.title)}"><span class="block h-full rounded-full bg-primary" style="width:${c.percent}%"></span></div>
        <p class="text-xs text-on-surface-variant">${c.done}/${c.lessons} lecciones · ${c.percent} %${c.certificate ? ' · Certificado obtenido' : ''}</p>
        ${c.next && !c.certificate ? `<p class="text-xs text-on-surface-variant">Siguiente: <b class="text-ink font-semibold">${esc(c.next.code)} · ${esc(c.next.title)}</b></p>` : ''}
        <div class="mt-auto pt-2 flex flex-wrap gap-2">
          <a href="${href}" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-secondary-fixed text-sm font-semibold hover:bg-violet transition-colors">${label} ${ic('arrow_forward', 'text-[18px]')}</a>
          ${c.certificate ? `<a href="/academia/certificado/${encodeURIComponent(c.certificate.serial)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full border border-outline-variant text-primary text-sm font-semibold hover:border-primary transition-colors">${ic('workspace_premium', 'text-[18px]')} Certificado</a>` : ''}
        </div>
      </div></article>`;
  }

  async function init() {
    const box = document.getElementById('acct-academia');
    if (!box) return;
    box.innerHTML = '<div class="h-40 rounded-2xl bg-cream animate-pulse"></div>';
    let data;
    try {
      data = await API.get('/academia/me');
    } catch (e) {
      box.innerHTML = e && e.code === 'AREA_REQUIRED'
        ? `<div class="bg-white rounded-2xl border border-outline-variant/30 p-8 text-center">
            ${ic('school', 'text-4xl text-primary/50')}
            <h2 class="text-base font-bold text-primary mt-2 mb-1">La Academia está en fase beta</h2>
            <p class="text-sm text-on-surface-variant max-w-md mx-auto">Todavía no tienes acceso. Puedes pedirlo desde la Academia.</p>
            <a href="/academia" class="inline-flex mt-4 px-5 py-2.5 rounded-full bg-primary text-secondary-fixed text-sm font-semibold">Ir a la Academia</a></div>`
        : `<p class="text-sm text-error">No se han podido cargar tus cursos. ${esc(e && e.message)}</p>`;
      return;
    }
    const { courses, certificates } = data;
    box.innerHTML = `
      <h2 class="font-headline text-xl font-extrabold text-primary mb-3">Mis cursos</h2>
      ${courses.length ? `<div class="flex flex-col gap-4">${courses.map(card).join('')}</div>`
        : `<div class="bg-white rounded-2xl border border-outline-variant/30 p-8 text-center">
            ${ic('school', 'text-4xl text-primary/50')}
            <p class="text-sm text-on-surface-variant mt-2">Todavía no estás en ningún curso. En la Academia tienes los cursos disponibles.</p>
            <a href="/academia" class="inline-flex mt-4 px-5 py-2.5 rounded-full bg-primary text-secondary-fixed text-sm font-semibold">Ver la Academia</a></div>`}
      <h2 class="font-headline text-xl font-extrabold text-primary mt-10 mb-3">Mis certificados</h2>
      ${certificates.length ? `<ul class="flex flex-col gap-3">${certificates.map(ce => `<li class="bg-white rounded-2xl border border-outline-variant/30 p-5 flex flex-wrap gap-4 items-center">
          <span class="w-11 h-11 rounded-full bg-lavender-soft flex items-center justify-center">${ic('workspace_premium', 'text-primary')}</span>
          <div class="flex-1 min-w-[12rem]"><b class="block text-primary text-sm">${esc(ce.title)}</b>
            <span class="text-xs text-on-surface-variant">A nombre de ${esc(ce.full_name)} · ${esc(day(ce.issued_at))}${ce.hours ? ` · ${ce.hours} horas` : ''} · Nº ${esc(ce.serial)}</span></div>
          <a href="/academia/certificado/${encodeURIComponent(ce.serial)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-outline-variant text-primary text-sm font-semibold hover:border-primary">Ver y descargar</a>
        </li>`).join('')}</ul>`
        : '<p class="text-sm text-on-surface-variant">Cuando completes un curso, tu certificado aparecerá aquí.</p>'}`;
  }

  return { init };
})();
