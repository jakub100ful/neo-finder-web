// Shared, renderer-independent orbital math.
//
// Three.js and the compositor-safe software renderer use the same local
// orbital math so every renderer preserves the same relative scale.

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

  // When JPL orbital elements are available, treat the scene radius as the
  // semi-major axis of an elliptical path and orient that path using the
  // classical elements.  The fallback below intentionally preserves the
  // compact demo orbit used by older saved objects without those elements.
  const orbit = metrics?.orbit;
  if (orbit?.hasElements) {
    const eccentricity = Math.min(0.75, Math.max(0, Number(orbit.eccentricity) || 0));
    const semiMinor = radius * Math.sqrt(1 - eccentricity ** 2);
    const eccentricAnomaly = Number.isFinite(phase) ? phase : 0;
    const localX = radius * (Math.cos(eccentricAnomaly) - eccentricity);
    const localZ = semiMinor * Math.sin(eccentricAnomaly);
    const argument = Number(orbit.argumentOfPeriapsisRadians) || 0;
    const node = Number(orbit.ascendingNodeRadians) || 0;
    const tilt = Number(orbit.inclinationRadians) || 0;

    const periapsisX = localX * Math.cos(argument) - localZ * Math.sin(argument);
    const periapsisZ = localX * Math.sin(argument) + localZ * Math.cos(argument);
    const tiltedY = -periapsisZ * Math.sin(tilt);
    const tiltedZ = periapsisZ * Math.cos(tilt);

    return {
      x: periapsisX * Math.cos(node) + tiltedZ * Math.sin(node),
      y: tiltedY,
      z: -periapsisX * Math.sin(node) + tiltedZ * Math.cos(node)
    };
  }

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
