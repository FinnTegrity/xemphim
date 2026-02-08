const API_BASE = 'https://phimapi.com/';
const IMAGE_BASE = 'https://phimimg.com/';

const ENDPOINTS = {
  latest: (page) => `${API_BASE}/danh-sach/phim-moi-cap-nhat?page=${page}`,
  detail: (slug) => `${API_BASE}/phim/${slug}`,
  search: (keyword) => `${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}`,
};

// ---- DOM ----
const els = {
  movieList: document.getElementById('movie-list'),
  movieDetail: document.getElementById('movie-detail'),
  videoContainer: document.getElementById('video-container'),
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('searchButton'),
  clearSearch: document.getElementById('clearSearch'),
  emptyState: document.getElementById('emptyState'),
  backToLatest: document.getElementById('backToLatest'),
  sectionTitle: document.getElementById('sectionTitle'),
  sectionMeta: document.getElementById('sectionMeta'),
  subtitle: document.getElementById('subtitle'),
  sentinel: document.getElementById('sentinel'),
  sortSelect: document.getElementById('sortSelect'),
  tabLatest: document.getElementById('tabLatest'),
  tabMyList: document.getElementById('tabMyList'),
  themeToggle: document.getElementById('themeToggle'),
  homeButton: document.getElementById('homeButton'),
  netStatus: document.getElementById('netStatus'),
  modal: document.getElementById('modal'),
  modalClose: document.getElementById('modalClose'),
  toastStack: document.getElementById('toastStack'),
};

// ---- State ----
const state = {
  mode: 'latest', // latest | search | mylist
  page: 1,
  isLoading: false,
  hasMore: true,
  keyword: '',
  movies: [],
  detailCache: new Map(),
  myList: loadMyList(),
  theme: loadTheme(),
};

// ---- Boot ----
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  wireUI();
  updateOnlineUI(navigator.onLine);
  loadLatest(true);
});

// ---- UI Wiring ----
function wireUI() {
  // Search
  els.searchButton.addEventListener('click', () => runSearch());
  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
    if (e.key === 'Escape') {
      els.searchInput.blur();
      if (state.mode === 'search') backToLatest();
    }
  });
  els.clearSearch.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchInput.focus();
    els.clearSearch.classList.remove('show');
    if (state.mode === 'search') backToLatest();
  });
  els.searchInput.addEventListener('input', () => {
    const v = els.searchInput.value.trim();
    els.clearSearch.classList.toggle('show', v.length > 0);
    // debounce: auto search when user stops typing (optional but smooth)
    debounce(() => {
      const now = els.searchInput.value.trim();
      if (now.length >= 3) runSearch(now);
      if (now.length === 0 && state.mode === 'search') backToLatest();
    }, 350, 'search');
  });

  // Keyboard shortcut
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.searchInput) {
      e.preventDefault();
      els.searchInput.focus();
    }
    if (e.key === 'Escape' && !els.modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Tabs
  els.tabLatest.addEventListener('click', () => backToLatest());
  els.tabMyList.addEventListener('click', () => openMyList());
  els.backToLatest?.addEventListener('click', () => backToLatest());
  els.homeButton.addEventListener('click', () => backToLatest(true));

  // Sort
  els.sortSelect.addEventListener('change', () => {
    renderMovies(applySort([...state.movies]));
  });

  // Modal close
  els.modalClose.addEventListener('click', closeModal);
  els.modal.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.close) closeModal();
  });

  // Theme
  els.themeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    saveTheme(state.theme);
    applyTheme(state.theme);
    toast(`Đã chuyển sang ${state.theme === 'dark' ? 'Dark' : 'Light'} mode`);
  });

  // Online status
  window.addEventListener('online', () => updateOnlineUI(true));
  window.addEventListener('offline', () => updateOnlineUI(false));

  // Infinite scroll
  const io = new IntersectionObserver(
    (entries) => {
      const first = entries[0];
      if (first.isIntersecting) {
        if (state.mode === 'latest' && state.hasMore && !state.isLoading) loadLatest(false);
      }
    },
    { rootMargin: '800px 0px' }
  );
  io.observe(els.sentinel);
}

