/* BOOKmine — the corridor.
 *
 * Builds the 3D room's furniture (torches, staircase, the Read block set into
 * the right-hand wall) and wires the three controls: the scroll, the block and
 * the enchanting table.
 */

const { coverMarkup, esc } = Core;
const rand = (a, b) => a + Math.random() * (b - a);

Core.setHands("");

/* ══════════ a book ══════════ */
function bookMarkup(item, lazy = true) {
  return `<div class="book">
      <div class="book-pages"></div>
      <div class="book-top"></div>
      <div class="book-cover">
        ${coverMarkup(item, lazy)}
        <div class="cover-back"></div>
      </div>
    </div>`;
}
Core.setDetailCover(item => bookMarkup(item, false));
Core.setCardMarkup(item => `
  <article class="card" data-id="${esc(item.id)}" tabindex="0" role="button"
           aria-label="${esc(item.title)} by ${esc(item.author)}">
    ${Core.scoreBadge(item)}
    ${bookMarkup(item)}
    <div class="card-title">${esc(item.title)}</div>
    <div class="card-author">${esc(item.author)}</div>
  </article>`);

/* ══════════ masonry ══════════ */
const COL_GAP = 16;
// One rule sizes the books on BOTH shelves, so To Read and Read always match:
// as many columns of at least colMin() as fit, stretched to fill the width.
// Phones use a smaller minimum, or a single book would span the whole screen.
const colMin = () => (window.innerWidth < 700 ? 92 : 132);
function colSpec(w) {
  const n = Math.max(1, Math.floor((w + COL_GAP) / (colMin() + COL_GAP)));
  return { n, colW: (w - (n - 1) * COL_GAP) / n };
}
function columnise(host) {
  if (!host) return;
  const cards = [...host.querySelectorAll(".card, .empty-note")];
  if (!cards.length) return;
  host.replaceChildren(...cards);
  const w = host.clientWidth;
  if (w < colMin()) { requestAnimationFrame(() => columnise(host)); return; }
  const { n } = colSpec(w);
  const cols = Array.from({ length: n }, () => {
    const d = document.createElement("div");
    d.className = "mcol";
    return d;
  });
  cards.forEach((el, i) => cols[i % n].appendChild(el));
  host.replaceChildren(...cols);
}
/* ══════════ To Read as a bookshelf ══════════ */
/* Books stand side by side on wooden planks, row after row, all the same size,
   with no labels: title and author appear in a tag only while you point at a
   book. Rows are built from the host's real width, so the count per shelf
   follows the window, and sort order reads left to right, shelf by shelf. */
/* How wide a Read column would be right now: briefly lay the panel out as
   Read, measure, and put it back. Both layouts happen inside one script turn,
   so nothing is ever painted in between. */
function readColumnWidth(host) {
  const panel = document.getElementById("panel");
  const card = panel.querySelector(".panel-card");
  const saved = panel.dataset.shelf, style = card.getAttribute("style");
  panel.dataset.shelf = "read";
  ["left", "top", "right", "bottom", "width", "height"].forEach(k => card.style[k] = "");
  const w = host.clientWidth;
  panel.dataset.shelf = saved;
  if (style === null) card.removeAttribute("style"); else card.setAttribute("style", style);
  return colSpec(w).colW;
}

function shelve(host) {
  if (!host) return;
  const cards = [...host.querySelectorAll(".card, .empty-note")];
  if (!cards.length) return;
  host.replaceChildren(...cards);
  const w = host.clientWidth;
  if (w < colMin()) { requestAnimationFrame(() => shelve(host)); return; }
  // Books exactly the width Read's columns are at this window size. Using the
  // same rule on this panel's own width is not enough: the scroll's padding
  // makes it narrower, which gave 133px here against 154px there on a laptop.
  const colW = readColumnWidth(host);
  const per = Math.max(1, Math.floor((w + COL_GAP) / (colW + COL_GAP)));
  const rows = [];
  for (let i = 0; i < cards.length; i += per) {
    const row = document.createElement("div");
    row.className = "shelf-row";
    cards.slice(i, i + per).forEach(c => {
      // the caption becomes a hover tag laid over the book
      if (!c.querySelector(".card-tag")) {
        const tag = document.createElement("span");
        tag.className = "card-tag";
        c.querySelectorAll(".card-title, .card-author").forEach(t => tag.appendChild(t));
        c.appendChild(tag);
      }
      c.style.width = colW.toFixed(2) + "px";
      row.appendChild(c);
    });
    const plank = document.createElement("div");
    plank.className = "shelf-plank";
    row.appendChild(plank);
    rows.push(row);
  }
  host.classList.add("shelved");
  host.replaceChildren(...rows);
}

/* Each genre gets its own muted colour. Hashing names onto a palette put the
   same colour on neighbours (8 colours across 13 tags), so instead every genre
   in the whole library is sorted once and dealt colours in order, from hues
   spaced around the wheel and alternating warm and cool. Neighbouring tags can
   never match, and a genre keeps its colour on every shelf. */
const GENRE_ORDER = [...new Set(LIBRARY.flatMap(b => b.genres || []))]
  .concat("Unsorted").sort((a, b) => a.localeCompare(b));
