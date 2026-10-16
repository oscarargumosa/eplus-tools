/* ═══════════════════════════════════════════════════════════════
   Entidades reclamadas (solo admin) — #admin-org-claims
   Lista las entidades con documentación aportada por su dueño.
   «Ver» abre el documento (petición autenticada, nunca por URL
   estática); «Verificar» pone el sello y «Rechazar» lo quita, con
   correo a la persona. API: /v1/admin/org-claims.
   ═══════════════════════════════════════════════════════════════ */

const AdminOrgClaims = (() => {
  const state = { status: 'pending' };
  let bound = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? '—' : dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const kb = (n) => n ? (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB') : '';
  const DOC_LABEL = { estatutos: 'Estatutos', escrituras: 'Escrituras', acta_constitucion: 'Acta de constitución', poderes: 'Acreditación de poderes', otro: 'Otro documento' };
  const STATUS = {
    pending:  ['Pendiente de revisión', 'bg-lavender-soft text-primary'],
    verified: ['Verificada', 'bg-[#f3f8d2] text-primary border border-secondary-fixed'],
    rejected: ['Rechazada', 'bg-error-container text-on-error-container'],
  };
  const announce = (msg) => { const el = document.getElementById('aoc-status-live'); if (el) el.textContent = msg; };

  function bind() {
    if (bound) return;
    bound = true;
    document.getElementById('aoc-status')?.addEventListener('change', (e) => { state.status = e.target.value; load(); });
    document.getElementById('aoc-list')?.addEventListener('click', onClick);
    document.getElementById('aoc-disputes')?.addEventListener('click', onClick);
  }

  function init() { bind(); load(); }

  function setCount(n) {
    const el = document.getElementById('admin-org-claims-count');
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n || '');
    el.classList.toggle('hidden', !n);
  }

  async function refreshCount() {
    try { const d = await API.get('/admin/org-claims/pending-count'); setCount(d.count); } catch { /* sin contador */ }
  }

  async function load() {
    const list = document.getElementById('aoc-list');
    if (!list) return;
    list.innerHTML = '<p class="py-8 text-center text-on-surface-variant text-sm">Cargando…</p>';
    try {
      const d = await API.get('/admin/org-claims?status=' + encodeURIComponent(state.status));
      setCount(d.pending_total);
      render(d);
    } catch (e) {
      list.innerHTML = `<p class="py-8 text-center text-error text-sm">${esc(e.message || 'No se pudo cargar')}</p>`;
    }
  }

  function card(o) {
    const st = STATUS[o.verification_status] || ['Sin documentación', 'bg-surface-container-low text-on-surface-variant'];
    const docs = o.documents.length
      ? o.documents.map(d => `<li class="flex flex-wrap items-center gap-2 py-1.5">
          <span class="material-symbols-outlined text-[18px] text-on-surface-variant">description</span>
          <span class="text-xs font-semibold text-primary">${esc(DOC_LABEL[d.doc_type] || 'Documento')}</span>
          <span class="text-xs text-on-surface-variant break-all min-w-0 flex-1">${esc(d.original_name)} · ${esc(kb(d.size_bytes))} · ${fmt(d.created_at)}</span>
          <button type="button" data-act="view" data-org="${esc(o.id)}" data-doc="${esc(d.id)}" data-name="${esc(d.original_name)}"
            class="px-3 py-1 rounded-full border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/5">Ver documento</button>
        </li>`).join('')
      : '<li class="text-xs text-on-surface-variant py-1.5">Sin documentos.</li>';
    const canVerify = o.verification_status !== 'verified';
    const canReject = o.verification_status !== 'rejected';
    return `<article class="bg-white border border-outline-variant/30 rounded-xl p-4 sm:p-5">
      <div class="flex flex-wrap items-start gap-3">
        <div class="flex-1 min-w-[200px]">
          <h3 class="font-bold text-on-surface break-words">${esc(o.organization_name || '(sin nombre)')}</h3>
          <div class="text-xs text-on-surface-variant mt-0.5 break-words">
            ${[o.city, o.country].filter(Boolean).map(esc).join(', ')}
            ${o.oid ? ` · OID <span class="font-mono">${esc(o.oid)}</span>` : ''}${o.pic ? ` · PIC <span class="font-mono">${esc(o.pic)}</span>` : ''}
          </div>
          <div class="text-xs text-on-surface-variant mt-1 break-all">Dueño: <b class="text-on-surface">${esc(o.owner_name || '—')}</b> ${o.owner_email ? '&lt;' + esc(o.owner_email) + '&gt;' : ''} · reclamada ${fmt(o.claimed_at)}</div>
          ${o.verification_note ? `<div class="text-xs text-on-surface-variant italic mt-1">Nota: «${esc(o.verification_note)}»</div>` : ''}
        </div>
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${st[1]}">${esc(st[0])}</span>
      </div>
      <ul class="mt-3 border-t border-outline-variant/20 pt-2">${docs}</ul>
      <div class="flex flex-wrap gap-2 mt-3">
        ${canVerify ? `<button type="button" data-act="verify" data-org="${esc(o.id)}" class="px-4 py-1.5 rounded-full bg-secondary-fixed text-primary text-xs font-bold">Verificar</button>` : ''}
        ${canReject ? `<button type="button" data-act="reject" data-org="${esc(o.id)}" class="px-4 py-1.5 rounded-full border border-outline-variant/60 text-on-surface-variant text-xs font-semibold">${o.verification_status === 'verified' ? 'Retirar sello' : 'Rechazar'}</button>` : ''}
      </div>
    </article>`;
  }

  function disputeCard(d) {
    return `<article class="bg-white border border-outline-variant/30 rounded-xl p-4">
      <div class="font-bold text-on-surface break-words">${esc(d.organization_name)} ${d.oid ? `<span class="font-mono text-xs text-on-surface-variant">${esc(d.oid)}</span>` : ''}</div>
      <div class="text-xs text-on-surface-variant mt-1 break-all">Reclama: <b class="text-on-surface">${esc(d.claimant_name || '—')}</b> &lt;${esc(d.claimant_email || '')}&gt; · ${fmt(d.created_at)}</div>
      <div class="text-xs text-on-surface-variant break-all">Dueño actual: <b class="text-on-surface">${esc(d.owner_name || '—')}</b> &lt;${esc(d.owner_email || '')}&gt; · documentos del dueño: ${Number(d.owner_docs) || 0}</div>
      ${d.message ? `<div class="text-xs italic text-on-surface-variant mt-1 break-words">«${esc(d.message)}»</div>` : ''}
      <button type="button" data-act="resolve" data-id="${esc(d.id)}" class="mt-2 px-4 py-1.5 rounded-full border border-outline-variant/60 text-on-surface-variant text-xs font-semibold">Marcar como resuelto</button>
    </article>`;
  }

  function render(d) {
    const list = document.getElementById('aoc-list');
    list.innerHTML = d.items.length
      ? d.items.map(card).join('')
      : '<p class="py-8 text-center text-on-surface-variant text-sm">No hay entidades con este filtro.</p>';
    const disp = document.getElementById('aoc-disputes');
    if (disp) {
      disp.innerHTML = (d.disputes || []).length
        ? d.disputes.map(disputeCard).join('')
        : '<p class="text-sm text-on-surface-variant">No hay conflictos abiertos.</p>';
    }
  }

  /* El documento sale por la API con el token (nunca por URL pública). */
  async function viewDoc(orgId, docId, name) {
    const res = await fetch(`/v1/organizations/${encodeURIComponent(orgId)}/claim-docs/${encodeURIComponent(docId)}/file`, {
      headers: { 'Authorization': 'Bearer ' + API.getToken() },
    });
    if (!res.ok) throw new Error('No se pudo abrir el documento');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    // PDF e imágenes se ven en otra pestaña; el resto (Word) se descarga.
    if (/^(application\/pdf|image\/)/.test(blob.type)) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = name || 'documento';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function onClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    btn.disabled = true;
    try {
      if (act === 'view') {
        await viewDoc(btn.dataset.org, btn.dataset.doc, btn.dataset.name);
        btn.disabled = false;
        return;
      }
      if (act === 'verify') {
        if (!await Modal.confirm('¿Verificar esta entidad? Su ficha llevará el sello «Verificada» y su dueño recibirá un correo.')) { btn.disabled = false; return; }
        await API.post(`/admin/org-claims/${encodeURIComponent(btn.dataset.org)}/verify`, {});
        announce('Entidad verificada.');
        Toast.show('Entidad verificada. Le hemos escrito a su dueño.', 'ok');
      } else if (act === 'reject') {
        const note = await Modal.prompt('Motivo del rechazo (se lo enviamos por correo a la persona):', '', { placeholder: 'Ej.: el documento no acredita los poderes' });
        if (note === null) { btn.disabled = false; return; }
        await API.post(`/admin/org-claims/${encodeURIComponent(btn.dataset.org)}/reject`, { note });
        announce('Documentación rechazada.');
        Toast.show('Rechazada. Le hemos escrito a su dueño.', 'ok');
      } else if (act === 'resolve') {
        if (!await Modal.confirm('¿Marcar este conflicto como resuelto?')) { btn.disabled = false; return; }
        await API.post(`/admin/org-claims/disputes/${encodeURIComponent(btn.dataset.id)}/resolve`, {});
        Toast.show('Conflicto cerrado', 'ok');
      }
      await load();
    } catch (err) {
      btn.disabled = false;
      Toast.show(err.message || 'No se pudo guardar', 'error');
    }
  }

  return { init, refreshCount };
})();
