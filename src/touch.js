// TouchControls — virtual joystick + look drag + action buttons
// Communicates to player via player.touch state object
// and fires callbacks for discrete actions (interact, flashlight, etc.)

const JOY_MAX_RADIUS = 48; // pixels

export class TouchControls {
  constructor(player, onAction) {
    this.player = player;
    this.onAction = onAction || (() => {}); // (actionName) => void
    this.enabled = false;

    // DOM refs
    this.root       = document.getElementById('mobile-controls');
    this.joyZone    = document.getElementById('joy-zone');
    this.joyBase    = document.getElementById('joy-base');
    this.joyStick   = document.getElementById('joy-stick');
    this.lookZone   = document.getElementById('look-zone');

    this.mSprint    = document.getElementById('m-sprint');
    this.mCrouch    = document.getElementById('m-crouch');
    this.mAttack    = document.getElementById('m-attack');
    this.mInteract  = document.getElementById('m-interact');
    this.mFlash     = document.getElementById('m-flashlight');
    this.mInventory = document.getElementById('m-inventory');
    this.mPause     = document.getElementById('m-pause');

    // Joystick state
    this._joyTouchId = null;
    this._joyCenterX = 0;
    this._joyCenterY = 0;

    // Look state
    this._lookTouchId = null;
    this._lookLastX = 0;
    this._lookLastY = 0;

    // Sprint is a hold button
    this._sprintActive = false;
    this._crouchActive = false;

    this._touchSens = 0.6; // look sensitivity multiplier (pixels → rotation)
  }