function colourTags() {
  document.querySelectorAll("#genreChips .genre-chip").forEach(chip => {
    const i = Math.max(0, GENRE_ORDER.indexOf(chip.textContent.trim()));
    // golden-angle steps never repeat a hue and keep neighbours far apart;
    // the old 10-hue cycle gave Religion the same rust as Biography
    const hue = Math.round((i * 137.508 + 20) % 360);
    // the dark Read and search panels need a touch more light to stay lively
    const onScroll = document.getElementById("panel").dataset.shelf === "toread";
    chip.style.setProperty("--tag", `hsl(${hue} ${onScroll ? 46 : 52}% ${onScroll ? 38 : 45}%)`);
  });
}

function relayoutShelf() {
  const host = document.getElementById("panelCollection");
  if (!host) return;
  document.getElementById("panel").dataset.shelf === "toread" ? shelve(host) : columnise(host);
}

Core.setAfterRender(host => {
  colourTags();
  const shelf = document.getElementById("panel").dataset.shelf;
  if (shelf === "toread") shelve(host);
  else { host.classList.remove("shelved"); columnise(host); }
});

/* ══════════ time of day ══════════ */
/* Five baked plates, one per light. Only the current one is ever requested,
   so the visitor downloads a single plate however many exist on disk. */
const HOURS = [                      // [name, first hour it applies from]
  ["night", 0], ["dawn", 5], ["morning", 8],
  ["afternoon", 12], ["dusk", 17], ["night", 20],
];
function hourNow(d = new Date()) {
  const h = d.getHours();
  let name = "night";
  for (const [n, from] of HOURS) if (h >= from) name = n;
  return name;
}
let HOUR = hourNow();
// lantern data for the current plate; the rest of the scene reads from this
const lampsNow = () =>
  (typeof CORRIDOR !== "undefined" && CORRIDOR.hours && CORRIDOR.hours[HOUR]) || { lamps: [], flicker: [] };

function showPlate(name, crossfade) {
  const plate = document.querySelector(".corridor-plate");
  if (!plate) return;
  const url = `mc/corridor-${name}.png`;
  if (!crossfade) { plate.style.backgroundImage = `url("${url}")`; return; }
  // Load first, then fade the new plate in over the old, so the hour turning
  // is a slow change of light rather than a flash of an empty frame.
  const img = new Image();
  img.onload = () => {
    const next = plate.cloneNode(false);
    next.style.backgroundImage = `url("${url}")`;
    next.style.opacity = "0";
    next.style.transition = "opacity 4s ease";
    plate.after(next);
    requestAnimationFrame(() => { next.style.opacity = "1"; });
    setTimeout(() => plate.remove(), 4200);
  };
  img.src = url;
}

// look again once a minute; if the hour's light has changed, fade to it
setInterval(() => {
  const h = hourNow();
  if (h === HOUR) return;
  HOUR = h;
  showPlate(h, true);
  projectGlows();
  buildDust();
}, 60000);

/* ══════════ the room's furniture ══════════ */
const TILE = () => parseFloat(getComputedStyle(document.documentElement)
  .getPropertyValue("--tile")) || 58;


/* Torch positions were recorded from the live 3D scene when the plate was
   baked, as percentages, so the light lands exactly on the painted flames at
   any window size. CORRIDOR is written by bake_corridor.py. */
function projectGlows() {
  const host = document.getElementById("glows");
  if (!host || typeof CORRIDOR === "undefined") return;
  const r = plateRect(), W = r.w, H = r.h;
  // Only the nearest few, and small: the steady light is painted into the
  // plate, so these are just the flicker on top of it.
  host.innerHTML = (lampsNow().flicker || []).map(t => {
    const size = Math.min(260, Math.max(48, t.w / 100 * W * 3.4));   // never a screen-wide wash
    return `<div class="glow2" style="
      width:${size.toFixed(0)}px; height:${size.toFixed(0)}px;
      left:${(r.x + t.x / 100 * W - size / 2).toFixed(0)}px;
      top:${(r.y + t.y / 100 * H - size / 2).toFixed(0)}px;
      --fd:${rand(1.9, 3.4).toFixed(2)}s;
      animation-delay:-${rand(0, 3).toFixed(2)}s;"></div>`;
  }).join("");
}




/* ══════════ the wizard ══════════ */
/* Seven spots. The marked-up screenshot was a CROP at an unknown scale, so it
   was template-matched against the plate itself (normalised cross-correlation
   over a range of scales) to recover exactly which part of the corridor it
   showed; the boxes were then mapped straight into plate coordinates. They are stored against the
   PLATE, not the window: the plate is shown with background-size:cover, so a
   wider window crops top and bottom and raw viewport percentages would slide
   him off the floor. plateRect() redoes that same cover maths at runtime, so
   he stands on the same tile at any size. Each box's height sets his height
   there, which is what gives the depth. */
// face: which wall he turns toward. Everything left of the middle looks left,
// everything right looks right, so he is always reading the nearer shelf.
const WIZARD_SPOTS = [
  { x: 26.24, y: 97.15, h: 10.31, face: -1 },
  { x: 33.79, y: 81.33, h:  6.21, face: -1 },
  { x: 39.16, y: 68.56, h:  5.27, face: -1 },
  { x: 57.65, y: 63.16, h:  5.51, face:  1 },
  { x: 60.95, y: 72.07, h:  8.09, face:  1 },
  { x: 66.52, y: 83.68, h:  8.79, face:  1 },
  { x: 72.45, y: 97.39, h: 13.60, face:  1 },
];
const PLATE_W = 1920, PLATE_H = 1080;

