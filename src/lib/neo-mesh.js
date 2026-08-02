const MESH_CACHE_NAME = "neo-finder:pds-meshes:v1";
const templateCache = new Map();
const templateRequests = new Map();

async function fetchMeshText(url) {
  const resolvedUrl = new URL(url, window.location.origin).toString();

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(MESH_CACHE_NAME);
      const cached = await cache.match(resolvedUrl);
      if (cached) return await cached.text();

      const response = await fetch(resolvedUrl, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Mesh request failed with HTTP ${response.status}`);
      }
      await cache.put(resolvedUrl, response.clone());
      return await response.text();
    } catch (error) {
      // Private browsing modes and older browsers can disable Cache Storage.
      // A normal browser fetch still works and the renderer keeps its fallback.
      if (error instanceof TypeError || /cache|storage/i.test(String(error?.message))) {
        const response = await fetch(resolvedUrl, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`Mesh request failed with HTTP ${response.status}`);
        }
        return await response.text();
      }
      throw error;
    }
  }

  const response = await fetch(resolvedUrl, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Mesh request failed with HTTP ${response.status}`);
  }
  return await response.text();
}

export async function loadMeshTemplate(Loader, record) {
  if (!Loader || !record?.assetUrl) return null;
  const cacheKey = record.assetUrl;
  if (templateCache.has(cacheKey)) return templateCache.get(cacheKey);
  if (templateRequests.has(cacheKey)) return templateRequests.get(cacheKey);

  const request = (async () => {
    const text = await fetchMeshText(record.assetUrl);
    const template = new Loader().parse(text);
    template.userData = {
      ...(template.userData || {}),
      meshRecordId: record.id
    };
    templateCache.set(cacheKey, template);
    return template;
  })();

  templateRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    templateRequests.delete(cacheKey);
  }
}

export function createMeshInstance(Engine, template, appearance, targetRadius) {
  const instance = template.clone(true);
  const bounds = new Engine.Box3().setFromObject(instance);
  const dimensions = bounds.getSize(new Engine.Vector3());
  const longestDimension = Math.max(dimensions.x, dimensions.y, dimensions.z);
  const center = bounds.getCenter(new Engine.Vector3());
  const safeRadius = Math.max(Number(targetRadius) || 1, 0.1);
  const scale = longestDimension > 0 ? (safeRadius * 2) / longestDimension : 1;

  instance.scale.setScalar(scale);
  instance.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  instance.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) {
      object.geometry = object.geometry.clone();
      if (!object.geometry.getAttribute("normal")) {
        object.geometry.computeVertexNormals();
      }
    }
    const hasVertexColors = Boolean(object.geometry?.getAttribute("color"));
    object.material = new Engine.MeshStandardMaterial({
      color: appearance?.materialColor ?? 0x808080,
      roughness: appearance?.roughness ?? 0.9,
      metalness: appearance?.metalness ?? 0,
      vertexColors: hasVertexColors,
      flatShading: false
    });
    object.castShadow = false;
    object.receiveShadow = false;
  });

  return instance;
}

export function disposeObject3D(root) {
  root?.traverse?.((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    }
  });
}

export function getMeshCacheName() {
  return MESH_CACHE_NAME;
}
