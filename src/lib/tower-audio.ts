/**
 * Synthesised sound design for La Tower: a rising musical step per floor, drum rolls
 * near the top, a collapse, jackpot bells and two voice clips run through a reverb.
 */

type Bus = {
  master: GainNode;
  reverb: GainNode;
  voices: Map<string, Promise<AudioBuffer>>;
};

const VOICE_FILES = {
  lucky: "/audio/tower/lucky.wav",
  jackpot: "/audio/tower/jackpot.wav",
} as const;

// Pentatonic climb, one step per floor: every floor sounds a little higher.
const FLOOR_SEMITONES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const ROOT = 110;

const buses = new WeakMap<AudioContext, Bus>();

function impulse(context: AudioContext, seconds: number, decay: number) {
  const length = Math.round(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index++)
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** decay;
  }
  return buffer;
}

function bus(context: AudioContext): Bus {
  let current = buses.get(context);
  if (current) return current;
  const master = context.createGain();
  master.gain.value = 0.8;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.ratio.value = 4;
  master.connect(compressor);
  compressor.connect(context.destination);
  const convolver = context.createConvolver();
  convolver.buffer = impulse(context, 3.2, 2.6);
  const reverb = context.createGain();
  reverb.gain.value = 1;
  reverb.connect(convolver);
  convolver.connect(master);
  current = { master, reverb, voices: new Map() };
  buses.set(context, current);
  return current;
}

