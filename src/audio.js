// Web Audio API — all sounds synthesized procedurally
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.reverbNode = null;
    this.compressor = null;

    this.masterVol = 0.7;
    this.musicVol = 0.5;
    this.initialized = false;

    this._ambientNodes = [];
    this._chaseMusic = null;
    this._calmMusic = null;
    this._currentMusicState = 'none'; // none, calm, tense, chase, save
    this._musicFadeTimer = 0;

    this._distantSoundTimer = 0;
    this._distantSoundInterval = 8 + Math.random() * 15;

    this._breathingNode = null;
    this._breathingTimer = 0;
    this._isBreathing = false;

    // Heartbeat
    this._heartbeatActive = false;
    this._heartbeatBPM = 80;
    this._heartbeatTimer = 0;

    // Per-level ambient profile
    this._levelProfile = 'default';
    this._levelAmbientNodes = [];
    this._levelAmbientGain = null;
  }

  async init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.connect(this.ctx.destination);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVol;
      this.masterGain.connect(this.compressor);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.4;
      this.ambientGain.connect(this.masterGain);

      await this._createReverb();
      this._startAmbient();
      this.initialized = true;
    } catch(e) {
      console.warn('Audio init failed:', e);
    }
  }

  setMasterVolume(v) { this.masterVol = v; if(this.masterGain) this.masterGain.gain.value = v; }
  setMusicVolume(v) { this.musicVol = v; if(this.musicGain) this.musicGain.gain.value = v; }

  async _createReverb() {
    const len = this.ctx.sampleRate * 2.5;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5) * 0.4;
      }
    }
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = buf;
    this.reverbNode.connect(this.masterGain);
  }

  _startAmbient() {
    // Fluorescent hum — 120Hz + harmonics
    const humFreqs = [120, 240, 360, 480];
    for (const freq of humFreqs) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.value = 0.012 / (freq / 120);
      osc.connect(g);
      g.connect(this.ambientGain);
      osc.start();
      this._ambientNodes.push(osc);
    }

    // Low industrial drone — 55Hz
    const drone = this.ctx.createOscillator();
    const droneG = this.ctx.createGain();
    const droneLFO = this.ctx.createOscillator();
    const droneLFOG = this.ctx.createGain();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    droneLFO.frequency.value = 0.07;
    droneLFOG.gain.value = 0.003;
    droneLFO.connect(droneLFOG);
    droneLFOG.connect(droneG.gain);
    droneG.gain.value = 0.025;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 200;
    drone.connect(droneFilter);
    droneFilter.connect(droneG);
    droneG.connect(this.ambientGain);
    droneLFO.start(); drone.start();
    this._ambientNodes.push(drone, droneLFO);

    // Air conditioning / HVAC noise
    const noise = this._createNoise(0.012);
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 800;
    noiseFilter.Q.value = 0.3;
    noise.connect(noiseFilter);
    noiseFilter.connect(this.ambientGain);
  }

  _createNoise(volume = 0.1) {
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
    return g;
  }

  // ── SFX ──────────────────────────────────────────────────────────────────
  playFootstep(isSprint, isCrouch) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const freq = 80 + Math.random() * 40;
    const dur = isSprint ? 0.06 : 0.12;
    const vol = isCrouch ? 0.04 : (isSprint ? 0.18 : 0.12);
    this._playImpact(freq, dur, vol, 0.6);
  }

  _playImpact(freq, dur, vol, decay) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, t + dur);
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  playDoorOpen() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // Creaking sound
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.linearRampToValueAtTime(120, t + 0.3);
    osc.frequency.linearRampToValueAtTime(180, t + 0.6);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 5;
    osc.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.75);
  }

  playDoorSlam() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    this._playImpact(60, 0.4, 0.5, 0.8);
    // Add reverb on slam
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.value = 80;
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc2.connect(g2);
    if (this.reverbNode) g2.connect(this.reverbNode);
    g2.connect(this.sfxGain);
    osc2.start(t); osc2.stop(t + 0.55);
  }

  playEntityScream(dist = 5) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(0.05, 0.5 / (1 + dist * 0.15));
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const startFreq = 300 + Math.random() * 200;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.linearRampToValueAtTime(startFreq * 1.5, t + 0.3);
    osc.frequency.linearRampToValueAtTime(startFreq * 0.8, t + 0.8);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 3;
    osc.connect(filter); filter.connect(g);
    if (this.reverbNode) g.connect(this.reverbNode);
    g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 1.3);
  }

  playDistantScream() {
    if (!this.initialized) return;
    this.playEntityScream(20 + Math.random() * 10);
  }

  playFlickerBuzz() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 120 + Math.random() * 40;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + Math.random() * 0.2);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.4);
  }

  playPickup() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.2);
  }

  playHeal() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 600 + i * 200;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.1, t + i * 0.12 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.3);
    }
  }

  playSave() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const freqs = [440, 554, 660, 880];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.15);
      g.gain.linearRampToValueAtTime(0.1, t + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.5);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + 0.6);
    });
  }

  playFlashlightToggle(on) {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = on ? 2000 : 800;
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.08);
  }

  playWallBang() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    this._playImpact(120, 0.3, 0.4, 0.7);
    if (this.reverbNode) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 60;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(g); g.connect(this.reverbNode);
      osc.start(t); osc.stop(t + 0.9);
    }
  }

  playAlarm() {
    if (!this.initialized) return;
    if (this._alarmNode) return; // already playing
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);

    // Alternating alarm tone
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 1;
    lfoG.gain.value = 100;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);

    g.gain.value = 0.25;
    osc.connect(g); g.connect(this.sfxGain);
    lfo.start(t); osc.start(t);
    this._alarmNode = { osc, lfo, g };
  }

  stopAlarm() {
    if (!this._alarmNode) return;
    const t = this.ctx.currentTime;
    this._alarmNode.g.gain.exponentialRampToValueAtTime(0.001, t + 1);
    this._alarmNode.osc.stop(t + 1.1);
    this._alarmNode.lfo.stop(t + 1.1);
    this._alarmNode = null;
  }

  playMeleeSwing() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const noise = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    noise.type = 'sawtooth';
    noise.frequency.setValueAtTime(800, t);
    noise.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    noise.connect(g); g.connect(this.sfxGain);
    noise.start(t); noise.stop(t + 0.15);
  }

  playFlashGrenade() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // High-pitched piercing tone with quick fade
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(4000, t);
    osc.frequency.exponentialRampToValueAtTime(1000, t + 0.5);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.9);
  }

  // ── MUSIC STATES ─────────────────────────────────────────────────────────
  setMusicState(state, immediate = false) {
    if (state === this._currentMusicState) return;
    this._currentMusicState = state;
    this._transitionMusic(state, immediate);
  }

  _transitionMusic(state, immediate) {
    if (!this.initialized) return;

    // Fade out existing music
    if (this._musicGainNode) {
      const t = this.ctx.currentTime;
      // Chase: quick cut to silence for drama
      const fadeDur = (state === 'chase' && !immediate) ? 0.3 : (immediate ? 0.1 : 2.0);
      this._musicGainNode.gain.cancelScheduledValues(t);
      this._musicGainNode.gain.setValueAtTime(Math.max(0.001, this._musicGainNode.gain.value), t);
      this._musicGainNode.gain.exponentialRampToValueAtTime(0.001, t + fadeDur);
      if (this._musicOsc) {
        const osc = this._musicOsc;
        setTimeout(() => { try { osc.stop(); } catch(e) {} }, (fadeDur + 0.3) * 1000);
        this._musicOsc = null;
      }
      this._musicGainNode = null;
    }

    if (state === 'chase' && !immediate) {
      // Silence for ~0.5s then SLAM chase music in at full volume
      setTimeout(() => {
        if (this._currentMusicState === 'chase') this._startChaseMusic();
      }, 750);
    } else {
      const delay = immediate ? 0 : 200;
      setTimeout(() => {
        if (this._currentMusicState !== state) return;
        switch(state) {
          case 'calm': this._startCalmMusic(); break;
          case 'tense': this._startTenseMusic(); break;
          case 'chase': this._startChaseMusic(); break;
          case 'save': this._startSaveMusic(); break;
        }
      }, delay);
    }
  }

  // ── HEARTBEAT ─────────────────────────────────────────────────────────────
  setHeartbeat(active, bpm = 80) {
    this._heartbeatActive = active;
    this._heartbeatBPM = bpm;
    if (!active) this._heartbeatTimer = 0;
  }

  _playHeartbeat() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // Lub (low thud)
    this._playImpact(55, 0.05, 0.28, 0.94);
    // Dub (slightly higher, slightly after)
    setTimeout(() => { if (this.initialized) this._playImpact(45, 0.04, 0.20, 0.96); }, 110);
  }

  // ── PER-LEVEL AMBIENT PROFILES ────────────────────────────────────────────
  setLevelAmbient(profile) {
    if (profile === this._levelProfile) return;
    this._levelProfile = profile;
    // Stop current level ambient nodes
    for (const n of this._levelAmbientNodes) { try { n.stop?.(); } catch(e) {} }
    this._levelAmbientNodes = [];
    if (this._levelAmbientGain) {
      try { this._levelAmbientGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1); }
      catch(e) {}
      this._levelAmbientGain = null;
    }
    if (this.initialized) this._startLevelAmbient(profile);
  }

  _startLevelAmbient(profile) {
    if (!this.initialized) return;
    switch(profile) {
      case 'lobby':       this._ambientFluorescent(); break;
      case 'warehouse':   this._ambientIndustrial(); break;
      case 'pipes':       this._ambientPipes(); break;
      case 'electrical':  this._ambientElectrical(); break;
      case 'poolrooms':   this._ambientPool(); break;
      case 'party':       this._ambientParty(); break;
    }
  }

  _makeLevelGain(vol = 0.3) {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.ambientGain);
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 2);
    this._levelAmbientGain = g;
    return g;
  }

  _ambientFluorescent() {
    // Loud fluorescent hum — migraine-inducing
    const g = this._makeLevelGain(0.5);
    const freqs = [120, 240, 480, 960];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      og.gain.value = 0.03 / (f / 120);
      osc.connect(og); og.connect(g);
      osc.start();
      this._levelAmbientNodes.push(osc);
    }
    // Occasional flicker click
    this._scheduleFluorescentClicks();
  }

  _scheduleFluorescentClicks() {
    if (this._levelProfile !== 'lobby' || !this.initialized) return;
    const delay = 3000 + Math.random() * 10000;
    setTimeout(() => {
      this.playFlickerBuzz();
      this._scheduleFluorescentClicks();
    }, delay);
  }

  _ambientIndustrial() {
    const g = this._makeLevelGain(0.25);
    // Low industrial echo
    const drone = this.ctx.createOscillator();
    const dg = this.ctx.createGain();
    drone.type = 'sawtooth';
    drone.frequency.value = 40;
    dg.gain.value = 0.015;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 150;
    drone.connect(f); f.connect(dg); dg.connect(g);
    drone.start();
    this._levelAmbientNodes.push(drone);
  }

  _ambientPipes() {
    const g = this._makeLevelGain(0.35);
    // Pipe hiss — high bandpass noise
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 1200; filt.Q.value = 0.5;
    const ng = this.ctx.createGain(); ng.gain.value = 0.04;
    src.connect(filt); filt.connect(ng); ng.connect(g);
    src.start();
    this._levelAmbientNodes.push(src);
    // Occasional pipe bang
    this._schedulePipeBang();
  }

  _schedulePipeBang() {
    if (this._levelProfile !== 'pipes' || !this.initialized) return;
    const delay = 2000 + Math.random() * 8000;
    setTimeout(() => {
      this.playWallBang();
      this._schedulePipeBang();
    }, delay);
  }

  _ambientElectrical() {
    const g = this._makeLevelGain(0.3);
    // Electrical crackle
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 80;
    const og = this.ctx.createGain(); og.gain.value = 0.02;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    osc.connect(f); f.connect(og); og.connect(g);
    osc.start();
    this._levelAmbientNodes.push(osc);
  }

  _ambientPool() {
    // Near total silence — water lapping only
    const g = this._makeLevelGain(0.1);
    this._scheduleWaterDrip();
  }

  _scheduleWaterDrip() {
    if (this._levelProfile !== 'poolrooms' || !this.initialized) return;
    const delay = 1500 + Math.random() * 5000;
    setTimeout(() => {
      this._playDrip();
      this._scheduleWaterDrip();
    }, delay);
  }

  _ambientParty() {
    if (!this.initialized) return;
    const g = this._makeLevelGain(0.25);
    // Tinny upbeat party loop (simple synthesized melody)
    const notes = [523, 659, 784, 659, 523, 587, 698, 784];
    let noteIdx = 0;
    const playNote = () => {
      if (this._levelProfile !== 'party' || !this.initialized) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const ng = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = notes[noteIdx % notes.length];
      ng.gain.setValueAtTime(0.04, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(ng); ng.connect(g);
      osc.start(t); osc.stop(t + 0.2);
      noteIdx++;
      setTimeout(playNote, 220 + Math.random() * 30);
    };
    playNote();
  }

  // Party alert sound — music cut + roar
  playPartyAlert() {
    if (!this.initialized) return;
    // Silence the level ambient briefly then ROAR
    if (this._levelAmbientGain) {
      const t = this.ctx.currentTime;
      this._levelAmbientGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      setTimeout(() => {
        if (this._levelAmbientGain) {
          this._levelAmbientGain.gain.linearRampToValueAtTime(0.25, this.ctx.currentTime + 1);
        }
      }, 800);
    }
    // Collective roar
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => this.playEntityScream(2 + i * 0.5), i * 80);
      }
    }, 500);
  }

  _startCalmMusic() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime + 1;
    // Slow, liminal drone — a single sustained chord with subtle movement
    const freqs = [110, 165, 220, 293];
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.musicGain);
    this._musicGainNode = g;

    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'sine';
      osc.frequency.value = f;
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.03 + i * 0.011;
      lfoG.gain.value = 0.5 + i * 0.2;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      const og = this.ctx.createGain();
      og.gain.value = 0.04 / (i + 1);
      osc.connect(og); og.connect(g);
      lfo.start(t); osc.start(t);
    });

    g.gain.linearRampToValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(1, t + 4);
    this._musicOsc = { stop: () => {} }; // placeholder
  }

  _startTenseMusic() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime + 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.musicGain);
    this._musicGainNode = g;

    // Low pulsing beat
    const pulseFreqs = [55, 73, 82];
    pulseFreqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const og = this.ctx.createGain();
      og.gain.value = 0.06;
      osc.connect(filter); filter.connect(og); og.connect(g);
      osc.start(t + i * 0.3);
    });

    g.gain.linearRampToValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.8, t + 2);
    this._musicOsc = { stop: () => {} };
  }

  _startChaseMusic() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime + 0.1;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.musicGain);
    this._musicGainNode = g;

    // Intense rhythmic dissonance
    const baseFreq = 55;
    const offsets = [1, 1.5, 1.78, 2.25, 3.0];
    offsets.forEach((m, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.value = baseFreq * m;

      // Tremolo
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 4 + i * 1.5;
      lfoG.gain.value = 0.04;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 300 + i * 100;
      filter.Q.value = 2;
      const og = this.ctx.createGain();
      og.gain.value = 0.05;
      osc.connect(filter); filter.connect(og); og.connect(g);
      lfo.start(t); osc.start(t + i * 0.05);
    });

    // Distorted bass hit
    const bassOsc = this.ctx.createOscillator();
    const bassG = this.ctx.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.value = 40;
    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this._makeDistortionCurve(200);
    bassG.gain.value = 0.08;
    bassOsc.connect(distortion); distortion.connect(bassG); bassG.connect(g);
    bassOsc.start(t);

    g.gain.linearRampToValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.5);
    this._musicOsc = { stop: () => {} };
  }

  _startSaveMusic() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime + 0.5;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.musicGain);
    this._musicGainNode = g;

    // Warm, calm chord
    const freqs = [220, 277, 330, 440];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.02;
      lfoG.gain.value = 0.3;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      const og = this.ctx.createGain();
      og.gain.value = 0.05 / (i * 0.3 + 1);
      osc.connect(og); og.connect(g);
      if (this.reverbNode) og.connect(this.reverbNode);
      lfo.start(t); osc.start(t);
    });

    g.gain.linearRampToValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.7, t + 3);
    this._musicOsc = { stop: () => {} };
  }

  _makeDistortionCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // ── AMBIENT RANDOM SOUNDS ─────────────────────────────────────────────────
  update(dt, player, entities, events) {
    if (!this.initialized) return;

    // Heartbeat
    if (this._heartbeatActive) {
      this._heartbeatTimer += dt;
      const interval = 60 / this._heartbeatBPM;
      if (this._heartbeatTimer >= interval) {
        this._heartbeatTimer = 0;
        this._playHeartbeat();
      }
    }

    this._distantSoundTimer += dt;
    if (this._distantSoundTimer > this._distantSoundInterval) {
      this._distantSoundTimer = 0;
      this._distantSoundInterval = 8 + Math.random() * 18;
      this._playRandomAmbientSound();
    }

    // Footstep audio
    if (player._lastFootstep && player._lastFootstep.time !== this._lastFootstepTime) {
      this._lastFootstepTime = player._lastFootstep.time;
      this.playFootstep(player._lastFootstep.sprint, player._lastFootstep.crouch);
    }

    // Entity sounds
    for (const e of entities) {
      if (!e.alive) continue;
      if (e._pendingSound) {
        const sound = e._pendingSound;
        e._pendingSound = null;
        const dist = e.distanceTo(player.x, player.y);
        if (sound === 'entity_near') this.playEntityScream(dist);
        else if (sound === 'entity_distant') this.playDistantScream();
      }
    }

    // Flashlight toggle
    if (player._onFlashlightDead) {
      player._onFlashlightDead = false;
      this.playFlickerBuzz();
    }

    // Breathing when low health or sprinting exhausted
    const breathIntense = player.health < 40 || player.exhausted || player.stamina < 15;
    if (breathIntense && !this._isBreathing) this._startBreathing(breathIntense);
    else if (!breathIntense && this._isBreathing) this._stopBreathing();
  }

  _playRandomAmbientSound() {
    const sounds = [
      () => this.playDistantScream(),
      () => this.playWallBang(),
      () => this.playDoorSlam(),
      () => this._playMetalCreak(),
      () => this._playDrip(),
      () => this._playDistantFootsteps(),
    ];
    pick(sounds)();
  }

  _playMetalCreak() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.linearRampToValueAtTime(200 + Math.random() * 300, t + 0.3);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 8;
    osc.connect(f); f.connect(g);
    if (this.reverbNode) g.connect(this.reverbNode);
    g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.6);
  }

  _playDrip() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    if (this.reverbNode) g.connect(this.reverbNode);
    g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.2);
  }

  _playDistantFootsteps() {
    if (!this.initialized) return;
    const steps = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < steps; i++) {
      setTimeout(() => this._playImpact(60 + Math.random() * 30, 0.08, 0.04, 0.5), i * (200 + Math.random() * 200));
    }
  }

  _startBreathing(intense) {
    this._isBreathing = true;
    // Will auto-play periodically
  }

  _stopBreathing() {
    this._isBreathing = false;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