function plateRect() {
  const W = window.innerWidth, H = window.innerHeight;
  const s = Math.max(W / PLATE_W, H / PLATE_H);   // background-size: cover
  const w = PLATE_W * s, h = PLATE_H * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

const Wizard = (() => {
  let el, sprite, at = 0, timer = null;
  const VANISH_CHANCE = 0.28, VANISH_MS = 5000;

  function place(i) {
    const r = plateRect(), a = WIZARD_SPOTS[i];
    el.style.setProperty("--wx", `${(r.x + a.x / 100 * r.w).toFixed(0)}px`);
    el.style.setProperty("--wy", `${(r.y + a.y / 100 * r.h).toFixed(0)}px`);
    el.style.setProperty("--wh", `${(a.h / 100 * r.h).toFixed(0)}px`);
    // the sprite carries the facing; the wrapper carries the position
    sprite.style.setProperty("--face", a.face);
    sprite.style.setProperty("--tilt", `${(a.face * -6)}deg`);
  }
  function puffAt(i) {
    const layer = document.getElementById("wizardLayer");
    const r = plateRect(), a = WIZARD_SPOTS[i];
    const size = a.h / 100 * r.h * 0.62;
    const p = document.createElement("div");
    p.className = "puff";
    p.style.width = p.style.height = `${size.toFixed(0)}px`;
    p.style.left = `${(r.x + a.x / 100 * r.w - size / 2).toFixed(0)}px`;
    p.style.top = `${(r.y + a.y / 100 * r.h - size * 0.82).toFixed(0)}px`;
    layer.appendChild(p);
    setTimeout(() => p.remove(), 420);
  }
  /* On a portrait phone the plate is cropped hard by background-size: cover,
     and the outer spots fall outside the visible strip entirely. Only offer
     him somewhere he can actually be seen standing. */
  function visibleSpots() {
    const r = plateRect(), W = window.innerWidth;
    const ok = WIZARD_SPOTS.map((a, i) => [i, r.x + a.x / 100 * r.w])
      .filter(([, x]) => x > W * 0.06 && x < W * 0.94)
      .map(([i]) => i);
    return ok.length ? ok : [Math.floor(WIZARD_SPOTS.length / 2)];
  }

  function hop() {
    if (document.hidden) return schedule();
    const from = at;
    const pool = visibleSpots();
    let to = from;
    if (pool.length === 1) to = pool[0];
    else while (to === from) to = pool[Math.floor(Math.random() * pool.length)];
    const vanishing = Math.random() < VANISH_CHANCE;
    el.classList.remove("coming");
    el.classList.add("going");
    puffAt(from);
    setTimeout(() => {
      el.classList.remove("going");
      const arrive = () => {
        at = to; place(to); puffAt(to);
        el.style.visibility = "";
        void el.offsetWidth;
        el.classList.add("coming");
        setTimeout(() => el.classList.remove("coming"), 260);
        schedule();
      };
      if (vanishing) { el.style.visibility = "hidden"; setTimeout(arrive, VANISH_MS); }
      else arrive();
    }, 240);
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(hop, 5000 + Math.random() * 2500);
  }
  function init() {
    const layer = document.getElementById("wizardLayer");
    if (!layer) return;
    layer.innerHTML = `<div class="wizard" id="wizardSprite"><div class="wiz-sprite"></div></div>`;
    el = document.getElementById("wizardSprite");
    sprite = el.firstElementChild;
    at = visibleSpots()[0];
    place(at);
    schedule();
  }
  // a resize changes the crop, so a spot that was fine may now be off-frame
  function reflow() {
    if (!el) return;
    if (!visibleSpots().includes(at)) at = visibleSpots()[0];
    place(at);
  }
  return { init, reflow };
})();

/* ══════════ dust and small events ══════════ */
/* Dust rises through the lantern shafts. Positions come from the baked
   lantern list, so the specks are lit where the light actually is. */
function buildDust() {
  const host = document.getElementById("dust");
  if (!host || typeof CORRIDOR === "undefined") return;
  const r = plateRect();
  const lamps = lampsNow().lamps.filter(t => t.w > 0.6);   // the nearer ones
  const n = window.innerWidth < 860 ? 7 : 12;
  let html = "";
  for (let i = 0; i < n; i++) {
    const l = lamps[i % lamps.length] || { x: 50, y: 30 };
    const x = r.x + (l.x + rand(-3.5, 3.5)) / 100 * r.w;
    const y = r.y + (l.y + rand(6, 26)) / 100 * r.h;
    html += `<div class="speck" style="
      left:${x.toFixed(0)}px; top:${y.toFixed(0)}px;
      --sdx:${rand(-16, 16).toFixed(0)}px;
      --sdy:${rand(-150, -70).toFixed(0)}px;
      --sd:${rand(8, 15).toFixed(1)}s;
      --sdelay:-${rand(0, 14).toFixed(1)}s;"></div>`;
  }
  host.innerHTML = html;
}

/* One event at a time, several seconds apart: a book easing out of a shelf,
   or a lantern guttering. Each is a single element that animates once and
   removes itself, so nothing accumulates. */
let eventTimer = null;
function scheduleEvent() {
  clearTimeout(eventTimer);
  eventTimer = setTimeout(fireEvent, 7000 + Math.random() * 9000);
}
function fireEvent() {
  if (document.hidden) return scheduleEvent();
  const host = document.getElementById("events");
  if (!host || typeof CORRIDOR === "undefined") return scheduleEvent();
  const r = plateRect();

  if (Math.random() < 0.6) {
    // a book nudges out of a shelf somewhere along a wall
    const left = Math.random() < 0.5;
    const px = left ? rand(6, 26) : rand(74, 94);
    const py = rand(30, 72);
    const h = rand(0.9, 1.7) / 100 * r.h;
    const el = document.createElement("div");
    el.className = "nudge-book";
    el.style.left = `${(r.x + px / 100 * r.w).toFixed(0)}px`;
    el.style.top = `${(r.y + py / 100 * r.h).toFixed(0)}px`;
    el.style.width = `${(h * 0.34).toFixed(0)}px`;
    el.style.height = `${h.toFixed(0)}px`;
    el.style.setProperty("--nx", `${(left ? 1 : -1) * rand(5, 11)}px`);
    host.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  } else {
    // a lantern gutters
    const lamps = lampsNow().lamps.filter(t => t.w > 0.5);
    const l = lamps[Math.floor(Math.random() * lamps.length)];
    if (l) {
      const size = Math.max(56, l.w / 100 * r.w * 4);
      const el = document.createElement("div");
      el.className = "gutter";
      el.style.width = el.style.height = `${size.toFixed(0)}px`;
      el.style.left = `${(r.x + l.x / 100 * r.w - size / 2).toFixed(0)}px`;
      el.style.top = `${(r.y + l.y / 100 * r.h - size / 2).toFixed(0)}px`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 1800);
    }
  }
  scheduleEvent();
}

