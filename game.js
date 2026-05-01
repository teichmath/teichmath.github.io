/**
 * game.js (v3)
 *
 * Key changes from v2:
 *  - cell.colors = Set<groupId>  (was Set<localMovieIdx>)
 *  - Groups: Map<groupId, {movieIndices[], color}>
 *  - No adjacency check when painting; any square can be painted freely,
 *    but only the connected component containing the anchor cell survives.
 *  - Toggle-off still enforces connectivity (keeps component with most actors).
 *  - Level system: start with 3 actors; pass at score >= maxScore - 0.5.
 *  - advanceLevel(): add actor via chain, clear grid, re-place all, re-init groups.
 *  - mergeGroups(gids[]) / unmergeGroup(gid).
 *  - Displayed movies: only those with >= 2 active actors (from v2).
 *  - Scoring: merged group on actor cell = sum(+1/-1 per movie in group);
 *             empty cell penalty: -0.5 per group beyond the first.
 */

const GRID = 100;
const COLS = 10;

// ── Color generation ──────────────────────────────────────────────────────────
function genColors(n) {
  const out = [];
  let hue = 17;
  for (let i = 0; i < n; i++) {
    const s = 58 + (i % 3) * 9;
    const l = 46 + (i % 2) * 14;
    out.push(`hsl(${Math.round(hue)},${s}%,${l}%)`);
    hue = (hue + 137.508) % 360;
  }
  return out;
}

// ── Monogram generation ───────────────────────────────────────────────────────
function genMonograms(actors) {
  const mono = {};
  for (let i = 0; i < actors.length; i++) {
    const parts = actors[i].name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1] : '';
    mono[i] = ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase();
  }
  let dirty = true;
  while (dirty) {
    dirty = false;
    const freq = {};
    for (const m of Object.values(mono)) freq[m] = (freq[m] || 0) + 1;
    for (let i = 0; i < actors.length; i++) {
      if (freq[mono[i]] <= 1) continue;
      const base    = mono[i];
      const letters = actors[i].name.toUpperCase().replace(/[^A-Z]/g, '');
      let   ok      = false;
      for (const ch of letters) {
        const cand  = base + ch;
        const clash = Object.entries(mono).some(([j, m]) => Number(j) !== i && m === cand);
        if (!clash) { mono[i] = cand; dirty = true; ok = true; break; }
      }
      if (!ok) { mono[i] = base + (i % 10); dirty = true; }
    }
  }
  return mono;
}

// ── Grid helpers ──────────────────────────────────────────────────────────────
function neighbors(idx) {
  const row = Math.floor(idx / COLS), col = idx % COLS;
  const out = [];
  if (row > 0)        out.push(idx - COLS);
  if (row < COLS - 1) out.push(idx + COLS);
  if (col > 0)        out.push(idx - 1);
  if (col < COLS - 1) out.push(idx + 1);
  return out;
}

function emptyGrid() {
  return Array.from({ length: GRID }, () => ({ actorIdx: null, colors: new Set() }));
}

// ── ActorGame ─────────────────────────────────────────────────────────────────
export class ActorGame {
  constructor(rawData) {
    this.rawActors = rawData.actors;
    this.rawMovies = rawData.movies;

    this.actors = [];   // [{name, rawIdx, bits, activeBits}]
    this.movies = [];   // [{title, rawMovieIdx, color}] — displayed (>=2 actors)
    this.monos  = {};   // localActorIdx -> monogram string

    this.groups       = new Map(); // groupId -> {movieIndices:[], color:string}
    this.movieToGroup = {};        // localMovieIdx -> groupId
    this._nextGroupId = 0;

    this.grid  = emptyGrid();
    this.armed = null;  // groupId | null
    this.level = 1;

    this._start();
  }

  // ── Initialise ───────────────────────────────────────────────────────────────

  _start() {
    this.grid  = emptyGrid();
    this.armed = null;
    this.level = 1;
    this.actors = this._pickConnectedActors(3);
    this._rebuildMovies();
    this._initGroups();
    this._placeActors(this.actors);
  }

  restart() { this._start(); }

  // ── Connected actor selection ─────────────────────────────────────────────────

