# Orbit Skills

`@orbit-collective/skills` ships and safely manages the official Orbit skills for supported AI agents. The `orbit-skills` CLI can be used interactively in a terminal or directly from scripts.

## Installation and requirements

- Node.js 22.13 or newer within the Node 22 line, Node.js 24, or Node.js 26.
- A terminal with stdin and stdout attached to a TTY for the interactive menu.
- Codex or Claude Code for installing the currently shipped skills.

Install the CLI globally:

<!-- x-release-please-start-version -->
```bash
npm install --global @orbit-collective/skills@0.1.2
orbit-skills --version
```

Run a specific published version without a global installation:

```bash
npm exec --yes --package=@orbit-collective/skills@0.1.2 -- orbit-skills list
npx --yes --package=@orbit-collective/skills@0.1.2 orbit-skills info document-feature
```
<!-- x-release-please-end -->

The version in these commands is updated automatically by each release.

The terminal UI uses blue as its single accent because this repository does not define a brand color. Green means success or current, yellow means warning or local changes, red means error or conflict, and muted text means missing or informational. Every colored status also contains a text label. Set `NO_COLOR=1` to disable colors.

## Local development

Clone the repository, install dependencies, build, and run the built CLI:

```bash
npm install
npm run build
node dist/cli.js
```

During development, `npm start -- <arguments>` also runs `dist/cli.js`, so build after source changes.

Local execution uses the checkout rather than npm:

```bash
node dist/cli.js --help
```

## Supported environments

The package declares Linux, macOS, and Windows support on Node.js 22.13+, 24, and 26. The CI release gate exercises every one of those nine combinations, including filesystem operations, locks, rename-based metadata writes, built CLI execution, and installation of the packed tarball.

Before the first release, only Linux with Node.js 26 has been verified locally. The macOS, Windows, Node.js 22 minimum, and Node.js 24 claims remain release blockers until their GitHub-hosted CI jobs pass. Node.js 20 and older releases are unsupported because they are end-of-life. Odd-numbered end-of-life Node.js releases are not declared. Lock recovery that requires Linux `/proc`, machine identity, and boot identity intentionally refuses ambiguous removal on platforms where those identities are unavailable; normal locking and diagnostics remain available.

## Interactive menu

Run without arguments in an interactive terminal:

```bash
orbit-skills
```

The menu provides install, update, uninstall, status, skill details, diagnostics, recovery, backup cleanup, and exit. On first use it explains that no managed skills are installed and points to installation, but never installs automatically.

Common controls:

- `↑` and `↓`: move through an active list;
- `Space`: toggle an item only inside the checkbox list;
- `Enter`: open or confirm the current choice;
- `Ctrl+C`: cancel the menu safely;
- `← Back`: return from a submenu.

Skill search is a separate typing step. Enter a name or ID, press `Enter`, then open the visible checkbox list. Selections hidden by a filter remain selected. The selector also has explicit “Select all skills” and “Clear selection” actions and disables continuation when the selection is empty.

Changing actions first show a dry-run plan. The CLI takes the shared installation lock only after confirmation and checks the state again under that lock. Uninstall and cleanup use explicit destructive confirmations. Forced uninstall is never the default.

When either stdin or stdout is not a TTY, running without arguments prints help and exits instead of waiting for input. Direct commands never open prompts and never display the banner.

## Commands

| Command | Purpose |
| --- | --- |
| `orbit-skills list [--json]` | List every official skill available in this package. |
| `orbit-skills info <skill> [--json]` | Show catalog details for one skill. |
| `orbit-skills path --agent <id>` | Print the personal installation directory. |
| `orbit-skills install [skills...] --agent <id> [--dry-run]` | Install selected skills; without IDs, use all available compatible skills. |
| `orbit-skills status --agent <id> [--json]` | Inspect every available compatible skill. |
| `orbit-skills update [skills...] --agent <id> [--dry-run]` | Update selected skills; without IDs, check all available compatible skills, not only installed ones. |
| `orbit-skills uninstall <skills...> --agent <id> [--dry-run] [--force]` | Remove only explicitly selected managed skills. |
| `orbit-skills doctor --agent <id> [--clear-lock <lock-id>] [--json]` | Inspect locks and update workspaces or attempt exact-ID abandoned-lock recovery. |
| `orbit-skills recover --agent <id> --transaction <name>` | Recover one exact interrupted update transaction. |
| `orbit-skills cleanup --agent <id> [--dry-run] [--keep <count>]` | Remove verified completed update backups, keeping three by default. |

Supported agent IDs are `codex` and `claude-code`.

Examples:

```bash
orbit-skills install document-feature --agent codex --dry-run
orbit-skills install document-feature --agent claude-code
orbit-skills update document-feature --agent codex
orbit-skills uninstall document-feature --agent codex
orbit-skills status --agent codex --json
orbit-skills cleanup --agent codex --dry-run --keep 2
```

