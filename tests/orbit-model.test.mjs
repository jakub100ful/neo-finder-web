import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EARTH_RADIUS_SCENE,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS_SCENE,
  NEO_ORBIT_PHASE_RATE,
  ZOOM_MAX_MULTIPLIER,
  ZOOM_MIN_MULTIPLIER,
  clampCameraDistance,
  getMoonRelativePosition,
  getNeoOrbitPosition,
  getOrbitalRenderState,
  getZoomBounds,
  getZoomScale
} from "../src/lib/orbit-model.mjs";
import {
  getCameraOrbitPosition,
  getFacingNormal,
  projectWorldPoint
} from "../src/lib/view-model.mjs";
import {
  createAsteroidPolyhedron,
  getWorldSphereNormal,
  rotateVector,
  sampleSphereSurface,
  shadeSurface
} from "../src/lib/space-raster.mjs";

const nearlyEqual = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

const distance = ({ x, y, z }) => Math.sqrt(x ** 2 + y ** 2 + z ** 2);

test("the Earth and Moon use the same relative scale", () => {
  const moonAtStart = getMoonRelativePosition(0);

  nearlyEqual(distance(moonAtStart), MOON_ORBIT_RADIUS);
  nearlyEqual(moonAtStart.x, MOON_ORBIT_RADIUS);
  assert.ok(MOON_ORBIT_RADIUS > EARTH_RADIUS_SCENE);
  assert.ok(MOON_RADIUS_SCENE < EARTH_RADIUS_SCENE);
});

test("the orbital model moves the Moon instead of leaving it at origin", () => {
  const moonAtQuarterTurn = getMoonRelativePosition(Math.PI / 2);

  nearlyEqual(moonAtQuarterTurn.x, 0, 1e-5);
  nearlyEqual(moonAtQuarterTurn.z, MOON_ORBIT_RADIUS);
});

test("NEOs retain their orbital radius, inclination and phase", () => {
  const metrics = { radius: 31, inclination: 0.35, phase: 0.4, speed: 0.8, size: 1.6 };
  const position = getNeoOrbitPosition(metrics);
  const horizontalRadius = Math.sqrt(position.x ** 2 + position.z ** 2);

  nearlyEqual(horizontalRadius, metrics.radius);
  nearlyEqual(position.y, Math.sin(metrics.phase) * metrics.radius * metrics.inclination);
  assert.ok(metrics.speed * NEO_ORBIT_PHASE_RATE > 0);
});

test("the renderer state includes visible Earth, Moon and NEO bodies", () => {
  const state = getOrbitalRenderState({
    moonPhase: 1.1,
    neos: [
      { id: "neo-a", radius: 22, inclination: 0.1, phase: 0.4, speed: 0.5, size: 1 },
      { id: "neo-b", radius: 34, inclination: -0.2, phase: 1.2, speed: 1.1, size: 2 }
    ]
  });

  assert.deepEqual(
    state.bodies.map((body) => body.kind),
    ["earth", "moon", "neo", "neo"]
  );
  assert.ok(state.bodies.every((body) => body.visible));
  assert.equal(state.moon.tidallyLocked, true);
  assert.notDeepEqual(state.moon.position, { x: 0, y: 0, z: 0 });
  assert.equal(state.neos.length, 2);
});

test("zoom is bounded and reports a scale the renderer can use", () => {
  const defaultDistance = 74.43;
  const bounds = getZoomBounds(defaultDistance);

  nearlyEqual(bounds.min, defaultDistance * ZOOM_MIN_MULTIPLIER);
  nearlyEqual(bounds.max, defaultDistance * ZOOM_MAX_MULTIPLIER);
  nearlyEqual(clampCameraDistance(0, defaultDistance), bounds.min);
  nearlyEqual(clampCameraDistance(Number.POSITIVE_INFINITY, defaultDistance), defaultDistance);
  nearlyEqual(clampCameraDistance(bounds.max * 2, defaultDistance), bounds.max);
  assert.equal(getZoomScale(bounds.min, defaultDistance), Number(ZOOM_MIN_MULTIPLIER.toFixed(1)));
  assert.equal(getZoomScale(bounds.max, defaultDistance), Number(ZOOM_MAX_MULTIPLIER.toFixed(1)));
});