// ---- Data loading ----
async function loadLatest(reset) {
  state.mode = 'latest';
  setActiveTab('latest');

  if (reset) {
    state.page = 1;
    state.hasMore = true;
    state.movies = [];
    els.searchInput.value = '';
    els.clearSearch.classList.remove('show');
    els.subtitle.textContent = 'Danh sách mới cập nhật • cuộn để tải thêm';
  }

  setSection('Phim mới cập nhật', reset ? 'Đang tải…' : 'Đang tải thêm…');
  showEmpty(false);
  if (reset) {
    renderSkeleton(18);
  } else {
    renderSkeleton(6, true);
  }

  const pageToLoad = state.page;
  const url = ENDPOINTS.latest(pageToLoad);

  state.isLoading = true;
  try {
    const data = await safeJsonFetch(url);
    // expected shape: { status: true, items: [...] }
    const items = (data && data.items) ? data.items : [];

    if (!Array.isArray(items) || items.length === 0) {
      state.hasMore = false;
      if (state.movies.length === 0) showEmpty(true);
      setSection('Phim mới cập nhật', state.movies.length ? `${state.movies.length} phim` : '—');
      return;
    }

    const normalized = items.map(normalizeMovieCard);
    state.movies = state.movies.concat(normalized);
    state.page += 1;

    renderMovies(applySort([...state.movies]));
    setSection('Phim mới cập nhật', `${state.movies.length} phim`);
  } catch (err) {
    console.error(err);
    state.hasMore = false;
    setSection('Phim mới cập nhật', 'Lỗi tải dữ liệu');
    toast('Không tải được danh sách. Kiểm tra API_BASE hoặc mạng.', 'error');
    if (state.movies.length === 0) showEmpty(true);
  } finally {
    state.isLoading = false;
    cleanupSkeleton();
  }
}

async function runSearch(forceKeyword) {
  const keyword = (forceKeyword ?? els.searchInput.value).trim();
  if (!keyword) return backToLatest();

  state.mode = 'search';
  setActiveTab('search');
  state.keyword = keyword;

  setSection(`Kết quả: “${keyword}”`, 'Đang tìm…');
  els.subtitle.textContent = 'Chế độ tìm kiếm • nhấn ESC để quay về';
  showEmpty(false);
  state.isLoading = true;
  state.hasMore = false; // search endpoint không chắc có phân trang

  renderSkeleton(18);

  try {
    const data = await safeJsonFetch(ENDPOINTS.search(keyword));
    // expected: { data: { items: [...] } }
    const items = data?.data?.items ?? [];
    const normalized = Array.isArray(items) ? items.map(normalizeMovieCard) : [];
    state.movies = normalized;
    renderMovies(applySort([...state.movies]));
    setSection(`Kết quả: “${keyword}”`, `${state.movies.length} phim`);
    if (state.movies.length === 0) showEmpty(true);
  } catch (err) {
    console.error(err);
    toast('Tìm kiếm thất bại. Kiểm tra API_BASE hoặc cấu trúc phản hồi.', 'error');
    state.movies = [];
    renderMovies([]);
    showEmpty(true);
    setSection(`Kết quả: “${keyword}”`, 'Lỗi');
  } finally {
    state.isLoading = false;
    cleanupSkeleton();
  }
}

async function showMovieDetail(slug) {
  if (!slug) return;
  openModal();
  els.videoContainer.innerHTML = '';
  els.movieDetail.innerHTML = detailSkeleton();

  try {
    const cached = state.detailCache.get(slug);
    const data = cached ?? (await safeJsonFetch(ENDPOINTS.detail(slug)));
    if (!cached) state.detailCache.set(slug, data);

    if (!data || !data.movie) {
      els.movieDetail.innerHTML = detailError('Không đọc được dữ liệu phim.');
      return;
    }

    renderDetail(data);
  } catch (err) {
    console.error(err);
    els.movieDetail.innerHTML = detailError('Tải chi tiết thất bại.');
    toast('Không tải được chi tiết phim.', 'error');
  }
}

