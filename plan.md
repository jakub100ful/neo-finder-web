# Discover Page — Implementation Plan

## Outcome

Add a `Discover` view where users can browse NASA/JPL NEOs ranked by:

- closest Earth close approach;
- fastest Earth-relative close approach;
- largest known effective diameter.

The view should support a `Verified PDS mesh only` filter and open the selected object in the existing detail/Three.js renderer.

The recommended first release is a generated, cached dataset joined with the app's verified PDS mesh catalogue. PDS Search should be used for candidate discovery and verification, not as a live per-card dependency or as proof that no mesh exists.

## Implementation status

- [x] Generated NASA/JPL Discover dataset with closest, fastest, and largest rankings.
- [x] Discover navigation, ranking controls, approach-window, distance, PHA, and verified-PDS filters.
- [x] Canonical identifier joins, cached loading, stale/error states, and demo fallback.
- [x] Detail-page handoff and existing PDS mesh renderer integration.
- [x] Unit tests, Svelte diagnostics, production build, and browser smoke verification.
- [ ] Optional live serverless refresh endpoint; intentionally deferred until deployment/runtime requirements are known.

## Research decisions

- Use JPL's [Close Approach Data API](https://ssd-api.jpl.nasa.gov/doc/cad.html) for closest and fastest rankings. It supports NEO/Earth filters, date windows, distance, `v-rel`, `dist`, optional diameter, and server-side sorting.
- Use JPL's [SBDB Query API](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) with `sb-group=neo&sb-kind=a` for the object-level largest-NEO ranking. Request `diameter`, `diameter_sigma`, `H`, `neo`, `pha`, `spkid`, and naming fields.
- Keep NASA [NeoWs](https://api.nasa.gov/) as the NASA detail/approach source already used by the app. Do not use it as the primary ranking database.
- Treat the existing `PDS_MESH_CATALOG` in `src/lib/pds-mesh.js` as the verified renderable mesh index.
- PDS Search can resolve products and search metadata, but its documentation warns that the registry is not fully populated. A PDS miss must be labelled `not found in verified index`, not `no mesh exists`.
- The current renderer loads OBJ assets. New PDS shape data should be validated and preferably converted to a browser-friendly OBJ or GLB during ingestion rather than downloaded and parsed arbitrarily in the browser.
- JPL SBDB/CAD and PDS responses should not be assumed to be browser-CORS-safe. The first implementation should fetch them at build time; a cached serverless endpoint can be added later for live refreshes.

## Scope

### In scope

- A new `DISCOVER` navigation item and view in `src/routes/+page.svelte`.
- Three ranking modes: `CLOSEST`, `FASTEST`, and `LARGEST`.
- Earth as the initial approach body.
- A visible date-window label, defaulting to the next 365 days for approach rankings.
- PHA and verified-PDS-mesh filters.
- Canonical identifier resolution across NeoWs IDs, JPL designations, SPK IDs, names, and aliases.
- Generated data with a visible `generatedAt` timestamp and stale/error states.
- Reuse of `AsteroidPreview.svelte`, `SpaceScene.svelte`, detail navigation, saved objects, and existing mesh loading/cache behavior.
- Unit, build, and manual visual verification.

### Not in the first release

- A single composite “danger score” or impact-probability ranking.
- Arbitrary historical date ranges fetched live from the browser.
- Automatically downloading and converting every possible PDS dataset.
- Treating every PDS product mentioning an asteroid as a renderable mesh.
- Replacing the current procedural fallback. Unknown or unsupported shapes must remain viewable.

## Data architecture

```text
JPL CAD API ───────┐
                   ├─> refresh/normalization ─> static/data/discover.json
JPL SBDB Query ────┘                                  │
                                                     ▼
                         canonical ID resolver + PDS_MESH_CATALOG join
                                                     │
                                                     ▼
                                           Discover Svelte view
                                                     │
                                                     ▼
                                     existing detail/mesh renderer
```

### Proposed normalized record

```js
{
  canonicalId: "jpl-spkid-or-pdes",
  neowsId: "2099942",
  spkid: "20099942",
  pdes: "99942",
  name: "99942 Apophis (2004 MN4)",
  isNeo: true,
  isPha: true,
  physical: {
    diameterKm: 0.34,
    diameterSigmaKm: 0.04,
    H: 19.09
  },
  approaches: [
    {
      body: "Earth",
      date: "2029-Apr-13 21:46",
      distanceAu: 0.000254,
      distanceLd: 0.0988,
      relativeVelocityKmS: 7.42,
      vInfinityKmS: 5.84
    }
  ],
  mesh: {
    status: "verified",
    pdsBundle: "urn:nasa:pds:...",
    assetUrl: "/models/neos/apophis_v233s7.obj",
    format: "obj",
    sourceUrl: "https://..."
  }
}
```

Implementation should tolerate missing diameter, uncertainty, NeoWs ID, PHA flag, and mesh fields. Missing numeric values sort last and display `UNKNOWN` rather than being converted to zero.

## API ingestion

### Close-approach dataset

Use an explicit bounded query rather than relying on API defaults:

```text
https://ssd-api.jpl.nasa.gov/cad.api
  ?neo=true
  &body=Earth
  &date-min=now
  &date-max=%2B365
  &dist-max=0.05
  &sort=dist
  &limit=500
  &diameter=true
  &fullname=true
```

For fastest mode, use the same candidate set with `sort=-v-rel`. Normalize each row using the returned `fields` array because CAD returns column-oriented data.

The UI must distinguish `dist` (event miss distance) from orbital MOID. It must label `v-rel` as Earth-relative approach speed.

### Largest-NEO dataset

Use a build-time SBDB query similar to:

```text
https://ssd-api.jpl.nasa.gov/sbdb_query.api
  ?sb-group=neo
  &sb-kind=a
  &fields=spkid,full_name,pdes,name,neo,pha,H,diameter,diameter_sigma
  &sort=-diameter
  &limit=250
```

This is a ranking of known effective diameters, not a claim that every NEO has a measured physical size. The UI should show the uncertainty when available and keep unknown diameters visible only when useful for browsing.

### Candidate inclusion for mesh filtering

To make `Verified PDS mesh only` correct, the refresh step must:

1. include the normal top-ranked candidates;
2. force-include every object currently present in `PDS_MESH_CATALOG`;
3. deduplicate by canonical JPL identity;
4. apply ranking after the mesh join.

This prevents a known mesh object from disappearing simply because it falls outside the default top-N API response.

## Identifier resolution

Add a shared resolver, ideally in `src/lib/neo.js` or a new `src/lib/neo-identifiers.js`, that creates normalized aliases from:

- NeoWs `id` and `neo_reference_id`;
- JPL `spkid` and alternate SPK IDs;
- JPL `pdes`/numbered designation;
- primary designation;
- IAU name;
- full name and historical designation.

For example, Apophis must join NeoWs `2099942` with JPL/PDS `99942`, SPK `20099942`, `2004 MN4`, and `Apophis`.

The resolver should be deterministic, unit-tested, and used by both the Discover dataset and the existing PDS mesh lookup.

## PDS mesh workflow

### Runtime behavior

The Discover page should perform a local lookup against `PDS_MESH_CATALOG` after data loading. It should not issue one PDS request per card or per filter change.

Mesh states:

- `verified`: a validated local asset can be rendered;
- `candidate`: PDS metadata was found but geometry has not been ingested/validated;
- `unsupported`: shape-related data exists but is not currently convertible/renderable;
- `not-indexed`: no verified local record is known; this is not proof of absence.

Only `verified` objects should pass the default mesh-only filter.

### Ingestion workflow for new shapes

Add a maintenance script or documented manual workflow that:

1. searches PDS using canonical aliases and exact metadata queries where possible;
2. resolves the bundle/collection/product hierarchy;
3. confirms the product is a shape model or geometry dataset;
4. identifies the actual geometry file and units;
5. converts supported table/facet formats to OBJ/GLB if necessary;
6. validates vertex/face counts, scale, normals, and loadability;
7. records the PDS LID/LIDVID, DOI/source URL, format, units, and attribution;
8. adds the asset and aliases to `PDS_MESH_CATALOG`.

The UI wording should be `Official PDS shape model` or `PDS radar-derived shape model`, not `photographed asteroid` or `exact physical scan`.

## UI plan

Add `DISCOVER` beside `DASHBOARD` and `CATALOGUE`.

Recommended controls:

- ranking tabs: `CLOSEST`, `FASTEST`, `LARGEST`;
- `PDS MESH ONLY` toggle;
- `PHA ONLY` toggle;
- approach window selector: `30 DAYS`, `365 DAYS`, `10 YEARS`;
- optional maximum miss-distance control for approach modes;
- refresh/generated timestamp.

Card content:

- object name and canonical designation;
- rank number;
- primary ranking metric;
- approach date for closest/fastest modes;
- distance in au and LD;
- Earth-relative speed;
- diameter and uncertainty;
- PHA status;
- mesh status and source link;
- `VIEW OBJECT` action that opens the existing detail view.

Required states:

- loading;
- stale generated data;
- API refresh/build data unavailable;
- no results after filters;
- missing physical data;
- mesh metadata found but asset unavailable;
- procedural fallback after mesh load failure.

## Implementation phases

### Phase 1 — Data contract and fixtures

- Add normalized Discover types/helpers.
- Add representative CAD/SBDB fixture responses.
- Implement column-oriented CAD row parsing.
- Implement identifier aliases and deduplication.
- Add tests for missing values and sort directions.

### Phase 2 — Build-time refresh pipeline

- Add `scripts/refresh-discover-data.mjs`.
- Fetch bounded CAD and SBDB datasets.
- Join and force-include verified PDS mesh records.
- Write `static/data/discover.json`.
- Add `generatedAt`, source URLs, query scope, and schema version.
- Make refresh failures non-destructive: retain the last generated file and report the error clearly.

### Phase 3 — Discover view

- Add navigation state and view layout to `src/routes/+page.svelte`.
- Add ranking/filter controls.
- Add responsive result cards and empty/loading states.
- Link cards to existing detail view and dashboard actions.
- Reuse existing styles and visual language.

### Phase 4 — Mesh integration

- Join every Discover record through the shared PDS resolver.
- Add verified/candidate/unsupported/not-indexed badges.
- Confirm mesh-only filtering and detail rendering for Apophis.
- Add source/DOI links and honest provenance copy.

### Phase 5 — Optional live refresh

- Only if arbitrary date ranges or fresher data are required, add a cached serverless endpoint.
- Keep JPL/PDS calls server-side.
- Apply TTL caching, request coalescing, timeout handling, and stale-data fallback.
- Do not expose a NASA API key from the server endpoint.

## Verification checklist

### Automated

- `npm test`
- `npm run check`
- `npm run build`
- unit tests for CAD/SBDB normalization;
- unit tests for closest/fastest/largest sorting;
- unit tests for identifier aliases and mesh status;
- fixture test proving mesh-only results include known mesh records;
- regression tests for existing NeoWs/detail behavior.

### Manual/browser

- Discover navigation works from intro, dashboard, catalogue, and detail views.
- Closest mode sorts ascending distance.
- Fastest mode sorts descending Earth-relative speed.
- Largest mode sorts descending known diameter and handles unknown values.
- PHA and mesh-only filters work together.
- Apophis resolves across NeoWs/JPL/PDS identifiers.
- Selecting a verified mesh object loads the real mesh.
- Selecting an unindexed object preserves the procedural fallback.
- Source links open the relevant JPL/PDS record.
- Mobile layout remains usable.
- Generated timestamp and stale/error states are understandable.

## Acceptance criteria

- Users can open a dedicated Discover view and switch between closest, fastest, and largest rankings.
- Ranking labels explain whether a value is an approach event or an object property.
- All displayed records are NEO-filtered through the selected official source.
- PDS mesh filtering is local, fast, and based only on verified renderable assets.
- A missing local PDS record is never described as proof that no PDS shape model exists.
- At least Apophis appears as a verified PDS mesh object and renders through the existing pipeline.
- No API request is made for every visible card or every local filter operation.
- The page remains useful when an external API is unavailable by showing the last generated dataset or a clear fallback state.
- Existing catalogue, dashboard, detail, procedural fallback, and mesh-loading tests continue to pass.

## Next feature — PDS Catalogue View

### Goal

Add a catalogue that lets users browse NEOs with an identified NASA PDS shape-model record, including models that are not yet imported into the app's renderer. This must be separate from `PDS MESH ONLY`, which currently means a validated local OBJ/GLB asset.

### Product distinction

Use explicit states so archive discovery is not confused with rendering readiness:

- `PDS RECORD` — a matching PDS bundle, collection, or data product was found;
- `RENDER READY` — the geometry has been downloaded, validated, and registered locally;
- `NEEDS CONVERSION` — a shape model exists but its source format or units still need ingestion;
- `UNSUPPORTED` — the product is shape-related but cannot currently be converted safely;
- `NOT INDEXED` — no verified application record is known; this is not proof of absence.

The existing filter should be renamed or relabelled `RENDER-READY MESH ONLY`. Add a separate `PDS CATALOGUE` view/filter for archive records.

### Discovery and data pipeline

1. Start with the generated NASA/JPL NEO dataset and build a stable alias set from NeoWs IDs, JPL SPK IDs, MPC numbers/designations, primary designations, names, and historical aliases.
2. Query the public [PDS Search API](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html) for exact target matches and shape-model terms. Use known Small Bodies shape-model bundles as seed searches, including the [Small Body Radar Shape Models archive](https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=EAR-A-5-DDR-RADARSHAPE-MODELS-V2.0).
3. Crawl the returned PDS hierarchy from bundle to collection to data products using the documented `members` endpoints. Search results are archive products, not guaranteed meshes.
4. Extract target identity, PDS LID/LIDVID, bundle/collection name, DOI, source/download URL, geometry filename, format, units, vertex/facet metadata, and provenance.
5. Join candidates back to the NEO dataset and deduplicate by canonical identity plus PDS product identity.
6. Write a cached `static/data/pds-catalogue.json` with `generatedAt`, query scope, source URLs, and the honest status above. Refresh failures must preserve the previous file.

PDS Search should be treated as a discovery source rather than a complete absence test: its registry may not contain every archive dataset, and a returned product may be documentation or a collection rather than geometry.

### Proposed catalogue record

```js
{
  canonicalId: "spk:20099942",
  objectName: "99942 Apophis",
  aliases: ["99942", "2004 MN4", "20099942"],
  isNeo: true,
  isPha: true,
  pds: {
    status: "render-ready",
    lid: "urn:nasa:pds:...",
    lidvid: "urn:nasa:pds:...::1.0",
    bundleName: "...",
    productType: "radar shape model",
    format: "obj",
    units: "km",
    doi: "...",
    recordUrl: "https://pds.nasa.gov/...",
    downloadUrl: "https://..."
  },
  mesh: {
    assetUrl: "/models/neos/apophis_v233s7.obj",
    format: "obj"
  }
}
```

### UI

- Add `PDS CATALOGUE` beside `DISCOVER` and `CATALOGUE`.
- Provide text search by asteroid name, number, designation, and PDS dataset.
- Add filters for `ALL PDS RECORDS`, `RENDER READY`, `NEEDS CONVERSION`, `PHA`, and `NEO ONLY`.
- Show the asteroid identity, archive/dataset name, shape-model type, provenance status, DOI/PDS links, and renderer action where available.
- Let a `RENDER READY` card open the existing detail page; let a candidate card open the official PDS record and show why it is not yet renderable.
- Display dataset timestamp and stale/error state; never make one live PDS request per card.

### Ingestion and rendering work

For each candidate selected for rendering, validate the actual geometry file, coordinate units, handedness, axis convention, normals, vertex/facet counts, and loadability. Convert supported PDS table/facet formats to OBJ or GLB during maintenance ingestion, then add the local asset and complete alias list to `PDS_MESH_CATALOG`. Preserve the original PDS attribution and source links.

### Delivery phases

1. Build PDS response fixtures and the normalized catalogue parser.
2. Add the refresh script with exact-target queries, hierarchy crawling, pagination, caching, and non-destructive writes.
3. Add the PDS Catalogue view, search, status filters, provenance links, and empty/error states.
4. Ingest and validate a first batch of well-documented NEO models, starting with the current Apophis asset and selected Small Bodies radar/optical model datasets.
5. Add per-record conversion/rendering tests and browser verification for both render-ready and candidate states.

### Acceptance criteria

- The catalogue shows PDS archive records even when no local mesh has been imported.
- `RENDER-READY MESH ONLY` continues to show only validated local geometry.
- Every PDS result has an official record URL and a clear provenance/status label.
- PDS candidates are joined to NEOs using stable aliases and do not produce false matches from provisional years or names.
- The app remains usable from the cached dataset when PDS is unavailable.
- A PDS search miss is never presented as proof that an asteroid has no shape model.

## Open decisions before implementation

1. Should the first release use the static build-time dataset only, or should we add a serverless refresh endpoint immediately?
2. Should approach rankings default to the next 365 days or the next 10 years to make more mesh-backed objects discoverable?
3. Should `LARGEST` show only known diameters, or include a separate H-magnitude/estimated-size section for objects without diameter data?

Recommended defaults: build-time dataset first, 365-day approach window with a 10-year option, and known effective diameters only in the primary largest ranking.