/* ══════════ the Read shelf ══════════ */
/* The zone is measured at bake time as four points on screen (% of the plate).
   Here they become a clip-path in pixels, so the hotspot and its hover glow
   are exactly those four blocks at any window size. */
function placeReadZone() {
  const el = document.getElementById("readZone");
  const label = document.getElementById("readLabel");
  const data = lampsNow();
  if (!data.readZone || !el) return;
  const r = plateRect();
  const project = z => ["tl", "tr", "br", "bl"].map(k => [r.x + z[k][0] / 100 * r.w, r.y + z[k][1] / 100 * r.h]);
  // the normal shelf, unless this screen's crop has cut it off - then the
  // phone shelf further down the hall, which stays in view
  let pts = project(data.readZone);
  const midX = pts.reduce((a, p) => a + p[0], 0) / 4;
  if (midX > window.innerWidth * 0.97 && data.readZoneNarrow) pts = project(data.readZoneNarrow);
  el.style.clipPath = `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(", ")})`;
  const cx = pts.reduce((a, p) => a + p[0], 0) / 4;
  const cy = Math.min(pts.reduce((a, p) => a + p[1], 0) / 4, window.innerHeight * 0.92);
  el.style.setProperty("--zx", `${cx.toFixed(0)}px`);
  el.style.setProperty("--zy", `${cy.toFixed(0)}px`);
  // the label floats just above the zone's top edge
  const top = Math.min(pts[0][1], pts[1][1]);
  label.style.left = `${((pts[0][0] + pts[1][0]) / 2).toFixed(0)}px`;
  label.style.top = `${(top - 8).toFixed(0)}px`;
}

/* ══════════ magic on the enchanting table ══════════ */
/* Pale-cyan motes lifting off the table and fading. A dozen elements, each
   on a long loop, so only a few are ever visible at once. */
function buildSparks() {
  const host = document.getElementById("enchSparks");
  if (!host) return;
  let html = "";
  for (let i = 0; i < 12; i++) {
    html += `<i style="
      --sx:${rand(-58, 58).toFixed(0)}px; --sd:${rand(3.2, 5.6).toFixed(1)}s;
      --sdelay:-${rand(0, 5.6).toFixed(1)}s; --sdrift:${rand(-14, 14).toFixed(0)}px;
      --ss:${rand(2, 4).toFixed(0)}px"></i>`;
  }
  host.innerHTML = html;
}

/* ══════════ meteors ══════════ */
/* A streak across the sky through the glass every so often. Only when the sky
   is dark enough to show one: none at all in the morning or afternoon. */
const METEOR_HOURS = { night: [5000, 11000], dusk: [9000, 18000], dawn: [11000, 20000] };
let meteorTimer = null;
function scheduleMeteor() {
  clearTimeout(meteorTimer);
  const span = METEOR_HOURS[HOUR];
  if (!span) { meteorTimer = setTimeout(scheduleMeteor, 60000); return; }
  meteorTimer = setTimeout(fireMeteor, span[0] + Math.random() * (span[1] - span[0]));
}
function fireMeteor() {
  const host = document.getElementById("meteors");
  if (!host || document.hidden || !METEOR_HOURS[HOUR]) return scheduleMeteor();
  const r = plateRect();
  // the visible sky is the ceiling's middle strip, above the lanterns
  const x = r.x + (38 + Math.random() * 24) / 100 * r.w;
  const y = r.y + (1 + Math.random() * 9) / 100 * r.h;
  const m = document.createElement("div");
  m.className = "meteor";
  const dir = Math.random() < .5 ? -1 : 1;
  m.style.left = `${x.toFixed(0)}px`;
  m.style.top = `${y.toFixed(0)}px`;
  m.style.setProperty("--mx", `${(dir * (90 + Math.random() * 110)).toFixed(0)}px`);
  m.style.setProperty("--my", `${(40 + Math.random() * 50).toFixed(0)}px`);
  m.style.setProperty("--ma", `${(dir < 0 ? 180 : 0) + 24}deg`);
  host.appendChild(m);
  setTimeout(() => m.remove(), 1100);
  scheduleMeteor();
}

