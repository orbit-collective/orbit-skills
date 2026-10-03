---
name: fix-review
description: Fix findings from an Orbit code review (the review skill's P0-P3 output, PR review comments, or a pasted list) one at a time, each with a regression test and verification, without widening the scope. Use for /fix-review and for requests to address or apply review feedback.
---

# Fix Review

Apply the findings of a code review to the Orbit repository (Laravel + Inertia.js + React/TypeScript). Every fix is small, verified, and traceable to one finding. This is the counterpart to the `review` skill, which only reports.

## Boundaries

- Fix only the findings you were given. Do not refactor, restyle, or "improve" nearby code. Note unrelated problems you spot and report them separately.
- Do not change behavior a finding does not cover. If a fix forces a contract change (Inertia prop shape, route, Policy rule, migration), stop and ask before doing it.
- Never silence a finding instead of fixing it: no `@ts-ignore`, `eslint-disable`, skipped tests, loosened assertions, or lowered coverage thresholds.
- Do not commit, push, reply to, or resolve PR review threads unless the user asked for it. To commit the fixes, use the `commit` skill.
- Preserve the user's uncommitted changes. Never use `git reset`, `git clean`, or `git checkout` to discard work.
- Follow `CLAUDE.md`: Controller → Service → Repository layering, atomic-design components, CSS variables, and the en/pl documentation rule.

## Step 1: collect the findings

Accept findings from any of these sources, in this order of preference:

1. Output of the `review` skill in this conversation (`[P1] Title / Location / Trigger / Impact and evidence / Fix direction`).
2. Review comments on a PR: `gh pr view <n> --comments` and `gh api repos/{owner}/{repo}/pulls/<n>/comments` for inline comments. Include only unresolved threads that ask for a change.
3. A list the user pasted.

If no source is available, ask for one. Do not run a fresh review on your own and start fixing it.

Normalize each finding into: ID, priority, location, the claimed problem, and the expected behavior. Merge duplicates that share a root cause.

## Step 2: triage before touching code

For every finding, re-read the current code at its location (line numbers may have shifted) and classify it:

- **Valid:** the problem exists in the current code. Fix it.
- **Already fixed:** a later change resolved it. Record the evidence.
- **Invalid:** the finding is wrong once you read the surrounding context (a caller validates, a Policy already blocks it, the value cannot be null). Record why. Do not "fix" it to make the reviewer happy.
- **Needs decision:** the fix requires a product or contract decision, or the reviewer's suggestion conflicts with another requirement. Ask the user.

Show the triage table to the user before fixing if any finding is Invalid or Needs decision. Otherwise proceed.

Work in priority order: P0, P1, P2, then P3.

## Step 3: fix one finding at a time

For each valid finding:

1. **Reproduce first when practical.** Write a failing test that captures the reported trigger:
   - Backend: a Pest test in the matching `tests/Feature/...Test.php` (Controller, Service, Repository, or Policy level, whichever layer owns the bug). Feature tests use `RefreshDatabase` on in-memory SQLite.
   - Frontend: a colocated `*.test.tsx` with Testing Library, asserting behavior (what the user sees or can do), not CSS classes.
   - Skip the test only for findings that cannot be expressed as behavior (a comment, a type-only fix, a doc path) and say so.
2. **Apply the smallest fix in the right layer.** Query logic belongs in the Repository, orchestration and side effects (activity log, events, notifications) in the Service, validation and authorization in the Form Request / Controller / Policy. Frontend fixes reuse existing Atoms/Molecules, `cn()`, and CSS variables.
3. **Run the targeted test** and confirm it now passes, plus the existing tests for that file:
   - `php artisan test --filter=<TestName>` (or `make test` in Docker)
   - `npx vitest run <path>` (or `make test-js`)
4. Move to the next finding. Do not batch unrelated fixes into one edit.

Security findings (IDOR across projects, missing `authorize`, mass assignment, XSS, webhook signature checks) always get a test that proves the unauthorized path is now rejected, e.g. a user from another project receiving 403.

## Step 4: verify the whole change

After all fixes, run the checks that match what you touched:

- `npx tsc --noEmit`
- `npx eslint resources/js` (bare, without `--fix`, like CI)
- `npx vitest run` for affected areas, or `make test-js-coverage` if many components changed
- `php artisan test` for affected suites, or `make test-coverage` for broad backend changes (90% gate on `app/`)
- `vendor/bin/pint --test` on changed PHP files

Review the full diff once more: every hunk must map to a finding or its test.

If a fix adds a genuinely new extensibility point (rare for review fixes), the `CLAUDE.md` documentation rule applies; offer the `document-feature` skill.

## Final report

List each finding with its outcome:

```text
[P1] Title - fixed
  Change: path/to/file.php - what changed
  Test: tests/Feature/SomethingTest.php - "rejects issue update from another project"
[P2] Title - invalid
  Reason: ProjectPolicy::view already blocks this before the controller runs (app/Policies/ProjectPolicy.php:21).
[P3] Title - needs decision
  Question: ...
```

Then the checks you ran with their results, anything left unverified, and unrelated problems you noticed but did not fix. If the user asked you to reply on the PR, keep replies short, plain, and in first person, one per thread, saying what changed or why it was not changed.
