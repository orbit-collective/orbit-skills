---
name: create-pr
description: Open a GitHub pull request for the branch that is currently checked out, covering every change on it against master. Runs the full CI suite locally first (the same jobs as .github/workflows/ci.yml), then writes a conventional-commit title and a fully filled-in .github/pull_request_template.md body in English. Use whenever the user asks to create, open, raise, or prepare a PR.
---

# Create a pull request

Turns the work on the current branch into a review-ready GitHub pull request: verify locally that CI will pass, then open the PR with `gh` using a conventional-commit title and a completely filled-in PR template.

## Hard rules

- **English only.** Title, body, bullets, notes: every word of the PR is English, regardless of the language the user is speaking.
- **No emoji anywhere** in the title or body, including the template headings and any footer.
- **No AI-slop writing.** No em dashes or double hyphens used as punctuation (`—`, `--`), no "delve", "seamless", "robust", "leverage", "comprehensive solution", "in today's fast-paced", no hype adjectives, no trailing "This ensures..." summary sentences bolted onto every bullet. Write like a developer describing their own diff: concrete, specific, past tense for what was done.
- **No attribution footer.** Never add `Co-Authored-By`, "Generated with Claude Code", or any Claude/AI mention to the PR title, body, or commits in this repo.
- **Never open the PR before the local CI run is green.** See "Step 3".
- **Never invent a linked issue.** See "Related Issue" below.

## Step 1: gather the branch state

Run these first and read the output before writing anything:

```bash
git branch --show-current
git fetch origin master
git log --no-merges origin/master..HEAD --pretty='%h %s%n%b'
git diff origin/master...HEAD --stat
git status --short
```

Then read the actual diff for the substantive files (`git diff origin/master...HEAD -- <path>`) so the description reflects what the code does, not just the commit subjects. For a large diff, read the files that carry the behaviour change (Services, Repositories, Controllers, migrations, Pages/Components) and skim the rest.

Checks before going further:

- If the current branch **is** `master`, stop and tell the user; there is nothing to open a PR from.
- If `git status --short` is non-empty, tell the user which files are uncommitted and ask whether to commit them, include them, or leave them out. Do not commit on their behalf without an answer; if they want them committed, follow the `commit` skill.
- If there are no commits ahead of `origin/master`, stop and say so.
- Push the branch if needed: `git push -u origin <branch>`.
- If a PR already exists (`gh pr view --json number,url,title`), do not open a second one. Report the existing PR and offer to update its title/body instead (`gh pr edit`).

## Step 2: determine the Orbit issue marker

Orbit's GitHub integration links a pull request to an Orbit issue via a hidden marker in the PR description, `<!-- orbit-issue:ID -->` (see `documentation/en/integrations/06-github-integration.md`). This is a separate concept from the "Related Issue" GitHub issue number in Step 6 below: the marker links to an issue tracked inside Orbit itself, not to a GitHub Issue, and every PR opened from an Orbit-tracked branch should carry one.

Derive the ID from the current branch name, checked in Step 1:

- If the branch name ends in a ticket-style suffix, `<PREFIX>-<digits>` (e.g. `FE-1390`, `BUG-42`), use the digits as the Orbit issue ID automatically — no confirmation needed, this is a mechanical extraction, not a guess. `FE-1390` → `<!-- orbit-issue:1390 -->`.
- If the branch name does **not** match that pattern (e.g. `fix-typo`, `hotfix`, `main`, or any name with no numeric ticket suffix), do **not** guess an ID. Ask the user for the Orbit issue ID before continuing — do not silently omit the question and do not invent a number. If the user confirms there is no corresponding Orbit issue, proceed without a marker.
- Never derive the ID from anything other than the branch name (not commit messages, not the PR title) — the branch name is the one deliberate signal here, matching how these branches are actually created.

Keep the resolved ID (or "none") in mind for Step 6.

## Step 3: run the full CI suite locally

