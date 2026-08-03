const PDS4_ROOT = "https://sbnarchive.psi.edu/pds4/non_mission/compil.ast.radar.shape-models";
const PDS4_BUNDLE_LID = "urn:nasa:pds:compil.ast.radar.shape-models";
const PDS_BUNDLE_URL =
  "https://pds.nasa.gov/ds-view/pds/viewBundle.jsp?identifier=urn%3Anasa%3Apds%3Acompil.ast.radar.shape-models&version=1.0";
const source = "NASA PDS Small Bodies Node // Small Body Radar Shape Models V1.0";
const doi = "10.26033/vtj1-tb13";

function orbit(orbitId, values) {
  const [epoch_osculation, eccentricity, semi_major_axis, perihelion_distance, inclination,
    ascending_node_longitude, perihelion_argument, mean_anomaly, perihelion_time, orbital_period] = values;
  return {
    orbit_id: orbitId,
    epoch_osculation,
    eccentricity,
    semi_major_axis,
    perihelion_distance,
    inclination,
    ascending_node_longitude,
    perihelion_argument,
    mean_anomaly,
    perihelion_time,
    orbital_period
  };
}

function model({
  id, objectName, fullName, spkId, pdes, aliases, archiveStem, assetFile,
  variant = "", frameConvention = "Centre of mass; principal axes; kilometre coordinates",
  isNeo, isPha, orbitalData, physical, vertexCount, facetCount
}) {
  const archiveFilename = `${archiveStem}.tab`;
  const productLid = `${PDS4_BUNDLE_LID}:data:${archiveStem}_tab`;
  return {
    id, objectName, name: objectName, fullName, spkId, spkid: spkId, pdes, aliases,
    isNeo, isPha,
    assetUrl: `/models/neos/${assetFile}`,
    assetFile, archiveFilename, archiveUrl: `${PDS4_ROOT}/data/${archiveFilename}`,
    format: "obj", sourceFormat: "tab", units: "km",
    bundleName: "Small Bodies Radar Shape Models V1.0",
    collectionName: "Small Bodies Radar Shape Models // Data",
    productName: `${objectName}${variant ? ` // ${variant}` : ""}`,
    modelType: "RADAR-DERIVED SHAPE MODEL", variant, frameConvention, confidence: "PRELIMINARY", source,
    pdsBundle: `${productLid}::1.0`,
    pdsBundleLid: `${PDS4_BUNDLE_LID}::1.0`, pdsBundleUrl: PDS_BUNDLE_URL,
    pdsRecordUrl: `${PDS4_ROOT}/data/${archiveStem}.xml`,
    downloadUrl: `${PDS4_ROOT}/data/${archiveFilename}`, doi,
    orbitalData, physical: { source: "NASA/JPL SBDB snapshot", ...physical },
    vertexCount, facetCount
  };
}

export const SMALL_BODY_RADAR_SHAPE_MODELS_VERSION = "2020-09-10";
export const SMALL_BODY_RADAR_SHAPE_MODELS_BUNDLE = Object.freeze({
  lid: PDS4_BUNDLE_LID,
  lidvid: `${PDS4_BUNDLE_LID}::1.0`,
  name: "Small Bodies Radar Shape Models V1.0",
  doi,
  source,
  bundleUrl: PDS_BUNDLE_URL,
  archiveUrl: "https://sbn.psi.edu/pds/resource/rshape.html"
});

const toutatisOrbit = orbit("726", ["2461200.5", "0.625", "2.54", "0.955", "0.448", "125", "278", "126", "2460684.051", "1480"]);
const toutatisPhysical = { H: 15.29, diameterKm: 5.4, extent: "1.70x2.03x4.26", rotationPeriodHours: 176, albedo: 0.405, smassClass: "Sk", orbitClass: "Apollo" };

