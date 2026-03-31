/** @type {{ id: number, name: string, song_count: number, ranked_count: number, updated_at: string }[]} */
let artistIndex = [];

/** @type {{ total_artists: number, total_songs: number }} */
let metadata = {};

/** @type {Map<number, Artist>} */
const artistCache = new Map();

/** Currently selected mode filter; null = all */
let selectedMode = null;

const MODE_ORDER = ['osu', 'taiko', 'fruits', 'mania'];

/** @type {HTMLAudioElement|null} */
let currentAudio = null;
/** @type {HTMLButtonElement|null} */
let currentPlayBtn = null;
/** @type {string|null} */
let currentAudioUrl = null;

/**
 * @typedef {{ title: string, preview: string, ranked_modes: string[], beatmapset_ids_by_mode: Record<string, number[]> }} Track
 * @typedef {{ id: number, name: string, tracks: Track[], updated_at: string }} Artist
 */

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch('./data/index.json');
  if (!res.ok) throw new Error(`Failed to load index.json: ${res.status}`);
  const data = await res.json();
  artistIndex = data.artists;
  metadata = data.metadata;

  setupSearch();
  setupModeFilter();
  createAudioPlayer();

  const params = new URLSearchParams(window.location.search);
  const q = params.get('artist');
  if (q) {
    const entry = artistIndex.find(a => a.name.toLowerCase() === q.toLowerCase());
    if (entry) {
      document.getElementById('search').value = entry.name;
      const artist = await loadArtist(entry.id);
      if (artist) renderArtist(artist);
      return;
    }
  }

  showPlaceholder();
}

// ── Mode filter ─────────────────────────────────────────────────────────────

function setupModeFilter() {
  const select = document.getElementById('mode-filter');
  select.addEventListener('change', () => {
    selectedMode = select.value || null;
    const card = document.querySelector('.artist-card');
    if (card) {
      const id = Number(card.dataset.artistId);
      if (artistCache.has(id)) renderArtist(artistCache.get(id));
    }
  });
}

// ── Search ──────────────────────────────────────────────────────────────────

function setupSearch() {
  const input       = document.getElementById('search');
  const suggestions = document.getElementById('suggestions');

  let activeIndex = -1;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    activeIndex = -1;

    if (!q) {
      hideSuggestions();
      showPlaceholder();
      return;
    }

    const matches = artistIndex
      .filter(a => a.name.toLowerCase().includes(q))
      .slice(0, 8);

    if (!matches.length) {
      hideSuggestions();
      showMessage(`no artist matching "${input.value.trim()}"`);
      return;
    }

    renderSuggestions(matches, input, suggestions, async (entry) => {
      input.value = entry.name;
      hideSuggestions();
      const artist = await loadArtist(entry.id);
      if (artist) renderArtist(artist);
    });
  });

  input.addEventListener('keydown', (e) => {
    const items = suggestions.querySelectorAll('.suggestion-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActive(items, activeIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive(items, activeIndex);
    } else if (e.key === 'Enter') {
      const target = activeIndex >= 0 ? items[activeIndex] : items[0];
      if (target) target.click();
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper') && !e.target.closest('.mode-filter-wrapper')) {
      hideSuggestions();
    }
  });

  function hideSuggestions() {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    activeIndex = -1;
  }
}

/**
 * @param {{ id: number, name: string }[]} matches
 * @param {HTMLInputElement} input
 * @param {HTMLElement} container
 * @param {(a: { id: number, name: string }) => void} onSelect
 */
function renderSuggestions(matches, input, container, onSelect) {
  container.innerHTML = '';
  container.hidden = false;

  for (const entry of matches) {
    const el = document.createElement('div');
    el.className = 'suggestion-item';
    el.textContent = entry.name;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(entry);
    });
    container.appendChild(el);
  }
}

/** @param {NodeList} items @param {number} index */
function updateActive(items, index) {
  items.forEach((el, i) => el.classList.toggle('active', i === index));
}

// ── Data loading ─────────────────────────────────────────────────────────────

