import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPackedConsumer, packageRoot } from "./packed-consumer.mjs";

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
} finally {
  consumer.cleanup();
}
