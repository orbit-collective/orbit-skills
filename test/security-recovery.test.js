import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";

import { cleanupUpdateBackups } from "../dist/installation/cleanup.js";
import { getSkillFingerprint } from "../dist/installation/fingerprint.js";
import { installSkill } from "../dist/installation/install-skill.js";
import {
    clearAbandonedInstallationLock,
    readInstallationLock,
    withInstallationLock,
} from "../dist/installation/lock.js";
import { writeInstallationMetadata } from "../dist/installation/metadata.js";
import { recoverUpdate } from "../dist/installation/recover.js";
import {
    createUpdateTransaction,
    readUpdateTransaction,
    writeUpdateTransaction,
} from "../dist/installation/transaction.js";
import { updateSkill } from "../dist/installation/update-skill.js";

const SKILL_ID = "document-feature";

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), "orbit-skills-test-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const skillsDirectory = join(root, ".agents", "skills");
    const adapter = {
        id: "codex",
        name: "Test Codex",
        getSkillsDirectory: () => skillsDirectory,
    };
    return { root, skillsDirectory, adapter };
}

async function makeManagedSkill(path, contents) {
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "SKILL.md"), contents);
    const fingerprint = await getSkillFingerprint(path);
    await writeInstallationMetadata(path, SKILL_ID, fingerprint);
    return fingerprint;
}

test("repeat install does not replace a baseline that records local changes", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    await installSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter);
    const destination = join(skillsDirectory, SKILL_ID);
    const marker = join(destination, ".orbit-skill.json");
    const metadata = JSON.parse(await readFile(marker, "utf8"));
    metadata.fingerprint = "0".repeat(64);
    await writeFile(marker, JSON.stringify(metadata));

    await assert.rejects(
        installSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter),
        /local changes|baseline/i,
    );
    assert.equal(JSON.parse(await readFile(marker, "utf8")).fingerprint, "0".repeat(64));
});

test("recover cancels a prepared update before replacement and is idempotent", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    const original = await makeManagedSkill(destination, "old");
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const staged = join(workspace, "staged");
    const target = await makeManagedSkill(staged, "new");
    const transaction = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: target });
    await writeUpdateTransaction(workspace, transaction, "prepared");

    assert.equal((await recoverUpdate(adapter, basename(workspace))).outcome, "cancelled");
    assert.equal((await readUpdateTransaction(workspace)).phase, "cancelled");
    assert.equal((await recoverUpdate(adapter, basename(workspace))).outcome, "cancelled");
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "old");
});

test("recover finishes replacement after the old installation was moved", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const parent = dirname(skillsDirectory);
    const destination = join(skillsDirectory, SKILL_ID);
    await mkdir(parent, { recursive: true });
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const original = await makeManagedSkill(join(workspace, "backup"), "old");
    const target = await makeManagedSkill(join(workspace, "staged"), "new");
    const transaction = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: target });
    await writeUpdateTransaction(workspace, transaction, "committing");

    assert.equal((await recoverUpdate(adapter, basename(workspace))).outcome, "completed");
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "new");
    assert.equal((await readUpdateTransaction(workspace)).phase, "completed");
});

test("recover restores a verified backup only into a missing destination", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const original = await makeManagedSkill(join(workspace, "backup"), "old");
    const target = "1".repeat(64);
    const transaction = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: target });
    await writeUpdateTransaction(workspace, transaction, "committing");

    assert.equal((await recoverUpdate(adapter, basename(workspace))).outcome, "restored");
    assert.equal(await readFile(join(skillsDirectory, SKILL_ID, "SKILL.md"), "utf8"), "old");
    assert.equal((await readUpdateTransaction(workspace)).phase, "restored");
});

