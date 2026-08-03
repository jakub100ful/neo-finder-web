# Published NEO shape models

These local OBJ files are validated browser assets for the PDS Catalogue. The
Small Body Radar Shape Models products are published by the NASA PDS Small
Bodies Node as PDS4 ASCII `.tab` files. The ingestion script validates their
vertex/facet records and preserves the OBJ-compatible text as local `.obj`
assets for the existing Three.js loader.

Run `npm run ingest:radar-shapes` to refresh the official source files, or
`npm run check:radar-shapes` to validate the checked-in assets. The manifest and
PDS/JPL metadata live in `src/lib/radar-shape-models.js` and the cached catalogue
is `static/data/pds-catalogue.json`.

Archive: https://sbn.psi.edu/pds/resource/rshape.html

Bundle: `urn:nasa:pds:compil.ast.radar.shape-models::1.0`

DOI: `10.26033/vtj1-tb13`

The models are preliminary radar-derived shape reconstructions, not optical
photographs. Their coordinates are in kilometres and the app normalizes each
mesh to the visual scale used by the orbital scene.
