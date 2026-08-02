<script>
  import { onMount } from "svelte";
  import { getSceneMetrics } from "./neo.js";
  import { createAsteroidGeometry } from "./asteroid-geometry.mjs";

  export let neo = null;
  export let compact = false;

  let canvas;
  let renderStatus = "INITIALISING";
  let renderError = "";

  onMount(() => {
    let cancelled = false;
    let frame = 0;
    let renderer;
    let geometry;
    let material;
    let resizeObserver;

    if (!neo) {
      renderStatus = "NO OBJECT";
      renderError = "NO ASTEROID SELECTED";
      return () => {};
    }

    const metrics = getSceneMetrics(neo, 0);
    const appearance = metrics.appearance;
    const previewRadius = Math.max(metrics.size, 1.1);
    const cameraDistance = previewRadius * 2.9 + 1.8;

    import("three")
      .then((THREE) => {
        if (cancelled || !canvas) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, cameraDistance * 4);
        camera.position.set(0, previewRadius * 0.12, cameraDistance);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: (window.devicePixelRatio || 1) <= 1.25,
          powerPreference: "high-performance"
        });
        renderer.debug.checkShaderErrors = import.meta.env.DEV;
        renderer.setClearColor(0x050612, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

        const asteroid = new THREE.Mesh(
          createAsteroidGeometry(THREE, metrics.size, appearance),
          new THREE.MeshStandardMaterial({
            color: appearance.materialColor,
            roughness: appearance.roughness,
            metalness: appearance.shape === "metallic" ? 0.55 : 0.02,
            flatShading: true
          })
        );
        geometry = asteroid.geometry;
        material = asteroid.material;
        asteroid.position.set(0, 0, 0);
        asteroid.rotation.set(0.12, -0.24, 0.08);
        scene.add(asteroid);

        scene.add(new THREE.AmbientLight(0x8994c9, 1.5));
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
        keyLight.position.set(-4, 5, 7);
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(0xff62d2, 9, 18);
        rimLight.position.set(4, -1, -4);
        scene.add(rimLight);

        const resize = () => {
          if (!renderer || !canvas) return;
          const width = Math.max(canvas.clientWidth, 240);
          const height = Math.max(canvas.clientHeight, 240);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        renderer.render(scene, camera);
        renderStatus = "WEBGL READY";

        let previousTime = performance.now();
        const animate = (timestamp) => {
          if (cancelled) return;
          frame = requestAnimationFrame(animate);
          const delta = Math.min((timestamp - previousTime) / 1000, 0.1);
          previousTime = timestamp;

          // The preview is deliberately not an orbital scene. Its origin stays
          // fixed while the asteroid rotates around its own local axes.
          asteroid.rotation.x += appearance.spin * delta * 60;
          asteroid.rotation.y += appearance.spin * delta * 72;
          renderer.render(scene, camera);
        };
        frame = requestAnimationFrame(animate);
      })
      .catch((error) => {
        if (cancelled) return;
        renderStatus = "RENDER ERROR";
        renderError = "ASTEROID DISPLAY OFFLINE";
        console.error("NEO Finder asteroid preview failed to initialise", error);
      });

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
    };
  });
</script>

<div
  class="asteroid-preview-shell"
  class:compact
  role="img"
  aria-label="Rotating asteroid preview"
  data-render-status={renderStatus}
>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  {#if renderError}
    <div class="preview-error" role="status">
      <strong>{renderError}</strong>
      <span>Reload the object preview to reconnect the renderer.</span>
    </div>
  {/if}
</div>

<style>
  .asteroid-preview-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 340px;
    overflow: hidden;
    isolation: isolate;
    background:
      radial-gradient(circle at 50% 48%, rgba(72, 82, 164, 0.3), transparent 38%),
      #050612;
  }

  .asteroid-preview-shell::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: 0.78;
    background:
      radial-gradient(circle at 10% 18%, rgba(255, 255, 255, 0.9) 0 1px, transparent 1.5px),
      radial-gradient(circle at 23% 76%, rgba(158, 219, 255, 0.78) 0 1px, transparent 1.6px),
      radial-gradient(circle at 39% 29%, rgba(255, 255, 255, 0.66) 0 1px, transparent 1.4px),
      radial-gradient(circle at 56% 84%, rgba(255, 98, 210, 0.72) 0 1px, transparent 1.5px),
      radial-gradient(circle at 69% 16%, rgba(255, 255, 255, 0.86) 0 1px, transparent 1.5px),
      radial-gradient(circle at 84% 61%, rgba(158, 219, 255, 0.75) 0 1px, transparent 1.6px),
      radial-gradient(circle at 94% 34%, rgba(255, 255, 255, 0.8) 0 1px, transparent 1.5px);
  }

  .asteroid-preview-shell.compact {
    min-height: 0;
  }

  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  .preview-error {
    position: absolute;
    top: 50%;
    left: 50%;
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

  .preview-error strong {
    color: var(--pink);
    font-size: 0.72rem;
  }
</style>
