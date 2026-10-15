/* ═══════════════════════════════════════════════════════════════
   My Projects — List saved Erasmus+ project proposals
   ═══════════════════════════════════════════════════════════════ */

const MyProjects = (() => {

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(v) {
    if (!v) return '\u2014';
    const s = typeof v === 'string' ? v.slice(0, 10) : '';
    if (!s) return '\u2014';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function init() {
    loadProjects();
    document.getElementById('my-projects-new-btn')?.addEventListener('click', () => {
      if (typeof window.openCreateModal === 'function') window.openCreateModal();
    });
  }

  async function loadProjects() {
    const el = document.getElementById('my-projects-list');
    if (!el) return;
    el.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Cargando proyectos...</p>';

    try {
      const result = await API.get('/intake/projects');
      const projects = Array.isArray(result) ? result : (result.data || result);

      if (!projects || projects.length === 0) {
        el.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <span class="material-symbols-outlined text-6xl text-outline-variant/40 mb-4">folder_off</span>
            <h3 class="font-headline text-lg font-bold text-primary mb-2">No tienes proyectos todavía</h3>
            <p class="text-sm text-on-surface-variant mb-6 max-w-sm">Crea tu primera propuesta Erasmus+ y empieza a trabajar en ella.</p>
            <button type="button" id="my-projects-empty-new"
              class="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim shadow-md transition-all">
              <span class="material-symbols-outlined text-lg">add</span> Crear mi primer proyecto
            </button>
          </div>`;
        document.getElementById('my-projects-empty-new')?.addEventListener('click', () => {
          if (typeof window.openCreateModal === 'function') window.openCreateModal();
        });
        return;
      }

      el.innerHTML = projects.map(p => {
        // Estados: borrador en lavanda, enviado en azul, aprobado en verde (estado «correcto»)
        const statusColors = {
          draft: 'bg-lavender-soft text-violet border-lavender/40',
          submitted: 'bg-primary/10 text-primary border-primary/30',
          approved: 'bg-green-100 text-green-800 border-green-200'
        };
        const statusColor = statusColors[p.status] || 'bg-surface-container-low text-on-surface-variant border-outline-variant';
        return `
          <div class="flex items-center gap-4 p-4 rounded-2xl border border-outline-variant/30 bg-white hover:border-primary hover:shadow-md cursor-pointer transition-all mb-2 group" data-project-id="${esc(p.id)}">
            <div class="w-10 h-10 rounded-xl bg-lavender-soft flex items-center justify-center flex-shrink-0 group-hover:bg-secondary-fixed transition-colors">
              <span class="material-symbols-outlined text-primary text-xl">description</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-headline text-sm font-bold text-primary truncate">${esc(p.name)}</div>
              <div class="text-xs text-on-surface-variant mt-0.5">${esc(p.type || '')}</div>
            </div>
            <span class="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${statusColor}">${esc(p.status || 'draft')}</span>
            <span class="text-xs text-on-surface-variant">${fmtDate(p.updated_at || p.created_at)}</span>
            <button type="button" class="my-projects-delete w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors opacity-0 group-hover:opacity-100" data-id="${esc(p.id)}" title="Eliminar">
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          </div>`;
      }).join('');

      // Bind click to open project in intake
      el.querySelectorAll('[data-project-id]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.my-projects-delete')) return;
          const id = card.dataset.projectId;
          if (typeof Intake !== 'undefined') {
            Intake.openProject(id);
          }
        });
      });

      // Bind delete
      el.querySelectorAll('.my-projects-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('\u00BFEliminar este proyecto?')) return;
          try {
            await API.del('/intake/projects/' + btn.dataset.id);
            Toast.show('Proyecto eliminado', 'ok');
            loadProjects();
          } catch (err) {
            Toast.show('Error: ' + (err.message || err), 'err');
          }
        });
      });
    } catch (err) {
      console.error('MyProjects.loadProjects:', err);
      el.innerHTML = '<p class="text-sm text-error py-8 text-center">Error al cargar proyectos</p>';
    }
  }

  return { init };
})();
