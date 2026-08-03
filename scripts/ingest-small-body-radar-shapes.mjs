import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SMALL_BODY_RADAR_SHAPE_MODELS } from "../src/lib/radar-shape-models.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const checkOnly = process.argv.includes("--check");

function validateWavefrontCompatibleText(text, label) {
  const lines = String(text).split(/\r?\n/);
  let vertexCount = 0;
  let facetCount = 0;
  let seenFacet = false;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (/^v\s/.test(trimmed)) {
      if (seenFacet) throw new Error(`${label}: vertex record after facet record at line ${index + 1}`);
      const values = trimmed.slice(1).trim().split(/\s+/);
      if (values.length !== 3 || values.some((value) => !Number.isFinite(Number(value)))) {
        throw new Error(`${label}: invalid vertex record at line ${index + 1}`);
      }
      vertexCount += 1;
      continue;
    }

    if (/^f\s/.test(trimmed)) {
      const values = trimmed.slice(1).trim().split(/\s+/);
      if (values.length !== 3 || values.some((value) => !/^\d+$/.test(value) || Number(value) < 1)) {
        throw new Error(`${label}: invalid triangular facet record at line ${index + 1}`);
      }
      seenFacet = true;
      facetCount += 1;
      continue;
    }

    throw new Error(`${label}: unsupported record at line ${index + 1}: ${trimmed.slice(0, 40)}`);
  }

  if (!vertexCount || !facetCount) throw new Error(`${label}: no vertices or facets found`);
  return { vertexCount, facetCount };
}

async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function fetchSource(model) {
  const response = await fetch(model.downloadUrl, {
    headers: { accept: "text/plain" },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`${model.downloadUrl} returned HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const results = [];
  for (const model of SMALL_BODY_RADAR_SHAPE_MODELS) {
    const assetPath = resolve(root, "static/models/neos", model.assetFile);
    const sourceText = checkOnly ? await readFile(assetPath, "utf8") : await fetchSource(model);
    const counts = validateWavefrontCompatibleText(sourceText, model.id);
    if (counts.vertexCount !== model.vertexCount || counts.facetCount !== model.facetCount) {
      throw new Error(`${model.id}: expected ${model.vertexCount}/${model.facetCount}, got ${counts.vertexCount}/${counts.facetCount}`);
    }
    if (!checkOnly) await writeAtomic(assetPath, sourceText);
    results.push({ id: model.id, asset: model.assetFile, ...counts });
  }

  console.log(`${checkOnly ? "Validated" : "Ingested"} ${results.length} Small Body Radar shape assets.`);
  for (const result of results) {
    console.log(`${result.id}: ${result.vertexCount} vertices / ${result.facetCount} facets -> ${result.asset}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Small Body Radar ingestion failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export { validateWavefrontCompatibleText };
