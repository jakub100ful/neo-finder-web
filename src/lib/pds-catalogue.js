import {
  getMeshRecord,
  PDS_MESH_CATALOG,
  PDS_SEARCH_API_URL
} from "./pds-mesh.js";
import {
  getDiscoverAliases,
  getDiscoverCanonicalKey,
  toNeoObject
} from "./discover.js";

export const PDS_CATALOGUE_SCHEMA_VERSION = 1;
export const PDS_CATALOGUE_DATA_URL = "/data/pds-catalogue.json";
export const PDS_CATALOGUE_CACHE_KEY = "neo-finder:pds-catalogue";
export const PDS_CATALOGUE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PDS_CATALOGUE_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const PDS_CATALOGUE_STATUSES = Object.freeze({
  all: "all",
  record: "pds-record",
  renderReady: "render-ready",
  needsConversion: "needs-conversion",
  unsupported: "unsupported",
  notIndexed: "not-indexed"
});

export const PDS_CATALOGUE_STATUS_LABELS = Object.freeze({
  [PDS_CATALOGUE_STATUSES.record]: "PDS RECORD",
  [PDS_CATALOGUE_STATUSES.renderReady]: "RENDER READY",
  [PDS_CATALOGUE_STATUSES.needsConversion]: "NEEDS CONVERSION",
  [PDS_CATALOGUE_STATUSES.unsupported]: "UNSUPPORTED",
  [PDS_CATALOGUE_STATUSES.notIndexed]: "NOT INDEXED"
});

export const PDS_CATALOGUE_STATUS_ORDER = [
  PDS_CATALOGUE_STATUSES.renderReady,
  PDS_CATALOGUE_STATUSES.record,
  PDS_CATALOGUE_STATUSES.needsConversion,
  PDS_CATALOGUE_STATUSES.unsupported,
  PDS_CATALOGUE_STATUSES.notIndexed
];

export const PDS_CATALOGUE_QUERY_SCOPE = Object.freeze({
  keywords: ["asteroid shape model", "radar shape model", "small body shape model"],
  exactTargets: [...new Set(PDS_MESH_CATALOG.map((record) => record.objectName))],
  hierarchy: ["members", "member-of", "member-of/member-of"],
  pagination: "search-after"
});

let memoryDataset = null;
let memoryRequest = null;

