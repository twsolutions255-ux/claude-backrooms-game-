// Player controller — movement, stamina, sprint, head bob, camera shake
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.dirX = 1;
    this.dirY = 0;
    this.planeX = 0;
    this.planeY = 0.66; // FOV ~66 degrees

    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.sanity = 100;
    this.maxSanity = 100;

    this.speed = 3.0;
    this.sprintMult = 1.9;
    this.crouchMult = 0.5;
    this.isSprinting = false;
    this.isCrouching = false;
    this.isHiding = false; // in locker

    this.staminaDrainRate = 25;   // per second sprinting
    this.staminaRegenRate = 15;   // per second standing/walking
    this.staminaRegenDelay = 1.5; // seconds before regen starts
    this.staminaRegenTimer = 0;
    this.exhausted = false;

    // Head bob
    this.bobTime = 0;
    this.bobAmt = 0;
    this.bobTarget = 0;
    this.bobOffset = { x: 0, y: 0 };

    // Camera shake
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    // Velocity (for smooth movement)
    this.velX = 0;
    this.velY = 0;
    this.accel = 12;
    this.friction = 10;

    // Flashlight
    this.flashlightOn = true;
    this.flashlightBattery = 100; // 0-100
    this.flashlightDrainRate = 2; // per second

    // Damage state
    this.invincibleTimer = 0;
    this.damageFlash = 0;

    // Footstep sounds
    this.footstepTimer = 0;
    this.isMoving = false;

    // Crouch offset (camera height)
    this.cameraHeight = 0; // -0.3 when crouching
    this.cameraHeightTarget = 0;

    // Input state
    this.keys = {};
    this.mouseDX = 0;
    this.sensitivity = 0.002;

    this._setupInput();
  }

  _setupInput() {
    document.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'KeyF') this.toggleFlashlight();
      if (e.code === 'KeyC') this.toggleCrouch();
    });
    document.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.isSprinting = false;
      }
      if (e.code === 'KeyC') {
        this.isCrouching = false;
        this.cameraHeightTarget = 0;
      }
    });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement) {
        this.mouseDX += e.movementX;
      }
    });
  }

  toggleFlashlight() {
    if (this.flashlightBattery > 0) {
      this.flashlightOn = !this.flashlightOn;
    }
  }

  toggleCrouch() {
    this.isCrouching = !this.isCrouching;
    this.cameraHeightTarget = this.isCrouching ? -0.3 : 0;
  }

  damage(amount, reason = '') {
    if (this.invincibleTimer > 0) return;
    this.health = Math.max(0, this.health - amount);
    this.damageFlash = 1;
    this.invincibleTimer = 0.8;
    this.shake(0.4, amount * 0.02);
    return this.health <= 0;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  restoreSanity(amount) {
    this.sanity = Math.min(this.maxSanity, this.sanity + amount);
  }

  loseSanity(amount) {
    this.sanity = Math.max(0, this.sanity - amount);
  }

  shake(duration, intensity) {
    if (intensity > this.shakeIntensity) {
      this.shakeTime = duration;
      this.shakeIntensity = intensity;
    }
  }

  rotate(angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const oldDirX = this.dirX;
    this.dirX = this.dirX * cos - this.dirY * sin;
    this.dirY = oldDirX * sin + this.dirY * cos;
    const oldPlaneX = this.planeX;
    this.planeX = this.planeX * cos - this.planeY * sin;
    this.planeY = oldPlaneX * sin + this.planeY * cos;
  }

  update(dt, map, disturbance) {
    if (this.isHiding) {
      this._updateHiding(dt);
      return;
    }

    this._handleRotation(dt);
    this._handleMovement(dt, map);
    this._updateStamina(dt);
    this._updateFlashlight(dt);
    this._updateBob(dt);
    this._updateShake(dt);
    this._updateCameraHeight(dt);

    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 3);

    // Sanity drain in dark
    if (!this.flashlightOn || this.flashlightBattery <= 0) {
      this.sanity = Math.max(0, this.sanity - dt * 3);
    } else {
      this.sanity = Math.min(this.maxSanity, this.sanity + dt * 1);
    }

    // Footstep tracking
    const spd = Math.sqrt(this.velX ** 2 + this.velY ** 2);
    this.isMoving = spd > 0.3;
    if (this.isMoving) {
      const footstepInterval = this.isSprinting ? 0.32 : 0.52;
      this.footstepTimer += dt;
      if (this.footstepTimer >= footstepInterval) {
        this.footstepTimer = 0;
        this._onFootstep(disturbance);
      }
    } else {
      this.footstepTimer = 0;
    }
  }

  _onFootstep(disturbance) {
    if (disturbance) {
      const noise = this.isSprinting ? 0.15 : (this.isCrouching ? 0.02 : 0.06);
      disturbance.addNoise(noise, this.x, this.y);
    }
    // Signal for audio
    this._lastFootstep = { sprint: this.isSprinting, crouch: this.isCrouching, time: Date.now() };
  }

  _handleRotation(dt) {
    // Mouse look
    const rot = this.mouseDX * this.sensitivity;
    if (Math.abs(rot) > 0.0001) this.rotate(-rot);
    this.mouseDX = 0;

    // Keyboard turn (also supported)
    const turnSpd = 2.0 * dt;
    if (this.keys['ArrowLeft']) this.rotate(turnSpd);
    if (this.keys['ArrowRight']) this.rotate(-turnSpd);
  }

  _handleMovement(dt, map) {
    const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.exhausted && !this.isCrouching;
    this.isSprinting = sprinting && this.stamina > 0;

    const speedMult = this.isSprinting ? this.sprintMult : (this.isCrouching ? this.crouchMult : 1);
    const spd = this.speed * speedMult;

    let targetVX = 0, targetVY = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) { targetVX += this.dirX * spd; targetVY += this.dirY * spd; }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) { targetVX -= this.dirX * spd; targetVY -= this.dirY * spd; }
    if (this.keys['KeyA']) { targetVX += this.dirY * spd; targetVY -= this.dirX * spd; }
    if (this.keys['KeyD']) { targetVX -= this.dirY * spd; targetVY += this.dirX * spd; }

    // Smooth acceleration
    const acc = this.accel * dt;
    const fric = this.friction * dt;
    this.velX += (targetVX - this.velX) * Math.min(1, acc);
    this.velY += (targetVY - this.velY) * Math.min(1, acc);
    if (targetVX === 0 && targetVY === 0) {
      const decel = Math.min(1, fric);
      this.velX *= (1 - decel);
      this.velY *= (1 - decel);
    }

    // Collision detection (slide along walls)
    const nx = this.x + this.velX * dt;
    const ny = this.y + this.velY * dt;
    const r = 0.3;
    if (!map.isBlocked(nx, this.y, r)) this.x = nx;
    else this.velX = 0;
    if (!map.isBlocked(this.x, ny, r)) this.y = ny;
    else this.velY = 0;
  }

  _updateStamina(dt) {
    if (this.isSprinting && this.isMoving) {
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * dt);
      this.staminaRegenTimer = 0;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.staminaRegenTimer += dt;
      if (this.staminaRegenTimer >= this.staminaRegenDelay) {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * dt);
        if (this.stamina >= 30) this.exhausted = false;
      }
    }
  }

  _updateFlashlight(dt) {
    if (this.flashlightOn && this.flashlightBattery > 0) {
      this.flashlightBattery = Math.max(0, this.flashlightBattery - this.flashlightDrainRate * dt);
      if (this.flashlightBattery <= 0) {
        this.flashlightOn = false;
        this._onFlashlightDead = true;
      }
    }
  }

  _updateBob(dt) {
    const moving = this.isMoving;
    const spd = this.isSprinting ? 1.8 : (this.isCrouching ? 0.6 : 1.0);
    this.bobTarget = moving ? spd : 0;
    this.bobAmt += (this.bobTarget - this.bobAmt) * Math.min(1, dt * 6);

    if (this.bobAmt > 0.01) {
      this.bobTime += dt * 5 * (this.isSprinting ? 1.5 : 1);
      this.bobOffset.x = Math.sin(this.bobTime) * 0.015 * this.bobAmt;
      this.bobOffset.y = Math.abs(Math.cos(this.bobTime)) * 0.02 * this.bobAmt;
    } else {
      this.bobOffset.x *= 0.9;
      this.bobOffset.y *= 0.9;
    }
  }

  _updateShake(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const t = this.shakeTime;
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * t;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * t;
      if (this.shakeTime <= 0) { this.shakeX = 0; this.shakeY = 0; this.shakeIntensity = 0; }
    }
  }

  _updateCameraHeight(dt) {
    this.cameraHeight += (this.cameraHeightTarget - this.cameraHeight) * Math.min(1, dt * 8);
  }

  _updateHiding(dt) {
    // Minimal update when hiding
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 3);
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * dt * 0.5);
  }

  // For save room restore
  restoreAll() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.sanity = this.maxSanity;
    this.exhausted = false;
  }

  get angle() { return Math.atan2(this.dirY, this.dirX); }

  // Get disturbance contribution from player actions
  getNoiseLevel() {
    if (this.isHiding) return 0;
    if (this.isSprinting && this.isMoving) return 1.0;
    if (this.isMoving && !this.isCrouching) return 0.4;
    if (this.isMoving && this.isCrouching) return 0.1;
    return 0;
  }
}
