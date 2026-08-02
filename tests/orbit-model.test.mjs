import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EARTH_RADIUS_SCENE,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS_SCENE,
  NEO_ORBIT_CLEARANCE_SCENE,
  NEO_ORBIT_PHASE_RATE,
  ZOOM_MAX_MULTIPLIER,
  ZOOM_MIN_MULTIPLIER,
  clampCameraDistance,
  getMoonRelativePosition,
  getNeoMinimumPeriapsisRadius,
  getNeoOrbitPosition,
  getOrbitalRenderState,
  solveKeplerEquation,
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
import { createAsteroidGeometry } from "../src/lib/asteroid-geometry.mjs";
import { fetchNeoOrbitData, getAppearance, getSceneMetrics } from "../src/lib/neo.js";
import { demoNeos } from "../src/lib/data/demo-neos.js";

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

test("eccentric NEOs keep their rendered body outside the Earth", () => {
  const bodyRadius = 4;
  const orbit = {
    hasElements: true,
    eccentricity: 0.82,
    ascendingNodeRadians: 0,
    argumentOfPeriapsisRadians: 0,
    inclinationRadians: 0
  };
  const periapsis = getNeoOrbitPosition({ radius: 14, bodyRadius, orbit }, 0);
  const minimumPeriapsis = getNeoMinimumPeriapsisRadius(bodyRadius);

  nearlyEqual(distance(periapsis), minimumPeriapsis);
  assert.ok(distance(periapsis) > EARTH_RADIUS_SCENE + bodyRadius);
  nearlyEqual(minimumPeriapsis, EARTH_RADIUS_SCENE + bodyRadius + NEO_ORBIT_CLEARANCE_SCENE);
});

test("JPL physical fields shape the asteroid and orbital orientation profile", () => {
  const neo = {
    id: "2000433",
    orbital_data: {
      eccentricity: "0.2229",
      inclination: "10.8285",
      ascending_node_longitude: "304.2679",
      perihelion_argument: "178.9181",
      mean_anomaly: "62.5114",
      orbital_period: "643.196"
    },
    physical: {
      extent: "34.4x11.2x11.2",
      density: 2.67,
      rotationPeriodHours: 5.27,
      pole: "11.37/17.22",
      albedo: 0.25,
      colorIndexBV: 0.921,
      spectralClass: "S"
    }
  };

  const appearance = getAppearance(neo);
  const metrics = getSceneMetrics(neo);
  const axisLength = Math.hypot(...appearance.spinAxis);

  assert.ok(appearance.axisRatios[0] > appearance.axisRatios[1] * 1.5);
  nearlyEqual(axisLength, 1);
  assert.equal(appearance.rotationPeriodHours, 5.27);
  assert.equal(appearance.spectralClass, "S");
  assert.ok(appearance.surfaceRelief > 0);
  assert.ok(metrics.orbit.eccentricity > 0);
  assert.notEqual(metrics.orbit.ascendingNodeRadians, 0);
});

test("demo NEO fixtures expose numeric eccentricities for the fallback scene", () => {
  for (const neo of demoNeos) {
    const eccentricity = Number(neo.orbital_data.eccentricity);
    assert.ok(Number.isFinite(eccentricity));
    assert.ok(eccentricity >= 0 && eccentricity < 1);
  }
});

test("orbital elements tilt and elongate the rendered NEO path", async () => {
  const source = await readFile(new URL("../src/lib/orbit-model.mjs", import.meta.url), "utf8");

  for (const marker of [
    "ascendingNodeRadians",
    "argumentOfPeriapsisRadians",
    "eccentricity",
    "Math.sqrt(1 - eccentricity ** 2)"
  ]) {
    assert.ok(source.includes(marker), `missing orbital-element marker: ${marker}`);
  }
});

test("orbital elements produce an eccentric, tilted scene path", () => {
  const metrics = {
    radius: 30,
    orbit: {
      hasElements: true,
      eccentricity: 0.5,
      ascendingNodeRadians: 0.7,
      argumentOfPeriapsisRadians: 0.4,
      inclinationRadians: 0.35
    }
  };
  const periapsis = getNeoOrbitPosition(metrics, 0);
  const apoapsis = getNeoOrbitPosition(metrics, Math.PI);

  assert.ok(distance(apoapsis) > distance(periapsis));
  assert.notEqual(periapsis.y, 0);
  assert.notEqual(periapsis.x, metrics.radius);
});

