/* ═══════════════════════════════════════════════════════════════
   Sandbox — demo project flow
   ═══════════════════════════════════════════════════════════════
   Entry points:
   - URL ?sandbox=start or #sandbox → detected at App.init time
   - Google Sign-In (or normal auth) completes → Sandbox.resume() fires
   - POST /v1/sandbox/start → creates or reopens the demo project
   - Intake.openProject(id) loads it
   Banner is shown whenever a project with is_sandbox=1 is active.
   =============================================================== */

const Sandbox = (() => {

  const PENDING_KEY = 'efs_sandbox_pending';
  let activeProject = null;

  /* ── Detect sandbox intent in URL ──────────────────────────── */
  function detectIntent() {
    try {
      const url = new URL(location.href);
      if (url.searchParams.get('sandbox') === 'start') return true;
      if (url.hash && url.hash.replace(/^#/, '') === 'sandbox') return true;
    } catch { /* ignore */ }
    return false;
  }

  /* ── Remember intent while user completes Google Sign-In ──── */
  function markPending() {
    try { sessionStorage.setItem(PENDING_KEY, '1'); } catch {}
  }
  function consumePending() {
    try {
      const v = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return v === '1';
    } catch { return false; }
  }

  /* ── Cleanup the URL so a refresh doesn't re-trigger ──────── */
  function cleanUrl() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('sandbox');
      if (url.hash === '#sandbox') url.hash = '';
      history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  }

  /* ── Called from App.init() before authentication ────────── */
  function init() {
    if (detectIntent()) {
      markPending();
      // Make sure the Google Sign-In sits on top of the auth screen.
      document.body.classList.add('efs-sandbox-entry');
    }
  }

  /* ── Called from App.onAuth() after any login completes ──── */
  async function resume() {
    if (!consumePending()) return;
    cleanUrl();
    try {
      const res = await API.post('/sandbox/start');
      const project = res?.project;
      if (!project?.id) throw new Error('sandbox response missing project');
      Toast.show('Modo demo listo — explora tu proyecto de ejemplo', 'ok');
      if (typeof Intake !== 'undefined' && Intake.openProject) {
        await Intake.openProject(project.id);
      } else {
        // Intake not loaded — fall back to hash navigation
        location.hash = 'intake';
      }
    } catch (err) {
      Toast.show(err.message || 'Error al iniciar el sandbox', 'err');
    }
  }

  /* ── Register / clear active project and update banner ────── */
  function setActiveProject(project) {
    activeProject = project || null;
    renderBanner();
  }

  function clearActiveProject() {
    activeProject = null;
    renderBanner();
  }

  /* ── Banner rendering ──────────────────────────────────────── */
  function renderBanner() {
    const el = document.getElementById('sandbox-banner');
    if (!el) return;

    const isSandbox = activeProject && (activeProject.is_sandbox === 1 || activeProject.is_sandbox === '1' || activeProject.is_sandbox === true);
    if (!isSandbox) {
      el.classList.add('hidden');
      el.innerHTML = '';
      document.body.classList.remove('efs-sandbox-active');
      return;
    }

    document.body.classList.add('efs-sandbox-active');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="flex items-center gap-3 flex-wrap">
        <span class="material-symbols-outlined text-[18px]">science</span>
        <span class="font-bold">MODO DEMO</span>
        <span class="opacity-80 text-xs">
          Estás explorando un proyecto de ejemplo (Small-scale Sports). Los cambios se guardan pero los botones de exportar e inscribir están bloqueados.
        </span>
        <span class="flex-1"></span>
        <button type="button" id="sandbox-graduate-btn"
          class="bg-secondary-fixed text-primary-container font-bold text-xs px-3.5 py-1.5 rounded-full hover:scale-[1.02] transition-transform">
          Graduar a proyecto real →
        </button>
      </div>
    `;
    const btn = document.getElementById('sandbox-graduate-btn');
    if (btn) btn.addEventListener('click', graduate);
  }

  /* ── Graduate: flip is_sandbox off, unblock features ──────── */
  async function graduate() {
    if (!activeProject?.id) return;
    if (!confirm('¿Convertir este proyecto demo en un proyecto real?\n\nSe desbloquean export, envío final e invitaciones. No se pierden datos.')) return;
    const btn = document.getElementById('sandbox-graduate-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Graduando…'; }
    try {
      await API.post('/sandbox/graduate/' + encodeURIComponent(activeProject.id));
      activeProject.is_sandbox = 0;
      Toast.show('Proyecto graduado. Ya no está en modo demo.', 'ok');
      renderBanner();
      // Refresh the project view so buttons/blocks update wherever applicable.
      if (typeof Intake !== 'undefined' && Intake._loadProject) {
        Intake._loadProject(activeProject.id);
      }
    } catch (err) {
      Toast.show(err.message || 'No se pudo graduar', 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Graduar a proyecto real →'; }
    }
  }

  return { init, resume, setActiveProject, clearActiveProject };
})();

window.Sandbox = Sandbox;
