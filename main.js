// ╔══════════════════════════════════════════════════════════════╗
// ║  TAXOGEEK — RETRO TERMINAL HUD  ·  main.js                  ║
// ╚══════════════════════════════════════════════════════════════╝

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let allCategories    = [];
let filmIndex        = {};   // normalizedTitle → [catIndex, ...]
let directorIndex    = {};   // directorName → { films:[], cats:Set }
let directorsCached  = false;
let _directorsCacheHtml = null;

let currentWatchFilter = 'all';
let currentSearch      = '';
let activeSuperCat     = 'ALL';
let activeDecades      = new Set();
let rangeMin  = 1920;
let rangeMax  = 2025;
let sessionTime        = 0;
let collapsedCats      = new Set();
let selectedSuggestion = 0;

const LS_KEY     = 'taxogeek_watched';
const LS_OMDB    = 'taxogeek_omdb_key';
const LS_OMDB_SK = 'taxogeek_omdb_skip';
const omdbCache  = new Map();

const KNOWN_DIRECTORS = [
  'Bergman','Tarkovsky','Antonioni','Godard','Truffaut','Varda','Rohmer',
  'Kieslowski','Haneke','Hitchcock','Lynch','Kubrick','Scorsese','Coppola',
  'De Palma','Tarantino','Melville','Bresson','Renoir','Fellini','Herzog',
  'Fassbinder','Wenders','Cronenberg','Polanski','Spielberg','Mann',
  'Ford','Hawks','Leone','Peckinpah','Altman','Cassavetes','Anderson',
  'Fincher','Nolan','Villeneuve','Aronofsky','Von Trier','Carax',
  'Besson','Beineix','Clouzot','Rivette','Chabrol','Malle','Demy',
  'Marker','Resnais','Vigo','Tati','Pialat','Techine','Ozon','Audiard',
  'Dardenne','Loach','Leigh','Russell','Lean','Reed','Powell',
  'Pressburger','Huston','Wilder','Lubitsch','Lang','Murnau',
  'Eisenstein','Pudovkin','Vertov','Bunuel','Pasolini','Visconti',
  'De Sica','Rossellini','Olmi','Taviani','Bertolucci','Wertmuller',
  'Ferreri','Zurlini','Kurosawa','Ozu','Mizoguchi','Imamura',
  'Oshima','Ichikawa','Shinoda','Zinnemann','Friedkin','Ashby',
  'Malick','Eastwood','Demme','Forman','Pollack','Nichols',
  'Coen','Cameron','Scott','Verhoeven','De Wilde','Trumbull'
];

const FRANCHISE_PATTERNS = [
  { name:'Star Wars',        regex:/^star wars/i },
  { name:'Saw',              regex:/^saw\b|^jigsaw\b|^spiral.*saw|^the final destination/i },
  { name:'Final Destination',regex:/^final destination/i },
  { name:'Godfather',        regex:/^the godfather/i },
  { name:'Lord of the Rings',regex:/^the lord of the rings/i },
  { name:'Indiana Jones',    regex:/^indiana jones/i },
  { name:'Terminator',       regex:/^terminator|^terminator \d/i },
  { name:'Alien',            regex:/^alien\b|^aliens\b|^alien vs/i },
  { name:'Friday the 13th',  regex:/^friday the 13th/i },
  { name:'Halloween',        regex:/^halloween\b/i },
  { name:'Scream',           regex:/^scream\b/i },
  { name:'Spider-Man',       regex:/^spider-man/i },
  { name:'John Wick',        regex:/^john wick/i },
  { name:'Back to the Future',regex:/^back to the future/i },
  { name:'Mad Max',          regex:/^mad max|^furiosa/i },
  { name:'Harry Potter',     regex:/^harry potter|^fantastic beasts/i },
  { name:'Deadpool',         regex:/^deadpool/i },
  { name:'The Dark Knight',  regex:/^the dark knight|^batman begins|^the dark knight rises/i },
  { name:'Bourne',           regex:/^the bourne|^jason bourne/i }
];

// ══════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════
function getSiteWatched() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
  catch { return new Set(); }
}
function setSiteWatched(set) { localStorage.setItem(LS_KEY, JSON.stringify([...set])); }
function getOmdbKey() { return localStorage.getItem(LS_OMDB) || ''; }

