// Interactive background: a drifting graph of Lion tokens that bends around the
// cursor and ripples outward whenever something "evaluates".

const canvas = document.querySelector(".constellation");
const context = canvas?.getContext("2d");

const TOKENS = [
  ["[", "#d2a8ff"],
  ["]", "#d2a8ff"],
  ["{", "#d2a8ff"],
  ["}", "#d2a8ff"],
  ['"lambda"', "#fbbf24"],
  ['"define"', "#fbbf24"],
  ['"cond"', "#fbbf24"],
  ['"match"', "#fbbf24"],
  ['"quote"', "#fbbf24"],
  ['"eval"', "#fbbf24"],
  ['"begin"', "#fbbf24"],
  ['"rule"', "#fbbf24"],
  ['"query"', "#fbbf24"],
  ['"why"', "#fbbf24"],
  ['"?x"', "#ffa657"],
  ['"?who"', "#ffa657"],
  ['"number/add"', "#a5d6ff"],
  ['"array/map"', "#a5d6ff"],
  ['"array/reduce"', "#a5d6ff"],
  ['"string/concat"', "#a5d6ff"],
  ['"value/identity"', "#a5d6ff"],
  ['"aggregate/sum"', "#a5d6ff"],
  ['"x"', "#a5d6ff"],
  ["42", "#79c0ff"],
  ["0", "#79c0ff"],
  ["3.14", "#79c0ff"],
  ["true", "#ff7b72"],
  ["null", "#ff7b72"],
  [":", "#a1a1aa"],
  [",", "#a1a1aa"],
];

const AMBER = "245, 158, 11";
const NEUTRAL = "161, 161, 170";
const AREA_PER_NODE = 8500;
const MIN_NODES = 55;
const MAX_NODES = 240;
const TOKEN_RATIO = 0.34;
const MARGIN = 80;
const SPRING = 0.012;
const DAMPING = 0.9;
const DRIFT = 0.2;
const PARALLAX = 0.35;
const PUSH = 1.5;
const SWIRL = 0.95;
const WAVE_SPEED = 10;
const WAVE_BAND = 55;
const WAVE_FORCE = 2.4;
const WAVE_DECAY = 0.012;
const MAX_WAVES = 6;
const EDGE_BUCKETS = 8;
const MAX_EDGE_ALPHA = 0.75;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  linkDistance: 130,
  radius: 180,
  scroll: window.scrollY,
  time: 0,
  nodes: [],
  waves: [],
  pointer: { x: -9999, y: -9999, active: 0, target: 0, down: false },
  frame: 0,
  last: 0,
};

const wrap = (value, min, span) =>
  ((((value - min) % span) + span) % span) + min;

const flowAngle = (x, y, t) =>
  (Math.sin(x * 0.0021 + t * 0.000_11) +
    Math.cos(y * 0.0027 - t * 0.000_09) +
    Math.sin((x + y) * 0.0013 + t * 0.000_07)) *
  1.2;

const createNode = (originX, originY) => {
  const z = 0.35 + Math.random() ** 1.6 * 0.65;
  const token =
    Math.random() < TOKEN_RATIO
      ? TOKENS[Math.floor(Math.random() * TOKENS.length)]
      : null;
  const hx = Math.random() * (state.width + MARGIN * 2) - MARGIN;
  const hy = Math.random() * (state.height + MARGIN * 2) - MARGIN;
  return {
    hx,
    hy,
    tx: hx,
    ty: hy,
    x: originX ?? hx,
    y: originY ?? hy,
    vx: 0,
    vy: 0,
    z,
    token: token?.[0] ?? null,
    color: token?.[1] ?? null,
    fontSize: Math.round(10 + z * 6),
    radius: 0.8 + z * 1.5,
    glow: 0,
  };
};

