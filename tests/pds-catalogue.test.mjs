import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPdsCatalogue,
  createPdsCatalogueFromMesh,
  fetchPdsCatalogue,
  filterPdsCatalogueRecords,
  getPdsCatalogueStatusCounts,
  getPdsCatalogueStatusDescription,
  getPdsCatalogueStatusLabel,
  getPdsCatalogueStatusTone,
  getPdsCatalogueNeo,
  getPdsSearchProducts,
  normalizePdsCatalogueRecord,
  parsePdsSearchPayload,
  PDS_CATALOGUE_DATA_URL,
  PDS_CATALOGUE_STATUSES,
  resetPdsCatalogueCache
} from "../src/lib/pds-catalogue.js";
import { getMeshRecord } from "../src/lib/pds-mesh.js";

const shapeSearchPayload = {
  results: [
    {
      lidvid: "urn:nasa:pds:test.apophis:shape::1.0",
      title: "Apophis radar shape model",
      target_name: "99942 Apophis",
      product_class: "Data",
      file_name: "apophis.ply",
      units: "km"
    }
  ]
};

test("PDS Search products normalize into archive records without pretending they are renderable", () => {
  const records = parsePdsSearchPayload(shapeSearchPayload, {
    queryLabel: "shape-model",
    searchUrl: "https://pds.nasa.gov/api/search/1/products?keywords=shape",
    meshCatalog: []
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].pds.status, PDS_CATALOGUE_STATUSES.needsConversion);
  assert.equal(records[0].pds.format, "ply");
  assert.equal(records[0].pds.units, "km");
  assert.equal(records[0].pds.lidvid, "urn:nasa:pds:test.apophis:shape::1.0");
  assert.match(records[0].pds.recordUrl, /test\.apophis/);
  assert.equal(getPdsCatalogueStatusLabel(records[0].pds.status), "NEEDS CONVERSION");
  assert.equal(getPdsCatalogueStatusTone(records[0].pds.status), "convert");
});

test("PDS hierarchy or documentation products remain PDS records until shape evidence is known", () => {
  const records = parsePdsSearchPayload({
    data: [{
      lidvid: "urn:nasa:pds:test.bundle::1.0",
      title: "Small Body Shape Models Bundle",
      product_class: "Bundle"
    }]
  }, { meshCatalog: [] });

  assert.equal(records[0].pds.status, PDS_CATALOGUE_STATUSES.record);
  assert.match(getPdsCatalogueStatusDescription(records[0]), /bundle, collection, document, or data product/);
});

test("nested PDS registry properties and targets preserve logical identity", () => {
  const records = parsePdsSearchPayload({
    data: [{
      id: "urn:nasa:pds:test:geographos::1.0",
      type: "Product_Data",
      title: "Geographos radar shape model",
      targets: [{ name: "(1620) Geographos" }],
      properties: {
        lid: "urn:nasa:pds:test:geographos",
        vid: "1.0",
        "pds:Identification_Area.pds:product_class": "Data",
        description: "Polyhedral shape model"
      }
    }]
  }, { meshCatalog: [] });

  assert.equal(records[0].pds.lidvid, "urn:nasa:pds:test:geographos::1.0");
  assert.equal(records[0].pds.targetName, "(1620) Geographos");
  assert.equal(records[0].neo.name, "(1620) Geographos");
  assert.equal(records[0].pds.status, PDS_CATALOGUE_STATUSES.needsConversion);
});

test("a local PDS mesh upgrades a matching archive candidate to RENDER READY", () => {
  const dataset = createPdsCatalogue([
    {
      id: "apophis-archive-candidate",
      neo: {
        name: "99942 Apophis",
        aliases: ["2004 MN4"],
        isNeo: true,
        is_potentially_hazardous_asteroid: true
      },
      pds: {
        lidvid: "urn:nasa:pds:test.apophis:shape::1.0",
        productName: "Apophis radar shape model",
        format: "ply",
        recordUrl: "https://pds.nasa.gov/test-record"
      }
    }
  ]);

  assert.equal(dataset.records.length, 1);
  const record = dataset.records[0];
  assert.equal(record.pds.status, PDS_CATALOGUE_STATUSES.renderReady);
  assert.equal(record.pds.assetUrl, "/models/neos/apophis_v233s7.obj");
  assert.equal(record.pds.format, "obj");
  assert.equal(record.neo.id, "2099942");
  assert.equal(getMeshRecord(getPdsCatalogueNeo(record))?.id, "apophis-v1");
});

