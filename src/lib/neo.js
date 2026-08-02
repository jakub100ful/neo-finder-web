import { getNeoMinimumPeriapsisRadius } from "./orbit-model.mjs";
import { getMeshRecord } from "./pds-mesh.js";

export const NASA_TOKEN_STORAGE_KEY = "neo-finder:nasa-api-token";
export const PROFILE_STORAGE_KEY = "neo-finder:profile";
export const FAVOURITES_STORAGE_KEY = "neo-finder:favourites";

const NASA_FEED_URL = "https://api.nasa.gov/neo/rest/v1/feed";
const NASA_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo";
const physicalProfileCache = new Map();
const physicalProfileRequests = new Map();
const orbitalProfileCache = new Map();
const orbitalProfileRequests = new Map();

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

const runtimeEnv = import.meta.env || {};

export const featureFlags = {
  requireNasaToken: readBoolean(runtimeEnv.VITE_REQUIRE_NASA_TOKEN, false),
  liveNasaData: readBoolean(runtimeEnv.VITE_ENABLE_LIVE_NASA_DATA, true),
  liveJplData: readBoolean(runtimeEnv.VITE_ENABLE_LIVE_JPL_DATA, true)
};

export function getStoredNasaToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(NASA_TOKEN_STORAGE_KEY) || "";
}

export function saveNasaToken(token) {
  if (typeof localStorage === "undefined") return;
  const cleanToken = token.trim();
  if (cleanToken) {
    localStorage.setItem(NASA_TOKEN_STORAGE_KEY, cleanToken);
  } else {
    localStorage.removeItem(NASA_TOKEN_STORAGE_KEY);
  }
}

