import { loadData }   from './data.js';
import { ActorGame }  from './game.js';
import { PuzzleSource } from './puzzle-client.js';
import { createRecorder } from './recorder.js';
import {
  initCursor, moveCursor, setCursorColor,
  renderAll, renderGrid, renderMovieList, renderControls,
} from './render.js';
async function main() {
  initCursor();

  // ── How To Play manifest ───────────────────────────────────────────────────
  let htpManifest = [];
  try {
    const r = await fetch('htp/manifest.json');
    htpManifest = await r.json();
  } catch { /* no manifest yet — images simply won't load */ }

  let game = null;

  // ── Mode (Random Blind / Puzzle Master) ────────────────────────────────────
  const MODE_NAMES = { random: 'Random Blind', puzzle: 'Puzzle Master' };
  const MODE_KEY   = 'ensembles.mode';
  function loadMode() {
    try { return localStorage.getItem(MODE_KEY) === 'puzzle' ? 'puzzle' : 'random'; }
    catch { return 'random'; }
  }
  function saveMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered */ }
  }
  // Testing aid: ?pmsteps=20 gives the generator a tiny budget, forcing an early Game Over.
  const pmSteps = Number(new URLSearchParams(location.search).get('pmsteps')) || undefined;
  // Testing aid: ?debug records Random Blind boards (see recorder.js).
  const recorder = new URLSearchParams(location.search).has('debug') ? createRecorder() : null;
  // Testing aid: ?debug&moves=3 gives Random Blind 3 fresh actor moves every level (no carry-over).
  const fixedMoves = recorder ? Number(new URLSearchParams(location.search).get('moves')) || 0 : 0;
  let currentSet = null;

  let puzzleSource = null;  // PuzzleSource while a Puzzle Master game is running
  let puzzleSolution = null; // known solution of the current Puzzle Master level
  let gameToken    = 0;     // bumped on every new game/picker, to drop stale async results

  const ui = {
    mergeMode:     false,
    mergeSelected: new Set(),
    moveMode:      false,
    movedActors:   new Map(),  // actorIdx -> { fromCell, toCell }
    moveBank:      0,
    moveModeEntry: null,   // snapshot taken when entering move mode, for cancel
    roundTotal:    0,
    pickMode:      true,
    showDegrees:   false,
    mode:          loadMode(),
    fixedMoves,             // testing: Random Blind moves per level (0 = normal earned bank)
    puzzleK:       0,       // Puzzle Master: actor moves given this level
    composing:     false,   // Puzzle Master: waiting for the next level
    gameOver:      null,    // Puzzle Master: { level, reason } when no harder puzzle can be made
  };

  // ── Drag state ─────────────────────────────────────────────────────────────
  const ghost = document.getElementById('drag-ghost');
  let moveDragState  = null;
  let paintDragState = null;

  // ── Pick mode ──────────────────────────────────────────────────────────────

  function emptySnap() {
    return {
      grid:        Array.from({ length: 100 }, () => ({ actorIdx: null, colors: new Set() })),
      actors:      [],
      movies:      [],
      groupsList:  [],
      monos:       {},
      armed:       null,
      score:       0,
      maxScore:    0,
      minGoal:     0,
      level:       1,
      levelPassed: false,
    };
  }

  function renderPickMode() {
    renderGrid(emptySnap());
    document.getElementById('grid-move-overlay')?.remove();
    document.getElementById('score-box').innerHTML = '<div class="score-level">Level 1</div>';
    document.getElementById('movie-panel').style.display = '';
    const modeBtn = mode =>
      `<button class="mac-btn picker-mode${ui.mode === mode ? ' selected' : ''}" data-mode="${mode}">${MODE_NAMES[mode]}</button>`;
    const modeDesc = ui.mode === 'puzzle'
      ? 'Levels in this mode are guaranteed to have solutions.'
      : 'In this mode, the levels will eventually become unsolvable!';
    document.getElementById('movie-list').innerHTML = `
      <div class="picker-prompt">Choose a mode:</div>
      <div class="picker-modes">${modeBtn('random')}${modeBtn('puzzle')}</div>
      <div class="picker-mode-desc">${modeDesc}</div>
      <div class="picker-prompt">Choose a set to play:</div>
      <div class="picker-options">
        <button class="mac-btn mac-btn-full picker-option" data-csv="actor_tables/bunches_of_britons.csv">Bunches of Britons</button>
        <button class="mac-btn mac-btn-full picker-option" data-csv="actor_tables/mayhem_movies.csv">Mayhem Movies</button>
        <button class="mac-btn mac-btn-full picker-option" data-csv="actor_tables/studio_system.csv">Studio System</button>
      </div>`;
    renderControls(ui);
    setCursorColor(null);
  }

  const titleText = document.querySelector('#title-bar .title-text');

  function enterPickMode() {
    if (game && ui.mode === 'random' && !ui.pickMode) recorder?.levelEnd(game, 'abandoned', ui.movedActors.size);
    game = null;
    gameToken++;
    puzzleSource?.dispose();
    puzzleSource     = null;
    ui.puzzleK       = 0;
    ui.composing     = false;
    ui.gameOver      = null;
    ui.pickMode      = true;
    ui.mergeMode     = false;
    ui.mergeSelected = new Set();
    ui.moveMode      = false;
    ui.movedActors   = new Map();
    ui.moveBank      = 0;
    ui.moveModeEntry = null;
    ui.roundTotal    = 0;
    ui.showDegrees   = false;
    if (moveDragState) { ghost.style.display = 'none'; moveDragState = null; }
    paintDragState = null;
    titleText.textContent = 'Ensembles';
    renderPickMode();
  }

  async function startGame(csvPath, setName) {
    document.getElementById('htp-pregame').style.display = 'none';
    const token = ++gameToken;
    const raw = await loadData(csvPath);
    if (token !== gameToken) return;
    titleText.textContent = `Ensembles: ${setName} · ${MODE_NAMES[ui.mode]}`;

    currentSet = setName;
    if (ui.mode === 'random') {
      game = new ActorGame(raw);
      ui.pickMode = false;
      if (fixedMoves) ui.moveBank = fixedMoves;
      render();
      recorder?.levelStart(game, setName, ui.moveBank);
      return;
    }

    puzzleSource = new PuzzleSource(raw, { genOpts: pmSteps ? { maxSteps: pmSteps } : {} });
    document.getElementById('score-box').innerHTML =
      '<div class="score-level">Level 1</div><div class="score-mode-msg">Composing puzzle…</div>';
    const { result } = await puzzleSource.next();
    if (token !== gameToken) return;
    if (!result.ok) {
      document.getElementById('score-box').innerHTML =
        '<div class="score-mode-msg">Couldn’t compose a puzzle. Press Restart to try again.</div>';
      return;
    }
    game = new ActorGame(raw, { actors: result.actors, positions: result.positions });
    puzzleSolution = result.solution;
    ui.puzzleK  = result.k;
    ui.moveBank = result.k;
    ui.pickMode = false;
    render();
  }

  // Puzzle Master: take the next composed level (waiting for it if needed).
  async function advancePuzzleLevel() {
    const token = gameToken;
    const passedLevel = game.level;
    if (!puzzleSource.ready) { ui.composing = true; render(); }
    const { result } = await puzzleSource.next();
    if (token !== gameToken) return;
    ui.composing = false;
    if (!result.ok) {
      ui.gameOver = { level: passedLevel, reason: result.reason };
      ui.showDegrees = false;
      game.disarm();
      puzzleSource.dispose();
      puzzleSource = null;
      render();
      return;
    }
    ui.movedActors = new Map();
    game.advanceLevelTo(result.rawIdx, result.positions);
    puzzleSolution = result.solution;
    ui.puzzleK  = result.k;
    ui.moveBank = result.k;   // fresh each level; unused moves don't carry over
    render();
  }

  function render() {
    if (ui.pickMode) { renderPickMode(); return; }
    renderAll(game.snapshot(), ui);
  }

  // Show initial state
  enterPickMode();

  // Testing aid: ?debug exposes state for automated tests.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__ensembles = { get game() { return game; }, get solution() { return puzzleSolution; }, ui, render };
  }
  if (recorder) {
    recorder.mountButton();
    // Closing the tab mid-level counts as abandoning it.
    window.addEventListener('pagehide', () => {
      if (game && ui.mode === 'random' && !ui.pickMode) recorder.levelEnd(game, 'abandoned', ui.movedActors.size);
    });
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────

  const tooltip = document.getElementById('tooltip');

  function showActorTooltip(actorIdx, x, y) {
    const name = game.actors[actorIdx].name;
    tooltip.textContent = name;

    if (game.armed !== null) {
      const group = game.groups.get(game.armed);
      const inMovie = group
        ? group.movieIndices.some(mIdx => game.actors[actorIdx].activeBits[mIdx])
        : false;

      if (inMovie) {
        tooltip.className             = 'tt-match';
        tooltip.style.borderLeftColor = game.groups.get(game.armed).color;
      } else {
        tooltip.className             = 'tt-no-match';
        tooltip.style.borderLeftColor = '';
      }
    } else {
      tooltip.className             = 'tt-neutral';
      tooltip.style.borderLeftColor = '';
    }

    tooltip.style.display = 'block';
    positionTooltip(x, y);
  }

  function hideTooltip() { tooltip.style.display = 'none'; }

  function positionTooltip(x, y) {
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let lx = x + 18, ly = y + 12;
    if (lx + tw > window.innerWidth  - 8) lx = x - tw - 4;
    if (ly + th > window.innerHeight - 8) ly = y - th - 4;
    tooltip.style.left = lx + 'px';
    tooltip.style.top  = ly + 'px';
  }

  // ── Cursor tracking ────────────────────────────────────────────────────────

  document.addEventListener('mousemove', e => {
    moveCursor(e.clientX, e.clientY);
    if (!game || ui.pickMode) {
      setCursorColor(null);
    } else if (!ui.moveMode) {
      const armedGroup = game.armed !== null ? game.groups.get(game.armed) : null;
      setCursorColor(armedGroup ? armedGroup.color : null);
    } else {
      setCursorColor(null);
    }
    if (tooltip.style.display === 'block') positionTooltip(e.clientX, e.clientY);
    if (moveDragState)  continueMoveDrag(e.clientX, e.clientY);
    if (paintDragState) continuePaintDrag(e);
  });

  // ── Move-actor drag state ──────────────────────────────────────────────────

  const gridEl = document.getElementById('grid');

  function cellIdxAtPoint(x, y) {
    const rect  = gridEl.getBoundingClientRect();
    const cellW = rect.width  / 10;
    const cellH = rect.height / 10;
    const col   = Math.floor((x - rect.left) / cellW);
    const row   = Math.floor((y - rect.top)  / cellH);
    if (col < 0 || col >= 10 || row < 0 || row >= 10) return null;
    return row * 10 + col;
  }

  function continueMoveDrag(x, y) {
    if (!moveDragState) return;
    const dx = x - moveDragState.startX, dy = y - moveDragState.startY;
    if (!moveDragState.live && Math.abs(dx) + Math.abs(dy) > 5) {
      moveDragState.live  = true;
      ghost.style.display = 'flex';
      ghost.textContent   = game.monos[moveDragState.actorIdx];
    }
    if (moveDragState.live) {
      ghost.style.left = x + 'px';
      ghost.style.top  = y + 'px';
      const toIdx = cellIdxAtPoint(x, y);
      gridEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (toIdx !== null && game.grid[toIdx].actorIdx === null) {
        gridEl.querySelector(`.cell[data-idx="${toIdx}"]`)?.classList.add('drag-over');
      }
    }
  }

  function endMoveDrag(x, y) {
    gridEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    ghost.style.display = 'none';
    if (moveDragState?.live) {
      const toIdx = cellIdxAtPoint(x, y);
      if (toIdx !== null && toIdx !== moveDragState.fromIdx && game.grid[toIdx].actorIdx === null) {
        game.simpleMoveActor(moveDragState.fromIdx, toIdx);
        const { actorIdx, fromIdx } = moveDragState;
        const existing = ui.movedActors.get(actorIdx);
        if (existing) {
          if (toIdx === existing.fromCell) {
            // Dragged back to original position — treat as unmoved, refund bank point
            ui.movedActors.delete(actorIdx);
            ui.moveBank += 1;
          } else {
            existing.toCell = toIdx;
          }
        } else {
          ui.movedActors.set(actorIdx, { fromCell: fromIdx, toCell: toIdx });
          ui.moveBank -= 1;
        }
      }
    }
    moveDragState = null;
    render();
  }

  // ── Paint drag state ───────────────────────────────────────────────────────

  // Returns a 4-connected sequence of cell indices from fromIdx to toIdx.
  // Diagonal interpolation steps are broken into two side-sharing steps.
  function cellsBetween(fromIdx, toIdx) {
    const r0 = Math.floor(fromIdx / 10), c0 = fromIdx % 10;
    const r1 = Math.floor(toIdx   / 10), c1 = toIdx   % 10;
    const dr = r1 - r0, dc = c1 - c0;
    const absDr = Math.abs(dr), absDc = Math.abs(dc);
    const steps = Math.max(absDr, absDc);
    const cells = [fromIdx];
    let r = r0, c = c0;
    for (let i = 1; i <= steps; i++) {
      const t  = i / steps;
      const nr = Math.round(r0 + t * dr);
      const nc = Math.round(c0 + t * dc);
      if (nr !== r && nc !== c) {
        // Diagonal step — insert a 4-connected intermediate cell first.
        // Move along whichever axis has more ground to cover.
        if (absDr >= absDc) cells.push(nr * 10 + c);
        else                cells.push(r  * 10 + nc);
      }
      r = nr; c = nc;
      cells.push(r * 10 + c);
    }
    return cells.filter((idx, i) => i === 0 || idx !== cells[i - 1]);
  }

  function applyPaint(cellIdx) {
    const cell = game.grid[cellIdx];
    if (paintDragState.erasing) {
      if (cell.actorIdx !== null) game.paintActor(cellIdx);
      else                        game.paintEmpty(cellIdx);
    } else {
      if (!cell.colors.has(game.armed)) {
        if (cell.actorIdx !== null) game.paintActor(cellIdx);
        else                        game.paintEmpty(cellIdx);
      }
    }
  }

  function continuePaintDrag(e) {
    if (!paintDragState) return;
    const cellEl = e.target.closest('.cell');
    if (!cellEl) return;
    const idx = Number(cellEl.dataset.idx);
    if (idx === paintDragState.lastCellIdx) return;

    const path = cellsBetween(paintDragState.lastCellIdx, idx);
    paintDragState.lastCellIdx = idx;

    let changed = false;
    for (const cellIdx of path) {
      const cell = game.grid[cellIdx];
      if (paintDragState.erasing && !cell.colors.has(game.armed)) continue;
      if (!paintDragState.erasing && cell.colors.has(game.armed)) continue;
      applyPaint(cellIdx);
      changed = true;
    }
    if (changed) render();
  }

  // ── Grid events ────────────────────────────────────────────────────────────

  gridEl.addEventListener('mousemove', e => {
    if (!game || ui.pickMode || ui.mergeMode) { hideTooltip(); return; }

    const cellEl = e.target.closest('.cell');
    if (cellEl) {
      const idx = Number(cellEl.dataset.idx);
      const actorIdx = game.grid[idx].actorIdx;
      if (actorIdx !== null) { showActorTooltip(actorIdx, e.clientX, e.clientY); return; }
    }
    hideTooltip();
  });

  gridEl.addEventListener('mouseleave', () => {
    hideTooltip();
    gridEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  gridEl.addEventListener('mousedown', e => {
    if (!game || ui.pickMode || ui.mergeMode || ui.gameOver) return;

    const cellEl = e.target.closest('.cell');
    if (!cellEl) return;
    const idx  = Number(cellEl.dataset.idx);
    const cell = game.grid[idx];

    if (ui.moveMode) {
      if (cell.actorIdx === null) return;
      if (ui.moveBank <= 0 && !ui.movedActors.has(cell.actorIdx)) return;
      moveDragState = { fromIdx: idx, actorIdx: cell.actorIdx, startX: e.clientX, startY: e.clientY, live: false };
      e.preventDefault();
      return;
    }

    if (game.armed !== null) {
      const erasing = cell.colors.has(game.armed);
      paintDragState = { erasing, lastCellIdx: idx };
      if (cell.actorIdx !== null) game.paintActor(idx);
      else                        game.paintEmpty(idx);
      render();
      e.preventDefault();
    }
  });

  document.addEventListener('mouseup', e => {
    if (moveDragState)  endMoveDrag(e.clientX, e.clientY);
    if (paintDragState) { paintDragState = null; }
  });

  // ── Movie list clicks ──────────────────────────────────────────────────────

  document.getElementById('movie-list').addEventListener('click', e => {
    const modeBtn = e.target.closest('.picker-mode');
    if (modeBtn) {
      ui.mode = modeBtn.dataset.mode;
      saveMode(ui.mode);
      renderPickMode();
      return;
    }

    const pickerBtn = e.target.closest('.picker-option');
    if (pickerBtn) {
      startGame(pickerBtn.dataset.csv, pickerBtn.textContent.trim()).catch(err => console.error('Failed to load table:', err));
      return;
    }

    if (!game || ui.pickMode || ui.gameOver) return;

    const unmergeBtn = e.target.closest('[data-unmerge-gid]');
    if (unmergeBtn) {
      game.unmergeGroup(Number(unmergeBtn.dataset.unmergeGid));
      render();
      e.stopPropagation();
      return;
    }

    const item = e.target.closest('[data-gid]');
    if (!item) return;
    const gid = Number(item.dataset.gid);

    if (ui.mergeMode) {
      if (ui.mergeSelected.has(gid)) ui.mergeSelected.delete(gid);
      else                           ui.mergeSelected.add(gid);
      renderMovieList(game.snapshot(), ui);
      e.stopPropagation();
      return;
    }

    game.arm(game.armed === gid ? null : gid);
    if (game.armed === null) game.disarm();
    render();
    e.stopPropagation();
  });

  // ── Score box delegation (Next Level button) ───────────────────────────────

  document.getElementById('score-box').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    if (e.target.id === 'btn-play-again') {
      enterPickMode();
      return;
    }
    if (e.target.id === 'btn-next-level' && ui.mode === 'puzzle') {
      if (ui.composing || ui.gameOver) return;
      ui.roundTotal += game.snapshot().score;
      advancePuzzleLevel().catch(err => console.error('Failed to compose level:', err));
      return;
    }
    if (e.target.id === 'btn-next-level') {
      recorder?.levelEnd(game, 'passed', ui.movedActors.size);
      ui.roundTotal   += game.snapshot().score;
      ui.movedActors   = new Map();
      const ok = game.advanceLevel();
      if (!ok) {
        document.getElementById('score-box').innerHTML =
          '<div class="score-level">All actors used — well done!</div>';
        return;
      }
      const newLevel = game.snapshot().level;
      if (fixedMoves)         ui.moveBank = fixedMoves;
      else if (newLevel >= 5) ui.moveBank += 1;
      render();
      recorder?.levelStart(game, currentSet, ui.moveBank);
    }
  });

  // ── How To Play ────────────────────────────────────────────────────────────

  const TIPS = [
    "Select a title from the menu, then paint the monogram of an actor appearing in that title.",
    "Click and drag to paint/unpaint multiple squares.",
    "You get 1 point for every correct color on an actor monogram.\n\nYou lose 1 point for every incorrect color on an actor monogram.",
    "Try making multiple islands of the same color- and notice that you can't! For each color, you can only paint one connected region.",
    "Try not to overlap colors on squares without monograms. (You lose half a point for each of these overlaps.)",
    "Hover over an actor monogram to see if the actor is in the selected title (name is shown either bold or gray).",
    "Reach the minimum number of points to advance to the next level.",
    "Lifeline 1: You can merge titles together so that a single color represents all merged titles. You can do any number of merges, and any number of titles per merge.",
    "Lifeline 2: You can move an actor monogram to a different square on the grid- as long as you have actor moves left in your bank. Starting at level 5, you get one move in the bank per level.",
    "You can always undo an actor move. A dashed line will show you where a monogram started; move it back to its starting position to get the move back in the bank.",
    "You can also select “See Degrees” to see how many titles each actor appears in, and how many actors appear in each title.",
    "Eventually, you'll get to an impossible level, but don't assume you've already reached it- there may be a surprising way to complete a challenging grid.",
  ];

  // Puzzle Master replaces some tips' text; the animations stay the same.
  const PUZZLE_TIPS = {
    8:  "Lifeline 2: You can move an actor monogram to a different square on the grid. In Puzzle Master, each level comes with enough actor moves to solve it- the number changes from level to level. (A clever solution may need fewer.) Unused moves don't carry forward to the next level.",
    11: "Every Puzzle Master level is guaranteed to be solvable. Eventually the Puzzle Master won't be able to make a harder puzzle that it can guarantee- and at that point, you've won the game.",
  };
  const tipText = idx => (ui.mode === 'puzzle' && PUZZLE_TIPS[idx]) || TIPS[idx];

  let htpTipIdx   = 0;
  let htpImages   = [];
  let htpImgIdx   = 0;
  let htpImgTimer = null;

  const htpBar        = document.getElementById('htp-bar');
  const htpBody       = document.getElementById('htp-body');
  const htpCounter    = document.getElementById('htp-counter');
  const htpImgOverlay = document.getElementById('htp-img-overlay');
  const htpImgEl      = document.getElementById('htp-img');

  async function htpLoadImages(tipIdx) {
    const count = htpManifest[tipIdx] ?? 0;
    if (!count) { htpImages = []; return; }
    htpImages = Array.from({length: count}, (_, i) => {
      const img = new Image();
      img.src = `htp/${tipIdx}/${i}.jpg`;
      return img;
    });
    const first = htpImages[0];
    if (!first.complete) {
      await new Promise(res => { first.onload = first.onerror = res; });
    }
  }

  function htpCycleImage() {
    if (!htpImages.length) return;
    const next = (htpImgIdx + 1) % htpImages.length;
    if (!htpImages[next].complete) return;
    htpImgIdx = next;
    htpImgEl.src = htpImages[htpImgIdx].src;
  }

  function htpShow(idx) {
    htpTipIdx = Math.max(0, Math.min(TIPS.length - 1, idx));
    htpBody.textContent    = tipText(htpTipIdx);
    htpCounter.textContent = `${htpTipIdx + 1} / ${TIPS.length}`;
    document.getElementById('btn-htp-prev').disabled = htpTipIdx === 0;
    document.getElementById('btn-htp-next').disabled = htpTipIdx === TIPS.length - 1;

    htpBar.style.display        = '';
    htpImgOverlay.style.display = '';
    htpBar.classList.toggle('htp-bar-top', htpTipIdx === 7 || htpTipIdx === 8);

    if (htpImgTimer) { clearInterval(htpImgTimer); htpImgTimer = null; }
    htpImgEl.src = '';
    htpImages    = [];
    htpImgIdx    = 0;

    htpLoadImages(htpTipIdx).then(() => {
      if (!htpImages.length || !htpImages[0].naturalWidth) return;
      htpImgEl.src = htpImages[0].src;
      if (htpImages.length > 1) {
        if (htpImgTimer) { clearInterval(htpImgTimer); htpImgTimer = null; }
        htpImgTimer = setInterval(htpCycleImage, 500);
      }
    });
  }

  function htpClose() {
    htpBar.style.display        = 'none';
    htpImgOverlay.style.display = 'none';
    if (htpImgTimer) { clearInterval(htpImgTimer); htpImgTimer = null; }
    htpImages    = [];
    htpImgEl.src = '';
  }

  document.getElementById('btn-how-to-play').addEventListener('click', e => {
    if (ui.pickMode) {
      document.getElementById('htp-pregame').style.display = '';
    } else {
      htpShow(0);
    }
    e.stopPropagation();
  });

  document.getElementById('btn-pregame-exit').addEventListener('click', e => {
    document.getElementById('htp-pregame').style.display = 'none';
    e.stopPropagation();
  });

  document.getElementById('btn-htp-prev').addEventListener('click', e => {
    htpShow(htpTipIdx - 1);
    e.stopPropagation();
  });

  document.getElementById('btn-htp-next').addEventListener('click', e => {
    htpShow(htpTipIdx + 1);
    e.stopPropagation();
  });

  document.getElementById('btn-htp-exit').addEventListener('click', e => {
    htpClose();
    e.stopPropagation();
  });

  // ── Controls ───────────────────────────────────────────────────────────────

  document.getElementById('btn-merge-titles').addEventListener('click', e => {
    if (!game || ui.pickMode || ui.gameOver) return;
    ui.mergeMode     = true;
    ui.mergeSelected = new Set();
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-move-actor').addEventListener('click', e => {
    if (!game || ui.pickMode || ui.gameOver) return;
    if (ui.moveBank <= 0 && ui.movedActors.size === 0) return;
    // Snapshot state so Cancel can revert this session's changes
    const actorCells = new Map();
    for (let i = 0; i < 100; i++) {
      const aIdx = game.grid[i].actorIdx;
      if (aIdx !== null) actorCells.set(aIdx, i);
    }
    ui.moveModeEntry = {
      movedActors: new Map([...ui.movedActors].map(([k, v]) => [k, { ...v }])),
      moveBank:    ui.moveBank,
      actorCells,
    };
    ui.moveMode = true;
    game.disarm();
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-see-degrees').addEventListener('click', e => {
    if (!game || ui.pickMode || ui.gameOver) return;
    ui.showDegrees = !ui.showDegrees;
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-restart').addEventListener('click', e => {
    enterPickMode();
    e.stopPropagation();
  });

  document.getElementById('btn-merge-confirm').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    if (ui.mergeSelected.size >= 2) game.mergeGroups([...ui.mergeSelected]);
    ui.mergeMode     = false;
    ui.mergeSelected = new Set();
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-merge-cancel').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    ui.mergeMode     = false;
    ui.mergeSelected = new Set();
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-move-done').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    ui.moveMode      = false;
    ui.moveModeEntry = null;
    if (moveDragState) { ghost.style.display = 'none'; moveDragState = null; }
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-move-cancel').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    if (moveDragState) { ghost.style.display = 'none'; moveDragState = null; }
    // Revert any actor positions changed during this session
    if (ui.moveModeEntry) {
      for (const [actorIdx, entryCell] of ui.moveModeEntry.actorCells) {
        for (let i = 0; i < 100; i++) {
          if (game.grid[i].actorIdx === actorIdx) {
            if (i !== entryCell) game.simpleMoveActor(i, entryCell);
            break;
          }
        }
      }
      ui.movedActors   = ui.moveModeEntry.movedActors;
      ui.moveBank      = ui.moveModeEntry.moveBank;
      ui.moveModeEntry = null;
    }
    ui.moveMode = false;
    render();
    e.stopPropagation();
  });
}

main().catch(err => {
  console.error('Actor Game v3 failed to load:', err);
  document.body.innerHTML = `<p style="padding:2em;font-family:monospace">
    Error: ${err.message}<br>
    Serve from a local HTTP server (e.g. <code>python3 -m http.server</code>).
  </p>`;
});
