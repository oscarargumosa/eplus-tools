/* ═══════════════════════════════════════════════════════════════
   Admin › Presentaciones (#admin-presentaciones) — solo la cuenta dueña
   Diseños de Canva incrustados. El servidor (/v1/presentaciones) decide
   quién los ve; aquí solo se pinta.
   ═══════════════════════════════════════════════════════════════ */

const Presentaciones = (() => {
  let lista = [];
  let actual = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function pintar() {
    const root = $('#pres-root');
    if (!lista.length) {
      root.innerHTML = `<div class="pres-vacio"><span class="material-symbols-outlined">slideshow</span><p>Aún no hay presentaciones. Añade un enlace de Canva abajo.</p></div>${formulario()}`;
      enlazarForm();
      return;
    }
    if (!lista.some(p => p.id === actual)) actual = lista[0].id;
    const p = lista.find(x => x.id === actual);
    root.innerHTML = `
      <div class="pres-barra">
        <div class="pres-lista" role="tablist" aria-label="Presentaciones">
          ${lista.map(x => `<button type="button" role="tab" aria-selected="${x.id === actual}" class="pres-tab ${x.id === actual ? 'is-on' : ''}" data-id="${x.id}">${esc(x.title)}</button>`).join('')}
        </div>
        <div class="pres-acciones">
          <button type="button" class="pres-btn" id="pres-full"><span class="material-symbols-outlined">fullscreen</span>Pantalla completa</button>
          <a class="pres-btn" href="${esc(p.edit_url)}" target="_blank" rel="noopener"><span class="material-symbols-outlined">edit</span>Editar en Canva</a>
          <button type="button" class="pres-btn pres-btn--peligro" id="pres-borrar" title="Quitar de esta lista (no borra el diseño en Canva)"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </div>
      <div class="pres-marco" id="pres-marco">
        <iframe src="${esc(p.embed_url)}" title="${esc(p.title)}" loading="lazy" allowfullscreen allow="fullscreen"></iframe>
      </div>
      ${formulario()}`;
    root.querySelectorAll('.pres-tab').forEach(b => b.addEventListener('click', () => { actual = +b.dataset.id; pintar(); }));
    $('#pres-full').addEventListener('click', () => $('#pres-marco').requestFullscreen?.());
    $('#pres-borrar').addEventListener('click', async () => {
      if (!confirm(`¿Quitar «${p.title}» de esta lista? El diseño sigue en Canva.`)) return;
      try { await API.del(`/presentaciones/${p.id}`); await cargar(); }
      catch (e) { alert(e.message || 'No se ha podido quitar'); }
    });
    enlazarForm();
  }

  const formulario = () => `
    <details class="pres-nueva">
      <summary><span class="material-symbols-outlined">add</span>Añadir presentación de Canva</summary>
      <form id="pres-form" class="pres-form">
        <label>Título<input name="title" required maxlength="200" placeholder="Presentación IDIVAL"></label>
        <label>Enlace de Canva<input name="url" required placeholder="https://www.canva.com/design/…/edit"></label>
        <button type="submit" class="pres-btn pres-btn--primario">Guardar</button>
        <p class="pres-ayuda">Sirve el enlace de editar o el de ver. Solo tú ves esta lista; el diseño se muestra si en Canva está compartido por enlace.</p>
      </form>
    </details>`;

  function enlazarForm() {
    $('#pres-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const nueva = await API.post('/presentaciones', { title: f.get('title'), url: f.get('url') });
        actual = nueva.id;
        await cargar();
      } catch (err) { alert(err.message || 'No se ha podido guardar'); }
    });
  }

  async function cargar() {
    const root = $('#pres-root');
    try { lista = await API.get('/presentaciones'); pintar(); }
    catch (e) { root.innerHTML = `<div class="pres-vacio"><span class="material-symbols-outlined">lock</span><p>${esc(e.message || 'No disponible')}</p></div>`; }
  }

  return { init: cargar };
})();
