// Item definitions and inventory system
export const RARITY = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLORS = ['#aaa', '#27ae60', '#2980b9', '#8e44ad', '#e67e22'];

export const ITEMS = {
  battery: {
    id: 'battery', name: 'Battery', icon: '🔋',
    desc: 'Restores flashlight power. Found scattered everywhere.',
    rarity: RARITY.COMMON, stackable: true, maxStack: 5,
    use(player) {
      player.flashlightBattery = Math.min(100, player.flashlightBattery + 35);
      return true;
    }
  },
  medkit: {
    id: 'medkit', name: 'Medkit', icon: '🩹',
    desc: 'Restores 50 HP. Use when critically wounded.',
    rarity: RARITY.UNCOMMON, stackable: true, maxStack: 3,
    use(player) {
      if (player.health >= player.maxHealth) return false;
      player.heal(50); return true;
    }
  },
  almond_water: {
    id: 'almond_water', name: 'Almond Water', icon: '🥛',
    desc: 'Restores sanity and some stamina. The Backrooms staple.',
    rarity: RARITY.COMMON, stackable: true, maxStack: 4,
    use(player) {
      player.restoreSanity(25);
      player.stamina = Math.min(player.maxStamina, player.stamina + 30);
      return true;
    }
  },
  tool: {
    id: 'tool', name: 'Tool', icon: '🔧',
    desc: 'Can repair things. Opens certain maintenance doors.',
    rarity: RARITY.UNCOMMON, stackable: false,
    use(player) { return false; } // Used contextually
  },
  key: {
    id: 'key', name: 'Key', icon: '🗝️',
    desc: 'Opens a locked door somewhere nearby.',
    rarity: RARITY.UNCOMMON, stackable: false,
    use(player) { return false; } // Used contextually
  },
  security_keycard: {
    id: 'security_keycard', name: 'Security Keycard', icon: '💳',
    desc: 'Grants access to restricted maintenance areas.',
    rarity: RARITY.RARE, stackable: false,
    use(player) { return false; }
  },
  weapon_part: {
    id: 'weapon_part', name: 'Weapon Part', icon: '⚙️',
    desc: 'A component for crafting. Combine to make something useful.',
    rarity: RARITY.UNCOMMON, stackable: true, maxStack: 3,
    use(player) { return false; }
  },
  rare_collectible: {
    id: 'rare_collectible', name: 'Strange Object', icon: '✨',
    desc: 'Something from another time. Feels important.',
    rarity: RARITY.EPIC, stackable: false,
    use(player) {
      player.restoreSanity(15);
      return false;
    }
  },
  // ── WEAPONS ───────────────────────────────────────────────────────────────
  pipe: {
    id: 'pipe', name: 'Metal Pipe', icon: '🔩',
    desc: 'A length of rusted pipe. Deals moderate damage.',
    rarity: RARITY.COMMON, stackable: false, isWeapon: true,
    damage: 25, swingTime: 0.6, knockback: 2,
    use(player) { return false; }
  },
  fire_axe: {
    id: 'fire_axe', name: 'Fire Axe', icon: '🪓',
    desc: 'Heavy axe. Deals massive damage but slow swing.',
    rarity: RARITY.RARE, stackable: false, isWeapon: true,
    damage: 60, swingTime: 1.1, knockback: 4,
    use(player) { return false; }
  },
  flash_grenade: {
    id: 'flash_grenade', name: 'Flash Grenade', icon: '💡',
    desc: 'Emergency escape. Blinds entities for several seconds.',
    rarity: RARITY.RARE, stackable: true, maxStack: 2,
    use(player, game) {
      if (game) game.triggerFlashGrenade();
      return true;
    }
  },
  flashlight_heavy: {
    id: 'flashlight_heavy', name: 'Heavy Flashlight', icon: '🔦',
    desc: 'Powerful beam. Long battery life. Can stun entities.',
    rarity: RARITY.RARE, stackable: false, isWeapon: true,
    damage: 5, swingTime: 0.4, knockback: 1,
    use(player) {
      player.flashlightBattery = 100;
      player.flashlightDrainRate = 1; // Better drain rate
      return true;
    }
  },
  motion_sensor: {
    id: 'motion_sensor', name: 'Motion Sensor', icon: '📡',
    desc: 'Alerts you when entities are nearby. Beeps audibly.',
    rarity: RARITY.RARE, stackable: false,
    use(player, game) { if (game) game.activateMotionSensor(); return true; }
  },
  emergency_lantern: {
    id: 'emergency_lantern', name: 'Emergency Lantern', icon: '🪔',
    desc: 'Placed lantern that illuminates an area for 3 minutes.',
    rarity: RARITY.UNCOMMON, stackable: true, maxStack: 3,
    use(player, game) {
      if (game) game.placeLantern(player.x, player.y);
      return true;
    }
  },
  compass: {
    id: 'compass', name: 'Compass', icon: '🧭',
    desc: 'A rusted compass. The needle always points to the exit. Passive.',
    rarity: RARITY.RARE, stackable: false,
    passive: true,
    use(player) { return false; } // passive — no direct use
  },
  map_upgrade: {
    id: 'map_upgrade', name: 'Level Map', icon: '🗺️',
    desc: 'A partial map of this level. Reveals the exit and items on your minimap. Passive.',
    rarity: RARITY.RARE, stackable: false,
    passive: true,
    use(player) { return false; }
  },
  night_vision_goggles: {
    id: 'night_vision_goggles', name: 'Night Vision', icon: '🥽',
    desc: 'Boosts ambient light for 30 seconds. Invaluable in the dark levels.',
    rarity: RARITY.EPIC, stackable: true, maxStack: 2,
    use(player, game) {
      if (game) game.activateNightVision(30);
      return true;
    }
  },
  walkman: {
    id: 'walkman', name: 'Walkman', icon: '📻',
    desc: 'Static-y music player. Passively slows sanity drain by half.',
    rarity: RARITY.UNCOMMON, stackable: false,
    passive: true,
    use(player) { return false; }
  },
  vent_tool: {
    id: 'vent_tool', name: 'Vent Key', icon: '🔩',
    desc: 'Opens maintenance vents. Some vents are shortcuts to the exit.',
    rarity: RARITY.UNCOMMON, stackable: false,
    use(player, game) {
      if (game) game.tryOpenVent();
      return false;
    }
  },
};

