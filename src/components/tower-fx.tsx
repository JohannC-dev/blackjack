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

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// Domain-warped fractal noise carves flame tongues out of a "fuel" field that is emitted
// by the base, the walls and the top of the tower.
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uRatio;
uniform float uTime;
uniform vec4 uRect;
uniform float uBase;
uniform float uSide;
uniform float uCrown;
uniform float uGlow;
uniform float uGold;
uniform float uScale;

// Sine-free hash: stable on every GPU, even with large coordinates.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uRatio;
  float s = uScale;
  float t = uTime;
  float left = uRect.x;
  float top = uRect.y;
  float right = uRect.z;
  float bottom = uRect.w;
  float height = bottom - top;

  vec2 q = p / (70.0 * s);
  vec2 warp = vec2(
    fbm(q + vec2(0.0, t * 0.9)),
    fbm(q + vec2(5.2, t * 1.2))
  ) - 0.5;
  vec2 w = p + warp * 46.0 * s;

  float fuel = 0.0;
  if (uBase > 0.0) {
    float reach = 34.0 * s;
    float outside = max(max(left - reach - w.x, w.x - right - reach), 0.0);
    float h = (bottom - w.y) / (uBase * height);
    float body = (1.0 - smoothstep(0.0, 1.0, h)) * smoothstep(-0.35, 0.0, h);
    fuel = max(fuel, exp(-outside / (22.0 * s)) * body);
  }
  if (uSide > 0.0) {
    float litTop = bottom - height * uSide;
    float dx = min(abs(w.x - left), abs(w.x - right));
    float width = (10.0 + 26.0 * uSide) * s;
    float above = (litTop - w.y) / (height * 0.16 + 30.0 * s);
    float body = (1.0 - smoothstep(0.0, 1.0, above)) * (1.0 - smoothstep(bottom - 4.0 * s, bottom + 14.0 * s, w.y));
    fuel = max(fuel, exp(-dx / width) * body);
  }
  if (uCrown > 0.0) {
    float outside = max(max(left - w.x, w.x - right), 0.0);
    float h = (top - w.y) / (uCrown * height);
    float body = (1.0 - smoothstep(0.0, 1.0, h)) * smoothstep(-0.5, 0.0, h);
    fuel = max(fuel, exp(-outside / (26.0 * s)) * body);
  }

  float n = fbm(vec2(p.x / (34.0 * s), p.y / (40.0 * s) + t * 1.7));
  float n2 = fbm(vec2(p.x / (14.0 * s), p.y / (17.0 * s) + t * 2.6));
  float fire = clamp((fuel * (0.5 + n) - n2 * 0.38) * 1.5, 0.0, 1.0);

  vec3 deep = mix(vec3(0.45, 0.04, 0.03), vec3(0.5, 0.28, 0.05), uGold);
  vec3 orange = mix(vec3(1.0, 0.33, 0.06), vec3(1.0, 0.64, 0.16), uGold);
  vec3 yellow = mix(vec3(1.0, 0.76, 0.3), vec3(1.0, 0.9, 0.55), uGold);
  vec3 color = mix(deep, orange, smoothstep(0.12, 0.42, fire));
  color = mix(color, yellow, smoothstep(0.42, 0.7, fire));
  color = mix(color, vec3(1.0, 0.97, 0.88), smoothstep(0.78, 0.97, fire));
  float alpha = smoothstep(0.08, 0.36, fire);

  float outsideX = max(max(left - p.x, p.x - right), 0.0);
  float glow = uGlow * exp(-abs(p.y - bottom) / (70.0 * s)) * exp(-outsideX / (140.0 * s)) * 0.45;
  vec3 glowColor = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.7, 0.25), uGold);

  gl_FragColor = vec4(color * alpha + glowColor * glow, clamp(alpha + glow, 0.0, 1.0));
}
`;

function createFire(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    premultipliedAlpha: true,
    antialias: false,
  });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    res: uniform("uRes"),
    ratio: uniform("uRatio"),
    time: uniform("uTime"),
    rect: uniform("uRect"),
    base: uniform("uBase"),
    side: uniform("uSide"),
    crown: uniform("uCrown"),
    glow: uniform("uGlow"),
    gold: uniform("uGold"),
    scale: uniform("uScale"),
  };
  return { gl, uniforms };
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
 * Fire around `targetRef`: a WebGL flame shader grown by `heat` (0 to 1, one tenth per
 * floor), with 2D particles on top for embers, sparks, smoke and the explosions.
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
    const fire = createFire(fireCanvas);
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
    // The flames are soft: a lower resolution keeps the shader cheap.
    const fireRatio = 0.75;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      fireCanvas.width = Math.max(
        1,
        Math.round(fireCanvas.clientWidth * fireRatio),
      );
      fireCanvas.height = Math.max(
        1,
        Math.round(fireCanvas.clientHeight * fireRatio),
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const emitters = { embers: 0, sparks: 0, smoke: 0 };
    let level = settings.current.heat * 10;
    let gold = settings.current.golden ? 1 : 0;
    let last = performance.now();
    let clock = 0;
    let frame = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Wrapped so the noise coordinates never grow large enough to lose precision.
      if (!state.reduced) clock = (clock + dt) % 600;
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
        const { gl, uniforms } = fire;
        gl.viewport(0, 0, fireCanvas.width, fireCanvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (target && level > 2.2) {
          gl.uniform2f(uniforms.res, fireCanvas.width, fireCanvas.height);
          gl.uniform1f(uniforms.ratio, fireRatio);
          gl.uniform1f(uniforms.time, clock);
          gl.uniform4f(uniforms.rect, left, top, right, bottom);
          gl.uniform1f(uniforms.base, profile.base);
          gl.uniform1f(uniforms.side, profile.side);
          gl.uniform1f(uniforms.crown, profile.crown);
          gl.uniform1f(uniforms.glow, profile.glow);
          gl.uniform1f(uniforms.gold, gold);
          gl.uniform1f(
            uniforms.scale,
            Math.max(0.4, Math.min(1.4, height / 620)),
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
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
