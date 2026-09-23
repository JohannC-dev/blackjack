const SPIN_SECONDS = 4.6;

function addRatchetClick(
  samples: Float32Array,
  sampleRate: number,
  seconds: number,
  strength: number,
  tone: number,
) {
  const start = Math.floor(seconds * sampleRate);
  const length = Math.min(
    Math.floor(sampleRate * 0.035),
    samples.length - start,
  );
  let filtered = 0;

  for (let index = 0; index < length; index++) {
    const time = index / sampleRate;
    const noise = Math.random() * 2 - 1;
    filtered += (noise - filtered) * 0.3;
    const snap = (noise - filtered * 0.45) * Math.exp(-time * 380);
    const body = filtered * Math.exp(-time * 195);
    const ring = Math.sin(2 * Math.PI * tone * time) * Math.exp(-time * 260);
    const rebound =
      time > 0.007 && time < 0.013
        ? noise * Math.exp(-(time - 0.007) * 550) * 0.18
        : 0;
    samples[start + index] +=
      (snap * 0.62 + body * 0.28 + ring * 0.1 + rebound) * strength;
  }
}

/** A dry pawl clicks across the teeth, then the wheel slows to a final stop. */
export function playRouletteSpin(context: AudioContext) {
  if (context.state === "suspended") void context.resume();
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(
    1,
    Math.floor(sampleRate * SPIN_SECONDS),
    sampleRate,
  );
  const samples = buffer.getChannelData(0);

  let time = 0.035;
  let tooth = 0;
  while (time < SPIN_SECONDS - 0.3) {
    const progress = time / SPIN_SECONDS;
    const emphasis = tooth % 4 === 0 ? 1.13 : 0.94;
    addRatchetClick(
      samples,
      sampleRate,
      time,
      (0.75 - progress * 0.12) * emphasis,
      1750 + (tooth % 3) * 130,
    );
    time += 0.038 + 0.25 * progress ** 2.7;
    tooth++;
  }
  addRatchetClick(samples, sampleRate, SPIN_SECONDS - 0.14, 0.85, 1450);

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.72;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
}
