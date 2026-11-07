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

describe("Lunar display formatting", () => {
  test.each([
    [0, 0, "-00 -00", "23NFF -00 -00"],
    [-0.0001, 0.0001, "-00 Z99", "23MFE -00 Z99"],
    [45, 90, "S84 N71", "34TGQ S84 N71"],
    [-45, -90, "G15 L28", "12GDR G15 L28"],
    [79.9, 10, "K62 V59", "24XFG K62 V59"],
    [8, 4, "D91 S92", "24PAV D91 S92"],
    [0, -180, "C72 -00", "1NAA C72 -00"],
    [80, 10, "B47 B40", "ZCA B47 B40"],
    [-80, 10, "B47 X59", "BCZ B47 X59"],
    [-89, -133, "B95 D44", "AZM B95 D44"],
  ])("formats %f, %f as %s / %s", (lat, lon, condensed, full) => {
    expect(moonGridSystem.formatPoint(lat, lon, 10, "condensed")).toBe(condensed);
    expect(moonGridSystem.formatPoint(lat, lon, 10, "full")).toBe(full);
  });

  test("takes the LTM band from the point when its 10 m box straddles the band parallel", () => {
    expect(moonGridSystem.formatPoint(7.999999997298345, 98.21537110092487, 10, "full")).toBe(
      "35NHQ R47 S52"
    );
    expect(moonGridSystem.formatPoint(8.000000076486206, -159.8278792515216, 10, "full")).toBe(
      "3PFV E16 S34"
    );
  });

  test.each([
    [NaN, 0],
    [-91, 0],
    [0, 400],
  ])("returns null for invalid point %f, %f", (lat, lon) => {
    expect(moonGridSystem.formatPoint(lat, lon, 10, "full")).toBeNull();
    expect(moonGridSystem.formatPoint(lat, lon, 10, "condensed")).toBeNull();
  });

  test("displays only the prefix at 25 km in both styles", () => {
    expect(moonGridSystem.formatPoint(0, 0, 25000, "full")).toBe("23NFF");
    expect(moonGridSystem.formatPoint(0, 0, 25000, "condensed")).toBe("23NFF");
  });

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