  _pickConnectedActors(count) {
    const si = Math.floor(Math.random() * this.rawActors.length);
    const chosen    = [{ ...this.rawActors[si], rawIdx: si }];
    const chosenSet = new Set([si]);
    while (chosen.length < count) {
      const next = this._nextConnectedFrom(chosenSet, chosen);
      if (!next) break;
      chosen.push(next); chosenSet.add(next.rawIdx);
    }
    while (chosen.length < count) {
      const pool = this.rawActors.map((a, i) => ({ ...a, rawIdx: i }))
                       .filter(a => !chosenSet.has(a.rawIdx));
      if (!pool.length) break;
      const p = pool[Math.floor(Math.random() * pool.length)];
      chosen.push(p); chosenSet.add(p.rawIdx);
    }
    return chosen;
  }

  _nextConnectedFrom(chosenSet, chosenActors) {
    const mSet = new Set();
    for (const a of chosenActors) a.bits.forEach((b, j) => { if (b) mSet.add(j); });
    const eligible = [...mSet].filter(j =>
      this.rawActors.some((a, i) => !chosenSet.has(i) && a.bits[j])
    );
    if (!eligible.length) return null;
    const j    = eligible[Math.floor(Math.random() * eligible.length)];
    const pool = this.rawActors.map((a, i) => ({ ...a, rawIdx: i }))
                     .filter(a => !chosenSet.has(a.rawIdx) && a.bits[j]);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Movie rebuilding (>=2 actor filter) ──────────────────────────────────────

  _rebuildMovies() {
    const rawSet = new Set();
    for (const a of this.actors) a.bits.forEach((b, j) => { if (b) rawSet.add(j); });
    const cnt = {};
    for (const j of rawSet) cnt[j] = this.actors.reduce((n, a) => n + (a.bits[j] ? 1 : 0), 0);
    const displayed = [...rawSet].filter(j => cnt[j] >= 2);
    const palette   = genColors(Math.max(displayed.length + 10, 50));
    this.movies = displayed.map((rawIdx, i) => ({
      title: this.rawMovies[rawIdx].title, rawMovieIdx: rawIdx,
      color: palette[i % palette.length],
    }));
    for (const a of this.actors) {
      a.activeBits = this.movies.map(m => a.bits[m.rawMovieIdx] || 0);
    }
    this.monos = genMonograms(this.actors);
  }

  // ── Group management ─────────────────────────────────────────────────────────

  _initGroups() {
    this.groups = new Map();
    this.movieToGroup = {};
    this._nextGroupId = 0;
    for (let i = 0; i < this.movies.length; i++) {
      const gid = this._nextGroupId++;
      this.groups.set(gid, { movieIndices: [i], color: this.movies[i].color });
      this.movieToGroup[i] = gid;
    }
  }

  // Merge array of groupIds into one. Returns new gid, or -1 on failure.
  mergeGroups(gids) {
    const valid = gids.filter(g => this.groups.has(g));
    if (valid.length < 2) return -1;

    // Sort by min movieIndex so color goes to the "first" group in the list
    valid.sort((a, b) =>
      Math.min(...this.groups.get(a).movieIndices) -
      Math.min(...this.groups.get(b).movieIndices)
    );

    const color        = this.groups.get(valid[0]).color;
    const allMovieIdxs = valid.flatMap(g => [...this.groups.get(g).movieIndices]);
    const newGid       = this._nextGroupId++;
    const validSet     = new Set(valid);

    this.groups.set(newGid, { movieIndices: allMovieIdxs, color });
    for (const mIdx of allMovieIdxs) this.movieToGroup[mIdx] = newGid;

    // Update grid: replace any old gid with newGid (set deduplicates)
    for (let i = 0; i < GRID; i++) {
      const cell = this.grid[i];
      let had = false;
      for (const g of validSet) { if (cell.colors.has(g)) { cell.colors.delete(g); had = true; } }
      if (had) cell.colors.add(newGid);
    }
    for (const g of validSet) this.groups.delete(g);
    if (this.armed !== null && validSet.has(this.armed)) this.armed = newGid;

    // Merging can create disconnected regions (cells of old groupA and old groupB
    // that were never adjacent). Enforce single-component rule, keeping the
    // component with the most actor squares.
    this._enforceConnectivity(newGid);

    return newGid;
  }

  // Split a merged group back into individual-movie groups. Drops color from all cells.
  unmergeGroup(gid) {
    if (!this.groups.has(gid)) return false;
    const group = this.groups.get(gid);
    if (group.movieIndices.length <= 1) return false;

    for (let i = 0; i < GRID; i++) this.grid[i].colors.delete(gid);

    for (const mIdx of group.movieIndices) {
      const newGid = this._nextGroupId++;
      this.groups.set(newGid, { movieIndices: [mIdx], color: this.movies[mIdx].color });
      this.movieToGroup[mIdx] = newGid;
    }
    this.groups.delete(gid);
    if (this.armed === gid) this.armed = null;
    return true;
  }

  // ── Actor placement ───────────────────────────────────────────────────────────

  _placeActors(actors) {
    const avail = [];
    for (let i = 0; i < GRID; i++) if (this.grid[i].actorIdx === null) avail.push(i);
    for (let a = 0; a < actors.length; a++) {
      if (!avail.length) break;
      const p = Math.floor(Math.random() * avail.length);
      this.grid[avail.splice(p, 1)[0]].actorIdx = a;
    }
  }

  // ── Arming ────────────────────────────────────────────────────────────────────

  arm(gid) { this.armed = gid; }
  disarm()  { this.armed = null; }

  // ── Connectivity helpers ──────────────────────────────────────────────────────

  // After painting anchorIdx: drop gid from cells not reachable from anchor.
  _keepAnchorComponent(gid, anchorIdx) {
    const colorSet = new Set();
    for (let i = 0; i < GRID; i++) if (this.grid[i].colors.has(gid)) colorSet.add(i);

    const visited = new Set([anchorIdx]);
    const queue   = [anchorIdx];
    while (queue.length) {
      const cur = queue.shift();
      for (const n of neighbors(cur)) {
        if (!visited.has(n) && colorSet.has(n)) { visited.add(n); queue.push(n); }
      }
    }
    for (const ci of colorSet) if (!visited.has(ci)) this.grid[ci].colors.delete(gid);
  }

  // After removing gid from a cell: keep the component with the most actor squares.
  _enforceConnectivity(gid) {
    const colorSet = new Set();
    for (let i = 0; i < GRID; i++) if (this.grid[i].colors.has(gid)) colorSet.add(i);
    if (!colorSet.size) return;

    const visited = new Set();
    const comps   = [];
    for (const start of colorSet) {
      if (visited.has(start)) continue;
      const comp = []; const q = [start]; visited.add(start);
      while (q.length) {
        const cur = q.shift(); comp.push(cur);
        for (const n of neighbors(cur)) {
          if (!visited.has(n) && colorSet.has(n)) { visited.add(n); q.push(n); }
        }
      }
      comps.push(comp);
    }
    if (comps.length <= 1) return;

    const aCounts = comps.map(c => c.filter(i => this.grid[i].actorIdx !== null).length);
    const maxN    = Math.max(...aCounts);
    const best    = comps.filter((_, i) => aCounts[i] === maxN);
    const winner  = new Set(best[Math.floor(Math.random() * best.length)]);
    for (let i = 0; i < GRID; i++) {
      if (this.grid[i].colors.has(gid) && !winner.has(i)) this.grid[i].colors.delete(gid);
    }
  }

  // ── Simple actor move (no color effects) ─────────────────────────────────────
  // Used by Move Actor / Undo Move Actor in main.js.

  simpleMoveActor(fromIdx, toIdx) {
    if (fromIdx === toIdx) return false;
    const from = this.grid[fromIdx];
    const to   = this.grid[toIdx];
    if (from.actorIdx === null) return false;
    if (to.actorIdx !== null)   return false;
    to.actorIdx   = from.actorIdx;
    from.actorIdx = null;
    return true;
  }

  // ── Painting ──────────────────────────────────────────────────────────────────

  paintActor(cellIdx) {
    if (this.armed === null) return false;
    const cell = this.grid[cellIdx];
    if (cell.actorIdx === null) return false;
    const gid = this.armed;
    if (cell.colors.has(gid)) {
      cell.colors.delete(gid);
      this._enforceConnectivity(gid);
    } else {
      cell.colors.add(gid);
      this._keepAnchorComponent(gid, cellIdx);
    }
    return true;
  }

  paintEmpty(cellIdx) {
    if (this.armed === null) return false;
    const cell = this.grid[cellIdx];
    if (cell.actorIdx !== null) return false;
    const gid = this.armed;
    if (cell.colors.has(gid)) {
      cell.colors.delete(gid);
      this._enforceConnectivity(gid);
    } else {
      cell.colors.add(gid);
      this._keepAnchorComponent(gid, cellIdx);
    }
    return true;
  }

  // ── Level advancement ─────────────────────────────────────────────────────────

  advanceLevel() {
    const activeSet = new Set(this.actors.map(a => a.rawIdx));
    const newActor  = this._nextConnectedFrom(activeSet, this.actors)
      ?? (() => {
        const pool = this.rawActors.map((a, i) => ({ ...a, rawIdx: i }))
                         .filter(a => !activeSet.has(a.rawIdx));
        return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      })();
    if (!newActor) return false;

    this.actors.push({ ...newActor });

    // Extend displayed movies
    const rawSet = new Set();
    for (const a of this.actors) a.bits.forEach((b, j) => { if (b) rawSet.add(j); });
    const cnt = {};
    for (const j of rawSet) cnt[j] = this.actors.reduce((n, a) => n + (a.bits[j] ? 1 : 0), 0);

    const existing = new Set(this.movies.map(m => m.rawMovieIdx));
    const palette  = genColors(Math.max(this.movies.length + rawSet.size + 10, 50));
    for (const j of rawSet) {
      if (cnt[j] >= 2 && !existing.has(j)) {
        this.movies.push({
          title: this.rawMovies[j].title, rawMovieIdx: j,
          color: palette[this.movies.length % palette.length],
        });
      }
    }
    for (const a of this.actors) {
      a.activeBits = this.movies.map(m => a.bits[m.rawMovieIdx] || 0);
    }
    this.monos = genMonograms(this.actors);

    // Clear grid and re-place all actors
    for (let i = 0; i < GRID; i++) { this.grid[i].colors.clear(); this.grid[i].actorIdx = null; }
    this._placeActors(this.actors);
    this._initGroups();
    this.armed = null;
    this.level++;
    return true;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────────

  score() {
    let s = 0;
    for (let i = 0; i < GRID; i++) {
      const cell = this.grid[i];
      if (cell.actorIdx !== null) {
        const ab = this.actors[cell.actorIdx].activeBits;
        for (const gid of cell.colors) {
          const g = this.groups.get(gid);
          if (!g) continue;
          for (const mIdx of g.movieIndices) s += ab[mIdx] ? 1 : -1;
        }
      } else {
        if (cell.colors.size > 1) s -= 0.5 * (cell.colors.size - 1);
      }
    }
    return s;
  }

  maxScore() {
    let m = 0;
    for (const a of this.actors) for (const b of a.activeBits) m += b;
    return m;
  }

  // 90% of maxScore, rounded up to the nearest 0.5.
  minGoal() {
    return Math.ceil(this.maxScore() * 0.9 * 2) / 2;
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────────

  snapshot() {
    const sc = this.score();
    const mx = this.maxScore();
    const mg = this.minGoal();

    const groupsList = [];
    for (const [gid, g] of this.groups) {
      groupsList.push({
        gid,
        movieIndices: g.movieIndices,
        color:  g.color,
        titles: g.movieIndices.map(i => this.movies[i].title),
        merged: g.movieIndices.length > 1,
      });
    }
    groupsList.sort((a, b) => Math.min(...a.movieIndices) - Math.min(...b.movieIndices));

    return {
      grid:        this.grid,
      actors:      this.actors,
      movies:      this.movies,
      groupsList,
      monos:       this.monos,
      armed:       this.armed,
      score:       sc,
      maxScore:    mx,
      minGoal:     mg,
      level:       this.level,
      levelPassed: sc >= mg && mx > 0,
    };
  }
}