function voice(context: AudioContext, name: keyof typeof VOICE_FILES) {
  const { voices } = bus(context);
  let buffer = voices.get(name);
  if (!buffer) {
    buffer = fetch(VOICE_FILES[name])
      .then((response) => {
        if (!response.ok) throw new Error(`Voix indisponible : ${name}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
    voices.set(name, buffer);
  }
  return buffer;
}

export function preloadTowerSounds(context: AudioContext) {
  for (const name of Object.keys(VOICE_FILES) as (keyof typeof VOICE_FILES)[])
    void voice(context, name).catch(() => undefined);
}

/** Routes a node to the dry mix and, with `send`, to the reverb. */
function out(context: AudioContext, node: AudioNode, send = 0) {
  const { master, reverb } = bus(context);
  node.connect(master);
  if (send > 0) {
    const gain = context.createGain();
    gain.gain.value = send;
    node.connect(gain);
    gain.connect(reverb);
  }
}

function tone(
  context: AudioContext,
  options: {
    at: number;
    frequency: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    glideTo?: number;
    cutoff?: number;
    attack?: number;
    send?: number;
    detune?: number;
  },
) {
  const start = context.currentTime + options.at;
  const oscillator = context.createOscillator();
  oscillator.type = options.type ?? "triangle";
  oscillator.frequency.setValueAtTime(options.frequency, start);
  if (options.glideTo)
    oscillator.frequency.exponentialRampToValueAtTime(
      options.glideTo,
      start + options.duration,
    );
  if (options.detune) oscillator.detune.value = options.detune;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = options.cutoff ?? 4_000;
  const gain = context.createGain();
  const attack = options.attack ?? 0.008;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.gain, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  oscillator.connect(filter);
  filter.connect(gain);
  out(context, gain, options.send);
  oscillator.start(start);
  oscillator.stop(start + options.duration + 0.05);
}

function noise(
  context: AudioContext,
  options: {
    at: number;
    duration: number;
    gain: number;
    filter?: BiquadFilterType;
    frequency?: number;
    frequencyTo?: number;
    q?: number;
    attack?: number;
    send?: number;
  },
) {
  const start = context.currentTime + options.at;
  const length = Math.max(1, Math.ceil(context.sampleRate * options.duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index++)
    data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = options.filter ?? "lowpass";
  filter.frequency.setValueAtTime(options.frequency ?? 1_000, start);
  if (options.frequencyTo)
    filter.frequency.exponentialRampToValueAtTime(
      options.frequencyTo,
      start + options.duration,
    );
  filter.Q.value = options.q ?? 0.8;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    options.gain,
    start + (options.attack ?? 0.004),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  source.connect(filter);
  filter.connect(gain);
  out(context, gain, options.send);
  source.start(start);
}

function kick(context: AudioContext, at: number, gain: number, low = 45) {
  tone(context, {
    at,
    frequency: 150,
    glideTo: low,
    duration: 0.4,
    gain,
    type: "sine",
    cutoff: 800,
  });
}

/** "prrrrrr": a snare roll that swells for `duration` seconds. */
function roll(
  context: AudioContext,
  at: number,
  duration: number,
  peak: number,
) {
  const hits = Math.round(duration / 0.034);
  for (let hit = 0; hit < hits; hit++) {
    const progress = hit / hits;
    noise(context, {
      at: at + hit * 0.034,
      duration: 0.06,
      gain: 0.03 + peak * progress ** 1.6,
      filter: "bandpass",
      frequency: 1_800 + progress * 1_400,
      q: 0.9,
      send: 0.15,
    });
  }
}

function bell(
  context: AudioContext,
  at: number,
  frequency: number,
  gain: number,
) {
  const start = context.currentTime + at;
  const carrier = context.createOscillator();
  const modulator = context.createOscillator();
  const depth = context.createGain();
  carrier.frequency.value = frequency;
  modulator.frequency.value = frequency * 3.5;
  depth.gain.setValueAtTime(frequency * 2.2, start);
  depth.gain.exponentialRampToValueAtTime(1, start + 0.6);
  modulator.connect(depth);
  depth.connect(carrier.frequency);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
  carrier.connect(envelope);
  out(context, envelope, 0.35);
  carrier.start(start);
  modulator.start(start);
  carrier.stop(start + 0.75);
  modulator.stop(start + 0.75);
}

async function speak(
  context: AudioContext,
  name: keyof typeof VOICE_FILES,
  options: {
    at: number;
    gain: number;
    send: number;
    drive?: number;
    echo?: boolean;
  },
) {
  const buffer = await voice(context, name).catch(() => null);
  if (!buffer || context.state === "closed") return;
  const start = context.currentTime + options.at;
  const source = context.createBufferSource();
  source.buffer = buffer;
  let node: AudioNode = source;
  if (options.drive) {
    // Soft clipping pushes the synthetic voice toward a shout.
    const shaper = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index++) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(x * options.drive);
    }
    shaper.curve = curve;
    node.connect(shaper);
    node = shaper;
  }
  const gain = context.createGain();
  gain.gain.value = options.gain;
  node.connect(gain);
  out(context, gain, options.send);
  if (options.echo) {
    const delay = context.createDelay(1);
    delay.delayTime.value = 0.32;
    const feedback = context.createGain();
    feedback.gain.value = 0.38;
    const wet = context.createGain();
    wet.gain.value = 0.45;
    gain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    out(context, wet, 0.6);
  }
  source.start(start);
}

/**
 * One musical step per floor cleared: tum, tuuum, TUMMM, tu-dummm… then drum rolls
 * and a cymbal swell as the top gets close.
 */
export function playTowerStep(context: AudioContext, floor: number) {
  const index = Math.max(0, Math.min(9, floor - 1));
  const intensity = (index + 1) / 10;
  const frequency = ROOT * 2 ** (FLOOR_SEMITONES[index] / 12);
  const length = 0.22 + Math.min(0.9, index * 0.14);
  let at = 0;
  if (floor >= 4) {
    // Pick-up note before the main hit: "tu-dum".
    tone(context, {
      at: 0,
      frequency: frequency * 0.75,
      duration: 0.12,
      gain: 0.18 + intensity * 0.12,
      cutoff: 1_600,
      send: 0.1,
    });
    kick(context, 0, 0.25 + intensity * 0.2);
    at = 0.11;
  }
  kick(context, at, 0.35 + intensity * 0.45, floor >= 7 ? 38 : 48);
  tone(context, {
    at,
    frequency,
    duration: length,
    gain: 0.2 + intensity * 0.28,
    cutoff: 900 + intensity * 2_600,
    send: 0.12 + intensity * 0.3,
  });
  if (floor >= 3)
    for (const detune of [-9, 9])
      tone(context, {
        at,
        frequency: frequency * 2,
        duration: length * 0.9,
        gain: 0.05 + intensity * 0.09,
        type: "sawtooth",
        cutoff: 700 + intensity * 3_000,
        attack: 0.03,
        detune,
        send: 0.25,
      });
  if (floor >= 6)
    roll(
      context,
      at + 0.12,
      0.35 + (floor - 6) * 0.22,
      0.05 + intensity * 0.12,
    );
  if (floor >= 8)
    noise(context, {
      at: at + 0.05,
      duration: 0.9 + (floor - 8) * 0.3,
      gain: 0.05 + (floor - 8) * 0.03,
      filter: "highpass",
      frequency: 5_000,
      attack: 0.7 + (floor - 8) * 0.25,
      send: 0.4,
    });
}

export function playTowerStart(context: AudioContext) {
  kick(context, 0, 0.3, 40);
  tone(context, {
    at: 0,
    frequency: ROOT / 2,
    duration: 0.9,
    gain: 0.15,
    type: "sawtooth",
    cutoff: 300,
    attack: 0.05,
    send: 0.3,
  });
}

/** Cracks right away, then the boom, rumble and falling debris after `fallDelay`. */
export function playTowerCollapse(context: AudioContext, fallDelay: number) {
  for (const [index, at] of [0, 0.14, 0.33, 0.52].entries())
    noise(context, {
      at,
      duration: 0.09,
      gain: 0.35 - index * 0.05,
      filter: "highpass",
      frequency: 2_200,
      send: 0.2,
    });
  tone(context, {
    at: 0.05,
    frequency: 220,
    glideTo: 55,
    duration: 1.3,
    gain: 0.16,
    type: "sawtooth",
    cutoff: 900,
    send: 0.3,
  });
  const fall = fallDelay / 1000;
  kick(context, fall, 0.95, 26);
  kick(context, fall + 0.18, 0.6, 30);
  noise(context, {
    at: fall,
    duration: 2.6,
    gain: 0.55,
    filter: "lowpass",
    frequency: 500,
    frequencyTo: 70,
    attack: 0.05,
    send: 0.35,
  });
  for (let piece = 0; piece < 26; piece++) {
    const at = fall + 0.15 + Math.random() * 1.9;
    noise(context, {
      at,
      duration: 0.05 + Math.random() * 0.1,
      gain: 0.06 + Math.random() * 0.14 * (1 - (at - fall) / 2.2),
      filter: "bandpass",
      frequency: 500 + Math.random() * 2_600,
      q: 1.4,
      send: 0.15,
    });
  }
}

/** Coins tinkling on cash-out; a longer run the higher the climb. */
export function playTowerCashout(context: AudioContext, floor: number) {
  const notes = [0, 4, 7, 12, 16, 19, 24];
  const count = Math.min(notes.length, 3 + Math.floor(floor / 2));
  for (let note = 0; note < count; note++)
    bell(context, note * 0.07, 880 * 2 ** (notes[note] / 12), 0.12);
  kick(context, 0, 0.35, 50);
}

/** Lucky Tower revealed: a deep "Lucky!" drowned in reverb, over a golden shimmer. */
export function playTowerLucky(context: AudioContext) {
  for (let step = 0; step < 10; step++)
    bell(context, step * 0.05, 660 * 2 ** (step / 6), 0.05);
  tone(context, {
    at: 0,
    frequency: ROOT,
    duration: 2.4,
    gain: 0.14,
    type: "sawtooth",
    cutoff: 700,
    attack: 0.3,
    send: 0.6,
  });
  void speak(context, "lucky", { at: 0.15, gain: 1.1, send: 1.2, echo: true });
}

/** Lucky Tower jackpot: slot-machine bells ringing and a shouted "JACKPOT!". */
export function playTowerJackpot(context: AudioContext) {
  kick(context, 0, 1, 30);
  for (let ring = 0; ring < 44; ring++)
    bell(context, ring * 0.07, ring % 2 ? 1_760 : 1_318, 0.1);
  for (const semitones of [0, 4, 7, 12, 16])
    tone(context, {
      at: 0,
      frequency: ROOT * 2 * 2 ** (semitones / 12),
      duration: 2.8,
      gain: 0.08,
      type: "sawtooth",
      cutoff: 3_200,
      attack: 0.03,
      send: 0.45,
    });
  void speak(context, "jackpot", {
    at: 0.1,
    gain: 1.5,
    send: 0.7,
    drive: 3.5,
    echo: true,
  });
}
