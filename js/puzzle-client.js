/**
 * puzzle-client.js — the page's handle on Puzzle Master level composition.
 *
 * Starts composing as soon as it's created and stays one level ahead of the
 * player: levels 1 and 2 right away, then level n+1 when level n is taken.
 * Runs in a Web Worker; if the Worker can't start, falls back to composing
 * on the page (the page may pause while a level is composed).
 *
 * After a result with ok: false (Game Over / error), don't call next() again.
 */
import { createComposer } from './puzzle.js';

export class PuzzleSource {
  // genOpts: generateLayout options (e.g. { maxSteps } to force an early Game Over when testing)
  constructor(raw, { inline = false, genOpts = {} } = {}) {
    this._raw      = raw;
    this._genOpts  = genOpts;
    this._queue    = [];      // composed levels not yet taken: { level, result }
    this._waiter   = null;    // resolve fn of a pending next()
    this._taken    = 0;
    this._heard    = false;   // any message received yet
    this._disposed = false;
    if (inline || !this._startWorker()) this._startInline();
  }

  _deliver(msg) {
    if (this._disposed) return;
    this._heard = true;
    if (this._waiter) { const w = this._waiter; this._waiter = null; w(msg); }
    else this._queue.push(msg);
  }

  _startWorker() {
    try {
      const w = new Worker(new URL('./puzzle-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => this._deliver(e.data);
      w.onerror = e => {
        e.preventDefault?.();
        w.terminate();
        this._worker = null;
        // Failed to load: compose on the page instead. Failed mid-game: report it.
        if (!this._heard) this._startInline();
        else this._deliver({ level: null, result: { ok: false, reason: 'error' } });
      };
      this._worker = w;
      this._send = m => w.postMessage(m);
      this._send({ type: 'start', raw: this._raw, opts: this._genOpts });
      return true;
    } catch {
      return false;
    }
  }

  _startInline() {
    const handle = createComposer(msg => this._deliver(msg));
    // setTimeout lets the page render (e.g. "Composing puzzle…") before each job.
    this._send = m => setTimeout(() => { if (!this._disposed) handle(m); }, 0);
    this._send({ type: 'start', raw: this._raw, opts: this._genOpts });
    // Replay requests already made of the failed Worker.
    for (let i = 2; i <= this._taken; i++) this._send({ type: 'more' });
  }

  // True when the next level is already composed.
  get ready() { return this._queue.length > 0; }

  // Promise of the next level, in order: { level, result }.
  next() {
    const p = this._queue.length
      ? Promise.resolve(this._queue.shift())
      : new Promise(resolve => { this._waiter = resolve; });
    this._taken++;
    if (this._taken >= 2) this._send({ type: 'more' });   // keep one level ahead
    return p;
  }

  dispose() {
    this._disposed = true;
    this._worker?.terminate();
    this._waiter = null;
    this._queue = [];
  }
}
