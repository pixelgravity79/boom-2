// Touch, mouse and keyboard. Moves are in screen terms: down = forward (toward the player), up = back.
const SWIPE_PX = 26;   // a drag this long is a swipe, shorter is a tap
const KEYS = {
  ArrowDown: 'f', KeyS: 'f', Space: 'f',
  ArrowUp: 'b', KeyW: 'b',
  ArrowLeft: 'l', KeyA: 'l',
  ArrowRight: 'r', KeyD: 'r',
};

export class Input {
  /** handlers: { move(dir), press(), release(), key(code) -> true if consumed, blocked(target) -> true to ignore } */
  constructor(surface, handlers) {
    this.h = handlers;
    this.touch = null;
    this.enabled = true;
    surface.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.up(e), { passive: false });
    window.addEventListener('pointercancel', (e) => this.cancel(e));
    window.addEventListener('keydown', (e) => this.key(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS: stop double-tap zoom and rubber-banding on the game surface
    surface.addEventListener('touchstart', (e) => { if (!this.h.blocked(e.target)) e.preventDefault(); }, { passive: false });
    surface.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  down(e) {
    if (!this.enabled || this.h.blocked(e.target)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.touch) return; // first finger only
    e.preventDefault();
    this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
    this.h.press();
  }

  dirOf(dx, dy) {
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'f' : 'b');
  }

  move(e) {
    const t = this.touch;
    if (!t || e.pointerId !== t.id || t.fired) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.hypot(dx, dy) >= SWIPE_PX) { // fire swipes as soon as they're clear: feels much snappier than waiting for lift-off
      t.fired = true;
      this.h.release();
      this.h.move(this.dirOf(dx, dy));
    }
  }

  up(e) {
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    this.touch = null;
    if (t.fired) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    this.h.release();
    this.h.move(Math.hypot(dx, dy) < SWIPE_PX ? 'f' : this.dirOf(dx, dy));
  }

  cancel(e) {
    if (this.touch && e.pointerId === this.touch.id) { this.touch = null; this.h.release(); }
  }

  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.h.key && this.h.key(e.code, e)) { e.preventDefault(); return; }
    const dir = KEYS[e.code];
    if (!dir || !this.enabled) return;
    e.preventDefault();
    if (e.repeat) return; // one hop per key press
    this.h.move(dir);
  }
}