test("camera orbit exposes a different side of the Earth without moving its target", () => {
  const target = { x: 0, y: 0, z: 0 };
  const frontView = {
    cameraPosition: getCameraOrbitPosition({
      azimuth: 0,
      polar: Math.PI / 2,
      distance: 120,
      target
    }),
    target,
    fovRadians: Math.PI / 4,
    aspect: 1
  };
  const sideView = {
    ...frontView,
    cameraPosition: getCameraOrbitPosition({
      azimuth: Math.PI / 2,
      polar: Math.PI / 2,
      distance: 120,
      target
    })
  };

  const frontEarth = projectWorldPoint(target, frontView);
  const sideEarth = projectWorldPoint(target, sideView);
  assert.equal(frontEarth.x, 0.5);
  assert.equal(frontEarth.y, 0.5);
  assert.equal(sideEarth.x, 0.5);
  assert.equal(sideEarth.y, 0.5);
  assert.notDeepEqual(
    getFacingNormal(frontView.cameraPosition, target),
    getFacingNormal(sideView.cameraPosition, target)
  );
});

test("camera projection changes orbital body screen position and depth", () => {
  const target = { x: 0, y: 0, z: 0 };
  const body = { x: 42, y: 8, z: 18 };
  const frontView = {
    cameraPosition: getCameraOrbitPosition({
      azimuth: 0,
      polar: Math.PI / 2,
      distance: 180,
      target
    }),
    target,
    fovRadians: Math.PI / 4,
    aspect: 1.6
  };
  const sideView = {
    ...frontView,
    cameraPosition: getCameraOrbitPosition({
      azimuth: Math.PI / 2,
      polar: Math.PI / 2,
      distance: 180,
      target
    })
  };
  const frontProjection = projectWorldPoint(body, frontView);
  const sideProjection = projectWorldPoint(body, sideView);

  assert.notEqual(frontProjection.x, sideProjection.x);
  assert.notEqual(frontProjection.y, sideProjection.y);
  assert.notEqual(frontProjection.depth, sideProjection.depth);
  assert.equal(frontProjection.visible, true);
  assert.equal(sideProjection.visible, true);
});

test("perspective scale makes a nearer body larger than a farther body", () => {
  const target = { x: 0, y: 0, z: 0 };
  const view = {
    cameraPosition: { x: 0, y: 0, z: 200 },
    target,
    fovRadians: Math.PI / 4,
    aspect: 1
  };

  const near = projectWorldPoint({ x: 20, y: 0, z: 80 }, view);
  const far = projectWorldPoint({ x: 20, y: 0, z: -40 }, view);

  assert.ok(near.visible);
  assert.ok(far.visible);
  assert.ok(near.perspectiveScale > far.perspectiveScale);
});

test("software sphere rasterization has a curved silhouette and measurable depth", () => {
  const center = sampleSphereSurface({ x: 0, y: 0, radius: 10 });
  const edge = sampleSphereSurface({ x: 9.9, y: 0, radius: 10 });
  const outside = sampleSphereSurface({ x: 10.1, y: 0, radius: 10 });

  assert.ok(center);
  assert.ok(edge);
  assert.equal(outside, null);
  nearlyEqual(center.normal.z, 1);
  assert.ok(center.depth > edge.depth);
  assert.ok(edge.normal.z < 0.15);
  assert.deepEqual(center.uv, { u: 0.5, v: 0.5 });
});

