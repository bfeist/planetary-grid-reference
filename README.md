# Planetary Grid Reference

A JavaScript/TypeScript port of selected aspects of the Python
[LGRS project](https://github.com/rbeyer/lgrs), designed for web browsers.
It brings lunar LTM/LPS coordinate projection and LGRS/ACC formatting to browser
applications, with additional grid-planning and Earth analog capabilities.
Calculations run locally without a Python runtime, Pyodide, or a calculation server.

The package is primarily used by NASA's public [AEGIS application](https://github.com/nasa/aegis)
for lunar grids and Earth analog training. It follows the USGS M2025 lunar
methodology and is checked against Python `lgrs==0.4.0`. It implements a focused
subset of that project rather than its Python class API. The supported bodies
are the Moon and Earth.

## Install and use

```sh
npm install @bfeist/planetary-grid-reference
```

Import the ESM package in a browser application built with a standard bundler:

```js
import { getGridSystem } from "@bfeist/planetary-grid-reference";

const moon = getGridSystem("moon-m2025", "lunar-acc");
const label = moon.formatPoint(-86, 30, 10, "full");
console.log(label); // BCS K30 D45

const crs = moon.classifyLatLon(-86, 30);
const projected = new Float64Array(2);
if (moon.projectLatLon(-86, 30, crs, projected)) {
  console.log(projected); // [easting, northing], metres
}
```

Latitude comes before longitude, in degrees. Projected coordinates and precision
are metres. Project/unproject methods write into a caller-owned `Float64Array(2)`
and return `false` on failure; the buffer contents are unspecified on failure.
Formatting returns `null` for unsupported or invalid inputs. Classification returns
`-1` for invalid inputs. CRS IDs belong to their grid system; do not reuse a lunar
ID with an Earth system.

The system formatter supports `"full"` and `"condensed"` labels. For unspaced lunar
LGRS digit strings or ACC strings, use `formatLatLonAsLgrs` from `/moon`. Supported
lunar formatting precisions are 1, 10, 100, 1,000 and 25,000 m. Earth ACC uses the
same set; canonical MGRS uses 1, 10, 100, 1,000, 10,000 and 100,000 m. Digits are
truncated, not rounded. Grid-planning box tiers start at 10 m.

See [examples/browser](examples/browser) for a runnable browser example using the
public package exports. It is bundled for the browser without Node built-ins or
polyfills and includes a plain Canvas grid renderer. React, OpenLayers, and AEGIS
are not required. Node ESM use is also supported; development requires Node 22.12+.

## Scope compared with Python LGRS

The comparison targets [LGRS v0.4.0's usage guide](https://github.com/rbeyer/lgrs/blob/v0.4.0/usage.rst).

| Capability                                                                | This package                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Nominal M2025 lunar LTM/LPS region selection                              | Supported                                                        |
| Forward and inverse lunar projected coordinates                           | Supported                                                        |
| Point to LGRS/ACC formatting and grid-box labels                          | Supported                                                        |
| Python coordinate classes and conversion object graph                     | Outside the port's scope; uses numeric inputs and system methods |
| Parsing LGRS/ACC strings back to coordinate objects                       | Not implemented                                                  |
| Configurable Python `Constraints`, extended LTM and inclusive CRS queries | Not implemented; uses fixed M2025 region ownership               |
| WKT generation and the Python CRS database helpers                        | Not implemented                                                  |
| Python grid packaging/download workflows                                  | Not ported; provides renderer-neutral viewport geometry instead  |
| Browser map/grid projection binding and bounded viewport planning         | Additional functionality                                         |
| Earth analog grids and an ACC-style worldwide prefix                      | Additional functionality                                         |

Python LGRS also documents browser use through Pyodide. This package provides a
native JavaScript implementation of the selected coordinate calculations. Its
APIs, supported options, and numerical boundary handling differ. See the
[upstream issue notes](docs/lgrs-upstream-issues.md) and
[methodology](docs/methodology.md) for known reference differences and conventions.

## Earth analog training

Earth analog mode simulates LGRS-style navigation using WGS84 UTM/UPS and MGRS
internally. Select the analog system and label scheme explicitly:

```js
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";

const analog = getEarthGridSystem("lunar-acc");
console.log(analog.formatPoint(29.5593, -95.09, 10, "full")); // 15RTNDC X51 W77

const mgrs = getEarthGridSystem("mgrs");
console.log(mgrs.formatPoint(29.5593, -95.09, 10, "full")); // 15R TN 9751 7177
```

MGRS algorithms are internal to the analog feature. The `mgrs` scheme preserves
canonical MGRS display/export use; there is no separate public low-level MGRS API.
ACC's worldwide prefix combines a MGRS 100 km square with one of sixteen 25 km
subareas. This is an AEGIS-originated convention, not a USGS global terrestrial ACC
namespace. Condensed labels repeat every 25 km, so include the full prefix when
references must be unambiguous.

Published USGS terrestrial training grids can use site-specific origins. This
package's dynamic 25 km lattice does not align automatically with those grids.
For example, the same JSC point is `X51 W77` here and `M75 M18` on the examined
USGS JSC training grid. Custom-origin support is outside this initial release.

## Grid rendering

The `/grid` entry point returns plain polylines and labels for a viewport:

```js
import { getEarthGridSystem } from "@bfeist/planetary-grid-reference/analogs";
import { getLgrsGridBinding, createLgrsRenderPlan } from "@bfeist/planetary-grid-reference/grid";

const system = getEarthGridSystem("lunar-acc");
const binding = getLgrsGridBinding({ projCode: "EPSG:3857", proj4Def: null }, system);
const centre = new Float64Array(2);
binding.latLonToMap(29.5593, -95.09, centre);
const plan = createLgrsRenderPlan({
  binding,
  extent: [centre[0] - 2000, centre[1] - 1500, centre[0] + 2000, centre[1] + 1500],
  resolution: 4,
  gridSpacingMode: 100,
  gridLabelInterval: 100,
  labelsVisible: true,
});
// Draw plan.lines[].coordinates (flat x/y pairs) and plan.labels[] in your map.
console.log(plan.lineSpacing, plan.vertexCount);
```

Supply a `proj4Def` for projection codes proj4 does not know. Coordinate-only
imports do not load the planner. The package does not select mission defaults,
persist UI preferences, calculate navigation bearings, or render a map for you.
Those policies belong to the consuming application.

Point readouts use the point's own region and latitude band. Box labels use their
grid-southwest node and the box-centre band in the drawn region, so readout and box
prefixes can differ at a latitude-band seam. Regions and boxes use exact half-open
ownership. Earth assigns exactly 84 degrees north to UPS. See
[methodology](docs/methodology.md) for complete projection and label rules.

## Public entry points

| Import       | Purpose                                                             |
| ------------ | ------------------------------------------------------------------- |
| Package root | `getGridSystem`, common helpers, TypeScript system/coordinate types |
| `/moon`      | Lunar system, classification, projection, and LGRS/ACC helpers      |
| `/analogs`   | `getEarthGridSystem`                                                |
| `/grid`      | Projection binding, clipping, spacing, and viewport render planning |

ESM JavaScript and `.d.ts` declarations are shipped. There is no CommonJS build.
Internal source paths and `/earth` or `/mgrs` imports are not public exports.

## Exporting GeoJSON

Use the installed `planetary-grid-reference` command or run it with `npx`:

```sh
npx @bfeist/planetary-grid-reference export-geojson --planet earth --labels mgrs --bbox=-95.10,29.55,-95.08,29.57 --spacing 100 --name JSC --output jsc.geojson
npx @bfeist/planetary-grid-reference export-geojson --planet moon --labels lgrs --bbox=29.99,-86.001,30.01,-85.999 --spacing 100 --output lunar-site.geojson
```

Earth accepts `--labels mgrs` (default) or `--labels acc` on the same WGS84
UTM/UPS lattice. The Moon uses `--labels lgrs` (default) on the M2025 LTM/LPS
lattice. The CLI projects the longitude/latitude bounds, snaps the projected
rectangle outward, and includes the points on all four snapped edges. Both the
input bounds and snapped rectangle must fit within one projection zone or polar
cap. Split an area at a zone or antimeridian boundary when it crosses one.
Spacing is 10, 100 (default), or 1,000 metres. Each export is limited to 250,000
points. Omit `--output` to write to standard output.

The point collection has zero-based `row` and `column` indices increasing from
grid southwest, `row_total` and `column_total` dimensions, and AEGIS display
fields `L_coord` and `R_coord`. MGRS includes the full reference in `MGRS` and in
the display fields together. Earth ACC includes the full compact `LGRS_ACC` and
displays its two condensed axes. Lunar exports include numeric `LGRS` and
compact `LGRS_ACC`, with the two condensed ACC axes for display.

Coordinates are ordered longitude, latitude. Earth output uses WGS84
(`OGC:CRS84`). Lunar output uses IAU 2015 planetocentric coordinates
(`IAU_2015:30100`) in the same JSON structure and needs a Moon-aware consumer.
The collection identifies the planet, coordinate CRS, and projected grid zone.

## Validation

```sh
npm ci
npx playwright install chromium
npm run check
npm run bench
```

The unit suite includes the pinned lunar corpus, Earth pyproj/GeoTrans-based
reference corpus, boundary/property tests, projection fast-path comparisons, and
south-LPS golden geometry. Reference fixtures preserve the numerical tolerances
used to validate the coordinate methods. Earth projection error must be at most one micrometre
per axis; end-to-end strings near a box boundary have the documented corpus
allowance. See the [Earth corpus guide](fixtures/lgrs-earth/v1/README.md).

`test:browser` checks the packed npm artifact in Chromium using the runnable
browser example. `test:package` installs that artifact in an isolated Node/TypeScript
consumer and verifies public exports and representative coordinate/grid behavior.
Browser compatibility is exercised in Chromium; Firefox and WebKit are not yet
part of this release's automated checks.

Python is development-only tooling for independent fixture regeneration:

```sh
npm run lgrs:reference-corpus
npm run lgrs:reference-corpus-earth
```

These commands require `uv` and the pinned Python environment under
`scripts/lgrs-reference`. Review metadata, upstream version changes, and boundary
results together; fixtures are not regenerated during normal npm checks.

## Sources and license

Lunar methods follow [USGS Techniques and Methods 11-E1](https://doi.org/10.3133/tm11E1).
Earth analog ACC draws on the [USGS terrestrial training-grid release](https://doi.org/10.5066/P14KSANW);
MGRS conventions follow [NGA Universal Grids and Grid Reference Systems](https://earth-info.nga.mil/php/download.php?file=coord-grids).
The selected Python LGRS aspects, published formulas, and project extensions are
described in [methodology](docs/methodology.md).

Licensed under [Apache-2.0](LICENSE). [NOTICE](NOTICE) retains Python LGRS attribution
and the MIT notice for proj4 formulas. This project is independently maintained;
source references do not imply USGS or upstream-project endorsement.

Maintainers: see [releasing](docs/releasing.md) for the GitHub Actions trusted
publishing workflow, which uses short-lived OIDC credentials instead of a stored
publishing token.
