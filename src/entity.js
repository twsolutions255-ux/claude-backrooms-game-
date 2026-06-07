// Entity AI — stalker and chaser behavior with pathfinding
const STATE = {
  IDLE: 'idle',
  PATROL: 'patrol',
  STALK: 'stalk',
  CHASE: 'chase',
  ATTACK: 'attack',
  LOST: 'lost',
};

export class Entity {
  constructor(x, y, type = 'stalker') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.state = STATE.IDLE;
    this.alive = true;

    this.speed = type === 'fast' ? 4.2 : 2.6;
    this.chaseSpeed = type === 'fast' ? 6.5 : 4.0;
    this.stalkSpeed = type === 'fast' ? 1.8 : 1.4;
    this.attackRange = 0.65;
    this.hearRange = type === 'fast' ? 20 : 14;
    this.sightRange = type === 'fast' ? 16 : 12;
    this.sightFOV = Math.PI * 0.65; // 117 degrees

    this.path = [];
    this.pathTimer = 0;
    this.pathInterval = 1.2; // recalculate path every N seconds

    this.target = null; // player reference
    this.lastKnownX = -1;
    this.lastKnownY = -1;
    this.lostTimer = 0;
    this.lostTimeout = 8; // seconds before giving up chase

    this.stateTimer = 0;
    this.idleTimer = 0;
    this.idleWaitMax = 3;

    // Stalk behavior — disappear around corners
    this.stalkDistance = 6 + Math.random() * 4;
    this.stalkTimer = 0;

    // Patrol waypoints
    this.patrolPoints = [];
    this.patrolIndex = 0;

    // For audio triggers
    this.lastSoundTimer = 0;
    this.soundInterval = 4 + Math.random() * 6;
    this.makingChaseSound = false;
    this.wasChasing = false;

    // Animation
    this.animTime = 0;
    this.stepPhase = 0;

