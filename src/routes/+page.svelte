<script>
  import { onMount } from "svelte";
  import AsteroidPreview from "../lib/AsteroidPreview.svelte";
  import SpaceScene from "../lib/SpaceScene.svelte";
  import { demoNeos } from "../lib/data/demo-neos.js";
  import {
    LANDMASS_DEFAULTS,
    LANDMASS_STYLES,
    normalizeLandmassConfig,
    resolveLandmassConfig
  } from "../lib/landmass.js";
  import {
    FAVOURITES_STORAGE_KEY,
    PROFILE_STORAGE_KEY,
    featureFlags,
    fetchNeoFeed,
    formatDate,
    formatDistance,
    formatNumber,
    fetchPhysicalProfile,
    getApproach,
    getDiameterKm,
    getRisk,
    getRiskScore,
    getSpeedKps,
    getStoredNasaToken,
    loadLocalJson,
    saveLocalJson,
    saveNasaToken
  } from "../lib/neo.js";

  const earthThemes = [
    { id: "aqua", name: "DEEP AQUA", color: "#25d8ff", surface: "#0c89c7" },
    { id: "lava", name: "SOLAR LAVA", color: "#ff7848", surface: "#a83232" },
    { id: "moon", name: "MOON DUST", color: "#b7b4ff", surface: "#76758c" },
    { id: "plasma", name: "PLASMA PINK", color: "#ff62d2", surface: "#8137b7" }
  ];

  const earthPatterns = LANDMASS_STYLES;

  const landmassControls = [
    {
      key: "landCoverage",
      label: "LAND COVERAGE",
      help: "How much of the surface clears the sea threshold."
    },
    {
      key: "continentalScale",
      label: "CONTINENTAL SCALE",
      help: "Low makes many smaller regions; high makes fewer large ones."
    },
    {
      key: "coastCorrugation",
      label: "COAST CORRUGATION",
      help: "Adds multi-scale detail to coastlines without drawing grid noise."
    },
    {
      key: "islandFracture",
      label: "ISLAND FRACTURE",
      help: "Blends in cellular breakup for island chains and micro-continents."
    },
    {
      key: "tectonicWarp",
      label: "TECTONIC WARP",
      help: "Bends the underlying field so boundaries feel less blobby."
    }
  ];

  const tagLegend = [
    {
      label: "CLOSE",
      tone: "warn",
      title: "Near-pass marker",
      copy: "NEO Finder uses this marker when the recorded miss distance is under 0.05 AU, roughly 7.5 million km. It is not an impact probability."
    },
    {
      label: "TRACKED",
      tone: "safe",
      title: "Catalogued object",
      copy: "The object has a recorded close approach in the NASA feed. Tracked does not mean dangerous; it means astronomers have a useful orbit record."
    },
    {
      label: "PHA",
      tone: "danger",
      title: "NASA PHA flag",
      copy: "Potentially Hazardous Asteroid is a size-and-orbit classification. It does not mean an impact is predicted or expected."
    }
  ];

  const educationalFacts = [
    "A NEO is defined by an orbit that can bring it within 1.3 AU of the Sun. Most NEOs are asteroids.",
    "A close approach is a geometry event: distance and time, not a promise that an object will hit Earth.",
    "CNEOS refines orbits using observations reported by telescopes and the Minor Planet Center.",
    "The real feed gives us size estimates, velocity and miss distance. This scene compresses those values for play.",
    "JPL's Small-Body Database can add physical clues such as albedo, spectral class and rotation period.",
    "The Moon takes about 27.3 days to orbit Earth; NEO motion is shown relative to each object's measured speed."
  ];

  let view = "intro";
  let lastView = "dashboard";
  let dateDraft = "";
  let activeDate = "";
  let dateReturnView = "dashboard";
  let neoList = demoNeos;
  let savedNeos = [];
  let selectedNeo = null;
  let loading = false;
  let errorMessage = "";
  let sourceLabel = "LOCAL DEMO";
  let token = "";
  let tokenDraft = "";
  let earthName = "TERRA-01";
  let earthTheme = "aqua";
  let earthPattern = "continents";
  let landColor = "#68df9f";
  let fluidColor = "#0c89c7";
  let atmosphereColor = "#61e7ff";
  let atmosphereEnabled = true;
  let landmassConfig = { ...LANDMASS_DEFAULTS };
  let draftEarthName = earthName;
  let draftEarthTheme = earthTheme;
  let draftEarthPattern = earthPattern;
  let draftLandColor = landColor;
  let draftFluidColor = fluidColor;
  let draftAtmosphereColor = atmosphereColor;
  let draftAtmosphereEnabled = atmosphereEnabled;
  let draftLandmassConfig = { ...LANDMASS_DEFAULTS };
  let notice = "";
  let hydrated = false;
  let noticeTimer;
  let factIndex = 0;
  let addingId = "";

  $: savedIds = new Set(savedNeos.map((neo) => neo.id));
  $: riskCount = savedNeos.filter((neo) => getRisk(neo).tone === "danger").length;
  $: sourceIsDemo = sourceLabel === "LOCAL DEMO";

  onMount(() => {
    const profile = loadLocalJson(PROFILE_STORAGE_KEY, {});
    const storedFavourites = loadLocalJson(FAVOURITES_STORAGE_KEY, []);
    earthName = profile?.earthName || "TERRA-01";
    earthTheme = profile?.earthTheme || "aqua";
    earthPattern = profile?.earthPattern || "continents";
    landColor = profile?.landColor || "#68df9f";
    fluidColor = profile?.fluidColor || "#0c89c7";
    atmosphereColor = profile?.atmosphereColor || "#61e7ff";
    atmosphereEnabled = profile?.atmosphereEnabled ?? true;
    landmassConfig = profile?.landmassConfig
      ? normalizeLandmassConfig(profile.landmassConfig)
      : resolveLandmassConfig(earthPattern, LANDMASS_DEFAULTS);
    draftLandmassConfig = { ...landmassConfig };
    draftEarthName = earthName;
    draftEarthTheme = earthTheme;
    draftEarthPattern = earthPattern;
    draftLandColor = landColor;
    draftFluidColor = fluidColor;
    draftAtmosphereColor = atmosphereColor;
    draftAtmosphereEnabled = atmosphereEnabled;
    savedNeos = Array.isArray(storedFavourites) ? storedFavourites : [];
    token = getStoredNasaToken();
    tokenDraft = token;
    hydrated = true;
  });

  function persistProfile() {
    if (!hydrated) return;
    saveLocalJson(PROFILE_STORAGE_KEY, {
      earthName,
      earthTheme,
      earthPattern,
      landColor,
      fluidColor,
      atmosphereColor,
      atmosphereEnabled,
      landmassConfig
    });
  }

  function persistFavourites() {
    saveLocalJson(FAVOURITES_STORAGE_KEY, savedNeos);
  }

  function showNotice(message) {
    notice = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice = "";
    }, 3200);
  }

  function startJourney() {
    errorMessage = "";
    dateReturnView = "dashboard";
    if (featureFlags.requireNasaToken && !token) {
      view = "token";
    } else {
      view = "date";
    }
  }

  function submitToken() {
    const cleanToken = tokenDraft.trim();
    if (featureFlags.requireNasaToken && !cleanToken) {
      errorMessage = "A NASA key is required for this build.";
      return;
    }
    token = cleanToken;
    saveNasaToken(token);
    errorMessage = "";
    view = "date";
    showNotice(token ? "NASA access key stored on this device." : "Demo access enabled.");
  }

  function saveTokenFromSettings() {
    token = tokenDraft.trim();
    saveNasaToken(token);
    showNotice(token ? "NASA key updated." : "NASA key cleared. Demo mode remains available.");
  }

  async function submitDate() {
    if (!dateDraft) {
      errorMessage = "Choose a date before entering orbit.";
      return;
    }
    activeDate = dateDraft;
    errorMessage = "";
    view = dateReturnView || "dashboard";
    await loadNeoList(activeDate);
  }

  async function loadNeoList(date) {
    loading = true;
    errorMessage = "";
    if (!featureFlags.liveNasaData) {
      neoList = demoNeos;
      sourceLabel = "LOCAL DEMO";
      loading = false;
      return;
    }

    try {
      const liveNeos = await fetchNeoFeed(date, token || "DEMO_KEY");
      if (liveNeos.length) {
        neoList = liveNeos;
        sourceLabel = "NASA NEOWS";
      } else {
        neoList = demoNeos;
        sourceLabel = "LOCAL DEMO";
        errorMessage = "No close approaches returned for this date. Demo objects are shown.";
      }
    } catch (error) {
      neoList = demoNeos;
      sourceLabel = "LOCAL DEMO";
      errorMessage = "NASA link unavailable. Demo objects are shown so you can explore the interface.";
      console.warn(error);
    } finally {
      loading = false;
    }
  }

  function openCatalogue() {
    if (!activeDate) {
      view = "date";
      return;
    }
    view = "catalogue";
  }

  function openDateEditor(returnView = view) {
    dateReturnView = returnView || "dashboard";
    dateDraft = activeDate;
    errorMessage = "";
    view = "date";
  }

  function openAbout() {
    lastView = view;
    view = "about";
  }

  function nextFact() {
    factIndex = (factIndex + 1) % educationalFacts.length;
  }

  function openDetail(neo) {
    selectedNeo = neo;
    lastView = view;
    view = "detail";
  }

  function backFromDetail() {
    view = lastView || "catalogue";
    selectedNeo = null;
  }

  async function addNeo(neo) {
    if (savedIds.has(neo.id)) {
      view = "dashboard";
      selectedNeo = null;
      return;
    }

    addingId = neo.id;
    let enrichedNeo = neo;
    try {
      const physical = await fetchPhysicalProfile(neo);
      if (physical) enrichedNeo = { ...neo, physical };
    } catch (error) {
      console.warn("JPL physical profile unavailable", error);
    }

    if (!savedIds.has(enrichedNeo.id)) {
      savedNeos = [...savedNeos, enrichedNeo];
      persistFavourites();
      showNotice(enrichedNeo.name + " added to your orbit.");
    }
    addingId = "";
    view = "dashboard";
    selectedNeo = null;
  }

  function removeNeo(neo) {
    savedNeos = savedNeos.filter((item) => item.id !== neo.id);
    persistFavourites();
    showNotice(neo.name + " removed from your orbit.");
  }

  function openSettings() {
    lastView = view;
    draftEarthName = earthName;
    draftEarthTheme = earthTheme;
    draftEarthPattern = earthPattern;
    draftLandColor = landColor;
    draftFluidColor = fluidColor;
    draftAtmosphereColor = atmosphereColor;
    draftAtmosphereEnabled = atmosphereEnabled;
    draftLandmassConfig = { ...landmassConfig };
    view = "settings";
  }

  function cancelSettings() {
    view = lastView || "dashboard";
  }

  function saveEarthSettings() {
    earthName = draftEarthName;
    earthTheme = draftEarthTheme;
    earthPattern = draftEarthPattern;
    landColor = draftLandColor;
    fluidColor = draftFluidColor;
    atmosphereColor = draftAtmosphereColor;
    atmosphereEnabled = draftAtmosphereEnabled;
    landmassConfig = normalizeLandmassConfig(draftLandmassConfig);
    persistProfile();
    view = lastView || "dashboard";
    showNotice("Earth profile saved.");
  }

  function updateDraftEarthTheme(theme) {
    draftEarthTheme = theme;
  }

  function updateDraftEarthPattern(pattern) {
    draftEarthPattern = pattern;
    draftLandmassConfig = resolveLandmassConfig(pattern, draftLandmassConfig);
  }

  function updateLandmassParam(parameter, event) {
    draftLandmassConfig = {
      ...draftLandmassConfig,
      [parameter]: Number(event.currentTarget.value)
    };
  }

  function formatLandmassValue(parameter, value) {
    const rounded = Math.round(Number(value) * 100);
    return parameter === "landCoverage" ? `${rounded}%` : `${rounded}`;
  }

  function handleDraftEarthNameInput() {
    draftEarthName = draftEarthName.toUpperCase().slice(0, 18);
  }
