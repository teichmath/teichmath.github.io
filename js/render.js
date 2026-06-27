/**
 * render.js (v3)
 *
 * Changes from v2:
 *  - Cursor is a DOM overlay div (fixes cursor disappearing over sidebar/buttons).
 *    CSS sets cursor:none on everything; the canvas triangle follows the mouse.
 *  - Movie panel renders groups (with tree UI for merged groups).
 *  - Score box content varies by mode (normal / levelPassed / mergeMode).
 *  - renderAll / renderGrid / renderSidebar accept optional ui state object.
 */

// ── Multi-color background ────────────────────────────────────────────────────

function multiColorBg(colorList) {
  if (!colorList.length) return '';
  if (colorList.length === 1) return colorList[0];
  const W = 8;
  const stops = [];
  colorList.forEach((c, i) => { stops.push(`${c} ${i * W}px`, `${c} ${(i + 1) * W}px`); });
  return `repeating-linear-gradient(45deg, ${stops.join(', ')})`;
}

// ── DOM cursor overlay ────────────────────────────────────────────────────────

const CURSOR_SCALE = 4;
const PAD          = 2; // extra canvas pixels so outline doesn't clip at edge
const CURSOR_SHAPE = [
  [1,0,0,0,0,0,0],
  [1,1,0,0,0,0,0],
  [1,1,1,0,0,0,0],
  [1,1,1,1,0,0,0],
  [1,1,1,1,1,0,0],
  [1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1],
  [1,1,1,0,0,0,0],
  [1,1,0,0,0,0,0],
  [1,0,0,0,0,0,0],
];

let _cursorEl     = null;
let _cursorCanvas = null;
let _lastFill     = null;

export function initCursor() {
  _cursorEl = document.createElement('div');
  _cursorEl.style.cssText =
    'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

  _cursorCanvas = document.createElement('canvas');
  _cursorCanvas.width  = 7 * CURSOR_SCALE + PAD * 2;
  _cursorCanvas.height = CURSOR_SHAPE.length * CURSOR_SCALE + PAD * 2;
  _cursorEl.appendChild(_cursorCanvas);
  document.body.appendChild(_cursorEl);

  _drawCursorCanvas('#FFFFFF');
}

export function moveCursor(x, y) {
  if (_cursorEl) _cursorEl.style.transform = `translate(${x - PAD}px,${y - PAD}px)`;
}

export function setCursorColor(fillColor) {
  const fill = fillColor || '#FFFFFF';
  if (fill === _lastFill) return;
  _drawCursorCanvas(fill);
}

function _drawCursorCanvas(fill) {
  _lastFill = fill;
  const ctx = _cursorCanvas.getContext('2d');
  const P   = CURSOR_SCALE;
  ctx.clearRect(0, 0, _cursorCanvas.width, _cursorCanvas.height);

  ctx.fillStyle = '#000000';
  for (let r = 0; r < CURSOR_SHAPE.length; r++) {
    for (let c = 0; c < CURSOR_SHAPE[r].length; c++) {
      if (CURSOR_SHAPE[r][c]) {
        ctx.fillRect(c * P - 1 + PAD, r * P - 1 + PAD, P + 2, P + 2);
      }
    }
  }
  ctx.fillStyle = fill;
  for (let r = 0; r < CURSOR_SHAPE.length; r++) {
    for (let c = 0; c < CURSOR_SHAPE[r].length; c++) {
      if (CURSOR_SHAPE[r][c]) ctx.fillRect(c * P + PAD, r * P + PAD, P, P);
    }
  }
}

// ── Grid ──────────────────────────────────────────────────────────────────────

