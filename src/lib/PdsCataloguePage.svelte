<script>
  import { createEventDispatcher, onMount } from "svelte";
  import { formatNumber } from "./neo.js";
  import { demoNeos } from "./data/demo-neos.js";
  import {
    createPdsCatalogueFromMesh,
    fetchPdsCatalogue,
    filterPdsCatalogueRecords,
    getPdsCatalogueNeo,
    getPdsCatalogueStatusDescription,
    getPdsCatalogueStatusLabel,
    getPdsCatalogueStatusTone,
    getPdsRecordSearchUrl,
    PDS_CATALOGUE_DATA_URL,
    PDS_CATALOGUE_SCHEMA_VERSION,
    PDS_CATALOGUE_STATUSES,
    PDS_CATALOGUE_STATUS_ORDER,
    resetPdsCatalogueCache
  } from "./pds-catalogue.js";

  const dispatch = createEventDispatcher();
  const statusOptions = [
    { value: PDS_CATALOGUE_STATUSES.all, label: "ALL PDS RECORDS" },
    ...PDS_CATALOGUE_STATUS_ORDER.map((value) => ({ value, label: getPdsCatalogueStatusLabel(value) }))
  ];

  let dataset = null;
  let records = [];
  let query = "";
  let statusFilter = PDS_CATALOGUE_STATUSES.all;
  let phaOnly = false;
  let neoOnly = false;
  let loading = true;
  let refreshing = false;
  let errorMessage = "";

  $: filteredRecords = filterPdsCatalogueRecords(records, {
    query,
    status: statusFilter,
    phaOnly,
    neoOnly
  });
  $: datasetIsStale = Boolean(dataset?.generatedAt && Date.now() - Date.parse(dataset.generatedAt) > 7 * 24 * 60 * 60 * 1000);

  onMount(() => {
    void loadCatalogue();
  });

  async function loadCatalogue({ refresh = false } = {}) {
    if (refresh) {
      resetPdsCatalogueCache();
      refreshing = true;
    } else {
      loading = true;
    }
    errorMessage = "";

    try {
      dataset = await fetchPdsCatalogue({
        allowCache: !refresh,
        url: PDS_CATALOGUE_DATA_URL,
        neoRecords: demoNeos
      });
      records = dataset.records || [];
    } catch (error) {
      dataset = createPdsCatalogueFromMesh({
        source: "LOCAL VERIFIED MESH FALLBACK",
        queryScope: { fallback: true, schemaVersion: PDS_CATALOGUE_SCHEMA_VERSION }
      });
      records = dataset.records;
      errorMessage = "PDS catalogue signal unavailable. The verified local mesh manifest is shown; a search miss is not proof of absence.";
      console.warn("NEO Finder PDS catalogue unavailable", error);
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function openRenderer(record) {
    dispatch("openDetail", getPdsCatalogueNeo(record));
  }

  function goBack() {
    dispatch("back");
  }

  function dateLabel(value) {
    if (!value) return "UNKNOWN DATE";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "UNKNOWN DATE";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(date).toUpperCase();
  }

  function displayName(record) {
    return record.neo?.name || record.pds?.targetName || "UNRESOLVED PDS TARGET";
  }

  function identityLabel(record) {
    return [record.neo?.pdes, record.neo?.spkid || record.neo?.jplSpkId, record.neo?.id]
      .filter(Boolean)
      .join(" // ") || record.pds?.lid || "IDENTITY NOT RESOLVED";
  }

  function countLabel(status, recordList = records) {
    const label = getPdsCatalogueStatusLabel(status);
    const count = status === PDS_CATALOGUE_STATUSES.all
      ? recordList.length
      : recordList.filter((record) => getPdsCatalogueStatusLabel(record.pds?.status) === label).length;
    return String(count).padStart(2, "0");
  }

  function formatCount(value) {
    return value === null || value === undefined ? "UNKNOWN" : formatNumber(value, 0);
  }
</script>

<main class="page-content pds-catalogue-view" data-pds-catalogue-view>
  <section class="page-heading pds-catalogue-heading">
    <div>
      <div class="eyebrow">NASA PDS ARCHIVE // BUILD-TIME INDEX</div>
      <h1>Browse the archive.</h1>
      <p class="page-lede">
        Find NEOs with an identified PDS shape-model record, including archive products that still need conversion.
        <strong>RENDER READY</strong> is a separate local-geometry status.
      </p>
    </div>
    <div class="heading-actions">
      <button class="ghost-button" on:click={() => loadCatalogue({ refresh: true })} disabled={loading || refreshing}>
        {refreshing ? "REFRESHING..." : "REFRESH CATALOGUE"}
      </button>
      <button class="arcade-button compact" on:click={goBack}>BACK TO CATALOGUE <span>↗</span></button>
    </div>
  </section>

  {#if errorMessage}
    <div class="inline-alert"><span>!</span>{errorMessage}</div>
  {/if}

  <section class="pds-status-panel" aria-label="PDS catalogue status summary">
    <div class="pds-status-heading">
      <div>
        <span class="tip-label">PROVENANCE STATUS</span>
        <strong>{records.length} ARCHIVE RECORD{records.length === 1 ? "" : "S"}</strong>
      </div>
      <span class:stale={datasetIsStale} class="legend-note">
        {datasetIsStale ? "STALE CATALOGUE // " : "GENERATED "}{dateLabel(dataset?.generatedAt)}
      </span>
    </div>
    <div class="pds-status-grid">
      <button class="pds-status-chip all" class:active={statusFilter === PDS_CATALOGUE_STATUSES.all} on:click={() => (statusFilter = PDS_CATALOGUE_STATUSES.all)}>
        <span>ALL PDS RECORDS</span><strong>{countLabel(PDS_CATALOGUE_STATUSES.all, records)}</strong>
      </button>
      {#each PDS_CATALOGUE_STATUS_ORDER as status}
        <button class={"pds-status-chip " + getPdsCatalogueStatusTone(status)} class:active={statusFilter === status} on:click={() => (statusFilter = status)}>
          <span>{getPdsCatalogueStatusLabel(status)}</span><strong>{countLabel(status, records)}</strong>
        </button>
      {/each}
    </div>
    <p class="pds-status-note">
      PDS Search is a discovery source, not a complete absence test. A missing or unindexed result never means that no shape model exists anywhere in the archive.
    </p>
  </section>

  <section class="pds-console" aria-label="PDS catalogue filters">
    <label class="pds-search">
      <span>SEARCH TARGET / DATASET</span>
      <input bind:value={query} type="search" placeholder="APOPHIS // 99942 // SHAPE MODEL" />
    </label>
    <label class="pds-filter-select">
      <span>STATUS</span>
      <select bind:value={statusFilter}>
        {#each statusOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
    <label class="pds-toggle">
      <input type="checkbox" bind:checked={phaOnly} />
      <span>PHA ONLY</span>
    </label>
    <label class="pds-toggle">
      <input type="checkbox" bind:checked={neoOnly} />
      <span>NEO ONLY</span>
    </label>
  </section>

  {#if loading}
    <div class="pds-card-grid" aria-busy="true">
      {#each Array(3) as _}
        <div class="pds-card pds-skeleton" aria-hidden="true"><div></div><div></div><div></div><div></div></div>
      {/each}
    </div>
  {:else if filteredRecords.length}
    <div class="pds-card-grid">
      {#each filteredRecords as record, index (record.id)}
        <article class="pds-card">
          <div class="pds-card-topline">
            <span class="neo-index">PDS // {(index + 1).toString().padStart(2, "0")}</span>
            <span class={"pds-status " + getPdsCatalogueStatusTone(record.pds?.status)}>{getPdsCatalogueStatusLabel(record.pds?.status)}</span>
          </div>
          <h2>{displayName(record)}</h2>
          <div class="pds-identity">{identityLabel(record)}</div>
          <div class="pds-dataset-block">
            <strong>{record.pds?.bundleName || record.pds?.collectionName || record.pds?.productName || "UNNAMED PDS PRODUCT"}</strong>
            <span>{record.pds?.productType || "ARCHIVE PRODUCT"}</span>
          </div>
          <div class="pds-metadata-grid">
            <div><span>FORMAT</span><strong>{record.pds?.format || "UNKNOWN"}</strong></div>
            <div><span>UNITS</span><strong>{record.pds?.units || "UNKNOWN"}</strong></div>
            <div><span>VERTICES</span><strong>{formatCount(record.pds?.vertexCount)}</strong></div>
            <div><span>FACETS</span><strong>{formatCount(record.pds?.facetCount)}</strong></div>
          </div>
          <p class="pds-provenance">{getPdsCatalogueStatusDescription(record)}</p>
          <div class="pds-card-actions">
            {#if record.pds?.status === PDS_CATALOGUE_STATUSES.renderReady}
              <button class="arcade-button compact" on:click={() => openRenderer(record)}>OPEN RENDERER <span>→</span></button>
            {/if}
            <a class="ghost-button link-button" href={record.pds?.recordUrl || getPdsRecordSearchUrl(record)} target="_blank" rel="noreferrer">OPEN PDS RECORD ↗</a>
            {#if record.pds?.downloadUrl}
              <a class="pds-download-link" href={record.pds.downloadUrl} target="_blank" rel="noreferrer">DOWNLOAD SOURCE ↗</a>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <section class="pds-empty" aria-live="polite">
      <div class="empty-icon">○</div>
      <strong>{records.length ? "NO RECORDS MATCH THIS FILTER" : "NO CACHED PDS RECORDS"}</strong>
      <p>
        {#if records.length}
          Try another target, status, or provenance filter.
        {:else}
          The local catalogue is unavailable. A PDS search miss is not proof that an asteroid has no shape model.
        {/if}
      </p>
      <a class="text-link" href={getPdsRecordSearchUrl({})} target="_blank" rel="noreferrer">OPEN NASA PDS SEARCH ↗</a>
    </section>
  {/if}
</main>

<style>
  .pds-catalogue-view {
    min-width: 0;
  }

  .pds-catalogue-heading {
    align-items: end;
  }

  .pds-catalogue-heading strong {
    color: var(--green);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
  }

  .pds-status-panel,
  .pds-console,
  .pds-empty {
    border: 1px solid var(--line);
    background: rgba(13, 14, 36, 0.72);
  }

  .pds-status-panel {
    margin: -0.25rem 0 1rem;
    padding: 1rem;
  }

  .pds-status-heading,
  .pds-console,
  .pds-card-topline,
  .pds-card-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .pds-status-heading {
    justify-content: space-between;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid rgba(151, 146, 206, 0.14);
  }

  .pds-status-heading > div {
    display: grid;
    gap: 0.3rem;
  }

  .pds-status-heading strong {
    color: var(--ink);
    font-family: Arcade, monospace;
    font-size: 0.9rem;
    font-weight: 400;
    letter-spacing: 0.05em;
  }

  .legend-note.stale,
  .discover-generated.stale {
    color: var(--yellow);
  }

  .pds-status-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
    padding: 0.85rem 0;
  }

  .pds-status-chip {
    display: grid;
    min-width: 0;
    gap: 0.4rem;
    padding: 0.65rem;
    border: 1px solid var(--line);
    background: rgba(8, 10, 26, 0.55);
    color: var(--muted);
    text-align: left;
    transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
  }

  .pds-status-chip:hover,
  .pds-status-chip.active {
    border-color: var(--cyan);
    background: rgba(22, 42, 71, 0.78);
    color: var(--ink);
  }

  .pds-status-chip span {
    overflow: hidden;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pds-status-chip strong {
    color: var(--cyan);
    font-family: Arcade, monospace;
    font-size: 1.05rem;
    font-weight: 400;
  }

  .pds-status-chip.ready strong { color: var(--green); }
  .pds-status-chip.convert strong { color: var(--yellow); }
  .pds-status-chip.unsupported strong { color: var(--danger); }
  .pds-status-chip.unindexed strong { color: var(--muted); }

  .pds-status-note {
    margin: 0;
    color: var(--dim);
    font-size: 0.68rem;
    line-height: 1.6;
  }

  .pds-console {
    flex-wrap: wrap;
    margin-bottom: 1rem;
    padding: 0.75rem;
  }

  .pds-search,
  .pds-filter-select {
    display: grid;
    min-width: min(100%, 17rem);
    flex: 1 1 17rem;
    gap: 0.35rem;
  }

  .pds-search span,
  .pds-filter-select span,
  .pds-toggle span {
    color: var(--muted);
    font-size: 0.59rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .pds-search input,
  .pds-filter-select select {
    width: 100%;
    min-height: 2.3rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    background: rgba(8, 10, 26, 0.72);
    color: var(--ink);
    font: inherit;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    outline: none;
  }

  .pds-search input:focus,
  .pds-filter-select select:focus {
    border-color: var(--cyan);
    box-shadow: 0 0 0 2px rgba(97, 231, 255, 0.1);
  }

  .pds-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.3rem;
    padding: 0 0.35rem;
  }

  .pds-toggle input {
    accent-color: var(--cyan);
  }

  .pds-card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .pds-card {
    display: grid;
    min-width: 0;
    gap: 0.85rem;
    padding: 1rem;
    border: 1px solid var(--line);
    background: rgba(13, 14, 36, 0.8);
    transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
  }

  .pds-card:hover {
    border-color: rgba(97, 231, 255, 0.63);
    background: rgba(16, 21, 49, 0.94);
    transform: translateY(-3px);
  }

  .pds-card-topline {
    justify-content: space-between;
  }

  .pds-status {
    padding: 0.27rem 0.4rem;
    border: 1px solid var(--line);
    color: var(--cyan);
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .pds-status.ready { border-color: rgba(104, 223, 159, 0.55); color: var(--green); }
  .pds-status.convert { border-color: rgba(248, 214, 109, 0.5); color: var(--yellow); }
  .pds-status.unsupported { border-color: rgba(255, 107, 114, 0.55); color: var(--danger); }
  .pds-status.unindexed { color: var(--muted); }

  .pds-card h2 {
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-family: Arcade, monospace;
    font-size: 0.98rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pds-identity,
  .pds-dataset-block span {
    color: var(--muted);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    line-height: 1.5;
    text-transform: uppercase;
  }

  .pds-dataset-block {
    display: grid;
    gap: 0.35rem;
    min-height: 3.25rem;
    padding: 0.7rem;
    border-left: 2px solid var(--purple);
    background: rgba(37, 30, 74, 0.36);
  }

  .pds-dataset-block strong {
    color: #e6e3f1;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .pds-metadata-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .pds-metadata-grid div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .pds-metadata-grid span {
    color: var(--dim);
    font-size: 0.51rem;
    letter-spacing: 0.08em;
  }

  .pds-metadata-grid strong {
    overflow: hidden;
    color: var(--ink);
    font-family: Arcade, monospace;
    font-size: 0.7rem;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pds-provenance {
    min-height: 3.2rem;
    margin: 0;
    color: #aaa8c5;
    font-size: 0.7rem;
    line-height: 1.6;
  }

  .pds-card-actions {
    flex-wrap: wrap;
    align-items: stretch;
    margin-top: auto;
  }

  .pds-card-actions .arcade-button,
  .pds-card-actions .ghost-button {
    flex: 1 1 auto;
  }

  .pds-download-link {
    align-self: center;
    color: var(--cyan);
    font-size: 0.59rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-decoration: none;
  }

  .pds-download-link:hover { color: var(--ink); }

  .pds-empty {
    display: grid;
    min-height: 15rem;
    place-items: center;
    align-content: center;
    gap: 0.7rem;
    padding: 2rem;
    text-align: center;
  }

  .pds-empty .empty-icon {
    color: var(--pink);
    font-size: 2rem;
  }

  .pds-empty strong {
    color: var(--ink);
    font-family: Arcade, monospace;
    font-size: 0.88rem;
    font-weight: 400;
  }

  .pds-empty p {
    max-width: 34rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.74rem;
    line-height: 1.6;
  }

  .pds-skeleton {
    min-height: 20rem;
    opacity: 0.55;
  }

  .pds-skeleton div {
    height: 0.75rem;
    background: linear-gradient(90deg, rgba(151, 146, 206, 0.12), rgba(97, 231, 255, 0.2), rgba(151, 146, 206, 0.12));
    background-size: 200% 100%;
    animation: pds-shimmer 1.4s linear infinite;
  }

  .pds-skeleton div:nth-child(2) { width: 75%; height: 1.4rem; margin-top: 1rem; }
  .pds-skeleton div:nth-child(3) { width: 90%; height: 4rem; margin-top: 0.5rem; }
  .pds-skeleton div:nth-child(4) { width: 60%; margin-top: auto; }

  @keyframes pds-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }

  @media (max-width: 960px) {
    .pds-status-grid,
    .pds-card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pds-status-grid .pds-status-chip:first-child {
      grid-column: span 2;
    }
  }

  @media (max-width: 640px) {
    .pds-catalogue-heading,
    .pds-status-heading,
    .pds-console {
      align-items: stretch;
      flex-direction: column;
    }

    .pds-status-grid,
    .pds-card-grid {
      grid-template-columns: 1fr;
    }

    .pds-status-grid .pds-status-chip:first-child {
      grid-column: auto;
    }

    .pds-toggle {
      min-height: 2rem;
    }
  }
</style>
