// The map is sampled in 3D unit-sphere coordinates rather than latitude/longitude
// space. A low-frequency coherent field supplies continental scale, fBm layers
// add coast detail, domain warping breaks up smooth blobs, and a cellular field
// supplies the optional island fracture. The final threshold is a quantile so
// the coverage slider describes the actual rendered land fraction.
const UINT_MAX = 0xffffffff;

export const LANDMASS_DEFAULTS = Object.freeze({
  seed: 17,
  landCoverage: 0.36,
  continentalScale: 0.58,
  coastCorrugation: 0.32,
  islandFracture: 0.18,
  tectonicWarp: 0.28
});

export const LANDMASS_STYLES = Object.freeze([
  {
    id: "continents",
    name: "EARTHLIKE",
    detail: "warped continental plates"
  },
  {
    id: "archipelago",
    name: "ARCHIPELAGO",
    detail: "broken island chains"
  },
  {
    id: "fractured",
    name: "FRACTURED",
    detail: "rugged micro-continents"
  }
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeLandmassConfig(input = {}) {
  return {
    seed: Math.trunc(finiteOr(input.seed, LANDMASS_DEFAULTS.seed)),
    landCoverage: clamp(
      finiteOr(input.landCoverage, LANDMASS_DEFAULTS.landCoverage),
      0.16,
      0.68
    ),
    continentalScale: clamp(
      finiteOr(input.continentalScale, LANDMASS_DEFAULTS.continentalScale),
      0,
      1
    ),
    coastCorrugation: clamp(
      finiteOr(input.coastCorrugation, LANDMASS_DEFAULTS.coastCorrugation),
      0,
      1
    ),
    islandFracture: clamp(
      finiteOr(input.islandFracture, LANDMASS_DEFAULTS.islandFracture),
      0,
      1
    ),
    tectonicWarp: clamp(
      finiteOr(input.tectonicWarp, LANDMASS_DEFAULTS.tectonicWarp),
      0,
      1
    )
  };
}

export function resolveLandmassConfig(style, input = {}) {
  const base = normalizeLandmassConfig(input);

  if (style === "archipelago") {
    return {
      ...base,
      continentalScale: Math.min(base.continentalScale, 0.44),
      islandFracture: Math.max(base.islandFracture, 0.68)
    };
  }

  if (style === "fractured") {
    return {
      ...base,
      continentalScale: Math.min(base.continentalScale, 0.5),
      coastCorrugation: Math.max(base.coastCorrugation, 0.68),
      islandFracture: Math.max(base.islandFracture, 0.48),
      tectonicWarp: Math.max(base.tectonicWarp, 0.5)
    };
  }

  return base;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function hash3(x, y, z, seed) {
  let hash = Math.imul((x | 0) ^ Math.imul(seed | 0, 374761393), 668265263);
  hash = Math.imul(hash ^ (y | 0), 2246822519);
  hash = Math.imul(hash ^ (z | 0), 3266489917);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489917);
  hash ^= hash >>> 16;
  return (hash >>> 0) / UINT_MAX;
}

function valueNoise3D(x, y, z, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const xAmount = fade(x - x0);
  const yAmount = fade(y - y0);
  const zAmount = fade(z - z0);

  const c000 = hash3(x0, y0, z0, seed);
  const c100 = hash3(x0 + 1, y0, z0, seed);
  const c010 = hash3(x0, y0 + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const c001 = hash3(x0, y0, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const c011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);

  const x00 = lerp(c000, c100, xAmount);
  const x10 = lerp(c010, c110, xAmount);
  const x01 = lerp(c001, c101, xAmount);
  const x11 = lerp(c011, c111, xAmount);
  return lerp(lerp(x00, x10, yAmount), lerp(x01, x11, yAmount), zAmount);
}

function fractalNoise3D(x, y, z, frequency, octaves, gain, seed) {
  let total = 0;
  let amplitude = 1;
  let totalAmplitude = 0;
  let currentFrequency = frequency;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise3D(
      x * currentFrequency,
      y * currentFrequency,
      z * currentFrequency,
      seed + octave * 1013
    ) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= gain;
    currentFrequency *= 2;
  }

  return total / totalAmplitude;
}

function cellularNoise3D(x, y, z, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const cellZ = Math.floor(z);
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const pointX = cellX + offsetX + hash3(cellX + offsetX, cellY + offsetY, cellZ + offsetZ, seed);
        const pointY = cellY + offsetY + hash3(cellX + offsetX, cellY + offsetY, cellZ + offsetZ, seed + 17);
        const pointZ = cellZ + offsetZ + hash3(cellX + offsetX, cellY + offsetY, cellZ + offsetZ, seed + 31);
        const dx = pointX - x;
        const dy = pointY - y;
        const dz = pointZ - z;
        const distance = dx * dx + dy * dy + dz * dz;
        nearestDistance = Math.min(nearestDistance, distance);
      }
    }
  }

  return clamp(1 - Math.sqrt(nearestDistance) / Math.sqrt(3), 0, 1);
}

