import { loadData }   from './data.js';
import { ActorGame }  from './game.js';
import {
  initCursor, moveCursor, setCursorColor,
  renderAll, renderGrid, renderMovieList, renderControls,
} from './render.js';

async function main() {
  initCursor();

  let game = null;

  const ui = {
    mergeMode:     false,
    mergeSelected: new Set(),
    moveMode:      false,
    moveRecord:    null,
    roundTotal:    0,
    pickMode:      true,
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
    document.getElementById('score-box').innerHTML = '<div class="score-level">Level 1</div>';
    document.getElementById('movie-panel').style.display = '';
    document.getElementById('movie-list').innerHTML = `
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
    game = null;
    ui.pickMode      = true;
    ui.mergeMode     = false;
    ui.mergeSelected = new Set();
    ui.moveMode      = false;
    ui.moveRecord    = null;
    ui.roundTotal    = 0;
    if (moveDragState) { ghost.style.display = 'none'; moveDragState = null; }
    paintDragState = null;
    titleText.textContent = 'The Actor Game';
    renderPickMode();
  }

  async function startGame(csvPath, setName) {
    const raw = await loadData(csvPath);
    game = new ActorGame(raw);
    ui.pickMode = false;
    titleText.textContent = `The Actor Game: ${setName}`;
    render();
  }

  function render() {
    if (ui.pickMode) { renderPickMode(); return; }
    renderAll(game.snapshot(), ui);
  }

  // Show initial state
  enterPickMode();

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
        ui.moveRecord = { actorIdx: moveDragState.actorIdx, fromCell: moveDragState.fromIdx, toCell: toIdx };
        ui.moveMode   = false;
      }
    }
    moveDragState = null;
    render();
  }

  // ── Paint drag state ───────────────────────────────────────────────────────

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
    paintDragState.lastCellIdx = idx;

    const cell = game.grid[idx];
    if (paintDragState.erasing && !cell.colors.has(game.armed)) return;
    if (!paintDragState.erasing && cell.colors.has(game.armed)) return;

    applyPaint(idx);
    render();
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
    if (!game || ui.pickMode || ui.mergeMode) return;

    const cellEl = e.target.closest('.cell');
    if (!cellEl) return;
    const idx  = Number(cellEl.dataset.idx);
    const cell = game.grid[idx];

    if (ui.moveMode) {
      if (cell.actorIdx === null) return;
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
    const pickerBtn = e.target.closest('.picker-option');
    if (pickerBtn) {
      startGame(pickerBtn.dataset.csv, pickerBtn.textContent.trim()).catch(err => console.error('Failed to load table:', err));
      return;
    }

    if (!game || ui.pickMode) return;

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
    if (e.target.id === 'btn-next-level') {
      ui.roundTotal += game.snapshot().score;
      ui.moveRecord = null;
      const ok = game.advanceLevel();
      if (!ok) {
        document.getElementById('score-box').innerHTML =
          '<div class="score-level">All actors used — well done!</div>';
        return;
      }
      render();
    }
  });

  // ── Controls ───────────────────────────────────────────────────────────────

  document.getElementById('btn-clear').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    game.disarm();
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-merge-titles').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    ui.mergeMode     = true;
    ui.mergeSelected = new Set();
    render();
    e.stopPropagation();
  });

  document.getElementById('btn-move-actor').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    if (ui.moveRecord) {
      game.simpleMoveActor(ui.moveRecord.toCell, ui.moveRecord.fromCell);
      ui.moveRecord = null;
    } else {
      ui.moveMode = true;
      game.disarm();
    }
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

  document.getElementById('btn-move-cancel').addEventListener('click', e => {
    if (!game || ui.pickMode) return;
    ui.moveMode = false;
    if (moveDragState) { ghost.style.display = 'none'; moveDragState = null; }
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