function renderDetail(data) {
  const movie = data.movie;
  const episodes = Array.isArray(data.episodes) ? data.episodes : [];
  const posterUrl = normalizePoster(movie.poster_url);
  const title = movie.name ?? 'Không rõ tên';
  const year = movie.year ?? '—';
  const content = stripHtml(movie.content ?? '');

  const isSaved = !!state.myList[movie.slug];

  els.movieDetail.innerHTML = `
    <div class="detailGrid">
      <div class="detailPoster">
        <img src="${escapeAttr(posterUrl)}" alt="${escapeAttr(title)}" loading="lazy" />
        <div class="detailActions">
          <button class="primary" id="detailSaveBtn" type="button">
            ${isSaved ? '✓ Đã lưu' : '+ Lưu My List'}
          </button>
          <button class="chip" id="detailCopyBtn" type="button">Sao chép tên</button>
        </div>
      </div>

      <div class="detailInfo">
        <div class="detailTitleRow">
          <h3 class="detailTitle">${escapeHtml(title)}</h3>
          <span class="badge">${escapeHtml(String(year))}</span>
        </div>
        <div class="detailMeta">
          ${movie.quality ? `<span class="pill">${escapeHtml(movie.quality)}</span>` : ''}
          ${movie.lang ? `<span class="pill">${escapeHtml(movie.lang)}</span>` : ''}
          ${movie.time ? `<span class="pill">${escapeHtml(movie.time)}</span>` : ''}
        </div>
        <p class="detailDesc muted">${escapeHtml(content || 'Chưa có mô tả.')}</p>

        <div class="detailSection">
          <div class="detailSectionHead">
            <h4>Tập</h4>
          </div>
          <div class="episode-list" id="episodeList"></div>
        </div>
      </div>
    </div>
  `;

  // Actions
  const saveBtn = document.getElementById('detailSaveBtn');
  const copyBtn = document.getElementById('detailCopyBtn');
  saveBtn?.addEventListener('click', () => {
    toggleMyList({
      slug: movie.slug,
      name: title,
      year,
      poster_url: movie.poster_url,
    });
    const nowSaved = !!state.myList[movie.slug];
    saveBtn.textContent = nowSaved ? '✓ Đã lưu' : '+ Lưu My List';
  });
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(title);
      toast('Đã sao chép tên phim');
    } catch {
      toast('Không thể sao chép', 'error');
    }
  });

  // Episodes
  const episodeListEl = document.getElementById('episodeList');
  const flatEpisodes = flattenEpisodes(episodes);
  if (flatEpisodes.length === 0) {
    episodeListEl.innerHTML = `<div class="muted" style="padding: 10px 0;">Chưa có tập / nguồn phát.</div>`;
    return;
  }

  episodeListEl.innerHTML = '';
  flatEpisodes.forEach((ep, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'episode-item';
    btn.textContent = ep.name || `Tập ${idx + 1}`;
    btn.addEventListener('click', () => {
      // highlight active
      [...episodeListEl.querySelectorAll('.episode-item')].forEach((b) => b.classList.remove('isActive'));
      btn.classList.add('isActive');
      renderPlayer(ep.link_embed);
    });
    episodeListEl.appendChild(btn);
  });
}

