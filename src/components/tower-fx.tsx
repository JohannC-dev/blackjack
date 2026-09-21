"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type Ref,
  type RefObject,
} from "react";

export type TowerFxHandle = {
  /** Fireworks from the top of the tower. */
  burst: (kind: "win" | "jackpot") => void;
  /** Dust cloud at the foot of the tower. */
  collapse: () => void;
  /** Small spray of sparks at a point of the page (client coordinates). */
  pop: (clientX: number, clientY: number) => void;
};

type Palette = "fire" | "gold";
type Kind = "ember" | "spark" | "smoke" | "debris" | "dust";
type Particle = {
  kind: Kind;
  palette: Palette;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  gravity: number;
  drag: number;
  seed: number;
};
type Ring = {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  palette: Palette;
};

/**
 * How the fire grows with the floors cleared (index 0 to 10). Heights are fractions of
 * the tower height so the same curve works on the lobby poster and on the game stage.
 * The first floors only smoulder; real flames appear at the base on floor 3, climb the
 * walls from floor 5 and crown the tower on floors 9–10.
 */
const FIRE_PROFILE: {
  embers: number;
  base: number;
  side: number;
  crown: number;
  sparks: number;
  smoke: number;
  glow: number;
}[] = [
  { embers: 0, base: 0, side: 0, crown: 0, sparks: 0, smoke: 0, glow: 0 },
  { embers: 3, base: 0, side: 0, crown: 0, sparks: 0, smoke: 0, glow: 0.08 },
  { embers: 7, base: 0, side: 0, crown: 0, sparks: 0, smoke: 0, glow: 0.16 },
  {
    embers: 9,
    base: 0.045,
    side: 0,
    crown: 0,
    sparks: 2,
    smoke: 0,
    glow: 0.26,
  },
  {
    embers: 11,
    base: 0.08,
    side: 0,
    crown: 0,
    sparks: 4,
    smoke: 0,
    glow: 0.34,
  },
  {
    embers: 12,
    base: 0.11,
    side: 0.2,
    crown: 0,
    sparks: 7,
    smoke: 0,
    glow: 0.44,
  },
  {
    embers: 14,
    base: 0.14,
    side: 0.36,
    crown: 0,
    sparks: 10,
    smoke: 1,
    glow: 0.54,
  },
  {
    embers: 16,
    base: 0.18,
    side: 0.56,
    crown: 0,
    sparks: 15,
    smoke: 2,
    glow: 0.64,
  },
  {
    embers: 18,
    base: 0.21,
    side: 0.76,
    crown: 0.05,
    sparks: 20,
    smoke: 3,
    glow: 0.74,
  },
  {
    embers: 20,
    base: 0.25,
    side: 0.94,
    crown: 0.13,
    sparks: 28,
    smoke: 4,
    glow: 0.86,
  },
  {
    embers: 22,
    base: 0.3,
    side: 1,
    crown: 0.24,
    sparks: 36,
    smoke: 5,
    glow: 1,
  },
];

function profileAt(level: number) {
  const clamped = Math.max(0, Math.min(10, level));
  const low = Math.floor(clamped);
  const high = Math.min(10, low + 1);
  const t = clamped - low;
  const a = FIRE_PROFILE[low];
  const b = FIRE_PROFILE[high];
  const mix = (key: keyof typeof a) => a[key] + (b[key] - a[key]) * t;
  return {
    embers: mix("embers"),
    base: mix("base"),
    side: mix("side"),
    crown: mix("crown"),
    sparks: mix("sparks"),
    smoke: mix("smoke"),
    glow: mix("glow"),
  };
}

const MAX_PARTICLES = 1_400;
const COLORS: Record<Palette, [string, string, string, string]> = {
  // core, mid, outer, spark
  fire: ["#fff7da", "#ffb13b", "#ff4a1c", "#ffe7a8"],
  gold: ["#fffbe8", "#ffd66b", "#e39b22", "#fff3c4"],
};

type Stop = [number, number, number, number, number];
// Colour of the fire by temperature (0 to 1): transparent, embers, red, orange, yellow, white.
const FIRE_STOPS: Stop[] = [
  [0, 0, 0, 0, 0],
  [0.1, 90, 12, 8, 0],
  [0.24, 196, 38, 12, 150],
  [0.42, 250, 96, 20, 230],
  [0.62, 255, 170, 56, 255],
  [0.82, 255, 228, 140, 255],
  [1, 255, 250, 228, 255],
];
const GOLD_STOPS: Stop[] = [
  [0, 0, 0, 0, 0],
  [0.1, 90, 56, 10, 0],
  [0.24, 186, 112, 22, 150],
  [0.42, 240, 168, 48, 230],
  [0.62, 255, 212, 104, 255],
  [0.82, 255, 238, 186, 255],
  [1, 255, 252, 240, 255],
];

