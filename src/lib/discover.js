import { getMeshRecord, PDS_MESH_CATALOG } from "./pds-mesh.js";

export const DISCOVER_SCHEMA_VERSION = 1;
export const DISCOVER_DATA_URL = "/data/discover.json";
export const DISCOVER_CACHE_KEY = "neo-finder:discover-data";
export const DISCOVER_CACHE_TTL_MS = 30 * 60 * 1000;
export const AU_KM = 149597870.7;
export const LD_KM = 384400;

export const DISCOVER_MODES = Object.freeze({
  closest: "closest",
  fastest: "fastest",
  largest: "largest"
});

const MONTHS = new Map([
  ["JAN", "01"], ["FEB", "02"], ["MAR", "03"], ["APR", "04"],
  ["MAY", "05"], ["JUN", "06"], ["JUL", "07"], ["AUG", "08"],
  ["SEP", "09"], ["OCT", "10"], ["NOV", "11"], ["DEC", "12"]
]);

let memoryDataset = null;
let memoryRequest = null;

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeDiscoverIdentifier(value) {
  return clean(value)
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[()]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function addAlias(values, value) {
  const raw = clean(value);
  if (!raw) return;
  values.push(raw);
  const parenthetical = raw.match(/\(([^)]+)\)/)?.[1];
  if (parenthetical) values.push(parenthetical);
  const numbered = raw.match(/^\s*(\d{3,})\b/)?.[1];
  const isProvisionalDesignation = /^\s*(?:19|20)\d{2}\s+[A-Z]/i.test(raw);
  if (numbered && !isProvisionalDesignation) values.push(numbered);
}

export function getDiscoverAliases(entry = {}) {
  const values = [];
  [
    entry.canonicalId,
    entry.id,
    entry.neoWsId,
    entry.neo_reference_id,
    entry.spkid,
    entry.spkId,
    entry.jplSpkId,
    entry.pdes,
    entry.designation,
    entry.name,
    entry.full_name,
    entry.fullName,
    entry.fullname,
    ...(Array.isArray(entry.aliases) ? entry.aliases : [])
  ].forEach((value) => addAlias(values, value));
  return [...new Set(values.map(normalizeDiscoverIdentifier).filter(Boolean))];
}

export function getDiscoverCanonicalKey(entry = {}) {
  const spkid = clean(entry.spkid || entry.spkId || entry.jplSpkId);
  if (spkid) return `spk:${normalizeDiscoverIdentifier(spkid)}`;
  const pdes = clean(entry.pdes || entry.designation);
  if (pdes) return `pdes:${normalizeDiscoverIdentifier(pdes)}`;
  return `object:${normalizeDiscoverIdentifier(entry.name || entry.full_name || entry.id || "unknown")}`;
}

export function parseColumnarPayload(payload) {
  const fields = Array.isArray(payload?.fields) ? payload.fields : [];
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => {
    if (!Array.isArray(row)) return row || {};
    return Object.fromEntries(fields.map((field, index) => [field, row[index] ?? null]));
  });
}

function parseCadDate(value) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})(?:\s+(.*))?$/);
  if (!match) return { iso: raw, label: raw };
  const month = MONTHS.get(match[2].toUpperCase());
  const iso = month ? `${match[1]}-${month}-${match[3].padStart(2, "0")}` : raw;
  return { iso, label: raw };
}

function normalizeApproach(row = {}) {
  const date = parseCadDate(row.cd || row.close_approach_date || row.date);
  const distanceAu = numberOrNull(row.dist ?? row.distanceAu);
  const distanceKm = numberOrNull(row.distanceKm) ?? (distanceAu === null ? null : distanceAu * AU_KM);
  const distanceLd = numberOrNull(row.distanceLd) ?? (distanceKm === null ? null : distanceKm / LD_KM);
  return {
    body: clean(row.body || row.orbiting_body || "Earth") || "Earth",
    date: date.iso,
    dateLabel: date.label,
    distanceAu,
    distanceKm,
    distanceLd,
    relativeVelocityKmS: numberOrNull(row.v_rel ?? row.relativeVelocityKmS),
    vInfinityKmS: numberOrNull(row.v_inf ?? row.vInfinityKmS),
    orbitId: clean(row.orbit_id || row.orbitId),
    designation: clean(row.des || row.designation)
  };
}

