import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

import { validateWavefrontCompatibleText } from "../scripts/ingest-small-body-radar-shapes.mjs";
import {
  SMALL_BODY_RADAR_SHAPE_MODELS,
  SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE
} from "../src/lib/radar-shape-models.js";
import { createPdsCatalogueFromMesh, getPdsCatalogueNeo } from "../src/lib/pds-catalogue.js";
import { getMeshRecord } from "../src/lib/pds-mesh.js";

test("the official radar bundle manifest covers nine targets and ten products", () => {
  assert.equal(SMALL_BODY_RADAR_SHAPE_MODELS.length, 10);
  assert.equal(new Set(SMALL_BODY_RADAR_SHAPE_MODELS.map((model) => model.objectName)).size, 9);
  assert.equal(SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE.lidvid, "urn:nasa:pds:compil.ast.radar.shape-models::1.0");
  assert.equal(SMALL_BODY_RADAR_SHAPE_MODELS.filter((model) => model.isNeo).length, 9);
  assert.equal(SMALL_BODY_RADAR_SHAPE_MODELS.filter((model) => model.objectName.includes("Toutatis")).length, 2);
});

test("every bundled radar asset is validated OBJ-compatible geometry", async () => {
  for (const model of SMALL_BODY_RADAR_SHAPE_MODELS) {
    const asset = await stat(new URL(`../static/models/neos/${model.assetFile}`, import.meta.url));
    assert.ok(asset.isFile(), model.id);
    assert.ok(asset.size > 1000, model.id);
    const text = await readFile(new URL(`../static/models/neos/${model.assetFile}`, import.meta.url), "utf8");
    const counts = validateWavefrontCompatibleText(text, model.id);
    assert.deepEqual(counts, { vertexCount: model.vertexCount, facetCount: model.facetCount }, model.id);
  }
});

test("PDS catalogue keeps both Toutatis resolution assets independently addressable", () => {
  const catalogue = createPdsCatalogueFromMesh();
  const records = catalogue.records.filter((record) => record.neo.name.includes("Toutatis"));
  assert.equal(records.length, 2);
  const low = records.find((record) => record.pds.variant === "LOW RESOLUTION");
  const high = records.find((record) => record.pds.variant === "HIGH RESOLUTION");
  assert.equal(getMeshRecord(getPdsCatalogueNeo(low))?.id, "radar-4179-toutatis-low-v1");
  assert.equal(getMeshRecord(getPdsCatalogueNeo(high))?.id, "radar-4179-toutatis-high-v1");
  assert.notEqual(low.pds.assetUrl, high.pds.assetUrl);
  assert.equal(low.pds.sourceFormat, "tab");
  assert.equal(high.pds.format, "obj");
});
