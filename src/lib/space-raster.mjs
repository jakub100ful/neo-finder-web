import {
  EARTH_RADIUS_SCENE,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS_SCENE,
  getMoonRelativePosition,
  getNeoOrbitPosition
} from "./orbit-model.mjs";
import { generateLandmassMap } from "./landmass.js";
import { getCameraBasis, projectWorldPoint } from "./view-model.mjs";

const TWO_PI = Math.PI * 2;
const EPSILON = 1e-7;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(vector, fallback = { x: 0, y: 0, z: 1 }) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < EPSILON) return fallback;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function parseColor(value, fallback = { r: 128, g: 128, b: 128 }) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  const raw = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16)
    };
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16)
    };
  }
  return fallback;
}

function colorWithBrightness(color, brightness) {
  return [color.r, color.g, color.b].map((value) => Math.round(clamp(value * brightness, 0, 255)));
}

function seededRandom(seed) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function rotateVector(vector, rotation = {}) {
  const x = Number.isFinite(Number(rotation?.x)) ? Number(rotation.x) : 0;
  const y = Number.isFinite(Number(rotation?.y)) ? Number(rotation.y) : 0;
  const z = Number.isFinite(Number(rotation?.z)) ? Number(rotation.z) : 0;
  const cosX = Math.cos(x);
  const sinX = Math.sin(x);
  const cosY = Math.cos(y);
  const sinY = Math.sin(y);
  const cosZ = Math.cos(z);
  const sinZ = Math.sin(z);

  const yRotated = {
    x: vector.x * cosY + vector.z * sinY,
    y: vector.y,
    z: -vector.x * sinY + vector.z * cosY
  };
  const xRotated = {
    x: yRotated.x,
    y: yRotated.y * cosX - yRotated.z * sinX,
    z: yRotated.y * sinX + yRotated.z * cosX
  };
  return {
    x: xRotated.x * cosZ - xRotated.y * sinZ,
    y: xRotated.x * sinZ + xRotated.y * cosZ,
    z: xRotated.z
  };
}

export function sampleSphereSurface({ x, y, radius, center = { x: 0, y: 0 } }) {
  const safeRadius = Math.max(EPSILON, Number(radius) || 0);
  const normalX = (x - center.x) / safeRadius;
  const normalY = (y - center.y) / safeRadius;
  const squared = normalX * normalX + normalY * normalY;
  if (squared > 1) return null;

  const depth = Math.sqrt(Math.max(0, 1 - squared));
  return {
    depth,
    normal: { x: normalX, y: -normalY, z: depth },
    uv: {
      u: 0.5 + Math.atan2(normalX, depth) / TWO_PI,
      v: 0.5 + Math.asin(normalY) / Math.PI
    }
  };
}

export function getWorldSphereNormal({ x, y, radius, center = { x: 0, y: 0 } }, view) {
  const sample = sampleSphereSurface({ x, y, radius, center });
  if (!sample) return null;
  const basis = getCameraBasis(view);
  return normalize({
    x: basis.right.x * sample.normal.x + basis.up.x * sample.normal.y - basis.forward.x * sample.normal.z,
    y: basis.right.y * sample.normal.x + basis.up.y * sample.normal.y - basis.forward.y * sample.normal.z,
    z: basis.right.z * sample.normal.x + basis.up.z * sample.normal.y - basis.forward.z * sample.normal.z
  });
}

