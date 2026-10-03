---
name: deps-update
description: Review and land dependency updates in Orbit (Dependabot npm and Docker PRs, or a manual npm/composer update) by checking changelogs for breaking changes, running the full CI suite in Docker with fresh dependencies, and fixing or reporting incompatibilities. Use for /deps-update and for requests to handle Dependabot PRs or update packages.
---

# Deps Update

Get dependency updates into Orbit safely. Dependabot (`.github/dependabot.yml`) opens daily PRs for npm and Docker with commit prefixes `deps` (runtime) and `chore` (dev). Composer packages are not covered by Dependabot and are updated manually.

## Boundaries

- Never merge, approve, close, or rebase a PR, and never push, unless the user explicitly asked for that action.
- Do not update more than the request covers. "Handle the Vitest PR" does not mean updating everything else.
- Do not edit lockfiles by hand. Change them only through `npm install` / `npm update` / `composer update <package>` and commit them together with their manifest.
- Do not bypass failures by pinning to an old version, adding `overrides`, or `--force`, without explaining the trade-off and getting the user's agreement. CI installs with `npm ci --legacy-peer-deps`; keep that behavior, do not introduce new install flags.
- Preserve the user's uncommitted changes.

## Step 1: build the list

- Dependabot PRs: `gh pr list --author app/dependabot --state open --json number,title,headRefName,labels`.
- Manual update: `npm outdated` and `composer outdated --direct`.

Group the updates:

1. **Patch and minor of dev tooling** (types, linters, test tooling): low risk.
2. **Patch and minor of runtime packages** (`@inertiajs/react`, `react`, `laravel/framework`, `lucide-react`…): medium risk.
3. **Major versions**, anything pre-1.0 with a minor bump, and the core stack (React, Inertia, Laravel, Vite, Tailwind, TypeScript, Vitest, Pest, PHP or Node base images): high risk, handle one at a time.
4. **Docker base images** (`Dockerfile`, `docker-compose.yml`): check that the PHP and Node versions still match CI (`ci.yml` uses Node 22 and the PHP version in its setup step). A mismatch makes local and CI results diverge.

Related packages that must move together are one update, e.g. `@vitest/*` with `vitest`, `@types/react` with `react`, `@tailwindcss/*` with `tailwindcss`, `@inertiajs/react` with `inertiajs/inertia-laravel`.

## Step 2: read what changed

For each update in groups 2 to 4, read the release notes or changelog between the current and the new version (`gh release view` on the package's repo, the package's `CHANGELOG.md`, or the npm/Packagist page). Look for:

- breaking changes, removed or renamed APIs, changed defaults;
- new peer dependency ranges (watch for peer conflicts hidden by `--legacy-peer-deps`);
- dropped Node or PHP versions;
- config format changes (ESLint flat config, Tailwind, Vite, Vitest coverage options, PHPUnit/Pest config).

Then search the codebase for the affected APIs (`rg`) to see whether Orbit uses them.

## Step 3: apply and install fresh

- Dependabot PR: check out its branch (`gh pr checkout <n>`), or apply the same version change on a working branch if the user wants several updates combined.
- Manual: `npm install <pkg>@<version>` or `composer update <vendor/package> --with-dependencies`.

Then refresh the containers, because `node_modules` and `vendor` are anonymous volumes and are otherwise stale:

```bash
make npm-install        # after any npm change
make composer-install   # after any composer change
```

For a Docker base image change, rebuild: `make setup` (no-cache build), or `make clean` followed by `make setup` if volumes must be dropped. Ask before `make clean`, it removes volumes.

## Step 4: run the full CI suite

Run all five CI jobs, as in `.github/workflows/ci.yml`, in Docker:

| CI job | Command |
| --- | --- |
| Type check | `make type-check` |
| Lint | `docker compose run --rm vite npx eslint resources/js` |
| Component tests | `make test-js-coverage` |
| Build | `docker compose run --rm vite npm run build` |
| PHP tests | `make test-coverage` |

For UI libraries (Headless UI, lucide-react, Tailwind, Inertia), also start the app and check a few key screens and interactions (board, issue page, modals, dropdowns, settings) if browser tools are available. Say clearly if no visual check was possible.

## Step 5: fix or report

- If an update breaks something and the fix is small and local (an API rename, a config option), fix it on the same branch, with tests passing, and describe the change.
- If it needs a larger migration (a major Laravel/React/Tailwind upgrade), stop and report: what breaks, where, and a proposed plan. Do not start a large migration unasked.
- If several Dependabot PRs touch the same lockfile, landing one makes the others conflict. Recommend an order (low-risk first) and note that Dependabot rebases the rest automatically, or offer one combined branch.

## Final report

For each update: package, from → to, risk group, what the changelog says that matters for Orbit, the checks run and their results, and a recommendation (safe to merge / merge after the fix on this branch / hold, with the reason). If you prepared a commit, use the repository's style, e.g. `deps(deps): bump lucide-react from 0.x to 0.y` or `chore(deps-dev): bump vitest ...`.
