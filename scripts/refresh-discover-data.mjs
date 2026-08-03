import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDiscoverDataset,
  mergeDiscoverSources,
  normalizeSbdbProfilePayload
} from "../src/lib/discover.js";
import { PDS_MESH_CATALOG } from "../src/lib/pds-mesh.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(root, "static/data/discover.json");
function createCadUrl(sort) {
  const url = new URL("https://ssd-api.jpl.nasa.gov/cad.api");
  url.search = new URLSearchParams({
    neo: "true",
    body: "Earth",
    "date-min": "now",
    "date-max": "+3650",
    "dist-max": "0.05",
    sort,
    limit: "500",
    diameter: "true",
    fullname: "true"
  });
  return url;
}

const cadClosestUrl = createCadUrl("dist");
const cadFastestUrl = createCadUrl("-v-rel");

const sbdbUrl = new URL("https://ssd-api.jpl.nasa.gov/sbdb_query.api");
sbdbUrl.search = new URLSearchParams({
  "sb-group": "neo",
  "sb-kind": "a",
  fields: "spkid,full_name,pdes,name,neo,pha,H,diameter,diameter_sigma,albedo,rot_per,extent,spec_B,spec_T",
  sort: "-diameter",
  limit: "250",
  "full-prec": "1"
});

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${payload?.message || "request failed"}`);
  }
  return payload;
}

async function fetchMeshSeeds() {
  return Promise.all(PDS_MESH_CATALOG.map(async (mesh) => {
    let profile = null;
    if (mesh.spkId) {
      try {
        const url = new URL("https://ssd-api.jpl.nasa.gov/sbdb.api");
        url.search = new URLSearchParams({
          spk: mesh.spkId,
          "alt-spk": "1",
          "alt-des": "1",
          "phys-par": "1",
          "anc-data": "1"
        });
        profile = normalizeSbdbProfilePayload(await fetchJson(url));
      } catch (error) {
        console.warn(`Could not refresh physical profile for ${mesh.objectName}: ${error.message}`);
      }
    }

    return {
      ...(profile || {}),
      neoWsId: mesh.neoWsId,
      name: profile?.name || mesh.objectName,
      fullName: profile?.fullName || mesh.objectName,
      spkid: profile?.spkid || mesh.spkId,
      aliases: [...(profile?.aliases || []), mesh.objectName, ...(mesh.aliases || [])]
    };
  }));
}

async function main() {
  const [cadPayload, cadFastestPayload, sbdbPayload, meshSeeds] = await Promise.all([
    fetchJson(cadClosestUrl),
    fetchJson(cadFastestUrl),
    fetchJson(sbdbUrl),
    fetchMeshSeeds()
  ]);
  const records = mergeDiscoverSources({
    cadPayload,
    cadPayloads: [cadFastestPayload],
    sbdbPayload,
    seedRecords: meshSeeds
  });
  const dataset = createDiscoverDataset(records, {
    source: "NASA/JPL CAD + SBDB",
    generatedAt: new Date().toISOString(),
    scope: {
      body: "Earth",
      dateMin: "now",
      dateMaxDays: 3650,
      distanceMaxAu: 0.05,
      largestLimit: 250,
      approachQueryLimit: 500,
      approachQueries: ["closest", "fastest"]
    }
  });

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);

  const meshCount = records.filter((record) => record.mesh?.status === "verified").length;
  const approachCount = records.reduce((count, record) => count + record.approaches.length, 0);
  console.log(`Wrote ${records.length} NEO records (${approachCount} approaches, ${meshCount} verified meshes) to ${outputPath}`);
}

main().catch((error) => {
  console.error(`Discover data refresh failed: ${error.message}`);
  process.exitCode = 1;
});