export function shadeSurface(normal, lightDirection, ambient = 0.2) {
  const light = normalize(lightDirection);
  const diffuse = Math.max(0, dot(normalize(normal), light));
  return clamp(ambient + diffuse * (1 - ambient), 0, 1);
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_VERTICES = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
];
const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
];
const OCTAHEDRON_VERTICES = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
];
const OCTAHEDRON_FACES = [
  [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
  [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]
];
const CUBE_VERTICES = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
];
const CUBE_FACES = [
  [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
  [0, 4, 5], [0, 5, 1], [3, 2, 6], [3, 6, 7],
  [1, 5, 6], [1, 6, 2], [0, 3, 7], [0, 7, 4]
];

export function createAsteroidPolyhedron(shape = "rocky", seed = 1) {
  const angular = shape === "angular";
  const metallic = shape === "metallic";
  const sourceVertices = angular
    ? OCTAHEDRON_VERTICES
    : metallic
      ? CUBE_VERTICES
      : ICOSAHEDRON_VERTICES;
  const sourceFaces = angular
    ? OCTAHEDRON_FACES
    : metallic
      ? CUBE_FACES
      : ICOSAHEDRON_FACES;
  const random = seededRandom(seed);
  const shapeScale = shape === "elongated"
    ? { x: 1.52, y: 0.78, z: 0.9 }
    : shape === "cratered"
      ? { x: 1.1, y: 0.88, z: 1.08 }
      : shape === "metallic"
        ? { x: 1.05, y: 0.94, z: 1.12 }
        : { x: 1, y: 1, z: 1 };

  const vertices = sourceVertices.map(([x, y, z], index) => {
    const length = Math.hypot(x, y, z) || 1;
    const jitter = 0.84 + random() * 0.3 + ((index % 3) - 1) * 0.025;
    return {
      x: (x / length) * jitter * shapeScale.x,
      y: (y / length) * jitter * shapeScale.y,
      z: (z / length) * jitter * shapeScale.z
    };
  });

  return {
    vertices,
    faces: sourceFaces.map((face) => face.slice()),
    shape
  };
}

export function getPolygonFaceNormal(a, b, c) {
  return normalize(cross(
    { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
  ));
}

export function createEarthSurfaceMap(
  width = 384,
  height = 192,
  { land = "#68df9f", fluid = "#0c89c7", landmass = {} } = {}
) {
  const map = generateLandmassMap(width, height, landmass);
  const landColor = parseColor(land, { r: 104, g: 223, b: 159 });
  const fluidColor = parseColor(fluid, { r: 12, g: 137, b: 199 });
  const pixels = new Uint8ClampedArray(map.width * map.height * 4);

  for (let index = 0; index < map.mask.length; index += 1) {
    const base = map.mask[index] ? landColor : fluidColor;
    const brightness = map.mask[index]
      ? 0.82 + map.values[index] * 0.34
      : 0.78 + map.values[index] * 0.16;
    const offset = index * 4;
    const [red, green, blue] = colorWithBrightness(base, brightness);
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = 255;
  }

  return { width: map.width, height: map.height, pixels };
}

export function createMoonSurfaceMap(width = 256, height = 128) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const craters = [
    [0.08, 0.2, 0.028], [0.2, 0.52, 0.052], [0.31, 0.19, 0.034],
    [0.37, 0.53, 0.075], [0.49, 0.31, 0.043], [0.58, 0.84, 0.035],
    [0.69, 0.42, 0.06], [0.77, 0.78, 0.04], [0.91, 0.56, 0.07],
    [0.97, 0.15, 0.025], [0.53, 0.08, 0.02]
  ];
  const random = seededRandom(23);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      let color = { r: 126, g: 124, b: 136 };
      const noise = (random() - 0.5) * 12;
      color = { r: color.r + noise, g: color.g + noise, b: color.b + noise };

      for (const [cx, cy, radius] of craters) {
        const dx = Math.min(Math.abs(u - cx), 1 - Math.abs(u - cx)) / radius;
        const dy = (v - cy) / (radius * 0.72);
        const distance = Math.hypot(dx, dy);
        if (distance < 1) {
          const darkness = 1 - distance;
          color = {
            r: color.r * (0.66 + darkness * 0.18),
            g: color.g * (0.66 + darkness * 0.18),
            b: color.b * (0.7 + darkness * 0.16)
          };
        } else if (distance < 1.16) {
          color = { r: color.r + 10, g: color.g + 10, b: color.b + 12 };
        }
      }

      const offset = (y * width + x) * 4;
      pixels[offset] = clamp(Math.round(color.r), 0, 255);
      pixels[offset + 1] = clamp(Math.round(color.g), 0, 255);
      pixels[offset + 2] = clamp(Math.round(color.b), 0, 255);
      pixels[offset + 3] = 255;
    }
  }

  return { width, height, pixels };
}

