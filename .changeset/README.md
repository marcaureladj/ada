# Changesets

This directory tracks pending changes that will go into the next release.

## Adding a changeset

```bash
pnpm changeset
```

Pick the packages affected, the bump level (patch / minor / major), and write a
one-line summary. The resulting `*.md` file is committed alongside your PR.

## Releasing

Releases are automated by the `Release` GitHub Action:

1. When a PR with a changeset merges to `main`, the action opens (or updates) a
   "Version Packages" PR that bumps versions and writes CHANGELOG.md.
2. Merging that PR triggers a publish to NPM using `NPM_TOKEN`.

Manual release (rare): `pnpm changeset version && pnpm changeset publish`.
