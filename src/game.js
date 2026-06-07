// Main game controller — state machine, update loop, all systems
import { Renderer } from './renderer.js';
import { GameMap, T } from './map.js';
import { generateLevel } from './rooms.js';
import { Player } from './player.js';
import { Entity } from './entity.js';
import { AudioSystem } from './audio.js';
import { EventSystem } from './events.js';
import { DisturbanceSystem } from './disturbance.js';
import { WorldItem, Inventory, ITEMS } from './items.js';
import { EffectsSystem } from './effects.js';
import { UI } from './ui.js';
import { TouchControls, detectMobile } from './touch.js';

const STATES = {
  MENU: 'menu',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
  SAVE_ROOM: 'save',
  TRANSITION: 'transition',
};

export class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.vhsCanvas = document.getElementById('vhsCanvas');

    this.state = STATES.MENU;
    this.level = 1;
    this.score = 0;

    this.map = null;
    this.player = null;
    this.entities = [];
    this.worldItems = [];

    this.renderer = new Renderer(this.canvas);
    this.renderer._game = this;
    this.audio = new AudioSystem();
    this.events = new EventSystem();
    this.disturbance = new DisturbanceSystem();
    this.inventory = new Inventory();
    this.effects = new EffectsSystem(this.vhsCanvas);
    this.ui = new UI();

    // Platform detection + touch controls
    this.touchControls = new TouchControls(null, action => this._onTouchAction(action));
    this._initPlatform();

    this.lastTime = 0;
    this.animFrame = null;

    // Gameplay flags
    this.isChaseActive = false;
    this.chaseTimer = 0;
    this.inSaveRoom = false;
    this.interactTarget = null;
    this.motionSensorActive = false;
    this.motionSensorTimer = 0;
    this.placedLanterns = [];
    this.flashbangActive = false;
    this.flashbangTimer = 0;
    this.entityFlashTimer = 0;

    // Save data
    this.saveData = null;
    this.creativeMode = false;
    this._nearExitNotified = false;
    this._nightVisionTimer = 0;

    // New level feature timers
    this._mothJellyTimer = 0;
    this._idolTimer = 0;
    this._dayNightTimer = 0;
    this._curfewWarned = false;
    this.isNight = false;
    this._spawnFogTimer = 0;

    // Death messages
    this.DEATH_MESSAGES = [
      'You were too slow.',
      'The darkness claimed you.',
      'It caught up eventually.',
      'You should have hidden.',
      'The backrooms do not forgive.',
      'Level ∞ has one more name now.',
      'Nobody heard you scream.',
      'You ran out of light.',
      'Some doors should stay closed.',
    ];

    this._bindUIEvents();
    this._bindGameInput();
    this._setupCanvas();
    this.ui.showState('menu');
    this.loop = this.loop.bind(this);
  }

  _initPlatform() {
    const mobile = detectMobile();
    this.ui.setPlatform(mobile);
    this._applyPlatform(mobile);

    // React to manual toggle in options
    this.ui.on('platform_change', ({ isMobile }) => this._applyPlatform(isMobile));

    // Re-detect on resize (e.g. rotating device, or shrinking browser window)
    window.addEventListener('resize', () => {
      // Only auto-switch if user hasn't manually overridden
      if (!this._platformManuallySet) {
        const m = detectMobile();
        if (m !== this.ui.isMobile) {
          this.ui.setPlatform(m);
          this._applyPlatform(m);
        }
      }
    });
  }

  _applyPlatform(isMobile) {
    this._platformManuallySet = true;
    if (isMobile) {
      this.touchControls.player = this.player;
      // Don't enable here — only enable when gameplay starts so menus stay tappable
    } else {
      this.touchControls.disable();
    }

    // Update options sense slider reactivity
    document.getElementById('opt-touch-sens')?.addEventListener('input', (e) => {
      this.touchControls.setLookSensitivity(parseInt(e.target.value));
    });
  }

  _onTouchAction(action) {
    switch(action) {
      case 'attack':    this.swingWeapon(); break;
      case 'interact':  this.interact();    break;
      case 'flashlight':
        if (this.player) { this.player.toggleFlashlight(); this.audio.playFlashlightToggle(this.player.flashlightOn); }
        break;
      case 'inventory':
        if (this.state === STATES.PLAYING) this.ui.toggleInventory(this.inventory);
        break;
      case 'pause':
        if (this.state === STATES.PLAYING) this.pause();
        else if (this.state === STATES.PAUSED) this.resume();
        break;
    }
  }

  _setupCanvas() {
    const resize = () => {
      this.canvas.style.width = '100vw';
      this.canvas.style.height = '100vh';
    };
    resize();
    window.addEventListener('resize', resize);
  }

  _bindUIEvents() {
    this.ui.on('new_game', () => this.startNewGame());
    this.ui.on('continue', () => this.continueSave());
    this.ui.on('respawn', () => this.startNewGame());
    this.ui.on('to_menu', () => this.toMenu());
    this.ui.on('save', () => this.performSave());
    this.ui.on('leave_save', () => this.leaveSaveRoom());
    this.ui.on('pause', () => this.pause());
    this.ui.on('resume', () => this.resume());
    this.ui.on('use_item', ({ slot }) => this.useItem(slot));
    this.ui.on('equip_weapon', ({ type }) => { this.inventory.equipWeapon(type); });
    this.ui.on('drop_item', ({ slot }) => { this.inventory.remove(slot); });
    this.ui.on('hotbar_select', ({ slot }) => { this.inventory.selectSlot(slot); });
    this.ui.on('dev_tp_level', async ({ level }) => {
      await this.audio.init();
      this.audio.resume();
      this.level = level;
      await this.loadLevel(level);
    });
    this.ui.on('toggle_creative', ({ active }) => {
      this.creativeMode = active;
      if (this.events && this.state !== 'menu') {
        this.events.pendingNotifications.push({
          text: active ? '⭐ CREATIVE MODE ON' : 'CREATIVE MODE OFF', duration: 3
        });
      }
    });
    this.ui.on('creative_give_item', ({ type }) => {
      if (!this.inventory) return;
      const added = this.inventory.add(type);
      if (added && this.events) {
        const def = ITEMS[type];
        this.events.pendingNotifications.push({ text: `+ ${def?.name || type}`, duration: 2 });
      }
    });
    this.ui.on('inventory_toggle', ({ open }) => {
      if (this.player) {
        if (open) {
          document.exitPointerLock?.();
          if (this.ui.isMobile) this.touchControls.disable(); // prevent joy zone intercepting taps
        } else if (this.state === STATES.PLAYING) {
          document.body.requestPointerLock?.();
          if (this.ui.isMobile) this.touchControls.enable();
        }
      }
    });

    // Options changes
    document.getElementById('opt-sens')?.addEventListener('input', (e) => {
      if (this.player) this.player.sensitivity = (e.target.value / 10) * 0.003;
    });
    document.getElementById('opt-vol')?.addEventListener('input', (e) => {
      this.audio.setMasterVolume(e.target.value / 100);
    });
    document.getElementById('opt-music')?.addEventListener('input', (e) => {
      this.audio.setMusicVolume(e.target.value / 100);
    });
    document.getElementById('opt-vhs')?.addEventListener('change', (e) => {
      this.effects.enabled = e.target.checked;
    });
    document.getElementById('opt-fog')?.addEventListener('input', (e) => {
      if (this.renderer) this.renderer.fogDensity = (e.target.value / 10) * 0.12;
    });
  }

  _bindGameInput() {
    document.addEventListener('keydown', e => {
      if (this.state !== STATES.PLAYING) return;

      // E to interact
      if (e.code === 'KeyE') this.interact();

      // Left click / Q to swing weapon
      if (e.code === 'KeyQ' || e.code === 'KeyV') this.swingWeapon();

      // R to use selected hotbar item
      if (e.code === 'KeyR') {
        const slot = this.inventory.selectedSlot;
        this.useItem(slot);
      }

      // 1-5 hotbar
      if (e.code >= 'Digit1' && e.code <= 'Digit5') {
        this.inventory.selectSlot(parseInt(e.code.slice(-1)) - 1);
      }

      // G throw flash grenade
      if (e.code === 'KeyG') {
        const slot = this.inventory.slots.findIndex(s => s && s.type === 'flash_grenade');
        if (slot >= 0) this.useItem(slot);
      }
    });

    // Mouse click to swing
    document.addEventListener('mousedown', e => {
      if (this.state !== STATES.PLAYING) return;
      if (e.button === 0 && document.pointerLockElement) {
        this.swingWeapon();
      }
    });

    // Pointer lock (PC only — skipped on mobile)
    document.addEventListener('click', () => {
      if (this.ui.isMobile) return;
      if (this.state === STATES.PLAYING && !document.pointerLockElement) {
        document.body.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.ui.isMobile) return;
      const locked = !!document.pointerLockElement;
      const msg = document.getElementById('pointer-msg');
      if (msg) msg.classList.toggle('hide', locked);
    });
  }

  // ── GAME STATE MANAGEMENT ─────────────────────────────────────────────────
  async startNewGame() {
    await this.audio.init();
    this.audio.resume();
    this.level = 1;
    this.score = 0;
    this.inventory = new Inventory();
    // Give starting items
    this.inventory.add('battery', 2);
    this.inventory.add('almond_water', 1);
    this.disturbance.reset();
    await this.loadLevel(1);
  }

  async continueSave() {
    if (!this.saveData) return;
    await this.audio.init();
    this.audio.resume();
    this.level = this.saveData.level || 1;
    // Restore inventory
    if (this.saveData.inventory) {
      this.inventory = new Inventory();
      for (const s of this.saveData.inventory) {
        if (s) this.inventory.slots[s.i] = { type: s.type, count: s.count };
      }
    }
    await this.loadLevel(this.level);
    // Restore player stats after level loads
    if (this.player && this.saveData) {
      if (this.saveData.health) this.player.health = this.saveData.health;
      if (this.saveData.sanity) this.player.sanity = this.saveData.sanity;
      if (this.saveData.stamina) this.player.stamina = this.saveData.stamina;
      if (this.saveData.flashlightBattery) this.player.flashlightBattery = this.saveData.flashlightBattery;
    }
  }

  async loadLevel(level) {
    this.state = STATES.LOADING;
    this.ui.showState('loading');
    await new Promise(r => setTimeout(r, 100));

    this.ui.setLoadProgress(10, 'GENERATING MAP…');
    await new Promise(r => setTimeout(r, 100));

    this.map = generateLevel(level);
    this.ui.setLoadProgress(40, 'PLACING ENTITIES…');
    await new Promise(r => setTimeout(r, 100));

    // Create entities
    this.entities = this.map.entities.map(e => new Entity(e.x, e.y, e.type));

    // Create world items
    this.worldItems = this.map.items.map(i => new WorldItem(i.x, i.y, i.type));

    this.ui.setLoadProgress(60, 'WIRING SYSTEMS…');
    await new Promise(r => setTimeout(r, 100));

    // Create player
    this.player = new Player(this.map.spawnX, this.map.spawnY);
    const opts0 = this.ui.getOptions();
    this.player.sensitivity = opts0.sensitivity || 0.0024;
    // Wire touch controls to new player
    this.touchControls.player = this.player;
    this.touchControls.setLookSensitivity(opts0.touchSens || 8);

    this.disturbance.reset();
    this.events = new EventSystem();
    this._wireEvents();

    // Placed lanterns reset
    this.placedLanterns = [];
    this.isChaseActive = false;
    this.inSaveRoom = false;
    this._nearExitNotified = false;
    this._nightVisionTimer = 0;
    this._mothJellyTimer = 0;
    this._idolTimer = 0;
    this._dayNightTimer = 0;
    this._curfewWarned = false;
    this.isNight = false;
    this._spawnFogTimer = 0;

    // Apply options
    const opts = this.ui.getOptions();
    this.effects.enabled = opts.vhsEnabled;
    this.renderer.fogDensity = opts.fogDensity || 0.09;

    this.ui.setLoadProgress(80, 'LOADING TEXTURES…');
    await new Promise(r => setTimeout(r, 150));
    this.ui.setLoadProgress(100, 'READY');
    await new Promise(r => setTimeout(r, 300));

    this.state = STATES.PLAYING;
    this.ui.showState('playing');
    if (!this.ui.isMobile) {
      document.body.requestPointerLock?.();
    } else {
      this.touchControls.enable();
    }

    // Apply level theme to renderer and audio
    this._setupLevelTheme();

    // Start music
    this.audio.setMusicState('calm');

    // Level ! — force all entities into immediate chase
    if (this.map.themeConfig?.sprintLevel && this.entities.length > 0) {
      for (const e of this.entities) {
        e.state = 'chase';
        e._game = this;
        e.lastKnownX = this.player.x;
        e.lastKnownY = this.player.y;
      }
      this.isChaseActive = true;
      this.renderer.emergencyMode = true;
      this.audio.setMusicState('chase', true);
      this.audio.playAlarm();
    }

    // Level intro card
    this._showLevelIntro(level);

    // Begin loop
    this.lastTime = performance.now();
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = requestAnimationFrame(this.loop);
  }

  _showLevelIntro(level) {
    const el = document.getElementById('level-intro');
    if (!el) return;
    const theme = this.map?.themeConfig;
    const dangerMap = [1,1,2,3,3,4,4,4,3,5,3,5,4,5,5];
    const dangerClass = dangerMap[Math.min(level - 1, dangerMap.length - 1)] ?? 3;
    const numEl = document.getElementById('level-intro-number');
    const nameEl = document.getElementById('level-intro-name');
    const dangEl = document.getElementById('level-intro-danger');
    if (numEl) numEl.textContent = `LEVEL ${level}`;
    if (nameEl) nameEl.textContent = theme?.name ?? 'THE BACKROOMS';
    if (dangEl) dangEl.textContent = `DANGER CLASS: ${'█'.repeat(dangerClass)}${'░'.repeat(5 - dangerClass)}`;
    el.classList.remove('hidden');
    el.style.opacity = '1';
    const dismiss = () => {
      el.style.opacity = '0';
      setTimeout(() => el.classList.add('hidden'), 800);
    };
    const t = setTimeout(dismiss, 2800);
    const once = () => { clearTimeout(t); dismiss(); document.removeEventListener('keydown', once); el.removeEventListener('pointerdown', once); };
    document.addEventListener('keydown', once, { once: true });
    el.addEventListener('pointerdown', once, { once: true });
  }

  _wireEvents() {
    this.events.on('force_chase', () => {
      if (this.entities.length > 0) {
        const nearest = this.entities[0];
        nearest.state = 'chase';
        nearest.lastKnownX = this.player.x;
        nearest.lastKnownY = this.player.y;
      }
    });
    this.events.on('fake_entity', () => {
      if (this.player) this.player.loseSanity(10);
    });
  }

  pause() {
    if (this.state !== STATES.PLAYING) return;
    this.state = STATES.PAUSED;
    this.ui.showState('paused');
    document.exitPointerLock?.();
    this.audio.suspend();
    this.touchControls.disable();
  }

  resume() {
    if (this.state !== STATES.PAUSED) return;
    this.state = STATES.PLAYING;
    this.ui.showState('playing');
    if (!this.ui.isMobile) document.body.requestPointerLock?.();
    else this.touchControls.enable();
    this.audio.resume();
    this.lastTime = performance.now();
    this.animFrame = requestAnimationFrame(this.loop);
  }

  toMenu() {
    if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
    this.state = STATES.MENU;
    this.ui.showState('menu');
    document.exitPointerLock?.();
    this.audio.setMusicState('none');
    this.touchControls.disable();
    if (this.saveData) this.ui.enableContinueButton();
  }

  playerDie() {
    if (this.state === STATES.DEAD) return;
    this.state = STATES.DEAD;
    document.exitPointerLock?.();
    this.audio.setMusicState('none');
    this.touchControls.disable();
    const msg = this.DEATH_MESSAGES[Math.floor(Math.random() * this.DEATH_MESSAGES.length)];
    this.ui.showDeath(msg);
    if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
  }

  performSave() {
    this.saveData = {
      level: this.level,
      health: this.player?.health ?? 100,
      sanity: this.player?.sanity ?? 100,
      stamina: this.player?.stamina ?? 100,
      flashlightBattery: this.player?.flashlightBattery ?? 100,
      inventory: this.inventory.slots
        .map((s, i) => s ? { i, type: s.type, count: s.count } : null)
        .filter(Boolean),
    };
    try { localStorage.setItem('backrooms_save', JSON.stringify(this.saveData)); } catch(e) {}
    this.ui.enableContinueButton();
    this.audio.playSave();
    if (this.player) this.player.restoreAll();
  }

  leaveSaveRoom() {
    this.inSaveRoom = false;
    this.state = STATES.PLAYING;
    this.ui.showState('playing');
    if (!this.ui.isMobile) document.body.requestPointerLock?.();
    else this.touchControls.enable();
    this.audio.setMusicState('calm');
  }

  _setupLevelTheme() {
    if (!this.map) return;
    const cfg = this.map.themeConfig;
    if (!cfg) return;

    // Renderer — ambient, fog, textures
    this.renderer.ambientLight = this.map.ambientBase;
    this.renderer.fogDensity = cfg.fogDensity || 0.09;
    this.renderer.fogColorR = cfg.fogColorR || 0;
    this.renderer.fogColorG = cfg.fogColorG || 0;
    this.renderer.fogColorB = cfg.fogColorB || 0;
    this.renderer.floorTexName = cfg.floorTexName || 'carpet';
    this.renderer._skyConfig = cfg.skyKey ? this.renderer._SKY_CONFIGS?.[cfg.skyKey] : null;

    // Audio — level ambient profile
    this.audio.setLevelAmbient(cfg.ambientProfile || 'default');
  }

  enterSaveRoom() {
    if (this.inSaveRoom) return;
    this.inSaveRoom = true;
    this.state = STATES.SAVE_ROOM;
    this.ui.showState('save');
    document.exitPointerLock?.();
    this.touchControls.disable();
    this.events.handleSafeRoom(this.audio);
    if (this.player) this.player.restoreAll();
    this.disturbance.level = Math.max(0, this.disturbance.level - 0.5);
  }

  nextLevel() {
    this.level++;
    this.inventory.add('battery');
    this.loadLevel(this.level);
  }

  // ── INTERACTION ────────────────────────────────────────────────────────────
  interact() {
    if (!this.player || !this.interactTarget) return;
    const t = this.interactTarget;
    switch(t.type) {
      case 'door': this._toggleDoor(t.mx, t.my); break;
      case 'locker': this._toggleLocker(t.mx, t.my); break;
      case 'item': this._pickupItem(t.item); break;
      case 'save_room': this.enterSaveRoom(); break;
      case 'exit': this.nextLevel(); break;
      case 'pushable': this._pushObject(t.mx, t.my); break;
      case 'vending': this._useVendingMachine(); break;
    }
  }

  _toggleDoor(mx, my) {
    const tile = this.map.get(mx, my);
    if (tile === T.DOOR_CLOSED) {
      this.map.set(mx, my, T.DOOR_OPEN);
      this.audio.playDoorOpen();
      this.disturbance.addNoise(0.1, mx, my);
    } else if (tile === T.DOOR_OPEN) {
      this.map.set(mx, my, T.DOOR_CLOSED);
      this.audio.playDoorSlam();
      this.disturbance.addNoise(0.15, mx, my);
    }
  }

  _toggleLocker(mx, my) {
    const tile = this.map.get(mx, my);
    if (tile === T.LOCKER_CLOSED) {
      if (this.player.isHiding) {
        // Exit locker
        this.player.isHiding = false;
        this.player.invincible = false;
        this.map.set(mx, my, T.LOCKER_OPEN);
        this.audio.playDoorOpen();
      } else {
        // Hide in locker — become invincible
        this.player.isHiding = true;
        this.player.invincible = true;
        this.map.set(mx, my, T.LOCKER_OPEN);
        this.audio.playDoorOpen();
        this.events.pendingNotifications.push({ text: 'Hiding... hold still.', duration: 3 });
      }
    } else if (tile === T.LOCKER_OPEN) {
      this.map.set(mx, my, T.LOCKER_CLOSED);
      this.audio.playDoorSlam();
      this.player.isHiding = false;
      this.player.invincible = false;
    }
  }

  _pickupItem(item) {
    if (item.collected) return;
    const added = this.inventory.add(item.type);
    if (added) {
      item.collected = true;
      this.audio.playPickup();
      const def = ITEMS[item.type];
      if (def) {
        this.events.pendingNotifications.push({ text: `Picked up: ${def.name}`, duration: 3 });
      }
    } else {
      this.events.pendingNotifications.push({ text: 'Inventory full!', duration: 2 });
    }
  }

  _pushObject(mx, my) {
    // Simple push — try to move the object in the direction the player is facing
    const dx = Math.round(this.player.dirX), dy = Math.round(this.player.dirY);
    const nx = mx + dx, ny = my + dy;
    if (!this.map.isSolid(nx, ny)) {
      const tile = this.map.get(mx, my);
      this.map.set(mx, my, T.EMPTY);
      this.map.set(nx, ny, tile);
      this.audio.playDoorSlam();
      this.disturbance.addNoise(0.12, mx, my);
    }
  }

  useItem(slot) {
    const used = this.inventory.use(slot, this.player, this);
    if (used) {
      const slot2 = this.inventory.slots[slot];
      if (!slot2) return; // used up
      const def = ITEMS[slot2?.type];
      if (def) this.audio.playPickup();
    }
  }

  swingWeapon() {
    if (!this.player) return;
    // Trigger visual swing animation always
    this.renderer._weaponSwingT = 1.0;
    // Unarmed punch — hit entities in a cone
    const punchDamage = 15;
    for (const e of this.entities) {
      if (!e.alive || e.isHallucination) continue;
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2.0) continue;
      const dot = (dx / dist) * this.player.dirX + (dy / dist) * this.player.dirY;
      if (dot < 0.5) continue;
      e.hit(dx / dist * -0.8, dy / dist * -0.8);
      if (typeof e.takeDamage === 'function') e.takeDamage(punchDamage);
      this.audio.playEntityScream?.(3);
      break;
    }
    if (this.inventory.hasWeapon && !this.inventory.isSwinging) {
      const hit = this.inventory.swing(this.player, this.entities, this.map);
      if (hit) this.audio.playEntityScream?.(3);
    }
    this.audio.playMeleeSwing?.();
    this.disturbance.addCombat();
  }

  triggerFlashGrenade() {
    this.flashbangActive = true;
    this.flashbangTimer = 1.2;
    this.effects.triggerFlashbang();
    this.audio.playFlashGrenade();
    // Stun all nearby entities
    for (const e of this.entities) {
      if (!e.alive) continue;
      const dist = e.distanceTo(this.player.x, this.player.y);
      if (dist < 8) {
        e.state = 'idle';
        e.path = [];
        e.stateTimer = 0;
      }
    }
    this.disturbance.addNoise(0.4, this.player.x, this.player.y);
  }

  activateMotionSensor() {
    this.motionSensorActive = true;
    this.motionSensorTimer = 120; // 2 minutes
    this.events.pendingNotifications.push({ text: 'Motion sensor active', duration: 3 });
  }

  placeLantern(x, y) {
    this.placedLanterns.push({ x, y, timer: 180, radius: 6, intensity: 0.9 });
    this.map.addLight(x, y, 6, 0.9, 1.0, 0.9, 0.7);
  }

  activateNightVision(duration) {
    this._nightVisionTimer = duration;
    this.renderer.ambientLight = Math.max(this.renderer.ambientLight, 0.4);
    this.events.pendingNotifications.push({ text: '🥽 Night vision active', duration: 3 });
  }

  tryOpenVent() {
    if (!this.player) return;
    const reach = 1.5;
    const tx = Math.floor(this.player.x + this.player.dirX * reach);
    const ty2 = Math.floor(this.player.y + this.player.dirY * reach);
    if (this.map.get(tx, ty2) === T.VENT) {
      this.events.pendingNotifications.push({ text: 'Vent opened — shortcut ahead!', duration: 3 });
      this.map.set(tx, ty2, T.EMPTY);
      this.audio.playDoorOpen();
    }
  }

  _devTeleport(level) {
    this.level = level;
    this.loadLevel(level);
  }

  _creativeGiveItem(type) {
    if (!this.inventory) return;
    const added = this.inventory.add(type);
    if (added && this.events) {
      const def = ITEMS[type];
      this.events.pendingNotifications.push({ text: `+ ${def?.name || type}`, duration: 2 });
    }
  }

  // ── MAIN LOOP ─────────────────────────────────────────────────────────────
  loop(timestamp) {
    if (this.state !== STATES.PLAYING && this.state !== STATES.SAVE_ROOM) return;
    this.animFrame = requestAnimationFrame(this.loop);

    const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    this.update(dt);
    this.render(dt);
  }

  update(dt) {
    if (!this.player || !this.map) return;

    // Player
    this.player.update(dt, this.map, this.disturbance);

    // Creative mode — immortality
    if (this.creativeMode && this.player && this.player.health < 10) {
      this.player.health = 10;
    }

    // Check player death
    if (this.player.health <= 0) {
      this.playerDie();
      return;
    }

    // Inventory
    this.inventory.update(dt);

    // Entities — with context for new AI behaviors
    for (const e of this.entities) {
      if (!e.alive) continue;

      // Hound stare mechanic: check if player is looking directly at it
      if (e.type === 'hound') {
        const edx = e.x - this.player.x, edy = e.y - this.player.y;
        const edist = Math.sqrt(edx * edx + edy * edy);
        if (edist < e.sightRange && edist > 0.5) {
          const dot = (edx / edist) * this.player.dirX + (edy / edist) * this.player.dirY;
          if (dot > 0.93 && this.map.hasLineOfSight(this.player.x, this.player.y, e.x, e.y)) {
            e.notifyStared(dt);
          } else {
            e.stareTimer = Math.max(0, e.stareTimer - dt * 2); // decay when not staring
          }
        }
      }

      // Partygoer collective alert
      if (e._pendingGroupAlert) {
        e._pendingGroupAlert = false;
        for (const other of this.entities) {
          if (other !== e && other.type === 'partygoer' && other.alive) {
            if (other.distanceTo(e.x, e.y) < 22) {
              other.state = 'chase';
              other.lastKnownX = this.player.x;
              other.lastKnownY = this.player.y;
              other._alreadyAlerting = true;
            }
          }
        }
      }

      // Partygoer music cut
      if (e._pendingPartyMusicCut) {
        e._pendingPartyMusicCut = false;
        this.audio.playPartyAlert();
      }

      const lightAtEntity = this.map.getLightAt(e.x, e.y);
      e.update(dt, this.map, this.player, this.disturbance, {
        lightLevel: lightAtEntity,
        playerFlashlight: this.player.flashlightOn && this.player.flashlightBattery > 0,
      });
    }

    // World items
    for (const item of this.worldItems) item.update(dt);

    // Placed lanterns
    this.map.lightSources = this.map.lightSources.filter(src => !src._lantern || src._timer > 0);
    for (const l of this.placedLanterns) {
      l.timer -= dt;
    }
    this.placedLanterns = this.placedLanterns.filter(l => l.timer > 0);

    // Systems
    this.map.updateLights(dt);
    this.disturbance.update(dt, this.player, this.entities);
    this.events.update(dt, this.player, this.disturbance, this.audio, this.renderer);
    this.effects.update(dt, this.player, this.events, this.renderer);
    this.ui.update(dt, this);

    // Poolrooms passive healing
    if (this.map && this.map.theme === 'poolrooms' && this.player) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + dt * 5);
      this.player.sanity = Math.min(this.player.maxSanity, this.player.sanity + dt * 10);
      this.player.flashlightBattery = Math.min(100, this.player.flashlightBattery + dt * 2);
    }

    // Chase state detection with heartbeat control
    const isChasing = this.entities.some(e => e.alive && e.isChasing());
    if (isChasing && !this.isChaseActive) {
      this.isChaseActive = true;
      this.audio.setMusicState('chase');
      this.audio.setHeartbeat(true, 128);    // fast heartbeat during chase
      this.renderer.emergencyMode = true;
      this.effects.heartbeatActive = true;
      this.effects.heartbeatBPM = 128;
      this.player.shake(0.5, 0.3);
      this.chaseTimer = 0;
    } else if (!isChasing && this.isChaseActive) {
      this.chaseTimer += dt;
      if (this.chaseTimer > 8) {
        this.isChaseActive = false;
        this.renderer.emergencyMode = false;
        this.effects.chaseIntensity = 0;
        this.audio.setMusicState(this.inSaveRoom ? 'save' : 'calm');
        this.audio.setHeartbeat(false);
        this.effects.heartbeatActive = false;
      }
    } else if (isChasing) {
      this.chaseTimer = 0;
    }

    // Motion sensor beep
    if (this.motionSensorActive) {
      this.motionSensorTimer -= dt;
      const nearEntity = this.entities.find(e => e.alive && e.distanceTo(this.player.x, this.player.y) < 10);
      if (nearEntity && !this._motionBeepTimer) {
        this._motionBeepTimer = 0.5;
      }
      if (this._motionBeepTimer) {
        this._motionBeepTimer -= dt;
        if (this._motionBeepTimer <= 0) { this._motionBeepTimer = null; }
      }
      if (this.motionSensorTimer <= 0) { this.motionSensorActive = false; }
    }

    // Tense music + slow heartbeat when entity is stalking
    const isStalking = this.entities.some(e => e.alive && e.isStalking());
    if (isStalking && !isChasing && this.audio._currentMusicState !== 'tense' && this.audio._currentMusicState !== 'chase') {
      this.audio.setMusicState('tense');
      this.audio.setHeartbeat(true, 90);
      this.effects.heartbeatActive = true;
      this.effects.heartbeatBPM = 90;
    } else if (!isChasing && !isStalking) {
      if (this.audio._currentMusicState === 'tense') this.audio.setMusicState('calm');
      if (this.effects.heartbeatActive && !isChasing) {
        this.audio.setHeartbeat(false);
        this.effects.heartbeatActive = false;
      }
    }

    // Dark tile hazard (poolroom death zones)
    if (this.player) {
      const px2 = Math.floor(this.player.x), py2 = Math.floor(this.player.y);
      const ftype = this.map.getFloor(px2, py2);
      if (ftype === 103) { // FLOOR_DARK
        this.player.damage(dt * 80, 'dark_tile');
      }
    }

    // Exit proximity detection + edge glow
    if (this.map?.exitX !== undefined && this.player) {
      const edx = this.map.exitX - this.player.x, edy = this.map.exitY - this.player.y;
      const exitDist = Math.sqrt(edx * edx + edy * edy);
      this.effects.exitProximity = Math.max(0, 1 - exitDist / 12);
      if (exitDist < 12 && !this._nearExitNotified) {
        this._nearExitNotified = true;
        this.events.pendingNotifications.push({ text: '▼ EXIT DETECTED NEARBY', duration: 5 });
      }
      if (exitDist >= 14) this._nearExitNotified = false;
    } else {
      this.effects.exitProximity = 0;
    }

    // Entity footstep shake during chase
    if (this.isChaseActive && this.player) {
      for (const e of this.entities) {
        if (!e.alive || !e.isChasing()) continue;
        if (!e._stepTimer) e._stepTimer = 0;
        e._stepTimer += dt;
        const stepInterval = 0.45 / Math.max(1, e.chaseSpeed || 4);
        const eDist = e.distanceTo(this.player.x, this.player.y);
        if (e._stepTimer >= stepInterval && eDist < 18) {
          e._stepTimer = 0;
          const intensity = Math.max(0, 1 - eDist / 18) * 0.07;
          this.player.shake(intensity, 0.12);
        }
      }
    }

    // Night vision timer
    if (this._nightVisionTimer > 0) {
      this._nightVisionTimer -= dt;
      if (this._nightVisionTimer <= 0) {
        this.renderer.ambientLight = this.map.ambientBase;
        this.events.pendingNotifications.push({ text: 'Night vision faded', duration: 2 });
      }
    }

    // Passive item effects
    const hasWalkman = this.inventory.slots.some(s => s?.type === 'walkman');
    if (hasWalkman && this.player) {
      this.player.sanity = Math.min(this.player.maxSanity, this.player.sanity + dt * 0.5);
    }

    // Moth jelly — suppress deathmoth aggression
    if (this._mothJellyTimer > 0) {
      this._mothJellyTimer -= dt;
      for (const e of this.entities) {
        if (e.type === 'deathmoth' && e.alive) e.attractFlashlight = false;
      }
    }

    // Idol — suppress animations
    if (this._idolTimer > 0) {
      this._idolTimer -= dt;
      for (const e of this.entities) {
        if (e.type === 'animations' && e.alive) { e.state = 'dormant'; }
      }
    }

    // Wire _game reference so entities can check isNight
    for (const e of this.entities) { if (!e._game) e._game = this; }

    // Level 9 shrinking fog
    if (this.map.themeConfig?.shrinkingFog && this.player) {
      this._spawnFogTimer += dt;
      const shrinkFactor = Math.min(0.5, this._spawnFogTimer / 300);
      this.renderer.fogDensity = (this.map.themeConfig.fogDensity || 0.13) + shrinkFactor * 0.12;
    }

    // Level 11 smog sanity drain
    if (this.map.themeConfig?.smogSanityDrain && this.player) {
      const px3 = Math.floor(this.player.x), py3 = Math.floor(this.player.y);
      const ftype3 = this.map.getFloor(px3, py3);
      if (ftype3 === T.FLOOR_CONCRETE || ftype3 === T.FLOOR_ROAD) {
        this.player.sanity = Math.max(0, this.player.sanity - this.map.themeConfig.smogSanityDrain * dt);
      }
    }

    // Level 33 distance-based corruption
    if (this.map.themeConfig?.distanceCorruption && this.player && this.map.spawnX !== undefined) {
      const dx3 = this.player.x - this.map.spawnX, dy3 = this.player.y - this.map.spawnY;
      const distFactor = Math.min(1, Math.sqrt(dx3 * dx3 + dy3 * dy3) / 60);
      this.renderer.ambientLight = Math.max(0.05, 0.38 - distFactor * 0.28);
      this.effects.grain = 0.4 + distFactor * 0.5;
      this.effects.corruptionLevel = distFactor * 0.6;
      // Boost entity chase speed by distance
      for (const e of this.entities) {
        if (e.alive) e._distanceFactor = distFactor;
      }
    }

    // Level 94 day/night cycle
    if (this.map.themeConfig?.dayNightCycle) {
      this._dayNightTimer += dt;
      const dayLen = 300, nightLen = 120;
      const cycle = this._dayNightTimer % (dayLen + nightLen);
      const newIsNight = cycle > dayLen;
      if (newIsNight !== this.isNight) {
        this.isNight = newIsNight;
        if (newIsNight) {
          this.events.pendingNotifications.push({ text: '⚠ CURFEW — 10PM — STAY INSIDE', duration: 6 });
          this.audio.playAlarm();
          this.renderer.ambientLight = 0.03;
          this.audio.setLevelAmbient('dreamcore_night');
        } else {
          this.audio.stopAlarm?.();
          this.renderer.ambientLight = 0.78;
          this.audio.setLevelAmbient('dreamcore');
          this._curfewWarned = false;
          this.isNight = false;
        }
      }
      if (!this._curfewWarned && cycle > dayLen - 30 && cycle < dayLen) {
        this._curfewWarned = true;
        this.events.pendingNotifications.push({ text: '⚠ NIGHT FALLS IN 30 SECONDS...', duration: 5 });
      }
    }

    // Sanity hallucinations at very low sanity
    if (this.player && this.player.sanity < 15 && this.entities.length < 8) {
      if (Math.random() < dt * 0.04) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 5 + Math.random() * 4;
        const ghost = new Entity(
          this.player.x + Math.cos(angle) * dist,
          this.player.y + Math.sin(angle) * dist,
          'smiler', this.map
        );
        ghost.isHallucination = true;
        ghost._hallucTimer = 8 + Math.random() * 5;
        ghost._game = this;
        this.entities.push(ghost);
      }
    }
    for (let hi = this.entities.length - 1; hi >= 0; hi--) {
      const e = this.entities[hi];
      if (e.isHallucination) {
        e._hallucTimer -= dt;
        if (e._hallucTimer <= 0) this.entities.splice(hi, 1);
      }
    }

    // Renderer brightness from events
    if (!this.events.activeEvents.has('light_flicker') && !this.events.activeEvents.has('power_outage')) {
      this.renderer.brightness = 1.0;
    }
    if (this.events.activeEvents.has('power_outage')) {
      // handled by event tick
    }

    // Flashlight
    this.renderer.flashlightOn = this.player.flashlightOn && this.player.flashlightBattery > 0;
    this.renderer.flashlightPower = (this.player.flashlightBattery / 100) * (this.player.flashlightOn ? 1 : 0);

    // Detect interaction targets
    this._detectInteractTarget();

    // Check special tiles
    this._checkSpecialTiles();

    // Disturbance music
    if (!isChasing && !isStalking) {
      if (this.disturbance.isCritical && this.audio._currentMusicState !== 'tense') {
        this.audio.setMusicState('tense');
      }
    }

    // Audio update
    this.audio.update(dt, this.player, this.entities, this.events);
  }

  _detectInteractTarget() {
    if (!this.player) return;
    this.interactTarget = null;
    const reach = 2.5;
    const px = this.player.x, py = this.player.y;
    const dx = this.player.dirX, dy = this.player.dirY;
    const tx = px + dx * reach, ty = py + dy * reach;
    const mx = Math.floor(tx), my = Math.floor(ty);

    const tile = this.map.get(mx, my);
    if (tile === T.DOOR_CLOSED || tile === T.DOOR_OPEN) {
      this.interactTarget = { type: 'door', mx, my, label: tile === T.DOOR_CLOSED ? 'OPEN DOOR' : 'CLOSE DOOR' };
      return;
    }
    if (tile === T.VENDING_MACHINE) {
      this.interactTarget = { type: 'vending', mx, my, label: 'GET ALMOND WATER [E]' };
      return;
    }
    if (tile === T.LOCKER_CLOSED || tile === T.LOCKER_OPEN) {
      this.interactTarget = {
        type: 'locker', mx, my,
        label: this.player.isHiding ? 'EXIT LOCKER' : 'HIDE IN LOCKER'
      };
      return;
    }

    // Items
    for (const item of this.worldItems) {
      if (item.collected) continue;
      const idx = Math.abs(item.x - px), idy = Math.abs(item.y - py);
      if (idx < 2.0 && idy < 2.0) {
        const def = ITEMS[item.type];
        this.interactTarget = { type: 'item', item, label: def ? `PICK UP ${def.name.toUpperCase()}` : 'PICK UP' };
        return;
      }
    }

    // Special tile at player position
    const pKey = `${Math.floor(px)},${Math.floor(py)}`;
    const special = this.map.specialTiles.get(pKey);
    if (special) {
      if (special.type === 'save_room') {
        this.interactTarget = { type: 'save_room', label: 'SAFE ROOM [E]' };
        return;
      }
      if (special.type === 'exit') {
        this.interactTarget = { type: 'exit', label: 'EXIT LEVEL [E]' };
        return;
      }
    }
  }

  _checkSpecialTiles() {
    if (!this.player) return;
    const px = Math.floor(this.player.x), py = Math.floor(this.player.y);
    const key = `${px},${py}`;
    const special = this.map.specialTiles.get(key);
    if (special && !this._visitedTiles) this._visitedTiles = new Set();
    if (special && !this._visitedTiles.has(key)) {
      this._visitedTiles.add(key);
      this.events.handleSpecialRoom(special.type, this.player, this.audio, this.renderer);
    }
  }

  render(dt = 0) {
    if (!this.map || !this.player) return;
    this.renderer.render(this.map, this.player, this.entities, this.worldItems, dt);
    // Minimap with upgrade flags
    const hasMap = this.creativeMode || this.inventory.slots.some(s => s?.type === 'map_upgrade');
    const hasCompass = this.creativeMode || this.inventory.slots.some(s => s?.type === 'compass');
    this.renderer.renderMinimap(this.ctx, this.map, this.player, this.entities, {
      showExit: hasMap,
      showItems: hasMap,
      worldItems: this.worldItems,
      compassActive: hasCompass,
    });
    // VHS effects pass
    this.effects.render(this.ctx);
  }

  _useVendingMachine() {
    if (!this.player) return;
    if (this.inventory.add('almond_water')) {
      this.audio.playPickup();
      this.events.pendingNotifications.push({ text: '🥛 Almond Water dispensed', duration: 2 });
    } else {
      this.events.pendingNotifications.push({ text: 'Inventory full!', duration: 2 });
    }
  }

  // Load save on startup
  loadSave() {
    try {
      const data = localStorage.getItem('backrooms_save');
      if (data) {
        this.saveData = JSON.parse(data);
        this.ui.enableContinueButton();
      }
    } catch(e) {}
  }
}
