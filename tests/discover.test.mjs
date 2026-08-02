import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { demoNeos } from "../src/lib/data/demo-neos.js";
import {
  createDiscoverDatasetFromNeos,
  DISCOVER_MODES,
  filterDiscoverRecords,
  getDiscoverAliases,
  getRankedDiscoverRecords,
  mergeDiscoverSources,
  parseCadPayload,
  parseSbdbPayload,
  resetDiscoverDatasetCache,
  fetchDiscoverDataset
} from "../src/lib/discover.js";

const cadPayload = {
  fields: [
    "des", "orbit_id", "cd", "dist", "v_rel", "v_inf", "h",
    "diameter", "diameter_sigma", "fullname"
  ],
  data: [[
    "99942", "206", "2029-Apr-13 21:46", "0.000254099", "7.42249",
    "5.84135", "19.7", "0.34", "0.04", "99942 Apophis (2004 MN4)"
  ]]
};

const sbdbPayload = {
  fields: ["spkid", "full_name", "pdes", "name", "neo", "pha", "H", "diameter", "diameter_sigma"],
  data: [["20099942", "99942 Apophis (2004 MN4)", "99942", "Apophis", "Y", "Y", "19.09", "0.34", "0.04"]]
};

test("CAD and SBDB columnar payloads normalize into one mesh-backed object", () => {
  const records = mergeDiscoverSources({
    cadPayload,
    sbdbPayload,
    seedRecords: [{ neoWsId: "2099942", spkid: "20099942", aliases: ["99942", "Apophis"] }]
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].spkid, "20099942");
  assert.equal(records[0].physical.diameterKm, 0.34);
  assert.equal(records[0].approaches[0].distanceLd > 0, true);
  assert.equal(records[0].mesh.status, "verified");
  assert.equal(records[0].neo.id, "2099942");
  assert.equal(records[0].neo.jplSpkId, "20099942");
});

test("columnar parsers preserve API fields and convert CAD dates", () => {
  const [cad] = parseCadPayload(cadPayload);
  const [sbdb] = parseSbdbPayload(sbdbPayload);

  assert.equal(cad.approaches[0].date, "2029-04-13");
  assert.equal(cad.approaches[0].relativeVelocityKmS, 7.42249);
  assert.equal(sbdb.pdes, "99942");
  assert.equal(sbdb.isPha, true);
});

test("provisional year designations do not collide with numbered mesh aliases", () => {
  const records = mergeDiscoverSources({
    cadPayload: {
      fields: ["des", "cd", "dist", "v_rel", "fullname"],
      data: [["2004 DF2", "2027-Jan-01", "0.02", "12", "(2004 DF2)"]]
    },
    seedRecords: [{ neoWsId: "2099942", spkid: "20099942", pdes: "99942", aliases: ["99942", "Apophis"] }]
  });

  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.pdes === "99942")?.mesh.status, "verified");
  assert.equal(records.find((record) => record.pdes === "2004 DF2")?.mesh.status, "not-indexed");
});

test("separate closest and fastest CAD query results are unioned before ranking", () => {
  const fastestPayload = {
    fields: ["des", "cd", "dist", "v_rel", "fullname"],
    data: [["374158", "2034-Oct-31", "0.026", "34.9", "374158 (2004 UL)"]]
  };
  const records = mergeDiscoverSources({ cadPayload, cadPayloads: [fastestPayload] });

  assert.equal(records.length, 2);
  assert.ok(records.some((record) => record.name.includes("Apophis")));
  assert.equal(records.find((record) => record.pdes === "374158")?.approaches[0].relativeVelocityKmS, 34.9);
});

