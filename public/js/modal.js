/* Modales de index.html: Modal (sustituye prompt/confirm) y el de crear proyecto.
   Antes en línea en index.html; en fichero aparte por la CSP. */
// Modal helper — reemplaza prompt() y confirm() nativos
window.Modal = {
  _resolve: null,
  show(msg, { input = false, defaultVal = '' } = {}) {
    return new Promise(resolve => {
      this._resolve = resolve;
      document.getElementById('mini-modal-msg').textContent = msg;
      const inp = document.getElementById('mini-modal-input');
      const txt = document.getElementById('mini-modal-input-text');
      inp.classList.add('hidden');
      txt.classList.add('hidden');
      if (input === true || input === 'number') {
        inp.classList.remove('hidden');
        inp.value = defaultVal || '';
        setTimeout(() => inp.focus(), 100);
      } else if (input === 'text') {
        txt.classList.remove('hidden');
        txt.value = defaultVal || '';
        if (typeof input === 'object' && input?.placeholder) txt.placeholder = input.placeholder;
        setTimeout(() => { txt.focus(); txt.select(); }, 100);
      }
      this._mode = input;
      document.getElementById('mini-modal').classList.remove('hidden');
    });
  },
  prompt(msg, defaultVal = '', opts = {}) {
    return new Promise(resolve => {
      this._resolve = resolve;
      document.getElementById('mini-modal-msg').textContent = msg;
      const inp = document.getElementById('mini-modal-input');
      const txt = document.getElementById('mini-modal-input-text');
      inp.classList.add('hidden');
      txt.classList.remove('hidden');
      txt.value = defaultVal || '';
      txt.placeholder = opts.placeholder || '';
      this._mode = 'text';
      document.getElementById('mini-modal').classList.remove('hidden');
      setTimeout(() => { txt.focus(); txt.select(); }, 100);
    });
  },
  confirm(msg) {
    return new Promise(resolve => {
      this._resolve = resolve;
      document.getElementById('mini-modal-msg').textContent = msg;
      document.getElementById('mini-modal-input').classList.add('hidden');
      document.getElementById('mini-modal-input-text').classList.add('hidden');
      this._mode = 'confirm';
      document.getElementById('mini-modal').classList.remove('hidden');
    });
  },
  _close(val) {
    document.getElementById('mini-modal').classList.add('hidden');
    if (this._resolve) { this._resolve(val); this._resolve = null; }
  }
};
document.getElementById('mini-modal-confirm').addEventListener('click', () => {
  const mode = Modal._mode;
  if (mode === 'text') {
    Modal._close(document.getElementById('mini-modal-input-text').value || null);
  } else if (mode === true || mode === 'number') {
    Modal._close(document.getElementById('mini-modal-input').value);
  } else {
    Modal._close(true);
  }
});
document.getElementById('mini-modal-cancel').addEventListener('click', () => Modal._close(null));
document.getElementById('mini-modal').addEventListener('click', e => { if (e.target === e.currentTarget) Modal._close(null); });
document.getElementById('mini-modal-input-text').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('mini-modal-confirm').click(); });

/* Create-project modal: open/close + ESC to dismiss */
window.openCreateModal = function() {
  // Fase beta: crear proyecto pide el área «proyectos».
  if (typeof BetaAccess !== 'undefined' && !BetaAccess.guard('proyectos')) return;
  const m = document.getElementById('create-modal');
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('flex');
  if (typeof CreateProject !== 'undefined') CreateProject.init();
};
window.closeCreateModal = function() {
  const m = document.getElementById('create-modal');
  if (!m) return;
  m.classList.add('hidden');
  m.classList.remove('flex');
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const m = document.getElementById('create-modal');
    if (m && !m.classList.contains('hidden')) window.closeCreateModal();
  }
});

/* Acciones de los botones fijos de index.html (js/acciones.js) */
Acciones.registrar({
  // Tarjeta «Diseñar» del inicio: a Mis proyectos y abre el modal de crear
  'inicio.crearProyecto': () => {
    location.hash = 'my-projects';
    setTimeout(() => window.openCreateModal && window.openCreateModal(), 100);
  },
  // Fondo del modal de crear proyecto: cierra solo si se pulsa fuera de la caja
  'crear.cerrarFondo': (el, ev) => { if (ev.target === el) window.closeCreateModal(); },
  'crear.cerrar': () => { window.closeCreateModal(); },
});
