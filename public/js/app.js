/* ═══════════════════════════════════════════════════════════════
   App — SPA Router + Global State
   ═══════════════════════════════════════════════════════════════ */

const App = (() => {
  let currentUser = null;
  let currentRoute = 'my-projects';
  let activeProject = null;

  /* ── Acceso cerrado a invitados (oct-2026) ─────────────────────
     Sin sesión no hay app: el servidor sirve la landing en «/» y la SPA
     solo enseña las pantallas de acceso (middleware/guestGate.js). */
  const AUTH_PATHS = { '/entrar': 'login', '/crear-cuenta': 'register', '/recuperar': 'forgot' };
  const TAB_PATHS  = { login: '/entrar', register: '/crear-cuenta', forgot: '/recuperar' };

  // ?volver=<ruta interna> — adónde quería ir antes de entrar.
  function safeVolver() {
    const v = new URLSearchParams(location.search).get('volver');
    if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null;
    return v;
  }

  // Cookie-pista con la que el servidor elige landing o app en «/».
  function clearSessionHint() {
    document.cookie = 'studio_sesion=; Max-Age=0; Path=/; SameSite=Lax';
  }

  function setGuestChrome(isGuest) {
    document.body.classList.toggle('sin-sesion', isGuest);
    document.querySelector('.efs-topbar')?.classList.toggle('efs-topbar--invitado', isGuest);
  }

  /* ── Botón de Google. El SDK carga async: si aún no está, se espera hasta 5 s. */
  async function initGoogle(clientId) {
    for (let i = 0; i < 25 && !window.google?.accounts?.id; i++) await new Promise(r => setTimeout(r, 200));
    if (!window.google?.accounts?.id) return;   // sin SDK: showAuth() enseña el botón de reserva
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: Auth.handleGoogleResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: false,
      itp_support: true,
      ux_mode: 'popup',
    });
    window.google.accounts.id.renderButton(
      document.querySelector('.g_id_signin'),
      { type: 'standard', shape: 'pill', theme: 'outline',
        text: 'continue_with', size: 'large', locale: I18N.lang,
        width: Math.max(200, Math.min(360, window.innerWidth - 96)) }   // cabe en la tarjeta a 390 px
    );
  }

  /* ── Load public config and init Google Sign-In ───────────── */
  async function loadConfig() {
    try {
      const res = await fetch('/v1/config');
      const { data } = await res.json();
      if (data?.googleClientId) {
        initGoogle(data.googleClientId);   // sin await: no frena el arranque
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
      // Sin sesión no hay app. En /entrar, /crear-cuenta o /recuperar se
      // enseña esa pestaña; si llegó a «/» con la pista caducada, a entrar
      // recordando la sección que pedía (el hash) para volver tras el login.
      clearSessionHint();
      const tab = AUTH_PATHS[path.replace(/\/+$/, '')];
      if (!tab) {
        const dest = location.hash && location.hash.length > 1 ? '/' + location.hash : null;
        history.replaceState(null, '', '/entrar' + (dest ? '?volver=' + encodeURIComponent(dest) : ''));
      }
      openAuth(tab || 'login');
    }

    // Listen for forced logout (e.g., expired refresh token)
    window.addEventListener('auth:logout', () => onLogout({ expired: true }));

    // Handle browser back/forward (solo con sesión).
    window.addEventListener('hashchange', () => {
      if (!currentUser) return;
      navigate(location.hash.slice(1) || 'my-projects', false);
    });
  }

  /* ── Show auth screen ──────────────────────────────────────── */
  function showAuth() {
    setGuestChrome(true);
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    // Topbar CTA: "Iniciar sesión" mientras no hay sesión
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
    setGuestChrome(false);
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    // Topbar CTA: "Mi cuenta · Nombre" cuando hay sesión
    const back = document.getElementById('topbar-cta-back');
    const acct = document.getElementById('topbar-cta-account');
    if (back) back.style.display = 'none';
    if (acct) acct.style.display = '';
    updateUserUI();
    // Tras el login el usuario viene sin avatar (solo /auth/me lo trae).
    if (currentUser && !('avatar_source' in currentUser)) refreshAvatar();

    // Navigate to hash or default. Sin el área beta «proyectos» el inicio
    // (Dashboard de proyectos) estaría cerrado: se entra por Convocatorias.
    const hasProyectos = typeof BetaAccess === 'undefined' || BetaAccess.has('proyectos');
    const hash = location.hash.slice(1) || (hasProyectos ? 'dashboard' : 'convocatorias');
    navigate(hash, false);
    loadDashboardRecent();
    // Área recién concedida: «Ya tienes acceso a …» una sola vez.
    if (typeof BetaAccess !== 'undefined') BetaAccess.showGranted();
  }

  /* ── Dashboard: proyectos recientes (solo con el área «proyectos») ── */
  function loadDashboardRecent() {
    const recentEl = document.getElementById('dashboard-recent-projects');
    if (!recentEl) return;
    if (typeof BetaAccess !== 'undefined' && !BetaAccess.has('proyectos')) { recentEl.innerHTML = ''; return; }
    API.get('/intake/projects').then(projects => {
      const list = Array.isArray(projects) ? projects : (projects.data || []);
      if (!list.length) {
        recentEl.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-6">' + _t('Aún no tienes proyectos. Empieza diseñando el primero aquí arriba.') + '</p>';
        return;
      }
      const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      recentEl.innerHTML = list.slice(0, 5).map(p => `
        <div class="flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all mb-2" onclick="if(typeof Intake!=='undefined'){Intake.openProject('${esc(p.id)}')}">
          <div class="w-8 h-8 rounded-lg bg-[#4312d8] flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-[#e9ff60] text-base">description</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold text-on-surface truncate">${esc(p.name || _t('Sin título'))}</div>
            <div class="text-[10px] text-on-surface-variant">${esc(p.type || '')} &middot; ${esc(p.status || 'draft')}</div>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant/30 text-sm">chevron_right</span>
        </div>`).join('');
    }).catch(() => { recentEl.innerHTML = ''; });
  }

  /* ── Auth callbacks ────────────────────────────────────────── */
  function onAuth(user) {
    currentUser = user;
    if (typeof BetaAccess !== 'undefined') BetaAccess.setUser(user);
    // Venía de una pantalla de acceso o con ?volver=: vuelta adonde quería ir.
    const volver = safeVolver();
    if (volver && volver !== '/' && !volver.startsWith('/#')) {
      location.replace(volver);              // otra página (academia, recursos…)
      return;
    }
    if (AUTH_PATHS[location.pathname.replace(/\/+$/, '')] || volver) {
      const hash = volver ? volver.slice(1) : location.hash;
      history.replaceState(null, '', '/' + (hash || ''));
    }
    // Idioma de su cuenta (o guardar el que eligió antes de entrar).
    if (window.I18N && I18N.syncAccount(user)) return;
    showApp();
    Toast.show(_t('¡Hola, {nombre}!', { nombre: user.name }), 'ok');
    // If user came in via ?sandbox=start, fire the sandbox flow now.
    if (typeof Sandbox !== 'undefined') Sandbox.resume();
  }

  function onLogout({ expired = false } = {}) {
    currentUser = null;
    if (window.SaveStatus) SaveStatus.reset();
    clearSessionHint();
    // Cerrar sesión lleva a la portada (landing). Si la sesión caducó a
    // mitad de trabajo, a entrar, para volver a la misma sección.
    if (expired) {
      const dest = '/' + (location.hash || '');
      location.replace('/entrar?volver=' + encodeURIComponent(dest));
    } else {
      location.replace('/');
    }
  }

  /* ── Update user info in sidebar ───────────────────────────── */
  function updateUserUI() {
    if (!currentUser) return;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-email').textContent = currentUser.email;
    const topbarName = document.getElementById('topbar-user-name');
    if (topbarName) topbarName.textContent = (currentUser.name || '').split(/\s+/)[0] || currentUser.name;

    // Avatar: logo de su entidad → foto del usuario → iniciales
    // (topbar, pie del sidebar y Perfil). /auth/me ya trae avatar_url.
    if (window.EfsAvatar) EfsAvatar.paintAll(currentUser);

    // Restaurar botón inferior a estado "cerrar sesión" (pudo quedar
    // como "login" si el visitante venía del modo invitado).
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.title = _t('Cerrar sesión');
      const ic = logoutBtn.querySelector('.material-symbols-outlined');
      if (ic) ic.textContent = 'logout';
    }

    // Show admin nav only for admins
    if (currentUser.role === 'admin' || currentUser.role === 'scribe') {
      document.getElementById('admin-nav-item')?.classList.remove('hidden');
    }
    // «Usuarios y accesos» (fase beta): solo admin, con el contador de solicitudes.
    if (currentUser.role === 'admin') {
      document.getElementById('admin-users-nav')?.classList.remove('hidden');
      document.getElementById('admin-org-claims-nav')?.classList.remove('hidden');
      // Presentaciones: solo la cuenta dueña (el servidor lo vuelve a comprobar).
      if (isOwner()) document.getElementById('admin-presentaciones-nav')?.classList.remove('hidden');
      if (typeof AdminOrgClaims !== 'undefined') AdminOrgClaims.refreshCount();
      if (typeof AdminUsers !== 'undefined') AdminUsers.refreshCount();
    }
    if (typeof BetaAccess !== 'undefined') BetaAccess.decorate();
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
    // Sin sesión, la URL refleja la pestaña (/entrar, /crear-cuenta, /recuperar).
    if (!currentUser && TAB_PATHS[tab] && AUTH_PATHS[location.pathname.replace(/\/+$/, '')]) {
      history.replaceState(null, '', TAB_PATHS[tab] + location.search);
    }

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
        ? 'w-full py-3 rounded-full bg-secondary-fixed text-primary text-sm font-bold hover:bg-secondary-fixed-dim active:scale-[0.98] transition-colors'
        : 'w-full py-3 rounded-full border border-primary bg-transparent text-primary text-sm font-semibold hover:bg-primary/5 transition-colors';
      btn.addEventListener('click', a.onClick);
      actionsEl.appendChild(btn);
    });
    showAuthTab('info');
  }

  /* ── Guardia de sesión ──────────────────────────────────────────
     Con el acceso cerrado no debería saltar nunca; si la sesión se ha
     perdido, abre la pantalla de entrar y devuelve false.            */
  function requireLogin() {
    if (currentUser || (typeof API !== 'undefined' && API.getToken())) return true;
    openAuth('login');
    return false;
  }

  function openAuth(tab = 'login') {
    showAuth();
    showAuthTab(tab);
  }

  /* Alta nueva con Google (regla de altas: correo + mensaje en pantalla).
     El registro propio enseña el mismo texto en el panel tras confirmar el email. */
  function showWelcome() {
    const box = document.createElement('div');
    box.setAttribute('role', 'status');
    box.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[70] max-w-lg w-[calc(100%-32px)] bg-white border border-secondary-fixed/60 shadow-xl rounded-2xl p-5 flex gap-3 items-start';
    box.innerHTML = `<span class="material-symbols-outlined text-primary text-3xl">celebration</span>
      <div class="flex-1"><p class="font-bold text-primary">${_t('Tu cuenta está confirmada')}</p>
      <p class="text-sm text-on-surface-variant mt-1">${_t('Te hemos enviado un correo de bienvenida. ¡Nos vemos dentro!')}</p></div>
      <button type="button" aria-label="${_t('Cerrar')}" class="text-on-surface-variant hover:text-primary"><span class="material-symbols-outlined">close</span></button>`;
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 15000);
  }

  /* ── Workspaces (Proyectos vs Entidades) ───────────────────────
     El sidebar conmuta según la pestaña superior activa. Las rutas
     de entidades muestran su propio submenú lateral y el resto del
     menú de Proyectos se oculta (y viceversa).                      */
  const ENTITY_ROUTES = ['my-org', 'organizations', 'shortlists', 'atlas-stats'];

  // Workspace "Mi Cuenta": el sidebar entero pasa a ser el menú de la
  // cuenta (perfil/seguridad/facturación/…). Todas comparten el panel
  // #panel-account; la ruta decide qué sección se muestra.
  const ACCOUNT_ROUTES = ['account-profile', 'account-org', 'account-security', 'account-billing', 'account-preferences'];
  // Rutas de cuenta con panel propio (no #panel-account). «Mi entidad» vive
  // en Mi Cuenta y, en segundo plano, también en Entidades (#my-org): las
  // dos rutas muestran el mismo panel.
  const ACCOUNT_OWN_PANEL = { 'account-org': 'my-org' };

  // Workspace "EU Vision": el sidebar pasa a ser el menú de visiones.
  const VISION_ROUTES = ['eu-vision'];

  // Workspace "Estadísticas": submenú propio. La ruta admite subvista y
  // filtros (#estadisticas/lineas?desde=2021…); los lee estadisticas.js.
  const ESTAD_ROUTES = ['estadisticas'];

  // Rutas restringidas a admin (nav oculto + guardia en navigate + endpoint 403).
  const ADMIN_ROUTES = ['analysis'];
  // Rutas donde la persona escribe o cambia datos (indicador de guardado fijo).
  const EDIT_ROUTES = ['intake', 'developer', 'calculator', 'budget', 'eu-vision', 'account-profile',
    'account-org', 'my-org', 'evaluator', 'master', 'diagnose', 'shortlists', 'admin', 'admin-users'];

  function updateWorkspace(route) {
    const isEntidades = ENTITY_ROUTES.includes(route);
    const isAccount   = ACCOUNT_ROUTES.includes(route);
    const isVision    = VISION_ROUTES.includes(route);
    const isEstad     = ESTAD_ROUTES.includes(route);
    document.getElementById('sidebar-group-proyectos')?.classList.toggle('hidden', isEntidades || isAccount || isVision || isEstad);
    document.getElementById('sidebar-group-estadisticas')?.classList.toggle('hidden', !isEstad);
    document.getElementById('sidebar-group-entidades')?.classList.toggle('hidden', !isEntidades);
    document.getElementById('sidebar-group-account')?.classList.toggle('hidden', !isAccount);
    document.getElementById('sidebar-group-vision')?.classList.toggle('hidden', !isVision);
    updateTopbarActive(route, isEntidades, isAccount, isVision);
  }

  function updateTopbarActive(route, isEntidades, isAccount, isVision) {
    // La cuenta no es una pestaña del menú superior: no resaltamos ninguna.
    const activeHref = isAccount              ? null
      : isVision                              ? '#eu-vision'
      : isEntidades                           ? '#atlas-stats'
      : route === 'convocatorias'             ? '#convocatorias'
      : route === 'movilidades'               ? '#movilidades'
      : route === 'estadisticas'              ? '#estadisticas'
      :                                         '#my-projects';
    document.querySelectorAll('#efs-topbar-nav .efs-topbar__menu li').forEach(li => {
      const a = li.querySelector('a');
      li.classList.toggle('is-current', !!a && !!activeHref && a.getAttribute('href') === activeHref);
    });
  }

  /* ── SPA Navigation ────────────────────────────────────────── */
  function navigate(route, pushHash = true, newProject = false) {
    // Guardia admin: rutas privadas (analytics interno) solo para admin/scribe.
    // El endpoint también devuelve 403; esto evita además mostrar el panel vacío.
    // Sin sesión no se navega por la app: a entrar.
    if (!currentUser) { openAuth('login'); return; }
    // Estadísticas: «estadisticas/<vista>?<filtros>» → ruta + subruta.
    let estSub = null;
    // El antiguo «Análisis» (ranking de entidades, solo admin) vive ahora en Estadísticas.
    if (route === 'analysis') { route = 'estadisticas/entidades'; history.replaceState(null, '', '#estadisticas/entidades'); }
    const estM = /^estadisticas(?:[/?](.*))?$/.exec(route);
    if (estM) { estSub = estM[1] || ''; route = 'estadisticas'; }
    if ((ADMIN_ROUTES.includes(route) && !isAdmin()) || (['admin-users', 'admin-org-claims'].includes(route) && currentUser.role !== 'admin')
        || (route === 'admin-presentaciones' && !isOwner())) {
      route = 'my-projects';
      if (pushHash) location.hash = route;
    }
    // Fase beta: área no concedida → pantalla «Solicitar acceso» en vez del módulo.
    const lockedArea = typeof BetaAccess !== 'undefined' ? BetaAccess.blockedArea(route) : null;
    if (lockedArea && route === 'create') route = 'my-projects';
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
    // Antes de cambiar de sección: lanzar ya los autoguardados programados
    // (debounce) mientras los campos siguen en pantalla (save-status.js).
    if (window.SaveStatus) SaveStatus.flush();
    // Aviso si hay cambios sin guardar en Intake que no se pueden guardar solos
    // (p. ej. sin nombre de proyecto). Si ya se está guardando, no hace falta.
    if (currentRoute === 'intake' && route !== 'intake') {
      if (typeof Intake !== 'undefined' && Intake.hasUnsavedChanges && Intake.hasUnsavedChanges()
          && !(window.SaveStatus && SaveStatus.hasUnsaved())) {
        const leave = window.confirm(_t('Tienes cambios sin guardar en Diseñar. ¿Salir de todos modos?'));
        if (!leave) {
          // Revertir hash si lo cambió el usuario
          if (pushHash) location.hash = 'intake';
          return;
        }
      }
    }
    currentRoute = route;
    // Pantallas de edición: el indicador de guardado se ve siempre («Todo guardado»).
    if (window.SaveStatus) SaveStatus.setEditing(EDIT_ROUTES.includes(route));

    // Update URL hash
    if (pushHash) location.hash = estSub ? `estadisticas/${estSub}` : route;

    // Defensive: panel navigation always releases body scroll lock so an
    // orphan drawer (e.g. ficha overlay) can never strand the user with
    // a non-scrollable page.
    document.body.style.overflow = '';

    // Update panels
    document.querySelectorAll('#content-area .panel').forEach(p => p.classList.remove('active'));
    // Las rutas de cuenta comparten el panel #panel-account.
    const panelRoute = lockedArea ? 'beta'
      : ACCOUNT_OWN_PANEL[route] || (ACCOUNT_ROUTES.includes(route) ? 'account' : route);
    const panel = document.getElementById(`panel-${panelRoute}`);
    if (lockedArea && panel) BetaAccess.renderInto(panel, lockedArea);
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

    // Switch sidebar workspace (Proyectos vs Entidades) + topbar active tab
    updateWorkspace(route);

    // Behavioral tracking: vista de sección + tiempo activo (TASK-009).
    if (typeof Track !== 'undefined') Track.enterSection(route);

    // Update topbar title
    const titles = {
      dashboard:            _t('Inicio'),
      'account-profile':     _t('Perfil'),
      'account-org':         _t('Mi entidad'),
      'account-security':    _t('Seguridad'),
      'account-billing':     _t('Facturación'),
      'account-preferences': _t('Preferencias'),
      'my-projects':    _t('Mis Proyectos'),
      'my-evaluations': _t('Mis Evaluaciones'),
      create:           _t('Diseñar'),
      intake:           _t('Diseñar'),
      developer:        _t('Escribir'),
      master:           _t('Diagnóstico'),
      diagnose:         _t('Diagnóstico'),
      'import-proposal':_t('Importar proyecto'),
      calculator:       _t('Calculadora'),
      planner:          _t('Planificador'),
      evaluator:        _t('Evaluar'),
      budget:           _t('Presupuesto'),
      partners:         _t('Socios'),
      'my-documents':   _t('Mis documentos'),
      research:         _t('Research'),
      movilidades:      _t('Movilidades'),
      convocatorias:    _t('Convocatorias'),
      estadisticas:     _t('Estadísticas'),
      'eu-vision':      _t('EU Vision'),
      'my-org':         _t('Mi entidad'),
      organizations:    _t('Directorio'),
      shortlists:       _t('Mi Pool'),
      'atlas-stats':    _t('Atlas'),
      analysis:         _t('Análisis — Experiencia'),
      admin:            _t('Admin — Data E+'),
      'admin-users':    _t('Usuarios y accesos'),
      'admin-org-claims': _t('Entidades reclamadas'),
      'admin-presentaciones': _t('Presentaciones'),
      engagement:       _t('Engagement')
    };
    document.getElementById('topbar-title').textContent = titles[route] || 'EU Funding Studio';

    // Área cerrada: solo la pantalla beta, sin iniciar el módulo (no pide datos).
    if (lockedArea) return;

    // Initialize module when navigating to it
    {
      if (ACCOUNT_ROUTES.includes(route) && !ACCOUNT_OWN_PANEL[route] && typeof Account !== 'undefined') Account.init(route);
      if (route === 'my-projects' && typeof MyProjects !== 'undefined') MyProjects.init();
      if (route === 'my-evaluations' && typeof MyEvaluations !== 'undefined') MyEvaluations.init();
      if (route === 'create' && typeof CreateProject !== 'undefined') CreateProject.init();
      if (route === 'intake' && typeof Intake !== 'undefined') {
        Intake.init();
      }
      if (route === 'admin' && typeof Admin !== 'undefined') Admin.init();
      if (route === 'admin-users' && typeof AdminUsers !== 'undefined') AdminUsers.init();
      if (route === 'admin-org-claims' && typeof AdminOrgClaims !== 'undefined') AdminOrgClaims.init();
      if (route === 'admin-presentaciones' && typeof Presentaciones !== 'undefined') Presentaciones.init();
      if (route === 'engagement' && typeof Engagement !== 'undefined') Engagement.init();
      if (route === 'calculator' && typeof Calculator !== 'undefined') Calculator.init();
      if (route === 'my-documents' && typeof Documents !== 'undefined') Documents.init();
      if ((route === 'my-org' || route === 'account-org') && typeof Organizations !== 'undefined') Organizations.initMyOrg();
      if (route === 'organizations' && typeof Entities !== 'undefined') Entities.init();
      if (route === 'shortlists' && typeof Shortlists !== 'undefined') Shortlists.init();
      if (route === 'atlas-stats' && typeof AtlasStats !== 'undefined') AtlasStats.init();
    if (route === 'analysis' && typeof Analysis !== 'undefined') Analysis.init();
      if (route === 'research' && typeof Research !== 'undefined') Research.init();
      if (route === 'movilidades' && typeof Movilidades !== 'undefined') Movilidades.init();
      if (route === 'convocatorias' && typeof Convocatorias !== 'undefined') Convocatorias.init();
      if (route === 'estadisticas' && typeof Estadisticas !== 'undefined') Estadisticas.init(estSub);
      if (route === 'eu-vision' && typeof Vision !== 'undefined') Vision.init();
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
      if (nameEl) nameEl.textContent = activeProject.name || activeProject.acronym || _t('Proyecto');
    } else {
      section.classList.add('hidden');
      if (nameEl) nameEl.textContent = '';
    }
  }
  function getActiveProject() { return activeProject; }
  function getCurrentUser() { return currentUser; }
  function isAdmin() { return !!(currentUser && (currentUser.role === 'admin' || currentUser.role === 'scribe')); }
  // Cuenta dueña (Admin › Presentaciones). Solo decide si se enseña el enlace;
  // /v1/presentaciones lo comprueba en el servidor con STUDIO_OWNER_EMAIL.
  function isOwner() { return !!(currentUser && currentUser.role === 'admin' && String(currentUser.email || '').toLowerCase() === 'oscarargumosa@gmail.com'); }

  /* Vuelve a pedir el avatar al servidor (el logo de la entidad pudo cambiar). */
  async function refreshAvatar() {
    if (!currentUser) return;
    try {
      const me = await API.get('/auth/me');
      ['avatar_url', 'avatar_source', 'user_avatar_url', 'initials'].forEach(k => { currentUser[k] = me[k]; });
      updateUserUI();
      if (typeof Account !== 'undefined' && Account.setAvatar) Account.setAvatar(me);
    } catch (e) { /* se queda el que había */ }
  }

  /* Merge a patch into the in-memory user and refresh the sidebar/topbar UI.
     Used by the account area after a self-service profile edit. */
  function updateCurrentUser(patch) {
    if (!currentUser) return;
    currentUser = { ...currentUser, ...patch };
    if (typeof BetaAccess !== 'undefined' && patch && patch.areas) BetaAccess.setUser(currentUser);
    updateUserUI();
  }

  /* ── Public API ────────────────────────────────────────────── */
  return { init, onAuth, onLogout, showAuthTab, showAuthInfo, openAuth, showWelcome, navigate, toggleSidebar, setActiveProject, getActiveProject, getCurrentUser, updateCurrentUser, refreshAvatar, isAdmin, requireLogin };
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

  /* ── CTA "Iniciar sesión" del top bar (visitante sin sesión) ─ */
  document.getElementById('topbar-cta-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    App.openAuth('login');
  });

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
    Toast.show(_t('El acceso con Google no está disponible en este momento. Usa tu email y contraseña.'), 'err');
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

  /* Dashboard: los proyectos recientes los carga App tras entrar (loadDashboardRecent). */
});
