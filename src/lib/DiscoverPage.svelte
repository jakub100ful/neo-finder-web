<script>
  import { createEventDispatcher, onMount } from "svelte";
  import { demoNeos } from "./data/demo-neos.js";
  import { formatNumber } from "./neo.js";
  import {
    createDiscoverDatasetFromNeos,
    DISCOVER_MODES,
    fetchDiscoverDataset,
    getDiscoverMetric,
    getPrimaryApproach,
    getRankedDiscoverRecords,
    resetDiscoverDatasetCache,
    toNeoObject
  } from "./discover.js";

  const dispatch = createEventDispatcher();
  const modeLabels = {
    [DISCOVER_MODES.closest]: "CLOSEST",
    [DISCOVER_MODES.fastest]: "FASTEST",
    [DISCOVER_MODES.largest]: "LARGEST"
  };

  let dataset = null;
  let records = [];
  let mode = DISCOVER_MODES.closest;
  let meshOnly = false;
  let phaOnly = false;
  let maxDistanceAu = 0.05;
  let approachWindowDays = 365;
  let loading = true;
  let refreshing = false;
  let errorMessage = "";

  $: rankedRecords = getRankedDiscoverRecords(records, {
    mode,
    meshOnly,
    phaOnly,
    maxDistanceAu: mode === DISCOVER_MODES.largest ? null : maxDistanceAu,
    approachWindowDays: dataset?.source === "LOCAL DEMO" ? null : approachWindowDays
  });
  $: verifiedMeshCount = records.filter((record) => record.mesh?.status === "verified").length;
  $: datasetIsStale = Boolean(dataset?.generatedAt && Date.now() - Date.parse(dataset.generatedAt) > 48 * 60 * 60 * 1000);
  $: scopeLabel = mode === DISCOVER_MODES.largest
    ? "KNOWN EFFECTIVE DIAMETERS"
    : `EARTH APPROACHES // NEXT ${windowLabel(approachWindowDays)}`;

  onMount(() => {
    void loadDataset();
  });

  async function loadDataset({ refresh = false } = {}) {
    if (refresh) {
      resetDiscoverDatasetCache();
      refreshing = true;
    } else {
      loading = true;
    }
    errorMessage = "";

    try {
      dataset = await fetchDiscoverDataset({ allowCache: !refresh });
      records = dataset.records || [];
    } catch (error) {
      dataset = createDiscoverDatasetFromNeos(demoNeos, { source: "LOCAL DEMO" });
      records = dataset.records;
      errorMessage = "Discover signal unavailable. A local demo set is shown; generated rankings will return on the next refresh.";
      console.warn("NEO Finder Discover dataset unavailable", error);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function openRecord(record) {
    dispatch("openDetail", record.neo || toNeoObject(record));
  }

  function addRecord(record) {
    dispatch("addNeo", record.neo || toNeoObject(record));
  }

  function dateLabel(value) {
    if (!value) return "UNKNOWN DATE";
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value).replace(/\s+\d{2}:\d{2}$/, "");
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).toUpperCase();
  }

  function windowLabel(days) {
    if (days >= 3650) return "10 YEARS";
    return `${days || 365} DAYS`;
  }

  function formatMetric(record) {
    const metric = getDiscoverMetric(record, mode);
    if (metric === null) return "UNKNOWN";
    if (mode === DISCOVER_MODES.largest) return `${formatNumber(metric, 2)} KM`;
    if (mode === DISCOVER_MODES.fastest) return `${formatNumber(metric, 2)} KM/S`;
    return `${formatNumber(metric, 5)} AU`;
  }

  function metricCaption() {
    if (mode === DISCOVER_MODES.largest) return "EFFECTIVE DIAMETER";
    if (mode === DISCOVER_MODES.fastest) return "EARTH-RELATIVE SPEED";
    return "MISS DISTANCE";
  }

  function approachFor(record) {
    return getPrimaryApproach(record, mode);
  }

  function secondaryDiameter(record) {
    const diameter = record.physical?.diameterKm;
    return diameter === null || diameter === undefined ? "UNKNOWN" : `${formatNumber(diameter, 2)} KM`;
  }

  function secondarySpeed(record) {
    const approach = approachFor(record);
    return approach?.relativeVelocityKmS === null || approach?.relativeVelocityKmS === undefined
      ? "UNKNOWN"
      : `${formatNumber(approach.relativeVelocityKmS, 1)} KM/S`;
  }

  function secondaryDistance(record) {
    const approach = approachFor(record);
    return approach?.distanceLd === null || approach?.distanceLd === undefined
      ? "UNKNOWN"
      : `${formatNumber(approach.distanceLd, 2)} LD`;
  }