export function loadLocalJson(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalJson(key, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export async function fetchNeoFeed(date, apiKey) {
  const query = new URLSearchParams({
    start_date: date,
    end_date: date,
    api_key: apiKey || "DEMO_KEY"
  });
  const response = await fetch(NASA_FEED_URL + "?" + query.toString());
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message =
      payload?.error_message ||
      payload?.error?.message ||
      "NASA returned an unavailable response.";
    throw new Error(message);
  }
  const objects = Object.values(payload.near_earth_objects || {}).flat();
  return objects.sort((left, right) => {
    return getDistanceKm(left) - getDistanceKm(right);
  });
}

export async function fetchNeoOrbitData(neo, apiKey) {
  const neoId = String(neo?.id || "");
  if (!/^\d+$/.test(neoId)) return null;

  if (orbitalProfileCache.has(neoId)) return orbitalProfileCache.get(neoId);
  if (orbitalProfileRequests.has(neoId)) return orbitalProfileRequests.get(neoId);

  const request = (async () => {
    const query = new URLSearchParams({ api_key: apiKey || "DEMO_KEY" });
    const response = await fetch(
      NASA_LOOKUP_URL + "/" + encodeURIComponent(neoId) + "?" + query.toString()
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const orbitalData = payload.orbital_data || null;
    orbitalProfileCache.set(neoId, orbitalData);
    return orbitalData;
  })();

  orbitalProfileRequests.set(neoId, request);
  try {
    return await request;
  } finally {
    orbitalProfileRequests.delete(neoId);
  }
}

export async function fetchPhysicalProfile(neo) {
  const spkId = String(neo?.jplSpkId || neo?.spkid || neo?.spkId || neo?.id || "");
  if (!/^\d+$/.test(spkId)) return null;

  if (physicalProfileCache.has(spkId)) return physicalProfileCache.get(spkId);
  if (physicalProfileRequests.has(spkId)) return physicalProfileRequests.get(spkId);

  const request = (async () => {
    const query = new URLSearchParams({
      spk: spkId,
      "phys-par": "1",
      "anc-data": "1",
      discovery: "1"
    });
    const response = await fetch(
      "https://ssd-api.jpl.nasa.gov/sbdb.api?" + query.toString()
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const records = new Map(
      (payload.phys_par || [])
        .filter((item) => item?.name)
        .map((item) => [item.name, item])
    );
    const orbitElements = new Map(
      (payload.orbit?.elements || [])
        .filter((item) => item?.name)
        .map((item) => [item.name, item])
    );
    if (!records.size && !orbitElements.size) return null;

    const value = (...names) => {
      for (const name of names) {
        const candidate = records.get(name)?.value;
        if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
      }
      return "";
    };
    const extent = String(value("extent") || "");
    const colorIndices = {
      bv: numeric(value("BV")),
      ub: numeric(value("UB")),
      ir: numeric(value("IR"))
    };
    const orbitalValue = (...names) => {
      for (const name of names) {
        const candidate = orbitElements.get(name)?.value;
        if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
      }
      return "";
    };
    const orbitalData = {
      orbit_id: payload.orbit?.orbit_id || "",
      epoch_osculation: payload.orbit?.epoch || "",
      eccentricity: orbitalValue("e"),
      semi_major_axis: orbitalValue("a"),
      perihelion_distance: orbitalValue("q"),
      inclination: orbitalValue("i"),
      ascending_node_longitude: orbitalValue("om"),
      perihelion_argument: orbitalValue("w"),
      mean_anomaly: orbitalValue("ma"),
      perihelion_time: orbitalValue("tp"),
      orbital_period: orbitalValue("per"),
      mean_motion: orbitalValue("n"),
      aphelion_distance: orbitalValue("ad")
    };
    const profile = {
      source: "NASA/JPL SBDB",
      signatureVersion: payload.signature?.version || "",
      absoluteMagnitude: numeric(value("H")),
      absoluteMagnitudeSigma: numeric(records.get("H")?.sigma),
      magnitudeSlope: numeric(value("G")),
      albedo: numeric(value("albedo")),
      diameterKm: numeric(value("diameter")),
      diameterSigmaKm: numeric(records.get("diameter")?.sigma),
      extent,
      extentKm: parseNumericTuple(extent),
      density: numeric(value("density")),
      densitySigma: numeric(records.get("density")?.sigma),
      rotationPeriodHours: numeric(value("rot_per")),
      pole: String(value("pole") || ""),
      colorIndices,
      colorIndexBV: colorIndices.bv,
      spectralClass: String(value("spec_T", "spec_B") || "").toUpperCase(),
      tholenClass: String(value("spec_T") || "").toUpperCase(),
      smassClass: String(value("spec_B") || "").toUpperCase(),
      orbitClass: payload.object?.orbit_class?.name || "",
      orbitClassCode: payload.object?.orbit_class?.code || "",
      orbitalData,
      observationsUsed: numeric(payload.orbit?.n_obs_used),
      dataArcDays: numeric(payload.orbit?.data_arc),
      orbitUncertainty: payload.orbit?.condition_code || "",
      firstObservationDate: payload.orbit?.first_obs || "",
      lastObservationDate: payload.orbit?.last_obs || "",
      discovery: payload.discovery || null,
      ancillaryData: payload.object?.anc_data || {}
    };
    physicalProfileCache.set(spkId, profile);
    return profile;
  })();

  physicalProfileRequests.set(spkId, request);
  try {
    return await request;
  } finally {
    physicalProfileRequests.delete(spkId);
  }
}

export function getApproach(neo) {
  return neo?.close_approach_data?.[0] || {};
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumericTuple(value) {
  return String(value || "")
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];
}

export function getDiameterKm(neo) {
  const physicalDiameter = numeric(neo?.physical?.diameterKm);
  if (physicalDiameter > 0) return physicalDiameter;

  const kilometers = neo?.estimated_diameter?.kilometers;
  if (kilometers) {
    return (
      numeric(kilometers.estimated_diameter_min) +
      numeric(kilometers.estimated_diameter_max)
    ) / 2;
  }
  const meters = neo?.estimated_diameter?.meters;
  if (meters) {
    return (
      numeric(meters.estimated_diameter_min) +
      numeric(meters.estimated_diameter_max)
    ) / 2000;
  }
  return 0;
}

export function getSpeedKps(neo) {
  return numeric(getApproach(neo)?.relative_velocity?.kilometers_per_second);
}

export function getDistanceKm(neo) {
  return numeric(getApproach(neo)?.miss_distance?.kilometers, 100000000);
}

export function getInclination(neo) {
  return numeric(neo?.orbital_data?.inclination);
}

export function getRisk(neo) {
  const distance = getDistanceKm(neo);
  if (neo?.is_potentially_hazardous_asteroid) {
    return { label: "PHA", tone: "danger", detail: "NASA PHA flag" };
  }
  if (distance < 7500000) {
    return { label: "CLOSE", tone: "warn", detail: "Under 0.05 AU marker" };
  }
  return { label: "TRACKED", tone: "safe", detail: "Recorded NEO" };
}

export function getRiskScore(neo) {
  if (neo?.is_potentially_hazardous_asteroid) return 86;
  const distance = getDistanceKm(neo);
  if (distance < 7500000) return 63;
  if (distance < 30000000) return 42;
  return 18;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shadeHex(hex, factor) {
  const red = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * factor)));
  const green = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * factor)));
  const blue = Math.min(255, Math.max(0, Math.round((hex & 255) * factor)));
  return (red << 16) | (green << 8) | blue;
}