export function normalizeCadRow(row = {}) {
  const designation = clean(row.des || row.pdes);
  const fullName = clean(row.fullname || row.full_name || row.name);
  const approach = normalizeApproach(row);
  return {
    source: "JPL CAD",
    aliases: [designation, fullName].filter(Boolean),
    pdes: designation,
    name: fullName || designation || "Unnamed NEO",
    fullName,
    isNeo: true,
    isPha: row.pha === true || row.pha === "Y" ? true : row.pha === false || row.pha === "N" ? false : null,
    physical: {
      H: numberOrNull(row.h ?? row.H),
      diameterKm: numberOrNull(row.diameter ?? row.diameterKm),
      diameterSigmaKm: numberOrNull(row.diameter_sigma ?? row.diameterSigmaKm)
    },
    approaches: approach.date || approach.distanceAu !== null ? [approach] : []
  };
}

export function parseCadPayload(payload) {
  return parseColumnarPayload(payload).map(normalizeCadRow);
}

export function normalizeSbdbRow(row = {}) {
  const spkid = clean(row.spkid || row.spkId);
  const pdes = clean(row.pdes || row.des);
  const fullName = clean(row.full_name || row.fullName || row.fullname);
  const name = clean(row.name || fullName || pdes);
  return {
    source: "JPL SBDB",
    aliases: [spkid, pdes, fullName, name].filter(Boolean),
    spkid,
    pdes,
    name: name || "Unnamed NEO",
    fullName,
    isNeo: row.neo === true || row.neo === "Y" || row.neo === undefined,
    isPha: row.pha === true || row.pha === "Y" ? true : row.pha === false || row.pha === "N" ? false : null,
    physical: {
      H: numberOrNull(row.H ?? row.h),
      diameterKm: numberOrNull(row.diameter),
      diameterSigmaKm: numberOrNull(row.diameter_sigma ?? row.diameterSigmaKm),
      albedo: numberOrNull(row.albedo),
      rotationPeriodHours: numberOrNull(row.rot_per),
      extent: clean(row.extent),
      spectralClass: clean(row.spec_B || row.spec_T).toUpperCase()
    },
    orbitalData: row.orbitalData || null,
    orbitClass: clean(row.class || row.orbitClass),
    approaches: []
  };
}

export function parseSbdbPayload(payload) {
  return parseColumnarPayload(payload).map(normalizeSbdbRow);
}

export function normalizeSbdbProfilePayload(payload) {
  const object = payload?.object || {};
  const physical = new Map(
    (payload?.phys_par || []).filter((item) => item?.name).map((item) => [item.name, item])
  );
  const orbit = new Map(
    (payload?.orbit?.elements || []).filter((item) => item?.name).map((item) => [item.name, item])
  );
  const value = (map, ...names) => {
    for (const name of names) {
      const candidate = map.get(name)?.value;
      if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
    }
    return null;
  };
  const objectRecord = normalizeSbdbRow({
    spkid: object.spkid,
    pdes: object.des,
    name: object.fullname || object.name,
    full_name: object.fullname,
    neo: object.neo,
    pha: object.pha,
    H: value(physical, "H"),
    diameter: value(physical, "diameter"),
    diameter_sigma: physical.get("diameter")?.sigma,
    albedo: value(physical, "albedo"),
    rot_per: value(physical, "rot_per"),
    extent: value(physical, "extent"),
    spec_B: value(physical, "spec_B"),
    spec_T: value(physical, "spec_T"),
    orbitClass: object.orbit_class?.name,
    orbitalData: {
      orbit_id: clean(payload?.orbit?.orbit_id),
      epoch_osculation: value(orbit, "epoch"),
      eccentricity: value(orbit, "e"),
      semi_major_axis: value(orbit, "a"),
      perihelion_distance: value(orbit, "q"),
      inclination: value(orbit, "i"),
      ascending_node_longitude: value(orbit, "om"),
      perihelion_argument: value(orbit, "w"),
      mean_anomaly: value(orbit, "ma"),
      perihelion_time: value(orbit, "tp"),
      orbital_period: value(orbit, "per"),
      mean_motion: value(orbit, "n"),
      aphelion_distance: value(orbit, "ad")
    }
  });
  objectRecord.aliases.push(
    ...(Array.isArray(object.spkid_alt) ? object.spkid_alt : []),
    ...(Array.isArray(object.des_alt) ? object.des_alt.map((item) => item?.value || item) : [])
  );
  return objectRecord;
}

function mergeNullable(left, right) {
  return right === null || right === undefined || right === "" ? left : right;
}

