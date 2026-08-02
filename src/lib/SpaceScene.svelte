<script>
import { createEventDispatcher, onMount } from "svelte";
import { getSceneMetrics } from "./neo.js";
import {
  EARTH_RADIUS_SCENE,
  MOON_ORBIT_PERIOD_DAYS,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS_SCENE,
  NEO_ORBIT_PHASE_RATE,
  SIMULATED_DAYS_PER_SECOND,
  ZOOM_MAX_MULTIPLIER,
  ZOOM_MIN_MULTIPLIER,
  clampCameraDistance,
  getMoonRelativePosition,
  getNeoOrbitPosition,
  getZoomScale
} from "./orbit-model.mjs";
import { getCameraOrbitPosition } from "./view-model.mjs";
import { createAsteroidGeometry } from "./asteroid-geometry.mjs";
import {
  createEarthSurfaceMap,
  createMoonSurfaceMap,
  createSoftwareScene
} from "./space-raster.mjs";

  export let neos = [];
  export let earthTheme = "aqua";
  export let earthPattern = "continents";
  export let landColor = "#68df9f";
  export let fluidColor = "#0c89c7";
  export let atmosphereColor = "#61e7ff";
  export let atmosphereEnabled = true;
  export let landmassConfig = {};
  export let compact = false;

  let canvas;
  let softwareCanvas;
  let sceneController = null;
  let softwareController = null;
  let softwareFallbackActive = true;
  let renderError = "";
  let renderStatus = "INITIALISING";
  let earthRotation = 0;
  let hoveredNeo = null;
  let hoverPosition = { x: 0, y: 0 };
  const dispatch = createEventDispatcher();
  let fallbackView = {
    cameraPosition: getCameraOrbitPosition({
      azimuth: 0,
      polar: Math.acos(8 / Math.sqrt(8 ** 2 + 74 ** 2)),
      distance: Math.sqrt(8 ** 2 + 74 ** 2)
    }),
    target: { x: 0, y: 0, z: 0 },
    fovRadians: (33 * Math.PI) / 180,
    aspect: 1,
    azimuth: 0,
    polar: Math.acos(8 / Math.sqrt(8 ** 2 + 74 ** 2))
  };
  const THEMES = {
    aqua: {
      emissive: 0x052841,
      grid: 0x72e7ff,
      orbit: 0x286078,
      moonOrbit: 0x6178aa
    },
    lava: {
      emissive: 0x40120b,
      grid: 0xffbe63,
      orbit: 0x744039,
      moonOrbit: 0x946e8c
    },
    moon: {
      emissive: 0x29283c,
      grid: 0xe3e4ff,
      orbit: 0x514f74,
      moonOrbit: 0x8a8bbd
    },
    plasma: {
      emissive: 0x2e0d52,
      grid: 0xff62d2,
      orbit: 0x673b7d,
      moonOrbit: 0xb74d99
    }
  };

  let zoomScale = 1;

  function setSoftwareFallbackActive(active) {
    softwareFallbackActive = Boolean(active);
    if (!softwareFallbackActive || !softwareController || !softwareCanvas) return;

    softwareController.resize(
      Math.max(softwareCanvas.clientWidth, 240),
      Math.max(softwareCanvas.clientHeight, 240),
      Math.min(window.devicePixelRatio || 1, 1)
    );
  }

  function getSoftwareNeos(nextNeos = []) {
    return (nextNeos || []).slice(0, 8).map((neo, index) => ({
      ...getSceneMetrics(neo, index),
      id: neo?.id ?? neo?.name ?? `neo-${index}`
    }));
  }

  $: if (sceneController && neos) {
    sceneController.updateNeos(neos);
  }

  $: if (softwareController && neos) {
    softwareController.updateNeos(getSoftwareNeos(neos));
  }

  $: if (sceneController || softwareController) {
    const earthSettings = {
      theme: earthTheme,
      pattern: earthPattern,
      land: landColor,
      fluid: fluidColor,
      atmosphere: atmosphereColor,
      atmosphereEnabled,
      landmass: landmassConfig
    };
    sceneController?.updateEarth(earthSettings);
    softwareController?.updateEarth(earthSettings);
  }

  onMount(() => {
    let cancelled = false;
    let cleanup = () => {};

    if (softwareCanvas) {
      softwareController = createSoftwareScene(softwareCanvas);
      softwareController.resize(
        Math.max(softwareCanvas.clientWidth, 240),
        Math.max(softwareCanvas.clientHeight, 240),
        Math.min(window.devicePixelRatio || 1, 1)
      );
      softwareController.setView(fallbackView);
      softwareController.updateEarth({
        theme: earthTheme,
        pattern: earthPattern,
        land: landColor,
        fluid: fluidColor,
        atmosphere: atmosphereColor,
        atmosphereEnabled,
        landmass: landmassConfig
      });
      softwareController.updateNeos(getSoftwareNeos(neos));
      softwareController.render();
    }

    Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js")
    ]).then(([THREE, { OrbitControls }]) => {
      if (cancelled || !canvas) return;

      let palette = THEMES[earthTheme] || THEMES.aqua;
      const scene = new THREE.Scene();
      // The Sun is intentionally out of this product view for now. Keep the
      // frustum tight enough for the Earth, Moon and NEO presentation rig.
      const cameraDirection = new THREE.Vector3(0, 8, 74).normalize();
      const defaultCameraDistance = Math.sqrt(8 * 8 + 74 * 74);
      const maxCameraDistance = defaultCameraDistance * ZOOM_MAX_MULTIPLIER;
      const defaultFov = 33;
      const maxFov = 92;
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const idlePixelRatio = Math.min(devicePixelRatio, 1.5);
      const interactionPixelRatio = Math.min(devicePixelRatio, 1);
      let cameraDistance = defaultCameraDistance;
      const cameraFar = maxCameraDistance + MOON_ORBIT_RADIUS + EARTH_RADIUS_SCENE * 4;
      const camera = new THREE.PerspectiveCamera(33, 1, 0.1, cameraFar);
      const renderer = new THREE.WebGLRenderer({
        canvas,
        // Keep the space backdrop compositable with the CSS safety layer.
        // Supported browsers still see the Three.js scene above it; browsers
        // that drop WebGL pixels retain a visible orbital presentation.
        alpha: true,
        antialias: devicePixelRatio <= 1.25,
        powerPreference: "high-performance"
      });
      renderer.debug.checkShaderErrors = import.meta.env.DEV;
      renderer.setClearColor(0x050612, 0);
      renderStatus = "WEBGL READY";
      renderer.setPixelRatio(idlePixelRatio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      camera.position.copy(cameraDirection).multiplyScalar(defaultCameraDistance);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableRotate = true;
      controls.screenSpacePanning = false;
      controls.rotateSpeed = 0.58;
      controls.zoomSpeed = 0.78;
      controls.minDistance = defaultCameraDistance * ZOOM_MIN_MULTIPLIER;
      controls.maxDistance = maxCameraDistance;
      controls.minPolarAngle = Math.PI * 0.05;
      controls.maxPolarAngle = Math.PI * 0.95;
      controls.update();

      function syncFallbackView() {
        if (!softwareFallbackActive) return;
        const width = Math.max(canvas.clientWidth, 240);
        const height = Math.max(canvas.clientHeight, 240);
        const target = {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z
        };
        const cameraPosition = {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z
        };
        fallbackView = {
          cameraPosition,
          target,
          fovRadians: (camera.fov * Math.PI) / 180,
          aspect: width / height,
          azimuth: controls.getAzimuthalAngle(),
          polar: controls.getPolarAngle()
        };
        softwareController?.setView(fallbackView);
        softwareController?.render();
      }

      controls.addEventListener("change", syncFallbackView);

      function setRenderQuality(isInteracting) {
        const nextPixelRatio = isInteracting ? interactionPixelRatio : idlePixelRatio;
        if (Math.abs(renderer.getPixelRatio() - nextPixelRatio) < 0.01) return;
        renderer.setPixelRatio(nextPixelRatio);
        resize();
      }

      let qualityRestoreTimer = null;
      const handleControlsStart = () => {
        if (qualityRestoreTimer) window.clearTimeout(qualityRestoreTimer);
        qualityRestoreTimer = null;
        setRenderQuality(true);
      };
      const handleControlsEnd = () => {
        if (qualityRestoreTimer) window.clearTimeout(qualityRestoreTimer);
        qualityRestoreTimer = window.setTimeout(() => {
          qualityRestoreTimer = null;
          setRenderQuality(false);
        }, 180);
      };
      controls.addEventListener("start", handleControlsStart);
      controls.addEventListener("end", handleControlsEnd);
      syncFallbackView();

      const earthFrame = new THREE.Group();
      scene.add(earthFrame);
      const ambient = new THREE.AmbientLight(0x7ca6ff, 0.42);
      const hemisphere = new THREE.HemisphereLight(0x8abaff, 0x02030b, 0.48);
      const keyLight = new THREE.PointLight(0xffffff, 3.2, 160);
      keyLight.position.set(-34, 24, 42);
      const rimLight = new THREE.DirectionalLight(0x6a8bff, 0.65);
      rimLight.position.set(30, -18, -42);
      scene.add(ambient, hemisphere, rimLight);
      earthFrame.add(keyLight);

      const starPositions = [];
      const starColors = [];
      let starSeed = 0x9e3779b9;
      const nextStarRandom = () => {
        starSeed = (starSeed * 1664525 + 1013904223) >>> 0;
        return starSeed / 4294967296;
      };
      for (let index = 0; index < 720; index += 1) {
        const radius = 260 + nextStarRandom() * 360;
        const theta = nextStarRandom() * Math.PI * 2;
        const phi = Math.acos(2 * nextStarRandom() - 1);
        const sinPhi = Math.sin(phi);
        starPositions.push(
          sinPhi * Math.cos(theta) * radius,
          Math.cos(phi) * radius,
          sinPhi * Math.sin(theta) * radius
        );
        const warmth = nextStarRandom();
        starColors.push(0.72 + warmth * 0.28, 0.78 + (1 - warmth) * 0.22, 0.96 + nextStarRandom() * 0.04);
      }
      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(starPositions, 3)
      );
      starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));
      const starMaterial = new THREE.PointsMaterial({
        size: 1.35,
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        sizeAttenuation: false,
        depthWrite: false
      });
      const stars = new THREE.Points(starGeometry, starMaterial);
      stars.frustumCulled = false;
      const starField = new THREE.Group();
      starField.add(stars);
      scene.add(starField);

      const earthGroup = new THREE.Group();
      const earthMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: palette.emissive,
        emissiveIntensity: 0.14,
        roughness: 0.84,
        metalness: 0.02
      });
      let earthTexture = createEarthTexture(
        THREE,
        landColor,
        fluidColor,
        landmassConfig
      );
      earthMaterial.map = earthTexture;
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS_SCENE, 48, 32),
        earthMaterial
      );
      earthGroup.add(earth);

      const gridMaterial = new THREE.LineBasicMaterial({
        color: palette.grid,
        transparent: true,
        opacity: 0.3
      });
      const grid = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.01, 24, 16)),
        gridMaterial
      );
      earthGroup.add(grid);

      const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: atmosphereColor,
        transparent: true,
        opacity: atmosphereEnabled ? 0.14 : 0,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
      });
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.067, 32, 20),
        atmosphereMaterial
      );
      atmosphere.visible = atmosphereEnabled;
      earthGroup.add(atmosphere);
      earthFrame.add(earthGroup);

      const moonPivot = new THREE.Group();
      let moonTexture = createMoonTexture(THREE);
      const moonMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaa7b3,
        map: moonTexture,
        roughness: 1
      });
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(MOON_RADIUS_SCENE, 24, 16),
        moonMaterial
      );
      moon.position.set(MOON_ORBIT_RADIUS, 0, 0);
      moonPivot.add(moon);
      earthFrame.add(moonPivot);

      const orbitGroup = new THREE.Group();
      const asteroidGroup = new THREE.Group();
      const moonOrbitGroup = new THREE.Group();
      earthFrame.add(orbitGroup, asteroidGroup, moonOrbitGroup);
      const asteroidObjects = [];

      function createOrbitLine(radius, color, inclination, opacity = 0.42, orbit = null) {
        const points = [];
        for (let index = 0; index < 80; index += 1) {
          const angle = (index / 80) * Math.PI * 2;
          const position = getNeoOrbitPosition(
            { radius, inclination, orbit, phase: angle },
            angle
          );
          points.push(
            new THREE.Vector3(position.x, position.y, position.z)
          );
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return new THREE.LineLoop(
          geometry,
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity
          })
        );
      }

      moonOrbitGroup.add(createOrbitLine(MOON_ORBIT_RADIUS, palette.moonOrbit, 0.12, 0.2));

      function createEarthTexture(Engine, land, fluid, config) {
        const map = createEarthSurfaceMap(
          384,
          192,
          { land, fluid, landmass: config }
        );
        const texture = new Engine.DataTexture(
          map.pixels,
          map.width,
          map.height,
          Engine.RGBAFormat,
          Engine.UnsignedByteType
        );
        texture.colorSpace = Engine.SRGBColorSpace;
        texture.flipY = true;
        texture.wrapS = Engine.RepeatWrapping;
        texture.wrapT = Engine.ClampToEdgeWrapping;
        texture.minFilter = Engine.LinearFilter;
        texture.magFilter = Engine.LinearFilter;
        texture.needsUpdate = true;
        return texture;
      }

      function createMoonTexture(Engine) {
        const map = createMoonSurfaceMap(256, 128);
        const texture = new Engine.DataTexture(
          map.pixels,
          map.width,
          map.height,
          Engine.RGBAFormat,
          Engine.UnsignedByteType
        );
        texture.colorSpace = Engine.SRGBColorSpace;
        texture.flipY = true;
        texture.minFilter = Engine.NearestFilter;
        texture.magFilter = Engine.NearestFilter;
        texture.needsUpdate = true;
        return texture;
      }

      function disposeGroup(group) {
        while (group.children.length) {
          const child = group.children.pop();
          child.traverse((object) => {
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
      }

      function updateNeos(nextNeos) {
        disposeGroup(orbitGroup);
        disposeGroup(asteroidGroup);
        asteroidObjects.length = 0;
        clearNeoHover();

        nextNeos.slice(0, 8).forEach((neo, index) => {
          const metrics = getSceneMetrics(neo, index);
          const appearance = metrics.appearance;
          const asteroidMaterial = new THREE.MeshStandardMaterial({
            color: appearance.materialColor,
            roughness: appearance.roughness,
            metalness: appearance.metalness,
            vertexColors: true,
            flatShading: true
          });
          const asteroid = new THREE.Mesh(
            createAsteroidGeometry(THREE, metrics.size, appearance),
            asteroidMaterial
          );
          const halo = new THREE.Mesh(
            new THREE.IcosahedronGeometry(metrics.size * 1.5, 1),
            new THREE.MeshBasicMaterial({
              color: appearance.materialColor,
              wireframe: true,
              transparent: true,
              opacity: 0.1
            })
          );
          // Keep the visible polygon crisp while giving pointer picking a
          // forgiving target at the tiny screen sizes used for real NEOs.
          const pickProxy = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(metrics.size * 2.4, 0.9), 8, 6),
            new THREE.MeshBasicMaterial({
              transparent: true,
              opacity: 0,
              depthWrite: false
            })
          );
          const object = new THREE.Group();
          object.add(asteroid, halo, pickProxy);
          object.userData = {
            id: neo?.id ?? neo?.name ?? `neo-${index}`,
            neo,
            radius: metrics.radius,
            speed: metrics.speed,
            phase: metrics.phase,
            inclination: metrics.inclination,
            orbit: metrics.orbit,
            spin: appearance.spin,
            spinAxis: new THREE.Vector3(...appearance.spinAxis).normalize()
          };
          asteroidGroup.add(object);
          orbitGroup.add(
            createOrbitLine(
              metrics.radius,
              palette.orbit,
              metrics.inclination,
              0.42,
              metrics.orbit
            )
          );
          asteroidObjects.push(object);
        });
      }

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let pointerDown = null;
      let pointerMoved = false;

      function getPointerHit(event) {
        const bounds = canvas.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return null;
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(asteroidObjects, true)[0];
        if (!hit) return null;
        let object = hit.object;
        while (object && !object.userData?.neo) object = object.parent;
        return object?.userData?.neo ? { neo: object.userData.neo, object } : null;
      }

      function clearNeoHover() {
        if (!hoveredNeo) return;
        hoveredNeo = null;
        dispatch("neoHover", null);
      }

      function updateNeoHover(event) {
        const hit = getPointerHit(event);
        if (!hit) {
          clearNeoHover();
          return;
        }
        const bounds = canvas.getBoundingClientRect();
        const worldPosition = new THREE.Vector3();
        hit.object.getWorldPosition(worldPosition);
        worldPosition.project(camera);
        hoveredNeo = hit.neo;
        hoverPosition = {
          x: (worldPosition.x * 0.5 + 0.5) * bounds.width,
          y: (-worldPosition.y * 0.5 + 0.5) * bounds.height
        };
        dispatch("neoHover", hit.neo);
      }

      const handlePointerDown = (event) => {
        pointerDown = { x: event.clientX, y: event.clientY };
        pointerMoved = false;
      };
      const handlePointerMove = (event) => {
        if (pointerDown) {
          const distance = Math.hypot(
            event.clientX - pointerDown.x,
            event.clientY - pointerDown.y
          );
          if (distance > 5) {
            pointerMoved = true;
            clearNeoHover();
            return;
          }
        }
        if (!pointerDown || event.buttons === 0) updateNeoHover(event);
      };
      const handlePointerUp = (event) => {
        const wasClick = !pointerMoved;
        pointerDown = null;
        pointerMoved = false;
        if (!wasClick) return;
        const hit = getPointerHit(event);
        if (hit) dispatch("neoSelect", hit.neo);
      };
      const handlePointerLeave = () => {
        pointerDown = null;
        pointerMoved = false;
        clearNeoHover();
      };
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointerleave", handlePointerLeave);

      function updateEarth(next) {
        palette = THEMES[next.theme] || THEMES.aqua;
        gridMaterial.color.setHex(palette.grid);
        earthMaterial.emissive.setHex(palette.emissive);
        atmosphereMaterial.color.set(next.atmosphere || "#61e7ff");
        atmosphere.visible = Boolean(next.atmosphereEnabled);
        atmosphereMaterial.opacity = next.atmosphereEnabled ? 0.14 : 0;
        moonOrbitGroup.children.forEach((line) => {
          if (line.material?.color) line.material.color.setHex(palette.moonOrbit);
        });
        orbitGroup.children.forEach((line) => {
          if (line.material?.color) line.material.color.setHex(palette.orbit);
        });
        const nextTexture = createEarthTexture(
          THREE,
          next.land,
          next.fluid,
          next.landmass
        );
        earthMaterial.map = nextTexture;
        earthMaterial.needsUpdate = true;
        if (earthTexture) earthTexture.dispose();
        earthTexture = nextTexture;
      }

      function setTargetCameraDistance(nextDistance) {
        const nextCameraDistance = clampCameraDistance(nextDistance, defaultCameraDistance);
        const offset = camera.position.clone().sub(controls.target);
        if (offset.lengthSq() === 0) return;
        offset.setLength(nextCameraDistance);
        camera.position.copy(controls.target).add(offset);
        controls.update();
        applyCamera();
      }

      function zoomBy(direction) {
        if (!direction) return;
        setTargetCameraDistance(
          controls.getDistance() * (direction > 0 ? 0.88 : 1.12)
        );
      }

      function applyCamera() {
        controls.update();
        cameraDistance = clampCameraDistance(controls.getDistance(), defaultCameraDistance);
        const zoomProgress = Math.max(
          0,
          (cameraDistance - defaultCameraDistance) /
            (maxCameraDistance - defaultCameraDistance)
        );
        const nextFov = defaultFov + (maxFov - defaultFov) * zoomProgress;
        if (Math.abs(camera.fov - nextFov) > 0.01) {
          camera.fov = nextFov;
          camera.updateProjectionMatrix();
        }
        zoomScale = getZoomScale(cameraDistance, defaultCameraDistance);
        syncFallbackView();
      }

      function resize() {
        const width = Math.max(canvas.clientWidth, 240);
        const height = Math.max(canvas.clientHeight, 240);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        softwareController?.resize(width, height, Math.min(window.devicePixelRatio || 1, 1));
        syncFallbackView();
      }

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement || canvas);
      resize();

      const handleContextLost = (event) => {
        event.preventDefault();
        setSoftwareFallbackActive(true);
        renderStatus = "CONTEXT LOST";
        renderError = "WEBGL CONTEXT LOST";
        syncFallbackView();
      };
      const handleContextRestored = () => {
        setSoftwareFallbackActive(false);
        renderStatus = "WEBGL READY";
        renderError = "";
      };
      canvas.addEventListener("webglcontextlost", handleContextLost, false);
      canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
      sceneController = { updateNeos, updateEarth, zoomBy };
      updateNeos(neos);
      updateEarth({
        theme: earthTheme,
        pattern: earthPattern,
          land: landColor,
          fluid: fluidColor,
          atmosphere: atmosphereColor,
          atmosphereEnabled,
          landmass: landmassConfig
      });

      let moonOrbitPhase = 0;
      let previousTime = performance.now();
      applyCamera();

      let frame;
      let renderedFrames = 0;
      const softwareNeoPhases = Object.create(null);

      function renderScene() {
        try {
          renderer.render(scene, camera);
          renderedFrames += 1;
          if (renderedFrames === 1) {
            renderStatus = "LIVE";
            setSoftwareFallbackActive(false);
          }
        } catch (error) {
          setSoftwareFallbackActive(true);
          renderStatus = "RENDER ERROR";
          renderError = "ORBITAL DISPLAY OFFLINE";
          console.error("NEO Finder orbital renderer failed to draw", error);
          syncFallbackView();
          if (frame) cancelAnimationFrame(frame);
        }
      }

      // Draw once immediately so the scene is visible even if the browser
      // temporarily throttles requestAnimationFrame in a background tab.
      renderScene();

      function animate(timestamp) {
        frame = requestAnimationFrame(animate);
        const delta = Math.min((timestamp - previousTime) / 1000, 0.1);
        previousTime = timestamp;
        const simulatedDays = delta * SIMULATED_DAYS_PER_SECOND;
        moonOrbitPhase =
          (moonOrbitPhase + (simulatedDays * Math.PI * 2) / MOON_ORBIT_PERIOD_DAYS) %
          (Math.PI * 2);
        moonPivot.rotation.y = moonOrbitPhase;
        applyCamera(delta);

        earthRotation += delta * 0.12;
        earth.rotation.y = earthRotation;
        grid.rotation.y += delta * 0.12;
        atmosphere.rotation.y -= delta * 0.036;
        starField.rotation.y += delta * 0.0072;

        asteroidObjects.forEach((object) => {
          object.userData.phase += delta * NEO_ORBIT_PHASE_RATE * object.userData.speed;
          const position = getNeoOrbitPosition(object.userData, object.userData.phase);
          object.position.set(position.x, position.y, position.z);
          object.rotateOnAxis(object.userData.spinAxis, object.userData.spin * delta * 60);
          softwareNeoPhases[object.userData.id] = object.userData.phase;
        });
        if (softwareFallbackActive) {
          softwareController?.setMotion({
            moonPhase: moonOrbitPhase,
            neoPhases: softwareNeoPhases,
            earthRotation
          }, zoomScale);
          softwareController?.render();
        }
        renderScene();
      }
      animate(previousTime);

      cleanup = () => {
        cancelAnimationFrame(frame);
        if (qualityRestoreTimer) window.clearTimeout(qualityRestoreTimer);
        resizeObserver.disconnect();
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        controls.removeEventListener("change", syncFallbackView);
        controls.removeEventListener("start", handleControlsStart);
        controls.removeEventListener("end", handleControlsEnd);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointerleave", handlePointerLeave);
        clearNeoHover();
        controls.dispose();
        disposeGroup(orbitGroup);
        disposeGroup(asteroidGroup);
        disposeGroup(moonOrbitGroup);
        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        });
        if (earthTexture) earthTexture.dispose();
        if (moonTexture) moonTexture.dispose();
        renderer.dispose();
        sceneController = null;
        softwareController?.dispose();
        softwareController = null;
      };
    }).catch((error) => {
      if (cancelled) return;
      renderError = "ORBITAL DISPLAY OFFLINE";
      console.error("NEO Finder orbital renderer failed to initialise", error);
    });

    return () => {
      cancelled = true;
      cleanup();
      softwareController?.dispose();
      softwareController = null;
    };
  });
