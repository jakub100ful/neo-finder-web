function pseudoRandom(seed, index) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function randomDirection(Engine, seed, index) {
  const z = pseudoRandom(seed, index * 2) * 2 - 1;
  const angle = pseudoRandom(seed, index * 2 + 1) * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return new Engine.Vector3(
    radial * Math.cos(angle),
    z,
    radial * Math.sin(angle)
  );
}

function getAxisRatios(appearance) {
  const fallback = {
    elongated: [1.45, 0.76, 0.9],
    cratered: [1.12, 0.86, 1.08],
    angular: [1, 0.92, 0.84],
    metallic: [1.08, 1, 0.88]
  }[appearance.shape] || [1, 0.94, 0.9];
  const axes = Array.isArray(appearance.axisRatios) ? appearance.axisRatios : fallback;
  const safe = axes.map((axis) => Math.max(0.28, Number(axis) || 1));
  const longest = Math.max(...safe);
  return safe.map((axis) => axis / longest);
}

function getCraterDirections(Engine, seed, count) {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    randomDirection(Engine, seed + 17, index)
  );
}

export function createAsteroidGeometry(Engine, size, appearance = {}) {
  const detail = Math.min(3, Math.max(1, Number(appearance.geometryDetail) || 1));
  let geometry;
  if (appearance.shape === "angular") {
    geometry = new Engine.OctahedronGeometry(size, detail);
  } else if (appearance.shape === "metallic") {
    geometry = new Engine.DodecahedronGeometry(size, detail);
  } else {
    geometry = new Engine.IcosahedronGeometry(size, detail);
  }

  const seed = Number.isFinite(Number(appearance.seed)) ? Number(appearance.seed) : 1;
  const axes = getAxisRatios(appearance);
  const relief = Math.min(0.42, Math.max(0, Number(appearance.surfaceRelief) || 0));
  const craterDepth = Math.min(
    0.32,
    Math.max(0, Number(appearance.craterDepth) || relief * 0.7)
  );
  const craterDirections = getCraterDirections(
    Engine,
    seed,
    Number(appearance.craterCount) || 0
  );
  const craterCosine = Math.cos(0.3 + (seed % 5) * 0.025);
  const positions = geometry.attributes.position;
  const baseColor = new Engine.Color(appearance.materialColor ?? 0x808080);
  const accentColor = new Engine.Color(appearance.accentColor ?? appearance.materialColor ?? 0xaaaaaa);
  const vertexColors = [];

  for (let index = 0; index < positions.count; index += 1) {
    const original = new Engine.Vector3(
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index)
    );
    const baseRadius = original.length() || size;
    const direction = original.clone().normalize();
    const multiScaleNoise =
      Math.sin(direction.x * 7.7 + seed) * 0.5 +
      Math.sin(direction.y * 13.1 - seed * 0.7) * 0.3 +
      Math.sin(direction.z * 19.3 + seed * 0.31) * 0.2;
    let radial = baseRadius * (1 + multiScaleNoise * relief * 0.42);

    for (const crater of craterDirections) {
      const alignment = direction.dot(crater);
      if (alignment > craterCosine) {
        const bowl = (alignment - craterCosine) / (1 - craterCosine);
        radial *= 1 - craterDepth * bowl * bowl;
      }
    }

    const vertex = direction.multiplyScalar(radial);
    vertex.x *= axes[0];
    vertex.y *= axes[1];
    vertex.z *= axes[2];
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);

    const colorMix = Math.min(
      0.8,
      Math.max(0.08, 0.2 + multiScaleNoise * 0.2 + relief * 0.35)
    );
    const color = baseColor.clone().lerp(accentColor, colorMix);
    vertexColors.push(color.r, color.g, color.b);
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new Engine.Float32BufferAttribute(vertexColors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