test("recover recognizes an installed target before completed was recorded", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const original = await makeManagedSkill(join(workspace, "backup"), "old");
    const target = await makeManagedSkill(join(skillsDirectory, SKILL_ID), "new");
    const transaction = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: target });
    await writeUpdateTransaction(workspace, transaction, "committing");

    assert.equal((await recoverUpdate(adapter, basename(workspace))).outcome, "completed");
    assert.equal((await readUpdateTransaction(workspace)).phase, "completed");
});

test("a completed transaction never restores its old backup after later deletion", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const original = await makeManagedSkill(join(workspace, "backup"), "old");
    const target = "2".repeat(64);
    const transaction = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: target });
    await writeUpdateTransaction(workspace, transaction, "completed");

    assert.equal((await recoverUpdate(adapter, basename(workspace))).outcome, "already-completed");
    await assert.rejects(readFile(join(skillsDirectory, SKILL_ID, "SKILL.md"), "utf8"), /ENOENT/);
    assert.equal(await readFile(join(workspace, "backup", "SKILL.md"), "utf8"), "old");
});

test("recover refuses malformed and journal-less workspaces without changing them", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const missingJournal = await mkdtemp(join(parent, ".orbit-skills-update-"));
    await makeManagedSkill(join(missingJournal, "backup"), "old");
    await assert.rejects(recoverUpdate(adapter, basename(missingJournal)), /journal/i);

    const malformed = await mkdtemp(join(parent, ".orbit-skills-update-"));
    await writeFile(join(malformed, "transaction.json"), "{}\n");
    await assert.rejects(recoverUpdate(adapter, basename(malformed)), /invalid/i);
    assert.deepEqual((await readdir(missingJournal)).sort(), ["backup"]);
});

test("recover refuses to overwrite an existing unknown destination", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "user.txt"), "keep");
    const parent = dirname(skillsDirectory);
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const original = await makeManagedSkill(join(workspace, "backup"), "old");
    const target = await makeManagedSkill(join(workspace, "staged"), "new");
    const transaction = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: target });
    await writeUpdateTransaction(workspace, transaction, "committing");

    await assert.rejects(recoverUpdate(adapter, basename(workspace)), /destination|refus/i);
    assert.equal(await readFile(join(destination, "user.txt"), "utf8"), "keep");
});

test("cleanup dry-run and retention only select verified completed backups", async (t) => {
    const { adapter } = await fixture(t);
    const makeCompleted = async (contents) => {
        const parent = dirname(adapter.getSkillsDirectory());
        await mkdir(parent, { recursive: true });
        const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
        const original = await makeManagedSkill(join(workspace, "backup"), contents);
        const tx = createUpdateTransaction({ agentId: adapter.id, skillId: SKILL_ID, originalFingerprint: original, targetFingerprint: "a".repeat(64) });
        await writeUpdateTransaction(workspace, tx, "completed");
        return workspace;
    };
    const older = await makeCompleted("old-1");
    await new Promise((resolve) => setTimeout(resolve, 2));
    const newer = await makeCompleted("old-2");
    const noJournal = await mkdtemp(join(dirname(adapter.getSkillsDirectory()), ".orbit-skills-update-"));
    await makeManagedSkill(join(noJournal, "backup"), "legacy");
    const unknown = await makeCompleted("unknown-file");
    await writeFile(join(unknown, "surprise.txt"), "keep");

    const preview = await cleanupUpdateBackups(adapter, { dryRun: true, keep: 1 });
    assert.deepEqual(preview.removable.map((item) => item.workspace), [older]);
    assert.equal(await readFile(join(older, "backup", "SKILL.md"), "utf8"), "old-1");

    const cleaned = await cleanupUpdateBackups(adapter, { dryRun: false, keep: 1 });
    assert.deepEqual(cleaned.removed, [older]);
    await assert.rejects(readdir(older), /ENOENT/);
    assert.equal(await readFile(join(newer, "backup", "SKILL.md"), "utf8"), "old-2");
    assert.equal(await readFile(join(noJournal, "backup", "SKILL.md"), "utf8"), "legacy");
    assert.equal(await readFile(join(unknown, "surprise.txt"), "utf8"), "keep");
});