function renderPlayer(url) {
  // Không hard-code bất kỳ domain/nguồn cụ thể nào.
  if (!url) {
    els.videoContainer.innerHTML = `
      <div class="playerNotice">
        <div class="playerIcon" aria-hidden="true">▶</div>
        <div>
          <div class="playerTitle">Chưa có URL phát</div>
          <div class="muted">API không trả về link hợp lệ cho tập này.</div>
        </div>
      </div>
    `;
    return;
  }

  // Player: iframe generic (tuỳ API hợp pháp của bạn)
  els.videoContainer.innerHTML = `
    <div class="playerFrameWrap">
      <iframe
        src="${escapeAttr(url)}"
        title="Player"
        referrerpolicy="no-referrer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
  `;
  els.videoContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Rendering (cards/grid) ----
function renderMovies(movies) {
  cleanupSkeleton();
  els.movieList.innerHTML = '';

  if (!movies || movies.length === 0) {
    showEmpty(true);
    return;
  }
  showEmpty(false);

  const frag = document.createDocumentFragment();
  movies.forEach((m) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Xem chi tiết ${m.name}`);

    const saved = !!state.myList[m.slug];
    card.innerHTML = `
      <div class="poster">
        <img src="${escapeAttr(m.posterUrl)}" alt="${escapeAttr(m.name)}" loading="lazy" />
        <div class="posterOverlay">
          ${m.year ? `<span class="tag">${escapeHtml(String(m.year))}</span>` : ''}
          <button class="saveBtn ${saved ? 'isSaved' : ''}" type="button" title="${saved ? 'Bỏ lưu' : 'Lưu My List'}">${saved ? '♥' : '♡'}</button>
        </div>
      </div>
      <div class="cardBody">
        <h3 class="cardTitle" title="${escapeAttr(m.name)}">${escapeHtml(m.name)}</h3>
        <p class="cardMeta muted">${escapeHtml(m.subtitle)}</p>
      </div>
    `;

    // Save button
    const saveBtn = card.querySelector('.saveBtn');
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMyList({ slug: m.slug, name: m.name, year: m.year, poster_url: m.rawPoster });
      const nowSaved = !!state.myList[m.slug];
      saveBtn.classList.toggle('isSaved', nowSaved);
      saveBtn.textContent = nowSaved ? '♥' : '♡';
      saveBtn.title = nowSaved ? 'Bỏ lưu' : 'Lưu My List';
    });

    // Open detail
    card.addEventListener('click', () => showMovieDetail(m.slug));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showMovieDetail(m.slug);
      }
    });

    frag.appendChild(card);
  });

  els.movieList.appendChild(frag);
}

function renderSkeleton(count, append = false) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'card skeleton';
    s.innerHTML = `
      <div class="poster skBlock"></div>
      <div class="cardBody">
        <div class="skLine"></div>
        <div class="skLine short"></div>
      </div>
    `;
    frag.appendChild(s);
  }
  if (!append) els.movieList.innerHTML = '';
  els.movieList.appendChild(frag);
}

function cleanupSkeleton() {
  els.movieList.querySelectorAll('.skeleton').forEach((n) => n.remove());
}

// ---- Mode / Tabs ----
function backToLatest(forceReset = false) {
  state.keyword = '';
  state.mode = 'latest';
  setActiveTab('latest');
  loadLatest(forceReset || state.movies.length === 0);
}

function openMyList() {
  state.mode = 'mylist';
  setActiveTab('mylist');
  const items = Object.values(state.myList).map(normalizeMovieCard);
  state.movies = items;
  setSection('My List', `${items.length} phim`);
  els.subtitle.textContent = 'Danh sách bạn đã lưu • nhấn ♥ để bỏ lưu';
  renderMovies(applySort([...items]));
  if (items.length === 0) showEmpty(true);
}

function setActiveTab(which) {
  const set = (el, on) => el.classList.toggle('isActive', on);
  set(els.tabLatest, which === 'latest' || which === 'search');
  set(els.tabMyList, which === 'mylist');
}

function setSection(title, meta) {
  els.sectionTitle.textContent = title;
  els.sectionMeta.textContent = meta;
}

function showEmpty(show) {
  els.emptyState.classList.toggle('hidden', !show);
  els.movieList.classList.toggle('hidden', show);
}

// ---- Modal ----
function openModal() {
  els.modal.classList.remove('hidden');
  els.modal.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('modalOpen');
}

function closeModal() {
  els.modal.classList.add('hidden');
  els.modal.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('modalOpen');
  els.videoContainer.innerHTML = '';
}

// ---- Helpers ----
function normalizePoster(posterUrl) {
  if (!posterUrl) return '';
  if (posterUrl.startsWith('http')) return posterUrl;
  // If API returns relative paths, prefix with IMAGE_BASE
  return `${IMAGE_BASE}${posterUrl.replace(/^\//, '')}`;
}

function normalizeMovieCard(movie) {
  const name = movie?.name ?? 'Không rõ tên';
  const slug = movie?.slug ?? '';
  const year = movie?.year ?? movie?.release_year ?? '';
  const rawPoster = movie?.poster_url ?? movie?.thumb_url ?? '';
  const posterUrl = normalizePoster(rawPoster);
  const subtitle = year ? `Năm ${year}` : (movie?.origin_name ? String(movie.origin_name) : '');
  return { name, slug, year, rawPoster, posterUrl, subtitle };
}

function flattenEpisodes(episodes) {
  const out = [];
  episodes.forEach((ep) => {
    const list = Array.isArray(ep?.server_data) ? ep.server_data : [];
    list.forEach((s) => out.push({
      name: s?.name,
      link_embed: s?.link_embed,
    }));
  });
  return out;
}

async function safeJsonFetch(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Một số API trả {status:false,...}
  if (data && data.status === false) throw new Error('API status=false');
  return data;
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html);
  return (div.textContent || div.innerText || '').trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  // Keep it simple for attributes
  return escapeHtml(str).replace(/\s+/g, ' ').trim();
}

function debounce(fn, ms, key = 'default') {
  debounce.timers ??= {};
  clearTimeout(debounce.timers[key]);
  debounce.timers[key] = setTimeout(fn, ms);
}

function applySort(list) {
  const mode = els.sortSelect.value;
  if (mode === 'az') {
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
  }
  if (mode === 'newest') {
    return list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  }
  return list; // recommended (giữ thứ tự API)
}

function updateOnlineUI(online) {
  els.netStatus.textContent = online ? '● Online' : '● Offline';
  els.netStatus.classList.toggle('isOffline', !online);
}

// ---- My List (localStorage) ----
function loadMyList() {
  try {
    const raw = localStorage.getItem('xemphim_mylist');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMyList() {
  try {
    localStorage.setItem('xemphim_mylist', JSON.stringify(state.myList));
  } catch {
    // ignore
  }
}

function toggleMyList(movie) {
  if (!movie?.slug) return;
  if (state.myList[movie.slug]) {
    delete state.myList[movie.slug];
    toast('Đã bỏ khỏi My List');
  } else {
    state.myList[movie.slug] = movie;
    toast('Đã lưu vào My List');
  }
  saveMyList();

  // Nếu đang ở tab My List -> re-render
  if (state.mode === 'mylist') openMyList();
}

// ---- Theme ----
function loadTheme() {
  const saved = localStorage.getItem('xemphim_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark'; // mặc định luôn dark
}

function saveTheme(t) {
  try { localStorage.setItem('xemphim_theme', t); } catch {}
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  els.themeToggle.textContent = t === 'dark' ? '☾' : '☀';
}

// ---- Toast ----
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toastDot" aria-hidden="true"></div>
    <div class="toastMsg">${escapeHtml(message)}</div>
  `;
  els.toastStack.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2400);
}

// ---- Detail skeleton/error ----
function detailSkeleton() {
  return `
    <div class="detailGrid">
      <div class="detailPoster">
        <div class="skPoster"></div>
        <div class="detailActions">
          <div class="skBtn"></div>
          <div class="skBtn"></div>
        </div>
      </div>
      <div class="detailInfo">
        <div class="skTitle"></div>
        <div class="skLine"></div>
        <div class="skLine"></div>
        <div class="skLine short"></div>
        <div style="height:12px"></div>
        <div class="skLine"></div>
        <div class="skLine"></div>
      </div>
    </div>
  `;
}

function detailError(msg) {
  return `
    <div class="playerNotice">
      <div class="playerIcon" aria-hidden="true">⚠</div>
      <div>
        <div class="playerTitle">Có lỗi</div>
        <div class="muted">${escapeHtml(msg)}</div>
      </div>
    </div>
  `;
}