function tintHex(hex, brightness = 1, warmth = 0) {
  const red = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * brightness + warmth * 255)));
  const green = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * brightness)));
  const blue = Math.min(255, Math.max(0, Math.round((hex & 255) * brightness - warmth * 180)));
  return (red << 16) | (green << 8) | blue;
}

function normalizeAxisRatios(values, fallback) {
  const usable = values.length >= 3 && values.slice(0, 3).every((value) => value > 0)
    ? values.slice(0, 3)
    : fallback;
  const geometricMean = Math.cbrt(usable[0] * usable[1] * usable[2]);
  return usable.map((value) => Math.min(2.4, Math.max(0.45, value / geometricMean)));
}

function getSpinAxis(pole, seed) {
  const values = parseNumericTuple(pole);
  if (values.length >= 2) {
    const rightAscension = (values[0] * Math.PI) / 180;
    const declination = (values[1] * Math.PI) / 180;
    return [
      Math.cos(declination) * Math.cos(rightAscension),
      Math.sin(declination),
      Math.cos(declination) * Math.sin(rightAscension)
    ];
  }

  const fallback = [
    ((seed % 17) - 8) / 10,
    0.65 + (seed % 23) / 100,
    ((seed % 29) - 14) / 12
  ];
  const length = Math.hypot(...fallback) || 1;
  return fallback.map((value) => value / length);
}

function degreesToRadians(value) {
  return (numeric(value) * Math.PI) / 180;
}

export function getOrbitalProfile(neo) {
  const orbital = neo?.orbital_data || {};
  return {
    eccentricity: Math.min(0.999999, Math.max(0, numeric(orbital.eccentricity))),
    inclinationRadians: degreesToRadians(orbital.inclination),
    ascendingNodeRadians: degreesToRadians(orbital.ascending_node_longitude),
    argumentOfPeriapsisRadians: degreesToRadians(orbital.perihelion_argument),
    meanAnomalyRadians: degreesToRadians(orbital.mean_anomaly),
    orbitalPeriodDays: numeric(orbital.orbital_period),
    meanMotionDegreesPerDay: numeric(orbital.mean_motion),
    epochOsculation: numeric(orbital.epoch_osculation),
    hasElements: [
      orbital.eccentricity,
      orbital.inclination,
      orbital.ascending_node_longitude,
      orbital.perihelion_argument,
      orbital.mean_anomaly
    ].some((value) => value !== undefined && value !== null && value !== "")
  };
}

