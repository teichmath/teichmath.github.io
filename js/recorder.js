/**
 * recorder.js — testing aid, active only with ?debug.
 *
 * Records Random Blind boards (start positions, and the player's final board
 * when the level is passed or abandoned) so the Puzzle Master generator can be
 * checked against boards a person actually solved. Records are kept in
 * localStorage and downloaded as JSON from a small button on the page.
 */

const KEY = 'ensembles.records';

function positionsOf(game) {
  const pos = new Array(game.actors.length);
  game.grid.forEach((cell, i) => { if (cell.actorIdx !== null) pos[cell.actorIdx] = i; });
  return pos;
}

export function createRecorder() {
  let records = [];
  try { records = JSON.parse(localStorage.getItem(KEY)) || []; } catch { /* start empty */ }
  let current = null;
  let btn = null;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* kept in memory only */ }
    if (btn) btn.textContent = `Download ${records.length} record${records.length === 1 ? '' : 's'}`;
  }

  return {
    // Call when a Random Blind level appears (movesAvailable: the move bank then).
    levelStart(game, table, movesAvailable) {
      current = {
        table,
        level:   game.level,
        movesAvailable,
        actors:  game.actors.map(a => a.rawIdx),
        names:   game.actors.map(a => a.name),
        movies:  game.movies.map(m => m.rawMovieIdx),
        start:   positionsOf(game),
        started: Date.now(),
      };
    },

    // Call when the level ends: outcome 'passed' or 'abandoned'.
    levelEnd(game, outcome, movesUsed) {
      if (!current || !game) return;
      const snap = game.snapshot();
      const groups = [...game.groups].map(([gid, g]) => ({
        movies: g.movieIndices,
        cells:  game.grid.flatMap((cell, i) => (cell.colors.has(gid) ? [i] : [])),
      })).filter(g => g.cells.length);
      records.push({
        ...current,
        outcome,
        end:       positionsOf(game),
        groups,
        merged:    groups.some(g => g.movies.length > 1),
        movesUsed,
        score:     snap.score,
        maxScore:  snap.maxScore,
        minGoal:   snap.minGoal,
        seconds:   Math.round((Date.now() - current.started) / 1000),
      });
      current = null;
      save();
    },

    mountButton() {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:8px;bottom:8px;display:flex;gap:6px;z-index:500;';
      btn = document.createElement('button');
      btn.className = 'mac-btn';
      btn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(records, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ensembles-records-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
      const clear = document.createElement('button');
      clear.className = 'mac-btn';
      clear.textContent = 'Clear records';
      clear.addEventListener('click', () => {
        if (confirm(`Delete all ${records.length} recorded boards?`)) { records = []; save(); }
      });
      for (const b of [btn, clear]) b.style.cssText = 'flex:none;white-space:nowrap;';
      box.append(btn, clear);
      document.body.appendChild(box);
      save();
    },
  };
}