/* ══════════ falling books ══════════ */
const LAP = 15;
function coprimeStride(n) {
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  for (const k of [5, 7, 4, 3, 2]) if (gcd(k, n) === 1) return k;
  return 1;
}
function fallPool() {
  const t = LIBRARY.filter(x => x.status === "toread");
  return t.length ? t : LIBRARY;
}
let queue = [], queuePos = 0;
function nextInQueue(books) {
  if (queuePos >= queue.length) {
    queue = books.slice();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    queuePos = 0;
  }
  return queue[queuePos++];
}
function dressSlot(el, item, slot, slots) {
  // jitter kept inside the lane, and the sway below kept small, so
  // neighbouring lanes can no longer drift into each other
  const band = (slot + 0.12 + Math.random() * 0.22) * (90 / slots) + 3;
  el.dataset.id = item.id;
  el.title = `${item.title} — ${item.author}`;
  el.setAttribute("aria-label", `${item.title} by ${item.author}`);
  el.style.setProperty("--x", `${band.toFixed(1)}%`);
  el.style.setProperty("--w", "118px");
  el.style.setProperty("--sway", `${rand(-12, 12).toFixed(0)}px`);
  // Kept small on purpose. At up to 8 degrees a tilted book read as a
  // BIGGER book than its neighbours, though every box is 118 x 171.
  el.style.setProperty("--r0", `${rand(-2, 2).toFixed(1)}deg`);
  el.style.setProperty("--r1", `${rand(-3, 3).toFixed(1)}deg`);
  el.innerHTML = bookMarkup(item);
}
function buildFalling() {
  const host = document.getElementById("fallMid");
  if (!host) return;
  const books = fallPool();
  if (!books.length) { host.innerHTML = ""; return; }
  // 118px books in 11 lanes left no gap at all; 9 leaves ~26px between them
  const slots = Math.min(books.length, window.innerWidth < 860 ? 5 : 9);
  const stride = coprimeStride(slots);
  queue = []; queuePos = 0;
  host.innerHTML = "";
  for (let i = 0; i < slots; i++) {
    const el = document.createElement("div");
    el.className = "fall-book";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.dataset.slot = i;
    el.style.setProperty("--dur", `${LAP}s`);
    el.style.setProperty("--delay", `-${(((i * stride) % slots) / slots * LAP).toFixed(2)}s`);
    dressSlot(el, nextInQueue(books), i, slots);
    host.appendChild(el);
  }
}
document.getElementById("fallMid").addEventListener("animationiteration", e => {
  if (e.animationName !== "descend") return;
  const el = e.target.closest(".fall-book");
  if (!el || el.matches(":hover, :focus, .caught")) return;
  dressSlot(el, nextInQueue(fallPool()), +el.dataset.slot, el.parentElement.children.length);
});

/* ══════════ the enchanting table ══════════ */
function renderEnch() {
  const host = document.getElementById("enchBook");
  const cap = document.getElementById("enchCaption");
  if (!host) return;
  const book = Core.heldBook();
  if (!book) {
    host.innerHTML = "";
    if (cap) cap.innerHTML = `<div class="ench-title">nothing open</div>`;
    return;
  }
  host.dataset.id = book.id;
  // a solid book: the cover on the front, then back board, spine and pages
  host.innerHTML = `<div class="solid">
      <div class="face front book-cover">${coverMarkup(book, false)}</div>
      <div class="face back"></div>
      <div class="face spine"></div>
      <div class="face fore"></div>
      <div class="face top"></div>
      <div class="face bottom"></div>
    </div>`;
  if (cap) {
    cap.innerHTML = `<div class="ench-title">${esc(book.title)}</div>
                     <div class="ench-author">${esc(book.author)}</div>`;
  }
}

/* ══════════ the flight to the centre ══════════ */
/* Whatever book you click - falling, on a shelf, on the enchanting table -
   lifts off and flies to the centre, and on close flies back to where it came
   from. FLIP: measure where it is and where it ends up, jump the detail cover
   to the start, then let the compositor animate it home. Transform and opacity
   only, so it stays smooth however busy the room is. */
const FLY_IN = 290, FLY_OUT = 250;
const EASE_IN  = "cubic-bezier(.16,.9,.24,1)";     // quick lift, soft landing
const EASE_OUT = "cubic-bezier(.5,0,.2,1)";
let flight = null;

function flipBetween(from, to) {
  return {
    dx: (from.left + from.width / 2) - (to.left + to.width / 2),
    dy: (from.top + from.height / 2) - (to.top + to.height / 2),
    s:  from.width / to.width,
  };
}