  // ── ENABLE / DISABLE ──────────────────────────────────────────────────────
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.root?.classList.add('active');
    this._bindAll();
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.root?.classList.remove('active');
    this._resetJoy();
    if (this.player) {
      this.player.touch.moveX = 0;
      this.player.touch.moveY = 0;
      this.player.touch.lookDX = 0;
      this.player.touch.sprintHeld = false;
    }
  }

  setLookSensitivity(val) {
    // val 1-20 from options slider, map to 0.15 – 1.5
    this._touchSens = (val / 20) * 1.4 + 0.1;
  }

  // ── BIND ALL EVENTS ───────────────────────────────────────────────────────
  _bindAll() {
    // Joystick zone
    this.joyZone?.addEventListener('touchstart',  e => this._onJoyStart(e),  { passive: false });
    this.joyZone?.addEventListener('touchmove',   e => this._onJoyMove(e),   { passive: false });
    this.joyZone?.addEventListener('touchend',    e => this._onJoyEnd(e),    { passive: false });
    this.joyZone?.addEventListener('touchcancel', e => this._onJoyEnd(e),    { passive: false });

    // Look zone
    this.lookZone?.addEventListener('touchstart',  e => this._onLookStart(e), { passive: false });
    this.lookZone?.addEventListener('touchmove',   e => this._onLookMove(e),  { passive: false });
    this.lookZone?.addEventListener('touchend',    e => this._onLookEnd(e),   { passive: false });
    this.lookZone?.addEventListener('touchcancel', e => this._onLookEnd(e),   { passive: false });

    // Sprint — hold
    this.mSprint?.addEventListener('touchstart', e => {
      e.preventDefault();
      this._sprintActive = true;
      this.mSprint.classList.add('pressed');
      if (this.player) this.player.touch.sprintHeld = true;
    }, { passive: false });
    const stopSprint = e => {
      e.preventDefault();
      this._sprintActive = false;
      this.mSprint?.classList.remove('pressed');
      if (this.player) this.player.touch.sprintHeld = false;
    };
    this.mSprint?.addEventListener('touchend',    stopSprint, { passive: false });
    this.mSprint?.addEventListener('touchcancel', stopSprint, { passive: false });

    // Crouch — toggle
    this.mCrouch?.addEventListener('touchstart', e => {
      e.preventDefault();
      this._crouchActive = !this._crouchActive;
      this.mCrouch.classList.toggle('active', this._crouchActive);
      if (this.player) this.player.toggleCrouch();
    }, { passive: false });

    // Attack
    this._bindActionBtn(this.mAttack,    'attack');
    this._bindActionBtn(this.mInteract,  'interact');
    this._bindActionBtn(this.mFlash,     'flashlight');
    this._bindActionBtn(this.mInventory, 'inventory');
    this._bindActionBtn(this.mPause,     'pause');
  }

  _bindActionBtn(el, action) {
    if (!el) return;
    el.addEventListener('touchstart', e => {
      e.preventDefault();
      el.classList.add('pressed');
      this.onAction(action);
    }, { passive: false });
    el.addEventListener('touchend', e => {
      e.preventDefault();
      el.classList.remove('pressed');
    }, { passive: false });
    el.addEventListener('touchcancel', e => {
      e.preventDefault();
      el.classList.remove('pressed');
    }, { passive: false });
  }

  // ── JOYSTICK ──────────────────────────────────────────────────────────────
  _onJoyStart(e) {
    e.preventDefault();
    if (this._joyTouchId !== null) return;
    const t = e.changedTouches[0];
    this._joyTouchId = t.identifier;
    // Joystick center = wherever the finger lands
    const rect = this.joyZone.getBoundingClientRect();
    this._joyCenterX = t.clientX - rect.left;
    this._joyCenterY = t.clientY - rect.top;
    this._showJoyAt(t.clientX, t.clientY);
  }

  _onJoyMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._joyTouchId) continue;
      const rect = this.joyZone.getBoundingClientRect();
      const dx = (t.clientX - rect.left) - this._joyCenterX;
      const dy = (t.clientY - rect.top)  - this._joyCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, JOY_MAX_RADIUS);
      const nx = dist > 0 ? (dx / dist) : 0;
      const ny = dist > 0 ? (dy / dist) : 0;
      const mag = clamped / JOY_MAX_RADIUS;

      // Map to player touch: forward = -dy (screen y is flipped), strafe = dx
      if (this.player) {
        this.player.touch.moveX =  nx * mag;  // strafe (right = positive)
        this.player.touch.moveY = -ny * mag;  // forward (up screen = positive)
      }

      // Move stick visual
      if (this.joyStick) {
        const sx = nx * clamped;
        const sy = ny * clamped;
        this.joyStick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
      }
    }
  }

  _onJoyEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._joyTouchId) continue;
      this._resetJoy();
    }
  }

  _resetJoy() {
    this._joyTouchId = null;
    if (this.player) {
      this.player.touch.moveX = 0;
      this.player.touch.moveY = 0;
    }
    if (this.joyBase)  this.joyBase.classList.remove('visible');
    if (this.joyStick) this.joyStick.style.transform = 'translate(-50%, -50%)';
  }

  _showJoyAt(clientX, clientY) {
    if (!this.joyBase || !this.joyZone) return;
    const rect = this.joyZone.getBoundingClientRect();
    const lx = clientX - rect.left;
    const ly = clientY - rect.top;
    this.joyBase.style.left = `${lx}px`;
    this.joyBase.style.top  = `${ly}px`;
    this.joyBase.classList.add('visible');
  }

  // ── LOOK DRAG ─────────────────────────────────────────────────────────────
  _onLookStart(e) {
    e.preventDefault();
    if (this._lookTouchId !== null) return;
    const t = e.changedTouches[0];
    this._lookTouchId = t.identifier;
    this._lookLastX = t.clientX;
    this._lookLastY = t.clientY;
  }

  _onLookMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this._lookTouchId) continue;
      const dx = t.clientX - this._lookLastX;
      this._lookLastX = t.clientX;
      this._lookLastY = t.clientY;
      // Accumulate into player.touch.lookDX — processed in player._handleRotation
      if (this.player) {
        // Convert pixel delta to rotation — use same sensitivity system as mouse
        // player.sensitivity is in radians/pixel; touch needs a boost factor
        this.player.touch.lookDX += dx * (this._touchSens / this.player.sensitivity) * this.player.sensitivity * 80;
      }
    }
  }

  _onLookEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this._lookTouchId) {
        this._lookTouchId = null;
      }
    }
  }
}

// ── PLATFORM DETECTION ────────────────────────────────────────────────────
export function detectMobile() {
  // 1. Coarse pointer (touch screens)
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  // 2. UA string
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true;
  // 3. Touch points + narrow screen
  if (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024) return true;
  return false;
}
