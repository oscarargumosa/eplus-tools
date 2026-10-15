/* ═══════════════════════════════════════════════════════════════
   Documents — My Documents module
   ═══════════════════════════════════════════════════════════════ */

const Documents = (() => {
  let docs = [];
  let initialized = false;

  /* ── Init ───────────────────────────────────────────────────── */
  async function init() {
    if (!initialized) {
      bindEvents();
      initialized = true;
    }
    await loadDocs();
  }

  /* ── Bind events ────────────────────────────────────────────── */
  function bindEvents() {
    document.getElementById('btn-upload-doc')?.addEventListener('click', () => showUploadModal(true));
    document.getElementById('btn-cancel-upload')?.addEventListener('click', () => showUploadModal(false));
    document.getElementById('doc-upload-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'doc-upload-modal') showUploadModal(false);
    });
    document.getElementById('doc-upload-form')?.addEventListener('submit', handleUpload);
  }

  /* ── Show/hide upload modal ─────────────────────────────────── */
  function showUploadModal(show) {
    const modal = document.getElementById('doc-upload-modal');
    if (show) {
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      document.getElementById('doc-upload-form').reset();
    }
  }

  /* ── Upload file ────────────────────────────────────────────── */
  async function handleUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('doc-file-input');
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', document.getElementById('doc-title-input').value || file.name);
    formData.append('description', document.getElementById('doc-desc-input').value);

    const docType = document.getElementById('doc-type-input').value;
    formData.append('doc_type', docType);

    const tagsRaw = document.getElementById('doc-tags-input').value;
    if (tagsRaw) {
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      formData.append('tags', JSON.stringify(tags));
    }

    try {
      const res = await fetch('/v1/documents/my', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API.getToken()}` },
        body: formData,
      });
      const json = await res.json();

      if (json.ok) {
        Toast.show('Document uploaded', 'ok');
        showUploadModal(false);
        await loadDocs();
      } else {
        Toast.show(json.error?.message || 'Upload failed', 'error');
      }
    } catch (err) {
      Toast.show('Upload failed', 'error');
    }
  }

  /* ── Load documents ─────────────────────────────────────────── */
  async function loadDocs() {
    try {
      docs = await API.get('/documents/my');
      render();
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }

  /* ── Render document list ───────────────────────────────────── */
  function render() {
    const container = document.getElementById('my-docs-list');
    if (!docs.length) {
      container.innerHTML = `
        <div class="text-center py-12 text-on-surface-variant">
          <span class="material-symbols-outlined text-[48px] opacity-30">folder_open</span>
          <p class="mt-2 text-sm">No documents yet. Upload your first file.</p>
        </div>`;
      return;
    }

    container.innerHTML = docs.map(doc => `
      <div class="flex items-center gap-4 p-4 bg-white rounded-2xl border border-outline-variant/30 hover:border-primary/40 transition-colors" data-doc-id="${doc.id}">
        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <span class="material-symbols-outlined text-primary text-[20px]">${fileIcon(doc.file_type)}</span>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-bold text-on-surface truncate">${esc(doc.title)}</h3>
          <p class="text-xs text-on-surface-variant mt-0.5">
            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${docTypeBadgeClass(doc.doc_type)}">${docTypeLabel(doc.doc_type)}</span>
            · ${formatFileSize(doc.file_size_bytes)} · ${formatDate(doc.created_at)}
            ${doc.status && doc.status !== 'active' ? ` · <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${doc.status === 'processing' ? 'bg-lavender-soft text-violet' : 'bg-error/10 text-error'}">${doc.status}</span>` : ''}
            ${doc.tags?.length ? ' · ' + doc.tags.map(t => `<span class="inline-block px-1.5 py-0.5 rounded bg-primary/8 text-primary text-[10px] font-medium">${esc(t)}</span>`).join(' ') : ''}
          </p>
          ${doc.description ? `<p class="text-xs text-on-surface-variant mt-1 truncate">${esc(doc.description)}</p>` : ''}
        </div>
        <div class="flex-shrink-0 flex items-center gap-1">
          <button class="btn-download-doc p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors" data-id="${doc.id}" title="Download">
            <span class="material-symbols-outlined text-[18px]">download</span>
          </button>
          <button class="btn-delete-doc p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors" data-id="${doc.id}" title="Delete">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    `).join('');

    // Bind action buttons
    container.querySelectorAll('.btn-download-doc').forEach(btn => {
      btn.addEventListener('click', () => downloadDoc(btn.dataset.id));
    });
    container.querySelectorAll('.btn-delete-doc').forEach(btn => {
      btn.addEventListener('click', () => deleteDoc(btn.dataset.id));
    });
  }

  /* ── Delete document ────────────────────────────────────────── */
  async function deleteDoc(id) {
    if (!confirm('Delete this document?')) return;
    try {
      await API.del(`/documents/my/${id}`);
      Toast.show('Document deleted', 'ok');
      await loadDocs();
    } catch (err) {
      Toast.show(err.message || 'Delete failed', 'error');
    }
  }

  /* ── Download document ──────────────────────────────────────── */
  async function downloadDoc(id) {
    try {
      const res = await fetch(`/v1/documents/download/${id}`, {
        headers: { 'Authorization': `Bearer ${API.getToken()}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?(.+?)"?$/);
      const filename = match ? decodeURIComponent(match[1]) : 'document';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      Toast.show(err.message || 'Download failed', 'error');
    }
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function fileIcon(type) {
    if (!type) return 'description';
    if (type.includes('pdf')) return 'picture_as_pdf';
    if (type.includes('word') || type.includes('document')) return 'article';
    if (type.includes('sheet') || type.includes('excel')) return 'table_chart';
    if (type.includes('csv')) return 'table_chart';
    return 'description';
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function docTypeLabel(type) {
    const labels = { support: 'Support', project: 'Project', evaluation: 'Evaluation', call: 'Call' };
    return labels[type] || type || 'Support';
  }

  function docTypeBadgeClass(type) {
    const classes = {
      // tertiary/warning/secondary no existen en la config de Tailwind: se pasan a la paleta
      support: 'bg-primary/10 text-primary',
      project: 'bg-lavender-soft text-violet',
      evaluation: 'bg-secondary-fixed/70 text-primary',
      call: 'bg-cream text-ink',
    };
    return classes[type] || 'bg-primary/10 text-primary';
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ── Public API ─────────────────────────────────────────────── */
  return { init, loadDocs };
})();
