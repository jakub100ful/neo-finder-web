# Small Body Radar Shape Models: research note

Research date: 2026-08-03

## Executive conclusion

The official Small Body Radar Shape Models (SBRSM) archive is a useful source for the planned bundled catalogue. The current PDS4 release contains ten shape-model products covering nine asteroids: 216 Kleopatra, 1620 Geographos, 2063 Bacchus, 4179 Toutatis (low and high resolution), 4769 Castalia, 6489 Golevka, 1998 KY26, 52760 (1998 ML14), and 25143 Itokawa. The landing page describes the same target set, although it displays “4197 Toutatis”; the PDS4 bundle label, inventory, per-product labels, and filenames consistently identify the asteroid as 4179 Toutatis. Use the PDS label spelling and identifier as canonical. [SBRSM landing page](https://sbn.psi.edu/pds/resource/rshape.html), [PDS4 bundle description](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/bundle_description.txt), [PDS4 bundle label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/bundle_compil.ast.radar.shape-models.xml)

The geometry is not stored as the same on-disk format as the current Apophis asset. Each product is a PDS4-labelled ASCII `.tab` file containing a vertex table followed by a triangular facet table. It is, however, the same basic indexed polyhedral mesh representation as the existing ASCII OBJ: `v x y z` records and 1-based triangular indices can be converted directly to OBJ `v` and `f` records. No browser renderer change is required after conversion; the app needs a deterministic ingestion/conversion step, local assets, and catalogue metadata for aliases, units, provenance, and resolution variants.

## Archive and record inventory

The current archive is PDS4 bundle `urn:nasa:pds:compil.ast.radar.shape-models::1.0`, released 2020-09-10. It was migrated from the PDS3 data set `EAR-A-5-DDR-RADARSHAPE-MODELS-V2.0`; the SBN page says the data content was unchanged by the migration. The official download links are the PDS4 ZIP (1.7 MB on the landing page; 1,800,808 bytes on a current HEAD request) and the legacy PDS3 ZIP (1.8 MB on the landing page; 1,768,845 bytes on a current HEAD request). [SBRSM landing page](https://sbn.psi.edu/pds/resource/rshape.html), [PDS4 ZIP](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models.zip), [PDS3 ZIP](https://sbnarchive.psi.edu/pds3/non_mission/EAR_A_5_DDR_RADARSHAPE_MODELS_V2_0.zip)

The PDS4 data directory exposes a bundle label, `data/`, and `document/`. The data collection contains one `.tab` geometry file and one `.xml` label per model, plus a PDS4 collection label and an inventory CSV. [PDS4 bundle directory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/), [data directory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/), [data inventory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/collection_compil.ast.radar.shape-models_data_inventory.csv)

The ten geometry files are:

| Target / variant | Geometry file | Vertices | Triangular facets | ASCII bytes |
| --- | --- | ---: | ---: | ---: |
| 216 Kleopatra | [`216kleopatra.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/216kleopatra.tab) | 2,048 | 4,092 | 294,720 |
| 1620 Geographos | [`1620geographos.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.tab) | 8,192 | 16,380 | 1,179,456 |
| 1998 KY26 | [`1998ky26.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1998ky26.tab) | 2,048 | 4,092 | 294,720 |
| 2063 Bacchus | [`2063bacchus.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/2063bacchus.tab) | 2,048 | 4,092 | 294,720 |
| 4179 Toutatis, lower resolution | [`4179toutatis.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/4179toutatis.tab) | 6,400 | 12,796 | 921,408 |
| 4179 Toutatis, higher resolution | [`4179toutatis2.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/4179toutatis2.tab) | 20,000 | 39,996 | 2,879,779 |
| 4769 Castalia | [`4769castalia.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/4769castalia.tab) | 2,048 | 4,092 | 294,720 |
| 6489 Golevka | [`6489golevka.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/6489golevka.tab) | 2,048 | 4,092 | 294,720 |
| 25143 Itokawa | [`25143itokawa.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/25143itokawa.tab) | 6,098 | 12,192 | 877,920 |
| 52760 (1998 ML14) | [`52760.tab`](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/52760.tab) | 8,162 | 16,320 | 1,175,136 |

The counts above were derived from the official `.tab` files by counting `v` and `f` records. The PDS labels independently describe the two tables and their record counts; for example, the Geographos label declares 8,192 vertex records and 16,380 facet records. [Geographos PDS4 label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.xml)

## File format, units, and conventions

The PDS4 labels describe each geometry file as two `Table_Character` objects:

1. `Vertex Table`: a flag `v` plus three ASCII real coordinates.
2. `Facet Table`: a flag `f` plus three ASCII integer vertex indices.

The Geographos label declares a 48-byte record length. Its vertex fields are fixed-width ASCII values at byte positions 3, 18, and 33, with `%14.6e` formatting. Its facet indices are fixed-width ASCII integers at positions 3, 8, and 13. The high-resolution Toutatis label uses wider index fields where necessary, so an importer should read the label or split the record on whitespace rather than hard-code one facet field width. [Geographos PDS4 label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.xml), [high-resolution Toutatis label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/4179toutatis2.xml)

The first records of the official Geographos file look like:

```text
v   0.000000e+00   0.000000e+00   1.119516e+00
v   3.125070e-01   0.000000e+00   1.051697e+00
...
f 1055 4232 2929
f 1030  830 3364
```

The face indices are 1-based, matching OBJ’s normal indexing convention. The files contain vertices and triangular connectivity, but no OBJ-style normals, UV coordinates, textures, or material definitions. The app should therefore compute normals after loading or conversion; the existing renderer already does this when a mesh has no normal attribute. [Geographos sample geometry](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.tab), [Geographos PDS4 label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.xml)

The bundle description says the coordinates are in kilometers, the origin is the center of mass, and the axes are the principal axes. For every model except Toutatis, the z-axis is the spin vector/north pole. Toutatis instead uses the long axis as z because it is in a long-axis non-principal-axis rotation state. This is an important convention to preserve in metadata: the static mesh is a shape model in a defined body frame, not a time-tagged attitude solution. [PDS4 bundle description](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/bundle_description.txt)

The archive also contains PDS4 XML labels for the bundle, data collection, documents, and each geometry product; inventory CSVs whose rows identify products by LIDVID; and text/XML documents describing the bundle, references, and radar observatories. The reference list connects individual models to the underlying radar papers and DOIs. [document directory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/), [document inventory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/collection_compil.ast.radar.shape-models_document_inventory.csv), [reference list](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/ref.txt)

## Identification, search, download, and attribution

Use the PDS identifiers as the stable identity rather than a filename alone:

- Bundle LIDVID: `urn:nasa:pds:compil.ast.radar.shape-models::1.0`.
- Geographos product LIDVID: `urn:nasa:pds:compil.ast.radar.shape-models:data:1620geographos_tab::1.0`.
- The other product identifiers follow the same `data:{basename}_tab::1.0` pattern, as listed in the official inventory CSV.

The official PDS Search API documents these operations:

- Search all nodes at `https://pds.nasa.gov/api/search/1/products` using `q`, `keywords`, `fields`, `sort`, `limit`, and `search-after`.
- Resolve a known LID/LIDVID with the path form `.../products/{identifier}`.
- Crawl children with `/members` and `/members/members`, or parents with `/member-of` and `/member-of/member-of`.
- Paginate with a stable `sort` field and the last value as `search-after`.

The API documentation explicitly warns that the registry is not fully populated and that examples can return empty results or 404s. A live check for this bundle on 2026-08-03 resolved all ten known geometry product LIDVIDs directly, and the bundle record exposed its PDS4 target names, label URL, archive status, and citation metadata. The bundle’s `/members` endpoint returned zero results and `/members/members` returned HTTP 410 in the same check, despite the direct products being available. Therefore the app should use the API for discovery and metadata enrichment, but retain the SBN archive landing page, directory, inventory, and direct label/file URLs as authoritative fallback sources. A search or hierarchy miss must not be presented as proof that a model does not exist. [PDS Search API user guide](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html), [bundle API record](https://pds.nasa.gov/api/search/1/products/urn%3Anasa%3Apds%3Acompil.ast.radar.shape-models%3A%3A1.0), [Geographos API record](https://pds.nasa.gov/api/search/1/products/urn%3Anasa%3Apds%3Acompil.ast.radar.shape-models%3Adata%3A1620geographos_tab%3A%3A1.0), [PDS keyword-search guidance](https://pds.nasa.gov/services/search/index.jsp)

The bundle-level citation supplied by SBN is:

> Neese, C., Ed. (2020). *Small Body Radar Shape Models V1.0*. `urn:nasa:pds:compil.ast.radar.shape-models::1.0`. NASA Planetary Data System. https://doi.org/10.26033/vtj1-tb13.

The app should show that bundle citation and link the exact per-target PDS label and geometry download. For a more complete scientific attribution, expose the model-specific paper from `document/ref.txt` when available; for example, the Geographos, Toutatis, Itokawa, Kleopatra, and Golevka records have distinct radar-paper references and DOIs. [SBRSM landing page and citation](https://sbn.psi.edu/pds/resource/rshape.html), [SBRSM reference list](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/ref.txt)

## Fit with the current neo-finder renderer

The current local PDS manifest contains only Apophis and points to [`apophis_v233s7.obj`](../../static/models/neos/apophis_v233s7.obj). The checked-in Apophis asset is ASCII OBJ with 2,000 vertices and 3,996 triangular faces. [`pds-mesh.js`](../../src/lib/pds-mesh.js) identifies the asset as `format: "obj"`, `units: "km"`, and a validated local renderer asset. [`neo-mesh.js`](../../src/lib/neo-mesh.js) fetches the text, calls Three.js `OBJLoader.parse`, recenters the loaded object, scales it to the app’s target radius, and computes vertex normals when they are absent. [`AsteroidPreview.svelte`](../../src/lib/AsteroidPreview.svelte) loads `OBJLoader` only when a local mesh record is present and falls back to the procedural geometry on failure.

The SBRSM `.tab` files are therefore **conceptually compatible but not directly loadable** by the current path:

```text
PDS `v x y z`  ->  OBJ `v x y z`
PDS `f i j k`  ->  OBJ `f i j k`
```

The conversion is low-risk because both formats use triangular indexed polyhedra and 1-based indices. It still needs validation: confirm all indices are within the vertex count, preserve face winding, reject malformed/duplicate records, verify the expected counts from the label, preserve kilometer units, compute or validate normals, and load the result through the real `OBJLoader` path. Do not convert the PDS XML label into runtime geometry; keep it beside the generated asset or in the cached catalogue for provenance.

The renderer’s bounding-box normalization means the converted geometry will display at the expected visual radius even though its coordinates are in kilometers. The units must nevertheless remain in the catalogue because they are scientifically meaningful and would matter for any future metric-aware rendering or export. Toutatis should carry an explicit frame/convention note and expose low/high-resolution variants rather than silently replacing one with the other.

## Recommended implementation and bundling work

1. Add a build-time ingestion script for this specific PDS4 bundle. Start from the official bundle LIDVID and inventory CSV, resolve each product label, download the referenced `.tab`, verify the label/file checksum and declared counts, and convert the two tables into ASCII OBJ or GLB. Prefer OBJ first because it exactly matches the existing loader; consider GLB later only if asset-size or load-time measurements justify adding a second loader.
2. Store generated assets under the existing local NEO mesh asset area. Keep the PDS label URL, raw geometry URL, bundle/product LIDVID, download URL, DOI, units, vertex/facet counts, model resolution, frame convention, and scientific reference in the generated catalogue. Do not bundle only the ZIP and expect the browser to parse it.
3. Add all nine targets to the local render-ready manifest after conversion and validation. Keep two explicit Toutatis variants. Use numbered designations, SPK IDs, names, historical designations, and the PDS target spelling as aliases so the records join the existing NEO identity resolver and can open the normal detail/orbit flow.
4. Preserve the catalogue’s status separation. A PDS archive record is not automatically render-ready; the record becomes render-ready only after its local asset passes conversion and real-browser loading. The existing cached PDS catalogue already has the right distinction and currently represents Geographos as an official archive record that still needs conversion. [`pds-catalogue.json`](../../static/data/pds-catalogue.json), [`pds-catalogue.js`](../../src/lib/pds-catalogue.js)
5. Bundle the converted assets as on-demand static files rather than importing all geometry into the JavaScript bundle. The archive is small, but high-resolution Toutatis is about 2.9 MB as raw ASCII before conversion. The current mesh cache and per-record `assetUrl` design can load only the selected object and cache it locally.
6. Attribute the collection at bundle level and link every card to its exact PDS label and download. A concise UI label should say “NASA PDS / SBN radar-derived shape model”; it should not imply an optical photograph, a perfect physical scan, or a current rotational pose.

This work should add the additional bundled asteroids without weakening the existing rule: archive discovery and local render readiness remain separate, and a PDS search miss remains an unresolved index state rather than a claim of non-existence.

## Primary sources

- [SBN Small Body Radar Shape Models landing page](https://sbn.psi.edu/pds/resource/rshape.html)
- [PDS4 bundle description](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/bundle_description.txt)
- [PDS4 bundle label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/bundle_compil.ast.radar.shape-models.xml)
- [PDS4 bundle browse directory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/)
- [PDS4 data directory and inventory](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/)
- [Geographos PDS4 label](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.xml) and [geometry file](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/data/1620geographos.tab)
- [PDS4 Search API user guide](https://nasa-pds.github.io/pds-api/guides/search/endpoints.html)
- [PDS keyword-search guidance](https://pds.nasa.gov/services/search/index.jsp)
- [PDS4 bundle API record](https://pds.nasa.gov/api/search/1/products/urn%3Anasa%3Apds%3Acompil.ast.radar.shape-models%3A%3A1.0)
- [SBRSM reference list](https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models/document/ref.txt)
