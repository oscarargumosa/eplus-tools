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
      // Sin sesión → modo anónimo (teaser público), no pantalla de login.
      // El visitante explora las superficies públicas; el muro salta al
      // intentar abrir un detalle o navegar a una sección privada.
      showPublic();
    }

    // Listen for forced logout (e.g., expired refresh token)
    window.addEventListener('auth:logout', () => onLogout());

    // Handle browser back/forward (también en modo anónimo; navigate()
    // ya filtra las rutas privadas con el muro de login).
    window.addEventListener('hashchange', () => {
      const hash = location.hash.slice(1) || (currentUser ? 'my-projects' : 'convocatorias');
      navigate(hash, false);
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

  /* ── Show app shell in anonymous/public mode ───────────────────
     El visitante sin sesión ve el app-shell y puede explorar las
     superficies públicas (teaser). El sidebar se ve completo; al
     pinchar una sección privada o abrir un detalle salta el muro.  */
  // Asegura que el shell público esté visible (oculta la pantalla de
  // auth si venía de ahí). Idempotente: se puede llamar en cada
  // navegación de invitado sin coste.
  function ensurePublicShell() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (back) back.style.display = '';      // "Volver a la web" disponible
    if (acct) acct.style.display = 'none';
    renderGuestUser();
  }

  function showPublic() {
    ensurePublicShell();
    const hash = location.hash.slice(1);
    navigate(PUBLIC_ROUTES.includes(hash) ? hash : 'convocatorias', false);
  }

  function renderGuestUser() {
    const nameEl   = document.getElementById('user-name');
    const emailEl  = document.getElementById('user-email');
    const avatar   = document.getElementById('user-avatar');
    const logoutBtn= document.getElementById('btn-logout');
    if (nameEl)  nameEl.textContent  = 'Invitado';
    if (emailEl) emailEl.textContent = 'Inicia sesión';
    if (avatar)  avatar.textContent  = '?';
    if (logoutBtn) {
      logoutBtn.title = 'Iniciar sesión';
      const ic = logoutBtn.querySelector('.material-symbols-outlined');
      if (ic) ic.textContent = 'login';
    }
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
    // Tras cerrar sesión (o expirar el token) caemos al modo público,
    // no a la pantalla de login: el visitante puede seguir explorando.
    showPublic();
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

    // Restaurar botón inferior a estado "cerrar sesión" (pudo quedar
    // como "login" si el visitante venía del modo invitado).
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.title = 'Sign out';
      const ic = logoutBtn.querySelector('.material-symbols-outlined');
      if (ic) ic.textContent = 'logout';
    }

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

  /* ── Login wall (lead-gen gate) ────────────────────────────────
     Teaser público: las cards se ven sin sesión, pero abrir el
     detalle/ficha exige cuenta. requireLogin() devuelve true si hay
     sesión; si no, muestra el popup y devuelve false para que el
     llamante aborte la apertura.                                    */
  function requireLogin(opts = {}) {
    if (currentUser || (typeof API !== 'undefined' && API.getToken())) return true;
    // Señal de interés purísima: quería abrir algo y le frenó el muro.
    if (typeof Track !== 'undefined') Track.event('gate_hit', { route: currentRoute, what: opts.what });
    showLoginWall(opts);
    return false;
  }

  function openAuth(tab = 'login') {
    showAuth();
    showAuthTab(tab);
  }

  function showLoginWall({ what } = {}) {
    const existing = document.getElementById('login-wall-modal');
    if (existing) existing.remove();
    const whatTxt = what || 'este contenido';
    const modal = document.createElement('div');
    modal.id = 'login-wall-modal';
    modal.className = 'fixed inset-0 z-[60] bg-primary/40 backdrop-blur-sm flex items-center justify-center p-6';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center relative">
        <button id="login-wall-close" class="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="w-14 h-14 rounded-2xl bg-[#1b1464] flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-[#fbff12] text-3xl">lock_open</span>
        </div>
        <h3 class="text-xl font-bold text-on-surface mb-2">Crea tu cuenta gratis</h3>
        <p class="text-sm text-on-surface-variant mb-6">Regístrate para ver ${whatTxt}. Es gratis y tardas menos de un minuto.</p>
        <div class="space-y-2">
          <button id="login-wall-register" class="w-full py-3 rounded-lg bg-secondary-fixed text-primary-container text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform">Crear cuenta gratis</button>
          <button id="login-wall-login" class="w-full py-3 rounded-lg border border-outline-variant/50 bg-white text-on-surface text-sm font-semibold hover:bg-surface-container-low transition-colors">Ya tengo cuenta</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('#login-wall-close').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#login-wall-register').addEventListener('click', () => { close(); openAuth('register'); });
    modal.querySelector('#login-wall-login').addEventListener('click', () => { close(); openAuth('login'); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  /* ── Embudo de venta para invitados ────────────────────────────
     Las secciones de cuenta (sin contenido para quien no ha entrado)
     muestran un mensaje de marketing + CTAs en vez de su contenido
     real. Copy por sección; cae a 'default' si no hay específico.    */
  const FUNNEL_COPY = {
    'my-projects':     { icon: 'folder_shared', title: 'Tus proyectos Erasmus+, en un solo lugar', body: 'Diseña, redacta y evalúa propuestas con IA entrenada en convocatorias reales. Crea tu cuenta gratis para empezar tu primer proyecto.' },
    'my-evaluations':  { icon: 'fact_check', title: 'Evalúa como un experto EACEA', body: 'Diagnostica tu propuesta contra los criterios reales de evaluación antes de presentarla. Necesitas una cuenta para guardar tus evaluaciones.' },
    'import-proposal': { icon: 'upload_file', title: 'Importa una propuesta y mejórala', body: 'Sube un borrador y la IA lo analiza, puntúa y propone mejoras concretas. Crea tu cuenta para subir tu primer documento.' },
    'shortlists':      { icon: 'favorite', title: 'Tu pool de socios para el consorcio', body: 'Guarda y organiza entidades para tus futuras alianzas. Crea tu cuenta para empezar a construir tu pool de partners.' },
    'my-documents':    { icon: 'folder_open', title: 'Tu biblioteca de documentos', body: 'Centraliza convocatorias, plantillas y materiales, vectorizados para tu IA. Necesitas una cuenta para guardarlos.' },
    'research':        { icon: 'science', title: 'Encuentra evidencia para tu propuesta', body: 'Busca papers y datos que respalden tu proyecto Erasmus+. Crea tu cuenta para usar el buscador de investigación.' },
    default:           { icon: 'lock_open', title: 'Crea tu cuenta para acceder', body: 'Esta sección forma parte de tu espacio de trabajo. Regístrate gratis para empezar a usarla.' },
  };

  function renderGuestFunnel(route) {
    const c = FUNNEL_COPY[route] || FUNNEL_COPY.default;
    const host = document.getElementById('guest-funnel-content');
    if (!host) return;
    host.innerHTML = `
      <div class="max-w-xl mx-auto text-center py-20 px-6">
        <div class="w-16 h-16 rounded-2xl bg-[#1b1464] flex items-center justify-center mx-auto mb-6">
          <span class="material-symbols-outlined text-[#fbff12] text-4xl">${c.icon}</span>
        </div>
        <h2 class="text-2xl font-extrabold text-on-surface mb-3">${c.title}</h2>
        <p class="text-on-surface-variant mb-8">${c.body}</p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" id="funnel-register" class="px-6 py-3 rounded-lg bg-secondary-fixed text-primary-container font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform">Crear cuenta gratis</button>
          <button type="button" id="funnel-login" class="px-6 py-3 rounded-lg border border-outline-variant/50 bg-white text-on-surface font-semibold hover:bg-surface-container-low transition-colors">Ya tengo cuenta</button>
        </div>
        <button type="button" id="funnel-book" class="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <span class="material-symbols-outlined text-[18px]">event</span> Reservar una reunión con el equipo
        </button>
      </div>`;
    host.querySelector('#funnel-register')?.addEventListener('click', () => openAuth('register'));
    host.querySelector('#funnel-login')?.addEventListener('click', () => openAuth('login'));
    // Placeholder hasta tener URL de reserva (Calendly/GHL): de momento capta el lead vía registro.
    host.querySelector('#funnel-book')?.addEventListener('click', () => openAuth('register'));
  }

  /* ── Workspaces (Proyectos vs Entidades) ───────────────────────
     El sidebar conmuta según la pestaña superior activa. Las rutas
     de entidades muestran su propio submenú lateral y el resto del
     menú de Proyectos se oculta (y viceversa).                      */
  const ENTITY_ROUTES = ['my-org', 'organizations', 'shortlists', 'atlas-stats'];

  // Superficies de CONTENIDO que un invitado puede navegar y explorar
  // libremente (ve las tarjetas). El muro de login salta solo al ABRIR
  // una tarjeta concreta (detalle de convocatoria, ficha de entidad,
  // detalle de movilidad), no al navegar entre secciones.
  const PUBLIC_ROUTES = ['convocatorias', 'organizations', 'atlas-stats', 'movilidades'];

  // Rutas restringidas a admin (nav oculto + guardia en navigate + endpoint 403).
  const ADMIN_ROUTES = ['analysis'];

  function updateWorkspace(route) {
    const isEntidades = ENTITY_ROUTES.includes(route);
    document.getElementById('sidebar-group-proyectos')?.classList.toggle('hidden', isEntidades);
    document.getElementById('sidebar-group-entidades')?.classList.toggle('hidden', !isEntidades);
    updateTopbarActive(route, isEntidades);
  }

  function updateTopbarActive(route, isEntidades) {
    const activeHref = isEntidades            ? '#my-org'
      : route === 'convocatorias'             ? '#convocatorias'
      : route === 'movilidades'               ? '#movilidades'
      :                                         '#my-projects';
    document.querySelectorAll('#efs-topbar-nav .efs-topbar__menu li').forEach(li => {
      const a = li.querySelector('a');
      li.classList.toggle('is-current', !!a && a.getAttribute('href') === activeHref);
    });
  }

  /* ── SPA Navigation ────────────────────────────────────────── */
  function navigate(route, pushHash = true, newProject = false) {
    // Guardia admin: rutas privadas (analytics interno) solo para admin/scribe.
    // El endpoint también devuelve 403; esto evita además mostrar el panel vacío.
    if (ADMIN_ROUTES.includes(route) && !isAdmin()) {
      route = currentUser ? 'my-projects' : 'convocatorias';
      if (pushHash) location.hash = route;
    }
    // Invitado: navega libremente por todas las secciones. Las de
    // contenido (PUBLIC_ROUTES) muestran sus tarjetas; las de cuenta
    // muestran un embudo de venta (CTAs) en vez de su contenido real.
    let guestFunnel = false;
    if (!currentUser) {
      // La pestaña "Entidades" aterriza en Mi Organización (privada);
      // para un invitado mostramos el Directorio (contenido real).
      if (route === 'my-org') route = 'organizations';
      guestFunnel = !PUBLIC_ROUTES.includes(route);
      // Veníamos quizá de la pantalla de login → reactivar el shell público.
      ensurePublicShell();
    }
    // Legacy: #create no longer has its own panel — open the modal over Mis Proyectos
    if (route === 'create' && !guestFunnel) {
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
    if (guestFunnel) {
      // Invitado en sección de cuenta → panel embudo (CTAs de venta).
      document.getElementById('panel-guest-funnel')?.classList.add('active');
      renderGuestFunnel(route);
    } else {
      const panel = document.getElementById(`panel-${route}`);
      if (panel) {
        panel.classList.add('active');
      } else {
        // Default to dashboard if panel doesn't exist
        const dash = document.getElementById('panel-dashboard');
        if (dash) dash.classList.add('active');
      }
    }

    // Update sidebar active link
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.dataset.route === route) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Switch sidebar workspace (Proyectos vs Entidades) + topbar active tab
    updateWorkspace(route);

    // Behavioral tracking: vista de sección + tiempo activo (TASK-009).
    if (typeof Track !== 'undefined') Track.enterSection(route);

    // Update topbar title
    const titles = {
      dashboard:        'Dashboard',
      'my-projects':    'Mis Proyectos',
      'my-evaluations': 'Mis Evaluaciones',
      create:           'Diseñar',
      intake:           'Diseñar',
      developer:        'Escribir',
      master:           'Diagnóstico',
      diagnose:         'Diagnóstico',
      'import-proposal':'Importar proyecto',
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
      organizations:    'Directorio',
      shortlists:       'Mi Pool',
      'atlas-stats':    'Atlas',
      analysis:         'Análisis — Experiencia',
      admin:            'Admin — Data E+',
      engagement:       'Engagement'
    };
    document.getElementById('topbar-title').textContent = titles[route] || 'E+ Tools';

    // Initialize module when navigating to it (solo con sesión; el
    // invitado ve el embudo y no dispara cargas de datos privadas).
    if (!guestFunnel) {
      if (route === 'my-projects' && typeof MyProjects !== 'undefined') MyProjects.init();
      if (route === 'my-evaluations' && typeof MyEvaluations !== 'undefined') MyEvaluations.init();
      if (route === 'create' && typeof CreateProject !== 'undefined') CreateProject.init();
      if (route === 'intake' && typeof Intake !== 'undefined') {
        Intake.init();
      }
      if (route === 'admin' && typeof Admin !== 'undefined') Admin.init();
      if (route === 'engagement' && typeof Engagement !== 'undefined') Engagement.init();
      if (route === 'calculator' && typeof Calculator !== 'undefined') Calculator.init();
      if (route === 'my-documents' && typeof Documents !== 'undefined') Documents.init();
      if (route === 'my-org' && typeof Organizations !== 'undefined') Organizations.initMyOrg();
      if (route === 'organizations' && typeof Entities !== 'undefined') Entities.init();
      if (route === 'shortlists' && typeof Shortlists !== 'undefined') Shortlists.init();
      if (route === 'atlas-stats' && typeof AtlasStats !== 'undefined') AtlasStats.init();
    if (route === 'analysis' && typeof Analysis !== 'undefined') Analysis.init();
      if (route === 'research' && typeof Research !== 'undefined') Research.init();
      if (route === 'movilidades' && typeof Movilidades !== 'undefined') Movilidades.init();
      if (route === 'convocatorias' && typeof Convocatorias !== 'undefined') Convocatorias.init();
      if (route === 'developer' && typeof Developer !== 'undefined') Developer.init();
      if (route === 'diagnose' && typeof Diagnose !== 'undefined') Diagnose.init();
      if (route === 'import-proposal' && typeof ImportProposal !== 'undefined') ImportProposal.init();
      if (route === 'evaluator' && typeof Evaluator !== 'undefined') Evaluator.init();
      if (route === 'budget' && typeof Budget !== 'undefined') Budget.init();
    }
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
  return { init, onAuth, onLogout, showAuthTab, showAuthInfo, openAuth, showPublic, navigate, toggleSidebar, setActiveProject, getActiveProject, getCurrentUser, isAdmin, requireLogin };
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
  if (typeof Track !== 'undefined') Track.init();
  App.init();

  /* ── Auth tab buttons ─────────────────────────────────────── */
  document.getElementById('tab-login')?.addEventListener('click', () => App.showAuthTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => App.showAuthTab('register'));

  /* ── Volver al modo exploración desde la pantalla de auth ─── */
  document.getElementById('auth-back-explore')?.addEventListener('click', () => App.showPublic());

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

  /* ── Logout / login button (context-aware) ────────────────── */
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    if (App.getCurrentUser()) Auth.logout();
    else App.openAuth('login');
  });

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