test("mean anomaly is converted to eccentric anomaly and preserves the shared scale", () => {
  const radius = 30;
  const eccentricity = 0.82;
  const inclination = Math.PI / 6;
  const orbit = {
    hasElements: true,
    eccentricity,
    inclinationRadians: inclination,
    ascendingNodeRadians: 0,
    argumentOfPeriapsisRadians: 0
  };
  const periapsis = getNeoOrbitPosition({ radius, orbit }, 0);
  const apoapsis = getNeoOrbitPosition({ radius, orbit }, Math.PI);
  const quadrature = getNeoOrbitPosition({ radius, orbit }, Math.PI / 2);
  const eccentricAnomaly = solveKeplerEquation(Math.PI / 2, eccentricity);

  nearlyEqual(
    eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly),
    Math.PI / 2,
    1e-9
  );
  const minimumPeriapsis = getNeoMinimumPeriapsisRadius();
  const semiMajorAxis = Math.max(radius, minimumPeriapsis / (1 - eccentricity));
  nearlyEqual(
    Math.hypot(periapsis.x, periapsis.y, periapsis.z),
    semiMajorAxis * (1 - eccentricity)
  );
  nearlyEqual(
    Math.hypot(apoapsis.x, apoapsis.y, apoapsis.z),
    semiMajorAxis * (1 + eccentricity)
  );
  nearlyEqual(quadrature.y / quadrature.z, Math.tan(inclination), 1e-6);
});

test("the software fallback consumes the same orbital profile as WebGL", async () => {
  const source = await readFile(new URL("../src/lib/space-raster.mjs", import.meta.url), "utf8");

  for (const marker of [
    "orbit: neo.orbit",
    "bodyRadius: getDisplayNeoBodyRadius(neo)",
    "centralBodyRadius: EARTH_RADIUS_SCENE * 1.67",
    "function drawOrbit(",
    "getNeoOrbitPosition({ radius, inclination, orbit, bodyRadius, centralBodyRadius }, phase)"
  ]) {
    assert.ok(source.includes(marker), `missing shared fallback orbit marker: ${marker}`);
  }
});

test("NEOs with different orbital elements keep one shared scene-radius mapping", () => {
  const makeNeo = (eccentricity, inclination) => ({
    estimated_diameter: {
      kilometers: { estimated_diameter_min: 1, estimated_diameter_max: 1 }
    },
    close_approach_data: [{
      relative_velocity: { kilometers_per_second: "12" },
      miss_distance: { kilometers: "12000000" }
    }],
    orbital_data: {
      eccentricity: String(eccentricity),
      inclination: String(inclination),
      ascending_node_longitude: "25",
      perihelion_argument: "40",
      mean_anomaly: "10"
    }
  });
  const lowE = getSceneMetrics(makeNeo(0.05, 2), 0);
  const highE = getSceneMetrics(makeNeo(0.82, 42), 1);

  nearlyEqual(lowE.radius, highE.radius);
  assert.ok(highE.minimumPeriapsisRadius >= EARTH_RADIUS_SCENE + highE.bodyRadius + NEO_ORBIT_CLEARANCE_SCENE);
  assert.ok(distance(getNeoOrbitPosition(highE, 0)) >= highE.minimumPeriapsisRadius - 1e-9);
  assert.equal(lowE.orbit.eccentricity, 0.05);
  assert.equal(highE.orbit.eccentricity, 0.82);
  assert.ok(highE.orbit.inclinationRadians > lowE.orbit.inclinationRadians);
});