function clean(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getPath(object, path) {
  if (!object || typeof object !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(object, path)) return object[path];
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function pickValue(object, paths = []) {
  for (const path of paths) {
    const value = getPath(object, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function pickFromSources(sources = [], paths = []) {
  for (const source of sources) {
    const value = pickValue(source, paths);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function targetNames(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((target) => {
    if (typeof target === "string") return [target];
    if (!target || typeof target !== "object") return [];
    return [target.name, target.target_name, target.title, target.id, target.lid].filter(Boolean);
  }).map(clean).filter(Boolean);
}

function normalizeFormat(value) {
  const raw = clean(value).split(/[\\/]/).pop() || "";
  const extension = raw.match(/\.([A-Za-z0-9]+)$/)?.[1] || raw;
  return extension
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/^\./, "")
    .replace(/\s+/g, "-");
}

function getFileName(value) {
  const raw = clean(value);
  if (!raw) return "";
  return raw.split(/[\\/]/).pop() || raw;
}

function buildPdsRecordUrl(lidvid) {
  const identifier = clean(lidvid);
  return identifier
    ? `${PDS_SEARCH_API_URL}/${encodeURIComponent(identifier)}`
    : PDS_SEARCH_API_URL;
}

function getRecordAliases(record = {}) {
  const pds = record.pds || record;
  const neo = record.neo || record.target || record.object || {};
  return getDiscoverAliases({
    ...record,
    ...neo,
    aliases: [
      ...(Array.isArray(record.aliases) ? record.aliases : []),
      ...(Array.isArray(neo.aliases) ? neo.aliases : []),
      pds.targetName,
      pds.target_name,
      pds.objectName,
      pds.object_name
    ].filter(Boolean)
  });
}

function aliasesOverlap(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((alias) => rightSet.has(alias));
}

function normalizePdsStatus(value, pds = {}) {
  const status = clean(value).toLowerCase().replace(/[_\s]+/g, "-");
  if (status === "verified" || status === "available" || status === "renderable" || status === "render-ready") {
    return PDS_CATALOGUE_STATUSES.renderReady;
  }
  if (status === "candidate" || status === "conversion-needed" || status === "needs-conversion") {
    return PDS_CATALOGUE_STATUSES.needsConversion;
  }
  if (status === "unsupported") return PDS_CATALOGUE_STATUSES.unsupported;
  if (status === "not-found" || status === "not-indexed") return PDS_CATALOGUE_STATUSES.notIndexed;
  if (status === "record" || status === "pds-record") return PDS_CATALOGUE_STATUSES.record;

  if (pds.assetUrl) return PDS_CATALOGUE_STATUSES.renderReady;
  if (/bundle|collection|document|context/i.test(pds.productType || "") && !pds.geometryFile && !pds.format) {
    return PDS_CATALOGUE_STATUSES.record;
  }
  if (pds.unsupportedReason || pds.unsupported === true) return PDS_CATALOGUE_STATUSES.unsupported;
  if (pds.conversionRequired || pds.isShapeRelated || pds.geometryFile) {
    return PDS_CATALOGUE_STATUSES.needsConversion;
  }
  return PDS_CATALOGUE_STATUSES.record;
}

function shapeRelatedText(pds = {}) {
  return [
    pds.bundleName,
    pds.collectionName,
    pds.productName,
    pds.productType,
    pds.geometryFile,
    pds.format,
    pds.description
  ].filter(Boolean).join(" ");
}

function isShapeRelated(pds = {}) {
  if (typeof pds.isShapeRelated === "boolean") return pds.isShapeRelated;
  return /shape|mesh|geometry|radar|facet|vertex|vertices|obj|ply|stl|glb|gltf/i.test(shapeRelatedText(pds));
}

function normalizeNeoSummary(source = {}, pds = {}) {
  const id = clean(firstDefined(
    source.neoWsId,
    source.neo_reference_id,
    source.jplSpkId,
    source.spkid,
    source.spkId,
    source.id
  ));
  const spkid = clean(firstDefined(source.jplSpkId, source.spkid, source.spkId));
  const pdes = clean(firstDefined(source.pdes, source.designation));
  const targetName = clean(firstDefined(
    source.name,
    source.full_name,
    source.fullName,
    pds.targetName,
    pds.target_name,
    pds.objectName,
    id,
    spkid,
    pdes
  ));
  const isPha = firstDefined(source.isPha, source.is_pha, source.is_potentially_hazardous_asteroid, source.pha);
  const isNeo = firstDefined(source.isNeo, source.is_neo, source.neo);
  const orbitalData = source.orbital_data || source.orbitalData || null;
  const physical = { ...(source.physical || {}) };
  if (physical.H === undefined) physical.H = firstDefined(source.absolute_magnitude_h, source.absoluteMagnitude, source.H);
  if (physical.diameterKm === undefined) physical.diameterKm = firstDefined(source.diameterKm, source.diameter);

  return {
    id,
    neoWsId: clean(source.neoWsId),
    neo_reference_id: clean(firstDefined(source.neo_reference_id, id, spkid, pdes)),
    jplSpkId: spkid,
    spkid,
    pdes,
    name: targetName || "Unresolved PDS target",
    full_name: clean(firstDefined(source.full_name, source.fullName, targetName)),
    aliases: [...new Set([...(Array.isArray(source.aliases) ? source.aliases : []), id, spkid, pdes, targetName].filter(Boolean))],
    is_potentially_hazardous_asteroid: isPha === true || isPha === "Y" ? true : isPha === false || isPha === "N" ? false : null,
    isNeo: isNeo === false || isNeo === "N" ? false : isNeo === true || isNeo === "Y" ? true : null,
    absolute_magnitude_h: physical.H ?? undefined,
    orbital_data: orbitalData || {},
    nasa_jpl_url: clean(firstDefined(
      source.nasa_jpl_url,
      source.nasaJplUrl,
      spkid || pdes || targetName
        ? `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(spkid || pdes || targetName)}`
        : ""
    )),
    physical,
    orbitClass: clean(firstDefined(source.orbitClass, physical.orbitClass))
  };
}

function normalizePdsDetails(raw = {}) {
  const lidvid = clean(firstDefined(raw.lidvid, raw.lidVid, raw.pdsLidvid, raw.pds_lidvid, raw.pdsBundle));
  const lid = clean(firstDefined(raw.lid, raw.pdsLid, lidvid ? lidvid.split("::")[0] : ""));
  const assetUrl = clean(firstDefined(raw.assetUrl, raw.asset_url));
  const geometryFile = getFileName(firstDefined(
    raw.geometryFile,
    raw.geometryFilename,
    raw.filename,
    raw.fileName,
    assetUrl
  ));
  const format = normalizeFormat(firstDefined(raw.format, raw.fileFormat, raw.file_format, geometryFile));
  const pds = {
    status: normalizePdsStatus(firstDefined(raw.status, raw.provenanceStatus), raw),
    lid,
    lidvid,
    bundleName: clean(firstDefined(raw.bundleName, raw.bundle_name)),
    collectionName: clean(firstDefined(raw.collectionName, raw.collection_name)),
    productName: clean(firstDefined(raw.productName, raw.product_name, raw.title)),
    productType: clean(firstDefined(raw.productType, raw.product_type, raw.modelType, raw.type)),
    variant: clean(firstDefined(raw.variant, raw.modelVariant, raw.model_variant)),
    frameConvention: clean(firstDefined(raw.frameConvention, raw.frame_convention)),
    targetName: clean(firstDefined(raw.targetName, raw.target_name, raw.objectName, raw.object_name)),
    format,
    sourceFormat: clean(firstDefined(raw.sourceFormat, raw.source_format, raw.archiveFormat, raw.archive_format)),
    units: clean(firstDefined(raw.units, raw.unit)),
    geometryFile,
    archiveFilename: getFileName(firstDefined(raw.archiveFilename, raw.archive_filename, raw.sourceFilename, raw.source_filename)),
    vertexCount: numberOrNull(firstDefined(raw.vertexCount, raw.vertices, raw.vertex_count)),
    facetCount: numberOrNull(firstDefined(raw.facetCount, raw.facets, raw.facet_count)),
    recordUrl: clean(firstDefined(raw.recordUrl, raw.record_url, raw.pdsRecordUrl, raw.sourceUrl)) || buildPdsRecordUrl(lidvid || lid),
    downloadUrl: clean(firstDefined(raw.downloadUrl, raw.download_url, raw.sourceDownloadUrl)),
    pdsBundleUrl: clean(firstDefined(raw.pdsBundleUrl, raw.pds_bundle_url, raw.bundleUrl)),
    assetUrl,
    meshRecordId: clean(firstDefined(raw.meshRecordId, raw.mesh_record_id)),
    doi: clean(raw.doi),
    source: clean(firstDefined(raw.source, raw.provenance)),
    provenance: clean(firstDefined(raw.provenance, raw.source)),
    description: clean(raw.description),
    unsupportedReason: clean(firstDefined(raw.unsupportedReason, raw.unsupported_reason)),
    conversionRequired: Boolean(raw.conversionRequired || raw.conversion_required),
    isShapeRelated: typeof raw.isShapeRelated === "boolean" ? raw.isShapeRelated : isShapeRelated(raw),
    searchUrl: clean(raw.searchUrl)
  };
  pds.status = normalizePdsStatus(firstDefined(raw.status, raw.provenanceStatus), pds);
  return pds;
}

function meshToPdsDetails(mesh) {
  const geometryFile = getFileName(mesh.assetUrl);
  return {
    status: PDS_CATALOGUE_STATUSES.renderReady,
    lid: clean(mesh.pdsBundle).split("::")[0],
    lidvid: clean(mesh.pdsBundle),
    bundleName: clean(mesh.bundleName || mesh.objectName),
    collectionName: clean(mesh.collectionName || "Small Bodies Node // Shape Models"),
    productName: clean(mesh.productName || mesh.modelType),
    productType: mesh.modelType,
    variant: clean(mesh.variant),
    frameConvention: clean(mesh.frameConvention),
    targetName: mesh.objectName,
    format: normalizeFormat(mesh.format || geometryFile),
    sourceFormat: clean(mesh.sourceFormat || mesh.archiveFormat),
    units: clean(mesh.units),
    geometryFile,
    archiveFilename: getFileName(mesh.archiveFilename),
    vertexCount: numberOrNull(mesh.vertexCount),
    facetCount: numberOrNull(mesh.facetCount),
    recordUrl: mesh.pdsRecordUrl,
    downloadUrl: mesh.downloadUrl,
    pdsBundleUrl: mesh.pdsBundleUrl,
    assetUrl: mesh.assetUrl,
    meshRecordId: mesh.id,
    doi: mesh.doi,
    source: mesh.source,
    provenance: "Validated local renderer asset",
    isShapeRelated: true,
    searchUrl: ""
  };
}

function mergeNeo(left = {}, right = {}) {
  return normalizeNeoSummary({
    ...left,
    ...right,
    aliases: [...(left.aliases || []), ...(right.aliases || [])],
    id: firstDefined(right.id, left.id),
    neoWsId: firstDefined(right.neoWsId, left.neoWsId),
    neo_reference_id: firstDefined(right.neo_reference_id, left.neo_reference_id),
    jplSpkId: firstDefined(right.jplSpkId, left.jplSpkId),
    spkid: firstDefined(right.spkid, left.spkid),
    pdes: firstDefined(right.pdes, left.pdes),
    name: firstDefined(right.name, left.name),
    full_name: firstDefined(right.full_name, left.full_name),
    isPha: firstDefined(right.isPha, right.is_potentially_hazardous_asteroid, left.isPha, left.is_potentially_hazardous_asteroid),
    isNeo: firstDefined(right.isNeo, right.neo, left.isNeo, left.neo),
    orbital_data: { ...(left.orbital_data || {}), ...(left.orbitalData || {}), ...(right.orbital_data || {}), ...(right.orbitalData || {}) },
    physical: { ...(left.physical || {}), ...(right.physical || {}) },
    orbitClass: firstDefined(right.orbitClass, left.orbitClass),
    nasa_jpl_url: firstDefined(right.nasa_jpl_url, left.nasa_jpl_url),
    absolute_magnitude_h: firstDefined(right.absolute_magnitude_h, left.absolute_magnitude_h)
  });
}

function findMatchingNeo(record, neoRecords = []) {
  const aliases = getRecordAliases(record);
  return neoRecords.find((neo) => aliasesOverlap(aliases, getRecordAliases(neo))) || null;
}

function findMatchingMesh(record, meshCatalog = PDS_MESH_CATALOG) {
  const pds = record.pds || record;
  const preferredId = clean(firstDefined(pds.meshRecordId, record.meshRecordId));
  if (preferredId) {
    const preferred = meshCatalog.find((mesh) => mesh.id === preferredId);
    if (preferred) return preferred;
  }

  const productIdentity = clean(firstDefined(pds.lidvid, pds.lid, record.pdsBundle));
  if (productIdentity) {
    const exact = meshCatalog.find((mesh) =>
      mesh.pdsBundle === productIdentity || mesh.pdsBundle?.split("::")[0] === productIdentity
    );
    if (exact) return exact;
  }

  const aliases = getRecordAliases(record);
  return meshCatalog.find((mesh) => aliasesOverlap(aliases, getRecordAliases({ ...mesh, aliases: [mesh.objectName, ...(mesh.aliases || [])] }))) || null;
}

function applyMeshRecord(record, mesh) {
  const meshPds = meshToPdsDetails(mesh);
  const neo = mergeNeo(record.neo, normalizeNeoSummary(mesh, meshPds));
  return {
    ...record,
    canonicalId: record.canonicalId || getDiscoverCanonicalKey(neo),
    aliases: [...new Set([...(record.aliases || []), ...getRecordAliases({ neo, pds: meshPds })])],
    neo,
    pds: { ...record.pds, ...meshPds, status: PDS_CATALOGUE_STATUSES.renderReady }
  };
}

export function normalizePdsCatalogueRecord(raw = {}, { neoRecords = [], meshCatalog = PDS_MESH_CATALOG } = {}) {
  const pdsSource = raw.pds && typeof raw.pds === "object" ? raw.pds : raw;
  const matchedNeo = findMatchingNeo(raw, neoRecords);
  const pds = normalizePdsDetails(pdsSource);
  const neo = normalizeNeoSummary(matchedNeo?.neo || matchedNeo || raw.neo || raw.target || raw.object || raw, pds);
  const aliases = getRecordAliases({ ...raw, neo, pds });
  const canonicalId = clean(raw.canonicalId) || getDiscoverCanonicalKey({ ...neo, aliases });
  const productIdentity = pds.lidvid || pds.lid || clean(raw.productId || raw.id);
  const id = clean(raw.id) || `${canonicalId}:${productIdentity || aliases[0] || "unknown"}`;
  const record = {
    id,
    canonicalId,
    aliases,
    neo,
    pds
  };
  const mesh = findMatchingMesh(record, meshCatalog);
  return mesh ? applyMeshRecord(record, mesh) : record;
}

function mergeCatalogueRecords(left, right) {
  const pds = { ...left.pds, ...right.pds };
  const neo = mergeNeo(left.neo, right.neo);
  const aliases = [...new Set([...(left.aliases || []), ...(right.aliases || []), ...getRecordAliases({ neo, pds })])];
  const merged = {
    ...left,
    ...right,
    id: left.id || right.id,
    canonicalId: left.canonicalId || right.canonicalId || getDiscoverCanonicalKey(neo),
    aliases,
    neo,
    pds
  };
  if (left.pds?.status === PDS_CATALOGUE_STATUSES.renderReady || right.pds?.status === PDS_CATALOGUE_STATUSES.renderReady) {
    merged.pds.status = PDS_CATALOGUE_STATUSES.renderReady;
  }
  return merged;
}

function productKey(record) {
  return record.pds?.lidvid || record.pds?.lid || record.id || `${record.canonicalId}:unknown`;
}

export function createPdsCatalogue(records = [], metadata = {}, { neoRecords = [], meshCatalog = PDS_MESH_CATALOG } = {}) {
  const byProduct = new Map();
  for (const raw of records) {
    const normalized = normalizePdsCatalogueRecord(raw, { neoRecords, meshCatalog });
    const key = productKey(normalized);
    byProduct.set(key, byProduct.has(key) ? mergeCatalogueRecords(byProduct.get(key), normalized) : normalized);
  }

  for (const mesh of meshCatalog) {
    const candidate = [...byProduct.values()].find((record) => {
      if (record.pds?.status === PDS_CATALOGUE_STATUSES.renderReady) return false;
      const productMatch = record.pds?.lidvid === mesh.pdsBundle || record.pds?.meshRecordId === mesh.id;
      return productMatch || aliasesOverlap(
        getRecordAliases(record),
        getRecordAliases({ ...mesh, aliases: [mesh.objectName, ...(mesh.aliases || [])] })
      );
    });
    if (candidate) {
      const patched = applyMeshRecord(candidate, mesh);
      byProduct.set(productKey(candidate), patched);
    } else {
      const seeded = normalizePdsCatalogueRecord(mesh, { neoRecords, meshCatalog });
      byProduct.set(productKey(seeded), seeded);
    }
  }

  const sortedRecords = [...byProduct.values()].sort((left, right) => {
    const statusDifference = PDS_CATALOGUE_STATUS_ORDER.indexOf(left.pds.status) - PDS_CATALOGUE_STATUS_ORDER.indexOf(right.pds.status);
    return statusDifference || String(left.neo?.name || left.pds?.productName).localeCompare(String(right.neo?.name || right.pds?.productName));
  });

  return {
    schemaVersion: PDS_CATALOGUE_SCHEMA_VERSION,
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    source: metadata.source || "NASA PDS Search API",
    queryScope: metadata.queryScope || PDS_CATALOGUE_QUERY_SCOPE,
    sourceUrls: [...new Set([...(metadata.sourceUrls || []), PDS_SEARCH_API_URL])],
    records: sortedRecords
  };
}

export function createPdsCatalogueFromMesh(metadata = {}, options = {}) {
  return createPdsCatalogue([], metadata, options);
}

export function getPdsSearchProducts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.hits?.hits)) return payload.hits.hits.map((hit) => hit?._source || hit);
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  return [];
}

export function normalizePdsSearchProduct(product = {}, context = {}) {
  const source = product?._source || product;
  const properties = source.properties || {};
  const metadata = source.metadata || {};
  const lid = clean(pickFromSources([source, properties], [
    "lid",
    "logical_identifier",
    "pds:Identification_Area.pds:logical_identifier"
  ]));
  const version = clean(pickFromSources([source, properties], [
    "vid",
    "version_id",
    "pds:Identification_Area.pds:version_id"
  ]));
  const lidvid = clean(pickValue(source, ["lidvid", "lidVid", "id", "_id"])) || (lid && version ? `${lid}::${version}` : lid);
  const title = clean(pickFromSources([source, properties], ["title", "name", "product_name", "pds:Identification_Area.pds:title"]));
  const targetName = clean(pickFromSources([source, properties], ["target_name", "targetName", "ref_lid_target", "pds:Target_Identification.pds:name"])) || targetNames(source.targets || properties.targets)[0] || "";
  const productType = clean(pickFromSources([source, properties], ["product_type", "product_class", "class", "pds:Product_Class", "pds:Identification_Area.pds:product_class"])) || clean(source.type);
  const format = clean(pickFromSources([source, properties], ["format", "file_format", "mime_type", "file_name", "filename"]));
  const units = clean(pickFromSources([source, properties], ["units", "unit", "pds:File_Area_Observational.pds:unit"]));
  const description = clean(pickFromSources([source, properties], ["description", "pds:Service.pds:description", "pds:Service.pds:abstract_desc"]));
  const recordUrl = clean(pickFromSources([source, metadata, properties], ["record_url", "recordUrl", "label_url", "url", "ops:Tracking_Meta.ops:tracking_id"]));
  const downloadUrl = clean(pickFromSources([source, metadata, properties], ["download_url", "downloadUrl", "file_url", "url"]));
  const rawPds = {
    lid,
    lidvid,
    bundleName: context.bundleName || "",
    collectionName: context.collectionName || "",
    productName: title,
    productType,
    targetName,
    format,
    units,
    recordUrl: recordUrl || buildPdsRecordUrl(lidvid || lid),
    downloadUrl,
    source: context.source || "NASA PDS Search API",
    provenance: context.provenance || "Discovered in the NASA PDS registry",
    description,
    searchUrl: context.searchUrl || "",
    isShapeRelated: isShapeRelated({ productName: title, productType, format, geometryFile: format, description })
  };
  return normalizePdsCatalogueRecord({
    id: lidvid || lid || `${context.queryLabel || "pds"}:${title || targetName || "record"}`,
    aliases: [targetName, title].filter(Boolean),
    neo: { name: targetName, aliases: [targetName].filter(Boolean) },
    pds: rawPds
  }, context);
}

export function parsePdsSearchPayload(payload, context = {}) {
  return getPdsSearchProducts(payload).map((product) => normalizePdsSearchProduct(product, context));
}

export function getPdsCatalogueStatusLabel(status) {
  if (status === PDS_CATALOGUE_STATUSES.all) return "ALL PDS RECORDS";
  return PDS_CATALOGUE_STATUS_LABELS[normalizePdsStatus(status)] || "PDS RECORD";
}

export function getPdsCatalogueStatusTone(status) {
  switch (normalizePdsStatus(status)) {
    case PDS_CATALOGUE_STATUSES.renderReady:
      return "ready";
    case PDS_CATALOGUE_STATUSES.needsConversion:
      return "convert";
    case PDS_CATALOGUE_STATUSES.unsupported:
      return "unsupported";
    case PDS_CATALOGUE_STATUSES.notIndexed:
      return "unindexed";
    default:
      return "record";
  }
}

export function getPdsCatalogueStatusDescription(record = {}) {
  const status = normalizePdsStatus(record.pds?.status, record.pds || {});
  if (status === PDS_CATALOGUE_STATUSES.renderReady) return "Validated local geometry is available in the renderer.";
  if (status === PDS_CATALOGUE_STATUSES.needsConversion) return "The archive record is known; source geometry still needs ingestion or format conversion.";
  if (status === PDS_CATALOGUE_STATUSES.unsupported) return record.pds?.unsupportedReason || "The record is shape-related but is not currently safe to convert.";
  if (status === PDS_CATALOGUE_STATUSES.notIndexed) return "No verified application record is known. This is not proof that no PDS shape model exists.";
  return "An official PDS record was discovered; the record may be a bundle, collection, document, or data product rather than renderable geometry.";
}

function searchableText(record) {
  return [
    record.neo?.name,
    record.neo?.full_name,
    record.neo?.pdes,
    record.neo?.id,
    record.neo?.spkid,
    ...(record.aliases || []),
    record.pds?.bundleName,
    record.pds?.collectionName,
    record.pds?.productName,
    record.pds?.productType,
    record.pds?.lid,
    record.pds?.lidvid
  ].filter(Boolean).join(" ").toLowerCase();
}

export function filterPdsCatalogueRecords(records = [], {
  query = "",
  status = PDS_CATALOGUE_STATUSES.all,
  phaOnly = false,
  neoOnly = false
} = {}) {
  const tokens = clean(query).toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    if (status !== PDS_CATALOGUE_STATUSES.all && normalizePdsStatus(record.pds?.status) !== status) return false;
    if (phaOnly && record.neo?.is_potentially_hazardous_asteroid !== true) return false;
    if (neoOnly && record.neo?.isNeo !== true) return false;
    const haystack = searchableText(record);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function getPdsCatalogueStatusCounts(records = []) {
  return Object.fromEntries(PDS_CATALOGUE_STATUS_ORDER.map((status) => [
    status,
    records.filter((record) => normalizePdsStatus(record.pds?.status) === status).length
  ]));
}

export function getPdsRecordSearchUrl(record = {}) {
  if (record.pds?.searchUrl) return record.pds.searchUrl;
  const keyword = record.neo?.name || record.pds?.targetName || record.pds?.productName || "asteroid shape model";
  const url = new URL(PDS_SEARCH_API_URL);
  url.search = new URLSearchParams({ keywords: keyword, limit: "20" });
  return url.toString();
}

export function getPdsCatalogueNeo(record = {}) {
  if (record.neo?.id || record.neo?.jplSpkId || record.neo?.pdes) {
    return {
      ...record.neo,
      meshRecordId: record.pds?.meshRecordId || record.neo?.meshRecordId || "",
      meshAssetUrl: record.pds?.assetUrl || record.neo?.meshAssetUrl || ""
    };
  }
  return toNeoObject(record);
}

function normalizeCatalogueDataset(value, options = {}) {
  if (!value || !Array.isArray(value.records)) throw new Error("PDS catalogue has an invalid shape.");
  return createPdsCatalogue(value.records, {
    generatedAt: value.generatedAt,
    source: value.source,
    queryScope: value.queryScope,
    sourceUrls: value.sourceUrls
  }, options);
}

function validDataset(value) {
  return Boolean(value && Array.isArray(value.records) && value.records.every((record) => record && typeof record === "object"));
}

function readCachedDataset() {
  if (typeof localStorage === "undefined") return null;
  try {
    const cached = JSON.parse(localStorage.getItem(PDS_CATALOGUE_CACHE_KEY) || "null");
    return validDataset(cached?.data) ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedDataset(data) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PDS_CATALOGUE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Local storage is optional; the checked-in generated file remains the source of truth.
  }
}

export async function fetchPdsCatalogue({
  url = PDS_CATALOGUE_DATA_URL,
  fetchImpl = globalThis.fetch,
  allowCache = true,
  meshCatalog = PDS_MESH_CATALOG,
  neoRecords = []
} = {}) {
  if (memoryDataset) return memoryDataset;
  if (memoryRequest) return memoryRequest;

  const cached = readCachedDataset();
  if (allowCache && cached && Date.now() - Number(cached.savedAt) <= PDS_CATALOGUE_CACHE_TTL_MS) {
    memoryDataset = normalizeCatalogueDataset(cached.data, { meshCatalog, neoRecords });
    return memoryDataset;
  }

  if (typeof fetchImpl !== "function") throw new Error("PDS catalogue fetch is unavailable.");

  memoryRequest = (async () => {
    try {
      const response = await fetchImpl(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`PDS catalogue unavailable (HTTP ${response.status}).`);
      const payload = await response.json();
      const data = normalizeCatalogueDataset(payload, { meshCatalog, neoRecords });
      memoryDataset = data;
      if (allowCache) writeCachedDataset(data);
      return data;
    } catch (error) {
      if (cached?.data && validDataset(cached.data)) {
        memoryDataset = normalizeCatalogueDataset(cached.data, { meshCatalog, neoRecords });
        return memoryDataset;
      }
      throw error;
    }
  })();

  try {
    return await memoryRequest;
  } finally {
    memoryRequest = null;
  }
}

export function resetPdsCatalogueCache() {
  memoryDataset = null;
  memoryRequest = null;
}