test("ranking modes sort closest, fastest, and largest in their correct directions", () => {
  const records = [
    {
      canonicalId: "a",
      name: "Fast Small",
      physical: { diameterKm: 0.2 },
      approaches: [{ distanceAu: 0.01, distanceLd: 3.89, relativeVelocityKmS: 31 }],
      mesh: { status: "not-indexed" },
      isPha: false
    },
    {
      canonicalId: "b",
      name: "Close Large",
      physical: { diameterKm: 2.4 },
      approaches: [{ distanceAu: 0.002, distanceLd: 0.78, relativeVelocityKmS: 8 }],
      mesh: { status: "verified" },
      isPha: true
    },
    {
      canonicalId: "c",
      name: "Biggest",
      physical: { diameterKm: 12 },
      approaches: [],
      mesh: { status: "not-indexed" },
      isPha: false
    }
  ];

  assert.equal(getRankedDiscoverRecords(records, { mode: DISCOVER_MODES.closest })[0].name, "Close Large");
  assert.equal(getRankedDiscoverRecords(records, { mode: DISCOVER_MODES.fastest })[0].name, "Fast Small");
  assert.equal(getRankedDiscoverRecords(records, { mode: DISCOVER_MODES.largest })[0].name, "Biggest");
});

test("approach windows exclude events outside the selected horizon", () => {
  const isoDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const records = [
    {
      canonicalId: "near",
      name: "Near Event",
      physical: {},
      approaches: [{ date: isoDate(7), distanceAu: 0.01, relativeVelocityKmS: 10 }],
      mesh: { status: "not-indexed" }
    },
    {
      canonicalId: "far",
      name: "Far Event",
      physical: {},
      approaches: [{ date: isoDate(120), distanceAu: 0.001, relativeVelocityKmS: 20 }],
      mesh: { status: "not-indexed" }
    }
  ];

  assert.deepEqual(
    getRankedDiscoverRecords(records, { mode: DISCOVER_MODES.closest, approachWindowDays: 30 }).map((record) => record.name),
    ["Near Event"]
  );
});

test("mesh and PHA filters are local and never treat an unindexed object as a mesh hit", () => {
  const records = [
    {
      canonicalId: "mesh",
      name: "Published Shape",
      physical: { diameterKm: 1 },
      approaches: [{ distanceAu: 0.01, relativeVelocityKmS: 10 }],
      mesh: { status: "verified" },
      isPha: true
    },
    {
      canonicalId: "unknown",
      name: "Unknown Shape",
      physical: { diameterKm: 2 },
      approaches: [{ distanceAu: 0.01, relativeVelocityKmS: 10 }],
      mesh: { status: "not-indexed" },
      isPha: true
    }
  ];

  assert.deepEqual(
    filterDiscoverRecords(records, { meshOnly: true }).map((record) => record.name),
    ["Published Shape"]
  );
  assert.deepEqual(
    filterDiscoverRecords(records, { meshOnly: true, phaOnly: true }).map((record) => record.name),
    ["Published Shape"]
  );
});

test("demo fallback preserves the current Apophis PDS experience", () => {
  const dataset = createDiscoverDatasetFromNeos(demoNeos);
  const apophis = dataset.records.find((record) => record.neo.id === "2099942");

  assert.ok(apophis);
  assert.equal(apophis.mesh.status, "verified");
  assert.equal(apophis.mesh.id, "apophis-v1");
  assert.ok(getDiscoverAliases(apophis).includes("2099942"));
});

test("Discover dataset loading coalesces requests and accepts generated JSON", async () => {
  resetDiscoverDatasetCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        return { schemaVersion: 1, generatedAt: "2026-08-02T00:00:00Z", records: [] };
      }
    };
  };

  const [first, second] = await Promise.all([
    fetchDiscoverDataset({ fetchImpl, allowCache: false }),
    fetchDiscoverDataset({ fetchImpl, allowCache: false })
  ]);

  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.deepEqual(first.records, []);
  resetDiscoverDatasetCache();
});

test("the checked-in Discover dataset contains ranked source data and the verified mesh seed", async () => {
  const dataset = JSON.parse(await readFile(new URL("../static/data/discover.json", import.meta.url), "utf8"));
  const meshRecord = dataset.records.find((record) => record.mesh?.status === "verified");

  assert.equal(dataset.schemaVersion, 1);
  assert.ok(dataset.records.length >= 250);
  assert.ok(dataset.records.some((record) => record.approaches.length > 0));
  assert.equal(meshRecord?.neo?.id, "2099942");
  assert.equal(meshRecord?.mesh?.id, "apophis-v1");
});