function sample(stops: Stop[], t: number, channel: number) {
  let index = 1;
  while (index < stops.length - 1 && stops[index][0] < t) index++;
  const from = stops[index - 1];
  const to = stops[index];
  const progress = Math.max(
    0,
    Math.min(1, (t - from[0]) / (to[0] - from[0] || 1)),
  );
  return from[channel] + (to[channel] - from[channel]) * progress;
}

/** 256 packed RGBA colours (little-endian ABGR) written straight into ImageData. */
function fireLut(gold: number) {
  const lut = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    const t = index / 255;
    const channel = (value: number) =>
      Math.round(
        sample(FIRE_STOPS, t, value) * (1 - gold) +
          sample(GOLD_STOPS, t, value) * gold,
      );
    lut[index] =
      ((channel(4) << 24) |
        (channel(3) << 16) |
        (channel(2) << 8) |
        channel(1)) >>>
      0;
  }
  return lut;
}

type FireOptions = {
  bounds: { left: number; right: number; top: number; bottom: number };
  base: number;
  side: number;
  crown: number;
  lit: boolean;
  sway: number;
  lut: Uint32Array;
  frozen: boolean;
};

/**
 * Classic cellular ("Doom") fire: every cell takes the heat of a random neighbour below
 * it, minus a random cooling. Hot cells placed along the tower feed flames that rise,
 * flicker and sway. The grid is a few thousand cells, drawn once per frame with
 * putImageData and smoothed by the browser when the canvas is scaled up to the stage.
 */
function createFireGrid(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  let seed = 0x2545f491;
  const random01 = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4_294_967_296;
  };
  let cell = 5;
  let width = 0;
  let height = 0;
  let heat = new Float32Array(0);
  let image: ImageData | null = null;
  let pixels = new Uint32Array(0);
  let idle = false;
  return {
    resize(cssWidth: number, cssHeight: number) {
      cell = cssWidth > 700 ? 4 : 3;
      // A light blur melts the grid cells into soft flames at almost no cost.
      canvas.style.filter = `blur(${cell * 0.7}px)`;
      width = Math.max(1, Math.ceil(cssWidth / cell));
      height = Math.max(1, Math.ceil(cssHeight / cell));
      canvas.width = width;
      canvas.height = height;
      heat = new Float32Array(width * height);
      image = context.createImageData(width, height);
      pixels = new Uint32Array(image.data.buffer);
      idle = false;
    },
    step(options: FireOptions) {
      if (!image || (idle && !options.lit)) return;
      const { left, right, top, bottom } = options.bounds;
      const towerHeight = Math.max(1, bottom - top);

      if (!options.frozen) {
        // How far the flames rise above their source, in pixels.
        const reach = Math.max(
          12,
          towerHeight *
            Math.max(options.base, options.crown, options.side > 0 ? 0.13 : 0),
        );
        const cooling = (2 * cell) / reach;
        let hottest = 0;
        for (let y = 0; y < height - 1; y++) {
          const row = y * width;
          const below = row + width;
          for (let x = 0; x < width; x++) {
            let source = x + Math.floor(random01() * 3 - 1 + options.sway);
            if (source < 0) source = 0;
            else if (source >= width) source = width - 1;
            const value = heat[below + source] - random01() * cooling;
            const next = value > 0 ? value : 0;
            heat[row + x] = next;
            if (next > hottest) hottest = next;
          }
        }
        heat.fill(0, (height - 1) * width);

        if (options.lit) {
          const feed = (x: number, y: number, strength: number) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return;
            const index = y * width + x;
            const value = strength * (0.7 + random01() * 0.3);
            if (value > heat[index]) heat[index] = value;
          };
          const baseRow = Math.floor(bottom / cell);
          const leftCell = Math.floor(left / cell);
          const rightCell = Math.floor(right / cell);
          if (options.base > 0) {
            const spread = Math.max(2, Math.round(30 / cell));
            const strength = Math.min(1, 0.6 + options.base * 2.2);
            for (let x = leftCell - spread; x <= rightCell + spread; x++) {
              const edge = Math.min(
                x - (leftCell - spread),
                rightCell + spread - x,
              );
              const taper = Math.min(1, (edge + 1) / spread);
              feed(x, baseRow, strength * taper);
              feed(x, baseRow - 1, strength * taper);
            }
          }
          if (options.side > 0) {
            const litTop = Math.floor(
              (bottom - towerHeight * options.side) / cell,
            );
            for (let y = litTop; y <= baseRow; y++)
              for (const x of [
                leftCell - 1,
                leftCell,
                rightCell,
                rightCell + 1,
              ])
                feed(x, y, 0.95);
          }
          if (options.crown > 0) {
            const crownRow = Math.floor(top / cell);
            const strength = Math.min(1, 0.55 + options.crown * 2);
            for (let x = leftCell; x <= rightCell; x++) {
              feed(x, crownRow, strength);
              feed(x, crownRow + 1, strength);
            }
          }
        }
        idle = !options.lit && hottest < 0.004;
      }

      const lut = options.lut;
      for (let index = 0; index < heat.length; index++) {
        const value = heat[index];
        pixels[index] = lut[value >= 1 ? 255 : (value * 255) | 0];
      }
      context.putImageData(image, 0, 0);
    },
  };
}