function sampleTexture(texture, normal) {
  if (!texture) return { r: 150, g: 150, b: 160 };
  const u = 0.5 + Math.atan2(normal.x, normal.z) / TWO_PI;
  const v = 0.5 - Math.asin(clamp(normal.y, -1, 1)) / Math.PI;
  const x = ((Math.floor(u * texture.width) % texture.width) + texture.width) % texture.width;
  const y = clamp(Math.floor(v * texture.height), 0, texture.height - 1);
  const offset = (y * texture.width + x) * 4;
  return {
    r: texture.pixels[offset],
    g: texture.pixels[offset + 1],
    b: texture.pixels[offset + 2]
  };
}

function getDisplayView(view, width, height, zoomScale) {
  const target = view?.target || { x: 0, y: 0, z: 0 };
  const direction = normalize({
    x: (view?.cameraPosition?.x ?? 0) - target.x,
    y: (view?.cameraPosition?.y ?? 0) - target.y,
    z: (view?.cameraPosition?.z ?? 1) - target.z
  });
  const displayDistance = 105 * clamp(Number(zoomScale) || 1, 0.55, 10);
  return {
    cameraPosition: add(target, scale(direction, displayDistance)),
    target,
    fovRadians: Math.max(0.92, Math.min(1.35, view?.fovRadians || 0.92)),
    aspect: width / Math.max(height, 1)
  };
}

function projectToCanvas(point, view, width, height) {
  const projected = projectWorldPoint(point, view);
  return {
    x: projected.x * width,
    y: projected.y * height,
    depth: projected.depth,
    visible: projected.visible
  };
}

function projectedRadius(worldRadius, depth, view, height) {
  const tangent = Math.tan(view.fovRadians / 2);
  return Math.max(1, (worldRadius / Math.max(depth, 1)) * (height / (2 * tangent)));
}

function getDisplayMoonPosition(phase) {
  const raw = getMoonRelativePosition(phase);
  const displayRadius = EARTH_RADIUS_SCENE * 1.65;
  return scale(raw, displayRadius / MOON_ORBIT_RADIUS);
}

function getDisplayNeoPosition(neo, phase) {
  const displayRadius = 25 + Math.max(0, Number(neo.radius) - 19) * 0.55;
  return getNeoOrbitPosition({
    radius: displayRadius,
    inclination: neo.inclination
  }, phase);
}

function drawOrbit(ctx, radius, inclination, view, width, height, color, opacity) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let started = false;
  for (let index = 0; index <= 96; index += 1) {
    const phase = (index / 96) * TWO_PI;
    const position = {
      x: Math.cos(phase) * radius,
      y: Math.sin(phase) * radius * inclination,
      z: Math.sin(phase) * radius
    };
    const projected = projectToCanvas(position, view, width, height);
    if (!projected.visible) {
      started = false;
      continue;
    }
    if (started) ctx.lineTo(projected.x, projected.y);
    else ctx.moveTo(projected.x, projected.y);
    started = true;
  }
  ctx.stroke();
  ctx.restore();
}