export function getAppearance(neo, index = 0) {
  const physical = neo?.physical || {};
  const spectral = String(physical.spectralClass || "").toUpperCase();
  const albedo = numeric(physical.albedo);
  const density = numeric(physical.density);
  const seed = stableHash(String(neo?.id || neo?.name || index));
  const choices = ["rocky", "angular", "elongated", "cratered"];
  let shape = choices[seed % choices.length];
  let materialColor = [0x8e8c99, 0x676572, 0xb1a78f, 0x5d7d88][seed % 4];
  let accentColor = shadeHex(materialColor, 1.28);
  let baseRoughness = 0.92;
  let baseMetalness = 0.03;

  if (spectral.startsWith("C") || spectral.startsWith("B")) {
    shape = "boulder";
    materialColor = 0x77736a;
    accentColor = 0x9c9587;
    baseRoughness = 0.98;
  } else if (spectral.startsWith("S") || spectral.startsWith("Q")) {
    shape = "angular";
    materialColor = 0x9a795f;
    accentColor = 0xc2a27d;
    baseRoughness = 0.86;
  } else if (spectral.startsWith("V")) {
    shape = "cratered";
    materialColor = 0x6e6657;
    accentColor = 0x9a8d70;
    baseRoughness = 0.9;
  } else if (spectral.startsWith("M") || spectral.startsWith("X")) {
    shape = "metallic";
    materialColor = 0x87949c;
    accentColor = 0xc3ccd2;
    baseRoughness = 0.56;
    baseMetalness = 0.32;
  } else if (spectral.startsWith("D") || spectral.startsWith("P")) {
    shape = "elongated";
    materialColor = 0x76564e;
    accentColor = 0xa47b68;
    baseRoughness = 0.96;
  }

  if (albedo) {
    const brightness = Math.min(1.35, Math.max(0.68, 0.72 + albedo * 2.2));
    const colorIndex = numeric(physical.colorIndexBV || physical.colorIndices?.bv);
    const warmth = colorIndex
      ? Math.min(0.12, Math.max(-0.08, (colorIndex - 0.7) * 0.3))
      : 0;
    materialColor = tintHex(materialColor, brightness, warmth);
    accentColor = tintHex(accentColor, brightness, warmth);
  }

  const period = numeric(physical.rotationPeriodHours);
  const spin = period
    ? Math.min(0.036, Math.max(0.004, 0.03 / period))
    : 0.005 + (seed % 9) * 0.001;
  const fallbackAxes = {
    angular: [1, 0.92, 0.84],
    elongated: [1.45, 0.76, 0.9],
    cratered: [1.12, 0.86, 1.08],
    boulder: [1.1, 0.92, 0.86],
    metallic: [1.08, 1, 0.88],
    rocky: [1, 0.94, 0.9]
  }[shape] || [1, 1, 1];
  const axisRatios = normalizeAxisRatios(
    physical.extentKm || parseNumericTuple(physical.extent),
    fallbackAxes
  );
  const surfaceRelief = Math.min(
    0.34,
    Math.max(
      0.1,
      (albedo ? 1 - albedo : 0.72) * 0.22 +
        (density ? Math.max(0, 3.5 - density) * 0.025 : 0.04)
    )
  );

  return {
    shape,
    seed,
    materialColor,
    accentColor,
    roughness: albedo
      ? Math.max(0.7, Math.min(baseRoughness, 1 - albedo * 0.5))
      : baseRoughness,
    metalness: baseMetalness + (density > 4 ? 0.12 : 0),
    spin,
    rotationPeriodHours: period,
    spinAxis: getSpinAxis(physical.pole, seed),
    axisRatios,
    surfaceRelief,
    craterCount: 3 + (seed % 5),
    craterDepth: surfaceRelief * 0.7,
    geometryDetail: physical.extentKm?.length >= 3 || physical.spectralClass ? 2 : 1,
    spectralClass: spectral,
    hasPhysicalProfile: Boolean(spectral || period || physical.albedo)
  };
}

export function getSceneMetrics(neo, index = 0) {
  const diameter = getDiameterKm(neo);
  const speed = getSpeedKps(neo);
  const distance = getDistanceKm(neo);
  const orbit = getOrbitalProfile(neo);
  const radius = Math.min(44, Math.max(19, 17 + Math.log10(Math.max(distance, 1)) * 2.9));
  const size = Math.min(3.8, Math.max(0.7, 0.55 + Math.log10(Math.max(diameter, 0.01) + 1) * 1.5));
  const bodyRadius = size * 1.5;
  return {
    radius,
    size,
    bodyRadius,
    minimumPeriapsisRadius: getNeoMinimumPeriapsisRadius(bodyRadius),
    speed: Math.min(1.6, Math.max(0.24, speed / 20)),
    phase: (index * 1.43 + orbit.meanAnomalyRadians) % (Math.PI * 2),
    inclination: orbit.hasElements
      ? orbit.inclinationRadians
      : Math.min(0.48, Math.max(-0.48, getInclination(neo) / 80)),
    orbit,
    appearance: getAppearance(neo, index),
    mesh: getMeshRecord(neo)
  };
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-GB", {
    maximumFractionDigits: digits
  });
}

export function formatDistance(neo) {
  const distance = getDistanceKm(neo);
  if (distance >= 1000000) return formatNumber(distance / 1000000, 2) + "M km";
  return formatNumber(distance / 1000, 0) + "K km";
}

export function formatDate(date) {
  if (!date) return "UNKNOWN DATE";
  const parsed = new Date(date + "T00:00:00");
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).toUpperCase();
}
