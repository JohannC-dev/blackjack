/**
 * Plinko sounds, synthesised on the fly. A salvo puts dozens of balls on the
 * board at once, so every sound here is budgeted before it is played: peg
 * ticks have a rate limit, landings in a crowded board keep only what is worth
 * hearing, and the whole game goes through one compressor so that nothing
 * stacked can ever clip.
 */

type PlinkoAudio = {
  bus: GainNode;
  noise: AudioBuffer;
  /** When the last sound of each kind started, on the context clock. */
  lastPeg: number;
  lastLanding: number;
  lastBigWin: number;
};

const voices = new WeakMap<AudioContext, PlinkoAudio>();

/** Major pentatonic, in semitones: any two ticks sound fine together. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** Pitch of the first row; the ball goes down the scale as it falls. */
const PEG_TOP_HZ = 1568;
/** A board with one or two balls ticks at every peg, a salvo far less often. */
const PEG_GAP_ALONE = 0.03;
const PEG_GAP_CROWDED = 0.07;
/** In a crowded board: a small win at most this often, a big one this often. */
const SMALL_WIN_GAP = 0.14;
const BIG_WIN_GAP = 0.45;

function audioFor(context: AudioContext) {
  let audio = voices.get(context);
  if (audio) return audio;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 12;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  const bus = context.createGain();
  bus.gain.value = 0.8;
  bus.connect(compressor);
  compressor.connect(context.destination);

  const length = Math.ceil(context.sampleRate * 0.3);
  const noise = context.createBuffer(1, length, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < length; index++)
    samples[index] = Math.random() * 2 - 1;

  audio = { bus, noise, lastPeg: -1, lastLanding: -1, lastBigWin: -1 };
  voices.set(context, audio);
  return audio;
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
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(audioFor(context).bus);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function thud(context: AudioContext, gain: number) {
  if (context.state === "closed") return;
  const start = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = audioFor(context).noise;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(520, start);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(audioFor(context).bus);
  source.start(start, 0, 0.1);
}

const semitones = (base: number, steps: number) =>
  base * Math.pow(2, steps / 12);

/**
 * A ball strikes a peg of \`row\`. \`live\` is the number of balls on the
 * board: past a couple of them, ticks thin out and soften, so a salvo reads
 * as a light rain rather than a drum roll.
 */
export function playPlinkoPeg(
  context: AudioContext,
  row: number,
  rows: number,
  live: number,
) {
  const audio = audioFor(context);
  const now = context.currentTime;
  const crowded = live > 2;
  if (now - audio.lastPeg < (crowded ? PEG_GAP_CROWDED : PEG_GAP_ALONE)) return;
  audio.lastPeg = now;
  // Down the scale as the ball falls: two octaves over the whole board.
  const step = Math.round((row / Math.max(1, rows - 1)) * 10);
  const octave = Math.floor(step / PENTATONIC.length);
  const frequency = semitones(
    PEG_TOP_HZ,
    -(octave * 12 + PENTATONIC[step % PENTATONIC.length]),
  );
  const gain = crowded ? 0.035 / Math.sqrt(live / 2) : 0.05;
  tone(context, { frequency, duration: 0.05, gain, type: "triangle" });
  tone(context, {
    frequency: frequency * 2.01,
    duration: 0.03,
    gain: gain / 3,
  });
}

/** Balls leave the top of the board: one soft pop per salvo, not per ball. */
export function playPlinkoRelease(context: AudioContext) {
  tone(context, { frequency: 420, to: 240, duration: 0.09, gain: 0.06 });
}

/**
 * A ball lands in a slot paying \`multiplier\`. Alone on the board every slot
 * has its sound; in a crowded board (a salvo, the auto mode) losses stay
 * silent, small wins are spaced out and only the big ones sing.
 */
export function playPlinkoLanding(
  context: AudioContext,
  multiplier: number,
  crowded: boolean,
) {
  const audio = audioFor(context);
  const now = context.currentTime;
  const since = now - audio.lastLanding;

  if (multiplier >= 10) {
    if (crowded && now - audio.lastBigWin < BIG_WIN_GAP) return;
    audio.lastBigWin = now;
    audio.lastLanding = now;
    // A quick climb, then a chord that rings out; longer for a jackpot.
    const ring = multiplier >= 100 ? 1.4 : 0.8;
    [0, 4, 7, 12].forEach((step, index) =>
      tone(context, {
        at: index * 0.055,
        frequency: semitones(523.25, step),
        duration: 0.14,
        gain: 0.07,
        type: "triangle",
      }),
    );
    for (const step of multiplier >= 100 ? [-12, 12, 16, 19] : [12, 16, 19])
      tone(context, {
        at: 0.22,
        frequency: semitones(523.25, step),
        duration: ring,
        gain: 0.035,
      });
    return;
  }

  if (multiplier >= 3) {
    if (crowded && since < SMALL_WIN_GAP) return;
    audio.lastLanding = now;
    [0, 4, 7].forEach((step, index) =>
      tone(context, {
        at: index * 0.05,
        frequency: semitones(659.25, step),
        duration: 0.12,
        gain: 0.06,
        type: "triangle",
      }),
    );
    return;
  }

  if (multiplier >= 1) {
    if (crowded && since < SMALL_WIN_GAP * 2) return;
    audio.lastLanding = now;
    tone(context, {
      frequency: 783.99,
      duration: 0.1,
      gain: crowded ? 0.035 : 0.055,
      type: "triangle",
    });
    return;
  }

  // A loss: a muffled knock alone, nothing at all in a busy board.
  if (crowded) return;
  audio.lastLanding = now;
  thud(context, 0.09);
  tone(context, { frequency: 190, to: 120, duration: 0.12, gain: 0.05 });
}
