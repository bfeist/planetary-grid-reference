# Releasing

A push to `main` runs **Publish npm package and GitHub Release**. It publishes a new manifest version
after the package checks pass, then pushes a matching Git tag on the published
commit and creates a GitHub Release with generated release notes. Stable versions
go to npm's `latest` distribution tag and prereleases go to `beta` with a GitHub
prerelease. An already published version skips npm publication and completes any
missing tag or GitHub Release. Existing GitHub Releases are left unchanged.

1. In the release PR, run `npm version minor --no-git-tag-version` for a feature
   release or `npm version patch --no-git-tag-version` for a fix. Commit both
   manifests, document any output or API changes, and run `npm run check`.
2. Merge the PR into `main` and check the publish workflow run. It creates the
   `v<version>` Git tag and matching GitHub Release after npm accepts the version.
3. Verify the published artifact and install that exact version in the consuming
   app.

If publication, tagging, or GitHub Release creation fails, rerun all jobs in the
original run. If npm already accepted that commit, the rerun finishes the missing
steps without republishing. The workflow can also be dispatched from `main` for
the current version, even after later commits have landed; recovery tags the
original npm publishing commit, not the newer workflow commit. Recovery of an
older version requires rerunning its original workflow run.

npm trusted publishing uses a short-lived OIDC credential from GitHub Actions.
In the npm package settings, authorize GitHub owner `bfeist`, repository
`planetary-grid-reference`, and workflow `publish.yml` for direct publication.
Keep the package's existing two-factor authentication requirements enabled.

See [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for account setup and the supported runner and toolchain requirements.
