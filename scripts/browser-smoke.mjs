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
    entryPoints: [join(consumer.directory, "main.js")],
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
  assert.deepEqual(errors, []);
  console.log(
    "Packed browser example passed in Chromium: lunar/analog/MGRS labels and Canvas grid geometry."
  );
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  consumer.cleanup();
}
