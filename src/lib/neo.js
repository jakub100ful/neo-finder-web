export const NASA_TOKEN_STORAGE_KEY = "neo-finder:nasa-api-token";
export const PROFILE_STORAGE_KEY = "neo-finder:profile";
export const FAVOURITES_STORAGE_KEY = "neo-finder:favourites";

const NASA_FEED_URL = "https://api.nasa.gov/neo/rest/v1/feed";

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export const featureFlags = {
  requireNasaToken: readBoolean(import.meta.env.VITE_REQUIRE_NASA_TOKEN, false),
  liveNasaData: readBoolean(import.meta.env.VITE_ENABLE_LIVE_NASA_DATA, true)
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

export async function fetchPhysicalProfile(neo) {
  const spkId = String(neo?.id || "");
  if (!/^\d+$/.test(spkId)) return null;

  const query = new URLSearchParams({
    spk: spkId,
    "phys-par": "1",
    "no-orbit": "1"
  });
  const response = await fetch(
    "https://ssd-api.jpl.nasa.gov/sbdb.api?" + query.toString()
  );
  if (!response.ok) return null;

  const payload = await response.json();
  const values = Object.fromEntries(
    (payload.phys_par || [])
      .filter((item) => item?.name)
      .map((item) => [item.name, item.value])
  );
  if (!Object.keys(values).length) return null;

  return {
    absoluteMagnitude: numeric(values.H),
    albedo: numeric(values.albedo),
    rotationPeriodHours: numeric(values.rot_per),
    spectralClass: values.spec_T || values.spec_B || "",
    diameterKm: numeric(values.diameter)
  };
}

export function getApproach(neo) {
  return neo?.close_approach_data?.[0] || {};
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export function getAppearance(neo, index = 0) {
  const physical = neo?.physical || {};
  const spectral = String(physical.spectralClass || "").toUpperCase();
  const albedo = numeric(physical.albedo);
  const seed = stableHash(String(neo?.id || neo?.name || index));
  const choices = ["rocky", "angular", "elongated", "cratered"];
  let shape = choices[seed % choices.length];
  let materialColor = [0x8e8c99, 0x676572, 0xb1a78f, 0x5d7d88][seed % 4];

  if (spectral.startsWith("C") || spectral.startsWith("B")) {
    shape = "boulder";
    materialColor = 0x77736a;
  } else if (spectral.startsWith("S") || spectral.startsWith("Q")) {
    shape = "angular";
    materialColor = 0x9a795f;
  } else if (spectral.startsWith("M") || spectral.startsWith("X")) {
    shape = "metallic";
    materialColor = 0x87949c;
  }

  if (albedo) {
    materialColor = shadeHex(materialColor, Math.min(1.35, Math.max(0.68, 0.72 + albedo * 2.2)));
  }

  const period = numeric(physical.rotationPeriodHours);
  const spin = period
    ? Math.min(0.036, Math.max(0.004, 0.03 / period))
    : 0.005 + (seed % 9) * 0.001;

  return {
    shape,
    seed,
    materialColor,
    roughness: spectral.startsWith("M") || spectral.startsWith("X")
      ? 0.52
      : albedo
        ? Math.max(0.7, 1 - albedo * 0.5)
        : 0.94,
    spin,
    spectralClass: spectral,
    hasPhysicalProfile: Boolean(spectral || period || physical.albedo)
  };
}

export function getSceneMetrics(neo, index = 0) {
  const diameter = getDiameterKm(neo);
  const speed = getSpeedKps(neo);
  const distance = getDistanceKm(neo);
  return {
    radius: Math.min(44, Math.max(19, 17 + Math.log10(Math.max(distance, 1)) * 2.9)),
    size: Math.min(3.8, Math.max(0.7, 0.55 + Math.log10(Math.max(diameter, 0.01) + 1) * 1.5)),
    speed: Math.min(1.6, Math.max(0.24, speed / 20)),
    phase: (index * 1.43) % (Math.PI * 2),
    inclination: Math.min(0.48, Math.max(-0.48, getInclination(neo) / 80)),
    appearance: getAppearance(neo, index)
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
