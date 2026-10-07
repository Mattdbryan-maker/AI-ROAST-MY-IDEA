/**
 * Tiny synthesised sound layer (Web Audio, no assets). Off by default; the
 * UI calls `sfx.play(name)` at dramatic moments and this decides whether to
 * make noise. Swap the synth for sampled audio later without touching callers.
 */

export type SfxName = "whoosh" | "tick" | "boom" | "riser" | "blip";

const STORAGE_KEY = "arm:sound";

class Sfx {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private listeners = new Set<(on: boolean) => void>();

  init() {
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      this.enabled = false;
    }
    this.emit();
  }

  get isEnabled() {
    return this.enabled;
  }

  subscribe(fn: (on: boolean) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      /* storage unavailable — the toggle still works for this visit */
    }
    if (on) this.play("blip");
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn(this.enabled);
  }

  private audio(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  play(name: SfxName) {
    if (!this.enabled) return;
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.connect(ctx.destination);

    const tone = (type: OscillatorType, from: number, to: number, dur: number, vol: number, delay = 0) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      osc.connect(g).connect(out);
      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.05);
    };

    const noise = (dur: number, vol: number, freqFrom: number, freqTo: number) => {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(freqFrom, t);
      filter.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(g).connect(out);
      src.start(t);
    };

    switch (name) {
      case "blip":
        tone("sine", 880, 1320, 0.08, 0.08);
        break;
      case "tick":
        tone("square", 1800, 1600, 0.025, 0.025);
        break;
      case "whoosh":
        noise(0.45, 0.18, 400, 3200);
        break;
      case "riser":
        tone("sawtooth", 80, 640, 1.6, 0.05);
        noise(1.6, 0.06, 300, 6000);
        break;
      case "boom":
        tone("sine", 140, 38, 1.2, 0.6);
        tone("triangle", 90, 30, 0.9, 0.3);
        noise(0.6, 0.25, 1200, 120);
        break;
    }
  }
}

export const sfx = new Sfx();