</script>

<main class="page-content discover-view" data-discover-view>
  <section class="page-heading discover-heading">
    <div>
      <div class="eyebrow">DISCOVERY DECK // NASA + JPL</div>
      <h1>Find the standouts.</h1>
      <p class="page-lede">
        Browse near-Earth objects by approach geometry and known size. A PDS badge means a verified local shape model can be rendered.
      </p>
    </div>
    <div class="heading-actions">
      <button class="ghost-button" on:click={() => loadDataset({ refresh: true })} disabled={loading || refreshing}>
        {refreshing ? "REFRESHING..." : "REFRESH DATA"}
      </button>
    </div>
  </section>

  {#if errorMessage}
    <div class="inline-alert"><span>!</span>{errorMessage}</div>
  {/if}

  <section class="discover-console" aria-label="Discover controls">
    <div class="discover-console-heading">
      <div>
        <span class="tip-label">RANKING MODE</span>
        <strong>{scopeLabel}</strong>
      </div>
      <span class="legend-note">{records.length} OBJECTS // {verifiedMeshCount} VERIFIED PDS MESH{verifiedMeshCount === 1 ? "" : "ES"}</span>
    </div>
    <div class="discover-tabs" role="tablist" aria-label="Discovery ranking">
      {#each Object.entries(modeLabels) as [key, label]}
        <button
          class:active={mode === key}
          role="tab"
          aria-selected={mode === key}
          on:click={() => (mode = key)}
        >
          {label}
        </button>
      {/each}
    </div>
    <div class="discover-filters">
      <label class="discover-toggle">
        <input type="checkbox" bind:checked={meshOnly} />
        <span>RENDER-READY MESH ONLY</span>
      </label>
      <label class="discover-toggle">
        <input type="checkbox" bind:checked={phaOnly} />
        <span>PHA ONLY</span>
      </label>
      {#if mode !== DISCOVER_MODES.largest}
        <label class="discover-range">
          <span>APPROACH WINDOW</span>
          <select bind:value={approachWindowDays}>
            <option value={30}>30 DAYS</option>
            <option value={365}>365 DAYS</option>
            <option value={3650}>10 YEARS</option>
          </select>
        </label>
        <label class="discover-range">
          <span>MAX MISS DISTANCE</span>
          <select bind:value={maxDistanceAu}>
            <option value={0.01}>0.01 AU</option>
            <option value={0.05}>0.05 AU</option>
            <option value={0.1}>0.10 AU</option>
          </select>
        </label>
      {/if}
      <span class:stale={datasetIsStale} class="discover-generated">{datasetIsStale ? "STALE DATA // " : "DATA "}{dataset?.generatedAt ? dateLabel(dataset.generatedAt.slice(0, 10)) : "LOADING"}</span>
    </div>
  </section>

  {#if loading}
    <div class="catalogue-grid discover-grid" aria-busy="true">
      {#each Array(6) as _}
        <div class="neo-card skeleton-card" aria-hidden="true"><div class="skeleton-line wide"></div><div class="skeleton-line"></div><div class="skeleton-block"></div></div>
      {/each}
    </div>
  {:else if !rankedRecords.length}
    <section class="discover-empty">
      <span class="tip-label">NO MATCHING OBJECTS</span>
      <h2>Try a wider signal.</h2>
      <p>There are no records matching the current ranking and filters. Clear one of the filters or expand the miss-distance window.</p>
    </section>
  {:else}
    <div class="catalogue-grid discover-grid">
      {#each rankedRecords as record, index (record.canonicalId)}
        {@const approach = approachFor(record)}
        <article class:discover-mesh-card={record.mesh?.status === "verified"} class="neo-card discover-card">
          <button class="neo-card-body" on:click={() => openRecord(record)}>
            <div class="neo-card-topline">
              <span class="neo-index">DISCOVER // {(index + 1).toString().padStart(2, "0")}</span>
              <div class="discover-card-tags">
                {#if record.isPha}<span class="risk-tag danger">PHA</span>{/if}
                {#if record.mesh?.status === "verified"}<span class="risk-tag mesh-tag">PDS MESH</span>{/if}
              </div>
            </div>
            <h2>{record.name}</h2>
            <div class="neo-card-date">{approach ? dateLabel(approach.date) : "OBJECT PROFILE // NO APPROACH IN WINDOW"}</div>
            <div class="discover-primary-metric">
              <small>{metricCaption()}</small>
              <strong>{formatMetric(record)}</strong>
            </div>
            <div class="neo-stats">
              <span><small>SIZE</small><strong>{secondaryDiameter(record)}</strong></span>
              <span><small>SPEED</small><strong>{secondarySpeed(record)}</strong></span>
              <span><small>MISS</small><strong>{secondaryDistance(record)}</strong></span>
            </div>
          </button>
          <div class="neo-card-footer discover-card-footer">
            <span>{record.mesh?.status === "verified" ? record.mesh.modelType : record.isPha ? "PHA CLASSIFICATION" : "JPL NEO RECORD"}</span>
            <button class="add-button" on:click|stopPropagation={() => addRecord(record)}>ADD +</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</main>

<style>
  .discover-view {
    padding-bottom: 5rem;
  }

  .discover-heading {
    margin-bottom: 1.5rem;
  }

  .discover-console {
    margin-bottom: 1.5rem;
    padding: 1rem;
    border: 1px solid var(--line);
    background: rgba(13, 14, 36, 0.76);
  }

  .discover-console-heading,
  .discover-filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .discover-console-heading strong {
    display: block;
    margin-top: 0.35rem;
    color: #dedbee;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
  }

  .discover-tabs {
    display: flex;
    gap: 0.4rem;
    margin: 1rem 0;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid rgba(151, 146, 206, 0.14);
  }

  .discover-tabs button {
    padding: 0.65rem 0.85rem;
    border: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .discover-tabs button:hover,
  .discover-tabs button.active {
    border-color: var(--cyan);
    color: var(--cyan);
    background: rgba(25, 74, 105, 0.28);
  }

  .discover-filters {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .discover-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .discover-toggle input {
    width: 0.9rem;
    height: 0.9rem;
    accent-color: var(--cyan);
  }

  .discover-toggle:has(input:checked) {
    color: var(--cyan);
  }

  .discover-range {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--dim);
    font-size: 0.55rem;
    letter-spacing: 0.08em;
  }

  .discover-range select {
    padding: 0.42rem 0.5rem;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--cyan);
    font: inherit;
  }

  .discover-generated {
    margin-left: auto;
    color: var(--dim);
    font-size: 0.52rem;
    letter-spacing: 0.08em;
  }

  .discover-generated.stale {
    color: var(--yellow);
  }

  .discover-grid {
    align-items: stretch;
  }

  .discover-card {
    min-height: 19rem;
  }

  .discover-card.discover-mesh-card {
    border-color: rgba(97, 231, 255, 0.42);
  }

  .discover-card-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.3rem;
  }

  .mesh-tag {
    border-color: rgba(97, 231, 255, 0.5);
    color: var(--cyan);
  }

  .discover-primary-metric {
    display: grid;
    gap: 0.35rem;
    margin-top: 1.2rem;
    padding: 0.8rem 0;
    border-top: 1px solid rgba(151, 146, 206, 0.14);
    border-bottom: 1px solid rgba(151, 146, 206, 0.14);
  }

  .discover-primary-metric small {
    color: var(--dim);
    font-size: 0.53rem;
    letter-spacing: 0.08em;
  }

  .discover-primary-metric strong {
    color: var(--cyan);
    font-family: Arcade, monospace;
    font-size: 1.15rem;
    font-weight: 400;
    letter-spacing: 0.04em;
  }

  .discover-card-footer {
    align-items: center;
  }

  .discover-card-footer .add-button {
    flex: 0 0 auto;
  }

  .discover-empty {
    max-width: 34rem;
    margin: 3rem auto;
    padding: 2rem;
    border: 1px solid var(--line);
    background: rgba(13, 14, 36, 0.72);
    text-align: center;
  }

  .discover-empty h2 {
    margin: 0.8rem 0 0.5rem;
    color: #e6e3f1;
    font-family: Arcade, monospace;
    font-size: 1.1rem;
    font-weight: 400;
  }

  .discover-empty p {
    margin: 0;
    color: var(--muted);
    font-size: 0.7rem;
    line-height: 1.6;
  }

  @media (max-width: 720px) {
    .discover-console-heading,
    .discover-filters {
      align-items: flex-start;
      flex-direction: column;
    }

    .discover-generated {
      margin-left: 0;
    }

    .discover-tabs {
      overflow-x: auto;
    }

    .discover-tabs button {
      flex: 0 0 auto;
    }
  }
</style>
