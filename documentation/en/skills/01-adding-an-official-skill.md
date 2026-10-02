# Add an official skill

Use this process only for skills maintained and shipped by `@orbit-collective/skills`. External sources and project-scoped installation are intentionally outside the catalog.

## 1. Choose a portable ID

Choose a lowercase kebab-case ID, for example `release-notes`. The ID becomes the directory name and the installed command name. Do not use `synced` or `anthropic-skills`; Claude Code reserves those namespaces.

## 2. Add the source directory

Create `skills/<id>/SKILL.md`. Its YAML frontmatter must contain a non-empty `name` equal to the ID and a `description` equal to the catalog description. Add the instructions after the closing frontmatter delimiter.

Supporting regular files may live anywhere below the skill directory. Keep references relative to the skill directory. Do not add symbolic links, `.orbit-skill.json`, or `.orbit-skill-*.tmp`; those names belong to installation bookkeeping and catalog validation rejects them.

## 3. Register the definition

Add exactly one entry to `declaredSkills` in `src/skills/catalog.ts` with:

- the ID and display name;
- the same description as `SKILL.md`;
- a practical usage statement;
- the supported agents (`codex`, `claude-code`, or both).

Resources are discovered from the source directory after validation, so they are shown consistently by `orbit-skills info <id>` and future structured consumers.

## 4. Verify both agent formats

Codex and Claude Code both require a `SKILL.md` file with YAML frontmatter and allow supporting files in the skill directory. This package installs only to the personal scope: `~/.agents/skills/<id>` for Codex and `~/.claude/skills/<id>` for Claude Code.

See the official [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) and [Claude Code skill documentation](https://code.claude.com/docs/en/skills) before changing compatibility rules.

Run:

```bash
npm run typecheck
npm run build
npm test
node dist/cli.js info <id>
```

Tests must use temporary directories and injected test adapters. They must never write to a real agent directory.
