# Releasing

Use npm trusted publishing from GitHub Actions. The workflow obtains a short-lived
OIDC credential for the publish job; it does not need a stored `NPM_TOKEN` or a
long-lived token that bypasses two-factor authentication.

After the initial package exists, configure its npm trusted publisher for GitHub
owner `bfeist`, repository `planetary-grid-reference`, workflow `publish.yml`.
Keep the package's existing two-factor authentication requirements enabled.

For a release:

1. Update the version and lockfile, document output/API changes, and run `npm run check`.
2. Commit, push, and create a matching tag such as `v0.1.0`.
3. Run the **Publish npm package** workflow with that tag as its input.
4. Verify the published artifact and install that exact version in the consuming app.

The workflow verifies the tag against `package.json`, validates the package on
Node 24, and publishes prereleases under `beta` or stable versions under `latest`.
Its Node/npm installation must meet npm's current trusted-publishing requirements.
An initial maintainer-authenticated bootstrap publication is separate from later
OIDC releases. Configure trust before dispatching the workflow.

See [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for account setup and the current supported runner/toolchain requirements.
