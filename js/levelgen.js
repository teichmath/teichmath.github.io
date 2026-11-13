/**
 * levelgen.js — Puzzle Master level generator.
 *
 * Finds actor positions + one connected region per movie whose score meets
 * the pass threshold, by simulated annealing over actor positions. Each
 * movie's region is routed as a cheapest Steiner tree connecting its actors:
 *   member actor square  cost 0   (the point we want)
 *   other actor square   cost 1   (−1 point)
 *   empty square         cost 0.5 per other color already there, + a small
 *                        step cost so regions stay compact
 * An actor whose connection would cost a point or more (more than covering
 * them earns) is left out of that movie's region, as a player might.
 *
 * Pure functions, no DOM: runs in the page, a Worker, or a test shell.
 * Scoring rules match ActorGame.score().
 */

const COLS = 10;
const GRID = COLS * COLS;

const NBR = Array.from({ length: GRID }, (_, i) => {
  const r = Math.floor(i / COLS), c = i % COLS, out = [];
  if (r > 0)        out.push(i - COLS);
  if (r < COLS - 1) out.push(i + COLS);
  if (c > 0)        out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  return out;
});

const STEP_COST = 0.02;

// Small seedable PRNG (mulberry32) so a level can be reproduced.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Layout state ──────────────────────────────────────────────────────────────
// member[a][m] ∈ {0,1}; at[cell] = actor index or -1;
// regions[m] = Uint8Array(GRID) flags; cover[cell] = # regions on an empty cell.

function scoreOf(member, at, regions, cover) {
  let s = 0;
  for (let c = 0; c < GRID; c++) {
    const a = at[c];
    if (a >= 0) {
      const row = member[a];
      for (let m = 0; m < regions.length; m++) if (regions[m][c]) s += row[m] ? 1 : -1;
    } else if (cover[c] > 1) {
      s -= 0.5 * (cover[c] - 1);
    }
  }
  return s;
}

function rebuildCover(at, regions, cover) {
  cover.fill(0);
  for (const reg of regions) {
    for (let c = 0; c < GRID; c++) if (reg[c] && at[c] < 0) cover[c]++;
  }
}

function addCover(reg, at, cover, d) {
  for (let c = 0; c < GRID; c++) if (reg[c] && at[c] < 0) cover[c] += d;
}

// Binary min-heap of (dist, cell) for Dijkstra on a 100-cell grid.
class Heap {
  constructor() { this.d = new Float64Array(GRID * 4); this.c = new Int16Array(GRID * 4); this.n = 0; }
  clear() { this.n = 0; }
  push(d, c) {
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p] <= d) break;
      this.d[i] = this.d[p]; this.c[i] = this.c[p]; i = p;
    }
    this.d[i] = d; this.c[i] = c;
  }
  pop() {   // returns cell; distance left in this.topD
    const c0 = this.c[0]; this.topD = this.d[0];
    const d = this.d[--this.n], c = this.c[this.n];
    let i = 0;
    for (;;) {
      let k = 2 * i + 1;
      if (k >= this.n) break;
      if (k + 1 < this.n && this.d[k + 1] < this.d[k]) k++;
      if (this.d[k] >= d) break;
      this.d[i] = this.d[k]; this.c[i] = this.c[k]; i = k;
    }
    this.d[i] = d; this.c[i] = c;
    return c0;
  }
}

const heap = new Heap();
const dist = new Float64Array(GRID);
const prev = new Int16Array(GRID);
const costTab = new Float64Array(GRID);
const pointTab = new Float64Array(GRID);   // score lost by adding a cell to the region
const isLeft = new Uint8Array(GRID);

