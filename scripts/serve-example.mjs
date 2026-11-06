import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { packageRoot } from "./packed-consumer.mjs";

const directory = join(packageRoot, ".local/example");
mkdirSync(directory, { recursive: true });
await build({
  entryPoints: [join(packageRoot, "examples/browser/main.js")],
  outfile: join(directory, "bundle.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
});
createServer((request, response) => {
  const javascript = request.url === "/bundle.js";
  response.setHeader("Content-Type", javascript ? "text/javascript" : "text/html");
  response.end(
    readFileSync(
      javascript ? join(directory, "bundle.js") : join(packageRoot, "examples/browser/index.html")
    )
  );
}).listen(8080, "127.0.0.1", () => {
  console.log("Browser example: http://127.0.0.1:8080 (Ctrl+C to stop)");
});
