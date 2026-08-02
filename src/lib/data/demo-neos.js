function makeDemoNeo({
  id,
  name,
  diameter,
  speed,
  distance,
  inclination,
  hazardous,
  approach,
  physical = {}
}) {
  return {
    id,
    name,
    nasa_jpl_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=" + id,
    is_potentially_hazardous_asteroid: hazardous,
    estimated_diameter: {
      kilometers: {
        estimated_diameter_min: diameter * 0.82,
        estimated_diameter_max: diameter * 1.18
      },
      meters: {
        estimated_diameter_min: diameter * 820,
        estimated_diameter_max: diameter * 1180
      }
    },
    close_approach_data: [
      {
        close_approach_date: approach,
        close_approach_date_full: approach + " 12:00",
        relative_velocity: {
          kilometers_per_second: String(speed),
          kilometers_per_hour: String(speed * 3600),
          miles_per_hour: String(speed * 2236.936)
        },
        miss_distance: {
          astronomical: String(distance / 149597870.7),
          lunar: String(distance / 384400),
          kilometers: String(distance),
          miles: String(distance * 0.621371)
        },
        orbiting_body: "Earth"
      }
    ],
    orbital_data: {
      orbit_id: id.slice(-3),
      orbit_determination_date: approach,
      inclination: String(inclination),
      eccentricity: "0." + String(210 + inclination).slice(-3),
      semi_major_axis: "1." + String(40 + inclination).slice(-2),
      orbital_period: String(365 + inclination * 2)
    },
    ...(Object.keys(physical).length ? { physical } : {})
  };
}

export const demoNeos = [
  makeDemoNeo({
    id: "demo-433",
    name: "433 EROS // DEMO",
    diameter: 16.8,
    speed: 18.41,
    distance: 28100000,
    inclination: 10.8,
    hazardous: false,
    approach: "1998-08-01",
    physical: {
      source: "NASA/JPL SBDB reference profile",
      diameterKm: 16.84,
      extent: "34.4x11.2x11.2",
      extentKm: [34.4, 11.2, 11.2],
      density: 2.67,
      rotationPeriodHours: 5.27,
      pole: "11.37/17.22",
      albedo: 0.25,
      colorIndexBV: 0.921,
      spectralClass: "S",
      tholenClass: "S",
      smassClass: "S"
    }
  }),
  makeDemoNeo({
    id: "demo-999",
    name: "99942 APOPHIS // DEMO",
    diameter: 0.37,
    speed: 7.42,
    distance: 15600000,
    inclination: 3.3,
    hazardous: true,
    approach: "2029-04-13"
  }),
  makeDemoNeo({
    id: "demo-2062",
    name: "2062 ATEN // DEMO",
    diameter: 1.1,
    speed: 22.09,
    distance: 6190000,
    inclination: 18.1,
    hazardous: true,
    approach: "2026-08-01"
  }),
  makeDemoNeo({
    id: "demo-1862",
    name: "1862 APOLLO // DEMO",
    diameter: 1.7,
    speed: 14.62,
    distance: 41900000,
    inclination: 6.4,
    hazardous: false,
    approach: "1985-08-01"
  }),
  makeDemoNeo({
    id: "demo-3200",
    name: "3200 PHAETHON // DEMO",
    diameter: 5.1,
    speed: 25.26,
    distance: 10700000,
    inclination: 22.3,
    hazardous: true,
    approach: "2017-12-16"
  }),
  makeDemoNeo({
    id: "demo-1566",
    name: "1566 ICA RUS // DEMO",
    diameter: 1.4,
    speed: 11.77,
    distance: 52800000,
    inclination: 23.2,
    hazardous: false,
    approach: "1991-08-01"
  })
];
