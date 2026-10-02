# Releasing `@orbit-collective/skills`

Publishing is a separate maintainer action. Do not publish until every required GitHub Actions matrix job is green and the npm scope ownership checks below are complete.

## Release policy

- Package versions follow Semantic Versioning. Official skills are versioned with the package; there are no independent skill versions.
- `package.json`, `package-lock.json`, `CHANGELOG.md`, the Git tag, and the npm version must agree.
- Releases support the Node.js and operating-system combinations declared in `package.json` and tested by `.github/workflows/ci.yml`.
- Never rebuild or modify a tarball after its artifact test. Publish the exact tested file.

## Local release candidate

Start from a clean checkout with a supported Node.js version:

```bash
npm ci
npm run release:verify
npm run test:package
npm pack --dry-run
npm pack
npm run test:artifact -- ./orbit-collective-skills-0.1.0.tgz
```

Inspect the final filename and checksums printed by `npm pack`. For a later release, replace `0.1.0` everywhere and update the version without creating a tag automatically:

```bash
npm version <new-version> --no-git-tag-version
```

Review `git diff`, rerun the full candidate sequence, commit through the normal review process, and wait for all CI jobs. Local success does not substitute for GitHub-hosted Linux, macOS, and Windows results.

## First publication prerequisites

The owner must verify all of the following outside this repository:

1. The `orbit-collective` npm organization exists and the publishing account may create `@orbit-collective/skills`.
2. The account meets npm's current 2FA requirements for direct publication.
3. The package name and version are still available in the public npm registry.
4. The repository is public if npm provenance is expected.

Authenticate interactively without storing credentials in the repository:

```bash
npm login --auth-type=web
npm whoami
```

After reviewing and testing the exact tarball, the explicit bootstrap command is:

```bash
npm publish ./orbit-collective-skills-0.1.0.tgz --access public
```

Do not run that command as part of preparation. It is irreversible for that name/version and requires the owner's conscious approval.

## Trusted publishing for subsequent releases

After the package exists on npm, configure an npm Trusted Publisher with:

- provider: GitHub Actions;
- organization: `orbit-collective`;
- repository: `orbit-skills`;
- workflow filename: `publish.yml`;
- optional GitHub environment: `npm`.

Configure the GitHub `npm` environment with required reviewers if the organization uses deployment protection. The workflow needs no npm token; it uses GitHub OIDC and has only `contents: read` plus `id-token: write`.

For each later release, create and push an already-reviewed tag, then manually dispatch the workflow with that exact tag:

```bash
git tag -s v0.1.0
git push origin v0.1.0
gh workflow run publish.yml -f tag=v0.1.0
```

The workflow checks out the tag, verifies it matches `package.json`, runs the release checks, builds and tests one exact tarball, then publishes that tarball. Tag creation, pushing, workflow dispatch, npm configuration, and publication are intentionally not performed by local preparation.

## Post-publication checks

After npm reports success, verify registry metadata and execute the published package explicitly:

```bash
npm view @orbit-collective/skills@0.1.0 name version dist.integrity engines
npm exec --yes --package=@orbit-collective/skills@0.1.0 -- orbit-skills --version
npx --yes --package=@orbit-collective/skills@0.1.0 orbit-skills list --json
```

Only then create or finalize the matching GitHub Release. A local tarball test cannot prove registry visibility, CDN propagation, provenance, npm permissions, or installation from the public registry.