    // Knockback / hit state
    this.hitTimer = 0;
    this.hitX = 0;
    this.hitY = 0;
  }

  hit(knockbackX, knockbackY) {
    this.hitTimer = 0.4;
    this.hitX = knockbackX;
    this.hitY = knockbackY;
    // Briefly switch to chase if not already
    if (this.state !== STATE.CHASE && this.state !== STATE.ATTACK) {
      this.state = STATE.CHASE;
      this.stateTimer = 0;
    }
  }

  update(dt, map, player, disturbance) {
    if (!this.alive) return;
    this.target = player;
    this.animTime += dt;
    this.stateTimer += dt;
    this.lastSoundTimer += dt;
    if (this.hitTimer > 0) this.hitTimer -= dt;

    // Calculate player distance and angle
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Check visibility
    const canSee = this._canSeePlayer(map, player, dist, angle);
    const canHear = dist < this.hearRange * (disturbance ? (1 + disturbance.level * 0.5) : 1);

    this._updateState(dt, map, player, dist, canSee, canHear, disturbance);
    this._moveAlongPath(dt, map);
    this._updateSounds(dt, dist);
  }

  _canSeePlayer(map, player, dist, angle) {
    if (dist > this.sightRange) return false;
    if (player.isHiding) return false;

    // FOV check
    const entityAngle = Math.atan2(this.y - player.y, this.x - player.x);
    const facing = Math.atan2(player.dirY, player.dirX);
    // Entity looks toward player — check entity's forward direction
    // Entity always "looks" toward player for simplicity in stalk mode
    // In chase mode, check properly
    if (this.state === STATE.IDLE || this.state === STATE.PATROL) {
      // Entity has random forward direction — use simple distance check
      return dist < this.sightRange * 0.5;
    }

    // Line of sight check
    return map.hasLineOfSight(this.x, this.y, player.x, player.y);
  }

  _updateState(dt, map, player, dist, canSee, canHear, disturbance) {
    switch (this.state) {
      case STATE.IDLE:
        this._stateIdle(dt, map, player, dist, canSee, canHear);
        break;
      case STATE.PATROL:
        this._statePatrol(dt, map, player, dist, canSee, canHear);
        break;
      case STATE.STALK:
        this._stateStalk(dt, map, player, dist, canSee, canHear);
        break;
      case STATE.CHASE:
        this._stateChase(dt, map, player, dist, canSee, canHear);
        break;
      case STATE.ATTACK:
        this._stateAttack(dt, player, dist);
        break;
      case STATE.LOST:
        this._stateLost(dt, map, player, canSee, canHear);
        break;
    }

    // Disturbance can wake idle/patrol entities
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
      // Set random patrol points
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
    const dx = target.x - this.x, dy = target.y - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.8) {
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
    if (canSee) {
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
      // If close enough, switch to chase
      if (dist < this.stalkDistance * 0.5 || this.stalkTimer > 6) {
        this.state = STATE.CHASE;
        this.stateTimer = 0;
        return;
      }
      // Maintain stalk distance — approach slowly
      if (dist > this.stalkDistance * 1.5) {
        this._recalcPath(map, player.x, player.y);
      } else if (dist < this.stalkDistance * 0.8) {
        // Back away slightly
        const ax = (this.x - player.x), ay = (this.y - player.y);
        const len = Math.sqrt(ax*ax + ay*ay) + 0.001;
        this.path = [{ x: this.x + ax/len * 2, y: this.y + ay/len * 2 }];
      }
    } else if (canHear) {
      this.lastKnownX = player.x;
      this.lastKnownY = player.y;
      this._recalcPath(map, player.x, player.y);
    } else {
      // Lost sight — go to last known
      if (this.lastKnownX >= 0) {
        this._recalcPath(map, this.lastKnownX, this.lastKnownY);
        const dlkx = this.lastKnownX - this.x, dlky = this.lastKnownY - this.y;
        if (Math.sqrt(dlkx*dlkx + dlky*dlky) < 1) {
          this.state = STATE.IDLE;
          this.lastKnownX = -1;
        }
      } else {
        this.state = STATE.IDLE;
      }
    }
  }

  _stateChase(dt, map, player, dist, canSee, canHear) {
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
      const dead = player.damage(20, 'entity');
      this.stateTimer = 0;
    }
  }

  _stateLost(dt, map, player, canSee, canHear) {
    this.lostTimer += dt;
    if (canSee || canHear) {
      this.state = STATE.CHASE;
      this.lostTimer = 0;
      return;
    }
    if (this.lostTimer > this.lostTimeout) {
      this.state = STATE.IDLE;
      this.lostTimer = 0;
    }
    // Move to last known
    if (this.lastKnownX >= 0) this._recalcPath(map, this.lastKnownX, this.lastKnownY);
  }

  _recalcPath(map, tx, ty) {
    this.pathTimer += 0.5; // force recalc soon
    if (this.pathTimer > this.pathInterval || this.path.length === 0) {
      this.path = map.findPath(this.x, this.y, tx, ty, 150);
      this.pathTimer = 0;
    }
  }

  _moveAlongPath(dt, map) {
    if (this.path.length === 0) return;

    let spd;
    if (this.state === STATE.CHASE || this.state === STATE.ATTACK) spd = this.chaseSpeed;
    else if (this.state === STATE.STALK) spd = this.stalkSpeed;
    else spd = this.speed;

    if (this.hitTimer > 0) {
      // Applying knockback (entity knocked back slightly by weapons)
      return;
    }

    const next = this.path[0];
    const dx = next.x - this.x, dy = next.y - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.15) { this.path.shift(); return; }
    const step = spd * dt;
    const mx = (dx / d) * step, my = (dy / d) * step;

    const nx = this.x + mx, ny = this.y + my;
    if (!map.isBlocked(nx, ny, 0.35)) {
      this.x = nx; this.y = ny;
      this.stepPhase += spd * dt * 2;
    } else {
      // Try to slide
      if (!map.isBlocked(nx, this.y, 0.35)) this.x = nx;
      if (!map.isBlocked(this.x, ny, 0.35)) this.y = ny;
      this.path = []; // force repath
    }
  }

  _genPatrolPoints(map) {
    const points = [];
    for (let i = 0; i < 4; i++) {
      const px2 = this.x + (Math.random() - 0.5) * 10;
      const py2 = this.y + (Math.random() - 0.5) * 10;
      const gx = Math.max(1, Math.min(map.w - 2, Math.floor(px2)));
      const gy = Math.max(1, Math.min(map.h - 2, Math.floor(py2)));
      if (!map.isSolid(gx, gy)) points.push({ x: gx + 0.5, y: gy + 0.5 });
    }
    return points.length > 0 ? points : [{ x: this.x, y: this.y }];
  }

  _updateSounds(dt, dist) {
    if (this.lastSoundTimer > this.soundInterval) {
      this.lastSoundTimer = 0;
      this.soundInterval = 3 + Math.random() * 8;
      // Signal game audio system
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

  distanceTo(x, y) {
    return Math.sqrt((this.x - x) ** 2 + (this.y - y) ** 2);
  }
}