function mergePhysical(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    H: mergeNullable(left.H, right.H),
    diameterKm: mergeNullable(left.diameterKm, right.diameterKm),
    diameterSigmaKm: mergeNullable(left.diameterSigmaKm, right.diameterSigmaKm),
    albedo: mergeNullable(left.albedo, right.albedo),
    rotationPeriodHours: mergeNullable(left.rotationPeriodHours, right.rotationPeriodHours),
    extent: mergeNullable(left.extent, right.extent),
    spectralClass: mergeNullable(left.spectralClass, right.spectralClass)
  };
}

function mergeRecord(target, incoming) {
  target.aliases = [...new Set([...(target.aliases || []), ...(incoming.aliases || [])])];
  target.neoWsId = target.neoWsId || incoming.neoWsId || "";
  target.spkid = target.spkid || incoming.spkid || "";
  target.pdes = target.pdes || incoming.pdes || "";
  if (incoming.source === "JPL SBDB" && incoming.name) target.name = incoming.name;
  target.name = target.name || incoming.name || "Unnamed NEO";
  target.fullName = target.fullName || incoming.fullName || "";
  target.isNeo = target.isNeo ?? incoming.isNeo ?? true;
  target.isPha = incoming.isPha ?? target.isPha ?? null;
  target.physical = mergePhysical(target.physical, incoming.physical);
  target.orbitalData = target.orbitalData || incoming.orbitalData || null;
  target.orbitClass = target.orbitClass || incoming.orbitClass || "";
  target.approaches = [...(target.approaches || []), ...(incoming.approaches || [])];
  return target;
}

function approachKey(approach) {
  return [approach.body, approach.date, approach.distanceAu, approach.relativeVelocityKmS].join("|");
}

function meshSummary(record) {
  if (!record) return { status: "not-indexed" };
  return {
    status: "verified",
    id: record.id,
    objectName: record.objectName,
    assetUrl: record.assetUrl,
    format: record.format,
    units: record.units,
    modelType: record.modelType,
    confidence: record.confidence,
    source: record.source,
    pdsBundle: record.pdsBundle,
    pdsRecordUrl: record.pdsRecordUrl,
    downloadUrl: record.downloadUrl,
    doi: record.doi
  };
}

function findMeshRecord(record, meshCatalog) {
  const recordAliases = getDiscoverAliases(record);
  const explicit = meshCatalog.find((mesh) => {
    const aliases = getDiscoverAliases({
      ...mesh,
      spkid: mesh.spkId,
      neoWsId: mesh.neoWsId,
      aliases: [mesh.objectName, ...(mesh.aliases || [])]
    });
    return aliases.some((alias) => recordAliases.includes(alias));
  });
  return explicit || getMeshRecord({ ...record, aliases: record.aliases });
}

export function toNeoObject(record = {}) {
  const id = clean(record.neoWsId || record.spkid || record.pdes || record.canonicalId);
  const diameter = numberOrNull(record.physical?.diameterKm);
  const closeApproachData = (record.approaches || []).map((approach) => ({
    close_approach_date: approach.date,
    close_approach_date_full: approach.dateLabel || approach.date,
    relative_velocity: {
      kilometers_per_second: String(approach.relativeVelocityKmS ?? "")
    },
    miss_distance: {
      astronomical: String(approach.distanceAu ?? ""),
      lunar: String(approach.distanceLd ?? ""),
      kilometers: String(approach.distanceKm ?? "")
    },
    orbiting_body: approach.body || "Earth"
  }));

  return {
    id,
    neo_reference_id: clean(record.neoWsId || record.spkid || record.pdes || id),
    jplSpkId: clean(record.spkid),
    pdes: clean(record.pdes),
    name: record.name || record.fullName || id || "Unnamed NEO",
    full_name: record.fullName || record.name || id,
    nasa_jpl_url:
      "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=" +
      encodeURIComponent(record.spkid || record.pdes || record.name || id),
    is_potentially_hazardous_asteroid: Boolean(record.isPha),
    absolute_magnitude_h: record.physical?.H ?? undefined,
    estimated_diameter: diameter
      ? {
          kilometers: { estimated_diameter_min: diameter, estimated_diameter_max: diameter },
          meters: { estimated_diameter_min: diameter * 1000, estimated_diameter_max: diameter * 1000 }
        }
      : undefined,
    close_approach_data: closeApproachData,
    orbital_data: record.orbitalData || {},
    physical: {
      source: "NASA/JPL SBDB",
      diameterKm: record.physical?.diameterKm || 0,
      diameterSigmaKm: record.physical?.diameterSigmaKm || 0,
      absoluteMagnitude: record.physical?.H || 0,
      albedo: record.physical?.albedo || 0,
      rotationPeriodHours: record.physical?.rotationPeriodHours || 0,
      extent: record.physical?.extent || "",
      spectralClass: record.physical?.spectralClass || "",
      orbitClass: record.orbitClass || "",
      orbitalData: record.orbitalData || null
    }
  };
}