Core.setAfterOpen((item, src) => {
  const mount = document.querySelector("#modal .cover-mount");
  const scrim = document.querySelector("#modal .spread-scrim");
  if (!mount || !src || !document.body.contains(src)) { flight = null; return; }
  const target = src.querySelector(".book-cover") || src;
  const from = target.getBoundingClientRect();
  if (!from.width) { flight = null; return; }

  const isFall = src.classList.contains("fall-book");
  // a falling book must not keep falling out from under you while you read
  if (isFall) src.classList.add("caught");
  src.classList.add("lifted");
  flight = { src, isFall };

  // the detail cover takes the clicked cover's own shape, so it never morphs
  const cov = mount.querySelector(".book-cover");
  if (cov) cov.style.setProperty("--cover-ar", `${from.width} / ${from.height}`);
  // a fill-forwards animation left over from the last close would override
  // this one for a frame - that was the black flash
  mount.getAnimations().forEach(a => a.cancel());

  const to = mount.getBoundingClientRect();
  const f = flipBetween(from, to);
  mount.animate(
    [{ transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.s})` },
     { transform: "none" }],
    { duration: FLY_IN, easing: EASE_IN });

  const close = document.querySelector("#modal .spread-close");
  close && close.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: 160, delay: FLY_IN * .6, fill: "backwards" });
});

Core.setBeforeClose(() => new Promise(resolve => {
  const spread = document.getElementById("modal");
  const mount = spread.querySelector(".cover-mount");
  const scrim = spread.querySelector(".spread-scrim");
  // the info sheet slides back into the book while the book flies home
  spread.classList.remove("open");
  if (!flight || !mount || !document.body.contains(flight.src)) {
    if (flight) flight.src.classList.remove("lifted", "caught");
    flight = null; return resolve();
  }
  const { src, isFall } = flight;
  const target = src.querySelector(".book-cover") || src;
  const home = target.getBoundingClientRect();
  const f = flipBetween(home, mount.getBoundingClientRect());
  const a = mount.animate(
    [{ transform: "none" },
     { transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.s})` }],
    { duration: FLY_OUT, easing: EASE_OUT, fill: "forwards" });

  a.onfinish = () => {
    a.cancel();                     // never leave a filled animation behind
    src.classList.remove("lifted");
    // back where you caught it; hold a beat, then carry on falling
    if (isFall) setTimeout(() => src.classList.remove("caught"), 260);
    flight = null;
    resolve();
  };
}));

/* ══════════ the To Read scroll ══════════ */
/* scroll_vector.png, recovered as its native 53 x 53 pixel map ('#' outline,
   'o' paper). A panel is far wider than that drawing, so rather than stretch
   it, the scroll is REDRAWN at the panel's size from the same parts: the top
   curl and the roll's spiral end are lifted pixel-for-pixel from the art; the
   wavy side edges are the art's own edge profile, resampled to the new
   height; the roll's plain middle is extended to the new width. Every art
   pixel stays square at --px screen pixels. */
const SCROLL_ART = [
  "........###########################################..",
  ".......##oooooooooooooooooooooooooooooooooooo##oooo#.",
  ".......#oooooooooooooooooooooooooooooooooooo##ooooo##",
  "......#oooooooooooooooooooooooooooooooooooo##oo####o#",
  "......#oooooooooooooooooooooooooooooooooooo#oo###o#o#",
  "......#oooooooooooooooooooooooooooooooooooo#o###oo#o#",
  "......#ooooooooooooooooooooooooooooooooooo##o#o####o#",
  "......#ooooooooooooooooooooooooooooooooooo#oo#ooooo##",
  "......#ooooooooooooooooooooooooooooooooooo#oo##ooo##.",
  "......#ooooooooooooooooooooooooooooooooooo#########..",
  "......#oooooooooooooooooooooooooooooooooo##...####...",
  "......#oooooooooooooooooooooooooooooooooo#...........",
  "......#oooooooooooooooooooooooooooooooooo#...........",
  "......#ooooooooooooooooooooooooooooooooooo#..........",
  "......##oooooooooooooooooooooooooooooooooo#..........",
  ".......#oooooooooooooooooooooooooooooooooo#..........",
  ".......#oooooooooooooooooooooooooooooooooo#..........",
  ".......##ooooooooooooooooooooooooooooooooo#..........",
  "........#ooooooooooooooooooooooooooooooooo##.........",
  "........#oooooooooooooooooooooooooooooooooo#.........",
  "........#oooooooooooooooooooooooooooooooooo#.........",
  "........##ooooooooooooooooooooooooooooooooo#.........",
  ".........#ooooooooooooooooooooooooooooooooo##........",
  ".........#oooooooooooooooooooooooooooooooooo#........",
  ".........#oooooooooooooooooooooooooooooooooo#........",
  ".........#oooooooooooooooooooooooooooooooooo#........",
  "..........#ooooooooooooooooooooooooooooooooo.#.......",
  "..........#oooooooooooooooooooooooooooooooooo#.......",
  "..........#oooooooooooooooooooooooooooooooooo#.......",
  "..........#oooooooooooooooooooooooooooooooooo#.......",
  "..........#oooooooooooooooooooooooooooooooooo.#......",
  "..........#ooooooooooooooooooooooooooooooooooo#......",
  "..........#ooooooooooooooooooooooooooooooooooo#......",
  "..........#ooooooooooooooooooooooooooooooooooo#......",
  "..........#ooooooooooooooooooooooooooooooooooo#......",
  ".........##ooooooooooooooooooooooooooooooooooo#......",
  ".........#oooooooooooooooooooooooooooooooooooo#......",
  ".........#oooooooooooooooooooooooooooooooooooo#......",
  "........##oooooooooooooooooooooooooooooooooooo#......",
  "........#ooooooooooooooooooooooooooooooooooooo#......",
  "........#ooooooooooooooooooooooooooooooooooooo#......",
  ".......##ooooooooooooooooooooooooooooooooooooo#......",
  "..#######################################ooooo#......",
  ".##ooooooooooooooooooooooooooooooooooo####oooo#......",
  ".#ooooooooooooooooooooooooooooooooooo##oo##oo##......",
  ".#ooooooooooooooooooooooooooooooooooo#oooo##o#.......",
  "##ooooooooooooooooooooooooooooooooooo#o##o##o#.......",
  "#ooooooooooooooooooooooooooooooooooo##o##o##o#.......",
  "#ooooooooooooooooooooooooooooooooooo#oo#o##o##.......",
  "#ooooooooooooooooooooooooooooooooooo#oo###o##........",
  "##oooooooooooooooooooooooooooooooooo#ooooo##.........",
  ".######################################o###..........",
  ".....................................####............"
];