// ══════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════
function startClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    el.textContent = `${h}:${m}:${s}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════════════
// BOOT SEQUENCE
// ══════════════════════════════════════════════
async function runBoot(moviesText) {
  const container = document.getElementById('boot-lines');
  const lines = [
    { text: 'TAXOGEEK TERMINAL v4.1.0', cls: 'head' },
    { text: 'Copyright (C) 1987-2024 CurtainBulb Systems', cls: '' },
    { text: '', cls: '' },
    { text: '[ BIOS ] Initializing display adapter...', cls: '' },
    { text: '[ BIOS ] Memory check: 640K OK', cls: 'ok' },
    { text: '[ BOOT ] Loading kernel modules...', cls: '' },
    { text: '[ BOOT ] cinema.db mounted read/write', cls: 'ok' },
    { text: '[ BOOT ] Parsing taxonomy index...', cls: '' },
  ];

  for (let i = 0; i < lines.length; i++) {
    await delay(60 + Math.random() * 40);
    appendBootLine(container, lines[i].text, lines[i].cls);
  }

  // parse data
  allCategories = parseMarkdown(moviesText);
  buildIndexes(allCategories);

  const totalFilms = allCategories.reduce((n, c) => n + c.films.length, 0);
  const catCount   = allCategories.length;

  const lines2 = [
    { text: `[ DATA ] ${catCount} categories loaded`, cls: 'ok' },
    { text: `[ DATA ] ${totalFilms} film records indexed`, cls: 'ok' },
    { text: '[ SYS  ] Building navigation structures...', cls: '' },
    { text: '[ SYS  ] OMDb interface ready', cls: 'ok' },
    { text: '', cls: '' },
    { text: 'SYSTEM READY.', cls: 'head' },
  ];
  for (const l of lines2) {
    await delay(50 + Math.random() * 60);
    appendBootLine(container, l.text, l.cls);
  }

  await delay(300);

  // Assemble UI
  buildSuperTabs();
  buildCatNav();
  buildDecadeButtons();
  renderCanon();
  updateGlobalStats();

  // Fade out boot screen
  const loader = document.getElementById('loader');
  loader.style.transition = 'opacity 0.3s';
  loader.style.opacity = '0';
  await delay(300);
  loader.style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  startClock();

  // OMDb prompt
  if (!getOmdbKey() && !localStorage.getItem(LS_OMDB_SK)) {
    setTimeout(() => document.getElementById('omdb-prompt').classList.add('open'), 900);
  }
}

function appendBootLine(container, text, cls) {
  const el = document.createElement('div');
  el.className = 'boot-line' + (cls ? ' ' + cls : '');
  el.textContent = text || '\u00a0';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════
// MARKDOWN PARSER
// ══════════════════════════════════════════════
function parseMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const categories = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === 'MOVIEEZ LIST' || line === 'MOVIEEEZ LIST') continue;

    if (line.startsWith('- [')) {
      if (!current) continue;
      const watched = line.startsWith('- [x]') || line.startsWith('- [X]');
      let rest = line.replace(/^- \[[xX ]\] ?/, '').trim();
      const isNew = rest.includes('[!]');
      rest = rest.replace(/\[!\]/g, '').trim();
      const noteMatch = rest.match(/\((\d{4}[^\)]*)\)\s*—\s*(.+)$/);
      const note = noteMatch ? noteMatch[2].trim() : null;
      const yearMatch = rest.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      let title = rest.replace(/\s*\(.*$/, '').trim();
      const slashIdx = title.indexOf(' / ');
      const primaryTitle = slashIdx >= 0 ? title.slice(0, slashIdx).trim() : title;
      current.films.push({ title: primaryTitle, fullTitle: title, year, watched, note, isNew, raw: rest });
    } else if (line.length > 3 && !line.startsWith('#')) {
      const parenMatch = line.match(/^(.+?)\s*\((.+)\)\s*$/);
      let name, desc;
      if (parenMatch) { name = parenMatch[1].trim(); desc = parenMatch[2].trim(); }
      else { name = line; desc = null; }
      const dashMatch = name.match(/^(.+?)\s*—\s*(.+)$/);
      let superCat = null, subName = name;
      if (dashMatch) { superCat = dashMatch[1].trim().toUpperCase(); subName = dashMatch[2].trim(); }
      current = { name, superCat, subName, desc, films: [] };
      categories.push(current);
    }
  }
  return categories;
}

function normalizeTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ══════════════════════════════════════════════
// BUILD INDEXES
// ══════════════════════════════════════════════
function buildIndexes(cats) {
  filmIndex = {};
  directorIndex = {};
  cats.forEach((cat, ci) => {
    cat.films.forEach(film => {
      const key = normalizeTitle(film.title);
      if (!filmIndex[key]) filmIndex[key] = [];
      if (!filmIndex[key].includes(ci)) filmIndex[key].push(ci);
    });
    const text = cat.name + ' ' + (cat.desc || '');
    KNOWN_DIRECTORS.forEach(d => {
      if (new RegExp('\\b' + d + '\\b', 'i').test(text)) {
        if (!directorIndex[d]) directorIndex[d] = { films: [], cats: new Set() };
        cat.films.forEach(film => {
          directorIndex[d].films.push({ film, catName: cat.subName || cat.name, catIndex: ci });
          directorIndex[d].cats.add(cat.name);
        });
      }
    });
  });
}

function enrichDirectorFromOmdb(title, year, catIndex, directorName) {
  if (!directorName) return;
  directorName.split(',').map(s => s.trim()).forEach(name => {
    const lastName = name.split(' ').pop();
    const matched = KNOWN_DIRECTORS.find(d => d.toLowerCase() === lastName.toLowerCase()) || lastName;
    if (!directorIndex[matched]) directorIndex[matched] = { films: [], cats: new Set() };
    const cat = allCategories[catIndex];
    if (cat) {
      const film = cat.films.find(f => normalizeTitle(f.title) === normalizeTitle(title));
      if (film) {
        if (!directorIndex[matched].films.find(e => normalizeTitle(e.film.title) === normalizeTitle(title)))
          directorIndex[matched].films.push({ film, catName: cat.subName || cat.name, catIndex });
        directorIndex[matched].cats.add(cat.name);
      }
    }
    directorsCached = false;
  });
}

// ══════════════════════════════════════════════
// SUPER TABS
// ══════════════════════════════════════════════
function buildSuperTabs() {
  const supers = ['ALL'];
  allCategories.forEach(c => { if (c.superCat && !supers.includes(c.superCat)) supers.push(c.superCat); });
  document.getElementById('super-tabs').innerHTML = supers.map(s =>
    `<button class="super-tab${s === activeSuperCat ? ' active' : ''}" onclick="setSuperCat('${s.replace(/'/g,"\\'")}')">${s === 'ALL' ? 'ALL' : abbrev(s)}</button>`
  ).join('');
}
function abbrev(s) {
  const w = s.split(/\s+/);
  return w.length <= 2 ? s : w.slice(0,2).join(' ');
}
function setSuperCat(s) {
  activeSuperCat = s;
  buildSuperTabs();
  buildCatNav();
  renderCanon();
}

// ══════════════════════════════════════════════
// CAT NAV
// ══════════════════════════════════════════════
function buildCatNav() {
  const nav = document.getElementById('cat-nav');
  let html = '', lastSuper = null;
  allCategories.forEach((cat, ci) => {
    if (activeSuperCat !== 'ALL' && cat.superCat !== activeSuperCat) return;
    if (cat.superCat !== lastSuper) {
      if (cat.superCat) html += `<div class="cat-nav-group">${cat.superCat}</div>`;
      lastSuper = cat.superCat;
    }
    html += `<span class="cat-nav-item" id="nav-${ci}" onclick="scrollToCategory(${ci})">${cat.subName || cat.name}</span>`;
  });
  nav.innerHTML = html;
}

