/* ═══════════════════════════════════════════════════════════════
   My Evaluations — Path B-solo (uploaded proposals diagnosed only)
   - Lists form_instances belonging to the user (each = one uploaded
     .docx evaluation).
   - Lets the user "Reescribir este proyecto" to promote an evaluation
     to an editable project (calls POST /v1/evaluator/instances/:id/
     promote-to-project; gated to Pro on backend, see Bloque 7).
   ═══════════════════════════════════════════════════════════════ */

const MyEvaluations = (() => {

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(v) {
    if (!v) return '—';
    const s = typeof v === 'string' ? v.slice(0, 10) : '';
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function init() {
    loadEvaluations();
    const newBtn = document.getElementById('my-evaluations-new-btn');
    if (newBtn) {
      newBtn.onclick = () => {
        // The upload-and-parse flow lives in the evaluator module; route there.
        // Bloque 6 may consolidate this into a single component.
        location.hash = 'evaluator';
      };
    }
  }

  async function loadEvaluations() {
    const el = document.getElementById('my-evaluations-list');
    if (!el) return;
    el.innerHTML = '<p class="text-sm text-on-surface-variant py-8 text-center">Cargando evaluaciones...</p>';

    try {
      const result = await API.get('/evaluator/instances');
      const items = Array.isArray(result) ? result : (result.data || []);

      if (!items || items.length === 0) {
        el.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <span class="material-symbols-outlined text-6xl text-outline-variant/40 mb-4">fact_check</span>
            <h3 class="font-headline text-lg font-bold text-primary mb-2">No tienes evaluaciones todavía</h3>
            <p class="text-sm text-on-surface-variant mb-6 max-w-sm">Sube un proyecto Erasmus+ presentado y obtén un diagnóstico instantáneo de cómo lo evaluaría un experto EACEA.</p>
            <button type="button" id="my-evaluations-empty-new"
              class="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-primary bg-secondary-fixed hover:bg-secondary-fixed-dim shadow-md transition-all">
              <span class="material-symbols-outlined text-lg">upload_file</span> Subir mi primer proyecto
            </button>
          </div>`;
        document.getElementById('my-evaluations-empty-new')?.addEventListener('click', () => {
          location.hash = 'evaluator';
        });
        return;
      }

      // Estados: pendiente lavanda, en curso azul, completa lima, error rojo
      const statusColors = {
        pending:     'bg-lavender-soft text-violet border-lavender/40',
        in_progress: 'bg-primary/10 text-primary border-primary/30',
        complete:    'bg-secondary-fixed text-primary border-secondary-fixed-dim',
        error:       'bg-red-100 text-red-700 border-red-200',
      };

      el.innerHTML = items.map(it => {
        const sc = statusColors[it.status] || 'bg-surface-container-low text-on-surface-variant border-outline-variant';
        const title = it.title || it.template_name || it.program_name || 'Untitled';
        return `
          <div class="flex items-center gap-4 p-4 rounded-2xl border border-outline-variant/30 bg-white hover:border-primary hover:shadow-md transition-all mb-2 group" data-id="${esc(it.id)}">
            <div class="w-10 h-10 rounded-xl bg-lavender-soft flex items-center justify-center flex-shrink-0 group-hover:bg-secondary-fixed transition-colors">
              <span class="material-symbols-outlined text-primary text-xl">fact_check</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-headline text-sm font-bold text-primary truncate">${esc(title)}</div>
              <div class="text-xs text-on-surface-variant mt-0.5">${esc(it.action_type || '')} ${it.program_name ? '· ' + esc(it.program_name) : ''}</div>
            </div>
            <span class="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${sc}">${esc(it.status || 'pending')}</span>
            <span class="text-xs text-on-surface-variant whitespace-nowrap">${fmtDate(it.updated_at || it.created_at)}</span>
            <button type="button" class="my-evaluations-open inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-primary border border-primary/40 hover:bg-primary/5 transition-colors" data-id="${esc(it.id)}">
              <span class="material-symbols-outlined text-sm">visibility</span> Ver informe
            </button>
            <button type="button" class="my-evaluations-promote inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-primary hover:bg-violet transition-colors" data-id="${esc(it.id)}" title="Convertir esta evaluación en un proyecto editable (Pro)">
              <span class="material-symbols-outlined text-sm">edit_note</span> Reescribir
            </button>
            <button type="button" class="my-evaluations-delete w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors opacity-0 group-hover:opacity-100" data-id="${esc(it.id)}" title="Eliminar">
              <span class="material-symbols-outlined text-base">delete</span>
            </button>
          </div>`;
      }).join('');

      el.querySelectorAll('.my-evaluations-open').forEach(btn => {
        btn.addEventListener('click', () => {
          // Future (Bloque 6): deep-link to specific instance inside evaluator
          location.hash = 'evaluator';
        });
      });

      el.querySelectorAll('.my-evaluations-promote').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (!confirm('Esto creará un proyecto editable a partir de esta evaluación. ¿Continuar?')) return;
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner"></span> Creando...';
          try {
            const result = await API.post('/evaluator/instances/' + id + '/promote-to-project', {});
            const project = result?.data || result;
            Toast.show('Proyecto creado. Ábrelo desde Mis Proyectos para empezar a editar.', 'ok');
            location.hash = 'my-projects';
          } catch (err) {
            const msg = err?.message || String(err);
            if (msg.toLowerCase().includes('plan') || msg.toLowerCase().includes('pro')) {
              Toast.show('Función disponible solo en plan Pro.', 'err');
            } else {
              Toast.show('Error al promover: ' + msg, 'err');
            }
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined text-sm">edit_note</span> Reescribir';
          }
        });
      });

      el.querySelectorAll('.my-evaluations-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('¿Eliminar esta evaluación?')) return;
          try {
            await API.del('/evaluator/instances/' + btn.dataset.id);
            Toast.show('Evaluación eliminada', 'ok');
            loadEvaluations();
          } catch (err) {
            Toast.show('Error: ' + (err.message || err), 'err');
          }
        });
      });
    } catch (err) {
      console.error('MyEvaluations.loadEvaluations:', err);
      el.innerHTML = '<p class="text-sm text-error py-8 text-center">Error al cargar evaluaciones</p>';
    }
  }

  return { init };
})();
