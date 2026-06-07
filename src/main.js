// Entry point
import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.loadSave();
  window._game = game; // dev access
});