// PDS labels document these .tab products as Wavefront OBJ-compatible text:
// vertex records precede triangular facet records in kilometre coordinates.
export const SMALL_BODY_RADAR_SHAPE_MODELS = Object.freeze([
  model({
    id: "radar-216-kleopatra-v1", objectName: "(216) Kleopatra", fullName: "216 Kleopatra (A880 GB)",
    spkId: "20000216", pdes: "216", aliases: ["216", "20000216", "KLEOPATRA", "A880 GB"],
    archiveStem: "216kleopatra", assetFile: "216_kleopatra.obj", isNeo: false, isPha: false,
    orbitalData: orbit("157", ["2461200.5", "0.25", "2.8", "2.1", "13.1", "215", "180", "260", "2461675.347", "1710"]),
    physical: { H: 7.02, diameterKm: 122, extent: "276x94x78", rotationPeriodHours: 5.385, albedo: 0.1164, spectralClass: "XE", tholenClass: "M", smassClass: "Xe", orbitClass: "Main-belt Asteroid" },
    vertexCount: 2048, facetCount: 4092
  }),
  model({
    id: "radar-1620-geographos-v1", objectName: "(1620) Geographos", fullName: "1620 Geographos (1951 RA)",
    spkId: "20001620", pdes: "1620", aliases: ["1620", "20001620", "GEOGRAPHOS", "1951 RA"],
    archiveStem: "1620geographos", assetFile: "1620_geographos.obj", isNeo: true, isPha: true,
    orbitalData: orbit("898", ["2461200.5", "0.336", "1.25", "0.828", "13.3", "337", "277", "355", "2461208.006", "508"]),
    physical: { H: 15.27, diameterKm: 2.56, diameterSigmaKm: 0.15, extent: "5.0x2.0x2.1", rotationPeriodHours: 5.22204, albedo: 0.29, spectralClass: "S", tholenClass: "S", smassClass: "S", orbitClass: "Apollo" },
    vertexCount: 8192, facetCount: 16380
  }),
  model({
    id: "radar-2063-bacchus-v1", objectName: "(2063) Bacchus", fullName: "2063 Bacchus (1977 HB)",
    spkId: "20002063", pdes: "2063", aliases: ["2063", "20002063", "BACCHUS", "1977 HB"],
    archiveStem: "2063bacchus", assetFile: "2063_bacchus.obj", isNeo: true, isPha: false,
    orbitalData: orbit("259", ["2461200.5", "0.349", "1.08", "0.701", "9.43", "33", "55.4", "50.9", "2461142.703", "409"]),
    physical: { H: 17.21, diameterKm: 1.024, extent: "1.11 x 0.53 x 0.50", rotationPeriodHours: 14.904, albedo: 0.203, spectralClass: "SQ", smassClass: "Sq", orbitClass: "Apollo" },
    vertexCount: 2048, facetCount: 4092
  }),
  model({
    id: "radar-4179-toutatis-low-v1", objectName: "(4179) Toutatis", fullName: "4179 Toutatis (1989 AC)",
    spkId: "20004179", pdes: "4179", aliases: ["4179", "20004179", "TOUTATIS", "1989 AC"],
    archiveStem: "4179toutatis", assetFile: "4179_toutatis_low.obj", variant: "LOW RESOLUTION",
    frameConvention: "Centre of mass; long-axis body frame; kilometre coordinates", isNeo: true, isPha: true,
    orbitalData: toutatisOrbit, physical: toutatisPhysical, vertexCount: 6400, facetCount: 12796
  }),
  model({
    id: "radar-4179-toutatis-high-v1", objectName: "(4179) Toutatis", fullName: "4179 Toutatis (1989 AC)",
    spkId: "20004179", pdes: "4179", aliases: ["4179", "20004179", "TOUTATIS", "1989 AC"],
    archiveStem: "4179toutatis2", assetFile: "4179_toutatis_high.obj", variant: "HIGH RESOLUTION",
    frameConvention: "Centre of mass; long-axis body frame; kilometre coordinates", isNeo: true, isPha: true,
    orbitalData: toutatisOrbit, physical: toutatisPhysical, vertexCount: 20000, facetCount: 39996
  }),
  model({
    id: "radar-4769-castalia-v1", objectName: "(4769) Castalia", fullName: "4769 Castalia (1989 PB)",
    spkId: "20004769", pdes: "4769", aliases: ["4769", "20004769", "CASTALIA", "1989 PB"],
    archiveStem: "4769castalia", assetFile: "4769_castalia.obj", isNeo: true, isPha: true,
    orbitalData: orbit("187", ["2461200.5", "0.483", "1.06", "0.549", "8.89", "325", "121", "144", "2461040.786", "400"]),
    physical: { H: 17.38, diameterKm: 1.4, rotationPeriodHours: 4.095, albedo: 0.092, orbitClass: "Apollo" },
    vertexCount: 2048, facetCount: 4092
  }),
  model({
    id: "radar-6489-golevka-v1", objectName: "(6489) Golevka", fullName: "6489 Golevka (1991 JX)",
    spkId: "20006489", pdes: "6489", aliases: ["6489", "20006489", "GOLEVKA", "1991 JX"],
    archiveStem: "6489golevka", assetFile: "6489_golevka.obj", isNeo: true, isPha: true,
    orbitalData: orbit("107", ["2461200.5", "0.619", "2.47", "0.943", "2.26", "209", "69.8", "303", "2461425.970", "1420"]),
    physical: { H: 19.22, diameterKm: 0.53, rotationPeriodHours: 6.026, albedo: 0.151, smassClass: "Q", orbitClass: "Apollo" },
    vertexCount: 2048, facetCount: 4092
  }),
  model({
    id: "radar-1998-ky26-v1", objectName: "1998 KY26", fullName: "(1998 KY26)",
    spkId: "50012415", pdes: "1998 KY26", aliases: ["1998 KY26", "50012415", "KY26"],
    archiveStem: "1998ky26", assetFile: "1998_ky26.obj", isNeo: true, isPha: false,
    orbitalData: orbit("36", ["2461200.5", "0.2", "1.23", "0.983", "1.49", "84.2", "210", "146", "2460999.133", "498"]),
    physical: { H: 25.91, diameterKm: 0.011, diameterSigmaKm: 0.001, rotationPeriodHours: 0.089193, albedo: 0.52, orbitClass: "Apollo" },
    vertexCount: 2048, facetCount: 4092
  }),
  model({
    id: "radar-52760-1998-ml14-v1", objectName: "(52760) 1998 ML14", fullName: "52760 (1998 ML14)",
    spkId: "20052760", pdes: "52760", aliases: ["52760", "20052760", "1998 ML14", "ML14"],
    archiveStem: "52760", assetFile: "52760_1998_ml14.obj", isNeo: true, isPha: true,
    orbitalData: orbit("159", ["2461200.5", "0.624", "2.41", "0.906", "2.43", "339", "20.3", "145", "2460649.546", "1360"]),
    physical: { H: 17.52, diameterKm: 1, rotationPeriodHours: 14.28, orbitClass: "Apollo" },
    vertexCount: 8162, facetCount: 16320
  }),
  model({
    id: "radar-25143-itokawa-v1", objectName: "(25143) Itokawa", fullName: "25143 Itokawa (1998 SF36)",
    spkId: "20025143", pdes: "25143", aliases: ["25143", "20025143", "ITOKAWA", "1998 SF36"],
    archiveStem: "25143itokawa", assetFile: "25143_itokawa.obj", isNeo: true, isPha: true,
    orbitalData: orbit("237", ["2461200.5", "0.28", "1.32", "0.953", "1.62", "69.1", "163", "171", "2460936.703", "556"]),
    physical: { H: 19.26, diameterKm: 0.33, extent: "0.535x0.294x0.209", rotationPeriodHours: 12.132, smassClass: "S(IV)", orbitClass: "Apollo" },
    vertexCount: 6098, facetCount: 12192
  })
].map(Object.freeze));
