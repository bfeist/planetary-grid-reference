# Browser example

From the repository root, build the package and bundle the example:

```sh
npm ci
npm run build
node scripts/serve-example.mjs
```

Open `http://127.0.0.1:8080`. The Node process only bundles and serves static files;
coordinate calculations run in the browser. The example's
imports resolve through the package's public exports, without Python, Node runtime
polyfills, a map library, or AEGIS. The packed-artifact browser smoke check runs
the same example using an isolated tarball installation and a built-in HTTP server.
