import type { LgrsDisplayStyle } from "../src/types.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { moonGridSystem } from "../src/moon/system.js";

type OracleLatLonCase = {
  category: string;
  latitude: number;
  longitude: number;
  expected: { system: "LPS" | "LTM"; zone: number | null; acc10: string } | null;
  labels?: Record<string, { acc: string } | null>;
};

function loadCases(filename: string, key: string): OracleLatLonCase[] {
  const path = resolve(process.cwd(), "fixtures/lgrs/0.4.0", filename);
  return (JSON.parse(readFileSync(path, "utf8")) as Record<string, OracleLatLonCase[]>)[key];
}

/** Oracle ACC split into display styles, with the prefix length taken from the oracle CRS. */
function expectedDisplay(testCase: OracleLatLonCase, acc: string, style: LgrsDisplayStyle) {
  const { system, zone } = testCase.expected;
  const prefixLength = system === "LPS" ? 3 : String(zone).length + 3;
  const prefix = acc.slice(0, prefixLength);
  const condensed = acc.slice(prefixLength);
  if (!condensed) return prefix;
  const half = condensed.length / 2;
  const axes = `${condensed.slice(0, half)} ${condensed.slice(half)}`;
  return style === "full" ? `${prefix} ${axes}` : axes;
}

describe("Lunar display formatting against oracle", () => {
  test("matches the 0.4.0 oracle 10 m point label of every projection case", () => {
    const mismatches: string[] = [];
    let compared = 0;
    for (const testCase of loadCases("projection.json", "cases")) {
      if (!testCase.expected || testCase.category === "rejected") continue;
      for (const style of ["condensed", "full"] as const) {
        const actual = moonGridSystem.formatPoint(testCase.latitude, testCase.longitude, 10, style);
        const expected = expectedDisplay(testCase, testCase.expected.acc10, style);
        compared++;
        if (actual !== expected) {
          mismatches.push(`${testCase.latitude},${testCase.longitude} ${style}: ${actual}`);
        }
      }
    }
    expect(compared).toBeGreaterThan(10000);
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  test("matches the 0.4.0 oracle boundary point labels at every precision", () => {
    const mismatches: string[] = [];
    let compared = 0;
    for (const testCase of loadCases("boundaries.json", "latLonCases")) {
      if (!testCase.expected || !testCase.labels || testCase.category === "rejected") continue;
      for (const precision of [1, 10, 100, 1000, 25000] as const) {
        const acc = testCase.labels[String(precision)]?.acc;
        if (!acc) continue;
        for (const style of ["condensed", "full"] as const) {
          const actual = moonGridSystem.formatPoint(
            testCase.latitude,
            testCase.longitude,
            precision,
            style
          );
          compared++;
          if (actual !== expectedDisplay(testCase, acc, style)) {
            mismatches.push(`${testCase.latitude},${testCase.longitude} ${precision} ${style}`);
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5000);
    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});