Mirror every job in `.github/workflows/ci.yml`. The `ci-status` job requires all five to pass, so all five run here. **Run them through the Docker containers** (the `Makefile` targets, or the `docker compose run` command given below where no faithful target exists) rather than the host `npm`/`composer` binaries: the containers match CI's PHP and Node versions and ship PCOV, so the host toolchain drifting out of sync cannot produce a false pass or a false failure.

Run them in this order and **stop at the first failure**:

| CI job | Command |
| --- | --- |
| Type check | `make type-check` |
| Lint | `docker compose run --rm vite npx eslint resources/js` |
| Component tests (Vitest) | `make test-js-coverage` |
| Build verification | `docker compose run --rm vite npm run build` |
| PHP tests (Pest) | `make test-coverage` |

Two of these deliberately bypass the obvious `Makefile` target, because that target does not mirror CI:

- **Lint.** `make lint` runs `npm run lint`, which passes `--fix` and so silently repairs problems that would fail the build. CI runs a bare `npx eslint resources/js`. Use the `docker compose run` form above. If it reports fixable problems, fix them, then re-run that same bare command.
- **Build.** `make build` builds the Docker *images*; it is not the Vite production build that CI's build job runs. Use the `docker compose run` form above.

Other notes that matter:

- Before the first container command on a branch, make sure the stack is up (`make up-d`), and after any dependency change on the branch run `make npm-install` / `make composer-install`. `node_modules`/`vendor` are anonymous volumes, so without this the suites run against stale dependencies.
- `make test-js-coverage` enforces the thresholds in `vite.config.js` (80% statements/functions/lines, 75% branches) and `make test-coverage` enforces `--min=90` on `app/`. A coverage shortfall is a CI failure like any other; treat it as one.
- `make test-coverage` can die with `Allowed memory size of 134217728 bytes exhausted` in `php-code-coverage`'s report serializer *after* every test has already passed. This is a local memory-limit problem, not a branch failure, and it is not fixable by writing a `memory_limit` ini into the running container: the target uses `docker compose run --rm`, which starts a fresh one, and `php artisan test` spawns pest as a subprocess that does not inherit a `-d memory_limit` override. Run pest directly instead, which keeps the override in-process:

  ```bash
  docker compose run --rm app php -d memory_limit=3G vendor/bin/pest --coverage --min=90
  ```

- Running on the host is a fallback only, for when Docker is unavailable: `npx tsc --noEmit`, `npx eslint resources/js`, `npm run test:coverage`, `npm run build`, `composer test-coverage`. Note that `composer test-coverage` needs PCOV or Xdebug installed on the host and will refuse to run without one. If you fall back, say so when you report the results.

Other workflows in `.github/workflows/` are not locally reproducible and are not part of this gate: `gemini-review.yml`, `labeler.yml`, `release-please.yml` and `notify-docs-change.yml`. Do not run them, and **do not mention them in the PR body at all**: not in Testing, not as a caveat in Notes. A reviewer does not need to be told that a workflow which runs automatically on the PR will run automatically on the PR, and speculating about what it might report is noise. Mention in the PR body only the commands you actually ran. The same goes for local-environment troubleshooting such as the memory-limit workaround above: it belongs in your report to the user, never in the PR.

**On failure:** fix the cause and re-run the failing command, then continue the sequence. If the failure is unrelated to the branch and pre-exists on `master`, say so explicitly to the user and ask whether to open the PR anyway. Never report a suite as passing that you did not run to completion.

## Step 4: check the documentation rule

`CLAUDE.md` requires a guide under `documentation/en/<category>/` plus its Polish translation at the matching `documentation/pl/` path for anything genuinely new (a new subsystem, extensibility point, permission category, or event-driven flow). If the branch introduces one of those and the diff has no matching documentation change, tell the user before opening the PR and offer the `document-feature` skill. Small changes to already-documented extension points do not need a guide.

## Step 5: write the title

Conventional commit format, matching `.github/git-commit-instructions.md` and the repo's commit history:

