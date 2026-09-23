const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
const STEP_SCALE = [
  0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29, 31, 33,
];

function noiseBuffer(context: AudioContext) {
  let buffer = noiseBuffers.get(context);
  if (buffer) return buffer;
  const length = Math.ceil(context.sampleRate * 0.7);
  buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index++) {
    const fade = 1 - index / length;
    samples[index] = (Math.random() * 2 - 1) * fade * fade;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

function tone(
  context: AudioContext,
  {
    at = 0,
    frequency,
    to,
    duration,
    gain,
    type = "sine",
  }: {
    at?: number;
    frequency: number;
    to?: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
  },
) {
  if (context.state === "closed") return;
  const start = context.currentTime + at;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (to)
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, to),
      start + duration,
    );
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.015);
}

function filteredNoise(
  context: AudioContext,
  {
    at = 0,
    duration,
    gain,
    frequency,
    filter = "lowpass",
  }: {
    at?: number;
    duration: number;
    gain: number;
    frequency: number;
    filter?: BiquadFilterType;
  },
) {
  if (context.state === "closed") return;
  const start = context.currentTime + at;
  const source = context.createBufferSource();
  const band = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = noiseBuffer(context);
  band.type = filter;
  band.frequency.setValueAtTime(frequency, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(band);
  band.connect(envelope);
  envelope.connect(context.destination);
  source.start(start, 0, duration);
}

/** A light two-note cue when a new chicken run begins. */
export function playChickenStart(context: AudioContext) {
  tone(context, { frequency: 360, to: 510, duration: 0.12, gain: 0.045 });
  tone(context, {
    at: 0.09,
    frequency: 560,
    to: 720,
    duration: 0.15,
    gain: 0.04,
  });
}

/** A quick hop followed by the soft clack of a newly placed road barrier. */
export function playChickenStep(context: AudioContext, step: number) {
  const index = Math.max(0, Math.min(STEP_SCALE.length - 1, step - 1));
  const intensity = (index + 1) / STEP_SCALE.length;
  const pitch = 196 * 2 ** ((STEP_SCALE[index] ?? 0) / 12);
  const length = 0.2 + intensity * 0.36;
  const milestone = step > 0 && step % 5 === 0;
  const mainAt = milestone ? 0.055 : 0;

  if (milestone)
    tone(context, {
      frequency: pitch * 0.75,
      to: pitch,
      duration: 0.11,
      gain: 0.024 + intensity * 0.018,
      type: "sine",
    });

  tone(context, {
    at: mainAt,
    frequency: pitch,
    to: pitch * 1.1,
    duration: length,
    gain: 0.052 + intensity * 0.068,
    type: "triangle",
  });

  if (index >= 3)
    tone(context, {
      at: mainAt + 0.015,
      frequency: pitch * 1.5,
      duration: length * 0.82,
      gain: 0.016 + intensity * 0.034,
      type: "sine",
    });

  if (index >= 7)
    tone(context, {
      at: mainAt + 0.025,
      frequency: pitch / 2,
      to: pitch / 2.08,
      duration: length * 0.72,
      gain: 0.018 + intensity * 0.028,
      type: "sine",
    });

  if (index >= 13)
    tone(context, {
      at: mainAt + 0.045,
      frequency: pitch * 2,
      duration: length * 0.68,
      gain: 0.009 + intensity * 0.019,
      type: "sine",
    });

  tone(context, {
    at: mainAt + 0.19,
    frequency: 1_080,
    to: 620,
    duration: 0.075,
    gain: 0.021 + intensity * 0.016,
    type: "triangle",
  });
  filteredNoise(context, {
    at: mainAt + 0.19,
    duration: 0.055,
    gain: 0.016 + intensity * 0.01,
    frequency: 2_500,
    filter: "highpass",
  });
}

/** A short rev, rush and low impact for the fatal lane. */
export function playChickenCollision(context: AudioContext) {
  tone(context, {
    frequency: 105,
    to: 245,
    duration: 0.34,
    gain: 0.065,
    type: "sawtooth",
  });
  filteredNoise(context, {
    at: 0.07,
    duration: 0.4,
    gain: 0.035,
    frequency: 1_500,
    filter: "highpass",
  });
  tone(context, {
    at: 0.43,
    frequency: 145,
    to: 48,
    duration: 0.3,
    gain: 0.15,
    type: "triangle",
  });
  filteredNoise(context, {
    at: 0.43,
    duration: 0.12,
    gain: 0.095,
    frequency: 380,
  });
}

/** A small rising chime when the player banks a run. */
export function playChickenCashout(context: AudioContext, delay = 0) {
  for (const [index, frequency] of [740, 990, 1_320].entries())
    tone(context, {
      at: delay + index * 0.065,
      frequency,
      duration: 0.18,
      gain: 0.045,
      type: "sine",
    });
}
