import assert from "node:assert/strict";
import { createServer } from "node:http";
import { copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createPackedConsumer, packageRoot } from "./packed-consumer.mjs";

const consumer = createPackedConsumer();
let browser;
let server;
try {
  copyFileSync(join(packageRoot, "examples/browser/main.js"), join(consumer.directory, "main.js"));
  copyFileSync(
    join(packageRoot, "examples/browser/index.html"),
    join(consumer.directory, "index.html")
  );
  const built = await build({
    stdin: {
      contents: `
        import { drawGrid } from "./main.js";
        import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";
        import {
          createLgrsRenderPlan, getLgrsGridBinding
        } from "@bfeist/planetary-grid-reference/grid";
        window.lunarSmoke = { drawGrid, moonGridSystem, createLgrsRenderPlan, getLgrsGridBinding };
      `,
      resolveDir: consumer.directory,
    },
    outfile: join(consumer.directory, "bundle.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    metafile: true,
  });
  assert.ok(
    Object.keys(built.metafile.inputs).some((file) =>
      file.includes("planetary-grid-reference/dist/")
    )
  );
  server = createServer((request, response) => {
    const file = request.url === "/bundle.js" ? "bundle.js" : "index.html";
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "text/html");
    response.end(readFileSync(join(consumer.directory, file)));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.gridExample);
  const result = await page.evaluate(() => window.gridExample);
  assert.equal(result.lunar, "BCS K30 D45");
  assert.equal(result.analog, "15RTNDC X51 W77");
  assert.equal(result.mgrs, "15R TN 9751 7177");
  assert.ok(result.lineCount > 0 && result.labelCount > 0 && result.vertexCount > 0);

  const mercator = { projCode: "EPSG:3857", proj4Def: null };
  const polar = (pole) => ({
    projCode: `TEST:LPS:${pole}`,
    proj4Def: `+proj=stere +lat_0=${pole} +lon_0=0 +k=1 +a=1737400 +b=1737400 +units=m`,
  });
  const viewports = [
    { name: "south pole", lat: -89.99, lon: 0, resolution: 1, projection: polar(-90) },
    { name: "north pole", lat: 89.99, lon: 0, resolution: 1, projection: polar(90) },
    { name: "Apollo 14", lat: -3.645, lon: -17.47, resolution: 40, projection: mercator },
    { name: "zone seam", lat: -3.6, lon: -20, resolution: 300, projection: mercator },
  ];
  for (const viewport of viewports) {
    const lunar = await page.evaluate(({ lat, lon, resolution, projection }) => {
      const { drawGrid, moonGridSystem, createLgrsRenderPlan, getLgrsGridBinding } =
        window.lunarSmoke;
      const binding = getLgrsGridBinding(projection, moonGridSystem);
      const centre = new Float64Array(2);
      if (!binding.latLonToMap(lat, lon, centre)) throw new Error("Cannot project view centre");

      const canvas = document.querySelector("canvas");
      const context = canvas.getContext("2d");
      const halfWidth = (resolution * canvas.width) / 2;
      const halfHeight = (resolution * canvas.height) / 2;
      const extent = [
        centre[0] - halfWidth,
        centre[1] - halfHeight,
        centre[0] + halfWidth,
        centre[1] + halfHeight,
      ];
      const plan = createLgrsRenderPlan({
        binding,
        extent,
        resolution,
        gridSpacingMode: "auto",
        gridLabelInterval: "auto",
        labelsVisible: true,
      });

      const readout = new Float64Array(2);
      if (!binding.mapToLatLon(centre[0], centre[1], readout)) {
        throw new Error("Cannot convert map coordinate to readout");
      }
      const countPaintedPixels = () => {
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let count = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) count++;
        }
        return count;
      };

      const strokeWidths = [];
      const stroke = context.stroke;
      context.stroke = function () {
        strokeWidths.push(this.lineWidth);
        stroke.call(this);
      };
      context.clearRect(0, 0, canvas.width, canvas.height);
      try {
        drawGrid(canvas, plan, extent);
      } finally {
        delete context.stroke;
      }
      const painted = countPaintedPixels();
      context.clearRect(0, 0, canvas.width, canvas.height);
      return {
        tier: plan.tier,
        regions: plan.regions.map(moonGridSystem.formatCrsName),
        lineSpacing: plan.lineSpacing,
        labelSpacing: plan.labelSpacing,
        twoVertexLines: plan.lines.every((line) => line.coordinates.length === 4),
        seamCount: plan.lines.filter((line) => line.kind === "seam").length,
        lineCount: plan.lines.length,
        strokeWidths,
        labels: plan.labels.map((label) => label.label?.prefix),
        readout: moonGridSystem.formatPoint(readout[0], readout[1], 10, "full"),
        painted,
        cleared: countPaintedPixels(),
      };
    }, viewport);
    assert.equal(lunar.tier, "box", viewport.name);
    assert.ok(lunar.painted > 1000, viewport.name);
    assert.equal(lunar.cleared, 0, viewport.name);
    assert.ok(lunar.labels.length > 0, viewport.name);
    assert.ok(lunar.lineSpacing > 0 && lunar.labelSpacing >= lunar.lineSpacing, viewport.name);
    switch (viewport.name) {
      case "south pole":
        assert.deepEqual(lunar.regions, ["LPS S"]);
        assert.ok(lunar.twoVertexLines);
        break;
      case "north pole":
        assert.deepEqual(lunar.regions, ["LPS N"]);
        assert.ok(lunar.labels.every((prefix) => /^[YZ]/.test(prefix)));
        break;
      case "Apollo 14":
        assert.deepEqual(lunar.regions, ["21S"]);
        assert.ok(lunar.labels.every((prefix) => prefix?.startsWith("21M")));
        assert.equal(lunar.readout, "21MDF E55 P54");
        break;
      case "zone seam":
        assert.ok(lunar.regions.includes("20S") && lunar.regions.includes("21S"));
        assert.ok(lunar.seamCount > 0);
        assert.equal(lunar.strokeWidths.filter((width) => width > 1).length, lunar.seamCount);
        assert.equal(
          lunar.strokeWidths.filter((width) => width === 1).length,
          lunar.lineCount - lunar.seamCount
        );
        break;
    }
  }

  const readoutCases = [
    { lat: 45, lon: 90, style: "condensed", expected: "S84 N71" },
    { lat: 45, lon: 90, style: "full", expected: "34TGQ S84 N71" },
    { lat: 0.5, lon: -179.5, style: "full", expected: "1NAA T91 Q17" },
    { lat: 80, lon: 10, style: "full", expected: "ZCA B47 B40" },
    { lat: -89, lon: -133, style: "condensed", expected: "B95 D44" },
    { lat: -89, lon: -133, style: "full", expected: "AZM B95 D44" },
  ];
  const readouts = await page.evaluate(
    ({ cases, mercator, south }) => {
      const { moonGridSystem, getLgrsGridBinding } = window.lunarSmoke;
      const coordinate = new Float64Array(2);
      return cases.map(({ lat, lon, style }) => {
        const binding = getLgrsGridBinding(lat < -80 ? south : mercator, moonGridSystem);
        if (
          !binding.latLonToMap(lat, lon, coordinate) ||
          !binding.mapToLatLon(coordinate[0], coordinate[1], coordinate)
        ) {
          throw new Error(`Cannot convert readout at ${lat}, ${lon}`);
        }
        return moonGridSystem.formatPoint(coordinate[0], coordinate[1], 10, style);
      });
    },
    { cases: readoutCases, mercator, south: polar(-90) }
  );
  assert.deepEqual(
    readouts,
    readoutCases.map(({ expected }) => expected)
  );
  assert.deepEqual(errors, []);
  console.log(
    "Packed browser example passed in Chromium, including lunar polar, Apollo 14 and zone-seam grids."
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  consumer.cleanup();
}
