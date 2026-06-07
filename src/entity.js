// Entity AI — stalker, hound, smiler, faceling, partygoer, deathmoth
const STATE = {
  IDLE: 'idle',
  PATROL: 'patrol',
  STALK: 'stalk',
  CHASE: 'chase',
  ATTACK: 'attack',
  LOST: 'lost',
  RETREAT: 'retreat',  // hound stare retreat
  DORMANT: 'dormant',  // smiler in light
};

export class Entity {
  constructor(x, y, type = 'stalker') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.state = STATE.IDLE;
    this.alive = true;

    // Base stats (overridden by _configureType)
    this.speed = 2.6;
    this.chaseSpeed = 4.0;
    this.stalkSpeed = 1.4;
    this.attackRange = 0.65;
    this.hearRange = 14;
    this.sightRange = 12;
    this.sightFOV = Math.PI * 0.65;

    // Behavior flags
    this.passive = false;          // faceling 75% passive
    this.requiresDarkness = false; // smiler
    this.alertGroup = false;       // partygoer collective
    this.attractFlashlight = false; // deathmoth
    this.erratic = false;           // deathmoth

    this._configureType(type);

    // Path following
    this.path = [];
    this.pathTimer = 0;
    this.pathInterval = 1.2;

    // Target tracking
    this.target = null;
    this.lastKnownX = -1;
    this.lastKnownY = -1;
    this.lostTimer = 0;
    this.lostTimeout = 8;

    // State timing
    this.stateTimer = 0;
    this.idleTimer = 0;
    this.idleWaitMax = 3;
    this.stalkDistance = 6 + Math.random() * 4;
    this.stalkTimer = 0;

    // Patrol
    this.patrolPoints = [];
    this.patrolIndex = 0;

    // Audio
    this.lastSoundTimer = 0;
    this.soundInterval = 4 + Math.random() * 6;
    this.makingChaseSound = false;
    this.wasChasing = false;
    this._pendingSound = null;

    // Animation
    this.animTime = 0;
    this.stepPhase = 0;

    // Hit state
    this.hitTimer = 0;
    this.hitX = 0;
    this.hitY = 0;

    // Hound stare mechanic
    this.stareTimer = 0;
    this.stareRetreatTimer = 0;

    // Partygoer collective alert
    this._pendingGroupAlert = false;
    this._pendingPartyMusicCut = false;
    this._alreadyAlerting = false;