</script>

<div
  class="scene-shell"
  class:compact={compact}
  role="group"
  aria-label="Animated Earth with saved near Earth objects in orbit"
  data-render-status={renderStatus}
>
  <canvas
    bind:this={softwareCanvas}
    class="software-canvas"
    class:softwareIdle={!softwareFallbackActive}
    aria-hidden="true"
    data-renderer="software-3d"
  ></canvas>
  <canvas bind:this={canvas} class="webgl-canvas" aria-hidden="true"></canvas>
  <div class="scene-vignette"></div>
  {#if hoveredNeo}
    <div
      class="neo-hover-label"
      role="tooltip"
      style={`left: ${hoverPosition.x}px; top: ${hoverPosition.y}px;`}
    >
      <span>NEO // SELECT TO LOG</span>
      <strong>{hoveredNeo.name}</strong>
    </div>
  {/if}
  {#if renderError}
    <div class="scene-error" role="status">
      <strong>{renderError}</strong>
      <span>Reload the orbital display to reconnect the renderer.</span>
    </div>
  {/if}
  {#if !compact}
    <div class="scene-zoom-controls" aria-label="Earth zoom controls">
      <span>DISTANCE {zoomScale.toFixed(1)}×</span>
      <button aria-label="Zoom in" on:click={() => sceneController?.zoomBy(1)}>+</button>
      <button aria-label="Zoom out" on:click={() => sceneController?.zoomBy(-1)}>−</button>
    </div>
  <div class="scene-key"><span class="moon-key"></span>MOON // 1 LD // TIDALLY LOCKED // DRAG TO ORBIT // SCROLL TO ZOOM</div>
  {/if}
</div>

<style>
  .scene-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 340px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 48%, rgba(29, 54, 115, 0.32), transparent 44%),
      #050612;
  }

  .scene-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.72;
    background:
      radial-gradient(circle at 8% 17%, rgba(255, 255, 255, 0.9) 0 1px, transparent 1.5px),
      radial-gradient(circle at 22% 74%, rgba(158, 219, 255, 0.78) 0 1px, transparent 1.6px),
      radial-gradient(circle at 37% 28%, rgba(255, 255, 255, 0.66) 0 1px, transparent 1.4px),
      radial-gradient(circle at 53% 83%, rgba(255, 98, 210, 0.72) 0 1px, transparent 1.5px),
      radial-gradient(circle at 67% 16%, rgba(255, 255, 255, 0.86) 0 1px, transparent 1.5px),
      radial-gradient(circle at 82% 61%, rgba(158, 219, 255, 0.75) 0 1px, transparent 1.6px),
      radial-gradient(circle at 93% 34%, rgba(255, 255, 255, 0.8) 0 1px, transparent 1.5px),
      radial-gradient(circle at 14% 45%, rgba(255, 255, 255, 0.48) 0 1px, transparent 1.4px),
      radial-gradient(circle at 74% 88%, rgba(255, 255, 255, 0.56) 0 1px, transparent 1.4px);
  }

  .scene-shell.compact {
    min-height: 0;
  }

  canvas {
    display: block;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 340px;
  }

  .scene-shell.compact canvas {
    min-height: 0;
  }

  .webgl-canvas {
    z-index: 3;
    image-rendering: auto;
    cursor: grab;
  }

  .webgl-canvas:active {
    cursor: grabbing;
  }

  .software-canvas {
    z-index: 2;
    pointer-events: none;
    image-rendering: auto;
  }

  .software-canvas.softwareIdle {
    visibility: hidden;
  }

  .scene-vignette {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(4, 5, 18, 0.55), transparent 18%, transparent 82%, rgba(4, 5, 18, 0.55)),
      linear-gradient(0deg, rgba(4, 5, 18, 0.5), transparent 18%, transparent 82%, rgba(4, 5, 18, 0.42));
  }

  .neo-hover-label {
    position: absolute;
    z-index: 5;
    display: grid;
    gap: 0.18rem;
    min-width: 9rem;
    padding: 0.45rem 0.58rem;
    transform: translate(0.55rem, -50%);
    border: 1px solid rgba(97, 231, 255, 0.68);
    background: rgba(5, 6, 18, 0.9);
    box-shadow: 4px 4px 0 rgba(2, 3, 12, 0.4);
    pointer-events: none;
  }

  .neo-hover-label span {
    color: var(--cyan);
    font-size: 0.46rem;
    letter-spacing: 0.1em;
  }

  .neo-hover-label strong {
    color: #f0efff;
    font-family: Arcade, monospace;
    font-size: 0.62rem;
    font-weight: 400;
  }

  .scene-error {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 4;
    display: grid;
    gap: 0.4rem;
    width: min(82%, 22rem);
    padding: 1rem;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(255, 126, 196, 0.5);
    background: rgba(5, 6, 18, 0.9);
    color: rgba(224, 223, 247, 0.8);
    text-align: center;
    font-size: 0.58rem;
    letter-spacing: 0.06em;
  }

  .scene-error strong {
    color: var(--pink);
    font-size: 0.72rem;
  }

  .scene-zoom-controls {
    position: absolute;
    z-index: 3;
    top: 0.8rem;
    left: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: rgba(224, 223, 247, 0.66);
    font-size: 0.5rem;
    letter-spacing: 0.08em;
  }

  .scene-zoom-controls button {
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    place-items: center;
    border: 1px solid rgba(97, 231, 255, 0.45);
    background: rgba(5, 6, 18, 0.72);
    color: var(--cyan);
    font-size: 0.85rem;
    line-height: 1;
  }

  .scene-zoom-controls button:hover {
    border-color: var(--pink);
    color: var(--pink);
  }

  .scene-key {
    position: absolute;
    z-index: 4;
    right: 0.9rem;
    bottom: 2.45rem;
    left: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 0.35rem;
    color: rgba(224, 223, 247, 0.5);
    font-size: 0.5rem;
    letter-spacing: 0.08em;
    pointer-events: none;
  }

  .scene-key span {
    display: inline-block;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
  }

  .moon-key {
    margin-left: 0.55rem;
    background: #aaa7b3;
    box-shadow: 0 0 7px #aaa7b3;
  }
</style>
