export const CASINO_DEAL_INTERVAL = 320;

export type CasinoSoundEffect = "card" | "chips" | "fold" | "knock" | "shuffle";

const CASINO_SOUND_FILES: Record<
  Exclude<CasinoSoundEffect, "knock">,
  string[]
> = {
  card: [
    "/audio/poker/deal-1.mp3",
    "/audio/poker/deal-2.mp3",
    "/audio/poker/deal-3.mp3",
    "/audio/poker/deal-4.mp3",
  ],
  chips: [
    "/audio/poker/chips-1.mp3",
    "/audio/poker/chips-2.mp3",
    "/audio/poker/chips-3.mp3",
  ],
  fold: ["/audio/poker/fold-1.mp3", "/audio/poker/fold-2.mp3"],
  shuffle: ["/audio/poker/card-fan-1.mp3", "/audio/poker/card-fan-2.mp3"],
};

const sampleCaches = new WeakMap<
  AudioContext,
  Map<string, Promise<AudioBuffer>>
>();

function loadCasinoSample(context: AudioContext, path: string) {
  let cache = sampleCaches.get(context);
  if (!cache) {
    cache = new Map();
    sampleCaches.set(context, cache);
  }

  let sample = cache.get(path);
  if (!sample) {
    sample = fetch(path)
      .then((response) => {
        if (!response.ok)
          throw new Error(`Son du casino indisponible : ${path}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data));
    cache.set(path, sample);
  }
  return sample;
}

export function preloadCasinoSounds(context: AudioContext) {
  for (const path of Object.values(CASINO_SOUND_FILES).flat())
    void loadCasinoSample(context, path).catch(() => undefined);
}

export function playCasinoSound(
  context: AudioContext,
  effect: CasinoSoundEffect,
  count = 1,
) {
  if (effect === "knock") {
    for (const delay of [0, 0.14]) {
      playNoise(context, delay, 0.07, 720, 0.13, "lowpass");
      playTone(context, delay, 0.085, 165, 0.075);
    }
    return;
  }

  const files = CASINO_SOUND_FILES[effect];
  const startedAt = context.currentTime;
  const variant =
    effect === "card" ? 0 : Math.floor(Math.random() * files.length);

  for (let index = 0; index < count; index++) {
    const path = files[(variant + index) % files.length];
    const scheduledAt =
      startedAt + (effect === "card" ? index * CASINO_DEAL_INTERVAL : 0) / 1000;
    void loadCasinoSample(context, path)
      .then((buffer) => {
        if (context.state === "closed") return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value =
          effect === "chips" ? 0.48 : effect === "shuffle" ? 0.52 : 0.58;
        source.connect(gain);
        gain.connect(context.destination);
        source.start(Math.max(context.currentTime, scheduledAt));
      })
      .catch(() => undefined);
  }
}

function playNoise(
  context: AudioContext,
  delay: number,
  duration: number,
  frequency: number,
  volume: number,
  filterType: BiquadFilterType,
) {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(
    1,
    Math.ceil(sampleRate * duration),
    sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++) {
    const envelope = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const startsAt = context.currentTime + delay;
  source.buffer = buffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, startsAt);
  filter.Q.setValueAtTime(filterType === "bandpass" ? 5 : 0.7, startsAt);
  gain.gain.setValueAtTime(volume, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startsAt + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(startsAt);
  source.stop(startsAt + duration);
}

function playTone(
  context: AudioContext,
  delay: number,
  duration: number,
  frequency: number,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startsAt = context.currentTime + delay;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  oscillator.frequency.exponentialRampToValueAtTime(
    frequency * 0.65,
    startsAt + duration,
  );
  gain.gain.setValueAtTime(volume, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration);
}
