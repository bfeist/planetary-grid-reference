import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPackedConsumer, npm, packageRoot } from "./packed-consumer.mjs";

const consumer = createPackedConsumer();
try {
  assert.deepEqual(Object.keys(consumer.manifest.exports).sort(), [
    ".",
    "./analogs",
    "./grid",
    "./moon",
  ]);
  writeFileSync(
    join(consumer.directory, "smoke.mjs"),
    `
import assert from "node:assert/strict";
import { getGridSystem } from "@bfeist/planetary-grid-reference";
import { moonGridSystem, formatLatLonAsLgrs } from "@bfeist/planetary-grid-reference/moon";
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";
import { getLgrsGridBinding, createLgrsRenderPlan } from "@bfeist/planetary-grid-reference/grid";
assert.equal(getGridSystem("moon-m2025", "lunar-acc"), moonGridSystem);
assert.equal(moonGridSystem.formatPoint(-86, 30, 10, "full"), "BCS K30 D45");
assert.equal(formatLatLonAsLgrs(-86, 30, 10, "acc"), "BCSK30D45");
const earth = getEarthGridSystem("lunar-acc");
assert.equal(earth.formatPoint(29.5593, -95.09, 10, "full"), "15RTNDC X51 W77");
assert.equal(getEarthGridSystem("mgrs").formatPoint(29.5593, -95.09, 10, "full"), "15R TN 9751 7177");
assert.equal(earth.classifyLatLon(91, 0), -1);
assert.equal(earth.formatPoint(NaN, 0, 10, "full"), null);
const binding = getLgrsGridBinding({projCode:"EPSG:3857",proj4Def:null}, earth);
const centre = new Float64Array(2);
assert.equal(binding.latLonToMap(29.5593, -95.09, centre), true);
const plan = createLgrsRenderPlan({binding, extent:[centre[0]-2000,centre[1]-1500,centre[0]+2000,centre[1]+1500], resolution:4, gridSpacingMode:100, gridLabelInterval:100, labelsVisible:true});
assert.equal(plan.tier, "box");
assert.ok(plan.lines.length > 0 && plan.labels.length > 0 && plan.vertexCount > 0);
assert.ok(plan.lines.every(line => line.coordinates.every(Number.isFinite)));
for (const privatePath of ["earth", "mgrs", "dist/earth/mgrs.js"]) {
  await assert.rejects(import("@bfeist/planetary-grid-reference/" + privatePath), {code:"ERR_PACKAGE_PATH_NOT_EXPORTED"});
}
console.log("Packed ESM consumer: lunar, Earth ACC/MGRS, geometry, invalid input, and export boundaries passed.");
`
  );
  process.stdout.write(
    execFileSync(process.execPath, ["smoke.mjs"], { cwd: consumer.directory, encoding: "utf8" })
  );
  writeFileSync(
    join(consumer.directory, "consumer.ts"),
    `
import { getGridSystem, type LgrsGridSystem, type LgrsRenderPlan } from "@bfeist/planetary-grid-reference";
import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";
import { getLgrsGridBinding, createLgrsRenderPlan } from "@bfeist/planetary-grid-reference/grid";
const system: LgrsGridSystem = getGridSystem("moon-m2025", "lunar-acc");
const label: string | null = moonGridSystem.formatPoint(-86, 30, 10, "full");
const binding = getLgrsGridBinding({projCode:"EPSG:3857",proj4Def:null}, getEarthGridSystem("mgrs"));
const plan: LgrsRenderPlan = createLgrsRenderPlan({binding,extent:[0,0,1000,1000],resolution:1,gridSpacingMode:"auto",gridLabelInterval:"auto",labelsVisible:true});
void [system, label, plan];
`
  );
  writeFileSync(
    join(consumer.directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        lib: ["ES2022"],
        types: [],
        skipLibCheck: false,
      },
      include: ["consumer.ts"],
    })
  );
  execFileSync(
    process.execPath,
    [join(packageRoot, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    { cwd: consumer.directory, stdio: "inherit" }
  );
  console.log("Packed TypeScript declarations: strict consumer without Node/DOM types passed.");
  const command = ["exec", "--offline", "--", "planetary-grid-reference", "export-geojson"];
  const earthArgs = ["--planet", "earth", "--bbox=-95.091,29.559,-95.089,29.560"];
  const mgrs = JSON.parse(npm([...command, ...earthArgs], consumer.directory));
  assert.deepEqual([mgrs.planet, mgrs.grid_zone, mgrs.spacing_m], ["earth", "15N", 100]);
  assert.deepEqual([mgrs.row_total, mgrs.column_total, mgrs.features.length], [3, 4, 12]);
  assert.deepEqual(
    mgrs.features.map(({ properties: { MGRS } }) => MGRS),
    [
      "15R TN 974 717",
      "15R TN 975 717",
      "15R TN 976 717",
      "15R TN 977 717",
      "15R TN 974 718",
      "15R TN 975 718",
      "15R TN 976 718",
      "15R TN 977 718",
      "15R TN 974 719",
      "15R TN 975 719",
      "15R TN 976 719",
      "15R TN 977 719",
    ]
  );
  mgrs.features.forEach(({ geometry, properties }, id) => {
    const { L_coord, R_coord, row, column } = properties;
    assert.equal(geometry.type, "Point");
    assert.equal(properties.id, id);
    assert.equal(row * mgrs.column_total + column, id);
    assert.equal(`${L_coord} ${R_coord}`, properties.MGRS);
    assert.ok(Math.abs(geometry.coordinates[0] + 95.09) < 0.003);
    assert.ok(Math.abs(geometry.coordinates[1] - 29.56) < 0.003);
  });

  const acc = JSON.parse(npm([...command, ...earthArgs, "--labels", "acc"], consumer.directory));
  assert.deepEqual(
    acc.features.map(({ geometry }) => geometry),
    mgrs.features.map(({ geometry }) => geometry)
  );
  assert.equal(acc.features[0].properties.LGRS_ACC, "15RTNDCX4W7");

  npm(
    [
      ...command,
      "--planet",
      "moon",
      "--bbox=29.99,-86.001,30.01,-85.999",
      "--output",
      "lunar-site.geojson",
    ],
    consumer.directory
  );
  const moon = JSON.parse(readFileSync(join(consumer.directory, "lunar-site.geojson"), "utf8"));
  assert.deepEqual(
    [moon.planet, moon.coordinate_crs, moon.grid_zone],
    ["moon", "IAU_2015:30100", "LPS S"]
  );
  assert.deepEqual(moon.features[0].properties, {
    id: 0,
    row: 0,
    column: 0,
    LGRS: "BCS102044",
    LGRS_ACC: "BCSK2D4",
    L_coord: "K2",
    R_coord: "D4",
  });

  const cli = join(
    consumer.directory,
    "node_modules",
    consumer.manifest.name,
    consumer.manifest.bin["planetary-grid-reference"]
  );
  for (const [args, error] of [
    [["--planet", "moon", "--labels", "mgrs"], /Moon supports lgrs/],
    [["--planet", "earth", "--bbox=-96.01,29.55,-95.99,29.56"], /within one grid zone/],
    [["--planet", "earth", "--bbox=4,55,5,65"], /within one grid zone/],
    [
      ["--planet", "earth", "--bbox=-95.15,29.50,-95.05,29.60", "--spacing", "10"],
      /exceeds 250000 points/,
    ],
  ]) {
    const result = spawnSync(process.execPath, [cli, "export-geojson", ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, error);
  }
  console.log("Packed CLI: Earth MGRS/ACC, lunar LGRS, AEGIS fields, and input validation passed.");
} finally {
  consumer.cleanup();
}
