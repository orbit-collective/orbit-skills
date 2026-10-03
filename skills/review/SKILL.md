---
name: review
description: Review code changes in the Orbit repository (working tree, branch, or PR) and report confirmed bugs, regressions, and significant risks without editing code. Use for /review and for requests to review code or assess changes before merging.
---

# Review

Assess the specified changes in the Orbit repository (Laravel + Inertia.js + React/TypeScript monolith) and report concrete, actionable problems. Focus on correctness and user impact.

## Boundaries

- Work in review mode: do not edit code, tests, configuration, or documentation. Do not run auto-fixers or formatters that write files — in particular `npm run lint` (it runs ESLint with `--fix`) and `vendor/bin/pint` without `--test`. Use `npx eslint resources/js` and `vendor/bin/pint --test` instead.
- Do not commit, push, merge, check out, or run any other operation that changes branch state.
- Do not post comments, approvals, or change requests to a remote PR unless the user explicitly asked you to publish the review.
- You may run relevant existing checks as long as they do not modify tracked files or user data. Do not run `php artisan migrate`, `migrate:fresh`, `make fresh`, `make clean`, or anything that touches `database/database.sqlite` or real external services (GitHub, Jira, Discord webhooks, Orbit Relay).
- Do not fix the problems you find. Hand findings off to a separate task, e.g. the `fix-review` skill.
- Follow `CLAUDE.md` and `.github/copilot-instructions.md`; judge the code against its real contracts and the project's conventions.

## Establish the comparison range

1. Read `CLAUDE.md` and check the Git state.
2. If a PR is given, read its description, actual base/head, and diff (`gh pr view`, `gh pr diff`). Do not assume the base is `master`; stacked PRs (gh-stack) often target another feature branch.
3. If a branch or commit range is given, use the stated base. For a branch review, compare its HEAD with the merge-base against the base (`git diff <base>...HEAD`); do not include unrelated changes from the base itself.
4. If no range is given, review staged and unstaged changes against HEAD plus relevant new untracked files. Do not include committed changes without establishing the goal.
5. If there are no local changes, derive the base from known PR context or ask for a branch, PR, or range. Never review the whole repository by default.
6. State the range you used and any significant access limitations. If the PR cannot be fetched, do not pretend that the local diff represents its current version.

## Review process

1. Understand the expected behavior from the task, the PR description, tests, and existing contracts.
2. Read the diff and the full context of changed code. Trace relevant callers, consumers, validation, and data flow beyond the diff — e.g. Controller → Service → Repository, the Inertia props a controller passes to `resources/js/Pages/**`, and the types in `resources/js/types/`.
3. Check the edge cases and failure scenarios that apply to this change. Do not mechanically apply the whole checklist to every file.
4. Verify potential findings by reading code, existing tests, or running safe commands. Drop a suspicion if further context explains it.
5. Review the tests in the change: do they assert behavior, and do they cover the main risks? Report a missing test as a finding only with a concrete unverified scenario and why it matters.
6. Merge duplicates that share a root cause. Order findings from most to least severe.

## What to assess

- **Correctness:** conditions, boundary values, null/undefined, empty data, types, order of operations, mismatch with requirements.
- **Regressions:** changed existing contracts, unintended behavior changes, backward compatibility — including changed Inertia prop shapes that existing pages or components still consume.
- **State and async:** races, stale data, wrong effect dependencies, double execution, optimistic updates without rollback, data loss after an error. Remember mutating routes return `redirect()->back()` and Inertia re-fetches props — check for stale local state that ignores the new props.
- **Backend architecture:** query logic belongs in Repositories, orchestration and side effects (e.g. `ActivityLogService` writes, events) in Services, validation/HTTP in Controllers and Form Requests. Flag a violation only when it has a concrete consequence (missed side effect, duplicated logic that already diverges, untested path).
- **Backend:** validation, authorization via Policies (`$this->authorize(...)`) and the `App\Enums\Permissions\Permission` enum, project scoping (a user must not reach another project's issues, labels, members, or integrations), transactions, idempotency, redirect/response shape, and HTTP status codes.
- **Security:** IDOR across projects, injection, XSS (e.g. rendered markdown), secret exposure, mass assignment (`$fillable`/`$guarded`), and webhook/relay signature verification when the change touches those mechanisms. Never quote the values of any secrets you find.
- **Database:** data loss, constraints, migrations that work with existing rows (including SQLite limitations on altering columns), indexes, and N+1 queries in a realistic usage scenario. Remember `Issue.labels` is a JSON array validated per project against real `labels` rows.
- **Frontend:** accessibility of important actions, keyboard use (including conflicts with `ShortcutContext` shortcuts), forms, error/loading states, both themes (`data-theme` dark/light via CSS variables), responsiveness, and atomic-design placement (Atoms/Molecules/Organisms). Do not present a visual assessment as verified without actually viewing the UI.
- **Performance:** concrete extra requests, queries, blocking operations, or cost that grows with data size. Do not propose speculative optimizations.
- **Maintainability:** report complexity only when it has a concrete consequence for correctness or for compliance with required project rules (e.g. a genuinely new extensibility point shipped without the en/pl guide that `CLAUDE.md` requires). Skip personal style preferences.

## Useful safe checks

Pick only what is relevant to the change:

- `npx tsc --noEmit`
- `npx eslint resources/js` (no `--fix`)
- `npx vitest run <path>` for affected frontend tests
- `php artisan test --filter=<TestName>` for affected backend tests (Pest, in-memory SQLite — safe)
- `vendor/bin/pint --test` on changed PHP files
- In Docker: `make test`, `make test-js`, `make type-check` (not `make lint` — it may fix files)

## Finding criteria

Report a problem when you can name the cause, a realistic trigger condition, and the impact. For a diff review, focus on problems introduced or exposed by the change; do not mix in unrelated pre-existing bugs.

Assign a priority:

- **P0 — critical:** blocks release or causes a widespread serious incident; use only with strong evidence and without relying on unconfirmed assumptions.
- **P1 — high:** serious regression, security violation, data loss, or a broken key path under realistic conditions.
- **P2 — medium:** a real bug with limited reach, or a problem in a significant edge case.
- **P3 — low:** a smaller, concrete defect worth fixing but not blocking release. Skip cosmetic preferences.

Never present an uncertain suspicion as fact. Put significant unknowns that need a decision or missing context separately under questions or limitations.

## Response format

Start with the findings. For each one give:

```text
[P1] Short title describing the problem
Location: path/to/file:line-or-short-range
Trigger: the concrete action or data that causes the problem.
Impact and evidence: what breaks and why it follows from the code or a check.
Fix direction: a short suggestion, without implementing the fix.
```

Point to the smallest possible range of changed lines and confirm the line numbers. Never invent paths, line numbers, or test results.

After the findings, briefly state the review range, the checks you ran and their results, and significant limitations. Separate pre-existing problems if mentioning them is necessary.

If you found no problems, write: "I found no concrete problems in the reviewed range", then list the checks and limitations. Do not treat an absence of findings as proof that the code is bug-free.