test("status filters keep archive discovery separate from local renderability", () => {
  const records = [
    normalizePdsCatalogueRecord({ id: "record", neo: { name: "Record Target", isNeo: true }, pds: { status: "pds-record", productName: "Archive document" } }, { meshCatalog: [] }),
    normalizePdsCatalogueRecord({ id: "convert", neo: { name: "Convert Target", isNeo: true }, pds: { status: "needs-conversion", productName: "Shape model", format: "ply" } }, { meshCatalog: [] }),
    normalizePdsCatalogueRecord({ id: "unsupported", neo: { name: "Unsupported Target", isNeo: true }, pds: { status: "unsupported", unsupportedReason: "Binary format is not validated" } }, { meshCatalog: [] }),
    normalizePdsCatalogueRecord({ id: "unindexed", neo: { name: "Unindexed Target", isNeo: false }, pds: { status: "not-indexed", productName: "No local application record" } }, { meshCatalog: [] })
  ];

  const counts = getPdsCatalogueStatusCounts(records);
  assert.deepEqual(counts, {
    "render-ready": 0,
    "pds-record": 1,
    "needs-conversion": 1,
    unsupported: 1,
    "not-indexed": 1
  });
  assert.equal(filterPdsCatalogueRecords(records, { status: PDS_CATALOGUE_STATUSES.needsConversion })[0].id, "convert");
  assert.equal(filterPdsCatalogueRecords(records, { query: "unsupported target" })[0].id, "unsupported");
  assert.equal(filterPdsCatalogueRecords(records, { neoOnly: true }).length, 3);
  assert.match(getPdsCatalogueStatusDescription(records[3]), /not proof that no PDS shape model exists/);
});

test("the cached PDS dataset coalesces requests and preserves the verified mesh seed", async () => {
  resetPdsCatalogueCache();
  let calls = 0;
  const payload = {
    schemaVersion: 1,
    generatedAt: "2026-08-02T00:00:00.000Z",
    source: "fixture",
    records: []
  };
  const fetchImpl = async (url) => {
    calls += 1;
    assert.equal(url, PDS_CATALOGUE_DATA_URL);
    return { ok: true, async json() { return payload; } };
  };

  const [left, right] = await Promise.all([
    fetchPdsCatalogue({ fetchImpl, allowCache: false }),
    fetchPdsCatalogue({ fetchImpl, allowCache: false })
  ]);
  assert.equal(calls, 1);
  assert.equal(left.records[0].pds.status, PDS_CATALOGUE_STATUSES.renderReady);
  assert.equal(right.records[0].neo.name, "(99942) Apophis");
  resetPdsCatalogueCache();
});

test("the checked-in PDS catalogue is timestamped and links the Apophis record and download", async () => {
  const raw = await readFile(new URL("../static/data/pds-catalogue.json", import.meta.url), "utf8");
  const dataset = JSON.parse(raw);
  assert.equal(dataset.schemaVersion, 1);
  assert.ok(dataset.generatedAt);
  assert.ok(dataset.sourceUrls.some((url) => url.includes("pds.nasa.gov/api/search")));
  assert.equal(dataset.records.length, 2);
  assert.equal(dataset.records[0].pds.status, "render-ready");
  assert.match(dataset.records[0].pds.recordUrl, /^https:\/\/pds\.nasa\.gov/);
  assert.match(dataset.records[0].pds.downloadUrl, /^https:\/\//);
  const candidate = dataset.records.find((record) => record.neo.name.includes("Geographos"));
  assert.equal(candidate?.pds.status, "needs-conversion");
  assert.match(candidate?.pds.recordUrl || "", /EAR-A-5-DDR-RADARSHAPE-MODELS/);
  assert.equal(createPdsCatalogueFromMesh().records[0].neo.name, "(99942) Apophis");
  assert.deepEqual(getPdsSearchProducts(shapeSearchPayload), shapeSearchPayload.results);
});
