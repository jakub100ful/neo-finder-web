import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LANDMASS_DEFAULTS,
  generateLandmassMap,
  normalizeLandmassConfig,
  resolveLandmassConfig,
  sampleLandmass
} from "../src/lib/landmass.js";

test("landmass configuration clamps slider values and keeps defaults", () => {
  const config = normalizeLandmassConfig({ landCoverage: 4, coastCorrugation: -2 });

  assert.equal(config.seed, LANDMASS_DEFAULTS.seed);
  assert.equal(config.landCoverage, 0.68);
  assert.equal(config.coastCorrugation, 0);
  assert.equal(config.continentalScale, LANDMASS_DEFAULTS.continentalScale);
});

test("landmass maps are deterministic for the same seed and configuration", () => {
  const config = { ...LANDMASS_DEFAULTS, seed: 91 };
  const first = generateLandmassMap(48, 24, config);
  const second = generateLandmassMap(48, 24, config);

  assert.deepEqual(Array.from(first.mask), Array.from(second.mask));
  assert.deepEqual(Array.from(first.values), Array.from(second.values));
  assert.equal(first.threshold, second.threshold);
});

test("land coverage slider controls the generated fraction of land pixels", () => {
  const sparse = generateLandmassMap(64, 32, { landCoverage: 0.22 });
  const dense = generateLandmassMap(64, 32, { landCoverage: 0.58 });

  assert.ok(Math.abs(sparse.landCoverage - 0.22) < 0.03);
  assert.ok(Math.abs(dense.landCoverage - 0.58) < 0.03);
  assert.ok(dense.landCoverage > sparse.landCoverage);
});

test("3D spherical sampling stays continuous across the longitude seam", () => {
  const latitude = 0.37;
  const cosine = Math.cos(latitude);
  const west = sampleLandmass([
    cosine * Math.cos(-Math.PI),
    Math.sin(latitude),
    cosine * Math.sin(-Math.PI)
  ]);
  const east = sampleLandmass([
    cosine * Math.cos(Math.PI),
    Math.sin(latitude),
    cosine * Math.sin(Math.PI)
  ]);

  assert.ok(Math.abs(west - east) < 0.01);
});

test("style presets expose different landmass character without losing slider intent", () => {
  const base = { landCoverage: 0.4, coastCorrugation: 0.2, islandFracture: 0.1 };
  const archipelago = resolveLandmassConfig("archipelago", base);
  const fractured = resolveLandmassConfig("fractured", base);

  assert.equal(archipelago.landCoverage, 0.4);
  assert.ok(archipelago.islandFracture >= 0.68);
  assert.ok(fractured.coastCorrugation >= 0.68);
  assert.ok(fractured.tectonicWarp >= 0.5);
});

test("customisation exposes draft sliders, a live preview, and an explicit save", () => {
  const page = readFileSync(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
  const scene = readFileSync(new URL("../src/lib/SpaceScene.svelte", import.meta.url), "utf8");

  assert.match(page, /UNSAVED PLANET PREVIEW/);
  assert.match(page, /draftLandmassConfig/);
  assert.match(page, /type="range"/);
  assert.match(page, /SAVE EARTH/);
  assert.match(page, /cancelSettings/);
  assert.match(page, /landmassConfig=\{draftLandmassConfig\}/);
  assert.match(scene, /generateLandmassMap/);
  assert.match(scene, /fallbackTexture/);
});