// Route movie m as a Steiner tree into reg (cleared first), given cover from
// the other regions.
function routeMovie(m, member, at, cover, reg, rng, jitter) {
  reg.fill(0);
  const terms = [];
  for (let c = 0; c < GRID; c++) if (at[c] >= 0 && member[at[c]][m]) terms.push(c);
  if (!terms.length) return;

  for (let c = 0; c < GRID; c++) {
    const a = at[c];
    pointTab[c] = a >= 0 ? (member[a][m] ? 0 : 1) : 0.5 * cover[c];
    costTab[c]  = a >= 0 ? pointTab[c] : pointTab[c] + STEP_COST + (jitter ? rng() * jitter : 0);
  }

  const first = terms[Math.floor(rng() * terms.length)];
  reg[first] = 1;
  isLeft.fill(0);
  let left = 0;
  for (const t of terms) if (t !== first) { isLeft[t] = 1; left++; }

  while (left > 0) {
    dist.fill(Infinity);
    heap.clear();
    for (let c = 0; c < GRID; c++) if (reg[c]) { dist[c] = 0; heap.push(0, c); }
    let hit = -1;
    while (heap.n) {
      const x = heap.pop(), d = heap.topD;
      if (d > dist[x]) continue;
      if (isLeft[x]) { hit = x; break; }
      for (const y of NBR[x]) {
        const nd = d + costTab[y];
        if (nd < dist[y]) { dist[y] = nd; prev[y] = x; heap.push(nd, y); }
      }
    }
    if (hit < 0) break;
    // Leave this actor out if connecting them costs at least the point they'd earn.
    let lost = 0;
    for (let x = prev[hit]; !reg[x]; x = prev[x]) lost += pointTab[x];
    if (lost >= 1) { isLeft[hit] = 0; left--; continue; }
    for (let x = hit; !reg[x]; x = prev[x]) {
      reg[x] = 1;
      if (isLeft[x]) { isLeft[x] = 0; left--; }
    }
  }
}

// Rip up and re-route the given movies (in random order).
function reroute(ms, member, at, regions, cover, rng, jitter) {
  for (const m of ms) { addCover(regions[m], at, cover, -1); regions[m].fill(0); }
  const order = ms.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const m of order) {
    routeMovie(m, member, at, cover, regions[m], rng, jitter);
    addCover(regions[m], at, cover, 1);
  }
}

/**
 * Search for a passing layout.
 *   member: number[nActors][nMovies] of 0/1 (ActorGame actor.activeBits)
 *   goal:   pass threshold (ActorGame.minGoal())
 * Options: maxSteps, stepsPerRestart, t0, t1, rng,
 *   positions: fixed actor positions (cell per actor) — only regions are searched.
 *   start:     starting actor positions; actors may move, but each actor away
 *              from its start square costs movePenalty points in the search,
 *              and no more than maxMoved actors may be away at once.
 * Returns { ok, steps, positions (cell per actor), regions (cell lists per movie), score, moved }.
 */
