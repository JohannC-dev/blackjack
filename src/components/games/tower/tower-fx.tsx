"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
  type RefObject,
} from "react";

export type TowerFxHandle = {
  /** Burst of light from the top of the tower. */
  burst: (kind: "win" | "jackpot") => void;
  /** Rockets launched across the stage; `intensity` from 0 to 1 sets how many. */
  fireworks: (intensity: number) => void;
  /** Dust cloud at the foot of the tower. */
  collapse: () => void;
  /** Small spray of light at a point of the page (client coordinates). */
  pop: (clientX: number, clientY: number) => void;
};

type Palette = "violet" | "gold";
type Kind = "mote" | "streak" | "spark" | "shard" | "dust" | "rocket";
type Particle = {
  kind: Kind;
  color: string;
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
  /** Rockets explode into this many shards when their life ends. */
  payload?: number;
};
type Ring = {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  color: string;
};

/**
 * How the ascension builds up with the floors cleared (index 0 to 10): a few motes of
 * light at first, then more and faster, light streaks rushing up from floor 6 and a
 * sparkling crown on the last floors.
 */
const ASCENT_PROFILE: {
  motes: number;
  speed: number;
  streaks: number;
  crown: number;
  glow: number;
}[] = [
  { motes: 0, speed: 0, streaks: 0, crown: 0, glow: 0 },
  { motes: 3, speed: 30, streaks: 0, crown: 0, glow: 0.06 },
  { motes: 6, speed: 40, streaks: 0, crown: 0, glow: 0.12 },
  { motes: 9, speed: 55, streaks: 0, crown: 0, glow: 0.2 },
  { motes: 13, speed: 70, streaks: 0, crown: 0, glow: 0.28 },
  { motes: 17, speed: 90, streaks: 1, crown: 0, glow: 0.36 },
  { motes: 22, speed: 115, streaks: 3, crown: 0, glow: 0.46 },
  { motes: 27, speed: 145, streaks: 6, crown: 2, glow: 0.56 },
  { motes: 32, speed: 180, streaks: 10, crown: 5, glow: 0.68 },
  { motes: 38, speed: 220, streaks: 15, crown: 9, glow: 0.82 },
  { motes: 45, speed: 270, streaks: 22, crown: 14, glow: 1 },
];

function profileAt(level: number) {
  const clamped = Math.max(0, Math.min(10, level));
  const low = Math.floor(clamped);
  const high = Math.min(10, low + 1);
  const t = clamped - low;
  const a = ASCENT_PROFILE[low];
  const b = ASCENT_PROFILE[high];
  const mix = (key: keyof typeof a) => a[key] + (b[key] - a[key]) * t;
  return {
    motes: mix("motes"),
    speed: mix("speed"),
    streaks: mix("streaks"),
    crown: mix("crown"),
    glow: mix("glow"),
  };
}

const MAX_PARTICLES = 1_800;
const PALETTES: Record<Palette, { core: string; light: string; deep: string }> =
  {
    violet: { core: "#ffffff", light: "#dccbff", deep: "#9b74f0" },
    gold: { core: "#fffbe8", light: "#ffe29a", deep: "#e0a42a" },
  };
const FIREWORK_COLORS = [
  "#c9adff",
  "#9b74f0",
  "#ff8fd8",
  "#ffe29a",
  "#8fe8ff",
  "#ffffff",
];

function sprite(color: string, soft = 0.5) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(soft, `${color}77`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return canvas;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)];
const alphaHex = (alpha: number) =>
  Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");

/**
 * Light effects around `targetRef` on a single 2D canvas: motes and streaks of light
 * that rise faster as `heat` grows (0 to 1, one tenth per floor), bursts, fireworks and
 * the dust of a collapse. Everything is drawn from a handful of pre-rendered sprites.
 */
