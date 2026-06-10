// SFX.js — tiny WebAudio synthesizer for procedural sound effects (no audio assets).
// The AudioContext is created lazily on the first sound, which always happens
// inside a user-input handler, so browser autoplay policies are satisfied.
const SFX = {
  _ctx: null,

  _ensure() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this._ctx = new AC();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  },

  _tone(freq, { type = 'sine', duration = 0.15, volume = 0.2, delay = 0, slideTo = 0 } = {}) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0   = ctx.currentTime + delay;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);

    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  },

  pickup() {
    this._tone(660, { type: 'square', duration: 0.08, volume: 0.1 });
    this._tone(990, { type: 'square', duration: 0.12, volume: 0.1, delay: 0.07 });
  },

  merge() {
    this._tone(220, { type: 'sawtooth', duration: 0.35, volume: 0.12, slideTo: 660 });
  },

  split() {
    this._tone(660, { type: 'sawtooth', duration: 0.3, volume: 0.12, slideTo: 220 });
  },

  denied() {
    this._tone(140, { type: 'square', duration: 0.18, volume: 0.12 });
  },

  win() {
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      this._tone(f, { type: 'triangle', duration: 0.3, volume: 0.16, delay: i * 0.13 });
    });
  },
};