export function renderGrid(snap, ui = null) {
  const container = document.getElementById('grid');

  if (container.children.length !== 100) {
    container.innerHTML = '';
    for (let i = 0; i < 100; i++) {
      const div  = document.createElement('div');
      div.className  = 'cell';
      div.dataset.idx = i;
      const bg   = document.createElement('div');   bg.className = 'cell-bg';
      const bdr  = document.createElement('div');  bdr.className = 'cell-border';
      const mono = document.createElement('span'); mono.className = 'monogram';
      const deg  = document.createElement('span'); deg.className = 'cell-degree';
      div.append(bg, bdr, mono, deg);
      container.appendChild(div);
    }
  }

  const { grid, actors, groupsList, monos, armed } = snap;

  // Pre-compute actor degrees when needed
  let actorDegrees = null;
  if (ui?.showDegrees && actors.length > 0) {
    actorDegrees = {};
    for (let i = 0; i < actors.length; i++) {
      const ab = actors[i].activeBits;
      let count = 0;
      if (ab) {
        for (const g of groupsList) {
          for (const mIdx of g.movieIndices) {
            if (ab[mIdx]) count++;
          }
        }
      }
      actorDegrees[i] = count;
    }
  }

  // Build gid->color map
  const gidColor = {};
  for (const g of groupsList) gidColor[g.gid] = g.color;
  const armedColor = armed !== null ? gidColor[armed] : null;

  for (let i = 0; i < 100; i++) {
    const cell   = grid[i];
    const div    = container.children[i];
    const bgEl   = div.querySelector('.cell-bg');
    const bdrEl  = div.querySelector('.cell-border');
    const monoEl = div.querySelector('.monogram');
    const degEl  = div.querySelector('.cell-degree');

    const colorList = [...cell.colors].map(gid => gidColor[gid]).filter(Boolean);
    bgEl.style.background = multiColorBg(colorList) || '';

    if (armed !== null && cell.colors.has(armed)) {
      bdrEl.style.boxShadow = colorList.length > 1
        ? `inset 0 0 0 5px ${armedColor}`
        : `inset 0 0 0 4px rgba(255,255,255,0.6)`;
    } else {
      bdrEl.style.boxShadow = '';
    }

    monoEl.textContent = cell.actorIdx !== null ? monos[cell.actorIdx] : '';

    if (degEl) {
      if (cell.actorIdx !== null && actorDegrees) {
        degEl.textContent   = actorDegrees[cell.actorIdx];
        degEl.style.display = '';
      } else {
        degEl.style.display = 'none';
      }
    }
  }
}

// ── Score box ─────────────────────────────────────────────────────────────────

function fmtScore(n) { return n % 1 === 0 ? String(n) : n.toFixed(1); }

export function renderScoreBox(snap, ui) {
  const box = document.getElementById('score-box');
  const { score, maxScore, minGoal, level, levelPassed } = snap;

  if (ui.mergeMode) {
    box.innerHTML = '<div class="score-mode-msg">Choose Titles to Merge</div>';
    return;
  }

  if (ui.moveMode) {
    box.innerHTML = '<div class="score-mode-msg">Click and drag an actor to a new square.</div>';
    return;
  }

  const scoreAndBanked = `
    <div class="score-row">
      Score: <strong>${fmtScore(score)}</strong> / ${maxScore}
      <span class="score-banked">Banked: <strong>${fmtScore(ui.roundTotal ?? 0)}</strong></span>
    </div>`;

  if (levelPassed) {
    box.innerHTML = `
      <div class="score-level">Level ${level} &mdash; <span class="level-passed-text">PASSED!</span></div>
      ${scoreAndBanked}
      <button class="mac-btn mac-btn-full" id="btn-next-level">Next Level &rarr;</button>`;
    return;
  }

  box.innerHTML = `
    <div class="score-level">Level ${level}</div>
    ${scoreAndBanked}
    <div class="score-row score-goal">Min Goal: ${fmtScore(minGoal)}</div>`;
}

// ── Movie panel ───────────────────────────────────────────────────────────────

export function renderMovieList(snap, ui) {
  const list = document.getElementById('movie-list');
  list.innerHTML = '';

  const { groupsList, armed } = snap;

  for (const g of groupsList) {
    const isArmed    = armed === g.gid;
    const isMergeSelected = ui.mergeMode && ui.mergeSelected.has(g.gid);

    const wrapper = document.createElement('div');
    wrapper.className = 'movie-group';
    wrapper.dataset.gid = g.gid;

    // Group header (swatch + first title)
    const header = document.createElement('div');
    header.className = 'movie-item group-leader'
      + (isArmed ? ' armed' : '')
      + (isMergeSelected ? ' merge-selected' : '');
    header.dataset.gid = g.gid;

    const swatch = document.createElement('div');
    swatch.className = 'movie-swatch';
    swatch.style.background = g.color;

    const label = document.createElement('span');
    label.className   = 'movie-title';
    label.textContent = g.titles[0];

    header.append(swatch, label);

    if (ui.showDegrees) {
      let count = 0;
      for (const cell of snap.grid) {
        if (cell.actorIdx === null) continue;
        const ab = snap.actors[cell.actorIdx].activeBits;
        if (ab && g.movieIndices.some(mIdx => ab[mIdx])) count++;
      }
      const degSpan = document.createElement('span');
      degSpan.className   = 'movie-degree';
      degSpan.textContent = count;
      header.appendChild(degSpan);
    }
    wrapper.appendChild(header);

    // Tree for merged members
    if (g.merged) {
      const tree = document.createElement('div');
      tree.className = 'group-tree';

      for (let ti = 1; ti < g.titles.length; ti++) {
        const member = document.createElement('div');
        member.className = 'group-member';
        member.textContent = g.titles[ti];
        tree.appendChild(member);
      }

      const unmergeBtn = document.createElement('button');
      unmergeBtn.className = 'mac-btn unmerge-btn';
      unmergeBtn.dataset.unmergeGid = g.gid;
      unmergeBtn.textContent = 'Unmerge';
      tree.appendChild(unmergeBtn);

      wrapper.appendChild(tree);
    }

    list.appendChild(wrapper);
  }
}

