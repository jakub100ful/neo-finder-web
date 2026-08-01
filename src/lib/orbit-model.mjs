// Shared, renderer-independent orbital math.
//
// Three.js uses these values for the real scene. The DOM fallback is only a
// renderer-failure safety net and reuses the same local orbital math.

export const EARTH_RADIUS_SCENE = 12;
export const EARTH_RADIUS_KM = 6371;
export const MOON_RADIUS_KM = 1737.4;
export const MOON_DISTANCE_KM = 384400;
export const MOON_ORBIT_PERIOD_DAYS = 27.32166;
export const SIMULATED_DAYS_PER_SECOND = 1;
export const NEO_ORBIT_PHASE_RATE = 0.21;

export const MOON_RADIUS_SCENE = EARTH_RADIUS_SCENE * (MOON_RADIUS_KM / EARTH_RADIUS_KM);
export const MOON_ORBIT_RADIUS = EARTH_RADIUS_SCENE * (MOON_DISTANCE_KM / EARTH_RADIUS_KM);

export const ZOOM_MIN_MULTIPLIER = 0.55;
export const ZOOM_MAX_MULTIPLIER = 10;

export function getMoonRelativePosition(phase = 0) {
  return {
    x: Math.cos(phase) * MOON_ORBIT_RADIUS,
    y: 0,
    z: Math.sin(phase) * MOON_ORBIT_RADIUS
  };
}

export function getNeoOrbitPosition(metrics, phase = metrics?.phase ?? 0) {
  const radius = Number(metrics?.radius) || 0;
  const inclination = Number(metrics?.inclination) || 0;
  return {
    x: Math.cos(phase) * radius,
    y: Math.sin(phase) * radius * inclination,
    z: Math.sin(phase) * radius
  };
}

export function getZoomBounds(defaultDistance) {
  return {
    min: defaultDistance * ZOOM_MIN_MULTIPLIER,
    max: defaultDistance * ZOOM_MAX_MULTIPLIER
  };
}

export function clampCameraDistance(nextDistance, defaultDistance) {
  const { min, max } = getZoomBounds(defaultDistance);
  const candidate = Number.isFinite(nextDistance) ? nextDistance : defaultDistance;
  return Math.min(max, Math.max(min, candidate));
}

export function getZoomScale(cameraDistance, defaultDistance) {
  return Number((cameraDistance / defaultDistance).toFixed(1));
}

export function getOrbitalRenderState({ moonPhase = 0, neos = [] } = {}) {
  const earth = {
    id: "earth",
    kind: "earth",
    visible: true,
    position: { x: 0, y: 0, z: 0 },
    radius: EARTH_RADIUS_SCENE
  };
  const moon = {
    id: "moon",
    kind: "moon",
    visible: true,
    tidallyLocked: true,
    position: getMoonRelativePosition(moonPhase),
    radius: MOON_RADIUS_SCENE
  };
  const neoBodies = neos.slice(0, 8).map((metrics, index) => ({
    id: metrics?.id ?? `neo-${index}`,
    kind: "neo",
    visible: true,
    position: getNeoOrbitPosition(metrics),
    radius: Number(metrics?.size) || 0,
    sourceRadius: Number(metrics?.radius) || 0,
    speed: Number(metrics?.speed) || 0
  }));

  return {
    earth,
    moon,
    neos: neoBodies,
    bodies: [earth, moon, ...neoBodies]
  };
}
