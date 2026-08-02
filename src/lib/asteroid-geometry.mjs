export function createAsteroidGeometry(Engine, size, appearance = {}) {
  let geometry;
  if (appearance.shape === "angular") {
    geometry = new Engine.OctahedronGeometry(size, 1);
  } else if (appearance.shape === "metallic") {
    geometry = new Engine.DodecahedronGeometry(size, 1);
  } else {
    geometry = new Engine.IcosahedronGeometry(size, 1);
  }

  if (appearance.shape === "elongated") geometry.scale(1.45, 0.76, 0.9);
  if (appearance.shape === "cratered") geometry.scale(1.12, 0.86, 1.08);

  const seed = Number.isFinite(Number(appearance.seed)) ? Number(appearance.seed) : 1;
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const jitter = 0.78 + (((seed + index * 31) % 100) / 100) * 0.35;
    positions.setXYZ(
      index,
      positions.getX(index) * jitter,
      positions.getY(index) * (0.88 + (seed % 17) / 100),
      positions.getZ(index) * jitter
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