test("NASA lookup data restores orbital elements omitted by the feed", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return {
          orbital_data: {
            eccentricity: "0.82",
            inclination: "42"
          }
        };
      }
    };
  };

  try {
    const orbitalData = await fetchNeoOrbitData({ id: "987654321" }, "TEST_KEY");
    assert.match(requestedUrl, /\/neo\/987654321\?/);
    assert.match(requestedUrl, /api_key=TEST_KEY/);
    assert.equal(orbitalData.eccentricity, "0.82");
    assert.equal(orbitalData.inclination, "42");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("physical geometry creates an asymmetric, colored polygon surface", async () => {
  const THREE = await import("three");
  const geometry = createAsteroidGeometry(THREE, 1, {
    shape: "angular",
    seed: 433,
    axisRatios: [2, 1, 0.7],
    surfaceRelief: 0.22,
    craterCount: 5,
    craterDepth: 0.14,
    geometryDetail: 2,
    materialColor: 0x665544,
    accentColor: 0xaa8866
  });
  const positions = geometry.attributes.position;
  const xValues = [];
  const yValues = [];
  for (let index = 0; index < positions.count; index += 1) {
    xValues.push(Math.abs(positions.getX(index)));
    yValues.push(Math.abs(positions.getY(index)));
  }
  assert.ok(Math.max(...xValues) > Math.max(...yValues));
  assert.ok(geometry.attributes.color);
  assert.equal(geometry.attributes.color.count, positions.count);
  geometry.dispose();
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

test("the live renderer parks fallback work and lowers GPU quality during interaction", async () => {
  const source = await readFile(new URL("../src/lib/SpaceScene.svelte", import.meta.url), "utf8");
  const rasterSource = await readFile(new URL("../src/lib/space-raster.mjs", import.meta.url), "utf8");

  for (const marker of [
    "let softwareFallbackActive = true",
    "function setSoftwareFallbackActive",
    "class:softwareIdle={!softwareFallbackActive}",
    "if (softwareFallbackActive) {",
    "controls.addEventListener(\"start\"",
    "controls.addEventListener(\"end\"",
    "interactionPixelRatio",
    "renderer.setPixelRatio",
    "renderer.debug.checkShaderErrors = import.meta.env.DEV"
  ]) {
    assert.ok(source.includes(marker), `missing performance marker: ${marker}`);
  }

  assert.match(source, /\.software-canvas\.softwareIdle\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(source, /renderedFrames === 1[\s\S]*?setSoftwareFallbackActive\(false\)/);
  assert.ok(!source.includes("Object.fromEntries"));
  assert.ok(rasterSource.includes("image.data.fill(0)"));
  assert.ok(rasterSource.includes("imageBuffer"));
});

test("the orbital scene exposes asteroid picking and the mission log exposes quick info", async () => {
  const sceneSource = await readFile(new URL("../src/lib/SpaceScene.svelte", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  const geometrySource = await readFile(new URL("../src/lib/asteroid-geometry.mjs", import.meta.url), "utf8");

  for (const marker of ["Raycaster", "pointermove", "pointerup", "neoHover", "neoSelect", "role=\"tooltip\""]) {
    assert.ok(sceneSource.includes(marker), `missing asteroid picking marker: ${marker}`);
  }
  for (const marker of ["missionNeo", "openMissionNeo", "BACK TO MISSION LOG", "SEE MORE", "on:neoSelect"]) {
    assert.ok(pageSource.includes(marker), `missing mission log marker: ${marker}`);
  }
  for (const marker of ["axisRatios", "surfaceRelief", "crater", "vertexColors"]) {
    assert.ok(geometrySource.includes(marker), `missing detailed geometry marker: ${marker}`);
  }
});

test("the catalogue detail preview isolates a stationary, self-spinning asteroid", async () => {
  const pageSource = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  const previewSource = await readFile(new URL("../src/lib/AsteroidPreview.svelte", import.meta.url), "utf8");

  assert.match(pageSource, /<AsteroidPreview\s+neo=\{selectedNeo\}/);
  for (const marker of [
    "position.set(0, 0, 0)",
    "spinAxis",
    "rotateOnAxis",
    "MeshStandardMaterial",
    "vertexColors: true",
    "flatShading: true",
    'aria-label="Rotating asteroid preview"'
  ]) {
    assert.ok(previewSource.includes(marker), `missing asteroid preview marker: ${marker}`);
  }

  assert.ok(!previewSource.includes("getNeoOrbitPosition"));
  assert.ok(!previewSource.includes("createOrbitLine"));
});

test("the catalogue exposes an anchor-date editor", async () => {
  const source = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");

  for (const marker of ["dateReturnView", "openDateEditor(\"catalogue\")", "CHANGE DATE", "UPDATE ORBIT"]) {
    assert.ok(source.includes(marker), `missing catalogue date editor marker: ${marker}`);
  }
});
