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
  [1,0,0,0,0,0,0,0],
  [1,1,0,0,0,0,0,0],
  [1,1,1,0,0,0,0,0],
  [1,1,1,1,0,0,0,0],
  [1,1,1,1,1,0,0,0],
  [1,1,1,1,0,0,0,0],
  [1,1,1,0,0,0,0,0],
  [1,1,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,0],
];

let _cursorEl     = null;
let _cursorCanvas = null;
let _lastFill     = null;

export function initCursor() {
  _cursorEl = document.createElement('div');
  _cursorEl.style.cssText =
    'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

  _cursorCanvas = document.createElement('canvas');
  _cursorCanvas.width  = 8 * CURSOR_SCALE + PAD * 2;
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

export function renderGrid(snap) {
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
      div.append(bg, bdr, mono);
      container.appendChild(div);
    }
  }

  const { grid, actors, groupsList, monos, armed } = snap;

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

// ── Controls visibility ───────────────────────────────────────────────────────

export function renderControls(ui) {
  const anyModal = ui.mergeMode || ui.moveMode;
  document.getElementById('ctrl-normal').style.display = anyModal ? 'none' : '';
  document.getElementById('ctrl-merge').style.display  = ui.mergeMode ? '' : 'none';
  document.getElementById('ctrl-move').style.display   = ui.moveMode  ? '' : 'none';

  // Update Move Actor button label in normal mode
  if (!anyModal) {
    const btn = document.getElementById('btn-move-actor');
    if (btn) btn.textContent = ui.moveRecord ? 'Undo Move Actor' : 'Move Actor';
  }
}

// ── Full render ───────────────────────────────────────────────────────────────

export function renderAll(snap, ui = { mergeMode: false, mergeSelected: new Set(), moveMode: false, moveRecord: null, roundTotal: 0 }) {
  renderGrid(snap);
  renderScoreBox(snap, ui);

  // Hide movie panel entirely in move mode
  const moviePanel = document.getElementById('movie-panel');
  if (ui.moveMode) {
    moviePanel.style.display = 'none';
  } else {
    moviePanel.style.display = '';
    renderMovieList(snap, ui);
  }

  renderControls(ui);
  setCursorColor(snap.armed !== null
    ? snap.groupsList.find(g => g.gid === snap.armed)?.color ?? null
    : null);
}