const syncNodeCount = (originX, originY) => {
  const target = Math.max(
    MIN_NODES,
    Math.min(
      MAX_NODES,
      Math.round((state.width * state.height) / AREA_PER_NODE)
    )
  );
  while (state.nodes.length < target) {
    const jitter = () => (Math.random() - 0.5) * 40;
    state.nodes.push(
      originX === undefined
        ? createNode()
        : createNode(originX + jitter(), originY + jitter())
    );
  }
  state.nodes.length = target;
  // Group tokens by font size so drawing switches fonts as rarely as possible.
  state.nodes.sort((a, b) => a.fontSize - b.fontSize);
};

const resize = () => {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);
  const shortSide = Math.min(state.width, state.height);
  state.linkDistance = Math.min(150, Math.max(100, shortSide * 0.15));
  state.radius = Math.min(240, Math.max(140, shortSide * 0.24));
};

const spawnWave = (x, y, strength = 1) => {
  state.waves.push({ x, y, r: 0, life: strength });
  if (state.waves.length > MAX_WAVES) {
    state.waves.shift();
  }
};

const applyPointer = (node, pointer) => {
  const dx = node.x - pointer.x;
  const dy = node.y - pointer.y;
  const distanceSquared = dx * dx + dy * dy;
  const { radius } = state;
  if (distanceSquared >= radius * radius) {
    return [0, 0];
  }
  const distance = Math.sqrt(distanceSquared) || 1;
  const falloff = (1 - distance / radius) ** 2 * pointer.active;
  const depth = 0.5 + node.z * 0.5;
  const push = (pointer.down ? 2.4 : 1) * PUSH * falloff * depth;
  const swirl = (pointer.down ? 2.6 : 1) * SWIRL * falloff * depth;
  node.glow = Math.max(node.glow, falloff * 0.9);
  return [
    (dx / distance) * push - (dy / distance) * swirl,
    (dy / distance) * push + (dx / distance) * swirl,
  ];
};

const applyWaves = (node) => {
  let ax = 0;
  let ay = 0;
  for (const wave of state.waves) {
    const dx = node.x - wave.x;
    const dy = node.y - wave.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const band = Math.abs(distance - wave.r);
    if (band < WAVE_BAND) {
      const strength = (1 - band / WAVE_BAND) * wave.life;
      ax += (dx / distance) * strength * WAVE_FORCE;
      ay += (dy / distance) * strength * WAVE_FORCE;
      node.glow = Math.max(node.glow, strength);
    }
  }
  return [ax, ay];
};

const step = (dt) => {
  const { pointer } = state;
  const spanX = state.width + MARGIN * 2;
  const spanY = state.height + MARGIN * 2;
  pointer.active += (pointer.target - pointer.active) * Math.min(1, 0.08 * dt);
  const damping = DAMPING ** dt;
  const glowDecay = 0.955 ** dt;

  for (const node of state.nodes) {
    const angle = flowAngle(node.hx, node.hy, state.time);
    node.hx = wrap(
      node.hx + Math.cos(angle) * DRIFT * node.z * dt,
      -MARGIN,
      spanX
    );
    node.hy = wrap(
      node.hy + Math.sin(angle) * DRIFT * node.z * dt,
      -MARGIN,
      spanY
    );
    const tx = node.hx;
    const ty = wrap(node.hy - state.scroll * PARALLAX * node.z, -MARGIN, spanY);
    // When a home position wraps around an edge, carry the node with it
    // instead of springing it across the whole screen.
    if (Math.abs(tx - node.tx) > spanX / 2) {
      node.x += tx - node.tx;
    }
    if (Math.abs(ty - node.ty) > spanY / 2) {
      node.y += ty - node.ty;
    }
    node.tx = tx;
    node.ty = ty;

    let ax = (tx - node.x) * SPRING;
    let ay = (ty - node.y) * SPRING;
    if (pointer.active > 0.01) {
      const [px, py] = applyPointer(node, pointer);
      ax += px;
      ay += py;
    }
    if (state.waves.length > 0) {
      const [wx, wy] = applyWaves(node);
      ax += wx;
      ay += wy;
    }
    node.vx = (node.vx + ax * dt) * damping;
    node.vy = (node.vy + ay * dt) * damping;
    node.x += node.vx * dt;
    node.y += node.vy * dt;
    node.glow *= glowDecay;
  }

  for (const wave of state.waves) {
    wave.r += WAVE_SPEED * dt;
    wave.life -= WAVE_DECAY * dt;
  }
  state.waves = state.waves.filter((wave) => wave.life > 0);
};