```
type(scope): description
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
- Scope is the domain or area touched, lowercase, as used in the log: `issues`, `issue-types`, `integrations`, `projects`, `labels`, `api`, `ui`, `auth`, `qodana`. Check `git log --oneline -20` for the scopes actually in use and reuse one rather than inventing a synonym.
- Imperative mood, lowercase after the colon, no trailing period, subject under 50 characters where possible and never over 72.
- Pick the type that describes the branch as a whole. A branch that adds a feature and its tests is `feat`, not `test`. If the branch is genuinely two unrelated things, say so and suggest splitting (the `gh-stack` skill handles stacked branches).
- Append `!` after the scope for a breaking change (`feat(api)!: ...`) and describe the break in the body.

Good: `feat(issue-types): add per-project workflow transitions`
Bad: `Update files`, `feat: various improvements`, `feat(issues): Added new stuff.`

## Step 6: write the body

Use `.github/pull_request_template.md` verbatim as the skeleton: same headings, same order, same checkbox lines. Replace every `<!-- comment -->` placeholder with real content and delete the comment. Never leave an empty bullet or an unfilled section.

- **Summary**: two to five sentences: what problem the branch solves, the approach taken, and anything a reviewer needs to know up front. Not a restatement of the title.
- **Changes**: one bullet per meaningful change, ordered from most to least significant. Name the layer and the file or class (`Added IssueTypeService::applyTransition() to validate a status change against the project workflow`). Keep the backend Controller/Service/Repository split visible: a reviewer should be able to tell from the bullets where query logic, orchestration and validation each landed. Group frontend work by component or page. Include migrations, config, and documentation as their own bullets. Add bullets freely; three is the template's placeholder, not a limit.
- **Related Issue**: fill `Closes #` only with a *GitHub* issue number the user gave you, or one that appears in a branch commit message or the branch name (e.g. branch `FE-1334` referencing issue `#1334`) and that you have confirmed with `gh issue view <n>`. If there is no confirmed issue, replace the whole line with `No related issue.` rather than guessing a number. This is unrelated to the Orbit issue marker from Step 2 below.
- **Testing**: describe how the change was verified: name the CI commands you ran in Step 3 and their outcome, plus any new test files and any manual verification. Tick the checkboxes that are actually true: `Existing tests pass` only if the suites ran green, `New tests added` only if the diff adds test files, `Manually verified` only if the app was actually exercised. Leave untrue boxes unticked rather than ticking everything.
- **Checklist**: tick honestly, same rule. `Documentation has been updated where required` stays unticked if Step 4 found a gap. `CI checks are passing` reflects the local run from Step 3.
- **Notes**: reviewer-facing context: trade-offs, deliberately deferred work, follow-up tickets, anything risky, or where to start reading. Keep out anything that is not about the diff: no remarks about CI workflows that run automatically on the PR (Gemini review, labeler, release-please), and no local-environment troubleshooting such as a memory-limit or Docker workaround you needed to get a suite running. Report those to the user instead. If there is genuinely nothing to add, write `None.` and do not pad it.

If Step 2 resolved an Orbit issue ID, append `<!-- orbit-issue:ID -->` on its own line at the very end of the body, after Notes. If Step 2 concluded there is no corresponding Orbit issue, omit it entirely — never write the marker with a placeholder or guessed ID.

## Step 7: open the PR

Write the body to a file in the scratchpad directory (never pass a long body inline; heredocs mangle backticks and `$`), then:

```bash
gh pr create \
  --base master \
  --head "$(git branch --show-current)" \
  --title 'type(scope): description' \
  --body-file /path/to/scratchpad/pr-body.md
```

Add `--draft` only if the user asked for a draft. Do not add reviewers, labels or assignees unless asked; `labeler.yml` applies labels automatically.

Before running it, show the user the exact title and the full body and ask for confirmation. After the PR is created, report the URL and the result of each local CI command.