const ART_N = 53, ROLL_ROWS = 12, CURL_W = 13, CURL_H = 11;
const INK = "#000000", PAPER = "#FFD6B8";

function scrollMap(w, h) {
  const A = SCROLL_ART, m = Array.from({ length: h }, () => new Array(w).fill("."));
  const put = (x, y, c) => { if (x >= 0 && x < w && y >= 0 && y < h && c !== ".") m[y][x] = c; };
  // the art's own left and right edge, for each body row (1 .. 40)
  const edgeL = [], edgeR = [];
  for (let y = 1; y < ART_N - ROLL_ROWS; y++) {
    edgeL.push(A[y].indexOf("#"));
    edgeR.push(A[y].lastIndexOf("#") - ART_N);          // measured from the right
  }
  const bodyRows = h - ROLL_ROWS - 1;
  let prevL = null, prevR = null;
  for (let y = 1; y <= bodyRows; y++) {
    const k = Math.min(edgeL.length - 1, Math.floor((y - 1) * edgeL.length / bodyRows));
    const L = edgeL[k], R = w + edgeR[k];
    for (let x = L + 1; x < R; x++) put(x, y, "o");
    put(L, y, "#"); put(R, y, "#");
    // where an edge steps sideways, bridge it so the outline stays unbroken
    if (prevL !== null && prevL !== L) for (let x = Math.min(L, prevL); x <= Math.max(L, prevL); x++) put(x, y, "#");
    if (prevR !== null && prevR !== R) for (let x = Math.min(R, prevR); x <= Math.max(R, prevR); x++) put(x, y, "#");
    prevL = L; prevR = R;
  }
  for (let x = edgeL[0] + 1; x < w - CURL_W; x++) put(x, 0, "#");            // the top edge
  // the curl, lifted whole from the art's top-right corner
  for (let y = 0; y < CURL_H; y++)
    for (let x = 0; x < CURL_W; x++) {
      const c = A[y][ART_N - CURL_W + x];
      if (c !== ".") m[y][w - CURL_W + x] = c;
    }
  // the roll: art's left cap, a stretch of its plain middle, art's right end
  const R0 = ART_N - ROLL_ROWS, LEFT = 10, RIGHT = 23;
  for (let y = 0; y < ROLL_ROWS; y++) {
    const row = A[R0 + y], ty = h - ROLL_ROWS + y;
    for (let x = 0; x < LEFT; x++) put(x, ty, row[x]);
    for (let x = LEFT; x < w - RIGHT; x++) put(x, ty, row[20]);
    for (let x = 0; x < RIGHT; x++) {
      const c = row[ART_N - RIGHT + x];
      if (c !== ".") m[ty][w - RIGHT + x] = c;
      else if (m[ty][w - RIGHT + x] !== ".") m[ty][w - RIGHT + x] = ".";   // the art's own gaps
    }
  }
  return m;
}

/* Draw the map straight onto a canvas that sits ON the page. The first
   version turned the canvas into an image (toDataURL) and used that as a
   background - and Firefox's anti-fingerprinting protection deliberately
   scrambles canvas pixels whenever a page reads them back, which is the
   coloured noise you saw. A canvas that is only drawn and displayed is never
   read, so the protection has nothing to scramble. */
function drawMap(canvas, m, y0 = 0, y1 = m.length) {
  const w = m[0].length, h = y1 - y0;
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = m[y0 + y][x];
    if (v === ".") continue;
    g.fillStyle = v === "#" ? INK : PAPER;
    g.fillRect(x, y, 1, 1);
  }
}
function canvasIn(host, cls) {
  let c = host.querySelector(":scope > canvas." + cls);
  if (!c) { c = document.createElement("canvas"); c.className = cls; host.prepend(c); }
  return c;
}

