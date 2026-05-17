/* ═══════════════════════════════════════════════════════════════
   App — SPA Router + Global State
   ═══════════════════════════════════════════════════════════════ */

const App = (() => {
  let currentUser = null;
  let currentRoute = 'my-projects';
  let activeProject = null;

  /* ── Load public config and init Google Sign-In ───────────── */
  async function loadConfig() {
    try {
      const res = await fetch('/v1/config');
      const { data } = await res.json();
      if (data?.googleClientId) {
        const el = document.getElementById('g_id_onload');
        if (el) el.setAttribute('data-client_id', data.googleClientId);
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: data.googleClientId,
            callback: Auth.handleGoogleResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: false,
            itp_support: true,
            ux_mode: 'popup',
          });
          window.google.accounts.id.renderButton(
            document.querySelector('.g_id_signin'),
            { type: 'standard', shape: 'rectangular', theme: 'outline',
              text: 'continue_with', size: 'large', width: 360 }
          );
        }
      } else {
        // No client_id configured → hide the whole Google block so we don't
        // render a broken button that throws "Missing required parameter: client_id".
        const container = document.getElementById('google-btn-container');
        const divider   = document.getElementById('google-divider');
        if (container) { container.classList.add('hidden'); container.dataset.disabled = '1'; }
        if (divider)   { divider.classList.add('hidden');   divider.dataset.disabled   = '1'; }
      }
    } catch (e) {
      console.warn('Config load failed:', e.message);
    }
  }

  /* ── Initialize app ────────────────────────────────────────── */
  async function init() {
    await loadConfig();

    // Detect ?sandbox=start in URL before showing any auth UI.
    if (typeof Sandbox !== 'undefined') Sandbox.init();

    // Handle email verification + password reset URLs before any session restore.
    // These flows are stateless: visitor lands here from an email link.
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (path === '/verify-email' && params.get('token')) {
      showAuth();
      await Auth.handleVerifyEmailUrl(params.get('token'));
      return;
    }
    if (path === '/reset-password' && params.get('token')) {
      showAuth();
      Auth.handleResetPasswordUrl(params.get('token'));
      return;
    }

    // Try to restore session from refresh token cookie
    const restored = await Auth.tryRestore();
    if (!restored) {
      showAuth();
    }

    // Listen for forced logout (e.g., expired refresh token)
    window.addEventListener('auth:logout', () => onLogout());

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
      const hash = location.hash.slice(1) || 'my-projects';
      if (currentUser) navigate(hash, false);
    });
  }

  /* ── Show auth screen ──────────────────────────────────────── */
  function showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    // Topbar CTA: "Volver a la web" mientras no hay sesión
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (back) back.style.display = '';
    if (acct) acct.style.display = 'none';
    showAuthTab('login');

    // Show Google fallback if SDK didn't load
    setTimeout(() => {
      const gBtn = document.querySelector('.g_id_signin');
      if (!gBtn || gBtn.children.length === 0) {
        const fb = document.getElementById('google-fallback-btn');
        if (fb) fb.classList.remove('hidden');
      }
    }, 2000);
  }

  /* ── Show app shell ────────────────────────────────────────── */
  function showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    // Topbar CTA: "Mi cuenta · Nombre" cuando hay sesión
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (back) back.style.display = 'none';
    if (acct) acct.style.display = '';
    updateUserUI();

    // Navigate to hash or default
    const hash = location.hash.slice(1) || 'dashboard';
    navigate(hash, false);
  }

  /* ── Auth callbacks ────────────────────────────────────────── */
  function onAuth(user) {
    currentUser = user;
    showApp();
    Toast.show(`Welcome, ${user.name}!`, 'ok');
    // If user came in via ?sandbox=start, fire the sandbox flow now.
    if (typeof Sandbox !== 'undefined') Sandbox.resume();
  }

  function onLogout() {
    currentUser = null;
    showAuth();
  }

  /* ── Update user info in sidebar ───────────────────────────── */
  function updateUserUI() {
    if (!currentUser) return;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-email').textContent = currentUser.email;
    const topbarName = document.getElementById('topbar-user-name');
    if (topbarName) topbarName.textContent = (currentUser.name || '').split(/\s+/)[0] || currentUser.name;

    // Avatar initials
    const initials = currentUser.name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    document.getElementById('user-avatar').textContent = initials;

    // Show admin nav only for admins
    if (currentUser.role === 'admin' || currentUser.role === 'scribe') {
      document.getElementById('admin-nav-item')?.classList.remove('hidden');
    }
  }

  /* ── Auth tab switcher ─────────────────────────────────────── */
  // Modes: 'login' | 'register' | 'forgot' | 'reset' | 'info'
  function showAuthTab(tab) {
    const panels = {
      login:    document.getElementById('form-login'),
      register: document.getElementById('form-register'),
      forgot:   document.getElementById('form-forgot'),
      reset:    document.getElementById('form-reset'),
      info:     document.getElementById('auth-info'),
    };
    Object.entries(panels).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle('hidden', k !== tab);
    });

    // Tabs (only meaningful for login/register)
    const tabLogin = document.getElementById('tab-login');
    const tabReg   = document.getElementById('tab-register');
    const tabsBar  = tabLogin?.parentElement;
    const showTabsForModes = ['login', 'register'];
    if (tabsBar) tabsBar.style.display = showTabsForModes.includes(tab) ? '' : 'none';

    if (tab === 'login') {
      tabLogin?.classList.add('text-primary', 'border-secondary-fixed');
      tabLogin?.classList.remove('text-on-surface-variant', 'border-transparent');
      tabReg?.classList.remove('text-primary', 'border-secondary-fixed');
      tabReg?.classList.add('text-on-surface-variant', 'border-transparent');
    } else if (tab === 'register') {
      tabReg?.classList.add('text-primary', 'border-secondary-fixed');
      tabReg?.classList.remove('text-on-surface-variant', 'border-transparent');
      tabLogin?.classList.remove('text-primary', 'border-secondary-fixed');
      tabLogin?.classList.add('text-on-surface-variant', 'border-transparent');
    }

    // Hide Google block on non-credential modes (forgot/reset/info)
    const googleBlock = document.getElementById('google-btn-container');
    const googleDiv   = document.getElementById('google-divider');
    const hideGoogle  = !['login', 'register'].includes(tab);
    googleBlock?.classList.toggle('hidden', hideGoogle || googleBlock?.dataset.disabled === '1');
    googleDiv?.classList.toggle('hidden',   hideGoogle || googleDiv?.dataset.disabled === '1');
  }

  /* ── Show an info screen (post-register, success, etc.) ───── */
  function showAuthInfo({ icon, title, body, actions }) {
    document.getElementById('auth-info-icon').textContent  = icon || '📩';
    document.getElementById('auth-info-title').textContent = title || '';
    document.getElementById('auth-info-body').textContent  = body || '';
    const actionsEl = document.getElementById('auth-info-actions');
    actionsEl.innerHTML = '';
    (actions || []).forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      btn.className = a.primary
        ? 'w-full py-3 rounded-lg bg-secondary-fixed text-primary-container text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform'
        : 'w-full py-3 rounded-lg border border-outline-variant/50 bg-white text-on-surface text-sm font-semibold hover:bg-surface-container-low transition-colors';
      btn.addEventListener('click', a.onClick);
      actionsEl.appendChild(btn);
    });
    showAuthTab('info');
  }

  /* ── SPA Navigation ────────────────────────────────────────── */
  function navigate(route, pushHash = true, newProject = false) {
    // Legacy: #create no longer has its own panel — open the modal over Mis Proyectos
    if (route === 'create') {
      if (currentRoute !== 'my-projects') {
        currentRoute = 'my-projects';
        if (pushHash) location.hash = 'my-projects';
        document.querySelectorAll('#content-area .panel').forEach(p => p.classList.remove('active'));
        document.getElementById('panel-my-projects')?.classList.add('active');
        if (typeof MyProjects !== 'undefined') MyProjects.init();
      }
      if (typeof window.openCreateModal === 'function') window.openCreateModal();
      return;
    }
    // Aviso si hay cambios sin guardar en Intake
    if (currentRoute === 'intake' && route !== 'intake') {
      if (typeof Intake !== 'undefined' && Intake.hasUnsavedChanges && Intake.hasUnsavedChanges()) {
        const leave = window.confirm('Tienes cambios sin guardar en Intake. ¿Salir de todos modos?');
        if (!leave) {
          // Revertir hash si lo cambió el usuario
          if (pushHash) location.hash = 'intake';
          return;
        }
      }
    }
    currentRoute = route;

    // Update URL hash
    if (pushHash) location.hash = route;

    // Defensive: panel navigation always releases body scroll lock so an
    // orphan drawer (e.g. ficha overlay) can never strand the user with
    // a non-scrollable page.
    document.body.style.overflow = '';

    // Update panels
    document.querySelectorAll('#content-area .panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${route}`);
    if (panel) {
      panel.classList.add('active');
    } else {
      // Default to dashboard if panel doesn't exist
      const dash = document.getElementById('panel-dashboard');
      if (dash) dash.classList.add('active');
    }

    // Update sidebar active link
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.dataset.route === route) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update topbar title
    const titles = {
      dashboard:        'Dashboard',
      'my-projects':    'Mis Proyectos',
      'my-evaluations': 'Mis Evaluaciones',
      create:           'Diseñar',
      intake:           'Diseñar',
      developer:        'Escribir',
      master:           'Perfeccionar',
      calculator:       'Calculator',
      planner:          'Planner',
      evaluator:        'Evaluar',
      budget:           'Presupuesto',
      partners:         'Partners',
      'my-documents':   'My Documents',
      research:         'Research',
      movilidades:      'Movilidades',
      convocatorias:    'Convocatorias',
      'my-org':         'Mi Organización',
      organizations:    'Partner Engine',
      shortlists:       'Mi Pool',
      'atlas-stats':    'Atlas Stats',
      admin:            'Admin — Data E+'
    };
    document.getElementById('topbar-title').textContent = titles[route] || 'E+ Tools';

    // Initialize module when navigating to it
    if (route === 'my-projects' && typeof MyProjects !== 'undefined') MyProjects.init();
    if (route === 'my-evaluations' && typeof MyEvaluations !== 'undefined') MyEvaluations.init();
    if (route === 'create' && typeof CreateProject !== 'undefined') CreateProject.init();
    if (route === 'intake' && typeof Intake !== 'undefined') {
      Intake.init();
    }
    if (route === 'admin' && typeof Admin !== 'undefined') Admin.init();
    if (route === 'calculator' && typeof Calculator !== 'undefined') Calculator.init();
    if (route === 'my-documents' && typeof Documents !== 'undefined') Documents.init();
    if (route === 'my-org' && typeof Organizations !== 'undefined') Organizations.initMyOrg();
    if (route === 'organizations' && typeof Entities !== 'undefined') Entities.init();
    if (route === 'shortlists' && typeof Shortlists !== 'undefined') Shortlists.init();
    if (route === 'atlas-stats' && typeof AtlasStats !== 'undefined') AtlasStats.init();
    if (route === 'research' && typeof Research !== 'undefined') Research.init();
    if (route === 'movilidades' && typeof Movilidades !== 'undefined') Movilidades.init();
    if (route === 'convocatorias' && typeof Convocatorias !== 'undefined') Convocatorias.init();
    if (route === 'developer' && typeof Developer !== 'undefined') Developer.init();
    if (route === 'master' && typeof Master !== 'undefined') Master.render();
    if (route === 'evaluator' && typeof Evaluator !== 'undefined') Evaluator.init();
    if (route === 'budget' && typeof Budget !== 'undefined') Budget.init();
  }

  /* ── Toggle sidebar (mobile) ───────────────────────────────── */
  function toggleSidebar(forceClose) {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const isOpen   = sidebar.classList.contains('open');
    const open     = forceClose ? false : !isOpen;
    sidebar.classList.toggle('open', open);
    overlay?.classList.toggle('show', open);
  }

  /* ── Active project (drives the contextual section of the sidebar) ─── */
  function setActiveProject(project) {
    activeProject = project || null;
    const section = document.getElementById('sidebar-project-section');
    const nameEl  = document.getElementById('sidebar-project-name');
    if (!section) return;
    if (activeProject) {
      section.classList.remove('hidden');
      if (nameEl) nameEl.textContent = activeProject.name || activeProject.acronym || 'Proyecto';
    } else {
      section.classList.add('hidden');
      if (nameEl) nameEl.textContent = '';
    }
  }
  function getActiveProject() { return activeProject; }
  function getCurrentUser() { return currentUser; }
  function isAdmin() { return !!(currentUser && (currentUser.role === 'admin' || currentUser.role === 'scribe')); }

  /* ── Public API ────────────────────────────────────────────── */
  return { init, onAuth, onLogout, showAuthTab, showAuthInfo, navigate, toggleSidebar, setActiveProject, getActiveProject, getCurrentUser, isAdmin };
})();