function updateNavActive(ci) {
  document.querySelectorAll('.cat-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${ci}`)?.classList.add('active');
}

// ══════════════════════════════════════════════
// RENDER CANON
// ══════════════════════════════════════════════
function renderCanon() {
  const siteWatched = getSiteWatched();
  const searchLower = currentSearch.toLowerCase();
  const sortVal     = document.getElementById('sort-select')?.value || 'default';
  const container   = document.getElementById('canon-content');

  let html = '';

  allCategories.forEach((cat, ci) => {
    if (activeSuperCat !== 'ALL' && cat.superCat !== activeSuperCat) return;

    let films = cat.films.filter(f => {
      const fw = f.watched || siteWatched.has(normalizeTitle(f.title));
      if (currentWatchFilter === 'watched'   && !fw) return false;
      if (currentWatchFilter === 'unwatched' &&  fw) return false;
      if (f.year) {
        const decade = Math.floor(f.year / 10) * 10;
        if (activeDecades.size > 0 && !activeDecades.has(decade)) return false;
        if (f.year < rangeMin || f.year > rangeMax) return false;
      }
      if (searchLower) {
        return f.title.toLowerCase().includes(searchLower) ||
               (f.fullTitle||'').toLowerCase().includes(searchLower) ||
               cat.name.toLowerCase().includes(searchLower) ||
               (cat.desc||'').toLowerCase().includes(searchLower);
      }
      return true;
    });

    if (films.length === 0 && (searchLower || activeDecades.size > 0)) return;

    if (sortVal !== 'default') {
      films = [...films];
      if (sortVal === 'year-asc')         films.sort((a,b) => (a.year||9999) - (b.year||9999));
      else if (sortVal === 'year-desc')   films.sort((a,b) => (b.year||0)    - (a.year||0));
      else if (sortVal === 'title-az')    films.sort((a,b) => a.title.localeCompare(b.title));
      else if (sortVal === 'watched-first')   films.sort((a,b) => {
        const aw = a.watched || siteWatched.has(normalizeTitle(a.title));
        const bw = b.watched || siteWatched.has(normalizeTitle(b.title));
        return bw - aw;
      });
      else if (sortVal === 'unwatched-first') films.sort((a,b) => {
        const aw = a.watched || siteWatched.has(normalizeTitle(a.title));
        const bw = b.watched || siteWatched.has(normalizeTitle(b.title));
        return aw - bw;
      });
    }

    const watchedCount = cat.films.filter(f => f.watched || siteWatched.has(normalizeTitle(f.title))).length;
    const total        = cat.films.length;
    const pct          = total > 0 ? watchedCount / total : 0;
    const isCollapsed  = collapsedCats.has(ci) && !searchLower;
    const isComplete   = watchedCount === total && total > 0;
    const isDanger     = total > 4 && pct < 0.1;

    // 10 pixel segments
    const filledSegs = Math.round(pct * 10);
    const segsHtml = Array.from({length:10}, (_,i) => {
      let cls = 'cat-seg';
      if (i < filledSegs) cls += isComplete ? ' on full' : ' on';
      return `<div class="${cls}"></div>`;
    }).join('');

    const sectorLabel = cat.superCat
      ? `<div class="cat-sector">// SECTOR · ${cat.superCat}</div>`
      : '';

    const dangerBadge = isDanger
      ? `<div class="danger-badge">⚠ WARNING — BLIND SPOT</div>`
      : '';

    const franchiseMap = detectFranchises(films);
    let filmsHtml;
    if (franchiseMap.size > 0) {
      filmsHtml = renderFilmsWithFranchises(films, franchiseMap, siteWatched, searchLower, ci);
    } else {
      filmsHtml = renderFilmGrid(films, siteWatched, searchLower, ci);
    }

    html += `<div class="category-block${isDanger ? ' danger' : ''}" id="cat-${ci}">
      <div class="cat-header" onclick="toggleCategory(${ci})">
        <div class="cat-header-left">
          ${sectorLabel}
          <div class="cat-name">${cat.subName || cat.name}</div>
          ${cat.desc ? `<div class="cat-desc">${cat.desc}</div>` : ''}
        </div>
        <div class="cat-header-right">
          ${dangerBadge}
          <div class="cat-readout${isComplete?' complete':''}">${watchedCount}<span style="font-size:14px;color:var(--txt-lo)">/${total}</span></div>
          <div class="cat-mini-bar">${segsHtml}</div>
        </div>
        <div class="cat-toggle">${isCollapsed ? '[+]' : '[-]'}</div>
      </div>
      <div class="film-grid-wrap" id="grid-${ci}"${isCollapsed ? ' style="display:none"' : ''}>
        ${filmsHtml}
      </div>
    </div>`;
  });

  container.innerHTML = html || '<div class="empty-state">∅ NO RESULTS MATCH CURRENT FILTERS</div>';
  updateCmdSummary(container);
}

function renderFilmGrid(films, siteWatched, searchLower, ci) {
  if (!films.length) return '<div class="empty-state" style="padding:12px">No films match current filter.</div>';
  return `<div class="film-grid">${films.map((f, i) => filmRowHtml(f, siteWatched, searchLower, ci, i)).join('')}</div>`;
}

function renderFilmsWithFranchises(films, franchiseMap, siteWatched, searchLower, ci) {
  const solo = films.filter(f => !franchiseMap.has(normalizeTitle(f.title)));
  let html = '';
  if (solo.length) html += `<div class="film-grid">${solo.map((f,i) => filmRowHtml(f, siteWatched, searchLower, ci, i)).join('')}</div>`;

  const groups = new Map();
  franchiseMap.forEach((fname, key) => {
    if (!groups.has(fname)) groups.set(fname, []);
    const film = films.find(f => normalizeTitle(f.title) === key);
    if (film) groups.get(fname).push(film);
  });

  groups.forEach((ffilms, fname) => {
    const watched = ffilms.filter(f => f.watched || siteWatched.has(normalizeTitle(f.title))).length;
    html += `<div class="franchise-group">
      <div class="franchise-hdr">
        <span>◈ FRANCHISE: ${fname}</span>
        <span class="franchise-ring">${watched}/${ffilms.length}</span>
      </div>
      <div class="film-grid">${ffilms.map((f,i) => filmRowHtml(f, siteWatched, searchLower, ci, i)).join('')}</div>
    </div>`;
  });
  return html;
}

function detectFranchises(films) {
  const map = new Map();
  films.forEach(f => {
    for (const fp of FRANCHISE_PATTERNS) {
      if (fp.regex.test(f.title)) { map.set(normalizeTitle(f.title), fp.name); break; }
    }
  });
  const counts = {};
  map.forEach(fname => counts[fname] = (counts[fname]||0) + 1);
  const result = new Map();
  map.forEach((fname, key) => { if (counts[fname] >= 2) result.set(key, fname); });
  return result;
}

function filmRowHtml(f, siteWatched, searchLower, ci, idx) {
  const key     = normalizeTitle(f.title);
  const fw      = f.watched || siteWatched.has(key);
  const siteOnly = !f.watched && siteWatched.has(key);
  const isDupe  = filmIndex[key] && filmIndex[key].length > 1;

  let displayTitle = f.title;
  if (searchLower) displayTitle = highlightText(f.title, searchLower);

  const statusChar = f.watched ? '█' : (siteOnly ? '◈' : '·');
  const rowClass = [
    'film-row',
    f.watched   ? 'watched-row'      : '',
    siteOnly    ? 'site-watched-row' : '',
    f.isNew     ? 'new-row'          : '',
  ].filter(Boolean).join(' ');

  const idxStr = String(idx + 1).padStart(3, '0');

  return `<div class="${rowClass}">
    <div class="row-idx">${idxStr}</div>
    <div class="row-status" onclick="toggleSiteWatch('${key.replace(/'/g,"\\'")}')">
      ${statusChar}
    </div>
    ${f.year ? `<div class="row-year">${f.year}</div>` : '<div class="row-year" style="color:transparent">····</div>'}
    <div class="film-row-title" onclick="openFilmModal('${f.title.replace(/'/g,"\\'")}',${f.year||'null'},${ci})">${displayTitle}</div>
    ${f.note ? `<div class="row-note">${f.note}</div>` : ''}
    ${isDupe ? `<div class="row-dupe">×${filmIndex[key].length}</div>` : ''}
  </div>`;
}

function highlightText(text, search) {
  const re = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

// ══════════════════════════════════════════════
// COLLAPSE
// ══════════════════════════════════════════════
function toggleCategory(ci) {
  const grid = document.getElementById(`grid-${ci}`);
  const icon = document.querySelector(`#cat-${ci} .cat-toggle`);
  if (!grid) return;
  if (collapsedCats.has(ci)) {
    collapsedCats.delete(ci);
    grid.style.display = '';
    if (icon) icon.textContent = '[-]';
  } else {
    collapsedCats.add(ci);
    grid.style.display = 'none';
    if (icon) icon.textContent = '[+]';
  }
}
function expandAll()  { collapsedCats.clear(); renderCanon(); }
function collapseAll(){ allCategories.forEach((_,i) => collapsedCats.add(i)); renderCanon(); }

// ══════════════════════════════════════════════
// WATCH TOGGLE
// ══════════════════════════════════════════════
function toggleSiteWatch(key) {
  const set   = getSiteWatched();
  const found = allCategories.flatMap(c => c.films).find(f => normalizeTitle(f.title) === key);
  if (found && found.watched) return;
  if (set.has(key)) set.delete(key); else set.add(key);
  setSiteWatched(set);
  renderCanon();
  updateGlobalStats();
}

// ══════════════════════════════════════════════
// GLOBAL STATS
// ══════════════════════════════════════════════
function updateGlobalStats() {
  const siteWatched = getSiteWatched();
  let total = 0, watched = 0;
  allCategories.forEach(cat => cat.films.forEach(f => {
    total++;
    if (f.watched || siteWatched.has(normalizeTitle(f.title))) watched++;
  }));
  const pct = total > 0 ? watched / total : 0;
  const filledSegs = Math.round(pct * 10);
  const segs = Array.from({length:10}, (_,i) =>
    `<div class="seg${i < filledSegs ? ' on' : ''}"></div>`
  ).join('');

  document.getElementById('global-stats').innerHTML = `
    <div class="status-body">
      <div class="readout-row">
        <span class="readout-label">WATCHED</span>
        <span class="readout-val">${watched}</span>
      </div>
      <div class="readout-row">
        <span class="readout-label">TOTAL</span>
        <span class="readout-val">${total}</span>
      </div>
      <div class="seg-bar">${segs}</div>
      <div class="seg-pct">${Math.round(pct*100)}% COMPLETE</div>
    </div>
  `;

  const info = document.getElementById('topbar-stat');
  if (info) info.textContent = `${watched} SEEN · ${total-watched} REMAINING`;
}

// ══════════════════════════════════════════════
// FILTERS
// ══════════════════════════════════════════════
function setWatchFilter(f, btn) {
  currentWatchFilter = f;
  document.querySelectorAll('.hud-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCanon();
}

let _searchTimer = null;
function handleSearch(val) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { currentSearch = val; renderCanon(); }, 200);
}

function toggleCmdBar() {
  const bar = document.getElementById('cmd-bar');
  bar.classList.toggle('open');
}

function buildDecadeButtons() {
  const decades = [1920,1930,1940,1950,1960,1970,1980,1990,2000,2010,2020];
  document.getElementById('decade-btns').innerHTML = decades.map(d =>
    `<button class="decade-btn" onclick="toggleDecade(${d},this)">${d}s</button>`
  ).join('');
}

function toggleDecade(decade, btn) {
  if (activeDecades.has(decade)) { activeDecades.delete(decade); btn.classList.remove('active'); }
  else { activeDecades.add(decade); btn.classList.add('active'); }
  renderCanon();
}

function handleRangeChange() {
  let mn = parseInt(document.getElementById('range-min').value);
  let mx = parseInt(document.getElementById('range-max').value);
  if (mn > mx) [mn,mx] = [mx,mn];
  rangeMin = mn; rangeMax = mx;
  document.getElementById('range-label').textContent = `${mn} — ${mx}`;
  renderCanon();
}

function clearAllFilters() {
  currentWatchFilter = 'all';
  currentSearch      = '';
  activeDecades.clear();
  rangeMin = 1920; rangeMax = 2025;
  activeSuperCat = 'ALL';
  document.getElementById('search-input').value = '';
  document.getElementById('range-min').value = 1920;
  document.getElementById('range-max').value = 2025;
  document.getElementById('range-label').textContent = '1920 — 2025';
  document.getElementById('sort-select').value = 'default';
  document.querySelectorAll('.decade-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.hud-filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.hud-filter-btn').classList.add('active');
  buildSuperTabs();
  buildCatNav();
  renderCanon();
}

function updateCmdSummary(container) {
  const filmCount = container.querySelectorAll('.film-row').length;
  const parts = [];
  if (activeDecades.size > 0) parts.push([...activeDecades].sort().map(d => d+'s').join('/'));
  if (rangeMin > 1920 || rangeMax < 2025) parts.push(`${rangeMin}–${rangeMax}`);
  if (currentWatchFilter !== 'all') parts.push(currentWatchFilter.toUpperCase());
  if (currentSearch) parts.push(`"${currentSearch}"`);
  if (activeSuperCat !== 'ALL') parts.push(activeSuperCat);

  const el = document.getElementById('cmd-summary');
  if (!el) return;
  if (!parts.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<span>FILTER:</span><span class="cmd-summary-val">${parts.join(' · ')} · ${filmCount} RECORDS</span><button class="clear-btn" onclick="clearAllFilters()">[×] CLR</button>`;
}

// ══════════════════════════════════════════════
// NAV
// ══════════════════════════════════════════════
function scrollToCategory(ci) {
  updateNavActive(ci);
  showView('canon', document.querySelector('.view-btn'));
  setTimeout(() => document.getElementById(`cat-${ci}`)?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
}

function showView(view, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  btn?.classList.add('active');
  if (view === 'stats')     renderStats();
  if (view === 'dupes')     renderDupes();
  if (view === 'directors') renderDirectors();
  if (view === 'next')      initWatchNext();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ══════════════════════════════════════════════
// OMDb MODAL
// ══════════════════════════════════════════════
function openFilmModal(title, year, catIndex) {
  const key = getOmdbKey();
  const skipFlag = localStorage.getItem(LS_OMDB_SK);
  if (!key && !skipFlag) { showOmdbPrompt(title, year, catIndex); return; }
  _doOpenModal(title, year, catIndex);
}

function showOmdbPrompt(title, year, catIndex) {
  document.getElementById('omdb-prompt').classList.add('open');
  const inp = document.getElementById('omdb-key-input');
  inp.dataset.title = title; inp.dataset.year = year || ''; inp.dataset.ci = catIndex;
}

function saveOmdbKey() {
  const inp = document.getElementById('omdb-key-input');
  const k = inp.value.trim();
  if (k) {
    localStorage.setItem(LS_OMDB, k);
    document.getElementById('omdb-prompt').classList.remove('open');
    const t = inp.dataset.title, y = inp.dataset.year, ci = inp.dataset.ci;
    if (t) _doOpenModal(t, y ? parseInt(y) : null, parseInt(ci));
  }
}

function skipOmdbKey() {
  localStorage.setItem(LS_OMDB_SK, '1');
  document.getElementById('omdb-prompt').classList.remove('open');
}

async function _doOpenModal(title, year, catIndex) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  overlay.classList.add('open');

  const key = getOmdbKey();
  if (!key) { content.innerHTML = renderModalNoKey(title, year, catIndex); return; }

  const cacheKey = `${title}|${year||''}`;
  if (omdbCache.has(cacheKey)) {
    content.innerHTML = renderModalData(omdbCache.get(cacheKey), title, year, catIndex);
    return;
  }

  content.innerHTML = `<div class="modal-fetching">FETCHING RECORD<span class="blink">_</span></div>`;

  try {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}${year?'&y='+year:''}&apikey=${key}&plot=short`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.Response === 'True') {
      omdbCache.set(cacheKey, data);
      if (data.Director && catIndex >= 0) enrichDirectorFromOmdb(title, year, catIndex, data.Director);
      content.innerHTML = renderModalData(data, title, year, catIndex);
    } else {
      content.innerHTML = renderModalNoData(title, year, catIndex, data.Error);
    }
  } catch(e) {
    content.innerHTML = renderModalNoData(title, year, catIndex, 'NETWORK ERROR');
  }
}

