import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createClaudeCodeAdapter } from "../dist/adapters/claude-code.js";
import { getSkillFingerprint } from "../dist/installation/fingerprint.js";
import { writeInstallationMetadata } from "../dist/installation/metadata.js";
import { withInstallationLock } from "../dist/installation/lock.js";
import {
    getSkillInfo,
    resolveSkillSelection,
} from "../dist/skills/catalog.js";
import {
    getSkillCommandExitCode,
    manageSkills,
    summarizeSkillResults,
} from "../dist/operations/manage-skills.js";

const SKILL_ID = "document-feature";

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), "orbit-skills-management-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const skillsDirectory = join(root, ".agents", "skills");
    const adapter = {
        id: "codex",
        name: "Test Codex",
        getSkillsDirectory: () => skillsDirectory,
    };
    return { root, skillsDirectory, adapter };
}

async function makeManagedSkill(destination, contents = "managed") {
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "SKILL.md"), contents);
    const fingerprint = await getSkillFingerprint(destination);
    await writeInstallationMetadata(destination, SKILL_ID, fingerprint);
}

test("the catalog exposes reusable info from validated skill definitions", async () => {
    const info = await getSkillInfo(SKILL_ID);

    assert.equal(info.id, SKILL_ID);
    assert.equal(info.name, "Document Feature");
    assert.ok(info.description.length > 20);
    assert.ok(info.usage.length > 20);
    assert.deepEqual(info.supportedAgents, ["codex", "claude-code"]);
    assert.deepEqual(info.resources, []);
    assert.match(info.packageVersion, /^\d+\.\d+\.\d+/);
});

test("selection validates unknown ids and duplicates before creating anything", async (t) => {
    const { root, adapter } = await fixture(t);

    await assert.rejects(
        resolveSkillSelection([SKILL_ID, SKILL_ID], adapter.id, "install"),
        /duplicate/i,
    );
    await assert.rejects(
        resolveSkillSelection(["../unknown"], adapter.id, "install"),
        /invalid|unknown/i,
    );
    await assert.rejects(
        resolveSkillSelection(["unknown-skill"], adapter.id, "install"),
        /unknown/i,
    );
    await assert.rejects(
        resolveSkillSelection([], adapter.id, "uninstall"),
        /at least one|requires/i,
    );
    await assert.rejects(
        manageSkills("install", [SKILL_ID, SKILL_ID], adapter, {}),
        /duplicate/i,
    );
    await assert.rejects(
        manageSkills("install", ["unknown-skill"], adapter, {}),
        /unknown/i,
    );

    await assert.rejects(access(join(root, ".agents")), /ENOENT/);
});

test("install and update without a selection resolve to every available skill", async () => {
    const install = await resolveSkillSelection([], "codex", "install");
    const update = await resolveSkillSelection([], "codex", "update");

    assert.deepEqual(install.map((skill) => skill.id), [SKILL_ID]);
    assert.deepEqual(update.map((skill) => skill.id), [SKILL_ID]);
});

test("install dry-run plans the target without directories, locks, or metadata", async (t) => {
    const { root, skillsDirectory, adapter } = await fixture(t);

    const result = await manageSkills("install", [SKILL_ID], adapter, {
        dryRun: true,
    });

    assert.equal(result.items[0].status, "planned");
    assert.equal(result.items[0].action, "install");
    assert.equal(result.items[0].destination, join(skillsDirectory, SKILL_ID));
    await assert.rejects(access(join(root, ".agents")), /ENOENT/);
});

test("selected install returns a structured installed result", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);

    const result = await manageSkills("install", [SKILL_ID], adapter, {});

    assert.equal(result.items[0].status, "installed");
    assert.equal(result.summary.installed, 1);
    assert.match(await readFile(join(skillsDirectory, SKILL_ID, "SKILL.md"), "utf8"), /Document a feature/);
});

test("update dry-run reports a missing installation without writing", async (t) => {
    const { root, adapter } = await fixture(t);

    const result = await manageSkills("update", [SKILL_ID], adapter, {
        dryRun: true,
    });

    assert.equal(result.items[0].status, "conflict");
    assert.match(result.items[0].message, /not installed/i);
    assert.equal(result.hasFailures, true);
    await assert.rejects(access(join(root, ".agents")), /ENOENT/);
});

test("selected update returns its verified backup in the structured result", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination, "old packaged version");

    const result = await manageSkills("update", [SKILL_ID], adapter, {});

    assert.equal(result.items[0].status, "updated");
    assert.ok(result.items[0].backupPath);
    assert.equal(await readFile(join(result.items[0].backupPath, "SKILL.md"), "utf8"), "old packaged version");
    assert.match(await readFile(join(destination, "SKILL.md"), "utf8"), /Document a feature/);
});

