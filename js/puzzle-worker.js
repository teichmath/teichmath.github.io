/**
 * puzzle-worker.js — composes Puzzle Master levels off the main thread.
 * Protocol: see createComposer in puzzle.js.
 */
import { createComposer } from './puzzle.js';

const handle = createComposer(msg => self.postMessage(msg));
self.onmessage = e => handle(e.data);