export class WorldItem {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.collected = false;
    this.bobTime = Math.random() * Math.PI * 2; // offset bob animation
  }

  update(dt) {
    this.bobTime += dt * 1.5;
  }

  get def() { return ITEMS[this.type] || ITEMS.almond_water; }
}

export class Inventory {
  constructor(size = 24) {
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.hotbarSize = 5;
    this.selectedSlot = 0;
    this.equippedWeapon = null;
    this.swingTimer = 0;
    this.isSwinging = false;
  }

  add(type, count = 1) {
    const def = ITEMS[type];
    if (!def) return false;

    // Try to stack
    if (def.stackable) {
      for (let i = 0; i < this.size; i++) {
        const s = this.slots[i];
        if (s && s.type === type && s.count < (def.maxStack || 99)) {
          s.count = Math.min(def.maxStack || 99, s.count + count);
          return true;
        }
      }
    }
    // Find empty slot
    for (let i = 0; i < this.size; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { type, count };
        if (def.isWeapon && !this.equippedWeapon) this.equippedWeapon = type;
        return true;
      }
    }
    return false; // full
  }

  remove(slot, count = 1) {
    const s = this.slots[slot];
    if (!s) return false;
    s.count -= count;
    if (s.count <= 0) this.slots[slot] = null;
    return true;
  }

  use(slot, player, game) {
    const s = this.slots[slot];
    if (!s) return false;
    const def = ITEMS[s.type];
    if (!def) return false;

    if (def.isWeapon) {
      this.equipWeapon(s.type);
      return false;
    }

    const used = def.use(player, game);
    if (used) {
      this.remove(slot);
      return true;
    }
    return false;
  }

  equipWeapon(type) {
    this.equippedWeapon = type;
  }

  swing(player, entities, map) {
    if (this.isSwinging) return false;
    if (!this.equippedWeapon) return false;
    const def = ITEMS[this.equippedWeapon];
    if (!def || !def.isWeapon) return false;

    this.isSwinging = true;
    this.swingTimer = def.swingTime;

    // Hit check — entities within range in front of player
    const hitRange = 1.5;
    let hit = false;
    for (const e of entities) {
      if (!e.alive) continue;
      const dx = e.x - player.x, dy = e.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > hitRange) continue;
      // Check if entity is roughly in front of player
      const dot = dx / dist * player.dirX + dy / dist * player.dirY;
      if (dot < 0.3) continue; // behind player
      // Hit!
      const kbx = (dx / dist) * def.knockback;
      const kby = (dy / dist) * def.knockback;
      e.hit(kbx, kby);
      hit = true;
    }
    return hit;
  }

  update(dt) {
    if (this.isSwinging) {
      this.swingTimer -= dt;
      if (this.swingTimer <= 0) this.isSwinging = false;
    }
  }

  getHotbarSlots() { return this.slots.slice(0, this.hotbarSize); }
  getSelected() { return this.slots[this.selectedSlot]; }

  selectSlot(n) {
    this.selectedSlot = Math.max(0, Math.min(this.hotbarSize - 1, n));
  }

  get hasWeapon() { return !!this.equippedWeapon; }
  get weaponDef() { return this.equippedWeapon ? ITEMS[this.equippedWeapon] : null; }

  useSelected(player, game) {
    return this.use(this.selectedSlot, player, game);
  }

  swingSelected(player, entities, map) {
    return this.swing(player, entities, map);
  }
}