test("an active lock cannot be cleared even with its exact lock id", async (t) => {
    const { adapter } = await fixture(t);
    await withInstallationLock(adapter, async () => {
        const owner = await readInstallationLock(adapter);
        assert.ok(owner);
        await assert.rejects(
            clearAbandonedInstallationLock(adapter, owner.lockId),
            /active|running/i,
        );
        assert.equal((await readInstallationLock(adapter)).lockId, owner.lockId);
    });
});

test("a lock directory without owner metadata is ambiguous and cannot be treated as absent", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    await mkdir(join(dirname(skillsDirectory), ".orbit-skills.lock"), { recursive: true });
    await assert.rejects(readInstallationLock(adapter), /metadata.*missing|invalid|legacy/i);
});

test("recover rejects a transaction journal that is a symbolic link", async (t) => {
    const { adapter, skillsDirectory, root } = await fixture(t);
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
    const original = await makeManagedSkill(join(skillsDirectory, SKILL_ID), "old");
    const externalJournal = join(root, "external-transaction.json");
    const transaction = createUpdateTransaction({
        agentId: adapter.id,
        skillId: SKILL_ID,
        originalFingerprint: original,
        targetFingerprint: "b".repeat(64),
    });
    await writeFile(externalJournal, JSON.stringify(transaction));
    await symlink(externalJournal, join(workspace, "transaction.json"));

    await assert.rejects(recoverUpdate(adapter, basename(workspace)), /symbolic link|regular file/i);
    assert.equal((await readFile(join(skillsDirectory, SKILL_ID, "SKILL.md"), "utf8")), "old");
});

test("an incomplete install conflict preserves unknown user files", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "user.txt"), "keep me");

    await assert.rejects(
        installSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter),
        /conflict/i,
    );
    assert.equal(await readFile(join(destination, "user.txt"), "utf8"), "keep me");
});

test("a lock with a mismatched process-start identity can be cleared only by exact id", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    let owner;
    await withInstallationLock(adapter, async () => {
        owner = await readInstallationLock(adapter);
    });
    const lockDirectory = join(dirname(skillsDirectory), ".orbit-skills.lock");
    await mkdir(lockDirectory);
    await writeFile(
        join(lockDirectory, "owner.json"),
        JSON.stringify({ ...owner, processStartTicks: "0" }),
    );

    await assert.rejects(clearAbandonedInstallationLock(adapter, "00000000-0000-0000-0000-000000000000"), /does not match/i);
    await clearAbandonedInstallationLock(adapter, owner.lockId);
    assert.equal(await readInstallationLock(adapter), null);
});

test("a lock from another host is never cleared automatically", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    let owner;
    await withInstallationLock(adapter, async () => {
        owner = await readInstallationLock(adapter);
    });
    const lockDirectory = join(dirname(skillsDirectory), ".orbit-skills.lock");
    await mkdir(lockDirectory);
    await writeFile(
        join(lockDirectory, "owner.json"),
        JSON.stringify({ ...owner, hostname: `${hostname()}-other`, processStartTicks: "0" }),
    );

    await assert.rejects(clearAbandonedInstallationLock(adapter, owner.lockId), /another host/i);
    assert.equal((await readInstallationLock(adapter)).lockId, owner.lockId);
});

test("recover rejects path traversal instead of resolving a JSON-selected path", async (t) => {
    const { adapter } = await fixture(t);
    await assert.rejects(recoverUpdate(adapter, "../outside"), /invalid transaction name/i);
});

test("update refuses local changes and leaves the installation untouched", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await makeManagedSkill(destination, "old baseline");
    await writeFile(join(destination, "SKILL.md"), "local edit");

    await assert.rejects(
        updateSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter),
        /local changes/i,
    );
    assert.equal(await readFile(join(destination, "SKILL.md"), "utf8"), "local edit");
});