function createLandmassSampler(input = {}) {
  const config = normalizeLandmassConfig(input);
  const macroFrequency = 1.05 + (1 - config.continentalScale) * 2.35;
  const coastFrequency = macroFrequency * (2.3 + config.coastCorrugation * 1.9);
  const warpFrequency = macroFrequency * 0.72;
  const cellularFrequency = macroFrequency * (1.45 + config.islandFracture * 1.7);
  const warpAmount = config.tectonicWarp * 0.52;

  return (x, y, z) => {
    const warpX = (fractalNoise3D(x, y, z, warpFrequency, 2, 0.55, config.seed + 41) - 0.5) * 2 * warpAmount;
    const warpY = (fractalNoise3D(x, y, z, warpFrequency, 2, 0.55, config.seed + 83) - 0.5) * 2 * warpAmount;
    const warpZ = (fractalNoise3D(x, y, z, warpFrequency, 2, 0.55, config.seed + 127) - 0.5) * 2 * warpAmount;
    const warpedX = x + warpX;
    const warpedY = y + warpY;
    const warpedZ = z + warpZ;

    const continentalField = fractalNoise3D(
      warpedX,
      warpedY,
      warpedZ,
      macroFrequency,
      3,
      0.56,
      config.seed + 7
    );
    const coastField = fractalNoise3D(
      warpedX,
      warpedY,
      warpedZ,
      coastFrequency,
      4,
      0.52,
      config.seed + 191
    );
    const islandField = cellularNoise3D(
      warpedX * cellularFrequency,
      warpedY * cellularFrequency,
      warpedZ * cellularFrequency,
      config.seed + 313
    );

    const fracturedField = lerp(
      continentalField,
      continentalField * 0.52 + islandField * 0.48,
      config.islandFracture
    );
    const corrugatedField = coastField - 0.5;
    return clamp(
      fracturedField * 0.78 +
        coastField * 0.22 +
        corrugatedField * config.coastCorrugation * 0.38,
      0,
      1
    );
  };
}

export function sampleLandmass(point, input = {}) {
  const length = Math.hypot(point[0], point[1], point[2]) || 1;
  const sampler = createLandmassSampler(input);
  return sampler(point[0] / length, point[1] / length, point[2] / length);
}

export function generateLandmassMap(width = 384, height = 192, input = {}) {
  const mapWidth = Math.max(2, Math.floor(width));
  const mapHeight = Math.max(2, Math.floor(height));
  const config = normalizeLandmassConfig(input);
  const sampler = createLandmassSampler(config);
  const values = new Float32Array(mapWidth * mapHeight);

  for (let y = 0; y < mapHeight; y += 1) {
    const latitude = Math.PI * 0.5 - (Math.PI * (y + 0.5)) / mapHeight;
    const latitudeCosine = Math.cos(latitude);
    const latitudeY = Math.sin(latitude);

    for (let x = 0; x < mapWidth; x += 1) {
      const longitude = -Math.PI + (Math.PI * 2 * (x + 0.5)) / mapWidth;
      const value = sampler(
        latitudeCosine * Math.cos(longitude),
        latitudeY,
        latitudeCosine * Math.sin(longitude)
      );
      values[y * mapWidth + x] = value;
    }
  }

  const sortedValues = values.slice();
  sortedValues.sort();
  const targetLandPixels = Math.max(
    1,
    Math.min(values.length - 1, Math.round(values.length * config.landCoverage))
  );
  const threshold = sortedValues[values.length - targetLandPixels];
  const mask = new Uint8Array(values.length);
  let landPixels = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) {
      mask[index] = 1;
      landPixels += 1;
    }
  }

  return {
    width: mapWidth,
    height: mapHeight,
    values,
    mask,
    threshold,
    landCoverage: landPixels / values.length,
    config
  };
}
