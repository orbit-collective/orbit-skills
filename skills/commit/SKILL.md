---
name: commit
description: Turn existing changes in the Orbit repository into small, logical commits following Orbit's Conventional Commit rules, with a checked staged diff and scope. Use for /commit and for requests to commit changes or split them into commits.
---

# Commit

Analyze the existing changes, group them by purpose, and record them as a readable history. Each commit holds one coherent change that can be understood and reviewed on its own.

## Modes and boundaries

- By default, create the commits: invoking /commit is the instruction to do so. If the user only asks for a proposed split or messages, present the plan without staging or committing.
- Do not change code to improve the solution, refactor, or fix bugs you discover. Report those separately.
- Do not push, open a PR, merge, rebase, or publish unless the user already asked for it. Opening a PR is the `create-pr` skill's job.
- Do not amend, reset, or otherwise rewrite history without a separate instruction.
- Never discard the user's changes. Do not switch branches or change Git configuration, author identity, or signing without being asked.
- Never skip hooks with `--no-verify`. Never use `--allow-empty` to inflate the commit count.
- Never add `Co-Authored-By`, "Generated with Claude Code", or any AI attribution to commit messages in this repository.

## Investigation

1. Read `CLAUDE.md` and `.github/git-commit-instructions.md`. Check the current branch, `git status`, the staged and unstaged diff, untracked file names, and the last commit messages (`git log --oneline -20`).
2. Establish the user's scope. If they named files or the current task, do not include unrelated changes. If they said to commit everything, review all changes before staging.
3. If the user invoked /commit with no further context and there are staged changes, treat them as the default scope. With nothing staged, use the unambiguous scope of the current task. If remaining changes have unclear origin or scope, present the plan and ask only about that ambiguity.
4. On a detached HEAD or on `master`, stop and establish the right branch before committing. Orbit works on feature branches named after the Orbit issue (e.g. `FE-1390`). Never switch to a guessed branch yourself.
5. Never invent an issue or ticket number. Reference a GitHub issue with `#<n>` only if the user gave it or it is confirmed (`gh issue view <n>`).
6. If there are no changes in scope, say so and stop without an empty commit.

## Message format (Orbit)

Follow `.github/git-commit-instructions.md` and the existing history:

```text
type(scope): description
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`. Dependency bumps follow Dependabot's style: `deps(deps): ...` for runtime and `chore(deps-dev): ...` for dev dependencies.
- Scope is the domain or area, lowercase, reusing scopes already in the log: `github`, `issue-types`, `automation`, `comments`, `auth`, `labels`, `attachments`, `issues`, `settings`, `ui`. Check `git log` before inventing a new one.
- Imperative mood, lowercase after the colon, no trailing period, subject under 50 characters where possible (hard limit 72). Example: `fix(attachments): make attachment creation atomic`.
- The body explains why or an important consequence when the subject does not, wrapped at about 72 characters.
- **Types drive releases.** release-please on `master` reads these messages: `feat` produces a minor release and appears under Features, `fix` a patch under Bug Fixes, and `!` or `BREAKING CHANGE:` a major one. Pick the type that describes the change honestly; never pick a type to get a particular version. Cleanup is `refactor` or `chore`, not `feat`.
- Use `git commit -F <file>` for multi-line messages so newlines and literal characters survive without shell interpolation. Keep the file in a scratch location, not in the repository.

## Grouping changes

- Group by purpose or behavior, not by file extension, directory, or line count.
- Keep the implementation, its tests, and the documentation needed to understand it together. In Orbit a feature usually spans Controller, Service, Repository, Policy, a migration, the Inertia page or components, and tests; that is one commit, not one per layer. Do not split frontend and backend if one is inconsistent without the other.
- New en/pl guides required by the `CLAUDE.md` documentation rule may go with the feature or as a following `docs(scope): ...` commit, matching how this repository has committed docs before.
- Separate an independent refactor, a behavior change, documentation, and a dependency update when they really are separate units.
- Commit a manifest together with its lockfile (`package.json` + `package-lock.json`, `composer.json` + `composer.lock`). Never include incidental lockfile churn in an unrelated commit.
- Order dependent commits so an earlier one never needs code added later. Avoid intermediate states with missing imports, broken types, or a migration without the code that uses it.
- Do not split artificially into one file per commit. One commit is right for a small, coherent fix.
- If one file contains several independent changes, consider staging selected hunks. Do not split hunks whose dependencies you do not understand.
- Briefly state the planned split before committing. Do not ask for approval again when the scope was already clearly given.

## Content checks

- Review every untracked file before adding it. Never add secrets, `.env` files with values (only `.env.example` is tracked), private keys, `database/database.sqlite` or other local databases, logs, `coverage/`, `coverage-html/`, `public/build/`, `public/hot`, `storage/` runtime files, or IDE folders such as `.idea/` and `.junie/`.
- Include generated files only if the repository deliberately tracks them and this change needs them.
- Never print the value of a secret you find. Skip the sensitive file and report it; if the secret sits in a hunk you cannot split out of the scope, hold that commit instead of recording the secret.
- Avoid `git add .` and `git add -A` without a full review of the scope. Prefer exact paths or selected hunks.
- `git commit` records the whole index. Staged changes outside the requested scope must not slip into a commit. If they prevent a safe split, decide with the user how to handle them without overwriting their work.

## Creating each commit

1. Stage only the planned group. Check the staged diff, the list of paths, any deletions, and `git diff --cached --check`.
2. Run relevant existing checks if they have not already run for exactly this change. Use the repository's commands and do not install tools on the way:
   - Frontend: `npx tsc --noEmit`, `npx eslint <changed files>` (Prettier formatting and import/Tailwind class ordering are enforced through lint), `npx vitest run <affected tests>`.
   - Backend: `vendor/bin/pint --test <changed PHP files>`, `php artisan test --filter=<affected tests>`.
   - In Docker: `make type-check`, `make test-js`, `make test`.
3. Passing tests on the whole working tree do not prove a partially staged commit works alone. Check what its content depends on; when in doubt, combine dependent changes rather than create an uncertain intermediate state.
4. Do not rerun the full suite for every small commit when earlier verification still covers it. Run extra checks for new changes, failures, or significant dependencies.
5. If a relevant check fails because of the change, hold that group and report the result. For a pre-existing failure, give the evidence and the limitation; do not fix it yourself.
6. Commit with a message in the Orbit format above.
7. If a hook modifies files or rejects the commit, inspect the output and status before trying again. Do not automatically add the hook's changes, do not change their scope, and do not assume the commit was created.
8. After success, check the hash, the message, the paths actually recorded (`git show --stat HEAD`), and the remaining Git state. Move to the next group only after this check.

## Final report

List the created commits in order: short hash, message, and a short description of the content. List the checks you ran, their results, and significant limitations. Point out changes left uncommitted and any blocked groups.

Never claim a clean working tree, a successful commit, or passing tests without checking the output of the relevant commands. If you only produced a plan, state clearly that no commits were created.
