import { SMALL_BODY_RADAR_SHAPE_MODELS } from "./radar-shape-models.js";

export const PDS_SEARCH_API_URL = "https://pds.nasa.gov/api/search/1/products";
export const PDS_MESH_CATALOG_VERSION = "2026-08-03";

// PDS is a discovery and archive service rather than a single standardized
// asteroid-mesh endpoint. This manifest contains shape models that have been
// checked, identified by stable small-body aliases, and made available as
// local web assets for predictable rendering.
const PDS_MESH_CATALOG = [
  {
    id: "apophis-v1",
    objectName: "(99942) Apophis",
    name: "(99942) Apophis",
    fullName: "99942 Apophis (2004 MN4)",
    spkId: "20099942",
    neoWsId: "2099942",
    pdes: "99942",
    isNeo: true,
    isPha: true,
    aliases: [
      "20099942",
      "2099942",
      "99942",
      "99942 APOPHIS",
      "2004 MN4",
      "APOPHIS"
    ],
    assetUrl: "/models/neos/apophis_v233s7.obj",
    format: "obj",
    units: "km",
    modelType: "RADAR-DERIVED SHAPE MODEL",
    confidence: "PRELIMINARY",
    source: "NASA Planetary Data System // Small Bodies Node",
    pdsBundle: "urn:nasa:pds:gbo.ast-apophis.jpl.radar.shape_model::1.0",
    pdsRecordUrl:
      "https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Agbo.ast-apophis.jpl.radar.shape_model&version=1.0",
    downloadUrl:
      "https://sbnarchive.psi.edu/pds4/non_mission/gbo.ast-apophis.jpl.radar.shape_model_v1.0.zip",
    doi: "10.26033/ydyq-5756",
    orbitalData: {
      orbit_id: "220",
      epoch_osculation: "2461200.5",
      eccentricity: "0.191",
      semi_major_axis: "0.922",
      perihelion_distance: "0.746",
      inclination: "3.34",
      ascending_node_longitude: "204",
      perihelion_argument: "127",
      mean_anomaly: "175",
      perihelion_time: "2461042.919",
      orbital_period: "324"
    },
    physical: {
      source: "NASA/JPL SBDB snapshot",
      H: 19.09,
      diameterKm: 0.34,
      rotationPeriodHours: 30.56,
      albedo: 0.35,
      smassClass: "Sq",
      orbitClass: "Aten"
    }
  },
  ...SMALL_BODY_RADAR_SHAPE_MODELS
];

function normalizeIdentifier(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[()]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

const aliasIndex = new Map();
for (const record of PDS_MESH_CATALOG) {
  for (const alias of [record.spkId, ...(record.aliases || [])]) {
    const normalized = normalizeIdentifier(alias);
    if (normalized) aliasIndex.set(normalized, record);
  }
}

export function getNeoMeshIdentifiers(neo) {
  const values = [
    neo?.id,
    neo?.neo_reference_id,
    neo?.spkid,
    neo?.spkId,
    neo?.jplSpkId,
    neo?.pdes,
    neo?.name,
    neo?.designation,
    neo?.full_name,
    neo?.object?.name,
    neo?.object?.des,
    ...(Array.isArray(neo?.aliases) ? neo.aliases : [])
  ];
  return [...new Set(values.map(normalizeIdentifier).filter(Boolean))];
}

export function getMeshRecord(neo) {
  const preferredRecordIds = [neo?.meshRecordId, neo?.mesh?.id].filter(Boolean);
  const preferredAssetUrls = [neo?.meshAssetUrl, neo?.mesh?.assetUrl].filter(Boolean);
  const preferred = PDS_MESH_CATALOG.find((record) =>
    preferredRecordIds.includes(record.id) || preferredAssetUrls.includes(record.assetUrl)
  );
  if (preferred) return preferred;

  for (const identifier of getNeoMeshIdentifiers(neo)) {
    const record = aliasIndex.get(identifier);
    if (record) return record;
  }
  return null;
}

export function getPdsSearchTerms(neo) {
  const values = [neo?.name, neo?.id, neo?.neo_reference_id].filter(Boolean);
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export function getPdsSearchUrl(neo) {
  const keyword = getPdsSearchTerms(neo)[0] || "asteroid shape model";
  const query = new URLSearchParams({ keywords: keyword, limit: "20" });
  return `${PDS_SEARCH_API_URL}?${query.toString()}`;
}

export function getMeshAvailability(neo) {
  const record = getMeshRecord(neo);
  return {
    available: Boolean(record),
    record,
    status: record ? "available" : "not-indexed",
    searchUrl: getPdsSearchUrl(neo)
  };
}

export { PDS_MESH_CATALOG };