export function generateLayout(member, goal, opts = {}) {
  const {
    maxSteps = 100000, stepsPerRestart = 10000,
    t0 = 1.5, t1 = 0.05, rng = Math.random, positions = null,
    start = null, movePenalty = 1, maxMoved = Infinity,
  } = opts;
  const fixedStart = positions || start;
  const penalty = start ? movePenalty : 0;
  const n = member.length, nm = n ? member[0].length : 0;
  const moviesOf = member.map(row => row.flatMap((b, m) => (b ? [m] : [])));

  const at = new Int16Array(GRID);
  const cover = new Int16Array(GRID);
  const regions = Array.from({ length: nm }, () => new Uint8Array(GRID));
  const saved = Array.from({ length: nm }, () => new Uint8Array(GRID));
  const allMovies = Array.from({ length: nm }, (_, m) => m);
  const posOf = new Int16Array(n);   // actor -> cell, refreshed before repair moves

  // Actors away from their start square
  const moved = () => {
    if (!start) return 0;
    let d = 0;
    for (let c = 0; c < GRID; c++) if (at[c] >= 0 && start[at[c]] !== c) d++;
    return d;
  };
  const passes = () => s >= goal && d <= maxMoved;

  let steps = 0, s = 0, d = 0;
  while (steps < maxSteps) {
    // Fresh start: given positions, or random
    at.fill(-1);
    if (fixedStart) {
      fixedStart.forEach((c, a) => { at[c] = a; });
    } else {
      const cells = Array.from({ length: GRID }, (_, i) => i);
      for (let a = 0; a < n; a++) {
        const j = a + Math.floor(rng() * (GRID - a));
        [cells[a], cells[j]] = [cells[j], cells[a]];
        at[cells[a]] = a;
      }
    }
    for (const reg of regions) reg.fill(0);
    cover.fill(0);
    reroute(allMovies, member, at, regions, cover, rng, 0);
    s = scoreOf(member, at, regions, cover);
    d = moved();

    for (let step = 0; step < stepsPerRestart && steps < maxSteps; step++) {
      if (passes()) return finish();
      steps++;
      const T = t0 * Math.pow(t1 / t0, step / stepsPerRestart);

      let touched, src = -1, dst = -1;
      if (!positions && rng() < 0.6) {
        if (start) {
          // Repair: when the move allowance is used up, only move actors already
          // away from home; sometimes send one straight back home.
          for (let c = 0; c < GRID; c++) if (at[c] >= 0) posOf[at[c]] = c;
          const away = [];
          for (let a = 0; a < n; a++) if (posOf[a] !== start[a]) away.push(a);
          const pool = d >= maxMoved ? away : null;
          if (pool && !pool.length) continue;
          const a = pool ? pool[Math.floor(rng() * pool.length)] : Math.floor(rng() * n);
          src = posOf[a];
          dst = src !== start[a] && rng() < 0.3 ? start[a] : Math.floor(rng() * GRID);
        } else {
          // Relocate an actor (swap if the destination is occupied)
          do { src = Math.floor(rng() * GRID); } while (at[src] < 0);
          dst = Math.floor(rng() * GRID);
        }
        if (src === dst) continue;
        const a = at[src], b = at[dst];
        const set = new Set(moviesOf[a]);
        if (b >= 0) for (const m of moviesOf[b]) set.add(m);
        for (let m = 0; m < nm; m++) if (regions[m][src] || regions[m][dst]) set.add(m);
        touched = [...set];
        for (const m of touched) saved[m].set(regions[m]);
        at[src] = b; at[dst] = a;
        if (start && moved() > maxMoved) { at[src] = a; at[dst] = b; continue; }
        rebuildCover(at, regions, cover);
        reroute(touched, member, at, regions, cover, rng, 0);
      } else {
        // Re-route one movie with noise, to escape local optima
        touched = [Math.floor(rng() * nm)];
        saved[touched[0]].set(regions[touched[0]]);
        reroute(touched, member, at, regions, cover, rng, 0.3);
      }

      const s2 = scoreOf(member, at, regions, cover);
      const d2 = src >= 0 ? moved() : d;
      const gain = (s2 - penalty * d2) - (s - penalty * d);
      if (gain >= 0 || rng() < Math.exp(gain / T)) {
        s = s2; d = d2;
      } else {
        if (src >= 0) { const t = at[src]; at[src] = at[dst]; at[dst] = t; }
        for (const m of touched) regions[m].set(saved[m]);
        rebuildCover(at, regions, cover);
      }
    }
    if (passes()) return finish();
  }
  return { ok: false, steps };

  function finish() {
    const positions = new Array(n);
    for (let c = 0; c < GRID; c++) if (at[c] >= 0) positions[at[c]] = c;
    return {
      ok: true, steps, score: s, positions, moved: d,
      regions: regions.map(reg => { const l = []; for (let c = 0; c < GRID; c++) if (reg[c]) l.push(c); return l; }),
    };
  }
}

/**
 * Repair a dealt board: find a passing layout that moves as few actors as
 * possible from `start` (at most maxMoved). After a success with d moves,
 * retries with d-1 until that fails. Returns the best generateLayout result
 * (with .moved), or { ok: false }.
 */
export function repairBoard(member, goal, start, maxMoved, opts = {}) {
  let best = { ok: false };
  for (let cap = maxMoved; cap >= 0; cap--) {
    const res = generateLayout(member, goal, { movePenalty: 0.5, ...opts, start, maxMoved: cap });
    if (!res.ok) break;
    best = res;
    cap = res.moved;   // loop decrement tries one fewer
  }
  return best;
}
