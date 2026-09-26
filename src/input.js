// Keyboard and mouse state for gameplay. Mouse look uses pointer lock when
// the browser allows it and falls back to plain mouse movement otherwise.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.left = false;
    this.right = false;
    this.leftPressed = false;
    this.rightPressed = false;
    this.mx = 0;
    this.my = 0;
    this.wheel = 0;
    this.locked = false;
    this.active = false;
    this.free = false;
    this.ignoreUntil = 0;
    this.onLockChange = null;
    this.onLockError = null;
    this.onEscape = null;

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (['Space', 'Tab', 'F5', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Escape' && !this.locked && this.onEscape) this.onEscape();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || !(this.locked || this.free)) return;
      // Browsers sometimes report one huge jump when the pointer locks or
      // the cursor warps. Real hand movement never looks like that.
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      if (performance.now() < this.ignoreUntil || Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
      this.mx += dx;
      this.my += dy;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) {
        this.left = true;
        this.leftPressed = true;
      }
      if (e.button === 2) {
        this.right = true;
        this.rightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.mx = this.my = 0;
      this.ignoreUntil = performance.now() + 120;
      if (!this.locked) this.left = this.right = false;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockError) this.onLockError();
    });
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => this.onLockError && this.onLockError());
    } catch {
      if (this.onLockError) this.onLockError();
    }
  }

  exitLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  releaseAll() {
    this.keys.clear();
    this.left = this.right = false;
  }

  takeMouse() {
    const r = [this.mx, this.my];
    this.mx = this.my = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
    this.leftPressed = false;
    this.rightPressed = false;
    this.wheel = 0;
  }
}
