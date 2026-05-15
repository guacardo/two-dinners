import { Howl, Howler } from "howler";

interface BlipOpts {
  freq: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
}

// Per-event synthesis recipes. Bumped vs. raw playback because Howler's
// distance attenuation pulls the perceived level down.
const blueprints = {
  cast:   { freq: 880, freqEnd: 660, duration: 0.08, type: "square",   gain: 0.35 },
  hit:    { freq: 240, freqEnd: 90,  duration: 0.10, type: "sawtooth", gain: 0.45 },
  kill:   { freq: 520, freqEnd: 110, duration: 0.22, type: "triangle", gain: 0.50 },
  spawn:  { freq: 160, freqEnd: 360, duration: 0.12, type: "sine",     gain: 0.30 },
  damage: { freq: 140, freqEnd: 70,  duration: 0.18, type: "sawtooth", gain: 0.55 },
} satisfies Record<string, BlipOpts>;

type SfxName = keyof typeof blueprints;

async function renderBlip(opts: BlipOpts): Promise<AudioBuffer> {
  const tail = 0.05;
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * (opts.duration + tail)), sr);
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(opts.freq, 0);
  if (opts.freqEnd && opts.freqEnd > 0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), opts.duration);
  }
  const peak = opts.gain ?? 0.3;
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(peak, 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, opts.duration);
  osc.connect(env).connect(ctx.destination);
  osc.start(0);
  osc.stop(opts.duration + tail);
  return await ctx.startRendering();
}

function audioBufferToWavUrl(buffer: AudioBuffer): string {
  const numCh = 1;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const dataLen = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  const ch = buffer.getChannelData(0);
  let off = 44;
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return URL.createObjectURL(new Blob([ab], { type: "audio/wav" }));
}

const howls: Partial<Record<SfxName, Howl>> = {};
let ready = false;

async function buildSounds() {
  for (const [name, opts] of Object.entries(blueprints) as [SfxName, BlipOpts][]) {
    const buf = await renderBlip(opts);
    const url = audioBufferToWavUrl(buf);
    const h = new Howl({ src: [url], format: ["wav"], volume: 0.8, pool: 8 });
    h.pannerAttr({
      panningModel: "equalpower",
      distanceModel: "linear",
      refDistance: 80,
      maxDistance: 700,
      rolloffFactor: 1,
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0,
    });
    howls[name] = h;
  }
  ready = true;
}

void buildSounds();

function play(name: SfxName, x: number, z: number) {
  if (!ready) return;
  const h = howls[name];
  if (!h) return;
  const id = h.play();
  h.pos(x, 0, z, id);
}

export function unlockAudio() {
  if (Howler.ctx && Howler.ctx.state === "suspended") Howler.ctx.resume().catch(() => {});
}

// Server uses (x, y) on a 2D plane; we map y → z so it matches the Three scene.
export function setListener(x: number, z: number) {
  Howler.pos(x, 0, z);
}

export const sfx = {
  cast  (x: number, z: number) { play("cast",   x, z); },
  hit   (x: number, z: number) { play("hit",    x, z); },
  kill  (x: number, z: number) { play("kill",   x, z); },
  spawn (x: number, z: number) { play("spawn",  x, z); },
  damage(x: number, z: number) { play("damage", x, z); },
};
