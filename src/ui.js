// HUD and menu management
import { ITEMS, RARITY_COLORS } from './items.js';

const LOAD_HINTS = [
  'The fluorescent lights never go out. Never.',
  'If you hear footsteps that aren\'t yours... don\'t run.',
  'Almond water sustains those who are lost.',
  'Some rooms only exist when you\'re not looking.',
  'The hum of the lights is the only constant.',
  'Nobody knows how big it is.',
  'If you hear breathing behind you, keep walking.',
  'The carpets remember everyone who walked here.',
  'Time doesn\'t work correctly in the backrooms.',
  'Some people adapt. Most don\'t.',
];

export class UI {
  constructor() {
    // Menu elements
    this.mainMenu = document.getElementById('main-menu');
    this.deathScreen = document.getElementById('death-screen');
    this.saveScreen = document.getElementById('save-screen');
    this.loadingScreen = document.getElementById('loading-screen');
    this.optionsScreen = document.getElementById('options-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.hud = document.getElementById('hud');
    this.inventory = document.getElementById('inventory');
    this.pointerMsg = document.getElementById('pointer-msg');

    // HUD elements
    this.healthBar = document.getElementById('health-bar');
    this.staminaBar = document.getElementById('stamina-bar');
    this.sanityBar = document.getElementById('sanity-bar');
    this.lightBar = document.getElementById('light-bar');
    this.disturbBar = document.getElementById('disturb-bar');
    this.disturbLabel = document.getElementById('disturb-label');
    this.levelNum = document.getElementById('level-num');
    this.interactPrompt = document.getElementById('interact-prompt');
    this.eventNotify = document.getElementById('event-notify');

    // Inventory elements
    this.invGrid = document.getElementById('inv-grid');
    this.invItemName = document.getElementById('inv-item-name');
    this.invItemDesc = document.getElementById('inv-item-desc');
    this.invItemActions = document.getElementById('inv-item-actions');

    // Death screen
    this.deathMsg = document.getElementById('death-msg');

    // Load screen
    this.loadText = document.getElementById('load-text');
    this.loadBar = document.getElementById('load-bar');
    this.loadHint = document.getElementById('load-hint');

    // Options
    this.optVol       = document.getElementById('opt-vol');
    this.optMusic     = document.getElementById('opt-music');
    this.optSens      = document.getElementById('opt-sens');
    this.optTouchSens = document.getElementById('opt-touch-sens');
    this.optVHS       = document.getElementById('opt-vhs');
    this.optFog       = document.getElementById('opt-fog');
    this.optPCBtn     = document.getElementById('opt-pc');
    this.optMobileBtn = document.getElementById('opt-mobile');

    // Dev / creative panels
    this.devPanel = document.getElementById('dev-panel');
    this.creativePanel = document.getElementById('creative-panel');
    this.creativeIndicator = document.getElementById('creative-indicator');

    // Platform state
    this.isMobile = false; // set externally by Game via setPlatform()

    // State
    this.inventoryOpen = false;
    this.selectedInvSlot = -1;
    this._currentInventory = null;
    this.eventNotifyTimer = 0;
    this.eventNotifyQueue = [];
    this.currentState = 'menu';
    this._creativeActive = false;

    this._bindButtons();
    this._buildInventoryGrid();
    this._buildDevPanel();
    this._buildCreativePanel();
  }

  // Called by Game after auto-detection; also called on toggle
  setPlatform(isMobile) {
    this.isMobile = isMobile;
    document.body.classList.toggle('platform-mobile', isMobile);
    document.body.classList.toggle('platform-pc',     !isMobile);
    this.optPCBtn?.classList.toggle('active',     !isMobile);
    this.optMobileBtn?.classList.toggle('active',  isMobile);
    this._emit('platform_change', { isMobile });
  }

  _bindButtons() {
    document.getElementById('btn-new')?.addEventListener('click', () => this._emit('new_game'));
    document.getElementById('btn-continue')?.addEventListener('click', () => this._emit('continue'));
    document.getElementById('btn-options')?.addEventListener('click', () => this.showOptions());
    document.getElementById('btn-respawn')?.addEventListener('click', () => this._emit('respawn'));
    document.getElementById('btn-menu')?.addEventListener('click', () => this._emit('to_menu'));
    document.getElementById('btn-save')?.addEventListener('click', () => this._emit('save'));
    document.getElementById('btn-leave-save')?.addEventListener('click', () => this._emit('leave_save'));
    document.getElementById('btn-resume')?.addEventListener('click', () => this._emit('resume'));
    document.getElementById('btn-options2')?.addEventListener('click', () => this.showOptions());
    document.getElementById('btn-menu2')?.addEventListener('click', () => this._emit('to_menu'));
    document.getElementById('btn-close-opts')?.addEventListener('click', () => this.hideOptions());

    // Platform toggle buttons
    this.optPCBtn?.addEventListener('click', () => this.setPlatform(false));
    this.optMobileBtn?.addEventListener('click', () => this.setPlatform(true));

    document.addEventListener('keydown', e => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.currentState === 'playing') this.toggleInventory();
      }
      if (e.code === 'Escape') {
        if (this.creativePanel && !this.creativePanel.classList.contains('hidden')) { this._hideCreativePanel(); return; }
        if (this.devPanel && !this.devPanel.classList.contains('hidden')) { this._hideDevPanel(); return; }
        if (this.inventoryOpen) { this.toggleInventory(); return; }
        if (this.currentState === 'playing') this._emit('pause');
        else if (this.currentState === 'paused') this._emit('resume');
      }
      // Hotbar slot keys
      if (this.currentState === 'playing' && !this.inventoryOpen) {
        if (e.code >= 'Digit1' && e.code <= 'Digit5') {
          this._emit('hotbar_select', { slot: parseInt(e.code.slice(-1)) - 1 });
        }
      }
    });

    // Hotbar tap-to-select (mobile friendly)
    for (let i = 0; i < 5; i++) {
      document.getElementById(`slot${i}`)?.addEventListener('click', () => {
        if (this.currentState === 'playing' && !this.inventoryOpen) {
          this._emit('hotbar_select', { slot: i });
        }
      });
    }

    // Inventory backdrop click-to-close
    this.inventory?.addEventListener('click', e => {
      if (e.target === this.inventory) this.toggleInventory();
    });

    // Dev mode
    document.getElementById('btn-dev')?.addEventListener('click', () => this._showDevPanel());
    document.getElementById('btn-dev2')?.addEventListener('click', () => this._showDevPanel());
    document.getElementById('btn-dev-close')?.addEventListener('click', () => this._hideDevPanel());

    // Creative mode toggle
    document.getElementById('btn-creative')?.addEventListener('click', () => this._toggleCreative());
    document.getElementById('btn-creative2')?.addEventListener('click', () => this._toggleCreative());

    // Creative items panel
    document.getElementById('btn-give-items')?.addEventListener('click', () => this._showCreativePanel());
    document.getElementById('btn-creative-panel-close')?.addEventListener('click', () => this._hideCreativePanel());
  }

  _buildDevPanel() {
    const container = document.getElementById('dev-levels');
    if (!container) return;
    const levels = [
      [1,  'L.0   THE LOBBY'],
      [2,  'L.0B  LOBBY II'],
      [3,  'L.1   WAREHOUSE'],
      [4,  'L.1B  WAREHOUSE II'],
      [5,  'L.2   PIPE DREAMS'],
      [6,  'L.3   ELECTRICAL'],
      [7,  'L.3B  ELECTRICAL II'],
      [8,  'L.4   THE OFFICE'],
      [9,  'L.4B  OFFICE II'],
      [10, 'L.9   SUBURBS'],
      [11, 'L.9B  SUBURBS II'],
      [12, 'L.11  ENDLESS CITY'],
      [13, 'L.11B CITY II'],
      [14, 'L.33  INFINITE MALL'],
      [15, 'L.33B MALL II'],
      [16, 'L.37  POOLROOMS'],
      [17, 'L.37B POOLROOMS II'],
      [18, 'L.94  DREAMCORE'],
      [19, 'L.94B DREAMCORE II'],
      [20, 'L.FUN THE PARTY'],
      [21, 'L.!   RUN FOR LIFE'],
    ];
    for (const [n, label] of levels) {
      const btn = document.createElement('button');
      btn.className = 'dev-level-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._hideDevPanel();
        this._emit('dev_tp_level', { level: n });
      });
      container.appendChild(btn);
    }
  }

  _buildCreativePanel() {
    const container = document.getElementById('creative-items');
    if (!container) return;
    for (const [id, def] of Object.entries(ITEMS)) {
      const btn = document.createElement('button');
      btn.className = 'creative-item-btn';
      btn.innerHTML = `<span class="creative-item-icon">${def.icon}</span><span class="creative-item-name">${def.name}</span>`;
      btn.addEventListener('click', () => this._emit('creative_give_item', { type: id }));
      container.appendChild(btn);
    }
  }

  _showDevPanel() {
    this.devPanel?.classList.remove('hidden');
  }
  _hideDevPanel() {
    this.devPanel?.classList.add('hidden');
  }
  _showCreativePanel() {
    this.creativePanel?.classList.remove('hidden');
  }
  _hideCreativePanel() {
    this.creativePanel?.classList.add('hidden');
  }

  _toggleCreative() {
    this._creativeActive = !this._creativeActive;
    const label = this._creativeActive ? '⭐ CREATIVE: ON' : '⭐ CREATIVE';
    document.getElementById('btn-creative')?.textContent !== undefined &&
      (document.getElementById('btn-creative').textContent = label);
    document.getElementById('btn-creative2')?.textContent !== undefined &&
      (document.getElementById('btn-creative2').textContent = label);
    document.getElementById('btn-give-items')?.classList.toggle('hidden', !this._creativeActive);
    if (this.creativeIndicator) this.creativeIndicator.classList.toggle('hidden', !this._creativeActive);
    this._emit('toggle_creative', { active: this._creativeActive });
  }

  _emit(event, data) {
    if (this._callbacks && this._callbacks[event]) {
      this._callbacks[event].forEach(cb => cb(data));
    }
  }

  on(event, callback) {
    if (!this._callbacks) this._callbacks = {};
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(callback);
  }

  _buildInventoryGrid(inventory) {
    if (!this.invGrid) return;
    this.invGrid.innerHTML = '';
    const size = inventory ? inventory.size : 24;
    for (let i = 0; i < size; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.slot = i;
      slot.addEventListener('click', () => this._onInvSlotClick(i, this._currentInventory));
      this.invGrid.appendChild(slot);
    }
  }

  _onInvSlotClick(slot, inventory) {
    if (this.selectedInvSlot === slot) {
      // Double click = use
      this._emit('use_item', { slot });
      this.selectedInvSlot = -1;
    } else {
      this.selectedInvSlot = slot;
      this._updateInvInfo(slot, inventory);
    }
    this._updateInvGrid(inventory);
  }

  _updateInvGrid(inventory) {
    if (!inventory || !this.invGrid) return;
    const slots = this.invGrid.querySelectorAll('.inv-slot');
    slots.forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedInvSlot);
      el.innerHTML = '';
      const s = inventory.slots[i];
      if (!s) return;
      const def = ITEMS[s.type];
      if (!def) return;
      const rarityClass = ['', 'rarity-uncommon', 'rarity-rare', 'rarity-epic', 'rarity-legendary'][def.rarity || 0];
      el.innerHTML = `<span class="item-icon ${rarityClass}">${def.icon}</span>`;
      if (s.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'inv-stack';
        cnt.textContent = s.count;
        el.appendChild(cnt);
      }
      if (inventory.equippedWeapon === s.type) {
        el.style.borderColor = '#f5e6a3';
      } else {
        el.style.borderColor = '';
      }
    });
  }

  _updateInvInfo(slot, inventory) {
    if (!inventory) return;
    const s = inventory.slots[slot];
    if (!s) {
      if (this.invItemName) this.invItemName.textContent = '';
      if (this.invItemDesc) this.invItemDesc.textContent = '';
      if (this.invItemActions) this.invItemActions.innerHTML = '';
      return;
    }
    const def = ITEMS[s.type];
    if (!def) return;
    const color = RARITY_COLORS[def.rarity || 0];
    if (this.invItemName) {
      this.invItemName.textContent = def.name;
      this.invItemName.style.color = color;
    }
    if (this.invItemDesc) this.invItemDesc.textContent = def.desc;
    if (this.invItemActions) {
      this.invItemActions.innerHTML = '';
      if (!def.isWeapon) {
        const useBtn = document.createElement('button');
        useBtn.className = 'inv-btn';
        useBtn.textContent = 'USE';
        useBtn.onclick = () => this._emit('use_item', { slot });
        this.invItemActions.appendChild(useBtn);
      } else {
        const equipBtn = document.createElement('button');
        equipBtn.className = 'inv-btn';
        equipBtn.textContent = 'EQUIP';
        equipBtn.onclick = () => this._emit('equip_weapon', { type: s.type });
        this.invItemActions.appendChild(equipBtn);
      }
      const dropBtn = document.createElement('button');
      dropBtn.className = 'inv-btn';
      dropBtn.textContent = 'DROP';
      dropBtn.onclick = () => this._emit('drop_item', { slot });
      this.invItemActions.appendChild(dropBtn);
    }
  }

  update(dt, game) {
    if (!game) return;
    const { player, disturbance, inventory, level } = game;
    this._currentInventory = inventory;

    // Bars
    if (player && this.healthBar) {
      this.healthBar.style.width = `${player.health / player.maxHealth * 100}%`;
      const hp = player.health / player.maxHealth;
      this.healthBar.style.background = hp < 0.3 ? '#e74c3c' : (hp < 0.6 ? '#e67e22' : '#2ecc71');
    }
    if (player && this.staminaBar) {
      this.staminaBar.style.width = `${player.stamina / player.maxStamina * 100}%`;
    }
    if (player && this.sanityBar) {
      this.sanityBar.style.width = `${player.sanity / player.maxSanity * 100}%`;
      const san = player.sanity / player.maxSanity;
      this.sanityBar.style.background = san < 0.3 ? '#8e44ad' : '#3498db';
    }
    if (player && this.lightBar) {
      this.lightBar.style.width = `${player.flashlightBattery}%`;
      this.lightBar.style.opacity = player.flashlightOn ? '1' : '0.3';
    }
    if (disturbance && this.disturbBar) {
      this.disturbBar.style.width = `${disturbance.displayLevel * 100}%`;
      if (this.disturbLabel) {
        this.disturbLabel.textContent = disturbance.getLevelName();
        this.disturbLabel.classList.toggle('danger', disturbance.isDangerous);
      }
    }

    // Level number
    if (this.levelNum && level !== undefined) {
      this.levelNum.textContent = String(level).padStart(2, '0');
    }

    // Hotbar
    this._updateHotbar(inventory);

    // Event notifications
    this._updateEventNotify(dt, game.events);

    // Interaction prompt
    this._updateInteractPrompt(game.interactTarget);

    // Inventory
    if (this.inventoryOpen && inventory) {
      this._updateInvGrid(inventory);
    }
  }

  _updateHotbar(inventory) {
    if (!inventory) return;
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`slot${i}`);
      if (!el) continue;
      el.classList.toggle('active', i === inventory.selectedSlot);
      const s = inventory.slots[i];
      const existingIcon = el.querySelector('.item-icon');
      if (existingIcon) el.removeChild(existingIcon);
      if (s) {
        const def = ITEMS[s.type];
        if (def) {
          const span = document.createElement('span');
          span.className = 'item-icon';
          span.textContent = def.icon;
          el.appendChild(span);
        }
      }
    }
  }

  _updateEventNotify(dt, events) {
    if (!events) return;
    const notif = events.getNotification();
    if (notif && notif.text) {
      this.eventNotifyQueue.push(notif);
    }
    if (this.eventNotifyTimer > 0) {
      this.eventNotifyTimer -= dt;
      if (this.eventNotifyTimer <= 0.5) {
        this.eventNotify?.classList.remove('show');
      }
    } else if (this.eventNotifyQueue.length > 0) {
      const n = this.eventNotifyQueue.shift();
      if (this.eventNotify && n.text) {
        this.eventNotify.textContent = n.text;
        this.eventNotify.classList.add('show');
        this.eventNotifyTimer = n.duration || 3;
      }
    }
  }

  _updateInteractPrompt(target) {
    if (!this.interactPrompt) return;
    if (target) {
      this.interactPrompt.textContent = `[E] ${target.label || 'INTERACT'}`;
      this.interactPrompt.classList.add('visible');
    } else {
      this.interactPrompt.classList.remove('visible');
    }
  }

  toggleInventory(inventory) {
    const inv = inventory || this._currentInventory;
    this.inventoryOpen = !this.inventoryOpen;
    if (this.inventory) {
      this.inventory.classList.toggle('hidden', !this.inventoryOpen);
    }
    if (this.inventoryOpen) {
      this._buildInventoryGrid(inv);
      if (inv) this._updateInvGrid(inv);
    }
    this._emit('inventory_toggle', { open: this.inventoryOpen });
  }

  showState(state) {
    this.currentState = state;
    // Hide all
    [this.mainMenu, this.deathScreen, this.saveScreen, this.loadingScreen,
     this.optionsScreen, this.pauseScreen, this.hud, this.inventory,
     this.devPanel, this.creativePanel].forEach(el => {
      if (el) el.classList.add('hidden');
    });
    if (this.pointerMsg) this.pointerMsg.classList.remove('hide');

    switch(state) {
      case 'menu': this.mainMenu?.classList.remove('hidden'); break;
      case 'playing':
        this.hud?.classList.remove('hidden');
        if (this.pointerMsg) this.pointerMsg.classList.add('hide');
        break;
      case 'dead': this.deathScreen?.classList.remove('hidden'); break;
      case 'save': this.saveScreen?.classList.remove('hidden'); this.hud?.classList.remove('hidden'); break;
      case 'loading': this.loadingScreen?.classList.remove('hidden'); break;
      case 'paused': this.pauseScreen?.classList.remove('hidden'); this.hud?.classList.remove('hidden'); break;
    }
    if (this.inventoryOpen && state !== 'playing' && state !== 'paused') {
      this.inventoryOpen = false;
      this.inventory?.classList.add('hidden');
    }
  }

  showOptions() {
    this.optionsScreen?.classList.remove('hidden');
  }
  hideOptions() {
    this.optionsScreen?.classList.add('hidden');
  }

  showDeath(msg) {
    if (this.deathMsg) this.deathMsg.textContent = msg || '';
    this.showState('dead');
  }

  setLoadProgress(pct, text) {
    if (this.loadBar) this.loadBar.style.width = `${pct}%`;
    if (text && this.loadText) this.loadText.textContent = text;
    if (this.loadHint) {
      this.loadHint.textContent = LOAD_HINTS[Math.floor(Math.random() * LOAD_HINTS.length)];
    }
  }

  enableContinueButton() {
    document.getElementById('btn-continue')?.classList.remove('hidden');
  }

  getOptions() {
    return {
      masterVol:    (this.optVol?.value || 70) / 100,
      musicVol:     (this.optMusic?.value || 50) / 100,
      sensitivity:  (this.optSens?.value || 8) * 0.0003,
      touchSens:    parseInt(this.optTouchSens?.value || 8),
      vhsEnabled:   this.optVHS?.checked !== false,
      fogDensity:   ((this.optFog?.value || 5) / 10) * 0.12,
      isMobile:     this.isMobile,
    };
  }
}
