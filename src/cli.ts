#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { getGridSystem } from "./index.js";
import { formatEarthAcc } from "./earth/acc.js";
import { formatMgrs } from "./earth/mgrs.js";
import { getEarthRegionSlices } from "./earth/zones.js";
import { formatLgrs } from "./moon/format.js";
import type { LgrsCrsId, LgrsGridSystem } from "./types.js";

const HELP = `Usage: planetary-grid-reference export-geojson --planet <earth|moon> --bbox=<west,south,east,north>

  --labels <mgrs|acc|lgrs>  Earth: mgrs (default) or acc. Moon: lgrs (default).
  --spacing <10|100|1000>  Grid spacing in metres (default: 100).
  --name <name>            FeatureCollection name.
  --output <path>          Write a new file. Defaults to standard output.
  --help                   Show this help.

Bounds are longitude and latitude in degrees, within one grid zone or polar cap.
`;

type Bounds = [west: number, south: number, east: number, north: number];
type Spacing = 10 | 100 | 1000;
type Labels = "mgrs" | "acc" | "lgrs";
const MAX_POINTS = 250_000;
const REGION_ERROR = "The bounds and snapped grid must fit within one grid zone or polar cap.";

function parseBounds(input: string | undefined): Bounds {
  const parts = input?.split(",") ?? [];
  const [west, south, east, north] = parts.map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => part.trim() === "" || !Number.isFinite(Number(part))) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error("Use --bbox=west,south,east,north with increasing longitude and latitude.");
  }
  return [west, south, east, north];
}

function projectBounds(system: LgrsGridSystem, crs: LgrsCrsId, bounds: Bounds): Bounds {
  const [west, south, east, north] = bounds;
  const meridian = system.getCentralMeridian(crs);
  // Along a parallel, northing can also reach an extremum at the central
  // meridian (transverse Mercator) or at a cardinal longitude (polar).
  const extrema = Number.isFinite(meridian) ? [meridian] : [-90, 0, 90];
  const longitudes = [west, east, ...extrema.filter((lon) => lon > west && lon < east)];
  // Check each Earth zone slice that intersects the bounds, including narrow
  // exceptions that could fall entirely between the north and south edges.
  const latitudes = [south, north];
  if (system.id === "earth-wgs84") {
    for (const slice of getEarthRegionSlices(crs)) {
      if (slice.south > south && slice.south < north) latitudes.push(slice.south);
      if (slice.north > south && slice.north < north) latitudes.push(slice.north);
    }
  }

  const projected = new Float64Array(2);
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (const lat of latitudes) {
    for (const lon of longitudes) {
      if (!system.isInRegion(lat, lon, crs) || !system.projectLatLon(lat, lon, crs, projected)) {
        throw new Error(REGION_ERROR);
      }
      minE = Math.min(minE, projected[0]);
      minN = Math.min(minN, projected[1]);
      maxE = Math.max(maxE, projected[0]);
      maxN = Math.max(maxN, projected[1]);
    }
  }
  return [minE, minN, maxE, maxN];
}

function formatLabels(
  labels: Labels,
  crs: LgrsCrsId,
  e: number,
  n: number,
  lat: number,
  spacing: Spacing
) {
  // Format directly from the snapped metres. A lat/lon round trip can move
  // a point just below a lattice line and truncate it to the previous cell.
  if (labels === "mgrs") {
    const mgrs = formatMgrs(crs, e, n, lat, spacing);
    if (!mgrs) throw new Error("Could not format the MGRS grid point.");
    const split = mgrs.lastIndexOf(" ");
    return { MGRS: mgrs, L_coord: mgrs.slice(0, split), R_coord: mgrs.slice(split + 1) };
  }
  if (labels === "acc") {
    const acc = formatEarthAcc(crs, e, n, lat, spacing, "full");
    if (!acc) throw new Error("Could not format the Earth ACC grid point.");
    const [, easting, northing] = acc.split(" ");
    return { LGRS_ACC: acc.replaceAll(" ", ""), L_coord: easting, R_coord: northing };
  }

  const lgrs = formatLgrs(e, n, crs, spacing, "lgrs", lat);
  const acc = formatLgrs(e, n, crs, spacing, "acc", lat);
  if (!lgrs || !acc) throw new Error("Could not format the lunar LGRS grid point.");
  const axisLength = Math.log10(1000 / spacing) + 1;
  return {
    LGRS: lgrs,
    LGRS_ACC: acc,
    L_coord: acc.slice(-2 * axisLength, -axisLength),
    R_coord: acc.slice(-axisLength),
  };
}

