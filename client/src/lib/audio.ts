/**
 * All sound is synthesised with the Web Audio API: no audio files, nothing copyrighted.
 * Every function is a safe no-op when audio is unavailable (tests, old browsers, blocked autoplay).
 */

type Ctx = AudioContext;

interface AudioSettings {
  musicOn: boolean;
  sfxOn: boolean;
  musicVolume: number;
  sfxVolume: number;
}

class GameAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private settings: AudioSettings = { musicOn: true, sfxOn: true, musicVolume: 0.5, sfxVolume: 0.7 };
  private musicTimer: number | null = null;
  private musicWanted = false;
  private step = 0;
  private nextStepTime = 0;
  private engine: {
    saw: OscillatorNode;
    sq: OscillatorNode;
    sub: OscillatorNode;
    lfo: OscillatorNode;
    noise: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
    noiseFilter: BiquadFilterNode;
    noiseGain: GainNode;
    gear: number;
  } | null = null;
  private boostUntil = 0;
  private noiseBuffer: AudioBuffer | null = null;

  /** Must be called from a user gesture (click / keypress) at least once. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      const Ctor: typeof AudioContext | undefined =
        typeof window !== 'undefined'
          ? (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.applyVolumes();
      if (this.musicWanted) this.startMusicLoop();
    } catch {
      this.ctx = null;
    }
  }

  configure(settings: AudioSettings): void {
    this.settings = settings;
    this.applyVolumes();
    if (!settings.musicOn) this.stopMusicLoop();
    else if (this.musicWanted) this.startMusicLoop();
    if (!settings.sfxOn) this.stopEngine();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxGain || !this.musicGain) return;
    const t = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxOn ? this.settings.sfxVolume : 0, t, 0.02);
    this.musicGain.gain.setTargetAtTime(this.settings.musicOn ? this.settings.musicVolume * 0.35 : 0, t, 0.05);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume = 0.2,
    when = 0,
    slideTo?: number,
    dest: AudioNode | null = this.sfxGain,
  ): void {
    if (!this.ctx || !dest) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // ------------------------------------------------------------------ sound effects

  click(): void {
    this.tone(660, 0.07, 'triangle', 0.18);
  }
  key(): void {
    this.tone(880 + Math.random() * 120, 0.035, 'square', 0.05);
  }
  wrong(): void {
    this.tone(180, 0.12, 'sawtooth', 0.12, 0, 110);
  }
  countdownBeep(final = false): void {
    this.tone(final ? 1046 : 523, final ? 0.45 : 0.18, 'square', 0.2);
  }
  finish(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, i * 0.09));
  }
  win(): void {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.24, 'square', 0.16, i * 0.11));
  }
  lose(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.2, i * 0.16));
  }

  // ------------------------------------------------------------------ engine

  private getNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 1.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** A synthesised petrol engine: three layered oscillators, a rumble (cylinder firing) and an exhaust rasp. */
  startEngine(): void {
    if (!this.ctx || !this.sfxGain || this.engine || !this.settings.sfxOn) return;
    const ctx = this.ctx;
    const noiseBuf = this.getNoise();
    const saw = ctx.createOscillator();
    const sq = ctx.createOscillator();
    const sub = ctx.createOscillator();
    saw.type = 'sawtooth';
    sq.type = 'square';
    sub.type = 'sine';
    saw.frequency.value = 70;
    sq.frequency.value = 140;
    sub.frequency.value = 35;
    const mix = ctx.createGain();
    const sawG = ctx.createGain();
    const sqG = ctx.createGain();
    const subG = ctx.createGain();
    sawG.gain.value = 0.55;
    sqG.gain.value = 0.18;
    subG.gain.value = 0.7;
    saw.connect(sawG).connect(mix);
    sq.connect(sqG).connect(mix);
    sub.connect(subG).connect(mix);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    // rumble: a slow oscillator wobbles the volume, like cylinders firing
    const amp = ctx.createGain();
    amp.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.type = 'triangle';
    lfo.frequency.value = 22;
    lfoDepth.gain.value = 0.25;
    lfo.connect(lfoDepth).connect(amp.gain);
    mix.connect(filter).connect(amp);
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    amp.connect(gain).connect(this.sfxGain);
    // exhaust rasp
    const noise = ctx.createBufferSource();
    if (noiseBuf) noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 700;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0001;
    noise.connect(noiseFilter).connect(noiseGain).connect(this.sfxGain);
    for (const node of [saw, sq, sub, lfo, noise]) node.start();
    this.engine = { saw, sq, sub, lfo, noise, gain, filter, noiseFilter, noiseGain, gear: 0 };
  }

  /** speed: 0..1. Climbs through five "gears": the revs rise, drop at each shift and rise again. */
  setEngineSpeed(speed: number): void {
    if (!this.ctx || !this.engine) return;
    const e = this.engine;
    const s = Math.min(1, Math.max(0, speed));
    const t = this.ctx.currentTime;
    const edges = [0, 0.2, 0.42, 0.64, 0.84, 1.0001];
    let gear = 0;
    while (gear < 4 && s >= edges[gear + 1]) gear++;
    const frac = (s - edges[gear]) / (edges[gear + 1] - edges[gear]);
    const revs = 0.22 + 0.78 * Math.pow(Math.min(1, Math.max(0, frac)), 0.85);
    const boosted = t < this.boostUntil;
    const f = (52 + revs * 150 + gear * 6) * (boosted ? 1.05 : 1);
    e.saw.frequency.setTargetAtTime(f, t, 0.04);
    e.sq.frequency.setTargetAtTime(f * 2.01, t, 0.04);
    e.sub.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    e.lfo.frequency.setTargetAtTime(14 + revs * 40, t, 0.06);
    e.filter.frequency.setTargetAtTime(420 + revs * 2400 + s * 800, t, 0.05);
    e.gain.gain.setTargetAtTime((0.09 + s * 0.14) * (boosted ? 1.3 : 1), t, 0.03);
    e.noiseFilter.frequency.setTargetAtTime(500 + revs * 1800, t, 0.06);
    e.noiseGain.gain.setTargetAtTime(0.008 + s * 0.06, t, 0.06);
    if (gear > e.gear && s > 0.15) this.shiftPuff();
    e.gear = gear;
  }

  /** A short throttle blip, call on every correct key so the engine answers your typing. */
  rev(): void {
    if (!this.ctx || !this.engine) return;
    this.boostUntil = this.ctx.currentTime + 0.1;
  }

  /** The "psh" of a gear change. */
  private shiftPuff(): void {
    if (!this.ctx || !this.sfxGain) return;
    const buf = this.getNoise();
    if (!buf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(hp).connect(g).connect(this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.2);
  }

  /** The roar when the lights go green. */
  launch(): void {
    if (!this.ctx || !this.sfxGain || !this.settings.sfxOn) return;
    this.tone(70, 0.9, 'sawtooth', 0.22, 0, 340);
    this.tone(140, 0.9, 'square', 0.08, 0, 600);
    this.shiftPuff();
  }

  stopEngine(): void {
    if (!this.engine || !this.ctx) return;
    const { saw, sq, sub, lfo, noise, gain, noiseGain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, t, 0.05);
    noiseGain.gain.setTargetAtTime(0.0001, t, 0.05);
    for (const node of [saw, sq, sub, lfo, noise]) node.stop(t + 0.3);
    this.engine = null;
  }

  // ------------------------------------------------------------------ music

  /** Call with true on screens where music should play (it respects the music setting). */
  setMusicWanted(wanted: boolean): void {
    this.musicWanted = wanted;
    if (wanted && this.settings.musicOn) this.startMusicLoop();
    else this.stopMusicLoop();
  }

  private startMusicLoop(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  private stopMusicLoop(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  // Original 16-step synthwave loop in A minor (bass + arpeggio + soft kick), ~112 BPM.
  private scheduleMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const stepDur = 60 / 112 / 2; // eighth notes
    const bass = [55, 55, 55, 55, 43.65, 43.65, 43.65, 43.65, 51.91, 51.91, 51.91, 51.91, 49, 49, 49, 49];
    const arp = [220, 262, 330, 262, 175, 220, 262, 220, 207.7, 261.6, 311, 261.6, 196, 247, 294, 247];
    while (this.nextStepTime < this.ctx.currentTime + 0.35) {
      const i = this.step % 16;
      const when = Math.max(0, this.nextStepTime - this.ctx.currentTime);
      this.tone(bass[i], stepDur * 0.9, 'sawtooth', 0.3, when, undefined, this.musicGain);
      this.tone(arp[i] * (i % 8 === 7 ? 2 : 1), stepDur * 0.7, 'triangle', 0.22, when, undefined, this.musicGain);
      if (i % 4 === 0) this.tone(120, 0.12, 'sine', 0.45, when, 40, this.musicGain);
      this.step++;
      this.nextStepTime += stepDur;
    }
  }
}

export const audio = new GameAudio();
