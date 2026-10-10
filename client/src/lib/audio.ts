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
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

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

  startEngine(): void {
    if (!this.ctx || !this.sfxGain || this.engine || !this.settings.sfxOn) return;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = 55;
    osc2.frequency.value = 55.7;
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    gain.gain.value = 0.0001;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.sfxGain);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain, filter };
  }

  /** speed: 0..1 */
  setEngineSpeed(speed: number): void {
    if (!this.ctx || !this.engine) return;
    const s = Math.min(1, Math.max(0, speed));
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(55 + s * 110, t, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(55.7 + s * 111, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(280 + s * 900, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.02 + s * 0.05, t, 0.1);
  }

  stopEngine(): void {
    if (!this.engine || !this.ctx) return;
    const { osc, osc2, gain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, t, 0.05);
    osc.stop(t + 0.3);
    osc2.stop(t + 0.3);
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
