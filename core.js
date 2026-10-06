/* BOOKmine — shared engine: covers, panel, cards, modal, lectern, search.
   Each design supplies its own scene and calls Core.boot({...}). */

const Core = (() => {

  // ── seeded random, so a book always paints itself the same way ──
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ── printed cloth bindings for books Open Library has no art for ──
  const CLOTH_HUES = [8, 22, 96, 148, 196, 214, 260, 292, 342];

  function wrapText(text, perLine, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      if (!line) line = word;
      else if ((line + " " + word).length <= perLine) line += " " + word;
      else { lines.push(line); line = word; }
      if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…");
    }
    return lines.length ? lines : ["—"];
  }

  function clothCover(item) {
    const rnd = mulberry(hashSeed(item.id));
    const hue = CLOTH_HUES[Math.floor(rnd() * CLOTH_HUES.length)];
    const cloth = `hsl(${hue}, 26%, ${20 + rnd() * 12}%)`;
    const clothLit = `hsl(${hue}, 30%, ${32 + rnd() * 10}%)`;
    const gold = `hsl(${38 + rnd() * 10}, 52%, ${62 + rnd() * 8}%)`;
    const w = 200, h = 300;
    const lines = wrapText(item.title.toUpperCase(), 13, 4);
    const startY = 118 - (lines.length - 1) * 11;
    const titleT = lines.map((l, i) => `<tspan x="${w / 2}" y="${startY + i * 22}">${esc(l)}</tspan>`).join("");
    const authorT = wrapText((item.author || "").toUpperCase(), 20, 2)
      .map((l, i) => `<tspan x="${w / 2}" y="${236 + i * 14}">${esc(l)}</tspan>`).join("");
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="${esc(item.title)} — cloth binding, no cover art">
      <defs><linearGradient id="cl-${item.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${clothLit}"/><stop offset="1" stop-color="${cloth}"/>
      </linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#cl-${item.id})"/>
      <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="${gold}" stroke-width="1" opacity=".55"/>
      <rect x="13" y="13" width="${w - 26}" height="${h - 26}" fill="none" stroke="${gold}" stroke-width=".5" opacity=".35"/>
      <path d="M34 ${startY - 34} H${w - 34}" stroke="${gold}" stroke-width="1.4" opacity=".8"/>
      <text text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="17"
        letter-spacing="1.4" fill="${gold}">${titleT}</text>
      <path d="M60 208 H${w - 60}" stroke="${gold}" stroke-width=".8" opacity=".6"/>
      <text text-anchor="middle" font-family="Jost, sans-serif" font-size="10"
        letter-spacing="2" fill="${gold}" opacity=".8">${authorT}</text>
    </svg>`;
  }

  const coverMarkup = (item, lazy = true) => item.cover
    ? `<img src="${esc(item.cover)}" alt="${esc(item.title)} cover"${lazy ? ' loading="lazy"' : ""}>`
    : clothCover(item);

  // a plain URL for canvas designs, which can't use inline SVG markup
  const coverURL = item => item.cover || null;

  // ── dates ──
  const fmtDate = iso =>
    new Date(iso + "T00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });

  const daysSince = iso =>
    Math.max(1, Math.round((Date.now() - new Date(iso + "T00:00")) / 86400000));

  function readingSpan(item) {
    if (item.status === "read" && item.finished) {
      let out = `finished ${fmtDate(item.finished)}`;
      if (item.started && item.started !== item.finished) {
        const days = Math.max(1, Math.round(
          (new Date(item.finished) - new Date(item.started)) / 86400000));
        out += ` · read in ${days} day${days === 1 ? "" : "s"}`;
        if (item.pages) out += ` · ${Math.round(item.pages / days)} pages a day`;
      }
      return out;
    }
    if (item.status === "reading" && item.started)
      return `reading since ${fmtDate(item.started)} · day ${daysSince(item.started)}`;
    return item.added ? `added ${fmtDate(item.added)}` : "";
  }

  // ── the hands at the lectern ──
  // Drawn rather than photographed so the thumbs can sit IN FRONT of the cover.
  // The shadow they throw is what makes it read as holding rather than pasting.
  const HANDS_SVG = `
  <svg class="hands" viewBox="0 0 304 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--hand-lit)"/>
        <stop offset="1" stop-color="var(--hand-dark)"/>
      </linearGradient>
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7"/>
      </filter>
      <filter id="ash" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/>
      </filter>
    </defs>
    <g fill="#000" opacity=".26" filter="url(#soft)">
      <ellipse cx="54" cy="86" rx="15" ry="36"/>
      <ellipse cx="250" cy="86" rx="15" ry="36"/>
    </g>
    <g filter="url(#ash)" fill="url(#skin)" stroke="var(--hand-line)" stroke-width=".9" stroke-linejoin="round">
      <path d="M0 150 C4 126 18 108 42 100 L74 112 C58 122 48 136 46 150 Z"/>
      <path d="M32 116 C30 100 44 88 64 88 C82 88 92 98 92 114 C92 130 78 142 60 142 C44 142 34 132 32 116 Z"/>
      <path d="M60 118 C55 100 57 72 66 50 C70 40 82 39 87 48 C94 62 93 96 88 114 C86 122 78 126 71 125 C65 124 61 122 60 118 Z"/>
      <path d="M304 150 C300 126 286 108 262 100 L230 112 C246 122 256 136 258 150 Z"/>
      <path d="M272 116 C274 100 260 88 240 88 C222 88 212 98 212 114 C212 130 226 142 244 142 C260 142 270 132 272 116 Z"/>
      <path d="M244 118 C249 100 247 72 238 50 C234 40 222 39 217 48 C210 62 211 96 216 114 C218 122 226 126 233 125 C239 124 243 122 244 118 Z"/>
    </g>
    <g fill="var(--hand-lit)" opacity=".5">
      <ellipse cx="77" cy="58" rx="7.5" ry="10.5" transform="rotate(-9 77 58)"/>
      <ellipse cx="227" cy="58" rx="7.5" ry="10.5" transform="rotate(9 227 58)"/>
    </g>
    <g fill="none" stroke="var(--hand-line)" stroke-width=".85" opacity=".5" stroke-linecap="round">
      <path d="M63 96 C71 92 80 93 87 98"/><path d="M241 96 C233 92 224 93 217 98"/>
      <path d="M42 108 C52 102 66 101 76 106"/><path d="M262 108 C252 102 238 101 228 106"/>
      <path d="M44 126 C54 121 68 121 78 126"/><path d="M260 126 C250 121 236 121 226 126"/>
    </g>
  </svg>`;

  let heldId = null;
  let handsMarkup = HANDS_SVG;   // a design may swap in its own art

  function renderLectern() {
    const held = document.getElementById("held");
    const ledge = document.getElementById("ledge");
    if (!held) return;
    const reading = LIBRARY.filter(x => x.status === "reading")
      .sort((a, b) => (b.started || "").localeCompare(a.started || ""));

    if (!reading.length) {
      held.innerHTML = `<p class="lectern-empty">nothing open at the moment</p>`;
      if (ledge) ledge.innerHTML = "";
      return;
    }
    if (!reading.some(x => x.id === heldId)) heldId = reading[0].id;
    const book = reading.find(x => x.id === heldId);

    held.innerHTML = `
      <div class="held-figure" data-id="${esc(book.id)}" tabindex="0" role="button"
        aria-label="${esc(book.title)} — currently reading">
        <div class="held-frame">
          <div class="held-book">${coverMarkup(book, false)}</div>
          ${handsMarkup}
        </div>
        <div class="held-caption">
          <div class="held-title">${esc(book.title)}</div>
          <div class="held-author">${esc(book.author)}</div>
          ${book.started ? `<div class="held-since">reading since ${fmtDate(book.started)} · day ${daysSince(book.started)}</div>` : ""}
        </div>
      </div>`;

    if (ledge) {
      ledge.innerHTML = reading.filter(x => x.id !== heldId).map(item =>
        `<button class="ledge-item" data-pickup="${esc(item.id)}"
           title="pick up ${esc(item.title)}">${coverMarkup(item)}</button>`).join("");
    }
  }

  // ── plates ──
  // Step to the next book you are currently reading. The lectern already had
  // this through the ledge buttons; a scene with no ledge (an enchanting table,
  // say) needs to drive it directly.
  function cycleHeld() {
    const reading = LIBRARY.filter(x => x.status === "reading")
      .sort((a, b) => (b.started || "").localeCompare(a.started || ""));
    if (reading.length < 2) return reading[0] || null;
    const i = reading.findIndex(x => x.id === heldId);
    heldId = reading[(i + 1) % reading.length].id;
    renderLectern();
    return reading.find(x => x.id === heldId);
  }
  function heldBook() {
    const reading = LIBRARY.filter(x => x.status === "reading")
      .sort((a, b) => (b.started || "").localeCompare(a.started || ""));
    return reading.find(x => x.id === heldId) || reading[0] || null;
  }

  function renderPlates() {
    const toread = LIBRARY.filter(x => x.status === "toread");
    const read = LIBRARY.filter(x => x.status === "read");
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("countToread", toread.length);
    set("countRead", read.length);
    const pages = toread.reduce((s, x) => s + (x.pages || 0), 0);
    set("subToread", pages ? `${pages.toLocaleString()} pages waiting` : "");
    const rated = read.filter(x => x.score != null);
    set("subRead", rated.length
      ? `avg ${(rated.reduce((s, x) => s + x.score, 0) / rated.length).toFixed(1)}` : "");
  }

  // ── filtering, sorting, panel ──
  const filterState = { query: "", genres: new Set() };
  const sortState = { key: "default", dir: -1 };
  let openStatus = null;

  const PANEL_META = {
    toread: { title: "To Read", empty: "nothing waiting under that filter." },
    read:   { title: "Read",    empty: "nothing read matches that filter." },
    search: { title: "Search",  empty: "no book on these shelves matches." }
  };

  const SORTS = {
    score: x => x.score ?? null,
    year: x => x.year ?? null,
    pages: x => x.pages ?? null,
    author: x => (x.author || "").toLowerCase(),
  };

  function matchesFilters(item) {
    if (filterState.genres.size && !(item.genres || []).some(g => filterState.genres.has(g)))
      return false;
    const q = filterState.query.trim().toLowerCase();
    if (q) {
      const hay = `${item.title} ${item.author} ${(item.genres || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function defaultOrder(items, status) {
    if (status === "read")
      return [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)
        || (b.finished || "").localeCompare(a.finished || ""));
    if (status === "toread")
      return [...items].sort((a, b) => (b.added || "").localeCompare(a.added || ""));
    return items;
  }

  function scoreBadge(item) {
    if (item.status !== "read") return "";       // no verdict until it's finished
    if (item.score == null) return `<div class="score-badge unrated" title="not rated">~</div>`;
    return `<div class="score-badge" title="my rating">${item.score}</div>`;
  }

  // A scene may draw a book its own way - a 3D-hinged cover, a spine seen
  // edge-on - without forking the panel, the filtering or the sorting. The
  // default below stays in force until a scene sets one.
  // Fires once the shelf's cards are in the DOM. A scene that rearranges them
  // (a masonry, say) needs to run after every sort and filter, not just once.
  let afterRender = null;
  function setAfterRender(fn) { afterRender = fn; }

  let cardHook = null;
  function setCardMarkup(fn) { cardHook = fn; }

  function cardMarkup(item, index) {
    if (cardHook) return cardHook(item, index);
    return defaultCardMarkup(item, index);
  }

  function defaultCardMarkup(item, index) {
    const bits = [];
    if (item.year) bits.push(item.year);
    if (item.pages) bits.push(`${item.pages}p`);
    return `
      <article class="card card-reveal" data-id="${esc(item.id)}" tabindex="0"
        style="--stagger:${(index % 14) * 0.035}s">
        ${scoreBadge(item)}
        <div class="card-plate">
          ${coverMarkup(item)}
          <div class="card-veil">
            <div class="veil-row">${bits.map(b => `<span class="chip">${b}</span>`).join("")}</div>
            <div class="veil-row">${(item.genres || []).slice(0, 2)
              .map(g => `<span class="chip">${esc(g)}</span>`).join("")}</div>
          </div>
        </div>
        <div class="card-title">${esc(item.title)}</div>
        <div class="card-author">${esc(item.author)}</div>
      </article>`;
  }

  // A chip that returns nothing is noise, so each panel offers only the genres
  // present on its own shelf.
  function renderGenreChips() {
    const pool = openStatus === "search" || !openStatus
      ? LIBRARY : LIBRARY.filter(x => x.status === openStatus);
    const genres = [...new Set(pool.flatMap(x => x.genres || []))].sort();
    const host = document.getElementById("genreChips");
    if (host) host.innerHTML = genres.map(g =>
      `<button class="genre-chip${filterState.genres.has(g) ? " active" : ""}">${esc(g)}</button>`).join("");
  }

  function renderPanelContent() {
    notifyFilters();          // scenes that drew their own shelf redraw it too
    if (!openStatus) return;
    const pool = openStatus === "search" ? LIBRARY : LIBRARY.filter(x => x.status === openStatus);
    let items = defaultOrder(pool.filter(matchesFilters), openStatus);

    if (sortState.key !== "default") {
      const val = SORTS[sortState.key];
      items = [...items].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;               // unknowns sink, either direction
        if (vb == null) return -1;
        const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        return cmp * sortState.dir;
      });
    }

    const pages = items.reduce((s, x) => s + (x.pages || 0), 0);
    document.getElementById("panelTally").textContent =
      `${items.length} book${items.length === 1 ? "" : "s"}` + (pages ? ` · ${pages.toLocaleString()} pages` : "");

    const host = document.getElementById("panelCollection");
    host.innerHTML = items.length ? items.map(cardMarkup).join("")
      : `<p class="empty-note">${PANEL_META[openStatus].empty}</p>`;
    if (afterRender) afterRender(host, items);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      host.querySelectorAll(".card-reveal").forEach(c => c.classList.add("shown"))));
  }

  function updateSortButtons() {
    document.querySelectorAll(".sort-btn").forEach(b => {
      const active = b.dataset.sort === sortState.key;
      b.classList.toggle("active", active);
      const arrow = b.querySelector(".sort-arrow");
      if (arrow) arrow.textContent = active ? (sortState.dir === 1 ? " ↑" : " ↓") : "";
    });
  }

  // The filtered, sorted pool for a shelf - what the panel WOULD show. A scene
  // that has no panel (the room-as-navigation layouts) needs exactly this list
  // to dress a wall with, and re-deriving it would drift from the panel's own.
  function shelfItems(status) {
    const pool = status === "search" ? LIBRARY : LIBRARY.filter(x => x.status === status);
    let items = defaultOrder(pool.filter(matchesFilters), status);
    if (sortState.key !== "default") {
      const val = SORTS[sortState.key];
      items = [...items].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
        return cmp * sortState.dir;
      });
    }
    return items;
  }

  // Scenes that replace the panel still need to know when the search box or a
  // filter changed, so they can redraw whatever they drew instead of it.
  let onFilterChange = null;
  function setFilterListener(fn) { onFilterChange = fn; }
  function notifyFilters() { if (onFilterChange) onFilterChange(filterState); }

  function openPanel(status) {
    openStatus = status;
    filterState.genres.clear();     // a genre on one shelf may not exist on the next
    renderGenreChips();
    sortState.key = "default";
    sortState.dir = -1;
    updateSortButtons();
    document.getElementById("panelTitle").textContent = status === "search"
      ? `“${filterState.query.trim()}”` : PANEL_META[status].title;
    renderPanelContent();
    document.getElementById("panelBody").scrollTop = 0;
    const panel = document.getElementById("panel");
    panel.dataset.shelf = status;      // lets a design dress each shelf its own way
    panel.hidden = false;
  }

  function closePanel() {
    document.getElementById("panel").hidden = true;
    openStatus = null;
  }

  // ── the detail view: three clicks ──
  // 1. the book flies to the centre and sits there, closed.
  // 2. the info slides out from behind it, like a card drawn from its sleeve.
  // 3. it slides back in. Esc or the scrim closes the whole thing.
  let lastPoint = null;
  let currentItem = null;

  // The detail view asks the scene how to draw its cover, so a scene that gives
  // its books a hinge can give the opened one the same hinge.
  let detailCoverHook = null;
  function setDetailCover(fn) { detailCoverHook = fn; }
  function detailCover(item) {
    return detailCoverHook ? detailCoverHook(item) : coverMarkup(item, false);
  }

  // A scene can animate the detail view in from the element that was clicked,
  // and back to it on close. Designs that set neither hook behave as before.
  let afterOpen = null, beforeClose = null;
  function setAfterOpen(fn)   { afterOpen = fn; }
  function setBeforeClose(fn) { beforeClose = fn; }

  function openModal(item, sourceEl = null) {
    const spread = document.getElementById("modal");
    currentItem = item;
    const bits = [];
    if (item.year) bits.push(String(item.year));
    if (item.pages) bits.push(`${item.pages} pages`);

    document.getElementById("modalBody").innerHTML = `
      <div class="spread-stack">
        <div class="cover-mount" role="button" tabindex="0"
             aria-label="Show details for ${esc(item.title)}">${detailCover(item)}</div>
        <div class="info-sleeve">
          <div class="sleeve-inner">
            <div class="spread-title">${esc(item.title)}</div>
            <div class="spread-byline">
              ${item.authorPhoto ? `<img class="author-photo" src="${esc(item.authorPhoto)}" alt="">` : ""}
              <span class="spread-author">${esc(item.author)}</span>
            </div>
            <div class="spread-meta">
              ${bits.map(b => `<span class="chip">${b}</span>`).join("")}
              ${(item.genres || []).map(g => `<span class="chip">${esc(g)}</span>`).join("")}
            </div>
            <div class="spread-rule"></div>
            ${item.status === "read" ? `
              <div class="spread-scores">
                ${item.score != null ? `<span class="my-score"><b>${item.score}</b> / 10</span>`
                  : `<span class="my-score">not rated</span>`}
                ${item.olRating ? `<span class="their-score">Open Library readers: ${item.olRating}/5
                  (${item.olRatingCount})</span>` : ""}
              </div>` : ""}
            ${(item.blurb || item.synopsis)
              ? `<p class="spread-synopsis">${esc(item.blurb || item.synopsis)}</p>`
              : `<p class="spread-synopsis" style="opacity:.5">No description for this one yet.</p>`}
            ${item.notes ? `<div class="spread-notes">${esc(item.notes)}</div>` : ""}
            <div class="spread-dates">${readingSpan(item)}</div>
          </div>
        </div>
      </div>`;

    spread.classList.remove("open");
    spread.hidden = false;
    const book = spread.querySelector(".spread-book");
    if (lastPoint) {
      const r = book.getBoundingClientRect();
      const clamp = v => Math.max(-30, Math.min(130, v));
      book.style.setProperty("--ox", clamp((lastPoint.x - r.left) / r.width * 100) + "%");
      book.style.setProperty("--oy", clamp((lastPoint.y - r.top) / r.height * 100) + "%");
    }
    requestAnimationFrame(() => spread.classList.add("arrived"));
    if (afterOpen) afterOpen(item, sourceEl);
  }

  function toggleInfo() {
    const spread = document.getElementById("modal");
    if (spread.hidden) return;
    spread.classList.toggle("open");
  }

  let closeTimer = null;
  function closeModal() {
    const spread = document.getElementById("modal");
    if (spread.hidden || spread.dataset.closing) return;
    if (beforeClose) {
      // the scene animates the book home; the view hides once it has landed
      spread.dataset.closing = "1";
      const done = () => {
        delete spread.dataset.closing;
        spread.classList.remove("open", "arrived");
        spread.hidden = true;
      };
      Promise.resolve(beforeClose()).then(done, done);
      return;
    }
    spread.classList.remove("open", "arrived");
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { spread.hidden = true; }, 160);
  }

  // ── wiring ──
  // `onPick` lets a scene claim a click first (canvas hit-testing, for instance)
  function boot({ onPick, onRebuild } = {}) {
    const panel = document.getElementById("panel");
    const modal = document.getElementById("modal");

    document.getElementById("panelClose").addEventListener("click", closePanel);
    document.getElementById("panelBackdrop").addEventListener("click", closePanel);
    modal.querySelector(".spread-scrim").addEventListener("click", closeModal);
    modal.querySelector(".spread-close").addEventListener("click", closeModal);
    // clicking the cover toggles the information in and out of it
    modal.addEventListener("click", e => {
      if (e.target.closest(".cover-mount")) { e.stopPropagation(); toggleInfo(); }
    });

    const chips = document.getElementById("genreChips");
    chips.addEventListener("click", e => {
      const chip = e.target.closest(".genre-chip");
      if (!chip) return;
      const g = chip.textContent;
      if (filterState.genres.has(g)) { filterState.genres.delete(g); chip.classList.remove("active"); }
      else { filterState.genres.add(g); chip.classList.add("active"); }
      renderPanelContent();
    });

    document.querySelectorAll(".sort-btn").forEach(b => {
      b.addEventListener("click", () => {
        const key = b.dataset.sort;
        if (key === sortState.key && key !== "default") sortState.dir = -sortState.dir;
        else {
          sortState.key = key;
          sortState.dir = key === "author" ? 1 : -1;   // names read A-first
        }
        updateSortButtons();
        renderPanelContent();
      });
    });

    document.getElementById("searchBox").addEventListener("input", e => {
      filterState.query = e.target.value;
      notifyFilters();
      if (filterState.query.trim()) {
        if (!openStatus) openPanel("search");
        else if (openStatus === "search") {
          document.getElementById("panelTitle").textContent = `“${filterState.query.trim()}”`;
          renderPanelContent();
        } else renderPanelContent();
      } else if (openStatus === "search") closePanel();
      else if (openStatus) renderPanelContent();
    });

    document.addEventListener("click", e => {
      lastPoint = { x: e.clientX, y: e.clientY };
      const pickup = e.target.closest("[data-pickup]");
      if (pickup) { heldId = pickup.dataset.pickup; renderLectern(); return; }

      const el = e.target.closest("[data-id]");
      if (el) {
        const item = LIBRARY.find(x => x.id === el.dataset.id);
        if (item) openModal(item, el);
        return;
      }
      const trigger = e.target.closest("[data-status]");
      if (trigger) { openPanel(trigger.dataset.status); return; }
      if (onPick && panel.hidden && modal.hidden) onPick(e);
    });

    document.addEventListener("keydown", e => {
      const box = document.getElementById("searchBox");
      if (e.key === "Escape") {
        if (!modal.hidden) closeModal();
        else if (!panel.hidden) closePanel();
        else if (box.value) { box.value = ""; filterState.query = ""; }
        return;
      }
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault(); box.focus(); return;
      }
      if (e.key === "Enter") {
        const el = document.activeElement;
        if (el && el.dataset && el.dataset.id) {
          const item = LIBRARY.find(x => x.id === el.dataset.id);
          if (item) openModal(item, el);
        }
      }
    });

    renderLectern();
    renderPlates();

    if (onRebuild) {
      // Only WIDTH matters to the layout. Pressing Alt in Firefox reveals the
      // menu bar, which changes the viewport height by a few pixels — and that
      // was rebuilding every falling book and visibly re-laying out the page.
      let t, lastW = window.innerWidth;
      window.addEventListener("resize", () => {
        if (window.innerWidth === lastW) return;
        lastW = window.innerWidth;
        clearTimeout(t);
        t = setTimeout(onRebuild, 220);
      });
    }
  }

  const setHands = html => { handsMarkup = html; };

  return { hashSeed, mulberry, esc, clothCover, coverMarkup, coverURL, setHands,
           fmtDate, daysSince, readingSpan, HANDS_SVG, scoreBadge,
           renderLectern, renderPlates, openPanel, openModal, boot,
           cycleHeld, heldBook, setAfterOpen, setBeforeClose,
           setCardMarkup, defaultCardMarkup, setDetailCover, setAfterRender,
           shelfItems, setFilterListener,
           filterState, closePanel };
})();
