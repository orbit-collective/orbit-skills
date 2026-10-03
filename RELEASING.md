# Releasing `@orbit-collective/skills`

Releases are automated with [release-please](https://github.com/googleapis/release-please) and published to npm by `.github/workflows/publish.yml` through npm Trusted Publishing. Nobody edits the package version by hand.

## Release policy

- Package versions follow Semantic Versioning. Official skills are versioned with the package; there are no independent skill versions.
- `package.json`, `package-lock.json`, `.release-please-manifest.json`, the latest `CHANGELOG.md` entry, the Git tag, and the npm version must agree. `npm run check:package` (part of `release:verify`, CI, and the `pre-push` hook) enforces the first four.
- Commit messages use Conventional Commits; release-please derives the next version and the changelog from them.
- Releases support the Node.js and operating-system combinations declared in `package.json` and tested by `.github/workflows/ci.yml`.
- Never rebuild or modify a tarball after its artifact test. Publish the exact tested file.

## How a version is chosen

While the package is below `1.0.0`, release-please is configured with `bump-minor-pre-major` and `bump-patch-for-minor-pre-major`:

| Commits since the last release | Next version (from `0.1.0`) |
| --- | --- |
| only `fix:` / `perf:` | `0.1.1` |
| at least one `feat:` | `0.1.1` |
| a breaking change (`feat!:` or `BREAKING CHANGE:`) | `0.2.0` |
| only `docs:`, `test:`, `ci:`, `chore:`, `refactor:` | no release |

To force a specific version, add `Release-As: x.y.z` to the body of a commit on `main`.

## Release flow

1. Merge pull requests into `main` as usual.
2. On every push to `main`, `.github/workflows/release-please.yml` creates or updates one release pull request titled like `chore(main): release 0.1.1`. It bumps `package.json`, `package-lock.json`, and `.release-please-manifest.json`, prepends the changelog entry, and updates the version in the install commands of `README.md` and `documentation/{en,pl}/skills/02-using-orbit-skills.md`.
3. Review the release pull request and merge it when you want to release.
4. release-please then creates the `vX.Y.Z` tag and GitHub Release, and the same workflow dispatches `publish.yml` with that tag.
5. `publish.yml` checks out the tag, verifies that it matches `package.json`, runs `npm run release:verify`, builds and tests one exact tarball, then publishes that tarball. If the GitHub `npm` environment has required reviewers, the job waits for approval first.

Pull requests and tags created with the default `GITHUB_TOKEN` do not trigger other workflows, so CI does not run on the release pull request itself. Its contents are only version and changelog changes, and `publish.yml` re-runs the full verification before publishing. To get CI on release pull requests, store a fine-grained PAT (or GitHub App token) as the repository secret `RELEASE_PLEASE_TOKEN`; the workflow uses it automatically and falls back to `GITHUB_TOKEN` when it is absent.

## One-time repository setup

- **Settings → Actions → General → Workflow permissions:** enable "Allow GitHub Actions to create and approve pull requests" so release-please can open its pull request.
- **npm Trusted Publisher** for `@orbit-collective/skills`: provider GitHub Actions, organization `orbit-collective`, repository `orbit-skills`, workflow filename `publish.yml`, environment `npm`. No npm token is stored anywhere; the workflow uses GitHub OIDC with only `contents: read` and `id-token: write`.
- **GitHub environment `npm`:** add required reviewers if publication should need a manual approval.
- `release-please-config.json` sets `bootstrap-sha` to the commit `0.1.0` was released from, because that release has no Git tag. Once release-please has created its first tag, the setting is no longer used and can be removed.

## Manual or recovery publication

If the automatic dispatch fails, the tag already exists, so publish it explicitly:

```bash
gh workflow run publish.yml -f tag=vX.Y.Z
```

Never publish from a local machine unless the trusted publishing setup is unavailable and the owner consciously approves it. In that case build and test the exact tarball first:

```bash
npm ci
npm run release:verify
npm pack
npm run test:artifact -- ./orbit-collective-skills-X.Y.Z.tgz
npm publish ./orbit-collective-skills-X.Y.Z.tgz --access public
```

Publishing is irreversible for that name and version.

## Post-publication checks

After npm reports success, verify registry metadata and execute the published package explicitly:

```bash
npm view @orbit-collective/skills@X.Y.Z name version dist.integrity engines
npm exec --yes --package=@orbit-collective/skills@X.Y.Z -- orbit-skills --version
npx --yes --package=@orbit-collective/skills@X.Y.Z orbit-skills list --json
```

A local tarball test cannot prove registry visibility, CDN propagation, provenance, npm permissions, or installation from the public registry.