const drawPointerGlow = () => {
  const { pointer } = state;
  if (pointer.active <= 0.01) {
    return;
  }
  const reach = state.radius * 1.6;
  const gradient = context.createRadialGradient(
    pointer.x,
    pointer.y,
    0,
    pointer.x,
    pointer.y,
    reach
  );
  gradient.addColorStop(0, `rgba(${AMBER}, ${0.11 * pointer.active})`);
  gradient.addColorStop(1, `rgba(${AMBER}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(pointer.x - reach, pointer.y - reach, reach * 2, reach * 2);
};

// Adds the segment between two nodes to the matching alpha bucket, if they are
// close enough (in screen space and depth) to be linked.
const collectEdge = (a, b, neutral, amber) => {
  const { linkDistance } = state;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (Math.abs(dx) > linkDistance || Math.abs(dy) > linkDistance) {
    return;
  }
  const distanceSquared = dx * dx + dy * dy;
  if (
    distanceSquared > linkDistance * linkDistance ||
    Math.abs(a.z - b.z) > 0.4
  ) {
    return;
  }
  const glow = Math.max(a.glow, b.glow);
  const strength =
    (1 - Math.sqrt(distanceSquared) / linkDistance) * Math.min(a.z, b.z);
  const alpha = Math.min(MAX_EDGE_ALPHA, strength * (0.28 + glow * 0.9));
  const bucket = Math.min(
    EDGE_BUCKETS - 1,
    Math.floor((alpha / MAX_EDGE_ALPHA) * EDGE_BUCKETS)
  );
  (glow > 0.18 ? amber : neutral)[bucket].push(a.x, a.y, b.x, b.y);
};

const drawEdges = () => {
  const { nodes } = state;
  const neutral = Array.from({ length: EDGE_BUCKETS }, () => []);
  const amber = Array.from({ length: EDGE_BUCKETS }, () => []);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      collectEdge(nodes[i], nodes[j], neutral, amber);
    }
  }

  context.lineWidth = 1;
  for (const [color, buckets] of [
    [NEUTRAL, neutral],
    [AMBER, amber],
  ]) {
    for (let bucket = 0; bucket < EDGE_BUCKETS; bucket++) {
      const segments = buckets[bucket];
      if (segments.length === 0) {
        continue;
      }
      const alpha = ((bucket + 0.5) / EDGE_BUCKETS) * MAX_EDGE_ALPHA;
      context.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
      context.beginPath();
      for (let k = 0; k < segments.length; k += 4) {
        context.moveTo(segments[k], segments[k + 1]);
        context.lineTo(segments[k + 2], segments[k + 3]);
      }
      context.stroke();
    }
  }
};

const drawPointerLinks = () => {
  const { pointer } = state;
  if (pointer.active <= 0.01) {
    return;
  }
  const reach = state.radius * 0.85;
  context.strokeStyle = `rgb(${AMBER})`;
  context.lineWidth = 1;
  for (const node of state.nodes) {
    const dx = node.x - pointer.x;
    const dy = node.y - pointer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < reach) {
      context.globalAlpha = (1 - distance / reach) * 0.55 * pointer.active;
      context.beginPath();
      context.moveTo(pointer.x, pointer.y);
      context.lineTo(node.x, node.y);
      context.stroke();
    }
  }
  context.globalAlpha = 1;
};

const drawWaves = () => {
  context.lineWidth = 1.5;
  for (const wave of state.waves) {
    context.strokeStyle = `rgba(${AMBER}, ${(wave.life * 0.45).toFixed(3)})`;
    context.beginPath();
    context.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
    context.stroke();
  }
};

const drawNodes = () => {
  context.textAlign = "center";
  context.textBaseline = "middle";
  let font = 0;
  for (const node of state.nodes) {
    const glow = Math.min(1, node.glow);
    // Tokens rest fainter than dots so they never compete with page text.
    const resting = node.token ? 0.08 + node.z * 0.2 : 0.14 + node.z * 0.32;
    context.globalAlpha = Math.min(1, resting + glow * 0.7);
    if (node.token) {
      if (node.fontSize !== font) {
        font = node.fontSize;
        context.font = `500 ${font}px "JetBrains Mono", monospace`;
      }
      context.fillStyle = glow > 0.25 ? "#fbbf24" : node.color;
      context.fillText(node.token, node.x, node.y);
    } else {
      context.fillStyle = glow > 0.25 ? "#fbbf24" : "#a1a1aa";
      context.beginPath();
      context.arc(
        node.x,
        node.y,
        node.radius * (1 + glow * 0.8),
        0,
        Math.PI * 2
      );
      context.fill();
    }
  }
  context.globalAlpha = 1;
};

const draw = () => {
  context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  context.clearRect(0, 0, state.width, state.height);
  drawPointerGlow();
  drawEdges();
  drawPointerLinks();
  drawWaves();
  drawNodes();
};

const tick = (now) => {
  const dt = state.last ? Math.min(now - state.last, 50) / (1000 / 60) : 1;
  state.last = now;
  state.time += dt * (1000 / 60);
  step(dt);
  draw();
  state.frame = window.requestAnimationFrame(tick);
};

const start = () => {
  if (state.frame === 0) {
    state.last = 0;
    state.frame = window.requestAnimationFrame(tick);
  }
};

const stop = () => {
  window.cancelAnimationFrame(state.frame);
  state.frame = 0;
};

const settle = () => {
  // Static frame for reduced motion: nodes rest at their home positions.
  for (const node of state.nodes) {
    node.x = node.tx;
    node.y = node.ty;
    node.vx = 0;
    node.vy = 0;
  }
  state.pointer.active = 0;
  state.waves = [];
  draw();
};

const init = () => {
  resize();
  if (reducedMotion.matches) {
    syncNodeCount();
    step(0);
    settle();
  } else {
    // Intro: the graph bursts out of the hero and springs into place.
    const originX = state.width / 2;
    const originY = Math.min(state.height * 0.55, 520);
    syncNodeCount(originX, originY);
    spawnWave(originX, originY, 1);
    start();
  }

  window.addEventListener("resize", () => {
    resize();
    syncNodeCount();
    if (reducedMotion.matches) {
      settle();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      state.scroll = window.scrollY;
    },
    { passive: true }
  );

  window.addEventListener(
    "pointermove",
    (event) => {
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
      state.pointer.target = 1;
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || reducedMotion.matches) {
        return;
      }
      state.pointer.x = event.clientX;
      state.pointer.y = event.clientY;
      state.pointer.target = 1;
      state.pointer.down = true;
      spawnWave(event.clientX, event.clientY, 1);
    },
    { passive: true }
  );

  const release = (event) => {
    state.pointer.down = false;
    if (event.pointerType !== "mouse") {
      state.pointer.target = 0;
    }
  };
  window.addEventListener("pointerup", release, { passive: true });
  window.addEventListener("pointercancel", release, { passive: true });

  document.documentElement.addEventListener("pointerleave", () => {
    state.pointer.target = 0;
    state.pointer.down = false;
  });
  window.addEventListener("blur", () => {
    state.pointer.target = 0;
    state.pointer.down = false;
  });

  window.addEventListener("lion:evaluate", (event) => {
    const { x, y } = event.detail;
    if (!reducedMotion.matches && y > -100 && y < state.height + 100) {
      spawnWave(x, y, 0.8);
    }
  });

  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      stop();
      settle();
    } else {
      start();
    }
  });
};

if (canvas && context) {
  init();
}
