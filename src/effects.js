// Post-processing effects — VHS grain, chromatic aberration, damage flash, corruption
export class EffectsSystem {
  constructor(vhsCanvas) {
    this.canvas = vhsCanvas;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = vhsCanvas.getContext('2d');
    this.enabled = true;

    // Effect states
    this.grain = 0.4;
    this.chromaticAberration = 0;
    this.tapeFlicker = 0;
    this.scanlineOpacity = 0.08;
    this.corruptionLevel = 0;
    this.damageFlash = 0;
    this.flashbangTimer = 0;
    this.vignetteStrength = 0.4;
    this.pulseTimer = 0;
    this.breathTimer = 0;

    // Sanity effects
    this.sanityDistort = 0;
    this.sanityFlicker = 0;

    // Chase effects
    this.chaseIntensity = 0;

    // Blackout (power outage)
    this.blackoutLevel = 0;

    // Exit proximity pulse (0-1)
    this.exitProximity = 0;

    // Heartbeat visual
    this.heartbeatActive = false;
    this.heartbeatBPM = 80;
    this.heartbeatPhase = 0;

    this._grainBuf = null;
    this._grainFrame = 0;
    this._grainData = [];
    this._pregenGrain();

    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
  }

  _pregenGrain() {
    // Pre-generate several frames of grain for variation
    for (let f = 0; f < 4; f++) {
      const w = 640, h = 360;
      const buf = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const v = Math.random() * 255;
        buf[i*4] = v; buf[i*4+1] = v; buf[i*4+2] = v;
        buf[i*4+3] = Math.random() < 0.1 ? 180 : 0;
      }
      this._grainData.push(buf);
    }
  }

  update(dt, player, events, renderer) {
    if (!this.enabled) return;

    // Damage flash from player
    if (player) {
      this.damageFlash = player.damageFlash || 0;
    }

    // Sanity effects
    if (player) {
      const sanityFrac = player.sanity / player.maxSanity;
      this.sanityDistort = Math.max(0, (0.4 - sanityFrac) * 2.5);
      this.sanityFlicker = Math.max(0, (0.3 - sanityFrac) * 3);
    }

    // Event-driven effects
    if (events) {
      this.corruptionLevel = events.corruptionLevel || 0;
      if (events.flickerIntensity > 0) {
        this.tapeFlicker = Math.max(this.tapeFlicker, events.flickerIntensity * 0.3);
      }
    }

    // Chase effects — decay smoothly when chase ends
    if (renderer) {
      if (renderer.emergencyMode) {
        this.chaseIntensity = Math.min(1.0, this.chaseIntensity + dt * 3);
      } else {
        this.chaseIntensity = Math.max(0, this.chaseIntensity - dt * 2);
      }
    }

    // Heartbeat visual phase
    if (this.heartbeatActive) {
      const bps = this.heartbeatBPM / 60;
      this.heartbeatPhase = (this.heartbeatPhase + dt * bps * Math.PI * 2) % (Math.PI * 2);
    }

    // Decay effects
    this.chromaticAberration = Math.max(0, this.chromaticAberration - dt * 2);
    this.tapeFlicker = Math.max(0, this.tapeFlicker - dt * 1.5);
    if (this.flashbangTimer > 0) this.flashbangTimer = Math.max(0, this.flashbangTimer - dt);
    this.pulseTimer += dt;
    this.breathTimer += dt;

    // Sanity-based chromatic aberration
    if (this.sanityDistort > 0) {
      this.chromaticAberration = Math.max(this.chromaticAberration, this.sanityDistort * 0.5);
    }

    // Corruption adds chromatic aberration
    if (this.corruptionLevel > 0.3) {
      this.chromaticAberration = Math.max(this.chromaticAberration, this.corruptionLevel * 0.8);
    }

    this._grainFrame = (this._grainFrame + 1) % this._grainData.length;
  }

  render(gameCtx) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── SCANLINES ──────────────────────────────────────────────────────────
    if (this.scanlineOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = this.scanlineOpacity + this.chaseIntensity * 0.04;
      for (let y = 0; y < H; y += 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, y, W, 1);
      }
      ctx.restore();
    }

    // ── VHS GRAIN ──────────────────────────────────────────────────────────
    if (this.grain > 0.05) {
      const grainAmt = this.grain + this.corruptionLevel * 0.3 + this.chaseIntensity * 0.1;
      ctx.save();
      ctx.globalAlpha = grainAmt * 0.35;
      ctx.globalCompositeOperation = 'screen';
      // Draw random dots quickly
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const dots = Math.floor(W * H * 0.008 * grainAmt);
      for (let i = 0; i < dots; i++) {
        ctx.fillRect(
          Math.random() * W | 0,
          Math.random() * H | 0,
          Math.random() < 0.7 ? 1 : 2,
          1
        );
      }
      ctx.restore();
    }

    // ── TAPE FLICKER (horizontal lines) ────────────────────────────────────
    if (this.tapeFlicker > 0.1 || (this.corruptionLevel > 0.4 && Math.random() < 0.3)) {
      const numLines = Math.floor(3 * (this.tapeFlicker + this.corruptionLevel));
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.globalCompositeOperation = 'difference';
      for (let i = 0; i < numLines; i++) {
        const y = Math.random() * H;
        const h = Math.random() < 0.7 ? 1 : (1 + Math.random() * 3);
        ctx.fillStyle = `rgba(${Math.random()*100+155},${Math.random()*80},${Math.random()*80},0.4)`;
        ctx.fillRect(0, y, W, h);
      }
      ctx.restore();
    }

    // ── DAMAGE FLASH ───────────────────────────────────────────────────────
    if (this.damageFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.damageFlash * 0.45;
      const grad = ctx.createRadialGradient(W/2, H/2, H*0.1, W/2, H/2, H*0.7);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, 'rgba(255,0,0,1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── FLASHBANG ─────────────────────────────────────────────────────────
    if (this.flashbangTimer > 0) {
      ctx.save();
      const alpha = Math.min(1, this.flashbangTimer * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── CHROMATIC ABERRATION ──────────────────────────────────────────────
    if (this.chromaticAberration > 0.1 && gameCtx) {
      const shift = Math.floor(this.chromaticAberration * 8);
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(gameCtx.canvas, shift, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'hue-rotate(120deg)';
      ctx.drawImage(gameCtx.canvas, -shift, 0, W, H);
      ctx.restore();
    }

    // ── CORRUPTION DISTORTION ─────────────────────────────────────────────
    if (this.corruptionLevel > 0.5) {
      const lines = Math.floor(this.corruptionLevel * 6);
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.globalCompositeOperation = 'difference';
      for (let i = 0; i < lines; i++) {
        const y = (Math.random() * H) | 0;
        const shift2 = (Math.random() - 0.5) * 20 * this.corruptionLevel;
        ctx.drawImage(gameCtx ? gameCtx.canvas : this.canvas, shift2, y, W, 2, 0, y, W, 2);
      }
      ctx.restore();
    }

    // ── VIGNETTE ──────────────────────────────────────────────────────────
    {
      const vStrength = this.vignetteStrength + this.chaseIntensity * 0.3 + this.sanityDistort * 0.4;
      ctx.save();
      ctx.globalAlpha = vStrength * 0.7;
      const grad2 = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.75);
      grad2.addColorStop(0, 'transparent');
      grad2.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── LOW SANITY DARKNESS PULSE ─────────────────────────────────────────
    if (this.sanityFlicker > 0) {
      const pulse = Math.sin(this.pulseTimer * 3) * 0.5 + 0.5;
      ctx.save();
      ctx.globalAlpha = this.sanityFlicker * 0.4 * pulse;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── EMERGENCY RED OVERLAY ─────────────────────────────────────────────
    if (this.chaseIntensity > 0.05) {
      const redPulse = (Math.sin(this.pulseTimer * 2) * 0.5 + 0.5) * 0.3;
      ctx.save();
      ctx.globalAlpha = Math.max(0, (this.chaseIntensity - 0.05) * 0.18 + redPulse * this.chaseIntensity * 0.1);
      ctx.fillStyle = '#f00';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── HEARTBEAT VIGNETTE PULSE ──────────────────────────────────────────
    if (this.heartbeatActive && this.chaseIntensity > 0.1) {
      const beat = Math.max(0, Math.sin(this.heartbeatPhase) * 0.6 + 0.4);
      ctx.save();
      ctx.globalAlpha = beat * 0.12 * this.chaseIntensity;
      const hbGrad = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.8);
      hbGrad.addColorStop(0, 'transparent');
      hbGrad.addColorStop(1, 'rgba(180,0,0,1)');
      ctx.fillStyle = hbGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── BLACKOUT OVERLAY ──────────────────────────────────────────────────
    if (this.blackoutLevel > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.blackoutLevel);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── EXIT PROXIMITY EDGE PULSE ─────────────────────────────────────────
    if (this.exitProximity > 0.05) {
      const pulse = (Math.sin(this.pulseTimer * 3.5) * 0.5 + 0.5);
      ctx.save();
      ctx.globalAlpha = this.exitProximity * 0.35 * (0.5 + pulse * 0.5);
      const exitGrad = ctx.createRadialGradient(W/2, H/2, H * 0.3, W/2, H/2, H * 0.85);
      exitGrad.addColorStop(0, 'transparent');
      exitGrad.addColorStop(1, 'rgba(0,200,80,0.8)');
      ctx.fillStyle = exitGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // ── BREATHING EFFECT (subtle camera pulse) ─────────────────────────────
    // Applied as scale on game canvas via CSS transform externally
  }

  triggerFlashbang() {
    this.flashbangTimer = 1.2;
    this.chromaticAberration = 2.0;
  }

  triggerDamageFlash(intensity = 1) {
    this.damageFlash = Math.min(1, this.damageFlash + intensity);
  }

  triggerCorruption(amount) {
    this.corruptionLevel = Math.min(1, this.corruptionLevel + amount);
    this.chromaticAberration = Math.max(this.chromaticAberration, amount);
  }

  setChaseMode(active) {
    this.chaseIntensity = active ? 1.0 : 0;
  }
}
