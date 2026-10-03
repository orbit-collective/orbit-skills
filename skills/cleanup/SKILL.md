---
name: cleanup
description: Clean up code in the Orbit repository within a defined scope without changing its behavior. Use for /cleanup and for requests to remove dead code, unused imports, redundant fragments, or outdated comments.
---

# Cleanup

Remove verified redundant code and simplify local fragments in the Orbit repository (Laravel + Inertia.js + React/TypeScript), preserving the application's existing behavior and public contracts.

## Boundaries

- Work only within the scope the user specified. Read dependencies outside it when needed to judge whether a change is safe.
- Do not add features, fix discovered bugs, or change architecture along the way. Report such issues separately.
- Do not change routes, controller responses, Inertia prop shapes, the database schema or migrations, Policies, permissions (`App\Enums\Permissions\Permission`), error handling, or visible UI behavior.
- Do not update dependencies, remove packages, or change tool configuration (`eslint.config.js`, `vite.config.js`, `tsconfig.json`, `phpunit.xml`, `composer.json`, `package.json`) without a separate request.
- Do not mass-format. Do not run `npm run lint` or `vendor/bin/pint` over the whole repository; limit formatting to the files you changed. Never edit `vendor/`, `node_modules/`, `public/build/`, `coverage*/`, `bootstrap/cache/`, or the lockfiles (`composer.lock`, `package-lock.json`).
- Do not touch already-run migrations in `database/migrations/` — they are history, even if they reference code that no longer exists.
- Do not create commits, PRs, or publish anything unless the user explicitly asked for it in this session. When they do, use the `commit` skill, keeping the cleanup in `refactor`/`chore` commits separate from behavior changes.
- Preserve the user's existing changes. Never use `git reset`, `git clean`, or `git checkout` to discard them.

## Process

1. Read `CLAUDE.md`. Check the Git state, the available scripts (`package.json`, `composer.json`, `Makefile`), and the project conventions.
2. Establish the scope. If none is given, limit yourself to files changed against HEAD (including staged) plus relevant untracked files. If there are no changes and no target, ask for a file, directory, or module. Never start cleaning the whole repository by default.
3. Find candidates and check their usage with `rg` and project tooling (`npx tsc --noEmit`, ESLint's unused-vars rules). An empty search result alone does not prove code is dead.
4. Before removing anything, account for Orbit's indirect usage:
   - **Inertia pages** are resolved by name from `Inertia::render('Name', …)` — a page file with no import is not dead. Search controllers for the render name.
   - **Laravel container and conventions:** classes bound or resolved by the container, Service Providers, event → listener mappings and auto-discovery in `app/Listeners`, Jobs dispatched by class name, Policies resolved by model, Form Requests type-hinted in controllers, Artisan commands in `app/Console/Commands`, scheduled tasks in `routes/console.php`.
   - **Registries and enums:** integration notifiers/importers implementing `app/Contracts/*`, enum cases used in the database or seeders (permissions, notification types, automation triggers/actions), config keys read via `config()`, Blade views, and route names used through `route()` in PHP or the frontend.
   - **Model members:** accessors, mutators, casts, scopes (`scopeX` called as `->x()`), relationships called as dynamic properties, `$fillable`/`$appends`.
   - **Frontend:** components used through barrel files or dynamic maps, types in `resources/js/types/` shared with tests, and code referenced only from `documentation/en|pl/` guides (update or keep — don't silently break a guide's snippet).
   If you cannot confirm the code is unused, keep it and describe the uncertainty.
5. Make small, local changes. Remove confirmed unused imports, private symbols, unreachable fragments, or comments that describe code that no longer exists. Simplify only when equivalence is clear.
6. Review the full resulting diff and run appropriate verification.

## Evaluation rules

- Do not remove an import just because its symbol is unused: it may perform a needed side effect (e.g. CSS imports, `@testing-library/jest-dom`, `bootstrap.ts`).
- Preserve execution order, call counts, side effects (activity logs, dispatched events and notifications), null/undefined handling, data ordering, and return types.
- Do not remove a TODO just because it is old. Remove it only after confirming it was resolved or is obsolete.
- Do not treat an export, route, controller action, or file as redundant just because it has no local consumer.
- Do not merge similar fragments if they differ in meaning or would require a new abstraction. Report a larger refactor as a proposal.
- Do not delete tests to get a green run. Removing a test requires proof that it covers removed, genuinely redundant code. Keep the coverage gates in mind (90% backend via `composer test-coverage`, thresholds in `vite.config.js` for the frontend).
- If cleaning something up would require a behavior change, skip that fragment and continue with the safe changes in scope.

## Verification

- Run the existing checks for the changed area, using the repository's commands rather than guessing script names:
  - Frontend: `npx tsc --noEmit`, `npx eslint <changed files>`, `npx vitest run <affected tests>` (or `make type-check`, `make test-js` in Docker).
  - Backend: `vendor/bin/pint <changed files>`, `php artisan test --filter=<TestName>` or `composer test` (or `make test` in Docker).
- When removing modules or components, also run `npm run build`, which can catch import and bundling errors.
- Do not add tests just for removing an unused import. For a non-obvious simplification, use a behavior test or drop the change if it cannot be verified reliably.
- Separate pre-existing failures from regressions caused by your change. Do not fix unrelated problems.
- Never claim behavior was verified if the relevant checks were not run.

## Final report

Briefly state:

- What was removed or simplified, and in which files.
- How you confirmed the removed elements are not needed.
- What verification you ran and with what result; what remains unverified.
- Which candidates you skipped because of uncertainty or because they were out of scope.

If there are no safe changes, say so plainly. Never generate changes just to produce a diff.
