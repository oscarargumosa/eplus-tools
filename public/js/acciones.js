/* ═══════════════════════════════════════════════════════════════
   Acciones — eventos sin handlers en línea (CSP sin 'unsafe-inline').

   En vez de onclick="Master.compileV1('abc')" las plantillas llevan:
     data-action="Master.compileV1" data-args="${Acciones.args('abc')}"
   y para otros eventos data-on-<evento>: data-on-change, data-on-input,
   data-on-blur, data-on-keydown, data-on-error, data-on-drop…

   El nombre de la acción es:
     · «Modulo.metodo» de un módulo registrado con Acciones.modulo('Modulo', Modulo):
       se llama Modulo.metodo(...args).
     · o una acción registrada con Acciones.registrar({ nombre: (el, ev, ...args) => … }):
       `el` es el elemento que lleva el atributo (el antiguo `this`) y `ev`
       el evento. Devolver false equivale al antiguo `return false`.
   data-args es un array JSON (Acciones.args lo escapa para el atributo). Si un
   elemento escucha varios eventos con argumentos distintos, data-args-<evento>
   (p. ej. data-args-drop) manda sobre data-args para ese evento.
   Marcadores dentro de args: Acciones.ESTE (el elemento), Acciones.EVENTO,
   Acciones.VALOR (el.value), Acciones.MARCADO (el.checked) y
   Acciones.ENTERO (parseInt(el.value)).

   Cómo se engancha: un listener en fase de captura en document ve pasar
   cada evento y, antes de que llegue al destino, añade un listener directo
   a los elementos del camino que llevan el atributo (una vez por elemento
   y tipo). Así el manejador corre en el propio elemento, igual que el
   antiguo atributo on*: stopPropagation, preventDefault y el orden frente
   a los listeners de los ancestros se comportan como antes.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const acciones = Object.create(null);   // nombre → fn(el, ev, ...args)
  const modulos  = Object.create(null);   // 'Master' → objeto del módulo
  const TIPOS = ['click', 'change', 'input', 'blur', 'focus', 'keydown', 'keyup',
                 'submit', 'error', 'load', 'drop', 'dragover', 'dragleave', 'dragenter'];
  const ligados = new WeakMap();          // elemento → Set de tipos ya enganchados

  // Marcadores para pasar el elemento, el evento o su valor como argumento
  const ESTE = { $: 'este' }, EVENTO = { $: 'evento' }, VALOR = { $: 'valor' },
        MARCADO = { $: 'marcado' }, ENTERO = { $: 'entero' };

  function atributo(tipo) { return tipo === 'click' ? 'data-action' : 'data-on-' + tipo; }

  function leerArgs(el, ev) {
    // data-args-<evento> manda sobre data-args (elementos con varios eventos)
    const raw = el.getAttribute('data-args-' + ev.type) ?? el.getAttribute('data-args');
    if (!raw) return [];
    let args;
    try { args = JSON.parse(raw); } catch (_) { return []; }
    if (!Array.isArray(args)) return [];
    return args.map(a => {
      if (a && typeof a === 'object' && !Array.isArray(a) && Object.keys(a).length === 1 && typeof a.$ === 'string') {
        if (a.$ === 'este')    return el;
        if (a.$ === 'evento')  return ev;
        if (a.$ === 'valor')   return el.value;
        if (a.$ === 'marcado') return el.checked;
        if (a.$ === 'entero')  return parseInt(el.value);
      }
      return a;
    });
  }

  function ejecutar(el, ev, tipo) {
    const nombre = el.getAttribute(atributo(tipo));
    if (nombre) llamar(nombre, el, ev);
  }

  function llamar(nombre, el, ev) {
    const fn = acciones[nombre];
    if (fn) {
      if (fn.call(el, el, ev, ...leerArgs(el, ev)) === false) ev.preventDefault();
      return;
    }
    const p = nombre.indexOf('.');
    if (p > 0) {
      const obj = modulos[nombre.slice(0, p)];
      const metodo = nombre.slice(p + 1);
      if (obj && typeof obj[metodo] === 'function') obj[metodo](...leerArgs(el, ev));
    }
    // Nombre desconocido: puede ser un data-action local de otro módulo
    // (entidades, organizaciones, listas), que engancha sus propios listeners.
  }

  function enganchar(ev) {
    const tipo = ev.type;
    const attr = atributo(tipo);
    const camino = ev.composedPath ? ev.composedPath() : [];
    for (const n of camino) {
      if (!(n instanceof Element) || !n.hasAttribute(attr)) continue;
      let tipos = ligados.get(n);
      if (!tipos) ligados.set(n, tipos = new Set());
      if (tipos.has(tipo)) continue;
      tipos.add(tipo);
      n.addEventListener(tipo, function (e) { ejecutar(this, e, tipo); });
    }
  }
  TIPOS.forEach(t => document.addEventListener(t, enganchar, true));

  function escAttr(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* Acciones comunes a varias pantallas */
  Object.assign(acciones, {
    // onclick="event.stopPropagation()"
    'parar': (el, ev) => { ev.stopPropagation(); },
    // onerror="this.style.display='none'" (logos que no cargan)
    'img.ocultar': (el) => { el.style.display = 'none'; },
    // onclick="location.hash='…'"
    'ir': (el, ev, hash) => { location.hash = hash; },
    // onclick="document.getElementById('…').click()"
    'pulsar': (el, ev, id) => { document.getElementById(id)?.click(); },
    // onclick="document.getElementById('…').classList.add('hidden')"
    'ocultar': (el, ev, id) => { document.getElementById(id).classList.add('hidden'); },
    // oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
    'textarea.autoalto': (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; },
    // ondragover="event.preventDefault(); this.classList.add('<clase>')" / ondragleave="this.classList.remove('<clase>')"
    'arrastre.sobre': (el, ev, clase) => { ev.preventDefault(); el.classList.add(clase); },
    'arrastre.fuera': (el, ev, clase) => { el.classList.remove(clase); },
    // onkeydown="if(event.key==='Enter')this.blur()"
    'enter.salir': (el, ev) => { if (ev.key === 'Enter') el.blur(); },
    // onclick="document.querySelectorAll('.<clase>').forEach(r=>r.classList.toggle('hidden'))"
    'alternarFilas': (el, ev, clase) => { document.querySelectorAll('.' + clase).forEach(r => r.classList.toggle('hidden')); },
    // onclick="document.getElementById('<id>').classList.toggle('hidden');this.querySelector('<flecha>').classList.toggle('rotate-180')"
    'desplegar': (el, ev, id, flecha) => {
      document.getElementById(id).classList.toggle('hidden');
      el.querySelector(flecha).classList.toggle('rotate-180');
    },
    // onclick="this.nextElementSibling.classList.toggle('hidden');this.querySelector('<flecha>').classList.toggle('rotate-180')"
    'desplegarSiguiente': (el, ev, flecha) => {
      el.nextElementSibling.classList.toggle('hidden');
      el.querySelector(flecha).classList.toggle('rotate-180');
    },
    // onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();X(args)}"
    // La acción X va en data-enviar y usa los mismos data-args.
    'enter.enviar': (el, ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); llamar(el.getAttribute('data-enviar'), el, ev); }
    },
  });

  window.Acciones = {
    ESTE, EVENTO, VALOR, MARCADO, ENTERO,
    registrar(mapa) { Object.assign(acciones, mapa); },
    modulo(nombre, obj) { modulos[nombre] = obj; },
    // Valor de data-args ya escapado para ir entre comillas dobles
    args(...valores) { return escAttr(JSON.stringify(valores)); },
    // Escapa un valor suelto para un atributo data-*
    attr(v) { return escAttr(v == null ? '' : v); },
    // ¿Hay algo que ejecutar con ese nombre? (pruebas)
    existe(nombre) {
      if (acciones[nombre]) return true;
      const p = String(nombre).indexOf('.');
      const obj = p > 0 ? modulos[nombre.slice(0, p)] : null;
      return !!obj && typeof obj[nombre.slice(p + 1)] === 'function';
    },
  };
})();
