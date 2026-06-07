// Disturbance system — tracks player noise/actions, drives entity activity
export class DisturbanceSystem {
  constructor() {
    this.level = 0;         // 0-1 global disturbance
    this.noiseEvents = [];  // {x, y, strength, timer}
    this.noiseDecay = 0.08; // per second decay of global level
    this.maxLevel = 1.0;

    // Per-action trackers
    this.sprintTime = 0;     // cumulative time sprinting
    this.combatCount = 0;    // number of melee swings
    this.longStayTimer = 0;  // time in same area

    this.lastPlayerX = -1;
    this.lastPlayerY = -1;
    this.sameTileTimer = 0;
    this.sameTileThreshold = 30; // seconds in same tile before penalty

    // Disturbance history for smooth level display
    this.displayLevel = 0;
  }

  addNoise(strength, x, y) {
    this.level = Math.min(this.maxLevel, this.level + strength * 0.4);
    this.noiseEvents.push({ x, y, strength, timer: 3.0 + strength * 2 });
  }

  addCombat() {
    this.combatCount++;
    this.addNoise(0.3, 0, 0);
  }

  update(dt, player, entities) {
    // Decay global level
    const decayRate = this._calcDecayRate(player);
    this.level = Math.max(0, this.level - decayRate * dt);

    // Sprint contributes to disturbance
    if (player.isSprinting && player.isMoving) {
      this.sprintTime += dt;
      this.level = Math.min(this.maxLevel, this.level + 0.006 * dt);
    } else {
      this.sprintTime = Math.max(0, this.sprintTime - dt * 0.5);
    }

    // Long stay in same area
    const px = Math.floor(player.x), py = Math.floor(player.y);
    if (px === this.lastPlayerX && py === this.lastPlayerY) {
      this.sameTileTimer += dt;
      if (this.sameTileTimer > this.sameTileThreshold) {
        this.level = Math.min(this.maxLevel, this.level + 0.002 * dt);
      }
    } else {
      this.lastPlayerX = px;
      this.lastPlayerY = py;
      this.sameTileTimer = 0;
    }

    // Update noise events
    this.noiseEvents = this.noiseEvents.filter(n => {
      n.timer -= dt;
      return n.timer > 0;
    });

    // Smooth display level
    this.displayLevel += (this.level - this.displayLevel) * Math.min(1, dt * 3);

    // Affect entity awareness
    for (const e of entities) {
      if (!e.alive) continue;
      // Entities become more alert as disturbance rises
      const alertBoost = this.level * 0.5;
      if (e.state === 'idle' && alertBoost > 0.3 && Math.random() < alertBoost * 0.01) {
        e.state = 'patrol';
      }
    }
  }

  _calcDecayRate(player) {
    // Slower decay when player is moving/sprinting
    if (player.isSprinting) return this.noiseDecay * 0.3;
    if (player.isMoving) return this.noiseDecay * 0.6;
    if (player.isCrouching) return this.noiseDecay * 1.5;
    if (player.isHiding) return this.noiseDecay * 3.0;
    return this.noiseDecay;
  }

  // Get noise strength at a given position (for entity awareness)
  getNoiseAt(x, y) {
    let maxNoise = this.level * 0.3;
    for (const n of this.noiseEvents) {
      const dx = n.x - x, dy = n.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = n.strength * 15;
      if (dist < radius) {
        const strength = n.strength * (1 - dist / radius) * (n.timer / 3.0);
        maxNoise = Math.max(maxNoise, strength);
      }
    }
    return Math.min(1, maxNoise);
  }

  // Disturbance categories
  get isCalm() { return this.level < 0.25; }
  get isTense() { return this.level >= 0.25 && this.level < 0.6; }
  get isDangerous() { return this.level >= 0.6; }
  get isCritical() { return this.level >= 0.85; }

  getLevelName() {
    if (this.level < 0.15) return 'CALM';
    if (this.level < 0.35) return 'UNEASY';
    if (this.level < 0.55) return 'TENSE';
    if (this.level < 0.75) return 'DANGER';
    return 'CRITICAL';
  }

  // Reset on level load
  reset() {
    this.level = 0;
    this.displayLevel = 0;
    this.noiseEvents = [];
    this.sprintTime = 0;
    this.combatCount = 0;
    this.sameTileTimer = 0;
    this.lastPlayerX = -1;
    this.lastPlayerY = -1;
  }
}
