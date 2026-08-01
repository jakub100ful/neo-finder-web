// Camera-independent 3D view math shared by the live renderer and its
// compositor-safe presentation layer.

const EPSILON = 1e-7;

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function subtract(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
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
  const length = Math.sqrt(dot(vector, vector));
  if (length < EPSILON) return fallback;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

export function getCameraOrbitPosition({
  azimuth = 0,
  polar = Math.PI / 2,
  distance = 1,
  target = { x: 0, y: 0, z: 0 }
} = {}) {
  const safeAzimuth = finiteOr(azimuth, 0);
  const safePolar = finiteOr(polar, Math.PI / 2);
  const safeDistance = Math.max(EPSILON, finiteOr(distance, 1));
  const sinPolar = Math.sin(safePolar);

  return {
    x: target.x + safeDistance * sinPolar * Math.sin(safeAzimuth),
    y: target.y + safeDistance * Math.cos(safePolar),
    z: target.z + safeDistance * sinPolar * Math.cos(safeAzimuth)
  };
}

export function getFacingNormal(cameraPosition, target = { x: 0, y: 0, z: 0 }) {
  return normalize(subtract(cameraPosition, target));
}

export function getCameraBasis({
  cameraPosition,
  target = { x: 0, y: 0, z: 0 },
  worldUp = { x: 0, y: 1, z: 0 }
} = {}) {
  const forward = normalize(subtract(target, cameraPosition));
  const right = normalize(cross(forward, worldUp), { x: 1, y: 0, z: 0 });
  const up = normalize(cross(right, forward), { x: 0, y: 1, z: 0 });
  return { forward, right, up };
}

export function projectWorldPoint(
  point,
  {
    cameraPosition,
    target = { x: 0, y: 0, z: 0 },
    fovRadians = Math.PI / 4,
    aspect = 1
  } = {}
) {
  const basis = getCameraBasis({ cameraPosition, target });
  const relative = subtract(point, cameraPosition);
  const depth = dot(relative, basis.forward);
  const safeDepth = Math.max(depth, EPSILON);
  const safeAspect = Math.max(EPSILON, finiteOr(aspect, 1));
  const tangent = Math.tan(Math.max(EPSILON, finiteOr(fovRadians, Math.PI / 4) / 2));
  const horizontal = dot(relative, basis.right) / (safeDepth * tangent * safeAspect);
  const vertical = dot(relative, basis.up) / (safeDepth * tangent);

  return {
    x: 0.5 + horizontal * 0.5,
    y: 0.5 - vertical * 0.5,
    depth,
    perspectiveScale: 1 / safeDepth,
    visible: depth > EPSILON
  };
}