export function mergeDiscoverSources({
  cadPayload,
  cadPayloads = [],
  sbdbPayload,
  seedRecords = [],
  meshCatalog = PDS_MESH_CATALOG
} = {}) {
  const records = [];
  const aliasIndex = new Map();

  const upsert = (incoming) => {
    if (!incoming) return null;
    const aliases = getDiscoverAliases(incoming);
    let target = aliases.map((alias) => aliasIndex.get(alias)).find(Boolean);
    if (!target) {
      target = {
        canonicalId: getDiscoverCanonicalKey(incoming),
        aliases: [],
        approaches: [],
        physical: {},
        isPha: null
      };
      records.push(target);
    }
    mergeRecord(target, incoming);
    for (const alias of getDiscoverAliases(target)) aliasIndex.set(alias, target);
    for (const alias of aliases) aliasIndex.set(alias, target);
    return target;
  };

  parseSbdbPayload(sbdbPayload).forEach(upsert);
  [cadPayload, ...cadPayloads].filter(Boolean).forEach((payload) => {
    parseCadPayload(payload).forEach(upsert);
  });
  seedRecords.forEach(upsert);

  return records.map((record) => {
    record.approaches = [...new Map(
      record.approaches.map((approach) => [approachKey(approach), approach])
    ).values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    const mesh = findMeshRecord(record, meshCatalog);
    record.mesh = meshSummary(mesh);
    record.neo = toNeoObject(record);
    record.neo.jplSpkId = record.spkid;
    return record;
  });
}

export function createDiscoverDataset(records = [], metadata = {}) {
  return {
    schemaVersion: DISCOVER_SCHEMA_VERSION,
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    source: metadata.source || "LOCAL DEMO",
    scope: metadata.scope || {
      body: "Earth",
      dateMin: "now",
      dateMaxDays: 365,
      distanceMaxAu: 0.05
    },
    records
  };
}

export function createDiscoverDatasetFromNeos(neos = [], metadata = {}) {
  const records = neos.map((neo) => {
    const seed = {
      canonicalId: getDiscoverCanonicalKey(neo),
      aliases: getDiscoverAliases(neo),
      neoWsId: clean(neo.id),
      spkid: clean(neo.jplSpkId),
      pdes: clean(neo.pdes),
      name: clean(neo.name),
      fullName: clean(neo.full_name || neo.name),
      isNeo: true,
      isPha: Boolean(neo.is_potentially_hazardous_asteroid),
      physical: {
        H: numberOrNull(neo.absolute_magnitude_h ?? neo.physical?.absoluteMagnitude),
        diameterKm: numberOrNull(neo.physical?.diameterKm),
        diameterSigmaKm: numberOrNull(neo.physical?.diameterSigmaKm)
      },
      orbitalData: neo.orbital_data || null,
      orbitClass: neo.physical?.orbitClass || "",
      approaches: (neo.close_approach_data || []).map((approach) => normalizeApproach({
        body: approach.orbiting_body,
        cd: approach.close_approach_date,
        dist: approach.miss_distance?.astronomical,
        v_rel: approach.relative_velocity?.kilometers_per_second
      }))
    };
    const record = mergeDiscoverSources({ seedRecords: [seed] })[0] || seed;
    record.neo = neo;
    record.mesh = meshSummary(getMeshRecord(neo));
    return record;
  });
  return createDiscoverDataset(records, { source: metadata.source || "LOCAL DEMO", ...metadata });
}

function isApproachInWindow(approach, approachWindowDays) {
  if (!approachWindowDays || !approach?.date) return true;
  const timestamp = Date.parse(`${approach.date}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return true;
  const start = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return timestamp >= start && timestamp <= start + approachWindowDays * 86400000;
}

export function getPrimaryApproach(record, mode = DISCOVER_MODES.closest, approachWindowDays = null) {
  const approaches = (record?.approaches || []).filter(
    (approach) => approach.distanceAu !== null || approach.relativeVelocityKmS !== null
  ).filter((approach) => isApproachInWindow(approach, approachWindowDays));
  if (!approaches.length) return null;
  if (mode === DISCOVER_MODES.fastest) {
    return [...approaches].sort(
      (left, right) => (right.relativeVelocityKmS ?? -Infinity) - (left.relativeVelocityKmS ?? -Infinity)
    )[0];
  }
  return [...approaches].sort(
    (left, right) => (left.distanceAu ?? Infinity) - (right.distanceAu ?? Infinity)
  )[0];
}

export function getDiscoverMetric(record, mode = DISCOVER_MODES.closest, approachWindowDays = null) {
  if (mode === DISCOVER_MODES.largest) return numberOrNull(record?.physical?.diameterKm);
  const approach = getPrimaryApproach(record, mode, approachWindowDays);
  return mode === DISCOVER_MODES.fastest
    ? numberOrNull(approach?.relativeVelocityKmS)
    : numberOrNull(approach?.distanceAu);
}

export function sortDiscoverRecords(records = [], mode = DISCOVER_MODES.closest, options = {}) {
  return [...records].sort((left, right) => {
    const leftMetric = getDiscoverMetric(left, mode, options.approachWindowDays);
    const rightMetric = getDiscoverMetric(right, mode, options.approachWindowDays);
    if (leftMetric === null && rightMetric === null) return String(left.name).localeCompare(String(right.name));
    if (leftMetric === null) return 1;
    if (rightMetric === null) return -1;
    const difference = mode === DISCOVER_MODES.closest
      ? leftMetric - rightMetric
      : rightMetric - leftMetric;
    return difference || String(left.name).localeCompare(String(right.name));
  });
}

export function filterDiscoverRecords(records = [], {
  mode = DISCOVER_MODES.closest,
  meshOnly = false,
  phaOnly = false,
  maxDistanceAu = null,
  approachWindowDays = null
} = {}) {
  return records.filter((record) => {
    if (meshOnly && record?.mesh?.status !== "verified") return false;
    if (phaOnly && !record?.isPha) return false;
    if (maxDistanceAu !== null && mode !== DISCOVER_MODES.largest) {
      const approach = getPrimaryApproach(record, mode, approachWindowDays);
      if (!approach || approach.distanceAu === null || approach.distanceAu > maxDistanceAu) return false;
    }
    if (mode !== DISCOVER_MODES.largest && approachWindowDays && !getPrimaryApproach(record, mode, approachWindowDays)) return false;
    return true;
  });
}

export function getRankedDiscoverRecords(records = [], options = {}) {
  const mode = options.mode || DISCOVER_MODES.closest;
  return sortDiscoverRecords(filterDiscoverRecords(records, { ...options, mode }), mode, options);
}

function validDataset(value) {
  return Boolean(
    value &&
    Array.isArray(value.records) &&
    value.records.every((record) => record && typeof record === "object")
  );
}

function readCachedDataset() {
  if (typeof localStorage === "undefined") return null;
  try {
    const cached = JSON.parse(localStorage.getItem(DISCOVER_CACHE_KEY) || "null");
    if (!cached || Date.now() - Number(cached.savedAt) > DISCOVER_CACHE_TTL_MS || !validDataset(cached.data)) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeCachedDataset(data) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage is optional; the generated file remains the source of truth.
  }
}

export async function fetchDiscoverDataset({
  url = DISCOVER_DATA_URL,
  fetchImpl = globalThis.fetch,
  allowCache = true
} = {}) {
  if (memoryDataset) return memoryDataset;
  if (memoryRequest) return memoryRequest;

  if (allowCache) {
    const cached = readCachedDataset();
    if (cached) {
      memoryDataset = cached;
      return cached;
    }
  }

  if (typeof fetchImpl !== "function") throw new Error("Discover data fetch is unavailable.");

  memoryRequest = (async () => {
    const response = await fetchImpl(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Discover dataset unavailable (HTTP ${response.status}).`);
    const data = await response.json();
    if (!validDataset(data)) throw new Error("Discover dataset has an invalid shape.");
    memoryDataset = data;
    if (allowCache) writeCachedDataset(data);
    return data;
  })();

  try {
    return await memoryRequest;
  } finally {
    memoryRequest = null;
  }
}

export function resetDiscoverDatasetCache() {
  memoryDataset = null;
  memoryRequest = null;
}