test("software sphere normals follow the camera around the Earth", () => {
  const target = { x: 0, y: 0, z: 0 };
  const frontView = {
    cameraPosition: getCameraOrbitPosition({ azimuth: 0, polar: Math.PI / 2, distance: 120, target }),
    target,
    fovRadians: Math.PI / 4,
    aspect: 1
  };
  const sideView = {
    ...frontView,
    cameraPosition: getCameraOrbitPosition({ azimuth: Math.PI / 2, polar: Math.PI / 2, distance: 120, target })
  };
  const frontNormal = getWorldSphereNormal({ x: 0, y: 0, radius: 10 }, frontView);
  const sideNormal = getWorldSphereNormal({ x: 0, y: 0, radius: 10 }, sideView);

  assert.ok(frontNormal.z > 0.99);
  assert.ok(sideNormal.x > 0.99);
  assert.ok(shadeSurface(frontNormal, { x: 0, y: 0, z: 1 }) > shadeSurface(sideNormal, { x: 0, y: 0, z: 1 }));
});

test("partial body rotations keep software texture coordinates finite", () => {
  const rotated = rotateVector({ x: 0, y: 0, z: 1 }, { y: Math.PI / 2 });

  assert.ok(Object.values(rotated).every(Number.isFinite));
  nearlyEqual(rotated.x, 1);
  nearlyEqual(rotated.z, 0);
});

test("asteroid fallback geometry contains shaded 3D polygon faces", () => {
  const angular = createAsteroidPolyhedron("angular", 17);
  const elongated = createAsteroidPolyhedron("elongated", 23);

  assert.ok(angular.faces.length >= 8);
  assert.ok(elongated.faces.length >= 8);
  assert.ok(angular.vertices.some((vertex) => Math.abs(vertex.z) > 0.1));
  assert.ok(elongated.vertices.some((vertex) => Math.abs(vertex.y) > 0.1));
  assert.notDeepEqual(angular.vertices, elongated.vertices);
});

test("the Svelte scene uses WebGL plus a compositor-safe 3D renderer", async () => {
  const source = await readFile(new URL("../src/lib/SpaceScene.svelte", import.meta.url), "utf8");
  const rasterSource = await readFile(new URL("../src/lib/space-raster.mjs", import.meta.url), "utf8");

  for (const marker of [
    "MeshStandardMaterial",
    "alpha: true",
    "three/addons/controls/OrbitControls.js",
    "const controls = new OrbitControls",
    "controls.target.set(0, 0, 0)",
    "controls.enableDamping = true",
    "const cameraFar = maxCameraDistance + MOON_ORBIT_RADIUS + EARTH_RADIUS_SCENE * 4",
    "controls.minPolarAngle = Math.PI * 0.05",
    "controls.minDistance",
    "controls.maxDistance",
    "vertexColors: true",
    "getCameraOrbitPosition",
    "createSoftwareScene",
    "createEarthSurfaceMap",
    "createMoonSurfaceMap",
    "softwareController.render",
    "software-canvas",
    'data-renderer="software-3d"',
    "controls.addEventListener(\"change\"",
    "scene-shell::before",
    "DRAG TO ORBIT",
    "animate(previousTime)"
  ]) {
    assert.ok(source.includes(marker), `missing 3D renderer marker: ${marker}`);
  }

  for (const marker of ["sampleSphereSurface", "getWorldSphereNormal", "createAsteroidPolyhedron"]) {
    assert.ok(rasterSource.includes(marker), `missing software 3D marker: ${marker}`);
  }

  assert.ok(!source.includes("targetCameraDistance"));
  assert.match(source, /\.webgl-canvas\s*\{[\s\S]*?z-index: 3/);
  assert.match(source, /\.software-canvas\s*\{[\s\S]*?z-index: 2/);
  assert.match(source, /controls\.dispose\(\)/);
  assert.ok(!source.includes("fallback-earth"));
  assert.ok(!source.includes("fallback-moon"));
  assert.ok(!source.includes("fallback-neo"));
  assert.ok(!source.includes('data-fallback-body="sun"'));
  assert.ok(!source.includes("sunSystem"));
});

test("the catalogue exposes an anchor-date editor", async () => {
  const source = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");

  for (const marker of ["dateReturnView", "openDateEditor(\"catalogue\")", "CHANGE DATE", "UPDATE ORBIT"]) {
    assert.ok(source.includes(marker), `missing catalogue date editor marker: ${marker}`);
  }
});