function renderModalData(data, title, year, catIndex) {
  const siteWatched = getSiteWatched();
  const key = normalizeTitle(title);
  const fw  = allCategories.flatMap(c=>c.films).find(f=>normalizeTitle(f.title)===key)?.watched
              || siteWatched.has(key);
  const catMatches = Object.entries(filmIndex)
    .filter(([k]) => k === key)
    .flatMap(([,idxs]) => idxs.map(i => allCategories[i]))
    .filter(Boolean);
  const genres  = (data.Genre||'').split(',').map(s=>s.trim()).filter(Boolean);
  const rt      = (data.Ratings||[]).find(r => r.Source === 'Rotten Tomatoes');
  const posterHtml = (data.Poster && data.Poster !== 'N/A')
    ? `<img src="${data.Poster}" alt="Poster" onerror="this.parentElement.innerHTML='<div class=modal-poster-placeholder><span>[NO POSTER]</span></div>'">`
    : `<div class="modal-poster-placeholder"><span>[NO POSTER DATA]</span></div>`;

  return `
    <div class="modal-titlebar">
      <span class="modal-titlebar-id">[ RECORD #${catIndex}·OMDb ]</span>
      <span class="modal-titlebar-title">${data.Title || title}</span>
      <button class="modal-close" onclick="closeModalDirect()">[×]</button>
    </div>
    <div class="modal-body">
      <div class="modal-poster">${posterHtml}</div>
      <div class="modal-meta">
        <div class="modal-title">${data.Title || title}</div>
        <div class="modal-attrs">${[data.Year,data.Rated,data.Runtime].filter(v=>v&&v!=='N/A').join(' · ')}</div>
        <div class="modal-chips">
          ${genres.map(g=>`<span class="chip">${g}</span>`).join('')}
        </div>
        ${data.imdbRating && data.imdbRating!=='N/A'
          ? `<div class="modal-rating">★ ${data.imdbRating}/10 <span style="font-family:'Share Tech Mono';font-size:10px;color:var(--txt-lo)">(${data.imdbVotes} votes)</span></div>` : ''}
        ${rt ? `<div class="modal-row"><strong>RT</strong> ${rt.Value}</div>` : ''}
        <div class="modal-plot">${data.Plot||''}</div>
        ${data.Director&&data.Director!=='N/A' ? `<div class="modal-row"><strong>Director</strong> ${data.Director}</div>`:''}
        ${data.Writer&&data.Writer!=='N/A'     ? `<div class="modal-row"><strong>Writer</strong> ${data.Writer.split(',').slice(0,3).join(', ')}</div>`:''}
        ${data.Actors&&data.Actors!=='N/A'     ? `<div class="modal-row"><strong>Cast</strong> ${data.Actors.split(',').slice(0,3).join(', ')}</div>`:''}
        ${data.Language&&data.Language!=='N/A' ? `<div class="modal-row"><strong>Language</strong> ${data.Language}</div>`:''}
        ${data.Country&&data.Country!=='N/A'   ? `<div class="modal-row"><strong>Country</strong> ${data.Country}</div>`:''}
        ${data.Awards&&data.Awards!=='N/A'     ? `<div class="modal-row"><strong>Awards</strong> ${data.Awards}</div>`:''}
        <div class="modal-divider">════════════════════════════════════════════════</div>
        <div class="modal-row" style="font-size:9px;color:var(--txt-lo);margin-bottom:6px">IN CANON:</div>
        <div class="modal-chips">
          ${catMatches.map(c=>`<span class="chip cat">${c.subName||c.name}</span>`).join('')||'<span style="color:var(--txt-lo)">—</span>'}
        </div>
        <div class="modal-status-row">
          <span style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--txt-lo)">STATUS:</span>
          <span style="font-family:'VT323',monospace;font-size:18px;color:${fw?'var(--green)':'var(--red)'}">
            ${fw ? '█ WATCHED' : '· UNWATCHED'}
          </span>
          ${!allCategories.flatMap(c=>c.films).find(f=>normalizeTitle(f.title)===key)?.watched
            ? `<button class="modal-watch-btn" onclick="toggleSiteWatch('${key.replace(/'/g,"\\'")}');_doOpenModal('${title.replace(/'/g,"\\'")}',${year||'null'},${catIndex})">${fw ? '[ UNMARK ]' : '[ MARK WATCHED ]'}</button>`
            : '<span style="font-size:9px;color:var(--txt-lo)">[from .md]</span>'}
        </div>
      </div>
    </div>`;
}

function renderModalNoKey(title, year, catIndex) {
  return `
    <div class="modal-titlebar">
      <span class="modal-titlebar-id">[ NO API KEY ]</span>
      <span class="modal-titlebar-title">${title}${year?` (${year})`:''}</span>
      <button class="modal-close" onclick="closeModalDirect()">[×]</button>
    </div>
    <div class="modal-meta" style="padding:24px">
      <div class="modal-title">${title}</div>
      <div class="modal-divider">════════════════════════════════</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--txt-mid);line-height:1.8">
        No OMDb key configured. Film metadata requires an API key.<br>
        Free key at <strong style="color:var(--txt-hi)">omdbapi.com</strong> (1000 req/day).
      </div>
      <button class="modal-watch-btn" style="margin-top:16px" onclick="closeModalDirect();showOmdbPrompt('${title.replace(/'/g,"\\'")}',${year||'null'},${catIndex})">[ ENTER API KEY ]</button>
    </div>`;
}

function renderModalNoData(title, year, catIndex, err) {
  const siteWatched = getSiteWatched();
  const key = normalizeTitle(title);
  const fw  = allCategories.flatMap(c=>c.films).find(f=>normalizeTitle(f.title)===key)?.watched || siteWatched.has(key);
  const catMatches = Object.entries(filmIndex).filter(([k])=>k===key).flatMap(([,idxs])=>idxs.map(i=>allCategories[i])).filter(Boolean);
  return `
    <div class="modal-titlebar">
      <span class="modal-titlebar-id">[ NO DATA ]</span>
      <span class="modal-titlebar-title">${title}${year?` (${year})`:''}</span>
      <button class="modal-close" onclick="closeModalDirect()">[×]</button>
    </div>
    <div class="modal-meta" style="padding:24px">
      <div class="modal-title">${title}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--txt-lo);margin:8px 0">ERR: ${err||'NOT FOUND'}</div>
      <div class="modal-divider">════════════════════════════════</div>
      <div class="modal-chips">${catMatches.map(c=>`<span class="chip cat">${c.subName||c.name}</span>`).join('')}</div>
      <div class="modal-status-row" style="margin-top:12px">
        <span style="font-family:'VT323',monospace;font-size:18px;color:${fw?'var(--green)':'var(--red)'}">
          ${fw ? '█ WATCHED' : '· UNWATCHED'}
        </span>
        ${!allCategories.flatMap(c=>c.films).find(f=>normalizeTitle(f.title)===key)?.watched
          ? `<button class="modal-watch-btn" onclick="toggleSiteWatch('${key.replace(/'/g,"\\'")}');_doOpenModal('${title.replace(/'/g,"\\'")}',${year||'null'},${catIndex})">${fw?'[ UNMARK ]':'[ MARK WATCHED ]'}</button>`
          : ''}
      </div>
    </div>`;
}

function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) closeModalDirect(); }
function closeModalDirect() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-content').innerHTML = '';
}

// ══════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════
function renderStats() {
  const siteWatched = getSiteWatched();
  let totalFilms=0, totalWatched=0;
  const decadeMap={}, catData=[];

  allCategories.forEach(cat => {
    let cw = 0;
    cat.films.forEach(f => {
      totalFilms++;
      const fw = f.watched || siteWatched.has(normalizeTitle(f.title));
      if (fw) { totalWatched++; cw++; }
      if (f.year) {
        const d = Math.floor(f.year/10)*10;
        if (!decadeMap[d]) decadeMap[d] = {total:0,watched:0};
        decadeMap[d].total++;
        if (fw) decadeMap[d].watched++;
      }
    });
    catData.push({name: cat.subName||cat.name, desc: cat.desc||'', total: cat.films.length, watched: cw});
  });

  const pct = Math.round(totalWatched/totalFilms*100);

  // Stat readouts
  document.getElementById('stats-cards').innerHTML = [
    ['TOTAL IN CANON', totalFilms, `across ${allCategories.length} categories`],
    ['WATCHED',        totalWatched, `${pct}% complete`],
    ['REMAINING',      totalFilms-totalWatched, 'still to see'],
    ['CATEGORIES',     allCategories.length, `${catData.filter(c=>c.watched===c.total&&c.total>0).length} fully completed`]
  ].map(([label,val,sub]) =>
    `<div class="stat-readout">
      <div class="stat-readout-label">${label}</div>
      <div class="stat-readout-val">${val}</div>
      <div class="stat-readout-sub">${sub}</div>
    </div>`
  ).join('');

  // Heatmap
  const decades = Object.keys(decadeMap).map(Number).sort();
  let hmHtml = `<div class="decade-grid" style="grid-template-columns:50px repeat(${decades.length},1fr)">`;
  hmHtml += `<div></div>`;
  decades.forEach(d => { hmHtml += `<div class="hm-col-head">${d}s</div>`; });
  hmHtml += `<div class="decade-label-cell">All</div>`;
  decades.forEach(d => {
    const data = decadeMap[d];
    const p = data.total > 0 ? data.watched/data.total : 0;
    const bg = p===0 ? '#0a0e14' : p<0.25 ? '#0a1a14' : p<0.5 ? '#0d2a1e' : p<0.75 ? 'var(--green-dim)' : 'var(--green)';
    hmHtml += `<div class="hm-cell" style="background:${bg}" title="${data.watched}/${data.total} in ${d}s">
      <span style="font-family:'Share Tech Mono';color:${p>0.6?'#000':'var(--txt-lo)'};">${data.watched}</span>
    </div>`;
  });
  hmHtml += '</div>';
  document.getElementById('heatmap').innerHTML = hmHtml;

  // Blind spots
  const blindSpots = catData.filter(c => c.total > 5 && c.watched/c.total < 0.1)
    .sort((a,b) => a.watched/a.total - b.watched/b.total);
  document.getElementById('blind-spots').innerHTML = blindSpots.length
    ? blindSpots.map(c => `<div class="blind-item">
        <div class="blind-warn">⚠ WARNING</div>
        <div class="blind-name">${c.name}</div>
        <div class="blind-stats">${c.watched}/${c.total} WATCHED · ${Math.round(c.watched/c.total*100)}%</div>
        ${c.desc ? `<div class="blind-desc">${c.desc}</div>` : ''}
      </div>`).join('')
    : '<div class="empty-state" style="padding:12px">NO SIGNIFICANT BLIND SPOTS DETECTED</div>';

  // Category completion
  const sorted = [...catData].sort((a,b) => (b.watched/b.total||0)-(a.watched/a.total||0));
  document.getElementById('cat-completion').innerHTML = sorted.map(c => {
    const p      = c.total > 0 ? c.watched/c.total : 0;
    const filled = Math.round(p*10);
    const segs   = Array.from({length:10}, (_,i) =>
      `<div class="cc-seg${i<filled?' on':''}"></div>`
    ).join('');
    return `<div class="cat-comp-row">
      <div class="cat-comp-name">${c.name}</div>
      <div class="cat-comp-bar">${segs}</div>
      <div class="cat-comp-pct">${Math.round(p*100)}%</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════
