/**
 * puzzle.js — compose Puzzle Master levels.
 *
 * A level = the usual actor chain + actor positions with a known passing
 * solution, then k actors scrambled off it (k = movesForLevel). If the
 * generator can't solve a level's actor set, the newest actor is re-picked
 * (skipping ones that failed), up to MAX_REPICKS times; after that the game
 * is over and the player has won.
 *
 * The caller keeps a headless ActorGame "mirror" of the chain. Its board is
 * never played; only its actors/movies matter, and they evolve exactly as the
 * on-screen game's do, so movie order (and colors) match.
 */

import { ActorGame } from './game.js';
import { generateLayout, scramble, movesForLevel, makeRng } from './levelgen.js';

export const MAX_REPICKS = 5;

function memberOf(game) {
  return game.actors.map(a => a.activeBits);
}

function levelResult(game, layout, level, rng) {
  const k = movesForLevel(level);
  return {
    positions: scramble(layout.positions, k, rng),
    solution:  { positions: layout.positions, regions: layout.regions },
    k,
    steps:     layout.steps,
  };
}

/**
 * Level 1. Returns { ok, mirror, actors (rawIdx[]), positions, solution, k }.
 * The on-screen game is new ActorGame(raw, { actors, positions }).
 */
export function composeFirstLevel(raw, opts = {}) {
  const rng = opts.seed != null ? makeRng(opts.seed) : Math.random;
  for (let attempt = 0; attempt <= MAX_REPICKS; attempt++) {
    const mirror = new ActorGame(raw);
    const layout = generateLayout(memberOf(mirror), mirror.minGoal(), { ...opts, rng });
    if (layout.ok) {
      return { ok: true, mirror, actors: mirror.actors.map(a => a.rawIdx), ...levelResult(mirror, layout, 1, rng) };
    }
  }
  return { ok: false, reason: 'exhausted' };
}

/**
 * The level after mirror's current one. On success the mirror advances.
 * Returns { ok, rawIdx, positions, solution, k, repicks } — apply with
 * game.advanceLevelTo(rawIdx, positions) — or { ok: false, reason } where
 * reason is 'exhausted' (no solvable pick) or 'no-actors' (table used up).
 */
export function composeNextLevel(mirror, opts = {}) {
  const rng = opts.seed != null ? makeRng(opts.seed) : Math.random;
  const failed = new Set();
  for (let attempt = 0; attempt <= MAX_REPICKS; attempt++) {
    const actor = mirror.pickNextActor(failed);
    if (!actor) return { ok: false, reason: attempt === 0 ? 'no-actors' : 'exhausted' };

    const token  = mirror.addActor(actor);
    const layout = generateLayout(memberOf(mirror), mirror.minGoal(), { ...opts, rng });
    mirror.removeLastActor(token);

    if (layout.ok) {
      mirror.advanceLevelTo(actor.rawIdx, layout.positions);
      return { ok: true, rawIdx: actor.rawIdx, repicks: attempt, ...levelResult(mirror, layout, mirror.level, rng) };
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
 *                                (opts: generateLayout options, e.g. maxSteps)
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
