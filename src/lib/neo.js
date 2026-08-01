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

export function getApproach(neo) {
  return neo?.close_approach_data?.[0] || {};
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDiameterKm(neo) {
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
    return { label: "PHA", tone: "danger", detail: "Potentially hazardous" };
  }
  if (distance < 7500000) {
    return { label: "CLOSE", tone: "warn", detail: "Close approach" };
  }
  return { label: "TRACKED", tone: "safe", detail: "Tracked object" };
}

export function getRiskScore(neo) {
  if (neo?.is_potentially_hazardous_asteroid) return 86;
  const distance = getDistanceKm(neo);
  if (distance < 7500000) return 63;
  if (distance < 30000000) return 42;
  return 18;
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
    inclination: Math.min(0.48, Math.max(-0.48, getInclination(neo) / 80))
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