## Installation scope

Only personal installations are supported:

- Codex: `~/.agents/skills/<skill-id>`;
- Claude Code: `~/.claude/skills/<skill-id>`.

Project installations, profiles, pinned skill versions, external sources, and Orbit API integration are intentionally unsupported.

## JSON output

`list`, `info`, `status`, and `doctor` accept `--json`. Stdout contains exactly one JSON document and no banner, prompt, spinner, badge, or ANSI sequence. Errors use the same stream and return a nonzero exit code.

Every document starts with:

```json
{
  "schemaVersion": 1,
  "command": "status"
}
```

Successful documents add command-specific fields. Error documents add:

```json
{
  "schemaVersion": 1,
  "command": "info",
  "error": {
    "code": "COMMAND_FAILED",
    "message": "Unknown skill ID: missing-skill."
  }
}
```

Schema version 1 command payloads are:

- `list`: `packageVersion` and `skills[]`; each skill contains `id`, `name`, `description`, `usage`, `supportedAgents[]`, and `resources[]`.
- `info`: one `skill` object with the catalog fields above plus `packageVersion`.
- `status`: `agent`, `skillsDirectory`, and `skills[]`; each status contains `id`, `name`, `destination`, `status`, `localChanges`, `updateAvailable`, and optional `detail`.
- `doctor`: `agent`, `skillsDirectory`, `parentExists`, `lock`, and `workspaces[]`. Lock status is `none`, `present`, or `invalid`; workspace journal status is `valid`, `missing`, or `invalid`.

Status values are `not-installed`, `up-to-date`, `update-available`, `locally-modified`, `conflict`, and `unknown`. Consumers should reject unsupported future `schemaVersion` values instead of silently assuming version 1.

`status` and `doctor` include local installation, lock, and update-workspace paths. `doctor` may include a validated lock ID, PID, hostname, and start time so an operator can evaluate exact-ID lock recovery. Machine IDs, boot IDs, process-start ticks, raw invalid journals, fingerprints, and file contents are not exported.

## Safety and recovery

Managed installations contain `.orbit-skill.json` with ownership and a content fingerprint. Install, update, uninstall, recovery, and destructive cleanup share the same cooperative lock. Local changes block update and uninstall by default. `--force` applies only to explicitly selected, otherwise valid managed installations.

Updates stage a new copy and keep a journal plus a verified backup outside the skill directory. Use `doctor` to identify an interrupted transaction, then pass its exact workspace name to `recover`. Cleanup automatically removes only verified backups belonging to completed transactions; malformed, interrupted, journal-less, or unknown workspaces are preserved.

The lock cannot protect against unrelated processes that ignore it, and dry-run is only a snapshot. The CLI rechecks after acquiring the lock, but it does not promise power-loss durability or protection from arbitrary concurrent filesystem changes.

## Updating the CLI and installed skills

Updating the npm CLI and updating installed skills are separate operations:

```bash
# Replace the globally installed CLI package.
npm install --global @orbit-collective/skills@latest

# Use that CLI's packaged catalog to update selected installed skill content.
orbit-skills update document-feature --agent codex
```

Changing the CLI package alone does not rewrite installed skills, their metadata, or existing backups. Installation metadata records the package version that last installed or updated a skill, while update decisions use verified content fingerprints. A successful skill update writes new metadata and retains the previous managed installation in its transaction backup. Use `status`, `doctor`, `recover`, and `cleanup` rather than editing those files manually.

## Development

Run all checks with:

```bash
npm run typecheck
npm run build
npm test
npm run validate:catalog
npm run check:package
npm run test:package
```

CLI integration tests use a temporary `HOME`; they never target real agent directories. Some restricted sandboxes cannot start subprocesses and mark those cases skipped. Run the integration test outside such a sandbox to execute the built CLI:

```bash
node test/cli-integration.test.js
```

`npm install` (or `npm ci`) in a Git checkout points `core.hooksPath` at `.githooks/`. Its `pre-push` hook runs `npm run release:verify` — the same type-check, tests, catalog validation, and package-content check that CI runs — so a broken push is caught locally. Use `git push --no-verify` only when you knowingly need to bypass it.

Versions are managed by release-please; never edit the version in `package.json` by hand. See [RELEASING.md](RELEASING.md).

See [Add an official skill](documentation/en/skills/01-adding-an-official-skill.md) for catalog rules and [Use the CLI and interactive menu](documentation/en/skills/02-using-orbit-skills.md) for the terminal flows.

Release history is recorded in [CHANGELOG.md](CHANGELOG.md). Maintainers should follow [RELEASING.md](RELEASING.md) for the exact local artifact checks, first-publication prerequisites, trusted publishing setup, and post-publication verification.