function exportWatched() {
  const siteWatched = getSiteWatched();
  let txt = 'TAXOGEEK — WATCHED LIST\n' + '═'.repeat(40) + '\n\n';
  allCategories.forEach(cat => {
    const watched = cat.films.filter(f => f.watched || siteWatched.has(normalizeTitle(f.title)));
    if (!watched.length) return;
    txt += `${cat.name}\n${'-'.repeat(cat.name.length)}\n`;
    watched.forEach(f => { txt += `  ${f.title}${f.year?' ('+f.year+')':''}\n`; });
    txt += '\n';
  });
  const blob = new Blob([txt], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'taxogeek-watched.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ══════════════════════════════════════════════
// DUPES
// ══════════════════════════════════════════════
function renderDupes() {
  const dupes = Object.entries(filmIndex)
    .filter(([,cats]) => cats.length > 1)
    .sort((a,b) => b[1].length - a[1].length);

  if (!dupes.length) {
    document.getElementById('dupes-content').innerHTML = '<div class="empty-state">NO DUPLICATES FOUND.</div>';
    return;
  }
  document.getElementById('dupes-content').innerHTML = dupes.map(([key, catIdxs]) => {
    const film = allCategories[catIdxs[0]].films.find(f => normalizeTitle(f.title) === key);
    const cats = catIdxs.map(ci => `<span class="dupe-tag">${allCategories[ci].subName||allCategories[ci].name}</span>`).join('');
    return `<div class="dupe-item">
      <div class="dupe-title">${film?film.title:key} ${film&&film.year?`<span style="color:var(--txt-lo);font-size:10px">(${film.year})</span>`:''}</div>
      <div class="dupe-cats">${cats}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
// DIRECTORS
// ══════════════════════════════════════════════
function renderDirectors() {
  if (directorsCached && _directorsCacheHtml) {
    document.getElementById('director-grid').innerHTML = _directorsCacheHtml;
    return;
  }
  const siteWatched = getSiteWatched();
  const dirs = Object.entries(directorIndex)
    .filter(([, d]) => d.films.length >= 2)
    .sort((a,b) => b[1].films.length - a[1].films.length);

  _directorsCacheHtml = dirs.map(([name, d]) => {
    const watched = d.films.filter(e => e.film.watched || siteWatched.has(normalizeTitle(e.film.title))).length;
    const total   = d.films.length;
    const segs    = Array.from({length:Math.min(total,10)}, (_,i) =>
      `<div class="cc-seg${i<Math.round(watched/total*Math.min(total,10))?' on':''}"></div>`
    ).join('');
    return `<div class="director-card" onclick="showDirectorDetail('${name.replace(/'/g,"\\'")}')" title="${name}">
      <div class="director-name">${name}</div>
      <div class="director-count">${total} FILM${total!==1?'S':''} · ${watched} WATCHED</div>
      <div class="cat-comp-bar" style="margin-top:6px">${segs}</div>
    </div>`;
  }).join('');

  document.getElementById('director-grid').innerHTML = _directorsCacheHtml;
  directorsCached = true;
}

function showDirectorDetail(name) {
  const d = directorIndex[name];
  if (!d) return;
  const siteWatched = getSiteWatched();
  const bycat = new Map();
  d.films.forEach(e => {
    const k = e.catName;
    if (!bycat.has(k)) bycat.set(k, { desc: allCategories[e.catIndex]?.desc||'', films:[] });
    bycat.get(k).films.push(e.film);
  });

  let html = `<div class="director-detail-panel">
    <div class="section-title">${name} — FILMOGRAPHY IN CANON</div>`;

  bycat.forEach((data, catName) => {
    html += `<div style="margin-bottom:10px">
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--cyan-dim);margin-bottom:3px;border-bottom:1px solid var(--border-lo);padding-bottom:2px;letter-spacing:0.15em">${catName}</div>
      ${data.films.map(f => {
        const fw = f.watched || siteWatched.has(normalizeTitle(f.title));
        return `<div class="director-film-row">
          <span class="director-film-title">${f.title}</span>
          ${f.year?`<span class="director-film-year">${f.year}</span>`:''}
          <span class="director-film-status">${fw ? '█' : '·'}</span>
        </div>`;
      }).join('')}
    </div>`;
  });
  html += '</div>';
  document.getElementById('director-detail').innerHTML = html;
}

// ══════════════════════════════════════════════
// WATCH NEXT
// ══════════════════════════════════════════════
function setTime(mins, btn) {
  sessionTime = mins;
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function initWatchNext() {
  document.getElementById('suggestions').innerHTML = '<div class="empty-state">SELECT A MODE TO RECEIVE TRANSMISSION.</div>';
}

function getUnwatched() {
  const sw = getSiteWatched();
  const arr = [];
  allCategories.forEach((cat, ci) => {
    cat.films.forEach(f => {
      if (!f.watched && !sw.has(normalizeTitle(f.title)))
        arr.push({film:f, cat, ci});
    });
  });
  return arr;
}

function filterByTime(picks) {
  if (!sessionTime) return picks;
  return picks.filter(p => {
    const data = omdbCache.get(`${p.film.title}|${p.film.year||''}`);
    if (!data || !data.Runtime || data.Runtime==='N/A') return true;
    const mins = parseInt(data.Runtime);
    return isNaN(mins) || mins <= sessionTime;
  });
}

function suggestRandom()  {
  let pool = filterByTime(getUnwatched());
  if (!pool.length) { showSuggestions([]); return; }
  const picks = [];
  for (let i=0;i<5;i++) picks.push(pool[Math.floor(Math.random()*pool.length)]);
  showSuggestions(picks, 'RANDOM SELECTION');
}
function suggestByGap() {
  const sw = getSiteWatched();
  const catGaps = allCategories.map((cat,ci) => {
    const watched = cat.films.filter(f=>f.watched||sw.has(normalizeTitle(f.title))).length;
    return {cat,ci,watched,gap:cat.films.length-watched};
  }).filter(c=>c.watched>0&&c.gap>0).sort((a,b)=>b.gap-a.gap);
  let picks = [];
  catGaps.slice(0,3).forEach(({cat,ci})=>{
    const uw = cat.films.filter(f=>!f.watched&&!sw.has(normalizeTitle(f.title)));
    if (uw.length) picks.push({film:uw[0],cat,ci,why:'HIGHEST GAP CATEGORY'});
  });
  showSuggestions(filterByTime(picks), 'GAP ANALYSIS');
}
function suggestArthouse() {
  const sw = getSiteWatched();
  const kw = ['auteur','philosophical','new wave','experimental','avant-garde','art-house','slow cinema'];
  let picks = [];
  allCategories.forEach((cat,ci)=>{
    const match = kw.some(w=>cat.name.toLowerCase().includes(w)||(cat.desc||'').toLowerCase().includes(w));
    if (!match) return;
    const uw = cat.films.filter(f=>!f.watched&&!sw.has(normalizeTitle(f.title)));
    if (uw.length) picks.push({film:uw[Math.floor(Math.random()*uw.length)],cat,ci});
  });
  showSuggestions(filterByTime(picks).slice(0,5), 'ARTHOUSE / AUTEUR SECTORS');
}
function suggestRecent() {
  let pool = getUnwatched().filter(p=>p.film.year);
  pool.sort((a,b)=>b.film.year-a.film.year);
  showSuggestions(filterByTime(pool).slice(0,5), 'MOST RECENT UNWATCHED');
}
function suggestOldest() {
  let pool = getUnwatched().filter(p=>p.film.year);
  pool.sort((a,b)=>a.film.year-b.film.year);
  showSuggestions(filterByTime(pool).slice(0,5), 'DEEP ARCHIVE — OLDEST RECORDS');
}

function showSuggestions(picks, label='') {
  if (!picks.length) {
    document.getElementById('suggestions').innerHTML = '<div class="empty-state">NO RECORDS MATCH CURRENT PARAMETERS.</div>';
    return;
  }
  document.getElementById('suggestions').innerHTML = `
    ${label?`<div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--cyan-dim);margin-bottom:12px;letter-spacing:0.2em">&gt; ${label}</div>`:''}
    ${picks.map((p,i) => `
      <div class="suggestion-result${i===selectedSuggestion?' active-suggestion':''}" id="sug-${i}">
        <div class="suggestion-film" onclick="openFilmModal('${p.film.title.replace(/'/g,"\\'")}',${p.film.year||'null'},${p.ci})" style="cursor:pointer">${p.film.title}${p.film.year?` <span style="font-size:11px;color:var(--txt-lo)">(${p.film.year})</span>`:''}</div>
        <div class="suggestion-cat">${p.cat.name}</div>
        ${p.why?`<div class="suggestion-why">&gt; ${p.why}</div>`:''}
      </div>`).join('')}
  `;
}

// ══════════════════════════════════════════════
// KEYBOARD
// ══════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModalDirect();
    document.getElementById('omdb-prompt').classList.remove('open');
  }
  if ((e.key === 'f' || e.key === '/') && document.activeElement !== document.getElementById('search-input') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
  const isNext = document.getElementById('view-next').classList.contains('active');
  if (e.key === 'ArrowDown' && isNext) {
    const sug = document.querySelectorAll('.suggestion-result');
    if (sug.length) {
      sug[selectedSuggestion]?.classList.remove('active-suggestion');
      selectedSuggestion = Math.min(selectedSuggestion+1, sug.length-1);
      sug[selectedSuggestion]?.classList.add('active-suggestion');
      sug[selectedSuggestion]?.scrollIntoView({block:'nearest'});
    }
  }
  if (e.key === 'ArrowUp' && isNext) {
    const sug = document.querySelectorAll('.suggestion-result');
    if (sug.length) {
      sug[selectedSuggestion]?.classList.remove('active-suggestion');
      selectedSuggestion = Math.max(selectedSuggestion-1, 0);
      sug[selectedSuggestion]?.classList.add('active-suggestion');
      sug[selectedSuggestion]?.scrollIntoView({block:'nearest'});
    }
  }
});

window.addEventListener('scroll', () => {
  document.getElementById('jump-top').classList.toggle('visible', window.scrollY > 400);
});

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
async function init() {
  try {
    const res = await fetch('movies.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    await runBoot(text);
  } catch(err) {
    document.getElementById('loader').innerHTML = `
      <div id="boot-logo">
        <span class="corner tl">┌</span><span class="corner tr">┐</span>
        <span class="corner bl">└</span><span class="corner br">┘</span>
        <div class="logo-name">ERROR</div>
        <div class="logo-sub">SYSTEM FAULT</div>
      </div>
      <div id="boot-lines">
        <div class="boot-line err">[ FATAL ] Could not load movies.md</div>
        <div class="boot-line err">[ FATAL ] ${err.message}</div>
        <div class="boot-line">Ensure movies.md is in the same directory as index.html</div>
      </div>`;
  }
}

init();
