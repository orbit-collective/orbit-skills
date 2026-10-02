import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanupUpdateBackups } from "../dist/installation/cleanup.js";
import { getSkillFingerprint } from "../dist/installation/fingerprint.js";
import { writeInstallationMetadata } from "../dist/installation/metadata.js";
import { withInstallationLock } from "../dist/installation/lock.js";
import { inspectDoctor } from "../dist/operations/doctor.js";
import { inspectSkillsStatus } from "../dist/operations/status.js";

const SKILL_ID = "document-feature";

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), "orbit-skills-reporting-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const skillsDirectory = join(root, ".agents", "skills");
    const adapter = {
        id: "codex",
        name: "Test Codex",
        getSkillsDirectory: () => skillsDirectory,
    };
    return { root, skillsDirectory, adapter };
}

async function makeManaged(destination, contents) {
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "SKILL.md"), contents);
    const fingerprint = await getSkillFingerprint(destination);
    await writeInstallationMetadata(destination, SKILL_ID, fingerprint);
}

test("status reports not installed, update available, local changes, and conflicts", async (t) => {
    const { skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);

    assert.equal((await inspectSkillsStatus(adapter)).skills[0].status, "not-installed");

    await makeManaged(destination, "older packaged content");
    const outdated = (await inspectSkillsStatus(adapter)).skills[0];
    assert.equal(outdated.status, "update-available");
    assert.equal(outdated.updateAvailable, true);

    await writeFile(join(destination, "SKILL.md"), "local edit");
    const modified = (await inspectSkillsStatus(adapter)).skills[0];
    assert.equal(modified.status, "locally-modified");
    assert.equal(modified.localChanges, true);

    await rm(destination, { recursive: true });
    await mkdir(destination);
    await writeFile(join(destination, "user.txt"), "unmanaged");
    assert.equal((await inspectSkillsStatus(adapter)).skills[0].status, "conflict");
});

test("status reports unsafe symbolic-link content as unknown", async (t) => {
    const { root, skillsDirectory, adapter } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManaged(destination, "managed");
    const external = join(root, "external.txt");
    await writeFile(external, "external");
    await symlink(external, join(destination, "linked.txt"));

    const status = (await inspectSkillsStatus(adapter)).skills[0];
    assert.equal(status.status, "unknown");
    assert.match(status.detail, /symbolic link/i);
});

test("doctor returns structured empty diagnostics without creating directories", async (t) => {
    const { root, skillsDirectory, adapter } = await fixture(t);

    const report = await inspectDoctor(adapter);

    assert.equal(report.parentExists, false);
    assert.equal(report.lock.status, "none");
    assert.deepEqual(report.workspaces, []);
    assert.equal(report.skillsDirectory, skillsDirectory);
    await assert.rejects(access(join(root, ".agents")), /ENOENT/);
});

test("cleanup preview does not create a shared lock or installation directory", async (t) => {
    const { root, adapter } = await fixture(t);

    const result = await cleanupUpdateBackups(adapter, { dryRun: true, keep: 3 });

    assert.deepEqual(result.removable, []);
    await assert.rejects(access(join(root, ".agents")), /ENOENT/);
});

test("cleanup preview can inspect while another operation owns the lock", async (t) => {
    const { adapter } = await fixture(t);

    await withInstallationLock(adapter, async () => {
        const result = await cleanupUpdateBackups(adapter, {
            dryRun: true,
            keep: 3,
        });
        assert.deepEqual(result.removable, []);
    });
});