test("install refuses a symbolic-link skills directory", async (t) => {
    const { adapter, skillsDirectory, root } = await fixture(t);
    const redirected = join(root, "redirected-skills");
    await mkdir(dirname(skillsDirectory), { recursive: true });
    await mkdir(redirected);
    await symlink(redirected, skillsDirectory);

    await assert.rejects(
        installSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter),
        /symbolic link|regular directory/i,
    );
    assert.deepEqual(await readdir(redirected), []);
});

test("a successful locked update leaves a verified backup and completed journal", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    const original = await makeManagedSkill(destination, "old version");

    const result = await withInstallationLock(adapter, () =>
        updateSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter),
    );

    assert.equal(result.status, "updated");
    assert.ok(result.backupPath);
    assert.equal(await readFile(join(result.backupPath, "SKILL.md"), "utf8"), "old version");
    assert.equal(await getSkillFingerprint(result.backupPath), original);
    const workspace = dirname(result.backupPath);
    assert.equal((await readUpdateTransaction(workspace)).phase, "completed");
    const destinationMetadata = JSON.parse(
        await readFile(join(destination, ".orbit-skill.json"), "utf8"),
    );
    assert.equal(await getSkillFingerprint(destination), destinationMetadata.fingerprint);
    assert.equal(await readInstallationLock(adapter), null);
});

test("an Orbit-owned but incomplete installation reports missing baseline and preserves files", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const destination = join(skillsDirectory, SKILL_ID);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "user.txt"), "keep");
    await writeFile(
        join(destination, ".orbit-skill.json"),
        JSON.stringify({
            schemaVersion: 1,
            managedBy: "@orbit-collective/skills",
            skillId: SKILL_ID,
            packageVersion: "0.1.0",
        }),
    );

    await assert.rejects(
        installSkill({ id: SKILL_ID, name: "x", description: "x" }, adapter),
        /baseline unavailable/i,
    );
    assert.equal(await readFile(join(destination, "user.txt"), "utf8"), "keep");
});

test("cleanup preserves backups tied at the retention boundary", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    const parent = dirname(skillsDirectory);
    await mkdir(parent, { recursive: true });
    const timestamp = "2026-01-01T00:00:00.000Z";
    const workspaces = [];
    for (const contents of ["first", "second"]) {
        const workspace = await mkdtemp(join(parent, ".orbit-skills-update-"));
        const original = await makeManagedSkill(join(workspace, "backup"), contents);
        const transaction = createUpdateTransaction({
            agentId: adapter.id,
            skillId: SKILL_ID,
            originalFingerprint: original,
            targetFingerprint: "c".repeat(64),
        });
        await writeFile(
            join(workspace, "transaction.json"),
            JSON.stringify({
                ...transaction,
                createdAt: timestamp,
                updatedAt: timestamp,
                phase: "completed",
            }),
        );
        workspaces.push(workspace);
    }

    const result = await cleanupUpdateBackups(adapter, { dryRun: true, keep: 1 });
    assert.deepEqual(result.removable, []);
    for (const workspace of workspaces) {
        assert.equal((await readdir(workspace)).includes("backup"), true);
    }
});

test("a lock from a previous boot of the same machine can be cleared by exact id", async (t) => {
    const { adapter, skillsDirectory } = await fixture(t);
    let owner;
    await withInstallationLock(adapter, async () => {
        owner = await readInstallationLock(adapter);
    });
    assert.ok(owner.machineId);
    const lockDirectory = join(dirname(skillsDirectory), ".orbit-skills.lock");
    await mkdir(lockDirectory);
    await writeFile(
        join(lockDirectory, "owner.json"),
        JSON.stringify({
            ...owner,
            bootId: "00000000-0000-0000-0000-000000000000",
        }),
    );

    await clearAbandonedInstallationLock(adapter, owner.lockId);
    assert.equal(await readInstallationLock(adapter), null);
});
