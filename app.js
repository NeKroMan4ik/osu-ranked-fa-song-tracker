/** @type {{ id: number, name: string, song_count: number, ranked_count: number, updated_at: string }[]} */
let artistIndex = [];

/** @type {Map<number, Artist>} */
const artistCache = new Map();

/** Currently selected mode filter; null = all */
let selectedMode = null;

/**
 * @typedef {{ title: string, ranked_modes: string[], beatmapset_ids_by_mode: Record<string, number[]> }} Track
 * @typedef {{ id: number, name: string, tracks: Track[], updated_at: string }} Artist
 */

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch('./data/index.json');
  if (!res.ok) throw new Error(`Failed to load index.json: ${res.status}`);
  const data = await res.json();
  artistIndex = data.artists;

  setupSearch();
  setupModeFilter();
  showPlaceholder();
}

// ── Mode filter ─────────────────────────────────────────────────────────────

function setupModeFilter() {
  const select = document.getElementById('mode-filter');
  select.addEventListener('change', () => {
    selectedMode = select.value || null;
    const card = document.querySelector('.artist-card');
    if (card) {
      const name = card.querySelector('.artist-name').textContent;
      const entry = artistIndex.find(a => a.name === name);
      if (entry && artistCache.has(entry.id)) renderArtist(artistCache.get(entry.id));
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
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      items[activeIndex].click();
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

  const ranked = artist.tracks.filter(t => isRankedInMode(t)).length;
  const total  = artist.tracks.length;

  const card = document.createElement('div');
  card.className = 'artist-card';

  card.innerHTML = `
    <div class="artist-header">
      <span class="artist-name">${escHtml(artist.name)}</span>
      <span class="artist-stats">
        <span class="hit">${ranked}</span> ranked / <span class="miss">${total - ranked}</span> unranked
      </span>
    </div>
    <ul class="track-list" id="track-list"></ul>
    <div class="legend">
      <span class="legend-item"><span class="dot ranked"></span>ranked</span>
      <span class="legend-item"><span class="dot unranked"></span>unranked</span>
    </div>
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

  const MODE_ORDER = ['osu', 'taiko', 'fruits', 'mania'];
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

  li.innerHTML = `
    <span class="dot ${dotClass}"></span>
    <span class="track-title ${titleClass}">${escHtml(track.title)}</span>
    ${modesBadges}
  `;

  return li;
}

// ── States ───────────────────────────────────────────────────────────────────

function showPlaceholder() {
  showMessage(`${artistIndex.length} featured artists loaded — start typing`);
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
    `<p class="state-msg">⚠ ${escHtml(err.message)}</p>`;
});