function sprite(color: string, soft = 0.55) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(soft, `${color}88`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return canvas;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const layer: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

/**
 * Fire around `targetRef`, grown by `heat` (0 to 1, one tenth per floor): a cellular fire
 * on a 2D canvas, with particles on top for embers, sparks, smoke and the explosions.
 */
export function TowerFx({
  targetRef,
  heat,
  golden = false,
  density = 1,
  brazier = false,
  ref,
  className,
}: {
  targetRef: RefObject<HTMLElement | null>;
  heat: number;
  golden?: boolean;
  /** Scales particle emission, e.g. lower on small posters. */
  density?: number;
  /** Flames only from the base, taller: for shapes whose sides are not vertical. */
  brazier?: boolean;
  ref?: Ref<TowerFxHandle>;
  className?: string;
}) {
  const fireRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ heat, golden, density, brazier });
  settings.current = { heat, golden, density, brazier };
  const world = useRef({
    particles: [] as Particle[],
    rings: [] as Ring[],
    flash: 0,
    flashPalette: "fire" as Palette,
    boost: 0,
    bounds: { left: 0, right: 0, top: 0, bottom: 0 },
    host: { left: 0, top: 0 },
    reduced: false,
  });

  const spawn = (particle: Omit<Particle, "age" | "seed">) => {
    const { particles } = world.current;
    if (particles.length < MAX_PARTICLES)
      particles.push({ ...particle, age: 0, seed: Math.random() * 1_000 });
  };

  useImperativeHandle(ref, () => ({
    burst(kind) {
      const state = world.current;
      const palette: Palette =
        kind === "jackpot" || settings.current.golden ? "gold" : "fire";
      const { left, right, top } = state.bounds;
      const centerX = (left + right) / 2;
      state.flash = kind === "jackpot" ? 1 : 0.75;
      state.flashPalette = palette;
      state.boost = kind === "jackpot" ? 3 : 2;
      if (state.reduced) return;
      const origins =
        kind === "jackpot"
          ? [
              [centerX, top + 30, 0],
              [left + 20, top + 140, 350],
              [right - 20, top + 110, 650],
              [centerX, top + 60, 950],
            ]
          : [[centerX, top + 30, 0]];
      for (const [x, y, delay] of origins)
        window.setTimeout(() => {
          state.rings.push({
            x,
            y,
            age: 0,
            life: 0.9,
            radius: kind === "jackpot" ? 520 : 380,
            palette,
          });
          const count = kind === "jackpot" ? 240 : 200;
          for (let index = 0; index < count; index++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = random(160, kind === "jackpot" ? 820 : 680);
            spawn({
              kind: index % 3 ? "debris" : "spark",
              palette: index % 5 ? palette : "fire",
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 140,
              life: random(0.9, 2.1),
              size: index % 3 ? random(7, 16) : random(2, 3.5),
              gravity: 420,
              drag: 0.982,
            });
          }
        }, delay);
    },
    collapse() {
      const state = world.current;
      const { left, right, bottom } = state.bounds;
      state.flash = 0.35;
      state.flashPalette = "fire";
      if (state.reduced) return;
      for (let index = 0; index < 90; index++)
        spawn({
          kind: "dust",
          palette: "fire",
          x: random(left - 60, right + 60),
          y: bottom + random(-30, 10),
          vx: random(-160, 160),
          vy: random(-90, -10),
          life: random(1.4, 2.6),
          size: random(30, 80),
          gravity: -8,
          drag: 0.97,
        });
      for (let index = 0; index < 50; index++)
        spawn({
          kind: "spark",
          palette: "fire",
          x: random(left, right),
          y: bottom - random(0, 60),
          vx: random(-260, 260),
          vy: random(-380, -80),
          life: random(0.6, 1.2),
          size: random(2, 3),
          gravity: 700,
          drag: 0.99,
        });
    },
    pop(clientX, clientY) {
      const state = world.current;
      if (state.reduced) return;
      const x = clientX - state.host.left;
      const y = clientY - state.host.top;
      const palette: Palette = settings.current.golden ? "gold" : "fire";
      for (let index = 0; index < 26; index++) {
        const angle = random(-Math.PI, 0);
        const speed = random(80, 300);
        spawn({
          kind: "spark",
          palette,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: random(0.4, 0.9),
          size: random(1.8, 3),
          gravity: 500,
          drag: 0.98,
        });
      }
    },
  }));

  useEffect(() => {
    const fireCanvas = fireRef.current!;
    const canvas = particlesRef.current!;
    const context = canvas.getContext("2d")!;
    const fire = createFireGrid(fireCanvas);
    const state = world.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    state.reduced = media.matches;
    const onMotion = () => (state.reduced = media.matches);
    media.addEventListener("change", onMotion);

    const sprites = {
      fire: COLORS.fire.map((color) => sprite(color)),
      gold: COLORS.gold.map((color) => sprite(color)),
      smoke: sprite("#3a3040", 0.4),
      dust: sprite("#8a7f95", 0.45),
    };
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      fire?.resize(fireCanvas.clientWidth, fireCanvas.clientHeight);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const emitters = { embers: 0, sparks: 0, smoke: 0 };
    let level = settings.current.heat * 10;
    let gold = settings.current.golden ? 1 : 0;
    let lut = fireLut(gold);
    let lutGold = gold;
    let last = performance.now();
    let clock = 0;
    let frame = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!state.reduced) clock += dt;
      const host = canvas.getBoundingClientRect();
      state.host = { left: host.left, top: host.top };
      const target = targetRef.current?.getBoundingClientRect();
      if (target)
        state.bounds = {
          left: target.left - host.left,
          right: target.right - host.left,
          top: target.top - host.top,
          bottom: target.bottom - host.top,
        };
      const { left, right, top, bottom } = state.bounds;
      const height = Math.max(1, bottom - top);
      const { density, golden } = settings.current;

      // Grow or die down smoothly instead of jumping from one floor to the next.
      const goal = settings.current.heat * 10 + state.boost;
      level += (goal - level) * Math.min(1, dt * (goal > level ? 1.8 : 1.2));
      state.boost = Math.max(0, state.boost - dt * 1.2);
      gold += ((golden ? 1 : 0) - gold) * Math.min(1, dt * 3);
      const profile = profileAt(level);
      if (settings.current.brazier) {
        profile.base = Math.min(0.7, profile.base * 3.2);
        profile.side = 0;
        profile.crown = 0;
      }
      const palette: Palette = golden ? "gold" : "fire";

      if (fire) {
        if (Math.abs(gold - lutGold) > 0.02) {
          lut = fireLut(gold);
          lutGold = gold;
        }
        fire.step({
          bounds: state.bounds,
          base: profile.base,
          side: profile.side,
          crown: profile.crown,
          lit: Boolean(target) && level > 2.2,
          sway: Math.sin(clock * 0.7) * 0.35,
          lut,
          frozen: state.reduced,
        });
      }

      if (target && !state.reduced) {
        const litTop = bottom - height * Math.max(profile.base, profile.side);
        emitters.embers += dt * profile.embers * density;
        while (emitters.embers >= 1) {
          emitters.embers--;
          spawn({
            kind: "ember",
            palette,
            x: random(left - 20, right + 20),
            y: bottom + random(-4, 6),
            vx: random(-14, 14),
            vy: -random(25, 70),
            life: random(1.4, 3),
            size: random(1.6, 2.8),
            gravity: -6,
            drag: 0.995,
          });
        }
        emitters.sparks += dt * profile.sparks * density;
        while (emitters.sparks >= 1) {
          emitters.sparks--;
          spawn({
            kind: "spark",
            palette,
            x: random(left - 30, right + 30),
            y: random(litTop, bottom),
            vx: random(-40, 40),
            vy: -random(140, 320),
            life: random(0.9, 2),
            size: random(1.6, 2.8),
            gravity: -20,
            drag: 0.995,
          });
        }
        emitters.smoke += dt * profile.smoke * density;
        while (emitters.smoke >= 1) {
          emitters.smoke--;
          spawn({
            kind: "smoke",
            palette,
            x: random(left, right),
            y: top + random(-20, 40),
            vx: random(-20, 20),
            vy: -random(30, 70),
            life: random(1.8, 3),
            size: random(50, 90),
            gravity: -10,
            drag: 0.99,
          });
        }
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const particles = state.particles;
      let alive = 0;
      // Smoke and dust are drawn normally, beneath the additive sparks.
      context.globalCompositeOperation = "source-over";
      for (const particle of particles) {
        particle.age += dt;
        if (particle.age >= particle.life) continue;
        particles[alive++] = particle;
        particle.vx *= particle.drag;
        particle.vy = particle.vy * particle.drag + particle.gravity * dt;
        if (particle.kind === "ember")
          particle.vx += Math.sin(now / 300 + particle.seed) * 30 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.kind !== "smoke" && particle.kind !== "dust") continue;
        const t = particle.age / particle.life;
        const size = particle.size * (0.6 + t * 1.4);
        context.globalAlpha =
          (particle.kind === "dust" ? 0.55 : 0.28) *
          (1 - t) *
          Math.min(1, t * 6);
        context.drawImage(
          particle.kind === "dust" ? sprites.dust : sprites.smoke,
          particle.x - size / 2,
          particle.y - size / 2,
          size,
          size,
        );
      }
      particles.length = alive;

      context.globalCompositeOperation = "lighter";
      if (target && profile.glow > 0.01) {
        const centerX = (left + right) / 2;
        const radius = Math.max(60, (right - left) * 0.95);
        const glowColor = golden ? "255, 190, 70" : "255, 110, 30";
        const gradient = context.createRadialGradient(
          centerX,
          bottom,
          0,
          centerX,
          bottom,
          radius,
        );
        gradient.addColorStop(0, `rgba(${glowColor}, ${profile.glow * 0.3})`);
        gradient.addColorStop(1, `rgba(${glowColor}, 0)`);
        context.globalAlpha = 1;
        context.fillStyle = gradient;
        context.fillRect(
          centerX - radius,
          bottom - radius,
          radius * 2,
          radius * 2,
        );
      }
      for (const particle of particles) {
        if (particle.kind === "smoke" || particle.kind === "dust") continue;
        const t = particle.age / particle.life;
        const colors = sprites[particle.palette];
        let image = colors[1];
        let size = particle.size;
        let alpha = 1 - t;
        if (particle.kind === "spark") {
          image = colors[3];
          size = particle.size * 3.2;
          alpha = (1 - t) * (0.6 + 0.4 * Math.sin(now / 40 + particle.seed));
        } else if (particle.kind === "ember") {
          image = t < 0.5 ? colors[1] : colors[2];
          size = particle.size * 4;
          alpha =
            Math.min(1, t * 5) *
            (1 - t) *
            (0.55 + 0.45 * Math.sin(now / 120 + particle.seed));
        } else {
          image = t < 0.35 ? colors[0] : colors[1];
          size = particle.size * (1 - t * 0.5);
        }
        context.globalAlpha = Math.max(0, alpha);
        context.drawImage(
          image,
          particle.x - size / 2,
          particle.y - size / 2,
          size,
          size,
        );
      }

      state.rings = state.rings.filter((ring) => (ring.age += dt) < ring.life);
      for (const ring of state.rings) {
        const t = ring.age / ring.life;
        context.globalAlpha = (1 - t) ** 2 * 0.8;
        context.strokeStyle = COLORS[ring.palette][1];
        context.lineWidth = 10 * (1 - t) + 1;
        context.beginPath();
        context.arc(
          ring.x,
          ring.y,
          ring.radius * (1 - (1 - t) ** 3),
          0,
          Math.PI * 2,
        );
        context.stroke();
      }

      if (state.flash > 0.01) {
        const width = canvas.width / dpr;
        const heightPx = canvas.height / dpr;
        const gradient = context.createRadialGradient(
          (left + right) / 2,
          top + 40,
          0,
          (left + right) / 2,
          top + 40,
          Math.max(width, heightPx),
        );
        gradient.addColorStop(0, COLORS[state.flashPalette][0]);
        gradient.addColorStop(0.35, `${COLORS[state.flashPalette][1]}66`);
        gradient.addColorStop(1, "#00000000");
        context.globalAlpha = state.flash * 0.7;
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, heightPx);
        state.flash = Math.max(0, state.flash - dt * 1.6);
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", onMotion);
    };
  }, [targetRef]);

  return (
    <div className={className} aria-hidden="true">
      <canvas ref={fireRef} style={{ ...layer, mixBlendMode: "screen" }} />
      <canvas ref={particlesRef} style={layer} />
    </div>
  );
}
