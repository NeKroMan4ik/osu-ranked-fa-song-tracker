/** @type {Artist[]} */
let artists = [];

/**
 * @typedef {{ title: string, ranked: boolean, beatmapset_id: number|null }} Track
 * @typedef {{ id: number, name: string, tracks: Track[], updated_at: string }} Artist
 */

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  const res = await fetch('data/artists.json');
  if (!res.ok) throw new Error(`Failed to load artists.json: ${res.status}`);
  artists = await res.json();

  setupSearch();
  showPlaceholder();
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

    const matches = artists
      .filter(a => a.name.toLowerCase().includes(q))
      .slice(0, 8);

    if (!matches.length) {
      hideSuggestions();
      showMessage(`no artist matching "${input.value.trim()}"`);
      return;
    }

    renderSuggestions(matches, input, suggestions, (artist) => {
      input.value = artist.name;
      hideSuggestions();
      renderArtist(artist);
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
    if (!e.target.closest('.search-wrapper')) hideSuggestions();
  });

  function hideSuggestions() {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
    activeIndex = -1;
  }
}

/**
 * @param {Artist[]} matches
 * @param {HTMLInputElement} input
 * @param {HTMLElement} container
 * @param {(a: Artist) => void} onSelect
 */
function renderSuggestions(matches, input, container, onSelect) {
  container.innerHTML = '';
  container.hidden = false;

  for (const artist of matches) {
    const el = document.createElement('div');
    el.className = 'suggestion-item';
    el.textContent = artist.name;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent input blur before click fires
      onSelect(artist);
    });
    container.appendChild(el);
  }
}

/** @param {NodeList} items @param {number} index */
function updateActive(items, index) {
  items.forEach((el, i) => el.classList.toggle('active', i === index));
}

// ── Render ──────────────────────────────────────────────────────────────────

/** @param {Artist} artist */
function renderArtist(artist) {
  const resultsEl = document.getElementById('results');

  const ranked = artist.tracks.filter(t => t.ranked).length;
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

  // sort: ranked first, then alphabetically
  const sorted = [...artist.tracks].sort((a, b) => {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
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

  const dotClass   = track.ranked ? 'ranked' : 'unranked';
  const titleClass = track.ranked ? 'is-ranked' : 'is-unranked';

  const linkHtml = track.beatmapset_id
    ? `<a class="track-link" href="https://osu.ppy.sh/beatmapsets/${track.beatmapset_id}" target="_blank" rel="noopener">↗</a>`
    : '';

  li.innerHTML = `
    <span class="dot ${dotClass}"></span>
    <span class="track-title ${titleClass}">${escHtml(track.title)}</span>
    ${linkHtml}
  `;

  return li;
}

// ── States ───────────────────────────────────────────────────────────────────

function showPlaceholder() {
  showMessage(`${artists.length} featured artists loaded — start typing`);
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