function drawSphere(ctx, { center, radius, view, texture, rotationY = 0, lightDirection, atmosphere }) {
  const diameter = Math.max(2, Math.ceil(radius * 2) + 2);
  const left = Math.round(center.x - radius - 1);
  const top = Math.round(center.y - radius - 1);
  const image = ctx.createImageData(diameter, diameter);
  const basis = getCameraBasis(view);

  if (atmosphere) {
    const glow = ctx.createRadialGradient(center.x, center.y, radius * 0.84, center.x, center.y, radius * 1.18);
    glow.addColorStop(0, "rgba(97, 231, 255, 0)");
    glow.addColorStop(0.78, `${atmosphere}55`);
    glow.addColorStop(1, `${atmosphere}00`);
    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 1.2, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  for (let y = 0; y < diameter; y += 1) {
    for (let x = 0; x < diameter; x += 1) {
      const localX = x - diameter / 2 + 0.5;
      const localY = y - diameter / 2 + 0.5;
      const sample = sampleSphereSurface({ x: localX, y: localY, radius });
      if (!sample) continue;
      const worldNormal = normalize({
        x: basis.right.x * sample.normal.x + basis.up.x * sample.normal.y - basis.forward.x * sample.normal.z,
        y: basis.right.y * sample.normal.x + basis.up.y * sample.normal.y - basis.forward.y * sample.normal.z,
        z: basis.right.z * sample.normal.x + basis.up.z * sample.normal.y - basis.forward.z * sample.normal.z
      });
      const localNormal = rotateVector(worldNormal, { y: -rotationY });
      const color = sampleTexture(texture, localNormal);
      const edgeShade = 0.52 + sample.depth * 0.48;
      const brightness = shadeSurface(worldNormal, lightDirection, 0.18) * edgeShade;
      const offset = (y * diameter + x) * 4;
      const [red, green, blue] = colorWithBrightness(color, brightness);
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, left, top);
  ctx.save();
  ctx.strokeStyle = atmosphere ? `${atmosphere}aa` : "rgba(210, 240, 255, 0.35)";
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();
}

function drawPolyhedron(ctx, { center, radius, view, polyhedron, rotation, color, lightDirection }) {
  const vertices = polyhedron.vertices.map((vertex) => {
    const rotated = rotateVector(scale(vertex, radius), rotation);
    const world = add(center.world, rotated);
    return { world, screen: projectToCanvas(world, view, center.width, center.height) };
  });
  const faces = polyhedron.faces.map(([a, b, c]) => {
    const normal = getPolygonFaceNormal(vertices[a].world, vertices[b].world, vertices[c].world);
    return {
      normal,
      depth: (vertices[a].screen.depth + vertices[b].screen.depth + vertices[c].screen.depth) / 3,
      points: [vertices[a].screen, vertices[b].screen, vertices[c].screen]
    };
  }).filter((face) => face.depth > 0).sort((a, b) => b.depth - a.depth);

  const baseColor = parseColor(color);
  ctx.save();
  for (const face of faces) {
    const brightness = shadeSurface(face.normal, lightDirection, 0.22);
    const [red, green, blue] = colorWithBrightness(baseColor, brightness);
    ctx.fillStyle = `rgb(${red} ${green} ${blue})`;
    ctx.strokeStyle = "rgba(12, 15, 28, 0.8)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(face.points[0].x, face.points[0].y);
    ctx.lineTo(face.points[1].x, face.points[1].y);
    ctx.lineTo(face.points[2].x, face.points[2].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function createSoftwareScene(canvas) {
  const context = canvas?.getContext?.("2d", { alpha: true });
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let state = {
    view: {
      cameraPosition: { x: 0, y: 8, z: 74 },
      target: { x: 0, y: 0, z: 0 },
      fovRadians: (33 * Math.PI) / 180,
      aspect: 1
    },
    zoomScale: 1,
    earthMap: createEarthSurfaceMap(),
    moonMap: createMoonSurfaceMap(),
    earth: { land: "#68df9f", fluid: "#0c89c7", atmosphere: "#61e7ff", atmosphereEnabled: true },
    neos: [],
    motion: { moonPhase: 0, neoPhases: {}, earthRotation: 0 },
    palette: { orbit: "#286078", moonOrbit: "#6178aa" }
  };

  function resize(nextWidth, nextHeight, nextPixelRatio = 1) {
    pixelRatio = Math.min(2, Math.max(1, Number(nextPixelRatio) || 1));
    width = Math.max(1, Math.round((Number(nextWidth) || 1) * pixelRatio));
    height = Math.max(1, Math.round((Number(nextHeight) || 1) * pixelRatio));
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    // ImageData writes ignore the current transform. Keep the entire software
    // renderer in physical pixels so raster bodies and vector overlays align
    // on Retina and standard displays alike.
    context?.setTransform(1, 0, 0, 1, 0, 0);
  }

  function setView(view) {
    state = { ...state, view };
  }

  function updateNeos(nextNeos = []) {
    state = { ...state, neos: nextNeos };
  }

  function updateEarth(nextEarth = {}) {
    const earth = { ...state.earth, ...nextEarth };
    state = {
      ...state,
      earth,
      earthMap: createEarthSurfaceMap(384, 192, {
        land: earth.land,
        fluid: earth.fluid,
        landmass: earth.landmass
      })
    };
  }

  function setMotion(motion = {}, zoomScale = state.zoomScale) {
    state = { ...state, motion: { ...state.motion, ...motion }, zoomScale };
  }

  function render() {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const view = getDisplayView(state.view, width, height, state.zoomScale);
    const centerWorld = view.target;
    const earthWorldRadius = EARTH_RADIUS_SCENE * 1.67;
    const earthProjection = projectToCanvas(centerWorld, view, width, height);
    const earthRadius = projectedRadius(earthWorldRadius, earthProjection.depth, view, height);
    const lightDirection = normalize({ x: -0.7, y: 0.55, z: 0.8 });

    drawOrbit(
      context,
      EARTH_RADIUS_SCENE * 1.65,
      0.12,
      view,
      width,
      height,
      state.palette.moonOrbit,
      0.3
    );
    for (const neo of state.neos) {
      drawOrbit(
        context,
        25 + Math.max(0, Number(neo.radius) - 19) * 0.55,
        neo.inclination,
        view,
        width,
        height,
        state.palette.orbit,
        0.45
      );
    }

    const moonWorld = getDisplayMoonPosition(state.motion.moonPhase);
    const moonProjection = projectToCanvas(moonWorld, view, width, height);
    const moonRadius = projectedRadius(
      MOON_RADIUS_SCENE * 1.67,
      moonProjection.depth,
      view,
      height
    );
    const bodies = [
      { kind: "earth", depth: earthProjection.depth },
      { kind: "moon", depth: moonProjection.depth, world: moonWorld, projection: moonProjection },
      ...state.neos.map((neo) => {
        const phase = state.motion.neoPhases[neo.id] ?? neo.phase ?? 0;
        const world = getDisplayNeoPosition(neo, phase);
        const projection = projectToCanvas(world, view, width, height);
        return { kind: "neo", neo, depth: projection.depth, world, projection, phase };
      })
    ].sort((a, b) => b.depth - a.depth);

    for (const body of bodies) {
      if (body.depth <= 0) continue;
      if (body.kind === "earth") {
        drawSphere(context, {
          center: { x: earthProjection.x, y: earthProjection.y },
          radius: earthRadius,
          view,
          texture: state.earthMap,
          rotationY: state.motion.earthRotation,
          lightDirection,
          atmosphere: state.earth.atmosphereEnabled ? state.earth.atmosphere : ""
        });
      } else if (body.kind === "moon") {
        drawSphere(context, {
          center: { x: body.projection.x, y: body.projection.y },
          radius: moonRadius,
          view,
          texture: state.moonMap,
          rotationY: state.motion.moonPhase + Math.PI,
          lightDirection,
          atmosphere: ""
        });
      } else {
        const neoRadius = Math.max(1.8, Number(body.neo.size || 1.2) * 0.72);
        drawPolyhedron(context, {
          center: {
            world: body.world,
            width,
            height
          },
          radius: neoRadius,
          view,
          polyhedron: createAsteroidPolyhedron(body.neo.appearance?.shape, body.neo.appearance?.seed),
          rotation: {
            x: body.phase * 0.7,
            y: state.motion.earthRotation * 1.8 + body.phase,
            z: body.phase * 0.35
          },
          color: body.neo.appearance?.materialColor,
          lightDirection
        });
      }
    }
  }

  function dispose() {
    context?.clearRect(0, 0, width, height);
  }

  return { resize, setView, updateEarth, updateNeos, setMotion, render, dispose };
}