/* ═══════════════════════════════════════════════════════════════
   Toast — Simple notification system
   ═══════════════════════════════════════════════════════════════ */

const Toast = (() => {
  let timer = null;

  function show(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(timer);
    timer = setTimeout(() => { el.className = '' }, 4000);
  }

  return { show };
})();


/* ═══ Boot ═════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  App.init();

  /* ── Auth tab buttons ─────────────────────────────────────── */
  document.getElementById('tab-login')?.addEventListener('click', () => App.showAuthTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => App.showAuthTab('register'));

  /* ── Forgot/reset links + forms ───────────────────────────── */
  document.getElementById('link-forgot')?.addEventListener('click', (e) => {
    e.preventDefault();
    App.showAuthTab('forgot');
  });
  document.getElementById('link-back-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    App.showAuthTab('login');
  });
  document.getElementById('form-forgot')?.addEventListener('submit', (e) => Auth.forgotPassword(e));
  document.getElementById('form-reset')?.addEventListener('submit', (e) => Auth.resetPassword(e));

  /* ── Auth forms ───────────────────────────────────────────── */
  document.getElementById('form-login')?.addEventListener('submit', (e) => Auth.login(e));
  document.getElementById('form-register')?.addEventListener('submit', (e) => Auth.register(e));

  /* ── Google fallback ──────────────────────────────────────── */
  document.getElementById('google-fallback-btn')?.addEventListener('click', () => {
    alert('Google Sign-In will be available once the Client ID is configured.');
  });

  /* ── Sidebar nav links ────────────────────────────────────── */
  document.querySelectorAll('#sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      if (route) App.navigate(route);
    });
  });

  /* ── Logout button ────────────────────────────────────────── */
  document.getElementById('btn-logout')?.addEventListener('click', () => Auth.logout());

  /* ── Mobile sidebar toggle ────────────────────────────────── */
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => App.toggleSidebar());
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => App.toggleSidebar(true));

  /* ── Close sidebar on nav link click (mobile) ──────────────── */
  document.querySelectorAll('#sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 1024) App.toggleSidebar(true);
    });
  });

  /* ── Dashboard — load recent projects ────────────────────── */
  const recentEl = document.getElementById('dashboard-recent-projects');
  if (recentEl) {
    API.get('/intake/projects').then(projects => {
      const list = Array.isArray(projects) ? projects : (projects.data || []);
      if (!list.length) {
        recentEl.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-6">No projects yet. Start by designing your first project above.</p>';
        return;
      }
      recentEl.innerHTML = list.slice(0, 5).map(p => `
        <div class="flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all mb-2" onclick="if(typeof Intake!=='undefined'){Intake.openProject('${p.id}')}">
          <div class="w-8 h-8 rounded-lg bg-[#1b1464] flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-[#fbff12] text-base">description</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-on-surface truncate">${p.name || 'Untitled'}</div>
            <div class="text-[10px] text-on-surface-variant">${p.type || ''} &middot; ${p.status || 'draft'}</div>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant/30 text-sm">chevron_right</span>
        </div>`).join('');
    }).catch(() => {
      recentEl.innerHTML = '<p class="text-xs text-on-surface-variant text-center py-4">Log in to see your projects.</p>';
    });
  }
});