    // Deathmoth erratic movement
    this._erraticTimer = 0;
    this._erraticDx = 0;
    this._erraticDy = 0;
  }

  _configureType(type) {
    switch (type) {
      case 'smiler':
        this.speed = 0;
        this.chaseSpeed = 20;
        this.stalkSpeed = 0;
        this.attackRange = 1.0;
        this.hearRange = 0;
        this.sightRange = 9;
        this.requiresDarkness = true;
        this.lostTimeout = 1;
        this.sightFOV = Math.PI;
        break;
      case 'hound':
        this.speed = 3.5;
        this.chaseSpeed = 5.2;
        this.stalkSpeed = 2.0;
        this.attackRange = 0.8;
        this.hearRange = 20;
        this.sightRange = 15;
        this.sightFOV = Math.PI * 0.55;
        break;
      case 'faceling':
        this.speed = 2.2;
        this.chaseSpeed = 3.8;
        this.stalkSpeed = 1.5;
        this.attackRange = 0.7;
        this.hearRange = 8;
        this.sightRange = 8;
        this.passive = Math.random() < 0.75;
        break;
      case 'partygoer':
        this.speed = 2.5;
        this.chaseSpeed = 5.8;
        this.stalkSpeed = 1.5;
        this.attackRange = 0.8;
        this.hearRange = 10;
        this.sightRange = 8;
        this.alertGroup = true;
        this.lostTimeout = 14;
        this.stalkDistance = 4;
        break;
      case 'deathmoth':
        this.speed = 3.2;
        this.chaseSpeed = 4.8;
        this.stalkSpeed = 2.0;
        this.attackRange = 0.6;
        this.hearRange = 0;
        this.sightRange = 5;
        this.attractFlashlight = true;
        this.erratic = true;
        this.sightFOV = Math.PI * 0.5;
        break;
      case 'fast':
        this.speed = 4.2;
        this.chaseSpeed = 6.5;
        this.stalkSpeed = 1.8;
        this.attackRange = 0.65;
        this.hearRange = 20;
        this.sightRange = 16;
        break;
      default: // stalker
        this.speed = 2.6;
        this.chaseSpeed = 4.0;
        this.stalkSpeed = 1.4;
        this.attackRange = 0.65;
        this.hearRange = 14;
        this.sightRange = 12;
        break;
    }
  }

  // Called by game.js when player is aiming at this entity — hound retreats
  notifyStared(dt) {
    if (this.type !== 'hound') return;
    this.stareTimer += dt;
    if (this.stareTimer >= 1.0 && (this.state === STATE.CHASE || this.state === STATE.STALK)) {
      this.stareRetreatTimer = 3.5;
      this.state = STATE.RETREAT;
      this.stareTimer = 0;
      this.path = [];
    }
  }

  hit(knockbackX, knockbackY) {
    this.hitTimer = 0.4;
    this.hitX = knockbackX;
    this.hitY = knockbackY;
    if (this.state !== STATE.CHASE && this.state !== STATE.ATTACK) {
      this.state = STATE.CHASE;
      this.stateTimer = 0;
    }
  }

  // context: { lightLevel, playerFlashlight }
  update(dt, map, player, disturbance, context = {}) {
    if (!this.alive) return;
    this.target = player;
    this.animTime += dt;
    this.stateTimer += dt;
    this.lastSoundTimer += dt;
    if (this.hitTimer > 0) this.hitTimer -= dt;

    const lightLevel = context.lightLevel ?? 1.0;
    const playerFlashlight = context.playerFlashlight ?? true;

    // ── SMILER: dormant in light, active in darkness ───────────────────────
    if (this.requiresDarkness) {
      const isDark = lightLevel < 0.18;
      if (!isDark) {
        if (this.state !== STATE.DORMANT) { this.state = STATE.DORMANT; this.path = []; this.stateTimer = 0; }
      } else if (this.state === STATE.DORMANT) {
        this.state = STATE.IDLE;
      }
      if (this.state === STATE.DORMANT) return;
    }

    // ── FACELING PASSIVE: wander and ignore player ─────────────────────────
    if (this.type === 'faceling' && this.passive) {
      this._updatePassiveFaceling(dt, map);
      this._updateSounds(dt, Math.hypot(player.x - this.x, player.y - this.y));
      return;
    }

    // ── DEATHMOTH: attracted toward flashlight beam ────────────────────────
    if (this.attractFlashlight && playerFlashlight) {
      const dist2 = Math.hypot(player.x - this.x, player.y - this.y);
      if ((this.state === STATE.IDLE || this.state === STATE.PATROL) && dist2 < 16) {
        this.state = STATE.STALK;
        this.stateTimer = 0;
      }
    }

    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const canSee = this._canSeePlayer(map, player, dist, angle);
    const canHear = dist < this.hearRange * (disturbance ? (1 + disturbance.level * 0.5) : 1);

    // ── HOUND RETREAT ──────────────────────────────────────────────────────
    if (this.state === STATE.RETREAT) {
      this._stateRetreat(dt, map, player);
      this._moveAlongPath(dt, map);
      this._updateSounds(dt, dist);
      return;
    }

    this._updateState(dt, map, player, dist, canSee, canHear, disturbance);
    this._moveAlongPath(dt, map);
    this._updateSounds(dt, dist);
  }

  _updatePassiveFaceling(dt, map) {
    this.idleTimer += dt;
    if (this.idleTimer > this.idleWaitMax * 2 || this.path.length === 0) {
      this.idleTimer = 0;
      this.patrolPoints = this._genPatrolPoints(map);
      this.patrolIndex = 0;
    }
    if (this.patrolPoints.length > 0) {
      const target = this.patrolPoints[this.patrolIndex % this.patrolPoints.length];
      this.pathTimer += dt;
      if (this.pathTimer > this.pathInterval || this.path.length === 0) {
        this.path = map.findPath(this.x, this.y, target.x, target.y);
        this.pathTimer = 0;
      }
      const tdx = target.x - this.x, tdy = target.y - this.y;
      if (Math.sqrt(tdx * tdx + tdy * tdy) < 0.8) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        this.path = [];
      }
      this._moveAlongPath(dt, map, this.speed * 0.7);
    }
  }

  _stateRetreat(dt, map, player) {
    this.stareRetreatTimer -= dt;
    if (this.stareRetreatTimer <= 0) {
      this.state = STATE.STALK;
      this.stateTimer = 0;
      this.stareTimer = 0;
      return;
    }
    const rdx = this.x - player.x, rdy = this.y - player.y;
    const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
    if (rdist < 0.5) return;
    const tx = this.x + (rdx / rdist) * 6;
    const ty = this.y + (rdy / rdist) * 6;
    const mx = Math.max(1, Math.min(map.w - 2, Math.floor(tx)));
    const my = Math.max(1, Math.min(map.h - 2, Math.floor(ty)));
    if (!map.isSolid(mx, my)) {
      this.pathTimer = this.pathInterval;
      this._recalcPath(map, mx + 0.5, my + 0.5);
    }
  }

  _canSeePlayer(map, player, dist, angle) {
    if (dist > this.sightRange) return false;
    if (player.isHiding) return false;
    if (this.state === STATE.IDLE || this.state === STATE.PATROL) {
      return dist < this.sightRange * 0.5;
    }
    return map.hasLineOfSight(this.x, this.y, player.x, player.y);
  }

  _updateState(dt, map, player, dist, canSee, canHear, disturbance) {
    switch (this.state) {
      case STATE.IDLE:   this._stateIdle(dt, map, player, dist, canSee, canHear); break;
      case STATE.PATROL: this._statePatrol(dt, map, player, dist, canSee, canHear); break;
      case STATE.STALK:  this._stateStalk(dt, map, player, dist, canSee, canHear); break;
      case STATE.CHASE:  this._stateChase(dt, map, player, dist, canSee, canHear); break;
      case STATE.ATTACK: this._stateAttack(dt, player, dist); break;
      case STATE.LOST:   this._stateLost(dt, map, player, canSee, canHear); break;
    }

    if (disturbance && (this.state === STATE.IDLE || this.state === STATE.PATROL)) {
      const noiseAt = disturbance.getNoiseAt(this.x, this.y);
      if (noiseAt > 0.3) {
        this.state = STATE.STALK;
        this.stateTimer = 0;
        this.lastKnownX = player.x;
        this.lastKnownY = player.y;
      }
    }
  }

  _stateIdle(dt, map, player, dist, canSee, canHear) {
    this.idleTimer += dt;
    if (this.idleTimer > this.idleWaitMax) {
      this.idleTimer = 0;
      this.patrolPoints = this._genPatrolPoints(map);
      this.patrolIndex = 0;
      this.state = STATE.PATROL;
    }
    if (canSee) { this.state = STATE.STALK; this.stateTimer = 0; }
    else if (canHear && dist < this.hearRange * 0.5) {
      this.state = STATE.STALK;
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
    }
  }

  _statePatrol(dt, map, player, dist, canSee, canHear) {
    if (canSee) { this.state = STATE.STALK; this.stateTimer = 0; return; }
    if (canHear && dist < this.hearRange * 0.6) {
      this.state = STATE.STALK;
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
      return;
    }
    if (this.patrolPoints.length === 0) { this.state = STATE.IDLE; return; }
    const target = this.patrolPoints[this.patrolIndex];
    const pdx = target.x - this.x, pdy = target.y - this.y;
    if (Math.sqrt(pdx * pdx + pdy * pdy) < 0.8) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      this.path = [];
    }
    this.pathTimer += dt;
    if (this.pathTimer > this.pathInterval || this.path.length === 0) {
      this.path = map.findPath(this.x, this.y, target.x, target.y);
      this.pathTimer = 0;
    }
  }

  _stateStalk(dt, map, player, dist, canSee, canHear) {
    this.stalkTimer += dt;
    const triggerDist = this.type === 'partygoer' ? this.stalkDistance * 0.4 : this.stalkDistance * 0.5;
    const triggerTime = this.type === 'partygoer' ? 2 : 6;

    if (canSee) {
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
      if (dist < triggerDist || this.stalkTimer > triggerTime) {
        this.state = STATE.CHASE;
        this.stateTimer = 0;
        return;
      }
      if (dist > this.stalkDistance * 1.5) this._recalcPath(map, player.x, player.y);
      else if (dist < this.stalkDistance * 0.8) {
        const ax = this.x - player.x, ay = this.y - player.y;
        const len = Math.sqrt(ax * ax + ay * ay) + 0.001;
        this.path = [{ x: this.x + ax / len * 2, y: this.y + ay / len * 2 }];
      }
    } else if (canHear) {
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
      this._recalcPath(map, player.x, player.y);
    } else {
      if (this.lastKnownX >= 0) {
        this._recalcPath(map, this.lastKnownX, this.lastKnownY);
        const dlx = this.lastKnownX - this.x, dly = this.lastKnownY - this.y;
        if (Math.sqrt(dlx * dlx + dly * dly) < 1) {
          this.state = STATE.IDLE;
          this.lastKnownX = -1;
        }
      } else {
        this.state = STATE.IDLE;
      }
    }
  }

  _stateChase(dt, map, player, dist, canSee, canHear) {
    // Partygoer: trigger group alert and music cut on first chase
    if (this.type === 'partygoer' && !this._alreadyAlerting) {
      this._alreadyAlerting = true;
      this._pendingGroupAlert = true;
      this._pendingPartyMusicCut = true;
    }

    if (canSee) {
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
      this.lostTimer = 0;
    } else {
      this.lostTimer += dt;
      if (this.lostTimer > this.lostTimeout) {
        this.state = STATE.STALK;
        this.stateTimer = 0;
        this.lostTimer = 0;
        this._alreadyAlerting = false;
        return;
      }
    }
    if (dist <= this.attackRange) {
      this.state = STATE.ATTACK;
      this.stateTimer = 0;
      return;
    }
    this._recalcPath(map, player.x, player.y);
  }

  _stateAttack(dt, player, dist) {
    if (dist > this.attackRange * 1.5) {
      this.state = STATE.CHASE;
      return;
    }
    if (this.stateTimer > 0.4) {
      player.damage(20, 'entity');
      this.stateTimer = 0;
    }
  }

  _stateLost(dt, map, player, canSee, canHear) {
    this.lostTimer += dt;
    if (canSee || canHear) { this.state = STATE.CHASE; this.lostTimer = 0; return; }
    if (this.lostTimer > this.lostTimeout) { this.state = STATE.IDLE; this.lostTimer = 0; }
    if (this.lastKnownX >= 0) this._recalcPath(map, this.lastKnownX, this.lastKnownY);
  }

  _recalcPath(map, tx, ty) {
    this.pathTimer += 0.5;
    if (this.pathTimer > this.pathInterval || this.path.length === 0) {
      this.path = map.findPath(this.x, this.y, tx, ty, 150);
      this.pathTimer = 0;
    }
  }

  _moveAlongPath(dt, map, overrideSpeed) {
    if (this.path.length === 0 || !map) return;

    const spd = overrideSpeed ?? (
      this.state === STATE.CHASE || this.state === STATE.ATTACK ? this.chaseSpeed :
      this.state === STATE.STALK || this.state === STATE.RETREAT ? this.stalkSpeed :
      this.speed
    );

    if (this.hitTimer > 0) return;

    // Deathmoth: erratic movement overlay
    if (this.erratic) {
      this._erraticTimer -= dt;
      if (this._erraticTimer <= 0) {
        this._erraticTimer = 0.25 + Math.random() * 0.35;
        this._erraticDx = (Math.random() - 0.5) * 2;
        this._erraticDy = (Math.random() - 0.5) * 2;
      }
    }

    const next = this.path[0];
    let ndx = next.x - this.x, ndy = next.y - this.y;
    if (this.erratic) { ndx += this._erraticDx * 0.4; ndy += this._erraticDy * 0.4; }
    const d = Math.sqrt(ndx * ndx + ndy * ndy);
    if (d < 0.15) { this.path.shift(); return; }
    const step = spd * dt;
    const mx2 = (ndx / d) * step, my2 = (ndy / d) * step;
    const nx = this.x + mx2, ny = this.y + my2;
    if (!map.isBlocked(nx, ny, 0.35)) {
      this.x = nx; this.y = ny;
      this.stepPhase += spd * dt * 2;
    } else {
      if (!map.isBlocked(nx, this.y, 0.35)) this.x = nx;
      if (!map.isBlocked(this.x, ny, 0.35)) this.y = ny;
      this.path = [];
    }
  }

  _genPatrolPoints(map) {
    const points = [];
    for (let i = 0; i < 4; i++) {
      const px = this.x + (Math.random() - 0.5) * 10;
      const py = this.y + (Math.random() - 0.5) * 10;
      const gx = Math.max(1, Math.min(map.w - 2, Math.floor(px)));
      const gy = Math.max(1, Math.min(map.h - 2, Math.floor(py)));
      if (!map.isSolid(gx, gy)) points.push({ x: gx + 0.5, y: gy + 0.5 });
    }
    return points.length > 0 ? points : [{ x: this.x, y: this.y }];
  }

  _updateSounds(dt, dist) {
    if (this.lastSoundTimer > this.soundInterval) {
      this.lastSoundTimer = 0;
      this.soundInterval = 3 + Math.random() * 8;
      if (this.state === STATE.CHASE || this.state === STATE.STALK) {
        this._pendingSound = dist < 12 ? 'entity_near' : 'entity_distant';
      } else if (this.state === STATE.PATROL && dist < 20) {
        this._pendingSound = Math.random() < 0.3 ? 'entity_distant' : null;
      }
    }
    this.makingChaseSound = this.state === STATE.CHASE;
    this.wasChasing = this.makingChaseSound;
  }

  isChasing() { return this.state === STATE.CHASE || this.state === STATE.ATTACK; }
  isStalking() { return this.state === STATE.STALK; }
  isDormant() { return this.state === STATE.DORMANT; }

  distanceTo(x, y) { return Math.sqrt((this.x - x) ** 2 + (this.y - y) ** 2); }
}
