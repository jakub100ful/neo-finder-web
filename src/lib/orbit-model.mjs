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
export const NEO_ORBIT_CLEARANCE_SCENE = 1.25;

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

export function getNeoMinimumPeriapsisRadius(bodyRadius = 0, centralBodyRadius = EARTH_RADIUS_SCENE) {
  const body = Number(bodyRadius);
  const central = Number(centralBodyRadius);
  return (
    (Number.isFinite(central) && central > 0 ? central : EARTH_RADIUS_SCENE) +
    (Number.isFinite(body) && body > 0 ? body : 0) +
    NEO_ORBIT_CLEARANCE_SCENE
  );
}

function wrapAngle(angle) {
  const wrapped = angle % (Math.PI * 2);
  return wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped < -Math.PI ? wrapped + Math.PI * 2 : wrapped;
}

export function solveKeplerEquation(meanAnomaly, eccentricity) {
  const e = Math.min(0.999999, Math.max(0, Number(eccentricity) || 0));
  const mean = wrapAngle(Number(meanAnomaly) || 0);
  if (e === 0) return mean;

  let eccentricAnomaly = e < 0.8 ? mean : Math.PI * Math.sign(mean || 1);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const correction =
      (eccentricAnomaly - e * Math.sin(eccentricAnomaly) - mean) /
      (1 - e * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= correction;
    if (Math.abs(correction) < 1e-10) break;
  }
  return eccentricAnomaly;
}

export function getNeoOrbitPosition(metrics, phase = metrics?.phase ?? 0) {
  const requestedRadius = Number(metrics?.radius);
  const radius = Number.isFinite(requestedRadius) && requestedRadius > 0 ? requestedRadius : 0;
  const bodyRadius = Number(metrics?.bodyRadius ?? metrics?.size);
  const centralBodyRadius = Number(metrics?.centralBodyRadius);
  const configuredMinimumPeriapsis = Number(metrics?.minimumPeriapsisRadius);
  const minimumPeriapsisRadius =
    Number.isFinite(configuredMinimumPeriapsis) && configuredMinimumPeriapsis > 0
      ? configuredMinimumPeriapsis
      : getNeoMinimumPeriapsisRadius(bodyRadius, centralBodyRadius);
  const safePeriapsisRadius = Math.max(radius, minimumPeriapsisRadius);

  // The feed's miss distance is measured from Earth's centre to the NEO's
  // centre. It becomes the preferred shared display scale, while this floor
  // prevents an eccentric ellipse from drawing the visible body through Earth.
  // The floor only expands the semi-major axis when a(1-e) would be unsafe.
  const orbit = metrics?.orbit;
  if (orbit?.hasElements) {
    const eccentricity = Math.min(0.999999, Math.max(0, Number(orbit.eccentricity) || 0));
    const semiMajorAxis = Math.max(
      radius,
      minimumPeriapsisRadius / Math.max(1 - eccentricity, 0.000001)
    );
    const semiMinor = semiMajorAxis * Math.sqrt(1 - eccentricity ** 2);
    const eccentricAnomaly = solveKeplerEquation(phase, eccentricity);
    const xPrime = semiMajorAxis * (Math.cos(eccentricAnomaly) - eccentricity);
    const yPrime = semiMinor * Math.sin(eccentricAnomaly);
    const argument = Number(orbit.argumentOfPeriapsisRadians) || 0;
    const node = Number(orbit.ascendingNodeRadians) || 0;
    const inclination = Number(orbit.inclinationRadians) || 0;
    const cosArgument = Math.cos(argument);
    const sinArgument = Math.sin(argument);
    const cosNode = Math.cos(node);
    const sinNode = Math.sin(node);
    const cosInclination = Math.cos(inclination);
    const sinInclination = Math.sin(inclination);

    // JPL's ecliptic coordinates use x/y in the orbital plane and z normal to
    // it. The scene uses x/z as its presentation plane, so ecliptic z maps to
    // scene y and ecliptic y maps to scene z.
    return {
      x:
        (cosArgument * cosNode - sinArgument * sinNode * cosInclination) * xPrime +
        (-sinArgument * cosNode - cosArgument * sinNode * cosInclination) * yPrime,
      y: sinArgument * sinInclination * xPrime + cosArgument * sinInclination * yPrime,
      z:
        (cosArgument * sinNode + sinArgument * cosNode * cosInclination) * xPrime +
        (-sinArgument * sinNode + cosArgument * cosNode * cosInclination) * yPrime
    };
  }

  const inclination = Number(metrics?.inclination) || 0;
  return {
    x: Math.cos(phase) * safePeriapsisRadius,
    y: Math.sin(phase) * safePeriapsisRadius * inclination,
    z: Math.sin(phase) * safePeriapsisRadius
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
