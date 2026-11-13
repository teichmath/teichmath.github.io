/**
 * puzzle.js — compose Puzzle Master levels.
 *
 * A level = the usual actor chain + a randomly dealt board (exactly as in
 * Random Blind) that is known to be solvable after moving at most k actors.
 * For each cast we deal up to BOARDS_PER_CAST boards and repair each with
 * repairBoard (fewest actors moved, at most maxMovesForLevel). k is the number
 * of moves the repair used: an upper bound — the player may need fewer.
 * If no dealt board can be repaired, the newest actor is re-picked (skipping
 * ones that failed), up to MAX_REPICKS times; after that the game is over and
 * the player has won.
 *
 * The caller keeps a headless ActorGame "mirror" of the chain. Its board is
 * never played; only its actors/movies matter, and they evolve exactly as the
 * on-screen game's do, so movie order (and colors) match.
 */

import { ActorGame } from './game.js';
import { repairBoard, makeRng } from './levelgen.js';

export const MAX_REPICKS     = 5;
export const BOARDS_PER_CAST = 40;
export const STEPS_PER_BOARD = 30000;

// Most actor moves a level may need.
export function maxMovesForLevel(level) {
  if (level >= 16) return 5;
  if (level >= 14) return 4;
  return 3;
}

function memberOf(game) {
  return game.actors.map(a => a.activeBits);
}

// Random board: a distinct cell per actor (same as ActorGame._placeActors).
function dealBoard(n, rng) {
  const cells = Array.from({ length: 100 }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (100 - i));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, n);
}

/**
 * Deal and repair boards for the mirror's current cast (as if at `level`).
 * opts: boardsPerCast, maxSteps (per repair attempt), rng.
 * Returns { positions (dealt board), solution, k, boards } or null.
 */
function composeBoard(mirror, level, opts, rng) {
  const member = memberOf(mirror), goal = mirror.minGoal();
  const { boardsPerCast = BOARDS_PER_CAST, maxSteps = STEPS_PER_BOARD } = opts;
  for (let b = 1; b <= boardsPerCast; b++) {
    const start = dealBoard(member.length, rng);
    const res = repairBoard(member, goal, start, maxMovesForLevel(level), { maxSteps, rng });
    if (res.ok) {
      return {
        positions: start,
        solution:  { positions: res.positions, regions: res.regions },
        k:         res.moved,
        boards:    b,
      };
    }
  }
  return null;
}

/**
 * Level 1. Returns { ok, mirror, actors (rawIdx[]), positions, solution, k }.
 * The on-screen game is new ActorGame(raw, { actors, positions }).
 */
export function composeFirstLevel(raw, opts = {}) {
  const rng = opts.seed != null ? makeRng(opts.seed) : Math.random;
  for (let attempt = 0; attempt <= MAX_REPICKS; attempt++) {
    const mirror = new ActorGame(raw);
    const board = composeBoard(mirror, 1, opts, rng);
    if (board) return { ok: true, mirror, actors: mirror.actors.map(a => a.rawIdx), ...board };
  }
  return { ok: false, reason: 'exhausted' };
}

/**
 * The level after mirror's current one. On success the mirror advances.
 * Returns { ok, rawIdx, positions, solution, k, boards, repicks } — apply with
 * game.advanceLevelTo(rawIdx, positions) — or { ok: false, reason } where
 * reason is 'exhausted' (no solvable pick) or 'no-actors' (table used up).
 */
export function composeNextLevel(mirror, opts = {}) {
  const rng = opts.seed != null ? makeRng(opts.seed) : Math.random;
  const failed = new Set();
  for (let attempt = 0; attempt <= MAX_REPICKS; attempt++) {
    const actor = mirror.pickNextActor(failed);
    if (!actor) return { ok: false, reason: attempt === 0 ? 'no-actors' : 'exhausted' };

    const token = mirror.addActor(actor);
    const board = composeBoard(mirror, mirror.level + 1, opts, rng);
    mirror.removeLastActor(token);

    if (board) {
      mirror.advanceLevelTo(actor.rawIdx, board.positions);
      return { ok: true, rawIdx: actor.rawIdx, repicks: attempt, ...board };
    }
    failed.add(actor.rawIdx);
  }
  return { ok: false, reason: 'exhausted' };
}

/**
 * Message handler that composes levels in order, staying one level ahead of
 * the player. Used inside the Worker (js/puzzle-worker.js) and, as a
 * fallback, on the page itself (js/puzzle-client.js).
 *
 *   in:  { type: 'start', raw, opts }  compose level 1, then level 2
 *                                (opts: boardsPerCast, maxSteps per repair attempt)
 *        { type: 'more' }        compose the next level
 *   out: { level, result }       result as from composeFirstLevel/NextLevel
 *                                (minus the mirror); level is null on failure
 */
export function createComposer(post) {
  let mirror = null;
  let done   = false;
  let opts   = {};

  function next() {
    if (done) return;
    const result = composeNextLevel(mirror, opts);
    if (!result.ok) done = true;
    post({ level: result.ok ? mirror.level : null, result });
  }

  return function handle(msg) {
    if (msg.type === 'start') {
      opts = msg.opts || {};
      const first = composeFirstLevel(msg.raw, opts);
      if (!first.ok) { done = true; post({ level: null, result: first }); return; }
      ({ mirror } = first);
      const { mirror: _, ...result } = first;
      post({ level: 1, result });
      next();
    } else if (msg.type === 'more') {
      next();
    }
  };
}
