/* ═══════════════════════════════════════════════════════════════
   Campos de contraseña — ojo para ver/ocultar y comprobación de
   «repite la contraseña».
   - Todo <input type="password"> recibe un botón con el ojo
     (también los que se pintan después: se vigila el DOM).
   - Un campo con data-match="#otro" debe coincidir con #otro:
     aviso en el momento (role="status") y setCustomValidity para
     que el formulario no se envíe con las dos distintas.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function addEye(input) {
    if (input.dataset.pwEye) return;
    input.dataset.pwEye = '1';

    var mb = window.getComputedStyle(input).marginBottom;
    var wrap = document.createElement('div');
    wrap.className = 'pw-field';
    wrap.style.position = 'relative';
    if (mb && mb !== '0px') wrap.style.marginBottom = mb;
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.style.paddingRight = '3rem';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', _t('Mostrar la contraseña'));
    btn.setAttribute('aria-pressed', 'false');
    if (input.id) btn.setAttribute('aria-controls', input.id);
    btn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">visibility</span>';
    btn.addEventListener('click', function () {
      var mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(mostrar));
      btn.setAttribute('aria-label', mostrar ? _t('Ocultar la contraseña') : _t('Mostrar la contraseña'));
      btn.firstChild.textContent = mostrar ? 'visibility_off' : 'visibility';
      input.focus();
    });
    wrap.appendChild(btn);

    // Al enviar el formulario, siempre se vuelve a ocultar.
    if (input.form && !input.form.dataset.pwReset) {
      input.form.dataset.pwReset = '1';
      input.form.addEventListener('submit', function () {
        input.form.querySelectorAll('.pw-field input').forEach(function (i) {
          if (i.type === 'text' && i.dataset.pwEye) i.type = 'password';
        });
        input.form.querySelectorAll('.pw-eye').forEach(function (b) {
          b.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-label', _t('Mostrar la contraseña'));
          b.firstChild.textContent = 'visibility';
        });
      });
    }
  }

  function bindMatch(confirm) {
    if (confirm.dataset.pwMatchBound) return;
    var other = document.querySelector(confirm.dataset.match);
    if (!other) return;
    confirm.dataset.pwMatchBound = '1';

    var note = document.createElement('p');
    note.className = 'pw-match';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    var anchor = confirm.closest('.pw-field') || confirm;
    anchor.insertAdjacentElement('afterend', note);

    function check() {
      if (!confirm.value) { note.textContent = ''; note.className = 'pw-match'; confirm.setCustomValidity(''); return; }
      var ok = confirm.value === other.value;
      confirm.setCustomValidity(ok ? '' : _t('Las contraseñas no coinciden'));
      note.textContent = ok ? _t('✓ Las contraseñas coinciden') : _t('Las contraseñas no coinciden');
      note.className = 'pw-match ' + (ok ? 'is-ok' : 'is-ko');
    }
    confirm.addEventListener('input', check);
    other.addEventListener('input', check);
  }

  // Para quien envía el formulario por JS: true si coinciden (y avisa si no).
  window.PasswordFields = {
    matches: function (confirmEl) {
      if (!confirmEl) return true;
      var other = document.querySelector(confirmEl.dataset.match);
      var ok = !!other && confirmEl.value === other.value;
      if (!ok) { confirmEl.dispatchEvent(new Event('input')); confirmEl.focus(); }
      return ok;
    }
  };

  function scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('input[type="password"]').forEach(addEye);
    (root.querySelectorAll ? root : document).querySelectorAll('input[data-match]').forEach(bindMatch);
  }

  var css = document.createElement('style');
  css.textContent =
    '.pw-eye{position:absolute;right:.35rem;top:50%;transform:translateY(-50%);width:2.4rem;height:2.4rem;' +
    'display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;' +
    'border-radius:999px;color:#5b5f7a;cursor:pointer}' +
    '.pw-eye:hover{background:rgba(67,18,216,.08);color:#4312d8}' +
    '.pw-eye:focus-visible{outline:2px solid #4312d8;outline-offset:1px}' +
    '.pw-eye .material-symbols-outlined{font-size:20px}' +
    '.pw-field>input{margin-bottom:0 !important}' +
    '.pw-match{font-size:12px;font-weight:600;margin:.35rem 0 0;min-height:1em}' +
    '.pw-match.is-ok{color:#1f7a3a}.pw-match.is-ko{color:#b3261e}';
  document.head.appendChild(css);

  function start() {
    scan(document);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
