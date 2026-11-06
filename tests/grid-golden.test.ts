import type { LgrsGridSpacing, LgrsMapExtent } from "../src/types.js";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createLgrsRenderPlan } from "../src/grid/plan.js";
import { getLgrsGridBinding } from "../src/gridBinding.js";
import { LGRS_CRS_LPS_SOUTH } from "../src/moon/crs.js";
import { moonGridSystem } from "../src/moon/system.js";

// Golden output of the original south-LPS dynamic grid (`createDynamicLgrsRenderPlan`), as
// `Grid.tsx` drew it on the canonical south mission. The whole-Moon plan must reproduce its
// spacing, lines and labels inside LPS South.

type GoldenViewport = {
  name: string;
  mapExtent: LgrsMapExtent;
  resolution: number;
  gridSpacingMode: LgrsGridSpacing;
  gridLabelInterval: LgrsGridSpacing;
  labelsVisible: boolean;
  lineSpacing: number;
  labelSpacing: number;
  /** `[axis, value, x0, y0, x1, y1]` */
  lines: [string, number, number, number, number, number][];
  /** `[x, y, lgrs, acc, text]` */
  labels: [number, number, string, string, string][];
};

const golden = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/lgrs/grid/south-lps-golden.json"), "utf8")
) as { proj4: string; viewports: GoldenViewport[] };

const adapter = getLgrsGridBinding(
  { projCode: "GOLDEN:SOUTH", proj4Def: golden.proj4 },
  moonGridSystem
);
const round = (value: number) => Number(value.toFixed(6));

describe("createLgrsRenderPlan south LPS golden data", () => {
  test("has golden viewports", () => {
    expect(golden.viewports.length).toBeGreaterThanOrEqual(10);
  });

  test.each(golden.viewports)("reproduces $name", (viewport) => {
    const plan = createLgrsRenderPlan({
      binding: adapter,
      extent: viewport.mapExtent,
      resolution: viewport.resolution,
      gridSpacingMode: viewport.gridSpacingMode,
      gridLabelInterval: viewport.gridLabelInterval,
      labelsVisible: viewport.labelsVisible,
    });

    expect(plan.tier).toBe("box");
    expect(plan.lineSpacing).toBe(viewport.lineSpacing);
    expect(plan.labelSpacing).toBe(viewport.labelSpacing);
    expect(
      plan.lines
        .filter((line) => line.kind === "grid" && line.crs === LGRS_CRS_LPS_SOUTH)
        .map((line) => [line.axis, line.value, ...line.coordinates.map(round)])
    ).toEqual(viewport.lines);
    expect(
      plan.labels
        .filter((label) => label.crs === LGRS_CRS_LPS_SOUTH)
        .map((label) => [
          ...label.coordinate.map(round),
          label.label.lgrs,
          label.label.acc,
          label.text,
        ])
    ).toEqual(viewport.labels);
  });
});
