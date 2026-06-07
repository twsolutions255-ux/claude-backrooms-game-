// Random event system — lights, sounds, scripted scares
const EVENT_TYPES = [
  'light_flicker',
  'distant_scream',
  'power_outage',
  'alarm_start',
  'footsteps_nearby',
  'door_slam',
  'fake_entity',
  'wall_banging',
  'corruption_spike',
  'lights_flicker_fast',
  'whisper',
  'temperature_drop',
];

export class EventSystem {
  constructor() {
    this.events = [];
    this.activeEvents = new Map();
    this.cooldowns = new Map();
    this.eventTimer = 0;
    this.eventInterval = 15 + Math.random() * 20;
    this.disturbanceMultiplier = 1;

    // Per-event cooldowns (seconds)
    this.eventCooldowns = {
      light_flicker: 12,
      distant_scream: 20,
      power_outage: 60,
      alarm_start: 45,
      footsteps_nearby: 15,
      door_slam: 18,
      fake_entity: 30,
      wall_banging: 10,
      corruption_spike: 25,
      lights_flicker_fast: 20,
      whisper: 8,
      temperature_drop: 40,
    };

    // State flags
    this.inPowerOutage = false;
    this.inAlarm = false;
    this.flickerIntensity = 0;
    this.corruptionLevel = 0;

    // Notifications queue
    this.pendingNotifications = [];

    // Callbacks registered by game systems
    this._callbacks = {};
  }

  on(event, callback) {
    if (!this._callbacks[event]) this._callbacks[event] = [];
    this._callbacks[event].push(callback);
  }

  _emit(event, data) {
    const cbs = this._callbacks[event];
    if (cbs) cbs.forEach(cb => cb(data));
  }

  update(dt, player, disturbance, audio, renderer) {
    // Update event timer
    this.eventTimer += dt;
    const interval = this.eventInterval / this.disturbanceMultiplier;

    if (this.eventTimer >= interval) {
      this.eventTimer = 0;
      this.eventInterval = 10 + Math.random() * 25;
      this._triggerRandomEvent(player, disturbance, audio, renderer);
    }

    // Update active events
    for (const [type, event] of this.activeEvents) {
      event.timer += dt;
      if (event.timer >= event.duration) {
        this._endEvent(type, audio, renderer);
        this.activeEvents.delete(type);
      } else {
        this._tickEvent(type, event, dt, audio, renderer);
      }
    }

    // Update cooldowns
    for (const [type, cd] of this.cooldowns) {
      const newCd = cd - dt;
      if (newCd <= 0) this.cooldowns.delete(type);
      else this.cooldowns.set(type, newCd);
    }

    // Update disturbance multiplier
    if (disturbance) {
      this.disturbanceMultiplier = 1 + disturbance.level * 1.5;
    }

    // Flicker decay
    if (this.flickerIntensity > 0) {
      this.flickerIntensity = Math.max(0, this.flickerIntensity - dt * 2);
    }
    if (this.corruptionLevel > 0) {
      this.corruptionLevel = Math.max(0, this.corruptionLevel - dt * 0.3);
    }
  }

  _triggerRandomEvent(player, disturbance, audio, renderer) {
    // Weight events by disturbance level
    const level = disturbance ? disturbance.level : 0;
    let pool = ['light_flicker', 'wall_banging', 'whisper'];
    if (level > 0.2) pool = pool.concat(['footsteps_nearby', 'door_slam', 'distant_scream']);
    if (level > 0.5) pool = pool.concat(['lights_flicker_fast', 'fake_entity', 'corruption_spike']);
    if (level > 0.8) pool = pool.concat(['power_outage', 'alarm_start', 'temperature_drop']);

    const type = pool[Math.floor(Math.random() * pool.length)];
    this.trigger(type, player, audio, renderer);
  }

  trigger(type, player, audio, renderer) {
    if (this.cooldowns.has(type)) return false;
    if (this.activeEvents.has(type)) return false;

    const cd = this.eventCooldowns[type] || 15;
    this.cooldowns.set(type, cd);

    switch(type) {
      case 'light_flicker': this._startLightFlicker(audio, renderer, false); break;
      case 'lights_flicker_fast': this._startLightFlicker(audio, renderer, true); break;
      case 'distant_scream':
        audio.playDistantScream();
        this.pendingNotifications.push({ text: '...', duration: 3 });
        break;
      case 'power_outage': this._startPowerOutage(audio, renderer); break;
      case 'alarm_start': this._startAlarm(audio); break;
      case 'footsteps_nearby':
        audio._playDistantFootsteps();
        this.pendingNotifications.push({ text: 'Footsteps...', duration: 4 });
        break;
      case 'door_slam':
        audio.playDoorSlam();
        this.pendingNotifications.push({ text: '', duration: 2 });
        break;
      case 'fake_entity': this._triggerFakeEntity(player, audio, renderer); break;
      case 'wall_banging':
        audio.playWallBang();
        this.pendingNotifications.push({ text: '', duration: 2 });
        if (player) player.shake(0.3, 0.15);
        break;
      case 'corruption_spike':
        this.corruptionLevel = Math.min(1, this.corruptionLevel + 0.4 + Math.random() * 0.3);
        this.pendingNotifications.push({ text: '', duration: 5 });
        if (player) player.loseSanity(5);
        break;
      case 'whisper':
        this._playWhisper(audio);
        break;
      case 'temperature_drop':
        this.pendingNotifications.push({ text: 'Cold...', duration: 5 });
        if (renderer) { renderer.vignette = Math.min(1, renderer.vignette + 0.2); }
        if (player) player.loseSanity(3);
        break;
    }

    this._emit('event', { type, player });
    return true;
  }

