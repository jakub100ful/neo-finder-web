import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";

import { demoNeos } from "../src/lib/data/demo-neos.js";
import { getSceneMetrics } from "../src/lib/neo.js";
import {
  getMeshAvailability,
  getMeshRecord,
  getNeoMeshIdentifiers,
  getPdsSearchUrl
} from "../src/lib/pds-mesh.js";

test("the PDS manifest resolves both NASA NeoWs and JPL Apophis identifiers", () => {
  const neoWsObject = {
    id: "2099942",
    name: "99942 Apophis (2004 MN4)"
  };
  const jplObject = {
    id: "20099942",
    name: "99942 Apophis"
  };

  assert.equal(getMeshRecord(neoWsObject)?.id, "apophis-v1");
  assert.equal(getMeshRecord(jplObject)?.id, "apophis-v1");
  assert.ok(getNeoMeshIdentifiers(neoWsObject).includes("2099942"));
});

test("unindexed NEOs keep an honest PDS status and searchable URL", () => {
  const neo = { id: "123456", name: "(2099 ZZ1)" };
  const availability = getMeshAvailability(neo);

  assert.equal(availability.available, false);
  assert.equal(availability.status, "not-indexed");
  assert.equal(new URL(getPdsSearchUrl(neo)).searchParams.get("keywords"), "(2099 ZZ1)");
});

test("Apophis scene metrics expose the published mesh record", () => {
  const apophis = demoNeos.find((neo) => neo.name === "99942 APOPHIS");
  const metrics = getSceneMetrics(apophis);

  assert.equal(apophis.id, "2099942");
  assert.equal(metrics.mesh?.assetUrl, "/models/neos/apophis_v233s7.obj");
  assert.equal(metrics.mesh?.units, "km");
});

test("the bundled PDS asset is present and small enough for on-demand loading", async () => {
  const asset = await stat(new URL("../static/models/neos/apophis_v233s7.obj", import.meta.url));

  assert.ok(asset.isFile());
  assert.ok(asset.size > 100000 && asset.size < 300000);
});