// ── Move indicators (SVG overlay) ─────────────────────────────────────────────

export function renderMoveIndicators(snap, ui) {
  const gridAreaEl = document.getElementById('grid-area');
  const gridEl     = document.getElementById('grid');
  const existing   = document.getElementById('grid-move-overlay');

  if (!ui.moveMode || ui.movedActors.size === 0) {
    if (existing) existing.remove();
    return;
  }

  const svg = existing || (() => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.id = 'grid-move-overlay';
    s.style.position      = 'absolute';
    s.style.pointerEvents = 'none';
    s.style.zIndex        = '3';
    gridAreaEl.appendChild(s);
    return s;
  })();

  const gridRect = gridEl.getBoundingClientRect();
  const areaRect = gridAreaEl.getBoundingClientRect();
  svg.style.left = (gridRect.left - areaRect.left) + 'px';
  svg.style.top  = (gridRect.top  - areaRect.top)  + 'px';

  const W = gridEl.offsetWidth;
  const H = gridEl.offsetHeight;
  svg.setAttribute('width',   W);
  svg.setAttribute('height',  H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  const border = 2;
  const cellW  = (W - border * 2) / 10;
  const cellH  = (H - border * 2) / 10;

  function center(i) {
    const row = Math.floor(i / 10), col = i % 10;
    return { x: border + col * cellW + cellW / 2, y: border + row * cellH + cellH / 2 };
  }

  const NS = 'http://www.w3.org/2000/svg';
  for (const [, { fromCell, toCell }] of ui.movedActors) {
    const from = center(fromCell);
    const to   = center(toCell);

    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', to.x);   line.setAttribute('y1', to.y);
    line.setAttribute('x2', from.x); line.setAttribute('y2', from.y);
    line.setAttribute('stroke', 'white');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '5 4');
    line.setAttribute('opacity', '0.85');
    svg.appendChild(line);

    const col = toCell % 10, row = Math.floor(toCell / 10);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x',      border + col * cellW + 2);
    rect.setAttribute('y',      border + row * cellH + 2);
    rect.setAttribute('width',  cellW - 4);
    rect.setAttribute('height', cellH - 4);
    rect.setAttribute('fill',   'none');
    rect.setAttribute('stroke', 'white');
    rect.setAttribute('stroke-width', '2.5');
    svg.appendChild(rect);
  }
}

// ── Controls visibility ───────────────────────────────────────────────────────

export function renderControls(ui, snap = null) {
  const anyModal = ui.mergeMode || ui.moveMode;
  document.getElementById('ctrl-normal').style.display = anyModal ? 'none' : '';
  document.getElementById('ctrl-merge').style.display  = ui.mergeMode ? '' : 'none';
  document.getElementById('ctrl-move').style.display   = ui.moveMode  ? '' : 'none';

  if (!anyModal) {
    const level       = snap ? snap.level : 0;
    const btnMove     = document.getElementById('btn-move-actor');
    const btnDegrees  = document.getElementById('btn-see-degrees');
    const bankDisplay = document.getElementById('move-bank-display');

    if (btnMove) btnMove.disabled = !(level >= 5 && (ui.moveBank > 0 || ui.movedActors.size > 0));
    if (btnDegrees) {
      btnDegrees.disabled    = !snap;
      btnDegrees.textContent = ui.showDegrees ? 'Hide Degrees' : 'See Degrees';
    }

    if (bankDisplay) {
      if (level >= 5) {
        bankDisplay.textContent = `Actor Move Bank: ${ui.moveBank}`;
        bankDisplay.style.display = '';
      } else {
        bankDisplay.style.display = 'none';
      }
    }
  }
}

// ── Full render ───────────────────────────────────────────────────────────────

export function renderAll(snap, ui = { mergeMode: false, mergeSelected: new Set(), moveMode: false, moveRecord: null, roundTotal: 0, showDegrees: false }) {
  renderGrid(snap, ui);
  renderScoreBox(snap, ui);
  renderMoveIndicators(snap, ui);

  // Hide movie panel entirely in move mode
  const moviePanel = document.getElementById('movie-panel');
  if (ui.moveMode) {
    moviePanel.style.display = 'none';
  } else {
    moviePanel.style.display = '';
    renderMovieList(snap, ui);
  }

  renderControls(ui, snap);
  setCursorColor(snap.armed !== null
    ? snap.groupsList.find(g => g.gid === snap.armed)?.color ?? null
    : null);
}
