# Use the CLI and interactive menu

This guide covers the two supported interfaces over the same installation and recovery services: the TTY menu for people and direct commands or versioned JSON for scripts.

## Step 1 — Build and start locally

Use Node.js 20.17.0 or newer:

```bash
npm install
npm run build
node dist/cli.js
```

With stdin and stdout connected to a TTY, no arguments open the menu. Redirected execution prints help and exits. The current package is private, so distinguish this local invocation from a future global npm installation.

## Step 2 — Navigate and search

Use `↑`/`↓` and `Enter` in menus. In the skill checkbox list, `Space` toggles the active item. Search is a separate input screen: type a name or ID, press `Enter`, then reopen the checkbox list. Filtering does not discard hidden selections. Use the explicit select-all and clear actions when needed. `Ctrl+C` cancels without starting a new operation.

The first run offers installation but never executes it automatically. Install, update, and uninstall show a dry-run plan before confirmation. Uninstall and backup cleanup require destructive confirmation.

## Step 3 — Use direct commands

Direct commands never prompt:

```bash
node dist/cli.js list
node dist/cli.js info document-feature
node dist/cli.js install document-feature --agent codex --dry-run
node dist/cli.js update document-feature --agent codex
node dist/cli.js uninstall document-feature --agent codex
node dist/cli.js status --agent claude-code
node dist/cli.js doctor --agent codex
node dist/cli.js recover --agent codex --transaction .orbit-skills-update-EXACT
node dist/cli.js cleanup --agent codex --dry-run --keep 3
```

Without skill IDs, install and update operate over all available compatible skills. Uninstall always requires explicit IDs.

## Step 4 — Consume JSON

`list`, `info`, `status`, and `doctor` accept `--json`. They write one document with `schemaVersion: 1`; errors write an `error` object and set a nonzero exit code. JSON never contains terminal decoration.

`status` and `doctor` expose local installation and recovery paths. Doctor may expose validated lock owner fields needed for controlled recovery, but never exports machine identity fields, raw invalid journals, fingerprints, or skill contents.

## Step 5 — Verify changes

Tests for menu state use an injected prompt adapter. Built-CLI tests use a temporary `HOME` and cover help, version, JSON, selection, idempotence, and non-interactive behavior:

```bash
npm run typecheck
npm run build
npm test
node test/cli-integration.test.js
```