let scrollKey = "";
function layoutScroll() {
  const card = document.querySelector("#panel .panel-card");
  const roll = document.querySelector("#panel .scroll-roll");
  if (!card || !roll) return;
  // phones get nearly the full width, or two books will not fit on a shelf
  const availW = window.innerWidth * (window.innerWidth < 700 ? .98 : .9);
  const availH = window.innerHeight * .88;
  const px = Math.max(3, Math.min(9, Math.floor(Math.min(availW / 124, availH / 76))));
  const w = Math.floor(availW / px), h = Math.floor(availH / px);
  const left = Math.round((window.innerWidth - w * px) / 2);
  const top = Math.round((window.innerHeight - h * px) / 2);
  // redraw only when the size actually changed
  const key = `${w}x${h}`;
  if (key !== scrollKey) {
    const m = scrollMap(w, h);
    drawMap(canvasIn(card, "scroll-canvas"), m);
    drawMap(canvasIn(roll, "scroll-canvas"), m, h - ROLL_ROWS, h);
    scrollKey = key;
  }
  Object.assign(card.style, { left: left + "px", top: top + "px", right: "auto", bottom: "auto",
                              width: w * px + "px", height: h * px + "px" });
  card.style.setProperty("--px", px + "px");
  Object.assign(roll.style, { left: left + "px", top: top + "px",
                              width: w * px + "px", height: ROLL_ROWS * px + "px" });
  roll.style.setProperty("--travel", (h - ROLL_ROWS) * px + "px");
}
function clearScrollLayout() {
  const card = document.querySelector("#panel .panel-card");
  if (!card) return;
  ["left", "top", "right", "bottom", "width", "height"].forEach(k => card.style[k] = "");
}
window.addEventListener("resize", () => {
  if (!document.getElementById("panel").hidden &&
      document.getElementById("panel").dataset.shelf === "toread") layoutScroll();
});

/* ══════════ the two shelves ══════════ */
let closing = false;

function originFrom(el) {
  const card = document.querySelector(".panel-card");
  if (!card || !el) return;
  const r = el.getBoundingClientRect();
  card.style.setProperty("--origin-x", `${((r.left + r.width / 2) / window.innerWidth * 100).toFixed(1)}%`);
  card.style.setProperty("--origin-y", `${((r.top + r.height / 2) / window.innerHeight * 100).toFixed(1)}%`);
}

function openShelf(status, fromEl) {
  const panel = document.getElementById("panel");
  panel.classList.remove("closing");
  closing = false;
  originFrom(fromEl);
  if (status === "toread") {
    document.getElementById("scrollTrigger").classList.add("spent");
    document.getElementById("panel").dataset.shelf = "toread";   // before layout, so the CSS applies
    layoutScroll();
  } else clearScrollLayout();
  // Core renders the books BEFORE it records which shelf is open, so the
  // layout hook would otherwise see the previous shelf's name
  document.getElementById("panel").dataset.shelf = status;
  Core.openPanel(status);
  relayoutShelf();
}

function closeShelf() {
  const panel = document.getElementById("panel");
  if (panel.hidden || closing) return;
  closing = true;
  panel.classList.add("closing");
  setTimeout(() => {
    panel.classList.remove("closing");
    closing = false;
    Core.closePanel();
    document.getElementById("scrollTrigger").classList.remove("spent");
  }, 150);
}

document.addEventListener("click", e => {
  const scroll = e.target.closest("#scrollTrigger");
  if (scroll) { e.stopPropagation(); openShelf("toread", scroll); return; }

  // the panel opens out of the shelf itself, so its origin is the label
  // sitting on the zone rather than the full-screen hotspot element
  if (e.target.closest("#readZone")) {
    e.stopPropagation(); openShelf("read", document.getElementById("readLabel")); return;
  }

  // the BOOK opens its details; the TABLE under it steps to the next one
  const book = e.target.closest("#enchBook");
  if (book) {
    e.stopPropagation();
    const item = LIBRARY.find(x => x.id === book.dataset.id);
    if (item) Core.openModal(item);
    return;
  }
  const table = e.target.closest("#enchTable");
  if (table) { e.stopPropagation(); Core.cycleHeld(); renderEnch(); return; }

  if (e.target.closest("#panelClose") || e.target.closest("#panelBackdrop")) {
    e.stopPropagation();
    closeShelf();
  }
}, true);

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const modal = document.getElementById("modal");
  if (modal && !modal.hidden) return;
  const panel = document.getElementById("panel");
  if (!panel.hidden) { e.stopPropagation(); closeShelf(); }
}, true);

function rebuild() {
  buildFalling();
  renderEnch();
  placeReadZone();
  Wizard.reflow();
  const rc = document.getElementById("readCount");
  if (rc) rc.textContent = LIBRARY.filter(x => x.status === "read").length;
  projectGlows();
  buildDust();
  const host = document.getElementById("panelCollection");
  if (host && !document.getElementById("panel").hidden) relayoutShelf();
}

showPlate(HOUR, false);
(() => {
  const c = document.getElementById("trigCanvas");
  if (!c) return;
  const m = SCROLL_ART.map(r => r.split(""));
  drawMap(c, m);
})();
buildSparks();
rebuild();
Wizard.init();
scheduleEvent();
scheduleMeteor();
Core.boot({ onRebuild: rebuild });