test("uninstall removes only an unchanged managed installation and is repeatable", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination);

    const first = await manageSkills("uninstall", [SKILL_ID], adapter, {});
    assert.equal(first.items[0].status, "removed");
    await assert.rejects(access(destination), /ENOENT/);

    const second = await manageSkills("uninstall", [SKILL_ID], adapter, {});
    assert.equal(second.items[0].status, "skipped");
    assert.match(second.items[0].message, /not installed/i);
});

test("uninstall dry-run does not remove an unchanged managed installation", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination, "keep");

    const result = await manageSkills("uninstall", [SKILL_ID], adapter, {
        dryRun: true,
    });

    assert.equal(result.items[0].status, "planned");
    assert.equal(result.items[0].action, "remove");
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "keep");
});

test("uninstall refuses local changes unless force is explicit", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination, "baseline");
    await writeFile(join(destination, "SKILL.md"), "local edit");

    const refused = await manageSkills("uninstall", [SKILL_ID], adapter, {});
    assert.equal(refused.items[0].status, "conflict");
    assert.match(refused.items[0].message, /local changes/i);
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "local edit");

    const forced = await manageSkills("uninstall", [SKILL_ID], adapter, {
        force: true,
    });
    assert.equal(forced.items[0].status, "removed");
    await assert.rejects(access(destination), /ENOENT/);
});

test("uninstall force never removes an unmanaged directory", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "user.txt"), "keep");

    const result = await manageSkills("uninstall", [SKILL_ID], adapter, {
        force: true,
    });

    assert.equal(result.items[0].status, "conflict");
    assert.equal(await readFile(join(destination, "user.txt"), "utf8"), "keep");
});

test("uninstall refuses managed content containing a symbolic link even with force", async (t) => {
    const { root, skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination, "baseline");
    const external = join(root, "external.txt");
    await writeFile(external, "keep");
    await symlink(external, join(destination, "linked.txt"));

    const result = await manageSkills("uninstall", [SKILL_ID], adapter, {
        force: true,
    });

    assert.equal(result.items[0].status, "conflict");
    assert.match(result.items[0].message, /symbolic link|unsafe/i);
    assert.equal(await readFile(external, "utf8"), "keep");
});

test("uninstall preserves an installation with malformed metadata", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination, "keep");
    await writeFile(join(destination, ".orbit-skill.json"), "{}\n");

    const result = await manageSkills("uninstall", [SKILL_ID], adapter, {
        force: true,
    });

    assert.equal(result.items[0].status, "conflict");
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "keep");
});

test("dry-run does not acquire or disturb the shared installation lock", async (t) => {
    const { adapter } = await fixture(t);

    await withInstallationLock(adapter, async () => {
        const result = await manageSkills("install", [SKILL_ID], adapter, {
            dryRun: true,
        });
        assert.equal(result.items[0].status, "planned");
        await assert.rejects(
            manageSkills("install", [SKILL_ID], adapter, {}),
            /another installation operation|lock/i,
        );
    });
});

test("dry-run and execution both reject a symbolic-link skills root", async (t) => {
    const { root, skillsDirectory, adapter } = await fixture(t);
    const redirected = join(root, "redirected");
    await mkdir(join(root, ".agents"), { recursive: true });
    await mkdir(redirected);
    await symlink(redirected, skillsDirectory);

    await assert.rejects(
        manageSkills("install", [SKILL_ID], adapter, { dryRun: true }),
        /regular directory/i,
    );
    await assert.rejects(
        manageSkills("install", [SKILL_ID], adapter, {}),
        /regular directory/i,
    );
    await assert.rejects(access(join(redirected, SKILL_ID)), /ENOENT/);
});

test("summaries distinguish partial failures and produce a nonzero exit code", () => {
    const summary = summarizeSkillResults([
        { status: "installed" },
        { status: "skipped" },
        { status: "conflict" },
    ]);

    assert.deepEqual(summary, {
        installed: 1,
        skipped: 1,
        conflict: 1,
    });
    assert.equal(getSkillCommandExitCode(summary), 1);
    assert.equal(getSkillCommandExitCode({ installed: 2 }), 0);
});

test("the Claude Code adapter uses the official personal skills directory", () => {
    const adapter = createClaudeCodeAdapter("/tmp/example-home");

    assert.equal(adapter.id, "claude-code");
    assert.equal(adapter.getSkillsDirectory(), "/tmp/example-home/.claude/skills");
});
