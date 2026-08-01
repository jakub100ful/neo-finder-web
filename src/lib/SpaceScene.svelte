<script>
  import { onMount } from "svelte";
  import { getSceneMetrics } from "./neo.js";

  export let neos = [];
  export let earthTheme = "aqua";
  export let earthPattern = "continents";
  export let landColor = "#68df9f";
  export let fluidColor = "#0c89c7";
  export let atmosphereColor = "#61e7ff";
  export let atmosphereEnabled = true;

  let canvas;
  let sceneController = null;

  const THEMES = {
    aqua: {
      emissive: 0x052841,
      grid: 0x72e7ff,
      orbit: 0x286078,
      sun: 0xffcb72,
      moonOrbit: 0x6178aa
    },
    lava: {
      emissive: 0x40120b,
      grid: 0xffbe63,
      orbit: 0x744039,
      sun: 0xff8b4a,
      moonOrbit: 0x946e8c
    },
    moon: {
      emissive: 0x29283c,
      grid: 0xe3e4ff,
      orbit: 0x514f74,
      sun: 0xffd9a5,
      moonOrbit: 0x8a8bbd
    },
    plasma: {
      emissive: 0x2e0d52,
      grid: 0xff62d2,
      orbit: 0x673b7d,
      sun: 0xff9fdb,
      moonOrbit: 0xb74d99
    }
  };

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
      atmosphereEnabled
    });
  }

  onMount(() => {
    let cancelled = false;
    let cleanup = () => {};

    import("three").then((THREE) => {
      if (cancelled || !canvas) return;

      let palette = THEMES[earthTheme] || THEMES.aqua;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 220);
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "high-performance"
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      camera.position.set(0, 8, 74);

      const ambient = new THREE.AmbientLight(0x7ca6ff, 1.4);
      const keyLight = new THREE.PointLight(0xffffff, 2.4, 160);
      keyLight.position.set(-34, 24, 42);
      const sunLight = new THREE.PointLight(palette.sun, 2.1, 150);
      scene.add(ambient, keyLight, sunLight);

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
      scene.add(stars);

      const earthGroup = new THREE.Group();
      const earthMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: palette.emissive,
        emissiveIntensity: 0.52,
        roughness: 0.9,
        metalness: 0.04,
        flatShading: true
      });
      let earthTexture = createEarthTexture(
        THREE,
        earthPattern,
        landColor,
        fluidColor
      );
      earthMaterial.map = earthTexture;
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(12, 24, 16),
        earthMaterial
      );
      earthGroup.add(earth);

      const gridMaterial = new THREE.LineBasicMaterial({
        color: palette.grid,
        transparent: true,
        opacity: 0.3
      });
      const grid = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(12.12, 12, 8)),
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
        new THREE.SphereGeometry(12.8, 20, 12),
        atmosphereMaterial
      );
      atmosphere.visible = atmosphereEnabled;
      earthGroup.add(atmosphere);
      scene.add(earthGroup);

      const sunSystem = new THREE.Group();
      const sunMaterial = new THREE.MeshBasicMaterial({
        color: palette.sun,
        transparent: true,
        opacity: 0.94
      });
      const sun = new THREE.Mesh(
        new THREE.SphereGeometry(5.4, 12, 8),
        sunMaterial
      );
      const sunGlow = new THREE.Mesh(
        new THREE.SphereGeometry(8.7, 12, 8),
        new THREE.MeshBasicMaterial({
          color: palette.sun,
          transparent: true,
          opacity: 0.1,
          blending: THREE.AdditiveBlending
        })
      );
      sunSystem.add(sunGlow, sun);
      scene.add(sunSystem);

      const moonPivot = new THREE.Group();
      const moonMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaa7b3,
        roughness: 1,
        flatShading: true
      });
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 12, 8),
        moonMaterial
      );
      moon.position.set(26, 3.2, 0);
      moonPivot.add(moon);
      scene.add(moonPivot);

      const orbitGroup = new THREE.Group();
      const asteroidGroup = new THREE.Group();
      const moonOrbitGroup = new THREE.Group();
      scene.add(orbitGroup, asteroidGroup, moonOrbitGroup);
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

      moonOrbitGroup.add(createOrbitLine(26, palette.moonOrbit, 0.12, 0.2));

      function createEarthTexture(Engine, pattern, land, fluid) {
        const mapCanvas = document.createElement("canvas");
        mapCanvas.width = 512;
        mapCanvas.height = 256;
        const context = mapCanvas.getContext("2d");
        context.fillStyle = fluid || "#0c89c7";
        context.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

        const point = (x, y) => [x * mapCanvas.width, y * mapCanvas.height];
        const polygon = (points, fill = land || "#68df9f") => {
          context.beginPath();
          points.forEach((item, index) => {
            const [x, y] = point(item[0], item[1]);
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
          context.closePath();
          context.fillStyle = fill;
          context.fill();
        };

        const continents = [
          [[0.03, 0.28], [0.11, 0.18], [0.17, 0.2], [0.2, 0.32], [0.16, 0.43], [0.08, 0.42]],
          [[0.21, 0.51], [0.28, 0.39], [0.34, 0.45], [0.32, 0.67], [0.26, 0.73], [0.21, 0.63]],
          [[0.39, 0.2], [0.49, 0.16], [0.55, 0.27], [0.51, 0.38], [0.43, 0.33]],
          [[0.49, 0.53], [0.59, 0.43], [0.66, 0.48], [0.7, 0.64], [0.62, 0.78], [0.53, 0.7]],
          [[0.76, 0.27], [0.86, 0.2], [0.97, 0.26], [0.93, 0.42], [0.82, 0.45], [0.75, 0.38]]
        ];

        if (pattern === "archipelago") {
          const islands = [
            [0.12, 0.27, 0.06], [0.2, 0.56, 0.08], [0.31, 0.34, 0.05],
            [0.43, 0.62, 0.07], [0.57, 0.28, 0.05], [0.68, 0.52, 0.08],
            [0.82, 0.3, 0.06], [0.9, 0.68, 0.05], [0.5, 0.82, 0.045]
          ];
          islands.forEach(([x, y, size]) => {
            context.fillStyle = land || "#68df9f";
            context.fillRect(
              x * mapCanvas.width,
              y * mapCanvas.height,
              size * mapCanvas.width,
              size * mapCanvas.height * 0.7
            );
          });
        } else if (pattern === "gridworld") {
          continents.forEach((shape) => polygon(shape));
          context.strokeStyle = "rgba(255,255,255,0.14)";
          context.lineWidth = 2;
          for (let x = 0; x < mapCanvas.width; x += 32) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, mapCanvas.height);
            context.stroke();
          }
          for (let y = 0; y < mapCanvas.height; y += 32) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(mapCanvas.width, y);
            context.stroke();
          }
        } else if (pattern === "rings") {
          continents.forEach((shape) => polygon(shape));
          context.strokeStyle = land || "#68df9f";
          context.lineWidth = 9;
          for (let x = 50; x < mapCanvas.width; x += 105) {
            context.beginPath();
            context.ellipse(x, 125, 30, 75, 0, 0, Math.PI * 2);
            context.stroke();
          }
        } else {
          continents.forEach((shape) => polygon(shape));
        }

        context.fillStyle = "rgba(255,255,255,0.16)";
        for (let index = 0; index < 90; index += 1) {
          const x = (index * 71) % mapCanvas.width;
          const y = (index * 43) % mapCanvas.height;
          context.fillRect(x, y, 1, 1);
        }

        const texture = new Engine.CanvasTexture(mapCanvas);
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
        earthMaterial.emissive.setHex(palette.emissive);
        gridMaterial.color.setHex(palette.grid);
        atmosphereMaterial.color.set(next.atmosphere || "#61e7ff");
        atmosphere.visible = Boolean(next.atmosphereEnabled);
        atmosphereMaterial.opacity = next.atmosphereEnabled ? 0.14 : 0;
        sunMaterial.color.setHex(palette.sun);
        sunGlow.material.color.setHex(palette.sun);
        sunLight.color.setHex(palette.sun);
        moonOrbitGroup.children.forEach((line) => {
          if (line.material?.color) line.material.color.setHex(palette.moonOrbit);
        });
        orbitGroup.children.forEach((line) => {
          if (line.material?.color) line.material.color.setHex(palette.orbit);
        });
        const nextTexture = createEarthTexture(
          THREE,
          next.pattern,
          next.land,
          next.fluid
        );
        earthMaterial.map = nextTexture;
        earthMaterial.needsUpdate = true;
        if (earthTexture) earthTexture.dispose();
        earthTexture = nextTexture;
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

      sceneController = { updateNeos, updateEarth };
      updateNeos(neos);
      updateEarth({
        theme: earthTheme,
        pattern: earthPattern,
        land: landColor,
        fluid: fluidColor,
        atmosphere: atmosphereColor,
        atmosphereEnabled
      });

      let frame;
      let sunPhase = 0.8;
      function animate() {
        frame = requestAnimationFrame(animate);
        earth.rotation.y += 0.002;
        grid.rotation.y += 0.002;
        atmosphere.rotation.y -= 0.0006;
        stars.rotation.y += 0.00012;
        moonPivot.rotation.y += 0.0024;

        sunPhase += 0.0016;
        const sunVisible = Math.sin(sunPhase) > -0.42;
        sunSystem.visible = sunVisible;
        sunLight.visible = sunVisible;
        sunSystem.position.set(
          Math.cos(sunPhase) * 78,
          16 + Math.sin(sunPhase * 0.7) * 9,
          Math.sin(sunPhase) * 78 - 26
        );
        sunLight.position.copy(sunSystem.position);

        asteroidObjects.forEach((object) => {
          object.userData.phase += 0.0035 * object.userData.speed;
          const angle = object.userData.phase;
          object.position.set(
            Math.cos(angle) * object.userData.radius,
            Math.sin(angle) * object.userData.radius * object.userData.inclination,
            Math.sin(angle) * object.userData.radius
          );
          object.rotation.x += object.userData.spin;
          object.rotation.y += object.userData.spin * 1.2;
        });
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      animate();

      cleanup = () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
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
        renderer.dispose();
        sceneController = null;
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  });
</script>

<div class="scene-shell" role="img" aria-label="Animated Earth with saved near Earth objects in orbit">
  <canvas bind:this={canvas}></canvas>
  <div class="scene-vignette"></div>
  <div class="scene-key"><span class="sun-key"></span>SUN WINDOW <span class="moon-key"></span>MOON // TIDALLY LOCKED</div>
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

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 340px;
    image-rendering: pixelated;
  }

  .scene-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(4, 5, 18, 0.55), transparent 18%, transparent 82%, rgba(4, 5, 18, 0.55)),
      linear-gradient(0deg, rgba(4, 5, 18, 0.5), transparent 18%, transparent 82%, rgba(4, 5, 18, 0.42));
  }

  .scene-key {
    position: absolute;
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

  .sun-key {
    background: #ffcb72;
    box-shadow: 0 0 8px #ffcb72;
  }

  .moon-key {
    margin-left: 0.55rem;
    background: #aaa7b3;
    box-shadow: 0 0 7px #aaa7b3;
  }
</style>