/** @param {number} id @returns {Promise<Artist|null>} */
async function loadArtist(id) {
  if (artistCache.has(id)) return artistCache.get(id);

  const res = await fetch(`./data/artists/${id}.json`);
  if (!res.ok) {
    showMessage(`failed to load artist data (${res.status})`);
    return null;
  }
  const artist = await res.json();
  artistCache.set(id, artist);
  return artist;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * @param {Track} track
 * @returns {boolean}
 */
function isRankedInMode(track) {
  if (!selectedMode) return track.ranked_modes.length > 0;
  return track.ranked_modes.includes(selectedMode);
}

// ── Render ──────────────────────────────────────────────────────────────────

/** @param {Artist} artist */
function renderArtist(artist) {
  const resultsEl = document.getElementById('results');

  const params = new URLSearchParams({ artist: artist.name });
  history.replaceState(null, '', `?${params}`);

  const ranked = artist.tracks.filter(t => isRankedInMode(t)).length;
  const total  = artist.tracks.length;

  const card = document.createElement('div');
  card.className = 'artist-card';
  card.dataset.artistId = artist.id;

  card.innerHTML = `
    <div class="artist-header">
      <a class="artist-name" href="https://osu.ppy.sh/beatmaps/artists/${artist.id}" target="_blank" rel="noopener">${escHtml(artist.name)}</a>
      <span class="artist-stats">
        <span class="hit">${ranked}</span> ranked / <span class="miss">${total - ranked}</span> unranked
      </span>
    </div>
    <ul class="track-list" id="track-list"></ul>
  `;

  const list = card.querySelector('#track-list');

  const sorted = [...artist.tracks].sort((a, b) => {
    const ar = isRankedInMode(a);
    const br = isRankedInMode(b);
    if (ar !== br) return ar ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  for (const track of sorted) {
    list.appendChild(renderTrack(track));
  }

  resultsEl.innerHTML = '';
  resultsEl.appendChild(card);
}

/** @param {Track} track @returns {HTMLLIElement} */
function renderTrack(track) {
  const li = document.createElement('li');
  li.className = 'track-item';

  const ranked     = isRankedInMode(track);
  const dotClass   = ranked ? 'ranked' : 'unranked';
  const titleClass = ranked ? 'is-ranked' : 'is-unranked';

  const sortedModes = [...track.ranked_modes].sort(
    (a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b)
  );

  const modesBadges = sortedModes.length
    ? `<span class="track-modes">${sortedModes.map(m => {
        const ids = track.beatmapset_ids_by_mode[m];
        const id  = ids && ids.length ? ids[0] : null;
        return id
          ? `<a class="mode-badge mode-badge--${m}" href="https://osu.ppy.sh/beatmapsets/${id}" target="_blank" rel="noopener">${m}</a>`
          : `<span class="mode-badge mode-badge--${m}">${m}</span>`;
      }).join('')}</span>`
    : '';

  const previewBtn = track.preview
    ? `<button class="preview-btn" data-url="${escHtml(track.preview)}" data-title="${escHtml(track.title)}"></button>`
    : '';

  li.innerHTML = `
    <span class="dot ${dotClass}"></span>
    <span class="track-title ${titleClass}">${escHtml(track.title)}</span>
    ${modesBadges}
    ${previewBtn}
  `;

  const btn = li.querySelector('.preview-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      playAudio(btn.dataset.url, btn.dataset.title, btn);
    });
  }

  return li;
}

// ── Audio Player ─────────────────────────────────────────────────────────────

function createAudioPlayer() {
  const player = document.createElement('div');
  player.id = 'audio-player';
  player.className = 'audio-player';
  player.innerHTML = `
    <div class="audio-player-track">
      <span class="audio-player-title"></span>
      <button class="audio-player-close" title="Close"></button>
    </div>
    <div class="audio-player-controls">
      <button class="audio-control-btn audio-play-pause"></button>
      <div class="audio-progress-container">
        <div class="audio-progress-bar"><div class="audio-progress-fill"></div></div>
        <span class="audio-time">0:00 / 0:00</span>
      </div>
      <button class="audio-control-btn audio-copy-link" title="Copy link"></button>
    </div>
  `;

  document.body.appendChild(player);

  makeDraggable(player);

  player.querySelector('.audio-player-close').addEventListener('click', closeAudioPlayer);

  player.querySelector('.audio-play-pause').addEventListener('click', () => {
    if (currentAudio) currentAudio.paused ? currentAudio.play() : currentAudio.pause();
  });

  player.querySelector('.audio-copy-link').addEventListener('click', async () => {
    if (currentAudioUrl) {
      try {
        await navigator.clipboard.writeText(currentAudioUrl);
        showToast('Link copied!');
      } catch { showToast('Failed to copy'); }
    }
  });

  player.querySelector('.audio-progress-bar').addEventListener('click', (e) => {
    if (currentAudio && currentAudio.duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      currentAudio.currentTime = ((e.clientX - rect.left) / rect.width) * currentAudio.duration;
    }
  });
}

function makeDraggable(el) {
  let startX, startY, startLeft, startBottom;

  el.querySelector('.audio-player-track').addEventListener('mousedown', (e) => {
    if (e.target.closest('.audio-player-close')) return;

    const rect = el.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startBottom = window.innerHeight - rect.bottom;

    el.style.right = 'auto';
    el.style.left = startLeft + 'px';
    el.style.bottom = startBottom + 'px';

    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = Math.max(0, Math.min(window.innerWidth - rect.width, startLeft + dx)) + 'px';
      el.style.bottom = Math.max(0, Math.min(window.innerHeight - rect.height, startBottom - dy)) + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function showToast(msg) {
  let toast = document.querySelector('.copy-toast');
  if (toast) toast.remove();
  toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 200); }, 2000);
}

function closeAudioPlayer() {
  const player = document.getElementById('audio-player');
  if (player) player.classList.remove('show');
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (currentPlayBtn) { currentPlayBtn.classList.remove('is-playing', 'icon-pause'); currentPlayBtn = null; }
  currentAudioUrl = null;
}

/** @type {AbortController|null} */
let currentAudioAc = null;

function playAudio(url, title, btn) {
  const player = document.getElementById('audio-player');
  const titleEl = player.querySelector('.audio-player-title');
  const progressFill = player.querySelector('.audio-progress-fill');
  const timeEl = player.querySelector('.audio-time');
  const playPauseBtn = player.querySelector('.audio-play-pause');

  if (currentAudio && currentAudioUrl === url) {
    currentAudio.paused ? currentAudio.play() : currentAudio.pause();
    return;
  }

  if (currentAudio) currentAudio.pause();
  if (currentPlayBtn) currentPlayBtn.classList.remove('is-playing', 'icon-pause');
  if (currentAudioAc) currentAudioAc.abort();

  currentAudio = new Audio(url);
  currentAudioUrl = url;
  currentPlayBtn = btn;
  currentAudioAc = new AbortController();
  const { signal } = currentAudioAc;

  titleEl.textContent = title;
  requestAnimationFrame(() => player.classList.add('show'));

  currentAudio.addEventListener('play', () => {
    btn.classList.add('is-playing', 'icon-pause');
    playPauseBtn.classList.add('is-playing', 'icon-pause');
  }, { signal });

  currentAudio.addEventListener('pause', () => {
    btn.classList.remove('is-playing', 'icon-pause');
    playPauseBtn.classList.remove('is-playing', 'icon-pause');
  }, { signal });

  currentAudio.addEventListener('ended', () => {
    btn.classList.remove('is-playing', 'icon-pause');
    playPauseBtn.classList.remove('is-playing', 'icon-pause');
    progressFill.style.width = '0%';
  }, { signal });

  currentAudio.addEventListener('timeupdate', () => {
    const pct = (currentAudio.currentTime / currentAudio.duration) * 100;
    progressFill.style.width = pct + '%';
    timeEl.textContent = formatTime(currentAudio.currentTime) + ' / ' + formatTime(currentAudio.duration);
  }, { signal });

  currentAudio.addEventListener('loadedmetadata', () => {
    timeEl.textContent = '0:00 / ' + formatTime(currentAudio.duration);
  }, { signal });

  currentAudio.play();
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// ── States ───────────────────────────────────────────────────────────────────

function showPlaceholder() {
  showMessage(`${metadata.total_artists} artists, ${metadata.total_songs} songs — start typing`);
}

/** @param {string} msg */
function showMessage(msg) {
  const el = document.getElementById('results');
  el.innerHTML = `<p class="state-msg">${escHtml(msg)}</p>`;
}

// ── Utils ────────────────────────────────────────────────────────────────────

/** @param {string} str @returns {string} */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Entry point ──────────────────────────────────────────────────────────────

init().catch(err => {
  document.getElementById('results').innerHTML =
    `<p class="state-msg">${escHtml(err.message)}</p>`;
});