</script>

<svelte:head>
  <title>NEO Finder // Personal Orbit Log</title>
  <meta
    name="description"
    content="A retro orbital catalogue for the near Earth objects that crossed your important date."
  />
</svelte:head>

{#if view === "intro"}
  <main class="intro-screen">
    <div class="intro-grid"></div>
    <div class="intro-stars"></div>
    <div class="intro-content">
      <div class="eyebrow">ORBITAL MEMORY SYSTEM // ONLINE</div>
      <div class="intro-logo" aria-label="NEO Finder">
        <div class="logo-orbit logo-orbit-one"></div>
        <div class="logo-orbit logo-orbit-two"></div>
        <div class="logo-neo">NEO</div>
        <div class="logo-finder">FINDER</div>
      </div>
      <p class="intro-copy">
        Find the near Earth objects that passed close to a date worth remembering.
      </p>
      <button class="arcade-button start-button" on:click={startJourney}>
        START <span aria-hidden="true">↗</span>
      </button>
      <div class="intro-hint">TRACK // COLLECT // CUSTOMISE</div>
    </div>
    <footer class="intro-footer">
      <span>NASA / JPL DATA</span>
      <span>THREE.JS ORBITAL RENDER</span>
      <span>NEO FINDER WEB // 01</span>
    </footer>
  </main>
{:else if view === "token"}
  <main class="onboarding-screen">
    <div class="onboarding-orbit orbit-left"></div>
    <div class="onboarding-orbit orbit-right"></div>
    <section class="onboarding-panel token-panel">
      <div class="panel-topline"><span>AUTH // NASA ACCESS</span><span>STEP 01 / 02</span></div>
      <div class="terminal-icon">KEY<span>_</span></div>
      <h1>Bring your own key.</h1>
      <p class="lede">
        This build is configured to request a NASA API token before it loads live close-approach data.
        Your key stays in this browser and is never written into the repository.
      </p>
      <ol class="token-steps">
        <li>Open the NASA API portal.</li>
        <li>Generate a free developer key.</li>
        <li>Paste it here and launch your orbit.</li>
      </ol>
      <a class="text-link" href="https://api.nasa.gov" target="_blank" rel="noreferrer">
        OPEN API.NASA.GOV ↗
      </a>
      <form class="token-form" on:submit|preventDefault={submitToken}>
        <label for="nasa-token">NASA API TOKEN</label>
        <input id="nasa-token" bind:value={tokenDraft} type="password" autocomplete="off" placeholder="DEMO_KEY or your token" />
        {#if errorMessage}<p class="form-error">{errorMessage}</p>{/if}
        <button class="arcade-button" type="submit">SAVE &amp; CONTINUE <span>→</span></button>
      </form>
      {#if !featureFlags.requireNasaToken}
        <button class="subtle-button" on:click={() => (view = "date")}>CONTINUE IN DEMO MODE</button>
      {/if}
    </section>
  </main>
{:else if view === "date"}
  <main class="onboarding-screen">
    <div class="onboarding-orbit orbit-left"></div>
    <div class="onboarding-orbit orbit-right"></div>
    <section class="onboarding-panel date-panel">
      <div class="panel-topline"><span>PERSONAL ORBIT // INPUT</span><span>{activeDate ? "UPDATE SIGNAL" : "STEP 02 / 02"}</span></div>
      <div class="date-glyph">✦</div>
      <h1>{activeDate ? "Update your anchor date." : "Choose your anchor date."}</h1>
      <p class="lede">
        Birthdays, first dates, wedding days, launch days. Any date can become the centre of your own sky.
      </p>
      <form class="date-form" on:submit|preventDefault={submitDate}>
        <label for="anchor-date">SIGNAL DATE</label>
        <input id="anchor-date" bind:value={dateDraft} type="date" />
        {#if errorMessage}<p class="form-error">{errorMessage}</p>{/if}
        <button class="arcade-button" type="submit">{activeDate ? "UPDATE ORBIT" : "ENTER ORBIT"} <span>→</span></button>
      </form>
      <div class="date-note">
        <span class="status-dot"></span>
        {#if featureFlags.liveNasaData}
          LIVE NASA FEED ENABLED // DEMO FALLBACK READY
        {:else}
          DEMO-ONLY BUILD // NASA FEED DISABLED
        {/if}
      </div>
      <button class="subtle-button" on:click={() => (view = "token")}>CONFIGURE NASA ACCESS</button>
      {#if activeDate}<button class="subtle-button" on:click={() => (view = dateReturnView || "dashboard")}>CANCEL</button>{/if}
    </section>
  </main>
{:else}
  <div class="app-shell">
    <header class="topbar">
      <button class="brand-button" aria-label="Go to dashboard" on:click={() => (view = "dashboard")}>
        <span class="brand-mark">N</span>
        <span class="brand-copy"><strong>NEO</strong><small>FINDER</small></span>
      </button>
      <div class="topbar-date">
        <span class="topbar-label">ANCHOR DATE</span>
        <strong>{activeDate ? formatDate(activeDate) : "NOT SET"}</strong>
      </div>
      <nav class="main-nav" aria-label="Main navigation">
        <button class:active={view === "dashboard"} on:click={() => (view = "dashboard")}>DASHBOARD</button>
        <button class:active={view === "catalogue"} on:click={openCatalogue}>CATALOGUE <span>{neoList.length}</span></button>
        <button class:active={view === "settings"} on:click={openSettings}>CUSTOMISE</button>
        <button class:active={view === "about"} on:click={openAbout}>ABOUT <span>i</span></button>
      </nav>
    </header>

    {#if notice}
      <div class="toast" role="status">{notice}</div>
    {/if}

    {#if view === "dashboard"}
      <main class="page-content dashboard-view">
        <section class="page-heading">
          <div>
            <div class="eyebrow">PERSONAL ORBIT // {formatDate(activeDate)}</div>
            <h1>{earthName}</h1>
            <p class="page-lede">
              Your selected NEOs are travelling around a scaled Earth. Their speed, size and approach data remain true to NASA's record.
            </p>
          </div>
          <div class="heading-actions">
            <button class="arcade-button compact" on:click={openCatalogue}>VIEW CATALOGUE <span>→</span></button>
            <button class="ghost-button" on:click={openSettings}>CUSTOMISE EARTH</button>
          </div>
        </section>

        <section class="fact-strip" aria-live="polite">
          <div class="fact-icon">i</div>
          <div class="fact-copy">
            <span>ORBITAL FACT // {(factIndex + 1).toString().padStart(2, "0")}</span>
            <p>{educationalFacts[factIndex]}</p>
          </div>
          <button class="text-link-button" on:click={nextFact}>NEXT FACT →</button>
        </section>

        <section class="dashboard-grid">
          <div class="scene-panel">
            <div class="panel-header">
              <span>LIVE ORBITAL DISPLAY</span>
              <span class:demo-signal={sourceIsDemo} class="signal"><i></i>{sourceLabel}</span>
            </div>
            <div class="scene-frame">
              <SpaceScene
                neos={savedNeos}
                earthTheme={earthTheme}
                earthPattern={earthPattern}
                landColor={landColor}
                fluidColor={fluidColor}
                atmosphereColor={atmosphereColor}
                atmosphereEnabled={atmosphereEnabled}
                landmassConfig={landmassConfig}
              />
              <div class="scene-caption">
                <span>EARTH // {earthName}</span>
                <span>{savedNeos.length} OBJECT{savedNeos.length === 1 ? "" : "S"} IN ORBIT</span>
              </div>
            </div>
          </div>

          <aside class="dashboard-rail">
            <div class="metric-row">
              <div class="metric-card"><span>OBJECTS</span><strong>{savedNeos.length.toString().padStart(2, "0")}</strong></div>
              <div class="metric-card"><span>PHA FLAGS</span><strong class:danger-number={riskCount > 0}>{riskCount.toString().padStart(2, "0")}</strong></div>
            </div>
            <div class="rail-panel">
              <div class="panel-header"><span>MISSION LOG</span><span class="panel-index">001</span></div>
              {#if savedNeos.length}
                <div class="saved-list">
                  {#each savedNeos as neo (neo.id)}
                    <div class="saved-item">
                      <button on:click={() => openDetail(neo)}>
                        <span class="saved-orb"></span>
                        <span><strong>{neo.name}</strong><small>{formatDistance(neo)} // {getSpeedKps(neo).toFixed(1)} KM/S</small></span>
                      </button>
                      <button class="remove-button" aria-label={"Remove " + neo.name} on:click={() => removeNeo(neo)}>×</button>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="empty-log">
                  <div class="empty-icon">○</div>
                  <strong>NO OBJECTS COLLECTED</strong>
                  <p>Scan the catalogue and choose a NEO to place it around your Earth.</p>
                  <button class="text-link-button" on:click={openCatalogue}>OPEN CATALOGUE →</button>
                </div>
              {/if}
            </div>
            <div class="tip-panel">
              <div class="tip-heading"><span class="tip-label">FIELD NOTE</span><button class="info-button" aria-label="Open how it works" on:click={openAbout}>?</button></div>
              <p>Orbital speed is rendered relative to each object's real km/s velocity. Scale is compressed for a readable personal sky.</p>
              <button class="text-link-button" on:click={openAbout}>HOW NASA TRACKS →</button>
            </div>
          </aside>
        </section>
      </main>
    {:else if view === "catalogue"}
      <main class="page-content catalogue-view">
        <section class="page-heading catalogue-heading">
          <div>
            <div class="eyebrow">CLOSE APPROACH INDEX // {formatDate(activeDate)}</div>
            <h1>Choose your NEOs.</h1>
            <p class="page-lede">
              {#if sourceIsDemo}Showing a local demo set while NASA access is unavailable.{:else}Live objects recorded near your anchor date.{/if}
            </p>
          </div>
          <div class="heading-actions">
            <button class="ghost-button" on:click={() => openDateEditor("catalogue")}>CHANGE DATE</button>
            <button class="ghost-button" on:click={() => loadNeoList(activeDate)} disabled={loading}>
              {loading ? "SCANNING..." : "REFRESH SIGNAL"}
            </button>
            <button class="arcade-button compact" on:click={() => (view = "dashboard")}>BACK TO EARTH <span>↗</span></button>
          </div>
        </section>

        {#if errorMessage}
          <div class="inline-alert"><span>!</span>{errorMessage}</div>
        {/if}

        <section class="legend-panel" aria-labelledby="legend-title">
          <div class="legend-heading">
            <div><span class="tip-label" id="legend-title">TAG LEGEND</span><button class="info-button" aria-label="Open the full NEO Finder guide" on:click={openAbout}>?</button></div>
            <span class="legend-note">NEO FINDER READOUT // NOT AN IMPACT PREDICTION</span>
          </div>
          <div class="legend-grid">
            {#each tagLegend as tag}
              <div class="legend-item">
                <span class={"risk-tag " + tag.tone}>{tag.label}</span>
                <div><strong>{tag.title}</strong><p>{tag.copy}</p></div>
              </div>
            {/each}
          </div>
        </section>

        {#if loading}
          <div class="catalogue-grid">
            {#each Array(6) as _, index}
              <div class="neo-card skeleton-card" aria-hidden="true"><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-block"></div></div>
            {/each}
          </div>
        {:else}
          <div class="catalogue-grid">
            {#each neoList as neo, index (neo.id)}
              <article class:collected={savedIds.has(neo.id)} class="neo-card">
                <button class="neo-card-body" on:click={() => openDetail(neo)}>
                  <div class="neo-card-topline"><span class="neo-index">NEO // {(index + 1).toString().padStart(2, "0")}</span><span class={"risk-tag " + getRisk(neo).tone}>{getRisk(neo).label}</span></div>
                  <h2>{neo.name}</h2>
                  <div class="neo-card-date">{formatDate(getApproach(neo).close_approach_date)}</div>
                  <div class="neo-stats">
                    <span><small>SIZE</small><strong>{formatNumber(getDiameterKm(neo), 2)} KM</strong></span>
                    <span><small>SPEED</small><strong>{formatNumber(getSpeedKps(neo), 1)} KM/S</strong></span>
                    <span><small>MISS</small><strong>{formatDistance(neo)}</strong></span>
                  </div>
                  <div class="risk-meter"><span style={"width: " + getRiskScore(neo) + "%"}></span></div>
                </button>
                <div class="neo-card-footer">
                  <span>{savedIds.has(neo.id) ? "IN YOUR ORBIT" : getRisk(neo).detail.toUpperCase()}</span>
                  <button class="add-button" class:added={savedIds.has(neo.id)} disabled={savedIds.has(neo.id) || addingId === neo.id} on:click={() => addNeo(neo)}>
                    {addingId === neo.id ? "SCANNING" : savedIds.has(neo.id) ? "ADDED" : "ADD +"}
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </main>
    {:else if view === "detail"}
      <main class="page-content detail-view">
        <button class="back-button" on:click={backFromDetail}>← BACK TO {lastView === "dashboard" ? "DASHBOARD" : "CATALOGUE"}</button>
        {#if selectedNeo}
          <section class="detail-grid">
            <div class="detail-scene panel">
              <div class="panel-header"><span>OBJECT PREVIEW</span><span class="signal"><i></i>{getRisk(selectedNeo).detail.toUpperCase()}</span></div>
              <div class="detail-scene-frame">
                <AsteroidPreview neo={selectedNeo} />
              </div>
            </div>
            <div class="detail-copy">
              <div class="eyebrow">NASA / JPL SMALL BODY RECORD</div>
              <h1>{selectedNeo.name}</h1>
              <div class={"detail-risk " + getRisk(selectedNeo).tone}><span>{getRisk(selectedNeo).label}</span><small>{getRisk(selectedNeo).detail}</small></div>
              <p class="detail-lede">A close approach object observed near your anchor date. Use the values below as the real-world record; this close-up keeps the asteroid centred so you can study its shape and spin.</p>
              <div class="detail-stat-grid">
                <div><span>DIAMETER</span><strong>{formatNumber(getDiameterKm(selectedNeo), 2)} <small>KM</small></strong></div>
                <div><span>RELATIVE SPEED</span><strong>{formatNumber(getSpeedKps(selectedNeo), 2)} <small>KM/S</small></strong></div>
                <div><span>MISS DISTANCE</span><strong>{formatDistance(selectedNeo)}</strong></div>
                <div><span>INCLINATION</span><strong>{formatNumber(Number(selectedNeo.orbital_data?.inclination), 1)} <small>°</small></strong></div>
              </div>
              <div class="appearance-note">
                <div>
                  <span>APPEARANCE PROFILE</span>
                  <strong>{selectedNeo.physical?.spectralClass || "PROCEDURAL ROCK"}</strong>
                </div>
                <p>
                  {#if selectedNeo.physical}
                    JPL physical data is guiding the material and spin.
                    {#if selectedNeo.physical.rotationPeriodHours}
                      Rotation period: {formatNumber(selectedNeo.physical.rotationPeriodHours, 1)} hours.
                    {/if}
                  {:else}
                    No published mesh shape is included in the close-approach feed, so a stable procedural profile keeps this object unique.
                  {/if}
                </p>
              </div>
              <div class="detail-actions">
                <button class="arcade-button" on:click={() => addNeo(selectedNeo)} disabled={savedIds.has(selectedNeo.id) || addingId === selectedNeo.id}>
                  {addingId === selectedNeo.id ? "READING JPL PROFILE" : savedIds.has(selectedNeo.id) ? "ALREADY IN ORBIT" : "ADD TO DASHBOARD"} <span>→</span>
                </button>
                <a class="ghost-button link-button" href={selectedNeo.nasa_jpl_url} target="_blank" rel="noreferrer">OPEN NASA RECORD ↗</a>
              </div>
              <div class="detail-source">CLOSE APPROACH // {formatDate(getApproach(selectedNeo).close_approach_date)} // EARTH</div>
            </div>
          </section>
        {/if}
      </main>
    {:else if view === "about"}
      <main class="page-content about-view">
        <button class="back-button" on:click={() => (view = lastView || "dashboard")}>← BACK TO {lastView === "catalogue" ? "CATALOGUE" : "DASHBOARD"}</button>
        <section class="page-heading about-hero">
          <div>
            <div class="eyebrow">FIELD GUIDE // NASA + JPL</div>
            <h1>How to read your sky.</h1>
            <p class="page-lede">
              NEO Finder turns a real close-approach data set into a small, explorable planetarium.
              These notes explain what the labels mean, where the numbers come from and why the objects matter.
            </p>
          </div>
          <div class="about-orbit-badge" aria-hidden="true"><span>NEO</span><small>LEARN // TRACK // PLAY</small></div>
        </section>

        <section class="about-grid">
          <article class="about-card">
            <div class="about-index">01 // THE OBJECTS</div>
            <h2>What is a NEO?</h2>
            <p>
              A near-Earth object is an asteroid or comet whose orbit can bring it within 1.3 astronomical units
              of the Sun. Most known NEOs are asteroids. “Near” describes orbital geometry, not a prediction of impact.
            </p>
            <a href="https://cneos.jpl.nasa.gov/glossary/NEO.html" target="_blank" rel="noreferrer">READ CNEOS GLOSSARY ↗</a>
          </article>
          <article class="about-card">
            <div class="about-index">02 // THE LABELS</div>
            <h2>Decode the tags.</h2>
            <div class="about-tag-list">
              {#each tagLegend as tag}
                <div class="about-tag-row">
                  <span class={"risk-tag " + tag.tone}>{tag.label}</span>
                  <p><strong>{tag.title}.</strong> {tag.copy}</p>
                </div>
              {/each}
            </div>
            <a href="https://cneos.jpl.nasa.gov/about/neo_groups.html" target="_blank" rel="noreferrer">SEE NASA GROUP DEFINITIONS ↗</a>
          </article>
          <article class="about-card">
            <div class="about-index">03 // THE DATA</div>
            <h2>Numbers with a paper trail.</h2>
            <p>
              The catalogue starts with NASA’s NeoWs feed: approach date, miss distance, estimated diameter and
              relative velocity. When you add an object, NEO Finder can also ask JPL’s Small-Body Database for
              physical clues such as albedo, spectral class and rotation period.
            </p>
            <a href="https://ssd-api.jpl.nasa.gov/doc/sbdb.html" target="_blank" rel="noreferrer">OPEN JPL SBDB DOCS ↗</a>
          </article>
          <article class="about-card">
            <div class="about-index">04 // WHY IT MATTERS</div>
            <h2>Planetary defence, made legible.</h2>
            <p>
              Astronomers use repeated observations to improve an object’s orbit and estimate how it moves through
              space. Learning the vocabulary helps separate a measured close pass from a sensational headline:
              a PHA flag is a screening category, not an impact forecast.
            </p>
            <a href="https://science.nasa.gov/solar-system/asteroids/facts/" target="_blank" rel="noreferrer">VISIT NASA ASTEROID FACTS ↗</a>
          </article>
        </section>

        <section class="tracking-steps">
          <div class="about-index">05 // HOW A SIGNAL BECOMES AN ORBIT</div>
          <div class="tracking-step-grid">
            <div class="tracking-step"><span>01</span><strong>TELESCOPE</strong><p>Sky surveys and follow-up observations record a moving point against the stars.</p></div>
            <div class="tracking-step"><span>02</span><strong>MINOR PLANET CENTER</strong><p>Observations are shared so independent sightings can be connected to one object.</p></div>
            <div class="tracking-step"><span>03</span><strong>JPL / CNEOS</strong><p>Orbit solutions and close-approach geometry are refined as more observations arrive.</p></div>
            <div class="tracking-step"><span>04</span><strong>YOUR ORBIT LOG</strong><p>We scale the record into a playful scene while keeping the source measurements visible.</p></div>
          </div>
        </section>

        <section class="about-sources">
          <span class="about-index">SOURCE DECK</span>
          <div class="source-links">
            <a href="https://api.nasa.gov" target="_blank" rel="noreferrer">NASA OPEN APIs ↗</a>
            <a href="https://www.jpl.nasa.gov/edu/resources/teachable-moment/how-nasa-studies-and-tracks-asteroids-near-and-far/" target="_blank" rel="noreferrer">JPL TRACKING GUIDE ↗</a>
            <a href="https://cneos.jpl.nasa.gov/" target="_blank" rel="noreferrer">CNEOS ↗</a>
          </div>
        </section>
      </main>
    {:else if view === "settings"}
      <main class="page-content settings-view">
        <section class="page-heading">
          <div>
            <div class="eyebrow">PROFILE CONSOLE // LOCAL DEVICE</div>
            <h1>Customise your Earth.</h1>
            <p class="page-lede">Tune a spherical landmass field, inspect the live draft, then save it to your profile.</p>
          </div>
          <div class="settings-heading-actions">
            <button class="ghost-button compact" on:click={cancelSettings}>CANCEL</button>
            <button class="arcade-button compact" on:click={saveEarthSettings}>SAVE EARTH <span>✓</span></button>
          </div>
        </section>
        <section class="settings-grid">
          <div class="settings-card earth-settings-card">
            <div class="panel-header"><span>EARTH IDENTITY</span><span class="panel-index">A-01</span></div>
            <label for="earth-name">DISPLAY NAME</label>
            <input id="earth-name" bind:value={draftEarthName} on:input={handleDraftEarthNameInput} maxlength="18" />
            <div class="theme-label"><span>VISUAL SCHEME</span><span>SELECT ONE</span></div>
            <div class="theme-grid">
              {#each earthThemes as theme}
                <button class:active={draftEarthTheme === theme.id} class="theme-option" style={"--theme-color: " + theme.color + "; --theme-surface: " + theme.surface} on:click={() => updateDraftEarthTheme(theme.id)}>
                  <span class="theme-swatch"></span><span>{theme.name}</span>{#if draftEarthTheme === theme.id}<b>✓</b>{/if}
                </button>
              {/each}
            </div>
            <div class="theme-label"><span>LANDMASS STYLE</span><span>PROCEDURAL FIELD</span></div>
            <div class="pattern-grid">
              {#each earthPatterns as pattern}
                <button class:active={draftEarthPattern === pattern.id} class="pattern-option" on:click={() => updateDraftEarthPattern(pattern.id)}>
                  <span class={"pattern-swatch pattern-" + pattern.id}></span>
                  <span><strong>{pattern.name}</strong><small>{pattern.detail}</small></span>
                  {#if draftEarthPattern === pattern.id}<b>✓</b>{/if}
                </button>
              {/each}
            </div>
            <p class="settings-copy style-note">A style sets a useful starting point; after that, the sliders are the authority.</p>
            <div class="theme-label slider-heading"><span>PLANETARY MORPHOLOGY</span><span>DRAG TO PREVIEW</span></div>
            <div class="landmass-controls">
              {#each landmassControls as control}
                <label class="slider-control" for={"landmass-" + control.key}>
                  <span><strong>{control.label}</strong><output>{formatLandmassValue(control.key, draftLandmassConfig[control.key])}</output></span>
                  <input
                    id={"landmass-" + control.key}
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={draftLandmassConfig[control.key]}
                    on:input={(event) => updateLandmassParam(control.key, event)}
                  />
                  <small>{control.help}</small>
                </label>
              {/each}
            </div>
            <div class="color-controls">
              <label class="color-control"><span>LANDMASS COLOR</span><input type="color" bind:value={draftLandColor} /></label>
              <label class="color-control"><span>FLUID COLOR</span><input type="color" bind:value={draftFluidColor} /></label>
              <label class="color-control"><span>ATMOSPHERE</span><input type="color" bind:value={draftAtmosphereColor} /></label>
            </div>
            <label class="toggle-row">
              <input type="checkbox" bind:checked={draftAtmosphereEnabled} />
              <span>ATMOSPHERE LAYER</span>
              <small>{draftAtmosphereEnabled ? "GLOW SHELL ON" : "GLOW SHELL OFF"}</small>
            </label>
            <p class="settings-copy colour-note">The map samples warped 3D noise on a sphere, then layers fractal coast detail and cellular breakup. Draft changes stay local until you press SAVE EARTH.</p>
          </div>
          <div class="settings-card preview-settings-card">
            <div class="panel-header"><span>UNSAVED PLANET PREVIEW</span><span class="panel-index">A-02</span></div>
            <div class="settings-preview-frame">
              <SpaceScene
                compact={true}
                neos={[]}
                earthTheme={draftEarthTheme}
                earthPattern={draftEarthPattern}
                landColor={draftLandColor}
                fluidColor={draftFluidColor}
                atmosphereColor={draftAtmosphereColor}
                atmosphereEnabled={draftAtmosphereEnabled}
                landmassConfig={draftLandmassConfig}
              />
            </div>
            <p class="settings-copy preview-copy"><strong>LIVE DRAFT.</strong> Move any slider or choose a style to redraw the same 3D Earth texture used by the dashboard. Save when the silhouette feels right; CANCEL discards the draft.</p>
          </div>
          <div class="settings-card">
            <div class="panel-header"><span>NASA ACCESS</span><span class="panel-index">A-03</span></div>
            <p class="settings-copy">Use your own NASA developer key for the full hourly quota. The default demo key is fine for a quick scan but is rate-limited.</p>
            <label for="settings-token">API TOKEN</label>
            <input id="settings-token" bind:value={tokenDraft} type="password" autocomplete="off" placeholder="DEMO_KEY or your token" />
            <div class="settings-actions">
              <button class="arcade-button compact" on:click={saveTokenFromSettings}>SAVE TOKEN</button>
              <a class="text-link" href="https://api.nasa.gov" target="_blank" rel="noreferrer">GET A KEY ↗</a>
            </div>
            <div class="setting-status"><span class="status-dot"></span>{token ? "CUSTOM NASA KEY STORED" : "DEMO KEY / FALLBACK MODE"}</div>
          </div>
        </section>
        <section class="settings-footnote">
          <span>FEATURE FLAG STATUS</span>
          <strong>{featureFlags.requireNasaToken ? "TOKEN GATE ON" : "TOKEN GATE OFF"}</strong>
          <small>Configure VITE_REQUIRE_NASA_TOKEN in .env before building when you want to enforce the token screen.</small>
        </section>
      </main>
    {/if}
  </div>
{/if}