  _startLightFlicker(audio, renderer, fast) {
    const duration = fast ? 3 : (1 + Math.random() * 3);
    this.activeEvents.set('light_flicker', { timer: 0, duration, fast, phase: 0 });
    audio.playFlickerBuzz();
  }

  _tickEvent(type, event, dt, audio, renderer) {
    if (type === 'light_flicker') {
      event.phase += dt * (event.fast ? 25 : 8);
      const f = Math.abs(Math.sin(event.phase)) * 0.7 + 0.3 * Math.random();
      this.flickerIntensity = event.fast ? f : (0.5 + f * 0.5);
      if (renderer) renderer.brightness = 0.15 + this.flickerIntensity * 0.85;
      if (event.fast && Math.random() < 0.1) audio.playFlickerBuzz();
    } else if (type === 'power_outage') {
      // Gradual fade handled by tick
      event.phase += dt;
      if (renderer) renderer.brightness = Math.max(0.02, 1 - event.phase * 0.8);
    } else if (type === 'alarm') {
      event.phase += dt;
    }
  }

  _endEvent(type, audio, renderer) {
    if (type === 'light_flicker') {
      if (renderer) renderer.brightness = 1.0;
      this.flickerIntensity = 0;
    } else if (type === 'power_outage') {
      if (renderer) renderer.brightness = 1.0;
      this.inPowerOutage = false;
      audio.playFlickerBuzz();
    } else if (type === 'alarm') {
      audio.stopAlarm();
      this.inAlarm = false;
    }
  }

  _startPowerOutage(audio, renderer) {
    this.inPowerOutage = true;
    const duration = 4 + Math.random() * 8;
    this.activeEvents.set('power_outage', { timer: 0, duration, phase: 0 });
    audio.playFlickerBuzz();
    this.pendingNotifications.push({ text: 'POWER OUT', duration: 3 });
  }

  _startAlarm(audio) {
    this.inAlarm = true;
    const duration = 8 + Math.random() * 12;
    this.activeEvents.set('alarm', { timer: 0, duration });
    audio.playAlarm();
    this.pendingNotifications.push({ text: 'ALARM TRIGGERED', duration: 4 });
  }

  _triggerFakeEntity(player, audio, renderer) {
    // Make the renderer do a brief entity flash at edge of screen
    this.pendingNotifications.push({ text: '', duration: 2 });
    if (player) player.loseSanity(8);
    if (renderer) {
      renderer.fakeEntityFlash = { timer: 0.5, x: Math.random() < 0.5 ? 0.08 : 0.92 };
    }
    // Play entity sound to sell the fake
    audio.playEntityScream(15);
    this._emit('fake_entity', {});
  }

  _playWhisper(audio) {
    if (!audio.initialized) return;
    const t = audio.ctx.currentTime;
    const noise = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    const filter = audio.ctx.createBiquadFilter();
    noise.type = 'sawtooth';
    noise.frequency.value = 800 + Math.random() * 400;
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.3);
    g.gain.linearRampToValueAtTime(0.02, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    noise.connect(filter); filter.connect(g);
    if (audio.reverbNode) g.connect(audio.reverbNode);
    g.connect(audio.sfxGain);
    noise.start(t); noise.stop(t + 2.6);
  }

  // Called when player enters a room with special tile type
  handleSpecialRoom(roomType, player, audio, renderer) {
    switch(roomType) {
      case 'event_dark':
        this.trigger('power_outage', player, audio, renderer);
        break;
      case 'event_scream':
        this.trigger('distant_scream', player, audio, renderer);
        this.trigger('wall_banging', player, audio, renderer);
        break;
      case 'event_chase_trigger':
        this._emit('force_chase', { player });
        break;
      case 'liminal':
        // Beautiful liminal moment — calm, then whisper
        audio.setMusicState('calm');
        setTimeout(() => this._playWhisper(audio), 5000);
        break;
      case 'flooded':
        this.pendingNotifications.push({ text: 'Water...', duration: 4 });
        break;
    }
  }

  // Safe room entering
  handleSafeRoom(audio) {
    this.inPowerOutage = false;
    this.inAlarm = false;
    this.activeEvents.clear();
    if (audio) { audio.stopAlarm(); audio.setMusicState('save'); }
    this.flickerIntensity = 0;
    this.corruptionLevel = 0;
  }

  getNotification() {
    return this.pendingNotifications.shift() || null;
  }

  isChaotic() {
    return this.inPowerOutage || this.inAlarm || this.corruptionLevel > 0.5;
  }
}
