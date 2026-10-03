---
name: extend-orbit
description: Extend Orbit by following its own step-by-step guides in documentation/en/ (permissions, notifications, integrations, automation, issue types, shortcuts, settings tabs, theme colors and more), so new code matches the established pattern and nothing in the checklist is missed. Use for /extend-orbit and whenever the user asks to add a new instance of an existing Orbit concept, such as a permission, notification type, integration, alert type, shortcut, or settings tab.
---

# Extend Orbit

Orbit documents every extensibility point as a copy-pasteable "how do I add X" guide under `documentation/en/<category>/`. This skill finds the guide that matches the request and implements the change by following it, instead of reverse-engineering the pattern from existing code.

## Boundaries

- The guide is the source of truth for the pattern. The current code is the source of truth for details. If they disagree, follow the code and report the drift (see "Guide drift" below).
- Implement only what the user asked for. Do not add extra instances "for completeness".
- Do not commit, push, or open a PR unless asked. The `commit` and `create-pr` skills handle that.
- Preserve the user's uncommitted changes and follow `CLAUDE.md`.

## Step 1: find the matching guide

1. Read `documentation/en/README.md` for the current list of categories. Do not rely on a memorized list; categories are added over time.
2. Pick the category that matches the request, then read that category's `README.md` and choose the guide (or the sequence of guides) for the exact task. Examples of the mapping:
   - "add a permission to manage X" → `permissions/01-add-a-new-permission.md`
   - "notify users when X happens" → `notifications/01-add-a-new-notification-type.md`, then `02-send-a-notification-from-your-code.md`
   - "add a Slack/Linear integration" → `integrations/01-add-a-new-integration.md` (plus `02-add-integration-settings.md` if it needs settings)
   - "add a keyboard shortcut" → `shortcuts/01-...` (component-scoped) or `02-...` (global)
   - "add a new settings tab" → `settings-tabs/02-add-a-brand-new-settings-tab.md`
   - "add a color token" → `theme-colors/02-add-a-new-theme-color-token.md`
3. Many changes span categories. A new notifying integration may need an event type (`integrations/03-add-a-new-event-type.md`), a permission, and a notification type. Build the full list of guides before writing code and tell the user which guides you will follow.
4. If no guide fits, say so. Fall back to `architecture/02-backend-layered-architecture.md` and `architecture/03-frontend-architecture-and-atomic-design.md` for the general pattern, and plan to write the missing guide afterwards (Step 5).
5. If the request is ambiguous between guides (component-scoped vs. global shortcut, role tier vs. single permission), ask.

## Step 2: check the current code against the guide

Before editing, open every file the guide names and confirm that the referenced classes, methods, enums, and tests still exist as described. Use the closest existing real instance as a second reference, e.g. the Discord integration for a new integration, or an existing `Permission` case and its seeder entry for a new permission.

## Step 3: implement step by step

Follow the guide's steps in order, one at a time. For each step:

- Make the change in the file and layer the guide names (Controller → Service → Repository; Atoms → Molecules → Organisms).
- Use the real names for the new instance. Never leave the guide's example names (e.g. "Slack") in your code unless that is what the user asked for.
- Do not skip "easy to forget" steps the guide calls out, such as granting a new permission to existing projects' roles (`php artisan permissions:grant-to-existing-roles`), registering a listener, adding the enum case to the frontend types, seeding defaults, or adding the en/pl copy.
- Add or update the tests the guide points to. Every guide has a tests section; it is not optional.

If a step needs a migration, make it work with existing rows and SQLite (nullable or defaulted columns, data backfill if needed), and write a `down()` that really reverses it.

## Step 4: verify

Run the checks matching what changed:

- `php artisan test --filter=<new or affected tests>`, then `composer test` (or `make test`)
- `npx tsc --noEmit`, `npx eslint resources/js`, `npx vitest run <affected paths>` (or `make type-check`, `make test-js`)
- `php artisan migrate` against a disposable database only if the change includes a migration and the user's environment allows it. Never run `migrate:fresh` on the user's real `database/database.sqlite` without asking.

Keep the coverage gates in mind (90% backend, `vite.config.js` thresholds frontend). New code should arrive with its tests.

## Step 5: documentation

- **New instance of an already-documented point** (another permission, another notification type): no new guide is needed.
- **Guide drift:** if the guide no longer matches the code (renamed class, extra required step), update the guide in `documentation/en/` and its translation in `documentation/pl/` in the same change, keeping code blocks and paths verbatim in English.
- **Nothing to follow** (Step 1, point 4): the result is a new extensibility point, so `CLAUDE.md` requires a new en/pl guide. Offer the `document-feature` skill.

## Final report

State which guides you followed, the files you changed per step, the tests you added, the checks you ran with results, and any guide drift you found and fixed or left for later.
