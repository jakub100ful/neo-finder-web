<script>
import { onMount } from "svelte";
import { getSceneMetrics } from "./neo.js";
import { generateLandmassMap } from "./landmass.js";
  import {
    EARTH_RADIUS_SCENE,
    MOON_ORBIT_PERIOD_DAYS,
    MOON_ORBIT_RADIUS,
    MOON_RADIUS_SCENE,
    NEO_ORBIT_PHASE_RATE,
    SIMULATED_DAYS_PER_SECOND,
    clampCameraDistance,
    getNeoOrbitPosition,
    getZoomScale
  } from "./orbit-model.mjs";

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
  let sceneController = null;
  let renderError = "";
  let renderStatus = "INITIALISING";
  let fallbackNeos = [];
  let fallbackTexture = "";
  $: fallbackMapStyle = fallbackTexture ? `url("${fallbackTexture}")` : "var(--fallback-fluid)";

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

  function colorToCss(value, fallback = "#8d8aa4") {
    return typeof value === "number" && Number.isFinite(value)
      ? `#${value.toString(16).padStart(6, "0")}`
      : fallback;
  }

  $: fallbackNeos = (neos || []).slice(0, 8).map((neo, index) => {
    const metrics = getSceneMetrics(neo, index);
    const speed = Math.max(metrics.speed, 0.01);
    return {
      id: neo?.id ?? neo?.name ?? `neo-${index}`,
      // Keep the DOM safety-net asteroids outside the Earth silhouette so a
      // compositor that drops WebGL still shows the objects in orbit.
      orbitRadius: Math.round(176 + metrics.radius * 1.8),
      size: Math.max(9, Math.min(34, Math.round(metrics.size * 3.8))),
      color: colorToCss(metrics.appearance.materialColor),
      shape: metrics.appearance.shape,
      duration: (2 * Math.PI / (NEO_ORBIT_PHASE_RATE * speed)).toFixed(2),
      delay: (-metrics.phase / (NEO_ORBIT_PHASE_RATE * speed)).toFixed(2)
    };
  });

  $: if (sceneController && neos) {
    sceneController.updateNeos(neos);
  }

  $: if (sceneController) {
    sceneController.updateEarth({
      theme: earthTheme,
      pattern: earthPattern,
      land: landColor,
      fluid: fluidColor,
      atmosphere: atmosphereColor,
      atmosphereEnabled,
      landmass: landmassConfig
    });
  }

  onMount(() => {
    let cancelled = false;
    let cleanup = () => {};

    import("three").then((THREE) => {
      if (cancelled || !canvas) return;

      let palette = THEMES[earthTheme] || THEMES.aqua;
      const scene = new THREE.Scene();
      // The Sun is intentionally out of this product view for now. Keep the
      // frustum tight enough for the Earth, Moon and NEO presentation rig.
      const camera = new THREE.PerspectiveCamera(33, 1, 0.1, MOON_ORBIT_RADIUS * 1.6);
      const renderer = new THREE.WebGLRenderer({
        canvas,
        // An opaque drawing buffer is important here: it makes the WebGL
        // canvas the authoritative visual surface instead of relying on a
        // transparent compositor layer.
        alpha: false,
        antialias: false,
        powerPreference: "high-performance"
      });
      renderer.debug.checkShaderErrors = true;
      renderer.setClearColor(0x050612, 1);
      renderStatus = "WEBGL READY";
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const cameraDirection = new THREE.Vector3(0, 8, 74).normalize();
      const defaultCameraDistance = Math.sqrt(8 * 8 + 74 * 74);
      const maxCameraDistance = defaultCameraDistance * 10;
      const defaultFov = 33;
      const maxFov = 92;
      let cameraDistance = defaultCameraDistance;
      let targetCameraDistance = defaultCameraDistance;

      const earthFrame = new THREE.Group();
      scene.add(earthFrame);
      const ambient = new THREE.AmbientLight(0x7ca6ff, 1.4);
      const keyLight = new THREE.PointLight(0xffffff, 2.4, 160);
      keyLight.position.set(-34, 24, 42);
      const rimLight = new THREE.DirectionalLight(0x6a8bff, 0.65);
      rimLight.position.set(30, -18, -42);
      scene.add(ambient, rimLight);
      earthFrame.add(keyLight);

      const starPositions = [];
      for (let index = 0; index < 460; index += 1) {
        const radius = 44 + Math.random() * 60;
        const theta = Math.random() * Math.PI * 2;
        const height = (Math.random() - 0.5) * 92;
        starPositions.push(
          Math.cos(theta) * radius,
          height,
          Math.sin(theta) * radius
        );
      }
      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(starPositions, 3)
      );
      const starMaterial = new THREE.PointsMaterial({
        color: 0x9edbff,
        size: 0.28,
        transparent: true,
        opacity: 0.75,
        sizeAttenuation: true
      });
      const stars = new THREE.Points(starGeometry, starMaterial);
      earthFrame.add(stars);

      const earthGroup = new THREE.Group();
      const earthMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: palette.emissive,
        emissiveIntensity: 0.34,
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
        new THREE.SphereGeometry(EARTH_RADIUS_SCENE, 24, 16),
        earthMaterial
      );
      earthGroup.add(earth);

      const gridMaterial = new THREE.LineBasicMaterial({
        color: palette.grid,
        transparent: true,
        opacity: 0.3
      });
      const grid = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.01, 12, 8)),
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
        new THREE.SphereGeometry(EARTH_RADIUS_SCENE * 1.067, 20, 12),
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
        roughness: 1,
        flatShading: true
      });
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(MOON_RADIUS_SCENE, 16, 10),
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

      function createOrbitLine(radius, color, inclination, opacity = 0.42) {
        const points = [];
        for (let index = 0; index < 80; index += 1) {
          const angle = (index / 80) * Math.PI * 2;
          points.push(
            new THREE.Vector3(
              Math.cos(angle) * radius,
              Math.sin(angle) * radius * inclination,
              Math.sin(angle) * radius
            )
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
        const mapCanvas = document.createElement("canvas");
        mapCanvas.width = 384;
        mapCanvas.height = 192;
        const context = mapCanvas.getContext("2d");
        if (!context) throw new Error("2D canvas context unavailable for Earth texture");

        const map = generateLandmassMap(
          mapCanvas.width,
          mapCanvas.height,
          config
        );
        const landRgb = new Engine.Color(land || "#68df9f");
        const fluidRgb = new Engine.Color(fluid || "#0c89c7");
        const image = context.createImageData(map.width, map.height);
        const shade = (value, brightness) =>
          Math.max(0, Math.min(255, Math.round(value * 255 * brightness)));

        for (let y = 0; y < map.height; y += 1) {
          for (let x = 0; x < map.width; x += 1) {
            const index = y * map.width + x;
            const offset = index * 4;
            const isLand = map.mask[index] === 1;
            const base = isLand ? landRgb : fluidRgb;
            const brightness = isLand
              ? 0.82 + map.values[index] * 0.34
              : 0.78 + map.values[index] * 0.16;
            image.data[offset] = shade(base.r, brightness);
            image.data[offset + 1] = shade(base.g, brightness);
            image.data[offset + 2] = shade(base.b, brightness);
            image.data[offset + 3] = 255;
          }
        }

        context.putImageData(image, 0, 0);
        const texture = new Engine.CanvasTexture(mapCanvas);
        texture.colorSpace = Engine.SRGBColorSpace;
        texture.wrapS = Engine.RepeatWrapping;
        texture.wrapT = Engine.ClampToEdgeWrapping;
        texture.minFilter = Engine.LinearFilter;
        texture.magFilter = Engine.LinearFilter;
        fallbackTexture = mapCanvas.toDataURL("image/png");
        return texture;
      }

      function createMoonTexture(Engine) {
        const moonCanvas = document.createElement("canvas");
        moonCanvas.width = 256;
        moonCanvas.height = 128;
        const context = moonCanvas.getContext("2d");
        if (!context) throw new Error("2D canvas context unavailable for Moon texture");
        context.fillStyle = "#777784";
        context.fillRect(0, 0, moonCanvas.width, moonCanvas.height);

        context.fillStyle = "rgba(202, 199, 207, 0.2)";
        [
          [0.18, 0.29, 0.18, 0.2],
          [0.63, 0.66, 0.25, 0.22],
          [0.82, 0.25, 0.13, 0.13],
          [0.39, 0.78, 0.19, 0.16]
        ].forEach(([x, y, width, height]) => {
          context.beginPath();
          context.ellipse(
            x * moonCanvas.width,
            y * moonCanvas.height,
            width * moonCanvas.width,
            height * moonCanvas.height,
            0,
            0,
            Math.PI * 2
          );
          context.fill();
        });

        const craters = [
          [0.08, 0.2, 0.028], [0.2, 0.52, 0.052], [0.31, 0.19, 0.034],
          [0.37, 0.53, 0.075], [0.49, 0.31, 0.043], [0.58, 0.84, 0.035],
          [0.69, 0.42, 0.06], [0.77, 0.78, 0.04], [0.91, 0.56, 0.07],
          [0.97, 0.15, 0.025], [0.53, 0.08, 0.02]
        ];
        craters.forEach(([x, y, radius], index) => {
          const pixelX = x * moonCanvas.width;
          const pixelY = y * moonCanvas.height;
          const pixelRadius = radius * moonCanvas.width;
          context.fillStyle = index % 2 ? "rgba(46, 46, 59, 0.42)" : "rgba(38, 38, 50, 0.32)";
          context.beginPath();
          context.ellipse(pixelX, pixelY, pixelRadius, pixelRadius * 0.72, 0, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "rgba(211, 208, 215, 0.3)";
          context.lineWidth = Math.max(1, pixelRadius * 0.14);
          context.beginPath();
          context.ellipse(pixelX - pixelRadius * 0.08, pixelY - pixelRadius * 0.06, pixelRadius * 0.78, pixelRadius * 0.55, 0, 0, Math.PI * 2);
          context.stroke();
        });

        context.fillStyle = "rgba(240, 238, 235, 0.12)";
        for (let index = 0; index < 180; index += 1) {
          const x = (index * 47) % moonCanvas.width;
          const y = (index * 29) % moonCanvas.height;
          context.fillRect(x, y, 1, 1);
        }

        const texture = new Engine.CanvasTexture(moonCanvas);
        texture.colorSpace = Engine.SRGBColorSpace;
        texture.minFilter = Engine.NearestFilter;
        texture.magFilter = Engine.NearestFilter;
        return texture;
      }

      function createAsteroidGeometry(Engine, size, appearance) {
        let geometry;
        if (appearance.shape === "angular") {
          geometry = new Engine.OctahedronGeometry(size, 1);
        } else if (appearance.shape === "metallic") {
          geometry = new Engine.DodecahedronGeometry(size, 1);
        } else {
          geometry = new Engine.IcosahedronGeometry(size, 1);
        }

        if (appearance.shape === "elongated") geometry.scale(1.45, 0.76, 0.9);
        if (appearance.shape === "cratered") geometry.scale(1.12, 0.86, 1.08);

        const positions = geometry.attributes.position;
        for (let index = 0; index < positions.count; index += 1) {
          const jitter = 0.78 + (((appearance.seed + index * 31) % 100) / 100) * 0.35;
          positions.setXYZ(
            index,
            positions.getX(index) * jitter,
            positions.getY(index) * (0.88 + (appearance.seed % 17) / 100),
            positions.getZ(index) * jitter
          );
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        return geometry;
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

        nextNeos.slice(0, 8).forEach((neo, index) => {
          const metrics = getSceneMetrics(neo, index);
          const appearance = metrics.appearance;
          const asteroidMaterial = new THREE.MeshStandardMaterial({
            color: appearance.materialColor,
            roughness: appearance.roughness,
            metalness: appearance.shape === "metallic" ? 0.55 : 0.02,
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
          const object = new THREE.Group();
          object.add(asteroid, halo);
          object.userData = {
            radius: metrics.radius,
            speed: metrics.speed,
            phase: metrics.phase,
            inclination: metrics.inclination,
            spin: appearance.spin
          };
          asteroidGroup.add(object);
          orbitGroup.add(
            createOrbitLine(metrics.radius, palette.orbit, metrics.inclination)
          );
          asteroidObjects.push(object);
        });
      }

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
        targetCameraDistance = clampCameraDistance(nextDistance, defaultCameraDistance);
        zoomScale = getZoomScale(targetCameraDistance, defaultCameraDistance);
      }

      function zoomBy(direction) {
        if (!direction) return;
        setTargetCameraDistance(
          targetCameraDistance * (direction > 0 ? 0.88 : 1.12)
        );
      }

      function handleWheel(event) {
        event.preventDefault();
        zoomBy(event.deltaY > 0 ? -1 : 1);
      }

      function applyCamera(delta) {
        cameraDistance += (targetCameraDistance - cameraDistance) * Math.min(1, delta * 8);
        const zoomProgress = Math.max(
          0,
          (cameraDistance - defaultCameraDistance) /
            (maxCameraDistance - defaultCameraDistance)
        );
        camera.fov = defaultFov + (maxFov - defaultFov) * zoomProgress;
        camera.position
          .copy(cameraDirection)
          .multiplyScalar(cameraDistance);
        camera.lookAt(0, 0, 0);
      }

      function resize() {
        const width = Math.max(canvas.clientWidth, 240);
        const height = Math.max(canvas.clientHeight, 240);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement || canvas);
      resize();

      const handleContextLost = (event) => {
        event.preventDefault();
        renderStatus = "CONTEXT LOST";
        renderError = "WEBGL CONTEXT LOST";
      };
      const handleContextRestored = () => {
        renderStatus = "WEBGL READY";
        renderError = "";
      };
      canvas.addEventListener("webglcontextlost", handleContextLost, false);
      canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
      canvas.addEventListener("wheel", handleWheel, { passive: false });
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
      applyCamera(1 / 60);

      let frame;
      let renderedFrames = 0;

      function renderScene() {
        try {
          renderer.render(scene, camera);
          renderedFrames += 1;
          if (renderedFrames === 1) renderStatus = "LIVE";
        } catch (error) {
          renderStatus = "RENDER ERROR";
          renderError = "ORBITAL DISPLAY OFFLINE";
          console.error("NEO Finder orbital renderer failed to draw", error);
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

        earth.rotation.y += delta * 0.12;
        grid.rotation.y += delta * 0.12;
        atmosphere.rotation.y -= delta * 0.036;
        stars.rotation.y += delta * 0.0072;

        asteroidObjects.forEach((object) => {
          object.userData.phase += delta * NEO_ORBIT_PHASE_RATE * object.userData.speed;
          const position = getNeoOrbitPosition(object.userData, object.userData.phase);
          object.position.set(position.x, position.y, position.z);
          object.rotation.x += object.userData.spin * delta * 60;
          object.rotation.y += object.userData.spin * delta * 72;
        });
        renderScene();
      }
      animate();

      cleanup = () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        canvas.removeEventListener("webglcontextrestored", handleContextRestored);
        canvas.removeEventListener("wheel", handleWheel);
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
      };
    }).catch((error) => {
      if (cancelled) return;
      renderError = "ORBITAL DISPLAY OFFLINE";
      console.error("NEO Finder orbital renderer failed to initialise", error);
    });

    return () => {
      cancelled = true;
      cleanup();
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
  <div
    class="scene-fallback"
    aria-hidden="true"
    data-fallback-moon="true"
    data-fallback-neo-count={fallbackNeos.length}
    style={`--fallback-fluid:${fluidColor};--fallback-land:${landColor};--fallback-atmosphere:${atmosphereColor};--fallback-map:${fallbackMapStyle};--fallback-earth-scale:${(1 / zoomScale).toFixed(2)};`}
  >
    <!--
      This compositor-safe presentation layer mirrors the live Three.js scene
      for browsers that do not composite canvas pixels into the visible page.
      The WebGL scene remains the primary renderer in capable browsers.
    -->
    <div class="fallback-moon-orbit" data-fallback-body="moon">
      <span class="fallback-moon">
        <span class="fallback-moon-crater fallback-moon-crater-one"></span>
        <span class="fallback-moon-crater fallback-moon-crater-two"></span>
        <span class="fallback-body-label">MOON</span>
      </span>
    </div>
    {#each fallbackNeos as neo (neo.id)}
      <div
        class="fallback-neo-orbit"
        data-fallback-body="neo"
        data-neo-id={neo.id}
        style={`--neo-radius:${neo.orbitRadius}px;--neo-size:${neo.size}px;--neo-color:${neo.color};--neo-duration:${neo.duration}s;--neo-delay:${neo.delay}s;`}
      >
        <span class={`fallback-neo fallback-neo-${neo.shape}`}></span>
      </div>
    {/each}
    <div class={`fallback-earth pattern-${earthPattern}`}>
      <span class="fallback-shine"></span>
    </div>
  </div>
  <canvas bind:this={canvas} class="webgl-canvas" aria-hidden="true"></canvas>
  <div class="scene-vignette"></div>
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
    <div class="scene-key"><span class="moon-key"></span>MOON // 1 LD // TIDALLY LOCKED</div>
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
    z-index: 1;
    image-rendering: auto;
  }

  .scene-fallback {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    place-items: center;
    perspective: 1100px;
    transform-style: preserve-3d;
    pointer-events: none;
  }

  .fallback-moon-orbit,
  .fallback-neo-orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border: 1px dashed rgba(158, 219, 255, 0.16);
    border-radius: 50%;
    pointer-events: none;
    transform: translate(-50%, -50%) scale(var(--fallback-earth-scale, 1));
  }

  .fallback-moon-orbit {
    z-index: 2;
    width: min(56%, 430px);
    aspect-ratio: 1;
    border-color: rgba(170, 167, 179, 0.26);
    animation: fallback-moon-orbit 27.32166s linear infinite;
  }

  .fallback-moon {
    position: absolute;
    top: 0;
    left: 50%;
    display: block;
    width: clamp(1rem, 3vw, 1.55rem);
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    overflow: hidden;
    border: 1px solid rgba(240, 238, 235, 0.72);
    border-radius: 50%;
    background:
      radial-gradient(circle at 26% 34%, rgba(42, 42, 53, 0.62) 0 10%, transparent 11%),
      radial-gradient(circle at 68% 62%, rgba(54, 53, 66, 0.58) 0 15%, transparent 16%),
      radial-gradient(circle at 58% 21%, rgba(235, 232, 226, 0.5) 0 7%, transparent 8%),
      radial-gradient(ellipse at 30% 25%, #e5e0e4 0 8%, #aaa7b3 45%, #625f70 100%);
    box-shadow:
      inset -0.28rem -0.2rem 0.35rem rgba(26, 25, 38, 0.55),
      inset 0.16rem 0.12rem 0.2rem rgba(255, 255, 255, 0.38),
      0 0 0 0.18rem rgba(170, 167, 179, 0.12),
      0 0 0.8rem rgba(209, 205, 222, 0.48);
    transform: translate(-50%, -50%) rotateY(-18deg);
  }

  .fallback-moon::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(ellipse at 73% 56%, transparent 0 42%, rgba(22, 22, 33, 0.38) 82%, rgba(22, 22, 33, 0.7) 100%);
    pointer-events: none;
  }

  .fallback-moon .fallback-body-label {
    z-index: 1;
  }

  .fallback-moon-crater {
    position: absolute;
    display: block;
    border: 1px solid rgba(50, 49, 63, 0.42);
    border-radius: 50%;
  }

  .fallback-moon-crater-one {
    top: 54%;
    left: 16%;
    width: 24%;
    height: 20%;
  }

  .fallback-moon-crater-two {
    top: 14%;
    left: 62%;
    width: 18%;
    height: 15%;
  }

  .fallback-body-label {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 50%;
    transform: translateX(-50%);
    color: rgba(224, 223, 247, 0.62);
    font-size: 0.42rem;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  .fallback-neo-orbit {
    z-index: 5;
    width: calc(var(--neo-radius) * 2);
    height: calc(var(--neo-radius) * 2);
    border-color: color-mix(in srgb, var(--neo-color) 28%, transparent);
    animation: fallback-neo-orbit var(--neo-duration) linear infinite;
    animation-delay: var(--neo-delay);
  }

  .fallback-neo {
    position: absolute;
    top: 0;
    left: 50%;
    display: block;
    width: var(--neo-size);
    height: var(--neo-size);
    transform: translate(-50%, -50%);
    background: radial-gradient(circle at 30% 24%, color-mix(in srgb, white 46%, var(--neo-color)), var(--neo-color) 52%, color-mix(in srgb, black 42%, var(--neo-color)) 100%);
    box-shadow:
      inset -0.14rem -0.12rem 0.18rem color-mix(in srgb, black 48%, transparent),
      inset 0.08rem 0.06rem 0.12rem color-mix(in srgb, white 40%, transparent),
      0 0 0 0.12rem color-mix(in srgb, var(--neo-color) 32%, transparent),
      0 0 0.7rem color-mix(in srgb, var(--neo-color) 60%, transparent);
    transform: translate(-50%, -50%) rotateY(-20deg) rotateX(12deg);
  }

  .fallback-neo-angular {
    clip-path: polygon(50% 0, 100% 38%, 76% 100%, 22% 82%, 0 36%);
  }

  .fallback-neo-metallic {
    border-radius: 38% 62% 42% 58%;
    transform: translate(-50%, -50%) rotateY(-20deg) rotateX(12deg) rotate(24deg) skewX(-8deg);
  }

  .fallback-neo-elongated {
    width: calc(var(--neo-size) * 1.55);
    border-radius: 56% 44% 50% 42%;
    transform: translate(-50%, -50%) rotateY(-20deg) rotateX(12deg) rotate(-18deg);
  }

  .fallback-neo-cratered {
    border-radius: 48% 52% 38% 62%;
    background:
      radial-gradient(circle at 32% 38%, rgba(16, 16, 27, 0.56) 0 15%, transparent 16%),
      radial-gradient(circle at 68% 64%, rgba(16, 16, 27, 0.42) 0 13%, transparent 14%),
      var(--neo-color);
  }

  @keyframes fallback-moon-orbit {
    to {
      transform: translate(-50%, -50%) scale(var(--fallback-earth-scale, 1)) rotate(360deg);
    }
  }

  @keyframes fallback-neo-orbit {
    to {
      transform: translate(-50%, -50%) scale(var(--fallback-earth-scale, 1)) rotate(360deg);
    }
  }

  .fallback-earth {
    position: relative;
    z-index: 4;
    width: min(44%, 320px);
    min-width: 180px;
    aspect-ratio: 1;
    overflow: hidden;
    border: 2px solid color-mix(in srgb, var(--fallback-atmosphere) 72%, transparent);
    border-radius: 50%;
    background:
      radial-gradient(ellipse at 28% 23%, rgba(255, 255, 255, 0.56) 0 7%, transparent 20%),
      radial-gradient(ellipse at 37% 35%, transparent 0 44%, rgba(0, 0, 0, 0.14) 63%, rgba(0, 0, 0, 0.68) 100%),
      var(--fallback-map);
    background-position: center, center, center;
    background-size: auto, auto, cover;
    box-shadow:
      0 0 0 0.35rem color-mix(in srgb, var(--fallback-atmosphere) 20%, transparent),
      0 0 2.2rem color-mix(in srgb, var(--fallback-atmosphere) 62%, transparent),
      inset -1.35rem -0.9rem 1.7rem rgba(3, 5, 22, 0.66),
      inset 0.55rem 0.4rem 1.1rem rgba(255, 255, 255, 0.2);
    transform: scale(var(--fallback-earth-scale, 1)) rotateY(-12deg) rotateX(7deg);
    transform-style: preserve-3d;
    backface-visibility: hidden;
    will-change: transform;
  }

  .fallback-earth::before {
    content: "";
    position: absolute;
    inset: -2%;
    z-index: 2;
    border-radius: 50%;
    background: radial-gradient(ellipse at 30% 23%, rgba(220, 250, 255, 0.22), transparent 42%);
    opacity: 0.24;
    mix-blend-mode: screen;
    transform: rotateY(12deg) scaleX(0.82);
    pointer-events: none;
  }

  .fallback-earth::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: 50%;
    background: radial-gradient(ellipse at 72% 54%, transparent 0 42%, rgba(2, 4, 20, 0.34) 73%, rgba(2, 4, 20, 0.76) 100%);
    pointer-events: none;
  }

  .fallback-shine {
    position: absolute;
    inset: 7% 10% auto auto;
    width: 28%;
    height: 12%;
    border-radius: 50%;
    z-index: 4;
    background: linear-gradient(110deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0));
    filter: blur(0.2rem);
    transform: rotate(-22deg);
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
