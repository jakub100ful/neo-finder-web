<script>
  import { onMount } from "svelte";
  import { getSceneMetrics } from "./neo.js";

  export let neos = [];
  export let earthTheme = "aqua";

  let canvas;
  let sceneController = null;

  const THEMES = {
    aqua: {
      earth: 0x0c89c7,
      emissive: 0x052841,
      grid: 0x72e7ff,
      atmosphere: 0x3ed7ff,
      orbit: 0x286078
    },
    lava: {
      earth: 0xa83232,
      emissive: 0x40120b,
      grid: 0xffbe63,
      atmosphere: 0xff7445,
      orbit: 0x744039
    },
    moon: {
      earth: 0x76758c,
      emissive: 0x29283c,
      grid: 0xe3e4ff,
      atmosphere: 0xa7a2ff,
      orbit: 0x514f74
    },
    plasma: {
      earth: 0x8137b7,
      emissive: 0x2e0d52,
      grid: 0xff62d2,
      atmosphere: 0xb882ff,
      orbit: 0x673b7d
    }
  };

  $: if (sceneController && neos) {
    sceneController.updateNeos(neos);
  }

  $: if (sceneController && earthTheme) {
    sceneController.updateTheme(earthTheme);
  }

  onMount(() => {
    let cancelled = false;
    let cleanup = () => {};

    import("three").then((THREE) => {
      if (cancelled || !canvas) return;

      const palette = THEMES[earthTheme] || THEMES.aqua;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 200);
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
      scene.add(ambient, keyLight);

      const starPositions = [];
      for (let index = 0; index < 420; index += 1) {
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
        color: palette.earth,
        emissive: palette.emissive,
        emissiveIntensity: 0.65,
        roughness: 0.92,
        metalness: 0.06,
        flatShading: true
      });
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(12, 24, 16),
        earthMaterial
      );
      earthGroup.add(earth);

      const gridMaterial = new THREE.LineBasicMaterial({
        color: palette.grid,
        transparent: true,
        opacity: 0.34
      });
      const grid = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(12.12, 12, 8)),
        gridMaterial
      );
      earthGroup.add(grid);

      const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: palette.atmosphere,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
      });
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(12.8, 20, 12),
        atmosphereMaterial
      );
      earthGroup.add(atmosphere);
      scene.add(earthGroup);

      const orbitGroup = new THREE.Group();
      const asteroidGroup = new THREE.Group();
      scene.add(orbitGroup, asteroidGroup);
      const asteroidObjects = [];

      function createOrbitLine(radius, color, inclination) {
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
            opacity: 0.42
          })
        );
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
          const asteroidMaterial = new THREE.MeshStandardMaterial({
            color: [0x8e8c99, 0x676572, 0xb1a78f, 0x5d7d88][index % 4],
            roughness: 1,
            metalness: 0.02,
            flatShading: true
          });
          const asteroid = new THREE.Mesh(
            new THREE.IcosahedronGeometry(metrics.size, 1),
            asteroidMaterial
          );
          const halo = new THREE.Mesh(
            new THREE.IcosahedronGeometry(metrics.size * 1.5, 1),
            new THREE.MeshBasicMaterial({
              color: 0xe5c99a,
              wireframe: true,
              transparent: true,
              opacity: 0.09
            })
          );
          const object = new THREE.Group();
          object.add(asteroid, halo);
          object.userData = {
            radius: metrics.radius,
            speed: metrics.speed,
            phase: metrics.phase,
            inclination: metrics.inclination
          };
          asteroidGroup.add(object);
          orbitGroup.add(
            createOrbitLine(metrics.radius, palette.orbit, metrics.inclination)
          );
          asteroidObjects.push(object);
        });
      }

      function updateTheme(key) {
        const next = THEMES[key] || THEMES.aqua;
        earthMaterial.color.setHex(next.earth);
        earthMaterial.emissive.setHex(next.emissive);
        gridMaterial.color.setHex(next.grid);
        atmosphereMaterial.color.setHex(next.atmosphere);
        orbitGroup.children.forEach((line) => {
          if (line.material?.color) line.material.color.setHex(next.orbit);
        });
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

      sceneController = { updateNeos, updateTheme };
      updateNeos(neos);
      updateTheme(earthTheme);

      let frame;
      function animate() {
        frame = requestAnimationFrame(animate);
        earth.rotation.y += 0.002;
        grid.rotation.y += 0.002;
        atmosphere.rotation.y -= 0.0006;
        stars.rotation.y += 0.00012;
        asteroidObjects.forEach((object) => {
          object.userData.phase += 0.0035 * object.userData.speed;
          const angle = object.userData.phase;
          object.position.set(
            Math.cos(angle) * object.userData.radius,
            Math.sin(angle) * object.userData.radius * object.userData.inclination,
            Math.sin(angle) * object.userData.radius
          );
          object.rotation.x += 0.005;
          object.rotation.y += 0.007;
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
</style>
