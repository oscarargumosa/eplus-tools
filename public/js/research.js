/* ═══════════════════════════════════════════════════════════════
   Research — Library browser, user sources, OpenAlex search
   ═══════════════════════════════════════════════════════════════ */

const Research = (() => {
  let initialized = false;
  let currentResults = null;
  let currentPage = 1;
  let activeTab = 'library';

  /* ── Init ───────────────────────────────────────────────────── */
  function init() {
    if (!initialized) {
      bindEvents();
      initialized = true;
    }
    loadLibrary();
  }

  /* ── Bind events ────────────────────────────────────────────── */
  function bindEvents() {
    // Tabs
    document.querySelectorAll('.research-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Search form
    document.getElementById('research-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      currentPage = 1;
      if (activeTab === 'openalex') {
        searchOpenAlex();
      } else {
        // Search in library
        loadLibrary(document.getElementById('research-query').value.trim());
      }
    });

    // Pagination
    document.getElementById('research-prev')?.addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; searchOpenAlex(); }
    });
    document.getElementById('research-next')?.addEventListener('click', () => {
      currentPage++;
      searchOpenAlex();
    });

    // Upload paper
    document.getElementById('btn-upload-paper')?.addEventListener('click', () => toggleModal(true));
    document.getElementById('btn-cancel-paper-upload')?.addEventListener('click', () => toggleModal(false));
    document.getElementById('paper-upload-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'paper-upload-modal') toggleModal(false);
    });
    document.getElementById('paper-upload-form')?.addEventListener('submit', handleUpload);
  }

  /* ── Tab switching ──────────────────────────────────────────── */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.research-tab').forEach(t => {
      const isActive = t.dataset.tab === tab;
      t.classList.toggle('font-bold', isActive);
      t.classList.toggle('text-primary', isActive);
      t.classList.toggle('border-primary', isActive);
      t.classList.toggle('text-on-surface-variant', !isActive);
      t.classList.toggle('border-transparent', !isActive);
    });
    document.querySelectorAll('.research-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`research-tab-${tab}`)?.classList.remove('hidden');

    // Update search placeholder
    const input = document.getElementById('research-query');
    if (tab === 'openalex') {
      input.placeholder = 'Search OpenAlex — e.g. mathematics education schools Europe';
    } else {
      input.placeholder = 'Search the library — e.g. digital inclusion, STEM education...';
    }

    // Load content
    if (tab === 'library') loadLibrary();
    if (tab === 'my-sources') loadMySources();
  }

  /* ── Load library (public sources — only ready ones) ─────────── */
  async function loadLibrary(searchText) {
    const container = document.getElementById('research-library-list');
    container.innerHTML = loadingHTML();

    try {
      const sources = await API.get('/research/library');
      // Only show successfully processed sources in library
      let filtered = sources.filter(s => s.status === 'vectorized' || s.status === 'downloaded' || s.status === 'extracted');
      if (searchText) {
        const q = searchText.toLowerCase();
        filtered = filtered.filter(s =>
          s.title?.toLowerCase().includes(q) ||
          s.abstract?.toLowerCase().includes(q) ||
          s.topics?.some(t => t.toLowerCase().includes(q))
        );
      }
      renderSourceList(container, filtered, 'library');
    } catch (err) {
      container.innerHTML = errorHTML(err.message);
    }
  }

  /* ── Load my sources ────────────────────────────────────────── */
  async function loadMySources() {
    const container = document.getElementById('research-my-sources-list');
    container.innerHTML = loadingHTML();

    try {
      const sources = await API.get('/research/sources');
      const ready = sources.filter(s => s.status !== 'error');
      const failed = sources.filter(s => s.status === 'error');

      let html = '';

      // Ready sources
      if (ready.length) {
        html += renderSourceCards(ready, 'my');
      }

      // Failed sources — collapsible section
      if (failed.length) {
        html += `
          <div class="mt-6 border border-[#d6e949] rounded-xl overflow-hidden">
            <button id="btn-toggle-failed" class="w-full flex items-center justify-between px-4 py-3 bg-[#f3f8d2] hover:bg-secondary-fixed/40 transition-colors text-left">
              <span class="flex items-center gap-2 text-sm text-ink font-medium">
                <span class="material-symbols-outlined text-[18px]">warning</span>
                ${failed.length} source${failed.length > 1 ? 's' : ''} could not be downloaded automatically
              </span>
              <span class="material-symbols-outlined text-[16px] text-primary toggle-arrow">expand_more</span>
            </button>
            <div id="failed-sources-list" class="hidden">
              <div class="px-4 py-2 bg-[#f3f8d2]/50 border-b border-[#d6e949]/50">
                <p class="text-xs text-ink/80">These papers need to be downloaded manually from the source website and uploaded via "Upload Paper".</p>
              </div>
              ${renderSourceCards(failed, 'failed')}
            </div>
          </div>`;
      }

      if (!ready.length && !failed.length) {
        html = emptyHTML('library_books', 'No sources saved yet. Search OpenAlex or upload a paper.');
      }

      container.innerHTML = html;

      // Bind events
      container.querySelectorAll('.btn-delete-source').forEach(btn => {
        btn.addEventListener('click', () => deleteSource(btn.dataset.id));
      });
      document.getElementById('btn-toggle-failed')?.addEventListener('click', () => {
        const list = document.getElementById('failed-sources-list');
        const arrow = document.querySelector('.toggle-arrow');
        list.classList.toggle('hidden');
        arrow.textContent = list.classList.contains('hidden') ? 'expand_more' : 'expand_less';
      });
    } catch (err) {
      container.innerHTML = errorHTML(err.message);
    }
  }

  /* ── Search OpenAlex ────────────────────────────────────────── */
  async function searchOpenAlex() {
    const q = document.getElementById('research-query').value.trim();
    if (!q) return;

    const params = new URLSearchParams({ q, page: currentPage, per_page: 20 });
    const country = document.getElementById('research-country').value;
    if (country) params.set('country', country);
    const yearFrom = document.getElementById('research-year-from').value;
    if (yearFrom) params.set('year_from', yearFrom);
    const yearTo = document.getElementById('research-year-to').value;
    if (yearTo) params.set('year_to', yearTo);
    if (document.getElementById('research-oa-only').checked) params.set('open_access', '1');

    const container = document.getElementById('research-results');
    container.innerHTML = loadingHTML('Searching OpenAlex...');

    try {
      const data = await API.get(`/research/search?${params}`);
      currentResults = data;
      renderOpenAlexResults(data);
    } catch (err) {
      container.innerHTML = errorHTML(err.message);
    }
  }

  /* ── Render source cards (returns HTML string) ───────────────── */
  function renderSourceCards(sources, mode) {
    return sources.map(s => `
      <div class="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 hover:border-outline-variant/40 transition-colors ${mode === 'failed' ? 'opacity-70' : ''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              ${s.publication_year ? `<span class="text-[11px] text-on-surface-variant">${s.publication_year}</span>` : ''}
              ${s.citation_count ? `<span class="text-[11px] text-on-surface-variant">Cited: ${s.citation_count}</span>` : ''}
            </div>
            <h3 class="text-sm font-bold text-on-surface leading-snug">${esc(s.title)}</h3>
            ${formatAuthors(s.authors) ? `<p class="text-xs text-on-surface-variant mt-0.5">${formatAuthors(s.authors)}</p>` : ''}
            ${s.abstract ? `<p class="text-xs text-on-surface-variant/70 mt-1.5 leading-relaxed line-clamp-2">${esc(s.abstract.slice(0, 250))}</p>` : ''}
            ${s.topics?.length ? `<div class="flex flex-wrap gap-1 mt-2">${s.topics.slice(0, 5).map(t => `<span class="inline-block px-1.5 py-0.5 rounded bg-primary/8 text-primary text-[10px]">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="flex-shrink-0 flex flex-col gap-1.5">
            ${s.url ? `<a href="${s.url}" target="_blank" rel="noopener" class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-xs hover:text-primary hover:bg-primary/10 transition-colors"><span class="material-symbols-outlined text-[14px]">open_in_new</span>View</a>` : ''}
            ${mode === 'my' || mode === 'failed' ? `<button class="btn-delete-source flex items-center gap-1 px-3 py-1.5 rounded-lg text-on-surface-variant text-xs hover:text-error hover:bg-error/10 transition-colors" data-id="${s.id}"><span class="material-symbols-outlined text-[14px]">delete</span>Remove</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  /* ── Render source list (library view) ─────────────────────── */
  function renderSourceList(container, sources, mode) {
    if (!sources.length) {
      container.innerHTML = emptyHTML('library_books', 'The library is empty. Add sources from OpenAlex or upload papers.');
      return;
    }
    container.innerHTML = renderSourceCards(sources, mode);
  }

  /* ── Render OpenAlex results ────────────────────────────────── */
  function renderOpenAlexResults(data) {
    const container = document.getElementById('research-results');
    const info = document.getElementById('research-results-info');
    const pagination = document.getElementById('research-pagination');

    if (!data.results.length) {
      container.innerHTML = emptyHTML('search_off', 'No results found. Try different keywords.');
      info.classList.add('hidden');
      pagination.classList.add('hidden');
      return;
    }

    info.classList.remove('hidden');
    info.textContent = `${data.total.toLocaleString()} results — page ${data.page} of ${Math.ceil(data.total / data.perPage)}`;

    container.innerHTML = data.results.map((r, i) => `
      <div class="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 hover:border-outline-variant/40 transition-colors">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              ${r.is_open_access ? '<span class="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-secondary-fixed text-primary">Open Access</span>' : ''}
              ${r.publication_year ? `<span class="text-[11px] text-on-surface-variant">${r.publication_year}</span>` : ''}
              ${r.citation_count ? `<span class="text-[11px] text-on-surface-variant">Cited: ${r.citation_count}</span>` : ''}
              ${r.source_name ? `<span class="text-[11px] text-on-surface-variant truncate max-w-[200px]">${esc(r.source_name)}</span>` : ''}
            </div>
            <h3 class="text-sm font-bold text-on-surface leading-snug">${esc(r.title)}</h3>
            ${r.authors?.length ? `<p class="text-xs text-on-surface-variant mt-0.5">${formatAuthors(r.authors)}</p>` : ''}
            ${r.abstract ? `<p class="text-xs text-on-surface-variant/70 mt-1.5 leading-relaxed line-clamp-2">${esc(r.abstract.slice(0, 250))}</p>` : ''}
            ${r.topics?.length ? `<div class="flex flex-wrap gap-1 mt-2">${r.topics.slice(0, 4).map(t => `<span class="inline-block px-1.5 py-0.5 rounded bg-primary/8 text-primary text-[10px]">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="flex-shrink-0 flex flex-col gap-1.5">
            ${r.saved_id
              ? `<span class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium"><span class="material-symbols-outlined text-[14px]">check</span>Saved</span>`
              : `<button class="btn-save-source flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors" data-idx="${i}"><span class="material-symbols-outlined text-[14px]">bookmark_add</span>Save</button>`
            }
            ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-xs hover:text-primary hover:bg-primary/10 transition-colors"><span class="material-symbols-outlined text-[14px]">open_in_new</span>View</a>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Bind save buttons
    container.querySelectorAll('.btn-save-source').forEach(btn => {
      btn.addEventListener('click', () => saveFromOpenAlex(parseInt(btn.dataset.idx)));
    });

    // Pagination
    const totalPages = Math.ceil(data.total / data.perPage);
    if (totalPages > 1) {
      pagination.classList.remove('hidden');
      document.getElementById('research-page-info').textContent = `Page ${data.page} of ${totalPages}`;
      document.getElementById('research-prev').disabled = data.page <= 1;
      document.getElementById('research-next').disabled = data.page >= totalPages;
    } else {
      pagination.classList.add('hidden');
    }
  }

  /* ── Save from OpenAlex ─────────────────────────────────────── */
  async function saveFromOpenAlex(idx) {
    const r = currentResults?.results?.[idx];
    if (!r) return;

    try {
      const saved = await API.post('/research/sources', {
        external_id: r.external_id,
        source_api: 'openalex',
        title: r.title,
        authors: r.authors,
        publication_year: r.publication_year,
        abstract: r.abstract,
        url: r.url,
        pdf_url: r.pdf_url,
        language: r.language,
        is_open_access: r.is_open_access,
        citation_count: r.citation_count,
        topics: r.topics,
      });

      r.saved_id = saved.id;
      renderOpenAlexResults(currentResults);
      Toast.show('Added to your sources', 'ok');
    } catch (err) {
      Toast.show(err.message || 'Failed to save', 'error');
    }
  }

  /* ── Upload paper ───────────────────────────────────────────── */
  function toggleModal(show) {
    const modal = document.getElementById('paper-upload-modal');
    if (show) modal.classList.remove('hidden');
    else { modal.classList.add('hidden'); document.getElementById('paper-upload-form').reset(); }
  }

  async function handleUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById('paper-file');
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', document.getElementById('paper-title').value);
    formData.append('authors', document.getElementById('paper-authors').value);
    formData.append('year', document.getElementById('paper-year').value);
    formData.append('visibility', document.getElementById('paper-visibility').value);
    formData.append('topics', document.getElementById('paper-topics').value);

    try {
      const res = await fetch('/v1/research/sources/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API.getToken()}` },
        body: formData,
      });
      const json = await res.json();

      if (json.ok) {
        Toast.show('Paper added to your sources', 'ok');
        toggleModal(false);
        switchTab('my-sources');
      } else {
        Toast.show(json.error?.message || 'Upload failed', 'error');
      }
    } catch (err) {
      Toast.show('Upload failed', 'error');
    }
  }

  /* ── Delete source ──────────────────────────────────────────── */
  async function deleteSource(id) {
    if (!confirm('Remove this source?')) return;
    try {
      await API.del(`/research/sources/${id}`);
      Toast.show('Source removed', 'ok');
      loadMySources();
    } catch (err) {
      Toast.show(err.message || 'Failed', 'error');
    }
  }

  /* ── Helpers ────────────────────────────────────────────────── */
  function formatAuthors(authors) {
    if (!authors || !authors.length) return '';
    const names = authors.slice(0, 3).map(a => typeof a === 'string' ? a : a.name || '').filter(Boolean).join(', ');
    const more = authors.length > 3 ? ` +${authors.length - 3}` : '';
    return esc(names) + more;
  }

  function sourceApiBadge(api) {
    const m = { openalex: 'bg-primary/10 text-primary', upload: 'bg-lavender-soft text-violet', cordis: 'bg-secondary-fixed/70 text-primary' };
    return m[api] || 'bg-surface-container text-on-surface-variant';
  }
  function sourceApiLabel(api) {
    const m = { openalex: 'OpenAlex', upload: 'Uploaded', cordis: 'CORDIS' };
    return m[api] || api;
  }
  function statusBadge(s) {
    const m = { reference: 'bg-surface-container text-on-surface-variant', downloaded: 'bg-primary/10 text-primary', extracted: 'bg-lavender-soft text-violet', vectorized: 'bg-secondary-fixed text-primary', error: 'bg-error/10 text-error' };
    return m[s] || m.reference;
  }
  function statusLabel(s) {
    const m = { reference: 'Reference', downloaded: 'Downloaded', extracted: 'Extracted', vectorized: 'Vectorized', error: 'Error' };
    return m[s] || s;
  }

  function loadingHTML(msg) {
    return `<div class="text-center py-12 text-on-surface-variant"><span class="material-symbols-outlined text-[48px] animate-spin opacity-30">progress_activity</span><p class="mt-2 text-sm">${msg || 'Loading...'}</p></div>`;
  }
  function emptyHTML(icon, msg) {
    return `<div class="text-center py-12 text-on-surface-variant"><span class="material-symbols-outlined text-[48px] opacity-30">${icon}</span><p class="mt-2 text-sm">${msg}</p></div>`;
  }
  function errorHTML(msg) {
    return `<div class="text-center py-12 text-error"><span class="material-symbols-outlined text-[48px] opacity-30">error</span><p class="mt-2 text-sm">${esc(msg)}</p></div>`;
  }
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { init };
})();
