import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PDS_MESH_CATALOG, PDS_SEARCH_API_URL } from "../src/lib/pds-mesh.js";
import { SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE } from "../src/lib/radar-shape-models.js";
import {
  createPdsCatalogue,
  getPdsCatalogueStatusCounts,
  getPdsSearchProducts,
  normalizePdsSearchProduct,
  PDS_CATALOGUE_QUERY_SCOPE
} from "../src/lib/pds-catalogue.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(root, "static/data/pds-catalogue.json");
const SEARCH_LIMIT = 100;
const MAX_SEARCH_PAGES = 2;
const MAX_HIERARCHY_PRODUCTS = 12;
const RADAR_ARCHIVE_URL = "https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=EAR-A-5-DDR-RADARSHAPE-MODELS-V2.0";
const seedOnly = process.argv.includes("--seed-only");

const queryConfigs = [
  { label: "asteroid-shape-model", keywords: "asteroid shape model" },
  { label: "radar-shape-model", keywords: "radar shape model" },
  { label: "small-body-shape-model", keywords: "small body shape model" },
  ...PDS_MESH_CATALOG.map((mesh) => ({
    label: `target-keyword-${mesh.spkId || mesh.objectName}`,
    keywords: mesh.objectName
  }))
];

function pickValue(object, paths = []) {
  for (const path of paths) {
    const value = Object.prototype.hasOwnProperty.call(object || {}, path)
      ? object[path]
      : path.split(".").reduce((current, key) => current?.[key], object);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

async function fetchJson(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${payload?.message || "request failed"}`);
  }
  return payload;
}

function buildSearchUrl(config, searchAfter = "") {
  const url = new URL(PDS_SEARCH_API_URL);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("sort", "ops:Harvest_Info.ops:harvest_date_time");
  if (config.keywords) url.searchParams.set("keywords", config.keywords);
  if (config.q) url.searchParams.set("q", config.q);
  if (searchAfter) url.searchParams.set("search-after", searchAfter);
  return url;
}

function getHarvestValue(product) {
  return pickValue(product, [
    "ops:Harvest_Info.ops:harvest_date_time",
    "harvest_date_time",
    "harvestDateTime",
    "ops.harvest_date_time"
  ]);
}

async function searchProducts(config, fetchImpl) {
  const products = [];
  const sourceUrls = [];
  let searchAfter = "";

  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const url = buildSearchUrl(config, searchAfter);
    sourceUrls.push(String(url));
    const payload = await fetchJson(url, fetchImpl);
    const pageProducts = getPdsSearchProducts(payload);
    products.push(...pageProducts);
    if (pageProducts.length < SEARCH_LIMIT) break;

    const nextSearchAfter = String(getHarvestValue(pageProducts[pageProducts.length - 1]) || "");
    if (!nextSearchAfter || nextSearchAfter === searchAfter) break;
    searchAfter = nextSearchAfter;
  }

  return { products, sourceUrls };
}

function firstHierarchyProduct(payload) {
  return getPdsSearchProducts(payload)[0] || null;
}

function productDisplayName(product) {
  return String(pickValue(product, [
    "title",
    "name",
    "product_name",
    "lidvid",
    "lid"
  ]) || "").trim();
}

async function crawlHierarchy(lidvid, fetchImpl) {
  if (!lidvid) return {};
  const encoded = encodeURIComponent(lidvid);
  const [collectionPayload, bundlePayload] = await Promise.all([
    fetchJson(`${PDS_SEARCH_API_URL}/${encoded}/member-of`, fetchImpl).catch(() => null),
    fetchJson(`${PDS_SEARCH_API_URL}/${encoded}/member-of/member-of`, fetchImpl).catch(() => null)
  ]);
  const collection = firstHierarchyProduct(collectionPayload);
  const bundle = firstHierarchyProduct(bundlePayload);
  return {
    collectionName: productDisplayName(collection),
    bundleName: productDisplayName(bundle),
    hierarchyChecked: true
  };
}

async function collectRecords(fetchImpl) {
  const records = [];
  const sourceUrls = [PDS_SEARCH_API_URL, RADAR_ARCHIVE_URL, SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE.archiveUrl, SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE.bundleUrl];
  let successfulQueries = 0;

  if (seedOnly) return { records, sourceUrls };

  for (const query of queryConfigs) {
    try {
      const result = await searchProducts(query, fetchImpl);
      successfulQueries += 1;
      sourceUrls.push(...result.sourceUrls);
      for (const product of result.products.slice(0, MAX_HIERARCHY_PRODUCTS)) {
        const initial = normalizePdsSearchProduct(product, {
          queryLabel: query.label,
          searchUrl: result.sourceUrls[0],
          source: "NASA PDS Search API"
        });
        const hierarchy = await crawlHierarchy(initial.pds.lidvid, fetchImpl);
        records.push(normalizePdsSearchProduct(product, {
          queryLabel: query.label,
          searchUrl: result.sourceUrls[0],
          source: "NASA PDS Search API",
          ...hierarchy
        }));
      }
    } catch (error) {
      console.warn(`PDS query ${query.label} failed: ${error.message}`);
    }
  }

  if (!successfulQueries) throw new Error("All PDS Search queries failed; the previous catalogue was preserved.");
  return { records, sourceUrls };
}

async function writeCatalogue(dataset) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

async function main() {
  const { records, sourceUrls } = await collectRecords();
  const dataset = createPdsCatalogue(records, {
    source: "NASA PDS Search API + bundled Small Body Radar manifest // cached build-time catalogue",
    generatedAt: new Date().toISOString(),
      queryScope: {
        ...PDS_CATALOGUE_QUERY_SCOPE,
      exactTargets: [...new Set(PDS_MESH_CATALOG.map((mesh) => mesh.objectName))],
      queryCount: queryConfigs.length,
      maxSearchPages: MAX_SEARCH_PAGES,
      hierarchyCrawl: !seedOnly,
      buildMode: seedOnly ? "seed-only" : "search-plus-seed",
      seedBundle: SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE.lidvid
    },
    sourceUrls
  });
  await writeCatalogue(dataset);
  const counts = getPdsCatalogueStatusCounts(dataset.records);
  console.log(`Wrote ${dataset.records.length} PDS records (${counts["render-ready"]} render-ready, ${counts["needs-conversion"]} needs conversion, ${counts.unsupported} unsupported) to ${outputPath}`);
}

main().catch((error) => {
  console.error(`PDS catalogue refresh failed: ${error.message}`);
  process.exitCode = 1;
});
