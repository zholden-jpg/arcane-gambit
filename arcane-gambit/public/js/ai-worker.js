// Runs the AI off the main thread so the board stays responsive.
import { chooseMove } from '../shared/ai.js';

self.onmessage = (e) => {
  const { id, state, opts } = e.data;
  const move = chooseMove(state, opts);
  self.postMessage({ id, move });
};