function exportGrid(
  planet: "earth" | "moon",
  labels: Labels,
  spacing: Spacing,
  bounds: Bounds,
  name: string
) {
  const system = getGridSystem(
    planet === "earth" ? "earth-wgs84" : "moon-m2025",
    labels === "mgrs" ? "mgrs" : "lunar-acc"
  );
  const [west, south, east, north] = bounds;
  const crs = system.classifyLatLon((south + north) / 2, (west + east) / 2);
  const [minE, minN, maxE, maxN] = projectBounds(system, crs, bounds);

  const firstColumn = Math.floor(minE / spacing);
  const firstRow = Math.floor(minN / spacing);
  const columns = Math.ceil(maxE / spacing) - firstColumn + 1;
  const rows = Math.ceil(maxN / spacing) - firstRow + 1;
  if (rows * columns > MAX_POINTS) {
    throw new Error(`Grid exceeds ${MAX_POINTS} points. Use a smaller bbox or coarser spacing.`);
  }

  const features = [];
  const point = new Float64Array(2);
  for (let row = 0; row < rows; row++) {
    const n = (firstRow + row) * spacing;
    for (let column = 0; column < columns; column++) {
      const e = (firstColumn + column) * spacing;
      if (
        !system.unprojectToLatLon(e, n, crs, point) ||
        !system.isInRegion(point[0], point[1], crs)
      ) {
        throw new Error(REGION_ERROR);
      }
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [point[1], point[0]] },
        properties: {
          id: row * columns + column,
          row,
          column,
          ...formatLabels(labels, crs, e, n, point[0], spacing),
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    name,
    planet,
    coordinate_crs: planet === "earth" ? "OGC:CRS84" : "IAU_2015:30100",
    grid_zone: system.formatCrsName(crs),
    spacing_m: spacing,
    row_total: rows,
    column_total: columns,
    features,
  };
}

function main(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      planet: { type: "string" },
      labels: { type: "string" },
      bbox: { type: "string" },
      spacing: { type: "string", default: "100" },
      name: { type: "string" },
      output: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (args.length === 0 || values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (positionals.length !== 1 || positionals[0] !== "export-geojson") {
    throw new Error("Expected the export-geojson command.");
  }
  const { planet } = values;
  if (planet !== "earth" && planet !== "moon")
    throw new Error("Use --planet earth or --planet moon.");
  const labels = values.labels ?? (planet === "earth" ? "mgrs" : "lgrs");
  if (
    (labels !== "mgrs" && labels !== "acc" && labels !== "lgrs") ||
    (planet === "moon") !== (labels === "lgrs")
  ) {
    throw new Error("Earth supports mgrs or acc labels. The Moon supports lgrs labels.");
  }
  const spacing = Number(values.spacing);
  if (spacing !== 10 && spacing !== 100 && spacing !== 1000) {
    throw new Error("Use --spacing 10, 100 or 1000.");
  }
  const name = values.name ?? `${planet}-${labels}-${spacing}m`;
  const grid = exportGrid(planet, labels, spacing, parseBounds(values.bbox), name);
  const output = JSON.stringify(grid) + "\n";
  if (values.output !== undefined) writeFileSync(values.output, output, { flag: "wx" });
  else process.stdout.write(output);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