export function TowerFx({
  targetRef,
  heat,
  golden = false,
  density = 1,
  ref,
  className,
}: {
  targetRef: RefObject<HTMLElement | null>;
  heat: number;
  golden?: boolean;
  /** Scales emission, e.g. lower on small posters. */
  density?: number;
  ref?: Ref<TowerFxHandle>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ heat, golden, density });
  settings.current = { heat, golden, density };
  const world = useRef({
    particles: [] as Particle[],
    rings: [] as Ring[],
    flash: 0,
    flashColor: PALETTES.violet.light,
    boost: 0,
    bounds: { left: 0, right: 0, top: 0, bottom: 0 },
    host: { left: 0, top: 0, width: 0, height: 0 },
    reduced: false,
  });

  const spawn = (particle: Omit<Particle, "age" | "seed">) => {
    const { particles } = world.current;
    if (particles.length < MAX_PARTICLES)
      particles.push({ ...particle, age: 0, seed: Math.random() * 1_000 });
  };

  const explode = (x: number, y: number, color: string, count: number) => {
    const state = world.current;
    state.rings.push({ x, y, age: 0, life: 0.7, radius: 130, color });
    const second = Math.random() < 0.5 ? pick(FIREWORK_COLORS) : color;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + random(-0.08, 0.08);
      const speed = random(160, 380);
      spawn({
        kind: index % 4 ? "shard" : "spark",
        color: index % 3 ? color : second,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(1.1, 2.1),
        size: index % 4 ? random(9, 15) : random(2.4, 3.4),
        gravity: 170,
        drag: 0.975,
      });
    }
  };

  useImperativeHandle(ref, () => ({
    burst(kind) {
      const state = world.current;
      const palette =
        PALETTES[
          kind === "jackpot" || settings.current.golden ? "gold" : "violet"
        ];
      const { left, right, top } = state.bounds;
      const centerX = (left + right) / 2;
      state.flash = kind === "jackpot" ? 1 : 0.7;
      state.flashColor = palette.light;
      state.boost = kind === "jackpot" ? 3 : 2;
      if (state.reduced) return;
      state.rings.push({
        x: centerX,
        y: top + 30,
        age: 0,
        life: 0.9,
        radius: kind === "jackpot" ? 520 : 380,
        color: palette.light,
      });
      const count = kind === "jackpot" ? 240 : 160;
      for (let index = 0; index < count; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = random(160, kind === "jackpot" ? 760 : 600);
        spawn({
          kind: index % 3 ? "shard" : "spark",
          color: index % 3 ? palette.light : palette.core,
          x: centerX,
          y: top + 30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 140,
          life: random(0.9, 2),
          size: index % 3 ? random(6, 14) : random(2, 3.5),
          gravity: 420,
          drag: 0.982,
        });
      }
    },
    fireworks(intensity) {
      const state = world.current;
      if (state.reduced) return;
      const rockets = Math.round(5 + intensity * 17);
      const duration = 1_600 + intensity * 2_600;
      for (let rocket = 0; rocket < rockets; rocket++)
        window.setTimeout(
          () => {
            const { width, height } = state.host;
            const x = random(width * 0.08, width * 0.92);
            const apex = random(height * 0.1, height * 0.45);
            // Launch speed that reaches the apex under the rocket's gravity.
            const gravity = 260;
            const vy = -Math.sqrt(2 * gravity * (height - apex));
            spawn({
              kind: "rocket",
              color: pick(FIREWORK_COLORS),
              x,
              y: height + 4,
              vx: random(-30, 30),
              vy,
              life: -vy / gravity,
              size: 3,
              gravity,
              drag: 1,
              payload: Math.round(60 + intensity * 70),
            });
          },
          rocket === 0 ? 0 : random(0, duration),
        );
    },
    collapse() {
      const state = world.current;
      const { left, right, bottom } = state.bounds;
      state.flash = 0.3;
      state.flashColor = "#ff8fa0";
      if (state.reduced) return;
      for (let index = 0; index < 90; index++)
        spawn({
          kind: "dust",
          color: "#8a7f95",
          x: random(left - 60, right + 60),
          y: bottom + random(-30, 10),
          vx: random(-160, 160),
          vy: random(-90, -10),
          life: random(1.4, 2.6),
          size: random(30, 80),
          gravity: -8,
          drag: 0.97,
        });
    },
    pop(clientX, clientY) {
      const state = world.current;
      if (state.reduced) return;
      const x = clientX - state.host.left;
      const y = clientY - state.host.top;
      const palette = PALETTES[settings.current.golden ? "gold" : "violet"];
      for (let index = 0; index < 26; index++) {
        const angle = random(-Math.PI, 0);
        const speed = random(80, 300);
        spawn({
          kind: "spark",
          color: index % 2 ? palette.light : palette.core,
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
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    const state = world.current;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    state.reduced = media.matches;
    const onMotion = () => (state.reduced = media.matches);
    media.addEventListener("change", onMotion);

    const sprites = new Map<string, HTMLCanvasElement>();
    const spriteFor = (color: string) => {
      let image = sprites.get(color);
      if (!image) {
        image = sprite(color);
        sprites.set(color, image);
      }
      return image;
    };
    let dust = sprite("#8a7f95", 0.45);
    // When the GPU drops the canvas, Chrome paints it as a white "sad" placeholder
    // over the page: hide it until the browser restores the context.
    let lost = false;
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      canvas.style.visibility = "hidden";
    };
    const onRestored = () => {
      lost = false;
      sprites.clear();
      dust = sprite("#8a7f95", 0.45);
      resize();
      canvas.style.visibility = "";
    };
    canvas.addEventListener("contextlost", onLost);
    canvas.addEventListener("contextrestored", onRestored);
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const emitters = { motes: 0, streaks: 0, crown: 0 };
    let level = settings.current.heat * 10;
    let last = performance.now();
    let frame = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (lost) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const host = canvas.getBoundingClientRect();
      state.host = {
        left: host.left,
        top: host.top,
        width: host.width,
        height: host.height,
      };
      const target = targetRef.current?.getBoundingClientRect();
      if (target)
        state.bounds = {
          left: target.left - host.left,
          right: target.right - host.left,
          top: target.top - host.top,
          bottom: target.bottom - host.top,
        };
      const { left, right, top, bottom } = state.bounds;
      const { density, golden } = settings.current;

      // Build up or calm down smoothly instead of jumping from one floor to the next.
      const goal = settings.current.heat * 10 + state.boost;
      level += (goal - level) * Math.min(1, dt * (goal > level ? 1.8 : 1.2));
      state.boost = Math.max(0, state.boost - dt * 1.2);
      const profile = profileAt(level);
      const palette = PALETTES[golden ? "gold" : "violet"];

      if (target && !state.reduced) {
        emitters.motes += dt * profile.motes * density;
        while (emitters.motes >= 1) {
          emitters.motes--;
          const edge = Math.random() < 0.7;
          const onLeft = Math.random() < 0.5;
          spawn({
            kind: "mote",
            color: Math.random() < 0.3 ? palette.core : palette.light,
            x: edge
              ? (onLeft ? left : right) + random(-26, 26)
              : random(left, right),
            y: random(top + (bottom - top) * 0.3, bottom + 10),
            vx: random(-10, 10),
            vy: -profile.speed * random(0.6, 1.3),
            life: random(1.2, 2.6),
            size: random(1.8, 3.4),
            gravity: -profile.speed * 0.4,
            drag: 0.995,
          });
        }
        emitters.streaks += dt * profile.streaks * density;
        while (emitters.streaks >= 1) {
          emitters.streaks--;
          const onLeft = Math.random() < 0.5;
          spawn({
            kind: "streak",
            color: palette.light,
            x: (onLeft ? left : right) + random(-50, 50),
            y: random(top, bottom),
            vx: 0,
            vy: -random(500, 900),
            life: random(0.35, 0.7),
            size: random(26, 60),
            gravity: 0,
            drag: 1,
          });
        }
        emitters.crown += dt * profile.crown * density;
        while (emitters.crown >= 1) {
          emitters.crown--;
          spawn({
            kind: "spark",
            color: Math.random() < 0.5 ? palette.core : palette.light,
            x: random(left, right),
            y: top + random(-10, 20),
            vx: random(-60, 60),
            vy: -random(80, 220),
            life: random(0.8, 1.6),
            size: random(1.8, 3),
            gravity: 60,
            drag: 0.99,
          });
        }
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const particles = state.particles;
      let alive = 0;
      const exploding: Particle[] = [];
      // Dust is drawn normally, beneath the additive light.
      context.globalCompositeOperation = "source-over";
      for (const particle of particles) {
        particle.age += dt;
        if (particle.age >= particle.life) {
          if (particle.kind === "rocket") exploding.push(particle);
          continue;
        }
        particles[alive++] = particle;
        particle.vx *= particle.drag;
        particle.vy = particle.vy * particle.drag + particle.gravity * dt;
        if (particle.kind === "mote")
          particle.vx += Math.sin(now / 350 + particle.seed) * 24 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.kind !== "dust") continue;
        const t = particle.age / particle.life;
        const size = particle.size * (0.6 + t * 1.4);
        context.globalAlpha = 0.5 * (1 - t) * Math.min(1, t * 6);
        context.drawImage(
          dust,
          particle.x - size / 2,
          particle.y - size / 2,
          size,
          size,
        );
      }
      particles.length = alive;
      for (const rocket of exploding)
        explode(rocket.x, rocket.y, rocket.color, rocket.payload ?? 80);

      context.globalCompositeOperation = "lighter";
      if (target && profile.glow > 0.01) {
        const centerX = (left + right) / 2;
        const radius = Math.max(80, (right - left) * 0.9);
        const gradient = context.createRadialGradient(
          centerX,
          bottom,
          0,
          centerX,
          bottom,
          radius,
        );
        gradient.addColorStop(
          0,
          `${palette.deep}${alphaHex(profile.glow * 0.35)}`,
        );
        gradient.addColorStop(1, `${palette.deep}00`);
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
        if (particle.kind === "dust") continue;
        const t = particle.age / particle.life;
        if (particle.kind === "streak") {
          const gradient = context.createLinearGradient(
            particle.x,
            particle.y,
            particle.x,
            particle.y + particle.size,
          );
          gradient.addColorStop(0, particle.color);
          gradient.addColorStop(1, `${particle.color}00`);
          context.globalAlpha = Math.sin(t * Math.PI) * 0.55;
          context.strokeStyle = gradient;
          context.lineWidth = 1.6;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(particle.x, particle.y + particle.size);
          context.stroke();
          continue;
        }
        const image = spriteFor(particle.color);
        let size = particle.size;
        let alpha = 1 - t;
        if (particle.kind === "rocket") {
          size = 10;
          alpha = 1;
          // Trail of the rising rocket.
          context.globalAlpha = 0.35;
          context.drawImage(image, particle.x - 3, particle.y + 6, 6, 18);
        } else if (particle.kind === "spark") {
          size = particle.size * 3.2;
          alpha = (1 - t) * (0.6 + 0.4 * Math.sin(now / 40 + particle.seed));
        } else if (particle.kind === "mote") {
          size = particle.size * 4;
          alpha =
            Math.min(1, t * 5) *
            (1 - t) *
            (0.6 + 0.4 * Math.sin(now / 160 + particle.seed));
        } else {
          // Firework and burst shards twinkle as they fade.
          size = particle.size * (1 - t * 0.4);
          alpha =
            (1 - t) *
            (t > 0.6 ? 0.5 + 0.5 * Math.sin(now / 30 + particle.seed) : 1);
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
        context.globalAlpha = (1 - t) ** 2 * 0.7;
        context.strokeStyle = ring.color;
        context.lineWidth = 8 * (1 - t) + 1;
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
        const height = canvas.height / dpr;
        const gradient = context.createRadialGradient(
          (left + right) / 2,
          top + 40,
          0,
          (left + right) / 2,
          top + 40,
          Math.max(width, height),
        );
        gradient.addColorStop(0, state.flashColor);
        gradient.addColorStop(0.35, `${state.flashColor}55`);
        gradient.addColorStop(1, `${state.flashColor}00`);
        context.globalAlpha = state.flash * 0.6;
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
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
      canvas.removeEventListener("contextlost", onLost);
      canvas.removeEventListener("contextrestored", onRestored);
    };
  }, [targetRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
