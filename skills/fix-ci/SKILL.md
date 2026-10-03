---
name: fix-ci
description: Diagnose and fix a failing Orbit CI run (type check, lint, Vitest with coverage, build, Pest with coverage) by reading the real logs, reproducing the failing job locally in Docker, and fixing the root cause. Use for /fix-ci and whenever the user says CI, a check, or a GitHub Actions job is red.
---

# Fix CI

Find out why Orbit's CI failed, reproduce it locally, and fix the cause without weakening the checks.

CI is `.github/workflows/ci.yml`. It runs five jobs and a `ci-status` job that requires all of them:

| CI job | Local reproduction (Docker) | Host fallback |
| --- | --- | --- |
| Type check | `make type-check` | `npx tsc --noEmit` |
| Lint | `docker compose run --rm vite npx eslint resources/js` | `npx eslint resources/js` |
| Component tests (Vitest) | `make test-js-coverage` | `npm run test:coverage` |
| Build verification | `docker compose run --rm vite npm run build` | `npm run build` |
| PHP tests (Pest) | `make test-coverage` | `composer test-coverage` |

Do not use `make lint` (it runs ESLint with `--fix` and hides failures) or `make build` (it builds Docker images, not the Vite bundle) to reproduce CI.

## Boundaries

- Fix the cause, never the signal. Do not lower coverage thresholds in `vite.config.js` or `--min` in `composer.json`, disable lint rules, add `@ts-ignore`, mark tests skipped, or loosen assertions to get green. If the user explicitly wants a temporary bypass, make it visible and say so.
- Do not edit `.github/workflows/*` to make a failure disappear. Change a workflow only when the workflow itself is the bug (e.g. a removed action version), and explain why.
- Do not re-run CI or push commits unless the user asked.
- Preserve the user's uncommitted changes.

## Step 1: read the real failure

Prefer the actual logs over guessing:

```bash
gh pr checks <pr>                       # which jobs failed on a PR
gh run list --branch "$(git branch --show-current)" -L 5
gh run view <run-id>                    # job summary
gh run view <run-id> --log-failed       # only the failing steps' output
```

If `gh` is unavailable or has no access, ask the user to paste the failing job's log, or reproduce all five jobs locally (Step 2) and see which one fails.

Identify the failing job, the failing step, and the first real error (not the cascade after it). Note the commit SHA the run used and compare it with local HEAD (`git rev-parse HEAD`). If they differ, make sure you reproduce the same code.

## Step 2: reproduce locally

1. Make sure the stack is up (`make up-d`). If `package.json`, `package-lock.json`, `composer.json`, or `composer.lock` changed on the branch, run `make npm-install` / `make composer-install` first: `node_modules` and `vendor` are anonymous volumes and are otherwise stale.
2. Run only the failing job's command from the table above. Use the host fallback only if Docker is unavailable, and say so.
3. If it passes locally but fails in CI, look for environment differences before touching code (see "Common causes").

## Step 3: classify and fix

Common causes in this repository, roughly by frequency:

- **Coverage gate.** All tests pass but coverage is below the threshold (90% lines on `app/` for PHP; 80% statements/functions/lines and 75% branches for Vitest). Find the uncovered new code in the coverage report (`coverage-html/` for PHP, the Vitest text summary or `coverage/`) and add behavior tests for it. Do not add tests that only execute lines without asserting anything.
- **Lint.** CI runs bare `npx eslint resources/js`. Locally `npm run lint` auto-fixes, so failures can slip through. Fix the reported rules properly; run the bare command to confirm.
- **Type check.** Often a changed Inertia prop or a type in `resources/js/types/` that a page or test still uses the old way. Fix the types at the source, not with casts.
- **Build.** `tsc && vite build`: type errors, or imports with wrong case (Linux CI is case-sensitive, a Windows or macOS host may not be), or missing assets.
- **PHP tests.** Read the failing assertion. Typical sources: missing `authorize`/Policy changes, factories not updated for a new required column, migrations that do not run on SQLite, order-dependent assertions, time-dependent tests (use `$this->travelTo()`/`Carbon::setTestNow()`), or tests that hit real HTTP (use `Http::fake()`).
- **Dependency drift.** CI runs `npm ci --legacy-peer-deps` and `composer install` from the lockfiles. A lockfile out of sync with its manifest, or a package installed locally but never committed, passes locally and fails in CI.
- **Flaky test.** Passes on re-run without code changes. Confirm by running it several times locally (`npx vitest run <file>` repeatedly, `php artisan test --filter=<Test> --repeat=5` if available). Fix the cause (shared state, timers, unawaited promises, random data, ordering) rather than retrying. If you cannot find it, report it as flaky with evidence instead of claiming a fix.
- **Pre-existing failure on `master`.** Check whether the same job fails on the latest `master` run (`gh run list --branch master -L 3`). If it does, tell the user it is not caused by this branch and ask whether to fix it here or separately.
- **Local-only memory error.** `make test-coverage` can die with `Allowed memory size ... exhausted` in the coverage report writer after all tests passed. That is local, not a CI failure. Run `docker compose run --rm app php -d memory_limit=3G vendor/bin/pest --coverage --min=90` instead.

Apply the smallest fix in the right place, following `CLAUDE.md` layering and conventions.

## Step 4: verify

1. Re-run the failing job's command until it passes.
2. Run the other four jobs too, because fixes often move the failure (a new test can drop branch coverage elsewhere, a type fix can break the build).
3. Review the diff: every change must relate to the failure.

## Final report

State the failing job and the root cause in one or two sentences, the fix and the files changed, the local commands you ran with results (and whether Docker or the host was used), and anything that could still differ in CI. If the cause suggests a gap that will recur (for example a check that only exists in CI), propose a prevention step, such as running the bare lint command in a pre-push hook.
