# Releasing

A push to `main` runs **Publish npm package**. It publishes a new manifest version
after the package checks pass, then pushes a matching Git tag on the published
commit. Stable versions go to npm's `latest` distribution tag and prereleases go
to `beta`. An already published version skips publication.

1. In the release PR, run `npm version minor --no-git-tag-version` for a feature
   release or `npm version patch --no-git-tag-version` for a fix. Commit both
   manifests, document any output or API changes, and run `npm run check`.
2. Merge the PR into `main` and check the publish workflow run. It creates the
   `v<version>` Git tag after npm accepts the version.
3. Verify the published artifact and install that exact version in the consuming
   app.

If publication or tagging fails, rerun all jobs in the original run. If npm already
accepted that commit, the rerun can finish tagging it without republishing.
The workflow can also be dispatched from `main` for the current version.

npm trusted publishing uses a short-lived OIDC credential from GitHub Actions.
In the npm package settings, authorize GitHub owner `bfeist`, repository
`planetary-grid-reference`, and workflow `publish.yml` for direct publication.
Keep the package's existing two-factor authentication requirements enabled.

See [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for account setup and the supported runner and toolchain requirements.
